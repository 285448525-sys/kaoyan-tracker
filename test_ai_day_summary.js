/* jsdom 专项验证：§2.4 今日学习总结 AI 增强（onAiSummary）
 * 验证点：
 *  1) 今日学习总结卡存在「🤖 AI 生成学习总结」按钮与 #ai-summary-out 容器；
 *  2) 无 AI key → 不崩溃，给出配置提示；
 *  3) 有 key + AI 返回自然语言 → 渲染到 #ai-summary-out（textContent / pre，防 XSS）；
 *  4) 注入式返回内容不被当 HTML 执行；
 *  5) AI 失败 → 报错文案降级。
 */
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

// 准备今日数据，方便断言 AI 收到合理上下文
Store.setConfig({ examDate: '2026-09-13' });
Store.upsertSubject({ key: 'math', name: '数学' });
Store.addDuration(Store.todayStr(), 'math', 90);

// ================= 1) 按钮 / 容器存在 =================
ok(!!document.getElementById('btn-ai-summary'), '今日学习总结卡存在「🤖 AI 生成学习总结」按钮');
ok(!!document.getElementById('ai-summary-out'), '今日学习总结卡存在结果容器 #ai-summary-out');

// ================= 2) 无 AI key → 配置提示，不崩溃 =================
(function () {
  Store.setAiConfig({ baseUrl: '', model: '', key: '' });
  document.getElementById('btn-ai-summary').dispatchEvent(new window.Event('click'));
  setTimeout(function () {
    const box = document.getElementById('ai-summary-out');
    ok(!!box && box.textContent.indexOf('配置') >= 0, '无 key 点击给出配置提示（不崩溃）');
    ok(runtimeErrors.length === 0, '无 key 点击不抛运行时错误（实际 ' + runtimeErrors.length + '）');

    // ================= 3) 有 key + 自然语言返回 → 渲染 =================
    Store.setAiConfig({ baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', key: 'sk-test' });
    mockAiSuccess('今天你学习了 90 分钟数学，状态不错！明天建议优先复盘错题，并给英语留出 30 分钟。继续保持节奏，考研稳了 💪');
    document.getElementById('btn-ai-summary').dispatchEvent(new window.Event('click'));
    setTimeout(function () {
      const box = document.getElementById('ai-summary-out');
      ok(!!box && box.textContent.indexOf('数学') >= 0, '有 key 且 AI 成功时渲染自然语言总结');
      ok(runtimeErrors.length === 0, '有 key 点击不抛运行时错误（实际 ' + runtimeErrors.length + '）');

      // ================= 4) 注入式返回不被当 HTML 执行 =================
      mockAiSuccess('正常总结 <img src=x onerror="window.__pwned=1"> 结束');
      window.__pwned = undefined;
      document.getElementById('btn-ai-summary').dispatchEvent(new window.Event('click'));
      setTimeout(function () {
        const box = document.getElementById('ai-summary-out');
        ok(!!box && box.querySelectorAll('img').length === 0, 'AI 返回含 <img> 载荷时不被解析为 HTML（textContent 防 XSS）');
        ok(window.__pwned === undefined, 'AI 返回载荷未触发 onerror 脚本');
        ok(!!box && box.textContent.indexOf('<img') >= 0, 'AI 返回原始串作为文本原样展示');

        // ================= 5) AI 失败 → 报错降级 =================
        window.fetch = function (url) {
          if (String(url).indexOf('/api/ai') >= 0) return Promise.reject(new Error('upstream down'));
          return Promise.reject(new Error('unexpected ' + url));
        };
        document.getElementById('btn-ai-summary').dispatchEvent(new window.Event('click'));
        setTimeout(function () {
          const box = document.getElementById('ai-summary-out');
          ok(!!box && (box.textContent.indexOf('失败') >= 0 || box.textContent.indexOf('网络') >= 0 || box.textContent.indexOf('错误') >= 0), 'AI 失败时给出报错降级文案');
          ok(jsdomErrors.length === 0, 'jsdom 内部错误数 = 0（实际 ' + jsdomErrors.length + '）');
          console.log('\n========== §2.4 AI 学习总结增强测试结果 ==========');
          console.log('通过 ' + pass + ' / 失败 ' + fail);
          process.exit(fail ? 1 : 0);
        }, 150);
      }, 150);
    }, 150);
  }, 150);
})();
