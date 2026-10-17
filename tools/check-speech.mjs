import assert from 'node:assert/strict';
import {createSpeechDialogue} from '../site/speech-dialogue.js';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
class Recognition {
  static instances=[];
  constructor(){Recognition.instances.push(this);}
  start(){this.onstart();}
  stop(){this.onend();}
  abort(){this.aborted=true;this.onend?.();}
  result(text,final=true){const result=[{transcript:text}];result.isFinal=final;this.onresult({results:[result]});}
}
function fixture(overrides={}){
  const calls={transcripts:[],turns:[],speech:[],states:[],errors:[],stops:0};
  const dialogue=createSpeechDialogue({Recognition,language:()=> 'es-ES',onTranscript:t=>calls.transcripts.push(t),onTurn:async t=>{calls.turns.push(t);return '¡Hola!';},speak:async t=>{calls.speech.push(t);return true;},cancelSpeech(){},onState:s=>calls.states.push(s),onError:e=>calls.errors.push(e),onStop(){calls.stops++;},...overrides});
  return {dialogue,calls};
}
{
  const {dialogue,calls}=fixture();dialogue.start();let input=Recognition.instances.at(-1);
  assert.equal(input.lang,'es-ES');assert.equal(input.continuous,true);input.result('Ho',false);assert.equal(calls.turns.length,0);
  input.result('Hola');await pause(650);assert.equal(calls.turns.length,0);
  input.result('Hola, soy Ana');await pause(650);assert.equal(calls.turns.length,0);
  await pause(600);assert.deepEqual(calls.turns,['Hola, soy Ana']);assert.deepEqual(calls.speech,['¡Hola!']);
  await pause(480);assert.notEqual(Recognition.instances.at(-1),input);assert.equal(calls.states.at(-1),'listening');
  dialogue.stop();assert(Recognition.instances.at(-1).aborted);assert.equal(dialogue.active,false);
  input.result('late');assert.equal(calls.turns.length,1);
}
for(const error of ['not-allowed','network']){
  const {dialogue,calls}=fixture();dialogue.start();const count=Recognition.instances.length;
  Recognition.instances.at(-1).onerror({error});assert(!dialogue.active);assert.equal(calls.errors.length,1);
  await pause(480);assert.equal(Recognition.instances.length,count);assert.equal(calls.turns.length,0);
}
for(const reason of ['no-speech','empty-end']){
  const {dialogue,calls}=fixture();dialogue.start();const first=Recognition.instances.at(-1),count=Recognition.instances.length;
  if(reason==='no-speech')first.onerror({error:reason});else first.onend();
  first.onend();first.result('late');first.onerror({error:'network'});
  assert(dialogue.active);assert.deepEqual(calls.errors,[]);assert.deepEqual(calls.turns,[]);
  await pause(480);assert.equal(Recognition.instances.length,count+1);
  const next=Recognition.instances.at(-1);assert.equal(calls.states.at(-1),'listening');
  next.result('Hola');next.stop();await pause(1);assert.deepEqual(calls.turns,['Hola']);
  dialogue.stop();const stopped=Recognition.instances.length;await pause(480);assert.equal(Recognition.instances.length,stopped);
}
{
  const {dialogue,calls}=fixture({speak:async()=>false});dialogue.start();const input=Recognition.instances.at(-1);input.result('Hola');input.stop();
  await pause(1);assert(dialogue.active);assert.match(calls.errors[0],/仍开启/);
  await pause(480);assert.notEqual(Recognition.instances.at(-1),input);assert.equal(calls.states.at(-1),'listening');dialogue.stop();
}
{
  let finish;const {dialogue,calls}=fixture({language:()=> 'zh-CN',onTurn:()=>new Promise(resolve=>{finish=resolve;})});
  dialogue.start();const input=Recognition.instances.at(-1);assert.equal(input.lang,'zh-CN');input.result('你好');input.stop();
  dialogue.stop();finish('¡Hola!');await pause(1);assert.equal(calls.speech.length,0);assert.equal(calls.stops,1);
}
{
  let finish;const {dialogue}=fixture({speak:()=>new Promise(resolve=>{finish=resolve;})});
  dialogue.start();Recognition.instances.at(-1).result('Hola');Recognition.instances.at(-1).stop();await pause(1);const count=Recognition.instances.length;
  dialogue.stop();finish(true);await pause(480);assert.equal(Recognition.instances.length,count);
}
for(const resolvesOnCancel of [true,false]){
  let finish,cancelled=0;
  const {dialogue,calls}=fixture({speak:()=>new Promise(resolve=>{finish=resolve;}),cancelSpeech:()=>{cancelled++;if(resolvesOnCancel)finish?.(false);}});
  dialogue.start();Recognition.instances.at(-1).result('Hola');Recognition.instances.at(-1).stop();await pause(1);
  assert.equal(calls.states.at(-1),'speaking');const count=Recognition.instances.length;
  dialogue.interrupt();assert(dialogue.active);assert.equal(cancelled,2);
  await pause(480);assert.equal(Recognition.instances.length,count+1);assert.equal(calls.states.at(-1),'listening');
  finish(false);await pause(480);assert.equal(Recognition.instances.length,count+1);assert.deepEqual(calls.errors,[]);dialogue.stop();
}
{
  const {dialogue,calls}=fixture();dialogue.start();Recognition.instances.at(-1).result('Hola');dialogue.stop();
  await pause(1250);assert.deepEqual(calls.turns,[]);
}
{
  const {dialogue,calls}=fixture();dialogue.start();Recognition.instances.at(-1).result('a'.repeat(1201));assert(!dialogue.active);assert.equal(calls.turns.length,0);assert.equal(calls.errors.length,1);
}
console.log('Speech flow checks passed: pause before sending, continuous listening, silence/empty-end recovery, stale events, nonfatal playback failure, interruption, stop during request/playback/pause, permissions/network and oversized speech. Hardware not simulated.');
