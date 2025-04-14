import { existsSync } from "node:fs";

/**
 * Load environment variables from .env* files
 * into process.env in the following order:
 *
 * 1. .env.local
 * 2. .env.<NODE_ENV>
 * 3. .env
 *
 * If a variable exists in the environment,
 * it will be not overwritten.
 */
export default function env() {
  if (process.loadEnvFile) {
    [
      ".env.local",
      ...(process.env.NODE_ENV ? [`.env.${process.env.NODE_ENV}`] : []),
      ".env",
    ]
      .filter(existsSync)
      .forEach(process.loadEnvFile);
  }
}
