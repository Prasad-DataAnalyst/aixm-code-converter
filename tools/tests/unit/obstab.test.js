// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Unit tests (node --test): obstacle tables (src/obstab.js) — coordinates, headings, types, CSV, WKT.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const T = require(path.join(__dirname, '..', '..', '..', 'src', 'obstab.js'));
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, a + ' vs ' + b);

test('coordinates in common writings', () => {
  const lat = 24 + 42 / 60 + 13.5 / 3600, lon = 46 + 45 / 60 + 12.25 / 3600;
  for (const v of ['24°42\'13.5"N', 'N 24 42 13.5', '244213.5N', '24-42-13.5 N', '24 42 13,5 N', 24 + 42 / 60 + 13.5 / 3600, String(lat)]) near(T.coordOf(v, true), lat);
  for (const v of ['046°45\'12.25"E', 'E 046 45 12.25', '0464512.25E', '46 45 12.25E']) near(T.coordOf(v, false), lon);
  near(T.coordOf('244213.5S', true), -lat); near(T.coordOf('0464512.25W', false), -lon); near(T.coordOf('-46.5', false), -46.5);
  near(T.coordOf('2442N', true), 24.7);
  assert.ok(Number.isNaN(T.coordOf('', true)));
});
test('headings', () => {
  const want = { 'Obstacle ID': 'id', 'Latitude (WGS-84)': 'lat', 'LONG_DD': 'lon', 'Elevation AMSL (ft)': 'elev', 'Height AGL': 'height', 'Height AMSL': 'elev', 'Top Elevation': 'elev', 'Lat deg': 'latD', 'N/S': 'latH', 'Long sec': 'lonS',
    'Horizontal accuracy (m)': 'hAcc', 'Vertical accuracy': 'vAcc', 'Lighting': 'light', 'Marking': 'mark', 'Obstacle type': 'type', 'WKT': 'wkt', 'Unit': 'unit', 'eTOD Area': 'area', 'Owner': 'owner', 'Remarks': 'remark', 'Survey method': '' };
  for (const h of Object.keys(want)) assert.equal(T.fieldOf(h), want[h], h);
});
test('types, CSV, WKT', () => {
  assert.equal(T.typeOf('Wind turbine'), 'WINDMILL'); assert.equal(T.typeOf('chimney'), 'STACK'); assert.equal(T.typeOf('building'), 'BUILDING'); assert.equal(T.typeOf('Gizmo'), 'OTHER:GIZMO');
  const p = T.parseCsv('a;b;c\r\n"x;1";"he said ""hi""";3,5\r\n');
  assert.equal(p.sep, ';'); assert.deepEqual(p.rows[1], ['x;1', 'he said "hi"', '3,5']);
  assert.deepEqual(T.wktOf('POINT Z (46.5 24.7 610)'), { t: 'P', c: [46.5, 24.7] });
  assert.equal(T.wktOf('POLYGON((0 0, 1 0, 1 1, 0 0))').c[0].length, 4);
  assert.equal(T.wktOf('LINESTRING(0 0, 1 1)').t, 'L');
  assert.equal(T.wktOf('nonsense'), null);
});

// FAA Digital Obstacle File: the fixed columns of DOF_README (synthetic lines in that layout)
const DOF_HEAD = '  CURRENCY DATE = 09/27/26\n' +
  '                                   LATITUDE     LONGITUDE     OBSTACLE             AGL   AMSL LT ACC MAR FAA          ACTION\n' +
  'OAS#      V CO ST CITY             DEG MIN SEC  DEG MIN SEC   TYPE                 HT    HT     H V IND STUDY           JDATE\n' +
  '-'.repeat(127) + '\n';
const dofRow = (oas, v, st, city, lat, lon, type, q, agl, amsl, lt, h, vv, mk, study, act, jd) =>
  oas + ' ' + v + ' US ' + st + ' ' + city.padEnd(16) + ' ' + lat + ' ' + lon + ' ' + type.padEnd(18) + ' ' + q + ' ' + String(agl).padStart(5, '0') + ' ' + String(amsl).padStart(5, '0') +
  ' ' + lt + ' ' + h + ' ' + vv + ' ' + mk + ' ' + study.padEnd(14) + ' ' + act + ' ' + jd + ' ';
test('FAA DOF: columns, codes, units', async () => {
  const l1 = dofRow('01-000001', 'O', 'AL', 'TEST CITY', '30 10 45.00N', '088 04 39.00W', 'T-L TWR', 1, 236, 241, 'D', '4', 'E', 'P', '2026ASO00001OE', 'C', '2026135');
  const l2 = dofRow('01-000002', 'U', 'AL', 'OTHER TOWN', '30 11 20.50S', '087 57 10.00E', 'BLDG', 3, 40, 52, 'N', '9', 'I', 'N', '', 'A', '2025001');
  const d = T.dofLine(l1);
  assert.equal(d.oas, '01-000001'); assert.equal(d.ver, 'O'); assert.equal(d.st, 'AL'); assert.equal(d.city, 'TEST CITY');
  near(d.lat, 30 + 10 / 60 + 45 / 3600); near(d.lon, -(88 + 4 / 60 + 39 / 3600));
  assert.equal(d.type, 'T-L TWR'); assert.equal(d.agl, 236); assert.equal(d.amsl, 241); assert.equal(d.lt, 'D'); assert.equal(d.ha, '4'); assert.equal(d.va, 'E'); assert.equal(d.mk, 'P');
  assert.equal(d.act, 'C'); assert.equal(d.date, '2026-05-15');
  assert.ok(T.dofLine(l2).lat < 0 && T.dofLine(l2).lon > 0);
  assert.equal(T.dofLine('-'.repeat(127)), null);
  assert.ok(T.isDofHead(DOF_HEAD)); assert.ok(!T.isDofHead('id,lat,lon\n1,2,3'));
  assert.ok(T.isDof('06-CA.Dat') && T.isDof('DOF.DAT') && !T.isDof('a.csv'));
  const f = new File([DOF_HEAD + l1 + '\n' + l2 + '\n'], '01-AL.Dat');
  const sn = await T.dofSniff(f);
  assert.equal(sn.family, 'tab'); assert.equal(sn.dof, true); assert.equal(sn.currency, '2026-09-27'); assert.ok(sn.rows >= 1 && sn.rows <= 3);
  const res = await T.dofRead(f);
  assert.equal(res.recs.length, 2);
  const p = res.recs[0].ts[0].p, part = p.part, hp = part.horizontalProjection_location;
  assert.equal(p.designator, '01-000001'); assert.equal(p.type, 'TOWER'); assert.equal(p.lighted, 'YES'); assert.equal(p.markingICAOStandard, 'YES');
  assert.deepEqual({ ...hp.elevation }, { v: '241', u: 'FT' }); assert.deepEqual({ ...part.verticalExtent }, { v: '236', u: 'FT' });
  assert.deepEqual({ ...hp.horizontalAccuracy }, { v: '250', u: 'FT' }); assert.deepEqual({ ...hp.verticalAccuracy }, { v: '125', u: 'FT' });
  assert.equal(part.lighting.intensityLevel, 'MIL'); assert.equal(part.markingFirstColour, 'ORANGE'); assert.equal(part.markingSecondColour, 'WHITE');
  assert.match(p.annotation.translatedNote.note, /verified · TEST CITY, AL, US · type T-L TWR .*FAA study 2026ASO00001OE · action change on 2026-05-15$/);
  // the source of a record is its line in the file (offset and length)
  const text = DOF_HEAD + l1 + '\n' + l2 + '\n', r0 = res.recs[0];
  assert.equal(text.slice(r0.o, r0.o + r0.n), l1);
  const q = res.recs[1].ts[0].p;
  assert.equal(q.lighted, 'NO'); assert.equal(q.markingICAOStandard, 'NO'); assert.equal(q.group, 'YES'); assert.equal(q.type, 'BUILDING');
  assert.equal(q.part.horizontalProjection_location.horizontalAccuracy, undefined);
  assert.match(q.annotation.translatedNote.note, /UNVERIFIED.*quantity 3.*horizontal accuracy unknown · vertical accuracy unknown/);
  // a very large file: the obstacles near the aerodromes loaded, or the first n
  const nearOnly = await T.dofRead(f, 0, { near: [{ c: [-88.07, 30.18], nm: 10 }] });
  assert.equal(nearOnly.recs.length, 1); assert.match(nearOnly.problems[1], /1 obstacle\(s\) farther than 10 NM/);
  const first = await T.dofRead(f, 0, { max: 1 });
  assert.equal(first.recs.length, 1); assert.match(first.problems[1], /after the first 1/);
  // the change list: a 10-character action before the same columns
  const chg = new File(['ACTION    OAS#      V ...\n' + '-'.repeat(130) + '\n' + 'OLD       ' + l1 + '\n' + 'NEW       ' + l1 + '\n' + 'DISMANTLE ' + l2.replace(/ A 2025001 $/, ' D 2025001 ') + '\n'], 'CHG.DAT');
  const cs = await T.dofSniff(chg); assert.equal(cs.change, true);
  const cr = await T.dofRead(chg);
  assert.equal(cr.recs.length, 3); assert.notEqual(cr.recs[0].id, cr.recs[1].id);
  assert.equal(cr.recs[2].ts[0].p.part.constructionStatus, 'OTHER:DISMANTLED');
});
