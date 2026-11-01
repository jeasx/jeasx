import fastifySend, { BaseSendResult, SendOptions } from "@fastify/send";
import fastify, {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  FastifyServerOptions,
} from "fastify";
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

// Map routes and files for non-development environments from metadata export.
// Module paths are initialized at startup but overwritten
// with resolved modules upon the first request.
const METADATA: {
  routes: Record<string, string | { default: Function }>;
  files: Record<string, string>;
} = NODE_ENV_IS_DEVELOPMENT
  ? { routes: {}, files: {} }
  : (await import(pathToFileURL(join(CWD, "dist", "[--metadata--].js")).href)).default;

// Without a prototype, lookups never return inherited keys like "constructor".
const MODULE_BY_ROUTE = Object.assign(
  Object.create(null),
  METADATA.routes,
) as typeof METADATA.routes;
const FILE_BY_PATH = Object.assign(Object.create(null), METADATA.files) as typeof METADATA.files;

declare module "fastify" {
  interface FastifyRequest {
    /** Decoded path without query parameters */
    path: string;
    /** Path to resolved route handler */
    route: string;
  }

  interface FastifyReply {
    /** Populated when serving a static file; otherwise undefined. */
    file?: BaseSendResult;
  }
}

// All config options may be sync or async functions.

// Files are passed relative to CWD, so the root must always be CWD.
const FASTIFY_SEND_OPTIONS: SendOptions = {
  ...((await CONFIG.FASTIFY_SEND_OPTIONS?.()) as SendOptions),
  root: CWD,
};

// Enhance Fastify server from userland
const FASTIFY_SERVER = (CONFIG.FASTIFY_SERVER ?? ((fastify) => fastify)) as (
  fastify: FastifyInstance,
) => FastifyInstance | Promise<FastifyInstance>;

// Create and export a Fastify instance.
// A Fastify instance is thenable: awaiting it loads the plugins registered so far
// and resolves to the instance itself, so further plugins and routes can still be added.
export default await FASTIFY_SERVER(
  fastify((await CONFIG.FASTIFY_SERVER_OPTIONS?.()) as FastifyServerOptions)
    .decorateRequest("route", "")
    .decorateRequest("path", "")
    .decorateReply("file", undefined)
    .addHook("onRequest", async (request, reply) => {
      const path = decodePath(request.url);
      if (path === undefined) {
        reply.code(400).send();
        return reply;
      }
      request.path = path;
    })
    .all("*", async (request: FastifyRequest, reply: FastifyReply) => {
      // Close the file stream once the response is finished or aborted,
      // otherwise its file handle leaks if nobody reads it. Waiting for the
      // response also covers routes which send the stream via reply.send().
      reply.raw.once("close", () => reply.file?.stream.destroy());

      const payload = await handler(request, reply);
      if (
        reply.getHeader("content-type") === undefined &&
        (typeof payload === "string" ||
          payload instanceof ReadableStream ||
          // Static files bring their own content type (or none, e.g. for 304).
          (payload instanceof Readable && payload !== reply.file?.stream) ||
          Buffer.isBuffer(payload))
      ) {
        reply.type("text/html; charset=utf-8");
      }
      return payload;
    }),
);

// Used as marker for static file routes.
const STATIC_FILE_ROUTE = Symbol("static-file-route");

/**
 * Resolves route modules based on the request path and executes them.
 */
async function handler(request: FastifyRequest, reply: FastifyReply) {
  let response: unknown;

  // Global context object for route handlers
  const context: any = {};

  // Default props for route handlers
  const props = { request, reply };

  // Check for static file and store result for later processing.
  reply.file = await tryFile(request);

  // Execute route handlers for current request
  for (const route of generateRoutes(request.path)) {
    // Try to serve static file
    if (route === STATIC_FILE_ROUTE) {
      if (reply.file) {
        reply.status(reply.file.statusCode);
        reply.headers(reply.file.headers);
        response = reply.file.stream;
        break;
      }
      continue;
    }

    // Resolve module or path to module
    let module = MODULE_BY_ROUTE[route];

    // Skip processing if the route path was not initialized.
    if (module === undefined && !NODE_ENV_IS_DEVELOPMENT) {
      continue;
    }

    // Module was not loaded yet?
    try {
      if (typeof module === "string") {
        // Production: Load and cache module only via pre-calculated path.
        // This avoids potential path traversal vulnerabilities caused
        // by unexpected `route` values.
        module = MODULE_BY_ROUTE[route] = await import(pathToFileURL(join(CWD, module)).href);
      } else if (module === undefined && NODE_ENV_IS_DEVELOPMENT) {
        // Only map module paths depending on `route` during development.
        const modulePath = join(CWD, "dist", `${route}.js`);
        if (typeof require === "function" && require.cache[modulePath]) {
          // Bun: Remove module from cache before importing
          // as query parameter for import is ignored.
          delete require.cache[modulePath];
        }
        // Use timestamp as query parameter to update modules.
        const mtime = (await stat(modulePath)).mtime.getTime();
        // Dynamic imports are restricted to development environments;
        // therefore, production-level path validation is not required here.
        module = await import(`${pathToFileURL(modulePath).href}?${mtime}`);
      }
    } catch (e) {
      // Only stat() reports a missing route module (development).
      // ERR_MODULE_NOT_FOUND isn't ignored, as it is also thrown
      // for missing imports of an existing module.
      switch ((e as any)?.code) {
        case "ENOENT":
        case "ENOTDIR":
          continue;
        default:
          // Module exists, but fails to load.
          throw e;
      }
    }

    // Store current route in request.
    request.route = route;

    // Ensure module is a valid object before processing.
    if (module && typeof module === "object") {
      response =
        typeof module.default === "function"
          ? // Call functions with context as `this` and props as parameters,
            await module.default.call(context, props)
          : // otherwise return default export.
            module.default;
    }

    if (reply.sent) {
      return;
    } else if (route.endsWith("/[404]")) {
      // Preserve existing status if a 404 page is requested directly
      // (e.g. "/a/404" answered by "/a/[404]", but not by "/[404]").
      // If no status is defined, set status to 404 automatically.
      if (
        reply.statusCode === 200 &&
        !(route.slice(0, -"[404]".length) + "404" === request.path.replace(/\/$/, ""))
      ) {
        reply.status(404);
      }
      break;
    } else if (
      typeof response === "string" ||
      response instanceof Response ||
      response instanceof Readable ||
      response instanceof ReadableStream ||
      Buffer.isBuffer(response) ||
      isJsxNode(response)
    ) {
      break;
    } else if (typeof response === "object" && route.endsWith("/[...guard]")) {
      // Add object entries from guard to props
      Object.assign(props, response);
      // Props are not a response: never send them if no other route answers.
      response = undefined;
      continue;
    } else if (response === undefined) {
      continue;
    } else {
      break;
    }
  }
  // No route answered and no [404] exists: don't reply with an empty 200.
  if (response === undefined && reply.statusCode === 200) {
    reply.status(404);
  }

  return await renderResponse(context, response);
}

// Names of special routes which must not be requested as "/a/b/[c]".
// "--metadata--" is the route and file mapping of a production build, which must
// not be served if the server runs in development mode on a production build.
const SPECIAL_SEGMENTS = new Set(["index", "...guard", "...path", "--metadata--"]);

/**
 * Generates all possible routes based on the given input path.
 *
 * Example routes for "/a/b/c":
 *
 * [
 *  "/[...guard]","/a/[...guard]","/a/b/[...guard]","/a/b/c/[...guard]",
 *  STATIC_FILE_ROUTE,
 *  "/a/b/[c]","/a/b/c/[index]",
 *  "/a/b/c/[...path]","/a/b/[...path]","/a/[...path]","/[...path]",
 *  "/a/b/c/[404]","/a/b/[404]","/a/[404]","/[404]"
 * ]
 */
function* generateRoutes(path: string): Generator<string | typeof STATIC_FILE_ROUTE> {
  // Transform given path into array of all its segments.
  // "/a/b/c" => ["", "/a", "/a/b", "/a/b/c"]
  const segments = [""];
  let edgeSegment = "";
  for (const segment of path.split("/")) {
    // Ignore redundant slashes.
    if (segment !== "") {
      edgeSegment += `/${segment}`;
      segments.push(edgeSegment);
    }
  }

  // [...guard]s are pushed from root to edge.
  for (let i = 0; i < segments.length; i++) {
    yield `${segments[i]}/[...guard]`;
  }

  // Append the marker for static files
  yield STATIC_FILE_ROUTE;

  // "/a/b/c" => ["/a/b/[c]", "/a/b/c/[index]"]
  // Special routes aren't reachable by name ("/index", "/...guard", "/...path", "/--metadata--"),
  // except "/a/404", which is answered by "/a/[404]" on purpose.
  const lastSlash = edgeSegment.lastIndexOf("/") + 1;
  const lastSegment = edgeSegment.substring(lastSlash);
  // Compared in lower case, as case-insensitive file systems (macOS, Windows) would
  // otherwise resolve e.g. "/--METADATA--" to "[--metadata--].js" in development.
  if (lastSlash > 0 && !SPECIAL_SEGMENTS.has(lastSegment.toLowerCase())) {
    yield `${edgeSegment.substring(0, lastSlash)}[${lastSegment}]`;
  }
  yield `${edgeSegment}/[index]`;

  // [...path]s are pushed from edge to root.
  for (let i = segments.length - 1; i >= 0; i--) {
    yield `${segments[i]}/[...path]`;
  }

  // [404]s are pushed from edge to root.
  for (let i = segments.length - 1; i >= 0; i--) {
    yield `${segments[i]}/[404]`;
  }
}

/**
 * Extracts the path from a request url (dropping the query string) and decodes it.
 * Backslashes become slashes (as in browsers) and repeated slashes are collapsed,
 * so a path like "//evil.com" can't be mistaken for another host, e.g. in a <base> tag.
 * Returns undefined for malformed encodings, null bytes and "." or ".." segments,
 * as browsers never send them: ".." could escape the project directory, and "."
 * would be resolved by the file system in development, but not in production.
 */
function decodePath(url: string): string | undefined {
  try {
    const index = url.indexOf("?");
    const rawPath = index === -1 ? url : url.slice(0, index);
    const path = decodeURIComponent(rawPath).replace(/[\\/]+/g, "/");
    if (path.includes("\0") || /(^|\/)\.\.?(\/|$)/.test(path)) {
      return undefined;
    }
    return path;
  } catch {
    return undefined;
  }
}

/**
 * Renders JSX as stream and applies the optional response handler to the response.
 */
async function renderResponse(context: any, response: unknown) {
  const payload = isJsxNode(response) ? await jsxToStream.call(context, response) : response;
  // Post-process the payload with an optional response handler
  const responseHandler = context["responseHandler"];
  return typeof responseHandler === "function"
    ? await responseHandler.call(context, payload)
    : payload;
}

/**
 * Returns stream and metadata for requested file.
 */
async function tryFile(request: FastifyRequest): Promise<BaseSendResult | undefined> {
  // Files can only be fetched; other methods (e.g. a POST to "/index.css") are left to the routes.
  if (request.method !== "GET" && request.method !== "HEAD") {
    return undefined;
  }

  // Production: Retrieve files only from pre-initialized mapping.
  // This avoids potential path traversal vulnerabilities caused
  // by unexpected `request.path` values.
  const file = FILE_BY_PATH[request.path];
  if (file) {
    return await sendFile(request, file);
  }

  if (NODE_ENV_IS_DEVELOPMENT) {
    for (const directory of ["dist", "public"]) {
      // Don't expose compiled server routes and their other outputs (sourcemaps, CSS).
      // Not anchored at the end, as some file systems ignore trailing dots and
      // stream names (Windows: "[index].js.", "[index].js::$DATA").
      if (directory === "dist" && /\]\./u.test(request.path)) {
        continue;
      }
      try {
        if ((await stat(join(CWD, directory, request.path))).isFile()) {
          // Dynamic path loading is restricted to development environments;
          // therefore, production-level path validation is not required here.
          return await sendFile(request, `${directory}${request.path}`);
        }
      } catch {
        continue;
      }
    }
  }

  return undefined;
}

/**
 * Prepares a file for sending. Returns undefined if there is nothing to send,
 * so routes like [...path] or [404] can answer instead of the plain error page of fastifySend.
 */
async function sendFile(
  request: FastifyRequest,
  path: string,
): Promise<BaseSendResult | undefined> {
  // fastifySend decodes the path, so it must be encoded.
  const result = await fastifySend(request.raw, encodeURI(path), FASTIFY_SEND_OPTIONS);
  // 404: file is missing or ignored, e.g. dotfiles by default.
  // Other errors (403 for denied dotfiles, 412, 416 for invalid ranges) belong to the file.
  if (result.type === "error" && result.statusCode === 404) {
    result.stream.destroy();
    return undefined;
  }
  return result;
}
