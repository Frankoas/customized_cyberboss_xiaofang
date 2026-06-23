const fs = require("fs");
const path = require("path");

/**
 * Trigger Interceptor — v1.0.0 Phase 1
 * Scans incoming messages before they reach the LLM and fires deterministic rules.
 * Matched rules trigger direct vault writes via services, bypassing LLM.
 * Returns notifications so the LLM can confirm and supplement context.
 */

/**
 * Default trigger rules. Can be overridden by trigger-rules.json.
 */
const DEFAULT_RULES = {
  // ── Name detection: relationship words + 2-4 char Chinese name ──
  names: {
    pattern: "(?:我(?:有一个?|的|认识)(?:朋友|同学|同事|哥们|兄弟|闺蜜|室友|老师|老板|客户|合伙人|队友|室友)|认识)(?:叫|是)?\\s*([\\u4e00-\\u9fff]{2,4})",
    description: "Detect new person names from relationship context",
    action: "update_keywords_and_notify",
  },
  // ── Meeting signal detection ──
  meeting: {
    pattern: "(?:见|约|找|跟|和|同|去见|约了|去找|见了|碰头|碰面|见面|赴约|去接|去送)(?:了|过|一下)?\\s*([\\u4e00-\\u9fff]{2,4})",
    description: "Detect meeting/encounter signals",
    action: "notify_meeting_briefing",
  },
  // ── Flash memory detection ──
  flash: {
    pattern: "(?:灵感|想法|点子|记一下|备忘|提醒我|别忘了|突然想到|忽然想到|刚想到|想起来|对了|oh(?:\\s|$)|等下|待会|回头)",
    description: "Detect flash/inspiration/idea signals",
    action: "notify_flash_capture",
  },
  // ── Feedback detection ──
  feedback: {
    pattern: "(?:能不能加|可以加|希望支持|要是能|能不能(?:让|把)|加一个?功能|出bug|好像不对|没反应|不(?:太|怎么)好用|不太方便|每次都要|怎么(?:没有|不能|不行)|建议|提议)(?:一个?|一下)?",
    description: "Detect user feedback/bug report signals",
    action: "notify_feedback",
  },
  // ── Commute detection ──
  commute: {
    pattern: "(?:通勤|坐车|地铁|公交|高铁|打车|路上|在车|出发了|出门了|去(?:学校|公司|上班|上学))",
    description: "Detect commute signals",
    action: "notify_commute_quiz",
  },
  // ── End-of-day detection ──
  endOfDay: {
    pattern: "(?:收工|睡了|晚安|bye|拜拜|下了|关机|关电脑|不搞了|明天(?:再|见)|去睡|休息了|躺平)",
    description: "Detect end-of-day signals",
    action: "notify_daily_summary",
  },
  // ── Name aliases ──
  nameAliases: {
    pattern: "(?:就叫|叫他|她叫|名叫|绰号|外号|别称|大家都叫|通常叫|人称|一般叫)(?:是|叫|为)?\\s*([\\u4e00-\\u9fff]{2,4})",
    description: "Detect name aliases/nicknames",
    action: "update_keywords",
  },
};

class TriggerInterceptor {
  constructor({ services, rulesPath } = {}) {
    this.services = services;
    this.rules = this._loadRules(rulesPath);
    this.stats = { totalScans: 0, totalHits: 0, lastScan: null };
  }

  _loadRules(rulesPath) {
    const paths = [
      rulesPath,
      path.join(__dirname, "trigger-rules.json"),
      path.join(process.cwd?.() || ".", "trigger-rules.json"),
      path.join(process.env.CYBERBOSS_WORKSPACE_ROOT || ".", "trigger-rules.json"),
      path.join(
        process.env.CYBERBOSS_OBSIDIAN_VAULT || "",
        "..", "..", "cyberboss", "trigger-rules.json"
      ),
    ].filter(Boolean);

    for (const p of paths) {
      try {
        if (fs.existsSync(p)) {
          const content = fs.readFileSync(p, "utf8");
          const parsed = JSON.parse(content);
          if (parsed && typeof parsed === "object" && Object.keys(parsed).length > 0) {
            console.log(`[cyberboss] Trigger interceptor loaded rules from ${p} (${Object.keys(parsed).length} rules)`);
            return parsed;
          }
        }
      } catch (_) { /* continue */ }
    }
    console.log(`[cyberboss] Trigger interceptor using default rules (${Object.keys(DEFAULT_RULES).length} rules)`);
    return { ...DEFAULT_RULES };
  }

  /**
   * Scan text for trigger patterns.
   * @param {string} text - Incoming message text
   * @returns {{ hits: Array<{rule, match, action}>, notifications: string[] } | null}
   */
  scan(text) {
    if (!text || typeof text !== "string") return null;

    this.stats.totalScans++;
    this.stats.lastScan = new Date().toISOString();

    const hits = [];
    const notifications = [];

    for (const [ruleName, rule] of Object.entries(this.rules)) {
      if (!rule.pattern) continue;
      try {
        const regex = new RegExp(rule.pattern, "giu");
        let match;
        while ((match = regex.exec(text)) !== null) {
          const captured = match[1] || match[0];
          hits.push({
            rule: ruleName,
            match: captured,
            action: rule.action,
            description: rule.description,
          });
          notifications.push(`[触发器] 检测到「${rule.description}」→ 匹配: "${captured}"`);

          // Execute direct writes for certain actions
          if (rule.action === "update_keywords_and_notify" || rule.action === "update_keywords") {
            this._executeKeywordUpdate(captured, ruleName);
          }

          // Break after first match to avoid duplicate notifications
          break;
        }
      } catch (e) {
        console.warn(`[cyberboss] Trigger rule "${ruleName}" regex error: ${e.message}`);
      }
    }

    if (hits.length > 0) {
      this.stats.totalHits += hits.length;
      return { hits, notifications };
    }
    return null;
  }

  /**
   * Execute direct keyword table update (bypasses LLM).
   */
  _executeKeywordUpdate(name, ruleName) {
    try {
      if (this.services.relationshipHub) {
        const result = this.services.relationshipHub.updateKeywords({
          names: [name],
          source: `触发器:${ruleName}`,
        });
        if (result.updated) {
          console.log(`[cyberboss] Trigger auto-wrote name "${name}" to keyword table → ${result.filePath}`);
        }
      }
    } catch (e) {
      console.warn(`[cyberboss] Trigger keyword update failed: ${e.message}`);
    }
  }

  /**
   * Get interceptor statistics.
   */
  getStats() {
    return { ...this.stats };
  }
}

module.exports = { TriggerInterceptor, DEFAULT_RULES };
