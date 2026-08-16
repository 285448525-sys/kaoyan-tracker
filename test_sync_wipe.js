/* 复现：开启云同步后，刷新页面时云端若返回「更晚时间戳但内容为空/旧」的数据，
   本地数据是否被 doAutoPullCheck 静默覆盖而丢失。
   利用已暴露的 window.__syncDebug.doAutoPullCheck 钩子 + mock fetch。 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = __dirname;
const KEY = 'kaoyan_tracker_v1';
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace(/<script[\s\S]*?<\/script>/g, '');

const vc = new VirtualConsole(); const errs = []; vc.on('jsdomError', e => errs.push(e.message));
const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://kaoyan-tracker.pages.dev/', pretendToBeVisual: true, virtualConsole: vc });
const { window } = dom; const { document } = window;
window.matchMedia = () => ({ matches: false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
window.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 0);
window.confirm = () => true; window.alert = () => {};
window.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: () => () => ({}), set: () => true });
window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,';
window.HTMLCanvasElement.prototype.toBlob = cb => cb && cb({});

// 先写入本地真实数据
const order = ['qrcode.min.js','words.js','store.js','charts.js','share.js','md5.js','sentences.js','app.js'];
for (const f of order) window.eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
if (typeof window.__switchTab !== 'function') document.dispatchEvent(new window.Event('DOMContentLoaded'));
const Store = window.Store;
const today = Store.todayStr();
Store.addDuration(today, 'math', 172);
Store.addVocab('abandon', '放弃');
Store.setConfig({ examDate: '2026-09-13', nickname: '芝芝' });
const localMath = Store.snapshot().days[today].durations.math;
console.log('[本地] math 时长 =', localMath, '| vocab =', Store.getVocab().length);

// 模拟「开启云同步」：写入同步偏好 + 登录码，并让 doAutoPullCheck 能拿到 code
window.localStorage.setItem(KEY + ':auto_sync', '1');
window.localStorage.setItem(KEY + ':last_sync_code', 'TESTPH01');
window.localStorage.setItem(KEY + ':auto_sync_push_at', String(Date.now() - 60000)); // 上次推送是 60s 前
// 把 code 填进 sync-code 输入框（doAutoPullCheck 读取 refs.syncCode.value）
const syncInput = document.getElementById('sync-code');
if (syncInput) syncInput.value = 'TESTPH01';

// mock fetch：GET /api/sync 返回「时间戳更新但内容为空」的云端数据（模拟另一设备/旧写入）
const future = new Date(Date.now() + 10000).toISOString();
window.fetch = function (url, opts) {
  if (String(url).indexOf('/api/sync') >= 0) {
    const m = (opts && opts.method) || 'GET';
    if (m === 'GET') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: {}, version: 'v_cloud', meta: { updatedAt: future } }) });
    }
    if (m === 'PUT') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, version: 'v_cloud' }) });
    }
  }
  return Promise.reject(new Error('unexpected ' + url));
};

let pass = 0, fail = 0;
function ok(c, n){ if(c){pass++;console.log('✅ '+n);}else{fail++;console.log('❌ '+n);} }

// 触发拉取（直接调钩子，等价于轮询一次）
const before = Store.snapshot();
window.__syncDebug.doAutoPullCheck();
setTimeout(function () {
  const after = Store.snapshot();
  const mathAfter = after.days[today] && after.days[today].durations && after.days[today].durations.math;
  const vocabAfter = after.vocab ? after.vocab.length : 0;
  ok(mathAfter === 172, '拉取空云端后 本地 math 时长(172) 未丢失 (实际 ' + mathAfter + ')');
  ok(vocabAfter === 1, '拉取空云端后 本地 vocab(1) 未丢失 (实际 ' + vocabAfter + ')');
  ok(after.config && after.config.examDate === '2026-09-13', 'config.examDate 未丢失');
  ok(errs.length === 0, '无 jsdomError (' + errs.join('|') + ')');
  console.log('通过 ' + pass + ' / 失败 ' + fail);
  process.exit(fail ? 1 : 0);
}, 300);
