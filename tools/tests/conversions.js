// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
const {chromium}=require('./_env').playwright;const fs=require('fs');
const ROOT = require('./_env').ROOT;const OUT = process.argv[2] || require('./_env').out('conversions');fs.mkdirSync(OUT,{recursive:true});
(async()=>{const b=await chromium.launch({executablePath:require('./_env').chrome});const p=await (await b.newContext({viewport:{width:1500,height:920},acceptDownloads:true})).newPage();
const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('file://'+ROOT+'/AIXM-Code-Converter.html');
await p.setInputFiles('#file-input',[ROOT+'/testdata/Donlon_ALL_Baseline_2025.xml',ROOT+'/testdata/sample_aixm45_snapshot.xml']);
await p.waitForFunction(()=>window.__AIXM.S.files.length===2&&window.__AIXM.S.files.every(f=>f.status==='ready'));
await p.click('#extract-btn');await p.waitForFunction(()=>window.__AIXM.S.view==='dash');
async function dl(sel,name){const [d]=await Promise.all([p.waitForEvent('download'),p.click(sel)]);await d.saveAs(OUT+'/'+name);console.log(name,fs.statSync(OUT+'/'+name).size);}
await p.evaluate(()=>{window.__AIXM.S.active=0;window.__AIXM.go('export');});await p.waitForSelector('[data-cv="ver"]');
await p.selectOption('#cv-target','5.2');await dl('[data-cv="ver"]','donlon_52.xml');await p.screenshot({path:OUT+'/conv-report.png'});await p.click('[data-close]');
await dl('[data-cv="geojson"]','donlon.geojson');await dl('[data-cv="kml"]','donlon.kml');await dl('[data-cv="shp"]','donlon_shp.zip');
await p.evaluate(()=>{window.__AIXM.S.active=1;window.__AIXM.go('export');});await p.waitForSelector('[data-cv="45"]');
await dl('[data-cv="45"]','lfnt_511.xml');
console.log('errors',errs); if (errs.length) process.exitCode = 1;await b.close();})();
