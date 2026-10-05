// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Unit tests (node --test): parser core, geodesy, AIRAC, time handling.
const test = require('node:test');
const assert = require('node:assert/strict');
const { ctx } = require('../../harness');
const AX = ctx.AX;

test('version sniffing', () => {
  const v51 = AX.sniff('<?xml version="1.0"?><message:AIXMBasicMessage xmlns:message="http://www.aixm.aero/schema/5.1/message" xmlns:aixm="http://www.aixm.aero/schema/5.1" xmlns:gml="http://www.opengis.net/gml/3.2">', 'a.xml');
  assert.equal(v51.family, '5');
  assert.equal(v51.version, '5.1');
  const v511 = AX.sniff('<message:AIXMBasicMessage xmlns:message="http://www.aixm.aero/schema/5.1.1/message" xmlns:aixm="http://www.aixm.aero/schema/5.1.1">', 'b.xml');
  assert.equal(v511.version, '5.1.1');
  const v45 = AX.sniff('<?xml version="1.0"?><AIXM-Snapshot xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" version="4.5" origin="x" created="2020-01-01T00:00:00" effective="2020-01-01T00:00:00">', 'c.xml');
  assert.equal(v45.family, '45');
});

test('AIXM times are UTC even without a zone', () => {
  assert.equal(AX.tms('2026-10-29T00:00:00'), Date.UTC(2026, 9, 29));
  assert.equal(AX.tms('2026-10-29T00:00:00Z'), Date.UTC(2026, 9, 29));
});

test('AIRAC cycle of a date', () => {
  assert.equal(AX.airac(Date.UTC(2026, 9, 1)).id, '2610');
  assert.equal(AX.airac(Date.UTC(2026, 9, 29)).id, '2611');
  assert.equal(AX.airac(Date.UTC(2026, 9, 29)).exact, true);
  // local midnight east of Greenwich: 16:00Z the evening before (UTC+8) is the next cycle, and still exact
  const cn = AX.airac(Date.UTC(2026, 9, 28, 16));
  assert.equal(cn.id, '2611'); assert.equal(cn.exact, true); assert.equal(cn.date, Date.UTC(2026, 9, 29));
  assert.equal(AX.airac(Date.UTC(2026, 9, 28, 10)).id, '2611');             // UTC+14
  assert.equal(AX.airac(Date.UTC(2026, 9, 28, 9, 59)).id, '2610');          // more than 14 h before: previous cycle
  assert.equal(AX.airac(Date.UTC(2026, 9, 28, 16, 7)).exact, false);        // not a whole quarter hour
  assert.equal(AX.airac(Date.UTC(2026, 9, 29, 5)).id, '2611');              // west of Greenwich: the same day
});

test('geodesy: destination, distance and bearing agree', () => {
  const a = [39.17, 21.68], b = AX.dest(a[0], a[1], 160, 12);
  assert.ok(Math.abs(AX.distNM(a, b) - 12) < 1e-6);
  assert.ok(Math.abs(AX.bearing(a, b) - 160) < 0.01);
  assert.equal(AX.toNM(1852, 'M').toFixed(4), '1.0000');
});

test('DMS formatting', () => {
  assert.equal(AX.fmtPos([-31.9493, 52.3717], 0), '522218N 0315657W');
});

test('geometry signature: same shape same signature, any change or re-nesting differs', () => {
  const a = { t: 'A', c: [[[46.1, 24.2], [46.3, 24.2], [46.3, 24.4], [46.1, 24.2]]] };
  const same = { t: 'A', c: [[[46.1000000001, 24.2], [46.3, 24.2], [46.3, 24.4], [46.1, 24.2]]] };
  const moved = { t: 'A', c: [[[46.1, 24.2], [46.3, 24.200002], [46.3, 24.4], [46.1, 24.2]]] };
  const nested = { t: 'A', c: [[[46.1, 24.2], [46.3, 24.2]], [[46.3, 24.4], [46.1, 24.2]]] };
  assert.equal(AX.geoSig(a), AX.geoSig(same));
  assert.notEqual(AX.geoSig(a), AX.geoSig(moved));
  assert.notEqual(AX.geoSig(a), AX.geoSig(nested));
  assert.match(AX.geoSig(a), /^A:4pts:[0-9a-f]{8}$/);
  assert.equal(AX.geoSig({ t: 'P', c: [46.1, 24.2] }), '24.200000,46.100000');
});
