/* test_nav_8tab.js — 主导航 8 标签重构（v20260817k）验收（对应 B 方案第九节 9 项验收）
 * 仅做「八标签专属」断言 + SW_VERSION 与 APP_VERSION 同频，不重复 test_nav_restructure.js 的向后兼容全量。 */
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

const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://kaoyan-tracker.pages.dev/', pretendToBeVisual: true, virtualConsole: vc });
const { window } = dom;
const { document } = window;
window.matchMedia = window.matchMedia || function () { return { matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }; };
window.requestAnimationFrame = window.requestAnimationFrame || function (cb) { return setTimeout(function () { cb(Date.now()); }, 0); };
window.confirm = function () { return true; }; window.alert = function () {};
function mockCtx() { return new Proxy({}, { get: function () { return function () { return mockCtx(); }; }, set: function () { return true; } }); }
window.HTMLCanvasElement.prototype.getContext = function () { return mockCtx(); };
window.HTMLCanvasElement.prototype.toDataURL = function () { return 'data:image/png;base64,'; };
window.HTMLCanvasElement.prototype.toBlob = function (cb) { if (cb) cb({}); };
try { window.localStorage.setItem('kaoyan_tour_done', '1'); } catch (e) {}
window.fetch = window.fetch || function () { return Promise.reject(new Error('fetch disabled')); };
const runtimeErrors = [];
window.addEventListener('error', function (e) { runtimeErrors.push(e.message || 'window error'); });
window.addEventListener('unhandledrejection', function (e) { runtimeErrors.push('promise: ' + (e.reason && e.reason.message || e.reason)); });

const order = ['qrcode.min.js', 'words.js', 'store.js', 'charts.js', 'share.js', 'md5.js', 'sentences.js', 'app.js'];
for (const f of order) { try { window.eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) { console.error('加载 ' + f + ' 失败: ' + e.message); process.exit(1); } }
if (typeof window.__switchTab !== 'function') { try { document.dispatchEvent(new window.Event('DOMContentLoaded')); } catch (e) {} }

let pass = 0, fail = 0;
function ok(c, n) { if (c) { pass++; console.log('✅ ' + n); } else { fail++; console.log('❌ ' + n); } }

const REQUIRED = ['home', 'math', 'cs408', 'vocab', 'mistakes', 'mock', 'data', 'settings'];

// 1) 8 个顶层容器唯一
const found = REQUIRED.filter(function (c) { const e = document.querySelectorAll('#tab-' + c); return e.length === 1 && e[0].classList.contains('tab-panel'); });
ok(found.length === 8, '8 个顶层容器唯一存在（' + found.length + '/8）');

// 2) 旧 id 不残留
ok(document.getElementById('tab-dashboard') === null, 'tab-dashboard 不残留');
ok(document.getElementById('tab-practice') === null, 'tab-practice 不残留');

// 3) 侧栏 8 + 底栏 8，data-tab 集合一致
const side = Array.prototype.slice.call(document.querySelectorAll('.side-menu .tab-btn')).map(function (b) { return b.getAttribute('data-tab'); }).sort();
const btb = Array.prototype.slice.call(document.querySelectorAll('.bottom-tabbar .btb-btn')).map(function (b) { return b.getAttribute('data-tab'); }).sort();
ok(side.length === 8 && JSON.stringify(side) === JSON.stringify(REQUIRED.slice().sort()), '侧栏 8 .tab-btn 集合正确');
ok(btb.length === 8 && JSON.stringify(btb) === JSON.stringify(REQUIRED.slice().sort()), '底栏 8 .btb-btn 集合正确');

// 4) 切换：showTab('math') 后仅 tab-math.active
document.querySelector('.tab-btn[data-tab="math"]').click();
const activeAfter = Array.prototype.slice.call(document.querySelectorAll('.tab-panel.active')).map(function (p) { return p.id; });
ok(activeAfter.length === 1 && activeAfter[0] === 'tab-math', '切到 math 后仅 tab-math.active（实际 ' + JSON.stringify(activeAfter) + '）');

// 5) 向后兼容：dashboard→home，practice→math
window.__switchTab('dashboard');
ok(document.getElementById('tab-home').classList.contains('active'), 'switchTab("dashboard") → tab-home');
window.__switchTab('practice');
ok(document.getElementById('tab-math').classList.contains('active'), 'switchTab("practice") → tab-math');

// 6) 模考拆出
ok(!!document.querySelector('#tab-mock #exam-name'), 'tab-mock 含 #exam-name');
ok(!!document.querySelector('#tab-mock #exam-list'), 'tab-mock 含 #exam-list');
const rec = document.getElementById('sub-records');
ok(rec && !!rec.querySelector('#manual-date') && !rec.querySelector('#exam-name'), 'tab-data 的 sub-records 含 manual-date 不含 exam-name');

// 7) 长难句归并
ok(!!document.querySelector('#tab-mistakes #sub-sentences'), 'tab-mistakes 含 #sub-sentences');

// 8) SW_VERSION 递增且与 APP_VERSION 同频
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const appver = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8').match(/APP_VERSION\s*=\s*'([^']+)'/);
const swver = sw.match(/SW_VERSION\s*=\s*'([^']+)'/);
ok(!!swver && swver[1] !== '20260817g', 'SW_VERSION 已递增（实际 ' + (swver && swver[1]) + '）');
ok(!!appver && !!swver && appver[1] === swver[1], 'SW_VERSION 与 APP_VERSION 同频（app=' + (appver && appver[1]) + ' sw=' + (swver && swver[1]) + '）');

// 9) 首页零设置控件
['exam-date', 'ai-key', 'sync-code', 'goal-hours', 'btn-export'].forEach(function (id) {
  ok(!document.querySelector('#tab-home #' + id), 'tab-home 不含设置控件 #' + id);
});
ok(!!document.querySelector('#tab-home #smart-plan'), 'tab-home 含折叠智能计划 #smart-plan');
ok(document.querySelector('#tab-home #smart-plan').closest('details') !== null, '智能计划包裹在 <details> 折叠内');

// 零错误
ok(runtimeErrors.length === 0, 'window 运行时错误 0（实际 ' + runtimeErrors.length + '）');
ok(jsdomErrors.length === 0, 'jsdom 错误 0（实际 ' + jsdomErrors.length + '）');

console.log('\n========== 8 标签验收（test_nav_8tab.js）==========');
console.log('通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail ? 1 : 0);
