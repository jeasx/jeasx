import { existsSync } from "node:fs";

/**
 * Load environment variables from .env-files into process.env in the following order:
 *
 * 1. .env.<NODE_ENV>.local
 * 2. .env.<NODE_ENV>
 * 3. .env.local
 * 4. .env
 * 5. .env.defaults
 */
export default function env() {
  if (typeof process.loadEnvFile === "function") {
    const env = process.env.NODE_ENV;
    [...(env ? [`.env.${env}.local`, `.env.${env}`] : []), ".env.local", ".env", ".env.defaults"]
      .filter(existsSync)
      .forEach(process.loadEnvFile);
  }
}
