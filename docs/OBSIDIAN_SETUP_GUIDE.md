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

Vault 已创建，信息如下：

```
Vault name: Cyberboss_fang
Location:   D:\Cyberboss\cyberbossVault\cyberboss_fang
```

- [x] Vault 已创建 ✅（小方完成）

---

## Step 2：创建目录结构 ✅（Cyberboss 完成）

已在 vault 中创建完整目录树：

```
Cyberboss_fang/
├── 闪存记忆/
│   ├── inbox/
│   ├── categorized/
│   │   ├── dev/
│   │   ├── life/
│   │   ├── idea/
│   │   ├── todo/
│   │   └── learning/
│   ├── archived/
│   └── merged/
├── 知识库/
│   ├── 计算机科学/
│   ├── 历史/
│   ├── 科学/
│   ├── 生活技巧/
│   ├── 经济学/
│   ├── 心理学/
│   └── 概率论与统计/
├── 每日总结/
│   ├── 2026/06/
│   ├── 2026/07/
│   └── 月度总结/
├── 大构思/
│   ├── drafts/
│   ├── refined/
│   └── sessions/
└── CYBERBOSS_PROMPTS/
    ├── 每日总结/
    ├── 闪存整理/
    ├── 大构思完善/
    └── 通用/
```

- [x] 所有文件夹已创建 ✅

---

## Step 3：配置环境变量 ✅（Cyberboss 完成）

已在 `cyberboss/.env` 中添加：

```env
# Obsidian Vault（v0.2.0 新增）
CYBERBOSS_OBSIDIAN_VAULT=D:/Cyberboss/cyberbossVault/cyberboss_fang
CYBERBOSS_FLASH_MEMORY_DIR=D:/Cyberboss/cyberbossVault/cyberboss_fang/闪存记忆
# CYBERBOSS_KNOWLEDGE_BASE_DIR（Phase 2 启用）
# CYBERBOSS_DAILY_SUMMARY_DIR（Phase 3 启用）
# CYBERBOSS_IDEA_DIR（Phase 4 启用）
```

- [x] 环境变量已配置 ✅

---

## Step 4：创建 Prompt 模板文件 ✅（Cyberboss 完成）

| 文件 | 路径 | 状态 |
|------|------|------|
| 每日总结 prompt | `CYBERBOSS_PROMPTS/每日总结/daily-summary.md` | ✅ 已复制 |
| 闪存整理 prompt | `CYBERBOSS_PROMPTS/闪存整理/flash-consolidation.md` | ✅ 已复制（待小方补充内容） |
| 大构思完善 prompt | `CYBERBOSS_PROMPTS/大构思完善/idea-refinement.md` | ✅ 已复制（待小方补充内容） |
| 通用语气风格 | `CYBERBOSS_PROMPTS/通用/tone-and-style.md` | 🟡 待小方创建 |

- [x] Prompt 模板已创建 ✅

---

## Step 5：创建知识库模板文件 ✅（Cyberboss 完成）

已创建两个模板笔记：

| 文件 | 用途 |
|------|------|
| `知识库/_模板_问答题.md` | 带 frontmatter（type/ category/ tags/ difficulty/ estimatedMinutes） |
| `知识库/_模板_冷知识.md` | 带 frontmatter（type/ category/ tags） |

> 小方后续录入知识库时，复制模板文件即可，不用每次手写 frontmatter。

- [x] 知识库模板已创建 ✅

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

| Step | 内容 | 负责人 | 状态 |
|------|------|--------|------|
| 1 | 创建 Cyberboss_fang vault | 小方 | ✅ |
| 2 | 创建目录结构（5 大类 20+ 子目录） | Cyberboss | ✅ |
| 3 | 配置 .env 环境变量 | Cyberboss | ✅ |
| 4 | 创建 Prompt 模板文件 | Cyberboss | ✅ |
| 5 | 创建知识库模板 | Cyberboss | ✅ |
| 6 | Git 初始化 vault（可选） | 小方 | ⬜ |
| 7 | 手机端 Obsidian 同步 | 小方 | ⬜ |
| 8 | 验证闪存捕获功能 | 一起 | ⬜ |

---

### Vault 实际信息

| 项目 | 值 |
|------|-----|
| Vault 名称 | `Cyberboss_fang` |
| 路径 | `D:\Cyberboss\cyberbossVault\cyberboss_fang` |
| 闪存记忆路径 | `D:\Cyberboss\cyberbossVault\cyberboss_fang\闪存记忆` |
| 环境变量 | `CYBERBOSS_FLASH_MEMORY_DIR` → 闪存记忆/ |

---

> **你现在要做**：Step 7（手机端 Obsidian 同步）+ Step 8（验证）。Step 6 可选。
> 验证方法：重启 Cyberboss → 微信发"话说我突然想到可以写个自动整理照片的脚本" → 应该回复 💡 已存 → 检查 Obsidian vault 的 `闪存记忆/inbox/` 下是否有新的 JSON 文件。
