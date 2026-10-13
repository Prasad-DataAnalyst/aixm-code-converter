// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Digital data -> Flight & obstacle analysis, on the Donlon test data (AIP, obstacle data set Areas 2/3/4, IFP):
// - loaded only when opened; take-off (Type A, net path, PANS-OPS), approach, runway impact, eTOD areas, route and
//   airspace, NOTAM & areas each give a result card, a picture and a table;
// - the views: map (obstacle icons by kind), profile (SVG), 3D and Hologram (WebGL, layers, layers apart), a view in
//   its own window;
// - NOTAM text: an obstacle on the departure path becomes the limiting obstacle; a restricted area by NOTAM and a
//   runway closure are read; "Add to the data loaded" makes them files of the data;
// - every report: PDF, Excel, CSV, KML, GeoJSON, DXF, e-mail draft, copy for e-mail.
/* global FLTVIEW, FLTCALC, FLTSCENE, AX, THREE */
const env = require('./_env');
const fs = require('fs');
const ROOT = env.ROOT, OUT = env.out('flight_analysis'), T = ROOT + '/testdata/';
const URL = 'file://' + ROOT + '/AIXM-Code-Converter.html';

(async () => {
  const browser = await env.playwright.chromium.launch({ executablePath: env.chrome, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [], fails = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(URL); await page.waitForSelector('#drop');
  const files = [T + 'Donlon_ALL_Baseline_2025.xml', T + 'EA_EADD_OBS_DS_AREA_2_3_4_FULL_20191205.xml', T + 'ifp_test_EADD.xml'];
  await page.setInputFiles('#file-input', files);
  await page.waitForFunction((n) => !window.__AIXM.S.adding && window.__AIXM.S.files.length >= n && window.__AIXM.S.files.every((f) => f.status !== 'checking'), files.length, { timeout: 30000 });
  await page.evaluate(() => document.querySelector('#extract-btn').click());
  await page.waitForFunction(() => window.__AIXM.S.view === 'dash' && window.__AIXM.S.files.every((f) => f.status !== 'parsing' && f.status !== 'indexing'), null, { timeout: 60000 });
  if (await page.evaluate(() => typeof FLTVIEW !== 'undefined')) fails.push('the analysis code is loaded before the section is opened');
  await page.evaluate(() => window.__AIXM.go('digital', { sec: 'flt' }));
  async function done() { await page.waitForFunction(() => { const v = document.querySelector('.flt-verdict'); return v && !v.querySelector('.spinner'); }, null, { timeout: 60000 }); }
  async function mode(m) {
    if (!(await page.$('[data-mode="' + m + '"]'))) { await page.screenshot({ path: OUT + '/no_mode_' + m + '.png' }); console.error('no mode tab', m, await page.evaluate(() => [window.__AIXM.S.view, (document.querySelector('#view') || document.body).innerText.slice(0, 300)])); }
    await page.click('[data-mode="' + m + '"]'); await done();
  }
  async function view(v) { await page.click('.flt [data-fv="' + v + '"]'); await page.waitForTimeout(700); }
  await done();
  const card = () => page.evaluate(() => ({ txt: (document.querySelector('.flt-verdict b') || {}).textContent || '', kpi: document.querySelectorAll('.flt-kpi').length, sev: document.querySelector('.flt-verdict').className, rows: (FLTVIEW.state.last && FLTVIEW.state.last.table || []).length }));

  // take-off: result, KPIs, map with obstacle icons, profile, 3D, hologram
  let c = await card();
  if (!/gradient|obstacle|Clear|CLEAR/.test(c.txt) || c.kpi < 4) fails.push('take-off card: ' + JSON.stringify(c));
  const icons = await page.evaluate(() => document.querySelectorAll('.flt-stage .fs-ic svg').length);
  if (!icons) fails.push('no obstacle icons on the map');
  await page.click('.flt-stage .obs-style [data-os="dots"]');
  const flatDots = await page.evaluate(() => document.querySelectorAll('.flt-stage .fs-ic svg').length);
  await page.click('.flt-stage .obs-style [data-os="models"]');
  if (flatDots !== 0 || !(await page.evaluate(() => document.querySelectorAll('.flt-stage .fs-ic svg').length))) fails.push('analysis map: Models / Dots switch');
  // aviation units: distances in nautical miles, heights in feet
  const units = await page.evaluate(() => ({ cell: (document.querySelector('.flt-t tbody tr td:nth-child(4)') || {}).textContent || '', top: (document.querySelector('.flt-t tbody tr td:nth-child(6)') || {}).textContent || '', scale: [...document.querySelectorAll('.flt-stage .leaflet-control-scale-line')].map((x) => x.textContent).join(' / '), arcs: [...document.querySelectorAll('.flt-stage .fs-arc')].map((x) => x.textContent).join(' ') }));
  if (!/NM$/.test(units.cell) || !/ft$/.test(units.top) || !/NM/.test(units.scale) || /km/.test(units.arcs + units.cell) || !/NM/.test(units.arcs)) fails.push('units (NM, ft): ' + JSON.stringify(units));
  await view('profile');
  if (!(await page.$('.flt-stage svg polyline'))) fails.push('profile: no lines');
  await view('3d');
  if (!(await page.$('.flt-stage canvas'))) fails.push('3D: no canvas');
  await view('holo');
  const holo = await page.evaluate(() => { const st = document.querySelector('.flt-stage'); return { style: st.getAttribute('data-style'), bar: !!st.querySelector('.fs-bar'), png: (FLTVIEW.state.handle && FLTVIEW.state.handle.png() || '').length }; });
  if (holo.style !== 'holo' || !holo.bar || holo.png < 5000) fails.push('hologram: ' + JSON.stringify(holo));
  // layers apart and the layer list
  await page.evaluate(() => { const r = document.querySelector('[data-fs="explode"]'); r.value = '0.8'; r.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.click('[data-fs="layers"]');
  const nLayers = await page.evaluate(() => document.querySelectorAll('.fs-pop [data-ly]').length);
  if (nLayers < 6) fails.push('3D layers listed: ' + nLayers);
  // layers apart in the order of their heights: the plates go up, the flight path still comes down to the runway
  const apart = await page.evaluate(() => {
    const V = FLTVIEW.state.handle.state, box = (id) => { const g = V.groups[id]; g.updateMatrixWorld(true); return new THREE.Box3().setFromObject(g); };
    let low = Infinity;
    V.groups.net.traverse((o) => { if (o.isLine) { const a = o.geometry.getAttribute('position'); for (let i = 0; i < a.count; i++) low = Math.min(low, a.getY(i) + o.matrixWorld.elements[13]); } });
    const rw = box('rwy'), net = box('net'), ys = V.lay.plates.map((p) => p.y);
    return { up: ys.every((y, i) => !i || y > ys[i - 1]), last: (V.lay.plates[V.lay.plates.length - 1] || { names: [] }).names.join(), touch: (low - rw.min.y) / (net.max.y - rw.min.y) };
  });
  if (!apart.up || !/flight path/i.test(apart.last) || !(apart.touch < 0.15)) fails.push('layers apart by height: ' + JSON.stringify(apart));
  await page.screenshot({ path: OUT + '/takeoff_hologram.png' });
  // a view in its own window
  const [pop] = await Promise.all([ctx.waitForEvent('page', { timeout: 15000 }), page.click('[data-fl="pop"]')]);
  await pop.waitForSelector('#fs-root canvas', { timeout: 20000 });
  await pop.waitForTimeout(800); await pop.screenshot({ path: OUT + '/window_3d.png' }); await pop.close();
  await view('map');

  // NOTAM: a crane 1 500 m beyond the end of TODA of the selected runway, a restricted area, the runway closed
  const geo = await page.evaluate(() => {
    const R = FLTVIEW.state.last, pt = R.spec.layers.find((l) => l.id === 'pts').items[0].c, trk = R.spec.layers.find((l) => l.id === 'arc').items[0].b0 + 90;
    const c = FLTCALC.dest(pt, trk, 1500), d = (v, lon) => AX.dms(v, lon, 0).replace(/[^0-9NSEW]/g, '');
    const ring = [[0, 3000], [90, 3000], [180, 3000], [270, 3000]].map((q) => FLTCALC.dest(pt, q[0], q[1]));
    const rwy = R.title.replace(/^.*RWY /, '');
    return { obst: d(c[1], false) + ' ' + d(c[0], true), ring: ring.concat([ring[0]]).map((q) => d(q[1], false) + ' ' + d(q[0], true)).join(' - '), rwy: rwy, elev: Math.round(R.spec.ref / 0.3048) };
  });
  await mode('notam');
  const brief = '(A0101/26 NOTAMN\nQ) EADD/QOBCE/IV/M/AE/000/010/5200N00300E005\nA) EADD B) 2601010000 C) 2912312359\nE) OBST CRANE ERECTED PSN ' + geo.obst + ' HGT 300FT AGL ELEV ' + (geo.elev + 300) + 'FT AMSL. LGTD.)\n\n' +
    '(A0102/26 NOTAMN\nQ) EADD/QRRCA/IV/BO/W/000/100/5200N00300E005\nA) EADD B) 2601010000 C) 2912312359\nE) TEMPORARY RESTRICTED AREA ACTIVATED WI ' + geo.ring + '\nF) SFC G) FL100)\n\n' +
    '(A0103/26 NOTAMN\nQ) EADD/QMRLC/IV/NBO/A/000/999/5200N00300E005\nA) EADD B) 2601010000 C) 2912312359\nE) RWY ' + geo.rwy + ' CLSD.)';
  await page.fill('[data-nt="text"]', brief);
  await page.click('[data-fl="nread"]'); await done();
  c = await card();
  if (c.rows !== 3) fails.push('NOTAM read: ' + JSON.stringify(c));
  const nt = await page.evaluate(() => FLTVIEW.state.notams.map((n) => [n.cat, n.obstacles.length, !!n.area, !!(n.runway && n.runway.closed)]));
  if (JSON.stringify(nt) !== JSON.stringify([['obstacle', 1, false, false], ['airspace', 0, true, false], ['runway', 0, false, true]])) fails.push('NOTAM content: ' + JSON.stringify(nt));
  // back to take-off: the NOTAM crane is assessed with the other obstacles (it needs about 300 ft / 1 500 m = 6 %)
  await mode('to');
  const lim = await page.evaluate(() => { const R = FLTVIEW.state.last, cr = R.rows.find((r) => r.ob.notam); return { found: !!cr, inA6: cr && cr.inA6, req: cr && cr.req, sev: R.verdict.sev, map: document.querySelectorAll('.flt-stage .fs-ic svg path[fill="#ffb300"]').length }; });
  if (!lim.found || !lim.inA6 || !(lim.req > 0.05 && lim.req < 0.07) || lim.sev !== 'error' || !lim.map) fails.push('NOTAM crane in the take-off assessment: ' + JSON.stringify(lim));
  // approach, runway impact (the closure is shown), eTOD areas
  await mode('app');
  c = await card(); if (c.kpi < 4) fails.push('approach card: ' + JSON.stringify(c));
  await mode('rwy');
  const rw = await page.evaluate(() => { const R = FLTVIEW.state.last; return { n: R.table.length, closed: R.table.some((r) => /CLOSED/.test(r[9])) }; });
  if (rw.n < 2 || !rw.closed) fails.push('runway impact: ' + JSON.stringify(rw));
  await mode('etod');
  const et = await page.evaluate(() => { const R = FLTVIEW.state.last; return { areas: R.extra.rows.map((r) => r[0]), n: R.table.length, layers: R.spec.layers.map((l) => l.id) }; });
  if (et.areas.indexOf('Area 2a') < 0 || !et.n || ['e2a', 'e2b', 'e2c', 'e2d', 'e3'].some((k) => et.layers.indexOf(k) < 0)) fails.push('eTOD areas: ' + JSON.stringify(et));
  // route through the NOTAM restricted area at FL050: entered while active
  await mode('route');
  const pts = await page.evaluate(() => (window.__AIXM.S.datasets[0].byType.DesignatedPoint || []).slice(0, 1).map((p) => p.cur.p.designator));
  await page.fill('[data-rt="text"]', 'EADD ' + geo.obst.replace(' ', '') + ' ' + (pts[0] || ''));
  await page.fill('[data-rt="fl"]', '050');
  await page.click('[data-fl="route"]'); await done();
  const rt = await page.evaluate(() => { const R = FLTVIEW.state.last; return { empty: !!R.empty, x: (R.rows || []).map((x) => [x.area.desig, x.vertical, x.area.state]), legs: R.extra ? R.extra.rows.length : 0 }; });
  if (rt.empty || !rt.x.some((x) => /NOTAM A0102/.test(x[0]) && x[1] === 'inside' && x[2] === 'on') || rt.legs < 1) fails.push('route: ' + JSON.stringify(rt));
  await view('profile');
  if (!(await page.$('.flt-stage svg rect'))) fails.push('route profile: no airspace band');

  // reports
  await mode('to');
  async function rep(k) {
    await page.click('[data-fl="report"]');
    const [d] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('[data-rep="' + k + '"]')]);
    const p = OUT + '/' + d.suggestedFilename(); await d.saveAs(p);
    return { name: d.suggestedFilename(), size: fs.statSync(p).size, p: p };
  }
  for (const k of ['pdf', 'xlsx', 'csv', 'kml', 'geojson', 'dxf', 'eml']) {
    try {
      const r = await rep(k);
      if (r.size < 300) fails.push(k + ': ' + r.size + ' bytes');
      const txt = /\.(csv|kml|geojson|dxf|eml)$/.test(r.name) ? fs.readFileSync(r.p, 'utf8') : '';
      if (k === 'dxf' && !/ENTITIES[\s\S]*LINE[\s\S]*EOF/.test(txt)) fails.push('DXF without entities');
      if (k === 'geojson' && !(JSON.parse(txt).features.length > 5)) fails.push('GeoJSON features');
      if (k === 'eml' && !/multipart\/related[\s\S]*Content-ID: <pic1@aixm>/.test(txt)) fails.push('e-mail draft without its pictures');
    } catch (e) { fails.push(k + ': ' + e.message); }
  }
  await page.click('[data-fl="report"]'); await page.click('[data-rep="copy"]');
  await page.waitForFunction(() => /Copied|did not allow/.test(document.querySelector('#toasts') ? document.querySelector('#toasts').textContent : ''), null, { timeout: 30000 }).catch(() => fails.push('copy for e-mail: no message'));
  // add the NOTAM obstacles and areas to the data loaded
  await mode('notam');
  const before = await page.evaluate(() => window.__AIXM.S.datasets.length);
  await page.click('[data-fl="nadd"]');
  await page.waitForFunction((n) => window.__AIXM.S.datasets.length >= n + 2, before, { timeout: 60000 }).catch(() => {});
  const added = await page.evaluate(() => window.__AIXM.S.datasets.map((d) => d.name).filter((n) => /NOTAM_obstacles|Areas_from/.test(n)));
  if (added.length !== 2) fails.push('added to the data: ' + JSON.stringify(added));
  const asp = await page.evaluate(() => { const d = window.__AIXM.S.datasets.find((x) => /Areas_from/.test(x.name)); return d ? (d.byType.Airspace || []).map((a) => a.cur.p.type) : []; });
  if (asp.indexOf('R') < 0) fails.push('restricted area as AIXM: ' + JSON.stringify(asp));

  // a map replaced while it still settles (its stage resized, a zoom in flight, calls after) gives no error and is removed
  const gone = await page.evaluate(async () => {
    const out = [];
    for (const step of ['resize', 'zoom', 'calls']) {
      const el = document.createElement('div'); el.style.cssText = 'position:fixed;left:0;top:0;width:700px;height:420px'; document.body.appendChild(el);
      const h = FLTSCENE.map(el, { bbox: [-8.5, 52.2, -8.0, 52.5], layers: [{ id: 'o', kind: 'obstacles', items: [{ id: 'a', c: [-8.3, 52.3], label: 'Crane', hgt: 50, sev: 'error' }] }] }, {});
      if (step === 'resize') { h.destroy(); el.style.width = '500px'; }
      if (step === 'zoom') { h.map.setZoom(h.map.getZoom() + 1); await new Promise((r) => setTimeout(r, 80)); h.destroy(); }
      if (step === 'calls') { h.destroy(); h.resize(); h.select('a'); h.setLayer('o', false); }
      await new Promise((r) => setTimeout(r, 700));
      out.push(!h.map._mapPane); el.remove();
    }
    return out;
  });
  if (gone.indexOf(false) >= 0) fails.push('a map replaced is not removed: ' + JSON.stringify(gone));

  if (errors.length) fails.push('page errors: ' + errors.slice(0, 5).join(' | '));
  await browser.close();
  if (fails.length) { console.error('FAIL\n- ' + fails.join('\n- ')); process.exit(1); }
  console.log('Flight & obstacle analysis (take-off, approach, runway, eTOD areas, route, NOTAM; map, profile, 3D, hologram, window; reports) OK');
})().catch((e) => { console.error(e); process.exit(1); });
