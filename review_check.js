/* 静态审查：① app.js 引用的元素 ID 是否都存在于 index.html；② 疑似未使用的函数 */
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

// 1) HTML 中存在的 id
const htmlIds = new Set();
let m;
const idRe = /id="([^"]+)"/g;
while ((m = idRe.exec(html))) htmlIds.add(m[1]);

// 2) app.js 中通过 $('x') / getElementById('x') 引用的 id
const refIds = new Set();
const refRe = /\$\(\s*'([^']+)'\s*\)|getElementById\(\s*'([^']+)'\s*\)/g;
while ((m = refRe.exec(app))) refIds.add(m[1] || m[2]);

const missing = Array.from(refIds).filter(function (id) { return !htmlIds.has(id); });
// 排除 app.js 内动态生成的 id（html += '<div id="xxx">' 这类）
const dynamicIds = new Set();
const dynRe = /id="([^"]+)"/g;
while ((m = dynRe.exec(app))) dynamicIds.add(m[1]);
// 排除惰性创建（先 getElementById 后赋值 id，如 var b = getElementById('x'); b.id = 'x';）
const lazyIds = new Set();
const lazyRe = /getElementById\(\s*'([^']+)'\s*\)/g;
while ((m = lazyRe.exec(app))) {
  if (new RegExp("id = '" + m[1] + "'").test(app)) lazyIds.add(m[1]);
}
const realMissing = missing.filter(function (id) { return !dynamicIds.has(id) && !lazyIds.has(id); });
console.log('=== 引用的元素 ID 但 HTML 中不存在（潜在 null 引用）===');
console.log(realMissing.length ? realMissing.join('\n') : '（无）');

// 3) 疑似未使用的函数：词边界引用数 <= 定义数（含 addEventListener('x', fn) 这类引用）
const defRe = /function\s+([A-Za-z_$][\w$]*)\s*\(/g;
const defCounts = {};
while ((m = defRe.exec(app))) defCounts[m[1]] = (defCounts[m[1]] || 0) + 1;
const unused = [];
Object.keys(defCounts).forEach(function (name) {
  const refRe = new RegExp('\\b' + name + '\\b', 'g');
  const refs = (app.match(refRe) || []).length;
  if (refs <= defCounts[name]) unused.push(name + '（引用' + refs + '/定义' + defCounts[name] + '）');
});
// 排除 IIFE 命名入口与正则边界匹配不上的工具名（$ 后接 ( 时 \b 不成立，属误报）
const exclude = ['init', 'ready', '$'];
console.log('\n=== 真正未引用的函数（引用数<=定义数，需人工确认）===');
console.log(unused.filter(function (n) { return exclude.every(function (x) { return n.indexOf(x) !== 0; }); }).join('\n') || '（无）');

// 4) 残留 console.log 调试语句
const logs = (app.match(/console\.(log|debug|info)\s*\(/g) || []).length;
console.log('\n=== 残留 console.log/debug/info 数量 ===');
console.log(logs);

// 5) 重复 id 检测
const allIds = [];
const idRe2 = /id="([^"]+)"/g;
while ((m = idRe2.exec(html))) allIds.push(m[1]);
const dup = allIds.filter(function (id, i) { return allIds.indexOf(id) !== i; });
console.log('\n=== HTML 中重复 id ===');
console.log(dup.length ? Array.from(new Set(dup)).join(', ') : '（无）');
