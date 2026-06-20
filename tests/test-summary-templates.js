/**
 * Test script: Generate weekly/monthly summary HTML with dense simulated data.
 * Does NOT pollute the Obsidian vault — uses a temp directory for state.
 *
 * Usage: node tests/test-summary-templates.js
 * Output: tests/output/weekly-summary-test.html
 *         tests/output/monthly-summary-test.html
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

// ---- Setup: redirect to temp dir ----
const TEST_HOME = path.join(__dirname, "output", "cyberboss-test-home");
const TEST_STATE_DIR = path.join(TEST_HOME, "state");
const TEST_VAULT_DIR = path.join(TEST_HOME, "vault");
const DAILY_SUMMARIES_DIR = path.join(TEST_STATE_DIR, "daily-summaries");
const OUTPUT_DIR = path.join(__dirname, "output");

// Clean and recreate
if (fs.existsSync(TEST_HOME)) fs.rmSync(TEST_HOME, { recursive: true });
fs.mkdirSync(DAILY_SUMMARIES_DIR, { recursive: true });
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// Override env so DailySummaryService writes to test dir
process.env.CYBERBOSS_HOME = path.join(__dirname, "..");
process.env.CYBERBOSS_OBSIDIAN_VAULT = TEST_VAULT_DIR;
fs.mkdirSync(TEST_VAULT_DIR, { recursive: true });

// ---- Import the service ----
const { DailySummaryService } = require("../src/services/daily-summary-service");

// Mock config and services
const config = {
  stateDir: TEST_STATE_DIR,
  diaryDir: path.join(TEST_HOME, "diary"),
  reminderQueueFile: path.join(TEST_HOME, "reminders.json"),
};

// Mock services that weekly/monthly aggregation uses indirectly
const mockTimeline = {
  read: async () => ({ data: { exists: true, events: [] } }),
};

const mockKnowledge = {
  getStats: () => ({ totalAnswers: 0, overallCorrectRate: 0 }),
  getIndex: () => ({ items: [] }),
};

const mockFlashMemory = {
  getStats: () => ({ total: 0, inbox: 0, todayCaptured: 0 }),
  list: () => ({ items: [] }),
};

const services = {
  timeline: mockTimeline,
  knowledge: mockKnowledge,
  flashMemory: mockFlashMemory,
};

const svc = new DailySummaryService({ config, services });

// ---- Synthetic data generators ----

/**
 * Build a realistic _data.json content for a single day.
 * @param {string} dateLabel - YYYY-MM-DD
 * @param {number} dayIndex - 0-based index within the period
 * @param {number} totalDays - total days in the period
 * @returns {object} summary data matching DailySummaryService output shape
 */
function buildFakeDailyData(dateLabel, dayIndex, totalDays) {
  // Simulate weekday/weekend patterns
  const d = new Date(dateLabel + "T12:00:00+08:00");
  const dayOfWeek = d.getDay(); // 0=Sun, 6=Sat
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  // Event count: weekdays busy (~8-15 events), weekends lighter (~3-6)
  const baseEvents = isWeekend ? 5 : 12;
  const variance = Math.round((Math.sin(dayIndex * 1.7) + Math.cos(dayIndex * 0.9)) * 3);
  const eventCount = Math.max(2, baseEvents + variance);

  // Tracked minutes: weekdays ~300-600, weekends ~60-200
  const baseMinutes = isWeekend ? 120 : 480;
  const minuteVariance = Math.round((Math.sin(dayIndex * 0.8) * 120));
  const totalTrackedMinutes = Math.max(30, baseMinutes + minuteVariance);

  // Diary entries: 0-3 per day
  const diaryEntryCount = Math.max(0, Math.round(Math.random() * 3 + (isWeekend ? -1 : 0)));

  // Flash items: 0-5 per day
  const flashTodayCount = Math.max(0, Math.round(Math.random() * 4 + (isWeekend ? 1 : 0)));

  // Quiz questions: 0-8 per day (more on weekdays = commute)
  const quizTodayCount = isWeekend ? Math.round(Math.random() * 2) : Math.round(Math.random() * 6 + 2);
  const quizCorrectRate = 50 + Math.round(Math.random() * 50);

  // Tasks: 0-4 completed, 0-3 pending
  const taskCompletedCount = Math.round(Math.random() * 4);
  const taskPendingCount = Math.round(Math.random() * 3);

  // Ideas: 0-2 drafts touched
  const ideaDraftCount = dayIndex % 5 === 0 ? 2 : (dayIndex % 3 === 0 ? 1 : 0);

  // Moods that rotate through the week
  const moodCycle = ["充实", "开心", "平静", "焦虑", "兴奋", "疲惫", "一般"];
  const dailyMood = moodCycle[dayIndex % moodCycle.length];
  const moodScoreMap = { "开心": 5, "兴奋": 5, "充实": 4, "平静": 3, "一般": 3, "焦虑": 2, "疲惫": 2, "烦躁": 1, "低落": 1 };
  const dailyMoodScore = moodScoreMap[dailyMood];

  // Build sections
  const sections = {
    timeline: {
      exists: true,
      eventCount,
      totalMinutes: totalTrackedMinutes,
      categorized: [],
      events: [],
    },
    diary: {
      exists: diaryEntryCount > 0,
      entryCount: diaryEntryCount,
      entries: [],
      rawText: "",
      mood: { mood: dailyMood, mood_score: dailyMoodScore },
    },
    flash: {
      total: 45 + flashTodayCount,
      inboxCount: 5 + Math.round(Math.random() * 5),
      todayCount: flashTodayCount,
      todayItems: Array.from({ length: flashTodayCount }, (_, i) => {
        const texts = [
          "用 LLM 做个人知识图谱的自动构建",
          "把每日总结的时间热力图改成日历视图",
          "给 Cyberboss 加一个喝水提醒功能",
          "周末想去看《沙丘3》",
          "应该把闪存按情绪自动聚类到 Obsidian",
          "通勤刷题能不能加个错题本模式",
          "感觉到周总结比日总结更有洞察价值",
          "考虑把 vault 搬到 iCloud 同步",
          "在 timeline 上加一个本周目标进度条",
          "大构思的追问能不能用语音回答",
        ];
        const moods = ["excited", "curious", "determined", "playful", "anxious"];
        const categories = ["idea", "dev", "life", "todo", "learning"];
        return {
          id: `fm_${dateLabel}_00${i + 1}`,
          rawText: texts[(dayIndex + i) % texts.length],
          cleanedText: texts[(dayIndex + i) % texts.length],
          category: categories[(dayIndex + i) % categories.length],
          mood: moods[(dayIndex + i) % moods.length],
          tags: [["AI", "知识图谱"], ["前端", "可视化"], ["生活", "健康"], ["娱乐", "电影"], ["工具", "效率"]][(dayIndex + i) % 5],
        };
      }),
      byMood: {
        excited: Math.round(Math.random() * 2),
        curious: Math.round(Math.random() * 2),
        determined: Math.round(Math.random() * 1),
        playful: Math.round(Math.random() * 1),
        anxious: Math.round(Math.random() * 1),
      },
      byCategory: {
        idea: Math.round(flashTodayCount * 0.4),
        dev: Math.round(flashTodayCount * 0.3),
        life: Math.round(flashTodayCount * 0.2),
        todo: Math.round(flashTodayCount * 0.1),
      },
    },
    flashQa: { qaCount: 0, qaItems: [] },
    capsules: { capsuleCount: dayIndex % 3 === 0 ? 2 : 0, capsules: [] },
    quiz: {
      exists: quizTodayCount > 0,
      overallTotalAnswers: 120 + quizTodayCount,
      overallCorrectRate: 0.72,
      todayCount: quizTodayCount,
      todayCorrect: Math.round(quizTodayCount * quizCorrectRate / 100),
      todayTotal: quizTodayCount,
      todayCorrectRate: quizCorrectRate,
      todayRecords: Array.from({ length: Math.min(quizTodayCount, 5) }, (_, i) => {
        const topics = ["能带理论", "PN结", "费米能级", "肖特基接触", "MOSFET阈值电压", "中断优先级", "ADC采样", "SPI时序", "I2C仲裁", "看门狗"];
        return {
          itemId: `quiz_${(dayIndex * 10 + i) % 21}`,
          title: topics[(dayIndex + i) % topics.length],
          category: i % 3 === 0 ? "单片机原理与应用" : "半导体物理",
          lastAnsweredAt: `${dateLabel}T08:${String(15 + i * 5).padStart(2, "0")}:00+08:00`,
          attemptCount: 1,
          correctCount: Math.random() > 0.3 ? 1 : 0,
        };
      }),
    },
    tasks: {
      completed: Array.from({ length: taskCompletedCount }, (_, i) => ({
        id: `task_${dateLabel}_${i}`,
        text: ["写完 v0.3.0 周总结模板", "修了 Timeline 重叠 bug", "跑完 npm run check", "整理闪存到分类归档", "写完大构思第3轮"][i % 5],
      })),
      pending: Array.from({ length: taskPendingCount }, (_, i) => ({
        id: `task_pending_${dateLabel}_${i}`,
        text: ["重构 screenshot service", "给知识库加10道题", "修 README 里的 typo"][i % 3],
      })),
      completedCount: taskCompletedCount,
      pendingCount: taskPendingCount,
    },
    ideas: {
      draftCount: ideaDraftCount,
      drafts: ideaDraftCount > 0 ? [
        { title: "爱是虚拟的", status: "completed", refinedLink: "[[爱是虚拟的-20260620-完善]]", lastModified: dateLabel },
        { title: "沉没意志", status: "in_progress", refinedLink: null, lastModified: dateLabel },
      ].slice(0, ideaDraftCount) : [],
      activeSessions: ideaDraftCount > 0 ? 1 : 0,
      completedSessions: ideaDraftCount > 1 ? 1 : 0,
      refinedCount: 2,
    },
  };

  const stats = {
    eventCount,
    totalTrackedMinutes,
    diaryEntryCount,
    flashTodayCount,
    flashInboxCount: 8,
    flashQaCount: 0,
    capsuleCount: dayIndex % 3 === 0 ? 2 : 0,
    quizTodayCount,
    quizCorrectRate,
    taskCompletedCount,
    taskPendingCount,
    ideaDraftCount,
    ideaActiveSessions: ideaDraftCount > 0 ? 1 : 0,
    ideaCompletedSessions: ideaDraftCount > 1 ? 1 : 0,
    ideaRefinedCount: 2,
    dailyMood,
    dailyMoodScore,
  };

  return {
    date: dateLabel,
    generatedAt: `${dateLabel}T22:30:00+08:00`,
    format: "full",
    sections,
    stats,
  };
}

/**
 * Write _data.json to the state dir so the service can find it.
 */
function writeFakeDailyData(dateLabel, dayIndex, totalDays) {
  const data = buildFakeDailyData(dateLabel, dayIndex, totalDays);
  const weekday = getDayOfWeekChinese(dateLabel);
  const readableName = `${dateLabel}-${weekday}-日终总结`;
  const dir = path.join(DAILY_SUMMARIES_DIR, dateLabel);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${readableName}_data.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
  return data;
}

function getDayOfWeekChinese(dateStr) {
  const parts = String(dateStr || "").split("-");
  if (parts.length !== 3) return "";
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if (Number.isNaN(d.getTime())) return "";
  const days = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return days[d.getDay()];
}

// ---- Generate test data for a full week ----
console.log("=== Generating weekly test data ===");
const now = new Date();
// Find the most recent Monday
const dayOfWeek = now.getDay();
const monday = new Date(now);
monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
monday.setHours(0, 0, 0, 0);

for (let i = 0; i < 7; i++) {
  const d = new Date(monday);
  d.setDate(monday.getDate() + i);
  const dateLabel = formatDate(d);
  const dayData = writeFakeDailyData(dateLabel, i, 7);
  console.log(`  ${dateLabel} (${getDayOfWeekChinese(dateLabel)}): ${dayData.stats.eventCount} events, ${Math.round(dayData.stats.totalTrackedMinutes / 60)}h, ${dayData.stats.flashTodayCount} flashes, ${dayData.stats.quizTodayCount} quizzes, mood=${dayData.stats.dailyMood}`);
}

// ---- Generate test data for a full month ----
console.log("\n=== Generating monthly test data ===");
const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
const totalMonthDays = monthEnd.getDate();
const todayDate = now.getDate();

for (let d = 1; d <= todayDate; d++) {
  const date = new Date(now.getFullYear(), now.getMonth(), d);
  const dateLabel = formatDate(date);
  if (fs.existsSync(path.join(DAILY_SUMMARIES_DIR, dateLabel))) {
    // Already generated as part of weekly data
    continue;
  }
  const dayIndex = d - 1;
  const dayData = writeFakeDailyData(dateLabel, dayIndex, totalMonthDays);
  if (d % 5 === 1 || d === todayDate) {
    console.log(`  ${dateLabel} (${getDayOfWeekChinese(dateLabel)}): ${dayData.stats.eventCount} events, ${Math.round(dayData.stats.totalTrackedMinutes / 60)}h`);
  }
}
console.log(`  ... and ${todayDate - Math.ceil(todayDate / 5)} more days (see data files for details)`);

// ---- Generate Weekly Summary ----
(async () => {
console.log("\n=== Generating weekly summary ===");
const weekResult = await svc.generateWeeklySummary({ date: formatDate(now) });
console.log(`  Week: ${weekResult.weekLabel}`);
console.log(`  Date range: ${weekResult.dateRange}`);
console.log(`  Days with data: ${weekResult.dailyCount}/7`);
console.log(`  Stats: ${weekResult.stats.eventCount} events, ${weekResult.stats.trackedHours}h, ${weekResult.stats.flashCount} flashes, ${weekResult.stats.quizCount} quizzes`);
console.log(`  HTML size: ${weekResult.htmlContent.length} chars`);

// Save weekly HTML to test output
const weeklyOutputPath = path.join(OUTPUT_DIR, "weekly-summary-test.html");
fs.writeFileSync(weeklyOutputPath, weekResult.htmlContent, "utf8");
console.log(`  Saved: ${weeklyOutputPath}`);

// ---- Generate Monthly Summary ----
console.log("\n=== Generating monthly summary ===");
const monthResult = await svc.generateMonthlySummary({ date: formatDate(now) });
console.log(`  Month: ${monthResult.monthLabel}`);
console.log(`  Days with data: ${monthResult.dailyCount}`);
console.log(`  Stats: ${monthResult.stats.eventCount} events, ${monthResult.stats.trackedHours}h, ${monthResult.stats.flashCount} flashes, ${monthResult.stats.quizCount} quizzes`);
console.log(`  HTML size: ${monthResult.htmlContent.length} chars`);

// Save monthly HTML to test output
const monthlyOutputPath = path.join(OUTPUT_DIR, "monthly-summary-test.html");
fs.writeFileSync(monthlyOutputPath, monthResult.htmlContent, "utf8");
console.log(`  Saved: ${monthlyOutputPath}`);

// ---- Generate Daily Summary (new unified template) ----
console.log("\n=== Generating daily summary (unified template) ===");
const todayLabel = formatDate(now);
const todayData = buildFakeDailyData(todayLabel, (now.getDay() + 6) % 7, 7);
// Add extra events for a richer timeline
const timelineHours = [
  { s: "07:30", e: "08:30", t: "起床 · 洗漱 · 早餐", cat: "life", dur: "60" },
  { s: "08:30", e: "09:00", t: "通勤 · 地铁刷题", cat: "travel", dur: "30" },
  { s: "09:00", e: "09:30", t: "站会 · 今日计划整理", cat: "work", dur: "30" },
  { s: "09:30", e: "12:00", t: "写 Cyberboss v0.3.2 触发修复", cat: "work", dur: "150" },
  { s: "12:00", e: "12:30", t: "午餐 · 食堂", cat: "life", dur: "30" },
  { s: "12:30", e: "13:00", t: "午休 · 刷微博", cat: "rest", dur: "30" },
  { s: "13:00", e: "14:30", t: "Timeline 显示修复 · vis-item 样式调试", cat: "work", dur: "90" },
  { s: "14:30", e: "15:00", t: "用户反馈 MCP Tool 功能测试", cat: "work", dur: "30" },
  { s: "15:00", e: "15:30", t: "周/月总结模板布局修复", cat: "work", dur: "30" },
  { s: "15:30", e: "16:00", t: "截图 · 微信发送测试 · 限流排查", cat: "work", dur: "30" },
  { s: "16:00", e: "17:00", t: "README 完整重写 v0.3.2", cat: "work", dur: "60" },
  { s: "17:00", e: "17:30", t: "Git commit + tag v0.3.2 + push", cat: "work", dur: "30" },
  { s: "17:30", e: "18:00", t: "通勤回家", cat: "travel", dur: "30" },
  { s: "18:00", e: "19:00", t: "晚餐 · 看新闻", cat: "life", dur: "60" },
  { s: "19:00", e: "20:00", t: "休息 · 刷 B 站", cat: "rest", dur: "60" },
  { s: "20:00", e: "21:00", t: "闪存整理 · Obsidian 图谱检查", cat: "life", dur: "60" },
  { s: "21:00", e: "21:30", t: "日终总结生成 · 情绪快照", cat: "life", dur: "30" },
  { s: "21:30", e: "22:00", t: "小而美收拢计划构思", cat: "work", dur: "30" },
];
const richEvents = timelineHours.map((h) => ({
  startAt: `${todayLabel}T${h.s}:00+08:00`,
  endAt: `${todayLabel}T${h.e}:00+08:00`,
  title: h.t,
  _durationMinutes: parseInt(h.dur),
  categoryId: h.cat,
}));

const dailyData = {
  date: todayLabel,
  generatedAt: new Date().toISOString(),
  format: "full",
  sections: {
    timeline: { exists: true, eventCount: richEvents.length, totalMinutes: richEvents.reduce((s, e) => s + (e._durationMinutes || 0), 0), categorized: [], events: richEvents },
    diary: { exists: true, entryCount: 2, entries: [{ time: "22:00", title: "收工", body: "今天完成了 v0.3.2，系统越来越稳了。小而美收拢计划写了一半，明天继续。" }, { time: "08:30", title: "通勤", body: "地铁上刷了 3 题半导体物理，PN 结那题还是不太熟。" }], rawText: "", mood: { mood: "充实", mood_score: 4 } },
    flash: { total: 50, inboxCount: 8, todayCount: 5, todayItems: [{ id: "fm_test_1", rawText: "把日/周/月总结模板统一成一个设计语言", category: "dev", mood: "determined", tags: ["前端", "设计"] }, { id: "fm_test_2", rawText: "周总结缺 timeline 聚合——下周补上", category: "todo", mood: "curious", tags: ["后端"] }, { id: "fm_test_3", rawText: "小而美不是少功能，是把功能做到刚好", category: "idea", mood: "excited", tags: ["产品"] }, { id: "fm_test_4", rawText: "用 Playwright 批量截图对比设计一致性", category: "dev", mood: "determined", tags: ["测试", "自动化"] }, { id: "fm_test_5", rawText: "以后每个版本都要跑一次全模板测试", category: "todo", mood: "determined", tags: ["流程"] }], byMood: { excited: 1, determined: 3, curious: 1 }, byCategory: { dev: 2, todo: 2, idea: 1 } },
    flashQa: { qaCount: 2, qaItems: [{ id: "fm_test_1", original: "把日/周/月总结模板统一成一个设计语言", exchanges: [{ q: "你打算从哪个模板开始统一？", a: "日总结最复杂，先把它拉平到周/月的简洁结构。" }, { q: "怎么验证统一后的效果？", a: "跑个满数据的测试，三个 HTML 放一起对比看。" }] }] },
    capsules: { capsuleCount: 1, capsules: [{ theme: "模板统一 · 设计系统", summary: "日/周/月总结 + 每日时间轴 → 统一纸纹设计语言", linkedCount: 3, itemIds: ["fm_test_1", "fm_test_4", "fm_test_5"] }] },
    quiz: { exists: true, overallTotalAnswers: 135, overallCorrectRate: 0.73, todayCount: 5, todayCorrect: 4, todayTotal: 5, todayCorrectRate: 80, todayRecords: [{ itemId: "quiz_0", title: "PN结", category: "半导体物理" }, { itemId: "quiz_1", title: "费米能级", category: "半导体物理" }, { itemId: "quiz_3", title: "肖特基接触", category: "半导体物理" }, { itemId: "quiz_10", title: "中断优先级", category: "单片机原理与应用" }, { itemId: "quiz_11", title: "SPI时序", category: "单片机原理与应用" }] },
    tasks: { completed: [{ id: "t1", text: "写完 v0.3.2 触发修复" }, { id: "t2", text: "修了 Timeline 重叠 bug" }, { id: "t3", text: "跑完 npm run check" }, { id: "t4", text: "README 重写" }], pending: [{ id: "p1", text: "小而美收拢计划写完" }, { id: "p2", text: "模板 CSS 变量统一" }], completedCount: 4, pendingCount: 2 },
    ideas: { draftCount: 2, drafts: [{ title: "爱是虚拟的", status: "completed", refinedLink: "[[爱是虚拟的-20260620-完善]]", lastModified: todayLabel }, { title: "沉没意志", status: "in_progress", refinedLink: null, lastModified: todayLabel }], activeSessions: 1, completedSessions: 1, refinedCount: 2 },
  },
  stats: { eventCount: richEvents.length, totalTrackedMinutes: richEvents.reduce((s, e) => s + (e._durationMinutes || 0), 0), diaryEntryCount: 2, flashTodayCount: 5, flashInboxCount: 8, flashQaCount: 2, capsuleCount: 1, quizTodayCount: 5, quizCorrectRate: 80, taskCompletedCount: 4, taskPendingCount: 2, ideaDraftCount: 2, ideaActiveSessions: 1, ideaCompletedSessions: 1, ideaRefinedCount: 2, dailyMood: "充实", dailyMoodScore: 4 },
};

const dailyHtml = svc.buildHtml(dailyData);
const dailyOutputPath = path.join(OUTPUT_DIR, "daily-summary-test.html");
fs.writeFileSync(dailyOutputPath, dailyHtml, "utf8");
console.log(`  Stats: ${dailyData.stats.eventCount} events, ${Math.round(dailyData.stats.totalTrackedMinutes / 60)}h, ${dailyData.stats.flashTodayCount} flashes`);
console.log(`  HTML size: ${dailyHtml.length} chars`);
console.log(`  Saved: ${dailyOutputPath}`);

// ---- Generate Daily Timeline (new unified template) ----
console.log("\n=== Generating daily timeline (unified template) ===");
const tlTemplate = fs.readFileSync(path.join(__dirname, "..", "templates", "daily-timeline.html"), "utf8");
const weekday = getDayOfWeekChinese(todayLabel);
const catColors = {
  work: { bg: "#1a5dc4", name: "工作" },
  life: { bg: "#d4920b", name: "生活" },
  study: { bg: "#2d8c3c", name: "学习" },
  travel: { bg: "#c7451a", name: "通勤" },
  rest: { bg: "#7b5ea7", name: "休息" },
};
const catTotals = {};
for (const e of richEvents) {
  const cat = e.categoryId || "other";
  catTotals[cat] = (catTotals[cat] || 0) + (e._durationMinutes || 0);
}
const totalMin = Object.values(catTotals).reduce((s, v) => s + v, 0) || 1;
const catSegments = Object.entries(catTotals).map(([cat, min]) => {
  const pct = Math.round((min / totalMin) * 100);
  const c = catColors[cat] || { bg: "#999", name: cat };
  return `<div class="cat-bar-seg" style="width:${pct}%;background:${c.bg}" title="${c.name}: ${Math.round(min / 60)}h"></div>`;
}).join("");
const catLegend = Object.entries(catTotals).map(([cat, min]) => {
  const c = catColors[cat] || { bg: "#999", name: cat };
  return `<span class="cat-legend-item"><span class="cat-legend-dot" style="background:${c.bg}"></span>${c.name} ${Math.round(min / 60)}h</span>`;
}).join("");
const eventItems = richEvents.map((e) => {
  const cat = e.categoryId || "other";
  const durMin = e._durationMinutes || 0;
  const durStr = durMin >= 60 ? `${Math.round(durMin / 60)}h${durMin % 60 ? durMin % 60 + "m" : ""}` : `${durMin}分钟`;
  const note = ["写 Cyberboss v0.3.2 触发修复", "Timeline 显示修复", "用户反馈 MCP Tool 功能测试"].some((k) => e.title.includes(k.replace("写 ", "").replace("修复", "").slice(0, 6))) ? "专注编程" : "";
  const startTime = e.startAt ? e.startAt.slice(11, 16) : "??:??";
  const endTime = e.endAt ? e.endAt.slice(11, 16) : "??:??";
  return `<div class="tl-item"><div class="tl-dot cat-${cat}"></div><div class="tl-body"><div class="tl-header"><span class="tl-time">${startTime} - ${endTime}</span><span class="tl-dur">${durStr}</span></div><div class="tl-title">${e.title}</div>${note ? `<div class="tl-note">${note}</div>` : ""}<span class="tl-cat-tag" style="background:${(catColors[cat] || { bg: "#eee" }).bg}20;color:${(catColors[cat] || { bg: "#999" }).bg}">${(catColors[cat] || { name: cat }).name}</span></div></div>`;
}).join("");

let tlHtml = tlTemplate
  .split("{{date}}").join(todayLabel)
  .split("{{dateLabel}}").join(`${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`)
  .split("{{weekday}}").join(weekday)
  .split("{{eventCount}}").join(String(richEvents.length))
  .split("{{totalHours}}").join(String(Math.round(totalMin / 60)))
  .split("{{categoryCount}}").join(String(Object.keys(catTotals).length))
  .split("{{avgEvent}}").join(String(Math.round(totalMin / richEvents.length)))
  .split("{{catSegments}}").join(catSegments)
  .split("{{catLegend}}").join(catLegend)
  .split("{{eventItems}}").join(eventItems);

// Clean up section wrapper tags (catBar always shown when we have data)
tlHtml = tlHtml.replace(/\{\{#catBar\}\}/g, "").replace(/\{\{\/catBar\}\}/g, "");

const tlOutputPath = path.join(OUTPUT_DIR, "daily-timeline-test.html");
fs.writeFileSync(tlOutputPath, tlHtml, "utf8");
console.log(`  Events: ${richEvents.length}, Categories: ${Object.keys(catTotals).length}, Total: ${Math.round(totalMin / 60)}h`);
console.log(`  HTML size: ${tlHtml.length} chars`);
console.log(`  Saved: ${tlOutputPath}`);

// ---- Verification ----
console.log("\n=== Verification ===");
console.log(`  Daily Summary HTML: ${fs.existsSync(dailyOutputPath) ? "✓" : "✗"} (${fs.statSync(dailyOutputPath).size} bytes)`);
console.log(`  Daily Timeline HTML: ${fs.existsSync(tlOutputPath) ? "✓" : "✗"} (${fs.statSync(tlOutputPath).size} bytes)`);
console.log(`  Weekly HTML: ${fs.existsSync(weeklyOutputPath) ? "✓" : "✗"} (${fs.statSync(weeklyOutputPath).size} bytes)`);
console.log(`  Monthly HTML: ${fs.existsSync(monthlyOutputPath) ? "✓" : "✗"} (${fs.statSync(monthlyOutputPath).size} bytes)`);
console.log(`  Vault untouched: ${fs.readdirSync(TEST_VAULT_DIR).length <= 1 ? "✓" : "⚠ (files found in test vault)"}`);

// Quick content checks
const weeklyContent = fs.readFileSync(weeklyOutputPath, "utf8");
const monthlyContent = fs.readFileSync(monthlyOutputPath, "utf8");
const dailyContent = fs.readFileSync(dailyOutputPath, "utf8");
const tlContent = fs.readFileSync(tlOutputPath, "utf8");

const weeklyChecks = [
  ["Has DOCTYPE", /^<!DOCTYPE html>/.test(weeklyContent)],
  ["Has hero title", weeklyContent.includes("周总结")],
  ["Has stat grid", weeklyContent.includes("stat-grid")],
  ["Has mood section", weeklyContent.includes("情绪光谱")],
  ["Has flash section", weeklyContent.includes("闪存亮点")],
  ["Has quiz section", weeklyContent.includes("学习进展")],
  ["No empty template tags", !/\{\{[#^/]\w+\}\}/.test(weeklyContent)],
  ["Has footer", weeklyContent.includes("Cyberboss")],
];

const monthlyChecks = [
  ["Has DOCTYPE", /^<!DOCTYPE html>/.test(monthlyContent)],
  ["Has hero title", monthlyContent.includes("月总结")],
  ["Has heatmap", monthlyContent.includes("heatmap")],
  ["Has mood section", monthlyContent.includes("情绪趋势")],
  ["Has quiz section", monthlyContent.includes("知识积累")],
  ["Has idea section", monthlyContent.includes("大构思进展")],
  ["Has flash section", monthlyContent.includes("闪存精选")],
  ["No empty template tags", !/\{\{[#^/]\w+\}\}/.test(monthlyContent)],
  ["Has footer", monthlyContent.includes("Cyberboss")],
];

const dailyChecks = [
  ["Has DOCTYPE", /^<!DOCTYPE html>/.test(dailyContent)],
  ["Has hero title", dailyContent.includes("日终总结")],
  ["Has stat grid", dailyContent.includes("stat-grid")],
  ["Has timeline section", dailyContent.includes("时间轨迹")],
  ["Has flash Q&A section", dailyContent.includes("记忆碎片问答")],
  ["Has capsule section", dailyContent.includes("记忆胶囊")],
  ["Has flash section", dailyContent.includes("今日灵感")],
  ["Has task section", dailyContent.includes("完成事项")],
  ["Has diary section", dailyContent.includes("日记片段")],
  ["Has quiz section", dailyContent.includes("学习记录")],
  ["Has idea section", dailyContent.includes("大构思完善")],
  ["Has tomorrow section", dailyContent.includes("明天计划")],
  ["No empty template tags", !/\{\{[#^/]\w+\}\}/.test(dailyContent)],
  ["Has footer", dailyContent.includes("Cyberboss")],
];

const tlChecks = [
  ["Has DOCTYPE", /^<!DOCTYPE html>/.test(tlContent)],
  ["Has hero title", tlContent.includes("每日时间轴") || tlContent.includes("时间轴")],
  ["Has stat grid", tlContent.includes("stat-grid")],
  ["Has category bar", tlContent.includes("cat-bar-wrap")],
  ["Has event items", tlContent.includes("tl-item")],
  ["Has category dots", tlContent.includes("tl-dot")],
  ["Has footer", tlContent.includes("Cyberboss")],
  ["No unresolved {{ }}", !/\{\{[#^/]?\w+\}\}/.test(tlContent)],
];

console.log("\n=== Daily Summary HTML checks ===");
for (const [label, passed] of dailyChecks) {
  console.log(`  ${passed ? "✓" : "✗"} ${label}`);
}

console.log("\n=== Daily Timeline HTML checks ===");
for (const [label, passed] of tlChecks) {
  console.log(`  ${passed ? "✓" : "✗"} ${label}`);
}

console.log("\n=== Weekly HTML checks ===");
for (const [label, passed] of weeklyChecks) {
  console.log(`  ${passed ? "✓" : "✗"} ${label}`);
}

console.log("\n=== Monthly HTML checks ===");
for (const [label, passed] of monthlyChecks) {
  console.log(`  ${passed ? "✓" : "✗"} ${label}`);
}

console.log("\n=== Done ===");
console.log(`Open these files in a browser to review:`);
console.log(`  Daily:  file://${dailyOutputPath.replace(/\\/g, "/")}`);
console.log(`  Timeline: file://${tlOutputPath.replace(/\\/g, "/")}`);
console.log(`  Weekly: file://${weeklyOutputPath.replace(/\\/g, "/")}`);
console.log(`  Monthly: file://${monthlyOutputPath.replace(/\\/g, "/")}`);
console.log(`\nTest state data at: ${TEST_STATE_DIR}`);
console.log(`(This directory can be safely deleted — it's separate from the real ~/.cyberboss/)`);
})();  // end async IIFE

// ---- Helpers ----
function formatDate(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
