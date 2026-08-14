/* jsdom 专项验证：本轮 7 项需求的新功能（AI 配置/背单词设置/长难句增强/新手引导/错题本 AI 讲解） */
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
window.fetch = window.fetch || function () { return Promise.reject(new Error('fetch disabled in test')); };
// 不设 kaoyan_tour_done，验证引导会弹出；但等 tour 计时器前先记录

const runtimeErrors = [];
window.addEventListener('error', function (e) {
  const st = e.error && e.error.stack ? e.error.stack.split('\n').slice(0, 4).join(' ← ') : '';
  runtimeErrors.push((e.message || 'window error') + (st ? ' [STACK] ' + st : ''));
});
window.addEventListener('unhandledrejection', function (e) { runtimeErrors.push('promise: ' + (e.reason && e.reason.message || e.reason)); });

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

// ================= 1) 新手引导（不设 done 标记，应自动弹出） =================
setTimeout(function () {
  const mask = document.querySelector('.tour-mask');
  ok(!!mask, '首次访问自动弹出引导遮罩');
  if (mask) {
    const title = document.getElementById('tour-title');
    ok(!!title && title.textContent.indexOf('欢迎使用') >= 0, '引导第 1 步为欢迎语');
    // 检查第 2、3 步指向配置（翻译 / AI）
    const nextBtn = document.getElementById('tour-next');
    nextBtn && nextBtn.click();
    const t2 = document.getElementById('tour-title');
    ok(!!t2 && t2.textContent.indexOf('翻译密钥') >= 0, '引导第 2 步优先引导翻译密钥配置');
    const gotoBtn = document.getElementById('tour-goto');
    ok(!!gotoBtn && gotoBtn.style.display !== 'none', '第 2 步显示「前往配置」指向按钮');
    nextBtn && nextBtn.click();
    const t3 = document.getElementById('tour-title');
    ok(!!t3 && t3.textContent.indexOf('AI 能力') >= 0, '引导第 3 步优先引导 AI 配置');
    // 点击前往 → 应切到 config tab 并高亮目标卡
    gotoBtn && gotoBtn.click();
    setTimeout(function () {
      const configActive = document.querySelector('#tab-config') && document.querySelector('#tab-config').classList.contains('active');
      ok(!!configActive, '「前往配置」切换到配置页');
      const target = document.querySelector('.ai-card.tour-target');
      ok(!!target, 'AI 配置卡被高亮（tour-target）');
      // 清理：关闭引导并标记完成，避免后续干扰
      const skip = document.getElementById('tour-skip');
      if (skip) skip.click();
      runNextChecks();
    }, 60);
  } else { runNextChecks(); }
}, 800);

// ================= 2) 其余新功能检查（引导关闭后执行） =================
function runNextChecks() {
  try { window.localStorage.setItem('kaoyan_tour_done', '1'); } catch (e) {}

  // ---- AI 配置卡 ----
  ok(!!document.getElementById('ai-baseurl'), '配置页存在 AI 接口地址输入框');
  ok(!!document.getElementById('ai-model'), '配置页存在 AI 模型输入框');
  ok(!!document.getElementById('ai-key'), '配置页存在 AI Key 输入框');
  ok(!!document.getElementById('btn-save-ai'), '存在保存 AI 配置按钮');
  ok(!!document.getElementById('btn-test-ai'), '存在测试 AI 连接按钮');
  // Store API
  ok(typeof Store.getAiConfig === 'function' && typeof Store.setAiConfig === 'function', 'Store 导出 getAiConfig/setAiConfig');
  Store.setAiConfig({ baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', key: 'sk-test' });
  const ai = Store.getAiConfig();
  ok(ai.baseUrl === 'https://api.deepseek.com/v1' && ai.model === 'deepseek-chat' && ai.key === 'sk-test', 'AI 配置存取正确');
  Store.setAiConfig({ key: '' });
  ok(Store.getAiConfig().key === '', 'AI Key 可清空');

  // ---- 背单词设置 ----
  ok(!!document.getElementById('btn-practice-settings'), '背单词卡片存在齿轮按钮');
  ok(!!document.getElementById('practice-settings'), '存在练习设置面板容器');
  ok(!!document.getElementById('ps-count') && !!document.getElementById('ps-scope') && !!document.getElementById('ps-mode') && !!document.getElementById('ps-autosave'), '设置面板含题量/范围/模式/自动收入控件');
  ok(typeof Store.getPracticeSettings === 'function' && typeof Store.setPracticeSettings === 'function', 'Store 导出 get/setPracticeSettings');
  const ps = Store.setPracticeSettings({ count: 8, scope: 'wrong', mode: 'cn2en', autoSave: false });
  ok(ps.count === 8 && ps.scope === 'wrong' && ps.mode === 'cn2en' && ps.autoSave === false, '练习设置保存正确');
  // 打开设置面板
  document.getElementById('btn-practice-settings').click();
  ok(document.getElementById('practice-settings').hidden === false, '点击齿轮展开设置面板');
  // 保存设置（应重新开一批）
  document.getElementById('ps-count').value = 6;
  document.getElementById('ps-scope').value = 'all';
  document.getElementById('ps-mode').value = 'en2cn';
  document.getElementById('ps-autosave').checked = true;
  document.getElementById('btn-ps-save').click();
  ok(document.getElementById('practice-settings').hidden === true, '保存后面板收起');
  const ps2 = Store.getPracticeSettings();
  ok(ps2.count === 6 && ps2.scope === 'all' && ps2.mode === 'en2cn' && ps2.autoSave === true, '保存逻辑写回 Store 正确');

  // ---- 长难句 stats（需求3） ----
  const sa = window.SentenceAnalyzer;
  ok(!!sa, 'SentenceAnalyzer 存在');
  const r = sa.analyze('Although the mechanism remains unclear, researchers believe that these changes, which occur over time, may lead to significant improvements in memory.');
  ok(!!r.stats && r.stats.wordCount > 0, '长难句返回 stats 统计');
  ok(r.stats.difficulty === '困难' || r.stats.difficulty === '中等' || r.stats.difficulty === '简单', '难度评估存在');
  ok(Array.isArray(r.stats.signals) && r.stats.signals.length > 0, '识别出逻辑信号词');
  ok(Array.isArray(r.stats.features), '句式特征列表存在');
  ok(Array.isArray(r.stats.pronouns), '代词列表存在');

  // ---- 错题本 AI 讲解按钮（需求1） ----
  Store.addWrongWord('paradigm', 'n. 范式', 'translate');
  window.__switchTab('words');
  setTimeout(function () {
    const aiBtn = document.querySelector('.mistake-item .ai-explain-btn');
    ok(!!aiBtn, '错题本条目出现「🤖 AI 讲解」按钮');
    // 点击应展开 AI 盒子（无 key 时显示配置提示，不崩溃）
    aiBtn && aiBtn.click();
    setTimeout(function () {
      const box = document.querySelector('.mistake-item .ai-explain-box');
      ok(!!box, '点击 AI 讲解展开结果容器');
      finish();
    }, 80);
  }, 80);
}

function finish() {
  console.log('\n========== 新功能专项测试结果 ==========');
  console.log('通过 ' + pass + ' / 失败 ' + fail);
  if (runtimeErrors.length) console.log('⚠️ 运行时错误: ' + runtimeErrors.join(' | '));
  if (jsdomErrors.length) console.log('⚠️ jsdom 错误: ' + jsdomErrors.join(' | '));
  process.exit(fail ? 1 : 0);
}
