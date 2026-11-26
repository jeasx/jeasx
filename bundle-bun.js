import { watch } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { styleText } from "node:util";
import env from "./env.js";

env();

const CWD = process.cwd();
const CONFIG = (await import(pathToFileURL(join(CWD, "jeasx.config.js")).href)).default;
const NODE_ENV_IS_DEVELOPMENT = process.env.NODE_ENV === "development";

// Max output files listed in the build summary.
const MAX_LISTED_OUTPUTS = process.stdout.rows ? Math.floor(process.stdout.rows / 2) : Infinity;

/** @type {import("bun").BuildConfig} */
const COMMON_OPTIONS = {
  outdir: "dist",
  publicPath: "/",
  naming: { asset: "[dir]/[name]-[hash].[ext]" },
  format: "esm",
  throw: false,
  // Bun doesn't reliably pick up "jsxImportSource" from tsconfig.json.
  jsx: { importSource: "jsx-async-runtime" },
  minify: !NODE_ENV_IS_DEVELOPMENT,
};

/** @type {import("bun").BuildConfig} */
const SERVER_OPTIONS = {
  ...COMMON_OPTIONS,
  entrypoints: ["src/**/[[]*[]].*"],
  target: "node",
  packages: "external",
  ...(await CONFIG.BUN_SERVER_OPTIONS?.()),
};

/** @type {import("bun").BuildConfig} */
const BROWSER_OPTIONS = {
  ...COMMON_OPTIONS,
  entrypoints: ["src/**/index.*"],
  target: "browser",
  packages: "bundle",
  ...(await CONFIG.BUN_BROWSER_OPTIONS?.()),
};

async function build() {
  for (const options of [SERVER_OPTIONS, BROWSER_OPTIONS]) {
    const start = performance.now();
    // Bun.build doesn't expand globs. Expand them on every build, so new files are picked up while watching.
    const entrypoints = (
      await Promise.all(
        options.entrypoints.map((glob) => Array.fromAsync(new Bun.Glob(glob).scan())),
      )
    ).flat();
    // Like esbuild without "outbase", use the lowest common ancestor of the entry points as root,
    // so both bundlers write the same paths to "dist". Bun's own default differs and may nest
    // the output in "dist/src". A root set in jeasx.config.js takes precedence.
    const result = await Bun.build({
      root: commonAncestor(entrypoints),
      ...options,
      entrypoints,
    });
    result.logs
      .filter((log) => log.message !== "invalid @ rule encountered: '@view-transition'")
      .forEach((log) => console.warn(log));

    if (!NODE_ENV_IS_DEVELOPMENT) {
      if (result.success) {
        const outputs = result.outputs.toSorted((a, b) => b.size - a.size);
        console.info();
        for (const output of outputs.slice(0, MAX_LISTED_OUTPUTS)) {
          console.info(
            `  ${relative(CWD, output.path).padEnd(48)} ${styleText("cyan", `${(output.size / 1024).toFixed(1).padStart(10)}kb`)}`,
          );
        }
        if (outputs.length > MAX_LISTED_OUTPUTS) {
          console.info(`  ... and ${outputs.length - MAX_LISTED_OUTPUTS} more output files`);
        }
        console.info();
      } else {
        process.exit(1);
      }
    }
    const duration = Math.round(performance.now() - start);
    console.info(
      result.success
        ? styleText("green", `⚡ Done in ${duration}ms`)
        : styleText("red", `✘ Failed in ${duration}ms`),
    );
  }
}

/**
 * Returns the lowest common ancestor directory of the given file paths.
 * @param {string[]} paths
 */
function commonAncestor(paths) {
  if (paths.length === 0) {
    return ".";
  }
  let ancestor = dirname(paths[0]).split(sep);
  for (const path of paths.slice(1)) {
    const segments = dirname(path).split(sep);
    let i = 0;
    while (i < ancestor.length && ancestor[i] === segments[i]) {
      i++;
    }
    ancestor = ancestor.slice(0, i);
  }
  return ancestor.join(sep) || ".";
}

await build();

if (NODE_ENV_IS_DEVELOPMENT) {
  // Bun.build has no watch mode, so rebuild on changes. Build errors are logged, so don't stop on them.
  // A single save often fires several events, so debounce them and never run builds concurrently:
  // changes during a build trigger exactly one rebuild afterwards.
  let timer;
  let building = false;
  let pending = false;
  const rebuild = async () => {
    if (building) {
      pending = true;
      return;
    }
    building = true;
    try {
      do {
        pending = false;
        await build().catch(console.error);
      } while (pending);
    } finally {
      building = false;
    }
  };
  watch("src", { recursive: true }, (_event, filename) => {
    console.info(`Changed: ${join("src", filename ?? "")}`);
    clearTimeout(timer);
    timer = setTimeout(rebuild, 50);
  });
}
