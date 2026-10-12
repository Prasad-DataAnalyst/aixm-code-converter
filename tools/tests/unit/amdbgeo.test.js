// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Unit tests (node --test): the State's charts placed on the map (src/amdbgeo.js) and fit for use (src/amdbq.js).
// - a similarity is found again from its points; the robust fit keeps the words beside their points and leaves out
//   a table of the same numbers and words at random;
// - runways drawn as bars are found in a picture (not the text, not a building), their ends; the bars matched to the
//   runways of the data, either way round, give the chart's scale and rotation;
// - fit for use: declared, estimated, published by the State (its resolution), OpenStreetMap, ICAO Annex 14 layout;
// - measured against a reference: points and lines, what the reference lacks.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..', '..', '..');
const ctx = vm.createContext({ console });
vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/amdb.js'), 'utf8') + ';this.AMDB=AMDB;', ctx, { filename: 'src/amdb.js' });
global.AMDB = ctx.AMDB;
global.AMDBDOC = require(path.join(ROOT, 'src/amdbdoc.js'));
const G = require(path.join(ROOT, 'src/amdbgeo.js'));
const Q = require(path.join(ROOT, 'src/amdbq.js'));
const O = [52.36, -31.97], P = ctx.AMDB.plane(O[0], O[1]);
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

test('a similarity found again from its points', () => {
  const T = { a: 1.2, b: 0.4, tx: -300, ty: 120 }, pts = [[10, -20], [300, -400], [700, -90], [50, -500]].map((q) => { const e = G.at(T, q[0], q[1]); return { x: q[0], y: q[1], E: e[0], N: e[1] }; });
  const F = G.lsq(pts);
  ['a', 'b', 'tx', 'ty'].forEach((k) => assert.ok(Math.abs(F[k] - T[k]) < 1e-9, k));
  const back = G.back(F, ...G.at(F, 123, -456));
  assert.ok(Math.abs(back[0] - 123) < 1e-9 && Math.abs(back[1] + 456) < 1e-9);
});

test('the robust fit keeps the words beside their points', () => {
  const s = 5000 * G.PT, th = 12 * Math.PI / 180, T = { a: s * Math.cos(th), b: s * Math.sin(th), tx: -400, ty: 300 }, known = [], labels = [];
  for (let i = 0; i < 30; i++) {
    const x = 100 + rnd() * 600, y = -(80 + rnd() * 450), c = P.inv(G.at(T, x, y)), a = rnd() * 6.283;
    known.push({ id: String(100 + i), kind: 'std', c, name: 'stand ' + (100 + i) });
    labels.push({ t: String(100 + i), u: (x + 4 * Math.cos(a)) / 842, v: -(y + 4 * Math.sin(a)) / 595, h: 0.01, p: 1 });
  }
  for (let i = 0; i < 30; i++) labels.push({ t: String(100 + i), u: 760 / 842, v: (40 + i * 12) / 595, h: 0.01, p: 1 }); // the table
  for (let i = 0; i < 40; i++) labels.push({ t: String(100 + Math.floor(rnd() * 30)), u: rnd(), v: rnd(), h: 0.01, p: 1 }); // words at random
  const d = { pagePt: { 1: [842, 595] }, labels };
  const r = G.robust(G.candidates(d, 1, known, O), []);
  assert.equal(r.inl.length, 30);
  assert.ok(Math.abs(r.scale - 5000) <= 100, 'scale ' + r.scale);
  assert.ok(Math.abs(r.rot - 12) < 0.6, 'rotation ' + r.rot);
  assert.ok(r.rms < 8, 'rms ' + r.rms);
});

// a picture: two runways drawn as bars 12 pixels wide, a building, text strokes and a frame
function picture(W, H) {
  const px = new Uint8ClampedArray(W * H * 4).fill(255);
  const ink = (x, y) => { if (x >= 0 && y >= 0 && x < W && y < H) { const i = (y * W + x) * 4; px[i] = px[i + 1] = px[i + 2] = 0; } };
  const bar = (x0, y0, x1, y1, w) => { const L = Math.hypot(x1 - x0, y1 - y0), ux = (x1 - x0) / L, uy = (y1 - y0) / L; for (let t = 0; t <= L; t += 0.5) for (let k = -w / 2; k <= w / 2; k += 0.5) ink(Math.round(x0 + ux * t - uy * k), Math.round(y0 + uy * t + ux * k)); };
  bar(300, 200, 900, 1100, 12); bar(700, 150, 1300, 1050, 12);
  for (let y = 600; y < 680; y++) for (let x = 1500; x < 1600; x++) ink(x, y); // a building
  for (let k = 0; k < 40; k++) bar(100 + k * 30, 1300, 110 + k * 30, 1320, 2); // text
  bar(10, 10, W - 10, 10, 2); bar(10, 10, 10, H - 10, 2); // the frame
  return { width: W, height: H, data: px };
}

test('runways drawn as bars: found, their ends, matched to the runways', () => {
  const W = 2000, H = 1414, B = G.bars(picture(W, H));
  assert.equal(B.length, 2, JSON.stringify(B));
  const ends = B.map((b) => [b.a, b.b].map((q) => [q[0] * W, q[1] * H]).sort((p, q) => p[1] - q[1]));
  const want = [[[300, 200], [900, 1100]], [[700, 150], [1300, 1050]]];
  want.forEach((w) => { const e = ends.filter((x) => Math.abs(x[0][0] - w[0][0]) < 20)[0]; assert.ok(e, 'bar at ' + w[0]); [0, 1].forEach((k) => assert.ok(Math.hypot(e[k][0] - w[k][0], e[k][1] - w[k][1]) < 6, 'end ' + JSON.stringify(e[k]) + ' for ' + JSON.stringify(w[k]))); });
  // the runways of the data where a 1 : 20 000 chart (page 1191 x 842 points, not turned) puts the bars
  const pt = [1191, 842], s = 20000 * G.PT, T = { a: s, b: 0, tx: -6000, ty: 4000 };
  const onMap = (px2) => P.inv(G.at(T, px2[0] / W * pt[0], -px2[1] / H * pt[1]));
  const R = want.map((w, i) => ({ id: ['09L/27R', '09R/27L'][i], ends: [onMap(w[1]), onMap(w[0])], len: Math.hypot(...[0, 1].map((k) => P.fwd(onMap(w[1]))[k] - P.fwd(onMap(w[0]))[k])) }));
  const hyp = G.fromBars(B, R, pt, P, [4000, 100000, 150]);
  assert.ok(hyp.length >= 1);
  const F = G.lsq(hyp[0]), scale = Math.hypot(F.a, F.b) / G.PT, rot = Math.atan2(F.b, F.a) * 180 / Math.PI;
  assert.ok(Math.abs(scale - 20000) < 400, 'scale ' + scale);
  assert.ok(Math.abs(rot) < 0.5, 'rotation ' + rot);
});

test('fit for use: from what a feature declares or where it comes from', () => {
  const f = (t, src, a, g) => ({ t, a: Object.assign({ source: { v: src } }, a || {}), g: [g || { t: 'P', c: O }], src: 'AMXM' });
  const thr = f('RunwayThreshold', 'Generated from AIP data (x): geometry derived, coarse quality', { hacc: { v: '0.5' } });
  assert.equal(Q.status(Q.estimate(thr), Q.req('RunwayThreshold')), 'meets');
  const thr2 = f('RunwayThreshold', 'Generated from AIP data (x): geometry derived, coarse quality');
  assert.deepEqual([Q.estimate(thr2).kind, Q.status(Q.estimate(thr2), Q.req('RunwayThreshold'))], ['state', 'state']);
  const std = f('ParkingStandLocation', 'From the State\'s charts (c): stand position as published', { hres: { v: '0.0002777778' } }); // whole seconds: ±15 m
  assert.equal(Q.status(Q.estimate(std), Q.req('ParkingStandLocation')), 'not met');
  const std2 = f('ParkingStandLocation', 'From the State\'s charts (c): stand position as published', { hres: { v: '0.0000027778' } });
  assert.equal(Q.status(Q.estimate(std2), Q.req('ParkingStandLocation')), 'state');
  const trc = f('ParkingStandLocation', 'Digitised by the user on PDOK (CC BY 4.0) on 2026-10-12: position as seen on the imagery, est. accuracy ~0.2 m (three pixels) — indicative');
  assert.deepEqual([Q.estimate(trc).acc, Q.status(Q.estimate(trc), Q.req('ParkingStandLocation'))], [0.2, 'meets']);
  const osm = f('TaxiwayGuidanceLine', 'OpenStreetMap contributors (ODbL 1.0), way 1: taxiway centre line traced from imagery by volunteers, coarse quality', {}, { t: 'L', c: [O, [O[0] + 0.001, O[1]]] });
  assert.equal(Q.status(Q.estimate(osm), Q.req('TaxiwayGuidanceLine')), 'unknown');
  const hp = f('TaxiwayHoldingPosition', 'Inferred from AIP data (x): ICAO Annex 14 minimum, not published in the AIP — indicative');
  assert.equal(Q.status(Q.estimate(hp), Q.req('TaxiwayHoldingPosition')), 'not met');
  assert.equal(Q.status(Q.estimate(f('RunwayMarking', 'x')), Q.req('RunwayMarking')), 'n/a');
  const F = Q.fitness([thr, thr2, std, std2, trc, osm, hp]);
  assert.deepEqual([F.all.meets, F.all.state, F.all.unknown, F.all['not met']], [2, 2, 1, 2]);
  assert.deepEqual(F.survey.map((x) => x.t + ' ' + x.n).sort(), ['ParkingStandLocation 1', 'TaxiwayGuidanceLine 1', 'TaxiwayHoldingPosition 1']);
});

test('measured against a reference', () => {
  const at = (e, n) => P.inv([e, n]);
  const f = (t, g, src) => ({ t, ad: 'XXXX', a: { source: { v: src || 'survey' } }, g: [g], label: '' });
  const E = [f('ParkingStandLocation', { t: 'P', c: at(0, 0) }, 'From the State\'s charts (c): stand'), f('ParkingStandLocation', { t: 'P', c: at(100, 0) }, 'From the State\'s charts (c): stand'),
    f('TaxiwayGuidanceLine', { t: 'L', c: [at(0, 50), at(400, 50)] }, 'OpenStreetMap contributors'), f('TaxiwayGuidanceLine', { t: 'L', c: [at(0, 900), at(50, 900)] }, 'OpenStreetMap contributors')];
  const R = [f('ParkingStandLocation', { t: 'P', c: at(0.3, 0.4) }), f('ParkingStandLocation', { t: 'P', c: at(100, 1) }), f('ParkingStandLocation', { t: 'P', c: at(600, 600) }),
    f('TaxiwayGuidanceLine', { t: 'L', c: [at(0, 52), at(400, 52)] })];
  const M = Q.measure(E, R, 100), row = (t, L) => M.types.filter((x) => x.t === t && x.L === L)[0];
  const s = row('ParkingStandLocation', 'C'), l = row('TaxiwayGuidanceLine', 'O');
  assert.ok(Math.abs(s.mean - 0.75) < 0.01 && s.n === 2 && Math.abs(s.max - 1) < 0.01, JSON.stringify(s));
  assert.equal(s.lack, 1); // the reference's third stand
  assert.ok(Math.abs(l.mean - 2) < 0.01 && l.n === 1 && l.miss === 1, JSON.stringify(l));
});
