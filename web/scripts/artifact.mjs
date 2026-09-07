/**
 * Reshape the single-file build for publishing as an Artifact.
 *
 * The host wraps whatever it is given in its own document skeleton, so the page
 * has to arrive as body content plus its <title> and <style>, with no doctype,
 * <html>, <head> or <body> of its own. Everything the build produced is kept,
 * only unwrapped and reordered.
 *
 *   node scripts/artifact.mjs [outfile]
 */
import { readFileSync, writeFileSync } from "node:fs";

const src = readFileSync("dist-single/index.html", "utf8");
const out = process.argv[2] ?? "dist-single/artifact.html";

const pick = (re) => {
  const m = src.match(re);
  if (!m) throw new Error(`could not find ${re}`);
  return m[0];
};

const title = pick(/<title>[\s\S]*?<\/title>/i);
// Google Fonts is the only stylesheet host the Artifact CSP admits, so the
// face links have to survive the unwrapping or the page falls back silently.
const links = [...src.matchAll(/<link[^>]*fonts\.(googleapis|gstatic)\.com[^>]*>/gi)]
  .map((m) => m[0]);
const style = pick(/<style[\s\S]*?<\/style>/i);
const scripts = [...src.matchAll(/<script[\s\S]*?<\/script>/gi)].map((m) => m[0]);
if (!scripts.length) throw new Error("no scripts in build");

// The host's own reset gives the body a margin and a default font; this page is
// a full-viewport application, so it takes the viewport back explicitly.
const reset = `<style>
html, body { height: 100%; margin: 0; overflow: hidden; }
#root { height: 100%; }
</style>`;

const html = [title, ...links, style, reset, `<div id="root"></div>`, ...scripts]
  .join("\n");
writeFileSync(out, html);
console.log(`${out} (${(Buffer.byteLength(html) / 1e6).toFixed(2)} MB, ` +
  `${scripts.length} scripts)`);
