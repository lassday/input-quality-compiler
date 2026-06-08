# Changelog

All notable changes to this package will be documented in this file.

## [0.1.0] — 2026-06-08

### Initial public release

- Deterministic Input Quality Compiler core, sub-millisecond p95 on Brian-style briefs
- 30+ field structured result schema
- 11 spec-closeout extractors (userObjective, requiredOutcome, acceptanceCriteria, nonGoals, emotionalSignal, outputType, urgency, repoRefs, workflowRefs, modelRefs, implicitRequirements)
- Bundled default dictionary (206 entries) for typo/jargon normalization
- Override hook via `reloadDictionary(absPath)`
- Quality scoring (9 dimensions, 0–100 blended)
- Clarification-gate decision helper
- Standalone `extractFileRefsFromBrief` export
- Zero runtime dependencies
- Node.js 18+

### Not included (in roadmap)

- v0.2: `referenceExemplars` input arg (bring-your-own storage for learning loop)
- v0.3: TypeScript-native rewrite + auto-generated `.d.ts`
- v0.4: Optional LLM-backed normalization pass (gated, off by default)
