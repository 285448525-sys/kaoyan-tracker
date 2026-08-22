// P4c 首页一屏平铺回归测试（取代 P4b：首页番茄钟已移入独立计时页）
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const appjs = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.log('❌ ' + msg); } }

// 1. 折叠块已删除
ok(!/class="home-more"/.test(html), 'home-more 折叠块已删除（index.html 无 class="home-more"）');
ok(!/home-more-sum/.test(html), 'home-more-sum 已删除');
ok(!/<details class="home-more">/.test(html), '无 <details class="home-more"> 开标签');

// 2. 计时板块（首页只显科目计时行 + 跳转，完整番茄钟在计时页）
ok(/id="home-timer-card"/.test(html), '存在 home-timer-card');
ok(/id="home-timer-rows"/.test(html), '存在 home-timer-rows（独立于计时页 timer-rows）');
ok(/data-goto="timer"/.test(html), '存在「去计时页」入口（首页番茄钟已移入计时页）');

// 3. 学习板块（四块 2×2）
ok(/id="home-study-card"/.test(html), '存在 home-study-card');
ok(/id="home-distribution"/.test(html), '存在 home-distribution');
ok(/id="home-review"/.test(html), '存在 home-review');
ok(/id="home-mistakes"/.test(html), '存在 home-mistakes');
ok(/id="home-scores"/.test(html), '存在 home-scores');

// 4. 打卡/待办/错题复习平铺（无折叠包裹）
ok(/id="checkinCard"/.test(html), '今日打卡卡存在');
ok(/id="plan-list"/.test(html), '今日待办卡存在');
ok(/id="mistake-review-card"/.test(html), '错题复习卡存在');
ok((html.match(/<details/g) || []).length === (html.match(/<\/details>/g) || []).length, 'details 开闭标签配对平衡（无 home-more 残留导致的不配对）');

// 5. app.js 渲染函数挂载（首页 5 个 home- 渲染，番茄钟在计时页）
ok(/function renderHomeTimer\(/.test(appjs), 'renderHomeTimer 函数存在');
ok(/function renderHomeDistribution\(/.test(appjs), 'renderHomeDistribution 函数存在');
ok(/function renderHomeReview\(/.test(appjs), 'renderHomeReview 函数存在');
ok(/function renderHomeMistakes\(/.test(appjs), 'renderHomeMistakes 函数存在');
ok(/function renderHomeScores\(/.test(appjs), 'renderHomeScores 函数存在');
ok(/renderHomeTimer\(\)/.test(appjs) && /renderHomeDistribution\(\)/.test(appjs) && /renderHomeReview\(\)/.test(appjs) && /renderHomeMistakes\(\)/.test(appjs) && /renderHomeScores\(\)/.test(appjs), 'showTab(home) 已挂载 5 个首页渲染调用');

// 6. 首页区域不再出现旧 timer-rows id（计时页用 timer-rows，首页容器改用 home-timer-rows 避免冲突）
var homeBlock = (function () {
  var hi = html.indexOf('id="tab-home"');
  var next = html.indexOf('id="tab-', hi + 10);
  return html.slice(hi, next < 0 ? html.length : next);
})();
ok(!/id="timer-rows"/.test(homeBlock), '首页区域(tab-home)不再有 id="timer-rows"（计时页用 timer-rows，首页用 home-timer-rows）');

// 7. CSS 样式
ok(/\.home-timer-grid/.test(css), 'CSS .home-timer-grid 存在');
ok(/\.home-study-grid/.test(css), 'CSS .home-study-grid 存在');
ok(/\.hs-block/.test(css), 'CSS .hs-block 存在');
ok(/@media \(max-width: 768px\)[\s\S]{0,400}\.home-timer-grid \{ grid-template-columns: 1fr/.test(css), '768px 下计时网格单列');
ok(/@media \(max-width: 768px\)[\s\S]{0,400}\.home-study-grid \{ grid-template-columns: 1fr/.test(css), '768px 下学习网格单列');

// 8. smart-plan-fold 保留（P4b 只删 home-more）
ok(/class="smart-plan-fold"/.test(html), 'smart-plan-fold 折叠保留（P4b 只删 home-more）');

console.log('\nP4c 首页测试结果：通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail ? 1 : 0);
