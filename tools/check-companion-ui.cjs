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
    const currentEndpoint='https://1508919580-l9m692upzz.ap-guangzhou.tencentscf.com';
    for(const [saved,expected] of [[null,currentEndpoint],['https://hola-study-companion.maxwelllee-hola.workers.dev',currentEndpoint],['https://study.example','https://study.example']]){
      const context=await browser.newContext();
      if(saved)await context.addInitScript(value=>localStorage.setItem('hola-ai-endpoint',value),saved);
      const page=await context.newPage();await page.goto(base+'#page=17');
      await page.locator('#pet-toggle').click();await page.locator('#pet-settings').click();
      assert.equal(await page.locator('#ai-endpoint').inputValue(),expected);
      if(saved)assert.equal(await page.evaluate(()=>localStorage.getItem('hola-ai-endpoint')),expected);
      await context.close();
    }
    console.log('Connection settings passed: Tencent default, old Cloudflare migration, custom endpoint preserved.');
    {
      const context=await browser.newContext({...devices['iPhone 13'],defaultBrowserType:undefined});
      const requests=[];let rejectAccess=false;
      await context.route('https://study.example/api/chat',async route=>{
        requests.push(route.request().headers().authorization);
        await route.fulfill({status:rejectAccess?401:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(rejectAccess?{error:'学习口令不正确，请重新输入。'}:{reply:'¡Hola!'})});
      });
      let page=await context.newPage();
      const openSettings=async()=>{await page.locator('#pet-toggle').click();await page.locator('#pet-settings').click();};
      await page.goto(base+'#page=17');await openSettings();
      assert(await page.locator('#ai-remember').isChecked());
      await page.locator('#ai-access').fill('sk-'+'x'.repeat(25));await page.locator('#save-ai-settings').click();
      assert.match(await page.locator('#ai-config-note').textContent(),/不是 模型 API/);
      assert.equal(await page.evaluate(()=>localStorage.getItem('hola-ai-connection')),null);
      await page.locator('#ai-endpoint').fill('https://study.example');
      await page.locator('#ai-access').fill('test-only-study-access');await page.locator('#save-ai-settings').click();
      await page.reload();await openSettings();
      assert.equal(await page.locator('#ai-access').inputValue(),'test-only-study-access');
      assert(await page.locator('#ai-remember').isChecked());
      assert(await page.locator('.ai-remember').evaluate(e=>e.getBoundingClientRect().height>=44));
      await page.screenshot({path:'test-results/remember-iphone.png'});
      await page.close();page=await context.newPage();await page.goto(base+'#page=17');await page.locator('#pet-toggle').click();
      assert.match(await page.locator('#pet-status').textContent(),/已记住此设备/);
      await page.locator('#pet-input').fill('Hola');await page.locator('#pet-send').click();
      await page.waitForFunction(()=>document.querySelector('#pet-status').textContent.includes('已连接'));
      assert.deepEqual(requests,['Bearer test-only-study-access']);
      await page.locator('#pet-settings').click();await page.locator('#ai-remember').uncheck();await page.locator('#save-ai-settings').click();
      assert.equal(await page.evaluate(()=>localStorage.getItem('hola-ai-connection')),null);
      await page.reload();await openSettings();assert.equal(await page.locator('#ai-access').inputValue(),'');
      await page.locator('#ai-access').fill('test-only-study-access');await page.locator('#save-ai-settings').click();
      await page.locator('#pet-settings').click();await page.locator('#disconnect-ai').click();
      assert.equal(await page.evaluate(()=>localStorage.getItem('hola-ai-connection')),null);
      assert.equal(await page.evaluate(()=>document.querySelector('#ai-access').value),'');
      await page.reload();await openSettings();assert.equal(await page.locator('#ai-access').inputValue(),'');
      await page.locator('#ai-endpoint').fill('https://study.example');await page.locator('#ai-access').fill('test-only-study-access');await page.locator('#save-ai-settings').click();
      rejectAccess=true;await page.locator('#pet-input').fill('Hola');await page.locator('#pet-send').click();
      await page.locator('#pet-error').waitFor();assert.match(await page.locator('#pet-error').textContent(),/口令不正确/);
      assert.equal(await page.evaluate(()=>localStorage.getItem('hola-ai-connection')),null);
      await page.reload();await openSettings();assert.equal(await page.locator('#ai-access').inputValue(),'');
      await context.close();
      for(const scenario of ['blocked-storage','different-endpoint']){
        const context=await browser.newContext();
        await context.addInitScript(scenario=>{
          if(scenario==='blocked-storage'){
            const set=Storage.prototype.setItem;
            Storage.prototype.setItem=function(key,value){if(key==='hola-ai-connection')throw new DOMException('Blocked','QuotaExceededError');return set.call(this,key,value);};
          }else{
            localStorage.setItem('hola-ai-endpoint','https://another.example');
            localStorage.setItem('hola-ai-connection',JSON.stringify({endpoint:'https://study.example',access:'test-only-study-access'}));
          }
        },scenario);
        const page=await context.newPage();await page.goto(base);await page.locator('#pet-toggle').click();await page.locator('#pet-settings').click();
        assert.equal(await page.locator('#ai-access').inputValue(),'');
        if(scenario==='blocked-storage'){
          await page.locator('#ai-access').fill('test-only-study-access');await page.locator('#save-ai-settings').click();
          assert.match(await page.locator('#pet-error').textContent(),/未能保存/);
          assert.equal(await page.evaluate(()=>localStorage.getItem('hola-ai-connection')),null);
          assert.match(await page.locator('#pet-status').textContent(),/已配置/);
        }
        await context.close();
      }
      console.log('Remember-device checks passed: reload, reopen, authenticated request, opt-out, logout, invalid token, blocked storage and endpoint binding. Only dummy tokens used.');
    }
    for(const [name,device] of [['desktop-short',{viewport:{width:1366,height:650}}],['iphone',devices['iPhone 13']],['iphone-small',{...devices['iPhone SE'],viewport:{width:320,height:568}}],['ipad',devices['iPad Pro 11']],['ipad-landscape',{viewport:{width:1194,height:834},isMobile:true,hasTouch:true,deviceScaleFactor:2}]]){
      const context=await browser.newContext({...device,defaultBrowserType:undefined});
      const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.route('**/styles.css*',route=>route.fulfill({contentType:'text/css',body:originalCSS}));
      await page.goto(base+'#page=17');await page.locator('.chapter-button').first().waitFor({state:'attached'});
      const before=await page.locator('#chapters').evaluate(e=>e.clientHeight);
      await page.unroute('**/styles.css*');await page.reload();await page.locator('.content-title').waitFor();
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
      window.__recognitions=[];window.__spoken=[];window.__utterances=[];window.__playback='end';
      class Recognition{
        constructor(){window.__recognitions.push(this)}
        start(){this.onstart?.()}
        stop(){this.onend?.()}
        abort(){this.aborted=true;this.onend?.()}
        result(text){const item=[{transcript:text}];item.isFinal=true;this.onresult({results:[item]})}
      }
      window.SpeechRecognition=undefined;window.webkitSpeechRecognition=Recognition;
      window.SpeechSynthesisUtterance=class{constructor(text){this.text=text}};
      Object.defineProperty(window,'speechSynthesis',{value:{getVoices:()=>[{name:'Spanish',voiceURI:'test-es',lang:'es-ES'},{name:'Chinese',voiceURI:'test-zh',lang:'zh-CN'}],cancel(){},speak(item){window.__spoken.push(item.text);window.__utterances.push(item);if(window.__playback!=='hold')setTimeout(()=>window.__playback==='error'?item.onerror?.({error:'not-allowed'}):item.onend?.(),20)}}});
    });
    const page=await context.newPage();const requests=[],voiceErrors=[];let reply='¡Hola! ¿Cómo estás?\n你好！你好吗？';page.on('pageerror',e=>voiceErrors.push(e.message));
    await page.route('https://study.example/api/chat',async route=>{const payload=route.request().postDataJSON();requests.push(payload);await route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify({reply})});});
    await page.goto(base+'#page=17');await page.locator('.content-title').waitFor();await page.locator('#pet-toggle').click();
    await page.locator('#pet-settings').click();await page.locator('#ai-endpoint').fill('https://study.example');await page.locator('#ai-access').fill('test-only-study-access');await page.locator('#save-ai-settings').click();
    await page.locator('#pet-voice').click();assert.equal(await page.evaluate(()=>window.__recognitions.at(-1).lang),'es-ES');
    await page.evaluate(()=>window.__recognitions.at(-1).result('Hola, me llamo Ana.'));
    await page.waitForFunction(()=>window.__recognitions.length===2);
    assert.equal(requests.length,1);assert.equal(requests[0].messages.at(-1).content,'Hola, me llamo Ana.');
    const speech=await page.evaluate(()=>window.__spoken.join(' '));assert.match(speech,/Hola/);assert(!speech.includes('你好'));
    await page.evaluate(()=>{const input=window.__recognitions.at(-1);input.onerror({error:'no-speech'});input.onend();input.result('stale');});
    await page.waitForFunction(()=>window.__recognitions.length===3);assert.equal(requests.length,1);assert.equal(await page.locator('#pet-voice').getAttribute('aria-pressed'),'true');
    await page.locator('#pet-close').click();assert(await page.evaluate(()=>window.__recognitions.at(-1).aborted));
    await page.locator('#pet-toggle').click();await page.locator('#pet-language').selectOption('zh-CN');await page.locator('#pet-voice').click();
    assert.equal(await page.evaluate(()=>window.__recognitions.at(-1).lang),'zh-CN');
    reply='好的，来一个。农民说：每天给牛放音乐。';
    await page.evaluate(()=>{window.__utterances=[];window.__recognitions.at(-1).result('讲个笑话');});
    await page.waitForFunction(()=>window.__recognitions.length===5);
    assert((await page.evaluate(()=>window.__utterances.map(u=>({lang:u.lang,voice:u.voice.lang})))).every(u=>u.lang==='zh-CN'&&u.voice==='zh-CN'));
    assert(await page.locator('.pet-message.assistant button').last().textContent()==='▷ 听中文回复');assert(await page.locator('#pet-error').isHidden());
    reply='😊';await page.evaluate(()=>{window.__utterances=[];window.__recognitions.at(-1).result('谢谢');});
    await page.waitForFunction(()=>window.__recognitions.length===6);assert.equal(await page.evaluate(()=>window.__utterances.length),0);assert(await page.locator('#pet-error').isHidden());
    reply='Hola.';await page.evaluate(()=>{window.__playback='error';window.__recognitions.at(-1).result('你好');});
    await page.waitForFunction(()=>window.__recognitions.length===7);assert.match(await page.locator('#pet-error').textContent(),/仍开启/);assert.equal(await page.locator('#pet-voice').getAttribute('aria-pressed'),'true');
    await page.evaluate(()=>{window.__playback='hold';window.__recognitions.at(-1).result('我们继续');});
    await page.waitForFunction(()=>document.querySelector('#pet-finish').textContent==='打断，轮到我');
    for(const viewport of [{width:320,height:568},{width:390,height:844},{width:834,height:1194}]){
      await page.setViewportSize(viewport);
      const rects=await page.evaluate(()=>{const panel=document.querySelector('#pet-panel').getBoundingClientRect();return [...document.querySelectorAll('.pet-voice-tools button,.pet-voice-tools select')].map(e=>({width:innerWidth,left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right,bottom:e.getBoundingClientRect().bottom,height:e.getBoundingClientRect().height,panelBottom:panel.bottom}));});
      assert(rects.every(r=>r.left>=0&&r.right<=r.width&&r.bottom<=r.panelBottom&&r.height>=44),'voice controls must fit and remain tappable');
    }
    await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/continuous-voice-iphone.png'});
    await page.locator('#pet-finish').click();await page.waitForFunction(()=>window.__recognitions.length===8);
    await page.evaluate(()=>window.__utterances.at(-1).onerror?.({error:'interrupted'}));
    assert(await page.locator('#pet-error').isHidden());assert.equal(await page.locator('#pet-voice').getAttribute('aria-pressed'),'true');
    await page.evaluate(()=>window.__recognitions.at(-1).onerror({error:'not-allowed'}));
    assert.equal(await page.locator('#pet-voice').getAttribute('aria-pressed'),'false');assert.match(await page.locator('#pet-error').textContent(),/权限/);
    assert.equal(await page.locator('#pet-input').evaluate(e=>e.readOnly),false);
    assert.equal(await page.evaluate(async()=>{const {say,stopSpeech}=await import(document.querySelector('script[src^="app.js"]').src);const pending=say('Hola');stopSpeech();return await pending;}),false,'cancellation must settle without browser end/error callbacks');
    assert.deepEqual(voiceErrors,[]);
    await context.close();
    const unsupported=await browser.newContext();await unsupported.addInitScript(()=>{window.SpeechRecognition=undefined;window.webkitSpeechRecognition=undefined;});
    const other=await unsupported.newPage();await other.goto(base);await other.locator('#pet-toggle').click();assert(await other.locator('#pet-voice').isDisabled());await unsupported.close();
    console.log('Voice UI checks passed: Spanish and Chinese playback, empty reply, silence recovery, nonfatal TTS failure, interrupt and resume, cancellation without browser callbacks, mobile controls, permission failure and unsupported fallback. Microphone/AI mocked.');
  }finally{await browser.close();server?.kill()}
})().catch(e=>{console.error(e);process.exitCode=1});
