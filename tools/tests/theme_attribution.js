// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
const { chromium } = require('./_env').playwright;
const fs = require('fs');
const ROOT = require('./_env').ROOT, OUT = require('./_env').out('theme_attribution');
(async () => {
  const browser = await chromium.launch({ executablePath: require('./_env').chrome });
  // "not for operational use" notice: shown at the first start (as for a person, not an automated browser), remembered after "I understand"
  {
    const c0 = await browser.newContext({ viewport: { width: 1500, height: 920 } });
    await c0.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
    const p0 = await c0.newPage();
    await p0.goto('file://' + ROOT + '/AIXM-Code-Converter.html');
    await p0.waitForSelector('#nfo-dlg', { timeout: 5000 }).catch(() => { console.log('FAIL first-start notice not shown'); process.exitCode = 1; });
    console.log('notice:', (await p0.evaluate(() => (document.querySelector('#nfo-dlg') || {}).innerText || '')).replace(/\s+/g, ' ').slice(0, 90));
    await p0.screenshot({ path: OUT + '/notice.png' });
    await p0.click('[data-ack]');
    await p0.reload(); await p0.waitForSelector('#drop'); await p0.waitForTimeout(300);
    if (await p0.$('#nfo-dlg')) { console.log('FAIL notice shown again after I understand'); process.exitCode = 1; }
    await p0.click('#nfo-chip'); await p0.waitForSelector('#nfo-dlg');
    await c0.close();
  }
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 920 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message + e.stack));
  const logs = []; page.on('console', (m) => { if (m.type() === 'info') logs.push(m.text()); });
  await page.goto('file://' + ROOT + '/AIXM-Code-Converter.html'); await page.waitForSelector('#drop');
  await page.screenshot({ path: OUT + '/files.png' });
  console.log('console:', logs.join(' | ').replace(/%c/g, ''));
  await page.setInputFiles('#file-input', [ROOT + '/testdata/Donlon_EADD_changes_AIRAC2611.xml']);
  await page.waitForFunction(() => window.__AIXM.S.files.every((f) => f.status === 'ready'));
  await page.click('#extract-btn');
  await page.waitForFunction(() => window.__AIXM.S.view === 'dash', null, { timeout: 60000 });
  await page.screenshot({ path: OUT + '/dash.png' });
  await page.evaluate(() => { const S = window.__AIXM.S, ds = S.datasets[0]; const ad = ds.byType.AirportHeliport.find((a) => /EADD/.test(JSON.stringify(a.cur.p.locationIndicatorICAO))); S.aipSel = 'AD2.12:' + ad.i; S.aipOpen['AD:' + ad.i] = true; S.hlOn = true; window.__AIXM.go('aip'); });
  await page.waitForSelector('table.aip'); await page.waitForTimeout(300);
  await page.screenshot({ path: OUT + '/aip.png' });
  async function dl(sel, name) { const [d] = await Promise.all([page.waitForEvent('download'), page.click(sel)]); await d.saveAs(OUT + '/' + name); return OUT + '/' + name; }
  await dl('[data-x="json"]', 'sec.json');
  await dl('[data-x="xlsx"]', 'sec.xlsx');
  await dl('[data-x="pdf"]', 'sec.pdf');
  const j = JSON.parse(fs.readFileSync(OUT + '/sec.json', 'utf8'));
  console.log('json:', j.generator, '|', j.generatorAuthor, '|', j.generatorAuthorEmail, '|', j.generatorLicense);
  if (!/NOT FOR OPERATIONAL USE/.test(j.disclaimer || '')) { console.log('FAIL JSON export without the notice'); process.exitCode = 1; }
  // about page (sidebar credit) and the about box of the help dialog
  await page.click('.nav-credit'); await page.waitForSelector('.about-page'); await page.waitForTimeout(300);
  const ab = await page.evaluate(() => document.querySelector('.ab-author').innerText.replace(/\s+/g, ' '));
  console.log('about page:', ab.slice(0, 160));
  if (!/Prasad Selvaraj/.test(ab) || !/prasad2t@gmail\.com/.test(ab)) { console.log('FAIL about page attribution'); process.exitCode = 1; }
  await page.screenshot({ path: OUT + '/about.png' });
  await page.evaluate(() => window.__AIXM.go('aip'));
  await page.click('#help-btn'); await page.waitForSelector('#about');
  console.log('about box:', await page.evaluate(() => document.querySelector('#about').innerText.replace(/\s+/g, ' ').slice(0, 120)));
  await page.click('.modal-back [data-close]');
  // dark theme
  await page.click('#theme-btn'); await page.waitForTimeout(300);
  await page.screenshot({ path: OUT + '/aip-dark.png' });
  console.log(errors.join('\n') || 'no errors'); if (errors.length) process.exitCode = 1; await browser.close();
})();
