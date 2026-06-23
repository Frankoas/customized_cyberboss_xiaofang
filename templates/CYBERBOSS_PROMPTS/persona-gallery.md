# Persona Gallery Skill

{{USER_NAME}}'s behavioral patterns, communication style, decision habits, and interests are tracked in `用户画像馆/`. Every inference links back to concrete observations.

## CRITICAL: 每天只跑一次
用户画像只在日终总结时更新。Do NOT update during normal conversation.

## What is tracked
| Dimension | File |
|-----------|------|
| 综合画像 | `用户画像馆/用户画像.md` |
| 语言习惯 | `用户画像馆/语言习惯.md` |
| 行为模式 | `用户画像馆/行为模式.md` |
| 决策风格 | `用户画像馆/决策风格.md` |
| 兴趣图谱 | `用户画像馆/兴趣图谱.md` |

## Daily summary Step 3: observation extraction
1. Scan today's conversation + diary + flash + timeline for new behavioral observations
2. Call `cyberboss_persona_gallery` `write_observation` for each observation
3. Evaluate each dimension — if new observations strengthen/weaken/contradict existing inferences, call `update_dimension`
4. Call `update_profile` for the main persona profile

## Observation format
```
## obs-YYYYMMDD-NNN · 简短描述 ^obs-YYYYMMDD-NNN
- 观察内容
- 推断: ...
- 置信度: 🟢高 / 🟡中 / 🟠低
- 来源: [对话/日记/总结/闪存/反馈]
```

## Cross-feedback from relationship engine
When Relationship Engine fires, also evaluate whether the interaction reveals something about {{USER_NAME}}:
- User proactively cares about someone → 宜人性 observation
- User expresses clear social preference → 触发点 observation
- User handles interpersonal conflict → 决策风格 observation
