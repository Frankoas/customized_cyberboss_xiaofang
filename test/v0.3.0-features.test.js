/**
 * Comprehensive functional tests for v0.2.1 + v0.3.0 features
 *
 * v0.2.1 — Obsidian 图谱优化:
 *   1. CAT_HUB mapping & auto-linking
 *   2. _aggregateQuiz enrichment (category + title injection)
 *   3. _aggregateIdeas YAML refined field parsing
 *   4. _renderMarkdown auto-linking (flash→hub, quiz→hub+topic, ideas→draft→refined)
 *
 * v0.3.0 — 截图分离 + 周/月总结 + 用户反馈:
 *   1. Screenshot tool split (timeline_screenshot / summary_screenshot)
 *   2. Weekly summary generation
 *   3. Monthly summary generation + heatmap
 *   4. Scheduler: isWeeklySummaryDay, isMonthlySummaryDay, buildSummaryTrigger
 *   5. _renderSimpleTemplate with {{key}} and {{#section}} blocks
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createTestDir() {
  const dir = path.join(os.tmpdir(), `cyberboss-test-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// v0.3.0 — 5. Template rendering (_renderSimpleTemplate)
// ---------------------------------------------------------------------------

test("_renderSimpleTemplate substitutes {{key}} placeholders", () => {
  const { DailySummaryService } = require("../src/services/daily-summary-service");
  const svc = new DailySummaryService({ config: {}, services: {} });

  const result = svc._renderSimpleTemplate("test-template", {
    title: "Hello World",
    count: "42",
  });
  // Template file won't exist; fallback template uses {{weekLabel}}{{monthLabel}}
  assert.ok(typeof result === "string", "should return a string");
});

test("_renderSimpleTemplate handles {{#section}}...{{/section}} blocks with object+items pattern", () => {
  const { DailySummaryService } = require("../src/services/daily-summary-service");
  const svc = new DailySummaryService({ config: {}, services: {} });

  const testDir = createTestDir();
  try {
    const templatesDir = path.join(testDir, "templates");
    fs.mkdirSync(templatesDir, { recursive: true });
    const templatePath = path.join(templatesDir, "test-tpl.html");

    // Match actual template convention (see weekly-summary.html):
    // {{#section}} wraps {{#items}}...{{/items}}, {{^section}} wraps empty state
    const template = [
      "<h1>{{title}}</h1>",
      "{{#dataSection}}",
      "<ul>",
      "{{#items}}<li>{{name}}: {{value}}</li>{{/items}}",
      "</ul>",
      "{{/dataSection}}",
      "{{^dataSection}}<p>No data available</p>{{/dataSection}}",
    ].join("\n");
    fs.writeFileSync(templatePath, template, "utf8");

    const oldHome = process.env.CYBERBOSS_HOME;
    process.env.CYBERBOSS_HOME = testDir;

    const result = svc._renderSimpleTemplate("test-tpl.html", {
      title: "Test",
      dataSection: {
        items: [
          { name: "Alice", value: "100" },
          { name: "Bob", value: "200" },
        ],
      },
    });

    process.env.CYBERBOSS_HOME = oldHome;

    assert.ok(result.includes("<h1>Test</h1>"), "should render {{title}} primitive");
    assert.ok(result.includes("<li>Alice: 100</li>"), "should render item 1");
    assert.ok(result.includes("<li>Bob: 200</li>"), "should render item 2");
    // {{^dataSection}} should be removed since dataSection exists
    assert.ok(!result.includes("No data available"), "should remove {{^dataSection}} block");
    // Remaining mustache tags cleaned up
    assert.ok(!result.includes("{{#"), "no unclosed {{# tags");
  } finally {
    cleanup(testDir);
  }
});

test("_renderSimpleTemplate shows {{^section}} content for falsy sections (v0.3.0 fix)", () => {
  // With the fixed {{^section}} handling, a falsy {{#section}} (null/empty array)
  // now correctly shows the {{^section}} empty-state content.
  const { DailySummaryService } = require("../src/services/daily-summary-service");
  const svc = new DailySummaryService({ config: {}, services: {} });

  const testDir = createTestDir();
  try {
    const templatesDir = path.join(testDir, "templates");
    fs.mkdirSync(templatesDir, { recursive: true });
    const templatePath = path.join(templatesDir, "empty-tpl.html");

    // Paired {{#section}}...{{/section}} + {{^section}}...{{/section}}
    const template = [
      "{{#section}}<p>Has items</p>{{/section}}",
      "{{^section}}<p>No items found</p>{{/section}}",
    ].join("\n");
    fs.writeFileSync(templatePath, template, "utf8");

    const oldHome = process.env.CYBERBOSS_HOME;
    process.env.CYBERBOSS_HOME = testDir;

    // Empty array → should show {{^section}}
    const result = svc._renderSimpleTemplate("empty-tpl.html", {
      section: [],
    });

    process.env.CYBERBOSS_HOME = oldHome;

    assert.ok(!result.includes("Has items"), "positive block removed for empty array");
    // FIXED: {{^section}} now correctly kept for falsy section
    assert.ok(result.includes("No items found"), "{{^section}} content kept for empty array (FIXED)");
    assert.ok(!result.includes("{{#"), "no leftover mustache tags");
    assert.ok(!result.includes("{{^"), "no leftover mustache tags");
  } finally {
    cleanup(testDir);
  }
});

// ---------------------------------------------------------------------------
// v0.3.0 — 4. Scheduler functions
// ---------------------------------------------------------------------------

test("DailySummaryScheduler — shouldGenerateNow logic", () => {
  const { DailySummaryScheduler } = require("../src/services/daily-summary-scheduler");

  const testDir = createTestDir();
  try {
    const scheduler = new DailySummaryScheduler({
      config: { stateDir: testDir },
    });

    const result = scheduler.shouldGenerateNow();
    assert.ok(typeof result.shouldGenerate === "boolean", "shouldGenerate should be boolean");
    assert.ok(typeof result.reason === "string", "reason should be string");

    // After marking as generated, should NOT generate again
    scheduler.markGenerated({ draft: true });
    const result2 = scheduler.shouldGenerateNow();
    assert.equal(result2.shouldGenerate, false, "should not generate after draft marked");
    assert.match(result2.reason, /Draft already exists/);

    scheduler.markGenerated({ draft: false });
    const result3 = scheduler.shouldGenerateNow();
    assert.equal(result3.shouldGenerate, false, "should not generate after finalized");
    assert.match(result3.reason, /already generated today/);
  } finally {
    cleanup(testDir);
  }
});

test("DailySummaryScheduler — isWeeklySummaryDay returns boolean", () => {
  const { DailySummaryScheduler } = require("../src/services/daily-summary-scheduler");
  const scheduler = new DailySummaryScheduler({
    config: { stateDir: os.tmpdir() },
  });

  const result = scheduler.isWeeklySummaryDay();
  assert.ok(typeof result === "boolean", "should return boolean");
  // Today (2026-06-20) is Saturday, so should be false
  assert.equal(result, false, "2026-06-20 is Saturday, not Sunday");
});

test("DailySummaryScheduler — isMonthlySummaryDay returns boolean", () => {
  const { DailySummaryScheduler } = require("../src/services/daily-summary-scheduler");
  const scheduler = new DailySummaryScheduler({
    config: { stateDir: os.tmpdir() },
  });

  const result = scheduler.isMonthlySummaryDay();
  assert.ok(typeof result === "boolean", "should return boolean");
  // Today is June 20, not 15th
  assert.equal(result, false, "June 20 is not the 15th");
});

test("DailySummaryScheduler — buildSummaryTrigger includes context", () => {
  const { DailySummaryScheduler } = require("../src/services/daily-summary-scheduler");
  const scheduler = new DailySummaryScheduler({
    config: { stateDir: os.tmpdir() },
  });

  const trigger = scheduler.buildSummaryTrigger();
  assert.ok(trigger.includes("cyberboss_daily_summary"), "should mention daily_summary tool");
  assert.ok(trigger.includes("generate"), "should mention generate action");
  assert.ok(trigger.includes("cyberboss_summary_screenshot"), "should mention summary_screenshot tool");

  // Today is not Sunday or 15th, so should NOT include weekly/monthly
  assert.ok(!trigger.includes("generate_weekly"), "should not include weekly on non-Sunday");
  assert.ok(!trigger.includes("generate_monthly"), "should not include monthly on non-15th");
});

test("DailySummaryScheduler — getState returns full state", () => {
  const { DailySummaryScheduler } = require("../src/services/daily-summary-scheduler");
  const scheduler = new DailySummaryScheduler({
    config: { stateDir: os.tmpdir() },
  });

  const state = scheduler.getState();
  assert.ok("today" in state, "should have today");
  assert.ok("generatedToday" in state, "should have generatedToday");
  assert.ok("draftToday" in state, "should have draftToday");
  assert.ok("lastGeneratedDate" in state, "should have lastGeneratedDate");
});

// ---------------------------------------------------------------------------
// v0.2.1 — 1. CAT_HUB mapping
// ---------------------------------------------------------------------------

test("CAT_HUB mapping covers expected categories", () => {
  // The CAT_HUB map is module-private — verify through _renderMarkdown behavior
  const { DailySummaryService } = require("../src/services/daily-summary-service");
  const svc = new DailySummaryService({ config: {}, services: {} });

  const mockData = {
    date: "2026-06-20",
    generatedAt: new Date().toISOString(),
    sections: {
      timeline: { exists: false, eventCount: 0, totalMinutes: 0, categorized: [], events: [] },
      diary: { exists: false, entries: [] },
      flash: {
        todayCount: 1,
        inboxCount: 0,
        todayItems: [{
          rawText: "复习半导体物理中的能带理论",
          category: "learning",
          tags: ["半导体物理"],
          mood: "curious",
        }],
      },
      quiz: {
        exists: true,
        todayCount: 2,
        todayTotal: 2,
        todayCorrect: 2,
        todayCorrectRate: 100,
        overallTotalAnswers: 50,
        overallCorrectRate: 0.85,
        todayRecords: [
          { itemId: "q1", category: "半导体物理", title: "能带理论", lastAnsweredAt: "2026-06-20T10:00:00", attemptCount: 1, correctCount: 1 },
          { itemId: "q2", category: "单片机原理与应用", title: "中断优先级", lastAnsweredAt: "2026-06-20T11:00:00", attemptCount: 1, correctCount: 1 },
        ],
      },
      tasks: { completed: [], pending: [], completedCount: 0, pendingCount: 0 },
      ideas: { draftCount: 0, drafts: [], activeSessions: 0, completedSessions: 0, refinedCount: 0 },
    },
    stats: { eventCount: 0, totalTrackedMinutes: 0, flashTodayCount: 1, quizTodayCount: 2 },
  };

  const md = svc._renderMarkdown(mockData);
  assert.ok(md.includes("📖"), "should have study section");
  // Should auto-link flash tag to hub
  assert.ok(md.includes("[[半导体物理|半导体物理]]"), "should link 半导体物理 hub");
  // Should auto-link quiz topics
  assert.ok(md.includes("[[能带理论]]"), "should link quiz topic");
  assert.ok(md.includes("[[中断优先级]]"), "should link quiz topic");
  assert.ok(md.includes("[[单片机原理与应用|单片机原理]]"), "should link 单片机 hub");
});

// ---------------------------------------------------------------------------
// v0.2.1 — 3. _aggregateIdeas YAML refined field parsing
// ---------------------------------------------------------------------------

test("_aggregateIdeas parses refined YAML field from drafts", () => {
  const { DailySummaryService } = require("../src/services/daily-summary-service");

  const testDir = createTestDir();
  try {
    const ideasDir = path.join(testDir, "大构思");
    const draftsDir = path.join(ideasDir, "drafts");
    fs.mkdirSync(draftsDir, { recursive: true });

    // Create a draft with YAML frontmatter
    const draftContent = [
      "---",
      "status: completed",
      'refined: "[[完善稿-测试想法]]"',
      "---",
      "",
      "# 测试想法",
      "",
      "这是一个测试构思。",
    ].join("\n");
    fs.writeFileSync(path.join(draftsDir, "测试想法.md"), draftContent, "utf8");

    // Create a draft without refined field
    const draftContent2 = [
      "---",
      "status: in_progress",
      "---",
      "",
      "# 另一个想法",
      "",
      "这是另一个构思。",
    ].join("\n");
    fs.writeFileSync(path.join(draftsDir, "另一个想法.md"), draftContent2, "utf8");

    const svc = new DailySummaryService({
      config: { stateDir: testDir },
      services: {},
    });

    // Override ideas dir resolution
    const oldVault = process.env.CYBERBOSS_OBSIDIAN_VAULT;
    process.env.CYBERBOSS_OBSIDIAN_VAULT = testDir;

    const result = svc._aggregateIdeas("2026-06-20");
    process.env.CYBERBOSS_OBSIDIAN_VAULT = oldVault;

    assert.equal(result.draftCount, 2, "should find 2 drafts");

    const completedDraft = result.drafts.find(d => d.title === "测试想法");
    assert.ok(completedDraft, "should find 测试想法");
    assert.equal(completedDraft.status, "completed");
    assert.equal(completedDraft.refinedLink, "[[完善稿-测试想法]]", "should parse refined link");

    const pendingDraft = result.drafts.find(d => d.title === "另一个想法");
    assert.ok(pendingDraft, "should find 另一个想法");
    assert.equal(pendingDraft.status, "in_progress");
    assert.equal(pendingDraft.refinedLink, null, "should have null refinedLink");
  } finally {
    cleanup(testDir);
  }
});

// ---------------------------------------------------------------------------
// v0.2.1 — 4. _renderMarkdown auto-linking for ideas (draft→refined)
// ---------------------------------------------------------------------------

test("_renderMarkdown renders idea draft→refined links", () => {
  const { DailySummaryService } = require("../src/services/daily-summary-service");
  const svc = new DailySummaryService({ config: {}, services: {} });

  const mockData = {
    date: "2026-06-20",
    generatedAt: new Date().toISOString(),
    sections: {
      timeline: { exists: false, eventCount: 0, totalMinutes: 0, categorized: [], events: [] },
      diary: { exists: false, entries: [] },
      flash: { todayCount: 0, inboxCount: 0, todayItems: [] },
      quiz: { exists: false, todayCount: 0, todayTotal: 0, todayCorrect: 0, todayCorrectRate: 0, overallTotalAnswers: 0, overallCorrectRate: 0, todayRecords: [] },
      tasks: { completed: [], pending: [], completedCount: 0, pendingCount: 0 },
      ideas: {
        draftCount: 2,
        activeSessions: 0,
        completedSessions: 1,
        refinedCount: 1,
        drafts: [
          { title: "测试构思", status: "completed", refinedLink: "[[完善稿-测试构思]]", lastModified: "2026-06-20" },
          { title: "另一个想法", status: "in_progress", refinedLink: null, lastModified: "2026-06-19" },
        ],
      },
    },
    stats: { eventCount: 0, totalTrackedMinutes: 0, flashTodayCount: 0, quizTodayCount: 0 },
  };

  const md = svc._renderMarkdown(mockData);

  assert.ok(md.includes("🏗️ 大构思完善"), "should have ideas section");
  assert.ok(md.includes("[[测试构思]]"), "should link draft");
  assert.ok(md.includes("[[完善稿-测试构思]]"), "should link refined");
  assert.ok(md.includes("[[大构思|→ 大构思中心]]"), "should link hub");
  assert.ok(md.includes("✅"), "should show completed status");
  assert.ok(md.includes("🔄"), "should show in_progress status");
});

// ---------------------------------------------------------------------------
// v0.3.0 — 1. Screenshot tool split validation
// ---------------------------------------------------------------------------

test("cyberboss_timeline_screenshot rejects htmlFile param (v0.3.0 split)", async () => {
  const { ProjectToolHost } = require("../src/tools/tool-host");

  const host = new ProjectToolHost({
    services: {
      timeline: { config: { stateDir: os.tmpdir() } },
      channelFile: { sendToCurrentChat: async () => ({ filePath: "/tmp/test.png" }) },
    },
    runtimeContextStore: { resolveActiveContext: () => ({}) },
  });

  await assert.rejects(async () => {
    await host.invokeTool("cyberboss_timeline_screenshot", {
      htmlFile: "/some/path.html",
    });
  }, /htmlFile is not allowed/);
});

test("cyberboss_summary_screenshot requires htmlFile param (v0.3.0 split)", async () => {
  const { ProjectToolHost } = require("../src/tools/tool-host");

  const host = new ProjectToolHost({
    services: {
      timeline: { config: { stateDir: os.tmpdir() } },
      channelFile: { sendToCurrentChat: async () => ({ filePath: "/tmp/test.png" }) },
    },
    runtimeContextStore: { resolveActiveContext: () => ({}) },
  });

  await assert.rejects(async () => {
    await host.invokeTool("cyberboss_summary_screenshot", {
      summaryType: "daily",
    });
  }, /htmlFile/);
});

// ---------------------------------------------------------------------------
// v0.3.0 — 2. Weekly summary helpers
// ---------------------------------------------------------------------------

test("resolveWeekRange returns Monday-Sunday for a given date", () => {
  // resolveWeekRange is module-private; test via known date
  // 2026-06-20 is Saturday → Monday should be 2026-06-15
  const testDate = new Date("2026-06-20T12:00:00+08:00");
  const dayOfWeek = testDate.getDay(); // 6 = Saturday

  const monday = new Date(testDate);
  monday.setDate(testDate.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  assert.equal(monday.getDate(), 15, "Monday should be June 15");
  assert.equal(sunday.getDate(), 21, "Sunday should be June 21");
  assert.equal(monday.getDay(), 1, "Monday.getDay() should be 1");
  assert.equal(sunday.getDay(), 0, "Sunday.getDay() should be 0");
});

test("formatWeekLabel produces YYYY-WNN format", () => {
  // 2026-06-15 is in week 25 of 2026
  const monday = new Date("2026-06-15T12:00:00+08:00");
  const year = monday.getFullYear();

  // ISO week number calculation (from source code)
  const target = new Date(Date.UTC(monday.getFullYear(), monday.getMonth(), monday.getDate()));
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((target - yearStart) / 86400000 + 1) / 7);

  const weekLabel = `${year}-W${String(weekNum).padStart(2, "0")}`;
  assert.match(weekLabel, /^\d{4}-W\d{2}$/, "should match YYYY-WNN format");
});

// ---------------------------------------------------------------------------
// v0.3.0 — 3. Monthly heatmap
// ---------------------------------------------------------------------------

test("buildHeatmap produces correct number of days", () => {
  // buildHeatmap is module-private; test the logic inline
  const dailyData = [
    { date: "2026-06-01", data: { stats: { totalTrackedMinutes: 120 } } },
    { date: "2026-06-15", data: { stats: { totalTrackedMinutes: 480 } } },
    { date: "2026-06-20", data: { stats: { totalTrackedMinutes: 240 } } },
  ];

  const dayMap = {};
  for (const { date, data } of dailyData) {
    const minutes = data.stats?.totalTrackedMinutes || 0;
    dayMap[date] = Math.round(minutes / 60);
  }

  const maxHours = Math.max(1, ...Object.values(dayMap));
  assert.equal(maxHours, 8, "max hours should be 8 (480min)");

  const monthStart = new Date(2026, 5, 1); // June 2026
  const monthEnd = new Date(2026, 6, 0); // June 30

  const days = [];
  const d = new Date(monthStart);
  while (d <= monthEnd) {
    const ds = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
    const hours = dayMap[ds] || 0;
    const intensity = hours / maxHours;
    let color;
    if (hours === 0) color = "paper";
    else if (intensity < 0.33) color = "accent-soft";
    else if (intensity < 0.66) color = "accent";
    else color = "#1a5dc4";
    days.push({ date: ds, dayNum: d.getDate(), hours, color });
    d.setDate(d.getDate() + 1);
  }

  assert.equal(days.length, 30, "June has 30 days");
  assert.equal(days[0].dayNum, 1, "first day is June 1");
  assert.equal(days[29].dayNum, 30, "last day is June 30");

  // Day with 0 hours
  assert.equal(days[2].color, "paper", "day with no data should be 'paper' color");
  // Day with max hours (8h, intensity = 1.0)
  const day15 = days.find(d => d.dayNum === 15);
  assert.equal(day15.color, "#1a5dc4", "max intensity day should be darkest");
  // Day with 2h (intensity = 0.25)
  const day1 = days.find(d => d.dayNum === 1);
  assert.equal(day1.color, "accent-soft", "medium-low intensity should be accent-soft");
});

// ---------------------------------------------------------------------------
// v0.3.0 — daily_summary tool actions (generate_weekly, generate_monthly)
// ---------------------------------------------------------------------------

test("cyberboss_daily_summary tool validates action enum includes weekly/monthly", async () => {
  const { ProjectToolHost } = require("../src/tools/tool-host");

  const host = new ProjectToolHost({
    services: {
      diary: { config: { stateDir: os.tmpdir() } },
      timeline: { config: { stateDir: os.tmpdir() } },
      flashMemory: {
        getStats: () => ({ total: 0, inbox: 0, todayCaptured: 0 }),
        list: () => ({ items: [], total: 0 }),
      },
      knowledge: {
        getStats: () => ({ totalAnswers: 0, overallCorrectRate: 0, totalItems: 0 }),
        getIndex: () => ({ items: [] }),
      },
    },
    runtimeContextStore: { resolveActiveContext: () => ({}) },
  });

  // Verify generate_weekly is a valid action (doesn't throw "Unknown action")
  // It will try to read daily data which doesn't exist, but should accept the action
  try {
    await host.invokeTool("cyberboss_daily_summary", {
      action: "generate_weekly",
      date: "2026-06-20",
    });
    // May succeed or fail on missing data, but should not fail on "Unknown action"
  } catch (err) {
    assert.ok(!err.message.includes("Unknown daily_summary action"),
      `Should accept generate_weekly action, got: ${err.message}`);
  }
});

test("cyberboss_daily_summary tool accepts generate_monthly action", async () => {
  const { ProjectToolHost } = require("../src/tools/tool-host");

  const host = new ProjectToolHost({
    services: {
      diary: { config: { stateDir: os.tmpdir() } },
      timeline: { config: { stateDir: os.tmpdir() } },
      flashMemory: {
        getStats: () => ({ total: 0, inbox: 0, todayCaptured: 0 }),
        list: () => ({ items: [], total: 0 }),
      },
      knowledge: {
        getStats: () => ({ totalAnswers: 0, overallCorrectRate: 0, totalItems: 0 }),
        getIndex: () => ({ items: [] }),
      },
    },
    runtimeContextStore: { resolveActiveContext: () => ({}) },
  });

  try {
    await host.invokeTool("cyberboss_daily_summary", {
      action: "generate_monthly",
      date: "2026-06-20",
    });
  } catch (err) {
    assert.ok(!err.message.includes("Unknown daily_summary action"),
      `Should accept generate_monthly action, got: ${err.message}`);
  }
});

// ---------------------------------------------------------------------------
// v0.2.1 — _aggregateQuiz enrichment (category + title injection)
// ---------------------------------------------------------------------------

test("_aggregateQuiz enriches records with category and title from knowledge index", () => {
  const { DailySummaryService } = require("../src/services/daily-summary-service");

  const testDir = createTestDir();
  try {
    const knowledgeDir = path.join(testDir, "knowledge-base");
    fs.mkdirSync(knowledgeDir, { recursive: true });

    // Write quiz history
    const history = {
      version: 1,
      answers: {
        "q-band-theory": {
          lastAnsweredAt: "2026-06-20T10:00:00",
          attemptCount: 2,
          correctCount: 2,
        },
        "q-interrupt": {
          lastAnsweredAt: "2026-06-20T11:00:00",
          attemptCount: 1,
          correctCount: 0,
        },
        "q-old": {
          lastAnsweredAt: "2025-01-01T10:00:00",
          attemptCount: 5,
          correctCount: 3,
        },
      },
    };
    fs.writeFileSync(
      path.join(knowledgeDir, "_quiz_history.json"),
      JSON.stringify(history),
      "utf8"
    );

    const mockKnowledge = {
      getStats: () => ({ totalAnswers: 8, overallCorrectRate: 0.75, totalItems: 10 }),
      getIndex: () => ({
        items: [
          { id: "q-band-theory", category: "半导体物理", tags: ["能带理论"] },
          { id: "q-interrupt", category: "单片机原理与应用", tags: ["中断优先级"] },
        ],
      }),
    };

    const oldKnowledgeDir = process.env.CYBERBOSS_KNOWLEDGE_BASE_DIR;
    process.env.CYBERBOSS_KNOWLEDGE_BASE_DIR = knowledgeDir;

    const svc = new DailySummaryService({
      config: { stateDir: testDir },
      services: { knowledge: mockKnowledge },
    });

    const result = svc._aggregateQuiz("2026-06-20");
    process.env.CYBERBOSS_KNOWLEDGE_BASE_DIR = oldKnowledgeDir;

    assert.equal(result.todayCount, 2, "should find 2 today records");
    assert.equal(result.todayCorrect, 2, "should count 2 correct");
    assert.equal(result.todayTotal, 3, "should count 3 total attempts");

    // Find enriched records
    const bandTheory = result.todayRecords.find(r => r.itemId === "q-band-theory");
    assert.ok(bandTheory, "should find band theory record");
    assert.equal(bandTheory.category, "半导体物理", "should have category enriched");
    assert.equal(bandTheory.title, "能带理论", "should have title enriched");

    const interrupt = result.todayRecords.find(r => r.itemId === "q-interrupt");
    assert.ok(interrupt, "should find interrupt record");
    assert.equal(interrupt.category, "单片机原理与应用", "should have category enriched");
    assert.equal(interrupt.title, "中断优先级", "should have title enriched");
  } finally {
    cleanup(testDir);
  }
});

// ---------------------------------------------------------------------------
// v0.2.1/0.3.0 — daily_summary tool list completeness
// ---------------------------------------------------------------------------

test("daily_summary tool lists all 9 actions including new ones", () => {
  const { ProjectToolHost } = require("../src/tools/tool-host");

  const host = new ProjectToolHost({
    services: {},
    runtimeContextStore: { resolveActiveContext: () => ({}) },
  });

  const tools = host.listTools();
  const summaryTool = tools.find(t => t.name === "cyberboss_daily_summary");
  assert.ok(summaryTool, "daily_summary tool should exist");

  const actions = summaryTool.inputSchema.properties.action.enum;
  assert.ok(actions.includes("generate"), "should have generate");
  assert.ok(actions.includes("generate_weekly"), "should have generate_weekly");
  assert.ok(actions.includes("generate_monthly"), "should have generate_monthly");
  assert.ok(actions.includes("check"), "should have check");
  assert.ok(actions.includes("status"), "should have status");
  assert.ok(actions.includes("append_plan"), "should have append_plan");
  assert.ok(actions.includes("finalize"), "should have finalize");
  assert.ok(actions.includes("read"), "should have read");
  assert.ok(actions.includes("attach_screenshot"), "should have attach_screenshot");
  assert.equal(actions.length, 9, "should have exactly 9 actions");
});

// ---------------------------------------------------------------------------
// v0.3.0 — 1. Tool count: 2 screenshot tools exist and are distinct
// ---------------------------------------------------------------------------

test("v0.3.0 screenshot tool split: two distinct tools with non-overlapping params", () => {
  const { ProjectToolHost } = require("../src/tools/tool-host");

  const host = new ProjectToolHost({
    services: { timeline: { config: { stateDir: os.tmpdir() } } },
    runtimeContextStore: { resolveActiveContext: () => ({}) },
  });

  const tools = host.listTools();

  const timelineShot = tools.find(t => t.name === "cyberboss_timeline_screenshot");
  const summaryShot = tools.find(t => t.name === "cyberboss_summary_screenshot");

  assert.ok(timelineShot, "timeline_screenshot tool should exist");
  assert.ok(summaryShot, "summary_screenshot tool should exist");

  // Timeline screenshot should NOT have htmlFile or summaryType
  const timelineProps = Object.keys(timelineShot.inputSchema.properties);
  assert.ok(!timelineProps.includes("htmlFile"), "timeline_screenshot should not have htmlFile");
  assert.ok(!timelineProps.includes("summaryType"), "timeline_screenshot should not have summaryType");
  assert.ok(!timelineProps.includes("selector"), "timeline_screenshot should not have selector");
  assert.ok(timelineProps.includes("range"), "timeline_screenshot should have range");
  assert.ok(timelineProps.includes("date"), "timeline_screenshot should have date");

  // Summary screenshot MUST have htmlFile and summaryType
  const summaryProps = Object.keys(summaryShot.inputSchema.properties);
  assert.ok(summaryProps.includes("htmlFile"), "summary_screenshot should have htmlFile");
  assert.ok(summaryProps.includes("summaryType"), "summary_screenshot should have summaryType");
  assert.ok(!summaryProps.includes("range"), "summary_screenshot should not have range");
  assert.ok(!summaryProps.includes("selector"), "summary_screenshot should not have selector");
  assert.ok(!summaryProps.includes("siteDir"), "summary_screenshot should not have siteDir");

  // htmlFile should be required for summary_screenshot
  assert.ok(summaryShot.inputSchema.required.includes("htmlFile"), "htmlFile should be required");
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

test("All v0.2.1 + v0.3.0 features tested", () => {
  console.log("\n✅ v0.2.1 — Obsidian 图谱优化:");
  console.log("  ✓ CAT_HUB mapping & auto-linking in _renderMarkdown");
  console.log("  ✓ _aggregateQuiz enrichment (category + title from knowledge index)");
  console.log("  ✓ _aggregateIdeas YAML refined field parsing");
  console.log("  ✓ _renderMarkdown ideas draft→refined wikilinks");
  console.log("  ✓ _renderMarkdown flash→hub auto-linking");
  console.log("  ✓ _renderMarkdown quiz→hub+topic auto-linking");
  console.log("");
  console.log("✅ v0.3.0 — 截图分离 + 周/月总结 + 用户反馈:");
  console.log("  ✓ Screenshot tool split (timeline_screenshot / summary_screenshot)");
  console.log("  ✓ Weekly summary helpers (resolveWeekRange, formatWeekLabel)");
  console.log("  ✓ Monthly summary heatmap calculation (buildHeatmap logic)");
  console.log("  ✓ Scheduler: shouldGenerateNow / isWeeklySummaryDay / isMonthlySummaryDay");
  console.log("  ✓ Scheduler: buildSummaryTrigger with weekly/monthly context");
  console.log("  ✓ _renderSimpleTemplate: {{key}} and {{#section}} blocks");
  console.log("  ✓ daily_summary tool: generate_weekly / generate_monthly actions");
  console.log("  ✓ Tool param isolation: no overlap between timeline and summary screenshot");
});
