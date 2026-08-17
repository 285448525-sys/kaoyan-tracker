/* 导航重构（八标签）专项验证：6 标签 → 8 标签（home/math/cs408/vocab/mistakes/mock/data/settings）
 * 取代旧版六标签断言；内部 id 全部保留（防 refs 断裂）。 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = __dirname;
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
  .replace(/<script[\s\S]*?<\/script>/g, '');

const vc = new VirtualConsole();
const jsdomErrors = [];
vc.on('jsdomError', function (e) { jsdomErrors.push(e.message); });
vc.on('error', function () {});
vc.on('warn', function () {});

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
try { window.localStorage.setItem('kaoyan_tour_done', '1'); } catch (e) {}
window.fetch = window.fetch || function () { return Promise.reject(new Error('fetch disabled in test')); };

const runtimeErrors = [];
window.addEventListener('error', function (e) { runtimeErrors.push((e.message || 'window error')); });
window.addEventListener('unhandledrejection', function (e) { runtimeErrors.push('promise: ' + (e.reason && e.reason.message || e.reason)); });

const order = ['qrcode.min.js', 'words.js', 'store.js', 'charts.js', 'share.js', 'md5.js', 'sentences.js', 'app.js'];
for (const f of order) {
  const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
  try { window.eval(code); } catch (e) { console.error('??? 加载 ' + f + ' 失败: ' + e.message); process.exit(1); }
}
if (typeof window.__switchTab !== 'function') {
  try { document.dispatchEvent(new window.Event('DOMContentLoaded')); } catch (e) { console.error('??? init 触发失败: ' + e.message); process.exit(1); }
}

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('✅ ' + name); } else { fail++; console.log('❌ ' + name); } }

try {
  window.Store.setConfig({ subjects: [
    { key: 'math', name: '数学', color: '#6366f1' },
    { key: 'cs408', name: '408', color: '#8b5cf6' }
  ] });
} catch (e) {}

// ---- 1) 8 个顶层容器存在且唯一 ----
const containers = ['home', 'math', 'cs408', 'vocab', 'mistakes', 'mock', 'data', 'settings'];
containers.forEach(function (c) {
  const el = document.querySelectorAll('#tab-' + c);
  ok(el.length === 1 && el[0].classList.contains('tab-panel'), '容器 tab-' + c + ' 存在且仅一个 tab-panel');
});

// ---- 2) 旧外壳不得残留 ----
['dashboard', 'practice', 'today', 'config', 'record', 'plan', 'summary', 'manual', 'websites', 'translate'].forEach(function (o) {
  ok(document.querySelectorAll('#tab-' + o).length === 0, '旧外壳 tab-' + o + ' 已不存在');
});

// ---- 3) 底部 Tab Bar 8 个 btb-btn，data-tab 集合与容器一致 ----
const btb = Array.prototype.slice.call(document.querySelectorAll('.bottom-tabbar .btb-btn'));
ok(btb.length === 8, '底部 Tab Bar 有 8 个 btb-btn（实际 ' + btb.length + '）');
const btbTabs = btb.map(function (b) { return b.getAttribute('data-tab'); }).sort();
ok(JSON.stringify(btbTabs) === JSON.stringify(containers.slice().sort()), '底部 data-tab 集合 = 8 容器');

// ---- 4) 侧栏 8 个 tab-btn ----
const sbtn = document.querySelectorAll('.side-menu .tab-btn');
ok(sbtn.length === 8, '侧栏有 8 个 tab-btn（实际 ' + sbtn.length + '）');

// ---- 5) sub-panel / sub-tab-btn 数量合理 ----
const subPanels = document.querySelectorAll('.sub-panel');
const subBtns = document.querySelectorAll('.sub-tab-btn');
ok(subPanels.length >= 13, 'sub-panel 数量 >= 13（实际 ' + subPanels.length + '）');
ok(subBtns.length >= 13, 'sub-tab-btn 数量 >= 13（实际 ' + subBtns.length + '）');

// ---- 6) 子标签切换 .sub-panel.active ----
function clickSub(container, sub) {
  const btn = document.querySelector('#tab-' + container + ' .sub-tab-btn[data-sub="' + sub + '"]');
  if (!btn) return false;
  btn.click();
  const panel = document.getElementById('sub-' + sub);
  return !!(panel && panel.classList.contains('active'));
}
ok(clickSub('vocab', 'review'), 'vocab 切到 review 子标签 → sub-review active');
ok(clickSub('data', 'progress'), 'data 切到 progress 子标签 → sub-progress active');
ok(clickSub('settings', 'manual'), 'settings 切到 manual 子标签 → sub-manual active');
ok(clickSub('mistakes', 'sentences'), 'mistakes 切到 sentences 子标签 → sub-sentences active');

// ---- 7) 八标签均可经 switchTab 激活 ----
containers.forEach(function (c) {
  window.__switchTab(c);
  const active = document.querySelector('#tab-' + c) && document.querySelector('#tab-' + c).classList.contains('active');
  ok(active, 'switchTab("' + c + '") 可激活 tab-' + c);
});

// ---- 8) 向后兼容旧名映射 ----
function oldRoute(oldName, container, sub) {
  window.__switchTab(oldName);
  const cOk = document.querySelector('#tab-' + container) && document.querySelector('#tab-' + container).classList.contains('active');
  const sOk = !sub || (document.getElementById('sub-' + sub) && document.getElementById('sub-' + sub).classList.contains('active'));
  return cOk && sOk;
}
ok(oldRoute('dashboard', 'home'), 'switchTab("dashboard") → home');
ok(oldRoute('today', 'home'), 'switchTab("today") → home');
ok(oldRoute('practice', 'math'), 'switchTab("practice") → math');
ok(oldRoute('math', 'math'), 'switchTab("math") → math');
ok(oldRoute('cs408', 'cs408'), 'switchTab("cs408") → cs408');
ok(oldRoute('sentences', 'mistakes', 'sentences'), 'switchTab("sentences") → mistakes / sub-sentences');
ok(oldRoute('review', 'vocab', 'review'), 'switchTab("review") → vocab / sub-review');
ok(oldRoute('words', 'vocab', 'words'), 'switchTab("words") → vocab / sub-words');
ok(oldRoute('config', 'settings', 'base'), 'switchTab("config") → settings / sub-base');
ok(oldRoute('manual', 'settings', 'manual'), 'switchTab("manual") → settings / sub-manual');
ok(oldRoute('plan', 'data', 'progress'), 'switchTab("plan") → data / sub-progress');
ok(oldRoute('record', 'data', 'records'), 'switchTab("record") → data / sub-records');
ok(oldRoute('sites', 'settings', 'sites'), 'switchTab("sites") → settings / sub-sites');
ok(oldRoute('translate', 'vocab', 'words'), 'switchTab("translate") → vocab / sub-words');

// ---- 9) 内部关键 id 未丢失 ----
const keepIds = ['math-chapters', 'cs408-practice', 'vocab-list', 'review-box', 'practice-box', 'summary-edit', 'plan-items', 'exam-list', 'exam-name', 'exam-scores', 'day-list', 'curated-sites', 'manual-list', 'mistake-list', 'today-onboarding', 'hf-search', 'manual-date', 'btn-save-exam'];
keepIds.forEach(function (id) { ok(!!document.getElementById(id), '内部 id 保留：#' + id); });

// ---- 10) 模考已拆出到 tab-mock（且不在 data 的 sub-records）----
ok(!!document.querySelector('#tab-mock #exam-name'), 'tab-mock 含 #exam-name');
ok(!!document.querySelector('#tab-mock #exam-list'), 'tab-mock 含 #exam-list');
const rec = document.getElementById('sub-records');
ok(rec && !!rec.querySelector('#manual-date'), 'tab-data 的 sub-records 含 #manual-date');
ok(rec && !rec.querySelector('#exam-name'), 'tab-data 的 sub-records 不含 #exam-name');

// ---- 11) 长难句归并到 tab-mistakes ----
ok(!!document.querySelector('#tab-mistakes #sub-sentences'), 'tab-mistakes 含 #sub-sentences');

// ---- 12) 首页零设置控件（倒计时只读除外）----
['exam-date', 'ai-key', 'sync-code', 'goal-hours', 'btn-export', 'w-duration'].forEach(function (id) {
  ok(!document.querySelector('#tab-home #' + id), 'tab-home 不含设置控件 #' + id);
});
ok(!!document.querySelector('#tab-home #timer-rows'), '计时器 DOM 保留在首页');
ok(!!document.querySelector('#tab-home #pomo-time'), '番茄钟 DOM 保留在首页');

// ---- 13) 运行时无错误 ----
ok(runtimeErrors.length === 0, 'window 运行时错误 0（实际 ' + runtimeErrors.length + '）');
ok(jsdomErrors.length === 0, 'jsdom 内部错误 0（实际 ' + jsdomErrors.length + '）');

console.log('\n========== 导航重构（八标签）测试结果 ==========');
console.log('通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail ? 1 : 0);
