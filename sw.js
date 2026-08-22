/* 考研学习记录 · Service Worker（v20260822z）
 * 【根治导航/页面卡旧版】shell(index.html) 永远走网络、绝不缓存，
 *   旧 SW 曾 cache-first 缓存了"所有模块同一内容"的旧 index.html 并顶替新版 → 用户反复看到故障页。
 * 静态资源（app.js?/styles.css?/图标等带 ?v= 版本号）走 cache-first + 后台更新（stale-while-revalidate），
 *   版本号天然隔离，发版即换新。
 * 排除 /api/* 与跨域，保证同步/AI 实时走网络。
 * 每次发版必须递增 SW_VERSION（与 APP_VERSION 同步）。
 */
const SW_VERSION = '20260822z';
const CACHE = 'kaoyan-pwa-' + SW_VERSION;
const PRECACHE = ['./', './manifest.webmanifest'];

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

// 新 SW 接管后，通知所有页面刷新，确保拿到最新外壳（免手动强刷）
self.addEventListener('message', function (e) {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;                 // 非 GET 不拦截（POST /api/sync 等正常走网络）
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;  // 跨域不拦
  if (url.pathname.indexOf('/api/') === 0) return;  // 【关键】/api/sync、/api/ai 走网络，绝不缓存（同步必须实时）

  var isShell = url.pathname === '/' ||
                url.pathname === '/index.html' ||
                url.pathname.endsWith('/index.html') ||
                url.pathname === '' ;
  if (isShell) {
    // 外壳：永远走网络、绝不缓存（根治"旧 SW 缓存旧 index.html 顶替新版"）。
    // 失败时退回缓存仅作离线兜底，正常网络下用户永远拿到最新 index.html。
    e.respondWith(
      fetch(req).catch(function () {
        return caches.match(req).then(function (hit) { return hit || fetch(req); });
      })
    );
    return;
  }

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

