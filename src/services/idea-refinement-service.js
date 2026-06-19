const fs = require("fs");
const path = require("path");
const os = require("os");

const DIMENSIONS_ORDER = [
  "who", "when", "cost",        // Phase 1: concrete anchors
  "causality", "assumption",    // Phase 2: challenge fragility
  "competitor", "chokepoint",   // Phase 3: external forces
  "mvp", "metrics",             // Phase 4: execution
];

const TERMINATION_REASONS = {
  COVERAGE_COMPLETE: "关键维度已充分覆盖",
  MAX_TURNS: "达到最大轮数（15轮）",
  USER_DONE: "用户表示完成",
  ABANDONED: "会话被放弃",
};

class IdeaRefinementService {
  constructor({ config }) {
    this.config = config;
    this.stateDir = config.stateDir || path.join(os.homedir(), ".cyberboss");
  }

  // ========================
  // Path resolution
  // ========================

  _resolveIdeasDir() {
    const envDir = process.env.CYBERBOSS_IDEA_DIR;
    if (envDir && envDir.trim()) {
      return path.resolve(envDir.trim());
    }
    const vault = process.env.CYBERBOSS_OBSIDIAN_VAULT;
    if (vault && vault.trim()) {
      return path.join(vault.trim(), "大构思");
    }
    return path.join(this.stateDir, "ideas");
  }

  _resolveDraftsDir() {
    return path.join(this._resolveIdeasDir(), "drafts");
  }

  _resolveSessionsDir() {
    return path.join(this._resolveIdeasDir(), "sessions");
  }

  _resolveRefinedDir() {
    return path.join(this._resolveIdeasDir(), "refined");
  }

  _resolveSessionPath(sessionId) {
    return path.join(this._resolveSessionsDir(), `${sessionId}-session.json`);
  }

  _resolveDraftPath(draftFile) {
    const name = path.basename(draftFile);
    return path.join(this._resolveDraftsDir(), name);
  }

  _resolveRefinedPath(sessionId) {
    return path.join(this._resolveRefinedDir(), `${sessionId}-完善.md`);
  }

  // ========================
  // Draft management
  // ========================

  /**
   * Scan the drafts directory for .md files.
   * Includes info about any active/resumable sessions.
   */
  scanDrafts() {
    const draftsDir = this._resolveDraftsDir();
    if (!fs.existsSync(draftsDir)) {
      return { drafts: [], count: 0 };
    }

    const drafts = [];
    const files = fs.readdirSync(draftsDir, { withFileTypes: true });
    for (const file of files) {
      if (!file.isFile() || !file.name.endsWith(".md")) continue;
      const filePath = path.join(draftsDir, file.name);
      const stat = fs.statSync(filePath);
      const parsed = this._parseDraftContent(filePath);

      // Check for existing session (active or paused)
      const existingSession = this._findSessionForDraft(file.name);

      drafts.push({
        draftFile: file.name,
        filePath,
        title: parsed.title,
        bodyPreview: (parsed.body || "").slice(0, 200),
        status: parsed.status || "pending",
        createdAt: parsed.created || stat.birthtime?.toISOString?.() || stat.mtime.toISOString(),
        updatedAt: stat.mtime.toISOString(),
        hasActiveSession: existingSession ? existingSession.status === "active" : false,
        sessionId: existingSession ? existingSession.sessionId : null,
        sessionTurn: existingSession ? existingSession.turn : 0,
        sessionPhase: existingSession ? existingSession.phase : 0,
      });
    }

    return { drafts, count: drafts.length };
  }

  /**
   * Read a draft .md file. No YAML frontmatter required —
   * the engine reads # Title and body content directly.
   * If YAML frontmatter IS present, its fields are used as hints.
   */
  getDraft(draftFile) {
    const filePath = this._resolveDraftPath(draftFile);
    return this._parseDraftContent(filePath);
  }

  _parseDraftContent(filePath) {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const raw = fs.readFileSync(filePath, "utf8");
    const frontmatter = parseYamlFrontmatter(raw);

    let title = "";
    const h1Match = raw.match(/^#\s+(.+)$/m);
    if (h1Match) title = h1Match[1];
    if (!title && frontmatter.title) title = frontmatter.title;
    if (!title) title = path.basename(filePath).replace(/\.md$/, "");

    // Extract body text
    let body = raw;
    if (raw.startsWith("---")) {
      const secondDelim = raw.indexOf("---", 3);
      if (secondDelim !== -1) {
        body = raw.slice(secondDelim + 3).trim();
      }
    }
    if (body.startsWith("# ")) {
      const nl = body.indexOf("\n");
      body = nl === -1 ? "" : body.slice(nl + 1).trim();
    }

    return {
      title,
      body: body || title,
      // These come from YAML frontmatter if present, otherwise empty
      focus_areas: parseYamlListValue(frontmatter.focus_areas || ""),
      confusions: parseYamlListValue(frontmatter.confusions || ""),
      status: frontmatter.status || "pending",
      created: frontmatter.created || "",
    };
  }

  // ========================
  // Session management
  // ========================

  /**
   * Start or resume a refinement session.
   * If an active/paused session already exists for this draft, resume it.
   */
  startSession(draftFile) {
    const draft = this.getDraft(draftFile);
    if (!draft) {
      throw new Error(`Draft not found: ${draftFile}`);
    }

    // Check for existing session — resume if found
    const existing = this._findSessionForDraft(draftFile);
    if (existing && existing.status === "active") {
      // Resume: return existing session with context
      return {
        session: existing,
        resumed: true,
        nextAction: "next_question",
        message: `Resumed session for "${draft.title}". Was at turn ${existing.turn}, Phase ${existing.phase}.`,
      };
    }

    // New session
    const sessionId = `${slugify(draft.title)}-${formatDateCompact(new Date())}`;
    const sessionsDir = this._resolveSessionsDir();
    if (!fs.existsSync(sessionsDir)) {
      fs.mkdirSync(sessionsDir, { recursive: true });
    }

    const session = {
      sessionId,
      draftFile: path.basename(draftFile),
      draftTitle: draft.title,
      startedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      turn: 0,
      phase: 1,
      coveredDimensions: [],
      extractedEntities: [],
      history: [],
      status: "active",
      terminationReason: null,
    };

    this._writeSession(session);

    return {
      session,
      resumed: false,
      nextAction: "next_question",
      message: `Session started for "${draft.title}". Phase 1 — anchoring concrete entities.`,
    };
  }

  /**
   * Get a session by ID.
   */
  getSession(sessionId) {
    const filePath = this._resolveSessionPath(sessionId);
    if (!fs.existsSync(filePath)) return null;
    try {
      return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch {
      return null;
    }
  }

  /**
   * Get the currently active session, if any.
   */
  getActiveSession() {
    const sessionsDir = this._resolveSessionsDir();
    if (!fs.existsSync(sessionsDir)) return null;

    const files = fs.readdirSync(sessionsDir, { withFileTypes: true });
    for (const file of files) {
      if (!file.isFile() || !file.name.endsWith("-session.json")) continue;
      const session = this.getSession(file.name.replace("-session.json", ""));
      if (session && session.status === "active") return session;
    }
    return null;
  }

  /**
   * List all sessions.
   */
  listSessions() {
    const sessionsDir = this._resolveSessionsDir();
    if (!fs.existsSync(sessionsDir)) return { sessions: [], count: 0 };

    const sessions = [];
    const files = fs.readdirSync(sessionsDir, { withFileTypes: true });
    for (const file of files) {
      if (!file.isFile() || !file.name.endsWith("-session.json")) continue;
      const session = this.getSession(file.name.replace("-session.json", ""));
      if (session) {
        sessions.push({
          sessionId: session.sessionId,
          draftTitle: session.draftTitle,
          turn: session.turn,
          phase: session.phase,
          coveredDimensions: session.coveredDimensions,
          status: session.status,
          startedAt: session.startedAt,
          lastActivityAt: session.lastActivityAt,
        });
      }
    }
    return { sessions, count: sessions.length };
  }

  // ========================
  // Question engine
  // ========================

  /**
   * Build the prompt context for the model to generate the next question.
   * Includes: draft content, current phase, coverage, history, entities.
   */
  buildQuestionPrompt(sessionId) {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    if (session.status !== "active") {
      throw new Error(`Session is not active: ${session.status}`);
    }

    const draft = this.getDraft(session.draftFile);
    if (!draft) {
      throw new Error(`Draft not found: ${session.draftFile}`);
    }

    const phaseGuide = getPhaseGuide(session.phase);

    return {
      systemPrompt: getSocraticSystemPrompt(),
      draft: { title: draft.title, body: draft.body || "" },
      session: {
        sessionId: session.sessionId,
        draftTitle: session.draftTitle,
        turn: session.turn,
        phase: session.phase,
        coveredDimensions: session.coveredDimensions,
        extractedEntities: session.extractedEntities,
        history: session.history,
      },
      instruction: [
        `## 当前状态`,
        `Phase ${session.phase}：${phaseGuide.label} — ${phaseGuide.goal}`,
        `当前轮数：${session.turn + 1} / 15`,
        ``,
        `## 构思草稿`,
        `标题：${draft.title}`,
        `内容：`,
        draft.body || draft.title,
        ``,
        `## 已覆盖维度`,
        session.coveredDimensions.length > 0
          ? session.coveredDimensions.map((d) => `- ${d}`).join("\n")
          : "（尚无，请从 Phase 1 开始锚定具体实体）",
        ``,
        `## 已提取实体`,
        session.extractedEntities.length > 0
          ? session.extractedEntities.join("、")
          : "（尚无）",
        ``,
        `## 对话历史`,
        session.history.length > 0
          ? session.history.map((h) => {
              const prefix = h.role === "assistant" ? "🤖" : "💡";
              const extra = h.rationale ? ` [${h.rationale}]` : "";
              return `${prefix} ${h.content}${extra}`;
            }).join("\n\n")
          : "（首轮）",
        ``,
        `## 输出要求`,
        `根据 Phase ${session.phase} 的目标，从草稿和对话历史中找到当前最该追问的缺口，生成 **1 个问题**。`,
        ``,
        `Phase ${session.phase} 指南：${phaseGuide.hint}`,
        ``,
        `输出 JSON：`,
        `{`,
        `  "question": "具体问题，≤35字",`,
        `  "rationale": "为什么问这个",`,
        `  "phase": ${session.phase},`,
        `  "extracted_entities": ["从用户上一轮回答中提取的实体"],`,
        `  "coverage_update": { "dimension_name": true }`,
        `}`,
        ``,
        `如果用户的最新回答已经足够清晰（Phase 4 完成），把 phase 设为 5。Phase 5 代表"可以停了"。`,
      ].join("\n"),
    };
  }

  /**
   * Record a user answer. Auto-saves to session JSON every time
   * (so interrupted sessions can be resumed).
   */
  recordAnswer(sessionId, answer) {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    if (session.status !== "active") {
      throw new Error(`Session is not active: ${session.status}`);
    }

    const answerText = String(answer || "").trim();
    if (!answerText) {
      throw new Error("Answer cannot be empty.");
    }

    session.history.push({ role: "user", content: answerText });
    session.turn += 1;
    session.lastActivityAt = new Date().toISOString();

    const termination = this._shouldTerminate(session);
    if (termination.shouldStop) {
      session.status = "completed";
      session.terminationReason = termination.reason;
    }

    this._writeSession(session);

    return {
      session,
      shouldStop: termination.shouldStop,
      terminationReason: termination.reason,
      nextAction: termination.shouldStop ? "stop_session" : "next_question",
    };
  }

  /**
   * Apply the model's question output — record the question,
   * update phase/coverage/entities.
   */
  applyQuestion(sessionId, questionData) {
    const session = this.getSession(sessionId);
    if (!session || session.status !== "active") return null;

    session.history.push({
      role: "assistant",
      content: questionData.question || "",
      rationale: questionData.rationale || "",
    });

    // Update phase if model advances it
    if (typeof questionData.phase === "number" && questionData.phase >= 1 && questionData.phase <= 5) {
      session.phase = questionData.phase;
    }

    // Deduplicate entities
    if (Array.isArray(questionData.extracted_entities)) {
      const existing = new Set(session.extractedEntities);
      for (const entity of questionData.extracted_entities) {
        if (entity && entity.trim()) existing.add(entity.trim());
      }
      session.extractedEntities = [...existing];
    }

    // Update covered dimensions
    if (questionData.coverage_update && typeof questionData.coverage_update === "object") {
      for (const [key, covered] of Object.entries(questionData.coverage_update)) {
        if (covered && !session.coveredDimensions.includes(key)) {
          session.coveredDimensions.push(key);
        }
      }
    }

    session.lastActivityAt = new Date().toISOString();

    // Phase 5 = stop
    if (session.phase === 5) {
      session.status = "completed";
      session.terminationReason = TERMINATION_REASONS.COVERAGE_COMPLETE;
    }

    this._writeSession(session);
    return session;
  }

  // ========================
  // Termination
  // ========================

  _shouldTerminate(session) {
    if (session.turn >= 15) {
      return { shouldStop: true, reason: TERMINATION_REASONS.MAX_TURNS };
    }

    // Coverage ≥ 80% of tracked dimensions
    const covered = session.coveredDimensions.length;
    const total = DIMENSIONS_ORDER.length;
    if (total > 0 && covered / total >= 0.8) {
      return { shouldStop: true, reason: TERMINATION_REASONS.COVERAGE_COMPLETE };
    }

    if (session.phase === 5) {
      return { shouldStop: true, reason: TERMINATION_REASONS.COVERAGE_COMPLETE };
    }

    // User done signals
    const lastUser = [...session.history].reverse().find((h) => h.role === "user");
    if (lastUser) {
      const doneSignals = ["好了", "可以了", "就这样", "差不多了", "不用了", "停", "结束", "够了"];
      if (doneSignals.some((s) => lastUser.content.toLowerCase().includes(s))) {
        return { shouldStop: true, reason: TERMINATION_REASONS.USER_DONE };
      }
    }

    return { shouldStop: false, reason: null };
  }

  // ========================
  // Finalize / Abandon
  // ========================

  finalizeSession(sessionId) {
    const session = this.getSession(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);

    session.status = "completed";
    if (!session.terminationReason) {
      session.terminationReason = TERMINATION_REASONS.USER_DONE;
    }
    session.lastActivityAt = new Date().toISOString();
    this._writeSession(session);

    const refinedMarkdown = this._renderRefinedMarkdown(session);
    const refinedDir = this._resolveRefinedDir();
    if (!fs.existsSync(refinedDir)) fs.mkdirSync(refinedDir, { recursive: true });

    const refinedPath = this._resolveRefinedPath(sessionId);
    fs.writeFileSync(refinedPath, refinedMarkdown, "utf8");

    // Update draft status
    const draftPath = this._resolveDraftPath(session.draftFile);
    if (fs.existsSync(draftPath)) {
      try {
        let raw = fs.readFileSync(draftPath, "utf8");
        if (raw.includes("status: pending")) {
          raw = raw.replace(/^status:\s*pending/m, "status: completed");
        } else if (raw.startsWith("---")) {
          raw = raw.replace(/^---\n/, `---\nstatus: completed\n`);
        } else {
          raw = `---\nstatus: completed\n---\n${raw}`;
        }
        fs.writeFileSync(draftPath, raw, "utf8");
      } catch { /* ignore */ }
    }

    return {
      session,
      refinedFile: refinedPath,
      message: `Session finalized. Refined output: ${refinedPath}`,
    };
  }

  abandonSession(sessionId) {
    const session = this.getSession(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);

    session.status = "abandoned";
    session.terminationReason = TERMINATION_REASONS.ABANDONED;
    session.lastActivityAt = new Date().toISOString();
    this._writeSession(session);

    return { session, message: "Session abandoned." };
  }

  // ========================
  // Rendering
  // ========================

  _renderRefinedMarkdown(session) {
    const lines = [];
    const phaseLabel = getPhaseGuide(session.phase).label;

    lines.push("---");
    lines.push(`type: idea-refined`);
    lines.push(`draft_title: "${session.draftTitle}"`);
    lines.push(`session_id: ${session.sessionId}`);
    lines.push(`started_at: "${session.startedAt}"`);
    lines.push(`completed_at: "${session.lastActivityAt}"`);
    lines.push(`total_turns: ${session.turn}`);
    lines.push(`final_phase: ${session.phase} (${phaseLabel})`);
    lines.push(`covered_dimensions: [${session.coveredDimensions.join(", ")}]`);
    lines.push(`extracted_entities: [${session.extractedEntities.join(", ")}]`);
    lines.push(`termination_reason: "${session.terminationReason || ""}"`);
    lines.push("---");
    lines.push("");
    lines.push(`# ${session.draftTitle} — 完善稿`);
    lines.push("");
    lines.push(`> 由 Cyberboss 大构思完善引擎生成 · ${session.startedAt} · ${session.turn} 轮`);
    lines.push("");

    lines.push("## 📊 完善统计");
    lines.push("");
    lines.push(`- 总轮数：${session.turn}`);
    lines.push(`- 最终阶段：Phase ${session.phase} — ${phaseLabel}`);
    lines.push(`- 覆盖维度：${session.coveredDimensions.join("、") || "无"}`);
    lines.push(`- 提取实体：${session.extractedEntities.join("、") || "无"}`);
    lines.push(`- 终止原因：${session.terminationReason || "—"}`);
    lines.push("");

    lines.push("## 💬 完善对话");
    lines.push("");
    for (let i = 0; i < session.history.length; i++) {
      const entry = session.history[i];
      if (entry.role === "assistant") {
        const qNum = Math.floor(i / 2) + 1;
        lines.push(`**🤖 第 ${qNum} 问：** ${entry.content}`);
        if (entry.rationale) lines.push(`> ${entry.rationale}`);
        lines.push("");
      } else {
        lines.push(`**💡 回答：** ${entry.content}`);
        lines.push("");
      }
    }

    lines.push("---");
    lines.push(`🤖 由 Cyberboss 大构思完善引擎自动生成`);

    return lines.join("\n") + "\n";
  }

  // ========================
  // Internal helpers
  // ========================

  _writeSession(session) {
    const dir = path.dirname(this._resolveSessionPath(session.sessionId));
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      this._resolveSessionPath(session.sessionId),
      JSON.stringify(session, null, 2),
      "utf8"
    );
  }

  _findSessionForDraft(draftFile) {
    const sessionsDir = this._resolveSessionsDir();
    if (!fs.existsSync(sessionsDir)) return null;

    const files = fs.readdirSync(sessionsDir, { withFileTypes: true });
    for (const file of files) {
      if (!file.isFile() || !file.name.endsWith("-session.json")) continue;
      const sessionId = file.name.replace("-session.json", "");
      const session = this.getSession(sessionId);
      if (session && session.draftFile === path.basename(draftFile)) {
        // Return active or most recent
        return session;
      }
    }
    return null;
  }
}

// ========================
// Phase Guide
// ========================

function getPhaseGuide(phase) {
  const guides = {
    1: {
      label: "澄清",
      goal: "锚定具体的物理坐标——谁、何时、多少钱",
      hint: "草稿里缺具体的人/时间/金额吗？问那个最关键的。",
    },
    2: {
      label: "挑战",
      goal: "测试脆弱性与因果链——如果XX断了会怎样",
      hint: "草稿里有没有不现实的假设？有没有单点故障？问最脆弱的那个。",
    },
    3: {
      label: "视角",
      goal: "找出博弈方与必经之路——谁反对、谁卡脖子",
      hint: "草稿里提到竞品、团队、平台依赖了吗？没有就问最大的外部阻力。",
    },
    4: {
      label: "落地",
      goal: "逼出最低可行版本与量化指标——砍什么、看什么数字",
      hint: "草稿里有没有可以砍掉的功能？有没有可以量化的目标？往最小可行动作逼。",
    },
    5: {
      label: "整合",
      goal: "停止提问，输出终止信号",
      hint: "已经够了。设 phase=5。",
    },
  };
  return guides[phase] || guides[1];
}

// ========================
// Socratic System Prompt
// ========================

function getSocraticSystemPrompt() {
  return [
    "## 角色",
    "你是苏格拉底式提问者。你的唯一任务：读构思草稿 → 按当前 Phase 的目标找到最该追问的缺口 → 生成 **1 个问题**。",
    "禁止闲聊、禁止总结、禁止给建议。只负责提问。",
    "",
    "## 五阶段框架",
    "",
    "| Phase | 目标 | 追问方向 |",
    "|-------|------|---------|",
    "| **1. 澄清** | 锚定具体物理坐标 | 谁、何时、多少钱？草稿里缺哪个问哪个 |",
    "| **2. 挑战** | 测试脆弱性 | 如果核心假设不成立会怎样？单点故障在哪？ |",
    "| **3. 视角** | 外部力量 | 谁会反对？谁卡脖子？竞品怎么做？ |",
    "| **4. 落地** | 最小行动 | 砍掉什么还能跑？第一个版本长什么样？怎么算成功？ |",
    "| **5. 整合** | 终止 | 已经够了，设 phase=5 |",
    "",
    "Phase 升级条件：当前 Phase 的核心问题用户已回答清楚 → 自动进入下一 Phase。",
    "Phase 降级条件：如果连续两轮没提取到新实体 → 回退到 Phase 4 逼具体数字。",
    "",
    "## 铁律",
    "",
    "**实体锚定** — 从上一轮回答中提取至少 1 个具体实体（人名/金额/日期/产品名），下一轮问题必须嵌入该实体。",
    '- ❌ "你的目标用户是谁？"',
    '- ✅ "你刚提到张三，如果张三只愿付 50 块，你的模式还成立吗？"',
    "",
    '**禁止"为什么"** — 用"是什么""多少""谁""如果…那…"代替。',
    "",
    "**一次一问** — 每轮只问 1 个问题，≤35 字（中文）。附带 1 句解释。",
    "",
    "**覆盖率自检** — 同一维度用户已回答 ≥2 次 → 标记 covered，不再追问。",
    "",
    "**判停** — 所有核心维度 covered ≥ 80%，或 ≥ 15 轮，或用户说停 → phase=5。",
    "",
    "## 禁止话题",
    '"意义""初心""社会影响""价值观""十年后"',
    "",
    "## 输出格式",
    "严格 JSON：",
    "{",
    '  "question": "具体问题，≤35字",',
    '  "rationale": "为什么问这个",',
    '  "phase": 当前phase数字(1-5),',
    '  "extracted_entities": ["实体1"],',
    '  "coverage_update": { "dimension_name": true }',
    "}",
  ].join("\n");
}

// ========================
// Helpers
// ========================

function parseYamlFrontmatter(raw) {
  const normalized = String(raw || "").trim();
  if (!normalized.startsWith("---")) return {};

  const secondDelim = normalized.indexOf("---", 3);
  if (secondDelim === -1) return {};

  const fmBlock = normalized.slice(3, secondDelim).trim();
  const fm = {};
  const lines = fmBlock.split("\n");
  for (const line of lines) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const rawValue = line.slice(colonIdx + 1).trim();
    if (!key || !rawValue) continue;

    if (key === "focus_areas" || key === "confusions" || key === "tags") {
      fm[key] = parseYamlListValue(rawValue);
    } else {
      fm[key] = stripYamlQuotes(rawValue);
    }
  }
  return fm;
}

function parseYamlListValue(value) {
  let normalized = String(value).trim();
  if (normalized.startsWith("[") && normalized.endsWith("]")) {
    normalized = normalized.slice(1, -1);
  }
  return normalized.split(",").map((s) => s.trim()).filter(Boolean);
}

function stripYamlQuotes(value) {
  let v = String(value).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  return v;
}

function slugify(text) {
  return String(text).trim()
    .replace(/[^\w一-鿿-]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)
    .toLowerCase();
}

function formatDate(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

function formatDateCompact(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date).replace(/-/g, "");
}

module.exports = { IdeaRefinementService };
