#!/usr/bin/env node
/**
 * Conventional-commit-driven semver bump for @trelmir-os/input-quality-compiler.
 *
 * Walks `git log` from the last `iqc-vX.Y.Z` tag (or root if none) up to HEAD,
 * filters to commits that actually touched this package, then infers semver:
 *
 *   - any "BREAKING CHANGE:" footer OR "<type>!:" prefix  →  major
 *   - any "feat:"                                         →  minor
 *   - any "fix:", "perf:", "refactor:"                    →  patch
 *   - chore/docs/test/ci alone                            →  patch (still ship)
 *
 * Usage:
 *   node scripts/bump-version.mjs            # print inferred bump + new version (no write)
 *   node scripts/bump-version.mjs --apply    # write package.json + .last-bump.json
 *   node scripts/bump-version.mjs --bump=patch --apply   # force a specific bump
 *
 * Writes `.last-bump.json` with the kind + commit-of-record so CI can pull it.
 * Never throws on no-commits — exits 0 with a "no-op" hint so the publish job
 * can decide to skip cleanly.
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_DIR = resolve(__dirname, "..");
const PKG_JSON = resolve(PKG_DIR, "package.json");
const LAST_BUMP = resolve(PKG_DIR, ".last-bump.json");
const REPO_ROOT = resolve(PKG_DIR, "..", "..");
const PKG_REL = "packages/input-quality-compiler";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const FORCE_BUMP = (() => {
  const i = args.findIndex((a) => a === "--bump" || a.startsWith("--bump="));
  if (i < 0) return "auto";
  if (args[i].includes("=")) return args[i].split("=")[1];
  return args[i + 1] || "auto";
})();

function sh(cmd) {
  return execSync(cmd, { cwd: REPO_ROOT, encoding: "utf8" }).trim();
}

function lastTag() {
  try {
    return sh(`git describe --tags --abbrev=0 --match "iqc-v*"`);
  } catch (_) {
    return null;
  }
}

function commitsSince(tagOrNull) {
  const range = tagOrNull ? `${tagOrNull}..HEAD` : "HEAD";
  try {
    const raw = sh(`git log ${range} --format=%H%x09%B%x1e -- ${PKG_REL}`);
    if (!raw) return [];
    return raw.split("\x1e").map((s) => s.trim()).filter(Boolean).map((entry) => {
      const [sha, ...rest] = entry.split("\t");
      return { sha, message: rest.join("\t").trim() };
    });
  } catch (_) {
    return [];
  }
}

function classify(messages) {
  let kind = null;
  const TYPE_RE = /^(feat|fix|chore|docs|refactor|test|perf|ci|build|style)(\([a-z0-9_-]+\))?(!?):/;
  for (const m of messages) {
    const firstLine = m.split("\n")[0];
    const match = firstLine.match(TYPE_RE);
    const hasBreakingFooter = /^BREAKING CHANGE:/m.test(m);
    if ((match && match[3] === "!") || hasBreakingFooter) return "major";
    if (match && match[1] === "feat") kind = kind === "major" ? "major" : "minor";
    else if (match && (match[1] === "fix" || match[1] === "perf" || match[1] === "refactor")) {
      kind = kind || "patch";
    } else if (match) {
      kind = kind || "patch";
    }
  }
  return kind;
}

function bumpSemver(current, kind) {
  const [maj, min, patch] = current.split(".").map((n) => parseInt(n, 10));
  if (kind === "major") return `${maj + 1}.0.0`;
  if (kind === "minor") return `${maj}.${min + 1}.0`;
  if (kind === "patch") return `${maj}.${min}.${patch + 1}`;
  throw new Error(`unknown bump kind: ${kind}`);
}

function main() {
  const pkg = JSON.parse(readFileSync(PKG_JSON, "utf8"));
  const tag = lastTag();
  const commits = commitsSince(tag);

  let kind;
  if (FORCE_BUMP && FORCE_BUMP !== "auto") {
    if (!["patch", "minor", "major"].includes(FORCE_BUMP)) {
      console.error(`[bump-version] invalid --bump value: ${FORCE_BUMP}`);
      process.exit(2);
    }
    kind = FORCE_BUMP;
  } else {
    const messages = commits.map((c) => c.message);
    kind = classify(messages);
    if (!kind) {
      if (commits.length === 0 && tag) {
        console.error(`[bump-version] no commits touching ${PKG_REL} since ${tag} — nothing to publish`);
        process.exit(3);
      }
      kind = "patch";
    }
  }

  const newVersion = bumpSemver(pkg.version, kind);
  const record = {
    kind,
    from: pkg.version,
    to: newVersion,
    sinceTag: tag,
    commits: commits.map((c) => ({ sha: c.sha.slice(0, 12), subject: c.message.split("\n")[0] })),
    inferredAt: new Date().toISOString(),
  };

  if (APPLY) {
    pkg.version = newVersion;
    writeFileSync(PKG_JSON, JSON.stringify(pkg, null, 2) + "\n", "utf8");
    writeFileSync(LAST_BUMP, JSON.stringify(record, null, 2) + "\n", "utf8");
    process.stdout.write(newVersion);
  } else {
    console.log(JSON.stringify(record, null, 2));
  }
}

main();
