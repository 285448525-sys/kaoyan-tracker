/* PWA 离线支持专项验证：sw.js / manifest / index 引入 / SW 注册协议守卫 / online-offline 监听 + onLine 守卫 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = __dirname;
let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('✅ ' + name); } else { fail++; console.log('❌ ' + name); } }

console.log('===== 文件存在性 + 静态内容 =====');
const sw = fs.existsSync(path.join(ROOT, 'sw.js')) ? fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8') : '';
ok(!!sw, 'sw.js 存在');
ok(/caches\.open/.test(sw), 'sw.js 使用 caches.open（缓存 API）');
ok(/pathname\.indexOf\('\/api\/'\)\s*===\s*0/.test(sw) || /'\/api\/'/.test(sw), 'sw.js 排除 /api/*（同步/AI 走网络不缓存）');

// SW_VERSION 必须与 app.js 的 APP_VERSION 同步（动态读取，避免版本号写死导致回归）
const appForVer = fs.existsSync(path.join(ROOT, 'app.js')) ? fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8') : '';
const appVersion = (appForVer.match(/APP_VERSION\s*=\s*'([^']+)'/) || [])[1] || '';
ok(!!appVersion, '从 app.js 读取到 APP_VERSION（' + appVersion + '）');
ok(/SW_VERSION/.test(sw) && new RegExp("'" + appVersion + "'").test(sw), 'sw.js 含 SW_VERSION 与 APP_VERSION 同步（' + (appVersion || '未读取') + '）');
ok(/self\.addEventListener\('fetch'/.test(sw) && /method !== 'GET'/.test(sw), 'sw.js fetch 事件仅拦截同源 GET');

const mfRaw = fs.existsSync(path.join(ROOT, 'manifest.webmanifest')) ? fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8') : '';
let mf = null;
try { mf = JSON.parse(mfRaw); } catch (e) { mf = null; }
ok(!!mf, 'manifest.webmanifest 是合法 JSON');
if (mf) {
  ok(typeof mf.name === 'string' && mf.name.length, 'manifest 含 name');
  ok(mf.display === 'standalone', 'manifest display === "standalone"');
  ok(Array.isArray(mf.icons) && mf.icons.length >= 1, 'manifest 含 icons 数组');
}

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
ok(/<link[^>]+rel="manifest"[^>]*>/.test(html), 'index.html 含 <link rel="manifest">');
ok(/<meta[^>]+name="theme-color"/.test(html), 'index.html 含 theme-color');
ok(/id="offline-bar"[^>]*class="offline-bar"/.test(html), 'index.html 含 #offline-bar 离线横幅元素');

const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
ok(/addEventListener\('online'/.test(app), 'app.js 注册 online 事件');
ok(/addEventListener\('offline'/.test(app), 'app.js 注册 offline 事件');
ok((app.match(/if \(!navigator\.onLine\) return;/g) || []).length >= 2, 'app.js 在 doAutoPullCheck/doAutoPush 内均有 navigator.onLine 守卫（≥2 处）');
ok(/function setOffline\(off\)/.test(app), 'app.js 定义 setOffline(off) 控制横幅');

console.log('===== jsdom：SW 注册协议守卫（https 注册 / file 不注册）=====');
function buildHarness(protocol) {
  const vc = new VirtualConsole();
  const jsdomErrors = [];
  vc.on('jsdomError', function (e) { jsdomErrors.push(e.message); });
  vc.on('error', function () {}); vc.on('warn', function () {});
  const pageUrl = protocol === 'file:' ? 'file:///C:/fake/index.html' : 'https://kaoyan-tracker.pages.dev/';
  const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''), {
    runScripts: 'outside-only', url: pageUrl, pretendToBeVisual: true, virtualConsole: vc
  });
  const { window } = dom;
  const registerSpy = { calls: 0, arg: null };
  try {
    Object.defineProperty(window.navigator, 'serviceWorker', {
      value: { register: function (p) { registerSpy.calls++; registerSpy.arg = p; return Promise.resolve(); } },
      configurable: true
    });
  } catch (e) { /* jsdom 可能已定义，忽略 */ }
  window.matchMedia = window.matchMedia || function () { return { matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }; };
  window.requestAnimationFrame = window.requestAnimationFrame || function (cb) { return setTimeout(function () { cb(Date.now()); }, 0); };
  window.confirm = function () { return true; };
  window.alert = function () {};
  function mockCtx() { return new Proxy({}, { get: function () { return function () { return mockCtx(); }; }, set: function () { return true; } }); }
  window.HTMLCanvasElement.prototype.getContext = function () { return mockCtx(); };
  window.HTMLCanvasElement.prototype.toDataURL = function () { return 'data:image/png;base64,'; };
  window.HTMLCanvasElement.prototype.toBlob = function (cb) { if (cb) cb({}); };
  try { window.localStorage.setItem('kaoyan_tour_done', '1'); } catch (e) {}
  window.fetch = window.fetch || function () { return Promise.reject(new Error('fetch disabled in test')); };
  const order = ['qrcode.min.js', 'words.js', 'store.js', 'charts.js', 'share.js', 'md5.js', 'sentences.js', 'app.js'];
  for (const f of order) {
    const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
    try { window.eval(code); } catch (e) { console.error('❌ 加载 ' + f + ' 失败: ' + e.message); process.exit(1); }
  }
  if (typeof window.__switchTab !== 'function') {
    try { window.document.dispatchEvent(new window.Event('DOMContentLoaded')); } catch (e) {}
  }
  // 触发 load（registerSW 在 readyState!==complete 时挂 load 监听）
  try { window.dispatchEvent(new window.Event('load')); } catch (e) {}
  return { registerSpy, jsdomErrors };
}

const https = buildHarness('https:');
ok(https.registerSpy.calls >= 1, 'https: 协议下 SW 注册被调用（' + https.registerSpy.calls + ' 次）');
ok(https.registerSpy.arg === 'sw.js', '注册路径为相对 sw.js（scope=/）');
ok(https.jsdomErrors.length === 0, 'https 载体无 jsdom 错误' + (https.jsdomErrors.length ? '：' + https.jsdomErrors.join('; ') : ''));

const file = buildHarness('file:');
ok(file.registerSpy.calls === 0, 'file:// 协议下 SW 不注册（保护"双击 index.html 即用"承诺）');

console.log('\n📡 PWA 离线支持：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
