// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Unit tests (node --test): aerodrome mapping (AMDB) checks (src/amdb.js).
// - testdata/amdb_test_EAXB.xml (made by tools/make_amdb_testdata.js) has one or more defects for every rule:
//   every rule finds its defect, and the clean features of the file pass;
// - AIXM aerodrome features (Donlon) are checked as their AMXM counterparts, with their designators;
// - the local plane keeps distances to the millimetre.
// The checks run in a clean context with JSTS, as in the browser's worker (one JavaScript realm).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { ctx, parse, ROOT } = require('../../harness');
vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/amdb.js'), 'utf8') + ';this.AMDB=AMDB;', ctx, { filename: 'src/amdb.js' });
const W = vm.createContext({ console });
vm.runInContext(fs.readFileSync(path.join(ROOT, 'tools/node_modules/jsts/dist/jsts.min.js'), 'utf8'), W);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/amdb.js'), 'utf8') + ';this.AMDB=AMDB;', W, { filename: 'src/amdb.js' });
const dict = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/amxm_dictionary.json'), 'utf8'));
function check(features) { W.input = JSON.stringify({ f: features, d: dict }); return JSON.parse(vm.runInContext('var I = JSON.parse(input); JSON.stringify(AMDB.check(I.f, I.d))', W)); }
const count = (res) => { const by = {}; res.findings.forEach((x) => { by[x.r] = (by[x.r] || 0) + 1; }); return by; };

let eaxb, donlon;
test.before(async () => {
  eaxb = await parse(path.join(ROOT, 'testdata/amdb_test_EAXB.xml'));
  donlon = await parse(path.join(ROOT, 'testdata/Donlon_ALL_Baseline_2025.xml'));
});

test('every rule finds its defect on the test aerodromes', () => {
  const col = ctx.AMDB.collect([eaxb], ctx.MODEL), res = check(JSON.parse(JSON.stringify(col.features))), by = count(res);
  const rules = JSON.parse(JSON.stringify(ctx.AMDB.RULES)).map((r) => r.id);
  assert.equal(rules.length, 36);
  assert.deepEqual(rules.filter((id) => !by[id] && id !== 'AMDB-Q04'), []); // Q04: AIXM data only
  assert.ok(/JSTS/.test(res.engine));
  // the designated defects, by rule
  const msg = (id) => res.findings.filter((x) => x.r === id).map((x) => x.msg).join(' | ');
  assert.match(msg('AMDB-F01'), /threshold 27 is 7\.5 m from the nearest runway element/);
  assert.match(msg('AMDB-X08'), /TaxiwayElement A and RunwayElement 09\.27 overlap by 25\d\.\d m²/);
  assert.match(msg('AMDB-X09'), /gap of 4\.0\d m²/);
  assert.match(msg('AMDB-X02'), /does not end where it starts \(120\.0\d m apart\)/);
  assert.match(msg('AMDB-G06'), /"27\.09": the higher designator comes first/);
  assert.match(msg('AMDB-G10'), /hacc = 99999 is outside 0 – 9999\.99/);
  assert.match(msg('AMDB-Q01'), /declares 2 m; PANS-AIM requires 1 m \(critical data\)/);
  assert.match(msg('AMDB-F10'), /ConstructionArea is 15\.0 km/);
  // the clean runway, threshold 09, stand 1 and guidance line A have no finding (other than notes)
  const feat = (t, lab) => col.features.find((f) => f.t === t && f.label === lab);
  [feat('RunwayElement', '09.27'), feat('RunwayThreshold', '09'), feat('ParkingStandLocation', '1')].forEach((f) => {
    assert.deepEqual(res.findings.filter((x) => x.f === f.i && x.sev !== 'info').map((x) => x.r), []);
  });
});

test('AIXM aerodrome features are checked as their AMXM counterparts', () => {
  const col = ctx.AMDB.collect([donlon], ctx.MODEL), f = JSON.parse(JSON.stringify(col.features));
  const types = {}; f.forEach((x) => { types[x.t] = (types[x.t] || 0) + 1; });
  assert.ok(types.RunwayElement > 5 && types.TaxiwayGuidanceLine > 30 && types.RunwayThreshold === 4 && types.ParkingStandLocation > 10);
  const thr = f.filter((x) => x.t === 'RunwayThreshold').map((x) => x.a.idthr.v).sort();
  assert.deepEqual(thr, ['09L', '09R', '27L', '27R']);
  assert.ok(f.some((x) => x.t === 'RunwayElement' && x.a.idrwy && x.a.idrwy.v === '09L.27R'));
  const res = check(f), by = count(res);
  assert.equal(by['AMDB-F01'] || 0, 0, 'Donlon thresholds lie on their runways');
  assert.equal(by['AMDB-F02'] || 0, 0, 'Donlon threshold designators are runway designators');
  assert.equal(res.bySev.error, 0);
});

test('local plane: distances true to the millimetre at an aerodrome', () => {
  const P = ctx.AMDB.plane(-31, 51), a = 6378137, e2 = 0.00669437999014, rad = Math.PI / 180;
  // meridian arc 51°N -> 51.01°N by numerical integration of the meridian radius; parallel arc at 51°N
  const Mr = (f) => a * (1 - e2) / Math.pow(1 - e2 * Math.sin(f) ** 2, 1.5);
  let arc = 0; const n = 1000, h = 0.01 * rad / n;
  for (let i = 0; i < n; i++) arc += Mr(51 * rad + (i + 0.5) * h) * h;
  const par = a / Math.sqrt(1 - e2 * Math.sin(51 * rad) ** 2) * Math.cos(51 * rad) * 0.01 * rad;
  const N = P.fwd([-31, 51.01]), E = P.fwd([-30.99, 51]);
  assert.ok(Math.abs(N[1] - arc) < 0.001, N[1] + ' vs ' + arc);
  assert.ok(Math.abs(E[0] - par) < 0.001, E[0] + ' vs ' + par);
  const back = P.inv(P.fwd([-30.9876, 51.0123]));
  assert.ok(Math.abs(back[0] + 30.9876) < 1e-9 && Math.abs(back[1] - 51.0123) < 1e-9);
});
