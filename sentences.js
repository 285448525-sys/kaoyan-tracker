/* sentences.js — 长难句分析（纯前端规则分析，无外部依赖、可离线）
 * 对外暴露 window.SentenceAnalyzer.analyze(text) -> {
 *   clauses:   [{text, type:'main'|'sub'|'coord', intro: 连接词|null}],
 *   testWords: [{word, c}],            // 句中出现的本地词库「考点词」及释义
 *   synonyms:  [{group, hits, note}],  // 命中「高频同义替换考点组」的归纳
 *   stats:     { wordCount, clauseCount, difficulty, connectors, signals, features, pronouns },
 *   method:    string                  // 分析方法讲解
 * }
 */
(function (global) {
  'use strict';

  // 连接词表：sub = 从属连词（引出从句）；coord = 并列连词（并列分句）
  var CONNECTORS = [
    { w: 'because', t: 'sub' }, { w: 'although', t: 'sub' }, { w: 'though', t: 'sub' },
    { w: 'even though', t: 'sub' }, { w: 'even if', t: 'sub' }, { w: 'if', t: 'sub' },
    { w: 'unless', t: 'sub' }, { w: 'when', t: 'sub' }, { w: 'while', t: 'sub' },
    { w: 'whereas', t: 'sub' }, { w: 'since', t: 'sub' }, { w: 'after', t: 'sub' },
    { w: 'before', t: 'sub' }, { w: 'until', t: 'sub' }, { w: 'once', t: 'sub' },
    { w: 'that', t: 'sub' }, { w: 'which', t: 'sub' }, { w: 'who', t: 'sub' },
    { w: 'whom', t: 'sub' }, { w: 'whose', t: 'sub' }, { w: 'where', t: 'sub' },
    { w: 'why', t: 'sub' }, { w: 'as', t: 'sub' }, { w: 'as long as', t: 'sub' },
    { w: 'provided', t: 'sub' }, { w: 'whether', t: 'sub' },
    { w: 'and', t: 'coord' }, { w: 'but', t: 'coord' }, { w: 'or', t: 'coord' },
    { w: 'yet', t: 'coord' }, { w: 'for', t: 'coord' }, { w: 'so', t: 'coord' },
    { w: 'nor', t: 'coord' }
  ];

  // 逻辑信号词：阅读出题点常紧跟在这些词附近（同义替换 / 转折 / 因果）
  var SIGNAL_GROUPS = [
    { name: '转折对比', words: ['although', 'though', 'but', 'however', 'yet', 'nevertheless', 'while', 'whereas', 'in contrast', 'on the other hand', 'instead', 'rather'] },
    { name: '因果', words: ['because', 'since', 'as', 'for', 'therefore', 'thus', 'hence', 'so', 'consequently', 'as a result', 'due to', 'lead to', 'result in'] },
    { name: '递进补充', words: ['moreover', 'furthermore', 'in addition', 'besides', 'also', 'what is more'] },
    { name: '举例', words: ['for example', 'for instance', 'such as', 'like'] },
    { name: '顺序', words: ['first', 'second', 'third', 'finally', 'then', 'next'] },
    { name: '总结', words: ['in conclusion', 'in summary', 'overall', 'to sum up'] }
  ];
  var PRONOUNS = ['it', 'its', 'this', 'that', 'these', 'those', 'they', 'them', 'their', 'he', 'she', 'his', 'her', 'we', 'our', 'you', 'your'];

  // 高频同义替换考点组：考研阅读中常互相替换表达，看到组里一个词要联想到整组
  var SYNONYM_GROUPS = [
    { name: '重要', words: ['important', 'crucial', 'significant', 'vital', 'essential', 'key', 'major', 'critical'] },
    { name: '表明/显示', words: ['show', 'demonstrate', 'reveal', 'indicate', 'illustrate', 'reflect', 'suggest', 'prove'] },
    { name: '导致', words: ['cause', 'lead to', 'result in', 'trigger', 'bring about', 'give rise to', 'produce'] },
    { name: '增加', words: ['increase', 'rise', 'grow', 'surge', 'climb', 'expand', 'boost'] },
    { name: '减少', words: ['decrease', 'decline', 'fall', 'drop', 'reduce', 'shrink', 'cut'] },
    { name: '好处/益处', words: ['benefit', 'advantage', 'profit', 'gain', 'contribution', 'value'] },
    { name: '问题/困难', words: ['problem', 'issue', 'challenge', 'difficulty', 'obstacle', 'barrier', 'trouble'] },
    { name: '观点', words: ['view', 'opinion', 'belief', 'attitude', 'perspective', 'argument'] },
    { name: '改变', words: ['change', 'alter', 'modify', 'shift', 'transform', 'convert'] },
    { name: '使用', words: ['use', 'utilize', 'employ', 'adopt', 'apply', 'exploit'] },
    { name: '理解', words: ['understand', 'comprehend', 'realize', 'recognize', 'perceive'] },
    { name: '支持', words: ['support', 'back', 'advocate', 'approve', 'favor', 'promote'] },
    { name: '限制', words: ['limit', 'restrict', 'constrain', 'bound', 'cap', 'control'] },
    { name: '不同/多样', words: ['different', 'diverse', 'various', 'distinct', 'varied'] },
    { name: '影响', words: ['affect', 'influence', 'impact', 'effect'] },
    { name: '困难/复杂', words: ['difficult', 'hard', 'tough', 'demanding', 'complex'] },
    { name: '传统的', words: ['traditional', 'conventional', 'classic', 'old'] },
    { name: '大量的', words: ['many', 'numerous', 'massive', 'enormous', 'a lot of', 'vast'] }
  ];

  function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  // 连接词按长度降序，便于「最长优先」匹配（如 as long as 先于 as）
  var CONN_SORTED = CONNECTORS.slice().sort(function (a, b) { return b.w.length - a.w.length; });

  function buildConnectorRegex() {
    var map = {};
    CONN_SORTED.forEach(function (c) { map[c.w.toLowerCase()] = c.t; });
    var re = new RegExp('\\b(' + CONN_SORTED.map(function (c) { return escapeRegExp(c.w); }).join('|') + ')\\b', 'gi');
    return { re: re, map: map };
  }

  // 判断 chunk 是否以某个连接词开头，返回该连接词对象或 null
  function leadingConnector(chunk) {
    var low = chunk.toLowerCase();
    for (var i = 0; i < CONN_SORTED.length; i++) {
      var w = CONN_SORTED[i].w;
      if (low.indexOf(w) === 0 && !/[a-z]/.test(low.charAt(w.length))) return CONN_SORTED[i];
    }
    return null;
  }

  function cleanToken(tok) {
    var s = String(tok).toLowerCase().replace(/^[^\w']+|[^\w']+$/g, '');
    return s;
  }

  function analyze(text) {
    text = (text || '').replace(/\s+/g, ' ').trim();
    var result = { clauses: [], testWords: [], synonyms: [], stats: null, method: '' };
    if (!text) return result;

    var DICT_MAP = (global.DICTIONARY || []).reduce(function (m, d) { m[d.w.toLowerCase()] = d; return m; }, {});

    // 1) 连接词切分从句（正确处理「Although X, Y」等主从结构）
    var c = buildConnectorRegex();
    var matches = [];
    var m;
    while ((m = c.re.exec(text)) !== null) {
      matches.push({ idx: m.index, len: m[0].length, word: m[0], type: c.map[m[0].toLowerCase()] || 'sub' });
      if (m.index === c.re.lastIndex) c.re.lastIndex++; // 防零宽死循环
    }
    if (matches.length === 0) {
      result.clauses.push({ text: text, type: 'main', intro: null });
    } else {
      var splits = [0];
      matches.forEach(function (mt) {
        var isBoundary = (mt.idx === 0);
        if (!isBoundary) {
          var j = mt.idx - 1;
          while (j >= 0 && /\s/.test(text[j])) j--;
          if (j >= 0 && text[j] === ',') isBoundary = true; // 连词前是逗号 → 顶层切分点
        }
        if (mt.type === 'coord') isBoundary = true; // 并列连词（and/but/or…）总是切分
        if (isBoundary) {
          splits.push(mt.idx);
          if (mt.type === 'sub') {
            // 从属连词引导的从句在其后第一个逗号处结束，逗号之后另起主句
            var comma = text.indexOf(',', mt.idx + mt.len);
            if (comma >= 0) splits.push(comma + 1);
          }
        }
      });
      splits = splits.filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(function (a, b) { return a - b; });
      for (var s = 0; s < splits.length; s++) {
        var sStart = splits[s];
        var sEnd = (s + 1 < splits.length) ? splits[s + 1] : text.length;
        if (sEnd <= sStart) continue;
        var chunk = text.slice(sStart, sEnd).replace(/^[\s,;:.]+/, '').trim();
        if (!chunk) continue;
        var lead = leadingConnector(chunk);
        result.clauses.push({ text: chunk, type: lead ? lead.t : 'main', intro: lead ? lead.w : null });
      }
    }

    // 2) 考点词（命中本地词库）+ 同义替换组
    var tokens = text.split(' ');
    var seenTest = {};
    var cleanList = [];
    tokens.forEach(function (tok) {
      var s = cleanToken(tok);
      if (!s) return;
      cleanList.push(s);
      if (DICT_MAP[s] && !seenTest[s]) {
        seenTest[s] = true;
        result.testWords.push({ word: DICT_MAP[s].w, c: DICT_MAP[s].c });
      }
    });

    SYNONYM_GROUPS.forEach(function (g) {
      var hits = g.words.filter(function (w) { return cleanList.indexOf(w.toLowerCase()) >= 0; });
      if (hits.length > 0) {
        result.synonyms.push({ name: g.name, group: g.words, hits: hits });
      }
    });

    // 4) 句子统计：难度 / 连接词清单 / 逻辑信号 / 句式特征 / 代词
    var stats = { wordCount: 0, clauseCount: result.clauses.length, difficulty: '', connectors: [], signals: [], features: [], pronouns: [] };
    var rawTokens = text.split(/\s+/).filter(Boolean);
    stats.wordCount = rawTokens.length;
    // 连接词清单（去重）
    var connSeen = {};
    (result.clauses || []).forEach(function (cl) { if (cl.intro && !connSeen[cl.intro]) { connSeen[cl.intro] = true; stats.connectors.push(cl.intro); } });
    // 逻辑信号词（去重，按组归纳）
    var lowText = ' ' + text.toLowerCase().replace(/[^a-z\s]/g, ' ') + ' ';
    SIGNAL_GROUPS.forEach(function (g) {
      var hits = [];
      g.words.forEach(function (w) {
        var re = new RegExp('\\b' + escapeRegExp(w) + '\\b', 'i');
        if (re.test(lowText) && hits.indexOf(w) < 0) hits.push(w);
      });
      if (hits.length) stats.signals.push({ name: g.name, hits: hits });
    });
    // 句式特征
    var feats = [];
    if (/,\s*[^,.;]+,\s+/.test(text)) feats.push('含插入语（双逗号间成分可先跳过）');
    if (/^\s*(never|seldom|rarely|hardly|scarcely|not only|not until|no sooner|only)\b/i.test(text)) feats.push('倒装结构（句首否定/限定词）');
    if (/it\s+is\s+[^.,;]{1,40}?\bthat\b/i.test(text)) feats.push('强调句 It is … that（强调对象是考点）');
    if (/\b(is|are|was|were|been|being)\s+\w{3,}ed\b/i.test(text)) feats.push('含被动语态（注意动作承受者）');
    if (/\b(if|wish|would rather)\b/i.test(text) && /\b(would|could|had|were)\b/i.test(text)) feats.push('疑似虚拟语气（表假设/非现实）');
    if (/\b(not only|both|either|neither|whether)\b/i.test(text)) feats.push('含并列结构（not only…but also / both…and 类）');
    if (/,\s*(such as|including|especially|particularly)\b/i.test(text)) feats.push('含举例/特指插入（such as / including）');
    if (/\b(i|we|you)\b/i.test(text)) feats.push('含第一/二人称（作者观点或读者引导）');
    stats.features = feats.slice(0, 4);
    // 代词
    var proSeen = {};
    rawTokens.forEach(function (tok) {
      var s = cleanToken(tok);
      if (s && PRONOUNS.indexOf(s) >= 0 && !proSeen[s]) { proSeen[s] = true; stats.pronouns.push(s); }
    });
    // 难度评估
    var score = 0;
    if (stats.wordCount > 30) score += 2; else if (stats.wordCount > 18) score += 1;
    if (result.clauses.length >= 3) score += 2; else if (result.clauses.length === 2) score += 1;
    if (stats.features.length >= 2) score += 1;
    stats.difficulty = score >= 4 ? '困难' : (score >= 2 ? '中等' : '简单');
    result.stats = stats;

    // 5) 分析方法讲解
    result.method =
      '长难句拆解四步法：\n' +
      '① 找主干：先抓「主句」(不被从属连词引出的部分) 的主谓宾，忽略修饰，把握句子核心意思。\n' +
      '② 切从句：遇到 because / although / when / which / that 等连接词就切一刀，标出它是「主句 / 从句 / 并列分句」。\n' +
      '③ 辨修饰：定语从句(which/who)、状语从句(时间/原因/让步)、插入语，都是为细节服务，先跳过不影响主干。\n' +
      '④ 攻考点：圈出高频「考点词」并联想其同义替换——考研阅读常把原文词换成同义词来设题，能替换才能做对。';

    return result;
  }

  global.SentenceAnalyzer = { analyze: analyze, CONNECTORS: CONNECTORS, SYNONYM_GROUPS: SYNONYM_GROUPS, SIGNAL_GROUPS: SIGNAL_GROUPS };
})(typeof window !== 'undefined' ? window : this);
