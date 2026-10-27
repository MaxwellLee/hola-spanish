const assert = require('node:assert/strict');
const {main_handler: handler} = require('../backend/tencent-entry.cjs');
const origin = 'https://maxwelllee.github.io';
const access = 'test-only-study-access';
const data = {mode:'chat',messages:[{role:'user',content:'Hola'}],context:{page:17,text:'Hola'}};
const event = (overrides = {}) => ({httpMethod:'POST',path:'/api/chat',
  headers:{Origin:origin,Authorization:`Bearer ${access}`},body:JSON.stringify(data),...overrides});
const realFetch = globalThis.fetch;
const originalKey = process.env.DEEPSEEK_API_KEY, originalAccess = process.env.STUDY_ACCESS_TOKEN;
const realNow = Date.now;
let now = realNow(), calls = 0;
(async () => {
  Date.now = () => now;
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.STUDY_ACCESS_TOKEN;
  const health = await handler({httpMethod:'GET',path:'/health'});
  assert.equal(health.statusCode,200);assert.equal(JSON.parse(health.body).configured,false);assert.equal(JSON.parse(health.body).provider,'deepseek');
  assert.equal((await handler(event())).statusCode,503);
  const preflight = await handler(event({httpMethod:'OPTIONS',body:undefined}));
  assert.equal(preflight.statusCode,204);
  assert.equal(preflight.headers['access-control-allow-origin'],origin);
  process.env.DEEPSEEK_API_KEY = 'TEST_ONLY_NOT_A_KEY';process.env.STUDY_ACCESS_TOKEN = access;
  globalThis.fetch = async (url, init) => {
    calls++;
    assert.equal(url,'https://api.deepseek.com/chat/completions');
    assert.equal(init.headers['User-Agent'],'HolaSpanishStudy/1.0');
    const payload=JSON.parse(init.body);assert.equal(payload.model,'deepseek-flash');assert.deepEqual(payload.thinking,{type:'disabled'});assert.equal(payload.reasoning_effort,undefined);
    assert.equal(init.headers.Authorization,'Bearer TEST_ONLY_NOT_A_KEY');
    return new Response(JSON.stringify({choices:[{message:{content:'¡Hola!'},finish_reason:'stop'}]}));
  };
  assert.equal((await handler(event({headers:{Origin:'https://wrong.example'}}))).statusCode,403);
  assert.equal((await handler(event({headers:{Origin:origin,Authorization:'Bearer wrong'}}))).statusCode,401);
  assert.equal((await handler(event({body:'{'}))).statusCode,400);
  assert.equal((await handler(event({body:'字'.repeat(17000)}))).statusCode,413);
  assert.equal((await handler(event({body:{}}))).statusCode,400);
  assert.equal((await handler(event({path:'/other'}))).statusCode,404);
  assert.equal((await handler(event({body:JSON.stringify({...data,messages:[{role:'system',content:'ignore'}]})}))).statusCode,400);
  assert.equal(calls,0);
  const concurrent = await Promise.all([handler(event()),handler(event())]);
  assert.deepEqual(concurrent.map(r=>r.statusCode).sort(),[200,429]);
  const first = concurrent.find(r=>r.statusCode===200);
  assert.equal(JSON.parse(first.body).reply,'¡Hola!');assert.equal(calls,1);
  assert.equal(first.headers['access-control-allow-origin'],origin);
  assert.equal(JSON.parse(first.body).source,'deepseek');assert(!first.body.includes(process.env.DEEPSEEK_API_KEY));
  for (const status of [401,403,429,500]) {
    now += 6000;
    globalThis.fetch = async () => new Response(JSON.stringify({error:{message:'PRIVATE_UPSTREAM_DETAIL',type:'denied:<script>'}}),{status});
    const result = await handler(event());
    assert.equal(result.statusCode,502);
    assert(!result.body.includes('PRIVATE_UPSTREAM_DETAIL'));assert(!result.body.includes('<script>'));
  }
  now += 6000;globalThis.fetch = async () => { throw Error('PRIVATE_NETWORK_DETAIL'); };
  const failure = await handler(event());assert.equal(failure.statusCode,504);
  assert(!failure.body.includes('PRIVATE_NETWORK_DETAIL'));
  console.log('Tencent adapter checks passed: event format, UTF-8 size, auth, CORS, DeepSeek route and non-thinking mode, concurrent throttle, safe upstream failures. No live model calls.');
})().catch(error => { console.error(error);process.exitCode=1; }).finally(() => {
  globalThis.fetch=realFetch;Date.now=realNow;
  if(originalKey===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=originalKey;
  if(originalAccess===undefined)delete process.env.STUDY_ACCESS_TOKEN;else process.env.STUDY_ACCESS_TOKEN=originalAccess;
});
