/* jsdom 专项验证：🤖 AI 归纳全书错词（summarizeWrongBook） */
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

// 清空错词本，保证测试起点干净
Store.clearWrongWords();

// ================= 1) 按钮 / 容器存在 =================
ok(!!document.getElementById('btn-ai-summarize-wrong'), '错词本存在「🤖 AI 归纳全书错词」按钮');
ok(!!document.getElementById('wrong-ai-summary'), '错词本存在 AI 归纳结果容器 #wrong-ai-summary');

// ================= 2) 空错词本 → 提示「暂无错词」 =================
(function () {
  document.getElementById('btn-ai-summarize-wrong').dispatchEvent(new window.Event('click'));
  setTimeout(function () {
    const box = document.getElementById('wrong-ai-summary');
    ok(!!box && box.textContent.indexOf('暂无错词') >= 0, '空错词本点击给出「暂无错词」提示（不崩溃）');
    ok(runtimeErrors.length === 0, '空本点击不抛运行时错误（实际 ' + runtimeErrors.length + '）');

    // ================= 3) 有 key + 错词 → 渲染归纳文本 =================
    Store.addWrongWord('abandon', 'v. 放弃', 'translate');
    Store.addWrongWord('abolish', 'v. 废除', 'translate');
    Store.setAiConfig({ baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', key: 'sk-test' });
    mockAiSuccess('【高频/易混】abandon/abolish 均表"废除/放弃"，易混；【薄弱点】拼写与搭配；【建议】本周每天回顾 10 分钟。');
    document.getElementById('btn-ai-summarize-wrong').dispatchEvent(new window.Event('click'));
    setTimeout(function () {
      const box = document.getElementById('wrong-ai-summary');
      ok(!!box && box.textContent.indexOf('高频') >= 0, '有错词且 AI 成功时渲染归纳文本');
      ok(runtimeErrors.length === 0, '有错词点击不抛运行时错误（实际 ' + runtimeErrors.length + '）');

      // ================= 4) 无 key → 配置提示 =================
      Store.setAiConfig({ baseUrl: '', model: '', key: '' });
      document.getElementById('btn-ai-summarize-wrong').dispatchEvent(new window.Event('click'));
      setTimeout(function () {
        const box = document.getElementById('wrong-ai-summary');
        ok(!!box && box.textContent.indexOf('配置') >= 0, '无 key 点击给出配置提示（不崩溃）');
        ok(jsdomErrors.length === 0, 'jsdom 内部错误数 = 0（实际 ' + jsdomErrors.length + '）');
        console.log('\n========== AI 归纳全书错词测试结果 ==========');
        console.log('通过 ' + pass + ' / 失败 ' + fail);
        process.exit(fail ? 1 : 0);
      }, 120);
    }, 120);
  }, 120);
})();
