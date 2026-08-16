/* 复现：刷新后数据消失 bug。
   流程：jsdom#1 写入示例数据 → 触发保存 → 取出 localStorage 字符串 →
        jsdom#2 注入该字符串（模拟刷新）→ 加载脚本+init → 校验 Store 状态是否完整恢复。
*/
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = __dirname;
const KEY = 'kaoyan_tracker_v1';
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
  .replace(/<script[\s\S]*?<\/script>/g, '');

function boot(seedStr) {
  const vc = new VirtualConsole();
  const errs = [];
  vc.on('jsdomError', e => errs.push(e.message));
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://kaoyan-tracker.pages.dev/', pretendToBeVisual: true, virtualConsole: vc });
  const { window } = dom;
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
  window.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 0);
  window.confirm = () => true;
  window.alert = () => {};
  window.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: () => () => ({}), set: () => true });
  window.fetch = () => Promise.reject(new Error('disabled'));
  if (seedStr) { try { window.localStorage.setItem(KEY, seedStr); } catch (e) {} }
  const order = ['qrcode.min.js', 'words.js', 'store.js', 'charts.js', 'share.js', 'md5.js', 'sentences.js', 'app.js'];
  for (const f of order) window.eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  if (typeof window.__switchTab !== 'function') window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  return { window, errs };
}

// —— jsdom#1：构造数据并保存 ——
const s1 = boot(null);
const Store = s1.window.Store;
const today = Store.todayStr();
Store.addDuration(today, 'math', 172);                 // 2h52m
Store.addExam({ name: '模拟一', date: '2026-09-01', scores: { math: 100 }, total: 150 });
Store.addMistake({ type: '概念', subject: 'math', content: '极限', note: 'x' });
Store.addVocab('abandon', '放弃');
Store.addPlanItem({ subject: 'math', text: '复习极限', min: 30, done: false });
Store.setConfig({ examDate: '2026-09-13', nickname: '芝芝' });
Store.checkin(today);
const saved = s1.window.localStorage.getItem(KEY);
console.log('[seed] saved length =', saved ? saved.length : 'NULL');

// —— jsdom#2：模拟刷新（注入同一 localStorage） ——
const s2 = boot(saved);
const Store2 = s2.window.Store;

let pass = 0, fail = 0;
function ok(c, n) { if (c) { pass++; console.log('✅ ' + n); } else { fail++; console.log('❌ ' + n); } }

const st = s2.window.Store.snapshot();
ok(!!saved, 'jsdom#1 已成功保存 localStorage');
ok(st.days && st.days[today] && st.days[today].durations && st.days[today].durations.math === 172, '刷新后今日时长(math=172)恢复');
ok(Array.isArray(st.exams) && st.exams.length === 1, '刷新后 exams 恢复(1条)');
ok(Array.isArray(st.mistakes) && st.mistakes.length === 1, '刷新后 mistakes 恢复(1条)');
ok(Array.isArray(st.vocab) && st.vocab.length === 1, '刷新后 vocab 恢复(1条)');
ok(Array.isArray(st.planItems) && st.planItems.length === 1, '刷新后 planItems 恢复(1条)');
ok(st.config && st.config.examDate === '2026-09-13', '刷新后 config.examDate 恢复');
ok(Array.isArray(st.checkins) && st.checkins.indexOf(today) >= 0, '刷新后 checkins 恢复(已打卡)');
ok(s2.errs.length === 0, 'jsdom#2 无 jsdomError (' + s2.errs.join('|') + ')');

console.log('通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail ? 1 : 0);
