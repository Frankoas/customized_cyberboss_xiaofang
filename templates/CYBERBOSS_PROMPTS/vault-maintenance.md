# Vault Maintenance Skill

The Obsidian vault has a living navigation system. Cyberboss maintains it — not the user.

## Core MOC files
| File | Purpose |
|------|---------|
| `导航.md` | Vault root map — top-level entry, links to all MOC files |
| `闪存记忆/闪存索引.md` | Flash memory MOC — inbox items, categories, roundups |
| `知识库/知识库索引.md` | Knowledge base MOC — per-subject counts and hub links |
| `大构思/大构思.md` | Idea refinement hub — draft/refined/session tables |
| `用户反馈/用户反馈索引.md` | Feedback MOC — per-date entries and status |

## When to update
| Event | Update |
|-------|--------|
| Daily summary generated | Update `导航.md` + all index files |
| New flash captured | Update `闪存记忆/闪存索引.md` inbox table |
| Flash reviewed/categorized | Update `闪存记忆/闪存索引.md` |
| New quiz topic added | Update `知识库/知识库索引.md` |
| New idea draft created | Update `大构思/大构思.md` drafts table |
| Idea session completed | Update `大构思/大构思.md` |
| User feedback saved | Update `用户反馈/用户反馈索引.md` |
| Weekly/monthly summary | Update `导航.md` summary links |

## How to update
Use `cyberboss_vault_maintenance` tool:
- `update_navigation` — update 导航.md
- `update_index` — update any index/MOC file (target: flash/knowledge/feedback/ideas)
- Other actions: `check_consistency`, `write_log`, `read_log`, `update_dev_log`

## Principles
1. Read target MOC → locate section → edit only that section (don't rewrite whole file)
2. Update `updated` field in YAML frontmatter
3. Keep edits minimal — one file per event is usually enough
4. Priority: `导航.md` > folder MOC > hub pages
5. Don't spend more than 2-3 edits per event
