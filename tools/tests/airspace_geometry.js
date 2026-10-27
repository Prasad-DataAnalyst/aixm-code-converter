// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Airspace geometry in the page (testdata/airspace_test_EADD.xml, fictitious): the geometry engine is loaded by itself for
// airspace built from other airspace and the map shows it; the PART layer is off at first; the flight-level filter shows
// lower and upper airspace apart (count and labels); the airspace checks of the Quality tab find the defects of the file;
// the AIP gives how an airspace is built and the limits of its parts.
const env = require('./_env');
const ROOT = env.ROOT;
const URL = 'file://' + ROOT + '/AIXM-Code-Converter.html';
const FILE = ROOT + '/testdata/airspace_test_EADD.xml';

(async () => {
  const browser = await env.playwright.chromium.launch({ executablePath: env.chrome });
  const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
  const errors = [], fails = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL); await page.waitForSelector('#drop');
  await page.setInputFiles('#file-input', [FILE]);
  await page.waitForFunction(() => window.__AIXM.S.files.length === 1 && window.__AIXM.S.files[0].status === 'ready', null, { timeout: 30000 });
  await page.evaluate(() => document.querySelector('#extract-btn').click());
  await page.waitForFunction(() => window.__AIXM.S.view === 'dash' && window.__AIXM.S.datasets.length === 1, null, { timeout: 60000 });
  // the engine comes by itself: the data set has airspace built from other airspace
  await page.waitForFunction(() => !!MODEL.geomEngine(), null, { timeout: 20000 }).catch(() => fails.push('the geometry engine was not loaded for airspace built from other airspace'));
  const asm = await page.evaluate(() => {
    const ds = window.__AIXM.S.datasets[0], by = (d) => ds.byType.Airspace.find((r) => r.cur.p.designator === d);
    const g = (d) => MODEL.geometry(ds, by(d));
    return { tma: !!(g('EADD-TMA') && g('EADD-TMA').asm), p2: !!(g('EADD-TP2') && g('EADD-TP2').asm), uir: !!(g('EADU') && g('EADU').asm), all: ds.byType.Airspace.every((r) => !!MODEL.geometry(ds, r)) };
  });
  if (!asm.tma || !asm.p2 || !asm.uir || !asm.all) fails.push('every airspace drawn, the aggregated ones combined: ' + JSON.stringify(asm));
  await page.evaluate(() => window.__AIXM.go('map')); await page.waitForTimeout(1000);
  const layer = await page.evaluate(() => ({ part: document.querySelector('[data-layer="as_part"]').checked, n: document.querySelector('[data-count="as_part"]').textContent, cta: document.querySelector('[data-layer="as_cta"]').checked }));
  if (layer.part || !/1/.test(layer.n) || !layer.cta) fails.push('PART layer off at first, with its count; others on: ' + JSON.stringify(layer));
  // flight levels: at FL300 only the FIR, the upper sector, the UIR and the sector above FL245
  await page.selectOption('#map-lvl-mode', 'at');
  await page.fill('#map-lvl-a', 'FL300'); await page.waitForTimeout(300);
  const at300 = await page.evaluate(() => document.querySelector('#map-lvl-note').textContent);
  if (!/Showing 4 of 17 airspaces at FL300/.test(at300)) fails.push('at FL300: ' + at300);
  await page.selectOption('#map-lvl-mode', 'band');
  await page.fill('#map-lvl-a', 'GND'); await page.fill('#map-lvl-b', '2500 ft'); await page.waitForTimeout(300);
  const low = await page.evaluate(() => document.querySelector('#map-lvl-note').textContent);
  if (!/Showing 12 of 17 airspaces from GND to 2500 FT/.test(low)) fails.push('GND to 2500 ft: ' + low);
  const ok = await page.evaluate(() => [MAPVIEW.parseLevel('FL245'), MAPVIEW.parseLevel('2500 ft'), MAPVIEW.parseLevel('245'), MAPVIEW.parseLevel('UNL'), MAPVIEW.parseLevel('x')]);
  if (JSON.stringify(ok) !== '[24500,2500,24500,null,null]') fails.push('levels read (FL245, 2500 ft, 245, UNL, x): ' + JSON.stringify(ok)); // UNL: Infinity, written null
  await page.selectOption('#map-lvl-mode', 'all'); await page.waitForTimeout(200);
  const png = await page.evaluate(() => MAPVIEW.renderImage(window.__AIXM.S.datasets, MAPVIEW.leaflet().getBounds(), 600, 400, { title: 'x' }).length);
  if (!(png > 10000)) fails.push('map picture not drawn');
  // the airspace checks
  const iss = await page.evaluate(async () => { const ds = window.__AIXM.S.datasets[0]; return (await ANALYSIS.quality(ds)).filter((x) => x.rule === 'Airspace geometry').map((x) => x.sev + ' ' + x.rec.cur.p.designator).sort(); });
  if (JSON.stringify(iss) !== JSON.stringify(['error EADR3', 'error EADR5', 'error EADR6', 'warning EADD-S'])) fails.push('airspace checks: ' + JSON.stringify(iss));
  // AIP: how the TMA is built and its limits
  const aip = await page.evaluate(() => { const ds = window.__AIXM.S.datasets[0], r = ds.byType.Airspace.find((x) => x.cur.p.designator === 'EADD-TMA'); return AIP.vertical(ds, r); });
  if (aip !== 'FL 195 / 1500 FT AGL\nFL 195 / 2500 FT AMSL') fails.push('TMA limits from its parts: ' + JSON.stringify(aip));
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
  console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : 'airspace geometry in the page OK');
  await browser.close();
  process.exitCode = errors.length || fails.length ? 1 : 0;
})();
