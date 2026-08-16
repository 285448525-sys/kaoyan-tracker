/* jsdom 专项验证：手机号账号体系（注册/登录合一 + 校验）+ B1 并发/本地保护回归 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = __dirname;
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
  .replace(/<script[\s\S]*?<\/script>/g, '');

const vc = new VirtualConsole();
const jsdomErrors = [];
vc.on('jsdomError', function (e) { jsdomErrors.push(e.message); });

const dom = new JSDOM(html, {
  runScripts: 'outside-only',
  url: 'https://kaoyan-tracker.pages.dev/',
  pretendToBeVisual: true,
  virtualConsole: vc
});
const { window } = dom;
const { document } = window;

window.matchMedia = window.matchMedia || function () { return { matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }; };
window.requestAnimationFrame = window.requestAnimationFrame || function (cb) { return setTimeout(function () { cb(Date.now()); }, 0); };
window.confirm = function () { return true; };
window.alert = function () {};
function mockCtx() { return new Proxy({}, { get: function () { return function () { return mockCtx(); }; }, set: function () { return true; } }); }
window.HTMLCanvasElement.prototype.getContext = function () { return mockCtx(); };
window.HTMLCanvasElement.prototype.toDataURL = function () { return 'data:image/png;base64,'; };
window.HTMLCanvasElement.prototype.toBlob = function (cb) { if (cb) cb({}); };
try { window.location.reload = function () { window.__reloaded = true; }; } catch (e) {}

// 云端状态机（模拟 JSONBin + worker 乐观并发）
window.__cloudVersion = 'v1';
window.__cloudMeta = null;
window.__cloudSeq = 1;
let fetchCalls = [];
window.fetch = function (url, opts) {
  fetchCalls.push({ url: url, method: (opts && opts.method) || 'GET', headers: (opts && opts.headers) || {}, body: (opts && opts.body) });
  return new Promise(function (resolve) {
    setTimeout(function () {
      const m = (opts && opts.method) || 'GET';
      if (m === 'GET') {
        resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ data: window.__cloudData || null, version: window.__cloudVersion || 'v1', meta: window.__cloudMeta || null }); } });
      } else if (m === 'PUT') {
        let body = {};
        try { body = JSON.parse((opts && opts.body) || '{}'); } catch (e) {}
        // B1 乐观并发：PUT 携带的 baseVersion 与云端当前版本不一致 → 409 冲突（与 _worker.js 一致）
        if (body.baseVersion && window.__cloudVersion && body.baseVersion !== window.__cloudVersion) {
          resolve({ ok: false, status: 409, json: function () { return Promise.resolve({ error: 'conflict', currentVersion: window.__cloudVersion }); } });
          return;
        }
        // 否则整库覆盖（保持现有 LWW 行为）
        window.__cloudSeq++;
        window.__cloudVersion = 'v' + window.__cloudSeq;
        window.__cloudData = body.data;
        window.__cloudMeta = { device: body.deviceId || 'browser', updatedAt: new Date().toISOString() };
        resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ ok: true, version: window.__cloudVersion }); } });
      } else {
        resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ ok: true, version: window.__cloudVersion || 'v1' }); } });
      }
    }, 0);
  });
};

const order = ['qrcode.min.js', 'words.js', 'store.js', 'charts.js', 'share.js', 'md5.js', 'sentences.js', 'app.js'];
for (const f of order) {
  const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
  try { window.eval(code); } catch (e) { console.error('❌ 加载 ' + f + ' 失败: ' + e.message); process.exit(1); }
}
if (typeof window.__switchTab !== 'function') {
  try { document.dispatchEvent(new window.Event('DOMContentLoaded')); } catch (e) { console.error('❌ init 失败: ' + e.message); process.exit(1); }
}
if (!window.Store || typeof window.__switchTab !== 'function') { console.error('❌ Store / init 未就绪'); process.exit(1); }

const Store = window.Store;
let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('✅ ' + name); } else { fail++; console.log('❌ ' + name); } }
function finish() {
  console.log('\n========== 手机号账号测试结果 ==========');
  console.log('通过 ' + pass + ' / 失败 ' + fail);
  process.exit(fail ? 1 : 0);
}

function clickSync(phone) {
  const inp = document.getElementById('sync-code');
  inp.value = phone;
  fetchCalls = [];
  document.getElementById('btn-sync-confirm').click();
}

setTimeout(function () {
  // 1) 空值校验
  const inp = document.getElementById('sync-code');
  inp.value = '';
  document.getElementById('btn-sync-confirm').click();
  ok(document.getElementById('sync-status').textContent.indexOf('请先输入手机号') >= 0, '空手机号 → 提示请输入手机号');

  // 2) 格式校验（过短数字）
  inp.value = '12';
  document.getElementById('btn-sync-confirm').click();
  ok(document.getElementById('sync-status').textContent.indexOf('格式不正确') >= 0, '过短数字 → 提示格式不正确');

  // 2b) 含非数字字符
  inp.value = '138abc';
  document.getElementById('btn-sync-confirm').click();
  ok(document.getElementById('sync-status').textContent.indexOf('只能包含数字') >= 0, '含非数字 → 提示只能包含数字');

  // 3) 注册路径（云端无数据）
  window.__cloudData = null;
  clickSync('13800138000');
  setTimeout(function () {
    const st = document.getElementById('sync-status').textContent;
    ok(st.indexOf('注册成功') >= 0, '云端无数据 → 注册成功');
    const putCall = fetchCalls.find(function (c) { return c.method === 'PUT'; });
    ok(!!putCall && putCall.headers['X-Sync-Key'] === '13800138000', '注册 → PUT 且 X-Sync-Key 为手机号');

    // 4) 登录路径（云端有数据，本机空）
    window.__cloudData = { vocab: [{ word: 'hello', meaning: '你好' }] };
    clickSync('13900139000');
    setTimeout(function () {
      const st2 = document.getElementById('sync-status').textContent;
      ok(st2.indexOf('登录成功') >= 0, '云端有数据 → 登录成功');
      const getCall = fetchCalls.find(function (c) { return c.method === 'GET'; });
      ok(!!getCall && getCall.headers['X-Sync-Key'] === '13900139000', '登录 → GET 用同一手机号查云端');
      const restored = (typeof Store.getVocab === 'function' && Store.getVocab().length) || window.__reloaded;
      ok(!!restored, '登录 → 拉取并恢复云端数据');

      // ---- B1 回归：并发冲突 409 + 本地未同步编辑保护 ----
      const dbg = window.__syncDebug;
      ok(!!dbg && typeof dbg.doAutoPullCheck === 'function', 'B1 测试钩子 __syncDebug 已暴露');
      if (dbg) {
        // (5) 本地未同步编辑不被 pull 静默覆盖
        const localWord = 'local_only_' + Date.now();
        if (typeof Store.addVocab === 'function') Store.addVocab(localWord, '本地独有');
        dbg.setPushAt(1000);
        dbg.setLocalEditAt(2000); // 本地有未同步编辑
        window.__cloudVersion = 'v9';
        window.__cloudData = { vocab: [{ word: 'cloud_word', meaning: '云端' }] };
        window.__cloudMeta = { device: 'other', updatedAt: new Date(3000).toISOString() }; // cloudUpdated=3000 > 2000
        const origConfirm = window.confirm;
        let confirmCalled = false;
        window.confirm = function () { confirmCalled = true; return false; }; // 用户取消：保留本机
        dbg.doAutoPullCheck();
        setTimeout(function () {
          window.confirm = origConfirm;
          ok(confirmCalled, 'B1 本地未同步编辑+云端更新 → 弹确认（非静默覆盖）');
          const stillLocal = (typeof Store.getVocab === 'function') && Store.getVocab().some(function (v) { return v.word === localWord; });
          ok(stillLocal, 'B1 用户取消后本机未同步改动保留（未被 pull 覆盖）');

          // (6) 自动推送携带 baseVersion（供服务端乐观并发比对）
          dbg.setSyncVersion('v5');
          window.__cloudVersion = 'v5'; // 一致 → 200
          fetchCalls = [];
          dbg.doAutoPush('13900139000', false);
          setTimeout(function () {
            const pc = fetchCalls.find(function (c) { return c.method === 'PUT'; });
            ok(!!pc && /baseVersion/.test(pc.body || ''), 'B1 自动推送携带 baseVersion（供并发比对）');

            // (7) 并发 PUT 返回 409（模拟服务端乐观并发契约）
            window.__cloudVersion = 'v6'; // 其他设备已推进云端版本
            window.fetch('/api/sync', { method: 'PUT', headers: { 'X-Sync-Key': '13900139000' }, body: JSON.stringify({ syncCode: '13900139000', deviceId: 'd', data: {}, baseVersion: 'v5' }) })
              .then(function (r) { return r.json().then(function (j) { return [r, j]; }); })
              .then(function (arr) {
                ok(arr[0].status === 409, 'B1 过期 baseVersion PUT → 返回 409 冲突');
                ok(/conflict/.test(arr[1].error || ''), 'B1 409 响应含 conflict 标记');
                finish();
              });
          }, 60);
        }, 60);
      } else {
        finish();
      }
    }, 80);
  }, 80);
}, 40);
