import * as esbuild from "esbuild";
import { readdir, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
import env from "./env.js";

env();

const CWD = process.cwd();
const CONFIG = (await import(pathToFileURL(join(CWD, "jeasx.config.js")).href)).default;
const NODE_ENV_IS_DEVELOPMENT = process.env.NODE_ENV === "development";

/** @type {esbuild.BuildOptions} */
const SERVER_OPTIONS = {
  entryPoints: ["src/**/[*].*"],
  minify: !NODE_ENV_IS_DEVELOPMENT,
  logLevel: "info",
  bundle: true,
  outdir: "dist",
  publicPath: "/",
  assetNames: "[dir]/[name]-[hash]",
  format: "esm",
  platform: "neutral",
  packages: "external",
  // Options may be async, so build-only plugins can be imported lazily (see jeasx.config.js).
  ...(await CONFIG.ESBUILD_SERVER_OPTIONS?.()),
};

/** @type {esbuild.BuildOptions} */
const BROWSER_OPTIONS = {
  entryPoints: ["src/**/index.*"],
  minify: !NODE_ENV_IS_DEVELOPMENT,
  logLevel: "info",
  bundle: true,
  outdir: "dist",
  publicPath: "/",
  assetNames: "[dir]/[name]-[hash]",
  format: "esm",
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

// Export path mappings for routes and files
if (!NODE_ENV_IS_DEVELOPMENT) {
  /** @type {Record<string,string>} */
  const routes = {};
  /** @type {Record<string,string>} */
  const files = {};

  // Unlike glob, readdir includes dotfiles (e.g. ".well-known"), so the "dotfiles"
  // option of FASTIFY_SEND_OPTIONS decides about them like in development.
  // "dist" comes first: if a file exists in both directories, "dist" wins.
  // Only regular files are collected; symbolic links are skipped (unlike in development).
  const entries = [];
  for (const directory of ["dist", "public"]) {
    const dirents = await readdir(join(CWD, directory), {
      recursive: true,
      withFileTypes: true,
    }).catch(() => []);
    for (const dirent of dirents) {
      const path = join(dirent.parentPath, dirent.name);
      if (dirent.isFile()) {
        entries.push(relative(CWD, path));
      }
    }
  }

  for (const entry of entries) {
    const path = entry.split(sep).join("/");

    // Handle server routes.
    if (/^dist\/.*\[[^/]+\]\.js$/.test(path)) {
      routes[path.slice("dist".length, -".js".length)] = path;
      continue;
    }

    // Skip all other outputs of server routes, e.g. sourcemaps or CSS of components.
    if (/^dist\/.*\[[^/]+\]\.[^/]+$/.test(path)) {
      continue;
    }

    // Treat all other entries as static files.
    const key = path.slice(path.indexOf("/"));
    if (!(path.startsWith("public/") && key in files)) {
      files[key] = path;
    }
  }

  await writeFile(
    join(CWD, "dist", "[--metadata--].js"),
    `export default ${JSON.stringify({ routes, files })};`,
  );
}
