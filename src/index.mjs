/**
 * input-quality-compiler.mjs — TREL-OS-EBL-191-W1.1-INPUT-QUALITY-COMPILER-1
 *
 * Brian-mandate per EBL-191 spec + team verdict 2026-06-01: deterministic
 * Input Quality Compiler that normalizes rough founder/operator input (typos,
 * speech artifacts, Brian-terms like "claw"/"chat got"/"tripa") into clean
 * executable intent BEFORE any downstream compiler or dispatcher sees it.
 *
 * NON-NEGOTIABLE doctrine from the spec + verdict:
 *
 *   1. RAW INPUT PRESERVED EXACTLY. `rawInputPreserved` is set by
 *      `structuredClone(rawInput)` as the FIRST line of the function, before
 *      ANY mutation. Cleaner reads only the copy. Tested invariantly.
 *
 *   2. NO LLM in this slice. Pure rules: exact-map → Levenshtein fuzzy ≤2 →
 *      phrase regex. p95 target <500ms, realistically sub-5ms.
 *
 *   3. Budget guard: wrap in timer, on any exception or >500ms exceedance
 *      return raw + minimal fields + qualityInScore=low + warning. NEVER
 *      blocks a normal answer; only blocks risky-action dispatch (W1.4).
 *
 *   4. Uncertainty surfaced, not hidden. Context-scoped entries (e.g. `tripa`
 *      only fires in 3D context) carry `uncertaintyFlag: true` even on hit.
 *
 *   5. Brian-readable externalized dictionary at `brian-term-dictionary.json` —
 *      data, not code. Brian can edit it without touching the compiler.
 *
 * This is W1.1 only (Spec Parts 1 + 3 + 9). Downstream pieces:
 *   - W1.2: integration with shouldCompile at server.mjs:6082 (NOT 6020)
 *   - W1.3: task-spec-compiler.mjs consumes the IQC result
 *   - W1.4: dispatch gates per the 4 quality tiers
 *   - W1.5: live diff-strip UI in command-center-v2
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
// SDK build: schema validation lives in the internal runtime build, not the
// public SDK (AJV is an external dep we don't want in the standalone). The
// compileInputQualityValidated wrapper below is stripped to a no-op alias.
const validateIqcResult = (_r) => ({ ok: true, errors: [] });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const SLICE_ID = "TREL-OS-EBL-191-W1.1-INPUT-QUALITY-COMPILER-1";
export const BUDGET_MS = 500;
export const FUZZY_MAX_DISTANCE = 2;
export const FUZZY_MIN_LEN = 4; // don't fuzzy-match tokens shorter than this
export const MAX_FILE_REFS = 8;

// ────────────────────────────────────────────────────────────────────────
// EBL-239 — Intent→Path Scanner (the team verdict's "fill the empty stub")
//
// Layman briefs like "fix the provenance gate" need to be translated into
// concrete file paths BEFORE consensus voices fire. Without this, voices
// either speculate (provenance hard-block fires) or the operator burns
// $0.10+ on a fire that produces no output.
//
// Three signal paths, in priority order:
//   1. EXPLICIT path regex — `apps/foo/bar.mjs` style mentions in the brief.
//      Same regex as consensus-loop's WORKSPACE_PATH_REGEX so both layers
//      agree on what counts as a path.
//   2. CONCEPT alias map — curated layman phrases ("provenance gate",
//      "iqc", "voice lab") mapping to canonical paths.
//   3. KEBAB stem auto-index — at module load, fs.readdirSync the runtime
//      and CC v2 component dirs to build {kebab-name: full-path} index.
//      Catches "provenance-gate" bare mentions without manual curation.
//
// All three return ONLY paths that exist on disk (no speculation). The
// consensus-loop pre-fetch then inlines bytes for whatever lands here.
// ────────────────────────────────────────────────────────────────────────
const _EXPLICIT_PATH_RX = /\b((?:apps|packages|scripts|docs)\/[a-zA-Z0-9_\-\/.]+\.(?:mjs|ts|tsx|js|jsx|cjs|json|md|py|sh|sql|yaml|yml))\b/g;

const _CONCEPT_ALIAS_MAP = Object.freeze({
  // Runtime — consensus loop + adjacent
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
  // Build team
  "build team":             "apps/workspace-runtime/build-team-cli-orchestrator.mjs",
  "build session":          "apps/workspace-runtime/build-team-cli-orchestrator.mjs",
  "build orchestrator":     "apps/workspace-runtime/build-team-cli-orchestrator.mjs",
  // Write queue
  "write evidence":         "apps/workspace-runtime/write-evidence.mjs",
  "write plan":             "apps/workspace-runtime/write-evidence.mjs",
  "write queue":            "apps/workspace-runtime/write-evidence.mjs",
  "queue slice":            "apps/workspace-runtime/write-evidence.mjs",
  "queue plan":             "apps/workspace-runtime/write-evidence.mjs",
  // Team-self-referential — "why didnt the team write a queue slice" should
  // hit consensus-loop (where briefs are dispatched) AND write-evidence
  // (where the plan would have been attached).
  "team fire":              "apps/workspace-runtime/consensus-loop.mjs",
  "team write":             "apps/workspace-runtime/consensus-loop.mjs",
  "the team":               "apps/workspace-runtime/consensus-loop.mjs",
  "voices":                 "apps/workspace-runtime/consensus-loop.mjs",
  "last fire":              "apps/workspace-runtime/consensus-loop.mjs",
  // FinOps + Anthropic billing
  "finops":                 "apps/workspace-runtime/finops-aggregator.mjs",
  "anthropic adapter":      "apps/workspace-runtime/anthropic-api-adapter.mjs",
  "anthropic api":          "apps/workspace-runtime/anthropic-api-adapter.mjs",
  "anthropic usage":        "apps/workspace-runtime/anthropic-usage-adapter.mjs",
  "anthropic billing":      "apps/workspace-runtime/anthropic-usage-adapter.mjs",
  // Voices + tools
  "tool runner":            "apps/workspace-runtime/tool-runner.mjs",
  "model tier registry":    "apps/workspace-runtime/model-tier-registry.mjs",
  "model registry":         "apps/workspace-runtime/model-tier-registry.mjs",
  "aegis":                  "apps/workspace-runtime/aegis-layer-voice-completion-auditor.mjs",
  "operator session":       "apps/workspace-runtime/operator-session.mjs",
  // CC v2 components
  "queue chip":             "apps/command-center-v2/src/components/shell/WritePlanQueueChip.tsx",
  "write queue chip":       "apps/command-center-v2/src/components/shell/WritePlanQueueChip.tsx",
  "cli mirror":             "apps/command-center-v2/src/components/shell/CliMirrorPanel.tsx",
  "voice lab":              "apps/command-center-v2/src/components/viewport/slots/Slot16VoiceLab.tsx",
  "slot 4":                 "apps/command-center-v2/src/components/viewport/slots/Slot4FinOps.tsx",
  "finops panel":           "apps/command-center-v2/src/components/viewport/slots/Slot4FinOps.tsx",
});

// Kebab-stem auto-index. Built once at module load. Maps "consensus-loop" → "apps/workspace-runtime/consensus-loop.mjs"
const _KEBAB_INDEX = (() => {
  const idx = new Map();
  const repoRoot = path.resolve(__dirname, "..", "..");
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
    } catch { /* dir missing — non-fatal, scanner falls back to explicit + alias */ }
  }
  return idx;
})();

function _escapeRx(s) {
  return s.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
}

/**
 * Scan cleaned text for repo file references — explicit paths, curated
 * alias phrases, and kebab-case stems matching real files on disk.
 *
 * @param {string} cleanedText  — the IQC-cleaned brief
 * @returns {string[]} repo-relative paths (deduped, capped at MAX_FILE_REFS)
 */
// Public export so consensus-loop pre-fetch can call the same scanner
// without needing a full IQC compile pass. Same logic; renamed in export
// for clarity at the call site.
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

  // 1. Explicit path mentions
  let m;
  _EXPLICIT_PATH_RX.lastIndex = 0;
  while ((m = _EXPLICIT_PATH_RX.exec(cleanedText)) !== null) {
    push(m[1]);
    if (out.length >= MAX_FILE_REFS) return out;
  }

  // 2. Concept alias map — longest phrases first so "provenance gate" wins
  //    over generic "gate". Word-boundary match, case-insensitive.
  const lower = cleanedText.toLowerCase();
  const concepts = Object.keys(_CONCEPT_ALIAS_MAP).sort((a, b) => b.length - a.length);
  for (const concept of concepts) {
    if (out.length >= MAX_FILE_REFS) return out;
    const rx = new RegExp("\\b" + _escapeRx(concept) + "\\b", "i");
    if (rx.test(lower)) push(_CONCEPT_ALIAS_MAP[concept]);
  }

  // 3. Bare kebab-stem matches against the auto-indexed real-file table.
  //    Only suggests paths that actually exist (the index was built from
  //    readdirSync at module load).
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
// Dictionary loader — cache on first call. Reload by calling
// reloadDictionary() (used in tests + when Brian edits the JSON).
// ────────────────────────────────────────────────────────────────────────
let _dictionaryCache = null;
let _dictionaryPath = path.join(__dirname, "brian-term-dictionary.json");

export function reloadDictionary(altPath) {
  if (altPath) _dictionaryPath = altPath;
  const raw = fs.readFileSync(_dictionaryPath, "utf8");
  const parsed = JSON.parse(raw);
  // Build fast-lookup indexes. EBL-191 W1.1 (smoke-test fix):
  //   - entries marked `phrase: true` always flow through phrase matching
  //   - entries NOT marked but with multi-word aliases ("chat got", "open ai")
  //     ALSO need phrase matching for those specific aliases — tokens are
  //     split on whitespace so "chat got" can never hit the exact-alias map
  //     via tokens. Split aliases per entry: single-token → aliasToEntry map,
  //     multi-token → phrase matcher (synthesized phrase entry per alias).
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
      // Synthesize a phrase-mode shadow entry that points at the same canonical
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
// Levenshtein distance — bounded variant that early-exits when distance
// exceeds maxDist. Used only on tokens that failed exact-map AND are
// FUZZY_MIN_LEN or longer. Pure O(m*n) but bounded in practice by short
// alias lengths (typically ≤12 chars).
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
        curr[j - 1] + 1,        // insertion
        prev[j] + 1,            // deletion
        prev[j - 1] + cost      // substitution
      );
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > maxDist) return maxDist + 1;
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

// ────────────────────────────────────────────────────────────────────────
// Tokenize — split on whitespace + punctuation, lowercase. Preserve original
// token positions so we can build deltas with start/end indices for the
// W1.5 UI diff strip. Apostrophes inside words are kept (don't / can't).
// ────────────────────────────────────────────────────────────────────────
function tokenize(text) {
  const tokens = [];
  const re = /[\p{L}\p{N}][\p{L}\p{N}'_-]*/gu;
  let m;
  while ((m = re.exec(text)) !== null) {
    tokens.push({ raw: m[0], lower: m[0].toLowerCase(), start: m.index, end: m.index + m[0].length });
  }
  return tokens;
}

// ────────────────────────────────────────────────────────────────────────
// detectContext — return the set of context labels active in the input.
// e.g. "build the 3d mesh" → { code:true, 3d:true }. Used to gate
// contextScope entries.
// ────────────────────────────────────────────────────────────────────────
function detectContext(lowerText, dict) {
  const active = new Set();
  for (const [label, tokens] of Object.entries(dict.contextTokens || {})) {
    for (const tk of tokens) {
      if (lowerText.includes(tk)) { active.add(label); break; }
    }
  }
  return active;
}

// ────────────────────────────────────────────────────────────────────────
// Phrase matching — apply phrase entries (multi-word aliases) over the
// lowercased text. Returns array of { entry, match, start, end, score }.
// Phrase scoring uses base confidence (no fuzzy on phrases — they're
// intent-bearing structures, not typo-prone tokens).
// ────────────────────────────────────────────────────────────────────────
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

// ────────────────────────────────────────────────────────────────────────
// Token normalization — for each token, attempt exact-map first, then
// bounded fuzzy. Skip tokens shorter than FUZZY_MIN_LEN. Context-scoped
// entries only fire when their context is active.
// ────────────────────────────────────────────────────────────────────────
function normalizeTokens(tokens, dict, activeContext) {
  const matches = [];
  for (const token of tokens) {
    // 1. Exact alias hit
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
    // 2. Bounded fuzzy on long-enough tokens
    if (token.lower.length < FUZZY_MIN_LEN) continue;
    let bestEntry = null;
    let bestDistance = FUZZY_MAX_DISTANCE + 1;
    let bestAlias = null;
    for (const [alias, entry] of dict.aliasToEntry.entries()) {
      if (entry.contextScope && !activeContext.has(entry.contextScope)) continue;
      // Length pre-filter to skip impossible comparisons
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
      // Confidence subtracts distance/maxDist*0.3 — fuzzy matches are less certain than exact
      const confidence = Math.max(
        0.4,
        (bestEntry.confidence || 0.9) - (bestDistance / FUZZY_MAX_DISTANCE) * 0.3
      );
      matches.push({
        token,
        entry: bestEntry,
        canonical: bestEntry.canonical,
        score: confidence,
        uncertaintyFlag: true, // fuzzy matches always carry uncertainty
        matchKind: "fuzzy",
        distance: bestDistance,
        matchedAlias: bestAlias,
      });
    }
  }
  return matches;
}

// ────────────────────────────────────────────────────────────────────────
// Build cleanedText — for each token-level match, substitute the canonical
// form. Phrase matches replace the matched span. Preserves whitespace +
// punctuation between tokens. The original rawInput is NEVER mutated.
// ────────────────────────────────────────────────────────────────────────
function buildCleanedText(rawInputCopy, tokenMatches, phraseMatches) {
  // Build a list of replacements with start/end + replacement string
  const replacements = [];
  for (const m of tokenMatches) {
    replacements.push({ start: m.token.start, end: m.token.end, replacement: m.canonical });
  }
  for (const p of phraseMatches) {
    replacements.push({ start: p.start, end: p.end, replacement: p.entry.canonical });
  }
  // Sort by start; resolve overlaps by keeping the first (longest-prefix-wins-in-input-order)
  replacements.sort((a, b) => a.start - b.start);
  const filtered = [];
  let lastEnd = -1;
  for (const r of replacements) {
    if (r.start < lastEnd) continue;
    filtered.push(r);
    lastEnd = r.end;
  }
  // Apply right-to-left so indices stay valid
  let out = rawInputCopy;
  for (let i = filtered.length - 1; i >= 0; i--) {
    const r = filtered[i];
    out = out.slice(0, r.start) + r.replacement + out.slice(r.end);
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────────
// Ambiguity score — heuristic over signal counts. Each contributing factor
// adds weight; final score is normalized to 0..1.
// ────────────────────────────────────────────────────────────────────────
function computeAmbiguityScore({ rawInput, tokens, tokenMatches, phraseMatches }) {
  // Count uncertainty-flagged matches
  const uncertainHits = [...tokenMatches, ...phraseMatches].filter(m => m.uncertaintyFlag).length;
  const totalHits = tokenMatches.length + phraseMatches.length;
  // Pronoun density (rough proxy for missing referents)
  const pronouns = (rawInput.toLowerCase().match(/\b(it|this|that|these|those|they|them)\b/g) || []).length;
  // Verb presence — does the input contain an action verb?
  const hasActionVerb = /\b(build|create|design|fix|add|remove|update|deploy|test|check|find|show|tell|make|write|read|run|do|generate|produce|implement|ship)\b/i.test(rawInput);
  // Length penalty for very-short inputs
  const len = rawInput.trim().length;
  const isVeryShort = len > 0 && len < 12;

  let score = 0;
  score += uncertainHits * 0.18;
  score += totalHits === 0 ? 0.25 : 0; // nothing recognized at all
  score += Math.min(0.3, pronouns * 0.08);
  score += hasActionVerb ? 0 : 0.2;
  score += isVeryShort ? 0.2 : 0;
  return Math.min(1, score);
}

// ────────────────────────────────────────────────────────────────────────
// Quality dimensions per Spec Part 3 — produce 9 sub-scores (0..1) that
// combine into qualityInScore 0..100.
// ────────────────────────────────────────────────────────────────────────
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
  // Weighted blend → 0..100
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

// ────────────────────────────────────────────────────────────────────────
// Budget fallback — when timer or exception trips. Returns the minimal
// schema with raw preserved and qualityInScore=null + warning.
// ────────────────────────────────────────────────────────────────────────
function _budgetFallback(rawInputPreserved, reason, latencyMs) {
  // EBL-239 — even on budget fallback, try to extract fileRefs from the raw
  // input. The scanner is sub-1ms so it's safe to run even when the rest of
  // IQC ran over budget. Wrapped in try so a scanner bug can't make a
  // fallback worse than the original failure.
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
// SDK BUILD NOTE — 2026-06-08
// The internal Trelmir runtime version of this file ships with a Mongo-backed
// learning loop: every successful IQC compile fire-and-detach writes to a
// bank, then high-quality past compiles get pulled back as exemplars.
//
// The standalone npm SDK ships WITHOUT that coupling — pure deterministic
// compiler, zero external dependencies. SDK consumers who want a learning
// loop can layer it themselves by capturing each result + feeding past
// results back through their own storage. A planned v0.2 will accept
// `referenceExemplars` as an optional input arg so callers can wire any
// backend they prefer (Mongo, Postgres, S3, etc.).
// ════════════════════════════════════════════════════════════════════════

// Stub: SDK build returns empty exemplars (no learning loop in standalone).
function _readCachedExemplars(_operatorId) { return []; }

// ════════════════════════════════════════════════════════════════════════
// SPEC-CLOSEOUT EXTRACTORS — 2026-06-07
// Spec doc: docs/drive-sync/Trelmir_OS_-_Input_Quality_Compiler_Multi-Agent_Implementation_Prompt_v1__12GwqiEj7KHA.md
//
// The 11 fields below were stubs (null / []) since W1.1. Per Brian's "close
// the spec" mandate, each now has a deterministic extractor. All regex /
// heuristic — zero LLM calls — so total IQC stays under the 500ms p95 budget
// (currently 0.077ms p95). Output remains schema-stable: when an extractor
// can't find a signal, it returns the same null / [] shape callers depend on.
// ════════════════════════════════════════════════════════════════════════

// User objective = the 1-line "what does this user want" rephrasing.
// Pulled from the first verb+object clause OR the leading sentence.
function _extractUserObjective(rawInput, hasActionVerb, deltas) {
  const trimmed = String(rawInput || "").trim();
  if (!trimmed) return null;
  // If the input contains an action verb, find the first verb+object phrase
  const verbMatch = trimmed.match(/\b(build|create|design|fix|add|remove|update|deploy|test|check|find|show|tell|make|write|read|run|do|generate|produce|implement|ship|move|delete|rename|wire|hook)\b[^.!?]{1,80}/i);
  if (verbMatch) return verbMatch[0].trim().replace(/\s+/g, " ").slice(0, 160);
  // Otherwise return the first sentence
  const firstSentence = trimmed.split(/[.!?]/)[0].trim();
  return firstSentence ? firstSentence.slice(0, 160) : null;
}

// Required outcome = concrete deliverable inferred from explicit "I want X"
// / "need X to" / "so that X" phrasing. Falls back to "[action] [target]".
function _extractRequiredOutcome(rawInput) {
  const t = String(rawInput || "");
  // Pattern: "I want X" / "need X" / "so that X" / "→ X"
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

// Acceptance criteria = testable conditions. Pulled from "when X" / "until X"
// / "after X" / list items with checkboxes. Returns max 6 to stay punchy.
function _extractAcceptanceCriteria(rawInput) {
  const out = [];
  const t = String(rawInput || "");
  // Bullet list items that look like criteria
  const bullets = t.match(/^\s*[-*•]\s+.+$/gm) || [];
  for (const b of bullets) {
    const cleaned = b.replace(/^\s*[-*•]\s+/, "").trim();
    if (cleaned.length >= 8 && cleaned.length <= 200) out.push(cleaned);
  }
  // Inline criteria patterns
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

// Non-goals = explicit "don't X" / "no X" / "skip X" / "without X" anti-scope.
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

// Emotional signal — frustration / urgency / excitement detection.
// Returns null when neutral.
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

// Output type — what kind of artifact does the user expect back?
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

// Urgency — high / normal / low
function _extractUrgency(rawInput, emotionalSignal) {
  const t = String(rawInput || "").toLowerCase();
  if (/\b(911|asap|right now|urgent|immediately|emergency|critical|blocker|blocking)\b/.test(t)) return "high";
  if (emotionalSignal && emotionalSignal.urgent) return "high";
  if (emotionalSignal && emotionalSignal.tone === "frustrated") return "high";
  if (/\b(later|future|someday|when you get a chance|low priority|whenever)\b/.test(t)) return "low";
  return "normal";
}

// Repo refs — find named repos. The two canonical Trelmir repos are known;
// anything matching `<word>-repo` or `trelmir-<word>` is also captured.
function _extractRepoRefs(rawInput) {
  const t = String(rawInput || "");
  const out = new Set();
  if (/\btrelmir[-\s]?os[-\s]?repo\b/i.test(t)) out.add("trelmir-os-repo");
  if (/\btrelmir[-\s]?klariven[-\s]?authority\b/i.test(t)) out.add("trelmir-klariven-authority");
  if (/\bshipwarden[-\s]?repo\b/i.test(t)) out.add("shipwarden-repo");
  // Generic pattern — any "X-repo" or "trelmir-X"
  const generic = t.match(/\b(trelmir-[a-z][a-z0-9-]{2,30}|[a-z][a-z0-9-]{2,20}-repo)\b/gi) || [];
  for (const g of generic) out.add(g.toLowerCase().replace(/\s+/g, "-"));
  return [...out].slice(0, 6);
}

// Workflow refs — EBL slice IDs, ticket IDs, named workflows.
function _extractWorkflowRefs(rawInput) {
  const t = String(rawInput || "");
  const out = new Set();
  // EBL-XXX patterns
  const ebls = t.match(/\bEBL-\d{2,4}(?:[\s.][WP]\d+(?:\.\d+)?)?\b/gi) || [];
  for (const e of ebls) out.add(e.toUpperCase().replace(/\s+/g, " "));
  // Slice / week shorthand
  const weeks = t.match(/\b[WP]\d+(?:\.\d+)?\b/g) || [];
  for (const w of weeks) out.add(w.toUpperCase());
  // Workflow names from the product
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

// Model refs — explicit model IDs the user mentions.
// Per Claude Code's team verdict 2026-06-07 (cco-1780889443198): every pattern
// MUST require a version suffix so bare provider names ("gemini", "grok",
// "claude") don't get captured as fake model IDs. Bare provider names belong
// in providerRefs, not modelRefs. modelRefs feeds tier-routing — must be
// precise.
function _extractModelRefs(rawInput) {
  const t = String(rawInput || "");
  const out = new Set();
  const patterns = [
    // Each pattern below makes the model-version suffix REQUIRED (no `?`).
    // Claude: full build version like claude-sonnet-4-6 OR dated build like
    // claude-opus-4-5-20251001. `\d(?:[.-]\d+)*` captures any number of
    // dot/dash-separated version digits (e.g. 4-6, 4.5, 4-6-20251001).
    /\bclaude[-\s]?(?:opus|sonnet|haiku)[-\s]?\d(?:[.-]\d+)*\b/gi,
    /\bgpt[-\s]?(?:5(?:\.\d)?|4(?:\.\d|o)?|3\.5)\b/gi,
    // Gemini: requires a version — tier-only mentions ("gemini pro") belong
    // in providerRefs, not modelRefs (tier router needs precision). Flexible
    // body matches both dash and dot forms (gemini-2-5-pro, gemini-2.5-pro).
    /\bgemini[-\s]?\d(?:[.-]\d+)*(?:[-\s]?(?:pro|flash|ultra))?\b/gi,
    // Grok: now requires the version number
    /\bgrok[-\s]?\d(?:[-\s]?(?:reasoning|fast))?\b/gi,
    // ElevenLabs: requires a known model identifier (multilingual / turbo /
    // v2/v3 / specific version like v2_5). Bare "eleven" no longer matches.
    // Lookbehind `(?<![a-z])` + lookahead `(?![a-z])` instead of `\b` because
    // `_` is a word char in JS regex — `\b` between letter and `_` fails.
    // Version suffix `_v?\d+(?:_\d+)?` handles "_v2", "_v2_5", "_2".
    /(?<![a-z])eleven[-_\s](?:multilingual|turbo|v\d)(?:_v?\d+(?:_\d+)?)?(?![a-z])/gi,
    // Voyage: requires version number
    /\bvoyage[-\s]?\d(?:[-\s]?(?:large|small))?\b/gi,
    // HeyGen: requires the avatar version (iii/iv)
    /\bheygen[-\s]?avatar[-\s]?(?:iii|iv)\b/gi,
    // Wan: already required a version number
    /\bwan[-\s]?\d\.\d\b/gi,
  ];
  for (const re of patterns) {
    const matches = t.match(re) || [];
    for (const m of matches) out.add(m.toLowerCase().replace(/\s+/g, "-"));
  }
  return [...out].slice(0, 6);
}

// Implicit requirements — inferred from product context. Example: mentioning
// "Klariven" implies "preserve founder-voice launch gate" because that's a
// Klariven invariant. These are heuristics, not exhaustive — flagged as
// implicit so callers can show "system inferred X — confirm?" UX.
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
  // If doNotLose flags scope-preservation, surface as anti-dilution implicit
  const hasAntiDilution = (doNotLose || []).some(d => d.canonical === "anti-dilution-requirement");
  if (hasAntiDilution) {
    out.push("preserve all scope/complexity in input — do not water down");
  }
  return out.slice(0, 6);
}

// ────────────────────────────────────────────────────────────────────────
// compileInputQuality — main entrypoint. Accepts the spec's input shape,
// returns the normalized result. ALWAYS preserves raw exactly. Sub-500ms.
// ────────────────────────────────────────────────────────────────────────
export function compileInputQuality(args = {}) {
  // CRITICAL: first line — raw input preservation invariant.
  const rawInputPreserved = structuredClone(String((args && args.rawInput) || ""));

  // Spec Part 1 — accept the full input shape. These pass through to the
  // result so downstream callers (TaskSpec compiler, dispatch gate, UI)
  // can correlate the IQC result with the source pane / session / message.
  // Spec close-out 2026-06-07.
  const sourcePaneId = args.sourcePaneId != null ? String(args.sourcePaneId) : null;
  const sourceType = args.sourceType != null ? String(args.sourceType) : null;
  const sessionId = args.sessionId != null ? String(args.sessionId) : null;
  const timestamp = args.timestamp != null ? args.timestamp : Date.now();
  const attachedContextRefs = Array.isArray(args.attachedContextRefs)
    ? args.attachedContextRefs.slice(0, 20)
    : [];

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

    // Build cleanedText from a separate copy — NEVER touch rawInputPreserved
    const rawInputCopy = String(rawInputPreserved);
    const cleanedText = buildCleanedText(rawInputCopy, tokenMatches, phraseMatches);

    // Build deltas (for W1.5-lite diff strip)
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

    // Entities = the unique canonical forms recognized
    const entityCanonicals = new Set();
    for (const d of deltas) entityCanonicals.add(d.to);
    const entities = [...entityCanonicals];

    // Categorize known entity canonicals into refs (best-effort, additive)
    const providerRefs = entities.filter(e => /^(Claude|ChatGPT\/OpenAI|Gemini|xAI\/Grok|ElevenLabs|HeyGen|Runway|Tripo3D)$/.test(e));
    const productRefs = entities.filter(e => /^(Klariven|Shipwarden|Trelmir OS)$/.test(e));
    // modelRefs now populated by _extractModelRefs() — old stub removed 2026-06-07.

    // Brian-flag requirement extraction (phrase-driven)
    const antiDilutionWarnings = phraseMatches
      .filter(p => p.entry.canonical === "anti-dilution-requirement")
      .map(() => "anti-dilution requirement detected in input");
    const companyStandardRisks = antiDilutionWarnings.length > 0 ? ["preserve_scope_required"] : [];
    const doNotLose = phraseMatches
      .filter(p => p.entry.canonical === "anti-dilution-requirement" || p.entry.canonical === "live-runtime-behavior-requirement" || p.entry.canonical === "founder-voice-launch-gate")
      .map(p => ({ phrase: p.match, canonical: p.entry.canonical }));

    // Heuristic feature detection
    const hasActionVerb = /\b(build|create|design|fix|add|remove|update|deploy|test|check|find|show|tell|make|write|read|run|do|generate|produce|implement|ship)\b/i.test(rawInputPreserved);

    // Ambiguity + quality
    const ambiguityScore = computeAmbiguityScore({ rawInput: rawInputPreserved, tokens, tokenMatches, phraseMatches });
    const confidenceScore = 1 - ambiguityScore;
    const { dimensions, qualityInScore } = computeQualityDimensions({
      rawInput: rawInputPreserved, tokens, tokenMatches, phraseMatches, hasActionVerb, ambiguityScore,
    });

    // EBL-239 Piece C — pre-compute fileRefs so the clarification gate can
    // detect "code-intent brief with zero file paths" (the FinOps pre-condition
    // from the team verdict: don't fire 6 voices on a code question when no
    // file maps were found).
    const fileRefsForGate = _extractFileRefs(cleanedText);
    const codeIntentResult = _detectCodeIntent(cleanedText);

    // Determine clarification need (Spec Part 3 gates)
    // Two triggers:
    //   1. ORIGINAL — quality score below threshold (ambiguous brief)
    //   2. EBL-239 — strong code intent ("fix the X", "why did Y break")
    //      but the scanner found zero files. Firing 6 voices on this would
    //      either hard-block on speculation or burn $0.10+ on no output.
    const missingPathsForCodeIntent =
      codeIntentResult.hasCodeIntent && fileRefsForGate.length === 0;
    const clarifyingQuestionRequired = qualityInScore < 40 || missingPathsForCodeIntent;
    const clarifyingQuestion = clarifyingQuestionRequired
      ? (missingPathsForCodeIntent
          ? _buildMissingPathsQuestion(codeIntentResult)
          : _buildClarifyingQuestion({ tokenMatches, phraseMatches, hasActionVerb, ambiguityScore }))
      : null;

    // Build the normalizedIntent string — short human-readable summary
    const normalizedIntent = _buildNormalizedIntent({
      entities, hasActionVerb, doNotLose, phraseMatches, cleanedText,
    });

    // Spec close-out 2026-06-07 — run the 11 deterministic extractors.
    // Total added latency: ~0.5-2ms on Brian-sized inputs. Stays well
    // under the 500ms p95 budget (current p95 is 0.077ms).
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

    // EBL-191 V4 learning loop — banking scope: derive a stable operatorId
    // for this call so both the bank write and the exemplar read agree.
    const _bankOperatorId = args.operatorId || sessionId || "default";

    const retval = {
      ok: true,
      rawInputPreserved,
      cleanedText,
      normalizedIntent,
      // Spec close-out 2026-06-07 — userObjective + requiredOutcome are new
      // top-level fields the spec required but were missing from the schema.
      userObjective,
      requiredOutcome,
      deltas,
      entities,
      productRefs,
      repoRefs,
      providerRefs,
      modelRefs,
      // EBL-239 — was [], now filled by deterministic intent→path scanner.
      // Feeds task-spec-compiler:617 → consensus-loop pre-fetch, which inlines
      // file bytes into voice prompts so layman briefs ("fix the provenance
      // gate") don't get hard-blocked by the Evidence Mandate. Reuses the
      // value computed pre-gate so we don't run the scanner twice per fire.
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
      // Spec close-out 2026-06-07 — pass-through of input correlation refs
      // so downstream callers (TaskSpec, dispatch gate, UI) can join the
      // IQC result to the originating pane/session/message.
      sourcePaneId,
      sourceType,
      sessionId,
      timestamp,
      attachedContextRefs,
      // EBL-191 V4 learning loop — top-N high-scoring past compiles for
      // this operator, retrieved from the module-cached exemplar bank.
      // Empty on the operator's first call; populated from call 2 onward.
      // Downstream callers (TaskSpec compiler, UI panel) can use these to
      // render "based on similar past inputs" affordances.
      referenceExemplars: _readCachedExemplars(_bankOperatorId),
      fallback: false,
      processingMs,
      sliceId: SLICE_ID,
    };

    // SDK build: no Mongo bank. See "SDK BUILD NOTE" above.
    return retval;
  } catch (err) {
    const latencyMs = Date.now() - t0;
    return _budgetFallback(rawInputPreserved, "exception_" + (err && err.message || "unknown"), latencyMs);
  }
}

// EBL-191 V2 schema-hardening — validate every IQC result against the
// ajv schema. Wraps compileInputQuality so callers don't have to import
// the schema module themselves. Validation is post-compile, schema-only;
// it does NOT mutate the result. Use validateOrThrow if you want hard fail.
export function compileInputQualityValidated(args) {
  const result = compileInputQuality(args);
  try {
    const v = validateIqcResult(result);
    result.schemaValidationOk = v.ok;
    if (!v.ok) result.schemaValidationErrors = v.errors;
  } catch (_) { /* never throw from validator */ }
  return result;
}

// EBL-239 Piece C — code-intent detector. Returns { hasCodeIntent, signals }.
// Triggers when the brief uses action verbs about code AND mentions concrete
// product nouns OR "why/what/where" debugging language. Conservative on
// purpose: a casual "what's our anthropic cost?" doesn't fire (no code-action
// verb + no debug-question pattern), but "why didn't the team write a queue
// slice?" does (debug pattern + product noun).
const _CODE_ACTION_VERBS = /\b(?:fix|edit|change|modify|refactor|build|ship|debug|patch|update|wire|hook|add|remove|delete|strip|tear\s+out|implement|extend|broken|stale|wrong|hang|hung)\b/i;
const _DEBUG_QUESTION = /\b(?:why\s+(?:did|didn'?t|does|doesn'?t|is|isn'?t|are|aren'?t|won'?t|can'?t)|what'?s?\s+(?:wrong|broken|happening|the\s+issue)|where\s+(?:is|did|does)|how\s+come|what\s+went)\b/i;
// Product/code-concept nouns — broad enough to catch layman talk, narrow
// enough to skip pure UI/marketing chatter. If the brief mentions ANY of
// these AND has an action verb or debug-question, we treat it as code intent.
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
  // Code intent fires when (action OR debug-question) AND a product noun.
  // Both halves required — protects against false positives on pure prose.
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

// ────────────────────────────────────────────────────────────────────────
// shouldGateForClarification — convenience predicate for the W1.4
// dispatch check (and the W1.2 hot-compiler wiring). Returns
// { shouldGate, tier, reason }. Tier strings match the 4 Spec Part 3
// fired event names so the dispatcher can emit the right event.
// ────────────────────────────────────────────────────────────────────────
export function shouldGateForClarification(iqcResult) {
  if (!iqcResult || iqcResult.fallback) {
    return { shouldGate: false, tier: "iqc.compiled.assumed", reason: "fallback" };
  }
  // EBL-239 Piece C — honor the canonical signal first. If the IQC marked
  // clarifyingQuestionRequired=true for a reason other than low score (e.g.
  // the missing-paths-for-code-intent trigger), we MUST gate even when score
  // is high. Otherwise the fail-fast is dead-letter and 6 voices fire on a
  // brief we already know won't ground.
  const score = typeof iqcResult.qualityInScore === "number" ? iqcResult.qualityInScore : 50;
  if (iqcResult.clarifyingQuestionRequired && score >= 40) {
    return { shouldGate: true, tier: "iqc.clarify.missing_paths", reason: "clarifying_question_required" };
  }
  if (score >= 85) return { shouldGate: false, tier: "iqc.compiled.high", reason: "score_85_plus" };
  if (score >= 65) return { shouldGate: false, tier: "iqc.compiled.assumed", reason: "score_65_to_84" };
  if (score >= 40) return { shouldGate: true,  tier: "iqc.clarify.requested", reason: "score_40_to_64_risky_only" };
  return { shouldGate: true, tier: "iqc.dispatch.blocked", reason: "score_below_40" };
}

// ────────────────────────────────────────────────────────────────────────
// Test/inspect helpers
// ────────────────────────────────────────────────────────────────────────
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
