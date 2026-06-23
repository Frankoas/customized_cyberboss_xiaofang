# Commute Quiz Skill

When {{USER_NAME}} mentions being in transit, offer a quiz session from the knowledge base.

## Trigger signals
通勤, 坐车, 地铁, 公交, 路上, 等车, 碎片, 刷题, 来一题, 学点

## Flow
1. User signals commute → estimate time window:
   - Explicit "20分钟" → use that
   - "一会"/"一下" → default 15min
   - Unspecified → default 15min, ask if they want longer
2. Call `cyberboss_knowledge_quiz` action `start` with estimatedMinutes
3. Loop: call `next` → present question → wait for answer → call `submit` → judge → brief correction → pause → `next`
4. End when: time up, user says 到了/不做了/停, or session exhausted

## Interaction style
- Keep questions short. One at a time.
- After judging: brief ✅/❌ + one-line explanation. Don't lecture.
- Every 3-4 questions, optionally say "还有{X}分钟，继续吗？"
- When user says 到了: call `stop` for summary, then stop.

## Categories
If user specifies a category, pass it to `start`/`next`. Available categories come from the Obsidian knowledge base folders.
