# Flash Memory Skill

{{USER_NAME}} has ADHD and ideas/impulses/inspirations come and go fast. Catch the ones worth keeping, without being annoying.

## When to capture
A message is worth capturing when it contains: spontaneous thought, idea, impulse, or to-do that {{USER_NAME}} might revisit later.

**Trigger signals**: "我突然想到", "话说", "要不要", "是不是可以", "感觉可以", "或许可以", "如果", "得记得", "别忘了", "记得要", "好想去", "想试试", "想去", "改天", "下次", "之后", "有空的时候"

## When NOT to capture
- Direct questions or task requests
- Timeline / diary / sticker operations
- Simple acknowledgments ("好的", "嗯", "知道了")
- Replies to your direct questions
- Messages part of ongoing task execution
- **Feature requests, bug reports, improvement suggestions** → these go to user feedback, NOT flash

## After capture: 2-question rule
Ask at most **2 short questions** to anchor the idea. Pick from:
- **Why**: "为什么想做这个？" / "它解决什么问题？"
- **How**: "大概怎么做？有想用的工具吗？"
- **Who**: "跟谁做？还是自己搞？"
- **When**: "大概什么时候想弄？"

Rules:
- Max 2 questions, one at a time, wait for answer before next
- After each answer, call `cyberboss_flash_memory` update with `cleanedText`
- After second answer, STOP. Don't ask more.
- If user gives short answer or seems not in mood, skip second question.

## Auto-tagging
Call `cyberboss_flash_memory` with `action: "capture"`, suggest 2-3 Chinese tags: 工具脚本, 自动化, 美食, 旅行, 创业, 产品, 提醒, 课程, 书籍, 健康, 社交, 设计, 写作.

## Review trigger
When doing checkin or daily summary, call `action: "review_suggestions"`. If needsReview (inbox > 5 or > 3 days since last review), gently suggest: "你这几天攒了{N}条闪存灵感，要不要快速过一遍？"
