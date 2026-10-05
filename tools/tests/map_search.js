// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Search on the map: finds airways, waypoints, navaids, aerodromes, runways, taxiways, aprons, stands, airspace and
// obstacles, also with the words people type ("twy c", "EADD stand 5", "airway UL123"); a pick zooms there, outlines
// the feature and opens its information (an aerodrome opens the airport view); Escape clears; works on a phone; the
// top search box understands the same words.
const env = require('./_env');
const ROOT = env.ROOT, OUT = env.out('map_search');

(async () => {
  const browser = await env.playwright.chromium.launch({ executablePath: env.chrome });
  const errors = [], fails = [];
  async function open(opts, name) {
    const page = await (await browser.newContext(opts)).newPage();
    page.on('pageerror', (e) => errors.push(name + ': ' + e.message));
    await page.goto('file://' + ROOT + '/AIXM-Code-Converter.html'); await page.waitForSelector('#drop');
    await page.setInputFiles('#file-input', [ROOT + '/testdata/Donlon_ALL_Baseline_2025.xml']);
    await page.waitForFunction(() => window.__AIXM.S.files.every((f) => f.status === 'ready'));
    await page.evaluate(() => document.querySelector('#extract-btn').click());
    await page.waitForFunction(() => window.__AIXM.S.view === 'dash', null, { timeout: 60000 });
    await page.evaluate(() => window.__AIXM.go('map')); await page.waitForTimeout(900);
    return page;
  }
  const first = (page) => page.evaluate(() => { const n = document.querySelector('#map-sr .msr'); return n ? n.innerText.replace(/\s+/g, ' ').trim() : ''; });
  async function find(page, q) { await page.fill('#map-q', q); await page.waitForTimeout(450); return first(page); }

  const page = await open({ viewport: { width: 1366, height: 800 } }, 'computer');
  const bad = (m) => fails.push('computer: ' + m);
  // the search box sits above the layer panel, not on it
  const lay = await page.evaluate(() => { const a = document.querySelector('#map-search').getBoundingClientRect(), b = document.querySelector('#map-panel').getBoundingClientRect(); return { gap: b.top - a.bottom, w: a.width }; });
  if (lay.gap < 0) bad('search box overlaps the layer panel');
  const cases = [
    ['airway UL123', /^Airway UL123\b/], ['ul123', /^Airway UL123\b/], ['twy c', /^Taxiway C\b/], ['taxiway a', /^Taxiway A\b/], ['EADD stand 5', /^Stand 5\b/],
    ['apron b', /^Apron APRON B\b/], ['rwy 09l', /^Runway direction EADD RWY 09L\b/], ['ABOLA', /^Waypoint ABOLA\b/], ['BOR', /^Navaid VOR_DME BOR\b/],
    ['CTR', /^Airspace CTR CTR\b/], ['obstacle 0001', /^Obstacle OBST-EA-0001\b/], ['EADD', /^Aerodrome EADD\b/]
  ];
  for (const [q, re] of cases) { const f = await find(page, q); if (!re.test(f)) bad('"' + q + '" first result: ' + f); }
  if (!/Nothing on the map matches/.test(await find(page, 'zzzq'))) bad('no "nothing matches" message');
  // picks
  async function pick(q) { await page.fill('#map-q', q); await page.waitForTimeout(450); await page.keyboard.press('Enter'); await page.waitForTimeout(900); }
  await pick('airway UL123');
  let st = await page.evaluate(() => ({ hl: MAPVIEW.highlighted(), pop: (document.querySelector('.leaflet-popup-content') || {}).innerText || '', box: document.querySelector('#map-q').value }));
  if (st.hl < 2 || !/UL123/.test(st.pop) || st.box !== 'Airway UL123') bad('airway pick: ' + JSON.stringify(st));
  await page.screenshot({ path: OUT + '/airway.png' });
  await pick('twy c');
  st = await page.evaluate(() => ({ hl: MAPVIEW.highlighted(), z: MAPVIEW.leaflet().getZoom(), pop: (document.querySelector('.leaflet-popup-content') || {}).innerText || '' }));
  if (st.hl < 2 || st.z < 15 || !/Taxiway/.test(st.pop)) bad('taxiway pick: ' + JSON.stringify(st));
  await page.screenshot({ path: OUT + '/taxiway.png' });
  await pick('EADD');
  if (!(await page.evaluate(() => !document.querySelector('#map-adcard').classList.contains('hidden')))) bad('aerodrome pick should open the airport view');
  // Escape: first closes the list, then clears the box and the outline
  await page.fill('#map-q', 'BOR'); await page.waitForTimeout(450);
  await page.keyboard.press('Escape');
  if (await page.evaluate(() => !document.querySelector('#map-sr').classList.contains('hidden'))) bad('Escape does not close the list');
  await page.keyboard.press('Escape');
  st = await page.evaluate(() => ({ v: document.querySelector('#map-q').value, hl: MAPVIEW.highlighted() }));
  if (st.v || st.hl) bad('second Escape should clear: ' + JSON.stringify(st));
  // the top search box understands the same words
  await page.fill('#search', 'twy a'); await page.waitForTimeout(500);
  if (!/Taxiway/.test(await page.evaluate(() => document.querySelector('#search-results').innerText))) bad('top search does not find "twy a"');

  // phone
  const ph = await open(env.playwright.devices['Pixel 7'], 'phone');
  const pbad = (m) => fails.push('phone: ' + m);
  const pl = await ph.evaluate(() => { const r = document.querySelector('#map-search').getBoundingClientRect(); return { l: r.left, r: r.right, w: innerWidth, vis: r.height > 0 }; });
  if (!pl.vis || pl.l < 0 || pl.r > pl.w) pbad('search box not on screen: ' + JSON.stringify(pl));
  await ph.fill('#map-q', 'twy c'); await ph.waitForTimeout(450);
  await ph.locator('#map-sr .msr').first().click(); await ph.waitForTimeout(900);
  if ((await ph.evaluate(() => MAPVIEW.highlighted())) < 2) pbad('tap on a result does not outline it');
  await ph.screenshot({ path: OUT + '/phone.png' });

  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
  console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : 'map search OK (' + cases.length + ' searches)');
  if (errors.length || fails.length) process.exitCode = 1;
  await browser.close();
})();
