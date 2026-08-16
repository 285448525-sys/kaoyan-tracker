/* jsdom 全流程测试：三套错题本合并 MVP —— 统一录入路由 + 合并列表 + 到期徽标 */
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
if (!Store || typeof window.__switchTab !== 'function') { console.error('❌ Store / init 未就绪'); process.exit(1); }

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('✅ ' + name); }
  else { fail++; console.log('❌ ' + name + (extra !== undefined ? ' → ' + extra : '')); }
}
const today = Store.todayStr();

// 通过统一的 btn-add-mistake 录入（模拟用户选范围 + 填内容 + 点保存）
function addViaUi(scope, content, cat) {
  const scopeSel = document.getElementById('mistake-scope');
  scopeSel.value = scope;
  scopeSel.dispatchEvent(new window.Event('change', { bubbles: true }));
  if (scope === 'math') document.getElementById('mistake-math-cat').value = cat;
  if (scope === 'cs408') document.getElementById('mistake-cs408-cat').value = cat;
  document.getElementById('mistake-content').value = content;
  document.getElementById('btn-add-mistake').dispatchEvent(new window.Event('click', { bubbles: true }));
}

// 1) 清空三数组（零迁移：仅验证 UI 路由，不动 store 结构）
Store.importJSON(JSON.stringify({ mistakes: [], mathMistakes: [], cs408Mistakes: [] }));

// 2) 三范围录入分别落对应数组
addViaUi('general', '今天理解了递归', null);
addViaUi('math', '二重积分换元错误', '高数');
addViaUi('cs408', 'Cache 映射方式混淆', '数据结构');

ok('通用错题落入 mistakes 数组', Store.getMistakes().length === 1 && Store.getMistakes()[0].content === '今天理解了递归');
ok('数学错题落入 mathMistakes 数组', Store.getMathMistakes().length === 1 && Store.getMathMistakes()[0].content === '二重积分换元错误');
ok('408 错题落入 cs408Mistakes 数组', Store.get408Mistakes().length === 1 && Store.get408Mistakes()[0].content === 'Cache 映射方式混淆');

// 3) 合并列表含三数组 + scope 徽标
window.__switchTab('mistakes');
const items = document.querySelectorAll('#mistake-list .mistake-item');
ok('合并列表渲染 3 条', items.length === 3, '实际 ' + items.length);
const scopes = Array.from(document.querySelectorAll('#mistake-list .mistake-scope')).map(function (s) { return s.textContent; });
ok('列表含 通用/数学/408 三个 scope 徽标', scopes.indexOf('通用') >= 0 && scopes.indexOf('数学') >= 0 && scopes.indexOf('408') >= 0, scopes.join(','));

// 4) 范围筛选 chips：点「数学」仅留数学项
const scopeChips = Array.from(document.querySelectorAll('#mistake-filter .chip'));
const mathChip = scopeChips.find(function (c) { return c.textContent.indexOf('数学') === 0; });
if (mathChip) mathChip.dispatchEvent(new window.Event('click', { bubbles: true }));
ok('点「数学」筛选后仅剩数学项', document.querySelectorAll('#mistake-list .mistake-item').length === 1, '实际 ' + document.querySelectorAll('#mistake-list .mistake-item').length);
const allChip = Array.from(document.querySelectorAll('#mistake-filter .chip')).find(function (c) { return c.textContent.indexOf('全部') === 0; });
if (allChip) allChip.dispatchEvent(new window.Event('click', { bubbles: true }));

// 5) 到期徽标 = 数学 + 408 待复习总数（两条都设为今日到期）
const mm = Store.getMathMistakes()[0]; Store.updateMathMistake(mm.id, { nextReview: today });
const cm = Store.get408Mistakes()[0]; Store.update408Mistake(cm.id, { reviewed: false });
window.__switchTab('today'); window.__switchTab('mistakes');
const badge = document.getElementById('mistake-due-badge');
ok('到期徽标显示且 = 2（数学+408 待复习）', badge && badge.style.display !== 'none' && /2/.test(badge.textContent), badge && badge.textContent);

// 6) 删除按 scope 路由：删数学项后 mathMistakes 清空（不影响通用/408）
const mathDel = Array.from(document.querySelectorAll('#mistake-list .mistake-item')).find(function (it) {
  const sc = it.querySelector('.mistake-scope');
  return sc && sc.textContent === '数学';
});
if (mathDel) mathDel.querySelector('.plan-del').dispatchEvent(new window.Event('click', { bubbles: true }));
ok('数学项删除后 mathMistakes 清空', Store.getMathMistakes().length === 0, '剩余 ' + Store.getMathMistakes().length);
ok('删除数学项不影响通用/408 数组', Store.getMistakes().length === 1 && Store.get408Mistakes().length === 1);

// 7) 数学/408 tab 已无「错题整理」卡（DOM 中不存在旧 ID）
ok('数学 tab 不再有 math-mistake 录入控件', !document.getElementById('math-mistake-cat'));
ok('408 tab 不再有 cs408-mistake 录入控件', !document.getElementById('cs408-mistake-cat'));

console.log('\n========== 三套错题本合并测试结果 ==========');
console.log('通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail ? 1 : 0);
