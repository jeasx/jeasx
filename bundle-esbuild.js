import * as esbuild from "esbuild";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import env from "./env.js";

env();

const CWD = process.cwd();
const CONFIG = (await import(pathToFileURL(join(CWD, "jeasx.config.js")).href)).default;
const NODE_ENV_IS_DEVELOPMENT = process.env.NODE_ENV === "development";

/** @type {import("esbuild").BuildOptions}} */
const COMMON_OPTIONS = {
  minify: !NODE_ENV_IS_DEVELOPMENT,
  logLevel: "info",
  bundle: true,
  outdir: "dist",
  publicPath: "/",
  assetNames: "[dir]/[name]-[hash]",
  format: "esm",
};

/** @type {import("esbuild").BuildOptions}} */
const SERVER_OPTIONS = {
  ...COMMON_OPTIONS,
  entryPoints: ["src/**/[*].*"],
  platform: "neutral",
  packages: "external",
  ...(await CONFIG.ESBUILD_SERVER_OPTIONS?.()),
};

/** @type {import("esbuild").BuildOptions}} */
const BROWSER_OPTIONS = {
  ...COMMON_OPTIONS,
  entryPoints: ["src/**/index.*"],
  platform: "browser",
  packages: "bundle",
  ...(await CONFIG.ESBUILD_BROWSER_OPTIONS?.()),
};

for (const options of [SERVER_OPTIONS, BROWSER_OPTIONS]) {
  if (NODE_ENV_IS_DEVELOPMENT) {
    const context = await esbuild.context(options);
    // watch() doesn't wait for the first build, so the server would start with an empty "dist".
    // Build errors are already logged and fixed while watching, so don't stop on them.
    await context.rebuild().catch(() => {});
    await context.watch();
  } else {
    await esbuild.build(options);
  }
}
