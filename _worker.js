/* =========================================================================
 * 考研学习 Hub —— Cloudflare Pages Worker（云同步后端 + AI 中转）
 *
 * 路由：
 *   GET    /api/sync      → 读取登录码（手机号）对应的云端备份
 *   PUT    /api/sync      → 写入该登录码的云端备份
 *   DELETE /api/sync      → 删除该登录码的云端备份
 *   POST   /api/ai        → AI 中转（OpenAI 兼容接口，key 由前端放 X-AI-Key 头）
 *   OPTIONS *             → 预检
 *   其他                  → Pages 静态资源（由 Pages 处理，这里兜底 404）
 *
 * 存储后端：JSONBin（https://jsonbin.io）
 *   - 不再依赖 Cloudflare KV（在 Git 部署模式下 KV 绑定无法生效）。
 *   - 主密钥存在环境变量 JSONBIN_KEY 中（机密，绝不明文写进代码 / 仓库）。
 *   - 目录 bin（META_BIN_ID）保存 { phones: { "<手机号>": "<数据binId>" } }。
 *   - 每个手机号一个独立数据 bin，内容为 { data, version, meta:{device,updatedAt} }。
 *
 * 安全（两级鉴权）：
 *   第一级 —— 全局令牌 SYNC_TOKEN（环境变量，可选）：未设置则跳过。
 *   第二级 —— 用户级登录码（手机号）：放在请求头 X-Sync-Key。
 *
 * 前端协议（与 app.js syncApi 保持一致）：
 *   GET  /api/sync  (头 X-Sync-Key:手机号)  → { data, version, meta }
 *   PUT  /api/sync  (头 X-Sync-Key + body {syncCode,deviceId,data}) → { ok, version }
 * ========================================================================= */

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const JSONBIN_API = 'https://api.jsonbin.io/v3';
const META_BIN_ID = '6a801b84f5f4af5e29192747'; // kaoyan-dir：手机号→数据binId 映射

function getEnvStr(env, name, fallback) {
  if (env && typeof env[name] === 'string' && env[name]) return env[name];
  const g = globalThis && globalThis[name];
  return (typeof g === 'string' && g) ? g : (fallback || '');
}
function getJsonbinKey(env) { return getEnvStr(env, 'JSONBIN_KEY', ''); }
function splitOrigins(s) { return (s || '').split(',').map(x => x.trim()).filter(Boolean); }
function pickCorsOrigin(env, reqOrigin) {
  const list = splitOrigins(getEnvStr(env, 'CORS_ORIGINS', '*'));
  if (!list.length) return '*';
  if (list.includes('*')) return '*';
  return list.includes(reqOrigin) ? reqOrigin : (list[0] || '');
}
function baseCorsHeaders(env, reqOrigin) {
  return {
    'Access-Control-Allow-Origin': pickCorsOrigin(env, reqOrigin),
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET, PUT, DELETE, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Sync-Token, X-Sync-Key, X-Sync-Device, X-AI-Key',
    'Access-Control-Expose-Headers': 'X-Sync-Version'
  };
}
function jsonResponse(status, obj, extraHeaders) {
  const h = Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, extraHeaders || {});
  return new Response(JSON.stringify(obj), { status, headers: h });
}

/* ---------- 第一级：SYNC_TOKEN 鉴权（可选） ---------- */
function checkGlobalToken(env, req) {
  const expected = getEnvStr(env, 'SYNC_TOKEN', '');
  if (!expected) return null;
  const head1 = req.headers.get('X-Sync-Token') || '';
  const auth = req.headers.get('Authorization') || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const got = head1 || bearer;
  if (!got || got !== expected) {
    return jsonResponse(403, { error: 'SYNC_TOKEN 未提供或不匹配，请联系管理员获取同步令牌。' });
  }
  return null;
}

/* ---------- 第二级：Sync Key（手机号）→ 目录键 ---------- */
function readSafeSyncKey(req) {
  const raw = (req.headers.get('X-Sync-Key') || '').trim();
  if (!raw) return '';
  const safe = String(raw).slice(0, 96).replace(/[^A-Za-z0-9_\-]/g, '_');
  return safe;
}

/* ---------- JSONBin 封装（带 429 重试+退避） ---------- */
async function jsonbinFetch(path, init) {
  init = init || {};
  let attempt = 0;
  const maxAttempt = 3;
  while (true) {
    const r = await fetch(JSONBIN_API + path, init);
    // JSONBin 免费额度偶发 429，退避重试（1s/2s/3s）后自愈
    if (r.status === 429 && attempt < maxAttempt) {
      attempt++;
      await new Promise(function (res) { setTimeout(res, 1000 * attempt); });
      continue;
    }
    return r;
  }
}
async function jsonbinGet(binId, key) {
  const r = await jsonbinFetch('/b/' + binId, { headers: { 'X-Master-Key': key } });
  if (!r.ok) throw new Error('JSONBin GET /b/' + binId + ' -> ' + r.status);
  const j = await r.json();
  return (j && j.record) || null;
}
async function jsonbinPut(binId, data, key) {
  const r = await jsonbinFetch('/b/' + binId, {
    method: 'PUT',
    headers: { 'X-Master-Key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!r.ok) throw new Error('JSONBin PUT /b/' + binId + ' -> ' + r.status);
  return r.json();
}
async function jsonbinCreate(data, key, name) {
  const r = await jsonbinFetch('/b', {
    method: 'POST',
    headers: { 'X-Master-Key': key, 'Content-Type': 'application/json', 'X-Bin-Name': name || 'kaoyan-data' },
    body: JSON.stringify(data)
  });
  if (!r.ok) throw new Error('JSONBin POST /b -> ' + r.status);
  const j = await r.json();
  return j.metadata && j.metadata.id;
}
async function jsonbinDelete(binId, key) {
  const r = await jsonbinFetch('/b/' + binId, { method: 'DELETE', headers: { 'X-Master-Key': key } });
  if (!r.ok) throw new Error('JSONBin DELETE /b/' + binId + ' -> ' + r.status);
  return r.json();
}

/* ---------- GET /api/sync ---------- */
async function handleSyncGet(env, req) {
  const denied = checkGlobalToken(env, req);
  if (denied) return denied;
  const key = getJsonbinKey(env);
  if (!key) return jsonResponse(500, { error: 'JSONBIN_KEY 环境变量未配置。请在 Cloudflare Pages 后台 Settings → 变量与密钥（Variables and Secrets）添加名为 JSONBIN_KEY 的「机密（Secret）」。' });
  const safe = readSafeSyncKey(req);
  if (!safe) return jsonResponse(400, { error: '缺少登录码 X-Sync-Key。' });

  try {
    const meta = await jsonbinGet(META_BIN_ID, key);
    const phones = (meta && meta.phones) || {};
    const dataBinId = phones[safe];
    if (!dataBinId) return jsonResponse(200, { data: null, version: '', meta: null });
    const rec = await jsonbinGet(dataBinId, key);
    const version = (rec && rec.version) || '';
    const body = { data: (rec && rec.data) || null, version, meta: (rec && rec.meta) || null };
    const headers = {};
    if (version) headers['X-Sync-Version'] = version;
    return jsonResponse(200, body, headers);
  } catch (e) {
    return jsonResponse(500, { error: '读取失败：' + (e && e.message || String(e)) });
  }
}

/* ---------- PUT /api/sync ---------- */
async function handleSyncPut(env, req) {
  const denied = checkGlobalToken(env, req);
  if (denied) return denied;
  const key = getJsonbinKey(env);
  if (!key) return jsonResponse(500, { error: 'JSONBIN_KEY 环境变量未配置。' });
  const len = Number(req.headers.get('Content-Length') || 0);
  if (len > MAX_BODY_BYTES) return jsonResponse(413, { error: '请求体过大（限 2MB）' });

  let r;
  try {
    const ab = await req.arrayBuffer();
    if (ab.byteLength > MAX_BODY_BYTES) return jsonResponse(413, { error: '请求体过大（限 2MB）' });
    r = JSON.parse(new TextDecoder('utf-8').decode(ab) || '{}');
  } catch (_) {
    return jsonResponse(400, { error: '请求体 JSON 解析失败' });
  }

  if (!r || typeof r.data !== 'object' || r.data === null) {
    return jsonResponse(400, { error: '请求体必须形如 { data: {...}, version?: string, device?: string }' });
  }
  const safe = readSafeSyncKey(req);
  if (!safe) return jsonResponse(400, { error: '缺少登录码 X-Sync-Key。' });

  const version = String(r.version || (Date.now() + ':' + Math.random().toString(36).slice(2, 8)));
  const device = String(r.deviceId || r.device || req.headers.get('X-Sync-Device') || 'browser');
  const updatedAt = new Date().toISOString();
  const record = { data: r.data, version, meta: { device, updatedAt } };

  try {
    let meta = await jsonbinGet(META_BIN_ID, key);
    if (!meta || typeof meta !== 'object') meta = { phones: {} };
    if (!meta.phones) meta.phones = {};
    let dataBinId = meta.phones[safe];
    if (!dataBinId) {
      dataBinId = await jsonbinCreate(record, key, 'kaoyan-' + safe);
      meta.phones[safe] = dataBinId;
      await jsonbinPut(META_BIN_ID, meta, key);
    } else {
      // 乐观并发控制：若客户端携带 baseVersion（上次 GET 拿到的版本）与云端当前版本不一致，
      // 说明该数据在客户端的版本之后已被其他设备修改过——返回 409 冲突，禁止静默整库覆盖。
      const curRec = await jsonbinGet(dataBinId, key);
      const curVersion = (curRec && curRec.version) || '';
      if (r.baseVersion && curVersion && r.baseVersion !== curVersion) {
        return jsonResponse(409, { error: 'conflict', currentVersion: curVersion }, { 'X-Sync-Version': curVersion });
      }
      await jsonbinPut(dataBinId, record, key);
    }
    return jsonResponse(200, { ok: true, version }, { 'X-Sync-Version': version });
  } catch (e) {
    return jsonResponse(500, { error: '写入失败：' + (e && e.message || String(e)) });
  }
}

/* ---------- DELETE /api/sync ---------- */
async function handleSyncDelete(env, req) {
  const denied = checkGlobalToken(env, req);
  if (denied) return denied;
  const key = getJsonbinKey(env);
  if (!key) return jsonResponse(500, { error: 'JSONBIN_KEY 环境变量未配置。' });
  const safe = readSafeSyncKey(req);
  if (!safe) return jsonResponse(400, { error: '缺少登录码 X-Sync-Key。' });

  try {
    const meta = await jsonbinGet(META_BIN_ID, key);
    const phones = (meta && meta.phones) || {};
    const dataBinId = phones[safe];
    if (dataBinId) {
      await jsonbinDelete(dataBinId, key);
      delete phones[safe];
      await jsonbinPut(META_BIN_ID, meta, key);
    }
    return jsonResponse(200, { ok: true });
  } catch (e) {
    return jsonResponse(500, { error: '删除失败：' + (e && e.message || String(e)) });
  }
}

/* ---------- POST /api/ai：AI 中转（OpenAI 兼容，key 从 X-AI-Key 头读取） ---------- */
const AI_MAX_TOKENS = 4096;
async function handleAiProxy(env, req) {
  const key = (req.headers.get('X-AI-Key') || '').trim();
  if (!key) return jsonResponse(400, { error: '缺少 X-AI-Key 请求头（AI Key 未配置）' });

  const len = Number(req.headers.get('Content-Length') || 0);
  if (len > MAX_BODY_BYTES) return jsonResponse(413, { error: '请求体过大（限 2MB）' });

  let r;
  try {
    const ab = await req.arrayBuffer();
    if (ab.byteLength > MAX_BODY_BYTES) return jsonResponse(413, { error: '请求体过大（限 2MB）' });
    r = JSON.parse(new TextDecoder('utf-8').decode(ab) || '{}');
  } catch (_) {
    return jsonResponse(400, { error: '请求体 JSON 解析失败' });
  }

  const baseUrl = String(r.baseUrl || '').trim().replace(/\/+$/, '');
  const model = String(r.model || '').trim();
  const messages = Array.isArray(r.messages) ? r.messages : null;
  if (!/^https?:\/\//i.test(baseUrl)) return jsonResponse(400, { error: 'baseUrl 必须是 http(s) 地址' });
  if (!model) return jsonResponse(400, { error: '缺少 model' });
  if (!messages || !messages.length) return jsonResponse(400, { error: '缺少 messages' });

  const body = { model: model, messages: messages };
  if (r.max_tokens) body.max_tokens = Math.max(1, Math.min(Number(r.max_tokens) || 1024, AI_MAX_TOKENS));
  if (typeof r.temperature === 'number') body.temperature = r.temperature;

  try {
    const upstream = await fetch(baseUrl + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + key
      },
      body: JSON.stringify(body)
    });
    const text = await upstream.text();
    const ctype = upstream.headers.get('Content-Type') || 'application/json';
    return new Response(text, { status: upstream.status, headers: { 'Content-Type': ctype } });
  } catch (e) {
    return jsonResponse(502, { error: '上游请求失败：' + (e && e.message || String(e)) });
  }
}

export default {
  async fetch(request, env, ctx) {
    const reqOrigin = request.headers.get('origin') || '';
    const cors = baseCorsHeaders(env, reqOrigin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    const url = new URL(request.url);
    const path = url.pathname;

    // 仅处理 /api/sync 前缀
    if (path === '/api/sync' || path.startsWith('/api/sync/')) {
      let resp;
      if (request.method === 'GET') resp = await handleSyncGet(env, request);
      else if (request.method === 'PUT') resp = await handleSyncPut(env, request);
      else if (request.method === 'DELETE') resp = await handleSyncDelete(env, request);
      else resp = jsonResponse(405, { error: 'Method Not Allowed (GET/PUT/DELETE /api/sync)' });

      for (const [k, v] of Object.entries(cors)) {
        if (!resp.headers.has(k)) resp.headers.set(k, v);
      }
      return resp;
    }

    // AI 中转
    if (path === '/api/ai' && request.method === 'POST') {
      const resp = await handleAiProxy(env, request);
      for (const [k, v] of Object.entries(cors)) {
        if (!resp.headers.has(k)) resp.headers.set(k, v);
      }
      return resp;
    }

    // 静态路径由 Pages 处理；这里兜底一个健康检查
    if (path === '/api/health') {
      return jsonResponse(200, { ok: true, service: 'kaoyan-study-hub', storage: 'jsonbin', time: new Date().toISOString() }, cors);
    }
    // 静态路径交给 Pages 静态资源处理器
    if (env && env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    // 兜底：没有 ASSETS 绑定时返回 404 JSON
    return jsonResponse(404, { error: 'Not Found. Endpoints: GET/PUT/DELETE /api/sync, POST /api/ai, GET /api/health' }, cors);
  }
};
