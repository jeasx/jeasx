import * as esbuild from "esbuild";
import { glob, stat, writeFile } from "node:fs/promises";
import { join, sep } from "node:path";
import env from "./env.js";

env();

const CWD = process.cwd();
const CONFIG = (await import(`file://${join(CWD, "jeasx.config.js")}`)).default;
const NODE_ENV_IS_DEVELOPMENT = process.env.NODE_ENV === "development";

/** @type esbuild.BuildOptions */
const SERVER_OPTIONS = {
  entryPoints: ["src/**/[*].*"],
  minify: !NODE_ENV_IS_DEVELOPMENT,
  logLevel: "info",
  color: true,
  bundle: true,
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
  minify: !NODE_ENV_IS_DEVELOPMENT,
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

for (const options of [SERVER_OPTIONS, BROWSER_OPTIONS]) {
  if (NODE_ENV_IS_DEVELOPMENT) {
    (await esbuild.context(options)).watch();
  } else {
    await esbuild.build(options);
  }
}

// Export path mappings for routes and files
if (!NODE_ENV_IS_DEVELOPMENT) {
  /** @type Record<string,string> */
  const routes = {};
  /** @type Record<string,string> */
  const files = {};

  for await (const entry of glob("{dist,public}/**/*")) {
    const path = entry.split(sep).join("/");

    // Handle server routes.
    if (/^dist\/.*\[.+\]\.js$/.test(path)) {
      routes[path.slice("dist".length, -".js".length)] = path;
      continue;
    }

    // Skip sourcemaps for server routes.
    if (/^dist\/.*\[.+\]\.js\.map$/.test(path)) {
      continue;
    }

    // Treat all other entries as static files.
    if ((await stat(join(CWD, path))).isFile()) {
      files[path.slice(path.indexOf("/"))] = path;
    }
  }

  await writeFile(
    join(CWD, "dist", "[--metadata--].js"),
    `export default ${JSON.stringify({ routes, files })};`,
  );
}
