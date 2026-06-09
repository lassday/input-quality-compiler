// EBL-240 parity test — proves the new capability-injected core produces
// byte-for-byte identical output to the pre-refactor runtime IQC for a wide
// fixture set (typos, context-scoped entries, phrase Brian-flags, all 11
// spec extractors, EBL-239 code-intent gate, budget fallback, model-ref
// version requirements, source-pane passthrough).
//
// parity-golden.json was captured from apps/workspace-runtime/input-quality-
// compiler.mjs BEFORE the single-source collapse. This test compiles each
// fixture through the new package core and asserts the result equals golden.
//
// If a future change deliberately alters compiler output, re-record by:
//   node packages/input-quality-compiler/__tests__/_record-parity-golden.mjs sdk

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileInputQuality } from "../src/index.mjs";
import { FIXTURES } from "./parity-fixtures.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN = JSON.parse(fs.readFileSync(path.join(__dirname, "parity-golden.json"), "utf8"));

function stableify(obj) {
  return JSON.parse(JSON.stringify(obj, (key, value) => {
    if (key === "processingMs") return 0;
    if (key === "timestamp" && typeof value === "number" && value > 1_000_000_000_000) return 0;
    return value;
  }));
}

for (const fx of FIXTURES) {
  test(`parity — ${fx.name}`, () => {
    const result = stableify(compileInputQuality(fx.input));
    const golden = GOLDEN[fx.name];
    assert.ok(golden, `golden missing for fixture ${fx.name} — re-run _record-parity-golden.mjs`);
    assert.deepEqual(result, golden, `fixture ${fx.name} drifted from pre-refactor golden`);
  });
}
