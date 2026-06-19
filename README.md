# Customized Cyberboss 小方

> Cyberboss v0.2.0 — 私人 AI 管家，为小方深度定制

[![License](https://img.shields.io/badge/license-AGPL--3.0--only-blue)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.2.0-green)](https://github.com/Frankoas/customized_cyberboss_xiaofang/releases)

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

详细变更见 [CHANGELOG.md](./CHANGELOG.md)。

---

## 许可

[AGPL-3.0-only](LICENSE) © 2026 小方

---

🤖 由 Cyberboss v0.2.0 驱动
