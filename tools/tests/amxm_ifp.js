// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Digital data sets beyond the AIP data set:
// - aerodrome mapping in AMXM 2.0 (EUROCAE ED-99 / RTCA DO-272; a fictitious aerodrome, testdata/amxm_test_EAXM.xml):
//   recognised, read as the AIXM aerodrome features the tool draws (runway from its thresholds, taxiways, apron,
//   stands, holding positions, hot spot, obstacle), with the airport chart, the information card and the map;
// - an instrument flight procedure (IFP) data set (fictitious procedures for the Donlon aerodrome EADD,
//   testdata/ifp_test_EADD.xml) delivered beside the AIP data set (…_AIP_DS_… / …_IFP_DS_…): both files are read as
//   one data set, so the procedures find their waypoints, navaids and runways; AD 2.22 lists the procedures, legs,
//   minima, the terminal holding and the minimum sector altitude; the map draws the holding and the MSA sectors.
// Also: the AMXM attributes of a feature (every attribute of its type, code values with their meaning, given /
// unknown / not in the file), the Completeness view, procedure details for PANS-OPS (design criteria, PBN, FAS data
// block), IFP checks, and two data sets that name each other's features offered to be read together.
const fs = require('fs');
const path = require('path');
const env = require('./_env');
const ROOT = env.ROOT, OUT = env.out('amxm_ifp');
const URL = 'file://' + ROOT + '/AIXM-Code-Converter.html';

(async () => {
  const browser = await env.playwright.chromium.launch({ executablePath: env.chrome });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 950 } })).newPage();
  const errors = [], fails = [];
  page.on('pageerror', (e) => errors.push(e.message));
  async function load(files) {
    await page.goto(URL); await page.waitForSelector('#drop');
    await page.setInputFiles('#file-input', files);
    await page.waitForFunction((n) => window.__AIXM.S.files.length === n && window.__AIXM.S.files.every((f) => f.status === 'ready') && !window.__AIXM.S.adding, files.length, { timeout: 30000 });
    await page.waitForTimeout(300);
    await page.evaluate(() => document.querySelector('#extract-btn').click());
    await page.waitForFunction(() => window.__AIXM.S.view === 'dash', null, { timeout: 60000 });
  }

  // ---- AMXM aerodrome mapping
  await load([ROOT + '/testdata/amxm_test_EAXM.xml']);
  const am = await page.evaluate(() => {
    const ds = window.__AIXM.S.datasets[0], t = {};
    ds.recs.forEach((r) => { t[r.k] = (t[r.k] || 0) + 1; });
    const ad = ds.byType.AirportHeliport[0], m = ADCHART.of(ds, ad);
    return { label: ds.sniff.versionLabel, t, ad: MODEL.label(ds, ad), arp: !!MODEL.pointOf(ds, ad), chart: m && { rwy: m.runways.map((r) => r.name + ' ' + r.ends.map((e) => e.desig).join('/')), twy: m.twy.map((x) => x.t).sort(), apn: m.apn.map((x) => x.t), std: m.stands.map((x) => x.t).sort(), holds: m.holds.length, hot: m.hot.map((x) => x.t) },
      card: ADCHART.cardHtml(ds, ad).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ') };
  });
  if (!/^AMXM 2\.0/.test(am.label)) fails.push('AMXM not recognised: ' + am.label);
  for (const k of ['RunwayElement', 'RunwayCentrelinePoint', 'RunwayDirection', 'Runway', 'TaxiwayElement', 'Taxiway', 'ApronElement', 'Apron', 'AircraftStand', 'GuidanceLine', 'TaxiHoldingPosition', 'AirportHotSpot', 'VerticalStructure', 'DeicingArea', 'Water', 'ServiceRoad']) if (!am.t[k]) fails.push('AMXM: no ' + k);
  if (am.t.AircraftStand !== 3) fails.push('AMXM: a stand given as area and location should be one stand: ' + am.t.AircraftStand);
  if (!/^EAXM – Test Mapping Field/.test(am.ad) || !am.arp) fails.push('AMXM aerodrome: ' + am.ad);
  const ch = am.chart || {};
  if (JSON.stringify(ch.rwy) !== '["09/27 09/27"]' || ch.twy.join() !== 'A,B,C' || ch.apn.join() !== 'MAIN APRON' || ch.std.join() !== '1,2,3' || ch.holds !== 2 || ch.hot.join() !== 'HS1') fails.push('AMXM airport chart: ' + JSON.stringify(ch));
  if (!/RWY 09\/27 · 2800 x 45 M/.test(am.card) || !/2800 \/ 2900 \/ 2800 \/ 2800/.test(am.card) || !/Taxiways: A, B, C/.test(am.card)) fails.push('AMXM card: ' + am.card.slice(0, 400));
  await page.evaluate(() => window.__AIXM.go('map')); await page.waitForTimeout(800);
  await page.evaluate(() => { const sel = document.querySelector('#map-adview'); sel.value = sel.options[1].value; sel.dispatchEvent(new Event('change')); });
  await page.waitForTimeout(1200);
  if (!+((await page.textContent('[data-count="aerodrome"]')) || '0').replace(/\D/g, '')) fails.push('AMXM: aerodrome layer empty');
  await page.screenshot({ path: OUT + '/amxm.png' });
  for (const v of ['aip', 'explorer', 'quality']) { await page.evaluate((x) => window.__AIXM.go(x), v); await page.waitForTimeout(500); }
  // the AMXM attributes of a runway element: all of its type, codes with their meaning
  const tab = await page.evaluate(() => { const ds = window.__AIXM.S.datasets[0], r = ds.recs.find((x) => x.cur.p._amxm === 'RunwayElement'); window.__AIXM.openDetail(ds, r, 'amxm'); const b = document.querySelector('#dd-body'); return { text: b.textContent, rows: b.querySelectorAll('tbody tr').length, given: b.querySelectorAll('tr.am-given').length }; });
  if (tab.rows < 20 || !/surftype/.test(tab.text) || !/Concrete Grooved/.test(tab.text) || !/given ·/.test(tab.text)) fails.push('AMXM attributes tab: ' + JSON.stringify({ rows: tab.rows, given: tab.given, text: tab.text.slice(0, 200) }));
  await page.evaluate(() => { const c = document.querySelector('#dd-close'); if (c) c.click(); });
  // completeness: AMXM types with the attributes of the schema
  await page.evaluate(() => { window.__AIXM.S.qTab = 'complete'; window.__AIXM.go('quality'); });
  await page.waitForSelector('.cp-type', { timeout: 30000 });
  const cp = await page.evaluate(() => [...document.querySelectorAll('.cp-type summary b')].map((x) => x.textContent));
  if (!cp.includes('AMXM RunwayElement') || !cp.includes('AMXM ParkingStandArea')) fails.push('completeness: ' + cp.join(', '));
  await page.evaluate(() => { window.__AIXM.S.qTab = 'basic'; });

  // ---- IFP data set beside the AIP data set
  const aip = path.join(OUT, 'EA_AIP_DS_FULL_20251101.xml'), ifp = path.join(OUT, 'EA_IFP_DS_FULL_20251101.xml');
  fs.copyFileSync(ROOT + '/testdata/Donlon_ALL_Baseline_2025.xml', aip);
  fs.copyFileSync(ROOT + '/testdata/ifp_test_EADD.xml', ifp);
  await load([aip, ifp]);
  const r = await page.evaluate(() => {
    const S = window.__AIXM.S, ds = S.datasets[0], ad = ds.byType.AirportHeliport.find((a) => a.cur.p.locationIndicatorICAO === 'EADD');
    const procs = ['StandardInstrumentDeparture', 'StandardInstrumentArrival', 'InstrumentApproachProcedure'].map((k) => (ds.byType[k] || []).map((p) => ({ k, own: ds.owner.get(p) === ad, paths: MAPVIEW.procPaths(ds, p).length })));
    return { n: S.datasets.length, files: (ds.files || []).length, procs: [].concat(...procs), blocks: AIP.adBlocks(ds, ad, 22).map((b) => b.title + ':' + (b.rows ? b.rows.length : '')) };
  });
  if (r.n !== 1 || r.files !== 2) fails.push('AIP and IFP data sets of one delivery should be read as one data set: ' + JSON.stringify({ n: r.n, files: r.files }));
  if (r.procs.length !== 3 || r.procs.some((x) => !x.own || !x.paths)) fails.push('procedures: ' + JSON.stringify(r.procs));
  const b = r.blocks.join(' | ');
  for (const want of ['Instrument procedures:3', 'Instrument approach RNP RWY 09L', 'Legs:4', 'Minima:1', 'Holding procedures:3', 'Minimum sector altitudes:2']) if (b.indexOf(want) < 0) fails.push('AD 2.22 misses ' + want + ': ' + b);
  await page.evaluate(() => window.__AIXM.go('map')); await page.waitForTimeout(800);
  await page.evaluate(() => { const ds = window.__AIXM.S.datasets[0]; MAPVIEW.showProcs(ds, ds.byType.AirportHeliport.find((a) => a.cur.p.locationIndicatorICAO === 'EADD')); });
  await page.waitForTimeout(1000);
  const msa = await page.evaluate(() => [...document.querySelectorAll('.msa-alt')].map((x) => x.textContent).sort());
  if (msa.join() !== '3100 FT,4300 FT') fails.push('MSA sectors on the map: ' + msa.join());
  await page.screenshot({ path: OUT + '/ifp.png' });
  // PANS-OPS detail: design criteria, PBN, FAS data block
  const det = await page.evaluate(() => { const ds = window.__AIXM.S.datasets[0], ad = ds.byType.AirportHeliport.find((a) => a.cur.p.locationIndicatorICAO === 'EADD'); return AIP.adBlocks(ds, ad, 22).map((b) => (b.title || '') + ' ' + (b.rows || []).map((r) => (r.cells || r).map((c) => (c && c.t) || '').join(' ')).join(' ')).join(' | '); });
  for (const want of ['PANS-OPS', 'ARINC 424 18', 'flight checked', 'CAT C RNP APCH', 'Final approach segment (FAS) data block', 'EGNOS', 'LPV', 'A1B2C3D4']) if (det.indexOf(want) < 0) fails.push('procedure detail misses ' + want);
  // IFP checks: all legs are located and linked; the STAR has no design standard (IFP coding checks, ifp.js)
  const q = await page.evaluate(async () => (await ANALYSIS.quality(window.__AIXM.S.datasets[0])).filter((i) => /^IFP/.test(i.rule)).map((i) => i.rule + ': ' + i.msg));
  if (q.some((x) => /^IFP:/.test(x)) || !q.some((x) => /IFP coding: STAR KOD1A: design standard not coded/.test(x))) fails.push('IFP checks: ' + q.join(' | '));

  // two data sets that name each other's features, read apart (names that do not pair): offered to read together
  await load([ROOT + '/testdata/Donlon_ALL_Baseline_2025.xml', ROOT + '/testdata/ifp_test_EADD.xml']);
  const two = await page.evaluate(() => window.__AIXM.S.datasets.length);
  const hint = await page.evaluate(() => (document.querySelector('.link-hint') || {}).textContent || '');
  if (two !== 2 || !/Read together/.test(hint)) fails.push('read together offer: ' + JSON.stringify({ two, hint: hint.slice(0, 200) }));
  await page.click('.link-hint [data-together]');
  await page.waitForFunction(() => window.__AIXM.S.datasets.length === 1 && window.__AIXM.S.view === 'dash', null, { timeout: 60000 }).catch(() => fails.push('read together did not give one data set'));
  const one = await page.evaluate(() => { const ds = window.__AIXM.S.datasets[0], ad = ds.byType.AirportHeliport.find((a) => a.cur.p.locationIndicatorICAO === 'EADD'); return { files: (ds.files || []).length, procs: (ds.owned.get(ad) || []).filter((r) => /Procedure|Departure$|Arrival$/.test(r.k)).length, hint: !!document.querySelector('.link-hint') }; });
  if (one.files !== 2 || one.procs !== 3 || one.hint) fails.push('read together: ' + JSON.stringify(one));

  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
  console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : 'aerodrome mapping (AMXM) and IFP data sets OK');
  if (errors.length || fails.length) process.exitCode = 1;
  await browser.close();
})();
