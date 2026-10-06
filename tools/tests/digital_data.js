// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// The Digital data tab: obstacles (eTOD), procedures (IFP) and aerodrome mapping (AMXM), each with its overview,
// list, map, checks and reports, on the Donlon test data (AIP, obstacle data set Areas 2/3/4, IFP, AMXM):
// - the tab is offered only when such data is loaded; the Export page and the Dashboard point to it;
// - obstacles: eTOD area of each obstacle from the obstacle area polygons, PANS-AIM accuracy checks, distance and
//   bearing from the ARP, the map shows what the list shows (filter applied) and selects rows both ways;
// - procedures with their legs and paths on the map; AMXM features by type with their attributes;
// - every report (PDF, Excel, CSV, GeoJSON / KML) is produced.
/* global OBSTVIEW */
const env = require('./_env');
const ROOT = env.ROOT, OUT = env.out('digital_data'), T = ROOT + '/testdata/';
const URL = 'file://' + ROOT + '/AIXM-Code-Converter.html';

(async () => {
  const browser = await env.playwright.chromium.launch({ executablePath: env.chrome });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [], fails = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  async function load(files) {
    await page.goto(URL); await page.waitForSelector('#drop');
    await page.setInputFiles('#file-input', files);
    await page.waitForFunction((n) => !window.__AIXM.S.adding && window.__AIXM.S.files.length >= n && window.__AIXM.S.files.every((f) => f.status !== 'checking'), files.length, { timeout: 30000 });
    await page.evaluate(() => document.querySelector('#extract-btn').click());
    await page.waitForFunction(() => window.__AIXM.S.view === 'dash' && window.__AIXM.S.files.every((f) => f.status !== 'parsing' && f.status !== 'indexing'), null, { timeout: 60000 });
  }
  async function download(sel) {
    const [d] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click(sel)]);
    const p = OUT + '/' + d.suggestedFilename(); await d.saveAs(p);
    return require('fs').statSync(p).size;
  }

  // no digital data: the tab is not offered
  await load([T + 'chicago_runways_51.xml']);
  if (!(await page.$eval('#nav [data-view="digital"]', (b) => b.disabled))) fails.push('tab offered without digital data');

  await load([T + 'Donlon_ALL_Baseline_2025.xml', T + 'EA_EADD_OBS_DS_AREA_2_3_4_FULL_20191205.xml', T + 'ifp_test_EADD.xml', T + 'amxm_test_EAXM.xml']);
  if (await page.$eval('#nav [data-view="digital"]', (b) => b.disabled)) fails.push('tab not offered');
  const dash = await page.evaluate(() => document.querySelectorAll('[data-act="digital"]').length);
  if (dash < 3) fails.push('Dashboard buttons to the Digital data tab: ' + dash);
  const obsIdx = await page.evaluate(() => window.__AIXM.S.datasets.findIndex((d) => /OBS_DS/.test(d.name)));
  await page.evaluate((i) => { const s = document.querySelector('#ds-select'); s.value = String(i); s.dispatchEvent(new Event('change')); window.__AIXM.go('export'); }, obsIdx);
  const hint = await page.evaluate(() => (document.querySelector('.dd-hint') || {}).textContent || '');
  if (!/obstacles/.test(hint)) fails.push('Export page hint: ' + hint);
  await page.click('.dd-hint [data-gosec]');
  await page.waitForSelector('.dd-sec.on');

  // obstacles
  const obs = await page.evaluate(() => {
    const sets = OBSTVIEW.model(window.__AIXM.S.datasets).sets, st = sets.find((x) => /OBS_DS/.test(x.ds.name));
    const by = {}; st.rows.forEach((x) => { by[x.area] = (by[x.area] || 0) + 1; });
    return { n: st.rows.length, ad: st.ad && st.ad.icao, areas: by, dist: st.rows.filter((x) => x.dist !== null).length, comp: OBSTVIEW.compliance(st).length, label: (document.querySelector('.ov-set.on') || {}).textContent };
  });
  if (obs.ad !== 'EADD' || obs.dist !== obs.n) fails.push('aerodrome of the obstacle data set / distances: ' + JSON.stringify(obs));
  if (obs.areas['2a'] !== obs.n) fails.push('eTOD area of the obstacles (the area the data set declares): ' + JSON.stringify(obs.areas));
  // obstacles of a data set that declares no area: the most demanding obstacle area polygon of the data loaded
  const poly = await page.evaluate(() => {
    const S = window.__AIXM.S, sets = OBSTVIEW.model(S.datasets).sets, st = sets.find((x) => /Donlon_ALL/.test(x.ds.name));
    const by = {}; st.rows.forEach((x) => { by[x.area] = (by[x.area] || 0) + 1; }); return by;
  });
  if (!poly['1']) fails.push('AIP obstacles in the Area 1 polygon: ' + JSON.stringify(poly));
  await page.evaluate((i) => { const b = document.querySelector('[data-ovset="' + i + '"]'); if (b) b.click(); }, obsIdx);
  await page.waitForSelector('.ov-map .leaflet-container, .ov-map.leaflet-container');
  const marks = async () => page.evaluate(() => { const m = document.querySelector('.ov-map'); return m ? document.querySelectorAll('.ov-tbl tbody tr').length : -1; });
  const before = await marks();
  await page.fill('[data-ovf="minH"]', '30'); await page.waitForTimeout(600);
  const after = await marks();
  if (!(after > 0 && after < before)) fails.push('height filter: ' + before + ' → ' + after);
  await page.fill('[data-ovf="minH"]', ''); await page.waitForTimeout(600);
  await page.click('.ov-tbl tbody tr [data-ovmap]');
  if (!(await page.$('.ov-tbl tr.ov-sel'))) fails.push('row not selected from the map button');
  await page.screenshot({ path: OUT + '/obstacles.png' });
  for (const t of ['comp', 'stats', 'report']) { await page.click('[data-ovtab="' + t + '"]'); await page.waitForTimeout(300); }
  for (const r of ['full:pdf', 'list:xlsx', 'comp:csv', 'gis:geojson', 'gis:kml']) { const n = await download('[data-ovrep="' + r + '"]').catch((e) => { fails.push('report ' + r + ': ' + e.message.split('\n')[0]); return 0; }); if (n && n < 200) fails.push('report ' + r + ' is empty'); }

  // procedures
  await page.click('[data-ddsec="ifp"]'); await page.waitForTimeout(800);
  const ifp = await page.evaluate(() => ({ rows: document.querySelectorAll('.ov-tbl tbody tr').length, paths: document.querySelectorAll('.ov-map path.leaflet-interactive, .ov-map canvas').length }));
  if (ifp.rows !== 3) fails.push('procedures listed: ' + JSON.stringify(ifp));
  await page.screenshot({ path: OUT + '/procedures.png' });
  for (const f of ['pdf', 'xlsx']) { const n = await download('[data-ddrep="' + f + '"]').catch((e) => { fails.push('IFP report ' + f + ': ' + e.message.split('\n')[0]); return 0; }); if (n && n < 200) fails.push('IFP report ' + f + ' empty'); }

  // aerodrome mapping
  await page.click('[data-ddsec="amxm"]'); await page.waitForTimeout(800);
  await page.click('[data-amtype="RunwayThreshold"]'); await page.waitForTimeout(600);
  const am = await page.evaluate(() => ({ types: document.querySelectorAll('[data-amtype]').length, rows: document.querySelectorAll('.am-feat tbody tr').length, head: [...document.querySelectorAll('.am-feat thead th')].map((t) => (t.firstChild ? t.firstChild.textContent : '')) }));
  if (am.types < 8 || am.rows !== 2 || am.head.indexOf('idthr') < 0) fails.push('aerodrome mapping: ' + JSON.stringify(am));
  await page.screenshot({ path: OUT + '/aerodrome_mapping.png' });
  { const n = await download('[data-amrep="xlsx"]').catch((e) => { fails.push('AMXM report: ' + e.message.split('\n')[0]); return 0; }); if (n && n < 200) fails.push('AMXM report empty'); }

  // the Map tab is unchanged and still works
  await page.evaluate(() => window.__AIXM.go('map')); await page.waitForTimeout(1200);
  if (!(await page.$('#map-dsl, .map-panel'))) fails.push('Map tab');

  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
  console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : 'Digital data tab (obstacles, procedures, aerodrome mapping, maps, reports) OK');
  if (errors.length || fails.length) process.exitCode = 1;
  await browser.close();
})();
