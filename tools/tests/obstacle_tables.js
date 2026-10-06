// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Electronic obstacle data sets (eTOD) delivered as tables instead of AIXM (fictitious obstacles at Donlon EADD):
// - CSV with semicolons, decimal commas, DMS coordinates in one column, heights in feet named in the heading;
// - Excel workbook with title rows above the headings, two sheets (Area 2, Area 3), latitude / longitude split into
//   degree / minute / second / hemisphere columns, a WKT polygon, a unit column, columns AIXM has no property for,
//   a row without a position and an empty row;
// - a table that is not an obstacle table is refused; a zip with a CSV inside is read.
// The rows become obstacles: AIP ENR 5.4 / AD 2.10, the map, the obstacle limitation surfaces with the Donlon
// AIP data set, the source row view and the column report on the Dashboard.
const fs = require('fs');
const path = require('path');
const env = require('./_env');
const ROOT = env.ROOT, OUT = env.out('obstacle_tables');
const URL = 'file://' + ROOT + '/AIXM-Code-Converter.html';
const XLSX = require(path.join(ROOT, 'tools', 'node_modules', 'xlsx'));
const fflate = require(path.join(ROOT, 'tools', 'node_modules', 'fflate'));

const csv = ['Obstacle ID;Name;Type;Latitude;Longitude;Elevation AMSL (ft);Height AGL (ft);Lighting;Marking;Horizontal accuracy (m);Vertical accuracy (m);Remarks',
  'EADD-T1;Mast north;ANTENNA;52°22\'40,5"N;031°56\'10,2"W;210,5;150;YES;red/white bands;0,5;0,5;new 2026',
  'EADD-T2;Crane;crane;N 52 22 05.0;W 031 57 20.0;180;120;red flashing;NO;1;1;temporary',
  'EADD-T3;Wind turbine 1;Wind turbine;522150.00N;0315500.00W;395;330;YES;YES;1;1;',
  'EADD-T4;Tree;tree;52.3700;-31.9600;105;40;NO;NO;3;3;'].join('\r\n');

function xlsxBuf() {
  const area2 = [['Republic of Donlon — electronic obstacle data set'], ['Area 2 — EADD'], [],
    ['Obstacle number', 'Obstacle name', 'Obstacle type', 'Lat deg', 'Lat min', 'Lat sec', 'N/S', 'Long deg', 'Long min', 'Long sec', 'E/W', 'Top elevation', 'Height', 'Unit', 'Owner', 'Survey method', 'Geometry'],
    ['A2-001', 'Hangar', 'Building', 52, 22, 30.5, 'N', 31, 56, 50.25, 'W', 41.2, 18, 'm', 'Donlon Airport', 'GNSS RTK', ''],
    ['A2-002', 'Terminal', 'Building', '', '', '', '', '', '', '', '', 45.0, 22, 'm', 'Donlon Airport', 'photogrammetry', 'POLYGON((-31.9480 52.3720, -31.9470 52.3720, -31.9470 52.3726, -31.9480 52.3726, -31.9480 52.3720))'],
    ['A2-003', 'Lamp post', 'Pole', '', '', '', '', '', '', '', '', 30, 12, 'm', '', '', ''],
    [],
    ['A2-004', 'Chimney', 'chimney', 52, 21, 58, 'N', 31, 58, 2, 'W', 98, 75, 'ft', 'Power Co', 'GNSS', '']];
  const area3 = [['Obstacle ID', 'Name', 'Latitude', 'Longitude', 'Elevation (m)', 'Height (m)', 'Lighted'],
    ['A3-001', 'Sign', '52.3745', '-31.9410', 26.4, 3.1, 'N']];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(area2), 'Area 2');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(area3), 'Area 3');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

(async () => {
  const fc = OUT + '/EADD_eTOD_obstacles.csv', fx = OUT + '/EADD_eTOD_obstacles_area2_3.xlsx', fn = OUT + '/runway_lengths.csv', fz = OUT + '/obstacles_in_zip.zip';
  fs.writeFileSync(fc, csv); fs.writeFileSync(fx, xlsxBuf()); fs.writeFileSync(fn, 'runway;length\n09L;3000\n');
  fs.writeFileSync(fz, Buffer.from(fflate.zipSync({ 'etod/zip_obstacles.csv': new TextEncoder().encode(csv) })));
  const browser = await env.playwright.chromium.launch({ executablePath: env.chrome });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 950 } })).newPage();
  const errors = [], fails = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL); await page.waitForSelector('#drop');
  await page.setInputFiles('#file-input', [ROOT + '/testdata/Donlon_ALL_Baseline_2025.xml', fc, fx, fn, fz]);
  await page.waitForFunction(() => !window.__AIXM.S.adding && window.__AIXM.S.files.length >= 5 && window.__AIXM.S.files.every((f) => f.status !== 'checking'), null, { timeout: 30000 });
  const files = await page.evaluate(() => window.__AIXM.S.files.map((f) => f.name + ' ' + f.status + ' ' + ((f.sniff && f.sniff.versionLabel) || f.error || '')));
  const want = { 'EADD_eTOD_obstacles.csv': 'ready Obstacles (CSV)', 'EADD_eTOD_obstacles_area2_3.xlsx': 'ready Obstacles (Excel)', 'zip_obstacles.csv': 'ready Obstacles (CSV)' };
  Object.keys(want).forEach((n) => { if (!files.some((x) => x === n + ' ' + want[n])) fails.push('file list: ' + n + ' → ' + files.join(' | ')); });
  if (!files.some((x) => /^runway_lengths\.csv invalid No obstacle table/.test(x))) fails.push('a table that is not an obstacle table: ' + files.join(' | '));
  await page.evaluate(() => document.querySelector('#extract-btn').click());
  await page.waitForFunction(() => window.__AIXM.S.view === 'dash' && window.__AIXM.S.datasets.length === 4, null, { timeout: 60000 }).catch(() => fails.push('not 4 data sets'));

  const r = await page.evaluate(() => {
    const S = window.__AIXM.S, by = (n) => S.datasets.find((d) => d.name === n);
    const c = by('EADD_eTOD_obstacles.csv'), x = by('EADD_eTOD_obstacles_area2_3.xlsx');
    const o = (ds, id) => (ds.byType.VerticalStructure || []).find((v) => v.cur.p.designator === id);
    const sum = (v, ds) => { if (!v) return null; const p = v.cur.p, part = p.part, hp = part.horizontalProjection_location || part.horizontalProjection_surface; return { name: p.name, type: p.type, lighted: p.lighted, mark: p.markingICAOStandard, pattern: part.markingPattern, light: part.lighting && (part.lighting._descr || part.lighting.colour), geo: hp._geo, elev: hp.elevation, h: part.verticalExtent, hAcc: hp.horizontalAccuracy, notes: (p.annotation || []).map((a) => a.translatedNote.note), pos: MODEL.pointOf(ds, v), label: MODEL.label(ds, v), line: v.line }; };
    return { n: [c, x].map((d) => d && d.byType.VerticalStructure.length), state: [c && c.state, x && x.state], t1: sum(o(c, 'EADD-T1'), c), t2: sum(o(c, 'EADD-T2'), c), t3: sum(o(c, 'EADD-T3'), c), a1: sum(o(x, 'A2-001'), x), a2: sum(o(x, 'A2-002'), x), a4: sum(o(x, 'A2-004'), x), a31: sum(o(x, 'A3-001'), x),
      errs: x && (x.parseErrors || []).map((e) => e.err), cols: x && x.tab.columns.length, kept: x && x.tab.kept.join('|') };
  });
  const near = (a, b, t) => Math.abs(a - b) <= t;
  if (JSON.stringify(r.n) !== '[4,4]') fails.push('obstacles read: ' + JSON.stringify(r.n));
  const t1 = r.t1 || {};
  if (!t1.pos || !near(t1.pos[1], 52 + 22 / 60 + 40.5 / 3600, 1e-7) || !near(t1.pos[0], -(31 + 56 / 60 + 10.2 / 3600), 1e-7)) fails.push('DMS with decimal comma: ' + JSON.stringify(t1.pos));
  if (!t1.elev || t1.elev.v !== '210.5' || t1.elev.u !== 'FT' || !t1.h || t1.h.u !== 'FT' || t1.type !== 'ANTENNA' || t1.lighted !== 'YES' || t1.pattern !== 'RED/WHITE BANDS') fails.push('CSV row 1: ' + JSON.stringify(t1));
  if (!t1.notes || !t1.notes.includes('new 2026') || !t1.hAcc || t1.hAcc.v !== '0.5') fails.push('remarks / accuracy: ' + JSON.stringify(t1));
  const t2 = r.t2 || {};
  if (!t2.pos || !near(t2.pos[1], 52 + 22 / 60 + 5 / 3600, 1e-7) || t2.type !== 'CRANE' || t2.light !== 'red flashing' || t2.mark !== 'NO') fails.push('CSV row 2: ' + JSON.stringify(t2));
  const t3 = r.t3 || {};
  if (!t3.pos || !near(t3.pos[1], 52 + 21 / 60 + 50 / 3600, 1e-7) || !near(t3.pos[0], -(31 + 55 / 60), 1e-7) || t3.type !== 'WINDMILL') fails.push('packed DMS, wind turbine: ' + JSON.stringify(t3));
  const a1 = r.a1 || {};
  if (!a1.pos || !near(a1.pos[1], 52 + 22 / 60 + 30.5 / 3600, 1e-7) || !near(a1.pos[0], -(31 + 56 / 60 + 50.25 / 3600), 1e-7) || a1.elev.u !== 'M' || a1.type !== 'BUILDING' || a1.line !== 5) fails.push('Excel split DMS: ' + JSON.stringify(a1));
  if (!a1.notes || !a1.notes.some((n) => n === 'Owner / operator: Donlon Airport') || !a1.notes.some((n) => n === 'Survey method: GNSS RTK')) fails.push('Excel remarks: ' + JSON.stringify(a1 && a1.notes));
  const a2 = r.a2 || {};
  if (!a2.geo || a2.geo.t !== 'A' || a2.geo.c[0].length !== 5) fails.push('WKT polygon: ' + JSON.stringify(a2.geo));
  const a4 = r.a4 || {};
  if (!a4.elev || a4.elev.u !== 'FT' || a4.type !== 'STACK') fails.push('unit column ft, chimney: ' + JSON.stringify(a4));
  if (!r.a31 || r.a31.lighted !== 'NO' || r.a31.elev.v !== '26.4') fails.push('second sheet: ' + JSON.stringify(r.a31));
  if (!r.errs || r.errs.length !== 1 || !/sheet Area 2, row 7: no position/.test(r.errs[0])) fails.push('row without a position: ' + JSON.stringify(r.errs));
  if (!/Survey method/.test(r.kept || '')) fails.push('kept columns: ' + r.kept);
  if (r.state[0] !== 'REPUBLIC OF DONLON' && !/DONLON/i.test(r.state[0] || '')) console.log('note: state of the table data set:', r.state);

  // Dashboard column report, AIP ENR 5.4, source row view, map, obstacle limitation surfaces with the AIP data set
  const card = await page.evaluate(() => [...document.querySelectorAll('.tab-card')].map((c) => c.textContent).join(' || '));
  if (!/Obstacle table/.test(card) || !/Columns read/.test(card) || !/row\(s\) without a position/.test(card)) fails.push('dashboard card: ' + card.slice(0, 300));
  await page.screenshot({ path: OUT + '/dashboard.png', fullPage: false });
  const idx = await page.evaluate(() => window.__AIXM.S.datasets.findIndex((d) => d.name === 'EADD_eTOD_obstacles_area2_3.xlsx'));
  await page.evaluate((i) => { const s = document.querySelector('#ds-select'); s.value = String(i); s.dispatchEvent(new Event('change')); window.__AIXM.go('aip'); }, idx);
  await page.waitForTimeout(500);
  const tree = await page.evaluate(() => document.querySelector('.side') ? document.querySelector('.side').textContent : '');
  if (!/ENR 5\.4/.test(tree)) fails.push('AIP has no ENR 5.4: ' + tree.slice(0, 200));
  const src = await page.evaluate(async () => { const S = window.__AIXM.S, ds = S.datasets[S.active], v = ds.byType.VerticalStructure.find((x) => x.cur.p.designator === 'A2-001'); await window.__AIXM.openXml(ds, v); await new Promise((r) => setTimeout(r, 300)); return document.querySelector('.drawer-body') ? document.querySelector('.drawer-body').textContent : ''; });
  if (!/Obstacle number: A2-001/.test(src) || !/Survey method: GNSS RTK/.test(src)) fails.push('source row view: ' + src.slice(0, 200));
  await page.evaluate(() => { const b = document.querySelector('#dx-close'); if (b) b.click(); window.__AIXM.go('map'); });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { const b = document.querySelector('[data-dsa]'); if (b) b.click(); });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: OUT + '/map.png' });
  const ols = await page.evaluate(() => {
    const S = window.__AIXM.S, don = S.datasets.find((d) => /Donlon/.test(d.name)), ad = don.byType.AirportHeliport.find((a) => a.cur.p.locationIndicatorICAO === 'EADD');
    const sets = S.datasets.filter((d) => d.family === 'tab');
    const res = OLS.check ? OLS.check(don, ad, sets) : null;
    return res ? { n: (res.list || res).length } : 'no OLS.check';
  });
  console.log('obstacle limitation surfaces with the table obstacles:', JSON.stringify(ols));

  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
  console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : 'eTOD obstacle tables (CSV, Excel, zip) OK');
  if (errors.length || fails.length) process.exitCode = 1;
  await browser.close();
})();
