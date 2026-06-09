#!/usr/bin/env node
/**
 * Postinstall CTA banner for @trelmir-os/input-quality-compiler.
 *
 * Path 3 verdict (2026-06-08) — surface the cost-guard hook + Operator
 * Seat upsell at install time. Stays terse (5 lines), respects no-color
 * terminals, never throws (postinstall failures break installs — bad UX).
 */

try {
  // Skip in CI / non-TTY / when explicitly silenced. CI noise from postinstall
  // banners is a known npm anti-pattern; we go quiet there by default.
  const isCI = !!process.env.CI;
  const isSilent = process.env.TRELMIR_POSTINSTALL_SILENT === "1";
  const isTTY = !!(process.stdout && process.stdout.isTTY);
  if (isCI || isSilent || !isTTY) process.exit(0);

  const supportsColor = !process.env.NO_COLOR && process.platform !== "win32";
  const c = supportsColor
    ? { gold: "\x1b[38;5;179m", dim: "\x1b[2m", reset: "\x1b[0m", bold: "\x1b[1m" }
    : { gold: "", dim: "", reset: "", bold: "" };

  const lines = [
    "",
    `${c.bold}${c.gold}▌ @trelmir-os/input-quality-compiler${c.reset} ${c.dim}installed${c.reset}`,
    `${c.gold}▌${c.reset} Drop in front of any OpenAI / Claude / Gemini call as a cost-guard.`,
    `${c.gold}▌${c.reset} ${c.dim}clarifyingQuestionRequired blocks vague prompts BEFORE you pay for them.${c.reset}`,
    `${c.gold}▌${c.reset} Docs · Paid Operator Seat ($149/mo founding): ${c.bold}https://trelmir.dev/iqc${c.reset}`,
    `${c.dim}▌ (silence: TRELMIR_POSTINSTALL_SILENT=1)${c.reset}`,
    "",
  ];
  process.stdout.write(lines.join("\n"));
} catch (_) {
  // Never break the install over a banner.
  process.exit(0);
}
