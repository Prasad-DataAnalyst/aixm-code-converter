// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Manual check (needs internet): opens the built file as a downloaded, local page, shows every online base map in the
// map view and reports how many tiles loaded or failed; screenshots go to tools/tests/out/maps for a visual check
// (an "API key required" picture would show there). Free map services change their terms now and then: run this
// before a release.   node tools/check_maps.js [--ignore-certificate-errors behind an inspecting proxy]
const env = require('./tests/_env');
const ROOT = env.ROOT, OUT = env.out('maps');
(async () => {
  const args = process.argv.includes('--ignore-certificate-errors') ? ['--ignore-certificate-errors'] : [];
  const browser = await env.playwright.chromium.launch({ executablePath: env.chrome, args });
  const page = await (await browser.newContext({ viewport: { width: 1100, height: 700 } })).newPage();
  await page.goto('file://' + ROOT + '/AIXM-Code-Converter.html'); await page.waitForSelector('#drop');
  await page.setInputFiles('#file-input', [ROOT + '/testdata/Donlon_ALL_Baseline_2025.xml']);
  await page.waitForFunction(() => window.__AIXM.S.files.every((f) => f.status === 'ready'));
  await page.evaluate(() => document.querySelector('#extract-btn').click());
  await page.waitForFunction(() => window.__AIXM.S.view === 'dash', null, { timeout: 60000 });
  await page.evaluate(() => window.__AIXM.go('map')); await page.waitForTimeout(1200);
  const keys = await page.evaluate(() => Object.keys(MAPVIEW.baseMaps().list));
  let bad = 0;
  for (const k of keys) {
    let ok = 0, failed = 0;
    const onRes = (r) => { if (r.request().resourceType() === 'image' && /^https/.test(r.url())) { if (r.status() >= 400) failed++; else ok++; } };
    const onFail = (r) => { if (r.resourceType() === 'image' && /^https/.test(r.url())) failed++; };
    page.on('response', onRes); page.on('requestfailed', onFail);
    await page.evaluate(() => MAPVIEW.leaflet().eachLayer(function (l) { if (l._url) l.redraw && l.redraw(); }));
    await page.selectOption('#map-base', k); await page.waitForTimeout(3500);
    page.off('response', onRes); page.off('requestfailed', onFail);
    const now = await page.evaluate(() => document.querySelector('#map-base').value);
    const status = failed || now !== k ? 'PROBLEM' : 'ok';
    if (status !== 'ok') bad++;
    console.log(status.padEnd(8), k.padEnd(12), 'tiles loaded', ok, 'failed', failed, now !== k ? '(switched to ' + now + ')' : '');
    await page.screenshot({ path: OUT + '/' + k + '.png' });
  }
  console.log(bad ? bad + ' map(s) with problems — see ' + OUT : 'all ' + keys.length + ' maps load — screenshots in ' + OUT);
  if (bad) process.exitCode = 1;
  await browser.close();
})();
