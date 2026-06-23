# Customized Cyberboss 小方

> Cyberboss v1.0.0 — 私人 AI 管家 · 确定性触发 · 零弹窗 · Skill 化架构

[![License](https://img.shields.io/badge/license-AGPL--3.0--only-blue)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.0-green)](https://github.com/Frankoas/customized_cyberboss_xiaofang/releases)

## 这是什么

Cyberboss 是一个通过微信与你交互的 AI Agent。它不只是聊天——它能**记住你的灵感**、**陪你通勤刷题**、**每天自动写总结**、**用苏格拉底式提问帮你打磨构思**。

v1.0.0 是一次架构大版本升级：从 v0.3.x 的"LLM 被动检测 + 权限弹窗"升级到"确定性触发 + 全 MCP 通道 + Skill 化路由"，实现**零弹窗体验**和 **≥90% 触发检测率**。

本项目在 [Cyberboss](https://github.com/egoist/cyberboss) 的基础上，为小方的工作流做了深度定制。

---

## v1.0.0 架构升级

### 相比 v0.3.x 的核心变更

| 变更 | 说明 |
|------|------|
| **确定性触发器** | MCP server 内关键词+正则引擎，不依赖 LLM 判断，检测率 ≥90% |
| **全 MCP Tool 写入** | vault 所有写入走 MCP tool，LLM 永不直接 Write/Edit vault 文件 |
| **Prompt 瘦身 + Skill 化** | `weixin-operations.md` 644行→~80行路由 + 9个按需加载 Skill |
| **后台 Agent** | 每日 22:00 vault 一致性检查 + 自动补漏 |
| **零弹窗** | `systemTurnScopeKeys` + `permissions.allow` 消除 vault 写入弹窗 |

### 架构图

```
用户消息
  │
  ▼
确定性触发器 (MCP server 内)
  ├─ 关键词表匹配 (人名/见面/闪存/反馈)
  ├─ 正则规则引擎
  └─ 匹配 → 直接写入 vault (不经过 LLM)
  │
  ▼
LLM + Skill 路由 (~80 行路由 prompt)
  ├─ 检测信号 → invoke Skill
  └─ 无信号 → 自然对话
  │
  ├──→ Skill: flash-memory (灵感捕获)
  ├──→ Skill: commute-quiz (通勤刷题)
  ├──→ Skill: daily-summary (日终总结)
  ├──→ Skill: relationship-engine (人际关系)
  ├──→ Skill: idea-refinement (大构思)
  ├──→ Skill: user-feedback (用户反馈)
  ├──→ Skill: persona-gallery (用户画像)
  ├──→ Skill: vault-maintenance (vault 维护)
  └──→ Skill: sticker-auto (表情包)
  │
  ▼
MCP Tools ──→ Services ──→ Obsidian Vault
  (免确认写入)    (业务逻辑)    (持久化存储)
```

---

## 核心能力

### 闪存记忆
> 灵感转瞬即逝？帮你抓住。

- 自动检测灵感/待办/想法 → 存入 Obsidian vault
- 情绪标签 + `[[wikilinks]]` 双向链接
- 轻量2问追问，不过度打扰

### 通勤刷题
> 通勤15分钟不浪费。

- 自动识别通勤关键词，加权随机选题
- 多子句拆分追问
- 知识库：半导体物理 + 单片机原理与应用

### 每日总结
> 每晚自动回顾。

- 5源聚合：Timeline + Diary + Flash + Quiz + Tasks
- 心理审查框架（暂停实验室5步结构）
- 双输出：Obsidian `.md` + 移动端 HTML 截图
- 混合触发：21:30 自动草稿 + "收工"立即生成

### 大构思完善
> 苏格拉底式提问打磨想法。

- 5-Phase 结构化框架：澄清→挑战→视角→落地→整合
- 零门槛：丢 `.md` 到 `大构思/drafts/` 即自动识别
- 会话自动恢复，支持中断续接

### 人际关系引擎 (v0.3.2)
> 记住你生命中的人。

- 6维人物画像（与用户画像同维）
- 见面简报自动生成
- 事件驱动+日终兜底

### 用户画像馆 (v0.3.2)
> AI 越来越懂你。

- 4维度分析：语言习惯·行为模式·决策风格·兴趣图谱
- 置信度标注（🟢🟡🟠⬜），可反驳
- 事件驱动，透明可查

### 周/月总结 (v0.3.0)
- 周总结：每周日生成，聚合7天数据
- 月总结：每月15号生成，含热力图+情绪趋势

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
cp templates/vision-openai-compatible.env .env
# 编辑 .env 填入你的配置
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

## MCP Tools

| Tool | 用途 |
|------|------|
| `cyberboss_flash_memory` | 闪存捕获/列表/更新/整理 |
| `cyberboss_knowledge_quiz` | 通勤刷题会话 |
| `cyberboss_daily_summary` | 日/周/月总结生成与管理 |
| `cyberboss_idea_refinement` | 大构思苏格拉底式完善 |
| `cyberboss_user_feedback` | 用户反馈记录 |
| `cyberboss_diary_append` | 日记追加 + 情绪快照 |
| `cyberboss_task_list` | 任务调度表查询（只读） |
| `cyberboss_reminder_create` | 创建提醒 |
| `cyberboss_sticker_*` | 表情包管理（send/pick/save/delete/update/tags） |
| `cyberboss_timeline_*` | 时间轴读写与截图 |
| `cyberboss_summary_screenshot` | 总结 HTML 截图 |
| `cyberboss_system_send` | 系统消息发送 |
| `cyberboss_channel_send_file` | 文件发送 |

---

## 目录结构

```
cyberboss/
├── src/
│   ├── core/          # 主应用、命令注册、消息路由
│   ├── services/      # 闪存/知识库/总结/构思/日记/提醒/表情/反馈/任务
│   ├── tools/         # MCP Tool Host + 工具定义
│   ├── adapters/      # WeChat / Runtime 适配器
│   └── app/           # Checkin Poller
├── templates/         # HTML 模板 + 微信操作指令
├── bin/               # CLI 入口
├── scripts/           # 辅助脚本
└── docs/              # 文档
```

---

## 版本历史

| 版本 | 日期 | 内容 |
|------|------|------|
| v0.1.0 | 2026-06-19 | Cyberboss baseline + Windows 适配 |
| v0.2.0 | 2026-06-20 | 闪存记忆 + 通勤刷题 + 每日总结 + 大构思完善 |
| v0.2.1 | 2026-06-20 | Obsidian 图谱优化 + 自动链接引擎 |
| v0.3.0 | 2026-06-20 | 截图工具分离 + 周/月总结 + 用户反馈 |
| v0.3.1 | 2026-06-20 | 情绪快照 (mood frontmatter) |
| v0.3.2 | 2026-06-20 | 触发修复 + 反馈MCP Tool + Timeline修复 + 用户画像馆 + 人际关系馆 |
| v0.3.3 | 2026-06-23 | 任务调度表 + 权限模型 + 触发检修 |
| **v1.0.0** | **2026-06-23** | **确定性触发器 + 全MCP通道 + Prompt瘦身/Skill化 + 后台Agent + 一致性检查** |

详细变更见 [CHANGELOG.md](./CHANGELOG.md)。

---

## 许可

[AGPL-3.0-only](LICENSE) © 2026 小方
