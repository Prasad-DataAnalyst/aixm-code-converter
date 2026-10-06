// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Unit tests (node --test): terrain readers (src/demfile.js) on files written from a known elevation function
// (tools/tests/_terrain.js): GeoTIFF and BigTIFF in both byte orders, tiled and striped, LZW / Deflate / PackBits,
// horizontal and floating-point predictors, overviews, empty tiles, geographic / UTM / user-defined transverse
// Mercator; DTED, SRTM .hgt and ESRI ASCII grid; transverse Mercator against published values.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
global.fflate = require(path.join(__dirname, '..', '..', 'node_modules', 'fflate'));
const DEMF = require(path.join(__dirname, '..', '..', '..', 'src', 'demfile.js'));
const T = require(path.join(__dirname, '..', '_terrain.js'));

// a grid of posts from the elevation function: geographic, n x m posts from (lon0, lat0) north-west corner
function geoGrid(lon0, lat0, d, w, h, round) {
  const v = new Array(w * h);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) { const e = T.elev(lon0 + c * d, lat0 - r * d); v[r * w + c] = round ? Math.round(e) : e; }
  return v;
}
async function post(r, read, c, row, level) {
  const lv = r.levels[level || 0], bx = Math.floor(c / lv.bw), by = Math.floor(row / lv.bh), b = await lv.read(bx, by);
  return b.d[(row - by * lv.bh) * b.w + (c - bx * lv.bw)];
}
function near(a, b, tol, what) { assert.ok(Math.abs(a - b) <= tol, (what || '') + ' ' + a + ' vs ' + b); }

test('LZW and PackBits round trip', () => {
  const data = Buffer.alloc(200000);
  let x = 1;
  for (let i = 0; i < data.length; i++) { x = (x * 1103515245 + 12345) >>> 0; data[i] = i % 7 === 0 ? (x >>> 24) : (i >> 9) & 0xff; }
  const z = T.lzwEncode(data);
  assert.deepEqual(Buffer.from(DEMF.lzw(z, data.length)), data); // past 4094 codes: clear codes and 9-12 bit codes
  const p = T.packbitsEncode(data);
  assert.deepEqual(Buffer.from(DEMF.packbits(p, data.length)), data);
});

test('transverse Mercator and UTM', () => {
  const z31 = DEMF.crsFromEpsg(32631);
  // on the central meridian: northing = k0 x meridian arc (45 deg N: 4 984 944.378 m)
  const a = DEMF.tmForward(z31, 3, 45);
  near(a[0], 500000, 0.001, 'easting'); near(a[1], 0.9996 * 4984944.378, 0.01, 'northing');
  // 48.8583 N 2.2945 E and 60 N 6 E (3 degrees from the central meridian) against the Krueger n-series (Karney
  // 2011) computed independently: agreement to a few millimetres
  const e = DEMF.tmForward(z31, 2.2945, 48.8583);
  near(e[0], 448251.8983, 0.005, 'E'); near(e[1], 5411943.7938, 0.005, 'N');
  const edge = DEMF.tmForward(z31, 6, 60);
  near(edge[0], 667294.8211, 0.005, 'E edge'); near(edge[1], 6655205.4836, 0.005, 'N edge');
  // round trip in Saudi Arabia (zone 38N) to the millimetre
  const z38 = DEMF.crsFromEpsg(32638), q = DEMF.tmForward(z38, 46.7, 24.7), b = DEMF.tmInverse(z38, q[0], q[1]);
  near(b[0], 46.7, 1e-8); near(b[1], 24.7, 1e-8);
  assert.equal(DEMF.crsFromEpsg(32738).fn, 10000000);
  assert.equal(DEMF.crsFromEpsg(4326).kind, 'geo');
  assert.equal(DEMF.crsFromEpsg(3857).kind, 'merc');
  assert.equal(DEMF.crsFromEpsg(99999), null);
});

test('GeoTIFF: little endian, tiled, Deflate, horizontal predictor, Int16, overview, empty tile, nodata', async () => {
  const d = 1 / 3600, W = 300, H = 200, lon0 = 46.5, lat0 = 24.8; // 1 arc second posts, centres from (lon0, lat0)
  const v = geoGrid(lon0, lat0, d, W, H, true);
  v[5 * W + 7] = -32768; // a void
  const ov = { w: 150, h: 100, v: geoGrid(lon0, lat0, 2 * d, 150, 100, true) };
  const buf = T.tiff({ le: true, type: 'i16', comp: 8, pred: 2, tile: [64, 64], nodata: -32768,
    images: [{ w: W, h: H, v, empty: (bx, by) => bx === 1 && by === 3 }, ov],
    keys: [[1024, 2], [1025, 2], [2048, 4326], [4096, 5773], [4099, 9001]], tie: [0, 0, 0, lon0, lat0, 0], scale: [d, d, 0],
    gdal: '<GDALMetadata><Item name="AREA_OR_POINT">Point</Item></GDALMetadata>' });
  assert.equal(DEMF.sniff('x.tif', new Uint8Array(buf.subarray(0, 8)), buf.length), 'tiff');
  const read = T.reader(buf), r = await DEMF.open('tiff', read, buf.length, 'x.tif');
  assert.equal(r.format, 'GeoTIFF'); assert.equal(r.width, W); assert.equal(r.height, H);
  assert.equal(r.levels.length, 2); assert.equal(r.overviews, 1); assert.equal(r.levels[1].sx, 2);
  assert.equal(r.crs.kind, 'geo'); assert.equal(r.pointIs, 'point'); assert.match(r.vDatum, /EGM96/);
  assert.equal(r.compression, 'Deflate'); assert.equal(r.predictor, 'horizontal'); assert.equal(r.dataType, 'Int16');
  assert.equal(r.area, 2); // 1 arc second: PANS-AIM Area 2
  near(r.bbox[0], lon0 - d / 2, 1e-9); near(r.bbox[3], lat0 + d / 2, 1e-9);
  for (const [c, row] of [[0, 0], [63, 63], [64, 0], [130, 77], [299, 199], [7, 6]]) assert.equal(await post(r, read, c, row), v[row * W + c], 'post ' + c + ',' + row);
  assert.ok(Number.isNaN(await post(r, read, 7, 5)), 'void');
  assert.ok(Number.isNaN(await post(r, read, 1 * 64 + 3, 3 * 64 + 2)), 'empty tile');
  assert.equal(await post(r, read, 40, 30, 1), ov.v[30 * 150 + 40], 'overview');
  // a point between posts: fractional post index, level 0
  const p = DEMF.postOf(r, lon0 + 130 * d, lat0 - 77 * d);
  near(p[0], 130, 1e-6); near(p[1], 77, 1e-6);
  // only the blocks asked for were read (not the whole file)
  const readBytes = read.reads.reduce((n, x) => n + x[1], 0);
  assert.ok(readBytes < buf.length, 'read ' + readBytes + ' of ' + buf.length);
});

test('BigTIFF: big endian, striped, LZW, floating-point predictor, Float32, UTM 38N', async () => {
  const crs = DEMF.crsFromEpsg(32638), W = 120, H = 90, step = 30, x0 = 600000, y0 = 2735000; // 30 m posts, corner (x0, y0)
  const v = new Array(W * H);
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) { const ll = DEMF.tmInverse(crs, x0 + (c + 0.5) * step, y0 - (r + 0.5) * step); v[r * W + c] = Math.fround(T.elev(ll[0], ll[1])); }
  const buf = T.tiff({ le: false, big: true, type: 'f32', comp: 5, pred: 3, rows: 16, images: [{ w: W, h: H, v }],
    keys: [[1024, 1], [1025, 1], [3072, 32638]], tie: [0, 0, 0, x0, y0, 0], scale: [step, step, 0], nodata: '-9999' });
  const read = T.reader(buf), r = await DEMF.open('tiff', read, buf.length, 'utm.tif');
  assert.equal(r.format, 'BigTIFF'); assert.equal(r.byteOrder, 'big endian'); assert.equal(r.crs.kind, 'tm');
  assert.equal(r.compression, 'LZW'); assert.equal(r.predictor, 'floating point'); assert.equal(r.dataType, 'Float32');
  assert.equal(r.pointIs, 'area'); near(r.spacingM[0], 30, 1e-9); assert.equal(r.area, 2);
  for (const [c, row] of [[0, 0], [119, 89], [57, 16], [57, 15], [3, 47]]) assert.equal(await post(r, read, c, row), v[row * W + c], 'post ' + c + ',' + row);
  const ll = DEMF.tmInverse(crs, x0 + 57.5 * step, y0 - 15.5 * step), p = DEMF.postOf(r, ll[0], ll[1]);
  near(p[0], 57, 1e-5); near(p[1], 15, 1e-5);
});

test('GeoTIFF: big endian classic, PackBits, UInt8; user-defined transverse Mercator; strips', async () => {
  const W = 40, H = 30, v = new Array(W * H);
  for (let i = 0; i < v.length; i++) v[i] = (i * 7) % 251;
  const buf = T.tiff({ le: false, type: 'u8', comp: 32773, rows: 7, images: [{ w: W, h: H, v }],
    keys: [[1024, 1], [1025, 1], [3072, 32767], [3075, 1], [3076, 9001]],
    doubles: [[3080, [45]], [3081, [0]], [3082, [500000]], [3083, [0]], [3092, [1]]], tie: [0, 0, 0, 500000, 2700000, 0], scale: [10, 10, 0] });
  const read = T.reader(buf), r = await DEMF.open('tiff', read, buf.length, 'tm.tif');
  assert.equal(r.crs.kind, 'tm'); assert.equal(r.crs.lon0, 45); assert.equal(r.crs.k0, 1);
  assert.equal(r.compression, 'PackBits');
  for (const [c, row] of [[0, 0], [39, 29], [11, 7], [11, 6], [20, 14]]) assert.equal(await post(r, read, c, row), v[row * W + c]);
});

test('DTED level 1', async () => {
  const n = 121, buf = T.dted(46, 24, n, 30, 1, (lon, lat) => (lon > 46.05 && lat > 24.09 ? null : T.elev(lon, lat) - 700));
  assert.equal(DEMF.sniff('n24.dt1', new Uint8Array(buf.subarray(0, 4)), buf.length), 'dted');
  const read = T.reader(buf), r = await DEMF.open('dted', read, buf.length, 'n24.dt1');
  assert.equal(r.format, 'DTED Level 1'); assert.equal(r.width, n); assert.equal(r.height, n);
  const d = 3 / 3600;
  near(r.bbox[0], 46 - d / 2, 1e-9); near(r.bbox[1], 24 - d / 2, 1e-9);
  // row 0 is the north edge; post (c, row) is at lon0 + c d, lat0 + (n - 1 - row) d
  for (const [c, row] of [[0, 120], [0, 0], [17, 60], [60, 100]]) {
    const want = Math.round(T.elev(46 + c * d, 24 + (n - 1 - row) * d) - 700);
    assert.equal(await post(r, read, c, row), want, 'post ' + c + ',' + row);
  }
  assert.ok(Number.isNaN(await post(r, read, 100, 2)), 'void');
  assert.equal(r.area, 1); // 3 arc seconds: Area 1
  const p = DEMF.postOf(r, 46 + 17 * d, 24 + 60 * d);
  near(p[0], 17, 1e-6); near(p[1], 60, 1e-6);
});

test('SRTM .hgt', async () => {
  const n = 121, buf = T.hgt(24, 46, n, (lon, lat) => (lon < 46.01 && lat < 24.01 ? null : T.elev(lon, lat)));
  assert.equal(DEMF.sniff('N24E046.hgt', null, buf.length), 'hgt');
  const read = T.reader(buf), r = await DEMF.open('hgt', read, buf.length, 'N24E046.hgt');
  assert.equal(r.width, n); const d = 1 / (n - 1);
  assert.equal(await post(r, read, 30, 40), Math.round(T.elev(46 + 30 * d, 25 - 40 * d)));
  assert.ok(Number.isNaN(await post(r, read, 0, n - 1)));
  near(r.bbox[2], 47 + d / 2, 1e-9);
  await assert.rejects(DEMF.open('hgt', read, buf.length, 'terrain.hgt'), /not an SRTM/);
});

test('ESRI ASCII grid: CR LF lines, centres, nodata, .prj UTM, thinning', async () => {
  const buf = T.asc(46.2, 24.3, 0.001, 50, 40, (x, y) => (x > 46.24 ? null : T.elev(x, y)), true);
  assert.equal(DEMF.sniff('dem.asc', new Uint8Array(buf.subarray(0, 64)), buf.length), 'asc');
  const read = T.reader(buf), r = await DEMF.open('asc', read, buf.length, 'dem.asc');
  assert.equal(r.crs.kind, 'geo'); assert.equal(r.pointIs, 'point'); assert.equal(r.width, 50); assert.equal(r.height, 40);
  assert.equal(r.warnings.length, 0, r.warnings.join());
  // row 0 is the north edge; post (c, row) at x0 + c cs, y0 + (nr - 1 - row) cs
  near(await post(r, read, 10, 5), T.elev(46.2 + 10 * 0.001, 24.3 + 34 * 0.001), 0.006);
  assert.ok(Number.isNaN(await post(r, read, 45, 5)));
  const thin = await DEMF.open('asc', T.reader(buf), buf.length, 'dem.asc', { maxPosts: 250 });
  assert.equal(thin.thin, 3); assert.equal(thin.width, 17);
  near(await post(thin, null, 3, 2), T.elev(46.2 + 9 * 0.001, 24.3 + 33 * 0.001), 0.006);
  const ub = T.asc(600000, 2700000, 30, 10, 10, () => 5, false);
  const utm = await DEMF.open('asc', T.reader(ub), ub.length, 'u.asc', { prj: 'PROJCS["WGS_1984_UTM_Zone_38N",GEOGCS["GCS_WGS_1984"]]' });
  assert.equal(utm.crs.kind, 'tm'); assert.equal(utm.crs.lon0, 45);
});

test('not terrain', async () => {
  assert.equal(DEMF.sniff('a.xml', new Uint8Array(Buffer.from('<?xml version')), 100), null);
  await assert.rejects(DEMF.open('tiff', T.reader(Buffer.from('II*\u0000\u0008\u0000\u0000\u0000\u0000\u0000', 'latin1')), 10, 'e.tif'), /no image|not a TIFF/);
});
