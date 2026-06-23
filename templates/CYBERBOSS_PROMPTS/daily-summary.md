# Daily Summary Skill

At end of day, generate structured daily summary aggregating timeline, diary, flash, and quiz data into a warm psychological review.

## When to generate
- **"收工"**: 收工了, 下班了, 不干了, 今天到这, 睡了, 晚安 → call `cyberboss_daily_summary` `action: "generate"`
- **Night checkin** (21:30-23:59): call `action: "check"` first, if shouldGenerate → `action: "generate"`
- **/summary**: explicit command → generate immediately

## Before generating (MANDATORY order)
**Step 0 — Mood snapshot**: Ask "今天整体感觉怎么样？😊开心/😐一般/😞低落/😤烦躁/🔋疲惫/💪充实/😰焦虑/😌平静/🔥兴奋" → call `cyberboss_diary_append` with `mood`

**Step 1 — Update timeline**: Call `cyberboss_timeline_write` with `mode: "merge"` to fill gaps → `cyberboss_timeline_read` to confirm

**Step 2 — Scan relationship events**: Catch any missed relationship triggers from today's conversation. Use `cyberboss_relationship_hub` tools to batch write.

**Step 3 — Extract persona observations** (MANDATORY): Scan today's conversation+diary+flash+timeline → call `cyberboss_persona_gallery` `write_observation` for each → evaluate each dimension → update dimension files

**Step 4 — Check status**: Call `action: "status"` to check if already generated

## After generating
1. Screenshot: `cyberboss_summary_screenshot` with `htmlFile`, `summaryType: "daily"`, `width: 420`, `fullPage: true`
2. Flash review: `cyberboss_flash_memory` `action: "review_suggestions"`
3. Brief highlight: 1-2 highlights + mood (~3-4 lines)
4. Offer: "要加明天的计划吗？" → `action: "append_plan"` if yes

## Screenshot tool selection (CRITICAL)
- `cyberboss_summary_screenshot` — ONLY for summary HTML files (requires `htmlFile` + `summaryType`)
- `cyberboss_timeline_screenshot` — ONLY for timeline dashboard (uses `date`/`week`/`month`)

## Timeline screenshot defaults
- 当日: `date: "today"` (no range — auto uses daily-timeline.html)
- 周视图: `range: "week"`, `width: 1024`, `fullPage: true`
- 月视图: `range: "month"`, `width: 1024`, `fullPage: true`

## Weekly & Monthly ride-along
- **周日**: Generate weekly → screenshot → "这周的周总结也出来了 📊"
- **15号**: Generate monthly → screenshot → "这个月的月总结也整理好了 📈"
- **Both Sunday AND 15th**: daily → weekly → monthly, combined message
- **Edge case**: If dailyCount is 0, skip — don't block remaining summaries
