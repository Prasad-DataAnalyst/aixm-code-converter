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
