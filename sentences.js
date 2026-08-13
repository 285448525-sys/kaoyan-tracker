  1→/* sentences.js — 长难句分析（纯前端规则分析，无外部依赖、可离线）
  2→ * 对外暴露 window.SentenceAnalyzer.analyze(text) -> {
  3→ *   clauses:   [{text, type:'main'|'sub'|'coord', intro: 连接词|null}],
  4→ *   testWords: [{word, c}],            // 句中出现的本地词库「考点词」及释义
  5→ *   synonyms:  [{group, hits, note}],  // 命中「高频同义替换考点组」的归纳
  6→ *   method:    string                  // 分析方法讲解
  7→ * }
  8→ */
  9→(function (global) {
 10→  'use strict';
 11→
 12→  // 连接词表：sub = 从属连词（引出从句）；coord = 并列连词（并列分句）
 13→  var CONNECTORS = [
 14→    { w: 'because', t: 'sub' }, { w: 'although', t: 'sub' }, { w: 'though', t: 'sub' },
 15→    { w: 'even though', t: 'sub' }, { w: 'even if', t: 'sub' }, { w: 'if', t: 'sub' },
 16→    { w: 'unless', t: 'sub' }, { w: 'when', t: 'sub' }, { w: 'while', t: 'sub' },
 17→    { w: 'whereas', t: 'sub' }, { w: 'since', t: 'sub' }, { w: 'after', t: 'sub' },
 18→    { w: 'before', t: 'sub' }, { w: 'until', t: 'sub' }, { w: 'once', t: 'sub' },
 19→    { w: 'that', t: 'sub' }, { w: 'which', t: 'sub' }, { w: 'who', t: 'sub' },
 20→    { w: 'whom', t: 'sub' }, { w: 'whose', t: 'sub' }, { w: 'where', t: 'sub' },
 21→    { w: 'why', t: 'sub' }, { w: 'as', t: 'sub' }, { w: 'as long as', t: 'sub' },
 22→    { w: 'provided', t: 'sub' }, { w: 'whether', t: 'sub' },
 23→    { w: 'and', t: 'coord' }, { w: 'but', t: 'coord' }, { w: 'or', t: 'coord' },
 24→    { w: 'yet', t: 'coord' }, { w: 'for', t: 'coord' }, { w: 'so', t: 'coord' },
 25→    { w: 'nor', t: 'coord' }
 26→  ];
 27→
 28→  // 高频同义替换考点组：考研阅读中常互相替换表达，看到组里一个词要联想到整组
 29→  var SYNONYM_GROUPS = [
 30→    { name: '重要', words: ['important', 'crucial', 'significant', 'vital', 'essential', 'key', 'major', 'critical'] },
 31→    { name: '表明/显示', words: ['show', 'demonstrate', 'reveal', 'indicate', 'illustrate', 'reflect', 'suggest', 'prove'] },
 32→    { name: '导致', words: ['cause', 'lead to', 'result in', 'trigger', 'bring about', 'give rise to', 'produce'] },
 33→    { name: '增加', words: ['increase', 'rise', 'grow', 'surge', 'climb', 'expand', 'boost'] },
 34→    { name: '减少', words: ['decrease', 'decline', 'fall', 'drop', 'reduce', 'shrink', 'cut'] },
 35→    { name: '好处/益处', words: ['benefit', 'advantage', 'profit', 'gain', 'contribution', 'value'] },
 36→    { name: '问题/困难', words: ['problem', 'issue', 'challenge', 'difficulty', 'obstacle', 'barrier', 'trouble'] },
 37→    { name: '观点', words: ['view', 'opinion', 'belief', 'attitude', 'perspective', 'argument'] },
 38→    { name: '改变', words: ['change', 'alter', 'modify', 'shift', 'transform', 'convert'] },
 39→    { name: '使用', words: ['use', 'utilize', 'employ', 'adopt', 'apply', 'exploit'] },
 40→    { name: '理解', words: ['understand', 'comprehend', 'realize', 'recognize', 'perceive'] },
 41→    { name: '支持', words: ['support', 'back', 'advocate', 'approve', 'favor', 'promote'] },
 42→    { name: '限制', words: ['limit', 'restrict', 'constrain', 'bound', 'cap', 'control'] },
 43→    { name: '不同/多样', words: ['different', 'diverse', 'various', 'distinct', 'varied'] },
 44→    { name: '影响', words: ['affect', 'influence', 'impact', 'effect'] },
 45→    { name: '困难/复杂', words: ['difficult', 'hard', 'tough', 'demanding', 'complex'] },
 46→    { name: '传统的', words: ['traditional', 'conventional', 'classic', 'old'] },
 47→    { name: '大量的', words: ['many', 'numerous', 'massive', 'enormous', 'a lot of', 'vast'] }
 48→  ];
 49→
 50→  function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
 51→
 52→  // 连接词按长度降序，便于「最长优先」匹配（如 as long as 先于 as）
 53→  var CONN_SORTED = CONNECTORS.slice().sort(function (a, b) { return b.w.length - a.w.length; });
 54→
 55→  function buildConnectorRegex() {
 56→    var map = {};
 57→    CONN_SORTED.forEach(function (c) { map[c.w.toLowerCase()] = c.t; });
 58→    var re = new RegExp('\\b(' + CONN_SORTED.map(function (c) { return escapeRegExp(c.w); }).join('|') + ')\\b', 'gi');
 59→    return { re: re, map: map };
 60→  }
 61→
 62→  // 判断 chunk 是否以某个连接词开头，返回该连接词对象或 null
 63→  function leadingConnector(chunk) {
 64→    var low = chunk.toLowerCase();
 65→    for (var i = 0; i < CONN_SORTED.length; i++) {
 66→      var w = CONN_SORTED[i].w;
 67→      if (low.indexOf(w) === 0 && !/[a-z]/.test(low.charAt(w.length))) return CONN_SORTED[i];
 68→    }
 69→    return null;
 70→  }
 71→
 72→  function cleanToken(tok) {
 73→    var s = String(tok).toLowerCase().replace(/^[^\w']+|[^\w']+$/g, '');
 74→    return s;
 75→  }
 76→
 77→  function analyze(text) {
 78→    text = (text || '').replace(/\s+/g, ' ').trim();
 79→    var result = { clauses: [], testWords: [], synonyms: [], method: '' };
 80→    if (!text) return result;
 81→
 82→    var DICT_MAP = (global.DICTIONARY || []).reduce(function (m, d) { m[d.w.toLowerCase()] = d; return m; }, {});
 83→
 84→    // 1) 连接词切分从句（正确处理「Although X, Y」等主从结构）
 85→    var c = buildConnectorRegex();
 86→    var matches = [];
 87→    var m;
 88→    while ((m = c.re.exec(text)) !== null) {
 89→      matches.push({ idx: m.index, len: m[0].length, word: m[0], type: c.map[m[0].toLowerCase()] || 'sub' });
 90→      if (m.index === c.re.lastIndex) c.re.lastIndex++; // 防零宽死循环
 91→    }
 92→    if (matches.length === 0) {
 93→      result.clauses.push({ text: text, type: 'main', intro: null });
 94→    } else {
 95→      var splits = [0];
 96→      matches.forEach(function (mt) {
 97→        var isBoundary = (mt.idx === 0);
 98→        if (!isBoundary) {
 99→          var j = mt.idx - 1;
100→          while (j >= 0 && /\s/.test(text[j])) j--;
101→          if (j >= 0 && text[j] === ',') isBoundary = true; // 连词前是逗号 → 顶层切分点
102→        }
103→        if (mt.type === 'coord') isBoundary = true; // 并列连词（and/but/or…）总是切分
104→        if (isBoundary) {
105→          splits.push(mt.idx);
106→          if (mt.type === 'sub') {
107→            // 从属连词引导的从句在其后第一个逗号处结束，逗号之后另起主句
108→            var comma = text.indexOf(',', mt.idx + mt.len);
109→            if (comma >= 0) splits.push(comma + 1);
110→          }
111→        }
112→      });
113→      splits = splits.filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(function (a, b) { return a - b; });
114→      for (var s = 0; s < splits.length; s++) {
115→        var sStart = splits[s];
116→        var sEnd = (s + 1 < splits.length) ? splits[s + 1] : text.length;
117→        if (sEnd <= sStart) continue;
118→        var chunk = text.slice(sStart, sEnd).replace(/^[\s,;:.]+/, '').trim();
119→        if (!chunk) continue;
120→        var lead = leadingConnector(chunk);
121→        result.clauses.push({ text: chunk, type: lead ? lead.t : 'main', intro: lead ? lead.w : null });
122→      }
123→    }
124→
125→    // 2) 考点词（命中本地词库）+ 同义替换组
126→    var tokens = text.split(' ');
127→    var seenTest = {};
128→    var cleanList = [];
129→    tokens.forEach(function (tok) {
130→      var s = cleanToken(tok);
131→      if (!s) return;
132→      cleanList.push(s);
133→      if (DICT_MAP[s] && !seenTest[s]) {
134→        seenTest[s] = true;
135→        result.testWords.push({ word: DICT_MAP[s].w, c: DICT_MAP[s].c });
136→      }
137→    });
138→
139→    SYNONYM_GROUPS.forEach(function (g) {
140→      var hits = g.words.filter(function (w) { return cleanList.indexOf(w.toLowerCase()) >= 0; });
141→      if (hits.length > 0) {
142→        result.synonyms.push({ name: g.name, group: g.words, hits: hits });
143→      }
144→    });
145→
146→    // 3) 分析方法讲解
147→    result.method =
148→      '长难句拆解四步法：\n' +
149→      '① 找主干：先抓「主句」(不被从属连词引出的部分) 的主谓宾，忽略修饰，把握句子核心意思。\n' +
150→      '② 切从句：遇到 because / although / when / which / that 等连接词就切一刀，标出它是「主句 / 从句 / 并列分句」。\n' +
151→      '③ 辨修饰：定语从句(which/who)、状语从句(时间/原因/让步)、插入语，都是为细节服务，先跳过不影响主干。\n' +
152→      '④ 攻考点：圈出高频「考点词」并联想其同义替换——考研阅读常把原文词换成同义词来设题，能替换才能做对。';
153→
154→    return result;
155→  }
156→
157→  global.SentenceAnalyzer = { analyze: analyze, CONNECTORS: CONNECTORS, SYNONYM_GROUPS: SYNONYM_GROUPS };
158→})(typeof window !== 'undefined' ? window : this);