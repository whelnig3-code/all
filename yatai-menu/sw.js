var CACHE_NAME = 'yatai-v3';
var ASSETS = [
  '/',
  '/index.html',
  '/mobile.html',
  '/i18n.js',
  '/cart.js',
  '/data/menu.json',
  '/images/placeholder.webp',
  '/manifest.json'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE_NAME; })
            .map(function (k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function (e) {
  // Network first for JSON (menu data), cache first for assets
  if (e.request.url.indexOf('menu.json') !== -1) {
    e.respondWith(
      fetch(e.request).then(function (res) {
        var clone = res.clone();
        caches.open(CACHE_NAME).then(function (cache) { cache.put(e.request, clone); });
        return res;
      }).catch(function () {
        return caches.match(e.request);
      })
    );
  } else {
    e.respondWith(
      caches.match(e.request).then(function (cached) {
        return cached || fetch(e.request).then(function (res) {
          var clone = res.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(e.request, clone); });
          return res;
        });
      })
    );
  }
});
