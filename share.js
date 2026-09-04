/* share.js — 生成高级感打卡分享图（Canvas 原生绘制，QR 码依赖 qrcode-generator 库） */
(function (global) {
  'use strict';

  /* ---------------- 工具函数 ---------------- */
  function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    var chars = String(text || '').split('');
    var line = '';
    var yy = y;
    for (var i = 0; i < chars.length; i++) {
      var test = line + chars[i];
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, yy);
        line = chars[i];
        yy += lineHeight;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, yy);
    return yy;
  }

  function roundRect(ctx, x, y, w, h, r) {
    if (r < 0) r = 0;
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawCircle(ctx, x, y, r) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.closePath();
  }

  var FONT_FAMILY = '"PingFang SC","Microsoft YaHei","Hiragino Sans GB","Helvetica Neue",sans-serif';
  var FONT_MONO = '"SF Mono","JetBrains Mono","Consolas",monospace';
  var COLORS = {
    ink: '#2B2118',
    inkSoft: '#6B5644',
    muted: '#A08B76',
    line: '#F0E7DA',
    card: '#FFFFFF',
    brand: '#EA580C',
    brandSoft: '#C2410C',
    gold: '#D97706',
    ok: '#059669',
    danger: '#DC2626',
    accent: '#F97316',
    ds: '#3DA5FF',
    co: '#F97316',
    os: '#059669',
    nw: '#D97706',
  };

  /* ---------------- 渐变背景 + 装饰 ---------------- */
  function drawBackground(ctx, W, H) {
    var bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#FFF8EC');
    bg.addColorStop(1, '#FCEFD8');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.globalAlpha = 0.35;
    var g1 = ctx.createRadialGradient(660, 70, 0, 660, 70, 260);
    g1.addColorStop(0, 'rgba(234,88,12,0.26)');
    g1.addColorStop(1, 'rgba(234,88,12,0)');
    ctx.fillStyle = g1;
    ctx.fillRect(400, -100, 420, 400);
    var g2 = ctx.createRadialGradient(90, H - 280, 0, 90, H - 280, 280);
    g2.addColorStop(0, 'rgba(217,119,6,0.18)');
    g2.addColorStop(1, 'rgba(217,119,6,0)');
    ctx.fillStyle = g2;
    ctx.fillRect(-150, H - 520, 400, 400);
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = 'rgba(194,65,12,0.20)';
    ctx.lineWidth = 1.5;
    roundRect(ctx, 24, 24, W - 48, H - 48, 20);
    ctx.stroke();
    ctx.restore();
  }

  /* ---------------- 倒计时 pill ---------------- */
  function drawCountdownBadge(ctx, rightX, topY, days) {
    var text = (days === undefined || days === null) ? '加油！' : (days > 0 ? '距考研 ' + days + ' 天' : (days === 0 ? '今天考研！' : '已结束 ' + Math.abs(days) + ' 天'));
    ctx.save();
    ctx.font = 'bold 18px ' + FONT_FAMILY;
    var padX = 18, padY = 8;
    var tw = ctx.measureText(text).width;
    var w = tw + padX * 2, h = 34;
    var x = rightX - w, y = topY;

    var g = ctx.createLinearGradient(x, y, x + w, y);
    g.addColorStop(0, '#EA580C');
    g.addColorStop(1, '#C2410C');
    ctx.fillStyle = g;
    roundRect(ctx, x, y, w, h, 17);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + padX, y + h / 2 + 1);
    ctx.restore();
  }

  /* ---------------- 标题区（含昵称）---------------- */
  function drawHeader(ctx, dateStr, nickname, streak) {
    var d = null;
    if (dateStr) {
      var parts = String(dateStr).split(/[-\/]/);
      if (parts.length === 3) d = new Date(+parts[0], (+parts[1]) - 1, +parts[2]);
    }
    if (!d || isNaN(d.getTime())) d = new Date();
    var weekdays = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
    var wd = weekdays[d.getDay()];
    var datePretty = (d.getFullYear()) + '.' +
      String(d.getMonth() + 1).padStart(2,'0') + '.' +
      String(d.getDate()).padStart(2,'0');

    // 小标
    ctx.fillStyle = COLORS.muted;
    ctx.font = '15px ' + FONT_FAMILY;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('考研学习记录 · 每日打卡', 56, 80);

    // 主日期
    ctx.fillStyle = COLORS.ink;
    ctx.font = 'bold 40px ' + FONT_FAMILY;
    ctx.fillText(datePretty + '  ' + wd, 56, 126);

    // 昵称行
    if (nickname) {
      ctx.fillStyle = COLORS.brand;
      ctx.font = '600 18px ' + FONT_FAMILY;
      var nickText = nickname + ' 的第 ' + (streak || 0) + ' 天打卡';
      ctx.fillText(nickText, 56, 154);
    }
  }

  /* ---------------- KPI 主卡：时长 + 连续 + 计划完成 ---------------- */
  function drawKpiCard(ctx, x, y, w, cardH, opts) {
    ctx.save();
    ctx.shadowColor = 'rgba(31,41,55,0.05)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 4;
    roundRect(ctx, x, y, w, cardH, 20);
    ctx.fillStyle = COLORS.card;
    ctx.fill();
    ctx.restore();

    var padL = 28, padT = 28;
    var colW = (w - padL * 2) / 3;

    // ---- Col 1: 总时长 ----
    var hours = Math.floor(opts.totalMin / 60), mins = opts.totalMin % 60;
    var timeStr = (hours > 0 ? hours + 'h ' : '') + mins + 'm';
    if (opts.totalMin === 0) timeStr = '0m';
    ctx.fillStyle = COLORS.brand;
    ctx.font = 'bold 48px ' + FONT_MONO;
    var tx = x + padL;
    var ty = y + padT + 42;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(timeStr, tx, ty);

    ctx.fillStyle = COLORS.muted;
    ctx.font = '15px ' + FONT_FAMILY;
    ctx.fillText('今日专注时长', tx, ty + 24);

    // 分隔线 1
    var lx1 = x + padL + colW;
    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(lx1, y + 32);
    ctx.lineTo(lx1, y + cardH - 32);
    ctx.stroke();

    // ---- Col 2: 连续打卡 ----
    ctx.fillStyle = COLORS.gold;
    ctx.font = 'bold 44px ' + FONT_MONO;
    var cx = x + padL + colW + 18;
    var streakStr = String(opts.streak || 0);
    ctx.fillText(streakStr, cx, ty);
    ctx.fillStyle = COLORS.gold;
    ctx.font = 'bold 18px ' + FONT_FAMILY;
    ctx.fillText('天', cx + ctx.measureText(streakStr).width + 4, ty - 6);

    ctx.fillStyle = COLORS.muted;
    ctx.font = '15px ' + FONT_FAMILY;
    ctx.fillText('连续打卡', cx, ty + 24);

    // 小星装饰
    ctx.save();
    ctx.translate(cx + 88, ty - 28);
    ctx.fillStyle = '#FDE68A';
    drawCircle(ctx, 0, 0, 13); ctx.fill();
    ctx.fillStyle = COLORS.gold;
    ctx.font = 'bold 13px ' + FONT_FAMILY;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText('✦', 0, 1);
    ctx.restore();

    // 分隔线 2
    var lx2 = x + padL + colW * 2;
    ctx.strokeStyle = COLORS.line;
    ctx.beginPath();
    ctx.moveTo(lx2, y + 32);
    ctx.lineTo(lx2, y + cardH - 32);
    ctx.stroke();

    // ---- Col 3: 计划完成 ----
    var planDone = opts.planDone || 0;
    var planTotal = opts.planTotal || 0;
    ctx.fillStyle = COLORS.ok;
    ctx.font = 'bold 44px ' + FONT_MONO;
    var rx = x + padL + colW * 2 + 18;
    ctx.fillText(planDone + '/' + planTotal, rx, ty);

    ctx.fillStyle = COLORS.muted;
    ctx.font = '15px ' + FONT_FAMILY;
    ctx.fillText('计划项完成', rx, ty + 24);

    // 小进度环
    var rw = 38, rh = 38;
    var cx3 = x + w - 28 - rw / 2, cy3 = y + 28 + rh / 2;
    var pct = planTotal > 0 ? planDone / planTotal : 0;
    ctx.save();
    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = 4;
    drawCircle(ctx, cx3, cy3, rw / 2 - 2);
    ctx.stroke();
    ctx.strokeStyle = COLORS.ok;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx3, cy3, rw / 2 - 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
    ctx.stroke();
    ctx.restore();
  }

  /* ---------------- 科目时长卡 ---------------- */
  function drawSubjectsCard(ctx, x, y, w, h, subjects) {
    ctx.save();
    ctx.shadowColor = 'rgba(31,41,55,0.04)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 3;
    roundRect(ctx, x, y, w, h, 18);
    ctx.fillStyle = COLORS.card;
    ctx.fill();
    ctx.restore();

    var ix = x + 24, iy = y + 22;
    ctx.fillStyle = COLORS.ink;
    ctx.font = 'bold 20px ' + FONT_FAMILY;
    ctx.fillText('各科学习时长', ix, iy);
    ctx.textAlign = 'right';
    ctx.fillStyle = COLORS.muted;
    ctx.font = '13px ' + FONT_FAMILY;
    var totalMin = subjects.reduce(function(s, x){ return s + (x.min || 0); }, 0);
    ctx.fillText('合计 ' + (totalMin) + ' 分钟', x + w - 24, iy);
    ctx.textAlign = 'left';

    iy += 8;
    var maxMin = 1;
    subjects.forEach(function (s) { if ((s.min || 0) > maxMin) maxMin = s.min || 0; });

    var barX = ix + 110, barW = w - 48 - 110 - 60;
    var rowH = 32;
    var rowCap = Math.floor((h - 66) / rowH);
    var shown = subjects.slice(0, rowCap);
    shown.forEach(function (s, i) {
      var ry = iy + 30 + i * rowH;
      ctx.fillStyle = s.color || COLORS.brand;
      drawCircle(ctx, ix + 6, ry - 6, 5); ctx.fill();
      ctx.fillStyle = COLORS.inkSoft;
      ctx.font = '15px ' + FONT_FAMILY;
      var nm = s.name || '—';
      if (nm.length > 6) nm = nm.slice(0, 6) + '…';
      ctx.fillText(nm, ix + 20, ry);
      ctx.fillStyle = '#F3F4F6';
      roundRect(ctx, barX, ry - 14, barW, 10, 5); ctx.fill();
      var bw = Math.max(2, ((s.min || 0) / maxMin) * barW);
      ctx.fillStyle = s.color || COLORS.brand;
      roundRect(ctx, barX, ry - 14, bw, 10, 5); ctx.fill();
      ctx.fillStyle = COLORS.inkSoft;
      ctx.font = 'bold 14px ' + FONT_MONO;
      ctx.textAlign = 'right';
      ctx.fillText((s.min || 0) + 'm', x + w - 24, ry);
      ctx.textAlign = 'left';
    });
    if (subjects.length > shown.length) {
      var ry = iy + 30 + shown.length * rowH;
      ctx.fillStyle = COLORS.muted;
      ctx.font = '13px ' + FONT_FAMILY;
      ctx.fillText('+' + (subjects.length - shown.length) + ' 项其他科目…', ix + 20, ry);
    }
  }

  /* ---------------- 计划明细卡（含学习心得）---------------- */
  function drawPlanCard(ctx, x, y, w, h, planItems, completedText, summary) {
    ctx.save();
    ctx.shadowColor = 'rgba(31,41,55,0.04)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 3;
    roundRect(ctx, x, y, w, h, 18);
    ctx.fillStyle = COLORS.card;
    ctx.fill();
    ctx.restore();

    var ix = x + 24, iy = y + 22;
    ctx.fillStyle = COLORS.ink;
    ctx.font = 'bold 20px ' + FONT_FAMILY;
    ctx.fillText('今日完成清单', ix, iy);
    ctx.fillStyle = COLORS.muted;
    ctx.font = '13px ' + FONT_FAMILY;
    var doneList = planItems.filter(function(p){ return p.done && (p.text || '').trim(); });
    ctx.fillText('已勾选 ' + doneList.length + ' / ' + planItems.length, ix + 130, iy);

    iy += 8;
    var rowH = 28;
    var summaryH = summary ? 56 : 0;
    var maxRows = Math.floor((h - 60 - summaryH) / rowH);

    if (!doneList.length && !completedText) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = '15px ' + FONT_FAMILY;
      ctx.fillText('还没有勾选计划项，去「计划」页规划一下吧～', ix, iy + 30);
    } else if (!doneList.length && completedText) {
      iy += 24;
      ctx.fillStyle = COLORS.inkSoft;
      ctx.font = '15px ' + FONT_FAMILY;
      wrapText(ctx, completedText, ix, iy, w - 48, 24);
    } else {
      var show = doneList.slice(0, maxRows);
      show.forEach(function (p, i) {
        var ry = iy + 26 + i * rowH;
        // ✓ 框
        ctx.save();
        ctx.fillStyle = COLORS.ok;
        roundRect(ctx, ix, ry - 15, 18, 18, 5); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px ' + FONT_FAMILY;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        ctx.fillText('✓', ix + 9, ry - 6);
        ctx.restore();
        // 科目颜色圆点
        var dotX = ix + 28;
        ctx.save();
        ctx.beginPath();
        ctx.fillStyle = p.color || '#64748b';
        ctx.arc(dotX + 4, ry - 5, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        // 文本
        ctx.fillStyle = COLORS.inkSoft;
        ctx.font = '15px ' + FONT_FAMILY;
        ctx.textBaseline = 'alphabetic';
        var tx = dotX + 14;
        var txt = p.text || '';
        var min = Number(p.minutes) || 0;
        var maxTxtW = w - 48 - (tx - ix) - 56;
        if (min > 0) {
          ctx.font = 'bold 13px ' + FONT_MONO;
          ctx.fillStyle = p.color || COLORS.brand;
          ctx.textAlign = 'right';
          ctx.fillText(min + 'm', x + w - 24, ry);
          ctx.textAlign = 'left';
          ctx.fillStyle = COLORS.inkSoft;
          ctx.font = '15px ' + FONT_FAMILY;
        }
        if (ctx.measureText(txt).width > maxTxtW) {
          while (ctx.measureText(txt + '…').width > maxTxtW && txt.length) txt = txt.slice(0, -1);
          txt = txt + '…';
        }
        ctx.fillText(txt, tx, ry);
      });
      if (doneList.length > show.length) {
        var ry = iy + 26 + show.length * rowH;
        ctx.fillStyle = COLORS.muted;
        ctx.font = '13px ' + FONT_FAMILY;
        ctx.fillText('+' + (doneList.length - show.length) + ' 项已完成……', ix + 28, ry);
      }
    }

    // 学习心得（始终展示，如果有）
    if (summary) {
      var sy = y + h - 48;
      // 分隔线
      ctx.strokeStyle = COLORS.line;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ix, sy - 16);
      ctx.lineTo(x + w - 24, sy - 16);
      ctx.stroke();
      // 标签
      ctx.fillStyle = COLORS.accent;
      ctx.font = 'bold 13px ' + FONT_FAMILY;
      ctx.fillText('💬 学习心得', ix, sy);
      // 内容
      ctx.fillStyle = COLORS.inkSoft;
      ctx.font = '14px ' + FONT_FAMILY;
      var summaryText = summary.length > 60 ? summary.slice(0, 60) + '…' : summary;
      wrapText(ctx, summaryText, ix + 88, sy, w - 48 - 88, 20);
    }
  }

  /* ---------------- 底部亮点：进度条 / 章节 / 鼓励语 ---------------- */
  function drawHighlights(ctx, x, y, w, h, opts) {
    ctx.save();
    ctx.shadowColor = 'rgba(31,41,55,0.04)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 3;
    roundRect(ctx, x, y, w, h, 18);
    ctx.fillStyle = COLORS.card;
    ctx.fill();
    ctx.restore();

    var ix = x + 24, iy = y + 22;
    ctx.fillStyle = COLORS.ink;
    ctx.font = 'bold 20px ' + FONT_FAMILY;
    ctx.fillText('学习进度与亮点', ix, iy);

    iy += 6;
    var rows = [];
    if (opts.mathTotal) {
      var mDone = (opts.mathCurrent !== undefined && opts.mathCurrent >= 0) ? (opts.mathCurrent + 1) : 0;
      rows.push({ icon: '🧮', label: '数学章节', value: mDone + ' / ' + opts.mathTotal, pct: opts.mathTotal ? mDone / opts.mathTotal : 0, color: COLORS.ok });
    }
    if (opts.cs408Total) {
      var cDone = (opts.cs408Current !== undefined && opts.cs408Current >= 0) ? (opts.cs408Current + 1) : 0;
      rows.push({ icon: '💻', label: '408 章节', value: cDone + ' / ' + opts.cs408Total, pct: opts.cs408Total ? cDone / opts.cs408Total : 0, color: COLORS.accent });
    } else {
      if (opts.subjectChapters && opts.subjectChapters.length) {
        var s0 = opts.subjectChapters[0];
        if (s0.total) {
          var sDone = (s0.current !== undefined && s0.current >= 0) ? (s0.current + 1) : 0;
          rows.push({ icon: '📖', label: s0.name + '章节', value: sDone + ' / ' + s0.total, pct: s0.total ? sDone / s0.total : 0, color: COLORS.brand });
        }
      }
    }
    if (opts.cs408DueCount !== undefined && opts.cs408DueCount >= 0) {
      rows.push({ icon: '📝', label: '408 错题待复习', value: (opts.cs408DueCount === 0 ? '已清零 ✓' : opts.cs408DueCount + ' 题'), pct: 0, color: opts.cs408DueCount === 0 ? COLORS.ok : COLORS.gold, isValue: true });
    }

    if (!rows.length) {
      iy += 24;
      ctx.fillStyle = COLORS.inkSoft;
      ctx.font = '15px ' + FONT_FAMILY;
      var sent = '慢慢来，比较快。每天坚持一点点，上岸之日就在眼前 ✨';
      wrapText(ctx, sent, ix, iy, w - 48, 24);
    } else {
      var rh = 28, cap = Math.floor((h - 60) / rh);
      rows.slice(0, cap).forEach(function (r, i) {
        var ry = iy + 30 + i * rh;
        ctx.font = '14px sans-serif';
        ctx.fillStyle = COLORS.inkSoft;
        ctx.fillText(r.icon, ix, ry);
        ctx.font = '14px ' + FONT_FAMILY;
        ctx.fillStyle = COLORS.inkSoft;
        ctx.fillText(r.label, ix + 24, ry);
        ctx.font = 'bold 13px ' + FONT_MONO;
        ctx.fillStyle = r.color || COLORS.ink;
        ctx.textAlign = 'right';
        var valW = ctx.measureText(r.value).width;
        ctx.fillText(r.value, x + w - 24, ry);
        ctx.textAlign = 'left';
        if (!r.isValue && r.pct !== undefined) {
          var barW = 120;
          var bx = x + w - 24 - valW - 8 - barW;
          var by = ry - 9;
          ctx.fillStyle = '#F3F4F6';
          roundRect(ctx, bx, by, barW, 6, 3); ctx.fill();
          ctx.fillStyle = r.color || COLORS.brand;
          roundRect(ctx, bx, by, Math.max(2, barW * r.pct), 6, 3); ctx.fill();
        }
      });
    }
  }

  /* ---------------- QR 码绘制 ---------------- */
  function drawQRCode(ctx, x, y, size, url) {
    // 如果 qrcode 库未加载，画文字兜底
    if (typeof qrcode === 'undefined') {
      ctx.fillStyle = COLORS.muted;
      ctx.font = '12px ' + FONT_FAMILY;
      wrapText(ctx, url, x, y + 14, size + 20, 16);
      return;
    }
    try {
      var qr = qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      var count = qr.getModuleCount();
      var cellSize = size / count;
      // 白色圆角背景
      ctx.fillStyle = '#FFFFFF';
      roundRect(ctx, x - 8, y - 8, size + 16, size + 16, 10);
      ctx.fill();
      // 绘制 QR 模块
      ctx.fillStyle = '#2B2118';
      for (var r = 0; r < count; r++) {
        for (var c = 0; c < count; c++) {
          if (qr.isDark(r, c)) {
            ctx.fillRect(
              Math.round(x + c * cellSize),
              Math.round(y + r * cellSize),
              Math.ceil(cellSize),
              Math.ceil(cellSize)
            );
          }
        }
      }
    } catch (e) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = '12px ' + FONT_FAMILY;
      wrapText(ctx, url, x, y + 14, size + 20, 16);
    }
  }

  /* ---------------- 底栏（含 QR 码）---------------- */
  function drawFooter(ctx, W, H, opts) {
    var y = H - 240;
    // 细分割线
    ctx.strokeStyle = 'rgba(194,65,12,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(56, y);
    ctx.lineTo(W - 56, y);
    ctx.stroke();

    // QR 码（左下角，放大到 120px）
    var qrSize = 120;
    var qrX = 56, qrY = y + 24;
    if (opts.siteUrl) {
      drawQRCode(ctx, qrX, qrY, qrSize, opts.siteUrl);
    }

    // 品牌信息（QR 右侧）
    var bx = qrX + qrSize + 28;
    var by = y + 42;
    // Logo 圆点
    ctx.save();
    ctx.fillStyle = COLORS.brand;
    drawCircle(ctx, bx, by - 6, 10); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px ' + FONT_FAMILY;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText('考', bx, by - 5);
    ctx.restore();

    ctx.fillStyle = COLORS.ink;
    ctx.font = 'bold 20px ' + FONT_FAMILY;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillText('考研学习 Hub', bx + 20, by);

    ctx.fillStyle = COLORS.brand;
    ctx.font = '600 15px ' + FONT_FAMILY;
    ctx.fillText('长按扫码，和我一起打卡 →', bx + 20, by + 26);

    // 专业信息
    if (opts.major) {
      ctx.fillStyle = COLORS.inkSoft;
      ctx.font = '13px ' + FONT_FAMILY;
      ctx.fillText('目标专业：' + opts.major, bx + 20, by + 48);
    }

    // 网址文字（二维码下方，作为扫码失败的备份）
    if (opts.siteUrl) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = '11px ' + FONT_FAMILY;
      ctx.textAlign = 'center';
      var urlText = opts.siteUrl.replace(/^https?:\/\//, '');
      ctx.fillText(urlText, qrX + qrSize / 2, qrY + qrSize + 20);
      ctx.textAlign = 'left';
    }

    // 励志金句（底部居中）
    var quotes = [
      '日拱一卒，功不唐捐',
      '今天的努力，是幸运的伏笔',
      '稳扎稳打，步步为营',
      '耐心和坚持，胜过激情和天赋',
      '保持节奏，终点就在前方'
    ];
    var q = quotes[(opts.streak || 0) % quotes.length];
    ctx.fillStyle = COLORS.brandSoft;
    ctx.font = '600 15px ' + FONT_FAMILY;
    ctx.textAlign = 'center';
    ctx.fillText('「 ' + q + ' 」', W / 2, H - 24);
    ctx.textAlign = 'left';
  }

  /* ---------------- 主入口 ---------------- */
  /**
   * opts:
   *  { dateStr, totalMin, streak, nickname, siteUrl,
   *    subjects:[{name,min,color}],
   *    completed: string, summary: string, major, examCountdown,
   *    plans: [{text,minutes,done}], planDone, planTotal,
   *    mathCurrent, mathTotal, cs408Current, cs408Total, cs408DueCount,
   *    subjectChapters: [{name,current,total}] }
   */
  function generate(opts) {
    opts = opts || {};
    var W = 720, H = 1280;
    var canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';

    // 1. 背景
    drawBackground(ctx, W, H);
    // 2. 倒计时 pill
    drawCountdownBadge(ctx, W - 56, 58, opts.examCountdown);
    // 3. 标题（日期 + 星期 + 昵称）
    drawHeader(ctx, opts.dateStr, opts.nickname, opts.streak);

    // 4. KPI 主卡
    var kpiY = 178, kpiH = 140, kpiX = 48, kpiW = W - 96;
    drawKpiCard(ctx, kpiX, kpiY, kpiW, kpiH, opts);

    // 5. 科目时长卡
    var sY = kpiY + kpiH + 20, sH = 200;
    var subs = (opts.subjects && opts.subjects.length) ? opts.subjects : [{ name: '暂无记录', min: 0, color: '#9ca3af' }];
    drawSubjectsCard(ctx, kpiX, sY, kpiW, sH, subs);

    // 6. 计划明细卡（含学习心得）
    var pY = sY + sH + 20, pH = 280;
    drawPlanCard(ctx, kpiX, pY, kpiW, pH, opts.plans || [], opts.completed || '', opts.summary || '');

    // 7. 亮点 / 章节进度
    var hlY = pY + pH + 20, hlH = 140;
    drawHighlights(ctx, kpiX, hlY, kpiW, hlH, opts);

    // 8. 底栏（含 QR 码）
    drawFooter(ctx, W, H, opts);

    return canvas;
  }

  global.Share = { generate: generate };
})(typeof window !== 'undefined' ? window : this);
