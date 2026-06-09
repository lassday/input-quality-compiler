// EBL-240 — Parity fixtures shared by the golden recorder and the parity test.
// Each fixture is a representative input the parity test will compile and
// byte-compare against the pre-refactor runtime golden.
//
// The fixtures cover: typos (clude/claw), context-scoped entries (tripa in 3D),
// phrase Brian-flags (anti-dilution), the 11 spec extractors, EBL-239 code-intent
// gate / scanner, budget fallback path, empty input, file-path extraction, and
// model-ref version requirements (the gemini cco-1780934028392 verdict).

export const FIXTURES = [
  { name: "empty-input", input: { rawInput: "" } },
  { name: "raw-input-preservation-typos", input: { rawInput: "fix it!!!  with TyPoS and !!!! emotional WORDING" } },
  { name: "typo-claude", input: { rawInput: "ask clude what to do about EBL-100" } },
  { name: "claw-fuzzy", input: { rawInput: "what does claw think about this" } },
  { name: "chat-got-phrase", input: { rawInput: "let me ask chat got what it thinks" } },
  { name: "tripa-3d-context", input: { rawInput: "build a 3d mesh with tripa for the campaign" } },
  { name: "tripa-no-3d-context", input: { rawInput: "tripa says hi" } },
  { name: "klariven-product", input: { rawInput: "ship a klariven outcome" } },
  { name: "brian-multi-product", input: { rawInput: "Klariven and Shipwarden need a Trelmir OS gate" } },
  { name: "anti-dilution-phrase", input: { rawInput: "don't water down the spec, preserve everything" } },
  { name: "spec-closeout-extractors", input: {
    rawInput: "fix the consensus-loop wall in EBL-188 W2 for Klariven, don't water down the spec, so that we can ship today when the pack lanes synthesize cleanly",
  } },
  { name: "code-intent-with-path", input: {
    rawInput: "look at apps/workspace-runtime/consensus-loop.mjs:1234 for the bug",
  } },
  { name: "code-intent-alias", input: { rawInput: "fix the provenance gate" } },
  { name: "code-intent-missing-paths", input: { rawInput: "fix the thing that broke yesterday" } },
  { name: "strategic-no-code-intent", input: {
    rawInput: "the Input Quality Compiler is our top-of-funnel asset and the consensus loop is downstream",
  } },
  { name: "model-ref-claude-sonnet", input: { rawInput: "use claude-sonnet-4-6 here" } },
  { name: "model-ref-bare-gemini-rejected", input: { rawInput: "should we try gemini?" } },
  { name: "model-ref-gemini-version", input: { rawInput: "use gemini-2.5-pro for that one" } },
  { name: "model-ref-bare-grok-rejected", input: { rawInput: "ask grok about it" } },
  { name: "model-ref-grok-version", input: { rawInput: "ask grok-4 about it" } },
  { name: "eleven-multilingual", input: { rawInput: "use eleven_multilingual_v2_5 for dubbing" } },
  { name: "voyage-version", input: { rawInput: "embed with voyage-3-large" } },
  { name: "heygen-avatar", input: { rawInput: "render with heygen-avatar-iv tomorrow" } },
  { name: "wan-version", input: { rawInput: "wan 2.5 looks good" } },
  { name: "outcome-clarity", input: { rawInput: "build the panel so that the operator can see costs" } },
  { name: "urgency-911", input: { rawInput: "911 the team fire is broken right now" } },
  { name: "non-goals", input: { rawInput: "fix the queue chip, don't touch the cli mirror, skip the slot 4 refactor" } },
  { name: "acceptance-criteria-bullets", input: {
    rawInput: "build the FinOps panel\n- when prices change the chart updates\n- so that the operator sees live cost\n- must show last 24h",
  } },
  { name: "frustrated-tone", input: { rawInput: "why is this damn thing broken AGAIN, every time I touch it" } },
  { name: "repo-refs", input: { rawInput: "investigate trelmir-os-repo vs trelmir-klariven-authority drift" } },
  { name: "workflow-refs", input: { rawInput: "voice_clone flow on the founder voice path needs EBL-201 W3.2 work" } },
  { name: "source-pane-passthrough", input: {
    rawInput: "do the thing",
    sourcePaneId: "pane-7",
    sourceType: "voice_typed",
    sessionId: "sess-42",
    timestamp: 1717891234567,
    attachedContextRefs: ["ref-a", "ref-b"],
  } },
  { name: "high-quality-score", input: {
    rawInput: "build the write-evidence ledger entry so that the operator can see when a slice was queued, when it was approved, and when it ran — must include EBL-201 W3.2 metadata",
  } },
];
