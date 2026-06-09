// EBL-240 — One-shot recorder for the parity golden. Run BEFORE the refactor to
// capture the pre-refactor IQC output for each fixture, then run AGAIN after
// the refactor and diff to confirm byte-for-byte equality.
//
// Usage:
//   node packages/input-quality-compiler/__tests__/_record-parity-golden.mjs <runtime|sdk>
//
// "runtime" reads apps/workspace-runtime/input-quality-compiler.mjs (the
// production source-of-truth pre-refactor). "sdk" reads the SDK package.
// Output is written to parity-golden.json next to this file.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FIXTURES } from "./parity-fixtures.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = process.argv[2] || "runtime";
const targetPath = src === "runtime"
  ? path.resolve(__dirname, "../../../apps/workspace-runtime/input-quality-compiler.mjs")
  : path.resolve(__dirname, "../src/index.mjs");

const mod = await import(targetPath);
const { compileInputQuality } = mod;

const stable = (obj) => {
  // Strip non-deterministic fields (processingMs, timestamp when caller didn't
  // pass one) so byte-comparison is robust. We compare structure + values, not
  // wall clock.
  const c = JSON.parse(JSON.stringify(obj, (key, value) => {
    if (key === "processingMs") return 0;
    if (key === "timestamp" && typeof value === "number" && value > 1_000_000_000_000) {
      // strip auto-stamped timestamps
      return 0;
    }
    return value;
  }));
  return c;
};

const out = {};
for (const fx of FIXTURES) {
  const r = compileInputQuality(fx.input);
  out[fx.name] = stable(r);
}

const goldenPath = path.resolve(__dirname, "parity-golden.json");
fs.writeFileSync(goldenPath, JSON.stringify(out, null, 2) + "\n");
console.log(`Wrote ${Object.keys(out).length} fixtures to ${goldenPath}`);
