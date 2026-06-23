const fs = require("fs");
const path = require("path");
const os = require("os");

/**
 * Task List Service — 后端任务调度表可视化/查询
 *
 * 职责：
 * 1. 查询 reminder 队列（pending/due）
 * 2. 查询 daily summary scheduler 状态
 * 3. 查询 idea refinement scheduler 状态
 * 4. 查询 cron 定时任务状态（从 scheduler state file 读取）
 *
 * 权限模型（v0.3.3）：
 * - ✅ 用户层：只读 list/status，通过 MCP tool 调用
 * - ❌ 用户层：无 cancel/reschedule 等写操作
 * - 📤 管理员操作 → 通过 cyberboss_user_feedback 上报
 */
class TaskListService {
  constructor({ config, services }) {
    this.config = config;
    this.services = services;
    this.stateDir = config.stateDir || path.join(os.homedir(), ".cyberboss");
  }

  /**
   * List all pending/running scheduled tasks.
   * Returns a structured view of the backend task queue.
   */
  async listTasks({ status = "all" } = {}) {
    const tasks = [];

    // 1. Reminder queue tasks
    const reminders = this._listReminders(status);
    tasks.push(...reminders);

    // 2. Daily summary scheduler status
    const dailySummary = this._listDailySummaryScheduler();
    if (dailySummary) tasks.push(dailySummary);

    // 3. Idea refinement scheduler status
    const ideaRefinement = this._listIdeaRefinementScheduler();
    if (ideaRefinement) tasks.push(ideaRefinement);

    // 4. Cron-based tasks (from state file)
    const cronTasks = this._listCronTasks();
    tasks.push(...cronTasks);

    // Filter by status if needed
    const filtered = status === "all"
      ? tasks
      : tasks.filter(t => t.status === status);

    // Sort by nextRunAt (earliest first)
    filtered.sort((a, b) => {
      const aTime = a.nextRunAtMs || Infinity;
      const bTime = b.nextRunAtMs || Infinity;
      return aTime - bTime;
    });

    return {
      totalCount: filtered.length,
      statusCounts: this._countByStatus(filtered),
      tasks: filtered,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Query a specific task type.
   */
  async queryTasks({ type } = {}) {
    const result = await this.listTasks();
    if (type) {
      result.tasks = result.tasks.filter(t => t.type === type);
      result.totalCount = result.tasks.length;
      result.statusCounts = this._countByStatus(result.tasks);
    }
    return result;
  }

  // ---- private: reminder tasks ----

  _listReminders(status) {
    try {
      const queue = this.services.reminder?.queue;
      if (!queue) return [];

      const now = Date.now();
      const reminders = (queue.state?.reminders || []).map(r => {
        const isDue = r.dueAtMs <= now;
        return {
          id: `reminder_${r.id.slice(0, 8)}`,
          type: "reminder",
          name: r.text.length > 40 ? r.text.slice(0, 37) + "..." : r.text,
          fullText: r.text,
          status: isDue ? "due" : "pending",
          nextRunAt: new Date(r.dueAtMs).toISOString(),
          nextRunAtMs: r.dueAtMs,
          timeUntil: formatTimeUntil(r.dueAtMs, now),
          createdAt: r.createdAt,
          accountId: r.accountId,
          senderId: r.senderId,
        };
      });

      if (status !== "all") {
        return reminders.filter(r => r.status === status);
      }
      return reminders;
    } catch {
      return [];
    }
  }

  // ---- private: daily summary scheduler ----

  _listDailySummaryScheduler() {
    try {
      const scheduler = this.services._dailyScheduler;
      if (!scheduler) return null;

      const state = scheduler.getState();
      const check = scheduler.shouldGenerateNow();

      return {
        id: "daily_summary_scheduler",
        type: "daily_summary",
        name: "日终总结自动生成",
        status: state.generatedToday ? "completed" : (check.shouldGenerate ? "due" : "pending"),
        nextRunAt: state.generatedToday ? null : this._estimateNextSummaryTime(),
        nextRunAtMs: state.generatedToday ? null : this._estimateNextSummaryTimeMs(),
        timeUntil: state.generatedToday ? "今日已完成" : (check.shouldGenerate ? "🟢 可生成" : check.reason),
        lastGeneratedAt: state.lastGeneratedAt,
        lastGeneratedDate: state.lastGeneratedDate,
        triggerWindow: "20:00-23:59 (checkin) / 22:57 (cron)",
      };
    } catch {
      return null;
    }
  }

  _estimateNextSummaryTime() {
    const now = new Date();
    const hour = now.getHours();
    // If before 20:00, next trigger is ~20:00
    // If in 20:00-23:59 window, trigger is now
    // If past 23:59, next trigger is tomorrow 20:00
    if (hour >= 20 && hour < 24) {
      return now.toISOString();
    }
    const next = new Date(now);
    if (hour >= 0 && hour < 20) {
      next.setHours(20, 0, 0, 0);
    } else {
      next.setDate(next.getDate() + 1);
      next.setHours(20, 0, 0, 0);
    }
    return next.toISOString();
  }

  _estimateNextSummaryTimeMs() {
    return new Date(this._estimateNextSummaryTime()).getTime();
  }

  // ---- private: idea refinement scheduler ----

  _listIdeaRefinementScheduler() {
    try {
      const ideaRefinement = this.services.ideaRefinement;
      if (!ideaRefinement) return null;

      const scheduler = ideaRefinement.scheduler;
      if (!scheduler) return null;

      const state = scheduler.getState ? scheduler.getState() : {};
      const hasActiveSession = !!(state.activeSessionId);

      return {
        id: "idea_refinement_scheduler",
        type: "idea_refinement",
        name: "大构思完善自动推进",
        status: hasActiveSession ? "running" : "pending",
        nextRunAt: hasActiveSession ? new Date().toISOString() : null,
        nextRunAtMs: hasActiveSession ? Date.now() : null,
        timeUntil: hasActiveSession ? `活跃会话: ${state.activeSessionId}` : "无活跃会话",
        activeSessionId: state.activeSessionId || null,
        draftCount: state.draftCount || 0,
      };
    } catch {
      return null;
    }
  }

  // ---- private: cron tasks ----

  _listCronTasks() {
    const tasks = [];

    // Read scheduler state for cron-based triggers
    try {
      const dailyStateFile = path.join(this.stateDir, "daily-summary-state.json");
      if (fs.existsSync(dailyStateFile)) {
        const dailyState = JSON.parse(fs.readFileSync(dailyStateFile, "utf8"));
        tasks.push({
          id: "cron_daily_summary_2257",
          type: "cron",
          name: "日终总结 22:57 定时触发",
          status: dailyState.lastGeneratedDate === formatDate(new Date()) ? "completed" : "pending",
          nextRunAt: this._nextCronTime(22, 57),
          nextRunAtMs: this._nextCronTimeMs(22, 57),
          timeUntil: formatTimeUntil(this._nextCronTimeMs(22, 57), Date.now()),
          schedule: "每天 22:57",
        });
      }
    } catch { /* ignore */ }

    return tasks;
  }

  _nextCronTime(hour, minute) {
    const now = new Date();
    const next = new Date(now);
    next.setHours(hour, minute, 0, 0);
    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }
    return next.toISOString();
  }

  _nextCronTimeMs(hour, minute) {
    return new Date(this._nextCronTime(hour, minute)).getTime();
  }

  _countByStatus(tasks) {
    const counts = {};
    for (const t of tasks) {
      counts[t.status] = (counts[t.status] || 0) + 1;
    }
    return counts;
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

/**
 * Format time until a timestamp in Chinese.
 */
function formatTimeUntil(targetMs, nowMs) {
  const diffMs = targetMs - nowMs;
  if (diffMs <= 0) return "已到期";

  const abs = Math.abs(diffMs);
  const hours = Math.floor(abs / 3600000);
  const minutes = Math.floor((abs % 3600000) / 60000);

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days} 天 ${hours % 24} 小时后`;
  }
  if (hours > 0) {
    return `${hours} 小时 ${minutes} 分钟后`;
  }
  if (minutes > 0) {
    return `${minutes} 分钟后`;
  }
  return "不到 1 分钟";
}

module.exports = { TaskListService };
