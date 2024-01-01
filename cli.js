#!/usr/bin/env node
import fs from "node:fs/promises";

switch (process.argv[2]) {
  case "start":
    await start();
    break;

  case "build":
    await build();
    break;

  case "dev":
    await dev();
    break;

  case "clean":
    await clean();
    break;

  case "help":
    console.info(`Usage: jeasx [start|build|dev|clean|help]`);
    break;

  default:
    console.info(
      `❌ Error: Unknown command '${process.argv[2]}'.\nUse 'jeasx help' for options.`
    );
    process.exit(1);
}

async function start() {
  await import("./server.js");
}

async function build() {
  process.argv = process.argv.splice(0, 2);
  await clean();
  await import("./esbuild.config.js");
}

async function dev() {
  process.env.NODE_ENV = "development";
  process.argv[2] = "start";
  process.argv[3] ??= "node_modules/jeasx/ecosystem.config.cjs";
  await clean();
  // @ts-ignore
  await import("pm2/bin/pm2-runtime");
}

async function clean() {
  await fs.rm("dist", { recursive: true, force: true });
}

export {};
