/* jsdom 全流程测试：版本 g —— 计时体验打磨（timer-ux-polish）
 * 校验：
 *   ② 全局「计时中」常驻药丸：启动后所有 tab 可见、标签=科目名+计时中、时间 HH:MM:SS、切换 tab 持久、结束后隐藏；
 *   ③ 计时行停止态：有今日累计显示 fmtMinShort（如 1h 30m），无累计显示「未计时」，运行态显示 HH:MM:SS。
 *   ⑤ 版本一致性。
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
if (!Store || typeof window.__showGlobalTimer !== 'function' || typeof window.__renderTimerRows !== 'function') {
  console.error('❌ Store / 计时测试钩子未就绪'); process.exit(1);
}

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('✅ ' + name); }
  else { fail++; console.log('❌ ' + name + (extra !== undefined ? ' → ' + extra : '')); }
}
const click = function (el) { el.dispatchEvent(new window.Event('click', { bubbles: true })); };

// ---------- 准备科目 ----------
Store.upsertSubject({ key: 'math', name: '数学', type: 'math' });
Store.upsertSubject({ key: 'english', name: '英语', type: 'english' });
Store.upsertSubject({ key: 'cs408', name: '408', type: 'cs408' });

const bar = document.getElementById('global-timer');
const gtLabel = document.getElementById('gt-label');
const gtTime = document.getElementById('gt-time');

// ---------- ① 初始：药丸隐藏 ----------
ok('初始：#global-timer 隐藏', bar.hidden === true);

// ---------- ② 启动数学计时（点击真实 start 按钮，端到端） ----------
window.__renderTimerRows();
const mathRow = document.getElementById('t-time-math').parentNode;
const startBtn = mathRow.querySelector('.t-btn.start');
ok('存在 数学 行 start 按钮', !!startBtn);
click(startBtn); // → startTimerFor('math')

ok('启动后：#global-timer 可见（hidden=false）', bar.hidden === false);
ok('启动后：gt-label = 数学 计时中', gtLabel.textContent === '数学 计时中', gtLabel.textContent);
ok('启动后：gt-time 格式 HH:MM:SS', /^\d{2}:\d{2}:\d{2}$/.test(gtTime.textContent), gtTime.textContent);
// 运行态计时行显示 HH:MM:SS（非 00:00:00 / 未计时）
const mathTimeRunning = document.getElementById('t-time-math').textContent;
ok('运行态：数学计时行显示 HH:MM:SS', /^\d{2}:\d{2}:\d{2}$/.test(mathTimeRunning), mathTimeRunning);

// ---------- ② 切换 tab 持久 ----------
window.__switchTab('cs408');
ok('切换 tab 后：#global-timer 仍可见', bar.hidden === false);
window.__switchTab('home');
ok('切回首页后：#global-timer 仍可见', bar.hidden === false);

// ---------- ② 结束（点击药丸 #gt-stop，验证绑定 endTimer） ----------
const gtStop = document.getElementById('gt-stop');
ok('存在 #gt-stop 结束按钮', !!gtStop);
click(gtStop); // → endTimer() → hideGlobalTimer()
ok('结束后：#global-timer 隐藏（hidden=true）', bar.hidden === true);

// ---------- ③ 计时行停止态：今日累计 / 未计时 ----------
// 设置今日累计：数学 90min，英语 0，408 0
Store.setDayDurations(Store.todayStr(), { math: 90, english: 0, cs408: 0 });
// 确保计时未运行
Store.setTimer({ subjectKey: null, startTs: 0, accumulated: 0, running: false });
window.__renderTimerRows();

const mathStop = document.getElementById('t-time-math').textContent;
const engStop = document.getElementById('t-time-english').textContent;
const csStop = document.getElementById('t-time-cs408').textContent;
ok('③ 数学有累计(90m) → 显示 1h 30m', mathStop === '1h 30m', mathStop);
ok('③ 英语无累计 → 显示 未计时', engStop === '未计时', engStop);
ok('③ 408 无累计 → 显示 未计时', csStop === '未计时', csStop);

// ---------- ③ 运行态覆盖：数学运行时不显示「未计时」 ----------
Store.setTimer({ subjectKey: 'math', startTs: Date.now() - 5000, accumulated: 0, running: true });
window.__renderTimerRows();
const mathRunningAgain = document.getElementById('t-time-math').textContent;
ok('③ 数学运行态 → 显示 HH:MM:SS（非「未计时」）', /^\d{2}:\d{2}:\d{2}$/.test(mathRunningAgain) && mathRunningAgain !== '未计时', mathRunningAgain);
// 收尾：停下计时，避免 setInterval 挂起进程
click(document.getElementById('gt-stop'));

// ---------- ⑤ 版本一致性 ----------
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

console.log('\n========== 计时体验打磨（g）测试结果 ==========');
console.log('通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail ? 1 : 0);
