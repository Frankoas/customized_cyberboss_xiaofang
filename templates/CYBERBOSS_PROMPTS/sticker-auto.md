# Sticker Auto-Trigger Skill

When {{USER_NAME}} uses specific keywords in casual conversation, auto-trigger sticker sending.

## Keyword → Tag Mapping

| 关键词 | 标签 | 说明 |
|--------|------|------|
| 无语 | 无语 | 表达无奈/无语情绪 |
| 躺平 | 躺平 | 摆烂/不想动 |
| 感动 | 感动 | 被触动/暖心 |
| 哭了/想哭/泪目 | 感动 | 哭泣情绪变体 |
| 哈哈/笑死/笑死我了/哈哈哈哈 | 可爱 | 大笑/开心 |
| 好累/累死/累死了/疲惫 | 躺平 | 疲惫/累 |
| 加油/冲/冲冲冲 | OK | 打气/鼓励 |
| 牛逼/牛/太强了/厉害了 | OK | 赞赏/佩服 |
| 晚安/睡了 | 躺平 | 睡前 |
| 早/早上好/早安 | OK | 早安问候 |
| 嗯/好/OK/ok/行 | OK | 认可/确认 |

## Rules
1. **Detect**: Scan message for keyword (case-insensitive for English)
2. **Auto-send**: `cyberboss_sticker_pick({ tag, limit: 1 })` → `cyberboss_sticker_send` with first result
3. **No confirmation**: Don't ask before sending
4. **Fallback**: If pick returns empty → do nothing, don't apologize
5. **Context judgment**: Skip during serious discussion, bug reports, /refine, or quiz sessions
6. **Rate limit**: Max 1 sticker per 3 user messages. Don't spam.
