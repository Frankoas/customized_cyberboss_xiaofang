const { createWeixinChannelAdapter } = require("../adapters/channel/weixin");
const { SessionStore } = require("../adapters/runtime/codex/session-store");
const { createTimelineIntegration } = require("../integrations/timeline");
const { ChannelFileService } = require("../services/channel-file-service");
const { DiaryService } = require("../services/diary-service");
const { FlashMemoryService } = require("../services/flash-memory-service");
const { KnowledgeService } = require("../services/knowledge-service");
const { ReminderService } = require("../services/reminder-service");
const { StickerService } = require("../services/sticker-service");
const { SystemMessageService } = require("../services/system-message-service");
const { TimelineService } = require("../services/timeline-service");
const { RuntimeContextStore } = require("./runtime-context-store");
const { ProjectToolHost } = require("./tool-host");
const { WhereaboutsService } = require("whereabouts-mcp");

function createProjectTooling(config, options = {}) {
  const sessionStore = options.sessionStore || new SessionStore({
    filePath: config.sessionsFile,
    runtimeId: config.runtime || "codex",
  });
  const channelAdapter = options.channelAdapter || createWeixinChannelAdapter(config);
  const timelineIntegration = options.timelineIntegration || createTimelineIntegration(config);
  const runtimeContextStore = options.runtimeContextStore || new RuntimeContextStore({
    filePath: config.projectToolContextFile,
  });
  const channelFile = new ChannelFileService({ config, channelAdapter, sessionStore });
  const services = {
    diary: new DiaryService({ config }),
    flashMemory: new FlashMemoryService({ config }),
    knowledge: new KnowledgeService({ config }),
    reminder: new ReminderService({ config, sessionStore }),
    system: new SystemMessageService({ config, sessionStore }),
    channelFile,
    sticker: new StickerService({ config, channelAdapter, sessionStore, channelFileService: channelFile }),
    timeline: new TimelineService({ config, timelineIntegration, sessionStore }),
    whereabouts: new WhereaboutsService({
      config: {
        storeFile: config.locationStoreFile,
        host: config.locationHost,
        port: config.locationPort,
        token: config.locationToken,
        historyLimit: config.locationHistoryLimit,
        movementEventLimit: config.locationMovementEventLimit,
        batteryHistoryLimit: config.locationBatteryHistoryLimit,
        knownPlaces: config.locationKnownPlaces,
        knownPlaceRadiusMeters: config.locationKnownPlaceRadiusMeters,
        stayMergeRadiusMeters: config.locationStayMergeRadiusMeters,
        stayBreakConfirmRadiusMeters: config.locationStayBreakConfirmRadiusMeters,
        stayBreakConfirmSamples: config.locationStayBreakConfirmSamples,
        majorMoveThresholdMeters: config.locationMajorMoveThresholdMeters,
      },
    }),
  };
  const toolHost = new ProjectToolHost({
    services,
    runtimeContextStore,
  });
  return {
    services,
    toolHost,
    runtimeContextStore,
  };
}

module.exports = { createProjectTooling };
