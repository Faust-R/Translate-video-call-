'use strict';
// Only authenticated ciphertext is persisted. Passwords and decrypted keys stay in memory.
const KeyVault = (() => {
 const iterations=600000, names=['credential','chatGeminiKey','deepseekKey'];
 const encode=b=>btoa(String.fromCharCode(...new Uint8Array(b)));
 const decode=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
 async function derive(password,salt){
  const base=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
 }
 function clean(data){const result={};for(const n of names)if(typeof data[n]==='string'&&data[n].trim())result[n]=data[n].trim();return result;}
 async function seal(data,key,salt){
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const bytes=new TextEncoder().encode(JSON.stringify(clean(data)));
  const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode('Lingua vault v1')},key,bytes);
  return JSON.stringify({v:1,iterations,salt:encode(salt),iv:encode(iv),ciphertext:encode(ciphertext)});
 }
 async function create(data,password){const salt=crypto.getRandomValues(new Uint8Array(16)),key=await derive(password,salt);return {key,salt,record:await seal(data,key,salt)};}
 async function open(record,password){
  const r=JSON.parse(record);if(r.v!==1||r.iterations!==iterations||record.length>50000)throw Error('format');
  const salt=decode(r.salt),iv=decode(r.iv);if(salt.length!==16||iv.length!==12)throw Error('format');
  const key=await derive(password,salt);
  const bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode('Lingua vault v1')},key,decode(r.ciphertext));
  return {key,salt,data:clean(JSON.parse(new TextDecoder().decode(bytes)))};
 }
 return {names,clean,create,open,seal};
})();
if(typeof module!=='undefined')module.exports=KeyVault;
if(typeof document!=='undefined') (()=>{
 if(new URLSearchParams(location.hash.slice(1)).has('call'))return;
 const $=id=>document.getElementById(id),storageKey='lingua.encrypted-keys.v1';
 let unlocked=null,record=null,revision=0,busy=false,available=true;
 const say=text=>{$('vaultStatus').textContent=text;};
 function render(){
  $('vaultPasswordBox').hidden=!!unlocked;
  $('vaultPassword').autocomplete=record?'current-password':'new-password';
  $('vaultUnlock').hidden=!record||!!unlocked;
  $('vaultSave').disabled=busy||!available||!!record&&!unlocked;
  $('vaultUnlock').disabled=busy||!available;
  $('vaultLock').hidden=!unlocked;
  $('vaultDelete').hidden=!record;
  $('vaultDelete').disabled=busy;
  $('vaultRemove').hidden=!unlocked;
  $('vaultRemove').disabled=busy;
  $('vaultPassword').disabled=busy||!available;
 }
 function clearFields(){for(const n of KeyVault.names){$(n).value='';$(n).dispatchEvent(new Event('input',{bubbles:true}));}window.linguaKeyChecks?.clear();}
 function lock(){revision++;unlocked=null;busy=false;$('vaultPassword').value='';clearFields();say(record?'Ключи заблокированы':'Ключи не сохранены');render();}
 try{record=localStorage.getItem(storageKey);}catch{available=false;}
 if(!globalThis.crypto?.subtle)available=false;
 say(!available?'Сохранение недоступно в этом браузере':record?'Введите пароль для ключей':'Сохранять ключи необязательно');render();
 async function run(action){if(busy||!available)return;busy=true;const ticket=revision;render();say('Обрабатываем…');try{await action(()=>ticket===revision);}catch{if(ticket===revision)say('Не удалось открыть или сохранить ключи. Проверьте пароль и доступ к хранилищу.');}finally{if(ticket===revision){busy=false;$('vaultPassword').value='';render();}}}
 function persist(next){if(localStorage.getItem(storageKey)!==record)throw Error('changed');localStorage.setItem(storageKey,next);record=next;}
 $('vaultUnlock').onclick=()=>run(async valid=>{
  if(!$('vaultPassword').value){say('Введите пароль');return;}
  const result=await KeyVault.open(record,$('vaultPassword').value);if(!valid())return;
  if(localStorage.getItem(storageKey)!==record)throw Error('changed');
  unlocked=result;for(const n of KeyVault.names){$(n).value=result.data[n]||'';$(n).dispatchEvent(new Event('input',{bubbles:true}));}
  if(result.data.deepseekKey&&!result.data.credential&&!result.data.chatGeminiKey){$('chatProvider').value='deepseek';$('chatProvider').dispatchEvent(new Event('change'));}
  say('Ключи разблокированы');
 });
 $('vaultSave').onclick=()=>run(async valid=>{
  const values=KeyVault.clean(Object.fromEntries(KeyVault.names.map(n=>[n,$(n).value])));
  if(!Object.keys(values).length){say('Введите хотя бы один ключ');return;}
  if(!unlocked){
   const password=$('vaultPassword').value;if(password.length<8){say('Пароль — минимум 8 символов');return;}
   const result=await KeyVault.create(values,password);if(!valid())return;persist(result.record);unlocked={key:result.key,salt:result.salt,data:values};
  }else{const data={...unlocked.data,...values},next=await KeyVault.seal(data,unlocked.key,unlocked.salt);if(!valid())return;persist(next);unlocked.data=data;}
  say('Ключи сохранены на этом устройстве');
 });
 $('vaultRemove').onclick=()=>run(async valid=>{
  const n=$('vaultRemoveChoice').value,data={...unlocked.data};delete data[n];
  const next=await KeyVault.seal(data,unlocked.key,unlocked.salt);if(!valid())return;persist(next);unlocked.data=data;$(n).value='';$(n).dispatchEvent(new Event('input',{bubbles:true}));say('Выбранный ключ удалён');
 });
 $('vaultLock').onclick=lock;
 $('vaultDelete').onclick=()=>{
  if(!confirm(typeof uiText==='function'?uiText('Удалить все сохранённые ключи с этого устройства?'):'Удалить все сохранённые ключи с этого устройства?'))return;
  try{localStorage.removeItem(storageKey);record=null;lock();say('Сохранённые ключи удалены');}catch{say('Не удалось удалить ключи');}
 };
 window.linguaVault={lock};window.addEventListener('pagehide',lock);
 window.addEventListener('storage',event=>{if(event.key===storageKey||event.key===null){try{record=localStorage.getItem(storageKey);}catch{available=false;}lock();}});
})();
