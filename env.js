import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Load environment variables from .env-files into process.env in the following order:
 *
 * 1. .env.<NODE_ENV>.local
 * 2. .env.<NODE_ENV>
 * 3. .env.local
 * 4. .env
 * 5. .env.defaults
 * 6. .env.js
 *
 * .env.js is imported as an ES module and will always overwrite existing variables.
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
      try {
        process.env[key] = typeof value === "string" ? value : JSON.stringify(value);
      } catch (error) {
        // JSON.stringify throws TypeError for circular references or BigInts.
        console.error("❌", `"${key}" in .env.js throws`, error);
      }
    });
    return { ...process.env, ...envObject };
  } catch {
    // ERR_MODULE_NOT_FOUND
    return { ...process.env };
  }
}
