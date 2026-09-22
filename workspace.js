/* ============================================================
   考研学习记录 · Memphis 工作台增强模块（v20260903m）
   设计标杆：kaoyan-workspace.html「考研土豆工作台」
   模块：
     ① 首页统计组（倒计时 / 今日待办 / 本周专注 / 连续天数）
     ② 每日语录（随机鼓励，可自定义）
     ③ 表单草稿缓存（刷新不丢输入）
   存储：独立 localStorage（ky_ws_*），不读写 Store 业务表，零业务破坏
   规范：=== 严格相等；用户文本进 DOM 必 esc()；querySelector 结果判空
   ============================================================ */
(function () {
  'use strict';
  if (typeof window === 'undefined') return;

  var KEY = {
    quote: 'ky_ws_quotes',
  };

  /* 默认语录（用户可在 index 的设置里扩展；此处为兜底） */
  var DEFAULT_QUOTES = [
    '慢慢来，比较快。',
    '今天的努力，是明天的底气。',
    '别和别人比进度，和昨天的自己比。',
    '你不需要很厉害才能开始，但要开始才会很厉害。',
    '专注的每一分钟，都在为初试加分。',
    '累了就休息，但别放弃。'
  ];

  /* ---------------- 工具 ---------------- */
  function $(sel) { return document.querySelector(sel); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function todayStr() {
    var t = new Date();
    return t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-' + pad(t.getDate());
  }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function setText(sel, v) {
    var el = $(sel);
    if (el) el.textContent = String(v);
  }
  function toast(msg) {
    var t = $('#toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    if (t._wsT) clearTimeout(t._wsT);
    t._wsT = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }
  function lsGet(k, fallback) {
    try {
      var raw = localStorage.getItem(k);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function lsSet(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
  }
  /* 本周一 ~ 本周日 */
  function weekRange() {
    var t = new Date();
    var day = t.getDay() || 7;                       // 周日=7
    var mon = new Date(t);
    mon.setDate(t.getDate() - (day - 1));
    var sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    var f = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
    return [f(mon), f(sun)];
  }

  /* ---------------- ① 首页统计组 ---------------- */
  function renderStats() {
    var S = window.Store;
    if (!S) return;

    // 注：距考研天数已由顶栏倒计时胶囊承担，统计组不再重复这一格（#m-stat-cd 随 P1 移除）

    // 今日待办（已完成 / 总数）
    var plan = (typeof S.getPlan === 'function') ? (S.getPlan(todayStr()) || []) : [];
    var unDone = plan.filter(function (p) { return !p.done; }).length;
    var doneN = plan.length - unDone;
    setText('#m-stat-todo', plan.length ? (doneN + '/' + plan.length) : '0');

    // 本周专注（分钟）
    var mins = 0;
    if (typeof S.getDays === 'function' && typeof S.totalMinutesForDay === 'function') {
      var wk = weekRange();
      var days = S.getDays() || {};
      Object.keys(days).forEach(function (ds) {
        if (ds >= wk[0] && ds <= wk[1]) mins += (S.totalMinutesForDay(days[ds]) || 0);
      });
    }
    setText('#m-stat-week', mins);

    // 连续学习天数
    var streak = (typeof S.consecutiveStreak === 'function') ? S.consecutiveStreak() : 0;
    setText('#m-stat-streak', streak);
  }

  /* ---------------- ② 每日语录 ---------------- */
  function renderQuote() {
    var arr = lsGet(KEY.quote, null) || DEFAULT_QUOTES;
    if (!arr.length) arr = DEFAULT_QUOTES;
    var q = arr[Math.floor(Math.random() * arr.length)] || '加油';
    setText('#m-quote', '「' + q + '」');
  }

  /* ---------------- ⑤ 表单草稿缓存 ---------------- */
  function bindDraft(prefix, ids) {
    function save() {
      var o = {};
      ids.forEach(function (id) {
        var el = document.getElementById(id);
        if (el) o[id] = el.value;
      });
      try { localStorage.setItem(KEY.draft + prefix, JSON.stringify(o)); } catch (e) {}
    }
    ids.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('input', save);
    });
    var d = null;
    try { d = JSON.parse(localStorage.getItem(KEY.draft + prefix) || 'null'); } catch (e) {}
    if (d) {
      ids.forEach(function (id) {
        if (d[id] !== null && d[id] !== undefined) {
          var el = document.getElementById(id);
          if (el) el.value = d[id];
        }
      });
    }
  }
  function clearDraftOn(prefix, btnId) {
    var el = document.getElementById(btnId);
    if (!el) return;
    el.addEventListener('click', function () {
      try { localStorage.removeItem(KEY.draft + prefix); } catch (e) {}
    });
  }

  /* ---------------- 初始化 ---------------- */
  function refreshAll() {
    renderStats();
    renderQuote();
  }

  function init() {
    // 一次性清理：备考时间轴 / 每日作息 已删除（v20260922l），旧数据随之清除
    try {
      localStorage.removeItem('ky_ws_roadmap_done');
      localStorage.removeItem('ky_ws_routine');
    } catch (e) {}

    // 表单草稿：首页计划 / 错题录入 / 长难句
    bindDraft('plan', ['plan-text', 'plan-subject']);
    bindDraft('mistake', ['mistake-content', 'mistake-note']);
    bindDraft('sentence', ['sentence-input']);
    clearDraftOn('plan', 'btn-add-plan');
    clearDraftOn('mistake', 'btn-add-mistake');

    refreshAll();

    // 切 tab 时刷新（app.js 已绑定自己的逻辑，此处只追加渲染）
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var btn = t.closest('.tab-btn, .btb-btn, .sub-tab-btn');
      if (!btn) return;
      setTimeout(refreshAll, 80);
    });

    // 数据变化时同步统计（低频轮询，避免侵入 Store 的 onSave 钩子）
    setInterval(renderStats, 30000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 暴露给主题切换等场景按需刷新
  window.KYWorkspace = { refresh: refreshAll, renderStats: renderStats };
})();
