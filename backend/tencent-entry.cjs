// Tencent SCF event function entry. The upload package renames this file to index.js.
const workerModule = import('./worker.mjs');
let usage;
let queue = Promise.resolve();

// shortcut: SCF instance memory resets on cold start. A durable shared store is
// required before treating this counter as a hard daily or account-wide limit.
const state = {storage: {transaction(fn) {
  const result = queue.then(() => fn({
    get: async () => structuredClone(usage),
    put: async (_key, value) => { usage = structuredClone(value); }
  }));
  queue = result.catch(() => {});
  return result;
}}};

exports.main_handler = async function(event) {
  const env = {
    ALLOWED_ORIGIN: 'https://maxwelllee.github.io',
    AI_PROVIDER: 'deepseek',
    DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL || 'deepseek-flash',
    DAILY_REQUEST_LIMIT: '100',
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
    STUDY_ACCESS_TOKEN: process.env.STUDY_ACCESS_TOKEN
  };
  const output = (statusCode, data) => ({statusCode, headers: {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'
  }, body: JSON.stringify(data)});
  const method = String(event?.httpMethod || '').toUpperCase();
  const path = event?.path;
  if (method === 'GET' && (path === '/' || path === '/health')) {
    return output(200, {ok: true, service: 'hola-luna-tencent',
      provider:env.AI_PROVIDER,model:env.DEEPSEEK_MODEL,
      configured: Boolean(env.DEEPSEEK_API_KEY && env.STUDY_ACCESS_TOKEN?.length >= 16)});
  }
  let request;
  try {
    if (typeof path !== 'string' || !path.startsWith('/') ||
        (event.body != null && typeof event.body !== 'string')) throw Error();
    const headers = new Headers(event.headers || {});
    if (typeof event.body === 'string' && Buffer.byteLength(event.body, 'utf8') > 48000) {
      const response = output(413, {error: '请求内容过长。'});
      if (headers.get('Origin') === env.ALLOWED_ORIGIN) {
        response.headers['Access-Control-Allow-Origin'] = env.ALLOWED_ORIGIN;
        response.headers.Vary = 'Origin';
      }
      return response;
    }
    request = new Request(`https://scf.internal${path}`, {
      method, headers, ...(method === 'POST' ? {body: event.body || ''} : {})
    });
  } catch {
    return output(400, {error: '请求格式无效。请使用函数 URL，或按部署说明设置测试事件。'});
  }
  try {
    const {default: worker, StudyQuota} = await workerModule;
    env.STUDY_QUOTA = {
      idFromName: () => 'household',
      get: () => new StudyQuota(state, env)
    };
    const response = await worker.fetch(request, env);
    return {statusCode: response.status, headers: Object.fromEntries(response.headers),
      body: await response.text()};
  } catch {
    return output(503, {error: '学习伙伴暂不可用，请检查函数配置后重试。'});
  }
};
