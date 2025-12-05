import fastifyCookie, { FastifyCookieOptions } from "@fastify/cookie";
import fastifyFormbody, { FastifyFormbodyOptions } from "@fastify/formbody";
import fastifyMultipart, { FastifyMultipartOptions } from "@fastify/multipart";
import fastifyStatic, { FastifyStaticOptions } from "@fastify/static";
import Fastify, {
  FastifyReply,
  FastifyRequest,
  FastifyServerOptions,
} from "fastify";
import { jsxToString } from "jsx-async-runtime";
import { stat } from "node:fs/promises";
import { freemem } from "node:os";
import { join } from "node:path";
import env from "./env.js";

await env();

const CWD = process.cwd();
const NODE_ENV_IS_DEVELOPMENT = process.env.NODE_ENV === "development";
const JEASX_ROUTE_CACHE_LIMIT = Math.floor(freemem() / 1024 / 1024);

declare module "fastify" {
  interface FastifyRequest {
    path: string; // Path without query parameters
    route: string; // Path to resolved route handler
  }
}

// Create and export a Fastify app instance
export default Fastify({
  logger: true,
  ...(jsonToOptions(
    process.env.FASTIFY_SERVER_OPTIONS
  ) as FastifyServerOptions),
})
  .register(fastifyCookie, {
    ...(jsonToOptions(
      process.env.FASTIFY_COOKIE_OPTIONS
    ) as FastifyCookieOptions),
  })
  .register(fastifyFormbody, {
    ...(jsonToOptions(
      process.env.FASTIFY_FORMBODY_OPTIONS
    ) as FastifyFormbodyOptions),
  })
  .register(fastifyMultipart, {
    attachFieldsToBody: "keyValues",
    ...(jsonToOptions(
      process.env.FASTIFY_MULTIPART_OPTIONS
    ) as FastifyMultipartOptions),
  })
  .register(fastifyStatic, {
    root: [["public"], ["dist", "browser"]].map((dir) => join(CWD, ...dir)),
    prefix: "/",
    wildcard: false,
    preCompressed: true,
    ...(jsonToOptions(
      process.env.FASTIFY_STATIC_OPTIONS
    ) as FastifyStaticOptions),
  })
  .decorateRequest("route", "")
  .decorateRequest("path", "")
  .addHook("onRequest", async (request, reply) => {
    // Set default content type to text/html
    reply.header("Content-Type", "text/html; charset=utf-8");
    // Extract path from url
    const index = request.url.indexOf("?");
    request.path = index === -1 ? request.url : request.url.slice(0, index);
  })
  .all("*", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      return await handler(request, reply);
    } catch (error) {
      console.error("❌", error);
      throw error;
    }
  });

/**
 * Parses JSON and instantiates all stringified functions.
 */
function jsonToOptions(json: string) {
  const options = JSON.parse(json || "{}");
  for (const key in options) {
    if (typeof options[key] === "string" && options[key].includes("=>")) {
      try {
        options[key] = new Function(`return ${options[key]}`)();
      } catch (error) {
        console.warn("⚠️", error);
      }
    }
  }
  return options;
}

// Cache for resolved route modules, 'null' means no module exists.
const modules = new Map<string, { default: Function }>();

/**
 * Resolves route module based on the request path and execute it.
 */
async function handler(request: FastifyRequest, reply: FastifyReply) {
  let response: unknown;

  // Global context object for route handlers
  const context = {};

  try {
    // Execute route handlers for current request
    for (const route of generateRoutes(request.path)) {
      // Resolve module via cache
      let module = modules.get(route);

      // Module was cached as not found?
      if (module === null) {
        continue;
      }

      // Module was not loaded yet?
      if (module === undefined) {
        try {
          const modulePath = join(CWD, "dist", "server", `${route}.js`);
          if (NODE_ENV_IS_DEVELOPMENT) {
            if (typeof require === "function") {
              // Bun: Remove module from cache before importing
              // as query parameter for import is ignored (see Node.js).
              if (require.cache[modulePath]) {
                delete require.cache[modulePath];
              }
              module = await import(`file://${modulePath}`);
            } else {
              // Node.js: Use timestamp as query parameter to update modules.
              const mtime = (await stat(modulePath)).mtime.getTime();
              module = await import(`file://${modulePath}?${mtime}`);
            }
          } else {
            // Load and cache module for non-development
            module = await import(`file://${modulePath}`);
            modules.set(route, module);
          }
        } catch {
          if (!NODE_ENV_IS_DEVELOPMENT) {
            // Cache module as not found
            modules.set(route, null);
          }
          continue;
        } finally {
          // Remove oldest entry from cache if limit is reached
          if (modules.size > JEASX_ROUTE_CACHE_LIMIT) {
            modules.delete(modules.keys().next().value);
          }
        }
      }

      // Store current route in request
      request.route = route;

      // Call the handler with request, reply and optional props
      response = await module.default.call(context, {
        request,
        reply,
        ...(typeof response === "object" ? response : {}),
      });

      if (reply.sent) {
        return;
      } else if (route.endsWith("/[404]")) {
        reply.status(404);
        break;
      } else if (
        typeof response === "string" ||
        Buffer.isBuffer(response) ||
        isJSX(response)
      ) {
        break;
      } else if (
        route.endsWith("/[...guard]") &&
        (response === undefined || typeof response === "object")
      ) {
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

/**
 * Generates all possible routes based on the given input path.
 */
function generateRoutes(path: string): string[] {
  // "/a/b/c" => ["/a/b/c", "/a/b", "/a", ""]
  const segments = generateSegments(path);

  // "/a/b/c" => ["/a/b/[c]", "/a/b/c/[index]"]
  const edges = generateEdges(segments[0]);

  return [
    ...segments
      .toReversed() // [...guard]s are evaluated from top to bottom
      .map((segment) => `${segment}/[...guard]`),
    ...edges.map((edge) => `${edge}`),
    ...segments.map((segment) => `${segment}/[...path]`),
    ...segments.map((segment) => `${segment}/[404]`),
  ];
}

/**
 * Transforms a given path into an array of all its segments.
 *
 * @example
 * generateSegments("/a/b/c") => ["/a/b/c", "/a/b", "/a", ""]
 */
function generateSegments(path: string): string[] {
  return path
    .split("/")
    .filter((segment) => segment !== "")
    .reduce((acc, segment) => {
      acc.push((acc.length > 0 ? acc[acc.length - 1] : "") + "/" + segment);
      return acc;
    }, [])
    .reverse()
    .concat("");
}

/**
 * Generates edge routes for the given input path.
 *
 * An edge is either a route with a named segment (e.g. "/a/b/[c]")
 * or a route with an "index" segment (e.g. "/a/b/c/[index]").
 */
function generateEdges(path: string): string[] {
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

/**
 * Determines if a given object is a JSX element.
 */
function isJSX(obj: unknown): boolean {
  return !!obj && typeof obj === "object" && "type" in obj && "props" in obj;
}

/**
 * Renders JSX to string and applies optional response handler.
 */
async function renderJSX(context: object, response: unknown) {
  const payload = isJSX(response)
    ? await jsxToString.call(context, response)
    : response;

  // Post-process the payload with an optional response handler
  const responseHandler = context["responseHandler"];
  return typeof responseHandler === "function"
    ? await responseHandler.call(context, payload)
    : payload;
}
