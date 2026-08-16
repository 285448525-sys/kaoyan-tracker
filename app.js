/* app.js — 主逻辑：配置 / 按模块计时 / 计划 / 今日总结分享 / 数据 / 错题 / 网站 */
(function () {
  'use strict';

  // 构建版本号：与 index.html 的 `?v=` 查询参数保持一致，用于破缓存 + 双源比对。
  var APP_VERSION = '20260816f';

  // ===== XSS 防护助手（B6 收敛）=====
  // 规则：渲染任何「用户或云端他人输入」的文本时，默认当作纯文本：
  //  - el(tag, cls, text)          → 第 3 参一律走 textContent（绝不解析为 HTML），覆盖所有叶子节点（模块名/计划/错词/生词…）。
  //  - setText(node, text)         → 显式文本写入（textContent）。
  //  - mountSafe(node, c, opts)    → 统一安全挂载：默认 textContent（强制转义）；仅当 opts.raw===true 且内容已 escapeHtml/来自可信静态模板时才走 innerHTML。
  // ⚠️ 现状（勿误读）：叶子节点已由 el() 全量收口为 textContent；但 app.js 内仍存在直接 `.innerHTML =` 的
  //    列表级渲染（清空 '' / 可信静态模板 / 已 escapeHtml 的拼接串），这些经审计均安全，尚未逐处改写为 mountSafe。
  //    新增代码请遵守：拼接用户数据的 innerHTML 必须先 escapeHtml；能用 el()/setText 就不要用 innerHTML。
  // ⚠️ 反向陷阱：既然 el()/setText/mountSafe(默认) 走 textContent，传入前【不要】再 escapeHtml，
  //    否则实体会被字面显示（曾致数学闪卡把 x>0 显示成 x&gt;0）。escapeHtml 只用于 innerHTML 拼接场景。
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = String(text);
    return e;
  }
  function setText(node, text) {
    if (!node) return;
    node.textContent = (text === undefined || text === null) ? '' : String(text);
  }
  // 统一安全挂载：默认把内容当纯文本（textContent，防 XSS）；raw:true 才走 innerHTML（调用方须保证已 escapeHtml）。
  function mountSafe(node, content, opts) {
    if (!node) return node;
    opts = opts || {};
    var val = (content === undefined || content === null) ? '' : String(content);
    if (opts.raw) node.innerHTML = val;
    else node.textContent = val;
    return node;
  }
  function $(id) { return document.getElementById(id); }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function fmt(ms) {
    var s = Math.floor(ms / 1000);
    return pad(Math.floor(s / 3600)) + ':' + pad(Math.floor((s % 3600) / 60)) + ':' + pad(s % 60);
  }

  var refs = {};
  var timerInterval = null;
  var toastTimer = null;
  var selectedType = '今日感悟';
  var heatYear = new Date().getFullYear();
  var heatMonth = new Date().getMonth();

  // 词汇模块：本地词库 + 记忆曲线状态
  var DICT = (typeof window !== 'undefined' && window.DICTIONARY) ? window.DICTIONARY : [];
  var DICT_MAP = {};
  DICT.forEach(function (d) { DICT_MAP[d.w.toLowerCase()] = d; });
  var practiceSession = null; // {items, index, answered}
  var reviewQueue = null;     // {items, index, total}
  var reviewMode = 'review';  // 'review' | 'practice'（复习/自测 tab 内的子模式）
  var LEITNER = [1, 2, 4, 7, 15]; // box 1..5 -> 间隔天数
  function escapeHtml(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]); }); }
  function shuffle(a){ for(var i=a.length-1;i>0;i--){ var j=Math.floor(Math.random()*(i+1)); var t=a[i];a[i]=a[j];a[j]=t; } return a; }
  function nextReviewDate(box){ var days = LEITNER[Math.max(0, Math.min(4, (box||1)-1))]; return Store.dateStr(Store.addDays(new Date(), days)); }

  // ===== 共享助手（用于消除重复实现，勿在各函数内再复制一份） =====
  // 取某科目最近一次有记录的模考分：原先在 renderSubjectStats / renderRadarCard 内各写了一份
  function latestScoreIn(exams, key) {
    for (var i = exams.length - 1; i >= 0; i--) {
      if (exams[i].scores && exams[i].scores[key] !== undefined) return exams[i].scores[key];
    }
    return null;
  }
  var MISTAKE_TYPES = ['今日感悟', '刷题时遇到的问题', '知识点盲区', '易错点', '其他'];
  // 错题本科目：固定丰富列表，并与用户配置的考试科目合并去重（修复「科目无法选择」缺陷）
  var MISTAKE_SUBJECTS = ['阅读', '完形', '翻译', '写作', '语法', '词汇', '听力', '口语', '政治', '数学', '专业课'];
  var CURATED = [
    { cat: '官方 / 资讯', items: [
      { name: '中国研究生招生信息网（研招网）', url: 'https://yz.chsi.com.cn', desc: '报名、调剂、分数线官方平台' },
      { name: '学信网', url: 'https://www.chsi.com.cn', desc: '学籍学历查询' }
    ]},
    { cat: '网课 / MOOC', items: [
      { name: '哔哩哔哩', url: 'https://www.bilibili.com', desc: '大量免费考研网课与经验视频' },
      { name: '中国大学MOOC', url: 'https://www.icourse163.org', desc: '名校公开课' },
      { name: '网易公开课', url: 'https://open.163.com', desc: '公开课资源' },
      { name: '学堂在线', url: 'https://www.xuetangx.com', desc: '清华等高校课程' }
    ]},
    { cat: '计算机专属', items: [
      { name: '王道论坛', url: 'https://www.cskaoyan.com', desc: '408 计算机考研资料与经验' },
      { name: '牛客网', url: 'https://www.nowcoder.com', desc: '刷题与笔试面试' }
    ]},
    { cat: '资料 / 工具', items: [
      { name: '百度网盘', url: 'https://pan.baidu.com', desc: '资料存储与分享' },
      { name: '考研帮', url: 'https://kaoyan.com', desc: '经验帖与院校信息' }
    ]}
  ];

  /* ============ 学习计划 / 数学模块：常量 ============ */
  // 考研数学全套章节（带分组前缀「分组 · 章节名」，预填充）
  var MATH_CHAPTERS_PREFILL = [
    '高数 · 函数、极限、连续',
    '高数 · 一元函数微分学（导数与微分）',
    '高数 · 微分中值定理与导数应用',
    '高数 · 不定积分',
    '高数 · 定积分与反常积分',
    '高数 · 多元函数微积分学',
    '高数 · 无穷级数',
    '高数 · 常微分方程',
    '高数 · 向量代数与空间解析几何',
    '线代 · 行列式',
    '线代 · 矩阵',
    '线代 · 向量组的线性相关性',
    '线代 · 线性方程组',
    '线代 · 特征值与特征向量',
    '线代 · 二次型',
    '概率 · 随机事件与概率',
    '概率 · 随机变量及其分布',
    '概率 · 多维随机变量',
    '概率 · 随机变量的数字特征',
    '概率 · 大数定律与中心极限定理',
    '概率 · 数理统计的基本概念',
    '概率 · 参数估计',
    '概率 · 假设检验'
  ];
  var MATH_MISTAKE_CATS = ['概念不清', '计算错误', '思路错误', '审题失误', '公式遗忘', '综合大题', '其他'];
  // 数学分类选择题内置示例题库（与用户自定义题同结构）
  var MATH_BUILTIN_Q = [
    { category: '高等数学', q: '函数 f(x)=x³ 在 x=0 处的导数是？', options: ['0', '1', '3', '不存在'], answer: 0, explain: "f'(x)=3x²，故 f'(0)=0。" },
    { category: '高等数学', q: '∫₀¹ 2x dx 的值是？', options: ['1', '2', '0.5', '4'], answer: 0, explain: '原函数为 x²，代入得 1-0=1。' },
    { category: '高等数学', q: 'lim(x→0) sin(x)/x 等于？', options: ['0', '1', '∞', '不存在'], answer: 1, explain: '重要极限，结果为 1。' },
    { category: '高等数学', q: '微分方程 dy/dx = y 的通解是？', options: ['y=Ceˣ', 'y=Cx', 'y=Ce⁻ˣ', 'y=C/x'], answer: 0, explain: '分离变量积分得 y=Ceˣ。' },
    { category: '线性代数', q: 'n 阶单位矩阵 I 的行列式 det(I) 等于？', options: ['0', '1', 'n', '-1'], answer: 1, explain: '单位矩阵行列式恒为 1。' },
    { category: '线性代数', q: '若 A 为 n 阶可逆矩阵，则 rank(A) = ？', options: ['0', 'n', '小于 n', '1'], answer: 1, explain: '可逆矩阵满秩，秩为 n。' },
    { category: '线性代数', q: '两个 n 阶矩阵 A、B 可交换指的是？', options: ['AB=BA', 'A+B=B+A', 'AB=0', 'A=B'], answer: 0, explain: '矩阵乘法一般不交换，可交换特指 AB=BA。' },
    { category: '概率统计', q: '掷一枚均匀硬币两次，至少出现一次正面的概率是？', options: ['1/4', '1/2', '3/4', '1'], answer: 2, explain: '总 4 种等可能，仅「反反」无正面，故 3/4。' },
    { category: '概率统计', q: '若 X ~ N(0,1)（标准正态分布），则 E(X) = ？', options: ['0', '1', '-1', '0.5'], answer: 0, explain: '标准正态均值为 0。' }
  ];
  var GROUP_COLORS = { '高数': '#4f46e5', '线代': '#10b981', '概率': '#f59e0b', '其他': '#9ca3af' };

  /* ============ 408 专业课模块：常量 ============ */
  // 408 计算机学科专业基础全套章节（按四科分组，预填充）
  var CS408_CHAPTERS_PREFILL = [
    '数据结构 · 线性表',
    '数据结构 · 栈与队列',
    '数据结构 · 树与二叉树',
    '数据结构 · 图',
    '数据结构 · 查找',
    '数据结构 · 排序',
    '计算机组成原理 · 计算机系统概述',
    '计算机组成原理 · 数据的表示与运算',
    '计算机组成原理 · 存储器层次结构',
    '计算机组成原理 · 指令系统',
    '计算机组成原理 · 中央处理器（CPU）',
    '计算机组成原理 · 总线与 I/O 系统',
    '操作系统 · 操作系统概述',
    '操作系统 · 进程与线程管理',
    '操作系统 · 内存管理',
    '操作系统 · 文件管理',
    '操作系统 · I/O 管理',
    '计算机网络 · 体系结构（OSI / TCP-IP）',
    '计算机网络 · 物理层',
    '计算机网络 · 数据链路层',
    '计算机网络 · 网络层',
    '计算机网络 · 传输层',
    '计算机网络 · 应用层'
  ];
  var CS408_GROUP_COLORS = { '数据结构': '#3b82f6', '计算机组成原理': '#8b5cf6', '操作系统': '#10b981', '计算机网络': '#f59e0b', '其他': '#9ca3af' };
  var CS408_MISTAKE_CATS = ['概念不清', '计算错误', '思路错误', '代码实现', '易混淆', '综合大题', '其他'];
  // 408 内置示例选择题
  var CS408_BUILTIN_Q = [
    { category: '数据结构', q: '在长度为 n 的有序顺序表中进行折半查找，最坏时间复杂度是？', options: ['O(1)', 'O(log₂n)', 'O(n)', 'O(n²)'], answer: 1, explain: '折半查找每次排除一半，最坏 O(log₂n)。' },
    { category: '数据结构', q: '一棵有 n 个结点的二叉树，最小高度为？', options: ['⌊log₂n⌋', '⌈log₂(n+1)⌉', 'n/2', 'n-1'], answer: 1, explain: '完全二叉树高度最小，为 ⌈log₂(n+1)⌉。' },
    { category: '数据结构', q: '快速排序的平均时间复杂度是？', options: ['O(n)', 'O(n log n)', 'O(n²)', 'O(log n)'], answer: 1, explain: '快排平均 O(n log n)，最坏 O(n²)。' },
    { category: '计算机组成原理', q: 'IEEE 754 单精度浮点数的尾数位数（不含隐藏位）是？', options: ['23 位', '24 位', '52 位', '8 位'], answer: 0, explain: '单精度 1+8+23=32 位，尾数 23 位（加隐藏位共 24 位有效）。' },
    { category: '计算机组成原理', q: 'Cache 命中率与缺失率的描述，正确的是？', options: ['命中率 + 缺失率 = 1', '命中率 = 缺失率', '命中率恒为 1', '缺失率恒为 0'], answer: 0, explain: '命中率与缺失率互补，和为 1。' },
    { category: '操作系统', q: '进程的三个基本状态不包括？', options: ['就绪', '运行', '阻塞', '挂起'], answer: 3, explain: '三态为就绪、运行、阻塞；挂起属于中级调度范畴。' },
    { category: '操作系统', q: '页面置换算法 LRU 是指？', options: ['先进先出', '最近最久未使用', '最不经常使用', '最佳置换'], answer: 1, explain: 'LRU = Least Recently Used，淘汰最近最久未访问的页。' },
    { category: '计算机网络', q: 'TCP 三次握手中，第二次握手报文的标志位是？', options: ['SYN', 'ACK', 'SYN+ACK', 'FIN'], answer: 2, explain: '服务端回复 SYN+ACK 表示同意连接并确认。' },
    { category: '计算机网络', q: 'CIDR 地址 192.168.1.0/26 的可用主机数是？', options: ['62', '64', '254', '32'], answer: 0, explain: '/26 子网共 64 地址，减去网络号和广播号，可用 62。' }
  ];
  // 408 知识点速查卡预填示例
  var CS408_KNOWLEDGE_PREFILL = [
    { subject: '数据结构', title: '各种排序算法复杂度', content: '冒泡/选择/插入：O(n²)；快排/归并/堆排：O(n log n)。快排最坏 O(n²)，归并稳定。' },
    { subject: '数据结构', title: '二叉树遍历', content: '前序(根左右)、中序(左根右)、后序(左右根)。已知前序+中序可唯一确定二叉树。' },
    { subject: '计算机组成原理', title: '浮点数表示', content: 'IEEE754 单精度：1 符号 + 8 阶码(偏移127) + 23 尾数。隐藏最高位 1。' },
    { subject: '操作系统', title: '死锁四条件', content: '互斥、占有并等待、不剥夺、循环等待。破坏任一即可预防死锁。' },
    { subject: '操作系统', title: '进程与线程区别', content: '进程是资源分配单位，线程是 CPU 调度单位。同进程线程共享地址空间。' },
    { subject: '计算机网络', title: 'TCP/UDP 区别', content: 'TCP 面向连接、可靠、有序；UDP 无连接、不可靠、高效。TCP 首部 20B，UDP 8B。' }
  ];

  /* ============ 配置页 ============ */
  var SUBJECT_PRESETS = [
    { key: 'politics', label: '政治', defName: '政治', defTarget: 75 },
    { key: 'english', label: '英语', defName: '英语一', defTarget: 70, variants: ['英语一', '英语二'] },
    { key: 'math', label: '数学', defName: '数学一', defTarget: 120, variants: ['数学一', '数学二', '数学三'] },
    { key: 'cs408', label: '408 计算机专业基础', defName: '408', defTarget: 120, noMajorKey: true },
    { key: 'major', label: '其他专业课', defName: '专业课', defTarget: 120, editableName: true }
  ];

  function renderConfig() {
    var cfg = Store.getConfig();
    refs.majorSelect.value = cfg.major || '';
    refs.nicknameInput.value = cfg.nickname || '';
    refs.examDate.value = cfg.examDate || '';
    refs.targetTotal.value = cfg.targetTotal || '';
    refs.autoPlan.checked = !!cfg.autoPlan;

    refs.toggles.innerHTML = '';
    SUBJECT_PRESETS.forEach(function (p) {
      refs.toggles.appendChild(renderConfigSubjectRow(p));
    });
    refs.detail.innerHTML = '';
    var subs = Store.getSubjects();
    if (!subs.length) { refs.detail.appendChild(el('div', 'empty-hint', '请先勾选上方考试科目')); return; }
    subs.forEach(function (s) {
      var row = el('div', 'detail-row');
      row.appendChild(el('span', 'detail-name', s.name));
      var lbl = el('label', 'detail-target');
      lbl.appendChild(el('span', null, '目标分'));
      var inp = el('input'); inp.type = 'number'; inp.min = '0'; inp.value = s.target || 0; inp.className = 'target-input';
      inp.addEventListener('change', function () { Store.updateSubjectTarget(s.key, Number(inp.value) || 0); });
      lbl.appendChild(inp);
      row.appendChild(lbl);
      refs.detail.appendChild(row);
    });
    renderScoreWeights();
  }

  // 配置页单个科目行；数学 / 408 这类带子结构的科目支持展开 / 收起子树
  function renderConfigSubjectRow(p) {
    var has = Store.getSubjects().some(function (s) { return s.key === p.key; });
    var isStructured = (p.key === 'math' || p.key === 'cs408');
    var expState = Store.getConfig().subjectExpanded || {};
    var expanded = !!expState[p.key];

    var row = el('div', 'toggle-row' + (isStructured ? ' structured' : ''));
    var cb = el('input'); cb.type = 'checkbox'; cb.checked = has;
    cb.addEventListener('change', function () { onToggleSubject(p, cb.checked); });
    row.appendChild(cb);
    row.appendChild(el('span', 'toggle-label', p.label));

    if (isStructured && has) {
      var summary = el('span', 'subject-summary');
      if (p.key === 'math') {
        var cur = Store.getSubjects().filter(function (s) { return s.key === 'math'; })[0];
        summary.textContent = '（' + (cur ? cur.name : Store.getMathVolume()) + '）已选';
      } else {
        summary.textContent = '（4 本）已选';
      }
      var caret = el('span', 'subject-caret', expanded ? '▾' : '▸');
      var toggleExpand = function () {
        var st = Store.getConfig().subjectExpanded || {};
        st[p.key] = !st[p.key];
        Store.setConfig({ subjectExpanded: st });
        renderConfig();
      };
      summary.addEventListener('click', toggleExpand);
      caret.addEventListener('click', toggleExpand);
      row.appendChild(summary);
      row.appendChild(caret);

      if (expanded) {
        var sub = el('div', 'subject-subtree');
        if (p.key === 'math') {
          sub.appendChild(el('div', 'subtree-hint', '选择卷种会按新大纲重置章节（同名已完成章保留）：'));
          var vols = Object.keys(Store.getMathVolumeTemplates());
          var curVol = Store.getMathVolume();
          var volRow = el('div', 'field-row');
          volRow.appendChild(el('label', null, '数学卷种'));
          var sel = el('select');
          sel.className = 'mv-select';
          vols.forEach(function (v) {
            var opt = el('option'); opt.value = v; opt.textContent = v; opt.selected = (v === curVol);
            sel.appendChild(opt);
          });
          sel.addEventListener('change', function () {
            var v = sel.value;
            if (v === Store.getMathVolume()) return;
            if (!confirm('切换为「' + v + '」会按新大纲重置数学章节：同名已完成章节保留，新大纲没有的章节进度丢弃。确定切换？')) { renderConfig(); return; }
            Store.setMathVolume(v);
            renderConfig(); renderMathChapters(); renderSubjectChapters(); renderAggSubjectProgress();
            showToast('已切换卷种：' + v, 'ok');
          });
          volRow.appendChild(sel);
          sub.appendChild(volRow);
        } else {
          var groups = {};
          Store.get408Chapters().forEach(function (ch) { var g = parseChapter(ch).g; groups[g] = (groups[g] || 0) + 1; });
          var gk = Object.keys(groups);
          if (!gk.length) gk = ['数据结构', '计算机组成原理', '操作系统', '计算机网络'];
          gk.forEach(function (g) { sub.appendChild(el('div', 'subtree-book', g + '：' + (groups[g] || 0) + ' 章')); });
          var go = el('button', 'btn btn-ghost btn-sm subtree-goto', '前往 408 标签页管理 →');
          go.addEventListener('click', function () {
            var tabBtn = document.querySelector('.tab-btn[data-tab="cs408"]');
            if (tabBtn) tabBtn.click();
          });
          sub.appendChild(go);
        }
        row.appendChild(sub);
      }
    } else {
      if (p.variants) {
        var sel = el('select'); sel.className = 'variant-select';
        p.variants.forEach(function (v) { var o = el('option'); o.value = v; o.textContent = v; sel.appendChild(o); });
        sel.value = has ? Store.getSubjects().find(function (s) { return s.key === p.key; }).name : p.defName;
        sel.disabled = !has;
        sel.addEventListener('change', function () {
          if (has) { var s = Store.getSubjects().find(function (x) { return x.key === p.key; }); s.name = sel.value; Store.save(); renderConfig(); }
        });
        row.appendChild(sel);
      }
      if (p.editableName && has) {
        var inp = el('input'); inp.className = 'name-input'; inp.value = Store.getSubjects().find(function (s) { return s.key === p.key; }).name;
        inp.placeholder = '专业课名称';
        inp.addEventListener('change', function () {
          var s = Store.getSubjects().find(function (x) { return x.key === p.key; }); s.name = inp.value || p.defName; Store.save(); renderConfig();
        });
        row.appendChild(inp);
      }
    }
    return row;
  }

  /* ============ 得分权重配置（A4） ============ */
  function setWeightPair(range, num, val) {
    if (range) range.value = val;
    if (num) num.value = val;
  }
  function updateWeightTotal() {
    if (!refs.weightTotal) return;
    var w = Store.getScoreWeights();
    var sum = Number(w.duration) + Number(w.plan) + Number(w.vocab) + Number(w.mistake);
    refs.weightTotal.textContent = '当前权重合计：' + sum + '（满分基准；权重为 0 的项不计入分子与分母）';
  }
  function renderScoreWeights() {
    var w = Store.getScoreWeights();
    setWeightPair(refs.wDuration, refs.wDurationNum, w.duration);
    setWeightPair(refs.wPlan, refs.wPlanNum, w.plan);
    setWeightPair(refs.wVocab, refs.wVocabNum, w.vocab);
    setWeightPair(refs.wMistake, refs.wMistakeNum, w.mistake);
    updateWeightTotal();
  }
  function onWeightChange() {
    Store.setScoreWeights({
      duration: Number(refs.wDurationNum.value) || 0,
      plan: Number(refs.wPlanNum.value) || 0,
      vocab: Number(refs.wVocabNum.value) || 0,
      mistake: Number(refs.wMistakeNum.value) || 0
    });
    updateWeightTotal();
    renderData();
  }

  function onToggleSubject(p, checked) {
    if (checked) {
      var name = p.variants ? p.variants[0] : p.defName;
      Store.upsertSubject({ key: p.key, name: name, type: p.key, target: p.defTarget, color: undefined });
    } else {
      Store.removeSubject(p.key);
    }
    renderAll();
    updateMathTabVisibility();
    update408TabVisibility();
    showToast(checked ? ('已添加科目：' + p.label) : ('已移除科目：' + p.label), 'info');
  }

  /* ============ 按模块计时 ============ */
  function currentElapsed() {
    var t = Store.getTimer();
    if (!t.running) return t.accumulated || 0;
    return (t.accumulated || 0) + (Date.now() - t.startTs);
  }
  function commitTimer() {
    var t = Store.getTimer();
    if (t.running && t.subjectKey) {
      var mins = Math.round(currentElapsed() / 60000);
      if (mins > 0) Store.addDuration(Store.todayStr(), t.subjectKey, mins);
    }
  }
  function startTimerFor(key) {
    var t = Store.getTimer();
    if (t.running && t.subjectKey && t.subjectKey !== key) commitTimer();
    var nt = Store.getTimer();
    nt.subjectKey = key; nt.running = true; nt.startTs = Date.now(); nt.accumulated = 0;
    Store.setTimer(nt);
    renderTimerRows(); startTick();
  }
  function endTimer() {
    commitTimer();
    Store.setTimer({ subjectKey: null, startTs: 0, accumulated: 0, running: false });
    stopTick();
    renderTimerRows(); renderData(); renderToday(); renderPlan();
  }
  function startTick() {
    stopTick();
    timerInterval = setInterval(function () {
      var t = Store.getTimer();
      if (t.running) {
        var node = document.getElementById('t-time-' + t.subjectKey);
        if (node) node.textContent = fmt(currentElapsed());
      }
    }, 1000);
  }
  function stopTick() { if (timerInterval) { clearInterval(timerInterval); timerInterval = null; } }

  function renderTimerRows() {
    refs.timerRows.innerHTML = '';
    var subs = Store.getSubjects();
    if (!subs.length) { refs.timerRows.appendChild(el('div', 'empty-hint', '请先在「配置」中添加科目')); return; }
    var t = Store.getTimer();
    subs.forEach(function (s) {
      var running = t.running && t.subjectKey === s.key;
      var row = el('div', 'timer-row' + (running ? ' running' : ''));
      row.appendChild(el('div', 't-name', s.name));
      var time = el('div', 't-time', fmt(running ? currentElapsed() : 0));
      time.id = 't-time-' + s.key;
      row.appendChild(time);
      var btn = el('button', 't-btn ' + (running ? 'stop' : 'start'), running ? '结束' : '开始');
      btn.addEventListener('click', function () { if (running) endTimer(); else startTimerFor(s.key); });
      row.appendChild(btn);
      refs.timerRows.appendChild(row);
    });
  }

  /* ============ 记录：手动 + 模考 ============ */
  function renderManual() {
    var ds = refs.manualDate.value || Store.todayStr();
    var day = Store.getDay(ds) || { durations: {} };
    refs.manualDurations.innerHTML = '';
    var subs = Store.getSubjects();
    if (!subs.length) { refs.manualDurations.appendChild(el('div', 'empty-hint', '请先在「配置」中添加科目')); }
    subs.forEach(function (s) {
      var row = el('div', 'field-row');
      row.appendChild(el('label', null, s.name));
      var inp = el('input'); inp.type = 'number'; inp.min = '0'; inp.id = 'manual-min-' + s.key; inp.placeholder = '分钟';
      inp.value = (day.durations && day.durations[s.key]) || '';
      row.appendChild(inp);
      refs.manualDurations.appendChild(row);
    });
    refs.examScores.innerHTML = '';
    if (!subs.length) { refs.examScores.appendChild(el('div', 'empty-hint', '请先配置科目')); }
    subs.forEach(function (s) {
      var row = el('div', 'field-row');
      row.appendChild(el('label', null, s.name));
      var inp = el('input'); inp.type = 'number'; inp.min = '0'; inp.id = 'exam-score-' + s.key; inp.placeholder = '分数';
      row.appendChild(inp);
      refs.examScores.appendChild(row);
    });
    renderDayList();
    renderExamList();
  }
  function onSaveManual() {
    var ds = refs.manualDate.value || Store.todayStr();
    var durations = {};
    Store.getSubjects().forEach(function (s) {
      var inp = $('manual-min-' + s.key);
      var v = inp ? Number(inp.value) || 0 : 0;
      if (v > 0) durations[s.key] = v;
    });
    Store.setDayDurations(ds, durations);
    Store.saveDayMeta(ds, { completed: refs.manualCompleted.value });
    showToast('已保存 ' + ds + ' 的学习记录 ✅');
    renderManual(); renderData(); renderToday();
  }
  function onSaveSummary() {
    Store.saveDayMeta(Store.todayStr(), { summary: (refs.summaryEdit ? refs.summaryEdit.value : '') });
    showToast('已保存今日总结 ✅');
  }
  function onSaveExam() {
    var name = refs.examName.value.trim();
    var date = refs.examDate2.value;
    if (!name || !date) { alert('请填写考试名称与日期'); return; }
    var scores = {}, total = 0, any = false;
    Store.getSubjects().forEach(function (s) {
      var inp = $('exam-score-' + s.key);
      var v = inp ? Number(inp.value) : NaN;
      if (inp && inp.value !== '' && !isNaN(v)) { scores[s.key] = v; total += v; any = true; }
    });
    if (!any) { alert('请至少填写一科成绩'); return; }
    Store.addExam({ name: name, date: date, scores: scores, total: total });
    refs.examName.value = '';
    Store.getSubjects().forEach(function (s) { var i = $('exam-score-' + s.key); if (i) i.value = ''; });
    renderManual(); renderData();
  }
  function renderDayList() {
    refs.dayList.innerHTML = '';
    var keys = Object.keys(Store.getDays()).filter(function (k) { return Store.totalMinutesForDay(Store.getDays()[k]) > 0; }).sort().reverse().slice(0, 12);
    if (!keys.length) { refs.dayList.appendChild(el('div', 'empty-hint', '暂无学习记录')); return; }
    keys.forEach(function (ds) {
      var d = Store.getDays()[ds];
      var item = el('div', 'list-item');
      item.appendChild(el('div', 'list-title', ds + ' · 共 ' + Store.totalMinutesForDay(d) + ' 分钟'));
      if (d.completed) item.appendChild(el('div', 'list-sub', d.completed));
      refs.dayList.appendChild(item);
    });
  }
  function renderExamList() {
    refs.examList.innerHTML = '';
    var exams = Store.getExams().slice().reverse();
    if (!exams.length) { refs.examList.appendChild(el('div', 'empty-hint', '暂无模考成绩')); return; }
    exams.forEach(function (ex) {
      var item = el('div', 'list-item');
      item.appendChild(el('div', 'list-title', ex.name + '（' + ex.date + '）总分 ' + ex.total));
      var del = el('button', 'mini-btn', '删除');
      del.addEventListener('click', function () {
        confirmDelete('确定删除本次模考？该次成绩会从趋势图中移除。', function () {
          Store.removeExam(ex.id); renderExamList(); renderData();
          showToast('已删除该次模考记录', 'ok');
        });
      });
      item.appendChild(del);
      refs.examList.appendChild(item);
    });
  }

  /* ============ 今日：计划 ============ */
  function autoGenPlan(ds) {
    var subs = Store.getSubjects();
    var items = subs.map(function (s) { return { id: 'pl_' + Store.nextSeq(), text: '复习 ' + s.name, minutes: 60, done: false }; });
    items.push({ id: 'pl_' + Store.nextSeq(), text: '整理错题 / 复盘', minutes: 20, done: false });
    Store.setPlan(ds, items);
  }
  function renderPlan() {
    var ds = Store.todayStr();
    var plan = Store.getPlan(ds) || [];
    refs.planList.innerHTML = '';
    if (!plan.length) { refs.planList.appendChild(el('div', 'empty-hint', '还没有计划，点上方按钮生成吧')); return; }
    var subs = Store.getSubjects();
    var subMap = {}; subs.forEach(function (s) { subMap[s.key] = s; });
    var doneCount = plan.filter(function (i) { return i.done; }).length;
    plan.forEach(function (it) {
      var item = el('div', 'plan-item' + (it.done ? ' done' : ''));
      var chk = el('div', 'plan-check', it.done ? '✓' : '');
      chk.addEventListener('click', function () {
        var wasDone = it.done;
        Store.toggleDailyPlanItem(ds, it.id);
        if (!wasDone) {
          var updatedPlan = Store.getPlan(ds) || [];
          var allDone = updatedPlan.length > 0 && updatedPlan.every(function (p) { return p.done; });
          if (allDone) { showToast('🎉 今日计划全部完成！太棒了！', 'ok'); fireConfetti(); }
          else { showToast('🌟 完成 1 项，继续加油！', 'ok'); }
        }
        renderPlan(); renderToday();
      });
      var txtWrap = el('div', 'plan-text');
      if (it.subjectKey && subMap[it.subjectKey]) {
        var dot = el('span', 'plan-subject-dot');
        dot.style.background = subMap[it.subjectKey].color || '#94a3b8';
        dot.title = subMap[it.subjectKey].name;
        txtWrap.appendChild(dot);
      }
      var txt = document.createElement('span');
      txt.textContent = it.text;
      txtWrap.appendChild(txt);
      var min = el('div', 'plan-min', (it.minutes || 0) + ' 分钟');
      var del = el('button', 'plan-del', '删除');
      del.addEventListener('click', function () { Store.removeDailyPlanItem(ds, it.id); renderPlan(); renderToday(); });
      item.appendChild(chk); item.appendChild(txtWrap); item.appendChild(min); item.appendChild(del);
      refs.planList.appendChild(item);
    });
    refs.planList.appendChild(el('div', 'plan-min', '今日计划完成 ' + doneCount + ' / ' + plan.length));
  }

  /* ============ 今日：总结 + 分享 ============ */
  function sLine(l, v) {
    var d = el('div', 'summary-line');
    d.appendChild(el('span', null, l)); d.appendChild(el('span', null, v));
    return d;
  }
  function renderToday() {
    renderTodayAggregate();
  }
  function buildShareCanvas(ds) {
    var day = Store.getDay(ds) || { durations: {}, completed: '' };
    var subs = Store.getSubjects();
    var subMap = {}; subs.forEach(function (s) { subMap[s.key] = s; });
    var subjects = subs.map(function (s) { return { name: s.name, min: (day.durations && day.durations[s.key]) || 0, color: s.color }; }).filter(function (x) { return x.min > 0; });
    if (!subjects.length) subjects = [{ name: '（无记录）', min: 0, color: '#9ca3af' }];
    var cfg = Store.getConfig();
    var countdown = cfg.examDate ? Math.ceil((new Date(cfg.examDate + 'T00:00:00') - new Date(Store.todayStr() + 'T00:00:00')) / 86400000) : undefined;
    // 计划明细（带科目颜色）
    var rawPlans = Store.getPlan(ds) || [];
    var plans = rawPlans.map(function (p) {
      var color = '#64748b';
      if (p.subjectKey && subMap[p.subjectKey] && subMap[p.subjectKey].color) color = subMap[p.subjectKey].color;
      return { id: p.id, text: p.text, minutes: Number(p.minutes) || 0, done: !!p.done, subjectKey: p.subjectKey || '', color: color };
    });
    var planDone = plans.filter(function (p) { return p.done; }).length;
    // 数学章节
    var mathChs = Store.getMathChapters();
    var mathCur = Store.getMathCurrent();
    var hasMath = subs.some(function (s) { return s.key === 'math'; });
    // 408 章节
    var cs408Chs = Store.get408Chapters();
    var cs408Cur = Store.get408Current();
    var hasCs408 = cs408Chs && cs408Chs.length;
    // 408 到期错题
    var cs408Due = hasCs408 ? Store.get408DueMistakes(ds).length : undefined;
    // 通用专业课章节（非 408 时显示）
    var genericSubjectChapters = [];
    if (!hasCs408) {
      subs.forEach(function (s) {
        if (s.key === 'math' || s.key === 'english' || s.key === 'politics') return;
        var ch = Store.getSubjectChapters(s.key);
        if (ch && ch.chapters && ch.chapters.length) {
          genericSubjectChapters.push({ name: s.name, current: ch.current, total: ch.chapters.length });
        }
      });
    }
    return Share.generate({
      dateStr: ds, totalMin: Store.totalMinutesForDay(day), streak: Store.consecutiveStreak(),
      nickname: cfg.nickname || '', siteUrl: window.location.origin,
      subjects: subjects,
      completed: day.completed || '', summary: day.summary || '',
      major: cfg.major, examCountdown: countdown,
      plans: plans, planDone: planDone, planTotal: plans.length,
      mathCurrent: hasMath ? mathCur : undefined, mathTotal: hasMath ? mathChs.length : undefined,
      cs408Current: hasCs408 ? cs408Cur : undefined, cs408Total: hasCs408 ? cs408Chs.length : undefined,
      cs408DueCount: cs408Due,
      subjectChapters: genericSubjectChapters
    });
  }
  function onShareToday() {
    var canvas = buildShareCanvas(Store.todayStr());
    var link = document.createElement('a');
    link.download = '考研打卡_' + Store.todayStr() + '.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
    canvas.toBlob(function (blob) {
      var f = new File([blob], '考研打卡.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [f] })) {
        navigator.share({ files: [f], title: '考研学习打卡', text: '今日学习打卡' }).catch(function () {});
      }
    });
  }

  function buildMarkdownReport() {
    var cfg = Store.getConfig();
    var subs = Store.getSubjects();
    var today = Store.todayStr();
    var day = Store.getDay(today) || { durations: {}, completed: '', summary: '', note: '' };
    var total = Store.totalMinutesForDay(day);
    var countdown = cfg.examDate ? Math.ceil((new Date(cfg.examDate + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000) : null;
    var days = Store.getDays();
    var totalDays = Object.keys(days || {}).length;
    var totalMinutes = 0;
    Object.keys(days || {}).forEach(function (ds) { totalMinutes += Store.totalMinutesForDay(days[ds]); });
    var exams = Store.getExams();
    var mistakes = Store.getMistakes();
    var plan = Store.getPlan(today) || [];
    var planDone = plan.filter(function (p) { return p.done; }).length;
    var lines = [];
    lines.push('# 考研学习报告');
    lines.push('');
    lines.push('> 生成时间：' + today + '  ' + (cfg.nickname ? '**' + cfg.nickname + '** 专属报告' : ''));
    if (cfg.major) lines.push('> 报考专业：' + cfg.major);
    if (countdown !== null) lines.push('> 距考研：**' + countdown + '** 天');
    lines.push('');
    lines.push('## 📊 今日概览');
    lines.push('');
    lines.push('| 指标 | 数值 |');
    lines.push('|---|---|');
    lines.push('| 今日学习时长 | **' + (total / 60).toFixed(1) + ' 小时** (' + total + ' 分钟) |');
    lines.push('| 连续打卡 | ' + Store.consecutiveStreak() + ' 天 |');
    lines.push('| 今日计划 | ' + planDone + ' / ' + plan.length + ' |');
    if (plan.length) {
      lines.push('');
      lines.push('**今日计划明细：**');
      plan.forEach(function (p) {
        var status = p.done ? '✅' : '⬜';
        var time = (p.minutes || 0) + ' 分钟';
        var subj = '';
        if (p.subjectKey) {
          var s = subs.find(function (x) { return x.key === p.subjectKey; });
          if (s) subj = '【' + s.name + '】';
        }
        lines.push('- ' + status + ' ' + subj + (p.text || '未命名') + '（' + time + '）');
      });
    }
    if (total > 0) {
      lines.push('');
      lines.push('## ⏱️ 今日各科目时长');
      lines.push('');
      lines.push('| 科目 | 时长（分钟） | 占比 |');
      lines.push('|---|---|---|');
      subs.forEach(function (s) {
        var m = (day.durations && day.durations[s.key]) || 0;
        var pct = total ? ((m / total) * 100).toFixed(1) + '%' : '-';
        lines.push('| ' + s.name + ' | ' + m + ' | ' + pct + ' |');
      });
    }
    if (day.completed) {
      lines.push('');
      lines.push('## ✅ 今日完成内容');
      lines.push('');
      lines.push(day.completed);
    }
    if (day.summary) {
      lines.push('');
      lines.push('## 💬 今日学习总结');
      lines.push('');
      lines.push(day.summary);
    }
    if (day.note) {
      lines.push('');
      lines.push('## 📝 心得笔记');
      lines.push('');
      lines.push(day.note);
    }
    lines.push('');
    lines.push('## 📈 累计统计');
    lines.push('');
    lines.push('- 累计学习天数：**' + totalDays + ' 天**');
    lines.push('- 累计学习时长：**' + (totalMinutes / 60).toFixed(1) + ' 小时**');
    if (exams.length) {
      lines.push('');
      lines.push('## 🏆 模考记录');
      lines.push('');
      lines.push('| 考试 | 日期 | 总分 | 各科目 |');
      lines.push('|---|---|---|---|');
      exams.forEach(function (ex) {
        var subjParts = subs.map(function (s) { return s.name + ':' + (ex.scores && ex.scores[s.key] !== undefined ? ex.scores[s.key] : '-'); }).join(' / ');
        lines.push('| ' + ex.name + ' | ' + ex.date + ' | ' + (ex.total || '-') + ' | ' + subjParts + ' |');
      });
    }
    if (mistakes.length) {
      lines.push('');
      lines.push('## 📌 错题 / 感悟整理');
      lines.push('');
      mistakes.slice(0, 20).forEach(function (m) {
        lines.push('- **[' + (m.subject || '通用') + ']** ' + m.content + (m.note ? ' — ' + m.note : ''));
      });
      if (mistakes.length > 20) lines.push('');
      if (mistakes.length > 20) lines.push('_（其余 ' + (mistakes.length - 20) + ' 条已省略，完整数据请用 JSON 导出）_');
    }
    lines.push('');
    lines.push('---');
    lines.push('_由「考研学习记录」自动生成_' + (cfg.nickname ? ' · ' + cfg.nickname : ''));
    return lines.join('\n');
  }

  /* ============ 数据看板 ============ */
  function renderData() {
    var cfg = Store.getConfig();
    if (cfg.examDate) {
      var diff = Math.ceil((new Date(cfg.examDate + 'T00:00:00') - new Date(Store.todayStr() + 'T00:00:00')) / 86400000);
      refs.countdown.innerHTML = diff >= 0 ? ('距离考研还有 <b>' + diff + '</b> 天') : ('考研已结束 ' + Math.abs(diff) + ' 天');
    } else { refs.countdown.textContent = '未设置考研日期'; }
    renderGoalProgress();
    // D3：今日时长饼图
    renderTodayPieCard();
    Charts.renderMonthHeatmap(refs.heatmap, heatYear, heatMonth, Store.getDays());
    refs.heatLabel.textContent = heatYear + '年' + (heatMonth + 1) + '月';
    Charts.renderTrend(refs.trend, Store.getExams(), Number(cfg.targetTotal) || 0);
    // D3：掌握度雷达图
    renderRadarCard();
    renderSubjectStats();
    // 学习得分 + 成就徽章
    renderScoreCard();
    renderBadgesCard();
    // 里程碑检测（首次达成触发庆祝）
    checkMilestones();
    renderWeaknessReport();
    // S3：非数学/408 用户不展示薄弱点卡（无刷题数据）
    var hasMath = Store.getSubjects().some(function (s) { return s.key === 'math'; });
    var hasCs408 = Store.getSubjects().some(function (s) { return s.key === 'cs408'; });
    if (refs.weaknessCard) refs.weaknessCard.classList.toggle('nav-hidden', !(hasMath || hasCs408));
  }
  /* ============ A3：基于刷题正确率的薄弱点分析报告 ============ */
  var WEAK_THRESHOLD = 0.6;   // 正确率 < 60% 视为薄弱
  var WARN_THRESHOLD = 0.75;  // 60%~75% 视为待加强
  var MIN_SAMPLES = 3;        // 样本数 < 3 不判定薄弱，避免偶然偏差
  // 数学分支 → 章节前缀（把薄弱分支映射到具体章节）
  var MATH_CAT_CHAPTERS = { '高等数学': '高数 ·', '线性代数': '线代 ·', '概率统计': '概率 ·' };

  function renderWeaknessReport() {
    var box = refs.weaknessReport;
    if (!box) return;
    box.innerHTML = '';
    var mathStats = Store.getMathStats();
    var csStats = Store.get408Stats();
    var mathKeys = Object.keys(mathStats);
    var csKeys = Object.keys(csStats);
    if (!mathKeys.length && !csKeys.length) {
      box.appendChild(el('div', 'empty-hint', '还没有刷题记录，去「数学 · 分类选择题刷题」或「408 · 分类刷题」做题后，这里会自动生成薄弱点分析。'));
      return;
    }
    function rateOf(s) { return s.total ? s.correct / s.total : 0; }
    function statusOf(s) {
      if (s.total < MIN_SAMPLES) return { cls: 'wk-tip', label: '样本 ' + s.total + ' 题·不足' };
      var r = rateOf(s);
      if (r < WEAK_THRESHOLD) return { cls: 'wk-weak', label: '薄弱 ' + Math.round(r * 100) + '%' };
      if (r < WARN_THRESHOLD) return { cls: 'wk-warn', label: '待加强 ' + Math.round(r * 100) + '%' };
      return { cls: 'wk-ok', label: '良好 ' + Math.round(r * 100) + '%' };
    }
    function catRow(name, s) {
      var wrap = el('div', 'wk-row');
      var head = el('div', 'wk-head');
      head.appendChild(el('span', 'wk-name', name));
      var st = statusOf(s);
      head.appendChild(el('span', 'wk-status ' + st.cls, st.label));
      head.appendChild(el('span', 'wk-total', s.correct + '/' + s.total + ' 题'));
      wrap.appendChild(head);
      var barWrap = el('div', 'wk-bar');
      var fill = el('div', 'wk-fill ' + st.cls);
      fill.style.width = Math.round(rateOf(s) * 100) + '%';
      barWrap.appendChild(fill);
      wrap.appendChild(barWrap);
      return wrap;
    }
    // 数学分支
    if (mathKeys.length) {
      box.appendChild(el('div', 'wk-section-title', '📐 数学（按分支）'));
      mathKeys.forEach(function (k) { box.appendChild(catRow(k, mathStats[k])); });
    }
    // 408 四书
    if (csKeys.length) {
      box.appendChild(el('div', 'wk-section-title', '💻 408（按四本书）'));
      csKeys.forEach(function (k) { box.appendChild(catRow(k, csStats[k])); });
    }
    // 优先复习清单：合并数学+408，按正确率升序，取薄弱/待加强
    var all = [];
    mathKeys.forEach(function (k) { all.push({ name: k, s: mathStats[k] }); });
    csKeys.forEach(function (k) { all.push({ name: k, s: csStats[k] }); });
    var weakList = all.filter(function (it) { return it.s.total >= MIN_SAMPLES && rateOf(it.s) < WARN_THRESHOLD; })
      .sort(function (a, b) { return rateOf(a.s) - rateOf(b.s); });
    if (weakList.length) {
      box.appendChild(el('div', 'wk-section-title', '📌 优先复习清单（最弱在前）'));
      weakList.forEach(function (it) {
        var li = el('div', 'wk-priority');
        li.appendChild(el('div', 'wk-pname', it.name + ' · 正确率 ' + Math.round(rateOf(it.s) * 100) + '%（' + it.s.correct + '/' + it.s.total + '）'));
        var hint;
        var prefix = MATH_CAT_CHAPTERS[it.name];
        if (prefix) {
          var chs = Store.getMathChapters().filter(function (c) { return c.indexOf(prefix) === 0; });
          hint = chs.length ? ('建议复习章节：' + chs.join('、')) : '（该分支暂无章节数据）';
        } else {
          hint = '建议：重做该分类错题与速查卡，针对性补练。';
        }
        li.appendChild(el('div', 'wk-chapters', hint));
        box.appendChild(li);
      });
    } else {
      box.appendChild(el('div', 'wk-note', '🎉 当前各分类正确率均 ≥ 75%，继续保持刷题节奏即可。'));
    }
  }
  function renderGoalProgress() {
    refs.goalProgress.innerHTML = '';
    var subs = Store.getSubjects();
    var exams = Store.getExams();
    if (!subs.length) { refs.goalProgress.appendChild(el('div', 'empty-hint', '请先配置考试科目与目标分')); return; }
    var totalCur = 0;
    subs.forEach(function (s) {
      var cur = latestScoreIn(exams, s.key);
      var tgt = Number(s.target) || 0;
      var row = el('div', 'goal-row');
      if (cur != null && tgt > 0 && cur < tgt) row.classList.add('subject-line-miss');
      row.appendChild(el('div', 'goal-name', s.name));
      var barWrap = el('div', 'goal-bar');
      var fill = el('div', 'goal-fill');
      var pct = (cur != null && tgt > 0) ? Math.min(100, cur / tgt * 100) : 0;
      fill.style.width = pct + '%'; fill.style.background = s.color;
      barWrap.appendChild(fill); row.appendChild(barWrap);
      var status = el('div', 'goal-status');
      if (cur == null) { status.textContent = '目标 ' + tgt + ' · 未考'; status.className = 'goal-status pending'; }
      else if (tgt - cur <= 0) { status.textContent = '目标 ' + tgt + ' · 模考 ' + cur + ' · 已达标'; status.className = 'goal-status ok'; }
      else { status.textContent = '目标 ' + tgt + ' · 模考 ' + cur + ' · 差' + (tgt - cur) + '分'; status.className = 'goal-status gap'; }
      row.appendChild(status);
      refs.goalProgress.appendChild(row);
      if (cur != null) totalCur += cur;
    });
    var ttotal = Number(Store.getConfig().targetTotal) || 0;
    var totalRow = el('div', 'goal-total');
    var line = '总分目标：' + ttotal;
    if (totalCur > 0) { var gap = ttotal - totalCur; line += '　当前模考总分：' + totalCur + '　差距：' + gap + (gap <= 0 ? '（已达标）' : ''); }
    else line += '　（录入模考后显示当前总分）';
    totalRow.textContent = line;
    refs.goalProgress.appendChild(totalRow);
  }
  function renderSubjectStats() {
    var subs = Store.getSubjects();
    var days = Store.getDays();
    // H4：各科目累计时长 横向条形图
    if (refs.subjectBars) {
      if (!subs.length) { refs.subjectBars.innerHTML = '<div class="empty-hint">暂无科目数据</div>'; }
      else {
        var data = [];
        subs.forEach(function (s) {
          var total = 0;
          Object.keys(days).forEach(function (ds) {
            var d = days[ds];
            if (d && d.durations && d.durations[s.key]) total += d.durations[s.key];
          });
          data.push({ name: s.name, color: s.color, totalMin: total });
        });
        Charts.renderSubjectBars(refs.subjectBars, data);
      }
    }
    refs.subjectStats.innerHTML = '';
    if (!subs.length) { refs.subjectStats.appendChild(el('div', 'empty-hint', '暂无数据')); return; }
    subs.forEach(function (s) {
      var total = 0, daysCount = 0;
      Object.keys(days).forEach(function (ds) {
        var d = days[ds];
        if (d && d.durations && d.durations[s.key]) { total += d.durations[s.key]; daysCount++; }
      });
      var avg = daysCount ? Math.round(total / daysCount) : 0;
      var card = el('div', 'stat-card');
      var top = el('div', 'stat-top');
      var dot = el('span', 'stat-dot'); dot.style.background = s.color; top.appendChild(dot);
      top.appendChild(el('span', null, s.name));
      card.appendChild(top);
      card.appendChild(el('div', 'stat-big', Math.floor(total / 60) + 'h' + (total % 60) + 'm'));
      card.appendChild(el('div', 'stat-sub', '累计 ' + total + ' 分钟 · ' + daysCount + ' 天 · 日均 ' + avg + ' 分'));
      refs.subjectStats.appendChild(card);
    });
  }

  /* ============ D3：今日时长饼图包装 ============ */
  function renderTodayPieCard() {
    if (!refs.todayPie) return;
    var subs = Store.getSubjects();
    var today = Store.getDay(Store.todayStr()) || {};
    var items = subs.map(function (s) {
      return { name: s.name, color: s.color, min: (today.durations && today.durations[s.key]) || 0 };
    }).filter(function (x) { return x.min > 0; });
    Charts.renderTodayPie(refs.todayPie, items);
  }

  /* ============ D3：掌握度雷达图包装 ============ */
  function renderRadarCard() {
    if (!refs.subjectRadar) return;
    var subs = Store.getSubjects();
    var days = Store.getDays();
    var exams = Store.getExams();
    var radarData = subs.map(function (s) {
      var v = 0;
      // 综合得分：章节进度 50% + 模考达成度 40% + 累计学习时长 10%
      // 章节进度（用已完成数量，支持跳跃式学习）
      var doneCount = 0, total = 0;
      if (s.key === 'math') { total = Store.getMathChapters().length; doneCount = Store.getMathDone().length; }
      else if (s.key === 'cs408') { total = Store.get408Chapters().length; doneCount = Store.get408Done().length; }
      else { var ch = Store.getSubjectChapters(s.key) || {}; total = (ch.chapters || []).length; doneCount = (Array.isArray(ch.done) ? ch.done.length : 0); }
      var prog = total ? Math.max(0, doneCount / total) : 0;
      // 模考达成度
      var tgt = Number(s.target) || 0;
      var ls = latestScoreIn(exams, s.key);
      var examScore = (tgt > 0 && ls != null) ? Math.max(0, Math.min(1, ls / tgt)) : 0;
      // 时长归一化（用所有科目的最大时长）
      var tMin = 0;
      Object.keys(days).forEach(function (ds) { var d = days[ds]; if (d && d.durations && d.durations[s.key]) tMin += d.durations[s.key]; });
      v = prog * 0.5 + examScore * 0.4 + Math.min(1, tMin / (60 * 30)) * 0.1; // 30小时≈满值
      return { name: s.name, value: Math.max(0, Math.min(1, v)) };
    });
    Charts.renderRadar(refs.subjectRadar, radarData);
  }

  /* ============ 错题整理 ============ */
  function renderMistakeTypes() {
    refs.mistakeTypes.innerHTML = '';
    MISTAKE_TYPES.forEach(function (t) {
      var c = el('div', 'chip' + (t === selectedType ? ' active' : ''), t);
      c.addEventListener('click', function () { selectedType = t; renderMistakeTypes(); });
      refs.mistakeTypes.appendChild(c);
    });
  }
  function populateMistakeSubjects() {
    refs.mistakeSubject.innerHTML = '<option value="">不指定</option>';
    var added = {};
    MISTAKE_SUBJECTS.forEach(function (name) {
      added[name] = true;
      var o = el('option'); o.value = name; o.textContent = name; refs.mistakeSubject.appendChild(o);
    });
    // 合并用户配置的考试科目（避免与固定列表重复）
    Store.getSubjects().forEach(function (s) {
      if (!added[s.name]) { added[s.name] = true; var o = el('option'); o.value = s.name; o.textContent = s.name; refs.mistakeSubject.appendChild(o); }
    });
  }
  var mistakeFilterScope = 'all';   // 列表筛选：范围 all/general/math/cs408
  var mistakeFilterCat = '全部';    // 列表筛选：分类（通用为 type）

  function renderMistakeList() {
    var today = Store.todayStr();
    // 三数组合并 + scope 标签（零迁移，各自存各自数组）
    var general = Store.getMistakes().map(function (m) { return Object.assign({}, m, { scope: 'general' }); });
    var math = Store.getMathMistakes().map(function (m) { return Object.assign({}, m, { scope: 'math' }); });
    var cs = Store.get408Mistakes().map(function (m) { return Object.assign({}, m, { scope: 'cs408' }); });
    var all = general.concat(math, cs);

    // 到期徽标 = 数学 + 408 待复习总数（通用无到期概念）
    var dueCount = Store.getMathDueMistakes(today).length + Store.get408DueMistakes(today).length;
    if (refs.mistakeDueBadge) {
      if (dueCount > 0) { refs.mistakeDueBadge.style.display = ''; refs.mistakeDueBadge.textContent = dueCount + ' 题待复习'; }
      else refs.mistakeDueBadge.style.display = 'none';
    }

    // 范围筛选
    var inScope = all.filter(function (m) {
      if (mistakeFilterScope === 'all') return true;
      return m.scope === mistakeFilterScope;
    });

    // 筛选 chips：范围 + 分类（同一行）
    refs.mistakeFilter.innerHTML = '';
    [['all', '全部'], ['general', '通用'], ['math', '数学'], ['cs408', '408']].forEach(function (p) {
      var cnt = p[0] === 'all' ? all.length : all.filter(function (m) { return m.scope === p[0]; }).length;
      var chip = el('div', 'chip' + (mistakeFilterScope === p[0] ? ' active' : ''), p[1] + ' (' + cnt + ')');
      chip.addEventListener('click', function () { mistakeFilterScope = p[0]; mistakeFilterCat = '全部'; renderMistakeList(); });
      refs.mistakeFilter.appendChild(chip);
    });
    var catMap = {};
    inScope.forEach(function (m) {
      var key = m.scope === 'general' ? (m.type || '其他') : (m.category || '其他');
      catMap[key] = (catMap[key] || 0) + 1;
    });
    Object.keys(catMap).forEach(function (c) {
      var chip = el('div', 'chip' + (mistakeFilterCat === c ? ' active' : ''), c + ' (' + catMap[c] + ')');
      chip.addEventListener('click', function () { mistakeFilterCat = c; renderMistakeList(); });
      refs.mistakeFilter.appendChild(chip);
    });

    // 应用分类筛选
    var list = inScope.filter(function (m) {
      if (mistakeFilterCat === '全部') return true;
      var key = m.scope === 'general' ? (m.type || '其他') : (m.category || '其他');
      return key === mistakeFilterCat;
    });

    refs.mistakeList.innerHTML = '';
    if (!list.length) { refs.mistakeList.appendChild(el('div', 'empty-hint', '还没有整理内容')); return; }
    list.forEach(function (m) {
      var isDue = m.scope === 'math'
        ? (!m.nextReview || m.nextReview <= today)
        : (m.scope === 'cs408' ? (!m.reviewed || (m.nextReview && m.nextReview <= today)) : false);
      var item = el('div', 'mistake-item' + (m.reviewed ? ' reviewed' : '') + (isDue ? ' due' : ''));
      var top = el('div', 'mistake-top');
      // scope 徽标
      var scopeLabel = m.scope === 'general' ? '通用' : (m.scope === 'math' ? '数学' : '408');
      var scopeCls = m.scope === 'math' ? 'math' : (m.scope === 'cs408' ? 'cs408' : '');
      top.appendChild(el('span', 'mistake-scope ' + scopeCls, scopeLabel));
      // 分类 / 类型 徽标
      top.appendChild(el('span', 'mistake-badge', m.scope === 'general' ? (m.type || '其他') : (m.category || '其他')));
      if (isDue) top.appendChild(el('span', 'due-tag', '待复习'));
      var del = el('button', 'plan-del', '删除');
      del.addEventListener('click', function () {
        if (m.scope === 'general') Store.removeMistake(m.id);
        else if (m.scope === 'math') Store.removeMathMistake(m.id);
        else Store.remove408Mistake(m.id);
        renderMistakeList();
      });
      top.appendChild(del);
      item.appendChild(top);
      item.appendChild(el('div', 'mistake-content', m.content || ''));
      var meta = [];
      if (m.scope === 'general') { if (m.subject) meta.push(m.subject); meta.push(m.date); }
      else { if (m.created) meta.push(m.created); }
      if (m.note) meta.push('备注：' + m.note);
      if (m.reviewCount) meta.push('已回顾 ' + m.reviewCount + ' 次');
      if (m.nextReview) meta.push('下次复习：' + m.nextReview);
      item.appendChild(el('div', 'mistake-meta', meta.join(' · ')));
      // 标记已回顾（仅 math / cs408 有记忆曲线）
      if (m.scope !== 'general') {
        var rev = el('button', 'btn btn-ghost mistake-review', m.reviewed ? '✓ 已回顾（再复习）' : '✓ 标记已回顾');
        rev.addEventListener('click', function () {
          if (m.scope === 'math') Store.reviewMathMistake(m.id, true);
          else Store.update408Mistake(m.id, { reviewed: true });
          renderMistakeList();
          var updated = (m.scope === 'math' ? Store.getMathMistakes() : Store.get408Mistakes()).filter(function (x) { return x.id === m.id; })[0];
          showToast('已标记回顾，下次复习：' + (updated ? updated.nextReview : '—'));
        });
        item.appendChild(rev);
      }
      refs.mistakeList.appendChild(item);
    });
  }

  /* ============ 侧边栏折叠 + 偏好记忆 ============ */
  function applySidebar() {
    var collapsed = !!Store.getConfig().sidebarCollapsed;
    document.body.classList.toggle('side-collapsed', collapsed);
    if (refs.navCollapse) refs.navCollapse.textContent = collapsed ? '›' : '‹';
  }
  function onToggleSidebar() {
    var collapsed = !Store.getConfig().sidebarCollapsed;
    Store.setConfig({ sidebarCollapsed: collapsed });
    applySidebar();
  }

  /* ============ 生词批量导入 ============ */
  function parseImportText(text) {
    var lines = (text || '').split(/\r?\n/);
    var out = [];
    lines.forEach(function (line) {
      line = line.trim(); if (!line) return;
      var parts = null, m;
      m = line.match(/^(.*?)\t(.*)$/); if (m) parts = [m[1], m[2]];
      else { m = line.match(/^(.*?)[：:—\-]\s*(.*)$/); if (m) parts = [m[1], m[2]]; }
      if (!parts && /\s{2,}/.test(line)) parts = line.split(/\s{2,}/);
      if (!parts) { m = line.match(/^([A-Za-z][A-Za-z\-]*)\s+([^\x00-\x7F].*)$/); if (m) parts = [m[1], m[2]]; }
      if (parts) { var w = parts[0].trim(), c = parts[1].trim(); if (w) out.push({ word: w, cn: c }); }
      else out.push({ word: line, cn: '' });
    });
    return out;
  }
  function applyImport(list) {
    var added = 0, skipped = 0, noCn = 0;
    list.forEach(function (it) {
      if (Store.findVocab(it.word)) { skipped++; return; }
      var cn = it.cn;
      if (!cn) { var d = DICT_MAP[it.word.toLowerCase()]; if (d) cn = d.c; else noCn++; }
      Store.addVocab(it.word, cn); added++;
    });
    renderWords();
    refs.importStatus.textContent = '导入完成：新增 ' + added + ' 个，跳过重复 ' + skipped + ' 个' + (noCn ? ('，其中 ' + noCn + ' 个需手动补释义') : '');
    showToast('批量导入完成 ✅');
  }
  function onImportWords() { applyImport(parseImportText(refs.importText.value)); }
  function onImportFile(e) {
    var f = e.target.files[0]; if (!f) return;
    var r = new FileReader();
    r.onload = function () { refs.importText.value = r.result; applyImport(parseImportText(r.result)); };
    r.readAsText(f);
  }

  /* ============ 长难句分析 ============ */
  var lastSentenceText = ''; // 供 AI 深度分析使用
  function onAnalyzeSentence() {
    var text = refs.sentenceInput.value.trim();
    if (!text) { alert('请粘贴一句长难句'); return; }
    lastSentenceText = text;
    renderSentenceResult(window.SentenceAnalyzer.analyze(text));
  }
  function renderSentenceResult(r) {
    var box = refs.sentenceResult; box.innerHTML = '';
    if (!r.clauses.length) { box.appendChild(el('div', 'empty-hint', '没有可分析的内容')); return; }
    // 统计概览
    if (r.stats) {
      var st = r.stats;
      var statRow = el('div', 'sr-stats');
      statRow.appendChild(el('span', 'sr-stat', '词数 ' + st.wordCount));
      statRow.appendChild(el('span', 'sr-stat', '分句 ' + st.clauseCount));
      statRow.appendChild(el('span', 'sr-stat sr-diff', '难度 ' + st.difficulty));
      if (st.connectors.length) statRow.appendChild(el('span', 'sr-stat', '连接词 ' + st.connectors.join(' / ')));
      box.appendChild(statRow);
      // 逻辑信号词
      if (st.signals.length) {
        box.appendChild(el('div', 'sr-title', '⚡ 逻辑信号词（出题点常在此附近）'));
        var sg = el('div', 'sg-grid');
        st.signals.forEach(function (s) {
          var chip = el('div', 'sg-chip');
          chip.appendChild(el('b', null, s.name + '：'));
          chip.appendChild(el('span', null, s.hits.join(' / ')));
          sg.appendChild(chip);
        });
        box.appendChild(sg);
      }
      // 句式特征
      if (st.features.length) {
        box.appendChild(el('div', 'sr-title', '🧩 句式特征'));
        var fg = el('div', 'feat-list');
        st.features.forEach(function (f) { fg.appendChild(el('div', 'feat-chip', f)); });
        box.appendChild(fg);
      }
      // 代词指代提醒
      if (st.pronouns.length) {
        box.appendChild(el('div', 'sr-title', '👁 代词指代（阅读题常问 it / they 指代谁）'));
        box.appendChild(el('div', 'pron-row', '句中代词：' + st.pronouns.join('、') + ' —— 定位先行词是做题关键'));
      }
    }
    box.appendChild(el('div', 'sr-title', '🔍 句子结构拆解'));
    r.clauses.forEach(function (cl) {
      var tag = cl.type === 'main' ? '主句' : (cl.type === 'sub' ? '从句' : '并列分句');
      var row = el('div', 'clause clause-' + cl.type);
      row.appendChild(el('span', 'clause-tag tag-' + cl.type, (cl.intro ? cl.intro + ' · ' : '') + tag));
      row.appendChild(el('div', 'clause-text', cl.text));
      box.appendChild(row);
    });
    box.appendChild(el('div', 'sr-title', '📌 可能出现的考点词（命中本地词库）'));
    if (r.testWords.length) {
      var wg = el('div', 'tw-grid');
      r.testWords.forEach(function (t) {
        var item = el('div', 'tw-item'); item.appendChild(el('b', null, t.word)); item.appendChild(el('span', null, t.c)); wg.appendChild(item);
      });
      box.appendChild(wg);
    } else box.appendChild(el('div', 'muted', '句中未命中本地词库高频词（可继续积累）。'));
    box.appendChild(el('div', 'sr-title', '🔄 同义替换高频考点词归纳'));
    if (r.synonyms.length) {
      r.synonyms.forEach(function (s) {
        var card = el('div', 'syn-card');
        card.appendChild(el('div', 'syn-name', '「' + s.name + '」组'));
        card.appendChild(el('div', 'syn-hit', '文中出现：' + s.hits.join('、')));
        card.appendChild(el('div', 'syn-alt', '常替换为：' + s.group.join(' / ')));
        box.appendChild(card);
      });
    } else box.appendChild(el('div', 'muted', '句中暂未命中高频同义替换组。'));
    var m = el('div', 'sr-method');
    m.appendChild(el('div', 'sr-title', '🧠 分析方法讲解'));
    m.appendChild(el('div', 'method-text', r.method));
    box.appendChild(m);
    // AI 深度分析入口（需在配置页填写 AI 配置）
    var aiArea = el('div', 'sr-ai');
    var aiBtn = el('button', 'btn btn-ghost sr-ai-btn', '🤖 AI 深度分析（成分+翻译+出题意图）');
    var aiBox = el('div', 'ai-explain-box');
    aiBox.style.display = 'none';
    aiArea.appendChild(aiBtn); aiArea.appendChild(aiBox);
    aiBtn.addEventListener('click', aiDeepAnalyzeSentence);
    box.appendChild(aiArea);
  }
  function aiDeepAnalyzeSentence() {
    var text = (lastSentenceText || '').trim();
    var area = refs.sentenceResult.querySelector('.sr-ai');
    if (!text || !area) { showToast('请先输入并分析一句长难句'); return; }
    var btn = area.querySelector('.sr-ai-btn');
    var aiBox = area.querySelector('.ai-explain-box');
    if (!btn || !aiBox) return;
    if (aiBox.style.display !== 'none') { aiBox.style.display = 'none'; btn.textContent = '🤖 AI 深度分析（成分+翻译+出题意图）'; return; }
    aiBox.style.display = 'block';
    aiBox.textContent = '';
    aiBox.appendChild(el('div', 'ai-loading', '🤖 AI 分析中（约 10-30 秒）…'));
    btn.textContent = '收起 AI 分析';
    aiChat([
      { role: 'system', content: '你是考研英语长难句讲解专家，面向词汇量约 4000 的考生。用简体中文，讲解具体、可操作，不说空话。' },
      { role: 'user', content: '请对这句考研英语长难句做深度分析：\n「' + text + '」\n请按以下结构输出：\n1)【逐层拆解】按主干→修饰的顺序拆解句子结构；\n2)【全句翻译】通顺的中文翻译；\n3)【考点词】列出 3-5 个值得背的词/短语并给释义；\n4)【出题意图】若为阅读题句子，命题人可能在哪出题（细节/同义替换/推断）；\n5)【仿写思路】给出用该句式写一句中文思路（不写英文例句）。' }
    ], { maxTokens: 1200 }).then(function (res) {
      aiBox.textContent = '';
      var pre = el('pre', 'ai-explain-text'); pre.textContent = res.content.trim();
      aiBox.appendChild(pre);
    }).catch(function (err) {
      aiBox.textContent = '';
      aiBox.appendChild(el('div', 'empty-hint', '✗ ' + (err.msg || 'AI 分析失败，请检查配置页 AI 设置')));
      btn.textContent = '🤖 AI 深度分析（成分+翻译+出题意图）';
    });
  }

  /* ============ 今日学习总结（独立模块）+ 提醒推送 ============ */
  function switchTab(target) { var btn = document.querySelector('.tab-btn[data-tab="' + target + '"]'); if (btn) btn.click(); else showTab(target); }
  function updateMathTabVisibility() {
    var hasMath = Store.getSubjects().some(function (s) { return s.key === 'math'; });
    var btn = document.querySelector('.tab-btn[data-tab="math"]');
    var panel = document.getElementById('tab-math');
    if (btn) btn.classList.toggle('nav-hidden', !hasMath);
    if (panel) panel.classList.toggle('nav-hidden', !hasMath);
    if (!hasMath) {
      var active = document.querySelector('.tab-btn.active');
      if (active && active.getAttribute('data-tab') === 'math') switchTab('today');
    }
  }
  function renderSummary() {
    var ds = Store.todayStr();
    var day = Store.getDay(ds) || { durations: {} };
    var subs = Store.getSubjects();
    var total = Store.totalMinutesForDay(day);
    var body = refs.summaryBody; body.innerHTML = '';
    body.appendChild(el('div', 'summary-big', (Math.floor(total / 60) > 0 ? Math.floor(total / 60) + 'h ' : '') + (total % 60) + 'm'));
    body.appendChild(sLine('学习时长', total + ' 分钟'));
    subs.forEach(function (s) { var m = (day.durations && day.durations[s.key]) || 0; if (m > 0) body.appendChild(sLine(s.name, m + ' 分钟')); });
    var plan = Store.getPlan(ds) || []; var done = plan.filter(function (i) { return i.done; }).length;
    body.appendChild(sLine('计划完成', plan.length ? (done + ' / ' + plan.length) : '未制定'));
    var mistakesToday = Store.getMistakes().filter(function (m) { return m.date === ds; }).length;
    body.appendChild(sLine('今日整理错题/感悟', mistakesToday + ' 条'));
    var vocabAdded = Store.getVocab().filter(function (v) { return v.added === ds; }).length;
    body.appendChild(sLine('今日新增生词', vocabAdded + ' 个'));
    var due = Store.getDueVocab(ds).length;
    body.appendChild(sLine('待复习生词(记忆曲线)', due + ' 个'));
    body.appendChild(sLine('连续打卡', Store.consecutiveStreak() + ' 天'));
    renderCheckinCard();
    if (refs.summaryEdit) refs.summaryEdit.value = (day.summary || '');
  }
  /* 统一的打卡逻辑：今日页大按钮 + 总结页按钮共用 */
  function doCheckin() {
    var ds = Store.todayStr();
    if (Store.isCheckedIn(ds)) { showToast('今天已经打卡啦 ✅', 'ok'); renderCheckinCard(); return; }
    Store.checkin(ds);
    showToast('已打卡 ' + ds + ' ✅', 'ok');
    fireConfetti();
    renderCheckinCard();
    renderSummary();
    renderTodayAggregate();
  }
  /* 今日页打卡卡片渲染：连续天数 + 大按钮状态 + 最近 14 天打卡时间轴 */
  function renderCheckinCard() {
    var ds = Store.todayStr();
    var checked = Store.isCheckedIn(ds);
    var streak = Store.consecutiveStreak();
    if (refs.ciStreak) refs.ciStreak.textContent = streak;
    if (refs.ciLabel) refs.ciLabel.textContent = checked ? '今日已打卡 ✓' : '今日打卡';
    if (refs.btnCheckinToday) {
      refs.btnCheckinToday.classList.toggle('done', checked);
      refs.btnCheckinToday.disabled = checked;
      if (checked) { refs.btnCheckinToday.classList.remove('pop'); void refs.btnCheckinToday.offsetWidth; refs.btnCheckinToday.classList.add('pop'); }
    }
    // 最近 14 天打卡点（时间轴）
    if (refs.checkinDots) {
      var active = {}; (Store.getCheckins() || []).forEach(function (d) { active[d] = true; });
      var html = '';
      for (var i = 13; i >= 0; i--) {
        var d = new Date(); d.setDate(d.getDate() - i);
        var key = d.toISOString().slice(0, 10);
        var cls = 'ci-dot' + (active[key] ? ' done' : '') + (key === ds ? ' today' : '');
        html += '<span class="' + cls + '" title="' + key + '"></span>';
      }
      refs.checkinDots.innerHTML = html;
    }
  }
  /* 绑定点击 + 触摸：安卓浏览器同时触发 touchstart/click 时用标记防重复，
     彻底规避部分机型 click 不触发或 300ms 延迟导致“点了没反应” */
  function bindTap(el, fn) {
    if (!el) return;
    var fired = false;
    function run(e) { if (fired) return; fired = true; setTimeout(function () { fired = false; }, 600); fn(e); }
    el.addEventListener('click', run);
    el.addEventListener('touchstart', function (e) { e.preventDefault(); run(e); }, { passive: false });
  }

  /* ============ 考研真题高频词 ============ */
  function renderHfWords() {
    var all = (typeof window !== 'undefined' && window.DICTIONARY) ? window.DICTIONARY : [];
    var q = (refs.hfSearch.value || '').trim().toLowerCase();
    var list = all;
    if (q) list = all.filter(function (d) { return d.w.toLowerCase().indexOf(q) >= 0 || d.c.toLowerCase().indexOf(q) >= 0; });
    refs.hfCount.textContent = all.length;
    refs.hfList.innerHTML = '';
    if (!list.length) { refs.hfList.appendChild(el('div', 'empty-hint', '没有匹配的单词')); return; }
    list.slice(0, 200).forEach(function (d) {
      var item = el('div', 'hf-item');
      item.appendChild(el('div', 'hf-word', d.w));
      item.appendChild(el('div', 'hf-cn', d.c));
      var add = el('button', 'hf-add', '+ 生词本');
      if (Store.findVocab(d.w)) { add.textContent = '已在'; add.disabled = true; }
      else add.addEventListener('click', function () { Store.addVocab(d.w, d.c); showToast('已加入生词本：' + d.w); add.textContent = '已加入'; add.disabled = true; });
      item.appendChild(add);
      refs.hfList.appendChild(item);
    });
    if (list.length > 200) refs.hfList.appendChild(el('div', 'muted', '（仅显示前 200 条，输入关键词精确查找）'));
  }

  /* ============ 学习计划：模块掌握 + 章节进度 + 计划联动 ============ */
  function parseChapter(ch) {
    var i = ch.indexOf(' · ');
    if (i > 0) return { g: ch.slice(0, i), n: ch.slice(i + 3) };
    return { g: '其他', n: ch };
  }

  // 模块掌握情况：可编辑（已掌握 / 进行中 / 未开始）+ 增删
  function renderMastery() {
    var box = refs.masteryList; box.innerHTML = '';
    var m = Store.getModuleMastery();
    var keys = Object.keys(m);
    if (!keys.length) { box.appendChild(el('div', 'empty-hint', '还没有模块，先在下方添加一个吧')); return; }
    var STAT = ['已掌握', '进行中', '未开始'];
    var COLOR = { '已掌握': 'ok', '进行中': 'mid', '未开始': 'new' };
    keys.forEach(function (name) {
      var status = m[name] || '未开始';
      var row = el('div', 'mastery-row');
      row.appendChild(el('div', 'mastery-name', name));
      var opts = el('div', 'mastery-opts');
      STAT.forEach(function (st) {
        var b = el('button', 'mastery-opt ' + (st === status ? 'active ' + COLOR[st] : ''), st);
        b.addEventListener('click', function () { Store.setModuleMastery(name, st); renderMastery(); });
        opts.appendChild(b);
      });
      row.appendChild(opts);
      var del = el('button', 'mastery-del', '×');
      del.title = '删除模块';
      del.addEventListener('click', function () {
        var cur = Store.getModuleMastery(); delete cur[name]; Store.save(); renderMastery();
      });
      row.appendChild(del);
      box.appendChild(row);
    });
  }

  // 单个学科的章节进度卡片（数学与计划页共用，数据联动）
  // 章节完成度热力图（绿=已掌握，橙=学习中，灰=未触及）：一眼看出该攻哪章
  function renderMasteryHeatmap(chapters, doneSet, current) {
    var wrap = el('div', 'chapter-heatmap');
    wrap.appendChild(el('span', 'heat-label', '掌握度：'));
    chapters.forEach(function (ch, idx) {
      var isDone = doneSet.indexOf(idx) >= 0;
      var isCur = idx === current;
      var cell = el('span', 'heat-cell' + (isDone ? ' done' : (isCur ? ' current' : '')));
      cell.title = parseChapter(ch).n + (isDone ? '（已掌握）' : (isCur ? '（学习中）' : '（未触及）'));
      wrap.appendChild(cell);
    });
    return wrap;
  }

  // 单个章节项（数学 / 通用 / 408 共用）
  function buildChapterItem(o) {
    var p = parseChapter(o.ch);
    var cls = 'chapter-item';
    if (o.isCurrent) cls += ' current';
    if (o.isDone) cls += ' done';
    var item = el('div', cls);
    item.style.borderLeftColor = o.groupColor;
    var chk = el('button', 'chapter-check' + (o.isDone ? ' checked' : ''));
    chk.innerHTML = o.isDone ? '✓' : '';
    chk.title = o.isDone ? '取消完成标记' : '标记为已完成';
    chk.addEventListener('click', function (e) { e.stopPropagation(); o.onToggle(o.idx); });
    item.appendChild(chk);
    item.appendChild(el('span', 'chapter-idx', String(o.idx + 1)));
    item.appendChild(el('span', 'chapter-name', (p.g !== '其他' ? '【' + p.g + '】' : '') + p.n));
    item.addEventListener('click', function () { o.onCurrent(o.idx); });
    return item;
  }

  function renderChapterBlock(key, mount) {
    if (key === 'cs408') { renderCs408Grouped(mount); return; }
    if (key === 'math') { renderMathGrouped(mount); return; }
    var subjectName, chapters, current, doneSet;
    if (key === 'math') { subjectName = '数学'; chapters = Store.getMathChapters(); current = Store.getMathCurrent(); doneSet = Store.getMathDone(); }
    else {
      var obj = Store.getSubjectChapters(key) || { chapters: [], current: -1, done: [] };
      var s = Store.getSubjects().filter(function (x) { return x.key === key; })[0];
      subjectName = s ? s.name : key;
      chapters = obj.chapters || []; current = (typeof obj.current === 'number' ? obj.current : -1);
      doneSet = Array.isArray(obj.done) ? obj.done : [];
    }
    mount.innerHTML = '';
    var block = el('div', 'chapter-block');
    var head = el('div', 'chapter-head');
    head.appendChild(el('span', 'chapter-subject', subjectName));
    block.appendChild(head);

    var total = chapters.length;
    var doneCount = doneSet.length;
    var pct = total ? Math.round(doneCount / total * 100) : 0;
    var barWrap = el('div', 'chapter-bar');
    var fill = el('div', 'chapter-fill'); fill.style.width = pct + '%';
    if (doneCount === 0) fill.style.background = '#9ca3af';
    barWrap.appendChild(fill);
    block.appendChild(barWrap);
    var prog = el('div', 'chapter-prog');
    prog.textContent = total ? ('已完成 ' + doneCount + ' / ' + total + '（' + pct + '%）' + (current >= 0 ? ' · 当前：' + parseChapter(chapters[current]).n : ' · 未开始'))
      : '暂无章节，可在下方添加';
    block.appendChild(prog);
    if (total) block.appendChild(renderMasteryHeatmap(chapters, doneSet, current));

    if (total) {
      var list = el('div', 'chapter-list');
      chapters.forEach(function (ch, idx) {
        var p = parseChapter(ch);
        var isDone = doneSet.indexOf(idx) >= 0;
        var isCurrent = idx === current;
        var groupColor = GROUP_COLORS[p.g] || '#9ca3af';
        list.appendChild(buildChapterItem({
          key: key, ch: ch, idx: idx, isDone: isDone, isCurrent: isCurrent, groupColor: groupColor,
          onToggle: function (i) {
            if (key === 'math') Store.toggleMathDone(i);
            else {
              var newObj = Store.getSubjectChapters(key) || { chapters: chapters, current: current, done: doneSet.slice() };
              newObj.done = Array.isArray(newObj.done) ? newObj.done : [];
              var di = newObj.done.indexOf(i);
              if (di >= 0) newObj.done.splice(di, 1); else newObj.done.push(i);
              Store.setSubjectChapters(key, newObj);
            }
            renderChapterBlock(key, mount);
            renderAggSubjectProgress();
          },
          onCurrent: function (i) {
            if (key === 'math') Store.setMathCurrent(i);
            else Store.setSubjectChapters(key, { chapters: chapters, current: i, done: doneSet });
            renderChapterBlock(key, mount);
          }
        }));
      });
      block.appendChild(list);
    }

    var addRow = el('div', 'chapter-add');
    var inp = el('input'); inp.type = 'text'; inp.placeholder = '新增章节（可写「分组 · 章节名」）';
    var btn = el('button', 'btn btn-ghost', '添加');
    btn.addEventListener('click', function () {
      var v = inp.value.trim(); if (!v) return;
      var newChapters = chapters.slice(); newChapters.push(v);
      if (key === 'math') Store.setMathChapters(newChapters);
      else Store.setSubjectChapters(key, { chapters: newChapters, current: current, done: doneSet });
      renderChapterBlock(key, mount);
    });
    addRow.appendChild(inp); addRow.appendChild(btn);
    block.appendChild(addRow);
    mount.appendChild(block);
  }

  // 通用分组折叠渲染：408 四书 / 数学（高数·线代·概率）共用（折叠态持久化到 localStorage）
  function renderGroupedChapters(o) {
    var chapters = o.chapters;
    var current = o.current;
    var doneSet = o.doneSet;
    o.mount.innerHTML = '';
    var block = el('div', 'chapter-block');

    var head = el('div', 'chapter-head');
    head.appendChild(el('span', 'chapter-subject', o.title));
    block.appendChild(head);
    var total = chapters.length;
    var doneCount = doneSet.length;
    var pct = total ? Math.round(doneCount / total * 100) : 0;
    var barWrap = el('div', 'chapter-bar');
    var fill = el('div', 'chapter-fill'); fill.style.width = pct + '%';
    if (doneCount === 0) fill.style.background = '#9ca3af';
    barWrap.appendChild(fill);
    block.appendChild(barWrap);
    var prog = el('div', 'chapter-prog');
    prog.textContent = total ? ('已完成 ' + doneCount + ' / ' + total + '（' + pct + '%）' + (current >= 0 ? ' · 当前：' + parseChapter(chapters[current]).n : ' · 未开始'))
      : '暂无章节，可在下方添加';
    block.appendChild(prog);
    if (total) block.appendChild(renderMasteryHeatmap(chapters, doneSet, current));

    if (total) {
      var groups = {};
      chapters.forEach(function (ch, idx) {
        var p = parseChapter(ch);
        if (!groups[p.g]) groups[p.g] = [];
        groups[p.g].push({ ch: ch, idx: idx });
      });
      var groupKeys = Object.keys(groups);
      var collapsed = o.getCollapsed();
      // 全部展开 / 收起
      var ctrl = el('div', 'book-ctrl');
      var expandAll = el('button', 'btn btn-ghost btn-sm', '▾ 全部展开');
      expandAll.addEventListener('click', function () {
        var nc = {}; groupKeys.forEach(function (g) { nc[g] = false; });
        o.setCollapsed(nc); renderGroupedChapters(o);
      });
      var collapseAll = el('button', 'btn btn-ghost btn-sm', '▸ 全部收起');
      collapseAll.addEventListener('click', function () {
        var nc = {}; groupKeys.forEach(function (g) { nc[g] = true; });
        o.setCollapsed(nc); renderGroupedChapters(o);
      });
      ctrl.appendChild(expandAll); ctrl.appendChild(collapseAll);
      block.appendChild(ctrl);

      groupKeys.forEach(function (g) {
        var items = groups[g];
        var gTotal = items.length;
        var gDone = items.filter(function (it) { return doneSet.indexOf(it.idx) >= 0; }).length;
        var isCollapsed = !!collapsed[g];
        var book = el('div', 'book-group' + (isCollapsed ? ' collapsed' : ''));
        var bhead = el('div', 'book-head');
        bhead.appendChild(el('span', 'book-caret', isCollapsed ? '▸' : '▾'));
        bhead.appendChild(el('span', 'book-name', g));
        bhead.appendChild(el('span', 'book-count', gDone + '/' + gTotal));
        bhead.addEventListener('click', function () {
          var curState = o.getCollapsed();
          curState[g] = !curState[g];
          o.setCollapsed(curState); renderGroupedChapters(o);
        });
        book.appendChild(bhead);
        if (!isCollapsed) {
          var list = el('div', 'chapter-list book-list');
          items.forEach(function (it) {
            var p = parseChapter(it.ch);
            list.appendChild(buildChapterItem({
              ch: it.ch, idx: it.idx,
              isDone: doneSet.indexOf(it.idx) >= 0, isCurrent: it.idx === current,
              groupColor: o.groupColors[p.g] || '#9ca3af',
              onToggle: function (i) { o.onToggle(i); },
              onCurrent: function (i) { o.onCurrent(i); }
            }));
          });
          book.appendChild(list);
        }
        block.appendChild(book);
      });
    }

    var addRow = el('div', 'chapter-add');
    var inp = el('input'); inp.type = 'text'; inp.placeholder = '新增章节（可写「分组 · 章节名」）';
    var btn = el('button', 'btn btn-ghost', '添加');
    btn.addEventListener('click', function () {
      var v = inp.value.trim(); if (!v) return;
      o.onAddChapter(v);
    });
    addRow.appendChild(inp); addRow.appendChild(btn);
    block.appendChild(addRow);
    o.mount.appendChild(block);
  }

  // 408：按 4 本书分组（折叠态持久化到 localStorage）
  function renderCs408Grouped(mount) {
    renderGroupedChapters({
      mount: mount,
      title: '408 计算机专业基础',
      chapters: Store.get408Chapters(),
      current: Store.get408Current(),
      doneSet: Store.get408Done(),
      groupColors: CS408_GROUP_COLORS,
      getCollapsed: Store.getCs408BooksCollapsed,
      setCollapsed: Store.setCs408BooksCollapsed,
      onToggle: function (i) { Store.toggle408Done(i); renderCs408Grouped(mount); renderAggSubjectProgress(); },
      onCurrent: function (i) { Store.set408Current(i); renderCs408Grouped(mount); },
      onAddChapter: function (v) { var arr = Store.get408Chapters().slice(); arr.push(v); Store.set408Chapters(arr); renderCs408Grouped(mount); }
    });
  }

  // 数学：按 高数 / 线代 / 概率 分组折叠（与 408 相同交互）
  function renderMathGrouped(mount) {
    renderGroupedChapters({
      mount: mount,
      title: '数学',
      chapters: Store.getMathChapters(),
      current: Store.getMathCurrent(),
      doneSet: Store.getMathDone(),
      groupColors: GROUP_COLORS,
      getCollapsed: Store.getMathBooksCollapsed,
      setCollapsed: Store.setMathBooksCollapsed,
      onToggle: function (i) { Store.toggleMathDone(i); renderMathGrouped(mount); renderAggSubjectProgress(); },
      onCurrent: function (i) { Store.setMathCurrent(i); renderMathGrouped(mount); },
      onAddChapter: function (v) { var arr = Store.getMathChapters().slice(); arr.push(v); Store.setMathChapters(arr); renderMathGrouped(mount); }
    });
  }

  function renderSubjectChapters() {
    var box = refs.subjectChapters; box.innerHTML = '';
    var subs = Store.getSubjects();
    if (!subs.length) { box.appendChild(el('div', 'empty-hint', '请先在「配置」中添加考试科目')); return; }
    subs.forEach(function (s) {
      var wrap = el('div', 'subject-chapter-wrap');
      renderChapterBlock(s.key, wrap);
      box.appendChild(wrap);
    });
  }

  function renderPlanItems() {
    var box = refs.planItems; box.innerHTML = '';
    var items = Store.getPlanItems();
    if (!items.length) { box.appendChild(el('div', 'empty-hint', '还没有计划项，点上方「按进度智能生成」或手动添加')); return; }
    var doneCount = items.filter(function (i) { return i.done; }).length;
    items.forEach(function (it) {
      var row = el('div', 'plan-item' + (it.done ? ' done' : ''));
      var chk = el('div', 'plan-check', it.done ? '✓' : '');
      chk.addEventListener('click', function () { Store.togglePlanItem(it.id); renderPlanItems(); });
      var txtWrap = el('div', 'plan-txt-wrap');
      txtWrap.appendChild(el('div', 'plan-text', it.text || ''));
      if (it.note) txtWrap.appendChild(el('div', 'plan-note', '说明：' + it.note));
      var del = el('button', 'plan-del', '删除');
      del.addEventListener('click', function () { Store.removePlanItem(it.id); renderPlanItems(); });
      row.appendChild(chk); row.appendChild(txtWrap); row.appendChild(del);
      box.appendChild(row);
    });
    box.appendChild(el('div', 'plan-prog-line', '整体完成 ' + doneCount + ' / ' + items.length));
  }

  // 依据「模块掌握情况 + 章节进度」智能生成计划项
  function onSmartPlan() {
    var items = [];
    var mastery = Store.getModuleMastery();
    Object.keys(mastery).forEach(function (name) {
      var st = mastery[name];
      if (st === '未开始') items.push({ text: '启动模块：' + name, note: '当前标记「未开始」，建议先制定入门学习计划' });
      else if (st === '进行中') items.push({ text: '推进模块：' + name, note: '当前「进行中」，建议本周安排重点攻克' });
    });
    Store.getSubjects().forEach(function (s) {
      var ch, doneArr, total, doneCount;
      if (s.key === 'math') { ch = Store.getMathChapters(); doneArr = Store.getMathDone(); }
      else if (s.key === 'cs408') { ch = Store.get408Chapters(); doneArr = Store.get408Done(); }
      else { var obj = Store.getSubjectChapters(s.key) || {}; ch = obj.chapters || []; doneArr = Array.isArray(obj.done) ? obj.done : []; }
      total = ch.length; doneCount = doneArr.length;
      if (total) {
        // 找第一个未完成的章节作为"下一步"
        var nextIdx = -1;
        for (var i = 0; i < total; i++) { if (doneArr.indexOf(i) < 0) { nextIdx = i; break; } }
        if (doneCount === 0) items.push({ text: '开始《' + s.name + '》：' + parseChapter(ch[nextIdx >= 0 ? nextIdx : 0]).n, note: '尚未完成任何章节' });
        else if (doneCount < total) items.push({ text: '继续《' + s.name + '》：' + (nextIdx >= 0 ? parseChapter(ch[nextIdx]).n : '复习已学内容'), note: '已完成 ' + doneCount + '/' + total + ' 章' });
        else items.push({ text: '复习《' + s.name + '》全部章节', note: '已完成全部 ' + total + ' 章，建议进入刷题巩固' });
      }
    });
    if (!items.length) { showToast('暂无进度数据，先填写模块掌握情况或章节进度吧'); return; }
    items.forEach(function (it) { Store.addPlanItem({ text: it.text, note: it.note || '', done: false }); });
    renderPlanItems(); showToast('已按进度生成 ' + items.length + ' 项计划 ⚡');
  }

  // 解析 AI 返回的 JSON 数组（兼容 ```json 围栏 / 前后多余文字）
  function parseJsonArray(str) {
    if (!str) return null;
    var s = String(str).trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    var a = s.indexOf('['), b = s.lastIndexOf(']');
    if (a < 0 || b < 0 || b < a) return null;
    try { var arr = JSON.parse(s.slice(a, b + 1)); return Array.isArray(arr) ? arr : null; } catch (e) { return null; }
  }

  // AI 生成个性化学习计划（基于模块掌握情况 + 章节进度 + 距考研倒计时）
  function onAiPlan() {
    var c = Store.getAiConfig();
    if (!c.baseUrl || !c.model || !c.key) { showToast('请先在「配置」页填写 AI 接口地址、模型与 Key', 'err'); return; }
    var days = refs.aggCountdown ? refs.aggCountdown.textContent : '';
    var mastery = Store.getModuleMastery();
    var masLines = Object.keys(mastery).map(function (n) { return '- ' + n + '：' + mastery[n]; });
    var subLines = [];
    Store.getSubjects().forEach(function (s) {
      var ch, doneArr, total, doneCount;
      if (s.key === 'math') { ch = Store.getMathChapters(); doneArr = Store.getMathDone(); }
      else if (s.key === 'cs408') { ch = Store.get408Chapters(); doneArr = Store.get408Done(); }
      else { var obj = Store.getSubjectChapters(s.key) || {}; ch = obj.chapters || []; doneArr = Array.isArray(obj.done) ? obj.done : []; }
      total = ch.length; doneCount = doneArr.length;
      subLines.push('- 《' + s.name + '》已完成 ' + doneCount + '/' + total + ' 章');
    });
    var userMsg = '我是考研备考学生。当前情况：\n模块掌握：\n' + masLines.join('\n') + '\n各科进度：\n' + subLines.join('\n') + '\n距考研约 ' + (days || '未知') + ' 天。\n请为我生成接下来一周的个性化学习计划，按优先级排序。只返回一个 JSON 数组，每个元素形如 {"text":"计划内容","note":"为什么/怎么做","priority":"高|中|低"}，不要任何解释文字。';
    var btn = refs.btnAiPlan;
    if (btn) { btn.disabled = true; btn.textContent = '🤖 AI 生成中…'; }
    aiChat([
      { role: 'system', content: '你是考研规划助手。只输出可被 JSON.parse 解析的 JSON 数组，不要 markdown、不要多余文字。' },
      { role: 'user', content: userMsg }
    ], { maxTokens: 1500 }).then(function (res) {
      var arr = parseJsonArray(res.content);
      if (!arr || !arr.length) { showToast('AI 未返回有效计划，请重试', 'err'); return; }
      arr.forEach(function (it) {
        if (it && it.text) Store.addPlanItem({ text: String(it.text), note: it.note ? String(it.note) : '', done: false });
      });
      renderPlanItems();
      showToast('🤖 AI 已生成 ' + arr.length + ' 项计划', 'ok');
    }).catch(function (err) {
      showToast('AI 生成失败：' + (err.msg || '未知错误'), 'err');
    }).then(function () {
      if (btn) { btn.disabled = false; btn.textContent = '🤖 AI 生成计划'; }
    });
  }

  /* ============ 数学模块：章节 + 分类刷题 ============ */
  var mathPractice = null;

  function renderMathChapters() {
    var box = refs.mathChapters;
    if (!Store.getMathChapters().length) Store.setMathChapters(Store.getMathVolumeTemplates()[Store.getMathVolume()].slice());
    var vol = Store.getMathVolume();
    var vols = Object.keys(Store.getMathVolumeTemplates());
    box.innerHTML = '';
    // 卷种选择器（数一/数二/数三，章节按大纲区分；数二不含概率）
    var volWrap = el('div', 'math-volume');
    volWrap.appendChild(el('span', 'mv-label', '卷种：'));
    var sel = el('select');
    sel.className = 'mv-select';
    vols.forEach(function (v) {
      var opt = el('option'); opt.value = v; opt.textContent = v; opt.selected = (v === vol);
      sel.appendChild(opt);
    });
    sel.addEventListener('change', function () {
      var v = sel.value;
      if (v === Store.getMathVolume()) return;
      if (!confirm('切换为「' + v + '」会按新大纲重置章节列表：同名已完成章节会保留，新大纲没有的章节进度将丢弃。确定切换？')) { renderMathChapters(); return; }
      Store.setMathVolume(v);
      renderMathChapters();
      renderSubjectChapters();
      renderAggSubjectProgress();
      showToast('已切换卷种：' + v, 'ok');
    });
    volWrap.appendChild(sel);
    box.appendChild(volWrap);
    var mount = el('div');
    box.appendChild(mount);
    renderMathGrouped(mount);
  }

  /* renderMathMistakes 已合并进 renderMistakeList（三套错题本统一列表） */

  /* ============ 错题速查卡（Leitner 记忆曲线复习，三套合并） ============ */
  var flash = null;

  // 按范围取待复习（数学/408 各自到期逻辑；all = 二者并集），并打 scope 标签便于路由复习调用
  function getDueByScope(scope) {
    var t = Store.todayStr();
    if (scope === 'math') return Store.getMathDueMistakes(t).map(function (m) { return Object.assign({}, m, { scope: 'math' }); });
    if (scope === 'cs408') return Store.get408DueMistakes(t).map(function (m) { return Object.assign({}, m, { scope: 'cs408' }); });
    return Store.getMathDueMistakes(t).map(function (m) { return Object.assign({}, m, { scope: 'math' }); })
      .concat(Store.get408DueMistakes(t).map(function (m) { return Object.assign({}, m, { scope: 'cs408' }); }));
  }

  function startFlash(scope) {
    scope = scope || 'all';
    var due = getDueByScope(scope);
    flash = { scope: scope, items: due.slice(), index: 0, revealed: false, total: due.length, right: 0, wrong: 0 };
    renderFlashcard();
  }

  function renderFlashcard() {
    var box = refs.mistakeFlashcardBox;
    if (!box) return;
    box.innerHTML = '';
    if (!flash) { startFlash('all'); return; }
    var s = flash;
    var dueTotal = getDueByScope(s.scope).length;
    var overview = el('div', 'flash-overview');
    overview.appendChild(el('span', 'flash-count', '待复习队列：' + dueTotal + ' 张'));
    box.appendChild(overview);
    if (!s.items.length) {
      box.appendChild(el('div', 'empty-hint', '🎉 今天没有待复习的错题，去「错题本」记新题吧！'));
      return;
    }
    if (s.index >= s.items.length) {
      var acc = s.total ? Math.round(s.right / s.total * 100) : 0;
      var done = el('div', 'review-done');
      done.appendChild(el('div', 'big', '本轮复习完成 🎉'));
      done.appendChild(el('div', 'muted', '共 ' + s.total + ' 张 · 答对 ' + s.right + ' · 答错 ' + s.wrong + ' · 正确率 ' + acc + '%'));
      box.appendChild(done);
      var again = el('button', 'btn btn-primary', '重新抽取待复习');
      again.addEventListener('click', function () { startFlash(s.scope); });
      box.appendChild(again);
      return;
    }
    var cur = s.items[s.index];
    var card = el('div', 'flashcard');
    var progressText = '第 ' + (s.index + 1) + ' / ' + s.items.length + ' 张';
    if (cur.scope === 'math') progressText += ' · 箱位 ' + (cur.box || 1) + '/5';
    else progressText += ' · 408';
    card.appendChild(el('div', 'flash-progress', progressText));
    // ⚠️ 此处勿加 escapeHtml：el() 已走 textContent 天然防 XSS，再转义会让 x>0 字面显示成 x&gt;0（数学题高频字符）
    card.appendChild(el('div', 'flash-cat', (cur.scope === 'math' || cur.scope === 'cs408') ? (cur.category || '其他') : (cur.type || '其他')));
    var front = el('div', 'flash-front');
    front.appendChild(el('div', 'flash-label', '题目 / 错因'));
    front.appendChild(el('div', 'flash-q', cur.content || ''));
    card.appendChild(front);
    if (s.revealed) {
      var back = el('div', 'flash-back');
      back.appendChild(el('div', 'flash-label', '答案 / 正确解法 / 备注'));
      back.appendChild(el('div', 'flash-a', cur.note || (cur.created ? '（无备注，原题记录于 ' + cur.created + '）' : '（无备注）')));
      card.appendChild(back);
      var act = el('div', 'flash-actions');
      var rightBtn = el('button', 'btn btn-ok', '✓ 我答对了');
      rightBtn.addEventListener('click', function () {
        s.right++;
        if (cur.scope === 'math') Store.reviewMathMistake(cur.id, true);
        else Store.update408Mistake(cur.id, { reviewed: true });
        s.index++; s.revealed = false; renderFlashcard();
      });
      var wrongBtn = el('button', 'btn btn-bad', '✗ 我答错了');
      wrongBtn.addEventListener('click', function () {
        s.wrong++;
        if (cur.scope === 'math') Store.reviewMathMistake(cur.id, false); // 数学答错回箱1
        // 408 无箱概念：答错保持待复习（不推进间隔）
        s.index++; s.revealed = false; renderFlashcard();
      });
      act.appendChild(rightBtn); act.appendChild(wrongBtn);
      card.appendChild(act);
    } else {
      var show = el('button', 'btn btn-primary', '显示答案');
      show.addEventListener('click', function () { s.revealed = true; renderFlashcard(); });
      card.appendChild(show);
    }
    box.appendChild(card);
  }

  function buildMathPool(cat) {
    var builtin = MATH_BUILTIN_Q;
    var user = Store.getMathQuestions();
    if (cat === '全部') return builtin.concat(user);
    if (cat === '自定义') return user;
    return builtin.filter(function (q) { return q.category === cat; }).concat(user.filter(function (q) { return q.category === cat; }));
  }

  function onMathPracticeStart() {
    var cat = refs.mathPracticeCat.value;
    var pool = buildMathPool(cat);
    if (!pool.length) { refs.mathPractice.innerHTML = '<div class="empty-hint">该分类下还没有题目（去下方「我的题库」添加）</div>'; return; }
    shuffle(pool);
    mathPractice = { items: pool, index: 0, answered: false, correct: 0, total: pool.length, cat: cat };
    renderMathPractice();
  }

  function renderMathPractice() {
    var box = refs.mathPractice;
    if (!mathPractice) { box.innerHTML = '<div class="empty-hint">选择分类后点「开始刷题」</div>'; return; }
    var s = mathPractice;
    if (s.index >= s.items.length) {
      var acc = s.total ? Math.round(s.correct / s.total * 100) : 0;
      box.innerHTML = '<div class="review-done"><div class="big">本组练习完成 🎉</div>' +
        '<div class="muted" style="margin-top:8px">共 ' + s.total + ' 题，答对 ' + s.correct + ' 题，正确率 ' + acc + '%</div></div>';
      return;
    }
    var cur = s.items[s.index];
    var cat = cur.category || '自定义';
    var html = '<div class="practice-en" style="font-size:18px">' + escapeHtml(cur.q) + '</div>';
    html += '<div class="practice-progress">第 ' + (s.index + 1) + ' / ' + s.items.length + ' 题 · ' + escapeHtml(cat) + '</div>';
    html += '<div class="practice-options">';
    if (!Array.isArray(cur.options) || !cur.options.length) {
      html += '<div class="empty-hint">该题缺少选项数据（旧数据或导入异常），请到「我的题库」删除后重新添加</div>';
    } else {
      cur.options.forEach(function (o, i) {
        html += '<button class="practice-opt" data-i="' + i + '">' + escapeHtml(o) + '</button>';
      });
    }
    html += '</div>';
    html += '<div class="practice-feedback" id="mp-feedback"></div>';
    html += '<div class="practice-actions" id="mp-actions"></div>';
    box.innerHTML = html;
    var fb = $('mp-feedback');
    var answered = false;
    box.querySelectorAll('.practice-opt').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (answered) return; answered = true;
        var i = Number(btn.getAttribute('data-i'));
        var correct = (i === cur.answer);
        if (correct) s.correct++;
        Store.recordMathStat(cat, correct);
        box.querySelectorAll('.practice-opt').forEach(function (b) {
          b.disabled = true;
          if (Number(b.getAttribute('data-i')) === cur.answer) b.classList.add('correct');
        });
        if (correct) { btn.classList.add('correct'); fb.textContent = '✅ 答对了'; fb.style.color = '#059669'; }
        else { btn.classList.add('wrong'); fb.textContent = '❌ 正确答案：' + (Array.isArray(cur.options) && cur.options[cur.answer] !== undefined ? cur.options[cur.answer] : '（缺失）'); fb.style.color = '#dc2626'; }
        if (cur.explain) fb.textContent += '　解析：' + cur.explain;
        var act = $('mp-actions');
        var next = el('button', 'btn btn-primary', s.index + 1 >= s.items.length ? '查看结果' : '下一题');
        next.addEventListener('click', function () { s.index++; renderMathPractice(); });
        act.appendChild(next);
      });
    });
  }

  function renderMathQuestionList() {
    var box = refs.mathQuestionList; box.innerHTML = '';
    var list = Store.getMathQuestions();
    if (!list.length) { box.appendChild(el('div', 'empty-hint', '还没有自定义题目')); return; }
    list.forEach(function (q) {
      var item = el('div', 'mistake-item');
      var top = el('div', 'mistake-top');
      top.appendChild(el('span', 'mistake-badge', q.category || '自定义'));
      var del = el('button', 'plan-del', '删除');
      del.addEventListener('click', function () { Store.removeMathQuestion(q.id); renderMathQuestionList(); });
      top.appendChild(del);
      item.appendChild(top);
      item.appendChild(el('div', 'mistake-content', q.q));
      var opts = q.options ? q.options.map(function (o, i) { return (i === q.answer ? '✔ ' : '') + o; }).join('　/　') : '';
      item.appendChild(el('div', 'mistake-meta', '选项：' + opts + (q.explain ? '　解析：' + q.explain : '')));
      box.appendChild(item);
    });
  }

  function onAddMathQuestion() {
    var cat = refs.mqCat.value.trim() || '自定义';
    var q = refs.mqQ.value.trim();
    var opts = [refs.mqOpt0.value.trim(), refs.mqOpt1.value.trim(), refs.mqOpt2.value.trim(), refs.mqOpt3.value.trim()];
    var ans = Number(refs.mqAnswer.value);
    if (!q) { alert('请输入题干'); return; }
    if (opts.some(function (o) { return !o; })) { alert('请填全 4 个选项'); return; }
    if (isNaN(ans) || ans < 0 || ans > 3) { alert('正确项须为 0-3'); return; }
    Store.addMathQuestion({ category: cat, q: q, options: opts, answer: ans, explain: refs.mqExplain.value.trim() });
    refs.mqCat.value = ''; refs.mqQ.value = ''; refs.mqOpt0.value = ''; refs.mqOpt1.value = ''; refs.mqOpt2.value = ''; refs.mqOpt3.value = ''; refs.mqAnswer.value = ''; refs.mqExplain.value = '';
    renderMathQuestionList(); showToast('题目已加入题库 ✅');
  }

  /* ============ 408 专业课模块：章节 + 分类刷题 + 知识点 + 真题 ============ */
  var cs408Practice = null;
  var kpFilter = '全部';

  function render408Chapters() {
    var box = refs.cs408Chapters;
    if (!Store.get408Chapters().length) Store.set408Chapters(CS408_CHAPTERS_PREFILL.slice());
    renderChapterBlock('cs408', box);
  }

  /* render408Mistakes 已合并进 renderMistakeList（三套错题本统一列表） */
  /* onAdd408Mistake 已合并进 btn-add-mistake 的按范围路由保存（见下方事件绑定） */

  function build408Pool(cat) {
    var builtin = CS408_BUILTIN_Q;
    var user = Store.get408Questions();
    if (cat === '全部') return builtin.concat(user);
    if (cat === '自定义') return user;
    return builtin.filter(function (q) { return q.category === cat; }).concat(user.filter(function (q) { return q.category === cat; }));
  }

  function on408PracticeStart() {
    var cat = refs.cs408PracticeCat.value;
    var pool = build408Pool(cat);
    if (!pool.length) { refs.cs408Practice.innerHTML = '<div class="empty-hint">该分类下还没有题目（去下方「我的题库」添加）</div>'; return; }
    shuffle(pool);
    cs408Practice = { items: pool, index: 0, answered: false, correct: 0, total: pool.length, cat: cat };
    render408Practice();
  }

  function render408Practice() {
    var box = refs.cs408Practice;
    if (!cs408Practice) { box.innerHTML = '<div class="empty-hint">选择分类后点「开始刷题」</div>'; return; }
    var s = cs408Practice;
    if (s.index >= s.items.length) {
      var acc = s.total ? Math.round(s.correct / s.total * 100) : 0;
      box.innerHTML = '<div class="review-done"><div class="big">本组练习完成 🎉</div>' +
        '<div class="muted" style="margin-top:8px">共 ' + s.total + ' 题，答对 ' + s.correct + ' 题，正确率 ' + acc + '%</div></div>';
      return;
    }
    var cur = s.items[s.index];
    var cat = cur.category || '自定义';
    var html = '<div class="practice-en" style="font-size:18px">' + escapeHtml(cur.q) + '</div>';
    html += '<div class="practice-progress">第 ' + (s.index + 1) + ' / ' + s.items.length + ' 题 · ' + escapeHtml(cat) + '</div>';
    html += '<div class="practice-options">';
    if (!Array.isArray(cur.options) || !cur.options.length) {
      html += '<div class="empty-hint">该题缺少选项数据（旧数据或导入异常），请到「我的题库」删除后重新添加</div>';
    } else {
      cur.options.forEach(function (o, i) {
        html += '<button class="practice-opt" data-i="' + i + '">' + escapeHtml(o) + '</button>';
      });
    }
    html += '</div>';
    html += '<div class="practice-feedback" id="cp-feedback"></div>';
    html += '<div class="practice-actions" id="cp-actions"></div>';
    box.innerHTML = html;
    var fb = $('cp-feedback');
    var answered = false;
    box.querySelectorAll('.practice-opt').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (answered) return; answered = true;
        var i = Number(btn.getAttribute('data-i'));
        var correct = (i === cur.answer);
        if (correct) s.correct++;
        Store.record408Stat(cat, correct);
        box.querySelectorAll('.practice-opt').forEach(function (b) {
          b.disabled = true;
          if (Number(b.getAttribute('data-i')) === cur.answer) b.classList.add('correct');
        });
        if (correct) { btn.classList.add('correct'); fb.textContent = '✅ 答对了'; fb.style.color = '#059669'; }
        else { btn.classList.add('wrong'); fb.textContent = '❌ 正确答案：' + (Array.isArray(cur.options) && cur.options[cur.answer] !== undefined ? cur.options[cur.answer] : '（缺失）'); fb.style.color = '#dc2626'; }
        if (cur.explain) fb.textContent += '　解析：' + cur.explain;
        var act = $('cp-actions');
        var next = el('button', 'btn btn-primary', s.index + 1 >= s.items.length ? '查看结果' : '下一题');
        next.addEventListener('click', function () { s.index++; render408Practice(); });
        act.appendChild(next);
      });
    });
  }

  function render408QuestionList() {
    var box = refs.cs408QuestionList; box.innerHTML = '';
    var list = Store.get408Questions();
    if (!list.length) { box.appendChild(el('div', 'empty-hint', '还没有自定义题目')); return; }
    list.forEach(function (q) {
      var item = el('div', 'mistake-item');
      var top = el('div', 'mistake-top');
      top.appendChild(el('span', 'mistake-badge', q.category || '自定义'));
      var del = el('button', 'plan-del', '删除');
      del.addEventListener('click', function () { Store.remove408Question(q.id); render408QuestionList(); });
      top.appendChild(del);
      item.appendChild(top);
      item.appendChild(el('div', 'mistake-content', q.q));
      var opts = q.options ? q.options.map(function (o, i) { return (i === q.answer ? '✔ ' : '') + o; }).join('　/　') : '';
      item.appendChild(el('div', 'mistake-meta', '选项：' + opts + (q.explain ? '　解析：' + q.explain : '')));
      box.appendChild(item);
    });
  }

  function onAdd408Question() {
    var cat = refs.cqCat.value.trim() || '自定义';
    var q = refs.cqQ.value.trim();
    var opts = [refs.cqOpt0.value.trim(), refs.cqOpt1.value.trim(), refs.cqOpt2.value.trim(), refs.cqOpt3.value.trim()];
    var ans = Number(refs.cqAnswer.value);
    if (!q) { alert('请输入题干'); return; }
    if (opts.some(function (o) { return !o; })) { alert('请填全 4 个选项'); return; }
    if (isNaN(ans) || ans < 0 || ans > 3) { alert('正确项须为 0-3'); return; }
    Store.add408Question({ category: cat, q: q, options: opts, answer: ans, explain: refs.cqExplain.value.trim() });
    refs.cqCat.value = ''; refs.cqQ.value = ''; refs.cqOpt0.value = ''; refs.cqOpt1.value = ''; refs.cqOpt2.value = ''; refs.cqOpt3.value = ''; refs.cqAnswer.value = ''; refs.cqExplain.value = '';
    render408QuestionList(); showToast('题目已加入题库 ✅');
  }

  function render408Knowledge() {
    var box = refs.kpList; box.innerHTML = '';
    var all = Store.get408Knowledge();
    // 首次预填
    if (!all.length && !Store.get408Knowledge().length) {
      CS408_KNOWLEDGE_PREFILL.forEach(function (k) { Store.add408Knowledge({ subject: k.subject, title: k.title, content: k.content, created: Store.todayStr() }); });
      all = Store.get408Knowledge();
    }
    var list = kpFilter === '全部' ? all : all.filter(function (k) { return k.subject === kpFilter; });
    // 筛选 chips
    var cats = { '全部': all.length };
    all.forEach(function (k) { cats[k.subject] = (cats[k.subject] || 0) + 1; });
    refs.kpFilter.innerHTML = '';
    Object.keys(cats).forEach(function (c) {
      var chip = el('div', 'chip' + (c === kpFilter ? ' active' : ''), c + ' (' + cats[c] + ')');
      chip.addEventListener('click', function () { kpFilter = c; render408Knowledge(); });
      refs.kpFilter.appendChild(chip);
    });
    if (!list.length) { box.appendChild(el('div', 'empty-hint', '还没有知识点，在上方添加吧')); return; }
    list.forEach(function (k) {
      var card = el('div', 'kp-card');
      card.style.borderLeftColor = CS408_GROUP_COLORS[k.subject] || '#9ca3af';
      var top = el('div', 'kp-top');
      top.appendChild(el('span', 'kp-badge', k.subject || '其他'));
      var del = el('button', 'plan-del', '删除');
      del.addEventListener('click', function () { Store.remove408Knowledge(k.id); render408Knowledge(); });
      top.appendChild(del);
      card.appendChild(top);
      card.appendChild(el('div', 'kp-title', k.title || ''));
      card.appendChild(el('div', 'kp-content', k.content || ''));
      box.appendChild(card);
    });
  }

  function onAdd408Knowledge() {
    var title = refs.kpTitle.value.trim();
    var content = refs.kpContent.value.trim();
    if (!title || !content) { alert('请填写标题和内容'); return; }
    Store.add408Knowledge({ subject: refs.kpSubject.value, title: title, content: content, created: Store.todayStr() });
    refs.kpTitle.value = ''; refs.kpContent.value = '';
    render408Knowledge(); showToast('知识点已添加 ✅');
  }

  function render408Years() {
    var box = refs.yrList; box.innerHTML = '';
    var list = Store.get408Years();
    if (!list.length) { box.appendChild(el('div', 'empty-hint', '还没有真题记录，添加每年的得分来追踪进步')); return; }
    list.forEach(function (y) {
      var pct = y.total ? Math.round(y.score / y.total * 100) : 0;
      var row = el('div', 'yr-row');
      row.appendChild(el('span', 'yr-year', y.year + ' 年'));
      var bar = el('div', 'yr-bar');
      var fill = el('div', 'yr-fill'); fill.style.width = pct + '%';
      if (pct >= 80) fill.style.background = 'var(--ok)';
      else if (pct >= 60) fill.style.background = 'var(--primary)';
      else fill.style.background = 'var(--danger)';
      bar.appendChild(fill);
      row.appendChild(bar);
      row.appendChild(el('span', 'yr-score', y.score + '/' + (y.total || 150)));
      if (y.note) row.appendChild(el('span', 'yr-note', y.note));
      var del = el('button', 'plan-del', '删除');
      del.addEventListener('click', function () { Store.remove408Year(y.id); render408Years(); });
      row.appendChild(del);
      box.appendChild(row);
    });
  }

  function onAdd408Year() {
    var year = Number(refs.yrYear.value);
    var score = Number(refs.yrScore.value);
    var total = Number(refs.yrTotal.value) || 150;
    if (!year || isNaN(year)) { alert('请输入年份'); return; }
    if (isNaN(score)) { alert('请输入得分'); return; }
    Store.add408Year({ year: year, score: score, total: total, note: refs.yrNote.value.trim() });
    refs.yrYear.value = ''; refs.yrScore.value = ''; refs.yrTotal.value = ''; refs.yrNote.value = '';
    render408Years(); showToast('真题记录已添加 ✅');
  }

  function update408TabVisibility() {
    var subs = Store.getSubjects();
    // 408 Tab 显示条件：科目列表里勾选了「408」（专业名包含 408 也算）
    var hasCs408 = subs.some(function (s) {
      return s.key === 'cs408' || ((s.name || '').indexOf('408') >= 0);
    });
    // 兼容老版本：报考专业字段包含 408 字符串时也显示
    if (!hasCs408) {
      var major = Store.getConfig().major || '';
      hasCs408 = major.indexOf('408') >= 0;
    }
    var btn = document.querySelector('.tab-btn[data-tab="cs408"]');
    var panel = document.getElementById('tab-cs408');
    if (btn) btn.classList.toggle('nav-hidden', !hasCs408);
    if (panel) panel.classList.toggle('nav-hidden', !hasCs408);
    if (!hasCs408) {
      var active = document.querySelector('.tab-btn.active');
      if (active && active.getAttribute('data-tab') === 'cs408') switchTab('today');
    }
  }

  /* ============ 学习网站 ============ */
  function renderSites() {
    refs.curatedSites.innerHTML = '';
    CURATED.forEach(function (g) {
      refs.curatedSites.appendChild(el('div', 'site-cat', g.cat));
      g.items.forEach(function (it) { refs.curatedSites.appendChild(siteItem(it, null)); });
    });
    refs.userSites.innerHTML = '';
    var us = Store.getUserWebsites();
    if (!us.length) refs.userSites.appendChild(el('div', 'empty-hint', '还没有收藏，添加你常用的资源吧'));
    us.forEach(function (it) { refs.userSites.appendChild(siteItem(it, it.id)); });
  }
  function siteItem(it, id) {
    var d = el('div', 'site-item');
    var left = el('div'); left.style.flex = '1'; left.style.minWidth = '0';
    var a = el('a', null, it.name); a.href = it.url; a.target = '_blank'; a.rel = 'noopener';
    left.appendChild(a);
    if (it.desc) left.appendChild(el('div', 'site-desc', it.desc));
    d.appendChild(left);
    if (id) {
      var del = el('button', 'site-del', '删除');
      del.addEventListener('click', function () { Store.removeWebsite(id); renderSites(); });
      d.appendChild(del);
    }
    return d;
  }

  /* ============ 词汇模块：生词记录 / 背单词 / 生词复习 ============ */
  function renderWords() {
    var list = Store.getVocab();
    refs.vocabCount.textContent = list.length;
    refs.vocabList.innerHTML = '';
    if (!list.length) { refs.vocabList.appendChild(el('div', 'empty-hint', '生词本还是空的，去「背单词」或上面记录一个吧')); return; }
    list.forEach(function (v) {
      var item = el('div', 'mistake-item');
      var top = el('div', 'mistake-top');
      top.appendChild(el('span', 'mistake-badge', 'L' + (v.box || 1)));
      var del = el('button', 'plan-del', '删除');
      del.addEventListener('click', function () { Store.removeVocab(v.id); renderWords(); showToast('已删除'); });
      top.appendChild(del);
      item.appendChild(top);
      item.appendChild(el('div', 'mistake-content', v.word + (v.cn ? '　' + v.cn : '')));
      var due = (v.next <= Store.todayStr());
      item.appendChild(el('div', 'mistake-meta', '加入 ' + v.added + (due ? ' · 待复习' : ' · 下次 ' + v.next)));
      refs.vocabList.appendChild(item);
    });
  }
  function onRecordWord() {
    var raw = refs.wordInput.value.trim();
    if (!raw) { alert('请输入单词'); return; }
    var d = DICT_MAP[raw.toLowerCase()];
    if (d) {
      Store.addVocab(d.w, d.c);
      showWordCard(d.w, d.c, true);
      refs.wordManual.style.display = 'none';
      refs.wordInput.value = '';
      renderWords();
      showToast('已记录：' + d.w + ' ✅');
    } else {
      refs.wordManual.style.display = 'block';
      refs.wordManualCn.value = '';
      refs.wordResult.innerHTML = '<div class="word-card"><div class="w-en">' + escapeHtml(raw) + '</div><div class="w-cn">本地词典未收录，请补充释义</div></div>';
      showToast('本地词典未收录，请手动补充释义');
    }
  }
  function showWordCard(w, cn, saved) {
    refs.wordResult.innerHTML = '<div class="word-card"><div class="w-en">' + escapeHtml(w) + '</div><div class="w-cn">' + escapeHtml(cn || '（无释义）') + (saved ? ' · 已存入生词本' : '') + '</div></div>';
  }
  function onSaveManualWord() {
    var raw = refs.wordInput.value.trim();
    var cn = refs.wordManualCn.value.trim();
    if (!raw) { alert('请先输入单词'); return; }
    Store.addVocab(raw, cn);
    showWordCard(raw, cn, true);
    refs.wordManual.style.display = 'none';
    refs.wordInput.value = '';
    renderWords();
    showToast('已记录：' + raw + ' ✅');
  }

  /* ============ 翻译（浏览器直连百度翻译开放平台，用户自带 key） ============ */
  function renderTranslatorConfig() {
    var t = Store.getTranslator();
    if (refs.transAppid) refs.transAppid.value = t.appid || '';
    if (refs.transKey) refs.transKey.value = t.key || '';
    updateTranslateButton();
  }
  function onSaveTranslator() {
    var a = (refs.transAppid.value || '').trim();
    var k = (refs.transKey.value || '').trim();
    Store.setTranslator(a, k);
    refs.transStatus.textContent = (a && k) ? '✓ 密钥已保存（仅存本机浏览器）' : '✓ 已清空';
    showToast('翻译密钥已保存 ✅');
    updateTranslateButton();
  }
  function onTestTranslator() {
    onSaveTranslator();
    var t = Store.getTranslator();
    if (!t.appid || !t.key) { refs.transStatus.textContent = '✗ 请先填写 APP ID 与 密钥'; return; }
    refs.transStatus.textContent = '测试中…';
    translateWord('hello', function (res) {
      if (res.error) { refs.transStatus.textContent = '✗ ' + (res.msg || '测试失败') + (res.code ? '（' + res.code + '）' : ''); return; }
      refs.transStatus.textContent = '✓ 连接成功：' + escapeHtml(res.dst);
    });
  }

  /* ============ AI 能力（DeepSeek 内置，用户只需填 Key） ============ */
  var AI_DEFAULT_BASE = 'https://api.deepseek.com/v1';
  var AI_DEFAULT_MODEL = 'deepseek-chat';
  function renderAiConfig() {
    var c = Store.getAiConfig();
    if (refs.aiKey) refs.aiKey.value = c.key || '';
  }
  function onSaveAi() {
    var btn = refs.btnSaveAi;
    if (btn) { btn.disabled = true; btn.textContent = '保存中…'; }
    var restore = function () { if (btn) { btn.disabled = false; btn.textContent = '保存配置'; } };
    var safeToast = function (msg, type) { try { showToast(msg, type); } catch (e) {} };
    try {
      var key = (refs.aiKey.value || '').trim();
      // 内置 DeepSeek 默认值，用户只需填 key
      var c = Store.setAiConfig({ baseUrl: AI_DEFAULT_BASE, model: AI_DEFAULT_MODEL, key: key });
      refs.aiStatus.textContent = key ? '✓ 已保存（Key 仅存本机，经服务器中转）' : '✓ 已清空';
      refs.aiStatus.className = 'import-status ai-status ok';
      safeToast(key ? 'AI 配置已保存' : 'AI 配置已清空', 'ok');
    } catch (e) {
      safeToast('保存失败：' + (e && e.message || '未知错误'), 'err');
      refs.aiStatus.textContent = '✗ 保存失败';
      refs.aiStatus.className = 'import-status ai-status err';
    } finally {
      restore();
    }
  }
  function onTestAi() {
    var key = (refs.aiKey.value || '').trim();
    if (!key) { showToast('请填写 DeepSeek API Key', 'err'); refs.aiStatus.textContent = '✗ API Key 未填写'; refs.aiStatus.className = 'import-status ai-status err'; return; }
    onSaveAi();
    var btn = refs.btnTestAi;
    if (btn) { btn.disabled = true; btn.textContent = '测试中…'; }
    refs.aiStatus.textContent = '测试中…';
    refs.aiStatus.className = 'import-status ai-status pending';
    aiChat([{ role: 'user', content: '你好，请只回复"连接成功"四个字' }], { maxTokens: 32 })
      .then(function (res) {
        refs.aiStatus.textContent = '✓ 连接成功：' + (res.content || '').slice(0, 30);
        refs.aiStatus.className = 'import-status ai-status ok';
        showToast('AI 连接成功 ✅', 'ok');
        if (btn) { btn.disabled = false; btn.textContent = '测试连接'; }
      })
      .catch(function (err) {
        var msg = (err && err.msg) || '测试失败';
        refs.aiStatus.textContent = '✗ ' + msg;
        refs.aiStatus.className = 'import-status ai-status err';
        showToast('AI 连接失败：' + msg, 'err');
        if (btn) { btn.disabled = false; btn.textContent = '测试连接'; }
      });
  }
  // 通用 AI 对话：调本站 /api/ai 中转（key 走请求头，不出现在前端网络面板）
  function aiChat(messages, opts) {
    opts = opts || {};
    return new Promise(function (resolve, reject) {
      var c = Store.getAiConfig();
      if (!c.baseUrl || !c.model || !c.key) {
        reject({ error: 'NO_CONFIG', msg: '请先在「配置」页填写 AI 接口地址、模型与 Key' }); return;
      }
      if (location.protocol === 'file:') {
        reject({ error: 'OFFLINE', msg: '本地打开时 AI 功能不可用，请访问线上地址（kaoyan-tracker.pages.dev）使用' }); return;
      }
      fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-AI-Key': c.key },
        body: JSON.stringify({
          baseUrl: c.baseUrl, model: c.model, messages: messages,
          max_tokens: opts.maxTokens || 1024,
          temperature: (typeof opts.temperature === 'number') ? opts.temperature : undefined
        })
      })
        .then(function (r) { return r.text().then(function (t) { return { status: r.status, text: t }; }); })
        .then(function (res) {
          if (res.status !== 200) {
            var msg = '服务错误（' + res.status + '）';
            try { var j = JSON.parse(res.text); if (j && j.error) msg = j.error; } catch (e) {}
            reject({ error: 'HTTP_' + res.status, msg: msg }); return;
          }
          var data;
          try { data = JSON.parse(res.text); } catch (e) { reject({ error: 'PARSE', msg: 'AI 返回格式异常' }); return; }
          if (data && data.error) {
            reject({ error: 'UPSTREAM', msg: (data.error.message || data.error.code || '上游返回错误') }); return;
          }
          var content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
          if (!content) { reject({ error: 'EMPTY', msg: 'AI 未返回内容' }); return; }
          resolve({ content: content, usage: data.usage || null });
        })
        .catch(function () { reject({ error: 'NET', msg: '网络错误，请检查是否在线（本地 file:// 打开时 AI 不可用）' }); });
    });
  }
  // 浏览器直连百度翻译开放平台：用户自带 APP ID + 密钥，前端本地用 md5 签名，JSONP 规避 CORS。无需任何后端。
  function translateWord(word, cb) {
    var t = Store.getTranslator();
    if (!t.appid || !t.key) { cb({ error: 'NO_KEY', msg: '未填写翻译密钥，请先在「配置」页填写百度翻译 APP ID 与 密钥' }); return; }
    var q = (word || '').trim();
    if (!q) { cb({ error: 'EMPTY', msg: '单词为空' }); return; }
    var from = 'en', to = 'zh';
    var salt = String(Math.floor(Math.random() * 1e10));
    var sign = md5(t.appid + q + salt + t.key);
    var cbName = 'bd_trans_cb_' + salt;
    var done = false;
    var script = null;
    var timer = null;
    function cleanup() {
      if (script && script.parentNode) { try { script.parentNode.removeChild(script); } catch (e) {} }
      if (window[cbName]) { try { delete window[cbName]; } catch (e) {} }
      if (timer) clearTimeout(timer);
    }
    window[cbName] = function (data) {
      if (done) return; done = true; cleanup();
      data = data || {};
      if (data.error_code) { cb({ error: String(data.error_code), code: data.error_code, msg: data.error_msg || '翻译失败' }); return; }
      var tr = data.trans_result;
      var dst = (tr && tr[0] && tr[0].dst) ? tr[0].dst : '';
      var src = (tr && tr[0] && tr[0].src) ? tr[0].src : q;
      if (!dst) { cb({ error: 'EMPTY', msg: '翻译接口未返回结果' }); return; }
      cb({ dst: dst, src: src });
    };
    timer = setTimeout(function () {
      if (done) return; done = true; cleanup();
      cb({ error: 'TIMEOUT', msg: '请求超时（请检查网络，或确认密钥与 IP 白名单是否正确）' });
    }, 10000);
    var base = 'https://fanyi-api.baidu.com/api/trans/vip/translate';
    var params = 'q=' + encodeURIComponent(q) +
      '&from=' + from + '&to=' + to +
      '&appid=' + encodeURIComponent(t.appid) +
      '&salt=' + salt +
      '&sign=' + sign +
      '&callback=' + cbName;
    script = document.createElement('script');
    script.src = base + '?' + params;
    script.onerror = function () {
      if (done) return; done = true; cleanup();
      cb({ error: 'NETWORK', msg: '请求失败（请检查网络是否能访问百度翻译接口）' });
    };
    document.body.appendChild(script);
  }
  function onTranslate() {
    var word = refs.transInput.value.trim();
    if (!word) { alert('请输入要翻译的单词'); return; }
    refs.btnTranslate.disabled = true;
    refs.transQueryStatus.textContent = '查询中…';
    refs.transResult.innerHTML = '';
    translateWord(word, function (res) {
      refs.btnTranslate.disabled = false;
      if (res.error) {
        refs.transQueryStatus.textContent = '✗ ' + (res.msg || '翻译失败') + (res.code ? '（' + res.code + '）' : '');
        refs.transResult.innerHTML = '<div class="word-card err"><div class="w-cn">' + escapeHtml(res.msg || '翻译失败') + '</div></div>';
        return;
      }
      Store.addWrongWord(res.src || word, res.dst, 'translate');
      refs.transQueryStatus.textContent = '✓ 已翻译并自动归档到查词记录';
      refs.transResult.innerHTML = '<div class="word-card"><div class="w-en">' + escapeHtml(res.src || word) + '</div><div class="w-cn">' + escapeHtml(res.dst) + ' · 已存入查词记录</div></div>';
      renderWrongBook();
    });
  }
  function renderWrongBook() {
    var list = Store.getWrongWords();
    refs.wrongCount.textContent = list.length;
    refs.wrongList.innerHTML = '';
    if (!list.length) { refs.wrongList.appendChild(el('div', 'empty-hint', '查词记录还是空的，去上方「翻译并归档」试试')); return; }
    list.forEach(function (w) {
      var item = el('div', 'mistake-item');
      var top = el('div', 'mistake-top');
      var toVocab = el('button', 'plan-del vocab-move', '移入生词本');
      toVocab.addEventListener('click', function () { Store.addVocab(w.word, w.cn); renderWords(); showToast('已移入生词本 ✅'); });
      var aiBtn = el('button', 'plan-del ai-explain-btn', '🤖 AI 讲解');
      aiBtn.addEventListener('click', function () { explainWrongWord(w, aiBtn); });
      var del = el('button', 'plan-del', '删除');
      del.addEventListener('click', function () { Store.removeWrongWord(w.id); renderWrongBook(); showToast('已从查词记录删除'); });
      top.appendChild(aiBtn); top.appendChild(toVocab); top.appendChild(del);
      item.appendChild(top);
      item.appendChild(el('div', 'mistake-content', w.word + (w.cn ? '　' + w.cn : '')));
      item.appendChild(el('div', 'mistake-meta', '归档于 ' + w.created + (w.src === 'translate' ? ' · 翻译查询' : '')));
      refs.wrongList.appendChild(item);
    });
  }

  // 查词记录 AI 讲解（展开/收起式，AI 输出用 textContent 防 XSS）
  function explainWrongWord(w, btn) {
    var item = btn.closest('.mistake-item');
    if (!item) return;
    var box = item.querySelector('.ai-explain-box');
    if (box) { box.remove(); return; }
    box = el('div', 'ai-explain-box');
    box.appendChild(el('div', 'ai-loading', '🤖 AI 讲解中…'));
    item.appendChild(box);
    aiChat([
      { role: 'system', content: '你是英语学习助教，面向考研/雅思备考学生。用简体中文讲解，条理清晰，末尾给出一个英文例句（带中文翻译）。' },
      { role: 'user', content: '请讲解单词「' + w.word + '」' + (w.cn ? '（词典释义：' + w.cn + '）' : '') + '。内容：1) 核心词义与词性；2) 常见搭配或用法；3) 记忆技巧/词根词缀；4) 一个例句。' }
    ], { maxTokens: 600 }).then(function (res) {
      box.textContent = '';
      var pre = el('pre', 'ai-explain-text'); pre.textContent = res.content.trim();
      box.appendChild(pre);
    }).catch(function (err) {
      box.textContent = '';
      box.appendChild(el('div', 'empty-hint', '✗ ' + (err.msg || 'AI 讲解失败，请检查配置页 AI 设置')));
    });
  }

  // 查词记录 AI 归纳（全书查词聚类 + 共性薄弱点 + 复习建议；输出 textContent 防 XSS）
  function summarizeWrongBook() {
    var box = refs.wrongAiSummary;
    if (!box) return;
    var list = Store.getWrongWords();
    if (!list.length) {
      box.textContent = '';
      box.appendChild(el('div', 'empty-hint', '暂无查词记录，先去翻译查询或刷题积累吧'));
      return;
    }
    var c = Store.getAiConfig();
    if (!c.baseUrl || !c.model || !c.key) {
      box.textContent = '';
      box.appendChild(el('div', 'empty-hint', '✗ 请先在「配置」页填写 DeepSeek API Key'));
      return;
    }
    box.textContent = '';
    box.appendChild(el('div', 'ai-loading', '🤖 AI 归纳全书查词中…'));
    var words = list.map(function (w) { return (w.word || '') + (w.cn ? '（' + w.cn + '）' : ''); }).join('、');
    aiChat([
      { role: 'system', content: '你是英语学习助教，面向考研/雅思备考学生。用简体中文，条理清晰，按要点输出。' },
      { role: 'user', content: '以下是我的查词记录全部单词：' + words + '。请帮我归纳：1) 高频/易混词聚类；2) 共性薄弱点（如词性、拼写、搭配）；3) 接下来一周的复习节奏建议。' }
    ], { maxTokens: 1200 }).then(function (res) {
      box.textContent = '';
      var pre = el('pre', 'ai-explain-text'); pre.textContent = res.content.trim();
      box.appendChild(pre);
    }).catch(function (err) {
      box.textContent = '';
      box.appendChild(el('div', 'empty-hint', '✗ ' + (err.msg || 'AI 归纳失败，请检查配置页 AI 设置')));
    });
  }

  /* ============ §2.4 今日学习总结 AI 增强 ============ */
  // 增强现有「今日学习总结」卡：把今日学习数据聚合成自然语言，交给 AI 生成温暖、有鼓励性的日报 + 明日建议。
  function onAiSummary() {
    var box = refs.aiSummaryOut;
    if (!box) return;
    var c = Store.getAiConfig();
    if (!c.baseUrl || !c.model || !c.key) {
      box.textContent = '';
      box.appendChild(el('div', 'empty-hint', '✗ 请先在「配置」页填写 DeepSeek API Key'));
      return;
    }
    var ds = Store.todayStr();
    var day = Store.getDay(ds) || { durations: {} };
    var subs = Store.getSubjects();
    var total = Store.totalMinutesForDay(day);
    var lines = [];
    lines.push('今天（' + ds + '）累计学习 ' + (Math.floor(total / 60) > 0 ? Math.floor(total / 60) + ' 小时 ' : '') + (total % 60) + ' 分钟。');
    subs.forEach(function (s) {
      var m = (day.durations && day.durations[s.key]) || 0;
      if (m > 0) lines.push('· ' + s.name + '：' + m + ' 分钟');
    });
    var plan = Store.getPlan(ds) || [];
    var done = plan.filter(function (i) { return i.done; }).length;
    lines.push('计划完成：' + (plan.length ? (done + '/' + plan.length) : '未制定') + '。');
    var mistakes = Store.getMistakes().filter(function (m) { return m.date === ds; }).length;
    lines.push('今日整理错题/感悟：' + mistakes + ' 条。');
    var vocabAdded = Store.getVocab().filter(function (v) { return v.added === ds; }).length;
    lines.push('今日新增生词：' + vocabAdded + ' 个；待复习生词：' + Store.getDueVocab(ds).length + ' 个。');
    lines.push('连续打卡：' + Store.consecutiveStreak() + ' 天。');
    var dayText = lines.join('\n');
    box.textContent = '';
    box.appendChild(el('div', 'ai-loading', '🤖 AI 生成学习总结中…'));
    var btn = refs.btnAiSummary;
    if (btn) { btn.disabled = true; btn.textContent = '🤖 生成中…'; }
    var cfg = Store.getConfig();
    var daysLeft = cfg.examDate ? Math.ceil((new Date(cfg.examDate + 'T00:00:00') - new Date(ds + 'T00:00:00')) / 86400000) : null;
    var userMsg = '以下是我今天的学习数据：\n' + dayText + (daysLeft !== null ? ('\n距考研还有 ' + daysLeft + ' 天。') : '') +
      '\n根据以上数据生成每日总结。要求：1) 精确列举今日完成的具体事项；2) 指出哪些是有效步骤及其价值；3) 附一两句肯定性评语。控制在一小段内（不超过150字），删除所有铺垫、解释性废话与重复表述。不要用markdown。';
    aiChat([
      { role: 'system', content: '你是考研学习助手。生成每日任务总结时保持内容精简、直击重点，避免冗长与无关信息。严格控制在150字以内。' },
      { role: 'user', content: userMsg }
    ], { maxTokens: 300 }).then(function (res) {
      box.textContent = '';
      var pre = el('pre', 'ai-explain-text'); pre.textContent = (res.content || '').trim();
      box.appendChild(pre);
    }).catch(function (err) {
      box.textContent = '';
      box.appendChild(el('div', 'empty-hint', '✗ ' + (err.msg || 'AI 生成失败，请检查配置页 AI 设置')));
    }).then(function () {
      if (btn) { btn.disabled = false; btn.textContent = '🤖 AI 生成学习总结'; }
    });
  }

  function updateTranslateButton() {
    if (!refs.btnTranslate) return;
    var t = Store.getTranslator();
    var has = !!(t.appid && t.key);
    refs.btnTranslate.disabled = !has;
    var st = refs.transQueryStatus.textContent || '';
    if (!has && st.indexOf('请先在') !== 0) refs.transQueryStatus.textContent = '请先在「配置」页填写翻译密钥';
    else if (has && st.indexOf('请先在') === 0) refs.transQueryStatus.textContent = '';
  }

  /* ============ 番茄钟 / 倒计时（自定义时长 + 仅倒计时合并） ============ */
  var pomodoro = { running: false, mode: 'study', remain: 25 * 60, total: 25 * 60, workMin: 25, breakMin: 5, timer: null, countdownOnly: false, workSec: 0, done: false };
  function fmtPomo(sec) { var m = Math.floor(sec / 60), s = sec % 60; return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s; }
  function renderPomodoro() {
    if (!refs.pomoTime) return;
    refs.pomoTime.textContent = fmtPomo(pomodoro.remain);
    if (pomodoro.done) refs.pomoMode.textContent = '✅ 倒计时结束';
    else refs.pomoMode.textContent = pomodoro.countdownOnly ? '⏲ 倒计时' : (pomodoro.mode === 'study' ? '🍅 学习中' : '☕ 休息中');
    refs.btnPomoStart.textContent = pomodoro.running ? '暂停' : (pomodoro.remain < pomodoro.total ? '继续' : '开始');
    refs.btnPomoReset.disabled = !pomodoro.running && pomodoro.remain === pomodoro.total && !pomodoro.done;
    var disp = refs.pomoTime ? refs.pomoTime.parentElement : null;
    if (disp) { disp.classList.toggle('break', !pomodoro.countdownOnly && pomodoro.mode !== 'study'); disp.classList.toggle('done', !!pomodoro.done); }
  }
  function notifyPomodoro(msg) {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try { new Notification('考研番茄钟', { body: msg }); } catch (e) {}
    }
    showToast(msg);
  }
  function readPomoTimes() {
    var w = Number(refs.pomoWork && refs.pomoWork.value) || 25;
    var b = Number(refs.pomoBreak && refs.pomoBreak.value) || 5;
    pomodoro.workMin = Math.max(1, Math.min(120, w));
    pomodoro.breakMin = Math.max(1, Math.min(60, b));
  }
  function readPomoCountdownOnly() {
    pomodoro.countdownOnly = !!(refs.pomoCountdownOnly && refs.pomoCountdownOnly.checked);
    pomodoro.workSec = (pomodoro.countdownOnly && refs.pomoWorkSec) ? Math.max(0, Math.min(59, Number(refs.pomoWorkSec.value) || 0)) : 0;
  }
  function applyCountdownOnlyUI() {
    var on = !!(refs.pomoCountdownOnly && refs.pomoCountdownOnly.checked);
    if (refs.pomoBreak) {
      var lbl = refs.pomoBreak.previousElementSibling;
      refs.pomoBreak.style.display = on ? 'none' : '';
      if (lbl && lbl.tagName === 'LABEL') lbl.style.display = on ? 'none' : '';
    }
    if (refs.pomoSecLabel) refs.pomoSecLabel.style.display = on ? '' : 'none';
    if (refs.pomoWorkSec) refs.pomoWorkSec.style.display = on ? '' : 'none';
  }
  function tickPomodoro() {
    pomodoro.remain--;
    if (pomodoro.remain <= 0) {
      if (pomodoro.mode === 'study') {
        if (pomodoro.countdownOnly) {
          pomodoro.remain = 0; pomodoro.running = false; if (pomodoro.timer) clearInterval(pomodoro.timer); pomodoro.done = true;
          notifyPomodoro('⏲ 倒计时结束！时间到 ⏰');
          renderPomodoro();
          return;
        }
        pomodoro.mode = 'rest'; pomodoro.total = pomodoro.breakMin * 60; pomodoro.remain = pomodoro.breakMin * 60;
        notifyPomodoro('学习结束，休息 ' + pomodoro.breakMin + ' 分钟！喝口水 💧');
      } else {
        pomodoro.mode = 'study'; pomodoro.total = pomodoro.workMin * 60; pomodoro.remain = pomodoro.workMin * 60;
        notifyPomodoro('休息结束，继续学习 💪');
      }
    }
    renderPomodoro();
  }
  function startPomodoro() {
    if (pomodoro.running) { pomodoro.running = false; if (pomodoro.timer) clearInterval(pomodoro.timer); renderPomodoro(); return; }
    readPomoTimes(); readPomoCountdownOnly();
    if (pomodoro.done || pomodoro.remain === pomodoro.total) {
      var total = pomodoro.countdownOnly ? (pomodoro.workMin * 60 + pomodoro.workSec) : (pomodoro.mode === 'rest' ? pomodoro.breakMin * 60 : pomodoro.workMin * 60);
      pomodoro.total = total; pomodoro.remain = total; pomodoro.done = false;
    }
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') { try { Notification.requestPermission().catch(function () {}); } catch (e) {} }
    pomodoro.running = true;
    pomodoro.timer = setInterval(tickPomodoro, 1000);
    renderPomodoro();
  }
  function resetPomodoro() {
    pomodoro.running = false; if (pomodoro.timer) clearInterval(pomodoro.timer);
    readPomoTimes(); readPomoCountdownOnly();
    pomodoro.mode = 'study'; pomodoro.done = false;
    pomodoro.total = pomodoro.countdownOnly ? (pomodoro.workMin * 60 + pomodoro.workSec) : pomodoro.workMin * 60;
    pomodoro.remain = pomodoro.total; renderPomodoro();
  }


  function setReviewMode(mode) {
    reviewMode = mode;
    if (refs.reviewBox) refs.reviewBox.style.display = mode === 'review' ? '' : 'none';
    if (refs.practiceBox) refs.practiceBox.style.display = mode === 'practice' ? '' : 'none';
    if (refs.reviewHint) refs.reviewHint.style.display = mode === 'review' ? '' : 'none';
    if (refs.btnReviewRestart) refs.btnReviewRestart.style.display = mode === 'review' ? '' : 'none';
    if (refs.btnPracticeRestart) refs.btnPracticeRestart.style.display = mode === 'practice' ? '' : 'none';
    if (refs.btnPracticeSettings) refs.btnPracticeSettings.style.display = mode === 'practice' ? '' : 'none';
    document.querySelectorAll('.mode-btn').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-mode') === mode); });
    if (mode === 'review') { if (!reviewQueue) startReview(); }
    else { if (!practiceSession) startPractice(); }
  }
  function buildPracticePool(scope) {
    if (scope === 'vocab') return Store.getVocab().filter(function (v) { return v.word && v.cn; }).map(function (v) { return { w: v.word, c: v.cn }; });
    if (scope === 'wrong') return Store.getWrongWords().filter(function (v) { return v.word && v.cn; }).map(function (v) { return { w: v.word, c: v.cn }; });
    return DICT.slice().filter(function (d) { return d.w && d.c; });
  }
  function startPractice() {
    var ps = Store.getPracticeSettings();
    var pool = buildPracticePool(ps.scope);
    if (!pool.length) {
      practiceSession = null;
      var hint = ps.scope === 'vocab' ? '生词本为空，先记录几个生词再来练吧' : ps.scope === 'wrong' ? '查词记录为空，练习中答错会自动归档' : '词库为空';
      refs.practiceBox.innerHTML = '<div class="empty-hint">' + hint + '</div>';
      return;
    }
    shuffle(pool);
    practiceSession = { items: pool.slice(0, Math.min(ps.count, pool.length)), index: 0, answered: false, mode: ps.mode, autoSave: ps.autoSave, pool: pool };
    renderPractice();
  }
  function renderPractice() {
    if (!practiceSession) { refs.practiceBox.innerHTML = '<div class="empty-hint">进入本页开始练习</div>'; return; }
    var s = practiceSession;
    if (s.index >= s.items.length) {
      refs.practiceBox.innerHTML = '<div class="review-done"><div class="big">本批练习完成 🎉</div><div class="muted" style="margin-top:8px">共 ' + s.items.length + ' 词，点「换一批」继续</div></div>';
      return;
    }
    var cur = s.items[s.index];
    var en2cn = s.mode !== 'cn2en';
    var others = s.pool.filter(function (d) { return d.w !== cur.w && d.c !== cur.c; });
    shuffle(others);
    // 干扰项：优先从词池取，不足 3 个时用本地词库补充
    var fillers = DICT.filter(function (d) { return d.w !== cur.w && d.c !== cur.c; });
    var opts = [];
    if (en2cn) {
      opts.push(cur.c);
      for (var i = 0; i < others.length && opts.length < 4; i++) if (opts.indexOf(others[i].c) < 0) opts.push(others[i].c);
      for (var j = 0; j < fillers.length && opts.length < 4; j++) if (opts.indexOf(fillers[j].c) < 0) opts.push(fillers[j].c);
    } else {
      opts.push(cur.w);
      for (var k = 0; k < others.length && opts.length < 4; k++) if (opts.indexOf(others[k].w) < 0) opts.push(others[k].w);
      for (var m = 0; m < fillers.length && opts.length < 4; m++) if (opts.indexOf(fillers[m].w) < 0) opts.push(fillers[m].w);
    }
    shuffle(opts);
    var stem = en2cn ? cur.w : cur.c;
    var answer = en2cn ? cur.c : cur.w;
    var html = '<div class="practice-en' + (en2cn ? '' : ' practice-cn') + '">' + escapeHtml(stem) + '</div>';
    html += '<div class="practice-progress">第 ' + (s.index + 1) + ' / ' + s.items.length + ' 个 · ' + (en2cn ? '英选译' : '中选英') + '</div>';
    html += '<div class="practice-options">';
    opts.forEach(function (o) {
      html += '<button class="practice-opt' + (en2cn ? '' : ' practice-opt-en') + '" data-correct="' + (o === answer) + '">' + escapeHtml(o) + '</button>';
    });
    html += '</div>';
    html += '<div class="practice-feedback" id="practice-feedback"></div>';
    html += '<div class="practice-actions"><button class="btn btn-dontknow" id="practice-dontknow">不认识</button></div>';
    refs.practiceBox.innerHTML = html;
    var fb = $('practice-feedback');
    refs.practiceBox.querySelectorAll('.practice-opt').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (s.answered) return;
        s.answered = true;
        var correct = btn.getAttribute('data-correct') === 'true';
        refs.practiceBox.querySelectorAll('.practice-opt').forEach(function (b) {
          b.disabled = true;
          if (b.getAttribute('data-correct') === 'true') b.classList.add('correct');
        });
        if (correct) { btn.classList.add('correct'); fb.textContent = '✅ 答对了'; fb.style.color = '#059669'; }
        else { btn.classList.add('wrong'); fb.textContent = '❌ 正确答案：' + answer; fb.style.color = '#dc2626'; }
        addNextButton();
      });
    });
    $('practice-dontknow').addEventListener('click', function () {
      if (s.answered) return;
      s.answered = true;
      if (s.autoSave) Store.addVocab(cur.w, cur.c);
      refs.practiceBox.querySelectorAll('.practice-opt').forEach(function (b) {
        b.disabled = true;
        if (b.getAttribute('data-correct') === 'true') b.classList.add('correct');
      });
      fb.textContent = (s.autoSave ? '已收入生词本，正确答案：' : '正确答案：') + answer;
      fb.style.color = '#4f46e5';
      addNextButton();
    });
    function addNextButton() {
      var act = refs.practiceBox.querySelector('.practice-actions');
      var next = el('button', 'btn btn-primary', '下一个');
      next.addEventListener('click', nextPractice);
      act.appendChild(next);
    }
  }
  function nextPractice() {
    if (!practiceSession) return;
    practiceSession.index++;
    practiceSession.answered = false;
    renderPractice();
  }

  function startReview() {
    var due = Store.getDueVocab(Store.todayStr());
    if (!due.length) {
      reviewQueue = { items: [], index: 0, total: 0 };
      refs.reviewHint.textContent = '今天没有待复习的生词～去背单词或记录生词吧';
      refs.reviewBox.innerHTML = '<div class="review-done"><div class="big">暂无待复习词</div></div>';
      return;
    }
    var items = due.slice();
    shuffle(items);
    reviewQueue = { items: items, index: 0, total: items.length };
    refs.reviewHint.textContent = '今日待复习 ' + items.length + ' 个生词（按记忆曲线推送）';
    renderReview();
  }
  function renderReview() {
    if (!reviewQueue) { refs.reviewBox.innerHTML = '<div class="empty-hint">进入本页开始复习</div>'; return; }
    var q = reviewQueue;
    if (q.index >= q.items.length) {
      refs.reviewBox.innerHTML = '<div class="review-done"><div class="big">今日复习完成 🎉</div><div class="muted" style="margin-top:8px">共复习 ' + q.total + ' 个生词</div></div>';
      return;
    }
    var v = q.items[q.index];
    var html = '<div class="review-en">' + escapeHtml(v.word) + '</div>';
    html += '<div class="review-cn" id="review-cn" style="visibility:hidden">' + escapeHtml(v.cn || '（无释义）') + '</div>';
    html += '<div class="practice-actions"><button class="btn btn-ghost" id="review-show">显示释义</button></div>';
    html += '<div class="review-actions" style="margin-top:12px"><button class="btn btn-primary" id="review-know">✅ 认识</button><button class="btn btn-danger" id="review-unknow">❌ 不认识</button></div>';
    refs.reviewBox.innerHTML = html;
    $('review-show').addEventListener('click', function () { $('review-cn').style.visibility = 'visible'; this.style.display = 'none'; });
    $('review-know').addEventListener('click', function () {
      var nb = Math.min((v.box || 1) + 1, 5);
      Store.updateVocab(v.id, { box: nb, next: nextReviewDate(nb), last: Store.todayStr() });
      q.index++; renderReview();
    });
    $('review-unknow').addEventListener('click', function () {
      Store.updateVocab(v.id, { box: 1, next: nextReviewDate(1), last: Store.todayStr(), wrong: (v.wrong || 0) + 1 });
      q.items.push(v);
      q.index++; renderReview();
    });
  }

  /* ============ 通用 ============ */
  /* ============ 学习统计 / 得分 / 成就 / 里程碑（纯计算，无新增存储字段） ============ */
  function getStudyStats() {
    var days = Store.getDays();
    var keys = Object.keys(days);
    var totalMin = 0, totalDays = 0, subjectsWithTime = {};
    var subs = Store.getSubjects();
    subs.forEach(function (s) { subjectsWithTime[s.key] = 0; });
    keys.forEach(function (ds) {
      var d = days[ds];
      if (!d) return;
      var m = Store.totalMinutesForDay(d);
      if (m > 0) { totalMin += m; totalDays++; }
      subs.forEach(function (s) { if (d.durations && d.durations[s.key] > 0) subjectsWithTime[s.key] += d.durations[s.key]; });
    });
    var subjWithTimeCount = 0;
    subs.forEach(function (s) { if (subjectsWithTime[s.key] > 0) subjWithTimeCount++; });
    var cfg = Store.getConfig();
    var remaining = null;
    if (cfg.examDate) {
      remaining = Math.ceil((new Date(cfg.examDate + 'T00:00:00') - new Date(Store.todayStr() + 'T00:00:00')) / 86400000);
    }
    return {
      totalMin: totalMin, totalDays: totalDays, hours: totalMin / 60,
      streak: Store.consecutiveStreak(),
      vocabCount: Store.getVocab().length,
      examCount: Store.getExams().length,
      mistakeCount: Store.getMistakes().length,
      subjWithTimeCount: subjWithTimeCount,
      remaining: remaining
    };
  }

  /* 单日学习得分：四项加权（权重可配置，默认 时长50/计划20/生词15/错题15，合计满分100）。
     没学习的日子不给分，避免“虚假正反馈”。权重为 0 的项不计入分子与分母。 */
  function scoreForDay(ds, day) {
    day = day || Store.getDay(ds) || { durations: {} };
    var totalMin = Store.totalMinutesForDay(day);
    if (totalMin <= 0) return 0;
    var w = Store.getScoreWeights();
    var wDur = Number(w.duration) || 0, wPlan = Number(w.plan) || 0, wVoc = Number(w.vocab) || 0, wMis = Number(w.mistake) || 0;
    var sum = wDur + wPlan + wVoc + wMis;
    if (sum <= 0) return 0;
    var rDur = Math.min(totalMin, 480) / 480;
    var plan = Store.getPlan(ds) || [];
    var rPlan;
    if (plan.length) { var done = plan.filter(function (p) { return p.done; }).length; rPlan = done / plan.length; }
    else rPlan = 0.5; // 无计划时给中性 0.5（等价于原公式未设计划的 10/20）
    var rev = Store.getVocab().filter(function (v) { return v.last === ds; }).length;
    var rVoc = Math.min(rev, 15) / 15;
    var mToday = Store.getMistakes().filter(function (m) { return (m.date || '').slice(0, 10) === ds; }).length;
    var rMis = Math.min(mToday, 15) / 15;
    var weighted = (rDur * wDur + rPlan * wPlan + rVoc * wVoc + rMis * wMis) / sum * 100;
    return Math.max(0, Math.min(100, Math.round(weighted)));
  }

  /* 等级：每累计 10 小时 +1 级，每连续 7 天 +1 级（两者叠加） */
  function levelTitle(l) {
    var t = ['萌新', '入门', '进阶', '扎实', '熟练', '高手', '学霸', '考研战神'];
    return t[Math.min(t.length - 1, l)] || '考研战神';
  }
  function computeLevel(stats) {
    var lvl = Math.floor(stats.hours / 10) + Math.floor(stats.streak / 7);
    var hourPart = stats.hours - Math.floor(stats.hours / 10) * 10;
    var pct = Math.min(100, Math.round(hourPart / 10 * 100));
    return { level: lvl, title: levelTitle(lvl), pct: pct, hours: stats.hours };
  }

  var BADGES = [
    { id: 'start', icon: '🌱', name: '起步', desc: '累计学习 ≥ 1 天', test: function (s) { return s.totalDays >= 1; }, prog: function (s) { return s.totalDays + '/1 天'; } },
    { id: 'streak7', icon: '🔥', name: '七日坚持', desc: '连续打卡 ≥ 7 天', test: function (s) { return s.streak >= 7; }, prog: function (s) { return s.streak + '/7 天'; } },
    { id: 'streak21', icon: '🏔', name: '习惯养成', desc: '连续打卡 ≥ 21 天', test: function (s) { return s.streak >= 21; }, prog: function (s) { return s.streak + '/21 天'; } },
    { id: 'hours100', icon: '⏳', name: '百分工时', desc: '累计学习 ≥ 100 小时', test: function (s) { return s.hours >= 100; }, prog: function (s) { return Math.floor(s.hours) + '/100 小时'; } },
    { id: 'hours200', icon: '💯', name: '双百工时', desc: '累计学习 ≥ 200 小时', test: function (s) { return s.hours >= 200; }, prog: function (s) { return Math.floor(s.hours) + '/200 小时'; } },
    { id: 'vocab1000', icon: '📚', name: '千词斩', desc: '生词本 ≥ 1000 词', test: function (s) { return s.vocabCount >= 1000; }, prog: function (s) { return s.vocabCount + '/1000 词'; } },
    { id: 'exam1', icon: '🎯', name: '模考初体验', desc: '录入 ≥ 1 次模考', test: function (s) { return s.examCount >= 1; }, prog: function (s) { return s.examCount + '/1 次'; } },
    { id: 'exam3', icon: '🏆', name: '模考三连', desc: '录入 ≥ 3 次模考', test: function (s) { return s.examCount >= 3; }, prog: function (s) { return s.examCount + '/3 次'; } },
    { id: 'mistake50', icon: '🐞', name: '错题猎人', desc: '整理 ≥ 50 条错题', test: function (s) { return s.mistakeCount >= 50; }, prog: function (s) { return s.mistakeCount + '/50 条'; } },
    { id: 'allSubjects', icon: '🧠', name: '全能备考', desc: '4 个科目都有学习时长', test: function (s) { return s.subjWithTimeCount >= 4; }, prog: function (s) { return s.subjWithTimeCount + '/4 科'; } },
    { id: 'days30', icon: '📝', name: '笔记达人', desc: '累计学习 ≥ 30 天', test: function (s) { return s.totalDays >= 30; }, prog: function (s) { return s.totalDays + '/30 天'; } },
    { id: 'sprint', icon: '🚀', name: '冲刺在即', desc: '距考研 ≤ 30 天', test: function (s) { return s.remaining !== null && s.remaining <= 30 && s.remaining > 0; }, prog: function (s) { return s.remaining !== null ? s.remaining + ' 天' : '未设日期'; } }
  ];
  function computeBadges(stats) {
    return BADGES.map(function (b) {
      return { id: b.id, icon: b.icon, name: b.name, desc: b.desc, earned: !!b.test(stats), prog: b.prog(stats) };
    });
  }

  var MILESTONES = [
    { id: 'streak7', name: '连续打卡 7 天' },
    { id: 'streak21', name: '连续打卡 21 天' },
    { id: 'streak30', name: '连续打卡 30 天' },
    { id: 'hours50', name: '累计学习 50 小时' },
    { id: 'hours100', name: '累计学习 100 小时' },
    { id: 'hours200', name: '累计学习 200 小时' },
    { id: 'vocab200', name: '生词本 200 词' },
    { id: 'vocab500', name: '生词本 500 词' },
    { id: 'vocab1000', name: '生词本 1000 词' },
    { id: 'exam3', name: '录入 3 次模考' },
    { id: 'exam5', name: '录入 5 次模考' },
    { id: 'mistake50', name: '整理 50 条错题' },
    { id: 'mistake200', name: '整理 200 条错题' }
  ];
  function milestoneTests(s) {
    return {
      streak7: s.streak >= 7, streak21: s.streak >= 21, streak30: s.streak >= 30,
      hours50: s.hours >= 50, hours100: s.hours >= 100, hours200: s.hours >= 200,
      vocab200: s.vocabCount >= 200, vocab500: s.vocabCount >= 500, vocab1000: s.vocabCount >= 1000,
      exam3: s.examCount >= 3, exam5: s.examCount >= 5,
      mistake50: s.mistakeCount >= 50, mistake200: s.mistakeCount >= 200
    };
  }
  var _milestoneChecking = false;
  function checkMilestones() {
    if (_milestoneChecking) return;
    _milestoneChecking = true;
    try {
      var s = getStudyStats();
      var t = milestoneTests(s);
      var have = Store.getMilestones();
      var fresh = MILESTONES.filter(function (m) { return t[m.id] && have.indexOf(m.id) < 0; });
      if (fresh.length) {
        fresh.forEach(function (m) { Store.addMilestone(m.id); });
        fireConfetti();
        showToast('🎉 新里程碑：' + fresh.map(function (m) { return m.name; }).join('、'), 'ok');
      }
    } finally { _milestoneChecking = false; }
  }

  /* 倒计时分阶段：基础(>90天) / 强化(31~90天) / 冲刺(≤30天) */
  function phaseInfo(examDate) {
    if (!examDate) return null;
    var diff = Math.ceil((new Date(examDate + 'T00:00:00') - new Date(Store.todayStr() + 'T00:00:00')) / 86400000);
    if (diff <= 0) return { phase: '已结束', remaining: 0, phaseRemain: 0, phaseTotal: 0, pct: 100, ended: true };
    var phase, phaseTotal;
    if (diff <= 30) { phase = '冲刺'; phaseTotal = 30; }
    else if (diff <= 90) { phase = '强化'; phaseTotal = 60; }
    else { phase = '基础'; phaseTotal = Math.max(diff, 1); }
    var phaseRemain = phase === '冲刺' ? diff : (phase === '强化' ? diff - 30 : diff - 90);
    phaseRemain = Math.max(0, phaseRemain);
    return { phase: phase, remaining: diff, phaseRemain: phaseRemain, phaseTotal: phaseTotal, pct: phaseTotal > 0 ? Math.round(phaseRemain / phaseTotal * 100) : 100, ended: false };
  }

  function renderScoreCard() {
    if (!refs.scoreBars) return;
    var days = Store.getDays();
    var today = Store.todayStr();
    var items = [];
    var todayScore = 0, sum = 0, best = 0, bestDs = '';
    for (var i = 0; i < 30; i++) {
      var ds = Store.dateStr(Store.addDays(new Date(), -i));
      var sc = scoreForDay(ds, days[ds]);
      items.push({ ds: ds, score: sc });
      if (ds === today) todayScore = sc;
      sum += sc;
      if (sc > best) { best = sc; bestDs = ds; }
    }
    items.reverse();
    var avg = Math.round(sum / 30);
    refs.scoreSummary.innerHTML =
      '<span class="ss-item">今日 <b>' + todayScore + '</b> 分</span>' +
      '<span class="ss-item">近30天均分 <b>' + avg + '</b></span>' +
      '<span class="ss-item">最高 <b>' + best + '</b>' + (bestDs ? '（' + bestDs.slice(5) + '）' : '') + '</span>';
    Charts.renderScoreBars(refs.scoreBars, items);
  }

  function renderBadgesCard() {
    if (!refs.badgesGrid) return;
    var stats = getStudyStats();
    var lvl = computeLevel(stats);
    refs.badgesLevel.innerHTML =
      '<div class="lv-head"><span class="lv-badge">Lv.' + lvl.level + '</span>' +
      '<span class="lv-title">' + escapeHtml(lvl.title) + '</span>' +
      '<span class="lv-sub">累计 ' + Math.floor(stats.hours) + ' 小时 · 连续 ' + stats.streak + ' 天</span></div>' +
      '<div class="lv-bar"><div class="lv-fill" style="width:' + lvl.pct + '%"></div></div>' +
      '<div class="lv-tip">再学 ' + (10 - Math.floor(stats.hours) % 10 || 10) + ' 小时升到下一级</div>';
    var badges = computeBadges(stats);
    var earned = 0;
    var html = '';
    badges.forEach(function (b) {
      if (b.earned) earned++;
      html += '<div class="badge-tile' + (b.earned ? ' earned' : '') + '">' +
        '<div class="badge-icon">' + b.icon + '</div>' +
        '<div class="badge-name">' + escapeHtml(b.name) + '</div>' +
        '<div class="badge-desc">' + escapeHtml(b.desc) + '</div>' +
        '<div class="badge-prog">' + (b.earned ? '✅ 已达成' : '进度 ' + escapeHtml(b.prog)) + '</div>' +
        '</div>';
    });
    refs.badgesGrid.innerHTML = html;
    var head = refs.badgesGrid.previousElementSibling;
    if (head && head.classList.contains('badges-count')) head.textContent = '已点亮 ' + earned + ' / ' + badges.length + ' 枚徽章';
  }

  /* ============ 今日聚合 + 主题 + 键盘快捷键 ============ */
  // YYYY.MM.DD 星期X（如「2026.08.14 星期五」）
  function fmtTodayWithWeekday(dateStr) {
    var d = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
    if (isNaN(d.getTime())) d = new Date();
    var y = d.getFullYear();
    var m = (d.getMonth() + 1 < 10 ? '0' : '') + (d.getMonth() + 1);
    var day = (d.getDate() < 10 ? '0' : '') + d.getDate();
    var weeks = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
    return y + '.' + m + '.' + day + ' ' + weeks[d.getDay()];
  }
  // 给数字 0 的 stat-block 打 is-zero，弱化全 0 的视觉冲击
  function syncStatZero(selector, val) {
    var el = document.querySelector('.today-stats ' + selector);
    if (!el) return;
    if (Number(val) === 0) el.classList.add('is-zero'); else el.classList.remove('is-zero');
  }

  function renderTodayAggregate() {
    if (!refs.aggCountdown) return;
    // 日期（顶部）
    if (refs.todayDate) refs.todayDate.textContent = fmtTodayWithWeekday(Store.todayStr());
    // 倒计时
    var examDate = Store.getConfig().examDate;
    var diff = '--';
    if (examDate) {
      diff = Math.ceil((new Date(examDate) - new Date(Store.todayStr())) / 86400000);
      refs.aggCountdown.textContent = diff > 0 ? diff : (diff === 0 ? '今天' : '已过');
    } else { refs.aggCountdown.textContent = '未设置'; }
    // ====== 新增：倒计时深紫卡片填充 ======
    var cdDay = document.getElementById('cd-day');
    var cdPct = document.getElementById('cd-pct');
    var cdFill = document.getElementById('cd-fill');
    var cdTarget = document.getElementById('cd-target');
    var cdQuote = document.getElementById('cd-quote');
    if (cdDay) cdDay.textContent = (typeof diff === 'number' && diff > 0) ? diff : (diff === '今天' ? '0' : '--');
    if (examDate) {
      try {
        var startHint = Store.getConfig() && Store.getConfig()._startDate ? Store.getConfig()._startDate : null;
        var total = 200;  // 默认考研周期估算 200 天
        if (startHint) {
          total = Math.max(30, Math.round((new Date(examDate) - new Date(startHint)) / 86400000));
        } else {
          total = Math.max(30, 180 + (diff > 0 ? diff : 0));
        }
        var remain = typeof diff === 'number' && diff > 0 ? diff : 0;
        var passed = Math.max(0, total - remain);
        var pct = total ? Math.round(passed / total * 100) : 0;
        if (cdPct) cdPct.textContent = pct + '%';
        if (cdFill) cdFill.style.width = Math.min(100, pct) + '%';
      } catch (e) { if (cdPct) cdPct.textContent = '--'; if (cdFill) cdFill.style.width = '0%'; }
    } else {
      if (cdPct) cdPct.textContent = '请设置考研日期';
      if (cdFill) cdFill.style.width = '0%';
    }
    if (cdTarget) {
      var cfg = Store.getConfig();
      var majorName = (cfg.major && cfg.major.trim()) ? cfg.major : '目标院校 / 专业';
      cdTarget.textContent = '🎯 ' + majorName;
    }
    if (cdQuote) {
      var quotes = [
        '“日拱一卒，功不唐捐”',
        '“慢慢来，比较快”',
        '“今天的努力，是幸运的伏笔”',
        '“再坚持一下，你已经走了这么远”',
        '“保持专注，静待花开”',
        '“每天进步 1%”'
      ];
      cdQuote.textContent = quotes[new Date().getDate() % quotes.length];
    }
    // ====== 新增：本周学习时长（第 4 张趋势卡） ======
    var weeklyHours = 0;
    try {
      var stats = getStudyStats();
      var weekMin = 0;
      var now = new Date(Store.todayStr());
      for (var i = 0; i < 7; i++) {
        var d = new Date(now); d.setDate(d.getDate() - i);
        var ds = d.toISOString().slice(0, 10);
        var dd = Store.getDay(ds) || {};
        weekMin += Store.totalMinutesForDay(dd);
      }
      weeklyHours = Math.round(weekMin / 60 * 10) / 10;
    } catch (e) { weeklyHours = 0; }
    var aggTrend = document.getElementById('agg-trend-hrs');
    if (aggTrend) aggTrend.textContent = weeklyHours;

    // 今日学习时长
    var today = Store.getDay(Store.todayStr()) || {};
    var minutes = Store.totalMinutesForDay(today);
    refs.aggMinutes.textContent = minutes;
    // 今日学习得分
    var todayScore = scoreForDay(Store.todayStr(), today);
    if (refs.aggScore) refs.aggScore.textContent = todayScore;
    // 计划完成（拆分为 done / total 两个 span）
    var plan = Store.getPlan(Store.todayStr()) || [];
    var done = plan.filter(function (p) { return p.done; }).length;
    if (refs.aggPlanDone) refs.aggPlanDone.textContent = done;
    if (refs.aggPlanTotal) refs.aggPlanTotal.textContent = plan.length;
    // 连续打卡
    refs.aggStreak.textContent = Store.consecutiveStreak();
    // 累计等级（次级指标条右侧）
    if (refs.aggLevel) {
      try {
        var lvl = computeLevel(getStudyStats());
        refs.aggLevel.textContent = 'Lv.' + lvl.level;
      } catch (e) { refs.aggLevel.textContent = 'Lv.1'; }
    }
    // 零态视觉柔和化
    syncStatZero('.stat-focus', minutes);
    syncStatZero('.stat-streak', refs.aggStreak.textContent);
    syncStatZero('.stat-plan', plan.length === 0 ? 0 : done);
    syncStatZero('.stat-trend', weeklyHours);
    // 倒计时分阶段
    if (refs.aggPhase) {
      var ph = phaseInfo(examDate);
      if (!ph) { refs.aggPhase.innerHTML = ''; }
      else if (ph.ended) { refs.aggPhase.innerHTML = '<span class="phase-badge ended">已结束</span>'; }
      else {
        refs.aggPhase.innerHTML =
          '<span class="phase-badge ' + ph.phase + '">' + ph.phase + '阶段</span>' +
          '<span class="phase-text">本阶段剩余 <b>' + ph.phaseRemain + '</b> / ' + ph.phaseTotal + ' 天</span>' +
          '<span class="phase-bar"><span class="phase-fill ' + ph.phase + '" style="width:' + ph.pct + '%"></span></span>';
      }
    }
    // H1：科目进度聚合条
    renderAggSubjectProgress();
    // H3：快速开始引导卡
    renderTodayOnboarding();
  }

  /* ============ H1：科目进度聚合条（今日页 KPI 卡下方）——用语义色 ============ */
  function renderAggSubjectProgress() {
    if (!refs.aggSubjectProgress) return;
    var subs = Store.getSubjects();
    if (!subs.length) { refs.aggSubjectProgress.innerHTML = ''; return; }
    var html = '';
    subs.forEach(function (s) {
      // 章节进度：用已完成章节数（支持跳跃式学习）
      var doneCount = 0, total = 0;
      if (s.key === 'math') { total = Store.getMathChapters().length; doneCount = Store.getMathDone().length; }
      else if (s.key === 'cs408') { total = Store.get408Chapters().length; doneCount = Store.get408Done().length; }
      else { var ch = Store.getSubjectChapters(s.key) || {}; total = (ch.chapters || []).length; doneCount = (Array.isArray(ch.done) ? ch.done.length : 0); }
      var pct = total ? Math.max(0, Math.min(100, Math.round(doneCount / total * 100))) : 0;
      // 科目语义色映射（和 styles.css 里的 c-politics/c-english/c-math/c-major/c-cs408 对应）
      var key = (s.key || '').toLowerCase();
      var name = (s.name || '').toLowerCase();
      var colorClass = 'c-default';
      if (key === 'politics' || name.indexOf('政治') >= 0) colorClass = 'c-politics';
      else if (key === 'english' || name.indexOf('英语') >= 0) colorClass = 'c-english';
      else if (key === 'math' || name.indexOf('数学') >= 0) colorClass = 'c-math';
      else if (key === 'cs408' || name.indexOf('408') >= 0) colorClass = 'c-cs408';
      else if (key === 'major' || name.indexOf('专业') >= 0 || name.indexOf('专业课') >= 0) colorClass = 'c-major';
      html += '<div class="agg-sp-row">' +
                '<div class="agg-sp-name">' + escapeHtml(s.name) + '</div>' +
                '<div class="agg-sp-bar"><div class="agg-sp-fill ' + colorClass + '" style="width:' + pct + '%"></div></div>' +
                '<div class="agg-sp-percent">' + (total ? pct : '--') + '%</div>' +
              '</div>';
    });
    refs.aggSubjectProgress.innerHTML = html;
  }

  /* ============ H3：快速开始引导卡（新用户 4 步引导） ============ */
  function renderTodayOnboarding() {
    if (!refs.todayOnboarding || !refs.onboardingSteps) return;
    var cfg = Store.getConfig();
    var subs = Store.getSubjects();
    var plan = Store.getPlan(Store.todayStr()) || [];
    var today = Store.getDay(Store.todayStr()) || {};
    var hasMin = Store.totalMinutesForDay(today) > 0;

    var step1Done = !!(cfg.nickname || cfg.examDate || cfg.targetTotal);
    var step2Done = subs.length > 0;
    var step3Done = plan.length > 0;
    var step4Done = hasMin;
    var allDone = step1Done && step2Done && step3Done && step4Done;

    if (allDone) {
      // 全部完成时默认隐藏引导卡，但保留在 DOM 中
      refs.todayOnboarding.hidden = true;
      return;
    }
    refs.todayOnboarding.hidden = false;

    function stepCard(idx, icon, title, sub, done, tabKey) {
      return '<div class="ob-step' + (done ? ' done' : '') + '" onclick="window.__switchTab(\'' + (tabKey || 'config') + '\')">' +
               '<div class="ob-step-num">' + (done ? '✓' : idx) + '</div>' +
               '<div class="ob-step-icon">' + icon + '</div>' +
               '<div class="ob-step-title">' + title + '</div>' +
               '<div class="ob-step-sub">' + sub + '</div>' +
               (idx < 4 ? '<div class="ob-step-arr">›</div>' : '') +
             '</div>';
    }
    refs.onboardingSteps.innerHTML =
      stepCard(1, '⚙️', '基础配置', '设置昵称·考试日期·目标分', step1Done, 'config') +
      stepCard(2, '📚', '勾选科目', '勾选你要考的科目和卷种', step2Done, 'config') +
      stepCard(3, '🗺️', '制定计划', '自动或手动安排今日学习计划', step3Done, 'today') +
      stepCard(4, '⏱', '开始计时', '按模块计时或手动记录学习', step4Done, 'record');
  }

  /* ============ 说明书模块（UI 散落说明集中处，分组卡片式） ============ */
  var MANUAL_GROUPS = [
    { cat: '🚀 快速上手', items: [
      { t: '第一次使用', b: '点上方「🚀 重看新手完整引导」：引导会带你先配置考试科目、翻译 API 与 AI 密钥，再逐页过一遍全部功能；之后随时回来查本页。' },
      { t: '每天的核心 4 步', b: '① 打开「今日」看总览 → ② 在「计划」安排任务 → ③ 在「记录」按模块计时 → ④ 睡前在「总结」打卡、在「数据」看趋势。' }
    ]},
    { cat: '📅 核心流程', items: [
      { t: '📅 今日 · 总览', b: '顶部聚合卡显示：距考研天数、今日学习分钟、计划完成度、连续打卡天数，以及各科目章节进度条。每天进来先看这里。' },
      { t: '🗺️ 计划', b: '「自动制定计划」按科目与可用时间生成今日安排；也可手动添加「科目 + 内容 + 分钟」。给计划项加「说明」可标注注意事项；计划与「记录」页计时联动，完成会自动勾掉。' },
      { t: '⏱ 记录 · 计时 / 番茄钟 / 倒计时', b: '每科一条独立计时器，开始/结束把时长记到今日；番茄钟默认 25+5 分钟可调，休息/结束弹提醒；倒计时适合套卷限时训练。' },
      { t: '📋 总结 · 打卡分享', b: '写今日总结、生成打卡卡片分享到群（带二维码，朋友扫码可一起打卡）。' },
      { t: '📊 数据 · 看板', b: '含：近 30 天得分、单月热力图、学习趋势、今日时长饼图、综合雷达图、科目进度、薄弱点分析报告。全部来自你的本地记录。' }
    ]},
    { cat: '📚 专项科目', items: [
      { t: '🧮 数学', b: '顶部下拉选择卷种（数一/数二/数三，切换按新大纲重置章节）；章节按「高数/线代/概率」分组折叠。可整理错题（Leitner 间隔复习 + 速查卡自测）、分类刷题与自定义题库。' },
      { t: '💻 408', b: '数据结构/计组/操作系统/网络四书章节分组折叠，标记进度；错题支持 Leitner 间隔复习；另有知识点速记卡与历年真题得分追踪。' },
      { t: '📌 错题本', b: '跨科目整理错题（今日感悟/问题/盲区/易错点等），标记回顾后按间隔复习自动排期，到期提醒。' }
    ]},
    { cat: '🗣️ 英语 · 词汇', items: [
      { t: '🎴 背单词', b: '「英选译」四选一测验，不认识自动归入复习队列；右上齿轮可自定义每次题量、出题范围与模式。' },
      { t: '🔁 生词复习', b: '按记忆曲线（Leitner）每天推送待复习生词，「认识/不认识」决定下次间隔，不认识自动回炉。' },
      { t: '📚 高频词', b: '内置本地词库（阅读高频，离线可用），可搜索、筛选，勾选后一键加入生词本。' },
      { t: '🧩 长难句', b: '粘贴真题/外刊长难句，自动拆解结构、标注考点词、归纳同义替换；配置 AI 后可一键深度分析（成分拆解/全文翻译/出题意图）。' },
      { t: '📝 生词记录', b: '管理你的生词本：编辑释义、标记掌握、移入复习或删除；支持批量导入与翻译自动归档。' }
    ]},
    { cat: '🧰 工具 · 资源', items: [
      { t: '🌐 资源网站', b: '内置常用站点（国内可直接访问），也可添加自己的收藏，一键打开。' },
      { t: '⚙️ 配置', b: '填基础信息、勾选科目组合、调得分权重；「数据备份」可导出/导入 JSON、导出 Markdown 报告、清空全部。换设备前务必先导出备份。' },
      { t: '☁️ 云端同步', b: '用手机号作为唯一账号：首次填写即注册并把数据上传到云端；换设备登录只需输入同一手机号即可同步，无需记密码。注册/登录二合一，下方状态会提示成功与否。' },
      { t: '🌐 翻译 API', b: '在「配置」填你自己的百度翻译 APP ID 与 密钥（仅存本机、不上传）。填好后「即时翻译」可直接查词，查过的词自动归档到查词记录。' },
      { t: '🤖 AI 助手', b: '在「配置」填你自己的大模型 API Key（OpenAI 兼容接口），即可启用长难句深度分析、错题智能归纳等能力。密钥仅存本机、经云端函数中转，不暴露到前端。' }
    ]}
  ];
  function renderHelpManual() {
    var box = document.getElementById('manual-list');
    if (!box || box.dataset.done) return;
    var html = '';
    MANUAL_GROUPS.forEach(function (g) {
      html += '<div class="manual-group"><div class="manual-group-title">' + g.cat + '</div><div class="manual-grid">';
      g.items.forEach(function (m) {
        html += '<div class="manual-item"><div class="manual-item-title">' + m.t + '</div>' +
                '<div class="manual-item-body">' + m.b + '</div></div>';
      });
      html += '</div></div>';
    });
    box.innerHTML = html;
    box.dataset.done = '1';
  }

  /* ============ 新手完整引导（全屏分步导览，过一遍所有功能） ============ */
  var TOUR_STEPS = [
    { icon: '👋', title: '欢迎使用考研学习记录', tab: 'today', text: '这是你的专属考研进度管理站：每日打卡、专注计时、错题本、长难句分析、背单词一应俱全。先完成两步关键配置，让查词和 AI 讲解开箱即用。' },
    { icon: '🔑', title: '优先配置：翻译密钥', tab: 'config', target: '.translator-card', text: '查词和「翻译并归档」依赖百度翻译。去「配置」页填 APP ID 与密钥（免费申请，仅存本机浏览器，不上传）。' },
    { icon: '🤖', title: '优先配置：AI 能力', tab: 'config', target: '.ai-card', text: '错题 AI 讲解、长难句深度分析需要 AI 接口。填接口地址（推荐 DeepSeek，https://api.deepseek.com/v1）、模型（deepseek-chat）与 Key。你的 Key 经本站服务器中转，不会暴露在浏览器。' },
    { icon: '📅', title: '今日总览', tab: 'today', text: '打开先看这里：距考研天数、今日学习分钟、计划完成度、连续打卡、各科目进度一目了然。' },
    { icon: '🚀', title: '快速开始 4 步', tab: 'today', text: '首次使用走 4 步：配置 → 勾科目 → 定计划 → 计时。完成后引导卡自动隐藏。' },
    { icon: '🗺️', title: '每日计划', tab: 'plan', text: '自动或手动安排今日学习任务，完成会自动勾掉，和计时联动。' },
    { icon: '⏱', title: '按模块计时', tab: 'record', text: '每科独立计时器，开始/结束把时长记到今日；也支持番茄钟和限时倒计时。' },
    { icon: '📋', title: '总结与分享', tab: 'summary', text: '写每日总结、生成打卡卡片发群里，带二维码邀请朋友一起打卡。' },
    { icon: '📊', title: '数据看板', tab: 'data', text: '热力图、趋势、饼图、雷达图、科目进度、周报，全来自你的本地记录。' },
    { icon: '🧮', title: '数学模块', tab: 'math', text: '章节进度（可折叠分组）、错题整理、刷题、题库，系统化学数学。' },
    { icon: '💻', title: '408 模块', tab: 'cs408', text: '四科章节、错题间隔复习、知识点速记、历年真题得分追踪。' },
    { icon: '📌', title: '错题本', tab: 'mistakes', text: '跨科目整理错题，标记回顾后按间隔复习自动排期。' },
    { icon: '🔁', title: '复习 / 自测', tab: 'review', text: '查词记生词，按记忆曲线每天推送待复习词；切到「测验模式」可做 4 选 1 自测（⚙️ 可自定义题量/范围/模式）。' },
    { icon: '🧩', title: '长难句', tab: 'sentences', text: '粘贴长难句自动拆解结构、标注考点词、归纳同义替换；还可一键 AI 深度分析。' },
    { icon: '☁️', title: '云端同步', tab: 'config', text: '用手机号作为唯一账号：填手机号注册并上传，换设备输入同一手机号即可同步，无需密码。' },
    { icon: '📖', title: '说明书', tab: 'manual', text: '所有功能说明都集中在「说明书」页，随时回来查。引导到此结束，接下来就靠你自己探索啦！' }
  ];
  var tourIdx = 0, tourEl = null;
  function startTour() {
    if (tourEl) return;
    tourIdx = 0;
    tourEl = document.createElement('div');
    tourEl.className = 'tour-mask';
    tourEl.innerHTML =
      '<div class="tour-box" role="dialog" aria-modal="true">' +
        '<div class="tour-progress"><span id="tour-dot"></span></div>' +
        '<div class="tour-icon" id="tour-icon"></div>' +
        '<div class="tour-title" id="tour-title"></div>' +
        '<div class="tour-text" id="tour-text"></div>' +
        '<div class="tour-nav">' +
          '<button class="btn btn-ghost" id="tour-prev">上一步</button>' +
          '<button class="btn btn-ghost" id="tour-goto">前往该功能 ›</button>' +
          '<button class="btn btn-ghost" id="tour-skip">跳过</button>' +
          '<button class="btn btn-primary" id="tour-next">下一步</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(tourEl);
    tourEl.addEventListener('click', function (e) { if (e.target === tourEl) closeTour(false); });
    document.getElementById('tour-prev').addEventListener('click', function () { if (tourIdx > 0) { tourIdx--; renderTourStep(); } });
    document.getElementById('tour-next').addEventListener('click', function () {
      if (tourIdx < TOUR_STEPS.length - 1) { tourIdx++; renderTourStep(); } else finishTour();
    });
    document.getElementById('tour-skip').addEventListener('click', function () { closeTour(true); });
    document.getElementById('tour-goto').addEventListener('click', function () {
      var step = TOUR_STEPS[tourIdx];
      closeTour(false); switchTab(step.tab);
      if (step.target) highlightTourTarget(step.target);
    });
    renderTourStep();
  }
  // 指向性指示：切换后高亮目标卡片/按钮，并带 👉 箭头说明
  function highlightTourTarget(selector) {
    var t = document.querySelector(selector);
    if (!t) { showToast('该页面暂未找到对应设置项'); return; }
    // 目标可能位于折叠的 <details> 内（如「连接与密钥」），先展开父折叠区再高亮，否则用户看不到
    try { var dPar = t.closest('details'); if (dPar) dPar.setAttribute('open', ''); } catch (e) {}
    t.classList.add('tour-target');
    if (typeof t.scrollIntoView === 'function') {
      try { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { try { t.scrollIntoView(); } catch (e2) {} }
    }
    setTimeout(function () { t.classList.remove('tour-target'); }, 5000);
  }
  function renderTourStep() {
    if (!tourEl) return;
    var s = TOUR_STEPS[tourIdx];
    document.getElementById('tour-icon').textContent = s.icon;
    document.getElementById('tour-title').textContent = (tourIdx + 1) + '/' + TOUR_STEPS.length + ' · ' + s.title;
    document.getElementById('tour-text').textContent = s.text;
    document.getElementById('tour-dot').textContent = (tourIdx + 1) + ' / ' + TOUR_STEPS.length;
    document.getElementById('tour-prev').disabled = (tourIdx === 0);
    document.getElementById('tour-next').textContent = (tourIdx === TOUR_STEPS.length - 1) ? '完成' : '下一步';
    var goto = document.getElementById('tour-goto');
    if (goto) {
      goto.style.display = s.target ? '' : 'none';
      if (s.target) goto.textContent = '👉 前往配置 ›';
    }
  }
  function closeTour(markDone) {
    if (markDone) { try { localStorage.setItem('kaoyan_tour_done', '1'); } catch (e) {} }
    if (tourEl) { tourEl.remove(); tourEl = null; }
  }
  function finishTour() { closeTour(true); }

  /* ============ 通用：回到顶部按钮 ============ */
  function initBackTop() {
    var btn = document.getElementById('backTopBtn');
    if (btn) return;
    btn = document.createElement('button');
    btn.id = 'backTopBtn'; btn.className = 'back-top'; btn.title = '回到顶部'; btn.innerHTML = '↑';
    btn.setAttribute('aria-label', '回到顶部');
    btn.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
    document.body.appendChild(btn);
    window.addEventListener('scroll', function () {
      btn.classList.toggle('show', window.scrollY > 400);
    }, { passive: true });
  }

  /* ============ 礼花特效（纯 Canvas，无外部依赖） ============ */
  function fireConfetti() {
    var canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:99999;';
    document.body.appendChild(canvas);
    var ctx = canvas.getContext('2d');
    var W = canvas.width = window.innerWidth;
    var H = canvas.height = window.innerHeight;
    var colors = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#3b82f6'];
    var particles = [];
    for (var i = 0; i < 120; i++) {
      particles.push({
        x: W / 2 + (Math.random() - 0.5) * 200,
        y: H / 2,
        vx: (Math.random() - 0.5) * 12,
        vy: -Math.random() * 14 - 6,
        size: Math.random() * 8 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.3,
        life: 1
      });
    }
    var frames = 0;
    function tick() {
      ctx.clearRect(0, 0, W, H);
      var alive = false;
      particles.forEach(function (p) {
        p.vy += 0.35;
        p.x += p.vx; p.y += p.vy;
        p.rot += p.vr;
        p.life -= 0.008;
        if (p.life > 0 && p.y < H + 50) {
          alive = true;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.globalAlpha = Math.max(0, p.life);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
          ctx.restore();
        }
      });
      frames++;
      if (alive && frames < 300) requestAnimationFrame(tick);
      else canvas.remove();
    }
    tick();
  }

  /* ============ 通用：增强型 Toast（支持 ok/err/warn/info 四种视觉） ============ */
  function showToast(msg, type) {
    var t = refs.toast;
    t.className = 'toast' + (type ? ' ' + type : '');
    // 根据类型加前缀图标
    var prefix = '';
    if (type === 'ok') prefix = '✅ ';
    else if (type === 'err') prefix = '❌ ';
    else if (type === 'warn') prefix = '⚠️ ';
    else if (type === 'info') prefix = 'ℹ️ ';
    t.textContent = prefix + msg;
    t.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2000);
  }

  /* ============ 通用：删除确认包装 ============ */
  function confirmDelete(msg, okFn) {
    if (confirm(msg || '确定删除？此操作不可恢复。')) { okFn && okFn(); }
  }

  function applyTheme() {
    var theme = Store.getTheme();
    document.documentElement.setAttribute('data-theme', theme);
    if (refs.themeToggle) refs.themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
  }
  function toggleTheme() {
    var next = Store.getTheme() === 'dark' ? 'light' : 'dark';
    Store.setTheme(next);
    applyTheme();
  }

  function initKeyboardShortcuts() {
    var KEY_MAP = { '1': 'config', '2': 'today', '3': 'plan', '4': 'summary', '5': 'record', '6': 'data', '7': 'mistakes', '8': 'math', '9': 'cs408', '0': 'websites' };
    document.addEventListener('keydown', function (e) {
      // 输入框中不触发
      var tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      var k = e.key;
      if (KEY_MAP[k]) { e.preventDefault(); switchTab(KEY_MAP[k]); }
      if (k === 't' || k === 'T') { e.preventDefault(); toggleTheme(); }
      /* N：新建任务 → 跳到计划页并聚焦添加框 */
      if (k === 'n' || k === 'N') { e.preventDefault(); switchTab('plan'); setTimeout(function () { var pi = document.getElementById('plan-item-text'); if (pi) pi.focus(); }, 200); }
      /* 斜杠 /：聚焦第一个搜索/输入框 */
      if (k === '/') { e.preventDefault(); var si = document.querySelector('.tab-panel.active input[type="text"], .tab-panel.active input[type="search"]'); if (si) si.focus(); }
    });
  }

  /* ---------------- 云端同步（简化版） ---------------- */
  function renderSyncConfig() {
    if (!refs.syncCode) return;
    refs.syncCode.value = Store.getLastSyncCode();
  }
  function populatePlanSubjects() {
    if (!refs.planSubject) return;
    var cur = refs.planSubject.value;
    refs.planSubject.innerHTML = '<option value="">不指定科目</option>';
    Store.getSubjects().forEach(function (s) {
      var o = document.createElement('option');
      o.value = s.key; o.textContent = s.name;
      refs.planSubject.appendChild(o);
    });
    if (cur) refs.planSubject.value = cur;
  }
  function syncSetStatus(msg, type) {
    if (!refs.syncStatus) return;
    refs.syncStatus.textContent = msg || '';
    refs.syncStatus.className = 'import-status' + (type ? ' ' + type : '');
  }
  function syncApi(method, payload, syncOpts) {
    var code = (refs.syncCode ? refs.syncCode.value.trim().toUpperCase() : '') || '';
    if (!code) { syncSetStatus('请先输入登录码', 'error'); return Promise.reject(new Error('no sync code')); }
    var headers = { 'Content-Type': 'application/json' };
    headers['X-Sync-Key'] = code;
    var opts = { method: method, headers: headers };
    if (method === 'PUT' || method === 'POST') {
      var body = { syncCode: code, deviceId: Store.getLastDeviceId() };
      if (payload !== undefined) body.data = payload;
      // B1：PUT 携带 baseVersion（上次 GET 拿到的版本）用于服务端乐观并发比对；force 覆盖时省略以跳过比对
      if (syncOpts && syncOpts.baseVersion) body.baseVersion = syncOpts.baseVersion;
      opts.body = JSON.stringify(body);
    }
    return fetch('/api/sync', opts).then(function (r) { return r.json().then(function (j) { return [r, j]; }); }).then(function (arr) {
      var resp = arr[0], j = arr[1];
      if (!resp.ok) throw new Error(j && j.error ? j.error : ('HTTP ' + resp.status));
      return j;
    });
  }

  /* 注册 / 登录（手机号即唯一账号，无需密码） */
  function onSyncConfirm() {
    var raw = (refs.syncCode ? refs.syncCode.value : '') || '';
    var phone = raw.replace(/\D/g, ''); // 仅保留数字
    if (!phone) { syncSetStatus('请先输入手机号', 'error'); return; }
    if (phone !== raw) { syncSetStatus('手机号只能包含数字', 'error'); return; }
    if (phone.length < 6 || phone.length > 15) { syncSetStatus('手机号格式不正确（应为 6-15 位数字）', 'error'); return; }
    if (refs.syncCode) refs.syncCode.value = phone; // 清理非数字字符
    syncSetStatus('正在连接云端…', '');
    // 先查云端是否已有该手机号的数据：有=登录，无=注册
    syncApi('GET').then(function (res) {
      if (res && res.data) doLogin(phone);
      else doRegister(phone);
    }).catch(function (err) {
      syncSetStatus('❌ 连接失败：' + (err.message || err), 'error');
    });
  }
  function doRegister(phone) {
    Store.setLastSyncCode(phone);
    syncSetStatus('正在注册并上传…', '');
    var payload = Store.snapshot();
    syncApi('PUT', payload).then(function (res) {
      syncSetStatus('✅ 注册成功，数据已上传云端（版本 ' + (res && res.version ? res.version : '?') + '）', 'ok');
      showToast('账号已创建，云端同步已开启 ☁️');
      enableAutoSyncAfterLogin(phone);
    }).catch(function (err) {
      syncSetStatus('❌ 注册失败：' + (err.message || err), 'error');
    });
  }
  function doLogin(phone) {
    // 本机若有数据，登录会覆盖，先确认
    if (localHasData()) {
      if (!confirm('云端已有手机号「' + phone + '」的账号数据。\n登录将用云端数据覆盖本机现有数据，确定继续？\n（点取消可保留本机数据、不登录）')) {
        syncSetStatus('⚠️ 已取消登录，本机数据保留', 'error');
        return;
      }
    }
    syncSetStatus('正在登录并下载…', '');
    syncApi('GET').then(function (res) {
      if (!res || !res.data) { doRegister(phone); return; } // 竞态：查到有时已被清，转为注册
      isApplyingRemote = true;
      var ok = Store.restoreSnapshot(res.data);
      isApplyingRemote = false;
      if (!ok) { syncSetStatus('❌ 数据恢复失败，格式不兼容', 'error'); return; }
      if (res.version) lastSyncVersion = res.version;
      Store.setLastSyncCode(phone);
      syncSetStatus('✅ 登录成功，已同步云端数据', 'ok');
      showToast('登录成功，数据已同步 ☁️');
      enableAutoSyncAfterLogin(phone);
      setTimeout(function () { location.reload(); }, 900);
    }).catch(function (err) {
      syncSetStatus('❌ 登录失败：' + (err.message || err), 'error');
    });
  }
  function enableAutoSyncAfterLogin(phone) {
    autoSyncEnabled = true;
    try { localStorage.setItem('kaoyan_tracker_v1:auto_sync', '1'); } catch (e) {}
    lastPushAt = Date.now();
    try { localStorage.setItem('kaoyan_tracker_v1:auto_sync_push_at', String(lastPushAt)); } catch (e) {}
    startAutoSyncPolling();
  }
  function localHasData() {
    try {
      var snap = Store.snapshot();
      return (snap.vocab && snap.vocab.length) ||
             (snap.wrongWords && snap.wrongWords.length) ||
             (snap.days && Object.keys(snap.days).length) ||
             (snap.mathChapters && snap.mathChapters.length) ||
             (snap.plans && snap.plans.length) ||
             (snap.subjects && snap.subjects.length);
    } catch (e) { return false; }
  }
  // 云端快照是否含真实内容（与 localHasData 对称，用于防止「空云端覆盖满本地」）
  function cloudHasData(obj) {
    if (!obj || typeof obj !== 'object') return false;
    return (obj.vocab && obj.vocab.length) ||
           (obj.wrongWords && obj.wrongWords.length) ||
           (obj.days && Object.keys(obj.days).length) ||
           (obj.mathChapters && obj.mathChapters.length) ||
           (obj.plans && obj.plans.length) ||
           (obj.mistakes && obj.mistakes.length) ||
           (obj.cs408Chapters && obj.cs408Chapters.length) ||
           (obj.subjectChapters && Object.keys(obj.subjectChapters).length);
  }

  /* ---- 自动同步（默认开启，用户无感） ---- */
  var autoSyncEnabled = false;
  var lastPushAt = 0;
  var lastLocalEditAt = 0;
  var lastSyncVersion = ''; // B1：上次 GET 拿到的云端版本，PUT 时作为 baseVersion 比对
  var autoSyncTimer = null;
  var autoPushTimer = null;
  var isApplyingRemote = false;
  function autoSyncTimeStr(d) {
    var h = d.getHours(), m = d.getMinutes();
    return (h < 10 ? '0' + h : h) + ':' + (m < 10 ? '0' + m : m);
  }
  function loadAutoSyncPref() {
    try { autoSyncEnabled = localStorage.getItem('kaoyan_tracker_v1:auto_sync') === '1'; } catch (e) { autoSyncEnabled = false; }
    var p = '0';
    try { p = localStorage.getItem('kaoyan_tracker_v1:auto_sync_push_at') || '0'; } catch (e) {}
    lastPushAt = Number(p) || 0;
    var e0 = '0';
    try { e0 = localStorage.getItem('kaoyan_tracker_v1:auto_sync_edit_at') || '0'; } catch (e) {}
    lastLocalEditAt = Number(e0) || 0;
    if (autoSyncEnabled) startAutoSyncPolling();
  }
  function scheduleAutoPush() {
    if (!autoSyncEnabled || isApplyingRemote) return;
    var code = (refs.syncCode ? refs.syncCode.value.trim().toUpperCase() : '') || '';
    if (!code) return;
    lastLocalEditAt = Date.now();
    try { localStorage.setItem('kaoyan_tracker_v1:auto_sync_edit_at', String(lastLocalEditAt)); } catch (e) {}
    if (autoPushTimer) clearTimeout(autoPushTimer);
    autoPushTimer = setTimeout(function () { doAutoPush(code); }, 2000);
  }
  function doAutoPush(code, force) {
    if (!autoSyncEnabled || isApplyingRemote) return;
    var payload = Store.snapshot();
    // B1：携带 baseVersion 供服务端乐观并发比对；force=true 时省略（强制覆盖冲突版本）
    syncApi('PUT', payload, (force || !lastSyncVersion) ? {} : { baseVersion: lastSyncVersion })
      .then(function () {
        lastPushAt = Date.now();
        lastLocalEditAt = lastPushAt; // 推送成功后本地无未同步改动
        try { localStorage.setItem('kaoyan_tracker_v1:auto_sync_push_at', String(lastPushAt)); } catch (e) {}
        try { localStorage.setItem('kaoyan_tracker_v1:auto_sync_edit_at', String(lastLocalEditAt)); } catch (e) {}
      })
      .catch(function (err) {
        // 409 冲突：云端已被其他设备修改（版本不一致）。征询用户：强制覆盖云端 or 拉取云端覆盖本机
        if (err && /conflict/i.test(err.message || '')) {
          var overwrite = confirm('云端数据已被其他设备更新（版本冲突）。\n点「确定」用本机数据强制覆盖云端（其他设备的改动将丢失）；\n点「取消」拉取云端覆盖本机。');
          if (overwrite) {
            doAutoPush(code, true); // 强制覆盖，不带 baseVersion
          } else {
            syncApi('GET').then(function (res) {
              if (res && res.data) {
                isApplyingRemote = true;
                Store.restoreSnapshot(res.data);
                isApplyingRemote = false;
                if (res.version) lastSyncVersion = res.version;
                lastPushAt = (res.meta && res.meta.updatedAt) ? new Date(res.meta.updatedAt).getTime() : Date.now();
                try { localStorage.setItem('kaoyan_tracker_v1:auto_sync_push_at', String(lastPushAt)); } catch (e) {}
                if (typeof renderAll === 'function') renderAll();
              }
            }).catch(function () {});
          }
        }
      });
  }
  function startAutoSyncPolling() {
    if (autoSyncTimer) clearInterval(autoSyncTimer);
    autoSyncTimer = setInterval(function () {
      if (!autoSyncEnabled) return;
      doAutoPullCheck();
    }, 30000);
  }
  function doAutoPullCheck() {
    var code = (refs.syncCode ? refs.syncCode.value.trim().toUpperCase() : '') || '';
    if (!code || isApplyingRemote) return;
    syncApi('GET').then(function (res) {
      if (!res || !res.data) {
        if (autoSyncEnabled && lastPushAt === 0) doAutoPush(code);
        return;
      }
      if (res.version) lastSyncVersion = res.version;
      var cloudUpdated = (res.meta && res.meta.updatedAt) ? new Date(res.meta.updatedAt).getTime() : 0;
      // B1：用 max(上次推送, 本地最近编辑) 比较，而非仅 lastPushAt；避免本地未同步编辑被静默整份覆盖
      var localLatest = Math.max(lastPushAt, lastLocalEditAt);
      if (cloudUpdated > localLatest) {
        // 【关键修复】云端时间戳更新，但本地有真实数据而云端为空/近乎空 →
        // 绝不能「以空覆盖满」把本地清空。以本地为准把本地推上去对齐云端，保护用户资料。
        if (localHasData() && !cloudHasData(res.data)) {
          doAutoPush(code);
          return;
        }
        // 本地存在未同步编辑（编辑后还没推上去），云端又有更新 → 不静默覆盖，征询用户
        if (lastLocalEditAt > lastPushAt) {
          var proceed = confirm('云端数据已于 ' + new Date(cloudUpdated).toLocaleString() + ' 更新，但本机也有未保存的改动。\n确定用云端覆盖本机吗？（本机未保存改动将丢失）\n点「取消」保留本机改动、稍后手动同步。');
          if (!proceed) {
            lastPushAt = cloudUpdated; // 标记为已阅，避免每次轮询反复弹窗
            try { localStorage.setItem('kaoyan_tracker_v1:auto_sync_push_at', String(lastPushAt)); } catch (e) {}
            return;
          }
        }
        isApplyingRemote = true;
        var ok = Store.restoreSnapshot(res.data);
        isApplyingRemote = false;
        if (ok) {
          lastPushAt = cloudUpdated;
          try { localStorage.setItem('kaoyan_tracker_v1:auto_sync_push_at', String(lastPushAt)); } catch (e) {}
          if (typeof renderAll === 'function') renderAll();
        }
      } else if (lastPushAt === 0) {
        doAutoPush(code);
      }
    }).catch(function () {});
  }

  function renderAll() {
    // 第一批：用户立即可见的内容（配置、头部、计时器、今日页）
    renderConfig();
    renderTimerRows();
    renderManual();
    populatePlanSubjects();
    renderPlan();
    renderToday();
    renderCheckinCard();
    renderMistakeTypes();
    populateMistakeSubjects();
    renderTranslatorConfig();
    renderAiConfig();
    renderSyncConfig();
    updateTranslateButton();
    renderPomodoro();
    applyCountdownOnlyUI();
    // 第二批：不在当前 tab 或 DOM 密集的内容，延迟到下一帧执行，避免阻塞主线程
    setTimeout(function () {
      renderData();
      renderMistakeList();
      renderSites();
      renderWords();
      renderPractice();
      renderReview();
      renderSummary();
      renderHfWords();
      renderWrongBook();
      renderMastery();
      renderSubjectChapters();
      renderPlanItems();
      renderMathChapters();
      renderMathQuestionList();
      renderMathPractice();
      render408Chapters();
      render408QuestionList();
      render408Practice();
      render408Knowledge();
      render408Years();
    }, 0);
  }
  function showTab(target) {
    document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-tab') === target); });
    document.querySelectorAll('.tab-panel').forEach(function (p) { p.classList.toggle('active', p.id === 'tab-' + target); });
    if (target === 'review') setReviewMode(reviewMode);
    if (target === 'summary') renderSummary();
    if (target === 'config') { renderTranslatorConfig(); renderAiConfig(); }
    if (target === 'words') renderWrongBook();
    if (target === 'plan') { renderMastery(); renderSubjectChapters(); renderPlanItems(); }
    if (target === 'math') { renderMathChapters(); renderMathQuestionList(); renderMathPractice(); }
    if (target === 'cs408') { render408Chapters(); render408QuestionList(); render408Practice(); render408Knowledge(); render408Years(); }
    if (target === 'mistakes') { renderMistakeList(); }
    if (target === 'data') { renderData(); }
    if (target === 'today') renderTodayAggregate();
    if (target === 'manual') renderHelpManual();
    if (window.matchMedia('(max-width: 860px)').matches) document.body.classList.remove('nav-open');
  }
  function initTabs() {
    document.querySelectorAll('.tab-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { showTab(btn.getAttribute('data-tab')); });
    });
    updateMathTabVisibility();
    update408TabVisibility();

    /* ===== 移动端底部 Tab Bar 交互 ===== */
    var btbBtns = document.querySelectorAll('.bottom-tabbar .btb-btn');
    btbBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var target = btn.getAttribute('data-tab');
        var sideBtn = document.querySelector('.tab-btn[data-tab="' + target + '"]');
        if (sideBtn) sideBtn.click();
      });
    });

    /* ===== FAB 悬浮按钮：切换到记录页开始计时 ===== */
    var fab = document.getElementById('fabAction');
    if (fab) {
      fab.addEventListener('click', function () {
        var sideBtn = document.querySelector('.tab-btn[data-tab="record"]');
        if (sideBtn) sideBtn.click();
      });
    }

    /* ===== 底部 Tab Bar 高亮同步 ===== */
    var sideTabBtns = document.querySelectorAll('.tab-btn');
    var origTabHandler = sideTabBtns.length ? sideTabBtns[0].onclick : null;
    sideTabBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var target = btn.getAttribute('data-tab');
        btbBtns.forEach(function (b) {
          b.classList.toggle('active', b.getAttribute('data-tab') === target);
        });
      });
    });
  }

  function init() {
    refs.majorSelect = $('major-select');
    refs.nicknameInput = $('nickname-input');
    refs.examDate = $('exam-date');
    refs.targetTotal = $('target-total');
    refs.autoPlan = $('auto-plan');
    refs.toggles = $('toggles');
    refs.detail = $('subject-detail');
    refs.btnExport = $('btn-export');
    refs.fileImport = $('file-import');
    refs.btnResetAll = $('btn-reset-all');

    // 云同步（简化版）
    refs.syncCode = $('sync-code');
    refs.btnSyncConfirm = $('btn-sync-confirm');
    refs.syncStatus = $('sync-status');

    refs.timerRows = $('timer-rows');
    refs.pomoTime = $('pomo-time');
    refs.pomoMode = $('pomo-mode');
    refs.btnPomoStart = $('btn-pomo-start');
    refs.btnPomoReset = $('btn-pomo-reset');
    refs.manualDate = $('manual-date');
    refs.manualDurations = $('manual-durations');
    refs.manualCompleted = $('manual-completed');
    refs.summaryEdit = $('summary-edit');
    refs.btnSaveSummary = $('btn-save-summary');
    refs.btnSaveManual = $('btn-save-manual');
    refs.btnResetDay = $('btn-reset-day');
    refs.examName = $('exam-name');
    refs.examDate2 = $('exam-date2');
    refs.examScores = $('exam-scores');
    refs.btnSaveExam = $('btn-save-exam');
    refs.examList = $('exam-list');
    refs.dayList = $('day-list');

    refs.countdown = $('countdown');
    refs.goalProgress = $('goal-progress');
    refs.scoreSummary = $('score-summary');
    refs.scoreBars = $('score-bars');
    refs.badgesLevel = $('badges-level');
    refs.badgesGrid = $('badges-grid');
    refs.heatmap = $('heatmap');
    refs.heatLabel = $('heat-label');
    refs.heatPrev = $('heat-prev');
    refs.heatNext = $('heat-next');
    refs.heatNow = $('heat-now');
    refs.trend = $('trend');
    refs.todayPie = $('today-pie');
    refs.subjectRadar = $('subject-radar');
    refs.subjectBars = $('subject-bars');
    refs.subjectStats = $('subject-stats');
    refs.weaknessReport = $('weakness-report');
    refs.weaknessCard = $('weakness-card');

    refs.btnAutoPlan = $('btn-auto-plan');
    refs.planList = $('plan-list');
    refs.planSubject = $('plan-subject');
    refs.planText = $('plan-text');
    refs.planMin = $('plan-min');
    refs.btnAddPlan = $('btn-add-plan');
    refs.todayOnboarding = $('today-onboarding');
    refs.onboardingSteps = $('onboarding-steps');
    refs.btnStartTour = $('btn-start-tour');
    refs.btnRestartTour = $('btn-restart-tour');
    refs.aggSubjectProgress = $('agg-subject-progress');

    refs.mistakeTypes = $('mistake-types');
    refs.mistakeSubject = $('mistake-subject');
    refs.mistakeContent = $('mistake-content');
    refs.mistakeNote = $('mistake-note');
    refs.btnAddMistake = $('btn-add-mistake');
    refs.mistakeList = $('mistake-list');
    // 三套错题本合并：范围选择器 + 速查卡
    refs.mistakeScope = $('mistake-scope');
    refs.mistakeScopeGeneral = $('mistake-scope-general');
    refs.mistakeScopeMath = $('mistake-scope-math');
    refs.mistakeScopeCs408 = $('mistake-scope-cs408');
    refs.mistakeMathCat = $('mistake-math-cat');
    refs.mistakeCs408Cat = $('mistake-cs408-cat');
    refs.mistakeDueBadge = $('mistake-due-badge');
    refs.mistakeFilter = $('mistake-filter');
    refs.mistakeFlashScope = $('mistake-flash-scope');
    refs.btnMistakeFlashStart = $('btn-mistake-flash-start');
    refs.mistakeFlashcardBox = $('mistake-flashcard-box');

    refs.curatedSites = $('curated-sites');
    refs.userSites = $('user-sites');
    refs.siteName = $('site-name');
    refs.siteUrl = $('site-url');
    refs.btnAddSite = $('btn-add-site');

    refs.toast = $('toast');

    // 词汇模块
    refs.wordInput = $('word-input');
    refs.btnRecordWord = $('btn-record-word');
    refs.btnClearWord = $('btn-clear-word');
    refs.wordResult = $('word-result');
    refs.wordManual = $('word-manual');
    refs.wordManualCn = $('word-manual-cn');
    refs.btnSaveManualWord = $('btn-save-manual-word');
    refs.vocabCount = $('vocab-count');
    refs.vocabList = $('vocab-list');
    refs.practiceBox = $('practice-box');
    refs.btnPracticeRestart = $('btn-practice-restart');
    refs.btnPracticeSettings = $('btn-practice-settings');
    refs.practiceSettings = $('practice-settings');
    refs.psCount = $('ps-count');
    refs.psScope = $('ps-scope');
    refs.psMode = $('ps-mode');
    refs.psAutoSave = $('ps-autosave');
    refs.btnPsSave = $('btn-ps-save');
    refs.btnPsClose = $('btn-ps-close');
    refs.reviewHint = $('review-hint');
    refs.reviewBox = $('review-box');
    refs.btnReviewRestart = $('btn-review-restart');
    refs.navToggle = $('navToggle');
    refs.navBackdrop = $('navBackdrop');
    refs.navCollapse = $('navCollapse');

    // 生词批量导入
    refs.importText = $('import-text');
    refs.btnImportWords = $('btn-import-words');
    refs.importFile = $('import-file');
    refs.importStatus = $('import-status');

    // 长难句
    refs.sentenceInput = $('sentence-input');
    refs.btnAnalyze = $('btn-analyze');
    refs.btnClearSentence = $('btn-clear-sentence');
    refs.sentenceResult = $('sentence-result');

    // 高频词
    refs.hfSearch = $('hf-search');
    refs.hfList = $('hf-list');
    refs.hfCount = $('hf-count');

    // 今日总结
    refs.summaryBody = $('summary-body');
    refs.btnShareSummary = $('btn-share-summary');
    refs.btnAiSummary = $('btn-ai-summary');
    refs.aiSummaryOut = $('ai-summary-out');
    refs.btnHelp = $('btnHelp');

    // 今日打卡卡片（主页大按钮 + 连续天数 + 时间轴）
    refs.btnCheckinToday = $('btn-checkin-today');
    refs.ciStreak = $('ci-streak');
    refs.ciLabel = $('ci-label');
    refs.checkinDots = $('checkinDots');

    // 学习计划
    refs.masteryList = $('mastery-list');
    refs.moduleName = $('module-name');
    refs.btnAddModule = $('btn-add-module');
    refs.subjectChapters = $('subject-chapters');
    refs.btnSmartPlan = $('btn-smart-plan');
    refs.btnAiPlan = $('btn-ai-plan');
    refs.planItems = $('plan-items');
    refs.planItemText = $('plan-item-text');
    refs.planNote = $('plan-note');
    refs.btnAddPlanItem = $('btn-add-plan-item');

    // 数学模块
    refs.mathChapters = $('math-chapters');
    refs.mathPracticeCat = $('math-practice-cat');
    refs.mathPractice = $('math-practice');
    refs.btnMathPracticeStart = $('btn-math-practice-start');
    refs.mathQuestionList = $('math-question-list');
    refs.mqCat = $('mq-cat');
    refs.mqQ = $('mq-q');
    refs.mqOpt0 = $('mq-opt0');
    refs.mqOpt1 = $('mq-opt1');
    refs.mqOpt2 = $('mq-opt2');
    refs.mqOpt3 = $('mq-opt3');
    refs.mqAnswer = $('mq-answer');
    refs.mqExplain = $('mq-explain');
    refs.btnAddMq = $('btn-add-mq');

    // 408 专业课模块
    refs.cs408Chapters = $('cs408-chapters');
    refs.cs408PracticeCat = $('cs408-practice-cat');
    refs.cs408Practice = $('cs408-practice');
    refs.btnCs408PracticeStart = $('btn-cs408-practice-start');
    refs.cs408QuestionList = $('cs408-question-list');
    refs.cqCat = $('cq-cat');
    refs.cqQ = $('cq-q');
    refs.cqOpt0 = $('cq-opt0');
    refs.cqOpt1 = $('cq-opt1');
    refs.cqOpt2 = $('cq-opt2');
    refs.cqOpt3 = $('cq-opt3');
    refs.cqAnswer = $('cq-answer');
    refs.cqExplain = $('cq-explain');
    refs.btnAddCq = $('btn-add-cq');
    refs.kpSubject = $('kp-subject');
    refs.kpTitle = $('kp-title');
    refs.kpContent = $('kp-content');
    refs.btnAddKp = $('btn-add-kp');
    refs.kpFilter = $('kp-filter');
    refs.kpList = $('kp-list');
    refs.yrYear = $('yr-year');
    refs.yrScore = $('yr-score');
    refs.yrTotal = $('yr-total');
    refs.yrNote = $('yr-note');
    refs.btnAddYr = $('btn-add-yr');
    refs.yrList = $('yr-list');

    // 番茄钟 / 倒计时（合并）
    refs.pomoWork = $('pomo-work');
    refs.pomoBreak = $('pomo-break');
    refs.pomoCountdownOnly = $('pomo-countdown-only');
    refs.pomoWorkSec = $('pomo-work-sec');
    refs.pomoSecLabel = $('pomo-sec-label');

    // 主题切换 + 今日聚合
    refs.themeToggle = $('themeToggle');
    refs.aggCountdown = $('agg-countdown');
    refs.aggMinutes = $('agg-minutes');
    refs.aggScore = $('agg-score');
    refs.aggPlanDone = $('agg-plan-done');
    refs.aggPlanTotal = $('agg-plan-total');
    refs.aggStreak = $('agg-streak');
    refs.aggPhase = $('agg-phase');
    refs.aggLevel = $('agg-level');
    refs.todayDate = $('today-date');

    // 「加油！」按钮：脉冲动画 + 鼓励文案 toast
    refs.btnCheer = $('btn-cheer');
    if (refs.btnCheer) {
      refs.btnCheer.addEventListener('click', function () {
        // 防重入：脉冲动画期间不再重复触发
        if (refs.btnCheer.classList.contains('is-pulsing')) return;
        refs.btnCheer.classList.add('is-pulsing');
        setTimeout(function () { refs.btnCheer.classList.remove('is-pulsing'); }, 1500);
        var cheerPhrases = [
          '你比自己想象的更强 ✨',
          '今天也在为梦想努力 💪',
          '保持节奏，稳步前行 🌱',
          '每一步都算数，继续加油！',
          '专注当下，未来可期 🌟',
          '小积累，大改变 📈'
        ];
        var msg = cheerPhrases[Math.floor(Math.random() * cheerPhrases.length)];
        if (typeof showToast === 'function') showToast('💪 ' + msg, 'ok');
      });
    }

    // 翻译密钥（用户自带 key，仅存本机浏览器）
    refs.transAppid = $('trans-appid');
    refs.transKey = $('trans-key');
    refs.btnSaveTranslator = $('btn-save-translator');
    refs.btnTestTranslator = $('btn-test-translator');
    refs.transStatus = $('trans-status');
    // AI 配置（仅填 DeepSeek Key，接口地址/模型内置默认值，key 经 /api/ai 中转）
    refs.aiKey = $('ai-key');
    refs.btnSaveAi = $('btn-save-ai');
    refs.btnTestAi = $('btn-test-ai');
    refs.aiStatus = $('ai-status');
    // 即时翻译 / 查词记录
    refs.transInput = $('trans-input');
    refs.btnTranslate = $('btn-translate');
    refs.btnTranslateClear = $('btn-translate-clear');
    refs.transQueryStatus = $('trans-query-status');
    refs.transResult = $('trans-result');
    refs.wrongCount = $('wrong-count');
    refs.wrongList = $('wrong-list');
    refs.wrongAiSummary = $('wrong-ai-summary');
    refs.btnClearWrong = $('btn-clear-wrong');

    // 配置
    refs.majorSelect.addEventListener('change', function () { Store.setConfig({ major: refs.majorSelect.value }); update408TabVisibility(); renderTodayAggregate(); });
    refs.nicknameInput.addEventListener('change', function () { Store.setConfig({ nickname: refs.nicknameInput.value.trim() }); });
    refs.examDate.addEventListener('change', function () { Store.setConfig({ examDate: refs.examDate.value }); renderData(); });
    refs.targetTotal.addEventListener('change', function () { Store.setConfig({ targetTotal: Number(refs.targetTotal.value) || 0 }); renderData(); });
    refs.autoPlan.addEventListener('change', function () { Store.setConfig({ autoPlan: refs.autoPlan.checked }); renderPlan(); });

    // 得分权重配置（A4）
    refs.wDuration = $('w-duration'); refs.wDurationNum = $('w-duration-num');
    refs.wPlan = $('w-plan'); refs.wPlanNum = $('w-plan-num');
    refs.wVocab = $('w-vocab'); refs.wVocabNum = $('w-vocab-num');
    refs.wMistake = $('w-mistake'); refs.wMistakeNum = $('w-mistake-num');
    refs.weightTotal = $('weight-total');
    refs.btnResetWeights = $('btn-reset-weights');
    [[refs.wDuration, refs.wDurationNum], [refs.wPlan, refs.wPlanNum], [refs.wVocab, refs.wVocabNum], [refs.wMistake, refs.wMistakeNum]].forEach(function (pair) {
      var range = pair[0], num = pair[1];
      if (!range || !num) return;
      range.addEventListener('input', function () { num.value = range.value; onWeightChange(); });
      num.addEventListener('input', function () { range.value = num.value; });
      num.addEventListener('change', function () { range.value = num.value; onWeightChange(); });
    });
    if (refs.btnResetWeights) refs.btnResetWeights.addEventListener('click', function () {
      Store.setScoreWeights({ duration: 50, plan: 20, vocab: 15, mistake: 15 });
      renderScoreWeights(); renderData(); showToast('已恢复默认权重', 'ok');
    });

    // 记录
    refs.manualDate.addEventListener('change', renderManual);
    refs.btnSaveManual.addEventListener('click', onSaveManual);
    refs.btnResetDay.addEventListener('click', function () {
      var ds = refs.manualDate.value || Store.todayStr();
      confirmDelete('确定清空 ' + ds + ' 的学习记录？该日计时、学习内容、打卡信息都会被清空。', function () {
        Store.resetDay(ds); renderManual(); renderData(); renderToday();
        showToast('已清空 ' + ds + ' 学习记录', 'ok');
      });
    });
    refs.btnSaveExam.addEventListener('click', onSaveExam);

    // 计划
    refs.btnAutoPlan.addEventListener('click', function () {
      var ds = Store.todayStr();
      if ((Store.getPlan(ds) || []).length && !confirm('将覆盖今日已有计划，确定重新生成？')) return;
      autoGenPlan(ds); renderPlan(); renderToday(); showToast('已生成今日计划 ✅');
    });
    refs.btnAddPlan.addEventListener('click', function () {
      var text = refs.planText.value.trim(); var min = Number(refs.planMin.value) || 0;
      var subj = refs.planSubject ? refs.planSubject.value : '';
      if (!text) { alert('请输入计划内容'); return; }
      Store.addDailyPlanItem(Store.todayStr(), { text: text, minutes: min, done: false, subjectKey: subj || '' });
      refs.planText.value = ''; refs.planMin.value = '';
      if (refs.planSubject) refs.planSubject.value = '';
      renderPlan(); renderToday();
    });

    // 云同步（手机号账号：注册/登录合一）
    if (refs.btnSyncConfirm) refs.btnSyncConfirm.addEventListener('click', onSyncConfirm);
    if (refs.syncCode) refs.syncCode.addEventListener('change', function () { Store.setLastSyncCode((refs.syncCode.value || '').replace(/\D/g, '')); });
    // 自动同步（默认开启，确定后自动启动）
    loadAutoSyncPref();
    if (refs.btnStartTour) refs.btnStartTour.addEventListener('click', startTour);
    if (refs.btnRestartTour) refs.btnRestartTour.addEventListener('click', startTour);

    // 数据
    refs.heatPrev.addEventListener('click', function () { heatMonth--; if (heatMonth < 0) { heatMonth = 11; heatYear--; } renderData(); });
    refs.heatNext.addEventListener('click', function () { heatMonth++; if (heatMonth > 11) { heatMonth = 0; heatYear++; } renderData(); });
    refs.heatNow.addEventListener('click', function () { var n = new Date(); heatYear = n.getFullYear(); heatMonth = n.getMonth(); renderData(); });

    // 错题
    refs.btnAddMistake.addEventListener('click', function () {
      var content = refs.mistakeContent.value.trim();
      if (!content) { alert('请输入内容'); return; }
      var scope = refs.mistakeScope.value;
      if (scope === 'general') {
        Store.addMistake({ type: selectedType, content: content, subject: refs.mistakeSubject.value || '', note: refs.mistakeNote.value.trim(), date: Store.todayStr() });
      } else if (scope === 'math') {
        Store.addMathMistake({ category: refs.mistakeMathCat.value || '其他', content: content, note: refs.mistakeNote.value.trim() });
      } else {
        Store.add408Mistake({ category: refs.mistakeCs408Cat.value || '其他', content: content, note: refs.mistakeNote.value.trim() });
      }
      refs.mistakeContent.value = ''; refs.mistakeNote.value = ''; renderMistakeList(); showToast('已整理 ✅');
    });

    // 网站
    refs.btnAddSite.addEventListener('click', function () {
      var name = refs.siteName.value.trim(), url = refs.siteUrl.value.trim();
      if (!name || !url) { alert('请填写名称和网址'); return; }
      if (!/^https?:\/\//.test(url)) url = 'https://' + url;
      Store.addWebsite({ name: name, url: url, cat: '' });
      refs.siteName.value = ''; refs.siteUrl.value = ''; renderSites();
    });

    // 词汇：生词记录
    refs.btnRecordWord.addEventListener('click', onRecordWord);
    refs.btnClearWord.addEventListener('click', function () { refs.wordInput.value = ''; refs.wordResult.innerHTML = ''; refs.wordManual.style.display = 'none'; });
    refs.btnSaveManualWord.addEventListener('click', onSaveManualWord);

    // 翻译密钥
    refs.btnSaveTranslator.addEventListener('click', onSaveTranslator);
    refs.btnTestTranslator.addEventListener('click', onTestTranslator);
    refs.btnSaveAi.addEventListener('click', onSaveAi);
    refs.btnTestAi.addEventListener('click', onTestAi);
    // 即时翻译 / 查词记录
    refs.btnTranslate.addEventListener('click', onTranslate);
    refs.btnTranslateClear.addEventListener('click', function () { refs.transInput.value = ''; refs.transResult.innerHTML = ''; refs.transQueryStatus.textContent = ''; });
    // 番茄钟
    refs.btnPomoStart.addEventListener('click', startPomodoro);
    refs.btnPomoReset.addEventListener('click', resetPomodoro);
    refs.btnClearWrong.addEventListener('click', function () {
      if (!Store.getWrongWords().length) { showToast('查词记录已是空的', 'info'); return; }
      confirmDelete('确定清空查词记录？所有查词将被永久删除，无法恢复。', function () {
        Store.clearWrongWords(); renderWrongBook();
        showToast('已清空查词记录', 'ok');
      });
    });
    refs.btnAiSummarizeWrong = $('btn-ai-summarize-wrong');
    if (refs.btnAiSummarizeWrong) refs.btnAiSummarizeWrong.addEventListener('click', summarizeWrongBook);
    // 词汇：背单词 / 复习
    refs.btnPracticeRestart.addEventListener('click', startPractice);
    refs.btnReviewRestart.addEventListener('click', startReview);
    // 复习/自测 tab 内的子模式切换
    document.querySelectorAll('.mode-btn').forEach(function (b) {
      b.addEventListener('click', function () { setReviewMode(b.getAttribute('data-mode')); });
    });
    // 背单词设置面板
    function openPracticeSettings() {
      var ps = Store.getPracticeSettings();
      refs.psCount.value = ps.count;
      refs.psScope.value = ps.scope;
      refs.psMode.value = ps.mode;
      refs.psAutoSave.checked = ps.autoSave;
      refs.practiceSettings.hidden = false;
    }
    function closePracticeSettings() { refs.practiceSettings.hidden = true; }
    function savePracticeSettings() {
      var next = Store.setPracticeSettings({
        count: Number(refs.psCount.value) || 12,
        scope: refs.psScope.value,
        mode: refs.psMode.value,
        autoSave: refs.psAutoSave.checked
      });
      closePracticeSettings();
      if (typeof showToast === 'function') showToast('已保存练习设置：每批 ' + next.count + ' 词');
      startPractice();
    }
    refs.btnPracticeSettings.addEventListener('click', openPracticeSettings);
    refs.btnPsSave.addEventListener('click', savePracticeSettings);
    refs.btnPsClose.addEventListener('click', closePracticeSettings);
    // 移动端抽屉
    refs.navToggle.addEventListener('click', function () { document.body.classList.toggle('nav-open'); });
    refs.navBackdrop.addEventListener('click', function () { document.body.classList.remove('nav-open'); });

    // 备份
    refs.btnExport.addEventListener('click', function () {
      var blob = new Blob([Store.exportJSON()], { type: 'application/json' });
      var a = document.createElement('a'); a.download = '考研学习数据备份.json';
      a.href = URL.createObjectURL(blob); a.click();
    });
    refs.btnExportMd = $('btn-export-md');
    if (refs.btnExportMd) refs.btnExportMd.addEventListener('click', function () {
      var md = buildMarkdownReport();
      var blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
      var a = document.createElement('a');
      a.download = '考研学习报告_' + Store.todayStr() + '.md';
      a.href = URL.createObjectURL(blob); a.click();
      showToast('Markdown 报告已生成 📝');
    });
    refs.fileImport.addEventListener('change', function (e) {
      var f = e.target.files[0]; if (!f) return;
      var r = new FileReader();
      r.onload = function () { try { Store.importJSON(r.result); alert('导入成功'); renderAll(); } catch (err) { alert('导入失败：文件格式不正确'); } };
      r.readAsText(f);
    });
    refs.btnResetAll.addEventListener('click', function () {
      confirmDelete('确定清空全部本机数据？学习记录、计划、错题、词汇等会被永久删除（建议先导出备份）。', function () {
        confirmDelete('二次确认：即将永久删除所有数据，此操作无法撤销，确定继续？', function () {
          localStorage.removeItem('kaoyan_tracker_v1'); location.reload();
        }, 'warn');
      }, 'warn');
    });

    // 侧边栏折叠
    refs.navCollapse.addEventListener('click', onToggleSidebar);
    // 生词批量导入
    refs.btnImportWords.addEventListener('click', onImportWords);
    refs.importFile.addEventListener('change', onImportFile);
    // 长难句分析
    refs.btnAnalyze.addEventListener('click', onAnalyzeSentence);
    refs.btnClearSentence.addEventListener('click', function () { refs.sentenceInput.value = ''; refs.sentenceResult.innerHTML = ''; });
    // 高频词搜索
    refs.hfSearch.addEventListener('input', renderHfWords);
    // 今日总结：打卡 + 分享
    bindTap(refs.btnCheckinToday, doCheckin);
    refs.btnShareSummary.addEventListener('click', onShareToday);
    if (refs.btnAiSummary) refs.btnAiSummary.addEventListener('click', onAiSummary);
    if (refs.btnSaveSummary) refs.btnSaveSummary.addEventListener('click', onSaveSummary);

    // 学习计划：模块掌握
    refs.btnAddModule.addEventListener('click', function () {
      var name = refs.moduleName.value.trim();
      if (!name) { alert('请输入模块名'); return; }
      Store.addModule(name); refs.moduleName.value = ''; renderMastery();
    });
    // 学习计划：智能生成 + 手动添加
    refs.btnSmartPlan.addEventListener('click', onSmartPlan);
    if (refs.btnAiPlan) refs.btnAiPlan.addEventListener('click', onAiPlan);
    refs.btnAddPlanItem.addEventListener('click', function () {
      var text = refs.planItemText.value.trim();
      if (!text) { alert('请输入计划内容'); return; }
      Store.addPlanItem({ text: text, note: refs.planNote.value.trim(), done: false });
      refs.planItemText.value = ''; refs.planNote.value = ''; renderPlanItems();
    });
    // 错题本：范围切换显隐录入子面板
    refs.mistakeScope.addEventListener('change', function () {
      var v = refs.mistakeScope.value;
      refs.mistakeScopeGeneral.hidden = v !== 'general';
      refs.mistakeScopeMath.hidden = v !== 'math';
      refs.mistakeScopeCs408.hidden = v !== 'cs408';
    });
    // 错题本：速查卡抽取（按范围 Leitner 复习）
    refs.btnMistakeFlashStart.addEventListener('click', function () { startFlash(refs.mistakeFlashScope.value); });
    // 数学：分类刷题
    refs.btnMathPracticeStart.addEventListener('click', onMathPracticeStart);
    // 数学：自定义题库
    refs.btnAddMq.addEventListener('click', onAddMathQuestion);

    // 408 错题录入已合并进「错题本」tab（见 btn-add-mistake 的范围路由）
    // 408：分类刷题
    if (refs.btnCs408PracticeStart) refs.btnCs408PracticeStart.addEventListener('click', on408PracticeStart);
    // 408：自定义题库
    if (refs.btnAddCq) refs.btnAddCq.addEventListener('click', onAdd408Question);
    // 408：知识点
    if (refs.btnAddKp) refs.btnAddKp.addEventListener('click', onAdd408Knowledge);
    // 408：真题年份
    if (refs.btnAddYr) refs.btnAddYr.addEventListener('click', onAdd408Year);

    // 仅倒计时开关
    if (refs.pomoCountdownOnly) refs.pomoCountdownOnly.addEventListener('change', function () { applyCountdownOnlyUI(); readPomoCountdownOnly(); renderPomodoro(); });
    // 主题切换
    if (refs.themeToggle) refs.themeToggle.addEventListener('click', toggleTheme);
    if (refs.btnHelp) refs.btnHelp.addEventListener('click', function () { switchTab('manual'); });

    refs.manualDate.value = Store.todayStr();
    refs.examDate2.value = Store.todayStr();

    // 自动计划：启用且今日无计划则生成
    if (Store.getConfig().autoPlan) { var ds = Store.todayStr(); if (!Store.getPlan(ds)) autoGenPlan(ds); }

    // 数学章节预填充（仅首次，按当前卷种模板）
    if (!Store.getMathChapters().length) Store.setMathChapters(Store.getMathVolumeTemplates()[Store.getMathVolume()].slice());
    // 数学错题分类下拉（三套合并后录入时复用）
    refs.mistakeMathCat.innerHTML = '';
    MATH_MISTAKE_CATS.forEach(function (c) { var o = el('option'); o.value = c; o.textContent = c; refs.mistakeMathCat.appendChild(o); });

    // 408 章节预填充（仅首次）
    if (!Store.get408Chapters().length) Store.set408Chapters(CS408_CHAPTERS_PREFILL.slice());
    // 408 错题分类下拉（三套合并后录入时复用）
    refs.mistakeCs408Cat.innerHTML = '';
    CS408_MISTAKE_CATS.forEach(function (c) { var o = el('option'); o.value = c; o.textContent = c; refs.mistakeCs408Cat.appendChild(o); });

    // 主题初始化 + 键盘快捷键 + 今日聚合
    applyTheme();
    initKeyboardShortcuts();

    initTabs();
    renderAll();
    applySidebar();
    renderTodayAggregate();
    renderCheckinCard();

    // 暴露给 onboarding 步骤按钮跳转使用
    window.__switchTab = switchTab;
    // 暴露 XSS 防护助手给回归测试（test_mount_safe.js），不影响业务
    window.__xss = { el: el, setText: setText, mountSafe: mountSafe };
    // B1 测试钩子（仅供 test_sync_phone.js 验证并发/本地保护逻辑，不影响生产行为）
    window.__syncDebug = {
      doAutoPullCheck: doAutoPullCheck,
      doAutoPush: doAutoPush,
      state: function () { return { lastPushAt: lastPushAt, lastLocalEditAt: lastLocalEditAt, lastSyncVersion: lastSyncVersion }; },
      setLocalEditAt: function (t) { lastLocalEditAt = t; },
      setPushAt: function (t) { lastPushAt = t; },
      setSyncVersion: function (v) { lastSyncVersion = v; }
    };
    // 回到顶部按钮
    initBackTop();

    // 云同步自动推送钩子 + 自动同步偏好恢复（需在 init 末尾、refs 就绪后）
    Store.setOnSave(function () { scheduleAutoPush(); checkMilestones(); });
    loadAutoSyncPref();

    // 每日打卡与连续学习提醒
    if (!Store.isCheckedIn(Store.todayStr()) && Store.totalMinutesForDay(Store.getDay(Store.todayStr()) || {}) === 0) {
      showToast('今天还没打卡，去学习一会儿吧 🔥');
    }

    // 新手完整引导：首次访问自动弹出，过一遍所有功能；之后仅在「说明书」点「重看」时触发
    try {
      if (!localStorage.getItem('kaoyan_tour_done')) setTimeout(startTour, 700);
    } catch (e) {}

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && Store.getTimer().running) {
        var node = document.getElementById('t-time-' + Store.getTimer().subjectKey);
        if (node) node.textContent = fmt(currentElapsed());
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();