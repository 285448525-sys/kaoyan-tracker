/* 考研学习记录 · Service Worker（v20260817k）
 * cache-first（stale-while-revalidate）同源静态资源；排除 /api/* 与跨域，保证同步/AI 实时走网络。
 * 每次发版必须递增 SW_VERSION（与 APP_VERSION 同步），否则旧 SW 不更新、用户拿不到新外壳。
 */
const SW_VERSION = '20260817o';
const CACHE = 'kaoyan-pwa-' + SW_VERSION;
const PRECACHE = ['./', './index.html', './manifest.webmanifest'];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(PRECACHE); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;                 // 非 GET 不拦截（POST /api/sync 等正常走网络）
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;  // 跨域不拦
  if (url.pathname.indexOf('/api/') === 0) return;  // 【关键】/api/sync、/api/ai 走网络，绝不缓存（同步必须实时）
  // 同源静态资源：cache-first，背景更新（stale-while-revalidate）
  e.respondWith(
    caches.match(req).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res && res.status === 200) {
          caches.open(CACHE).then(function (c) { c.put(req, res.clone()); });
        }
        return res;
      }).catch(function () { return hit; });        // 离线且缓存未命中 → 退回已缓存（或 undefined）
      return hit || net;
    })
  );
});
