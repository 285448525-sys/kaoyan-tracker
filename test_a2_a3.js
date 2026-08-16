/* jsdom 全流程测试：A2 数学错题 Leitner 调度 + 速查卡，A3 薄弱点分析报告 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = __dirname;
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
  // 去掉 <script> 标签，稍后手动按 index.html 顺序 eval，便于注入 window 作用域
  .replace(/<script[\s\S]*?<\/script>/g, '');

const vc = new VirtualConsole();
vc.on('jsdomError', function (e) { console.log('⚠️ JSDOM ERROR:', e.message); });

const dom = new JSDOM(html, {
  runScripts: 'outside-only',
  url: 'https://kaoyan-tracker.pages.dev/',
  pretendToBeVisual: true,
  virtualConsole: vc
});
const { window } = dom;
const { document } = window;

// ---- polyfills：jsdom 缺失的浏览器 API ----
window.matchMedia = window.matchMedia || function () { return { matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }; };
window.requestAnimationFrame = window.requestAnimationFrame || function (cb) { return setTimeout(function () { cb(Date.now()); }, 0); };
window.confirm = function () { return true; };
window.alert = function () {};
// canvas 2d 上下文 mock（避免无 canvas 包时报错）
function mockCtx() { return new Proxy({}, { get: function () { return function () { return mockCtx(); }; }, set: function () { return true; } }); }
window.HTMLCanvasElement.prototype.getContext = function () { return mockCtx(); };
window.HTMLCanvasElement.prototype.toDataURL = function () { return 'data:image/png;base64,'; };
window.HTMLCanvasElement.prototype.toBlob = function (cb) { if (cb) cb({}); };
// 跳过新手引导，避免 setTimeout 触发 DOM 操作
try { window.localStorage.setItem('kaoyan_tour_done', '1'); } catch (e) {}

// ---- 按 index.html 顺序注入脚本 ----
const order = ['qrcode.min.js', 'words.js', 'store.js', 'charts.js', 'share.js', 'md5.js', 'sentences.js', 'app.js'];
let loadErr = null;
for (const f of order) {
  const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
  try { window.eval(code); } catch (e) { loadErr = '加载 ' + f + ' 失败: ' + e.message; break; }
}
if (loadErr) { console.error('❌ ' + loadErr); process.exit(1); }

// 若 init 未自动执行，则手动触发
if (typeof window.__switchTab !== 'function') {
  try { document.dispatchEvent(new window.Event('DOMContentLoaded')); } catch (e) { console.error('❌ init 触发失败: ' + e.message); process.exit(1); }
}

const Store = window.Store;
if (!Store || typeof window.__switchTab !== 'function') { console.error('❌ Store / init 未就绪'); process.exit(1); }

// ---- 断言工具 ----
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('✅ ' + name); }
  else { fail++; console.log('❌ ' + name + (extra ? ' → ' + extra : '')); }
}
const today = Store.todayStr();
function addDaysStr(n) { return Store.dateStr(Store.addDays(new Date(), n)); }

// =================== A2：Leitner 调度 ===================
// 1) 新增错题初始化箱位 / nextReview
Store.importJSON(JSON.stringify({ mathMistakes: [] })); // 清空，保证干净起点
const m1 = Store.addMathMistake({ category: '概念不清', content: '极限不存在的反例', note: '用夹逼定理' });
ok('A2 新增错题 box=1', m1.box === 1, 'box=' + m1.box);
ok('A2 新增错题 reviewCount=0', m1.reviewCount === 0);
ok('A2 新增错题 nextReview=today+1', m1.nextReview === addDaysStr(1), 'next=' + m1.nextReview);

// 2) 新题当天不立即到期（nextReview>today）
ok('A2 新题当天不在待复习队列', Store.getMathDueMistakes(today).every(function (x) { return x.id !== m1.id; }));

// 3) 手动置为到期，复习答对 → 升箱 + 拉长间隔
Store.updateMathMistake(m1.id, { nextReview: today });
ok('A2 置为到期后进入待复习队列', Store.getMathDueMistakes(today).some(function (x) { return x.id === m1.id; }));
const afterRight = Store.reviewMathMistake(m1.id, true);
ok('A2 答对后 box=2', afterRight.box === 2, 'box=' + afterRight.box);
ok('A2 答对后 nextReview=today+2', afterRight.nextReview === addDaysStr(2), 'next=' + afterRight.nextReview);
ok('A2 答对后 reviewCount=1', afterRight.reviewCount === 1);
ok('A2 答对后 lastResult=right', afterRight.lastResult === 'right');
ok('A2 答对后移出待复习队列', !Store.getMathDueMistakes(today).some(function (x) { return x.id === m1.id; }));

// 4) 复习答错 → 回到第 1 箱 + 最短间隔
const afterWrong = Store.reviewMathMistake(m1.id, false);
ok('A2 答错后 box=1', afterWrong.box === 1, 'box=' + afterWrong.box);
ok('A2 答错后 nextReview=today+1', afterWrong.nextReview === addDaysStr(1), 'next=' + afterWrong.nextReview);
ok('A2 答错后 lastResult=wrong', afterWrong.lastResult === 'wrong');
ok('A2 答错后 reviewCount=2', afterWrong.reviewCount === 2);
ok('A2 答错后 nextReview=today+1（次日到期，非当天）', afterWrong.nextReview === addDaysStr(1), 'next=' + afterWrong.nextReview);
ok('A2 答错后当天不在待复习队列（符合 Leitner 第1箱隔天）', !Store.getMathDueMistakes(today).some(function (x) { return x.id === m1.id; }));

// 5) 连续答对到第 5 箱（封顶）不越界
let cur = Store.getMathMistakes().filter(function (x) { return x.id === m1.id; })[0];
for (let i = 0; i < 10; i++) cur = Store.reviewMathMistake(m1.id, true);
ok('A2 箱位封顶为 5', cur.box === 5, 'box=' + cur.box);
ok('A2 封顶后 nextReview=today+15', cur.nextReview === addDaysStr(15), 'next=' + cur.nextReview);

// 6) 旧数据（缺 box/nextReview）归一化
Store.importJSON(JSON.stringify({ mathMistakes: [{ id: 'mm_old', category: '其他', content: '老错题', created: '2026-01-01' }] }));
const old = Store.getMathMistakes().filter(function (x) { return x.id === 'mm_old'; })[0];
ok('A2 旧数据归一化 box=1', old.box === 1, 'box=' + old.box);
ok('A2 旧数据归一化 nextReview 为字符串', typeof old.nextReview === 'string' && old.nextReview.length === 10, 'next=' + old.nextReview);
ok('A2 旧数据（nextReview<=today）进入待复习', Store.getMathDueMistakes(today).some(function (x) { return x.id === 'mm_old'; }));

// =================== A2：速查卡 UI（已合并进「错题本」tab 统一速查卡） ===================
// 准备一条到期错题
Store.importJSON(JSON.stringify({ mathMistakes: [] }));
Store.addMathMistake({ category: '计算错误', content: '积分上下限代错', note: '注意对称性' });
const allM = Store.getMathMistakes();
Store.updateMathMistake(allM[0].id, { nextReview: today });
// 切到「错题本」tab，选数学范围并抽取待复习（统一速查卡）
window.__switchTab('mistakes');
const flashScope = document.getElementById('mistake-flash-scope');
flashScope.value = 'math';
flashScope.dispatchEvent(new window.Event('change', { bubbles: true }));
document.getElementById('btn-mistake-flash-start').dispatchEvent(new window.Event('click', { bubbles: true }));
const flashcardBox = document.querySelector('#mistake-flashcard-box');
ok('A2 速查卡容器存在', !!flashcardBox);
const cardEl = document.querySelector('#mistake-flashcard-box .flashcard');
ok('A2 有到期题时渲染出速查卡', !!cardEl);
// 待复习徽标（合并列表标题处）
const badge = document.querySelector('#mistake-due-badge');
ok('A2 待复习徽标显示且含“待复习”', badge && badge.style.display !== 'none' && /待复习/.test(badge.textContent), badge && badge.textContent);
// 点击“显示答案”
const showBtn = Array.from(document.querySelectorAll('#mistake-flashcard-box button')).find(function (b) { return /显示答案/.test(b.textContent); });
ok('A2 存在“显示答案”按钮', !!showBtn);
if (showBtn) {
  showBtn.click();
  const backEl = document.querySelector('#mistake-flashcard-box .flash-back');
  ok('A2 点击显示答案后出现答案区', !!backEl);
  const rightBtn = Array.from(document.querySelectorAll('#mistake-flashcard-box button')).find(function (b) { return /我答对了/.test(b.textContent); });
  ok('A2 存在“我答对了”按钮', !!rightBtn);
  if (rightBtn) {
    rightBtn.click();
    const upd = Store.getMathMistakes().filter(function (x) { return x.content === '积分上下限代错'; })[0];
    ok('A2 速查卡答对后 box 升到 2', upd && upd.box === 2, upd && 'box=' + upd.box);
    ok('A2 速查卡答对后该题移出待复习', !Store.getMathDueMistakes(today).some(function (x) { return x.content === '积分上下限代错'; }));
  }
}

// =================== A3：薄弱点分析报告 ===================
// 灌入刷题正确率：概率统计 1 对 4 错（薄弱），线性代数 4 对 1 错（良好），408 数据结构 0 对 3 错（薄弱）
['概率统计', '概率统计', '概率统计', '概率统计'].forEach(function () { Store.recordMathStat('概率统计', false); });
Store.recordMathStat('概率统计', true);
['线性代数', '线性代数', '线性代数', '线性代数'].forEach(function () { Store.recordMathStat('线性代数', true); });
Store.recordMathStat('线性代数', false);
['数据结构', '数据结构', '数据结构'].forEach(function () { Store.recordMathStat('数据结构', false); });
// 确保数学章节已预填：init 会预填，但上面 importJSON 清状态时把 mathChapters 重置为空，
// 薄弱分支 → 章节映射依赖这些章节，否则会落到「该分支暂无章节数据」导致映射断言失败。这里补回生产环境应有的章节。
if (!Store.getMathChapters().length) Store.setMathChapters(Store.getMathVolumeTemplates()[Store.getMathVolume()].slice());
window.__switchTab('data');
const wkBox = document.querySelector('#weakness-report');
ok('A3 薄弱点报告容器存在', !!wkBox);
ok('A3 渲染出分类行 wk-row', !!document.querySelector('#weakness-report .wk-row'));
ok('A3 出现薄弱标签 wk-weak', !!document.querySelector('#weakness-report .wk-status.wk-weak'));
ok('A3 出现优先复习清单 wk-priority', !!document.querySelector('#weakness-report .wk-priority'));
// 薄弱分支应含概率统计，且映射到章节（概率 ·）
const priorityText = Array.from(document.querySelectorAll('#weakness-report .wk-priority')).map(function (p) { return p.textContent; }).join(' | ');
ok('A3 优先复习清单含“概率统计”', /概率统计/.test(priorityText), priorityText);
ok('A3 薄弱分支映射出对应章节（概率 ·）', /概率 ·/.test(priorityText), priorityText);

// =================== 结果 ===================
console.log('\n========== 测试结果 ==========');
console.log('通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail ? 1 : 0);
