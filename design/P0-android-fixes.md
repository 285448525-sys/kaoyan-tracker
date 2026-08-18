# P0 移动端安卓修复（B 窗口交付 · 转发 A 实时部署）

> 包含两条 P0：P0-1 表单字号防缩放、P0-2 底部栏/FAB 避让安卓手势导航条。
> 仅改 `styles.css`，**无 JS 改动、无测试断言需改**。部署时升版到 `v20260818b`。

---

## P0-1 表单字号 14→16px（修安卓聚焦整页缩放）

**改法 A（推荐，桌面不受影响）：在移动端媒体查询里覆盖。**
在 `styles.css` 第 172 行（`textarea { resize: vertical; }`）之后插入：

```css
/* 安卓适配 P0-1：移动端表单字号≥16px，避免聚焦时整页自动缩放 */
@media (max-width: 860px) {
  input, select, textarea, .target-input, .name-input, .variant-select { font-size: 16px; }
}
```

> 说明：基值 `styles.css:163` 的 `font-size: 14px` **不用改**（桌面保持紧凑）。`.target-input`/`.name-input`/`.variant-select` 在别处被设成 13px（styles.css:221、:226），移动端必须一并覆盖成 16px，否则这些小输入框仍会触发缩放。

**改法 B（若不想加媒体查询）：** 直接把 `styles.css:163` 的 `14px` 改成 `16px`（桌面输入框也会变 16px，同样无缩放问题，但桌面略变高）。二选一即可，推荐 A。

---

## P0-2 底部栏 / FAB 避让安卓手势导航条

**问题**：多数安卓（手势导航）设备 `env(safe-area-inset-bottom)` 返回 0，底部 Tab Bar 与 FAB 会压在系统手势条下，点不到。

**改动（3 处精确替换）：**

1. `styles.css:1563`
   旧：`  .bottom-tabbar { padding-bottom: env(safe-area-inset-bottom); }`
   新：`  .bottom-tabbar { padding-bottom: max(env(safe-area-inset-bottom), 12px); }`

2. `styles.css:1315`（FAB）
   旧：`  position: fixed; bottom: calc(64px + env(safe-area-inset-bottom)); right: 16px; z-index: 79;`
   新：`  position: fixed; bottom: calc(64px + max(env(safe-area-inset-bottom), 12px)); right: 16px; z-index: 79;`

3. `styles.css:1574`（横屏）
   旧：`  .bottom-tabbar { padding: 2px 0 env(safe-area-inset-bottom); }`
   新：`  .bottom-tabbar { padding: 2px 0 max(env(safe-area-inset-bottom), 12px); }`

> `max(env(...), 12px)` 含义：有安全区时用安全区，没安全区（多数安卓手势导航）时至少留 12px，把内容顶到手势条之上。

---

## 部署步骤（A）
1. 应用上面 P0-1（推荐改法 A）与 P0-2 三处替换。
2. 升版：`app.js` 顶部 `APP_VERSION` + `index.html` 内 9 处 `app.js?v=...` + `SW_VERSION` 统一改为 `v20260818b`。
3. 无 JS / 测试改动（`test_mobile_core.js` 等不受影响）。

## 验收（Acceptance）
- 安卓 Chrome（≤860px）：点任意文本输入框，**整页不再自动放大/缩小**（P0-1）。
- 开启安卓手势导航：底部 Tab Bar 与右下 FAB 完整可见、可点，不被手势条遮挡（P0-2）。
- 桌面端（>860px）：输入框字号/布局不变（P0-1 用媒体查询隔离），底部栏/FAB 表现不变。
- 控制台无 CSS 报错。
