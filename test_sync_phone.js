/* jsdom 专项验证：手机号账号体系（注册/登录合一 + 校验） */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = __dirname;
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
  .replace(/<script[\s\S]*?<\/script>/g, '');

const vc = new VirtualConsole();
const jsdomErrors = [];
vc.on('jsdomError', function (e) { jsdomErrors.push(e.message); });

const dom = new JSDOM(html, {
  runScripts: 'outside-only',
  url: 'https://kaoyan-tracker.pages.dev/',
  pretendToBeVisual: true,
  virtualConsole: vc
});
const { window } = dom;
const { document } = window;

window.matchMedia = window.matchMedia || function () { return { matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }; };
window.requestAnimationFrame = window.requestAnimationFrame || function (cb) { return setTimeout(function () { cb(Date.now()); }, 0); };
window.confirm = function () { return true; };
window.alert = function () {};
function mockCtx() { return new Proxy({}, { get: function () { return function () { return mockCtx(); }; }, set: function () { return true; } }); }
window.HTMLCanvasElement.prototype.getContext = function () { return mockCtx(); };
window.HTMLCanvasElement.prototype.toDataURL = function () { return 'data:image/png;base64,'; };
window.HTMLCanvasElement.prototype.toBlob = function (cb) { if (cb) cb({}); };
try { window.location.reload = function () { window.__reloaded = true; }; } catch (e) {}

let fetchCalls = [];
window.fetch = function (url, opts) {
  fetchCalls.push({ url: url, method: (opts && opts.method) || 'GET', headers: (opts && opts.headers) || {}, body: (opts && opts.body) });
  return new Promise(function (resolve) {
    setTimeout(function () {
      const m = (opts && opts.method) || 'GET';
      if (m === 'GET') {
        resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ data: window.__cloudData || null, version: 'v1', meta: null }); } });
      } else {
        resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ ok: true, version: 'v1' }); } });
      }
    }, 0);
  });
};

const order = ['qrcode.min.js', 'words.js', 'store.js', 'charts.js', 'share.js', 'md5.js', 'sentences.js', 'app.js'];
for (const f of order) {
  const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
  try { window.eval(code); } catch (e) { console.error('❌ 加载 ' + f + ' 失败: ' + e.message); process.exit(1); }
}
if (typeof window.__switchTab !== 'function') {
  try { document.dispatchEvent(new window.Event('DOMContentLoaded')); } catch (e) { console.error('❌ init 失败: ' + e.message); process.exit(1); }
}
if (!window.Store || typeof window.__switchTab !== 'function') { console.error('❌ Store / init 未就绪'); process.exit(1); }

const Store = window.Store;
let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('✅ ' + name); } else { fail++; console.log('❌ ' + name); } }

function clickSync(phone) {
  const inp = document.getElementById('sync-code');
  inp.value = phone;
  fetchCalls = [];
  document.getElementById('btn-sync-confirm').click();
}

setTimeout(function () {
  // 1) 空值校验
  const inp = document.getElementById('sync-code');
  inp.value = '';
  document.getElementById('btn-sync-confirm').click();
  ok(document.getElementById('sync-status').textContent.indexOf('请先输入手机号') >= 0, '空手机号 → 提示请输入手机号');

  // 2) 格式校验（过短数字）
  inp.value = '12';
  document.getElementById('btn-sync-confirm').click();
  ok(document.getElementById('sync-status').textContent.indexOf('格式不正确') >= 0, '过短数字 → 提示格式不正确');

  // 2b) 含非数字字符
  inp.value = '138abc';
  document.getElementById('btn-sync-confirm').click();
  ok(document.getElementById('sync-status').textContent.indexOf('只能包含数字') >= 0, '含非数字 → 提示只能包含数字');

  // 3) 注册路径（云端无数据）
  window.__cloudData = null;
  clickSync('13800138000');
  setTimeout(function () {
    const st = document.getElementById('sync-status').textContent;
    ok(st.indexOf('注册成功') >= 0, '云端无数据 → 注册成功');
    const putCall = fetchCalls.find(function (c) { return c.method === 'PUT'; });
    ok(!!putCall && putCall.headers['X-Sync-Key'] === '13800138000', '注册 → PUT 且 X-Sync-Key 为手机号');

    // 4) 登录路径（云端有数据，本机空）
    window.__cloudData = { vocab: [{ word: 'hello', meaning: '你好' }] };
    clickSync('13900139000');
    setTimeout(function () {
      const st2 = document.getElementById('sync-status').textContent;
      ok(st2.indexOf('登录成功') >= 0, '云端有数据 → 登录成功');
      const getCall = fetchCalls.find(function (c) { return c.method === 'GET'; });
      ok(!!getCall && getCall.headers['X-Sync-Key'] === '13900139000', '登录 → GET 用同一手机号查云端');
      const restored = (typeof Store.getVocab === 'function' && Store.getVocab().length) || window.__reloaded;
      ok(!!restored, '登录 → 拉取并恢复云端数据');
      console.log('\n========== 手机号账号测试结果 ==========');
      console.log('通过 ' + pass + ' / 失败 ' + fail);
      process.exit(fail ? 1 : 0);
    }, 80);
  }, 80);
}, 40);
