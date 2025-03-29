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
  await import("./esbuild.config.js");
}

async function dev() {
  process.env.NODE_ENV = "development";
  process.setSourceMapsEnabled(true);
  await build();
  await start();
}

async function clean() {
  await fs.rm("dist", { recursive: true, force: true, maxRetries: 3 });
}

export {};
