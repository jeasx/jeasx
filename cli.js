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

  case "clear":
    await clear();
    break;

  case "help":
    console.info(`Usage: jeasx [start|build|dev|clear|help]`);
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
  await clear();
  await import("./esbuild.config.js");
}

async function dev() {
  process.env.NODE_ENV = "development";
  process.argv[2] = "start";
  process.argv[3] ??= "node_modules/jeasx/ecosystem.config.cjs";
  await clear();
  // @ts-ignore
  await import("pm2/bin/pm2-runtime");
}

async function clear() {
  await fs.rm("dist", { recursive: true, force: true });
}

export {};
