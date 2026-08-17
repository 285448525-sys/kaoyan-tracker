/* jsdom 专项验证：生词记录升级（20260817a）
   覆盖：① addVocab 5 新字段  ② 管道符导入 6 列  ③ 列表渲染分类 pill + 音标
        ④ XSS 防护（example 注入脚本不执行）  ⑤ 筛选/搜索 filterVocab */
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

// ---- 在 store.js 加载前注入种子数据 + 关闭引导 ----
try { window.localStorage.setItem('kaoyan_tour_done', '1'); } catch (e) {}
const seedVocab = [
  { id: 'vb_seed_tcp', word: 'tcp', cn: '传输控制协议', phonetic: '/tiː siː piː/', pos: 'abbr.', example: 'TCP is reliable.', note: '网络层', category: '计算机网络', box: 1, next: '2099-01-01', added: '2026-08-17', wrong: 0, last: '' },
  { id: 'vb_seed_xss', word: 'xss', cn: '测试', phonetic: '', pos: '', example: '<img src=x onerror=alert(1)>', note: '', category: '其他', box: 1, next: '2099-01-01', added: '2026-08-17', wrong: 0, last: '' }
];
try { window.localStorage.setItem('kaoyan_tracker_v1', JSON.stringify({ vocab: seedVocab })); } catch (e) {}

const order = ['qrcode.min.js', 'words.js', 'store.js', 'charts.js', 'share.js', 'md5.js', 'sentences.js', 'app.js'];
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

setTimeout(function () {
  // ============ ① addVocab 5 新字段 ============
  Store.addVocab('fifo', '先进先出', { phonetic: '/ˈfaɪfoʊ/', pos: 'abbr.', example: 'FIFO queue.', category: '数据结构' });
  const fifo = Store.getVocab().filter(function (v) { return v.word === 'fifo'; })[0];
  ok(!!fifo, 'addVocab 新增词存在');
  ok(fifo && fifo.phonetic === '/ˈfaɪfoʊ/', 'addVocab 写入 phonetic');
  ok(fifo && fifo.pos === 'abbr.', 'addVocab 写入 pos');
  ok(fifo && fifo.example === 'FIFO queue.', 'addVocab 写入 example');
  ok(fifo && fifo.category === '数据结构', 'addVocab 写入 category（非默认）');

  // ============ ② 管道符导入 6 列 ============
  const importBox = document.getElementById('import-text');
  importBox.value = 'abandon|放弃；抛弃|/əˈbændən/|v.|He abandoned it.|其他';
  document.getElementById('btn-import-words').click();
  const abandoned = Store.getVocab().filter(function (v) { return v.word === 'abandon'; })[0];
  ok(!!abandoned, '管道符导入：新增 abandon');
  ok(abandoned && abandoned.cn === '放弃；抛弃', '管道符导入：cn');
  ok(abandoned && abandoned.phonetic === '/əˈbændən/', '管道符导入：phonetic');
  ok(abandoned && abandoned.pos === 'v.', '管道符导入：pos');
  ok(abandoned && abandoned.example === 'He abandoned it.', '管道符导入：example');
  ok(abandoned && abandoned.category === '其他', '管道符导入：category');

  // ============ ③ 列表渲染：分类 pill + 音标 ============
  const listHtml = document.getElementById('vocab-list').innerHTML;
  ok(listHtml.indexOf('计算机网络') >= 0, 'renderWords：渲染分类 pill（计算机网络）');
  ok(listHtml.indexOf('/tiː siː piː/') >= 0, 'renderWords：渲染音标（/tiː siː piː/）');
  const tcpItem = Array.prototype.find.call(document.querySelectorAll('#vocab-list .mistake-item'), function (it) { return it.textContent.indexOf('tcp') >= 0; });
  ok(!!tcpItem && tcpItem.querySelector('.vocab-cat-pill') && tcpItem.querySelector('.vocab-cat-pill').textContent === '计算机网络', 'renderWords：tcp 卡片带分类 pill');

  // ============ ④ XSS 防护 ============
  const xssItem = Array.prototype.find.call(document.querySelectorAll('#vocab-list .mistake-item'), function (it) { return it.textContent.indexOf('xss') >= 0; });
  ok(!!xssItem, 'XSS：xss 种子词已渲染');
  const exEl = xssItem && xssItem.querySelector('.vocab-ex');
  ok(!!exEl, 'XSS：example 渲染为 .vocab-ex 元素');
  ok(exEl && exEl.textContent === '<img src=x onerror=alert(1)>', 'XSS：example 原样作为文本（textContent）');
  ok(document.querySelectorAll('#vocab-list img').length === 0, 'XSS：未生成 <img> 元素（脚本未执行）');

  // ============ ⑤ 筛选 / 搜索 ============
  const filterSel = document.getElementById('vocab-filter');
  filterSel.value = '计算机网络';
  filterSel.dispatchEvent(new window.Event('change'));
  const afterFilter = document.getElementById('vocab-list').textContent;
  ok(afterFilter.indexOf('tcp') >= 0, '筛选「计算机网络」：tcp 仍在');
  ok(afterFilter.indexOf('xss') < 0, '筛选「计算机网络」：其他类 xss 被过滤掉');
  // 还原为全部，验证搜索
  filterSel.value = 'all';
  filterSel.dispatchEvent(new window.Event('change'));
  const searchBox = document.getElementById('vocab-search');
  searchBox.value = 'abandon';
  searchBox.dispatchEvent(new window.Event('input'));
  const afterSearch = document.getElementById('vocab-list').textContent;
  ok(afterSearch.indexOf('abandon') >= 0, '搜索「abandon」：命中');
  ok(afterSearch.indexOf('tcp') < 0, '搜索「abandon」：非命中 tcp 被过滤');

  // ============ 运行期错误检查 ============
  ok(runtimeErrors.length === 0, '运行期无 JS 错误（' + runtimeErrors.length + '）');
  ok(jsdomErrors.length === 0, 'jsdom 无加载错误（' + jsdomErrors.length + '）');

  console.log('\n==== 生词记录升级测试：' + pass + ' 通过 / ' + fail + ' 失败 ====');
  process.exit(fail === 0 ? 0 : 1);
}, 700);
