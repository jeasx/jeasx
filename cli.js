#!/usr/bin/env node
import fs from "node:fs";

export {};

switch (process.argv[2]) {
  case "start":
    await import("./server.js");
    break;

  case "build":
    process.argv[2] = "routes";
    process.argv[3] = "js";
    process.argv[4] = "css";
    clearDist();
    await import("./esbuild.config.js");
    break;

  case "dev":
    process.env.NODE_ENV = "development";
    process.argv[2] = "start";
    process.argv[3] ??= "node_modules/jeasx/ecosystem.config.cjs";
    clearDist();
    await import("pm2/lib/binaries/Runtime4Docker.js");
    break;

  default:
    console.info(`❌ Error: Unknown command '${process.argv[2]}'.`);
    process.exit(1);
}

function clearDist() {
  fs.rmSync("dist", { recursive: true, force: true });
}
