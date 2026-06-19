const fs = require("fs");
const path = require("path");
const os = require("os");

/**
 * Lightweight scheduler for idea refinement triggers.
 *
 * Follows the same pattern as DailySummaryScheduler:
 * 1. Track the last trigger time
 * 2. Tell the caller whether it's time to check for idea drafts
 * 3. Build system message triggers that prompt the model to call
 *    the cyberboss_idea_refinement tool
 *
 * The scheduler fires when:
 * - It's between 09:00-23:00 (daytime hours)
 * - There are pending drafts in 大构思/drafts/
 * - No active refinement session exists
 * - At least 30 minutes have passed since the last trigger
 * - The checkin poller or explicit /refine command triggers
 */
class IdeaRefinementScheduler {
  constructor({ config }) {
    this.config = config;
    this.stateFile = path.join(
      config.stateDir || path.join(os.homedir(), ".cyberboss"),
      "idea-refinement-state.json"
    );
  }

  /**
   * Check whether it's time to trigger idea refinement.
   */
  shouldRunNow({ draftCount = 0, activeSessionCount = 0 } = {}) {
    const now = new Date();
    const hour = now.getHours();
    const state = this._readState();

    // Only during daytime hours (09:00-23:00)
    if (hour < 9 || hour >= 23) {
      return {
        shouldRun: false,
        reason: `Outside active hours (09:00-23:00), current hour: ${hour}`,
        lastTriggeredAt: state.lastTriggeredAt,
      };
    }

    // Need at least one pending draft
    if (draftCount === 0) {
      return {
        shouldRun: false,
        reason: "No pending drafts in 大构思/drafts/",
        lastTriggeredAt: state.lastTriggeredAt,
      };
    }

    // Don't interrupt an active session
    if (activeSessionCount > 0) {
      return {
        shouldRun: false,
        reason: `Active refinement session in progress (${activeSessionCount} session(s))`,
        lastTriggeredAt: state.lastTriggeredAt,
      };
    }

    // Minimum 30 minutes between triggers
    if (state.lastTriggeredAt) {
      const lastTrigger = new Date(state.lastTriggeredAt);
      const elapsedMs = now.getTime() - lastTrigger.getTime();
      const minIntervalMs = 30 * 60 * 1000; // 30 minutes
      if (elapsedMs < minIntervalMs) {
        const remainingMin = Math.ceil((minIntervalMs - elapsedMs) / 60000);
        return {
          shouldRun: false,
          reason: `Too soon since last trigger (${remainingMin}min remaining)`,
          lastTriggeredAt: state.lastTriggeredAt,
        };
      }
    }

    return {
      shouldRun: true,
      reason: `${draftCount} pending draft(s), within active hours, no active session`,
      lastTriggeredAt: state.lastTriggeredAt,
    };
  }

  /**
   * Build a system message trigger text that prompts the model
   * to scan for idea drafts and start refinement.
   */
  buildTrigger() {
    return [
      "Idea refinement check.",
      "Call cyberboss_idea_refinement with action=scan_drafts to check for pending idea drafts in 大构思/drafts/.",
      "If drafts are found, ask the user whether they'd like to refine one now.",
      "If they say yes, call action=start_session with the draftFile.",
      "Then proceed through the Socratic question loop: present one question at a time, wait for the answer, call submit_answer, then next_question for the next turn.",
      "When the user is satisfied or the engine says stop, call action=stop_session.",
    ].join(" ");
  }

  /**
   * Record that a trigger was fired.
   */
  markTriggered() {
    const state = this._readState();
    state.lastTriggeredAt = new Date().toISOString();
    this._writeState(state);
    return { recorded: true, at: state.lastTriggeredAt };
  }

  /**
   * Get current scheduler state.
   */
  getState() {
    return this._readState();
  }

  // ---- private ----

  _readState() {
    try {
      if (fs.existsSync(this.stateFile)) {
        return JSON.parse(fs.readFileSync(this.stateFile, "utf8"));
      }
    } catch { /* ignore */ }
    return {
      lastTriggeredAt: null,
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

module.exports = { IdeaRefinementScheduler };
