/* sw.js — cache do esqueleto da app para funcionar sem rede.
 * IMPORTANTE: sempre que alterares qualquer ficheiro desta lista,
 * incrementa CACHE_NAME (v1 -> v2) ou o browser continua a servir o antigo. */

const CACHE_NAME = 'treino-v3';

const SHELL = [
  './',
  './index.html',
  './css/style.css',
  './js/db.js',
  './js/chart.js',
  './js/app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (ev) => {
  ev.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (ev) => {
  if (ev.request.method !== 'GET') return;
  // Cache primeiro: a app tem de abrir sem rede, e os ficheiros so mudam quando eu os mudo.
  ev.respondWith(
    caches.match(ev.request).then((hit) => hit || fetch(ev.request))
  );
});
