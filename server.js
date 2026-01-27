import serverless from "./serverless.js";

await serverless.listen({
  host: process.env.HOST || "::",
  port: Number(process.env.PORT || 3000)
});
