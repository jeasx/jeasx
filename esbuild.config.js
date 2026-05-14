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
    Object({ "process.env.BROWSER_PUBLIC_BUILD_TIME": BUILD_TIME }),
  );

/** @type esbuild.BuildOptions[] */
const buildOptions = [
  {
    entryPoints: ["src/**/[*].*"],
    define: { "process.env.BUILD_TIME": BUILD_TIME },
    minify: process.env.NODE_ENV !== "development",
    logLevel: "info",
    color: true,
    bundle: true,
    outdir: "dist",
    publicPath: "/",
    assetNames: "[dir]/[name]-[hash]",
    platform: "neutral",
    format: "esm",
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
    outdir: "dist",
    publicPath: "/",
    assetNames: "[dir]/[name]-[hash]",
    platform: "browser",
    format: "esm",
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
