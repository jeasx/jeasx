import * as esbuild from "esbuild";

const BUILD_TIME = `"${Date.now().toString(36)}"`;

const BROWSER_PUBLIC_ENV = Object.keys(process.env)
  .filter((key) => key.startsWith("BROWSER_PUBLIC_"))
  .reduce(
    (env, key) => {
      env[`process.env.${key}`] = `"${process.env[key]}"`;
      return env;
    },
    { "process.env.BROWSER_PUBLIC_BUILD_TIME": BUILD_TIME }
  );

const ESBUILD_BROWSER_TARGET = process.env.ESBUILD_BROWSER_TARGET
  ? process.env.ESBUILD_BROWSER_TARGET.replace(/\s/g, "").split(",")
  : ["chrome126", "edge126", "firefox128", "safari17"];

const args = process.argv.slice(2);

const builds = [];
for (const arg of args.length ? args : ["routes", "js", "css"]) {
  switch (arg) {
    case "routes":
      builds.push(
        buildServer(
          "src/routes/**/[*].js",
          "src/routes/**/[*].ts",
          "src/routes/**/[*].jsx",
          "src/routes/**/[*].tsx"
        )
      );
      break;
    case "js":
      builds.push(
        buildBrowser(
          "src/browser/**/index.js",
          "src/browser/**/index.ts",
          "src/browser/**/index.jsx",
          "src/browser/**/index.tsx"
        )
      );
      break;
    case "css":
      builds.push(buildBrowser("src/browser/**/index.css"));
      break;
    default:
      console.info(`Error: Unknown argument '${arg}'.`);
      process.exit(1);
  }
}

await Promise.all(builds);

/**
 * @param {string[]} entryPoints
 */
function buildServer(...entryPoints) {
  esbuild.build({
    entryPoints,
    define: {
      "process.env.BUILD_TIME": BUILD_TIME,
    },
    minify: process.env.NODE_ENV !== "development",
    logLevel: "info",
    color: true,
    bundle: true,
    outbase: "src",
    outdir: "dist",
    platform: "neutral",
    packages: "external",
  });
}

/**
 * @param {string[]} entryPoints
 */
function buildBrowser(...entryPoints) {
  esbuild.build({
    entryPoints,
    define: BROWSER_PUBLIC_ENV,
    minify: process.env.NODE_ENV !== "development",
    logLevel: "info",
    color: true,
    bundle: true,
    outbase: "src/browser",
    outdir: "dist/browser",
    platform: "browser",
    format: "esm",
    target: ESBUILD_BROWSER_TARGET,
    external: [
      "*.avif",
      "*.gif",
      "*.jpg",
      "*.jpeg",
      "*.png",
      "*.svg",
      "*.webp",
      "*.eot",
      "*.ttf",
      "*.otf",
      "*.woff",
      "*.woff2",
    ],
  });
}
