<h1 align="center">Stop paying your LLM to read garbage prompts.</h1>

<p align="center">
  <strong>A 1-millisecond gate that scores, structures, and blocks vague prompts <em>before</em> they ever hit OpenAI, Claude, or Gemini — and before they ever hit your bill.</strong>
</p>

<p align="center">
  <code>@trelmir-os/input-quality-compiler</code> · deterministic · zero dependencies · sub-millisecond · MIT
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@trelmir-os/input-quality-compiler"><img src="https://img.shields.io/npm/v/@trelmir-os/input-quality-compiler.svg?style=flat-square&color=D6A95B&labelColor=0B0C10" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/@trelmir-os/input-quality-compiler"><img src="https://img.shields.io/npm/dm/@trelmir-os/input-quality-compiler.svg?style=flat-square&color=D6A95B&labelColor=0B0C10" alt="npm downloads" /></a>
  <a href="https://bundlephobia.com/package/@trelmir-os/input-quality-compiler"><img src="https://img.shields.io/bundlephobia/minzip/@trelmir-os/input-quality-compiler.svg?style=flat-square&color=D6A95B&labelColor=0B0C10" alt="bundle size" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/npm/l/@trelmir-os/input-quality-compiler.svg?style=flat-square&color=D6A95B&labelColor=0B0C10" alt="license MIT" /></a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/lassday/input-quality-compiler/main/assets/demo.svg" alt="input-quality-compiler in a terminal: a vague prompt is blocked before any LLM call, then a real brief is compiled into a structured contract in milliseconds" width="820" />
</p>

## ⚡ Try it right now — no install, no signup, no API key

```bash
npx @trelmir-os/input-quality-compiler "change the color of the button maybe? or not"
```

It gates that vague prompt in a few milliseconds — before you'd have paid a single token. Feed it a real brief and it hands back a structured, dispatch-ready contract instead:

```bash
npx @trelmir-os/input-quality-compiler "Add pagination to the users list, 25 per page, keep the existing response shape"
```

Here's the same gate in two lines, dropped in front of any LLM call:

```js
import { compileInputQuality } from "@trelmir-os/input-quality-compiler";

const result = compileInputQuality({ rawInput: userPrompt });

if (result.clarifyingQuestionRequired) {
  // The brief is too vague — gate before the LLM call.
  return askUser(result.clarifyingQuestion);
}
// safe to dispatch — operator's intent is structured, scoped, and acceptance-bounded
await callOpenAI({ prompt: result.cleanedText, contract: result });
```

That `clarifyingQuestionRequired` flag is the cost guard. Vague brief → no LLM call. **Every dollar you don't burn on an underspecified prompt is the value of installing this package.** The compiler runs in under a millisecond, takes no network calls, has no dependencies, and ships under MIT.

---

## Architecture: how this package fits into your stack

The compiler is the deterministic core. **It exposes three injection seams** so you can wire your own backends — or skip the work and rent ours.

```
┌─────────────────────────────────────────────────────────────────┐
│   YOUR APP                                                      │
│                                                                 │
│   const r = compileInputQuality(args, capabilities);            │
│                       │                                         │
│                       ▼                                         │
│   ┌─────────────────────────────────────────────────────────┐  │
│   │  THE COMPILER — free, MIT, this package                 │  │
│   │  ✓ normalize typos · resolve aliases · score quality    │  │
│   │  ✓ 46 structured fields out                              │  │
│   │  ✓ sub-millisecond p95 · zero deps                      │  │
│   └────────┬──────────────────────┬─────────────────┬───────┘  │
│            │                      │                  │          │
│            ▼                      ▼                  ▼          │
│   ┌─────────────────┐  ┌───────────────────┐  ┌──────────────┐ │
│   │ validate seam   │  │ exemplars.read    │  │ afterCompile │ │
│   │                 │  │ seam              │  │ seam         │ │
│   │ AJV / Zod /     │  │ Past high-quality │  │ Write the    │ │
│   │ your schema     │  │ briefs surface    │  │ result to    │ │
│   │ guard           │  │ as templates      │  │ your bank    │ │
│   └─────────────────┘  └───────────────────┘  └──────────────┘ │
│            │                      │                  │          │
│            ▼                      ▼                  ▼          │
│       NOOP (free)            NOOP (free)        NOOP (free)    │
│       BYO Mongo/Zod          BYO Mongo/PG       BYO your bank  │
│       Hosted (paid)          Hosted (paid)      Hosted (paid)  │
└─────────────────────────────────────────────────────────────────┘
```

- **Free + default** — install the package, the seams are stubbed to no-ops. You still get the 46-field deterministic output.
- **Free + DIY** — wire any backend you want behind the seams. Your Mongo, your Pinecone, your Postgres, your Zod schemas. Same compiler, your control plane.
- **Free, but easier** — rent the **[Trelmir OS Operator Seat]** ($149/mo founding) and get the hosted backends + dashboards + UI. Same compiler underneath, no DIY work.

**No feature is gated in the OSS package.** The seams are MIT and forever-free. The hosted implementations behind them are what you pay for.

---

## What the compiler returns

`compileInputQuality(args)` reads raw input (typos, shorthand, emotional wording, dictation artifacts) and returns a 46-field structured result your agent stack can reason against without burning a clarification cycle:

- `cleanedText` — typos resolved, jargon expanded, ready to dispatch
- `userObjective`, `nonGoals`, `acceptanceCriteria` — what to do / NOT do / when to stop
- `workflowRefs`, `productRefs`, `fileRefs`, `repoRefs`, `providerRefs` — five reference axes auto-extracted
- `emotionalSignal`, `urgency` — operator-tone vs. machine-task separated
- `outputType` — `patch | research | audit | answer | plan | …` for downstream routing
- `qualityInScore` (0–100) + `qualityDimensions` (9-axis scorecard) — quantified before dispatch
- `referenceExemplars` — your past high-quality briefs (when you wire the exemplars seam)
- `clarifyingQuestionRequired` + `clarifyingQuestion` — the cost-guard gate
- `missingInformation`, `assumptionsMade`, `recommendedNextCompilerStep` — what to do if it's not yet fireable

This is the open-source SDK extraction of the Input Quality Compiler that powers Trelmir OS's multi-agent consensus loop. The deterministic core ships free, MIT, forever. The hosted **Trelmir OS Operator Seat** ($149/mo founding) adds the backend implementations + dashboards + UI on top of these seams. See [trelmir.dev/iqc](https://trelmir.dev/iqc) for the paid tier.

---

## Why does this exist?

Multi-agent systems are only as good as their inputs. When operators type briefs in real prose — `"fyi the clude voice keeps fucking up after commas in EBL-188 W2"` — the downstream stack faces:

- **Typos / phonetic drift** (`clude` → `Claude`)
- **Shorthand and project terms** (`EBL-188 W2`, `fyi`, project-specific jargon)
- **Emotional/urgency signals** that change priority (`!!`, profanity, "right now")
- **Implicit non-goals** (`don't change X`, `don't water down Y`)
- **Acceptance criteria buried in prose** (`so that X works`, `until Y is green`)

The Input Quality Compiler normalizes all of that into a structured contract BEFORE your agents see it. Agents stop wasting cycles on clarification because the operator's intent is already extracted and explicit.

> **In Trelmir OS, this is the difference between a verdict that pattern-matches the operator's words to real files in the repo, versus a verdict that returns "please clarify."**

---

## Install

```bash
npm install @trelmir-os/input-quality-compiler
```

Requires Node.js 22+.

---

## Quickstart

```js
import { compileInputQuality } from "@trelmir-os/input-quality-compiler";

const result = compileInputQuality({
  rawInput: "fix the consensus-loop in EBL-188 W2 for Klariven, don't water down the spec, so we ship today",
  operatorId: "brian@trelmir.com",
  sessionId: "session-2026-06-08-123",
});

console.log(result.qualityInScore);    // 73
console.log(result.userObjective);     // "fix the consensus-loop in EBL-188 W2 for Klariven"
console.log(result.workflowRefs);      // ["EBL-188 W2", "W2", "consensus_loop"]
console.log(result.productRefs);       // ["Klariven"]
console.log(result.nonGoals);          // ["water down the spec"]
console.log(result.emotionalSignal);   // { tone: "urgent", intensity: 0.4, ... }
console.log(result.outputType);        // "patch"
console.log(result.urgency);           // "high"
console.log(result.processingMs);      // ~3
```

---

## Bring Your Own Backend (the three seams)

The second argument to `compileInputQuality` is a `capabilities` object that lets you inject your own backends for **validate** (post-compile schema enforcement), **exemplars.read** (past high-quality briefs to surface as templates), and **exemplars.afterCompile** (fire-and-forget hook to bank the result).

### Full example — wire your own everything

```js
import { compileInputQuality, NOOP_CAPABILITIES } from "@trelmir-os/input-quality-compiler";
import { MongoClient } from "mongodb";
import Ajv from "ajv";

const mongo = new MongoClient(process.env.MONGO_URL);
const ajv = new Ajv();
const validate = ajv.compile(yourIqcResultSchema);

const capabilities = {
  // Optional: post-compile schema guard.
  // Called once with the result. Return { ok, errors }.
  validate: (result) => ({ ok: validate(result), errors: validate.errors || [] }),

  exemplars: {
    // Called inline. Return an array of your top-N past high-quality briefs
    // for this operator. The compiler attaches them to result.referenceExemplars.
    read: (operatorId) => mongo.db("iqc").collection("bank")
      .find({ operatorId, qualityInScore: { $gte: 80 } })
      .sort({ qualityInScore: -1 })
      .limit(5)
      .toArray(),

    // Called fire-and-forget after compile (queueMicrotask).
    // Use this to bank the result for future retrieval.
    // Errors are swallowed by design — never blocks the caller.
    afterCompile: (result, operatorId) => mongo.db("iqc").collection("bank")
      .insertOne({ ...result, operatorId, bankedAt: Date.now() }),
  },
};

const result = compileInputQuality({ rawInput, operatorId: "brian@trelmir.com" }, capabilities);
//          ^^^^^^^^^^^^^^^^^^^^^                              ^^^^^^^^^^^^
//          all 46 fields                                       optional 2nd arg

console.log(result.referenceExemplars); // [{ iqcResultId, qualityInScore, ... }] from YOUR Mongo
```

### Partial example — wire only what you need

```js
// Just want exemplars retrieval? Skip validate. Skip afterCompile. They no-op.
const capabilities = {
  exemplars: {
    read: (op) => myCache.get(op) || [],
  },
};

compileInputQuality({ rawInput }, capabilities);
```

### Skip the seams entirely — default is NOOP

```js
// No capabilities? You get the deterministic 46-field output with empty referenceExemplars.
// Most consumers start here, then graduate to seams when they need exemplar retrieval.
compileInputQuality({ rawInput });
```

The default `NOOP_CAPABILITIES` is exported if you want to inspect or wrap it:

```js
import { NOOP_CAPABILITIES } from "@trelmir-os/input-quality-compiler";

console.log(typeof NOOP_CAPABILITIES.validate);          // "function" (returns { ok: true })
console.log(typeof NOOP_CAPABILITIES.exemplars.read);     // "function" (returns [])
console.log(typeof NOOP_CAPABILITIES.exemplars.afterCompile); // "function" (no-op)
```

**Why seams instead of bundled implementations?** Bundling Mongo + AJV + a UI would 100x the dependency footprint and lock you to one stack. Seams keep the package at zero deps + sub-ms p95, while letting you grow into whatever backend you already use.

---

## The upgrade ladder

```
LEVEL 1 — npm install                                       [ free ]
└── Default Brian-term dictionary
    └── NOOP capabilities (empty exemplars, no-op validate)
        └── 46-field deterministic output
            └── ~50KB bundle, zero deps, ~1ms p95
            └── Use case: drop-in cost-guard before any LLM call

LEVEL 2 — wire your own backends                            [ free, DIY ]
└── reloadDictionary("./your-team-dictionary.json")
    └── capabilities.validate = ajv.compile(your-schema)
        └── capabilities.exemplars.read = (op) => yourMongo.find(...)
            └── capabilities.exemplars.afterCompile = (r, op) => yourMongo.insert(r)
                └── Use case: full-stack control, your data stays in your infra

LEVEL 3 — Trelmir OS Operator Seat                          [ $149/mo founding ]
└── Hosted Mongo exemplar bank (zero setup)
    └── Quality Bank Dashboard (per-dimension trends + drill-down)
        └── Exemplar Assist UI (auto-suggest from your past high-quality briefs)
            └── Regression Detector + nudges (proactive quality alerts)
                └── Full Trelmir OS Command Center (multi-agent consensus + browser sessions)
                └── Use case: skip DIY, ship faster, see prompting compound over time
                └── trelmir.dev/iqc → claim a founding seat

LEVEL 4 — Team Dictionary Management SaaS                   [ $99-499/mo ]
└── Shared team dictionary (hosted control plane)
    └── Multi-seat operator dashboards
        └── SSO + audit log + role-based permissions
            └── Drift detection across team members
                └── Public read-only CI endpoint
                └── Use case: 10-25 dev orgs, AI agent startups, consistent prompt quality across team
```

**The compiler is the same at every level** — what you pay for is the implementations behind the seams, not a different engine.

---

## API

### `compileInputQuality(args, capabilities?)` → `IqcResult`

**Input:**

```ts
{
  rawInput: string;                    // required — the operator's raw text
  operatorId?: string;                 // optional — who's typing (keys exemplars retrieval)
  sessionId?: string;                  // optional — what work session
  sourcePaneId?: string;               // optional — which UI pane
  sourceType?: "typed" | "voice_transcript" | "manual_paste" | "imported_chat";
  timestamp?: number;                  // optional — defaults to Date.now()
  attachedContextRefs?: string[];      // optional — file/URL refs the operator attached
}
```

**Second argument** (optional) — see [Bring Your Own Backend](#bring-your-own-backend-the-three-seams).

```ts
{
  validate?: (result) => { ok: boolean, errors: any[] };
  exemplars?: {
    read?: (operatorId: string) => Array;  // sync or async (awaited)
    afterCompile?: (result, operatorId: string) => any;  // fire-and-forget
  };
}
```

**Output:** A 46-field result. High-signal subset:

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
| `productRefs` | string[] | Trelmir / Klariven / Shipwarden / etc. |
| `providerRefs` | string[] | Claude / OpenAI / Gemini / xAI / ElevenLabs / etc. |
| `modelRefs` | string[] | `claude-sonnet-4-6`, `gpt-5`, etc. — explicit model IDs only |
| `repoRefs` | string[] | Repository names extracted from input |
| `workflowRefs` | string[] | EBL-XXX ticket IDs, slice names, named workflows |
| `fileRefs` | string[] | File paths the operator referenced |
| `implicitRequirements` | string[] | Inferred from product context |
| `emotionalSignal` | object \| null | `{tone, intensity, profanity, frustration, urgent, excitement}` |
| `outputType` | enum | `answer / plan / build / patch / audit / commit_request / research / clarify` |
| `urgency` | enum | `high / normal / low` |
| `ambiguityScore` | number | 0–1, higher = more ambiguous |
| `confidenceScore` | number | 1 − ambiguityScore |
| `qualityInScore` | int | 0–100, weighted blend of 9 dimensions |
| `qualityDimensions` | object | The 9 sub-scores (intentClarity, outcomeClarity, ...) |
| `referenceExemplars` | object[] | Past high-quality briefs returned by your `capabilities.exemplars.read` |
| `clarifyingQuestionRequired` | bool | true when input is too rough for risky action |
| `clarifyingQuestion` | string \| null | Specific question the IQC built |
| `recommendedNextCompilerStep` | enum | `context_compiler_full / _with_assumptions / clarify_before_dispatch / block_dispatch_clarify` |
| `processingMs` | number | Total compile time |

### `compileInputQualityValidated(args, capabilities?)` → `IqcResult`

Same as above, but post-compile validates the result against the v1 schema (uses your injected `validate` capability if provided, else the bundled schema guard). Useful in production paths where shape changes would be a contract break.

### `shouldGateForClarification(iqcResult)` → `boolean`

Returns `true` when the result indicates the agent should ask one specific clarifying question instead of proceeding with risky action.

### `extractFileRefsFromBrief(text)` → `string[]`

Standalone path/intent scanner. Same logic the IQC uses internally for `fileRefs`. Capped at 8 refs by default.

### `reloadDictionary(altPath)` → `boolean`

Replace the default Brian-term dictionary at runtime with your own. Pass an absolute file path to a JSON dictionary file matching the bundled schema. Returns `true` on success.

The default dictionary is exposed as a static file at `@trelmir-os/input-quality-compiler/dictionary` — use it as a starting point for customization.

### `getDictionaryStats()` → `{entries, aliases, contextScopes, dictionaryPath}`

Introspect the currently-loaded dictionary.

### `NOOP_CAPABILITIES` (constant)

Frozen object representing the default no-op capabilities. Useful for inspecting the seam shape or wrapping default behavior:

```js
import { NOOP_CAPABILITIES } from "@trelmir-os/input-quality-compiler";

const wrapped = {
  ...NOOP_CAPABILITIES,
  exemplars: {
    ...NOOP_CAPABILITIES.exemplars,
    read: (op) => myCache.get(op),  // override just read, keep afterCompile no-op
  },
};
```

### Utility exports (for power users)

The compiler exposes its internal primitives in case you want to build adjacent tooling:

```js
import {
  levenshteinBounded,  // (a, b, maxDistance) => number — bounded edit distance
  tokenize,            // (text) => string[] — same tokenizer the compiler uses
  detectContext,       // (text, contextScopes) => Set<string> — context tag detector
} from "@trelmir-os/input-quality-compiler";
```

### Exported constants

```js
import {
  VERSION,             // current package version, updated automatically on each release
  BUDGET_MS,           // 500 — hard cap on compile time before fallback
  FUZZY_MAX_DISTANCE,  // 2 — max Levenshtein distance for fuzzy alias match
  FUZZY_MIN_LEN,       // 4 — min token length to attempt fuzzy match
  MAX_FILE_REFS,       // 8 — default cap on fileRefs extraction
  SLICE_ID,            // doctrine slice ID (Trelmir OS internal)
} from "@trelmir-os/input-quality-compiler";
```

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
| p95 warm (typical briefs) | 1–5ms |
| Budget hard cap | 500ms (sync, no LLM calls) |
| External dependencies | 0 |
| Bundle size | ~50KB minified |

If a compile exceeds the budget, the function returns a fallback result with `qualityInWarnings: ["IQC_BUDGET_FALLBACK:..."]` and `recommendedNextCompilerStep: "raw_passthrough"`. Risky actions get blocked; conversational answers still pass through.

No external network calls. No telemetry. Runs anywhere Node.js 22+ runs.

**With capabilities seams**, your backend latency is additive — `exemplars.read` is awaited inline, `afterCompile` is fire-and-forget. If your backend is sub-50ms, the compile stays well under the 500ms budget.

---

## Customizing the dictionary

The default dictionary maps common operator misspellings, shorthand, and product-specific jargon to canonical forms. To add your own terms:

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

`contextScope` is an optional gate — only fires when context tokens co-occur (e.g., `'3d'` would only resolve `tripa` → `Tripo3D` when 3D-context words are present). Set to `null` for unconditional matching.

The bundled dictionary is at `@trelmir-os/input-quality-compiler/dictionary` (JSON file). The hosted **[Trelmir OS Team tier]** (Path 4, $99-499/mo) adds shared team dictionaries with drift detection across members.

---

## Roadmap

- [x] **v0.1** — Deterministic core, 46-field schema, MIT license, zero dependencies
- [x] **v0.2** — `capabilities` injection seam (validate / exemplars.read / exemplars.afterCompile)
- [ ] **v0.3** — TypeScript native (currently runtime JS with auto-generated `.d.ts`)
- [ ] **v0.4** — Optional LLM-backed normalization pass (gated, off by default, budgeted)
- [ ] **v0.5** — Streaming compile mode for very long briefs

---

## License

MIT © Brian Jones / Trelmir Inc.

See [LICENSE](./LICENSE).

---

## What is Trelmir OS?

Trelmir OS is a multi-agent operating system for founders. The Input Quality Compiler is one of its core compilers — `Raw Input → IQC → Task Spec → Context → Role Packet → Consensus`. The other compilers ship inside Trelmir OS proper. This package is the IQC extracted for general use.

The hosted Operator Seat at [trelmir.dev/iqc](https://trelmir.dev/iqc) gives you the full Command Center: the Quality Bank Dashboard fed by the exemplars seam, the Exemplar Assist UI that auto-suggests templates, the Regression Detector that nudges you when your prompting drifts, and a multi-agent consensus engine you control.

If you find this package useful, the rest of the stack is worth a look.
