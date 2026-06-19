# Changelog

All notable changes to customized_cyberboss_xiaofang will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-06-20

### Added — Flash Memory 闪存记忆 (Phase 1)
- `FlashMemoryService`: Obsidian-native `.md` + YAML frontmatter storage
- MCP tool `cyberboss_flash_memory` with 7 actions (capture, list, update, batch_update, review_suggestions, write_roundup)
- Emotion tags: excited, anxious, curious, determined, tired, playful
- Obsidian `[[wikilinks]]` bidirectional linking for graph view
- 2-question rule: max 2 anchoring questions after capture
- Auto-detection from WeChat messages

### Added — Knowledge Quiz 碎片化记忆 (Phase 2)
- `KnowledgeService`: weighted random question selection
- `KnowledgeQuizSession`: commute quiz session management
- MCP tool `cyberboss_knowledge_quiz` with 5 actions (start, next, submit, stop, status)
- Commute detection keywords: 通勤, 坐车, 地铁, 公交
- Multi-question splitting: auto-split `？` separated sub-questions
- 21 seed questions: 半导体物理 + 单片机原理与应用

### Added — Daily Summary 每日总结 (Phase 3)
- `DailySummaryService` (901+ lines): 5-source data aggregation + Markdown + HTML rendering
- `DailySummaryScheduler`: 20:00-23:59 auto-generation + state tracking
- MCP tool `cyberboss_daily_summary` with 7 actions (generate, status, append_plan, finalize, read, check, attach_screenshot)
- `/summary` WeChat command + "收工" keyword detection
- Psychological review framework (暂停实验室 5-section approach)
- Mobile HTML template: 420px single-column long-strip, 9 sections
- `ScreenshotService`: Playwright-based, replaces broken timeline-for-agent screenshot
- `cyberboss_timeline_screenshot` updated with `htmlFile` + `fullPage` params
- Auto Chrome path resolution on Windows

### Added — Idea Refinement 大构思完善 (Phase 4)
- `IdeaRefinementService` (600+ lines): 5-phase Socratic questioning engine
- `IdeaRefinementScheduler`: idle detection (09:00-23:00), 30min interval, checkin integration
- MCP tool `cyberboss_idea_refinement` with 6 actions (scan_drafts, start_session, next_question, submit_answer, stop_session, status)
- Zero-friction input: plain `.md` files in `大构思/drafts/`, no YAML frontmatter required
- 5-phase framework: 澄清 → 挑战 → 视角 → 落地 → 整合
- 8 dimension coverage tracking with auto-advance/regress
- Session auto-save every turn → interrupted sessions resume automatically
- `/refine` WeChat command
- Integration with daily summary's `🏗️ 大构思完善` section

### Added — Test Mode 测试模式
- `/test` WeChat command: toggle test mode per-sender
- Data dual-write: normal vault + `测试模式/YYYY-MM-DD/` subdirectory
- `test-session.md` log with timestamped entries
- Test mode state propagated through runtime context (app → contextStore → MCP handlers)
- Memory-only state (lost on restart)

### Fixed
- Template path: use `CYBERBOSS_HOME` instead of `workspaceRoot`
- `_renderItem`: proper `{{#key}}`/`{{^key}}` conditional block handling
- Section block list names: timeline→events, diary→entries
- `_renderQuizSection`, `_renderTomorrowPlan`, `_renderTaskSection`: proper ± block handling
- Nested template rendering: flattened exchanges/drafts to avoid double-stripping
- Chrome path for Windows: `CYBERBOSS_SCREENSHOT_CHROME_PATH` in `.env`
- Windows IPC: switched from Unix socket to TCP

### Changed
- `_aggregateIdeas`: enhanced to read sessions/ and refined/ directories with session stats
- HTML template idea section: shows active sessions, completed count, status icons
- `weixin-operations.md`: added Idea Refinement section with 5-phase guide

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

[0.2.0]: https://github.com/Frankoas/customized_cyberboss_xiaofang/releases/tag/v0.2.0
[0.1.0]: https://github.com/Frankoas/customized_cyberboss_xiaofang/releases/tag/v0.1.0
