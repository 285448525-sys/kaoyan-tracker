/* jsdom 全站巡检：遍历所有 tab + 关键交互，捕获运行时异常（冗余/失效检测） */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = __dirname;
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
  .replace(/<script[\s\S]*?<\/script>/g, '');

const vc = new VirtualConsole();
const jsdomErrors = [];
vc.on('jsdomError', function (e) { jsdomErrors.push(e.message); });
vc.on('error', function () {}); // 静音 console.error
vc.on('warn', function () {});

const dom = new JSDOM(html, {
  runScripts: 'outside-only',
  url: 'https://kaoyan-tracker.pages.dev/',
  pretendToBeVisual: true,
  virtualConsole: vc
});
const { window } = dom;
const { document } = window;

// ---- polyfills ----
window.matchMedia = window.matchMedia || function () { return { matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }; };
window.requestAnimationFrame = window.requestAnimationFrame || function (cb) { return setTimeout(function () { cb(Date.now()); }, 0); };
window.confirm = function () { return true; };
window.alert = function () {};
function mockCtx() { return new Proxy({}, { get: function () { return function () { return mockCtx(); }; }, set: function () { return true; } }); }
window.HTMLCanvasElement.prototype.getContext = function () { return mockCtx(); };
window.HTMLCanvasElement.prototype.toDataURL = function () { return 'data:image/png;base64,'; };
window.HTMLCanvasElement.prototype.toBlob = function (cb) { if (cb) cb({}); };
try { window.localStorage.setItem('kaoyan_tour_done', '1'); } catch (e) {}
// 阻止云同步真实网络请求（jsdom 无 fetch 实现时会抛错，这里 mock）
window.fetch = window.fetch || function () { return Promise.reject(new Error('fetch disabled in test')); };

const runtimeErrors = [];
window.addEventListener('error', function (e) {
  const st = e.error && e.error.stack ? e.error.stack.split('\n').slice(0, 4).join(' ← ') : '';
  runtimeErrors.push((e.message || 'window error') + (st ? ' [STACK] ' + st : ''));
});
window.addEventListener('unhandledrejection', function (e) { runtimeErrors.push('promise: ' + (e.reason && e.reason.message || e.reason)); });

// ---- 按 index.html 顺序注入脚本 ----
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

// ---- 灌入丰富数据，覆盖更多渲染路径 ----
try {
  // 基础错题 + 网站 + 词汇
  Store.addMistake({ type: '概念', content: '极限定义', subject: '数学', note: 'ε-δ', date: today });
  Store.addWebsite({ name: '学为贵', url: 'https://www.xueweigui.com', cat: '' });
  Store.addVocab('abandon', 'v. 放弃');
  Store.addVocab('derive', 'v. 推导');
  // 数学错题（Leitner）+ 题目 + 刷题统计
  const mm = Store.addMathMistake({ category: '概念不清', content: '矩阵秩的判定', note: '初等变换' });
  Store.updateMathMistake(mm.id, { nextReview: today });
  Store.addMathQuestion({ cat: '线性代数', q: '1+1=', options: ['2', '3', '4', '5'], answer: 0, explain: '常识' });
  Store.recordMathStat('高等数学', true);
  Store.recordMathStat('概率统计', false);
  Store.recordMathStat('概率统计', false);
  // 408 错题 + 题目 + 知识点 + 真题
  Store.add408Mistake({ category: '数据结构', content: '栈与队列', note: '', date: today });
  Store.add408Question({ cat: '数据结构', q: '栈的特点是？', options: ['先进后出', '先进先出', '随机', '无序'], answer: 0, explain: '栈 LIFO' });
  Store.add408Knowledge({ subject: '数据结构', title: '链表', content: '单链表插入 O(1)' });
  Store.add408Year({ year: '2025', score: 90, total: 150, note: '真题' });
  // 学习记录 + 计划 + 考试
  Store.addDuration(today, 'math', 30);
  Store.addDailyPlanItem(today, { text: '背单词 30min', minutes: 30, done: false, subjectKey: 'english' });
  Store.addExam({ name: '考研英语一', date: '2026-12-19', scores: { english: 60 }, note: '' });
  // 长难句语料 + 高频词数据（若 Store 提供）
  if (typeof Store.addSentence === 'function') Store.addSentence({ en: 'This is a test sentence.', cn: '这是一个测试句子。', grammar: '简单句' });
  if (typeof Store.addWord === 'function') Store.addWord({ w: 'analyze', cn: '分析', note: '' });
} catch (e) {
  console.log('⚠️ 灌数据时异常（不影响巡检继续）: ' + e.message);
}

// ---- 1) 遍历所有 tab ----
const tabs = Array.from(document.querySelectorAll('.tab-btn'));
const tabClickErrors = [];
const tabsOk = [];
tabs.forEach(function (btn) {
  const target = btn.getAttribute('data-tab');
  try { btn.click(); tabsOk.push(target); }
  catch (e) { tabClickErrors.push(target + ': ' + e.message); }
});
// 再正向点一遍（幂等）
tabs.forEach(function (btn) {
  const target = btn.getAttribute('data-tab');
  try { btn.click(); }
  catch (e) { tabClickErrors.push(target + '(2nd): ' + e.message); }
});

// ---- 2) 关键交互深挖 ----
const interactErrors = [];
function guard(name, fn) { try { fn(); } catch (e) { interactErrors.push(name + ': ' + e.message); } }

// 词汇练习：切到 practice（已 startPractice），点第一个选项
guard('词汇练习-点选项', function () {
  window.__switchTab('practice');
  const opt = document.querySelector('#practice-box .practice-opt');
  if (opt) opt.click();
  const next = Array.from(document.querySelectorAll('#practice-box button')).find(function (b) { return /下一题|查看结果/.test(b.textContent); });
  if (next) next.click();
});
// 词汇复习：显示释义 + 认识
guard('词汇复习-认识', function () {
  window.__switchTab('review');
  const show = document.querySelector('#review-box #review-show');
  if (show) show.click();
  const know = document.querySelector('#review-box #review-know');
  if (know) know.click();
});
// 数学速查卡
guard('数学速查卡-完整流程', function () {
  window.__switchTab('math');
  const start = document.querySelector('#btn-math-flash-start');
  if (start) start.click();
  const showBtn = Array.from(document.querySelectorAll('#math-flashcard-box button')).find(function (b) { return /显示答案/.test(b.textContent); });
  if (showBtn) { showBtn.click(); }
  const rightBtn = Array.from(document.querySelectorAll('#math-flashcard-box button')).find(function (b) { return /我答对了/.test(b.textContent); });
  if (rightBtn) rightBtn.click();
});
// 数学刷题
guard('数学刷题-点选项', function () {
  const start = document.querySelector('#btn-math-practice-start');
  if (start) start.click();
  const opt = document.querySelector('#math-practice .practice-opt');
  if (opt) opt.click();
});
// 408 刷题
guard('408刷题-点选项', function () {
  const start = document.querySelector('#btn-cs408-practice-start');
  if (start) start.click();
  const opt = document.querySelector('#cs408-practice .practice-opt');
  if (opt) opt.click();
});
// 数据 tab：热力图翻页 + 薄弱点报告
guard('数据热力图-翻页', function () {
  window.__switchTab('data');
  const prev = document.querySelector('#heat-prev');
  if (prev) prev.click();
  const next = document.querySelector('#heat-next');
  if (next) next.click();
  const now = document.querySelector('#heat-now');
  if (now) now.click();
});
// 今日打卡
guard('今日打卡-打卡按钮', function () {
  window.__switchTab('today');
  const ck = document.querySelector('#btn-checkin');
  if (ck) ck.click();
});
// 长难句分析
guard('长难句-分析', function () {
  window.__switchTab('sentences');
  const inp = document.querySelector('#sentence-input');
  const btn = document.querySelector('#btn-analyze');
  if (inp && btn) { inp.value = 'The book which I read yesterday was very interesting.'; btn.click(); }
});
// 高频词搜索
guard('高频词-搜索', function () {
  window.__switchTab('hfwords');
  const inp = document.querySelector('#hf-search');
  if (inp) { inp.value = 'analy'; inp.dispatchEvent(new window.Event('input')); }
});
// 计划页
guard('计划页-自动生成', function () {
  window.__switchTab('plan');
  const btn = document.querySelector('#btn-auto-plan');
  if (btn) btn.click();
});
// 记录页：保存手动记录
guard('记录页-保存手动记录', function () {
  window.__switchTab('record');
  const btn = document.querySelector('#btn-save-manual');
  if (btn) btn.click();
});
// 配置页：翻译密钥测试（不真实请求，仅 UI 路径）
guard('配置页-翻译状态渲染', function () {
  window.__switchTab('config');
});
// 错题本：添加错题
guard('错题本-添加错题', function () {
  window.__switchTab('mistake');
  const content = document.querySelector('#mistake-content');
  const btn = document.querySelector('#btn-add-mistake');
  if (content && btn) { content.value = '测试错题'; btn.click(); }
});
// 数学错题：添加
guard('数学错题-添加', function () {
  window.__switchTab('math');
  const content = document.querySelector('#math-mistake-content');
  const btn = document.querySelector('#btn-add-math-mistake');
  if (content && btn) { content.value = '泰勒展开余项'; btn.click(); }
});
// 408 错题：添加
guard('408错题-添加', function () {
  window.__switchTab('cs408');
  const content = document.querySelector('#cs408-mistake-content');
  const btn = document.querySelector('#btn-add-cs408-mistake');
  if (content && btn) { content.value = '二叉树遍历'; btn.click(); }
});
// 生词本：添加单词
guard('生词本-添加', function () {
  window.__switchTab('words');
  const inp = document.querySelector('#word-manual');
  const cn = document.querySelector('#word-manual-cn');
  const btn = document.querySelector('#btn-save-manual-word');
  if (inp && cn && btn) { inp.value = 'test'; cn.value = '测试'; btn.click(); }
});
// 翻译：输入并查询（mock fetch，仅 UI 路径）
guard('翻译-输入', function () {
  window.__switchTab('translate');
  const inp = document.querySelector('#trans-input');
  if (inp) { inp.value = 'hello'; }
});
// 网站：添加
guard('网站-添加', function () {
  window.__switchTab('sites');
  const n = document.querySelector('#site-name');
  const u = document.querySelector('#site-url');
  const b = document.querySelector('#btn-add-site');
  if (n && u && b) { n.value = 'B站'; u.value = 'bilibili.com'; b.click(); }
});

// ---- 3) 结果（延迟打印，等待异步回调/定时器浮出错误）----
setTimeout(function () {
  console.log('========== 全站巡检结果 ==========');
  console.log('Tab 总数: ' + tabs.length + '，全部点击无同步异常: ' + (tabClickErrors.length === 0 ? '✅' : '❌'));
  if (tabClickErrors.length) console.log(tabClickErrors.join('\n'));
  console.log('关键交互异常: ' + (interactErrors.length === 0 ? '0 ✅' : interactErrors.length + ' ❌'));
  if (interactErrors.length) console.log(interactErrors.join('\n'));
  console.log('window 运行时错误: ' + (runtimeErrors.length === 0 ? '0 ✅' : runtimeErrors.length + ' ❌'));
  if (runtimeErrors.length) console.log(runtimeErrors.join('\n'));
  console.log('jsdom 内部错误: ' + (jsdomErrors.length === 0 ? '0 ✅' : jsdomErrors.length + ' ⚠️'));
  if (jsdomErrors.length) console.log(jsdomErrors.slice(0, 20).join('\n'));

  window.close();
  const totalFail = tabClickErrors.length + interactErrors.length + runtimeErrors.length;
  process.exit(totalFail ? 1 : 0);
}, 300);
