#!/usr/bin/env node
import fs from "node:fs/promises";
import loadenv from "./loadenv.js";

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
  loadenv();
  const argv = [...process.argv];
  process.argv = [];
  await clean();
  await import("./esbuild.config.js");
  process.argv = argv;
}

async function dev() {
  process.env.NODE_ENV = "development";
  // Run build to prepare browser assets for fastify-static
  await build();
  // Start the dev environment
  process.argv[2] = "start";
  process.argv[3] ??= "node_modules/jeasx/ecosystem.config.cjs";
  // @ts-ignore
  await import("pm2/bin/pm2-runtime");
}

async function clean() {
  await fs.rm("dist", { recursive: true, force: true, maxRetries: 3 });
}

export {};
