/* Offline cache for the installed (home screen / desktop) app.
 * Bump VERSION whenever any cached file changes. */
var VERSION = 'soboscuba-v3';
var FILES = [
  './',
  'index.html',
  'css/style.css',
  'js/physics.js',
  'js/audio.js',
  'js/game.js',
  'manifest.webmanifest',
  'fonts/lilita-one-latin.woff2',
  'fonts/nunito-latin.woff2',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(FILES); }));
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; })
      .map(function (k) { return caches.delete(k); }));
  }));
  self.clients.claim();
});

// Network first so updates arrive quickly, cache when offline.
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(function (res) {
      var copy = res.clone();
      caches.open(VERSION).then(function (c) { c.put(e.request, copy); });
      return res;
    }).catch(function () {
      return caches.match(e.request, { ignoreSearch: true });
    })
  );
});
