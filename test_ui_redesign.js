/* UI 重新设计专项验证（v20260817h）：低饱和高级风调色板 + 组件令牌 + 旧艳色清扫 + 版本一致 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('✅ ' + name); } else { fail++; console.log('❌ ' + name); } }

const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
const cssNoComment = css.replace(/\/\*[\s\S]*?\*\//g, '');

// ---- 解析 :root 与深色块 ----
function parseBlock(re) {
  const m = css.match(re);
  if (!m) return {};
  const body = m[1];
  const out = {};
  body.replace(/--([a-z0-9-]+)\s*:\s*([^;]+);/g, function (_, k, v) { out['--' + k] = v.trim(); return ''; });
  return out;
}
const light = parseBlock(/:root\s*\{([^}]*)\}/);
const dark = parseBlock(/:root\[data-theme="dark"\]\s*\{([^}]*)\}/);

function hexToRgb(h) {
  h = h.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function lin(c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function luminance(h) { const [r, g, b] = hexToRgb(h); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); }
function hslSat(h) {
  const [r, g, b] = hexToRgb(h).map(v => v / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return 0;
  const d = mx - mn;
  return d / (1 - Math.abs(2 * l - 1));
}

console.log('===== 浅色新令牌齐全 =====');
const needLight = ['--bg','--card','--primary','--primary-weak','--primary-ink','--surface-2','--ink-2','--line-strong','--ok-weak','--shadow-sm','--fs-base','--sp-4'];
for (const t of needLight) ok(typeof light[t] === 'string' && light[t].length, '浅色令牌 ' + t + ' 已定义（=' + (light[t] || '') + '）');

console.log('===== 主色去饱和：S < 55% =====');
ok(light['--primary'] === '#6b6f9c', '浅色 --primary 已更新为 #6b6f9c');
const sat = hslSat(light['--primary'] || '#000');
ok(sat < 0.55, '浅色 --primary 饱和度 S=' + (sat * 100).toFixed(1) + '% < 55%（旧 ≈78%）');

console.log('===== 页面底/卡片明度差 ΔL ∈ [4,14] =====');
const Lbg = luminance(light['--bg']), Lcard = luminance(light['--card']);
const dL = Math.abs(Lcard - Lbg) * 100;
ok(dL >= 4 && dL <= 14, '浅色 --bg/--card 明度差 ΔL=' + dL.toFixed(2) + ' ∈ [4,14]（既分得开又不刺眼）');

console.log('===== 深色令牌已更新 =====');
ok(dark['--primary'] === '#979bc4', '深色 --primary 已更新为 #979bc4');
ok(dark['--bg'] === '#15151a', '深色 --bg 已更新为 #15151a');
ok(dark['--card'] === '#1d1d23', '深色 --card 已更新为 #1d1d23');
ok(dark['--primary-weak'] === '#262838' && dark['--primary-ink'] === '#b9bce0', '深色 --primary-weak/--primary-ink 已定义');

console.log('===== 旧艳色已清（注释外无裸色）=====');
for (const c of ['#4f46e5', '#6366f1', '#06b6d4']) {
  ok(cssNoComment.indexOf(c) === -1, '注释外已无裸色 ' + c);
}

console.log('===== 字号令牌落地 =====');
ok(/body\s*\{[^}]*font-size:\s*var\(--fs-base\)/.test(css), 'body 使用 var(--fs-base) 统一正文字号');

console.log('===== 版本一致 =====');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const versionMatch = app.match(/var APP_VERSION = '([^']+)';/);
const expectedVersion = versionMatch ? versionMatch[1] : null;
ok(expectedVersion, 'app.js APP_VERSION 已定义（实际 ' + expectedVersion + '）');
const vRe = new RegExp('\\?v=' + expectedVersion, 'g');
const vCount = (html.match(vRe) || []).length;
ok(vCount === 9, 'index.html 含 9 处 ?v=' + expectedVersion + '（实际 ' + vCount + '）');

console.log('\n===== 结果 =====');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
