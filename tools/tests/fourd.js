// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// 4D (Map -> 4D time):
// - off until switched on: nothing of it runs when the page opens or the map is shown, the map is as before;
// - on: the time bar (fixed at the top, or floating and moved; a chosen period from ... to ...), the airspace of Donlon active / possible / inactive at different times, steps (15 min,
//   AIRAC), the list with the reason, a procedure flown in time with its ETO, the 3D view at that time;
// - a Digital NOTAM: the navaid unserviceable while it is in force;
// - exports: KML with time spans and the flight track, CZML, GeoJSON with intervals, PDF and Excel reports;
// - "Use this date in all tabs" sets Data valid on; 4D stays on when the map is built again;
// - switched off, the bar and its layer are gone and the normal airspace layer is back.
/* global FOURD */
const env = require('./_env');
const fs = require('fs');
const ROOT = env.ROOT, OUT = env.out('fourd'), T = ROOT + '/testdata/';
const URL = 'file://' + ROOT + '/AIXM-Code-Converter.html';

(async () => {
  const browser = await env.playwright.chromium.launch({ executablePath: env.chrome });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [], fails = [];
  page.on('pageerror', (e) => { errors.push(e.message); if (process.env.DBG) console.log('pageerror', e.message); });
  async function loadMap(files) {
    await page.goto(URL); await page.waitForSelector('#drop');
    await page.setInputFiles('#file-input', files.map((f) => T + f));
    await page.waitForFunction((n) => !window.__AIXM.S.adding && window.__AIXM.S.files.length >= n && window.__AIXM.S.files.every((f) => f.status !== 'checking'), files.length, { timeout: 30000 });
    await page.evaluate(() => document.querySelector('#extract-btn').click());
    await page.waitForFunction(() => window.__AIXM.S.view === 'dash' && window.__AIXM.S.files.every((f) => f.status !== 'parsing' && f.status !== 'indexing'), null, { timeout: 60000 });
    await page.evaluate(() => window.__AIXM.go('map'));
    await page.waitForSelector('#map-4d', { timeout: 30000 });
    await page.waitForTimeout(800);
  }
  async function dl(f) { const [d] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('[data-fdx="' + f + '"]')]); const p = OUT + '/' + d.suggestedFilename(); await d.saveAs(p); return p; }
  await loadMap(['Donlon_ALL_Baseline_2025.xml']);
  const layers = () => page.evaluate(() => { let n = 0, fd = 0; window.MAPVIEW.leaflet().eachLayer((l) => { n++; if (l.options && l.options.pane === 'fourdPane') fd++; }); return { n, fd }; });
  const before = await layers();
  const idle = await page.evaluate(() => ({ f: typeof window.FOURD, block: (document.getElementById('src-fourd') || {}).type, bar: !!document.querySelector('.fd-bar'), pressed: document.getElementById('map-4d').getAttribute('aria-pressed') }));
  if (idle.f !== 'undefined' || idle.block !== 'text/plain' || idle.bar || idle.pressed !== 'false') fails.push('4D ran before it was switched on: ' + JSON.stringify(idle));

  // on
  await page.click('#map-4d');
  await page.waitForSelector('.fd-bar', { timeout: 20000 });
  // fixed at the top by default; floating and moved by its title bar; fixed again
  const box = () => page.$eval('.fd-bar', (e) => { const r = e.getBoundingClientRect(); return { cls: e.className, x: Math.round(r.left), y: Math.round(r.top) }; });
  const b0 = await box();
  if (!/fd-top/.test(b0.cls) || b0.y > 80) fails.push('4D bar not fixed at the top: ' + JSON.stringify(b0));
  await page.click('[data-fd="dock"]');
  const b1 = await box();
  await page.mouse.move(b1.x + 60, b1.y + 12); await page.mouse.down(); await page.mouse.move(b1.x - 140, b1.y - 200, { steps: 6 }); await page.mouse.up();
  const b2 = await box();
  if (!/fd-float/.test(b1.cls) || Math.abs(b2.x - (b1.x - 200)) > 6 || Math.abs(b2.y - (b1.y - 212)) > 6) fails.push('floating 4D bar not moved: ' + JSON.stringify([b1, b2]));
  await page.click('[data-fd="dock"]');
  if (!/fd-top/.test((await box()).cls)) fails.push('4D bar not fixed at the top again');
  const setTime = async (v) => { await page.fill('[data-fd="t"]', v); await page.dispatchEvent('[data-fd="t"]', 'change'); await page.waitForTimeout(250); };
  const counts = () => page.evaluate(() => { const n = { on: 0, maybe: 0, off: 0, none: 0 }; FOURD.state.st.forEach((x) => { if (n[x.st] !== undefined) n[x.st]++; }); return { n, T: FOURD.time(), items: FOURD.state.items.length }; });
  await setTime('2026-10-07T10:00');
  const c1 = await counts();
  await setTime('2026-10-11T03:00');
  const c2 = await counts();
  if (c1.items < 50 || !c1.n.on || !(c1.n.maybe + c2.n.maybe) || !(c1.n.off + c2.n.off)) fails.push('states at two times: ' + JSON.stringify([c1, c2]));
  if (JSON.stringify(c1.n) === JSON.stringify(c2.n)) fails.push('no change between Wednesday 10:00 and Sunday 03:00');
  const kp = await page.$eval('.fd-kpis', (e) => e.textContent);
  if (!/active \/ available/.test(kp) || !/AIRAC 26/.test(kp)) fails.push('KPIs: ' + kp);
  const fdLayers = (await layers()).fd;
  if (fdLayers < 20) fails.push('4D shapes on the map: ' + fdLayers);
  // steps
  await page.click('[data-fd="fwd"]'); await page.waitForTimeout(200);
  if ((await counts()).T !== Date.UTC(2026, 9, 11, 3, 15)) fails.push('15 min step: ' + new Date((await counts()).T).toISOString());
  await page.selectOption('[data-fd="step"]', 'airac');
  await page.click('[data-fd="fwd"]'); await page.waitForTimeout(300);
  if ((await counts()).T !== Date.UTC(2026, 9, 29)) fails.push('AIRAC step: ' + new Date((await counts()).T).toISOString());
  await page.selectOption('[data-fd="step"]', String(15 * 60000));
  await setTime('2026-10-07T10:00');
  // a chosen period: from ... to ...
  await page.fill('[data-fd="from"]', '2026-10-05T06:00'); await page.dispatchEvent('[data-fd="from"]', 'change');
  await page.fill('[data-fd="to"]', '2026-10-09T18:00'); await page.dispatchEvent('[data-fd="to"]', 'change');
  await page.waitForTimeout(300);
  const per = await page.evaluate(() => ({ range: document.querySelector('[data-fd="range"]').value, r1: document.querySelector('.fd-r1').textContent, T: FOURD.time() }));
  if (per.range !== 'custom' || !/2026-10-09 18:00/.test(per.r1) || per.T < Date.UTC(2026, 9, 5, 6) || per.T >= Date.UTC(2026, 9, 9, 18)) fails.push('chosen period: ' + JSON.stringify(per));
  await page.fill('[data-fd="to"]', '2026-10-01T00:00'); await page.dispatchEvent('[data-fd="to"]', 'change'); await page.waitForTimeout(200);
  if (!/2026-10-09 18:00/.test(await page.$eval('.fd-r1', (e) => e.textContent))) fails.push('a "To" before "From" was taken');
  await page.selectOption('[data-fd="range"]', 'day');
  await setTime('2026-10-07T10:00');
  // the list
  await page.evaluate(() => { document.querySelector('.fd-more').open = true; document.querySelector('.fd-listbox').open = true; document.querySelector('.fd-listbox').dispatchEvent(new Event('toggle')); });
  await page.waitForTimeout(400);
  const rows = await page.$$eval('.fd-list tbody tr', (r) => r.map((x) => x.textContent));
  if (rows.length < 20 || !rows.some((r) => /active/.test(r)) || !rows.some((r) => /→/.test(r))) fails.push('list: ' + rows.length + ' ' + rows.slice(0, 2).join(' | '));
  await page.screenshot({ path: OUT + '/fourd.png' });
  // exports
  const kml = fs.readFileSync(await dl('kml'), 'utf8');
  if (!/<TimeSpan><begin>2026-10-07T/.test(kml) || !/NOT FOR NAVIGATION/.test(kml) || !/Prasad Selvaraj/.test(kml)) fails.push('KML');
  const wf = await page.evaluate((t) => new DOMParser().parseFromString(t, 'application/xml').getElementsByTagName('parsererror').length, kml);
  if (wf) fails.push('KML not well-formed');
  const czml = JSON.parse(fs.readFileSync(await dl('czml'), 'utf8'));
  if (czml[0].id !== 'document' || czml.length < 10 || !czml.some((p) => p.polygon && /\//.test(p.availability))) fails.push('CZML: ' + czml.length);
  const gj = JSON.parse(fs.readFileSync(await dl('geojson'), 'utf8'));
  if (gj.type !== 'FeatureCollection' || gj.features.length < 20 || !gj.features.every((f) => Array.isArray(f.properties.intervals) && f.properties.intervals.length) || !/NOT FOR NAVIGATION/.test(gj.notice)) fails.push('GeoJSON');
  for (const f of ['pdf', 'xlsx']) { const p = await dl(f); if (fs.statSync(p).size < 3000) fails.push(f + ' report: ' + fs.statSync(p).size); }
  // 3D at that time
  await page.click('#map-3d');
  await page.waitForTimeout(2500);
  const v3 = await page.evaluate(() => { const st = window.VIEW3D && window.VIEW3D.state(); if (!st) return null; let n = 0; st.world.traverse((o) => { if (o.userData && o.userData.as) n++; }); return n; });
  if (v3 === null) fails.push('3D view did not open with 4D on');
  await page.evaluate(() => window.VIEW3D.close());
  // the date to every tab; 4D stays on when the map is built again
  await page.click('[data-fd="apply"]');
  await page.waitForTimeout(1500);
  const ap = await page.evaluate(() => ({ asOf: window.__AIXM.S.asOf, bar: !!document.querySelector('.fd-bar'), on: FOURD.on, T: FOURD.time() }));
  if (ap.asOf !== Date.UTC(2026, 9, 7) || !ap.bar || !ap.on) fails.push('use this date in all tabs: ' + JSON.stringify(ap));
  // off
  await page.click('[data-fd="close"]');
  await page.waitForTimeout(400);
  const after = await layers();
  const off = await page.evaluate(() => ({ bar: !!document.querySelector('.fd-bar'), on: FOURD.on, pressed: document.getElementById('map-4d').getAttribute('aria-pressed') }));
  if (off.bar || off.on || off.pressed !== 'false' || after.fd) fails.push('switched off: ' + JSON.stringify([off, after]));
  if (Math.abs(after.n - before.n) > 3) fails.push('map layers before / after 4D: ' + before.n + ' / ' + after.n);


  // a procedure flown in time (EA AIP data set with its IFP data set, both on the map)
  await loadMap(['EA_AIP_DS_FULL_20170701.xml', 'ifp_test_EADD.xml']);
  await page.evaluate(() => { const a = document.querySelector('[data-dsa]'); if (a) a.click(); });
  await page.waitForTimeout(600);
  await page.click('#map-4d');
  await page.waitForSelector('.fd-bar', { timeout: 20000 });
  await setTime('2026-10-07T10:00');
  await page.evaluate(() => { document.querySelector('.fd-more').open = true; });
  // procedure in time
  const nproc = await page.$$eval('[data-fd="proc"] option', (o) => o.length - 1);
  if (nproc < 1) fails.push('procedures offered: ' + nproc);
  await page.selectOption('[data-fd="proc"]', '0');
  await page.click('[data-fd="fly"]');
  await page.waitForTimeout(300);
  await page.click('[data-fd="fwd"]'); await page.click('[data-fd="fwd"]'); await page.waitForTimeout(300);
  const fl = await page.evaluate(() => { const f = FOURD.state.flight; return f ? { legs: f.legs.length, d: f.dist, eto: document.querySelectorAll('.fd-eto tbody tr').length, mk: !!(f.mk && f.mk._map) } : null; });
  if (!fl || fl.legs < 2 || fl.eto < 2 || !fl.mk || !(fl.d > 1)) fails.push('procedure in time: ' + JSON.stringify(fl));
  await page.screenshot({ path: OUT + '/fourd_procedure.png' });
  const kml2 = fs.readFileSync(await dl('kml'), 'utf8'), czml2 = JSON.parse(fs.readFileSync(await dl('czml'), 'utf8'));
  if (!/<gx:Track>(<when>2026-10-07T10:[^<]+<\/when>)+/.test(kml2)) fails.push('KML flight track');
  if (!czml2.some((p) => p.id === 'flight' && p.position.cartographicDegrees.length > 8)) fails.push('CZML flight');
  await page.click('[data-fd="close"]');
  // a Digital NOTAM (temporary change without the baseline): unserviceable while in force, not known outside
  await loadMap(['digital_notam/DN_NAV.UNS_1_VOR-DME_all_components_unserviceable.xml']);
  await page.click('#map-4d');
  await page.waitForSelector('.fd-bar', { timeout: 20000 });
  const dn = [];
  for (const v of ['2026-03-28T04:00', '2026-03-28T06:00', '2026-03-28T08:00']) { await setTime(v); dn.push(await page.evaluate(() => Array.from(FOURD.state.st.entries()).filter(([r]) => r.k === 'Navaid').map(([, x]) => x.st + (x.temp ? '*' : ''))[0])); }
  if (dn.join() !== 'steady,off*,steady') fails.push('Digital NOTAM in time: ' + dn.join());
  await page.click('[data-fd="close"]');
  if (errors.length) fails.push('page errors: ' + errors.join(' | '));
  await browser.close();
  if (fails.length) { console.error('FAIL fourd\n - ' + fails.join('\n - ')); process.exit(1); }
  console.log('PASS fourd (' + c1.items + ' timed features; Wed 10:00 ' + JSON.stringify(c1.n) + ', Sun 03:00 ' + JSON.stringify(c2.n) + '; ' + nproc + ' procedure(s) flown; exports)');
})().catch((e) => { console.error('FAIL fourd', String(e).slice(0, 300)); process.exit(1); });
