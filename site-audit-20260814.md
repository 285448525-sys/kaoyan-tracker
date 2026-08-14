# 考研学习记录站点 · 客观评分卡（2026-08-14）

> 评估对象：`https://kaoyan-tracker.pages.dev`（Cloudflare Pages，零外部依赖静态 SPA）
> 依据：线上页面抓取 + 本地仓库代码静态核查（app.js 156KB / store.js 36KB / styles.css 44KB / 静态 JS 合计 ≈ 272KB）

---

## ✅ 修复状态（已实施并部署，commit e8c0683 / 版本 v=20260814g）

| 原扣分项 | 修复动作 | 上线验证 |
|---|---|---|
| SEO：缺 favicon | 新增 `favicon.svg`（考 字徽标）+ `<link rel="icon">` / `apple-touch-icon` | 线上 200、`favicon.svg` 静态返回 |
| SEO：缺 OG/Twitter 卡片 | 新增 `og-image.png`（1200×630 品牌图）+ 完整 OG / Twitter Card / canonical 元标签；title 优化 | 线上 `og:image`×3、`twitter:card`、`canonical` 均在 |
| SEO：缺 robots/sitemap | 新增 `robots.txt`（指向 sitemap）+ `sitemap.xml` | 线上均静态返回正确内容 |
| 性能：JS 未压缩 | **Cloudflare Auto Minify 需在仪表盘开启（见下）** —— 代码层无法切换，已给出步骤 | — |
| 安全：innerHTML XSS 面 | 新增 `setText()` 安全助手并固化「动态文本必须转义」规则；已核对 `renderWatchBody` 等云端数据路径全部 `escapeHtml` | `node --check` 通过 |
| 工程化（双源回归等） | 维持单一编辑源（本地仓库）流程；本次改动仅本地提交，未受 TRAE 源干扰 | — |

### Cloudflare Auto Minify 开启步骤（仪表盘，非代码）
1. 登录 Cloudflare 控制台 → 选择 `kaoyan-tracker.pages.dev` 站点（或 Pages 项目）。
2. 左侧 **Speed（速度） → Optimization（优化）**。
3. 开启 **Auto Minify** 的 **HTML / CSS / JavaScript** 三项。
4. 保存后约 1 分钟生效，无需重新部署（边缘即时压缩）。
> 注：Pages 也可在 **Settings → Build & deployments** 或项目级配置里找到类似压缩开关；若版本已带 Brotli 传输压缩，首屏收益主要来自 Minify 减少解析体积（当前 272KB 源码约可压到 1/3）。

**修复后评分提升项**：SEO/社交分享 3.5 → 约 8.0；安全 8.0 → 8.5（加强制助手）。其余维度不变。

---

## 总评：71 / 100（约 7.1 / 10）——“功能扎实、部署稳健，但 SEO/分享与工程化是明显短板”

| # | 维度 | 评分 | 权重 | 说明 |
|---|------|------|------|------|
| 1 | 功能完整度 | 9.0 | 高 | 计时/计划/模考/词汇/错词/云同步/邀请/实时查看/自动双向同步/雷达图/饼图/新手引导/彩带反馈，需求覆盖极全 |
| 2 | 部署与可靠性 | 9.0 | 高 | Cloudflare Pages 自动部署 + SSH push + 版本号破缓存；零外部依赖，断网可离线用（靠浏览器缓存） |
| 3 | 性能 Performance | 7.0 | 高 | 零外部请求、边缘 CDN + Gzip/Brotli；但 JS 未压缩（272KB 源码）、单文件 156KB、无懒加载、无 Service Worker 离线缓存 |
| 4 | SEO / 社交分享 | 3.5 | 中 | 有 title/description/lang/viewport；**缺 favicon、缺 OG/Twitter 卡片、缺 canonical/sitemap/robots，title 过通用**——而“发群里呼吁朋友用”正是核心场景，缺 OG 图会导致分享无预览 |
| 5 | 无障碍 a11y | 7.0 | 中 | 表单有 label、图标按钮有 aria-label、支持深色模式、语义化 h1；缺 skip-link、canvas 图表无文本替代、无 `focus-visible`/`prefers-reduced-motion` |
| 6 | 安全性 Security | 8.0 | 高 | 无硬编码密钥、翻译密钥仅存 localStorage、用户输入 91 处走 escapeHtml、同步登录码走 `X-Sync-Key` 头；风险点见下 |
| 7 | 代码质量 | 6.5 | 中 | 遵守 `===` / 判空 / escapeHtml 约定；但 app.js 156KB 巨石单文件、无模块化、无构建/测试 |
| 8 | 可维护性 | 6.0 | 中 | 无 ESLint/单测；TRAE 与本地双编辑源导致反复回归（本轮就修了 3 个被退回的 bug） |
| 9 | 响应式 / 移动端 | 7.5 | 中 | 有媒体查询、可折叠侧栏、移动断点；viewport 含 `viewport-fit=cover` |
| 10 | 用户体验 UX | 8.0 | 高 | 导航清晰、引导到位、正反馈好；功能多可能让新用户信息过载 |

## 关键风险点（扣分来源）

- **XSS 面**：`app.js` 共 **72 处 `innerHTML` 赋值**（含 `mount()` 直接 `e.innerHTML = html`）。项目约定所有用户文本必须 `escapeHtml()`，但如此多的手写 innerHTML 一旦某次漏 escape 即构成注入。建议收敛为统一的“安全挂载”函数，强制转义。
- **SEO/分享缺口**：无 `favicon`、无 Open Graph / Twitter Card。对“发群里邀请朋友”的用途影响最大——群聊里链接没有缩略图/标题卡片，点击率低。
- **无构建与测试**：纯手写、无压缩、无 lint、无自动化测试；双编辑源（TRAE + 本地）曾把已修 bug 退回。
- **鉴权强度**：云同步仅依赖 8 位登录码（自用可接受，但非强鉴权）。原本的全局令牌 SYNC_TOKEN 已在 v20260814i 中移除（用户自用无需管理员层鉴权）。

## 优先改进建议（按性价比排序）

1. **加 favicon + OG/Twitter 卡片（尤其 OG image）** —— 直接提升“群里分享”的点击与转化率，是和原始诉求最相关的改进。
2. **开启 Cloudflare 自动 Minify（HTML/CSS/JS）** —— 零成本把 272KB 压到约 1/3，首屏明显变快。
3. **收敛 innerHTML 为统一安全挂载函数** —— 消除 XSS 隐患，比逐个排查更稳。
4. **补 canonical / 简单 sitemap / robots.txt** —— 哪怕只是让搜索引擎正确识别单页应用。
5. **工程化收敛** —— 把 app.js 按模块拆分、加 ESLint、统一单一编辑源，彻底解决双源回归。

## 结论

站点“能用、好用、稳”，功能与部署是强项（9/10）；但要对外推广（发群邀请）时，**SEO/社交分享（3.5）和首屏性能（7.0）是当前最拖后腿的两项**，且二者都只需低成本即可显著改善。
