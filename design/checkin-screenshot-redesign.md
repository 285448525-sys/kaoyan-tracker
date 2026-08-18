# 打卡截图美化 + 今日学习直观化（设计稿 / B 窗口交付）

> 目标：让用户在**首页截的一张图**就能一眼看出「今天学了多久 + 学了哪些模块」，并且发出去的打卡图与 App 主色一致、有高级感。
> 当前 App 主色（已确认）：雾蓝 `--primary:#5B9FC9` / 深 `--primary-d:#3F7FA8` / 点缀 `--accent:#7FA8C4`；背景 `#F4F9FC`；墨色 `#243443`；弱文 `#7A93A3`。
> 科目语义色：政治 `#f97316`、英语 `#3b82f6`、数学 `#8b5cf6`、专业课 `#10b981`、408（accent）`#7FA8C4`、默认 `#5B9FC9`。

---

## 一、现状诊断（带位置）

| 问题 | 位置 | 说明 |
|---|---|---|
| 首页无「今日各模块时长」视图 | `app.js:3544 renderAggSubjectProgress` | 底部进度条是**章节完成度 %**，不是今日时长；用户截图上"学了啥模块"缺失/被误读 |
| 首页时长只显示总数 | `index.html:95 agg-minutes` + `app.js:3486` | 只有「今日专注时长」一个总数，无分模块 |
| 打卡分享卡掉色 | `share.js:43-59 COLORS` | `brand:#4F46E5`（旧紫）、背景 `#F5F3FF`（紫调），与雾蓝 App 不一致 |
| 打卡卡倒计时 pill 旧紫 | `share.js:101-104` | 渐变 `#4F46E5→#7C3AED` |
| 打卡卡分页脚品牌点旧紫 | `share.js:552` | `COLORS.brand` 旧紫 |

> 首页倒计时卡本身已是雾蓝（`styles.css:753` 用 `--grad-hero`），无需改。

---

## 二、设计原则（一句话）

**一张截图 = 一个清晰故事：「今天学了 4h30m，其中 数学 2h / 408 1.5h / 英语 1h，连续打卡 12 天」。** 模块分布用科目色条呈现，是视觉主角；时长做大号 hero 数字；连续打卡作为社交证明。

---

## 三、Phase 1（先做，价值最高）：首页新增「今日学习分布」卡

在首页 `today-aggregate` 内、**三大指标卡（`.today-stats`，`index.html:91`）之后、`今日得分卡（.today-score-card，index.html:120`）之前**，插入一张自包含卡片。它即是用户截图的核心画面。

### 3.1 新增 HTML（`index.html`，插在 `index.html:117` 的 `</div>` 之后、`index.html:119` 注释之前）

```html
<!-- 今日学习分布卡：截图标配，直观显示「学了哪些模块 + 各多久」 -->
<div class="card today-dist" id="today-dist">
  <div class="td-head">
    <h2 class="card-title">📚 今日学习分布</h2>
    <span class="td-total" id="td-total">合计 0m</span>
  </div>
  <div id="td-rows" class="td-rows"></div>
  <div class="td-empty" id="td-empty" hidden>今天还没开始计时，去对应模块点「开始」吧～</div>
</div>
```

### 3.2 新增 CSS（`styles.css`，加在 `.today-score-card` 相关规则附近，例如 `index.html` 引用处上方）

```css
.today-dist { margin: 4px 0 16px; }
.td-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.td-total { font-size: 13px; font-weight: 600; color: var(--muted); font-variant-numeric: tabular-nums; }
.td-rows { display: flex; flex-direction: column; gap: 12px; }
.td-row { display: grid; grid-template-columns: 14px 64px 1fr auto; align-items: center; gap: 10px; }
.td-dot { width: 10px; height: 10px; border-radius: 50%; }
.td-name { font-size: 14px; font-weight: 600; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.td-bar { height: 10px; border-radius: 999px; background: color-mix(in srgb, var(--muted) 16%, transparent); overflow: hidden; }
.td-fill { display: block; height: 100%; border-radius: 999px; }
.td-time { font-size: 14px; font-weight: 700; color: var(--ink); font-variant-numeric: tabular-nums; min-width: 56px; text-align: right; }
.td-empty { font-size: 14px; color: var(--muted); padding: 6px 2px; }
```

### 3.3 新增 JS 渲染（`app.js`，在 `renderTodayAggregate` 内调用，并在文件内新增函数）

在 `app.js:3537`（`renderAggSubjectProgress();`）之后加一行：
```js
renderTodayDistribution();
```

新增函数（放在 `renderAggSubjectProgress` 之后）：
```js
function renderTodayDistribution() {
  if (!refs.tdRows) return;
  var day = Store.getDay(Store.todayStr()) || { durations: {} };
  var subs = Store.getSubjects();
  var rows = subs.map(function (s) {
    var min = (day.durations && day.durations[s.key]) || 0;
    return { key: s.key, name: s.name, min: min, color: subjectColorClass(s.key, s.name) };
  }).filter(function (x) { return x.min > 0; })
    .sort(function (a, b) { return b.min - a.min; });
  var total = rows.reduce(function (s, x) { return s + x.min; }, 0);
  if (refs.tdTotal) refs.tdTotal.textContent = '合计 ' + fmtMinShort(total);
  if (!rows.length) {
    if (refs.tdRows) refs.tdRows.innerHTML = '';
    if (refs.tdEmpty) refs.tdEmpty.hidden = false;
    return;
  }
  if (refs.tdEmpty) refs.tdEmpty.hidden = true;
  var max = rows[0].min;
  var html = rows.map(function (r) {
    var w = max ? Math.round(r.min / max * 100) : 0;
    return '<div class="td-row">' +
      '<span class="td-dot" style="background:' + r.color + '"></span>' +
      '<span class="td-name">' + escapeHtml(r.name) + '</span>' +
      '<span class="td-bar"><span class="td-fill" style="width:' + Math.max(6, w) + '%;background:' + r.color + '"></span></span>' +
      '<span class="td-time">' + fmtMinShort(r.min) + '</span>' +
    '</div>';
  }).join('');
  refs.tdRows.innerHTML = html;
}
// 复用首页已有的科目色映射逻辑（与 renderAggSubjectProgress 一致）
function subjectColorClass(key, name) {
  key = (key || '').toLowerCase(); name = (name || '').toLowerCase();
  if (key === 'politics' || name.indexOf('政治') >= 0) return '#f97316';
  if (key === 'english' || name.indexOf('英语') >= 0) return '#3b82f6';
  if (key === 'math' || name.indexOf('数学') >= 0) return '#8b5cf6';
  if (key === 'cs408' || name.indexOf('408') >= 0) return '#7FA8C4';
  if (key === 'major' || name.indexOf('专业') >= 0) return '#10b981';
  return '#5B9FC9';
}
function fmtMinShort(min) {
  var h = Math.floor(min / 60), m = min % 60;
  return (h > 0 ? h + 'h ' : '') + m + 'm';
}
```

并在 `app.js` 的 refs 绑定处（`app.js:4353` 附近 `refs.aggSubjectProgress = ...`）补：
```js
refs.tdRows = $('td-rows');
refs.tdTotal = $('td-total');
refs.tdEmpty = $('td-empty');
```

> 说明：底部原"科目进度聚合条"（`agg-subject-progress`，章节完成度）保留，但**不是截图主角**；新卡用科目色条表达"今日时长分布"，二者不冲突。建议把原卡标题在小屏下明确为「章节进度」以免混淆（可选，A 自行判断）。

---

## 四、Phase 2（紧接着做，低成本）：`share.js` 打卡卡换肤到雾蓝

只改 `share.js` 的颜色常量，不动布局逻辑。替换表：

| 原值 | 改为 | 位置 |
|---|---|---|
| `brand: '#4F46E5'` | `'#5B9FC9'` | `share.js:49` |
| `brandSoft: '#6366F1'` | `'#3F7FA8'` | `share.js:50` |
| `accent: '#8B5CF6'` | `'#7FA8C4'` | `share.js:54` |
| 背景 `addColorStop(0,'#FBFAF8')` | `'#F4F9FC'` | `share.js:64` |
| 背景 `addColorStop(1,'#F5F3FF')` | `'#EAF4FB'` | `share.js:65` |
| 右上光晕 `rgba(99,102,241,...)`（两处） | `rgba(91,159,201,...)` | `share.js:72,73` |
| 边框 `rgba(79,70,229,0.08)` | `rgba(91,159,201,0.10)` | `share.js:84` |
| 倒计时 pill 渐变 `#4F46E5→#7C3AED` | `#5B9FC9→#3F7FA8` | `share.js:102,103` |
| 底栏分割线 `rgba(79,70,229,0.14)` | `rgba(91,159,201,0.16)` | `share.js:533` |

语义色（streak 金 `#D97706`、计划绿 `#059669`、危险红 `#DC2626`）**保留不动**——它们是状态色，不是品牌色。

> 一致性检查：打卡卡「各科学习时长」条用的 `s.color` 来自 `Store.getSubjects()`（`buildShareCanvas` `app.js:596`）。确认科目存储色与上面科目色一致；若不一致，A 在 `subjectColorClass` 逻辑基础上统一取色即可。

---

## 五、可选 Phase 3（进阶）：「生成打卡图」预览弹层

在总结页「📤 分享今日卡片」点击后，先打开一个全屏预览弹层展示 `share.js` 生成的图（带"保存/分享"按钮），让用户无需手动截图即得干净成图。需新增一个 `.share-preview` 弹层 + 少量 JS。优先级低于 P1/P2，建议 P1/P2 上线后再做。

---

## 六、验收标准

- **Phase 1**：首页「今日学习分布」卡显示今天有计时的科目，每行「色点+科目名+色条+时长」，按时长降序；合计正确；无计时时显示空态文案。首页截图一眼能读出"学了哪些模块各多久"。
- **Phase 2**：`share.js` 生成的打卡图主色为雾蓝，与 App 一致；金/绿状态色保留；二维码与品牌信息正常。
- 桌面端布局不受影响（新卡在移动端/桌面均正常）。

## 七、版本升版

- Phase 1 → 建议 `v20260818e`
- Phase 2 → 建议 `v20260818f`
- 按纪律同步 `app.js` 顶部 `APP_VERSION` 与 `index.html` 中 `app.js?v=YYYYMMDDx`（9 处）；部署前 grep 确认无 `wrangler.toml`。
