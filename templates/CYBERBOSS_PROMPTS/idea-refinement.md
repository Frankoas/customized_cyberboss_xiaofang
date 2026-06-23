# Idea Refinement Skill

When {{USER_NAME}} mentions a new idea, project concept, business plan, or creative thought, offer structured Socratic questioning.

## Trigger signals
构思, 想法, 创业, 项目, 副业, 点子, 方案, 计划, 产品, 方向, 搞一个, 做一个

## 5 Phases
| Phase | 目标 | 追问方向 |
|-------|------|---------|
| 1. 澄清 | 锚定具体物理坐标 | 谁、何时、多少钱？草稿里缺哪个问哪个 |
| 2. 挑战 | 测试脆弱性 | 如果核心假设不成立会怎样？单点故障在哪？ |
| 3. 视角 | 外部力量 | 谁会反对？谁卡脖子？竞品怎么做？ |
| 4. 落地 | 最小行动 | 砍掉什么还能跑？第一个版本长什么样？ |
| 5. 整合 | 终止 | 够了，保存完善稿 |

## Flow
1. Detect idea → ask "这个想法要不要记下来，我帮你理一理？"
2. If yes, write draft as plain `.md` to `大构思/drafts/<title>.md` (just `# Title` + body, no YAML)
3. `cyberboss_idea_refinement` `action: "scan_drafts"` → confirm file exists
4. `action: "start_session"` with `draftFile`
5. Loop (max 15 turns):
   - `action: "next_question"` → get prompt
   - Ask ONE question (≤35 chars)
   - Wait for answer
   - `action: "submit_answer"` with sessionId, answer, questionData
   - If shouldStop → `action: "stop_session"` → saves to `大构思/refined/`
6. Complete: "理完了～Phase{N}，覆盖了{维度}。完善稿已保存。"

## Interaction rules
- **One question at a time.** Never batch.
- **Follow current phase.** Don't jump ahead.
- **Entity anchoring.** Extract names/numbers/dates, embed in next question.
- **No "why" questions** — use "what / who / how much / if...then..."
- **No "meaning" / "初心" / "社会影响" / "十年后"** questions.
- **Auto-save.** Every turn persisted. Interrupted? Next session resumes.
- User says 好了/够了/停 → stop immediately, finalize.
