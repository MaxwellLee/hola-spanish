// Browser recognition transcribes audio; the AI receives text only.
export function createSpeechDialogue({Recognition,language,onTranscript,onTurn,speak,cancelSpeech,onState,onError,onStop}) {
  let active=false,version=0,recognition=null,timer=null;
  const current=id=>active&&id===version;
  function stop(){
    const wasActive=active;active=false;version++;clearTimeout(timer);
    const old=recognition;recognition=null;try{old?.abort();}catch{}
    cancelSpeech();onState('idle');if(wasActive)onStop();
  }
  function fail(message){stop();onError(message);}
  function listen(id){
    if(!current(id))return;
    let finalText='',settled=false;
    try{recognition=new Recognition();}catch{fail('语音服务无法启动，请改用键盘麦克风输入。');return;}
    const input=recognition;input.lang=language();input.continuous=false;input.interimResults=true;input.maxAlternatives=1;
    onState('starting');
    timer=setTimeout(()=>{if(current(id))fail('等待语音超时。请检查麦克风权限，再点击语音对话。');},30000);
    input.onstart=()=>{if(current(id))onState('listening');};
    input.onresult=event=>{
      if(!current(id)||settled)return;
      const finals=[],partial=[];
      for(let i=0;i<event.results.length;i++){
        const result=event.results[i];(result.isFinal?finals:partial).push(result[0].transcript);
      }
      finalText=finals.join(' ').trim();
      onTranscript([...finals,...partial].join(' ').trim());
      if(finalText.length>1200){fail('这段话太长了，请每次说一两句。');return;}
      if(finalText&&!partial.length){try{input.stop();}catch{}}
    };
    input.onerror=event=>{
      if(!current(id)||settled)return;
      const errors={
        'not-allowed':'麦克风或语音权限未开启。请在浏览器设置中允许，并用 Safari、Edge 或 Chrome 打开网页。',
        'service-not-allowed':'系统语音识别不可用。iPhone/iPad 请用 Safari，并检查 Siri 或听写是否已开启。',
        'audio-capture':'没有找到可用麦克风，请检查设备与权限。',
        'network':'语音识别服务连接失败。请检查网络，或用键盘上的麦克风输入。',
        'no-speech':'没有听清，请点击语音对话后再说一句。',
        'language-not-supported':'设备暂不支持这个识别语言，请切换语言或使用键盘听写。'
      };
      fail(errors[event.error]||'语音识别中断了，请重新点击语音对话。');
    };
    input.onend=async()=>{
      if(!current(id)||settled)return;settled=true;recognition=null;clearTimeout(timer);
      if(!finalText){fail('没有听清，请点击语音对话后再说一句。');return;}
      onState('thinking');
      try{
        const reply=await onTurn(finalText);
        if(!current(id))return;
        if(!reply){stop();return;}
        onState('speaking');
        const spoken=await speak(reply);
        if(!current(id))return;
        if(!spoken){fail('自动朗读未完成。可以点回复下方的「听西语部分」，再重新开始语音对话。');return;}
        // Wait for the speaker to fall quiet before reopening the microphone.
        timer=setTimeout(()=>listen(id),450);
      }catch{if(current(id))fail('这次语音对话未完成，请重试。');}
    };
    try{input.start();}catch{fail('语音识别未能启动。请检查浏览器权限，或使用键盘听写。');}
  }
  return {
    get active(){return active;},
    start(){if(active)return;active=true;const id=++version;cancelSpeech();listen(id);},
    stop,
    finish(){try{recognition?.stop();}catch{fail('未能结束录音，请重试。');}}
  };
}
