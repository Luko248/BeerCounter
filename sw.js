/* Beer Counter — offline service worker */
const CACHE = 'beer-counter-v13';

const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './beer-bg.js',
  './vendor/mqtt.min.js',
  './manifest.webmanifest',
  './icon.svg',
  './icon-maskable.svg',
];

// Pre-cache the app shell on install.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

// Drop old caches when a new worker takes over.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// App shell (page navigations, scripts, styles): network-first, so a normal
// reload — including pull-to-refresh — always shows the newest deployed
// version when online. The cache is only the offline fallback.
// Everything else (fonts, icons): stale-while-revalidate as before.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const isShell = req.mode === 'navigate' || req.destination === 'script' || req.destination === 'style';

  if (isShell) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200 && (res.type === 'basic' || res.type === 'cors')) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() =>
          caches.match(req).then((cached) => cached || (req.mode === 'navigate' ? caches.match('./index.html') : undefined))
        )
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && (res.type === 'basic' || res.type === 'cors')) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);

      return cached || network;
    })
  );
});
