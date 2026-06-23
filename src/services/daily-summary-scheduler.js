const fs = require("fs");
const path = require("path");
const os = require("os");

/**
 * Lightweight scheduler for daily summary generation.
 *
 * Since Cyberboss runs inside Claude Code sessions (not a persistent daemon),
 * the scheduler is designed to:
 * 1. Track the last summary generation time
 * 2. Tell the model whether it's time to generate a summary
 * 3. Queue system messages that prompt the model to call the daily_summary tool
 *
 * The actual "trigger" happens when:
 * - The checkin poller wakes up the model near 21:00 → model sees system message
 * - The user says "收工了" → model detects keyword → calls daily_summary generate
 * - The user manually sends "/summary" → WeChat command routes to tool
 */
class DailySummaryScheduler {
  constructor({ config }) {
    this.config = config;
    this.stateFile = path.join(
      config.stateDir || path.join(os.homedir(), ".cyberboss"),
      "daily-summary-state.json"
    );
  }

  /**
   * Check whether a daily summary should be generated now.
   * Returns { shouldGenerate, reason, lastGeneratedAt }
   */
  shouldGenerateNow() {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const today = formatDate(now);
    const state = this._readState();

    // Already generated today?
    if (state.lastGeneratedDate === today) {
      return {
        shouldGenerate: false,
        reason: `Summary already generated today at ${state.lastGeneratedAt}`,
        lastGeneratedAt: state.lastGeneratedAt,
      };
    }

    // v0.3.3 fix: narrow auto-trigger window from 20:00→21:30 start
    // Reason: 20:00 is too early — user's day is often still ongoing (家教/晚课/复习)
    // The 22:57 cron remains the definitive trigger; checkin window starts at 21:30
    // to avoid premature generation that misses evening activities.
    const autoWindowStartHour = 21;
    const autoWindowStartMinute = 30;

    // Time window: 21:30 - 23:59 (auto window)
    if (hour > autoWindowStartHour || (hour === autoWindowStartHour && minute >= autoWindowStartMinute)) {
      if (hour < 24) {
        return {
          shouldGenerate: true,
          reason: `Within auto-generation window (21:30-23:59), current time: ${hour}:${String(minute).padStart(2, "0")}`,
          lastGeneratedAt: null,
        };
      }
    }

    // Early evening grace: 20:00-21:29 — check but recommend waiting
    if (hour === 20 || (hour === autoWindowStartHour && minute < autoWindowStartMinute)) {
      return {
        shouldGenerate: false,
        reason: `Early evening (${hour}:${String(minute).padStart(2, "0")}) — wait until 21:30 for auto-generation. User may still have evening activities. Use manual trigger ("收工"/"/summary") if day is truly done.`,
        lastGeneratedAt: null,
      };
    }

    // Early: before 20:00 — only if user explicitly triggers
    if (hour < 20) {
      return {
        shouldGenerate: false,
        reason: `Before auto window (currently ${hour}:00), wait until 21:30 or user manually triggers`,
        lastGeneratedAt: null,
      };
    }

    // Late night: 00:00-05:00 — generate for previous day
    return {
      shouldGenerate: false,
      reason: `Late night (${hour}:00), summary for today can still be generated manually`,
      lastGeneratedAt: null,
    };
  }

  /**
   * Check if today is a weekly summary day (Sunday).
   */
  isWeeklySummaryDay() {
    return new Date().getDay() === 0;
  }

  /**
   * Check if today is a monthly summary day (15th).
   */
  isMonthlySummaryDay() {
    return new Date().getDate() === 15;
  }

  /**
   * Build a system message trigger text that prompts the model
   * to generate the daily summary. Includes weekly/monthly context.
   */
  buildSummaryTrigger() {
    const today = formatDate(new Date());
    const parts = [
      `Daily summary time. Today is ${today}.`,
      `Call cyberboss_daily_summary with action=generate to create the end-of-day summary.`,
      `After generating, use cyberboss_summary_screenshot to capture and send the HTML screenshot.`,
    ];
    if (this.isWeeklySummaryDay()) {
      parts.push(`Today is Sunday — after the daily summary, also call action=generate_weekly and screenshot the weekly summary with summaryType: "weekly".`);
    }
    if (this.isMonthlySummaryDay()) {
      parts.push(`Today is the 15th — after the daily summary, also call action=generate_monthly and screenshot the monthly summary with summaryType: "monthly".`);
    }
    parts.push(`After generating, briefly describe the highlights to the user in a warm, natural tone.`);
    return parts.join(" ");
  }

  /**
   * Record that a summary was generated.
   */
  markGenerated() {
    const now = new Date().toISOString();
    const today = formatDate(new Date());
    const state = this._readState();

    state.lastGeneratedDate = today;
    state.lastGeneratedAt = now;

    this._writeState(state);
    return { recorded: true, today, at: now };
  }

  /**
   * Get the current scheduler state.
   */
  getState() {
    const state = this._readState();
    const today = formatDate(new Date());
    return {
      ...state,
      today,
      generatedToday: state.lastGeneratedDate === today,
    };
  }

  // ---- private ----

  _readState() {
    try {
      if (fs.existsSync(this.stateFile)) {
        return JSON.parse(fs.readFileSync(this.stateFile, "utf8"));
      }
    } catch { /* ignore */ }
    return {
      lastGeneratedDate: null,
      lastGeneratedAt: null,
    };
  }

  _writeState(state) {
    const dir = path.dirname(this.stateFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.stateFile, JSON.stringify(state, null, 2), "utf8");
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

module.exports = { DailySummaryScheduler };
