/* 回归测试：智能计划卡片的「已学 Xh」在非 ok/done 分支（unset / ended）也必须保留 1 位小数，
 * 不能出现 12.083333333333334 这种过长浮点。覆盖：
 *   1) computeSmartPlan 直接调用（unset / ended 分支）
 *   2) DOM 渲染：config.goalHours=0（unset 场景，用户真实触发路径）
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = __dirname;
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace(/<script[\s\S]*?<\/script>/g, '');
const vc = new VirtualConsole(); vc.on('jsdomError', () => {}); vc.on('error', () => {}); vc.on('warn', () => {});
const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://kaoyan-tracker.pages.dev/', pretendToBeVisual: true, virtualConsole: vc });
const { window } = dom; const { document } = window;
window.matchMedia = window.matchMedia || function () { return { matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }; };
window.requestAnimationFrame = window.requestAnimationFrame || function (cb) { return setTimeout(function () { cb(Date.now()); }, 0); };
window.confirm = () => true; window.alert = () => {};
window.HTMLCanvasElement.prototype.getContext = function () { return new Proxy({}, { get: () => () => ({ }), set: () => true }); };
window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,';
window.HTMLCanvasElement.prototype.toBlob = (cb) => cb && cb({});
try { window.localStorage.setItem('kaoyan_tour_done', '1'); } catch (e) {}
window.fetch = window.fetch || function () { return Promise.reject(new Error('x')); };
const order = ['qrcode.min.js', 'words.js', 'store.js', 'charts.js', 'share.js', 'md5.js', 'sentences.js', 'app.js'];
for (const f of order) { try { window.eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) { console.error('load fail', f, e.message); process.exit(1); } }
if (typeof window.__switchTab !== 'function') document.dispatchEvent(new window.Event('DOMContentLoaded'));

const Store = window.Store;
let failures = 0;
function assert(cond, msg) { if (!cond) { failures++; console.error('  ✗ ' + msg); } else { console.log('  ✓ ' + msg); } }

// ---- 1) 单元测试：直接调用 computeSmartPlan ----
const raw = 12.083333333333334; // 725 分钟 → 12.0833… 小时
// unset 分支：有 examDate、goalHours=0
const rUnset = window.computeSmartPlan({ examDate: '2099-06-01', goalHours: 0 }, raw, 100);
assert(rUnset.status === 'unset', 'unset 分支 status 正确');
assert(rUnset.doneHours === 12.1, 'unset 分支 doneHours 四舍五入到 1 位（实际 ' + rUnset.doneHours + '）');
// ended 分支：daysLeft<=0
const rEnded = window.computeSmartPlan({ examDate: '2020-06-01', goalHours: 700 }, raw, -5);
assert(rEnded.status === 'ended', 'ended 分支 status 正确');
assert(rEnded.doneHours === 12.1, 'ended 分支 doneHours 四舍五入到 1 位（实际 ' + rEnded.doneHours + '）');
// ok 分支本就四舍五入，回归确认
const rOk = window.computeSmartPlan({ examDate: '2099-06-01', goalHours: 700 }, raw, 100);
assert(rOk.status === 'ok' && rOk.doneHours === 12.1 && rOk.dailyNeed === 6.9, 'ok 分支 doneHours/dailyNeed 保持 1 位（' + rOk.doneHours + ' / ' + rOk.dailyNeed + '）');

// ---- 2) DOM 渲染：unset 场景（用户真实触发路径：设了考试日但没设目标时长）----
const today = Store.todayStr();
for (let i = 0; i < 5; i++) {
  const ds = Store.dateStr(Store.addDays(new Date(), -i));
  const mins = [95, 135, 305, 80, 110][i];
  Store.setDayDurations(ds, { politics: mins, english: 30 });
}
Store.addExam({ date: today, total: 268, subs: [] });
Store.setConfig({ examDate: '2099-06-01', goalHours: 0, targetTotal: 500, estimatorK: 6 }); // goalHours=0 → unset
try { window.switchTab('today'); } catch (e) {}

function scan(root) {
  const hits = [];
  const walk = (el) => {
    if (el.nodeType === 3) {
      const t = el.textContent || '';
      const m = t.match(/-?\d+\.\d{2,}/g);
      if (m) hits.push({ where: (el.parentNode && (el.parentNode.className || el.parentNode.tagName)) || '', text: t.trim().slice(0, 80), nums: m });
    } else if (el.nodeType === 1) {
      if (el.tagName === 'SVG' || el.closest('svg')) return;
      for (const c of el.childNodes) walk(c);
    }
  };
  walk(root);
  return hits;
}
const hits = scan(document.body);
// 日期 2026.08.17 也会被正则命中（年.月.日 的点），这是既定格式非数值，单独过滤
const numHits = hits.filter(h => !/^\d{4}\.\d{2}\.\d{2}/.test(h.text));
assert(numHits.length === 0, 'unset 场景 DOM 渲染后无数值型过长小数（命中 ' + numHits.length + (numHits.length ? ' ' + JSON.stringify(numHits) : '') + '）');
console.log('日期格式命中（非数值，忽略）：', hits.length - numHits.length);

console.log(failures === 0 ? '\nALL PASS ✅' : '\nFAILED ❌ (' + failures + ')');
process.exit(failures === 0 ? 0 : 1);
