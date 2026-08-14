# 考研学习记录站点 · 客观评分卡（2026-08-14）

> 评估对象：`https://kaoyan-tracker.pages.dev`（Cloudflare Pages，零外部依赖静态 SPA）
> 依据：线上页面抓取 + 本地仓库代码静态核查（app.js 156KB / store.js 36KB / styles.css 44KB / 静态 JS 合计 ≈ 272KB）

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
- **鉴权强度**：未配置 `SYNC_TOKEN` 时，云同步仅依赖 8 位登录码（自用可接受，但非强鉴权）。

## 优先改进建议（按性价比排序）

1. **加 favicon + OG/Twitter 卡片（尤其 OG image）** —— 直接提升“群里分享”的点击与转化率，是和原始诉求最相关的改进。
2. **开启 Cloudflare 自动 Minify（HTML/CSS/JS）** —— 零成本把 272KB 压到约 1/3，首屏明显变快。
3. **收敛 innerHTML 为统一安全挂载函数** —— 消除 XSS 隐患，比逐个排查更稳。
4. **补 canonical / 简单 sitemap / robots.txt** —— 哪怕只是让搜索引擎正确识别单页应用。
5. **工程化收敛** —— 把 app.js 按模块拆分、加 ESLint、统一单一编辑源，彻底解决双源回归。

## 结论

站点“能用、好用、稳”，功能与部署是强项（9/10）；但要对外推广（发群邀请）时，**SEO/社交分享（3.5）和首屏性能（7.0）是当前最拖后腿的两项**，且二者都只需低成本即可显著改善。
