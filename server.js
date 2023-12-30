import serverless from "./serverless.js";

await serverless.listen({
  host: process.env.HOST || "0.0.0.0",
  port: Number(process.env.PORT || 3000),
});
