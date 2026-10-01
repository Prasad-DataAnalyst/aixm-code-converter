/*!
 * AIXM Code Converter
 * Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com> - author of the AIXM Code Converter
 * SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE; keep this notice in all copies)
 * ==========================================================================
 * AIXM Code Converter - map view (Leaflet)
 * Offline vector base map (Natural Earth, built in), optional online layers
 * (OpenStreetMap and OSM-based styles), aeronautical overlays drawn on canvas
 * for speed, click-through to AIP / XML, measuring tool, compare overlay and a
 * static map renderer used for PNG / PDF snapshots.
 * Chart quality: all canvas layers are redrawn together once per frame with a
 * shared label-collision registry (no overlapping labels), navaid information
 * boxes (ident, frequency, channel), airspace labels (name, class, vertical
 * limits), route designator boxes, and the airport chart (adchart.js) with
 * the airport-view information card.
 * Terrain: grid MORA per 1° square (built-in terrain model), online terrain
 * shading, terrain elevation under the mouse, and the 3D view (view3d.js).
 * ========================================================================== */
/* global L, topojson, AX, MODEL, AIP, ADCHART, TERRAIN, VIEW3D */
var MAPVIEW = (function () {
  'use strict';
  var M = MODEL, s = M.s, arr = AX.arr;
  var map = null, hooks = null, el = {}, world50 = null, world10 = null, places = null;
  var base = { offline: null, current: 'offline', online: {} };
  var over = {}, vec = null, state = { ds: null, cmp: null, labels: true, measure: null, filters: {} };

  var COLORS = {
    fir: '#0b2a4a', cta: '#1d5f99', ctr: '#b3261e', atz: '#d9480f', prd: '#c2185b', mil: '#8d6e00', other: '#546e7a',
    route: '#2e7d32', rnav: '#00838f', rwy: '#212121', apron: '#8d6e63', obst: '#d32f2f', dp: '#1d5f99', nav: '#0b2a4a', ad: '#0b2a4a'
  };
  function asCat(t) {
    if (/^(FIR|UIR|NAS|OCA|UTA)/.test(t)) return 'fir';
    if (/^(CTA|TMA|OTA|SECTOR|AWY|RAS|ADV|UADV)/.test(t)) return 'cta';
    if (/^(CTR|MCTR)/.test(t)) return 'ctr';
    if (/^(ATZ|HTZ|TIZ|TIA|RMZ|TMZ)/.test(t)) return 'atz';
    if (/^(P|R|D)$/.test(t)) return 'prd';
    if (/^(TSA|TRA|CBA|MTR|MOA|ADIZ)/.test(t)) return 'mil';
    return 'other';
  }
  var AS_CATS = [['fir', 'FIR / UIR / OCA'], ['cta', 'CTA / TMA / sectors / airways'], ['ctr', 'CTR'], ['atz', 'ATZ / HTZ / RMZ / TMZ'], ['prd', 'Prohibited / Restricted / Danger'], ['mil', 'Military / TSA / TRA / ADIZ'], ['other', 'Other airspace']];

  /* ------------------------------------------------------- canvas layers */
  // All canvas layers are redrawn together, once per animation frame and in priority order (opts.prio,
  // lower first), sharing one label-collision registry `occ`, so labels of different layers never overlap.
  var live = [], frame = 0, occ = new ADCHART.Occ();
  function scheduleDraw() {
    if (frame) return;
    var raf = window.requestAnimationFrame || function (f) { return setTimeout(f, 16); };
    frame = raf(function () { frame = 0; drawAll(); });
  }
  function drawAll() {
    occ = new ADCHART.Occ();
    live.slice().sort(function (a, b) { return (a.options.prio || 50) - (b.options.prio || 50); }).forEach(function (l) { l._redraw(); });
  }
  function hideAll() { live.forEach(function (l) { l._hide(); }); }
  var CanvasLayer = L.Layer.extend({
    initialize: function (draw, opts) { this._drawFn = draw; L.setOptions(this, opts); },
    onAdd: function (m) {
      this._map = m;
      this._c = L.DomUtil.create('canvas', 'aixm-canvas');
      this._c.style.position = 'absolute';
      this._c.style.pointerEvents = 'none';
      m.getPane(this.options.pane || 'overlayPane').appendChild(this._c);
      if (live.indexOf(this) < 0) live.push(this);
      scheduleDraw();
    },
    onRemove: function () {
      L.DomUtil.remove(this._c);
      var i = live.indexOf(this); if (i >= 0) live.splice(i, 1);
      this._map = null;
    },
    _hide: function () { if (this._c) this._c.style.opacity = 0; },
    _redraw: function () {
      if (!this._map) return;
      var size = this._map.getSize(), dpr = window.devicePixelRatio || 1, c = this._c;
      c.width = size.x * dpr; c.height = size.y * dpr;
      c.style.width = size.x + 'px'; c.style.height = size.y + 'px';
      L.DomUtil.setPosition(c, this._map.containerPointToLayerPoint([0, 0]));
      var ctx = c.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size.x, size.y);
      c.style.opacity = 1;
      this._drawFn(ctx, this._map, size);
    },
    redraw: function () { scheduleDraw(); }
  });

  function project(m, lon, lat) { return m.latLngToContainerPoint([lat, lon]); }

  /* ------------------------------------------------------------- symbols */
  function sym(ctx, kind, x, y, color, sz) {
    sz = sz || 6;
    ctx.save();
    ctx.translate(x, y);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = color; ctx.fillStyle = color;
    var i;
    switch (kind) {
      case 'AD': case 'HP':
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, sz + 1.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, 0, sz - 2, 0, Math.PI * 2); ctx.fill();
        if (kind === 'HP') { ctx.fillStyle = '#fff'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('H', 0, 0.5); }
        for (i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.moveTo(0, sz + 1.5); ctx.lineTo(0, sz + 4.5); ctx.stroke(); }
        break;
      case 'VOR':
        ctx.beginPath(); for (i = 0; i < 6; i++) { var a = Math.PI / 3 * i; ctx.lineTo(Math.cos(a) * sz, Math.sin(a) * sz); } ctx.closePath(); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, 1.4, 0, Math.PI * 2); ctx.fill();
        break;
      case 'VOR_DME': case 'VORTAC':
        ctx.strokeRect(-sz, -sz * 0.8, sz * 2, sz * 1.6);
        ctx.beginPath(); for (i = 0; i < 6; i++) { var b = Math.PI / 3 * i; ctx.lineTo(Math.cos(b) * sz * 0.75, Math.sin(b) * sz * 0.75); } ctx.closePath(); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, 1.3, 0, Math.PI * 2); ctx.fill();
        break;
      case 'DME':
        ctx.strokeRect(-sz * 0.85, -sz * 0.85, sz * 1.7, sz * 1.7); ctx.beginPath(); ctx.arc(0, 0, 1.3, 0, Math.PI * 2); ctx.fill();
        break;
      case 'TACAN':
        ctx.beginPath(); ctx.moveTo(-sz, -sz * 0.4); ctx.lineTo(-sz * 0.4, -sz); ctx.lineTo(sz * 0.4, -sz); ctx.lineTo(sz, -sz * 0.4); ctx.lineTo(sz * 0.5, sz * 0.7); ctx.lineTo(-sz * 0.5, sz * 0.7); ctx.closePath(); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, 1.3, 0, Math.PI * 2); ctx.fill();
        break;
      case 'NDB':
        for (i = 0; i < 16; i++) { var c = Math.PI / 8 * i; ctx.beginPath(); ctx.arc(Math.cos(c) * sz, Math.sin(c) * sz, 0.9, 0, Math.PI * 2); ctx.fill(); }
        ctx.beginPath(); ctx.arc(0, 0, sz * 0.35, 0, Math.PI * 2); ctx.fill();
        break;
      case 'MKR':
        ctx.beginPath(); ctx.ellipse(0, 0, sz, sz * 0.45, 0, 0, Math.PI * 2); ctx.stroke();
        break;
      case 'ILS': case 'LOC':
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-sz * 1.2, sz * 2.2); ctx.lineTo(sz * 1.2, sz * 2.2); ctx.closePath(); ctx.globalAlpha = 0.25; ctx.fill(); ctx.globalAlpha = 1; ctx.stroke();
        break;
      case 'DP':
        ctx.beginPath(); ctx.moveTo(0, -sz * 0.9); ctx.lineTo(sz * 0.8, sz * 0.55); ctx.lineTo(-sz * 0.8, sz * 0.55); ctx.closePath(); ctx.stroke();
        break;
      case 'DPC':
        ctx.beginPath(); ctx.moveTo(0, -sz * 0.9); ctx.lineTo(sz * 0.8, sz * 0.55); ctx.lineTo(-sz * 0.8, sz * 0.55); ctx.closePath(); ctx.fill();
        break;
      case 'OBS':
        ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(-sz * 0.7, sz * 0.6); ctx.lineTo(0, -sz * 0.9); ctx.lineTo(sz * 0.7, sz * 0.6); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, sz * 0.25, 1.1, 0, Math.PI * 2); ctx.fill();
        break;
      case 'LGT':
        ctx.beginPath(); for (i = 0; i < 10; i++) { var r = i % 2 ? sz * 0.45 : sz; var d = Math.PI / 5 * i - Math.PI / 2; ctx.lineTo(Math.cos(d) * r, Math.sin(d) * r); } ctx.closePath(); ctx.fill();
        break;
      default:
        ctx.beginPath(); ctx.arc(0, 0, sz * 0.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  function navSym(r) {
    var t = s(r.cur.p.type);
    if (r.k === 'Navaid') {
      if (/VORTAC/.test(t)) return 'VORTAC';
      if (/VOR_DME|VOR\/DME/.test(t)) return 'VOR_DME';
      if (/^VOR/.test(t)) return 'VOR';
      if (/TACAN/.test(t)) return 'TACAN';
      if (/NDB/.test(t)) return 'NDB';
      if (/^DME/.test(t)) return 'DME';
      if (/ILS|LOC|MLS|TLS/.test(t)) return 'ILS';
      if (/MKR/.test(t)) return 'MKR';
      return 'VOR';
    }
    return { VOR: 'VOR', DME: 'DME', NDB: 'NDB', TACAN: 'TACAN', MarkerBeacon: 'MKR', Localizer: 'LOC', Glidepath: 'MKR' }[r.k] || 'VOR';
  }

  /* -------------------------------------------------------- point layers */
  // x: extra label lines shown from opt.detailZoom (e.g. navaid name + frequency), drawn in a box when opt.box
  function PointSet(name) { this.name = name; this.pts = []; this.grid = null; }
  PointSet.prototype.add = function (lon, lat, symk, color, labelTxt, rec, ds, x) { this.pts.push({ lon: lon, lat: lat, s: symk, c: color, t: labelTxt, r: rec, ds: ds, x: x || null }); };
  var LABEL_FONT = '"Segoe UI", system-ui, sans-serif';
  // Places a label next to a symbol: right, left, above or below, whichever is free; nothing when all collide.
  function placeLabel(ctx, x, y, lines, color, boxed, sz) {
    var lh = 13, w = 0;
    lines.forEach(function (l, i) { ctx.font = (i ? '500 10px ' : '700 11px ') + LABEL_FONT; w = Math.max(w, ctx.measureText(l).width); });
    var pad = boxed ? 4 : 1, bw = w + pad * 2, bh = lines.length * lh + (boxed ? 4 : 0), g = (sz || 6) + 4;
    var cand = [[g, -bh / 2], [-g - bw, -bh / 2], [-bw / 2, -g - bh], [-bw / 2, g]];
    for (var i = 0; i < cand.length; i++) {
      var bx = x + cand[i][0], by = y + cand[i][1], b = [bx, by, bx + bw, by + bh];
      if (!occ.fits(b)) continue;
      occ.add(b);
      if (boxed) {
        ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.strokeStyle = color; ctx.lineWidth = 1;
        ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(bx + 0.5, by + 0.5, bw - 1, bh - 1, 3); else ctx.rect(bx + 0.5, by + 0.5, bw - 1, bh - 1); ctx.fill(); ctx.stroke();
      }
      ctx.textBaseline = 'middle';
      lines.forEach(function (l, j) {
        ctx.font = (j ? '500 10px ' : '700 11px ') + LABEL_FONT;
        var tx = bx + pad, ty = by + (boxed ? 2 : 0) + lh * (j + 0.5);
        if (!boxed) { ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(255,255,255,.92)'; ctx.strokeText(l, tx, ty); }
        ctx.fillStyle = j ? '#33414f' : color; ctx.fillText(l, tx, ty);
      });
      return true;
    }
    return false;
  }
  function pointLayer(ps, opt) {
    opt = opt || {};
    var drawn = [];
    var layer = new CanvasLayer(function (ctx, m) {
      drawn = [];
      var b = m.getBounds().pad(0.05), z = m.getZoom(), vis = [];
      var w = b.getWest(), e = b.getEast(), so = b.getSouth(), n = b.getNorth();
      for (var i = 0; i < ps.pts.length; i++) {
        var p = ps.pts[i];
        if (p.lat < so || p.lat > n) continue;
        if (w <= e ? (p.lon < w || p.lon > e) : (p.lon < w && p.lon > e)) continue;
        if (opt.skip && opt.skip(p, z)) continue;
        vis.push(p);
      }
      var minZ = opt.minZoom || 0;
      if (z < minZ && vis.length > (opt.maxBelow || 300)) return drawCluster(ctx, m, vis, opt.color || '#0b2a4a');
      if (vis.length > (opt.cluster || 6000)) return drawCluster(ctx, m, vis, opt.color || '#0b2a4a');
      var showLabels = state.labels && vis.length <= (opt.maxLabels || 700) && z >= (opt.labelZoom || 0);
      var detail = showLabels && z >= (opt.detailZoom || 99) && vis.length <= (opt.maxDetail || 250);
      var sz = opt.size || 6, pts = vis.map(function (p) { var pt = project(m, p.lon, p.lat); return { x: pt.x, y: pt.y, p: p }; });
      pts.forEach(function (d) {
        sym(ctx, d.p.s, d.x, d.y, d.p.c, opt.size);
        drawn.push(d);
        occ.add([d.x - sz - 1, d.y - sz - 1, d.x + sz + 1, d.y + sz + 1]);
      });
      if (showLabels) pts.forEach(function (d) {
        if (!d.p.t) return;
        var lines = [d.p.t];
        if (detail && d.p.x) lines = lines.concat(d.p.x.filter(Boolean));
        placeLabel(ctx, d.x, d.y, lines, d.p.c, detail && opt.box && lines.length > 1, sz);
      });
    }, { pane: opt.pane || 'markerPane', prio: opt.prio });
    function drawCluster(ctx, m, vis, color) {
      var cell = 46, cells = new Map();
      vis.forEach(function (p) {
        var pt = project(m, p.lon, p.lat), k = Math.floor(pt.x / cell) + ':' + Math.floor(pt.y / cell);
        var c = cells.get(k);
        if (!c) cells.set(k, c = { x: 0, y: 0, n: 0, p: p });
        c.x += pt.x; c.y += pt.y; c.n++;
      });
      ctx.font = '700 11px "Segoe UI", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      cells.forEach(function (c) {
        var x = c.x / c.n, y = c.y / c.n, r = Math.min(22, 8 + Math.log2(c.n + 1) * 2.4);
        if (c.n === 1) { sym(ctx, c.p.s, x, y, c.p.c, opt.size); drawn.push({ x: x, y: y, p: c.p }); return; }
        ctx.globalAlpha = 0.85; ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.fillText(c.n > 999 ? Math.round(c.n / 100) / 10 + 'k' : c.n, x, y);
        drawn.push({ x: x, y: y, cluster: c });
      });
      ctx.textAlign = 'start';
    }
    layer.hit = function (cp) {
      var best = null, bd = 12 * 12;
      drawn.forEach(function (d) { var dx = d.x - cp.x, dy = d.y - cp.y, dd = dx * dx + dy * dy; if (dd < bd) { bd = dd; best = d; } });
      return best;
    };
    layer.ps = ps;
    return layer;
  }

  /* ------------------------------------------------------------ base map */
  function landStyle() {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    return { stroke: true, color: dark ? '#5a4a55' : '#b9aca4', weight: 0.8, fillColor: dark ? '#2a2229' : '#f3efe9', fillOpacity: 1, interactive: false };
  }
  function buildOffline() {
    var grp = L.layerGroup();
    var renderer = L.canvas({ padding: 0.3 });
    if (!world50) {
      var w = JSON.parse(document.getElementById('data-world50').textContent);
      world50 = topojson.feature(w, w.objects.countries);
    }
    var l50 = L.geoJSON(world50, { style: landStyle, renderer: renderer, interactive: false });
    var l10 = null;
    grp.addLayer(l50);
    function swap() {
      if (!map || !map.hasLayer(grp)) return;
      var z = map.getZoom();
      if (z >= 6) {
        if (!l10) {
          if (!world10) { var w10 = JSON.parse(document.getElementById('data-world10').textContent); world10 = topojson.feature(w10, w10.objects.countries); }
          l10 = L.geoJSON(world10, { style: landStyle, renderer: renderer, interactive: false });
        }
        if (grp.hasLayer(l50)) { grp.removeLayer(l50); grp.addLayer(l10); }
      } else if (l10 && grp.hasLayer(l10)) { grp.removeLayer(l10); grp.addLayer(l50); }
    }
    map.on('zoomend', swap);
    grp.restyle = function () { l50.setStyle(landStyle); if (l10) l10.setStyle(landStyle); };
    // graticule + place names
    var grat = new CanvasLayer(function (ctx, m, size) {
      var z = m.getZoom(), step = z < 4 ? 10 : z < 6 ? 5 : z < 8 ? 1 : 0.5;
      var b = m.getBounds(), dark = document.documentElement.getAttribute('data-theme') === 'dark';
      ctx.strokeStyle = dark ? 'rgba(255,255,255,.08)' : 'rgba(40,40,80,.10)'; ctx.lineWidth = 1;
      ctx.font = '10px ui-monospace, monospace'; ctx.fillStyle = dark ? 'rgba(255,255,255,.35)' : 'rgba(40,40,80,.4)';
      for (var lat = Math.ceil(Math.max(-85, b.getSouth()) / step) * step; lat <= Math.min(85, b.getNorth()); lat += step) {
        var a = project(m, b.getWest(), lat), c = project(m, b.getEast(), lat);
        ctx.beginPath(); ctx.moveTo(0, a.y); ctx.lineTo(size.x, c.y); ctx.stroke();
        ctx.fillText((Math.abs(lat) % 1 ? Math.abs(lat).toFixed(1) : Math.abs(lat)) + (lat >= 0 ? 'N' : 'S'), 4, a.y - 3);
      }
      for (var lon = Math.ceil(b.getWest() / step) * step; lon <= b.getEast(); lon += step) {
        var p = project(m, lon, b.getNorth());
        ctx.beginPath(); ctx.moveTo(p.x, 0); ctx.lineTo(p.x, size.y); ctx.stroke();
        var ln = ((lon + 540) % 360) - 180;
        ctx.fillText((Math.abs(ln) % 1 ? Math.abs(ln).toFixed(1) : Math.abs(ln)) + (ln >= 0 ? 'E' : 'W'), p.x + 3, size.y - 6);
      }
      if (!places) { try { places = JSON.parse(document.getElementById('data-places').textContent); } catch (e) { places = []; } }
      var maxRank = z < 3 ? 1 : z < 4 ? 3 : z < 5 ? 5 : z < 6 ? 7 : 10;
      ctx.font = '11px "Segoe UI", system-ui, sans-serif';
      places.forEach(function (pl) {
        if (pl[3] > maxRank) return;
        if (!b.contains([pl[2], pl[1]])) return;
        var q = project(m, pl[1], pl[2]);
        ctx.fillStyle = dark ? 'rgba(255,255,255,.55)' : 'rgba(60,50,55,.7)';
        ctx.beginPath(); ctx.arc(q.x, q.y, 2, 0, Math.PI * 2); ctx.fill();
        ctx.fillText(pl[0], q.x + 4, q.y - 4);
      });
    }, { pane: 'shadowPane' });
    grp.addLayer(grat);
    grp.grat = grat;
    return grp;
  }
  var ONLINE = {
    voyager: { name: 'OpenStreetMap – CARTO Voyager (recommended)', url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png', attr: '© OpenStreetMap contributors © CARTO', maxZoom: 20, sub: 'abcd' },
    osm: { name: 'OpenStreetMap (standard server – may refuse local files)', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attr: '© OpenStreetMap contributors', maxZoom: 19 },
    osmde: { name: 'OpenStreetMap (German style mirror)', url: 'https://tile.openstreetmap.de/{z}/{x}/{y}.png', attr: '© OpenStreetMap contributors', maxZoom: 18 },
    cartoLight: { name: 'OSM data – CARTO light', url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', attr: '© OpenStreetMap contributors © CARTO', maxZoom: 20, sub: 'abcd' },
    cartoDark: { name: 'OSM data – CARTO dark', url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', attr: '© OpenStreetMap contributors © CARTO', maxZoom: 20, sub: 'abcd' },
    topo: { name: 'OSM data – OpenTopoMap (terrain)', url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', attr: '© OpenStreetMap contributors, SRTM | © OpenTopoMap (CC-BY-SA)', maxZoom: 17, sub: 'abc' },
    esri: { name: 'Satellite imagery (Esri)', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attr: 'Tiles © Esri', maxZoom: 19 }
  };
  function setBase(key) {
    if (base.current === key && (key !== 'offline' || map.hasLayer(base.offline))) return;
    if (base.current === 'offline') map.removeLayer(base.offline);
    else if (base.online[base.current]) map.removeLayer(base.online[base.current]);
    base.current = key;
    if (key === 'offline') { map.addLayer(base.offline); base.offline.restyle(); return; }
    var d = ONLINE[key];
    if (!base.online[key]) {
      base.online[key] = L.tileLayer(d.url, { attribution: d.attr, maxZoom: d.maxZoom, subdomains: d.sub || 'abc', crossOrigin: true, referrerPolicy: 'strict-origin-when-cross-origin' });
      var errors = 0, loaded = 0;
      base.online[key].on('tileload', function () { loaded++; });
      base.online[key].on('tileerror', function () {
        if (++errors !== 5 || loaded) return;
        // The standard OSM servers refuse requests without a web-site referrer (a local file has none):
        // fall back to the same OpenStreetMap data served by CARTO, or to the offline map.
        if (key !== 'voyager' && key !== 'offline') {
          checkOnline(function (on) {
            if (base.current !== key) return;
            var to = on ? 'voyager' : 'offline';
            setBase(to); var sel = document.getElementById('map-base'); if (sel) sel.value = to;
            if (hooks) hooks.toast(on ? ONLINE[key].name + ' refused the tiles — switched to OpenStreetMap (CARTO Voyager).' : 'No internet — switched to the offline map.', 6000);
          });
        } else if (hooks) hooks.toast('Online map tiles are not loading (no internet or blocked). The offline map always works.');
      });
    }
    map.addLayer(base.online[key]);
    if (state.showOfflineBorders) { map.addLayer(base.offline); }
  }
  function saveBase(key) { try { localStorage.setItem('aixm-map-base', key); } catch (e) { /* storage unavailable */ } }
  function savedBase() { try { return localStorage.getItem('aixm-map-base') || ''; } catch (e) { return ''; } }
  function checkOnline(cb) {
    if (!navigator.onLine) { cb(false); return; }
    var img = new Image(), done = false;
    var t = setTimeout(function () { if (!done) { done = true; cb(false); } }, 4000);
    img.onload = function () { if (!done) { done = true; clearTimeout(t); cb(true); } };
    img.onerror = function () { if (!done) { done = true; clearTimeout(t); cb(false); } };
    img.src = 'https://a.basemaps.cartocdn.com/light_all/0/0/0.png?_=' + Date.now();
  }

  /* ------------------------------------------------------------ overlays */
  function ll(c) { return [c[1], c[0]]; }
  function ringsLL(g) { return g.c.map(function (ring) { return ring.filter(function (p) { return typeof p[0] === 'number'; }).map(ll); }); }
  function shapesOf(g, cb) {
    if (!g) return;
    if (g.t === 'M') { g.parts.forEach(function (x) { shapesOf(x, cb); }); return; }
    cb(g);
  }
  function popupHtml(ds, r) {
    var p = r.cur.p, sec = AIP.sectionOf(ds, r), rows = [];
    function kv(k, v) { if (v) rows.push('<div class="pop-kv"><b>' + k + ':</b> ' + esc(v) + '</div>'); }
    kv('Type', M.typeName(r) + (s(p.type) ? ' (' + s(p.type) + ')' : ''));
    kv('AIP', sec.no + (sec.ad ? ' ' + M.shortName(sec.ad) : ''));
    var pt = M.pointOf(ds, r);
    if (pt && r.k !== 'Airspace') kv('Position', AX.fmtPos(pt, 2));
    if (r.k === 'Airspace') { kv('Vertical', AIP.vertical(ds, r).replace(/\n/g, '; ')); kv('Class', AIP.airspaceClass(r).replace(/\n/g, '; ')); }
    if (p.frequency) kv('Frequency', M.fq(arr(p.frequency)[0]));
    if (r.k === 'VerticalStructure') { var part = arr(p.part)[0] || {}; kv('Height', M.fq(part.verticalExtent)); }
    kv('Effective', M.fmtTs(r.cur.b) + (r.cur.e ? ' – ' + M.fmtTs(r.cur.e) : ''));
    kv('Data set', ds.state + ' · ' + ds.name);
    if (r.k === 'AirportHeliport') { kv('Elevation', M.fq(p.fieldElevation)); kv('Runways', (AIP.directions(ds, r) || []).map(function (x) { return s(x.dir.cur.p.designator); }).filter(Boolean).join(' ')); }
    if (r.k === 'Runway') kv('Dimensions', [M.fq(p.nominalLength), M.fq(p.nominalWidth)].filter(Boolean).join(' x '));
    if (r.k === 'RunwayDirection') { kv('Bearing', [s(p.trueBearing) ? s(p.trueBearing) + '°T' : '', s(p.magneticBearing) ? s(p.magneticBearing) + '°M' : ''].filter(Boolean).join(' / ')); kv('TDZ elevation', M.fq(p.elevationTDZ)); }
    var ad = r.k === 'AirportHeliport' ? r : ds.owner.get(r);
    return '<div class="pop-title">' + esc(M.label(ds, r)) + '</div>' + rows.join('') +
      '<div class="pop-actions">' + (ad ? '<button data-act="adview">✈ Airport view</button>' : '') + '<button data-act="aip">AIP section</button><button data-act="xml">View AIXM</button><button data-act="detail">All data</button></div>';
  }
  function esc(t) { return String(t === undefined || t === null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function openPopup(ds, r, latlng) {
    var pop = L.popup({ maxWidth: 360 }).setLatLng(latlng).setContent(popupHtml(ds, r)).openOn(map);
    var node = pop.getElement();
    if (node) node.addEventListener('click', function (e) {
      var a = e.target.getAttribute && e.target.getAttribute('data-act');
      if (!a) return;
      if (a === 'adview') airportView(ds, r.k === 'AirportHeliport' ? r : ds.owner.get(r));
      if (a === 'aip') hooks.openAip(ds, r);
      if (a === 'xml') hooks.openXml(ds, r);
      if (a === 'detail') hooks.openDetail(ds, r);
    });
  }

  function buildOverlays(ds) {
    Object.keys(over).forEach(function (k) { if (map.hasLayer(over[k])) map.removeLayer(over[k]); });
    over = {};
    vec = vec || L.canvas({ padding: 0.4, tolerance: 4 });
    var T = ds.byType;
    // airspace by category
    AS_CATS.forEach(function (c) { over['as_' + c[0]] = L.layerGroup(); });
    (T.Airspace || []).forEach(function (a) {
      var t = s(a.cur.p.type), cat = asCat(t), col = COLORS[cat];
      shapesOf(M.geometry(ds, a), function (g) {
        var l;
        if (g.t === 'A') l = L.polygon(ringsLL(g), { renderer: vec, color: col, weight: cat === 'fir' ? 2.2 : 1.5, fillOpacity: cat === 'fir' ? 0.02 : 0.08, dashArray: cat === 'prd' || cat === 'mil' ? '6 4' : null });
        else if (g.t === 'L') l = L.polyline(g.c.map(ll), { renderer: vec, color: col, weight: 1.5 });
        if (!l) return;
        l.on('click', function (e) { openPopup(ds, a, e.latlng); });
        l.bindTooltip(esc(M.label(ds, a)), { sticky: true, direction: 'top', opacity: 0.9 });
        over['as_' + cat].addLayer(l);
      });
    });
    // routes
    over.routes = L.layerGroup();
    (T.RouteSegment || []).forEach(function (sg) {
      var g = M.geometry(ds, sg);
      if (!g || g.t !== 'L') return;
      var rnav = /RNAV|RNP/.test(s(sg.cur.p.navigationType));
      var l = L.polyline(g.c.map(ll), { renderer: vec, color: rnav ? COLORS.rnav : COLORS.route, weight: 2, opacity: 0.85 });
      l.on('click', function (e) { openPopup(ds, sg, e.latlng); });
      var rt = M.target(ds, sg.cur.p.routeFormed);
      l.bindTooltip(esc(rt ? M.routeDesignator(rt.cur.p) : M.label(ds, sg)), { sticky: true, opacity: 0.9 });
      over.routes.addLayer(l);
    });
    // runways, aprons, taxiways, AMDB surfaces (chart colours: runways dark, taxiways grey, aprons light grey,
    // guidance lines yellow); runways that the airport chart can draw get an invisible line for clicks only
    over.aerodrome = L.layerGroup();
    var charted = new Set();
    ADCHART.all(ds).forEach(function (m) { m.runways.forEach(function (rm) { charted.add(rm.rw); }); });
    (T.Runway || []).forEach(function (rw) {
      shapesOf(M.geometry(ds, rw), function (g) {
        var hidden = charted.has(rw) && g.t === 'L';
        var l = g.t === 'L' ? L.polyline(g.c.map(ll), { renderer: vec, color: COLORS.rwy, weight: hidden ? 10 : 5, opacity: hidden ? 0 : 0.85, lineCap: 'butt' })
          : g.t === 'A' ? L.polygon(ringsLL(g), { renderer: vec, color: '#1f2328', weight: 1, fillColor: ADCHART.COL.rwy, fillOpacity: 0.95 }) : null;
        if (!l) return;
        l.on('click', function (e) { openPopup(ds, rw, e.latlng); });
        over.aerodrome.addLayer(l);
      });
    });
    var SURF_STYLE = {
      Apron: ['#9aa4ae', '#c9cfd5', 0.9], ApronElement: ['#9aa4ae', '#c9cfd5', 0.9], Taxiway: ['#7f8891', '#a3abb3', 0.95], TaxiwayElement: ['#7f8891', '#a3abb3', 0.95],
      RunwayElement: ['#1f2328', ADCHART.COL.rwy, 0.95], TouchDownLiftOff: ['#1f2328', '#5b636b', 0.9], AircraftStand: ['#8a949e', '#d5dade', 0.9],
      RunwayProtectArea: ['#2e7d32', '#a5d6a7', 0.12], DeicingArea: ['#1565c0', '#90caf9', 0.45], WorkArea: ['#e65100', '#ffcc80', 0.5], GuidanceLine: ['#e0b100']
    };
    ['RunwayProtectArea', 'Apron', 'ApronElement', 'AircraftStand', 'DeicingArea', 'Taxiway', 'TaxiwayElement', 'TouchDownLiftOff', 'RunwayElement', 'WorkArea', 'GuidanceLine'].forEach(function (k) {
      var st = SURF_STYLE[k];
      (T[k] || []).forEach(function (r) {
        var g = M.findGeo(r.cur.p, k === 'GuidanceLine' ? ['L'] : ['A'], 0);
        if (!g) return;
        var l = g.t === 'A' ? L.polygon(ringsLL(g), { renderer: vec, color: st[0], weight: k === 'RunwayProtectArea' ? 1 : 0.6, fillColor: st[1], fillOpacity: st[2], dashArray: k === 'RunwayProtectArea' || k === 'WorkArea' ? '5 4' : null })
          : L.polyline(g.c.map(ll), { renderer: vec, color: st[0], weight: 1.3, opacity: 0.95 });
        l.on('click', function (e) { openPopup(ds, r, e.latlng); });
        l.bindTooltip(esc(M.label(ds, r)), { sticky: true, opacity: 0.9 });
        over.aerodrome.addLayer(l);
      });
    });
    // airport chart: runway surfaces and markings, ILS feathers, taxiway signs, stands (adchart.js)
    var adHits = [];
    over.adChart = new CanvasLayer(function (ctx, m) {
      adHits = [];
      var z = m.getZoom(), c = m.getCenter(), mpp = 40075016.686 * Math.cos(c.lat * Math.PI / 180) / Math.pow(2, z + 8);
      var bb = m.getBounds().pad(0.15), W = bb.getWest(), S = bb.getSouth(), E = bb.getEast(), N = bb.getNorth();
      ADCHART.draw(ctx, ds, { P: function (q) { var pt = project(m, q[0], q[1]); return [pt.x, pt.y]; }, mpp: mpp, k: 1, occ: occ, hits: adHits,
        vis: function (b) { return b[2] >= W && b[0] <= E && b[3] >= S && b[1] <= N; } });
    }, { pane: 'adPane', prio: 5 });
    over.adChart.hit = function (cp) {
      var best = null, bd = Infinity;
      adHits.forEach(function (h) { var dd = Math.hypot(h.x - cp.x, h.y - cp.y); if (dd <= h.rad && dd < bd) { bd = dd; best = h; } });
      return best ? { p: { ds: best.ds, r: best.r, lat: best.lat, lon: best.lon } } : null;
    };
    over.aerodrome.addLayer(over.adChart);
    over.aerodrome.count = (T.Runway || []).length + ['Apron', 'ApronElement', 'Taxiway', 'TaxiwayElement', 'AircraftStand', 'GuidanceLine', 'RunwayElement'].reduce(function (n, k) { return n + (T[k] || []).length; }, 0);
    // obstacle lines/areas
    over.obstLines = L.layerGroup();
    // point sets
    var ads = new PointSet('ad'), navs = new PointSet('nav'), dps = new PointSet('dp'), obs = new PointSet('obs'), lgt = new PointSet('lgt');
    (T.AirportHeliport || []).forEach(function (a) {
      var c = M.pointOf(ds, a), p = a.cur.p;
      if (c) ads.add(c[0], c[1], s(p.type) === 'HP' ? 'HP' : 'AD', COLORS.ad, M.shortName(a), a, ds, [s(p.name), M.fq(p.fieldElevation) ? 'ELEV ' + ADCHART.tidy(M.fq(p.fieldElevation)) : '']);
    });
    var usedEq = new Set();
    (T.Navaid || []).forEach(function (n) {
      var comps = arr(n.cur.p.navaidEquipment).map(function (c) { return c && c.theNavaidEquipment ? M.target(ds, c.theNavaidEquipment) : null; }).filter(Boolean);
      comps.forEach(function (t) { usedEq.add(t); });
      var c = M.pointOf(ds, n); if (c) navs.add(c[0], c[1], navSym(n), COLORS.nav, s(n.cur.p.designator), n, ds, navInfo(n, comps));
    });
    ['VOR', 'DME', 'NDB', 'TACAN', 'MarkerBeacon', 'Localizer', 'Glidepath'].forEach(function (k) {
      (T[k] || []).forEach(function (e) { if (usedEq.has(e)) return; var c = M.pointOf(ds, e); if (c) navs.add(c[0], c[1], navSym(e), COLORS.nav, s(e.cur.p.designator), e, ds, navInfo(e, [e])); });
    });
    (T.DesignatedPoint || []).forEach(function (d) { var c = M.pointOf(ds, d); if (c) dps.add(c[0], c[1], s(d.cur.p.type) === 'ICAO' ? 'DPC' : 'DP', COLORS.dp, s(d.cur.p.designator) || s(d.cur.p.name), d, ds); });
    // obstacles are labelled like a chart: top elevation, height in brackets (the name is in the pop-up);
    // buildings drawn grey, other obstacle areas and lines red
    (T.VerticalStructure || []).forEach(function (o) {
      var g = M.geometry(ds, o), lbl = obstLabel(o), bld = /BUILDING|TOWER|STADIUM|HANGAR|TERMINAL/.test(s(o.cur.p.type));
      shapesOf(g, function (x) {
        if (x.t === 'P') obs.add(x.c[0], x.c[1], 'OBS', COLORS.obst, lbl, o, ds);
        else {
          var l = x.t === 'L' ? L.polyline(x.c.map(ll), { renderer: vec, color: COLORS.obst, weight: 1.5, dashArray: '3 3' })
            : L.polygon(ringsLL(x), bld ? { renderer: vec, color: '#5f6870', weight: 1, fillColor: '#9aa2a9', fillOpacity: 0.75 } : { renderer: vec, color: COLORS.obst, weight: 1, fillOpacity: 0.15 });
          l.on('click', function (e) { openPopup(ds, o, e.latlng); });
          l.bindTooltip(esc(M.label(ds, o) + (lbl ? ' · ' + lbl : '')), { sticky: true, opacity: 0.9 });
          over.obstLines.addLayer(l);
        }
      });
    });
    (T.AeronauticalGroundLight || []).forEach(function (r) { var c = M.pointOf(ds, r); if (c) lgt.add(c[0], c[1], 'LGT', '#e65100', s(r.cur.p.name), r, ds); });
    // the aerodrome symbol gives way to the airport chart (ARP symbol, runways) once that is drawn in detail
    var adSkip = function (p, z) { return z >= 13 && !!ADCHART.of(ds, p.r); };
    over.pAd = pointLayer(ads, { size: 6, labelZoom: 5, detailZoom: 8, maxDetail: 120, skip: adSkip, prio: 10 });
    over.pNav = pointLayer(navs, { size: 6, labelZoom: 6, detailZoom: 8, maxDetail: 200, box: true, prio: 20 });
    over.pDp = pointLayer(dps, { size: 5, labelZoom: 7, color: COLORS.dp, prio: 30 });
    over.pObs = pointLayer(obs, { size: 5, labelZoom: 12, maxLabels: 200, color: COLORS.obst, cluster: 3000, minZoom: 8, maxBelow: 400, prio: 40 });
    over.pLgt = pointLayer(lgt, { size: 6, labelZoom: 8, prio: 35 });
    over.annot = annotLayer(ds);
    over.mora = moraLayer();
    over.hill = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}', { opacity: 0.38, maxZoom: 16, attribution: 'Hillshade © Esri', crossOrigin: true });
    over.hill.count = 0;
    over.obstacles = L.layerGroup([over.obstLines, over.pObs]);
    over.procs = buildProcs(ds, state.procAd && ds.recs.indexOf(state.procAd) >= 0 ? state.procAd : null);
    return over;
  }
  // navaid information box lines (shown from zoom 8): frequencies / DME channel, then type and name
  // ("112.40  CH 71X" / "VOR/DME DOHA"); ILS, localizers and markers are labelled by the airport chart
  function navInfo(n, comps) {
    var p = n.cur.p, type = s(p.type).replace(/_/g, '/');
    if (/ILS|LOC|MLS|MKR|GP|LDA|SDF/.test(type) || /Localizer|Glidepath|MarkerBeacon/.test(n.k)) return null;
    var f = [];
    comps.forEach(function (e) {
      var q = e.cur.p;
      if (e.k === 'DME' || e.k === 'TACAN') { if (s(q.channel)) f.push('CH ' + s(q.channel)); }
      else if (q.frequency) f.push(M.fq(q.frequency).replace(/\s*MHZ$/i, ''));
    });
    var name = s(p.name);
    if (name.length > 26) name = name.slice(0, 25) + '…';
    return [f.filter(function (x, i, a) { return x && a.indexOf(x) === i; }).join('  '), [type || (n.k !== 'Navaid' ? n.k : ''), name].filter(Boolean).join(' ')];
  }
  function obstLabel(o) {
    var part = arr(o.cur.p.part)[0] || {}, loc = part.horizontalProjection_location || part.horizontalProjection_surface || part.horizontalProjection_curve || {};
    var el = M.fq(arr(loc)[0] && arr(loc)[0].elevation), h = M.fq(part.verticalExtent);
    return ADCHART.tidy(el ? el + (h ? ' (' + h.replace(/\s*(M|FT)$/, '') + ')' : '') : h);
  }

  /* ---------------------------------------------- airspace and route labels */
  // Airspace: name, class and vertical limits (upper over lower) inside large enough areas;
  // routes: designator boxes at segment mid-points. Drawn last, so point labels win collisions.
  function annotLayer(ds) {
    var areas = [], segs = [];
    (ds.byType.Airspace || []).forEach(function (a) {
      var cat = asCat(s(a.cur.p.type)), vert = ADCHART.tidy(AIP.vertical(ds, a).split('\n')[0] || ''), cls = AIP.airspaceClass(a).split('\n').map(function (x) { return x.charAt(0); }).filter(Boolean);
      var lim = vert.split(' / ');
      shapesOf(M.geometry(ds, a), function (g) {
        if (g.t !== 'A') return;
        var ring = g.c[0].filter(function (p) { return typeof p[0] === 'number'; });
        if (ring.length < 3) return;
        var bb = [180, 90, -180, -90];
        ring.forEach(function (p) { bb[0] = Math.min(bb[0], p[0]); bb[1] = Math.min(bb[1], p[1]); bb[2] = Math.max(bb[2], p[0]); bb[3] = Math.max(bb[3], p[1]); });
        var c = [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2];
        if (!inRingLL(c, ring)) c = ring.reduce(function (acc, p) { return [acc[0] + p[0] / ring.length, acc[1] + p[1] / ring.length]; }, [0, 0]);
        if (!inRingLL(c, ring)) return;
        areas.push({ cat: cat, bb: bb, c: c, name: M.label(ds, a).split(' ').filter(function (w, i, l) { return w !== l[i - 1]; }).join(' '), cls: cls.filter(function (x, i, l) { return l.indexOf(x) === i; }).join('/'), up: lim[0] || '', lo: lim[1] || '' });
      });
    });
    (ds.byType.RouteSegment || []).forEach(function (sg) {
      var g = M.geometry(ds, sg), rt = M.target(ds, sg.cur.p.routeFormed);
      if (!g || g.t !== 'L' || !rt || g.c.length < 2) return;
      var a = g.c[0], b = g.c[g.c.length - 1];
      segs.push({ a: a, b: b, t: M.routeDesignator(rt.cur.p), rnav: /RNAV|RNP/.test(s(sg.cur.p.navigationType)) });
    });
    var layer = new CanvasLayer(function (ctx, m) {
      if (!state.labels) return;
      var z = m.getZoom(), bnd = m.getBounds(), W = bnd.getWest(), S = bnd.getSouth(), E = bnd.getEast(), N = bnd.getNorth();
      if (over.routes && map.hasLayer(over.routes) && z >= 6) {
        var seen = [];
        segs.forEach(function (sg) {
          var mid = [(sg.a[0] + sg.b[0]) / 2, (sg.a[1] + sg.b[1]) / 2];
          if (mid[0] < W || mid[0] > E || mid[1] < S || mid[1] > N) return;
          var A = project(m, sg.a[0], sg.a[1]), B = project(m, sg.b[0], sg.b[1]);
          if (Math.hypot(B.x - A.x, B.y - A.y) < 90) return;
          var q = project(m, mid[0], mid[1]);
          if (seen.some(function (x) { return x[0] === sg.t && Math.hypot(x[1] - q.x, x[2] - q.y) < 160; })) return;
          if (ADCHART.tag(ctx, { occ: occ }, [sg.t], q.x, q.y, { color: '#fff', bg: sg.rnav ? COLORS.rnav : COLORS.route, size: 10.5 })) seen.push([sg.t, q.x, q.y]);
        });
      }
      if (z < 5) return;
      areas.forEach(function (ar) {
        if (!over['as_' + ar.cat] || !map.hasLayer(over['as_' + ar.cat])) return;
        if (ar.bb[2] < W || ar.bb[0] > E || ar.bb[3] < S || ar.bb[1] > N) return;
        var p0 = project(m, ar.bb[0], ar.bb[3]), p1 = project(m, ar.bb[2], ar.bb[1]);
        if (p1.x - p0.x < 150 || p1.y - p0.y < 70) return;
        var q = project(m, ar.c[0], ar.c[1]), col = COLORS[ar.cat];
        var lines = [ar.name.length > 34 ? ar.name.slice(0, 33) + '…' : ar.name];
        if (ar.cls) lines.push('CLASS ' + ar.cls);
        ctx.font = '700 11px ' + LABEL_FONT;
        var w = Math.max(ctx.measureText(lines[0]).width, ar.cls ? ctx.measureText(lines[1]).width : 0, ctx.measureText(ar.up).width, ctx.measureText(ar.lo).width) + 10;
        var h = lines.length * 13 + (ar.up || ar.lo ? 30 : 0) + 4, b = [q.x - w / 2, q.y - h / 2, q.x + w / 2, q.y + h / 2];
        if (!occ.take(b)) return;
        ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fillRect(b[0], b[1], w, h);
        ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.strokeRect(b[0] + 0.5, b[1] + 0.5, w - 1, h - 1);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = col;
        lines.forEach(function (l, i) { ctx.font = (i ? '600 10px ' : '700 11px ') + LABEL_FONT; ctx.fillText(l, q.x, b[1] + 2 + 13 * (i + 0.5)); });
        if (ar.up || ar.lo) {
          var y0 = b[1] + 2 + lines.length * 13;
          ctx.font = '600 10.5px ' + LABEL_FONT; ctx.fillText(ar.up, q.x, y0 + 7);
          ctx.beginPath(); ctx.moveTo(q.x - w / 2 + 6, y0 + 15); ctx.lineTo(q.x + w / 2 - 6, y0 + 15); ctx.stroke();
          ctx.fillText(ar.lo, q.x, y0 + 23);
        }
        ctx.textAlign = 'start';
      });
    }, { pane: 'annotPane', prio: 90 });
    layer.count = areas.length + segs.length;
    return layer;
  }
  /* ------------------------------------------------------------ grid MORA */
  // Jeppesen-style grid MORA (thousands large, hundreds small) in every 1° square, from the built-in
  // terrain model: highest elevation + 1000 ft (2000 ft above 5000 ft). Indicative only.
  function moraLayer() {
    var layer = new CanvasLayer(function (ctx, m) {
      var z = m.getZoom();
      if (z < 5 || z > 10 || !TERRAIN.load()) return;
      var b = m.getBounds();
      for (var lo = Math.floor(b.getWest()); lo < b.getEast(); lo++) {
        for (var la = Math.floor(b.getSouth()); la < b.getNorth(); la++) {
          var v = TERRAIN.mora(lo + 0.5, la + 0.5), th = Math.floor(v / 1000), hu = Math.round((v % 1000) / 100);
          var c = project(m, lo + 0.5, la + 0.5), big = z >= 7 ? 30 : 22;
          ctx.font = '700 ' + big + 'px "Segoe UI", Arial, sans-serif';
          var w1 = ctx.measureText(String(th)).width;
          ctx.font = '700 ' + Math.round(big * 0.55) + 'px "Segoe UI", Arial, sans-serif';
          var w2 = ctx.measureText(String(hu)).width, x0 = c.x - (w1 + w2) / 2;
          var bx = [x0 - 2, c.y - big * 0.6, x0 + w1 + w2 + 2, c.y + big * 0.45];
          if (!occ.take(bx)) continue;
          ctx.globalAlpha = 0.55; ctx.fillStyle = '#7b3f99'; ctx.textBaseline = 'alphabetic';
          ctx.font = '700 ' + big + 'px "Segoe UI", Arial, sans-serif'; ctx.fillText(String(th), x0, c.y + big * 0.35);
          ctx.font = '700 ' + Math.round(big * 0.55) + 'px "Segoe UI", Arial, sans-serif'; ctx.fillText(String(hu), x0 + w1 + 1, c.y - big * 0.1);
          ctx.globalAlpha = 1;
        }
      }
    }, { pane: 'annotPane', prio: 95 });
    layer.count = 0;
    return layer;
  }
  function inRingLL(pt, r) {
    var ins = false;
    for (var i = 0, j = r.length - 1; i < r.length; j = i++) { var xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1]; if (((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi)) ins = !ins; }
    return ins;
  }

  var LAYER_DEF = [
    ['pAd', 'Aerodromes / heliports', true], ['aerodrome', 'Airport chart: runways, taxiways, aprons, stands, ILS', true], ['pNav', 'Radio navigation aids', true], ['pDp', 'Designated points', true],
    ['routes', 'ATS routes', true], ['procs', 'Instrument procedures (SID / STAR / approach)', false], ['obstacles', 'Obstacles', true], ['pLgt', 'Aeronautical ground lights', false],
    ['annot', 'Airspace and route labels', true], ['mora', 'Grid MORA (terrain, indicative)', false], ['hill', 'Terrain shading (online)', false]
  ];
  function applyLayers() {
    LAYER_DEF.forEach(function (d) {
      var on = state.filters[d[0]] !== undefined ? state.filters[d[0]] : d[2];
      if (!over[d[0]]) return;
      if (on && !map.hasLayer(over[d[0]])) map.addLayer(over[d[0]]);
      if (!on && map.hasLayer(over[d[0]])) map.removeLayer(over[d[0]]);
    });
    AS_CATS.forEach(function (c) {
      var k = 'as_' + c[0], on = state.filters[k] !== undefined ? state.filters[k] : c[0] !== 'fir' || true;
      if (!over[k]) return;
      if (on && !map.hasLayer(over[k])) map.addLayer(over[k]);
      if (!on && map.hasLayer(over[k])) map.removeLayer(over[k]);
    });
  }
  function currentLayers() {
    var o = {};
    LAYER_DEF.forEach(function (x) { o[x[0]] = state.filters[x[0]] !== undefined ? state.filters[x[0]] : x[2]; });
    AS_CATS.forEach(function (x) { o['as_' + x[0]] = state.filters['as_' + x[0]] !== undefined ? state.filters['as_' + x[0]] : true; });
    return o;
  }
  function countOf(k) {
    var l = over[k];
    if (!l) return 0;
    if (l.ps) return l.ps.pts.length;
    if (l.count !== undefined) return l.count;
    var n = 0; l.eachLayer(function (x) { n += x.ps ? x.ps.pts.length : x.getLayers ? x.getLayers().length : 1; });
    return n;
  }

  /* ------------------------------------------------ instrument procedures */
  var PROC_COL = { StandardInstrumentDeparture: '#1565c0', StandardInstrumentArrival: '#2e7d32', InstrumentApproachProcedure: '#8e24aa' };
  var PROC_K = { StandardInstrumentDeparture: 'SID', StandardInstrumentArrival: 'STAR', InstrumentApproachProcedure: 'IAP' };
  function project2(c, crs, nm) { return AX.dest(c[0], c[1], (crs + 360) % 360, nm); }
  // departure end of the runway used by a SID (threshold of the opposite direction)
  function sidStart(ds, proc) {
    var out = null;
    arr(proc.cur.p.flightTransition).forEach(function (tr) {
      arr(tr && tr.departureRunwayTransition).forEach(function (l) {
        arr(l && l.runway).forEach(function (x) {
          var rd = M.target(ds, x);
          if (out || !rd) return;
          var thr = M.pointOf(ds, rd), rw = M.target(ds, rd.cur.p.usedRunway), g = rw ? M.geometry(ds, rw) : null;
          if (g && g.t === 'L' && thr) out = AX.distNM(g.c[0], thr) > AX.distNM(g.c[1], thr) ? g.c[0] : g.c[1];
          else out = thr;
        });
      });
    });
    return out;
  }
  // -> [{leg, kind, coords:[[lon,lat],…], dashed, label}]
  function procPaths(ds, proc) {
    var legs = AIP.procLegs(ds, proc), out = [], prev = proc.k === 'StandardInstrumentDeparture' ? sidStart(ds, proc) : null, lastTr = null;
    legs.forEach(function (x) {
      var lp = x.leg.cur.p;
      if (x.tr !== lastTr && lastTr !== null && x.tr) prev = proc.k === 'StandardInstrumentDeparture' ? sidStart(ds, proc) : null;
      lastTr = x.tr;
      var tg = M.findGeo(lp.trajectory, ['L'], 0), a = M.segPoint(ds, arr(lp.startPoint)[0]) || prev, b = M.segPoint(ds, arr(lp.endPoint)[0]);
      var coords = null, dashed = x.leg.k === 'MissedApproachLeg';
      if (tg && tg.c && tg.c.length > 1) coords = tg.c;
      else if (a && b) coords = [a, b];
      else if (a && s(lp.course)) { var ln = lp.length && lp.length.v ? AX.toNM(+lp.length.v, lp.length.u) : 3; coords = [a, project2(a, +s(lp.course), Math.min(ln || 3, 10))]; dashed = true; }
      if (coords) { out.push({ leg: x.leg, coords: coords, dashed: dashed, label: [s(lp.legTypeARINC), M.segPointLabel(ds, arr(lp.endPoint)[0])].filter(Boolean).join(' → ') }); prev = coords[coords.length - 1]; }
    });
    return out;
  }
  function buildProcs(ds, onlyAd) {
    var grp = L.layerGroup(), n = 0;
    ['StandardInstrumentDeparture', 'StandardInstrumentArrival', 'InstrumentApproachProcedure'].forEach(function (k) {
      (ds.byType[k] || []).forEach(function (pr) {
        if (onlyAd && ds.owner.get(pr) !== onlyAd) return;
        if (state.procKinds && state.procKinds[PROC_K[k]] === false) return;
        var name = PROC_K[k] + ' ' + (s(pr.cur.p.designator) || s(pr.cur.p.name));
        procPaths(ds, pr).forEach(function (sg) {
          var l = L.polyline(sg.coords.map(ll), { renderer: vec, color: PROC_COL[k], weight: 2.5, opacity: 0.9, dashArray: sg.dashed ? '7 5' : null });
          l.bindTooltip(esc(name + (sg.label ? ' · ' + sg.label : '')), { sticky: true, opacity: 0.9 });
          l.on('click', function (e) { openPopup(ds, pr, e.latlng); });
          grp.addLayer(l);
          // arrow head at the end of the leg
          var c = sg.coords, p1 = c[c.length - 2], p2 = c[c.length - 1], brg = AX.bearing(p1, p2);
          if (brg !== null && brg !== undefined && !isNaN(brg)) {
            var tip = p2, len = Math.min(AX.distNM(p1, p2) * 0.25, 0.6);
            if (len > 0.05) grp.addLayer(L.polyline([project2(tip, brg + 150, len), tip, project2(tip, brg - 150, len)].map(ll), { renderer: vec, color: PROC_COL[k], weight: 2.5, opacity: 0.9 }));
          }
          n++;
        });
      });
    });
    grp.count = n;
    return grp;
  }
  function showProcs(ds, ad, instant) {
    if (!map) return;
    state.procAd = ad || null;
    if (over.procs && map.hasLayer(over.procs)) map.removeLayer(over.procs);
    over.procs = buildProcs(ds, state.procAd);
    state.filters.procs = true;
    var cb = document.querySelector('[data-layer="procs"]'); if (cb) cb.checked = true;
    var sel = document.getElementById('map-proc-ad'); if (sel) sel.value = ad ? String(ds.recs.indexOf(ad)) : '';
    applyLayers();
    var b = null;
    over.procs.eachLayer(function (l) { var lb = l.getBounds(); b = b ? b.extend(lb) : L.latLngBounds(lb.getSouthWest(), lb.getNorthEast()); });
    if (b && b.isValid()) map.fitBounds(b.pad(0.1), { maxZoom: 12, animate: !instant });
    else hooks.toast('No procedure legs with positions for this aerodrome.');
  }

  /* ---------------------------------------------------- compare overlay */
  function buildCompare(res) {
    if (over.cmp && map.hasLayer(over.cmp)) map.removeLayer(over.cmp);
    over.cmp = null;
    if (!res) return;
    var grp = L.layerGroup(), ps = new PointSet('cmp');
    var col = { added: '#1f7a4d', removed: '#b3261e', modified: '#e08e00' };
    res.items.forEach(function (it) {
      var ds = it.kind === 'removed' ? res.a : res.b, r = it.kind === 'removed' ? it.a : it.b;
      var g = M.geometry(ds, r);
      shapesOf(g, function (x) {
        if (x.t === 'P') ps.add(x.c[0], x.c[1], 'default', col[it.kind], it.kind.charAt(0).toUpperCase() + ' ' + M.shortName(r), r, ds);
        else {
          var l = x.t === 'A' ? L.polygon(ringsLL(x), { renderer: vec, color: col[it.kind], weight: 3, fillOpacity: 0.12 }) : L.polyline(x.c.map(ll), { renderer: vec, color: col[it.kind], weight: 4 });
          l.on('click', function (e) { openPopup(ds, r, e.latlng); });
          l.bindTooltip(it.kind + ': ' + esc(M.label(ds, r)), { sticky: true });
          grp.addLayer(l);
        }
      });
    });
    var pl = pointLayer(ps, { size: 7, labelZoom: 4, maxLabels: 400 });
    grp.addLayer(pl);
    over.cmp = grp; over.cmpPts = pl;
    map.addLayer(grp);
  }

  /* ------------------------------------------------------------- measure */
  function toggleMeasure(btn) {
    if (state.measure) {
      map.removeLayer(state.measure.layer);
      map.off('click', state.measure.onClick);
      state.measure = null;
      map.getContainer().style.cursor = '';
      btn.classList.remove('primary');
      el.status.textContent = 'Measure off';
      return;
    }
    var pts = [], layer = L.layerGroup().addTo(map);
    var line = L.polyline([], { color: '#0b2a4a', weight: 3, dashArray: '6 6' }).addTo(layer);
    function onClick(e) {
      pts.push([e.latlng.lng, e.latlng.lat]);
      line.setLatLngs(pts.map(ll));
      L.circleMarker(e.latlng, { radius: 4, color: '#0b2a4a', fillOpacity: 1 }).addTo(layer);
      var tot = 0, legs = [];
      for (var i = 1; i < pts.length; i++) { var d = AX.distNM(pts[i - 1], pts[i]); tot += d; legs.push(AX.bearing(pts[i - 1], pts[i]).toFixed(0).padStart(3, '0') + '°T ' + d.toFixed(1) + ' NM'); }
      el.status.textContent = pts.length < 2 ? 'Click the next point…' : 'Total ' + tot.toFixed(2) + ' NM / ' + (tot * 1.852).toFixed(2) + ' km  |  ' + legs.slice(-3).join('  ·  ');
    }
    map.on('click', onClick);
    map.getContainer().style.cursor = 'crosshair';
    state.measure = { layer: layer, onClick: onClick };
    btn.classList.add('primary');
    el.status.textContent = 'Measure: click points on the map';
  }

  /* ---------------------------------------------------------------- UI */
  function panelHtml(datasets) {
    var h = '<div class="card map-panel" id="map-panel">';
    h += '<div class="row"><b>Map</b><span class="sp"></span><span class="chip" id="map-online">checking internet…</span></div>';
    if (datasets.length > 1) h += '<h4>Data set</h4><select class="inp" id="map-ds" style="width:100%">' + datasets.map(function (d, i) { return '<option value="' + i + '">' + esc(d.state + ' – ' + d.name) + '</option>'; }).join('') + '</select>';
    h += '<h4>Base map</h4><select class="inp" id="map-base" style="width:100%"><option value="offline">Offline world map (built in)</option>';
    Object.keys(ONLINE).forEach(function (k) { h += '<option value="' + k + '">' + ONLINE[k].name + ' — online</option>'; });
    h += '</select><div class="muted" style="font-size:11.5px;margin-top:4px">Online maps need the laptop\'s internet connection. The offline map always works.</div>';
    h += '<h4>Aeronautical layers</h4>';
    LAYER_DEF.forEach(function (d) { h += '<label class="chk"><input type="checkbox" data-layer="' + d[0] + '"' + (d[2] ? ' checked' : '') + '> ' + d[1] + ' <span class="muted" data-count="' + d[0] + '"></span></label>'; });
    h += '<h4>Airport view</h4><select class="inp" id="map-adview" style="width:100%"><option value="">Choose an aerodrome…</option></select>';
    h += '<div class="muted" style="font-size:11.5px;margin-top:2px">Airport chart with runway markings, taxiways, stands, ILS and an information card.</div>';
    h += '<h4>Procedures</h4><div class="row" style="gap:6px;flex-wrap:wrap"><select class="inp" id="map-proc-ad" style="flex:1;min-width:0"><option value="">All aerodromes</option></select></div>';
    h += '<div class="row" style="gap:10px;margin-top:4px">' + ['SID', 'STAR', 'IAP'].map(function (k) { var col = { SID: '#1565c0', STAR: '#2e7d32', IAP: '#8e24aa' }[k]; return '<label class="chk" style="margin:0"><input type="checkbox" data-pk="' + k + '" checked> <span class="sw" style="background:' + col + '"></span> ' + k + '</label>'; }).join('') + '</div>';
    h += '<div class="muted" style="font-size:11.5px;margin-top:2px">Dashed: missed approach, or a leg ending at an altitude (drawn along its course).</div>';
    h += '<h4>Airspace</h4>';
    AS_CATS.forEach(function (c) { h += '<label class="chk"><input type="checkbox" data-layer="as_' + c[0] + '" checked> <span class="sw" style="background:' + COLORS[c[0]] + '"></span> ' + c[1] + ' <span class="muted" data-count="as_' + c[0] + '"></span></label>'; });
    h += '<h4>Display</h4><label class="chk"><input type="checkbox" id="map-labels" checked> Labels</label>';
    h += '<label class="chk"><input type="checkbox" id="map-cmp" disabled> Show comparison result (added / removed / modified)</label>';
    h += '</div>';
    h += '<div class="map-tools"><button class="btn small" id="map-fit" title="Zoom to data">⤢ Fit data</button><button class="btn small" id="map-measure" title="Measure distance and bearing">📏 Measure</button><button class="btn small" id="map-png" title="Save the current view as PNG">🖼 Save PNG</button><button class="btn small" id="map-print" title="Print or save the map as PDF: choose area, paper, legend, north arrow">🖨 Print map</button><button class="btn small" id="map-3d" title="3D view: terrain, airspace volumes with their vertical limits, approach and departure crew views">🗻 3D view</button><button class="btn small" id="map-panel-toggle">☰ Layers</button>' +
      (hooks.popout ? '<button class="btn small" id="map-popout" title="Open the map in its own window (for a second screen); the main window keeps the data">⧉ New window</button>' : '') +
      (hooks.dock ? '<button class="btn small" id="map-dock" title="Close this window and show the map in the main window again">⇲ Back to main window</button>' : '') + '</div>';
    h += '<div class="card map-status" id="map-status">Move the mouse over the map</div>';
    return h;
  }

  function mount(container, datasets, _hooks, opts) {
    hooks = _hooks;
    opts = opts || {};
    container.innerHTML = '<div class="map-wrap"><div id="map"></div>' + panelHtml(datasets) + '<div class="card map-adcard hidden" id="map-adcard"></div></div>';
    var mdiv = container.querySelector('#map');
    VIEW3D.close();
    if (map) { map.remove(); map = null; base = { offline: null, current: 'offline', online: {} }; over = {}; vec = null; }
    live = []; state.adView = null; state.all = datasets;
    map = L.map(mdiv, { zoomControl: false, worldCopyJump: true, preferCanvas: true, minZoom: 2, maxZoom: 20 }).setView([30, 10], 3);
    map.createPane('adPane').style.zIndex = 420;    // airport chart: above airspace / taxiway vectors
    map.createPane('annotPane').style.zIndex = 590; // airspace and route labels: below point symbols
    map.on('moveend zoomend resize viewreset', scheduleDraw);
    map.on('zoomstart', hideAll);
    base.offline = buildOffline();
    map.addLayer(base.offline);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.control.scale({ imperial: true, metric: true, position: 'bottomleft' }).addTo(map);
    el.status = container.querySelector('#map-status');
    map.on('mousemove', function (e) {
      if (state.measure) return;
      var te = TERRAIN.elev(e.latlng.lng, e.latlng.lat);
      el.status.textContent = AX.fmtPos([e.latlng.lng, e.latlng.lat], 1) + '   (' + e.latlng.lat.toFixed(5) + ', ' + e.latlng.lng.toFixed(5) + ')   ' +
        (te > 0 ? 'terrain ≈ ' + Math.round(te / 0.3048).toLocaleString('en-US') + ' ft   ' : '') + 'zoom ' + map.getZoom();
    });
    map.on('click', function (e) {
      if (state.measure) return;
      var cp = e.containerPoint, keys = ['cmpPts', 'pAd', 'pNav', 'pLgt', 'pDp', 'pObs', 'adChart'];
      for (var i = 0; i < keys.length; i++) {
        var l = over[keys[i]];
        if (!l || !map.hasLayer(l) && !(keys[i] === 'pObs' && over.obstacles && map.hasLayer(over.obstacles)) && !(keys[i] === 'cmpPts' && over.cmp && map.hasLayer(over.cmp)) && !(keys[i] === 'adChart' && over.aerodrome && map.hasLayer(over.aerodrome))) continue;
        var h = l.hit(cp);
        if (h) {
          if (h.cluster) { map.setView(e.latlng, Math.min(map.getZoom() + 2, 18)); return; }
          openPopup(h.p.ds, h.p.r, [h.p.lat, h.p.lon]); return;
        }
      }
    });
    var q = function (sel) { return container.querySelector(sel); };
    q('#map-base').addEventListener('change', function (e) { setBase(e.target.value); saveBase(e.target.value); });
    container.querySelectorAll('[data-layer]').forEach(function (cb) {
      cb.addEventListener('change', function () { state.filters[cb.getAttribute('data-layer')] = cb.checked; applyLayers(); });
    });
    q('#map-labels').addEventListener('change', function (e) { state.labels = e.target.checked; scheduleDraw(); });
    q('#map-adview').addEventListener('change', function (e) { var i = e.target.value; if (i === '') closeAdCard(); else airportView(state.ds, state.ds.recs[+i]); });
    q('#map-fit').addEventListener('click', function () { fit(); });
    q('#map-measure').addEventListener('click', function (e) { toggleMeasure(e.currentTarget); });
    q('#map-png').addEventListener('click', function () { hooks.savePng(renderImage(state.ds, map.getBounds(), 1600, 1000, { title: state.ds ? state.ds.state : '', layers: currentLayers() })); });
    q('#map-print').addEventListener('click', function () { printDialog(null); });
    q('#map-3d').addEventListener('click', function () { open3d('area', state.adView && state.adView.ds === state.ds ? state.adView.ad : null); });
    q('#map-panel-toggle').addEventListener('click', function () { q('#map-panel').classList.toggle('hidden'); });
    if (q('#map-popout')) q('#map-popout').addEventListener('click', function () { hooks.popout(state.ds, state.adView ? state.adView.ad : null); });
    if (q('#map-dock')) q('#map-dock').addEventListener('click', function () { hooks.dock(); });
    var dsSel = q('#map-ds');
    if (dsSel) dsSel.addEventListener('change', function () { show(datasets[+dsSel.value]); fit(); });
    q('#map-proc-ad').addEventListener('change', function (e) { var i = e.target.value; showProcs(state.ds, i === '' ? null : state.ds.recs[+i]); });
    container.querySelectorAll('[data-pk]').forEach(function (cb) {
      cb.addEventListener('change', function () { state.procKinds = state.procKinds || {}; state.procKinds[cb.getAttribute('data-pk')] = cb.checked; showProcs(state.ds, state.procAd); });
    });
    q('#map-cmp').addEventListener('change', function (e) { if (e.target.checked) buildCompare(state.cmp); else buildCompare(null); });
    checkOnline(function (on) {
      var c = q('#map-online');
      if (!c) return;
      c.textContent = on ? 'internet: online' : 'internet: offline';
      c.className = 'chip ' + (on ? 'ok' : 'warn');
      var sb = savedBase();
      if (on && sb && ONLINE[sb] && base.current === 'offline') { setBase(sb); var bs = q('#map-base'); if (bs) bs.value = sb; }
    });
    var ds = opts.ds || datasets[0];
    if (dsSel && ds) dsSel.value = String(datasets.indexOf(ds));
    if (ds) { show(ds); if (opts.procs) showProcs(ds, opts.procs, true); else fit(true); }
    if (opts.cmp) setCompare(opts.cmp);
    setTimeout(function () { map.invalidateSize(); }, 50);
  }
  function fillProcAd(ds) {
    var sel = document.getElementById('map-proc-ad');
    if (!sel) return;
    var ads = new Map();
    ['StandardInstrumentDeparture', 'StandardInstrumentArrival', 'InstrumentApproachProcedure'].forEach(function (k) { (ds.byType[k] || []).forEach(function (pr) { var a = ds.owner.get(pr); if (a) ads.set(a, (ads.get(a) || 0) + 1); }); });
    sel.innerHTML = '<option value="">All aerodromes</option>' + Array.from(ads.keys()).sort(function (a, b) { return M.shortName(a).localeCompare(M.shortName(b)); })
      .map(function (a) { return '<option value="' + ds.recs.indexOf(a) + '">' + esc(M.shortName(a) + ' — ' + (s(a.cur.p.name) || '')) + ' (' + ads.get(a) + ')</option>'; }).join('');
    sel.value = state.procAd && ads.has(state.procAd) ? String(ds.recs.indexOf(state.procAd)) : '';
  }
  function show(ds) {
    if (state.ds !== ds) state.procAd = null;
    state.ds = ds;
    buildOverlays(ds);
    applyLayers();
    fillProcAd(ds);
    fillAdView(ds);
    if (state.adView && state.adView.ds !== ds) closeAdCard();
    document.querySelectorAll('[data-count]').forEach(function (n) { var c = countOf(n.getAttribute('data-count')); n.textContent = c ? '(' + c + ')' : '(0)'; });
  }
  /* --------------------------------------------------------- airport view */
  function fillAdView(ds) {
    var sel = document.getElementById('map-adview');
    if (!sel) return;
    var list = ADCHART.all(ds).slice().sort(function (a, b) { return M.shortName(a.ad).localeCompare(M.shortName(b.ad)); });
    sel.innerHTML = '<option value="">Choose an aerodrome… (' + list.length + ')</option>' + list.map(function (m) {
      return '<option value="' + ds.recs.indexOf(m.ad) + '">' + esc(M.shortName(m.ad) + ' — ' + (s(m.ad.cur.p.name) || '')) + (m.runways.length ? ' · ' + m.runways.length + ' RWY' : '') + '</option>';
    }).join('');
    sel.value = state.adView && state.adView.ds === ds ? String(ds.recs.indexOf(state.adView.ad)) : '';
  }
  function adLatLngBounds(ds, ad) {
    var b = ADCHART.bounds(ds, ad);
    return b ? L.latLngBounds([b[1], b[0]], [b[3], b[2]]) : null;
  }
  function closeAdCard() {
    state.adView = null;
    var c = document.getElementById('map-adcard'); if (c) { c.classList.add('hidden'); c.innerHTML = ''; }
    var sel = document.getElementById('map-adview'); if (sel) sel.value = '';
  }
  // Airport view: zooms to the aerodrome diagram and opens the airport information card.
  function airportView(ds, ad) {
    if (!map || !ds || !ad) return;
    if (state.ds !== ds) show(ds);
    map.closePopup();
    state.filters.aerodrome = true; applyLayers();
    var cb = document.querySelector('[data-layer="aerodrome"]'); if (cb) cb.checked = true;
    var panel = document.getElementById('map-panel'); if (panel) panel.classList.add('hidden'); // room for the card; ☰ Layers re-opens it
    state.adView = { ds: ds, ad: ad };
    var card = document.getElementById('map-adcard');
    if (card) {
      card.innerHTML = ADCHART.cardHtml(ds, ad, { obsSets: state.all || [ds] });
      card.classList.remove('hidden');
      card.onclick = function (e) {
        var a = e.target.closest('[data-adc]'); if (!a) return;
        var k = a.getAttribute('data-adc');
        if (k === 'close') closeAdCard();
        if (k === 'aip') hooks.openAip(ds, ad);
        if (k === 'procs') showProcs(ds, ad);
        if (k === 'print') printDialog(adLatLngBounds(ds, ad) || map.getBounds(), { title: M.label(ds, ad) + ' — airport chart' });
        if (k === 'fit') fitAirport(ds, ad, true);
        if (k === '3dapp') open3d('approach', ad);
        if (k === '3ddep') open3d('departure', ad);
        if (k === 'ols') open3d('area', ad, { ols: true });
      };
    }
    fitAirport(ds, ad, false);
    var sel = document.getElementById('map-adview'); if (sel) sel.value = String(ds.recs.indexOf(ad));
  }
  // 3D view over the map (view3d.js): 'area' for the current view, 'approach' / 'departure' for an aerodrome
  // extra: {ols: true} shows the Annex 14 surfaces of the aerodrome around it
  function open3d(mode, ad, extra) {
    if (!state.ds) return;
    var b = map.getBounds(), bb = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
    if (extra && extra.ols && ad) { var c = M.pointOf(state.ds, ad); if (c) bb = [c[0] - 0.22 / Math.cos(c[1] * Math.PI / 180), c[1] - 0.17, c[0] + 0.22 / Math.cos(c[1] * Math.PI / 180), c[1] + 0.17]; }
    VIEW3D.open(map.getContainer().parentNode, state.ds, hooks, { mode: mode, ad: ad || null, bbox: bb, ols: !!(extra && extra.ols),
      obsSets: state.all || [state.ds] });
  }
  // fits the aerodrome diagram into the part of the map not covered by the card
  function fitAirport(ds, ad, animate) {
    var b = adLatLngBounds(ds, ad), card = document.getElementById('map-adcard');
    if (!b) { hooks.toast('This aerodrome has no position to show.'); return; }
    var wide = window.innerWidth > 900 && card && !card.classList.contains('hidden');
    var pad = wide ? card.getBoundingClientRect().right - map.getContainer().getBoundingClientRect().left + 10 : 10;
    map.fitBounds(b, { maxZoom: 17, animate: !!animate, paddingTopLeft: [Math.max(10, pad), 10], paddingBottomRight: [70, wide ? 10 : Math.round(map.getSize().y * 0.45)] });
  }

  function setCompare(res) {
    state.cmp = res;
    var cb = document.getElementById('map-cmp');
    if (cb) { cb.disabled = !res; cb.checked = !!res; }
    if (map) buildCompare(res);
  }
  function dsBounds(ds) {
    var b = null;
    function ext(c) { if (!c || typeof c[0] !== 'number') return; if (!b) b = L.latLngBounds([c[1], c[0]], [c[1], c[0]]); else b.extend([c[1], c[0]]); }
    (ds.byType.AirportHeliport || []).forEach(function (a) { ext(M.pointOf(ds, a)); });
    (ds.byType.Airspace || []).slice(0, 2000).forEach(function (a) { shapesOf(M.geometry(ds, a), function (g) { if (g.t === 'A') g.c[0].forEach(ext); else if (g.t === 'L') g.c.forEach(ext); }); });
    if (!b) ds.recs.slice(0, 20000).forEach(function (r) { ext(M.pointOf(ds, r)); });
    return b;
  }
  function fit(instant) {
    if (!state.ds || !map) return;
    var b = dsBounds(state.ds);
    if (b && b.isValid()) map.fitBounds(b.pad(0.05), { maxZoom: 11, animate: !instant });
  }
  function focus(ds, r) {
    if (!map) return;
    if (r && r.k === 'AirportHeliport' && ADCHART.of(ds, r)) { airportView(ds, r); return; } // aerodromes open the airport view
    if (state.ds !== ds) {
      var sel = document.getElementById('map-ds');
      show(ds);
      if (sel) { for (var i = 0; i < sel.options.length; i++) if (sel.options[i].textContent.indexOf(ds.name) >= 0) sel.value = sel.options[i].value; }
    }
    var g = M.geometry(ds, r), b = null;
    shapesOf(g, function (x) {
      var pts = x.t === 'P' ? [x.c] : x.t === 'L' ? x.c : x.c[0];
      pts.forEach(function (c) { if (typeof c[0] !== 'number') return; if (!b) b = L.latLngBounds([c[1], c[0]], [c[1], c[0]]); else b.extend([c[1], c[0]]); });
    });
    if (!b) { hooks.toast('This feature has no geometry to show on the map.'); return; }
    if (b.getNorthEast().equals(b.getSouthWest())) map.setView(b.getCenter(), Math.max(map.getZoom(), r.k === 'AirportHeliport' ? 12 : 10));
    else map.fitBounds(b.pad(0.2), { maxZoom: 14 });
    setTimeout(function () { openPopup(ds, r, b.getCenter()); }, 350);
  }
  // name of the country containing lon/lat (Natural Earth 1:50m), or null
  var countryIdx = null;
  function countryAt(lon, lat) {
    if (!countryIdx) {
      if (!world50) { var wj = JSON.parse(document.getElementById('data-world50').textContent); world50 = topojson.feature(wj, wj.objects.countries); }
      countryIdx = world50.features.map(function (f) {
        var g = f.geometry, polys = !g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
        var bb = [180, 90, -180, -90];
        polys.forEach(function (p) { p[0].forEach(function (c) { if (c[0] < bb[0]) bb[0] = c[0]; if (c[1] < bb[1]) bb[1] = c[1]; if (c[0] > bb[2]) bb[2] = c[0]; if (c[1] > bb[3]) bb[3] = c[1]; }); });
        return { name: f.properties && f.properties.name, polys: polys, bb: bb };
      });
    }
    function inRing(r) { var ins = false; for (var i = 0, j = r.length - 1; i < r.length; j = i++) { var xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1]; if (((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) ins = !ins; } return ins; }
    for (var k = 0; k < countryIdx.length; k++) {
      var c = countryIdx[k];
      if (lon < c.bb[0] || lon > c.bb[2] || lat < c.bb[1] || lat > c.bb[3]) continue;
      for (var q = 0; q < c.polys.length; q++) if (inRing(c.polys[q][0]) && !c.polys[q].slice(1).some(inRing)) return c.name;
    }
    return null;
  }
  function refreshTheme() { if (base.offline && base.offline.restyle) base.offline.restyle(); if (base.offline && base.offline.grat) base.offline.grat.redraw(); }

  /* ------------------------------------------------ static map renderer */
  // Renders the offline base map + aeronautical features of `ds` inside `bounds` to a PNG data URL.
  // opt: {title, sub, procAd, layers:{key:bool}, legend, north, grid, scale, footer}
  function renderImage(ds, bounds, w, h, opt) {
    opt = opt || {};
    var k = Math.max(1, w / 1600), lay = opt.layers || null;
    function on(key, def) { return !lay ? def !== false : lay[key] !== undefined ? lay[key] : def !== false; }
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var ctx = c.getContext('2d');
    if (!world50) { var wj = JSON.parse(document.getElementById('data-world50').textContent); world50 = topojson.feature(wj, wj.objects.countries); }
    var bw = bounds.getWest ? bounds.getWest() : bounds[0], bs = bounds.getSouth ? bounds.getSouth() : bounds[1], be = bounds.getEast ? bounds.getEast() : bounds[2], bn = bounds.getNorth ? bounds.getNorth() : bounds[3];
    function my(lat) { var r = lat * Math.PI / 180; return Math.log(Math.tan(Math.PI / 4 + r / 2)); }
    function iy(y) { return (2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180 / Math.PI; }
    var top = opt.title ? 34 * k : 0;
    var y0 = my(bn), y1 = my(bs), xs = w / ((be - bw) * Math.PI / 180), ys = (h - top) / (y0 - y1), sc = Math.min(xs, ys);
    var cx = (bw + be) / 2, cy = (y0 + y1) / 2;
    function P(lon, lat) { return [w / 2 + (lon - cx) * Math.PI / 180 * sc, top + (h - top) / 2 - (my(lat) - cy) * sc]; }
    // visible extent after aspect fitting
    var vw = cx - (w / 2) / sc * 180 / Math.PI, ve = cx + (w / 2) / sc * 180 / Math.PI, vn = iy(cy + ((h - top) / 2) / sc), vs = iy(cy - ((h - top) / 2) / sc);
    ctx.fillStyle = '#cfe3ee'; ctx.fillRect(0, 0, w, h);
    var geo = (sc > 3000 && world10) ? world10 : world50;
    ctx.fillStyle = '#f3efe9'; ctx.strokeStyle = '#b9aca4'; ctx.lineWidth = k;
    geo.features.forEach(function (f) {
      var g = f.geometry; if (!g) return;
      var polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
      polys.forEach(function (poly) {
        ctx.beginPath();
        poly.forEach(function (ring) { ring.forEach(function (pt, i) { var q = P(pt[0], pt[1]); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); }); ctx.closePath(); });
        ctx.fill('evenodd'); ctx.stroke();
      });
    });
    // coordinate grid
    var gstep = [30, 10, 5, 2, 1, 0.5, 0.25, 1 / 6, 1 / 12].filter(function (s2) { return (ve - vw) / s2 >= 3; })[0] || 1 / 12;
    function gl(v, isLon) { var a = Math.abs(v), d = Math.floor(a + 1e-9), m = Math.round((a - d) * 60); if (m === 60) { d++; m = 0; } return d + '°' + (m ? ('0' + m).slice(-2) + "'" : '') + (isLon ? (v < 0 ? 'W' : v > 0 ? 'E' : '') : (v < 0 ? 'S' : v > 0 ? 'N' : '')); }
    if (opt.grid !== false) {
      ctx.strokeStyle = 'rgba(60,80,100,.28)'; ctx.lineWidth = k; ctx.fillStyle = '#35505f'; ctx.font = Math.round(11 * k) + 'px Arial';
      for (var gx = Math.ceil(vw / gstep) * gstep; gx <= ve; gx += gstep) { var qx = P(gx, vn)[0]; ctx.beginPath(); ctx.moveTo(qx, top); ctx.lineTo(qx, h); ctx.stroke(); ctx.fillText(gl(gx, true), qx + 3 * k, top + 13 * k); }
      for (var gy = Math.ceil(vs / gstep) * gstep; gy <= vn; gy += gstep) { var qy = P(vw, gy)[1]; ctx.beginPath(); ctx.moveTo(0, qy); ctx.lineTo(w, qy); ctx.stroke(); ctx.fillText(gl(gy, false), 4 * k, qy - 3 * k); }
    }
    function inView(pt) { return pt[0] >= vw - 2 && pt[0] <= ve + 2 && pt[1] >= vs - 2 && pt[1] <= vn + 2; }
    function path(cs) { ctx.beginPath(); cs.forEach(function (pt, i) { var q = P(pt[0], pt[1]); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); }); }
    var used = {};
    if (ds) {
      (ds.byType.Airspace || []).forEach(function (a) {
        var cat = asCat(s(a.cur.p.type)), col = COLORS[cat];
        if (!on('as_' + cat)) return;
        shapesOf(M.geometry(ds, a), function (g) {
          if (g.t !== 'A') return;
          var ring = g.c[0].filter(function (p) { return typeof p[0] === 'number'; });
          if (!ring.some(inView)) return;
          path(ring); ctx.closePath();
          ctx.globalAlpha = 0.07; ctx.fillStyle = col; ctx.fill(); ctx.globalAlpha = 1; ctx.strokeStyle = col; ctx.lineWidth = 1.5 * k;
          ctx.setLineDash(cat === 'prd' || cat === 'mil' ? [6 * k, 4 * k] : []); ctx.stroke(); ctx.setLineDash([]);
          used['as_' + cat] = 1;
        });
      });
      if (on('routes')) (ds.byType.RouteSegment || []).forEach(function (sg) {
        var g = M.geometry(ds, sg); if (!g || g.t !== 'L' || !g.c.some(inView)) return;
        var rnav = /RNAV|RNP/.test(s(sg.cur.p.navigationType));
        path(g.c); ctx.strokeStyle = rnav ? COLORS.rnav : COLORS.route; ctx.lineWidth = 1.5 * k; ctx.stroke(); used[rnav ? 'rnav' : 'route'] = 1;
      });
      var rocc = new ADCHART.Occ();
      if (on('aerodrome')) {
        // AMDB surfaces (taxiways, aprons, runway elements) then the airport chart, as on screen
        var mppR = 6371008.8 * Math.cos((vs + vn) / 2 * Math.PI / 180) / sc; // metres per pixel
        if (mppR < 40) ['Apron', 'ApronElement', 'Taxiway', 'TaxiwayElement', 'RunwayElement', 'GuidanceLine'].forEach(function (kk) {
          (ds.byType[kk] || []).forEach(function (r) {
            var g = M.findGeo(r.cur.p, kk === 'GuidanceLine' ? ['L'] : ['A'], 0);
            if (!g) return;
            if (g.t === 'A') { var ring = g.c[0].filter(function (p) { return typeof p[0] === 'number'; }); if (!ring.some(inView)) return; path(ring); ctx.closePath(); ctx.fillStyle = /Runway/.test(kk) ? ADCHART.COL.rwy : /Apron/.test(kk) ? '#c9cfd5' : '#a3abb3'; ctx.fill(); }
            else if (g.c.some(inView)) { path(g.c); ctx.strokeStyle = '#e0b100'; ctx.lineWidth = 1.3 * k; ctx.stroke(); }
          });
        });
        var bbV = [vw, vs, ve, vn];
        ADCHART.draw(ctx, ds, { P: function (q) { return P(q[0], q[1]); }, mpp: mppR, k: k, occ: rocc,
          vis: function (b) { return b[2] >= bbV[0] && b[0] <= bbV[2] && b[3] >= bbV[1] && b[1] <= bbV[3]; } });
        if (ADCHART.all(ds).some(function (m) { return m.runways.length && m.reach && m.reach[2] >= vw && m.reach[0] <= ve && m.reach[3] >= vs && m.reach[1] <= vn; })) used.rwy = 1;
      }
      if (opt.procAd || on('procs', false)) {
        ['StandardInstrumentDeparture', 'StandardInstrumentArrival', 'InstrumentApproachProcedure'].forEach(function (kk) {
          (ds.byType[kk] || []).forEach(function (pr) {
            if (opt.procAd ? ds.owner.get(pr) !== opt.procAd : (state.procAd && ds.owner.get(pr) !== state.procAd)) return;
            if (state.procKinds && state.procKinds[PROC_K[kk]] === false) return;
            procPaths(ds, pr).forEach(function (sg) {
              if (!sg.coords.some(inView)) return;
              path(sg.coords); ctx.setLineDash(sg.dashed ? [8 * k, 6 * k] : []); ctx.strokeStyle = PROC_COL[kk]; ctx.lineWidth = 2.5 * k; ctx.stroke(); ctx.setLineDash([]);
              used['p' + PROC_K[kk]] = 1;
            });
          });
        });
      }
      ctx.font = '600 ' + Math.round(13 * k) + 'px "Segoe UI", Arial, sans-serif';
      var pts = [];
      if (on('pAd')) (ds.byType.AirportHeliport || []).forEach(function (a) { var p = M.pointOf(ds, a); if (p) pts.push([p, s(a.cur.p.type) === 'HP' ? 'HP' : 'AD', COLORS.ad, M.shortName(a), 'ad']); });
      if (on('pNav')) (ds.byType.Navaid || []).forEach(function (n) { var p = M.pointOf(ds, n); if (p) pts.push([p, navSym(n), COLORS.nav, s(n.cur.p.designator), 'nav']); });
      if (on('pDp')) (ds.byType.DesignatedPoint || []).forEach(function (d) { var p = M.pointOf(ds, d); if (p) pts.push([p, 'DP', COLORS.dp, s(d.cur.p.designator), 'dp']); });
      var obsList = on('obstacles') ? (ds.byType.VerticalStructure || []) : [];
      if (obsList.length < 20000) obsList.forEach(function (o) { var p = M.pointOf(ds, o); if (p) pts.push([p, 'OBS', COLORS.obst, '', 'obs']); });
      var visPts = pts.filter(function (x) { return inView(x[0]); });
      visPts.forEach(function (x) {
        var q = P(x[0][0], x[0][1]);
        sym(ctx, x[1], q[0], q[1], x[2], 7 * k);
        used[x[4]] = 1;
        if (x[3] && visPts.length < 400 * k) {
          var tw = ctx.measureText(x[3]).width, lb = [q[0] + 9 * k, q[1] - 10 * k, q[0] + 11 * k + tw, q[1] + 4 * k];
          if (!rocc.take(lb)) return; // the label would overlap another one
          ctx.lineWidth = 3 * k; ctx.lineJoin = 'round'; ctx.strokeStyle = '#fff'; ctx.strokeText(x[3], q[0] + 10 * k, q[1] - 2 * k); ctx.fillStyle = x[2]; ctx.fillText(x[3], q[0] + 10 * k, q[1] - 2 * k);
        }
      });
    }
    // frame and title
    ctx.strokeStyle = '#0b2a4a'; ctx.lineWidth = 4 * k; ctx.strokeRect(2 * k, 2 * k, w - 4 * k, h - 4 * k);
    if (opt.title) {
      ctx.fillStyle = 'rgba(11,42,74,.95)'; ctx.fillRect(0, 0, w, top);
      ctx.fillStyle = '#fff'; ctx.font = '600 ' + Math.round(16 * k) + 'px "Segoe UI", Arial, sans-serif'; ctx.fillText(opt.title, 14 * k, 23 * k);
      if (opt.sub) { ctx.font = Math.round(12 * k) + 'px "Segoe UI", Arial, sans-serif'; var tw = ctx.measureText(opt.sub).width; ctx.fillText(opt.sub, w - tw - 14 * k, 22 * k); }
    }
    // north arrow
    if (opt.north !== false) {
      var nx = w - 46 * k, ny = top + 60 * k, r = 20 * k;
      ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.arc(nx, ny, r + 8 * k, 0, 2 * Math.PI); ctx.fill(); ctx.strokeStyle = '#555'; ctx.lineWidth = k; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(nx, ny - r); ctx.lineTo(nx + r * 0.45, ny + r * 0.6); ctx.lineTo(nx, ny + r * 0.25); ctx.closePath(); ctx.fillStyle = '#0b2a4a'; ctx.fill();
      ctx.beginPath(); ctx.moveTo(nx, ny - r); ctx.lineTo(nx - r * 0.45, ny + r * 0.6); ctx.lineTo(nx, ny + r * 0.25); ctx.closePath(); ctx.fillStyle = '#a9bfdc'; ctx.fill();
      ctx.fillStyle = '#222'; ctx.font = '700 ' + Math.round(11 * k) + 'px Arial'; ctx.fillText('N', nx - 4 * k, ny - r - 9 * k);
    }
    // legend
    if (opt.legend !== false && ds) {
      var items = [];
      AS_CATS.forEach(function (cc) { if (used['as_' + cc[0]]) items.push(['area', COLORS[cc[0]], cc[1], cc[0] === 'prd' || cc[0] === 'mil']); });
      if (used.route) items.push(['line', COLORS.route, 'ATS route']);
      if (used.rnav) items.push(['line', COLORS.rnav, 'RNAV route']);
      if (used.pSID) items.push(['line', PROC_COL.StandardInstrumentDeparture, 'SID']);
      if (used.pSTAR) items.push(['line', PROC_COL.StandardInstrumentArrival, 'STAR']);
      if (used.pIAP) items.push(['line', PROC_COL.InstrumentApproachProcedure, 'Instrument approach']);
      if (used.rwy) items.push(['rwy', ADCHART.COL.rwy, 'Runway (to scale at airport zoom)']);
      if (used.ad) items.push(['sym', COLORS.ad, 'Aerodrome / heliport', 'AD']);
      if (used.nav) items.push(['sym', COLORS.nav, 'Radio navigation aid', 'VOR']);
      if (used.dp) items.push(['sym', COLORS.dp, 'Designated point', 'DP']);
      if (used.obs) items.push(['sym', COLORS.obst, 'Obstacle', 'OBS']);
      if (items.length) {
        ctx.font = Math.round(12 * k) + 'px Arial';
        var lh = 18 * k, lw = Math.max(170 * k, 50 * k + Math.max.apply(null, items.map(function (it) { return ctx.measureText(it[2]).width; }))), lx = 12 * k, lyy = h - 46 * k - items.length * lh - 22 * k;
        ctx.fillStyle = 'rgba(255,255,255,.93)'; ctx.fillRect(lx, lyy, lw, items.length * lh + 26 * k); ctx.strokeStyle = '#999'; ctx.lineWidth = k; ctx.strokeRect(lx, lyy, lw, items.length * lh + 26 * k);
        ctx.fillStyle = '#0b2a4a'; ctx.font = '700 ' + Math.round(12 * k) + 'px Arial'; ctx.fillText('LEGEND', lx + 8 * k, lyy + 16 * k);
        items.forEach(function (it, i) {
          var yy = lyy + 26 * k + i * lh + lh / 2, x0 = lx + 10 * k;
          if (it[0] === 'area') { ctx.globalAlpha = 0.15; ctx.fillStyle = it[1]; ctx.fillRect(x0, yy - 6 * k, 26 * k, 12 * k); ctx.globalAlpha = 1; ctx.strokeStyle = it[1]; ctx.lineWidth = 1.5 * k; ctx.setLineDash(it[3] ? [4 * k, 3 * k] : []); ctx.strokeRect(x0, yy - 6 * k, 26 * k, 12 * k); ctx.setLineDash([]); }
          else if (it[0] === 'line' || it[0] === 'rwy') { ctx.strokeStyle = it[1]; ctx.lineWidth = (it[0] === 'rwy' ? 5 : 2.5) * k; ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x0 + 26 * k, yy); ctx.stroke(); }
          else sym(ctx, it[3], x0 + 13 * k, yy, it[1], 6 * k);
          ctx.fillStyle = '#222'; ctx.font = Math.round(12 * k) + 'px Arial'; ctx.fillText(it[2], x0 + 36 * k, yy + 4 * k);
        });
      }
    }
    // scale bar
    var nmPerPx = AX.distNM([cx, (vs + vn) / 2], [cx + 1, (vs + vn) / 2]) / (Math.PI / 180 * sc);
    var nice = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000].filter(function (v) { return v / nmPerPx < w / 4; }).pop() || 1;
    var len = nice / nmPerPx, sx = w / 2 - len / 2;
    if (opt.scale !== false) {
      ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fillRect(sx - 10 * k, h - 40 * k, len + 110 * k, 26 * k);
      ctx.fillStyle = '#222'; ctx.fillRect(sx, h - 28 * k, len, 4 * k); ctx.fillRect(sx, h - 33 * k, 2 * k, 14 * k); ctx.fillRect(sx + len - 2 * k, h - 33 * k, 2 * k, 14 * k);
      ctx.font = Math.round(12 * k) + 'px Arial'; ctx.fillText(nice + ' NM (' + (nice * 1.852).toFixed(nice < 5 ? 1 : 0) + ' km)', sx + len + 8 * k, h - 22 * k);
    }
    ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.font = Math.round(10 * k) + 'px Arial';
    var foot = (opt.footer ? opt.footer + '  ·  ' : '') + 'AIXM Code Converter © 2026 Prasad Selvaraj (prasad2t@gmail.com)  ·  Base map: Natural Earth (public domain) · Mercator';
    var fw = ctx.measureText(foot).width; ctx.fillRect(w - fw - 16 * k, h - 20 * k, fw + 12 * k, 16 * k); ctx.fillStyle = '#555'; ctx.fillText(foot, w - fw - 10 * k, h - 8 * k);
    // author signature (Apache-2.0 NOTICE): near-invisible micro text in the bottom-left corner of every image
    ctx.save(); ctx.globalAlpha = 0.02; ctx.fillStyle = '#000'; ctx.font = Math.max(6, Math.round(6 * k)) + 'px Arial';
    ctx.fillText('AIXM Code Converter - Prasad Selvaraj <prasad2t@gmail.com>', 6 * k, h - 46 * k); ctx.restore();
    return c.toDataURL('image/png');
  }

  /* --------------------------------------------------------- print dialog */
  var PAPER = { A4L: [297, 210], A4P: [210, 297], A3L: [420, 297], A3P: [297, 420] };
  function printDialog(bounds, po) {
    po = po || {};
    var old = document.getElementById('map-print-dlg'); if (old) old.remove();
    var ds = state.ds, b = bounds || map.getBounds();
    var d = document.createElement('div');
    d.className = 'modal-back'; d.id = 'map-print-dlg';
    d.innerHTML = '<div class="modal" style="width:min(560px,100%)"><div class="modal-head"><h3>Print map</h3><span class="sp"></span><button class="btn small ghost" data-p="close">✕</button></div><div class="modal-body">' +
      '<div class="muted" style="margin-bottom:8px">Area: ' + (bounds ? 'the rectangle you selected' : 'the current map view') + ' — ' + AX.fmtPos([b.getWest(), b.getNorth()], 0) + ' to ' + AX.fmtPos([b.getEast(), b.getSouth()], 0) + '. <a href="#" data-p="area">Select another area on the map</a></div>' +
      '<label>Title<br><input class="inp" id="mp-title" style="width:100%" value="' + esc(po.title || (ds ? ds.state + (ds.airac ? ' — AIRAC ' + ds.airac.id : '') : 'Map')) + '"></label>' +
      '<div class="row wrap" style="gap:14px;margin-top:10px"><label>Paper<br><select class="inp" id="mp-paper"><option value="A4L">A4 landscape</option><option value="A4P">A4 portrait</option><option value="A3L">A3 landscape</option><option value="A3P">A3 portrait</option></select></label>' +
      '<div><br>' + [['legend', 'Legend'], ['north', 'North arrow'], ['grid', 'Coordinate grid'], ['scale', 'Scale bar']].map(function (x) { return '<label class="chk" style="display:inline-flex;margin-right:10px"><input type="checkbox" data-o="' + x[0] + '" checked> ' + x[1] + '</label>'; }).join('') + '</div></div>' +
      '<div class="muted" style="font-size:12px;margin-top:8px">The layers switched on in the map panel are printed. Procedures are included when the procedure layer is on.</div>' +
      '<div class="row" style="gap:8px;margin-top:14px;justify-content:flex-end"><button class="btn" data-p="png">Save PNG</button><button class="btn" data-p="print">Print</button><button class="btn primary" data-p="pdf">Save PDF</button></div></div></div>';
    document.body.appendChild(d);
    d.addEventListener('click', function (e) {
      if (e.target === d) { d.remove(); return; }
      var a = e.target.closest('[data-p]'); if (!a) return;
      e.preventDefault();
      var k = a.getAttribute('data-p');
      if (k === 'close') { d.remove(); return; }
      if (k === 'area') { d.remove(); selectArea(); return; }
      var paper = PAPER[d.querySelector('#mp-paper').value], mm = 8, W = paper[0] * mm, H = paper[1] * mm, o = {};
      d.querySelectorAll('[data-o]').forEach(function (cb) { o[cb.getAttribute('data-o')] = cb.checked; });
      var layers = {};
      LAYER_DEF.forEach(function (x) { layers[x[0]] = state.filters[x[0]] !== undefined ? state.filters[x[0]] : x[2]; });
      AS_CATS.forEach(function (x) { layers['as_' + x[0]] = state.filters['as_' + x[0]] !== undefined ? state.filters['as_' + x[0]] : true; });
      var title = d.querySelector('#mp-title').value;
      hooks.toast('Rendering the map…');
      setTimeout(function () {
        var url = renderImage(ds, b, W, H, { title: title, sub: ds ? ds.name : '', layers: layers, legend: o.legend, north: o.north, grid: o.grid, scale: o.scale, footer: 'Printed ' + new Date().toISOString().slice(0, 16).replace('T', ' ') + 'Z' });
        if (k === 'png') hooks.savePng(url);
        else if (k === 'pdf') {
          var land = paper[0] > paper[1], doc = new window.jspdf.jsPDF({ orientation: land ? 'landscape' : 'portrait', unit: 'mm', format: paper[0] === 420 || paper[1] === 420 ? 'a3' : 'a4' });
          doc.addImage(url, 'PNG', 0, 0, paper[0], paper[1]);
          doc.save((title || 'map').replace(/[^\w.-]+/g, '_') + '.pdf');
        } else {
          var root = document.getElementById('print-root');
          root.innerHTML = '<style>@page { size: ' + (paper[0] === 420 || paper[1] === 420 ? 'A3' : 'A4') + ' ' + (paper[0] > paper[1] ? 'landscape' : 'portrait') + '; margin: 0 }</style><img src="' + url + '" style="width:100%;display:block">';
          setTimeout(function () { window.print(); }, 60);
        }
        d.remove();
      }, 30);
    });
  }
  function selectArea() {
    hooks.toast('Drag a rectangle on the map to choose the print area (Esc to cancel).', 5000);
    var start = null, rect = null, cont = map.getContainer();
    map.dragging.disable(); cont.style.cursor = 'crosshair';
    function done(ok) {
      map.off('mousedown', down); map.off('mousemove', move); map.off('mouseup', up); document.removeEventListener('keydown', key);
      map.dragging.enable(); cont.style.cursor = '';
      var bb = rect ? rect.getBounds() : null; if (rect) map.removeLayer(rect);
      if (ok && bb && bb.isValid()) printDialog(bb);
    }
    function down(e) { start = e.latlng; rect = L.rectangle([start, start], { color: '#0b2a4a', weight: 2, dashArray: '6 4', fillOpacity: 0.08 }).addTo(map); }
    function move(e) { if (start && rect) rect.setBounds([start, e.latlng]); }
    function up() { if (start) done(true); }
    function key(e) { if (e.key === 'Escape') done(false); }
    map.on('mousedown', down); map.on('mousemove', move); map.on('mouseup', up); document.addEventListener('keydown', key);
  }
  function boundsAround(ds, r, nm) {
    var c = M.pointOf(ds, r);
    if (!c) return null;
    var d = (nm || 12) / 60;
    return [c[0] - d / Math.cos(c[1] * Math.PI / 180), c[1] - d * 0.7, c[0] + d / Math.cos(c[1] * Math.PI / 180), c[1] + d * 0.7];
  }
  function datasetBounds(ds) { var b = dsBounds(ds); return b ? [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()] : null; }

  return { countryAt: countryAt, mount: mount, show: show, focus: focus, showProcs: showProcs, airportView: airportView, closeAirportView: closeAdCard, open3d: open3d, asCat: asCat, COLORS: COLORS, procPaths: procPaths, setCompare: setCompare, refreshTheme: refreshTheme, renderImage: renderImage, boundsAround: boundsAround, datasetBounds: datasetBounds,
    isMounted: function () { return !!map; }, leaflet: function () { return map; }, invalidate: function () { if (map) map.invalidateSize(); } };
})();
