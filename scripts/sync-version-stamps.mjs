#!/usr/bin/env node
/**
 * Version stamp sync. After `bump-version.mjs --apply` writes the new
 * version to package.json, this script propagates that same version into
 * every other file in the monorepo that surfaces it to a human:
 *
 *   1. packages/input-quality-compiler/src/index.mjs   (VERSION export)
 *   2. apps/trelmir-dev/index.html                     (public landing page)
 *   3. <future surfaces>                               (add to STAMPS below)
 *
 * Idempotent: if the file already shows the target version, it's a no-op.
 *
 * Exit codes:
 *   0  every target stamped
 *   1  one or more targets failed
 *   2  source-of-truth (package.json) unreadable
 *
 * Called by:
 *   - GitHub Actions iqc-publish.yml (between bump-version + commit)
 *   - scripts/release.mjs (local-mode publisher)
 *   - manually: `npm run sync-stamps` if you ever edit one of these files
 *     out-of-band and want to restore monorepo coherence.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_DIR = resolve(__dirname, "..");
const REPO_ROOT = resolve(PKG_DIR, "..", "..");
const PKG_JSON = resolve(PKG_DIR, "package.json");

let pkg;
try {
  pkg = JSON.parse(readFileSync(PKG_JSON, "utf8"));
} catch (e) {
  console.error(`[sync-stamps] cannot read source-of-truth ${PKG_JSON}: ${e.message}`);
  process.exit(2);
}
const TARGET = pkg.version;
if (!TARGET) {
  console.error("[sync-stamps] package.json has no version field");
  process.exit(2);
}

/**
 * Each stamp = { path, regex, replacement, label }
 *   - regex MUST match exactly one line; the script bails if 0 or >1 match
 *   - $V in replacement is substituted with the new version
 */
const STAMPS = [
  {
    label: "SDK VERSION constant",
    path: resolve(PKG_DIR, "src", "index.mjs"),
    regex: /^export const VERSION = "[^"]+";$/m,
    replacement: `export const VERSION = "$V";`,
  },
  {
    label: "public landing page footer chip",
    path: resolve(REPO_ROOT, "apps", "trelmir-dev", "index.html"),
    regex: /OPEN SOURCE · v\d+\.\d+\.\d+/,
    replacement: `OPEN SOURCE · v$V`,
  },
];

let failed = 0;
let stamped = 0;
let skipped = 0;

for (const s of STAMPS) {
  const rel = relative(REPO_ROOT, s.path);
  if (!existsSync(s.path)) {
    console.error(`[sync-stamps] ✗ ${s.label}: file missing (${rel}) — skipping`);
    failed += 1;
    continue;
  }
  let content;
  try {
    content = readFileSync(s.path, "utf8");
  } catch (e) {
    console.error(`[sync-stamps] ✗ ${s.label}: read failed (${e.message})`);
    failed += 1;
    continue;
  }
  const matches = content.match(new RegExp(s.regex.source, s.regex.flags.includes("g") ? s.regex.flags : s.regex.flags + "g"));
  if (!matches || matches.length === 0) {
    console.error(`[sync-stamps] ✗ ${s.label}: regex matched nothing in ${rel}`);
    failed += 1;
    continue;
  }
  if (matches.length > 1) {
    console.error(`[sync-stamps] ✗ ${s.label}: regex matched ${matches.length} times in ${rel} (expected 1)`);
    failed += 1;
    continue;
  }
  const replaced = s.replacement.replace(/\$V/g, TARGET);
  if (matches[0] === replaced) {
    console.log(`[sync-stamps] · ${s.label}: already at v${TARGET} (no-op)`);
    skipped += 1;
    continue;
  }
  const next = content.replace(s.regex, replaced);
  writeFileSync(s.path, next, "utf8");
  console.log(`[sync-stamps] ✓ ${s.label}: ${rel} → v${TARGET}`);
  stamped += 1;
}

console.log(`[sync-stamps] target=v${TARGET}  stamped=${stamped}  skipped=${skipped}  failed=${failed}`);
process.exit(failed > 0 ? 1 : 0);
