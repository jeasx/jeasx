import { existsSync } from "node:fs";

/**
 * Load environment variables from .env* files
 * into process.env in the following order:
 *
 * 1. .env.defaults
 * 2. .env
 * 3. .env.local
 * 4. .env.<NODE_ENV>
 * 5. .env.<NODE_ENV>.local
 */
export default function env() {
  if (!process.loadEnvFile) {
    console.warn("🌻 <node:process.loadEnvFile> is not available");
    return;
  }

  const files = [".env.defaults", ".env", ".env.local"];

  if (process.env.NODE_ENV) {
    files.push(
      `.env.${process.env.NODE_ENV}`,
      `.env.${process.env.NODE_ENV}.local`
    );
  }

  files
    .toReversed()
    .filter(existsSync)
    .forEach((file) => {
      console.info(`🌻 Loading ${file}`);
      process.loadEnvFile(file);
    });
}
