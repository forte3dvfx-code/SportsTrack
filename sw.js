/* sw.js — cache do esqueleto da app para funcionar sem rede.
 *
 * ESTRATÉGIA: rede primeiro, cache como reserva.
 * A versão anterior era cache-primeiro, e o resultado foi o telemovel
 * continuar a servir codigo velho depois de cada actualizacao. Agora vai
 * sempre buscar a versao fresca quando ha ligacao, e so usa a copia
 * guardada quando esta offline. Custa uns milissegundos no arranque;
 * poupa meia hora a limpar caches a cada actualizacao.
 *
 * Mesmo assim, incrementa CACHE_NAME sempre que alterares ficheiros:
 * e o que garante que a copia offline tambem fica actualizada. */

const CACHE_NAME = 'treino-v9';

const SHELL = [
  './',
  './index.html',
  './css/style.css',
  './js/db.js',
  './js/drive.js',
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

  const url = new URL(ev.request.url);

  // Pedidos para a Google (autenticacao e Drive) passam directos:
  // nunca sao guardados nem servidos da cache.
  if (url.origin !== self.location.origin) return;

  ev.respondWith(
    fetch(ev.request)
      .then((resp) => {
        // Guarda a versao fresca para quando nao houver rede.
        const copy = resp.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(ev.request, copy)).catch(() => {});
        return resp;
      })
      .catch(() => caches.match(ev.request).then((hit) => hit || caches.match('./index.html')))
  );
});
