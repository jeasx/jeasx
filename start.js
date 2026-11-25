import serverless from "./serverless.js";

// Register signal handlers before listening, so signals received while plugins
// or listen() are still booting are handled, too (module imports above run before this).
// Shut down gracefully on Ctrl+C (SIGINT) and SIGTERM. In a container, Node runs as PID 1,
// which ignores SIGINT unless a handler is registered. Exit explicitly afterwards, as other
// open handles (e.g. timers or connections of plugins) could keep the process running.
// "once": a second Ctrl+C kills the process if the shutdown hangs.
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, async () => {
    await serverless.close().catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
    process.exit();
  });
}

await serverless.listen({
  // The dev server is only reachable from this machine, unless HOST is set (e.g. HOST=:: in a container).
  host: process.env.HOST || (process.env.NODE_ENV === "development" ? "localhost" : "::"),
  port: Number(process.env.PORT || 3000),
});
