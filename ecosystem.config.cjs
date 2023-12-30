module.exports = {
  apps: [
    {
      name: "jeasx:start:server",
      script: "node_modules/jeasx/server.js",
      autorestart: true,
    },
    {
      name: "jeasx:build:routes",
      script: "node_modules/jeasx/esbuild.config.js",
      args: "routes",
      watch: [
        "src/**/*.js",
        "src/**/*.jsx",
        "src/**/*.ts",
        "src/**/*.tsx",
        "src/**/*.json",
      ],
      ignore_watch: ["src/browser"],
      autorestart: false,
    },
    {
      name: "jeasx:build:js",
      script: "node_modules/jeasx/esbuild.config.js",
      args: "js",
      watch: [
        "src/browser/**/*.js",
        "src/browser/**/*.jsx",
        "src/browser/**/*.ts",
        "src/browser/**/*.tsx",
        "src/browser/**/*.json",
      ],
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
