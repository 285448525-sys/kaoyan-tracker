/* jsdom 全流程测试：版本 m —— 错题录入简化（1 框 + 3 按钮）+ AI Key 双轨（文本 / 视觉）
 * 关键约束：旧录入字段 id 必须仍存在于 DOM（test_mistake_merge.js / test_tabs.js 依赖），
 * 同时新增「🪄 智能整理 / 直接存感想 / 手动归档」三按钮与「👁 视觉模型」配置卡。
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
if (!Store || typeof window.__switchTab !== 'function') { console.error('❌ Store / init 未就绪'); process.exit(1); }

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('✅ ' + name); }
  else { fail++; console.log('❌ ' + name + (extra !== undefined ? ' → ' + extra : '')); }
}
const $ = function (id) { return document.getElementById(id); };

// ---------- 1) 旧录入字段 id 仍存在于 DOM（回归：保留手动归档） ----------
['mistake-scope', 'mistake-math-cat', 'mistake-cs408-cat', 'mistake-content', 'mistake-note', 'btn-add-mistake', 'mistake-types', 'mistake-subject']
  .forEach(function (id) { ok('旧字段 id 仍在 DOM：#' + id, !!$(id)); });

// ---------- 2) 新录入三按钮 + 状态 + 手动归档折叠 ----------
['btn-smart-organize', 'btn-save-direct', 'btn-manual-organize', 'mistake-smart-status', 'mistake-manual-details']
  .forEach(function (id) { ok('新控件 id 在 DOM：#' + id, !!$(id)); });
ok('手动归档默认折叠（details.open=false）', $('mistake-manual-details') && $('mistake-manual-details').open === false);

// ---------- 3) 视觉模型配置卡 ----------
['vision-provider', 'vision-baseurl', 'vision-model', 'vision-key', 'btn-save-vision', 'btn-test-vision', 'vision-status', 'link-open-vision']
  .forEach(function (id) { ok('视觉配置控件 id 在 DOM：#' + id, !!$(id)); });
const provOpts = $('vision-provider') ? Array.from($('vision-provider').options).map(function (o) { return o.value; }) : [];
ok('视觉服务商预设 = 4 项（自定义/doubao/qwen/openai）', provOpts.length === 4 && provOpts.indexOf('doubao') >= 0 && provOpts.indexOf('qwen') >= 0 && provOpts.indexOf('openai') >= 0, JSON.stringify(provOpts));

// ---------- 4) Store 双轨 API ----------
ok('Store.getVisionConfig 存在', typeof Store.getVisionConfig === 'function');
ok('Store.setVisionConfig 存在', typeof Store.setVisionConfig === 'function');

// 旧备份缺 visionConfig → 归一化为默认空配置
Store.importJSON(JSON.stringify({ mistakes: [], mathMistakes: [], cs408Mistakes: [], aiConfig: { baseUrl: '', model: '', key: '' } }));
const vc0 = Store.getVisionConfig();
ok('importJSON 缺 visionConfig → 默认 provider/baseUrl/model/key 全空', vc0.provider === '' && vc0.baseUrl === '' && vc0.model === '' && vc0.key === '');

// 文本 AI 配置不受视觉轨影响（legacy 形状保持）
const ac = Store.getAiConfig();
ok('getAiConfig 仍返回 legacy {baseUrl,model,key} 形状', 'baseUrl' in ac && 'model' in ac && 'key' in ac);

// 视觉配置 round-trip
Store.setVisionConfig({ provider: 'doubao', baseUrl: 'https://x.test/v1', model: 'm-model', key: 'sk-test' });
const vc1 = Store.getVisionConfig();
ok('setVisionConfig 落库并读取一致', vc1.provider === 'doubao' && vc1.baseUrl === 'https://x.test/v1' && vc1.model === 'm-model' && vc1.key === 'sk-test');

// 异常 provider 被清洗
Store.setVisionConfig({ provider: 'hacked', baseUrl: 'b', model: 'm', key: 'k' });
ok('非法 provider 被清洗为默认空', Store.getVisionConfig().provider === '');

// 导出包含 visionConfig（整体 stringify）
ok('exportJSON 含 visionConfig 字段', /"visionConfig"/.test(Store.exportJSON()));

// ---------- 5) 服务商预设 change → 自动带出接口地址/模型名 ----------
$('vision-provider').value = 'doubao';
$('vision-provider').dispatchEvent(new window.Event('change', { bubbles: true }));
ok('选「豆包」预设 → baseUrl 自动带出', ($('vision-baseurl').value || '').indexOf('volces.com') >= 0, $('vision-baseurl').value);
ok('选「豆包」预设 → model 自动带出 doubao-1.5-vision-pro', $('vision-model').value === 'doubao-1.5-vision-pro', $('vision-model').value);
$('vision-provider').value = 'openai';
$('vision-provider').dispatchEvent(new window.Event('change', { bubbles: true }));
ok('选「OpenAI」预设 → model 自动带出 gpt-4o-mini', $('vision-model').value === 'gpt-4o-mini', $('vision-model').value);

// ---------- 6) 行为：直接存为感悟 ----------
Store.importJSON(JSON.stringify({ mistakes: [], mathMistakes: [], cs408Mistakes: [] }));
$('mistake-content').value = '今天搞懂了快排的分治边界';
$('btn-save-direct').dispatchEvent(new window.Event('click', { bubbles: true }));
const mk = Store.getMistakes();
ok('点「直接存为感悟」→ mistakes +1 且内容正确', mk.length === 1 && mk[0].content === '今天搞懂了快排的分治边界' && mk[0].type === '今日感悟');
ok('保存后内容框清空', $('mistake-content').value === '');

// ---------- 7) 行为：智能整理但无 AI 配置 → 不崩、不写库 ----------
const before = Store.getMistakes().length + Store.getMathMistakes().length + Store.get408Mistakes().length;
$('mistake-content').value = '一道线性代数特征值题，我搞混了相似矩阵';
let threw = false;
try { $('btn-smart-organize').dispatchEvent(new window.Event('click', { bubbles: true })); } catch (e) { threw = true; console.log('   异常：', e.message); }
const after = Store.getMistakes().length + Store.getMathMistakes().length + Store.get408Mistakes().length;
ok('智能整理无配置时不抛异常', threw === false);
ok('智能整理无配置时不写入任何错题（走提示/手动归档）', after === before, 'before=' + before + ' after=' + after);

// ---------- 8) 版本一致性（防漏升版） ----------
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

console.log('\n========== 错题录入简化 + AI 双轨 测试结果 ==========');
console.log('通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail ? 1 : 0);
