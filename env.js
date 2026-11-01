import { existsSync } from "node:fs";

/**
 * Loads environment variables from .env files into process.env.
 * Files are read in the order below. A variable that is already set,
 * by the environment or by an earlier file, is never overwritten:
 *
 * 1. .env.<NODE_ENV>.local
 * 2. .env.<NODE_ENV>
 * 3. .env.local
 * 4. .env
 * 5. .env.defaults
 *
 * NODE_ENV itself must come from the environment (e.g. set by "jeasx dev"):
 * the files above are chosen before any of them is read, so a NODE_ENV
 * set in a file doesn't select .env.<NODE_ENV>(.local).
 */
export default function env() {
  if (typeof process.loadEnvFile === "function") {
    const env = process.env.NODE_ENV;
    [...(env ? [`.env.${env}.local`, `.env.${env}`] : []), ".env.local", ".env", ".env.defaults"]
      .filter(existsSync)
      .forEach(process.loadEnvFile);
  }
}
