/*!
 * AIXM Code Converter
 * Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com> - author of the AIXM Code Converter
 * SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE; keep this notice in all copies)
 * ==========================================================================
 * AIXM Code Converter - the pictures of the flight and obstacle assessment (FLTSCENE)
 * NOT FOR NAVIGATION - indicative visualisation.
 * Draws one "scene" (plain data: layers of obstacles, areas, surfaces, paths, vectors, arcs, airspace, terrain) as
 *   map        Leaflet: obstacles as icons of their kind (building, tower, mast, crane, wind turbine, tree, chimney,
 *              pylon, tank, …; a NOTAM obstacle with a warning badge), coloured by the result, areas, surfaces,
 *              paths, distance vectors with their figures, distance arcs, the base map of the Map tab
 *   3D         three.js, three styles: Hologram (dark, glowing wireframe), CAD (white, dimension lines) and Solid
 *              (shaded terrain): terrain mesh, elevation contours, runways, obstacles as models of their kind (wind
 *              turbine rotors turn, NOTAM obstacles pulse), surfaces, flight paths with curtains, distance vectors
 *              (ground distance, height difference, slant), arcs, airspace volumes; each layer on / off; the layers
 *              pulled apart in height ("exploded") to read one from the other; measuring between two points
 *   profile    SVG: distance along the path against height: terrain, obstacles, surfaces, flight paths
 *   window     any of them in a separate window (second screen), with print and PNG
 * Needs only Leaflet and three.js (and this file), so it runs the same in a separate window.
 * ========================================================================== */
/* global L, THREE */
var FLTSCENE = (function () {
  'use strict';
  var D2R = Math.PI / 180, RE = 6371008.8, FT = 0.3048;
  function esc(t) { return String(t === undefined || t === null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var SEV = { error: '#e53935', warning: '#fb8c00', caution: '#fdd835', ok: '#43a047', info: '#90a4ae', none: '#90a4ae' };
  var HOLO = { error: '#ff4d6d', warning: '#ffb020', caution: '#ffe066', ok: '#38f9b0', info: '#4dd0ff', none: '#4dd0ff' };

  /* ------------------------------------------------------------ obstacle kinds and icons */
  var KIND_NAME = { building: 'Building', tower: 'Tower', antenna: 'Antenna / mast', crane: 'Crane', windmill: 'Wind turbine', tree: 'Tree / vegetation', stack: 'Chimney / stack',
    pole: 'Pole', pylon: 'Pylon / power line', tank: 'Tank / silo', dome: 'Dome', spire: 'Spire / minaret', rig: 'Rig / platform', bridge: 'Bridge / arch', balloon: 'Tethered balloon',
    lighthouse: 'Lighthouse', peak: 'Terrain / high point', sign: 'Sign', monument: 'Monument', other: 'Other obstacle' };
  function kindOf(type, name) {
    var t = String(type || '').toUpperCase().replace(/^OTHER:/, '') + ' ' + String(name || '').toUpperCase();
    var R = [[/WIND ?(MILL|TURBINE|FARM)|WTG/, 'windmill'], [/CRANE/, 'crane'], [/TREE|VEGETATION|FOREST|PALM/, 'tree'], [/STACK|CHIMNEY|FLARE/, 'stack'], [/TRANSMISSION|CATENARY|CABLE|PYLON|T-L TWR|POWER ?LINE/, 'pylon'],
      [/ANTENNA|NAVAID|MAST|AERIAL|TELECOM|RADAR/, 'antenna'], [/LIGHTHOUSE|LGTHOUSE/, 'lighthouse'], [/COOLING|WATER_TOWER|STORAGE_TANK|TANK|SILO|GRAIN|ELEVATOR/, 'tank'], [/DOME/, 'dome'],
      [/SPIRE|MINARET|STEEPLE/, 'spire'], [/RIG|PLATFORM|DERRICK|REFINERY/, 'rig'], [/BRIDGE|ARCH/, 'bridge'], [/BALLOON|KITE/, 'balloon'], [/NATURAL|HIGHPOINT|TERRAIN|PEAK|HILL/, 'peak'],
      [/SIGN/, 'sign'], [/MONUMENT|STATUE|OBELISK/, 'monument'], [/POLE|LAMP|ELECTRICAL_EXIT/, 'pole'], [/TOWER|TWR/, 'tower'],
      [/BUILDING|BLDG|HANGAR|STADIUM|URBAN|INDUSTRIAL|POWER_PLANT|NUCLEAR|TERMINAL|HOTEL|HOUSE|WALL|FENCE|GATE/, 'building']];
    for (var i = 0; i < R.length; i++) if (R[i][0].test(t)) return R[i][1];
    return 'other';
  }
  var ICON = {
    building: '<rect x="5" y="6" width="14" height="15" rx="1"/><path d="M8.5 9.5h2M13.5 9.5h2M8.5 13h2M13.5 13h2M8.5 16.5h2M13.5 16.5h2"/>',
    tower: '<path d="M12 2L7 22M12 2l5 20M8.7 15h6.6M9.9 10h4.2M7.6 20L16 14.5M16.4 20L8 14.5"/>',
    antenna: '<path d="M12 7v15M9 22h6M12 7l-3.5 13M12 7l3.5 13"/><circle cx="12" cy="5.5" r="1.4"/><path d="M7.5 3.2a6 6 0 0 0 0 4.6M16.5 3.2a6 6 0 0 1 0 4.6"/>',
    crane: '<path d="M7 22V5M3.5 5H21M7 5l3.6-3L21 5M18.5 5v6M17 11h3M5 22h4M7 9l3.5-4M7 13l3-3"/>',
    windmill: '<path d="M12 10.5V22M10 22h4"/><circle cx="12" cy="9" r="1.3"/><path d="M12 7.7V1.8M13.2 9.6l5.2 3M10.8 9.6l-5.2 3"/>',
    tree: '<path d="M12 2.5L5.5 13.5h3.8L6 18.5h12l-3.3-5h3.8z"/><path d="M12 18.5V22"/>',
    stack: '<path d="M9.2 22l1-17h3.6l1 17zM9.8 10h4.4M9.5 15.5h5"/><path d="M12.8 3.6c1.4-1.8 3.4-1.8 4.6-.6"/>',
    pole: '<path d="M12 3v19M8.5 6.5h7M10 22h4"/>',
    pylon: '<path d="M12 2L6.5 22M12 2l5.5 20M4.5 7h15M6.5 12h11M8.2 16l7.6 5M15.8 16l-7.6 5"/>',
    tank: '<ellipse cx="12" cy="7" rx="7" ry="2.6"/><path d="M5 7v11a7 2.6 0 0 0 14 0V7"/>',
    dome: '<path d="M3 20h18M5 20a7 7 0 0 1 14 0M12 13V9"/>',
    spire: '<path d="M12 2l-4 11h8zM8 13v9h8v-9"/>',
    rig: '<path d="M3 16h18M5.5 16v6M18.5 16v6M12 2l-4 14M12 2l4 14M9.2 11h5.6M10.2 7h3.6"/>',
    bridge: '<path d="M2 13h20M3 13q9-9 18 0M6.5 13v8M17.5 13v8M12 8.5V13"/>',
    balloon: '<ellipse cx="12" cy="8" rx="5" ry="6"/><path d="M12 14v8M10.5 22h3"/>',
    lighthouse: '<path d="M9.3 22l1-14h3.4l1 14zM10 8h4V4.5h-4zM8.5 5.5L4.5 3.5M15.5 5.5l4-2M9.8 14h4.4"/>',
    peak: '<path d="M2 21L9 8l4 6 3-4 6 11z"/>',
    sign: '<rect x="5" y="4" width="14" height="8" rx="1"/><path d="M12 12v10M9 22h6"/>',
    monument: '<path d="M10 22l1-17 1-2.5L13 5l1 17zM8 22h8"/>',
    other: '<path d="M12 5v16M8 21h8"/><circle cx="12" cy="4.2" r="1.8"/>'
  };
  // an obstacle icon (SVG): the kind drawn in a disc ringed with the colour of the result; a NOTAM obstacle gets a warning badge
  function iconSvg(kind, o) {
    o = o || {};
    var s = o.size || 26, ring = o.ring || '#455a64', bg = o.bg || '#ffffff', fg = o.fg || '#263238';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="' + s + '" height="' + s + '"><circle cx="12" cy="12" r="10.8" fill="' + bg + '" stroke="' + ring + '" stroke-width="2.4"/>' +
      '<g transform="translate(4.2 4.2) scale(.65)" fill="none" stroke="' + fg + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (ICON[kind] || ICON.other) + '</g>' +
      (o.notam ? '<path d="M18.2 1.2l5 8.6h-10z" fill="#ffb300" stroke="#5d4037" stroke-width=".8"/><path d="M18.2 4.2v2.8M18.2 8.1v.1" stroke="#3e2723" stroke-width="1.2" stroke-linecap="round"/>' : '') + '</svg>';
  }
  function legendHtml(kinds) {
    return kinds.map(function (k) { return '<span class="fs-lg">' + iconSvg(k, { size: 18 }) + esc(KIND_NAME[k] || k) + '</span>'; }).join('');
  }

  /* ------------------------------------------------------------ helpers */
  function frame(o) { var k = Math.cos(o[1] * D2R), m = RE * D2R; return { xy: function (c) { return [(c[0] - o[0]) * k * m, (c[1] - o[1]) * m]; } }; }
  function sampler(T) { // bilinear terrain from a grid {bbox, w, h, z (row 0 = north)}
    if (!T || !T.z || !T.w) return function () { return null; };
    return function (lon, lat) {
      var fx = (lon - T.bbox[0]) / (T.bbox[2] - T.bbox[0]) * (T.w - 1), fy = (T.bbox[3] - lat) / (T.bbox[3] - T.bbox[1]) * (T.h - 1);
      if (fx < 0 || fy < 0 || fx > T.w - 1 || fy > T.h - 1) return null;
      var x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(T.w - 1, x0 + 1), y1 = Math.min(T.h - 1, y0 + 1), tx = fx - x0, ty = fy - y0;
      var g = function (x, y) { var v = T.z[y * T.w + x]; return v === v && v !== null ? v : 0; };
      return (g(x0, y0) * (1 - tx) + g(x1, y0) * tx) * (1 - ty) + (g(x0, y1) * (1 - tx) + g(x1, y1) * tx) * ty;
    };
  }
  // marching squares: contour segments of a grid at level v -> [[[lon, lat], [lon, lat]], …]
  function contours(T, v) {
    var out = [], W = T.w, H = T.h, bx = T.bbox, dx = (bx[2] - bx[0]) / (W - 1), dy = (bx[3] - bx[1]) / (H - 1);
    function z(x, y) { var q = T.z[y * W + x]; return q === q && q !== null ? q : -1e9; }
    function ll(x, y) { return [bx[0] + x * dx, bx[3] - y * dy]; }
    for (var y = 0; y < H - 1; y++) for (var x = 0; x < W - 1; x++) {
      var a = z(x, y), b = z(x + 1, y), c = z(x + 1, y + 1), d = z(x, y + 1), pts = [];
      if ((a >= v) !== (b >= v)) pts.push(ll(x + (v - a) / (b - a), y));
      if ((b >= v) !== (c >= v)) pts.push(ll(x + 1, y + (v - b) / (c - b)));
      if ((c >= v) !== (d >= v)) pts.push(ll(x + 1 - (v - c) / (d - c), y + 1));
      if ((d >= v) !== (a >= v)) pts.push(ll(x, y + 1 - (v - d) / (a - d)));
      if (pts.length >= 2) out.push([pts[0], pts[1]]);
      if (pts.length === 4) out.push([pts[2], pts[3]]);
    }
    return out;
  }
  function contourLevels(T, n) {
    var mn = Infinity, mx = -Infinity;
    (T.z || []).forEach(function (v) { if (v === v && v !== null) { mn = Math.min(mn, v); mx = Math.max(mx, v); } });
    if (!isFinite(mn) || mx - mn < 1) return [];
    var raw = (mx - mn) / (n || 10), p = Math.pow(10, Math.floor(Math.log10(raw))), st = [1, 2, 5, 10].map(function (k) { return k * p; }).filter(function (k) { return k >= raw; })[0] || raw, out = [];
    for (var v = Math.ceil(mn / st) * st; v < mx; v += st) out.push(v);
    return out;
  }

  /* ------------------------------------------------------------ map (Leaflet) */
  function mapView(el, spec, hooks) {
    hooks = hooks || {};
    var doc = el.ownerDocument;
    el.innerHTML = '<div class="fs-map" style="position:absolute;inset:0"></div>';
    el.style.position = el.style.position || 'relative';
    var map = L.map(el.firstChild, { zoomControl: true, preferCanvas: true, attributionControl: true, worldCopyJump: true }), rend = L.canvas({ padding: 0.3 }), groups = {}, base = null, picks = {};
    function setBase(k) {
      if (base) { map.removeLayer(base); base = null; }
      var d = spec.bases && spec.bases.list && spec.bases.list[k];
      if (d) base = L.tileLayer(d.url, { attribution: d.attr, maxZoom: 19, maxNativeZoom: d.maxZoom || 18, subdomains: d.sub || 'abc', crossOrigin: true }).addTo(map);
      el.firstChild.style.background = d && d.dark ? '#0d1b2a' : '#eef2f5';
    }
    setBase(spec.bases ? spec.bases.def : null);
    if (spec.bases && spec.bases.list) {
      var sel = doc.createElement('select'); sel.className = 'fs-base'; sel.title = 'Base map'; sel.setAttribute('aria-label', 'Base map');
      sel.innerHTML = '<option value="">No base map</option>' + Object.keys(spec.bases.list).map(function (k) { return '<option value="' + k + '"' + (k === spec.bases.def ? ' selected' : '') + '>' + esc(spec.bases.list[k].name) + '</option>'; }).join('');
      sel.onchange = function () { setBase(sel.value); if (hooks.base) hooks.base(sel.value); };
      L.DomEvent.disableClickPropagation(sel);
      el.appendChild(sel);
    }
    function ll(c) { return [c[1], c[0]]; }
    function tip(lines) { return lines.filter(Boolean).map(function (l, i) { return i ? esc(l) : '<b>' + esc(l) + '</b>'; }).join('<br>'); }
    var draw = {
      obstacles: function (g, ly) {
        var many = ly.items.length > (spec.iconMax || 1500), tags = 0;
        // the most relevant first (worst result, then highest): icons for those, small dots for the rest of a very large set
        var order = ly.items.slice().sort(function (a, b) { var r = { error: 0, warning: 1, caution: 2, ok: 3, info: 4 }; return (r[a.sev] === undefined ? 5 : r[a.sev]) - (r[b.sev] === undefined ? 5 : r[b.sev]) || (b.hgt || 0) - (a.hgt || 0); });
        order.forEach(function (o, i) {
          var col = SEV[o.sev] || '#546e7a', m;
          if (!many || i < (spec.iconMax || 1500)) {
            var s = Math.round(Math.max(20, Math.min(34, 18 + Math.sqrt(Math.max(0, o.hgt || 0)) * 1.4)));
            m = L.marker(ll(o.c), { icon: L.divIcon({ className: 'fs-ic', html: iconSvg(o.kind || kindOf(o.type, o.label), { size: s, ring: col, notam: o.notam }), iconSize: [s, s], iconAnchor: [s / 2, s / 2] }), riseOnHover: true, zIndexOffset: { error: 900, warning: 600, caution: 300 }[o.sev] || 0 });
          } else m = L.circleMarker(ll(o.c), { renderer: rend, radius: 3, color: col, weight: 1, fillColor: col, fillOpacity: 0.8 });
          m.bindTooltip(tip([o.label].concat(o.sub || [])), { direction: 'top', className: 'fs-tip' });
          if (o.tag && tags++ < (spec.mapTags || 3)) m.bindTooltip(esc(o.tag), { permanent: true, direction: 'right', className: 'fs-tag', offset: [12, 0] });
          else if (o.tag) m.bindTooltip(tip([o.label].concat(o.sub || [])), { direction: 'top', className: 'fs-tip' });
          m.on('click', function () { if (hooks.pick) hooks.pick(o); });
          picks[o.id] = m; g.addLayer(m);
        });
      },
      polygon: function (g, ly) { ly.items.forEach(function (p) { var q = L.polygon(p.ring.map(ll), { renderer: rend, color: p.color || ly.color || '#1565c0', weight: p.w || 1.5, dashArray: p.dash || null, fillColor: p.fill || p.color || ly.color || '#1565c0', fillOpacity: p.opacity === undefined ? 0.08 : p.opacity }); if (p.label) q.bindTooltip(tip([p.label].concat(p.sub || [])), { sticky: true, className: 'fs-tip' }); g.addLayer(q); }); },
      surface: function (g, ly) { draw.polygon(g, { color: ly.color, items: ly.items.map(function (s) { return { ring: s.pts, color: s.color, opacity: 0.1, label: s.label, sub: s.sub, dash: '6 4' }; }) }); },
      line: function (g, ly) { ly.items.forEach(function (p) { var q = L.polyline(p.pts.map(ll), { renderer: rend, color: p.color || ly.color || '#6a1b9a', weight: p.w || 2.5, dashArray: p.dash || null }); if (p.label) q.bindTooltip(tip([p.label].concat(p.sub || [])), { sticky: true, className: 'fs-tip' }); g.addLayer(q); }); },
      vector: function (g, ly) {
        ly.items.forEach(function (v) {
          var col = v.color || '#00897b', q = L.polyline([ll(v.a), ll(v.b)], { renderer: rend, color: col, weight: 2, dashArray: '2 5' }); g.addLayer(q);
          var mid = [(v.a[0] + v.b[0]) / 2, (v.a[1] + v.b[1]) / 2];
          g.addLayer(L.marker(ll(mid), { interactive: false, icon: L.divIcon({ className: 'fs-vec', html: '<span style="border-color:' + col + '">' + (v.label || []).map(esc).join('<br>') + '</span>', iconSize: [0, 0] }) }));
        });
      },
      arc: function (g, ly) {
        ly.items.forEach(function (a) {
          var pts = [], b0 = a.b0 === undefined ? 0 : a.b0, b1 = a.b1 === undefined ? 360 : a.b1, sw = ((b1 - b0) + 360) % 360 || 360;
          for (var i = 0; i <= 72; i++) pts.push(dst(a.c, b0 + sw * i / 72, a.r));
          g.addLayer(L.polyline(pts.map(ll), { renderer: rend, color: a.color || '#78909c', weight: 1, dashArray: '4 4', interactive: false }));
          if (a.label) g.addLayer(L.marker(ll(dst(a.c, b0 + Math.min(sw, 360) * 0.12, a.r)), { interactive: false, icon: L.divIcon({ className: 'fs-arc', html: '<span>' + esc(a.label) + '</span>', iconSize: [0, 0] }) }));
        });
      },
      runway: function (g, ly) { ly.items.forEach(function (r) { var q = L.polygon(r.ring.map(ll), { renderer: rend, color: '#212121', weight: 1, fillColor: '#37474f', fillOpacity: 0.9 }); if (r.label) q.bindTooltip(esc(r.label), { sticky: true, className: 'fs-tip' }); g.addLayer(q); }); },
      volume: function (g, ly) { draw.polygon(g, { color: ly.color, items: ly.items.map(function (v) { return { ring: v.ring, color: v.color, opacity: 0.12, label: v.label, sub: v.sub, w: 2 }; }) }); },
      point: function (g, ly) { ly.items.forEach(function (p) { var q = L.circleMarker(ll(p.c), { renderer: rend, radius: p.r || 5, color: p.color || '#000', weight: 2, fillColor: '#fff', fillOpacity: 1 }); if (p.label) q.bindTooltip(esc(p.label), { permanent: !!p.permanent, direction: 'right', className: p.permanent ? 'fs-tag' : 'fs-tip' }); g.addLayer(q); }); },
      terrain: function () { /* 3D only */ }, contours: function () { /* 3D only */ }
    };
    (spec.layers || []).forEach(function (ly) {
      var g = L.layerGroup();
      try { (draw[ly.kind] || function () {})(g, ly); } catch (e) { /* a layer that cannot be drawn is left out */ }
      groups[ly.id] = g;
      if (ly.on !== false && ly.map !== false) g.addTo(map);
    });
    var bb = spec.focus || spec.bbox;
    if (bb) map.fitBounds([[bb[1], bb[0]], [bb[3], bb[2]]], { padding: [24, 24] }); else map.setView([20, 0], 2);
    if (spec.focus && spec.bbox) { // a button back to the whole picture
      var all = doc.createElement('button'); all.className = 'fs-all'; all.textContent = '⤢ Whole area'; all.title = 'Show the whole area of the analysis';
      all.onclick = function () { map.fitBounds([[spec.bbox[1], spec.bbox[0]], [spec.bbox[3], spec.bbox[2]]], { padding: [16, 16] }); };
      L.DomEvent.disableClickPropagation(all); el.appendChild(all);
    }
    var api = {
      map: map,
      setLayer: function (id, on) { var g = groups[id]; if (!g) return; if (on) g.addTo(map); else map.removeLayer(g); },
      select: function (id) { var m = picks[id]; if (m) { map.setView(m.getLatLng(), Math.max(map.getZoom(), 14)); m.openTooltip(); } },
      resize: function () { map.invalidateSize(); },
      destroy: function () { try { map.remove(); } catch (e) { /* gone */ } }
    };
    setTimeout(function () { map.invalidateSize(); }, 60);
    return api;
  }
  function dst(c, brg, m) {
    var d = m / RE, b = brg * D2R, la = c[1] * D2R, lo = c[0] * D2R;
    var la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(b));
    return [((lo + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2))) / D2R + 540) % 360 - 180, la2 / D2R];
  }

  /* ------------------------------------------------------------ 3D (three.js) */
  var STYLES = {
    holo: { bg: '#020b16', grid: '#0b4f6c', text: '#7ff6ff', line: '#29e7ff', terrain: '#0fb5d6', fill: '#063247', runway: '#7ff6ff', label: 'rgba(2,20,34,.82)', glow: true },
    cad: { bg: '#f7f8fa', grid: '#c9d1da', text: '#1d2a36', line: '#263238', terrain: '#8d9aa6', fill: '#e3e8ed', runway: '#37474f', label: 'rgba(255,255,255,.94)', glow: false },
    solid: { bg: '#cfe3f3', grid: '#9fb3c8', text: '#1d2a36', line: '#37474f', terrain: '#6d8c5b', fill: '#9cb98a', runway: '#2b2f33', label: 'rgba(255,255,255,.9)', glow: false }
  };
  // a text label that always faces the camera
  function sprite(doc, lines, color, st, h) {
    var c = doc.createElement('canvas'), x = c.getContext('2d'), fs = 26;
    x.font = '600 ' + fs + 'px "Segoe UI", Arial, sans-serif';
    var w = 0; lines.forEach(function (l) { w = Math.max(w, x.measureText(l).width); });
    c.width = Math.ceil(w + 22); c.height = Math.ceil(lines.length * fs * 1.22 + 12);
    x.fillStyle = st.label; x.fillRect(0, 0, c.width, c.height);
    x.strokeStyle = color; x.lineWidth = 2.5; x.strokeRect(1.5, 1.5, c.width - 3, c.height - 3);
    lines.forEach(function (l, i) { x.font = (i ? '500 ' : '700 ') + (i ? fs * 0.86 : fs) + 'px "Segoe UI", Arial, sans-serif'; x.fillStyle = i ? st.text : color; x.textBaseline = 'middle'; x.fillText(l, 11, 6 + fs * 1.22 * (i + 0.5)); });
    var tex = new THREE.CanvasTexture(c); tex.minFilter = THREE.LinearFilter;
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, sizeAttenuation: false, transparent: true }));
    h = h || 0.032 * lines.length; sp.scale.set(h * c.width / c.height, h, 1); sp.renderOrder = 20;
    return sp;
  }
  function mat(st, color, o) {
    o = o || {};
    if (st.glow) return new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: o.opacity === undefined ? 0.35 : o.opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    return new THREE.MeshLambertMaterial({ color: color, transparent: o.opacity !== undefined && o.opacity < 1, opacity: o.opacity === undefined ? 1 : o.opacity, side: THREE.DoubleSide });
  }
  function lineMat(st, color, o) {
    o = o || {};
    if (o.dash) return new THREE.LineDashedMaterial({ color: color, dashSize: o.dash, gapSize: o.dash * 0.8, transparent: true, opacity: o.opacity === undefined ? 0.95 : o.opacity, depthTest: !o.over });
    return new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: o.opacity === undefined ? (st.glow ? 0.9 : 1) : o.opacity, blending: st.glow ? THREE.AdditiveBlending : THREE.NormalBlending, depthTest: !o.over });
  }
  function withEdges(g, mesh, st, color) { g.add(mesh); var e = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 25), lineMat(st, color, { opacity: st.glow ? 0.95 : 0.7 })); e.position.copy(mesh.position); e.rotation.copy(mesh.rotation); e.scale.copy(mesh.scale); g.add(e); return mesh; }
  // a model of the obstacle's kind, standing on y = 0, H high (scene units), about W wide
  function model(kind, H, W, st, col) {
    var g = new THREE.Group(), body = st.glow ? col : kind === 'tree' ? '#2e7d32' : kind === 'peak' ? '#8d6e63' : '#b0bec5', top = st.glow ? col : '#e53935';
    function box(w, h, d, y, x, z, c) { var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(st, c || body)); m.position.set(x || 0, y + h / 2, z || 0); return withEdges(g, m, st, col); }
    function cyl(rt, rb, h, y, seg, c, x) { var m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 12, 1, false), mat(st, c || body)); m.position.set(x || 0, y + h / 2, 0); return withEdges(g, m, st, col); }
    function cone(r, h, y, seg, c) { var m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg || 12), mat(st, c || body)); m.position.y = y + h / 2; return withEdges(g, m, st, col); }
    function ball(r, y, c) { var m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), mat(st, c || top)); m.position.y = y; g.add(m); return m; }
    switch (kind) {
      case 'building': box(W, H, W * 0.75, 0); if (!st.glow) box(W * 1.02, H * 0.03, W * 0.77, H * 0.97, 0, 0, '#78909c'); break;
      case 'tower': cyl(W * 0.06, W * 0.32, H, 0, 4); ball(W * 0.06, H, top); break;
      case 'antenna': cyl(W * 0.03, W * 0.12, H, 0, 6); box(W * 0.5, H * 0.012, W * 0.04, H * 0.82); ball(W * 0.05, H, top); break;
      case 'crane': {
        box(W * 0.12, H * 0.9, W * 0.12, 0);
        var jib = new THREE.Group(); jib.position.y = H * 0.9;
        var arm = new THREE.Mesh(new THREE.BoxGeometry(H * 0.7, W * 0.07, W * 0.07), mat(st, st.glow ? col : '#fbc02d')); arm.position.x = H * 0.22; withEdges(jib, arm, st, col);
        var cab = new THREE.Mesh(new THREE.BoxGeometry(W * 0.22, H * 0.1, W * 0.18), mat(st, body)); cab.position.set(-H * 0.12, -H * 0.02, 0); withEdges(jib, cab, st, col);
        var peak = new THREE.Mesh(new THREE.ConeGeometry(W * 0.06, H * 0.1, 4), mat(st, body)); peak.position.y = H * 0.07; jib.add(peak);
        g.add(jib); g.userData.slew = jib; ball(W * 0.04, H, top); break;
      }
      case 'windmill': {
        cyl(W * 0.05, W * 0.09, H * 0.68, 0, 10);
        var hub = new THREE.Group(); hub.position.set(0, H * 0.68, W * 0.08);
        var nac = new THREE.Mesh(new THREE.BoxGeometry(W * 0.14, W * 0.1, W * 0.28), mat(st, body)); nac.position.set(0, H * 0.68, -W * 0.02); withEdges(g, nac, st, col);
        for (var b = 0; b < 3; b++) { var bl = new THREE.Mesh(new THREE.BoxGeometry(W * 0.05, H * 0.32, W * 0.015), mat(st, st.glow ? col : '#eceff1')); bl.position.y = H * 0.16; var arm2 = new THREE.Group(); arm2.rotation.z = b * 2 * Math.PI / 3; arm2.add(bl); hub.add(arm2); }
        g.add(hub); g.userData.rotor = hub; break;
      }
      case 'tree': cyl(W * 0.05, W * 0.07, H * 0.3, 0, 6, st.glow ? col : '#6d4c41'); cone(W * 0.32, H * 0.75, H * 0.25, 9); break;
      case 'stack': { cyl(W * 0.1, W * 0.14, H, 0, 14); if (!st.glow) for (var k = 0; k < 3; k++) cyl(W * 0.105, W * 0.11, H * 0.06, H * (0.72 + k * 0.1), 14, k % 2 ? '#fafafa' : '#e53935'); break; }
      case 'pole': cyl(W * 0.025, W * 0.035, H, 0, 6); box(W * 0.25, H * 0.01, W * 0.02, H * 0.92); break;
      case 'pylon': cyl(W * 0.04, W * 0.3, H, 0, 4); box(W * 0.9, H * 0.015, W * 0.04, H * 0.86); box(W * 0.65, H * 0.015, W * 0.04, H * 0.7); break;
      case 'tank': cyl(W * 0.42, W * 0.42, H * 0.85, 0, 18); { var d = new THREE.Mesh(new THREE.SphereGeometry(W * 0.42, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(st, body)); d.scale.y = (H * 0.15) / (W * 0.42); d.position.y = H * 0.85; withEdges(g, d, st, col); } break;
      case 'dome': { var dm = new THREE.Mesh(new THREE.SphereGeometry(W * 0.5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(st, body)); dm.scale.y = H / (W * 0.5); withEdges(g, dm, st, col); break; }
      case 'spire': box(W * 0.3, H * 0.55, W * 0.3, 0); cone(W * 0.2, H * 0.45, H * 0.55, 6); break;
      case 'rig': box(W * 0.8, H * 0.08, W * 0.8, H * 0.25); cyl(W * 0.03, W * 0.03, H * 0.25, 0, 6, null, W * 0.3); cyl(W * 0.03, W * 0.03, H * 0.25, 0, 6, null, -W * 0.3); cyl(W * 0.03, W * 0.25, H * 0.67, H * 0.33, 4); break;
      case 'bridge': box(W * 1.6, H * 0.1, W * 0.25, H * 0.9); box(W * 0.1, H * 0.9, W * 0.2, 0, -W * 0.6); box(W * 0.1, H * 0.9, W * 0.2, 0, W * 0.6); break;
      case 'balloon': { var ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, H * 0.8, 0)]), lineMat(st, col)); g.add(ln); var bb = ball(W * 0.25, H * 0.88, st.glow ? col : '#eceff1'); bb.scale.y = 1.4; break; }
      case 'lighthouse': cyl(W * 0.12, W * 0.2, H * 0.85, 0, 14, st.glow ? col : '#eceff1'); cyl(W * 0.14, W * 0.14, H * 0.1, H * 0.85, 10, st.glow ? col : '#ffee58'); cone(W * 0.16, H * 0.05, H * 0.95, 10, top); break;
      case 'peak': cone(W * 0.9, H, 0, 7); break;
      case 'sign': cyl(W * 0.03, W * 0.03, H * 0.6, 0, 6); box(W * 0.7, H * 0.4, W * 0.04, H * 0.6); break;
      case 'monument': { var ob = new THREE.Mesh(new THREE.CylinderGeometry(W * 0.06, W * 0.14, H, 4), mat(st, body)); ob.position.y = H / 2; ob.rotation.y = Math.PI / 4; withEdges(g, ob, st, col); break; }
      default: cyl(W * 0.08, W * 0.08, H, 0, 10); ball(W * 0.1, H, top);
    }
    return g;
  }

  function view3d(el, spec, hooks) {
    hooks = hooks || {};
    var doc = el.ownerDocument, win = doc.defaultView;
    var V = { style: spec.style || 'holo', on: {}, explode: 0, ex: spec.exag || 1, measure: false, picks: [], anim: [], groups: {}, meas: [] };
    (spec.layers || []).forEach(function (l) { V.on[l.id] = l.on !== false && l.d3 !== false; });
    el.innerHTML = '';
    el.style.position = el.style.position || 'relative';
    el.classList.add('fs-3d');
    var renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(2, win.devicePixelRatio || 1));
    el.appendChild(renderer.domElement);
    var scan = doc.createElement('div'); scan.className = 'fs-scan'; el.appendChild(scan);
    var tipEl = doc.createElement('div'); tipEl.className = 'fs-tip3'; el.appendChild(tipEl);
    var scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(45, 1, 1, 5e6), controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.12;
    var light = new THREE.DirectionalLight(0xffffff, 0.85); light.position.set(-1, 2, 1); scene.add(light); scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    var centre = spec.centre, F = frame(centre), ref = spec.ref || 0, ground = sampler(spec.terrain), world = new THREE.Group(); scene.add(world);
    var bb = spec.bbox || [centre[0] - 0.05, centre[1] - 0.05, centre[0] + 0.05, centre[1] + 0.05], c0 = F.xy([bb[0], bb[1]]), c1 = F.xy([bb[2], bb[3]]);
    var size = Math.max(c1[0] - c0[0], c1[1] - c0[1], 500), sep = size * 0.06;
    // the part that matters (the reference point and the obstacles that count): where the camera looks first
    var fb = spec.focus || bb, f0 = F.xy([fb[0], fb[1]]), f1 = F.xy([fb[2], fb[3]]), fsize = Math.max(f1[0] - f0[0], f1[1] - f0[1], 800), fc = [(f0[0] + f1[0]) / 2, (f0[1] + f1[1]) / 2];
    var W0 = Math.max(8, Math.min(size / 120, fsize / 40)); // visual width of a model (obstacles are shown larger than life to be seen)
    function P(c, h) { var q = F.xy(c); return new THREE.Vector3(q[0], ((h === undefined || h === null ? (ground(c[0], c[1]) || ref) : h) - ref) * V.ex, -q[1]); }
    function gz(c) { var g = ground(c[0], c[1]); return g === null ? ref : g; }
    var LEVEL = { terrain: 0, contours: 1, area: 2, runway: 3, obstacles: 4, surface: 5, path: 6, vector: 7, arc: 7, volume: 8, point: 6 };
    function layerLevel(ly) { return ly.level !== undefined ? ly.level : LEVEL[ly.kind] !== undefined ? LEVEL[ly.kind] : 4; }
    function build() {
      while (world.children.length) world.remove(world.children[0]);
      V.picks = []; V.anim = []; V.groups = {};
      var st = STYLES[V.style];
      renderer.setClearColor(st.bg, 1);
      el.setAttribute('data-style', V.style);
      scene.fog = st.glow ? new THREE.FogExp2(st.bg, 0.25 / size) : null;
      // reference grid (the ground plane of the scene), 1 km squares
      var gstep = size > 40000 ? 10000 : size > 8000 ? 1000 : 250, half = Math.ceil(size / gstep) * gstep;
      var grid = new THREE.GridHelper(half * 2, Math.round(half * 2 / gstep), st.grid, st.grid); grid.material.transparent = true; grid.material.opacity = st.glow ? 0.35 : 0.5; grid.position.y = -2; world.add(grid);
      (spec.layers || []).forEach(function (ly) {
        var g = new THREE.Group(); g.userData.level = layerLevel(ly); V.groups[ly.id] = g; g.visible = !!V.on[ly.id];
        try { (BUILD[ly.kind] || function () {})(g, ly, st); } catch (e) { /* a layer that cannot be built is left out */ }
        world.add(g);
      });
      // the plates of the exploded view: one per layer level used, with its name
      var plates = new THREE.Group(); plates.userData.plates = true; world.add(plates); V.plates = plates;
      var lv = {};
      (spec.layers || []).forEach(function (ly) { if (V.on[ly.id]) { var k = layerLevel(ly); (lv[k] = lv[k] || []).push(ly.name); } });
      Object.keys(lv).forEach(function (k) {
        var y = 0, pg = new THREE.Group(); pg.userData.level = +k;
        var sq = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([[-1, -1], [1, -1], [1, 1], [-1, 1]].map(function (p) { return new THREE.Vector3(p[0] * size * 0.55, y, p[1] * size * 0.55); })), lineMat(st, st.line, { opacity: 0.45 }));
        pg.add(sq);
        var lab = sprite(doc, [lv[k].join(' · ')], st.line, st, 0.026); lab.position.set(-size * 0.55, y, size * 0.55); pg.add(lab);
        plates.add(pg);
      });
      applyExplode();
    }
    function applyExplode() {
      world.children.forEach(function (g) { if (g.userData.level !== undefined) g.position.y = V.explode * g.userData.level * sep; });
      if (V.plates) { V.plates.visible = V.explode > 0.02; V.plates.children.forEach(function (p) { p.position.y = V.explode * p.userData.level * sep - 1; }); }
    }
    var BUILD = {
      terrain: function (g, ly, st) {
        var T = spec.terrain; if (!T || !T.z) return;
        var nx = T.w, ny = T.h, pos = new Float32Array(nx * ny * 3), col = new Float32Array(nx * ny * 3), mn = Infinity, mx = -Infinity;
        T.z.forEach(function (v) { if (v === v && v !== null) { mn = Math.min(mn, v); mx = Math.max(mx, v); } });
        for (var y = 0; y < ny; y++) for (var x = 0; x < nx; x++) {
          var lon = T.bbox[0] + (T.bbox[2] - T.bbox[0]) * x / (nx - 1), lat = T.bbox[3] - (T.bbox[3] - T.bbox[1]) * y / (ny - 1), z = T.z[y * nx + x], q = F.xy([lon, lat]), i = (y * nx + x) * 3;
          if (!(z === z) || z === null) z = mn;
          pos[i] = q[0]; pos[i + 1] = (z - ref) * V.ex; pos[i + 2] = -q[1];
          var t = mx > mn ? (z - mn) / (mx - mn) : 0, c = st.glow ? [0.02 + 0.1 * t, 0.35 + 0.5 * t, 0.5 + 0.45 * t] : V.style === 'cad' ? [0.82 - 0.25 * t, 0.85 - 0.25 * t, 0.88 - 0.25 * t] : hyp(t);
          col[i] = c[0]; col[i + 1] = c[1]; col[i + 2] = c[2];
        }
        var idx = [];
        for (y = 0; y < ny - 1; y++) for (x = 0; x < nx - 1; x++) { var a = y * nx + x, b = a + 1, c2 = a + nx, d = c2 + 1; idx.push(a, c2, b, b, c2, d); }
        var geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setIndex(idx); geo.computeVertexNormals();
        var m = new THREE.Mesh(geo, st.glow ? new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.22, depthWrite: false }) : new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
        g.add(m);
        if (st.glow || V.style === 'cad') { var w = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: st.terrain, wireframe: true, transparent: true, opacity: st.glow ? 0.12 : 0.14, blending: st.glow ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false })); g.add(w); }
      },
      contours: function (g, ly, st) {
        var T = spec.terrain; if (!T || !T.z) return;
        contourLevels(T, ly.n || 12).forEach(function (v, i) {
          var seg = contours(T, v), pts = [];
          seg.forEach(function (s) { pts.push(P(s[0], v), P(s[1], v)); });
          if (!pts.length) return;
          g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), lineMat(st, st.glow ? '#5ef2ff' : '#6d4c41', { opacity: i % 5 === 0 ? 0.95 : 0.55 })));
        });
      },
      obstacles: function (g, ly, st) {
        var items = ly.items.slice().sort(function (a, b) { return (b.hgt || 0) - (a.hgt || 0); }).slice(0, spec.modelMax || 1200), nTag = 0;
        items.forEach(function (o) {
          var top = o.top, base = o.base !== undefined && o.base !== null ? o.base : o.hgt !== undefined && o.hgt !== null ? top - o.hgt : gz(o.c);
          if (top === null || top === undefined) return;
          var H = Math.max(2, (top - base) * V.ex), col = (st.glow ? HOLO : SEV)[o.sev] || st.line, k = o.kind || kindOf(o.type, o.label);
          var m = model(k, H, W0 * (k === 'building' ? 1.6 : k === 'peak' ? 2 : 1), st, col), p = P(o.c, base);
          m.position.copy(p); g.add(m);
          m.traverse(function (x) { if (x.isMesh) { x.userData.item = o; V.picks.push(x); } });
          if (m.userData.rotor) V.anim.push({ k: 'rotor', o: m.userData.rotor });
          if (m.userData.slew) V.anim.push({ k: 'slew', o: m.userData.slew, ph: Math.random() * 6 });
          if (o.notam || o.temp) { // a temporary obstacle (NOTAM): a pulsing ring at its foot
            var ring = new THREE.Mesh(new THREE.RingGeometry(W0 * 0.9, W0 * 1.15, 32), new THREE.MeshBasicMaterial({ color: '#ffb300', transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
            ring.rotation.x = -Math.PI / 2; ring.position.copy(p).add(new THREE.Vector3(0, 1, 0)); g.add(ring); V.anim.push({ k: 'pulse', o: ring });
          }
          if (o.tag) { // the figures above the model, on a thin leader line; one tag above the other when they are close
            var lift = H + fsize * (0.06 + 0.05 * (nTag++ % 4)), tp = p.clone().add(new THREE.Vector3(0, lift, 0));
            g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([p.clone().add(new THREE.Vector3(0, H, 0)), tp]), lineMat(st, col, { opacity: 0.6 })));
            var sp = sprite(doc, o.tag.split('\n'), col, st, 0.024 * o.tag.split('\n').length); sp.position.copy(tp); sp.center.set(0, 0); g.add(sp);
          }
        });
      },
      polygon: function (g, ly, st) { ly.items.forEach(function (p) { drape(g, p.ring, p.color || ly.color || st.line, st, p.z, p.dash, p.label); }); },
      area: function (g, ly, st) { BUILD.polygon(g, ly, st); },
      surface: function (g, ly, st) {
        ly.items.forEach(function (s) {
          var pts = s.pts.slice(0, -1), xy = pts.map(function (p) { var q = F.xy(p); return new THREE.Vector2(q[0], -q[1]); });
          var tri = THREE.ShapeUtils.triangulateShape(xy, []), pos = [];
          tri.forEach(function (t) { t.forEach(function (k) { var v = P(pts[k], pts[k][2]); pos.push(v.x, v.y, v.z); }); });
          var geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.computeVertexNormals();
          var col = s.color || ly.color || st.line;
          g.add(new THREE.Mesh(geo, st.glow ? new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }) : new THREE.MeshLambertMaterial({ color: col, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false })));
          var edge = s.pts.map(function (p) { return P(p, p[2]); });
          g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(edge), lineMat(st, col, { opacity: 0.9 })));
          if (s.label) { var mid = edge[Math.floor(edge.length / 4)]; var sp = sprite(doc, [s.label], col, st, 0.026); sp.position.copy(mid); g.add(sp); }
        });
      },
      line: function (g, ly, st) {
        ly.items.forEach(function (p) {
          var col = p.color || ly.color || st.line, pts = p.pts.map(function (q) { return P(q, q[2]); }), geo = new THREE.BufferGeometry().setFromPoints(pts);
          var ln = new THREE.Line(geo, lineMat(st, col, p.dash ? { dash: size / 150 } : {})); if (p.dash) ln.computeLineDistances(); g.add(ln);
          if (p.curtain && p.pts[0][2] !== undefined) { // a curtain from the path to the ground: its height is read at a glance
            var pos = [];
            for (var i = 1; i < p.pts.length; i++) { var a = P(p.pts[i - 1], p.pts[i - 1][2]), b = P(p.pts[i], p.pts[i][2]), a0 = P(p.pts[i - 1]), b0 = P(p.pts[i]); pos.push(a.x, a.y, a.z, a0.x, a0.y, a0.z, b.x, b.y, b.z, b.x, b.y, b.z, a0.x, a0.y, a0.z, b0.x, b0.y, b0.z); }
            var cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
            g.add(new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: st.glow ? 0.1 : 0.14, side: THREE.DoubleSide, depthWrite: false, blending: st.glow ? THREE.AdditiveBlending : THREE.NormalBlending })));
          }
          if (p.label) { var sp = sprite(doc, [p.label], col, st, 0.026); sp.position.copy(pts[Math.min(pts.length - 1, 1)]); g.add(sp); }
        });
      },
      path: function (g, ly, st) { BUILD.line(g, ly, st); },
      vector: function (g, ly, st) { ly.items.forEach(function (v) { vectorTo(g, v, st); }); },
      arc: function (g, ly, st) {
        ly.items.forEach(function (a) {
          var pts = [], b0 = a.b0 === undefined ? 0 : a.b0, b1 = a.b1 === undefined ? 360 : a.b1, sw = ((b1 - b0) + 360) % 360 || 360, z = a.z === undefined ? null : a.z;
          for (var i = 0; i <= 96; i++) { var c = dst(a.c, b0 + sw * i / 96, a.r); pts.push(P(c, z === null ? gz(c) + 1 : z)); }
          var ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat(st, a.color || st.line, { dash: size / 200, opacity: 0.8 })); ln.computeLineDistances(); g.add(ln);
          if (a.label) { var sp = sprite(doc, [a.label], a.color || st.line, st, 0.022); sp.position.copy(pts[Math.round(96 * 0.12)]); g.add(sp); }
        });
      },
      runway: function (g, ly, st) {
        ly.items.forEach(function (r) {
          var z = r.z === undefined ? gz(r.ring[0]) : r.z, xy = r.ring.slice(0, -1).map(function (p) { var q = F.xy(p); return new THREE.Vector2(q[0], q[1]); });
          var geo = new THREE.ShapeGeometry(new THREE.Shape(xy)); geo.rotateX(-Math.PI / 2);
          var m = new THREE.Mesh(geo, st.glow ? new THREE.MeshBasicMaterial({ color: st.runway, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }) : new THREE.MeshLambertMaterial({ color: st.runway, side: THREE.DoubleSide }));
          m.position.y = (z - ref) * V.ex + 0.6; g.add(m);
          g.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(r.ring.map(function (p) { return P(p, z + 0.7 / V.ex); })), lineMat(st, st.glow ? st.runway : '#ffffff')));
          if (r.label) { var sp = sprite(doc, [r.label], st.line, st, 0.024); sp.position.copy(P(r.ring[0], z + 30)); g.add(sp); }
        });
      },
      volume: function (g, ly, st) {
        var cap = spec.cap || 6000;
        ly.items.forEach(function (v) {
          var lo = Math.max(v.lo || 0, 0), up = Math.min(v.up === undefined || v.up === null || !isFinite(v.up) ? cap : v.up, cap);
          if (up <= lo) return;
          var xy = v.ring.slice(0, -1).map(function (p) { var q = F.xy(p); return new THREE.Vector2(q[0], q[1]); });
          var geo = new THREE.ExtrudeGeometry(new THREE.Shape(xy), { depth: (up - lo) * V.ex, bevelEnabled: false, curveSegments: 1 }); geo.rotateX(-Math.PI / 2);
          var col = v.color || '#c62828', m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: st.glow ? 0.1 : 0.16, depthWrite: false, side: THREE.DoubleSide, blending: st.glow ? THREE.AdditiveBlending : THREE.NormalBlending }));
          m.position.y = (lo - ref) * V.ex; g.add(m);
          var e = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), lineMat(st, col, { opacity: 0.8 })); e.position.y = m.position.y; g.add(e);
          if (v.label) { var sp = sprite(doc, [v.label].concat(v.sub || []).slice(0, 3), col, st, 0.026); sp.position.copy(P(v.ring[0], up)); g.add(sp); }
        });
      },
      point: function (g, ly, st) {
        ly.items.forEach(function (p) {
          var v = P(p.c, p.z), m = new THREE.Mesh(new THREE.OctahedronGeometry(W0 * 0.6), mat(st, p.color || st.line, { opacity: 0.9 })); m.position.copy(v).add(new THREE.Vector3(0, W0, 0)); g.add(m);
          if (p.label) { var sp = sprite(doc, [p.label], p.color || st.line, st, 0.024); sp.position.copy(v).add(new THREE.Vector3(0, W0 * 3, 0)); g.add(sp); }
        });
      }
    };
    function hyp(t) { var s = [[0, [0.36, 0.55, 0.3]], [0.35, [0.62, 0.69, 0.41]], [0.65, [0.72, 0.6, 0.43]], [0.85, [0.6, 0.48, 0.38]], [1, [0.95, 0.95, 0.95]]]; for (var i = 1; i < s.length; i++) if (t <= s[i][0]) { var a = s[i - 1], b = s[i], k = (t - a[0]) / (b[0] - a[0]); return [0, 1, 2].map(function (j) { return a[1][j] + (b[1][j] - a[1][j]) * k; }); } return s[s.length - 1][1]; }
    // a ring on the ground (or at a height): areas
    function drape(g, ring, col, st, z, dash, label) {
      var pts = [];
      for (var i = 1; i < ring.length; i++) { var a = ring[i - 1], b = ring[i], n = Math.max(1, Math.ceil(Math.hypot(F.xy(b)[0] - F.xy(a)[0], F.xy(b)[1] - F.xy(a)[1]) / (size / 80))); for (var k = 0; k < n; k++) { var c = [a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]; pts.push(P(c, z === undefined || z === null ? gz(c) + 2 : z)); } }
      pts.push(pts[0]);
      var ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat(st, col, dash ? { dash: size / 120 } : {})); if (dash) ln.computeLineDistances(); g.add(ln);
      if (label) { var sp = sprite(doc, [label], col, st, 0.024); sp.position.copy(pts[0]); g.add(sp); }
    }
    // a distance vector: the slant line, its horizontal and vertical parts (dashed) and the figures
    function vectorTo(g, v, st) {
      var col = v.color || (st.glow ? '#ffd166' : '#00897b'), a = P(v.a, v.a[2]), b = P(v.b, v.b[2]), h = new THREE.Vector3(b.x, a.y, b.z);
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), lineMat(st, col, { over: true })));
      [[a, h], [h, b]].forEach(function (s) { var l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(s), lineMat(st, col, { dash: size / 250, opacity: 0.8, over: true })); l.computeLineDistances(); g.add(l); });
      [a, b].forEach(function (p) { var m = new THREE.Mesh(new THREE.SphereGeometry(W0 * 0.25, 10, 6), new THREE.MeshBasicMaterial({ color: col })); m.position.copy(p); g.add(m); });
      if (v.label) { var sp = sprite(doc, v.label, col, st, 0.024 * v.label.length); sp.position.copy(a.clone().lerp(b, 0.5)); g.add(sp); }
    }
    // camera: oblique over the scene
    function home() {
      var d = fsize * 1.25, ty = ((spec.focusZ !== undefined ? spec.focusZ : ref) - ref) * V.ex;
      controls.target.set(fc[0], ty, -fc[1]);
      camera.position.set(fc[0] - d * 0.6, ty + d * 0.5, -fc[1] + d * 0.8); camera.near = Math.max(1, fsize / 5000); camera.far = size * 40; camera.updateProjectionMatrix(); controls.update();
    }
    function resize() { var w = el.clientWidth || 800, h = el.clientHeight || 500; renderer.setSize(w, h, false); renderer.domElement.style.width = w + 'px'; renderer.domElement.style.height = h + 'px'; camera.aspect = w / h; camera.updateProjectionMatrix(); }
    // picking: hover shows the obstacle; in measure mode two clicks give the vector between them
    var ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
    function hit(ev) {
      var r = renderer.domElement.getBoundingClientRect(); mouse.x = (ev.clientX - r.left) / r.width * 2 - 1; mouse.y = -(ev.clientY - r.top) / r.height * 2 + 1;
      ray.setFromCamera(mouse, camera);
      var h = ray.intersectObjects(V.picks.filter(function (m) { var p = m; while (p) { if (p.visible === false) return false; p = p.parent; } return true; }), false)[0];
      return h ? { item: h.object.userData.item, point: h.point } : null;
    }
    renderer.domElement.addEventListener('pointermove', function (ev) {
      var h = hit(ev);
      if (!h) { tipEl.style.display = 'none'; return; }
      var o = h.item; tipEl.innerHTML = [o.label].concat(o.sub || []).map(function (l, i) { return i ? esc(l) : '<b>' + esc(l) + '</b>'; }).join('<br>');
      var r = el.getBoundingClientRect(); tipEl.style.display = 'block'; tipEl.style.left = (ev.clientX - r.left + 14) + 'px'; tipEl.style.top = (ev.clientY - r.top + 10) + 'px';
    });
    var downAt = null;
    renderer.domElement.addEventListener('pointerdown', function (ev) { downAt = [ev.clientX, ev.clientY]; });
    renderer.domElement.addEventListener('pointerup', function (ev) {
      if (!downAt || Math.hypot(ev.clientX - downAt[0], ev.clientY - downAt[1]) > 5) return;
      var h = hit(ev); if (!h) return;
      if (hooks.pick && !V.measure) hooks.pick(h.item);
      if (!V.measure) return;
      V.meas.push(h.item);
      if (V.meas.length === 2) { var a = V.meas[0], b = V.meas[1]; V.meas = []; addMeasure(a, b); }
      else setNote('Measure: now click the second obstacle');
    });
    var measG = new THREE.Group(); scene.add(measG);
    function addMeasure(a, b) {
      var d = distM(a.c, b.c), dh = b.top - a.top, slant = Math.hypot(d, dh), brg = bearing(a.c, b.c);
      var lines = [(d >= 1000 ? (d / 1000).toFixed(2) + ' km' : Math.round(d) + ' m') + ' · ' + (d / 1852).toFixed(2) + ' NM · ' + ('00' + Math.round(brg) % 360).slice(-3) + '°T', 'Δh ' + (dh >= 0 ? '+' : '') + dh.toFixed(1) + ' m (' + Math.round(dh / FT) + ' ft) · ' + (d ? (dh / d * 100).toFixed(2) + ' %' : ''), 'slant ' + (slant >= 1000 ? (slant / 1000).toFixed(2) + ' km' : Math.round(slant) + ' m') + ' · ' + (Math.atan2(dh, d) / D2R).toFixed(2) + '°'];
      while (measG.children.length) measG.remove(measG.children[0]);
      vectorTo(measG, { a: [a.c[0], a.c[1], a.top], b: [b.c[0], b.c[1], b.top], label: lines, color: '#ff6ec7' }, STYLES[V.style]);
      setNote((a.label || '') + ' → ' + (b.label || '') + ': ' + lines.join(' · '));
      if (hooks.measured) hooks.measured({ a: a, b: b, d: d, dh: dh, slant: slant, brg: brg });
    }
    function distM(a, b) { var la1 = a[1] * D2R, la2 = b[1] * D2R, h = Math.pow(Math.sin((la2 - la1) / 2), 2) + Math.cos(la1) * Math.cos(la2) * Math.pow(Math.sin((b[0] - a[0]) * D2R / 2), 2); return 2 * RE * Math.asin(Math.min(1, Math.sqrt(h))); }
    function bearing(a, b) { var la1 = a[1] * D2R, la2 = b[1] * D2R, dl = (b[0] - a[0]) * D2R; return (Math.atan2(Math.sin(dl) * Math.cos(la2), Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dl)) / D2R + 360) % 360; }
    // the toolbar: style, layers, exploded layers, height, measure, home, window, picture, print
    var bar = doc.createElement('div'); bar.className = 'fs-bar';
    bar.innerHTML = '<div class="fs-seg">' + [['holo', 'Hologram'], ['cad', 'CAD'], ['solid', 'Solid']].map(function (s) { return '<button data-st="' + s[0] + '"' + (s[0] === V.style ? ' class="on"' : '') + '>' + s[1] + '</button>'; }).join('') + '</div>' +
      '<button data-fs="layers" title="Layers">☰ Layers</button>' +
      '<label class="fs-rng" title="Pull the layers apart in height">Layers apart<input type="range" min="0" max="1" step="0.02" value="0" data-fs="explode" aria-label="Layers apart"></label>' +
      '<label class="fs-rng" title="Vertical exaggeration">Height ×<input type="range" min="1" max="10" step="1" value="' + V.ex + '" data-fs="exag" aria-label="Vertical exaggeration"></label>' +
      '<button data-fs="measure" title="Measure between two obstacles: distance, bearing, height difference, slant, angle">📏 Measure</button>' +
      '<button data-fs="home" title="Back to the whole scene">⟲</button>' +
      (hooks.popout ? '<button data-fs="pop" title="Open in a separate window">⤢</button>' : '') +
      (spec.compact ? '' : '<button data-fs="png" title="Save the picture (PNG)">⤓ PNG</button><button data-fs="print" title="Print the picture with its title and legend">🖨</button>');
    el.appendChild(bar);
    var note = doc.createElement('div'); note.className = 'fs-note'; el.appendChild(note);
    function setNote(t) { note.textContent = t || ''; note.style.display = t ? 'block' : 'none'; }
    var pop = doc.createElement('div'); pop.className = 'fs-pop'; pop.style.display = 'none'; el.appendChild(pop);
    function layersPop() {
      pop.innerHTML = '<b>Layers</b>' + (spec.layers || []).filter(function (l) { return l.d3 !== false; }).map(function (l) { return '<label><input type="checkbox" data-ly="' + esc(l.id) + '"' + (V.on[l.id] ? ' checked' : '') + '> ' + esc(l.name) + (l.items && l.items.length ? ' <span>' + l.items.length + '</span>' : '') + '</label>'; }).join('');
      pop.style.display = pop.style.display === 'none' ? 'block' : 'none';
    }
    pop.addEventListener('change', function (e) { var id = e.target.getAttribute('data-ly'); if (!id) return; V.on[id] = e.target.checked; if (V.groups[id]) V.groups[id].visible = V.on[id]; if (V.explode > 0.02) build(); });
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var stl = b.getAttribute('data-st');
      if (stl) { V.style = stl; bar.querySelectorAll('[data-st]').forEach(function (x) { x.classList.toggle('on', x === b); }); build(); return; }
      var k = b.getAttribute('data-fs');
      if (k === 'layers') layersPop();
      else if (k === 'measure') { V.measure = !V.measure; V.meas = []; b.classList.toggle('on', V.measure); setNote(V.measure ? 'Measure: click a first obstacle' : ''); if (!V.measure) while (measG.children.length) measG.remove(measG.children[0]); }
      else if (k === 'home') home();
      else if (k === 'pop' && hooks.popout) hooks.popout({ style: V.style, exag: V.ex });
      else if (k === 'png') { var a = doc.createElement('a'); a.href = png(); a.download = (spec.file || 'obstacle_assessment_3d') + '.png'; doc.body.appendChild(a); a.click(); a.remove(); }
      else if (k === 'print') printPic(doc, png(), spec);
    });
    bar.addEventListener('input', function (e) {
      var k = e.target.getAttribute('data-fs');
      if (k === 'explode') { V.explode = +e.target.value; applyExplode(); }
      else if (k === 'exag') { V.ex = +e.target.value; build(); }
    });
    function png() { renderer.render(scene, camera); return renderer.domElement.toDataURL('image/png'); }
    var t0 = win.performance.now(), raf = 0, alive = true;
    function loop() {
      if (!alive) return;
      raf = win.requestAnimationFrame(loop);
      var t = (win.performance.now() - t0) / 1000;
      V.anim.forEach(function (a) {
        if (a.k === 'rotor') a.o.rotation.z = t * 1.6;
        else if (a.k === 'slew') a.o.rotation.y = Math.sin(t * 0.25 + a.ph) * 0.9;
        else if (a.k === 'pulse') { var s = 1 + 0.6 * ((t * 0.8) % 1); a.o.scale.set(s, s, s); a.o.material.opacity = 0.9 * (1 - (t * 0.8) % 1); }
      });
      controls.update(); renderer.render(scene, camera);
    }
    var ro = typeof win.ResizeObserver !== 'undefined' ? new win.ResizeObserver(resize) : null; if (ro) ro.observe(el);
    resize(); build(); home(); loop(); setNote('');
    return {
      png: png, resize: resize, home: home,
      setStyle: function (s) { V.style = s; build(); }, state: V,
      destroy: function () { alive = false; win.cancelAnimationFrame(raf); if (ro) ro.disconnect(); try { renderer.dispose(); renderer.forceContextLoss(); } catch (e) { /* gone */ } el.innerHTML = ''; }
    };
  }
  // a printable page with the picture, its title, sub title and legend
  function printPic(doc, src, spec) {
    var w = doc.defaultView.open('', '_blank', 'width=1100,height=800');
    if (!w) return;
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>' + esc(spec.title || 'Obstacle assessment') + '</title><style>body{font:13px "Segoe UI",Arial,sans-serif;margin:14mm;color:#1d2a36}h1{font-size:18px;margin:0 0 2px}p{margin:2px 0 8px;color:#55616d}img{width:100%;border:1px solid #c3ccd8}.lg{margin-top:8px;font-size:11px;color:#55616d}@page{size:A4 landscape;margin:10mm}</style></head><body>' +
      '<h1>' + esc(spec.title || '') + '</h1><p>' + esc(spec.sub || '') + '</p><img src="' + src + '"><div class="lg">' + esc(spec.note || 'Indicative visualisation — not for navigation.') + ' · ' + new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC</div></body></html>');
    w.document.close();
    setTimeout(function () { w.focus(); w.print(); }, 400);
  }

  /* ------------------------------------------------------------ profile (SVG) */
  // spec: {title, len (m), unit 'ft'|'m', terrain [[s, z]], obstacles [{s, top, base, label, sev, kind}], lines [{pts [[s, z]], color, dash, label, w}], marks [{s, label}], zMin, zMax}
  function profileSvg(p) {
    var W = p.w || 1100, H = p.h || 380, ml = 64, mr = 18, mt = 26, mb = 40, u = p.unit === 'm' ? 1 : FT, ul = p.unit === 'm' ? 'm' : 'ft';
    var zs = [];
    (p.terrain || []).forEach(function (q) { zs.push(q[1]); });
    (p.obstacles || []).forEach(function (o) { zs.push(o.top); if (o.base !== undefined && o.base !== null) zs.push(o.base); });
    (p.lines || []).forEach(function (l) { l.pts.forEach(function (q) { if (q[0] <= p.len) zs.push(q[1]); }); });
    (p.bands || []).forEach(function (b) { if (b.lo !== undefined && b.lo !== null && isFinite(b.lo)) zs.push(b.lo); });
    var z0 = p.zMin !== undefined ? p.zMin : Math.min.apply(null, zs.concat([0])), z1 = p.zMax !== undefined ? p.zMax : Math.max.apply(null, zs.concat([z0 + 50]));
    var pad = (z1 - z0) * 0.08 || 10; z0 -= pad; z1 += pad;
    function X(s) { return ml + s / p.len * (W - ml - mr); }
    function Y(z) { return H - mb - (z - z0) / (z1 - z0) * (H - mt - mb); }
    var h = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="font:11px Segoe UI,Arial,sans-serif;background:#fff">';
    // grid and axes
    var sx = nice(p.len / 8), sz = nice((z1 - z0) / u / 6);
    for (var s = 0; s <= p.len + 1; s += sx) h += '<line x1="' + X(s) + '" y1="' + mt + '" x2="' + X(s) + '" y2="' + (H - mb) + '" stroke="#e6ebf0"/><text x="' + X(s) + '" y="' + (H - mb + 14) + '" text-anchor="middle" fill="#55616d">' + (s >= 1000 ? (s / 1000).toFixed(s % 1000 ? 1 : 0) + ' km' : Math.round(s) + ' m') + '</text>';
    for (var zz = Math.ceil(z0 / u / sz) * sz; zz * u <= z1; zz += sz) h += '<line x1="' + ml + '" y1="' + Y(zz * u) + '" x2="' + (W - mr) + '" y2="' + Y(zz * u) + '" stroke="#e6ebf0"/><text x="' + (ml - 6) + '" y="' + (Y(zz * u) + 4) + '" text-anchor="end" fill="#55616d">' + Math.round(zz) + '</text>';
    h += '<text x="' + (ml - 50) + '" y="' + (mt - 10) + '" fill="#55616d">' + ul + ' AMSL</text><text x="' + (W - mr) + '" y="' + (H - 6) + '" text-anchor="end" fill="#55616d">' + esc(p.xLabel || 'distance along the path') + '</text>';
    // airspace crossed: a band from entry to exit between its lower and upper limits
    (p.bands || []).forEach(function (b) {
      var lo = Math.max(z0, b.lo === undefined || b.lo === null ? z0 : b.lo), up = Math.min(z1, b.up === undefined || b.up === null || !isFinite(b.up) ? z1 : b.up);
      if (up <= lo) return;
      h += '<rect x="' + X(b.s0).toFixed(1) + '" y="' + Y(up).toFixed(1) + '" width="' + Math.max(2, X(b.s1) - X(b.s0)).toFixed(1) + '" height="' + (Y(lo) - Y(up)).toFixed(1) + '" fill="' + (b.color || '#c62828') + '" fill-opacity=".14" stroke="' + (b.color || '#c62828') + '" stroke-dasharray="4 3"/>';
      if (b.label) h += '<text x="' + (X(b.s0) + 3) + '" y="' + (Y(up) + 12) + '" fill="' + (b.color || '#c62828') + '" font-weight="600">' + esc(b.label) + '</text>';
    });
    if (p.terrain && p.terrain.length) h += '<path d="M' + X(p.terrain[0][0]) + ' ' + Y(z0) + p.terrain.map(function (q) { return 'L' + X(q[0]).toFixed(1) + ' ' + Y(q[1]).toFixed(1); }).join('') + 'L' + X(p.terrain[p.terrain.length - 1][0]) + ' ' + Y(z0) + 'Z" fill="#d7c9a8" stroke="#8d7b5a" stroke-width="1"/>';
    (p.lines || []).forEach(function (l) {
      var pts = l.pts.filter(function (q) { return q[0] >= 0 && q[0] <= p.len * 1.0001; });
      if (pts.length < 2) return;
      h += '<polyline points="' + pts.map(function (q) { return X(q[0]).toFixed(1) + ',' + Y(q[1]).toFixed(1); }).join(' ') + '" fill="none" stroke="' + (l.color || '#1565c0') + '" stroke-width="' + (l.w || 2) + '"' + (l.dash ? ' stroke-dasharray="' + l.dash + '"' : '') + '/>';
      if (l.label) { var q = pts[pts.length - 1]; h += '<text x="' + (X(q[0]) - 4) + '" y="' + (Y(q[1]) - 5) + '" text-anchor="end" fill="' + (l.color || '#1565c0') + '" font-weight="600">' + esc(l.label) + '</text>'; }
    });
    var obs = (p.obstacles || []).slice().sort(function (a, b) { return a.s - b.s; });
    obs.forEach(function (o) {
      var col = SEV[o.sev] || '#546e7a', base = o.base !== undefined && o.base !== null ? o.base : z0, x = X(o.s);
      h += '<line x1="' + x + '" y1="' + Y(base) + '" x2="' + x + '" y2="' + Y(o.top) + '" stroke="' + col + '" stroke-width="' + (o.sev === 'error' ? 3 : 2) + '"/><circle cx="' + x + '" cy="' + Y(o.top) + '" r="2.6" fill="' + col + '"/>';
    });
    // labels of the obstacles that matter (worst first, not overlapping)
    var placed = [];
    obs.filter(function (o) { return o.tag; }).slice(0, 14).forEach(function (o) {
      var x = X(o.s), y = Y(o.top) - 8;
      while (placed.some(function (q) { return Math.abs(q[0] - x) < 110 && Math.abs(q[1] - y) < 13; })) y -= 13;
      placed.push([x, y]);
      h += '<text x="' + (x + 4) + '" y="' + y + '" fill="' + (SEV[o.sev] || '#37474f') + '" font-weight="600">' + esc(o.tag) + '</text>';
    });
    (p.marks || []).forEach(function (m) { var x = X(m.s); h += '<line x1="' + x + '" y1="' + mt + '" x2="' + x + '" y2="' + (H - mb) + '" stroke="#90a4ae" stroke-dasharray="3 3"/><text x="' + (x + 3) + '" y="' + (mt + 10) + '" fill="#546e7a">' + esc(m.label) + '</text>'; });
    if (p.title) h += '<text x="' + ml + '" y="' + (mt - 10) + '" fill="#1d2a36" font-weight="700">' + esc(p.title) + '</text>';
    return h + '</svg>';
  }
  function nice(v) { var p = Math.pow(10, Math.floor(Math.log10(Math.max(v, 1e-9)))); return [1, 2, 2.5, 5, 10].map(function (k) { return k * p; }).filter(function (k) { return k >= v; })[0] || v; }
  // an SVG as a PNG (for PDF reports)
  function svgPng(svg, w, h) {
    return new Promise(function (res) {
      var img = new Image(); img.onload = function () { var c = document.createElement('canvas'); c.width = w; c.height = h; var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(img, 0, 0, w, h); res(c.toDataURL('image/png')); };
      img.onerror = function () { res(null); };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace('width="100%"', 'width="' + w + '" height="' + h + '"'));
    });
  }

  /* ------------------------------------------------------------ a separate window */
  // kind: 'map' | '3d'; the window gets the styles of the page, Leaflet, three.js and this file (elements marked data-fltwin)
  function popout(kind, spec, opts) {
    opts = opts || {};
    var name = 'aixm-flt-' + kind, w = window.open('', name, 'width=1320,height=880');
    if (!w) return null;
    var d = w.document;
    d.open();
    d.write('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + esc((kind === 'map' ? 'Map' : '3D') + ' — ' + (spec.title || 'Obstacle assessment')) + '</title></head>' +
      '<body style="margin:0;overflow:hidden"><div class="fs-winhead"><b>' + esc(spec.title || '') + '</b><span>' + esc(spec.sub || '') + '</span><button onclick="window.print()">🖨 Print</button></div><div id="fs-root" style="position:fixed;inset:44px 0 0 0"></div></body></html>');
    d.close();
    document.querySelectorAll('style').forEach(function (st) { var c = d.createElement('style'); c.textContent = st.textContent; d.head.appendChild(c); });
    document.querySelectorAll('[data-fltwin]').forEach(function (src) { var c = d.createElement('script'); if (src.type && src.type !== 'text/plain') c.type = src.type; c.textContent = src.textContent; d.head.appendChild(c); });
    if (opts.source) { var me = d.createElement('script'); me.textContent = opts.source; d.head.appendChild(me); }
    var root = d.getElementById('fs-root'), sp = Object.assign({}, spec, { style: opts.style || spec.style, exag: opts.exag || spec.exag });
    var h = kind === 'map' ? w.FLTSCENE.map(root, sp, opts.hooks || {}) : w.FLTSCENE.view3d(root, sp, opts.hooks || {});
    w.focus();
    return { win: w, view: h };
  }

  return { map: mapView, view3d: view3d, profile: profileSvg, svgPng: svgPng, popout: popout, printPic: printPic, iconSvg: iconSvg, legendHtml: legendHtml, kindOf: kindOf, KIND_NAME: KIND_NAME,
    SEV: SEV, contours: contours, contourLevels: contourLevels, sampler: sampler };
})();
if (typeof module !== 'undefined') module.exports = FLTSCENE;
