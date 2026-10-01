// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Custom data export (Export page): choose aerodromes and data items (quick picks, single AD 2 items, airspace by type,
// ENR sections), preview, and download Excel, CSV, JSON, PDF, GeoJSON, KML and Shapefile; two data sets at once;
// the selection is remembered after a reload.
const fs = require('fs');
const path = require('path');
const env = require('./_env');
const ROOT = env.ROOT, OUT = env.out('custom_export');
const XLSX = require(path.join(ROOT, 'tools/node_modules/xlsx'));

(async () => {
  const browser = await env.playwright.chromium.launch({ executablePath: env.chrome });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [], fails = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/net::|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto('file://' + ROOT + '/AIXM-Code-Converter.html');
  await page.waitForSelector('#drop');
  await page.setInputFiles('#file-input', [ROOT + '/testdata/Donlon_ALL_Baseline_2025.xml', ROOT + '/testdata/Donlon_EADD_changes_AIRAC2611.xml']);
  await page.waitForFunction(() => window.__AIXM.S.files.length === 2 && window.__AIXM.S.files.every((f) => f.status === 'ready'));
  await page.click('#extract-btn');
  await page.waitForFunction(() => window.__AIXM.S.datasets.length === 2 && window.__AIXM.S.view === 'dash', null, { timeout: 120000 });
  await page.evaluate(() => { localStorage.removeItem('aixm-xsel'); window.__AIXM.S.active = 0; window.__AIXM.go('export'); });
  await page.waitForSelector('#xp');

  // 1. aerodromes: EADD and EADA
  for (const code of ['EADD', 'EADA']) await page.check('#xp-ads input[data-code="' + code + '"]');
  // 2. data: quick picks magnetic variation + declared distances, AD 2.3 item 1, airspace D, ENR 4.4
  const qp = async (label) => page.click('.xp-qp:text-is("' + label + '")');
  await qp('Magnetic variation'); await qp('Declared distances'); await qp('Runway characteristics');
  await page.click('.xp-sec:has([data-k="ad:3"]) .xp-more');
  await page.check('[data-k="ad:3#1"]');
  await page.click('.xp-grp summary:has-text("Airspace by type")');
  await page.check('[data-k="as:D"]');
  await page.click('.xp-grp summary:has-text("En-route (ENR)")');
  await page.check('[data-k="sec:ENR 4.4"]');
  const sum = await page.textContent('#xp-sum');
  console.log('summary:', sum);
  if (!/4 aerodrome items × 2 aerodromes/.test(sum) || !/1 airspace type/.test(sum) || !/1 section/.test(sum)) fails.push('summary: ' + sum);
  await page.screenshot({ path: OUT + '/picker.png', fullPage: false });

  // preview
  await page.click('#xp-preview');
  await page.waitForSelector('.xp-modal');
  const prev = await page.evaluate(() => document.querySelector('.xp-modal').innerText);
  await page.screenshot({ path: OUT + '/preview.png' });
  if (!/MAG VAR/.test(prev) || !/EADD/.test(prev) || !/EADA/.test(prev) || !/DECLARED DISTANCES/.test(prev)) fails.push('preview content');
  await page.click('.xp-modal [data-close]');

  async function dl(fmt) {
    const [d] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('[data-xf="' + fmt + '"]')]);
    const p = path.join(OUT, d.suggestedFilename());
    await d.saveAs(p);
    return p;
  }
  // Excel: one sheet per item, aerodromes as rows
  const xp = await dl('xlsx');
  const wb = XLSX.readFile(xp);
  console.log('excel sheets:', wb.SheetNames.join(' | '));
  const mv = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames.find((n) => /^AD 2\.2/.test(n))], { header: 1 });
  console.log('AD 2.2 sheet:', JSON.stringify(mv.slice(0, 3)));
  if (!(mv[0] || []).some((c) => /MAG VAR/.test(c)) || mv.length < 3) fails.push('excel AD 2.2 table');
  if (!wb.SheetNames.some((n) => /^AD 2\.13/.test(n)) || !wb.SheetNames.some((n) => /ENR 5\.1 · D/.test(n)) || !wb.SheetNames.some((n) => /^ENR 4\.4/.test(n))) fails.push('excel sheets missing');
  // CSV zip
  const cp = await dl('csv');
  const zip = require(path.join(ROOT, 'tools/node_modules/fflate')).unzipSync(fs.readFileSync(cp));
  const names = Object.keys(zip);
  console.log('csv files:', names.length, names.slice(0, 4).join(' | '));
  const mvCsv = names.find((n) => /^AD_2\.2/.test(n));
  const mvText = mvCsv ? Buffer.from(zip[mvCsv]).toString('utf8') : '';
  if (!/MAG VAR/.test(mvText) || !/EADD/.test(mvText)) fails.push('csv AD 2.2');
  // JSON keeps the AIXM source of each value
  const jp = await dl('json');
  const js = fs.readFileSync(jp, 'utf8');
  if (!/"uuid"|"line"/.test(js) || !/MAG VAR/.test(js)) fails.push('json content');
  // PDF
  const pp = await dl('pdf');
  if (fs.statSync(pp).size < 5000 || fs.readFileSync(pp).slice(0, 4).toString() !== '%PDF') fails.push('pdf');
  // GIS: only the selected features
  const gp = await dl('geojson');
  const gj = JSON.parse(fs.readFileSync(gp, 'utf8'));
  const kinds = [...new Set(gj.features.map((f) => f.properties.aixmType))];
  console.log('geojson:', gj.features.length, 'features:', kinds.join(', '));
  if (!gj.features.some((f) => f.properties.aixmType === 'Airspace' && f.properties.subtype === 'D')) fails.push('geojson D areas');
  if (gj.features.some((f) => f.properties.aixmType === 'Airspace' && f.properties.subtype !== 'D')) fails.push('geojson has other airspace');
  if (!gj.features.some((f) => f.properties.aixmType === 'DesignatedPoint')) fails.push('geojson ENR 4.4 points');
  const kp = await dl('kml');
  if (!/<kml/.test(fs.readFileSync(kp, 'utf8'))) fails.push('kml');
  const sp = await dl('shp');
  if (fs.statSync(sp).size < 500) fails.push('shapefile');

  // AIP layout
  await page.check('input[name="xp-layout"][value="aip"]');
  const aip = await page.evaluate(() => EXTRACT.build({ datasets: [window.__AIXM.S.datasets[0]], ads: [], keys: ['ad:2#5'], layout: 'aip' }).sections.length);
  const xa = await dl('xlsx');
  const wb2 = XLSX.readFile(xa);
  console.log('AIP layout sheets:', wb2.SheetNames.slice(0, 6).join(' | '));
  if (!wb2.SheetNames.some((n) => /^AD 2\.2 EADD/.test(n))) fails.push('aip layout per aerodrome');
  if (aip !== 0) fails.push('no aerodromes chosen should give no AD sections');

  // two data sets: a "Data set" column
  await page.check('input[name="xp-layout"][value="table"]');
  await page.check('[data-xds="' + (await page.evaluate(() => window.__AIXM.S.datasets[1].id)) + '"]');
  await page.waitForSelector('#xp');
  const two = await page.evaluate(() => {
    const X = { datasets: window.__AIXM.S.datasets, keys: ['ad:2#5'], layout: 'table' };
    X.ads = window.__AIXM.S.datasets.map((d) => ({ ds: d, ad: d.byType.AirportHeliport.find((a) => /EADD/.test(JSON.stringify(a.cur.p.locationIndicatorICAO))) })).filter((x) => x.ad);
    const sc = EXTRACT.build(X), t = sc.sections[0].blocks[0];
    return { cols: t.cols, rows: t.rows.length };
  });
  console.log('two data sets:', JSON.stringify(two));
  if (two.cols[1] !== 'Data set' || two.rows !== 2) fails.push('two data sets');

  // the selection is remembered
  await page.reload();
  await page.waitForSelector('#drop');
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('aixm-xsel') || '{}'));
  console.log('remembered:', JSON.stringify(kept.keys), JSON.stringify(kept.adCodes));
  if (!(kept.keys || []).includes('ad:2#5') || !(kept.adCodes || []).includes('EADD')) fails.push('selection not remembered');

  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
  console.log(fails.length ? 'FAIL: ' + fails.join('; ') : 'custom export OK');
  if (errors.length || fails.length) process.exitCode = 1;
  await browser.close();
})();
