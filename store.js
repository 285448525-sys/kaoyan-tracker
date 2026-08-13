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

  function defaults() {
    return {
      config: {
        major: '',
        examDate: '',
        targetTotal: 0,
        autoPlan: false,
        subjects: [],
        sidebarCollapsed: false
      },
      days: {},   // 'YYYY-MM-DD' -> {durations:{key:min}, completed:'', summary:'', note:''}
      exams: [],  // {id,name,date,scores:{key:score},total}
      plans: {},  // 'YYYY-MM-DD' -> [{id,text,minutes,done}]
      mistakes: [], // {id,type,content,subject,date,note}
      websites: [], // {id,name,url,cat}
      vocab: [],    // {id,word,cn,box,next,added,wrong,last}
      translator: { appid: '', key: '' }, // 百度翻译开放平台密钥（用户自行申请的 APP ID + 密钥）；仅存本机浏览器，不内置任何 key、不上传服务器
      wrongWords: [], // 错词本（独立）{id,word,cn,created,src}
      checkins: [], // ['YYYY-MM-DD', ...] 显式打卡日（用于连续学习提醒）
      moduleMastery: {},     // { 模块名: '已掌握'|'进行中'|'未开始' }
      subjectChapters: {},   // { 科目key: { chapters:[章名...], current: index } }
      mathChapters: [],      // 数学全部章节（字符串数组，初始化预填）
      mathCurrent: -1,       // 数学当前学到章节 index
      planItems: [],         // 整体学习计划 [{id,text,note,done,subject,chapter}]
      mathMistakes: [],      // 数学错题 [{id,category,content,note,created,reviewed}]
      mathQuestions: [],     // 用户自定义选择题 [{id,category,q,options,answer,explain}]
      mathStats: {},         // { 分类: {total, correct} }
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
      return {
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
        moduleMastery: (p.moduleMastery && typeof p.moduleMastery === 'object') ? p.moduleMastery : {},
        subjectChapters: (p.subjectChapters && typeof p.subjectChapters === 'object') ? p.subjectChapters : {},
        mathChapters: (p.mathChapters && Array.isArray(p.mathChapters)) ? p.mathChapters : [],
        mathCurrent: (typeof p.mathCurrent === 'number') ? p.mathCurrent : -1,
        planItems: (p.planItems && Array.isArray(p.planItems)) ? p.planItems : [],
        mathMistakes: (p.mathMistakes && Array.isArray(p.mathMistakes)) ? p.mathMistakes : [],
        mathQuestions: (p.mathQuestions && Array.isArray(p.mathQuestions)) ? p.mathQuestions : [],
        mathStats: (p.mathStats && typeof p.mathStats === 'object') ? p.mathStats : {},
        timer: (p.timer && typeof p.timer === 'object') ? p.timer : d.timer,
        _seq: p._seq || d._seq
      };
    } catch (e) {
      console.warn('[Store] 读取失败，使用默认数据', e);
      return defaults();
    }
  }

  function save() {
    try { global.localStorage.setItem(KEY, JSON.stringify(state)); return true; }
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

  function getSubjectChapters(key) { return state.subjectChapters ? state.subjectChapters[key] || null : null; }
  function setSubjectChapters(key, obj) { if (!state.subjectChapters) state.subjectChapters = {}; state.subjectChapters[key] = obj; save(); }

  function getMathChapters() { return (state.mathChapters || []).slice(); }
  function setMathChapters(arr) { state.mathChapters = (arr || []).slice(); save(); }
  function getMathCurrent() { return (typeof state.mathCurrent === 'number') ? state.mathCurrent : -1; }
  function setMathCurrent(i) { state.mathCurrent = (typeof i === 'number') ? i : -1; save(); }

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
      moduleMastery: (p.moduleMastery && typeof p.moduleMastery === 'object') ? p.moduleMastery : {},
      subjectChapters: (p.subjectChapters && typeof p.subjectChapters === 'object') ? p.subjectChapters : {},
      mathChapters: (p.mathChapters && Array.isArray(p.mathChapters)) ? p.mathChapters : [],
      mathCurrent: (typeof p.mathCurrent === 'number') ? p.mathCurrent : -1,
      planItems: (p.planItems && Array.isArray(p.planItems)) ? p.planItems : [],
      mathMistakes: (p.mathMistakes && Array.isArray(p.mathMistakes)) ? p.mathMistakes : [],
      mathQuestions: (p.mathQuestions && Array.isArray(p.mathQuestions)) ? p.mathQuestions : [],
      mathStats: (p.mathStats && typeof p.mathStats === 'object') ? p.mathStats : {},
      timer: (p.timer && typeof p.timer === 'object') ? p.timer : d.timer,
      _seq: p._seq || d._seq
    };
    save();
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
    getMathChapters: getMathChapters, setMathChapters: setMathChapters, getMathCurrent: getMathCurrent, setMathCurrent: setMathCurrent,
    getPlanItems: getPlanItems, addPlanItem: addPlanItem, updatePlanItem: updatePlanItem, removePlanItem: removePlanItem, togglePlanItem: togglePlanItem,
    getMathMistakes: getMathMistakes, addMathMistake: addMathMistake, updateMathMistake: updateMathMistake, removeMathMistake: removeMathMistake,
    getMathQuestions: getMathQuestions, addMathQuestion: addMathQuestion, removeMathQuestion: removeMathQuestion,
    getMathStats: getMathStats, recordMathStat: recordMathStat,
    getVocab: getVocab, findVocab: findVocab, addVocab: addVocab, removeVocab: removeVocab, updateVocab: updateVocab, getDueVocab: getDueVocab,
    getTranslator: getTranslator, setTranslator: setTranslator,
    getWrongWords: getWrongWords, findWrongWord: findWrongWord, addWrongWord: addWrongWord, removeWrongWord: removeWrongWord, clearWrongWords: clearWrongWords,
    getTimer: getTimer, setTimer: setTimer,
    consecutiveStreak: consecutiveStreak, isCheckedIn: isCheckedIn, getCheckins: getCheckins, checkin: checkin,
    exportJSON: exportJSON, importJSON: importJSON,
    save: save
  };
})(typeof window !== 'undefined' ? window : this);
