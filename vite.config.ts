import { existsSync } from 'node:fs';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import { defineConfig } from 'vite';

// The plugin reads this file on its own, but the token has to be in hand before
// then: without one — a clone, a fork's CI — there is no plugin to run, and the
// build stays what it was.
const TOKEN_FILE = '.env.sentry-build-plugin';
if (process.env.SENTRY_AUTH_TOKEN === undefined && existsSync(TOKEN_FILE)) {
  process.loadEnvFile(TOKEN_FILE);
}
const authToken = process.env.SENTRY_AUTH_TOKEN;

// No `url`: an organisation token carries the region it was issued for, and
// setting one here only earns a warning that it was ignored.
const sentry = { org: 'ag-bb', project: 'rebind' };

export default defineConfig({
  root: 'web',
  // Flags the Sentry SDK ships for the bundler to shake it down: its own debug
  // logging, and the tracing half nothing here uses.
  define: { __SENTRY_DEBUG__: false, __SENTRY_TRACING__: false },
  // Served from a project page on GitHub Pages, so assets resolve relatively.
  base: './',
  worker: {
    // The worker is bundled apart and inherits neither of these. Left alone it
    // ships no map and carries no debug id, and Sentry skips it on both counts
    // — leaving every frame of the code that does the actual work minified.
    rollupOptions: { output: { sourcemap: Boolean(authToken) } },
    plugins: () =>
      authToken
        ? [
            sentryVitePlugin({
              ...sentry,
              authToken,
              // Stamping the chunk is all this pass is for. The page's own pass
              // runs afterwards and uploads what it finds on disk, worker
              // included; a release and a second upload from here would only
              // race it.
              sourcemaps: { disable: 'disable-upload' },
              release: { create: false, inject: false },
              telemetry: false,
            }),
          ]
        : [],
  },
  build: {
    outDir: '../dist-web',
    emptyOutDir: true,
    // What turns a minified frame into a line of source. The plugin uploads
    // them and then deletes them, so the site itself still ships none.
    sourcemap: Boolean(authToken),
  },
  plugins: authToken
    ? [
        sentryVitePlugin({
          ...sentry,
          authToken,
          sourcemaps: {
            // Frames arrive as `..\..\web\jobs.worker.ts`, the map's own way
            // back out of `dist-web/assets`. Said as the repository says it,
            // a frame is something you can go and open.
            rewriteSources: (source) => source.replace(/\\/g, '/').replace(/^(\.\.\/)+/, ''),
            filesToDeleteAfterUpload: ['dist-web/**/*.map'],
          },
        }),
      ]
    : [],
});
