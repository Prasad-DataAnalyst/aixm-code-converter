// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Online base maps: every map offered is free and needs no API key (only servers known to serve a downloaded,
// local file without a key), the list is grouped in the map panel, and a choice saved by an older version for a map
// that now needs a key (CARTO) opens its free replacement; dark maps outline the aeronautical data in white. In dark
// mode (chosen in the tool or set in the system) the offline map is navy sea and slate land, never near-black or
// half light. No internet needed: tools/check_maps.js loads the tiles.
const env = require('./_env');
const { PNG } = require(require('path').join(env.ROOT, 'tools', 'node_modules', 'pngjs'));
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
  // dark and satellite maps outline the aeronautical data in white; light maps and the offline map do not
  for (const [k, want] of [['esriDark', true], ['esriHybrid', true], ['nasaNight', true], ['esriGray', false], ['esriStreet', false], ['offline', false]]) {
    await page.selectOption('#map-base', k);
    const has = await page.evaluate(() => document.querySelector('.leaflet-container').classList.contains('dark-base'));
    if (has !== want) fails.push(k + ': white outline should be ' + (want ? 'on' : 'off'));
  }
  await page.evaluate(() => localStorage.removeItem('aixm-map-base'));
  // offline map in dark mode, set in the system (no choice in the tool) and chosen in the tool
  const lum = (c) => { const m = /(\d+), (\d+), (\d+)/.exec(c); return m ? (0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3]) : -1; };
  for (const how of ['system', 'tool']) {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 800 }, colorScheme: how === 'system' ? 'dark' : 'light' });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(how + ' dark: ' + e.message));
    await p.goto('file://' + ROOT + '/AIXM-Code-Converter.html'); await p.waitForSelector('#drop');
    if (how === 'tool') await p.click('#theme-btn');
    await p.setInputFiles('#file-input', [ROOT + '/testdata/Donlon_ALL_Baseline_2025.xml']);
    await p.waitForFunction(() => window.__AIXM.S.files.every((f) => f.status === 'ready'));
    await p.evaluate(() => document.querySelector('#extract-btn').click());
    await p.waitForFunction(() => window.__AIXM.S.view === 'dash', null, { timeout: 60000 });
    await p.evaluate(() => window.__AIXM.go('map')); await p.waitForTimeout(800);
    const r = await p.evaluate(() => ({ sea: getComputedStyle(document.querySelector('#map')).backgroundColor, outline: document.querySelector('.leaflet-container').classList.contains('dark-base') }));
    const sea = lum(r.sea);
    if (sea < 35 || sea > 90) fails.push(how + ' dark: offline sea should be navy, got ' + r.sea);
    if (!r.outline) fails.push(how + ' dark: aeronautical data should have the white outline');
    // no light land (the light-mode colour #f3efe9) left on the dark map
    const box = await p.evaluate(() => { const b = document.querySelector('#map').getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), width: Math.round(b.width), height: Math.round(b.height) }; });
    const img = PNG.sync.read(await p.screenshot({ clip: box }));
    let light = 0;
    for (let i = 0; i < img.data.length; i += 4) if (Math.abs(img.data[i] - 243) < 4 && Math.abs(img.data[i + 1] - 239) < 4 && Math.abs(img.data[i + 2] - 233) < 4) light++;
    if (light > img.data.length / 4 * 0.01) fails.push(how + ' dark: land is still drawn light (' + Math.round(light * 400 / img.data.length) + ' % of the map)');
    await ctx.close();
  }
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
  console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : 'base maps OK (all free, no API key)');
  if (errors.length || fails.length) process.exitCode = 1;
  await browser.close();
})();
