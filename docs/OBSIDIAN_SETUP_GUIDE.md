# Obsidian 搭建指引

> 跟着这份指引一步步操作，每完成一项就打勾 ✅
> 预估总耗时：30 分钟

---

## 0. 前提

- 已安装 [Obsidian](https://obsidian.md/)（桌面版 + 手机版推荐都装）
- 知道 Obsidian 的基本操作：打开 vault、新建文件夹、新建笔记

---

## Step 1：创建 Cyberboss 专用 Vault

### 1.1 创建 Vault

在 Obsidian 中新建一个 Vault，路径建议：

```
D:\Obsidian\CyberbossVault
```

> 💡 这个 vault 是 Cyberboss 的"外部大脑"，Cyberboss 会在这里读写闪存、知识库、每日总结等。

操作：
1. 打开 Obsidian → 点击左下角 "Open another vault" → "Create new vault"
2. Vault name: `CyberbossVault`
3. Location: `D:\Obsidian\CyberbossVault`
4. 点击 Create

- [ ] Vault 已创建

---

## Step 2：创建目录结构

在 `CyberbossVault` 根目录下创建以下文件夹：

```
CyberbossVault/
├── 闪存记忆/              ← 闪存胶囊仓库（Phase 1）
│   ├── inbox/             ← 刚捕获的，待整理
│   ├── categorized/       ← 已分类的
│   │   ├── dev/           ← 开发相关
│   │   ├── life/          ← 生活相关
│   │   ├── idea/          ← 商业/产品想法
│   │   ├── todo/          ← 待办事项
│   │   └── learning/      ← 学习相关
│   ├── archived/          ← 已归档
│   └── merged/            ← 已合并到大构思
│
├── 知识库/                ← 碎片化记忆知识库（Phase 2）
│   ├── 计算机科学/
│   ├── 历史/
│   ├── 科学/
│   ├── 生活技巧/
│   ├── 经济学/
│   ├── 心理学/
│   └── 概率论与统计/
│
├── 每日总结/              ← 日/月/年总结存档（Phase 3）
│   ├── 2026/
│   │   ├── 06/
│   │   └── 07/
│   └── 月度总结/
│
├── 大构思/                ← 大构思草稿（Phase 4）
│   ├── drafts/            ← 你的原始草稿
│   ├── refined/           ← AI 完善后的版本
│   └── sessions/          ← 完善对话记录
│
└── CYBERBOSS_PROMPTS/     ← 提示词协同调整（Phase 全）
    ├── 每日总结/
    ├── 闪存整理/
    ├── 大构思完善/
    └── 通用/
```

操作：
1. 在 Obsidian 左侧文件列表中，逐个右键 → New folder
2. 先建第一层（5个文件夹），再进去建子文件夹

- [ ] 所有文件夹已创建

---

## Step 3：配置环境变量

在 `D:\Cyberboss\cyberboss\.env` 文件中添加：

```env
# Obsidian Vault 路径
CYBERBOSS_OBSIDIAN_VAULT=D:/Obsidian/CyberbossVault

# 闪存记忆存储位置（指向 Obsidian vault 中的闪存记忆文件夹）
CYBERBOSS_FLASH_MEMORY_DIR=D:/Obsidian/CyberbossVault/闪存记忆

# 知识库存储位置（Phase 2 启用）
# CYBERBOSS_KNOWLEDGE_BASE_DIR=D:/Obsidian/CyberbossVault/知识库

# 每日总结存储位置（Phase 3 启用）
# CYBERBOSS_DAILY_SUMMARY_DIR=D:/Obsidian/CyberbossVault/每日总结

# 大构思存储位置（Phase 4 启用）
# CYBERBOSS_IDEA_DIR=D:/Obsidian/CyberbossVault/大构思
```

> ⚠️ 如果 `.env` 文件不存在，新建一个。注意路径用正斜杠 `/`。

操作：
1. 打开 `D:\Cyberboss\cyberboss\.env`
2. 添加以上内容
3. 保存

- [ ] 环境变量已配置

---

## Step 4：创建 Prompt 模板文件

在 `CYBERBOSS_PROMPTS/` 文件夹下创建以下文件，内容暂时留空或复制 Cyberboss 项目中的 `docs/prompts/` 下对应文件：

| 文件 | 路径 | 说明 |
|------|------|------|
| 每日总结 prompt | `CYBERBOSS_PROMPTS/每日总结/daily-summary.md` | 从 `cyberboss/docs/prompts/daily-summary-prompt.md` 复制 |
| 闪存整理 prompt | `CYBERBOSS_PROMPTS/闪存整理/flash-consolidation.md` | 待补充 |
| 大构思完善 prompt | `CYBERBOSS_PROMPTS/大构思完善/idea-refinement.md` | 从 `cyberboss/docs/prompts/idea-refinement-prompt.md` 复制 |
| 通用语气风格 | `CYBERBOSS_PROMPTS/通用/tone-and-style.md` | 可选 |

操作：
1. 在 Obsidian 中右键对应文件夹 → New note
2. 命名如 `daily-summary.md`
3. 把 Cyberboss 项目 `docs/prompts/` 下的内容复制进去

- [ ] Prompt 模板已创建

---

## Step 5：创建知识库模板文件（Phase 2 准备）

在 `知识库/` 文件夹下创建一个模板笔记 `_模板_问答题.md`：

```markdown
---
type: quiz
category: 
tags: []
difficulty: easy
estimatedMinutes: 2
---

# 问题


# 答案关键词


# 解析


# 来源

```

再创建一个 `_模板_冷知识.md`：

```markdown
---
type: cold-fact
category: 
tags: []
---

# 标题


# 内容


# 来源

```

> 后续录入知识库时，复制模板文件即可，不用每次都重写 frontmatter。

操作：
1. 在 `知识库/` 下新建这两个模板笔记
2. 内容照上面复制

- [ ] 知识库模板已创建

---

## Step 6：初始化 Git（可选但推荐）

为了版本管理和备份 Obsidian vault：

```bash
cd D:/Obsidian/CyberbossVault
git init
git add .
git commit -m "init: Cyberboss vault skeleton"
```

如果想把 vault 也推到 GitHub（Private），可以创建一个单独的私有仓库。

- [ ] Git 初始化（可选）

---

## Step 7：手机端 Obsidian 同步

推荐方案：
- **方案 A（推荐）**：Obsidian Sync 官方同步服务（$5/月）
- **方案 B**：iCloud / OneDrive / Syncthing 同步 vault 文件夹
- **方案 C**：用 Git + Working Copy（iOS）/ MGit（Android）手动同步

> 手机端 Obsidian 主要用于：提交大构思草稿、查看每日总结、录入知识库内容。

操作：
1. 在手机上安装 Obsidian
2. 打开同一个 `CyberbossVault`（通过同步方案）
3. 确认能在手机上看到所有文件夹

- [ ] 手机端已配置

---

## Step 8：验证

重新启动 Cyberboss 后，测试闪存功能是否正常：

1. 在微信发送：`话说我突然想到可以写个自动整理照片的脚本`
2. Cyberboss 应该回复：`💡 已存。标签：工具脚本、自动化`
3. 检查 Obsidian vault 的 `闪存记忆/inbox/` 下是否出现了新的 JSON 文件

- [ ] 验证通过

---

## 完成清单

| Step | 内容 | 状态 |
|------|------|------|
| 1 | 创建 CyberbossVault | ⬜ |
| 2 | 创建目录结构（5 大类） | ⬜ |
| 3 | 配置 .env 环境变量 | ⬜ |
| 4 | 创建 Prompt 模板文件 | ⬜ |
| 5 | 创建知识库模板 | ⬜ |
| 6 | Git 初始化（可选） | ⬜ |
| 7 | 手机端 Obsidian 同步 | ⬜ |
| 8 | 验证闪存捕获功能 | ⬜ |

---

> 下一步：完成 Step 1-3 后告诉我，我这边验证 Cyberboss 能正确读写 Obsidian vault。
