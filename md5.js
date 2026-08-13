  1→/* md5.js — 本地 MD5 实现（无依赖、离线可用）
  2→ * 用途：百度翻译开放平台 sign = md5(appid + q + salt + key) 的本地签名。
  3→ * 暴露 window.md5(str) -> 32 位小写十六进制字符串，UTF-8 安全。
  4→ * 算法为标准 RFC 1321 MD5；与任意在线 MD5 工具结果一致。
  5→ */
  6→(function (global) {
  7→  'use strict';
  8→
  9→  function safeAdd(x, y) {
 10→    var lsw = (x & 0xffff) + (y & 0xffff);
 11→    var msw = (x >> 16) + (y >> 16) + (lsw >> 16);
 12→    return (msw << 16) | (lsw & 0xffff);
 13→  }
 14→  function rol(num, cnt) { return (num << cnt) | (num >>> (32 - cnt)); }
 15→  function cmn(q, a, b, x, s, t) {
 16→    return safeAdd(rol(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b);
 17→  }
 18→  function ff(a, b, c, d, x, s, t) { return cmn((b & c) | (~b & d), a, b, x, s, t); }
 19→  function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & ~d), a, b, x, s, t); }
 20→  function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
 21→  function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | ~d), a, b, x, s, t); }
 22→
 23→  function md5cycle(x, k) {
 24→    var a = x[0], b = x[1], c = x[2], d = x[3];
 25→    a = ff(a, b, c, d, k[0], 7, -680876936);
 26→    d = ff(d, a, b, c, k[1], 12, -389564586);
 27→    c = ff(c, d, a, b, k[2], 17, 606105819);
 28→    b = ff(b, c, d, a, k[3], 22, -1044525330);
 29→    a = ff(a, b, c, d, k[4], 7, -176418897);
 30→    d = ff(d, a, b, c, k[5], 12, 1200080426);
 31→    c = ff(c, d, a, b, k[6], 17, -1473231341);
 32→    b = ff(b, c, d, a, k[7], 22, -45705983);
 33→    a = ff(a, b, c, d, k[8], 7, 1770035416);
 34→    d = ff(d, a, b, c, k[9], 12, -1958414417);
 35→    c = ff(c, d, a, b, k[10], 17, -42063);
 36→    b = ff(b, c, d, a, k[11], 22, -1990404162);
 37→    a = ff(a, b, c, d, k[12], 7, 1804603682);
 38→    d = ff(d, a, b, c, k[13], 12, -40341101);
 39→    c = ff(c, d, a, b, k[14], 17, -1502002290);
 40→    b = ff(b, c, d, a, k[15], 22, 1236535329);
 41→
 42→    a = gg(a, b, c, d, k[1], 5, -165796510);
 43→    d = gg(d, a, b, c, k[6], 9, -1069501632);
 44→    c = gg(c, d, a, b, k[11], 14, 643717713);
 45→    b = gg(b, c, d, a, k[0], 20, -373897302);
 46→    a = gg(a, b, c, d, k[5], 5, -701558691);
 47→    d = gg(d, a, b, c, k[10], 9, 38016083);
 48→    c = gg(c, d, a, b, k[15], 14, -660478335);
 49→    b = gg(b, c, d, a, k[4], 20, -405537848);
 50→    a = gg(a, b, c, d, k[9], 5, 568446438);
 51→    d = gg(d, a, b, c, k[14], 9, -1019803690);
 52→    c = gg(c, d, a, b, k[3], 14, -187363961);
 53→    b = gg(b, c, d, a, k[8], 20, 1163531501);
 54→    a = gg(a, b, c, d, k[13], 5, -1444681467);
 55→    d = gg(d, a, b, c, k[2], 9, -51403784);
 56→    c = gg(c, d, a, b, k[7], 14, 1735328473);
 57→    b = gg(b, c, d, a, k[12], 20, -1926607734);
 58→
 59→    a = hh(a, b, c, d, k[5], 4, -378558);
 60→    d = hh(d, a, b, c, k[8], 11, -2022574463);
 61→    c = hh(c, d, a, b, k[11], 16, 1839030562);
 62→    b = hh(b, c, d, a, k[14], 23, -35309556);
 63→    a = hh(a, b, c, d, k[1], 4, -1530992060);
 64→    d = hh(d, a, b, c, k[4], 11, 1272893353);
 65→    c = hh(c, d, a, b, k[7], 16, -155497632);
 66→    b = hh(b, c, d, a, k[10], 23, -1094730640);
 67→    a = hh(a, b, c, d, k[13], 4, 681279174);
 68→    d = hh(d, a, b, c, k[0], 11, -358537222);
 69→    c = hh(c, d, a, b, k[3], 16, -722521979);
 70→    b = hh(b, c, d, a, k[6], 23, 76029189);
 71→    a = hh(a, b, c, d, k[9], 4, -640364487);
 72→    d = hh(d, a, b, c, k[12], 11, -421815835);
 73→    c = hh(c, d, a, b, k[15], 16, 530742520);
 74→    b = hh(b, c, d, a, k[2], 23, -995338651);
 75→
 76→    a = ii(a, b, c, d, k[0], 6, -198630844);
 77→    d = ii(d, a, b, c, k[7], 10, 1126891415);
 78→    c = ii(c, d, a, b, k[14], 15, -1416354905);
 79→    b = ii(b, c, d, a, k[5], 21, -57434055);
 80→    a = ii(a, b, c, d, k[12], 6, 1700485571);
 81→    d = ii(d, a, b, c, k[3], 10, -1894986606);
 82→    c = ii(c, d, a, b, k[10], 15, -1051523);
 83→    b = ii(b, c, d, a, k[1], 21, -2054922799);
 84→    a = ii(a, b, c, d, k[8], 6, 1873313359);
 85→    d = ii(d, a, b, c, k[15], 10, -30611744);
 86→    c = ii(c, d, a, b, k[6], 15, -1560198380);
 87→    b = ii(b, c, d, a, k[13], 21, 1309151649);
 88→    a = ii(a, b, c, d, k[4], 6, -145523070);
 89→    d = ii(d, a, b, c, k[11], 10, -1120210379);
 90→    c = ii(c, d, a, b, k[2], 15, 718787259);
 91→    b = ii(b, c, d, a, k[9], 21, -343485551);
 92→
 93→    x[0] = safeAdd(a, x[0]);
 94→    x[1] = safeAdd(b, x[1]);
 95→    x[2] = safeAdd(c, x[2]);
 96→    x[3] = safeAdd(d, x[3]);
 97→  }
 98→
 99→  function md5blk(s) {
100→    var md5blks = [], i;
101→    for (i = 0; i < 64; i += 4) {
102→      md5blks[i >> 2] = s.charCodeAt(i) + (s.charCodeAt(i + 1) << 8) + (s.charCodeAt(i + 2) << 16) + (s.charCodeAt(i + 3) << 24);
103→    }
104→    return md5blks;
105→  }
106→
107→  function md51(s) {
108→    var n = s.length, state = [1732584193, -271733879, -1732584194, 271733878], i;
109→    for (i = 64; i <= n; i += 64) {
110→      md5cycle(state, md5blk(s.substring(i - 64, i)));
111→    }
112→    s = s.substring(i - 64);
113→    var tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
114→    for (i = 0; i < s.length; i += 1) tail[i >> 2] |= s.charCodeAt(i) << ((i % 4) << 3);
115→    tail[i >> 2] |= 0x80 << ((i % 4) << 3);
116→    if (i > 55) {
117→      md5cycle(state, tail);
118→      for (i = 0; i < 16; i += 1) tail[i] = 0;
119→    }
120→    tail[14] = n * 8;
121→    md5cycle(state, tail);
122→    return state;
123→  }
124→
125→  function rhex(n) {
126→    var hexChr = '0123456789abcdef'.split('');
127→    var s = '', j;
128→    for (j = 0; j < 4; j += 1) s += hexChr[(n >> (j * 8 + 4)) & 0x0f] + hexChr[(n >> (j * 8)) & 0x0f];
129→    return s;
130→  }
131→  function hex(x) {
132→    var n, s = '';
133→    for (n = 0; n < x.length; n += 1) s += rhex(x[n]);
134→    return s;
135→  }
136→
137→  // UTF-8 安全：先把字符串转成 UTF-8 字节的二进制串，再做 MD5
138→  function md5(str) {
139→    var utf8 = unescape(encodeURIComponent(String(str)));
140→    return hex(md51(utf8));
141→  }
142→
143→  global.md5 = md5;
144→  if (typeof module !== 'undefined' && module.exports) module.exports = md5;
145→})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));