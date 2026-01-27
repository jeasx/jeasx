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
      ...(process.env.NODE_ENV ?
        [`.env.${process.env.NODE_ENV}.local`, `.env.${process.env.NODE_ENV}`]
      : []),
      ".env.local",
      ".env",
      ".env.defaults"
    ]
      .filter(existsSync)
      .forEach(process.loadEnvFile);
  }
  try {
    const envFile = `file://${join(process.cwd(), ".env.js")}`;
    const envObject = (await import(envFile)).default;
    Object.entries(envObject)
      .filter(([key]) => !(key in process.env))
      .forEach(([key, value]) => {
        try {
          process.env[key] =
            typeof value === "string" ? value : JSON.stringify(value);
        } catch (error) {
          // JSON.stringify throws TypeError for circular references or BigInts.
          console.error("❌", `"${key}" in .env.js throws`, error);
        }
      });
    return envObject;
  } catch {
    // ERR_MODULE_NOT_FOUND
  }
}
