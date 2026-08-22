// P4b 首页一屏平铺回归测试
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

// 2. 新增计时板块（独立 id）
ok(/id="home-timer-card"/.test(html), '存在 home-timer-card');
ok(/id="home-timer-rows"/.test(html), '存在 home-timer-rows（独立于计时页 timer-rows）');
ok(/id="home-pomo-time"/.test(html) && /id="home-pomo-mode"/.test(html), '存在 home-pomo-time/mode');
ok(/id="home-btn-pomo-start"/.test(html) && /id="home-btn-pomo-reset"/.test(html), '存在首页番茄钟按钮（home- 前缀独立 id）');

// 3. 新增学习板块（四块 2×2）
ok(/id="home-study-card"/.test(html), '存在 home-study-card');
ok(/id="home-distribution"/.test(html), '存在 home-distribution');
ok(/id="home-review"/.test(html), '存在 home-review');
ok(/id="home-mistakes"/.test(html), '存在 home-mistakes');
ok(/id="home-scores"/.test(html), '存在 home-scores');

// 4. 打卡/待办/错题复习平铺（无折叠包裹）
ok(/id="checkinCard"/.test(html), '今日打卡卡存在');
ok(/id="plan-list"/.test(html), '今日待办卡存在');
ok(/id="mistake-review-card"/.test(html), '错题复习卡存在');
// 这三块不再位于 <details> 内（简单校验：mistake-review-card 前无未闭合 details）
ok((html.match(/<details/g) || []).length === (html.match(/<\/details>/g) || []).length, 'details 开闭标签配对平衡（无 home-more 残留导致的不配对）');

// 5. app.js 渲染函数挂载
ok(/function renderHomeTimer\(/.test(appjs), 'renderHomeTimer 函数存在');
ok(/function renderHomePomodoro\(/.test(appjs), 'renderHomePomodoro 函数存在');
ok(/function renderHomeDistribution\(/.test(appjs), 'renderHomeDistribution 函数存在');
ok(/function renderHomeReview\(/.test(appjs), 'renderHomeReview 函数存在');
ok(/function renderHomeMistakes\(/.test(appjs), 'renderHomeMistakes 函数存在');
ok(/function renderHomeScores\(/.test(appjs), 'renderHomeScores 函数存在');
ok(/renderHomeTimer\(\); renderHomePomodoro\(\); renderHomeDistribution\(\); renderHomeReview\(\); renderHomeMistakes\(\); renderHomeScores\(\)/.test(appjs), 'showTab(home) 已挂载 6 个首页渲染调用');
ok(/home-btn-pomo-start[\s\S]{0,120}togglePomodoro/.test(appjs), '首页番茄钟按钮绑定 togglePomodoro');

// 6. 不再引用已删除的首页旧 timer-rows id（计时页仍用 timer-rows，但首页容器改用 home-timer-rows）
// 仅校验首页区域无裸露的 id="timer-rows"（该 id 现仅属于计时页）
ok(!/id="timer-rows"/.test(html), '首页不再有 id="timer-rows"（已改为 home-timer-rows，避免与计时页冲突）');

// 7. CSS 样式
ok(/\.home-timer-grid/.test(css), 'CSS .home-timer-grid 存在');
ok(/\.home-study-grid/.test(css), 'CSS .home-study-grid 存在');
ok(/\.hs-block/.test(css), 'CSS .hs-block 存在');
ok(/@media \(max-width: 768px\)[\s\S]{0,400}\.home-timer-grid \{ grid-template-columns: 1fr/.test(css), '768px 下计时网格单列');
ok(/@media \(max-width: 768px\)[\s\S]{0,400}\.home-study-grid \{ grid-template-columns: 1fr/.test(css), '768px 下学习网格单列');

// 8. smart-plan-fold 保留（P4b 不删）
ok(/class="smart-plan-fold"/.test(html), 'smart-plan-fold 折叠保留（P4b 只删 home-more）');

console.log('\\nP4b 测试结果：通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail ? 1 : 0);
