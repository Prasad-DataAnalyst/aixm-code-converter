// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
const { chromium } = require('./_env').playwright;
const ROOT = require('./_env').ROOT, OUT = require('./_env').out('map_print');
(async () => {
  const browser = await chromium.launch({ executablePath: require('./_env').chrome });
  const page = await (await browser.newContext({ viewport: { width: 1500, height: 920 }, acceptDownloads: true })).newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message + e.stack));
  await page.goto('file://' + ROOT + '/AIXM-Code-Converter.html'); await page.waitForSelector('#drop');
  await page.setInputFiles('#file-input', [ROOT + '/testdata/Donlon_EADD_changes_AIRAC2611.xml']);
  await page.waitForFunction(() => window.__AIXM.S.files.every((f) => f.status === 'ready'));
  await page.click('#extract-btn');
  await page.waitForFunction(() => window.__AIXM.S.view === 'dash', null, { timeout: 60000 });
  await page.evaluate(() => { const ds = window.__AIXM.S.datasets[0]; const ad = ds.byType.AirportHeliport.find((a) => /EADD/.test(JSON.stringify(a.cur.p.locationIndicatorICAO))); window.__AIXM.go('map', { ds, procs: ad }); });
  await page.waitForTimeout(800);
  // select area by dragging
  await page.click('#map-print'); await page.waitForSelector('#map-print-dlg');
  await page.click('#map-print-dlg [data-p="area"]');
  await page.mouse.move(700, 250); await page.mouse.down(); await page.mouse.move(1200, 700, { steps: 5 }); await page.mouse.up();
  await page.waitForSelector('#map-print-dlg');
  console.log(await page.evaluate(() => document.querySelector('#map-print-dlg .muted').textContent));
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#map-print-dlg [data-p="png"]')]);
  await dl.saveAs(OUT + '/mapprint.png'); console.log('png', dl.suggestedFilename());
  await page.click('#map-print'); await page.waitForSelector('#map-print-dlg');
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('#map-print-dlg [data-p="pdf"]')]);
  console.log('pdf', dl2.suggestedFilename());
  console.log(errors.join('\n') || 'no errors'); if (errors.length) process.exitCode = 1; await browser.close();
})();
