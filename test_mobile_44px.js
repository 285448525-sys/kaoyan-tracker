#!/usr/bin/env node
// P7 移动端 44px 命中区验收（方案40）
// 1. 可点击元素 min-height ≥ 44px（.timer-row .t-btn / .sub-tab-btn / .mini-btn / .ai-solved-acts .btn）
// 2. ≤560px 媒体查询内 .icon-btn 升到 44px（移动端触控兜底）
// 3. 底部导航 .btb-btn 已 ≥44px（实际 48px）
// 4. 装饰性图标方块（34/40/42px 非交互）不强制——仅校验可点击的已达标
const fs = require('fs');
const path = require('path');
const css = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; } else { fail++; console.log('  FAIL:', name); } }

// 1. 可点击元素升到 44px
ok('.timer-row .t-btn min-height:44px', /\.timer-row\s+\.t-btn\s*\{[^}]*min-height:\s*44px/.test(css));
ok('.sub-tab-btn min-height:44px', /\.sub-tab-btn\s*\{[^}]*min-height:\s*44px/.test(css));
ok('.sub-tab-btn(560) min-height:44px', /@media\s*\(max-width:\s*560px\)[\s\S]*?\.sub-tab-btn\s*\{[^}]*min-height:\s*44px/.test(css));
ok('.mini-btn min-height:44px', /\.mini-btn\s*\{[^}]*min-height:\s*44px/.test(css));
ok('.ai-solved-acts .btn min-height:44px', /\.ai-solved-acts\s+\.btn\s*\{[^}]*min-height:\s*44px/.test(css));

// 2. 移动端 .icon-btn 44px 兜底
ok('@media(560) .icon-btn 44px', /@media\s*\(max-width:\s*560px\)[\s\S]*?\.icon-btn\s*\{[^}]*width:\s*44px[^}]*height:\s*44px/.test(css));

// 3. 底部导航 ≥44px
ok('.bottom-tabbar .btb-btn min-height:48px', /\.bottom-tabbar\s+\.btb-btn\s*\{\s*min-height:\s*48px/.test(css));

// 4. 无残留的可点击 42/40/38/36px（仅装饰方块允许）
const clickable = [/\.timer-row\s+\.t-btn/, /\.sub-tab-btn/, /\.mini-btn/, /\.ai-solved-acts\s+\.btn/];
let bad = 0;
css.split('\n').forEach(line => {
  clickable.forEach(re => {
    if (re.test(line) && /min-height:\s*(3[0-9]|4[0-3])px/.test(line)) bad++;
  });
});
ok('无残留可点击 <44px', bad === 0);

console.log(`P7 mobile-44px test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
