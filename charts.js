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

  /* ---------- H4：各科目累计时长 横向条形图 ---------- */
  function renderSubjectBars(container, subjects) {
    container.innerHTML = '';
    if (!subjects || !subjects.length) {
      container.appendChild(el('div', 'empty-hint', '暂无科目学习数据'));
      return;
    }
    var maxMin = 0;
    subjects.forEach(function (s) { if (s.totalMin > maxMin) maxMin = s.totalMin; });
    if (maxMin <= 0) maxMin = 1;
    subjects.forEach(function (s) {
      var row = el('div', 'sb-row');
      var nameCol = el('div', 'sb-name');
      var dot = el('span', 'sb-dot'); dot.style.background = s.color || '#94a3b8';
      nameCol.appendChild(dot); nameCol.appendChild(document.createTextNode(s.name));
      var barCol = el('div', 'sb-bar');
      var fill = el('div', 'sb-fill');
      fill.style.width = Math.round(s.totalMin / maxMin * 100) + '%';
      fill.style.background = s.color || 'var(--primary)';
      barCol.appendChild(fill);
      var h = Math.floor(s.totalMin / 60), m = s.totalMin % 60;
      var txtCol = el('div', 'sb-text', (h ? h + 'h' : '') + m + 'm');
      row.appendChild(nameCol); row.appendChild(barCol); row.appendChild(txtCol);
      container.appendChild(row);
    });
  }

  /* ---------- D3：今日各科时长 SVG 环形饼图 ---------- */
  function renderTodayPie(container, items) {
    container.innerHTML = '';
    if (!items || !items.length) {
      container.appendChild(el('div', 'empty-hint', '今日还没有学习记录，去「记录」页计时吧'));
      return;
    }
    var total = 0; items.forEach(function (i) { total += i.min; });
    if (total <= 0) {
      container.appendChild(el('div', 'empty-hint', '今日还没有学习时长数据'));
      return;
    }
    var W = 220, H = 220, cx = W / 2, cy = H / 2, R = 90, r = 54;
    // SVG
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="pie-svg" role="img" aria-label="今日学习时长分布">';
    var angle = -Math.PI / 2; // 从 12 点方向开始
    items.forEach(function (it) {
      if (it.min <= 0) return;
      var pct = it.min / total;
      var a0 = angle, a1 = angle + pct * Math.PI * 2;
      angle = a1;
      var large = (a1 - a0) > Math.PI ? 1 : 0;
      var x0 = cx + R * Math.cos(a0), y0 = cy + R * Math.sin(a0);
      var x1 = cx + R * Math.cos(a1), y1 = cy + R * Math.sin(a1);
      var xi1 = cx + r * Math.cos(a1), yi1 = cy + r * Math.sin(a1);
      var xi0 = cx + r * Math.cos(a0), yi0 = cy + r * Math.sin(a0);
      var path = ['M', x0, y0, 'A', R, R, 0, large, 1, x1, y1,
                  'L', xi1, yi1, 'A', r, r, 0, large, 0, xi0, yi0, 'Z'].join(' ');
      svg += '<path d="' + path + '" fill="' + (it.color || '#94a3b8') + '" opacity=".92"/>';
    });
    // 中心数字
    var h = Math.floor(total / 60), m = total % 60;
    svg += '<text x="' + cx + '" y="' + (cy - 8) + '" text-anchor="middle" font-size="14" fill="var(--muted, #6b7280)">今日总计</text>';
    svg += '<text x="' + cx + '" y="' + (cy + 20) + '" text-anchor="middle" font-size="24" font-weight="800" fill="var(--ink, #1f2937)">' + (h ? h + 'h' : '') + m + 'm</text>';
    svg += '</svg>';

    var wrap = el('div', 'pie-wrap');
    var svgBox = el('div'); svgBox.innerHTML = svg; wrap.appendChild(svgBox);
    var legend = el('div', 'pie-legend');
    items.forEach(function (it) {
      if (it.min <= 0) return;
      var pct = (it.min / total * 100).toFixed(1);
      var row = el('div', 'pie-legend-item');
      var c = el('span', 'pie-legend-color'); c.style.background = it.color || '#94a3b8';
      var hh = Math.floor(it.min / 60), mm = it.min % 60;
      row.appendChild(c);
      row.appendChild(el('span', 'pie-legend-name', it.name));
      row.appendChild(el('span', 'pie-legend-val', (hh ? hh + 'h' : '') + mm + 'm'));
      row.appendChild(el('span', 'pie-legend-pct', pct + '%'));
      legend.appendChild(row);
    });
    wrap.appendChild(legend);
    container.appendChild(wrap);
  }

  /* ---------- D3：科目掌握度雷达图 ---------- */
  function renderRadar(container, items) {
    container.innerHTML = '';
    if (!items || items.length < 3) {
      container.appendChild(el('div', 'empty-hint', '至少需要 3 个科目数据，才能绘制掌握度雷达图'));
      return;
    }
    var W = 420, H = 420, cx = W / 2, cy = H / 2, R = 150;
    var n = items.length;
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="radar-svg" role="img" aria-label="科目掌握度雷达图">';
    // 网格（4 层）
    var gridColors = ['#eef2ff', '#e0e7ff', '#c7d2fe', '#a5b4fc'];
    if (document.documentElement.getAttribute('data-theme') === 'dark') gridColors = ['#2a2d42', '#313548', '#3e4360', '#4b5178'];
    for (var lv = 4; lv >= 1; lv--) {
      var rr = R * lv / 4;
      var pts = [];
      for (var i = 0; i < n; i++) {
        var a = -Math.PI / 2 + i * Math.PI * 2 / n;
        pts.push((cx + rr * Math.cos(a)).toFixed(2) + ',' + (cy + rr * Math.sin(a)).toFixed(2));
      }
      svg += '<polygon points="' + pts.join(' ') + '" fill="' + gridColors[4 - lv] + '" stroke="' + (document.documentElement.getAttribute('data-theme') === 'dark' ? '#313548' : '#e5e7eb') + '" stroke-width="1"/>';
    }
    // 轴线
    for (var j = 0; j < n; j++) {
      var aa = -Math.PI / 2 + j * Math.PI * 2 / n;
      svg += '<line x1="' + cx + '" y1="' + cy + '" x2="' + (cx + R * Math.cos(aa)).toFixed(2) + '" y2="' + (cy + R * Math.sin(aa)).toFixed(2) + '" stroke="' + (document.documentElement.getAttribute('data-theme') === 'dark' ? '#313548' : '#e5e7eb') + '" stroke-width="1"/>';
    }
    // 数据多边形
    var dataPts = [];
    for (var k = 0; k < n; k++) {
      var aaa = -Math.PI / 2 + k * Math.PI * 2 / n;
      var val = Math.max(0, Math.min(1, items[k].value || 0));
      dataPts.push((cx + R * val * Math.cos(aaa)).toFixed(2) + ',' + (cy + R * val * Math.sin(aaa)).toFixed(2));
    }
    svg += '<polygon points="' + dataPts.join(' ') + '" fill="rgba(79,70,229,.25)" stroke="#4f46e5" stroke-width="2"/>';
    // 数据点
    for (var m = 0; m < n; m++) {
      var a4 = -Math.PI / 2 + m * Math.PI * 2 / n;
      var v4 = Math.max(0, Math.min(1, items[m].value || 0));
      svg += '<circle cx="' + (cx + R * v4 * Math.cos(a4)).toFixed(2) + '" cy="' + (cy + R * v4 * Math.sin(a4)).toFixed(2) + '" r="4" fill="#4f46e5"/>';
    }
    // 标签
    for (var p = 0; p < n; p++) {
      var a5 = -Math.PI / 2 + p * Math.PI * 2 / n;
      var lx = cx + (R + 24) * Math.cos(a5);
      var ly = cy + (R + 24) * Math.sin(a5);
      var anchor = 'middle';
      if (Math.cos(a5) > 0.2) anchor = 'start';
      else if (Math.cos(a5) < -0.2) anchor = 'end';
      svg += '<text x="' + lx.toFixed(2) + '" y="' + (ly + 4).toFixed(2) + '" text-anchor="' + anchor + '" font-size="13" font-weight="600" fill="var(--ink, #1f2937)">' + items[p].name + '</text>';
      svg += '<text x="' + lx.toFixed(2) + '" y="' + (ly + 20).toFixed(2) + '" text-anchor="' + anchor + '" font-size="11" fill="var(--muted, #6b7280)">' + Math.round((items[p].value || 0) * 100) + '%</text>';
    }
    svg += '</svg>';
    var wrap = el('div', 'radar-wrap'); wrap.innerHTML = svg;
    container.appendChild(wrap);
  }

  global.Charts = {
    renderMonthHeatmap: renderMonthHeatmap,
    renderTrend: renderTrend,
    renderSubjectBars: renderSubjectBars,
    renderTodayPie: renderTodayPie,
    renderRadar: renderRadar
  };
})(typeof window !== 'undefined' ? window : this);
