#!/usr/bin/env node
import { rm } from "node:fs/promises";

const SCRIPTS = {
  START: "./start.js",
  BUNDLE: process.isBun ? "./bundle-bun.js" : "./bundle-esbuild.js",
  BUILD_MANIFEST: "./build-manifest.js",
};

switch (process.argv[2]) {
  case "start":
    await import(SCRIPTS.START);
    break;

  case "build":
    await clean();
    await import(SCRIPTS.BUNDLE);
    await import(SCRIPTS.BUILD_MANIFEST);
    break;

  case "dev":
    process.env.NODE_ENV = "development";
    await clean();
    await import(SCRIPTS.BUNDLE);
    await import(SCRIPTS.START);
    break;

  case "clean":
    await clean();
    break;

  default:
    console.info(`💡 Usage: jeasx [dev|build|start|clean]`);
    process.exit(1);
}

async function clean() {
  await rm("dist", { recursive: true, force: true, maxRetries: 3 });
}
