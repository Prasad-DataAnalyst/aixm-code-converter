// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Unit tests (node --test): instrument flight procedure data (src/ifp.js) in AIXM 5.2 (testdata/ifp52_test_EADD.xml,
// read with the Donlon AIP data set it refers to) and AIXM 5.1 — altitudes, courses, speeds, PBN, design standard,
// magnetic variation, FAS data block, minima, runways, aerodrome, and the coding checks (Annex 11, PANS-OPS,
// EUROCONTROL IFP data set guidelines).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { ctx, parse, ROOT } = require('../../harness');
const { IFP, AIP, MODEL } = ctx;

let aip, ifp, ifp51;
const proc = (ds, k) => ds.byType[k][0];
const J = (x) => JSON.parse(JSON.stringify(x)); // values from the vm context
test.before(async () => {
  aip = await parse(path.join(ROOT, 'testdata/Donlon_ALL_Baseline_2025.xml'));
  ifp = await parse(path.join(ROOT, 'testdata/ifp52_test_EADD.xml'));
  ifp51 = await parse(path.join(ROOT, 'testdata/ifp_test_EADD.xml'));
  MODEL.setPeers(() => [aip, ifp, ifp51]);
});

test('AIXM 5.2 SID: legs, altitudes, courses, speed, RF data', () => {
  const sid = proc(ifp, 'StandardInstrumentDeparture'), legs = AIP.procLegs(ifp, sid).map((x) => x.leg.cur.p);
  assert.deepEqual(J(legs.map((p) => MODEL.s(p.legTypeARINC))), ['CA', 'DF', 'RF', 'TF']);
  assert.equal(IFP.alt(legs[0]).txt, 'at or above 700 FT AMSL at the end');
  assert.equal(IFP.alt(legs[1]).txt, 'between 3000 FT AMSL and 5000 FT AMSL at the end');
  assert.ok(Math.abs(IFP.alt(legs[1]).lowM - 914.4) < 0.1);
  assert.equal(IFP.course(legs[0]), '268°M');
  assert.equal(IFP.course(legs[3]), '117.6°T / 122°M');
  assert.equal(IFP.speed(legs[3]), 'max 250 KT IAS');
  assert.deepEqual(J(IFP.point(legs[1].endPoint)), { role: '', flyOver: 'YES', waypoint: 'YES', reporting: '', radar: '', facf: '' });
  assert.equal(IFP.pbnText(sid.cur.p), 'RNAV 1');
  assert.equal(IFP.design(sid.cur.p), 'PANS OPS 7TH EDITION');
  assert.equal(IFP.magVar(sid.cur.p), '4° W (2020)');
  assert.equal(MODEL.s(IFP.aerodrome(ifp, sid).r.cur.p.locationIndicatorICAO), 'EADD');
  assert.deepEqual(J(IFP.runways(ifp, sid).map((o) => MODEL.s(o.r.cur.p.designator))), ['27R']);
  assert.deepEqual(J(IFP.checks(ifp, sid, AIP.procLegs(ifp, sid))), []);
});

test('AIXM 5.2 approach: FAS data block, minima, no finding', () => {
  const iap = proc(ifp, 'InstrumentApproachProcedure'), legs = AIP.procLegs(ifp, iap), fin = legs.find((x) => x.leg.k === 'FinalLeg').leg;
  const f = IFP.fas(fin);
  assert.equal(f.apd, '0'); assert.equal(f.rpi, 'E09Z'); assert.equal(f.gpa, '3.00'); assert.equal(f.crc, '1A2B3C4D'); assert.deepEqual(J(f.ltp), ['52.3683889', '-32.0402222']);
  const cond = [].concat(fin.cur.p.condition)[0], m = IFP.minima([].concat(cond.minimumSet)[0]);
  assert.equal(m.alt, 'DA 450 FT'); assert.equal(m.hgt, 'DH 250 FT (THR)');
  assert.deepEqual(J(IFP.checks(ifp, iap, legs)), []);
});

test('coding errors are found', () => {
  const star = proc(ifp, 'StandardInstrumentArrival'), c = IFP.checks(ifp, star, AIP.procLegs(ifp, star));
  const has = (re, sev) => assert.ok(c.some((x) => re.test(x.msg) && (!sev || x.sev === sev)), 'missing ' + re + '\n' + c.map((x) => x.sev + ' ' + x.msg).join('\n'));
  has(/designator "KODAP12" does not follow/); has(/no aerodrome/, 'warning'); has(/transition KODAP without type/, 'warning');
  has(/VA: heading to an altitude without the altitude/, 'warning'); has(/RF: no arc centre/, 'warning'); has(/RF: no turn direction/, 'warning');
  has(/TF: needs an end fix/, 'warning'); has(/speed in KM_H/);
});

test('AIXM 5.1 procedures are read as before', () => {
  const iap = proc(ifp51, 'InstrumentApproachProcedure'), legs = AIP.procLegs(ifp51, iap).map((x) => x.leg.cur.p);
  assert.equal(IFP.alt(legs[0]).txt, 'at or above 4000 FT AMSL');
  assert.equal(IFP.alt(legs[1]).txt, 'at 3000 FT AMSL');
  assert.equal(IFP.pbnText(iap.cur.p), 'RNP APCH');
  assert.equal(IFP.design(iap.cur.p), 'PANS OPS');
  const f = IFP.fas(AIP.procLegs(ifp51, iap).find((x) => x.leg.k === 'FinalLeg').leg);
  assert.equal(f.apd, 'LPV'); assert.equal(f.crc, 'A1B2C3D4');
  assert.equal(IFP.PT.RF, 'Constant radius arc to a fix'); assert.equal(Object.keys(IFP.PT).length, 23);
});
