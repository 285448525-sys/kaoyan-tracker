/* 静态 + 加载测试：版本 f —— share.js 打卡卡换肤雾蓝
 * 校验：① share.js 在 jsdom 中可正常加载（无语法/运行错误）；
 *       ② 旧紫品牌色全部清零；③ 新雾蓝品牌色就位；④ 状态色（金/绿/红）保留。
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = __dirname;
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
  .replace(/<script[\s\S]*?<\/script>/g, '');

const vc = new VirtualConsole();
let jsdomErr = null;
vc.on('jsdomError', function (e) { jsdomErr = e.message; });
const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://kaoyan-tracker.pages.dev/', pretendToBeVisual: true, virtualConsole: vc });
const { window } = dom;
window.matchMedia = window.matchMedia || function () { return { matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }; };
function mockCtx() { return new Proxy({}, { get: function () { return function () { return mockCtx(); }; }, set: function () { return true; } }); }
window.HTMLCanvasElement.prototype.getContext = function () { return mockCtx(); };

// 仅加载 share.js 验证可解析/执行（canvas 调用被 mock 吞掉）
let loadErr = null;
try { window.eval(fs.readFileSync(path.join(ROOT, 'share.js'), 'utf8')); } catch (e) { loadErr = e.message; }

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('✅ ' + name); }
  else { fail++; console.log('❌ ' + name + (extra !== undefined ? ' → ' + extra : '')); }
}

ok('share.js 加载无异常', !loadErr && !jsdomErr, loadErr || jsdomErr);

const s = fs.readFileSync(path.join(ROOT, 'share.js'), 'utf8');

// ② 旧紫品牌色全部清零
const oldPurple = (s.match(/4F46E5|6366F1|8B5CF6|7C3AED|99,102,241|79,70,229/g) || []);
ok('旧紫品牌色（4F46E5/6366F1/8B5CF6/7C3AED/99,102,241/79,70,229）全部清零', oldPurple.length === 0, '残留 ' + oldPurple.length);

// ③ 新雾蓝品牌色就位
ok("COLORS.brand = #5B9FC9", /brand:\s*'#5B9FC9'/.test(s));
ok("COLORS.brandSoft = #3F7FA8", /brandSoft:\s*'#3F7FA8'/.test(s));
ok("COLORS.accent = #7FA8C4", /accent:\s*'#7FA8C4'/.test(s));
ok("背景渐变顶 #F4F9FC", /addColorStop\(0,\s*'#F4F9FC'\)/.test(s));
ok("背景渐变底 #EAF4FB", /addColorStop\(1,\s*'#EAF4FB'\)/.test(s));
ok("光晕 rgba(91,159,201,0.28)", /rgba\(91,159,201,0\.28\)/.test(s));
ok("光晕 rgba(91,159,201,0)", /rgba\(91,159,201,0\)/.test(s));
ok("卡片边框 rgba(91,159,201,0.10)", /rgba\(91,159,201,0\.10\)/.test(s));
ok("底栏分割线 rgba(91,159,201,0.16)", /rgba\(91,159,201,0\.16\)/.test(s));
ok("倒计时 pill #5B9FC9→#3F7FA8", /addColorStop\(0,\s*'#5B9FC9'\)[\s\S]*addColorStop\(1,\s*'#3F7FA8'\)/.test(s));

// ④ 状态色（金/绿/红）保留不动
ok("状态色 金 #D97706 保留", /D97706/.test(s));
ok("状态色 绿 #059669 保留", /059669/.test(s));
ok("状态色 红 #DC2626 保留", /DC2626/.test(s));

console.log('\n========== 打卡卡换肤（雾蓝）测试结果 ==========');
console.log('通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail ? 1 : 0);
