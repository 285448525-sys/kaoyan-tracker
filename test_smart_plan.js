/* 智能计划 · 每日学习量建议专项验证（v20260817f）：反推模型纯函数 + 边界状态 + 今日页条幅渲染 */
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

console.log('===== 反推模型纯函数 computeSmartPlan =====');
ok(typeof window.computeSmartPlan === 'function', 'window.computeSmartPlan 已暴露（可单测）');

const cfg = { examDate: '2099-06-01', goalHours: 700 };
const r = window.computeSmartPlan(cfg, 210, 120);
ok(r.status === 'ok', '正常态 status==="ok"（goalHours=700, done=210, daysLeft=120）');
ok(r.dailyNeed === 4.1, '(700−210)/120 → 每天需学 4.1 小时（实际 ' + r.dailyNeed + '）');
ok(r.remaining === 490, '剩余 = 490（700−210）');

console.log('===== 边界状态 =====');
const rUnset = window.computeSmartPlan({ examDate: '2099-06-01', goalHours: 0 }, 210, 120);
ok(rUnset.status === 'unset', 'goalHours=0 → status==="unset"（提示去设目标）');

const rNoExam = window.computeSmartPlan({ goalHours: 700 }, 210, 120);
ok(rNoExam.status === 'noExam', 'examDate 为空 → status==="noExam"（提示先设考研日期）');

const rEnded = window.computeSmartPlan({ examDate: '2099-06-01', goalHours: 700 }, 210, -5);
ok(rEnded.status === 'ended', 'daysLeft<=0 → status==="ended"（考研已结束）');

const rDone = window.computeSmartPlan({ examDate: '2099-06-01', goalHours: 700 }, 800, 120);
ok(rDone.status === 'done', 'doneHours(800) ≥ goalHours(700) → status==="done"（已超额完成）');

console.log('===== 今日页条幅渲染（DOM 回归）=====');
// 设未来 examDate + goalHours，切到今日页触发 renderTodayAggregate → renderSmartPlan
window.Store.setConfig({ examDate: '2099-06-01', goalHours: 700 });
if (typeof window.switchTab === 'function') { try { window.switchTab('today'); } catch (e) { /* 忽略 */ } }
const sp = document.getElementById('smart-plan');
ok(!!sp, '#smart-plan 节点存在于 DOM');
ok(!!sp && /每天需学/.test(sp.textContent || sp.innerHTML || ''), '条幅渲染出「每天需学 X 小时」 headline');
ok(!!sp && /小时/.test(sp.innerHTML || ''), '条幅文案含「小时」单位');

console.log('===== 运行期错误兜底 =====');
ok(runtimeErrors.length === 0, '无运行期错误' + (runtimeErrors.length ? '：' + runtimeErrors.join('; ') : ''));
ok(jsdomErrors.length === 0, '无 jsdom 错误' + (jsdomErrors.length ? '：' + jsdomErrors.join('; ') : ''));

console.log('\n🧮 智能计划 · 每日学习量建议：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
