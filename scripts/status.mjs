#!/usr/bin/env node
/**
 * Local-mode drift status. Same data as /api/iqc-sdk/publish-status but
 * runs without needing the workspace-runtime. Useful for:
 *
 *   - Brian checking from a fresh terminal
 *   - pre-commit hooks
 *   - CI smoke against the pipeline itself
 *
 * Outputs human-readable summary to stdout. Exit codes:
 *   0  in sync
 *   2  drift pending (unpublished commits OR local ahead)
 *   3  npm ahead of local (branch behind main)
 *   4  npm registry unreachable
 */

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_DIR = resolve(__dirname, "..");
const PKG_JSON = resolve(PKG_DIR, "package.json");
const REPO_ROOT = resolve(PKG_DIR, "..", "..");
const PKG_REL = "packages/input-quality-compiler";

const C_GOLD = "\x1b[38;5;179m";
const C_GREEN = "\x1b[38;5;34m";
const C_ROSE = "\x1b[38;5;204m";
const C_AMBER = "\x1b[38;5;214m";
const C_DIM = "\x1b[2m";
const C_RESET = "\x1b[0m";
const NO_COLOR = !!process.env.NO_COLOR || !process.stdout.isTTY;
const c = (color, s) => (NO_COLOR ? s : `${color}${s}${C_RESET}`);

function sh(cmd, args) {
  try { return execFileSync(cmd, args, { cwd: REPO_ROOT, encoding: "utf8" }).trim(); }
  catch { return ""; }
}

function cmpSemver(a, b) {
  const pa = a.split(".").map((n) => parseInt(n, 10));
  const pb = b.split(".").map((n) => parseInt(n, 10));
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

async function main() {
  const pkg = JSON.parse(readFileSync(PKG_JSON, "utf8"));
  const localVersion = pkg.version;

  let npmLatest = null;
  let npmPublishedAt = null;
  let npmFetchErr = null;
  try {
    const r = await fetch(`https://registry.npmjs.org/${pkg.name}`, {
      headers: { Accept: "application/vnd.npm.install-v1+json" },
    });
    if (!r.ok) throw new Error(`http ${r.status}`);
    const body = await r.json();
    npmLatest = body["dist-tags"]?.latest;
    npmPublishedAt = npmLatest ? body.time?.[npmLatest] : null;
  } catch (e) {
    npmFetchErr = String(e?.message || e).slice(0, 80);
  }

  const lastTag = sh("git", ["describe", "--tags", "--abbrev=0", "--match", "iqc-v*"]);
  let commitCount = 0;
  let recent = [];
  if (lastTag) {
    const logOut = sh("git", ["log", `${lastTag}..HEAD`, "--format=%h%x09%s", "--", PKG_REL]);
    if (logOut) {
      const lines = logOut.split("\n").filter(Boolean);
      commitCount = lines.length;
      recent = lines.slice(0, 5);
    }
  } else {
    // No tag yet — count all commits touching the package
    const logOut = sh("git", ["log", "--format=%h%x09%s", "--", PKG_REL]);
    if (logOut) {
      const lines = logOut.split("\n").filter(Boolean);
      commitCount = lines.length;
      recent = lines.slice(0, 5);
    }
  }

  console.log("");
  console.log(`${c(C_GOLD, "▌")} ${c(C_GOLD, pkg.name)}`);
  console.log(`${c(C_GOLD, "▌")} local: v${c(C_GOLD, localVersion)} · last commit: ${c(C_DIM, sh("git", ["log", "-1", "--format=%cr", "--", PKG_REL]) || "?")}`);
  if (npmLatest) {
    const age = npmPublishedAt ? new Date(npmPublishedAt) : null;
    const ageStr = age ? `${Math.floor((Date.now() - age.getTime()) / 60_000)}m ago` : "?";
    console.log(`${c(C_GOLD, "▌")} npm:   v${c(C_GOLD, npmLatest)} · published ${c(C_DIM, ageStr)}`);
  } else {
    console.log(`${c(C_GOLD, "▌")} npm:   ${c(C_ROSE, "UNREACHABLE")} (${npmFetchErr})`);
  }

  let exitCode = 0;
  if (!npmLatest) {
    console.log(`${c(C_GOLD, "▌")} ${c(C_ROSE, "STATUS: cannot determine drift — npm registry unreachable")}`);
    exitCode = 4;
  } else {
    const cmp = cmpSemver(localVersion, npmLatest);
    if (cmp > 0) {
      console.log(`${c(C_GOLD, "▌")} ${c(C_ROSE, "STATUS: LOCAL AHEAD")} · v${localVersion} not yet on npm`);
      console.log(`${c(C_GOLD, "▌")} action: ${c(C_GOLD, "git push origin main")}  (CI will publish)  OR  ${c(C_GOLD, "npm run release")}  (local mode)`);
      exitCode = 2;
    } else if (cmp < 0) {
      console.log(`${c(C_GOLD, "▌")} ${c(C_AMBER, "STATUS: BRANCH BEHIND NPM")} · npm v${npmLatest} is ahead of your local v${localVersion}`);
      console.log(`${c(C_GOLD, "▌")} action: ${c(C_GOLD, "git pull origin main")} to sync`);
      exitCode = 3;
    } else if (commitCount > 0) {
      console.log(`${c(C_GOLD, "▌")} ${c(C_ROSE, "STATUS: UNPUBLISHED COMMITS")} · ${commitCount} commit${commitCount === 1 ? "" : "s"} touch the package since ${lastTag || "history start"}`);
      console.log(`${c(C_GOLD, "▌")} action: ${c(C_GOLD, "git push origin main")}  (CI will bump+publish)`);
      console.log(`${c(C_GOLD, "▌")} recent:`);
      for (const r of recent) {
        const [sha, ...rest] = r.split("\t");
        console.log(`${c(C_GOLD, "▌")}   ${c(C_DIM, sha)} ${rest.join("\t")}`);
      }
      exitCode = 2;
    } else {
      console.log(`${c(C_GOLD, "▌")} ${c(C_GREEN, "STATUS: IN SYNC")} ${c(C_GREEN, "●")}`);
      exitCode = 0;
    }
  }
  console.log("");
  process.exit(exitCode);
}

main().catch((e) => {
  console.error(`[status] error: ${e.message}`);
  process.exit(1);
});
