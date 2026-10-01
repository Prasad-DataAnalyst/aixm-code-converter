// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
const { chromium } = require('./_env').playwright;
const ROOT = require('./_env').ROOT, OUT = require('./_env').out('languages');
(async () => {
  const browser = await chromium.launch({ executablePath: require('./_env').chrome });
  const page = await (await browser.newContext({ viewport: { width: 1500, height: 920 } })).newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message + e.stack));
  await page.goto('file://' + ROOT + '/AIXM-Code-Converter.html'); await page.waitForSelector('#drop');
  await page.setInputFiles('#file-input', [ROOT + '/testdata/Donlon_EADD_changes_AIRAC2611.xml']);
  await page.waitForFunction(() => window.__AIXM.S.files.every((f) => f.status === 'ready'));
  await page.click('#extract-btn');
  await page.waitForFunction(() => window.__AIXM.S.view === 'dash', null, { timeout: 60000 });
  await page.selectOption('#lang-sel', 'ar'); await page.waitForTimeout(300);
  await page.screenshot({ path: OUT + '/ar-dash.png' });
  await page.evaluate(() => { const S = window.__AIXM.S, ds = S.datasets[0]; const ad = ds.byType.AirportHeliport.find((a) => /EADD/.test(JSON.stringify(a.cur.p.locationIndicatorICAO))); S.aipSel = 'AD2.12:' + ad.i; S.aipOpen['AD:' + ad.i] = true; S.hlOn = true; window.__AIXM.go('aip'); });
  await page.waitForSelector('table.aip'); await page.waitForTimeout(500);
  await page.screenshot({ path: OUT + '/ar-aip.png' });
  await page.click('table.aip .src'); await page.waitForSelector('#drawer.open'); await page.waitForTimeout(400);
  await page.screenshot({ path: OUT + '/ar-drawer.png' });
  await page.keyboard.press('Escape');
  await page.selectOption('#lang-sel', 'en'); await page.waitForTimeout(300);
  console.log('back to en:', await page.evaluate(() => document.documentElement.dir + ' ' + document.querySelector('#nav').innerText.replace(/\s+/g, ' ')));
  await page.selectOption('#lang-sel', 'fr'); await page.waitForTimeout(200);
  console.log('fr:', await page.evaluate(() => document.querySelector('#nav').innerText.replace(/\s+/g, ' ') + ' | ' + document.querySelector('.sec-head h2').innerText));
  await page.selectOption('#lang-sel', 'en');
  console.log(errors.join('\n') || 'no errors'); if (errors.length) process.exitCode = 1; await browser.close();
})();
