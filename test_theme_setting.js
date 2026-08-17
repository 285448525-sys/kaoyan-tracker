/* 回归测试：主题设置迁移到设置页 + 新增 "auto" 跟随系统 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = __dirname;
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace(/<script[\s\S]*?<\/script>/g, '');
const vc = new VirtualConsole(); vc.on('jsdomError', () => {}); vc.on('error', () => {}); vc.on('warn', () => {});
const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://kaoyan-tracker.pages.dev/', pretendToBeVisual: true, virtualConsole: vc });
const { window } = dom; const { document } = window;
window.matchMedia = window.matchMedia || function () { return { matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }; };
window.requestAnimationFrame = window.requestAnimationFrame || function (cb) { return setTimeout(function () { cb(Date.now()); }, 0); };
window.confirm = () => true; window.alert = () => {};
window.HTMLCanvasElement.prototype.getContext = function () { return new Proxy({}, { get: () => () => ({ }), set: () => true }); };
window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,';
window.HTMLCanvasElement.prototype.toBlob = (cb) => cb && cb({});
try { window.localStorage.setItem('kaoyan_tour_done', '1'); } catch (e) {}
window.fetch = window.fetch || function () { return Promise.reject(new Error('x')); };
const order = ['qrcode.min.js', 'words.js', 'store.js', 'charts.js', 'share.js', 'md5.js', 'sentences.js', 'app.js'];
for (const f of order) { try { window.eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) { console.error('load fail', f, e.message); process.exit(1); } }
if (typeof window.__switchTab !== 'function') document.dispatchEvent(new window.Event('DOMContentLoaded'));

const Store = window.Store;
let failures = 0;
function assert(cond, msg) { if (!cond) { failures++; console.error('  ✗ ' + msg); } else { console.log('  ✓ ' + msg); } }

// ---- 1) store.js 支持 auto ----
Store.setTheme('auto');
assert(Store.getTheme() === 'auto', 'Store 可读写 auto');
Store.setTheme('light');
assert(Store.getTheme() === 'light', 'Store 可切回 light');

// ---- 2) resolveTheme 解析 auto ----
const origMatchMedia = window.matchMedia;
window.matchMedia = function (q) { return { matches: true, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }; };
assert(window.resolveTheme('auto') === 'dark', 'auto 在系统深色时解析为 dark');
window.matchMedia = function (q) { return { matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }; };
assert(window.resolveTheme('auto') === 'light', 'auto 在系统浅色时解析为 light');
window.matchMedia = origMatchMedia;
assert(window.resolveTheme('dark') === 'dark', 'dark 保持 dark');
assert(window.resolveTheme('light') === 'light', 'light 保持 light');

// ---- 3) applyTheme 设置 data-theme 并高亮对应 chip ----
window.switchTab('settings');
Store.setTheme('dark');
window.applyTheme();
assert(document.documentElement.getAttribute('data-theme') === 'dark', 'applyTheme 把 dark 写到 <html>');
const chips = Array.from(document.querySelectorAll('#theme-mode-group .chip'));
assert(chips.length === 3, '设置页有 3 个主题 chip');
assert(chips.find(c => c.getAttribute('data-theme') === 'dark').classList.contains('active'), 'dark chip 为 active');
assert(!chips.find(c => c.getAttribute('data-theme') === 'light').classList.contains('active'), 'light chip 不为 active');

// ---- 4) cycleTheme 循环 light → dark → auto → light ----
Store.setTheme('light');
window.cycleTheme(); assert(Store.getTheme() === 'dark', 'cycle 1: light→dark');
window.cycleTheme(); assert(Store.getTheme() === 'auto', 'cycle 2: dark→auto');
window.cycleTheme(); assert(Store.getTheme() === 'light', 'cycle 3: auto→light');

// ---- 5) 点击 chip 切换主题 ----
const autoChip = chips.find(c => c.getAttribute('data-theme') === 'auto');
autoChip.click();
assert(Store.getTheme() === 'auto', '点击 auto chip 切换到 auto');
assert(autoChip.classList.contains('active'), 'auto chip 被高亮');

// ---- 6) 侧边栏不再有 theme-toggle / help-btn ----
assert(!document.getElementById('themeToggle'), '侧边栏 themeToggle 已移除');
assert(!document.getElementById('btnHelp'), '侧边栏 btnHelp 已移除');

console.log(failures === 0 ? '\nALL PASS ✅' : '\nFAILED ❌ (' + failures + ')');
process.exit(failures === 0 ? 0 : 1);
