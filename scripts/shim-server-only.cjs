/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS preload file must use require */
/**
 * The application's server modules start with `import 'server-only'`, which deliberately throws outside the Next.js
 * server runtime. The worker and admin scripts run those same modules from plain Node, so they preload this file
 * (see the "worker" and "admin:create" scripts), which makes that one import a no-op.
 * Do not preload it for the web server.
 */
const Module = require('node:module');
const original = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === 'server-only') return require.resolve('./empty.cjs');
  return original.call(this, request, ...rest);
};
