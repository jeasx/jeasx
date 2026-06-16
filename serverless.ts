import fastifyCookie, { FastifyCookieOptions } from "@fastify/cookie";
import fastifyFormbody, { FastifyFormbodyOptions } from "@fastify/formbody";
import fastifyMultipart, { FastifyMultipartOptions } from "@fastify/multipart";
import fastifyStatic, { FastifyStaticOptions } from "@fastify/static";
import fastify, {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  FastifyServerOptions,
} from "fastify";
import { jsxToString } from "jsx-async-runtime";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import env from "./env.js";

env();

const CWD = process.cwd();
const CONFIG = (await import(`file://${join(CWD, "jeasx.config.js")}`)).default;
const NODE_ENV_IS_DEVELOPMENT = process.env.NODE_ENV === "development";

// Cache for route modules used in non-development environments.
const MODULE_BY_ROUTE: Record<string, { default: Function }> = {};

// Initialize the cache with `null` for all known modules.
// Modules are lazily loaded on their first request for a specific route.
// Only routes explicitly initialized with `null` will be loaded.
if (!NODE_ENV_IS_DEVELOPMENT) {
  const { routes } = (await import(`file://${join(CWD, "dist", "[--metadata--].js")}`)).default as {
    routes: string[];
  };
  routes.forEach((route) => (MODULE_BY_ROUTE[route] = null));
}

declare module "fastify" {
  interface FastifyRequest {
    path: string; // Path without query parameters
    route: string; // Path to resolved route handler
  }
}

// Enhance Fastify server from userland
const FASTIFY_SERVER = (CONFIG.FASTIFY_SERVER ?? ((fastify) => fastify)) as (
  fastify: FastifyInstance,
) => FastifyInstance;

// Create and export a Fastify instance
export default FASTIFY_SERVER(
  fastify({
    ...(CONFIG.FASTIFY_SERVER_OPTIONS?.() as FastifyServerOptions),
  }),
)
  // Create encapsulation context
  .register((fastify) => {
    fastify
      .register(fastifyCookie, {
        ...(CONFIG.FASTIFY_COOKIE_OPTIONS?.() as FastifyCookieOptions),
      })
      .register(fastifyFormbody, {
        ...(CONFIG.FASTIFY_FORMBODY_OPTIONS?.() as FastifyFormbodyOptions),
      })
      .register(fastifyMultipart, {
        ...(CONFIG.FASTIFY_MULTIPART_OPTIONS?.() as FastifyMultipartOptions),
      })
      .register(fastifyStatic, {
        root: ["public", "dist"].map((dir) => join(CWD, dir)),
        wildcard: false,
        globIgnore: ["/**/\\[*\\].js?(.map)"],
        ...(CONFIG.FASTIFY_STATIC_OPTIONS?.() as FastifyStaticOptions),
      })
      .decorateRequest("route", "")
      .decorateRequest("path", "")
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
      });
  });

/**
 * Resolves route module based on the request path and execute it.
 */
async function handler(request: FastifyRequest, reply: FastifyReply) {
  let response: unknown;

  // Global context object for route handlers
  const context = {};

  // Default props for route handlers
  const props = { request, reply };

  try {
    // Execute route handlers for current request
    for (const route of generateRoutes(request.path)) {
      // Resolve module via cache
      let module = MODULE_BY_ROUTE[route];

      // Skip loading the module if the route path was not initialized.
      // This avoids potential path traversal vulnerabilities caused
      // by unexpected `route` values.
      if (module === undefined && !NODE_ENV_IS_DEVELOPMENT) {
        continue;
      }

      // Module was not loaded yet?
      if (module === null || (NODE_ENV_IS_DEVELOPMENT && module === undefined)) {
        try {
          const modulePath = join(CWD, "dist", `${route}.js`);
          if (NODE_ENV_IS_DEVELOPMENT) {
            if (typeof require === "function" && require.cache[modulePath]) {
              // Bun: Remove module from cache before importing
              // as query parameter for import is ignored.
              delete require.cache[modulePath];
            }
            // Use timestamp as query parameter to update modules.
            const mtime = (await stat(modulePath)).mtime.getTime();
            module = await import(`file://${modulePath}?${mtime}`);
          } else {
            // Load and cache module for non-development
            module = await import(`file://${modulePath}`);
            MODULE_BY_ROUTE[route] = module;
          }
        } catch (e) {
          switch (e.code) {
            case "ENOENT":
            case "ENOTDIR":
            case "ERR_MODULE_NOT_FOUND":
              continue;
            default:
              // Module exists, but fails to load.
              throw e;
          }
        }
      }

      // Store current route in request
      request.route = route;

      // Call functions with 'this' context and props as parameters
      // otherwise return default export
      response =
        typeof module.default === "function"
          ? await module.default.call(context, props)
          : module.default;

      if (reply.sent) {
        return;
      } else if (route.endsWith("/[404]")) {
        // Preserve existing status if a 404 page is requested directly.
        // If no status is defined, set status to 404 automatically.
        if (reply.statusCode === 200 && !request.path.endsWith("/404")) {
          reply.status(404);
        }
        break;
      } else if (typeof response === "string" || Buffer.isBuffer(response) || isJSX(response)) {
        break;
      } else if (
        route.endsWith("/[...guard]") &&
        (response === undefined || typeof response === "object")
      ) {
        // Add object entries from guard to props
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

/**
 * Generates all possible routes based on the given input path.
 *
 * Example routes for "/a/b/c":
 *
 * [
 *  "/[...guard]","/a/[...guard]","/a/b/[...guard]","/a/b/c/[...guard]",
 *  "/a/b/[c]","/a/b/c/[index]",
 *  "/a/b/c/[...path]","/a/b/[...path]","/a/[...path]","/[...path]",
 *  "/a/b/c/[404]","/a/b/[404]","/a/[404]","/[404]"
 * ]
 */
function generateRoutes(path: string): string[] {
  const routes = [];

  // Transform given path into array of all its segments.
  // "/a/b/c" => ["/a/b/c", "/a/b", "/a", ""]
  const segments = [""];
  let current = "";
  for (const segment of path.split("/").filter(Boolean)) {
    current += `/${segment}`;
    segments.push(current);
  }
  segments.reverse();

  // [...guard]s are evaluated from top to bottom
  for (let i = segments.length - 1; i >= 0; i--) {
    routes.push(`${segments[i]}/[...guard]`);
  }

  // "/a/b/c" => ["/a/b/[c]", "/a/b/c/[index]"]
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
  const payload = isJSX(response) ? await jsxToString.call(context, response) : response;

  // Post-process the payload with an optional response handler
  const responseHandler = context["responseHandler"];
  return typeof responseHandler === "function"
    ? await responseHandler.call(context, payload)
    : payload;
}
