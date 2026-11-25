import { readdir, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const CWD = process.cwd();
const MANIFEST_FILE = ".jeasx.manifest.js";

/** @type {Record<string,string>} */
const routes = {};
/** @type {Record<string,string>} */
const files = {};

// Unlike glob, readdir includes dotfiles (e.g. ".well-known"), so the "dotfiles"
// option of FASTIFY_SEND_OPTIONS decides about them like in development.
// "dist" comes first: if a file exists in both directories, "dist" wins.
// Only regular files are collected; symbolic links are skipped (unlike in development).
for (const directory of ["dist", "public"]) {
  const dirents = await readdir(join(CWD, directory), {
    recursive: true,
    withFileTypes: true,
  }).catch(() => []);
  for (const dirent of dirents) {
    if (!dirent.isFile()) {
      continue;
    }
    const path = relative(CWD, join(dirent.parentPath, dirent.name)).split(sep).join("/");

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
    if (key === `/${MANIFEST_FILE}` || (directory === "public" && key in files)) {
      continue;
    }
    files[key] = path;
  }
}

await writeFile(
  join(CWD, "dist", MANIFEST_FILE),
  `export default ${JSON.stringify({ routes, files })};`,
);
