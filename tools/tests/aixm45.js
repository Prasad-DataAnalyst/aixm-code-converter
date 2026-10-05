// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
const {chromium}=require('./_env').playwright;
const ROOT = require('./_env').ROOT;const OUT = process.argv[2] || require('./_env').out('aixm45');
(async()=>{const b=await chromium.launch({executablePath:require('./_env').chrome});const p=await (await b.newContext({viewport:{width:1500,height:920}})).newPage();
const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('file://'+ROOT+'/AIXM-Code-Converter.html');
await p.setInputFiles('#file-input',[ROOT+'/testdata/sample_aixm45_snapshot.xml',ROOT+'/testdata/chicago_airspace_crs84_51.xml',ROOT+'/testdata/chicago_runways_51.xml']);
await p.waitForFunction(()=>window.__AIXM.S.files.length===3&&window.__AIXM.S.files.every(f=>f.status==='ready'));
await p.click('#extract-btn');await p.waitForFunction(()=>window.__AIXM.S.view==='dash');
await p.screenshot({path:OUT+'/45-dash.png'});
await p.click('button[data-view="aip"]');await p.waitForSelector('.sec-body');await p.waitForTimeout(300);
await p.screenshot({path:OUT+'/45-ad22.png'});
const ad=await p.evaluate(()=>window.__AIXM.S.datasets[0].byType.AirportHeliport[0].i);
for (const n of [12,13,14,19]) { await p.evaluate(([i,n])=>{window.__AIXM.S.aipSel='AD2.'+n+':'+i;window.__AIXM.go('aip');},[ad,n]); await p.waitForTimeout(500); await p.screenshot({path:OUT+'/45-ad2'+n+'.png'}); }
await p.evaluate(()=>{window.__AIXM.S.aipSel='ENR 2.1';window.__AIXM.go('aip');});await p.waitForTimeout(500);await p.screenshot({path:OUT+'/45-enr21.png'});
await p.evaluate(()=>{window.__AIXM.S.aipSel='ENR 4.1';window.__AIXM.go('aip');});await p.waitForTimeout(500);await p.screenshot({path:OUT+'/45-enr41.png'});
await p.evaluate(()=>{const d=window.__AIXM.S.datasets[0];window.__AIXM.openDetail(d,d.byType.AirportHeliport[0],'raw');});await p.waitForTimeout(400);await p.screenshot({path:OUT+'/45-detail-raw.png'});
await p.keyboard.press('Escape');
await p.evaluate(()=>{window.__AIXM.S.active=1;window.__AIXM.go('map');});await p.waitForSelector('#map.leaflet-container');await p.waitForTimeout(1500);await p.screenshot({path:OUT+'/chicago-map.png'});
await p.evaluate(()=>{window.__AIXM.S.active=0;window.__AIXM.go('map');});await p.waitForTimeout(1500);await p.screenshot({path:OUT+'/45-map.png'});
console.log('errors',errs); if (errs.length) process.exitCode = 1;await b.close();})();
