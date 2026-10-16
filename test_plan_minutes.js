#!/usr/bin/env node
/* P2-4 回归测试：每日计划项的「预计用时」
   覆盖三个真实缺陷场景：
   1) 添加区新增 #plan-daily-minutes 选择器，选中后新计划项 minutes 落库（原来是恒 0）
   2) 未设置用时的计划项渲染「＋ 用时」可点占位，点击进入下拉编辑
   3) 行内下拉改值后立即写回 Store.updateDailyPlanItem，并重渲染反映新值
   同时守住回归：不指定用时仍写 0，不因新控件破坏原有多行添加行为。
*/
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = __dirname;
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
  .replace(/<script[\s\S]*?<\/script>/g, '');

function boot() {
  const vc = new VirtualConsole();
  const errs = [];
  vc.on('jsdomError', e => errs.push(e.message));
  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url: 'https://kaoyan-tracker.pages.dev/',
    pretendToBeVisual: true,
    virtualConsole: vc
  });
  const { window } = dom;
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
  window.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 0);
  window.confirm = () => true;
  window.alert = () => {};
  window.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: () => () => ({}), set: () => true });
  window.fetch = () => Promise.reject(new Error('disabled'));
  const order = ['qrcode.min.js', 'words.js', 'store.js', 'charts.js', 'share.js', 'sentences.js', 'app.js'];
  for (const f of order) window.eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  if (typeof window.__switchTab !== 'function') window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  return { window, errs };
}

let pass = 0, fail = 0;
function ok(c, n) { if (c) { pass++; console.log('✅ ' + n); } else { fail++; console.log('❌ ' + n); } }

const s = boot();
const win = s.window;
const doc = win.document;
const Store = win.Store;
const today = Store.todayStr();

// —— 1. 添加区选择器存在，且选项覆盖常用时长 ——
const minsSel = doc.getElementById('plan-daily-minutes');
ok(!!minsSel, '添加区存在 #plan-daily-minutes 预计用时选择器');
if (minsSel) {
  const vals = Array.from(minsSel.options).map(o => o.value);
  ok(vals.includes('') && vals.includes('60'), '选择器含「不计时」与 60 分钟档');
}

// —— 2. 选中 60 分钟添加计划 → minutes 落库（原缺陷：恒为 0） ——
if (minsSel) minsSel.value = '60';
doc.getElementById('plan-daily-text').value = '背单词 100 个';
doc.getElementById('btn-plan-daily-add').click();

let plan = Store.getPlan(today) || [];
ok(plan.length === 1, '添加 1 条计划后 Store.getPlan 有 1 项');
ok(plan[0] && plan[0].minutes === 60, '新计划项 minutes 落库为 60（原缺陷恒 0），实际=' + (plan[0] && plan[0].minutes));
ok(!!minsSel && minsSel.value === '', '添加后用时选择器复位为「不计时」，防连续添加串味');

// —— 3. 不选用时添加 → minutes 仍为 0（回归保护） ——
doc.getElementById('plan-daily-text').value = '整理错题';
doc.getElementById('btn-plan-daily-add').click();
plan = Store.getPlan(today) || [];
const noMin = plan.filter(p => p.text === '整理错题')[0];
ok(plan.length === 2, '再添加 1 条后共 2 项');
ok(noMin && noMin.minutes === 0, '不选用时时长时 minutes 保持 0');

// —— 4. 渲染：未设置用时显示可点占位，已设置显示分钟数 ——
const listEl = doc.getElementById('plan-daily-list');
ok(!!listEl, '存在 #plan-daily-list 容器');
if (listEl) {
  const mins = Array.from(listEl.querySelectorAll('.plan-min'));
  ok(mins.length === 2, '渲染出 2 个用时标签，实际=' + mins.length);
  const empty = mins.filter(m => m.classList.contains('plan-min-empty'));
  ok(empty.length === 1, '未设置用时的项带 .plan-min-empty 占位类，实际=' + empty.length);
  ok(empty[0] && /用时/.test(empty[0].textContent), '空态占位文案提示可设置用时，实际="' + (empty[0] && empty[0].textContent) + '"');
  const filled = mins.filter(m => /60\s*分钟/.test(m.textContent));
  ok(filled.length === 1, '已设置用时的项显示「60 分钟」');
  // 已设置用时的项也可点开编辑，且下拉默认选中当前值
  if (filled[0]) {
    filled[0].click();
    const selF = filled[0].querySelector('.plan-min-sel');
    ok(!!selF, '已设置用时的标签同样可点开编辑');
    ok(!!selF && selF.value === '60', '下拉默认选中当前值 60，实际=' + (selF && selF.value));
    if (selF) {
      selF.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      // Esc 取消后重渲染，回到只读标签
      const back = Array.from(listEl.querySelectorAll('.plan-min')).filter(m => /60\s*分钟/.test(m.textContent));
      ok(back.length === 1, 'Esc 取消后回到只读标签，未误改数据');
      ok((Store.getPlan(today) || []).filter(p => p.text === '背单词 100 个')[0].minutes === 60, 'Esc 取消不改动 Store 中的 minutes');
    }
  } else {
    ok(false, '未找到显示「60 分钟」的标签');
  }
}

// —— 5. 点击未设置用时的标签 → 出现行内下拉，改值即落库 ——
if (listEl) {
  const mins2 = Array.from(listEl.querySelectorAll('.plan-min'));
  const target = mins2.filter(m => m.classList.contains('plan-min-empty'))[0];
  if (target) {
    target.click();
    const sel = listEl.querySelector('.plan-min-sel');
    ok(!!sel, '点击后行内出现 .plan-min-sel 下拉');
    if (sel) {
      sel.value = '90';
      sel.dispatchEvent(new win.Event('change'));
      plan = Store.getPlan(today) || [];
      const edited = plan.filter(p => p.text === '整理错题')[0];
      ok(edited && edited.minutes === 90, '行内改值后 minutes 落库为 90，实际=' + (edited && edited.minutes));
    }
  } else {
    ok(false, '未找到未设置用时的标签，无法测试行内编辑');
  }
}

ok(s.errs.length === 0, '无 jsdomError (' + s.errs.join('|') + ')');

console.log('P2-4 计划项预计用时: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
