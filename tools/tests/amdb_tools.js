// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// More aerodrome mapping tools, Digital data -> Aerodrome mapping (AMDB):
// - nothing of them runs when the page opens (stored, not run);
// - Generate from AIP: the AIP aerodromes without mapping data get runway elements, thresholds and the reference
//   point (EADD of the EA AIP data set), after the NOT FOR NAVIGATION acknowledgement; the file opens, is valid
//   against the AMXM 2.0.2 schema and says in every feature that it is generated, coarse quality;
// - Import: the GeoJSON, CSV (WKT) and DXF files of a package read back as AMXM with the same features;
// - everything the AIP gives (Donlon EADD): markings, lights, taxiways, aprons, guidance lines, holding positions, stands,
//   navaids, obstacles — valid against the schema; search / select all / options; the aerodrome chart, base maps, 3D, guide;
// - Compare: a changed copy of the EAXM aerodrome shows the feature removed, moved and changed; reports and the
//   AMXM change file (valid against the schema).
/* global LAZY, AMDB, AMDBX, AMDBPKG, MODEL */
const env = require('./_env');
const fs = require('fs');
const path = require('path');
const ROOT = env.ROOT, OUT = env.out('amdb_tools'), T = ROOT + '/testdata/';
const URL = 'file://' + ROOT + '/AIXM-Code-Converter.html';
const fflate = require(path.join(ROOT, 'tools/node_modules/fflate'));
const { validateAmxm } = require('./_xsd');

(async () => {
  const browser = await env.playwright.chromium.launch({ executablePath: env.chrome });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [], fails = [];
  page.on('pageerror', (e) => errors.push(e.message));
  async function load(files) {
    await page.goto(URL); await page.waitForSelector('#drop'); await page.evaluate(() => localStorage.setItem('aixm-amdb-mode', 'all')); // every tool as a tab (the steps: amdb_flow.js)
    await page.setInputFiles('#file-input', files);
    await page.waitForFunction((n) => !window.__AIXM.S.adding && window.__AIXM.S.files.length >= n && window.__AIXM.S.files.every((f) => f.status !== 'checking'), files.length, { timeout: 30000 });
    await page.evaluate(() => document.querySelector('#extract-btn').click());
    await page.waitForFunction(() => window.__AIXM.S.view === 'dash' && window.__AIXM.S.files.every((f) => f.status !== 'parsing' && f.status !== 'indexing'), null, { timeout: 60000 });
  }
  async function download(sel) {
    const [d] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click(sel)]);
    const p = OUT + '/' + d.suggestedFilename(); await d.saveAs(p);
    return p;
  }
  async function openTab(tab, sel) {
    await page.evaluate(() => window.__AIXM.go('digital'));
    await page.click('[data-ddsec="amxm"]');
    await page.click('[data-amtab="' + tab + '"]');
    await page.waitForSelector(sel, { timeout: 30000 });
  }
  // the aerodrome mapping features of each AMXM data set, as the AMDB tools see them
  const amxmFeatures = () => page.evaluate(async () => { await LAZY.run('src-amdb'); return window.__AIXM.S.datasets.filter((d) => d.family === 'amxm').map((d) => { const f = AMDB.collect([d], MODEL).features; return { name: d.name, n: f.length, types: Array.from(new Set(f.map((x) => x.t))).sort(), gen: f.every((x) => /^(Generated from AIP data .*(coarse quality|Annex 14)|Inferred from AIP data .*indicative|From .*as published)/.test(x.a.source && x.a.source.v)) }; }); });

  /* ---------------------------------------------------------- generate from AIP */
  await load([T + 'EA_AIP_DS_FULL_20170701.xml']);
  const idle = await page.evaluate(() => ({ x: typeof window.AMDBX, block: (document.getElementById('src-amdbx') || {}).type }));
  if (idle.x !== 'undefined' || idle.block !== 'text/plain') fails.push('AMDBX ran before it was needed: ' + JSON.stringify(idle));
  // an AIP data set with runways but no mapping data: the section is on and opens on Generate from AIP
  const card = await page.evaluate(() => { window.__AIXM.go('digital'); const b = document.querySelector('[data-ddsec="amxm"]'); return { dis: b.disabled, txt: b.textContent }; });
  if (card.dis || !/generate from AIP/.test(card.txt)) fails.push('AMDB section for an AIP data set without mapping data: ' + JSON.stringify(card));
  await page.click('[data-ddsec="amxm"]');
  await page.waitForSelector('[data-gengo]', { timeout: 30000 });
  const tab = await page.$eval('.am-tabs .active', (b) => b.getAttribute('data-amtab'));
  if (tab !== 'generate') fails.push('default tab without mapping data: ' + tab);
  await openTab('generate', '[data-gengo]');
  const cand = await page.evaluate(() => AMDBX.candidates(window.__AIXM.S.datasets).map((c) => ({ code: c.code, rwys: c.rwys.length, thr: c.thr })));
  const eadd = cand.find((c) => c.code === 'EADD');
  if (!eadd || eadd.rwys < 2 || eadd.thr < 2) fails.push('EADD candidate: ' + JSON.stringify(eadd));
  if (!(await page.$eval('[data-gengo]', (b) => b.disabled))) fails.push('generate possible without the acknowledgement');
  // generated AMXM is valid against the schema
  const genXml = await page.evaluate(async () => { const c = AMDBX.candidates(window.__AIXM.S.datasets).filter((x) => x.code === 'EADD'); const r = AMDBX.generate(c); return { xml: AMDBPKG.writeAmxm(r.features, 'test'), n: r.features.length, types: Array.from(new Set(r.features.map((f) => f.t))).sort(), notes: r.notes }; });
  const vg = await validateAmxm(genXml.xml);
  if (!vg.valid) fails.push('generated AMXM not valid against the AMXM 2.0.2 schema: ' + vg.errors.slice(0, 3).join(' | '));
  if (!['AerodromeReferencePoint', 'RunwayElement', 'RunwayThreshold'].every((t) => genXml.types.includes(t))) fails.push('generated types: ' + genXml.types.join(', ') + ' / ' + genXml.notes.join('; '));
  // through the UI: only EADD, acknowledge, generate and open
  await page.evaluate(() => document.querySelectorAll('[data-gen]').forEach((b) => { if (b.checked) b.click(); }));
  const idx = cand.findIndex((c) => c.code === 'EADD');
  await page.check('[data-gen="' + idx + '"]');
  await page.check('[data-genack]');
  await page.click('[data-gengo]');
  await page.waitForFunction(() => window.__AIXM.S.datasets.some((d) => d.family === 'amxm' && /generated_from_AIP/.test(d.name)), null, { timeout: 60000 });
  await page.waitForTimeout(500);
  const gen = (await amxmFeatures()).find((d) => /generated_from_AIP/.test(d.name));
  if (!gen || gen.n !== genXml.n) fails.push('generated data set opened: ' + JSON.stringify(gen) + ' vs ' + genXml.n);
  if (gen && !gen.gen) fails.push('a generated feature does not say it is generated');
  // sources view: the generated set is "derived", coarse
  await openTab('sources', '.card');
  await page.waitForTimeout(400);
  const sv = await page.evaluate(() => Array.from(document.querySelectorAll('select[data-k="method"],select[data-k="q"]')).map((s) => s.value).join('|'));
  if (!/Derived from AIP \/ AIXM data/.test(sv) || !/coarse/.test(sv)) fails.push('sources defaults of the generated set: ' + sv);
  await page.screenshot({ path: OUT + '/generate.png' });

  /* ------------------------------------- everything the AIP gives (Donlon EADD) */
  await load([T + 'Donlon_ALL_Baseline_2025.xml']);
  await openTab('generate', '[data-gengo]');
  // search, deselect all, select shown
  await page.click('[data-gensel="none"]');
  if (await page.$$eval('[data-gen]', (c) => c.some((x) => x.checked))) fails.push('Deselect all left a choice');
  await page.fill('[data-genq]', 'eadd');
  const shownRows = await page.$$eval('[data-genrow]', (r) => r.filter((x) => !x.hidden).map((x) => x.textContent));
  if (!shownRows.length || shownRows.some((x) => !/EADD/.test(x))) fails.push('search: ' + shownRows.join(' | '));
  await page.click('[data-gensel="shown"]');
  const picked = await page.$$eval('[data-gen]', (c) => c.filter((x) => x.checked).length);
  if (picked !== shownRows.length) fails.push('select shown: ' + picked);
  await page.click('[data-gensel="all"]');
  if (await page.$$eval('[data-gen]', (c) => c.some((x) => !x.checked && !x.disabled))) fails.push('Select all');
  // data readiness: what the AIP gives, item by item, and the report
  const rd = await page.evaluate(() => ({ rows: document.querySelectorAll('.ready-tbl tbody tr').length, ok: document.querySelectorAll('.ready-tbl td[data-st="ok"]').length, miss: document.querySelectorAll('.ready-tbl td[data-st="missing"]').length, pct: (document.querySelector('[data-genrow] td:nth-last-child(2)') || {}).textContent }));
  if (rd.rows < 16 || !rd.ok || !rd.miss || !/%/.test(rd.pct || '')) fails.push('data readiness: ' + JSON.stringify(rd));
  const [rdl] = await Promise.all([page.waitForEvent('download'), page.click('[data-genrep="csv"]')]);
  const rcsv = fs.readFileSync(await rdl.path(), 'utf8');
  if (!/EADD/.test(rcsv) || !/Threshold positions/.test(rcsv) || !/NOT FOR NAVIGATION/.test(rcsv)) fails.push('readiness CSV');
  const full = await page.evaluate(() => { const c = AMDBX.candidates(window.__AIXM.S.datasets).filter((x) => x.code === 'EADD'); const g = AMDBX.generate(c); const n = {}; g.features.forEach((f) => { n[f.t] = (n[f.t] || 0) + 1; }); return { n, xml: AMDBPKG.writeAmxm(g.features, 'test') }; });
  const want = ['AerodromeReferencePoint', 'RunwayElement', 'RunwayThreshold', 'RunwayCenterlinePoint', 'RunwayMarking', 'PaintedCenterline', 'Stopway', 'AerodromeSurfaceLighting', 'TaxiwayElement', 'ApronElement', 'TaxiwayGuidanceLine', 'StandGuidanceLine', 'TaxiwayHoldingPosition', 'ParkingStandLocation', 'VerticalPointStructure'];
  const lack = want.filter((k) => !full.n[k]);
  if (lack.length) fails.push('Donlon EADD generation lacks: ' + lack.join(', ') + ' — ' + JSON.stringify(full.n));
  const vf = await validateAmxm(full.xml);
  if (!vf.valid) fails.push('full generation not valid against the AMXM schema: ' + vf.errors.slice(0, 3).join(' | '));
  // options: no lights, no markings
  const lean = await page.evaluate(() => { const c = AMDBX.candidates(window.__AIXM.S.datasets).filter((x) => x.code === 'EADD'); return AMDBX.generate(c, { lights: false, markings: false }).features.filter((f) => f.t === 'AerodromeSurfaceLighting' || f.t === 'RunwayMarking').length; });
  if (lean) fails.push('options: lights / markings generated although switched off');
  // generate EADD through the UI: the chart, its labels, the base maps, 3D
  await page.click('[data-gensel="none"]'); await page.click('[data-gensel="shown"]');
  await page.check('[data-genack]'); await page.click('[data-gengo]');
  await page.waitForSelector('.am-map', { timeout: 60000 }); await page.waitForTimeout(800);
  const ch = await page.evaluate(() => { const el = document.querySelector('.am-map'); return { mode: (document.querySelector('[data-amcol].active') || {}).textContent, labels: el.querySelectorAll('.ddm-lbl.ddm-rwy').length, bases: Array.from(el.querySelectorAll('.ddm-ctl option')).map((o) => o.value) }; });
  if (!/Aerodrome chart/.test(ch.mode || '') || ch.labels < 2) fails.push('aerodrome chart: ' + JSON.stringify(ch).slice(0, 200));
  if (!ch.bases.includes('offline') || !ch.bases.includes('osmhot') || !ch.bases.includes('esri') || ch.bases.length < 8) fails.push('base maps of the AMDB map: ' + ch.bases.join(','));
  await page.screenshot({ path: OUT + '/chart.png' });
  await page.selectOption('[data-ddf="ad"]', 'EADD'); await page.waitForTimeout(500);
  await page.click('[data-am3d]');
  await page.waitForSelector('.v3d', { timeout: 20000 }).catch(() => fails.push('3D view of the aerodrome did not open'));
  await page.waitForTimeout(4000);
  const v3 = await page.evaluate(() => { const st = window.VIEW3D.state(); if (!st || !st.world) return null; let n = 0; st.world.traverse((o) => { if (o.userData && o.userData.amdb) n++; }); return { n, air: document.querySelector('[data-l="airspace"]').checked }; });
  if (!v3 || v3.n < 50 || v3.air) fails.push('3D aerodrome mapping: ' + JSON.stringify(v3));
  await page.screenshot({ path: OUT + '/amdb_3d.png' });
  await page.evaluate(() => window.VIEW3D.close());
  // the step-by-step guide
  await openTab('guide', '.amg-steps');
  const gs = await page.$$eval('.amg-step', (x) => x.length);
  if (gs < 8) fails.push('guide steps: ' + gs);
  await page.click('.amg [data-amgoto="generate"]');
  await page.waitForSelector('[data-gengo]', { timeout: 20000 }).catch(() => fails.push('guide → Generate did not open'));

  /* --------------------------------------------------------------------- import */
  await load([T + 'amxm_test_EAXM.xml']);
  const n0 = (await amxmFeatures())[0].n;
  await openTab('package', '[data-pkbuild]');
  await page.click('[data-pkmode="full"]');
  await page.check('[data-pkack="ack"]');
  const zipPath = await download('[data-pkbuild]');
  const z = fflate.unzipSync(new Uint8Array(fs.readFileSync(zipPath)));
  const pick = (re) => Object.keys(z).filter((n) => re.test(n));
  const imp = OUT + '/import';
  fs.mkdirSync(imp, { recursive: true });
  const files = {};
  for (const [k, re] of [['geojson', /gis\/.*\.geojson$/], ['dxf', /cad\/.*\.dxf$/]]) { const n = pick(re)[0]; files[k] = imp + '/' + path.basename(n); fs.writeFileSync(files[k], z[n]); }
  // the tables are one CSV per feature type: put them together as one file (the reader takes any mix of types)
  const csvs = pick(/tables\/.*\.csv$/).filter((n) => /amxm_type/.test(Buffer.from(z[n]).toString().split('\n').find((l) => l && l[0] !== '#') || ''));
  if (!csvs.length) fails.push('no CSV table with amxm_type and wkt in the package');
  for (let i = 0; i < csvs.length; i++) fs.writeFileSync(imp + '/table_' + i + '.csv', z[csvs[i]]);
  for (const k of ['geojson', 'dxf']) {
    await load([files[k]]);
    const d = await amxmFeatures();
    if (!d.length || d[0].n !== n0) fails.push(k + ' import: ' + JSON.stringify(d.map((x) => x.n)) + ' vs ' + n0);
  }
  await load(csvs.map((n, i) => imp + '/table_' + i + '.csv'));
  const dc = await amxmFeatures();
  const ncsv = dc.reduce((a, d) => a + d.n, 0);
  if (ncsv !== n0) fails.push('CSV import: ' + ncsv + ' vs ' + n0);
  // a CSV without the AMXM columns stays an ordinary table (not read as aerodrome mapping)
  const plain = imp + '/plain.csv';
  fs.writeFileSync(plain, 'name,lat,lon\nA,1,2\n');
  const isCsv = await page.evaluate((t) => AMDBX.isCsv(t), fs.readFileSync(plain, 'utf8'));
  if (isCsv) fails.push('an ordinary CSV taken for aerodrome mapping');

  /* -------------------------------------------------------------------- compare */
  let xml = fs.readFileSync(T + 'amxm_test_EAXM.xml', 'utf8');
  // remove the water area, move the runway element (about 11 m north) and change its width
  xml = xml.replace(/<amxm:featureMember>\s*<amxm:Water[\s\S]*?<\/amxm:featureMember>/, '');
  xml = xml.replace(/(<amxm:RunwayElement gml:id="ID_4">[\s\S]*?<amxm:width uom="meters">)45(<)/, '$150$2');
  xml = xml.replace(/(<amxm:RunwayElement gml:id="ID_4">[\s\S]*?<gml:posList srsDimension="2">)([^<]+)/, (m, a, b) => a + b.trim().split(/\s+/).map((v, i) => i % 2 === 0 ? (parseFloat(v) + 0.0001).toFixed(8) : v).join(' '));
  const after = OUT + '/amxm_test_EAXM_changed.xml';
  fs.writeFileSync(after, xml);
  await load([T + 'amxm_test_EAXM.xml', after]);
  await openTab('compare', '[data-cmpgo]');
  await page.evaluate(() => { const s = document.querySelectorAll('select[data-cmp]'); const ds = window.__AIXM.S.datasets; const a = ds.findIndex((d) => !/changed/.test(d.name)); s[0].value = String(a); s[0].dispatchEvent(new Event('change', { bubbles: true })); });
  await page.evaluate(() => { const s = document.querySelectorAll('select[data-cmp]'); const b = window.__AIXM.S.datasets.findIndex((d) => /changed/.test(d.name)); s[1].value = String(b); s[1].dispatchEvent(new Event('change', { bubbles: true })); });
  await page.click('[data-cmpgo]');
  await page.waitForSelector('.cmp-tbl', { timeout: 30000 });
  const cmp = await page.evaluate(() => Array.from(document.querySelectorAll('.cmp-tbl tbody tr')).map((tr) => Array.from(tr.cells).map((c) => c.textContent)));
  const rem = cmp.filter((r) => r[0] === 'removed' && /Water/.test(r[2]));
  const mv = cmp.find((r) => /moved/.test(r[0]) && /RunwayElement/.test(r[2]));
  if (rem.length !== 1) fails.push('removed water area: ' + JSON.stringify(rem));
  if (!mv || Math.abs(parseFloat(mv[3]) - 11.1) > 1 || !/width: 45 → 50/.test(mv[4])) fails.push('moved and changed runway element: ' + JSON.stringify(mv));
  if (cmp.length !== 2) fails.push('changes listed: ' + cmp.length + ' ' + JSON.stringify(cmp.map((r) => r[0] + ' ' + r[2])));
  for (const f of ['pdf', 'xlsx', 'csv', 'json']) { const p = await download('[data-cmprep="' + f + '"]'); if (fs.statSync(p).size < 300) fails.push('compare report ' + f); }
  const chg = fs.readFileSync(await download('[data-cmprep="amxm"]'), 'utf8');
  const vc = await validateAmxm(chg);
  if (!vc.valid) fails.push('change file not valid: ' + vc.errors.slice(0, 3).join(' | '));
  if ((chg.match(/<amxm:featureMember>/g) || []).length !== 2 || !/<amxm:endfeat>/.test(chg) || !/<amxm:interp>3</.test(chg)) fails.push('change file content');
  await page.screenshot({ path: OUT + '/compare.png' });

  if (errors.length) fails.push('page errors: ' + errors.join(' | '));
  await browser.close();
  if (fails.length) { console.error('FAIL amdb_tools\n - ' + fails.join('\n - ')); process.exit(1); }
  console.log('PASS amdb_tools (generated ' + genXml.n + ' features for EADD; ' + n0 + ' features through GeoJSON, CSV and DXF; compare and change file)');
})().catch((e) => { console.error('FAIL amdb_tools', e); process.exit(1); });
