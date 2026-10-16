const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {chromium, devices} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async()=>{
  fs.mkdirSync('test-results',{recursive:true});
  const browser = await chromium.launch({channel:'chrome',headless:true});
  const errors=[];
  for(const [name,options] of [
    ['desktop',{viewport:{width:1440,height:1000}}],
    ['iphone',{...devices['iPhone 13'],defaultBrowserType:undefined}],
    ['ipad',{...devices['iPad Pro 11'],defaultBrowserType:undefined}],
    ['ipad-landscape',{viewport:{width:1194,height:834},isMobile:true,hasTouch:true,deviceScaleFactor:2}],
  ]){
    const context=await browser.newContext(options);
    const page=await context.newPage();
    page.on('pageerror',e=>errors.push(`${name}: ${e.message}`));
    await page.goto('http://127.0.0.1:8765/#page=17');
    await page.locator('.content-title').waitFor();
    assert.equal(await page.locator('.ocr-line').count(),9);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${name}: horizontal overflow`);
    await page.screenshot({path:`test-results/${name}.png`,fullPage:false});
    await page.locator('.word').filter({hasText:/^Hola$/}).first().click();
    await page.locator('#translation').waitFor({state:'visible'});
    assert.match(await page.locator('#translation-result').textContent(),/你好/);
    await page.locator('#save-word').click();
    assert.equal(await page.locator('#word-count').textContent(),'1');
    await page.screenshot({path:`test-results/${name}-translation.png`,fullPage:false});
    await page.locator('#close-translation').click();
    await page.locator('[data-view="scan"]').click();
    await page.locator('.scan-page img').waitFor();
    await page.waitForFunction(()=>document.querySelector('.scan-page img').complete && document.querySelector('.scan-page img').naturalWidth>0);
    assert(await page.locator('.scan-word').count()>20);
    await page.locator('[data-view="text"]').click();
    await page.locator('#page-input').fill('305');await page.locator('#page-input').press('Enter');await page.locator('#page-input').blur();
    await page.waitForFunction(()=>document.querySelector('#page-input').value==='305' && document.querySelectorAll('.ocr-line').length>0);
    assert(await page.locator('#next-page').isDisabled());
    await page.goto('http://127.0.0.1:8765/#page=17');await page.locator('.content-title').waitFor();
    assert.equal(await page.locator('#word-count').textContent(),'1');
    await context.close();
    console.log(`${name}: layout, dictionary popup, save, scan overlays, last page, persistence OK`);
  }
  assert.deepEqual(errors,[]);
  await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
