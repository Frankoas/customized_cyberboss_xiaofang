const fs = require("fs");
const path = require("path");
const os = require("os");

const CATEGORIES = ["dev", "life", "idea", "todo", "learning"];
const STATUSES = ["inbox", "categorized", "archived", "merged"];
const DEFAULT_REVIEW_INTERVAL_DAYS = 3;

class FlashMemoryService {
  constructor({ config }) {
    this.config = config;
    this.baseDir = resolveFlashMemoryDir(config);
  }

  // ---- core CRUD ----

  /**
   * Capture a flash memory item into inbox.
   */
  capture({ text, category = "idea", tags = [], sourceType = "wechat", priority = "low" } = {}) {
    const rawText = String(text || "").trim();
    if (!rawText) {
      throw new Error("Flash memory text cannot be empty.");
    }

    const now = new Date();
    const dateLabel = formatDate(now);
    const id = generateFlashId(dateLabel, this.baseDir);
    const cleanedText = rawText;
    const safeCategory = CATEGORIES.includes(category) ? category : "idea";
    const safeTags = normalizeTags(tags);

    const item = {
      id,
      sourceType,
      rawText,
      cleanedText,
      category: safeCategory,
      tags: safeTags,
      status: "inbox",
      priority: ["high", "medium", "low"].includes(priority) ? priority : "low",
      relatedFlashIds: [],
      mergedToIdeaId: null,
      createdAt: now.toISOString(),
      reviewedAt: null,
      archivedAt: null,
    };

    ensureDir(this.inboxDir());
    const filePath = path.join(this.inboxDir(), `${id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(item, null, 2), "utf8");

    this._bumpIndex({ inboxDelta: 1 });
    return item;
  }

  /**
   * List flash items with optional filters.
   */
  list({ status = "all", category = "", limit = 20, offset = 0 } = {}) {
    const limitNum = Math.max(1, Math.min(100, Number(limit) || 20));
    const offsetNum = Math.max(0, Number(offset) || 0);

    let items = [];
    if (status === "inbox") {
      items = this._readAllInDir(this.inboxDir());
    } else if (status === "categorized") {
      items = this._readAllCategorized();
    } else if (status === "archived") {
      items = this._readAllInDir(this.archivedDir());
    } else if (status === "merged") {
      items = this._readAllInDir(this.mergedDir());
    } else {
      // all
      items = [
        ...this._readAllInDir(this.inboxDir()),
        ...this._readAllCategorized(),
        ...this._readAllInDir(this.archivedDir()),
        ...this._readAllInDir(this.mergedDir()),
      ];
    }

    if (category && CATEGORIES.includes(category)) {
      items = items.filter((item) => item.category === category);
    }

    items.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    const total = items.length;
    const paged = items.slice(offsetNum, offsetNum + limitNum);

    return { items: paged, total };
  }

  /**
   * Update a single flash item.
   */
  update({ id, updates = {} } = {}) {
    const item = this._findItem(id);
    if (!item) {
      throw new Error(`Flash item not found: ${id}`);
    }

    const allowedFields = ["category", "tags", "status", "priority", "cleanedText", "relatedFlashIds", "mergedToIdeaId"];
    const oldStatus = item.status;
    let newStatus = oldStatus;

    for (const [key, value] of Object.entries(updates)) {
      if (!allowedFields.includes(key)) continue;

      if (key === "category") {
        if (CATEGORIES.includes(value)) item.category = value;
      } else if (key === "tags") {
        item.tags = normalizeTags(value);
      } else if (key === "status") {
        if (STATUSES.includes(value)) {
          newStatus = value;
          item.status = value;
        }
      } else if (key === "priority") {
        if (["high", "medium", "low"].includes(value)) item.priority = value;
      } else if (key === "relatedFlashIds") {
        item.relatedFlashIds = Array.isArray(value) ? [...new Set(value.filter(Boolean))] : [];
      } else if (key === "mergedToIdeaId") {
        item.mergedToIdeaId = value || null;
      } else if (key === "cleanedText") {
        item.cleanedText = String(value || "").trim() || item.cleanedText;
      }
    }

    if (newStatus === "reviewed" || (!item.reviewedAt && newStatus !== "inbox")) {
      item.reviewedAt = new Date().toISOString();
    }
    if (newStatus === "archived") {
      item.archivedAt = new Date().toISOString();
    }

    if (newStatus !== oldStatus) {
      this._moveItemFile(id, oldStatus, newStatus, item);
    } else {
      const filePath = this._itemFilePath(id, oldStatus);
      if (filePath) {
        fs.writeFileSync(filePath, JSON.stringify(item, null, 2), "utf8");
      }
    }

    this._rebuildIndex();
    return { ok: true, id, status: newStatus };
  }

  /**
   * Batch operations: categorize, merge, archive.
   */
  batchUpdate({ operations = [] } = {}) {
    const results = [];
    for (const op of operations) {
      try {
        if (op.action === "categorize" && Array.isArray(op.ids)) {
          for (const id of op.ids) {
            const r = this.update({ id, updates: { category: op.category || "idea", status: "categorized" } });
            results.push(r);
          }
        } else if (op.action === "merge" && Array.isArray(op.sourceIds) && op.into) {
          const target = this._findItem(op.into);
          if (!target) throw new Error(`Merge target not found: ${op.into}`);
          for (const sourceId of op.sourceIds) {
            this.update({ id: sourceId, updates: { status: "merged", mergedToIdeaId: op.into } });
            if (!target.relatedFlashIds.includes(sourceId)) {
              target.relatedFlashIds.push(sourceId);
            }
          }
          this.update({ id: op.into, updates: { relatedFlashIds: target.relatedFlashIds } });
          results.push({ ok: true, merged: op.sourceIds.length, into: op.into });
        } else if (op.action === "archive" && Array.isArray(op.ids)) {
          for (const id of op.ids) {
            const r = this.update({ id, updates: { status: "archived" } });
            results.push(r);
          }
        }
      } catch (error) {
        results.push({ ok: false, error: error.message });
      }
    }
    return { results };
  }

  /**
   * Get review suggestions — items that need attention.
   */
  reviewSuggestions({ since = "" } = {}) {
    const index = this._readIndex();
    const inboxCount = index.counts?.inbox || 0;

    const inboxItems = this._readAllInDir(this.inboxDir());
    const daysSinceLastReview = index.lastReviewAt
      ? Math.floor((Date.now() - new Date(index.lastReviewAt).getTime()) / 86400000)
      : 999;

    const suggestedItems = inboxItems
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
      .slice(0, 10);

    return {
      inboxCount,
      suggestedItems,
      lastReviewAt: index.lastReviewAt,
      daysSinceLastReview,
      needsReview: inboxCount > 5 || daysSinceLastReview >= DEFAULT_REVIEW_INTERVAL_DAYS,
    };
  }

  /**
   * Mark review as done (touch lastReviewAt).
   */
  markReviewed() {
    const index = this._readIndex();
    index.lastReviewAt = new Date().toISOString();
    this._writeIndex(index);
    return { lastReviewAt: index.lastReviewAt };
  }

  /**
   * Get stats for daily summary.
   */
  getStats() {
    const index = this._readIndex();
    const inbox = this._readAllInDir(this.inboxDir());
    const today = formatDate(new Date());
    const todayItems = [
      ...inbox,
      ...this._readAllCategorized(),
    ].filter((item) => (item.createdAt || "").startsWith(today));

    return {
      total: index.counts?.total || 0,
      inbox: index.counts?.inbox || 0,
      categorized: index.counts?.categorized || 0,
      archived: index.counts?.archived || 0,
      todayCaptured: todayItems.length,
      needsReview: (index.counts?.inbox || 0) > 5,
    };
  }

  // ---- private helpers ----

  inboxDir() { return path.join(this.baseDir, "inbox"); }
  categorizedDir() { return path.join(this.baseDir, "categorized"); }
  archivedDir() { return path.join(this.baseDir, "archived"); }
  mergedDir() { return path.join(this.baseDir, "merged"); }
  indexFile() { return path.join(this.baseDir, "index.json"); }

  _readAllInDir(dir) {
    ensureDir(dir);
    const items = [];
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
        try {
          const data = JSON.parse(fs.readFileSync(path.join(dir, entry.name), "utf8"));
          if (data && data.id) items.push(data);
        } catch { /* skip corrupt files */ }
      }
    } catch { /* dir may be empty */ }
    return items;
  }

  _readAllCategorized() {
    const items = [];
    const catDir = this.categorizedDir();
    ensureDir(catDir);
    for (const cat of CATEGORIES) {
      const catPath = path.join(catDir, cat);
      if (fs.existsSync(catPath)) {
        items.push(...this._readAllInDir(catPath));
      }
    }
    return items;
  }

  _findItem(id) {
    for (const status of STATUSES) {
      const filePath = this._itemFilePath(id, status);
      if (filePath && fs.existsSync(filePath)) {
        try {
          return JSON.parse(fs.readFileSync(filePath, "utf8"));
        } catch { return null; }
      }
    }
    return null;
  }

  _itemFilePath(id, status) {
    if (status === "inbox") return path.join(this.inboxDir(), `${id}.json`);
    if (status === "archived") return path.join(this.archivedDir(), `${id}.json`);
    if (status === "merged") return path.join(this.mergedDir(), `${id}.json`);
    if (status === "categorized") {
      // Need to search in all category subdirs
      const catDir = this.categorizedDir();
      for (const cat of CATEGORIES) {
        const p = path.join(catDir, cat, `${id}.json`);
        if (fs.existsSync(p)) return p;
      }
      return null;
    }
    return null;
  }

  _moveItemFile(id, oldStatus, newStatus, item) {
    const oldPath = this._itemFilePath(id, oldStatus);
    if (!oldPath || !fs.existsSync(oldPath)) {
      // Source doesn't exist, just write to new location
      const newPath = this._resolveNewPath(id, newStatus, item);
      ensureDir(path.dirname(newPath));
      fs.writeFileSync(newPath, JSON.stringify(item, null, 2), "utf8");
      return;
    }

    const newPath = this._resolveNewPath(id, newStatus, item);
    ensureDir(path.dirname(newPath));
    fs.renameSync(oldPath, newPath);
    // Rewrite with updated item (status field changed)
    fs.writeFileSync(newPath, JSON.stringify(item, null, 2), "utf8");
  }

  _resolveNewPath(id, status, item) {
    if (status === "inbox") return path.join(this.inboxDir(), `${id}.json`);
    if (status === "archived") return path.join(this.archivedDir(), `${id}.json`);
    if (status === "merged") return path.join(this.mergedDir(), `${id}.json`);
    if (status === "categorized") {
      const cat = CATEGORIES.includes(item?.category) ? item.category : "idea";
      return path.join(this.categorizedDir(), cat, `${id}.json`);
    }
    return path.join(this.inboxDir(), `${id}.json`);
  }

  _readIndex() {
    const file = this.indexFile();
    if (!fs.existsSync(file)) {
      return {
        version: 1,
        counts: { inbox: 0, categorized: 0, archived: 0, merged: 0, total: 0 },
        categories: CATEGORIES,
        lastReviewAt: null,
        reviewIntervalDays: DEFAULT_REVIEW_INTERVAL_DAYS,
      };
    }
    try {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      return {
        version: 1,
        counts: { inbox: 0, categorized: 0, archived: 0, merged: 0, total: 0 },
        categories: CATEGORIES,
        lastReviewAt: null,
        reviewIntervalDays: DEFAULT_REVIEW_INTERVAL_DAYS,
      };
    }
  }

  _writeIndex(index) {
    ensureDir(this.baseDir);
    fs.writeFileSync(this.indexFile(), JSON.stringify(index, null, 2), "utf8");
  }

  _bumpIndex({ inboxDelta = 0, categorizedDelta = 0, archivedDelta = 0, mergedDelta = 0 } = {}) {
    const index = this._readIndex();
    index.counts.inbox = Math.max(0, (index.counts.inbox || 0) + inboxDelta);
    index.counts.categorized = Math.max(0, (index.counts.categorized || 0) + categorizedDelta);
    index.counts.archived = Math.max(0, (index.counts.archived || 0) + archivedDelta);
    index.counts.merged = Math.max(0, (index.counts.merged || 0) + mergedDelta);
    index.counts.total = index.counts.inbox + index.counts.categorized + index.counts.archived + index.counts.merged;
    this._writeIndex(index);
  }

  _rebuildIndex() {
    const inbox = this._readAllInDir(this.inboxDir()).length;
    const categorized = this._readAllCategorized().length;
    const archived = this._readAllInDir(this.archivedDir()).length;
    const merged = this._readAllInDir(this.mergedDir()).length;
    const index = this._readIndex();
    index.counts = { inbox, categorized, archived, merged, total: inbox + categorized + archived + merged };
    this._writeIndex(index);
  }
}

// ---- helpers ----

function resolveFlashMemoryDir(config) {
  // Primary: explicit env var for Obsidian vault path
  const envDir = process.env.CYBERBOSS_FLASH_MEMORY_DIR;
  if (envDir && envDir.trim()) {
    return path.resolve(envDir.trim());
  }
  // Fallback: inside stateDir
  const stateDir = config?.stateDir || path.join(os.homedir(), ".cyberboss");
  return path.join(stateDir, "flash-memory");
}

let flashIdCounter = 0;

function generateFlashId(dateLabel, baseDir) {
  const inboxDir = path.join(baseDir, "inbox");
  ensureDir(inboxDir);
  // Count existing files for today
  const existing = fs.existsSync(inboxDir)
    ? fs.readdirSync(inboxDir).filter((name) => name.startsWith(`fm_${dateLabel}`)).length
    : 0;
  const seq = String(existing + 1).padStart(3, "0");
  return `fm_${dateLabel}_${seq}`;
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  return [...new Set(
    tags
      .filter(Boolean)
      .map((t) => String(t).trim())
      .filter(Boolean)
      .slice(0, 5)
  )];
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function formatDate(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

module.exports = { FlashMemoryService };
