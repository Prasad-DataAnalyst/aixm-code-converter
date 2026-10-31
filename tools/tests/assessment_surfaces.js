// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Obstacle assessment surfaces in the page (testdata/ifp_oas_test_EADD.xml with the Donlon sample, fictitious): the map
// layer is off at first and counts the surfaces; switched on, it shows them coloured by altitude with a legend; hover
// names a surface, a click gives its data as published and the leg that holds it.
const env = require('./_env');
const ROOT = env.ROOT, T = ROOT + '/testdata/';

(async () => {
  const browser = await env.playwright.chromium.launch({ executablePath: env.chrome });
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  const errors = [], fails = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + ROOT + '/AIXM-Code-Converter.html'); await page.waitForSelector('#drop');
  await page.setInputFiles('#file-input', [T + 'Donlon_ALL_Baseline_2025.xml', T + 'ifp_oas_test_EADD.xml']);
  await page.waitForFunction(() => window.__AIXM.S.files.length === 2 && window.__AIXM.S.files.every((f) => f.status === 'ready'), null, { timeout: 30000 });
  await page.evaluate(() => document.querySelector('#extract-btn').click());
  await page.waitForFunction(() => window.__AIXM.S.view === 'dash' && window.__AIXM.S.datasets.length === 2, null, { timeout: 60000 });
  await page.evaluate(() => window.__AIXM.go('map')); await page.waitForTimeout(1000);
  await page.click('[data-dsa="all"]'); await page.waitForTimeout(1200);
  const first = await page.evaluate(() => ({ on: document.querySelector('[data-layer="oas"]').checked, n: document.querySelector('[data-count="oas"]').textContent }));
  if (first.on || first.n !== '(9)') fails.push('layer off at first, 9 surfaces counted: ' + JSON.stringify(first));
  await page.check('[data-layer="oas"]'); await page.waitForTimeout(600);
  const legend = await page.evaluate(() => { const l = document.querySelector('#map-oas-legend'); return { shown: !l.classList.contains('hidden'), t: l.textContent }; });
  if (!legend.shown || !/16 ft \(5 m\) → 3,000 ft \(914 m\)/.test(legend.t) || !/not for operational use/.test(legend.t)) fails.push('legend: ' + JSON.stringify(legend));
  // the missed approach, section 2 (2 to 6 NM east of the aerodrome), clear of the departure surface
  await page.evaluate(() => MAPVIEW.leaflet().setView([52.37, -31.95], 11)); await page.waitForTimeout(1200);
  const pt = await page.evaluate(() => { const m = MAPVIEW.leaflet(), c = AX.geoDest(-31.94944444, 52.37166667, 90, 5.5), q = AX.geoDest(c[0], c[1], 180, 2.0), p = m.latLngToContainerPoint([q[1], q[0]]); return [p.x, p.y]; });
  await page.mouse.move(pt[0], pt[1]); await page.waitForTimeout(500);
  const tip = await page.evaluate(() => [...document.querySelectorAll('.leaflet-tooltip')].map((t) => t.innerText).join(' || '));
  if (!/SECTION 2 OCS — missed approach, section 2 · from 650 ft \(198 m\) · slope 2\.5 % · RNP 09 TEST · Missed Approach Leg/.test(tip)) fails.push('hover: ' + tip);
  await page.mouse.click(pt[0], pt[1]); await page.waitForTimeout(500);
  const pop = await page.evaluate(() => (document.querySelector('.leaflet-popup-content') || {}).innerText || '');
  if (!/Obstacle assessment surface/.test(pop) || !/Altitude at the bottom of the slope: 650 ft/.test(pop) || !/Missed Approach Leg/.test(pop)) fails.push('pop-up: ' + pop.replace(/\n/g, ' | '));
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
  console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : 'obstacle assessment surfaces on the map OK');
  await browser.close();
  process.exitCode = errors.length || fails.length ? 1 : 0;
})();
