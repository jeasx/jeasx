# Changelog

## 2026-XX-XX - Jeasx 2.3.0 released

🎉 This release introduces support for [MDX](https://mdxjs.com), enabling you to seamlessly embed JSX within Markdown content. Just create a route with a `.mdx` extension, and you’re all set to enhance your websites and blogs with Markdown enriched by dynamic JSX components.

```mdx
import Layout from "./Layout"

<Layout title="MDX is cool">
# Rendering MDX with Jeasx is easy

You can easily access existing `props` in MDX, e.g. {props.request.url}.
</Layout>
```

You can also create MDX-based components for use within JSX by importing them with their full `.mdx` file extension into your JSX routes or components.

Since MDX supports a variety of plugins - and Jeasx installs only the MDX core to stay focused on infrastructure while letting users handle customization - the overall configuration for Jeasx has been significantly improved. Now, the configuration object from an `.env.js` file is imported directly into both the build process and server runtime, allowing you to use package imports seamlessly. Previously, (de)serializing the configuration via `process.env` restricted this capability and limited complex setups.

Here’s an example of how to configure the MDX engine: if you want to enable GitHub-flavored Markdown (`remark-gfm`), add syntax highlighting (`rehype-prism-plus`), and generate IDs for your headings (`rehype-slug`), you can install and configure these plugins accordingly. For a full overview of available configuration options and plugins, check out the excellent documentation of [@mdx-js/esbuild](https://mdxjs.com/packages/esbuild).

```js
import rehypePrismPlus from "rehype-prism-plus";
import rehypeSlug from "rehype-slug";
import remarkGFM from "remark-gfm";

export default {
  /** @type import("@mdx-js/esbuild").Options */
  ESBUILD_MDX_OPTIONS: {
    remarkPlugins: [[remarkGFM, { singleTilde: false }]],
    rehypePlugins: [rehypePrismPlus, [rehypeSlug, { prefix: "jeasx-" }]]
  }
  //...
}
```

**Breaking change:** The update to the Jeasx configuration introduced a minor change in how `ESBUILD_BROWSER_TARGET` is specified to ensure consistency across the configuration. Previously, a comma-separated string was accepted and parsed. Going forward, you must provide a proper JSON array (or its stringified form when using traditional `.env*` files or the process environment).

```js
{
  /** @type import("esbuild").BuildOptions["target"] */
  ESBUILD_BROWSER_TARGET: ["chrome130", "edge130", "firefox130", "safari18"]
}
```

Dependency updates: `fastify@5.7.2`, `@fastify/multipart@9.4.0`

## 2026-01-17 - Jeasx 2.2.2 released

🎉 This release now preserves the original status code when a 404 page is accessed directly (defaults to 200). This improvement makes it easier to use Jeasx as a static site generator and to fetch the 404 page with common tools for saving it to a file system.

While Jeasx is fundamentally a server-side rendering framework, there are valid use cases where serving a static page alone is sufficient. For example, you can use `wget` to download a Jeasx website to a www-directory with just a single line:

```bash
wget --mirror --page-requisites --no-host-directories --directory-prefix=www http://localhost:3000 http://localhost:3000/404
```

Have a look at the [Dockerfile](https://github.com/jeasx/jeasx-website/blob/main/Dockerfile) of the Jeasx website to see how things can be wired up for serving a static export with Caddy as web server.

If you want to restore the old behaviour (directly calling /404 resulting in status code 404), you can simple add `reply.status(404)` to your `/[404]` handler.

Dependency updates: `fastify@5.7.1`, `@fastify/static@9.0.0`, `@types/node@24.10.9`

## 2025-12-21 - Jeasx 2.2.1 released

🎉 Just a patch release with a minor cleanup for explicit path joins in `serverless.ts`.

Dependency updates: `esbuild@0.27.2`, `jsx-async-runtime@2.0.2`, `@types/node@24.10.4`

## 2025-12-01 - Jeasx 2.2.0 released

🎉 This release introduces a more flexible configuration approach for the underlying Fastify server. You can now customize all Fastify options (including those for all used plugins) according to your needs, without having to use the formerly fixed and very restrictive set of environment variables. This change was made to eliminate the need for increasingly specific environment variables to customise the default behaviour of Jeasx.

**Breaking change**: The previously supported environment variables (~~`FASTIFY_​BODY_​LIMIT, FASTIFY_​DISABLE_​REQUEST_​LOGGING, FASTIFY_​REWRITE_​URL, FASTIFY_​STATIC_​HEADERS, FASTIFY_​TRUST_​PROXY, FASTIFY_​MULTIPART_​ATTACH_​FIELDS_​TO_​BODY`~~) have been completely removed. While this may seem inconvenient for a minor release, the process of migrating your setup to the new configuration approach usually takes less than a minute. This streamlines the code base and documentation, as these features are presumably seldom used.

To configure Fastify (or a specific plugin), you can now use simple JSON objects which mirror the corresponding Fastify options. Have a look at the linked Fastify documentation for a reference of all existing options:

- [`FASTIFY_SERVER_OPTIONS`](https://fastify.dev/docs/latest/Reference/Server/)
- [`FASTIFY_COOKIE_OPTIONS`](https://github.com/fastify/fastify-cookie#options)
- [`FASTIFY_FORMBODY_OPTIONS`](https://github.com/fastify/fastify-formbody#options)
- [`FASTIFY_MULTIPART_OPTIONS`](https://github.com/fastify/fastify-multipart#options)
- [`FASTIFY_STATIC_OPTIONS`](https://github.com/fastify/fastify-static#options)

To optimise the developer experience, it is highly recommended that you use the recently introduced `.env.js` file to provide these configuration options. Alternatively, you can also provide them via `.env` or your process environment. Jeasx comes with a minimal set of reasonable [Fastify defaults](https://github.com/jeasx/jeasx/blob/main/serverless.ts), but you can also overwrite them if necessary.

Some Fastify options, such as `rewriteUrl` or `setHeaders`, take a function as a parameter. Jeasx supports this use case by deserialising the stringified function code when the server starts up.

### Example configuration

```js
const NODE_ENV_IS_DEVELOPMENT = process.env.NODE_ENV === "development";

export default {
  /** @type import("fastify").FastifyServerOptions */
  FASTIFY_SERVER_OPTIONS: {
    disableRequestLogging: NODE_ENV_IS_DEVELOPMENT,
    bodyLimit: 2 * 1024 * 1024,
    rewriteUrl: (req) => String(req.url).replace(/^\/jeasx/, ""),
  },

  /** @type import("@fastify/static").FastifyStaticOptions */
  FASTIFY_STATIC_OPTIONS: {
    maxAge: NODE_ENV_IS_DEVELOPMENT ? 0 : "365d",
  },

  /** @type import("@fastify/cookie").FastifyCookieOptions */
  // FASTIFY_COOKIE_OPTIONS: {},

  /** @type import("@fastify/formbody").FastifyFormbodyOptions */
  // FASTIFY_FORMBODY_OPTIONS: {},

  /** @type import("@fastify/multipart").FastifyMultipartOptions */
  // FASTIFY_MULTIPART_OPTIONS: {},
};
```

Another improvement has been made by introducing an automatic approach to determine the maximum size of the internal route cache. Depending on the amount of free memory available at startup, the maximum number of cache entries is calculated. This approach strikes a balance, ensuring the cache is large enough for large-scale projects while keeping maximum memory consumption within reasonable limits given the available resources. This means that you no longer need to worry about providing ~~`JEASX_ROUTE_CACHE_LIMIT`~~ via the environment.

Dependency updates: `@types/node@24.10.1`

## 2025-11-10 - Jeasx 2.1.1 released

🎉 Enhanced configuration for @fastify/static, so you can serve pre-compressed static files (see <https://github.com/fastify/fastify-static?tab=readme-ov-file#precompressed>) from `public` and `dist/browser`. Just run `gzip -rk public dist/browser` as post build for gzipping your static assets. This might be useful if you don't want to run a reverse proxy in front of your Jeasx application and serve compressed files nevertheless. Setting up compression for dynamic content can be wired up in userland via a root guard:

```js
import { promisify } from "node:util";
import { gzip } from "node:zlib";

export default function ({ request, reply }) {
  this.responseHandler = (payload) => {
    if (
      typeof payload === "string" &&
      request.headers["accept-encoding"]?.includes("gzip")
    ) {
      reply.header("content-encoding", "gzip");
      return promisify(gzip)(payload);
    } else {
      return payload;
    }
  };
}
```

Updated `moduleResolution` to `bundler` in `tsconfig.json`.

Dependency updates: `jsx-async-runtime@2.0.1`, `fastify@5.6.2`, `esbuild@0.27.0`, `@types/node@24.9.2`

## 2025-10-28 - Jeasx 2.1.0 released

🎉 Environment vars can now be loaded from a JavaScript file (`.env.js`) additionally to existing .env-files. This allows enhanced environment setups depending on your workflows.

Node 24 (LTS) is the official default runtime from now on.

Dependency updates: `@fastify/multipart@9.3.0`, `@fastify/static@8.3.0`, `@types/node@24.9.1`

## 2025-10-15 - Jeasx 2.0.1 released

🎉 This releases fixes status codes for fallback 404 routes. Due to an unnoticed bug introduced by a minor refactoring, 404-routes were delivered with `status=200`, now it is the correct `status=404` again. This might impact your SEO score, so an update is highly recommended.

Dependency updates: `esbuild@0.25.11`

## 2025-10-12 - Jeasx 2.0.0 released

🎉 Approximately one year after the release of Jeasx 1.0 I'm proud to announce the release of Jeasx 2.0.

It's a funny story... every time I think Jeasx is feature-complete, there is still some more room to improve. Although the main idea behind Jeasx development still holds true: focus on a lean and stable core and let developers do all their magic in userland.

This release is focused on security and comes with a major breaking change: all HTML markup is escaped by default from now on, so you don't have to escape dangerous user input on your own anymore. This way the developer experience is improved and the actual performance costs for automatic escaping are neglible due to the reuse of the highly optimized fast-escape-html library.

If you need to include literal HTML in your JSX templates (e.g. HTML snippets from a CMS), you can use a special object syntax to opt out of escaping: `{{ html: "<p>Some HTML from a CMS</p>" }}`

If you want to migrate from Jeasx 1.0 to Jeasx 2.0 with automatic HTML escaping enabled, you'll need to remove all calls to #escapeEntities() and modify the HTML declaration in your layouts (`{{ html: <!DOCTYPE html>" }}`). Then you should check where you need to render literal HTML (or other code) and apply the required changes to opt out of escaping (e.g. `<div>{ wysiwygContent }</div>; to <div>{{ html: wysiwygContent }}</div>`).

If you want to restore the non-escaping behaviour of Jeasx &lt; v2, you can set `jsxEscapeHTML = false` in the root guard. This way HTML escaping is disabled globally.

Another internal change is the renaming of the directories in the output directory (`dist`): `routes` is now called `server` alongside the `browser` directory.

Dependency updates: `jsx-async-runtime@2.0.0, @types/node@22.18.10`

## 2025-09-29 - Jeasx 1.9.0 released

🎉 This release drops the constraint that you had to put all routes into a dedicated routes-directory and all JavaScript & CSS into a dedicated browser-directory. From now on you can use any directory layout in your projects as you like. You can still use the proven `browser/routes` layout, but you don't have to.

This feature enables the co-location of server and browser code in the same directory which might be a better default for your workflows.

The only remaining constraint is to mark server routes with brackets (e.g. `[news].jsx`) and browser-bundled assets as index-files (e.g. `index.js` or `index.css`).

Please note: This feature is enabled by dropping the hard coded outbase-directories in the esbuild configuration. If the outbase directory isn't specified, it defaults to the lowest common ancestor directory among all input entry point paths.

If you run into an edge case (e.g. your browser bundles won't load anymore), here's how to fix it: if you store all your assets in browser/assets and request your assets via `/assets/...`, this won't work anymore, because assets is now the lowest common ancestor directory and is removed by esbuild. Simple fix: just put an empty `index.js` into browser directory, so this directory is lowest common ancestor directory again.

Bumbed the default `ESBUILD_BROWSER_TARGET` to `"chrome130", "edge130", "firefox130", "safari18"`.

Dependency updates: `fastify@5.6.1, esbuild@0.25.10, @types/node@22.18.6`

## 2025-09-11 - Jeasx 1.8.6 released

🎉 This release bumps dependencies to the latest and greatest versions.

Dependency updates: `fastify@5.6.0, fastify/multipart@9.2.1, @types/node@22.18.1`

## 2025-08-13 - Jeasx 1.8.5 released

🎉 This release bumps dependencies to the latest and greatest versions.

Dependency updates: `fastify@5.5.0, jsx-async-runtime@1.0.4, esbuild@0.25.9, @types/node@22.17.1`

## 2025-08-03 - Jeasx 1.8.4 released

🎉 This release bumps dependencies to the latest and greatest versions.

Dependency updates: `esbuild@0.25.8, @types/node@22.17.0`

## 2025-07-11 - Jeasx 1.8.3 released

🎉 This release bumps dependencies to the latest and greatest versions.

Dependency updates: `jsx-async-runtime@1.0.3, esbuild@0.25.6, @types/node@22.16.3`

## 2025-06-13 - Jeasx 1.8.2 released

🎉 This release changes the default options for @fastify/multipart. From now on the default for `attachFieldsToBody` is `keyValues` which provides all data for form body requests (e.g. uploads) directly via request.body. Have a look at the Fastify documentation for code examples and options.

This change makes the required code for handling form body requests much easier:

```js
// Change this code...
const file = await request.file();
const upload = await file.toBuffer()
const format = file.fields["format"]["value"];

// ... to this code.
const upload = request.body["upload"];
const format = request.body["format"];
```

Please note: This change might break your code. If you want to revert to the old behaviour, you can set the following environment variable: `FASTIFY_​MULTIPART_​ATTACH_​FIELDS_​TO_​BODY=false`

Dependency updates: `fastify@5.4.0, @types/node@22.15.31`

## 2025-05-28 - Jeasx 1.8.1 released

🎉 Just some dependency updates...

Dependency updates: `jsx-async-runtime@1.0.2, fastify@5.3.3, fastify/static@8.2.0, esbuild@0.25.5, @types/node@22.15.23`

## 2025-05-12 - Jeasx 1.8.0 released

🎉 This release introduces a custom error handler to provide user-friendly error messages for internal server errors and to facilitate team notifications.

To set up an error handler, simply register it in a route of your choice:

```js
this.errorHandler = async (error) => {
  console.error("❌", error);
  return <h1>Internal error</h1>;
}
```

An error handler is called with this as context, allowing easy access to your context setup.

**Breaking change:** If you use a response handler, you'll need to change the name from this.response to this.responseHandler. This aligns the response handler with the introduced error handler. We apologize for any inconvenience, but since this is a seldom-used feature, we aim to streamline the codebase by aligning it without maintaining deprecated code.

As additional feature, a response handler is now called with this as the context, so you can access your existing context.

Dependency updates: `esbuild@0.25.4, @types/node@22.15.17`

## 2025-05-03 - Jeasx 1.7.3 released

🎉 This release introduces a performance improvement by switching the internal route-to-module cache implementation from a JavaScript object to a Map. This change allows for better management of cache entries, enabling the configuration of a maximum cache limit. To take advantage of this, a new configuration option `JEASX_ROUTE_CACHE_LIMIT` has been added.

Dependency updates: `jsx-async-runtime@1.0.1, esbuild@0.25.3, @types/node@22.15.3`

## 2025-04-21 - Jeasx 1.7.2 released

🎉 This release is brings only minor changes:

`FASTIFY_STATIC_HEADERS`: Apply all matching headers to the current path. Use an empty string ("") as first rule to set default headers, which can be overridden by more specific rules later. Please checkout the updated configuration.

Please note: You may need to adjust your existing configuration by moving the wildcard rule to the top of the JSON file to ensure it can be overridden by more specific rules defined below.
env.sh: Removed logging of loaded environment files. Minor refactoring to clean up the code.

Dependency updates: `fastify@5.3.2, @types/node@22.14.1`

## 2025-03-31 - Jeasx 1.7.1 released

🎉 This release enhances support for Bun as an alternative JavaScript runtime for both development and production. Use `bun -b dev` to start development with Jeasx and Bun. With Bun 1.2.8, the entire Jeasx expo functions without any issues. While Node.js remains the primary focus of the project, Bun support will continue to improve. Having multiple options is always beneficial.

Route loading in development has been enhanced. It now relies on the modification time of the module, eliminating the need to calculate a hash for the file content. Additionally, a redundant file existence check for route handlers has been removed, resulting in more streamlined core code.

From now on, source maps for `serverless.js` are provided to enhance debugging.

Dependency updates: `esbuild@0.25.2`

## 2025-03-27 - Jeasx 1.7.0 released

🎉 This release removes `pm2` as a dependency and utilizes the powerful file watching capabilities of esbuild directly. This enhancement significantly improves build performance because esbuild only re-compiles linked files. Additionally, sharing code between the server and browser now works seamlessly without any additional configurations.

As an added benefit, Jeasx now works with Bun as an alternative JavaScript runtime, although this setup is not yet recommended for development or production.

Dependency updates: `@types/node@22.13.14`

## 2025-03-26 - Jeasx 1.6.3 released

🎉 This release fixes a bug with the recently introduced env file loading. The env files were loaded in the wrong order, so that overwriting existing env variables didn't work.

Dependency updates: `fastify@5.2.2, @types/node@22.13.13`

## 2025-03-19 - Jeasx 1.6.2 released

🎉 This release introduces a `try/catch` block in the central request handler, ensuring that proper error messages are logged. Additionally, it enables sourcemaps for both server and browser code, making debugging a breeze.

To enable sourcemap support for Node.js, add the following code to the root of your project as a .npmrc file:

`node-options=--enable-source-maps`

If you are using Docker, you need to modify the following lines in your Dockerfile to enable support for `.npmrc`:

```bash
# RUN npx jeasx build
RUN npm run build
# CMD ["npx","jeasx","start"]
CMD ["npm","start"]
```

## 2025-03-15 - Jeasx 1.6.1 released

🎉 This releases replaces the dependency on `dotenv-flow` with a native implementation provided by Node.js (using `process.loadEnvFile` introduced with Node v20.12.0) to load environment variables from .env-files. The order of loading .env-files is the same as before:

```text
.env.defaults
.env
.env.local
.env.[NODE_ENV] (e.g. .env.development or .env.production)
.env.[NODE_ENV].local (e.g. .env.development.local or .env.production.local)
```

**Breaking change:** If you use .env-files to configure Jeasx and deploy to Vercel, please update your `vercel.json`. You'll need to change `"includeFiles": "{node_modules,dist,public}/**/*"` to `"includeFiles": "./**/*"to` make sure Vercel includes the .env-files in the deployment.

Additionally a fix for correctly parsing environment variables to configure Fastify (`FASTIFY_DISABLE_REQUEST_LOGGING, FASTIFY_TRUST_PROXY`) was implemented.

Dependency updates: `jsx-async-runtime@1.0.0, esbuild@0.25.1, pm2@6.0.5`

Please note: version 1.6.0 was unpublished from NPM right after the release due to a mistake.

## 2025-03-09 - Jeasx 1.5.0 released

🎉 This release features two new configurations:

`FASTIFY_REWRITE_URL` allows you to rewrite incoming URLs. Useful when running behind proxies or when you want to fake URLs.
`JEASX_BUILD_ROUTES_IGNORE_WATCH` allows watching for changes in src/browser when importing browser code into server code.

Dependency updates: `@types/node@22.13.10`

## 2025-03-01 - Jeasx 1.4.1 released

🎉 This release features an updated `jsx-async-runtime@0.8.1` which brings typings for SVGs for a better developer experience in the IDE of your choice.

3rd-party dependencies were updated to the latest versions: `@fastify/static@8.1.1, @types/node@22.13.5`

## 2025-02-12 - Jeasx 1.4.0 released

🎉 This release adds the route property to the current endpoint handler (e.g., `/[index]` or `/bar/[...path]`) to the request object (accessible via request.route). This makes it much easier to calculate trailing path segments for wildcard routes.

Also several dependencies were updated to the latest versions: `esbuild@0.25.0, @fastify/static@8.1.0, @fastify/multipart@9.0.3, @fastify/formbody@8.0.3, @types/node@22.13.1`

## 2025-01-18 - Jeasx 1.3.0 released

🎉 We are excited to announce the release of `jsx-async-runtime@0.7.1`, which now includes proper typings for all HTML attributes in accordance with the Mozilla Developer Network. This ensures that code completion in your IDE for all HTML attributes works now as expected in Jeasx. Special thanks to Rebecca for highlighting this issue!

The updated version of `jsx-async-runtime` now supports using an array of strings for the class attribute, making it easier to create complex classnames. You can now construct classnames using plain strings or template strings, an array of strings, or an object, covering most use-cases known from other libraries like classnames.

As always, we've updated to the latest versions of our dependencies: `fastify/formbody@8.0.2, fastify/multipart@9.0.2, fastify/static@8.0.4, types/node@22.10.7`

## 2025-01-06 - Jeasx 1.2.2 released

🎉 This release is just a minor dependency update: `fastify@5.2.1, fastify/cookie@11.0.2, types/node@22.10.5`

## 2024-12-12 - Jeasx 1.2.1 released

🎉 This release fixes a bug introduced by the recently introduced route caching feature: if a guard returned different response types (e.g. JSX code for a forbidden route, otherwise props for the guarded routes), the guarded routes weren't resolved anymore.

## 2024-12-07 - Jeasx 1.2.0 released

🎉 This release brings a major performance boost (about 2-5 times faster in benchmarks) by introducing runtime caches for resolved routes and loaded JavaScript modules. The caches are only used in production and won't interfere with your development workflow. This change was triggered by a PR submitted by Bryce, Kudos to him for bringing this topic onto the radar.

It also features an update to `jsx-async-runtime` which provides more accurate and also deprecated typings for HTML tags and attributes according to the fantastic HTML reference from the Mozilla Development Network.

Added two new environment variables (`FASTIFY_DISABLE_REQUEST_LOGGING` and `FASTIFY_TRUST_PROXY`) to give you more control over how Jeasx should behave in different environments.

## 2024-12-01 - Jeasx 1.1.0 released

🎉 Migrated from dotenv to dotenv-flow, so you can use NODE_ENV-specific .env\* files (like `.env.development`) to configure different environments for production and development. This is useful to disable caching headers (e.g. via `FASTIFY_STATIC_HEADERS`) in development, as Jeasx applies `FASTIFY_STATIC_HEADERS` in development from now on for a more consistent developer expierence. See updated .env-files in the quickstart-project for an example how to disable caching in development. This is only needed if you have configured `FASTIFY_STATIC_HEADERS` for your existing projects.

Bumped default environment variable `ESBUILD_BROWSER_TARGET` to more recent browser versions (e.g. `chrome126, edge126, firefox128, safari17`). If you want to stick with older versions, you can override it via the environment. Learn more about possible values at the esbuild website.

Updated `jsx-async-runtime` which fixes a bug in escapeEntities which escaped existing &amp; two times. This release also removes the deprecated `renderToString` function. Simply replace it with `jsxToString`.

The default host is now :: which binds to all available network interfaces (e.g. `IPv6`). You can change it via the `HOST` environment variable (e.g. `HOST=0.0.0.0` for the old behaviour). The change is especially useful to connect to Jeasx via private networking on hosting platforms like Railway.

## 2024-11-15 - Jeasx 1.0.2 released

🎉 Disabled cache-control for fastify-static, so proper Cache-Control response header could be applied via the environment variable `FASTIFY_STATIC_HEADERS`. Have a look at the env-file in the quickstart project for an example.

## 2024-11-01 - Jeasx 1.0.1 released

🎉 This version brings official support for Node 22. Also dependencies were updated to latest versions of `fastify@5.0.1, fastify/static@8.0.2, fastify/cookie@11.0.1`. Added new examples for template fragments in combination with HTMX and image optimization with sharp.

## 2024-10-04 - Jeasx 1.0.0 released

It's finally here! Jeasx 1.0.0 is ready for production. We are proud to announce that the framework has reached feature completeness and is now ready for the masses. Lots of hours of work have been put into this project to make sure you have the best experience possible.

## 2024-09-23 - Jeasx 0.15.2 released

Updates to all `@fastify-plugins, esbuild@0.24.0`

## 2024-09-21 - Jeasx 0.15.1 released

Decorate the Fastify request object with `path` property, so you can easily access the route path without query parameters via request.path. This solves 99% of all use-cases for recently removed `@fastity/url-data`.

## 2024-09-20 - Jeasx 0.15.0 released

This release comes with Fastify 5. It also removes `@fastify/url-data` and `@fastify/accepts` as dependencies, therefore your code might break. The reason behind this removal is to depend on less dependencies in the long run which makes maintenance of the core easier.

If you rely on either accepts or url-data, you must provide appropriate changes in userland code. For `@fastify/url-data` I would recommend to use `fast-uri` and for `@fastify/accepts` `jshttp/accepts` for parsing accept-header if needed.

Please note: there were some intermediate releases since the past proper release which shouldn't be used (and are mostly unpublished from npm).

## 2024-08-21 - Jeasx 0.11.2 released

Added simple Dockerfile to quickstart template. Dependency updates: `esbuild@0.23.1, @fastify/cookie@9.4.0, @types/node@20.16.1`

## 2024-07-27 - Jeasx 0.11.1 released

Performance optimization: if response is string or buffer, break evaluation loop early. This allows to build caches for pages and binary assets in userland.

## 2024-07-26 - Jeasx 0.11.0 released

Updated to `jsx-async-runtime@0.5.0` which allows to override `jsxToString` from `jsx-async-runtime` to intercept / modify / replace JSX components via this context. Have a look at the example to see how it works.

## 2024-07-19 - Jeasx 0.10.1 released

Breaking change: removed `@fastify/request-context` in favor of the recently introduced this context. Changing your code should be straightforward. This change decouples userland code from Fastify. Additionally code for Jeasx and `jsx-async-runtime` is provided unminified, so debugging and testing is far easier now.

## 2024-07-12 - Jeasx 0.9.1 released

Updated to `jsx-async-runtime@0.4.1` which fixes a problem when running tests with Vitest.

## 2024-07-10 - Jeasx 0.9.0 released

Updated to `jsx-async-runtime@0.4.0` which allows to use `this` as context object to avoid prop drilling. Have a look at the demo to see how things work.

## 2024-07-05 - Jeasx 0.8.0 released

Updated to `jsx-async-runtime@0.3.0` (deprecated `renderToString` in favor of `jsxToString`)

## 2024-07-03 - Jeasx 0.7.6 released

Updated to `esbuild@0.23.0`

## 2024-07-01 - Jeasx 0.7.5 released

Updated to `fastify@4.28.1, esbuild@0.22.0, pm2@5.4.1`

## 2024-05-28 - Jeasx 0.7.4 released

Updated to `esbuild@0.21.4, pm2@5.4.0`

## 2024-05-17 - Jeasx 0.7.3 released

Updated to `esbuild@0.21.3, @types/node@20.12.12`

## 2024-05-08 - Jeasx 0.7.2 released

Updated to `fastify@4.27.0, esbuild@0.21.1, @fastify/static@7.0.4`

## 2024-05-07 - Jeasx 0.7.1 released

Updated `esbuild@0.21.0`

## 2024-04-27 - Jeasx 0.7.0 released

This release introduces a new feature that allows you to post-process the resulting payloads, such as prettifying the HTML output. You can now set up a response handler, for example, in a guard. The response handler takes the resulting payload as a parameter and returns the modified payload.

```js
import * as prettier from "prettier";

export default function RootGuard({ request, reply }) {
  this.response = async (payload) => {
    return typeof payload === "string" &&
      String(reply.getHeader("content-type")).startsWith("text/html")
      ? await prettier.format(payload, { parser: "html" })
      : payload;
  };
}
```

Shame on me... I have recently started writing news as we approach the 1.0 release. But you can study the changelog at GitHub to see what has happend in the past.

## 2023-12-30 - First public commit

Our Journey Begins! 🎉 Introducing Jeasx, a revolutionary web development framework born out of a summer experiment in 2023.

Our mission?

To simplify web development using server-rendered JSX as the cornerstone, bringing back the essence of the web: HTML, CSS, and progressive enhancing JavaScript. Join us as we redefine the future of web development together!
