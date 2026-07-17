import fastifySend, { BaseSendResult, SendOptions } from "@fastify/send";
import fastify, {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  FastifyServerOptions,
} from "fastify";
import { jsxToString } from "jsx-async-runtime";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import env from "./env.js";

env();

const CWD = process.cwd();
const CONFIG = (await import(`file://${join(CWD, "jeasx.config.js")}`)).default;
const NODE_ENV_IS_DEVELOPMENT = process.env.NODE_ENV === "development";

// Map routes and files for non-development environments from metadata export.
// Module paths are initialized at startup but overwritten
// with resolved modules upon the first request.
const {
  routes: MODULE_BY_ROUTE,
  files: FILE_BY_PATH,
}: {
  routes: Record<string, string | { default: Function }>;
  files: Record<string, string>;
} = NODE_ENV_IS_DEVELOPMENT
  ? { routes: {}, files: {} }
  : (await import(`file://${join(CWD, "dist", "[--metadata--].js")}`)).default;

declare module "fastify" {
  interface FastifyRequest {
    /** Path without query parameters */
    path: string;
    /** Path to resolved route handler */
    route: string;
  }

  interface FastifyReply {
    /** Populated when serving a static file; otherwise undefined. */
    file?: BaseSendResult;
  }
}

const FASTIFY_SEND_OPTIONS = CONFIG.FASTIFY_SEND_OPTIONS?.() as SendOptions;

// Enhance Fastify server from userland
const FASTIFY_SERVER = (CONFIG.FASTIFY_SERVER ?? ((fastify) => fastify)) as (
  fastify: FastifyInstance,
) => FastifyInstance;

// Create and export a Fastify instance
export default FASTIFY_SERVER(
  fastify(CONFIG.FASTIFY_SERVER_OPTIONS?.() as FastifyServerOptions)
    .decorateRequest("route", "")
    .decorateRequest("path", "")
    .decorateReply("file", undefined)
    .addHook("onRequest", async (request) => {
      // Extract path from url
      const index = request.url.indexOf("?");
      request.path = index === -1 ? request.url : request.url.slice(0, index);
    })
    .all("*", async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const payload = await handler(request, reply);
        if (
          reply.getHeader("content-type") === undefined &&
          (typeof payload === "string" || Buffer.isBuffer(payload))
        ) {
          reply.type("text/html; charset=utf-8");
        }
        return payload;
      } catch (error) {
        request.log.error(error);
        throw error;
      }
    }),
);

/**
 * Resolves route module based on the request path and execute it.
 */
async function handler(request: FastifyRequest, reply: FastifyReply) {
  let response: unknown;

  // Global context object for route handlers
  const context: any = {};

  // Default props for route handlers
  const props = { request, reply };

  try {
    // Check for static file and store result for later processing.
    reply.file = await tryFile(request);

    // Execute route handlers for current request
    for (const route of generateRoutes(request.path)) {
      // Try to serve static file when route matches path.
      if (route === request.path) {
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
          module = MODULE_BY_ROUTE[route] = await import(`file://${join(CWD, module)}`);
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
          module = await import(`file://${modulePath}?${mtime}`);
        }
      } catch (e) {
        switch ((e as any)?.code) {
          case "ENOENT":
          case "ENOTDIR":
          case "ERR_MODULE_NOT_FOUND":
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
        // Preserve existing status if a 404 page is requested directly.
        // If no status is defined, set status to 404 automatically.
        if (reply.statusCode === 200 && !request.path.endsWith("/404")) {
          reply.status(404);
        }
        break;
      } else if (
        typeof response === "string" ||
        response instanceof Readable ||
        Buffer.isBuffer(response) ||
        isJSX(response)
      ) {
        break;
      } else if (route.endsWith("/[...guard]") && typeof response === "object") {
        // Add object entries from guard to props
        Object.assign(props, response);
        continue;
      } else if (response === undefined || reply.statusCode === 404) {
        continue;
      } else {
        break;
      }
    }

    return await renderResponse(context, response);
  } catch (error) {
    const errorHandler = context["errorHandler"];
    if (typeof errorHandler === "function") {
      reply.status(500);
      response = await errorHandler.call(context, error);
      return await renderResponse(context, response);
    } else {
      throw error;
    }
  }
}

/**
 * Generates all possible routes based on the given input path.
 *
 * Example routes for "/a/b/c":
 *
 * [
 *  "/[...guard]","/a/[...guard]","/a/b/[...guard]","/a/b/c/[...guard]",
 *  "/a/b/c",
 *  "/a/b/[c]","/a/b/c/[index]",
 *  "/a/b/c/[...path]","/a/b/[...path]","/a/[...path]","/[...path]",
 *  "/a/b/c/[404]","/a/b/[404]","/a/[404]","/[404]"
 * ]
 */
function generateRoutes(path: string): string[] {
  const routes = [];

  // Transform given path into array of all its segments.
  // "/a/b/c" => ["", "/a", "/a/b/", "/a/b/c"]
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
    routes.push(`${segments[i]}/[...guard]`);
  }

  // Append the verbatim path for static file serving.
  routes.push(path);

  // "/a/b/c" => ["/a/b/[c]", "/a/b/c/[index]"]
  const lastSlash = edgeSegment.lastIndexOf("/") + 1;
  if (lastSlash > 0) {
    routes.push(`${edgeSegment.substring(0, lastSlash)}[${edgeSegment.substring(lastSlash)}]`);
  }
  routes.push(`${edgeSegment}/[index]`);

  // [...path]s are pushed from edge to root.
  for (let i = segments.length - 1; i >= 0; i--) {
    routes.push(`${segments[i]}/[...path]`);
  }

  // [404]s are pushed from edge to root.
  for (let i = segments.length - 1; i >= 0; i--) {
    routes.push(`${segments[i]}/[404]`);
  }

  return routes;
}

/**
 * Determines if a given object is a JSX element.
 */
function isJSX(obj: unknown): boolean {
  return !!obj && typeof obj === "object" && "type" in obj && "props" in obj;
}

/**
 * Renders JSX to string and applies optional response handler.
 */
async function renderResponse(context: any, response: unknown) {
  const payload = isJSX(response)
    ? await jsxToString.call(context, response as JSX.Element)
    : response;

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
  // Production: Retrieve files only from pre-initialized mapping.
  // This avoids potential path traversal vulnerabilities caused
  // by unexpected `request.path` values.
  const file = FILE_BY_PATH[request.path];
  if (file) {
    return await fastifySend(request.raw, file, FASTIFY_SEND_OPTIONS);
  }

  if (NODE_ENV_IS_DEVELOPMENT) {
    for (const directory of ["dist", "public"]) {
      try {
        if ((await stat(join(CWD, directory, request.path))).isFile()) {
          // Dynamic path loading is restricted to development environments;
          // therefore, production-level path validation is not required here.
          return await fastifySend(
            request.raw,
            `${directory}${request.path}`,
            FASTIFY_SEND_OPTIONS,
          );
        }
      } catch {
        continue;
      }
    }
  }

  return undefined;
}
