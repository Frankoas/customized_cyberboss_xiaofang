const fs = require("fs");
const path = require("path");

/**
 * Relationship Hub Service — v1.0.0
 * All interpersonal relationship vault writes go through this service.
 * Writes to: 人际关系馆/人物/*.md, 事件日志/YYYY-MM-DD.md, 见面简报/*.md, 人际关系图谱.md, 人名关键词表.md
 */
class RelationshipHubService {
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

  get relDir() {
    return path.join(this.vaultDir, "人际关系馆");
  }

  _today() {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
  }

  _nowTime() {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Shanghai",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(new Date());
  }

  /**
   * Write or update a person profile.
   * @param {string} name - person's name (Chinese)
   * @param {Object} fields - fields to update: { aliases?, relation?, traits?, notes?, events?, tags? }
   */
  writePerson({ name, fields = {} } = {}) {
    if (!name || !String(name).trim()) throw new Error("name is required");
    const safeName = String(name).trim();
    const personDir = path.join(this.relDir, "人物");
    const filePath = path.join(personDir, `${safeName}.md`);
    fs.mkdirSync(personDir, { recursive: true });

    if (fs.existsSync(filePath)) {
      // Merge update
      let content = fs.readFileSync(filePath, "utf8");
      const lines = content.split("\n");
      const updatedLines = this._mergePersonFields(lines, safeName, fields);
      fs.writeFileSync(filePath, updatedLines.join("\n"), "utf8");
      return { filePath, name: safeName, created: false, updated: true, fields: Object.keys(fields) };
    } else {
      // Create new
      const entry = this._buildPersonFile(safeName, fields);
      fs.writeFileSync(filePath, entry, "utf8");

      // Add to name keyword table
      this._addToKeywordTable(safeName, fields.aliases || []);

      return { filePath, name: safeName, created: true, updated: false, fields: Object.keys(fields) };
    }
  }

  _mergePersonFields(lines, name, fields) {
    // Simple merge: update YAML frontmatter and append new info sections
    const result = [...lines];
    const frontmatterEnd = result.findIndex((l, i) => i > 0 && l.trim() === "---");
    if (frontmatterEnd > 0) {
      // Update aliases
      if (fields.aliases && fields.aliases.length > 0) {
        const aliasIdx = result.findIndex((l) => l.startsWith("aliases:"));
        if (aliasIdx > 0 && aliasIdx < frontmatterEnd) {
          const existing = this._parseYamlList(result[aliasIdx]);
          const merged = [...new Set([...existing, ...fields.aliases])];
          result[aliasIdx] = `aliases: [${merged.join(", ")}]`;
        } else if (aliasIdx < 0) {
          result.splice(frontmatterEnd, 0, `aliases: [${fields.aliases.join(", ")}]`);
        }
      }
      // Update tags
      if (fields.tags && fields.tags.length > 0) {
        const tagIdx = result.findIndex((l) => l.startsWith("tags:"));
        if (tagIdx > 0 && tagIdx < frontmatterEnd) {
          const existing = this._parseYamlList(result[tagIdx]);
          const merged = [...new Set([...existing, ...fields.tags])];
          result[tagIdx] = `tags: [${merged.join(", ")}]`;
        } else if (tagIdx < 0) {
          result.splice(frontmatterEnd, 0, `tags: [${fields.tags.join(", ")}]`);
        }
      }
    }
    // Append new notes if provided
    if (fields.notes) {
      const timeStr = this._nowTime();
      result.push("", `### ${timeStr} — 新增笔记`, "", fields.notes, "");
    }
    if (fields.traits) {
      const timeStr = this._nowTime();
      result.push("", `### ${timeStr} — 特质更新`, "", fields.traits, "");
    }
    if (fields.relation) {
      const timeStr = this._nowTime();
      result.push("", `### ${timeStr} — 关系更新`, "", fields.relation, "");
    }
    return result;
  }

  _parseYamlList(line) {
    const match = line.match(/\[(.*)\]/);
    if (!match) return [];
    return match[1].split(",").map((s) => s.trim()).filter(Boolean);
  }

  _buildPersonFile(name, fields) {
    const aliases = fields.aliases && fields.aliases.length > 0
      ? `aliases: [${fields.aliases.join(", ")}]` : "aliases: []";
    const tags = fields.tags && fields.tags.length > 0
      ? `tags: [${fields.tags.join(", ")}]` : "tags: []";
    const today = this._today();
    const lines = [
      "---",
      `name: "${name}"`,
      aliases,
      `relation: "${fields.relation || "未知"}"`,
      tags,
      `created: ${today}`,
      `updated: ${today}`,
      `eventCount: 1`,
      `confidence: low`,
      "---",
      "",
      `# ${name}`,
      "",
      "## 基本信息",
      "",
    ];
    if (fields.relation) lines.push(`- 关系: ${fields.relation}`);
    if (fields.traits) lines.push("", "## 特质", "", fields.traits);
    if (fields.notes) lines.push("", "## 笔记", "", fields.notes);
    if (fields.events) lines.push("", "## 重要事件", "", fields.events);
    lines.push("");
    return lines.join("\n");
  }

  /**
   * Append an event to the daily event log.
   */
  writeEvent({ date, time, title, description, peopleInvolved = [], tags = [] } = {}) {
    const dateStr = date || this._today();
    const timeStr = time || this._nowTime();
    const eventDir = path.join(this.relDir, "事件日志");
    const filePath = path.join(eventDir, `${dateStr}.md`);
    fs.mkdirSync(eventDir, { recursive: true });

    const peopleTags = peopleInvolved.map((p) => `[[人物/${p}|${p}]]`).join(" ");
    const tagStr = tags.map((t) => `#${t}`).join(" ");
    const eventId = `evt-${dateStr.replace(/-/g, "")}-${String(Math.floor(Math.random() * 900) + 100)}`;

    const entry = [
      `### ${timeStr} - ${title || "事件"} ^{${eventId}}`,
      "",
    ];
    if (description) entry.push(description, "");
    if (peopleInvolved.length > 0) entry.push(`**相关人物**: ${peopleTags}`, "");
    if (tags.length > 0) entry.push(tagStr, "");
    entry.push("");

    if (fs.existsSync(filePath)) {
      fs.appendFileSync(filePath, "\n" + entry.join("\n"), "utf8");
    } else {
      const heading = `# 事件日志 · ${dateStr}\n\n${entry.join("\n")}`;
      fs.writeFileSync(filePath, heading, "utf8");
    }

    return { filePath, date: dateStr, eventId, title: title || "事件" };
  }

  /**
   * Create a meeting briefing.
   */
  writeBriefing({ personName, date, briefing } = {}) {
    if (!personName) throw new Error("personName is required");
    const safeName = String(personName).trim();
    const dateStr = date || this._today();
    const briefingDir = path.join(this.relDir, "见面简报");
    const filePath = path.join(briefingDir, `${safeName}-${dateStr}.md`);
    fs.mkdirSync(briefingDir, { recursive: true });

    const content = [
      "---",
      `person: "[[人物/${safeName}|${safeName}]]"`,
      `date: ${dateStr}`,
      `type: meeting-briefing`,
      "---",
      "",
      `# 见面简报 — ${safeName}（${dateStr}）`,
      "",
      briefing || `_待填充 — 请根据 [[人物/${safeName}]] 中的画像和事件生成_`,
      "",
    ].join("\n");

    fs.writeFileSync(filePath, content, "utf8");
    return { filePath, person: safeName, date: dateStr };
  }

  /**
   * Update the relationship graph file (人际关系图谱.md).
   */
  updateGraph({ updates = "" } = {}) {
    const graphPath = path.join(this.relDir, "人际关系图谱.md");
    if (!fs.existsSync(graphPath)) {
      const initial = [
        "---",
        "updated: " + this._today(),
        "auto_generated: true",
        "---",
        "",
        "# 人际关系图谱",
        "",
        "## 人物清单",
        "",
        updates || "_通过事件自动积累 — 每日日终总结时更新_",
        "",
      ].join("\n");
      fs.writeFileSync(graphPath, initial, "utf8");
      return { filePath: graphPath, created: true };
    }
    if (updates) {
      fs.appendFileSync(graphPath, "\n" + updates + "\n", "utf8");
    }
    return { filePath: graphPath, created: false, appended: !!updates };
  }

  /**
   * Update the relationship network file (关系网络.md).
   */
  updateNetwork({ personA, personB, strength, note } = {}) {
    const networkPath = path.join(this.relDir, "关系网络.md");
    if (!fs.existsSync(networkPath)) {
      fs.mkdirSync(this.relDir, { recursive: true });
      fs.writeFileSync(networkPath, [
        "---",
        "updated: " + this._today(),
        "---",
        "",
        "# 关系网络",
        "",
        "## 关系强度评分",
        "",
      ].join("\n"), "utf8");
    }
    if (personA && personB) {
      const entry = `- [[人物/${personA}|${personA}]] ↔ [[人物/${personB}|${personB}]]: ${strength || "未评估"}${note ? ` (${note})` : ""}`;
      fs.appendFileSync(networkPath, entry + "\n", "utf8");
    }
    return { filePath: networkPath };
  }

  /**
   * Update the name keyword table (人名关键词表.md).
   */
  updateKeywords({ names = [], source = "" } = {}) {
    if (!names.length) return { updated: false };
    const keywordPath = path.join(this.relDir, "人名关键词表.md");
    fs.mkdirSync(this.relDir, { recursive: true });

    if (!fs.existsSync(keywordPath)) {
      const initial = [
        "---",
        "updated: " + this._today(),
        "auto_generated: true",
        "---",
        "",
        "# 人名关键词表",
        "",
        "> 自动维护。检测到的新人名自动追加到此表。",
        "",
        "| 名字 | 别称 | 首次出现 | 来源 |",
        "|------|------|----------|------|",
      ].join("\n") + "\n";
      fs.writeFileSync(keywordPath, initial, "utf8");
    }

    const content = fs.readFileSync(keywordPath, "utf8");
    let appended = 0;
    for (const name of names) {
      const safeName = String(name).trim();
      if (!safeName) continue;
      if (content.includes(`| ${safeName} |`)) continue; // already exists
      const today = this._today();
      const entry = `| ${safeName} | — | ${today} | ${source || "对话检测"} |\n`;
      fs.appendFileSync(keywordPath, entry, "utf8");
      appended++;
    }

    return { filePath: keywordPath, updated: appended > 0, appended };
  }

  /**
   * Internal: add a name to the keyword table when a new person profile is created.
   */
  _addToKeywordTable(name, aliases = []) {
    const allNames = [name, ...aliases].filter(Boolean);
    this.updateKeywords({ names: allNames, source: "人物档案创建" });
  }
}

module.exports = { RelationshipHubService };
