/* jsdom 全流程测试：版本 e —— 首页「今日学习分布」卡（截图标配）
 * 校验：① 卡片 DOM 结构存在；② 空态（无计时→空态文案+合计0m）；
 *       ③ 填充态（科目色条+时长，按时长降序、合计正确、科目语义色正确）；
 *       ④ 清空后回到空态；⑤ 版本一致性。
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
if (!Store || typeof window.__renderTodayAggregate !== 'function') { console.error('❌ Store / init 未就绪'); process.exit(1); }

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('✅ ' + name); }
  else { fail++; console.log('❌ ' + name + (extra !== undefined ? ' → ' + extra : '')); }
}

// ---------- 1) 卡片 DOM 结构 ----------
ok('首页存在 #today-dist 卡', !!document.getElementById('today-dist'));
ok('存在 #td-rows 容器', !!document.getElementById('td-rows'));
ok('存在 #td-total 合计', !!document.getElementById('td-total'));
ok('存在 #td-empty 空态', !!document.getElementById('td-empty'));
ok('init 后暴露 window.__renderTodayAggregate', typeof window.__renderTodayAggregate === 'function');

// ---------- 2) 空态（无计时） ----------
const tdRows = document.getElementById('td-rows');
const tdTotal = document.getElementById('td-total');
const tdEmpty = document.getElementById('td-empty');
ok('空态：#td-rows 无行', tdRows.querySelectorAll('.td-row').length === 0, 'rows=' + tdRows.querySelectorAll('.td-row').length);
ok('空态：#td-total = 合计 0m', tdTotal.textContent === '合计 0m', tdTotal.textContent);
ok('空态：#td-empty 可见（hidden=false）', tdEmpty.hidden === false);

// ---------- 3) 填充态：注入科目 + 今日时长，重渲染 ----------
Store.upsertSubject({ key: 'math', name: '数学', type: 'math' });
Store.upsertSubject({ key: 'english', name: '英语', type: 'english' });
Store.upsertSubject({ key: 'cs408', name: '408', type: 'cs408' });
Store.setDayDurations(Store.todayStr(), { math: 150, english: 60, cs408: 0 });
window.__renderTodayAggregate();

const rows = tdRows.querySelectorAll('.td-row');
ok('填充态：仅 math(150) 与 english(60) 有行（cs408 0 被过滤）', rows.length === 2, 'rows=' + rows.length);

// 按时长降序：第一行应为 数学(150)
const firstName = rows[0].querySelector('.td-name').textContent;
const secondName = rows[1].querySelector('.td-name').textContent;
ok('排序：第一行=数学（150m 最大）', firstName === '数学', firstName);
ok('排序：第二行=英语（60m）', secondName === '英语', secondName);

// 合计 150+60=210m = 3h 30m
ok('合计：210m → 合计 3h 30m', tdTotal.textContent === '合计 3h 30m', tdTotal.textContent);

// 各自行时长文本
const firstTime = rows[0].querySelector('.td-time').textContent;
const secondTime = rows[1].querySelector('.td-time').textContent;
ok('第一行时长=2h 30m', firstTime === '2h 30m', firstTime);
ok('第二行时长=1h 0m（方案 fmtMinShort 定义）', secondTime === '1h 0m', secondTime);

// 科目语义色（内联 style）
const firstDot = rows[0].querySelector('.td-dot').getAttribute('style') || '';
const secondDot = rows[1].querySelector('.td-dot').getAttribute('style') || '';
ok('数学色点= #8b5cf6', firstDot.indexOf('#8b5cf6') >= 0, firstDot);
ok('英语色点= #3b82f6', secondDot.indexOf('#3b82f6') >= 0, secondDot);

// 色条宽度（max=150 → 数学100%，英语 round(60/150*100)=40%，均≥6）
const firstFill = rows[0].querySelector('.td-fill').getAttribute('style') || '';
const secondFill = rows[1].querySelector('.td-fill').getAttribute('style') || '';
ok('数学色条 width:100%', firstFill.indexOf('width:100%') >= 0, firstFill);
ok('英语色条 width:40%', secondFill.indexOf('width:40%') >= 0, secondFill);

// 空态已隐藏
ok('填充态：#td-empty 隐藏（hidden=true）', tdEmpty.hidden === true);

// ---------- 4) 清空后回到空态 ----------
Store.setDayDurations(Store.todayStr(), {});
window.__renderTodayAggregate();
ok('清空后：#td-rows 无行', tdRows.querySelectorAll('.td-row').length === 0);
ok('清空后：#td-total = 合计 0m', tdTotal.textContent === '合计 0m', tdTotal.textContent);
ok('清空后：#td-empty 再次可见', tdEmpty.hidden === false);

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

console.log('\n========== 今日学习分布卡 测试结果 ==========');
console.log('通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail ? 1 : 0);
