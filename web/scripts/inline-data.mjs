/**
 * Fold the city bundles into the single-file build.
 *
 * `vite-plugin-singlefile` inlines the script and the stylesheet but leaves
 * fetched data alone, which is exactly right for the static site and useless
 * for a page that has to stand on its own. This writes the bundles into the
 * document as one JSON island; `loadCity` prefers it over the network.
 *
 *   node scripts/inline-data.mjs [city ...]
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const OUT = "dist-single/index.html";
const DATA = "public/data";
const cities = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [...new Set(readdirSync(DATA)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.(geo|terrain)?\.?json$/, "")))];

const payload = {};
for (const city of cities) {
  payload[city] = {
    main: JSON.parse(readFileSync(join(DATA, `${city}.json`), "utf8")),
    geo: JSON.parse(readFileSync(join(DATA, `${city}.geo.json`), "utf8")),
    terrain: JSON.parse(readFileSync(join(DATA, `${city}.terrain.json`), "utf8")),
  };
}

// A JSON script block, not a JS literal: nothing in the data can be parsed as
// code, and the only escape that matters is the one that would close the tag.
const json = JSON.stringify(payload).replace(/<\/script/gi, "<\\/script");
const island =
  `<script type="application/json" id="callejero-data">${json}</script>` +
  `<script>globalThis.__CALLEJERO__=JSON.parse(` +
  `document.getElementById("callejero-data").textContent);</script>`;

let html = readFileSync(OUT, "utf8");
if (!html.includes("<script")) throw new Error("no script tag found in build");
html = html.replace(/<script/, `${island}<script`);
writeFileSync(OUT, html);

const mb = (Buffer.byteLength(html) / 1e6).toFixed(2);
console.log(`inlined ${cities.join(", ")} -> ${OUT} (${mb} MB)`);
