/* jsdom 专项验证：B6 XSS 收敛 —— el()/mountSafe()/setText() 安全挂载助手
 * 验证点：
 *  1) el(tag, cls, text) 第 3 参默认走 textContent（用户文本不会被当 HTML 解析）；
 *  2) mountSafe(node, content) 默认走 textContent（强制转义）；
 *  3) mountSafe(node, content, {raw:true}) 才走 innerHTML（可信 HTML）；
 *  4) 注入 <img onerror> 类载荷时，默认模式不创建任何元素、原样作为文本；
 *  5) 传入 null 节点不抛错。
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
  pretendToBeVisual: true, virtualConsole: vc
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
window.fetch = function () { return Promise.reject(new Error('fetch disabled in test')); };

const runtimeErrors = [];
window.addEventListener('error', function (e) {
  const st = e.error && e.error.stack ? e.error.stack.split('\n').slice(0, 4).join(' ← ') : '';
  runtimeErrors.push((e.message || 'window error') + (st ? ' [STACK] ' + st : ''));
});
window.addEventListener('unhandledrejection', function (e) { runtimeErrors.push('promise: ' + (e.reason && e.reason.message || e.reason)); });

const order = ['qrcode.min.js', 'words.js', 'store.js', 'charts.js', 'share.js', 'md5.js', 'sentences.js', 'app.js'];
for (const f of order) {
  const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
  try { window.eval(code); } catch (e) { console.error('❌ 加载 ' + f + ' 失败: ' + e.message); process.exit(1); }
}
if (typeof window.__switchTab !== 'function') {
  try { document.dispatchEvent(new window.Event('DOMContentLoaded')); } catch (e) { console.error('❌ init 触发失败: ' + e.message); process.exit(1); }
}
if (!window.Store || !window.__xss || typeof window.__switchTab !== 'function') { console.error('❌ Store / __xss / init 未就绪'); process.exit(1); }

const X = window.__xss;
let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('✅ ' + name); } else { fail++; console.log('❌ ' + name); } }

// 1) el() 默认把用户文本当纯文本，不解析 HTML
(function () {
  const payload = '<img src=x onerror="window.__pwned=1">';
  const node = X.el('div', 'x', payload);
  ok(node.textContent === payload, 'el() 第 3 参作为文本保存（textContent 等于原始串）');
  ok(node.querySelectorAll('img').length === 0, 'el() 注入 <img> 载荷时不创建任何元素（XSS 被拦截）');
  ok(window.__pwned === undefined, 'el() 注入 onerror 载荷未触发脚本执行');
})();

// 2) mountSafe 默认走 textContent（强制转义）
(function () {
  const box = document.createElement('div');
  const payload = '<script>window.__pwned2=1<\/script><b>bold</b>';
  X.mountSafe(box, payload);
  ok(box.textContent === payload, 'mountSafe 默认 content 作为文本保存');
  ok(box.querySelectorAll('b').length === 0 && box.querySelectorAll('script').length === 0, 'mountSafe 默认不解析任何 HTML 标签');
  ok(window.__pwned2 === undefined, 'mountSafe 默认未执行注入脚本');
})();

// 3) mountSafe raw:true 才走 innerHTML（用于已 escapeHtml 的可信模板）
(function () {
  const box = document.createElement('div');
  X.mountSafe(box, '<b>hi</b>', { raw: true });
  ok(box.innerHTML === '<b>hi</b>', 'mountSafe raw:true 写入 innerHTML');
  ok(box.querySelector('b') && box.querySelector('b').textContent === 'hi', 'mountSafe raw:true 正确解析可信 HTML');
})();

// 4) setText null/undefined 安全
(function () {
  const box = document.createElement('div');
  X.setText(box, null); ok(box.textContent === '', 'setText(null) 置空不抛错');
  X.setText(box, undefined); ok(box.textContent === '', 'setText(undefined) 置空不抛错');
})();

// 5) null 节点不抛错
(function () {
  let threw = false;
  try { X.mountSafe(null, '<b>x</b>'); X.el(null, 'x', '<b>y</b>'); } catch (e) { threw = true; }
  ok(!threw, 'mountSafe / el 传入 null 节点不抛错');
})();

// 6) 真实数据路径回归：错词本渲染含 HTML 的错词内容不被执行
(function () {
  window.Store.clearWrongWords();
  window.Store.addWrongWord('<img src=x onerror="window.__pwned3=1">', 'xss测试', 'translate');
  // 触发错词本渲染
  window.__switchTab('wrong');
  const list = document.getElementById('wrong-list');
  ok(!!list && list.querySelectorAll('img').length === 0, '错词本渲染含 HTML 的错词内容不创建 img 元素（el 已收口）');
  ok(window.__pwned3 === undefined, '错词本渲染不触发 onerror 脚本');
})();

// 7) 反向陷阱回归：el() 走 textContent 后，调用方不得再 escapeHtml，否则实体被字面显示
//    （曾致数学错题闪卡把 "x>0" 显示成 "x&gt;0"，数学题中 < > & " 为高频字符）
//    闪卡已合并进「错题本」tab 统一速查卡（#mistake-flashcard-box），需切到该 tab 并抽取待复习
(function () {
  const S = window.Store;
  const raw = '当 x>0 且 a<b 时，求 "极限" & 导数';
  const rawNote = '注意 x>0 边界 & 定义域';
  S.addMathMistake({ category: '高数', content: raw, note: rawNote, nextReview: S.todayStr() });
  window.__switchTab('mistakes');
  const scopeSel = document.getElementById('mistake-flash-scope');
  scopeSel.value = 'math';
  scopeSel.dispatchEvent(new window.Event('change', { bubbles: true }));
  document.getElementById('btn-mistake-flash-start').dispatchEvent(new window.Event('click', { bubbles: true }));
  const q = document.querySelector('.flash-q');
  ok(!!q, '数学闪卡正面已渲染');
  ok(!!q && q.textContent === raw,
    '闪卡题面原样显示不含转义实体（期望 "' + raw + '"，实际 "' + (q ? q.textContent : '(未渲染)') + '"）');
  ok(!!q && !/&gt;|&lt;|&amp;|&quot;|&#39;/.test(q.textContent), '闪卡题面无双重转义实体');
  // 翻到背面校验备注
  const showBtn = Array.prototype.filter.call(
    document.querySelectorAll('.flashcard button'),
    function (b) { return /显示|答案/.test(b.textContent || ''); }
  )[0];
  if (showBtn) showBtn.dispatchEvent(new window.Event('click', { bubbles: true }));
  const a = document.querySelector('.flash-a');
  ok(!!a && a.textContent === rawNote,
    '闪卡备注原样显示不含转义实体（期望 "' + rawNote + '"，实际 "' + (a ? a.textContent : '(未渲染)') + '"）');
  // 同时确认「不转义」没有反过来引入 XSS（textContent 天然安全）
  S.addMathMistake({ category: 'xss', content: '<img src=x onerror="window.__pwned4=1">', note: 'n', nextReview: S.todayStr() });
  window.__switchTab('today'); window.__switchTab('mistakes');
  scopeSel.value = 'math';
  document.getElementById('btn-mistake-flash-start').dispatchEvent(new window.Event('click', { bubbles: true }));
  const box = document.getElementById('mistake-flashcard-box') || document.querySelector('.flashcard');
  ok(!box || box.querySelectorAll('img').length === 0, '闪卡渲染 HTML 载荷不创建 img 元素（textContent 仍防 XSS）');
  ok(window.__pwned4 === undefined, '闪卡渲染未触发 onerror 脚本');
})();

ok(runtimeErrors.length === 0, '运行时错误数 = 0（实际 ' + runtimeErrors.length + '）');
ok(jsdomErrors.length === 0, 'jsdom 内部错误数 = 0（实际 ' + jsdomErrors.length + '）');

console.log('\n========== B6 XSS 收敛（mountSafe/el）测试结果 ==========');
console.log('通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail ? 1 : 0);
