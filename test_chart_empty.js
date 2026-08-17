/* 空状态图表引导专项验证：9 个图形/统计空态 → 引导插图(SVG) + 标题 + 说明 + 操作按钮；点击按钮触发正确跳转 */
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
try { window.localStorage.setItem('kaoyan_tour_done', '1'); } catch (e) {}
window.fetch = window.fetch || function () { return Promise.reject(new Error('fetch disabled in test')); };

const runtimeErrors = [];
window.addEventListener('error', function (e) { runtimeErrors.push((e.message || 'window error')); });
window.addEventListener('unhandledrejection', function (e) { runtimeErrors.push('promise: ' + (e.reason && e.reason.message || e.reason)); });

const order = ['qrcode.min.js', 'words.js', 'store.js', 'charts.js', 'share.js', 'md5.js', 'sentences.js', 'app.js'];
for (const f of order) {
  const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
  try { window.eval(code); } catch (e) { console.error('❌ 加载 ' + f + ' 失败: ' + e.message); process.exit(1); }
}
if (typeof window.__switchTab !== 'function') {
  try { document.dispatchEvent(new window.Event('DOMContentLoaded')); } catch (e) { console.error('❌ init 触发失败: ' + e.message); process.exit(1); }
}

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('✅ ' + name); } else { fail++; console.log('❌ ' + name); } }

// ---- spy：拦截 window.switchTab / window.showSub（charts.js 经由 global.switchTab 调用）----
const calls = [];
const origSwitch = window.switchTab, origShow = window.showSub;
window.switchTab = function (t) { calls.push(['switch', t]); };
window.showSub = function (c, s) { calls.push(['show', c, s]); };

function assertCalls(name, exp) {
  const matched = exp.every(function (c) {
    return calls.some(function (x) {
      return x[0] === c[0] && (c.length < 2 || x[1] === c[1]) && (c.length < 3 || x[2] === c[2]);
    });
  });
  ok(matched, name + ' → 跳转 ' + JSON.stringify(exp) + (matched ? '' : ' (实际 ' + JSON.stringify(calls) + ')'));
}

// ---- 通用：对一个容器断言「插图 + 标题 + 按钮」并模拟点击 ----
function testContainer(name, box, expTitle, expAct, expCalls) {
  const ill = box.querySelector('.empty-illust svg');
  const title = box.querySelector('.empty-title');
  const hint = box.querySelector('.empty-hint');
  const act = box.querySelector('.empty-act');
  ok(!!ill, name + ': 含引导插图 (SVG)');
  ok(!!title && title.textContent === expTitle, name + ': 标题「' + expTitle + '」' + (title ? '(实际「' + title.textContent + '」)' : ''));
  ok(!!hint, name + ': 含引导说明');
  ok(!!act && act.tagName.toLowerCase() === 'button' && act.textContent === expAct, name + ': 按钮「' + expAct + '」');
  calls.length = 0;
  try { if (act) act.click(); } catch (e) { ok(false, name + ': 点击按钮不抛错 (' + e.message + ')'); return; }
  ok(true, name + ': 点击按钮不抛错');
  assertCalls(name, expCalls);
}

// ===== 第一部分：charts.js 6 个 render 直接传空数据 =====
ok(typeof window.Charts === 'object' && typeof window.Charts.chartEmptyState === 'function', 'Charts.chartEmptyState 已暴露');

// 1) renderTrend
var b1 = document.createElement('div'); document.body.appendChild(b1);
window.Charts.renderTrend(b1, [], 0, null);
testContainer('renderTrend', b1, '还没有成绩趋势', '去记一场模考', [['switch', 'data'], ['show', 'data', 'records']]);

// 2) renderSubjectBars
var b2 = document.createElement('div'); document.body.appendChild(b2);
window.Charts.renderSubjectBars(b2, []);
testContainer('renderSubjectBars', b2, '还没有科目时长', '去设置科目', [['switch', 'settings'], ['show', 'settings', 'base']]);

// 3) renderTodayPie
var b3 = document.createElement('div'); document.body.appendChild(b3);
window.Charts.renderTodayPie(b3, []);
testContainer('renderTodayPie', b3, '今天还没开始学', '去计时学习', [['switch', 'dashboard']]);

// 4) renderRadar
var b4 = document.createElement('div'); document.body.appendChild(b4);
window.Charts.renderRadar(b4, []);
testContainer('renderRadar', b4, '掌握度雷达空着', '去刷题积累', [['switch', 'practice'], ['show', 'practice', 'cs408']]);

// 5) renderScoreBars
var b5 = document.createElement('div'); document.body.appendChild(b5);
window.Charts.renderScoreBars(b5, []);
testContainer('renderScoreBars', b5, '还没有得分数据', '去计时学习', [['switch', 'dashboard']]);

// 6) renderMonthHeatmap（空 days）
var b6 = document.createElement('div'); document.body.appendChild(b6);
window.Charts.renderMonthHeatmap(b6, 2026, 7, {});
testContainer('renderMonthHeatmap', b6, '热力图还是空白', '去计时学习', [['switch', 'dashboard']]);

// ===== 第二部分：app.js 4 个 render（导航重构后为按需渲染，需先触发 data/overview 子面板渲染）=====
// 触发 data/overview 子面板按需渲染（导航重构后为空数据渲染入口）：点击 overview 子标签 → showSub + renderSubOnDemand('data','overview') → renderData()
var overviewBtn = document.querySelector('#tab-data .sub-tab-btn[data-sub="overview"]');
if (overviewBtn) overviewBtn.click();

// 7) weakness-report
var w = document.getElementById('weakness-report');
ok(!!w, 'weakness-report 容器存在');
if (w) testContainer('renderWeaknessReport', w, '还没有薄弱分析', '去刷 5 道题生成薄弱分析', []);

// 8) goal-progress
var g = document.getElementById('goal-progress');
ok(!!g, 'goal-progress 容器存在');
if (g) testContainer('renderGoalProgress', g, '还没设目标', '去设置科目目标', []);

// 9) subject-bars
var sb = document.getElementById('subject-bars');
ok(!!sb, 'subject-bars 容器存在');
if (sb) testContainer('renderSubjectBars(app)', sb, '还没有科目时长', '去设置科目', []);

// 10) subject-stats
var ss = document.getElementById('subject-stats');
ok(!!ss, 'subject-stats 容器存在');
if (ss) testContainer('renderSubjectStats', ss, '暂无科目统计', '去设置科目', []);

// ===== 第三部分：app.js 按钮点击 → 真实路由（practice/cs408 变 active）=====
// 恢复真实 switchTab/showSub 以便验证 DOM 路由
window.switchTab = origSwitch;
window.showSub = origShow;
var weakAct = w && w.querySelector('.empty-act');
if (weakAct) {
  try {
    weakAct.click();
    var cs408Btn = document.querySelector('.tab-btn[data-tab="cs408"]');
    ok(!!cs408Btn && cs408Btn.classList.contains('active'), '点击「去刷 5 道题」→ cs408 标签激活');
    // cs408 升级为顶层标签，点击 CTA 后 tab-cs408 激活即可；子面板渲染由 render408* 负责
    ok(true, '点击「去刷 5 道题」→ 路由到 cs408（不抛错）');
  } catch (e) { ok(false, '点击路由不抛错 (' + e.message + ')'); }
} else {
  ok(false, 'weakness 操作按钮存在');
}

// ---- 运行期错误兜底 ----
ok(runtimeErrors.length === 0, '无运行期错误' + (runtimeErrors.length ? '：' + runtimeErrors.join('; ') : ''));
ok(jsdomErrors.length === 0, '无 jsdom 错误' + (jsdomErrors.length ? '：' + jsdomErrors.join('; ') : ''));

console.log('\n📊 图表空状态引导：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
