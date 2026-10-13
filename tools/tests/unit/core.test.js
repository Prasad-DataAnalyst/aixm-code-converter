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

// FAA data (NASR AIXM 5.1 subscriber files, SAA AIXM 5.0 messages): the shapes met in the files of the FAA
test('FAA NASR: CRS83 is longitude first, like CRS84', () => {
  const xml = '<aixm:Navaid xmlns:aixm="http://www.aixm.aero/schema/5.1" xmlns:gml="http://www.opengis.net/gml/3.2" gml:id="NAVAID_1"><aixm:timeSlice><aixm:NavaidTimeSlice gml:id="t1">' +
    '<aixm:location><aixm:ElevatedPoint srsName="urn:ogc:def:crs:OGC:1.3:CRS83" gml:id="p1"><gml:pos>-176.674111 51.871231</gml:pos></aixm:ElevatedPoint></aixm:location>' +
    '</aixm:NavaidTimeSlice></aixm:timeSlice></aixm:Navaid>';
  const rec = AX.convFeature5(AX.parseXml(xml).c[0], { gmlP: { gml: true } });
  assert.deepEqual(Array.from(rec.ts[0].p.location._geo.c), [-176.674111, 51.871231]);
  assert.equal(rec.id, '#NAVAID_1');
  // EPSG:4326 stays latitude first
  const lat = AX.convFeature5(AX.parseXml(xml.replace('urn:ogc:def:crs:OGC:1.3:CRS83', 'urn:ogc:def:crs:EPSG::4326').replace('-176.674111 51.871231', '51.871231 -176.674111')).c[0], { gmlP: { gml: true } });
  assert.deepEqual(Array.from(lat.ts[0].p.location._geo.c), [-176.674111, 51.871231]);
});

test('FAA NASR: XPath links to a gml:id resolve like "#gml:id"', () => {
  assert.equal(AX.normRef("#/faa:SubscriberFile/faa:Member/aixm:TACAN%5B@gml:id='TACAN_0000001'%5D"), '#TACAN_0000001');
  assert.equal(AX.normRef("#/faa:SubscriberFile/aixm:AirportHeliport%5B@gml:id ='AH_0000001'%5D"), '#AH_0000001');
  assert.equal(AX.normRef("#xpointer(//aixm:Runway[@gml:id='RWY_1'])"), '#RWY_1');
  assert.equal(AX.normRef('#Airspace1'), '#Airspace1');
  assert.equal(AX.normRef('urn:uuid:9B43C079-CB07-4E84-A2F5-F9BB6A539DE2'), '9b43c079-cb07-4e84-a2f5-f9bb6a539de2');
  assert.equal(AX.normRef("#/x/aixm:Navaid%5B@gml:id='uuid.9b43c079-cb07-4e84-a2f5-f9bb6a539de2'%5D"), '9b43c079-cb07-4e84-a2f5-f9bb6a539de2');
});

test('FAA SAA (AIXM 5.0): default namespaces redeclared on each element', () => {
  const xml = '<Airspace xmlns="http://www.aixm.aero/schema/5.0" gml:id="Airspace1"><identifier xmlns="http://www.opengis.net/gml/3.2" codeSpace="x">9B43C079-CB07-4E84-A2F5-F9BB6A539DE2</identifier>' +
    '<timeSlice><AirspaceTimeSlice gml:id="ts1"><validTime xmlns="http://www.opengis.net/gml/3.2"><TimePeriod><beginPosition>2012-11-15T09:01:00Z</beginPosition><endPosition indeterminatePosition="unknown"/></TimePeriod></validTime>' +
    '<interpretation>BASELINE</interpretation><type>R</type><designator>R-4808N</designator><name>R-4808N LAS VEGAS</name>' +
    '<metaDataProperty xmlns="http://www.opengis.net/gml/3.2"><GenericMetaData/></metaDataProperty>' +
    '<responsibleOrganisation><AuthorityForAirspace><theOrganisationAuthority xlink:href="#OrganisationAuthority1" xmlns:xlink="http://www.w3.org/1999/xlink"/></AuthorityForAirspace></responsibleOrganisation>' +
    '</AirspaceTimeSlice></timeSlice></Airspace>';
  // the file declares GML as a default namespace somewhere: the file-wide prefix list alone would drop every property
  const rec = AX.convFeature5(AX.parseXml(xml).c[0], { gmlP: { gml: true, '': true } });
  const p = rec.ts[0].p;
  assert.equal(rec.id, '9b43c079-cb07-4e84-a2f5-f9bb6a539de2');
  assert.equal(rec.ts[0].b, '2012-11-15T09:01:00Z');
  assert.equal(p.type, 'R');
  assert.equal(p.designator, 'R-4808N');
  assert.equal(p.name, 'R-4808N LAS VEGAS');
  assert.equal(p.metaDataProperty, undefined);
  assert.equal(p.responsibleOrganisation.theOrganisationAuthority.ref, '#OrganisationAuthority1');
  // a self-closing element declaring a namespace does not leak it to its siblings
  const t = AX.parseXml('<a xmlns="http://www.aixm.aero/schema/5.0"><b xmlns="http://www.opengis.net/gml/3.2"/><c/></a>');
  assert.equal(t.c[0].c[0].g, 1); assert.equal(t.c[0].c[1].g, 2);
});

test('FAA SAA: the airspace type from the FAA suaType extension', () => {
  const xml = '<Airspace xmlns="http://www.aixm.aero/schema/5.0" gml:id="A1"><timeSlice><AirspaceTimeSlice gml:id="t"><interpretation>BASELINE</interpretation><designator>R4808N</designator>' +
    '<extension><AirspaceExtension xmlns="urn:us:gov:dot:faa:aim:saa:sua"><suaType>RA</suaType></AirspaceExtension></extension></AirspaceTimeSlice></timeSlice></Airspace>';
  const p = AX.convFeature5(AX.parseXml(xml).c[0], { gmlP: { gml: true } }).ts[0].p;
  assert.equal(p.type, 'R'); assert.equal(p._typeFrom, 'FAA suaType RA');
  const q = AX.convFeature5(AX.parseXml(xml.replace('<designator>', '<type>D</type><designator>')).c[0], { gmlP: { gml: true } }).ts[0].p;
  assert.equal(q.type, 'D', 'an AIXM type given is kept');
});
