import * as esbuild from "esbuild";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import env from "./env.js";

env();

const CONFIG = (await import(`file://${join(process.cwd(), "jeasx.config.js")}`)).default;
const BUILD_TIME = `"${process.env.BUILD_TIME || Date.now().toString(36)}"`;

const BROWSER_PUBLIC_ENV = Object.keys(process.env)
  .filter((key) => key.startsWith("BROWSER_PUBLIC_"))
  .reduce(
    (env, key) => {
      env[`process.env.${key}`] = `"${process.env[key]}"`;
      return env;
    },
    Object({ "process.env.BROWSER_PUBLIC_BUILD_TIME": BUILD_TIME }),
  );

/** @type esbuild.BuildOptions */
const SERVER_OPTIONS = {
  entryPoints: ["src/**/[*].*"],
  define: { "process.env.BUILD_TIME": BUILD_TIME },
  minify: process.env.NODE_ENV !== "development",
  logLevel: "info",
  color: true,
  bundle: true,
  metafile: true,
  outdir: "dist",
  publicPath: "/",
  assetNames: "[dir]/[name]-[hash]",
  platform: "neutral",
  format: "esm",
  packages: "external",
  ...CONFIG.ESBUILD_SERVER_OPTIONS?.(),
};

/** @type esbuild.BuildOptions */
const BROWSER_OPTIONS = {
  entryPoints: ["src/**/index.*"],
  define: BROWSER_PUBLIC_ENV,
  minify: process.env.NODE_ENV !== "development",
  logLevel: "info",
  color: true,
  bundle: true,
  outdir: "dist",
  publicPath: "/",
  assetNames: "[dir]/[name]-[hash]",
  platform: "browser",
  format: "esm",
  ...CONFIG.ESBUILD_BROWSER_OPTIONS?.(),
};

[SERVER_OPTIONS, BROWSER_OPTIONS].forEach(async (options) => {
  if (process.env.NODE_ENV === "development") {
    (await esbuild.context(options)).watch();
  } else {
    const result = await esbuild.build(options);
    if (options === SERVER_OPTIONS) {
      // Create metafile with existing server routes
      if (result.metafile?.outputs) {
        const routes = Object.keys(result.metafile.outputs)
          .filter((path) => /\[.+\]\.js$/.test(path))
          .map((path) => path.slice("dist".length));
        await writeFile(
          join(process.cwd(), "dist", `[--metadata--].js`),
          `export default ${JSON.stringify({ routes })};`,
        );
      }
    }
  }
});
