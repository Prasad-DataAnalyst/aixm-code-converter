// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
const path = require('path');
const { chromium } = require('./_env').playwright;
const ROOT = require('./_env').ROOT, OUT = require('./_env').out('review_tools');
(async () => {
  const browser = await chromium.launch({ executablePath: require('./_env').chrome });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 920 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message + e.stack));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|ERR_NAME|net::/.test(m.text())) errors.push(m.text()); });
  await page.goto('file://' + ROOT + '/AIXM-Code-Converter.html');
  await page.waitForSelector('#drop');
  const files = ['testdata/Donlon_ALL_Baseline_2025.xml', 'testdata/Donlon_EADD_changes_AIRAC2611.xml', 'testdata/digital_notam/DN_NAV.UNS_1_VOR-DME_all_components_unserviceable.xml', 'testdata/digital_notam/DN_RWY.CLS_1_full_runway_closure.xml', 'testdata/digital_notam/DN_SFC.CON_5_minimum_data.xml'].map((f) => ROOT + '/' + f);
  await page.setInputFiles('#file-input', files);
  await page.waitForFunction((n) => window.__AIXM.S.files.filter((f) => f.status === 'ready').length === n, files.length);
  await page.click('#extract-btn');
  await page.waitForFunction(() => window.__AIXM.S.view === 'dash', null, { timeout: 60000 });
  const names = await page.evaluate(() => window.__AIXM.S.datasets.map((d) => d.name + ' | ' + d.state + ' | ' + (d.airac && d.airac.id)));
  console.log(names.join('\n'));
  // activate the 2611 file, AD 2.12 EADD, side by side before/from 2611
  const idx = await page.evaluate(() => { const S = window.__AIXM.S; const i = S.datasets.findIndex((d) => /2611/.test(d.name)); S.active = i; const ds = S.datasets[i]; const ad = ds.byType.AirportHeliport.find((a) => /EADD/.test(JSON.stringify(a.cur.p.locationIndicatorICAO))); S.aipSel = 'AD2.12:' + ad.i; S.aipOpen['AD:' + ad.i] = true; S.sbs = { key: 'cyc:2611' }; window.__AIXM.go('aip'); return i; });
  await page.waitForSelector('.sbs'); await page.waitForTimeout(500);
  console.log('sbs date:', await page.evaluate(() => document.querySelector('.sbs-bar').innerText.replace(/\s+/g, ' ')));
  console.log('red cells right:', await page.evaluate(() => Array.from(document.querySelectorAll('.sbs-col:nth-child(2) .sbs-new')).map((n) => n.textContent).join(' ; ')));
  console.log('old cells left:', await page.evaluate(() => Array.from(document.querySelectorAll('.sbs-col:nth-child(1) .sbs-old')).map((n) => n.textContent).join(' ; ')));
  await page.screenshot({ path: OUT + '/sbs-date.png' });
  // sbs with the 2025 baseline data set
  await page.evaluate(() => { const S = window.__AIXM.S; S.sbs = { key: 'ds:' + S.datasets.findIndex((d) => /Baseline_2025/.test(d.name)) }; window.__AIXM.go('aip'); });
  await page.waitForSelector('.sbs'); await page.waitForTimeout(400);
  console.log('sbs ds:', await page.evaluate(() => document.querySelector('.sbs-bar').innerText.replace(/\s+/g, ' ')));
  await page.click('[data-sbs-only]'); await page.waitForTimeout(200);
  await page.screenshot({ path: OUT + '/sbs-ds.png' });
  // side-by-side of AD 2.22 (procedures added)
  await page.evaluate(() => { const S = window.__AIXM.S; const ds = S.datasets[S.active]; const ad = ds.byType.AirportHeliport.find((a) => /EADD/.test(JSON.stringify(a.cur.p.locationIndicatorICAO))); S.aipSel = 'AD2.22:' + ad.i; window.__AIXM.go('aip'); });
  await page.waitForSelector('.sbs'); await page.waitForTimeout(300);
  console.log('sbs 2.22:', await page.evaluate(() => document.querySelector('.sbs-bar').innerText.replace(/\s+/g, ' ')));
  // export differences PDF
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.click('[data-sbsx="pdf"]')]);
  console.log('sbs pdf:', dl.suggestedFilename());
  await page.evaluate(() => { window.__AIXM.S.sbs = null; });
  // timeline
  await page.click('button[data-view="timeline"]'); await page.waitForSelector('.tl-strip'); await page.waitForTimeout(300);
  console.log('timeline cols:', await page.evaluate(() => document.querySelectorAll('.tl-col').length), await page.evaluate(() => document.querySelector('.tl-col.sel') && document.querySelector('.tl-col.sel').title));
  await page.screenshot({ path: OUT + '/timeline.png', fullPage: false });
  // AMDT
  await page.click('[data-tl="amdt"]'); await page.waitForSelector('.amdt-banner'); await page.waitForTimeout(300);
  console.log('amdt:', await page.evaluate(() => document.querySelector('.amdt-banner').innerText.replace(/\s+/g, ' ')), '| sections', await page.evaluate(() => document.querySelectorAll('.amdt-sec').length));
  await page.screenshot({ path: OUT + '/amdt.png' });
  const [dl2] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.click('.modal [data-m="pdf"]')]);
  await dl2.saveAs(OUT + '/amdt.pdf'); console.log('amdt pdf:', dl2.suggestedFilename());
  await page.click('.modal [data-m="close"]');
  // NOTAM
  await page.evaluate(() => { const S = window.__AIXM.S; S.active = S.datasets.findIndex((d) => /NAV.UNS/.test(d.name)); window.__AIXM.go('notam'); });
  await page.waitForSelector('.notam-card'); await page.waitForTimeout(300);
  console.log('notam cards:', await page.evaluate(() => document.querySelectorAll('.notam-card').length), await page.evaluate(() => document.querySelector('.notam-aff') && document.querySelector('.notam-aff').innerText.replace(/\s+/g, ' ').slice(0, 300)));
  await page.screenshot({ path: OUT + '/notam.png' });
  await page.evaluate(() => { const S = window.__AIXM.S; S.active = S.datasets.findIndex((d) => /SFC.CON/.test(d.name)); window.__AIXM.go('notam'); });
  await page.waitForSelector('.notam-card');
  console.log('snowtam:', await page.evaluate(() => document.querySelector('.notam-text').innerText.slice(0, 200)));
  console.log(errors.join('\n') || 'no errors'); if (errors.length) process.exitCode = 1;
  await browser.close();
})();
