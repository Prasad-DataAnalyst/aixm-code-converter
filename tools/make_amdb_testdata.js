// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Makes testdata/amdb_test_EAXB.xml: fictitious aerodromes (EAXB, EAXC) in AMXM 2.0 with known aerodrome mapping defects,
// one or more for every AMDB rule (src/amdb.js), and clean features next to them. Not real data. NOT FOR NAVIGATION.
// Usage: node tools/make_amdb_testdata.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const dict = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/amxm_dictionary.json'), 'utf8'));
const FT = {}; Object.entries(dict.codes.feattypeBaseTypeType).forEach(([k, v]) => { FT[v.replace(/\s+/g, '').toLowerCase()] = k; });
const LON0 = -31.0, LAT0 = 51.0, KX = 111320 * Math.cos(LAT0 * Math.PI / 180), KY = 111200;
const ll = (x, y) => [LAT0 + y / KY, LON0 + x / KX];
const fmt = (p) => p[0].toFixed(8) + ' ' + p[1].toFixed(8);
let gid = 0, idn = 0;
const members = [];
function rect(x0, y0, x1, y1) { return [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]; } // counter-clockwise
function feature(type, attrs, geom, opt = {}) {
  const def = dict.features[type];
  const lines = [];
  const given = Object.assign({ feattype: FT[type.toLowerCase()], idnumber: 'B' + (++idn), idarpt: 'EAXB', source: 'Fictitious AMDB test data (AIXM Code Converter)', revdate: '2026-10-01T00:00:00Z',
    hacc: ['0.5', 'm'], hres: ['0.0000001', 'deg'], integr: '0.00000001', vacc: ['0.5', 'm'], vres: ['0.01', 'm'] }, attrs);
  def.attrs.forEach((a) => {
    if (/^geo(poly|line|pnt)$/.test(a.n)) return;
    if (opt.drop && opt.drop.includes(a.n)) return;
    const v = given[a.n];
    if (v === undefined) { if (a.m) lines.push(`<amxm:${a.n} xsi:nil="true" nilReason="unknown"/>`); return; }
    if (Array.isArray(v)) lines.push(`<amxm:${a.n} uom="${v[1]}">${v[0]}</amxm:${a.n}>`); else lines.push(`<amxm:${a.n}>${v}</amxm:${a.n}>`);
  });
  const g = ++gid;
  if (geom.t === 'P') lines.push(`<amxm:geopnt><gml:Point gml:id="G${g}" srsName="urn:ogc:def:crs:EPSG::4326"><gml:pos>${fmt(ll(...geom.c))}</gml:pos></gml:Point></amxm:geopnt>`);
  if (geom.t === 'P0') lines.push(`<amxm:geopnt><gml:Point gml:id="G${g}" srsName="urn:ogc:def:crs:EPSG::4326"><gml:pos>0 0</gml:pos></gml:Point></amxm:geopnt>`);
  if (geom.t === 'L') lines.push(`<amxm:geoline><gml:LineString gml:id="G${g}" srsName="urn:ogc:def:crs:EPSG::4326"><gml:posList>${geom.c.map((p) => fmt(ll(...p))).join(' ')}</gml:posList></gml:LineString></amxm:geoline>`);
  if (geom.t === 'A') lines.push(`<amxm:geopoly><gml:Polygon gml:id="G${g}" srsName="urn:ogc:def:crs:EPSG::4326">` + geom.c.map((r, i) => `<gml:${i ? 'interior' : 'exterior'}><gml:LinearRing><gml:posList>${r.map((p) => fmt(ll(...p))).join(' ')}</gml:posList></gml:LinearRing></gml:${i ? 'interior' : 'exterior'}>`).join('') + `</gml:Polygon></amxm:geopoly>`);
  members.push(`\t<amxm:featureMember>\n\t\t<amxm:${type} gml:id="F${g}">\n\t\t\t${lines.join('')}\n\t\t</amxm:${type}>\n\t</amxm:featureMember>`);
}
const rwy = { idrwy: '09.27', pcn: 'PCN 80/F/A/W/T', width: ['45', 'm'], length: ['2000', 'm'], surftype: '1', status: '1', restacft: 'A388' };
// --- EAXB: a small aerodrome with every defect
feature('AerodromeReferencePoint', { name: 'AMDB Test Field', iata: 'TBX', elev: ['10', 'm'] }, { t: 'P', c: [0, 100] });
feature('RunwayElement', rwy, { t: 'A', c: [rect(-1000, -22.5, 1000, 22.5)] });                                  // clean
feature('RunwayThreshold', { idthr: '09', thrtype: '0', elev: ['10', 'm'] }, { t: 'P', c: [-1000, 0] });               // clean
feature('RunwayThreshold', { idthr: '27', thrtype: '0', hacc: ['2', 'm'], integr: '0.001' }, { t: 'P', c: [1000, 30] }); // F01 30 m off, Q01, Q02
feature('RunwayThreshold', { idthr: '18', thrtype: '0', hres: ['0.001', 'deg'] }, { t: 'P', c: [0, 0] });            // F02, Q03
feature('RunwayElement', Object.assign({}, rwy, { idrwy: '27.09' }), { t: 'A', c: [rect(-1000, 200, -900, 245)] });    // G06 order (and C: no thresholds)
feature('RunwayElement', Object.assign({}, rwy, { idrwy: '09.26' }), { t: 'A', c: [rect(-800, 200, -700, 245)] });    // G07
// taxiways
feature('TaxiwayElement', { idlin: 'A', surftype: '1', status: '1' }, { t: 'A', c: [rect(-500, 10, -480, 150).slice().reverse()] }); // X05 clockwise + X08 overlap with runway (20 x 12.5 m)
feature('TaxiwayElement', { idlin: 'B', surftype: '1', status: '1' }, { t: 'A', c: [[[-300, 30], [-280, 150], [-280, 30], [-300, 150], [-300, 30]]] }); // X04 bow tie
feature('TaxiwayElement', { idlin: 'C', surftype: '1', status: '1' }, { t: 'A', c: [[[-100, 30], [-80, 30], [-80, 150], [-100, 150]]] });    // X02 open
feature('TaxiwayElement', { idlin: 'D', surftype: '1', status: '1' }, { t: 'A', c: [[[100, 30], [120, 30], [100, 30], [100, 30]]] });        // X03 (3 positions + repeat)
// apron with a spike and a small hole (X06, X09)
feature('ApronElement', { idapron: 'MAIN', surftype: '1', status: '1' }, { t: 'A', c: [[[300, 30], [600, 30], [600, 230], [450, 230], [450.01, 400], [449.99, 230], [300, 230], [300, 30]], [[400, 100], [400, 102], [402, 102], [402, 100], [400, 100]]] });
feature('ParkingStandLocation', { idstd: '1', termref: 'T1' }, { t: 'P', c: [500, 150] });                          // clean
feature('ParkingStandLocation', { idstd: '2', termref: 'T1' }, { t: 'P', c: [700, 150] });                          // F04 off apron
// guidance: on pavement, then off pavement with a loose end (F05, F08)
feature('TaxiwayGuidanceLine', { idlin: 'A', status: '1', wingspan: ['36', 'm'], direc: '1' }, { t: 'L', c: [[-490, 0], [-490, 140]] });
feature('TaxiwayGuidanceLine', { idlin: 'X', status: '1', wingspan: ['36', 'm'], direc: '1' }, { t: 'L', c: [[-490, 140], [-490, 200], [-200, 300]] });
feature('TaxiwayHoldingPosition', { idlin: 'A', status: '1', catstop: '1' }, { t: 'L', c: [[-500, 80], [-480, 80]] });  // clean: crosses line A
feature('TaxiwayHoldingPosition', { idlin: 'Q', status: '1', catstop: '1' }, { t: 'L', c: [[-700, 80], [-680, 80]] });  // F06
feature('RunwayExitLine', { idlin: 'E1', status: '1' }, { t: 'L', c: [[200, 300], [250, 400]] });                       // F07
// generic defects
feature('ServiceRoad', { gsurftyp: '99' }, { t: 'A', c: [rect(800, 300, 900, 310)] }); // G02, G09
feature('DeicingArea', { status: '1', revdate: 'last week', surftype: '1', hacc: ['99999', 'm'] }, { t: 'A', c: [rect(320, 50, 320.5, 50.5)] }); // G08, X07
feature('Stopway', { feattype: '3', idnumber: 'B2', idrwy: '09.27', status: '1', surftype: '1' }, { t: 'A', c: [rect(1000, -22.5, 1060, 22.5)] }); // G03, G04 (idnumber of the runway... different type: also a duplicate test below)
feature('Stopway', { idnumber: 'DUP', idrwy: '09.27', status: '1', surftype: '1' }, { t: 'A', c: [rect(-1060, -22.5, -1000, 22.5)] });
feature('Stopway', { idnumber: 'DUP', idrwy: '09.27', status: '1', surftype: '1' }, { t: 'A', c: [rect(-1120, -22.5, -1060, 22.5)] }); // G04
feature('ParkingStandArea', { idstd: '1', status: '1' }, { t: 'A', c: [rect(480, 130, 520, 170)] }, { drop: ['termref', 'idstd'] }); // G01 (attributes left out)
feature('SurveyControlPoint', { ident: 'SCP1' }, { t: 'P0' });                                                    // X01
feature('VerticalPointStructure', { height: ['tall', 'm'], elev: ['10', 'm'] }, { t: 'P', c: [0, 600] });             // F12
feature('ConstructionArea', { status: '1' }, { t: 'A', c: [rect(15000, 0, 15100, 50)] });                         // F10
feature('AsrnNode', { idnetwrk: 'N1', nodetype: '1' }, { t: 'P', c: [-490, 0] });
feature('AsrnEdge', { idnetwrk: 'N1', edgetype: '1' }, { t: 'L', c: [[-490, 0], [-490, 140]] });                   // F11 (end not on a node)
// --- EAXC: no reference point, almost nothing (F09, C01)
feature('RunwayElement', Object.assign({}, rwy, { idarpt: 'EAXC', idrwy: '18.36' }), { t: 'A', c: [rect(5000, 5000, 5045, 7000)] });
// --- idarpt not ICAO (G05)
feature('Water', { idarpt: 'EAX' }, { t: 'A', c: [rect(-3000, 3000, -2900, 3100)] });
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!-- AIXM Code Converter test data: fictitious aerodromes (EAXB, EAXC) in AMXM 2.0 with known aerodrome mapping defects, one or more per AMDB rule. Not real data. NOT FOR NAVIGATION. -->
<amxm:AerodromeMappingDatabase xmlns:amxm="http://www.amxm.aero/schema/2.0.0" xmlns:gml="http://www.opengis.net/gml/3.2" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" gml:id="DB_EAXB">
${members.join('\n')}
</amxm:AerodromeMappingDatabase>
`;
fs.writeFileSync(path.join(ROOT, 'testdata/amdb_test_EAXB.xml'), xml);
console.log('features', members.length, 'bytes', xml.length);
