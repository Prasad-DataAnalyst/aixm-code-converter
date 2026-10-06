/*!
 * AIXM Code Converter
 * Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com> - author of the AIXM Code Converter
 * SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE; keep this notice in all copies)
 * ==========================================================================
 * AIXM Code Converter - the map of the Digital data tab (DDMAP)
 * A map made for working through one kind of digital data, beside its list: it shows what the list shows (the
 * filter applies), a click on the map selects the row and a row selects its feature on the map. The Map tab is a
 * separate map and is not changed.
 *   obstacles   sized by height, coloured by what matters (penetrates an Annex 14 surface, has an error, lighted,
 *               other); the obstacle area boundary; the aerodrome reference point with 2 / 5 / 10 NM rings
 *   lines       procedure paths and aerodrome mapping geometry (points, lines, areas)
 * Base: the built-in offline world map, or (online, no key) Esri streets or imagery.
 * ========================================================================== */
/* global L, topojson, MODEL */
var DDMAP = (function () {
  'use strict';
  var M = MODEL, world = null;
  function esc(t) { return String(t === undefined || t === null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var BASES = {
    offline: { label: 'Offline world map' },
    streets: { label: 'Streets (online)', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', att: 'Tiles © Esri' },
    imagery: { label: 'Satellite (online)', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', att: 'Imagery © Esri' }
  };
  var baseChoice = 'offline';
  try { baseChoice = localStorage.getItem('aixm-ddmap-base') || 'offline'; } catch (e) { /* storage unavailable */ }

  // a map in el; keeps its view across redraws of the same content (key)
  var views = {};
  function create(el, key) {
    el.innerHTML = '';
    var map = L.map(el, { zoomControl: true, attributionControl: true, preferCanvas: true, worldCopyJump: true, zoomSnap: 0.5 });
    var rend = L.canvas({ padding: 0.3 });
    var mm = { map: map, rend: rend, key: key, layers: L.layerGroup().addTo(map), sel: L.layerGroup().addTo(map), base: null, world: null, onPick: null, items: [] };
    el._ddmap = mm; // for the tests
    setBase(mm, baseChoice);
    // base map choice, inside the map
    var ctl = L.control({ position: 'topright' });
    ctl.onAdd = function () {
      var d = L.DomUtil.create('div', 'ddm-ctl');
      d.innerHTML = '<select aria-label="Base map">' + Object.keys(BASES).map(function (k) { return '<option value="' + k + '"' + (k === baseChoice ? ' selected' : '') + '>' + BASES[k].label + '</option>'; }).join('') + '</select>';
      L.DomEvent.disableClickPropagation(d);
      d.querySelector('select').onchange = function (e) { baseChoice = e.target.value; try { localStorage.setItem('aixm-ddmap-base', baseChoice); } catch (x) { /* storage unavailable */ } setBase(mm, baseChoice); };
      return d;
    };
    ctl.addTo(map);
    L.control.scale({ imperial: false }).addTo(map);
    map.on('moveend', function () { views[key] = { c: map.getCenter(), z: map.getZoom() }; });
    return mm;
  }
  function setBase(mm, k) {
    if (mm.base) { mm.map.removeLayer(mm.base); mm.base = null; }
    var dark = document.documentElement.getAttribute('data-theme') === 'dark' || (!document.documentElement.getAttribute('data-theme') && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    mm.map.getContainer().style.background = k === 'offline' ? (dark ? '#0d1a2b' : '#dfe9f3') : '#ccc';
    if (k !== 'offline' && BASES[k]) { mm.base = L.tileLayer(BASES[k].url, { maxZoom: 19, attribution: BASES[k].att, crossOrigin: true }).addTo(mm.map); mm.base.bringToBack(); }
    if (!mm.world) {
      try {
        if (!world) { var w = JSON.parse(document.getElementById('data-world50').textContent); world = topojson.feature(w, w.objects.countries); }
        mm.world = L.geoJSON(world, { renderer: mm.rend, interactive: false, style: function () { return { color: dark ? '#4a6078' : '#9aa9b9', weight: 0.8, fillColor: dark ? '#1b2b40' : '#f6f4ee', fillOpacity: 1 }; } });
      } catch (e) { mm.world = null; }
    }
    if (mm.world) { if (k === 'offline') mm.world.addTo(mm.map); else mm.map.removeLayer(mm.world); }
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
    rows.forEach(function (x) {
      if (!x.c) return;
      var kind = x.pen ? 'pen' : opt.bad && opt.bad.has(x) ? 'err' : x.lighted === 'YES' ? 'lit' : 'other';
      var rad = 3 + 9 * Math.sqrt(Math.max(0, x.hgt || 0) / maxH);
      var m = L.circleMarker(ll(x.c), { renderer: mm.rend, radius: rad, color: '#fff', weight: 1, fillColor: OCOL[kind], fillOpacity: 0.9 });
      var hTxt = x.hgt === null ? '' : opt.unit === 'FT' ? Math.round(x.hgt / 0.3048) + ' ft' : (Math.round(x.hgt * 10) / 10) + ' m';
      var eTxt = x.elev === null ? '' : opt.unit === 'FT' ? Math.round(x.elev / 0.3048) + ' ft' : (Math.round(x.elev * 10) / 10) + ' m';
      m.bindTooltip('<b>' + esc(x.id || x.name) + '</b> ' + esc(String(x.type || '').replace(/^OTHER:/, '')) + '<br>height ' + esc(hTxt) + ' · top ' + esc(eTxt) + ' AMSL' + (x.pen ? '<br><b style="color:#c62828">penetrates ' + esc(x.pen.surface) + ' by ' + (Math.round(x.pen.m * 10) / 10) + ' m</b>' : ''), { sticky: true, opacity: 0.95 });
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
    legend(mm, lg, 'size: height' + (opt.onToggle ? ' · Ctrl+click: choose' : ''));
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
  function legend(mm, items, note) {
    if (mm.leg) mm.map.removeControl(mm.leg);
    var lg = L.control({ position: 'bottomleft' });
    lg.onAdd = function () {
      var d = L.DomUtil.create('div', 'ddm-leg');
      d.innerHTML = items.map(function (i) { return '<span><i style="background:' + i[0] + '"></i>' + esc(i[1]) + '</span>'; }).join('') + (note ? '<span class="muted">' + esc(note) + '</span>' : '');
      return d;
    };
    lg.addTo(mm.map); mm.leg = lg;
  }

  /* ------------------------------------------------- lines, areas, points */
  // items: [{key (row), g: geometry {t, c} | paths: [{coords, dashed}], color, label}]
  function shapes(mm, items, opt) {
    mm.layers.clearLayers(); mm.items = [];
    var b = L.latLngBounds([]);
    items.forEach(function (it) {
      var lay = [];
      (it.paths || []).forEach(function (p) { if (p.coords && p.coords.length > 1) lay.push(L.polyline(p.coords.map(ll), { renderer: mm.rend, color: it.color, weight: 2.5, opacity: 0.9, dashArray: p.dashed ? '7 5' : null })); });
      (function walk(g) {
        if (!g) return;
        if (g.t === 'M') { g.parts.forEach(walk); return; }
        if (g.t === 'P' && typeof g.c[0] === 'number') lay.push(L.circleMarker(ll(g.c), { renderer: mm.rend, radius: 4, color: '#fff', weight: 1, fillColor: it.color, fillOpacity: 0.95 }));
        else if (g.t === 'L') lay.push(L.polyline(g.c.filter(function (p) { return typeof p[0] === 'number'; }).map(ll), { renderer: mm.rend, color: it.color, weight: 2.2 }));
        else if (g.t === 'A') lay.push(L.polygon(g.c[0].filter(function (p) { return typeof p[0] === 'number'; }).map(ll), { renderer: mm.rend, color: it.color, weight: 1, fillColor: it.color, fillOpacity: 0.35 }));
      })(it.g);
      if (!lay.length) return;
      var grp = L.featureGroup(lay);
      grp.bindTooltip(esc(it.label), { sticky: true, opacity: 0.95 });
      grp.on('click', function () { selectShape(mm, it.key); if (opt.onPick) opt.onPick(it.key); });
      grp.addTo(mm.layers); grp._row = it.key; mm.items.push(grp);
      b.extend(grp.getBounds());
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

  return { create: create, obstacles: obstacles, select: select, shapes: shapes, selectShape: selectShape, forget: forget, legendOf: legend, picks: picks, OCOL: OCOL, geometryOf: function (ds, r) { return M.geometry(ds, r); } };
})();
