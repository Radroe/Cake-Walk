// Cake Walk: service worker
// APP_VERSION must match config.js. Changing it here is how the installed app notices an update.

const APP_VERSION = '1.6.0';
const CACHE_NAME = `cakewalk-${APP_VERSION}`;
const MEDIABUNNY_URL = 'https://cdn.jsdelivr.net/npm/mediabunny@1.66.4/dist/bundles/mediabunny.min.mjs';
const AI_HOST = 'generativelanguage.googleapis.com';

// Every app file (not sw.js itself). Add each new file here.
const APP_FILES = [
  './',
  './index.html',
  './styles.css',
  './config.js',
  './storage.js',
  './app.js',
  './editor.js',
  './export.js',
  './platforms.js',
  './safety.js',
  './look.js',
  './player.js',
  './style.js',
  './rhythm.js',
  './avc.js',
  './remix.js',
  './debug.js',
  './worker.js',
  './manifest.json',
  './icon.png',
  './icon-192.png',
  './icon-512.png',
  './avatar.jpg'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // cache: 'reload' skips the browser's HTTP cache, so a new version never stores old files.
    await cache.addAll(APP_FILES.map((url) => new Request(url, { cache: 'reload' })));
    try {
      await cache.add(new Request(MEDIABUNNY_URL, { mode: 'cors', cache: 'reload' }));
    } catch (err) {
      // The app still installs; the Worker loads Mediabunny from the network next time.
      console.warn('Mediabunny was not cached', err);
    }
  })());
  // No skipWaiting here: the app asks first ("New version ready. Update now?").
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith('cakewalk-') && n !== CACHE_NAME).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // AI requests always go straight to the network.
  if (url.hostname === AI_HOST) return;

  // The pinned Mediabunny file: cache first.
  if (req.url === MEDIABUNNY_URL) {
    event.respondWith(caches.match(MEDIABUNNY_URL).then((hit) => hit || fetch(req)));
    return;
  }

  // Only our own files from here on. Anything else (and never video files) is left alone.
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      return (await cache.match('./index.html')) || (await cache.match('./')) || fetch(req);
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(req, { ignoreSearch: true });
    return hit || fetch(req);
  })());
});
