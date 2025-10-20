import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Load environment variables from .env* files
 * into process.env in the following order:
 *
 * 1. .env.<NODE_ENV>.local
 * 2. .env.<NODE_ENV>
 * 3. .env.local
 * 4. .env
 * 5. .env.defaults
 * 6. .env.js
 *
 * If a variable already exists in a previous environment,
 * it will be not overwritten at a later stage.
 */
export default async function env() {
  if (process.loadEnvFile) {
    [
      ...(process.env.NODE_ENV
        ? [`.env.${process.env.NODE_ENV}.local`, `.env.${process.env.NODE_ENV}`]
        : []),
      ".env.local",
      ".env",
      ".env.defaults",
    ]
      .filter(existsSync)
      .forEach(process.loadEnvFile);
  }
  try {
    const envFile = `file://${join(process.cwd(), ".env.js")}`;
    const envObject = (await import(envFile)).default;
    Object.entries(envObject).forEach(([key, value]) => {
      if (!(key in process.env)) {
        switch (typeof value) {
          case "string":
            process.env[key] = value;
            break;
          case "function":
            process.env[key] = value.toString();
            break;
          default:
            process.env[key] = JSON.stringify(value);
            break;
        }
      }
    });
  } catch (e) {
    // ERR_MODULE_NOT_FOUND
  }
}
