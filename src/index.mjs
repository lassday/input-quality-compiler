/**
 * @trelmir/input-quality-compiler — TREL-OS-EBL-191-W1.1-INPUT-QUALITY-COMPILER-1
 *
 * Single-source IQC core (EBL-240): the runtime under apps/workspace-runtime
 * is now a thin shim around this module. Same compiler, two injection seams:
 *
 *   capabilities.validate(result)        → { ok, errors }   (default: no-op)
 *   capabilities.exemplars.read(opId)    → exemplars array  (default: [])
 *   capabilities.exemplars.afterCompile(result, opId)       (default: noop)
 *
 * The runtime injects AJV-backed `validate` + Mongo-backed exemplar bank/refresh.
 * SDK consumers get the same deterministic core with zero deps and stateless
 * defaults — no Mongo, no AJV, schema-stable output.
 *
 * NON-NEGOTIABLE doctrine from the EBL-191 spec + team verdict:
 *   1. RAW INPUT PRESERVED EXACTLY (`structuredClone` first line, invariant tested).
 *   2. NO LLM. Pure rules: exact-map → Levenshtein fuzzy ≤2 → phrase regex.
 *   3. Budget guard: timer + try/catch → minimal-shape fallback on >500ms / throw.
 *   4. Uncertainty surfaced (fuzzy + context-scoped hits carry uncertaintyFlag).
 *   5. Brian-readable externalized dictionary at brian-term-dictionary.json.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Kept in sync with package.json by `scripts/bump-version.mjs` on every
// publish. Consumers can `import { VERSION } from "@trelmir-os/input-quality-compiler"`
// for runtime introspection (compatibility shims, telemetry tagging, etc.).
// DO NOT edit by hand — bump-version writes this line.
export const VERSION = "0.1.6";

export const SLICE_ID = "TREL-OS-EBL-191-W1.1-INPUT-QUALITY-COMPILER-1";
export const BUDGET_MS = 500;
export const FUZZY_MAX_DISTANCE = 2;
export const FUZZY_MIN_LEN = 4;
export const MAX_FILE_REFS = 8;

// ────────────────────────────────────────────────────────────────────────
// Capability injection (EBL-240). Defaults are no-ops; the runtime shim
// passes a `capabilities` object with real AJV + Mongo implementations.
// ────────────────────────────────────────────────────────────────────────
const NOOP_VALIDATE = () => ({ ok: true, errors: [] });
const NOOP_EXEMPLARS = Object.freeze({
  read: () => [],
  afterCompile: () => {},
});
export const NOOP_CAPABILITIES = Object.freeze({
  validate: NOOP_VALIDATE,
  exemplars: NOOP_EXEMPLARS,
});

function _resolveCapabilities(caps) {
  if (!caps) return NOOP_CAPABILITIES;
  return {
    validate: typeof caps.validate === "function" ? caps.validate : NOOP_VALIDATE,
    exemplars: {
      read: caps.exemplars && typeof caps.exemplars.read === "function"
        ? caps.exemplars.read : NOOP_EXEMPLARS.read,
      afterCompile: caps.exemplars && typeof caps.exemplars.afterCompile === "function"
        ? caps.exemplars.afterCompile : NOOP_EXEMPLARS.afterCompile,
    },
  };
}

// ────────────────────────────────────────────────────────────────────────
// EBL-239 — Intent→Path Scanner. Three signal paths in priority order:
//   1. EXPLICIT path regex — `apps/foo/bar.mjs` mentions (always fires).
//   2. CONCEPT alias map — curated layman phrases (gated by code-intent).
//   3. KEBAB stem auto-index — readdirSync of runtime + CC v2 dirs at load.
//
// Brian-911 2026-06-08 (cco-1780942980561 RCA): steps 2+3 require code intent
// in the brief, else strategic prose ("the IQC is our top-of-funnel asset")
// would false-positive-pre-fetch internal files and hijack the team's focus.
// ────────────────────────────────────────────────────────────────────────
const _EXPLICIT_PATH_RX = /\b((?:apps|packages|scripts|docs)\/[a-zA-Z0-9_\-\/.]+\.(?:mjs|ts|tsx|js|jsx|cjs|json|md|py|sh|sql|yaml|yml))\b/g;

const _CONCEPT_ALIAS_MAP = Object.freeze({
  "consensus loop":         "apps/workspace-runtime/consensus-loop.mjs",
  "consensus-loop":         "apps/workspace-runtime/consensus-loop.mjs",
  "provenance gate":        "apps/workspace-runtime/provenance-gate.mjs",
  "provenance-gate":        "apps/workspace-runtime/provenance-gate.mjs",
  "input quality compiler": "apps/workspace-runtime/input-quality-compiler.mjs",
  "iqc":                    "apps/workspace-runtime/input-quality-compiler.mjs",
  "task spec compiler":     "apps/workspace-runtime/task-spec-compiler.mjs",
  "taskspec":               "apps/workspace-runtime/task-spec-compiler.mjs",
  "clarification gate":     "apps/workspace-runtime/input-quality-compiler.mjs",
  "evidence mandate":       "apps/workspace-runtime/provenance-gate.mjs",
  "build team":             "apps/workspace-runtime/build-team-cli-orchestrator.mjs",
  "build session":          "apps/workspace-runtime/build-team-cli-orchestrator.mjs",
  "build orchestrator":     "apps/workspace-runtime/build-team-cli-orchestrator.mjs",
  "write evidence":         "apps/workspace-runtime/write-evidence.mjs",
  "write plan":             "apps/workspace-runtime/write-evidence.mjs",
  "write queue":            "apps/workspace-runtime/write-evidence.mjs",
  "queue slice":            "apps/workspace-runtime/write-evidence.mjs",
  "queue plan":             "apps/workspace-runtime/write-evidence.mjs",
  "team fire":              "apps/workspace-runtime/consensus-loop.mjs",
  "team write":             "apps/workspace-runtime/consensus-loop.mjs",
  "the team":               "apps/workspace-runtime/consensus-loop.mjs",
  "voices":                 "apps/workspace-runtime/consensus-loop.mjs",
  "last fire":              "apps/workspace-runtime/consensus-loop.mjs",
  "finops":                 "apps/workspace-runtime/finops-aggregator.mjs",
  "anthropic adapter":      "apps/workspace-runtime/anthropic-api-adapter.mjs",
  "anthropic api":          "apps/workspace-runtime/anthropic-api-adapter.mjs",
  "anthropic usage":        "apps/workspace-runtime/anthropic-usage-adapter.mjs",
  "anthropic billing":      "apps/workspace-runtime/anthropic-usage-adapter.mjs",
  "tool runner":            "apps/workspace-runtime/tool-runner.mjs",
  "model tier registry":    "apps/workspace-runtime/model-tier-registry.mjs",
  "model registry":         "apps/workspace-runtime/model-tier-registry.mjs",
  "aegis":                  "apps/workspace-runtime/aegis-layer-voice-completion-auditor.mjs",
  "operator session":       "apps/workspace-runtime/operator-session.mjs",
  "queue chip":             "apps/command-center-v2/src/components/shell/WritePlanQueueChip.tsx",
  "write queue chip":       "apps/command-center-v2/src/components/shell/WritePlanQueueChip.tsx",
  "cli mirror":             "apps/command-center-v2/src/components/shell/CliMirrorPanel.tsx",
  "voice lab":              "apps/command-center-v2/src/components/viewport/slots/Slot16VoiceLab.tsx",
  "slot 4":                 "apps/command-center-v2/src/components/viewport/slots/Slot4FinOps.tsx",
  "finops panel":           "apps/command-center-v2/src/components/viewport/slots/Slot4FinOps.tsx",
});

// Kebab-stem auto-index — built once at load by walking the runtime + CC v2
// dirs. Only used when those dirs exist (SDK consumers without the monorepo
// get an empty index and rely on explicit paths + alias hits).
const _KEBAB_INDEX = (() => {
  const idx = new Map();
  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  const scanDirs = [
    "apps/workspace-runtime",
    "apps/command-center-v2/src/components/shell",
    "apps/command-center-v2/src/components/viewport/slots",
  ];
  for (const rel of scanDirs) {
    try {
      const abs = path.join(repoRoot, rel);
      const entries = fs.readdirSync(abs);
      for (const name of entries) {
        const m = name.match(/^([a-z][a-z0-9]+(?:-[a-z0-9]+)+)\.(mjs|ts|tsx|js|jsx)$/);
        if (!m) continue;
        if (name.includes(".test.")) continue;
        const stem = m[1];
        if (!idx.has(stem)) idx.set(stem, `${rel}/${name}`);
      }
    } catch { /* dir missing — non-fatal */ }
  }
  return idx;
})();

function _escapeRx(s) {
  return s.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
}

export function extractFileRefsFromBrief(text) {
  return _extractFileRefs(text);
}

function _extractFileRefs(cleanedText) {
  if (!cleanedText || typeof cleanedText !== "string") return [];
  const seen = new Set();
  const out = [];
  const push = (p) => {
    if (out.length >= MAX_FILE_REFS) return;
    if (!p || seen.has(p)) return;
    seen.add(p);
    out.push(p);
  };

  let m;
  _EXPLICIT_PATH_RX.lastIndex = 0;
  while ((m = _EXPLICIT_PATH_RX.exec(cleanedText)) !== null) {
    push(m[1]);
    if (out.length >= MAX_FILE_REFS) return out;
  }

  // Brian-911 2026-06-08 code-intent gate. Steps 2+3 fire ONLY when the brief
  // signals code intent — action verbs OR debug-question patterns.
  const _ACTION_VERB_RX = /\b(fix|debug|review|audit|check|build|implement|patch|refactor|update|add|remove|delete|wire|hook|trace|test|find|broken|stub|missing|gap|stale|outdated|crash|throw|hang|wedge|stall|leak|race)\b/i;
  const _DEBUG_QUESTION_RX = /\b(why|how|where|what|which)\b[^.!?]{0,80}\b(fail|error|break|crash|wrong|broken|missing|stub|gap|return|throw|stop|hang|wedge|stall|misbehav)/i;
  const _hasCodeIntent = _ACTION_VERB_RX.test(cleanedText) || _DEBUG_QUESTION_RX.test(cleanedText);
  if (!_hasCodeIntent) return out;

  const lower = cleanedText.toLowerCase();
  const concepts = Object.keys(_CONCEPT_ALIAS_MAP).sort((a, b) => b.length - a.length);
  for (const concept of concepts) {
    if (out.length >= MAX_FILE_REFS) return out;
    const rx = new RegExp("\\b" + _escapeRx(concept) + "\\b", "i");
    if (rx.test(lower)) push(_CONCEPT_ALIAS_MAP[concept]);
  }

  const KEBAB_RX = /\b([a-z][a-z0-9]+(?:-[a-z0-9]+)+)\b/g;
  while ((m = KEBAB_RX.exec(lower)) !== null) {
    if (out.length >= MAX_FILE_REFS) return out;
    const stem = m[1];
    const realPath = _KEBAB_INDEX.get(stem);
    if (realPath) push(realPath);
  }

  return out;
}

// ────────────────────────────────────────────────────────────────────────
// Dictionary loader — cache on first call. reloadDictionary() forces refresh.
// ────────────────────────────────────────────────────────────────────────
let _dictionaryCache = null;
let _dictionaryPath = path.join(__dirname, "brian-term-dictionary.json");

export function reloadDictionary(altPath) {
  if (altPath) _dictionaryPath = altPath;
  const raw = fs.readFileSync(_dictionaryPath, "utf8");
  const parsed = JSON.parse(raw);
  // Multi-token aliases ("chat got", "open ai") cannot hit the single-token
  // alias map via whitespace tokenization, so they're shadowed into the phrase
  // matcher as synthesized entries pointing at the same canonical.
  const aliasToEntry = new Map();
  const phraseEntries = [];
  for (const entry of parsed.entries || []) {
    const aliasList = entry.aliases || [];
    if (entry.phrase === true) {
      phraseEntries.push(entry);
      continue;
    }
    const singleTokenAliases = [];
    const multiTokenAliases = [];
    for (const alias of aliasList) {
      const a = String(alias);
      if (/\s/.test(a.trim())) multiTokenAliases.push(a.toLowerCase());
      else singleTokenAliases.push(a.toLowerCase());
    }
    for (const a of singleTokenAliases) aliasToEntry.set(a, entry);
    if (multiTokenAliases.length > 0) {
      phraseEntries.push({
        canonical: entry.canonical,
        aliases: multiTokenAliases,
        contextScope: entry.contextScope || null,
        confidence: entry.confidence,
        uncertaintyFlag: entry.uncertaintyFlag,
        phrase: true,
        _shadowOf: entry,
      });
    }
  }
  _dictionaryCache = {
    entries: parsed.entries || [],
    contextTokens: parsed.contextTokens || {},
    aliasToEntry,
    phraseEntries,
    _meta: parsed._meta || {},
  };
  return _dictionaryCache;
}

function _ensureDictionary() {
  if (_dictionaryCache) return _dictionaryCache;
  return reloadDictionary();
}

// ────────────────────────────────────────────────────────────────────────
// Levenshtein bounded — early-exits when distance exceeds maxDist.
// ────────────────────────────────────────────────────────────────────────
function levenshteinBounded(a, b, maxDist) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > maxDist) return maxDist + 1;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cost
      );
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > maxDist) return maxDist + 1;
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

function tokenize(text) {
  const tokens = [];
  const re = /[\p{L}\p{N}][\p{L}\p{N}'_-]*/gu;
  let m;
  while ((m = re.exec(text)) !== null) {
    tokens.push({ raw: m[0], lower: m[0].toLowerCase(), start: m.index, end: m.index + m[0].length });
  }
  return tokens;
}

function detectContext(lowerText, dict) {
  const active = new Set();
  for (const [label, tokens] of Object.entries(dict.contextTokens || {})) {
    for (const tk of tokens) {
      if (lowerText.includes(tk)) { active.add(label); break; }
    }
  }
  return active;
}

function matchPhrases(lowerText, dict, activeContext) {
  const hits = [];
  for (const entry of dict.phraseEntries) {
    if (entry.contextScope && !activeContext.has(entry.contextScope)) continue;
    for (const phrase of entry.aliases || []) {
      const p = String(phrase).toLowerCase();
      let idx = lowerText.indexOf(p);
      while (idx !== -1) {
        hits.push({
          entry,
          match: p,
          start: idx,
          end: idx + p.length,
          score: entry.confidence || 0.8,
          uncertaintyFlag: !!entry.uncertaintyFlag,
        });
        idx = lowerText.indexOf(p, idx + 1);
      }
    }
  }
  return hits;
}

function normalizeTokens(tokens, dict, activeContext) {
  const matches = [];
  for (const token of tokens) {
    const exact = dict.aliasToEntry.get(token.lower);
    if (exact) {
      if (exact.contextScope && !activeContext.has(exact.contextScope)) continue;
      matches.push({
        token,
        entry: exact,
        canonical: exact.canonical,
        score: exact.confidence || 0.9,
        uncertaintyFlag: !!exact.uncertaintyFlag,
        matchKind: "exact",
        distance: 0,
      });
      continue;
    }
    if (token.lower.length < FUZZY_MIN_LEN) continue;
    let bestEntry = null;
    let bestDistance = FUZZY_MAX_DISTANCE + 1;
    let bestAlias = null;
    for (const [alias, entry] of dict.aliasToEntry.entries()) {
      if (entry.contextScope && !activeContext.has(entry.contextScope)) continue;
      if (Math.abs(alias.length - token.lower.length) > FUZZY_MAX_DISTANCE) continue;
      const d = levenshteinBounded(token.lower, alias, FUZZY_MAX_DISTANCE);
      if (d < bestDistance) {
        bestDistance = d;
        bestEntry = entry;
        bestAlias = alias;
        if (d === 0) break;
      }
    }
    if (bestEntry && bestDistance <= FUZZY_MAX_DISTANCE) {
      const confidence = Math.max(
        0.4,
        (bestEntry.confidence || 0.9) - (bestDistance / FUZZY_MAX_DISTANCE) * 0.3
      );
      matches.push({
        token,
        entry: bestEntry,
        canonical: bestEntry.canonical,
        score: confidence,
        uncertaintyFlag: true,
        matchKind: "fuzzy",
        distance: bestDistance,
        matchedAlias: bestAlias,
      });
    }
  }
  return matches;
}

function buildCleanedText(rawInputCopy, tokenMatches, phraseMatches) {
  const replacements = [];
  for (const m of tokenMatches) {
    replacements.push({ start: m.token.start, end: m.token.end, replacement: m.canonical });
  }
  for (const p of phraseMatches) {
    replacements.push({ start: p.start, end: p.end, replacement: p.entry.canonical });
  }
  replacements.sort((a, b) => a.start - b.start);
  const filtered = [];
  let lastEnd = -1;
  for (const r of replacements) {
    if (r.start < lastEnd) continue;
    filtered.push(r);
    lastEnd = r.end;
  }
  let out = rawInputCopy;
  for (let i = filtered.length - 1; i >= 0; i--) {
    const r = filtered[i];
    out = out.slice(0, r.start) + r.replacement + out.slice(r.end);
  }
  return out;
}

function computeAmbiguityScore({ rawInput, tokens, tokenMatches, phraseMatches }) {
  const uncertainHits = [...tokenMatches, ...phraseMatches].filter(m => m.uncertaintyFlag).length;
  const totalHits = tokenMatches.length + phraseMatches.length;
  const pronouns = (rawInput.toLowerCase().match(/\b(it|this|that|these|those|they|them)\b/g) || []).length;
  const hasActionVerb = /\b(build|create|design|fix|add|remove|update|deploy|test|check|find|show|tell|make|write|read|run|do|generate|produce|implement|ship)\b/i.test(rawInput);
  const len = rawInput.trim().length;
  const isVeryShort = len > 0 && len < 12;

  let score = 0;
  score += uncertainHits * 0.18;
  score += totalHits === 0 ? 0.25 : 0;
  score += Math.min(0.3, pronouns * 0.08);
  score += hasActionVerb ? 0 : 0.2;
  score += isVeryShort ? 0.2 : 0;
  return Math.min(1, score);
}

function computeQualityDimensions({ rawInput, tokens, tokenMatches, phraseMatches, hasActionVerb, ambiguityScore }) {
  const totalTokens = tokens.length || 1;
  const resolvedEntities = tokenMatches.length + phraseMatches.length;
  const intentClarity = hasActionVerb ? 0.85 : 0.45;
  const outcomeClarity = rawInput.toLowerCase().match(/\b(so that|because|in order to|→|->)\b/) ? 0.9 : 0.55;
  const entityResolution = Math.min(1, resolvedEntities / Math.max(1, totalTokens * 0.25));
  const actionability = hasActionVerb && resolvedEntities > 0 ? 0.9 : (hasActionVerb ? 0.6 : 0.3);
  const acceptanceCriteriaCompleteness = /\b(when|until|so that|after|before|if|then)\b/i.test(rawInput) ? 0.75 : 0.4;
  const riskClarity = /\b(risk|danger|fail|break|might|could|maybe)\b/i.test(rawInput) ? 0.75 : 0.55;
  const ambiguityLevel = 1 - ambiguityScore;
  const missingInformationSeverity = ambiguityScore > 0.5 ? 0.3 : (ambiguityScore > 0.3 ? 0.65 : 0.85);
  const companyStandardPreservation = /\b(preserve|don'?t (remove|water|delete)|don'?t take|keep)\b/i.test(rawInput) ? 0.9 : 0.7;

  const dims = {
    intentClarity,
    outcomeClarity,
    entityResolution,
    actionability,
    acceptanceCriteriaCompleteness,
    riskClarity,
    ambiguityLevel,
    missingInformationSeverity,
    companyStandardPreservation,
  };
  const weights = {
    intentClarity: 0.15,
    outcomeClarity: 0.12,
    entityResolution: 0.13,
    actionability: 0.15,
    acceptanceCriteriaCompleteness: 0.10,
    riskClarity: 0.07,
    ambiguityLevel: 0.13,
    missingInformationSeverity: 0.10,
    companyStandardPreservation: 0.05,
  };
  let weighted = 0;
  let totalWeight = 0;
  for (const [k, w] of Object.entries(weights)) {
    weighted += (dims[k] ?? 0) * w;
    totalWeight += w;
  }
  const qualityInScore = Math.round((weighted / totalWeight) * 100);
  return { dimensions: dims, qualityInScore };
}

function _budgetFallback(rawInputPreserved, reason, latencyMs) {
  // Scanner is sub-1ms so it's safe to run even when the rest of IQC ran over
  // budget — wrapped in try so a scanner bug can't make fallback worse.
  let fileRefsFallback = [];
  try { fileRefsFallback = _extractFileRefs(rawInputPreserved); } catch {}
  return {
    ok: true,
    rawInputPreserved,
    cleanedText: rawInputPreserved,
    normalizedIntent: null,
    deltas: [],
    entities: [],
    productRefs: [],
    repoRefs: [],
    providerRefs: [],
    modelRefs: [],
    fileRefs: fileRefsFallback,
    workflowRefs: [],
    riskFlags: [],
    doNotLose: [],
    nonGoals: [],
    explicitRequirements: [],
    implicitRequirements: [],
    requestedActions: [],
    missingInformation: [],
    acceptanceCriteria: [],
    emotionalSignal: null,
    outputType: null,
    urgency: null,
    companyStandardRisks: [],
    antiDilutionWarnings: [],
    ambiguityScore: null,
    confidenceScore: null,
    qualityInScore: null,
    qualityDimensions: null,
    qualityInWarnings: ["IQC_BUDGET_FALLBACK:" + String(reason)],
    assumptionsMade: [],
    clarificationNeeded: true,
    clarifyingQuestionRequired: true,
    clarifyingQuestion: "Could you re-state what you want, in more detail?",
    recommendedNextCompilerStep: "raw_passthrough",
    fallback: true,
    fallbackReason: String(reason),
    processingMs: typeof latencyMs === "number" ? latencyMs : 0,
    sliceId: SLICE_ID,
  };
}

// ════════════════════════════════════════════════════════════════════════
// SPEC-CLOSEOUT EXTRACTORS — 2026-06-07
// All 11 deterministic (regex/heuristic), zero LLM, sub-2ms added latency.
// ════════════════════════════════════════════════════════════════════════

function _extractUserObjective(rawInput, hasActionVerb, deltas) {
  const trimmed = String(rawInput || "").trim();
  if (!trimmed) return null;
  const verbMatch = trimmed.match(/\b(build|create|design|fix|add|remove|update|deploy|test|check|find|show|tell|make|write|read|run|do|generate|produce|implement|ship|move|delete|rename|wire|hook)\b[^.!?]{1,80}/i);
  if (verbMatch) return verbMatch[0].trim().replace(/\s+/g, " ").slice(0, 160);
  const firstSentence = trimmed.split(/[.!?]/)[0].trim();
  return firstSentence ? firstSentence.slice(0, 160) : null;
}

function _extractRequiredOutcome(rawInput) {
  const t = String(rawInput || "");
  const patterns = [
    /\bi\s+want\s+(.+?)(?:[.!?]|$)/i,
    /\b(?:i\s+need|we\s+need)\s+(.+?)(?:[.!?]|$)/i,
    /\bso\s+that\s+(.+?)(?:[.!?]|$)/i,
    /[→\->]+\s*(.+?)(?:[.!?]|$)/,
    /\bgoal\s*[:=]\s*(.+?)(?:[.!?]|$)/i,
    /\boutcome\s*[:=]\s*(.+?)(?:[.!?]|$)/i,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m && m[1]) return m[1].trim().replace(/\s+/g, " ").slice(0, 200);
  }
  return null;
}

function _extractAcceptanceCriteria(rawInput) {
  const out = [];
  const t = String(rawInput || "");
  const bullets = t.match(/^\s*[-*•]\s+.+$/gm) || [];
  for (const b of bullets) {
    const cleaned = b.replace(/^\s*[-*•]\s+/, "").trim();
    if (cleaned.length >= 8 && cleaned.length <= 200) out.push(cleaned);
  }
  const phrases = [
    ...(t.match(/\bwhen\s+[^.,!?]{8,120}/gi) || []),
    ...(t.match(/\buntil\s+[^.,!?]{8,120}/gi) || []),
    ...(t.match(/\bso\s+that\s+[^.,!?]{8,120}/gi) || []),
    ...(t.match(/\bmust\s+[^.,!?]{8,120}/gi) || []),
  ];
  for (const p of phrases) {
    const cleaned = p.trim().replace(/\s+/g, " ");
    if (cleaned && !out.includes(cleaned)) out.push(cleaned);
  }
  return out.slice(0, 6);
}

function _extractNonGoals(rawInput) {
  const out = [];
  const t = String(rawInput || "");
  const patterns = [
    /\bdon'?t\s+(?:do\s+)?([^.,!?]{4,80})/gi,
    /\bno\s+(?!one|body|thing|where)([a-z]{3,40})\s*(?:for\s+now)?/gi,
    /\bwithout\s+([^.,!?]{4,60})/gi,
    /\bskip\s+([^.,!?]{4,60})/gi,
    /\bnot\s+(?:going\s+to\s+|gonna\s+)?([^.,!?]{4,60})/gi,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(t)) !== null) {
      const phrase = m[1].trim();
      if (phrase.length >= 4 && !out.includes(phrase)) out.push(phrase);
    }
  }
  return out.slice(0, 6);
}

function _extractEmotionalSignal(rawInput) {
  const t = String(rawInput || "");
  if (!t) return null;
  const exclaims = (t.match(/!/g) || []).length;
  const allCapsWords = (t.match(/\b[A-Z]{3,}\b/g) || []).length;
  const profanity = /\b(fuck|shit|damn|hell|wtf|bullshit)\b/i.test(t);
  const frustration = /\b(frustrated|pissed|annoyed|broken|why is|why does|why isn'?t|every time|again|still|same)\b/i.test(t);
  const excitement = /\b(amazing|nice|love it|perfect|beautiful|excellent|finally|works)\b/i.test(t);
  const urgent = /\b(911|asap|now|right now|urgent|immediately|emergency)\b/i.test(t);
  let intensity = 0;
  intensity += Math.min(0.4, exclaims * 0.08);
  intensity += Math.min(0.2, allCapsWords * 0.05);
  if (profanity) intensity += 0.3;
  if (frustration) intensity += 0.25;
  if (urgent) intensity += 0.2;
  if (intensity === 0 && !excitement) return null;
  let tone = "neutral";
  if (excitement && intensity < 0.3) tone = "excited";
  else if (urgent) tone = "urgent";
  else if (profanity || (frustration && intensity > 0.3)) tone = "frustrated";
  else if (intensity > 0.2) tone = "intense";
  return { tone, intensity: +Math.min(1, intensity).toFixed(2), profanity, frustration, urgent, excitement };
}

function _extractOutputType(rawInput, hasActionVerb) {
  const t = String(rawInput || "").toLowerCase();
  if (!t.trim()) return null;
  if (/\b(question|why|how|what|when|where|who)\b/.test(t) && !hasActionVerb) return "answer";
  if (/\b(plan|design|architect|propose|roadmap|spec)\b/.test(t)) return "plan";
  if (/\b(audit|review|check|verify|validate|inspect)\b/.test(t)) return "audit";
  if (/\b(commit|merge|push|release|ship)\b/.test(t)) return "commit_request";
  if (/\b(research|investigate|find out|look into)\b/.test(t)) return "research";
  if (/\b(fix|patch|repair|update)\b/.test(t)) return "patch";
  if (/\b(build|create|implement|wire|hook|add|generate)\b/.test(t)) return "build";
  if (/\b(clarify|explain|confirm)\b/.test(t)) return "clarify";
  if (hasActionVerb) return "build";
  return "answer";
}

function _extractUrgency(rawInput, emotionalSignal) {
  const t = String(rawInput || "").toLowerCase();
  if (/\b(911|asap|right now|urgent|immediately|emergency|critical|blocker|blocking)\b/.test(t)) return "high";
  if (emotionalSignal && emotionalSignal.urgent) return "high";
  if (emotionalSignal && emotionalSignal.tone === "frustrated") return "high";
  if (/\b(later|future|someday|when you get a chance|low priority|whenever)\b/.test(t)) return "low";
  return "normal";
}

function _extractRepoRefs(rawInput) {
  const t = String(rawInput || "");
  const out = new Set();
  if (/\btrelmir[-\s]?os[-\s]?repo\b/i.test(t)) out.add("trelmir-os-repo");
  if (/\btrelmir[-\s]?klariven[-\s]?authority\b/i.test(t)) out.add("trelmir-klariven-authority");
  if (/\bshipwarden[-\s]?repo\b/i.test(t)) out.add("shipwarden-repo");
  const generic = t.match(/\b(trelmir-[a-z][a-z0-9-]{2,30}|[a-z][a-z0-9-]{2,20}-repo)\b/gi) || [];
  for (const g of generic) out.add(g.toLowerCase().replace(/\s+/g, "-"));
  return [...out].slice(0, 6);
}

function _extractWorkflowRefs(rawInput) {
  const t = String(rawInput || "");
  const out = new Set();
  const ebls = t.match(/\bEBL-\d{2,4}(?:[\s.][WP]\d+(?:\.\d+)?)?\b/gi) || [];
  for (const e of ebls) out.add(e.toUpperCase().replace(/\s+/g, " "));
  const weeks = t.match(/\b[WP]\d+(?:\.\d+)?\b/g) || [];
  for (const w of weeks) out.add(w.toUpperCase());
  const named = [
    "brand_kit", "campaign_pack", "voice_clone", "founder_voice",
    "consensus_loop", "operator_session", "write_queue", "drive_sync",
    "input_quality_compiler", "task_spec_compiler", "sandbox_clip_stitch",
  ];
  for (const n of named) {
    const re = new RegExp("\\b" + n.replace(/_/g, "[_\\s]") + "\\b", "i");
    if (re.test(t)) out.add(n);
  }
  return [...out].slice(0, 8);
}

// Per team verdict cco-1780889443198 + cco-1780934028392: every pattern requires
// a version suffix so bare provider names ("gemini", "grok", "claude") land in
// providerRefs, not modelRefs (which feeds tier-routing — must be precise).
function _extractModelRefs(rawInput) {
  const t = String(rawInput || "");
  const out = new Set();
  const patterns = [
    /\bclaude[-\s]?(?:opus|sonnet|haiku)[-\s]?\d(?:[.-]\d+)*\b/gi,
    /\bgpt[-\s]?(?:5(?:\.\d)?|4(?:\.\d|o)?|3\.5)\b/gi,
    /\bgemini[-\s]?\d(?:[.-]\d+)*(?:[-\s]?(?:pro|flash|ultra))?\b/gi,
    /\bgrok[-\s]?\d(?:[-\s]?(?:reasoning|fast))?\b/gi,
    // `_` is a word char in JS regex so `\b` between letter and `_` fails —
    // lookbehind/lookahead instead. Version suffix handles "_v2", "_v2_5", "_2".
    /(?<![a-z])eleven[-_\s](?:multilingual|turbo|v\d)(?:_v?\d+(?:_\d+)?)?(?![a-z])/gi,
    /\bvoyage[-\s]?\d(?:[-\s]?(?:large|small))?\b/gi,
    /\bheygen[-\s]?avatar[-\s]?(?:iii|iv)\b/gi,
    /\bwan[-\s]?\d\.\d\b/gi,
  ];
  for (const re of patterns) {
    const matches = t.match(re) || [];
    for (const m of matches) out.add(m.toLowerCase().replace(/\s+/g, "-"));
  }
  return [...out].slice(0, 6);
}

function _extractImplicitRequirements({ productRefs, providerRefs, workflowRefs, doNotLose }) {
  const out = [];
  const products = new Set(productRefs || []);
  const providers = new Set(providerRefs || []);
  const workflows = new Set(workflowRefs || []);
  if (products.has("Klariven")) {
    out.push("preserve founder-voice launch gate (Klariven invariant)");
    out.push("respect customer-doc proof bank verified=true rule");
  }
  if (products.has("Shipwarden")) {
    out.push("respect Shipwarden drift gate — browser-visible outcome required");
  }
  if (products.has("Trelmir OS")) {
    out.push("preserve consensus-loop FROZEN doctrine (no edits to consensus mechanics without team verdict)");
  }
  if (providers.has("ElevenLabs")) {
    out.push("respect ElevenLabs voice-clone consent gate");
  }
  if (workflows.has("voice_clone") || workflows.has("founder_voice")) {
    out.push("voice cloning needs explicit operator consent + 60s sample minimum");
  }
  if (workflows.has("consensus_loop")) {
    out.push("consensus loop changes require team verdict first");
  }
  const hasAntiDilution = (doNotLose || []).some(d => d.canonical === "anti-dilution-requirement");
  if (hasAntiDilution) {
    out.push("preserve all scope/complexity in input — do not water down");
  }
  return out.slice(0, 6);
}

// ────────────────────────────────────────────────────────────────────────
// compileInputQuality — main entrypoint. The optional `capabilities` arg
// injects validate + exemplar bank/refresh; defaults are no-ops.
// ────────────────────────────────────────────────────────────────────────
export function compileInputQuality(args = {}, capabilities) {
  const rawInputPreserved = structuredClone(String((args && args.rawInput) || ""));

  const sourcePaneId = args.sourcePaneId != null ? String(args.sourcePaneId) : null;
  const sourceType = args.sourceType != null ? String(args.sourceType) : null;
  const sessionId = args.sessionId != null ? String(args.sessionId) : null;
  const timestamp = args.timestamp != null ? args.timestamp : Date.now();
  const attachedContextRefs = Array.isArray(args.attachedContextRefs)
    ? args.attachedContextRefs.slice(0, 20)
    : [];

  const caps = _resolveCapabilities(capabilities);
  const t0 = Date.now();
  try {
    if (!rawInputPreserved.trim()) {
      return {
        ok: false,
        rawInputPreserved,
        error: "empty_raw_input",
        qualityInScore: 0,
        qualityInWarnings: ["IQC_EMPTY_INPUT"],
        processingMs: Date.now() - t0,
        sliceId: SLICE_ID,
      };
    }

    const dict = _ensureDictionary();
    const lowerText = rawInputPreserved.toLowerCase();
    const tokens = tokenize(rawInputPreserved);
    const activeContext = detectContext(lowerText, dict);

    const phraseMatches = matchPhrases(lowerText, dict, activeContext);
    const tokenMatches = normalizeTokens(tokens, dict, activeContext);

    const rawInputCopy = String(rawInputPreserved);
    const cleanedText = buildCleanedText(rawInputCopy, tokenMatches, phraseMatches);

    const deltas = [
      ...tokenMatches.map(m => ({
        kind: "token",
        from: m.token.raw,
        to: m.canonical,
        start: m.token.start,
        end: m.token.end,
        matchKind: m.matchKind,
        distance: m.distance,
        confidence: m.score,
        uncertaintyFlag: m.uncertaintyFlag,
      })),
      ...phraseMatches.map(p => ({
        kind: "phrase",
        from: p.match,
        to: p.entry.canonical,
        start: p.start,
        end: p.end,
        matchKind: "phrase",
        distance: 0,
        confidence: p.score,
        uncertaintyFlag: p.uncertaintyFlag,
      })),
    ].sort((a, b) => a.start - b.start);

    const entityCanonicals = new Set();
    for (const d of deltas) entityCanonicals.add(d.to);
    const entities = [...entityCanonicals];

    const providerRefs = entities.filter(e => /^(Claude|ChatGPT\/OpenAI|Gemini|xAI\/Grok|ElevenLabs|HeyGen|Runway|Tripo3D)$/.test(e));
    const productRefs = entities.filter(e => /^(Klariven|Shipwarden|Trelmir OS)$/.test(e));

    const antiDilutionWarnings = phraseMatches
      .filter(p => p.entry.canonical === "anti-dilution-requirement")
      .map(() => "anti-dilution requirement detected in input");
    const companyStandardRisks = antiDilutionWarnings.length > 0 ? ["preserve_scope_required"] : [];
    const doNotLose = phraseMatches
      .filter(p => p.entry.canonical === "anti-dilution-requirement" || p.entry.canonical === "live-runtime-behavior-requirement" || p.entry.canonical === "founder-voice-launch-gate")
      .map(p => ({ phrase: p.match, canonical: p.entry.canonical }));

    const hasActionVerb = /\b(build|create|design|fix|add|remove|update|deploy|test|check|find|show|tell|make|write|read|run|do|generate|produce|implement|ship)\b/i.test(rawInputPreserved);

    const ambiguityScore = computeAmbiguityScore({ rawInput: rawInputPreserved, tokens, tokenMatches, phraseMatches });
    const confidenceScore = 1 - ambiguityScore;
    const { dimensions, qualityInScore } = computeQualityDimensions({
      rawInput: rawInputPreserved, tokens, tokenMatches, phraseMatches, hasActionVerb, ambiguityScore,
    });

    // EBL-239 Piece C — pre-compute fileRefs so the clarification gate can
    // detect "code-intent brief with zero file paths" before voices fire.
    const fileRefsForGate = _extractFileRefs(cleanedText);
    const codeIntentResult = _detectCodeIntent(cleanedText);

    const missingPathsForCodeIntent =
      codeIntentResult.hasCodeIntent && fileRefsForGate.length === 0;
    const clarifyingQuestionRequired = qualityInScore < 40 || missingPathsForCodeIntent;
    const clarifyingQuestion = clarifyingQuestionRequired
      ? (missingPathsForCodeIntent
          ? _buildMissingPathsQuestion(codeIntentResult)
          : _buildClarifyingQuestion({ tokenMatches, phraseMatches, hasActionVerb, ambiguityScore }))
      : null;

    const normalizedIntent = _buildNormalizedIntent({
      entities, hasActionVerb, doNotLose, phraseMatches, cleanedText,
    });

    const userObjective = _extractUserObjective(rawInputPreserved, hasActionVerb, deltas);
    const requiredOutcome = _extractRequiredOutcome(rawInputPreserved);
    const acceptanceCriteria = _extractAcceptanceCriteria(rawInputPreserved);
    const nonGoals = _extractNonGoals(rawInputPreserved);
    const emotionalSignal = _extractEmotionalSignal(rawInputPreserved);
    const outputType = _extractOutputType(rawInputPreserved, hasActionVerb);
    const urgency = _extractUrgency(rawInputPreserved, emotionalSignal);
    const repoRefs = _extractRepoRefs(rawInputPreserved);
    const workflowRefs = _extractWorkflowRefs(rawInputPreserved);
    const modelRefs = _extractModelRefs(rawInputPreserved);
    const implicitRequirements = _extractImplicitRequirements({
      productRefs, providerRefs, workflowRefs, doNotLose,
    });

    const processingMs = Date.now() - t0;
    if (processingMs > BUDGET_MS) {
      return _budgetFallback(rawInputPreserved, "budget_exceeded_" + processingMs + "ms", processingMs);
    }

    const _bankOperatorId = args.operatorId || sessionId || "default";

    const retval = {
      ok: true,
      rawInputPreserved,
      cleanedText,
      normalizedIntent,
      userObjective,
      requiredOutcome,
      deltas,
      entities,
      productRefs,
      repoRefs,
      providerRefs,
      modelRefs,
      fileRefs: fileRefsForGate,
      workflowRefs,
      riskFlags: companyStandardRisks,
      doNotLose,
      nonGoals,
      explicitRequirements: phraseMatches
        .filter(p => p.entry.canonical.endsWith("-requirement"))
        .map(p => p.entry.canonical),
      implicitRequirements,
      requestedActions: hasActionVerb ? ["action_verb_detected"] : [],
      missingInformation: clarifyingQuestionRequired ? ["unresolved_intent"] : [],
      acceptanceCriteria,
      emotionalSignal,
      outputType,
      urgency,
      companyStandardRisks,
      antiDilutionWarnings,
      ambiguityScore,
      confidenceScore,
      qualityInScore,
      qualityDimensions: dimensions,
      qualityInWarnings: [],
      assumptionsMade: [],
      clarificationNeeded: clarifyingQuestionRequired,
      clarifyingQuestionRequired,
      clarifyingQuestion,
      recommendedNextCompilerStep:
        qualityInScore >= 85 ? "context_compiler_full" :
        qualityInScore >= 65 ? "context_compiler_with_assumptions" :
        qualityInScore >= 40 ? "clarify_before_dispatch" :
        "block_dispatch_clarify",
      sourcePaneId,
      sourceType,
      sessionId,
      timestamp,
      attachedContextRefs,
      // Injected exemplar read (default []). The runtime fills this from a
      // module-cached Mongo top-N; SDK consumers can supply their own backend.
      referenceExemplars: caps.exemplars.read(_bankOperatorId),
      fallback: false,
      processingMs,
      sliceId: SLICE_ID,
    };

    // Fire-and-detach: injected afterCompile handles bank-write + cache-refresh
    // for the runtime. SDK default is a no-op.
    queueMicrotask(() => {
      try { caps.exemplars.afterCompile(retval, _bankOperatorId); } catch {}
    });

    return retval;
  } catch (err) {
    const latencyMs = Date.now() - t0;
    return _budgetFallback(rawInputPreserved, "exception_" + (err && err.message || "unknown"), latencyMs);
  }
}

export function compileInputQualityValidated(args, capabilities) {
  const caps = _resolveCapabilities(capabilities);
  const result = compileInputQuality(args, capabilities);
  try {
    const v = caps.validate(result);
    result.schemaValidationOk = v.ok;
    if (!v.ok) result.schemaValidationErrors = v.errors;
  } catch (_) { /* never throw from validator */ }
  return result;
}

// EBL-239 Piece C — code-intent detector. Conservative: (action OR debug-Q)
// AND a product noun. Strategic prose (no action verb, no debug pattern) skips.
const _CODE_ACTION_VERBS = /\b(?:fix|edit|change|modify|refactor|build|ship|debug|patch|update|wire|hook|add|remove|delete|strip|tear\s+out|implement|extend|broken|stale|wrong|hang|hung)\b/i;
const _DEBUG_QUESTION = /\b(?:why\s+(?:did|didn'?t|does|doesn'?t|is|isn'?t|are|aren'?t|won'?t|can'?t)|what'?s?\s+(?:wrong|broken|happening|the\s+issue)|where\s+(?:is|did|does)|how\s+come|what\s+went)\b/i;
const _PRODUCT_NOUNS = /\b(?:gate|loop|compiler|adapter|panel|chip|slot|runtime|server|button|endpoint|fence|verdict|queue|slice|plan|fire|fired|voice|voices|team|session|provenance|consensus|finops|anthropic|opus|sonnet|haiku|cache|prefetch|evidence|aegis|orchestrat|ledger|telemetry|cli|mirror|build\s+team|workspace)\b/i;

function _detectCodeIntent(text) {
  if (!text || typeof text !== "string") return { hasCodeIntent: false, signals: [] };
  const signals = [];
  const hasAction = _CODE_ACTION_VERBS.test(text);
  const hasDebugQ = _DEBUG_QUESTION.test(text);
  const hasNoun = _PRODUCT_NOUNS.test(text);
  if (hasAction) signals.push("action_verb");
  if (hasDebugQ) signals.push("debug_question");
  if (hasNoun) signals.push("product_noun");
  const hasCodeIntent = (hasAction || hasDebugQ) && hasNoun;
  return { hasCodeIntent, signals };
}

function _buildMissingPathsQuestion(intentResult) {
  const sigs = (intentResult && intentResult.signals) || [];
  const hint = sigs.includes("debug_question")
    ? "You're asking why something broke — which part?"
    : "You want to change something — which file or feature?";
  return `${hint} Mention a specific name so I can pull the right code (examples: "provenance gate", "consensus loop", "voice lab", "finops panel", "write queue chip"). Or paste a path like apps/workspace-runtime/foo.mjs.`;
}

function _buildNormalizedIntent({ entities, hasActionVerb, doNotLose, phraseMatches, cleanedText }) {
  const parts = [];
  if (entities.length > 0) parts.push("entities: " + entities.slice(0, 6).join(", "));
  if (hasActionVerb) parts.push("action: present");
  if (doNotLose.length > 0) parts.push("doNotLose: " + doNotLose.map(d => d.canonical).join(", "));
  if (parts.length === 0) return cleanedText.slice(0, 120);
  return parts.join(" | ");
}

function _buildClarifyingQuestion({ tokenMatches, phraseMatches, hasActionVerb, ambiguityScore }) {
  if (!hasActionVerb) return "What do you want to do? Try a verb like build/fix/show/check + the thing.";
  if (tokenMatches.length === 0 && phraseMatches.length === 0) return "Which specific tool, file, or product are you talking about?";
  return "I see an action but the target is unclear — what's the specific outcome you want?";
}

export function shouldGateForClarification(iqcResult) {
  if (!iqcResult || iqcResult.fallback) {
    return { shouldGate: false, tier: "iqc.compiled.assumed", reason: "fallback" };
  }
  // EBL-239 Piece C — honor canonical signal first: if clarifyingQuestionRequired
  // is set for a non-score reason (missing-paths-for-code-intent), gate even at
  // high score. Otherwise fail-fast is dead-letter and voices burn on a brief
  // we already know won't ground.
  const score = typeof iqcResult.qualityInScore === "number" ? iqcResult.qualityInScore : 50;
  if (iqcResult.clarifyingQuestionRequired && score >= 40) {
    return { shouldGate: true, tier: "iqc.clarify.missing_paths", reason: "clarifying_question_required" };
  }
  if (score >= 85) return { shouldGate: false, tier: "iqc.compiled.high", reason: "score_85_plus" };
  if (score >= 65) return { shouldGate: false, tier: "iqc.compiled.assumed", reason: "score_65_to_84" };
  if (score >= 40) return { shouldGate: true,  tier: "iqc.clarify.requested", reason: "score_40_to_64_risky_only" };
  return { shouldGate: true, tier: "iqc.dispatch.blocked", reason: "score_below_40" };
}

export function getDictionaryStats() {
  const dict = _ensureDictionary();
  return {
    aliasCount: dict.aliasToEntry.size,
    entryCount: dict.entries.length,
    phraseEntryCount: dict.phraseEntries.length,
    contextLabels: Object.keys(dict.contextTokens),
    dictionaryPath: _dictionaryPath,
  };
}

export { levenshteinBounded, tokenize, detectContext, BUDGET_MS as _BUDGET_MS };
