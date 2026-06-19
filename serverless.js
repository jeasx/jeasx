import fastifyCookie from "@fastify/cookie";
import fastifyFormbody from "@fastify/formbody";
import fastifyMultipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import fastify from "fastify";
import { jsxToString } from "jsx-async-runtime";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import env from "./env.js";
env();
const CWD = process.cwd();
const CONFIG = (await import(`file://${join(CWD, "jeasx.config.js")}`)).default;
const NODE_ENV_IS_DEVELOPMENT = process.env.NODE_ENV === "development";
const MODULE_BY_ROUTE = {};
if (!NODE_ENV_IS_DEVELOPMENT) {
  const { routes } = (await import(`file://${join(CWD, "dist", "[--metadata--].js")}`)).default;
  for (const route of routes) {
    MODULE_BY_ROUTE[route] = `file://${join(CWD, "dist", `${route}.js`)}`;
  }
}
const FASTIFY_SERVER = CONFIG.FASTIFY_SERVER ?? ((fastify2) => fastify2);
var serverless_default = FASTIFY_SERVER(
  fastify({
    ...CONFIG.FASTIFY_SERVER_OPTIONS?.()
  })
).register((fastify2) => {
  fastify2.register(fastifyCookie, {
    ...CONFIG.FASTIFY_COOKIE_OPTIONS?.()
  }).register(fastifyFormbody, {
    ...CONFIG.FASTIFY_FORMBODY_OPTIONS?.()
  }).register(fastifyMultipart, {
    ...CONFIG.FASTIFY_MULTIPART_OPTIONS?.()
  }).register(fastifyStatic, {
    root: ["public", "dist"].map((dir) => join(CWD, dir)),
    wildcard: false,
    globIgnore: ["/**/\\[*\\].js?(.map)"],
    ...CONFIG.FASTIFY_STATIC_OPTIONS?.()
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
async function handler(request, reply) {
  let response;
  const context = {};
  const props = { request, reply };
  try {
    for (const route of generateRoutes(request.path)) {
      let module = MODULE_BY_ROUTE[route];
      if (module === void 0 && !NODE_ENV_IS_DEVELOPMENT) {
        continue;
      }
      try {
        if (typeof module === "string") {
          module = MODULE_BY_ROUTE[route] = await import(module);
        } else if (module === void 0 && NODE_ENV_IS_DEVELOPMENT) {
          const modulePath = join(CWD, "dist", `${route}.js`);
          if (typeof require === "function" && require.cache[modulePath]) {
            delete require.cache[modulePath];
          }
          const mtime = (await stat(modulePath)).mtime.getTime();
          module = await import(`file://${modulePath}?${mtime}`);
        }
      } catch (e) {
        switch (e.code) {
          case "ENOENT":
          case "ENOTDIR":
          case "ERR_MODULE_NOT_FOUND":
            continue;
          default:
            throw e;
        }
      }
      if (typeof module !== "object" || module === null) {
        continue;
      }
      request.route = route;
      response = typeof module.default === "function" ? (
        // Call functions with context as `this` and props as parameters,
        await module.default.call(context, props)
      ) : (
        // otherwise return default export.
        module.default
      );
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
  const routes = [];
  const segments = [""];
  let current = "";
  for (const segment of path.split("/")) {
    if (segment !== "") {
      current += `/${segment}`;
      segments.push(current);
    }
  }
  segments.reverse();
  for (let i = segments.length - 1; i >= 0; i--) {
    routes.push(`${segments[i]}/[...guard]`);
  }
  const edgeSegment = segments[0];
  const lastSlash = edgeSegment.lastIndexOf("/") + 1;
  if (lastSlash > 0) {
    routes.push(`${edgeSegment.substring(0, lastSlash)}[${edgeSegment.substring(lastSlash)}]`);
  }
  routes.push(`${edgeSegment}/[index]`);
  for (let i = 0; i < segments.length; i++) {
    routes.push(`${segments[i]}/[...path]`);
  }
  for (let i = 0; i < segments.length; i++) {
    routes.push(`${segments[i]}/[404]`);
  }
  return routes;
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
