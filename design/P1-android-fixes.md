# P1 移动端安卓修复（B 窗口交付 · 转发 A 实时部署）

> 包含三条 P1：P1-1 theme-color 地址栏配色、P1-2 overscroll 防回弹、P1-3 表单外观归一。
> 改 `index.html`（1 处）+ `styles.css`（2 处块）。**无 JS 改动**。部署时升版到 `v20260818c`。

---

## P1-1 theme-color 安卓地址栏配色

**问题**：无 `theme-color` meta，安卓 Chrome 地址栏用默认色，不像原生 App。

**改动**：`index.html` 第 5 行 `<meta name="viewport" ... />` 之后插入：

```html
<meta name="theme-color" content="#5B9FC9" />
<meta name="theme-color" content="#7FB8DB" media="(prefers-color-scheme: dark)" />
```

> 浅色取 `--primary` (#5B9FC9)，深色取深色主题 `--primary` (#7FB8DB)。地址栏会随主题变色。

---

## P1-2 overscroll-behavior 防回弹 / 链滚

**问题**：安卓下拉易触发浏览器"下拉刷新"整页回弹；侧栏/长列表内层滚动会带崩外层。

**改动**：在 `styles.css` 第 1566 行（`.side-nav { max-height: 100dvh; overflow-y: auto; }`）之后插入：

```css
/* 安卓适配 P1-2：禁用整页下拉刷新回弹，内层滚动不外溢外层 */
body { overscroll-behavior-y: none; }
.side-nav, .app-main { overscroll-behavior: contain; }
```

---

## P1-3 表单外观归一（安卓原生控件美化）

**问题**：安卓 `select`/`input` 带原生 2.5D 凸起与系统箭头，点击区偏小，和 App 扁平风格不统一。

**改动 A**：在 `styles.css` 第 158 行 `input, select, textarea {` 块内加两行（与 `font-family: inherit;` 等同级）：

```css
  -webkit-appearance: none;
  appearance: none;
```

**改动 B**：新增 `select` 自定义箭头（避免 `appearance:none` 后无箭头）。在改动 A 那块之后（或任意合适位置）加：

```css
select {
  -webkit-appearance: none; appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' fill='none' stroke='%237A93A3' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  padding-right: 36px;
}
```

> 箭头颜色用浅色 `--muted` (#7A93A3)；深色主题下若想同步，可加 `:root[data-theme="dark"] select { background-image: ... 改 stroke 为浅色 }`，可选。

---

## 部署步骤（A）
1. 应用 P1-1（`index.html` 插 2 行 meta）、P1-2（`styles.css` 插 3 行）、P1-3（改 `input/select/textarea` 块 + 新增 `select` 箭头规则）。
2. 升版：`app.js` 顶部 `APP_VERSION` + `index.html` 内 9 处 `app.js?v=...` + `SW_VERSION` 统一改为 `v20260818c`。
3. 无 JS / 测试改动。

## 验收（Acceptance）
- 安卓 Chrome：地址栏随浅/深色主题变蓝（P1-1）。
- 页面顶部下拉**不再触发浏览器刷新回弹**；侧栏/长列表内层滚动不连带动外层（P1-2）。
- 安卓上 `select` 显示统一扁平箭头、无原生 2.5D 凸起，点击区正常（P1-3）。
- 桌面端外观不变（箭头/overscroll 均无害）；控制台无 CSS 报错。
