/* jsdom 专项验证：今日页打卡卡片（大按钮 / 连续天数 / 时间轴 / 安卓 tap 双触发防护） */
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

try { window.localStorage.setItem('kaoyan_tour_done', '1'); } catch (e) {}
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

// 与 index.html 实际加载顺序保持一致（含 iconset / workspace）
const order = ['qrcode.min.js', 'iconset.js', 'words.js', 'store.js', 'charts.js', 'share.js', 'sentences.js', 'app.js', 'workspace.js'];
for (const f of order) {
  const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
  try { window.eval(code); } catch (e) { console.error('❌ 加载 ' + f + ' 失败: ' + e.message); process.exit(1); }
}
if (typeof window.__switchTab !== 'function') {
  try { document.dispatchEvent(new window.Event('DOMContentLoaded')); } catch (e) { console.error('❌ init 触发失败: ' + e.message); process.exit(1); }
}
if (!window.Store || typeof window.__switchTab !== 'function') { console.error('❌ Store / init 未就绪'); process.exit(1); }

const Store = window.Store;
const today = Store.todayStr();
let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('✅ ' + name); } else { fail++; console.log('❌ ' + name); } }

setTimeout(function () {
  // 清空当日及历史打卡，保证断言确定性
  try {
    var raw = JSON.parse(window.localStorage.getItem('kaoyan_tracker_v1') || '{}');
    raw.checkins = [];
    window.localStorage.setItem('kaoyan_tracker_v1', JSON.stringify(raw));
  } catch (e) {}

  // 打卡入口已调整：手动大按钮 #btn-checkin-today 与打卡时间轴卡片均已随首页重构下线，
  // 改为「结束一次专注 → 自动打卡」（诊断方向：打卡自动完成，不额外占 UI）；
  // 用户可见的结果是首页「连续学习（天）」#m-stat-streak
  ok(!!document.getElementById('m-stat-streak'), '首页存在连续学习天数 #m-stat-streak');

  // 初始态
  ok(!Store.isCheckedIn(today), '打卡前 Store 未记录今日打卡');
  ok(Store.consecutiveStreak() === 0, '打卡前连续天数 = 0');

  // 走真实路径：启动计时 → 结束专注 → 自动打卡
  window.__switchTab('timer');
  var mod = document.querySelector('#timer-mods button, #timer-mods .timer-mod');
  ok(!!mod, '计时页存在科目胶囊（用于触发一次专注）');
  if (mod) mod.click();
  document.getElementById('btn-timer-stop').click();

  ok(Store.isCheckedIn(today), '结束专注后 Store 记录今日已打卡（自动打卡）');
  ok(Store.consecutiveStreak() === 1, '连续天数更新为 1（无历史打卡时）');
  window.__switchTab('home');
  ok(document.getElementById('m-stat-streak').textContent === '1', '首页「连续学习」显示为 1（实际 ' + document.getElementById('m-stat-streak').textContent + '）');

  // 幂等：再跑一次专注结束，不重复计数
  var before = Store.getCheckins().length;
  window.__switchTab('timer');
  var mod2 = document.querySelector('#timer-mods button, #timer-mods .timer-mod');
  if (mod2) mod2.click();
  document.getElementById('btn-timer-stop').click();
  ok(Store.getCheckins().length === before, '重复结束专注不重复计入打卡（幂等）');

  ok(jsdomErrors.length === 0, 'jsdom 内部错误数 = 0（实际 ' + jsdomErrors.length + '）');
  ok(runtimeErrors.length === 0, '运行时错误数 = 0（实际 ' + runtimeErrors.length + '）');

  console.log('\n========== 打卡卡片测试结果 ==========');
  console.log('通过 ' + pass + ' / 失败 ' + fail);
  process.exit(fail === 0 ? 0 : 1);
}, 80);
