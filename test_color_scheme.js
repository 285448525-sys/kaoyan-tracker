/* jsdom 全流程测试：方案 34 —— 背景配色选择器（清新蓝唯一主色，brown 备选已删）
 * 校验：① 设置页仅 1 个配色 chip（mist）；② 默认 data-scheme=mist；③ 非法值清洗；
 *       ④ importJSON 含已删 scheme 清洗；⑤ styles.css 无 brown/sage/rose/lavender 覆盖块；⑥ 版本一致性。
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

// ---------- 1) 设置页仅 1 个配色 chip（清新蓝 mist，方案 34 删 brown） ----------
ok('设置页存在 #color-scheme-group', !!document.getElementById('color-scheme-group'));
const chips = document.getElementById('color-scheme-group')
  ? Array.from(document.getElementById('color-scheme-group').querySelectorAll('.chip')).map(function (c) { return c.getAttribute('data-scheme'); })
  : [];
ok('配色 chip = 1 项（仅 mist），brown 已删', chips.length === 1 && chips.indexOf('mist') >= 0, JSON.stringify(chips));

// ---------- 2) 默认 data-scheme = mist（init 已应用） ----------
ok('init 后 documentElement data-scheme = mist', document.documentElement.getAttribute('data-scheme') === 'mist');
ok('默认 Store.getColorScheme() = mist', Store.getColorScheme() === 'mist');

// ---------- 3) 非法值清洗 + 导入持久化 ----------
function clickScheme(s) {
  var chip = document.querySelector('#color-scheme-group .chip[data-scheme="' + s + '"]');
  if (!chip) { throw new Error('chip 不存在: ' + s); }
  chip.dispatchEvent(new window.Event('click', { bubbles: true }));
}
Store.setColorScheme('brown');
ok('已删 brown：setColorScheme("brown") 仍清洗为 mist', Store.getColorScheme() === 'mist');
Store.setColorScheme('neon');
ok('非法配色值被清洗为 mist', Store.getColorScheme() === 'mist');
Store.importJSON(JSON.stringify({ mistakes: [], mathMistakes: [], cs408Mistakes: [], colorScheme: 'sage' }));
ok('importJSON 含已删 colorScheme=sage → 清洗为 mist', Store.getColorScheme() === 'mist');
Store.importJSON(JSON.stringify({ mistakes: [], colorScheme: 'rainbow' }));
ok('importJSON 非法 colorScheme → 清洗为 mist', Store.getColorScheme() === 'mist');

// ---------- 4) styles.css 无备选覆盖块（单一来源） ----------
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
ok('styles.css 无 brown 覆盖块', css.indexOf('[data-scheme="brown"]') === -1);
ok('styles.css 无 sage 覆盖块', css.indexOf('[data-scheme="sage"]') === -1);
ok('styles.css 无 rose 覆盖块', css.indexOf('[data-scheme="rose"]') === -1);
ok('styles.css 无 lavender 覆盖块', css.indexOf('[data-scheme="lavender"]') === -1);

// ---------- 5) 无旧别名残留（验收标准 7） ----------
ok('styles.css 无 --primary-weak 别名', !/--primary-weak\b/.test(css));
ok('styles.css 无 --primary-ink 别名', !/--primary-ink\b/.test(css));
ok('styles.css 无 --primary-l 别名（单词边界）', !/--primary-l\b/.test(css));
ok('styles.css 无 --primary-d 别名', !/--primary-d\b/.test(css));

// ---------- 6) 版本一致性 ----------
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

console.log('\n========== 背景配色选择器（方案 34 单一主色） 测试结果 ==========');
console.log('通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail ? 1 : 0);
