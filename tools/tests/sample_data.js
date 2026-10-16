// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Sample data and sources: "Try it with sample data" on the Files page opens the Donlon sample (AIP, obstacles, flight
// procedures) packed in the page, with no network request; the list "Where to get AIXM files" has only safe https links.
const env = require('./_env');
const ROOT = env.ROOT;
(async () => {
  const browser = await env.playwright.chromium.launch({ executablePath: env.chrome });
  const errors = [], fails = [];
  const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  const net = [];
  await page.goto('file://' + ROOT + '/AIXM-Code-Converter.html'); await page.waitForSelector('#drop');
  page.on('request', (r) => { if (!/^(file|data|blob):/.test(r.url())) net.push(r.url()); });

  // the card and its links
  if (!(await page.$('#try-sample'))) fails.push('no "Try it with sample data" button on the Files page');
  const links = await page.evaluate(() => [...document.querySelectorAll('#sample-card details a')].map((a) => ({ h: a.href, t: a.target, r: a.rel })));
  if (links.length < 6) fails.push('sources listed: ' + links.length);
  links.forEach((l) => { if (!/^https:\/\//.test(l.h) || l.t !== '_blank' || !/noopener/.test(l.r)) fails.push('unsafe source link: ' + JSON.stringify(l)); });
  if (!links.some((l) => /faa\.gov.*NASR_Subscription/.test(l.h))) fails.push('FAA NASR link missing');
  const phone = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  if (!phone) fails.push('horizontal scroll on the Files page');

  // the sample opens by itself, offline
  const idle = await page.evaluate(() => typeof AIP !== 'undefined' && (window.__AIXM.S.files.length));
  if (idle) fails.push('files present before the click');
  await page.click('#try-sample');
  await page.waitForFunction(() => window.__AIXM.S.view === 'dash' && window.__AIXM.S.files.length === 3 && window.__AIXM.S.files.every((f) => f.status === 'done'), null, { timeout: 120000 });
  const st = await page.evaluate(() => {
    const S = window.__AIXM.S;
    return { files: S.files.map((f) => f.name).sort(), ds: S.datasets.length, ad: S.datasets.reduce((n, d) => n + ((d.byType.AirportHeliport || []).length), 0),
      obst: S.datasets.reduce((n, d) => n + ((d.byType.VerticalStructure || []).length), 0), proc: S.datasets.reduce((n, d) => n + ((d.byType.InstrumentApproachProcedure || []).length + (d.byType.StandardInstrumentDeparture || []).length), 0) };
  });
  console.log('sample opened:', JSON.stringify(st));
  if (st.files.join('|') !== 'EA_EADD_OBS_DS_AREA_2_3_4_FULL_20191205.xml|Donlon_ALL_Baseline_2025.xml|ifp_test_EADD.xml'.split('|').sort().join('|')) fails.push('files: ' + st.files.join(', '));
  if (st.ad < 3 || st.obst < 20 || st.proc < 1) fails.push('too little data: ' + JSON.stringify(st));
  const adName = await page.evaluate(() => { const ds = window.__AIXM.S.datasets[0]; return /DONLON/i.test(ds.name || '') || /Donlon/.test(JSON.stringify(window.__AIXM.S.files.map((f) => f.name))); });
  if (!adName) fails.push('not the Donlon data');
  if (net.length) fails.push('network requests while opening the sample: ' + net.slice(0, 3).join(' | '));

  // a second click does not add the files again
  await page.evaluate(() => window.__AIXM.go('files')); await page.waitForSelector('#try-sample');
  await page.click('#try-sample'); await page.waitForTimeout(800);
  const again = await page.evaluate(() => window.__AIXM.S.files.length);
  if (again !== 3) fails.push('sample added twice: ' + again + ' files');

  // phone width
  const ph = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  ph.on('pageerror', (e) => errors.push('phone: ' + e.message));
  await ph.goto('file://' + ROOT + '/AIXM-Code-Converter.html'); await ph.waitForSelector('#try-sample');
  if (!(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))) fails.push('phone: horizontal scroll');
  await ph.screenshot({ path: env.out('sample_data') + '/phone_files.png', fullPage: true });
  await page.screenshot({ path: env.out('sample_data') + '/dash.png' });

  console.log(errors.join('\n') || 'no errors');
  console.log(fails.length ? 'FAIL: ' + fails.join('; ') : 'sample data OK');
  if (errors.length || fails.length) process.exitCode = 1;
  await browser.close();
})();
