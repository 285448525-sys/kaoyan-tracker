# P2 移动端安卓修复（B 窗口交付 · 转发 A 实时部署 · 末批）

> 包含四条 P2：P2-1 图片长按菜单抑制、P2-2 去掉 ≤380px 的 9px 字号、P2-3 小控件触控区放大、P2-4 PWA standalone 配色修正。
> 改 `styles.css` + `manifest.webmanifest`。**无 JS 改动**。部署时升版到 `v20260818d`。

---

## P2-1 图片长按菜单抑制

**问题**：安卓长按图片（如拍题预览图 `ai-preview`）会弹系统"保存图片"菜单，打断操作。

**改动**：在 `styles.css` 第 172 行（`textarea { resize: vertical; }`）之后插入：

```css
/* 安卓适配 P2-1：抑制图片长按弹出"保存图片"系统菜单 */
img { -webkit-touch-callout: none; user-select: none; }
```

---

## P2-2 去掉 ≤380px 的 9px 字号

**背景**：底栏已从 8→5 标签（v20260818a 已部署），空间充足，极窄屏不再需要把字号压到 9px（此前是为 8 标签防换行）。

**改动**：`styles.css` 第 1333-1338 行块内，把两处 `9px` 改为 `11px`：

- 旧：`  .bottom-tabbar .btb-btn { font-size: 9px; padding: 4px 0; }`
  新：`  .bottom-tabbar .btb-btn { font-size: 11px; padding: 4px 0; }`
- 旧：`  .bottom-tabbar .btb-btn span:last-child { font-size: 9px; }`
  新：`  .bottom-tabbar .btb-btn span:last-child { font-size: 11px; }`

> 图标行 `span:first-child { font-size: 17px; }` 保持不变。

---

## P2-3 小控件触控区放大

**背景**：基础 `button` 规则（`styles.css:188`）已给所有按钮 `min-height: 44px`，所以 `.plan-del`/`.mini-btn` 等按钮达标。唯一明显偏小的是错题勾选框 **`.plan-check`**（22px 的 `<div>`，非按钮）。

**改动**：在 `styles.css` 第 250 行 `.plan-check { ... }` 块改为：

```css
.plan-check {
  width: 24px; height: 24px; border-radius: 6px; border: 2px solid var(--primary);
  cursor: pointer; display: grid; place-items: center; flex: none; color: #fff;
  font-size: 13px; position: relative;
}
.plan-check::before { content: ""; position: absolute; inset: -10px; }
```

> `::before` 把可点热区向外扩 ~10px（视觉不变，热区约 44px），修掉安卓点不准的问题。

---

## P2-4 PWA standalone 配色修正（安卓启动屏）

**问题**：`manifest.webmanifest` 第 9 行 `theme_color` 是旧值 `#4f46e5`（紫），与 App 实际主色 `#5B9FC9` 不一致；装到安卓后启动屏/任务切换卡偏色。且缺 `orientation`、`id`。

**改动**：替换 `manifest.webmanifest` 为：

```json
{
  "name": "考研学习记录",
  "short_name": "考研打卡",
  "description": "计时、计划、模考、词汇、错题本，支持离线刷题与计时、联网自动同步。",
  "id": "kaoyan-tracker",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#F4F9FC",
  "theme_color": "#5B9FC9",
  "icons": [
    { "src": "./favicon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any" }
  ]
}
```

> `theme_color`/`background_color` 与 App 主色及浅色背景对齐；`orientation: portrait` 锁竖屏；`id` 稳定便于 PWA 更新。
> 可选增强（非必须）：补 `192`/`512` PNG 图标提升安卓"添加到主屏幕"安装成功率（当前仅 SVG `any`，现代 Chrome 可用，但 PNG 更稳）。

---

## 部署步骤（A）
1. 应用 P2-1（styles.css 插 1 行）、P2-2（styles.css 两处 9px→11px）、P2-3（styles.css `.plan-check` 块 + `::before`）、P2-4（替换 manifest.webmanifest）。
2. 升版：`app.js` 顶部 `APP_VERSION` + `index.html` 内 9 处 `app.js?v=...` + `SW_VERSION` 统一改为 `v20260818d`。
   - ⚠️ manifest 改动若走 Cloudflare Pages + Service Worker 缓存，需确认 `sw.js` 不长期缓存 manifest（或靠版本号/部署刷新）；若 PWA 已安装，旧用户需重新"添加到主屏幕"才会更新启动屏色。
3. 无 JS / 测试改动。

## 验收（Acceptance）
- 安卓长按拍题预览图**不再弹"保存图片"菜单**（P2-1）。
- ≤380px 真机底栏文字清晰可读（11px，非 9px 拥挤）（P2-2）。
- 错题勾选框在安卓上**点得准**（热区约 44px）（P2-3）。
- 安卓"添加到主屏幕"后启动屏/任务卡为雾蓝色 `#5B9FC9`，与 App 一致（P2-4）。
- 桌面端外观不变；控制台无报错。
