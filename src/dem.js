/*!
 * AIXM Code Converter
 * Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com> - author of the AIXM Code Converter
 * SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE; keep this notice in all copies)
 * ==========================================================================
 * AIXM Code Converter - terrain data sets loaded by the user (DEM)
 * A terrain file stays on the disk: only its header is read when it is added, then only the blocks (tiles, strips,
 * columns) that a question needs, through File.slice. Decoded blocks are kept in a cache of limited size (least
 * recently used first out: 256 MB on a computer, 128 MB on a tablet, 64 MB on a phone), so files of many GB can be
 * used without filling the memory. Overviews inside a GeoTIFF serve the map at small scales.
 *   elevation(lon, lat)      bilinear between the 4 posts around the point, from the finest file covering it
 *   profile(points, step)    elevations along a line
 *   grid(bbox, w, h)         a w x h grid for the map, from the level whose spacing suits the scale
 *   scan(item)               statistics of a file (min, max, mean, voids, highest point), read block by block
 * Elevations in metres; null where no file covers the point or the post is a void.
 * ========================================================================== */
/* global DEMF, DEVICE */
var DEM = (function () {
  'use strict';
  var items = [], seq = 0, cache = new Map(), bytes = 0, subs = [];
  function budget() {
    var mb = typeof DEVICE !== 'undefined' && DEVICE.isPhone && DEVICE.isPhone() ? 64 : typeof DEVICE !== 'undefined' && DEVICE.isTablet && DEVICE.isTablet() ? 128 : 256;
    return mb * 1048576;
  }
  function reader(file) { return function (off, len) { return file.slice(off, off + len).arrayBuffer().then(function (b) { return new Uint8Array(b); }); }; }
  function changed() { subs.forEach(function (f) { try { f(); } catch (e) { /* a listener failed */ } }); }

  // add a terrain file: header only -> item {id, name, size, kind, r (reader result), status, stats}
  async function add(file, kind, opts) {
    var it = { id: ++seq, file: file, name: file.name, size: file.size, kind: kind, status: 'opening', r: null, stats: null, err: '' };
    items.push(it); changed();
    try {
      it.r = await DEMF.open(kind, reader(file), file.size, file.name, opts || {});
      it.status = 'ready';
    } catch (e) { it.status = 'error'; it.err = e.message; }
    changed();
    return it;
  }
  function remove(it) {
    items = items.filter(function (x) { return x !== it; });
    cache.forEach(function (v, k) { if (k.indexOf(it.id + ':') === 0) { bytes -= v.d.byteLength; cache.delete(k); } });
    changed();
  }
  // one decoded block (cached)
  async function block(it, li, bx, by) {
    var key = it.id + ':' + li + ':' + bx + ':' + by, hit = cache.get(key);
    if (hit) { cache.delete(key); cache.set(key, hit); return hit; }
    var b = await it.r.levels[li].read(bx, by);
    cache.set(key, b); bytes += b.d.byteLength;
    var lim = budget();
    for (var k of cache.keys()) { if (bytes <= lim) break; if (k === key) continue; bytes -= cache.get(k).d.byteLength; cache.delete(k); }
    return b;
  }
  // value of post (c, r) at level li (NaN when void / outside)
  async function post(it, li, c, r) {
    var lv = it.r.levels[li];
    if (c < 0 || r < 0 || c >= lv.w || r >= lv.h) return NaN;
    var bx = Math.floor(c / lv.bw), by = Math.floor(r / lv.bh), b = await block(it, li, bx, by);
    var cc = c - bx * lv.bw, rr = r - by * lv.bh;
    return cc < b.w && rr < b.h ? b.d[rr * b.w + cc] : NaN;
  }
  function covers(it, lon, lat) {
    var bb = it.r && it.r.bbox;
    return it.status === 'ready' && bb && lon >= bb[0] && lon <= bb[2] && lat >= bb[1] && lat <= bb[3] && it.r.crs.kind !== 'unknown';
  }
  async function sampleItem(it, lon, lat, li) {
    li = li || 0;
    var p = DEMF.postOf(it.r, lon, lat), lv = it.r.levels[li];
    if (!p) return null;
    var c = (p[0] + 0.5) / lv.sx - 0.5, r = (p[1] + 0.5) / lv.sy - 0.5, c0 = Math.floor(c), r0 = Math.floor(r), fx = c - c0, fy = r - r0;
    var v = [await post(it, li, c0, r0), await post(it, li, c0 + 1, r0), await post(it, li, c0, r0 + 1), await post(it, li, c0 + 1, r0 + 1)];
    var w = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy], s = 0, ws = 0;
    for (var i = 0; i < 4; i++) if (!isNaN(v[i])) { s += v[i] * w[i]; ws += w[i]; }
    return ws > 0.25 ? s / ws : null;
  }
  // finest file first
  function ordered() { return items.filter(function (x) { return x.status === 'ready'; }).sort(function (a, b) { return (Math.max.apply(null, a.r.spacingM || [1e9])) - (Math.max.apply(null, b.r.spacingM || [1e9])); }); }
  async function elevation(lon, lat) {
    var list = ordered();
    for (var i = 0; i < list.length; i++) {
      if (!covers(list[i], lon, lat)) continue;
      var h = await sampleItem(list[i], lon, lat, 0);
      if (h !== null) return { h: h, item: list[i] };
    }
    return null;
  }
  function has(lon, lat) { return items.some(function (it) { return covers(it, lon, lat); }); }
  // points [[lon, lat]...] -> [{lon, lat, d (NM from start), h or null}]; step in NM
  async function profile(pts, step) {
    step = step || 0.1;
    var out = [], dist = 0;
    for (var i = 0; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i + 1], dNm = gc(a, b), n = Math.max(1, Math.ceil(dNm / step));
      for (var k = 0; k < n; k++) {
        var f = k / n, lon = a[0] + (b[0] - a[0]) * f, lat = a[1] + (b[1] - a[1]) * f, e = await elevation(lon, lat);
        out.push({ lon: lon, lat: lat, d: dist + dNm * f, h: e ? e.h : null });
      }
      dist += dNm;
    }
    var last = pts[pts.length - 1], el = await elevation(last[0], last[1]);
    out.push({ lon: last[0], lat: last[1], d: dist, h: el ? el.h : null });
    return out;
  }
  function gc(a, b) { var R = Math.PI / 180, dLat = (b[1] - a[1]) * R, dLon = (b[0] - a[0]) * R, x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a[1] * R) * Math.cos(b[1] * R) * Math.sin(dLon / 2) * Math.sin(dLon / 2); return 3440.065 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)); }
  // w x h grid over bbox [w, s, e, n] (row 0 north), nearest post, from the level that suits the scale; NaN = none
  async function grid(bb, W, H) {
    var out = new Float32Array(W * H).fill(NaN), list = ordered().slice().reverse(); // coarse first, fine overwrites
    var degPx = (bb[2] - bb[0]) / W;
    for (var t = 0; t < list.length; t++) {
      var it = list[t], ib = it.r.bbox;
      if (ib[2] < bb[0] || ib[0] > bb[2] || ib[3] < bb[1] || ib[1] > bb[3] || it.r.crs.kind === 'unknown') continue;
      var spDeg = (it.r.spacingArcsec ? Math.max(it.r.spacingArcsec[0], it.r.spacingArcsec[1]) : 3) / 3600, li = 0;
      for (var l = 1; l < it.r.levels.length; l++) if (spDeg * it.r.levels[l].sx <= degPx * 1.5) li = l;
      var lv = it.r.levels[li];
      for (var y = 0; y < H; y++) {
        var lat = bb[3] - (y + 0.5) * (bb[3] - bb[1]) / H;
        for (var x = 0; x < W; x++) {
          var lon = bb[0] + (x + 0.5) * degPx;
          if (lon < ib[0] || lon > ib[2] || lat < ib[1] || lat > ib[3]) continue;
          var p = DEMF.postOf(it.r, lon, lat);
          if (!p) continue;
          var v = await post(it, li, Math.round((p[0] + 0.5) / lv.sx - 0.5), Math.round((p[1] + 0.5) / lv.sy - 0.5));
          if (!isNaN(v)) out[y * W + x] = v;
        }
      }
    }
    return out;
  }
  // statistics of a file, block by block on the coarsest level that has at most maxPosts posts (exact when level 0)
  async function scan(it, onProgress, maxPosts) {
    if (!it.r) return null;
    maxPosts = maxPosts || 40e6;
    // the finest level within the budget (level 0 when small enough), else the coarsest
    var li = it.r.levels.length - 1;
    for (var l = 0; l < it.r.levels.length; l++) { var L0 = it.r.levels[l]; if (L0.w * L0.h <= maxPosts) { li = l; break; } }
    var lv = it.r.levels[li], n = 0, voids = 0, sum = 0, min = Infinity, max = -Infinity, at = null, nb = lv.nbx * lv.nby, done = 0;
    for (var by = 0; by < lv.nby; by++) for (var bx = 0; bx < lv.nbx; bx++) {
      var b = await lv.read(bx, by), d = b.d; // not cached: a scan would push everything else out
      var rows = Math.min(b.h, lv.h - by * lv.bh), cols = Math.min(b.w, lv.w - bx * lv.bw);
      for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
        var v = d[r * b.w + c];
        if (v !== v) { voids++; continue; }
        n++; sum += v;
        if (v < min) min = v;
        if (v > max) { max = v; at = [bx * lv.bw + c, by * lv.bh + r]; }
      }
      if (++done % 8 === 0) { if (onProgress) onProgress(done / nb); await new Promise(function (res) { setTimeout(res, 0); }); }
    }
    var top = null;
    if (at) { var cr = DEMF.crsOfPost(it.r, (at[0] + 0.5) * lv.sx - 0.5, (at[1] + 0.5) * lv.sy - 0.5); top = DEMF.fromCrs(it.r.crs, cr[0], cr[1]); }
    it.stats = { posts: n + voids, voids: voids, min: n ? min : null, max: n ? max : null, mean: n ? sum / n : null, top: top, level: li, exact: li === 0 };
    changed();
    return it.stats;
  }
  return { add: add, remove: remove, items: function () { return items; }, elevation: elevation, has: has, profile: profile, grid: grid, scan: scan, cacheBytes: function () { return bytes; },
    onChange: function (f) { subs.push(f); }, distNM: gc };
})();
