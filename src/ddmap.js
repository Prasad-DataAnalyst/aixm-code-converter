/*!
 * AIXM Code Converter
 * Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com> - author of the AIXM Code Converter
 * SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE; keep this notice in all copies)
 * ==========================================================================
 * AIXM Code Converter - the map of the Digital data tab (DDMAP)
 * A map made for working through one kind of digital data, beside its list: it shows what the list shows (the
 * filter applies), a click on the map selects the row and a row selects its feature on the map. The Map tab is a
 * separate map and is not changed.
 *   obstacles   a 3D model of their kind (building, tower, crane, wind turbine, chimney, tree, … - OBSICON) sized by
 *               height, on a pad coloured by what matters (penetrates an Annex 14 surface, has an error, lighted,
 *               other), a red light on the lighted ones; drawn on a canvas so that very large sets stay fast (plain
 *               dots when zoomed far out); the obstacle area
 *               boundary; the aerodrome reference point with 2 / 5 / 10 NM rings
 *   lines       procedure paths and aerodrome mapping geometry (points, lines, areas)
 * Base: the built-in offline world map, or the free online maps of the Map tab (Esri, OpenStreetMap, OpenTopoMap, NASA).
 * ========================================================================== */
/* global L, topojson, MODEL, MAPVIEW, OBSICON */
var DDMAP = (function () {
  'use strict';
  var M = MODEL, world = null;
  function esc(t) { return String(t === undefined || t === null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  // base maps: the built-in offline world map, or the same free online maps as the Map tab (Esri, OpenStreetMap,
  // OpenTopoMap, NASA), loaded the same way; Google map tiles are not offered (their terms need a paid Google Maps key)
  var OLD = { streets: 'esriStreet', imagery: 'esri' };
  function online() { try { return MAPVIEW.baseMaps().list; } catch (e) { return {}; } }
  function valid(k) { return k === 'offline' || !!online()[k]; }
  function firstChoice() {
    var k = '';
    try { k = localStorage.getItem('aixm-ddmap-base') || ''; } catch (e) { /* storage unavailable */ }
    k = OLD[k] || k;
    if (valid(k)) return k;
    try { k = MAPVIEW.savedBase(); } catch (e) { k = ''; }
    return valid(k) ? k : valid('esriStreet') ? 'esriStreet' : 'offline';
  }
  var baseChoice = null;
  function options() {
    var L0 = online(), groups = {};
    Object.keys(L0).forEach(function (k) { (groups[L0[k].group] = groups[L0[k].group] || []).push(k); });
    return '<option value="offline"' + (baseChoice === 'offline' ? ' selected' : '') + '>Offline world map (always works)</option>' + Object.keys(groups).map(function (g) {
      return '<optgroup label="' + esc(g) + '">' + groups[g].map(function (k) { return '<option value="' + k + '"' + (k === baseChoice ? ' selected' : '') + '>' + esc(L0[k].name) + '</option>'; }).join('') + '</optgroup>';
    }).join('');
  }

  // a map in el; keeps its view across redraws of the same content (key)
  var views = {};
  function create(el, key) {
    el.innerHTML = '';
    if (baseChoice === null) baseChoice = firstChoice();
    var map = L.map(el, { zoomControl: true, attributionControl: true, preferCanvas: true, worldCopyJump: true, zoomSnap: 0.5, maxZoom: 21 });
    var rend = L.canvas({ padding: 0.3 });
    var mm = { map: map, rend: rend, key: key, layers: L.layerGroup().addTo(map), sel: L.layerGroup().addTo(map), base: null, world: null, onPick: null, items: [] };
    el._ddmap = mm; // for the tests
    setBase(mm, baseChoice);
    // base map choice, inside the map
    var ctl = L.control({ position: 'topright' });
    ctl.onAdd = function () {
      var d = L.DomUtil.create('div', 'ddm-ctl');
      d.innerHTML = '<select aria-label="Base map">' + options() + '</select>';
      L.DomEvent.disableClickPropagation(d); L.DomEvent.disableScrollPropagation(d);
      mm.sel_ = d.querySelector('select');
      mm.sel_.onchange = function (e) { pick(mm, e.target.value); };
      return d;
    };
    ctl.addTo(map);
    L.control.scale({ imperial: false }).addTo(map);
    map.on('moveend', function () { views[key] = { c: map.getCenter(), z: map.getZoom() }; });
    return mm;
  }
  function pick(mm, k) { baseChoice = k; try { localStorage.setItem('aixm-ddmap-base', k); } catch (x) { /* storage unavailable */ } setBase(mm, k); if (mm.sel_) mm.sel_.value = k; }
  function setBase(mm, k) {
    if (mm.base) { mm.map.removeLayer(mm.base); mm.base = null; }
    var dark = document.documentElement.getAttribute('data-theme') === 'dark' || (!document.documentElement.getAttribute('data-theme') && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    var d = k !== 'offline' ? online()[k] : null;
    mm.map.getContainer().style.background = !d ? (dark ? '#0d1a2b' : '#dfe9f3') : d.dark ? '#111' : '#e8e8e8';
    if (d) {
      var tl = L.tileLayer(d.url, { attribution: d.attr, maxZoom: 21, maxNativeZoom: d.maxZoom, subdomains: d.sub || 'abc', crossOrigin: true, referrerPolicy: 'strict-origin-when-cross-origin' });
      mm.base = d.labels ? L.layerGroup([tl, L.tileLayer(d.labels, { maxZoom: 21, maxNativeZoom: d.maxZoom, crossOrigin: true, referrerPolicy: 'strict-origin-when-cross-origin' })]) : tl;
      var errors = 0, loaded = 0;
      tl.on('tileload', function () { loaded++; });
      // a server that refuses the tiles, or no internet: OpenStreetMap, then the offline map
      tl.on('tileerror', function () {
        if (++errors !== 4 || loaded || baseChoice !== k) return;
        var to = k !== 'osmhot' && online().osmhot ? 'osmhot' : 'offline';
        pick(mm, to);
      });
      mm.base.addTo(mm.map);
      if (mm.base.bringToBack) mm.base.bringToBack(); else tl.bringToBack();
    }
    if (!mm.world) {
      try {
        if (!world) { var w = JSON.parse(document.getElementById('data-world50').textContent); world = topojson.feature(w, w.objects.countries); }
        mm.world = L.geoJSON(world, { renderer: mm.rend, interactive: false, style: function () { return { color: dark ? '#4a6078' : '#9aa9b9', weight: 0.8, fillColor: dark ? '#1b2b40' : '#f6f4ee', fillOpacity: 1 }; } });
      } catch (e) { mm.world = null; }
    }
    if (mm.world) { if (!d) mm.world.addTo(mm.map); else mm.map.removeLayer(mm.world); }
  }
  function fit(mm, bounds) {
    var v = views[mm.key];
    if (v) { mm.map.setView(v.c, v.z, { animate: false }); return; }
    if (bounds && bounds.isValid()) mm.map.fitBounds(bounds.pad(0.12), { animate: false, maxZoom: 15 });
    else mm.map.setView([20, 30], 2);
  }
  function ll(c) { return [c[1], c[0]]; }

  /* -------------------------------------------------------------- obstacles */
  var OCOL = { pen: '#c62828', err: '#ef6c00', lit: '#e0a800', other: '#1d4e89' };
  // an obstacle on the canvas: the 3D model of its kind standing on its position, on a pad in its colour, size
  // options.sc (radius = the pad, for the rings of a selection); zoomed out below options.glyphZoom a plain dot
  // (radius options.dot), as the models would only cover each other there
  var IconMark = L.CircleMarker.extend({
    _glyph: function () { var z = this._map ? this._map.getZoom() : 0; return z >= (this.options.glyphZoom || 0); },
    // larger when zoomed in close
    _sc: function () { var z = this._map ? this._map.getZoom() : 0; return Math.round(this.options.sc * (z >= 17 ? 1.6 : z >= 15.5 ? 1.35 : z >= 14 ? 1.15 : 1) * 10) / 10; },
    _updateBounds: function () {
      if (!this._glyph()) { L.CircleMarker.prototype._updateBounds.call(this); return; }
      var s = this._sc(), t = this._clickTolerance();
      this._pxBounds = new L.Bounds(this._point.subtract([17 * s + t, 37 * s + t]), this._point.add([17 * s + t, 5 * s + t]));
    },
    _updatePath: function () {
      var rd = this._renderer;
      if (!rd || !rd._ctx) { L.CircleMarker.prototype._updatePath.call(this); return; }
      if (!rd._drawing || this._empty()) return;
      var c = rd._ctx, p = this._point, o = this.options;
      if (this._glyph()) { OBSICON.draw3d(c, o.kind, p.x, p.y, this._sc(), { fill: o.fillColor, lit: o.lit }); return; }
      c.beginPath(); c.arc(p.x, p.y, o.dot || this._radius, 0, Math.PI * 2);
      c.globalAlpha = 0.9; c.fillStyle = o.fillColor; c.fill();
      c.globalAlpha = 1; c.lineWidth = 1; c.strokeStyle = '#fff'; c.stroke();
    },
    // the model (from its pad to near its top), or the dot
    _containsPoint: function (p) {
      var q = this._point, t = this._clickTolerance();
      if (!this._glyph()) return p.distanceTo(q) <= (this.options.dot || this._radius) + t;
      var s = this._sc();
      return Math.abs(p.x - q.x) <= 11 * s + t && p.y >= q.y - 30 * s - t && p.y <= q.y + 4.5 * s + t;
    }
  });
  // rows: obstacle rows (obstview.js); opt: {bad: Set of rows with errors, areas: [rings], arp: [lon, lat], unit, onPick(row),
  //   picked: Set of records chosen for a report, onToggle(row) (Ctrl / Shift + click, or always when pickMode() is true),
  //   paths: [{coords, color, dashed, label}] flight paths}
  function obstacles(mm, rows, opt) {
    mm.layers.clearLayers(); mm.items = [];
    var b = L.latLngBounds([]);
    (opt.paths || []).forEach(function (p) {
      var c = p.coords.filter(function (q) { return typeof q[0] === 'number'; });
      if (c.length > 1) L.polyline(c.map(ll), { renderer: mm.rend, color: p.color, weight: 2, opacity: 0.75, dashArray: p.dashed ? '7 5' : null }).bindTooltip(esc(p.label || ''), { sticky: true }).addTo(mm.layers);
    });
    (opt.areas || []).forEach(function (a) {
      if (!a.ring || a.ring.length < 3) return;
      var pg = L.polygon(a.ring.filter(function (p) { return typeof p[0] === 'number'; }).map(ll), { renderer: mm.rend, color: '#6a1b9a', weight: 1.6, dashArray: '6 5', fill: true, fillOpacity: 0.04, interactive: false });
      pg.addTo(mm.layers); b.extend(pg.getBounds());
    });
    if (opt.arp) {
      [2, 5, 10].forEach(function (nm) { L.circle(ll(opt.arp), { radius: nm * 1852, renderer: mm.rend, color: '#5b6676', weight: 1, dashArray: '3 4', fill: false, interactive: false }).addTo(mm.layers); });
      L.circleMarker(ll(opt.arp), { renderer: mm.rend, radius: 6, color: '#0b2a4a', weight: 2, fillColor: '#fff', fillOpacity: 1 }).bindTooltip(esc(opt.arpLabel || 'ARP'), { permanent: false }).addTo(mm.layers);
    }
    var maxH = Math.max.apply(null, rows.map(function (x) { return x.hgt || 0; }).concat([1]));
    // icons from the zoom where they can be told apart: later for a large set
    var glyphZoom = rows.length > 20000 ? 12 : rows.length > 3000 ? 11 : rows.length > 500 ? 9 : 0, kinds = {};
    // drawn from north to south, so that the nearer models stand in front of the ones behind them
    rows.filter(function (x) { return x.c; }).sort(function (a, b) { return b.c[1] - a.c[1]; }).forEach(function (x) {
      if (!x.c) return;
      var kind = x.pen ? 'pen' : opt.bad && opt.bad.has(x) ? 'err' : x.lighted === 'YES' ? 'lit' : 'other';
      var sh = Math.sqrt(Math.max(0, x.hgt || 0) / maxH), ok = OBSICON.kindOf(x.type, x.name);
      kinds[ok] = (kinds[ok] || 0) + 1;
      var sc = Math.round((0.55 + 0.5 * sh) * 10) / 10;
      var m = new IconMark(ll(x.c), { renderer: mm.rend, radius: 11 * sc, sc: sc, dot: 3 + 9 * sh, kind: ok, lit: x.lighted === 'YES', glyphZoom: glyphZoom, color: '#fff', weight: 1, fillColor: OCOL[kind], fillOpacity: 0.9 });
      var hTxt = x.hgt === null ? '' : opt.unit === 'FT' ? Math.round(x.hgt / 0.3048) + ' ft' : (Math.round(x.hgt * 10) / 10) + ' m';
      var eTxt = x.elev === null ? '' : opt.unit === 'FT' ? Math.round(x.elev / 0.3048) + ' ft' : (Math.round(x.elev * 10) / 10) + ' m';
      m.bindTooltip('<b>' + esc(x.id || x.name) + '</b> ' + esc(String(x.type || '').replace(/^OTHER:/, '') || (OBSICON.KIND_NAME[ok] || '')) + '<br>height ' + esc(hTxt) + ' · top ' + esc(eTxt) + ' AMSL' + (x.pen ? '<br><b style="color:#c62828">penetrates ' + esc(x.pen.surface) + ' by ' + (Math.round(x.pen.m * 10) / 10) + ' m</b>' : ''), { sticky: true, opacity: 0.95 });
      m.on('click', function (e) {
        var oe = e.originalEvent || {};
        if (opt.onToggle && (oe.ctrlKey || oe.metaKey || oe.shiftKey || (opt.pickMode && opt.pickMode()))) { opt.onToggle(x); picks(mm, opt.picked); return; }
        select(mm, x); if (opt.onPick) opt.onPick(x);
      });
      m.addTo(mm.layers); m._row = x; mm.items.push(m);
      b.extend(ll(x.c));
    });
    var lg = [['pen', 'penetrates Annex 14 surface'], ['err', 'has an error'], ['lit', 'lighted'], ['other', 'other']].filter(function (k) { return k[0] !== 'pen' || rows.some(function (x) { return x.pen; }); }).map(function (k) { return [OCOL[k[0]], k[1]]; });
    if (opt.onToggle) lg.push([PICK, 'chosen for the analysis report']);
    // the kinds shown, the most frequent first
    var ks = Object.keys(kinds).sort(function (a, b) { return kinds[b] - kinds[a]; }), kHtml = '';
    if (ks.length) {
      kHtml = '<div class="ddm-kinds">' + OBSICON.legendHtml(ks.slice(0, 8).map(function (k) { return [k, kinds[k].toLocaleString('en')]; }), { cls: 'ddm-k', d3: true, size: 24, fill: '#b0bec5' }) +
        (ks.length > 8 ? '<span class="ddm-k muted">+ ' + (ks.length - 8) + ' more kinds</span>' : '') + '</div>';
    }
    legend(mm, lg, 'model: kind · size: height · red light: lighted' + (opt.onToggle ? ' · Ctrl+click: choose' : ''), kHtml);
    picks(mm, opt.picked);
    fit(mm, b);
  }
  var PICK = '#00897b';
  // rings around the obstacles chosen for a report
  function picks(mm, picked) {
    if (!mm.pk) mm.pk = L.layerGroup().addTo(mm.map);
    mm.pk.clearLayers();
    if (!picked || !picked.size) return;
    mm.items.forEach(function (m) {
      if (!m._row || !picked.has(m._row.r)) return;
      L.circleMarker(m.getLatLng(), { renderer: mm.rend, radius: (m.options.radius || 6) + 4, color: PICK, weight: 3, fill: false, interactive: false }).addTo(mm.pk);
    });
  }
  function select(mm, row) {
    mm.sel.clearLayers();
    var m = mm.items.filter(function (x) { return x._row === row; })[0];
    if (!m) return;
    var c = m.getLatLng ? m.getLatLng() : m.getBounds().getCenter();
    L.circleMarker(c, { renderer: mm.rend, radius: (m.options.radius || 6) + 6, color: '#b0186e', weight: 3, fill: false, interactive: false }).addTo(mm.sel);
    if (!mm.map.getBounds().pad(-0.1).contains(c)) mm.map.panTo(c);
  }
  function legend(mm, items, note, html) {
    if (mm.leg) mm.map.removeControl(mm.leg);
    var lg = L.control({ position: 'bottomleft' });
    lg.onAdd = function () {
      var d = L.DomUtil.create('div', 'ddm-leg');
      d.innerHTML = items.map(function (i) { return '<span><i style="background:' + i[0] + (/^#f[a-f0-9]{5}$/i.test(i[0]) ? ';box-shadow:0 0 0 1px #8a939e inset' : '') + '"></i>' + esc(i[1]) + '</span>'; }).join('') + (note ? '<span class="muted">' + esc(note) + '</span>' : '') + (html || '');
      return d;
    };
    lg.addTo(mm.map); mm.leg = lg;
  }

  /* ------------------------------------------------- lines, areas, points */
  // items: [{key (row), g: geometry {t, c} | paths: [{coords, dashed}], color, label}]
  /* --------------------------------------------- aerodrome chart style (AMXM) */
  // colours of an aerodrome chart made for the screen: dark runways with white markings, grey shoulders, taxiways
  // and aprons in steps of grey, yellow guidance lines and holding positions, green thresholds, blue stands,
  // purple navaids, red obstacles and hot spots; z: drawing order
  var CH = {
    Water: { f: '#7ec8ee', s: '#4aa3d8', z: 2 }, ServiceRoad: { f: '#d8c7ad', s: '#b49b78', z: 3 },
    ApronElement: { f: '#c3cad2', s: '#a3acb6', z: 5 }, ParkingStandArea: { f: '#dbe1e8', s: '#8b96a3', z: 6 }, DeicingArea: { f: '#a8daf4', s: '#3b8fc4', z: 7 },
    TaxiwayShoulder: { f: '#b3b9c0', s: '#b3b9c0', z: 8 }, TaxiwayElement: { f: '#868e98', s: '#717983', z: 9 },
    ConstructionArea: { f: '#ffa726', fo: 0.5, s: '#e65100', d: '5 3', z: 10 }, VerticalPolygonalStructure: { f: '#a1887f', s: '#5d4037', z: 11 },
    RunwayShoulder: { f: '#a0a6ae', s: '#a0a6ae', z: 12 }, Blastpad: { f: '#61656c', s: '#f5c518', d: '6 4', z: 13 }, Stopway: { f: '#61656c', s: '#f5c518', d: '6 4', w: 1.6, z: 13 },
    RunwayElement: { f: '#353a41', s: '#1f2328', z: 14 }, FinalApproachAndTakeOffArea: { f: '#4f7a3a', s: '#2f5a1f', z: 14 }, TouchDownLiftOffArea: { f: '#2e5e8e', s: '#ffffff', z: 15 },
    RunwayIntersection: { f: '#30353b', s: '#1f2328', z: 15 }, RunwayDisplacedArea: { f: '#4a4f57', s: '#ffffff', d: '4 4', z: 16 },
    RunwayMarking: { f: '#ffffff', s: '#ffffff', w: 0.3, z: 20, minZ: 14 }, TaxiwayIntersectionMarking: { f: '#ffcf00', s: '#ffcf00', z: 20 }, PositionMarking: { f: '#ffcf00', s: '#ffcf00', z: 20 },
    PaintedCenterline: { s: '#ffffff', w: 1.2, d: '12 10', z: 21 }, RunwayExitLine: { s: '#ffcf00', w: 1.4, z: 22 }, TaxiwayGuidanceLine: { s: '#ffcf00', w: 1.6, z: 22 }, StandGuidanceLine: { s: '#ffcf00', w: 1.2, d: '5 3', z: 22, minZ: 15 },
    TaxiwayHoldingPosition: { s: '#ffcf00', w: 3.5, z: 23 }, LandAndHoldShortOperationLocation: { s: '#ff6f00', w: 3, z: 23 }, Hotspot: { f: '#e53935', fo: 0.22, s: '#e53935', w: 2, z: 24 },
    RunwayCenterlinePoint: { p: '#ffffff', ps: '#30353b', r: 2.5, z: 30, minZ: 14 }, RunwayThreshold: { p: '#00c853', ps: '#ffffff', r: 5, z: 32 }, HelipadThreshold: { p: '#00c853', ps: '#ffffff', r: 5, z: 32 },
    ParkingStandLocation: { p: '#1565c0', ps: '#ffffff', r: 3.5, z: 31 }, VerticalPointStructure: { p: '#d32f2f', ps: '#ffffff', r: 4, z: 33 }, VerticalLineStructure: { s: '#d32f2f', w: 2, z: 25 },
    AerodromeSign: { p: '#ffcf00', ps: '#000000', r: 3, z: 31 }, AerodromeReferencePoint: { p: '#b0186e', ps: '#ffffff', r: 6.5, z: 34 }, SurveyControlPoint: { p: '#00897b', ps: '#ffffff', r: 3, z: 31 },
    AsrnEdge: { s: '#00acc1', w: 1, d: '2 3', z: 26 }, AsrnNode: { p: '#00acc1', ps: '#ffffff', r: 2, z: 30 }
  };
  // the style of an AMXM feature type (attributes: navaids drawn purple), and the label shown when zoomed in
  function chartStyle(t, a) {
    var c = CH[t] || { f: '#1d4e89', s: '#1d4e89', p: '#1d4e89', ps: '#ffffff', r: 3.5, z: 26 };
    if (t === 'VerticalPointStructure' && a && String(a.pntsttyp) === '9') c = Object.assign({}, c, { p: '#7b1fa2' });
    if (t === 'AerodromeSurfaceLighting') { var u = a && String(a.lgtuse); c = { p: { 0: '#2979ff', 1: '#00e676', 4: '#00e676', 7: '#ffd600', 8: '#ff1744' }[u] || '#fff59d', ps: '#3a3f46', r: 1.8, z: 35, minZ: 15 }; }
    return c;
  }
  var CHART_LEGEND = [['#353a41', 'runway'], ['#ffffff', 'runway marking (zoom in)'], ['#a0a6ae', 'shoulder'], ['#f5c518', 'stopway / blast pad'], ['#868e98', 'taxiway'], ['#c3cad2', 'apron'], ['#ffcf00', 'guidance line / holding position'], ['#00c853', 'threshold'], ['#1565c0', 'stand'], ['#7b1fa2', 'navaid'], ['#d32f2f', 'obstacle / hot spot'], ['#fff59d', 'light, white (zoom in)'], ['#00e676', 'light, green'], ['#ff1744', 'light, red'], ['#b0186e', 'reference point']];
  // details drawn from a zoom level on (lights, markings, centre line points): a chart that fills in as you zoom in
  function zoomDetail(mm) {
    if (mm._zd) return;
    mm._zd = true;
    mm.map.on('zoomend', function () { var z = mm.map.getZoom(); (mm.byZoom || []).forEach(function (x) { var on = z >= x[0], has = mm.layers.hasLayer(x[1]); if (on && !has) x[1].addTo(mm.layers); else if (!on && has) mm.layers.removeLayer(x[1]); }); });
  }
  function zoomLabels(mm) {
    if (mm._zl) return;
    mm._zl = true;
    var upd = function () { var z = mm.map.getZoom(), el = mm.map.getContainer(); [13, 15, 16, 17].forEach(function (k) { el.classList.toggle('ddm-below' + k, z < k); }); };
    mm.map.on('zoomend', upd); upd();
  }
  function shapes(mm, items, opt) {
    mm.layers.clearLayers(); mm.items = []; mm.byZoom = [];
    var b = L.latLngBounds([]), placed = {};
    // aerodrome chart: framed on the pavement (far obstacles and navaids do not shrink it)
    opt.paveFit = items.some(function (it) { return it.style && it.g && it.g.t === 'A'; });
    if (items.some(function (it) { return it.style; })) items = items.slice().sort(function (x, y) { return ((x.style && x.style.z) || 0) - ((y.style && y.style.z) || 0); });
    items.forEach(function (it) {
      var lay = [], st = it.style;
      (it.paths || []).forEach(function (p) { if (p.coords && p.coords.length > 1) lay.push(L.polyline(p.coords.map(ll), { renderer: mm.rend, color: it.color, weight: 2.5, opacity: 0.9, dashArray: p.dashed ? '7 5' : null })); });
      (function walk(g) {
        if (!g) return;
        if (g.t === 'M') { g.parts.forEach(walk); return; }
        if (g.t === 'P' && typeof g.c[0] === 'number') lay.push(L.circleMarker(ll(g.c), st ? { renderer: mm.rend, radius: st.r || 3.5, color: st.ps || '#fff', weight: 1.2, fillColor: st.p || st.f || it.color, fillOpacity: 1 } : { renderer: mm.rend, radius: 4, color: '#fff', weight: 1, fillColor: it.color, fillOpacity: 0.95 }));
        else if (g.t === 'L') lay.push(L.polyline(g.c.filter(function (p) { return typeof p[0] === 'number'; }).map(ll), st ? { renderer: mm.rend, color: st.s || it.color, weight: st.w || 1.6, dashArray: st.d || null, lineCap: 'butt' } : { renderer: mm.rend, color: it.color, weight: 2.2 }));
        else if (g.t === 'A') lay.push(L.polygon(g.c.map(function (r) { return r.filter(function (p) { return typeof p[0] === 'number'; }).map(ll); }), st ? { renderer: mm.rend, color: st.s || st.f, weight: st.w === undefined ? 0.8 : st.w, dashArray: st.d || null, fillColor: st.f || it.color, fillOpacity: st.fo === undefined ? 1 : st.fo } : { renderer: mm.rend, color: it.color, weight: 1, fillColor: it.color, fillOpacity: 0.35 }));
      })(it.g);
      if (!lay.length) return;
      var grp = L.featureGroup(lay);
      if (it.text && (placed[it.text] || []).some(function (q) { var c1 = grp.getBounds().getCenter(); return Math.abs(q.lat - c1.lat) < 0.0027 && Math.abs(q.lng - c1.lng) < 0.0027 / Math.cos(c1.lat * Math.PI / 180); })) it = Object.assign({}, it, { text: null }); // one label per name every ~300 m
      if (it.text) { (placed[it.text] = placed[it.text] || []).push(grp.getBounds().getCenter()); }
      if (it.text) { var c0 = grp.getBounds().getCenter(); L.marker(c0, { interactive: false, keyboard: false, icon: L.divIcon({ className: 'ddm-lbl ddm-m' + (it.minZ || 15) + (it.textCls ? ' ' + it.textCls : ''), html: esc(it.text), iconSize: null }) }).addTo(mm.layers); zoomLabels(mm); }
      grp.bindTooltip(esc(it.label), { sticky: true, opacity: 0.95 });
      grp.on('click', function () { selectShape(mm, it.key); if (opt.onPick) opt.onPick(it.key); });
      grp._row = it.key; mm.items.push(grp);
      if (st && st.minZ) { (mm.byZoom = mm.byZoom || []).push([st.minZ, grp]); if (mm.map.getZoom() >= st.minZ) grp.addTo(mm.layers); zoomDetail(mm); } else grp.addTo(mm.layers);
      if (!st || !opt.paveFit || it.g && (it.g.t === 'A' || (it.g.t === 'M' && it.g.parts.some(function (q) { return q.t === 'A'; })))) b.extend(grp.getBounds());
    });
    if (opt.legend) legend(mm, opt.legend, opt.note);
    fit(mm, b);
  }
  function selectShape(mm, key) {
    mm.sel.clearLayers();
    var g = mm.items.filter(function (x) { return x._row === key; })[0];
    if (!g) return;
    var bb = g.getBounds();
    L.rectangle(bb.pad(0.15), { renderer: mm.rend, color: '#b0186e', weight: 2.5, fill: false, dashArray: '4 3', interactive: false }).addTo(mm.sel);
    if (!mm.map.getBounds().contains(bb)) mm.map.fitBounds(bb.pad(0.6), { maxZoom: 15 });
  }
  function forget(key) { delete views[key]; }

  return { chartStyle: chartStyle, CHART_LEGEND: CHART_LEGEND, create: create, obstacles: obstacles, select: select, shapes: shapes, selectShape: selectShape, forget: forget, legendOf: legend, picks: picks, OCOL: OCOL, geometryOf: function (ds, r) { return M.geometry(ds, r); } };
})();
