import { createHash } from 'node:crypto';
import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Cache only this build's static application shell. Authenticated API responses
// and business records never enter the HTTP cache; offline sales use IndexedDB.
function offlineShell(): Plugin {
  return {
    name: 'happy-cone-offline-shell',
    apply: 'build',
    generateBundle(_, bundle) {
      const assets = Object.keys(bundle).filter(name => !name.endsWith('.map'));
      const version = createHash('sha256').update(assets.join('|')).digest('hex').slice(0,12);
      const precache = ['/', '/index.html', '/favicon.svg', '/icon-192.png', '/icon-512.png', '/manifest.webmanifest', ...assets.map(name => `/${name}`)];
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: `
const CACHE = 'happy-cone-shell-${version}';
const ASSETS = ${JSON.stringify(precache)};
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('happy-cone-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api') || url.pathname === '/health' || url.pathname === '/ready') return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request)
      .then(response => response.ok ? response : caches.match('/index.html'))
      .catch(() => caches.match('/index.html')));
    return;
  }
  if (ASSETS.includes(url.pathname)) event.respondWith(caches.match(event.request, { ignoreVary: true }).then(cached => cached || fetch(event.request)));
});
` });
    },
  };
}

const apiTarget = process.env.HAPPY_CONE_API_TARGET || 'http://127.0.0.1:8000';
const proxy = { '/api': { target: apiTarget, ws: true }, '/health': apiTarget, '/ready': apiTarget };

export default defineConfig({
  plugins: [react(), offlineShell()],
  server: { proxy },
  preview: { proxy },
  test: { environment: 'jsdom', setupFiles: './src/test/setup.ts', exclude: ['e2e/**', 'node_modules/**'], pool: 'forks', maxWorkers: 2 },
});
