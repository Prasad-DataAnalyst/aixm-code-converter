// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Unit tests (node --test): the State's charts and documents for aerodrome mapping (src/amdbdoc.js).
// - coordinates in every common notation, misread scans repaired, never inside a longer number;
// - runway designators, chart types (ICAO Annex 4) and the "— ICAO" title;
// - the facts of a parking / docking chart: stands, names, taxiways, widths, thresholds, strength, lighting per
//   runway, magnetic variation, hot spots; lines rebuilt from rotated and split PDF text;
// - doubtful stands left out (far, twice, far from all others); the Annex 4 contents; the aerodrome of a document;
//   the chart against the AIP data set.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const D = require(path.join(__dirname, '..', '..', '..', 'src', 'amdbdoc.js'));

test('coordinates in every notation', () => {
  const at = (t) => D.coordsIn(D.clean(t)).map((p) => [+p.lat.toFixed(5), +p.lon.toFixed(5)]);
  assert.deepEqual(at('C3 251530.12N 0513612.34E'), [[25.25837, 51.60343]]);
  assert.deepEqual(at('204  25 15 31.07 N  051 36 14.90 E'), [[25.25863, 51.60414]]);
  assert.deepEqual(at('N25°15\'30.12" E051°36\'12.34"'), [[25.25837, 51.60343]]);
  assert.deepEqual(at('12  52.372300  -31.968500'), [[52.3723, -31.9685]]);
  assert.deepEqual(at('7 251530.12S 0513612.34W'), [[-25.25837, -51.60343]]);
  // a scan read as O for 0 and l for 1
  assert.deepEqual(at('25153O.l2N O513612.34E'), [[25.25837, 51.60343]]);
  // two in a line (threshold and runway end), none inside a longer number
  assert.equal(at('09L THR 522200.00N 0315900.00W RWY END 522200.00N 0315500.00W').length, 2);
  assert.deepEqual(at('5222200.9N 0315808.10W'), []);
  assert.deepEqual(at('TWR 118.100 GND 121.800'), []);
});

test('runway designators and chart types', () => {
  assert.deepEqual(D.desOf('HIRL Rwys 1R-19L, 1L-19R'), ['01R', '19L', '01L', '19R']);
  assert.deepEqual(D.desOf('TDZL/RCLS Rwys 19L and 28R'), ['19L', '28R']);
  assert.deepEqual(D.desOf('RWY 16L/34R 4850 x 60 M'), ['16L', '34R']);
  assert.deepEqual(D.desOf('25 15 30.12 N 051 36 12.34 E', true), []);
  assert.equal(D.opposite('09L'), '27R');
  const k = (t) => D.kindOf(t);
  assert.deepEqual(k('AERODROME CHART - ICAO\nDONLON INTL'), { id: 'adc', icaoTitle: true });
  assert.equal(k('AERODROME GROUND MOVEMENT CHART — ICAO').id, 'agmc');
  assert.equal(k('AIRCRAFT PARKING/DOCKING CHART - ICAO').id, 'apdc');
  assert.equal(k('AERODROME OBSTACLE CHART - ICAO TYPE A').id, 'aoca');
  assert.equal(k('AIRPORT DIAGRAM\nSAN FRANCISCO INTL').id, 'adc');
  assert.equal(k('AIRPORT DIAGRAM').icaoTitle, false);
  assert.equal(k('INSTRUMENT APPROACH CHART - ICAO ILS RWY 09L').id, 'iac');
  assert.equal(k('AD 2.8 APRONS, TAXIWAYS AND CHECK LOCATIONS').id, 'ad2');
});

const CHART = ['AIRCRAFT PARKING/DOCKING CHART - ICAO', 'DONLON/INTL (EADD)', 'AD ELEV 30 FT', 'STAND COORDINATES', 'STAND\tLATITUDE\tLONGITUDE',
  '1\t522218.12N\t0315812.40W', '2\t52 22 19.05 N\t031 58 10.95 W', '3   N52°22\'20.01" W031°58\'09.50"', 'C4  522220.09N 03158O8.10W',
  'Stands 7-10 and C11, C12 for code C aircraft', 'TWY A, B and K1: 23 M wide', 'TWY edge lights blue', 'Shoulders 7.5 m each side',
  'RWY 09L/27R 2800 x 45 M PCN 80/R/B/W/T CONC', '09L  THR 522200.00N 0315900.00W  RWY END 522200.00N 0315500.00W',
  'RWY 09L: PALS CAT II, PAPI 3°, RTHL, RCLL, TDZL', 'HOT SPOT HS1: crossing of TWY A and RWY 09L', 'VAR 1°W (2026) annual change 0.1° E',
  'APRON 1 and CARGO APRON', 'ARP 522210.00N 0315700.00W', 'GND 121.800  TWR 118.100'].join('\n');

test('the facts of a parking / docking chart', () => {
  const f = D.read(CHART, 'chart');
  assert.deepEqual(f.kind, { id: 'apdc', icaoTitle: true });
  assert.deepEqual(f.stands.map((s) => s.id), ['1', '2', '3', 'C4']);
  assert.deepEqual(f.standNames, ['7', '8', '9', '10', 'C11', 'C12']);
  assert.deepEqual(f.twyNames, ['A', 'B', 'K1']);
  assert.deepEqual(f.twyW, { A: 23, B: 23, K1: 23 });
  assert.deepEqual(f.shoulder, { '*': { w: 7.5, total: false } });
  assert.deepEqual(f.apronNames, ['1', 'CARGO']);
  assert.equal(f.rwy['09L'].wid, 45); assert.equal(f.rwy['27R'].len, 2800);
  assert.equal(f.rwy['09L'].pcn, 'PCN 80/R/B/W/T');
  assert.deepEqual(f.rwy['09L'].thr, [-31.983333333333334, 52.36666666666667]);
  assert.ok(f.rwy['09L'].end[0] > f.rwy['09L'].thr[0]);
  assert.deepEqual(f.arp.map((v) => +v.toFixed(5)), [-31.95, 52.36944]);
  assert.equal(f.elev, 9.1); assert.equal(f.magVar, -1); assert.deepEqual(f.hotspots, ['HS1']);
  assert.deepEqual(f.lights.map((l) => l.kind + ':' + l.cls + ':' + l.des.join('/')), ['TWYEDGE::', 'ALS:CAT2:09L', 'PAPI::09L', 'CL::09L', 'TDZ::09L', 'THR::09L']);
  assert.match(f.ev.freq, /121\.800/);
});

test('lines of a PDF page: rotated, split and table text', () => {
  // text turned by 90° (as on a chart printed landscape), split character by character, and a table row
  const it = (s, x, y, ang, w) => { const a = ang * Math.PI / 180, h = 6; return { str: s, width: w || s.length * 3, transform: [Math.cos(a) * h, Math.sin(a) * h, -Math.sin(a) * h, Math.cos(a) * h, x, y] }; };
  const items = [it('V', 100, 200, 90, 3), it('A', 100, 203, 90, 3), it('R', 100, 206, 90, 3), it('14°', 100, 209, 90, 9), it('E', 100, 218, 90, 3),
    it('PCR 866 F/B/W/T', 110, 200, 90), it('RWY 10R-28L', 104, 200, 90), it('12', 20, 500, 0, 6), it('251530.12N', 80, 500, 0), it('0513612.34E', 150, 500, 0)];
  const L = D.textLines(items);
  assert.ok(L.includes('VAR14°E'), L.join(' | '));
  assert.ok(L.includes('12\t251530.12N\t0513612.34E'), L.join(' | '));
  const f = D.read(L.join('\n'), 'pdf');
  assert.equal(f.magVar, 14);
  assert.deepEqual(f.pcn.map((p) => p.v + ' ' + p.des.join('/')), ['PCR 866/F/B/W/T 10R/28L']);
});

test('doubtful stands are left out, with the reason', () => {
  const arp = [-31.95, 52.37];
  const list = [1, 2, 3, 4, 5, 6].map((i) => ({ id: String(i), c: [-31.95 + i * 0.0004, 52.372] }));
  list.push({ id: '3', c: [-31.94, 52.38] }); // twice, 1 km apart
  list.push({ id: '7', c: [-31.95, 52.40] }); // far from every other stand
  list.push({ id: '8', c: [-31.95, 52.6] }); // 25 km away
  const r = D.standsChecked(list, arp);
  assert.deepEqual(r.ok.map((s) => s.id), ['1', '2', '3', '4', '5', '6']);
  assert.equal(r.left.length, 3);
  const why = r.left.map((x) => x.why).join(' | ');
  assert.match(why, /more than 8 km/); assert.match(why, /stand 3 given twice/); assert.match(why, /stand 7 lies \d+ m from every other stand/);
});

test('ICAO Annex 4 contents and the aerodrome of a document', () => {
  const f = D.read(CHART, 'chart'), c = { code: 'EADD', name: 'DONLON/INTL', arp: [-31.95, 52.3694], rwys: [] };
  const chk = D.icaoCheck(f, c), st = (ref) => (chk.items.filter((x) => x.ref === ref)[0] || {}).st;
  assert.equal(chk.kind, 'apdc'); assert.equal(chk.items.length, D.A4.apdc.length);
  assert.equal(st('15.4'), 'found');
  assert.equal(st('15.3.2'), 'drawn');
  assert.equal(st('15.6.1 c'), 'found');
  assert.equal(st('15.6.1 e'), 'found');
  assert.equal(st('15.6.1 g'), 'missing');
  assert.equal(st('15.6.1 k'), 'where');
  assert.equal(D.assign(f, [{ code: 'EADH', name: 'DONLON/DOWNTOWN', arp: [-31.8, 52.2] }, c]), 'EADD');
  // no code in the text: the coordinates near a reference point, then the aerodrome name in the title
  assert.equal(D.assign(D.read('STAND 1 522218.12N 0315812.40W', 'x'), [{ code: 'EAXX', name: 'X', arp: [10, 10] }, c]), 'EADD');
  assert.equal(D.assign(D.read('AIRPORT DIAGRAM\nSAN FRANCISCO INTL', 'x'), [{ code: 'KSFO', name: 'SAN FRANCISCO INTL', arp: [-122.375, 37.619] }, c]), 'KSFO');
});

test('the chart against the AIP data set', () => {
  D.clear();
  const c = { code: 'EADD', name: 'DONLON/INTL', arp: [-31.95, 52.36944], magVar: -3, ad: { cur: { p: { fieldElevation: { v: '30', u: 'FT' } } } },
    rwys: [{ des: '09L/27R', len: 2800, wid: null, sp: null, dirs: [{ des: '09L', pts: [{ role: 'THR', c: [-31.98334, 52.36667] }] }, { des: '27R', pts: [] }] }] };
  D.addText(CHART, 'chart', [c]);
  const K = D.forAd('EADD', c.arp), x = D.crossCheck(K, c, []), by = {};
  x.forEach((r) => { by[r.what] = r.st; });
  assert.equal(by['Aerodrome reference point'], 'ok');
  assert.equal(by['Threshold 09L'], 'ok');
  assert.equal(by['Runway 09L/27R width'], 'fill');
  assert.equal(by['Runway 09L/27R length'], 'ok');
  assert.equal(by['Aerodrome elevation'], 'ok');
  assert.equal(by['Magnetic variation'], 'warn');
  assert.ok(D.lightsFor(K, '09L', true).some((l) => l.kind === 'ALS' && l.cls === 'CAT2'));
  assert.ok(D.lightsFor(K, '27R', false).every((l) => l.kind !== 'ALS'));
  D.clear();
});
