/*!
 * AIXM Code Converter
 * Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com> - author of the AIXM Code Converter
 * SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE; keep this notice in all copies)
 * ==========================================================================
 * AIXM Code Converter - terrain model
 *   built-in : global elevation grid (0.25°, mean) and highest elevation per
 *              1° square, compiled by tools/build_terrain.js from the public
 *              Terrain Tiles (SRTM, GMTED2010, ETOPO1 ...). Works offline.
 *   online   : high-resolution Terrain Tiles (Terrarium PNG) loaded for the
 *              area being viewed when the computer is online.
 *   grid MORA: highest elevation per 1° square + 1000 ft (2000 ft above
 *              5000 ft), from the built-in grid - indicative only.
 * Elevations in metres (negative = sea / below sea level).
 * ========================================================================== */
/* global fflate */
var TERRAIN = (function () {
  'use strict';
  var mean = null, max = null, meta = null;
  var TILE = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
  var tiles = new Map(); // "z/x/y" -> Promise<Int16Array(256*256) | null>

  function unpack(o) {
    var bin = atob(o.data), u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    var raw = fflate.unzlibSync(u);
    return { w: o.w, h: o.h, res: o.res, a: new Int16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2) };
  }
  function load() {
    if (mean) return true;
    try {
      var el = document.getElementById('data-terrain');
      meta = JSON.parse(el.textContent);
      mean = unpack(meta.mean); max = unpack(meta.max);
      return true;
    } catch (e) { return false; }
  }
  function cell(g, c, r) { c = (c % g.w + g.w) % g.w; r = Math.max(0, Math.min(g.h - 1, r)); return g.a[r * g.w + c]; }
  // built-in elevation (m), bilinear between 0.25° cell centres
  function elev(lon, lat) {
    if (!load()) return 0;
    var x = (lon + 180) / mean.res - 0.5, y = (90 - lat) / mean.res - 0.5, c = Math.floor(x), r = Math.floor(y), fx = x - c, fy = y - r;
    var a = cell(mean, c, r), b = cell(mean, c + 1, r), d = cell(mean, c, r + 1), e = cell(mean, c + 1, r + 1);
    return (a * (1 - fx) + b * fx) * (1 - fy) + (d * (1 - fx) + e * fx) * fy;
  }
  // highest elevation (m) in the 1° square containing lon / lat
  function maxIn(lon, lat) { if (!load()) return 0; return cell(max, Math.floor(lon + 180), Math.floor(90 - lat)); }
  // grid MORA in feet (rounded up to 100 ft) for the 1° square
  function mora(lon, lat) {
    var mFt = Math.max(0, maxIn(lon, lat)) / 0.3048;
    return Math.ceil((mFt + (mFt > 5000 ? 2000 : 1000)) / 100) * 100;
  }

  /* ------------------------------------------------- online high resolution */
  function tileXY(lon, lat, z) {
    var n = Math.pow(2, z), r = lat * Math.PI / 180;
    return [(lon + 180) / 360 * n, (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n];
  }
  function getTile(z, x, y) {
    var key = z + '/' + x + '/' + y;
    if (tiles.has(key)) return tiles.get(key);
    var p = new Promise(function (resolve) {
      var img = new Image(), done = false;
      img.crossOrigin = 'anonymous';
      var t = setTimeout(function () { if (!done) { done = true; resolve(null); } }, 8000);
      img.onload = function () {
        if (done) return; done = true; clearTimeout(t);
        try {
          var c = document.createElement('canvas'); c.width = c.height = 256;
          var ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
          var d = ctx.getImageData(0, 0, 256, 256).data, out = new Int16Array(65536);
          for (var i = 0; i < 65536; i++) out[i] = Math.round(d[i * 4] * 256 + d[i * 4 + 1] + d[i * 4 + 2] / 256 - 32768);
          resolve(out);
        } catch (e) { resolve(null); }
      };
      img.onerror = function () { if (!done) { done = true; clearTimeout(t); resolve(null); } };
      img.src = TILE.replace('{z}', z).replace('{x}', x).replace('{y}', y);
    });
    tiles.set(key, p);
    return p;
  }
  // Loads online tiles for bbox [w, s, e, n]; resolves {sample(lon, lat) -> m, source, zoom} or null when offline.
  function area(bb, maxTiles) {
    maxTiles = maxTiles || 24;
    var z = 12, a, b;
    for (; z > 3; z--) {
      a = tileXY(bb[0], bb[3], z); b = tileXY(bb[2], bb[1], z);
      if ((Math.floor(b[0]) - Math.floor(a[0]) + 1) * (Math.floor(b[1]) - Math.floor(a[1]) + 1) <= maxTiles) break;
    }
    var list = [];
    for (var x = Math.floor(a[0]); x <= Math.floor(b[0]); x++) for (var y = Math.floor(a[1]); y <= Math.floor(b[1]); y++) list.push([x, y]);
    return Promise.all(list.map(function (q) { return getTile(z, q[0], q[1]).then(function (d) { return { x: q[0], y: q[1], d: d }; }); })).then(function (res) {
      var got = new Map(), ok = 0;
      res.forEach(function (r) { if (r.d) { got.set(r.x + '/' + r.y, r.d); ok++; } });
      if (ok < res.length * 0.6) return null;
      return {
        zoom: z, source: 'online Terrain Tiles, zoom ' + z,
        sample: function (lon, lat) {
          var p = tileXY(lon, lat, z), tx = Math.floor(p[0]), ty = Math.floor(p[1]), d = got.get(tx + '/' + ty);
          if (!d) return elev(lon, lat);
          var px = Math.min(255, Math.max(0, Math.floor((p[0] - tx) * 256))), py = Math.min(255, Math.max(0, Math.floor((p[1] - ty) * 256)));
          return d[py * 256 + px];
        }
      };
    });
  }

  return { load: load, elev: elev, maxIn: maxIn, mora: mora, area: area, source: function () { return load() ? meta.source : ''; } };
})();
