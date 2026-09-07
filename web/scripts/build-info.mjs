/**
 * Stamp the build with the commit it came from.
 *
 * Without this there is no way to tell from outside which commit a host is
 * serving: two commits that touch no JavaScript produce byte-identical
 * fingerprinted assets, so "is my fix deployed?" is unanswerable exactly when
 * it matters — when a config-only change appears to have had no effect.
 *
 * Netlify exposes COMMIT_REF; locally we ask git. Runs from `prebuild`, so it
 * cannot be forgotten.
 */
import { writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const commit =
  process.env.COMMIT_REF ??
  (() => {
    try {
      return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
    } catch {
      return "unknown";
    }
  })();

const info = {
  commit,
  short: commit.slice(0, 7),
  built: new Date().toISOString(),
  context: process.env.CONTEXT ?? "local",
};
writeFileSync("public/build-info.json", `${JSON.stringify(info, null, 2)}\n`);
console.log(`build-info: ${info.short} (${info.context})`);
