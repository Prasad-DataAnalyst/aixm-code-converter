// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Unit tests (node --test): flight and obstacle assessment (src/fltcalc.js) — take-off, approach, route, measure.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const C = require(path.join(__dirname, '..', '..', '..', 'src', 'fltcalc.js'));
const near = (a, b, e, m) => assert.ok(Math.abs(a - b) <= (e || 1e-6), (m || '') + ' ' + a + ' vs ' + b);
const O = [51.6, 25.25]; // a runway end (end of TODA), departing 090°T
const at = (s, x, top, id) => ({ id: id, c: C.dest(C.dest(O, 90, s), 180, x), elev: 10 + top }); // x: + to the right (south when flying east)

test('geometry: frame, projection along a path, corridor', () => {
  const F = C.frame(O), P = C.pathOf(F, [O, C.dest(O, 90, 5000), C.dest(C.dest(O, 90, 5000), 0, 5000)]);
  near(P.len, 10000, 0.5);
  const q = C.project(P, F.xy(C.dest(C.dest(O, 90, 2000), 180, 300)));
  near(q.s, 2000, 0.5, 's'); near(q.x, 300, 0.5, 'x right');
  const q2 = C.project(P, F.xy(C.dest(C.dest(O, 90, 5000), 0, 3000)));
  near(q2.s, 8000, 1, 'second leg');
  const ring = C.corridor(P, F, 5000, () => 200);
  assert.ok(C.inRing(C.dest(O, 90, 2500), ring) && !C.inRing(C.dest(C.dest(O, 90, 2500), 0, 400), ring));
});

test('take-off: Type A area, 1.2 % surface, shadow rule, net path, PANS-OPS gradient', () => {
  const obs = [at(1000, 0, 30, 'A'), at(1500, 50, 20, 'B'), at(3000, 0, 60, 'C'), at(2000, 1500, 500, 'far'), at(4000, -700, 55, 'side'), at(2000, 600, 80, 'D')];
  const r = C.takeoff(obs, { origin: O, elev: 10, track: 90, net: 0.016 });
  const by = Object.fromEntries(r.rows.map(x => [x.ob.id, x]));
  assert.equal(by.far, undefined, 'outside every area');
  // A: 30 m at 1 000 m: above 12 m (1.2 %) -> charted; B (20 m at 1 500 m) is under the shadow of A (30 m + 1.2 % beyond 1 000 m)
  assert.ok(by.A.charted && !by.A.shadow); near(by.A.pen, 18, 1e-3);
  assert.ok(by.B.shadow && !by.B.charted);
  // C: 60 m at 3 000 m: above the shadow of A (30 + 0.012 * 2000 = 54) -> charted
  assert.ok(by.C.charted);
  // required net gradient: (h + 35 ft - 35 ft) / s
  near(by.A.req, 0.03, 1e-6); near(by.C.req, 0.02, 1e-6);
  assert.equal(r.critical.ob.id, 'A'); assert.equal(r.netOk, false);
  near(by.A.netClr, 35 * 0.3048 + 0.016 * 1000 - 30, 1e-3);
  // 700 m to the left at 4 000 m: in the Type A area (90 + 0.125 * 4000 = 590 -> no) - out; in the PANS-OPS area (150 + tan 15° * 4000) -> yes
  assert.ok(!by.side.inA4 && !by.side.inA6 && by.side.inPO);
  // PANS-OPS: OIS 5 m + 2.5 %; PDG = (h - 5) / s + 0.8 %, at least 3.3 %
  assert.equal(by.C.pdg, null, 'C is below the 2.5 % surface (5 + 75 m)');
  assert.ok(by.D.inPO && !by.D.inA4 && !by.D.closeIn); near(by.D.pdg, (80 - 5) / 2000 + 0.008, 1e-4); assert.equal(r.pdg.ob.id, 'D');
  assert.ok(by.A.closeIn, 'A: 30 m above the DER, inside 60 m: close-in');
  const v = C.verdictTO(r); assert.equal(v.sev, 'error'); assert.match(v.txt, /NOT CLEAR.*3\.0 %/);
  const ok = C.takeoff([at(3000, 0, 20, 'low')], { origin: O, elev: 10, track: 90, net: 0.016 });
  assert.ok(ok.netOk); assert.equal(C.verdictTO(ok).sev, 'ok');
  // along a SID that turns north after 2 km: an obstacle on the turned path is found along it
  const sid = [O, C.dest(O, 90, 2000), C.dest(C.dest(O, 90, 2000), 0, 6000)];
  const t = C.takeoff([{ id: 'N', c: C.dest(C.dest(O, 90, 2000), 0, 3000), elev: 70 }], { origin: O, elev: 10, path: sid });
  near(t.rows[0].s, 5000, 2); near(t.rows[0].x, 0, 2);
  // the take-off climb surface (Annex 14, 2 % from 60 m): A penetrates by 30 - 0.02 * 940 -> TODA cut pen / 2 %
  const cut = C.climbSurfaceCut(r);
  assert.equal(cut.row.ob.id, 'A'); near(cut.cut, (30 - 0.02 * 940) / 0.02, 0.1);
});

test('approach: Annex 14 surface, glide path, displacement', () => {
  const thr = O, land = 270; // landing westbound onto the threshold at O; the approach area lies east of it
  const app = { ie: 280, d: 60, div: 0.15, l1: 3000, s1: 0.02, l2: 3600, s2: 0.025, lh: 8400 };
  const obs = [{ id: 'P', c: C.dest(thr, 90, 1060), elev: 10 + 30 }, { id: 'Q', c: C.dest(thr, 90, 2060), elev: 10 + 10 }, { id: 'side', c: C.dest(C.dest(thr, 90, 1060), 0, 400), elev: 200 }];
  const r = C.approach(obs, { thr: thr, elev: 10, course: land, gpa: 3, tch: 15, app: app });
  const by = Object.fromEntries(r.rows.map(x => [x.ob.id, x]));
  near(by.P.allowed, 20, 1e-3); near(by.P.pen, 10, 1e-3); near(by.P.displace, 500, 0.1);
  near(by.P.gpClr, 15 + 1060 * Math.tan(3 * Math.PI / 180) - 30, 1e-3);
  assert.ok(by.Q.pen < 0);
  assert.equal(by.side, undefined, 'outside the approach area (half width 140 + 0.15 * 1000 = 290 m)');
  assert.equal(r.worst.ob.id, 'P'); assert.equal(C.verdictAPP(r).sev, 'error');
  near(C.appAllowed(app, 60 + 3000 + 3600 + 100), 150, 1e-9); assert.equal(C.appAllowed(app, 30), null);
});

test('route: corridor, minimum safe altitude, airspace crossed', () => {
  const A = [55.0, 25.0], B = C.dest(A, 90, 100000);
  const pts = [{ c: A, name: 'A', alt: 3000 }, { c: B, name: 'B', alt: 3000 }];
  const obs = [{ id: 'mast', c: C.dest(C.dest(A, 90, 40000), 0, 3000), elev: 600 }, { id: 'far', c: C.dest(C.dest(A, 90, 40000), 0, 20000), elev: 2000 }];
  const r = C.route(pts, obs, { half: 5, clr: 1000 * 0.3048 });
  assert.equal(r.legs[0].hi.ob.id, 'mast'); assert.equal(r.legs[0].obstacles.length, 1);
  near(r.legs[0].msa, Math.ceil((600 + 304.8) / 0.3048 / 100) * 100 * 0.3048, 1e-6); assert.ok(r.legs[0].ok);
  // a restricted area 40 to 60 km along, 1 000 to 5 000 m: crossed inside; a danger area above the route: not
  const box = (s0, s1) => [C.dest(C.dest(A, 90, s0), 0, 5000), C.dest(C.dest(A, 90, s1), 0, 5000), C.dest(C.dest(A, 90, s1), 180, 5000), C.dest(C.dest(A, 90, s0), 180, 5000)].concat([C.dest(C.dest(A, 90, s0), 0, 5000)]);
  const x = C.crossings(pts, [{ id: 'R1', type: 'R', ring: box(40000, 60000), lo: 1000, up: 5000, state: 'on' }, { id: 'D1', type: 'D', ring: box(70000, 80000), lo: 4000, up: 9000 }]);
  assert.equal(x.length, 2);
  near(x[0].sIn, 40000, 2600); near(x[0].sOut, 60000, 2600); assert.equal(x[0].vertical, 'inside'); assert.equal(C.crossSev(x[0]), 'error');
  assert.equal(x[1].vertical, 'below'); assert.equal(C.crossSev(x[1]), 'info');
  assert.equal(C.crossSev({ hit: true, area: { type: 'P' } }), 'error');
  assert.equal(C.crossSev({ hit: true, area: { type: 'R', state: 'off' } }), 'info');
});

test('measure: 3D vector', () => {
  const v = C.vector({ c: O, h: 10 }, { c: C.dest(O, 45, 1000), h: 60 });
  near(v.d, 1000, 0.01); near(v.brg, 45, 0.01); near(v.dh, 50); near(v.grad, 0.05, 1e-5); near(v.slant, Math.hypot(1000, 50), 0.01);
  assert.equal(C.pct(0.0325), '3.3 %');
});

test('eTOD areas (Annex 15 / PANS-AIM): areas, collection surfaces, accuracy', () => {
  const a = O, b = C.dest(O, 90, 3000); // runway 3 000 m west -> east, strip ±150 m, 60 m beyond, CAT II/III landing at b
  const E = C.etod([{ name: '09/27', a: a, b: b, elA: 10, elB: 16, strip: 150, ext: 60, precB: true }], { arp: C.dest(O, 90, 1500) });
  assert.equal(E.areas.a2a.length, 1); assert.equal(E.areas.a2b.length, 2); assert.equal(E.areas.a4.length, 1); assert.ok(E.areas.a2c.length > 10);
  const pt = (s, x) => C.dest(C.dest(O, 90, s), 180, x);
  // on the strip, 100 m off the centre line, half way: 2a (also 3), surface 3 m above the runway there (13 + 3 m)
  let k = E.classify({ c: pt(1500, 100), elev: 20, hgt: 7 });
  assert.equal(k.sub, '2a'); assert.ok(k.also.includes('3') === false, '100 m: outside the 90 m of Area 3'); near(k.surf, 16, 0.05); assert.equal(k.need, true);
  k = E.classify({ c: pt(1500, 50), elev: 13.2 });
  assert.ok(k.also.includes('3')); assert.equal(k.strict, '3'); assert.equal(k.req.h, 0.5);
  // 2 000 m beyond the east end of 2a, on the centre line: 2b, 16 + 1.2 % * 2 000 = 40 m
  k = E.classify({ c: pt(3060 + 2000, 0), elev: 45 });
  assert.equal(k.sub, '2b'); near(k.surf, 40, 0.5); assert.equal(k.need, true);
  // 500 m before the east threshold? no: 500 m beyond the east end, on the centre line: Area 4 too (CAT II/III landing at b)
  k = E.classify({ c: pt(3500, 0), elev: 18 }); assert.ok(k.also.includes('4'));
  // 3 km north of the runway middle: 2c, from the edge of 2a at 1.2 %
  k = E.classify({ c: C.dest(C.dest(O, 90, 1500), 0, 3000), elev: 30 });
  assert.equal(k.sub, '2c'); near(k.surf, 13 + 0.012 * 2850, 0.5); assert.equal(k.need, false);
  // 30 km away: 2d (100 m above the ground); 60 km: Area 1
  k = E.classify({ c: C.dest(O, 0, 30000), elev: 150, hgt: 120 }); assert.equal(k.sub, '2d'); assert.equal(k.need, true);
  k = E.classify({ c: C.dest(O, 0, 60000), elev: 150, hgt: 80 }); assert.equal(k.sub, '1'); assert.equal(k.need, false); assert.equal(k.req.h, 50);
});
