// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Online base maps: every map offered is free and needs no API key (only servers known to serve a downloaded,
// local file without a key), the list is grouped in the map panel, and a choice saved by an older version for a map
// that now needs a key (CARTO) opens its free replacement. No internet needed: tools/check_maps.js loads the tiles.
const env = require('./_env');
const ROOT = env.ROOT;
const FREE = /^https:\/\/(server\.arcgisonline\.com|tile\.openstreetmap\.(org|de)|tile-\{s\}\.openstreetmap\.fr|\{s\}\.tile\.opentopomap\.org|gibs\.earthdata\.nasa\.gov)\//;
const KEYED = /cartocdn|carto\.com|thunderforest|stadiamaps|mapbox|maptiler|tomtom|here\.com|googleapis|apikey|api_key|access_token/i;

(async () => {
  const browser = await env.playwright.chromium.launch({ executablePath: env.chrome });
  const page = await (await browser.newContext({ viewport: { width: 1366, height: 800 } })).newPage();
  const errors = [], fails = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + ROOT + '/AIXM-Code-Converter.html');
  await page.waitForSelector('#drop');
  const bm = await page.evaluate(() => { const b = MAPVIEW.baseMaps(); return { def: b.def, renamed: b.renamed, list: Object.keys(b.list).map((k) => Object.assign({ key: k }, b.list[k])) }; });
  console.log('online base maps:', bm.list.length, '— default', bm.def);
  for (const m of bm.list) {
    for (const u of [m.url, m.labels].filter(Boolean)) {
      if (!FREE.test(u)) fails.push(m.key + ': not a known free, keyless server: ' + u);
      if (KEYED.test(u)) fails.push(m.key + ': needs an API key: ' + u);
    }
    if (!m.attr || !m.name || !m.group) fails.push(m.key + ': name, group and attribution required');
  }
  if (bm.list.length < 12) fails.push('expected at least 12 free maps, got ' + bm.list.length);
  if (!bm.list.some((m) => m.key === bm.def)) fails.push('default map missing');
  for (const old of ['voyager', 'cartoLight', 'cartoDark']) if (!bm.list.some((m) => m.key === bm.renamed[old])) fails.push('no replacement for ' + old);
  // a choice saved by 1.4 or older (CARTO Voyager) opens the free replacement
  await page.evaluate(() => localStorage.setItem('aixm-map-base', 'voyager'));
  if (await page.evaluate(() => MAPVIEW.savedBase()) !== bm.renamed.voyager) fails.push('saved CARTO choice not replaced');
  await page.evaluate(() => localStorage.removeItem('aixm-map-base'));
  // the map panel lists them, grouped, after the offline map
  await page.setInputFiles('#file-input', [ROOT + '/testdata/Donlon_ALL_Baseline_2025.xml']);
  await page.waitForFunction(() => window.__AIXM.S.files.every((f) => f.status === 'ready'));
  await page.evaluate(() => document.querySelector('#extract-btn').click());
  await page.waitForFunction(() => window.__AIXM.S.view === 'dash', null, { timeout: 60000 });
  await page.evaluate(() => window.__AIXM.go('map')); await page.waitForTimeout(800);
  const sel = await page.evaluate(() => ({ first: document.querySelector('#map-base option').value, n: document.querySelectorAll('#map-base optgroup option').length, groups: [...document.querySelectorAll('#map-base optgroup')].map((g) => g.label) }));
  console.log('map panel groups:', sel.groups.join(' | '));
  if (sel.first !== 'offline' || sel.n !== bm.list.length || sel.groups.length < 4) fails.push('map panel list: ' + JSON.stringify(sel));
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
  console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : 'base maps OK (all free, no API key)');
  if (errors.length || fails.length) process.exitCode = 1;
  await browser.close();
})();
