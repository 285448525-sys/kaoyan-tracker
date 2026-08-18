# 计时体验打磨（② 全局计时常驻指示 + ③ 计时行显示累计）— 设计稿 / B 窗口交付

> 目标：围绕**每日最高频链路（开计时 → 去模块页学 → 回来结束）**补两处明显体感缺口。
> 前置：依赖 Phase 1 已部署的 `fmtMinShort()`（见 `design/checkin-screenshot-redesign.md`）。若 A 尚未部署 Phase 1，需先把该函数补入 `app.js`。
> 主色变量沿用：`--primary:#5B9FC9`。

---

## ② 全局"计时中"常驻指示

计时只在首页那一行实时走字（`startTick` 仅更新首页 `t-time-<key>`，`app.js:411`）。一旦从首页开了计时切去其他 tab，那个页面**完全看不到计时在跑**——容易忘关、也看不到学了多久。加一个固定小药丸，所有 tab 都可见，点「结束」一键停止。

### 2.1 新增 HTML（`index.html`，插在 `index.html:1061` 的 `#offline-bar` 之后）

```html
<!-- 全局计时指示：计时运行时在所有 tab 可见，点「结束」一键停止 -->
<div id="global-timer" class="global-timer" hidden>
  <span class="gt-dot"></span>
  <span class="gt-label" id="gt-label">计时中</span>
  <span class="gt-time" id="gt-time">00:00:00</span>
  <button class="gt-stop" id="gt-stop" type="button" aria-label="结束计时">结束</button>
</div>
```

### 2.2 新增 CSS（`styles.css`，插在 `styles.css:421` 的 `.offline-bar[hidden]` 之后）

```css
.global-timer {
  position: fixed; left: 50%; transform: translateX(-50%);
  bottom: calc(env(safe-area-inset-bottom, 0px) + 78px);
  z-index: 60; display: flex; align-items: center; gap: 8px;
  max-width: calc(100% - 24px);
  padding: 8px 8px 8px 14px;
  background: var(--primary); color: #fff;
  border-radius: 999px;
  box-shadow: 0 10px 28px -8px rgba(36,52,67,.4);
  font-size: 13px; font-weight: 600;
}
.global-timer[hidden] { display: none; }
.gt-dot { width: 8px; height: 8px; border-radius: 50%; background: #fff; animation: gtPulse 1.2s ease-in-out infinite; }
.gt-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 40vw; }
.gt-time { font-variant-numeric: tabular-nums; font-weight: 700; }
.gt-stop { margin-left: 2px; border: none; background: rgba(255,255,255,.22); color: #fff; font-size: 12px; font-weight: 700; padding: 6px 14px; border-radius: 999px; }
.gt-stop:active { background: rgba(255,255,255,.35); }
@keyframes gtPulse { 0%,100% { opacity: 1; } 50% { opacity: .3; } }
@media (prefers-reduced-motion: reduce) { .gt-dot { animation: none; } }
```

> 位置说明：`bottom: 78px` 在底部 tabbar（约 56px + 安全区）之上、FAB（右下）左侧居中，互不遮挡。若极窄屏与 FAB 视觉打架，可把 `bottom` 调到 `88px` 或把药丸整体左移。

### 2.3 新增两个函数（`app.js`，插在 `app.js:435` 的 `renderTimerRows` 函数结束之后）

```js
/* 全局计时常驻指示：计时运行时在所有 tab 可见 */
function showGlobalTimer(key) {
  var bar = document.getElementById('global-timer');
  if (!bar) return;
  var subs = Store.getSubjects();
  var name = key;
  subs.forEach(function (s) { if (s.key === key) name = s.name; });
  var lbl = document.getElementById('gt-label');
  if (lbl) lbl.textContent = (name || '学习') + ' 计时中';
  var gt = document.getElementById('gt-time');
  if (gt) gt.textContent = fmt(currentElapsed());
  bar.hidden = false;
}
function hideGlobalTimer() {
  var bar = document.getElementById('global-timer');
  if (bar) bar.hidden = true;
}
```

### 2.4 接线（4 处）

- **`app.js:398`**（`startTimerFor` 末尾）：`renderTimerRows(); startTick();` → 改为 `renderTimerRows(); startTick(); showGlobalTimer(key);`
- **`app.js:403`**（`endTimer` 内 `stopTick();` 之后）：新增一行 `hideGlobalTimer();`
- **`app.js:408-414`**（`startTick` 的 `setInterval` 回调内 `if (t.running) { ... }`）：在更新 `t-time-<key>` 之后补一行，让全局药丸同步走字：
  ```js
  var gt = document.getElementById('gt-time');
  if (gt) gt.textContent = fmt(currentElapsed());
  ```
- **`app.js:4979-4984`**（`visibilitychange` 回调内）：在刷新首页 `t-time` 之后补同样一行 `gt` 刷新（切回页面时药丸时间也跟上）。
- **`app.js:4195`**（`init` 中 `renderTimerRows();` 之后）：新增 `if (Store.getTimer().running) showGlobalTimer(Store.getTimer().subjectKey);`（防止刷新页面后运行中计时丢失指示）
- **`app.js:4352`**（`refs.timerRows = $('timer-rows');` 之后）：绑定结束按钮：
  ```js
  refs.gtStop = $('gt-stop');
  if (refs.gtStop) refs.gtStop.addEventListener('click', endTimer);
  ```

---

## ③ 计时行停止后显示该科今日累计

`renderTimerRows`（`app.js:427`）在**停止时显示 `00:00:00`**（`fmt(running ? currentElapsed() : 0)`），结束「数学」后那一行归零，看不出这科今天学了多少——得跳去分布卡才看得到。改为停止时显示该科今日累计。

### 3.1 改 `renderTimerRows`（`app.js:418-435`）

- 在 `var subs = Store.getSubjects();`（`app.js:420`）之后新增一行：
  ```js
  var day = Store.getDay(Store.todayStr()) || { durations: {} };
  ```
- 把 `app.js:427`：
  ```js
  var time = el('div', 't-time', fmt(running ? currentElapsed() : 0));
  ```
  改为：
  ```js
  var acc = (day.durations && day.durations[s.key]) || 0;
  var time = el('div', 't-time', running ? fmt(currentElapsed()) : (acc > 0 ? fmtMinShort(acc) : '未计时'));
  ```

> 效果：运行中显示实时 `HH:MM:SS`；停止后显示该科今日累计（如 `1h 30m`），0 时显示「未计时」。复用 Phase 1 的 `fmtMinShort()`。

---

## 四、验收标准

- **②**：首页开任一科目计时 → 底部居中浮出雾蓝药丸「数学 计时中 00:00:0X 结束」，且秒数走动；切到数学/词汇/错题等任意 tab 药丸仍在；点「结束」药丸消失、计时写入今日；刷新页面若计时仍运行药丸自动出现。
- **③**：结束某科计时后，该计时行显示今日累计（如 `1h 30m`）而非 `00:00:00`；运行中仍实时走字。
- 桌面端布局不受影响；药丸不与底部 tabbar / FAB 重叠。

## 五、版本升版

- ②③ 合并 → 建议 `v20260818g`
- 按纪律同步 `app.js` 顶部 `APP_VERSION` 与 `index.html` 中 `app.js?v=YYYYMMDDx`（9 处）；部署前 grep 确认无 `wrangler.toml`。
- 注：①（首页 hero 用 `fmtMinShort`）依赖同一函数，可等 A 完成当前批次后，顺手以 1 行补上（`app.js:3486` + 删 `index.html:95-96` 的 `min` 单位）。
