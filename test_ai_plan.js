/* jsdom 专项验证：🤖 AI 生成计划（onAiPlan） */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = __dirname;
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
  .replace(/<script[\s\S]*?<\/script>/g, '');

const vc = new VirtualConsole();
const jsdomErrors = [];
vc.on('jsdomError', function (e) { jsdomErrors.push(e.message); });
vc.on('error', function () {}); vc.on('warn', function () {});

const dom = new JSDOM(html, {
  runScripts: 'outside-only',
  url: 'https://kaoyan-tracker.pages.dev/',
  pretendToBeVisual: true, virtualConsole: vc
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
// 默认 fetch 全部 reject（模拟离线 / 无 key）
window.fetch = function () { return Promise.reject(new Error('fetch disabled in test')); };

const runtimeErrors = [];
window.addEventListener('error', function (e) {
  const st = e.error && e.error.stack ? e.error.stack.split('\n').slice(0, 4).join(' ← ') : '';
  runtimeErrors.push((e.message || 'window error') + (st ? ' [STACK] ' + st : ''));
});
window.addEventListener('unhandledrejection', function (e) { runtimeErrors.push('promise: ' + (e.reason && e.reason.message || e.reason)); });

const order = ['qrcode.min.js', 'words.js', 'store.js', 'charts.js', 'share.js', 'md5.js', 'sentences.js', 'app.js'];
for (const f of order) {
  const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
  try { window.eval(code); } catch (e) { console.error('❌ 加载 ' + f + ' 失败: ' + e.message); process.exit(1); }
}
if (typeof window.__switchTab !== 'function') {
  try { document.dispatchEvent(new window.Event('DOMContentLoaded')); } catch (e) { console.error('❌ init 触发失败: ' + e.message); process.exit(1); }
}
if (!window.Store || typeof window.__switchTab !== 'function') { console.error('❌ Store / init 未就绪'); process.exit(1); }

const Store = window.Store;
let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('✅ ' + name); } else { fail++; console.log('❌ ' + name); } }

function mockAiSuccess(content) {
  window.fetch = function (url) {
    if (String(url).indexOf('/api/ai') >= 0) {
      return Promise.resolve({ status: 200, text: function () { return Promise.resolve(JSON.stringify({ choices: [{ message: { content: content } }] })); } });
    }
    return Promise.reject(new Error('unexpected ' + url));
  };
}

// ================= 1) 按钮存在 =================
ok(!!document.getElementById('btn-ai-plan'), '学习计划页存在「🤖 AI 生成计划」按钮');

// ================= 2) 无 AI key → 不崩溃，不新增计划 =================
Store.setAiConfig({ baseUrl: '', model: '', key: '' });
(function () {
  const before = Store.getPlanItems().length;
  const btn = document.getElementById('btn-ai-plan');
  btn.dispatchEvent(new window.Event('click'));
  setTimeout(function () {
    ok(runtimeErrors.length === 0, '无 key 点击不抛运行时错误（实际 ' + runtimeErrors.length + '）');
    ok(Store.getPlanItems().length === before, '无 key 时不新增计划项（容错降级）');

    // ================= 3) 有 key + AI 返回合法 JSON 数组 → 新增计划 =================
    Store.setAiConfig({ baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', key: 'sk-test' });
    mockAiSuccess('[{"text":"AI 生成的计划项 A","note":"来自 AI","priority":"高"},{"text":"AI 生成的计划项 B","note":"来自 AI","priority":"中"}]');
    const before2 = Store.getPlanItems().length;
    document.getElementById('btn-ai-plan').dispatchEvent(new window.Event('click'));
    setTimeout(function () {
      ok(runtimeErrors.length === 0, '有 key 点击不抛运行时错误（实际 ' + runtimeErrors.length + '）');
      const after = Store.getPlanItems().length;
      ok(after > before2, 'AI 返回合法数组后新增计划项（' + before2 + ' → ' + after + '）');
      const has = Store.getPlanItems().some(function (i) { return i.text && i.text.indexOf('AI 生成的计划项 A') >= 0; });
      ok(has, '新增的计划项包含 AI 返回内容');

      // ================= 4) AI 返回脏数据（非 JSON）→ 降级不崩溃 =================
      mockAiSuccess('抱歉我无法生成计划，请稍后再试。');
      const before3 = Store.getPlanItems().length;
      document.getElementById('btn-ai-plan').dispatchEvent(new window.Event('click'));
      setTimeout(function () {
        ok(runtimeErrors.length === 0, '脏返回不抛运行时错误（实际 ' + runtimeErrors.length + '）');
        ok(Store.getPlanItems().length === before3, '脏返回时不新增计划项（降级）');
        ok(jsdomErrors.length === 0, 'jsdom 内部错误数 = 0（实际 ' + jsdomErrors.length + '）');
        console.log('\n========== AI 生成计划测试结果 ==========');
        console.log('通过 ' + pass + ' / 失败 ' + fail);
        process.exit(fail ? 1 : 0);
      }, 120);
    }, 120);
  }, 120);
})();
