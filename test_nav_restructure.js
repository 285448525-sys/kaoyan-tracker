/* 导航重构（六标签）专项验证：13 个旧 tab-* 外壳 → 6 个新容器 + 内层 sub 面板 + 子标签切换 */
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
  try { window.eval(code); } catch (e) { console.error('❌ 加载 ' + f + ' 失败: ' + e.message); process.exit(1); }
}
if (typeof window.__switchTab !== 'function') {
  try { document.dispatchEvent(new window.Event('DOMContentLoaded')); } catch (e) { console.error('❌ init 触发失败: ' + e.message); process.exit(1); }
}

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('✅ ' + name); } else { fail++; console.log('❌ ' + name); } }

// ---- 0) 启用 math / cs408 科目（真实 408 用户场景），并解除初始 nav-hidden ----
try {
  window.Store.setConfig({ subjects: [
    { key: 'math', name: '数学', color: '#6366f1' },
    { key: 'cs408', name: '408', color: '#8b5cf6' }
  ] });
} catch (e) {}
['math', 'cs408'].forEach(function (s) {
  var b = document.querySelector('.sub-tab-btn[data-sub="' + s + '"]');
  var p = document.getElementById('sub-' + s);
  if (b) b.classList.remove('nav-hidden');
  if (p) p.classList.remove('nav-hidden');
});

// ---- 1) 6 个新 tab-panel 容器存在且唯一 ----
const containers = ['dashboard', 'practice', 'mistakes', 'vocab', 'data', 'settings'];
containers.forEach(function (c) {
  const el = document.querySelectorAll('#tab-' + c);
  ok(el.length === 1 && el[0].classList.contains('tab-panel'), '容器 tab-' + c + ' 存在且仅一个 tab-panel');
});

// ---- 2) 旧外壳 tab-* 已全部改名 sub-*（不得残留；data/mistakes 是新容器，不在列表） ----
const oldShells = ['config', 'today', 'record', 'words', 'review', 'sentences', 'summary', 'plan', 'math', 'cs408', 'manual', 'websites'];
oldShells.forEach(function (o) {
  const el = document.querySelectorAll('#tab-' + o);
  ok(el.length === 0, '旧外壳 tab-' + o + ' 已不存在');
});

// ---- 3) 底部 Tab Bar 有 6 个 btb-btn ----
const btb = document.querySelectorAll('.bottom-tabbar .btb-btn');
ok(btb.length === 6, '底部 Tab Bar 有 6 个 btb-btn（实际 ' + btb.length + '）');

// ---- 4) 侧栏 6 个 tab-btn ----
const sbtn = document.querySelectorAll('.side-menu .tab-btn');
ok(sbtn.length === 6, '侧栏有 6 个 tab-btn（实际 ' + sbtn.length + '）');

// ---- 5) sub-panel / sub-tab-btn 数量合理 ----
const subPanels = document.querySelectorAll('.sub-panel');
const subBtns = document.querySelectorAll('.sub-tab-btn');
ok(subPanels.length >= 12, 'sub-panel 数量 >= 12（实际 ' + subPanels.length + '）');
ok(subBtns.length >= 12, 'sub-tab-btn 数量 >= 12（实际 ' + subBtns.length + '）');

// ---- 6) 点击子标签切换 .sub-panel.active ----
function clickSub(container, sub) {
  const btn = document.querySelector('#tab-' + container + ' .sub-tab-btn[data-sub="' + sub + '"]');
  if (!btn) return false;
  btn.click();
  const panel = document.getElementById('sub-' + sub);
  return !!(panel && panel.classList.contains('active'));
}
ok(clickSub('practice', 'cs408'), 'practice 切到 cs408 子标签 → sub-cs408 active');
ok(clickSub('vocab', 'review'), 'vocab 切到 review 子标签 → sub-review active');
ok(clickSub('data', 'progress'), 'data 切到 progress 子标签 → sub-progress active');
ok(clickSub('settings', 'manual'), 'settings 切到 manual 子标签 → sub-manual active');

// ---- 7) 旧 tab 名经 switchTab 仍能正确路由（向后兼容） ----
function routeActive(real, sub) {
  window.__switchTab(real === 'today' ? 'dashboard' : real); // 直接验证容器
  return document.querySelector('#tab-' + real) && document.querySelector('#tab-' + real).classList.contains('active');
}
['dashboard', 'practice', 'mistakes', 'vocab', 'data', 'settings'].forEach(function (c) {
  ok(routeActive(c), 'switchTab 容器 ' + c + ' 可激活');
});

// 旧名映射：math→practice(math)、review→vocab(review)、config→settings(base)、record→data(records)
function oldRoute(oldName, container, sub) {
  window.__switchTab(oldName);
  const cOk = document.querySelector('#tab-' + container) && document.querySelector('#tab-' + container).classList.contains('active');
  const sOk = document.getElementById('sub-' + sub) && document.getElementById('sub-' + sub).classList.contains('active');
  return cOk && sOk;
}
ok(oldRoute('math', 'practice', 'math'), 'switchTab("math") → practice / sub-math');
ok(oldRoute('cs408', 'practice', 'cs408'), 'switchTab("cs408") → practice / sub-cs408');
ok(oldRoute('review', 'vocab', 'review'), 'switchTab("review") → vocab / sub-review');
ok(oldRoute('words', 'vocab', 'words'), 'switchTab("words") → vocab / sub-words');
ok(oldRoute('config', 'settings', 'base'), 'switchTab("config") → settings / sub-base');
ok(oldRoute('manual', 'settings', 'manual'), 'switchTab("manual") → settings / sub-manual');
ok(oldRoute('plan', 'data', 'progress'), 'switchTab("plan") → data / sub-progress');
ok(oldRoute('record', 'data', 'records'), 'switchTab("record") → data / sub-records');
ok(oldRoute('sites', 'settings', 'sites'), 'switchTab("sites") → settings / sub-sites');
ok(oldRoute('translate', 'vocab', 'words'), 'switchTab("translate") → vocab / sub-words');

// ---- 8) 计时器已在 Dashboard（首页可见） ----
ok(!!document.querySelector('#tab-dashboard #timer-rows'), '计时器 DOM 已上移至 Dashboard');
ok(!!document.querySelector('#tab-dashboard #pomo-time'), '番茄钟 DOM 已上移至 Dashboard');

// ---- 9) 内部关键 id 未丢失（防 refs 断裂） ----
const keepIds = ['math-chapters', 'cs408-practice', 'vocab-list', 'review-box', 'practice-box', 'summary-edit', 'plan-items', 'exam-list', 'curated-sites', 'manual-list', 'mistake-list', 'today-onboarding', 'hf-search'];
keepIds.forEach(function (id) { ok(!!document.getElementById(id), '内部 id 保留：#' + id); });

// ---- 10) 运行时无错误 ----
ok(runtimeErrors.length === 0, 'window 运行时错误 0（实际 ' + runtimeErrors.length + '）');
ok(jsdomErrors.length === 0, 'jsdom 内部错误 0（实际 ' + jsdomErrors.length + '）');

console.log('\n========== 导航重构测试结果 ==========');
console.log('通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail ? 1 : 0);
