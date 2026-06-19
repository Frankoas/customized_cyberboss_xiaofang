# Changelog

All notable changes to customized_cyberboss_xiaofang will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-06-19

### Added
- Initial release: Cyberboss v0.1.0 baseline
- WeChat bridge (HTTP long-polling)
- Timeline integration (timeline-for-agent)
- Whereabouts integration (whereabouts-mcp)
- Diary, Reminder, Sticker services
- Claude Code runtime adapter
- Windows TCP IPC support
- MCP tool host and project tooling

## [Unreleased] — Phase 3 dev branch

### Added — Daily Summary (每日总结)
- `DailySummaryService`: data aggregation from 5 sources (timeline, diary, flash memory, quiz, tasks)
- `DailySummaryScheduler`: 20:00-23:59 auto-generation window
- MCP tool `cyberboss_daily_summary` with 7 actions (generate, status, append_plan, finalize, read, check, attach_screenshot)
- `/summary` WeChat command
- "收工" keyword detection in weixin-operations.md
- Checkin poller integration for nightly auto-trigger
- Readable file naming: `YYYY-MM-DD-周X-日终总结.md`
- HTML template with mobile portrait layout (420px single-column long-strip)
- 9 sections: 时间轨迹, 记忆碎片问答, 记忆胶囊, 今日灵感, 完成事项, 日记片段, 学习记录, 大构思完善, 明天计划
- `_aggregateFlashQa`: parse Q&A pairs from flash memory
- `_aggregateCapsules`: linked flash clusters and roundup notes
- `_aggregateIdeas`: scan 大构思/ directory for drafts
- `attachScreenshot` action: embed PNG screenshots into MD files

### Added — Screenshot Service
- `ScreenshotService`: Playwright-based replacement for broken timeline-for-agent screenshot
- Two modes: `htmlFile` (daily summary) and `siteDir` (timeline dashboard)
- Auto Chrome path resolution on Windows/Mac
- `cyberboss_timeline_screenshot` updated with `htmlFile` and `fullPage` params

### Fixed
- Template path: use `CYBERBOSS_HOME` instead of `workspaceRoot` (was pointing to non-existent path)
- `_renderItem`: proper `{{#key}}`/`{{^key}}` conditional block handling based on value truthiness
- Section block list names: timeline→`events`, diary→`entries`, flashQa→`qaItems`, capsules→`capsules`, ideas→`drafts`
- `_renderQuizSection` and `_renderTomorrowPlan`: proper positive/negative block handling
- `_renderTaskSection`: rewritten with `_renderConditionalBlock` helper
- Nested template rendering: flattened flash Q&A exchanges and idea drafts to avoid double-stripping

[0.1.0]: https://github.com/WenXiaoWendy/customized_cyberboss_xiaofang/releases/tag/v0.1.0
