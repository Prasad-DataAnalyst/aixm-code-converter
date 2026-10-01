// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
const {chromium}=require('./_env').playwright;const fs=require('fs');
const ROOT = require('./_env').ROOT;const OUT = process.argv[2] || require('./_env').out('library');
(async()=>{const b=await chromium.launch({executablePath:require('./_env').chrome});
const ctx=await b.newContext({viewport:{width:1500,height:920}});const p=await ctx.newPage();
p.on('dialog',d=>d.accept()); // the app asks before leaving with data loaded (beforeunload): accept it for the reload below
const errs=[];p.on('pageerror',e=>errs.push(e.message+'\n'+e.stack));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
// serve via http so OPFS/IndexedDB persist across reloads in same context
const http=require('http');const srv=http.createServer((q,r)=>{r.writeHead(200,{'content-type':'text/html'});r.end(fs.readFileSync(ROOT+'/AIXM-Code-Converter.html'));}).listen(8765);
await p.goto('http://localhost:8765/');
const files={Saudi:['temporality/EA_AIP_DS_FULL_20181206_AIRAC.xml','temporality/EA_AIP_DS_FULL_20190131_AIRAC.xml'],UAE:['sample_aixm45_snapshot.xml'],India:['Donlon_EADD_changes_AIRAC2611.xml']};
for (const st in files) for (const f of files[st]) {
  const data=fs.readFileSync(ROOT+'/testdata/'+f).toString('base64');
  await p.evaluate(async([st,name,data])=>{const root=await navigator.storage.getDirectory();const d=await root.getDirectoryHandle(st,{create:true});const fh=await d.getFileHandle(name,{create:true});const w=await fh.createWritable();const bin=Uint8Array.from(atob(data),c=>c.charCodeAt(0));await w.write(bin);await w.close();},[st,f.split('/').pop(),data]);
}
await p.evaluate(async()=>{const root=await navigator.storage.getDirectory();await window.__AIXM.useHandle(root);window.__AIXM.go('library');});
await p.waitForTimeout(1500);await p.screenshot({path:OUT+'/lib-1.png'});
let t=Date.now();await p.evaluate(()=>window.__AIXM.openLatest('Saudi'));await p.waitForFunction(()=>window.__AIXM.S.view==='dash');console.log('open Saudi (parse)',Date.now()-t,'ms');
await p.waitForTimeout(800);
t=Date.now();await p.evaluate(()=>window.__AIXM.openLatest('UAE'));await p.waitForTimeout(500);console.log('open UAE',Date.now()-t);
await p.click('#state-btn');await p.waitForTimeout(300);await p.screenshot({path:OUT+'/lib-switcher.png'});await p.keyboard.press('Escape');
// reload page -> cache
await p.reload();await p.waitForTimeout(1500);
console.log('after reload status',await p.evaluate(()=>window.__AIXM.LIB.status+' cached='+window.__AIXM.LIB.cached.size));
t=Date.now();await p.evaluate(()=>window.__AIXM.openLatest('Saudi'));await p.waitForFunction(()=>window.__AIXM.S.datasets.length>0);console.log('reopen Saudi from cache',Date.now()-t,'ms', await p.evaluate(()=>window.__AIXM.S.datasets[0].state+' '+window.__AIXM.S.datasets[0].recs.length));
// changes vs prev via library
await p.evaluate(()=>window.__AIXM.go('library'));await p.waitForTimeout(500);
await p.click('[data-cmpprev="Saudi|0"]');await p.waitForTimeout(3000);
await p.screenshot({path:OUT+'/lib-cmpprev-dash.png'});
await p.evaluate(()=>{window.__AIXM.S.aipSel='ENR 4.4';window.__AIXM.go('aip');});await p.waitForTimeout(700);
console.log('red cells',await p.evaluate(()=>document.querySelectorAll('.src.chg').length));
await p.screenshot({path:OUT+'/lib-enr44.png'});
// XML view from cached dataset
await p.click('table.aip .src.chg');await p.waitForTimeout(600);await p.screenshot({path:OUT+'/lib-xml.png'});
console.log('xml lines',await p.evaluate(()=>document.querySelectorAll('pre.xml .ln').length));
console.log('errors',errs); if (errs.length) process.exitCode = 1;srv.close();await b.close();})();
