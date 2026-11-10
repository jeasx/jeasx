import fastifySend from "@fastify/send";
import fastify from "fastify";
import { isJsxNode, jsxToStream } from "jsx-async-runtime";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";
import env from "./env.js";
env();
const CWD = process.cwd();
const CONFIG = (await import(pathToFileURL(join(CWD, "jeasx.config.js")).href)).default;
const NODE_ENV_IS_DEVELOPMENT = process.env.NODE_ENV === "development";
const METADATA = NODE_ENV_IS_DEVELOPMENT ? { routes: {}, files: {} } : (await import(pathToFileURL(join(CWD, "dist", "[--metadata--].js")).href)).default;
const MODULE_BY_ROUTE = Object.assign(
  /* @__PURE__ */ Object.create(null),
  METADATA.routes
);
const FILE_BY_PATH = Object.assign(/* @__PURE__ */ Object.create(null), METADATA.files);
const FASTIFY_SEND_OPTIONS = {
  ...await CONFIG.FASTIFY_SEND_OPTIONS?.(),
  root: CWD
};
const FASTIFY_SERVER = CONFIG.FASTIFY_SERVER ?? ((fastify2) => fastify2);
var serverless_default = await FASTIFY_SERVER(
  fastify(await CONFIG.FASTIFY_SERVER_OPTIONS?.()).decorateRequest("route", "").decorateRequest("path", "").decorateReply("file", void 0).addHook("onRequest", async (request, reply) => {
    const path = decodePath(request.url);
    if (path === void 0) {
      reply.code(400).send();
      return reply;
    }
    request.path = path;
  }).all("*", async (request, reply) => {
    reply.raw.once("close", () => reply.file?.stream.destroy());
    const payload = await handler(request, reply);
    if (reply.getHeader("content-type") === void 0 && (typeof payload === "string" || payload instanceof ReadableStream || // Static files bring their own content type (or none, e.g. for 304).
    payload instanceof Readable && payload !== reply.file?.stream || Buffer.isBuffer(payload))) {
      reply.type("text/html; charset=utf-8");
    }
    return payload;
  })
);
const STATIC_FILE_ROUTE = /* @__PURE__ */ Symbol("static-file-route");
async function handler(request, reply) {
  let response;
  const context = {};
  const props = { request, reply };
  reply.file = await tryFile(request);
  for (const route of generateRoutes(request.path)) {
    if (route === STATIC_FILE_ROUTE) {
      if (reply.file) {
        reply.status(reply.file.statusCode);
        reply.headers(reply.file.headers);
        response = reply.file.stream;
        break;
      }
      continue;
    }
    let module = MODULE_BY_ROUTE[route];
    if (module === void 0 && !NODE_ENV_IS_DEVELOPMENT) {
      continue;
    }
    try {
      if (typeof module === "string") {
        module = MODULE_BY_ROUTE[route] = await import(pathToFileURL(join(CWD, module)).href);
      } else if (module === void 0 && NODE_ENV_IS_DEVELOPMENT) {
        const modulePath = join(CWD, "dist", `${route}.js`);
        if (typeof require === "function" && require.cache[modulePath]) {
          delete require.cache[modulePath];
        }
        const mtime = (await stat(modulePath)).mtime.getTime();
        module = await import(`${pathToFileURL(modulePath).href}?${mtime}`);
      }
    } catch (e) {
      switch (e?.code) {
        case "ENOENT":
        case "ENOTDIR":
          continue;
        default:
          throw e;
      }
    }
    request.route = route;
    if (module && typeof module === "object") {
      response = typeof module.default === "function" ? (
        // Call functions with context as `this` and props as parameters,
        await module.default.call(context, props)
      ) : (
        // otherwise return default export.
        module.default
      );
    }
    if (reply.sent) {
      return;
    } else if (route.endsWith("/[404]")) {
      if (reply.statusCode === 200 && !(route.slice(0, -"[404]".length) + "404" === request.path.replace(/\/$/, ""))) {
        reply.status(404);
      }
      break;
    } else if (typeof response === "string" || response instanceof Response || response instanceof Readable || response instanceof ReadableStream || Buffer.isBuffer(response) || isJsxNode(response)) {
      break;
    } else if (typeof response === "object" && route.endsWith("/[...guard]")) {
      Object.assign(props, response);
      response = void 0;
      continue;
    } else if (response == null) {
      continue;
    } else {
      break;
    }
  }
  if (response == null && reply.statusCode === 200) {
    reply.status(404);
  }
  return await renderResponse(context, response);
}
const SPECIAL_SEGMENTS = /* @__PURE__ */ new Set(["index", "...guard", "...path", "--metadata--"]);
function* generateRoutes(path) {
  const segments = [""];
  let edgeSegment = "";
  for (const segment of path.split("/")) {
    if (segment !== "") {
      edgeSegment += `/${segment}`;
      segments.push(edgeSegment);
    }
  }
  for (let i = 0; i < segments.length; i++) {
    yield `${segments[i]}/[...guard]`;
  }
  yield STATIC_FILE_ROUTE;
  const lastSlash = edgeSegment.lastIndexOf("/") + 1;
  const lastSegment = edgeSegment.substring(lastSlash);
  if (lastSlash > 0 && !SPECIAL_SEGMENTS.has(lastSegment.toLowerCase())) {
    yield `${edgeSegment.substring(0, lastSlash)}[${lastSegment}]`;
  }
  yield `${edgeSegment}/[index]`;
  for (let i = segments.length - 1; i >= 0; i--) {
    yield `${segments[i]}/[...path]`;
  }
  for (let i = segments.length - 1; i >= 0; i--) {
    yield `${segments[i]}/[404]`;
  }
}
function decodePath(url) {
  try {
    const index = url.indexOf("?");
    const rawPath = index === -1 ? url : url.slice(0, index);
    const path = decodeURIComponent(rawPath).replace(/[\\/]+/g, "/");
    if (path.includes("\0") || /(^|\/)\.\.?(\/|$)/.test(path)) {
      return void 0;
    }
    return path;
  } catch {
    return void 0;
  }
}
async function renderResponse(context, response) {
  const payload = isJsxNode(response) ? await jsxToStream.call(context, response) : response;
  const responseHandler = context["responseHandler"];
  return typeof responseHandler === "function" ? await responseHandler.call(context, payload) : payload;
}
async function tryFile(request) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return void 0;
  }
  const file = FILE_BY_PATH[request.path];
  if (file) {
    return await sendFile(request, file);
  }
  if (NODE_ENV_IS_DEVELOPMENT) {
    for (const directory of ["dist", "public"]) {
      if (directory === "dist" && /\[[^/]+\]\.[^/]*$/u.test(request.path)) {
        continue;
      }
      try {
        if ((await stat(join(CWD, directory, request.path))).isFile()) {
          return await sendFile(request, `${directory}${request.path}`);
        }
      } catch {
        continue;
      }
    }
  }
  return void 0;
}
async function sendFile(request, path) {
  const result = await fastifySend(request.raw, encodeURI(path), FASTIFY_SEND_OPTIONS);
  if (result.type === "error" && result.statusCode === 404) {
    result.stream.destroy();
    return void 0;
  }
  return result;
}
export {
  serverless_default as default
};
//# sourceMappingURL=serverless.js.map
