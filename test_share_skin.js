/* 静态 + 加载测试：版本 r —— share.js 打卡卡换肤暖橙（Memphis 对齐）
 * 校验：① share.js 在 jsdom 中可正常加载（无语法/运行错误）；
 *       ② 旧雾蓝品牌色全部清零；③ 新暖橙品牌色就位；④ 状态色（金/绿/红）保留。
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

// ② 旧雾蓝品牌色全部清零
const oldBlue = (s.match(/5B9FC9|3F7FA8|7FA8C4|91,159,201|F4F9FC|EAF4FB/g) || []);
ok('旧雾蓝品牌色（5B9FC9/3F7FA8/7FA8C4/91,159,201/F4F9FC/EAF4FB）全部清零', oldBlue.length === 0, '残留 ' + oldBlue.length);

// ③ 新暖橙品牌色就位
ok("COLORS.brand = #EA580C", /brand:\s*'#EA580C'/.test(s));
ok("COLORS.brandSoft = #C2410C", /brandSoft:\s*'#C2410C'/.test(s));
ok("COLORS.accent = #F97316", /accent:\s*'#F97316'/.test(s));
ok("背景渐变顶 #FFF8EC", /addColorStop\(0,\s*'#FFF8EC'\)/.test(s));
ok("背景渐变底 #FCEFD8", /addColorStop\(1,\s*'#FCEFD8'\)/.test(s));
ok("光晕 rgba(234,88,12,0.26)", /rgba\(234,88,12,0\.26\)/.test(s));
ok("光晕 rgba(234,88,12,0)", /rgba\(234,88,12,0\)/.test(s));
ok("卡片边框 rgba(194,65,12,0.20)", /rgba\(194,65,12,0\.20\)/.test(s));
ok("底栏分割线 rgba(194,65,12,0.18)", /rgba\(194,65,12,0\.18\)/.test(s));
ok("倒计时 pill #EA580C→#C2410C", /addColorStop\(0,\s*'#EA580C'\)[\s\S]*addColorStop\(1,\s*'#C2410C'\)/.test(s));

// ④ 状态色（金/绿/红）保留不动
ok("状态色 金 #D97706 保留", /D97706/.test(s));
ok("状态色 绿 #059669 保留", /059669/.test(s));
ok("状态色 红 #DC2626 保留", /DC2626/.test(s));

console.log('\n========== 打卡卡换肤（暖橙）测试结果 ==========');
console.log('通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail ? 1 : 0);
