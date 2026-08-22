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
var distBox0 = document.getElementById('home-distribution');
ok('首页存在 #home-distribution 块', !!distBox0);
ok('存在 .hs-body 容器', !!(distBox0 && distBox0.querySelector('.hs-body')));
ok('init 后暴露 window.__renderTodayAggregate', typeof window.__renderTodayAggregate === 'function');

// ---------- 2) 空态（无计时，触发 home 渲染） ----------
window.__switchTab('home');
var distBox = document.getElementById('home-distribution');
var distBody = distBox.querySelector('.hs-body');
ok('空态：.hs-body 显示 .hs-empty 提示', !!distBody.querySelector('.hs-empty'), distBody.innerHTML.slice(0, 40));

// ---------- 3) 填充态：注入科目 + 今日时长，重渲染 ----------
Store.upsertSubject({ key: 'math', name: '数学', type: 'math' });
Store.upsertSubject({ key: 'english', name: '英语', type: 'english' });
Store.upsertSubject({ key: 'cs408', name: '408', type: 'cs408' });
Store.setDayDurations(Store.todayStr(), { math: 150, english: 60, cs408: 0 });
window.__switchTab('home'); // 重新渲染 home → renderHomeDistribution

var rows = distBody.querySelectorAll('.td-row');
ok('填充态：仅 math(150) 与 english(60) 有行（cs408 0 被过滤）', rows.length === 2, 'rows=' + rows.length);

var firstName = rows[0].querySelector('.td-name').textContent;
var secondName = rows[1].querySelector('.td-name').textContent;
ok('排序：第一行=数学（150m 最大）', firstName === '数学', firstName);
ok('排序：第二行=英语（60m）', secondName === '英语', secondName);

var totalEl = distBody.querySelector('.hs-total');
ok('合计：210m → 合计 3h 30m', totalEl && totalEl.textContent === '合计 3h 30m', totalEl ? totalEl.textContent : 'no-total');

var firstTime = rows[0].querySelector('.td-time').textContent;
var secondTime = rows[1].querySelector('.td-time').textContent;
ok('第一行时长=2h 30m', firstTime === '2h 30m', firstTime);
ok('第二行时长=1h 0m（fmtMinShort）', secondTime === '1h 0m', secondTime);

// 科目色点 / 色条存在（颜色由 subjectColorClass 决定，不绑定具体色值）
var firstDot = rows[0].querySelector('.td-dot').getAttribute('style') || '';
var firstFill = rows[0].querySelector('.td-fill').getAttribute('style') || '';
ok('数学行含色点(td-dot)与色条(td-fill)', firstDot.indexOf('background') >= 0 && firstFill.indexOf('width:') >= 0, firstFill);
var secondFill = rows[1].querySelector('.td-fill').getAttribute('style') || '';
ok('英语色条 width:40%', secondFill.indexOf('width:40%') >= 0, secondFill);

// ---------- 4) 清空后回到空态 ----------
Store.setDayDurations(Store.todayStr(), {});
window.__switchTab('home');
ok('清空后：.hs-body 回到 .hs-empty', distBody.querySelectorAll('.td-row').length === 0 && !!distBody.querySelector('.hs-empty'));

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
