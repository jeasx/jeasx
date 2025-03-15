import fastifyCookie from "@fastify/cookie";
import fastifyFormbody from "@fastify/formbody";
import fastifyMultipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { jsxToString } from "jsx-async-runtime";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import env from "./env.js";
env();
const NODE_ENV_IS_DEVELOPMENT = process.env.NODE_ENV === "development";
const CWD = process.cwd();
const FASTIFY_STATIC_HEADERS = process.env.FASTIFY_STATIC_HEADERS && JSON.parse(process.env.FASTIFY_STATIC_HEADERS);
var serverless_default = Fastify({
  logger: true,
  disableRequestLogging: JSON.parse(
    process.env.FASTIFY_DISABLE_REQUEST_LOGGING || "false"
  ),
  bodyLimit: Number(process.env.FASTIFY_BODY_LIMIT) || void 0,
  trustProxy: JSON.parse(process.env.FASTIFY_TRUST_PROXY || "false"),
  rewriteUrl: process.env.FASTIFY_REWRITE_URL && new Function(`return ${process.env.FASTIFY_REWRITE_URL}`)()
}).register(fastifyCookie).register(fastifyFormbody).register(fastifyMultipart).register(fastifyStatic, {
  root: ["public", "dist/browser"].map((dir) => join(CWD, dir)),
  prefix: "/",
  wildcard: false,
  cacheControl: false,
  setHeaders: FASTIFY_STATIC_HEADERS ? (reply, path) => {
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
  } : void 0
}).decorateRequest("route", "").decorateRequest("path", "").addHook("onRequest", async (request, reply) => {
  const index = request.url.indexOf("?");
  request.path = index === -1 ? request.url : request.url.slice(0, index);
}).all("*", handler);
const modules = {};
async function handler(request, reply) {
  let response;
  const context = {};
  const path = request.path;
  for (const route of generateRoutes(path)) {
    const modulePath = join(CWD, "dist", `routes${route}.js`);
    let module = modules[modulePath];
    if (module === null) {
      continue;
    }
    if (module === void 0) {
      try {
        (await stat(modulePath)).isFile();
      } catch {
        if (!NODE_ENV_IS_DEVELOPMENT) {
          modules[modulePath] = null;
        }
        continue;
      }
      if (NODE_ENV_IS_DEVELOPMENT) {
        module = await import(`file://${modulePath}?${createHash("sha1").update(await readFile(modulePath, "utf-8")).digest("hex")}`);
      } else {
        module = modules[modulePath] = await import(`file://${modulePath}`);
      }
    }
    request.route = route;
    response = await module.default.call(context, {
      request,
      reply,
      ...typeof response === "object" ? response : {}
    });
    if (reply.sent) {
      return;
    } else if (typeof response === "string" || Buffer.isBuffer(response) || isJSX(response)) {
      break;
    } else if (route.endsWith("/[...guard]") && (response === void 0 || typeof response === "object")) {
      continue;
    } else if (route.endsWith("/[404]")) {
      reply.status(404);
      break;
    } else if (reply.statusCode === 404) {
      continue;
    } else {
      break;
    }
  }
  if (!reply.hasHeader("Content-Type")) {
    reply.header("Content-Type", "text/html; charset=utf-8");
  }
  const payload = isJSX(response) ? await jsxToString.call(context, response) : response;
  const responseHandler = context["response"];
  return typeof responseHandler === "function" ? await responseHandler(payload) : payload;
}
function generateRoutes(path) {
  const segments = generateSegments(path);
  const edges = generateEdges(segments[0]);
  return [
    ...segments.toReversed().map((segment) => `${segment}/[...guard]`),
    ...edges.map((edge) => `${edge}`),
    ...segments.map((segment) => `${segment}/[...path]`),
    ...segments.map((segment) => `${segment}/[404]`)
  ];
}
function generateSegments(path) {
  return path.split("/").filter((segment) => segment !== "").reduce((acc, segment) => {
    acc.push((acc.length > 0 ? acc[acc.length - 1] : "") + "/" + segment);
    return acc;
  }, []).reverse().concat("");
}
function generateEdges(path) {
  const edges = [];
  if (path) {
    const lastSegment = path.lastIndexOf("/") + 1;
    edges.push(
      `${path.substring(0, lastSegment)}[${path.substring(lastSegment)}]`
    );
  }
  edges.push(`${path}/[index]`);
  return edges;
}
function isJSX(obj) {
  return !!obj && typeof obj === "object" && "type" in obj && "props" in obj;
}
export {
  serverless_default as default
};
