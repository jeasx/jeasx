#!/usr/bin/env node
import fs from "node:fs/promises";

switch (process.argv[2]) {
  case "start":
    await import("./start.js");
    break;

  case "build":
    await import("./build.js");
    break;

  case "dev":
    process.env.NODE_ENV = "development";
    await import("./build.js");
    await import("./start.js");
    break;

  case "clean":
    await fs.rm("dist", { recursive: true, force: true, maxRetries: 3 });
    break;

  default:
    console.info(`💡 Usage: jeasx [start|build|dev|clean]`);
    process.exit(1);
}

export {};
