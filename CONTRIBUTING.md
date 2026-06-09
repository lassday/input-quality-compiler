# Contributing to `@trelmir-os/input-quality-compiler`

This package ships customer-facing patches via an **automated publish pipeline** — every merge to `main` that touches `src/` ships to npm within ~90 seconds. To make that safe, the project enforces a small set of contributor contracts.

> **TL;DR** — Conventional commits are mandatory. Run `npm test` before committing. Open a PR; CI gates everything. Merge to main publishes automatically.

---

## Conventional commits (mandatory)

Every commit that touches `packages/input-quality-compiler/` must follow [Conventional Commits 1.0](https://www.conventionalcommits.org/en/v1.0.0/):

```
<type>(<scope>)<!>: <description>

[optional body]

[optional footer(s) — including "BREAKING CHANGE: …"]
```

| `<type>` | Triggers | Example |
|---|---|---|
| `feat` | **minor** bump | `feat(iqc): add productRefs scanner` |
| `fix` | **patch** bump | `fix(iqc): kill clyude→Claude typo regression` |
| `perf` | **patch** bump | `perf(iqc): cache compiled regex` |
| `refactor` | **patch** bump | `refactor(iqc): split extractor into modules` |
| `docs` | **patch** bump | `docs(iqc): clarify clarifyingQuestionRequired` |
| `chore` `test` `ci` `build` `style` | **patch** bump | `chore(iqc): bump dev tooling` |
| Any `<type>!:` OR `BREAKING CHANGE:` footer | **major** bump | `feat(iqc)!: drop CommonJS export` |

**Valid `<scope>` values** for this package: `iqc`, `dict`, `core`, `tests`, `docs`, `release`. Scope is optional but recommended.

**Mixed bumps** — if a PR contains multiple commits, the highest bump wins. `feat: …` + `fix: …` = minor.

The `IQC SDK · PR validate` workflow rejects non-conventional commits at PR-time. Bad messages never reach main.

---

## Local dev loop

```bash
cd packages/input-quality-compiler

# 1. install (no deps; this just primes the workspace)
npm install

# 2. run tests (54 tests, sub-second)
npm test

# 3. dry-run a release locally (verifies bump + changelog + pack — does NOT publish)
npm run release:dry

# 4. check drift against npm
npm run status
```

`npm run status` prints local-vs-npm version, last publish age, and any unpublished commits since the last `iqc-vX.Y.Z` tag. Exit codes:
- `0` in sync
- `2` drift pending (unpublished commits)
- `3` branch behind npm
- `4` npm unreachable

Run it before every push if you want to know what the next CI run will do.

---

## What ships and what doesn't

The publish workflow watches these paths:
- `packages/input-quality-compiler/src/**`
- `packages/input-quality-compiler/package.json`
- `packages/input-quality-compiler/README.md`
- `packages/input-quality-compiler/scripts/**`
- `.github/workflows/iqc-publish.yml`

Touching anything else (tests, internal docs, sibling packages) does NOT trigger a publish.

Tarball contents (governed by `package.json#files`):

```
LICENSE
README.md
CHANGELOG.md
package.json
src/index.mjs
src/brian-term-dictionary.json
scripts/postinstall.mjs
```

If you add a new runtime file, add it to `files: []` in `package.json` or it won't ship.

---

## The publish pipeline (what you don't have to think about)

```
git push → validate → bump-and-publish → post-publish-smoke → (rollback if smoke fails)
```

- **validate**: `npm test` + `npm pack --dry-run`
- **bump-and-publish**: infers semver from conventional commits since the last `iqc-vX.Y.Z` tag, writes the new version + CHANGELOG entry, publishes with `--provenance` (Sigstore OIDC), tags the commit, creates a GitHub Release
- **post-publish-smoke**: fresh `npm install` in a tmpdir, imports the just-published version, runs `compileInputQuality` on a canonical brief, asserts the v1 schema invariants hold
- **rollback-on-smoke-failure**: if the smoke fails, the version is auto-`npm deprecate`d and a `p0` GitHub issue is filed. No further action is needed from you besides shipping a fix.

Full runbook: [`docs/launch/iqc-sdk-auto-publish-runbook.md`](../../docs/launch/iqc-sdk-auto-publish-runbook.md).

---

## Don't merge if any of these are true

- [ ] A commit message in your PR is not conventional-commits-compliant
- [ ] `npm test` fails on your branch
- [ ] You added a new file to `src/` but didn't update `package.json#files`
- [ ] You introduced a runtime dependency (this package is `"dependencies": {}` — zero deps is load-bearing)
- [ ] You added a breaking change without `!:` or `BREAKING CHANGE:` footer
- [ ] You changed `rawInputPreserved` invariant behavior without flagging as breaking

---

## Pre-commit hook (recommended)

Install the lightweight pre-commit hook to catch most of the above before push:

```bash
ln -sf ../../packages/input-quality-compiler/scripts/git-hooks/pre-commit .git/hooks/pre-commit
chmod +x packages/input-quality-compiler/scripts/git-hooks/pre-commit
```

The hook runs `npm test` + validates the commit message shape on commits that touch the package. ~1.5s total. Set `SKIP_IQC_PRECOMMIT=1` to bypass (emergency only).

---

## Versioning policy

[SemVer 2.0](https://semver.org/spec/v2.0.0.html) — strictly enforced.

| Change kind | Bump |
|---|---|
| Added new exported function / new field on result | minor |
| Bug fix in existing behavior | patch |
| Tuned scoring weights | patch (unless score difference > 5pts on canonical brief — then minor) |
| Added a new entry to the bundled dictionary | patch |
| Renamed an exported function | **major** |
| Removed a field from the result | **major** |
| Changed `qualityInScore` numeric scale | **major** |
| Changed `rawInputPreserved` semantics | **major** |

When in doubt, ship as minor + flag the field as `EXPERIMENTAL` in the README. Don't ship a silent breaking change.

---

## Reaching out

This is a Brian-personal project. Open an issue at https://github.com/lassday/input-quality-compiler/issues — no SLA, but real humans read it.
