// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// The sources of aerodrome mapping, all in Digital data (nothing of it runs when the page opens):
// - Digital data opens without any data; each section takes its own files (obstacles, procedures, terrain) and the
//   aerodrome mapping section opens on 📤 Upload;
// - dropped in Upload, the AIP data set, a State chart (a PDF made here), a scanned chart, an OpenStreetMap file (made
//   here about EADD) and an orthophoto (a PNG with its world file) go where they belong;
// - the chart: its type and its ICAO Annex 4 contents, against the AIP data set, a misread stand left out; its stands,
//   strength and lighting in the generated data; PDF.js reads it without an error;
// - OpenStreetMap: taxiways, aprons, stands confirmed by the chart, holding positions, the routing network; the
//   readiness of EADD reaches 95 % and more;
// - tracing on imagery: the licence decides (visual check only / non-commercial / allowed); stands, a taxiway and an
//   apron traced and taken in by Generate; export and load back; the orthophoto placed on the map;
// - the generated AMXM is valid against the AMXM 2.0.2 schema; the package sources record the ODbL.
/* global AMDBX, AMDBDOC, AMDBOSM, AMDBTRACE, AMDBPKG, LAZY */
const env = require('./_env');
const fs = require('fs');
const path = require('path');
const ROOT = env.ROOT, OUT = env.out('amdb_sources'), T = ROOT + '/testdata/';
const URL = 'file://' + ROOT + '/AIXM-Code-Converter.html';
const { jsPDF } = require(path.join(ROOT, 'tools/node_modules/jspdf'));
const { validateAmxm } = require('./_xsd');
function dms(v, lat) { const h = lat ? (v < 0 ? 'S' : 'N') : (v < 0 ? 'W' : 'E'); v = Math.abs(v); const d = Math.floor(v), m = Math.floor((v - d) * 60), s = ((v - d) * 60 - m) * 60; return String(d).padStart(lat ? 2 : 3, '0') + String(m).padStart(2, '0') + s.toFixed(2).padStart(5, '0') + h; }

(async () => {
  const browser = await env.playwright.chromium.launch({ executablePath: env.chrome });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
  await ctx.route(/^https?:\/\//, (r) => r.abort()); // no network: tiles and servers are not needed here
  const page = await ctx.newPage();
  const errors = [], fails = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const status = () => page.evaluate(() => (document.querySelector('.up-st') || {}).textContent || '');
  async function drop(files, wait) {
    const before = await status();
    await page.setInputFiles('[data-upin]', files);
    await page.waitForFunction((b) => { const s = (document.querySelector('.up-st') || {}).textContent || ''; return s && s !== b && !document.querySelector('.up-st .spinner'); }, before, { timeout: 90000 });
    if (wait) await page.waitForSelector(wait, { timeout: 30000 });
  }

  /* ------------------------------------------------- Digital data, no data yet */
  await page.goto(URL); await page.waitForSelector('#drop'); await page.evaluate(() => localStorage.setItem('aixm-amdb-mode', 'all')); // every tool as a tab (the steps: amdb_flow.js)
  const idle = await page.evaluate(() => ['src-amdbdoc', 'src-amdbtrace'].map((k) => [typeof window[k === 'src-amdbdoc' ? 'AMDBDOC' : 'AMDBTRACE'], (document.getElementById(k) || {}).type]));
  if (idle.some((x) => x[0] !== 'undefined' || x[1] !== 'text/plain')) fails.push('the new modules ran before they were needed: ' + JSON.stringify(idle));
  const nav = await page.evaluate(() => !document.querySelector('[data-view="digital"]').disabled);
  if (!nav) fails.push('Digital data is not open without data');
  await page.evaluate(() => window.__AIXM.go('digital'));
  await page.waitForSelector('.up-drop', { timeout: 30000 });
  const start = await page.evaluate(() => ({ sec: document.querySelector('.dd-sec.on').getAttribute('data-ddsec'), tab: document.querySelector('.am-tabs .active').getAttribute('data-amtab'), dis: Array.from(document.querySelectorAll('[data-ddsec]')).filter((b) => b.disabled).length }));
  if (start.sec !== 'amxm' || start.tab !== 'upload' || start.dis) fails.push('Digital data without data: ' + JSON.stringify(start));

  /* --------------------------------------------------------- the AIP data set */
  await drop([T + 'EA_AIP_DS_FULL_20170701.xml'], '.up-drop');
  const after = await page.evaluate(() => ({ view: window.__AIXM.S.view, tab: document.querySelector('.am-tabs .active').getAttribute('data-amtab'), sets: window.__AIXM.S.datasets.length, st: document.querySelector('.up-st').textContent }));
  if (after.view !== 'digital' || after.tab !== 'upload' || after.sets !== 1 || !/1 data file\(s\) read/.test(after.st)) fails.push('AIP data set dropped in Upload: ' + JSON.stringify(after));
  const ad = await page.evaluate(() => { const c = AMDBX.candidates(window.__AIXM.S.datasets).filter((x) => x.code === 'EADD')[0]; return { arp: c.arp, rwys: c.rwys.map((r) => ({ des: r.des, len: r.len, wid: r.wid, dirs: r.dirs.map((d) => ({ des: d.des, thr: (d.pts.filter((q) => /^THR$/.test(q.role) && q.c)[0] || {}).c })) })) }; });

  /* ---------------------------------------- a parking / docking chart of EADD */
  const doc = new jsPDF({ unit: 'pt', format: 'a4' }); let y = 40; const line = (t) => { doc.text(t, 30, y); y += 14; };
  doc.setFontSize(10);
  const stand = (i) => [ad.arp[0] + 0.003 + Math.floor((i - 1) / 4) * 0.0006, ad.arp[1] - 0.0015 - ((i - 1) % 4) * 0.0004];
  line('AIRCRAFT PARKING/DOCKING CHART - ICAO'); line('DONLON / DONLON INTL (EADD)'); line('VAR 3°W (2017) ANNUAL CHANGE 0.1°E'); line('APRON ELEV 30 FT');
  line('STAND COORDINATES'); line('STAND    LATITUDE        LONGITUDE');
  for (let i = 1; i <= 12; i++) { const p = stand(i); line(String(i) + '    ' + dms(p[1], true) + '    ' + dms(p[0], false)); }
  line('13    ' + dms(ad.arp[1] + 0.05, true) + '    ' + dms(ad.arp[0] + 0.003, false)); // misread: 5 km off
  line('STANDS 14-16 FOR CODE C AIRCRAFT'); line('TWY A, B1 and B2: 23 M wide'); line('VDGS at stands 1-8'); line('HOT SPOT HS1: TWY B1 / RWY 09L');
  const r0 = ad.rwys[0];
  line('RWY ' + r0.des + ' ' + Math.round(r0.len) + ' x ' + Math.round(r0.wid) + ' M PCN 80/R/B/W/T CONC');
  line('RWY ' + r0.dirs[0].des + ': PALS CAT II, RTHL, RCLL, TDZL, PAPI'); line('GND 121.800   TWR 118.100');
  line(r0.dirs[0].des + '  THR ' + dms(r0.dirs[0].thr[1], true) + ' ' + dms(r0.dirs[0].thr[0], false));
  fs.writeFileSync(OUT + '/EADD_parking_docking_chart.pdf', Buffer.from(doc.output('arraybuffer')));
  // a scanned chart: a drawing, no text
  const scan = new jsPDF({ unit: 'pt', format: 'a4' }); scan.rect(40, 40, 300, 200); scan.line(40, 40, 340, 240);
  fs.writeFileSync(OUT + '/EADD_scanned_chart.pdf', Buffer.from(scan.output('arraybuffer')));
  await drop([OUT + '/EADD_parking_docking_chart.pdf', OUT + '/EADD_scanned_chart.pdf'], '.up-docs');
  const docs = await page.evaluate(() => AMDBDOC.list().map((d) => ({ name: d.name, kind: d.f && d.f.kind, ad: d.ad, note: d.note, gave: AMDBDOC.gave(d) })));
  const chart = docs.filter((d) => /parking/.test(d.name))[0] || {}, sc = docs.filter((d) => /scanned/.test(d.name))[0] || {};
  if (!chart.kind || chart.kind.id !== 'apdc' || !chart.kind.icaoTitle || chart.ad !== 'EADD' || !/13 stand position\(s\)/.test(chart.gave)) fails.push('chart read: ' + JSON.stringify(chart));
  if (!/picture .*read it with OCR/.test(sc.note || '')) fails.push('scanned chart: ' + JSON.stringify(sc));
  await page.click('[data-doccheck]'); await page.waitForSelector('.doc-chk');
  const chk = await page.evaluate(() => ({ a4: Array.from(document.querySelectorAll('.doc-a4 tr[data-a4]')).map((r) => r.getAttribute('data-a4')), x: Array.from(document.querySelectorAll('.doc-x tr[data-x]')).map((r) => r.getAttribute('data-x') + ' ' + r.children[1].textContent), gaps: Array.from(document.querySelectorAll('.up-gaps li')).map((l) => l.textContent) }));
  if (chk.a4.length !== 17 || chk.a4.filter((x) => x === 'found').length < 9 || chk.a4.indexOf('drawn') < 0) fails.push('ICAO Annex 4 check: ' + JSON.stringify(chk.a4));
  if (!chk.x.some((x) => /^ok Threshold 09L/.test(x)) || !chk.x.some((x) => /^ok Runway .* strength/.test(x)) || !chk.x.some((x) => /^bad Stand left out/.test(x))) fails.push('chart against the AIP: ' + JSON.stringify(chk.x));
  if (!/12 stand\(s\) placed as published/.test(chk.gaps.join(' ')) || !/misread/.test(chk.gaps.join(' '))) fails.push('how the gaps are filled: ' + JSON.stringify(chk.gaps));
  const [rep] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('[data-docrep]')]);
  if (!/\.pdf$/.test(rep.suggestedFilename())) fails.push('chart check report: ' + rep.suggestedFilename());
  await page.screenshot({ path: OUT + '/upload_chart.png', fullPage: true });

  /* ---------------------------------------------- OpenStreetMap about EADD */
  const P = (lon, lat) => ({ lat, lon }), A0 = ad.arp, osm = { version: 0.6, generator: 'test', elements: [] };
  let id = 1;
  const way = (tags, pts) => osm.elements.push({ type: 'way', id: id++, tags, geometry: pts.map((q) => P(q[0], q[1])) });
  const node = (tags, q) => osm.elements.push({ type: 'node', id: id++, tags, lat: q[1], lon: q[0] });
  way({ aeroway: 'aerodrome', icao: 'EADD', name: 'Donlon Intl' }, [[A0[0] - 0.04, A0[1] - 0.02], [A0[0] + 0.04, A0[1] - 0.02], [A0[0] + 0.04, A0[1] + 0.02], [A0[0] - 0.04, A0[1] + 0.02], [A0[0] - 0.04, A0[1] - 0.02]]);
  const yA = A0[1] - 0.0005;
  way({ aeroway: 'taxiway', ref: 'A' }, [[A0[0] - 0.012, yA], [A0[0], yA], [A0[0] + 0.012, yA]]);
  way({ aeroway: 'taxiway', ref: 'B1' }, [[A0[0] - 0.006, yA], [A0[0] - 0.006, r0.dirs[0].thr[1] - 0.0001]]);
  way({ aeroway: 'taxiway', ref: 'B2' }, [[A0[0] + 0.008, yA], [A0[0] + 0.008, A0[1] - 0.0045]]);
  way({ aeroway: 'taxilane' }, [[A0[0] + 0.0025, yA], [A0[0] + 0.0025, A0[1] - 0.003]]);
  way({ aeroway: 'apron', ref: 'APN 1', surface: 'concrete' }, [[A0[0] + 0.002, A0[1] - 0.0010], [A0[0] + 0.0055, A0[1] - 0.0010], [A0[0] + 0.0055, A0[1] - 0.0032], [A0[0] + 0.002, A0[1] - 0.0032], [A0[0] + 0.002, A0[1] - 0.0010]]);
  [1, 2, 3, 4].forEach((i) => { const p = stand(i); node({ aeroway: 'parking_position', ref: String(i) }, [p[0] + 0.00005, p[1]]); });
  [21, 22].forEach((i, k) => node({ aeroway: 'parking_position', ref: String(i) }, [A0[0] + 0.0050, A0[1] - 0.0015 - k * 0.0005]));
  node({ aeroway: 'holding_position', 'holding_position:type': 'ILS' }, [A0[0] + 0.008, A0[1] - 0.0040]);
  way({ aeroway: 'terminal', building: 'terminal', name: 'Terminal 1', 'building:levels': '3' }, [[A0[0] + 0.006, A0[1] - 0.0012], [A0[0] + 0.0075, A0[1] - 0.0012], [A0[0] + 0.0075, A0[1] - 0.0025], [A0[0] + 0.006, A0[1] - 0.0025], [A0[0] + 0.006, A0[1] - 0.0012]]);
  node({ aeroway: 'windsock' }, [A0[0] - 0.01, A0[1] + 0.001]);
  fs.writeFileSync(OUT + '/EADD_osm.json', JSON.stringify(osm));
  await drop([OUT + '/EADD_osm.json'], '.up-drop');
  const os = await page.evaluate(() => ({ st: document.querySelector('.up-st').textContent, sum: AMDBOSM.get('EADD') ? AMDBOSM.summary(AMDBOSM.get('EADD')) : null }));
  if (!/OpenStreetMap, \d+ element/.test(os.st) || !os.sum || os.sum.taxiway < 3 || os.sum.stand !== 6) fails.push('OpenStreetMap file: ' + JSON.stringify(os));

  /* ------------------------------------------------- an orthophoto with its world file */
  const png = await page.screenshot({ clip: { x: 0, y: 0, width: 80, height: 60 } });
  fs.writeFileSync(OUT + '/EADD_ortho.png', png);
  fs.writeFileSync(OUT + '/EADD_ortho.pgw', ['0.0001', '0', '0', '-0.0001', String(A0[0] - 0.004), String(A0[1] + 0.003)].join('\n'));
  await drop([OUT + '/EADD_ortho.png', OUT + '/EADD_ortho.pgw'], '.up-drop');
  const or = await page.evaluate(() => ({ st: document.querySelector('.up-st').textContent, o: AMDBTRACE.orthos(), utm: AMDBTRACE.crsOf('PROJCS["WGS_1984_UTM_Zone_25N",GEOGCS["GCS_WGS_1984"]]', {}).label }));
  if (!or.o.length || or.o[0].crs !== 'WGS 84' || or.o[0].w !== 80 || !/orthophoto 80 × 60 px/.test(or.st) || or.utm !== 'UTM zone 25N') fails.push('orthophoto: ' + JSON.stringify(or));

  /* ------------------------------------------------------------ trace on imagery */
  await page.click('[data-amtab="trace"]'); await page.waitForSelector('.tr-map.leaflet-container', { timeout: 30000 });
  const tr0 = await page.evaluate(() => ({ ad: document.querySelector('[data-trad]').value, imgs: Array.from(document.querySelectorAll('[data-trimg] option')).map((o) => o.value) }));
  if (tr0.ad !== 'EADD' || ['s2y', 's2', 'pdok', 'ign', 'usgs', 'esri', 'ortho-1'].some((k) => tr0.imgs.indexOf(k) < 0) || tr0.imgs.some((k) => /google/i.test(k))) fails.push('trace: aerodrome and imagery: ' + JSON.stringify(tr0));
  // the licence decides: Esri for a visual check only, Sentinel-2 2025 non-commercial, the own orthophoto allowed
  await page.selectOption('[data-trimg]', 'esri'); await page.waitForSelector('.tr-lic[data-lic="view"]');
  if (!(await page.$eval('[data-trtool="std"]', (b) => b.disabled))) fails.push('tracing on Esri imagery is not off');
  await page.selectOption('[data-trimg]', 's2y'); await page.waitForSelector('.tr-lic[data-lic="nc"]');
  if (!(await page.$eval('[data-trtool="std"]', (b) => b.disabled))) fails.push('tracing on non-commercial imagery without the confirmation');
  await page.selectOption('[data-trimg]', 'ortho-1'); await page.waitForSelector('.tr-lic[data-lic="derive"]');
  await page.waitForSelector('.tr-map img.tr-ortho', { state: 'attached' });
  const placed = await page.$eval('.tr-map img.tr-ortho', (i) => i.style.transform);
  if (!/^matrix\(/.test(placed)) fails.push('orthophoto not placed: ' + placed);
  await page.$eval('.tr-map', (e) => e.scrollIntoView({ block: 'center' }));
  const box = await page.$eval('.tr-map', (e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.click('[data-trtool="std"]'); await page.fill('[data-trname]', 'T1');
  await page.mouse.click(box.x, box.y); await page.mouse.click(box.x + 40, box.y);
  await page.click('[data-trtool="twy"]'); await page.fill('[data-trname]', 'Z9');
  await page.mouse.click(box.x - 120, box.y + 60); await page.mouse.click(box.x, box.y + 80); await page.mouse.click(box.x + 120, box.y + 70); await page.keyboard.press('Enter');
  await page.click('[data-trtool="apn"]'); await page.fill('[data-trname]', 'APN X');
  await page.mouse.click(box.x - 60, box.y - 40); await page.mouse.click(box.x + 60, box.y - 40); await page.mouse.click(box.x + 60, box.y - 110); await page.mouse.dblclick(box.x - 60, box.y - 110);
  const tr = await page.evaluate(() => ({ n: AMDBTRACE.count('EADD'), f: AMDBTRACE.features('EADD').map((f) => f.t + ':' + JSON.stringify(f.a.idstd || f.a.idlin || f.a.idapron || '')), src: AMDBTRACE.features('EADD')[0].src }));
  if (tr.n.std !== 2 || tr.n.twy !== 1 || tr.n.apn !== 1 || tr.f.join(' ') !== 'ParkingStandLocation:{"v":"T1"} ParkingStandLocation:{"v":"T2"} TaxiwayGuidanceLine:{"v":"Z9"} TaxiwayElement:{"v":"Z9"} ApronElement:{"v":"APN X"}' || !/^Digitised by the user on Orthophoto EADD_ortho\.png \(your own imagery\)/.test(tr.src)) fails.push('traced: ' + JSON.stringify(tr));
  await page.screenshot({ path: OUT + '/trace.png' });
  const [gj] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('[data-trexp]')]);
  const gjText = fs.readFileSync(await gj.path(), 'utf8');
  const back = await page.evaluate((t) => { AMDBTRACE.clearAll(); const n = AMDBTRACE.restore(t); return { n, c: AMDBTRACE.count('EADD') }; }, gjText);
  const back2 = await page.evaluate(() => AMDBTRACE.features('EADD').length);
  if (back.n !== 4 || back.c.all !== 4 || back2 !== 5) fails.push('traced features exported and loaded back: ' + JSON.stringify(back));

  /* ----------------------------------------------------------- generate and check */
  await page.click('[data-amtab="generate"]'); await page.waitForSelector('[data-gengo]');
  const cols = await page.evaluate(() => { const r = Array.from(document.querySelectorAll('[data-genrow]')).filter((t) => /EADD/.test(t.textContent))[0]; return r ? r.textContent : ''; });
  if (!/2 doc|1 doc/.test(cols) || !/traced/.test(cols)) fails.push('generate table, charts and traced column: ' + cols.slice(0, 300));
  const ready = await page.evaluate(() => { const c = AMDBX.candidates(window.__AIXM.S.datasets).filter((x) => x.code === 'EADD')[0]; const r = AMDBX.readiness(c); return { pct: r.pct, by: r.by, src: r.src, st: r.st }; });
  if (ready.pct < 95 || !ready.by.C || !ready.by.O || !ready.by.T) fails.push('readiness of EADD with the chart, OpenStreetMap and tracing: ' + JSON.stringify(ready));
  const gen = await page.evaluate(async () => {
    const c = AMDBX.candidates(window.__AIXM.S.datasets).filter((x) => x.code === 'EADD'), g = AMDBX.generate(c, {});
    await LAZY.run('src-amdbpkg');
    const by = (re) => g.features.filter((f) => re.test(f.a.source.v));
    return { n: g.features.length, chartStd: by(/^From the State's charts.*stand position/).length, chartLgt: by(/^From the State's charts.*CAT2 approach lighting/).length, osm: by(/^OpenStreetMap contributors/).length,
      confirmed: by(/number on the State's chart/).length, osmStd: g.features.filter((f) => f.t === 'ParkingStandLocation' && /^OpenStreetMap/.test(f.a.source.v)).map((f) => f.a.idstd && f.a.idstd.v), traced: by(/^Digitised by the user/).length,
      pcn: g.features.filter((f) => f.t === 'RunwayElement' && f.a.pcn).length, asrn: g.features.filter((f) => /^Asrn/.test(f.t)).length, hold: g.features.filter((f) => f.t === 'TaxiwayHoldingPosition').length,
      notes: g.notes, xml: AMDBPKG.writeAmxm(g.features, 'test') };
  });
  if (gen.chartStd !== 12 || !gen.chartLgt || !gen.osm || gen.traced !== 5 || !gen.asrn || gen.hold < 2) fails.push('generated from the sources: ' + JSON.stringify(Object.assign({}, gen, { xml: undefined })));
  // the chart's stands 1 to 4 are in OpenStreetMap too: kept once, from the chart; 21 and 22 come from OpenStreetMap
  if (gen.osmStd.sort().join() !== '21,22') fails.push('stands of OpenStreetMap beside the chart: ' + JSON.stringify(gen.osmStd));
  if (!gen.notes.some((n) => /1 left out — stand 13/.test(n))) fails.push('misread stand note: ' + JSON.stringify(gen.notes));
  const v = await validateAmxm(gen.xml);
  if (!v.valid) fails.push('generated AMXM not valid: ' + v.errors.slice(0, 3).join(' | '));
  fs.writeFileSync(OUT + '/EADD_generated_AMXM.xml', gen.xml);
  // generate and open: the package sources say ODbL and how the data was made
  await page.check('[data-genack]');
  await page.evaluate(() => { document.querySelectorAll('[data-gen]').forEach((cb) => { cb.checked = false; cb.dispatchEvent(new Event('change', { bubbles: true })); }); const r = Array.from(document.querySelectorAll('[data-genrow]')).filter((t) => /EADD/.test(t.textContent))[0]; const cb = r.querySelector('[data-gen]'); cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.click('[data-gengo]');
  await page.waitForFunction(() => window.__AIXM.S.datasets.some((d) => d.family === 'amxm'), null, { timeout: 60000 });
  await page.evaluate(() => window.__AIXM.go('digital')); await page.click('[data-amtab="sources"]');
  await page.waitForFunction(() => /ODbL/.test(document.querySelector('.am-body').innerHTML), null, { timeout: 30000 }).catch(() => {});
  const srcHtml = await page.$eval('.am-body', (e) => e.innerHTML);
  if (!/Open Database Licence|ODbL 1\.0/.test(srcHtml) || !/the State(&#39;|')s charts/.test(srcHtml)) fails.push('package sources do not record the ODbL and the charts');

  /* ----------------------------------------------- the other sections' uploads */
  await page.evaluate(() => window.__AIXM.go('digital')); await page.click('[data-ddsec="ifp"]');
  await page.waitForSelector('.dd-up.full input', { state: 'attached' });
  await page.setInputFiles('.dd-up input', [T + 'ifp_test_EADD.xml']);
  await page.waitForFunction(() => document.querySelector('.dd-sec.on') && document.querySelector('.dd-sec.on').getAttribute('data-ddsec') === 'ifp' && document.querySelector('.dd-up') && !document.querySelector('.dd-up.full') && document.querySelector('.dd-main').children.length, null, { timeout: 90000 });
  // the AIP data set has obstacles already (AD 2.10): the section shows them, with its own strip to add more
  await page.click('[data-ddsec="obs"]'); await page.waitForSelector('.dd-up input', { state: 'attached' });
  const obsFull = await page.$eval('.dd-up', (e) => e.classList.contains('full')), nSets = await page.evaluate(() => window.__AIXM.S.datasets.length);
  await page.setInputFiles('.dd-up input', [T + 'EA_EADD_OBS_DS_AREA_2_3_4_FULL_20191205.xml']);
  await page.waitForFunction((n) => window.__AIXM.S.datasets.length > n && document.querySelector('.dd-sec.on').getAttribute('data-ddsec') === 'obs' && /EA_EADD_OBS_DS/.test(document.querySelector('.dd-main').textContent), nSets, { timeout: 90000 });
  await page.click('[data-ddsec="ter"]'); await page.waitForSelector('.dd-up');
  const ter = await page.$eval('.dd-up', (e) => ({ full: e.classList.contains('full'), acc: e.querySelector('input').accept }));
  if (obsFull || ter.full || !/\.tif/.test(ter.acc)) fails.push('section uploads: ' + JSON.stringify({ obsFull, ter }));
  const view = await page.evaluate(() => window.__AIXM.S.view);
  if (view !== 'digital') fails.push('a section upload left Digital data: ' + view);

  if (errors.length) fails.push('page errors: ' + errors.join(' | '));
  await browser.close();
  if (fails.length) { console.error('FAIL amdb_sources:\n - ' + fails.join('\n - ')); process.exit(1); }
  console.log('PASS amdb_sources: Digital data without data, section uploads, Upload (AIP, chart, scanned chart, OpenStreetMap, orthophoto), ICAO Annex 4 check, chart against the AIP, readiness ' + ready.pct + '% (' + JSON.stringify(ready.by) + '), tracing by licence, ' + gen.n + ' features valid against AMXM 2.0.2, ODbL recorded');
})().catch((e) => { console.error('FAIL amdb_sources:', e); process.exit(1); });
