import fastifyAccepts from "@fastify/accepts";
import fastifyCookie from "@fastify/cookie";
import fastifyFormbody from "@fastify/formbody";
import fastifyMultipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import fastifyUrlData from "@fastify/url-data";
import "dotenv/config";
import Fastify from "fastify";
import { jsxToString } from "jsx-async-runtime";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const NODE_ENV_IS_DEVELOPMENT = process.env.NODE_ENV === "development";

// Create a Fastify app instance
const serverless = Fastify({
  logger: true,
  disableRequestLogging: NODE_ENV_IS_DEVELOPMENT,
  bodyLimit: Number(process.env.FASTIFY_BODY_LIMIT) || undefined,
});

// Register required plugins
serverless.register(fastifyAccepts);
serverless.register(fastifyCookie);
serverless.register(fastifyFormbody);
serverless.register(fastifyMultipart);
serverless.register(fastifyUrlData);

// Setup static file plugin
const FASTIFY_STATIC_HEADERS =
  !NODE_ENV_IS_DEVELOPMENT && process.env.FASTIFY_STATIC_HEADERS
    ? JSON.parse(String(process.env.FASTIFY_STATIC_HEADERS))
    : undefined;

serverless.register(fastifyStatic, {
  root: ["public", "dist/browser"].map((dir) => join(process.cwd(), dir)),
  prefix: "/",
  wildcard: false,
  setHeaders: FASTIFY_STATIC_HEADERS
    ? (reply, path) => {
        for (const [suffix, headers] of Object.entries(
          FASTIFY_STATIC_HEADERS
        )) {
          if (path.endsWith(suffix)) {
            for (const [key, value] of Object.entries(headers)) {
              reply.setHeader(key, value);
            }
            return;
          }
        }
      }
    : undefined,
});

// Handle all requests
serverless.all("*", async (request, reply) => {
  let response;

  // Global context object for route handlers
  const context = {};

  // Extract pathname without query parameters
  const requestPath = request.urlData().path;

  // Transform "/a/b/c" into ["/a/b/c", "/a/b", "/a", ""]
  const pathSegments = requestPath
    .split("/")
    .filter((segment) => segment !== "")
    .reduce((acc, segment) => {
      acc.push((acc.length > 0 ? acc[acc.length - 1] : "") + "/" + segment);
      return acc;
    }, [])
    .reverse()
    .concat("");

  // Transform "/a/b/c" into ["/a/b/[c]", "/a/b/c/[index]"]
  const generateEdges = (path) => {
    const edges = [];
    if (path) {
      const lastSegment = path.lastIndexOf("/") + 1;
      edges.push(
        `${path.substring(0, lastSegment)}[${path.substring(lastSegment)}]`
      );
    }
    edges.push(`${path}/[index]`);
    return edges;
  };

  // Find route handler for the request
  for (const pathname of [
    ...pathSegments
      .slice()
      .reverse() // [...guard]s are evaluated from top to bottom
      .map((segment) => `routes${segment}/[...guard].js`),
    ...generateEdges(pathSegments[0]).map((segment) => `routes${segment}.js`),
    ...pathSegments.map((segment) => `routes${segment}/[...path].js`),
    ...pathSegments.map((segment) => `routes${segment}/[404].js`),
  ]) {
    const modulePath = join(process.cwd(), "dist", pathname);

    try {
      (await stat(modulePath)).isFile();
    } catch {
      continue;
    }

    // Build content hash in development, so we can refresh code via "query string hack".
    const hash = NODE_ENV_IS_DEVELOPMENT
      ? "?" +
        createHash("sha1")
          .update(await readFile(modulePath, "utf-8"))
          .digest("hex")
      : "";

    // Call the handler with request, reply and optional props
    response = await (
      await import(`file://${modulePath}${hash}`)
    ).default.call(context, {
      request,
      reply,
      ...(typeof response === "object" ? response : {}),
    });

    if (reply.sent) {
      return;
    } else if (typeof response === "string" || Buffer.isBuffer(response)) {
      break;
    } else if (
      pathname.endsWith("/[...guard].js") &&
      (response === undefined || !isJSX(response))
    ) {
      continue;
    } else if (pathname.endsWith("/[404].js")) {
      reply.status(404);
      break;
    } else if (reply.statusCode === 404) {
      continue;
    } else {
      break;
    }
  }

  // Make sure a Content-Type header is set
  if (!reply.hasHeader("Content-Type")) {
    reply.header("Content-Type", "text/html; charset=utf-8");
  }

  const payload = isJSX(response)
    ? await jsxToString.call(context, response)
    : response;

  // Post-process the payload with an optional response handler
  const responseHandler = context["response"];
  return typeof responseHandler === "function"
    ? await responseHandler(payload)
    : payload;

  function isJSX(obj) {
    return typeof obj === "object" && "type" in obj && "props" in obj;
  }
});

export default serverless;
