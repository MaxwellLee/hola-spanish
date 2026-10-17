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
  assert.equal(input.lang,'es-ES');input.result('Ho',false);assert.equal(calls.turns.length,0);
  input.result('Hola');await pause(1);assert.deepEqual(calls.turns,['Hola']);assert.deepEqual(calls.speech,['¡Hola!']);
  await pause(480);assert.notEqual(Recognition.instances.at(-1),input);assert.equal(calls.states.at(-1),'listening');
  dialogue.stop();assert(Recognition.instances.at(-1).aborted);assert.equal(dialogue.active,false);
  input.result('late');assert.equal(calls.turns.length,1);
}
for(const error of ['not-allowed','network','no-speech']){
  const {dialogue,calls}=fixture();dialogue.start();const count=Recognition.instances.length;
  Recognition.instances.at(-1).onerror({error});assert(!dialogue.active);assert.equal(calls.errors.length,1);
  await pause(480);assert.equal(Recognition.instances.length,count);assert.equal(calls.turns.length,0);
}
{
  let finish;const {dialogue,calls}=fixture({language:()=> 'zh-CN',onTurn:()=>new Promise(resolve=>{finish=resolve;})});
  dialogue.start();const input=Recognition.instances.at(-1);assert.equal(input.lang,'zh-CN');input.result('你好');
  dialogue.stop();finish('¡Hola!');await pause(1);assert.equal(calls.speech.length,0);assert.equal(calls.stops,1);
}
{
  let finish;const {dialogue}=fixture({speak:()=>new Promise(resolve=>{finish=resolve;})});
  dialogue.start();Recognition.instances.at(-1).result('Hola');await pause(1);const count=Recognition.instances.length;
  dialogue.stop();finish(true);await pause(480);assert.equal(Recognition.instances.length,count);
}
{
  const {dialogue,calls}=fixture();dialogue.start();Recognition.instances.at(-1).result('a'.repeat(1201));assert(!dialogue.active);assert.equal(calls.turns.length,0);assert.equal(calls.errors.length,1);
}
console.log('Speech flow checks passed: interim/final transcript, one request per turn, reply playback, resume listening, denial/network/silence, language selection, stop during request/playback and oversized speech. Hardware not simulated.');
