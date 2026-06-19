/**
 * Manages a single commute quiz session.
 * One session = one commute window.
 */

class KnowledgeQuizSession {
  constructor() {
    this.active = false;
    this.startedAt = null;
    this.estimatedDurationMin = 15;
    this.currentItem = null;
    this.currentItemStartedAt = null;
    this.history = []; // { itemId, userAnswer, correct, timestamp }
    this.category = "";
  }

  /**
   * Start a new session.
   */
  start({ estimatedMinutes = 15, category = "" } = {}) {
    this.active = true;
    this.startedAt = new Date().toISOString();
    this.estimatedDurationMin = Math.max(1, Math.min(120, Number(estimatedMinutes) || 15));
    this.category = category || "";
    this.history = [];
    this.currentItem = null;
    this.currentItemStartedAt = null;
  }

  /**
   * End the session and return a summary.
   */
  end() {
    const summary = this.summary();
    this.active = false;
    this.currentItem = null;
    this.currentItemStartedAt = null;
    return summary;
  }

  /**
   * Check if the session has exceeded its estimated time.
   */
  isTimeUp() {
    if (!this.startedAt) return false;
    const elapsedMin = (Date.now() - new Date(this.startedAt).getTime()) / 60000;
    return elapsedMin >= this.estimatedDurationMin;
  }

  /**
   * Set the current quiz item and track when it was asked.
   */
  setCurrentItem(item) {
    this.currentItem = item;
    this.currentItemStartedAt = new Date().toISOString();
  }

  /**
   * Record an answer in session history.
   */
  recordAnswer({ itemId = "", userAnswer = "", correct = false, explanation = "" } = {}) {
    this.history.push({
      itemId,
      userAnswer: String(userAnswer || "").trim(),
      correct,
      explanation,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Get elapsed time in seconds since the current item was asked.
   */
  elapsedSinceCurrentItem() {
    if (!this.currentItemStartedAt) return 0;
    return Math.round((Date.now() - new Date(this.currentItemStartedAt).getTime()) / 1000);
  }

  /**
   * Generate session summary.
   */
  summary() {
    const total = this.history.length;
    const correct = this.history.filter((h) => h.correct).length;
    const durationSec = this.startedAt
      ? Math.round((Date.now() - new Date(this.startedAt).getTime()) / 1000)
      : 0;
    const durationMin = Math.round(durationSec / 60);

    return {
      totalQuestions: total,
      correctCount: correct,
      wrongCount: total - correct,
      correctRate: total > 0 ? Math.round((correct / total) * 100) : 0,
      durationMinutes: durationMin,
      history: this.history,
    };
  }
}

module.exports = { KnowledgeQuizSession };
