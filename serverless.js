import fastifyCookie from "@fastify/cookie";
import fastifyFormbody from "@fastify/formbody";
import fastifyMultipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import fastify from "fastify";
import { jsxToString } from "jsx-async-runtime";
import { stat } from "node:fs/promises";
import { freemem } from "node:os";
import { join } from "node:path";
import env from "./env.js";
const ENV = await env();
const CWD = process.cwd();
const NODE_ENV_IS_DEVELOPMENT = process.env.NODE_ENV === "development";
const ROUTE_CACHE_LIMIT = Math.floor(freemem() / 1024 / 1024);
const FASTIFY_SERVER = ENV.FASTIFY_SERVER ?? ((fastify2) => fastify2);
var serverless_default = FASTIFY_SERVER(
  fastify({
    ...ENV.FASTIFY_SERVER_OPTIONS?.()
  })
).register((fastify2) => {
  fastify2.register(fastifyCookie, {
    ...ENV.FASTIFY_COOKIE_OPTIONS?.()
  }).register(fastifyFormbody, {
    ...ENV.FASTIFY_FORMBODY_OPTIONS?.()
  }).register(fastifyMultipart, {
    ...ENV.FASTIFY_MULTIPART_OPTIONS?.()
  }).register(fastifyStatic, {
    root: ["public", "dist"].map((dir) => join(CWD, dir)),
    wildcard: false,
    globIgnore: ["/**/\\[*\\].js?(.map)"],
    // ignore server routes
    ...ENV.FASTIFY_STATIC_OPTIONS?.()
  }).decorateRequest("route", "").decorateRequest("path", "").addHook("onRequest", async (request) => {
    const index = request.url.indexOf("?");
    request.path = index === -1 ? request.url : request.url.slice(0, index);
  }).all("*", async (request, reply) => {
    try {
      const payload = await handler(request, reply);
      if (reply.getHeader("content-type") === void 0 && (typeof payload === "string" || Buffer.isBuffer(payload))) {
        reply.type("text/html; charset=utf-8");
      }
      return payload;
    } catch (error) {
      request.log.error(error);
      throw error;
    }
  });
});
const modules = /* @__PURE__ */ new Map();
async function handler(request, reply) {
  let response;
  const context = {};
  const props = { request, reply };
  try {
    for (const route of generateRoutes(request.path)) {
      let module = modules.get(route);
      if (module === null) {
        continue;
      }
      if (module === void 0) {
        try {
          const modulePath = join(CWD, "dist", `${route}.js`);
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
        } catch (e) {
          switch (e.code) {
            case "ENOENT":
            case "ENOTDIR":
            case "ERR_MODULE_NOT_FOUND":
              if (!NODE_ENV_IS_DEVELOPMENT) {
                modules.set(route, null);
              }
              continue;
            default:
              throw e;
          }
        } finally {
          if (modules.size > ROUTE_CACHE_LIMIT) {
            modules.delete(modules.keys().next().value);
          }
        }
      }
      request.route = route;
      response = // Call functions with 'this' context and props as parameters
      typeof module.default === "function" ? await module.default.call(context, props) : module.default;
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
        Object.assign(props, response);
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
//# sourceMappingURL=data:application/json;base64,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
