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
      // 'prompt', not 'autoUpdate': an automatic update reloads every open
      // page the moment the new worker activates, which bounced a learner out
      // of the card they were answering. The new version now waits, and the
      // home screen offers it (src/platform/serviceWorker.ts).
      registerType: 'prompt',
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
          // Only what is small and needed before a language is chosen. The
          // starter bands used to be precached for *both* languages — ~1.4 MB
          // gzipped on first load, 756 KB of it Japanese for a learner who
          // picked English. They are now fetched for the chosen language right
          // after it is chosen, and written straight into the runtime cache
          // (src/platform/contentCache.ts), so offline-after-first-load still
          // holds before a single session has run (SPEC §5.4, invariant 54).
          'content/*/manifest.json',
          'content/*/contrastive.json',
          'content/*/topics.json',
        ],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        // The first install still takes the page at once — only an *update*
        // waits for the learner.
        clientsClaim: true,
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
            // Shards are immutable for a given manifest hash, and since R11's
            // fix the hash is in the URL (`?v=`), so CacheFirst cannot serve
            // last month's content under this month's address.
            urlPattern: /\/content\/.+\.json(\?.*)?$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'linguaku-content',
              // **This must exceed the number of content shards, or offline
              // breaks silently.** It was 64 when the app shipped 47 files;
              // glosses, chunks, topics and passages took it to 65, so a
              // learner who touched both languages was one fetch away from
              // evicting a shard they had already downloaded — and the failure
              // looks like content that mysteriously will not open on a plane.
              // `purgeOnQuotaError` is the other half: when the device is full,
              // dropping content is the right answer, because it is
              // re-fetchable and the learner's review history is not.
              expiration: { maxEntries: 192, purgeOnQuotaError: true },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Pre-cached audio (risk R1). §5.4 promises the app is *"fully
            // functional offline after first load, including audio for cached
            // bands"*, and a clip matches none of the rules above — it is not
            // JSON — so without this it would be fetched every play and be
            // silently unavailable offline, which is the one situation the
            // clips exist for.
            //
            // `rangeRequests` because an <audio> element issues Range requests
            // and Safari always does: without the plugin a cached clip answers
            // a range request with a 200 and the element refuses to play it.
            urlPattern: /\/content\/.+\.(m4a|opus|mp3)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'linguaku-audio',
              expiration: { maxEntries: 1_200, purgeOnQuotaError: true },
              cacheableResponse: { statuses: [0, 200] },
              rangeRequests: true,
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
