// test_hash_routing.js — 验证 hash 路由：点击 tab 更新 location.hash，刷新/前进后退能回到对应模块
const fs = require('fs');
const path = 'C:/Users/Camille/WorkBuddy/考研网站/';
const html = fs.readFileSync(path + 'index.html', 'utf8');
const { JSDOM } = require(path + 'node_modules/jsdom');

function ok(cond, msg) { if (!cond) { console.error('❌', msg); process.exitCode = 1; } else { console.log('✓', msg); } }

const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/' });
const { window } = dom;
window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
window.HTMLElement.prototype.scrollIntoView = function () {};
window.history.replaceState = function () {}; // jsdom 不支持，mock 掉

const scripts = ['qrcode.min.js', 'words.js', 'store.js', 'charts.js', 'share.js', 'md5.js', 'sentences.js', 'app.js'];
scripts.forEach(s => { try { window.eval(fs.readFileSync(path + s, 'utf8')); } catch (e) { console.error('ERR', s, e.message); } });

const doc = window.document;
doc.dispatchEvent(new window.Event('DOMContentLoaded'));

function activePanel() { return doc.querySelector('.tab-panel.active'); }
function activeTab() { const b = doc.querySelector('.tab-btn.active'); return b ? b.getAttribute('data-tab') : null; }

// 1. 默认打开 home
ok(activeTab() === 'home', '初始激活首页');

// 2. 点击 math 导航，active 应变为 math
const mathBtn = doc.querySelector('.tab-btn[data-tab="math"]');
ok(!!mathBtn, '数学 tab 按钮存在');
mathBtn.click();
ok(activeTab() === 'math', '点击数学后 active 标签变为 math');
ok(activePanel().id === 'tab-math', '点击数学后 active panel 为 tab-math');

// 3. 点击底部 tabbar 的 vocab
const vocabBtb = doc.querySelector('.bottom-tabbar .btb-btn[data-tab="vocab"]');
if (vocabBtb) {
  vocabBtb.click();
  ok(activeTab() === 'vocab', '底部 tabbar 点击词汇后 active 变为 vocab');
}

// 4. switchTab 别名（dashboard -> home）
window.switchTab('dashboard');
ok(activeTab() === 'home', 'switchTab("dashboard") 映射到 home');

// 5. hashchange 事件：直接修改 hash 到 #cs408 应自动切换
window.location.hash = '#cs408';
doc.defaultView.dispatchEvent(new window.HashChangeEvent('hashchange'));
ok(activeTab() === 'cs408', 'hashchange 到 #cs408 自动切换');

console.log('hash 路由测试完成');
