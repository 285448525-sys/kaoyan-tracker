/* charts.js — 纯前端可视化：单月学习热力图 + SVG 成绩趋势图（无外部依赖） */
(function (global) {
  'use strict';

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  /* ---------- 单月热力图（支持月份切换，由 app 传入 year/month） ---------- */
  function renderMonthHeatmap(container, year, month, days) {
    container.innerHTML = '';
    var monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
    var first = new Date(year, month, 1);
    var start = new Date(first);
    start.setDate(1 - first.getDay()); // 回退到周日，保证整周

    function minsOf(ds) { var d = days[ds]; return d ? global.Store.totalMinutesForDay(d) : 0; }
    function level(m) {
      if (m <= 0) return 0;
      if (m <= 30) return 1;
      if (m <= 90) return 2;
      if (m <= 180) return 3;
      return 4;
    }

    var head = el('div', 'mheat-head');
    ['日', '一', '二', '三', '四', '五', '六'].forEach(function (t) {
      head.appendChild(el('div', 'mheat-wd', t));
    });
    container.appendChild(head);

    var grid = el('div', 'mheat-grid');
    var cursor = new Date(start);
    var monthTotal = 0;
    for (var i = 0; i < 42; i++) {
      var dt = new Date(cursor);
      var inMonth = dt.getMonth() === month;
      var ds = global.Store.dateStr(dt);
      var mins = inMonth ? minsOf(ds) : -1;
      if (inMonth) monthTotal += Math.max(0, mins);
      var cell = el('div', 'mheat-cell' + (inMonth ? ' in' : ' out') + ' lv' + (inMonth ? level(mins) : 0));
      if (inMonth) cell.title = ds + '：学习 ' + mins + ' 分钟';
      grid.appendChild(cell);
      cursor.setDate(cursor.getDate() + 1);
    }
    container.appendChild(grid);

    var legend = el('div', 'heatmap-legend');
    legend.appendChild(el('span', 'legend-text', '少'));
    for (var l = 0; l <= 4; l++) legend.appendChild(el('span', 'heatmap-cell lv' + l));
    legend.appendChild(el('span', 'legend-text', '多'));

    var total = el('div', 'mheat-total', monthNames[month] + ' 累计学习 ' + monthTotal + ' 分钟（' + Math.floor(monthTotal / 60) + ' 小时' + (monthTotal % 60) + ' 分）');
    container.appendChild(legend);
    container.appendChild(total);
  }

  /* ---------- SVG 成绩趋势图 ---------- */
  function renderTrend(container, exams, targetTotal) {
    container.innerHTML = '';
    if (!exams || exams.length < 2) {
      container.appendChild(el('div', 'empty-hint', '至少需要 2 次模考成绩，才能生成成绩趋势图。'));
      return;
    }
    var W = 640, H = 300, padL = 44, padR = 16, padT = 16, padB = 36;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var totals = exams.map(function (e) { return e.total; });
    var maxV = Math.max.apply(null, totals.concat([targetTotal || 0]));
    var yMax = Math.ceil(maxV / 50) * 50;
    if (yMax <= 0) yMax = 100;
    var n = exams.length;
    function x(i) { return padL + (n === 1 ? plotW / 2 : (plotW * i) / (n - 1)); }
    function y(v) { return padT + plotH - (v / yMax) * plotH; }

    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="trend-svg" preserveAspectRatio="xMidYMid meet" role="img" aria-label="成绩趋势图">';
    var steps = 5;
    for (var s = 0; s <= steps; s++) {
      var val = (yMax / steps) * s;
      var yy = y(val);
      svg += '<line x1="' + padL + '" y1="' + yy + '" x2="' + (W - padR) + '" y2="' + yy + '" class="grid-line"/>';
      svg += '<text x="' + (padL - 6) + '" y="' + (yy + 4) + '" class="axis-label" text-anchor="end">' + Math.round(val) + '</text>';
    }
    exams.forEach(function (e, i) {
      svg += '<text x="' + x(i) + '" y="' + (H - 12) + '" class="axis-label" text-anchor="middle">' + e.date.slice(5) + '</text>';
    });
    if (targetTotal > 0) {
      var ty = y(targetTotal);
      svg += '<line x1="' + padL + '" y1="' + ty + '" x2="' + (W - padR) + '" y2="' + ty + '" class="target-line"/>';
      svg += '<text x="' + (W - padR) + '" y="' + (ty - 6) + '" class="target-label" text-anchor="end">目标 ' + targetTotal + '</text>';
    }
    var pts = exams.map(function (e, i) { return x(i) + ',' + y(e.total); }).join(' ');
    svg += '<polyline points="' + pts + '" class="trend-line"/>';
    exams.forEach(function (e, i) {
      svg += '<circle cx="' + x(i) + '" cy="' + y(e.total) + '" r="4" class="trend-dot"/>';
      svg += '<text x="' + x(i) + '" y="' + (y(e.total) - 10) + '" class="point-label" text-anchor="middle">' + e.total + '</text>';
    });
    svg += '</svg>';
    container.innerHTML = svg;
  }

  global.Charts = { renderMonthHeatmap: renderMonthHeatmap, renderTrend: renderTrend };
})(typeof window !== 'undefined' ? window : this);
