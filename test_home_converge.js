// P4 首页收敛验收（v20260822m）
// 校验：hero 问候/连续天数/目标 元素存在；今日分布/今日得分移出 #today-aggregate；
//      5 个次级块包进 <details class="home-more"> 默认收起；计时两块保留在折叠区外。
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; } else { fail++; console.log('  ✗ ' + name); } }

// hero 元素
ok('hero-greet 存在', /id="hero-greet"/.test(html));
ok('hero-streak-day 存在', /id="hero-streak-day"/.test(html));
ok('hero-target 存在', /id="hero-target"/.test(html));

// 今日分布 / 今日得分 已移出 #today-aggregate（不在其闭合前的内部）
const agg = html.match(/<div class="card today-aggregate"[\s\S]*?<\/div><\/div>\s*<!-- 快捷入口/);
ok('today-dist 不在 #today-aggregate 内', agg ? !/id="today-dist"/.test(agg[0]) : true);
ok('today-score-card 不在 #today-aggregate 内', agg ? !/id="today-score-card"/.test(agg[0]) : true);

// 折叠区
ok('home-more details 存在', /<details class="home-more">/.test(html));
ok('home-more-sum summary 存在', /class="home-more-sum"/.test(html));
ok('home-more 默认无 open 属性', /<details class="home-more">/.test(html) && !/details class="home-more"[^>]*\bopen\b/.test(html));

// 5 个次级块都在折叠区内
const more = html.match(/<details class="home-more">([\s\S]*?)<\/details>/);
ok('折叠区闭合存在', !!more);
if (more) {
  const body = more[1];
  ok('折叠区含 今日打卡(checkinCard)', /id="checkinCard"/.test(body));
  ok('折叠区含 今日待办(btn-auto-plan)', /id="btn-auto-plan"/.test(body));
  ok('折叠区含 错题复习(mistake-review-card)', /id="mistake-review-card"/.test(body));
  ok('折叠区含 今日分布(today-dist)', /id="today-dist"/.test(body));
  ok('折叠区含 今日得分(today-score-card)', /id="today-score-card"/.test(body));
}

// 计时两块保留在折叠区外（首屏）
ok('按模块计时 在折叠区外', !more || !/id="timer-rows"/.test(more[1]));
ok('番茄钟 在折叠区外', !more || !/pomodoro-card/.test(more[1]));
ok('timer-rows 仍存在', /id="timer-rows"/.test(html));
ok('pomodoro-card 仍存在', /class="card pomodoro-card"/.test(html));

// 快捷入口仍在折叠区外、计时之前
const quickIdx = html.indexOf('id="home-quick-card"');
const moreIdx = html.indexOf('class="home-more"');
const timerIdx = html.indexOf('id="timer-rows"');
ok('快捷入口在折叠区前', quickIdx > 0 && moreIdx > quickIdx);
ok('计时在折叠区后', timerIdx > moreIdx);

console.log(`\n==== P4 首页收敛验收：通过 ${pass} / 失败 ${fail} ====`);
process.exit(fail ? 1 : 0);
