/* 视觉层级 · 卡片分区专项验证（v20260817e）：页面底色明度差 / 分区令牌 / 阴影增强 / .section 选择器 / 深色底色 / DOM 包裹 */
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

// 加载业务脚本，确保包裹后的 HTML 仍能正常初始化（回归兜底）
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

// 简单亮度（NTSC 加权，0-100），用于明暗度差比较
function lum100(hex) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 * 100;
}
function readVar(css, name) {
  const m = css.match(new RegExp('--' + name + '\\s*:\\s*#([0-9a-fA-F]{6})'));
  return m ? '#' + m[1] : null;
}

const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');

console.log('===== Phase1：页面底色明度差 + 分区令牌 =====');
const bgLight = readVar(css, 'bg');
ok(bgLight && bgLight.toLowerCase() === '#e9edf4', '--bg 已由 #f8fafc 改为 #e9edf4');
ok(bgLight && (100 - lum100(bgLight)) >= 6, '浅色 --bg 与白卡明度差 ≥ 6（实际 ' + (bgLight ? (100 - lum100(bgLight)).toFixed(1) : '?') + '）');

const sectionBg = readVar(css, 'section-bg');
ok(!!sectionBg, '--section-bg 已定义（分区底色带令牌）');

ok(/--shadow:\s*[^;]*16px/.test(css), '--shadow 增强（含 16px 扩散，浮起感更强）');
ok(/--shadow-sm:\s*[^;]/.test(css), '--shadow-sm 已定义（分区内卡片轻阴影）');

console.log('===== Phase2：.section / .divider / .section .card 选择器 =====');
ok(/\.section\s*\{/.test(css), 'CSS 含 .section { 选择器');
ok(/\.divider\s*\{/.test(css), 'CSS 含 .divider { 选择器');
ok(/\.section\s+\.card\s*\{/.test(css), 'CSS 含 .section .card { 选择器（防双重浮起）');
ok(/--section-bg:\s*#f3f6fb/.test(css), '.section 使用 --section-bg(#f3f6fb)');

console.log('===== 深色模式：--bg 更深 + 分区带 =====');
const darkBlock = css.match(/:root\[data-theme="dark"\]\s*\{([\s\S]*?)\}/);
ok(!!darkBlock, '存在 :root[data-theme="dark"] 块');
if (darkBlock) {
  const dbg = readVar(darkBlock[1], 'bg');
  const dsec = readVar(darkBlock[1], 'section-bg');
  ok(dbg && dbg.toLowerCase() === '#0d0e16', '深色 --bg 改为 #0d0e16（比卡片 #1e2030 更深）');
  ok(dbg && (lum100('#1e2030') - lum100(dbg)) >= 4, '深色 --bg 比卡片 #1e2030 明度差 ≥ 4（实际 ' + (dbg ? (lum100('#1e2030') - lum100(dbg)).toFixed(1) : '?') + '）');
  ok(!!dsec, '深色 --section-bg 已定义');
}

console.log('===== DOM 包裹：每个模块级 .card 都被 .section 包住 =====');
const sections = document.querySelectorAll('.section');
ok(sections.length === 43, '.section 数量 = 43（全站模块级卡片均已包裹），实际 ' + sections.length);
let badWrap = 0, nested = 0;
sections.forEach(function (sec) {
  if (sec.children.length !== 1) badWrap++;
  const c = sec.children[0];
  const isCard = c && ((c.classList && c.classList.contains('card')) || c.tagName === 'DETAILS');
  if (!isCard) badWrap++;
  if (sec.querySelector(':scope > .section')) nested++;
});
ok(badWrap === 0, '每个 .section 恰好包住 1 个 .card（无错位 / 无遗漏）');
ok(nested === 0, '.section 无嵌套（包裹层级正确）');
ok(document.querySelectorAll('.card').length >= 43, '总 .card 数量未减少（结构完整）');

console.log('===== 运行期错误兜底 =====');
ok(runtimeErrors.length === 0, '无运行期错误' + (runtimeErrors.length ? '：' + runtimeErrors.join('; ') : ''));
ok(jsdomErrors.length === 0, '无 jsdom 错误' + (jsdomErrors.length ? '：' + jsdomErrors.join('; ') : ''));

console.log('\n🎨 视觉层级 · 卡片分区：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
