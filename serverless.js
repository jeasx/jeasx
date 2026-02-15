import fastifyCookie from "@fastify/cookie";
import fastifyFormbody from "@fastify/formbody";
import fastifyMultipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { jsxToString } from "jsx-async-runtime";
import { stat } from "node:fs/promises";
import { freemem } from "node:os";
import { join } from "node:path";
import env from "./env.js";
const ENV = await env();
const CWD = process.cwd();
const NODE_ENV_IS_DEVELOPMENT = process.env.NODE_ENV === "development";
const JEASX_ROUTE_CACHE_LIMIT = Math.floor(freemem() / 1024 / 1024);
var serverless_default = Fastify({
  logger: true,
  ...ENV.FASTIFY_SERVER_OPTIONS
}).register(fastifyCookie, {
  ...ENV.FASTIFY_COOKIE_OPTIONS
}).register(fastifyFormbody, {
  ...ENV.FASTIFY_FORMBODY_OPTIONS
}).register(fastifyMultipart, {
  attachFieldsToBody: "keyValues",
  ...ENV.FASTIFY_MULTIPART_OPTIONS
}).register(fastifyStatic, {
  root: [["public"], ["dist", "browser"]].map((dir) => join(CWD, ...dir)),
  prefix: "/",
  wildcard: false,
  preCompressed: true,
  ...ENV.FASTIFY_STATIC_OPTIONS
}).decorateRequest("route", "").decorateRequest("path", "").addHook("onRequest", async (request, reply) => {
  reply.header("content-type", "text/html; charset=utf-8");
  const index = request.url.indexOf("?");
  request.path = index === -1 ? request.url : request.url.slice(0, index);
}).all("*", async (request, reply) => {
  try {
    return await handler(request, reply);
  } catch (error) {
    console.error("\u274C", error);
    throw error;
  }
});
const modules = /* @__PURE__ */ new Map();
async function handler(request, reply) {
  let response;
  const context = {};
  try {
    for (const route of generateRoutes(request.path)) {
      let module = modules.get(route);
      if (module === null) {
        continue;
      }
      if (module === void 0) {
        try {
          const modulePath = join(CWD, "dist", "server", `${route}.js`);
          if (NODE_ENV_IS_DEVELOPMENT) {
            if (typeof require === "function") {
              if (require.cache[modulePath]) {
                delete require.cache[modulePath];
              }
              module = await import(`file://${modulePath}`);
            } else {
              const mtime = (await stat(modulePath)).mtime.getTime();
              module = await import(`file://${modulePath}?${mtime}`);
            }
          } else {
            module = await import(`file://${modulePath}`);
            modules.set(route, module);
          }
        } catch {
          if (!NODE_ENV_IS_DEVELOPMENT) {
            modules.set(route, null);
          }
          continue;
        } finally {
          if (modules.size > JEASX_ROUTE_CACHE_LIMIT) {
            modules.delete(modules.keys().next().value);
          }
        }
      }
      request.route = route;
      response = // Call functions with request, reply and optional props
      typeof module.default === "function" ? await module.default.call(context, {
        request,
        reply,
        ...typeof response === "object" ? response : {}
      }) : module.default;
      if (reply.sent) {
        return;
      } else if (route.endsWith("/[404]")) {
        if (reply.statusCode === 200 && !request.path.endsWith("/404")) {
          reply.status(404);
        }
        break;
      } else if (typeof response === "string" || Buffer.isBuffer(response) || isJSX(response)) {
        break;
      } else if (route.endsWith("/[...guard]") && (response === void 0 || typeof response === "object")) {
        continue;
      } else if (reply.statusCode === 404) {
        continue;
      } else {
        break;
      }
    }
    return await renderJSX(context, response);
  } catch (error) {
    const errorHandler = context["errorHandler"];
    if (typeof errorHandler === "function") {
      reply.status(500);
      response = await errorHandler.call(context, error);
      return await renderJSX(context, response);
    } else {
      throw error;
    }
  }
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
    edges.push(`${path.substring(0, lastSegment)}[${path.substring(lastSegment)}]`);
  }
  edges.push(`${path}/[index]`);
  return edges;
}
function isJSX(obj) {
  return !!obj && typeof obj === "object" && "type" in obj && "props" in obj;
}
async function renderJSX(context, response) {
  const payload = isJSX(response) ? await jsxToString.call(context, response) : response;
  const responseHandler = context["responseHandler"];
  return typeof responseHandler === "function" ? await responseHandler.call(context, payload) : payload;
}
export {
  serverless_default as default
};
//# sourceMappingURL=serverless.js.map
