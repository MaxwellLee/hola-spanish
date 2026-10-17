const assert=require('node:assert/strict');
const {execFileSync,spawn}=require('node:child_process');
const {chromium,devices}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.PREVIEW_URL||'http://127.0.0.1:8765/';
const originalCSS=execFileSync('git',['show','e00a9df:site/styles.css'],{encoding:'utf8'});
(async()=>{
  let server;
  if(!process.env.PREVIEW_URL){
    try{await fetch(base,{signal:AbortSignal.timeout(1000)});}catch{
      server=spawn('python',['-m','http.server','8765','--bind','127.0.0.1','--directory','site'],{windowsHide:true,stdio:'ignore'});
      await new Promise((resolve,reject)=>{server.once('spawn',resolve);server.once('error',reject);});
      for(let attempt=0;attempt<30;attempt++){
        try{await fetch(base,{signal:AbortSignal.timeout(500)});break;}catch{await new Promise(resolve=>setTimeout(resolve,100));}
      }
    }
  }
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    for(const [name,device] of [['desktop-short',{viewport:{width:1366,height:650}}],['iphone',devices['iPhone 13']],['iphone-small',{...devices['iPhone SE'],viewport:{width:320,height:568}}],['ipad',devices['iPad Pro 11']],['ipad-landscape',{viewport:{width:1194,height:834},isMobile:true,hasTouch:true,deviceScaleFactor:2}]]){
      const context=await browser.newContext({...device,defaultBrowserType:undefined});
      const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.route('**/styles.css',route=>route.fulfill({contentType:'text/css',body:originalCSS}));
      await page.goto(base+'#page=17');await page.locator('.chapter-button').first().waitFor({state:'attached'});
      const before=await page.locator('#chapters').evaluate(e=>e.clientHeight);
      await page.unroute('**/styles.css');await page.reload();await page.locator('.content-title').waitFor();
      const after=await page.locator('#chapters').evaluate(e=>e.clientHeight);assert(after>before+60,`${name}: ${before} -> ${after}`);
      assert(await page.locator('.nav-item').first().evaluate(e=>e.getBoundingClientRect().height>=44));
      if(await page.locator('#menu').isVisible())await page.locator('#menu').click();
      await page.screenshot({path:`test-results/${name}-compact-nav.png`});
      if(await page.locator('#sidebar-shade').isVisible())await page.locator('#sidebar-shade').click({position:{x:300,y:15}});
      await page.locator('#pet-toggle').click();await page.locator('#pet-voice').waitFor();
      await page.screenshot({path:`test-results/${name}-voice-panel.png`});
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      const panel=await page.locator('#pet-panel').boundingBox(),send=await page.locator('#pet-send').boundingBox();
      assert(send.y+send.height<=panel.y+panel.height,`${name}: composer outside panel`);
      assert.deepEqual(errors,[]);console.log(`${name}: lesson list ${before}px -> ${after}px, voice panel fits`);
      await context.close();
    }
    const context=await browser.newContext({...devices['iPhone 13'],defaultBrowserType:undefined});
    await context.addInitScript(()=>{
      window.__recognitions=[];window.__spoken=[];
      class Recognition{
        constructor(){window.__recognitions.push(this)}
        start(){this.onstart?.()}
        stop(){this.onend?.()}
        abort(){this.aborted=true;this.onend?.()}
        result(text){const item=[{transcript:text}];item.isFinal=true;this.onresult({results:[item]})}
      }
      window.SpeechRecognition=undefined;window.webkitSpeechRecognition=Recognition;
      window.SpeechSynthesisUtterance=class{constructor(text){this.text=text}};
      Object.defineProperty(window,'speechSynthesis',{value:{getVoices:()=>[],cancel(){},speak(item){window.__spoken.push(item.text);setTimeout(()=>item.onend?.(),20)}}});
    });
    const page=await context.newPage();const requests=[];
    await page.route('https://study.example/api/chat',async route=>{const payload=route.request().postDataJSON();requests.push(payload);await route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify({reply:'¡Hola! ¿Cómo estás?\n你好！你好吗？'})});});
    await page.goto(base+'#page=17');await page.locator('.content-title').waitFor();await page.locator('#pet-toggle').click();
    await page.locator('#pet-settings').click();await page.locator('#ai-endpoint').fill('https://study.example');await page.locator('#ai-access').fill('test-only-study-access');await page.locator('#save-ai-settings').click();
    await page.locator('#pet-voice').click();assert.equal(await page.evaluate(()=>window.__recognitions.at(-1).lang),'es-ES');
    await page.evaluate(()=>window.__recognitions.at(-1).result('Hola, me llamo Ana.'));
    await page.waitForFunction(()=>window.__recognitions.length===2);
    assert.equal(requests.length,1);assert.equal(requests[0].messages.at(-1).content,'Hola, me llamo Ana.');
    const speech=await page.evaluate(()=>window.__spoken.join(' '));assert.match(speech,/Hola/);assert(!speech.includes('你好'));
    await page.locator('#pet-close').click();assert(await page.evaluate(()=>window.__recognitions.at(-1).aborted));
    await page.locator('#pet-toggle').click();await page.locator('#pet-language').selectOption('zh-CN');await page.locator('#pet-voice').click();
    assert.equal(await page.evaluate(()=>window.__recognitions.at(-1).lang),'zh-CN');
    await page.evaluate(()=>window.__recognitions.at(-1).onerror({error:'not-allowed'}));
    assert.equal(await page.locator('#pet-voice').getAttribute('aria-pressed'),'false');assert.match(await page.locator('#pet-error').textContent(),/权限/);
    assert.equal(await page.locator('#pet-input').evaluate(e=>e.readOnly),false);
    await context.close();
    const unsupported=await browser.newContext();await unsupported.addInitScript(()=>{window.SpeechRecognition=undefined;window.webkitSpeechRecognition=undefined;});
    const other=await unsupported.newPage();await other.goto(base);await other.locator('#pet-toggle').click();assert(await other.locator('#pet-voice').isDisabled());await unsupported.close();
    console.log('Voice UI checks passed: prefixed API, input language, transcript to AI, Spanish playback, resume, close, permission failure, unsupported fallback. Microphone/AI mocked.');
  }finally{await browser.close();server?.kill()}
})().catch(e=>{console.error(e);process.exitCode=1});
