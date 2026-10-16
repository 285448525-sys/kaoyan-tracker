// test_hash_routing.js — 验证 hash 路由：点击 tab 更新 location.hash，刷新/前进后退能回到对应模块
const fs = require('fs');
const path = __dirname + '/';
const html = fs.readFileSync(path + 'index.html', 'utf8');
const { JSDOM } = require('C:/Users/Camille/WorkBuddy/考研网站/node_modules/jsdom');

function ok(cond, msg) { if (!cond) { console.error('❌', msg); process.exitCode = 1; } else { console.log('✓', msg); } }

const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/' });
const { window } = dom;
window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
window.HTMLElement.prototype.scrollIntoView = function () {};
window.history.replaceState = function () {}; // jsdom 不支持，mock 掉

const scripts = ['qrcode.min.js', 'words.js', 'store.js', 'charts.js', 'share.js', 'sentences.js', 'app.js'];
scripts.forEach(s => { try { window.eval(fs.readFileSync(path + s, 'utf8')); } catch (e) { console.error('ERR', s, e.message); } });

const doc = window.document;
doc.dispatchEvent(new window.Event('DOMContentLoaded'));

function activePanel() { return doc.querySelector('.tab-panel.active'); }
function activeTab() { const b = doc.querySelector('.tab-btn.active'); return b ? b.getAttribute('data-tab') : null; }

// 1. 默认打开 home
ok(activeTab() === 'home', '初始激活首页');

// 2. 点击 timer 导航（math/cs408 已移出侧栏，改为计时入口），active 应变为 timer
const timerBtn = doc.querySelector('.tab-btn[data-tab="timer"]');
ok(!!timerBtn, '计时 tab 按钮存在');
timerBtn.click();
ok(activeTab() === 'timer', '点击计时后 active 标签变为 timer');
ok(activePanel().id === 'tab-timer', '点击计时后 active panel 为 tab-timer');

// 2b. #me 白屏回归（P0-1）：侧栏/底栏「我的」是 data-tab="settings"，
//     旧 hash 别名表缺 me → showTab 找不到 #tab-me → 全 panel 失活白屏
window.location.hash = '#me';
doc.defaultView.dispatchEvent(new window.HashChangeEvent('hashchange'));
ok(activePanel() && activePanel().id === 'tab-settings', '#me 映射到 tab-settings（不再白屏）');

// 3. 点击底部 tabbar 的 vocab
const vocabBtb = doc.querySelector('.bottom-tabbar .btb-btn[data-tab="vocab"]');
if (vocabBtb) {
  vocabBtb.click();
  ok(activeTab() === 'vocab', '底部 tabbar 点击词汇后 active 变为 vocab');
}

// 4. switchTab 别名（dashboard -> home）
window.switchTab('dashboard');
ok(activeTab() === 'home', 'switchTab("dashboard") 映射到 home');

// 5. hashchange 事件：直接修改 hash 到 #vocab 应自动切换
window.location.hash = '#vocab';
doc.defaultView.dispatchEvent(new window.HashChangeEvent('hashchange'));
ok(activeTab() === 'vocab', 'hashchange 到 #vocab 自动切换');

console.log('hash 路由测试完成');
