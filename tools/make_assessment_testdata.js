// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Makes testdata/ifp_oas_test_EADD.xml: fictitious instrument procedures at the Donlon sample aerodrome EADD (AIXM 5.1.1)
// with the obstacle assessment surfaces a procedure designer publishes with them (ObstacleAssessmentArea in the
// designSurface of the legs and in a HoldingAssessment): primary and secondary areas of the intermediate segment, the
// final approach surface with its controlling obstacle, two sections of the missed approach, the departure (DER and
// OCS) and a holding area. The tool shows and lists them; it does not compute them. The positions are computed on the
// WGS-84 ellipsoid (src/core.js). Not real data. NOT FOR NAVIGATION.
// Usage: node tools/make_assessment_testdata.js
const fs = require('fs');
const path = require('path');
const AX = require('../src/core.js');
const ROOT = path.join(__dirname, '..');
const EADD = '1b54b2d6-a5ff-4e57-94c2-f4047a381c64', ARP = [-31.94944444, 52.37166667];
const at = (c, brg, nm) => AX.geoDest(c[0], c[1], brg, nm);
const pos = (p) => p[1].toFixed(8) + ' ' + p[0].toFixed(8); // EPSG:4326: latitude first
const uid = (n) => 'b2500000-0000-4000-8000-' + String(n).padStart(12, '0');
let gid = 0;
const id = (k) => k + '.' + (++gid);
const members = [];
function member(kind, n, body) {
  members.push('  <message:hasMember>\n    <aixm:' + kind + ' gml:id="uuid.' + uid(n) + '"><gml:identifier codeSpace="urn:uuid:">' + uid(n) + '</gml:identifier><aixm:timeSlice><aixm:' + kind + 'TimeSlice gml:id="' + id('ts') + '">' +
    '<gml:validTime><gml:TimePeriod gml:id="' + id('tp') + '"><gml:beginPosition>2025-11-01T00:00:00Z</gml:beginPosition><gml:endPosition indeterminatePosition="unknown"/></gml:TimePeriod></gml:validTime>' +
    '<aixm:interpretation>BASELINE</aixm:interpretation><aixm:sequenceNumber>1</aixm:sequenceNumber><aixm:correctionNumber>0</aixm:correctionNumber>' + body + '</aixm:' + kind + 'TimeSlice></aixm:timeSlice></aixm:' + kind + '>\n  </message:hasMember>');
}
const href = (n) => 'xlink:href="urn:uuid:' + uid(n) + '"';
const point = (n, des, p) => member('DesignatedPoint', n, '<aixm:designator>' + des + '</aixm:designator><aixm:type>ICAO</aixm:type><aixm:location><aixm:Point gml:id="' + id('pt') + '" srsName="urn:ogc:def:crs:EPSG::4326"><gml:pos>' + pos(p) + '</gml:pos></aixm:Point></aixm:location>');
const segPoint = (tag, n) => '<aixm:' + tag + '><aixm:TerminalSegmentPoint gml:id="' + id('sp') + '"><aixm:pointChoice_fixDesignatedPoint ' + href(n) + '/></aixm:TerminalSegmentPoint></aixm:' + tag + '>';
// a quadrilateral: from a to b (bearing brg), half widths wa at a and wb at b
function quad(a, b, wa, wb, side) {
  const brg = AX.geoBearing(a, b), l = side ? [side === 'L' ? -1 : 1] : null;
  const pts = l ? [at(a, brg + 90 * l[0], wa[0]), at(b, brg + 90 * l[0], wb[0]), at(b, brg + 90 * l[0], wb[1]), at(a, brg + 90 * l[0], wa[1])]
    : [at(a, brg - 90, wa), at(b, brg - 90, wb), at(b, brg + 90, wb), at(a, brg + 90, wa)];
  return pts.concat([pts[0]]);
}
const surface = (ring) => '<aixm:surface><aixm:Surface gml:id="' + id('s') + '" srsName="urn:ogc:def:crs:EPSG::4326"><gml:patches><gml:PolygonPatch><gml:exterior><gml:LinearRing><gml:posList>' +
  ring.map(pos).join(' ') + '</gml:posList></gml:LinearRing></gml:exterior></gml:PolygonPatch></gml:patches></aixm:Surface></aixm:surface>';
const alt = (tag, v) => v === undefined ? '' : '<aixm:' + tag + ' uom="FT">' + v + '</aixm:' + tag + '>';
function oas(o) {
  return '<aixm:designSurface><aixm:ObstacleAssessmentArea gml:id="' + id('oas') + '"><aixm:type>' + o.type + '</aixm:type>' + (o.sec ? '<aixm:sectionNumber>' + o.sec + '</aixm:sectionNumber>' : '') +
    (o.slope !== undefined ? '<aixm:slope>' + o.slope + '</aixm:slope>' : '') + alt('assessedAltitude', o.alt) + alt('slopeLowerAltitude', o.lo) +
    (o.cat ? '<aixm:aircraftCategory><aixm:AircraftCharacteristic gml:id="' + id('ac') + '"><aixm:aircraftLandingCategory>' + o.cat + '</aixm:aircraftLandingCategory></aixm:AircraftCharacteristic></aixm:aircraftCategory>' : '') +
    (o.obst ? '<aixm:significantObstacle><aixm:Obstruction gml:id="' + id('ob') + '"><aixm:requiredClearance uom="FT">' + o.obst.clr + '</aixm:requiredClearance><aixm:minimumAltitude uom="FT">' + o.obst.min +
      '</aixm:minimumAltitude><aixm:controlling>YES</aixm:controlling><aixm:theVerticalStructure ' + href(o.obst.n) + '/></aixm:Obstruction></aixm:significantObstacle>' : '') +
    surface(o.ring) + '</aixm:ObstacleAssessmentArea></aixm:designSurface>';
}
const leg = (kind, n, from, to, procProp, proc, surfaces, extra) => member(kind, n, '<aixm:legTypeARINC>TF</aixm:legTypeARINC>' + segPoint('startPoint', from) + segPoint('endPoint', to) + (extra || '') +
  surfaces.map(oas).join('') + '<aixm:' + procProp + ' ' + href(proc) + '/>');

// approach from the west on course 090 to EADD
const MAPT = at(ARP, 270, 1.0), FAF = at(MAPT, 270, 5), IF = at(FAF, 270, 5), MA = at(ARP, 90, 6), DEP = at(ARP, 90, 8);
point(1, 'TOIF1', IF); point(2, 'TOFF1', FAF); point(3, 'TOMA1', MAPT); point(4, 'TOMH1', MA); point(5, 'TODP1', DEP);
const OB = at(FAF, 80, 2.2);
member('VerticalStructure', 6, '<aixm:name>TEST MAST</aixm:name><aixm:type>ANTENNA</aixm:type><aixm:lighted>YES</aixm:lighted><aixm:part><aixm:VerticalStructurePart gml:id="' + id('vp') + '">' +
  '<aixm:verticalExtent uom="M">120</aixm:verticalExtent><aixm:horizontalProjection_location><aixm:ElevatedPoint gml:id="' + id('ep') + '" srsName="urn:ogc:def:crs:EPSG::4326"><gml:pos>' + pos(OB) +
  '</gml:pos><aixm:elevation uom="M">160</aixm:elevation></aixm:ElevatedPoint></aixm:horizontalProjection_location></aixm:VerticalStructurePart></aixm:part>');
member('InstrumentApproachProcedure', 10, '<aixm:designator>RNP 09 TEST</aixm:designator><aixm:name>TEST RNP APPROACH 09</aixm:name><aixm:approachType>RNAV</aixm:approachType><aixm:designCriteria>PANS_OPS</aixm:designCriteria>' +
  '<aixm:airportHeliport xlink:href="urn:uuid:' + EADD + '"/>' +
  '<aixm:flightTransition><aixm:ProcedureTransition gml:id="' + id('tr') + '"><aixm:type>FINAL</aixm:type>' +
  [11, 12, 13].map((n, i) => '<aixm:transitionLeg><aixm:ProcedureTransitionLeg gml:id="' + id('tl') + '"><aixm:seqNumberARINC>' + (i + 1) * 10 + '</aixm:seqNumberARINC><aixm:theSegmentLeg ' + href(n) + '/></aixm:ProcedureTransitionLeg></aixm:transitionLeg>').join('') +
  '</aixm:ProcedureTransition></aixm:flightTransition>');
// intermediate segment: primary area 2.5 NM and secondary areas 1.25 NM either side (MOC 500 ft)
leg('IntermediateLeg', 11, 1, 2, 'approach', 10, [
  { type: 'PRIMARY', alt: 2500, ring: quad(IF, FAF, 2.5, 1.45) },
  { type: 'SECONDARY', sec: 1, alt: 2500, ring: quad(IF, FAF, [2.5, 5], [1.45, 2.9], 'L') },
  { type: 'SECONDARY', sec: 2, alt: 2500, ring: quad(IF, FAF, [2.5, 5], [1.45, 2.9], 'R') }
], '<aixm:lowerLimitAltitude uom="FT">2500</aixm:lowerLimitAltitude><aixm:lowerLimitReference>MSL</aixm:lowerLimitReference>');
// final approach: the controlling obstacle sets the assessed altitude
leg('FinalLeg', 12, 2, 3, 'approach', 10, [
  { type: 'FINAL', alt: 1100, slope: 2.5, cat: 'C', obst: { n: 6, clr: 246, min: 771 }, ring: quad(FAF, MAPT, 1.45, 0.6) }
], '<aixm:lowerLimitAltitude uom="FT">1600</aixm:lowerLimitAltitude><aixm:lowerLimitReference>MSL</aixm:lowerLimitReference>');
// missed approach: two sections of the climb surface (2.5 %)
leg('MissedApproachLeg', 13, 3, 4, 'approach', 10, [
  { type: 'SECTION_1_OCS', sec: 1, slope: 2.5, lo: 200, ring: quad(MAPT, at(MAPT, 90, 3), 0.6, 1.5) },
  { type: 'SECTION_2_OCS', sec: 2, slope: 2.5, lo: 650, ring: quad(at(MAPT, 90, 3), MA, 1.5, 2.5) }
]);
// departure: the area from the departure end of the runway and the obstacle clearance surface (2.5 %)
const DER = at(ARP, 90, 1.0);
point(7, 'TODR1', DER);
member('StandardInstrumentDeparture', 20, '<aixm:designator>TEST1A</aixm:designator><aixm:designCriteria>PANS_OPS</aixm:designCriteria><aixm:airportHeliport xlink:href="urn:uuid:' + EADD + '"/>' +
  '<aixm:flightTransition><aixm:ProcedureTransition gml:id="' + id('tr') + '"><aixm:type>RWY</aixm:type><aixm:transitionLeg><aixm:ProcedureTransitionLeg gml:id="' + id('tl') + '"><aixm:seqNumberARINC>10</aixm:seqNumberARINC><aixm:theSegmentLeg ' + href(21) + '/></aixm:ProcedureTransitionLeg></aixm:transitionLeg></aixm:ProcedureTransition></aixm:flightTransition>');
leg('DepartureLeg', 21, 7, 5, 'departure', 20, [
  { type: 'DER', lo: 16, ring: quad(DER, at(DER, 90, 0.3), 0.08, 0.13) },
  { type: 'OCS', slope: 2.5, lo: 16, ring: quad(at(DER, 90, 0.3), DEP, 0.13, 1.9) }
]);
// a holding area at the initial fix, assessed at 3000 ft
member('HoldingAssessment', 30, '<aixm:upperLimit uom="FL">140</aixm:upperLimit><aixm:lowerLimit uom="FT">3000</aixm:lowerLimit>' +
  oas({ type: 'PRIMARY', alt: 3000, ring: quad(at(IF, 0, 1), at(IF, 270, 6), 3.5, 3.5) }).replace(/designSurface>/g, 'obstacleAssessment>') +
  '<aixm:holdingPoint><aixm:SegmentPoint gml:id="' + id('hp') + '"><aixm:pointChoice_fixDesignatedPoint ' + href(1) + '/></aixm:SegmentPoint></aixm:holdingPoint>');

const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<!-- Fictitious obstacle assessment surfaces at the Donlon sample aerodrome EADD, made by tools/make_assessment_testdata.js (AIXM Code Converter). Not real data. NOT FOR NAVIGATION. -->\n' +
  '<message:AIXMBasicMessage xmlns:message="http://www.aixm.aero/schema/5.1.1/message" xmlns:gml="http://www.opengis.net/gml/3.2" xmlns:aixm="http://www.aixm.aero/schema/5.1.1" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" gml:id="OAS_TEST">\n' +
  members.join('\n') + '\n</message:AIXMBasicMessage>\n';
fs.writeFileSync(path.join(ROOT, 'testdata/ifp_oas_test_EADD.xml'), xml);
console.log('testdata/ifp_oas_test_EADD.xml', members.length, 'features', xml.length, 'bytes');
