const fs = require("fs");
const path = require("path");
const os = require("os");

class DailySummaryService {
  constructor({ config, services }) {
    this.config = config;
    this.services = services; // { timeline, diary, flashMemory, knowledge }
  }

  /**
   * Generate a structured daily summary for the given date.
   * Aggregates data from timeline, diary, flash memory, and quiz history.
   */
  async generate({
    date = "",
    format = "full",
    includeSections = ["timeline", "flashQa", "capsules", "flash", "diary", "quiz", "tasks", "ideas"],
  } = {}) {
    const dateLabel = date || formatDate(new Date());
    const sections = {};

    // 1. Timeline events for the day
    if (includeSections.includes("timeline")) {
      sections.timeline = await this._aggregateTimeline(dateLabel);
    }

    // 2. Flash Q&A — memory fragment conversations
    if (includeSections.includes("flashQa")) {
      sections.flashQa = this._aggregateFlashQa(dateLabel);
    }

    // 3. Memory capsules — linked flash clusters & roundups
    if (includeSections.includes("capsules")) {
      sections.capsules = this._aggregateCapsules(dateLabel);
    }

    // 4. Flash memory items captured today
    if (includeSections.includes("flash")) {
      sections.flash = this._aggregateFlash(dateLabel);
    }

    // 5. Diary entries for the day
    if (includeSections.includes("diary")) {
      sections.diary = this._aggregateDiary(dateLabel);
    }

    // 6. Quiz/learning records for the day
    if (includeSections.includes("quiz")) {
      sections.quiz = this._aggregateQuiz(dateLabel);
    }

    // 7. Task completion
    if (includeSections.includes("tasks")) {
      sections.tasks = this._aggregateTasks(dateLabel);
    }

    // 8. Idea refinement drafts
    if (includeSections.includes("ideas")) {
      sections.ideas = this._aggregateIdeas(dateLabel);
    }

    // Build the full summary data
    const summaryData = {
      date: dateLabel,
      generatedAt: new Date().toISOString(),
      format,
      sections,
      stats: this._computeStats(sections),
    };

    // Persist to Obsidian vault (if configured)
    const mdContent = this._renderMarkdown(summaryData);
    const htmlContent = this.buildHtml(summaryData);
    const savedPaths = this._persistSummary(dateLabel, mdContent, summaryData);
    const htmlPath = this._persistHtml(dateLabel, htmlContent);

    return {
      ...summaryData,
      mdContent,
      htmlContent,
      savedPaths: { ...savedPaths, html: htmlPath },
    };
  }

  /**
   * Check the status of today's summary.
   */
  status({ date = "" } = {}) {
    const dateLabel = date || formatDate(new Date());
    const paths = this._summaryPaths(dateLabel);
    const draftExists = fs.existsSync(paths.draftFile);
    const finalExists = fs.existsSync(paths.finalFile);
    const sectionsAvailable = [];

    // Check which data sources have data for today
    try {
      const timelinePath = this._diaryFilePath(dateLabel);
      if (fs.existsSync(timelinePath)) sectionsAvailable.push("timeline");
    } catch { /* ignore */ }

    try {
      if (fs.existsSync(this._diaryFilePath(dateLabel))) sectionsAvailable.push("diary");
    } catch { /* ignore */ }

    try {
      const flashStats = this.services.flashMemory?.getStats();
      if (flashStats && flashStats.todayCaptured > 0) sectionsAvailable.push("flash");
    } catch { /* ignore */ }

    try {
      const kbStats = this.services.knowledge?.getStats();
      if (kbStats && kbStats.totalAnswers > 0) sectionsAvailable.push("quiz");
    } catch { /* ignore */ }

    return {
      date: dateLabel,
      draftExists,
      finalExists,
      sectionsAvailable,
      lastGenerated: this._readLastGenerated(dateLabel),
    };
  }

  /**
   * Append tomorrow's plan to the daily summary.
   */
  appendPlan({ date = "", plan = "" } = {}) {
    const dateLabel = date || formatDate(new Date());
    const normalizedPlan = String(plan || "").trim();
    if (!normalizedPlan) {
      throw new Error("Plan content cannot be empty.");
    }

    const paths = this._summaryPaths(dateLabel);
    // Write or append to the plan section
    const existing = fs.existsSync(paths.finalFile)
      ? fs.readFileSync(paths.finalFile, "utf8")
      : fs.existsSync(paths.draftFile)
        ? fs.readFileSync(paths.draftFile, "utf8")
        : "";

    const planSection = `\n## 🔮 明天计划\n\n${normalizedPlan}\n`;
    const targetFile = fs.existsSync(paths.finalFile) ? paths.finalFile : paths.draftFile;

    if (!existing) {
      const emptySummary = `# 📋 日终总结 · ${dateLabel}\n\n${planSection}`;
      const dir = path.dirname(targetFile);
      ensureDir(dir);
      fs.writeFileSync(targetFile, emptySummary, "utf8");
    } else if (existing.includes("## 🔮 明天计划")) {
      const updated = existing.replace(
        /## 🔮 明天计划\n\n[\s\S]*?(?=\n##|\n*$)/,
        `## 🔮 明天计划\n\n${normalizedPlan}\n`
      );
      fs.writeFileSync(targetFile, updated, "utf8");
    } else {
      fs.appendFileSync(targetFile, planSection, "utf8");
    }

    return { ok: true, date: dateLabel, filePath: targetFile };
  }

  // ---- Private aggregators ----

  async _aggregateTimeline(dateLabel) {
    try {
      const result = await this.services.timeline?.read({ date: dateLabel });
      const events = result?.data?.events || [];
      const exists = result?.data?.exists || false;

      // Categorize events
      const categorized = {};
      let totalMinutes = 0;
      for (const event of events) {
        const cat = event.categoryId || event.subcategoryId || "other";
        if (!categorized[cat]) categorized[cat] = { label: cat, events: [], totalMinutes: 0 };
        categorized[cat].events.push(event);

        // Calculate duration
        if (event.startAt && event.endAt) {
          const durationMin = Math.round(
            (new Date(event.endAt) - new Date(event.startAt)) / 60000
          );
          if (durationMin > 0 && durationMin < 1440) {
            event._durationMinutes = durationMin;
            categorized[cat].totalMinutes += durationMin;
            totalMinutes += durationMin;
          }
        }
      }

      return {
        exists,
        eventCount: events.length,
        totalMinutes,
        categorized: Object.values(categorized),
        events: events.slice(0, 50), // Keep raw events for prompt context
      };
    } catch {
      return { exists: false, eventCount: 0, totalMinutes: 0, categorized: [], events: [] };
    }
  }

  _aggregateDiary(dateLabel) {
    try {
      const filePath = this._diaryFilePath(dateLabel);
      if (!fs.existsSync(filePath)) {
        return { exists: false, entries: [], rawText: "" };
      }

      const raw = fs.readFileSync(filePath, "utf8");
      const entries = [];

      // Parse diary entries (## HH:mm sections)
      const sectionRegex = /^##\s+(\d{2}:\d{2})(?:\s+(.*))?$/gm;
      let match;
      const parts = [];
      let lastIndex = 0;

      while ((match = sectionRegex.exec(raw)) !== null) {
        if (lastIndex < match.index) {
          parts.push({ time: parts.length ? "" : "start", title: "", body: raw.slice(lastIndex, match.index).trim() });
        }
        lastIndex = match.index;
      }

      // Simpler approach: just split by ## headings
      const blocks = raw.split(/^##\s+/gm).filter(Boolean);
      for (const block of blocks) {
        const newlineIdx = block.indexOf("\n");
        const header = newlineIdx === -1 ? block : block.slice(0, newlineIdx).trim();
        const body = newlineIdx === -1 ? "" : block.slice(newlineIdx + 1).trim();

        const timeMatch = header.match(/^(\d{2}:\d{2})/);
        const time = timeMatch ? timeMatch[1] : "";
        const title = header.replace(/^\d{2}:\d{2}\s*/, "").trim();

        if (body) {
          entries.push({ time, title, body });
        }
      }

      return {
        exists: true,
        entryCount: entries.length,
        entries,
        rawText: raw.slice(0, 5000), // Limit for prompt context
      };
    } catch {
      return { exists: false, entries: [], rawText: "" };
    }
  }

  _aggregateFlash(dateLabel) {
    try {
      if (!this.services.flashMemory) {
        return { total: 0, todayItems: [], inboxCount: 0 };
      }

      const stats = this.services.flashMemory.getStats();
      const allItems = this.services.flashMemory.list({ status: "all", limit: 200 });
      const todayItems = (allItems?.items || []).filter(
        (item) => (item.createdAt || "").startsWith(dateLabel)
      );

      // Group by mood
      const byMood = {};
      for (const item of todayItems) {
        if (item.mood) {
          byMood[item.mood] = (byMood[item.mood] || 0) + 1;
        }
      }

      // Group by category
      const byCategory = {};
      for (const item of todayItems) {
        const cat = item.category || "idea";
        byCategory[cat] = (byCategory[cat] || 0) + 1;
      }

      return {
        total: stats?.total || 0,
        inboxCount: stats?.inbox || 0,
        todayCount: todayItems.length,
        todayItems: todayItems.slice(0, 30),
        byMood,
        byCategory,
      };
    } catch {
      return { total: 0, todayItems: [], inboxCount: 0 };
    }
  }

  _aggregateQuiz(dateLabel) {
    try {
      if (!this.services.knowledge) {
        return { exists: false, totalAnswers: 0, todayRecords: [] };
      }

      const stats = this.services.knowledge.getStats();
      // The knowledge service history is keyed by itemId, not date
      // We read the raw history file to filter by date
      const history = this._readQuizHistory();
      const todayRecords = [];
      let todayCorrect = 0;
      let todayTotal = 0;

      for (const [itemId, record] of Object.entries(history.answers || {})) {
        if (record.lastAnsweredAt && record.lastAnsweredAt.startsWith(dateLabel)) {
          todayRecords.push({ itemId, ...record });
          todayTotal += record.attemptCount || 0;
          todayCorrect += record.correctCount || 0;
        }
      }

      return {
        exists: true,
        overallTotalAnswers: stats?.totalAnswers || 0,
        overallCorrectRate: stats?.overallCorrectRate || 0,
        todayCount: todayRecords.length,
        todayCorrect,
        todayTotal,
        todayCorrectRate: todayTotal > 0 ? Math.round((todayCorrect / todayTotal) * 100) : 0,
        todayRecords,
      };
    } catch {
      return { exists: false, totalAnswers: 0, todayRecords: [] };
    }
  }

  _aggregateTasks(dateLabel) {
    // Tasks come from reminders that were completed
    try {
      const reminderQueueFile = this.config?.reminderQueueFile;
      if (!reminderQueueFile || !fs.existsSync(reminderQueueFile)) {
        return { completed: [], pending: [] };
      }

      const raw = JSON.parse(fs.readFileSync(reminderQueueFile, "utf8"));
      const reminders = Array.isArray(raw) ? raw : raw.items || [];
      const todayReminders = reminders.filter((r) => {
        const created = r.createdAt || "";
        const fired = r.firedAt || "";
        return created.startsWith(dateLabel) || fired.startsWith(dateLabel);
      });

      const completed = todayReminders.filter((r) => r.firedAt);
      const pending = todayReminders.filter((r) => !r.firedAt);

      return {
        completed: completed.slice(0, 20),
        pending: pending.slice(0, 20),
        completedCount: completed.length,
        pendingCount: pending.length,
      };
    } catch {
      return { completed: [], pending: [] };
    }
  }

  /**
   * Aggregate flash Q&A — parse Q:/A: pairs from flash cleanedText.
   * These are the follow-up conversations the model had with the user
   * after capturing a flash memory item.
   */
  _aggregateFlashQa(dateLabel) {
    try {
      if (!this.services.flashMemory) {
        return { qaCount: 0, qaItems: [] };
      }

      const allItems = this.services.flashMemory.list({ status: "all", limit: 200 });
      const todayItems = (allItems?.items || []).filter(
        (item) => (item.createdAt || "").startsWith(dateLabel)
      );

      const qaItems = [];
      for (const item of todayItems) {
        const text = item.cleanedText || item.rawText || "";
        // Parse Q&A pairs: lines starting with "Q:" and "A:"
        const lines = text.split("\n");
        const exchanges = [];
        let currentQ = null;
        let original = text;

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("Q:") || trimmed.startsWith("Q：")) {
            currentQ = trimmed.replace(/^Q[：:]\s*/, "");
          } else if ((trimmed.startsWith("A:") || trimmed.startsWith("A：")) && currentQ) {
            exchanges.push({ q: currentQ, a: trimmed.replace(/^A[：:]\s*/, "") });
            currentQ = null;
          }
        }

        if (exchanges.length > 0) {
          // Extract the original flash text (before the first Q:)
          const firstQIdx = Math.min(
            ...["Q:", "Q："].map((prefix) => {
              const idx = text.indexOf(`\n${prefix}`);
              return idx === -1 ? Infinity : idx;
            })
          );
          if (firstQIdx !== Infinity) {
            original = text.slice(0, firstQIdx).trim();
          }
          qaItems.push({ id: item.id, original, exchanges });
        }
      }

      return {
        qaCount: qaItems.reduce((sum, item) => sum + item.exchanges.length, 0),
        qaItems,
      };
    } catch {
      return { qaCount: 0, qaItems: [] };
    }
  }

  /**
   * Aggregate memory capsules — linked flash clusters and roundup themes.
   * A "capsule" is a group of related flash items that form a coherent theme,
   * discovered through relatedFlashIds links or roundup consolidation notes.
   */
  _aggregateCapsules(dateLabel) {
    try {
      if (!this.services.flashMemory) {
        return { capsuleCount: 0, capsules: [] };
      }

      const allItems = this.services.flashMemory.list({ status: "all", limit: 300 });
      const items = allItems?.items || [];

      // Find flash items with relatedFlashIds (clusters)
      const linkedItems = items.filter(
        (item) => Array.isArray(item.relatedFlashIds) && item.relatedFlashIds.length > 0
      );

      // Build capsule groups from today's linked items
      const todayLinked = linkedItems.filter(
        (item) => (item.createdAt || "").startsWith(dateLabel)
      );

      const capsules = [];
      const seen = new Set();

      for (const item of todayLinked) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);

        // Collect all related items in the cluster
        const clusterIds = new Set([item.id, ...item.relatedFlashIds]);
        const clusterItems = [item];

        for (const rid of item.relatedFlashIds) {
          if (!seen.has(rid)) {
            seen.add(rid);
            const related = items.find((i) => i.id === rid);
            if (related) clusterItems.push(related);
          }
        }

        // Derive a theme from categories and tags
        const categories = [...new Set(clusterItems.map((i) => i.category).filter(Boolean))];
        const tags = [...new Set(clusterItems.flatMap((i) => i.tags || []))];
        const theme = tags.slice(0, 2).join(" · ") || categories.join(" · ") || "记忆碎片群";
        const summary = clusterItems
          .map((i) => (i.cleanedText || i.rawText || "").split("\n")[0])
          .filter(Boolean)
          .slice(0, 3)
          .join("；");

        capsules.push({
          theme,
          summary: summary || `${clusterItems.length} 条关联闪存`,
          linkedCount: clusterItems.length,
          itemIds: [...clusterIds],
        });
      }

      // Also check for roundup notes in the Obsidian vault
      const roundupCapsules = this._readRoundupCapsules(dateLabel);
      for (const rc of roundupCapsules) {
        // Avoid duplicates by theme
        if (!capsules.some((c) => c.theme === rc.theme)) {
          capsules.push(rc);
        }
      }

      return {
        capsuleCount: capsules.length,
        capsules: capsules.slice(0, 10),
      };
    } catch {
      return { capsuleCount: 0, capsules: [] };
    }
  }

  /**
   * Read roundup consolidation notes from the Obsidian vault.
   */
  _readRoundupCapsules(dateLabel) {
    try {
      const obsidianDir = process.env.CYBERBOSS_OBSIDIAN_VAULT;
      if (!obsidianDir) return [];

      const roundupDir = path.join(obsidianDir, "分类归档");
      if (!fs.existsSync(roundupDir)) return [];

      const capsules = [];
      const files = fs.readdirSync(roundupDir, { withFileTypes: true });
      for (const file of files) {
        if (!file.isFile() || !file.name.endsWith(".md")) continue;
        const filePath = path.join(roundupDir, file.name);
        const stat = fs.statSync(filePath);
        const fileDate = formatDate(stat.mtime);
        // Include roundups from today or recent 3 days
        if (fileDate === dateLabel || this._daysBetween(fileDate, dateLabel) <= 3) {
          const raw = fs.readFileSync(filePath, "utf8");
          const lines = raw.split("\n").filter(Boolean);
          const theme = file.name.replace(/\.md$/, "");
          const summary = lines.slice(0, 3).join(" ").slice(0, 200);
          capsules.push({
            theme,
            summary: summary || "闪存整理笔记",
            linkedCount: (raw.match(/\[\[/g) || []).length,
            roundup: true,
          });
        }
      }

      return capsules;
    } catch {
      return [];
    }
  }

  /**
   * Aggregate idea refinement drafts — check the 大构思 directory.
   */
  _aggregateIdeas(dateLabel) {
    try {
      const obsidianDir = process.env.CYBERBOSS_OBSIDIAN_VAULT;
      const ideasDir = obsidianDir
        ? path.join(obsidianDir, "大构思")
        : path.join(this.config?.stateDir || path.join(os.homedir(), ".cyberboss"), "ideas");

      if (!fs.existsSync(ideasDir)) {
        return { draftCount: 0, drafts: [] };
      }

      const drafts = [];
      const files = fs.readdirSync(ideasDir, { withFileTypes: true });
      for (const file of files) {
        if (!file.isFile() || !file.name.endsWith(".md")) continue;
        const filePath = path.join(ideasDir, file.name);
        const stat = fs.statSync(filePath);
        let title = file.name.replace(/\.md$/, "");
        let lastRefined = "";

        // Try to read the title from the markdown frontmatter or first heading
        try {
          const raw = fs.readFileSync(filePath, "utf8");
          const h1Match = raw.match(/^#\s+(.+)$/m);
          if (h1Match) title = h1Match[1];
          lastRefined = formatDate(stat.mtime);
        } catch { /* ignore */ }

        drafts.push({
          title,
          filePath,
          lastRefined,
        });
      }

      return {
        draftCount: drafts.length,
        drafts: drafts.slice(0, 10),
      };
    } catch {
      return { draftCount: 0, drafts: [] };
    }
  }

  /**
   * Helper: days between two YYYY-MM-DD dates.
   */
  _daysBetween(a, b) {
    try {
      const da = new Date(a);
      const db = new Date(b);
      return Math.abs(Math.round((db - da) / 86400000));
    } catch {
      return Infinity;
    }
  }

  _computeStats(sections) {
    return {
      eventCount: sections.timeline?.eventCount || 0,
      totalTrackedMinutes: sections.timeline?.totalMinutes || 0,
      diaryEntryCount: sections.diary?.entryCount || 0,
      flashTodayCount: sections.flash?.todayCount || 0,
      flashInboxCount: sections.flash?.inboxCount || 0,
      flashQaCount: sections.flashQa?.qaCount || 0,
      capsuleCount: sections.capsules?.capsuleCount || 0,
      quizTodayCount: sections.quiz?.todayCount || 0,
      quizCorrectRate: sections.quiz?.todayCorrectRate || 0,
      taskCompletedCount: sections.tasks?.completedCount || 0,
      taskPendingCount: sections.tasks?.pendingCount || 0,
      ideaDraftCount: sections.ideas?.draftCount || 0,
    };
  }

  /**
   * Build an HTML version of the daily summary using the project's template.
   * The template reuses the paper-texture design system from timeline-for-agent.
   */
  buildHtml(data) {
    // Resolve template relative to the cyberboss package root (../../templates/)
    const templatePath = path.join(
      __dirname, "..", "..", "templates", "daily-summary.html"
    );

    let template;
    if (fs.existsSync(templatePath)) {
      template = fs.readFileSync(templatePath, "utf8");
    } else {
      // Fallback: use a minimal inline template
      template = this._fallbackHtmlTemplate();
    }

    return this._renderHtmlTemplate(template, data);
  }

  /**
   * Persist the HTML summary alongside the Markdown version.
   */
  _persistHtml(dateLabel, htmlContent) {
    const paths = this._summaryPaths(dateLabel);
    const weekday = getDayOfWeekChinese(dateLabel);
    const readableName = `${dateLabel}-${weekday}-日终总结`;
    const htmlFile = path.join(paths.baseDir, `${readableName}.html`);
    ensureDir(paths.baseDir);
    fs.writeFileSync(htmlFile, htmlContent, "utf8");
    return htmlFile;
  }

  // ---- HTML template rendering (mustache-style) ----

  _renderHtmlTemplate(template, data) {
    const { date, sections, stats } = data;
    const t = sections.timeline || {};
    const d = sections.diary || {};
    const f = sections.flash || {};
    const fqa = sections.flashQa || {};
    const caps = sections.capsules || {};
    const q = sections.quiz || {};
    const tasks = sections.tasks || {};
    const ideas = sections.ideas || {};

    const dateObj = this._parseDate(date);
    const dateLabel = dateObj
      ? `${dateObj.getFullYear()}年${dateObj.getMonth() + 1}月${dateObj.getDate()}日`
      : date;

    let html = template;

    // Simple replacements
    const replacements = {
      "{{date}}": date,
      "{{dateLabel}}": dateLabel,
      "{{eventCount}}": String(stats.eventCount || 0),
      "{{trackedHours}}": String(Math.round((stats.totalTrackedMinutes || 0) / 60)),
      "{{flashCount}}": String(stats.flashTodayCount || 0),
      "{{quizRate}}": String(stats.quizCorrectRate || 0),
      "{{timelineCount}}": String(stats.eventCount || 0),
      "{{flashTodayCount}}": String(stats.flashTodayCount || 0),
      "{{flashQaCount}}": String(stats.flashQaCount || 0),
      "{{capsuleCount}}": String(stats.capsuleCount || 0),
      "{{diaryCount}}": String(stats.diaryEntryCount || 0),
      "{{ideaDraftCount}}": String(stats.ideaDraftCount || 0),
    };

    for (const [key, value] of Object.entries(replacements)) {
      html = html.split(key).join(value);
    }

    // 1. Timeline events section
    html = this._renderSectionBlock(html, "timelineEvents", () => {
      if (!t.events || !t.events.length) return "";
      return t.events.slice(0, 30).map((e) => ({
        start: formatEventTime(e.startAt),
        end: formatEventTime(e.endAt),
        title: this._escapeHtml(e.title || e.eventNodeId || "—"),
        duration: e._durationMinutes ? String(e._durationMinutes) : null,
      }));
    });

    // 2. Flash Q&A section — fully expanded
    html = this._renderSectionBlock(html, "flashQaSection", () => {
      if (!fqa.qaItems || !fqa.qaItems.length) return "";
      return {
        qaItems: fqa.qaItems.slice(0, 30).map((qa) => {
          const exchangesHtml = (qa.exchanges || []).map((ex) =>
            `<div class="flash-qa-q">🤔 ${this._escapeHtml(ex.q || "")}</div><div class="flash-qa-a">${this._escapeHtml(ex.a || "")}</div>`
          ).join("");
          return {
            original: this._escapeHtml(qa.original || ""),
            exchangesHtml: exchangesHtml,
          };
        }),
      };
    }, "qaItems");

    // 3. Memory capsules section
    html = this._renderSectionBlock(html, "capsuleSection", () => {
      if (!caps.capsules || !caps.capsules.length) return "";
      return {
        capsules: caps.capsules.slice(0, 15).map((c) => ({
          theme: this._escapeHtml(c.theme || "未命名胶囊"),
          summary: this._escapeHtml(c.summary || ""),
          linkedCount: String(c.linkedCount || 1),
        })),
      };
    }, "capsules");

    // 4. Flash items section
    html = this._renderSectionBlock(html, "flashItems", () => {
      if (!f.todayItems || !f.todayItems.length) return "";
      return f.todayItems.slice(0, 30).map((item) => ({
        text: this._escapeHtml(item.rawText || item.cleanedText || ""),
        mood: item.mood || null,
        category: item.category || null,
      }));
    });

    // 5. Task section
    html = this._renderTaskSection(html, tasks);

    // 6. Diary section
    html = this._renderSectionBlock(html, "diarySection", () => {
      if (!d.entries || !d.entries.length) return "";
      return d.entries.slice(0, 20).map((entry) => ({
        time: entry.time || null,
        body: this._escapeHtml(entry.body.length > 500 ? entry.body.slice(0, 500) + "..." : entry.body),
      }));
    });

    // 7. Quiz section
    html = this._renderQuizSection(html, q);

    // 8. Idea refinement section
    html = this._renderSectionBlock(html, "ideaSection", () => {
      if (!ideas.drafts || !ideas.drafts.length) return "";
      return {
        drafts: ideas.drafts.slice(0, 20).map((idea) => ({
          title: this._escapeHtml(idea.title || "未命名构思"),
          lastRefined: idea.lastRefined ? `最近完善：${idea.lastRefined}` : "",
        })),
      };
    }, "drafts");

    // 9. Tomorrow plan
    html = this._renderTomorrowPlan(html, data);

    return html;
  }

  _renderSectionBlock(html, sectionName, buildItems, listName = "items") {
    const items = buildItems();
    // Determine if the result is an object with a named list (e.g. { qaItems: [...] }) or a plain array
    const isNestedObject = items && typeof items === "object" && !Array.isArray(items);
    const itemList = isNestedObject ? (items[listName] || []) : (Array.isArray(items) ? items : []);
    const hasItems = itemList.length > 0;

    // Replace the {{#sectionName}}...{{/sectionName}} block
    const openTag = `{{#${sectionName}}}`;
    const closeTag = `{{/${sectionName}}}`;

    const openIdx = html.indexOf(openTag);
    const closeIdx = html.indexOf(closeTag);
    if (openIdx === -1 || closeIdx === -1) return html;

    const before = html.slice(0, openIdx);
    const block = html.slice(openIdx + openTag.length, closeIdx);
    const after = html.slice(closeIdx + closeTag.length);

    // Extract the named list sub-block: {{#listName}}...{{/listName}}
    const itemsOpenTag = `{{#${listName}}}`;
    const itemsCloseTag = `{{/${listName}}}`;
    const emptyOpenTag = `{{^${listName}}}`;
    const emptyCloseTag = `{{/${listName}}}`;

    const itemsOpenIdx = block.indexOf(itemsOpenTag);
    const itemsCloseIdx = block.lastIndexOf(itemsCloseTag);
    const emptyOpenIdx = block.indexOf(emptyOpenTag);

    let renderedBlock;
    if (hasItems && itemsOpenIdx !== -1 && itemsCloseIdx !== -1) {
      const itemTemplate = block.slice(itemsOpenIdx + itemsOpenTag.length, block.indexOf(itemsCloseTag, itemsOpenIdx));
      const renderedItems = itemList.map((item) => this._renderItem(itemTemplate, item)).join("\n");
      renderedBlock = block.slice(0, itemsOpenIdx) + renderedItems + block.slice(itemsCloseIdx + itemsCloseTag.length);

      // Remove the empty block if present
      if (emptyOpenIdx !== -1) {
        const emptyCloseIdxAfter = renderedBlock.indexOf(emptyCloseTag, emptyOpenIdx);
        if (emptyCloseIdxAfter !== -1) {
          renderedBlock = renderedBlock.slice(0, emptyOpenIdx) + renderedBlock.slice(emptyCloseIdxAfter + emptyCloseTag.length);
        }
      }
    } else {
      // No items: keep empty block, remove items block
      if (emptyOpenIdx !== -1) {
        const start = block.lastIndexOf(itemsOpenTag, emptyOpenIdx);
        if (start !== -1) {
          renderedBlock = block.slice(0, start) + block.slice(emptyOpenIdx);
        } else {
          renderedBlock = block;
        }
      } else {
        renderedBlock = block;
      }
    }

    // Clean up any remaining mustache tags
    renderedBlock = renderedBlock.replace(/\{\{[#^/]\w+\}\}/g, "");
    renderedBlock = renderedBlock.replace(/\{\{\w+\}\}/g, "");

    return before + renderedBlock + after;
  }

  _renderTaskSection(html, tasks) {
    const sectionName = "taskSection";
    const openTag = `{{#${sectionName}}}`;
    const closeTag = `{{/${sectionName}}}`;

    const openIdx = html.indexOf(openTag);
    const closeIdx = html.indexOf(closeTag);
    if (openIdx === -1 || closeIdx === -1) return html;

    const before = html.slice(0, openIdx);
    const block = html.slice(openIdx + openTag.length, closeIdx);
    const after = html.slice(closeIdx + closeTag.length);

    let rendered = block;

    // Handle {{#hasCompleted}}...{{/hasCompleted}}
    rendered = this._renderConditionalList(rendered, "hasCompleted", "completed",
      (tasks.completed || []).slice(0, 10).map((t) => ({ text: this._escapeHtml(t.text || t.id || "") })));
    // Handle {{#hasPending}}...{{/hasPending}}
    rendered = this._renderConditionalList(rendered, "hasPending", "pending",
      (tasks.pending || []).slice(0, 10).map((t) => ({ text: this._escapeHtml(t.text || t.id || "") })));

    rendered = rendered.replace(/\{\{[#^/]\w+\}\}/g, "");
    rendered = rendered.replace(/\{\{\w+\}\}/g, "");

    return before + rendered + after;
  }

  _renderConditionalList(block, condName, listName, items) {
    const openTag = `{{#${condName}}}`;
    const closeTag = `{{/${condName}}}`;
    const openIdx = block.indexOf(openTag);
    const closeIdx = block.indexOf(closeTag);

    if (openIdx === -1 || closeIdx === -1) return block;

    const inner = block.slice(openIdx + openTag.length, closeIdx);
    const listOpenTag = `{{#${listName}}}`;
    const listCloseTag = `{{/${listName}}}`;
    const listOpenIdx = inner.indexOf(listOpenTag);
    const listCloseIdx = inner.lastIndexOf(listCloseTag);

    if (items.length > 0 && listOpenIdx !== -1 && listCloseIdx !== -1) {
      const itemTemplate = inner.slice(listOpenIdx + listOpenTag.length, inner.indexOf(listCloseTag, listOpenIdx));
      const renderedItems = items.map((item) => this._renderItem(itemTemplate, item)).join("\n");
      return block.slice(0, openIdx) + inner.slice(0, listOpenIdx) + renderedItems + inner.slice(listCloseIdx + listCloseTag.length) + block.slice(closeIdx + closeTag.length);
    } else {
      return block.slice(0, openIdx) + block.slice(closeIdx + closeTag.length);
    }
  }

  _renderQuizSection(html, q) {
    const sectionName = "quizSection";
    const openTag = `{{#${sectionName}}}`;
    const closeTag = `{{/${sectionName}}}`;

    const openIdx = html.indexOf(openTag);
    const closeIdx = html.indexOf(closeTag);
    if (openIdx === -1 || closeIdx === -1) return html;

    const before = html.slice(0, openIdx);
    const block = html.slice(openIdx + openTag.length, closeIdx);
    const after = html.slice(closeIdx + closeTag.length);

    let rendered = block;

    if (q.exists && q.todayCount > 0) {
      const replacements = {
        "{{todayCount}}": String(q.todayCount || 0),
        "{{todayCorrectRate}}": String(q.todayCorrectRate || 0),
        "{{overallCount}}": String(q.overallTotalAnswers || 0),
        "{{overallRate}}": String(Math.round((q.overallCorrectRate || 0) * 100)),
      };
      for (const [key, value] of Object.entries(replacements)) {
        rendered = rendered.split(key).join(value);
      }
    }

    rendered = rendered.replace(/\{\{[#^/]\w+\}\}/g, "");
    rendered = rendered.replace(/\{\{\w+\}\}/g, "");

    return before + rendered + after;
  }

  _renderTomorrowPlan(html, data) {
    const planText = data._tomorrowPlan || "";
    const openTag = "{{#tomorrowPlan}}";
    const closeTag = "{{/tomorrowPlan}}";
    const emptyOpenTag = "{{^tomorrowPlan}}";
    const emptyCloseTag = "{{/tomorrowPlan}}";

    const openIdx = html.indexOf(openTag);
    const closeIdx = html.indexOf(closeTag);
    if (openIdx === -1 || closeIdx === -1) return html;

    const before = html.slice(0, openIdx);
    const block = html.slice(openIdx + openTag.length, closeIdx);
    const after = html.slice(closeIdx + closeTag.length);

    if (planText) {
      let rendered = block.replace("{{plan}}", this._escapeHtml(planText));
      // Remove empty block
      const emptyIdx = rendered.indexOf(emptyOpenTag);
      if (emptyIdx !== -1) {
        const emptyCloseIdx = rendered.indexOf(emptyCloseTag, emptyIdx);
        if (emptyCloseIdx !== -1) {
          rendered = rendered.slice(0, emptyIdx) + rendered.slice(emptyCloseIdx + emptyCloseTag.length);
        }
      }
      return before + rendered + after;
    } else {
      // Keep empty block, remove the if-block
      const ifCloseIdx = block.indexOf(closeTag);
      const emptyStart = block.indexOf(emptyOpenTag);
      let rendered = block;
      if (ifCloseIdx !== -1 && emptyStart !== -1 && emptyStart < ifCloseIdx) {
        rendered = block.slice(0, emptyStart - (closeTag.length + 1 > 0 ? closeTag.length + 1 : 0)) + block.slice(emptyStart);
      }
      return before + rendered + after;
    }
  }

  _renderItem(template, item) {
    let result = template;
    for (const [key, value] of Object.entries(item)) {
      if (value !== null && value !== undefined) {
        result = result.split(`{{${key}}}`).join(String(value));
      }
    }
    // Remove unused optional tags
    result = result.replace(/\{\{#\w+\}\}[\s\S]*?\{\{\/\w+\}\}/g, "");
    result = result.replace(/\{\{\^?\w+\}\}/g, "");
    return result;
  }

  _escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  _parseDate(dateStr) {
    const parts = String(dateStr || "").split("-");
    if (parts.length === 3) {
      return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    }
    return null;
  }

  _fallbackHtmlTemplate() {
    return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>日终总结 · {{date}}</title></head><body><h1>📋 {{dateLabel}}</h1><p>Summary data available in JSON format.</p></body></html>`;
  }

  // ---- Markdown rendering ----

  _renderMarkdown(data) {
    const { date, sections, stats } = data;
    const t = sections.timeline || {};
    const d = sections.diary || {};
    const f = sections.flash || {};
    const fqa = sections.flashQa || {};
    const caps = sections.capsules || {};
    const q = sections.quiz || {};
    const tasks = sections.tasks || {};
    const ideas = sections.ideas || {};

    const lines = [
      "---",
      `type: daily-summary`,
      `date: ${date}`,
      `generated: ${data.generatedAt}`,
      `screenshot: ${data._screenshotPath || ""}`,
      "---",
      "",
      `# 📋 日终总结 · ${date}`,
      "",
    ];

    // Screenshot embed (if attached later)
    if (data._screenshotPath) {
      lines.push(`![日终总结截图](${data._screenshotPath})`, "");
    }

    lines.push("## ⏱ 时间轨迹", "");

    if (t.exists && t.events && t.events.length > 0) {
      for (const event of t.events.slice(0, 30)) {
        const startTime = formatEventTime(event.startAt);
        const endTime = formatEventTime(event.endAt);
        const title = event.title || event.eventNodeId || "—";
        const dur = event._durationMinutes ? ` (${event._durationMinutes}分钟)` : "";
        lines.push(`- ${startTime} - ${endTime}  ${title}${dur}`);
      }
      if (t.totalMinutes > 0) {
        lines.push(`- **总计追踪时间：${Math.round(t.totalMinutes / 60)}h ${t.totalMinutes % 60}分钟**`);
      }
    } else {
      lines.push("（今日无时间轴记录）");
    }

    // Memory capsules
    if (caps.capsuleCount > 0 && caps.capsules) {
      lines.push("", "## 💊 记忆胶囊", "");
      for (const capsule of caps.capsules.slice(0, 10)) {
        lines.push(`- **${capsule.theme}**：${capsule.summary}（${capsule.linkedCount} 条关联闪存）`);
      }
    }

    // Flash Q&A
    if (fqa.qaCount > 0 && fqa.qaItems) {
      lines.push("", "## 💬 记忆碎片问答", "");
      for (const qa of fqa.qaItems.slice(0, 30)) {
        lines.push(`- 💡 ${qa.original}`);
        for (const ex of qa.exchanges) {
          lines.push(`  - 🤔 ${ex.q}`);
          lines.push(`  - ${ex.a}`);
        }
        lines.push("");
      }
    }

    lines.push("", "## 💡 今日灵感", "");
    if (f.todayCount > 0 && f.todayItems) {
      for (const item of f.todayItems.slice(0, 30)) {
        const moodTag = item.mood ? ` \`${item.mood}\`` : "";
        const catTag = item.category ? ` [${item.category}]` : "";
        lines.push(`- ${item.rawText || item.cleanedText}${catTag}${moodTag}`);
      }
    } else {
      lines.push("（今日无闪存灵感）");
    }

    lines.push("", "## ✅ 完成事项", "");
    if (tasks.completedCount > 0) {
      for (const task of tasks.completed.slice(0, 20)) {
        lines.push(`- [x] ${task.text || task.id}`);
      }
    } else {
      lines.push("（今日无已完成任务）");
    }

    if (tasks.pendingCount > 0) {
      lines.push("", "### 📝 待完成", "");
      for (const task of tasks.pending.slice(0, 20)) {
        lines.push(`- [ ] ${task.text || task.id}`);
      }
    }

    lines.push("", "## 📝 日记片段", "");
    if (d.exists && d.entries && d.entries.length > 0) {
      for (const entry of d.entries.slice(0, 20)) {
        const timePrefix = entry.time ? `**${entry.time}** ` : "";
        const bodyPreview = entry.body.length > 500 ? entry.body.slice(0, 500) + "..." : entry.body;
        lines.push(`- ${timePrefix}${bodyPreview}`);
      }
    } else {
      lines.push("（今日无日记记录）");
    }

    lines.push("", "## 🧠 学习记录", "");
    if (q.todayCount > 0) {
      lines.push(`- 今日答题 ${q.todayTotal || q.todayCount} 题，正确 ${q.todayCorrect || 0} 题`);
      lines.push(`- 正确率：${q.todayCorrectRate || 0}%`);
      lines.push(`- 知识库总答题：${q.overallTotalAnswers || 0} 题，总体正确率 ${Math.round((q.overallCorrectRate || 0) * 100)}%`);
    } else {
      lines.push("（今日无学习记录）");
    }

    // Idea refinement section
    if (ideas.draftCount > 0 && ideas.drafts) {
      lines.push("", "## 🏗️ 大构思完善", "");
      for (const idea of ideas.drafts.slice(0, 20)) {
        const refinedInfo = idea.lastRefined ? `（最近完善：${idea.lastRefined}）` : "";
        lines.push(`- 📄 [[${idea.title}]] ${refinedInfo}`);
      }
    } else {
      lines.push("", "## 🏗️ 大构思完善", "");
      lines.push("（暂无构思草稿 · 将你的构思放入 `大构思/` 目录即可开始）");
    }

    lines.push("", "## 🔮 明天计划", "", "（待补充）", "");
    lines.push("---");
    lines.push(`🤖 由 Cyberboss v0.2.0 自动生成 · ${date}`);

    return lines.join("\n") + "\n";
  }

  // ---- Persistence ----

  _summaryPaths(dateLabel) {
    // Primary: Obsidian vault (if configured)
    const obsidianDir = process.env.CYBERBOSS_OBSIDIAN_VAULT;
    const weekday = getDayOfWeekChinese(dateLabel);
    const readableName = `${dateLabel}-${weekday}-日终总结`;

    const baseDir = obsidianDir
      ? path.join(obsidianDir, "每日总结", dateLabel.slice(0, 4), dateLabel.slice(5, 7))
      : path.join(this.config?.stateDir || path.join(os.homedir(), ".cyberboss"), "daily-summaries", dateLabel.slice(0, 4), dateLabel.slice(5, 7));

    return {
      baseDir,
      draftFile: path.join(baseDir, `${readableName}_草稿.md`),
      finalFile: path.join(baseDir, `${readableName}.md`),
      dataFile: path.join(baseDir, `${readableName}_data.json`),
    };
  }

  _persistSummary(dateLabel, mdContent, summaryData) {
    const paths = this._summaryPaths(dateLabel);
    const savedPaths = {};

    try {
      ensureDir(paths.baseDir);

      // Always write draft first
      fs.writeFileSync(paths.draftFile, mdContent, "utf8");
      savedPaths.draft = paths.draftFile;

      // Write structured data for HTML rendering
      fs.writeFileSync(paths.dataFile, JSON.stringify(summaryData, null, 2), "utf8");
      savedPaths.data = paths.dataFile;
    } catch (err) {
      savedPaths.error = err.message;
    }

    return savedPaths;
  }

  /**
   * Attach a screenshot image reference to an existing daily summary MD file.
   * Inserts `![日终总结截图](screenshotPath)` after the title line.
   */
  attachScreenshot({ date = "", screenshotPath = "" } = {}) {
    const dateLabel = date || formatDate(new Date());
    const normalizedPath = String(screenshotPath || "").trim();
    if (!normalizedPath) {
      throw new Error("screenshotPath is required.");
    }

    const paths = this._summaryPaths(dateLabel);
    const targetFile = fs.existsSync(paths.finalFile) ? paths.finalFile : paths.draftFile;

    if (!fs.existsSync(targetFile)) {
      throw new Error(`No summary found for ${dateLabel}. Generate it first.`);
    }

    const originalContent = fs.readFileSync(targetFile, "utf8");

    // Check if a screenshot is already embedded
    if (originalContent.includes("![日终总结截图]")) {
      // Replace existing screenshot reference
      const updated = originalContent.replace(
        /!\[日终总结截图\]\([^)]+\)/,
        `![日终总结截图](${normalizedPath})`
      );
      fs.writeFileSync(targetFile, updated, "utf8");
    } else {
      // Insert after the title line (# 📋 日终总结 · YYYY-MM-DD)
      const titleRegex = /^(# 📋 日终总结 · .+)$/m;
      const match = titleRegex.exec(originalContent);
      if (match) {
        const insertPos = match.index + match[0].length;
        const before = originalContent.slice(0, insertPos);
        const after = originalContent.slice(insertPos);
        const updated = `${before}\n\n![日终总结截图](${normalizedPath})\n${after}`;
        fs.writeFileSync(targetFile, updated, "utf8");
      } else {
        // Fallback: prepend after frontmatter
        const updated = originalContent.replace(
          /(^---\n[\s\S]*?\n---\n)/,
          `$1\n![日终总结截图](${normalizedPath})\n`
        );
        fs.writeFileSync(targetFile, updated, "utf8");
      }
    }

    // Also update the data JSON
    if (fs.existsSync(paths.dataFile)) {
      try {
        const dataJson = JSON.parse(fs.readFileSync(paths.dataFile, "utf8"));
        dataJson._screenshotPath = normalizedPath;
        fs.writeFileSync(paths.dataFile, JSON.stringify(dataJson, null, 2), "utf8");
      } catch { /* ignore */ }
    }

    return { ok: true, date: dateLabel, filePath: targetFile, screenshotPath: normalizedPath };
  }

  /**
   * Finalize a draft — move to final file.
   */
  finalize({ date = "" } = {}) {
    const dateLabel = date || formatDate(new Date());
    const paths = this._summaryPaths(dateLabel);

    if (!fs.existsSync(paths.draftFile)) {
      throw new Error(`No draft summary found for ${dateLabel}`);
    }

    const content = fs.readFileSync(paths.draftFile, "utf8");
    fs.writeFileSync(paths.finalFile, content, "utf8");

    return { ok: true, date: dateLabel, filePath: paths.finalFile };
  }

  _diaryFilePath(dateLabel) {
    return path.join(
      this.config?.diaryDir || path.join(os.homedir(), ".cyberboss", "diary"),
      `${dateLabel}.md`
    );
  }

  _readQuizHistory() {
    const knowledgeDir = process.env.CYBERBOSS_KNOWLEDGE_BASE_DIR
      || path.join(this.config?.stateDir || path.join(os.homedir(), ".cyberboss"), "knowledge-base");
    const historyFile = path.join(knowledgeDir, "_quiz_history.json");
    if (!fs.existsSync(historyFile)) return { version: 1, answers: {} };
    try {
      return JSON.parse(fs.readFileSync(historyFile, "utf8"));
    } catch {
      return { version: 1, answers: {} };
    }
  }

  _readLastGenerated(dateLabel) {
    const paths = this._summaryPaths(dateLabel);
    if (fs.existsSync(paths.finalFile)) {
      try {
        const stat = fs.statSync(paths.finalFile);
        return stat.mtime.toISOString();
      } catch { /* ignore */ }
    }
    if (fs.existsSync(paths.draftFile)) {
      try {
        const stat = fs.statSync(paths.draftFile);
        return stat.mtime.toISOString();
      } catch { /* ignore */ }
    }
    return null;
  }
}

// ---- Helpers ----

function formatDate(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatEventTime(isoStr) {
  if (!isoStr) return "??:??";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Shanghai",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(isoStr));
  } catch {
    return "??:??";
  }
}

function getDayOfWeekChinese(dateStr) {
  const parts = String(dateStr || "").split("-");
  if (parts.length !== 3) return "";
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if (Number.isNaN(d.getTime())) return "";
  const days = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return days[d.getDay()];
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

module.exports = { DailySummaryService };
