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
      ignore_watch: process.env.JEASX_BUILD_ROUTES_IGNORE_WATCH
        ? process.env.JEASX_BUILD_ROUTES_IGNORE_WATCH.split(",")
        : ["src/browser"],
      autorestart: false,
    },
    {
      name: "jeasx:build:js",
      script: "node_modules/jeasx/esbuild.config.js",
      args: "js",
      watch: (process.env.JEASX_BUILD_JS_WATCH
        ? process.env.JEASX_BUILD_JS_WATCH.split(",")
        : ["src/browser"]
      ).flatMap((path) =>
        ["js", "jsx", "ts", "tsx", "json"].map((ext) => `${path}/**/*.${ext}`)
      ),
      autorestart: false,
    },
    {
      name: "jeasx:build:css",
      script: "node_modules/jeasx/esbuild.config.js",
      args: "css",
      watch: ["src/**/*.css"],
      autorestart: false,
    },
  ],
};
