import * as esbuild from "esbuild";
import env from "./env.js";

env();

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

/** @type import("esbuild").BuildOptions[] */
const buildOptions = [
  {
    entryPoints: ["js", "ts", "jsx", "tsx"].map(
      (ext) => `src/routes/**/[*].${ext}`
    ),
    define: {
      "process.env.BUILD_TIME": BUILD_TIME,
    },
    minify: process.env.NODE_ENV !== "development",
    logLevel: "info",
    logOverride: {
      "empty-glob": "silent",
    },
    color: true,
    bundle: true,
    sourcemap: true,
    sourcesContent: false,
    outbase: "src",
    outdir: "dist",
    platform: "neutral",
    packages: "external",
  },
  {
    entryPoints: ["js", "ts", "jsx", "tsx", "css"].map(
      (ext) => `src/browser/**/index.${ext}`
    ),
    define: BROWSER_PUBLIC_ENV,
    minify: process.env.NODE_ENV !== "development",
    logLevel: "info",
    logOverride: {
      "empty-glob": "silent",
    },
    color: true,
    bundle: true,
    sourcemap: true,
    sourcesContent: true,
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
  },
];

buildOptions.forEach(async (options) => {
  if (process.env.NODE_ENV === "development") {
    (await esbuild.context(options)).watch();
  } else {
    await esbuild.build(options);
  }
});
