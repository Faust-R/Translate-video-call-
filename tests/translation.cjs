const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const sockets=[],requests=[],captions=[];let fail,finishFetch;
class Socket{constructor(url){this.url=url;this.readyState=1;this.bufferedAmount=0;this.sent=[];sockets.push(this);}send(v){this.sent.push(JSON.parse(v));}close(){this.closed=true;}}
const context=vm.createContext({WebSocket:Socket,Blob,Uint8Array,DataView,AbortController,setTimeout:(f,t)=>{const h=setTimeout(f,t);h.unref();return h;},clearTimeout,btoa:x=>Buffer.from(x,'binary').toString('base64'),fetch:async(url,options)=>{requests.push({url,options});if(finishFetch)return new Promise(r=>finishFetch=r);return {ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:'Xin chào'}]}}]})};}});
vm.runInContext(fs.readFileSync('translation.js','utf8'),context);
const Gate=vm.runInContext('SilenceGate',context),Providers=vm.runInContext('TranslationProviders',context);
function pcm(value){const b=new ArrayBuffer(3200),v=new DataView(b);for(let i=0;i<3200;i+=2)v.setInt16(i,value,true);return b;}
const quiet=pcm(0),voice=pcm(1800);let frames=0,ends=0;const gate=new Gate({onAudio:()=>frames++,onEnd:()=>ends++});
for(let i=0;i<100;i++)gate.push(quiet);assert.equal(frames,0);gate.push(voice);assert.equal(frames,4);for(let i=0;i<7;i++)gate.push(quiet);assert.equal(frames,11);assert.equal(ends,1);for(let i=0;i<100;i++)gate.push(quiet);assert.equal(frames,11);assert.equal(ends,1);gate.push(voice);assert.equal(frames,15);gate.clear();assert.equal(gate.pre.length,0);
const bypass=new Gate({enabled:false,onAudio:()=>frames++,onEnd:()=>ends++});bypass.push(quiet);assert.equal(frames,16);
(async()=>{
 const p=Providers.create('gemini-text',{key:'sentinel-key',target:'vi',onCaption:(...v)=>captions.push(v),onError:c=>fail=c,onReady(){},onEnding(){}});p.connect();const s=sockets[0];s.onopen();assert.deepEqual(Array.from(s.sent[0].setup.generationConfig.responseModalities),['TEXT']);assert.equal(s.sent[0].setup.model,'models/gemini-3.5-transcribe-live');
 await s.onmessage({data:JSON.stringify({setupComplete:{}})});p.audio(voice);p.endAudio();assert.equal(s.sent.at(-1).realtimeInput.audioStreamEnd,true);
 await s.onmessage({data:JSON.stringify({serverContent:{interimInputTranscription:{text:'Прив'}}})});assert.equal(requests.length,0);
 await s.onmessage({data:JSON.stringify({serverContent:{inputTranscription:{text:'Привет'}}})});await new Promise(r=>setImmediate(r));assert.equal(requests.length,1);assert.equal(requests[0].options.headers['x-goog-api-key'],'sentinel-key');assert.ok(!requests[0].url.includes('sentinel-key'));assert.deepEqual(captions,[['Xin chào','Привет',0]]);assert.equal(fail,undefined);
 finishFetch=true;await s.onmessage({data:JSON.stringify({serverContent:{inputTranscription:{text:'Следующая фраза'}}})});const signal=requests[1].options.signal;p.close();assert.equal(signal.aborted,true);assert.equal(p.queue.length,0);assert.equal(p.key,'');assert.equal(p.translator.key,'');finishFetch({ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:'Late'}]}}]})});await new Promise(r=>setImmediate(r));assert.equal(captions.length,1);
 console.log('PASS: silence suppression, preroll, tail, one end marker, bypass; TEXT setup, final-only translation, original/translation pairing, API header, abort and stale-result suppression.');
})();
