/* store.js — 数据持久化层（localStorage，无后端、可离线） */
(function (global) {
  'use strict';

  var KEY = 'kaoyan_tracker_v1';

  var COLOR_MAP = {
    politics: '#ef4444',
    english: '#3b82f6',
    math: '#10b981',
    major: '#8b5cf6',
    other: '#f59e0b'
  };
  var FALLBACK_COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

  /* 数学三套卷种章节模板（按「分组 · 章节名」存储，与现有 parseChapter 一致）。
     数二不含概率统计；数三高数偏经济应用（用「微积分的经济应用」替换空间解析几何）。 */
  var MATH_VOLUME_CHAPTERS = {
    '数学一': [
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
    ],
    '数学二': [
      '高数 · 函数、极限、连续',
      '高数 · 一元函数微分学（导数与微分）',
      '高数 · 微分中值定理与导数应用',
      '高数 · 不定积分',
      '高数 · 定积分与反常积分',
      '高数 · 多元函数微积分学（含二重积分）',
      '高数 · 常微分方程',
      '线代 · 行列式',
      '线代 · 矩阵',
      '线代 · 向量组的线性相关性',
      '线代 · 线性方程组',
      '线代 · 特征值与特征向量',
      '线代 · 二次型'
    ],
    '数学三': [
      '高数 · 函数、极限、连续',
      '高数 · 一元函数微分学（导数与微分）',
      '高数 · 微分中值定理与导数应用',
      '高数 · 不定积分',
      '高数 · 定积分与反常积分',
      '高数 · 多元函数微积分学',
      '高数 · 无穷级数',
      '高数 · 常微分方程',
      '高数 · 微积分的经济应用',
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
    ]
  };
  var MATH_VOLUMES = ['数学一', '数学二', '数学三'];

  function defaults() {
    return {
      config: {
        nickname: '',
        major: '',
        examDate: '',
        targetTotal: 0,
        autoPlan: false,
        subjects: [],
        sidebarCollapsed: false,
        subjectExpanded: {}, // { 科目key: true } 配置页带子结构科目的展开态（数学/408）
        scoreWeights: { duration: 50, plan: 20, vocab: 15, mistake: 15 } // 单日得分四项权重（合计满分100）
      },
      mathVolume: '', // 当前数学卷种：'数学一'|'数学二'|'数学三'，空时按默认（数学一）处理
      cs408BooksCollapsed: {}, // { 书名: true } 408 各书折叠态（true=折叠）
      days: {},   // 'YYYY-MM-DD' -> {durations:{key:min}, completed:'', summary:'', note:''}
      exams: [],  // {id,name,date,scores:{key:score},total}
      plans: {},  // 'YYYY-MM-DD' -> [{id,text,minutes,done}]
      mistakes: [], // {id,type,content,subject,date,note}
      websites: [], // {id,name,url,cat}
      vocab: [],    // {id,word,cn,box,next,added,wrong,last}
      translator: { appid: '', key: '' }, // 百度翻译开放平台密钥（用户自行申请的 APP ID + 密钥）；仅存本机浏览器，不内置任何 key、不上传服务器
      wrongWords: [], // 错词本（独立）{id,word,cn,created,src}
      checkins: [], // ['YYYY-MM-DD', ...] 显式打卡日（用于连续学习提醒）
      milestones: [], // 已达成里程碑 id 列表（用于庆祝动画去重，避免重复触发）
      moduleMastery: {},     // { 模块名: '已掌握'|'进行中'|'未开始' }
      subjectChapters: {},   // { 科目key: { chapters:[章名...], current: index } }
      mathChapters: [],      // 数学全部章节（字符串数组，初始化预填）
      mathCurrent: -1,       // 数学当前学到章节 index（仅标记"正在学"位置，不代表前面全完成）
      mathDone: [],          // 数学已完成章节 index 集合（支持跳跃式学习）
      planItems: [],         // 整体学习计划 [{id,text,note,done,subject,chapter}]
      mathMistakes: [],      // 数学错题 [{id,category,content,note,created,reviewed}]
      mathQuestions: [],     // 用户自定义选择题 [{id,category,q,options,answer,explain}]
      mathStats: {},         // { 分类: {total, correct} }
      // 408 专业课模块
      cs408Chapters: [],     // 408 全部章节（字符串数组，初始化预填）
      cs408Current: -1,      // 408 当前学到章节 index（仅标记"正在学"位置）
      cs408Done: [],         // 408 已完成章节 index 集合（支持跳跃式学习）
      cs408Mistakes: [],     // 408 错题 [{id,category,content,note,created,reviewed,nextReview,reviewCount}]
      cs408Questions: [],    // 408 用户自定义选择题
      cs408Stats: {},        // 408 { 分类: {total, correct} }
      cs408Knowledge: [],    // 408 知识点速查卡 [{id,subject,title,content,created}]
      cs408Years: [],        // 408 历年真题年份记录 [{id,year,score,total,note}]
      theme: 'light',        // 主题：'light' | 'dark'
      timer: { subjectKey: null, startTs: 0, accumulated: 0, running: false },
      _seq: 1
    };
  }

  var state = load();

  function load() {
    try {
      var raw = global.localStorage.getItem(KEY);
      if (!raw) return defaults();
      var p = JSON.parse(raw);
      var d = defaults();
      var cfgIn = (p.config && p.config.subjects) ? p.config : null;
      var cfgOut = {
        nickname: cfgIn ? (cfgIn.nickname !== undefined ? cfgIn.nickname : d.config.nickname) : d.config.nickname,
        major: cfgIn ? (cfgIn.major !== undefined ? cfgIn.major : d.config.major) : d.config.major,
        examDate: cfgIn ? (cfgIn.examDate !== undefined ? cfgIn.examDate : d.config.examDate) : d.config.examDate,
        targetTotal: cfgIn ? (cfgIn.targetTotal !== undefined ? cfgIn.targetTotal : d.config.targetTotal) : d.config.targetTotal,
        autoPlan: cfgIn ? (cfgIn.autoPlan !== undefined ? cfgIn.autoPlan : d.config.autoPlan) : d.config.autoPlan,
        subjects: cfgIn ? cfgIn.subjects : d.config.subjects,
        sidebarCollapsed: cfgIn ? (cfgIn.sidebarCollapsed !== undefined ? cfgIn.sidebarCollapsed : d.config.sidebarCollapsed) : d.config.sidebarCollapsed,
        subjectExpanded: cfgIn && cfgIn.subjectExpanded && typeof cfgIn.subjectExpanded === 'object' ? cfgIn.subjectExpanded : d.config.subjectExpanded,
        scoreWeights: cfgIn && cfgIn.scoreWeights && typeof cfgIn.scoreWeights === 'object' ? cfgIn.scoreWeights : d.config.scoreWeights
      };
      return {
        config: cfgOut,
        days: (p.days && typeof p.days === 'object') ? p.days : {},
        exams: (p.exams && Array.isArray(p.exams)) ? p.exams : [],
        plans: (p.plans && typeof p.plans === 'object') ? p.plans : {},
        mistakes: (p.mistakes && Array.isArray(p.mistakes)) ? p.mistakes : [],
        websites: (p.websites && Array.isArray(p.websites)) ? p.websites : [],
        vocab: (p.vocab && Array.isArray(p.vocab)) ? p.vocab : [],
        translator: (p.translator && typeof p.translator === 'object') ? { appid: String(p.translator.appid || ''), key: String(p.translator.key || '') } : { appid: '', key: '' },
        wrongWords: (p.wrongWords && Array.isArray(p.wrongWords)) ? p.wrongWords : [],
        checkins: (p.checkins && Array.isArray(p.checkins)) ? p.checkins : [],
        milestones: (p.milestones && Array.isArray(p.milestones)) ? p.milestones.slice() : [],
        moduleMastery: (p.moduleMastery && typeof p.moduleMastery === 'object') ? p.moduleMastery : {},
        subjectChapters: (p.subjectChapters && typeof p.subjectChapters === 'object') ? p.subjectChapters : {},
        mathChapters: (p.mathChapters && Array.isArray(p.mathChapters)) ? p.mathChapters : [],
        mathCurrent: (typeof p.mathCurrent === 'number') ? p.mathCurrent : -1,
        mathDone: Array.isArray(p.mathDone) ? p.mathDone.slice() : (function(){var c=typeof p.mathCurrent==='number'?p.mathCurrent:-1;var a=[];for(var i=0;i<=c;i++)a.push(i);return a;})(),
        planItems: (p.planItems && Array.isArray(p.planItems)) ? p.planItems : [],
        mathMistakes: (p.mathMistakes && Array.isArray(p.mathMistakes)) ? p.mathMistakes : [],
        mathQuestions: (p.mathQuestions && Array.isArray(p.mathQuestions)) ? p.mathQuestions : [],
        mathStats: (p.mathStats && typeof p.mathStats === 'object') ? p.mathStats : {},
        cs408Chapters: (p.cs408Chapters && Array.isArray(p.cs408Chapters)) ? p.cs408Chapters : [],
        cs408Current: (typeof p.cs408Current === 'number') ? p.cs408Current : -1,
        cs408Done: Array.isArray(p.cs408Done) ? p.cs408Done.slice() : (function(){var c=typeof p.cs408Current==='number'?p.cs408Current:-1;var a=[];for(var i=0;i<=c;i++)a.push(i);return a;})(),
        cs408Mistakes: (p.cs408Mistakes && Array.isArray(p.cs408Mistakes)) ? p.cs408Mistakes : [],
        cs408Questions: (p.cs408Questions && Array.isArray(p.cs408Questions)) ? p.cs408Questions : [],
        cs408Stats: (p.cs408Stats && typeof p.cs408Stats === 'object') ? p.cs408Stats : {},
        cs408Knowledge: (p.cs408Knowledge && Array.isArray(p.cs408Knowledge)) ? p.cs408Knowledge : [],
        cs408Years: (p.cs408Years && Array.isArray(p.cs408Years)) ? p.cs408Years : [],
        theme: (p.theme === 'dark') ? 'dark' : 'light',
        timer: (p.timer && typeof p.timer === 'object') ? p.timer : d.timer,
        mathVolume: (typeof p.mathVolume === 'string') ? p.mathVolume : d.mathVolume,
        cs408BooksCollapsed: (p.cs408BooksCollapsed && typeof p.cs408BooksCollapsed === 'object') ? p.cs408BooksCollapsed : {},
        _seq: p._seq || d._seq
      };
    } catch (e) {
      console.warn('[Store] 读取失败，使用默认数据', e);
      return defaults();
    }
  }

  var saveHook = null;
  function setOnSave(fn) { saveHook = fn; }
  function save() {
    try { global.localStorage.setItem(KEY, JSON.stringify(state)); if (saveHook) { try { saveHook(); } catch (e) {} } return true; }
    catch (e) { console.error('[Store] 保存失败', e); return false; }
  }

  function dateStr(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }
  function addDays(d, n) { var r = new Date(d); r.setDate(r.getDate() + n); return r; }
  function todayStr() { return dateStr(new Date()); }
  function nextSeq() { return state._seq++; }

  /* ---------- 配置 / 科目 ---------- */
  function getConfig() { return state.config; }
  function setConfig(partial) {
    for (var k in partial) { if (partial.hasOwnProperty(k)) state.config[k] = partial[k]; }
    save();
  }
  function getSubjects() { return state.config.subjects; }
  function upsertSubject(subject) {
    var found = null;
    for (var i = 0; i < state.config.subjects.length; i++) {
      if (state.config.subjects[i].key === subject.key) { found = state.config.subjects[i]; break; }
    }
    if (found) { for (var k in subject) { if (subject.hasOwnProperty(k)) found[k] = subject[k]; } }
    else {
      if (!subject.color) subject.color = COLOR_MAP[subject.type] || FALLBACK_COLORS[state.config.subjects.length % FALLBACK_COLORS.length];
      state.config.subjects.push(subject);
    }
    save();
  }
  function removeSubject(key) {
    state.config.subjects = state.config.subjects.filter(function (s) { return s.key !== key; });
    Object.keys(state.days).forEach(function (ds) { if (state.days[ds] && state.days[ds].durations) delete state.days[ds].durations[key]; });
    state.exams.forEach(function (ex) { if (ex.scores) delete ex.scores[key]; });
    save();
  }
  function updateSubjectTarget(key, target) {
    var s = state.config.subjects.find(function (x) { return x.key === key; });
    if (s) { s.target = target; save(); }
  }

  /* ---------- 每日记录 ---------- */
  function getDay(ds) { return state.days[ds] || null; }
  function getDays() { return state.days; }
  function ensureDay(ds) {
    if (!state.days[ds]) state.days[ds] = { durations: {}, completed: '', summary: '', note: '' };
    if (!state.days[ds].durations) state.days[ds].durations = {};
    return state.days[ds];
  }
  function saveDayMeta(ds, meta) {
    var day = ensureDay(ds);
    if (meta.completed !== undefined) day.completed = meta.completed;
    if (meta.summary !== undefined) day.summary = meta.summary;
    if (meta.note !== undefined) day.note = meta.note;
    save();
  }
  function setDayDurations(ds, durations) { var day = ensureDay(ds); day.durations = durations || {}; save(); }
  function addDuration(ds, key, minutes) { var day = ensureDay(ds); day.durations[key] = (day.durations[key] || 0) + minutes; save(); }
  function totalMinutesForDay(day) {
    if (!day || !day.durations) return 0;
    var t = 0; for (var k in day.durations) { if (day.durations.hasOwnProperty(k)) t += (day.durations[k] || 0); }
    return t;
  }
  function resetDay(ds) { if (state.days[ds]) { state.days[ds] = { durations: {}, completed: '', summary: '', note: '' }; save(); } }

  /* ---------- 模考成绩 ---------- */
  function addExam(exam) { exam.id = 'ex_' + nextSeq(); state.exams.push(exam); save(); return exam; }
  function removeExam(id) { state.exams = state.exams.filter(function (e) { return e.id !== id; }); save(); }
  function getExams() {
    return state.exams.slice().sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });
  }

  /* ---------- 每日计划 ---------- */
  function getPlan(ds) { return state.plans[ds] || null; }
  function setPlan(ds, items) { state.plans[ds] = items; save(); }
  function addDailyPlanItem(ds, item) {
    if (!state.plans[ds]) state.plans[ds] = [];
    item.id = 'pl_' + nextSeq();
    state.plans[ds].push(item); save();
  }
  function updateDailyPlanItem(ds, id, patch) {
    var arr = state.plans[ds]; if (!arr) return;
    arr.forEach(function (it) { if (it.id === id) { for (var k in patch) it[k] = patch[k]; } }); save();
  }
  function toggleDailyPlanItem(ds, id) {
    var arr = state.plans[ds]; if (!arr) return;
    arr.forEach(function (it) { if (it.id === id) it.done = !it.done; }); save();
  }
  function removeDailyPlanItem(ds, id) {
    if (state.plans[ds]) state.plans[ds] = state.plans[ds].filter(function (it) { return it.id !== id; }); save();
  }

  /* ---------- 错题整理 ---------- */
  function getMistakes() {
    return state.mistakes.slice().sort(function (a, b) { return a.date < b.date ? 1 : (a.date > b.date ? -1 : 0); });
  }
  function addMistake(m) { m.id = 'mk_' + nextSeq(); state.mistakes.push(m); save(); return m; }
  function removeMistake(id) { state.mistakes = state.mistakes.filter(function (x) { return x.id !== id; }); save(); }

  /* ---------- 学习网站 ---------- */
  function getUserWebsites() { return state.websites; }
  function addWebsite(w) { w.id = 'ws_' + nextSeq(); state.websites.push(w); save(); }
  function removeWebsite(id) { state.websites = state.websites.filter(function (x) { return x.id !== id; }); save(); }

  /* ---------- 学习计划 / 进度 / 数学模块 ---------- */
  function getModuleMastery() { return state.moduleMastery || {}; }
  function setModuleMastery(name, status) { if (!state.moduleMastery) state.moduleMastery = {}; state.moduleMastery[name] = status; save(); }
  function addModule(name) { if (!state.moduleMastery) state.moduleMastery = {}; if (!(name in state.moduleMastery)) state.moduleMastery[name] = '未开始'; save(); }

  function getSubjectChapters(key) {
    if (!state.subjectChapters) return null;
    var obj = state.subjectChapters[key];
    if (!obj) return null;
    if (!Array.isArray(obj.done)) {
      var c = (typeof obj.current === 'number') ? obj.current : -1;
      obj.done = []; for (var i = 0; i <= c; i++) obj.done.push(i);
      save();
    }
    return obj;
  }
  function setSubjectChapters(key, obj) { if (!state.subjectChapters) state.subjectChapters = {}; state.subjectChapters[key] = obj; save(); }

  function getMathChapters() { return (state.mathChapters || []).slice(); }
  function setMathChapters(arr) { state.mathChapters = (arr || []).slice(); save(); }
  function getMathCurrent() { return (typeof state.mathCurrent === 'number') ? state.mathCurrent : -1; }
  function setMathCurrent(i) { state.mathCurrent = (typeof i === 'number') ? i : -1; save(); }
  function getMathDone() { return Array.isArray(state.mathDone) ? state.mathDone.slice() : []; }
  function setMathDone(arr) { state.mathDone = (arr || []).slice(); save(); }
  function toggleMathDone(idx) {
    if (!Array.isArray(state.mathDone)) state.mathDone = [];
    var i = state.mathDone.indexOf(idx);
    if (i >= 0) state.mathDone.splice(i, 1); else state.mathDone.push(idx);
    save();
  }

  // 数学卷种：按大纲切换章节模板，已完成的「同名章节」进度保留，新大纲没有的章节进度丢弃
  function getMathVolume() {
    return MATH_VOLUMES.indexOf(state.mathVolume) >= 0 ? state.mathVolume : '数学一';
  }
  function setMathVolume(vol) {
    if (MATH_VOLUMES.indexOf(vol) < 0) return;
    var oldChapters = (state.mathChapters || []).slice();
    var oldDone = Array.isArray(state.mathDone) ? state.mathDone.slice() : [];
    var oldDoneNames = {};
    oldDone.forEach(function (i) { if (oldChapters[i] != null) oldDoneNames[oldChapters[i]] = true; });
    var oldCurName = (typeof state.mathCurrent === 'number' && oldChapters[state.mathCurrent] != null) ? oldChapters[state.mathCurrent] : null;
    var newChapters = MATH_VOLUME_CHAPTERS[vol].slice();
    var newDone = [];
    newChapters.forEach(function (ch, i) { if (oldDoneNames[ch]) newDone.push(i); });
    state.mathChapters = newChapters;
    state.mathDone = newDone;
    state.mathCurrent = oldCurName ? newChapters.indexOf(oldCurName) : -1;
    state.mathVolume = vol;
    save();
  }
  function getMathVolumeTemplates() { return MATH_VOLUME_CHAPTERS; }

  // 408 各书折叠态（持久化到 localStorage）
  function getCs408BooksCollapsed() { return (state.cs408BooksCollapsed && typeof state.cs408BooksCollapsed === 'object') ? state.cs408BooksCollapsed : {}; }
  function setCs408BooksCollapsed(obj) { state.cs408BooksCollapsed = (obj && typeof obj === 'object') ? obj : {}; save(); }

  // 单日得分权重（默认复刻原公式：时长50 + 计划20 + 生词15 + 错题15）
  function getScoreWeights() {
    var d = defaults().config.scoreWeights;
    var w = (state.config && state.config.scoreWeights && typeof state.config.scoreWeights === 'object') ? state.config.scoreWeights : d;
    return {
      duration: Number(w.duration != null ? w.duration : d.duration) || 0,
      plan: Number(w.plan != null ? w.plan : d.plan) || 0,
      vocab: Number(w.vocab != null ? w.vocab : d.vocab) || 0,
      mistake: Number(w.mistake != null ? w.mistake : d.mistake) || 0
    };
  }
  function setScoreWeights(w) {
    if (!state.config.scoreWeights) state.config.scoreWeights = {};
    state.config.scoreWeights = {
      duration: Number(w.duration) || 0,
      plan: Number(w.plan) || 0,
      vocab: Number(w.vocab) || 0,
      mistake: Number(w.mistake) || 0
    };
    save();
  }

  function getPlanItems() { return (state.planItems || []).slice(); }
  function addPlanItem(it) { if (!state.planItems) state.planItems = []; it.id = 'pi_' + nextSeq(); state.planItems.push(it); save(); return it; }
  function updatePlanItem(id, patch) { var arr = state.planItems || []; for (var i = 0; i < arr.length; i++) { if (arr[i].id === id) { for (var k in patch) { if (patch.hasOwnProperty(k)) arr[i][k] = patch[k]; } } } save(); }
  function removePlanItem(id) { state.planItems = (state.planItems || []).filter(function (x) { return x.id !== id; }); save(); }
  function togglePlanItem(id) { var arr = state.planItems || []; for (var i = 0; i < arr.length; i++) { if (arr[i].id === id) arr[i].done = !arr[i].done; } save(); }

  function getMathMistakes() { return (state.mathMistakes || []).slice().sort(function (a, b) { return (a.created || '').localeCompare(b.created || ''); }); }
  function addMathMistake(m) { if (!state.mathMistakes) state.mathMistakes = []; m.id = 'mm_' + nextSeq(); state.mathMistakes.push(m); save(); return m; }
  function updateMathMistake(id, patch) { var arr = state.mathMistakes || []; for (var i = 0; i < arr.length; i++) { if (arr[i].id === id) { for (var k in patch) { if (patch.hasOwnProperty(k)) arr[i][k] = patch[k]; } } } save(); }
  function removeMathMistake(id) { state.mathMistakes = (state.mathMistakes || []).filter(function (x) { return x.id !== id; }); save(); }

  function getMathQuestions() { return (state.mathQuestions || []).slice(); }
  function addMathQuestion(q) { if (!state.mathQuestions) state.mathQuestions = []; q.id = 'mq_' + nextSeq(); state.mathQuestions.push(q); save(); return q; }
  function removeMathQuestion(id) { state.mathQuestions = (state.mathQuestions || []).filter(function (x) { return x.id !== id; }); save(); }

  function getMathStats() { return state.mathStats || {}; }
  function recordMathStat(cat, correct) { if (!state.mathStats) state.mathStats = {}; if (!state.mathStats[cat]) state.mathStats[cat] = { total: 0, correct: 0 }; state.mathStats[cat].total++; if (correct) state.mathStats[cat].correct++; save(); }

  /* ---------- 生词本（考研阅读词汇） ---------- */
  function getVocab() {
    return (state.vocab || []).slice().sort(function (a, b) { return a.added < b.added ? 1 : (a.added > b.added ? -1 : 0); });
  }
  function findVocab(word) {
    if (!word) return null;
    var lw = String(word).trim().toLowerCase();
    return (state.vocab || []).filter(function (v) { return v.word && v.word.toLowerCase() === lw; })[0] || null;
  }
  function addVocab(word, cn) {
    word = String(word || '').trim();
    if (!word) return null;
    var exist = findVocab(word);
    if (exist) { if (cn && !exist.cn) { exist.cn = cn; save(); } return exist; }
    var v = { id: 'vb_' + nextSeq(), word: word, cn: cn || '', box: 1, next: todayStr(), added: todayStr(), wrong: 0, last: '' };
    state.vocab.push(v); save(); return v;
  }
  function removeVocab(id) { state.vocab = state.vocab.filter(function (x) { return x.id !== id; }); save(); }
  function updateVocab(id, patch) {
    var arr = state.vocab || [];
    for (var i = 0; i < arr.length; i++) { if (arr[i].id === id) { for (var k in patch) { if (patch.hasOwnProperty(k)) arr[i][k] = patch[k]; } break; } }
    save();
  }
  function getDueVocab(today) {
    today = today || todayStr();
    return (state.vocab || []).filter(function (v) { return v.next <= today; });
  }

  /* ---------- 翻译密钥（用户自行申请填写，仅存本机浏览器，不内置任何 key） ---------- */
  function getTranslator() {
    return {
      appid: (state.translator && state.translator.appid) || '',
      key: (state.translator && state.translator.key) || ''
    };
  }
  function setTranslator(appid, key) {
    state.translator = {
      appid: (typeof appid === 'string') ? appid.trim() : '',
      key: (typeof key === 'string') ? key.trim() : ''
    };
    save();
  }

  /* ---------- 错词本（独立，与 vocab 分开） ---------- */
  function getWrongWords() {
    return (state.wrongWords || []).slice().sort(function (a, b) { return (a.created || '').localeCompare(b.created || ''); });
  }
  function findWrongWord(word) {
    if (!word) return null;
    var lw = String(word).trim().toLowerCase();
    return (state.wrongWords || []).filter(function (w) { return w.word && w.word.toLowerCase() === lw; })[0] || null;
  }
  function addWrongWord(word, cn, src) {
    word = String(word || '').trim();
    if (!word) return null;
    var exist = findWrongWord(word);
    if (exist) { if (cn && !exist.cn) { exist.cn = cn; save(); } return exist; }
    var w = { id: 'ww_' + nextSeq(), word: word, cn: cn || '', created: todayStr(), src: src || 'translate' };
    state.wrongWords.push(w); save(); return w;
  }
  function removeWrongWord(id) { state.wrongWords = (state.wrongWords || []).filter(function (x) { return x.id !== id; }); save(); }
  function clearWrongWords() { state.wrongWords = []; save(); }


  /* ---------- 计时器 ---------- */
  function getTimer() { return state.timer; }
  function setTimer(t) { state.timer = t; save(); }

  /* ---------- 连续打卡 ---------- */
  function hasStudy(day) { return totalMinutesForDay(day) > 0; }
  function isCheckedIn(ds) { return (state.checkins || []).indexOf(ds) >= 0; }
  function getCheckins() { return (state.checkins || []).slice(); }
  function checkin(ds) {
    ds = ds || todayStr();
    if (!isCheckedIn(ds)) { state.checkins.push(ds); save(); }
    return true;
  }
  function dayHasActivity(ds) {
    var d = state.days[ds];
    if (d && totalMinutesForDay(d) > 0) return true;
    return isCheckedIn(ds);
  }
  function consecutiveStreak() {
    var active = {};
    Object.keys(state.days).forEach(function (ds) { if (totalMinutesForDay(state.days[ds]) > 0) active[ds] = true; });
    (state.checkins || []).forEach(function (ds) { active[ds] = true; });
    var dates = Object.keys(active).sort();
    if (!dates.length) return 0;
    var last = dates[dates.length - 1];
    var today = todayStr();
    var yest = dateStr(addDays(new Date(), -1));
    if (last !== today && last !== yest) return 0;
    var streak = 0;
    var cursor = new Date(last);
    for (var i = dates.length - 1; i >= 0; i--) {
      if (dates[i] === dateStr(cursor)) { streak++; cursor = addDays(cursor, -1); } else break;
    }
    return streak;
  }

  /* ---------- 里程碑（已达成记录，用于庆祝去重） ---------- */
  function getMilestones() { return (state.milestones || []).slice(); }
  function addMilestone(id) {
    if (!state.milestones) state.milestones = [];
    if (state.milestones.indexOf(id) >= 0) return false;
    state.milestones.push(id); save();
    return true;
  }

  /* ---------- 备份 ---------- */
  function exportJSON() { return JSON.stringify(state, null, 2); }
  function importJSON(str) {
    var p = JSON.parse(str);
    var d = defaults();
    state = {
      config: (p.config && p.config.subjects) ? p.config : d.config,
      days: (p.days && typeof p.days === 'object') ? p.days : {},
      exams: (p.exams && Array.isArray(p.exams)) ? p.exams : [],
      plans: (p.plans && typeof p.plans === 'object') ? p.plans : {},
      mistakes: (p.mistakes && Array.isArray(p.mistakes)) ? p.mistakes : [],
      websites: (p.websites && Array.isArray(p.websites)) ? p.websites : [],
      vocab: (p.vocab && Array.isArray(p.vocab)) ? p.vocab : [],
      translator: (p.translator && typeof p.translator === 'object') ? { appid: String(p.translator.appid || ''), key: String(p.translator.key || '') } : { appid: '', key: '' },
      wrongWords: (p.wrongWords && Array.isArray(p.wrongWords)) ? p.wrongWords : [],
      checkins: (p.checkins && Array.isArray(p.checkins)) ? p.checkins : [],
      milestones: (p.milestones && Array.isArray(p.milestones)) ? p.milestones.slice() : [],
      moduleMastery: (p.moduleMastery && typeof p.moduleMastery === 'object') ? p.moduleMastery : {},
      subjectChapters: (p.subjectChapters && typeof p.subjectChapters === 'object') ? p.subjectChapters : {},
      mathChapters: (p.mathChapters && Array.isArray(p.mathChapters)) ? p.mathChapters : [],
      mathCurrent: (typeof p.mathCurrent === 'number') ? p.mathCurrent : -1,
      mathDone: Array.isArray(p.mathDone) ? p.mathDone.slice() : (function(){var c=typeof p.mathCurrent==='number'?p.mathCurrent:-1;var a=[];for(var i=0;i<=c;i++)a.push(i);return a;})(),
      planItems: (p.planItems && Array.isArray(p.planItems)) ? p.planItems : [],
      mathMistakes: (p.mathMistakes && Array.isArray(p.mathMistakes)) ? p.mathMistakes : [],
      mathQuestions: (p.mathQuestions && Array.isArray(p.mathQuestions)) ? p.mathQuestions : [],
      mathStats: (p.mathStats && typeof p.mathStats === 'object') ? p.mathStats : {},
        cs408Chapters: (p.cs408Chapters && Array.isArray(p.cs408Chapters)) ? p.cs408Chapters : [],
        cs408Current: (typeof p.cs408Current === 'number') ? p.cs408Current : -1,
        cs408Done: Array.isArray(p.cs408Done) ? p.cs408Done.slice() : (function(){var c=typeof p.cs408Current==='number'?p.cs408Current:-1;var a=[];for(var i=0;i<=c;i++)a.push(i);return a;})(),
        cs408Mistakes: (p.cs408Mistakes && Array.isArray(p.cs408Mistakes)) ? p.cs408Mistakes : [],
        cs408Questions: (p.cs408Questions && Array.isArray(p.cs408Questions)) ? p.cs408Questions : [],
        cs408Stats: (p.cs408Stats && typeof p.cs408Stats === 'object') ? p.cs408Stats : {},
        cs408Knowledge: (p.cs408Knowledge && Array.isArray(p.cs408Knowledge)) ? p.cs408Knowledge : [],
        cs408Years: (p.cs408Years && Array.isArray(p.cs408Years)) ? p.cs408Years : [],
        theme: (p.theme === 'dark') ? 'dark' : 'light',
        timer: (p.timer && typeof p.timer === 'object') ? p.timer : d.timer,
        mathVolume: (typeof p.mathVolume === 'string') ? p.mathVolume : d.mathVolume,
        cs408BooksCollapsed: (p.cs408BooksCollapsed && typeof p.cs408BooksCollapsed === 'object') ? p.cs408BooksCollapsed : {},
        _seq: p._seq || d._seq
      };
      save();
    }

  /* ---------- 408 专业课模块 ---------- */
  var CS408_REVIEW_INTERVALS = [1, 2, 4, 7, 15, 30]; // 错题间隔复习天数（Leitner 式）

  function get408Chapters() { return (state.cs408Chapters || []).slice(); }
  function set408Chapters(arr) { state.cs408Chapters = (arr || []).slice(); save(); }
  function get408Current() { return (typeof state.cs408Current === 'number') ? state.cs408Current : -1; }
  function set408Current(i) { state.cs408Current = (typeof i === 'number') ? i : -1; save(); }
  function get408Done() { return Array.isArray(state.cs408Done) ? state.cs408Done.slice() : []; }
  function set408Done(arr) { state.cs408Done = (arr || []).slice(); save(); }
  function toggle408Done(idx) {
    if (!Array.isArray(state.cs408Done)) state.cs408Done = [];
    var i = state.cs408Done.indexOf(idx);
    if (i >= 0) state.cs408Done.splice(i, 1); else state.cs408Done.push(idx);
    save();
  }

  function get408Mistakes() {
    return (state.cs408Mistakes || []).slice().sort(function (a, b) { return (a.created || '').localeCompare(b.created || ''); });
  }
  function add408Mistake(m) {
    if (!state.cs408Mistakes) state.cs408Mistakes = [];
    m.id = 'cm_' + nextSeq();
    m.reviewed = false; m.reviewCount = 0;
    m.nextReview = Store.dateStr(Store.addDays(new Date(), CS408_REVIEW_INTERVALS[0]));
    state.cs408Mistakes.push(m); save(); return m;
  }
  function update408Mistake(id, patch) {
    var arr = state.cs408Mistakes || [];
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].id === id) {
        if (patch.reviewed === true) {
          // 标记已回顾：推进间隔复习
          arr[i].reviewed = true;
          arr[i].reviewCount = (arr[i].reviewCount || 0) + 1;
          var idx = Math.min(CS408_REVIEW_INTERVALS.length - 1, arr[i].reviewCount);
          arr[i].nextReview = Store.dateStr(Store.addDays(new Date(), CS408_REVIEW_INTERVALS[idx]));
        } else {
          for (var k in patch) { if (patch.hasOwnProperty(k)) arr[i][k] = patch[k]; }
        }
        break;
      }
    }
    save();
  }
  function remove408Mistake(id) { state.cs408Mistakes = (state.cs408Mistakes || []).filter(function (x) { return x.id !== id; }); save(); }
  function get408DueMistakes(today) {
    today = today || todayStr();
    return (state.cs408Mistakes || []).filter(function (m) { return !m.reviewed || (m.nextReview && m.nextReview <= today); });
  }

  function get408Questions() { return (state.cs408Questions || []).slice(); }
  function add408Question(q) { if (!state.cs408Questions) state.cs408Questions = []; q.id = 'cq_' + nextSeq(); state.cs408Questions.push(q); save(); return q; }
  function remove408Question(id) { state.cs408Questions = (state.cs408Questions || []).filter(function (x) { return x.id !== id; }); save(); }

  function get408Stats() { return state.cs408Stats || {}; }
  function record408Stat(cat, correct) { if (!state.cs408Stats) state.cs408Stats = {}; if (!state.cs408Stats[cat]) state.cs408Stats[cat] = { total: 0, correct: 0 }; state.cs408Stats[cat].total++; if (correct) state.cs408Stats[cat].correct++; save(); }

  function get408Knowledge() {
    return (state.cs408Knowledge || []).slice().sort(function (a, b) { return (a.created || '').localeCompare(b.created || ''); });
  }
  function add408Knowledge(k) { if (!state.cs408Knowledge) state.cs408Knowledge = []; k.id = 'kp_' + nextSeq(); state.cs408Knowledge.push(k); save(); return k; }
  function update408Knowledge(id, patch) { var arr = state.cs408Knowledge || []; for (var i = 0; i < arr.length; i++) { if (arr[i].id === id) { for (var k in patch) { if (patch.hasOwnProperty(k)) arr[i][k] = patch[k]; } } } save(); }
  function remove408Knowledge(id) { state.cs408Knowledge = (state.cs408Knowledge || []).filter(function (x) { return x.id !== id; }); save(); }

  function get408Years() {
    return (state.cs408Years || []).slice().sort(function (a, b) { return (b.year || '').localeCompare(a.year || ''); });
  }
  function add408Year(y) { if (!state.cs408Years) state.cs408Years = []; y.id = 'yr_' + nextSeq(); state.cs408Years.push(y); save(); return y; }
  function remove408Year(id) { state.cs408Years = (state.cs408Years || []).filter(function (x) { return x.id !== id; }); save(); }

  /* ---------- 主题 ---------- */
  function getTheme() { return state.theme === 'dark' ? 'dark' : 'light'; }
  function setTheme(t) { state.theme = (t === 'dark') ? 'dark' : 'light'; save(); }

  /* ---------- 云同步：本地快照 ---------- */
  function snapshot() {
    // 返回一个纯净的 state 克隆（JSON 可序列化），用于上传云端
    return JSON.parse(JSON.stringify(state));
  }
  function restoreSnapshot(obj, opts) {
    opts = opts || {};
    if (!obj || typeof obj !== 'object') return false;
    var d = defaults();
    // 用 defaults 补齐缺失的一层字段，避免新版加载旧数据缺字段
    var next = {};
    for (var k in d) {
      if (Object.prototype.hasOwnProperty.call(d, k)) {
        next[k] = (obj[k] !== undefined) ? obj[k] : JSON.parse(JSON.stringify(d[k]));
      }
    }
    // 兼容旧版没有 nickname/config 等字段的情况
    if (next.config && typeof next.config === 'object') {
      if (d.config.nickname !== undefined && next.config.nickname === undefined) next.config.nickname = d.config.nickname;
      if (next.config.subjects === undefined) next.config.subjects = [];
    }
    state = next;
    save();
    return true;
  }
  /* 生成 8 位登录码（大写字母 + 数字，容易读） */
  function generateSyncCode() {
    var alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var s = '';
    for (var i = 0; i < 8; i++) s += alpha[Math.floor(Math.random() * alpha.length)];
    return s;
  }
  /* 浏览器本地保存最近一次的登录码（不存敏感令牌，只存用户登录码方便下次用） */
  function getLastSyncCode() {
    try { return global.localStorage.getItem(KEY + ':last_sync_code') || ''; }
    catch (_) { return ''; }
  }
  function setLastSyncCode(code) {
    try { global.localStorage.setItem(KEY + ':last_sync_code', code || ''); } catch (_) {}
  }
  function getLastSyncToken() {
    try { return global.localStorage.getItem(KEY + ':last_sync_token') || ''; }
    catch (_) { return ''; }
  }
  function setLastSyncToken(tok) {
    try { global.localStorage.setItem(KEY + ':last_sync_token', tok || ''); } catch (_) {}
  }
  function getLastDeviceId() {
    try {
      var id = global.localStorage.getItem(KEY + ':device_id');
      if (!id) {
        id = 'dev_' + Math.random().toString(36).slice(2, 10);
        global.localStorage.setItem(KEY + ':device_id', id);
      }
      return id;
    } catch (_) { return 'unknown'; }
  }

  global.Store = {
    dateStr: dateStr, addDays: addDays, todayStr: todayStr, nextSeq: nextSeq,
    getConfig: getConfig, setConfig: setConfig,
    getSubjects: getSubjects, upsertSubject: upsertSubject, removeSubject: removeSubject, updateSubjectTarget: updateSubjectTarget,
    getDay: getDay, getDays: getDays, saveDayMeta: saveDayMeta, setDayDurations: setDayDurations, addDuration: addDuration,
    totalMinutesForDay: totalMinutesForDay, resetDay: resetDay,
    addExam: addExam, removeExam: removeExam, getExams: getExams,
    getPlan: getPlan, setPlan: setPlan, addDailyPlanItem: addDailyPlanItem, updateDailyPlanItem: updateDailyPlanItem, toggleDailyPlanItem: toggleDailyPlanItem, removeDailyPlanItem: removeDailyPlanItem,
    getMistakes: getMistakes, addMistake: addMistake, removeMistake: removeMistake,
    getUserWebsites: getUserWebsites, addWebsite: addWebsite, removeWebsite: removeWebsite,
    getModuleMastery: getModuleMastery, setModuleMastery: setModuleMastery, addModule: addModule,
    getSubjectChapters: getSubjectChapters, setSubjectChapters: setSubjectChapters,
    getMathChapters: getMathChapters, setMathChapters: setMathChapters, getMathCurrent: getMathCurrent, setMathCurrent: setMathCurrent, getMathDone: getMathDone, setMathDone: setMathDone, toggleMathDone: toggleMathDone,
    getMathVolume: getMathVolume, setMathVolume: setMathVolume, getMathVolumeTemplates: getMathVolumeTemplates,
    getCs408BooksCollapsed: getCs408BooksCollapsed, setCs408BooksCollapsed: setCs408BooksCollapsed,
    getScoreWeights: getScoreWeights, setScoreWeights: setScoreWeights,
    getPlanItems: getPlanItems, addPlanItem: addPlanItem, updatePlanItem: updatePlanItem, removePlanItem: removePlanItem, togglePlanItem: togglePlanItem,
    getMathMistakes: getMathMistakes, addMathMistake: addMathMistake, updateMathMistake: updateMathMistake, removeMathMistake: removeMathMistake,
    getMathQuestions: getMathQuestions, addMathQuestion: addMathQuestion, removeMathQuestion: removeMathQuestion,
    getMathStats: getMathStats, recordMathStat: recordMathStat,
    get408Chapters: get408Chapters, set408Chapters: set408Chapters, get408Current: get408Current, set408Current: set408Current, get408Done: get408Done, set408Done: set408Done, toggle408Done: toggle408Done,
    get408Mistakes: get408Mistakes, add408Mistake: add408Mistake, update408Mistake: update408Mistake, remove408Mistake: remove408Mistake, get408DueMistakes: get408DueMistakes,
    get408Questions: get408Questions, add408Question: add408Question, remove408Question: remove408Question,
    get408Stats: get408Stats, record408Stat: record408Stat,
    get408Knowledge: get408Knowledge, add408Knowledge: add408Knowledge, update408Knowledge: update408Knowledge, remove408Knowledge: remove408Knowledge,
    get408Years: get408Years, add408Year: add408Year, remove408Year: remove408Year,
    getTheme: getTheme, setTheme: setTheme,
    exportJSON: exportJSON, importJSON: importJSON,
    getVocab: getVocab, findVocab: findVocab, addVocab: addVocab, removeVocab: removeVocab, updateVocab: updateVocab, getDueVocab: getDueVocab,
    getTranslator: getTranslator, setTranslator: setTranslator,
    getWrongWords: getWrongWords, findWrongWord: findWrongWord, addWrongWord: addWrongWord, removeWrongWord: removeWrongWord, clearWrongWords: clearWrongWords,
    getTimer: getTimer, setTimer: setTimer,
    consecutiveStreak: consecutiveStreak, isCheckedIn: isCheckedIn, getCheckins: getCheckins, checkin: checkin,
    getMilestones: getMilestones, addMilestone: addMilestone,
    save: save,
    setOnSave: setOnSave,
    // 云同步
    snapshot: snapshot, restoreSnapshot: restoreSnapshot,
    generateSyncCode: generateSyncCode,
    getLastSyncCode: getLastSyncCode, setLastSyncCode: setLastSyncCode,
    getLastSyncToken: getLastSyncToken, setLastSyncToken: setLastSyncToken,
    getLastDeviceId: getLastDeviceId
  };
})(typeof window !== 'undefined' ? window : this);