// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Terrain in the Digital data tab, with terrain files written from a known elevation function around Donlon (EADD):
// - GeoTIFF (tiled, Deflate), DTED, SRTM .hgt and ESRI ASCII grid are recognised on the Files page, opened from their
//   headers and scanned (statistics, voids) without reading the whole file at once;
// - the elevation at a point matches the function; the shaded relief is drawn on the map of the section;
// - the flight path study gives a finding for every procedure leg, the aerodrome study the highest terrain per ring,
//   the cross-check compares the AIXM elevations with the files;
// - the terrain report (PDF with map pictures, Excel) is produced;
// - obstacles: the ones affecting flight paths are flagged; obstacles chosen in the list and by Ctrl+click on the map
//   are analysed in depth (PDF with an overview picture and one picture per obstacle, Excel).
/* global DEM, TERVIEW, OBSTVIEW */
const fs = require('fs');
const env = require('./_env');
const TR = require('./_terrain');
const ROOT = env.ROOT, OUT = env.out('terrain'), T = ROOT + '/testdata/';
const URL = 'file://' + ROOT + '/AIXM-Code-Converter.html';

// sea level plain with a ridge north-west of the aerodrome (about 900 m) and a 1000 m hill under the initial approach
function elev(lon, lat) {
  const d = Math.hypot((lon + 32.3) * 0.61, lat - 52.6), d2 = Math.hypot((lon + 32.03) * 0.61, lat - 52.12);
  return Math.round(40 + 860 * Math.exp(-d * d / 0.004) + 1000 * Math.exp(-d2 * d2 / 0.0006) + 25 * Math.sin(lon * 40) * Math.cos(lat * 30));
}

(async () => {
  // terrain files
  const d = 3 / 3600, lon0 = -32.8, lat1 = 52.9, W = 1920, H = 1200, v = new Float64Array(W * H);
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) v[r * W + c] = elev(lon0 + c * d, lat1 - r * d);
  const files = {
    'EADD_terrain.tif': TR.tiff({ le: true, type: 'i16', comp: 8, pred: 2, tile: [256, 256], nodata: -32768, images: [{ w: W, h: H, v }],
      keys: [[1024, 2], [1025, 2], [2048, 4326], [4096, 5773]], tie: [0, 0, 0, lon0, lat1, 0], scale: [d, d, 0] }),
    'N52W034.hgt': TR.hgt(52, -34, 121, elev),
    'e033_n52.dt1': TR.dted(-33, 52, 121, 300, 1, elev),
    'EADD_south.asc': TR.asc(-32.6, 51.6, 0.005, 200, 60, elev, true)
  };
  const paths = Object.keys(files).map((n) => { const p = OUT + '/' + n; fs.writeFileSync(p, files[n]); return p; });
  // an obstacle table with a mast under the final approach (its top 38 m below the 1600 ft of the final leg)
  const csv = OUT + '/EADD_new_obstacles.csv';
  fs.writeFileSync(csv, 'Obstacle ID,Type,Latitude,Longitude,Elevation (m),Height (m),Lighted\r\nNEW-MAST-1,Mast,52.3700,-32.0500,450,405,No\r\nNEW-TREE-2,Tree,52.4500,-31.8000,60,18,No\r\n');

  const browser = await env.playwright.chromium.launch({ executablePath: env.chrome });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [], fails = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (x) => x.accept());
  async function download(sel) {
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), page.click(sel)]);
    const p = OUT + '/' + dl.suggestedFilename(); await dl.saveAs(p);
    return fs.statSync(p).size;
  }

  // terrain files only: the app opens the Terrain section
  await page.goto(URL); await page.waitForSelector('#drop');
  await page.setInputFiles('#file-input', paths);
  await page.waitForFunction((n) => !window.__AIXM.S.adding && window.__AIXM.S.files.length >= n && window.__AIXM.S.files.every((f) => f.status !== 'checking'), paths.length, { timeout: 30000 });
  await page.evaluate(() => document.querySelector('#extract-btn').click());
  await page.waitForFunction(() => DEM.items().length === 4 && DEM.items().every((i) => i.status !== 'opening' && i.stats), null, { timeout: 60000 });
  const view = await page.evaluate(() => window.__AIXM.S.view);
  if (view !== 'digital') fails.push('terrain files only: view ' + view);
  const items = await page.evaluate(() => DEM.items().map((i) => ({ n: i.name, s: i.status, f: i.r && i.r.format, area: i.r && i.r.area, min: i.stats && i.stats.min, max: i.stats && i.stats.max, err: i.err })));
  items.forEach((i) => { if (i.s !== 'ready') fails.push('file not opened: ' + JSON.stringify(i)); });
  const tif = items.find((i) => /tif$/.test(i.n));
  if (!tif || tif.area !== 1 || !(tif.max > 950 && tif.max < 1060)) fails.push('GeoTIFF: ' + JSON.stringify(tif));
  // elevation at points against the function (the finest file answers)
  const pts = [[-32.3, 52.6], [-32.1, 52.45], [-31.95, 52.37]];
  const got = await page.evaluate(async (p) => { const o = []; for (const q of p) { const e = await DEM.elevation(q[0], q[1]); o.push(e ? [e.h, e.item.name] : null); } return o; }, pts);
  got.forEach((g, i) => { const want = elev(pts[i][0], pts[i][1]); if (!g || Math.abs(g[0] - want) > 6) fails.push('elevation at ' + pts[i] + ': ' + JSON.stringify(g) + ' want ' + want); });
  await page.waitForSelector('.tv-map'); await page.waitForTimeout(2500);
  const cards = await page.evaluate(() => document.querySelectorAll('.tv-panel .card').length);
  if (cards !== 4) fails.push('file cards: ' + cards);
  const tiles = await page.evaluate(() => document.querySelectorAll('.tv-map canvas.leaflet-tile').length);
  if (!tiles) fails.push('no shaded relief tiles on the map');
  await page.screenshot({ path: OUT + '/files.png' });

  // with the AIP, procedures and obstacles: the studies (the terrain files are kept)
  await page.evaluate(() => window.__AIXM.go('files'));
  await page.setInputFiles('#file-input', [T + 'Donlon_ALL_Baseline_2025.xml', T + 'ifp_test_EADD.xml', T + 'EA_EADD_OBS_DS_AREA_2_3_4_FULL_20191205.xml', csv]);
  await page.waitForFunction(() => !window.__AIXM.S.adding && window.__AIXM.S.files.every((f) => f.status !== 'checking'), null, { timeout: 30000 });
  await page.evaluate(() => document.querySelector('#extract-btn').click());
  await page.waitForFunction(() => window.__AIXM.S.datasets.length >= 4 && window.__AIXM.S.files.every((f) => f.status !== 'parsing' && f.status !== 'indexing'), null, { timeout: 60000 });
  await page.evaluate(() => window.__AIXM.go('digital'));
  await page.click('[data-ddsec="ter"]'); await page.waitForSelector('.tv-map');
  if ((await page.evaluate(() => DEM.items().length)) !== 4) fails.push('terrain files lost when the AIXM data was added');

  await page.click('[data-tvtab="fp"]'); await page.click('[data-tvrun]');
  await page.waitForFunction(() => TERVIEW.state.fp && !TERVIEW.state.fpRun, null, { timeout: 120000 });
  const fp = await page.evaluate(() => { const c = {}; TERVIEW.state.fp.forEach((x) => { c[x.sev] = (c[x.sev] || 0) + 1; }); return { n: TERVIEW.state.fp.length, c, legs: TERVIEW.state.fp.map((x) => x.seg.label + ' ' + x.sev + ' ' + Math.round(x.terrain) + '/' + Math.round(x.seg.alt) + ' ' + x.seg.coords[0].map((v) => v.toFixed(2))), src: TERVIEW.state.fp[0] && TERVIEW.state.fp[0].src, rows: document.querySelectorAll('.tv-panel tbody tr').length }; });
  if (fp.n !== 7 || !(fp.c.warning >= 1) || fp.rows !== fp.n || !/EADD_terrain|terrain file/i.test(fp.src || '')) fails.push('flight path study: ' + JSON.stringify(fp));
  await page.screenshot({ path: OUT + '/flight_paths.png' });

  await page.click('[data-tvtab="ad"]'); await page.click('[data-tvad="EADD"]');
  await page.waitForFunction(() => TERVIEW.state.adRes.EADD, null, { timeout: 120000 });
  const ad = await page.evaluate(() => { const r = TERVIEW.state.adRes.EADD.res; return { hi: r.highest.map((x) => x && Math.round(x.h)), pens: r.pens.length, src: r.src }; });
  if (!(ad.hi[ad.hi.length - 1] > 850)) fails.push('aerodrome study: ' + JSON.stringify(ad));
  await page.screenshot({ path: OUT + '/aerodrome.png' });

  await page.click('[data-tvtab="xc"]'); await page.click('[data-tvxc]');
  await page.waitForFunction(() => TERVIEW.state.xc, null, { timeout: 120000 });
  const xc = await page.evaluate(() => ({ n: TERVIEW.state.xc.length, rows: document.querySelectorAll('.tv-xc-body tbody tr').length, kinds: [...new Set(TERVIEW.state.xc.map((x) => x.x.what))] }));
  if (!xc.n || xc.rows !== Math.min(xc.n, 1500) || !xc.kinds.some((k) => /Obstacle/.test(k))) fails.push('cross-check: ' + JSON.stringify(xc));

  await page.click('[data-tvtab="rep"]');
  const pdf = await download('[data-tvrep="pdf"]').catch((e) => { fails.push('terrain PDF: ' + e.message.split('\n')[0]); return 0; });
  if (pdf && pdf < 60000) fails.push('terrain PDF without pictures? ' + pdf + ' bytes');
  const xl = await download('[data-tvrep="xlsx"]').catch((e) => { fails.push('terrain Excel: ' + e.message.split('\n')[0]); return 0; });
  if (xl && xl < 2000) fails.push('terrain Excel empty');

  // obstacles: affecting flight paths, chosen in the list and on the map, analysed in depth with pictures
  await page.click('[data-ddsec="obs"]'); await page.waitForSelector('.ov-map');
  const obsIdx = await page.evaluate(() => window.__AIXM.S.datasets.findIndex((d) => /OBS_DS/.test(d.name)));
  await page.click('[data-ovset="' + obsIdx + '"]'); await page.waitForSelector('.ov-tbl tbody tr');
  const fpObs = await page.evaluate(() => { const all = [].concat(...OBSTVIEW.model(window.__AIXM.S.datasets).sets.map((x) => x.rows)).filter((x) => x.fp); return { n: all.length, ids: all.map((x) => x.id + ' ' + x.fp.sev + ' ' + Math.round(x.fp.clr) + ' ' + x.fp.seg.label) }; });
  if (fpObs.n !== 1 || !/^NEW-MAST-1 warning 38 .*09L/.test(fpObs.ids[0])) fails.push('obstacles affecting flight paths: ' + JSON.stringify(fpObs));
  const boxes = await page.$$('.ov-tbl tbody [data-ovpick]');
  for (const b of boxes.slice(0, 3)) await b.click();
  let chosen = await page.evaluate(() => OBSTVIEW.state.picked.size);
  if (chosen !== 3) fails.push('obstacles chosen in the list: ' + chosen);
  // Ctrl+click on a marker not chosen yet, near the middle of the map
  await page.evaluate(() => document.querySelector('.ov-map').scrollIntoView({ block: 'center' })); await page.waitForTimeout(800);
  const marker = await page.evaluate(() => {
    const el = document.querySelector('.ov-map'), mm = el._ddmap, r = el.getBoundingClientRect();
    let best = null;
    for (const m of mm.items) {
      if (OBSTVIEW.state.picked.has(m._row.r)) continue;
      const p = mm.map.latLngToContainerPoint(m.getLatLng()), d = Math.hypot(p.x - r.width / 2, p.y - r.height / 2);
      if (!best || d < best.d) best = { d, at: [r.left + p.x, r.top + p.y] };
    }
    return best && best.at;
  });
  if (marker) { await page.keyboard.down('Control'); await page.mouse.click(marker[0], marker[1]); await page.keyboard.up('Control'); }
  chosen = await page.evaluate(() => ({ n: OBSTVIEW.state.picked.size, bar: document.querySelector('.ov-pickbar b').textContent }));
  if (!marker || chosen.n !== 4 || chosen.bar !== '4') fails.push('obstacle chosen on the map (Ctrl+click): ' + JSON.stringify(chosen));
  await page.screenshot({ path: OUT + '/obstacles_chosen.png' });
  const ana = await download('[data-ovana="sel:pdf"]').catch((e) => { fails.push('analysis PDF: ' + e.message.split('\n')[0]); return 0; });
  const anaFile = fs.readdirSync(OUT).filter((f) => /^Obstacle_analysis.*\.pdf$/.test(f)).map((f) => OUT + '/' + f).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
  const imgs = anaFile ? (fs.readFileSync(anaFile, 'latin1').match(/\/Subtype\s*\/Image/g) || []).length : 0;
  if (imgs !== 5) fails.push('analysis PDF: ' + imgs + ' pictures (overview + 4 obstacles expected), ' + ana + ' bytes');
  const xlA = await download('[data-ovana="sel:xlsx"]').catch((e) => { fails.push('analysis Excel: ' + e.message.split('\n')[0]); return 0; });
  if (xlA && xlA < 2000) fails.push('analysis Excel empty');
  // the scope "affecting flight paths" on the Reports tab
  await page.click('[data-ovset="all"]'); await page.click('[data-ovtab="report"]');
  const scopes = await page.evaluate(() => [...document.querySelectorAll('[data-ovf="anaScope"] option')].map((o) => o.value + (o.disabled ? '-' : '')));
  if (scopes.join() !== 'sel,fp,list') fails.push('analysis scopes: ' + scopes.join());
  if ((await page.evaluate(() => OBSTVIEW.state.sel)) !== 'all') fails.push('All the obstacle data sets: not kept');
  await page.selectOption('[data-ovf="anaScope"]', 'fp'); await page.waitForTimeout(400);
  const anaFp = await download('[data-ovana="fp:pdf"]').catch((e) => { fails.push('analysis PDF of the obstacles affecting flight paths: ' + e.message.split('\n')[0]); return 0; });
  if (anaFp && anaFp < 50000) fails.push('analysis PDF of the obstacles affecting flight paths: ' + anaFp + ' bytes');

  console.log('files', JSON.stringify(items), '\nflight paths', JSON.stringify(fp), '\naerodrome', JSON.stringify(ad), '\ncross-check', JSON.stringify(xc), '\nPDF', pdf, 'Excel', xl);
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
  console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : 'Terrain (files, map, flight paths, aerodrome, cross-check, reports) OK');
  if (errors.length || fails.length) process.exitCode = 1;
  await browser.close();
})();
