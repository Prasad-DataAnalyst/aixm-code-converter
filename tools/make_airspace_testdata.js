// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Makes testdata/airspace_test_EADD.xml: fictitious airspace near Donlon (AIXM 5.1.1) with the geometry cases the
// map and the airspace checks must get right: a boundary that follows a border (GeoBorder by urn:uuid, also as the
// first curve of a ring), points and an arc centre held by designated points (gml:pointProperty xlink:href),
// airspace built from other airspace (PART 2 minus part 1, part 1 plus part 2, a UIR on the FIR's shape), lower and
// upper sectors stacked, a sector made of two volumes at different levels, and known defects (an arc that misses its
// points by 1.5 NM, a border and a point that are not in the data, two sectors overlapping at the same levels).
// The positions are computed on the WGS-84 ellipsoid (src/core.js). Not real data. NOT FOR NAVIGATION.
// Usage: node tools/make_airspace_testdata.js
const fs = require('fs');
const path = require('path');
const AX = require('../src/core.js');
const ROOT = path.join(__dirname, '..');
const at = (c, brg, nm) => AX.geoDest(c[0], c[1], brg, nm);
const pos = (p) => p[1].toFixed(9) + ' ' + p[0].toFixed(9); // EPSG:4326: latitude first
const uid = (n) => 'a1500000-0000-4000-8000-' + String(n).padStart(12, '0');
let gid = 0;
const id = (k) => k + '.' + (++gid);
const members = [];
const valid = '<gml:validTime><gml:TimePeriod gml:id="' + 'TP' + '"><gml:beginPosition>2026-01-22T00:00:00Z</gml:beginPosition><gml:endPosition indeterminatePosition="unknown"/></gml:TimePeriod></gml:validTime><aixm:interpretation>BASELINE</aixm:interpretation><aixm:sequenceNumber>1</aixm:sequenceNumber><aixm:correctionNumber>0</aixm:correctionNumber>';
function vt() { return valid.replace('"TP"', '"' + id('tp') + '"'); }
function member(kind, n, body) {
  members.push('  <message:hasMember>\n    <aixm:' + kind + ' gml:id="uuid.' + uid(n) + '">\n      <gml:identifier codeSpace="urn:uuid:">' + uid(n) + '</gml:identifier>\n      <aixm:timeSlice>\n        <aixm:' + kind + 'TimeSlice gml:id="' + id('ts') + '">' + vt() + body + '</aixm:' + kind + 'TimeSlice>\n      </aixm:timeSlice>\n    </aixm:' + kind + '>\n  </message:hasMember>');
}
// segments of a ring (each its own curve member)
const geod = (pts) => '<gml:GeodesicString><gml:posList>' + pts.map(pos).join(' ') + '</gml:posList></gml:GeodesicString>';
const geodWith = (items) => '<gml:GeodesicString>' + items.map((x) => typeof x === 'string' ? '<gml:pointProperty xlink:href="urn:uuid:' + x + '"/>' : '<gml:pos>' + pos(x) + '</gml:pos>').join('') + '</gml:GeodesicString>';
// EPSG:4326: angles from north towards east (bearings); end above start = clockwise
const arc = (c, r, a1, a2) => '<gml:ArcByCenterPoint numArc="1">' + (typeof c === 'string' ? '<gml:pointProperty xlink:href="urn:uuid:' + c + '"/>' : '<gml:pos>' + pos(c) + '</gml:pos>') +
  '<gml:radius uom="[nmi_i]">' + r + '</gml:radius><gml:startAngle uom="deg">' + a1 + '</gml:startAngle><gml:endAngle uom="deg">' + a2 + '</gml:endAngle></gml:ArcByCenterPoint>';
const circle = (c, r) => '<gml:CircleByCenterPoint numArc="1"><gml:pos>' + pos(c) + '</gml:pos><gml:radius uom="[nmi_i]">' + r + '</gml:radius></gml:CircleByCenterPoint>';
const curve = (seg) => '<gml:curveMember><gml:Curve gml:id="' + id('c') + '"><gml:segments>' + seg + '</gml:segments></gml:Curve></gml:curveMember>';
const border = (n) => '<gml:curveMember xlink:href="urn:uuid:' + uid(n) + '"/>';
const surface = (members) => '<aixm:horizontalProjection><aixm:Surface gml:id="' + id('s') + '" srsName="urn:ogc:def:crs:EPSG::4326"><gml:patches><gml:PolygonPatch><gml:exterior><gml:Ring>' + members.join('') + '</gml:Ring></gml:exterior></gml:PolygonPatch></gml:patches></aixm:Surface></aixm:horizontalProjection>';
const lim = (v) => { const m = /^(FL)?(\d+|UNL|GND)(?: (FT))?(?: (MSL|SFC))?$/.exec(v); return m[1] ? ['FL', m[2], 'STD'] : m[2] === 'GND' ? ['FT', '0', 'SFC'] : m[2] === 'UNL' ? ['OTHER', 'UNL', 'STD'] : ['FT', m[2], m[4] || 'MSL']; };
function volume(up, lo, inner) {
  const u = lim(up), l = lim(lo);
  return '<aixm:AirspaceVolume gml:id="' + id('av') + '"><aixm:upperLimit uom="' + u[0] + '">' + u[1] + '</aixm:upperLimit><aixm:upperLimitReference>' + u[2] + '</aixm:upperLimitReference>' +
    '<aixm:lowerLimit uom="' + l[0] + '">' + l[1] + '</aixm:lowerLimit><aixm:lowerLimitReference>' + l[2] + '</aixm:lowerLimitReference>' + inner + '</aixm:AirspaceVolume>';
}
const contributor = (dep, n) => '<aixm:contributorAirspace><aixm:AirspaceVolumeDependency gml:id="' + id('dep') + '"><aixm:dependency>' + dep + '</aixm:dependency><aixm:theAirspace xlink:href="urn:uuid:' + uid(n) + '"/></aixm:AirspaceVolumeDependency></aixm:contributorAirspace>';
const bareVolume = (inner) => '<aixm:AirspaceVolume gml:id="' + id('av') + '">' + inner + '</aixm:AirspaceVolume>';
function airspace(n, type, des, name, comps) {
  member('Airspace', n, '<aixm:type>' + type + '</aixm:type><aixm:designator>' + des + '</aixm:designator><aixm:name>' + name + '</aixm:name>' + comps.map((c, i) =>
    '<aixm:geometryComponent><aixm:AirspaceGeometryComponent gml:id="' + id('gc') + '"><aixm:operation>' + c[0] + '</aixm:operation><aixm:operationSequence>' + (i + 1) + '</aixm:operationSequence><aixm:theAirspaceVolume>' + c[1] + '</aixm:theAirspaceVolume></aixm:AirspaceGeometryComponent></aixm:geometryComponent>').join(''));
}
function point(n, des, p) {
  member('DesignatedPoint', n, '<aixm:designator>' + des + '</aixm:designator><aixm:type>ICAO</aixm:type><aixm:name>' + des + '</aixm:name><aixm:location><aixm:Point gml:id="' + id('pt') + '" srsName="urn:ogc:def:crs:EPSG::4326"><gml:pos>' + pos(p) + '</gml:pos></aixm:Point></aixm:location>');
}

// the border: west to east, a wiggle of about 7 NM
const B = []; for (let k = 0; k <= 12; k++) B.push([-33.5 + k / 3, 50.5 + 0.12 * Math.sin(k)]);
member('GeoBorder', 1, '<aixm:name>DONLON TEST BORDER</aixm:name><aixm:type>STATE</aixm:type><aixm:border><aixm:Curve gml:id="' + id('c') + '" srsName="urn:ogc:def:crs:EPSG::4326"><gml:segments>' + geod(B) + '</gml:segments></aixm:Curve></aixm:border>');
// FIR: north edge of 120 NM (drawn along the curve of the earth), south side along the border from vertex 2 to vertex 10
airspace(2, 'FIR', 'EADT', 'DONLON TEST FIR', [['BASE', volume('UNL', 'GND', surface([curve(geod([B[10], [-29.8, 53.5], [-33.2, 53.5], B[2]])), border(1)]))]]);
// a sector whose ring starts with the border link (the points round the ring are its neighbours)
const S = [B[8], [B[8][0], 51.5], [B[3][0], 51.5], B[3]];
airspace(3, 'SECTOR', 'EADD-S', 'DONLON TEST LOWER SECTOR', [['BASE', volume('FL245', 'GND', surface([border(1), curve(geod(S))]))]]);
// the upper sector over it (same shape, levels above): stacked, not an overlap
airspace(4, 'SECTOR', 'EADD-SU', 'DONLON TEST UPPER SECTOR', [['BASE', volume('FL660', 'FL245', surface([border(1), curve(geod(S))]))]]);
// a sector overlapping the lower sector at the same levels (defect)
const X0 = [B[5][0], 51.0], X1 = [B[7][0], 51.0], X2 = [B[7][0], 51.8], X3 = [B[5][0], 51.8];
airspace(5, 'SECTOR', 'EADD-SX', 'DONLON TEST OVERLAPPING SECTOR', [['BASE', volume('FL195', 'GND', surface([curve(geod([X0, X1, X2, X3, X0]))]))]]);
// a UIR on the FIR's shape, its own levels
airspace(6, 'UIR', 'EADU', 'DONLON TEST UIR', [['BASE', volume('FL660', 'FL245', contributor('HORZ_PROJECTION', 2))]]);
// TMA: part 1 a circle of 15 NM, PART 2 a square of 80 NM round it, part 2 = PART 2 minus part 1, TMA = part 1 + part 2
const C = [-31.5, 52.6];
airspace(10, 'TMA_P', 'EADD-TP1', 'DONLON TEST TMA PART 1', [['BASE', volume('FL195', '1500 FT SFC', surface([curve(circle(C, 15))]))]]);
const Q = [45, 135, 225, 315].map((b) => at(C, b, 40 * Math.SQRT2));
airspace(11, 'PART', 'EADD-PT2', 'PART 2', [['BASE', volume('FL195', '2500 FT MSL', surface([curve(geod([Q[0], Q[1], Q[2], Q[3], Q[0]]))]))]]);
airspace(12, 'TMA_P', 'EADD-TP2', 'DONLON TEST TMA PART 2', [['BASE', bareVolume(contributor('FULL_GEOMETRY', 11))], ['SUBTR', bareVolume(contributor('FULL_GEOMETRY', 10))]]);
airspace(13, 'TMA', 'EADD-TMA', 'DONLON TEST TMA', [['BASE', bareVolume(contributor('FULL_GEOMETRY', 10))], ['UNION', bareVolume(contributor('FULL_GEOMETRY', 12))]]);
// points held by designated points: a vertex, and the centre of an arc
const D = [-30.4, 52.2];
point(20, 'TPT01', at(D, 90, 12));
point(21, 'TARCC', D);
airspace(22, 'R', 'EADR1', 'DONLON TEST R1', [['BASE', volume('FL100', 'GND', surface([curve(geodWith([D, uid(20), at(D, 180, 12), D]))]))]]);
const D2 = [-30.0, 51.9];
point(23, 'TARC2', D2);
airspace(24, 'R', 'EADR2', 'DONLON TEST R2', [['BASE', volume('FL100', 'GND', surface([curve(geod([D2, at(D2, 0, 10)]) + arc(uid(23), 10, 0, 90) + geod([at(D2, 90, 10), D2]))]))]]);
// an arc that misses its points: radius 20 NM, the points 21.5 NM from the centre (defect)
const D3 = [-29.5, 52.4];
airspace(25, 'R', 'EADR3', 'DONLON TEST R3', [['BASE', volume('FL100', 'GND', surface([curve(geod([D3, at(D3, 0, 21.5)]) + arc(D3, 20, 0, 90) + geod([at(D3, 90, 21.5), D3]))]))]]);
// an arc whose computed ends are 30 m from the coded points (rounding): drawn through the coded points, not reported
const D4 = [-29.3, 51.7], r4 = 12, off = 30 / 1852;
airspace(26, 'R', 'EADR4', 'DONLON TEST R4', [['BASE', volume('FL100', 'GND', surface([curve(geod([D4, at(D4, 300, r4 + off)]) + arc(D4, r4, 300, 30) + geod([at(D4, 30, r4 - off), D4]))]))]]);
// a border and a point that are not in the data (defects)
airspace(27, 'R', 'EADR5', 'DONLON TEST R5', [['BASE', volume('FL100', 'GND', surface([curve(geod([[-34.5, 52.0], [-34.2, 52.3], [-34.0, 52.0]])), border(99), curve(geod([[-34.0, 52.0], [-34.5, 52.0]]))]))]]);
airspace(28, 'R', 'EADR6', 'DONLON TEST R6', [['BASE', volume('FL100', 'GND', surface([curve(geodWith([[-34.5, 52.6], uid(98), [-34.0, 52.6], [-34.2, 52.9], [-34.5, 52.6]]))]))]]);
// a sector of two volumes at different levels (lower part, and an upper part over another place), and a sector above
// the lower part: they meet at FL245 only, so no overlap
const E = (x0, y0, x1, y1) => geod([[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]);
airspace(30, 'SECTOR', 'EADD-QA', 'DONLON TEST SECTOR TWO LEVELS', [['BASE', volume('FL245', 'GND', surface([curve(E(-36.0, 53.0, -35.0, 53.6))]))], ['UNION', volume('FL285', 'FL245', surface([curve(E(-35.0, 53.0, -34.4, 53.6))]))]]);
airspace(31, 'SECTOR', 'EADD-QB', 'DONLON TEST SECTOR ABOVE', [['BASE', volume('UNL', 'FL245', surface([curve(E(-36.0, 53.0, -35.0, 53.6))]))]]);

const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<!-- Fictitious airspace test data near Donlon, made by tools/make_airspace_testdata.js (AIXM Code Converter). Not real data. NOT FOR NAVIGATION. -->\n' +
  '<message:AIXMBasicMessage xmlns:message="http://www.aixm.aero/schema/5.1.1/message" xmlns:gml="http://www.opengis.net/gml/3.2" xmlns:aixm="http://www.aixm.aero/schema/5.1.1" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" gml:id="AIRSPACE_TEST">\n' +
  members.join('\n') + '\n</message:AIXMBasicMessage>\n';
fs.writeFileSync(path.join(ROOT, 'testdata/airspace_test_EADD.xml'), xml);
console.log('testdata/airspace_test_EADD.xml', members.length, 'features', xml.length, 'bytes');
