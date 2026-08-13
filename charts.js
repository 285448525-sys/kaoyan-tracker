  1→/* charts.js — 纯前端可视化：单月学习热力图 + SVG 成绩趋势图（无外部依赖） */
  2→(function (global) {
  3→  'use strict';
  4→
  5→  function el(tag, cls, html) {
  6→    var e = document.createElement(tag);
  7→    if (cls) e.className = cls;
  8→    if (html !== undefined) e.innerHTML = html;
  9→    return e;
 10→  }
 11→
 12→  /* ---------- 单月热力图（支持月份切换，由 app 传入 year/month） ---------- */
 13→  function renderMonthHeatmap(container, year, month, days) {
 14→    container.innerHTML = '';
 15→    var monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
 16→    var first = new Date(year, month, 1);
 17→    var start = new Date(first);
 18→    start.setDate(1 - first.getDay()); // 回退到周日，保证整周
 19→
 20→    function minsOf(ds) { var d = days[ds]; return d ? global.Store.totalMinutesForDay(d) : 0; }
 21→    function level(m) {
 22→      if (m <= 0) return 0;
 23→      if (m <= 30) return 1;
 24→      if (m <= 90) return 2;
 25→      if (m <= 180) return 3;
 26→      return 4;
 27→    }
 28→
 29→    var head = el('div', 'mheat-head');
 30→    ['日', '一', '二', '三', '四', '五', '六'].forEach(function (t) {
 31→      head.appendChild(el('div', 'mheat-wd', t));
 32→    });
 33→    container.appendChild(head);
 34→
 35→    var grid = el('div', 'mheat-grid');
 36→    var cursor = new Date(start);
 37→    var monthTotal = 0;
 38→    for (var i = 0; i < 42; i++) {
 39→      var dt = new Date(cursor);
 40→      var inMonth = dt.getMonth() === month;
 41→      var ds = global.Store.dateStr(dt);
 42→      var mins = inMonth ? minsOf(ds) : -1;
 43→      if (inMonth) monthTotal += Math.max(0, mins);
 44→      var cell = el('div', 'mheat-cell' + (inMonth ? ' in' : ' out') + ' lv' + (inMonth ? level(mins) : 0));
 45→      if (inMonth) cell.title = ds + '：学习 ' + mins + ' 分钟';
 46→      grid.appendChild(cell);
 47→      cursor.setDate(cursor.getDate() + 1);
 48→    }
 49→    container.appendChild(grid);
 50→
 51→    var legend = el('div', 'heatmap-legend');
 52→    legend.appendChild(el('span', 'legend-text', '少'));
 53→    for (var l = 0; l <= 4; l++) legend.appendChild(el('span', 'heatmap-cell lv' + l));
 54→    legend.appendChild(el('span', 'legend-text', '多'));
 55→
 56→    var total = el('div', 'mheat-total', monthNames[month] + ' 累计学习 ' + monthTotal + ' 分钟（' + Math.floor(monthTotal / 60) + ' 小时' + (monthTotal % 60) + ' 分）');
 57→    container.appendChild(legend);
 58→    container.appendChild(total);
 59→  }
 60→
 61→  /* ---------- SVG 成绩趋势图 ---------- */
 62→  function renderTrend(container, exams, targetTotal) {
 63→    container.innerHTML = '';
 64→    if (!exams || exams.length < 2) {
 65→      container.appendChild(el('div', 'empty-hint', '至少需要 2 次模考成绩，才能生成成绩趋势图。'));
 66→      return;
 67→    }
 68→    var W = 640, H = 300, padL = 44, padR = 16, padT = 16, padB = 36;
 69→    var plotW = W - padL - padR, plotH = H - padT - padB;
 70→    var totals = exams.map(function (e) { return e.total; });
 71→    var maxV = Math.max.apply(null, totals.concat([targetTotal || 0]));
 72→    var yMax = Math.ceil(maxV / 50) * 50;
 73→    if (yMax <= 0) yMax = 100;
 74→    var n = exams.length;
 75→    function x(i) { return padL + (n === 1 ? plotW / 2 : (plotW * i) / (n - 1)); }
 76→    function y(v) { return padT + plotH - (v / yMax) * plotH; }
 77→
 78→    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="trend-svg" preserveAspectRatio="xMidYMid meet" role="img" aria-label="成绩趋势图">';
 79→    var steps = 5;
 80→    for (var s = 0; s <= steps; s++) {
 81→      var val = (yMax / steps) * s;
 82→      var yy = y(val);
 83→      svg += '<line x1="' + padL + '" y1="' + yy + '" x2="' + (W - padR) + '" y2="' + yy + '" class="grid-line"/>';
 84→      svg += '<text x="' + (padL - 6) + '" y="' + (yy + 4) + '" class="axis-label" text-anchor="end">' + Math.round(val) + '</text>';
 85→    }
 86→    exams.forEach(function (e, i) {
 87→      svg += '<text x="' + x(i) + '" y="' + (H - 12) + '" class="axis-label" text-anchor="middle">' + e.date.slice(5) + '</text>';
 88→    });
 89→    if (targetTotal > 0) {
 90→      var ty = y(targetTotal);
 91→      svg += '<line x1="' + padL + '" y1="' + ty + '" x2="' + (W - padR) + '" y2="' + ty + '" class="target-line"/>';
 92→      svg += '<text x="' + (W - padR) + '" y="' + (ty - 6) + '" class="target-label" text-anchor="end">目标 ' + targetTotal + '</text>';
 93→    }
 94→    var pts = exams.map(function (e, i) { return x(i) + ',' + y(e.total); }).join(' ');
 95→    svg += '<polyline points="' + pts + '" class="trend-line"/>';
 96→    exams.forEach(function (e, i) {
 97→      svg += '<circle cx="' + x(i) + '" cy="' + y(e.total) + '" r="4" class="trend-dot"/>';
 98→      svg += '<text x="' + x(i) + '" y="' + (y(e.total) - 10) + '" class="point-label" text-anchor="middle">' + e.total + '</text>';
 99→    });
100→    svg += '</svg>';
101→    container.innerHTML = svg;
102→  }
103→
104→  global.Charts = { renderMonthHeatmap: renderMonthHeatmap, renderTrend: renderTrend };
105→})(typeof window !== 'undefined' ? window : this);