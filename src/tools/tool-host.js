const path = require("path");
const os = require("os");
const { WhereaboutsToolHost } = require("whereabouts-mcp");
const {
  STICKER_DESC_GUIDANCE,
  STICKER_DESC_FIELD_DESCRIPTION,
  STICKER_TAG_GUIDANCE,
} = require("../services/sticker-service");

let knowledgeQuizSession = null; // Module-level session for commute quiz

class ProjectToolHost {
  constructor({ services, runtimeContextStore }) {
    this.services = services;
    this.runtimeContextStore = runtimeContextStore;
    this.extraToolHosts = createExtraToolHosts(services);
  }

  listTools() {
    const builtIn = PROJECT_TOOLS.map((tool) => ({
      name: tool.name,
      description: buildToolDescription(tool),
      inputSchema: tool.inputSchema,
    }));
    const extra = this.extraToolHosts.flatMap((host) => host.listTools());
    return [...builtIn, ...extra];
  }

  async invokeTool(toolName, args = {}, context = {}) {
    const spec = PROJECT_TOOLS.find((candidate) => candidate.name === toolName);
    const normalizedArgs = args && typeof args === "object" ? args : {};
    if (spec) {
      validateSchema(spec.inputSchema, normalizedArgs, toolName, "input");
      const resolvedContext = this.resolveContext(context);
      return await spec.handler({
        services: this.services,
        args: normalizedArgs,
        context: resolvedContext,
      });
    }
    for (const host of this.extraToolHosts) {
      if (host.listTools().some((tool) => tool.name === toolName)) {
        return await host.invokeTool(toolName, normalizedArgs);
      }
    }
    throw new Error(`Unknown tool: ${toolName}`);
  }

  resolveContext(context = {}) {
    const explicitWorkspaceRoot = normalizeText(context.workspaceRoot);
    const explicitRuntimeId = normalizeText(context.runtimeId);
    const active = this.runtimeContextStore.resolveActiveContext({
      workspaceRoot: explicitWorkspaceRoot,
      runtimeId: explicitRuntimeId,
    }) || {};
    return {
      runtimeId: explicitRuntimeId || normalizeText(active.runtimeId),
      workspaceRoot: explicitWorkspaceRoot || normalizeText(active.workspaceRoot),
      threadId: normalizeText(context.threadId) || normalizeText(active.threadId),
      bindingKey: normalizeText(context.bindingKey) || normalizeText(active.bindingKey),
      accountId: normalizeText(context.accountId) || normalizeText(active.accountId),
      senderId: normalizeText(context.senderId) || normalizeText(active.senderId),
      testMode: Boolean(context.testMode) || Boolean(active.testMode),
    };
  }
}

function listProjectToolNames() {
  return [
    ...PROJECT_TOOLS.map((tool) => tool.name),
    ...STATIC_EXTRA_TOOL_NAMES,
  ];
}

const PROJECT_TOOLS = [
  {
    name: "cyberboss_diary_append",
    description: "Append a diary entry or set the end-of-day mood snapshot. Input: { text: string, title?: string, date?: string, time?: string, mood?: string } — pass 'mood' to set the daily mood (开心/一般/低落/烦躁/疲惫/充实/焦虑/平静/兴奋), otherwise a diary entry is appended.",
    shortHint: "Append a diary entry or set daily mood snapshot.",
    topics: ["diary"],
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Diary body to append (required for append)." },
        title: { type: "string", description: "Optional short entry title." },
        date: { type: "string", description: "Optional date in YYYY-MM-DD." },
        time: { type: "string", description: "Optional time in HH:mm." },
        mood: { type: "string", description: "Set the end-of-day mood snapshot. Must be one of: 开心, 一般, 低落, 烦躁, 疲惫, 充实, 焦虑, 平静, 兴奋. When this is set, 'text' is optional and will be appended as a mood note." },
      },
      additionalProperties: false,
    },
    async handler({ services, args, context }) {
      // set_mood path: write mood to diary frontmatter
      if (args.mood) {
        const result = await services.diary.setMood({
          date: args.date,
          mood: args.mood,
        });
        // If text is also provided, append it as a mood note
        if (args.text) {
          await services.diary.append({
            text: args.text,
            title: "情绪快照",
            date: args.date,
            time: args.time,
          });
        }
        if (context.testMode) {
          result.testCopy = writeTestModeCopy({
            context,
            sourcePath: result.filePath,
            subDir: "日记",
            dataType: "diary-mood",
            summary: `Mood: ${result.mood}`,
          });
        }
        return {
          text: `Mood set: ${result.mood} (score: ${result.mood_score}) → ${result.filePath}`,
          data: result,
        };
      }

      // Default: append diary entry
      if (!args.text) {
        throw new Error("text is required when mood is not set.");
      }
      const result = await services.diary.append(args);
      if (context.testMode) {
        const testCopy = writeTestModeCopy({
          context,
          sourcePath: result.filePath,
          subDir: "日记",
          dataType: "diary",
          summary: `Diary entry: ${result.date}`,
        });
        result.testCopy = testCopy;
      }
      return {
        text: `Diary appended to ${result.filePath}`,
        data: result,
      };
    },
  },
  {
    name: "cyberboss_user_feedback",
    description: "Capture user feedback (bug report, feature request, UX feedback) and save it to the Obsidian vault. Use this when the user reports a bug, suggests a feature, or gives feedback about Cyberboss behavior.",
    shortHint: "Save user feedback to the Obsidian vault.",
    topics: ["feedback"],
    inputSchema: {
      type: "object",
      required: ["title", "content"],
      properties: {
        category: { type: "string", description: "Feedback category: bug, feature-request, ux, or other." },
        title: { type: "string", description: "Brief title for the feedback entry." },
        context: { type: "string", description: "What the user was doing when the feedback arose." },
        content: { type: "string", description: "The feedback details or issue description." },
        priority: { type: "string", description: "Priority: high, medium, or low." },
        date: { type: "string", description: "Optional date in YYYY-MM-DD. Defaults to today." },
      },
      additionalProperties: false,
    },
    async handler({ services, args, context }) {
      const result = services.feedback.capture(args);
      try {
        const { recordActivity } = require("../services/activity-context");
        if (recordActivity) {
          await recordActivity({
            context,
            sourcePath: result.filePath,
            subDir: "用户反馈",
            dataType: "feedback",
            summary: `Feedback: ${result.title}`,
          });
        }
      } catch (_) {
        // activity recording is best-effort
      }
      return {
        text: result.appended
          ? `Feedback appended to ${result.filePath}`
          : `Feedback saved to ${result.filePath}`,
        data: result,
      };
    },
  },
  {
    name: "cyberboss_reminder_create",
    description: "Create a reminder in Cyberboss.",
    shortHint: "Create a reminder with direct text plus delayMinutes or dueAt.",
    topics: ["reminder"],
    inputSchema: {
      type: "object",
      required: ["text"],
      properties: {
        text: { type: "string", description: "Reminder text to send back later." },
        delayMinutes: { type: "integer", description: "Minutes from now before the reminder fires." },
        dueAt: { type: "string", description: "Absolute time such as 2026-04-07T21:30+08:00." },
        userId: { type: "string", description: "Optional explicit WeChat user id." },
      },
      additionalProperties: false,
    },
    async handler({ services, args, context }) {
      const result = await services.reminder.create(args, context);
      return {
        text: `Reminder queued: ${result.id}`,
        data: result,
      };
    },
  },
  {
    name: "cyberboss_flash_memory",
    description: "Capture, list, update, and organize flash memory items (fleeting ideas, inspirations, and to-dos from the user). Use this to save a user's spontaneous thought and later review or categorize it.",
    shortHint: "Capture or manage flash memory items with action parameter.",
    topics: ["flash_memory"],
    inputSchema: {
      type: "object",
      required: ["action"],
      properties: {
        action: {
          type: "string",
          description: "Action: capture (save a new flash), list (browse items), update (modify one item), batch_update (bulk categorize/merge/archive), review_suggestions (get items needing review), write_roundup (write consolidation note for Obsidian graph view).",
          enum: ["capture", "list", "update", "batch_update", "review_suggestions", "write_roundup"],
        },
        text: { type: "string", description: "[capture] The raw text of the fleeting thought." },
        category: { type: "string", description: "[capture|list] Category: dev, life, idea, todo, or learning." },
        tags: { type: "array", items: { type: "string" }, description: "[capture|update] Tags for the flash item." },
        priority: { type: "string", description: "[capture|update] Priority: high, medium, or low." },
        mood: { type: "string", description: "[capture|update] Emotion tag: excited, anxious, curious, determined, tired, or playful." },
        status: { type: "string", description: "[list] Filter by status: inbox, categorized, archived, merged, or all." },
        limit: { type: "integer", description: "[list] Max items to return (default 20)." },
        offset: { type: "integer", description: "[list] Pagination offset." },
        id: { type: "string", description: "[update] The flash item id to modify." },
        updates: { type: "object", description: "[update] Fields to update: { category?, tags?, status?, priority?, cleanedText?, relatedFlashIds?, mergedToIdeaId? }." },
        operations: {
          type: "array",
          description: "[batch_update] Array of operations: { action: 'categorize'|'merge'|'archive', ids: string[], category?: string, into?: string }.",
          items: { type: "object" },
        },
        since: { type: "string", description: "[review_suggestions] Optional date filter for review suggestions." },
        // write_roundup params
        date: { type: "string", description: "[write_roundup] Date label (YYYY-MM-DD)." },
        theme: { type: "string", description: "[write_roundup] One-line theme summary." },
        dedupGroups: { type: "array", items: { type: "object" }, description: "[write_roundup] Dedup groups." },
        links: { type: "array", items: { type: "object" }, description: "[write_roundup] Flash-to-flash links: { from, to, relation }." },
        moodCounts: { type: "object", description: "[write_roundup] Mood distribution counts." },
        categorizedItems: { type: "array", items: { type: "object" }, description: "[write_roundup] Categorized flash items for the roundup." },
      },
      additionalProperties: false,
    },
    async handler({ services, args, context }) {
      const action = String(args.action || "").trim();
      let result;
      switch (action) {
        case "capture": {
          result = await services.flashMemory.capture({
            text: args.text,
            category: args.category,
            tags: args.tags,
            priority: args.priority,
            mood: args.mood,
          });
          // Test mode: also write to test vault
          if (context.testMode) {
            result.testCopy = writeTestModeCopy({
              context,
              sourcePath: result.filePath,
              subDir: "闪存记忆",
              dataType: "flash",
              summary: `Flash: ${result.id}`,
            });
          }
          return { text: `Flash captured: ${result.id}`, data: result };
        }
        case "list": {
          result = await services.flashMemory.list({
            status: args.status,
            category: args.category,
            limit: args.limit,
            offset: args.offset,
          });
          return { text: `Flash items: ${result.items.length} of ${result.total} total.`, data: result };
        }
        case "update": {
          result = await services.flashMemory.update({
            id: args.id,
            updates: args.updates || {},
          });
          return { text: `Flash updated: ${result.id}`, data: result };
        }
        case "batch_update": {
          result = await services.flashMemory.batchUpdate({
            operations: args.operations || [],
          });
          const okCount = result.results.filter((r) => r.ok !== false).length;
          return { text: `Flash batch update: ${okCount}/${result.results.length} ok.`, data: result };
        }
        case "review_suggestions": {
          result = await services.flashMemory.reviewSuggestions({
            since: args.since,
          });
          return {
            text: `Review suggestions: ${result.inboxCount} in inbox, ${result.suggestedItems.length} suggested.${result.needsReview ? " Needs review!" : ""}`,
            data: result,
          };
        }
        case "write_roundup": {
          result = await services.flashMemory.writeRoundup({
            date: args.date,
            theme: args.theme,
            dedupGroups: args.dedupGroups,
            links: args.links,
            moodCounts: args.moodCounts,
            categorizedItems: args.categorizedItems,
          });
          // Test mode: also write to test vault
          if (context.testMode) {
            result.testCopy = writeTestModeCopy({
              context,
              sourcePath: result.filePath,
              subDir: "闪存记忆",
              dataType: "flash-roundup",
              summary: `Flash roundup: ${args.date || "recent"}`,
            });
          }
          return {
            text: `Flash roundup written: ${result.filePath}`,
            data: result,
          };
        }
        default:
          throw new Error(`Unknown flash_memory action: ${action}`);
      }
    },
  },
  {
    name: "cyberboss_knowledge_quiz",
    description: "Run a commute-learning quiz session. Pick a random question from the knowledge base, accept an answer, judge it, and return an explanation. Use this when the user is commuting or has a short idle window.",
    shortHint: "Start or continue a commute quiz session.",
    topics: ["knowledge", "quiz"],
    inputSchema: {
      type: "object",
      required: ["action"],
      properties: {
        action: {
          type: "string",
          description: "Action: start (begin a new session), next (get a question), submit (answer the current question), stop (end session with summary), status (show stats).",
          enum: ["start", "next", "submit", "stop", "status"],
        },
        category: { type: "string", description: "[start|next] Filter by category (e.g. 半导体物理, 单片机原理与应用)." },
        estimatedMinutes: { type: "integer", description: "[start] Estimated commute time in minutes (default 15)." },
        userAnswer: { type: "string", description: "[submit] The user's answer text." },
        itemId: { type: "string", description: "[submit] The id of the current question item." },
      },
      additionalProperties: false,
    },
    async handler({ services, args }) {
      const action = String(args.action || "").trim();
      const { KnowledgeQuizSession } = require("../services/knowledge-quiz-session");

      // Session is stored in a module-level variable (one session per MCP server lifetime)
      if (!knowledgeQuizSession) {
        knowledgeQuizSession = new KnowledgeQuizSession();
      }
      const session = knowledgeQuizSession;

      let result;
      switch (action) {
        case "start": {
          session.start({
            estimatedMinutes: args.estimatedMinutes || 15,
            category: args.category || "",
          });
          return {
            text: `Quiz session started. Estimated: ${session.estimatedDurationMin} min. Call 'next' to get the first question.`,
            data: { active: true, estimatedMinutes: session.estimatedDurationMin, category: session.category },
          };
        }
        case "next": {
          if (!session.active) {
            session.start({ category: args.category || "" });
          }
          const item = services.knowledge.pickNext({
            category: session.category || args.category || "",
            excludeIds: session.history.map((h) => h.itemId),
          });
          if (!item) {
            return { text: "No more questions available in this category.", data: null };
          }
          session.setCurrentItem(item);
          return {
            text: `Q: ${item.question}`,
            data: {
              itemId: item.id,
              question: item.question,
              difficulty: item.difficulty,
              estimatedMinutes: item.estimatedMinutes,
              category: item.category,
              tags: item.tags,
            },
          };
        }
        case "submit": {
          if (!session.active || !session.currentItem) {
            return { text: "No active question. Call 'next' first.", data: null };
          }
          const checkResult = services.knowledge.checkAnswer({
            itemId: args.itemId || session.currentItem.id,
            userAnswer: args.userAnswer || "",
          });
          session.recordAnswer({
            itemId: args.itemId || session.currentItem.id,
            userAnswer: args.userAnswer || "",
            correct: checkResult.correct === true,
            explanation: checkResult.explanation,
          });

          let replyText = "";
          if (checkResult.needsModelJudge) {
            replyText = "Answer received. (Model should judge correctness based on explanation below.)";
          } else if (checkResult.correct) {
            replyText = `✅ Correct! ${checkResult.explanation || ""}`;
          } else {
            replyText = `❌ Not quite. ${checkResult.explanation || ""}`;
            if (checkResult.missedKeywords.length) {
              replyText += `\n关键词: ${checkResult.missedKeywords.join(", ")}`;
            }
          }

          // Auto-check if time is up
          if (session.isTimeUp()) {
            const summary = session.end();
            replyText += `\n\n⏰ 时间到！本次通勤刷了 ${summary.totalQuestions} 题，正确率 ${summary.correctRate}%。`;
          }

          return {
            text: replyText,
            data: {
              ...checkResult,
              sessionSummary: session.isTimeUp() ? session.summary() : null,
              timeUp: session.isTimeUp(),
              elapsedSinceItem: session.elapsedSinceCurrentItem(),
            },
          };
        }
        case "stop": {
          const summary = session.end();
          return {
            text: `🏁 通勤学习结束。刷了 ${summary.totalQuestions} 题，正确 ${summary.correctCount}/${summary.totalQuestions}（${summary.correctRate}%），用时约 ${summary.durationMinutes} 分钟。`,
            data: summary,
          };
        }
        case "status": {
          const kbStats = services.knowledge.getStats();
          return {
            text: `Knowledge base: ${kbStats.totalItems} items. Session: ${session.active ? "active" : "idle"}. Overall correct rate: ${Math.round(kbStats.overallCorrectRate * 100)}%.`,
            data: {
              knowledgeBase: kbStats,
              session: session.active ? { ...session.summary(), active: true } : { active: false },
            },
          };
        }
        default:
          throw new Error(`Unknown knowledge_quiz action: ${action}`);
      }
    },
  },
  {
    name: "cyberboss_daily_summary",
    description: "Generate, view, and manage daily summary reports. Aggregates timeline, diary, flash memory, and commute quiz data into a structured end-of-day summary. The summary follows a psychological review framework and can be output as Markdown (for Obsidian) and HTML (for timeline dashboard).",
    shortHint: "Generate or manage daily summary reports.",
    topics: ["summary"],
    inputSchema: {
      type: "object",
      required: ["action"],
      properties: {
        action: {
          type: "string",
          description: "Action: generate (create a daily summary), status (check if summary exists), append_plan (add tomorrow's plan), finalize (lock a draft as final), read (get an existing summary's Markdown content), check (ask scheduler if it's time to generate), attach_screenshot (embed a screenshot image into the summary MD file), generate_weekly (aggregate 7 days into a weekly summary), generate_monthly (aggregate the month into a monthly summary), generate_daily_timeline (render daily-timeline.html template with timeline events — use this for 当日时间轴 screenshots).",
          enum: ["generate", "status", "append_plan", "finalize", "read", "check", "attach_screenshot", "generate_weekly", "generate_monthly", "generate_daily_timeline"],
        },
        date: { type: "string", description: "[all] Target date in YYYY-MM-DD. Defaults to today." },
        format: { type: "string", description: "[generate] Output format: full (complete summary with all sections) or brief (stats-only)." },
        includeSections: {
          type: "array",
          items: { type: "string" },
          description: "[generate] Sections to include: timeline, flash, diary, quiz, tasks. Default: all.",
        },
        plan: { type: "string", description: "[append_plan] Tomorrow's plan text to append." },
        screenshotPath: { type: "string", description: "[attach_screenshot] Absolute path to the screenshot PNG file to embed." },
      },
      additionalProperties: false,
    },
    async handler({ services, args, context }) {
      const action = String(args.action || "").trim();
      const { DailySummaryService } = require("../services/daily-summary-service");
      const { DailySummaryScheduler } = require("../services/daily-summary-scheduler");

      if (!services._dailySummary) {
        const config = services.diary?.config || services.timeline?.config || {};
        services._dailySummary = new DailySummaryService({
          config,
          services: {
            timeline: services.timeline,
            diary: services.diary,
            flashMemory: services.flashMemory,
            knowledge: services.knowledge,
          },
        });
      }
      if (!services._dailyScheduler) {
        const config = services.diary?.config || services.timeline?.config || {};
        services._dailyScheduler = new DailySummaryScheduler({ config });
      }
      const svc = services._dailySummary;
      const scheduler = services._dailyScheduler;

      switch (action) {
        case "check": {
          const check = scheduler.shouldGenerateNow();
          const state = scheduler.getState();
          return {
            text: check.shouldGenerate
              ? `🟢 Time for summary! ${check.reason}`
              : `🔴 Not time yet. ${check.reason}`,
            data: { shouldGenerate: check.shouldGenerate, reason: check.reason, state },
          };
        }
        case "generate": {
          // v0.3.3: pre-check — warn if today's observation log is missing
          // Persona update (Step 3) must happen BEFORE generate
          const observationLogMissing = checkObservationLogMissing({
            config: scheduler.config || services.diary?.config || {},
            date: args.date,
          });
          if (observationLogMissing) {
            console.warn(`[cyberboss] WARNING: Observation log missing for ${observationLogMissing.date}. Persona update (Step 3) may have been skipped.`);
          }

          const result = await svc.generate({
            date: args.date,
            format: args.format || "full",
            includeSections: Array.isArray(args.includeSections) ? args.includeSections : undefined,
          });
          // Mark generation in scheduler
          scheduler.markGenerated({ draft: true });
          // Test mode: also write to test vault
          if (context.testMode && result.mdPath) {
            result.testCopy = writeTestModeCopy({
              context,
              sourcePath: result.mdPath,
              subDir: "每日总结",
              dataType: "summary",
              summary: `Daily summary: ${result.date}`,
            });
          }
          return {
            text: `Daily summary generated for ${result.date}. Sections: ${Object.keys(result.sections).join(", ")}. Stats: ${result.stats.eventCount} events, ${result.stats.flashTodayCount} flashes, ${result.stats.quizTodayCount} quiz items.` + (observationLogMissing ? ` ⚠️ 画像观察日志缺失 — Step 3 可能被跳过。` : ""),
            data: { ...result, observationLogMissing },
          };
        }
        case "status": {
          const result = svc.status({ date: args.date });
          return {
            text: `Summary status for ${result.date}: draft=${result.draftExists}, final=${result.finalExists}. Available sections: ${result.sectionsAvailable.join(", ") || "none"}.`,
            data: result,
          };
        }
        case "append_plan": {
          const result = svc.appendPlan({ date: args.date, plan: args.plan });
          return {
            text: `Plan appended to ${result.date} summary: ${result.filePath}`,
            data: result,
          };
        }
        case "finalize": {
          const result = svc.finalize({ date: args.date });
          scheduler.markGenerated({ draft: false });
          return {
            text: `Summary finalized for ${result.date}: ${result.filePath}`,
            data: result,
          };
        }
        case "read": {
          const fs = require("fs");
          const os = require("os");
          const path = require("path");
          const dateLabel = String(args.date || "").trim() || new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
          const paths = svc._summaryPaths(dateLabel);
          const targetFile = fs.existsSync(paths.finalFile) ? paths.finalFile : paths.draftFile;
          if (!fs.existsSync(targetFile)) {
            return { text: `No summary found for ${dateLabel}.`, data: null };
          }
          const mdContent = fs.readFileSync(targetFile, "utf8");
          return {
            text: `Summary content loaded (${mdContent.length} chars).`,
            data: { date: dateLabel, filePath: targetFile, mdContent },
          };
        }
        case "attach_screenshot": {
          const result = svc.attachScreenshot({
            date: args.date,
            screenshotPath: args.screenshotPath,
          });
          return {
            text: `Screenshot attached to ${result.date} summary: ${result.filePath}`,
            data: result,
          };
        }
        case "generate_weekly": {
          const result = await svc.generateWeeklySummary({ date: args.date });
          return {
            text: `Weekly summary generated for ${result.weekLabel}. ${result.dailyCount} days tracked. Stats: ${result.stats.eventCount} events, ${result.stats.flashCount} flashes, ${result.stats.quizCount} quiz items, ${result.stats.quizRate}% correct. HTML: ${result.savedPaths.htmlFile}`,
            data: result,
          };
        }
        case "generate_monthly": {
          const result = await svc.generateMonthlySummary({ date: args.date });
          return {
            text: `Monthly summary generated for ${result.monthLabel}. ${result.dailyCount} days tracked. Stats: ${result.stats.eventCount} events, ${result.stats.flashCount} flashes, ${result.stats.quizCount} quiz items, ${result.stats.quizRate}% correct. HTML: ${result.savedPaths.htmlFile}`,
            data: result,
          };
        }
        case "generate_daily_timeline": {
          const result = await svc.generateDailyTimelineHtml({ date: args.date });
          return {
            text: `Daily timeline HTML generated for ${result.date}. ${result.stats.eventCount} events, ${result.stats.totalHours}h tracked, ${result.stats.categoryCount} categories. HTML: ${result.htmlFile}`,
            data: result,
          };
        }
        default:
          throw new Error(`Unknown daily_summary action: ${action}`);
      }
    },
  },
  {
    name: "cyberboss_idea_refinement",
    description: "Manage the Socratic idea refinement engine. Drop a plain .md file into 大构思/drafts/ — the engine reads it and starts a structured 5-phase questioning session: Phase 1 anchors concrete entities (who/when/cost), Phase 2 tests fragility and causal chains, Phase 3 finds external forces (competitors/chokepoints), Phase 4 forces minimum viable version and metrics, Phase 5 terminates. Sessions auto-save every turn — if interrupted, the next /refine or checkin will resume from where it left off.",
    shortHint: "Run the structured Socratic idea refinement engine.",
    topics: ["idea"],
    inputSchema: {
      type: "object",
      required: ["action"],
      properties: {
        action: {
          type: "string",
          description: "Action: scan_drafts (list drafts with session info), start_session (begin or resume refinement), next_question (get prompt for next phase question), submit_answer (record answer + advance, also applies model's question JSON with phase/coverage/entities), stop_session (finalize and write refined markdown), status (show active session state).",
          enum: ["scan_drafts", "start_session", "next_question", "submit_answer", "stop_session", "status"],
        },
        draftFile: { type: "string", description: "[start_session] The draft filename (e.g. my-idea.md) from scan_drafts." },
        sessionId: { type: "string", description: "[next_question, submit_answer, stop_session] The session ID from start_session." },
        answer: { type: "string", description: "[submit_answer] The user's answer text." },
        questionData: { type: "object", description: "[submit_answer] The model-generated question JSON: {question, rationale, phase, extracted_entities, coverage_update}." },
      },
      additionalProperties: false,
    },
    async handler({ services, args }) {
      const action = String(args.action || "").trim();
      const { IdeaRefinementService } = require("../services/idea-refinement-service");

      // Lazy-create if not already on services (following daily_summary pattern)
      if (!services._ideaRefinement) {
        const config = services.diary?.config || services.flashMemory?.config || {};
        services._ideaRefinement = new IdeaRefinementService({ config });
      }
      const svc = services._ideaRefinement;

      switch (action) {
        case "scan_drafts": {
          const result = svc.scanDrafts();
          const pending = result.drafts.filter((d) => d.status !== "completed");
          const withSessions = result.drafts.filter((d) => d.activeSession);
          return {
            text: `Found ${result.count} draft(s) total, ${pending.length} pending, ${withSessions.length} with active sessions.`,
            data: result,
          };
        }
        case "start_session": {
          if (!args.draftFile) {
            throw new Error("draftFile is required for start_session");
          }
          const result = svc.startSession(args.draftFile);
          const phaseLabel = ["", "澄清", "挑战", "视角", "落地", "整合"][result.session.phase] || "";
          if (result.resumed) {
            return {
              text: `Resumed session for "${result.session.draftTitle}" — turn ${result.session.turn}, Phase ${result.session.phase} (${phaseLabel}). Call next_question to continue.`,
              data: result,
            };
          }
          return {
            text: `Session started for "${result.session.draftTitle}" (${result.session.sessionId}). Phase 1 — 澄清：锚定具体实体。`,
            data: result,
          };
        }
        case "next_question": {
          if (!args.sessionId) {
            throw new Error("sessionId is required for next_question");
          }
          const prompt = svc.buildQuestionPrompt(args.sessionId);
          const phaseLabel = ["", "澄清", "挑战", "视角", "落地", "整合"][prompt.session.phase] || "";
          return {
            text: `Question prompt built for session ${args.sessionId}, Phase ${prompt.session.phase} (${phaseLabel}), turn ${prompt.session.turn + 1}. Read the draft content, then generate the next question as JSON: {question, rationale, phase, extracted_entities, coverage_update}. Present ONLY the question to the user.`,
            data: prompt,
          };
        }
        case "submit_answer": {
          if (!args.sessionId) {
            throw new Error("sessionId is required for submit_answer");
          }
          if (!args.answer && !args.questionData) {
            throw new Error("answer or questionData is required for submit_answer");
          }

          // Apply question JSON first if provided
          if (args.questionData) {
            svc.applyQuestion(args.sessionId, args.questionData);
          }

          // Record the answer (if provided)
          if (args.answer) {
            const result = svc.recordAnswer(args.sessionId, args.answer);
            if (result.shouldStop) {
              return {
                text: `Answer recorded. Session complete: ${result.terminationReason}. Call stop_session to finalize and save the refined output.`,
                data: result,
              };
            }
            return {
              text: `Answer recorded. Turn ${result.session.turn}, Phase ${result.session.phase}. Session auto-saved. Call next_question to continue.`,
              data: result,
            };
          }

          const session = svc.getSession(args.sessionId);
          return {
            text: `Question applied. Turn ${session.turn}, Phase ${session.phase}.`,
            data: { session },
          };
        }
        case "stop_session": {
          if (!args.sessionId) {
            throw new Error("sessionId is required for stop_session");
          }
          const result = svc.finalizeSession(args.sessionId);
          return {
            text: `Session finalized: ${result.session.draftTitle} (${result.session.turn} turns). Refined output saved to 大构思/refined/.`,
            data: result,
          };
        }
        case "status": {
          const active = svc.getActiveSession();
          const list = svc.listSessions();
          if (active) {
            const phaseLabel = ["", "澄清", "挑战", "视角", "落地", "整合"][active.phase] || "";
            return {
              text: `Active session: ${active.draftTitle} — turn ${active.turn}, Phase ${active.phase} (${phaseLabel}). Covered: ${active.coveredDimensions.join(", ") || "none"}. Total sessions: ${list.count}.`,
              data: { activeSession: active, allSessions: list },
            };
          }
          return {
            text: `No active session. Total sessions: ${list.count}.`,
            data: { activeSession: null, allSessions: list },
          };
        }
        default:
          throw new Error(`Unknown idea_refinement action: ${action}`);
      }
    },
  },
  {
    name: "cyberboss_system_send",
    description: "Queue an internal Cyberboss system trigger for the current bound workspace and chat.",
    shortHint: "Queue an internal system message for the current workspace.",
    topics: ["system"],
    inputSchema: {
      type: "object",
      required: ["text"],
      properties: {
        text: { type: "string" },
        workspaceRoot: { type: "string" },
        userId: { type: "string" },
      },
      additionalProperties: false,
    },
    async handler({ services, args, context }) {
      const result = services.system.queueMessage(args, context);
      return {
        text: `System message queued: ${result.id}`,
        data: result,
      };
    },
  },
  {
    name: "cyberboss_channel_send_file",
    description: "Send an existing local file back to the current WeChat chat.",
    shortHint: "Send a local file back to the current WeChat user.",
    topics: ["channel"],
    inputSchema: {
      type: "object",
      required: ["filePath"],
      properties: {
        filePath: { type: "string" },
        userId: { type: "string" },
      },
      additionalProperties: false,
    },
    async handler({ services, args, context }) {
      const result = await services.channelFile.sendToCurrentChat(args, context);
      return {
        text: `File sent: ${result.filePath}`,
        data: result,
      };
    },
  },
  {
    name: "cyberboss_sticker_tags",
    description: `Load the current sticker tag catalog and tagging rules only when you have decided a sticker is needed or an inbox image should be saved as a sticker. ${STICKER_TAG_GUIDANCE}`,
    shortHint: "Load sticker tags only when needed.",
    topics: ["sticker"],
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    async handler({ services }) {
      const result = await services.sticker.listTags();
      return {
        text: `Sticker tags loaded: ${Array.isArray(result.tags) ? result.tags.length : 0}.`,
        data: result,
      };
    },
  },
  {
    name: "cyberboss_sticker_pick",
    description: "List a few saved sticker candidates for one sticker tag after you have decided a sticker would help.",
    shortHint: "Pick sticker candidates by tag.",
    topics: ["sticker"],
    inputSchema: {
      type: "object",
      required: ["tag"],
      properties: {
        tag: { type: "string", description: "Sticker tag such as 可爱, 无语, 躺平, 感动, or OK." },
        limit: { type: "integer", description: "Optional maximum number of candidates to return." },
      },
      additionalProperties: false,
    },
    async handler({ services, args }) {
      const result = await services.sticker.pick(args);
      return {
        text: `Sticker candidates loaded: ${result.candidates.length}.`,
        data: result,
      };
    },
  },
  {
    name: "cyberboss_sticker_send",
    description: "Send a saved sticker back to the current WeChat chat by sticker id.",
    shortHint: "Send a saved sticker by id.",
    topics: ["sticker"],
    inputSchema: {
      type: "object",
      required: ["stickerId"],
      properties: {
        stickerId: { type: "string", description: "Sticker id such as stk_001." },
        userId: { type: "string", description: "Optional explicit WeChat user id." },
      },
      additionalProperties: false,
    },
    async handler({ services, args, context }) {
      const result = await services.sticker.sendToCurrentChat(args, context);
      return {
        text: `Sticker sent: ${result.stickerId}`,
        data: result,
      };
    },
  },
  {
    name: "cyberboss_sticker_delete",
    description: "Delete one or more saved stickers by sticker id and remove their local GIF files.",
    shortHint: "Delete saved stickers by id array.",
    topics: ["sticker"],
    inputSchema: {
      type: "object",
      required: ["items"],
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            required: ["stickerId"],
            properties: {
              stickerId: { type: "string", description: "Sticker id such as stk_001." },
            },
            additionalProperties: false,
          },
        },
      },
      additionalProperties: false,
    },
    async handler({ services, args, context }) {
      const result = await services.sticker.delete(args, context);
      return {
        text: `Sticker batch deleted: ${result.deletedCount}.`,
        data: result,
      };
    },
  },
  {
    name: "cyberboss_sticker_save_from_inbox",
    description: `Save one or more inbox images as reusable sticker GIFs after reading them all. Use an items array even for one sticker. ${STICKER_TAG_GUIDANCE} ${STICKER_DESC_GUIDANCE}`,
    shortHint: "Save inbox stickers with an items array.",
    topics: ["sticker"],
    inputSchema: {
      type: "object",
      required: ["items"],
      properties: {
        items: {
          type: "array",
          description: "One to ten inbox stickers to save in one call.",
          items: {
            type: "object",
            required: ["filePath", "tags", "desc"],
            properties: {
              filePath: { type: "string", description: "Absolute inbox image path under ~/.cyberboss/inbox." },
              tags: {
                type: "array",
                description: "One to three sticker tags. New short tags are allowed when the current catalog does not fit.",
                items: { type: "string" },
              },
              desc: { type: "string", description: STICKER_DESC_FIELD_DESCRIPTION },
            },
            additionalProperties: false,
          },
        },
        userId: { type: "string", description: "Optional explicit WeChat user id." },
      },
      additionalProperties: false,
    },
    async handler({ services, args, context }) {
      const result = await services.sticker.saveFromInbox(args, context);
      const duplicateNote = result.dedupedCount > 0
        ? " Existing stickers usually mean the user only sent them for you to see. Do not mention duplicates; just reply normally."
        : "";
      return {
        text: `Sticker batch processed: ${result.createdCount} saved, ${result.dedupedCount} already existed.${duplicateNote}`,
        data: result,
      };
    },
  },
  {
    name: "cyberboss_sticker_update",
    description: `Overwrite tags and desc for one or more saved stickers. Use an items array even for one sticker. ${STICKER_TAG_GUIDANCE} ${STICKER_DESC_GUIDANCE}`,
    shortHint: "Overwrite stickers with an items array.",
    topics: ["sticker"],
    inputSchema: {
      type: "object",
      required: ["items"],
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            required: ["stickerId", "tags", "desc"],
            properties: {
              stickerId: { type: "string", description: "Sticker id such as stk_001." },
              tags: {
                type: "array",
                description: "One to three sticker tags. New short tags are allowed when needed.",
                items: { type: "string" },
              },
              desc: { type: "string", description: STICKER_DESC_FIELD_DESCRIPTION },
            },
            additionalProperties: false,
          },
        },
      },
      additionalProperties: false,
    },
    async handler({ services, args }) {
      const result = await services.sticker.update(args);
      return {
        text: `Sticker batch updated: ${result.updatedCount}.`,
        data: result,
      };
    },
  },
  {
    name: "cyberboss_timeline_read",
    description: "Read the current timeline day data for a specific date. Use this before editing when the current day state is uncertain.",
    shortHint: "Read a timeline day before editing it.",
    topics: ["timeline"],
    inputSchema: {
      type: "object",
      required: ["date"],
      properties: {
        date: { type: "string", description: "Target date in YYYY-MM-DD." },
      },
      additionalProperties: false,
    },
    async handler({ services, args }) {
      const result = await services.timeline.read(args);
      const exists = !!result?.data?.exists;
      const eventCount = Number.isInteger(result?.data?.eventCount) ? result.data.eventCount : 0;
      return {
        text: `Timeline day ${args.date}: ${exists ? `${eventCount} events` : "missing"}.`,
        data: result,
      };
    },
  },
  {
    name: "cyberboss_timeline_categories",
    description: "List the current timeline taxonomy categories, subcategories, and event nodes. Use this before choosing category ids or event nodes.",
    shortHint: "Inspect the current timeline taxonomy before choosing category ids or event nodes.",
    topics: ["timeline"],
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    async handler({ services }) {
      const result = await services.timeline.listCategories();
      const categoryCount = Number.isInteger(result?.data?.categoryCount) ? result.data.categoryCount : 0;
      return {
        text: `Timeline categories loaded: ${categoryCount}.`,
        data: result,
      };
    },
  },
  {
    name: "cyberboss_timeline_proposals",
    description: "List proposed timeline event nodes, optionally filtered by date. Use this when deciding whether a new event node is actually needed.",
    shortHint: "Inspect proposed timeline event nodes before introducing new taxonomy.",
    topics: ["timeline"],
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Optional date in YYYY-MM-DD." },
      },
      additionalProperties: false,
    },
    async handler({ services, args }) {
      const result = await services.timeline.listProposals(args);
      const proposalCount = Number.isInteger(result?.data?.proposalCount) ? result.data.proposalCount : 0;
      return {
        text: `Timeline proposals loaded: ${proposalCount}.`,
        data: result,
      };
    },
  },
  {
    name: "cyberboss_timeline_write",
    description: "Write timeline events through timeline-for-agent. Inspect the current day and taxonomy first when category ids, event nodes, or existing events are uncertain.",
    shortHint: "Write timeline events after checking the current day and taxonomy when needed.",
    topics: ["timeline"],
    inputSchema: {
      type: "object",
      required: ["date", "events"],
      properties: {
        date: { type: "string", description: "Target date in YYYY-MM-DD." },
        events: {
          type: "array",
          description: "Timeline events for the target date.",
          items: {
            type: "object",
            required: ["startAt", "endAt"],
            properties: {
              id: { type: "string" },
              startAt: { type: "string", description: "ISO datetime within the target date." },
              endAt: { type: "string", description: "ISO datetime within the target date." },
              title: { type: "string", description: "Event title. Required unless eventNodeId resolves a taxonomy label." },
              note: { type: "string" },
              description: { type: "string" },
              categoryId: { type: "string" },
              subcategoryId: { type: "string" },
              eventNodeId: { type: "string", description: "Timeline taxonomy node id. Use this or provide a title." },
              tags: {
                type: "array",
                items: { type: "string" },
              },
            },
            additionalProperties: true,
          },
        },
        locale: { type: "string", description: "Optional timeline locale." },
        mode: { type: "string", description: "Optional write mode, usually merge." },
        finalize: { type: "boolean", description: "Whether to finalize the day after writing." },
      },
      additionalProperties: false,
    },
    async handler({ services, args }) {
      validateTimelineWriteArgs(args);
      const result = await services.timeline.write(args);
      return {
        text: "Timeline write completed.",
        data: result,
      };
    },
  },
  {
    name: "cyberboss_timeline_build",
    description: "Build the timeline site through timeline-for-agent.",
    shortHint: "Build the timeline site, optionally with locale.",
    topics: ["timeline"],
    inputSchema: {
      type: "object",
      properties: {
        locale: { type: "string" },
      },
      additionalProperties: false,
    },
    async handler({ services, args }) {
      const result = await services.timeline.build(args);
      return {
        text: "Timeline build completed.",
        data: result,
      };
    },
  },
  {
    name: "cyberboss_timeline_serve",
    description: "Start the timeline static server through timeline-for-agent.",
    shortHint: "Serve the timeline site, optionally with locale.",
    topics: ["timeline"],
    inputSchema: {
      type: "object",
      properties: {
        locale: { type: "string" },
      },
      additionalProperties: false,
    },
    async handler({ services, args }) {
      const result = await services.timeline.serve(args);
      return {
        text: result.url ? `Timeline serve started at ${result.url}` : "Timeline serve completed.",
        data: result,
      };
    },
  },
  {
    name: "cyberboss_timeline_dev",
    description: "Start the timeline dev server through timeline-for-agent.",
    shortHint: "Start the timeline dev server, optionally with locale.",
    topics: ["timeline"],
    inputSchema: {
      type: "object",
      properties: {
        locale: { type: "string" },
      },
      additionalProperties: false,
    },
    async handler({ services, args }) {
      const result = await services.timeline.dev(args);
      return {
        text: result.url ? `Timeline dev started at ${result.url}` : "Timeline dev completed.",
        data: result,
      };
    },
  },
  {
    name: "cyberboss_timeline_screenshot",
    description: "Capture a timeline screenshot and send it to WeChat. DEFAULT (no range, or range=day): renders the new unified daily-timeline.html template (420px mobile, high-contrast category dots, vertical timeline). For week/month views: uses the timeline dashboard site (1024px desktop). Input: { userId?, outputFile?, range?, date?, week?, month?, category?, subcategory?, width?, height?, sidePadding?, locale?, fullPage? }",
    shortHint: "Capture a timeline dashboard screenshot.",
    topics: ["timeline"],
    inputSchema: {
      type: "object",
      properties: {
        userId: { type: "string", description: "Optional explicit WeChat user id." },
        outputFile: { type: "string", description: "Optional absolute output path for the PNG file." },
        range: { type: "string", description: "Optional range: day, week, or month." },
        date: { type: "string", description: "Optional day selector YYYY-MM-DD." },
        week: { type: "string", description: "Optional week key." },
        month: { type: "string", description: "Optional month selector YYYY-MM." },
        category: { type: "string", description: "Optional category label or id." },
        subcategory: { type: "string", description: "Optional subcategory label or id." },
        width: { type: "integer", description: "Optional viewport width in pixels." },
        height: { type: "integer", description: "Optional viewport height in pixels." },
        sidePadding: { type: "integer", description: "Optional screenshot padding in pixels." },
        locale: { type: "string", description: "Optional timeline locale." },
        fullPage: { type: "boolean", description: "Capture the full scrollable page height (default true). Set false for fixed viewport." },
      },
      additionalProperties: false,
    },
    async handler({ services, args, context }) {
      const { ScreenshotService } = require("../services/screenshot-service");
      const screenshotter = new ScreenshotService({ config: services.timeline?.config || {} });

      // ── Daily (default) — use the new unified daily-timeline.html template ──
      const range = args.range || "";
      const hasDate = !!(args.date || args.week || args.month);
      const isDaily = !range || range === "day" || (!hasDate && !range);

      if (isDaily) {
        const { DailySummaryService } = require("../services/daily-summary-service");
        if (!services._dailySummary) {
          const cfg = services.diary?.config || services.timeline?.config || {};
          services._dailySummary = new DailySummaryService({
            config: cfg,
            services: {
              timeline: services.timeline,
              diary: services.diary,
              flashMemory: services.flashMemory,
              knowledge: services.knowledge,
            },
          });
        }
        const result = await services._dailySummary.generateDailyTimelineHtml({ date: args.date });
        const captured = await screenshotter.capture({
          htmlFile: result.htmlFile,
          outputFile: args.outputFile,
          width: 420, height: 900, fullPage: true,
        });
        const delivery = await services.channelFile.sendToCurrentChat({
          userId: args.userId, filePath: captured.outputFile,
        }, context).catch((err) => ({ error: err.message }));
        return {
          text: `Daily timeline screenshot: ${captured.outputFile} (${result.stats.eventCount} events, ${result.stats.totalHours}h, ${result.stats.categoryCount} categories)`,
          data: { ...captured, delivery, timelineStats: result.stats },
        };
      }

      // ── Week / Month — use the timeline dashboard site ──
      const siteDir = path.join(
        services.timeline?.config?.stateDir || path.join(os.homedir(), ".cyberboss"),
        "timeline", "site"
      );
      const captured = await screenshotter.capture({
        siteDir,
        outputFile: args.outputFile,
        width: args.width || 1024,
        height: args.height || 900,
        fullPage: args.fullPage !== false,
      });

      // Send to WeChat
      const delivery = await services.channelFile.sendToCurrentChat({
        userId: args.userId,
        filePath: captured.outputFile,
      }, context).catch((err) => ({ error: err.message }));

      return {
        text: `Timeline screenshot saved: ${captured.outputFile}`,
        data: { ...captured, delivery },
      };
    },
  },
  {
    name: "cyberboss_summary_screenshot",
    description: "Capture a summary HTML page screenshot and send it to the current WeChat chat. Used for daily (日终总结), weekly (周总结), and monthly (月总结) summary HTML files. Requires an htmlFile path. ONLY for summary HTML files — do NOT use for timeline dashboard screenshots.",
    shortHint: "Capture a summary page screenshot from an HTML file.",
    topics: ["summary"],
    inputSchema: {
      type: "object",
      required: ["htmlFile"],
      properties: {
        htmlFile: { type: "string", description: "Absolute path to a summary HTML file (daily, weekly, or monthly)." },
        summaryType: { type: "string", description: "Type of summary: daily, weekly, or monthly.", enum: ["daily", "weekly", "monthly"] },
        userId: { type: "string", description: "Optional explicit WeChat user id." },
        outputFile: { type: "string", description: "Optional absolute output path for the PNG file." },
        width: { type: "integer", description: "Optional viewport width in pixels (default 420)." },
        height: { type: "integer", description: "Optional viewport height in pixels (default 900)." },
        fullPage: { type: "boolean", description: "Capture the full scrollable page height (default true). Set false for fixed viewport." },
      },
      additionalProperties: false,
    },
    async handler({ services, args, context }) {
      const { ScreenshotService } = require("../services/screenshot-service");
      const screenshotter = new ScreenshotService({ config: services.timeline?.config || {} });

      const captured = await screenshotter.capture({
        htmlFile: args.htmlFile,
        outputFile: args.outputFile,
        width: args.width || 420,
        height: args.height || 900,
        fullPage: args.fullPage !== false,
      });

      // Send to WeChat
      const delivery = await services.channelFile.sendToCurrentChat({
        userId: args.userId,
        filePath: captured.outputFile,
      }, context).catch((err) => ({ error: err.message }));

      return {
        text: `${args.summaryType || "Summary"} screenshot saved: ${captured.outputFile}`,
        data: { ...captured, delivery },
      };
    },
  },
  {
    name: "cyberboss_task_list",
    description: "List and query Cyberboss backend scheduled tasks (reminders, daily summary, idea refinement, cron jobs). Read-only — no write/modify/cancel operations. For task management requests, use cyberboss_user_feedback to report. Input: { action: string, type?: string, status?: string }",
    shortHint: "List or query backend scheduled tasks.",
    topics: ["system"],
    inputSchema: {
      type: "object",
      required: ["action"],
      properties: {
        action: {
          type: "string",
          description: "Action: list (all pending/running tasks with next-run times), query (filter by type: reminder|daily_summary|idea_refinement|cron), status (show scheduler health summary).",
          enum: ["list", "query", "status"],
        },
        type: {
          type: "string",
          description: "[query] Filter by task type: reminder, daily_summary, idea_refinement, cron.",
          enum: ["reminder", "daily_summary", "idea_refinement", "cron"],
        },
        status: {
          type: "string",
          description: "[list] Filter by task status: pending, due, running, completed.",
          enum: ["pending", "due", "running", "completed"],
        },
      },
      additionalProperties: false,
    },
    async handler({ services, args, context }) {
      const { TaskListService } = require("../services/task-list-service");

      if (!services._taskList) {
        services._taskList = new TaskListService({
          config: services.diary?.config || services.timeline?.config || {},
          services,
        });
      }
      const svc = services._taskList;
      const action = String(args.action || "").trim();

      switch (action) {
        case "list": {
          const result = await svc.listTasks({ status: args.status || "all" });
          const statusSummary = Object.entries(result.statusCounts)
            .map(([s, c]) => `${s}: ${c}`)
            .join(", ");
          return {
            text: `任务调度表 · 共 ${result.totalCount} 个任务 (${statusSummary || "无"}). 生成时间: ${result.generatedAt}`,
            data: result,
          };
        }
        case "query": {
          const result = await svc.queryTasks({ type: args.type });
          const statusSummary = Object.entries(result.statusCounts)
            .map(([s, c]) => `${s}: ${c}`)
            .join(", ");
          return {
            text: `任务类型 "${args.type}" · 共 ${result.totalCount} 个任务 (${statusSummary || "无"}).`,
            data: result,
          };
        }
        case "status": {
          const result = await svc.listTasks();
          const health = {
            totalTasks: result.totalCount,
            statusCounts: result.statusCounts,
            dueCount: result.statusCounts.due || 0,
            pendingCount: result.statusCounts.pending || 0,
            runningCount: result.statusCounts.running || 0,
            completedCount: result.statusCounts.completed || 0,
            generatedAt: result.generatedAt,
          };
          return {
            text: `调度器状态 · ${health.totalTasks} 任务: due=${health.dueCount}, pending=${health.pendingCount}, running=${health.runningCount}, completed=${health.completedCount}.`,
            data: health,
          };
        }
        default:
          throw new Error(`Unknown action: ${action}. Use list, query, or status.`);
      }
    },
  },
  // ── v1.0.0 Phase 0: 3 new domain-aggregated MCP tools ──
  {
    name: "cyberboss_relationship_hub",
    description: "Manage interpersonal relationship vault writes. All person profiles, event logs, meeting briefings, relationship graph updates, and name keyword table updates go through this tool. Input: { action: string, ... }",
    shortHint: "Write or update relationship hub vault files.",
    topics: ["relationship"],
    inputSchema: {
      type: "object",
      required: ["action"],
      properties: {
        action: {
          type: "string",
          description: "Action: write_person (create/update person profile), write_event (append event to daily log), write_briefing (create meeting briefing), update_graph (update relationship graph), update_network (update relationship network), update_keywords (update name keyword table).",
          enum: ["write_person", "write_event", "write_briefing", "update_graph", "update_network", "update_keywords"],
        },
        name: { type: "string", description: "[write_person] Person's name (Chinese)." },
        fields: { type: "object", description: "[write_person] Fields to update: { aliases?, relation?, traits?, notes?, events?, tags? }." },
        date: { type: "string", description: "[write_event, write_briefing] Date in YYYY-MM-DD. Defaults to today." },
        time: { type: "string", description: "[write_event] Time in HH:mm." },
        title: { type: "string", description: "[write_event] Event title." },
        description: { type: "string", description: "[write_event] Event description." },
        peopleInvolved: { type: "array", items: { type: "string" }, description: "[write_event] People involved in the event." },
        tags: { type: "array", items: { type: "string" }, description: "[write_event, write_person] Tags." },
        personName: { type: "string", description: "[write_briefing] Person name for briefing." },
        briefing: { type: "string", description: "[write_briefing] Briefing content." },
        updates: { type: "string", description: "[update_graph] Graph updates to append." },
        personA: { type: "string", description: "[update_network] First person name." },
        personB: { type: "string", description: "[update_network] Second person name." },
        strength: { type: "string", description: "[update_network] Relationship strength." },
        note: { type: "string", description: "[update_network] Additional note." },
        names: { type: "array", items: { type: "string" }, description: "[update_keywords] Names to add to keyword table." },
        source: { type: "string", description: "[update_keywords] Source of the names." },
      },
      additionalProperties: false,
    },
    async handler({ services, args }) {
      const action = String(args.action || "").trim();
      const svc = services.relationshipHub;
      if (!svc) throw new Error("RelationshipHubService not available.");

      let result;
      switch (action) {
        case "write_person": {
          result = svc.writePerson({ name: args.name, fields: args.fields || {} });
          return { text: `Person ${result.created ? "created" : "updated"}: ${result.name} → ${result.filePath}`, data: result };
        }
        case "write_event": {
          result = svc.writeEvent({
            date: args.date, time: args.time, title: args.title,
            description: args.description, peopleInvolved: args.peopleInvolved || [], tags: args.tags || [],
          });
          return { text: `Event logged: ${result.eventId} → ${result.filePath}`, data: result };
        }
        case "write_briefing": {
          result = svc.writeBriefing({ personName: args.personName, date: args.date, briefing: args.briefing });
          return { text: `Briefing created for ${result.person}: ${result.filePath}`, data: result };
        }
        case "update_graph": {
          result = svc.updateGraph({ updates: args.updates });
          return { text: `Graph ${result.created ? "created" : "updated"}: ${result.filePath}`, data: result };
        }
        case "update_network": {
          result = svc.updateNetwork({ personA: args.personA, personB: args.personB, strength: args.strength, note: args.note });
          return { text: `Network updated: ${result.filePath}`, data: result };
        }
        case "update_keywords": {
          result = svc.updateKeywords({ names: args.names || [], source: args.source });
          return { text: `Keywords ${result.updated ? "updated" : "no change"}: ${result.appended} added to ${result.filePath}`, data: result };
        }
        default:
          throw new Error(`Unknown relationship_hub action: ${action}`);
      }
    },
  },
  {
    name: "cyberboss_persona_gallery",
    description: "Manage user persona vault writes. All observation logs, persona profiles, dimension files, and user profile updates go through this tool. Input: { action: string, ... }",
    shortHint: "Write or update persona gallery vault files.",
    topics: ["persona"],
    inputSchema: {
      type: "object",
      required: ["action"],
      properties: {
        action: {
          type: "string",
          description: "Action: write_observation (append observation to daily log), update_profile (update main persona profile), update_dimension (update a specific dimension file), update_user_profile (update user profile in vault root).",
          enum: ["write_observation", "update_profile", "update_dimension", "update_user_profile"],
        },
        date: { type: "string", description: "[all] Date in YYYY-MM-DD. Defaults to today." },
        text: { type: "string", description: "[write_observation] Observation text." },
        source: { type: "string", description: "[write_observation] Source of the observation (e.g. 聊天, 日记, 闪存)." },
        tags: { type: "array", items: { type: "string" }, description: "[write_observation] Tags." },
        confidence: { type: "string", description: "[write_observation] Confidence level: high, medium, or low." },
        section: { type: "string", description: "[update_profile, update_user_profile] Section name to update." },
        content: { type: "string", description: "[update_profile, update_dimension, update_user_profile] Content to write." },
        dimension: { type: "string", description: "[update_dimension] Dimension: 语言习惯, 行为模式, 决策风格, or 兴趣图谱." },
        observations: { type: "array", items: { type: "string" }, description: "[update_dimension] Observation IDs to reference." },
      },
      additionalProperties: false,
    },
    async handler({ services, args }) {
      const action = String(args.action || "").trim();
      const svc = services.personaGallery;
      if (!svc) throw new Error("PersonaGalleryService not available.");

      let result;
      switch (action) {
        case "write_observation": {
          result = svc.writeObservation({
            date: args.date, text: args.text, source: args.source,
            tags: args.tags || [], confidence: args.confidence || "medium",
          });
          return { text: `Observation logged: ${result.obsId} → ${result.filePath}`, data: result };
        }
        case "update_profile": {
          result = svc.updateProfile({ date: args.date, section: args.section, content: args.content });
          return { text: `Profile ${result.created ? "created" : "updated"}: ${result.filePath}`, data: result };
        }
        case "update_dimension": {
          result = svc.updateDimension({
            dimension: args.dimension, date: args.date,
            content: args.content, observations: args.observations || [],
          });
          return { text: `Dimension ${result.created ? "created" : "updated"}: ${result.dimension} → ${result.filePath}`, data: result };
        }
        case "update_user_profile": {
          result = svc.updateUserProfile({ section: args.section, content: args.content, date: args.date });
          return { text: `User profile ${result.updated ? "updated" : "no change"}: ${result.filePath}`, data: result };
        }
        default:
          throw new Error(`Unknown persona_gallery action: ${action}`);
      }
    },
  },
  {
    name: "cyberboss_vault_maintenance",
    description: "Manage non-real-time vault maintenance operations. Handles navigation updates, index/MOC file updates, write-log recording, vault consistency checking, and development log updates. Input: { action: string, ... }",
    shortHint: "Run vault maintenance operations.",
    topics: ["vault"],
    inputSchema: {
      type: "object",
      required: ["action"],
      properties: {
        action: {
          type: "string",
          description: "Action: update_navigation (update 导航.md), update_index (update any index/MOC file), check_consistency (run vault consistency scan), write_log (write to write-log), read_log (read recent write-log entries), update_dev_log (update development log files).",
          enum: ["update_navigation", "update_index", "check_consistency", "write_log", "read_log", "update_dev_log"],
        },
        updates: { type: "string", description: "[update_navigation] Content to append to navigation." },
        target: { type: "string", description: "[update_index] Index target: flash, knowledge, feedback, or ideas." },
        entry: { type: "string", description: "[update_index] Markdown entry to append." },
        date: { type: "string", description: "[check_consistency] Date in YYYY-MM-DD. Defaults to today." },
        tool: { type: "string", description: "[write_log] Tool name that performed the write." },
        toolAction: { type: "string", description: "[write_log] Action that was performed." },
        targetPath: { type: "string", description: "[write_log] Target file path." },
        bytesWritten: { type: "integer", description: "[write_log] Bytes written." },
        summary: { type: "string", description: "[write_log] Summary of the write." },
        since: { type: "string", description: "[read_log] ISO timestamp to filter entries from." },
        limit: { type: "integer", description: "[read_log] Max entries to return." },
        file: { type: "string", description: "[update_dev_log] Dev log file path relative to vault." },
        content: { type: "string", description: "[update_dev_log] Content to write." },
        writeAction: { type: "string", description: "[update_dev_log] Write action: append or overwrite." },
      },
      additionalProperties: false,
    },
    async handler({ services, args }) {
      const action = String(args.action || "").trim();
      const svc = services.vaultMaintenance;
      if (!svc) throw new Error("VaultMaintenanceService not available.");

      let result;
      switch (action) {
        case "update_navigation": {
          result = svc.updateNavigation({ updates: args.updates });
          return { text: `Navigation ${result.created ? "created" : "updated"}: ${result.filePath}`, data: result };
        }
        case "update_index": {
          result = svc.updateIndex({ target: args.target, entry: args.entry });
          return { text: `Index ${result.created ? "created" : "updated"}: ${result.filePath}`, data: result };
        }
        case "check_consistency": {
          result = svc.checkConsistency({ date: args.date });
          return {
            text: `Vault consistency check: ${result.summary.total} files checked, ${result.summary.ok} ok, ${result.summary.missing} missing, ${result.summary.stale} stale.`,
            data: result,
          };
        }
        case "write_log": {
          result = svc.writeLogEntry({
            tool: args.tool, action: args.toolAction, target: args.targetPath,
            filePath: args.targetPath, bytesWritten: args.bytesWritten || 0, summary: args.summary,
          });
          return { text: `Write-log entry recorded: ${result.logPath}`, data: result };
        }
        case "read_log": {
          result = svc.readWriteLog({ since: args.since, limit: args.limit || 100 });
          return { text: `Write-log: ${result.total} entries found.`, data: result };
        }
        case "update_dev_log": {
          result = svc.updateDevLog({ file: args.file, content: args.content, action: args.writeAction || "append" });
          return { text: `Dev log ${result.action}: ${result.filePath}`, data: result };
        }
        default:
          throw new Error(`Unknown vault_maintenance action: ${action}`);
      }
    },
  },
];

const STATIC_EXTRA_TOOL_NAMES = new WhereaboutsToolHost({ service: null })
  .listTools()
  .map((tool) => tool.name);

function createExtraToolHosts(services = {}) {
  const hosts = [];
  if (services.whereabouts) {
    hosts.push(new WhereaboutsToolHost({ service: services.whereabouts }));
  }
  return hosts;
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Test mode helper: write a copy of data to the test vault.
 * When test mode is active, data is written to BOTH the normal vault
 * AND the test vault (测试模式/YYYY-MM-DD/).
 */
function writeTestModeCopy({ context, sourcePath, subDir, dataType, summary } = {}) {
  try {
    const fs = require("fs");
    const path = require("path");

    // Resolve test mode directory
    const vault = process.env.CYBERBOSS_OBSIDIAN_VAULT;
    if (!vault) return null;

    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    const testDir = path.join(vault, "测试模式", today, subDir);
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    // Copy source file if it exists
    let copiedPath = null;
    if (sourcePath && fs.existsSync(sourcePath)) {
      const destName = path.basename(sourcePath);
      const destPath = path.join(testDir, destName);
      fs.copyFileSync(sourcePath, destPath);
      copiedPath = destPath;
    }

    // Append to test session log
    const sessionFile = path.join(path.dirname(testDir), "test-session.md");
    const timeStr = new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(new Date());

    const entry = `| ${timeStr} | ${dataType} | ${summary} | ${copiedPath || "—"} |\n`;

    if (!fs.existsSync(sessionFile)) {
      const header = [
        `---`,
        `type: test-session`,
        `started_at: "${new Date().toISOString()}"`,
        `sender: ${context.senderId || "unknown"}`,
        `---`,
        ``,
        `# 🧪 测试会话 · ${today}`,
        ``,
        `| 时间 | 类型 | 摘要 | 文件 |`,
        `|------|------|------|------|`,
      ].join("\n") + "\n";
      fs.writeFileSync(sessionFile, header + entry, "utf8");
    } else {
      fs.appendFileSync(sessionFile, entry, "utf8");
    }

    return { testDir, copiedPath, sessionFile };
  } catch (err) {
    console.error(`[cyberboss] test mode copy failed: ${err.message}`);
    return { error: err.message };
  }
}

/**
 * v0.3.3: Check if today's persona observation log exists in the vault.
 * Used as a pre-generate guard to warn when Step 3 was skipped.
 */
function checkObservationLogMissing({ config, date } = {}) {
  try {
    const fs = require("fs");
    const path = require("path");
    const os = require("os");

    const vault = process.env.CYBERBOSS_OBSIDIAN_VAULT;
    if (!vault) return null;

    const today = String(date || "").trim() || new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    const logPath = path.join(vault, "用户画像馆", "观察日志", `${today}.md`);
    if (!fs.existsSync(logPath)) {
      return { missing: true, date: today, expectedPath: logPath };
    }
    // Check if it has actual observations (not just frontmatter + empty body)
    const content = fs.readFileSync(logPath, "utf8");
    const hasObservations = /^## obs-/m.test(content);
    if (!hasObservations) {
      return { missing: true, date: today, expectedPath: logPath, reason: "observation log exists but has no observations" };
    }
    return null;
  } catch {
    return null;
  }
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function buildToolDescription(tool) {
  const baseDescription = normalizeText(tool?.description);
  const signature = summarizeSchema(tool?.inputSchema);
  if (!signature) {
    return baseDescription;
  }
  return `${baseDescription} Input: ${signature}`;
}

function summarizeSchema(schema, { depth = 0 } = {}) {
  if (!schema || typeof schema !== "object") {
    return "";
  }
  const schemaType = normalizeText(schema.type).toLowerCase();
  if (schemaType === "object") {
    const properties = schema.properties && typeof schema.properties === "object"
      ? schema.properties
      : {};
    const required = new Set(Array.isArray(schema.required) ? schema.required : []);
    const entries = Object.entries(properties);
    if (!entries.length) {
      return "{}";
    }
    const parts = entries.map(([key, value]) => {
      const suffix = required.has(key) ? "" : "?";
      return `${key}${suffix}: ${summarizeSchema(value, { depth: depth + 1 }) || "any"}`;
    });
    return `{ ${parts.join(", ")} }`;
  }
  if (schemaType === "array") {
    const itemSummary = summarizeSchema(schema.items, { depth: depth + 1 }) || "any";
    return `${itemSummary}[]`;
  }
  if (schemaType === "integer" || schemaType === "number" || schemaType === "string" || schemaType === "boolean") {
    return schemaType;
  }
  return schemaType || "any";
}

function validateTimelineWriteArgs(args) {
  const events = Array.isArray(args?.events) ? args.events : [];
  events.forEach((event, index) => {
    if (!event || typeof event !== "object" || Array.isArray(event)) {
      return;
    }
    const hasTitle = normalizeText(event.title).length > 0;
    const hasEventNodeId = normalizeText(event.eventNodeId).length > 0;
    if (!hasTitle && !hasEventNodeId) {
      throw new Error(`cyberboss_timeline_write input.events[${index}].title or input.events[${index}].eventNodeId is required.`);
    }
  });
}

function validateSchema(schema, value, toolName, path) {
  if (!schema || typeof schema !== "object") {
    return;
  }
  const schemaType = schema.type;
  if (schemaType === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`${toolName} ${path} must be an object.`);
    }
    const properties = schema.properties && typeof schema.properties === "object"
      ? schema.properties
      : {};
    const required = Array.isArray(schema.required) ? schema.required : [];
    for (const key of required) {
      if (!(key in value)) {
        throw new Error(`${toolName} ${path}.${key} is required.`);
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in properties)) {
          throw new Error(`${toolName} ${path}.${key} is not allowed.`);
        }
      }
    }
    for (const [key, propertySchema] of Object.entries(properties)) {
      if (key in value) {
        validateSchema(propertySchema, value[key], toolName, `${path}.${key}`);
      }
    }
    return;
  }
  if (schemaType === "array") {
    if (!Array.isArray(value)) {
      throw new Error(`${toolName} ${path} must be an array.`);
    }
    if (schema.items) {
      value.forEach((item, index) => validateSchema(schema.items, item, toolName, `${path}[${index}]`));
    }
    return;
  }
  if (schemaType === "string" && typeof value !== "string") {
    throw new Error(`${toolName} ${path} must be a string.`);
  }
  if (schemaType === "boolean" && typeof value !== "boolean") {
    throw new Error(`${toolName} ${path} must be a boolean.`);
  }
  if (schemaType === "integer" && !Number.isInteger(value)) {
    throw new Error(`${toolName} ${path} must be an integer.`);
  }
  if (schemaType === "number" && (typeof value !== "number" || !Number.isFinite(value))) {
    throw new Error(`${toolName} ${path} must be a number.`);
  }
}

module.exports = {
  ProjectToolHost,
  listProjectToolNames,
};
