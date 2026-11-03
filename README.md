# Jeasx - the ease of JSX with the power of SSR

[![npm](https://img.shields.io/npm/v/jeasx)](https://www.npmjs.com/package/jeasx)
[![license](https://img.shields.io/npm/l/jeasx)](LICENSE.txt)

Jeasx is a server-side rendering framework for Node.js. You write pages and
API endpoints as async JSX functions, and Jeasx renders them on the server and
streams the HTML to the browser. Routing comes from your file structure.

It is built on [Fastify](https://fastify.dev), [esbuild](https://esbuild.github.io)
and [jsx-async-runtime](https://github.com/jeasx/jsx-async-runtime).

This is the Jeasx core repository. For guides, examples and the project
template, visit <https://www.jeasx.dev>. Live examples are at
<https://expo.jeasx.dev>.

## Development

```sh
npm install
npm run build   # compiles serverless.ts to serverless.js
```

`serverless.js` and `serverless.js.map` are committed, so rebuild and commit
them together after changing `serverless.ts`.

To try out changes in a full app, use
[jeasx-develop](https://github.com/jeasx/jeasx-develop), an ejected version of
[Jeasx Expo](https://expo.jeasx.dev) that runs the framework code directly
in the project, so it's easy to change and test.

## License

[MIT](LICENSE.txt) © Maik Jablonski
