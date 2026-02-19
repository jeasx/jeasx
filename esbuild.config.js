import * as esbuild from "esbuild";
import env from "./env.js";

const ENV = await env();

const BUILD_TIME = `"${ENV.BUILD_TIME || Date.now().toString(36)}"`;

const BROWSER_PUBLIC_ENV = Object.keys(ENV)
  .filter((key) => key.startsWith("BROWSER_PUBLIC_"))
  .reduce(
    (env, key) => {
      env[`process.env.${key}`] = `"${ENV[key]}"`;
      return env;
    },
    { "process.env.BROWSER_PUBLIC_BUILD_TIME": BUILD_TIME },
  );

/** @type esbuild.BuildOptions[] */
const buildOptions = [
  {
    entryPoints: ["src/**/[*].*"],
    define: {
      "process.env.BUILD_TIME": BUILD_TIME,
    },
    minify: process.env.NODE_ENV !== "development",
    logLevel: "info",
    color: true,
    bundle: true,
    sourcemap: process.sourceMapsEnabled,
    sourcesContent: false,
    outdir: "dist/server",
    platform: "neutral",
    packages: "external",
    ...ENV.ESBUILD_SERVER_OPTIONS?.(),
  },
  {
    entryPoints: ["src/**/index.*"],
    define: BROWSER_PUBLIC_ENV,
    minify: process.env.NODE_ENV !== "development",
    logLevel: "info",
    color: true,
    bundle: true,
    sourcemap: process.sourceMapsEnabled,
    sourcesContent: true,
    outdir: "dist/browser",
    platform: "browser",
    format: "esm",
    target: ["chrome130", "edge130", "firefox130", "safari18"],
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
    ...ENV.ESBUILD_BROWSER_OPTIONS?.(),
  },
];

buildOptions.forEach(async (options) => {
  if (process.env.NODE_ENV === "development") {
    (await esbuild.context(options)).watch();
  } else {
    await esbuild.build(options);
  }
});
