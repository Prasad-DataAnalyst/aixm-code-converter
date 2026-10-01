// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
const {chromium}=require('./_env').playwright;
const ROOT = require('./_env').ROOT;const OUT = process.argv[2] || require('./_env').out('changes');
(async()=>{const b=await chromium.launch({executablePath:require('./_env').chrome});const p=await (await b.newContext({viewport:{width:1500,height:920}})).newPage();
const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('file://'+ROOT+'/AIXM-Code-Converter.html');
const fs=require('fs');const files=fs.readdirSync(ROOT+'/testdata/temporality').map(f=>ROOT+'/testdata/temporality/'+f);
await p.setInputFiles('#file-input',files);
await p.waitForFunction(n=>window.__AIXM.S.files.length===n&&window.__AIXM.S.files.every(f=>f.status==='ready'),files.length);
await p.click('#extract-btn');await p.waitForFunction(()=>window.__AIXM.S.view==='dash');
const info=await p.evaluate(()=>window.__AIXM.S.datasets.map(d=>[d.name,d.recs.length,d.airac&&d.airac.id,d.recs.filter(r=>r.ts.length>1).length]));console.log(JSON.stringify(info));
for (const [i,name] of [[2,'delta'],[3,'decom']]) { await p.evaluate(i=>{window.__AIXM.S.active=i;window.__AIXM.go('changes');},i); await p.waitForTimeout(600); await p.screenshot({path:OUT+'/chg-'+name+'.png'}); const n=await p.evaluate(()=>document.querySelectorAll('#ch-list tbody tr').length); console.log(name,'change rows',n); }
await p.click('button[data-view="compare"]');await p.waitForSelector('#cmp-run');
await p.evaluate(()=>{document.querySelector('#cmp-a').value=1;document.querySelector('#cmp-b').value=2;});
await p.click('#cmp-run');await p.waitForSelector('#cmp-out .stat');await p.waitForTimeout(300);
await p.screenshot({path:OUT+'/cmp-airac.png'});
console.log(await p.evaluate(()=>JSON.stringify(window.__AIXM.S.cmp.stats)));
console.log('errors',errs); if (errs.length) process.exitCode = 1;await b.close();})();
