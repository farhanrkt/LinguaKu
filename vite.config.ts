import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// Reference device (SPEC §5.4): mid-range Indonesian Android on mobile data.
// Budgets are enforced in CI by scripts/check-bundle.mjs, not here.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
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
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        // Content shards (SPEC §5.3) are lazy-loaded and cached on demand from
        // M1 onward; they are deliberately not precached.
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
