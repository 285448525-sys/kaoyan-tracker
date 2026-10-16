#!/usr/bin/env node
/* [20261016e] 今日学习记录「账平」回归测试。
   守的不变量：计时页「今日学习记录」的总计 === 各科目格子数值之和 === Store.totalMinutesForDay(day)。
   背景：P2-1 把 renderRecMini 改成只遍历「已配置科目」后，若某科目当天有记录但当前未勾选
   （典型：背单词引擎自动记的 english，或用户删掉了某科），总计会把这段时长漏在格子外，
   格子相加 ≠ 总计 —— 用户会看到「总计 90m，四个格子加起来只有 60m」。
*/
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = __dirname;
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
  .replace(/<script[\s\S]*?<\/script>/g, '');

function boot() {
  const vc = new VirtualConsole();
  const errs = [];
  vc.on('jsdomError', e => errs.push(e.message));
  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url: 'https://kaoyan-tracker.pages.dev/',
    pretendToBeVisual: true,
    virtualConsole: vc
  });
  const { window } = dom;
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
  window.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 0);
  window.confirm = () => true;
  window.alert = () => {};
  window.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: () => () => ({}), set: () => true });
  window.fetch = () => Promise.reject(new Error('disabled'));
  try { window.localStorage.setItem('kaoyan_tour_done', '1'); } catch (e) {}
  const order = ['qrcode.min.js', 'words.js', 'store.js', 'charts.js', 'share.js', 'sentences.js', 'app.js', 'workspace.js'];
  for (const f of order) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) continue;
    window.eval(fs.readFileSync(p, 'utf8'));
  }
  if (typeof window.switchTab !== 'function') window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  return { window, errs };
}

let pass = 0, fail = 0;
function ok(c, n) { if (c) { pass++; console.log('✅ ' + n); } else { fail++; console.log('❌ ' + n); } }

const s = boot();
const win = s.window;
const doc = win.document;
const Store = win.Store;
const today = Store.todayStr();

// 解析格子数值（"--" 视为 0，形如 "1h 30m" / "45m" / "90m"）
function parseMin(txt) {
  const t = String(txt || '').trim();
  if (!t || t === '--') return 0;
  let m = /(\d+)\s*h/i.exec(t);
  let n = /(\d+)\s*m/i.exec(t);
  return (m ? parseInt(m[1], 10) * 60 : 0) + (n ? parseInt(n[1], 10) : 0);
}
function readGrid() {
  win.switchTab('timer');
  const cells = Array.from(doc.querySelectorAll('#rec-mini-grid .rec-mini-cell')).map(c => ({
    name: (c.querySelector('.nm') || {}).textContent,
    val: (c.querySelector('.v') || {}).textContent
  }));
  const totalText = doc.getElementById('rec-total-mini').textContent;
  return { cells, sum: cells.reduce((a, c) => a + parseMin(c.val), 0), total: parseMin(totalText), totalText };
}

// —— 场景 1：只勾数学，但今天有 english 记录（背单词自动记的典型情形） ——
Store.upsertSubject({ key: 'math', name: '数学一', type: 'math', target: 120 });
Store.addDuration(today, 'math', 60);
Store.addDuration(today, 'english', 30);   // 未勾选科目，但有记录

// 保证「今天」是当前日
let day = Store.getDay(today);
ok(!!day, '已写入今日记录');
ok(Store.totalMinutesForDay(day) === 90, 'Store 全量口径 = 90 分钟（math60 + english30）');

let r = readGrid();
console.log('   格子:', JSON.stringify(r.cells), '总计:', r.totalText);
ok(r.total === 90, '总计显示 90 分钟，实际=' + r.total);
ok(r.sum === r.total, '账平：格子相加(' + r.sum + ') === 总计(' + r.total + ')');
ok(r.cells.some(c => /英语/.test(c.name || '')), '未勾选但有记录的 english 仍补出一格（不吞时长）');
ok(r.cells.some(c => /数学/.test(c.name || '')), '已勾选的 math 有格子');

// —— 场景 2：删科目会连带删该科目历史时长（store.js:276 的设计），但账平不变量必须仍成立 ——
// 注意：不要断言「删除数学后总计仍为 90」——removeSubject 明确会 delete 该科目所有历史 durations，
// 所以总计回落到 30（仅剩 english）才是正确行为；要守的是「格子相加 === 总计」恒成立。
Store.removeSubject('math');
day = Store.getDay(today);
ok(Store.totalMinutesForDay(day) === 30, '删科目后 Store 口径 = 30（math 历史被 removeSubject 清除属设计），实际=' + Store.totalMinutesForDay(day));
r = readGrid();
console.log('   删除数学后 格子:', JSON.stringify(r.cells), '总计:', r.totalText);
ok(r.total === 30, '删科目后总计与 Store 一致 = 30，实际=' + r.total);
ok(r.sum === r.total, '删科目后仍账平：' + r.sum + ' === ' + r.total);

// —— 场景 3：全空时必须归零，不留残影 ——
try { Store.resetDay(today); } catch (e) {}
r = readGrid();
console.log('   重置后 格子:', JSON.stringify(r.cells), '总计:', r.totalText);
ok(r.total === 0, '重置后总计 0，实际=' + r.total);
ok(r.sum === 0, '重置后格子相加 0，实际=' + r.sum);

// —— 场景 4：无关无关项，但核对 -- 与非零格语义 ——
Store.upsertSubject({ key: 'math', name: '数学一', type: 'math', target: 120 });
Store.upsertSubject({ key: 'cs408', name: '408', type: 'cs408', target: 120 });
Store.addDuration(today, 'cs408', 25);
r = readGrid();
console.log('   仅 408 有记录 格子:', JSON.stringify(r.cells), '总计:', r.totalText);
ok(r.total === 25, '总计 25 分钟，实际=' + r.total);
ok(r.sum === r.total, '账平：' + r.sum + ' === ' + r.total);
ok(r.cells.filter(c => c.val === '--').length >= 1, '无记录的科目显示 --（而非 0m）');

ok(s.errs.length === 0, '无 jsdomError (' + s.errs.join('|') + ')');

console.log('今日记录账平: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
