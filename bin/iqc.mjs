#!/usr/bin/env node
import { compileInputQuality, VERSION } from "../src/index.mjs";

const C = {
  reset: "\x1b[0m", dim: "\x1b[2m", bold: "\x1b[1m",
  gold: "\x1b[38;5;179m", green: "\x1b[38;5;114m", red: "\x1b[38;5;203m",
  cyan: "\x1b[38;5;80m", gray: "\x1b[38;5;245m",
};
const tty = process.stdout.isTTY;
const c = (code, s) => (tty ? code + s + C.reset : s);

const args = process.argv.slice(2);
const jsonMode = args.includes("--json");
const prompt = args.filter((a) => a !== "--json").join(" ").trim();

if (!prompt || args.includes("--help") || args.includes("-h")) {
  process.stdout.write(`
${c(C.gold + C.bold, "input-quality-compiler")} ${c(C.dim, "v" + VERSION)}
${c(C.gray, "Score and gate a prompt before you pay an LLM to read it.")}

${c(C.bold, "Usage")}
  npx @trelmir-os/input-quality-compiler "<your prompt>"
  iqc "<your prompt>" [--json]

${c(C.bold, "Try it")}
  iqc "change the color of the button maybe? or not"
  iqc "Add a dark-mode toggle to src/Header.tsx, persist to localStorage"
`);
  process.exit(prompt ? 0 : 1);
}

const r = compileInputQuality({ rawInput: prompt });

if (jsonMode) {
  process.stdout.write(JSON.stringify(r, null, 2) + "\n");
  process.exit(0);
}

const gated = r.clarifyingQuestionRequired;
const badge = gated
  ? c(C.red + C.bold, "✗ GATED")
  : c(C.green + C.bold, "✓ PASSED");
const meta = c(C.gray, `quality ${r.qualityInScore}/100 · ${r.outputType} · ${r.processingMs}ms`);

process.stdout.write(`\n  ${badge}  ${meta}\n`);
process.stdout.write(`  ${c(C.dim, "objective")} ${r.userObjective || c(C.gray, "—")}\n`);
if (r.nonGoals?.length) {
  process.stdout.write(`  ${c(C.dim, "non-goals")} ${c(C.cyan, r.nonGoals.join(", "))}\n`);
}
if (gated) {
  process.stdout.write(`\n  ${c(C.gold, "→ " + r.clarifyingQuestion)}\n`);
  process.stdout.write(`  ${c(C.gray, "Sharpen the brief and the gate clears — no LLM call wasted.")}\n\n`);
  process.exit(2);
}
process.stdout.write(`\n  ${c(C.green, "→ safe to dispatch — structured contract attached")}\n\n`);
process.exit(0);
