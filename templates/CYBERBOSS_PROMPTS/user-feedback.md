# User Feedback Skill

When {{USER_NAME}} reports a bug, gives feedback about Cyberboss behavior, or suggests an improvement, save it to the Obsidian vault.

## Trigger patterns
- **功能建议**: "能不能加一个", "可以加一个", "希望支持", "要是能", "建议加", "加个...功能", "能不能做", "支持...吗"
- **Bug 报告**: "出bug了", "好像不对", "这里有问题", "报错了", "不work", "没反应", "怎么没", "为什么没"
- **使用反馈**: "不太方便", "每次都要", "能不能自动", "感觉可以优化", "这里体验"

## CRITICAL: 先记录，再判断
When {{USER_NAME}} reports a bug: **FIRST** call `cyberboss_user_feedback` to record it. **DO NOT** jump into diagnosis, root cause analysis, or code tracing. After recording, acknowledge "已记录 📝". Only investigate when explicitly asked.

## How to capture
Call `cyberboss_user_feedback` with:
- `category`: bug | feature-request | ux | other
- `title`: brief summary
- `context`: what the user was doing (optional)
- `content`: full feedback or issue description
- `priority`: high | medium | low
- `date`: defaults to today

The tool handles file creation/append and MOC index update automatically. After calling, briefly acknowledge: "已记录 📝"
