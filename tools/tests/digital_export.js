// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Exports of the Digital data tab, each file read again on its own:
// - obstacles in AIXM: an AIXM 5.1 obstacle data set as delivered (with its obstacle areas; the 5.1.1 aerodrome left
//   out and reported) and as AIXM 5.1.1 (written from the data, with the aerodrome and the procedures passing near);
//   an obstacle table (CSV) as AIXM 5.1.1;
// - procedures in AIXM 5.2 from an AIXM 5.1.1 and an AIXM 5.2 IFP data set together, with legs, fixes and holdings;
// - aerodrome mapping: one AMXM feature type as delivered (AMXM) and as AIXM 5.1.1;
// - terrain of an area (EADD and 5 NM) as GeoTIFF, ASCII grid and XYZ, the GeoTIFF read again post for post; the
//   obstacles of that area in AIXM.
/* global DEM */
const fs = require('fs');
const path = require('path');
const env = require('./_env');
const TR = require('./_terrain');
const ROOT = env.ROOT, OUT = env.out('digital_export'), T = ROOT + '/testdata/';
const URL = 'file://' + ROOT + '/AIXM-Code-Converter.html';
function elev(lon, lat) { return Math.round(40 + 300 * Math.exp(-((lon + 32.0) ** 2 + (lat - 52.4) ** 2) / 0.002) + 20 * Math.sin(lon * 30)); }

(async () => {
  const d = 3 / 3600, lon0 = -32.4, lat1 = 52.7, W = 720, H = 480, v = new Float64Array(W * H);
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) v[r * W + c] = elev(lon0 + c * d, lat1 - r * d);
  const tif = OUT + '/EADD_terrain_in.tif';
  fs.writeFileSync(tif, TR.tiff({ le: true, type: 'i16', comp: 8, pred: 2, tile: [256, 256], nodata: -32768, images: [{ w: W, h: H, v }], keys: [[1024, 2], [1025, 2], [2048, 4326], [4096, 5773]], tie: [0, 0, 0, lon0, lat1, 0], scale: [d, d, 0] }));
  const csv = OUT + '/EADD_new_obstacles.csv';
  fs.writeFileSync(csv, 'Obstacle ID,Type,Latitude,Longitude,Elevation (m),Height (m)\r\nNEW-1,Mast,52.3700,-32.0500,150,105\r\nNEW-2,Crane,52.3800,-31.9000,90,50\r\n');

  const browser = await env.playwright.chromium.launch({ executablePath: env.chrome });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [], fails = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (x) => x.accept());
  async function load(files) {
    await page.goto(URL); await page.waitForSelector('#drop');
    await page.evaluate(() => { localStorage.removeItem('aixm-ddx'); });
    await page.setInputFiles('#file-input', files);
    await page.waitForFunction((n) => !window.__AIXM.S.adding && window.__AIXM.S.files.length >= n && window.__AIXM.S.files.every((f) => f.status !== 'checking'), files.length, { timeout: 30000 });
    await page.evaluate(() => document.querySelector('#extract-btn').click());
    await page.waitForFunction(() => window.__AIXM.S.files.every((f) => f.status !== 'parsing' && f.status !== 'indexing' && f.status !== 'checking') && !window.__AIXM.S.adding, null, { timeout: 90000 });
    await page.waitForTimeout(1500);
  }
  async function dl(click, n) {
    const files = [];
    const wait = new Promise((resolve) => { page.on('download', async function h(dd) { const p = path.join(OUT, dd.suggestedFilename()); await dd.saveAs(p); files.push(p); if (files.length >= (n || 1)) { page.off('download', h); resolve(); } }); });
    await click();
    await Promise.race([wait, new Promise((_, rej) => setTimeout(() => rej(new Error('no download')), 60000))]);
    return files;
  }
  async function closeReport() { const t = await page.evaluate(() => { const m = document.querySelector('.ddx-report'); const s = m ? m.innerText : ''; const b = document.querySelector('.modal-back'); if (b) b.remove(); return s; }); return t; }
  async function panel(id, opts) {
    const sel = '.ddx[data-ddx="' + id + '"]';
    await page.waitForSelector(sel);
    if (opts.scope) await page.selectOption(sel + ' [data-ddxk="scope"]', opts.scope);
    await page.selectOption(sel + ' [data-ddxk="ver"]', opts.ver);
    if (opts.rel) {
      await page.evaluate((s) => { const d = document.querySelector(s + ' details'); if (d) d.open = true; }, sel);
      for (const k of opts.rel) await page.check(sel + ' [data-ddxrel="' + k + '"]');
    }
    if (opts.nm) { await page.fill(sel + ' [data-ddxk="nm"]', String(opts.nm)); await page.dispatchEvent(sel + ' [data-ddxk="nm"]', 'change'); }
    const files = await dl(() => page.click(sel + ' [data-ddxgo]'));
    await page.waitForSelector('.ddx-report', { timeout: 30000 });
    return { file: files[0], rep: await closeReport(), xml: fs.readFileSync(files[0], 'utf8') };
  }
  // a file read again on its own: feature counts, references left unresolved
  const reread = [];
  async function check(f) { reread.push(f); }

  await load([T + 'Donlon_ALL_Baseline_2025.xml', T + 'EA_EADD_OBS_DS_AREA_2_3_4_FULL_20191205.xml', T + 'ifp_test_EADD.xml', T + 'ifp52_test_EADD.xml', T + 'amxm_test_EAXM.xml', csv, tif]);
  await page.evaluate(() => window.__AIXM.go('digital'));
  // obstacles: the AIXM 5.1 obstacle data set
  await page.click('[data-ddsec="obs"]'); await page.waitForSelector('.ov-sets');
  const obsIdx = await page.evaluate(() => window.__AIXM.S.datasets.findIndex((x) => /OBS_DS/.test(x.name)));
  await page.click('[data-ovset="' + obsIdx + '"]'); await page.click('[data-ovtab="report"]');
  const o1 = await panel('obs', { scope: 'all', ver: 'orig', rel: ['areas', 'aerodrome', 'procs'], nm: 1 });
  if (!/<aixm:ObstacleArea/.test(o1.xml) || !/Left out/.test(o1.rep)) fails.push('obstacles as delivered: ' + o1.rep);
  check({ name: 'obstacles 5.1', file: o1.file, want: { VerticalStructure: 15 }, allow: /ownerRunway|ownerAirport|hostedNavaidEquipment|supportedService/ }); // the 5.1.1 AIP data is left out of a 5.1 file (reported)
  const o2 = await panel('obs', { scope: 'all', ver: '5.1.1' });
  if (!/<aixm:AirportHeliport/.test(o2.xml) || !/related: .*passes within/.test(o2.xml)) fails.push('obstacles as 5.1.1 with aerodrome and procedures: ' + o2.rep);
  check({ name: 'obstacles 5.1.1', file: o2.file, want: { VerticalStructure: 15, AirportHeliport: 1 } });
  // obstacle table
  const csvIdx = await page.evaluate(() => window.__AIXM.S.datasets.findIndex((x) => /new_obstacles/.test(x.name)));
  await page.click('[data-ovset="' + csvIdx + '"]'); await page.click('[data-ovtab="report"]');
  const vers = await page.evaluate(() => [...document.querySelectorAll('.ddx[data-ddx="obs"] [data-ddxk="ver"] option')].map((o) => o.value).join());
  if (vers !== '5.1.1,5.1,5.2') fails.push('versions for an obstacle table: ' + vers);
  const o3 = await panel('obs', { scope: 'all', ver: '5.1.1', rel: [] });
  check({ name: 'obstacle table 5.1.1', file: o3.file, want: { VerticalStructure: 2 } });

  // procedures in AIXM 5.2 (two IFP data sets of different versions)
  await page.click('[data-ddsec="ifp"]');
  const p1 = await panel('ifp', { scope: 'all', ver: '5.2', rel: ['holdings'] });
  if (!/schema\/5\.2"/.test(p1.xml) || !/<aixm:RF<|legTypeARINC>RF</.test(p1.xml)) fails.push('procedures 5.2: ' + p1.rep);
  check({ name: 'procedures 5.2', file: p1.file, want: { StandardInstrumentDeparture: 2, InstrumentApproachProcedure: 2, StandardInstrumentArrival: 2 }, allow: /altimeterSource/ }); // AltimeterSource is not in AIXM 5.2 (reported)
  if (!/Not in AIXM 5\.2 .*AltimeterSource/.test(p1.rep)) fails.push('5.2 report: ' + p1.rep);

  // aerodrome mapping
  await page.click('[data-ddsec="amxm"]'); await page.click('[data-amtype="RunwayThreshold"]'); await page.waitForTimeout(400);
  const a1 = await panel('amxm', { scope: 'type', ver: 'orig' });
  if (!/<amxm:RunwayThreshold/.test(a1.xml)) fails.push('AMXM as delivered');
  check({ name: 'AMXM', file: a1.file, want: {} });
  const a2 = await panel('amxm', { scope: 'all', ver: '5.1.1' });
  if (!/<aixm:RunwayElement|<aixm:Runway\b/.test(a2.xml)) fails.push('AMXM as AIXM: ' + a2.rep);
  check({ name: 'AMXM as AIXM', file: a2.file, want: {} });

  // terrain of an area
  await page.click('[data-ddsec="ter"]'); await page.click('[data-tvtab="rep"]'); await page.waitForSelector('.tv-x');
  await page.selectOption('[data-tvx="ad"]', 'EADD'); await page.fill('[data-tvx="nm"]', '5'); await page.dispatchEvent('[data-tvx="nm"]', 'change');
  const terr = {};
  for (const fmt of ['tif', 'asc', 'xyz']) {
    await page.selectOption('[data-tvx="fmt"]', fmt);
    const fl = await dl(() => page.click('[data-tvxgo]'), 2);
    terr[fmt] = fl.map((f) => path.basename(f) + ' ' + fs.statSync(f).size);
  }
  const tObs = await dl(() => page.click('[data-tvxobs]')); await page.waitForSelector('.ddx-report'); await closeReport();
  check({ name: 'obstacles of the area', file: tObs[0], want: {} });
  console.log('terrain', JSON.stringify(terr));
  const gt = fs.readdirSync(OUT).filter((f) => /^terrain_EADD_5NM.*\.tif$/.test(f)).map((f) => OUT + '/' + f)[0];

  // read every file again on its own
  for (const f of reread) {
    await load([f.file]);
    const r = await page.evaluate(async () => { const ds = window.__AIXM.S.datasets[0]; if (!ds) return null; const by = {}; ds.recs.forEach((x) => { by[x.k] = (by[x.k] || 0) + 1; }); const q = await window.ANALYSIS.quality(ds); return { v: ds.version, n: ds.recs.length, by, unres: q.filter((i) => i.rule === 'References' && i.sev !== 'info').map((i) => i.msg) }; }).catch((e) => ({ err: e.message }));
    console.log(f.name, JSON.stringify(r));
    if (!r || !r.n) { fails.push(f.name + ': not read again'); continue; }
    Object.keys(f.want).forEach((k) => { if ((r.by[k] || 0) < f.want[k]) fails.push(f.name + ': ' + k + ' ' + (r.by[k] || 0) + ' < ' + f.want[k]); });
    if (r.unres && r.unres.filter((m) => !(f.allow && f.allow.test(m))).length) fails.push(f.name + ': unresolved ' + r.unres.join(' | '));
  }
  // the GeoTIFF post for post
  await load([gt]);
  const back = await page.evaluate(async () => { const it = DEM.items()[0]; if (!it || it.status !== 'ready') return null; const pts = [[-32.0, 52.4], [-31.95, 52.37], [-32.05, 52.42]]; const o = []; for (const p of pts) { const e = await DEM.elevation(p[0], p[1]); o.push(e ? e.h : null); } return { o, area: it.r.area, vd: it.r.vDatum }; });
  const want = [[-32.0, 52.4], [-31.95, 52.37], [-32.05, 52.42]].map((p) => elev(p[0], p[1]));
  console.log('GeoTIFF read again', JSON.stringify(back), 'want', JSON.stringify(want));
  if (!back || back.o.some((x, i) => x === null || Math.abs(x - want[i]) > 6) || !/EGM96/.test(back.vd || '')) fails.push('terrain GeoTIFF read again: ' + JSON.stringify(back));

  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
  console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : 'Digital data exports (obstacles, procedures, aerodrome mapping in AIXM; terrain of an area) OK');
  if (errors.length || fails.length) process.exitCode = 1;
  await browser.close();
})();
