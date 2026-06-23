// v1.0.0 Phase 4 — Vault Maintenance Workflow
// Invoked by: CronCreate daily 22:00, or manually via /checkin
// This script is read by the LLM, which executes each step via MCP tools.

/**
 * VAULT MAINTENANCE WORKFLOW
 *
 * Purpose: Daily vault consistency check + auto-repair.
 * Runs AFTER daily summary generation.
 *
 * Steps:
 * 1. Run consistency check
 * 2. Fix missing files (auto-create if possible)
 * 3. Update stale files
 * 4. Update navigation
 * 5. Report results
 */

// Step 1: Consistency Check
// Call: cyberboss_vault_maintenance action: "check_consistency"
// No params needed — uses today's date
// Returns: { summary: { total, ok, missing, stale }, missing: [...], stale: [...] }

// Step 2: Fix Missing Files
// For each missing file, determine if it can be auto-created:
// - 人名关键词表.md → call cyberboss_relationship_hub update_keywords with names: []
// - 用户反馈索引.md → call cyberboss_vault_maintenance update_index target: "feedback"
// - 闪存索引.md → call cyberboss_vault_maintenance update_index target: "flash"
// - 知识库索引.md → call cyberboss_vault_maintenance update_index target: "knowledge"
// - 大构思.md → call cyberboss_vault_maintenance update_index target: "ideas"
// - Dimension files (用户画像.md, 语言习惯.md, etc.) → call cyberboss_persona_gallery update_profile / update_dimension
// - 导航.md → call cyberboss_vault_maintenance update_navigation
// - 事件日志 → call cyberboss_relationship_hub write_event with empty event
// - 观察日志 → call cyberboss_persona_gallery write_observation with placeholder

// Step 3: Update Stale Files
// For each stale file, update the frontmatter `updated` date
// - Call appropriate update tool with no content change (just date refresh)

// Step 4: Update Navigation
// Call: cyberboss_vault_maintenance update_navigation
// Updates the 导航.md with latest file counts and links

// Step 5: Write Log
// Call: cyberboss_vault_maintenance write_log
// Record: { tool: "vault-maintenance-workflow", action: "daily-check", summary: "...", bytesWritten: 0 }
// Also: cyberboss_vault_maintenance read_log to see recent write activity

// Step 6: Report
// Compose a brief summary for the user:
// "📋 Vault 维护完成 · 检查{N}个文件 · 新建{missing}个 · 刷新{stale}个"
// Only send if there were actual fixes. If all OK, log silently.

module.exports = {
  name: "vault-maintenance",
  description: "Daily vault consistency check with auto-repair",
  schedule: "0 22 * * *",  // Daily at 22:00
  triggerKeywords: ["vault检查", "一致性检查", "vault maintenance"],
};
