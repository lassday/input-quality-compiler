#!/usr/bin/env node
/**
 * Local-mode release runner. Mirrors what the GitHub Actions workflow does,
 * but runs from the operator's terminal — useful when:
 *
 *   - you want to test the pipeline end-to-end before turning CI on
 *   - the repo isn't on GitHub yet
 *   - emergency manual publish (network down on GH, etc.)
 *
 * Pipeline:
 *   1. `npm test`                          — gate
 *   2. `bump-version.mjs --apply`          — package.json + .last-bump.json
 *   3. `generate-changelog.mjs`            — CHANGELOG.md
 *   4. `npm publish --provenance` (skipped if --dry-run)
 *   5. `git tag iqc-vX.Y.Z`                — only when not --dry-run
 *   6. `post-publish-smoke.mjs <version>`  — only when not --dry-run
 *
 * Flags:
 *   --dry-run            pack but don't publish or tag
 *   --bump=patch|minor|major   force a bump kind (default: auto from commits)
 *   --skip-tests         emergency mode (NOT recommended)
 *
 * Requires:
 *   - NPM_TOKEN env OR `npm login` already done
 *   - clean git working tree (will refuse otherwise)
 */

import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_DIR = resolve(__dirname, "..");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const SKIP_TESTS = args.includes("--skip-tests");
const BUMP = (() => {
  const i = args.findIndex((a) => a.startsWith("--bump"));
  if (i < 0) return "auto";
  if (args[i].includes("=")) return args[i].split("=")[1];
  return args[i + 1] || "auto";
})();

function step(msg) {
  console.log(`\n\x1b[1;38;5;179m▌ ${msg}\x1b[0m`);
}

function sh(cmd, opts = {}) {
  return execSync(cmd, { cwd: PKG_DIR, stdio: "inherit", ...opts });
}

function shOut(cmd) {
  return execSync(cmd, { cwd: PKG_DIR, encoding: "utf8" }).trim();
}

function main() {
  step("0/6 · verify clean working tree");
  const dirty = shOut("git status --porcelain -- . 2>/dev/null || true");
  if (dirty) {
    console.error("\n[release] working tree has uncommitted changes in packages/input-quality-compiler:");
    console.error(dirty);
    console.error("[release] commit or stash before releasing. refusing to publish dirty.");
    process.exit(2);
  }

  if (SKIP_TESTS) {
    console.warn("[release] !! --skip-tests set — emergency mode. proceeding without test gate.");
  } else {
    step("1/6 · npm test");
    sh("npm test");
  }

  step(`2/6 · bump-version (${BUMP})`);
  sh(`node scripts/bump-version.mjs --apply --bump=${BUMP}`);

  step("3/6 · generate-changelog");
  sh("node scripts/generate-changelog.mjs");

  step("3b/6 · sync version stamps (SDK + landing page)");
  sh("node scripts/sync-version-stamps.mjs");

  const newVersion = JSON.parse(execSync("node -e 'process.stdout.write(JSON.stringify(require(\"./package.json\")))'", { cwd: PKG_DIR }).toString()).version;
  console.log(`[release] target version: ${newVersion}`);

  if (DRY_RUN) {
    step("4/6 · npm pack (dry-run)");
    sh("npm pack --dry-run");
    console.log(`\n[release] DRY RUN complete. version ${newVersion} packed but NOT published.`);
    console.log("[release] revert version with: git checkout -- package.json CHANGELOG.md && rm -f .last-bump.json");
    return;
  }

  step("4/6 · npm publish --provenance --access public");
  // --provenance requires CI environment (OIDC). For local runs, drop it.
  const isCi = !!process.env.CI || !!process.env.GITHUB_ACTIONS;
  const provFlag = isCi ? " --provenance" : "";
  if (!isCi) {
    console.warn("[release] not in CI — publishing WITHOUT --provenance (Sigstore attestation requires OIDC).");
  }
  sh(`npm publish --access public${provFlag}`);

  step("5/6 · git tag");
  try {
    sh(`git tag iqc-v${newVersion}`, { cwd: resolve(PKG_DIR, "..", "..") });
    sh(`git push origin iqc-v${newVersion}`, { cwd: resolve(PKG_DIR, "..", "..") });
  } catch (e) {
    console.warn(`[release] tag/push skipped (${e.message}). manual: git tag iqc-v${newVersion} && git push origin iqc-v${newVersion}`);
  }

  step("6/6 · post-publish smoke (waits 30s for npm propagation)");
  console.log("[release] sleeping 30s for npm registry propagation…");
  execSync("sleep 30");
  sh(`node scripts/post-publish-smoke.mjs ${newVersion}`);

  console.log(`\n\x1b[1;38;5;36m▌ RELEASED · @trelmir-os/input-quality-compiler@${newVersion}\x1b[0m`);
  console.log(`▌ npm: https://www.npmjs.com/package/@trelmir-os/input-quality-compiler`);
  console.log(`▌ verify: npm audit signatures (if --provenance)`);
}

try {
  main();
} catch (e) {
  console.error(`[release] FAILED: ${e.message}`);
  process.exit(1);
}
