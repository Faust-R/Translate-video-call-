const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
const els={},listeners={},storage=new Map();const $=id=>els[id]??={value:'',hidden:false,disabled:false,textContent:'',dispatchEvent(){}};
$('vaultRemoveChoice').value='credential';
const ctx={crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,btoa,atob,URLSearchParams,Event,console,module:{exports:{}},location:{hash:''},localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},document:{getElementById:$},window:{addEventListener:(n,f)=>listeners[n]=f},confirm:()=>true};ctx.globalThis=ctx;
vm.runInNewContext(fs.readFileSync('vault.js','utf8'),ctx);const vault=ctx.module.exports;
(async()=>{
 $('deepseekKey').value='fake-deepseek-secret';$('vaultPassword').value='test-password-123';await $('vaultSave').onclick();
 let record=[...storage.values()][0];assert.ok(record);assert.ok(!record.includes('fake-deepseek-secret'));assert.ok(!record.includes('test-password'));assert.equal($('vaultPassword').value,'');
 ctx.window.linguaVault.lock();assert.equal($('deepseekKey').value,'');
 $('vaultPassword').value='wrong';await $('vaultUnlock').onclick();assert.equal($('deepseekKey').value,'');assert.equal([...storage.values()][0],record);
 $('vaultPassword').value='test-password-123';await $('vaultUnlock').onclick();assert.equal($('deepseekKey').value,'fake-deepseek-secret');assert.equal($('chatProvider').value,'deepseek');
 $('deepseekKey').value='';$('credential').value='fake-gemini-secret';await $('vaultSave').onclick();let opened=await vault.open([...storage.values()][0],'test-password-123');assert.equal(opened.data.deepseekKey,'fake-deepseek-secret');assert.equal(opened.data.credential,'fake-gemini-secret');
 $('credential').value='replacement';await $('vaultSave').onclick();opened=await vault.open([...storage.values()][0],'test-password-123');assert.equal(opened.data.credential,'replacement');
 await $('vaultRemove').onclick();opened=await vault.open([...storage.values()][0],'test-password-123');assert.equal(opened.data.credential,undefined);assert.equal(opened.data.deepseekKey,'fake-deepseek-secret');
 const tampered=JSON.parse(record);tampered.ciphertext=(tampered.ciphertext[0]==='A'?'B':'A')+tampered.ciphertext.slice(1);await assert.rejects(vault.open(JSON.stringify(tampered),'test-password-123'));
 ctx.window.linguaVault.lock();$('vaultPassword').value='test-password-123';const pending=$('vaultUnlock').onclick();ctx.window.linguaVault.lock();await pending;assert.equal($('deepseekKey').value,'');assert.equal($('vaultPassword').value,'');
 $('vaultDelete').onclick();assert.equal(storage.size,0);
 console.log('PASS vault: real Web Crypto encryption, single key, wrong password, preservation, replacement, deletion, tamper rejection, async lock.');
})().catch(e=>{console.error(e);process.exitCode=1;});
