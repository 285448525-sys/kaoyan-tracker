/* 回归测试：主题设置迁移到设置页（仅 浅色 / 深色，无「跟随系统」） */
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
const order = ['qrcode.min.js', 'words.js', 'store.js', 'charts.js', 'share.js', 'sentences.js', 'app.js'];
for (const f of order) { try { window.eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) { console.error('load fail', f, e.message); process.exit(1); } }
if (typeof window.__switchTab !== 'function') document.dispatchEvent(new window.Event('DOMContentLoaded'));

const Store = window.Store;
let failures = 0;
function assert(cond, msg) { if (!cond) { failures++; console.error('  ✗ ' + msg); } else { console.log('  ✓ ' + msg); } }

// ---- 1) store.js 仅支持 light / dark ----
Store.setTheme('dark');
assert(Store.getTheme() === 'dark', 'Store 可写 dark');
Store.setTheme('light');
assert(Store.getTheme() === 'light', 'Store 可切回 light');

// ---- 2) applyTheme 设置 data-theme 并高亮对应 chip ----
window.switchTab('settings');
Store.setTheme('dark');
window.applyTheme();
assert(document.documentElement.getAttribute('data-theme') === 'dark', 'applyTheme 把 dark 写到 <html>');
// 主题 UI 已由「2 个 chip」收敛为单个开关 checkbox（#theme-toggle + #theme-mode-label）
const toggle = document.getElementById('theme-toggle');
const themeLabel = document.getElementById('theme-mode-label');
assert(!!toggle, '设置页存在主题开关 #theme-toggle');
assert(toggle.checked === true, '深色模式下开关为 checked');
assert(themeLabel && themeLabel.textContent === '深色', '标签显示「深色」（实际 ' + (themeLabel && themeLabel.textContent) + '）');
Store.setTheme('light');
window.applyTheme();
assert(document.documentElement.getAttribute('data-theme') === 'light', 'applyTheme 把 light 写到 <html>');
assert(toggle.checked === false, '浅色模式下开关未选中');
assert(themeLabel && themeLabel.textContent === '浅色', '标签显示「浅色」');
Store.setTheme('dark');
window.applyTheme();
assert(document.documentElement.getAttribute('data-theme') === 'dark', 'applyTheme 回到 dark');

// ---- 3) toggleTheme 在 light/dark 间切换 ----
Store.setTheme('light');
window.toggleTheme(); assert(Store.getTheme() === 'dark', 'toggle 1: light→dark');
window.toggleTheme(); assert(Store.getTheme() === 'light', 'toggle 2: dark→light');

// ---- 4) 点击开关切换主题 ----
Store.setTheme('light'); window.applyTheme();
toggle.click();
assert(Store.getTheme() === 'dark', '点击开关切换到 dark');
assert(toggle.checked === true, '开关变为 checked（浅→深）');

// ---- 5) 侧边栏不再有 theme-toggle / help-btn ----
assert(!document.getElementById('themeToggle'), '侧边栏 themeToggle 已移除');
assert(!document.getElementById('btnHelp'), '侧边栏 btnHelp 已移除');

// ---- 6) 主题区只有浅/深两态，无「跟随系统」 ----
const themeRow = toggle.closest('.field-row') || toggle.parentElement.parentElement;
assert(themeRow && !/跟随系统/.test(themeRow.textContent), '主题区无「跟随系统」选项');

console.log(failures === 0 ? '\nALL PASS ✅' : '\nFAILED ❌ (' + failures + ')');
process.exit(failures === 0 ? 0 : 1);
