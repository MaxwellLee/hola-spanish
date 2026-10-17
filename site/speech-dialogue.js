// Browser recognition transcribes audio; the AI receives text only.
export function createSpeechDialogue({Recognition,language,onTranscript,onTurn,speak,cancelSpeech,onState,onError,onStop}) {
  let active=false,version=0,recognition=null,timer=null,silenceTimer=null,phase='idle';
  const current=id=>active&&id===version;
  function state(next){phase=next;onState(next);}
  function clearTimers(){clearTimeout(timer);clearTimeout(silenceTimer);}
  function stop(){
    const wasActive=active;active=false;version++;clearTimers();
    const old=recognition;recognition=null;try{old?.abort();}catch{}
    cancelSpeech();state('idle');if(wasActive)onStop();
  }
  function fail(message){stop();onError(message);}
  function resume(id){
    if(!current(id))return;
    state('waiting');
    // Let the speaker fall quiet before reopening the microphone to avoid hearing Luna herself.
    timer=setTimeout(()=>listen(id),450);
  }
  function listen(id){
    if(!current(id))return;
    let finalText='',settled=false;
    try{recognition=new Recognition();}catch{fail('语音服务无法启动，请改用键盘麦克风输入。');return;}
    const input=recognition;input.lang=language();input.continuous=true;input.interimResults=true;input.maxAlternatives=1;
    const listening=()=>current(id)&&recognition===input&&!settled;
    state('starting');
    timer=setTimeout(()=>{if(current(id))fail('等待语音超时。请检查麦克风权限，再点击语音对话。');},30000);
    input.onstart=()=>{if(listening()){clearTimeout(timer);state('listening');}};
    input.onspeechstart=()=>{if(listening())clearTimeout(silenceTimer);};
    input.onresult=event=>{
      if(!listening())return;
      clearTimeout(silenceTimer);
      const finals=[],partial=[];
      for(let i=0;i<event.results.length;i++){
        const result=event.results[i];(result.isFinal?finals:partial).push(result[0].transcript);
      }
      finalText=finals.join(' ').trim();
      onTranscript([...finals,...partial].join(' ').trim());
      if([...finals,...partial].join(' ').length>1200){fail('这段话太长了，请分成短一些的几段。');return;}
      if(finalText&&!partial.length)silenceTimer=setTimeout(()=>{if(listening())try{input.stop();}catch{fail('未能结束录音，请重试。');}},1200);
    };
    input.onerror=event=>{
      if(!listening())return;
      if(event.error==='no-speech'){input.onend();try{input.abort();}catch{}return;}
      const errors={
        'not-allowed':'麦克风或语音权限未开启。请在浏览器设置中允许，并用 Safari、Edge 或 Chrome 打开网页。',
        'service-not-allowed':'系统语音识别不可用。iPhone/iPad 请用 Safari，并检查 Siri 或听写是否已开启。',
        'audio-capture':'没有找到可用麦克风，请检查设备与权限。',
        'network':'语音识别服务连接失败。请检查网络，或用键盘上的麦克风输入。',
        'language-not-supported':'设备暂不支持这个识别语言，请切换语言或使用键盘听写。'
      };
      fail(errors[event.error]||'语音识别中断了，请重新点击语音对话。');
    };
    input.onend=async()=>{
      if(!listening())return;settled=true;recognition=null;clearTimers();
      if(!finalText){resume(id);return;}
      state('thinking');
      try{
        const reply=await onTurn(finalText);
        if(!current(id))return;
        if(!reply){stop();return;}
        state('speaking');
        const spoken=await speak(reply);
        if(!current(id))return;
        if(!spoken){cancelSpeech();onError('这次自动朗读未完成，回复文字已保留。语音对话仍开启，可以继续说；也可结束语音后点回复下方的朗读按钮重试。');}
        resume(id);
      }catch{if(current(id))fail('这次语音对话未完成，请重试。');}
    };
    try{input.start();}catch{fail('语音识别未能启动。请检查浏览器权限，或使用键盘听写。');}
  }
  return {
    get active(){return active;},
    start(){if(active)return;active=true;const id=++version;cancelSpeech();listen(id);},
    stop,
    interrupt(){if(!active||phase!=='speaking')return;const id=++version;clearTimers();cancelSpeech();resume(id);},
    finish(){try{recognition?.stop();}catch{fail('未能结束录音，请重试。');}}
  };
}
