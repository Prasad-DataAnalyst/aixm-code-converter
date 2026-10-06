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
