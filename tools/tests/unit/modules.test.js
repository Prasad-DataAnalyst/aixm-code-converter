// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Unit tests (node --test) on the Donlon sample data: model, AIP, airport chart, Annex 14 surfaces,
// data integrity (CRC32Q) and the approach profile.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { ctx, parse, ROOT } = require('../../harness');
const { AIP, ADCHART, OLS, INTEGRITY, PROFILE } = ctx;

let base, changes;
test.before(async () => {
  base = await parse(path.join(ROOT, 'testdata/Donlon_ALL_Baseline_2025.xml'));
  changes = await parse(path.join(ROOT, 'testdata/Donlon_EADD_changes_AIRAC2611.xml'));
});
const eadd = (ds) => ds.byType.AirportHeliport.find((a) => /EADD/.test(JSON.stringify(a.cur.p.locationIndicatorICAO)));

test('Donlon baseline: features, State, AIRAC', () => {
  assert.equal(base.recs.length, 1028);
  assert.equal(base.state, 'REPUBLIC OF DONLON');
  assert.equal(base.airac.id, '2511');
});

test('AIP AD 2.12 lists the runway directions of EADD', () => {
  const sec = AIP.findSection(base, 'AD2.12:' + eadd(base).i);
  const rows = sec.build().blocks[0].rows.map((r) => r[0].t);
  ['09L', '09R', '27L', '27R'].forEach((d) => assert.ok(rows.includes(d), d + ' missing'));
});

test('airport chart model of EADD', () => {
  const m = ADCHART.of(base, eadd(base));
  assert.equal(m.runways.length, 2);
  assert.equal(m.twy.length > 50, true);
  const r = m.runways.find((x) => x.name === '09L/27R');
  assert.ok(Math.abs(r.lM - 3200) < 60, 'runway length about 3200 m, got ' + r.lM);
  assert.equal(ADCHART.tidy('4000.0 x 60.0 M'), '4000 x 60 M');
});

test('Annex 14 surfaces: code number, classification and penetrations', () => {
  assert.equal(OLS.codeNo(3200), 4);
  assert.equal(OLS.codeNo(1000), 2);
  const res = OLS.check(base, eadd(base));
  assert.equal(res.surfaces.runways.every((r) => r.code === 4 && r.type === 'P'), true);
  assert.equal(res.list.length, 5);
  assert.ok(res.list.every((p) => p.pen > 0 && p.top > p.allowed));
  // inner horizontal surface: 45 m above the elevation datum right next to the runway strip
  const S = res.surfaces, rm = S.runways[0].rm, p = ctx.AX.dest(rm.a[0], rm.a[1], rm.brg + 90, 1.2);
  const lim = OLS.limitAt(S, p);
  assert.equal(lim.surface, 'Inner horizontal');
  assert.ok(Math.abs(lim.h - (S.datum + 45)) < 1e-6);
});

test('CRC32Q check value and verification', () => {
  assert.equal(INTEGRITY.crc32q('123456789'), '3010BF7F');
  const list = INTEGRITY.items(base);
  assert.equal(list.length, 171);
  assert.equal(new Set(list.map((i) => i.key)).size, list.length, 'keys are unique');
  const csv = INTEGRITY.toCsv(list);
  assert.equal(INTEGRITY.verify(list, csv).same, list.length);
  const tampered = csv.replace(/;([0-9A-F]{8});/, ';00000000;');
  assert.equal(INTEGRITY.verify(list, tampered).changed.length, 1);
});

test('approach profile of the EADD approach', () => {
  const pr = changes.byType.InstrumentApproachProcedure[0];
  const P = PROFILE.data(changes, pr);
  assert.equal(JSON.stringify(P.fixes.map((f) => f.name + ':' + f.role)), '["DON:IAF","SCN:FAF"]'); // arrays from the vm context
  assert.equal(P.faf.dist, 2.4);
  assert.equal(P.mins.length, 1);
  const blocks = PROFILE.blocks(changes, pr);
  assert.equal(blocks[0].kind, 'chart');
  assert.match(blocks[0].svg, /<svg/);
  assert.match(blocks[0].svg, /FAF/);
});
