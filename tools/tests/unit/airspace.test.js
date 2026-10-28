// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Unit tests (node --test): airspace geometry (src/core.js, src/model.js, src/analysis.js) on
// testdata/airspace_test_EADD.xml (made by tools/make_airspace_testdata.js, fictitious):
// - WGS-84 ellipsoid: direct and inverse problems against GeographicLib (Karney) reference values;
// - arcs and circles within 0.005 NM of the true curve, long geodesic lines followed on the map and in degrees;
// - a boundary that follows a border (GeoBorder by urn:uuid, also as the first curve of a ring);
// - points and an arc centre held by designated points (gml:pointProperty xlink:href);
// - airspace built from other airspace (PART 2 minus part 1, part 1 plus part 2, a UIR on the FIR's shape);
// - vertical extent (flight levels), contributors included;
// - the airspace checks: an arc missing its points, a missing border and point, two sectors overlapping at the same
//   levels; lower and upper sectors stacked and a computed arc end 30 m from its point are not reported;
// - arcs between their published points: through points far off the coded arc (airspace coding other radii between the
//   same points shares one boundary), the coded arc kept for points up to 0.5 NM off it (neighbours on it meet).
// The model, the analysis and JSTS run in one clean context (one JavaScript realm, as in the page).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { ctx, parse, ROOT, vm } = require('../../harness');
const W = vm.createContext({ console, setTimeout, TextDecoder });
W.window = W;
vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/config.js'), 'utf8') + '\n;this.APP_INFO=APP_INFO;this.APP_SETTINGS=APP_SETTINGS;', W);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'tools/node_modules/jsts/dist/jsts.min.js'), 'utf8'), W);
const MODS = { 'src/core.js': 'AX', 'src/model.js': 'MODEL', 'src/ifp.js': 'IFP', 'src/aip.js': 'AIP', 'src/analysis.js': 'ANALYSIS' };
Object.keys(MODS).forEach((f) => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8') + '\n;this.' + MODS[f] + '=' + MODS[f] + ';', W, { filename: f }));
W.MODEL.setDict(JSON.parse(fs.readFileSync(path.join(ROOT, 'data/aixm_dictionary.json'), 'utf8')));
const AX = ctx.AX, M = W.MODEL;
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ' ' + a + ' vs ' + b);

let ds;
test.before(async () => { ds = await parse(path.join(ROOT, 'testdata/airspace_test_EADD.xml')); M.setGeomEngine(W.jsts); });
const asp = (des) => ds.byType.Airspace.find((r) => r.cur.p.designator === des);
const outer = (g) => (g.t === 'M' ? g.parts[0] : g).c[0];
function toRing(p, ring) { // NM from p to the polyline (local plane)
  let best = Infinity;
  for (let i = 0; i + 1 < ring.length; i++) {
    const k = Math.cos(p[1] * Math.PI / 180), a = ring[i], b = ring[i + 1], ax = (a[0] - p[0]) * k, ay = a[1] - p[1], dx = (b[0] - a[0]) * k, dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy) * 60);
  }
  return best;
}

test('WGS-84: direct and inverse problems match GeographicLib to a millimetre', () => {
  [[52.0, -31.5, 30, 123, 53.7604834642, -29.7731116872], [25.17, 51.64, 1.79, 20, 25.5041990151, 51.6515083836], [-33.9, 151.2, 250, 1500, -38.7335977125, 120.6947448643], [0, 0, 90, 0.5, 0, 0.0083183995]]
    .forEach(([lat, lon, az, d, lat2, lon2]) => { const p = AX.geoDest(lon, lat, az, d); near(p[1], lat2, 1e-8, 'latitude'); near(p[0], lon2, 1e-8, 'longitude'); });
  [[[-31.5, 52.0], [-29.8, 53.5], 109.379384081, 33.842083284, 35.195439275], [[49.778614, 26.497519], [51.2, 28.4], 136.795765116, 33.359640757, 34.014953201], [[-0.45, 51.47], [-73.78, 40.64], 2999.680700976, 287.985348141, 231.379232821]]
    .forEach(([a, b, d, a1, a2]) => { const r = AX.geoInv(a, b); near(r.d, d, 1e-6, 'distance'); near(r.a1, a1, 1e-7, 'bearing at a'); near(r.a2, a2, 1e-7, 'bearing at b'); });
});

test('arcs: every point on the ellipsoid circle, chords within 0.005 NM of it', () => {
  const c = [49.778614, 26.497519], pts = AX.arcPts(c, 123, 10, 80, true);
  pts.forEach((p) => near(AX.geoDist(c, p), 123, 1e-6, 'radius'));
  for (let i = 1; i < pts.length; i++) {
    const m = [(pts[i - 1][0] + pts[i][0]) / 2, (pts[i - 1][1] + pts[i][1]) / 2];
    assert.ok(123 - AX.geoDist(c, m) <= AX.GEO_TOL_NM, 'chord ' + i + ' sags ' + (123 - AX.geoDist(c, m)));
  }
  near(AX.geoBearing(c, pts[0]), 10, 1e-6); near(AX.geoBearing(c, pts[pts.length - 1]), 80, 1e-6);
  assert.ok(pts.length > 60 && pts.length < 100, 'about one point per degree on a 123 NM arc: ' + pts.length);
  assert.equal(AX.circlePts([0, 50], 3).length, 121, 'small circles: every 3 degrees as before');
});

test('geodesic lines: points added so that straight lines on the map and in degrees follow the curve of the earth', () => {
  const a = [-33.2, 53.5], b = [-29.8, 53.5], line = AX.densify([a, b]);
  assert.ok(line.length > 4, 'a 120 NM east-west line at 53.5 N needs points: ' + line.length);
  const inv = AX.geoInv(a, b);
  for (let i = 1; i < 200; i++) { // points of the true geodesic, and the drawn line (in degrees and on the map)
    const p = AX.geoDest(a[0], a[1], inv.a1, inv.d * i / 200);
    assert.ok(toRing(p, line) <= AX.GEO_TOL_NM + 1e-4, 'geodesic point ' + i + ' is ' + toRing(p, line).toFixed(4) + ' NM from the drawn line');
  }
  assert.ok(toRing(AX.geoDest(a[0], a[1], inv.a1, inv.d / 2), [a, b]) > 0.2, 'drawn straight it would be off by more than 0.2 NM');
  assert.deepEqual(AX.densify([[0, 50], [0.1, 50.05]]).length, 2, 'short lines: no points added');
});

test('a boundary along a border (GeoBorder by urn:uuid): the border points between the junctions, in order', () => {
  const border = M.borderCurve(ds, 'urn:uuid:a1500000-0000-4000-8000-000000000001');
  assert.ok(border && border.length > 13, 'border curve found by the GeoBorder identifier');
  const fir = outer(M.geometry(ds, asp('EADT')));
  // the border's own vertices 3..9 (strictly between the junctions at 2 and 10) are on the FIR, in order
  const raw = [];
  for (let k = 0; k <= 12; k++) raw.push([-33.5 + k / 3, 50.5 + 0.12 * Math.sin(k)]);
  const idx = raw.slice(3, 10).map((p) => fir.findIndex((q) => Math.abs(q[0] - p[0]) < 1e-9 && Math.abs(q[1] - p[1]) < 1e-9));
  assert.ok(idx.every((i) => i >= 0), 'border vertices on the FIR: ' + idx);
  assert.ok(idx.every((i, j) => !j || Math.abs(i - idx[j - 1]) < 30), 'in order along the ring');
  assert.ok(!raw.slice(0, 2).concat(raw.slice(11)).some((p) => fir.some((q) => Math.abs(q[0] - p[0]) < 1e-9 && Math.abs(q[1] - p[1]) < 1e-9)), 'no border vertex outside the junctions');
  // the lower sector: its ring starts with the border link (the neighbours are found round the ring)
  const sec = outer(M.geometry(ds, asp('EADD-S')));
  raw.slice(4, 8).forEach((p) => assert.ok(toRing(p, sec) < 1e-6, 'border vertex on the sector'));
  assert.ok(sec[0][0] === sec[sec.length - 1][0] && sec[0][1] === sec[sec.length - 1][1], 'ring closed');
});

test('points held by designated points: a boundary vertex and an arc centre', () => {
  const r1 = outer(M.geometry(ds, asp('EADR1'))), tpt = M.pointOf(ds, ds.byType.DesignatedPoint.find((d) => d.cur.p.designator === 'TPT01'));
  assert.ok(r1.some((p) => p[0] === tpt[0] && p[1] === tpt[1]), 'the designated point is a vertex');
  const r2 = outer(M.geometry(ds, asp('EADR2'))), cen = [-30.0, 51.9];
  const onArc = r2.filter((p) => Math.abs(AX.geoDist(cen, p) - 10) < 1e-6);
  assert.ok(onArc.length > 20, 'the arc round the referenced centre is drawn: ' + onArc.length + ' points');
});

test('airspace built from other airspace: PART 2 minus part 1, part 1 plus part 2, the FIR shape of the UIR', () => {
  const J = W.jsts, gf = new J.geom.GeometryFactory();
  const area = (g) => { const x = M.toJsts(J, gf, g); return x.getArea(); };
  const p1 = M.geometry(ds, asp('EADD-TP1')), part2 = M.geometry(ds, asp('EADD-PT2')), p2 = M.geometry(ds, asp('EADD-TP2')), tma = M.geometry(ds, asp('EADD-TMA'));
  assert.ok(p2 && p2.asm && tma && tma.asm, 'part 2 and the TMA are assembled');
  near(area(p2), area(part2) - area(p1), area(part2) * 1e-6, 'part 2 = PART 2 minus part 1');
  near(M.overlay(J, M.toJsts(J, gf, p2), M.toJsts(J, gf, p1), 'INTERS').getArea(), 0, 1e-9, 'part 2 does not overlap part 1');
  near(area(tma), area(part2), area(part2) * 1e-6, 'TMA = part 1 + part 2 = the PART 2 square');
  assert.equal((p2.t === 'M' ? p2.parts : [p2]).reduce((n, x) => n + x.c.length - 1, 0), 1, 'part 2 has part 1 as a hole');
  const uir = M.geometry(ds, asp('EADU')), fir = M.geometry(ds, asp('EADT'));
  near(area(uir), area(fir), area(fir) * 1e-6, 'the UIR has the FIR shape');
  assert.deepEqual(JSON.parse(JSON.stringify(M.assembly(ds, asp('EADD-TP2')))), { steps: ['BASE EADD-PT2 (FULL_GEOMETRY)', 'SUBTR EADD-TP1 (FULL_GEOMETRY)'], notes: [] });
  // two volumes of one sector, at different levels: one outline
  assert.equal(M.geometry(ds, asp('EADD-QA')).t, 'A');
  assert.ok(M.needsEngine(ds));
});

test('vertical extent: own limits, a contributor\'s (FULL_GEOMETRY), own with a borrowed shape (HORZ_PROJECTION)', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(M.vband(ds, asp('EADD-S')))), { lo: 0, up: 24500 });
  assert.deepEqual(JSON.parse(JSON.stringify(M.vband(ds, asp('EADD-TMA')))), { lo: 1500, up: 19500 });
  assert.deepEqual(JSON.parse(JSON.stringify(M.vband(ds, asp('EADU')))), { lo: 24500, up: 66000 });
  assert.equal(M.vband(ds, asp('EADT')).up, Infinity, 'UNL');
  assert.equal(W.AIP.vertical(ds, asp('EADD-TMA')), 'FL 195 / 1500 FT AGL\nFL 195 / 2500 FT AMSL', 'the TMA shows the limits of its parts');
  const pcs = M.pieces(ds, asp('EADD-QA'), W.jsts);
  assert.deepEqual(JSON.parse(JSON.stringify(pcs.map((p) => [p.vb.lo, p.vb.up]))), [[0, 24500], [24500, 28500]], 'pieces keep their own levels');
});

test('airspace checks: the defects of the test data, nothing else', async () => {
  const iss = (await W.ANALYSIS.quality(ds)).filter((x) => x.rule === 'Airspace geometry');
  const got = Array.from(iss.map((x) => x.sev + ' ' + x.rec.cur.p.designator + ': ' + x.msg)).sort();
  assert.deepEqual(got, [
    'error EADR3: Arc of 20 NM ends 1.50 NM from the boundary point before it',
    'error EADR5: The boundary follows a border that is not in the data',
    'error EADR6: A boundary point held by another feature is not in the data',
    'warning EADD-S: SECTOR EADD-S DONLON TEST LOWER SECTOR and SECTOR EADD-SX DONLON TEST OVERLAPPING SECTOR overlap by 755 NM² at the same levels'
  ]);
  assert.match(iss.find((x) => /overlap/.test(x.msg)).detail, /both cover GND – FL195/);
  assert.match(iss.find((x) => /Arc/.test(x.msg)).detail, /21\.5 NM from the centre.*The map draws the arc through both points/);
});

test('a computed arc end 30 m from its coded point: the boundary goes through the coded point, no zigzag', () => {
  const r4 = outer(M.geometry(ds, asp('EADR4'))), J = W.jsts, gf = new J.geom.GeometryFactory();
  assert.ok(M.toJsts(J, gf, { t: 'A', c: [r4] }, true).isValid(), 'the outline does not cross itself');
  const D4 = [-29.3, 51.7], a = AX.geoDest(D4[0], D4[1], 300, 12 + 30 / 1852);
  assert.ok(r4.some((p) => Math.abs(p[0] - a[0]) < 1e-9 && Math.abs(p[1] - a[1]) < 1e-9), 'the coded point is kept');
  assert.ok(!r4.some((p) => Math.abs(AX.geoBearing(D4, p) - 300) < 1e-6 && Math.abs(AX.geoDist(D4, p) - 12) < 1e-6), 'the computed arc start is dropped');
});

test('an arc whose radius does not fit its points (20 NM coded, points at 21.5 NM): drawn through them, still reported', () => {
  const r3 = outer(M.geometry(ds, asp('EADR3'))), D3 = [-29.5, 52.4], arc = r3.filter((p) => AX.geoDist(D3, p) > 20);
  assert.ok(arc.length > 20, 'arc drawn: ' + arc.length + ' points');
  arc.forEach((p) => near(AX.geoDist(D3, p), 21.5, 1e-6, 'on the circle through the points'));
});

test('arcs between published points: airspace coding 123 NM and 130 NM between the same points shares one boundary', () => {
  // the points 131.34 NM and 130 NM from the centre (published); a sector codes the arc with 123 NM, a CTA with 130 NM
  const c = [-31.0, 52.0], p1 = AX.geoDest(c[0], c[1], 151.6, 131.34), p2 = AX.geoDest(c[0], c[1], 199.3, 130);
  const ring = (r) => AX.expandArcs([c, p1, ['arcc', c[0], c[1], r, 151.6, 199.3, true], p2, c], true, null);
  const arcOf = (pts) => pts.filter((p) => AX.geoDist(c, p) > 100), sec = arcOf(ring(123)), cta = arcOf(ring(130));
  [sec, cta].forEach((a) => {
    assert.deepEqual(Array.from(a[0]), Array.from(p1), 'starts on the published point');
    assert.deepEqual(Array.from(a[a.length - 1]), Array.from(p2), 'ends on the published point');
  });
  sec.forEach((p) => assert.ok(toRing(p, cta) < 0.001, 'the sector arc is on the CTA arc: ' + toRing(p, cta)));
  cta.forEach((p) => assert.ok(toRing(p, sec) < 0.001, 'the CTA arc is on the sector arc: ' + toRing(p, sec)));
  assert.ok(toRing(AX.geoDest(c[0], c[1], 175, 123), cta) > 6, 'as coded, 7 NM apart');
});

test('points up to 0.5 NM off a shared arc: the coded arc is kept, so the airspace on both sides of it meets', () => {
  // a 75 NM arc and its points (75.245, 74.995, 74.987 NM from the centre): inside, one arc from A to C; outside, two
  // airspaces from A to B and from B to C. Each through its own ends, they would leave slivers between them.
  const c = [-31.0, 52.0], at = (b, d) => AX.geoDest(c[0], c[1], b, d), A = at(20, 75.245), B = at(60, 74.995), C = at(100, 74.987);
  const arcs = [
    AX.expandArcs([c, A, ['arcc', c[0], c[1], 75, 20, 100, true], C, c], true, null),
    AX.expandArcs([A, ['arcc', c[0], c[1], 75, 20, 60, true], B, at(40, 90), A], true, null),
    AX.expandArcs([B, ['arcc', c[0], c[1], 75, 60, 100, true], C, at(80, 90), B], true, null)
  ].map((pts) => pts.filter((p) => Math.abs(AX.geoDist(c, p) - 75) < 1));
  const own = (a) => a.filter((p) => ![A, B, C].some((q) => q[0] === p[0] && q[1] === p[1]));
  arcs.forEach((a) => {
    assert.ok(a.length > 10, 'arc drawn');
    own(a).forEach((p) => near(AX.geoDist(c, p), 75, 1e-6, 'on the coded arc (not drawn through A, 0.245 NM off)'));
  });
  own(arcs[1]).concat(own(arcs[2])).forEach((p) => assert.ok(toRing(p, arcs[0]) < AX.GEO_TOL_NM, 'outside and inside meet: ' + toRing(p, arcs[0])));
  assert.ok(arcs[0].some((p) => p[0] === A[0] && p[1] === A[1]) && arcs[2].some((p) => p[0] === C[0] && p[1] === C[1]), 'the published points stay in the boundary');
});
