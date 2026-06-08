# @trelmir-os/input-quality-compiler

> **Turn rough operator input into clean, structured, executable intent — before any agent sees it.**

Deterministic. Zero external dependencies. Sub-millisecond p95. Pure JavaScript.

`compileInputQuality(args)` reads a raw input string (typos, shorthand, emotional wording, dictation artifacts) and returns a 30-field structured result your agent stack can reason against without burning a clarification cycle.

Same input → same output, every time.

---

## Why does this exist?

Multi-agent systems are only as good as their inputs. When operators type briefs in real prose — `"fix the auth bug in TICKET-142, don't change the session schema, so we can ship Friday"` — the downstream stack faces:

- **Typos / phonetic drift** (e.g. `clude` → `Claude`)
- **Shorthand and team-specific jargon** (ticket IDs, internal codenames, abbreviations)
- **Emotional/urgency signals** that change priority (`!!`, profanity, "right now")
- **Implicit non-goals** (`don't change X`, `don't water down Y`)
- **Acceptance criteria buried in prose** (`so that X works`, `until Y is green`)

The Input Quality Compiler normalizes all of that into a structured contract BEFORE your agents see it. Agents stop wasting cycles on clarification because the operator's intent is already extracted and explicit.

> **The difference between a verdict that pattern-matches the operator's words to real files in the repo, versus a verdict that returns "please clarify."**

---

## Install

```bash
npm install @trelmir-os/input-quality-compiler
```

Requires Node.js 18+.

---

## Quickstart

```js
import { compileInputQuality } from "@trelmir-os/input-quality-compiler";

const result = compileInputQuality({
  rawInput: "fix the auth bug in TICKET-142, don't change the session schema, so we can ship Friday",
  operatorId: "user@example.com",
  sessionId: "session-2026-06-08-123",
});

console.log(result.qualityInScore);    // 73
console.log(result.userObjective);     // "fix the auth bug in TICKET-142"
console.log(result.workflowRefs);      // ["TICKET-142"]
console.log(result.nonGoals);          // ["change the session schema"]
console.log(result.emotionalSignal);   // { tone: "urgent", intensity: 0.4, ... }
console.log(result.outputType);        // "patch"
console.log(result.urgency);           // "high"
console.log(result.processingMs);      // ~3
```

---

## API

### `compileInputQuality(args)` → `IqcResult`

**Input:**

```ts
{
  rawInput: string;                    // required — the operator's raw text
  operatorId?: string;                 // optional — who's typing
  sessionId?: string;                  // optional — what work session
  sourcePaneId?: string;               // optional — which UI pane
  sourceType?: "typed" | "voice_transcript" | "manual_paste" | "imported_chat";
  timestamp?: number;                  // optional — defaults to Date.now()
  attachedContextRefs?: string[];      // optional — file/URL refs the operator attached
}
```

**Output:** A 30+ field result. High-signal subset:

| Field | Type | What it means |
|---|---|---|
| `rawInputPreserved` | string | The operator's input, byte-for-byte (invariant) |
| `cleanedText` | string | Normalized: typos fixed, shorthand expanded |
| `normalizedIntent` | string | One-line human-readable summary |
| `userObjective` | string | "What does the user want," in one phrase |
| `requiredOutcome` | string | Concrete deliverable extracted from "I want X" / "so that X" |
| `acceptanceCriteria` | string[] | Testable conditions from when/until/must/so-that clauses |
| `doNotLose` | object[] | Phrases marked as load-bearing ("don't take things away") |
| `nonGoals` | string[] | Anti-scope from don't / no / without / skip |
| `entities` | string[] | Canonical entities recognized in input |
| `productRefs` | string[] | Product names recognized in input |
| `providerRefs` | string[] | AI provider names (Claude / OpenAI / Gemini / etc.) |
| `modelRefs` | string[] | Explicit model IDs (e.g. `claude-sonnet-4-6`, `gpt-5`) |
| `repoRefs` | string[] | Repository names extracted from input |
| `workflowRefs` | string[] | Ticket IDs, slice names, named workflows |
| `fileRefs` | string[] | File paths the operator referenced |
| `implicitRequirements` | string[] | Inferred from product context |
| `emotionalSignal` | object \| null | `{tone, intensity, profanity, frustration, urgent, excitement}` |
| `outputType` | enum | `answer / plan / build / patch / audit / commit_request / research / clarify` |
| `urgency` | enum | `high / normal / low` |
| `ambiguityScore` | number | 0–1, higher = more ambiguous |
| `confidenceScore` | number | 1 − ambiguityScore |
| `qualityInScore` | int | 0–100, weighted blend of 9 dimensions |
| `qualityDimensions` | object | The 9 sub-scores (intentClarity, outcomeClarity, ...) |
| `clarifyingQuestionRequired` | bool | true when input is too rough for risky action |
| `clarifyingQuestion` | string \| null | Specific question the IQC built |
| `recommendedNextCompilerStep` | enum | `context_compiler_full / _with_assumptions / clarify_before_dispatch / block_dispatch_clarify` |
| `processingMs` | number | Total compile time |

### `compileInputQualityValidated(args)`

Same as above, but post-compile validates the result against the v1 schema. Useful in production paths where shape changes would be a contract break.

### `shouldGateForClarification(iqcResult)` → `boolean`

Returns `true` when the result indicates the agent should ask one specific clarifying question instead of proceeding with risky action.

### `extractFileRefsFromBrief(text)` → `string[]`

Standalone path/intent scanner. Same logic the IQC uses internally for `fileRefs`. Capped at 8 refs by default.

### `reloadDictionary(altPath)` → `boolean`

Replace the default dictionary at runtime with your own. Pass an absolute file path to a JSON dictionary file matching the bundled schema. Returns `true` on success.

The default dictionary is exposed as a static file at `@trelmir-os/input-quality-compiler/dictionary` — use it as a starting point for customization.

### `getDictionaryStats()` → `{entries, aliases, contextScopes, dictionaryPath}`

Introspect the currently-loaded dictionary.

---

## Quality scoring (the 9 dimensions)

`qualityInScore` (0–100) is a weighted blend of:

| Dimension | Weight | What it scores |
|---|---|---|
| `intentClarity` | 0.15 | Does the input contain an action verb? |
| `outcomeClarity` | 0.12 | Does the input express a target outcome? |
| `entityResolution` | 0.13 | Were named entities resolved? |
| `actionability` | 0.15 | Can a worker proceed without clarification? |
| `acceptanceCriteriaCompleteness` | 0.10 | Are testable conditions present? |
| `riskClarity` | 0.07 | Does the input acknowledge risk/failure modes? |
| `ambiguityLevel` | 0.13 | 1 minus ambiguityScore |
| `missingInformationSeverity` | 0.10 | How much is missing? |
| `companyStandardPreservation` | 0.05 | Does the input flag scope-preservation requirements? |

### Suggested dispatch gates

| Score | Path |
|---|---|
| 85–100 | Compile directly. No warnings. |
| 65–84 | Compile with `assumptionsMade` logged. |
| 40–64 | Ask one specific clarifying question before risky action. |
| < 40 | Do NOT dispatch build/execution. Ask clarification. |

The result's `recommendedNextCompilerStep` field maps qualityInScore to one of those four paths.

---

## Performance

| Metric | Value |
|---|---|
| p95 cold | 0.077ms |
| p95 warm (typical operator briefs) | 1–5ms |
| Budget hard cap | 500ms (sync, no LLM calls) |
| External dependencies | 0 |
| Bundle size | ~50KB minified |

If a compile exceeds the budget, the function returns a fallback result with `qualityInWarnings: ["IQC_BUDGET_FALLBACK:..."]` and `recommendedNextCompilerStep: "raw_passthrough"`. Risky actions get blocked; conversational answers still pass through.

No external network calls. No telemetry. Runs anywhere Node.js 18+ runs.

---

## Customizing the dictionary

The default dictionary maps common operator misspellings, shorthand, and team-specific jargon to canonical forms. To add your own terms:

```js
import { reloadDictionary } from "@trelmir-os/input-quality-compiler";
import path from "node:path";

reloadDictionary(path.resolve("./my-team-dictionary.json"));
```

Dictionary schema:

```json
{
  "_meta": { "version": 1 },
  "entries": [
    {
      "canonical": "AcmeWidget",
      "aliases": ["awidget", "acm widget", "Acme W."],
      "contextScope": null,
      "confidence": 0.95,
      "uncertaintyFlag": false
    }
  ]
}
```

`contextScope` is an optional gate — only fires when context tokens co-occur. Set to `null` for unconditional matching.

The bundled dictionary is at `@trelmir-os/input-quality-compiler/dictionary` (JSON file).

---

## Roadmap

- [x] **v0.1** — Deterministic core, 30+ field schema, MIT license, zero dependencies
- [ ] **v0.2** — Accept `referenceExemplars` as input arg so callers can wire any storage (Mongo / Postgres / S3 / etc.) to feed past high-quality compiles back into future ones
- [ ] **v0.3** — TypeScript native (currently runtime JS with auto-generated `.d.ts`)
- [ ] **v0.4** — Optional LLM-backed normalization pass (gated, off by default, budgeted)

---

## License

MIT © Brian Jones

See [LICENSE](./LICENSE).
