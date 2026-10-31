// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Unit tests (node --test): obstacle assessment surfaces published with the procedures (src/model.js, src/aip.js) on
// testdata/ifp_oas_test_EADD.xml (made by tools/make_assessment_testdata.js, fictitious): every surface found in the
// designSurface of the legs and in a holding assessment, with its type, section, altitudes, slope, aircraft category,
// controlling obstacle and area; the procedure page lists the surfaces of its legs. Shown as published, not computed.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { ctx, parse, ROOT } = require('../../harness');
const M = ctx.MODEL, AIP = ctx.AIP;

let ds;
test.before(async () => { ds = await parse(path.join(ROOT, 'testdata/ifp_oas_test_EADD.xml')); });

test('every assessment surface of the legs and the holding, with its data as published', () => {
  const L = M.assessmentSurfaces(ds);
  assert.equal(L.length, 9);
  assert.deepEqual(Array.from(L.map((a) => a.r.k + ' ' + a.type + (a.sec ? ' ' + a.sec : ''))), ['IntermediateLeg PRIMARY', 'IntermediateLeg SECONDARY 1', 'IntermediateLeg SECONDARY 2',
    'FinalLeg FINAL', 'MissedApproachLeg SECTION_1_OCS 1', 'MissedApproachLeg SECTION_2_OCS 2', 'DepartureLeg DER', 'DepartureLeg OCS', 'HoldingAssessment PRIMARY']);
  const fin = L.find((a) => a.type === 'FINAL');
  assert.equal(fin.alt, 1100); assert.equal(fin.slope, 2.5); assert.deepEqual(Array.from(fin.cats), ['C']);
  assert.equal(fin.obst.length, 1);
  assert.equal(fin.obst[0].r.k, 'VerticalStructure'); assert.equal(fin.obst[0].controlling, true); assert.equal(fin.obst[0].min, '771 FT');
  const ocs = L.find((a) => a.type === 'OCS');
  assert.equal(ocs.alt, null); assert.equal(ocs.lo, 16); assert.equal(ocs.slope, 2.5);
  L.forEach((a) => {
    assert.ok(a.g && a.g.t === 'A', a.type + ': an area');
    const ring = a.g.c[0];
    assert.ok(ring.length === 5 && ring[0][0] === ring[4][0] && ring[0][1] === ring[4][1], a.type + ': closed ring of 4 corners');
  });
});

test('the procedure page lists the surfaces of its legs', () => {
  const iap = ds.byType.InstrumentApproachProcedure[0], sid = ds.byType.StandardInstrumentDeparture[0];
  const tab = (proc) => AIP.procDetail(ds, proc).find((b) => /Obstacle assessment surfaces/.test(b.title || ''));
  assert.equal(tab(iap).rows.length, 6);
  assert.equal(tab(iap).rows[3][1].t, 'FINAL'); assert.equal(tab(iap).rows[3][2].t, '1100 ft');
  assert.match(tab(iap).rows[3][5].t, /TEST MAST · controlling · min 771 FT · clearance 246 FT/);
  assert.equal(tab(sid).rows.length, 2);
  assert.equal(tab(sid).rows[1][3].t, '2.5 % from 16 ft');
});
