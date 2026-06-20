const fs = require("fs");
const path = require("path");

const { resolveBodyInput } = require("./text-input");

class DiaryService {
  constructor({ config }) {
    this.config = config;
  }

  async append({ text = "", textFile = "", title = "", date = "", time = "" } = {}) {
    const body = await resolveBodyInput({ text, textFile });
    if (!body) {
      throw new Error("Diary content cannot be empty. Pass text or textFile.");
    }

    const now = new Date();
    const dateString = date || formatDate(now);
    const timeString = time || formatTime(now);
    const filePath = path.join(this.config.diaryDir, `${dateString}.md`);
    const entry = buildDiaryEntry({
      timeString,
      title,
      body,
    });

    fs.mkdirSync(this.config.diaryDir, { recursive: true });
    const prefix = fs.existsSync(filePath) && fs.statSync(filePath).size > 0 ? "\n\n" : "";
    fs.appendFileSync(filePath, `${prefix}${entry}`, "utf8");
    return {
      filePath,
      date: dateString,
      time: timeString,
      body,
    };
  }

  /**
   * Set the end-of-day mood snapshot in the diary file's YAML frontmatter.
   * Creates the file with a frontmatter-only skeleton if it doesn't exist.
   */
  setMood({ date = "", mood = "" } = {}) {
    const normalizedMood = String(mood || "").trim();
    if (!normalizedMood) {
      throw new Error("Mood cannot be empty.");
    }
    const VALID_MOODS = ["开心", "一般", "低落", "烦躁", "疲惫", "充实", "焦虑", "平静", "兴奋"];
    if (!VALID_MOODS.includes(normalizedMood)) {
      throw new Error(`Invalid mood: "${normalizedMood}". Must be one of: ${VALID_MOODS.join(", ")}`);
    }

    const dateString = date || formatDate(new Date());
    const filePath = path.join(this.config.diaryDir, `${dateString}.md`);

    fs.mkdirSync(this.config.diaryDir, { recursive: true });

    let content;
    if (fs.existsSync(filePath)) {
      content = fs.readFileSync(filePath, "utf8");
    } else {
      content = "";
    }

    // Build mood frontmatter
    const moodLine = `mood: ${normalizedMood}`;
    const scoreMap = { "开心": 5, "兴奋": 5, "充实": 4, "平静": 3, "一般": 3, "焦虑": 2, "疲惫": 2, "烦躁": 1, "低落": 1 };
    const scoreLine = `mood_score: ${scoreMap[normalizedMood] || 3}`;

    if (content.startsWith("---")) {
      // Existing frontmatter: update or add mood fields
      const fmEnd = content.indexOf("---", 3);
      if (fmEnd !== -1) {
        let frontmatter = content.slice(3, fmEnd);
        const body = content.slice(fmEnd + 3);
        if (/^mood:\s/m.test(frontmatter)) {
          frontmatter = frontmatter.replace(/^mood:\s*.*$/m, moodLine);
        } else {
          frontmatter = frontmatter.trimEnd() + `\n${moodLine}`;
        }
        if (/^mood_score:\s/m.test(frontmatter)) {
          frontmatter = frontmatter.replace(/^mood_score:\s*.*$/m, scoreLine);
        } else {
          frontmatter = frontmatter.trimEnd() + `\n${scoreLine}`;
        }
        content = `---${frontmatter}---${body}`;
      }
    } else {
      // No frontmatter: create one
      content = `---\n${moodLine}\n${scoreLine}\n---\n\n${content}`;
    }

    fs.writeFileSync(filePath, content, "utf8");
    return { filePath, date: dateString, mood: normalizedMood, mood_score: scoreMap[normalizedMood] || 3 };
  }

  /**
   * Read the mood snapshot from a diary file's YAML frontmatter.
   */
  readMood(dateString) {
    const filePath = path.join(this.config.diaryDir, `${dateString}.md`);
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, "utf8");
    if (!content.startsWith("---")) return null;
    const fmEnd = content.indexOf("---", 3);
    if (fmEnd === -1) return null;
    const frontmatter = content.slice(3, fmEnd);
    const moodMatch = frontmatter.match(/^mood:\s*(.+)$/m);
    const scoreMatch = frontmatter.match(/^mood_score:\s*(\d+)$/m);
    if (!moodMatch) return null;
    return {
      mood: moodMatch[1].trim(),
      mood_score: scoreMatch ? parseInt(scoreMatch[1], 10) : null,
    };
  }
}

function buildDiaryEntry({ timeString, title, body }) {
  const heading = title ? `## ${timeString} ${String(title).trim()}` : `## ${timeString}`;
  return `${heading}\n\n${body}`;
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

module.exports = {
  DiaryService,
  buildDiaryEntry,
  formatDate,
  formatTime,
};
