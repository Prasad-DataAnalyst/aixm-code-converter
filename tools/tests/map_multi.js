// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Several data sets on one map: with more than one loaded, the map panel lists them with a tick box each; any mix
// (or all) is drawn together, the layer counts and the aerodrome lists cover all of them, a search or an airport
// view of a data set not shown adds it, the choice survives leaving the map and coming back, "only" shows one, the
// last one cannot be unticked, and Save PNG draws all of them.
const env = require('./_env');
const ROOT = env.ROOT;
const URL = 'file://' + ROOT + '/AIXM-Code-Converter.html';
const FILES = ['Donlon_ALL_Baseline_2025.xml', 'chicago_runways_51.xml', 'chicago_airspace_crs84_51.xml'].map((f) => ROOT + '/testdata/' + f);

(async () => {
  const browser = await env.playwright.chromium.launch({ executablePath: env.chrome });
  const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true })).newPage();
  const errors = [], fails = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL); await page.waitForSelector('#drop');
  await page.setInputFiles('#file-input', FILES);
  await page.waitForFunction((n) => window.__AIXM.S.files.length === n && window.__AIXM.S.files.every((f) => f.status === 'ready'), FILES.length, { timeout: 30000 });
  await page.evaluate(() => document.querySelector('#extract-btn').click());
  await page.waitForFunction((n) => window.__AIXM.S.view === 'dash' && window.__AIXM.S.datasets.length === n, FILES.length, { timeout: 120000 });
  await page.evaluate(() => window.__AIXM.go('map')); await page.waitForTimeout(1000);
  const st = () => page.evaluate(() => ({
    n: (document.querySelector('#map-dsl-n') || {}).textContent, on: [...document.querySelectorAll('#map-dsl [data-ds]')].map((c) => c.checked),
    rwy: +((document.querySelector('[data-count="aerodrome"]') || {}).textContent || '0').replace(/\D/g, ''),
    as: [...document.querySelectorAll('[data-count^="as_"]')].reduce((n, x) => n + +x.textContent.replace(/\D/g, ''), 0),
    adview: document.querySelectorAll('#map-adview option').length - 1
  }));
  const one = await st();
  if (one.n !== '1 of 3' || one.on.join() !== 'true,false,false') fails.push('one data set ticked at first: ' + JSON.stringify(one));
  await page.click('#map-dsl [data-dsa="all"]'); await page.waitForTimeout(300);
  const all = await st();
  if (all.n !== '3 of 3' || all.on.some((x) => !x)) fails.push('Show all: ' + JSON.stringify(all));
  if (!(all.as > one.as) || !(all.rwy > one.rwy)) fails.push('airspace and runways of all data sets should be on the map: ' + JSON.stringify({ one, all }));
  // each data set alone adds up to all of them
  let sum = 0;
  for (let i = 0; i < 3; i++) { await page.click('#map-dsl [data-dso="' + i + '"]'); await page.waitForTimeout(200); sum += (await st()).as; }
  if (sum !== all.as) fails.push('airspace counts of the data sets alone (' + sum + ') should add up to all of them (' + all.as + ')');
  // only the last one is shown: a search for a Donlon aerodrome adds Donlon, the Chicago one stays
  if ((await st()).on.join() !== 'false,false,true') fails.push('"only" should show just that data set');
  const res = await page.evaluate(() => { const r = MAPVIEW.searchMap('EADD'); return r.length ? r[0].ds.state : null; });
  if (!/DONLON/i.test(res || '')) fails.push('search should find aerodromes of every loaded data set: ' + res);
  await page.fill('#map-q', 'EADD'); await page.waitForTimeout(400);
  await page.keyboard.press('Enter'); await page.waitForTimeout(800);
  const added = await st();
  if (added.on.join() !== 'true,false,true') fails.push('a search result of a data set not shown should add it: ' + JSON.stringify(added));
  // the choice is kept when leaving the map and coming back
  await page.evaluate(() => window.__AIXM.go('dash')); await page.waitForTimeout(200);
  await page.evaluate(() => window.__AIXM.go('map')); await page.waitForTimeout(800);
  if ((await st()).on.join() !== 'true,false,true') fails.push('the data sets on the map should be kept: ' + JSON.stringify(await st()));
  // the last one cannot be unticked
  await page.click('#map-dsl [data-dso="0"]'); await page.waitForTimeout(200);
  await page.click('#map-dsl [data-ds="0"]'); await page.waitForTimeout(200);
  if ((await st()).on.join() !== 'true,false,false') fails.push('the last data set on the map should stay ticked');
  // Save PNG with all of them
  await page.click('#map-dsl [data-dsa="all"]'); await page.waitForTimeout(300);
  const png = await page.evaluate(() => { const u = MAPVIEW.renderImage(window.__AIXM.S.datasets, MAPVIEW.leaflet().getBounds(), 800, 500, { title: 'x' }); return u.length; });
  if (!(png > 10000)) fails.push('picture of several data sets not drawn');
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
  console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : 'several data sets on one map OK');
  if (errors.length || fails.length) process.exitCode = 1;
  await browser.close();
})();
