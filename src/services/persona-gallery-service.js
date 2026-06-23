const fs = require("fs");
const path = require("path");

/**
 * Persona Gallery Service — v1.0.0
 * All user persona vault writes go through this service.
 * Writes to: 用户画像馆/观察日志/*.md, 用户画像.md, 语言习惯.md, 行为模式.md, 决策风格.md, 兴趣图谱.md, 用户档案.md
 */
class PersonaGalleryService {
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

  get personaDir() {
    return path.join(this.vaultDir, "用户画像馆");
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
   * Append an observation to today's observation log.
   */
  writeObservation({ date, text, source = "", tags = [], confidence = "medium" } = {}) {
    const dateStr = date || this._today();
    const timeStr = this._nowTime();
    const obsDir = path.join(this.personaDir, "观察日志");
    const filePath = path.join(obsDir, `${dateStr}.md`);
    fs.mkdirSync(obsDir, { recursive: true });

    const obsNumber = this._nextObsNumber(filePath);
    const obsId = `obs-${dateStr.replace(/-/g, "")}-${String(obsNumber).padStart(3, "0")}`;
    const confidenceEmoji = { high: "🟢", medium: "🟡", low: "🟠" }[confidence] || "🟡";
    const tagStr = tags.length > 0 ? ` #${tags.join(" #")}` : "";

    const entry = [
      `## ${confidenceEmoji} ${obsId} — ${timeStr}${tagStr}`,
      "",
      text || "",
    ];
    if (source) entry.push("", `_来源: ${source}_`);
    entry.push("");

    if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
      fs.appendFileSync(filePath, "\n" + entry.join("\n"), "utf8");
    } else {
      const heading = [
        "---",
        `date: ${dateStr}`,
        "type: observation-log",
        "---",
        "",
        `# 观察日志 · ${dateStr}`,
        "",
      ].join("\n") + "\n" + entry.join("\n");
      fs.writeFileSync(filePath, heading, "utf8");
    }

    return { filePath, date: dateStr, obsId, confidence };
  }

  _nextObsNumber(filePath) {
    if (!fs.existsSync(filePath)) return 1;
    const content = fs.readFileSync(filePath, "utf8");
    const matches = content.match(/^obs-\d{8}-(\d{3})/gm);
    if (!matches || !matches.length) return 1;
    const numbers = matches.map((m) => parseInt(m.split("-").pop(), 10) || 0);
    return Math.max(...numbers) + 1;
  }

  /**
   * Update the main persona profile (用户画像.md).
   */
  updateProfile({ date, section, content } = {}) {
    const dateStr = date || this._today();
    const profilePath = path.join(this.personaDir, "用户画像.md");

    if (!fs.existsSync(profilePath)) {
      const initial = [
        "---",
        `created: ${dateStr}`,
        `updated: ${dateStr}`,
        "confidence: 0.0",
        "observationCount: 0",
        "type: persona-profile",
        "---",
        "",
        "# 用户画像",
        "",
        "## 综合画像",
        "",
        content || "_待积累观察后生成..._",
        "",
        "## 标签云",
        "",
        "## 演化轨迹",
        "",
      ].join("\n");
      fs.writeFileSync(profilePath, initial, "utf8");
      return { filePath: profilePath, created: true };
    }

    if (content) {
      const existing = fs.readFileSync(profilePath, "utf8");
      const lines = existing.split("\n");
      const updatedLines = lines.map((line) => {
        if (line.startsWith("updated: ")) {
          return `updated: ${dateStr}`;
        }
        return line;
      });
      // Append to the relevant section
      if (section) {
        const sectionIdx = updatedLines.findIndex((l) => l.trim() === `## ${section}`);
        if (sectionIdx >= 0) {
          updatedLines.splice(sectionIdx + 1, 0, "", content, "");
        } else {
          updatedLines.push("", `## ${section}`, "", content, "");
        }
      }
      fs.writeFileSync(profilePath, updatedLines.join("\n"), "utf8");
    }

    return { filePath: profilePath, created: false };
  }

  /**
   * Update a specific dimension file.
   * @param {string} dimension - one of: 语言习惯, 行为模式, 决策风格, 兴趣图谱
   */
  updateDimension({ dimension, date, content = "", observations = [] } = {}) {
    const validDimensions = ["语言习惯", "行为模式", "决策风格", "兴趣图谱"];
    if (!validDimensions.includes(dimension)) {
      throw new Error(`Invalid dimension: ${dimension}. Must be one of: ${validDimensions.join(", ")}`);
    }
    const dateStr = date || this._today();
    const dimPath = path.join(this.personaDir, `${dimension}.md`);

    if (!fs.existsSync(dimPath)) {
      const initial = [
        "---",
        `dimension: "${dimension}"`,
        `created: ${dateStr}`,
        `updated: ${dateStr}`,
        "confidence: 0.0",
        "observationCount: 0",
        "---",
        "",
        `# ${dimension}`,
        "",
        content || "_待积累观察后生成..._",
        "",
      ].join("\n");
      fs.writeFileSync(dimPath, initial, "utf8");
      return { filePath: dimPath, created: true, dimension };
    }

    if (content) {
      const existing = fs.readFileSync(dimPath, "utf8");
      const lines = existing.split("\n");
      const updatedLines = lines.map((line) => {
        if (line.startsWith("updated: ")) return `updated: ${dateStr}`;
        if (line.startsWith("observationCount: ")) {
          const current = parseInt(line.match(/\d+/)?.[0] || "0", 10);
          return `observationCount: ${current + observations.length}`;
        }
        return line;
      });
      updatedLines.push("", `## ${dateStr} 更新`, "", content, "");
      fs.writeFileSync(dimPath, updatedLines.join("\n"), "utf8");
    }

    return { filePath: dimPath, created: false, dimension };
  }

  /**
   * Update user profile (用户档案.md in vault root).
   */
  updateUserProfile({ section, content, date } = {}) {
    const dateStr = date || this._today();
    const profilePath = path.join(this.vaultDir, "用户档案.md");

    if (!fs.existsSync(profilePath)) {
      const initial = [
        "---",
        `created: ${dateStr}`,
        `updated: ${dateStr}`,
        "type: user-profile",
        "---",
        "",
        "# 用户档案",
        "",
        "## 🎂 重要日期",
        "",
        "## 🍜 饮食偏好",
        "",
        "## 💡 其他偏好",
        "",
        "## 🔔 定期提醒规则",
        "",
      ].join("\n");
      fs.writeFileSync(profilePath, initial, "utf8");
    }

    if (section && content) {
      const existing = fs.readFileSync(profilePath, "utf8");
      const lines = existing.split("\n");
      const updatedLines = lines.map((line) => {
        if (line.startsWith("updated: ")) return `updated: ${dateStr}`;
        return line;
      });
      const sectionIdx = updatedLines.findIndex((l) => l.startsWith(`## ${section}`));
      if (sectionIdx >= 0) {
        // Find next section or end of file
        let insertIdx = sectionIdx + 1;
        while (insertIdx < updatedLines.length && !updatedLines[insertIdx].startsWith("## ")) {
          insertIdx++;
        }
        updatedLines.splice(insertIdx, 0, `- ${content}`);
      } else {
        updatedLines.push("", `## ${section}`, "", `- ${content}`, "");
      }
      fs.writeFileSync(profilePath, updatedLines.join("\n"), "utf8");
    }

    return { filePath: profilePath, created: false, updated: !!(section && content) };
  }
}

module.exports = { PersonaGalleryService };
