/* =========================================================================
 * 考研学习 Hub —— Cloudflare Pages Worker（云同步后端）
 *
 * 路由：
 *   GET    /api/sync      → 读取登录码对应的云端备份
 *   PUT    /api/sync      → 写入该登录码的云端备份
 *   DELETE /api/sync      → 删除该登录码的云端备份
 *   OPTIONS *             → 预检
 *   其他                  → Pages 静态资源（由 Pages 处理，这里兜底 404）
 *
 * 安全（两级鉴权）：
 *   第一级 —— 全局令牌 SYNC_TOKEN（环境变量）：防止未授权用户随意读写 KV。
 *             前端在请求头携带：X-Sync-Token: <SYNC_TOKEN> 或 Authorization: Bearer <SYNC_TOKEN>
 *             没设置环境变量时，仅用登录码区分存储 Key（纯自用可接受，部署后强烈建议设置）。
 *   第二级 —— 用户级登录码 Sync Key：
 *             前端生成并保管，放在请求头 X-Sync-Key: <用户登录码>
 *             KV 里实际存储键 = "kyds:" + Sanitize(登录码)
 *             用户用同一登录码跨设备访问时，能取到同一个数据快照。
 *
 * 绑定：
 *   KV 命名空间默认 HUB_SYNC（在 wrangler.toml 里绑定 binding=HUB_SYNC）
 *
 * 存值结构（KV）：
 *   kyds:<safeKey>            = JSON.stringify(DATA) —— 实际快照
 *   kyds:<safeKey>:version    = string  —— 写时递增版本（设备冲突对比用）
 *   kyds:<safeKey>:meta       = JSON.stringify({ device, updatedAt })
 * ========================================================================= */

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const KV_PREFIX = 'kyds';

function getEnvStr(env, name, fallback) {
  if (env && typeof env[name] === 'string' && env[name]) return env[name];
  const g = globalThis && globalThis[name];
  return (typeof g === 'string' && g) ? g : (fallback || '');
}
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
    'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Sync-Token, X-Sync-Key, X-Sync-Device',
    'Access-Control-Expose-Headers': 'X-Sync-Version'
  };
}
function jsonResponse(status, obj, extraHeaders) {
  const h = Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, extraHeaders || {});
  return new Response(JSON.stringify(obj), { status, headers: h });
}

/* ---------- 第一级：SYNC_TOKEN 鉴权 ---------- */
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

/* ---------- 第二级：Sync Key（用户登录码）→ KV 键 ---------- */
function readSafeSyncKey(req) {
  const raw = (req.headers.get('X-Sync-Key') || '').trim();
  if (!raw) return '';
  const safe = String(raw).slice(0, 96).replace(/[^A-Za-z0-9_\-]/g, '_');
  return safe;
}
function getKv(env) {
  const binding = getEnvStr(env, 'KV_BINDING_NAME', 'HUB_SYNC');
  return env && env[binding] ? env[binding] : null;
}

/* ---------- GET /api/sync ---------- */
async function handleSyncGet(env, req) {
  const denied = checkGlobalToken(env, req);
  if (denied) return denied;
  const kv = getKv(env);
  if (!kv) return jsonResponse(500, { error: 'KV 命名空间未绑定。请先在 wrangler.toml 配 binding: HUB_SYNC 的 id。' });
  const safe = readSafeSyncKey(req);
  if (!safe) return jsonResponse(400, { error: '缺少登录码。请携带 X-Sync-Key 头。' });

  const key = KV_PREFIX + ':' + safe;
  try {
    const [payload, version, meta] = await Promise.all([
      kv.get(key, 'text'),
      kv.get(key + ':version', 'text'),
      kv.get(key + ':meta', 'text')
    ]);
    const metaObj = (() => { try { return meta ? JSON.parse(meta) : null; } catch (_) { return null; } })();
    const body = {
      data: payload ? JSON.parse(payload) : null,
      version: version || '',
      meta: metaObj
    };
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
  const kv = getKv(env);
  if (!kv) return jsonResponse(500, { error: 'KV 命名空间未绑定。' });
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

  const version = String(r.version || Date.now() + ':' + Math.random().toString(36).slice(2, 8));
  const device = String(r.device || req.headers.get('X-Sync-Device') || 'browser');
  const key = KV_PREFIX + ':' + safe;
  const meta = JSON.stringify({ device, updatedAt: new Date().toISOString() });

  try {
    await Promise.all([
      kv.put(key, JSON.stringify(r.data)),
      kv.put(key + ':version', version),
      kv.put(key + ':meta', meta)
    ]);
  } catch (e) {
    return jsonResponse(500, { error: '写入 KV 失败：' + (e && e.message || String(e)) });
  }
  return jsonResponse(200, { ok: true, version }, { 'X-Sync-Version': version });
}

/* ---------- DELETE /api/sync ---------- */
async function handleSyncDelete(env, req) {
  const denied = checkGlobalToken(env, req);
  if (denied) return denied;
  const kv = getKv(env);
  if (!kv) return jsonResponse(500, { error: 'KV 命名空间未绑定。' });
  const safe = readSafeSyncKey(req);
  if (!safe) return jsonResponse(400, { error: '缺少登录码 X-Sync-Key。' });

  const key = KV_PREFIX + ':' + safe;
  try {
    await Promise.all([
      kv.delete(key),
      kv.delete(key + ':version'),
      kv.delete(key + ':meta')
    ]);
  } catch (e) {
    return jsonResponse(500, { error: '删除失败：' + (e && e.message || String(e)) });
  }
  return jsonResponse(200, { ok: true });
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

    // 静态路径由 Pages 处理；这里兜底一个健康检查
    if (path === '/api/health') {
      return jsonResponse(200, { ok: true, service: 'kaoyan-study-hub', time: new Date().toISOString() }, cors);
    }
    // 静态路径交给 Pages 静态资源处理器
    if (env && env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    // 兜底：没有 ASSETS 绑定时返回 404 JSON
    return jsonResponse(404, { error: 'Not Found. Endpoints: GET/PUT/DELETE /api/sync, GET /api/health' }, cors);
  }
};
