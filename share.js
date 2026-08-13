/* share.js — 生成打卡分享图（Canvas 原生绘制，无需 html2canvas 等外部依赖，可离线） */
(function (global) {
  'use strict';

  function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    var chars = (text || '').split('');
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
    return yy + lineHeight;
  }

  function roundRect(ctx, x, y, w, h, r) {
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

  /* opts: {dateStr, totalMin, streak, subjects:[{name,min,color}], completed, summary, major, examCountdown} */
  function generate(opts) {
    var W = 720, H = 1080;
    var canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext('2d');

    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#4f46e5');
    g.addColorStop(1, '#7c3aed');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(620, 120, 160, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(90, 980, 140, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    var cardX = 48, cardY = 150, cardW = W - 96, cardH = H - 300;
    roundRect(ctx, cardX, cardY, cardW, cardH, 24);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'alphabetic';
    ctx.font = 'bold 38px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText('考研学习打卡', 56, 110);
    ctx.font = '24px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.globalAlpha = 0.9;
    ctx.fillText(opts.dateStr, 56, 140);
    ctx.globalAlpha = 1;

    var ix = cardX + 36, iy = cardY + 50;
    ctx.fillStyle = '#4f46e5';
    ctx.font = 'bold 72px "PingFang SC","Microsoft YaHei",sans-serif';
    var h = Math.floor(opts.totalMin / 60), m = opts.totalMin % 60;
    ctx.fillText((h > 0 ? h + 'h ' : '') + m + 'm', ix, iy + 60);
    ctx.fillStyle = '#6b7280';
    ctx.font = '22px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText('今日学习时长', ix, iy + 92);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 60px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText(opts.streak + ' 天', cardX + cardW - 36, iy + 56);
    ctx.fillStyle = '#6b7280';
    ctx.font = '22px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText('连续打卡', cardX + cardW - 36, iy + 88);
    ctx.textAlign = 'left';

    var by = iy + 140;
    ctx.fillStyle = '#111827';
    ctx.font = 'bold 26px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText('各科学习时长', ix, by);
    by += 24;
    var maxMin = 1;
    opts.subjects.forEach(function (s) { if (s.min > maxMin) maxMin = s.min; });
    opts.subjects.forEach(function (s) {
      by += 30;
      ctx.fillStyle = '#374151';
      ctx.font = '20px "PingFang SC","Microsoft YaHei",sans-serif';
      ctx.fillText(s.name, ix, by);
      var barX = ix + 150, barW = cardW - 36 - 150 - 70;
      ctx.fillStyle = '#e5e7eb';
      roundRect(ctx, barX, by - 16, barW, 14, 7); ctx.fill();
      ctx.fillStyle = s.color || '#4f46e5';
      var bw = Math.max(6, (s.min / maxMin) * barW);
      roundRect(ctx, barX, by - 16, bw, 14, 7); ctx.fill();
      ctx.fillStyle = '#6b7280';
      ctx.font = '18px "PingFang SC","Microsoft YaHei",sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(s.min + 'm', cardX + cardW - 36, by);
      ctx.textAlign = 'left';
    });

    if (opts.completed) {
      by += 44;
      ctx.fillStyle = '#111827';
      ctx.font = 'bold 24px "PingFang SC","Microsoft YaHei",sans-serif';
      ctx.fillText('今日完成', ix, by);
      by += 14;
      ctx.fillStyle = '#4b5563';
      ctx.font = '20px "PingFang SC","Microsoft YaHei",sans-serif';
      by = wrapText(ctx, opts.completed, ix, by + 26, cardW - 72, 30);
    }

    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.92;
    ctx.font = '22px "PingFang SC","Microsoft YaHei",sans-serif';
    var foot = '考研学习记录 · ' + (opts.major || '全力备战');
    if (opts.examCountdown !== undefined && opts.examCountdown >= 0) foot += ' · 距考研 ' + opts.examCountdown + ' 天';
    ctx.fillText(foot, 56, H - 70);
    ctx.globalAlpha = 1;

    return canvas;
  }

  global.Share = { generate: generate };
})(typeof window !== 'undefined' ? window : this);
