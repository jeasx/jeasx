import fastifyCookie from "@fastify/cookie";
import fastifyFormbody from "@fastify/formbody";
import fastifyMultipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import "dotenv-flow/config";
import Fastify, { FastifyReply, FastifyRequest } from "fastify";
import { jsxToString } from "jsx-async-runtime";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { readdirSync } from 'node:fs';
import { glob } from 'glob';

const NODE_ENV_IS_DEVELOPMENT = process.env.NODE_ENV === "development";

// Create a Fastify app instance
const serverless = Fastify({
  logger: true,
  disableRequestLogging: NODE_ENV_IS_DEVELOPMENT,
  bodyLimit: Number(process.env.FASTIFY_BODY_LIMIT) || undefined,
});

// Register required plugins
serverless.register(fastifyCookie);
serverless.register(fastifyFormbody);
serverless.register(fastifyMultipart);

// Add type for the static headers
interface StaticHeaders {
  [suffix: string]: {
    [header: string]: string;
  };
}

// Type the headers properly
const FASTIFY_STATIC_HEADERS: StaticHeaders | undefined = process.env.FASTIFY_STATIC_HEADERS
  ? JSON.parse(String(process.env.FASTIFY_STATIC_HEADERS))
  : undefined;

// Setup static file plugin
serverless.register(fastifyStatic, {
  root: ["public", "dist/browser"].map((dir) => join(process.cwd(), dir)),
  prefix: "/",
  wildcard: false,
  cacheControl: false,
  setHeaders: FASTIFY_STATIC_HEADERS
    ? (reply, path) => {
        for (const [suffix, headers] of Object.entries(FASTIFY_STATIC_HEADERS)) {
          if (path.endsWith(suffix)) {
            for (const [key, value] of Object.entries(headers as Record<string, string>)) {
              reply.setHeader(key, value);
            }
            return;
          }
        }
      }
    : undefined,
});

// Add path without query parameters to request
declare module "fastify" {
  interface FastifyRequest {
    path: string;
  }
}

serverless.decorateRequest("path", "");
serverless.addHook("onRequest", async (request, reply) => {
  const index = request.url.indexOf("?");
  request.path = index === -1 ? request.url : request.url.slice(0, index);
});

interface RouteHandler {
  path: string;
  type: 'guard' | 'edge' | 'path' | '404';
  priority: number;
  modulePath: string;
}

// Initialize route map at startup
const routeMap = new Map<string, RouteHandler[]>();

// Build the route map when the server starts
async function buildRouteMap() {
  const routesDir = join(process.cwd(), 'dist/routes');
  
  // Find all route files - now including ts, tsx, and jsx files
  const routeFiles = await glob('**/*.{js,ts,jsx,tsx}', { 
    cwd: routesDir,
    absolute: true 
  });

  for (const file of routeFiles) {
    // Remove any extension (.js, .ts, .jsx, .tsx)
    const relativePath = file
      .replace(routesDir, '')
      .replace(/\.(js|ts|jsx|tsx)$/, '');
    
    // Determine route type and priority
    let type: RouteHandler['type'];
    let priority: number;
    
    if (relativePath.endsWith('/[...guard]')) {
      type = 'guard';
      priority = 1;
    } else if (relativePath.endsWith('/[index]') || relativePath.match(/\/\[\w+\]$/)) {
      type = 'edge';
      priority = 2;
    } else if (relativePath.endsWith('/[...path]')) {
      type = 'path';
      priority = 3;
    } else if (relativePath.endsWith('/[404]')) {
      type = '404';
      priority = 4;
    } else {
      continue;
    }

    const routePath = relativePath
      .replace(/\/\[(?:\.\.\.)?[\w]+\]$/, '')
      .replace(/\\/g, '/');

    if (!routeMap.has(routePath)) {
      routeMap.set(routePath, []);
    }

    // Get the corresponding JavaScript file path
    // This is important because TypeScript files are compiled to JavaScript
    const jsFilePath = file
      .replace(/\.(ts|tsx|jsx)$/, '.js')
      .replace(/\\/g, '/');

    routeMap.get(routePath)!.push({
      path: relativePath,
      type,
      priority,
      modulePath: jsFilePath // Use the JavaScript file path
    });
  }

  // Sort handlers by priority for each path
  for (const handlers of routeMap.values()) {
    handlers.sort((a, b) => a.priority - b.priority);
  }
}

// Build route map at startup
await buildRouteMap();

// Add types for the context
interface RouteContext {
  response?: (payload: unknown) => Promise<unknown> | unknown;
  [key: string]: unknown;
}

// Add types for the route handler props
interface RouteHandlerProps {
  request: FastifyRequest;
  reply: FastifyReply;
  [key: string]: unknown;
}

// Handle all requests
serverless.all('*', async (request, reply) => {
  let response: unknown;
  const context: RouteContext = {};

  // Get clean path without query parameters
  const requestPath = request.path;
  
  // Add type for path segments reduction
  type PathSegments = string[];

  // Update the pathSegments reduction with proper typing
  const pathSegments = requestPath
    .split('/')
    .reduce<PathSegments>((segments, part) => {
      if (!part) return segments;
      const lastSegment = segments[segments.length - 1] || '';
      segments.push(lastSegment + '/' + part);
      return segments;
    }, ['']);

  // Try each path segment from most specific to least specific
  for (const segment of [...pathSegments].reverse()) {
    const handlers = routeMap.get(segment);
    if (!handlers) continue;

    // Try each handler in priority order
    for (const handler of handlers) {
      const modulePath = handler.modulePath;

      try {
        // Build content hash in development for hot reloading
        const hash = NODE_ENV_IS_DEVELOPMENT
          ? '?' + createHash('sha1')
              .update(await readFile(modulePath, 'utf-8'))
              .digest('hex')
          : '';

        // Import and execute the handler
        response = await (await import(`file://${modulePath}${hash}`))
          .default.call(context, {
            request,
            reply,
            ...(typeof response === 'object' ? response : {})
          });

        if (reply.sent) {
          return;
        } else if (typeof response === 'string' || Buffer.isBuffer(response)) {
          return sendResponse();
        } else if (
          handler.type === 'guard' &&
          (response === undefined || !isJSX(response))
        ) {
          continue; // Try next handler
        } else if (handler.type === '404') {
          reply.status(404);
          return sendResponse();
        } else if (reply.statusCode === 404) {
          continue; // Try next handler
        } else {
          return sendResponse();
        }
      } catch (err) {
        request.log.error(err);
        continue; // Try next handler
      }
    }
  }

  // If we get here, no handler was found
  reply.status(404);
  return sendResponse();

  // Helper function to send the final response
  async function sendResponse(): Promise<unknown> {
    if (!reply.hasHeader('Content-Type')) {
      reply.header('Content-Type', 'text/html; charset=utf-8');
    }

    const payload = isJSX(response)
      ? await jsxToString.call(context, response)
      : response;

    const responseHandler = context['response'] as RouteContext['response'];
    return typeof responseHandler === 'function'
      ? await responseHandler(payload)
      : payload;
  }

  // Update isJSX function with proper typing
  function isJSX(obj: unknown): boolean {
    return typeof obj === 'object' && 
           obj !== null && 
           'type' in obj && 
           'props' in obj;
  }
});

export default serverless;
