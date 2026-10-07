// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Custom data export in AIXM (Export page, step 4): the selected features with every feature they reference, so the
// file stands alone — as delivered or converted to another AIXM version:
// - AIXM 5.1.1 Donlon: runway characteristics of EADD and the danger areas, as delivered and as AIXM 5.2; each file is
//   read again: the runways of EADD in AD 2.12, the danger areas, no reference left unresolved (in 5.2 only the one to
//   the AltimeterSource, which AIXM 5.2 removed — the report says so);
// - AIXM 4.5: an aerodrome with its runways, as delivered (4.5) and as AIXM 5.1.1, both read again;
// - one aerodrome with its related data (aerodrome data, airspace over it and nearby, procedures, obstacles, navaids,
//   routes within 10 NM) from the AIP, obstacle and IFP data sets loaded; data sets in another AIXM version left out.
/* global ANALYSIS, AIP */
const fs = require('fs');
const path = require('path');
const env = require('./_env');
const ROOT = env.ROOT, OUT = env.out('custom_export_aixm'), T = ROOT + '/testdata/';
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
    await page.evaluate(() => localStorage.removeItem('aixm-xsel'));
    await page.setInputFiles('#file-input', files);
    await page.waitForFunction((n) => !window.__AIXM.S.adding && window.__AIXM.S.files.length >= n && window.__AIXM.S.files.every((f) => f.status !== 'checking'), files.length, { timeout: 30000 });
    await page.evaluate(() => document.querySelector('#extract-btn').click());
    await page.waitForFunction((n) => window.__AIXM.S.datasets.length >= n && window.__AIXM.S.files.every((f) => f.status !== 'parsing' && f.status !== 'indexing'), files.length, { timeout: 60000 });
  }
  async function exportAixm(version) {
    await page.selectOption('#xp-aixmv', version);
    const [d] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('[data-xf="aixm"]')]);
    const p = path.join(OUT, version + '_' + d.suggestedFilename()); await d.saveAs(p);
    await page.waitForSelector('.modal'); const rep = await page.evaluate(() => document.querySelector('.modal').innerText);
    await page.evaluate(() => document.querySelector('.modal-back').remove());
    return { p, rep, xml: fs.readFileSync(p, 'utf8') };
  }
  // the exported file read again on its own
  async function reread(p) {
    await load([p]);
    return page.evaluate(async () => {
      const ds = window.__AIXM.S.datasets[0], q = await ANALYSIS.quality(ds), by = {};
      ds.recs.forEach((r) => { by[r.k] = (by[r.k] || 0) + 1; });
      const ad = (ds.byType.AirportHeliport || [])[0];
      let rwy;
      try { const sec = AIP.findSection(ds, 'AD2.12:' + ad.i); rwy = sec ? sec.build().blocks[0].rows.map((r) => r[0].t) : []; } catch (e) { rwy = ['error ' + e.message]; }
      return { version: ds.version, n: ds.recs.length, by, rwy, unresolved: q.filter((i) => i.rule === 'References' && i.sev !== 'info').map((i) => i.msg), danger: (ds.byType.Airspace || []).filter((a) => a.cur.p.type === 'D').length };
    });
  }

  // AIXM 5.1: runway characteristics of EADD and the danger areas
  await load([T + 'Donlon_ALL_Baseline_2025.xml']);
  const want = await page.evaluate(() => (window.__AIXM.S.datasets[0].byType.Airspace || []).filter((a) => a.cur.p.type === 'D').length);
  await page.evaluate(() => window.__AIXM.go('export')); await page.waitForSelector('#xp');
  await page.check('#xp-ads input[data-code="EADD"]');
  await page.click('.xp-qp:text-is("Runway characteristics")');
  await page.click('.xp-grp summary:has-text("Airspace by type")'); await page.check('[data-k="as:D"]');
  const opts = await page.evaluate(() => [...document.querySelectorAll('#xp-aixmv option')].map((o) => o.value).join());
  if (opts !== 'orig,5.1,5.1.1,5.2') fails.push('AIXM versions offered: ' + opts);
  await page.screenshot({ path: OUT + '/step4.png' });
  const a = await exportAixm('orig'), b = await exportAixm('5.2');
  if (!/selected feature\(s\) and \d+ supporting feature/.test(a.rep)) fails.push('report: ' + a.rep);
  if (!/<!-- supporting: referenced by/.test(a.xml) || !/<!-- selected -->/.test(a.xml)) fails.push('selected / supporting marks missing');
  if (!/aixm\.aero\/schema\/5\.2"/.test(b.xml) || /aixm\.aero\/schema\/5\.1(\.1)?"/.test(b.xml)) fails.push('5.2 namespaces');
  if (!/Not in AIXM 5\.2 .*AltimeterSource \(1\)/.test(b.rep)) fails.push('5.2 report: features not in 5.2: ' + b.rep);
  for (const f of [a, b]) {
    const r = await reread(f.p);
    console.log(path.basename(f.p), JSON.stringify(r));
    if (r.by.AirportHeliport !== 1 || !['09L', '27R'].every((x) => r.rwy.includes(x)) || r.danger !== want || r.unresolved.filter((m) => !(f === b && /altimeterSource/.test(m))).length || r.n > 400) fails.push('reread ' + path.basename(f.p) + ': ' + JSON.stringify(r));
  }

  // AIXM 4.5: an aerodrome with its runways, as delivered and as AIXM 5.1.1
  await load([T + 'sample_aixm45_snapshot.xml']);
  await page.evaluate(() => window.__AIXM.go('export')); await page.waitForSelector('#xp');
  await page.click('[data-xa="all"]'); await page.click('.xp-qp:text-is("Runway characteristics")');
  const c = await exportAixm('orig'), d = await exportAixm('5.1.1');
  if (!/<AIXM-Snapshot/.test(c.xml) || !/<Rwy\b/.test(c.xml)) fails.push('4.5 as delivered: ' + c.xml.slice(0, 300));
  if (!/schema\/5\.1\.1"/.test(d.xml) || !/<aixm:Runway\b/.test(d.xml)) fails.push('4.5 to 5.1.1');
  for (const f of [c, d]) {
    const r = await reread(f.p);
    console.log(path.basename(f.p), JSON.stringify(r));
    if (!r.by.AirportHeliport || !r.rwy.length || r.unresolved.length) fails.push('reread ' + path.basename(f.p) + ': ' + JSON.stringify(r));
  }

  // one aerodrome with its related data from the AIP, obstacle and IFP data sets of the State
  await load([T + 'Donlon_ALL_Baseline_2025.xml', T + 'EA_EADD_OBS_DS_AREA_2_3_4_FULL_20191205.xml', T + 'ifp_test_EADD.xml', T + 'ifp52_test_EADD.xml']);
  const vers = await page.evaluate(() => window.__AIXM.S.datasets.map((d) => d.name + ' ' + d.version));
  await page.evaluate(() => { window.__AIXM.S.active = window.__AIXM.S.datasets.findIndex((d) => /Donlon_ALL/.test(d.name)); window.__AIXM.go('export'); }); await page.waitForSelector('#xp');
  await page.check('#xp-ads input[data-code="EADD"]');
  await page.click('.xp-qp:text-is("Magnetic variation")');
  await page.click('.xp-rel summary'); await page.click('[data-xrelall="1"]');
  await page.fill('#xp-relnm', '10'); await page.dispatchEvent('#xp-relnm', 'change');
  await page.screenshot({ path: OUT + '/related.png' });
  const e = await exportAixm('orig');
  const tags = {}; (e.xml.match(/<!-- related: [^>]*-->/g) || []).forEach((t) => { const k = t.replace(/<!-- related: /, '').replace(/ (\d|within|of|from).*$/, '').replace(/ -->$/, ''); tags[k] = (tags[k] || 0) + 1; });
  console.log('versions', JSON.stringify(vers), '\nrelated', JSON.stringify(tags));
  for (const k of ['EADD aerodrome data', 'airspace over EADD', 'obstacle', 'EADD instrument procedure']) if (!Object.keys(tags).some((t) => t.indexOf(k) === 0)) fails.push('related ' + k + ' missing: ' + JSON.stringify(tags));
  if (!/related feature\(s\) added/.test(e.rep) || !/Left out .*ifp52_test_EADD\.xml/.test(e.rep)) fails.push('related report: ' + e.rep);
  const rr = await reread(e.p);
  console.log('related reread', JSON.stringify(rr));
  if (!rr.by.VerticalStructure || !rr.by.InstrumentApproachProcedure || !rr.by.Airspace || !rr.rwy.length || rr.unresolved.length) fails.push('related reread: ' + JSON.stringify(rr));

  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
  console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : 'Custom data export in AIXM (selection with supporting features, 4.5 / 5.1 / 5.2, read again) OK');
  if (errors.length || fails.length) process.exitCode = 1;
  await browser.close();
})();
