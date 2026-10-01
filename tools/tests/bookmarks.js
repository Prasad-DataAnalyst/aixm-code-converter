// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
const { chromium } = require('./_env').playwright;
const ROOT = require('./_env').ROOT, OUT = require('./_env').out('bookmarks');
(async () => {
  const browser = await chromium.launch({ executablePath: require('./_env').chrome });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 920 } });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message + e.stack));
  await page.goto('file://' + ROOT + '/AIXM-Code-Converter.html'); await page.waitForSelector('#drop');
  const F = [ROOT + '/testdata/Donlon_EADD_changes_AIRAC2611.xml'];
  await page.setInputFiles('#file-input', F);
  await page.waitForFunction(() => window.__AIXM.S.files.every((f) => f.status === 'ready'));
  await page.click('#extract-btn');
  await page.waitForFunction(() => window.__AIXM.S.view === 'dash', null, { timeout: 60000 });
  await page.evaluate(() => { const S = window.__AIXM.S, ds = S.datasets[0]; const ad = ds.byType.AirportHeliport.find((a) => /EADD/.test(JSON.stringify(a.cur.p.locationIndicatorICAO))); S.aipSel = 'AD2.12:' + ad.i; S.aipOpen['AD:' + ad.i] = true; S.sbs = { key: 'cyc:2611' }; window.__AIXM.go('aip'); });
  await page.waitForSelector('.sbs'); await page.waitForTimeout(400);
  const hash = await page.evaluate(() => location.hash);
  console.log('hash:', hash);
  await page.click('#bm-btn'); await page.waitForSelector('#bm-pop');
  await page.click('[data-bm="save"]'); await page.waitForTimeout(300);
  await page.click('#bm-btn'); await page.waitForSelector('#bm-pop');
  console.log('bookmarks:', await page.evaluate(() => document.querySelector('#bm-pop').innerText.replace(/\s+/g, ' ').slice(0, 300)));
  await page.screenshot({ path: OUT + '/bm.png' });
  // open the link in a fresh page, then load the file -> view restored
  const p2 = await ctx.newPage();
  p2.on('pageerror', (e) => errors.push('p2 ' + e.message));
  await p2.goto('file://' + ROOT + '/AIXM-Code-Converter.html' + hash); await p2.waitForSelector('#drop');
  await p2.setInputFiles('#file-input', F);
  await p2.waitForFunction(() => window.__AIXM.S.files.every((f) => f.status === 'ready'));
  await p2.click('#extract-btn');
  await p2.waitForSelector('.sbs', { timeout: 60000 }); await p2.waitForTimeout(400);
  console.log('restored:', await p2.evaluate(() => window.__AIXM.S.view + ' ' + window.__AIXM.S.aipSel + ' ' + document.querySelector('.sec-head h2').innerText + ' | ' + document.querySelector('.sbs-head.new').innerText));
  // bookmark list persists (IndexedDB) and opening a bookmark works
  await p2.evaluate(() => window.__AIXM.go('dash'));
  await p2.click('#bm-btn'); await p2.waitForSelector('#bm-pop [data-bmo="0"]');
  await p2.click('#bm-pop [data-bmo="0"]'); await p2.waitForSelector('.sbs');
  console.log('bookmark opened:', await p2.evaluate(() => window.__AIXM.S.view + ' ' + document.querySelector('.sec-head h2').innerText));
  // map position in link
  await p2.evaluate(() => window.__AIXM.go('map')); await p2.waitForTimeout(800);
  await p2.evaluate(() => { MAPVIEW.leaflet().setView([52.37, -31.95], 11, { animate: false }); return 1; }); await p2.waitForTimeout(400);
  console.log('map hash:', await p2.evaluate(() => location.hash));
  console.log(errors.join('\n') || 'no errors'); if (errors.length) process.exitCode = 1; await browser.close();
})();
