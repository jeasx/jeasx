import { existsSync } from "node:fs";

/**
 * Load environment variables from .env* files
 * into process.env in the following order:
 *
 * 1. .env.<NODE_ENV>.local
 * 2. .env.<NODE_ENV>
 * 3. .env.local
 * 4. .env
 * 5. .env.defaults
 *
 * If a variable already exists in the environment,
 * it will be not overwritten.
 */
export default function env() {
  if (!process.loadEnvFile) {
    console.warn(
      "🌻 <process.loadEnvFile> is not available. Please ensure your environment is properly configured."
    );
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
