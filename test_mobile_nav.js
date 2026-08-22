/* 移动端导航交互回归（v20260822r 修复：关闭态抽屉不可交互 + 导航控件 touch-action）
 * 复现「移动端点击导航无响应、停留在首页」故障并锁定修复：
 *  1) 关闭态 .side-nav 必须 pointer-events:none + visibility:hidden（否则安卓 WebView 下命中树残留，吞点击）
 *  2) .nav-toggle/.tab-btn/.btb-btn/.sub-tab-btn 必须有 touch-action:manipulation（消除 300ms 延迟/吞点）
 *  3) 真实点击流：hamburger→开抽屉、tab-btn→切面板、底栏 btb-btn→切面板，移动端 matchMedia 下均生效
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
vc.on('error', function () {}); vc.on('warn', function () {});

const dom = new JSDOM(html, {
  runScripts: 'outside-only',
  url: 'https://kaoyan-tracker.pages.dev/',
  pretendToBeVisual: true,
  virtualConsole: vc
});
const { window } = dom;
const { document } = window;

// 模拟移动端：max-width:860px 命中
window.matchMedia = function (q) {
  return { matches: true, media: q, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} };
};
window.requestAnimationFrame = function (cb) { return setTimeout(function () { cb(Date.now()); }, 0); };
window.confirm = function () { return true; };
window.alert = function () {};
function mockCtx() { return new Proxy({}, { get: function () { return function () { return mockCtx(); }; }, set: function () { return true; } }); }
window.HTMLCanvasElement.prototype.getContext = function () { return mockCtx(); };
window.HTMLCanvasElement.prototype.toDataURL = function () { return 'data:image/png;base64,'; };
window.HTMLCanvasElement.prototype.toBlob = function (cb) { if (cb) cb({}); };
try { window.localStorage.setItem('kaoyan_tour_done', '1'); } catch (e) {}
window.fetch = function () { return Promise.reject(new Error('fetch disabled')); };

const runtimeErrors = [];
window.addEventListener('error', function (e) { runtimeErrors.push((e.message || 'window error')); });
window.addEventListener('unhandledrejection', function (e) { runtimeErrors.push('promise: ' + (e.reason && e.reason.message || e.reason)); });

const order = ['qrcode.min.js', 'words.js', 'store.js', 'charts.js', 'share.js', 'md5.js', 'sentences.js', 'app.js'];
for (const f of order) {
  const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
  try { window.eval(code); } catch (e) { console.error('加载 ' + f + ' 失败: ' + e.message); process.exit(1); }
}
if (typeof window.__switchTab !== 'function') document.dispatchEvent(new window.Event('DOMContentLoaded'));

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('✅ ' + name); } else { fail++; console.log('❌ ' + name); } }

/* ===== CSS 静态断言：移动端抽屉不可交互 + 导航 touch-action ===== */
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');

// 提取含 .side-nav 的 @media (max-width: 860px) 块（按花括号配平，避免被注释/嵌套 } 截断）
function extractMediaBlock(src, query) {
  let from = 0;
  while (true) {
    const start = src.indexOf('@media ' + query, from);
    if (start < 0) return '';
    let i = src.indexOf('{', start), depth = 0, end = -1;
    for (let j = i; j < src.length; j++) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}') { depth--; if (depth === 0) { end = j; break; } }
    }
    const block = end > 0 ? src.slice(i + 1, end) : '';
    if (block.includes('side-nav')) return block;
    from = end > 0 ? end : src.length;
  }
}
const mobileBlock = extractMediaBlock(css, '(max-width: 860px)');
ok(mobileBlock.length > 0, '@media(max-width:860px) 块存在（含 .side-nav 抽屉规则）');

// 关闭态 .side-nav 必须有 pointer-events:none 与 visibility:hidden
ok(/\.side-nav\s*\{[^}]*pointer-events:\s*none/.test(mobileBlock), '关闭态 .side-nav 含 pointer-events:none（抽屉不可交互，避免吞点击）');
ok(/\.side-nav\s*\{[^}]*visibility:\s*hidden/.test(mobileBlock), '关闭态 .side-nav 含 visibility:hidden（移出命中树）');
// 打开态恢复可交互
ok(/body\.nav-open\s+\.side-nav\s*\{[^}]*pointer-events:\s*auto/.test(mobileBlock), '打开态 body.nav-open .side-nav 含 pointer-events:auto');
ok(/body\.nav-open\s+\.side-nav\s*\{[^}]*visibility:\s*visible/.test(mobileBlock), '打开态 body.nav-open .side-nav 含 visibility:visible');

// 导航控件 touch-action:manipulation
ok(/\.nav-toggle,\s*\.tab-btn,\s*\.btb-btn,\s*\.sub-tab-btn\s*\{\s*touch-action:\s*manipulation/.test(css),
  '.nav-toggle/.tab-btn/.btb-btn/.sub-tab-btn 含 touch-action:manipulation（消除吞点/延迟）');

/* ===== 真实点击流（移动端） ===== */
function activePanel() { const p = document.querySelector('.tab-panel.active'); return p ? p.id : '(none)'; }
function activeTabBtn() { const b = document.querySelector('.tab-btn.active'); return b ? b.getAttribute('data-tab') : '(none)'; }

ok(activePanel() === 'tab-home', '初始激活面板 = tab-home（实际 ' + activePanel() + '）');

const mathBtn = document.querySelector('.tab-btn[data-tab="math"]');
ok(!!mathBtn, '侧栏存在 data-tab="math" 按钮');
try { mathBtn.click(); } catch (e) { ok(false, '点击 math 抛错：' + e.message); }
ok(activePanel() === 'tab-math', '点击侧栏 math → 激活 tab-math（实际 ' + activePanel() + '）');

const btbVocab = document.querySelector('.bottom-tabbar .btb-btn[data-tab="vocab"]');
ok(!!btbVocab, '底栏存在 data-tab="vocab" 按钮');
try { btbVocab.click(); } catch (e) { ok(false, '点击 vocab 底栏抛错：' + e.message); }
ok(activePanel() === 'tab-vocab', '点击底栏 vocab → 激活 tab-vocab（实际 ' + activePanel() + '）');

const navToggle = document.getElementById('navToggle');
const backdrop = document.getElementById('navBackdrop');
ok(!!navToggle && !!backdrop, 'navToggle / navBackdrop 均存在');
ok(!document.body.classList.contains('nav-open'), '初始 body 无 nav-open');
try { navToggle.click(); } catch (e) { ok(false, '点击 navToggle 抛错：' + e.message); }
ok(document.body.classList.contains('nav-open'), '点击 navToggle → body.nav-open（抽屉展开）');
// 抽屉展开后点击侧栏应切换且关闭抽屉（移动端 showTab 会移除 nav-open）
const csBtn = document.querySelector('.tab-btn[data-tab="cs408"]');
try { csBtn.click(); } catch (e) { ok(false, '展开态点击 cs408 抛错：' + e.message); }
ok(activePanel() === 'tab-cs408', '展开态点击 cs408 → 激活 tab-cs408（实际 ' + activePanel() + '）');
ok(!document.body.classList.contains('nav-open'), '切换后移动端自动关闭抽屉（无 nav-open）');
try { backdrop.click(); } catch (e) { ok(false, '点击 backdrop 抛错：' + e.message); }
ok(!document.body.classList.contains('nav-open'), '点击 backdrop → 关闭抽屉');

/* ===== 错误兜底 ===== */
ok(runtimeErrors.length === 0, '无运行期错误' + (runtimeErrors.length ? '：' + runtimeErrors.join('; ') : ''));
ok(jsdomErrors.length === 0, '无 jsdom 错误' + (jsdomErrors.length ? '：' + jsdomErrors.join('; ') : ''));

console.log('\n📱 移动端导航回归：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
