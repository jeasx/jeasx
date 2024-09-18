import serverless from "./serverless.js";

await serverless.listen({
  host: "0.0.0.0",
  port: Number(process.env.PORT || 3000),
});
