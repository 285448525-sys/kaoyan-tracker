# 移动端底部导航优化方案（B 窗口交付 · 转发给 A 实时部署）

> 适用项目：`C:\Users\Camille\WorkBuddy\考研网站\`
> 改造范围：仅移动端（≤860px）底部 Tab Bar，桌面端侧栏**保持不变**
> 版本要求：部署时按纪律升版（当前线上 `SW_VERSION='20260817o'`，本改动建议 `v20260818a`）

---

## 一、问题（Why）

当前移动端底部 Tab Bar 一次性塞了 **8 个**标签：

`🏠首页 / 📐数学 / 💻408 / 📝词汇 / 📌错题 / 📊模考 / 📈数据 / ⚙️设置`

- 行业上限是 **5 个**（iOS HIG / Material Design 底部导航均建议 ≤5）。现在超了 3 个，正是"乱"的根源。
- 极窄屏（≤380px）已被迫把字号压到 9px（`styles.css` 第 1335-1337 行），图标+文字挤成一团，辨识度低。
- 其中 **模考 / 数据 / 设置** 使用频率明显低于前 5 个（模考是考后才用、数据是阶段性复盘、设置极低频仅配置），不值得长期占用拇指黄金区。

**结论：底部只放"每天都会点"的 5 个；其余 3 个收进已有的侧栏抽屉（☰ 汉堡菜单），不新增任何 UI。**

---

## 二、目标结构（What）

### 移动端底部 Tab Bar（5 个，保留）
| 顺序 | 图标 | 文字 | data-tab | 理由 |
|----|----|----|----|----|
| 1 | 🏠 | 首页 | home | 每日看板/计划，入口 |
| 2 | 📐 | 数学 | math | 主科，每日刷题 |
| 3 | 💻 | 408 | cs408 | 主科，每日刷题 |
| 4 | 📝 | 词汇 | vocab | 每日背词+复习 |
| 5 | 📌 | 错题 | mistakes | 含拍题记录，高频 |

### 移出底部 → 留在侧栏抽屉（经 ☰ 可达，不动）
`📊模考(mock) / 📈数据(data) / ⚙️设置(settings)`

> 侧栏抽屉在移动端本来就存在：`.nav-toggle`（☰，左上角，主色 42px）已 `display:flex`（`styles.css` 第 497 行），点开即见完整 8 项。所以"移出底部"≠"删功能"，只是换入口层级。

### 不改动
- 桌面端 `.side-menu` 维持 8 项不变（桌面有空间，无需动）。
- **FAB（📷 拍题）保持现状**——它已经在 `app.js:4259` 被改成"拍题入口"，是拍照搜题的主入口，本方案不碰它。

---

## 三、Non-goals（本次不做）
- 不新增"更多(⋯)"底部弹层（会多一套 UI + JS）。现有 ☰ 抽屉已覆盖，优先选零新增风险的方案。
- 不合并/重命名任何标签，不改动数据层、不改动 `switchTab` 映射。
- 不动桌面布局。

---

## 四、A 落地步骤（直接照做）

### 1. 改 `index.html` 底部 Tab Bar
文件：`index.html` 第 1055-1064 行 `<nav class="bottom-tabbar" id="bottomTabbar">` 内。
**删除** 模考 / 数据 / 设置 三个 `.btb-btn`，只留 5 个：

```html
<nav class="bottom-tabbar" id="bottomTabbar" aria-label="底部导航">
  <button class="btb-btn active" data-tab="home"><span>🏠</span><span>首页</span></button>
  <button class="btb-btn" data-tab="math"><span>📐</span><span>数学</span></button>
  <button class="btb-btn" data-tab="cs408"><span>💻</span><span>408</span></button>
  <button class="btb-btn" data-tab="vocab"><span>📝</span><span>词汇</span></button>
  <button class="btb-btn" data-tab="mistakes"><span>📌</span><span>错题</span></button>
</nav>
```

> 侧栏 `.side-menu`（第 37-46 行）**原样保留 8 项**，不用动。

### 2. JS：无需改动
- 底部按钮点击逻辑：`app.js:4250` 的 `btbBtns` 循环按 `data-tab` 找对应 `.tab-btn`（在侧栏里）并 click，删除底部项不影响。
- 高亮同步：`app.js:4273` 循环只 toggle 存在于底部的按钮；当经过 ☰ 进入"模考/数据/设置"时底部无对应项，表现为"底部无高亮"，符合预期，无需特殊处理。
- FAB：`app.js:4259` 保持拍题逻辑不动。

### 3. CSS：无需改动
- `.bottom-tabbar` 已是 `justify-content:space-around` + `.btb-btn{flex:1 1 0}`，5 项自动均分；触控高度 48px（`styles.css:1564`）已达标。

### 4. 测试文件必须同步（否则 dev 校验报错）
- `test_nav_8tab.js` 第 51-53 行：`btb.length === 8` 断言 → 改为 `=== 5`，并相应更新 `REQUIRED` 集合（去掉 mock/data/settings）。
- `test_nav_restructure.js` 第 72-74 行：`btb.length === 8` 断言 → 改为 `=== 5`。

### 5. 升版
- `app.js` 顶部 `APP_VERSION` 与 `index.html` 内 `app.js?v=YYYYMMDDx`、`SW_VERSION` 按纪律统一升到 `v20260818a`（或 A 顺延的下一版本号）。

---

## 五、验收标准（Acceptance）
1. ≤860px 真机/模拟：底部栏**恰好 5 个**标签，文字不挤、图标清晰。
2. 点 5 个中任意 → 正确跳转，高亮同步正常。
3. 📊模考 / 📈数据 / ⚙️设置 经左上角 ☰ → 抽屉 → 点选，仍可正常进入。
4. FAB（📷 拍题）功能不变。
5. 桌面端侧栏仍为 8 项，布局无变化。
6. 控制台无报错；`test_nav_8tab.js` / `test_nav_restructure.js` 已改为 5 且通过。

---

## 附：备选方案（若认为 ☰ 不够直观，可改 B 方案）
把"模考/数据/设置"不丢进 ☰，而在底部第 6 格放一个 **「更多 ⋯」** 按钮，点击弹出底部动作表（sheet）列出这三项。
- 优点：比 ☰ 更显眼。
- 代价：需新增 sheet UI + 一段 JS + 一个底部按钮（6 格略超 5 上限，但第 6 格是"溢出"语义，可接受）。
- 默认推荐**主方案（收进 ☰，零新增）**；若要 B，回复本文件"改用更多方案"即可，A 再补 sheet。
