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

  const btn = document.getElementById('btn-checkin-today');
  ok(!!btn, '今日页存在打卡大按钮 #btn-checkin-today');
  ok(!!document.getElementById('ci-streak'), '存在连续天数元素 #ci-streak');
  ok(!!document.getElementById('checkinDots'), '存在打卡时间轴容器 #checkinDots');

  // 初始态
  ok(btn && !btn.classList.contains('done'), '打卡前按钮未处于 done 状态');
  ok(btn && document.getElementById('ci-label').textContent.indexOf('今日打卡') >= 0, '打卡前按钮文案为「今日打卡」');

  // 模拟点击（click 路径，等同桌面 / 安卓 click）
  if (btn) btn.click();
  ok(Store.isCheckedIn(today), '点击后 Store 记录今日已打卡');
  ok(btn && btn.classList.contains('done'), '点击后按钮进入 done 状态（绿色）');
  ok(btn && document.getElementById('ci-label').textContent.indexOf('今日已打卡') >= 0, '点击后按钮文案变为「今日已打卡 ✓」');
  ok(document.getElementById('ci-streak').textContent === '1', '连续天数更新为 1（无历史打卡时）');
  var dots = document.querySelectorAll('#checkinDots .ci-dot');
  ok(dots.length === 14, '时间轴渲染最近 14 天打卡点');
  ok(document.querySelectorAll('#checkinDots .ci-dot.done').length >= 1, '时间轴含至少一个已打卡点（今天）');
  ok(!!document.querySelector('#checkinDots .ci-dot.today'), '时间轴标记今天为 today');

  // 安卓 touchstart 路径：不应重复计数 / 不应报错
  var before = Store.getCheckins().length;
  try {
    var ev = new window.Event('touchstart', { bubbles: true, cancelable: true });
    if (btn) btn.dispatchEvent(ev);
  } catch (e) { console.log('   touchstart 异常: ' + e.message); }
  ok(Store.getCheckins().length === before, 'touchstart 与 click 防重复触发（打卡数不变）');

  // 二次点击不报错、不重复
  if (btn) btn.click();
  ok(Store.getCheckins().length === before, '重复点击不重复计入打卡');

  ok(jsdomErrors.length === 0, 'jsdom 内部错误数 = 0（实际 ' + jsdomErrors.length + '）');
  ok(runtimeErrors.length === 0, '运行时错误数 = 0（实际 ' + runtimeErrors.length + '）');

  console.log('\n========== 打卡卡片测试结果 ==========');
  console.log('通过 ' + pass + ' / 失败 ' + fail);
  process.exit(fail === 0 ? 0 : 1);
}, 80);
