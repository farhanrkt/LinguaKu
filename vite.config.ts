import { createReadStream } from 'node:fs';
import { cp, stat } from 'node:fs/promises';
import { join, normalize, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

const CONTENT_SRC = resolve(import.meta.dirname, 'assets/content');

/**
 * Serves the generated content shards (SPEC §5.3) at /content/ in dev and
 * copies them into the build. They live in `assets/content/` per SPEC §11
 * rather than in `public/`, because they are pipeline output that happens to
 * be committed — not hand-authored static files.
 */
const contentShards = (): Plugin => ({
  name: 'linguaku:content-shards',
  configureServer(server) {
    server.middlewares.use('/content', (req, res, next) => {
      const requested = decodeURIComponent((req.url ?? '').split('?')[0] ?? '');
      const target = join(CONTENT_SRC, normalize(requested));
      if (!target.startsWith(CONTENT_SRC)) {
        res.statusCode = 403;
        res.end();
        return;
      }
      stat(target).then(
        (stats) => {
          if (!stats.isFile()) return next();
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          createReadStream(target).pipe(res);
        },
        () => next(),
      );
    });
  },
  async writeBundle(options) {
    const outDir = options.dir ?? resolve(import.meta.dirname, 'dist');
    await cp(CONTENT_SRC, join(outDir, 'content'), { recursive: true });
  },
});

// Reference device (SPEC §5.4): mid-range Indonesian Android on mobile data.
// Budgets are enforced in CI by scripts/check-bundle.mjs, not here.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    contentShards(),
    VitePWA({
      registerType: 'autoUpdate',
      // We register manually in src/platform/serviceWorker.ts so the UI can
      // surface offline-readiness (SPEC §5.4: fully functional offline).
      injectRegister: null,
      manifest: {
        name: 'LinguaKu',
        short_name: 'LinguaKu',
        description: 'Belajar bahasa Inggris dan Jepang, offline, tanpa akun.',
        lang: 'id',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0b1020',
        theme_color: '#0b1020',
        categories: ['education'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        // SPEC §10: jump straight into a session from the launcher.
        shortcuts: [
          {
            name: 'Latihan 4 menit',
            short_name: '4 menit',
            url: '/?latihan=4',
            icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
        ],
      },
      workbox: {
        globPatterns: [
          '**/*.{js,css,html,svg,png,woff2}',
          // The starter bands (STARTER_BANDS in src/data/content.ts) are
          // precached, not runtime-cached: SPEC §5.4 promises the app is fully
          // functional offline *after first load*, and runtime caching can only
          // deliver that if the learner happened to be online for a session
          // first. ~0.58 MB gzipped, against an 8 MB budget (§5.3).
          'content/*/manifest.json',
          // The contrastive pack (SPEC §3) is ~15 KB gzipped and the session
          // composer reaches for it on every plan, so it is precached with the
          // starter bands rather than fetched on first drill.
          'content/*/contrastive.json',
          'content/*/{lexemes,anchors}.b1.json',
          'content/*/{lexemes,anchors}.b2.json',
          'content/*/{lexemes,anchors}.b3.json',
        ],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        // Content shards are lazily fetched, so they are cached at runtime
        // rather than precached — a beginner should not pay for band 5 on
        // first load (SPEC §5.3). Once fetched they must survive offline.
        runtimeCaching: [
          {
            // The manifest is the cache-busting signal, so it revalidates.
            urlPattern: /\/content\/[^/]+\/manifest\.json$/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'linguaku-content-manifest' },
          },
          {
            // Shards are immutable for a given manifest hash.
            urlPattern: /\/content\/.+\.json$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'linguaku-content',
              expiration: { maxEntries: 64 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    target: 'es2022',
    manifest: true,
    sourcemap: true,
  },
});
