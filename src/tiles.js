/*!
 * AIXM Code Converter
 * Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com> - author of the AIXM Code Converter
 * SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE; keep this notice in all copies)
 * ==========================================================================
 * AIXM Code Converter - online base map tiles that never show "Map data not yet available" (TILES)
 * Where Esri has no map (open sea, remote land, or closer in than the last level of that map) its tile server answers with
 * a grey picture "Map data not yet available" and a normal success status: one and the same 2,521-byte JPEG for all of
 * its maps. Such a tile is recognised (size and checksum) and replaced by the part of the tile one level out (or further
 * out) that covers the same place, enlarged: the base map stays a map, plain at worst, never a wall of grey messages.
 * Every other server, and every tile that has data, loads as before. A server that refuses the tiles still raises
 * Leaflet's tileerror, which the maps use to fall back to another base map or to the offline map.
 * Used by: mapview.js (Map tab, map window), ddmap.js (Digital data maps), fltscene.js (flight and obstacle analysis,
 * also in its windows), amdbtrace.js (imagery for aerodrome mapping).
 * ========================================================================== */
/* global L */
var TILES = (function () {
  'use strict';
  // the placeholder tile of Esri: length and FNV-1a checksum of its bytes
  var config = { len: 2521, sum: 0x92d9118f };
  function sum(u8) { var h = 0x811c9dc5; for (var i = 0; i < u8.length; i++) { h ^= u8[i]; h = Math.imul(h, 0x01000193); } return h >>> 0; }
  function isPlaceholder(buf) { return buf.byteLength === config.len && sum(new Uint8Array(buf)) === config.sum; }

  var parents = new Map(), MAXP = 48; // the enlarged parents are shared by several tiles: the last ones are kept
  function grab(url, keep) {
    var c = keep && parents.get(url);
    if (c) return c;
    c = fetch(url, { mode: 'cors', credentials: 'omit', referrerPolicy: 'strict-origin-when-cross-origin' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.arrayBuffer();
    }).then(function (buf) { return isPlaceholder(buf) ? null : createImageBitmap(new Blob([buf])); });
    if (keep) {
      parents.set(url, c);
      c.catch(function () { parents.delete(url); }); // a tile that failed may be tried again
      if (parents.size > MAXP) parents.delete(parents.keys().next().value);
    }
    return c;
  }

  var Guarded = null;
  function guarded() {
    if (Guarded) return Guarded;
    Guarded = L.TileLayer.extend({
      urlOf: function (x, y, z) {
        return L.Util.template(this._url, L.extend({ r: '', s: this._getSubdomain({ x: x, y: y }), x: x, y: y, z: z }, this.options));
      },
      createTile: function (coords, done) {
        var layer = this, size = this.getTileSize(), tile = L.DomUtil.create('canvas', 'leaflet-tile');
        tile.width = size.x; tile.height = size.y; tile.setAttribute('role', 'presentation');
        tile.complete = false; // Leaflet drops tiles that are "not complete" when the zoom changes
        var z = this._getZoomForUrl(), floor = Math.max(this.options.minNativeZoom || 0, z - 12);
        // the tile itself, else the one level out, and so on, until a tile that has data
        function look(k) {
          return grab(layer.urlOf(coords.x >> k, coords.y >> k, z - k), k > 0).then(function (bmp) {
            if (bmp) return { bmp: bmp, k: k };
            return z - k > floor ? look(k + 1) : null;
          });
        }
        look(0).then(function (got) {
          if (got) {
            var s = 1 << got.k, w = got.bmp.width / s, h = got.bmp.height / s, ctx = tile.getContext('2d');
            ctx.drawImage(got.bmp, (coords.x & (s - 1)) * w, (coords.y & (s - 1)) * h, w, h, 0, 0, size.x, size.y);
          }
          tile.complete = true; done(null, tile);
        }, function (err) { tile.complete = true; done(err, tile); });
        return tile;
      }
    });
    return Guarded;
  }

  var api = {
    // a base map tile layer: Esri maps (the ones that answer "Map data not yet available") are guarded, others are plain
    layer: function (url, options) {
      var esri = /^https:\/\/server\.arcgisonline\.com\//.test(url) && typeof fetch === 'function' && typeof createImageBitmap === 'function' && typeof L !== 'undefined';
      return esri ? new (guarded())(url, options) : L.tileLayer(url, options);
    },
    isPlaceholder: isPlaceholder,
    sum: sum,
    config: config // the tests put their own placeholder here
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  return api;
}());
