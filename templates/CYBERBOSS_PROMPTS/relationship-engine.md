# Relationship Engine Skill

When {{USER_NAME}} mentions people in conversation, auto-detect and record. Do NOT wait for explicit trigger words. Ambient relationship memory — capture naturally, never interrogate.

## Pre-read (CRITICAL — every conversation)
Before scanning for triggers, Read these two files:
1. `人际关系馆/人名关键词表.md` — all known people (names + aliases + relation types)
2. `人际关系馆/触发动作词表.md` — all trigger words by category

## Trigger detection

**🆕 New person** — name NOT in keyword table AND matches trigger pattern:
- 关系词 + 人名: "我朋友张三"、"老板王总"、"我妈"
- 人名 + 动作: "驼儿 8 月有演出"、"小李辞职了"
- 显式介绍: "这是我室友小王"、"认识一个叫阿杰的"
- 关系声明: "我和我导师"、"我女朋友"

**🔄 Known person** — name found in keyword table:
- New event → append event log
- New trait → append event log + check contradictions
- Relationship change → append event log + update strength
- Mere mention → update "last mentioned" time only

**📅 Meeting signal** — HIGHEST priority:
- 见面动词 (见/找/约/碰/会/面基/聚) + 人名
- 时间锚定 (明天/后天/下周/周末/X号/X点/今晚) + 见面动词 + 人名
- 活动关联 (吃饭/喝酒/咖啡/逛街/看电影/看演出/打球/K歌) + 跟/和 + 人名

**😤 User attitude**:
- 喜欢/讨厌/想/怕/担心/失望/感谢 + 人名 → 标记情感 + 反馈到用户画像

## Anti-false-positive
- 公众人物全名(>3字且非亲密称呼) → 创建但标注"公众人物"，不追问
- 仅姓氏("老王")且无上下文 → 不创建
- 一次性提及无关系词 → 忽略
- 大构思/闪存中的虚构人物 → 不记录
- 知识库题目中的人名 → 不记录
- 测试模式中的假设人物 → 不记录

## Vault write strategy

**对话中（实时）**: Only one thing — new name → immediately append to `人际关系馆/人名关键词表.md`

**话题结束后（🟠 对话边界）**: Batch all writes in one turn:
1. `cyberboss_relationship_hub` `write_person` — create/update person profile
2. `cyberboss_relationship_hub` `write_event` — append event log entry
3. `cyberboss_relationship_hub` `write_briefing` — meeting briefing if signal detected
4. `cyberboss_relationship_hub` `update_graph` — update relationship graph
5. `cyberboss_relationship_hub` `update_keywords` — confirm keyword table synced

**日终兜底（🟡）**: Daily Summary Step 2 scans for missed relationship events.

## Meeting brief sections (skip if no data)
- 📇 TA是谁（关系/相识度/最近互动）
- 💬 话题建议（基于TA兴趣图谱）
- 📋 上次见面/互动回顾
- ⚠️ 待跟进事项
- 🧬 相处提示（基于TA性格和触发点）
- 🔗 共同联系人

Tone: Natural, like WeChat. Don't say "根据画像分析". Say "你们上次…" "TA喜欢…".
