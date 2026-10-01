/*!
 * AIXM Code Converter
 * Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com> - author of the AIXM Code Converter
 * SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE; keep this notice in all copies)
 * ==========================================================================
 * AIXM Code Converter - 3D view (three.js / WebGL)
 *   Area      : terrain model (built-in grid, high-resolution tiles when
 *               online) with airspace volumes between their lower and upper
 *               limits, runways, aerodromes, obstacles and procedures in 3D.
 *               Hover anywhere: terrain elevation and the airspace column
 *               (every airspace above that point with its vertical limits).
 *   Approach  : crew view down the glide path of a runway (ILS GP angle or
 *               3°), slider / fly-through 15 NM to the threshold, with
 *               altitude, height above threshold, terrain clearance and the
 *               airspace the aircraft is in.
 *   Departure : crew view along the climb-out (3.3 % / 200 ft per NM from
 *               35 ft at the departure end), same read-outs.
 * Instrument procedures of the aerodrome are drawn at their published
 * altitudes (interpolated between constraints) with a curtain to the ground.
 * Local east-north-up frame in metres; vertical exaggeration selectable.
 * Indicative visualisation - not for navigation.
 * ========================================================================== */
/* global THREE, AX, MODEL, AIP, ADCHART, TERRAIN, MAPVIEW, OLS, topojson */
var VIEW3D = (function () {
  'use strict';
  var M = MODEL, s = M.s, arr = AX.arr, FT = 0.3048, NMM = 1852, D2R = Math.PI / 180;
  var V = null; // the open view
  var land10 = null; // Natural Earth 1:10m land, for an exact coastline over the coarse terrain grid

  /* ------------------------------------------------------------ helpers */
  function esc(t) { return String(t === undefined || t === null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function ft(m) { return Math.round(m / FT).toLocaleString('en-US'); }
  function toM(q) { // {v,u} or "49.6 FT" -> metres
    if (q === undefined || q === null || q === '') return null;
    if (typeof q === 'string') { var mm = q.match(/(-?[\d.]+)\s*(FT|M)?/i); if (!mm) return null; return parseFloat(mm[1]) * (/FT/i.test(mm[2] || '') ? FT : 1); }
    q = arr(q)[0];
    if (!q || q.nil !== undefined || q.v === undefined) return null;
    var v = parseFloat(q.v); if (isNaN(v)) return null;
    var u = String(q.u || 'M').toUpperCase();
    return u === 'FL' ? v * 100 * FT : /FT/.test(u) ? v * FT : u === 'KM' ? v * 1000 : v;
  }
  // AIXM vertical limit -> {m, unl, txt}; AGL / SFC references are added to the ground elevation
  function limit(v, ref, ground) {
    v = arr(v)[0];
    if (v === undefined || v === null || (typeof v === 'object' && v.nil !== undefined)) return null;
    var val = typeof v === 'object' ? v.v : v, txt = M.fLimit(v, ref);
    if (/^(GND|SFC|FLOOR)$/i.test(String(val))) return { m: ground, txt: 'GND' };
    if (/^(UNL|CEILING)$/i.test(String(val))) return { m: Infinity, unl: true, txt: 'UNL' };
    var m = toM(v); if (m === null) return null;
    if (/^(SFC|OTHER:HEI)$/.test(s(ref))) m += ground;
    return { m: m, txt: ADCHART.tidy(txt) };
  }
  function inRing(lon, lat, r) {
    var ins = false;
    for (var i = 0, j = r.length - 1; i < r.length; j = i++) { var xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1]; if (((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) ins = !ins; }
    return ins;
  }
  function hyps(h) {
    var st = [[-1, [168, 205, 228]], [0, [201, 223, 168]], [300, [226, 230, 170]], [700, [232, 211, 150]], [1300, [214, 172, 120]], [2200, [185, 140, 98]], [3200, [160, 130, 110]], [4300, [240, 238, 236]]];
    if (h <= 0) return st[0][1];
    for (var i = 1; i < st.length - 1; i++) if (h < st[i + 1][0]) { var f = (h - st[i][0]) / (st[i + 1][0] - st[i][0]); return st[i][1].map(function (c, k) { return c + (st[i + 1][1][k] - c) * f; }); }
    return st[st.length - 1][1];
  }
  function sprite(lines, color, h) {
    var c = document.createElement('canvas'), ctx = c.getContext('2d'), fs = 28;
    ctx.font = '700 ' + fs + 'px "Segoe UI", Arial, sans-serif';
    var w = 0; lines.forEach(function (l) { w = Math.max(w, ctx.measureText(l).width); });
    c.width = Math.ceil(w + 24); c.height = Math.ceil(lines.length * fs * 1.25 + 16);
    ctx.fillStyle = 'rgba(255,255,255,.88)'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.strokeRect(1.5, 1.5, c.width - 3, c.height - 3);
    lines.forEach(function (l, i) { ctx.font = (i ? '600 ' : '700 ') + (i ? fs * 0.85 : fs) + 'px "Segoe UI", Arial, sans-serif'; ctx.fillStyle = i ? '#222' : color; ctx.textBaseline = 'middle'; ctx.fillText(l, 12, 8 + fs * 1.25 * (i + 0.5)); });
    var tex = new THREE.CanvasTexture(c); tex.minFilter = THREE.LinearFilter;
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, sizeAttenuation: false, transparent: true }));
    h = h || 0.04 * lines.length; sp.scale.set(h * c.width / c.height, h, 1); sp.renderOrder = 10;
    return sp;
  }

  /* ------------------------------------------------------------- UI */
  function ui(host) {
    var d = document.createElement('div');
    d.className = 'v3d';
    d.innerHTML = '<div class="v3d-gl"></div>' +
      '<div class="v3d-bar card">' +
      '<b class="v3d-title">3D view</b>' +
      '<select class="inp" data-3="mode" title="View"><option value="area">Area — terrain and airspace</option><option value="approach">Approach — crew view</option><option value="departure">Departure — crew view</option></select>' +
      '<select class="inp" data-3="ad" title="Aerodrome"></select><select class="inp" data-3="end" title="Runway"></select>' +
      '<label class="v3d-sl" data-3="slwrap"><span data-3="sltxt"></span><input type="range" data-3="dist" min="0" max="15" step="0.1" value="8"></label>' +
      '<button class="btn small" data-3="play" title="Fly the approach / departure">▶ Fly</button>' +
      '<select class="inp" data-3="ex" title="Vertical exaggeration"><option value="1">1× height</option><option value="2">2× height</option><option value="3" selected>3× height</option><option value="5">5× height</option></select>' +
      '<select class="inp" data-3="cap" title="Show airspace up to"><option value="3048">airspace to FL100</option><option value="6096">to FL200</option><option value="7620" selected>to FL250</option><option value="13716">to FL450</option><option value="18288">to FL600</option></select>' +
      '<span class="sp"></span><button class="btn small ghost" data-3="close" title="Close the 3D view">✕ Close 3D</button></div>' +
      '<div class="v3d-layers card">' + [['terrain', 'Terrain', 1], ['airspace', 'Airspace', 1], ['fir', 'FIR / UIR', 0], ['obst', 'Obstacles', 1], ['ols', 'Obstacle surfaces (Annex 14)', 0], ['procs', 'Procedures', 1], ['labels', 'Labels', 1]]
        .map(function (x) { return '<label class="chk"><input type="checkbox" data-l="' + x[0] + '"' + (x[2] ? ' checked' : '') + '> ' + x[1] + '</label>'; }).join('') + '</div>' +
      '<div class="v3d-info card" data-3="info">Move the mouse over the terrain: elevation and the airspace column at that point.</div>' +
      '<div class="v3d-read card hidden" data-3="read"></div>' +
      '<div class="v3d-foot" data-3="foot"></div>';
    host.appendChild(d);
    return d;
  }
  function q(k) { return V.el.querySelector('[data-3="' + k + '"]'); }
  function layerOn(k) { var cb = V.el.querySelector('[data-l="' + k + '"]'); return !cb || cb.checked; }

  /* -------------------------------------------------------- scene build */
  function clearScene() {
    if (!V.world) return;
    V.scene.remove(V.world);
    V.world.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); }); }
    });
    V.world = null;
  }
  function bboxFor() {
    var o = V.opts;
    if (o.mode !== 'area' && V.rw) {
      var c = [(V.rw.a[0] + V.rw.b[0]) / 2, (V.rw.a[1] + V.rw.b[1]) / 2], dy = 17 / 60, dx = dy / Math.cos(c[1] * D2R);
      return [c[0] - dx, c[1] - dy, c[0] + dx, c[1] + dy];
    }
    var b = o.bbox.slice(), cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2, mx = 6, my = 4.5, nx = 1.2 / Math.cos(cy * D2R), ny = 0.9;
    if (b[2] - b[0] > mx || b[3] - b[1] > my) { V.capped = true; b = [cx - mx / 2, cy - my / 2, cx + mx / 2, cy + my / 2]; }
    if (b[2] - b[0] < nx && b[3] - b[1] < ny) b = [cx - nx / 2, cy - ny / 2, cx + nx / 2, cy + ny / 2]; // at least about 70 x 55 NM
    return b;
  }
  function build() {
    var my = ++V.gen;
    clearScene();
    V.bb = bboxFor();
    var bb = V.bb, lon0 = (bb[0] + bb[2]) / 2, lat0 = (bb[1] + bb[3]) / 2, kx = Math.cos(lat0 * D2R) * 111320, ky = 110574;
    V.P = { x: function (lon) { return (lon - lon0) * kx; }, z: function (lat) { return -(lat - lat0) * ky; }, lon: function (x) { return lon0 + x / kx; }, lat: function (z) { return lat0 - z / ky; } };
    V.W = (bb[2] - bb[0]) * kx; V.H = (bb[3] - bb[1]) * ky;
    q('foot').textContent = 'Loading terrain…';
    var timeout = new Promise(function (r) { setTimeout(function () { r(null); }, 7000); });
    Promise.race([TERRAIN.area(bb, 30), timeout]).catch(function () { return null; }).then(function (online) {
      if (!V || my !== V.gen) return;
      V.sample = online ? online.sample : TERRAIN.elev;
      V.terrainSrc = online ? online.source : 'built-in terrain model (0.25°)';
      V.ex = +q('ex').value;
      if (V.opts.mode !== 'area') V.ex = Math.min(V.ex, 1.5);
      V.world = new THREE.Group();
      V.scene.add(V.world);
      V.pick = []; V.volumes = [];
      if (layerOn('terrain')) terrain(); else flatGround();
      airspaces();
      runways();
      if (layerOn('obst')) obstacles();
      if (layerOn('ols')) olsLayer();
      if (layerOn('procs')) procedures();
      if (V.opts.mode !== 'area') crewPath();
      foot();
      placeCamera(true);
    });
  }
  function ground(lon, lat) { return Math.max(0, V.sample(lon, lat)); }
  function vec(lon, lat, m) { return new THREE.Vector3(V.P.x(lon), m * V.ex, V.P.z(lat)); }
  // land / sea mask of the view drawn from the coastline (1:10m), sampled per terrain vertex
  function landMask() {
    var S = 1024, c = document.createElement('canvas'); c.width = c.height = S;
    var ctx = c.getContext('2d'), bb = V.bb;
    try {
      if (!land10) { var w = JSON.parse(document.getElementById('data-world10').textContent); land10 = topojson.feature(w, w.objects.countries).features; }
    } catch (e) { return null; }
    function X(lon) { return (lon - bb[0]) / (bb[2] - bb[0]) * S; }
    function Y(lat) { return (bb[3] - lat) / (bb[3] - bb[1]) * S; }
    ctx.fillStyle = '#fff';
    land10.forEach(function (f) {
      var g = f.geometry; if (!g) return;
      (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []).forEach(function (poly) {
        var r0 = poly[0], ok = false;
        for (var i = 0; i < r0.length; i += 8) if (r0[i][0] > bb[0] - 3 && r0[i][0] < bb[2] + 3 && r0[i][1] > bb[1] - 3 && r0[i][1] < bb[3] + 3) { ok = true; break; }
        if (!ok && !(r0.length > 200)) return;
        ctx.beginPath();
        poly.forEach(function (ring) { ring.forEach(function (p, j) { if (j) ctx.lineTo(X(p[0]), Y(p[1])); else ctx.moveTo(X(p[0]), Y(p[1])); }); ctx.closePath(); });
        ctx.fill('evenodd');
      });
    });
    var d = ctx.getImageData(0, 0, S, S).data;
    return function (lon, lat) { var x = Math.floor(X(lon)), y = Math.floor(Y(lat)); if (x < 0 || y < 0 || x >= S || y >= S) return true; return d[(y * S + x) * 4] > 127; };
  }
  function terrain() {
    var N = 160, geo = new THREE.PlaneGeometry(V.W, V.H, N, N), isLand = landMask();
    geo.rotateX(-Math.PI / 2);
    var pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
    for (var i = 0; i < pos.count; i++) {
      var lon = V.P.lon(pos.getX(i)), lat = V.P.lat(pos.getZ(i)), h = V.sample(lon, lat), sea = isLand ? !isLand(lon, lat) : h <= 0 && TERRAIN.elev(lon, lat) <= 0;
      if (!sea && h < 1) h = 1;
      pos.setY(i, sea ? 0 : Math.max(0, h) * V.ex);
      var c = hyps(sea ? -1 : Math.max(1, h));
      col[i * 3] = c[0] / 255; col[i * 3 + 1] = c[1] / 255; col[i * 3 + 2] = c[2] / 255;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    var mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.userData.terrain = true;
    V.world.add(mesh); V.ground = mesh;
    // 1° grid lines on the ground for orientation
    var g = [], st = V.W > 200000 ? 1 : 0.25;
    for (var lo = Math.ceil(V.bb[0] / st) * st; lo <= V.bb[2]; lo += st) for (var la = V.bb[1]; la < V.bb[3]; la += (V.bb[3] - V.bb[1]) / 40) { g.push(vec(lo, la, ground(lo, la) + 30), vec(lo, la + (V.bb[3] - V.bb[1]) / 40, ground(lo, la + (V.bb[3] - V.bb[1]) / 40) + 30)); }
    for (var la2 = Math.ceil(V.bb[1] / st) * st; la2 <= V.bb[3]; la2 += st) for (var lo2 = V.bb[0]; lo2 < V.bb[2]; lo2 += (V.bb[2] - V.bb[0]) / 40) { g.push(vec(lo2, la2, ground(lo2, la2) + 30), vec(lo2 + (V.bb[2] - V.bb[0]) / 40, la2, ground(lo2 + (V.bb[2] - V.bb[0]) / 40, la2) + 30)); }
    V.world.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(g), new THREE.LineBasicMaterial({ color: 0x556070, transparent: true, opacity: 0.35 })));
  }
  function flatGround() {
    var geo = new THREE.PlaneGeometry(V.W, V.H); geo.rotateX(-Math.PI / 2);
    var mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0xdfe6d8 })); mesh.userData.terrain = true;
    V.world.add(mesh); V.ground = mesh;
  }
  // airspace volumes: one extruded prism per horizontal projection, between lower and upper limit
  function airspaces() {
    var ds = V.ds, cap = +q('cap').value, labels = [];
    (ds.byType.Airspace || []).forEach(function (a) {
      var cat = MAPVIEW.asCat(s(a.cur.p.type));
      if (cat === 'fir' ? !layerOn('fir') : !layerOn('airspace')) return;
      var g = M.geometry(ds, a), parts = !g ? [] : g.t === 'M' ? g.parts : [g], pi = 0;
      arr(a.cur.p.geometryComponent).forEach(function (gc) {
        var vol = gc && gc.theAirspaceVolume;
        if (!vol || vol.nil !== undefined) return;
        var part = vol.horizontalProjection && vol.horizontalProjection._geo ? parts[pi++] : vol.centreline && vol.centreline._geo ? (pi++, null) : null;
        if (!part || part.t !== 'A') return;
        var ring = part.c[0].filter(function (p) { return typeof p[0] === 'number'; });
        if (ring.length < 3) return;
        var b = [180, 90, -180, -90];
        ring.forEach(function (p) { b[0] = Math.min(b[0], p[0]); b[1] = Math.min(b[1], p[1]); b[2] = Math.max(b[2], p[0]); b[3] = Math.max(b[3], p[1]); });
        if (b[2] < V.bb[0] || b[0] > V.bb[2] || b[3] < V.bb[1] || b[1] > V.bb[3]) return;
        var cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2, gr = ground(cx, cy);
        var lo = limit(vol.lowerLimit, vol.lowerLimitReference, gr) || { m: 0, txt: 'GND' }, up = limit(vol.upperLimit, vol.upperLimitReference, gr) || { m: lo.m + 300, txt: '?' };
        if (lo.m >= cap) return;
        var top = Math.min(up.m, cap), bot = Math.max(0, lo.m);
        if (top <= bot) return;
        var shape = new THREE.Shape(ring.map(function (p) { return new THREE.Vector2(V.P.x(p[0]), -V.P.z(p[1])); }));
        var geo = new THREE.ExtrudeGeometry(shape, { depth: (top - bot) * V.ex, bevelEnabled: false, curveSegments: 1 });
        geo.rotateX(-Math.PI / 2);
        var col = new THREE.Color(MAPVIEW.COLORS[cat] || '#546e7a');
        var mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: cat === 'fir' ? 0.05 : V.opts.mode === 'area' ? 0.12 : 0.05, depthWrite: false, side: THREE.DoubleSide }));
        mesh.position.y = bot * V.ex;
        var info = { rec: a, ring: ring, lo: lo, up: up, bot: bot, top: up.m, cls: AIP.airspaceClass(a).split('\n')[0], name: M.label(ds, a), cat: cat, clipped: up.m > cap };
        mesh.userData.as = info;
        V.world.add(mesh);
        var edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.7 }));
        edges.position.y = mesh.position.y; V.world.add(edges);
        V.volumes.push(info); V.pick.push(mesh);
        labels.push({ info: info, size: (b[2] - b[0]) * (b[3] - b[1]), at: [cx, cy] });
      });
    });
    if (!layerOn('labels')) return;
    labels.sort(function (x, y) { return y.size - x.size; }).slice(0, V.opts.mode === 'area' ? 20 : 6).forEach(function (l) {
      var i = l.info, sp = sprite([i.name.length > 30 ? i.name.slice(0, 29) + '…' : i.name, [i.cls ? 'CLASS ' + i.cls.charAt(0) : '', i.up.txt + ' / ' + i.lo.txt].filter(Boolean).join(' · ')], MAPVIEW.COLORS[i.cat] || '#333', 0.042);
      var c = inRing(l.at[0], l.at[1], i.ring) ? l.at : i.ring[0];
      sp.position.copy(vec(c[0], c[1], Math.min(i.top, +q('cap').value)));
      V.world.add(sp);
    });
  }
  function runways() {
    var ds = V.ds;
    ADCHART.all(ds).forEach(function (m) {
      var arp = m.arp;
      if (arp && (arp[0] < V.bb[0] || arp[0] > V.bb[2] || arp[1] < V.bb[1] || arp[1] > V.bb[3])) return;
      var fe = toM(m.ad.cur.p.fieldElevation);
      m.runways.forEach(function (rm) {
        var el = rm.ends.map(function (e) { return toM(e.elev); }).filter(function (x) { return x !== null; });
        var elev = el.length ? el.reduce(function (x, y) { return x + y; }, 0) / el.length : fe !== null ? fe : ground(rm.a[0], rm.a[1]);
        var L = AX.distNM(rm.a, rm.b) * NMM, mid = [(rm.a[0] + rm.b[0]) / 2, (rm.a[1] + rm.b[1]) / 2];
        var box = new THREE.Mesh(new THREE.BoxGeometry(rm.wM, 4, L), new THREE.MeshLambertMaterial({ color: 0x3b4148 }));
        box.position.copy(vec(mid[0], mid[1], elev)); box.position.y += 2; box.rotation.y = -rm.brg * D2R;
        V.world.add(box);
        var cl = new THREE.Mesh(new THREE.BoxGeometry(Math.max(1, rm.wM * 0.03), 4.4, L * 0.9), new THREE.MeshBasicMaterial({ color: 0xffffff }));
        cl.position.copy(box.position); cl.rotation.y = box.rotation.y; V.world.add(cl);
        // the runway keeps its true elevation above the (coarser) terrain surface
        var gnd = ground(mid[0], mid[1]) * V.ex;
        if (box.position.y < gnd + 2) { box.position.y = gnd + 3; cl.position.y = gnd + 3; }
        if (V.opts.mode !== 'area') runwayLights(rm, elev, box.position.y / V.ex);
        if (layerOn('labels') && V.opts.mode === 'area') rm.ends.forEach(function (e) { var sp = sprite([e.desig], '#0b2a4a', 0.03); sp.position.copy(vec(e.at[0], e.at[1], elev + 60)); V.world.add(sp); });
      });
      if (arp && layerOn('labels') && (V.opts.mode === 'area' || m.ad !== V.ad)) {
        var e2 = fe !== null ? fe : ground(arp[0], arp[1]);
        var sp = sprite([M.shortName(m.ad), fe !== null ? 'ELEV ' + ft(fe) + ' FT' : ''].filter(Boolean), '#0b2a4a', 0.05);
        sp.position.copy(vec(arp[0], arp[1], e2 + 400)); V.world.add(sp);
      }
    });
  }
  // edge lights and a 900 m approach light line, so the runway stands out in the crew views
  function runwayLights(rm, elev, y) {
    var pts = [], L = AX.distNM(rm.a, rm.b), half = rm.wM / 2 / NMM;
    for (var f = 0; f <= 1.0001; f += 0.02) {
      var c = AX.dest(rm.a[0], rm.a[1], rm.brg, L * f);
      [-1, 1].forEach(function (sd) { var q2 = AX.dest(c[0], c[1], rm.brg + 90 * sd, half); pts.push(vec(q2[0], q2[1], y + 3 / V.ex)); });
    }
    rm.ends.forEach(function (e) {
      var o = e.at === rm.a ? (rm.brg + 180) % 360 : rm.brg;
      for (var d = 0.03; d <= 0.49; d += 0.03) { var q3 = AX.dest(e.at[0], e.at[1], o, d); pts.push(vec(q3[0], q3[1], y + 5 / V.ex)); }
    });
    V.world.add(new THREE.Points(new THREE.BufferGeometry().setFromPoints(pts), new THREE.PointsMaterial({ color: 0xffe082, size: 3, sizeAttenuation: false })));
  }
  function obstacles() {
    var pts = [], tops = [], n = 0;
    (V.opts.obsSets && V.opts.obsSets.length ? V.opts.obsSets : [V.ds]).forEach(function (ods) { (ods.byType.VerticalStructure || []).forEach(function (o) { one(ods, o); }); });
    function one(ods, o) {
      if (n > 6000) return;
      var part = arr(o.cur.p.part)[0] || {}, loc = arr(part.horizontalProjection_location || part.horizontalProjection_surface || part.horizontalProjection_curve)[0];
      var c = M.pointOf(ods, o);
      if (!c || c[0] < V.bb[0] || c[0] > V.bb[2] || c[1] < V.bb[1] || c[1] > V.bb[3]) return;
      var top = loc ? toM(loc.elevation) : null, h = toM(part.verticalExtent), g = ground(c[0], c[1]);
      if (top === null) top = g + (h || 30);
      var base = h !== null ? Math.max(0, top - h) : g;
      pts.push(vec(c[0], c[1], base), vec(c[0], c[1], top)); tops.push(vec(c[0], c[1], top)); n++;
    }
    if (!pts.length) return;
    V.world.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xd32f2f })));
    V.world.add(new THREE.Points(new THREE.BufferGeometry().setFromPoints(tops), new THREE.PointsMaterial({ color: 0xd32f2f, size: 6, sizeAttenuation: false })));
  }
  // Annex 14 obstacle limitation surfaces of the aerodrome (ols.js) and the obstacles that penetrate them
  function olsLayer() {
    var ad = V.ad;
    if (!ad) { var c0 = [(V.bb[0] + V.bb[2]) / 2, (V.bb[1] + V.bb[3]) / 2], best = null; ADCHART.all(V.ds).forEach(function (m) { if (m.arp && m.runways.length && (!best || AX.distNM(m.arp, c0) < AX.distNM(best.arp, c0))) best = m; }); ad = best && best.ad; }
    var S = ad && OLS.surfaces(V.ds, ad);
    if (!S) return;
    var COLS = { app: 0x2e7d32, toc: 0x1565c0, tr: 0x7cb342, ih: 0xf9a825, con: 0xfb8c00 };
    function P3(p) { return vec(p[0], p[1], p[2]); }
    function mesh(pos, col, op) {
      var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
      V.world.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, side: THREE.DoubleSide, depthWrite: false })));
    }
    function outline(pts, col) { V.world.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.8 }))); }
    OLS.geometry(S).forEach(function (g) {
      var col = COLS[g.kind], pos = [];
      if (g.quads) g.quads.forEach(function (q) {
        var v = q.map(P3);
        [v[0], v[1], v[2], v[0], v[2], v[3]].forEach(function (x) { pos.push(x.x, x.y, x.z); });
        outline(v, col);
      });
      if (g.ring) { var r = g.ring.map(P3), c = r.reduce(function (a, b) { return a.add(b); }, new THREE.Vector3()).multiplyScalar(1 / r.length); for (var i = 0; i < r.length; i++) { var a = r[i], b = r[(i + 1) % r.length]; [c, a, b].forEach(function (x) { pos.push(x.x, x.y, x.z); }); } outline(r, col); }
      if (g.inner) { var I = g.inner.map(P3), O = g.outer.map(P3); for (var j = 0; j < I.length; j++) { var k = (j + 1) % I.length; [I[j], O[j], O[k], I[j], O[k], I[k]].forEach(function (x) { pos.push(x.x, x.y, x.z); }); } outline(O, col); }
      mesh(pos, col, g.kind === 'ih' || g.kind === 'con' ? 0.08 : 0.2);
    });
    var res = OLS.check(V.ds, ad, V.opts.obsSets);
    V.olsRes = res;
    (res ? res.list : []).forEach(function (p) {
      var s3 = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff1744 }));
      s3.scale.setScalar(Math.max(25, V.W / 400)); s3.position.copy(vec(p.at[0], p.at[1], p.top)); V.world.add(s3);
      if (layerOn('labels')) { var sp = sprite([p.name.length > 24 ? p.name.slice(0, 23) + '…' : p.name, '+' + p.pen.toFixed(1) + ' m · ' + p.surface], '#d32f2f', 0.036); sp.position.copy(vec(p.at[0], p.at[1], p.top + 60)); V.world.add(sp); }
    });
    q('info').innerHTML = '<b>Obstacle limitation surfaces — ' + esc(M.label(V.ds, ad)) + '</b><div class="muted" style="white-space:pre-wrap;font-size:11.5px;margin:4px 0">' + esc(OLS.describe(S)) + '</div>' +
      '<div class="v3d-sub">' + (res && res.list.length ? res.list.length + ' penetration(s)' : 'No penetration') + '</div>' +
      (res ? res.list.slice(0, 20).map(function (p) { return '<div class="v3d-col" style="border-color:#d32f2f"><b>' + esc(p.name) + '</b> +' + p.pen.toFixed(1) + ' m<br><span class="muted">' + esc(p.surface) + ' · top ' + p.top.toFixed(1) + ' m · ' + esc(p.from) + '</span></div>'; }).join('') : '') +
      '<div class="muted" style="font-size:11px;margin-top:6px">Green approach, blue take-off climb, light green transitional, yellow inner horizontal, orange conical.</div>';
  }
  // procedures of the aerodrome in 3D: published altitudes at leg ends, interpolated in between
  function procedures() {
    var ad = V.ad, ds = V.ds;
    if (!ad) return;
    var kinds = V.opts.mode === 'departure' ? ['StandardInstrumentDeparture'] : V.opts.mode === 'approach' ? ['InstrumentApproachProcedure', 'StandardInstrumentArrival'] : ['StandardInstrumentDeparture', 'StandardInstrumentArrival', 'InstrumentApproachProcedure'];
    var COL = { StandardInstrumentDeparture: 0x1565c0, StandardInstrumentArrival: 0x2e7d32, InstrumentApproachProcedure: 0x8e24aa };
    var fe = toM(ad.cur.p.fieldElevation) || 0;
    kinds.forEach(function (k) {
      (ds.byType[k] || []).forEach(function (pr) {
        if (ds.owner.get(pr) !== ad) return;
        var segs = MAPVIEW.procPaths(ds, pr);
        if (!segs.length) return;
        var pts = [], alts = [];
        segs.forEach(function (sg, i) {
          var lp = sg.leg.cur.p, a = toM(lp.lowerLimitAltitude), b = toM(lp.upperLimitAltitude), alt = a !== null ? a : b;
          sg.coords.forEach(function (c, j) { if (i && !j) return; pts.push(c); alts.push(j === sg.coords.length - 1 ? alt : null); });
        });
        if (alts[0] === null) alts[0] = k === 'StandardInstrumentDeparture' ? fe + 10.7 : null;
        if (k !== 'StandardInstrumentDeparture' && alts[alts.length - 1] === null) alts[alts.length - 1] = fe + 15;
        // interpolate unknown altitudes along the path; ends without data take the nearest known value
        var dist = [0];
        for (var i = 1; i < pts.length; i++) dist.push(dist[i - 1] + AX.distNM(pts[i - 1], pts[i]));
        var known = alts.map(function (x, i2) { return x === null ? -1 : i2; }).filter(function (x) { return x >= 0; });
        if (!known.length) return;
        for (var j = 0; j < alts.length; j++) {
          if (alts[j] !== null) continue;
          var prev = known.filter(function (x) { return x < j; }).pop(), next = known.filter(function (x) { return x > j; })[0];
          alts[j] = prev === undefined ? alts[next] : next === undefined ? (k === 'StandardInstrumentDeparture' ? alts[prev] + (dist[j] - dist[prev]) * 200 * FT : alts[prev]) : alts[prev] + (alts[next] - alts[prev]) * (dist[j] - dist[prev]) / ((dist[next] - dist[prev]) || 1);
        }
        var line = pts.map(function (c, i3) { return vec(c[0], c[1], alts[i3]); });
        V.world.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(line), new THREE.LineBasicMaterial({ color: COL[k] })));
        curtain(pts, alts, COL[k], 0.1);
        if (layerOn('labels') && V.opts.mode === 'area') { var sp = sprite([({ StandardInstrumentDeparture: 'SID ', StandardInstrumentArrival: 'STAR ', InstrumentApproachProcedure: 'IAP ' })[k] + (s(pr.cur.p.designator) || s(pr.cur.p.name))], '#' + COL[k].toString(16).padStart(6, '0'), 0.03); sp.position.copy(line[line.length - 1]); V.world.add(sp); }
      });
    });
  }
  // translucent wall from a 3D path down to the ground (profile view)
  function curtain(pts, alts, color, opacity) {
    var pos = [];
    for (var i = 1; i < pts.length; i++) {
      var a = vec(pts[i - 1][0], pts[i - 1][1], alts[i - 1]), b = vec(pts[i][0], pts[i][1], alts[i]);
      var ga = vec(pts[i - 1][0], pts[i - 1][1], ground(pts[i - 1][0], pts[i - 1][1])), gb = vec(pts[i][0], pts[i][1], ground(pts[i][0], pts[i][1]));
      [a, ga, b, b, ga, gb].forEach(function (v) { pos.push(v.x, v.y, v.z); });
    }
    var geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    V.world.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: opacity, side: THREE.DoubleSide, depthWrite: false })));
  }

  /* ---------------------------------------------------------- crew views */
  // geometry of the approach / departure for the selected runway end
  function crewGeo() {
    var e = V.end, rm = V.rw, ap = V.opts.mode === 'approach';
    var other = e.at === rm.a ? rm.b : rm.a;
    var thrEl = toM(e.elev), fe = toM(V.ad.cur.p.fieldElevation);
    if (thrEl === null) thrEl = fe !== null ? fe : ground(e.land[0], e.land[1]);
    var otherEnd = rm.ends.filter(function (x) { return x !== e; })[0];
    var derEl = otherEnd && toM(otherEnd.elev) !== null ? toM(otherEnd.elev) : thrEl;
    var gp = e.ils && parseFloat(e.ils.gp) > 1 ? parseFloat(e.ils.gp) : 3;
    return ap ? { ref: e.land, back: (e.hdg + 180) % 360, hdg: e.hdg, refEl: thrEl, ang: gp, alt: function (d) { return thrEl + 15 + d * NMM * Math.tan(gp * D2R); }, label: 'THR ' + e.desig }
      : { ref: other, back: e.hdg, hdg: e.hdg, refEl: derEl, grad: 3.3, alt: function (d) { return derEl + 10.7 + d * NMM * 0.033; }, label: 'DER ' + e.desig };
  }
  function crewPath() {
    var g = crewGeo(), pts = [], alts = [], ap = V.opts.mode === 'approach';
    for (var d = 0; d <= 15.001; d += 0.25) { pts.push(AX.dest(g.ref[0], g.ref[1], g.back, d)); alts.push(g.alt(d)); }
    var line = pts.map(function (c, i) { return vec(c[0], c[1], alts[i]); });
    V.world.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(line), new THREE.LineBasicMaterial({ color: ap ? 0xff00aa : 0x00a0ff })));
    curtain(pts, alts, ap ? 0xff00aa : 0x00a0ff, 0.14);
    for (var n = 2; n <= 14; n += 2) {
      var c = AX.dest(g.ref[0], g.ref[1], g.back, n), sp = sprite([n + ' NM', ft(g.alt(n)) + ' FT'], ap ? '#b0186e' : '#1565c0', 0.034);
      sp.position.copy(vec(c[0], c[1], g.alt(n) + 80)); V.world.add(sp);
    }
  }
  // airspaces containing a position (lon, lat, altitude m), lowest first
  function column(lon, lat, alt) {
    return V.volumes.filter(function (v) { return inRing(lon, lat, v.ring) && (alt === undefined || (alt >= v.lo.m - 1 && alt <= v.up.m + 1)); })
      .sort(function (a, b) { return a.lo.m - b.lo.m; });
  }
  function colHtml(list) {
    return list.length ? list.map(function (v) { return '<div class="v3d-col" style="border-color:' + (MAPVIEW.COLORS[v.cat] || '#555') + '"><b>' + esc(v.name) + '</b>' + (v.cls ? ' · class ' + esc(v.cls.charAt(0)) : '') + '<br><span class="mono">' + esc(v.up.txt) + ' / ' + esc(v.lo.txt) + '</span></div>'; }).join('') : '<div class="muted">no airspace in the data</div>';
  }
  function placeCamera(first) {
    var cam = V.camera;
    if (V.opts.mode === 'area') {
      V.controls.enabled = true; q('read').classList.add('hidden');
      if (first) {
        var r = Math.max(V.W, V.H);
        cam.fov = 45; cam.near = r / 2000; cam.far = r * 8; cam.updateProjectionMatrix();
        cam.position.set(0, r * 0.55, r * 0.75); V.controls.target.set(0, 0, 0); V.controls.update();
      }
      return;
    }
    V.controls.enabled = false;
    var g = crewGeo(), d = +q('dist').value, ap = V.opts.mode === 'approach';
    var p = AX.dest(g.ref[0], g.ref[1], g.back, d), alt = g.alt(d), look = ap ? AX.dest(g.ref[0], g.ref[1], g.hdg, 0.35) : AX.dest(p[0], p[1], g.hdg, 3);
    var lookAlt = ap ? g.refEl : alt + 3 * NMM * 0.02;
    cam.fov = 55; cam.near = 5; cam.far = 120000; cam.updateProjectionMatrix();
    cam.position.copy(vec(p[0], p[1], alt));
    cam.lookAt(vec(look[0], look[1], lookAlt));
    var gr = ground(p[0], p[1]), inside = column(p[0], p[1], alt);
    q('read').classList.remove('hidden');
    q('read').innerHTML = '<b>' + (ap ? 'Approach ' : 'Departure ') + esc('RWY ' + V.end.desig) + '</b> · ' + (ap ? (V.end.ils ? esc(V.end.ils.kind + ' ' + V.end.ils.ident) + ' · ' : '') + 'GP ' + g.ang.toFixed(1) + '°' : 'climb 3.3 % (200 ft/NM)') +
      '<div class="v3d-grid"><span>Distance</span><b>' + d.toFixed(1) + ' NM ' + (ap ? 'to THR' : 'from DER') + '</b><span>Altitude</span><b>' + ft(alt) + ' ft AMSL</b>' +
      '<span>' + (ap ? 'Height above THR' : 'Height above DER') + '</span><b>' + ft(alt - g.refEl) + ' ft</b><span>Terrain below</span><b>' + ft(gr) + ' ft</b>' +
      '<span>Terrain clearance</span><b class="' + (alt - gr < 1000 * FT ? 'v3d-warn' : '') + '">' + ft(alt - gr) + ' ft</b><span>Track</span><b>' + Math.round(g.hdg) + '°T</b></div>' +
      '<div class="v3d-sub">Airspace at this position</div>' + colHtml(inside);
    q('sltxt').textContent = d.toFixed(1) + ' NM';
  }
  function foot() {
    q('foot').textContent = 'Terrain: ' + V.terrainSrc + ' · vertical ×' + V.ex + (V.capped ? ' · area limited to 6° × 4.5° around the map centre' : '') +
      ' · drag to rotate, right-drag to pan, wheel to zoom · NOT FOR OPERATIONAL USE';
  }

  /* ------------------------------------------------------------- events */
  function onMove(ev) {
    if (V.opts.mode !== 'area' || !V.ground) return;
    var r = V.renderer.domElement.getBoundingClientRect(), m = new THREE.Vector2((ev.clientX - r.left) / r.width * 2 - 1, -(ev.clientY - r.top) / r.height * 2 + 1);
    V.ray.setFromCamera(m, V.camera);
    var hit = V.ray.intersectObject(V.ground)[0];
    if (!hit) return;
    var lon = V.P.lon(hit.point.x), lat = V.P.lat(hit.point.z), gr = ground(lon, lat);
    q('info').innerHTML = '<b>' + esc(AX.fmtPos([lon, lat], 0)) + '</b><br>Terrain ' + ft(gr) + ' ft (' + Math.round(gr) + ' m) · grid MORA ' + TERRAIN.mora(lon, lat).toLocaleString('en-US') + ' ft' +
      '<div class="v3d-sub">Airspace column at this point</div>' + colHtml(column(lon, lat));
  }
  function onClick(ev) {
    if (V.opts.mode !== 'area') return;
    var r = V.renderer.domElement.getBoundingClientRect(), m = new THREE.Vector2((ev.clientX - r.left) / r.width * 2 - 1, -(ev.clientY - r.top) / r.height * 2 + 1);
    V.ray.setFromCamera(m, V.camera);
    var hit = V.ray.intersectObjects(V.pick)[0];
    if (hit && hit.object.userData.as && V.hooks && V.hooks.openAip && ev.detail === 2) V.hooks.openAip(V.ds, hit.object.userData.as.rec);
  }
  function fillAd() {
    var list = ADCHART.all(V.ds).filter(function (m) { return m.runways.length; }).sort(function (a, b) { return M.shortName(a.ad).localeCompare(M.shortName(b.ad)); });
    q('ad').innerHTML = '<option value="">Aerodrome…</option>' + list.map(function (m) { return '<option value="' + V.ds.recs.indexOf(m.ad) + '">' + esc(M.shortName(m.ad) + ' ' + (s(m.ad.cur.p.name) || '')) + '</option>'; }).join('');
    if (!V.ad && list.length && V.opts.mode !== 'area') V.ad = list[0].ad;
    q('ad').value = V.ad ? String(V.ds.recs.indexOf(V.ad)) : '';
    fillEnd();
  }
  function fillEnd() {
    var m = V.ad ? ADCHART.of(V.ds, V.ad) : null, ends = [];
    (m ? m.runways : []).forEach(function (rm) { rm.ends.forEach(function (e) { ends.push({ rm: rm, e: e }); }); });
    q('end').innerHTML = ends.map(function (x, i) { return '<option value="' + i + '">RWY ' + esc(x.e.desig) + (x.e.ils ? ' · ' + esc(x.e.ils.kind) : '') + '</option>'; }).join('');
    var pick = ends.filter(function (x) { return V.opts.end ? x.e.desig === V.opts.end : !!x.e.ils; })[0] || ends[0];
    V.ends = ends; V.rw = pick ? pick.rm : null; V.end = pick ? pick.e : null;
    if (pick) q('end').value = String(ends.indexOf(pick));
    var crew = V.opts.mode !== 'area';
    q('end').style.display = crew ? '' : 'none'; q('slwrap').style.display = crew ? '' : 'none'; q('play').style.display = crew ? '' : 'none';
  }
  function fly() {
    if (V.flying) { clearInterval(V.flying); V.flying = null; q('play').textContent = '▶ Fly'; return; }
    var ap = V.opts.mode === 'approach', sl = q('dist');
    sl.value = ap ? 15 : 0;
    q('play').textContent = '■ Stop';
    V.flying = setInterval(function () {
      var v = +sl.value + (ap ? -0.05 : 0.05);
      if (ap ? v <= 0 : v >= 15) { v = ap ? 0 : 15; clearInterval(V.flying); V.flying = null; q('play').textContent = '▶ Fly'; }
      sl.value = v; placeCamera();
    }, 40);
  }

  /* --------------------------------------------------------------- open */
  // host: element to cover (the map); opts {mode: 'area'|'approach'|'departure', bbox: [w,s,e,n], ad, end}
  function open(host, ds, hooks, opts) {
    close();
    if (typeof THREE === 'undefined') { hooks.toast('The 3D library is not available.'); return false; }
    var el = ui(host), renderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); }
    catch (e) { el.remove(); hooks.toast('The 3D view needs WebGL (graphics acceleration). Enable it in the browser settings.', 7000); return false; }
    V = { el: el, ds: ds, hooks: hooks, opts: Object.assign({ mode: 'area' }, opts), ad: opts.ad || null, gen: 0, renderer: renderer, ray: new THREE.Raycaster() };
    var gl = el.querySelector('.v3d-gl');
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    gl.appendChild(renderer.domElement);
    V.scene = new THREE.Scene();
    V.scene.background = new THREE.Color(0xbfd9ee);
    V.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8070, 0.75));
    var sun = new THREE.DirectionalLight(0xffffff, 0.75); sun.position.set(-1, 1.2, -0.6); V.scene.add(sun);
    V.camera = new THREE.PerspectiveCamera(45, 1, 10, 1e7);
    V.controls = new THREE.OrbitControls(V.camera, renderer.domElement);
    V.controls.maxPolarAngle = Math.PI * 0.495; V.controls.screenSpacePanning = false;
    function size() { var w = gl.clientWidth || 800, h = gl.clientHeight || 600; renderer.setSize(w, h); V.camera.aspect = w / h; V.camera.updateProjectionMatrix(); }
    size();
    V.ro = new ResizeObserver(size); V.ro.observe(gl);
    q('mode').value = V.opts.mode;
    if (V.opts.ols) { el.querySelector('[data-l="ols"]').checked = true; el.querySelector('[data-l="airspace"]').checked = false; } // surfaces in front
    fillAd();
    el.addEventListener('change', function (e) {
      var k = e.target.getAttribute('data-3');
      if (k === 'mode') { V.opts.mode = e.target.value; if (V.opts.mode !== 'area' && !V.ad) fillAd(); else fillEnd(); q('dist').value = V.opts.mode === 'approach' ? 8 : 2; build(); }
      else if (k === 'ad') { V.ad = e.target.value === '' ? null : V.ds.recs[+e.target.value]; V.opts.end = null; fillEnd(); build(); }
      else if (k === 'end') { var x = V.ends[+e.target.value]; if (x) { V.rw = x.rm; V.end = x.e; V.opts.end = x.e.desig; } build(); }
      else if (k === 'ex' || k === 'cap' || e.target.hasAttribute('data-l')) build();
    });
    q('dist').addEventListener('input', function () { placeCamera(); });
    q('play').addEventListener('click', fly);
    q('close').addEventListener('click', close);
    renderer.domElement.addEventListener('pointermove', onMove);
    renderer.domElement.addEventListener('click', onClick);
    q('dist').value = V.opts.mode === 'approach' ? 8 : 2;
    if (V.opts.mode !== 'area' && !V.rw) { hooks.toast('No runway with positions for this aerodrome: showing the area view.'); V.opts.mode = 'area'; q('mode').value = 'area'; fillEnd(); }
    build();
    (function loop() { if (!V) return; V.raf = requestAnimationFrame(loop); if (V.controls.enabled) V.controls.update(); renderer.render(V.scene, V.camera); })();
    return true;
  }
  function close() {
    if (!V) return;
    var v = V; V = null;
    cancelAnimationFrame(v.raf); if (v.flying) clearInterval(v.flying); if (v.ro) v.ro.disconnect();
    var cur = V; V = v; clearScene(); V = cur;
    v.controls.dispose(); v.renderer.dispose(); v.el.remove();
  }
  return { open: open, close: close, isOpen: function () { return !!V; }, state: function () { return V; } };
})();
