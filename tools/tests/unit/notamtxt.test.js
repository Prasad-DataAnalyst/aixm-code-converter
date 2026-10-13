// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Unit tests (node --test): NOTAM and AIP area text (src/notamtxt.js) — synthetic NOTAMs in the ICAO and FAA formats.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const N = require(path.join(__dirname, '..', '..', '..', 'src', 'notamtxt.js'));
const near = (a, b, e) => assert.ok(Math.abs(a - b) <= (e || 1e-6), a + ' vs ' + b);

const BRIEF = `
(A1234/26 NOTAMN
Q) XXXX/QOBCE/IV/M/AE/000/005/2515N05522E005
A) XXAA B) 2610010600 C) 2612312359 EST
E) CRANE ERECTED PSN 251530N 0552210E HGT 150FT AGL ELEV 180FT AMSL. LGTD AND MARKED.)

(A1240/26 NOTAMN
Q) XXXX/QRRCA/IV/BO/W/000/150/2600N05530E010
A) XXXX B) 2610100000 C) 2610102359
D) DAILY 0500-1700
E) RESTRICTED AREA XXR15 ACTIVATED.
F) GND G) FL150)

(B0077/26 NOTAMN
Q) XXXX/QWMLW/IV/BO/W/000/250/2430N05410E005
A) XXXX B) 2611010600 C) 2611011200
E) MISSILE FIRING WILL TAKE PLACE WI AREA 243000N 0540000E - 244000N 0541000E - 243000N 0542000E - 243000N 0540000E
F) SFC G) 25000FT AMSL)

(A1301/26 NOTAMN
Q) XXXX/QMRLC/IV/NBO/A/000/999/2515N05522E005
A) XXAA B) 2610150000 C) 2610200600
E) RWY 12L/30R CLSD DUE WIP.)

!ORD 10/123 ORD OBST CRANE (ASN 2026-AGL-1234-NRA) 415823N0875432W (1.2NM NE ORD) 856FT (180FT AGL) FLAGGED AND LGTD 2610010000-2610302359
!ORD 10/124 ORD RWY 10L/28R CLSD 2610011200-2610012000
!FDC 6/3456 ZLA CA..AIRSPACE LOS ANGELES, CA..TEMPORARY FLIGHT RESTRICTIONS WI AN AREA DEFINED AS 3NM RADIUS OF 340000N1181500W SFC-2999FT 2610010000-2610022359
`;

test('briefing split and ICAO items', () => {
  const list = N.parse(BRIEF);
  assert.equal(list.length, 7);
  const ob = list[0];
  assert.equal(ob.fmt, 'ICAO'); assert.equal(ob.id, 'A1234/26'); assert.equal(ob.type, 'N'); assert.equal(ob.code, 'QOBCE');
  assert.equal(ob.subjTxt, 'obstacle'); assert.equal(ob.condTxt, 'erected'); assert.equal(ob.cat, 'obstacle');
  assert.deepEqual([...ob.locs], ['XXAA']); assert.equal(ob.from, Date.UTC(2026, 9, 1, 6, 0)); assert.equal(ob.to, Date.UTC(2026, 11, 31, 23, 59)); assert.ok(ob.est);
  near(ob.qCentre[0], 55 + 22 / 60); near(ob.qCentre[1], 25.25); assert.equal(ob.qRadiusNM, 5);
  assert.equal(ob.obstacles.length, 1);
  const o = ob.obstacles[0];
  near(o.c[1], 25 + 15 / 60 + 30 / 3600); near(o.c[0], 55 + 22 / 60 + 10 / 3600);
  near(o.hgt, 150 * 0.3048); near(o.elev, 180 * 0.3048); assert.equal(o.lit, 'YES'); assert.equal(o.marked, 'YES'); assert.equal(o.type, 'CRANE');
});

test('restriction activated, schedule, limits', () => {
  const r = N.parse(BRIEF)[1];
  assert.equal(r.cat, 'airspace'); assert.equal(r.subjTxt, 'restricted area'); assert.equal(r.activation, 'on');
  assert.ok(r.designators.includes('XXR15'));
  assert.ok(r.lower.gnd); assert.equal(r.upper.txt, 'FL150'); near(r.upper.m, 15000 * 0.3048);
  assert.equal(N.stateAt(r, Date.UTC(2026, 9, 10, 6, 0)), 'on');
  assert.equal(N.stateAt(r, Date.UTC(2026, 9, 9, 6, 0)), 'future');
  assert.equal(N.stateAt(r, Date.UTC(2026, 9, 10, 4, 0)), 'off');
  assert.equal(N.stateAt(r, Date.UTC(2026, 9, 10, 18, 0)), 'off');
  assert.equal(N.stateAt(r, Date.UTC(2026, 9, 11, 1, 0)), 'ended');
  // only the Q circle: the area is the circle of influence
  assert.ok(r.area && r.area.fromQ); near(r.area.circle.rNM, 10);
});

test('warning area polygon, runway closure', () => {
  const list = N.parse(BRIEF), w = list[2], rw = list[3];
  assert.equal(w.cat, 'warning'); assert.equal(w.subjTxt, 'missile, gun or rocket firing'); assert.equal(w.activation, 'on');
  assert.equal(w.area.ring.length, 4); assert.equal(w.upper.txt, '25000 FT AMSL');
  assert.equal(rw.cat, 'runway'); assert.deepEqual([...rw.runway.rwys], ['12L/30R']); assert.ok(rw.runway.closed); assert.ok(rw.runway.wip);
});

test('FAA domestic and FDC', () => {
  const list = N.parse(BRIEF), f = list[4], r = list[5], t = list[6];
  assert.equal(f.fmt, 'FAA'); assert.equal(f.id, 'ORD 10/123'); assert.equal(f.cat, 'obstacle');
  assert.equal(f.from, Date.UTC(2026, 9, 1, 0, 0)); assert.equal(f.to, Date.UTC(2026, 9, 30, 23, 59));
  const o = f.obstacles[0];
  near(o.c[1], 41 + 58 / 60 + 23 / 3600); near(o.c[0], -(87 + 54 / 60 + 32 / 3600));
  near(o.elev, 856 * 0.3048); near(o.hgt, 180 * 0.3048); assert.equal(o.lit, 'YES'); assert.equal(o.marked, 'YES'); assert.equal(o.type, 'CRANE');
  assert.equal(r.cat, 'runway'); assert.ok(r.runway.closed); assert.deepEqual([...r.runway.rwys], ['10L/28R']);
  assert.equal(t.cat, 'airspace'); assert.ok(t.area.circle); near(t.area.circle.rNM, 3); near(t.area.circle.c[0], -(118 + 15 / 60));
  assert.ok(t.lower.gnd); near(t.upper.m, 2999 * 0.3048);
});

test('Q codes, coordinates, limits', () => {
  const d = N.decode('QRDCA'); assert.equal(d.subjTxt, 'danger area'); assert.equal(d.condTxt, 'activated'); assert.equal(d.cat, 'airspace');
  assert.equal(N.decode('QOLAS').condTxt, 'unserviceable'); assert.equal(N.decode('QMRLC').cat, 'runway');
  const c = N.coords('N 25°15\'30" E 055°22\'10" and 2515.5N05522.2E');
  assert.equal(c.length, 2); near(c[0].c[1], 25 + 15 / 60 + 30 / 3600); near(c[1].c[1], 25 + 15.5 / 60); near(c[1].c[0], 55 + 22.2 / 60);
  assert.equal(N.limit('FL095').txt, 'FL095'); assert.ok(N.limit('UNL').unl); near(N.limit('450 M AGL').m, 450); assert.equal(N.limit('450 M AGL').ref, 'SFC');
  assert.deepEqual([...N.designators('R-4808N AND OBR10 AND TSA 21 ACT')], ['R-4808N', 'OBR10', 'TSA 21']);
});

test('AIP ENR 5.1 text: polygons, arcs, circles, limits', () => {
  const T = `XXP1 PALACE
251000N 0550000E - 251000N 0551000E - 250000N 0551000E - 250000N 0550000E - 251000N 0550000E
FL150
GND
H24
XXR2 RANGE AREA
A circle radius 5 NM centred on 243000N 0543000E
Upper limit: 5000 FT AMSL Lower limit: GND
XXD3 TRAINING
250000N 0540000E - 251000N 0540000E then clockwise along the arc of a circle radius 10 NM centred on 250000N 0541000E to 250000N 0542000E - 250000N 0540000E
GND - 3000 FT AMSL`;
  const a = N.areas(T);
  assert.equal(a.length, 3);
  assert.equal(a[0].desig, 'XXP1'); assert.equal(a[0].type, 'P'); assert.equal(a[0].name, 'PALACE'); assert.equal(a[0].ring.length, 5);
  assert.equal(a[0].upper.txt, 'FL150'); assert.ok(a[0].lower.gnd); assert.equal(a[0].hours, 'H24');
  assert.equal(a[1].type, 'R'); assert.ok(a[1].circle); near(a[1].circle.rNM, 5); near(a[1].upper.m, 5000 * 0.3048); assert.ok(a[1].lower.gnd);
  assert.equal(a[2].type, 'D'); assert.ok(a[2].ring.length > 8, 'the arc is drawn'); assert.ok(a[2].lower.gnd); near(a[2].upper.m, 3000 * 0.3048);
  const xml = N.areasAixm(a, { source: 'test' });
  assert.match(xml, /<aixm:type>P<\/aixm:type><aixm:designator>XXP1<\/aixm:designator>/);
  assert.match(xml, /<aixm:upperLimit uom="FL">150<\/aixm:upperLimit><aixm:upperLimitReference>STD/);
  assert.equal((xml.match(/<aixm:Airspace /g) || []).length, 3);
});

test('writers: NOTAM obstacles as a table', () => {
  const list = N.parse(BRIEF), csv = N.obstaclesCsv(list);
  const lines = csv.trim().split(/\r\n/);
  assert.equal(lines.length, 3); // heading + two obstacles
  assert.match(lines[1], /^A1234\/26,NOTAM A1234\/26 XXAA,CRANE,25\.2583333,55\.3694444,54\.9,45\.7,YES,YES,2026-10-01 06:00,2026-12-31 23:59/);
  assert.equal(N.notamAreas(list).length, 3);
});
