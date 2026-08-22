/* jsdom 验证：方案 29 第一版（Block 1 配色 + Block 2 图标）
 * 验收点：
 *  1) iconset.js 加载 + Icon.fill 把 [data-icon] 注入 <svg>
 *  2) 侧栏/底栏/卡片标题无残留装饰性 emoji 主图标
 *  3) :root --primary 为清新蓝 #3E9BE8
 *  4) store COLOR_SCHEMES 收敛为 ['mist','brown']（删 sage/rose/lavender）
 *  5) index.html 背景配色 chips 只剩 清新蓝 + 暖棕
 *  6) 渲染无 runtime error
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
window.fetch = window.fetch || function () { return Promise.reject(new Error('fetch disabled in test')); };

const runtimeErrors = [];
window.addEventListener('error', function (e) {
  const st = e.error && e.error.stack ? e.error.stack.split('\n').slice(0, 4).join(' ← ') : '';
  runtimeErrors.push((e.message || 'window error') + (st ? ' [STACK] ' + st : ''));
});
window.addEventListener('unhandledrejection', function (e) { runtimeErrors.push('promise: ' + (e.reason && e.reason.message || e.reason)); });

// 加载顺序：iconset.js 必须在 app.js 之前（app.js init 调用 Icon.fill）
const order = ['qrcode.min.js', 'iconset.js', 'words.js', 'store.js', 'charts.js', 'share.js', 'md5.js', 'sentences.js', 'app.js'];
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

// 1) iconset.js + Icon.fill
ok(!!window.Icon && typeof window.Icon.fill === 'function', 'iconset.js 加载且 Icon.fill 存在');
const sideIcons = document.querySelectorAll('.side-nav .tab-ic svg');
ok(sideIcons.length === 8, '侧栏 8 个导航图标已注入 SVG（实际 ' + sideIcons.length + '）');
const btbIcons = document.querySelectorAll('.bottom-tabbar .tab-ic svg');
ok(btbIcons.length === 5, '底栏 5 个导航图标已注入 SVG（实际 ' + btbIcons.length + '）');
const inlineIcons = document.querySelectorAll('.ic-inline svg');
ok(inlineIcons.length >= 30, '卡片标题内联图标 ≥30 处已注入 SVG（实际 ' + inlineIcons.length + '）');

// 2) 无残留装饰性 emoji 主图标（侧栏/底栏/卡片标题直系 span 不再含 emoji 文本）
const decoEmoji = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u;
let residual = 0;
document.querySelectorAll('.side-nav .tab-btn span, .bottom-tabbar .btb-btn span, .card-title').forEach(function (n) {
  // 只看"纯文本"节点（不含 svg 子元素）
  const hasSvg = n.querySelector('svg');
  if (hasSvg) return;
  if (decoEmoji.test(n.textContent || '')) residual++;
});
ok(residual === 0, '侧栏/底栏/卡片标题无残留装饰 emoji（实际 ' + residual + '）');

// 3) 配色 token
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
ok(/--primary:\s*#3E9BE8/.test(css), ':root --primary 为清新蓝 #3E9BE8');
ok(/--bg:\s*#F4F8FC/.test(css), ':root --bg 为近白微蓝 #F4F8FC');
ok(!/--primary:\s*#5B9FC9/.test(css.split('--primary: #3E9BE8')[1] || ''), ':root 主色无旧雾蓝 #5B9FC9');

// 4) store COLOR_SCHEMES 收敛
const storeJs = fs.readFileSync(path.join(ROOT, 'store.js'), 'utf8');
const m = storeJs.match(/var COLOR_SCHEMES = \[([^\]]+)\]/);
ok(!!m && m[1].replace(/\s/g, '').indexOf("'sage'") === -1 && m[1].replace(/\s/g, '').indexOf("'rose'") === -1 && m[1].replace(/\s/g, '').indexOf("'lavender'") === -1, 'store COLOR_SCHEMES 已删 sage/rose/lavender');
ok(!!m && /'mist'/.test(m[1]) && /'brown'/.test(m[1]), 'store 仍保留 mist + brown');

// 5) index.html chips 只剩 2 个
const htmlNow = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const chipCount = (htmlNow.match(/data-scheme="/g) || []).length;
ok(chipCount === 2, 'index.html 背景配色 chips 收敛为 2（实际 ' + chipCount + '）');

// 6) 渲染无错误
ok(runtimeErrors.length === 0, '无 runtime error（实际 ' + runtimeErrors.length + (runtimeErrors[0] ? '：' + runtimeErrors[0] : '') + '）');
ok(jsdomErrors.length === 0, '无 jsdom error（实际 ' + jsdomErrors.length + (jsdomErrors[0] ? '：' + jsdomErrors[0] : '') + '）');

console.log('\n==== 结果：' + pass + ' 通过 / ' + fail + ' 失败 ====');
process.exit(fail === 0 ? 0 : 1);
