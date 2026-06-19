const fs = require("fs");
const path = require("path");
const os = require("os");

const CATEGORIES = ["dev", "life", "idea", "todo", "learning"];
const STATUSES = ["inbox", "categorized", "archived", "merged"];
const MOODS = ["excited", "anxious", "curious", "determined", "tired", "playful"];
const DEFAULT_REVIEW_INTERVAL_DAYS = 3;

class FlashMemoryService {
  constructor({ config }) {
    this.config = config;
    this.baseDir = resolveFlashMemoryDir(config);
  }

  // ---- core CRUD ----

  capture({ text, category = "idea", tags = [], sourceType = "wechat", priority = "low", mood = "" } = {}) {
    const rawText = String(text || "").trim();
    if (!rawText) {
      throw new Error("Flash memory text cannot be empty.");
    }

    const now = new Date();
    const dateLabel = formatDate(now);
    const id = generateFlashId(dateLabel, this.baseDir);
    const safeCategory = CATEGORIES.includes(category) ? category : "idea";
    const safeTags = normalizeTags(tags);
    const safeMood = MOODS.includes(mood) ? mood : "";

    const item = {
      id,
      sourceType,
      rawText,
      cleanedText: rawText,
      category: safeCategory,
      tags: safeTags,
      status: "inbox",
      priority: ["high", "medium", "low"].includes(priority) ? priority : "low",
      mood: safeMood,
      relatedFlashIds: [],
      mergedToIdeaId: null,
      createdAt: now.toISOString(),
      reviewedAt: null,
      archivedAt: null,
    };

    ensureDir(this.inboxDir());
    const filePath = path.join(this.inboxDir(), `${id}.md`);
    fs.writeFileSync(filePath, serializeFlashMd(item, this), "utf8");

    this._bumpIndex({ inboxDelta: 1 });
    return item;
  }

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

  update({ id, updates = {} } = {}) {
    const located = this._locateItem(id);
    if (!located) {
      throw new Error(`Flash item not found: ${id}`);
    }

    const item = located.item;
    const oldStatus = item.status;
    let newStatus = oldStatus;

    const allowedFields = ["category", "tags", "status", "priority", "mood", "cleanedText", "relatedFlashIds", "mergedToIdeaId"];
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
      } else if (key === "mood") {
        item.mood = MOODS.includes(value) ? value : (value === "" ? "" : item.mood);
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
      fs.writeFileSync(located.filePath, serializeFlashMd(item, this), "utf8");
      // Also update related items' wikilinks
      this._refreshRelatedLinks(item);
    }

    this._rebuildIndex();
    return { ok: true, id, status: newStatus };
  }

  /**
   * When a flash item's relatedFlashIds change, re-serialize the source item
   * so its [[wikilinks]] stay in sync.
   */
  _refreshRelatedLinks(item) {
    if (!Array.isArray(item.relatedFlashIds) || !item.relatedFlashIds.length) return;
    // The item itself was just written with updated wikilinks.
    // No need to re-write others unless we want bidirectional sync.
    // For now, wikilinks are directional (A links to B in A's .md).
  }

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

  markReviewed() {
    const index = this._readIndex();
    index.lastReviewAt = new Date().toISOString();
    this._writeIndex(index);
    return { lastReviewAt: index.lastReviewAt };
  }

  /**
   * Write a flash consolidation roundup note for Obsidian graph view.
   */
  writeRoundup({ date = "", theme = "", dedupGroups = [], links = [], moodCounts = {}, categorizedItems = [] } = {}) {
    const dateLabel = date || formatDate(new Date());
    const roundupDir = path.join(this.baseDir, "分类归档");
    ensureDir(roundupDir);
    const filePath = path.join(roundupDir, `闪存整理_${dateLabel}.md`);

    // Build wikilink sections
    const linkLines = [];
    if (Array.isArray(links)) {
      for (const l of links) {
        if (l.from && l.to) {
          linkLines.push(`- [[${l.from}]] → [[${l.to}]]${l.relation ? " — " + l.relation : ""}`);
        }
      }
    }

    // Build categorized lists
    const byCategory = {};
    for (const item of (Array.isArray(categorizedItems) ? categorizedItems : [])) {
      const cat = item.category || "idea";
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(item);
    }

    let catSection = "";
    const catEmoji = { dev: "💻", life: "🌿", idea: "💡", todo: "📋", learning: "📚" };
    for (const [cat, items] of Object.entries(byCategory)) {
      const emoji = catEmoji[cat] || "📌";
      catSection += `### ${emoji} ${cat}\n`;
      for (const item of items) {
        const moodSuffix = item.mood ? ` \`${item.mood}\`` : "";
        catSection += `- [[${item.id}]]${moodSuffix}\n`;
      }
      catSection += "\n";
    }

    // Mood distribution
    let moodSection = "";
    if (moodCounts && Object.keys(moodCounts).length) {
      moodSection = "## 情绪分布\n\n";
      for (const [m, count] of Object.entries(moodCounts)) {
        moodSection += `- ${m}: ${count}条\n`;
      }
      moodSection += "\n";
    }

    const md = [
      "---",
      `type: flash-roundup`,
      `date: ${dateLabel}`,
      `theme: "${theme || '闪存整理'}"`,
      "---",
      "",
      `# 闪存整理 · ${dateLabel}`,
      "",
      "## 本期主题",
      theme || "（无特定主题）",
      "",
      moodSection,
      "## 关联图谱",
      linkLines.length ? linkLines.join("\n") : "（暂无关联）",
      "",
      "## 分类清单",
      catSection || "（暂无分类）",
      "",
    ].join("\n") + "\n";

    fs.writeFileSync(filePath, md, "utf8");
    return { filePath, date: dateLabel };
  }

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
  roundupDir() { return path.join(this.baseDir, "分类归档"); }
  indexFile() { return path.join(this.baseDir, "index.json"); }

  _readAllInDir(dir) {
    ensureDir(dir);
    const items = [];
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isFile()) continue;
        if (!entry.name.endsWith(".md")) continue;
        try {
          const raw = fs.readFileSync(path.join(dir, entry.name), "utf8");
          const data = parseFlashMd(raw);
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
    const located = this._locateItem(id);
    return located ? located.item : null;
  }

  _locateItem(id) {
    for (const status of STATUSES) {
      const filePath = this._itemFilePath(id, status);
      if (filePath && fs.existsSync(filePath)) {
        try {
          const raw = fs.readFileSync(filePath, "utf8");
          const item = parseFlashMd(raw);
          if (item && item.id === id) {
            return { item, filePath, status };
          }
        } catch { /* skip */ }
      }
    }
    return null;
  }

  _itemFilePath(id, status) {
    if (status === "inbox") return path.join(this.inboxDir(), `${id}.md`);
    if (status === "archived") return path.join(this.archivedDir(), `${id}.md`);
    if (status === "merged") return path.join(this.mergedDir(), `${id}.md`);
    if (status === "categorized") {
      const catDir = this.categorizedDir();
      for (const cat of CATEGORIES) {
        const p = path.join(catDir, cat, `${id}.md`);
        if (fs.existsSync(p)) return p;
      }
      return null;
    }
    return null;
  }

  _moveItemFile(id, oldStatus, newStatus, item) {
    const located = this._locateItem(id);
    const oldPath = located ? located.filePath : null;

    if (!oldPath || !fs.existsSync(oldPath)) {
      const newPath = this._resolveNewPath(id, newStatus, item);
      ensureDir(path.dirname(newPath));
      fs.writeFileSync(newPath, serializeFlashMd(item, this), "utf8");
      return;
    }

    const newPath = this._resolveNewPath(id, newStatus, item);
    ensureDir(path.dirname(newPath));
    fs.renameSync(oldPath, newPath);
    fs.writeFileSync(newPath, serializeFlashMd(item, this), "utf8");
  }

  _resolveNewPath(id, status, item) {
    if (status === "inbox") return path.join(this.inboxDir(), `${id}.md`);
    if (status === "archived") return path.join(this.archivedDir(), `${id}.md`);
    if (status === "merged") return path.join(this.mergedDir(), `${id}.md`);
    if (status === "categorized") {
      const cat = CATEGORIES.includes(item?.category) ? item.category : "idea";
      return path.join(this.categorizedDir(), cat, `${id}.md`);
    }
    return path.join(this.inboxDir(), `${id}.md`);
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

// ---- Markdown serialization ----

const FRONTMATTER_DELIM = "---";

function serializeFlashMd(item, service) {
  const frontmatter = {
    id: item.id,
    type: "flash",
    category: item.category,
    tags: Array.isArray(item.tags) ? item.tags : [],
    status: item.status,
    priority: item.priority || "low",
    created: item.createdAt || "",
    source: item.sourceType || "wechat",
  };

  const yaml = [
    `${FRONTMATTER_DELIM}`,
    `id: ${item.id}`,
    `type: ${frontmatter.type}`,
    `category: ${frontmatter.category}`,
    `tags: [${frontmatter.tags.join(", ")}]`,
    `status: ${frontmatter.status}`,
    `priority: ${frontmatter.priority}`,
    `created: "${frontmatter.created}"`,
    `source: ${frontmatter.source}`,
  ];

  if (item.mood) yaml.push(`mood: ${item.mood}`);
  if (item.reviewedAt) yaml.push(`reviewed: "${item.reviewedAt}"`);
  if (item.archivedAt) yaml.push(`archived: "${item.archivedAt}"`);
  if (item.mergedToIdeaId) yaml.push(`merged_to: ${item.mergedToIdeaId}`);
  if (Array.isArray(item.relatedFlashIds) && item.relatedFlashIds.length) {
    yaml.push(`related: [${item.relatedFlashIds.join(", ")}]`);
  }

  yaml.push(`${FRONTMATTER_DELIM}`);
  yaml.push("");

  // Body: heading + content + Obsidian wikilinks for related flashes
  yaml.push(`# ${item.rawText}`);
  yaml.push("");

  if (item.cleanedText && item.cleanedText !== item.rawText) {
    yaml.push(item.cleanedText);
    yaml.push("");
  }

  // Obsidian [[wikilinks]] for graph view
  if (Array.isArray(item.relatedFlashIds) && item.relatedFlashIds.length) {
    yaml.push("## 关联闪存");
    yaml.push("");
    for (const rid of item.relatedFlashIds) {
      yaml.push(`- [[${rid}]]`);
    }
    yaml.push("");
  }

  return yaml.join("\n") + "\n";
}

function parseFlashMd(raw) {
  const normalized = String(raw || "").trim();
  if (!normalized.startsWith(FRONTMATTER_DELIM)) {
    return null;
  }

  const secondDelim = normalized.indexOf(FRONTMATTER_DELIM, 3);
  if (secondDelim === -1) {
    return null;
  }

  const fmBlock = normalized.slice(3, secondDelim).trim();
  const bodyBlock = normalized.slice(secondDelim + 3).trim();

  const fm = {};
  const lines = fmBlock.split("\n");
  for (const line of lines) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const rawValue = line.slice(colonIdx + 1).trim();
    if (!key || !rawValue) continue;

    if (key === "tags" || key === "related") {
      fm[key] = parseYamlArray(rawValue);
    } else {
      fm[key] = stripYamlQuotes(rawValue);
    }
  }

  // Extract title from body (strip leading # heading)
  let body = bodyBlock;
  if (body.startsWith("# ")) {
    const newlineIdx = body.indexOf("\n");
    body = newlineIdx === -1 ? "" : body.slice(newlineIdx + 1).trim();
  }

  // Strip wikilinks section from cleanedText
  const wikilinkIdx = body.indexOf("\n## 关联闪存\n");
  const cleanedText = wikilinkIdx === -1 ? body : body.slice(0, wikilinkIdx).trim();

  return {
    id: fm.id || "",
    sourceType: fm.source || "wechat",
    rawText: fm.id ? (body.split("\n")[0]?.replace(/^# /, "") || fm.id) : "",
    cleanedText: cleanedText || "",
    category: fm.category || "idea",
    tags: Array.isArray(fm.tags) ? fm.tags : [],
    status: fm.status || "inbox",
    priority: fm.priority || "low",
    mood: fm.mood || "",
    relatedFlashIds: Array.isArray(fm.related) ? fm.related : [],
    mergedToIdeaId: fm.merged_to || null,
    createdAt: fm.created || "",
    reviewedAt: fm.reviewed || null,
    archivedAt: fm.archived || null,
  };
}

function parseYamlArray(value) {
  let normalized = value.trim();
  if (normalized.startsWith("[") && normalized.endsWith("]")) {
    normalized = normalized.slice(1, -1);
  }
  return normalized
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function stripYamlQuotes(value) {
  let v = value.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  return v;
}

// ---- helpers ----

function resolveFlashMemoryDir(config) {
  const envDir = process.env.CYBERBOSS_FLASH_MEMORY_DIR;
  if (envDir && envDir.trim()) {
    return path.resolve(envDir.trim());
  }
  const stateDir = config?.stateDir || path.join(os.homedir(), ".cyberboss");
  return path.join(stateDir, "flash-memory");
}

function generateFlashId(dateLabel, baseDir) {
  const inboxDir = path.join(baseDir, "inbox");
  ensureDir(inboxDir);
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
