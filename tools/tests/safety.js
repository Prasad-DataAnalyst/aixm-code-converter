// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Safety checks: CSV cells that a spreadsheet would run as a formula are made plain text (numbers stay numbers);
// a zip whose contents are larger than the limit is refused instead of filling the memory; saved (cached) data is only
// reused in the memory mode (Full / Lite) that applies now; the map asks no server anything while the offline map is
// shown; the Live traffic link opens adsb.lol at the map position in a new tab.
const fs = require('fs');
const path = require('path');
const env = require('./_env');
const ROOT = env.ROOT, OUT = env.out('safety');
const URL = 'file://' + ROOT + '/AIXM-Code-Converter.html';
const DONLON = ROOT + '/testdata/Donlon_ALL_Baseline_2025.xml';

(async () => {
  const browser = await env.playwright.chromium.launch({ executablePath: env.chrome });
  const errors = [], fails = [];
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const requests = [];
  ctx.on('request', (r) => { if (!/^(file|data|blob):/.test(r.url())) requests.push(r.url()); });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL); await page.waitForSelector('#drop');

  // CSV formula guard
  const csv = await page.evaluate(() => ['=HYPERLINK("http://x")', '+1+2', '-12.5', '+44', '@SUM(A1)', '-', 'EADD', '1e5', '\tx', 'a,b'].map(EXPORTS.csvCell));
  const want = ['\'=HYPERLINK(""http://x"")', '\'+1+2', '-12.5', '+44', '\'@SUM(A1)', '-', 'EADD', '1e5', '\'\tx', '"a,b"'];
  want[0] = '"\'=HYPERLINK(""http://x"")"';
  csv.forEach((c, i) => { if (c !== want[i]) fails.push('csv cell ' + JSON.stringify(c) + ' expected ' + JSON.stringify(want[i])); });

  // zip larger than the limit is refused with a clear message
  const zip = path.join(OUT, 'donlon.zip');
  const fflate = require(path.join(ROOT, 'tools', 'node_modules', 'fflate'));
  fs.writeFileSync(zip, fflate.zipSync({ 'Donlon.xml': fs.readFileSync(DONLON) }));
  await page.evaluate(() => { window.__AIXM.S.zipMax = 100000; });
  await page.setInputFiles('#file-input', [zip]);
  await page.waitForFunction(() => /Could not unzip/.test(document.body.textContent), null, { timeout: 15000 }).catch(() => fails.push('no message for a zip over the limit'));
  if (await page.evaluate(() => window.__AIXM.S.files.length)) fails.push('zip over the limit was still added');
  await page.evaluate(() => { window.__AIXM.S.zipMax = 0; });
  await page.setInputFiles('#file-input', [zip]);
  await page.waitForFunction(() => window.__AIXM.S.files.length === 1 && window.__AIXM.S.files[0].status === 'ready', null, { timeout: 15000 }).catch(() => fails.push('zip under the limit not added'));

  // the map: offline map, no request to any server; Live traffic follows the map
  await page.evaluate(() => document.querySelector('#extract-btn').click());
  await page.waitForFunction(() => window.__AIXM.S.view === 'dash', null, { timeout: 60000 });
  await page.evaluate(() => window.__AIXM.go('map')); await page.waitForTimeout(1500);
  if (requests.length) fails.push('offline map asked servers: ' + requests.slice(0, 3).join(', '));
  if (!/offline map/.test(await page.textContent('#map-online'))) fails.push('internet chip: ' + await page.textContent('#map-online'));
  const link = await page.evaluate(() => { const a = document.querySelector('#map-traffic'); a.addEventListener('click', (e) => e.preventDefault()); a.click(); return { href: a.href, target: a.target, rel: a.rel }; });
  if (!/^https:\/\/adsb\.lol\/\?lat=-?\d+\.\d{4}&lon=-?\d+\.\d{4}&zoom=\d+$/.test(link.href)) fails.push('live traffic link ' + link.href);
  if (link.target !== '_blank' || !/noopener/.test(link.rel)) fails.push('live traffic link should open a new tab without access to this page');

  // saved data is reused only in the same memory mode
  async function reopen(mode) {
    await page.evaluate((m) => localStorage.setItem('aixm-mem', m), mode);
    await page.goto(URL); await page.waitForSelector('#drop');
    await page.setInputFiles('#file-input', [DONLON]);
    await page.waitForFunction(() => window.__AIXM.S.files.every((f) => f.status === 'ready'));
    await page.evaluate(() => document.querySelector('#extract-btn').click());
    await page.waitForFunction(() => window.__AIXM.S.view === 'dash', null, { timeout: 60000 });
    return page.evaluate(() => ({ cached: /saved data/.test(window.__AIXM.S.files[0].detail || ''), lite: !!window.__AIXM.S.datasets[0].lite }));
  }
  await reopen('full');
  await page.waitForFunction(() => [...window.__AIXM.LIB.cached].some((k) => /^drop:Donlon_ALL_Baseline_2025\.xml\|/.test(k)), null, { timeout: 30000 }).catch(() => fails.push('extracted data was not saved'));
  let r = await reopen('full');
  if (!r.cached || r.lite) fails.push('full mode should reuse the full saved data ' + JSON.stringify(r));
  r = await reopen('lite');
  if (r.cached || !r.lite) fails.push('lite mode must not reuse full saved data ' + JSON.stringify(r));
  await page.evaluate(() => localStorage.removeItem('aixm-mem'));

  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
  console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : 'safety checks OK');
  if (errors.length || fails.length) process.exitCode = 1;
  await browser.close();
})();
