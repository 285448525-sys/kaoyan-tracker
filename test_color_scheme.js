/* jsdom 全流程测试：版本 n —— 低饱和度背景配色选择器（清新蓝 / 暖棕，方案 29 Block 1 收敛）
 * 校验：① 设置页 2 个配色 chip 存在；② 点击切换 data-scheme 并持久化；③ 非法值清洗；
 *       ④ styles.css 含「暖棕」浅色覆盖块（非 mist）；⑤ 版本一致性。
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = __dirname;
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
  .replace(/<script[\s\S]*?<\/script>/g, '');

const vc = new VirtualConsole();
vc.on('jsdomError', function (e) { console.log('⚠️ JSDOM ERROR:', e.message); });
const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://kaoyan-tracker.pages.dev/', pretendToBeVisual: true, virtualConsole: vc });
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

const order = ['qrcode.min.js', 'words.js', 'store.js', 'charts.js', 'share.js', 'md5.js', 'sentences.js', 'app.js'];
let loadErr = null;
for (const f of order) {
  const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
  try { window.eval(code); } catch (e) { loadErr = '加载 ' + f + ' 失败: ' + e.message; break; }
}
if (loadErr) { console.error('❌ ' + loadErr); process.exit(1); }
if (typeof window.__switchTab !== 'function') {
  try { document.dispatchEvent(new window.Event('DOMContentLoaded')); } catch (e) { console.error('❌ init 触发失败: ' + e.message); process.exit(1); }
}
const Store = window.Store;
if (!Store || typeof window.__switchTab !== 'function') { console.error('❌ Store / init 未就绪'); process.exit(1); }

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('✅ ' + name); }
  else { fail++; console.log('❌ ' + name + (extra !== undefined ? ' → ' + extra : '')); }
}

// ---------- 1) 设置页 2 个配色 chip（mist/brown，删 sage/rose/lavender） ----------
ok('设置页存在 #color-scheme-group', !!document.getElementById('color-scheme-group'));
const chips = document.getElementById('color-scheme-group')
  ? Array.from(document.getElementById('color-scheme-group').querySelectorAll('.chip')).map(function (c) { return c.getAttribute('data-scheme'); })
  : [];
ok('配色 chip = 2 项（mist/brown），已删 sage/rose/lavender', chips.length === 2 && ['mist','brown'].every(function (s) { return chips.indexOf(s) >= 0; }), JSON.stringify(chips));
ok('每个配色 chip 含色点预览 .scheme-dot', document.getElementById('color-scheme-group').querySelectorAll('.scheme-dot').length === 2);

// ---------- 2) 默认 data-scheme = mist（init 已应用） ----------
ok('init 后 documentElement data-scheme = mist', document.documentElement.getAttribute('data-scheme') === 'mist');
ok('默认 Store.getColorScheme() = mist', Store.getColorScheme() === 'mist');

// ---------- 3) 点击切换 + 持久化 ----------
function clickScheme(s) {
  var chip = document.querySelector('#color-scheme-group .chip[data-scheme="' + s + '"]');
  if (!chip) { throw new Error('chip 不存在: ' + s); }
  chip.dispatchEvent(new window.Event('click', { bubbles: true }));
}
clickScheme('brown');
ok('点「暖棕」→ data-scheme=brown', document.documentElement.getAttribute('data-scheme') === 'brown');
ok('点「暖棕」→ Store.getColorScheme()=brown（持久化）', Store.getColorScheme() === 'brown');
ok('点「暖棕」→ 该 chip 高亮 active', document.querySelector('#color-scheme-group .chip[data-scheme="brown"]').classList.contains('active'));
clickScheme('mist');
ok('点回「清新蓝」→ data-scheme=mist', document.documentElement.getAttribute('data-scheme') === 'mist');

// ---------- 4) 非法值清洗 + 导入持久化 ----------
Store.setColorScheme('neon');
ok('非法配色值被清洗为 mist', Store.getColorScheme() === 'mist');
Store.importJSON(JSON.stringify({ mistakes: [], mathMistakes: [], cs408Mistakes: [], colorScheme: 'sage' }));
ok('importJSON 含已删 colorScheme=sage → 清洗为 mist', Store.getColorScheme() === 'mist');
Store.importJSON(JSON.stringify({ mistakes: [], colorScheme: 'rainbow' }));
ok('importJSON 非法 colorScheme → 清洗为 mist', Store.getColorScheme() === 'mist');

// ---------- 5) applyColorScheme 暴露并可重算 ----------
Store.setColorScheme('brown');
window.applyColorScheme();
ok('window.applyColorScheme() 存在且重算 data-scheme=brown', document.documentElement.getAttribute('data-scheme') === 'brown');

// ---------- 6) styles.css 仅含「暖棕」浅色覆盖块（非 mist） ----------
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
const reBrown = /:root:not\(\[data-theme="dark"\]\)\[data-scheme="brown"\]/;
var brownBlock = css.split('\n').filter(function (l) { return reBrown.test(l); });
ok('styles.css 含浅色覆盖块 [data-scheme="brown"]', brownBlock.length === 1, '匹配 ' + brownBlock.length);
var idxBrown = css.search(reBrown);
var segBrown = css.slice(idxBrown, idxBrown + 600);
ok('  └ 该块定义 --bg 与 --primary', /--bg:\s*#/.test(segBrown) && /--primary:\s*#/.test(segBrown));
// 关键：覆盖块限定浅色（:not([data-theme="dark"])），深色不被污染
ok('覆盖块限定浅色（含 :not([data-theme="dark"])）', css.indexOf(':root:not([data-theme="dark"])[data-scheme="brown"]') >= 0);
// 收敛校验：不得残留 sage/rose/lavender 覆盖块
ok('styles.css 已删 sage 覆盖块', css.indexOf('[data-scheme="sage"]') === -1);
ok('styles.css 已删 rose 覆盖块', css.indexOf('[data-scheme="rose"]') === -1);
ok('styles.css 已删 lavender 覆盖块', css.indexOf('[data-scheme="lavender"]') === -1);

// ---------- 7) 版本一致性 ----------
const appJs = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const idxHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const swJs = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const mApp = /APP_VERSION\s*=\s*'([^']+)'/.exec(appJs);
const mSw = /SW_VERSION\s*=\s*'([^']+)'/.exec(swJs);
const appVer = mApp ? mApp[1] : '';
const swVer = mSw ? mSw[1] : '';
const vCount = (idxHtml.match(/\?v=([^"&]+)/g) || []).filter(function (s) { return s.indexOf(appVer) < 0; });
ok('APP_VERSION === SW_VERSION', appVer === swVer, appVer + ' vs ' + swVer);
ok('index.html 全部 ?v= 与 APP_VERSION 一致', vCount.length === 0, vCount.join(','));

console.log('\n========== 背景配色选择器 测试结果 ==========');
console.log('通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail ? 1 : 0);
