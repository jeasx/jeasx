require("dotenv/config");

module.exports = {
  apps: [
    {
      name: "jeasx:start:server",
      script: "node_modules/jeasx/server.js",
      watch: ["public"],
      autorestart: true,
    },
    {
      name: "jeasx:build:routes",
      script: "node_modules/jeasx/esbuild.config.js",
      args: "routes",
      watch: ["js", "jsx", "ts", "tsx", "json"].map((ext) => `src/**/*.${ext}`),
      ignore_watch: ["src/browser"],
      autorestart: false,
    },
    {
      name: "jeasx:build:js",
      script: "node_modules/jeasx/esbuild.config.js",
      args: "js",
      watch: ["browser", "shared"].flatMap((folder) =>
        ["js", "jsx", "ts", "tsx", "json"].map(
          (ext) => `src/${folder}/**/*.${ext}`
        )
      ),
      autorestart: false,
    },
    {
      name: "jeasx:build:css",
      script: "node_modules/jeasx/esbuild.config.js",
      args: "css",
      watch: ["src/browser/**/*.css"],
      autorestart: false,
    },
  ],
};
