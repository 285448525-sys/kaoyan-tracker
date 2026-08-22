// P4b 首页一屏平铺验收（取代原 P4 折叠验收）
// 校验：无 home-more 折叠；分布/得分进 study 板块；打卡/待办/错题平铺；
//      计时板块(home-timer)与学习板块(home-study)常驻首屏且不重叠。
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; } else { fail++; console.log('  ✗ ' + name); } }

// hero 元素（聚合卡内，P4 已加，P4b 保留）
ok('hero-greet 存在', /id="hero-greet"/.test(html));
ok('hero-streak-day 存在', /id="hero-streak-day"/.test(html));
ok('hero-target 存在', /id="hero-target"/.test(html));

// 折叠已彻底删除
ok('无 home-more details', !/<details class="home-more">/.test(html));
ok('无 home-more-sum', !/class="home-more-sum"/.test(html));

// 分布 / 得分 进入 study 板块（home-distribution / home-scores）
ok('home-distribution 存在', /id="home-distribution"/.test(html));
ok('home-scores 存在', /id="home-scores"/.test(html));
// 旧的聚合卡内 today-dist / today-score-card 已移除（不再有独立顶层 id）
ok('旧 today-dist 顶层 id 已移除', !/id="today-dist"/.test(html));
ok('旧 today-score-card 顶层 id 已移除', !/id="today-score-card"/.test(html));

// 打卡 / 待办 / 错题复习 平铺（顶层 section，无 details 包裹）
ok('今日打卡 checkinCard 平铺', /id="checkinCard"/.test(html));
ok('今日待办 btn-auto-plan 平铺', /id="btn-auto-plan"/.test(html));
ok('错题复习 mistake-review-card 平铺', /id="mistake-review-card"/.test(html));

// 计时板块常驻（独立 home-timer-rows，不与计时页 timer-rows 冲突）
ok('home-timer-card 存在', /id="home-timer-card"/.test(html));
ok('home-timer-rows 存在（独立于计时页）', /id="home-timer-rows"/.test(html));
var hcHome = (function () { var hi = html.indexOf('id="tab-home"'); var nx = html.indexOf('id="tab-', hi + 10); return html.slice(hi, nx < 0 ? html.length : nx); })();
ok('首页旧 timer-rows 已移除', !/id="timer-rows"/.test(hcHome));

// 顺序：快捷入口 → 计时(home-timer) → 学习(home-study) → 打卡 → 待办 → 错题
const quickIdx = html.indexOf('id="home-quick-card"');
const timerIdx = html.indexOf('id="home-timer-card"');
const studyIdx = html.indexOf('id="home-study-card"');
const checkinIdx = html.indexOf('id="checkinCard"');
const planIdx = html.indexOf('id="btn-auto-plan"');
const mrIdx = html.indexOf('id="mistake-review-card"');
ok('顺序 快捷→计时', timerIdx > quickIdx && quickIdx > 0);
ok('顺序 计时→学习', studyIdx > timerIdx);
ok('顺序 学习→打卡→待办→错题', checkinIdx > studyIdx && planIdx > checkinIdx && mrIdx > planIdx);

// 番茄钟详细设置（计时页）保留，首页番茄钟仅显示+按钮
ok('计时页 pomodoro-card 保留', /class="card pomodoro-card"/.test(html));
ok('首页计时板块含「去计时页」入口 (data-goto=timer)', /data-goto="timer"/.test(html));

console.log(`\n==== P4b 首页平铺验收：通过 ${pass} / 失败 ${fail} ====`);
process.exit(fail ? 1 : 0);
