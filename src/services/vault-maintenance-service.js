const fs = require("fs");
const path = require("path");

/**
 * Vault Maintenance Service — v1.0.0
 * Non-real-time vault maintenance operations.
 * Handles: 导航.md, index/MOC files, write-log, consistency checks, dev log updates.
 */
class VaultMaintenanceService {
  constructor({ config }) {
    this.config = config;
  }

  get vaultDir() {
    const dir = process.env.CYBERBOSS_OBSIDIAN_VAULT;
    if (!dir || !dir.trim()) {
      throw new Error("CYBERBOSS_OBSIDIAN_VAULT is not set.");
    }
    return dir.trim();
  }

  _today() {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
  }

  _nowISO() {
    return new Date().toISOString();
  }

  /**
   * Update 导航.md (vault root navigation MOC).
   */
  updateNavigation({ updates = "" } = {}) {
    const navPath = path.join(this.vaultDir, "导航.md");
    const today = this._today();

    if (!fs.existsSync(navPath)) {
      const initial = [
        "---",
        `updated: ${today}`,
        "auto_generated: true",
        "---",
        "",
        "# 导航",
        "",
        "> 🧭 Cyberboss vault 顶层导航。自动维护，每次日终总结后更新。",
        "",
        "## 📂 目录",
        "",
        "### 闪存记忆",
        "→ [[闪存记忆/闪存索引|闪存索引]] — 灵感和待办的索引",
        "",
        "### 知识库",
        "→ [[知识库/知识库索引|知识库索引]] — 学习资料索引",
        "",
        "### 每日总结",
        "→ [[每日总结/|每日总结]] — 日/周/月总结",
        "",
        "### 大构思",
        "→ [[大构思/大构思|大构思中心]] — 构思草稿与完善",
        "",
        "### 用户画像馆",
        "→ [[用户画像馆/用户画像|用户画像]] — AI 对你的理解",
        "→ [[用户画像馆/观察日志/|观察日志]] — 原始行为观察",
        "",
        "### 人际关系馆",
        "→ [[人际关系馆/人际关系图谱|人际关系图谱]] — 你的人际网络",
        "→ [[人际关系馆/人名关键词表|人名关键词表]] — 人名索引",
        "→ [[人际关系馆/事件日志/|事件日志]] — 人际事件记录",
        "",
        "### 用户反馈",
        "→ [[用户反馈/用户反馈索引|用户反馈索引]] — bug 与建议",
        "",
        "### 用户档案",
        "→ [[用户档案|用户档案]] — 个人信息与偏好",
        "",
        "## 📊 快速链接",
        "",
        `> 最后更新：${today}`,
        "",
      ].join("\n");
      fs.writeFileSync(navPath, initial, "utf8");
      return { filePath: navPath, created: true };
    }

    if (updates) {
      const existing = fs.readFileSync(navPath, "utf8");
      const lines = existing.split("\n");
      const updatedLines = lines.map((line) => {
        if (line.startsWith("updated: ")) return `updated: ${today}`;
        if (line.startsWith("> 最后更新：")) return `> 最后更新：${today}`;
        return line;
      });
      updatedLines.push("", updates, "");
      fs.writeFileSync(navPath, updatedLines.join("\n"), "utf8");
    } else {
      // Just update the date
      const existing = fs.readFileSync(navPath, "utf8");
      const updated = existing
        .replace(/^updated: .*$/m, `updated: ${today}`)
        .replace(/^> 最后更新：.*$/m, `> 最后更新：${today}`);
      fs.writeFileSync(navPath, updated, "utf8");
    }

    return { filePath: navPath, created: false };
  }

  /**
   * Update any index/MOC file.
   * @param {string} target - "flash" | "knowledge" | "feedback" | "ideas"
   * @param {string} entry - markdown entry to append
   */
  updateIndex({ target, entry = "" } = {}) {
    const indexMap = {
      flash: "闪存记忆/闪存索引.md",
      knowledge: "知识库/知识库索引.md",
      feedback: "用户反馈/用户反馈索引.md",
      ideas: "大构思/大构思.md",
    };

    const relPath = indexMap[target];
    if (!relPath) throw new Error(`Unknown index target: ${target}. Must be one of: ${Object.keys(indexMap).join(", ")}`);
    const indexPath = path.join(this.vaultDir, relPath);
    const today = this._today();

    fs.mkdirSync(path.dirname(indexPath), { recursive: true });

    if (!fs.existsSync(indexPath)) {
      const title = target === "flash" ? "闪存索引"
        : target === "knowledge" ? "知识库索引"
        : target === "feedback" ? "用户反馈索引"
        : "大构思中心";
      fs.writeFileSync(indexPath, [
        "---",
        `updated: ${today}`,
        "auto_generated: true",
        "---",
        "",
        `# ${title}`,
        "",
        entry || "",
        "",
      ].join("\n"), "utf8");
      return { filePath: indexPath, created: true };
    }

    if (entry) {
      const existing = fs.readFileSync(indexPath, "utf8");
      const updated = existing.replace(/^updated: .*$/m, `updated: ${today}`);
      fs.writeFileSync(indexPath, updated + "\n" + entry + "\n", "utf8");
    }

    return { filePath: indexPath, created: false };
  }

  /**
   * Write to the write-log (for bidirectional confirmation).
   */
  writeLogEntry({ tool, action, target, filePath, bytesWritten = 0, summary = "" } = {}) {
    const stateDir = this.config?.stateDir || path.join(
      process.env.HOME || process.env.USERPROFILE || ".",
      ".cyberboss"
    );
    const logPath = path.join(stateDir, "write-log.jsonl");
    fs.mkdirSync(stateDir, { recursive: true });

    const entry = JSON.stringify({
      timestamp: this._nowISO(),
      tool,
      action,
      target,
      filePath,
      bytesWritten,
      summary,
    });
    fs.appendFileSync(logPath, entry + "\n", "utf8");
    return { logPath, entry };
  }

  /**
   * Read recent write-log entries.
   */
  readWriteLog({ since, limit = 100 } = {}) {
    const stateDir = this.config?.stateDir || path.join(
      process.env.HOME || process.env.USERPROFILE || ".",
      ".cyberboss"
    );
    const logPath = path.join(stateDir, "write-log.jsonl");
    if (!fs.existsSync(logPath)) {
      return { entries: [], total: 0 };
    }

    const lines = fs.readFileSync(logPath, "utf8").trim().split("\n").filter(Boolean);
    let entries = lines.map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);

    if (since) {
      entries = entries.filter((e) => e.timestamp >= since);
    }
    if (entries.length > limit) {
      entries = entries.slice(-limit);
    }

    return { entries, total: entries.length };
  }

  /**
   * Run a vault consistency check.
   * Checks key vault files exist and are within freshness windows.
   */
  checkConsistency({ date } = {}) {
    const today = date || this._today();
    const results = { checked: [], missing: [], stale: [], ok: [] };

    // Define expected files and their freshness requirements
    const checks = [
      // 🔴 Real-time files — should exist
      { file: "人际关系馆/人名关键词表.md", level: "🔴", desc: "人名关键词表" },
      { file: "用户反馈/用户反馈索引.md", level: "🔴", desc: "用户反馈索引" },
      { file: "用户档案.md", level: "🔴", desc: "用户档案" },
      // 🟠 Conversation-boundary files
      { file: `人际关系馆/事件日志/${today}.md`, level: "🟠", desc: "事件日志" },
      { file: `用户画像馆/观察日志/${today}.md`, level: "🟠", desc: "观察日志" },
      // 🟡 Daily files
      { file: "导航.md", level: "🟡", desc: "导航" },
      { file: "闪存记忆/闪存索引.md", level: "🟡", desc: "闪存索引" },
      { file: "知识库/知识库索引.md", level: "🟡", desc: "知识库索引" },
      { file: "大构思/大构思.md", level: "🟡", desc: "大构思中心" },
      { file: "用户画像馆/用户画像.md", level: "🟡", desc: "用户画像" },
      { file: "用户画像馆/语言习惯.md", level: "🟡", desc: "语言习惯" },
      { file: "用户画像馆/行为模式.md", level: "🟡", desc: "行为模式" },
      { file: "用户画像馆/决策风格.md", level: "🟡", desc: "决策风格" },
      { file: "用户画像馆/兴趣图谱.md", level: "🟡", desc: "兴趣图谱" },
    ];

    for (const check of checks) {
      const fullPath = path.join(this.vaultDir, check.file);
      const exists = fs.existsSync(fullPath);
      results.checked.push({ ...check, exists, fullPath });

      if (!exists) {
        results.missing.push({ ...check, fullPath });
      } else {
        // Check freshness
        const stat = fs.statSync(fullPath);
        const ageHours = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60);
        let maxAge = 48; // 🟡 default 48h
        if (check.level === "🔴") maxAge = 4;
        if (check.level === "🟠") maxAge = 24;

        if (ageHours > maxAge) {
          results.stale.push({ ...check, fullPath, ageHours, maxAge });
        } else {
          results.ok.push({ ...check, fullPath, ageHours });
        }
      }
    }

    const summary = {
      total: results.checked.length,
      ok: results.ok.length,
      missing: results.missing.length,
      stale: results.stale.length,
      checkedAt: this._nowISO(),
    };

    return { ...results, summary };
  }

  /**
   * Update a development log file (开发日志/) with version changes.
   */
  updateDevLog({ file, content, action = "append" } = {}) {
    if (!file) throw new Error("file is required");
    const devLogDir = path.join(this.vaultDir, "开发日志");
    const filePath = file.startsWith("开发日志/") ? path.join(this.vaultDir, file) : path.join(devLogDir, file);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    if (action === "overwrite" && content) {
      fs.writeFileSync(filePath, content, "utf8");
      return { filePath, action: "overwrite" };
    }

    if (action === "append" && content) {
      if (fs.existsSync(filePath)) {
        fs.appendFileSync(filePath, "\n" + content + "\n", "utf8");
      } else {
        fs.writeFileSync(filePath, content + "\n", "utf8");
      }
      return { filePath, action: "append" };
    }

    return { filePath, action: "noop" };
  }
}

module.exports = { VaultMaintenanceService };
