import serverless from "./serverless.js";

await serverless.listen({
  // The dev server is only reachable from this machine, unless HOST is set (e.g. HOST=:: in a container).
  host: process.env.HOST || (process.env.NODE_ENV === "development" ? "localhost" : "::"),
  port: Number(process.env.PORT || 3000),
});

// Shut down gracefully on Ctrl+C (SIGINT) and SIGTERM. In a container, Node runs as PID 1,
// which ignores SIGINT unless a handler is registered. Exit explicitly afterwards, as other
// handles (e.g. the esbuild watcher in development) would keep the process running.
// "once": a second Ctrl+C kills the process if the shutdown hangs.
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, async () => {
    await serverless.close();
    process.exit(0);
  });
}
