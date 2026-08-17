/* 移动端核心流程适配专项验证（v20260817d）：拍题相机双按钮/双 input、触控目标高度、FAB 安全区定位、CSS 括号配对 */
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

console.log('===== P0 拍题相机：双按钮 + 双 input =====');
const camInput = document.getElementById('ai-file-cam');
const libInput = document.getElementById('ai-file-lib');
const camBtn = document.getElementById('btn-capture-cam');
const libBtn = document.getElementById('btn-capture-lib');
ok(!!camBtn, 'btn-capture-cam 按钮存在');
ok(!!libBtn, 'btn-capture-lib 按钮存在');
ok(!!camInput, 'ai-file-cam input 存在');
ok(!!libInput, 'ai-file-lib input 存在');
ok(camInput && camInput.getAttribute('accept') === 'image/*', 'ai-file-cam accept="image/*"');
ok(camInput && camInput.getAttribute('capture') === 'environment', 'ai-file-cam 带 capture="environment"（直接拉起后置摄像头）');
ok(libInput && libInput.getAttribute('accept') === 'image/*', 'ai-file-lib accept="image/*"');
ok(libInput && !libInput.hasAttribute('capture'), 'ai-file-lib 无 capture（保留相册入口，iOS 兼容）');

console.log('===== P0 点击按钮 → 触发对应 input.click() =====');
ok(typeof camInput.click === 'function' && typeof libInput.click === 'function', 'input.click 方法可用');
let camClicked = 0, libClicked = 0;
const origCamClick = camInput.click.bind(camInput);
const origLibClick = libInput.click.bind(libInput);
camInput.click = function () { camClicked++; };
libInput.click = function () { libClicked++; };
try {
  if (camBtn) camBtn.click();
  ok(camClicked === 1 && libClicked === 0, '点「拍照」→ 仅触发 ai-file-cam.click()');
  if (libBtn) libBtn.click();
  ok(libClicked === 1 && camClicked === 1, '点「相册」→ 仅触发 ai-file-lib.click()');
} catch (e) { ok(false, '点击按钮不抛错 (' + e.message + ')'); }
camInput.click = origCamClick; libInput.click = origLibClick;

console.log('===== P1 触控目标高度 + FAB 安全区（CSS）=====');
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
ok(/@media\s*\(max-width:\s*560px\)[\s\S]*?\.practice-opt\s*\{\s*min-height:\s*48px/.test(css), '@media(560px) 内含 .practice-opt{min-height:48px}');
ok(/@media\s*\(max-width:\s*560px\)[\s\S]*?\.timer-row\s+\.t-btn\s*\{\s*min-height:\s*42px/.test(css), '@media(560px) 内含 .timer-row .t-btn{min-height:42px}');
ok(css.indexOf('calc(64px + env(safe-area-inset-bottom))') >= 0, '.fab-action 改用 calc(64px + env(safe-area-inset-bottom))');
ok(css.indexOf('position: fixed; bottom: 72px') < 0, '.fab-action 不再写死 bottom:72px');
ok(css.indexOf('.ai-solve-row .btn { flex: 1 1 100%') >= 0, '≤360px 拍题按钮整行堆叠');

console.log('===== P2 杂项：CSS 括号配对 =====');
const open = (css.match(/{/g) || []).length;
const close = (css.match(/}/g) || []).length;
ok(open === close, 'CSS 括号配对 {=' + open + ' }=' + close);

console.log('===== 运行期错误兜底 =====');
ok(runtimeErrors.length === 0, '无运行期错误' + (runtimeErrors.length ? '：' + runtimeErrors.join('; ') : ''));
ok(jsdomErrors.length === 0, '无 jsdom 错误' + (jsdomErrors.length ? '：' + jsdomErrors.join('; ') : ''));

console.log('\n📱 移动端核心流程适配：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
