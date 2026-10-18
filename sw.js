// «Уголь» — service worker: все файлы игры хранятся на устройстве, игра работает без интернета.
// При обновлении игры меняй VERSION (скрипт bump.sh делает это сам вместе с index.html).
'use strict';

const VERSION = '18';
const CACHE = 'ugol-' + VERSION;
const ASSETS = [
  './',
  'index.html',
  'manifest.json',
  'style.css?v=' + VERSION,
  'js/world.js?v=' + VERSION,
  'js/sim.js?v=' + VERSION,
  'js/gen.js?v=' + VERSION,
  'js/case.js?v=' + VERSION,
  'js/audio.js?v=' + VERSION,
  'js/view.js?v=' + VERSION,
  'js/ui.js?v=' + VERSION,
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('ugol-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // страница: сначала сеть (чтобы приходили обновления), без сети — из кэша
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('index.html', copy)); return res; })
        .catch(() => caches.match('index.html').then((r) => r || caches.match('./'))),
    );
    return;
  }
  // файлы с версией в адресе: сначала кэш
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })),
  );
});
