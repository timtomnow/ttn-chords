import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

// Served at https://<user>.github.io/ttn-chords/ on GitHub Pages.
// Vite uses this as the base for asset URLs and as `import.meta.env.BASE_URL`,
// which the router reads (main.tsx) to prefix all routes.
const BASE = '/ttn-chords/';

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.svg',
        'icon.svg',
        'icon-maskable.svg',
        'apple-touch-icon.png',
        'icon-192.png',
        'icon-512.png',
        'icon-maskable-512.png',
      ],
      manifest: {
        name: 'TTN Chords',
        short_name: 'TTN Chords',
        description:
          'Local-first songbook for group song-playing: lyrics, chords, rhythms, clickable chord charts, and printable reports.',
        theme_color: '#0a0a0a',
        background_color: '#fafafa',
        display: 'standalone',
        orientation: 'any',
        start_url: BASE,
        scope: BASE,
        icons: [
          { src: `${BASE}icon.svg`, sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: `${BASE}icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: `${BASE}icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: `${BASE}icon-maskable.svg`,
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
          {
            src: `${BASE}icon-maskable-512.png`,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}'],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5174,
  },
});
