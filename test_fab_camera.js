/* FAB 拍题入口专项验证（v20260817o）：移动端右下角悬浮按钮改为「拍题」，
 * 点击 → switchTab('mistakes') 跳到拍题卡片 + 拉起相机（复用 btn-capture-cam 流程）。 */
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

console.log('===== FAB 拍题按钮：存在 + 图标 + 语义 =====');
const fab = document.getElementById('fabAction');
ok(!!fab, '#fabAction 悬浮按钮存在');
ok(fab && !!fab.querySelector('[data-icon="camera"]'), 'FAB 图标为相机 SVG（data-icon=camera，拍题入口，非 emoji）');
ok(fab && /拍题/.test(fab.getAttribute('aria-label') || ''), 'FAB aria-label 含「拍题」');

console.log('===== FAB 点击：跳到错题页 + 拉起相机 =====');
const camBtn = document.getElementById('btn-capture-cam');
const mistakesBtn = document.querySelector('.tab-btn[data-tab="mistakes"]');
const homeActiveBefore = (function () { const b = document.querySelector('.tab-btn.active'); return b && b.getAttribute('data-tab'); })();
ok(homeActiveBefore === 'home' || !!homeActiveBefore, '初始有激活的 tab（默认首页）');

// 监控 btn-capture-cam.click 是否被 FAB 调用
let camClicked = 0;
const origCamClick = camBtn.click.bind(camBtn);
camBtn.click = function () { camClicked++; };

try {
  fab.click();
  ok(camClicked === 1, '点 FAB → 触发 btn-capture-cam.click()（拉起相机/相册）');
  const activeAfter = (function () { const b = document.querySelector('.tab-btn.active'); return b && b.getAttribute('data-tab'); })();
  ok(activeAfter === 'mistakes', '点 FAB → 当前激活 tab 切到「错题」（拍题卡片可见）');
  ok(mistakesBtn && mistakesBtn.classList.contains('active'), '「错题」底部 tab 高亮');
} catch (e) { ok(false, 'FAB 点击不抛错 (' + e.message + ')'); }

console.log('===== 已在错题页时再点 FAB：仍拉起相机、不丢失上下文 =====');
camClicked = 0;
try {
  fab.click();
  ok(camClicked === 1, '已在错题页再点 FAB → 仍触发相机');
  const activeNow = (function () { const b = document.querySelector('.tab-btn.active'); return b && b.getAttribute('data-tab'); })();
  ok(activeNow === 'mistakes', '再点 FAB 后仍在「错题」页');
} catch (e) { ok(false, '二次 FAB 点击不抛错 (' + e.message + ')'); }
camBtn.click = origCamClick;

console.log('===== 运行期错误兜底 =====');
ok(runtimeErrors.length === 0, '无运行期错误' + (runtimeErrors.length ? '：' + runtimeErrors.join('; ') : ''));
ok(jsdomErrors.length === 0, '无 jsdom 错误' + (jsdomErrors.length ? '：' + jsdomErrors.join('; ') : ''));

console.log('\n📷 FAB 拍题入口：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
