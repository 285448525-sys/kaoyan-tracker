# 移动端（安卓优先）体验优化路线图 · B 窗口交付（逐条转发 A 部署）

> 适用：`C:\Users\Camille\WorkBuddy\考研网站\`
> 原则：每条独立可部署、互不阻塞；按 P0→P1→P2 顺序做。
> 每完成一条，A 照例升版（当前线上 `SW_VERSION='20260817o'`，本批建议从 `v20260818b` 顺延）。
> 基线已具备（不用动）：`viewport-fit=cover`、无 `100vh`（用 `100dvh`）、`touch-action:manipulation`、`-webkit-tap-highlight-color:transparent`、相机 `capture="environment"`。

---

## P0-1 表单字号 16px，修安卓聚焦自动缩放
**问题**：`styles.css:163` `input, select, textarea { font-size: 14px; }`。安卓 Chrome 规则：聚焦时若输入框计算字号 < 16px，会强制放大整页再缩回，每次点输入框都"跳一下"。
**改动**：
- 桌面保持 14px 不变，仅移动端升 16px。在 `@media (max-width: 860px)`（或新增一个）内加：
  ```css
  @media (max-width: 860px) {
    input, select, textarea, .target-input, .name-input, .variant-select, .plan-add input { font-size: 16px; }
  }
  ```
  （`.target-input`/`.name-input`/`.variant-select`/`.plan-add input` 在别处被设成 13px，需一并覆盖，否则这些小输入框仍会缩放。）
- 不删 `styles.css:163` 的 14px（桌面用）。
**工作量**：极低（约 4 行）　**影响**：高（所有文本输入）

---

## P0-2 底部栏 / FAB 避让安卓手势导航条
**问题**：多数安卓（手势导航）设备 `env(safe-area-inset-bottom)` 返回 0，底部 Tab Bar 与 FAB 会压在系统手势条下，标签/按钮点不到。
**改动**：
- `styles.css:1563` `.bottom-tabbar { padding-bottom: env(safe-area-inset-bottom); }` →
  `padding-bottom: max(env(safe-area-inset-bottom), 12px);`
- `styles.css:1315` FAB `bottom: calc(64px + env(safe-area-inset-bottom))` →
  `bottom: calc(64px + max(env(safe-area-inset-bottom), 12px));`
- `styles.css:1574`（横屏）`padding: 2px 0 env(safe-area-inset-bottom)` → `padding: 2px 0 max(env(safe-area-inset-bottom), 12px);`
**工作量**：极低（3 处）　**影响**：高（底部可达性）

---

## P1-1 theme-color 主题色（安卓地址栏配色）
**问题**：无 `theme-color` meta，安卓 Chrome 地址栏用默认色，不像原生 App。
**改动**：`index.html` `<head>` 内（viewport 之后）加：
```html
<meta name="theme-color" content="#5B9FC9" />
```
（取当前 `--primary` 亮雾蓝值；如需深色模式同步，可在 `<head>` 加：
```html
<meta name="theme-color" content="#0f172a" media="(prefers-color-scheme: dark)" />
```
）
**工作量**：极低（1 行）　**影响**：中（原生感）

---

## P1-2 overscroll-behavior 防回弹/链滚
**问题**：安卓下拉易触发浏览器"下拉刷新"回弹，内层滚动（如侧栏、长列表）会带崩外层。
**改动**：在 `html, body` 或 `.app-main` 加：
```css
body { overscroll-behavior-y: none; }
.side-nav, .app-main { overscroll-behavior: contain; }
```
（`overscroll-behavior-y: none` 关掉整页下拉刷新回弹；`contain` 防止内层滚动外溢。）
**工作量**：极低　**影响**：中（滚动跟手）

---

## P1-3 表单外观归一（安卓原生控件美化）
**问题**：安卓 `select`/`input` 带原生 2.5D 凸起与系统箭头，点击区偏小，和 App 扁平风格不统一。
**改动**：在 `styles.css:158` 的 `input, select, textarea` 块加：
```css
-webkit-appearance: none; appearance: none;
```
并为 `select` 加自定义箭头（避免 `appearance:none` 后无箭头）：
```css
select { background-image: url("data:image/svg+xml,...chevron..."); background-repeat: no-repeat; background-position: right 12px center; padding-right: 36px; }
```
（箭头用内联 SVG，颜色取 `--muted`。）
**工作量**：低-中　**影响**：中-高（视觉统一 + 点击区）

---

## P2-1 图片长按菜单抑制
**问题**：长按时安卓弹"保存图片"系统菜单（如拍题预览图）。
**改动**：全局加
```css
img { -webkit-touch-callout: none; user-select: none; }
```
**工作量**：极低　**影响**：低

---

## P2-2 去掉 ≤380px 的 9px 字号（依赖"底栏 5 标签"先落地）
**问题**：`styles.css:1335-1337` 在 ≤380px 把底栏字号压到 9px。等底栏从 8→5 标签后空间充足，无需再压字。
**改动**：上轮 `design/bottom-nav-optimize.md` 部署后，删除/放宽该 9px 规则（改回 11px 或随 5 标签自然舒展）。
**工作量**：极低（依赖 P 批底部导航先上）　**影响**：低-中

---

## P2-3 小控件触控区放大
**问题**：部分勾选框 `.plan-check`(22px)、删除按钮 `.plan-del` 等偏小，安卓 48dp 推荐未达标。
**改动**：把可点击小控件的 `min-width/min-height` 提到 ≥44px（勾选框可保持 22px 视觉但外扩点击热区 `padding`）。逐处排查 `.plan-check`/`.plan-del`/`.mini-btn` 等。
**工作量**：中（多处）　**影响**：中

---

## P2-4 PWA standalone 安卓体验
**问题**：`manifest.webmanifest` 已存在，但未充分配合安卓"添加到主屏幕"：缺 `theme_color`/`background_color` 同步、缺引导提示。
**改动**：
- `manifest.webmanifest` 确认 `display: "standalone"`、`orientation: "portrait"`、`theme_color`、`background_color` 与主色一致。
- 可选：首页加一次性的"添加到主屏幕"轻提示（仅未安装且支持 `beforeinstallprompt` 时）。
**工作量**：中　**影响**：中-高（像原生 App）

---

## 验收总原则（每条部署后）
- ≤860px 真机/模拟（重点安卓 Chrome）：输入框聚焦**不再整页缩放**（P0-1）；底部栏与 FAB 在手势导航下**点得到**（P0-2）。
- 地址栏配色生效（P1-1）；下拉不触发浏览器刷新回弹（P1-2）。
- 控制台无 CSS 报错；相关 dev 测试（如 `test_mobile_core.js`）通过。
- 桌面端布局/字号**不受影响**（P0-1 用媒体查询隔离）。
