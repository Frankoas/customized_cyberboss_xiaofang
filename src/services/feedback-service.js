const fs = require("fs");
const path = require("path");

class FeedbackService {
  constructor({ config }) {
    this.config = config;
  }

  /**
   * Capture user feedback and write to the Obsidian vault.
   * @param {Object} options
   * @param {string} options.category - bug | feature-request | ux | other
   * @param {string} options.title - brief title
   * @param {string} options.context - what the user was doing
   * @param {string} options.content - the feedback details
   * @param {string} options.priority - high | medium | low
   * @param {string} [options.date] - YYYY-MM-DD, defaults to today
   * @returns {{ filePath: string, date: string, title: string, appended: boolean }}
   */
  capture({ category = "other", title = "", context = "", content = "", priority = "medium", date = "" } = {}) {
    const safeCategory = ["bug", "feature-request", "ux", "other"].includes(category)
      ? category : "other";
    const safePriority = ["high", "medium", "low"].includes(priority)
      ? priority : "medium";
    const safeTitle = String(title || "").trim();
    const safeContent = String(content || "").trim();

    if (!safeTitle && !safeContent) {
      throw new Error("Feedback must have at least a title or content.");
    }

    const dateString = date || formatDate(new Date());
    const vaultDir = process.env.CYBERBOSS_OBSIDIAN_VAULT;
    if (!vaultDir || !vaultDir.trim()) {
      throw new Error("CYBERBOSS_OBSIDIAN_VAULT is not set. Cannot write feedback.");
    }
    const feedbackDir = path.join(vaultDir.trim(), "用户反馈");
    const filePath = path.join(feedbackDir, `${dateString}.md`);

    fs.mkdirSync(feedbackDir, { recursive: true });

    const now = new Date();
    const timeString = formatTime(now);
    const entryTitle = safeTitle || "未命名反馈";
    const entry = buildFeedbackEntry({
      timeString,
      title: entryTitle,
      category: safeCategory,
      context: String(context || "").trim(),
      content: safeContent || entryTitle,
      priority: safePriority,
    });

    let appended = false;
    if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
      fs.appendFileSync(filePath, `\n\n${entry}`, "utf8");
      appended = true;
    } else {
      const heading = `# 用户反馈 · ${dateString}\n\n${entry}`;
      fs.writeFileSync(filePath, heading, "utf8");
    }

    // Update MOC index
    this._updateMocIndex(feedbackDir, dateString, filePath);

    return {
      filePath,
      date: dateString,
      title: entryTitle,
      appended,
    };
  }

  /**
   * Update the 用户反馈索引.md MOC file with the new entry.
   */
  _updateMocIndex(feedbackDir, dateString, filePath) {
    const mocPath = path.join(feedbackDir, "用户反馈索引.md");
    const displayDate = formatDisplayDate(dateString);

    if (fs.existsSync(mocPath)) {
      let mocContent = fs.readFileSync(mocPath, "utf8");
      // Check if this date already has an entry in the MOC
      const dateLink = `[[${dateString}|${displayDate}]]`;
      if (!mocContent.includes(dateLink)) {
        // Append to the date list
        const lines = mocContent.split("\n");
        const lastListLine = lines.reduce((acc, line, idx) => {
          return line.trim().startsWith("- [[") ? idx : acc;
        }, -1);
        if (lastListLine >= 0) {
          lines.splice(lastListLine + 1, 0, `- ${dateLink}`);
          fs.writeFileSync(mocPath, lines.join("\n"), "utf8");
        } else {
          // No existing list, append at end
          fs.appendFileSync(mocPath, `\n- ${dateLink}\n`, "utf8");
        }
      }
    } else {
      // Create a minimal MOC
      const moc = `# 用户反馈索引\n\n汇总所有用户反馈记录。\n\n## 反馈日期\n\n- [[${dateString}|${displayDate}]]\n`;
      fs.writeFileSync(mocPath, moc, "utf8");
    }
  }
}

function buildFeedbackEntry({ timeString, title, category, context, content, priority }) {
  const categoryLabel = {
    "bug": "Bug 报告",
    "feature-request": "功能建议",
    "ux": "使用反馈",
    "other": "其他",
  }[category] || category;

  const priorityLabel = {
    "high": "🔴 高",
    "medium": "🟡 中",
    "low": "🟢 低",
  }[priority] || priority;

  const lines = [
    `## ${timeString} - ${title}`,
    "",
    `**分类**: ${category} (${categoryLabel})`,
  ];
  if (context) {
    lines.push(`**上下文**: ${context}`);
  }
  lines.push(`**内容**: ${content}`);
  lines.push(`**优先级**: ${priorityLabel}`);

  return lines.join("\n");
}

function formatDate(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatTime(date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatDisplayDate(dateString) {
  const parts = String(dateString).split("-");
  if (parts.length === 3) {
    return `${parts[0]}年${parseInt(parts[1], 10)}月${parseInt(parts[2], 10)}日`;
  }
  return dateString;
}

module.exports = { FeedbackService };
