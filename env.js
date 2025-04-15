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
  if (process.loadEnvFile) {
    const files = [
      ...(process.env.NODE_ENV
        ? [`.env.${process.env.NODE_ENV}.local`, `.env.${process.env.NODE_ENV}`]
        : []),
      ".env.local",
      ".env",
      ".env.defaults",
    ];

    files.filter(existsSync).forEach((file) => {
      console.info(`🌻 Loading ${file}`);
      process.loadEnvFile(file);
    });
  }
}
