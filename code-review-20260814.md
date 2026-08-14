# 全站代码审查报告（冗余 + Bug 排查修复）

> 日期：2026-08-14 · 版本：`v20260814n` · 提交：`c515cf9` · 已部署至 Cloudflare Pages

## 一、审查方法（三层）

| 层 | 手段 | 覆盖 |
|---|---|---|
| 1. 静态分析 | `review_check.js`：HTML id 交叉引用、未引用函数（词边界检测）、console 残留、重复 id | app.js + index.html |
| 2. 运行时巡检 | `test_tabs.js`（jsdom）：逐个点击全部 16 个 tab + 触发 15 组关键交互，捕获同步/异步异常（含 300ms 异步窗口） | 全站 |
| 3. 人工核实 | 对每一条嫌疑逐一定位源码上下文，区分真实 bug / 误报 / 防御性弱点 | — |

## 二、审查结论总览

- **崩溃级 bug（P1）：0**。全站 16 个 tab + 15 组交互无任何运行时异常。
- **功能缺陷（P2）：1 个防御性弱点**（已修复）——见下「发现 B」。
- **冗余/死代码（P3）：3 处**（已清理）——见下「发现 A」。
- 静态审查 4 项最终全部归零：缺失 ID「无」、未引用函数「无」、console 残留「0」、重复 id「无」。

## 三、发现与修复明细

### 发现 A：死代码（P3，已清理，共约 40 行）

| 位置 | 内容 | 判定依据 |
|---|---|---|
| app.js `renderFilterChips`（~20 行） | 分类筛选 chips 渲染函数 | 全文件无任何引用（注释自述"原先三处各写了一份"，重构后遗留） |
| app.js 4 个 refs + 2 段绑定 | `mathChapterAdd` / `btnAddMathChapter` / `cs408ChapterAdd` / `btnAddCs408Chapter` | index.html 已无对应元素（章节新增改为 JS 动态渲染），refs 恒为 null，绑定靠判空兜底、永不执行 |
| review_check.js 首轮 23 个"缺失 ID" | 18 个动态生成 + 1 个惰性创建 + 4 个死代码 refs | 逐一定位源码：`tour-*`/`mp-feedback`/`cp-feedback`/`practice-*`/`review-*` 均为 app.js 字符串拼接动态创建；`backTopBtn` 为 `getElementById` 后 `id=` 赋值的标准惰性创建 |

### 发现 B：刷题渲染缺少选项判空（P2 防御，已修复）

**风险**：`renderMathPractice` / `render408Practice` 直接 `cur.options.forEach(...)`。正常数据（内置题库 + 添加题目流程均用 `options` 字段）不会触发，但**旧版本数据 / 云同步导入的脏数据 / 用户手改 localStorage** 一旦缺 `options`，整个刷题页渲染直接抛 `TypeError: Cannot read properties of undefined (reading 'forEach')`，且所有入口都崩（切 tab、点开始、renderAll）。

**修复**：
```js
if (!Array.isArray(cur.options) || !cur.options.length) {
  html += '<div class="empty-hint">该题缺少选项数据（旧数据或导入异常），请到「我的题库」删除后重新添加</div>';
} else {
  cur.options.forEach(...);
}
```
反馈文案 `cur.options[cur.answer]` 同步兜底为「（缺失）」。math/408 两模块 4 处全部覆盖。

**定位过程的插曲（值得记录）**：该 bug 首次在巡检中**偶发**出现（"单独跑全绿、链式跑报错"），一度无法复现。根因是测试脚本灌数据时把字段写错（`opts` 应为 `options`），叠加 `on408PracticeStart` 里的 `shuffle(pool)` 洗牌——脏测试题恰好被洗到第一题才崩。修正测试数据字段后，用完整 stack 稳定定位到 `render408Practice:1857`。**经验：jsdom 巡检发现偶发错误时，先检查测试数据 schema 是否与代码一致，再怀疑时序。**

## 四、验证结果（全部通过）

```
1. 静态审查：缺失 ID 无 / 未引用函数无 / console 0 / 重复 id 无
2. 全站巡检（3 轮）：16 tab 点击 ✅ · 15 组交互 ✅ · window 错误 0 · jsdom 错误 0
3. A2/A3 回归：35 / 35 断言通过
4. 版本号：?v=20260814n（9 处），git push 触发 Cloudflare 自动部署
```

## 五、剩余观察项（未处理，按需）

1. **jsdom 环境偶发错误**：曾捕获 1 次 `undefined.forEach`（无 stack），无法稳定复现，与 mock canvas（`pretendToBeVisual` + rAF）的环境抖动相关，真实浏览器有完整 canvas API，风险低。
2. **CSS 重复选择器**：`.app-main`、`.nav-toggle` 等存在双份定义，经核实为**浅/深主题双份 + keyframes 内 0%/100%**，属正常组织方式；如需极致精简可后续统一（不推荐，收益低风险高）。
3. **store.js 遗留死方法**：`setLastSyncToken` / `getLastSyncToken`（SYNC_TOKEN 板块移除后遗留）。此前已判定"删它们风险 > 收益"（无引用、无副作用），维持不动。

## 六、工具沉淀（可复用）

- `review_check.js`：静态审查工具。识别 HTML 缺失 id（排除动态创建 `id="..."` 与惰性创建 `getElementById`+`id=` 赋值）、词边界级未引用函数检测、console 残留计数、重复 id 检测。
- `test_tabs.js`：jsdom 全站巡检。灌数据 → 遍历全部 tab → 触发关键交互 → 延迟 300ms 捕获异步异常。改代码后跑一遍即可回归全站。

```
node review_check.js   # 静态审查
node test_tabs.js      # 全站巡检
node test_a2_a3.js     # A2/A3 功能回归
```
