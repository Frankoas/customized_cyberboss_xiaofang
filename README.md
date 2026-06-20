# Customized Cyberboss 小方

> Cyberboss v0.3.2 — 私人 AI 管家，为小方深度定制

[![License](https://img.shields.io/badge/license-AGPL--3.0--only-blue)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.3.2-green)](https://github.com/Frankoas/customized_cyberboss_xiaofang/releases)

## 这是什么

Cyberboss 是一个通过微信与你交互的 AI Agent。它不只是聊天——它能**记住你的灵感**、**陪你通勤刷题**、**每天自动写总结**、**用苏格拉底式提问帮你打磨构思**。

本项目在 [Cyberboss](https://github.com/egoist/cyberboss) 的基础上，为小方的工作流做了深度定制。

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
- **2-问规则**：捕获后最多 2 个锚定问题，不过度打扰
- **MCP Tool**: `cyberboss_flash_memory`（7 actions）

#### 2. 碎片化记忆 / 通勤刷题 (Phase 2)
> 通勤 15 分钟，不浪费。

- **通勤检测**：自动识别关键词
- **加权随机选题**：根据难度和历史正确率
- **多子句拆分**：多个 `？` → 自动拆成子问题
- **知识库**：半导体物理 + 单片机原理与应用
- **MCP Tool**: `cyberboss_knowledge_quiz`（5 actions）

#### 3. 每日总结 (Phase 3)
> 每晚自动回顾，不只是数据罗列。

- **5 源聚合**：Timeline + Diary + Flash Memory + Quiz + Tasks
- **心理审查框架**：暂停实验室 5 步结构（事实锚点→情绪光谱→想法侦探→闪光存档→明日微行动）
- **双输出**：Obsidian `.md` + 移动端 HTML 截图 → 微信发图
- **4 条触发路径**：收工关键词 / 22:57 cron / 手动 `/summary` / Sunday+15th 周月总结
- **MCP Tool**: `cyberboss_daily_summary`（7 actions + generate_weekly + generate_monthly）

#### 4. 大构思完善 (Phase 4)
> 你的想法，AI 用苏格拉底式提问帮你打磨。

- **5-Phase 结构化框架**：澄清→挑战→视角→落地→整合
- **零门槛输入**：`大构思/drafts/` 丢 `.md` → 引擎自动读取
- **实体锚定追问**：提取人名/金额/日期，嵌入下一轮
- **覆盖率自检**：8 个核心维度追踪
- **会话自动恢复**：JSON 自动存档 → 中断后 `/refine` 续接
- **MCP Tool**: `cyberboss_idea_refinement`（6 actions）

---

### v0.2.1 — Obsidian 图谱优化

- **知识库 Hub**：`[[半导体物理]]` + `[[单片机原理与应用]]` 索引页
- **交叉引用**：所有 quiz 文件底部 `## 🔗 相关笔记`
- **大构思双向链接**：draft ↔ refined 三角闭环
- **自动链接引擎**：每日总结 generate 时回写 vault 源文件，补全 wikilink

### v0.3.0 — 截图分离 + 周/月总结 + 用户反馈

- **Screenshot Tool 拆分**：`cyberboss_timeline_screenshot` / `cyberboss_summary_screenshot` 严格分离
- **周总结**：`weekly-summary.html` — 周日生成，7 天聚合（时间分配、情绪光谱、闪存亮点、学习进展）
- **月总结**：`monthly-summary.html` — 每月15号生成，CSS 热力图 + 情绪趋势 + 大构思进展
- **用户反馈**：`用户反馈/YYYY-MM-DD.md` — bug/建议自动写入 vault

### v0.3.1 — 日终情绪快照

- **Diary Mood Frontmatter**：日记文件 YAML `mood:` + `mood_score:`（9 种情绪，1-5 分）
- **MCP Tool 扩展**：`cyberboss_diary_append` 新增 `mood` 参数
- **情绪光谱数据源**：周/月总结聚合 diary mood（权重 3x）+ flash mood（权重 1x）

### v0.3.2 — 反馈 MCP Tool + Timeline 显示修复 + 模板布局修复

- **`cyberboss_user_feedback` MCP Tool**：反馈写入 vault 不再依赖 LLM 直接写文件，自动管理目录、MOC 索引
- **Timeline 桌面端修复**：`stack: true` 重叠事件分行 + 动态容器高度 + `margin:{item:10,axis:10}` + `.vis-item` 字体 13px/bold + `overflow: visible`
- **Timeline 移动端修复**：碰撞检测算法 + 动态 track 高度 + 短事件两行显示 + 字体加粗
- **截图规则**：Timeline 截图默认桌面周视图（1024px/week），不发手机版
- **模板布局修复**：周/月总结 stat-grid 2列布局 + `min-width:0;overflow:hidden` 防止数值溢出
- **功能触发手册**：`开发日志/功能触发手册.md` 15 章完整文档 + `导航.md` Obsidian MOC
- **用户档案**：`用户档案.md` 结构化个人信息存储（生日、偏好、定期提醒）

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
   ├─ quiz    ├─ feedback├─ 知识库/
   ├─ summary ├─ timeline├─ 每日总结/
   └─ idea    └─ sticker └─ 大构思/
```

- **Runtime**: Claude Code（通过 `claude` CLI 调用）
- **Channel**: 微信（WeChat Bridge HTTP long-poll）
- **Storage**: Obsidian vault（所有内容 `.md` + YAML frontmatter）
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
| `/test` | 切换测试模式 |
| `/help` | 显示所有命令 |

---

## 目录结构

```
cyberboss/
├── src/
│   ├── core/          # 主应用、命令注册、消息路由
│   ├── services/      # flash/diary/feedback/quiz/summary/idea/timeline/reminder/sticker
│   ├── tools/         # MCP Tool Host + 工具定义
│   ├── adapters/      # WeChat / Runtime 适配器
│   └── app/           # Checkin Poller
├── templates/         # HTML 模板 + weixin-operations.md
├── cyberbossVault/    # Obsidian Vault（用户数据）
├── bin/               # CLI 入口
└── .env               # 配置文件
```

---

## 版本

| 版本 | 日期 | 关键交付 |
|------|------|----------|
| v0.1.0 | 2026-06-19 | Cyberboss baseline + Windows 适配 |
| v0.2.0 | 2026-06-20 | 闪存记忆 + 通勤刷题 + 每日总结 + 大构思完善 |
| v0.2.1 | 2026-06-20 | Obsidian 图谱优化 + 自动链接引擎 |
| v0.3.0 | 2026-06-20 | 截图分离 + 周/月总结 + 用户反馈 |
| v0.3.1 | 2026-06-20 | 日终情绪快照（diary mood frontmatter） |
| **v0.3.2** | **2026-06-20** | **反馈 MCP Tool + Timeline 显示修复 + 模板布局修复 + 截图规则** |

---

## 许可

[AGPL-3.0-only](LICENSE) © 2026 小方

---

🤖 由 Cyberboss v0.3.2 驱动
