#!/usr/bin/env node
/**
 * minify.js — 考研网站发布前本地压缩
 *
 * 用法：node minify.js
 * 将 index.html / *.js / styles.css 压缩后输出到 _cf_deploy/ 目录。
 * 压缩后 git add _cf_deploy/ && git push 即可部署压缩版本。
 *
 * 依赖（已在 node_modules）：
 *   terser          (JS 压缩)
 *   html-minifier-terser  (HTML 压缩, 异步 API)
 *   clean-css       (CSS 压缩)
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUT = path.join(ROOT, '_cf_deploy');

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

function size(bytes) {
  return (bytes / 1024).toFixed(1) + ' KB';
}

let totalBefore = 0;
let totalAfter = 0;

async function main() {
  console.log('=== 考研网站 Minify ===\n');

  // ---- 1. HTML (html-minifier-terser v7 是异步 API) ----
  const htmlIn = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  totalBefore += Buffer.byteLength(htmlIn, 'utf8');
  try {
    const htmlMinifier = require('html-minifier-terser');
    const htmlOut = await htmlMinifier.minify(htmlIn, {
      collapseWhitespace: true,
      removeComments: true,
      removeRedundantAttributes: true,
      removeEmptyAttributes: true,
      minifyCSS: true,
      minifyJS: true,
      useShortDoctype: true,
      keepClosingSlash: false,
    });
    fs.writeFileSync(path.join(OUT, 'index.html'), htmlOut, 'utf8');
    totalAfter += Buffer.byteLength(htmlOut, 'utf8');
    const pct = ((1 - Buffer.byteLength(htmlOut, 'utf8') / Buffer.byteLength(htmlIn, 'utf8')) * 100).toFixed(0);
    console.log(`  index.html   ${size(Buffer.byteLength(htmlIn, 'utf8'))} -> ${size(Buffer.byteLength(htmlOut, 'utf8'))}  (${pct}%)`);
  } catch (e) {
    console.log('  index.html   SKIP (error: ' + e.message + ')');
    fs.writeFileSync(path.join(OUT, 'index.html'), htmlIn, 'utf8');
    totalAfter += Buffer.byteLength(htmlIn, 'utf8');
  }

  // ---- 2. JS files (terser v5 异步, 需 await) ----
  const jsFiles = ['app.js', 'store.js', 'charts.js', 'share.js', 'sentences.js', 'words.js', 'md5.js', 'iconset.js'];
  try {
    const terser = require('terser');
    for (const f of jsFiles) {
      const src = path.join(ROOT, f);
      if (!fs.existsSync(src)) { console.log(`  ${f}         NOT FOUND`); continue; }
      const code = fs.readFileSync(src, 'utf8');
      totalBefore += Buffer.byteLength(code, 'utf8');
      const result = await terser.minify(code, {
        compress: { drop_console: false },
        mangle: true,
        output: { comments: /^!/ },
      });
      if (result.error) {
        console.log(`  ${f}         ERROR: ${result.error.message}`);
        fs.writeFileSync(path.join(OUT, f), code, 'utf8');
        totalAfter += Buffer.byteLength(code, 'utf8');
      } else {
        fs.writeFileSync(path.join(OUT, f), result.code, 'utf8');
        totalAfter += Buffer.byteLength(result.code, 'utf8');
        const pct = ((1 - Buffer.byteLength(result.code, 'utf8') / Buffer.byteLength(code, 'utf8')) * 100).toFixed(0);
        console.log(`  ${f}         ${size(Buffer.byteLength(code, 'utf8'))} -> ${size(Buffer.byteLength(result.code, 'utf8'))}  (${pct}%)`);
      }
    }
  } catch (e) {
    console.log('  JS minify FAIL: ' + e.message + ' — 复制原始文件');
    for (const f of jsFiles) {
      const src = path.join(ROOT, f);
      if (fs.existsSync(src)) {
        const code = fs.readFileSync(src, 'utf8');
        fs.writeFileSync(path.join(OUT, f), code, 'utf8');
        totalBefore += Buffer.byteLength(code, 'utf8');
        totalAfter += Buffer.byteLength(code, 'utf8');
      }
    }
  }

  // ---- 3. CSS ----
  const cssFile = 'styles.css';
  const cssSrc = path.join(ROOT, cssFile);
  if (fs.existsSync(cssSrc)) {
    const cssCode = fs.readFileSync(cssSrc, 'utf8');
    totalBefore += Buffer.byteLength(cssCode, 'utf8');
    try {
      const CleanCSS = require('clean-css');
      const result = new CleanCSS({ level: 2 }).minify(cssCode);
      fs.writeFileSync(path.join(OUT, cssFile), result.styles, 'utf8');
      totalAfter += Buffer.byteLength(result.styles, 'utf8');
      const pct = ((1 - Buffer.byteLength(result.styles, 'utf8') / Buffer.byteLength(cssCode, 'utf8')) * 100).toFixed(0);
      console.log(`  ${cssFile}     ${size(Buffer.byteLength(cssCode, 'utf8'))} -> ${size(Buffer.byteLength(result.styles, 'utf8'))}  (${pct}%)`);
    } catch (e) {
      // 无 clean-css 时做简单压缩：去空行/注释
      let cssMin = cssCode
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\s+/g, ' ')
        .replace(/\s*([{}:;,])\s*/g, '$1')
        .trim();
      fs.writeFileSync(path.join(OUT, cssFile), cssMin, 'utf8');
      totalAfter += Buffer.byteLength(cssMin, 'utf8');
      console.log(`  ${cssFile}     ${size(Buffer.byteLength(cssCode, 'utf8'))} -> ${size(Buffer.byteLength(cssMin, 'utf8'))}  (basic)`);
    }
  }

  // ---- 4. 复制静态资源（不压缩）----
  const staticFiles = ['favicon.svg', 'og-image.png', 'robots.txt', 'sitemap.xml', 'qrcode.min.js', '_worker.js', 'sw.js', 'manifest.webmanifest', '_headers'];
  for (const f of staticFiles) {
    const src = path.join(ROOT, f);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(OUT, f));
    }
  }

  // ---- 摘要 ----
  console.log(`\n  总计         ${size(totalBefore)} -> ${size(totalAfter)}  (节省 ${size(totalBefore - totalAfter)}, ${((1 - totalAfter / totalBefore) * 100).toFixed(0)}%)`);
  console.log(`\n输出目录: ${OUT}`);
  console.log('下一步: git add _cf_deploy/ && git commit -m "minify release" && git push');
}

main();
