/* app.js — 主逻辑：配置 / 按模块计时 / 计划 / 今日总结分享 / 数据 / 错题 / 网站 */
(function () {
  'use strict';

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
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
  var LEITNER = [1, 2, 4, 7, 15]; // box 1..5 -> 间隔天数
  function escapeHtml(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]); }); }
  function shuffle(a){ for(var i=a.length-1;i>0;i--){ var j=Math.floor(Math.random()*(i+1)); var t=a[i];a[i]=a[j];a[j]=t; } return a; }
  function nextReviewDate(box){ var days = LEITNER[Math.max(0, Math.min(4, (box||1)-1))]; return Store.dateStr(Store.addDays(new Date(), days)); }

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
    { key: 'major', label: '专业课', defName: '专业课', defTarget: 120, editableName: true }
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
      var has = Store.getSubjects().some(function (s) { return s.key === p.key; });
      var row = el('label', 'toggle-row');
      var cb = el('input'); cb.type = 'checkbox'; cb.checked = has;
      cb.addEventListener('change', function () { onToggleSubject(p, cb.checked); });
      row.appendChild(cb);
      row.appendChild(el('span', 'toggle-label', p.label));
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
      refs.toggles.appendChild(row);
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
    Store.saveDayMeta(ds, { completed: refs.manualCompleted.value, summary: refs.manualSummary.value, note: refs.manualNote.value });
    showToast('已保存 ' + ds + ' 的学习记录 ✅');
    renderManual(); renderData(); renderToday();
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
      del.addEventListener('click', function () { if (confirm('确定删除该次模考？')) { Store.removeExam(ex.id); renderExamList(); renderData(); } });
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
    refs.planHint.textContent = Store.getConfig().autoPlan
      ? '已启用自动计划：每天打开会自动生成。'
      : '未启用自动计划，可点「自动制定计划」生成。';
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
        if (!wasDone) showToast('🌟 完成 1 项，继续加油！');
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
    if (!refs.todayGuide) return;
    var cfg = Store.getConfig();
    refs.todayGuide.textContent = cfg.examDate ? '' : '请先在「配置」页填写考研日期与目标分。';
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
    try {
      var canvas = buildShareCanvas(Store.todayStr());
      var dataUrl = canvas.toDataURL('image/png');
      var link = document.createElement('a');
      link.download = '考研打卡_' + Store.todayStr() + '.png';
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      canvas.toBlob(function (blob) {
        try {
          var f = new File([blob], '考研打卡.png', { type: 'image/png' });
          if (navigator.canShare && navigator.canShare({ files: [f] })) {
            navigator.share({ files: [f], title: '考研学习打卡', text: '今日学习打卡' }).catch(function () {});
          }
        } catch (e) {}
      });
    } catch (e) {
      alert('分享生成失败：' + e.message);
    }
  }

  function onInvite() {
    var cfg = Store.getConfig();
    var streak = Store.consecutiveStreak();
    var nick = cfg.nickname || '我';
    var url = window.location.origin;
    var msg = '我正在用「考研学习Hub」记录每天的复习进度';
    if (streak > 0) msg += '，已连续打卡 ' + streak + ' 天';
    msg += '！\n\n背单词、刷题、计时、学习计划、番茄钟全都有，还能跨设备云同步，手机电脑数据一样。\n\n一起来打卡吧 👉 ' + url;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(msg).then(function () {
          alert('邀请文案已复制到剪贴板！\n\n直接粘贴到微信群/QQ群即可，朋友们点链接就能用。');
        }).catch(function () {
          fallbackCopy(msg);
        });
      } else {
        fallbackCopy(msg);
      }
    } catch (e) {
      fallbackCopy(msg);
    }
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      alert('邀请文案已复制到剪贴板！\n\n直接粘贴到微信群/QQ群即可，朋友们点链接就能用。');
    } catch (e) {
      prompt('复制失败，请手动选中以下文字复制：', text);
    }
    document.body.removeChild(ta);
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
    Charts.renderMonthHeatmap(refs.heatmap, heatYear, heatMonth, Store.getDays());
    refs.heatLabel.textContent = heatYear + '年' + (heatMonth + 1) + '月';
    Charts.renderTrend(refs.trend, Store.getExams(), Number(cfg.targetTotal) || 0);
    renderSubjectStats();
  }
  function renderGoalProgress() {
    refs.goalProgress.innerHTML = '';
    var subs = Store.getSubjects();
    var exams = Store.getExams();
    if (!subs.length) { refs.goalProgress.appendChild(el('div', 'empty-hint', '请先配置考试科目与目标分')); return; }
    function latestScore(key) {
      for (var i = exams.length - 1; i >= 0; i--) { if (exams[i].scores && exams[i].scores[key] !== undefined) return exams[i].scores[key]; }
      return null;
    }
    var totalCur = 0;
    subs.forEach(function (s) {
      var cur = latestScore(s.key);
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
    refs.subjectStats.innerHTML = '';
    var subs = Store.getSubjects();
    var days = Store.getDays();
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
  function renderMistakeList() {
    refs.mistakeList.innerHTML = '';
    var list = Store.getMistakes();
    if (!list.length) { refs.mistakeList.appendChild(el('div', 'empty-hint', '还没有整理内容')); return; }
    list.forEach(function (m) {
      var item = el('div', 'mistake-item');
      var top = el('div', 'mistake-top');
      top.appendChild(el('span', 'mistake-badge', m.type));
      var del = el('button', 'plan-del', '删除');
      del.addEventListener('click', function () { Store.removeMistake(m.id); renderMistakeList(); });
      top.appendChild(del);
      item.appendChild(top);
      item.appendChild(el('div', 'mistake-content', m.content));
      var meta = [];
      if (m.subject) meta.push(m.subject);
      meta.push(m.date);
      if (m.note) meta.push('备注：' + m.note);
      item.appendChild(el('div', 'mistake-meta', meta.join(' · ')));
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
  function onAnalyzeSentence() {
    var text = refs.sentenceInput.value.trim();
    if (!text) { alert('请粘贴一句长难句'); return; }
    renderSentenceResult(window.SentenceAnalyzer.analyze(text));
  }
  function renderSentenceResult(r) {
    var box = refs.sentenceResult; box.innerHTML = '';
    if (!r.clauses.length) { box.appendChild(el('div', 'empty-hint', '没有可分析的内容')); return; }
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
  }

  /* ============ 今日学习总结（独立模块）+ 提醒推送 ============ */
  function switchTab(target) { var btn = document.querySelector('.tab-btn[data-tab="' + target + '"]'); if (btn) btn.click(); }
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
  function reminderCard(title, text, actionLabel, actionFn) {
    var c = el('div', 'reminder');
    c.appendChild(el('div', 'reminder-title', title));
    c.appendChild(el('div', 'reminder-text', text));
    if (actionLabel) { var b = el('button', 'btn btn-ghost reminder-btn', actionLabel); b.addEventListener('click', actionFn); c.appendChild(b); }
    return c;
  }
  function computeWeakness() {
    var subs = Store.getSubjects(); if (!subs.length) return null;
    var days = Store.getDays();
    var cutoff = Store.dateStr(Store.addDays(new Date(), -6));
    var arr = subs.map(function (s) {
      var sum = 0; Object.keys(days).forEach(function (k) { if (k >= cutoff) { var d = days[k]; if (d && d.durations && d.durations[s.key]) sum += d.durations[s.key]; } });
      return { name: s.name, recent: sum };
    });
    arr.sort(function (a, b) { return a.recent - b.recent; });
    return { name: arr[0].name };
  }
  function renderReminders() {
    var box = refs.summaryReminders; box.innerHTML = '';
    var ds = Store.todayStr();
    var cfg = Store.getConfig();
    var day = Store.getDay(ds) || {};
    if (!Store.isCheckedIn(ds) && Store.totalMinutesForDay(day) === 0) {
      box.appendChild(reminderCard('📅 打卡提醒', '今天还没有学习记录，去「记录」里计时或手动记录一下，保持连续学习 🔥', '去记录', function () { switchTab('record'); }));
    } else {
      box.appendChild(reminderCard('🔥 连续学习', '已连续打卡 ' + Store.consecutiveStreak() + ' 天，继续保持！💪', null, null));
    }
    var due = Store.getDueVocab(ds).length;
    if (due > 0) box.appendChild(reminderCard('🧠 生词复习（遗忘曲线）', '你有 ' + due + ' 个生词今天该复习了，及时复习才能记住。', '去复习', function () { switchTab('review'); }));
    else box.appendChild(reminderCard('🧠 生词复习（遗忘曲线）', '今天没有待复习的生词，保持得不错 👍', null, null));
    var weak = computeWeakness();
    if (weak) box.appendChild(reminderCard('🎯 薄弱项智能推送', '检测到「' + weak.name + '」近期投入较少，今天建议重点复习它。', '去计时', function () { switchTab('record'); }));
    if (cfg.examDate) {
      var diff = Math.ceil((new Date(cfg.examDate + 'T00:00:00') - new Date(ds + 'T00:00:00')) / 86400000);
      if (diff >= 0) box.appendChild(reminderCard('⏳ 考研倒计时', '距离考研还有 ' + diff + ' 天，合理分配各科时间，冲！', null, null));
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
    var checkedIn = Store.isCheckedIn(ds);
    refs.btnCheckin.textContent = checkedIn ? '✅ 今日已打卡' : '✅ 今日打卡';
    refs.btnCheckin.disabled = checkedIn;
    renderReminders();
  }
  function onCheckin() { Store.checkin(Store.todayStr()); showToast('已打卡 ' + Store.todayStr() + ' ✅'); renderSummary(); }

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
  function renderChapterBlock(key, mount) {
    var subjectName, chapters, current;
    if (key === 'math') { subjectName = '数学'; chapters = Store.getMathChapters(); current = Store.getMathCurrent(); }
    else if (key === 'cs408') { subjectName = '408 计算机专业基础'; chapters = Store.get408Chapters(); current = Store.get408Current(); }
    else {
      var obj = Store.getSubjectChapters(key) || { chapters: [], current: -1 };
      var s = Store.getSubjects().filter(function (x) { return x.key === key; })[0];
      subjectName = s ? s.name : key;
      chapters = obj.chapters || []; current = (typeof obj.current === 'number' ? obj.current : -1);
    }
    mount.innerHTML = '';
    var block = el('div', 'chapter-block');
    var head = el('div', 'chapter-head');
    head.appendChild(el('span', 'chapter-subject', subjectName));
    block.appendChild(head);

    var total = chapters.length;
    var done = current < 0 ? 0 : current + 1;
    var pct = total ? Math.round(done / total * 100) : 0;
    var barWrap = el('div', 'chapter-bar');
    var fill = el('div', 'chapter-fill'); fill.style.width = pct + '%';
    if (current < 0) fill.style.background = '#9ca3af';
    barWrap.appendChild(fill);
    block.appendChild(barWrap);
    var prog = el('div', 'chapter-prog');
    prog.textContent = total ? ('进度 ' + done + ' / ' + total + '（' + pct + '%）' + (current < 0 ? ' · 未开始' : ' · 当前：' + parseChapter(chapters[current]).n))
      : '暂无章节，可在下方添加';
    block.appendChild(prog);

    if (total) {
      var list = el('div', 'chapter-list');
      chapters.forEach(function (ch, idx) {
        var p = parseChapter(ch);
        var cls = 'chapter-item';
        if (idx === current) cls += ' current';
        else if (current >= 0 && idx < current) cls += ' done';
        var item = el('button', cls);
        item.style.borderLeftColor = (key === 'cs408' ? (CS408_GROUP_COLORS[p.g] || '#9ca3af') : (GROUP_COLORS[p.g] || '#9ca3af'));
        item.appendChild(el('span', 'chapter-idx', String(idx + 1)));
        item.appendChild(el('span', 'chapter-name', (p.g !== '其他' ? '【' + p.g + '】' : '') + p.n));
        item.addEventListener('click', function () {
          if (key === 'math') Store.setMathCurrent(idx);
          else if (key === 'cs408') Store.set408Current(idx);
          else Store.setSubjectChapters(key, { chapters: chapters, current: idx });
          renderChapterBlock(key, mount);
          if (key === 'math') { var mt = document.getElementById('math-chapters'); if (mt) renderChapterBlock('math', mt); }
          if (key === 'cs408') { var ct = document.getElementById('cs408-chapters'); if (ct) renderChapterBlock('cs408', ct); }
        });
        list.appendChild(item);
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
      else if (key === 'cs408') Store.set408Chapters(newChapters);
      else Store.setSubjectChapters(key, { chapters: newChapters, current: current });
      renderChapterBlock(key, mount);
    });
    addRow.appendChild(inp); addRow.appendChild(btn);
    block.appendChild(addRow);
    mount.appendChild(block);
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
      var ch = (s.key === 'math') ? { chapters: Store.getMathChapters(), current: Store.getMathCurrent() } : (Store.getSubjectChapters(s.key) || {});
      if (ch && ch.chapters && ch.chapters.length) {
        if (ch.current < 0) items.push({ text: '开始《' + s.name + '》第一章：' + parseChapter(ch.chapters[0]).n, note: '尚未标记进度' });
        else if (ch.current < ch.chapters.length - 1) items.push({ text: '继续《' + s.name + '》：' + parseChapter(ch.chapters[ch.current + 1]).n, note: '当前在第 ' + (ch.current + 1) + '/' + ch.chapters.length + ' 章' });
        else items.push({ text: '复习《' + s.name + '》已学章节', note: '已学完全部 ' + ch.chapters.length + ' 章，建议进入刷题巩固' });
      }
    });
    // 408 章节进度纳入智能计划
    var cs408Ch = Store.get408Chapters();
    if (cs408Ch.length) {
      var cs408Cur = Store.get408Current();
      if (cs408Cur < 0) items.push({ text: '开始《408》第一章：' + parseChapter(cs408Ch[0]).n, note: '408 尚未标记进度' });
      else if (cs408Cur < cs408Ch.length - 1) items.push({ text: '继续《408》：' + parseChapter(cs408Ch[cs408Cur + 1]).n, note: '408 当前在第 ' + (cs408Cur + 1) + '/' + cs408Ch.length + ' 章' });
      else items.push({ text: '复习《408》已学章节', note: '408 已学完全部 ' + cs408Ch.length + ' 章，建议进入真题巩固' });
    }
    if (!items.length) { showToast('暂无进度数据，先填写模块掌握情况或章节进度吧'); return; }
    items.forEach(function (it) { Store.addPlanItem({ text: it.text, note: it.note || '', done: false }); });
    renderPlanItems(); showToast('已按进度生成 ' + items.length + ' 项计划 ⚡');
  }

  /* ============ 数学模块：章节 + 错题 + 分类刷题 ============ */
  var mathMistakeFilter = '全部';
  var mathPractice = null;

  function renderMathChapters() {
    var box = refs.mathChapters;
    if (!Store.getMathChapters().length) Store.setMathChapters(MATH_CHAPTERS_PREFILL.slice());
    renderChapterBlock('math', box);
  }

  function renderMathMistakes() {
    var box = refs.mathMistakeList; box.innerHTML = '';
    var all = Store.getMathMistakes();
    var list = mathMistakeFilter === '全部' ? all : all.filter(function (m) { return m.category === mathMistakeFilter; });
    // 分类筛选 chips
    var cats = { '全部': all.length };
    all.forEach(function (m) { cats[m.category] = (cats[m.category] || 0) + 1; });
    refs.mathMistakeFilter.innerHTML = '';
    Object.keys(cats).forEach(function (c) {
      var chip = el('div', 'chip' + (c === mathMistakeFilter ? ' active' : ''), c + ' (' + cats[c] + ')');
      chip.addEventListener('click', function () { mathMistakeFilter = c; renderMathMistakes(); });
      refs.mathMistakeFilter.appendChild(chip);
    });
    if (!list.length) { box.appendChild(el('div', 'empty-hint', '还没有错题记录')); return; }
    list.forEach(function (m) {
      var item = el('div', 'mistake-item' + (m.reviewed ? ' reviewed' : ''));
      var top = el('div', 'mistake-top');
      top.appendChild(el('span', 'mistake-badge', m.category || '其他'));
      var del = el('button', 'plan-del', '删除');
      del.addEventListener('click', function () { Store.removeMathMistake(m.id); renderMathMistakes(); });
      top.appendChild(del);
      item.appendChild(top);
      item.appendChild(el('div', 'mistake-content', m.content || ''));
      var meta = [];
      if (m.created) meta.push(m.created);
      if (m.note) meta.push('备注：' + m.note);
      if (m.reviewed) meta.push('已回顾');
      item.appendChild(el('div', 'mistake-meta', meta.join(' · ')));
      var rev = el('button', 'btn btn-ghost mistake-review', m.reviewed ? '↺ 取消回顾' : '✓ 标记已回顾');
      rev.addEventListener('click', function () { Store.updateMathMistake(m.id, { reviewed: !m.reviewed }); renderMathMistakes(); });
      item.appendChild(rev);
      box.appendChild(item);
    });
  }

  function onAddMathMistake() {
    var content = refs.mathMistakeContent.value.trim();
    if (!content) { alert('请输入错题 / 错因'); return; }
    Store.addMathMistake({
      category: refs.mathMistakeCat.value || '其他',
      content: content,
      note: refs.mathMistakeNote.value.trim(),
      created: Store.todayStr(),
      reviewed: false
    });
    refs.mathMistakeContent.value = ''; refs.mathMistakeNote.value = '';
    mathMistakeFilter = '全部'; renderMathMistakes(); showToast('已保存错题 ✅');
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
    cur.options.forEach(function (o, i) {
      html += '<button class="practice-opt" data-i="' + i + '">' + escapeHtml(o) + '</button>';
    });
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
        else { btn.classList.add('wrong'); fb.textContent = '❌ 正确答案：' + cur.options[cur.answer]; fb.style.color = '#dc2626'; }
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

  /* ============ 408 专业课模块：章节 + 错题(间隔复习) + 刷题 + 知识点 + 真题 ============ */
  var cs408MistakeFilter = '全部';
  var cs408Practice = null;
  var kpFilter = '全部';

  function render408Chapters() {
    var box = refs.cs408Chapters;
    if (!Store.get408Chapters().length) Store.set408Chapters(CS408_CHAPTERS_PREFILL.slice());
    renderChapterBlock('cs408', box);
  }

  function render408Mistakes() {
    var box = refs.cs408MistakeList; box.innerHTML = '';
    var all = Store.get408Mistakes();
    var today = Store.todayStr();
    var list = cs408MistakeFilter === '全部' ? all : all.filter(function (m) { return m.category === cs408MistakeFilter; });
    // 分类筛选 chips
    var cats = { '全部': all.length };
    all.forEach(function (m) { cats[m.category] = (cats[m.category] || 0) + 1; });
    refs.cs408MistakeFilter.innerHTML = '';
    Object.keys(cats).forEach(function (c) {
      var chip = el('div', 'chip' + (c === cs408MistakeFilter ? ' active' : ''), c + ' (' + cats[c] + ')');
      chip.addEventListener('click', function () { cs408MistakeFilter = c; render408Mistakes(); });
      refs.cs408MistakeFilter.appendChild(chip);
    });
    // 到期复习徽标
    var dueCount = Store.get408DueMistakes(today).length;
    if (refs.cs408DueBadge) {
      if (dueCount > 0) { refs.cs408DueBadge.style.display = ''; refs.cs408DueBadge.textContent = dueCount + ' 题待复习'; }
      else refs.cs408DueBadge.style.display = 'none';
    }
    if (!list.length) { box.appendChild(el('div', 'empty-hint', '还没有错题记录')); return; }
    list.forEach(function (m) {
      var isDue = !m.reviewed || (m.nextReview && m.nextReview <= today);
      var item = el('div', 'mistake-item' + (m.reviewed ? ' reviewed' : '') + (isDue ? ' due' : ''));
      var top = el('div', 'mistake-top');
      top.appendChild(el('span', 'mistake-badge', m.category || '其他'));
      if (isDue) top.appendChild(el('span', 'due-tag', '待复习'));
      var del = el('button', 'plan-del', '删除');
      del.addEventListener('click', function () { Store.remove408Mistake(m.id); render408Mistakes(); });
      top.appendChild(del);
      item.appendChild(top);
      item.appendChild(el('div', 'mistake-content', m.content || ''));
      var meta = [];
      if (m.created) meta.push(m.created);
      if (m.note) meta.push('备注：' + m.note);
      if (m.reviewCount) meta.push('已回顾 ' + m.reviewCount + ' 次');
      if (m.nextReview) meta.push('下次复习：' + m.nextReview);
      item.appendChild(el('div', 'mistake-meta', meta.join(' · ')));
      var rev = el('button', 'btn btn-ghost mistake-review', m.reviewed ? '✓ 已回顾（再次复习）' : '✓ 标记已回顾');
      rev.addEventListener('click', function () { Store.update408Mistake(m.id, { reviewed: true }); render408Mistakes(); showToast('已标记回顾，下次复习：' + Store.get408Mistakes().filter(function(x){return x.id===m.id;})[0].nextReview); });
      item.appendChild(rev);
      box.appendChild(item);
    });
  }

  function onAdd408Mistake() {
    var content = refs.cs408MistakeContent.value.trim();
    if (!content) { alert('请输入错题 / 错因'); return; }
    Store.add408Mistake({
      category: refs.cs408MistakeCat.value || '其他',
      content: content,
      note: refs.cs408MistakeNote.value.trim(),
      created: Store.todayStr()
    });
    refs.cs408MistakeContent.value = ''; refs.cs408MistakeNote.value = '';
    cs408MistakeFilter = '全部'; render408Mistakes(); showToast('已保存错题 ✅');
  }

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
    cur.options.forEach(function (o, i) {
      html += '<button class="practice-opt" data-i="' + i + '">' + escapeHtml(o) + '</button>';
    });
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
        else { btn.classList.add('wrong'); fb.textContent = '❌ 正确答案：' + cur.options[cur.answer]; fb.style.color = '#dc2626'; }
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
    var major = Store.getConfig().major || '';
    var is408 = major.indexOf('408') >= 0;
    var btn = document.querySelector('.tab-btn[data-tab="cs408"]');
    var panel = document.getElementById('tab-cs408');
    if (btn) btn.classList.toggle('nav-hidden', !is408);
    if (panel) panel.classList.toggle('nav-hidden', !is408);
    if (!is408) {
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
      refs.transQueryStatus.textContent = '✓ 已翻译并自动归档到错词本';
      refs.transResult.innerHTML = '<div class="word-card"><div class="w-en">' + escapeHtml(res.src || word) + '</div><div class="w-cn">' + escapeHtml(res.dst) + ' · 已存入错词本</div></div>';
      renderWrongBook();
    });
  }
  function renderWrongBook() {
    var list = Store.getWrongWords();
    refs.wrongCount.textContent = list.length;
    refs.wrongList.innerHTML = '';
    if (!list.length) { refs.wrongList.appendChild(el('div', 'empty-hint', '错词本还是空的，去上方「翻译并归档」试试')); return; }
    list.forEach(function (w) {
      var item = el('div', 'mistake-item');
      var top = el('div', 'mistake-top');
      var toVocab = el('button', 'plan-del vocab-move', '移入生词本');
      toVocab.addEventListener('click', function () { Store.addVocab(w.word, w.cn); renderWords(); showToast('已移入生词本 ✅'); });
      var del = el('button', 'plan-del', '删除');
      del.addEventListener('click', function () { Store.removeWrongWord(w.id); renderWrongBook(); showToast('已从错词本删除'); });
      top.appendChild(toVocab); top.appendChild(del);
      item.appendChild(top);
      item.appendChild(el('div', 'mistake-content', w.word + (w.cn ? '　' + w.cn : '')));
      item.appendChild(el('div', 'mistake-meta', '归档于 ' + w.created + (w.src === 'translate' ? ' · 翻译查询' : '')));
      refs.wrongList.appendChild(item);
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

  /* ============ 番茄钟（可自定义时长） + 自定义倒计时 ============ */
  var pomodoro = { running: false, mode: 'study', remain: 25 * 60, total: 25 * 60, workMin: 25, breakMin: 5, timer: null };
  var customTimer = { running: false, remain: 25 * 60, total: 25 * 60, timer: null, done: false };
  function fmtPomo(sec) { var m = Math.floor(sec / 60), s = sec % 60; return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s; }
  function renderPomodoro() {
    if (!refs.pomoTime) return;
    refs.pomoTime.textContent = fmtPomo(pomodoro.remain);
    refs.pomoMode.textContent = pomodoro.mode === 'study' ? '🍅 学习中' : '☕ 休息中';
    refs.btnPomoStart.textContent = pomodoro.running ? '暂停' : (pomodoro.remain < pomodoro.total ? '继续' : '开始');
    refs.btnPomoReset.disabled = !pomodoro.running && pomodoro.remain === pomodoro.total;
    var disp = refs.pomoTime ? refs.pomoTime.parentElement : null;
    if (disp) { disp.classList.toggle('break', pomodoro.mode !== 'study'); disp.classList.remove('done'); }
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
  function tickPomodoro() {
    pomodoro.remain--;
    if (pomodoro.remain <= 0) {
      if (pomodoro.mode === 'study') {
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
    readPomoTimes();
    // 如果是初始状态，按自定义时长重置
    if (pomodoro.remain === pomodoro.total && pomodoro.mode === 'study') { pomodoro.total = pomodoro.workMin * 60; pomodoro.remain = pomodoro.workMin * 60; }
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') { try { Notification.requestPermission().catch(function () {}); } catch (e) {} }
    pomodoro.running = true;
    pomodoro.timer = setInterval(tickPomodoro, 1000);
    renderPomodoro();
  }
  function resetPomodoro() {
    pomodoro.running = false; if (pomodoro.timer) clearInterval(pomodoro.timer);
    readPomoTimes();
    pomodoro.mode = 'study'; pomodoro.total = pomodoro.workMin * 60; pomodoro.remain = pomodoro.workMin * 60; renderPomodoro();
  }

  // 自定义倒计时
  function renderCustomTimer() {
    if (!refs.timerCustomTime) return;
    refs.timerCustomTime.textContent = fmtPomo(customTimer.remain);
    refs.timerCustomMode.textContent = customTimer.done ? '✅ 已完成' : '⏲ 倒计时';
    refs.btnTimerCustomStart.textContent = customTimer.running ? '暂停' : (customTimer.remain < customTimer.total ? '继续' : '开始');
    refs.btnTimerCustomReset.disabled = !customTimer.running && customTimer.remain === customTimer.total;
    var disp = refs.timerCustomTime ? refs.timerCustomTime.parentElement : null;
    if (disp) { disp.classList.toggle('done', !!customTimer.done); disp.classList.remove('break'); }
  }
  function tickCustomTimer() {
    customTimer.remain--;
    if (customTimer.remain <= 0) {
      customTimer.remain = 0;
      customTimer.running = false; if (customTimer.timer) clearInterval(customTimer.timer);
      customTimer.done = true;
      notifyPomodoro('⏲ 倒计时结束！时间到 ⏰');
    }
    renderCustomTimer();
  }
  function startCustomTimer() {
    if (customTimer.running) { customTimer.running = false; if (customTimer.timer) clearInterval(customTimer.timer); renderCustomTimer(); return; }
    if (customTimer.done || customTimer.remain === customTimer.total) {
      var m = Number(refs.timerCustomMin && refs.timerCustomMin.value) || 25;
      var s = Number(refs.timerCustomSec && refs.timerCustomSec.value) || 0;
      var total = Math.max(1, m * 60 + s);
      customTimer.total = total; customTimer.remain = total; customTimer.done = false;
    }
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') { try { Notification.requestPermission().catch(function () {}); } catch (e) {} }
    customTimer.running = true;
    customTimer.timer = setInterval(tickCustomTimer, 1000);
    renderCustomTimer();
  }
  function resetCustomTimer() {
    customTimer.running = false; if (customTimer.timer) clearInterval(customTimer.timer);
    var m = Number(refs.timerCustomMin && refs.timerCustomMin.value) || 25;
    var s = Number(refs.timerCustomSec && refs.timerCustomSec.value) || 0;
    var total = Math.max(1, m * 60 + s);
    customTimer.total = total; customTimer.remain = total; customTimer.done = false; renderCustomTimer();
  }

  function startPractice() {
    if (!DICT.length) { refs.practiceBox.innerHTML = '<div class="empty-hint">词库为空</div>'; return; }
    var pool = DICT.slice();
    shuffle(pool);
    practiceSession = { items: pool.slice(0, Math.min(12, pool.length)), index: 0, answered: false };
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
    var opts = [cur.c];
    var others = DICT.filter(function (d) { return d.w !== cur.w && d.c !== cur.c; });
    shuffle(others);
    for (var i = 0; i < 3 && i < others.length; i++) opts.push(others[i].c);
    shuffle(opts);
    var html = '<div class="practice-en">' + escapeHtml(cur.w) + '</div>';
    html += '<div class="practice-progress">第 ' + (s.index + 1) + ' / ' + s.items.length + ' 个</div>';
    html += '<div class="practice-options">';
    opts.forEach(function (o) {
      html += '<button class="practice-opt" data-correct="' + (o === cur.c) + '">' + escapeHtml(o) + '</button>';
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
        else { btn.classList.add('wrong'); fb.textContent = '❌ 正确答案：' + cur.c; fb.style.color = '#dc2626'; }
        addNextButton();
      });
    });
    $('practice-dontknow').addEventListener('click', function () {
      if (s.answered) return;
      s.answered = true;
      Store.addVocab(cur.w, cur.c);
      refs.practiceBox.querySelectorAll('.practice-opt').forEach(function (b) {
        b.disabled = true;
        if (b.getAttribute('data-correct') === 'true') b.classList.add('correct');
      });
      fb.textContent = '已收入生词本，正确答案：' + cur.c;
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
  function showToast(msg) {
    var t = refs.toast; t.textContent = msg; t.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 1800);
  }
  /* ============ 今日聚合 + 主题 + 键盘快捷键 ============ */
  function renderTodayAggregate() {
    if (!refs.aggCountdown) return;
    // 倒计时
    var examDate = Store.getConfig().examDate;
    if (examDate) {
      var diff = Math.ceil((new Date(examDate) - new Date(Store.todayStr())) / 86400000);
      refs.aggCountdown.textContent = diff > 0 ? diff : (diff === 0 ? '今天' : '已过');
    } else { refs.aggCountdown.textContent = '未设置'; }
    // 今日学习时长
    var today = Store.getDay(Store.todayStr()) || {};
    refs.aggMinutes.textContent = Store.totalMinutesForDay(today);
    // 计划完成
    var plan = Store.getPlan(Store.todayStr()) || [];
    var done = plan.filter(function (p) { return p.done; }).length;
    refs.aggPlan.textContent = done + '/' + plan.length;
    // 连续打卡
    refs.aggStreak.textContent = Store.consecutiveStreak();
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
    });
  }

  /* ---------------- 云端同步（登录码） ---------------- */
  function renderSyncConfig() {
    if (!refs.syncToken || !refs.syncCode) return;
    refs.syncToken.value = Store.getLastSyncToken();
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
  function syncApi(method, payload) {
    var token = (refs.syncToken ? refs.syncToken.value : '') || '';
    var code = (refs.syncCode ? refs.syncCode.value.trim().toUpperCase() : '') || '';
    if (!code) { syncSetStatus('请先输入或生成登录码', 'error'); return Promise.reject(new Error('no sync code')); }
    var headers = { 'X-Sync-Key': code };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    var opts = { method: method, headers: headers };
    // GET / HEAD / DELETE 不能带 body（浏览器原生限制），登录码已在 X-Sync-Key header 中
    if (method === 'PUT' || method === 'POST') {
      headers['Content-Type'] = 'application/json';
      var body = { syncCode: code, deviceId: Store.getLastDeviceId() };
      if (payload !== undefined) body.data = payload;
      opts.body = JSON.stringify(body);
    }
    return fetch('/api/sync', opts).then(function (r) { return r.json().then(function (j) { return [r, j]; }); }).then(function (arr) {
      var resp = arr[0], j = arr[1];
      if (!resp.ok) throw new Error(j && j.error ? j.error : ('HTTP ' + resp.status));
      return j;
    });
  }
  function onSyncUpload() {
    var code = (refs.syncCode ? refs.syncCode.value.trim().toUpperCase() : '') || '';
    if (!code) { syncSetStatus('请先输入或生成登录码', 'error'); return; }
    if (!confirm('确定把本机全部数据上传到云端登录码「' + code + '」？\n相同登录码的旧云端数据会被覆盖。')) return;
    syncSetStatus('正在上传…', '');
    var payload = Store.snapshot();
    syncApi('PUT', payload).then(function (res) {
      Store.setLastSyncToken((refs.syncToken ? refs.syncToken.value : '') || '');
      Store.setLastSyncCode(code);
      syncSetStatus('✅ 上传成功（版本 ' + (res && res.version ? res.version : '?') + '，设备：' + Store.getLastDeviceId() + '）', 'ok');
      showToast('云端上传成功 ☁️');
    }).catch(function (err) {
      syncSetStatus('❌ 上传失败：' + (err.message || err), 'error');
    });
  }
  function onSyncDownload() {
    var code = (refs.syncCode ? refs.syncCode.value.trim().toUpperCase() : '') || '';
    if (!code) { syncSetStatus('请先输入或生成登录码', 'error'); return; }
    if (!confirm('从云端登录码「' + code + '」下载数据会覆盖本机全部数据，确定继续？')) return;
    if (!confirm('二次确认：本机学习记录、计划、错题、词汇等都将被云端数据替换，建议先点「导出备份」留一份。确定下载？')) return;
    syncSetStatus('正在下载…', '');
    syncApi('GET').then(function (res) {
      if (!res || !res.data) { syncSetStatus('⚠️ 该登录码暂无云端数据', 'error'); return; }
      var ok = Store.restoreSnapshot(res.data);
      if (!ok) { syncSetStatus('❌ 数据恢复失败，格式不兼容', 'error'); return; }
      Store.setLastSyncToken((refs.syncToken ? refs.syncToken.value : '') || '');
      Store.setLastSyncCode(code);
      syncSetStatus('✅ 下载成功（版本 ' + (res.version || '?') + '），正在刷新页面…', 'ok');
      setTimeout(function () { location.reload(); }, 900);
    }).catch(function (err) {
      syncSetStatus('❌ 下载失败：' + (err.message || err), 'error');
    });
  }
  function onSyncDelete() {
    var code = (refs.syncCode ? refs.syncCode.value.trim().toUpperCase() : '') || '';
    if (!code) { syncSetStatus('请先输入或生成登录码', 'error'); return; }
    if (!confirm('确定删除云端登录码「' + code + '」的全部数据？\n本机数据不受影响，但之后无法用这个登录码从云端拉取。')) return;
    if (!confirm('二次确认：云端数据将被永久删除，无法恢复。确定删除？')) return;
    syncSetStatus('正在删除…', '');
    syncApi('DELETE').then(function (res) {
      syncSetStatus('✅ 云端数据已删除（' + (res && res.removed ? res.removed + ' 条记录' : '完成') + '）', 'ok');
      showToast('云端数据已删除');
    }).catch(function (err) {
      syncSetStatus('❌ 删除失败：' + (err.message || err), 'error');
    });
  }
  function onGenSyncCode() {
    var c = Store.generateSyncCode();
    if (refs.syncCode) refs.syncCode.value = c;
    Store.setLastSyncCode(c);
    syncSetStatus('已生成新登录码，记得分享给要同步的设备哦 🎲', 'ok');
  }
  function onCopySyncCode() {
    var c = ((refs.syncCode ? refs.syncCode.value : '') || '').trim();
    if (!c) { syncSetStatus('登录码为空，无法复制', 'error'); return; }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(c).then(function () {
          syncSetStatus('✅ 登录码「' + c + '」已复制到剪贴板', 'ok');
        }, function () { throw new Error('clipboard fail'); });
      } else {
        var ta = document.createElement('textarea');
        ta.value = c; document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta);
        syncSetStatus('✅ 登录码「' + c + '」已复制', 'ok');
      }
    } catch (e) {
      syncSetStatus('复制失败，请手动选中文本复制：' + c, 'error');
    }
  }

  function renderAll() {
    renderConfig();
    renderTimerRows();
    renderManual();
    populatePlanSubjects();
    renderPlan();
    renderToday();
    renderData();
    renderMistakeTypes();
    populateMistakeSubjects();
    renderMistakeList();
    renderSites();
    renderWords();
    renderPractice();
    renderReview();
    renderSummary();
    renderHfWords();
    renderTranslatorConfig();
    renderSyncConfig();
    renderWrongBook();
    renderMastery();
    renderSubjectChapters();
    renderPlanItems();
    renderMathChapters();
    renderMathMistakes();
    renderMathQuestionList();
    renderMathPractice();
    render408Chapters();
    render408Mistakes();
    render408QuestionList();
    render408Practice();
    render408Knowledge();
    render408Years();
    updateTranslateButton();
    renderPomodoro();
    renderCustomTimer();
  }
  function initTabs() {
    var tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var target = btn.getAttribute('data-tab');
        tabs.forEach(function (b) { b.classList.toggle('active', b === btn); });
        document.querySelectorAll('.tab-panel').forEach(function (p) { p.classList.toggle('active', p.id === 'tab-' + target); });
        if (target === 'practice' && !practiceSession) startPractice();
        if (target === 'review' && !reviewQueue) startReview();
        if (target === 'summary') renderSummary();
        if (target === 'hfwords') renderHfWords();
        if (target === 'config') renderTranslatorConfig();
        if (target === 'words') renderWrongBook();
        if (target === 'plan') { renderMastery(); renderSubjectChapters(); renderPlanItems(); }
        if (target === 'math') { renderMathChapters(); renderMathMistakes(); renderMathQuestionList(); renderMathPractice(); }
        if (target === 'cs408') { render408Chapters(); render408Mistakes(); render408QuestionList(); render408Practice(); render408Knowledge(); render408Years(); }
        if (target === 'today') renderTodayAggregate();
        if (window.matchMedia('(max-width: 860px)').matches) document.body.classList.remove('nav-open');
      });
    });
    updateMathTabVisibility();
    update408TabVisibility();
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

    // 云同步（登录码）
    refs.syncToken = $('sync-token');
    refs.syncCode = $('sync-code');
    refs.btnGenSyncCode = $('btn-gen-sync-code');
    refs.btnCopySyncCode = $('btn-copy-sync-code');
    refs.btnSyncUpload = $('btn-sync-upload');
    refs.btnSyncDownload = $('btn-sync-download');
    refs.btnSyncDelete = $('btn-sync-delete');
    refs.syncStatus = $('sync-status');

    refs.timerRows = $('timer-rows');
    refs.pomoTime = $('pomo-time');
    refs.pomoMode = $('pomo-mode');
    refs.btnPomoStart = $('btn-pomo-start');
    refs.btnPomoReset = $('btn-pomo-reset');
    refs.manualDate = $('manual-date');
    refs.manualDurations = $('manual-durations');
    refs.manualCompleted = $('manual-completed');
    refs.manualSummary = $('manual-summary');
    refs.manualNote = $('manual-note');
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
    refs.heatmap = $('heatmap');
    refs.heatLabel = $('heat-label');
    refs.heatPrev = $('heat-prev');
    refs.heatNext = $('heat-next');
    refs.heatNow = $('heat-now');
    refs.trend = $('trend');
    refs.subjectStats = $('subject-stats');

    refs.planHint = $('plan-hint');
    refs.btnAutoPlan = $('btn-auto-plan');
    refs.planList = $('plan-list');
    refs.planSubject = $('plan-subject');
    refs.planText = $('plan-text');
    refs.planMin = $('plan-min');
    refs.btnAddPlan = $('btn-add-plan');
    refs.todayGuide = $('today-guide');

    refs.mistakeTypes = $('mistake-types');
    refs.mistakeSubject = $('mistake-subject');
    refs.mistakeContent = $('mistake-content');
    refs.mistakeNote = $('mistake-note');
    refs.btnAddMistake = $('btn-add-mistake');
    refs.mistakeList = $('mistake-list');

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
    refs.btnCheckin = $('btn-checkin');
    refs.btnShareSummary = $('btn-share-summary');
    refs.btnInvite = $('btn-invite');
    refs.summaryReminders = $('summary-reminders');

    // 学习计划
    refs.masteryList = $('mastery-list');
    refs.moduleName = $('module-name');
    refs.btnAddModule = $('btn-add-module');
    refs.subjectChapters = $('subject-chapters');
    refs.btnSmartPlan = $('btn-smart-plan');
    refs.planItems = $('plan-items');
    refs.planItemText = $('plan-item-text');
    refs.planNote = $('plan-note');
    refs.btnAddPlanItem = $('btn-add-plan-item');

    // 数学模块
    refs.mathChapters = $('math-chapters');
    refs.mathChapterAdd = $('math-chapter-add');
    refs.btnAddMathChapter = $('btn-add-math-chapter');
    refs.mathMistakeCat = $('math-mistake-cat');
    refs.mathMistakeContent = $('math-mistake-content');
    refs.mathMistakeNote = $('math-mistake-note');
    refs.btnAddMathMistake = $('btn-add-math-mistake');
    refs.mathMistakeFilter = $('math-mistake-filter');
    refs.mathMistakeList = $('math-mistake-list');
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
    refs.cs408ChapterAdd = $('cs408-chapter-add');
    refs.btnAddCs408Chapter = $('btn-add-cs408-chapter');
    refs.cs408MistakeCat = $('cs408-mistake-cat');
    refs.cs408MistakeContent = $('cs408-mistake-content');
    refs.cs408MistakeNote = $('cs408-mistake-note');
    refs.btnAddCs408Mistake = $('btn-add-cs408-mistake');
    refs.cs408MistakeFilter = $('cs408-mistake-filter');
    refs.cs408MistakeList = $('cs408-mistake-list');
    refs.cs408DueBadge = $('cs408-due-badge');
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

    // 番茄钟自定义时长 + 自定义倒计时
    refs.pomoWork = $('pomo-work');
    refs.pomoBreak = $('pomo-break');
    refs.timerCustomMin = $('timer-custom-min');
    refs.timerCustomSec = $('timer-custom-sec');
    refs.timerCustomTime = $('timer-custom-time');
    refs.timerCustomMode = $('timer-custom-mode');
    refs.btnTimerCustomStart = $('btn-timer-custom-start');
    refs.btnTimerCustomReset = $('btn-timer-custom-reset');

    // 主题切换 + 今日聚合
    refs.themeToggle = $('themeToggle');
    refs.aggCountdown = $('agg-countdown');
    refs.aggMinutes = $('agg-minutes');
    refs.aggPlan = $('agg-plan');
    refs.aggStreak = $('agg-streak');

    // 翻译密钥（用户自带 key，仅存本机浏览器）
    refs.transAppid = $('trans-appid');
    refs.transKey = $('trans-key');
    refs.btnSaveTranslator = $('btn-save-translator');
    refs.btnTestTranslator = $('btn-test-translator');
    refs.transStatus = $('trans-status');
    // 即时翻译 / 错词本
    refs.transInput = $('trans-input');
    refs.btnTranslate = $('btn-translate');
    refs.btnTranslateClear = $('btn-translate-clear');
    refs.transQueryStatus = $('trans-query-status');
    refs.transResult = $('trans-result');
    refs.wrongCount = $('wrong-count');
    refs.wrongList = $('wrong-list');
    refs.btnClearWrong = $('btn-clear-wrong');

    // 配置
    refs.majorSelect.addEventListener('change', function () { Store.setConfig({ major: refs.majorSelect.value }); update408TabVisibility(); renderTodayAggregate(); });
    refs.nicknameInput.addEventListener('change', function () { Store.setConfig({ nickname: refs.nicknameInput.value.trim() }); });
    refs.examDate.addEventListener('change', function () { Store.setConfig({ examDate: refs.examDate.value }); renderData(); });
    refs.targetTotal.addEventListener('change', function () { Store.setConfig({ targetTotal: Number(refs.targetTotal.value) || 0 }); renderData(); });
    refs.autoPlan.addEventListener('change', function () { Store.setConfig({ autoPlan: refs.autoPlan.checked }); renderPlan(); });

    // 记录
    refs.manualDate.addEventListener('change', renderManual);
    refs.btnSaveManual.addEventListener('click', onSaveManual);
    refs.btnResetDay.addEventListener('click', function () {
      var ds = refs.manualDate.value || Store.todayStr();
      if (confirm('确定清空 ' + ds + ' 的学习记录？')) { Store.resetDay(ds); renderManual(); renderData(); renderToday(); }
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

    // 云同步按钮
    if (refs.btnGenSyncCode) refs.btnGenSyncCode.addEventListener('click', onGenSyncCode);
    if (refs.btnCopySyncCode) refs.btnCopySyncCode.addEventListener('click', onCopySyncCode);
    if (refs.btnSyncUpload) refs.btnSyncUpload.addEventListener('click', onSyncUpload);
    if (refs.btnSyncDownload) refs.btnSyncDownload.addEventListener('click', onSyncDownload);
    if (refs.btnSyncDelete) refs.btnSyncDelete.addEventListener('click', onSyncDelete);
    if (refs.syncToken) refs.syncToken.addEventListener('change', function () { Store.setLastSyncToken(refs.syncToken.value || ''); });
    if (refs.syncCode) refs.syncCode.addEventListener('change', function () { Store.setLastSyncCode((refs.syncCode.value || '').trim().toUpperCase()); });

    // 数据
    refs.heatPrev.addEventListener('click', function () { heatMonth--; if (heatMonth < 0) { heatMonth = 11; heatYear--; } renderData(); });
    refs.heatNext.addEventListener('click', function () { heatMonth++; if (heatMonth > 11) { heatMonth = 0; heatYear++; } renderData(); });
    refs.heatNow.addEventListener('click', function () { var n = new Date(); heatYear = n.getFullYear(); heatMonth = n.getMonth(); renderData(); });

    // 错题
    refs.btnAddMistake.addEventListener('click', function () {
      var content = refs.mistakeContent.value.trim();
      if (!content) { alert('请输入内容'); return; }
      Store.addMistake({ type: selectedType, content: content, subject: refs.mistakeSubject.value || '', note: refs.mistakeNote.value.trim(), date: Store.todayStr() });
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
    // 即时翻译 / 错词本
    refs.btnTranslate.addEventListener('click', onTranslate);
    refs.btnTranslateClear.addEventListener('click', function () { refs.transInput.value = ''; refs.transResult.innerHTML = ''; refs.transQueryStatus.textContent = ''; });
    // 番茄钟
    refs.btnPomoStart.addEventListener('click', startPomodoro);
    refs.btnPomoReset.addEventListener('click', resetPomodoro);
    refs.btnClearWrong.addEventListener('click', function () {
      if (!Store.getWrongWords().length) { showToast('错词本已是空的'); return; }
      if (confirm('确定清空错词本？此操作不可恢复')) { Store.clearWrongWords(); renderWrongBook(); showToast('已清空错词本'); }
    });
    // 词汇：背单词 / 复习
    refs.btnPracticeRestart.addEventListener('click', startPractice);
    refs.btnReviewRestart.addEventListener('click', startReview);
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
      if (!confirm('确定清空全部数据？此操作不可恢复（建议先导出备份）')) return;
      if (!confirm('二次确认：所有学习记录、计划、错题、词汇都将永久删除，确定继续？')) return;
      localStorage.removeItem('kaoyan_tracker_v1'); location.reload();
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
    refs.btnCheckin.addEventListener('click', onCheckin);
    refs.btnShareSummary.addEventListener('click', onShareToday);
    if (refs.btnInvite) refs.btnInvite.addEventListener('click', onInvite);

    // 学习计划：模块掌握
    refs.btnAddModule.addEventListener('click', function () {
      var name = refs.moduleName.value.trim();
      if (!name) { alert('请输入模块名'); return; }
      Store.addModule(name); refs.moduleName.value = ''; renderMastery();
    });
    // 学习计划：智能生成 + 手动添加
    refs.btnSmartPlan.addEventListener('click', onSmartPlan);
    refs.btnAddPlanItem.addEventListener('click', function () {
      var text = refs.planItemText.value.trim();
      if (!text) { alert('请输入计划内容'); return; }
      Store.addPlanItem({ text: text, note: refs.planNote.value.trim(), done: false });
      refs.planItemText.value = ''; refs.planNote.value = ''; renderPlanItems();
    });
    // 数学：章节新增
    refs.btnAddMathChapter.addEventListener('click', function () {
      var v = refs.mathChapterAdd.value.trim(); if (!v) return;
      var arr = Store.getMathChapters().slice(); arr.push(v); Store.setMathChapters(arr);
      refs.mathChapterAdd.value = ''; renderMathChapters();
    });
    // 数学：错题
    refs.btnAddMathMistake.addEventListener('click', onAddMathMistake);
    // 数学：分类刷题
    refs.btnMathPracticeStart.addEventListener('click', onMathPracticeStart);
    // 数学：自定义题库
    refs.btnAddMq.addEventListener('click', onAddMathQuestion);

    // 408：章节新增
    if (refs.btnAddCs408Chapter) refs.btnAddCs408Chapter.addEventListener('click', function () {
      var v = refs.cs408ChapterAdd.value.trim(); if (!v) return;
      var arr = Store.get408Chapters().slice(); arr.push(v); Store.set408Chapters(arr);
      refs.cs408ChapterAdd.value = ''; render408Chapters();
    });
    // 408：错题
    if (refs.btnAddCs408Mistake) refs.btnAddCs408Mistake.addEventListener('click', onAdd408Mistake);
    // 408：分类刷题
    if (refs.btnCs408PracticeStart) refs.btnCs408PracticeStart.addEventListener('click', on408PracticeStart);
    // 408：自定义题库
    if (refs.btnAddCq) refs.btnAddCq.addEventListener('click', onAdd408Question);
    // 408：知识点
    if (refs.btnAddKp) refs.btnAddKp.addEventListener('click', onAdd408Knowledge);
    // 408：真题年份
    if (refs.btnAddYr) refs.btnAddYr.addEventListener('click', onAdd408Year);

    // 自定义倒计时
    if (refs.btnTimerCustomStart) refs.btnTimerCustomStart.addEventListener('click', startCustomTimer);
    if (refs.btnTimerCustomReset) refs.btnTimerCustomReset.addEventListener('click', resetCustomTimer);
    // 主题切换
    if (refs.themeToggle) refs.themeToggle.addEventListener('click', toggleTheme);

    refs.manualDate.value = Store.todayStr();
    refs.examDate2.value = Store.todayStr();

    // 自动计划：启用且今日无计划则生成
    if (Store.getConfig().autoPlan) { var ds = Store.todayStr(); if (!Store.getPlan(ds)) autoGenPlan(ds); }

    // 数学章节预填充（仅首次）
    if (!Store.getMathChapters().length) Store.setMathChapters(MATH_CHAPTERS_PREFILL.slice());
    // 数学错题分类下拉
    refs.mathMistakeCat.innerHTML = '';
    MATH_MISTAKE_CATS.forEach(function (c) { var o = el('option'); o.value = c; o.textContent = c; refs.mathMistakeCat.appendChild(o); });

    // 408 章节预填充（仅首次）
    if (!Store.get408Chapters().length) Store.set408Chapters(CS408_CHAPTERS_PREFILL.slice());
    // 408 错题分类下拉
    if (refs.cs408MistakeCat) {
      refs.cs408MistakeCat.innerHTML = '';
      CS408_MISTAKE_CATS.forEach(function (c) { var o = el('option'); o.value = c; o.textContent = c; refs.cs408MistakeCat.appendChild(o); });
    }

    // 主题初始化 + 键盘快捷键 + 今日聚合
    applyTheme();
    initKeyboardShortcuts();

    initTabs();
    renderAll();
    applySidebar();
    renderTodayAggregate();

    // 每日打卡与连续学习提醒
    if (!Store.isCheckedIn(Store.todayStr()) && Store.totalMinutesForDay(Store.getDay(Store.todayStr()) || {}) === 0) {
      showToast('今天还没打卡，去学习一会儿吧 🔥');
    }

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