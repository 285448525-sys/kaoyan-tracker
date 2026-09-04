/* ============================================================
   考研学习记录 · Memphis 工作台增强模块（v20260903m）
   设计标杆：kaoyan-workspace.html「考研土豆工作台」
   模块：
     ① 首页统计组（倒计时 / 今日待办 / 本周专注 / 连续天数）
     ② 每日语录（随机鼓励，可自定义）
     ③ 备考阶段时间轴（12 个考研里程碑，可标记完成）
     ④ 每日作息打卡（7 个默认时段，按日期打卡）
     ⑤ 表单草稿缓存（刷新不丢输入）
   存储：独立 localStorage（ky_ws_*），不读写 Store 业务表，零业务破坏
   规范：=== 严格相等；用户文本进 DOM 必 esc()；querySelector 结果判空
   ============================================================ */
(function () {
  'use strict';
  if (typeof window === 'undefined') return;

  var KEY = {
    quote: 'ky_ws_quotes',
    roadmap: 'ky_ws_roadmap_done',
    routine: 'ky_ws_routine',
    draft: 'ky_ws_draft_'
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

  /* 考研 12 个阶段里程碑（借鉴看板 MILESTONES） */
  var MILESTONES = [
    ['基础启动期', '2026-03', '确定目标院校与专业，收集参考书目与真题'],
    ['一轮基础', '2026-04', '过完各科教材，建立知识框架'],
    ['一轮强化', '2026-06', '配合网课精读，整理笔记'],
    ['暑假集训', '2026-07', '全天备考，开始真题训练'],
    ['二轮强化', '2026-08', '专题突破，查漏补缺'],
    ['真题一轮', '2026-09', '近 10 年真题逐套精做'],
    ['错题攻坚', '2026-10', '集中刷错题，巩固薄弱点'],
    ['三轮冲刺', '2026-11', '模拟考试，训练答题节奏'],
    ['时政背诵', '2026-11', '政治时政与押题背诵'],
    ['考前聚焦', '2026-12', '回归基础，调整作息'],
    ['准考证', '2026-12', '打印准考证，订酒店、看考场'],
    ['初试', '2026-12-19', '全国硕士研究生招生考试']
  ];

  /* 默认作息时段（借鉴看板 ROUTINE_DEFAULT，7 段） */
  var ROUTINE_DEFAULT = [
    ['06:30-07:00', '晨读 / 背单词'],
    ['07:30-08:30', '数学复习'],
    ['09:00-11:30', '专业课'],
    ['14:00-16:00', '英语真题'],
    ['16:30-18:00', '政治'],
    ['19:30-21:30', '错题复盘'],
    ['21:30-22:30', '当日总结']
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
    var cfg = (typeof S.getConfig === 'function') ? S.getConfig() : {};

    // 距考研天数
    var cd = '--';
    if (cfg && cfg.examDate) {
      var diff = Math.round(
        (new Date(cfg.examDate + 'T00:00:00') - new Date(todayStr() + 'T00:00:00')) / 86400000
      );
      cd = diff >= 0 ? diff : ('-' + Math.abs(diff));
    }
    setText('#m-stat-cd', cd);

    // 今日待办（未完成计划数）
    var plan = (typeof S.getPlan === 'function') ? (S.getPlan(todayStr()) || []) : [];
    var todo = plan.filter(function (p) { return !p.done; }).length;
    setText('#m-stat-todo', todo);

    // 本周专注（分钟）
    var mins = 0;
    if (typeof S.getDays === 'function' && typeof S.totalMinutesForDay === 'function') {
      var wk = weekRange();
      var days = S.getDays() || {};
      Object.keys(days).forEach(function (ds) {
        if (ds >= wk[0] && ds <= wk[1]) mins += (S.totalMinutesForDay(ds) || 0);
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

  /* ---------------- ③ 备考阶段时间轴 ---------------- */
  function renderRoadmap() {
    var box = $('#roadmap-list');
    if (!box) return;
    var done = lsGet(KEY.roadmap, {}) || {};

    box.innerHTML = MILESTONES.map(function (m, i) {
      var id = 'ms' + i;
      var isDone = !!done[id];
      return '<div class="m-tl-item' + (isDone ? ' done' : '') + '">' +
        '<div class="node"></div>' +
        '<div class="m-tl-card">' +
          '<div class="ph">' + esc(m[0]) + '</div>' +
          '<div class="dt">' + esc(m[1]) + '</div>' +
          '<div class="ds">' + esc(m[2]) + '</div>' +
          '<div style="margin-top:9px">' +
            '<button class="btn ' + (isDone ? 'btn-ghost' : 'btn-primary') + '" data-ms="' + id + '"' +
              ' style="padding:7px 13px;font-size:13px">' +
              (isDone ? '↩ 取消完成' : '✓ 标记完成') +
            '</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    var n = MILESTONES.filter(function (m, i) { return done['ms' + i]; }).length;
    setText('#roadmap-progress', n + '/' + MILESTONES.length + ' 已完成');

    var btns = box.querySelectorAll('[data-ms]');
    Array.prototype.forEach.call(btns, function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-ms');
        var d = lsGet(KEY.roadmap, {}) || {};
        d[id] = !d[id];
        lsSet(KEY.roadmap, d);
        renderRoadmap();
        toast(d[id] ? '已标记完成 🎉' : '已取消完成');
      });
    });
  }

  /* ---------------- ④ 每日作息打卡 ---------------- */
  function routineDate() {
    var el = $('#routine-date');
    return (el && el.value) ? el.value : todayStr();
  }
  function renderRoutine() {
    var box = $('#routine-list');
    if (!box) return;
    var ds = routineDate();
    var all = lsGet(KEY.routine, {}) || {};
    var rows = all[ds] || [];

    if (!rows.length) {
      box.innerHTML = '<div class="m-empty">点击「填充今日默认时段」开始打卡</div>';
      setText('#routine-progress', '0/0');
      return;
    }

    box.innerHTML = rows.map(function (r, i) {
      return '<div class="m-item' + (r.done ? ' done' : '') + '">' +
        '<div class="body">' +
          '<div class="ttl">' + esc(r.t) + ' · ' + esc(r.s) + '</div>' +
          '<div class="meta"><span class="chip ' + (r.done ? 'green' : 'yellow') + '">' +
            (r.done ? '已打卡' : '未打卡') + '</span></div>' +
        '</div>' +
        '<button class="btn ' + (r.done ? 'btn-ghost' : 'btn-primary') + '" data-i="' + i + '"' +
          ' style="padding:8px 14px;font-size:13px">' + (r.done ? '撤销' : '打卡') + '</button>' +
      '</div>';
    }).join('');

    var n = rows.filter(function (r) { return r.done; }).length;
    setText('#routine-progress', n + '/' + rows.length + ' 已打卡');

    var btns = box.querySelectorAll('[data-i]');
    Array.prototype.forEach.call(btns, function (b) {
      b.addEventListener('click', function () {
        var i = parseInt(b.getAttribute('data-i'), 10);
        var a = lsGet(KEY.routine, {}) || {};
        var list = a[ds] || [];
        if (list[i]) {
          list[i].done = !list[i].done;
          a[ds] = list;
          lsSet(KEY.routine, a);
          renderRoutine();
          toast(list[i].done ? '打卡成功 ✅' : '已撤销');
        }
      });
    });
  }
  function seedRoutine() {
    var ds = routineDate();
    var a = lsGet(KEY.routine, {}) || {};
    if (a[ds] && a[ds].length) {
      toast('该日期已有打卡记录');
      renderRoutine();
      return;
    }
    a[ds] = ROUTINE_DEFAULT.map(function (r) {
      return { t: r[0], s: r[1], done: false };
    });
    lsSet(KEY.routine, a);
    renderRoutine();
    toast('已填充 ' + ROUTINE_DEFAULT.length + ' 个时段');
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
    renderRoadmap();
    renderRoutine();
  }

  function init() {
    // 日期选择器默认值
    var rd = $('#routine-date');
    if (rd) {
      rd.value = todayStr();
      rd.addEventListener('change', renderRoutine);
    }
    var seedBtn = $('#routine-seed');
    if (seedBtn) seedBtn.addEventListener('click', seedRoutine);

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
