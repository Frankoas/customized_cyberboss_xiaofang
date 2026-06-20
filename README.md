# Customized Cyberboss 小方

> Cyberboss v0.3.2 — 私人 AI 管家，为小方深度定制

[![License](https://img.shields.io/badge/license-AGPL--3.0--only-blue)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.3.2-green)](https://github.com/Frankoas/customized_cyberboss_xiaofang/releases)

## 这是什么

Cyberboss 是一个通过微信与你交互的 AI Agent。它不只是聊天——它能**记住你的灵感**、**陪你通勤刷题**、**每天自动写总结**、**用苏格拉底式提问帮你打磨构思**。

本项目在 [Cyberboss](https://github.com/egoist/cyberboss) 的基础上，为小方的工作流做了深度定制。

> 🎯 **当前阶段**：[[开发日志/计划类/小而美收拢计划|小而美收拢计划]] — 打磨期。已落地：[[用户画像馆/用户画像|用户画像馆 v1]] + [[人际关系馆/人际关系图谱|人际关系馆]]（触发引擎 + 见面简报）。计划：[[开发日志/计划类/用户画像馆与人物卡计划书|画像馆&人物卡]] — 行为分析 + 可调 AI 人格。

---

## 相比原版 Cyberboss 的核心升级

### 原版能力（v0.1.0 baseline）

| 模块 | 说明 |
|------|------|
| WeChat Bridge | HTTP long-polling 消息收发 |
| Timeline | 自动时间轴记录（timeline-for-agent） |
| Whereabouts | 位置跟踪（whereabouts-mcp） |
| Diary / Reminder / Sticker | 基础日记、提醒、表情管理 |

### v0.2.0 新增四大能力

#### 1. 闪存记忆 (Phase 1)
> 灵感转瞬即逝？帮你抓住。

- **自动捕获**：微信聊天中检测到灵感/待办/想法 → 自动存入 Obsidian vault
- **情绪标签**：每一条闪存带情绪标记（excited/anxious/curious/determined/tired/playful）
- **双向链接**：`[[wikilinks]]` 自动关联相关闪存 → Obsidian 图谱可视化
- **轻量追问**：捕获后最多 2 个锚定问题，不过度打扰
- **MCP Tool**: `cyberboss_flash_memory`（7 actions：capture/list/update/batch_update/review_suggestions/write_roundup）

#### 2. 碎片化记忆 / 通勤刷题 (Phase 2)
> 通勤 15 分钟，不浪费。

- **通勤检测**：自动识别"通勤/地铁/公交/坐车"等关键词
- **加权随机选题**：根据难度和历史正确率智能出题
- **多子句拆分**：一个问题里包含多个 `？` → 自动拆成子问题逐一追问
- **知识库 21 条种子**：半导体物理 + 单片机原理与应用
- **MCP Tool**: `cyberboss_knowledge_quiz`（5 actions：start/next/submit/stop/status）

#### 3. 每日总结 (Phase 3)
> 每晚自动回顾，不只是数据罗列。

- **5 源聚合**：Timeline + Diary + Flash Memory + Knowledge Quiz + Tasks
- **心理审查框架**：遵循暂停实验室 5 步结构（事实锚点→情绪光谱→想法侦探→闪光存档→明日微行动）
- **双输出**：Obsidian `.md` + 移动端 HTML 长条截图
- **混合触发**：21:00 自动草稿 + 用户说"收工"立即生成
- **Playwright 截图**：420px 移动端竖屏 HTML → 微信直接发图
- **MCP Tool**: `cyberboss_daily_summary`（7 actions：generate/status/append_plan/finalize/read/check/attach_screenshot）

#### 4. 大构思完善 (Phase 4)
> 你的想法，AI 用苏格拉底式提问帮你打磨。

- **5-Phase 结构化框架**：澄清→挑战→视角→落地→整合
- **零门槛输入**：只要在 `大构思/drafts/` 丢一个普通 `.md` 文件，引擎自动读取
- **实体锚定追问**：提取人名/金额/日期，嵌入下一轮问题
- **覆盖率自检**：8 个核心维度追踪，不重复追问
- **会话自动恢复**：每轮自动存 JSON → 聊天被打断？下次 `/refine` 直接续接
- **完善稿输出**：`大构思/refined/` 生成带完整对话历史的 Markdown
- **MCP Tool**: `cyberboss_idea_refinement`（6 actions：scan_drafts/start_session/next_question/submit_answer/stop_session/status）

---

## 架构

```
微信 ──→ WeChat Bridge (HTTP long-poll)
              │
              ▼
       Cyberboss App (Claude Code Runtime)
              │
   ┌──────────┼──────────┐
   │          │          │
   ▼          ▼          ▼
MCP Tools  Services   Obsidian Vault
   │          │          │
   ├─ flash   ├─ diary   ├─ 闪存记忆/
   ├─ quiz    ├─ timeline├─ 知识库/
   ├─ summary ├─ reminder├─ 每日总结/
   └─ idea    └─ sticker └─ 大构思/
```

- **Runtime**: Claude Code（通过 `claude` CLI 调用）
- **Channel**: 微信（WeChat Bridge HTTP long-poll）
- **Storage**: Obsidian vault（所有内容 `.md` + YAML frontmatter，Obsidian 原生可读可编辑）
- **Tool Protocol**: MCP (Model Context Protocol) stdio JSON-RPC 2.0

---

## 快速开始

### 环境要求

- Node.js ≥ 18
- Windows 11（主要运行环境）/ macOS / Linux
- [Claude Code](https://claude.ai/code) CLI
- 微信机器人账号

### 安装

```bash
git clone https://github.com/Frankoas/customized_cyberboss_xiaofang.git
cd customized_cyberboss_xiaofang
npm install
```

### 配置

复制并编辑 `.env`：

```bash
cp .env.example .env
```

必填项：
```env
CYBERBOSS_USER_NAME=你的名字
CYBERBOSS_ALLOWED_USER_IDS=你的微信id
CYBERBOSS_WORKSPACE_ROOT=项目路径
CYBERBOSS_RUNTIME=claudecode
CYBERBOSS_ACCOUNT_ID=微信机器人id
CYBERBOSS_OBSIDIAN_VAULT=Obsidian vault 路径
```

### 启动

```bash
npm start
```

---

## WeChat 命令

| 命令 | 功能 |
|------|------|
| `/bind` | 绑定工作区 |
| `/status` | 查看当前状态 |
| `/new` | 新对话线程 |
| `/summary` | 生成每日总结 |
| `/refine` | 启动大构思完善 |
| `/test` | 切换测试模式（数据写入测试目录） |
| `/help` | 显示所有命令 |

---

## 目录结构

```
cyberboss/
├── src/
│   ├── core/          # 主应用、命令注册、消息路由
│   ├── services/      # 闪存/知识库/总结/构思/日记/提醒/表情
│   ├── tools/         # MCP Tool Host + 工具定义
│   ├── adapters/      # WeChat / Runtime 适配器
│   └── app/           # Checkin Poller
├── templates/         # HTML 模板 + 微信操作指令
├── bin/               # CLI 入口
└── .env               # 配置文件
```

---

## 版本

| 版本 | 日期 | 内容 |
|------|------|------|
| v0.1.0 | 2026-06-19 | Cyberboss baseline + Windows 适配 |
| **v0.2.0** | **2026-06-20** | **Phase 1-4: 闪存记忆 + 通勤刷题 + 每日总结 + 大构思完善 + 测试模式** |
| v0.2.1 | 2026-06-20 | Obsidian 图谱优化 + 每日总结自动链接引擎 |
| **v0.3.0** | **2026-06-20** | **截图工具严格分离 + 周/月总结 + 实时用户反馈** |
| v0.3.1 | 2026-06-20 | 日终情绪快照 (mood frontmatter + 周/月情绪光谱) |
| **v0.3.2** | **2026-06-20** | **触发机制修复 + 反馈MCP Tool + Timeline显示修复 + 模板布局修复** |
| 🔮 打磨期 | 2026-06-20 → | [[开发日志/计划类/小而美收拢计划\|小而美]] + [[开发日志/版本管理类/模板统一与截图策略更新\|模板统一]] + [[开发日志/计划类/用户画像馆与人物卡计划书\|画像馆&人物卡]] |
| 🔮 打磨期 | 2026-06-20 | **用户画像馆 v1 + 人际关系馆 + 触发引擎 + 见面简报** |

详细变更见 [CHANGELOG.md](./CHANGELOG.md)。

---

## v0.2.1 — Obsidian 图谱关系优化

### 手工优化（已落地）
- **知识库 Hub 节点**：创建 `[[半导体物理]]` 和 `[[单片机原理与应用]]` 索引页
- **交叉引用**：所有 21 个 quiz 文件底部新增 `## 🔗 相关笔记`，概念相关互相链接
- **大构思双向链接**：draft ↔ refined 互相链接 + `[[大构思]]` 总览 hub
- **闪存→知识库桥接**：闪存标签自动匹配知识库 hub
- **每日总结链接**：学习记录、今日灵感、大构思完善三个 section 自动输出 wikilink
- **意外修复**：`中断.md` 内容截断，补全了 INT0 示例代码

### 自动链接引擎（v0.2.1 新增）

修改了 `daily-summary-service.js`，每次 `generate()` 时自动执行：

#### 1. `_aggregateQuiz` 增强
- 从 knowledge index 查 itemId → 注入 `category` 和 `title`
- 让后续渲染和链接步骤知道每条答题记录属于哪个知识分类

#### 2. `_aggregateIdeas` 增强
- 解析草稿 YAML 中的 `refined:` 字段
- 让每日总结能展示 `[[draft]] → [[refined]]` 链接

#### 3. `_renderMarkdown` 自动链接
三个 section 在生成时自动输出 wikilink：
- **今日灵感**：flash tags 匹配 `CAT_HUB` → 附加 `→ [[hub]]`
- **学习记录**：按 category 分组 → `📖 [[hub]]` + `🏷️ [[topic]]`
- **大构思完善**：`[[draft]] → [[refined]]` + `[[大构思|→ 大构思中心]]`

#### 4. `_linkVaultFiles` — 回写 vault 源文件
Daily summary 生成时不仅输出链接，还**回写到 vault 里的源文件**：

| 文件类型 | 触发条件 | 写入内容 |
|----------|----------|----------|
| 知识库 quiz 文件 | 今天答过题 + 缺少 `## 🔗 相关笔记` | hub 链接 + 同 category 其他 quiz 链接 |
| 闪存 inbox 文件 | 标签匹配知识库 category + 缺少 `## 🔗 相关` | hub 链接 + 当日总结链接 |
| 大构思草稿 | 状态 completed + 缺少 `refined:` YAML | YAML `refined` 字段 + 正文 `📋 已完善` wikilink |

幂等设计：已有链接的文件自动跳过，不会重复写入。

#### 可扩展性
```js
const CAT_HUB = {
  "半导体物理": "[[半导体物理|半导体物理]]",
  "单片机原理与应用": "[[单片机原理与应用|单片机原理]]",
  // ← 新增知识库分类只需加一行
};
```

### 改动的文件
| 文件 | 改动 |
|------|------|
| `daily-summary-service.js` | `_aggregateQuiz` 增强、`_aggregateIdeas` 增强、`_renderMarkdown` 三个 section 改造、新增 `_linkVaultFiles` (~110 lines) |
| `知识库/科学/半导体物理.md` | **NEW** hub 索引 |
| `知识库/计算机科学/单片机原理与应用.md` | **NEW** hub 索引 |
| `大构思/大构思.md` | **NEW** hub 索引 |
| `知识库/科学/*.md` (9 files) | +`## 🔗 相关笔记` |
| `知识库/计算机科学/*.md` (12 files) | +`## 🔗 相关笔记` |
| `大构思/drafts/*.md` (2 files) | +`refined` YAML + wikilink |
| `大构思/refined/*.md` (2 files) | +backlink to draft |
| `闪存记忆/inbox/*.md` (2 files) | +`## 🔗 相关` |
| `每日总结/2026/06/2026-06-20*.md` | +学习记录/大构思 wikilink |

---

## 许可

[AGPL-3.0-only](LICENSE) © 2026 小方

---

---

## v0.3.0 — 截图模板严格分离 + 周/月总结 + 用户反馈

### 核心修复：截图 Tool 拆分

**问题**: `cyberboss_timeline_screenshot` 一个 MCP tool 同时处理 HTML 文件截图和 timeline 仪表盘截图，LLM 频繁用错参数。

**修复**: 拆成两个互斥的 tool：

| Tool | 用途 | 必传参数 |
|------|------|----------|
| `cyberboss_summary_screenshot` | 日/周/月总结 HTML 截图 | `htmlFile` + `summaryType` |
| `cyberboss_timeline_screenshot` | Timeline 仪表盘截图 | `date`/`week`/`month` |

`cyberboss_timeline_screenshot` 不再接受 `htmlFile` 参数，彻底杜绝混淆。

### 新增：周总结

- **模板**: `templates/weekly-summary.html`（复用日总结 paper-texture 设计系统，420px）
- **触发**: 每周日跟随日总结一起生成和发送
- **数据**: 聚合本周 7 天的 daily summary `_data.json`（时间分配、情绪光谱、闪存亮点、学习进展、完成事项）
- **持久化**: `每日总结/周总结/{weekLabel}-周总结.html`

### 新增：月总结

- **模板**: `templates/monthly-summary.html`（含 CSS 热力图、情绪趋势、知识积累、大构思进展）
- **触发**: 每月15号跟随日总结一起生成和发送
- **数据**: 聚合本月所有天的 daily summary `_data.json`
- **持久化**: `每日总结/月度总结/{monthLabel}-月总结.html`

### 新增：实时用户反馈

- `用户反馈/YYYY-MM-DD.md` — LLM 收到 bug 反馈/功能建议时自动写入
- 格式：YAML 分类 + 上下文 + 内容 + 优先级
- 追加模式，同一天多次反馈合并到一个文件

### 改动的文件

| 文件 | 改动 |
|------|------|
| `src/tools/tool-host.js` | 拆分为两个 screenshot tool + 新增 `generate_weekly`/`generate_monthly` action |
| `src/services/daily-summary-service.js` | +`generateWeeklySummary`/`generateMonthlySummary` + 6 个聚合 helper + `_renderSimpleTemplate` (~200 lines) |
| `src/services/daily-summary-scheduler.js` | +`isWeeklySummaryDay`/`isMonthlySummaryDay` + `buildSummaryTrigger` 含周/月上下文 |
| `templates/weekly-summary.html` | **NEW** 周总结 HTML 模板 |
| `templates/monthly-summary.html` | **NEW** 月总结 HTML 模板 |
| `templates/weixin-operations.md` | 修复 tool 引用 + 新增截图严格选择规则 + 周/月 ride-along 逻辑 + 用户反馈指令 |
| `package.json` | 版本 0.1.0 → 0.3.0 |

### 验收

- ✅ 两个 screenshot tool 语法检查通过，参数不重叠
- ✅ `generateWeeklySummary()` 产出 6317 chars HTML，正确聚合 2 天数据
- ✅ `generateMonthlySummary()` 产出 6337 chars HTML，含热力图
- ✅ `用户反馈/` 目录已创建

---

## v0.3.2 — 触发机制修复（2026-06-20 晚间）

基于用户测试反馈（`用户反馈/2026-06-20.md`）修复 3 个触发机制缺陷：

### 1. Timeline ↔ Daily Summary 数据同步

**问题**: 生成日终总结时，LLM 未先更新当日时间轴，导致总结中的时间轨迹为空或过时。

**修复**: `weixin-operations.md` Daily Summary → "Before generating" 新增关键前置步骤：
- 必须先 `cyberboss_timeline_write` (mode=merge) 补全当日时间轴
- 再 `cyberboss_timeline_read` 确认数据已写入
- 最后才调 `cyberboss_daily_summary action=generate`

### 2. 闪存 vs 用户反馈排他分类

**问题**: 用户说"能不能加一个喝水提醒功能"时，LLM 捕获为闪存灵感而非用户反馈（功能建议）。

**修复**: 
- `weixin-operations.md` Flash Memory → "When NOT to capture" 新增排除项：功能建议/bug报告/改进建议 → 走用户反馈路径
- `weixin-operations.md` User Feedback → "Trigger patterns" 新增 3 类明确的触发词：
  - 功能建议："能不能加一个"、"可以加一个"、"希望支持"、"要是能"等
  - Bug 报告："出bug了"、"好像不对"、"没反应"等
  - 使用反馈："不太方便"、"每次都要"等
- 功能触发手册同步更新这些触发规则

### 3. 用户档案 & 定期提醒机制 (新功能)

**问题**: 用户的生日、饮食偏好等个人信息散落在闪存中，无法结构化查询和定期提醒。

**修复**: 新增 `用户档案.md` (Obsidian vault root) 作为结构化个人信息存储：
- 分区：🎂 重要日期 / 🍜 饮食偏好 / 💡 其他偏好 / 🔔 定期提醒规则
- 触发词："我生日是..."、"我喜欢吃..."、"我一般..."等
- 自动联动 `cyberboss_reminder_create` 为生日等日期创建提前提醒（3天前 + 1天前 + 当天）
- Personality 集成：非工具类回答时参考档案偏好
- 合并更新模式：读取现有文件 → 追加 → 写回，不覆盖已有内容

### 4. Vault 导航 & MOC 自动维护 (新增)

**问题**: vault 内容持续增长（闪存、知识库、大构思、总结、反馈），缺少一个活的导航系统帮助用户快速定位内容。

**修复**: 建立三层导航体系：
- **`导航.md`**（vault 根）— Obsidian-native 顶层 MOC，[[wikilinks]] 链接所有子目录
- **目录 MOC 文件**（3 个新建）— `闪存记忆/闪存索引.md`、`知识库/知识库索引.md`、`用户反馈/用户反馈索引.md`
- **自动更新机制** — `weixin-operations.md` 新增 "Vault Navigation & MOC" 章节：日终总结、闪存捕获、知识库新增、用户反馈等事件触发后，LLM 自动局部更新对应 MOC 文件的 `updated` frontmatter

### 改动的文件

| 文件 | 改动 |
|------|------|
| `templates/weixin-operations.md` | Daily Summary +前置 timeline sync；Flash Memory +排除规则；User Feedback +触发词表格；**NEW** User Profile 章节；**NEW** Vault Navigation & MOC 章节（含 8 事件触发表 + 更新原则） |
| `cyberbossVault/cyberboss_fang/导航.md` | **REWRITE** — Obsidian-native MOC，[[wikilinks]] + 今日速览 + 全部目录 + 动态更新方案 |
| `cyberbossVault/cyberboss_fang/闪存记忆/闪存索引.md` | **NEW** — inbox 表格 + 分类区域 |
| `cyberbossVault/cyberboss_fang/知识库/知识库索引.md` | **NEW** — 学科表 + 模板引用 |
| `cyberbossVault/cyberboss_fang/用户反馈/用户反馈索引.md` | **NEW** — 日期表 + 分类统计 + 处理流程 |
| `cyberbossVault/cyberboss_fang/开发日志/功能触发手册.md` | +Vault 导航 & MOC 章节 (#12)；章节重编号 12→15；目录 +1 entry |
| `cyberbossVault/cyberboss_fang/开发日志/README.md` | +导航/MOC 第 4 项修复；更新文件表 |

### 验收

- ✅ `weixin-operations.md`: 5 处修复/新增 + `attach_screenshot` 步骤移除，收工流 7→5 步
- ✅ 导航.md: Obsidian-native [[wikilinks]]，vault 内容全覆盖
- ✅ 3 个新 MOC 文件：各自带 `auto_update: true` + `updated` frontmatter
- ✅ 功能触发手册: 15 章，目录一致
- ✅ README: 版本表完整 (v0.1.0 → v0.3.2)，每个版本有独立说明 section
- ✅ [[Vault动态更新机制|Vault 动态更新机制]] — 新增独立文档，完整描述 4 层架构 + 5 条写入路径

---

## v0.3.2 补充交付 — 反馈 MCP Tool + Timeline 显示修复 + 模板布局修复（2026-06-20 下午）

基于用户测试反馈（`用户反馈/2026-06-20.md` — Timeline文字遮挡+字体问题 + 反馈未写入vault）：

### 1. `cyberboss_user_feedback` MCP Tool

**问题**: 用户反馈写入 Obsidian vault 完全依赖 LLM 直接写文件，无 MCP tool 保证，导致反馈丢失。

**修复**: 
- 新建 `src/services/feedback-service.js` — `capture({ category, title, context, content, priority, date? })` 写入 `用户反馈/YYYY-MM-DD.md`
- 在 `tool-host.js` 注册 `cyberboss_user_feedback` MCP tool
- `create-project-tooling.js` 接入 `FeedbackService`
- `weixin-operations.md` "How to capture" 改为调用 MCP tool 代替 LLM 直接写文件
- 自动管理 MOC 索引

### 2. Timeline 事件显示修复

**问题**: Timeline dashboard 截图事件文字被遮挡、字体不够醒目、事件重叠。

**桌面端修复** (`TimelinePanel.jsx`):
- `stack: false` → `stack: true` — 重叠事件自动分行
- `margin: { item: 10, axis: 10 }` — 堆叠事件间距
- 动态容器高度: `Math.max(500, groupCount * 180 + itemCount * 50)` — 根据事件数拉伸
- `element.style.height`（非 min-height）— vis-timeline 用 offsetHeight 计算组行高

**桌面端 CSS** (`dashboard.css`):
- `.vis-item` 字体 12px/500 → **13px/700(bold)** + `line-height: 1.3`
- `.vis-item .vis-item-overflow` overflow hidden → **visible !important**
- `.vis-item .vis-item-content` white-space nowrap → **normal !important**

**移动端修复** (`dashboard-helpers.js`):
- `resolveEventOverlaps()` — 碰撞检测，自动收缩重叠事件高度
- `calcMobileDayTrackMinHeight()` — 动态 track 高度（超过8个事件时+45px/事件）
- `buildDayHeight()` — 标题长度自适应最小高度（长标题→更多空间）
- 阈值 8.4% → 5.0% — 更多事件显示完整标题+时间

**移动端 CSS**:
- h2: 11px/600 → 13px/700, p: 10px → 11px/600
- tight 模式允许两行 `-webkit-line-clamp: 2`

### 3. 周/月总结模板布局修复

**问题**: 420px 页面下 stat-grid 数值卡片被挤到页面外。

**修复**:
- `monthly-summary.html`: stat-grid 3列→2列, stat-num 22px→20px, +`min-width:0;overflow:hidden;word-break:break-all`
- `weekly-summary.html`: 同上保护性 CSS，`white-space:nowrap` 防标签换行
- stat-label 字体 12px→11px，padding 收窄

### 4. Timeline 截图规则

**规则**: Timeline 截图默认桌面周视图：
- `range: "week"`, `width: 1024`, `fullPage: true`
- 写入 `weixin-operations.md` + memory `timeline-screenshot-rules.md`

### 5. README 重写

项目根 `README.md` 完整覆盖 v0.1.0 → v0.3.2，包含 8 个版本条目、架构图、MCP tools 列表、[[功能触发手册|功能触发手册]] 链接。

### 改动的文件

| 文件 | 改动 |
|------|------|
| `src/services/feedback-service.js` | **NEW** — 反馈写入服务 |
| `src/tools/tool-host.js` | +`cyberboss_user_feedback` tool |
| `src/tools/create-project-tooling.js` | +`FeedbackService` 初始化 |
| `templates/weixin-operations.md` | +Timeline Screenshot Rules 章节 + 反馈改用 MCP tool |
| `templates/monthly-summary.html` | stat-grid 布局修复 |
| `templates/weekly-summary.html` | stat-card overflow 保护 |
| `node_modules/timeline-for-agent/src/timeline/components/TimelinePanel.jsx` | stack/margin/height 修复 |
| `node_modules/timeline-for-agent/src/timeline/lib/dashboard-helpers.js` | 碰撞检测 + 动态高度 |
| `node_modules/timeline-for-agent/src/timeline/css/dashboard.css` | 桌面+移动端字体/overflow |
| `README.md` | 完整重写 v0.3.2 |

### 验收

- ✅ `cyberboss_user_feedback` 功能测试通过（写入+追加+ MOC 索引）
- ✅ Timeline build 成功，编译产物中确认所有 CSS/JS 改动
- ✅ 25 events 写入 2026-06-20 测试数据
- ✅ Git: dev + main 同步 push, tag v0.3.2
- ✅ npm run check 全部通过

---

## 打磨期 — 用户画像馆 & 人际关系引擎（2026-06-20 深夜）

基于 [[开发日志/计划类/用户画像馆与人物卡计划书|用户画像馆与人物卡计划书]] 的 Phase 1 落地。

### 用户画像馆

> 7 个文件，18 条观察 → 综合画像 v1 + 4 维度分析。

- **`用户画像.md`** — 综合画像（confidence 0.55），6 区块 + 标签云 + 演化轨迹
- **4 维度文件**：[[用户画像馆/语言习惯|语言习惯]] · [[用户画像馆/行为模式|行为模式]] · [[用户画像馆/决策风格|决策风格]] · [[用户画像馆/兴趣图谱|兴趣图谱]]
- **`观察日志/`** — 2 天 18 条原始观察，每条链回对话/日记/闪存/反馈
- **设计原则**：事件驱动、置信度标注（🟢🟡🟠⬜）、可反驳、vault 透明

### 人际关系馆

> 9 个文件，事件驱动的 6 维人物画像 + 见面简报。

- **`人际关系触发引擎.md`** — 6 条触发路径（新人发现 / 已知提及 / 📅 见面简报 / 多人同场 / 日终扫描 / 显式触发）
- **`人物/{name}.md`** — 6 维画像（与用户画像同维），基于事件积累（3→初步 / 8→中等 / 20→高置信度）
- **`见面简报/`** — 用户说"要见XX"→ 自动查画像 → 给话题 → 回忆事件 → 相处提示
- **`事件日志/`** — 按日记录，人名锚点 `^evt-YYYYMMDD-NNN`
- **`关系网络.md`** — 关系强度评分 + person↔person 追踪

### 双引擎联动

用户在人际中的行为 → 自动反馈到用户画像对应维度（宜人性、社交风格、决策风格等）。

### 触发引擎同步

- 功能触发手册 §16 完整记载
- [[开发日志/手册类（已确定项）/用户画像与人际关系触发引擎|双引擎参考文档]]
- [[开发日志/手册类（已确定项）/Vault内链策略|Vault 内链策略]] — 统一 wikilink 规范

### 改动的文件

| 文件 | 改动 |
|------|------|
| `用户画像馆/*` (7 files) | **NEW** — 综合画像 + 4 维度 + 2 天观察日志 |
| `人际关系馆/*` (9 files) | **NEW** — 图谱 + 引擎 + 人物 + 事件 + 简报 + 网络 |
| `开发日志/手册类（已确定项）/功能触发手册.md` | +§16（用户画像 & 人际关系触发引擎）+ 架构图 + TOC |
| `开发日志/手册类（已确定项）/用户画像与人际关系触发引擎.md` | **NEW** |
| `开发日志/手册类（已确定项）/Vault内链策略.md` | **NEW** |
| `开发日志/README.md` | 版本表 + 1 row + 本 section |
| `导航.md` | +用户画像馆入口 + 人际关系馆入口 + 开发日志分类结构 |

### 验收

- ✅ 所有 wikilink 跨文件锚点使用完整路径（`[[路径#^锚点]]`），Obsidian 中可点击跳转
- ✅ 用户画像 52 条推断链回 18 条观察日志
- ✅ 人际关系触发引擎 6 路径 + 防污染规则
- ✅ 见面简报模板 + 驼儿 8/8 首份简报
- ✅ 全部 vault 内链接可解析（0 死链）

---
🤖 由 Cyberboss v0.3.2 驱动
