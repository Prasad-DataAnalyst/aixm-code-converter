// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
const { chromium } = require('./_env').playwright;
const ROOT = require('./_env').ROOT, OUT = require('./_env').out('business_rules');
(async () => {
  const browser = await chromium.launch({ executablePath: require('./_env').chrome });
  const page = await (await browser.newContext({ viewport: { width: 1500, height: 920 }, acceptDownloads: true })).newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message + e.stack));
  await page.goto('file://' + ROOT + '/AIXM-Code-Converter.html'); await page.waitForSelector('#drop');
  await page.setInputFiles('#file-input', [ROOT + '/testdata/Donlon_ALL_Baseline_2025.xml']);
  await page.waitForFunction(() => window.__AIXM.S.files.every((f) => f.status === 'ready'));
  await page.click('#extract-btn');
  await page.waitForFunction(() => window.__AIXM.S.view === 'dash', null, { timeout: 60000 });
  await page.click('button[data-view="quality"]'); await page.click('[data-qtab="rules"]');
  await page.waitForSelector('#r-run'); const t0 = Date.now();
  await page.click('#r-run'); await page.waitForSelector('.rule-card', { timeout: 60000 });
  console.log('rules in', Date.now() - t0, 'ms');
  console.log(await page.evaluate(() => document.querySelector('.stat-row').innerText.replace(/\s+/g, ' ')));
  await page.screenshot({ path: OUT + '/rules.png' });
  await page.selectOption('#r-src', 'std'); await page.waitForTimeout(200);
  console.log('std only cards:', await page.evaluate(() => document.querySelectorAll('.rule-card').length));
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#r-xlsx')]); console.log('xlsx', dl.suggestedFilename());
  await page.click('[data-qtab="cat"]'); await page.waitForSelector('#c-q');
  await page.fill('#c-q', 'runway'); await page.waitForTimeout(200);
  console.log('catalogue:', await page.evaluate(() => document.querySelector('#c-out .muted').innerText));
  await page.screenshot({ path: OUT + '/catalogue.png' });
  console.log(errors.join('\n') || 'no errors'); if (errors.length) process.exitCode = 1; await browser.close();
})();
