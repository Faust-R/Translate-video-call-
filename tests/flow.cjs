const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto').webcrypto;
const code=fs.readFileSync('app.js','utf8');
class Emitter{constructor(){this.events={};}on(n,f){(this.events[n]??=[]).push(f);}emit(n,x){for(const f of [...(this.events[n]||[])])f(x);}}
function harness(hash=''){
 const els={};const $=id=>els[id]??={value:'',textContent:'',hidden:false,disabled:false,checked:false,options:[{value:'ru'},{value:'vi'},{value:'en'}],play:async()=>{},querySelector:()=>({textContent:''})};$('language').value='ru';
 const channels=[],sockets=[],peers=[],tracks=[{kind:'audio',enabled:true,stop(){this.stopped=true;}},{kind:'video',enabled:true,stop(){this.stopped=true;}}];const stream={getTracks:()=>tracks,getAudioTracks:()=>[tracks[0]],getVideoTracks:()=>[tracks[1]]};
 class Channel extends Emitter{constructor(){super();this.open=true;this.peer='guest';this.sent=[];channels.push(this);}send(m){this.sent.push(m);}close(){this.open=false;this.emit('close');}}
 class Call extends Emitter{constructor(){super();this.peerConnection={addEventListener(){}};}close(){this.emit('close');}answer(){}}
 class Peer extends Emitter{constructor(id){super();this.id=id;peers.push(this);queueMicrotask(()=>this.emit('open'));}call(id,s){const c=new Call();this.lastCall=c;return c;}connect(){return new Channel();}destroy(){this.destroyed=true;}}
 class AudioContext{constructor(){this.state='running';this.audioWorklet={addModule:async()=>{}};this.destination={};}async resume(){}async close(){this.state='closed';}createMediaStreamSource(){return {connect(){},disconnect(){}};}}
 class Socket{constructor(url){this.url=url;this.readyState=1;this.bufferedAmount=0;this.sent=[];sockets.push(this);queueMicrotask(()=>this.onopen?.());}send(x){this.sent.push(JSON.parse(x));}close(){this.closed=true;}}
 const context=vm.createContext({document:{getElementById:$},location:{hash,href:'https://test.example/'+hash},navigator:{mediaDevices:{getUserMedia:async()=>stream},clipboard:{writeText:async()=>{}}},window:{addEventListener(){}},Peer,AudioContext,AudioWorkletNode:class{constructor(){this.port={};}connect(){}disconnect(){}},WebSocket:Socket,URL,URLSearchParams,crypto,Uint8Array,Blob,Error,Promise,Set,queueMicrotask,btoa:x=>Buffer.from(x,'binary').toString('base64'),setTimeout:(f,t)=>{const h=setTimeout(f,t);h.unref();return h;},clearTimeout});vm.runInContext(fs.readFileSync('translation.js','utf8'),context);vm.runInContext(code,context);
 return {$,peers,sockets,channels,Channel,stream,tracks,context};
}
const flush=()=>new Promise(r=>setImmediate(r));
(async()=>{
 const h=harness();await h.$('invite').onclick();assert.match(h.$('status').textContent,/Введите/);assert.equal(h.peers.length,0);
 h.$('credential').value='test-host-key';h.$('consent').checked=true;await h.$('invite').onclick();const link=h.$('inviteLink').value;assert.ok(link.includes('#call='));assert.ok(!link.includes('test-host-key'));const p=new URLSearchParams(new URL(link).hash.slice(1));
 const bad=new h.Channel();h.peers[0].emit('connection',bad);bad.emit('data',{type:'hello',secret:'wrong',language:'vi',consent:true});assert.equal(bad.open,false);assert.equal(h.sockets.length,0);
 const c=new h.Channel();h.peers[0].emit('connection',c);c.emit('data',{type:'hello',secret:p.get('secret'),language:'vi',consent:true});h.peers[0].lastCall.emit('stream',h.stream);await flush();
 // Captions keep both streams even when the original arrives after translation.
 await h.sockets[0].onmessage({data:JSON.stringify({serverContent:{outputTranscription:{text:'Здравствуйте'}}})});
 await h.sockets[0].onmessage({data:JSON.stringify({serverContent:{inputTranscription:{text:'Xin chào'}}})});
 assert.equal(h.$('subtitle').textContent,'Здравствуйте');assert.equal(h.$('original').textContent,'Xin chào');
 await h.sockets[0].onmessage({data:JSON.stringify({serverContent:{turnComplete:true}})});
 assert.equal(h.$('subtitle').textContent,'Здравствуйте');assert.equal(h.$('original').textContent,'Xin chào');
 h.$('stopAI').onclick();assert.equal(h.$('subtitle').textContent,'Здравствуйте');
 await h.$('translate').onclick();await flush();h.sockets.splice(0,2);
 assert.equal(h.sockets.length,2);assert.ok(h.sockets.every(s=>s.url.endsWith('key=test-host-key')));assert.deepEqual(h.sockets.map(s=>s.sent[0].setup.generationConfig.translationConfig.targetLanguageCode).sort(),['ru','vi']);assert.ok(!JSON.stringify(c.sent).includes('test-host-key'));
 h.sockets[1].onmessage({data:JSON.stringify({serverContent:{outputTranscription:{text:'Xin chào'}}})});await flush();assert.ok(c.sent.some(x=>x.type==='caption'&&x.text==='Xin chào'));
 c.emit('data',{type:'prefs',language:'vi',consent:false});await flush();assert.ok(h.sockets[0].closed&&h.sockets[1].closed);assert.equal(h.sockets.length,3);assert.equal(h.sockets[2].sent[0].setup.generationConfig.translationConfig.targetLanguageCode,'vi');
 h.$('hangup').onclick();assert.equal(h.$('credential').value,'');assert.equal(h.$('inviteLink').value,'');assert.ok(h.tracks.every(t=>t.stopped));assert.ok(h.sockets.every(s=>s.closed));assert.ok(h.peers[0].destroyed);
 vm.runInContext("showCaption('one','a','1');showCaption('one updated','a','1');showCaption('two','b','2');showCaption('three','c','3');showCaption('four','d','4');",h.context);assert.equal(h.$('subtitleOldest').textContent,'two');assert.equal(h.$('subtitlePrevious').textContent,'three');assert.equal(h.$('subtitle').textContent,'four');vm.runInContext('clearCaption()',h.context);assert.equal(h.$('captionPrevious').hidden,true);
 const ds=harness();ds.$('chatProvider').value='deepseek';ds.$('deepseekKey').value='deepseek-only-key';await ds.$('invite').onclick();assert.equal(ds.peers.length,1);assert.ok(ds.$('inviteLink').value.includes('#call='));assert.ok(!ds.$('inviteLink').value.includes('deepseek-only-key'));ds.peers[0].emit('error',{type:'peer-unavailable'});assert.match(ds.$('status').textContent,/Организатор недоступен/);assert.equal(ds.$('connectionError').textContent,'Код: peer-unavailable');assert.equal(ds.$('deepseekKey').value,'');
 const g=harness(new URL(link).hash);assert.equal(g.$('language').value,'vi');assert.equal(g.$('hostKey').hidden,true);assert.equal(g.$('join').hidden,false);assert.equal(g.$('translate').hidden,true);await g.$('join').onclick();assert.equal(g.peers.length,1);assert.equal(g.sockets.length,0);g.$('hangup').onclick();
 console.log('PASS: one key / two directions; secret validation; no key in link or guest messages; consent revocation; guest requires no key; DeepSeek-only invitation; typed connection errors; call cleanup.');
})();
