// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Terrain test files written from a known elevation function, so a reader can be checked post by post:
// GeoTIFF / BigTIFF (tiled or striped, little or big endian, LZW / Deflate / PackBits, horizontal and floating-point
// predictors, overviews, GeoKeys, GDAL nodata and metadata), DTED, SRTM .hgt and ESRI ASCII grid.
// The terrain is fictitious (hills over central Arabia).
const zlib = require('zlib');

// elevation in metres of a point
function elev(lon, lat) { return 600 + 300 * Math.sin((lon - 46) * 6) * Math.cos((lat - 24) * 5) + 40 * (lon - 46); }

/* ---------------------------------------------------------------- encoders */
// TIFF LZW: MSB-first codes, 9-12 bits, early change, clear code first, end of information last
function lzwEncode(data) {
  const out = [];
  let acc = 0, nacc = 0, dict = new Map(), next = 258, width = 9, w = -1;
  function put(code) {
    acc = (acc << width) | code; nacc += width;
    while (nacc >= 8) { out.push((acc >>> (nacc - 8)) & 0xff); nacc -= 8; }
    acc &= (1 << nacc) - 1;
  }
  function added() {
    next++;
    if (next === 4094) { put(256); dict = new Map(); next = 258; width = 9; } else if (next > (1 << width) - 1 && width < 12) width++;
  }
  put(256);
  for (let i = 0; i < data.length; i++) {
    const byte = data[i];
    if (w < 0) { w = byte; continue; }
    const hit = dict.get(w * 256 + byte);
    if (hit !== undefined) { w = hit; continue; }
    put(w);
    dict.set(w * 256 + byte, next);
    added();
    w = byte;
  }
  if (w >= 0) { put(w); added(); }
  put(257);
  if (nacc > 0) out.push((acc << (8 - nacc)) & 0xff);
  return Buffer.from(out);
}
function packbitsEncode(data) {
  const out = [];
  let i = 0;
  while (i < data.length) {
    let r = 1;
    while (i + r < data.length && r < 128 && data[i + r] === data[i]) r++;
    if (r >= 3) { out.push(257 - r, data[i]); i += r; continue; }
    let j = i;
    while (j < data.length && j - i < 128 && !(j + 2 < data.length && data[j] === data[j + 1] && data[j] === data[j + 2])) j++;
    out.push(j - i - 1); for (let k = i; k < j; k++) out.push(data[k]);
    i = j;
  }
  return Buffer.from(out);
}

/* -------------------------------------------------------------------- TIFF */
const SAMPLE = { 'u8': [1, 8], 'i16': [2, 16], 'u16': [1, 16], 'i32': [2, 32], 'f32': [3, 32], 'f64': [3, 64] };
// numbers into a buffer in the file's byte order (64-bit: offsets and counts of BigTIFF)
function w16(b, v, p, le) { if (le) b.writeUInt16LE(v, p); else b.writeUInt16BE(v, p); }
function w32(b, v, p, le) { if (le) b.writeUInt32LE(v, p); else b.writeUInt32BE(v, p); }
function w64(b, v, p, le) { const hi = Math.floor(v / 4294967296), lo = v >>> 0; if (le) { w32(b, lo, p, le); w32(b, hi, p + 4, le); } else { w32(b, hi, p, le); w32(b, lo, p + 4, le); } }
function wf32(b, v, p, le) { if (le) b.writeFloatLE(v, p); else b.writeFloatBE(v, p); }
function wf64(b, v, p, le) { if (le) b.writeDoubleLE(v, p); else b.writeDoubleBE(v, p); }
// one block (tile or strip) of values -> stored bytes
function encodeBlock(vals, cols, rows, o) {
  const [sf, bps] = SAMPLE[o.type], bytes = bps / 8, n = cols * rows, le = o.le;
  let buf = Buffer.alloc(n * bytes);
  const write = (i, v) => {
    if (sf === 3) { if (bps === 32) wf32(buf, v, i * 4, le); else wf64(buf, v, i * 8, le); } else if (bps === 8) buf[i] = v & 0xff;
    else if (bps === 16) w16(buf, v & 0xffff, i * 2, le);
    else w32(buf, v >>> 0, i * 4, le);
  };
  if (o.pred === 3) {
    // floating point: each row's bytes regrouped most significant first, then differenced
    for (let r = 0; r < rows; r++) {
      const be = Buffer.alloc(cols * bytes), row = Buffer.alloc(cols * bytes);
      for (let c = 0; c < cols; c++) { if (bps === 32) be.writeFloatBE(vals[r * cols + c], c * 4); else be.writeDoubleBE(vals[r * cols + c], c * 8); }
      for (let c = 0; c < cols; c++) for (let k = 0; k < bytes; k++) row[k * cols + c] = be[c * bytes + k];
      for (let i = row.length - 1; i > 0; i--) row[i] = (row[i] - row[i - 1]) & 0xff;
      row.copy(buf, r * cols * bytes);
    }
  } else {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let v = vals[r * cols + c];
        if (o.pred === 2 && c > 0) v = v - vals[r * cols + c - 1]; // horizontal differencing (wraps when stored)
        write(r * cols + c, v);
      }
    }
  }
  if (o.comp === 5) buf = lzwEncode(buf);
  else if (o.comp === 8) buf = zlib.deflateSync(buf);
  else if (o.comp === 32773) buf = packbitsEncode(buf);
  return buf;
}
// values of an image for a block: full tile (padded with the edge value) or strip
function blockVals(img, x0, y0, cols, rows) {
  const v = new Array(cols * rows);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = Math.min(img.w - 1, x0 + c), y = Math.min(img.h - 1, y0 + r);
    v[r * cols + c] = img.v[y * img.w + x];
  }
  return v;
}
// o: {le, big, type, comp, pred, tile: [tw, th] | rows (per strip), images: [{w, h, v, empty(bx, by)}],
//     keys: [[id, value]], doubles: [[id, [values]]], ascii: [[id, text]], tie: [i, j, k, x, y, z], scale: [sx, sy, 0],
//     nodata, gdal}; images after the first are reduced-resolution copies (overviews)
function tiff(o) {
  const le = o.le !== false, big = !!o.big, [sf, bps] = SAMPLE[o.type];
  const parts = [], hdrLen = big ? 16 : 8, L8 = big ? 16 : 4;
  let at = hdrLen;
  const add = (b) => { const off = at; parts.push(b); at += b.length; if (at % 2) { parts.push(Buffer.alloc(1)); at++; } return off; };
  const dirs = o.images.map((img, n) => {
    const tw = o.tile ? o.tile[0] : img.w, th = o.tile ? o.tile[1] : Math.min(img.h, o.rows || img.h);
    const nbx = Math.ceil(img.w / tw), nby = Math.ceil(img.h / th), offs = [], cnts = [];
    for (let by = 0; by < nby; by++) for (let bx = 0; bx < nbx; bx++) {
      const rows = o.tile ? th : Math.min(th, img.h - by * th);
      if (img.empty && img.empty(bx, by)) { offs.push(0); cnts.push(0); continue; } // a block with no data
      const b = encodeBlock(blockVals(img, bx * tw, by * th, tw, rows), tw, rows, Object.assign({}, o, { le }));
      offs.push(add(b)); cnts.push(b.length);
    }
    const t = [[254, 4, [n ? 1 : 0]], [256, 4, [img.w]], [257, 4, [img.h]], [258, 3, [bps]], [259, 3, [o.comp || 1]], [262, 3, [1]], [277, 3, [1]], [284, 3, [1]], [339, 3, [sf]]];
    if (o.pred && o.pred > 1) t.push([317, 3, [o.pred]]);
    if (o.tile) t.push([322, 3, [tw]], [323, 3, [th]], [324, L8, offs], [325, L8, cnts]);
    else t.push([273, L8, offs], [278, 4, [th]], [279, L8, cnts]);
    if (n === 0) {
      if (o.scale) t.push([33550, 12, o.scale]);
      if (o.tie) t.push([33922, 12, o.tie]);
      if (o.keys) {
        const dbl = [], ent = [];
        let ascii = '';
        o.keys.forEach(([id, v]) => ent.push([id, 0, 1, v]));
        (o.doubles || []).forEach(([id, vals]) => { ent.push([id, 34736, vals.length, dbl.length]); dbl.push(...vals); });
        (o.ascii || []).forEach(([id, txt]) => { ent.push([id, 34737, txt.length + 1, ascii.length]); ascii += txt + '|'; });
        ent.sort((a, b) => a[0] - b[0]);
        t.push([34735, 3, [1, 1, 0, ent.length].concat(...ent)]);
        if (dbl.length) t.push([34736, 12, dbl]);
        if (ascii) t.push([34737, 2, ascii]);
      }
      if (o.gdal) t.push([42112, 2, o.gdal]);
      if (o.nodata !== undefined) t.push([42113, 2, String(o.nodata)]);
    }
    return t.sort((a, b) => a[0] - b[0]);
  });
  // directories after the data, each followed by the values that do not fit in its entries
  const SZ = { 2: 1, 3: 2, 4: 4, 12: 8, 16: 8 };
  const enc = (type, vals) => {
    if (type === 2) return Buffer.from(vals + '\u0000', 'latin1');
    const b = Buffer.alloc(vals.length * SZ[type]);
    vals.forEach((v, i) => {
      const p = i * SZ[type];
      if (type === 3) w16(b, v, p, le);
      else if (type === 4) w32(b, v, p, le);
      else if (type === 12) wf64(b, v, p, le);
      else w64(b, v, p, le);
    });
    return b;
  };
  const ifdOffs = [], ifdBufs = [], ES = big ? 20 : 12, inl = big ? 8 : 4;
  dirs.forEach((t) => {
    const ifd = Buffer.alloc((big ? 8 : 2) + t.length * ES + (big ? 8 : 4));
    ifdOffs.push(at); ifdBufs.push(ifd);
    at += ifd.length; parts.push(ifd);
    if (big) w64(ifd, t.length, 0, le); else w16(ifd, t.length, 0, le);
    t.forEach(([tag, type, vals], i) => {
      const e = (big ? 8 : 2) + i * ES, data = enc(type, vals), count = type === 2 ? data.length : vals.length, vo = e + (big ? 12 : 8);
      w16(ifd, tag, e, le); w16(ifd, type, e + 2, le);
      if (big) w64(ifd, count, e + 4, le); else w32(ifd, count, e + 4, le);
      if (data.length <= inl) { data.copy(ifd, vo); return; }
      const off = add(data);
      if (big) w64(ifd, off, vo, le); else w32(ifd, off, vo, le);
    });
  });
  // links to the next directory, and the header
  ifdBufs.forEach((ifd, i) => { const p = (big ? 8 : 2) + dirs[i].length * ES, nxt = ifdOffs[i + 1] || 0; if (big) w64(ifd, nxt, p, le); else w32(ifd, nxt, p, le); });
  const h = Buffer.alloc(hdrLen);
  h.write(le ? 'II' : 'MM', 0, 'latin1');
  if (big) { w16(h, 43, 2, le); w16(h, 8, 4, le); w64(h, ifdOffs[0], 8, le); } else { w16(h, 42, 2, le); w32(h, ifdOffs[0], 4, le); }
  return Buffer.concat([h].concat(parts));
}

/* --------------------------------------------------------- other formats */
// DTED: 3428-byte header (UHL, DSI, ACC), one record per longitude column, south to north, signed magnitude
function dted(lon0, lat0, n, spacingTenthArcsec, level, valueAt) {
  const d = spacingTenthArcsec / 36000;
  const dms = (v, lon) => { const h = v < 0 ? (lon ? 'W' : 'S') : (lon ? 'E' : 'N'); v = Math.abs(v); const D = Math.floor(v), M = Math.floor((v - D) * 60), S = Math.round(((v - D) * 60 - M) * 60); return String(D).padStart(3, '0') + String(M).padStart(2, '0') + String(S).padStart(2, '0') + h; };
  const uhl = ('UHL1' + dms(lon0, true) + dms(lat0, false).replace(/^0?/, '0') + String(spacingTenthArcsec).padStart(4, '0') + String(spacingTenthArcsec).padStart(4, '0') + '0030' + 'U  ' + '            ' + String(n).padStart(4, '0') + String(n).padStart(4, '0') + '0' + ' '.repeat(24)).padEnd(80, ' ');
  const dsi = ('DSIU' + ' '.repeat(55) + 'DTED' + level).padEnd(648, ' ');
  const acc = 'ACC'.padEnd(2700, ' ');
  const head = Buffer.from(uhl.slice(0, 80) + dsi + acc, 'latin1');
  const recLen = 12 + 2 * n, body = Buffer.alloc(recLen * n);
  for (let c = 0; c < n; c++) {
    const o = c * recLen;
    body[o] = 0xAA; body.writeUIntBE(c, o + 1, 3); body.writeUInt16BE(c, o + 4); body.writeUInt16BE(0, o + 6);
    for (let k = 0; k < n; k++) {
      let v = valueAt(lon0 + c * d, lat0 + k * d);
      if (v === null) v = -32767;
      const m = Math.abs(Math.round(v)), w = (v < 0 ? 0x8000 : 0) | (m & 0x7fff);
      body.writeUInt16BE(w, o + 8 + 2 * k);
    }
  }
  return Buffer.concat([head, body]);
}
// SRTM .hgt: n x n big-endian 16-bit posts, north row first, one degree from the name's south-west corner
function hgt(lat0, lon0, n, valueAt) {
  const b = Buffer.alloc(n * n * 2), d = 1 / (n - 1);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const v = valueAt(lon0 + c * d, lat0 + 1 - r * d);
    b.writeInt16BE(v === null ? -32768 : Math.round(v), (r * n + c) * 2);
  }
  return b;
}
// ESRI ASCII grid (posts at cell centres when center is true), \r\n line ends
function asc(x0, y0, cs, nc, nr, valueAt, center) {
  const lines = ['ncols ' + nc, 'nrows ' + nr, (center ? 'xllcenter ' : 'xllcorner ') + x0, (center ? 'yllcenter ' : 'yllcorner ') + y0, 'cellsize ' + cs, 'NODATA_value -9999'];
  for (let r = 0; r < nr; r++) {
    const row = [];
    for (let c = 0; c < nc; c++) {
      const x = center ? x0 + c * cs : x0 + (c + 0.5) * cs, y = center ? y0 + (nr - 1 - r) * cs : y0 + (nr - r - 0.5) * cs;
      const v = valueAt(x, y);
      row.push(v === null ? '-9999' : v.toFixed(2));
    }
    lines.push(row.join(' '));
  }
  return Buffer.from(lines.join('\r\n') + '\r\n', 'latin1');
}

// reader over a buffer, like File.slice(a, b).arrayBuffer()
function reader(buf) {
  const reads = [];
  const fn = async (off, len) => { reads.push([off, len]); return new Uint8Array(buf.buffer, buf.byteOffset + off, Math.max(0, Math.min(len, buf.length - off))); };
  fn.reads = reads;
  return fn;
}

module.exports = { elev, lzwEncode, packbitsEncode, tiff, dted, hgt, asc, reader };
