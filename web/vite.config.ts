import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// Two build targets from one source tree.
//
//   default   a normal static site; the city bundles stay in public/data and
//             are fetched, so a browser only downloads the city being looked at
//   single    everything inlined into one HTML file, for publishing the demo
//             somewhere that serves a page and nothing else
export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: [react(), ...(mode === "single" ? [viteSingleFile()] : [])],
  build: {
    outDir: mode === "single" ? "dist-single" : "dist",
    assetsInlineLimit: mode === "single" ? 100_000_000 : 4096,
    chunkSizeWarningLimit: 8000,
  },
}));
