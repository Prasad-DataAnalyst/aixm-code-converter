// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Safety checks: CSV cells that a spreadsheet would run as a formula are made plain text (numbers stay numbers);
// a zip whose contents are larger than the limit is refused instead of filling the memory; saved (cached) data is only
// reused in the memory mode (Full / Lite) that applies now; the map asks no server anything while the offline map is
// shown; ✈ Live traffic switches the adsb.lol live map on inside the map (sandboxed, at the map position and zoom,
// under the aeronautical data, base map hidden, credit shown), follows a zoom, shows aircraft details in a window over
// the map (not a new tab), and switches off again.
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

  // the map: offline map, no request to any server
  await page.evaluate(() => document.querySelector('#extract-btn').click());
  await page.waitForFunction(() => window.__AIXM.S.view === 'dash', null, { timeout: 60000 });
  await page.evaluate(() => window.__AIXM.go('map')); await page.waitForTimeout(1500);
  if (requests.length) fails.push('offline map asked servers: ' + requests.slice(0, 3).join(', '));
  if (!/offline map/.test(await page.textContent('#map-online'))) fails.push('internet chip: ' + await page.textContent('#map-online'));
  // live traffic on / off (the adsb.lol page is replaced by a stand-in: the test needs no internet)
  await ctx.route('https://adsb.lol/**', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>stand-in</title>' }));
  await page.evaluate(() => MAPVIEW.leaflet().setView([51.47, -0.4543], 9, { animate: false }));
  await page.click('#map-traffic');
  await page.waitForFunction(() => { const f = document.querySelector('.traffic-frame'); return f && f.style.opacity === '1'; }, null, { timeout: 10000 }).catch(() => fails.push('live traffic did not show'));
  const on = await page.evaluate(() => {
    const f = document.querySelector('.traffic-frame'), m = MAPVIEW.leaflet(), r = f.getBoundingClientRect(), c = m.getContainer().getBoundingClientRect();
    return { src: f.src, sandbox: f.getAttribute('sandbox'), pressed: document.querySelector('#map-traffic').getAttribute('aria-pressed'), note: !document.querySelector('#map-traffic-note').classList.contains('hidden'),
      attr: document.querySelector('.leaflet-control-attribution').textContent, base: !!document.querySelector('#map-base').disabled,
      land: m.getPane('tilePane').querySelectorAll('canvas').length, dx: Math.round(r.left + r.width / 2 - (c.left + c.width / 2)), dy: Math.round(r.top + r.height / 2 - (c.top + c.height / 2)) };
  });
  if (!/^https:\/\/adsb\.lol\/\?lat=51\.47000&lon=-0\.45430&zoom=9&hideSidebar&hideButtons$/.test(on.src)) fails.push('live traffic address ' + on.src);
  if (on.sandbox !== 'allow-scripts allow-same-origin') fails.push('live traffic must be sandboxed: ' + on.sandbox);
  if (on.pressed !== 'true' || !on.note || !/adsb\.lol/.test(on.attr)) fails.push('live traffic state, note or credit missing ' + JSON.stringify(on));
  if (!on.base || on.land) fails.push('base map should be hidden and locked while live traffic is on');
  if (Math.abs(on.dx) > 1 || Math.abs(on.dy) > 1) fails.push('live traffic not centred on the map: ' + on.dx + ',' + on.dy);
  await page.evaluate(() => MAPVIEW.leaflet().setZoom(7, { animate: false })); await page.waitForTimeout(1600);
  const z = await page.evaluate(() => [...document.querySelectorAll('.traffic-frame')].map((f) => f.src));
  if (z.length !== 1 || !/&zoom=7&/.test(z[0])) fails.push('live traffic did not follow the zoom: ' + z.join(' '));
  // aircraft details: the live map in a window over this map (no new tab), closed with ✕
  await page.click('#map-traffic-info');
  const det = await page.evaluate(() => { const d = document.querySelector('.traffic-details'), f = d && d.querySelector('iframe'); return d ? { src: f.src, sandbox: f.getAttribute('sandbox'), head: d.querySelector('.td-head').textContent } : null; });
  if (!det || !/^https:\/\/adsb\.lol\/\?lat=-?\d+\.\d{5}&lon=-?\d+\.\d{5}&zoom=7&hideSidebar&hideButtons$/.test(det.src) || det.sandbox !== 'allow-scripts allow-same-origin' || !/aircraft details/.test(det.head)) fails.push('aircraft details window ' + JSON.stringify(det));
  await page.click('.traffic-details [data-td="close"]');
  if (await page.$('.traffic-details')) fails.push('✕ should close the aircraft details window');
  await page.click('#map-traffic-info');
  await page.evaluate(() => document.querySelector('#map-traffic').click()); // the window covers the map buttons
  if (await page.$('.traffic-details')) fails.push('switching live traffic off should close the aircraft details window');
  const off = await page.evaluate(() => ({ frames: document.querySelectorAll('.traffic-frame').length, pressed: document.querySelector('#map-traffic').getAttribute('aria-pressed'), base: document.querySelector('#map-base').disabled, attr: document.querySelector('.leaflet-control-attribution').textContent, land: MAPVIEW.leaflet().getPane('tilePane').querySelectorAll('canvas').length }));
  if (off.frames || off.pressed !== 'false' || off.base || /adsb/.test(off.attr) || !off.land) fails.push('live traffic did not switch off cleanly ' + JSON.stringify(off));

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
