// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
const path = require('path'); const fs = require('fs');
const { chromium } = require('./_env').playwright;
const ROOT = require('./_env').ROOT, OUT = require('./_env').out('procedures_map');
(async () => {
  const browser = await chromium.launch({ executablePath: require('./_env').chrome });
  const page = await (await browser.newContext({ viewport: { width: 1500, height: 920 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message + e.stack));
  page.on('console', (m) => { if (m.type() === 'error' && !/net::|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto('file://' + ROOT + '/AIXM-Code-Converter.html');
  await page.waitForSelector('#drop');
  await page.setInputFiles('#file-input', [ROOT + '/testdata/Donlon_EADD_changes_AIRAC2611.xml']);
  await page.waitForFunction(() => window.__AIXM.S.files.every((f) => f.status === 'ready'));
  await page.click('#extract-btn');
  await page.waitForFunction(() => window.__AIXM.S.view === 'dash', null, { timeout: 60000 });
  const i = await page.evaluate(() => { const ds = window.__AIXM.S.datasets[0]; const ad = ds.byType.AirportHeliport.find((a) => /EADD/.test(JSON.stringify(a.cur.p.locationIndicatorICAO))); window.__AIXM.S.aipSel = 'AD2.22:' + ad.i; window.__AIXM.S.aipOpen['AD:' + ad.i] = true; window.__AIXM.go('aip'); return ad.i; });
  await page.waitForSelector('table.aip'); await page.waitForTimeout(500);
  await page.screenshot({ path: OUT + '/ad222.png' });
  await page.click('[data-x="map"]');
  await page.waitForTimeout(1500);
  console.log(await page.evaluate(() => JSON.stringify({view: window.__AIXM.S.view, zoom: MAPVIEW.leaflet().getZoom(), c: MAPVIEW.leaflet().getCenter()})));
  const cnt = await page.evaluate(() => document.querySelector('[data-count="procs"]').textContent);
  console.log('proc legs drawn', cnt);
  console.log(await page.evaluate(() => { try { const ds = window.__AIXM.S.datasets[0]; const ad = ds.byType.AirportHeliport.find((a) => /EADD/.test(JSON.stringify(a.cur.p.locationIndicatorICAO))); MAPVIEW.showProcs(ds, ad); return 'zoom after manual ' + MAPVIEW.leaflet().getZoom(); } catch (e) { return 'ERR ' + e.stack; } }));
  await page.waitForTimeout(800); await page.screenshot({ path: OUT + '/procmap2.png' });
  console.log(await page.evaluate(() => { const ds = window.__AIXM.S.datasets[0]; const pr = ds.byType.StandardInstrumentDeparture; return JSON.stringify(pr.map((p) => MAPVIEW.procPaths(ds, p).map((x) => x.coords))); }));
  await page.screenshot({ path: OUT + '/procmap.png' });
  console.log(errors.join('\n') || 'no errors'); if (errors.length) process.exitCode = 1;
  await browser.close();
})();
