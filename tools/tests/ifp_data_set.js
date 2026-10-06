// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// An AIXM 5.2 instrument flight procedure data set (testdata/ifp52_test_EADD.xml) read with the Donlon AIP data set:
// - procedures linked to their aerodrome and runways in the AIP data set; legs, crossing altitudes, true and magnetic
//   courses, RF radius, fly-by / fly-over, 5.2 minima and the full FAS data block in AD 2.22 / 2.24;
// - RF legs drawn as arcs; the approach path drawn from its IF;
// - coding checks (Annex 11, PANS-OPS, EUROCONTROL) in the Procedures section, Quality and the report.
/* global AIP, MAPVIEW, ANALYSIS */
const env = require('./_env');
const ROOT = env.ROOT, OUT = env.out('ifp_data_set'), T = ROOT + '/testdata/';
const URL = 'file://' + ROOT + '/AIXM-Code-Converter.html';

(async () => {
  const browser = await env.playwright.chromium.launch({ executablePath: env.chrome });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [], fails = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(URL); await page.waitForSelector('#drop');
  await page.setInputFiles('#file-input', [T + 'Donlon_ALL_Baseline_2025.xml', T + 'ifp52_test_EADD.xml']);
  await page.waitForFunction(() => !window.__AIXM.S.adding && window.__AIXM.S.files.every((f) => f.status !== 'checking'), null, { timeout: 30000 });
  await page.evaluate(() => document.querySelector('#extract-btn').click());
  await page.waitForFunction(() => window.__AIXM.S.datasets.length >= 2 && window.__AIXM.S.files.every((f) => f.status !== 'parsing' && f.status !== 'indexing'), null, { timeout: 60000 });

  const r = await page.evaluate(async () => {
    const ds = window.__AIXM.S.datasets.find((d) => /ifp52/.test(d.name)), sid = ds.byType.StandardInstrumentDeparture[0], iap = ds.byType.InstrumentApproachProcedure[0];
    const legs = AIP.procDetail(ds, sid).find((b) => b.title === 'Legs').rows.map((x) => x.map((c) => c.t).join(' | '));
    const det = AIP.procDetail(ds, iap), fas = det.find((b) => /FAS/.test(b.title)), mins = det.find((b) => b.title === 'Minima');
    const q = await ANALYSIS.quality(ds);
    return { version: ds.version, legs, fas: fas ? fas.rows.length : 0, mins: mins ? mins.rows.map((x) => x.map((c) => c.t).join(' | ')) : [],
      paths: MAPVIEW.procPaths(ds, sid).map((p) => p.coords.length), iapPaths: MAPVIEW.procPaths(ds, iap).length,
      coding: q.filter((i) => i.rule === 'IFP coding').length, codingWarn: q.filter((i) => i.rule === 'IFP coding' && i.sev === 'warning').length, notLinked: q.filter((i) => /not linked to an aerodrome/.test(i.msg)).length };
  });
  if (r.version !== '5.2') fails.push('version ' + r.version);
  if (!/RF · Departure \| DN521 \| DN522 \(fly-by\) \| turn LEFT r 3.7 NM/.test(r.legs[2] || '')) fails.push('RF leg: ' + r.legs[2]);
  if (!/between 3000 FT AMSL and 5000 FT AMSL at the end/.test(r.legs[1] || '') || !/117.6°T \/ 122°M .*max 250 KT IAS/.test(r.legs[3] || '')) fails.push('AIXM 5.2 leg data: ' + JSON.stringify(r.legs));
  if (r.fas < 10 || !/DA 450 FT \| DH 250 FT \(THR\)/.test(r.mins[0] || '')) fails.push('FAS data block / minima: ' + JSON.stringify(r));
  if (!(r.paths[1] > 10) || r.iapPaths < 3) fails.push('paths (RF arc, approach from its IF): ' + JSON.stringify(r));
  if (r.codingWarn < 8 || r.notLinked !== 1) fails.push('Quality IFP coding: ' + JSON.stringify(r));

  await page.evaluate(() => window.__AIXM.go('digital'));
  await page.click('[data-ddsec="ifp"]'); await page.waitForTimeout(800);
  const list = await page.evaluate(() => [...document.querySelectorAll('.ov-tbl tbody tr')].map((t) => t.children[0].textContent + ' ' + t.children[2].textContent));
  if (list.length !== 3 || list.filter((x) => /^EADD/.test(x)).length !== 2) fails.push('procedure list: ' + JSON.stringify(list));
  await page.click('[data-ddchk]'); await page.waitForSelector('.dd-chk');
  const chk = await page.evaluate(() => ({ rows: document.querySelectorAll('.dd-chk tbody tr').length, kodap: [...document.querySelectorAll('.dd-chk tbody tr')].filter((t) => /KODAP12/.test(t.textContent)).length }));
  if (chk.rows < 10 || chk.kodap !== chk.rows) fails.push('coding checks panel: ' + JSON.stringify(chk));
  await page.screenshot({ path: OUT + '/coding_checks.png' });
  for (const f of ['pdf', 'xlsx']) {
    const [d] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('[data-ddrep="' + f + '"]')]).catch((e) => { fails.push('report ' + f + ': ' + e.message.split('\n')[0]); return [null]; });
    if (d) { const p = OUT + '/' + d.suggestedFilename(); await d.saveAs(p); if (require('fs').statSync(p).size < 2000) fails.push('report ' + f + ' empty'); }
  }

  console.log(JSON.stringify(r));
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
  console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : 'IFP data set (AIXM 5.2 reading, RF arcs, coding checks, reports) OK');
  if (errors.length || fails.length) process.exitCode = 1;
  await browser.close();
})();
