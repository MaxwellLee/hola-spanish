import { LATIN_WORD, escapeHTML as esc, normalizeWord, spanishParts, localDay, reviewUpdate, validPage } from './core.js';

const $ = id => document.getElementById(id);
const speaker = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14" stroke-linecap="round"/></svg>';
const storageKey = 'hola-study-v1';
let state = {page:17,view:'text',size:19,speed:.85,voice:'',read:[],days:[],words:[],tasks:{}};
try { const saved = JSON.parse(localStorage.getItem(storageKey) || 'null'); if(saved && typeof saved === 'object') state = {...state,...saved}; } catch {}
for (const key of ['read','days','words']) if(!Array.isArray(state[key])) state[key]=[];
if(!state.tasks || typeof state.tasks!=='object') state.tasks={};
state.words = state.words.filter(w=>w && typeof w.text==='string' && typeof w.meaning==='string');
state.size = Math.max(15,Math.min(28,Number(state.size)||19));
state.speed = Math.max(.1,Math.min(1.2,Number(state.speed)||.85));
if(!['text','scan','compare'].includes(state.view))state.view='text';
let manifest, glossary = {}, pageData, voices = [], renderId = 0, speechId = 0, utterance, speechDone, selection = '', selectionMeaning = '', selectionVersion = 0, searchIndex, toastTimer, selectionTimer, searchTimer;
const cache = new Map();
const translationCache = new Map();
function save() { try { localStorage.setItem(storageKey,JSON.stringify(state)); } catch { toast('浏览器暂时不能保存进度，请先导出生词备份。'); } }
function toast(text) { $('toast').textContent=text; $('toast').hidden=false; clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4500); }
function noteActivity(){const day=localDay();if(!state.days.includes(day)){state.days.push(day);save();}$('days-count').textContent=state.days.length;}
function chapterFor(page){return [...manifest.chapters].reverse().find(c=>c.page<=page)||{number:0,title:'封面、前言与目录',subtitle:'开始之前',page:1};}
function closeSidebar(){ $('sidebar').classList.remove('open');$('sidebar-shade').hidden=true;$('menu').setAttribute('aria-expanded','false'); }
function updateSidebar(){
  $('chapters').innerHTML=[{number:0,title:'封面与字母表',subtitle:'封面 · 前言 · 目录',page:1},...manifest.chapters].map(c=>`<button class="chapter-button ${chapterFor(state.page).number===c.number?'active':''}" data-page="${c.page}" ${chapterFor(state.page).number===c.number?'aria-current="page"':''}><span class="chapter-num">${c.number?String(c.number).padStart(2,'0'):'·'}</span><span>${esc(c.title)}<small>${esc(c.subtitle)}</small></span>${state.read.some(p=>chapterFor(p).number===c.number)?'<span class="chapter-dot">●</span>':''}</button>`).join('');
}
function decorate(text){let result='',last=0;for(const match of text.matchAll(LATIN_WORD)){result+=esc(text.slice(last,match.index));const w=esc(match[0]);result+=`<span class="word" lang="es" tabindex="0" role="button" aria-label="查询 ${w}">${w}</span>`;last=match.index+match[0].length;}return result+esc(text.slice(last));}
function makeTextPage(data){
  const lines=data.readingLines||data.lines;
  if(!lines.length)return '<div class="empty-state">这一页主要是图片，请切换到「原书页面」阅读。</div>';
  return `<article class="text-page" lang="es">${data.heading?`<h3 class="content-title">${decorate(data.heading)}</h3><div class="page-subtitle" lang="zh">TEXTOS · 课文对话</div>`:''}${lines.map((line,i)=>{
    const spoken=spanishParts(line.text).join(' ');const chinese=/[\u3400-\u9fff]/.test(line.text);let content=line.text;
    const name=content.match(/^(Ana|Paco|Li|Susana|Tomás):\s*/);
    if(name) content=content.slice(name[0].length);
    return `<div class="ocr-line ${chinese?'chinese-line':''}" data-line="${i}" ${chinese?'lang="zh"':''}>${name?`<span class="speaker-label" lang="es">${esc(name[1])}</span>`:''}${decorate(content)}${spoken?`<button class="speak-button" data-speak="${esc(spoken)}" aria-label="朗读本行西班牙语">${speaker}</button>`:''}</div>`;
  }).join('')}</article>`;
}
function makeScanPage(data){
  const entry=manifest.pages[state.page-1];
  return `<div class="scan-page"><img src="book/pages/${String(state.page).padStart(3,'0')}.webp" width="${entry.width}" height="${entry.height}" alt="教材原书 PDF 第 ${state.page} 页" decoding="async">${data.lines.flatMap((line,i)=>{
    const words=line.words||[];const spoken=spanishParts(line.text).join(' ');return [...words.filter(w=>/[A-Za-zÀ-ÖØ-öø-ÿ]/.test(w.text)).map(w=>`<span class="word scan-word" lang="es" tabindex="0" role="button" aria-label="查询 ${esc(w.text)}" style="left:${w.bbox.x0/entry.width*100}%;top:${w.bbox.y0/entry.height*100}%;width:${(w.bbox.x1-w.bbox.x0)/entry.width*100}%;height:${(w.bbox.y1-w.bbox.y0)/entry.height*100}%;font-size:${Math.max(8,(w.bbox.y1-w.bbox.y0)*.2)}px">${esc(w.text)}</span>`),spoken?`<button class="speak-button scan-speaker" data-line="${i}" data-speak="${esc(spoken)}" style="left:${Math.min(96,line.bbox.x1/entry.width*100+1)}%;top:${(line.bbox.y0+line.bbox.y1)/2/entry.height*100}%" aria-label="朗读这一行">${speaker}</button>`:''];
  }).join('')}</div>`;
}
async function renderPage(page, scroll=false){
  page=validPage(page);if(!page)return toast('请输入 1 到 305 之间的整数页码。');
  const id=++renderId;stopSpeech();closeTranslation();state.page=page;save();history.replaceState(null,'',`#page=${page}`);
  const chapter=chapterFor(page);$('unit-label').textContent=chapter.number?`UNIDAD ${String(chapter.number).padStart(2,'0')}`:'ANTES DE EMPEZAR';$('unit-title').textContent=chapter.title;
  $('page-input').value=page;$('printed-page').textContent=page>=16?`书内第 ${page-15} 页`:'封面 / 前置页面';
  for(const id of ['prev-page','mobile-prev'])$(id).disabled=page===1;
  for(const id of ['next-page','next-bottom','mobile-next'])$(id).disabled=page===305;
  $('mark-read').textContent=state.read.includes(page)?'✓ 已学过':'○ 标记学过';$('mark-read').classList.toggle('done-label',state.read.includes(page));updateSidebar();
  $('page-content').innerHTML='<div class="loading">正在打开这一页…</div>';closeSidebar();
  try{
    if(!cache.has(page)){const response=await fetch(`book/text/${String(page).padStart(3,'0')}.json`);if(!response.ok)throw Error();cache.set(page,await response.json());}
    if(id!==renderId)return;pageData=cache.get(page);if(cache.size>30)cache.delete(cache.keys().next().value);
    $('page-content').innerHTML=state.view==='text'?makeTextPage(pageData):state.view==='scan'?makeScanPage(pageData):`<div class="compare-pages">${makeTextPage(pageData)}${makeScanPage(pageData)}</div>`;
    $('ocr-notice').textContent=pageData.reviewed?'本页对话文字已对照原页校订；语音为合成朗读，不是教材配套录音。':'识别文字供点读与查词使用，尚未逐页人工校订；表格、音标和重音可能有误，请对照原书。';
    if(scroll)$('reader').scrollIntoView({behavior:'auto',block:'start'});
  }catch{$('page-content').innerHTML='<div class="error-box">这一页暂时没有加载成功。请检查网络后重试。<br><button class="quiet-button" id="reload-page">重新加载</button></div>';$('reload-page').onclick=()=>renderPage(page);}
}
function loadVoices(){
  if(!('speechSynthesis'in window)){$('voice').innerHTML='<option>此浏览器不支持网页朗读</option>';$('voice-info').textContent='请尝试 Safari、Edge 或 Chrome。';return;}
  voices=speechSynthesis.getVoices().filter(v=>/^es(?:-|_)/i.test(v.lang)||v.lang==='es').sort((a,b)=>(b.lang==='es-ES')-(a.lang==='es-ES')||a.name.localeCompare(b.name));
  $('voice').innerHTML=voices.length?voices.map(v=>`<option value="${esc(v.voiceURI)}">${esc(v.name)} · ${esc(v.lang)}</option>`).join(''):'<option value="">系统默认西语 · es-ES</option>';
  if(voices.some(v=>v.voiceURI===state.voice))$('voice').value=state.voice;
  $('voice-info').textContent=voices.length?`检测到 ${voices.length} 个西语声音。先试听，再选择喜欢的音色。`:'设备尚未列出西语声音；可先试听，若无声请在系统语音设置中添加西班牙语。';
}
function stopSpeech(){speechId++;speechDone?.(false);if('speechSynthesis'in window)speechSynthesis.cancel();document.querySelectorAll('.playing').forEach(e=>e.classList.remove('playing'));$('audio-status').textContent='';$('mobile-listen').textContent='▷ 朗读本页';}
function say(text,element,chain=false,language='es-ES'){
  if(!('speechSynthesis'in window)){toast('这个浏览器暂不支持朗读。');return Promise.resolve(false);}
  if(!chain)stopSpeech();const current=speechId;
  // shortcut: browser voice inventory varies by device; provision hosted audio for identical voices on every device.
  const chunks=text.match(/[^.!?。！？]+[.!?。！？]*|[.!?。！？]+/g)||[text];
  const split=chunks.flatMap(t=>{const out=[];while(t.length>180){let cut=t.lastIndexOf(' ',180);if(cut<1)cut=180;out.push(t.slice(0,cut));t=t.slice(cut).trim();}if(t.trim())out.push(t.trim());return out;});
  noteActivity();element?.classList.add('playing');$('audio-status').textContent='正在朗读…';
  return new Promise(resolve=>{
    let settled=false;
    const finish=success=>{if(settled)return;settled=true;if(speechDone===finish)speechDone=null;element?.classList.remove('playing');if(current===speechId)$('audio-status').textContent='';resolve(success);};
    speechDone=finish;
    function next(){
      if(settled)return;
      if(current!==speechId){finish(false);return;}
      const chunk=split.shift();if(!chunk){finish(true);return;}
      utterance=new SpeechSynthesisUtterance(chunk);utterance.lang=language;utterance.rate=state.speed;
      const available=language==='es-ES'?voices:speechSynthesis.getVoices().filter(v=>/^zh(?:-|_)/i.test(v.lang));
      const voice=(language==='es-ES'?available.find(v=>v.voiceURI===$('voice').value):null)||available.find(v=>v.lang===language)||available[0];if(voice){utterance.voice=voice;utterance.lang=voice.lang;}
      utterance.onend=next;
      utterance.onerror=e=>{if(settled)return;finish(false);if(current===speechId&&!['canceled','interrupted'].includes(e.error)){const reason={'not-allowed':'浏览器未允许自动播放，请点击回复下方的朗读按钮重试。','language-unavailable':'设备缺少对应语言的语音，请在系统设置中添加。','voice-unavailable':'所选声音不可用，请更换声音。','network':'语音服务连接失败，请检查网络后重试。'}[e.error]||'语音合成未成功，请更换声音后重试。';toast(reason);$('audio-status').textContent=reason;}};
      try{speechSynthesis.speak(utterance);}catch{utterance.onerror({error:'synthesis-failed'});}
    }next();
  });
}
async function readPage(){
  if(!pageData)return;stopSpeech();const id=speechId;const lines=pageData.readingLines||pageData.lines;$('mobile-listen').textContent='正在朗读…';
  for(let i=0;i<lines.length;i++){
    const text=spanishParts(lines[i].text).join(' ');if(!text)continue;if(id!==speechId)break;
    const el=$('page-content').querySelector(`.ocr-line[data-line="${i}"]`);const ok=await say(text,el,true);if(!ok)break;
  }
  if(id===speechId){$('audio-status').textContent='本页朗读结束';$('mobile-listen').textContent='▷ 朗读本页';}
}
function positionPopover(rect){const width=Math.min(330,innerWidth-24);const left=Math.min(innerWidth-width-12,Math.max(12,rect.left));const top=Math.max(12,Math.min(innerHeight-390,rect.bottom+10));$('translation').style.left=`${left}px`;$('translation').style.top=`${top}px`;}
function closeTranslation(){selectionVersion++;$('translation').hidden=true;}
function showTranslation(text,rect){
  text=text.trim().replace(/\s+/g,' ');if(!text||!/[A-Za-zÀ-ÖØ-öø-ÿ]/.test(text))return;
  if(new TextEncoder().encode(text).length>500){toast('一次请选择一个词或较短的句子（最多 500 字节）。');return;}
  if(selection===text&&!$('translation').hidden){positionPopover(rect);return;}
  selection=text;selectionMeaning='';selectionVersion++;$('selected-text').textContent=text;$('translation').hidden=false;$('translation-result').textContent='正在查找…';$('translation-source').textContent='';$('save-word').disabled=true;$('retry-translation').disabled=false;positionPopover(rect);
  const entry=glossary[normalizeWord(text)];
  if(entry){selectionMeaning=typeof entry==='string'?entry:entry.meaning;$('translation-result').textContent=selectionMeaning;$('translation-source').textContent='内置学习词典 · 具体含义须结合上下文';$('save-word').disabled=false;}
  else onlineTranslation();
}
async function onlineTranslation(){
  const text=selection;const version=selectionVersion;const key=normalizeWord(text);$('translation-result').textContent='正在翻译…';$('translation-source').textContent='MyMemory · 西班牙语 → 简体中文';$('retry-translation').disabled=true;
  try{
    let translated=translationCache.get(key);
    if(!translated){const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),12000);
      try{const url=new URL('https://api.mymemory.translated.net/get');url.searchParams.set('q',text);url.searchParams.set('langpair','es|zh-CN');const response=await fetch(url,{signal:controller.signal,referrerPolicy:'no-referrer'});if(!response.ok)throw Error('network');const data=await response.json();if(Number(data.responseStatus)!==200||data.quotaFinished||!data.responseData?.translatedText)throw Error('quota');const decoder=document.createElement('textarea');decoder.innerHTML=data.responseData.translatedText;translated=decoder.value;translationCache.set(key,translated);}finally{clearTimeout(timeout);}}
    if(version!==selectionVersion)return;selectionMeaning=translated;$('translation-result').textContent=translated;$('translation-source').textContent='MyMemory 在线翻译 · 译文仅供参考';$('save-word').disabled=false;noteActivity();
  }catch{if(version!==selectionVersion)return;$('translation-result').textContent='暂时未能获取翻译，可能是网络问题或免费服务额度已用完。请稍后重试。';$('translation-source').textContent='未返回译文';}
  finally{if(version===selectionVersion)$('retry-translation').disabled=false;}
}
function handleSelection(){
  const sel=window.getSelection();if(!sel||sel.isCollapsed||!sel.rangeCount)return;const range=sel.getRangeAt(0);const node=range.commonAncestorContainer.nodeType===1?range.commonAncestorContainer:range.commonAncestorContainer.parentElement;
  if(!$('page-content').contains(node))return;showTranslation(sel.toString(),range.getBoundingClientRect());
}
function updateWords(){
  $('word-count').textContent=state.words.length;$('recent-words').innerHTML=state.words.length?state.words.slice(-6).reverse().map(w=>`<button class="word-pill" data-query="${esc(w.text)}">${esc(w.text)}</button>`).join(''):'<p class="muted">遇到喜欢的词，点一下 ☆<br>下次见面，就更熟悉了。</p>';
}
function openModal(title,content){closeTranslation();$('modal-title').textContent=title;$('modal-body').innerHTML=content;if(!$('modal').open)$('modal').showModal();closeSidebar();}
function showWords(){
  openModal('生词小本',`<p>先回想意思，再看答案。复习进度保存在当前浏览器。</p><div class="review-toolbar"><button class="primary-button" id="start-review">开始今日复习</button><button class="quiet-button" id="export-words">导出备份</button><button class="quiet-button" id="import-words">导入备份</button><input type="file" id="import-file" accept="application/json,.json" hidden></div><div id="review-space"></div><div id="saved-list">${state.words.length?state.words.slice().reverse().map(w=>`<div class="saved-row"><div><strong lang="es">${esc(w.text)}</strong><small>${esc(w.meaning)}</small><div class="tiny">${w.page?'PDF 第 '+Number(w.page)+' 页 · ':''}${Number(w.due)>Date.now()?'稍后复习':'可以复习了'}</div></div><div class="row-actions"><button class="speak-button" data-say="${esc(w.text)}" aria-label="朗读">${speaker}</button><button class="icon-button" data-delete="${esc(w.text)}" aria-label="移出生词本">×</button></div></div>`).join(''):'<div class="empty-state">先在教材中收藏一个词吧。<br>选中词语后，点击「☆ 收藏」。</div>'}</div>`);
  $('start-review').onclick=startReview;$('export-words').onclick=exportWords;$('import-words').onclick=()=>$('import-file').click();$('import-file').onchange=importWords;
}
function startReview(){
  const due=state.words.filter(w=>!w.due||w.due<=Date.now()).slice(0,10);if(!due.length){$('review-space').innerHTML='<div class="note-box">今天暂时没有到期的词，可以继续读一小段课文。</div>';return;}
  let n=0;
  function show(){
    if(n>=due.length){$('review-space').innerHTML='<div class="note-box">这一轮完成了。用刚复习的词，说一句自己的话吧。</div>';return;}
    const word=due[n];$('review-space').innerHTML=`<div class="review-card"><div class="tiny">${n+1} / ${due.length} · 先想一想中文意思</div><div class="review-word" lang="es">${esc(word.text)}</div><button class="speak-button" data-say="${esc(word.text)}" aria-label="朗读">${speaker}</button><p id="review-answer" hidden>${esc(word.meaning)}</p><button class="quiet-button" id="reveal">看看答案</button><div class="review-actions" id="review-actions" hidden><button class="quiet-button" id="forgot">还不熟</button><button class="primary-button" id="remembered">想起来了</button></div></div>`;
    $('reveal').onclick=()=>{$('review-answer').hidden=false;$('review-actions').hidden=false;$('reveal').hidden=true;};
    for(const [id,known]of [['forgot',false],['remembered',true]])$(id).onclick=()=>{const i=state.words.findIndex(w=>w.text===word.text);if(i>=0)state.words[i]=reviewUpdate(state.words[i],known);noteActivity();save();n++;show();};
  }show();
}
function exportWords(){const blob=new Blob([JSON.stringify({version:1,words:state.words},null,2)],{type:'application/json'});const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=`hola-words-${localDay()}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);}
async function importWords(event){const file=event.target.files?.[0];if(!file)return;if(file.size>2e6)return toast('备份文件过大，请选择小于 2 MB 的生词备份。');try{const data=JSON.parse(await file.text());if(!Array.isArray(data.words))throw Error();const words=data.words.slice(0,3000).filter(w=>w&&typeof w.text==='string'&&w.text.length<=500&&typeof w.meaning==='string'&&w.meaning.length<=2000);for(const w of words)if(!state.words.some(x=>normalizeWord(x.text)===normalizeWord(w.text)))state.words.push({text:w.text,meaning:w.meaning,page:validPage(w.page)||null,level:0,due:0});save();updateWords();showWords();toast('生词备份已合并。');}catch{toast('无法读取这个备份，请选择本网页导出的 JSON 文件。');}}
function showPlan(){openModal('每天 15 分钟，慢慢走得更远',`<p>这是一份适合零基础的建议节奏，不必追赶课时。</p><p><b>3 分钟 · 先听</b><br>听两三句，不看中文。先找听得出来的词。</p><p><b>8 分钟 · 再读、再说</b><br>读一小段，查影响理解的词。慢速听一句，停下来模仿一句。音标和发音方法要结合原书图示，合成语音不等于语音教学示范。</p><p><b>4 分钟 · 回想和使用</b><br>在生词本中先猜意思，再翻答案。把课文中的名字、国籍换成自己的信息，试着说一句。</p><div class="note-box">开始时，一周学完一课也很好。刚学过的词安排在 1、3、7、14 天后复习；选「还不熟」会更早再次出现。</div><p>建议先完成第一课的两段对话，再逐步学习发音与语法。需要复习时，就停下来。</p>`);}
function showHelp(){openModal('把这里当作你的随身西语角',`<p><b>阅读</b>：全书 305 个 PDF 页面，可按课跳转、输入页码，也可搜索识别文字。书内页码与 PDF 页码不同，按页面提示辨认。</p><p><b>点读</b>：点击喇叭直接朗读。声音来自当前设备或浏览器，优先使用 es-ES（西班牙西语）；可选音色数量因设备而异。合成声音不是教材配套录音。音标、孤立字母与拼读练习不保证准确示范。</p><p><b>划词翻译</b>：轻点单词，或选择一小段文字；手机可长按拖动选择。中文出现在当前页的卡片里。常见词使用内置词典，其余选中文字发送到 MyMemory 在线翻译；不需要 API 密钥，免费服务可能限流。</p><p><b>原书与文字</b>：原书彩色扫描完整保留。重新排版的文字更清晰，但识别文本尚未逐页人工校订，复杂表格、音标、重音可能有误，以原书为准。放大扫描不会产生原图没有的细节。</p><p><b>收藏与复习</b>：进度和生词保存在当前浏览器，不会自动同步到另一台设备。使用生词本里的导出 / 导入可迁移收藏；清理网站数据会清除本机记录。</p><p><b>iPhone / iPad</b>：建议使用 Safari。通过分享菜单「添加到主屏幕」可更方便打开。朗读需先触碰播放按钮；切到后台时系统可能暂停声音。</p><p>本网页是学习辅助工具。教材版权归原权利人；依提供者确认的公开传播授权收录。</p><p><a href="https://mymemory.translated.net/doc/usagelimits.php" target="_blank" rel="noopener noreferrer">翻译服务用量说明 ↗</a></p>`);}
function updateTasks(){const done=state.tasks[localDay()]||[];document.querySelectorAll('[data-task]').forEach(b=>{const checked=done.includes(b.dataset.task);b.classList.toggle('done',checked);b.querySelector('.task-check').textContent=checked?'✓':'○';b.setAttribute('aria-pressed',String(checked));});}

$('say-selection').innerHTML=speaker;
$('say-selection').onclick=()=>say(selection);
$('close-translation').onclick=closeTranslation;
$('ask-ai').onclick=()=>{const text=selection;closeTranslation();window.dispatchEvent(new CustomEvent('hola:explain',{detail:text}));};
$('retry-translation').onclick=onlineTranslation;
$('save-word').onclick=()=>{if(!selectionMeaning)return;const key=normalizeWord(selection);if(state.words.some(w=>normalizeWord(w.text)===key)){toast('这个词已经在你的生词本里了。');return;}state.words.push({text:selection,meaning:selectionMeaning,page:state.page,level:0,due:0});save();updateWords();noteActivity();toast('已收藏，下一次复习时见。');};
$('page-content').addEventListener('click',e=>{
  const speak=e.target.closest('[data-speak]');if(speak){say(speak.dataset.speak,speak.closest('.ocr-line'));return;}
  const word=e.target.closest('.word');if(word){if(window.getSelection()?.toString().trim())return;showTranslation(word.textContent,word.getBoundingClientRect());}
});
$('page-content').addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.classList.contains('word')){e.preventDefault();showTranslation(e.target.textContent,e.target.getBoundingClientRect());}});
document.addEventListener('selectionchange',()=>{clearTimeout(selectionTimer);selectionTimer=setTimeout(handleSelection,650);});
document.addEventListener('pointerup',e=>{if($('page-content').contains(e.target)){clearTimeout(selectionTimer);selectionTimer=setTimeout(handleSelection,e.pointerType==='touch'?650:180);}});
document.addEventListener('pointerdown',e=>{if(!$('translation').hidden&&!$('translation').contains(e.target)&&!$('page-content').contains(e.target))closeTranslation();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeTranslation();closeSidebar();}if(e.target.matches('input,textarea,select')||$('modal').open||!$('translation').hidden)return;if(e.key==='ArrowRight')renderPage(state.page+1);if(e.key==='ArrowLeft')renderPage(state.page-1);});
document.addEventListener('click',e=>{const p=e.target.closest('[data-page]');if(p&&manifest)renderPage(Number(p.dataset.page),true);const q=e.target.closest('[data-query]');if(q)showTranslation(q.dataset.query,q.getBoundingClientRect());const s=e.target.closest('[data-say]');if(s)say(s.dataset.say);const d=e.target.closest('[data-delete]');if(d){state.words=state.words.filter(w=>w.text!==d.dataset.delete);save();updateWords();showWords();}});
for(const id of ['prev-page','mobile-prev'])$(id).onclick=()=>renderPage(state.page-1);
for(const id of ['next-page','next-bottom','mobile-next'])$(id).onclick=()=>renderPage(state.page+1,id==='next-bottom');
$('page-input').onchange=()=>{const page=validPage($('page-input').value);if(page)renderPage(page);else{$('page-input').value=state.page;toast('请输入 1 到 305 之间的整数页码。');}};
document.querySelectorAll('[data-view]').forEach(b=>{b.onclick=()=>{state.view=b.dataset.view;document.querySelectorAll('[data-view]').forEach(x=>{const active=x===b;x.classList.toggle('selected',active);x.setAttribute('aria-pressed',String(active));});renderPage(state.page);};});
for(const[id,delta]of[['font-up',1],['font-down',-1]])$(id).onclick=()=>{state.size=Math.max(15,Math.min(28,state.size+delta));document.documentElement.style.setProperty('--font-size',`${state.size}px`);save();};
$('mark-read').onclick=()=>{state.read=state.read.includes(state.page)?state.read.filter(p=>p!==state.page):[...state.read,state.page];noteActivity();save();$('mark-read').textContent=state.read.includes(state.page)?'✓ 已学过':'○ 标记学过';$('mark-read').classList.toggle('done-label',state.read.includes(state.page));updateSidebar();};
$('voice').onchange=()=>{state.voice=$('voice').value;save();stopSpeech();};
$('speed').oninput=()=>{state.speed=Number($('speed').value);$('speed-label').textContent=`${state.speed.toFixed(2)}×`;save();};
$('voice-preview').onclick=()=>say('Hola, buenos días. Vamos a aprender español, poco a poco.');
$('listen-page').onclick=readPage;$('mobile-listen').onclick=readPage;$('stop-audio').onclick=stopSpeech;$('mobile-stop').onclick=stopSpeech;
$('menu').onclick=()=>{const open=$('sidebar').classList.toggle('open');$('sidebar-shade').hidden=!open;$('menu').setAttribute('aria-expanded',String(open));};$('sidebar-shade').onclick=closeSidebar;
$('nav-book').onclick=()=>{closeSidebar();$('reader').scrollIntoView();};for(const id of ['nav-words','open-words'])$(id).onclick=showWords;$('nav-plan').onclick=showPlan;
for(const id of ['help','about'])$(id).onclick=showHelp;$('close-modal').onclick=()=>$('modal').close();$('modal').addEventListener('click',e=>{if(e.target===$('modal')){const r=$('modal').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('modal').close();}});
document.querySelectorAll('[data-task]').forEach(b=>b.onclick=()=>{const day=localDay();const tasks=state.tasks[day]||[];state.tasks[day]=tasks.includes(b.dataset.task)?tasks.filter(t=>t!==b.dataset.task):[...tasks,b.dataset.task];save();noteActivity();updateTasks();});
$('search').oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(async()=>{const query=$('search').value.trim().toLocaleLowerCase('es');$('search-results').hidden=!query;$('chapters').hidden=!!query;if(!query)return;$('search-results').textContent='正在搜索…';try{if(!searchIndex){const response=await fetch('book/search.json');if(!response.ok)throw Error();searchIndex=await response.json();}if(query!==$('search').value.trim().toLocaleLowerCase('es'))return;const hits=searchIndex.filter(p=>p.text.toLocaleLowerCase('es').includes(query)).slice(0,40);$('search-results').innerHTML=hits.length?hits.map(p=>{const index=p.text.toLocaleLowerCase('es').indexOf(query);return `<button class="search-hit" data-page="${p.page}"><b>PDF 第 ${p.page} 页</b>${esc(p.text.slice(Math.max(0,index-18),index+70))}…</button>`;}).join(''):'<p class="tiny">没有搜到。识别有误时，可按目录查找。</p>';}catch{$('search-results').textContent='搜索暂时不可用，请稍后重试。';}},350);};
window.addEventListener('hashchange',()=>{const page=validPage(new URLSearchParams(location.hash.slice(1)).get('page'));if(manifest&&page&&page!==state.page)renderPage(page,true);});
window.addEventListener('pagehide',stopSpeech);
async function init(){
  loadVoices();if('speechSynthesis'in window){speechSynthesis.onvoiceschanged=loadVoices;setTimeout(loadVoices,1500);}
  $('speed').value=state.speed;$('speed-label').textContent=`${state.speed.toFixed(2)}×`;document.documentElement.style.setProperty('--font-size',`${state.size}px`);$('days-count').textContent=state.days.length;updateWords();updateTasks();
  document.querySelectorAll('[data-view]').forEach(b=>{const active=b.dataset.view===state.view;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));});
  try{const [m,g]=await Promise.all([fetch('book/manifest.json'),fetch('glossary.json')]);if(!m.ok||!g.ok)throw Error();manifest=await m.json();glossary=await g.json();const hashPage=new URLSearchParams(location.hash.slice(1)).get('page');await renderPage(validPage(hashPage)||validPage(state.page)||17);}
  catch{$('page-content').innerHTML='<div class="error-box">教材加载失败。请检查网络后刷新页面。</div>';}
}
init();
export {say,stopSpeech};
export function getLearningContext(){return {page:state.page,chapter:manifest?chapterFor(state.page).title:'',text:(pageData?.readingLines||pageData?.lines||[]).map(l=>l.text).join('\n').slice(0,2400)};}
