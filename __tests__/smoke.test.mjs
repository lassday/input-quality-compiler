/**
 * SDK smoke test — exercises the public API surface to confirm the
 * extraction kept all spec-required behavior intact:
 *
 *   1. raw input preservation invariant
 *   2. main compile returns the schema-required fields
 *   3. all 11 spec-closeout extractors produce signal on a Brian-style brief
 *   4. dictionary loading works from the bundled default path
 *   5. typo normalization fires (clude → Claude)
 *   6. performance budget met (< 50ms on tiny inputs)
 *   7. empty input + budget fallback paths return schema-stable shape
 *   8. shouldGateForClarification + extractFileRefsFromBrief exported correctly
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compileInputQuality,
  compileInputQualityValidated,
  shouldGateForClarification,
  extractFileRefsFromBrief,
  reloadDictionary,
  getDictionaryStats,
} from "../src/index.mjs";

test("1. raw input preservation invariant", () => {
  const raw = "fix it!!!  with TyPoS and !!!! emotional WORDING";
  const r = compileInputQuality({ rawInput: raw });
  assert.equal(r.rawInputPreserved, raw, "raw input must be preserved byte-for-byte");
});

test("2. main compile returns spec-required top-level fields", () => {
  const r = compileInputQuality({ rawInput: "build a Klariven campaign pack" });
  const required = [
    "rawInputPreserved", "cleanedText", "normalizedIntent",
    "userObjective", "requiredOutcome",
    "entities", "productRefs", "providerRefs", "modelRefs", "repoRefs",
    "workflowRefs", "fileRefs",
    "doNotLose", "nonGoals", "explicitRequirements", "implicitRequirements",
    "acceptanceCriteria", "missingInformation", "requestedActions",
    "emotionalSignal", "outputType", "urgency",
    "ambiguityScore", "confidenceScore", "qualityInScore", "qualityDimensions",
    "clarifyingQuestionRequired", "clarifyingQuestion",
    "recommendedNextCompilerStep",
    "sourcePaneId", "sourceType", "sessionId", "timestamp", "attachedContextRefs",
    "processingMs", "sliceId",
  ];
  for (const f of required) {
    assert.ok(f in r, `result is missing required field: ${f}`);
  }
});

test("3. spec-closeout extractors fire on a typical operator brief", () => {
  const r = compileInputQuality({
    rawInput: "fix the auth bug in TICKET-142, don't change the session schema, so that we can ship today when the migration completes cleanly",
  });
  assert.ok(r.userObjective, "userObjective should fire");
  assert.ok(r.requiredOutcome, "requiredOutcome should fire");
  assert.ok(Array.isArray(r.acceptanceCriteria) && r.acceptanceCriteria.length > 0, "acceptanceCriteria should fire");
  assert.ok(Array.isArray(r.nonGoals) && r.nonGoals.length > 0, "nonGoals should fire");
  assert.ok(r.emotionalSignal !== null, "emotionalSignal should fire");
  assert.equal(r.outputType !== null && typeof r.outputType === "string", true, "outputType should fire");
  assert.equal(r.urgency !== null && typeof r.urgency === "string", true, "urgency should fire");
  assert.ok(Array.isArray(r.productRefs), "productRefs is an array (empty OK by default — depends on dictionary)");
  assert.ok(Array.isArray(r.implicitRequirements), "implicitRequirements is an array");
});

test("4. bundled default dictionary loads", () => {
  // Trigger a compile first to lazy-load the dictionary cache
  compileInputQuality({ rawInput: "warm-up call to load dictionary" });
  const stats = getDictionaryStats();
  assert.ok(stats.entryCount > 0, "dictionary should have entries");
  assert.ok(stats.aliasCount > 0, "dictionary should have aliases");
});

test("5. typo normalization fires (clude → Claude)", () => {
  const r = compileInputQuality({ rawInput: "ask clude what to do about EBL-100" });
  assert.ok(r.entities.includes("Claude"), `expected 'Claude' in entities, got ${JSON.stringify(r.entities)}`);
});

test("6. performance budget — sub-50ms on Brian-style brief", () => {
  const r = compileInputQuality({
    rawInput: "fix the consensus-loop in EBL-188 W2 for Klariven, when the pack lanes synthesize cleanly we're done, so we ship today, don't water down anything",
  });
  assert.ok(r.processingMs < 50, `processingMs should be < 50ms, got ${r.processingMs}`);
  assert.ok(!r.fallback, "should not have hit budget fallback");
});

test("7a. empty input returns schema-stable shape with ok:false", () => {
  const r = compileInputQuality({ rawInput: "" });
  assert.equal(r.ok, false);
  assert.equal(r.rawInputPreserved, "");
  assert.ok("qualityInScore" in r);
});

test("7b. validated wrapper post-compile-validates the result", () => {
  // compileInputQualityValidated should run without throwing
  const r = compileInputQualityValidated({ rawInput: "build something" });
  assert.equal(r.ok, true);
});

test("8a. shouldGateForClarification is exported and callable", () => {
  const r = compileInputQuality({ rawInput: "fix it" });
  const gate = shouldGateForClarification(r);
  assert.ok(gate && typeof gate === "object", "should return decision object");
  assert.equal(typeof gate.shouldGate, "boolean", "decision must have boolean shouldGate field");
});

test("8b. extractFileRefsFromBrief works standalone", () => {
  const refs = extractFileRefsFromBrief("look at apps/workspace-runtime/consensus-loop.mjs:1234 for the bug");
  assert.ok(Array.isArray(refs));
  assert.ok(refs.length > 0, "should extract at least one ref");
  assert.ok(refs[0].includes("consensus-loop"), "should resolve to consensus-loop file");
});
