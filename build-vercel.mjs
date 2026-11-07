/**
 * Bundles the Express API into api/_app.js.
 *
 * The committed api/handler.js requires it, and a rewrite in vercel.json sends
 * every /api/* request there. The split exists because Vercel checks the
 * functions config against the repository before running this build, so the
 * entry point must be in git while the bundle is generated.
 *
 * Deliberately separate from artifacts/api-server/build.mjs: that build targets
 * a long-lived Node process on Replit and wires pino through a worker thread,
 * which a serverless function cannot use. In production the logger writes
 * straight to stdout, which Vercel captures.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, rm } from "node:fs/promises";
import { build as esbuild } from "esbuild";

globalThis.require = createRequire(import.meta.url);

const root = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(root, "api");

// Only the generated bundle is removed. api/handler.js is committed and must
// survive, because Vercel checks it exists before the build even starts.
await mkdir(outDir, { recursive: true });
await rm(path.join(outDir, "_app.js"), { force: true });

await esbuild({
  entryPoints: {
    _app: path.resolve(root, "artifacts/api-server/src/vercel.ts"),
  },
  outdir: outDir,
  platform: "node",
  target: "node22",
  format: "cjs",
  bundle: true,
  minify: true,
  sourcemap: false,
  logLevel: "info",
  // Native bindings that cannot be bundled. pg falls back to pure JS without
  // pg-native, which is what we want on a serverless runtime anyway.
  external: ["pg-native", "*.node", "cardinal", "colorette"],
  define: {
    "process.env.NODE_ENV": '"production"',
  },
});

console.log("Built api/_app.js, served through the committed api/handler.js");
