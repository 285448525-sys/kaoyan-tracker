#!/usr/bin/env node
// P6 空状态统一规范验收（方案39）
// 1. 废弃的 .empty-state / .es-* emoji 块已删除（与 SVG 意图冲突）
// 2. .empty-hint 升级为居中 flex 列 + 线性图标 (.empty-ic) 样式存在
// 3. app.emptyHint 渲染出 [data-icon] 线性图标 span（非 emoji）
// 4. 无裸「暂无/还没有」作为整行空状态文案（chartEmptyState / emptyHint 均已场景化）
// 5. chartEmptyState 仍用内联 SVG 插图（.empty-illust）
const fs = require('fs');
const path = require('path');
const css = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; } else { fail++; console.log('  FAIL:', name); } }

// 1. 废弃块移除
ok('已删除 .empty-state 废弃块', !/\.empty-state\s*\{/.test(css));
ok('已删除 .es-icon emoji 样式', !/\.es-icon\s*\{/.test(css));
ok('已删除 .es-btn 样式', !/\.es-btn\s*\{/.test(css));

// 2. .empty-hint 升级
ok('.empty-hint 居中 flex 列', /\.empty-hint\s*\{[^}]*display:\s*flex/.test(css) && /\.empty-hint\s*\{[^}]*flex-direction:\s*column/.test(css));
ok('.empty-hint .empty-ic 图标样式存在', /\.empty-hint\s+\.empty-ic\s*\{/.test(css));
ok('.empty-ic 走 --primary', /\.empty-hint\s+\.empty-ic\s*\{[^}]*color:\s*var\(--primary\)/.test(css));

// 3. emptyHint 生成 data-icon（非 emoji）
ok('emptyHint 渲染 data-icon span', /function emptyHint[\s\S]*?setAttribute\('data-icon'/.test(app));
ok('emptyHint 调 Icon.fill 注入 SVG', /function emptyHint[\s\S]*?Icon\.fill\(box\)/.test(app));
ok('emptyHint 用 window.Icon 守卫', /function emptyHint[\s\S]*?window\.Icon && Icon\.paths\[action\.icon\]/.test(app));

// 4. 关键场景接了图标
['icon: \'clock\'','icon: \'target\'','icon: \'list\'','icon: \'bug\'','icon: \'book\''].forEach(s =>
  ok('emptyHint 调用带图标 '+s, app.includes(s)));

// 5. chartEmptyState 仍用 .empty-illust 内联 SVG
ok('chartEmptyState 用 .empty-illust', /chartEmptyState[\s\S]*?empty-illust/.test(app) || /empty-illust/.test(css));

// 6. 无裸「暂无」作为整段空状态（允许：inline 括号说明 / 已完成态 review-done / 内部变量名）
const bareZanwu = (app.match(/'(暂无[^']*?)'/g) || []).filter(s => !/（.*暂无.*）/.test(s) && !/暂无待复习词/.test(s));
ok('无裸「暂无」整行空状态文案', bareZanwu.length === 0);

console.log(`P6 empty-state test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
