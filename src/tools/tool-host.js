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
    description: "Append a diary entry into Cyberboss local diary storage.",
    shortHint: "Append a diary entry with direct text content.",
    topics: ["diary"],
    inputSchema: {
      type: "object",
      required: ["text"],
      properties: {
        text: { type: "string", description: "Diary body to append." },
        title: { type: "string", description: "Optional short entry title." },
        date: { type: "string", description: "Optional date in YYYY-MM-DD." },
        time: { type: "string", description: "Optional time in HH:mm." },
      },
      additionalProperties: false,
    },
    async handler({ services, args }) {
      const result = await services.diary.append(args);
      return {
        text: `Diary appended to ${result.filePath}`,
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
    async handler({ services, args }) {
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
          description: "Action: generate (create a summary for a date), status (check if summary exists), append_plan (add tomorrow's plan), finalize (lock a draft as final), read (get an existing summary's Markdown content), check (ask scheduler if it's time to generate), attach_screenshot (embed a screenshot image into the summary MD file).",
          enum: ["generate", "status", "append_plan", "finalize", "read", "check", "attach_screenshot"],
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
    async handler({ services, args }) {
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
          const result = await svc.generate({
            date: args.date,
            format: args.format || "full",
            includeSections: Array.isArray(args.includeSections) ? args.includeSections : undefined,
          });
          // Mark generation in scheduler
          scheduler.markGenerated({ draft: true });
          return {
            text: `Daily summary generated for ${result.date}. Sections: ${Object.keys(result.sections).join(", ")}. Stats: ${result.stats.eventCount} events, ${result.stats.flashTodayCount} flashes, ${result.stats.quizTodayCount} quiz items.`,
            data: result,
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
        default:
          throw new Error(`Unknown daily_summary action: ${action}`);
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
    description: "Capture a timeline screenshot and send it back to the current WeChat chat.",
    shortHint: "Capture a timeline screenshot with structured selection fields.",
    topics: ["timeline"],
    inputSchema: {
      type: "object",
      properties: {
        userId: { type: "string", description: "Optional explicit WeChat user id." },
        outputFile: { type: "string", description: "Optional absolute output path for the PNG file." },
        selector: { type: "string", description: "main, timeline, analytics, events, or a custom CSS selector." },
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
      },
      additionalProperties: false,
    },
    async handler({ services, args, context }) {
      const captured = await services.timeline.captureScreenshot(args);
      const delivery = await services.channelFile.sendToCurrentChat({
        userId: args.userId,
        filePath: captured.outputFile,
      }, context);
      return {
        text: `Timeline screenshot sent: ${captured.outputFile}`,
        data: {
          ...captured,
          delivery,
        },
      };
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
