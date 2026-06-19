const fs = require("fs");
const path = require("path");
const os = require("os");

const DIFFICULTY_WEIGHTS = { easy: 1, medium: 2, hard: 3 };

class KnowledgeService {
  constructor({ config }) {
    this.config = config;
    this.baseDir = resolveKnowledgeBaseDir(config);
    this._indexCache = null;
    this._indexCacheTime = 0;
  }

  /**
   * Scan the knowledge base and return the index.
   * Cached for 30 seconds to avoid repeated disk scans.
   */
  getIndex({ forceRefresh = false } = {}) {
    const now = Date.now();
    if (!forceRefresh && this._indexCache && (now - this._indexCacheTime) < 30_000) {
      return this._indexCache;
    }

    const categories = {};
    const allItems = [];

    if (!fs.existsSync(this.baseDir)) {
      this._indexCache = { categories, items: [], total: 0 };
      this._indexCacheTime = now;
      return this._indexCache;
    }

    const entries = fs.readdirSync(this.baseDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith("_") || entry.name.startsWith(".")) continue;

      const catDir = path.join(this.baseDir, entry.name);
      const catItems = this._scanCategoryDir(catDir, entry.name);
      if (catItems.length) {
        categories[entry.name] = {
          label: entry.name,
          count: catItems.length,
          items: catItems,
        };
        allItems.push(...catItems);
      }
    }

    const index = {
      categories,
      items: allItems,
      total: allItems.length,
    };

    this._indexCache = index;
    this._indexCacheTime = now;
    return index;
  }

  /**
   * Pick the next quiz item using weighted random selection.
   * Priority: unreviewed > answered-wrong > answered-correct.
   * Recent items (last N) are excluded to avoid repetition.
   */
  pickNext({ category = "", difficulty = "", excludeIds = [], recentWindowSize = 20 } = {}) {
    const index = this.getIndex();
    const history = this._loadHistory();
    const recentIds = new Set(Array.isArray(excludeIds) ? excludeIds : []);

    // Also exclude recently answered items from history
    const recentHistory = Object.entries(history.answers || {})
      .sort((a, b) => (b[1].lastAnsweredAt || "").localeCompare(a[1].lastAnsweredAt || ""))
      .slice(0, recentWindowSize)
      .map(([id]) => id);
    for (const id of recentHistory) recentIds.add(id);

    // Filter candidates
    let candidates = index.items;
    if (category && index.categories[category]) {
      candidates = index.categories[category].items;
    }
    if (difficulty && DIFFICULTY_WEIGHTS[difficulty]) {
      candidates = candidates.filter((item) => item.difficulty === difficulty);
    }
    candidates = candidates.filter((item) => !recentIds.has(item.id));

    if (!candidates.length) {
      // Fallback: allow recently answered if nothing else available
      candidates = index.items.filter((item) => !recentIds.has(item.id));
    }
    if (!candidates.length) {
      candidates = index.items; // Everything exhausted
    }

    // Weighted random: unreviewed ×2, wrong ×1.3, correct ×1
    const weighted = candidates.map((item) => {
      const hist = history.answers?.[item.id] || null;
      let weight = 1;
      if (!hist) {
        weight = 2; // Never answered → highest priority
      } else if (hist.correctCount === 0 && hist.attemptCount > 0) {
        weight = 1.3; // Wrong before → revisit
      }
      // Difficulty adjustment
      const diffMult = DIFFICULTY_WEIGHTS[item.difficulty] || 1;
      return { item, weight: weight * diffMult };
    });

    const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);
    let roll = Math.random() * totalWeight;

    for (const { item, weight } of weighted) {
      roll -= weight;
      if (roll <= 0) return item;
    }

    return weighted[weighted.length - 1]?.item || null;
  }

  /**
   * Check an answer against the item's keywords.
   * Returns { correct, explanation, matchedKeywords, missedKeywords }
   */
  checkAnswer({ itemId = "", userAnswer = "" } = {}) {
    const index = this.getIndex();
    const item = index.items.find((i) => i.id === itemId);
    if (!item) {
      throw new Error(`Knowledge item not found: ${itemId}`);
    }

    const normalizedAnswer = String(userAnswer || "").trim().toLowerCase();
    const keywords = (Array.isArray(item.answerKeywords) ? item.answerKeywords : []).map((k) => k.toLowerCase());
    const explanation = item.explanation || "";

    if (!keywords.length) {
      // No keywords defined — model judges
      return { correct: null, explanation, matchedKeywords: [], missedKeywords: [], needsModelJudge: true };
    }

    const matched = keywords.filter((kw) => normalizedAnswer.includes(kw));
    const missed = keywords.filter((kw) => !normalizedAnswer.includes(kw));
    const correct = matched.length >= Math.ceil(keywords.length * 0.5); // At least 50% keywords matched

    // Record in history
    this._recordAnswer(itemId, correct);

    return {
      correct,
      explanation,
      matchedKeywords: matched,
      missedKeywords: missed,
      needsModelJudge: false,
    };
  }

  /**
   * Record an answer in history without checking (for model-judged answers).
   */
  recordResult({ itemId = "", correct = false } = {}) {
    this._recordAnswer(itemId, correct);
  }

  /**
   * Get knowledge base stats.
   */
  getStats() {
    const index = this.getIndex();
    const history = this._loadHistory();
    const totalAnswers = Object.values(history.answers || {}).reduce((s, a) => s + (a.attemptCount || 0), 0);
    const totalCorrect = Object.values(history.answers || {}).reduce((s, a) => s + (a.correctCount || 0), 0);

    return {
      totalItems: index.total,
      categories: Object.keys(index.categories).length,
      totalAnswers,
      totalCorrect,
      overallCorrectRate: totalAnswers > 0 ? Math.round((totalCorrect / totalAnswers) * 100) / 100 : 0,
    };
  }

  // ---- private ----

  _scanCategoryDir(dir, categoryName) {
    const items = [];
    if (!fs.existsSync(dir)) return items;

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
        if (entry.name.startsWith("_")) continue; // Skip templates

        try {
          const raw = fs.readFileSync(path.join(dir, entry.name), "utf8");
          const item = parseKnowledgeMd(raw, categoryName);
          if (item && item.id) items.push(item);
        } catch { /* skip corrupt */ }
      }
    } catch { /* dir may be empty */ }

    return items;
  }

  _loadHistory() {
    const filePath = this._historyFile();
    if (!fs.existsSync(filePath)) {
      return { version: 1, answers: {} };
    }
    try {
      return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch {
      return { version: 1, answers: {} };
    }
  }

  _saveHistory(history) {
    ensureDir(path.dirname(this._historyFile()));
    fs.writeFileSync(this._historyFile(), JSON.stringify(history, null, 2), "utf8");
  }

  _recordAnswer(itemId, correct) {
    const history = this._loadHistory();
    const entry = history.answers?.[itemId] || { attemptCount: 0, correctCount: 0, lastAnsweredAt: null };
    entry.attemptCount += 1;
    if (correct) entry.correctCount += 1;
    entry.lastAnsweredAt = new Date().toISOString();
    if (!history.answers) history.answers = {};
    history.answers[itemId] = entry;
    this._saveHistory(history);
  }

  _historyFile() {
    return path.join(this.baseDir, "_quiz_history.json");
  }
}

// ---- Markdown parser for knowledge items ----

const FM_DELIM = "---";

function parseKnowledgeMd(raw, categoryName) {
  const normalized = String(raw || "").trim();
  if (!normalized.startsWith(FM_DELIM)) return null;

  const secondDelim = normalized.indexOf(FM_DELIM, 3);
  if (secondDelim === -1) return null;

  const fmBlock = normalized.slice(3, secondDelim).trim();
  const bodyBlock = normalized.slice(secondDelim + 3).trim();

  // Parse frontmatter
  const fm = {};
  for (const line of fmBlock.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const rawValue = line.slice(colonIdx + 1).trim();
    if (!key) continue;

    if (key === "tags") {
      fm[key] = parseYamlArray(rawValue);
    } else {
      fm[key] = stripYamlQuotes(rawValue);
    }
  }

  // Generate stable ID from category + filename-like slug
  const titleMatch = bodyBlock.match(/^#\s+问题\s*\n([\s\S]*?)(?=\n#|\n*$)/);
  const questionText = titleMatch ? titleMatch[1].trim() : "";
  const idBase = (categoryName + "-" + (fm.tags?.[0] || "item")).replace(/[^a-zA-Z0-9一-鿿]/g, "-").toLowerCase();
  const id = idBase + "-" + simpleHash(questionText.slice(0, 50));

  // Parse sections
  const answerKwMatch = bodyBlock.match(/#\s+答案关键词\s*\n([\s\S]*?)(?=\n#|\n*$)/);
  const explanationMatch = bodyBlock.match(/#\s+解析\s*\n([\s\S]*?)(?=\n#|\n*$)/);
  const sourceMatch = bodyBlock.match(/#\s+来源\s*\n([\s\S]*?)(?=\n#|\n*$)/);

  return {
    id,
    type: fm.type || "quiz",
    category: fm.category || categoryName,
    tags: fm.tags || [],
    difficulty: fm.difficulty || "medium",
    estimatedMinutes: Number(fm.estimatedMinutes) || 2,
    question: questionText,
    answerKeywords: answerKwMatch ? parseKeywords(answerKwMatch[1].trim()) : [],
    explanation: explanationMatch ? explanationMatch[1].trim() : "",
    source: sourceMatch ? sourceMatch[1].trim() : (fm.source || ""),
  };
}

function parseKeywords(text) {
  return text
    .split(/[,，、\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseYamlArray(value) {
  let normalized = value.trim();
  if (normalized.startsWith("[") && normalized.endsWith("]")) {
    normalized = normalized.slice(1, -1);
  }
  return normalized.split(",").map((s) => s.trim()).filter(Boolean);
}

function stripYamlQuotes(value) {
  let v = value.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  return v;
}

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36).slice(0, 4);
}

// ---- helpers ----

function resolveKnowledgeBaseDir(config) {
  const envDir = process.env.CYBERBOSS_KNOWLEDGE_BASE_DIR;
  if (envDir && envDir.trim()) {
    return path.resolve(envDir.trim());
  }
  const stateDir = config?.stateDir || path.join(os.homedir(), ".cyberboss");
  return path.join(stateDir, "knowledge-base");
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

module.exports = { KnowledgeService };
