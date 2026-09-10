/* jsdom 全流程测试：背景配色（feature 已于 20260910b 移除 UI）
 * 20260910b 起 #color-scheme-group 与 data-scheme 应用已从设置页与 app.js 删除；
 * 仅保留 store 层的非法值清洗逻辑（向后兼容旧备份导入）。
 * 本测试校验：① store 默认 colorScheme=mist；② 非法/已删 scheme 清洗；
 *   ③ styles.css 无 brown/sage/rose/lavender 覆盖块；④ 无旧主色别名；⑤ 版本一致性。
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

const order = ['qrcode.min.js', 'words.js', 'store.js', 'charts.js', 'share.js', 'sentences.js', 'app.js'];
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

// ---------- 1) store 默认 colorScheme = mist（feature 已移除，仅校验清洗逻辑） ----------
ok('默认 Store.getColorScheme() = mist', Store.getColorScheme() === 'mist');

// ---------- 2) 非法值清洗 + 导入持久化 ----------
Store.setColorScheme('brown');
ok('已删 brown：setColorScheme("brown") 仍清洗为 mist', Store.getColorScheme() === 'mist');
Store.setColorScheme('neon');
ok('非法配色值被清洗为 mist', Store.getColorScheme() === 'mist');
Store.importJSON(JSON.stringify({ mistakes: [], mathMistakes: [], cs408Mistakes: [], colorScheme: 'sage' }));
ok('importJSON 含已删 colorScheme=sage → 清洗为 mist', Store.getColorScheme() === 'mist');
Store.importJSON(JSON.stringify({ mistakes: [], colorScheme: 'rainbow' }));
ok('importJSON 非法 colorScheme → 清洗为 mist', Store.getColorScheme() === 'mist');

// ---------- 3) styles.css 无备选覆盖块（单一来源） ----------
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
ok('styles.css 无 brown 覆盖块', css.indexOf('[data-scheme="brown"]') === -1);
ok('styles.css 无 sage 覆盖块', css.indexOf('[data-scheme="sage"]') === -1);
ok('styles.css 无 rose 覆盖块', css.indexOf('[data-scheme="rose"]') === -1);
ok('styles.css 无 lavender 覆盖块', css.indexOf('[data-scheme="lavender"]') === -1);

// ---------- 4) 无旧别名残留（验收标准 7） ----------
ok('styles.css 无 --primary-weak 别名', !/--primary-weak\b/.test(css));
ok('styles.css 无 --primary-ink 别名', !/--primary-ink\b/.test(css));
ok('styles.css 无 --primary-l 别名（单词边界）', !/--primary-l\b/.test(css));
ok('styles.css 无 --primary-d 别名', !/--primary-d\b/.test(css));

// ---------- 5) 版本一致性 ----------
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

console.log('\n========== 配色 / 版本一致性 测试结果（20260910b feature 移除后） ==========');
console.log('通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail ? 1 : 0);
