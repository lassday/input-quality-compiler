#!/usr/bin/env node
/**
 * Post-publish smoke. Validates the JUST-published version really works for
 * downstream consumers by doing what they will do: fresh install in a clean
 * tmpdir, import, invoke compileInputQuality on a known-good brief, assert
 * the v1 schema invariants still hold.
 *
 * Exits non-zero when ANY of these fail:
 *   - npm install fails (registry propagation, integrity mismatch, etc.)
 *   - import throws
 *   - compileInputQuality throws or returns wrong shape
 *   - qualityInScore on the canonical brief falls outside expected band
 *
 * The CI publish workflow gates on this — if this fails, the version gets
 * auto-deprecated and an issue is filed (rollback-on-smoke-failure job).
 *
 * Usage: node scripts/post-publish-smoke.mjs <version>
 *   (defaults to "latest" if no version arg given — useful for local dev)
 */

import { execSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PKG = "@trelmir-os/input-quality-compiler";
const VERSION = process.argv[2] || "latest";
const REF = VERSION === "latest" ? PKG : `${PKG}@${VERSION}`;

const REQUIRED_FIELDS = [
  "rawInputPreserved",
  "cleanedText",
  "userObjective",
  "qualityInScore",
  "qualityDimensions",
  "clarifyingQuestionRequired",
  "outputType",
  "urgency",
  "processingMs",
];

// Canonical brief — exercises typo normalization, intent extraction,
// outputType inference, and quality scoring all in one pass.
const CANONICAL_BRIEF =
  "fix the consensus-loop in EBL-188 W2 for Klariven, don't water down the spec, so we ship today";

function bail(code, msg) {
  console.error(`[smoke] FAIL: ${msg}`);
  process.exit(code);
}

const dir = mkdtempSync(join(tmpdir(), "iqc-smoke-"));
console.log(`[smoke] tmpdir=${dir}`);

try {
  // 1. fresh init + install
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "iqc-smoke", type: "module", private: true }, null, 2));
  console.log(`[smoke] installing ${REF} …`);
  try {
    execSync(`npm install --no-save --silent ${REF}`, { cwd: dir, stdio: "inherit" });
  } catch (e) {
    bail(10, `npm install failed: ${e.message}`);
  }

  // 2. smoke script that imports and runs the compiler
  const runScript = `
    import { compileInputQuality, shouldGateForClarification } from "${PKG}";
    const result = compileInputQuality({
      rawInput: ${JSON.stringify(CANONICAL_BRIEF)},
      operatorId: "smoke@trelmir.dev",
      sessionId: "post-publish-smoke",
    });
    if (typeof result !== "object" || result === null) {
      console.error("compile returned non-object");
      process.exit(20);
    }
    const required = ${JSON.stringify(REQUIRED_FIELDS)};
    for (const f of required) {
      if (!(f in result)) {
        console.error("missing required field: " + f);
        process.exit(21);
      }
    }
    if (result.rawInputPreserved !== ${JSON.stringify(CANONICAL_BRIEF)}) {
      console.error("rawInputPreserved invariant violated");
      process.exit(22);
    }
    if (typeof result.qualityInScore !== "number" || result.qualityInScore < 0 || result.qualityInScore > 100) {
      console.error("qualityInScore out of [0,100]: " + result.qualityInScore);
      process.exit(23);
    }
    if (result.qualityInScore < 40) {
      console.error("canonical brief scored too low (regression?): " + result.qualityInScore);
      process.exit(24);
    }
    if (typeof shouldGateForClarification !== "function") {
      console.error("shouldGateForClarification not exported");
      process.exit(25);
    }
    if (!result.cleanedText || result.cleanedText.length < 10) {
      console.error("cleanedText empty or too short");
      process.exit(26);
    }
    console.log("SMOKE_OK version=" + (process.env.IQC_VERSION || "${VERSION}") + " score=" + result.qualityInScore + " outputType=" + result.outputType + " ms=" + result.processingMs);
  `;
  writeFileSync(join(dir, "run.mjs"), runScript);

  // 3. execute in the tmpdir so resolution sees the installed package
  const res = spawnSync(process.execPath, ["run.mjs"], { cwd: dir, stdio: "inherit", env: { ...process.env, IQC_VERSION: VERSION } });
  if (res.status !== 0) bail(res.status || 30, `smoke run exited ${res.status}`);

  console.log(`[smoke] PASS — ${REF} clean`);
} finally {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}
