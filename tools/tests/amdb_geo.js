// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// The State's charts placed on the map, and fit for use (a chart drawn here, at a known scale and rotation):
// - a parking / docking chart of EADD (a PDF made here: stands drawn with their numbers beside them, the stand table,
//   taxiway names beside the taxiways, a hot spot) is placed automatically by its words: the scale, the rotation
//   and the place on the map within a few metres; a point given by hand is added;
// - placed, it is imagery to trace on (drawn multiplied over the map): what is traced on it gives its accuracy;
// - Generate names the OpenStreetMap taxiway lines that have no name from the chart's labels, makes the hot spot,
//   and gives the published stands their resolution; the AMXM is valid;
// - Fit for use: each type against PANS-AIM (and a requirement typed in), by source; measured against a reference
//   data set (a "survey" made here): the stands of the chart within 0.5 m, the taxiway lines about 3 m off.
/* global AMDBX, AMDBDOC, AMDBGEO, AMDBTRACE, AMDBPKG, LAZY */
const env = require('./_env');
const fs = require('fs');
const path = require('path');
const ROOT = env.ROOT, OUT = env.out('amdb_geo'), T = ROOT + '/testdata/';
const URL = 'file://' + ROOT + '/AIXM-Code-Converter.html';
const { jsPDF } = require(path.join(ROOT, 'tools/node_modules/jspdf'));
const { validateAmxm } = require('./_xsd');
function dms(v, lat) { const h = lat ? (v < 0 ? 'S' : 'N') : (v < 0 ? 'W' : 'E'); v = Math.abs(v); const d = Math.floor(v), m = Math.floor((v - d) * 60), s = ((v - d) * 60 - m) * 60; return String(d).padStart(lat ? 2 : 3, '0') + String(m).padStart(2, '0') + s.toFixed(2).padStart(5, '0') + h; }
// a local plane about o (metres east, north), as the tool's own (WGS 84)
function plane(o) {
  const D2R = Math.PI / 180, A = 6378137, E2 = 0.00669437999014, s = Math.sin(o[1] * D2R), w = Math.sqrt(1 - E2 * s * s), N = A / w, M = A * (1 - E2) / (w * w * w);
  return { fwd: (c) => [(c[0] - o[0]) * D2R * N * Math.cos(c[1] * D2R), (c[1] - o[1]) * D2R * M], inv: (x) => { const lat = o[1] + x[1] / M / D2R; return [o[0] + x[0] / (N * Math.cos(lat * D2R)) / D2R, lat]; } };
}

(async () => {
  const browser = await env.playwright.chromium.launch({ executablePath: env.chrome });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true });
  await ctx.route(/^https?:\/\//, (r) => r.abort());
  const page = await ctx.newPage();
  const errors = [], fails = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const status = () => page.evaluate(() => (document.querySelector('.up-st') || {}).textContent || '');
  async function drop(files) {
    const before = await status();
    await page.setInputFiles('[data-upin]', files);
    await page.waitForFunction((b) => { const s = (document.querySelector('.up-st') || {}).textContent || ''; return s && s !== b && !document.querySelector('.up-st .spinner'); }, before, { timeout: 90000 });
  }
  await page.goto(URL); await page.waitForSelector('#drop');
  const idle = await page.evaluate(() => [typeof window.AMDBGEO, typeof window.AMDBQ, document.getElementById('src-amdbgeo').type, document.getElementById('src-amdbq').type]);
  if (idle.join() !== 'undefined,undefined,text/plain,text/plain') fails.push('the new modules ran before they were needed: ' + idle);
  await page.evaluate(() => window.__AIXM.go('digital')); await page.waitForSelector('.up-drop', { timeout: 30000 });
  await drop([T + 'EA_AIP_DS_FULL_20170701.xml']);
  const ad = await page.evaluate(() => { const c = AMDBX.candidates(window.__AIXM.S.datasets).filter((x) => x.code === 'EADD')[0]; return { arp: c.arp, thr: c.rwys[0].dirs[0].pts.filter((q) => /^THR$/.test(q.role) && q.c)[0].c }; });
  // 16 stands in two rows over about 700 m, as on a parking / docking chart
  const A0 = ad.arp, NS = 16, stand = (i) => [A0[0] + 0.0005 + ((i - 1) % 8) * 0.001, A0[1] - 0.0015 - Math.floor((i - 1) / 8) * 0.0015];

  /* ------------------------------------- the chart: 1 : 4 000, turned 6 degrees */
  const PT = 0.0254 / 72, s = 4000 * PT, th = 6 * Math.PI / 180, W = 842, H = 595, Pl = plane(A0);
  const centre = Pl.fwd([A0[0] + 0.004, A0[1] - 0.0026]);
  const Tf = { a: s * Math.cos(th), b: s * Math.sin(th) };
  Tf.tx = centre[0] - (Tf.a * W / 2 - Tf.b * (-H / 2)); Tf.ty = centre[1] - (Tf.b * W / 2 + Tf.a * (-H / 2));
  // where a position is drawn on the page (points from the left, from the top)
  const onPage = (c) => { const q = Pl.fwd(c), s2 = Tf.a * Tf.a + Tf.b * Tf.b, e = q[0] - Tf.tx, n = q[1] - Tf.ty; const x = (Tf.a * e + Tf.b * n) / s2, y = (-Tf.b * e + Tf.a * n) / s2; return [x, -y]; };
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });
  doc.setFontSize(7);
  let y = 20; const line = (t) => { doc.text(t, 20, y); y += 9; };
  line('AIRCRAFT PARKING/DOCKING CHART - ICAO'); line('DONLON / DONLON INTL (EADD)'); line('TWY A, B1 and B2: 23 M wide');
  line('STAND COORDINATES'); line('STAND LATITUDE LONGITUDE');
  for (let i = 1; i <= NS; i++) { const p = stand(i); line(String(i) + '  ' + dms(p[1], true) + '  ' + dms(p[0], false)); }
  // the drawing: each stand a small circle, its number just above it (the first row) or below it (the second)
  const sym = {};
  doc.setFontSize(8);
  for (let i = 1; i <= NS; i++) { const q = onPage(stand(i)); sym[i] = q; doc.circle(q[0], q[1], 1.5); const w = doc.getTextWidth(String(i)); doc.text(String(i), q[0] - w / 2, q[1] + (i <= 8 ? -4 : 9)); }
  // taxiways B1 and B2 (OpenStreetMap has them without a name), A (named): their names beside them
  const yA = A0[1] - 0.0005, B1 = [[A0[0] - 0.006, yA], [A0[0] - 0.006, ad.thr[1] - 0.0001]], B2 = [[A0[0] + 0.008, yA], [A0[0] + 0.008, A0[1] - 0.0045]];
  const lab = (t, c, dx) => { const q = onPage(c); doc.setFontSize(9); doc.text(t, q[0] + dx, q[1] + 3); return q; };
  const inPage = (q) => q[0] > 0 && q[0] < W && q[1] > 0 && q[1] < H;
  const labB2 = lab('B2', [A0[0] + 0.008, A0[1] - 0.0037], 4), labA = lab('A', [A0[0] + 0.0055, yA], 0), labHS = lab('HS1', [A0[0] + 0.0078, A0[1] - 0.0041], 6);
  if (![labB2, labA, labHS].every(inPage)) fails.push('test chart: a label is off the page ' + JSON.stringify([labB2, labA, labHS]));
  fs.writeFileSync(OUT + '/EADD_parking_chart_drawn.pdf', Buffer.from(doc.output('arraybuffer')));

  /* --------------------------- OpenStreetMap: the taxiways, B1 and B2 without a name */
  const P = (lon, lat) => ({ lat, lon }), osm = { version: 0.6, generator: 'test', elements: [] };
  let id = 1;
  const way = (tags, pts) => osm.elements.push({ type: 'way', id: id++, tags, geometry: pts.map((q) => P(q[0], q[1])) });
  way({ aeroway: 'aerodrome', icao: 'EADD' }, [[A0[0] - 0.04, A0[1] - 0.02], [A0[0] + 0.04, A0[1] - 0.02], [A0[0] + 0.04, A0[1] + 0.02], [A0[0] - 0.04, A0[1] + 0.02], [A0[0] - 0.04, A0[1] - 0.02]]);
  way({ aeroway: 'taxiway', ref: 'A' }, [[A0[0] - 0.012, yA], [A0[0] - 0.006, yA], [A0[0], yA], [A0[0] + 0.008, yA], [A0[0] + 0.012, yA]]);
  way({ aeroway: 'taxiway' }, B1); way({ aeroway: 'taxiway' }, B2.slice(0, 1).concat([[A0[0] + 0.008, A0[1] - 0.0030]]));
  way({ aeroway: 'taxiway' }, [[A0[0] + 0.008, A0[1] - 0.0030], B2[1]]); // B2 goes on beyond a node where nothing else meets
  fs.writeFileSync(OUT + '/EADD_osm.json', JSON.stringify(osm));
  await drop([OUT + '/EADD_parking_chart_drawn.pdf', OUT + '/EADD_osm.json']);
  const d0 = await page.evaluate(() => AMDBDOC.list().map((d) => ({ id: d.id, kind: d.f && d.f.kind.id, ad: d.ad, labels: (d.labels || []).length, bytes: !!d.bytes, pt: d.pagePt })));
  const docId = (d0.filter((d) => d.kind === 'apdc')[0] || {}).id;
  if (!docId || d0[0].ad !== 'EADD' || d0[0].labels < 40 || !d0[0].bytes) fails.push('the chart read with its words: ' + JSON.stringify(d0));

  /* -------------------------------------------- placed automatically, in Trace */
  await page.click('[data-amtab="trace"]'); await page.waitForSelector('.tr-map.leaflet-container', { timeout: 30000 });
  await page.waitForSelector('.tr-charts [data-geoauto]');
  await page.click('[data-geoauto="' + docId + '"]');
  await page.waitForSelector('[data-geoshow="' + docId + '"]', { timeout: 60000 });
  const fit = await page.evaluate(([id, sym]) => {
    const F = AMDBGEO.get(id), d = AMDBDOC.get(id), W = d.pagePt[F.p][0], H = d.pagePt[F.p][1];
    // where the placed chart puts each stand symbol, against the stand itself
    const off = Object.keys(sym).map((i) => { const c = AMDBGEO.toMap(d, sym[i][0] / W, sym[i][1] / H), k = AMDBDOC.list()[0]; return [i, c, k ? 1 : 0]; });
    return { n: F.F.n, rms: F.F.rms, max: F.F.max, scale: F.F.scale, rot: F.F.rot, kinds: F.F.inl.map((p) => p.kind).filter((x, i, a) => a.indexOf(x) === i), off: off, row: document.querySelector('tr[data-geodoc="' + id + '"]').textContent };
  }, [docId, sym]);
  const offs = fit.off.map((o) => { const q = Pl.fwd(o[1]), t = Pl.fwd(stand(+o[0])); return Math.hypot(q[0] - t[0], q[1] - t[1]); });
  const worst = Math.max(...offs);
  if (fit.n < 14 || fit.rms > 10 || Math.abs(fit.scale - 4000) > 200 || Math.abs(fit.rot - 6) > 2 || worst > 8) fails.push('placed automatically: ' + JSON.stringify(Object.assign({}, fit, { off: undefined, worst })));
  if (!/1 : 4,000|1 : 3,9|1 : 4,1/.test(fit.row) || !/turned/.test(fit.row)) fails.push('the chart row: ' + fit.row);

  /* ----------------------------------------------------------- trace on the chart */
  await page.click('[data-geoshow="' + docId + '"]');
  await page.waitForSelector('.tr-map img.tr-ortho', { state: 'attached', timeout: 30000 });
  const ov = await page.evaluate(() => { const i = document.querySelector('.tr-map img.tr-ortho'); return { blend: i.style.mixBlendMode, tr: i.style.transform, img: document.querySelector('[data-trimg]').value, lic: document.querySelector('.tr-lic').textContent, cop: !!document.querySelector('[data-trcop]'), pts: document.querySelectorAll('.tr-map .leaflet-interactive').length }; });
  if (ov.blend !== 'multiply' || !/^matrix/.test(ov.tr) || ov.img !== 'chart-' + docId || !/Tracing allowed/.test(ov.lic) || !ov.cop || ov.pts < 14) fails.push('the chart as imagery: ' + JSON.stringify(ov));
  await page.$eval('.tr-map', (e) => e.scrollIntoView({ block: 'center' }));
  const box = await page.$eval('.tr-map', (e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.click('[data-trtool="std"]'); await page.fill('[data-trname]', 'C1');
  await page.mouse.click(box.x + 7, box.y + 5);
  const tr = await page.evaluate(() => AMDBTRACE.features('EADD').map((f) => f.src));
  if (tr.length !== 1 || !/position as drawn on the State's chart, est\. accuracy ~\d+ m \(the chart's fit\)/.test(tr[0])) fails.push('traced on the chart: ' + JSON.stringify(tr));
  await page.click('[data-trtool="std"]');
  await page.screenshot({ path: OUT + '/trace_on_chart.png' });

  /* ------------------------------------------------------------ a point by hand */
  await page.click('[data-geohand="' + docId + '"]');
  await page.waitForSelector('[data-geoimg]', { timeout: 30000 });
  await page.$eval('[data-geoimg]', (e) => e.scrollIntoView({ block: 'center' }));
  const at5 = await page.$eval('[data-geoimg]', (e, q) => { const r = e.getBoundingClientRect(); return { x: r.x + q[0] / 842 * r.width, y: r.y + q[1] / 595 * r.height }; }, sym[5]);
  await page.mouse.click(at5.x, at5.y);
  await page.waitForSelector('[data-geoknown]');
  const opt5 = await page.$$eval('[data-geoknown] option', (os) => (os.filter((o) => o.textContent === 'stand 5')[0] || {}).value);
  await page.selectOption('[data-geoknown]', opt5);
  await page.waitForFunction((id) => { const F = AMDBGEO.get(id); return F && F.hand.length === 1 && F.F && !document.querySelector('.geo-st .spinner'); }, docId, { timeout: 30000 });
  const hand = await page.evaluate((id) => { const F = AMDBGEO.get(id); return { n: F.F.n, hand: F.F.hand.map((p) => p.name + ' ' + p.res), rows: document.querySelectorAll('.geo-pts tbody tr').length, kept: JSON.parse(localStorage.getItem('aixm-amdb-chartfit') || '{}') }; }, docId);
  if (hand.hand.length !== 1 || !/^stand 5 \(by hand\) [0-9.]+$/.test(hand.hand[0]) || parseFloat(hand.hand[0].split(' ').pop()) > 5 || hand.rows < 10 || !Object.keys(hand.kept).length) fails.push('a point by hand: ' + JSON.stringify(hand));
  await page.screenshot({ path: OUT + '/chart_by_hand.png' });

  /* -------------------------------------------- Generate: taxiway names, hot spot */
  const gen = await page.evaluate(async () => {
    const c = AMDBX.candidates(window.__AIXM.S.datasets).filter((x) => x.code === 'EADD'), g = AMDBX.generate(c, {});
    await LAZY.run('src-amdbpkg');
    const tgl = g.features.filter((f) => f.t === 'TaxiwayGuidanceLine' && /OpenStreetMap/.test(f.a.source.v));
    return { names: tgl.map((f) => (f.a.idlin ? f.a.idlin.v : '-') + (/from the State's chart/.test(f.a.source.v) ? '*' : '')).sort(), hs: g.features.filter((f) => f.t === 'Hotspot').map((f) => f.a.idhot.v + ' ' + f.g[0].c[0].length),
      hres: g.features.filter((f) => f.t === 'ParkingStandLocation' && f.a.hres).map((f) => f.a.hres.v).filter((x, i, a) => a.indexOf(x) === i), notes: g.notes.filter((n) => /taxiway names from/.test(n)), xml: AMDBPKG.writeAmxm(g.features, 'test') };
  });
  if (gen.names.join() !== '-,A,B2*,B2*') fails.push('taxiway names from the chart: ' + JSON.stringify(gen.names));
  if (gen.hs.join() !== 'HS1 25' || gen.hres.join() !== '0.0000027778' || !gen.notes.length) fails.push('hot spot, resolution, note: ' + JSON.stringify(Object.assign({}, gen, { xml: undefined })));
  const v = await validateAmxm(gen.xml);
  if (!v.valid) fails.push('generated AMXM not valid: ' + v.errors.slice(0, 3).join(' | '));
  fs.writeFileSync(OUT + '/EADD_generated.xml', gen.xml);

  /* ------------------------------------------- a reference ("survey") made here */
  const shiftN = (c, m) => [c[0], c[1] + m / 111320];
  const ref = { type: 'FeatureCollection', features: [] };
  for (let i = 1; i <= NS; i++) ref.features.push({ type: 'Feature', properties: { amxm_type: 'ParkingStandLocation', idarpt: 'EADD', idstd: String(i), source: 'survey (test)' }, geometry: { type: 'Point', coordinates: shiftN(stand(i), 0.2) } });
  // the taxiway lines of the survey 3 m east and 3 m north of OpenStreetMap's: 3 m off across each of them
  const shift3 = (c) => [c[0] + 3 / (111320 * Math.cos(c[1] * Math.PI / 180)), c[1] + 3 / 111320];
  [[[A0[0] - 0.012, yA], [A0[0] + 0.012, yA]], B1, B2].forEach((l, k) => ref.features.push({ type: 'Feature', properties: { amxm_type: 'TaxiwayGuidanceLine', idarpt: 'EADD', idlin: ['A', 'B1', 'B2'][k], source: 'survey (test)' }, geometry: { type: 'LineString', coordinates: l.map(shift3) } }));
  ref.features.push({ type: 'Feature', properties: { amxm_type: 'TaxiwayGuidanceLine', idarpt: 'EADD', idlin: 'Z', source: 'survey (test)' }, geometry: { type: 'LineString', coordinates: [[A0[0] - 0.02, A0[1] + 0.01], [A0[0] - 0.019, A0[1] + 0.01]] } });
  fs.writeFileSync(OUT + '/EADD_survey_reference.geojson', JSON.stringify(ref));
  await page.evaluate(async (xml) => { await window.__AIXM.addFiles([new File([xml], 'EADD_generated.xml', { type: 'text/xml' })]); await window.__AIXM.extractAll(); }, gen.xml);
  await page.evaluate(() => window.__AIXM.go('digital'));
  await page.evaluate(async (t) => { await window.__AIXM.addFiles([new File([t], 'EADD_survey_reference.geojson', { type: 'application/geo+json' })]); await window.__AIXM.extractAll(); }, JSON.stringify(ref));
  await page.evaluate(() => window.__AIXM.go('digital'));
  await page.waitForSelector('[data-amtab="fit"]');
  await page.click('[data-amtab="fit"]'); await page.waitForSelector('.fit-tbl', { timeout: 30000 });
  await page.selectOption('[data-q="ds"]', await page.$$eval('[data-q="ds"] option', (os) => os.filter((o) => /EADD_generated/.test(o.textContent))[0].value));
  await page.waitForSelector('.fit-tbl');
  const rowOf = (t) => page.evaluate((t) => { const r = Array.from(document.querySelectorAll('.fit-tbl:not(.fit-meas) tbody tr')).filter((x) => x.children[0].textContent === t)[0]; return r ? Array.from(r.children).map((c) => c.querySelector('input') ? c.querySelector('input').value : c.textContent) : null; }, t);
  const fThr = await rowOf('RunwayThreshold'), fStd = await rowOf('ParkingStandLocation'), fTgl = await rowOf('TaxiwayGuidanceLine'), kpi = await page.$eval('.fit-card .kpis', (e) => e.textContent);
  // thresholds of the AIP: the State's (as surveyed); stands: the chart's (State) and the one traced (estimated, not met at 0.5 m); OSM lines: unknown
  if (!fThr || fThr[1] !== 'critical' || fThr[2] !== '1' || +fThr[7] < 2) fails.push('fit: thresholds ' + JSON.stringify(fThr));
  if (!fStd || fStd[2] !== '0.5' || +fStd[7] !== NS || +fStd[9] !== 1 || !/C 16/.test(fStd[4]) || !/T 1/.test(fStd[4])) fails.push('fit: stands ' + JSON.stringify(fStd));
  if (!fTgl || +fTgl[8] < 4) fails.push('fit: taxiway lines ' + JSON.stringify(fTgl));
  if (!/meets/.test(kpi) || !/not met/.test(kpi)) fails.push('fit: summary ' + kpi);
  // a requirement typed in: stands to 30 m — the traced stand meets it
  await page.fill('[data-qreq="ParkingStandLocation"]', '30'); await page.press('[data-qreq="ParkingStandLocation"]', 'Tab');
  await page.waitForFunction(() => { const r = Array.from(document.querySelectorAll('.fit-tbl:not(.fit-meas) tbody tr')).filter((x) => x.children[0].textContent === 'ParkingStandLocation')[0]; return r && r.children[6].textContent === '1'; }, null, { timeout: 10000 }).catch(() => fails.push('a requirement typed in is not used'));
  await page.fill('[data-qreq="ParkingStandLocation"]', ''); await page.press('[data-qreq="ParkingStandLocation"]', 'Tab');
  // measured against the reference
  await page.selectOption('[data-q="ref"]', await page.$$eval('[data-q="ref"] option', (os) => os.filter((o) => /survey_reference/.test(o.textContent))[0].value));
  await page.click('[data-qgo]'); await page.waitForSelector('.fit-meas', { timeout: 30000 });
  const meas = await page.$$eval('.fit-meas tbody tr', (rs) => rs.map((r) => Array.from(r.children).map((c) => c.textContent)));
  const mStd = meas.filter((r) => r[0] === 'ParkingStandLocation' && r[1] === 'C')[0], mTgl = meas.filter((r) => r[0] === 'TaxiwayGuidanceLine' && r[1] === 'O')[0];
  if (!mStd || +mStd[2] !== NS || Math.abs(+mStd[3] - 0.2) > 0.05 || mStd[8] !== '100 %') fails.push('measured: stands of the chart ' + JSON.stringify(mStd));
  if (!mTgl || Math.abs(+mTgl[3] - 3) > 0.6 || +mTgl[10] !== 1) fails.push('measured: taxiway lines ' + JSON.stringify(mTgl) + ' ' + JSON.stringify(meas.filter((r) => r[0] === 'TaxiwayGuidanceLine')));
  const mapOk = await page.$$eval('.fit-map canvas, .fit-map .leaflet-interactive', (l) => l.length);
  if (!mapOk) fails.push('measured: no map of the distances');
  const [rep] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('[data-qrep="pdf"]')]);
  if (!/\.pdf$/.test(rep.suggestedFilename())) fails.push('fit report: ' + rep.suggestedFilename());
  await page.screenshot({ path: OUT + '/fit_for_use.png', fullPage: true });

  if (errors.length) fails.push('page errors: ' + errors.join(' | '));
  await browser.close();
  if (fails.length) { console.error('FAIL amdb_geo:\n - ' + fails.join('\n - ')); process.exit(1); }
  console.log('PASS amdb_geo: chart placed by ' + fit.n + ' points (±' + fit.rms + ' m, 1:' + fit.scale + ', turned ' + fit.rot + '°, stands within ' + worst.toFixed(1) + ' m), a point by hand, traced on it, taxiway names ' + gen.names.join(' ') + ', hot spot, AMXM valid; fit for use and measured against a reference (stands ' + mStd[3] + ' m, taxiway lines ' + mTgl[3] + ' m)');
})().catch((e) => { console.error('FAIL amdb_geo:', e); process.exit(1); });
