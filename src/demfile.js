/*!
 * AIXM Code Converter
 * Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com> - author of the AIXM Code Converter
 * SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE; keep this notice in all copies)
 * ==========================================================================
 * AIXM Code Converter - terrain data set readers (DEMF)
 * Terrain data sets (ICAO Annex 15 / PANS-AIM, Areas 1-4) are large rasters.
 * They are never read whole: a reader parses the header and then reads only
 * the blocks (tiles, strips, rows or columns) asked for, by byte range
 * (read(offset, length) -> Promise<Uint8Array>). Used in the terrain worker.
 *   GeoTIFF / BigTIFF : tiled or striped, little or big endian, 8/16/32-bit
 *                       integers, 32/64-bit floats, no compression, LZW,
 *                       Deflate, PackBits, horizontal and floating-point
 *                       predictors, internal overviews, GeoKeys (geographic,
 *                       Web Mercator, UTM and other transverse Mercator),
 *                       GDAL nodata and metadata
 *   DTED level 0/1/2  : UHL header, longitude records, signed-magnitude posts
 *   SRTM .hgt         : 1201 x 1201 or 3601 x 3601 big-endian posts
 *   ESRI ASCII grid   : read once in parts, thinned to a memory budget
 * Elevations are returned in metres as Float32 (no data = NaN).
 * ========================================================================== */
/* global fflate */
var DEMF = (function () {
  'use strict';

  /* ------------------------------------------------------- projections */
  var A = 6378137, F = 1 / 298.257223563, E2 = F * (2 - F), EP2 = E2 / (1 - E2), D2R = Math.PI / 180;
  var E4 = E2 * E2, E6 = E4 * E2;
  function mlen(phi) {
    return A * ((1 - E2 / 4 - 3 * E4 / 64 - 5 * E6 / 256) * phi - (3 * E2 / 8 + 3 * E4 / 32 + 45 * E6 / 1024) * Math.sin(2 * phi) +
      (15 * E4 / 256 + 45 * E6 / 1024) * Math.sin(4 * phi) - (35 * E6 / 3072) * Math.sin(6 * phi));
  }
  // transverse Mercator on the WGS 84 ellipsoid (USGS / Snyder series; mm-level within a UTM zone)
  function tmForward(p, lon, lat) {
    var phi = lat * D2R, lam = ((lon - p.lon0 + 540) % 360 - 180) * D2R;
    var s = Math.sin(phi), c = Math.cos(phi), t = Math.tan(phi);
    var N = A / Math.sqrt(1 - E2 * s * s), T = t * t, C = EP2 * c * c, a = lam * c, a2 = a * a;
    var x = p.k0 * N * (a + (1 - T + C) * a2 * a / 6 + (5 - 18 * T + T * T + 72 * C - 58 * EP2) * a2 * a2 * a / 120);
    var y = p.k0 * (mlen(phi) - mlen(p.lat0 * D2R) + N * t * (a2 / 2 + (5 - T + 9 * C + 4 * C * C) * a2 * a2 / 24 + (61 - 58 * T + T * T + 600 * C - 330 * EP2) * a2 * a2 * a2 / 720));
    return [(x + p.fe) / p.unit, (y + p.fn) / p.unit];
  }
  function tmInverse(p, X, Y) {
    var x = X * p.unit - p.fe, y = Y * p.unit - p.fn;
    var M = mlen(p.lat0 * D2R) + y / p.k0, mu = M / (A * (1 - E2 / 4 - 3 * E4 / 64 - 5 * E6 / 256));
    var se = Math.sqrt(1 - E2), e1 = (1 - se) / (1 + se), e12 = e1 * e1;
    var phi1 = mu + (3 * e1 / 2 - 27 * e12 * e1 / 32) * Math.sin(2 * mu) + (21 * e12 / 16 - 55 * e12 * e12 / 32) * Math.sin(4 * mu) +
      (151 * e12 * e1 / 96) * Math.sin(6 * mu) + (1097 * e12 * e12 / 512) * Math.sin(8 * mu);
    var s1 = Math.sin(phi1), c1 = Math.cos(phi1), t1 = Math.tan(phi1);
    var C1 = EP2 * c1 * c1, T1 = t1 * t1, N1 = A / Math.sqrt(1 - E2 * s1 * s1), R1 = A * (1 - E2) / Math.pow(1 - E2 * s1 * s1, 1.5), D = x / (N1 * p.k0), D2 = D * D;
    var phi = phi1 - (N1 * t1 / R1) * (D2 / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * EP2) * D2 * D2 / 24 + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * EP2 - 3 * C1 * C1) * D2 * D2 * D2 / 720);
    var lam = (D - (1 + 2 * T1 + C1) * D2 * D / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * EP2 + 24 * T1 * T1) * D2 * D2 * D / 120) / c1;
    return [p.lon0 + lam / D2R, phi / D2R];
  }
  var RM = 6378137;
  // crs: {kind: 'geo'} | {kind: 'merc'} | {kind: 'tm', lon0, lat0, k0, fe, fn, unit}
  function toCrs(crs, lon, lat) {
    if (crs.kind === 'geo') return [lon, lat];
    if (crs.kind === 'merc') return [RM * lon * D2R, RM * Math.log(Math.tan(Math.PI / 4 + Math.max(-85.06, Math.min(85.06, lat)) * D2R / 2))];
    return tmForward(crs, lon, lat);
  }
  function fromCrs(crs, x, y) {
    if (crs.kind === 'geo') return [x, y];
    if (crs.kind === 'merc') return [x / RM / D2R, (2 * Math.atan(Math.exp(y / RM)) - Math.PI / 2) / D2R];
    return tmInverse(crs, x, y);
  }
  function utm(zone, south, label) { return { kind: 'tm', lon0: -183 + 6 * zone, lat0: 0, k0: 0.9996, fe: 500000, fn: south ? 10000000 : 0, unit: 1, label: label + ' (UTM zone ' + zone + (south ? 'S' : 'N') + ')' }; }
  var GEO_CODES = { 4326: 'WGS 84', 4258: 'ETRS89', 4269: 'NAD83', 4019: 'GRS 1980', 4979: 'WGS 84 (3D)', 4937: 'ETRS89 (3D)', 4283: 'GDA94', 7844: 'GDA2020', 4167: 'NZGD2000', 4612: 'JGD2000', 6668: 'JGD2011', 4490: 'CGCS2000', 4674: 'SIRGAS 2000' };
  function crsFromEpsg(code) {
    if (GEO_CODES[code]) return { kind: 'geo', label: GEO_CODES[code] + ' (EPSG:' + code + ')' };
    if (code === 3857 || code === 900913 || code === 3785 || code === 102100 || code === 102113) return { kind: 'merc', label: 'Web Mercator (EPSG:' + code + ')' };
    if (code > 32600 && code <= 32660) return utm(code - 32600, false, 'WGS 84 (EPSG:' + code + ')');
    if (code > 32700 && code <= 32760) return utm(code - 32700, true, 'WGS 84 (EPSG:' + code + ')');
    if (code >= 25828 && code <= 25838) return utm(code - 25800, false, 'ETRS89 (EPSG:' + code + ')');
    if (code >= 26901 && code <= 26923) return utm(code - 26900, false, 'NAD83 (EPSG:' + code + ')');
    if (code >= 4521 && code <= 4554) return { kind: 'tm', lon0: 75 + 3 * (code - 4521), lat0: 0, k0: 1, fe: 500000, fn: 0, unit: 1, label: 'CGCS2000 3-degree Gauss-Kruger CM (EPSG:' + code + ')' };
    return null;
  }

  /* -------------------------------------------------------- byte reading */
  function view(u8) { return new DataView(u8.buffer, u8.byteOffset, u8.byteLength); }
  function u64(dv, o, le) { var a = dv.getUint32(o, le), b = dv.getUint32(o + 4, le); return le ? b * 4294967296 + a : a * 4294967296 + b; }

  /* ------------------------------------------------------- decompression */
  // TIFF LZW (MSB-first codes of 9-12 bits, "early change"); expected: decoded size when known
  function lzw(input, expected) {
    var out = new Uint8Array(expected || input.length * 4), op = 0;
    var prefix = new Int32Array(4096), suffix = new Uint8Array(4096), first = new Uint8Array(4096), len = new Uint16Array(4096);
    for (var i = 0; i < 256; i++) { suffix[i] = i; first[i] = i; len[i] = 1; prefix[i] = -1; }
    var next = 258, width = 9, old = -1, bit = 0, nbits = input.length * 8;
    function grow(n) { if (op + n <= out.length) return; var o = new Uint8Array(Math.max(out.length * 2, op + n)); o.set(out); out = o; }
    function emit(code) {
      var n = len[code]; grow(n);
      var p = op + n - 1, c = code;
      while (c >= 0 && p >= op) { out[p--] = suffix[c]; c = prefix[c]; }
      op += n;
    }
    while (bit + width <= nbits) {
      var code = 0, b = bit;
      for (var k = 0; k < width; k++, b++) code = (code << 1) | ((input[b >> 3] >> (7 - (b & 7))) & 1);
      bit += width;
      if (code === 257) break;
      if (code === 256) { next = 258; width = 9; old = -1; continue; }
      if (old < 0) { if (code > 255) break; emit(code); old = code; continue; }
      if (code < next) {
        emit(code);
        if (next < 4096) { prefix[next] = old; suffix[next] = first[code]; first[next] = first[old]; len[next] = len[old] + 1; next++; }
      } else {
        if (next < 4096) { prefix[next] = old; suffix[next] = first[old]; first[next] = first[old]; len[next] = len[old] + 1; next++; }
        emit(next - 1);
      }
      old = code;
      if (next + 1 >= (1 << width) && width < 12) width++;
    }
    return op === out.length ? out : out.subarray(0, op);
  }
  function packbits(input, expected) {
    var out = new Uint8Array(expected), op = 0, ip = 0;
    while (ip < input.length && op < expected) {
      var n = input[ip++];
      if (n < 128) { var c = n + 1; out.set(input.subarray(ip, ip + c), op); op += c; ip += c; }
      else if (n > 128) { var r = 257 - n, v = input[ip++]; out.fill(v, op, op + r); op += r; }
    }
    return out;
  }
  function inflate(input) {
    try { return fflate.unzlibSync(input); } catch (e) { return fflate.inflateSync(input); }
  }
  var COMPRESSION = { 1: 'none', 5: 'LZW', 8: 'Deflate', 32946: 'Deflate', 32773: 'PackBits', 7: 'JPEG', 34887: 'LERC', 50000: 'ZSTD', 34925: 'LZMA', 50001: 'WebP', 34712: 'JPEG 2000' };
  function decompress(code, data, expected) {
    if (code === 1) return data;
    if (code === 5) return lzw(data, expected);
    if (code === 8 || code === 32946) return inflate(data);
    if (code === 32773) return packbits(data, expected);
    throw new Error('compression ' + (COMPRESSION[code] || code) + ' is not supported');
  }

  /* ------------------------------------------------------------- TIFF tags */
  var TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 16: 8, 17: 8, 18: 8 };
  function values(dv, o, type, count, le) {
    if (type === 2) { var s = ''; for (var i = 0; i < count; i++) { var ch = dv.getUint8(o + i); if (ch) s += String.fromCharCode(ch); else s += '\u0000'; } return s; }
    var out = new Array(count), sz = TYPE_SIZE[type] || 1;
    for (var j = 0, p = o; j < count; j++, p += sz) {
      switch (type) {
        case 1: case 7: out[j] = dv.getUint8(p); break;
        case 6: out[j] = dv.getInt8(p); break;
        case 3: out[j] = dv.getUint16(p, le); break;
        case 8: out[j] = dv.getInt16(p, le); break;
        case 4: out[j] = dv.getUint32(p, le); break;
        case 9: out[j] = dv.getInt32(p, le); break;
        case 5: out[j] = dv.getUint32(p, le) / (dv.getUint32(p + 4, le) || 1); break;
        case 10: out[j] = dv.getInt32(p, le) / (dv.getInt32(p + 4, le) || 1); break;
        case 11: out[j] = dv.getFloat32(p, le); break;
        case 12: out[j] = dv.getFloat64(p, le); break;
        case 16: case 18: out[j] = u64(dv, p, le); break;
        case 17: out[j] = u64(dv, p, le); break;
        default: out[j] = dv.getUint8(p);
      }
    }
    return out;
  }
  // all image file directories: [{tag: value(s)}]
  async function readIfds(read, size) {
    var h = await read(0, 16), le = h[0] === 0x49, dv = view(h);
    if (!((h[0] === 0x49 && h[1] === 0x49) || (h[0] === 0x4D && h[1] === 0x4D))) throw new Error('not a TIFF file');
    var magic = dv.getUint16(2, le), big = magic === 43;
    if (magic !== 42 && magic !== 43) throw new Error('not a TIFF file');
    var off = big ? u64(dv, 8, le) : dv.getUint32(4, le), ifds = [], seen = {};
    while (off && off < size && ifds.length < 64 && !seen[off]) {
      seen[off] = 1;
      var cb = await read(off, big ? 8 : 2);
      if (cb.length < (big ? 8 : 2)) throw new Error('damaged TIFF directory (file cut short)');
      var cnt = view(cb), n = big ? u64(cnt, 0, le) : cnt.getUint16(0, le), esz = big ? 20 : 12;
      if (n > 4096) throw new Error('damaged TIFF directory');
      var raw = await read(off + (big ? 8 : 2), n * esz + (big ? 8 : 4)), tags = {}, later = [];
      if (raw.length < n * esz) throw new Error('damaged TIFF directory (file cut short)');
      if (raw.length < n * esz + (big ? 8 : 4)) { var full = new Uint8Array(n * esz + (big ? 8 : 4)); full.set(raw); raw = full; } // no link to a next directory
      var ev = view(raw);
      for (var i = 0; i < n; i++) {
        var e = i * esz, tag = ev.getUint16(e, le), type = ev.getUint16(e + 2, le), count = big ? u64(ev, e + 4, le) : ev.getUint32(e + 4, le);
        var bytes = count * (TYPE_SIZE[type] || 1), inline = big ? 8 : 4, vo = e + (big ? 12 : 8);
        if (bytes <= inline) tags[tag] = values(ev, vo, type, count, le);
        else later.push({ tag: tag, type: type, count: count, at: big ? u64(ev, vo, le) : ev.getUint32(vo, le), bytes: bytes });
      }
      for (var k = 0; k < later.length; k++) {
        var x = later[k];
        if (x.at + x.bytes > size) continue;
        tags[x.tag] = values(view(await read(x.at, x.bytes)), 0, x.type, x.count, le);
      }
      ifds.push(tags);
      off = big ? u64(ev, n * esz, le) : ev.getUint32(n * esz, le);
    }
    return { le: le, big: big, ifds: ifds };
  }
  function geoKeys(t) {
    var dir = t[34735], dbl = t[34736] || [], asc = t[34737] || '', out = {};
    if (!dir) return out;
    for (var i = 4; i + 3 < dir.length && i < 4 + dir[3] * 4; i += 4) {
      var id = dir[i], loc = dir[i + 1], cnt = dir[i + 2], v = dir[i + 3];
      if (loc === 0) out[id] = v;
      else if (loc === 34736) out[id] = cnt === 1 ? dbl[v] : dbl.slice(v, v + cnt);
      else if (loc === 34737) out[id] = String(asc).substr(v, cnt).replace(/[|\u0000]+$/, '');
    }
    return out;
  }
  var VERT = { 5773: 'EGM96 geoid (EPSG:5773)', 3855: 'EGM2008 geoid (EPSG:3855)', 5714: 'mean sea level (EPSG:5714)', 5703: 'NAVD88 (EPSG:5703)', 5701: 'ODN (EPSG:5701)', 4979: 'WGS 84 ellipsoid (EPSG:4979)', 5798: 'EGM84 geoid (EPSG:5798)', 7837: 'DHHN2016 (EPSG:7837)' };
  function crsFromKeys(k) {
    var model = k[1024], code;
    if (model === 2 || (!model && k[2048])) {
      code = k[2048];
      if (code === 32767 || !code) return { kind: 'geo', label: (k[2049] || 'geographic, user-defined') + ' (treated as WGS 84)' };
      return crsFromEpsg(code) || { kind: 'geo', label: 'geographic EPSG:' + code + ' (treated as WGS 84)' };
    }
    if (model === 1) {
      code = k[3072];
      if (code && code !== 32767) {
        var c = crsFromEpsg(code);
        if (c) return c;
        return { kind: 'unknown', label: 'projected EPSG:' + code + (k[3073] ? ' — ' + k[3073] : '') };
      }
      // user-defined projection: transverse Mercator from its parameters
      if (k[3075] === 1 || k[3075] === 2) {
        var unit = k[3076] === 9002 ? 0.3048 : k[3076] === 9003 ? 1200 / 3937 : 1;
        return { kind: 'tm', lon0: +k[3080] || +k[3088] || 0, lat0: +k[3081] || +k[3089] || 0, k0: +k[3092] || 1, fe: (+k[3082] || 0) * unit, fn: (+k[3083] || 0) * unit, unit: unit,
          label: 'transverse Mercator, user-defined' + (k[3073] ? ' — ' + k[3073] : '') };
      }
      return { kind: 'unknown', label: 'projected, not supported' + (k[3073] ? ' — ' + k[3073] : '') };
    }
    return { kind: 'unknown', label: k[1026] ? 'not given — ' + k[1026] : 'not given' };
  }
  var TYPE_NAME = { '1|8': 'UInt8', '2|8': 'Int8', '1|16': 'UInt16', '2|16': 'Int16', '1|32': 'UInt32', '2|32': 'Int32', '3|32': 'Float32', '3|64': 'Float64' };

  /* ---------------------------------------------------------------- GeoTIFF */
  async function openTiff(read, size, name) {
    var t = await readIfds(read, size), le = t.le, main = t.ifds[0];
    if (!main) throw new Error('no image in the TIFF file');
    var warn = [];
    var sf = (main[339] || [1])[0], bps = (main[258] || [8])[0], spp = (main[277] || [1])[0], comp = (main[259] || [1])[0], pred = (main[317] || [1])[0], planar = (main[284] || [1])[0];
    var tname = TYPE_NAME[sf + '|' + bps];
    if (!tname) throw new Error('sample type ' + sf + '/' + bps + '-bit is not supported');
    if (!COMPRESSION[comp] || [1, 5, 8, 32946, 32773].indexOf(comp) < 0) warn.push('Compression ' + (COMPRESSION[comp] || comp) + ' is not supported: the posts cannot be read.');
    if (spp >= 3 && bps === 8) warn.push('This looks like a picture (' + spp + ' colour bands), not elevations: band 1 is read as elevation.');
    var keys = geoKeys(main), crs = crsFromKeys(keys);
    var pointIs = keys[1025] === 2 ? 'point' : 'area';
    var vUnit = keys[4099] === 9002 ? 'ft' : keys[4099] === 9003 ? 'US ft' : 'm', vscale = vUnit === 'ft' ? 0.3048 : vUnit === 'US ft' ? 1200 / 3937 : 1;
    var vDatum = VERT[keys[4096]] || (keys[4096] && keys[4096] !== 32767 ? 'EPSG:' + keys[4096] : '') || (keys[4097] ? String(keys[4097]) : '');
    var nodata = main[42113] !== undefined ? parseFloat(String(main[42113]).replace(/\u0000/g, '').trim()) : undefined;
    var gdal = {};
    if (main[42112]) String(main[42112]).replace(/<Item name="([^"]+)"[^>]*>([^<]*)<\/Item>/g, function (m0, k, v) { gdal[k] = v; return m0; });
    if (gdal.AREA_OR_POINT && !keys[1025]) pointIs = /point/i.test(gdal.AREA_OR_POINT) ? 'point' : 'area';
    // pixel corner transform: x = gt[0] + c * gt[1] + r * gt[2], y = gt[3] + c * gt[4] + r * gt[5]
    var gt = null;
    if (main[34264] && main[34264].length >= 8) { var m = main[34264]; gt = [m[3], m[0], m[1], m[7], m[4], m[5]]; }
    else if (main[33922] && main[33550]) {
      var tp = main[33922], ps = main[33550];
      gt = [tp[3] - tp[0] * ps[0], ps[0], 0, tp[4] + tp[1] * ps[1], 0, -ps[1]];
    }
    if (gt && pointIs === 'point') { gt[0] -= 0.5 * gt[1] + 0.5 * gt[2]; gt[3] -= 0.5 * gt[4] + 0.5 * gt[5]; }
    if (!gt) warn.push('No georeferencing (tie point / pixel scale): the file cannot be placed on the map.');
    if (crs && crs.kind === 'unknown') warn.push('Coordinate reference system ' + crs.label + ': only geographic, Web Mercator and transverse Mercator (UTM) are supported.');
    var levels = [];
    t.ifds.forEach(function (d, i) {
      var nst = (d[254] || [0])[0];
      if (i > 0 && !(nst & 1)) return; // other images (not reduced-resolution copies)
      if (nst & 4) return; // transparency masks
      var lv = tiffLevel(d, read, le, { sf: sf, bps: bps, spp: spp, comp: comp, pred: pred, planar: planar, vscale: vscale, nodata: nodata });
      if (lv) levels.push(lv);
    });
    if (!levels.length) throw new Error('no image in the TIFF file');
    levels.sort(function (a, b) { return b.w - a.w; });
    var W = levels[0].w, H = levels[0].h;
    levels.forEach(function (l) { l.sx = W / l.w; l.sy = H / l.h; });
    var tiled = !!main[322];
    return finish({ format: t.big ? 'BigTIFF' : 'GeoTIFF', name: name, size: size, width: W, height: H, levels: levels, gt: gt, crs: crs, pointIs: pointIs,
      nodata: nodata, vUnit: vUnit, vDatum: vDatum, dataType: tname, compression: COMPRESSION[comp] || String(comp), predictor: pred === 2 ? 'horizontal' : pred === 3 ? 'floating point' : 'none',
      layout: tiled ? 'tiled ' + main[322][0] + ' × ' + main[323][0] : 'striped ' + ((main[278] || [H])[0]) + ' row(s)', overviews: levels.length - 1, bands: spp,
      byteOrder: le ? 'little endian' : 'big endian', meta: { software: main[305], date: main[306], description: main[270], copyright: main[33432], artist: main[315], citation: keys[1026] || keys[2049] || keys[3073], gdal: gdal },
      warnings: warn });
  }
  function tiffLevel(d, read, le, s) {
    var w = (d[256] || [0])[0], h = (d[257] || [0])[0];
    if (!w || !h) return null;
    var tiled = !!d[322], bw, bh, offs, cnts;
    if (tiled) { bw = d[322][0]; bh = d[323][0]; offs = d[324]; cnts = d[325]; }
    else { bw = w; bh = Math.min(h, (d[278] || [h])[0] || h); offs = d[273]; cnts = d[279]; }
    if (!offs || !cnts) return null;
    var nbx = Math.ceil(w / bw), nby = Math.ceil(h / bh), bytes = s.bps / 8;
    var comp = (d[259] || [s.comp])[0], pred = (d[317] || [s.pred])[0];
    return { w: w, h: h, bw: bw, bh: bh, nbx: nbx, nby: nby,
      read: async function (bx, by) {
        var i = by * nbx + bx, rows = tiled ? bh : Math.min(bh, h - by * bh), cols = bw;
        var spp = s.planar === 2 ? 1 : s.spp, n = cols * rows, out = new Float32Array(n);
        if (!cnts[i]) { out.fill(NaN); return { w: cols, h: rows, d: out }; }
        var raw = await read(offs[i], cnts[i]);
        var dec = decompress(comp, raw, n * spp * bytes);
        if (dec.length < n * spp * bytes) { var pad = new Uint8Array(n * spp * bytes); pad.set(dec); dec = pad; }
        if (pred === 3) {
          var rowBytes = cols * spp * bytes;
          for (var r = 0; r < rows; r++) floatPredictor(dec.subarray(r * rowBytes, (r + 1) * rowBytes), spp, bytes);
          toFloat(dec, out, n, spp, s, true, cols, 1);
        } else toFloat(dec, out, n, spp, s, le, cols, pred);
        return { w: cols, h: rows, d: out };
      } };
  }
  // undoes TIFF floating-point prediction on one row (bytes regrouped by significance, then differenced)
  function floatPredictor(row, stride, bps) {
    var n = row.length, i;
    for (i = stride; i < n; i++) row[i] = (row[i] + row[i - stride]) & 0xFF;
    var copy = row.slice(), wc = n / bps;
    for (i = 0; i < wc; i++) for (var b = 0; b < bps; b++) row[bps * i + b] = copy[(bps - b - 1) * wc + i];
  }
  function toFloat(bytes, out, n, spp, s, le, cols, pred) {
    var dv = view(bytes), bps = s.bps, sf = s.sf, step = spp * bps / 8, nd = s.nodata, vs = s.vscale, i, v, prev = 0;
    for (i = 0; i < n; i++) {
      var o = i * step;
      if (sf === 3) v = bps === 32 ? dv.getFloat32(o, le) : dv.getFloat64(o, le);
      else if (bps === 16) v = sf === 2 ? dv.getInt16(o, le) : dv.getUint16(o, le);
      else if (bps === 8) v = sf === 2 ? dv.getInt8(o) : dv.getUint8(o);
      else v = sf === 2 ? dv.getInt32(o, le) : dv.getUint32(o, le);
      if (pred === 2) {
        // horizontal differencing: running sum along the row, wrapped to the sample's integer type
        if (i % cols) {
          v = v + prev;
          if (bps === 16) v = sf === 2 ? (v << 16) >> 16 : v & 0xFFFF;
          else if (bps === 8) v = sf === 2 ? (v << 24) >> 24 : v & 0xFF;
          else v = sf === 2 ? v | 0 : v >>> 0;
        }
        prev = v;
      }
      out[i] = v;
    }
    for (i = 0; i < n; i++) { v = out[i]; out[i] = v !== v || v === nd || v < -1e6 ? NaN : v * vs; }
  }

  /* ------------------------------------------------------------------ DTED */
  // DDDMMSSH: degrees (2 or 3 digits), minutes, seconds, hemisphere
  function dms(t) {
    var m = /^(\d{2,3})(\d{2})(\d{2})(?:\.\d)?([NSEW])/.exec(t.trim());
    if (!m) return NaN;
    var v = +m[1] + m[2] / 60 + m[3] / 3600;
    return /[SW]/.test(m[4]) ? -v : v;
  }
  async function openDted(read, size, name) {
    var h = await read(0, 3428), txt = '';
    for (var i = 0; i < 80; i++) txt += String.fromCharCode(h[i]);
    if (txt.slice(0, 3) !== 'UHL') throw new Error('not a DTED file');
    var lon0 = dms(txt.slice(4, 12)), lat0 = dms(txt.slice(12, 20));
    var dLon = +txt.slice(20, 24) / 36000, dLat = +txt.slice(24, 28) / 36000, acc = txt.slice(28, 32).trim();
    var nLon = +txt.slice(47, 51), nLat = +txt.slice(51, 55);
    if (!(nLon > 1 && nLat > 1 && dLon > 0 && dLat > 0) || isNaN(lon0) || isNaN(lat0)) throw new Error('damaged DTED header');
    // data set identification record (648 bytes after the 80-byte UHL): product level "DTED0/1/2" at bytes 60-64
    var dsi = ''; for (var j = 80; j < 80 + 648 && j < h.length; j++) dsi += String.fromCharCode(h[j]);
    var level = /DTED([012])/.exec(dsi.slice(59, 64)), recLen = 12 + 2 * nLat, BW = 64;
    var lv = { w: nLon, h: nLat, bw: BW, bh: nLat, nbx: Math.ceil(nLon / BW), nby: 1, sx: 1, sy: 1,
      read: async function (bx) {
        var c0 = bx * BW, cols = Math.min(BW, nLon - c0), raw = await read(3428 + c0 * recLen, cols * recLen), out = new Float32Array(cols * nLat);
        for (var c = 0; c < cols; c++) {
          var base = c * recLen + 8;
          for (var k = 0; k < nLat; k++) {
            var hi = raw[base + 2 * k], lo = raw[base + 2 * k + 1], v = ((hi & 0x7F) << 8) | lo;
            if (hi & 0x80) v = -v;
            out[(nLat - 1 - k) * cols + c] = v === -32767 ? NaN : v;
          }
        }
        return { w: cols, h: nLat, d: out };
      } };
    var gt = [lon0 - dLon / 2, dLon, 0, lat0 + (nLat - 1) * dLat + dLat / 2, 0, -dLat];
    return finish({ format: 'DTED' + (level ? ' Level ' + level[1] : ''), name: name, size: size, width: nLon, height: nLat, levels: [lv], gt: gt,
      crs: { kind: 'geo', label: 'WGS 84 (DTED)' }, pointIs: 'point', nodata: -32767, vUnit: 'm', vDatum: 'mean sea level (DTED: EGM96)', dataType: 'Int16 (signed magnitude)',
      compression: 'none', predictor: 'none', layout: 'longitude records', overviews: 0, bands: 1, byteOrder: 'big endian',
      meta: { accuracy: acc && acc !== 'NA' ? +acc + ' m absolute vertical (90 %)' : '', security: txt.charAt(32) === 'U' ? 'unclassified' : txt.charAt(32) }, warnings: [] });
  }

  /* ------------------------------------------------------------------- HGT */
  async function openHgt(read, size, name) {
    var n = Math.round(Math.sqrt(size / 2)), m = /([NS])(\d{2})([EW])(\d{3})/i.exec(name);
    if (n * n * 2 !== size || !m) throw new Error('not an SRTM .hgt file (name like N24E046.hgt, ' + '1201 × 1201 or 3601 × 3601 posts)');
    var lat0 = (/S/i.test(m[1]) ? -1 : 1) * +m[2], lon0 = (/W/i.test(m[3]) ? -1 : 1) * +m[4], d = 1 / (n - 1), BH = 64;
    var lv = { w: n, h: n, bw: n, bh: BH, nbx: 1, nby: Math.ceil(n / BH), sx: 1, sy: 1,
      read: async function (bx, by) {
        var r0 = by * BH, rows = Math.min(BH, n - r0), raw = await read(r0 * n * 2, rows * n * 2), dv = view(raw), out = new Float32Array(rows * n);
        for (var i = 0; i < rows * n; i++) { var v = dv.getInt16(2 * i, false); out[i] = v === -32768 ? NaN : v; }
        return { w: n, h: rows, d: out };
      } };
    return finish({ format: 'SRTM HGT (' + Math.round(3600 / (n - 1)) + '″)', name: name, size: size, width: n, height: n, levels: [lv],
      gt: [lon0 - d / 2, d, 0, lat0 + 1 + d / 2, 0, -d], crs: { kind: 'geo', label: 'WGS 84 (SRTM)' }, pointIs: 'point', nodata: -32768, vUnit: 'm',
      vDatum: 'EGM96 geoid (SRTM)', dataType: 'Int16', compression: 'none', predictor: 'none', layout: 'rows', overviews: 0, bands: 1, byteOrder: 'big endian', meta: {}, warnings: [] });
  }

  /* -------------------------------------------------------- ESRI ASCII grid */
  // read once, in 8 MB parts; kept in memory, thinned (every k-th post) when larger than maxPosts
  async function openAsc(read, size, name, opts) {
    opts = opts || {};
    var CH = 8388608, pos = 0, hdr = {}, nums = 0, carry = '', decoder = new TextDecoder();
    var head = decoder.decode(await read(0, Math.min(size, 4096))), lines = head.split(/\r?\n/), hl = 0;
    for (; hl < lines.length; hl++) {
      var mm = /^\s*([A-Za-z_]+)\s+(\S+)/.exec(lines[hl]);
      if (!mm || /^[-+\d.]/.test(mm[1])) break;
      hdr[mm[1].toLowerCase()] = parseFloat(mm[2]);
    }
    var nc = hdr.ncols, nr = hdr.nrows, cs = hdr.cellsize || hdr.dx, csy = hdr.cellsize || hdr.dy || cs, nd = hdr.nodata_value;
    if (!(nc > 0 && nr > 0 && cs > 0)) throw new Error('not an ESRI ASCII grid (ncols, nrows, cellsize missing)');
    // the data start after the header lines (the header is ASCII: characters are bytes; \n or \r\n line ends)
    for (var q = 0; q < hl; q++) { var nl = head.indexOf('\n', pos); if (nl < 0) break; pos = nl + 1; }
    var k = Math.max(1, Math.ceil(Math.sqrt(nc * nr / (opts.maxPosts || 25000000)))), w = Math.ceil(nc / k), h = Math.ceil(nr / k), grid = new Float32Array(w * h);
    grid.fill(NaN);
    var row = 0, col = 0;
    while (pos < size && row < nr) {
      var txt = carry + decoder.decode(await read(pos, Math.min(CH, size - pos)), { stream: pos + CH < size });
      pos += CH;
      var last = pos >= size ? txt.length : Math.max(txt.lastIndexOf(' '), txt.lastIndexOf('\n'));
      carry = txt.slice(last);
      var part = txt.slice(0, last), re = /[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/g, x;
      while ((x = re.exec(part)) && row < nr) {
        if (row % k === 0 && col % k === 0) { var v = parseFloat(x[0]); grid[(row / k) * w + col / k] = v === nd ? NaN : v; }
        nums++;
        if (++col === nc) { col = 0; row++; }
      }
      if (opts.progress) opts.progress(Math.min(1, pos / size));
    }
    var x0 = hdr.xllcorner !== undefined ? hdr.xllcorner : hdr.xllcenter - cs / 2, y0 = hdr.yllcorner !== undefined ? hdr.yllcorner : hdr.yllcenter - csy / 2;
    var top = y0 + nr * csy, geoLike = Math.abs(x0) <= 360 && Math.abs(top) <= 90 && cs < 1;
    var crs = opts.prj ? prjCrs(opts.prj) : null;
    if (!crs) crs = geoLike ? { kind: 'geo', label: 'geographic (assumed: coordinates in degrees)' } : { kind: 'unknown', label: 'not given (add the .prj file)' };
    // thinned grid: post (c, r) is original post (c k, r k)
    var gt = [x0 + cs / 2 - cs * k / 2, cs * k, 0, top - csy / 2 + csy * k / 2, 0, -csy * k];
    var lv = { w: w, h: h, bw: w, bh: h, nbx: 1, nby: 1, sx: 1, sy: 1, mem: grid, read: async function () { return { w: w, h: h, d: grid }; } };
    var warn = [];
    if (nums < nc * nr) warn.push('The grid gives ' + nums.toLocaleString('en-US') + ' of ' + (nc * nr).toLocaleString('en-US') + ' posts.');
    if (k > 1) warn.push('Large grid kept at every ' + k + '. post (' + w + ' × ' + h + ') to stay within memory.');
    if (crs.kind === 'unknown') warn.push('Coordinate reference system not given: add the .prj file of the grid, or use GeoTIFF.');
    return finish({ format: 'ESRI ASCII grid', name: name, size: size, width: w, height: h, origWidth: nc, origHeight: nr, thin: k, levels: [lv], gt: gt, crs: crs,
      pointIs: hdr.xllcenter !== undefined ? 'point' : 'area', nodata: nd, vUnit: 'm', vDatum: '', dataType: 'text', compression: 'none', predictor: 'none',
      layout: 'text rows', overviews: 0, bands: 1, byteOrder: '', meta: {}, warnings: warn });
  }
  // WKT of a .prj file: geographic, Web Mercator or UTM
  function prjCrs(wkt) {
    var s = String(wkt || '');
    var z = /UTM[ _]?zone[ _]?(\d{1,2})\s*([NS])?/i.exec(s);
    if (z) return utm(+z[1], /S/i.test(z[2] || '') || /southern/i.test(s), 'from .prj');
    if (/Mercator_Auxiliary_Sphere|Pseudo.Mercator|Web.Mercator/i.test(s)) return { kind: 'merc', label: 'Web Mercator (from .prj)' };
    if (/^\s*GEOGCS/i.test(s) || /^\s*GEOGCRS/i.test(s)) return { kind: 'geo', label: 'geographic (from .prj)' };
    return null;
  }

  /* ---------------------------------------------------------- common part */
  // spacing, extent in degrees, PANS-AIM terrain area that the post spacing meets
  function finish(r) {
    r.warnings = r.warnings || [];
    var gt = r.gt;
    if (gt && r.crs && r.crs.kind !== 'unknown') {
      var W = r.width, H = r.height, pts = [], i;
      for (i = 0; i <= 8; i++) { pts.push([W * i / 8, 0]); pts.push([W * i / 8, H]); pts.push([0, H * i / 8]); pts.push([W, H * i / 8]); }
      var ll = pts.map(function (p) { return fromCrs(r.crs, gt[0] + p[0] * gt[1] + p[1] * gt[2], gt[3] + p[0] * gt[4] + p[1] * gt[5]); });
      var bb = [180, 90, -180, -90];
      ll.forEach(function (p) { bb[0] = Math.min(bb[0], p[0]); bb[1] = Math.min(bb[1], p[1]); bb[2] = Math.max(bb[2], p[0]); bb[3] = Math.max(bb[3], p[1]); });
      r.bbox = bb;
      r.corners = [[0, 0], [W, 0], [W, H], [0, H]].map(function (p) { return fromCrs(r.crs, gt[0] + p[0] * gt[1] + p[1] * gt[2], gt[3] + p[0] * gt[4] + p[1] * gt[5]); });
      var lat = (bb[1] + bb[3]) / 2, sx = Math.hypot(gt[1], gt[4]), sy = Math.hypot(gt[2], gt[5]);
      if (r.crs.kind === 'geo') { r.spacingArcsec = [sx * 3600, sy * 3600]; r.spacingM = [sx * 111320 * Math.cos(lat * D2R), sy * 110574]; }
      else {
        var k = r.crs.kind === 'merc' ? Math.cos(lat * D2R) : 1, u = r.crs.unit || 1;
        r.spacingM = [sx * u * k, sy * u * k];
        r.spacingArcsec = [r.spacingM[0] / (30.87 * Math.cos(lat * D2R)), r.spacingM[1] / 30.87];
      }
      // the PANS-AIM area whose post spacing the grid meets (0.3", 0.6", 1", 3" are about 9, 19, 31 and 93 m; 15 %
      // margin), on the coarser axis in metres: grids that widen the longitude spacing towards the poles still count
      var a = Math.max(r.spacingM[0], r.spacingM[1]);
      r.area = a <= 10.7 ? 4 : a <= 21.3 ? 3 : a <= 35.5 ? 2 : a <= 106.5 ? 1 : 0;
      // inverse of the corner transform (crs -> fractional pixel)
      var det = gt[1] * gt[5] - gt[2] * gt[4];
      r.inv = [gt[5] / det, -gt[2] / det, -gt[4] / det, gt[1] / det];
    } else r.area = null;
    if (r.thin) r.spacingNote = 'every ' + r.thin + '. post kept';
    return r;
  }
  // fractional post index (level 0) of a point, or null outside
  function postOf(r, lon, lat) {
    var p = toCrs(r.crs, lon, lat), gt = r.gt, dx = p[0] - gt[0], dy = p[1] - gt[3], inv = r.inv;
    return [inv[0] * dx + inv[1] * dy - 0.5, inv[2] * dx + inv[3] * dy - 0.5];
  }
  function crsOfPost(r, c, row) { var gt = r.gt; return [gt[0] + (c + 0.5) * gt[1] + (row + 0.5) * gt[2], gt[3] + (c + 0.5) * gt[4] + (row + 0.5) * gt[5]]; }

  /* ------------------------------------------------------------ recognise */
  // format of a terrain file from its name and first bytes, or null
  function sniff(name, head, size) {
    var n = String(name || '').toLowerCase();
    if (head && head.length >= 4) {
      if ((head[0] === 0x49 && head[1] === 0x49 && (head[2] === 42 || head[2] === 43) && head[3] === 0) ||
          (head[0] === 0x4D && head[1] === 0x4D && head[2] === 0 && (head[3] === 42 || head[3] === 43))) return 'tiff';
      if (head[0] === 0x55 && head[1] === 0x48 && head[2] === 0x4C) return 'dted';
    }
    if (/\.hgt$/.test(n)) { var s = Math.round(Math.sqrt(size / 2)); if (s * s * 2 === size) return 'hgt'; }
    if (/\.(asc|grd|txt)$/.test(n) && head) {
      var t = ''; for (var i = 0; i < Math.min(head.length, 200); i++) t += String.fromCharCode(head[i]);
      if (/^\s*ncols\s+\d+/i.test(t)) return 'asc';
    }
    if (/\.dt[012]$/.test(n)) return 'dted';
    return null;
  }
  function open(kind, read, size, name, opts) {
    if (kind === 'tiff') return openTiff(read, size, name);
    if (kind === 'dted') return openDted(read, size, name);
    if (kind === 'hgt') return openHgt(read, size, name);
    if (kind === 'asc') return openAsc(read, size, name, opts);
    return Promise.reject(new Error('not a terrain file'));
  }
  // PANS-AIM Appendix 1 terrain data numerical requirements (post spacing, accuracy) per area
  var AREAS = {
    1: { spacing: '3 arc seconds (about 90 m)', vAcc: 30, hAcc: 50, vRes: '1 m', integrity: 'routine' },
    2: { spacing: '1 arc second (about 30 m)', vAcc: 3, hAcc: 5, vRes: '0.1 m', integrity: 'essential' },
    3: { spacing: '0.6 arc second (about 20 m)', vAcc: 0.5, hAcc: 0.5, vRes: '0.01 m', integrity: 'essential' },
    4: { spacing: '0.3 arc second (about 9 m)', vAcc: 1, hAcc: 2.5, vRes: '0.1 m', integrity: 'essential' }
  };

  return { sniff: sniff, open: open, postOf: postOf, crsOfPost: crsOfPost, toCrs: toCrs, fromCrs: fromCrs, crsFromEpsg: crsFromEpsg, prjCrs: prjCrs,
    lzw: lzw, packbits: packbits, AREAS: AREAS, tmForward: tmForward, tmInverse: tmInverse };
})();
if (typeof module !== 'undefined') module.exports = DEMF;
