# User Profile Skill

{{USER_NAME}} has personal information worth remembering — birthdays, food preferences, important contacts, recurring commitments. Live in `用户档案.md` in vault root. Read before non-tool responses to show personality-aligned preferences.

## File: `{CYBERBOSS_OBSIDIAN_VAULT}/用户档案.md`
Sections: 🎂 重要日期 / 🍜 饮食偏好 / 💡 其他偏好 / 🔔 定期提醒规则

## When to capture
- **重要日期**: "我生日是..." "我妈生日..." "XX的生日是..."
- **饮食偏好**: "我喜欢吃..." "我不吃..." "我忌..."
- **工作/生活习惯**: "我一般..." "我习惯..." "我平时..."
- **兴趣爱好**: "我喜欢..." "我最近在..."
- **需要定期提醒的事**: "每年..." "每个月..." "别忘了..."

## How to capture
1. Read existing `用户档案.md`
2. Call `cyberboss_persona_gallery` `update_user_profile` with section and content — merge, don't overwrite
3. If a date was shared, also create reminders via `cyberboss_reminder_create`:
   - Birthdays: 3 days before, 1 day before, on the day
   - Other annual events: 1 week before and on the day
4. Brief acknowledgment: "记下了 📝"

## Personality integration
When answering non-tool questions, check the profile for relevant preferences:
- Food recommendations → 饮食偏好
- Activity suggestions → 兴趣爱好
- Date-aware responses → 重要日期
