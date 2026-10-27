import {escapeHTML as esc,spanishParts} from './core.js';
import {say,stopSpeech,getLearningContext} from './app.js?v=deepseek-20261028';
import {createSpeechDialogue} from './speech-dialogue.js?v=deepseek-20261028';

const character='<img src="assets/luna-v2.png" alt="" width="1024" height="1536">';
const shell=document.createElement('div');shell.id='companion';
shell.innerHTML=`
  <button id="pet-toggle" class="pet-toggle" aria-label="打开 Luna 西语学习伙伴" aria-expanded="false">${character}<span>和 Luna 练一句</span></button>
  <section id="pet-panel" class="pet-panel" role="dialog" aria-label="Luna 西语学习伙伴" hidden>
    <header class="pet-header"><div class="pet-mini">${character}</div><div><h2>Luna <span>你的西语练习伙伴</span></h2><small id="pet-status">AI 尚未连接</small></div><button id="pet-settings" class="icon-button" aria-label="连接设置">⚙</button><button id="pet-close" class="icon-button" aria-label="收起伙伴">×</button></header>
    <div class="pet-modes"><button data-mode="chat" class="active">情景对话</button><button data-mode="explain">随文解释</button><button data-mode="correct">温和纠错</button><button data-mode="quiz">小挑战</button></div>
    <div id="pet-messages" class="pet-messages" aria-live="polite"><div class="pet-message assistant"><p>¡Hola! 我是 Luna。<br>从一句简单的西班牙语开始吧。</p><small>点一次「语音对话」，停顿后我会回复，读完继续听你说。想提前接话时，点「打断，轮到我」。</small></div></div>
    <div id="pet-error" class="pet-error" role="status" hidden></div>
    <div class="pet-voice-tools"><button id="pet-voice" type="button" aria-pressed="false"><span aria-hidden="true">🎙</span> 语音对话</button><label for="pet-language" class="sr-only">我说的语言</label><select id="pet-language" aria-label="我说的语言"><option value="es-ES">西班牙语</option><option value="zh-CN">中文</option></select><button id="pet-finish" type="button" hidden>说完了</button></div>
    <div id="pet-voice-status" class="pet-voice-status" role="status">点击后允许麦克风；语音由浏览器语音服务转写。</div>
    <form id="pet-form"><textarea id="pet-input" rows="2" maxlength="1200" placeholder="例如：陪我练习用西语自我介绍" aria-label="给学习伙伴的消息"></textarea><div class="pet-compose-footer"><button type="button" id="pet-reset">新练习</button><span>也可用键盘麦克风输入</span><button id="pet-send" type="submit">发送 ↗</button></div></form>
    <div class="pet-note">AI 回答可能有误 · 仅发送当前页片段与对话文字 · 不做发音评分</div>
  </section>`;
document.body.append(shell);
const $=id=>document.getElementById(id);
let mode='chat',messages=[],busy=false,controller,voiceRequest=false;
let endpoint='https://1508919580-l9m692upzz.ap-guangzhou.tencentscf.com';
try{
  const saved=localStorage.getItem('hola-ai-endpoint');
  if(saved==='https://hola-study-companion.maxwelllee-hola.workers.dev')localStorage.setItem('hola-ai-endpoint',endpoint);
  else if(saved)endpoint=saved;
}catch{}
const connectionKey='hola-ai-connection';
let access='',remember=true;
try{
  const saved=JSON.parse(localStorage.getItem(connectionKey)||'null');
  if(saved?.endpoint===endpoint&&typeof saved.access==='string'&&saved.access.length>=16&&saved.access.length<=128)access=saved.access;
}catch{}
const prompts={chat:'请陪我练习西班牙语自我介绍。我是零基础，请每次只问一句，必要时给中文提示。',explain:'请用简单中文解释当前页最值得掌握的一个西班牙语句型，并给我一个替换练习。',correct:'请帮我改下面这句西班牙语：',quiz:'请根据当前页出一道适合零基础的题，等我回答后再解释答案。'};
function replyAudio(reply){const spanish=spanishParts(reply).join(' ');return spanish?{text:spanish,language:'es-ES'}:/[\u3400-\u9fff]/.test(reply)?{text:reply,language:'zh-CN'}:null;}
function speakReply(reply){const audio=replyAudio(reply);return audio?say(audio.text,undefined,false,audio.language):Promise.resolve(true);}
const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
const voice=createSpeechDialogue({
  Recognition,language:()=>$('pet-language').value,
  onTranscript:text=>{$('pet-input').value=text;},
  onTurn:text=>send(text,true),
  speak:speakReply,
  cancelSpeech:stopSpeech,
  onState:phase=>{
    const active=phase!=='idle';
    $('pet-voice').textContent=active?'■ 结束语音':'🎙 语音对话';
    $('pet-voice').setAttribute('aria-pressed',String(active));
    $('pet-voice').classList.toggle('listening',['starting','listening'].includes(phase));
    $('pet-language').disabled=active||busy||!Recognition;
    $('pet-finish').hidden=!['listening','speaking'].includes(phase);
    $('pet-finish').textContent=phase==='speaking'?'打断，轮到我':'说完了';
    $('pet-finish').onclick=()=>phase==='speaking'?voice.interrupt():voice.finish();
    $('pet-input').readOnly=active;
    $('pet-send').disabled=active||busy;
    $('pet-voice-status').textContent={idle:Recognition?'语音已停止。可以打字，或重新开始语音对话。':'此浏览器暂不支持语音对话，可使用键盘麦克风输入。',starting:'正在打开麦克风…',listening:'正在听 · 可以慢慢说，停顿后自动发送',thinking:'已听到 · Luna 正在想…',speaking:'Luna 正在回答 · 可点「打断，轮到我」接话',waiting:'语音保持开启 · 准备继续听你说'}[phase];
  },
  onError:showError,
  onStop:()=>{if(voiceRequest)controller?.abort();}
});
if(!Recognition){$('pet-voice').disabled=true;$('pet-language').disabled=true;$('pet-voice-status').textContent='此浏览器暂不支持语音对话。可用 Safari、Edge 或 Chrome，或用键盘麦克风输入。';}
function showError(message){$('pet-error').hidden=false;$('pet-error').textContent=message;}
function status(){$('pet-status').textContent=endpoint&&access?(remember?'已记住此设备 · 可开始练习':'已配置 · 发送后验证连接'):'AI 尚未连接';}
function open(){$('pet-panel').hidden=false;$('pet-toggle').hidden=true;$('pet-toggle').setAttribute('aria-expanded','true');status();}
function close(){voice.stop();$('pet-panel').hidden=true;$('pet-toggle').hidden=false;$('pet-toggle').setAttribute('aria-expanded','false');$('pet-toggle').focus();}
function connected(){
  if(endpoint&&access)return true;
  showError('Luna 还未连接 AI。请先点右上角齿轮，填入你的学习口令；这里不接收 模型 API 密钥。');return false;
}
function setMode(next){
  voice.stop();mode=next;messages=[];
  const greeting={chat:'今天想在哪里说西语？咖啡店、旅途中，还是第一次见面？',explain:'我们一次只弄懂一个句子。也可以在教材里选一句，再点「问问 Luna」。',correct:'写一句你想说的话。我会先帮你表达清楚，再解释一个最关键的改动。',quiz:'来做一道小题，先试着回答，再看解释。'}[next];
  $('pet-messages').innerHTML=`<div class="pet-message assistant"><p>${greeting}</p><small>练习提示 · AI 回答将在发送后生成</small></div>`;
  $('pet-input').value=prompts[next];document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===next));$('pet-error').hidden=true;
}
function addMessage(role,text){
  const element=document.createElement('div');element.className=`pet-message ${role}`;
  const p=document.createElement('p');p.textContent=text;element.append(p);
  if(role==='assistant'&&replyAudio(text)){
    const listen=document.createElement('button');listen.className='text-button';listen.textContent=replyAudio(text).language==='es-ES'?'▷ 听西语部分':'▷ 听中文回复';
    listen.onclick=()=>{voice.stop();speakReply(text);};element.append(listen);
  }
  $('pet-messages').append(element);$('pet-messages').scrollTop=$('pet-messages').scrollHeight;
}
function settings(){
  voice.stop();const dlg=$('modal');$('modal-title').textContent='连接 Luna';
  $('modal-body').innerHTML=`<p>首次输入学习口令，保存后就能开始练习。<b>这里不填写 模型 API 密钥。</b></p><label class="ai-field">后端地址<input id="ai-endpoint" type="url" value="${esc(endpoint)}" autocomplete="off"></label><label class="ai-field">学习口令<input id="ai-access" type="password" placeholder="独立学习口令，至少 16 位" autocomplete="off"></label><label class="ai-remember"><input id="ai-remember" type="checkbox"><span>记住这台设备，下次直接使用</span></label><p class="tiny">学习口令保存在此浏览器。手机与 iPad 各保存一次；清除网站数据或使用无痕模式后可能需要重填。对话只保留在当前页面。</p><div class="review-toolbar"><button class="primary-button" id="save-ai-settings">保存并连接</button><button class="quiet-button" id="disconnect-ai">退出并清除口令</button></div><p id="ai-config-note" class="tiny" role="status">尚未连接 AI 时，仍可使用教材点读、翻译和生词复习。</p>`;
  $('ai-access').value=access;$('ai-remember').checked=remember;
  if(!dlg.open)dlg.showModal();
  $('save-ai-settings').onclick=()=>{
    try{
      const url=new URL($('ai-endpoint').value.trim());
      if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!['','/'].includes(url.pathname))throw Error();
      const nextAccess=$('ai-access').value.trim();
      if(/^sk-/i.test(nextAccess)){$('ai-config-note').textContent='这里填写独立学习口令，不是 模型 API 密钥。';return;}
      if(nextAccess.length<16||nextAccess.length>128){$('ai-config-note').textContent='请输入 16–128 位的学习口令（不是 模型 API 密钥）。';return;}
      endpoint=url.origin;access=nextAccess;remember=$('ai-remember').checked;
      let stored=true;
      try{
        if(remember)localStorage.setItem(connectionKey,JSON.stringify({endpoint,access}));
        else localStorage.removeItem(connectionKey);
        localStorage.setItem('hola-ai-endpoint',endpoint);
      }catch{stored=false;remember=false;}
      status();dlg.close();$('pet-error').hidden=true;
      if(!stored)showError('本次页面可以使用，但浏览器未能保存设置；重新打开后可能需要再输入口令。');
    }catch{$('ai-config-note').textContent='请输入完整的 HTTPS 服务地址，不带路径、参数或密钥。';}
  };
  $('disconnect-ai').onclick=()=>{
    controller?.abort();access='';$('ai-access').value='';setMode(mode);let cleared=true;
    try{localStorage.removeItem(connectionKey);localStorage.removeItem('hola-ai-endpoint');}catch{cleared=false;}
    status();dlg.close();
    if(!cleared)showError('本次页面已退出，但浏览器未允许清除保存内容。请在浏览器设置中清除此网站的数据。');
  };
}
async function send(text,spoken=false){
  text=text.trim();if(busy||!text||!connected())return null;
  busy=true;voiceRequest=spoken;$('pet-send').disabled=true;$('pet-input').disabled=true;
  $('pet-voice').disabled=!Recognition||(!spoken&&busy);$('pet-language').disabled=true;
  $('pet-error').hidden=true;$('pet-status').textContent='Luna 正在想…';addMessage('user',text);
  const history=[...messages,{role:'user',content:text}].slice(-12);
  const requestController=new AbortController();controller=requestController;
  const timer=setTimeout(()=>requestController.abort(),45000);
  try{
    const response=await fetch(`${endpoint}/api/chat`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${access}`},body:JSON.stringify({mode,messages:history,context:getLearningContext()}),signal:requestController.signal,referrerPolicy:'no-referrer'});
    const data=await response.json();
    if(response.status===401){access='';try{localStorage.removeItem(connectionKey);}catch{}}
    if(!response.ok)throw Error(data.error||'连接暂时不可用，请稍后重试。');
    if(typeof data.reply!=='string'||!data.reply.trim())throw Error('没有收到有效回复，请重试。');
    if(requestController.signal.aborted)return null;
    messages=[...history,{role:'assistant',content:data.reply}];addMessage('assistant',data.reply);$('pet-input').value='';$('pet-status').textContent='已连接 · 一次练好一句';
    return data.reply;
  }catch(error){
    if(requestController.signal.aborted&&!access)return null;
    if(error.name==='AbortError'&&spoken&&!voice.active)return null;
    showError(error.name==='AbortError'?'请求已取消或等待超时，请重试。':error instanceof TypeError?'网络暂时连接不上，请检查网络后重试。':error.message);
    $('pet-status').textContent='本次请求未成功';return null;
  }finally{
    clearTimeout(timer);busy=false;voiceRequest=false;$('pet-send').disabled=voice.active;$('pet-input').disabled=false;
    $('pet-voice').disabled=!Recognition;$('pet-language').disabled=!Recognition||voice.active;
  }
}
$('pet-toggle').onclick=open;$('pet-close').onclick=close;$('pet-settings').onclick=settings;
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{if(!busy)setMode(b.dataset.mode);});
$('pet-reset').onclick=()=>{controller?.abort();setMode(mode);};
$('pet-form').onsubmit=e=>{e.preventDefault();if(!voice.active)send($('pet-input').value);};
$('pet-voice').onclick=()=>{
  if(voice.active){voice.stop();return;}
  if(busy||!connected())return;
  $('pet-error').hidden=true;$('pet-input').value='';voice.start();
};
window.addEventListener('hola:explain',e=>{open();if(busy)return;setMode('explain');$('pet-input').value=`请解释这句西班牙语的意思和用法：${String(e.detail).slice(0,500)}`;$('pet-input').focus();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('modal').open&&!$('pet-panel').hidden)close();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)voice.stop();});
window.addEventListener('pagehide',()=>voice.stop());
document.addEventListener('click',e=>{if(voice.active&&e.target.closest('[data-speak],[data-say],#say-selection,#listen-page,#voice-preview,#mobile-listen,#stop-audio'))voice.stop();},true);
window.visualViewport?.addEventListener('resize',()=>{
  const viewport=window.visualViewport,compact=innerWidth<=700;
  $('pet-panel').classList.toggle('keyboard-open',viewport.height<540);
  $('pet-panel').style.bottom=`${Math.max(0,innerHeight-viewport.height-viewport.offsetTop)+(compact?76:23)}px`;
  $('pet-panel').style.maxHeight=`${Math.max(180,viewport.height-(compact?100:40))}px`;
});
