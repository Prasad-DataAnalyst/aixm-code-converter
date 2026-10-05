// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
const {chromium}=require('./_env').playwright;
const ROOT = require('./_env').ROOT;const OUT = process.argv[2] || require('./_env').out('cycle_highlight');
(async()=>{const b=await chromium.launch({executablePath:require('./_env').chrome});const p=await (await b.newContext({viewport:{width:1500,height:920}})).newPage();
const errs=[];p.on('pageerror',e=>errs.push(e.message+'\n'+e.stack));
await p.goto('file://'+ROOT+'/AIXM-Code-Converter.html');
await p.setInputFiles('#file-input',[ROOT+'/testdata/Donlon_EADD_changes_AIRAC2611.xml',ROOT+'/testdata/temporality/EA_AIP_DS_FULL_20181206_AIRAC.xml',ROOT+'/testdata/temporality/EA_AIP_DS_FULL_20190131_AIRAC.xml']);
await p.waitForFunction(()=>window.__AIXM.S.files.length===3&&window.__AIXM.S.files.every(f=>f.status==='ready'));
await p.click('#extract-btn');await p.waitForFunction(()=>window.__AIXM.S.view==='dash');
console.log(await p.evaluate(()=>window.__AIXM.S.datasets.map(d=>d.name+' '+(d.airac&&d.airac.id))));
await p.screenshot({path:OUT+'/hl-dash.png'});
// select cycle 2611 for dataset 0 
await p.evaluate(()=>{const S=window.__AIXM.S;S.active=0;const d=S.datasets[0];const c=ANALYSIS.changeCycles(d);d.hlCycle=c.find(x=>x.cycle.id==='2611').cycle;d.cyc=null;const ad=d.byType.AirportHeliport.find(a=>/EADD/.test(JSON.stringify(a.cur.p.locationIndicatorICAO)));S.aipSel='AD2.12:'+ad.i;S.aipOpen['AD:'+ad.i]=true;window.__AIXM.go('aip');});
await p.waitForSelector('table.aip');await p.waitForTimeout(400);
await p.screenshot({path:OUT+'/hl-ad212.png'});
console.log('red cells', await p.evaluate(()=>document.querySelectorAll('.src.chg').length));
await p.click('[data-chglist]');await p.waitForTimeout(300);await p.screenshot({path:OUT+'/hl-list.png'});
await p.keyboard.press('Escape');
// compare-based: 20181206 vs 20190131
await p.evaluate(()=>{const S=window.__AIXM.S;S.active=S.datasets.findIndex(d=>/20190131_AIRAC/.test(d.name));window.__AIXM.go('dash');});
await p.waitForTimeout(300);
await p.evaluate(()=>{const b=[...document.querySelectorAll('[data-prev]')].find(x=>{let c=x.parentElement;while(c&&!/20190131_AIRAC/.test(c.textContent||'')||(c&&/2611/.test(c.textContent)&&c.parentElement&&/20190131_AIRAC/.test(c.parentElement.textContent)&&false))c=c.parentElement;return c&&c.textContent.indexOf('20190131_AIRAC.xml')>=0&&c.textContent.indexOf('AIRAC2611.xml')<0;}); console.log(!!b); if(b) b.click();});
await p.waitForTimeout(2500);
await p.screenshot({path:OUT+'/hl-dash2.png'});
await p.evaluate(()=>{const S=window.__AIXM.S;S.aipSel='ENR 4.4';window.__AIXM.go('aip');});await p.waitForTimeout(700);
await p.screenshot({path:OUT+'/hl-enr44.png'});
console.log('red cells enr', await p.evaluate(()=>document.querySelectorAll('.src.chg').length));
console.log('errors',errs); if (errs.length) process.exitCode = 1;await b.close();})();
