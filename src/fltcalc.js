/*!
 * AIXM Code Converter
 * Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com> - author of the AIXM Code Converter
 * SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE; keep this notice in all copies)
 * ==========================================================================
 * AIXM Code Converter - flight and obstacle assessment, the calculations (FLTCALC)
 * NOT FOR NAVIGATION OR AIRCRAFT PERFORMANCE - indicative study figures; the aircraft flight manual, the operator's
 * performance data and the State's published procedures remain the reference.
 * Pure functions (no page, no data model) used by the Flight & obstacle analysis section (fltview.js):
 *   take-off     ICAO Annex 4 (Aerodrome Obstacle Chart Type A) take-off flight path area: 180 m wide at the end of
 *                the take-off distance available, widening 0.25 D to 1 800 m, 10 km (12 km with a 1.0 % surface),
 *                obstacles above the 1.2 % surface, the shadow rule (horizontal for the first 300 m, then 1.2 %);
 *                one-engine-inoperative net flight path (Annex 6 Part I Attachment C / operator practice): 35 ft
 *                screen height, 35 ft margin, lateral 90 m + 0.125 D (or ½ wing span + 60 m) up to 300 / 600 / 900 m:
 *                net gradient each obstacle requires, the clearance of the gradient available, the limiting obstacle;
 *                PANS-OPS departure (Doc 8168 Vol II): 2.5 % obstacle identification surface from 5 m above the
 *                DER, area 150 m each side splaying 15°, the procedure design gradient an obstacle needs (MOC 0.8 %
 *                of the distance), close-in obstacles; straight out or along a published SID path
 *   approach     Annex 14 approach surface (inner edge, divergence, sections 1, 2 and horizontal by code and
 *                approach type), the height of each obstacle above the threshold, its elevation angle, the
 *                clearance below the glide path (angle and threshold crossing height), the visual segment surface
 *                (PANS-OPS: from 60 m before the threshold, ±75 m, splay 15 %, slope glide path - 1.12°, indicative),
 *                the threshold displacement / landing distance reduction an obstacle would need
 *   runway       the departure and arrival results of each runway direction together, with the TORA / TODA
 *                reduction (take-off climb surface) and LDA reduction (approach surface) an obstacle implies
 *   route        a flight plan route (points with altitudes): obstacles and terrain in the corridor of each leg,
 *                the minimum safe altitude (highest + 1 000 / 2 000 ft, rounded up to 100 ft), the airspace crossed
 *                (entry / exit along the route, vertical overlap, active or not)
 *   eTOD areas   the electronic terrain and obstacle data areas of ICAO Annex 15 / PANS-AIM (Doc 10066) around an
 *                aerodrome: Area 2a (runway strip plus clearway, collection surface 3 m above the runway), 2b (from the
 *                ends of 2a, 10 km, splay 15 %, 1.2 % surface), 2c (within 10 km of 2a, 1.2 % surface), 2d (to 45 km
 *                from the ARP or the TMA boundary, 100 m above ground), Area 3 (90 m from the runway centre line, 50 m
 *                from the other movement area, 0.5 m), Area 4 (CAT II / III: 900 m before the threshold, ±60 m), Area 1
 *                (the State, 100 m above ground); each obstacle: its area, the collection surface over it, whether it
 *                has to be in the data set, the accuracy the area requires (PANS-AIM Appendix 1 Table A1-6)
 *   measure      the 3D vector between two points: ground distance, bearing, height difference, slant range, angle,
 *                gradient
 * Lengths in metres, angles in degrees, gradients as ratios (0.025 = 2.5 %).
 * ========================================================================== */
var FLTCALC = (function () {
  'use strict';
  var FT = 0.3048, NMM = 1852, D2R = Math.PI / 180, RE = 6371008.8, FTNM = NMM / FT; // feet per NM

  /* --------------------------------------------------------------- geometry */
  function distM(a, b) {
    var la1 = a[1] * D2R, la2 = b[1] * D2R, h = Math.pow(Math.sin((la2 - la1) / 2), 2) + Math.cos(la1) * Math.cos(la2) * Math.pow(Math.sin((b[0] - a[0]) * D2R / 2), 2);
    return 2 * RE * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  function bearing(a, b) {
    var la1 = a[1] * D2R, la2 = b[1] * D2R, dl = (b[0] - a[0]) * D2R;
    return (Math.atan2(Math.sin(dl) * Math.cos(la2), Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dl)) / D2R + 360) % 360;
  }
  function dest(c, brg, m) {
    var d = m / RE, b = brg * D2R, la = c[1] * D2R, lo = c[0] * D2R;
    var la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(b));
    var lo2 = lo + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2));
    return [((lo2 / D2R + 540) % 360) - 180, la2 / D2R];
  }
  // a local east / north frame in metres around o (good to a few cm over 20 km)
  function frame(o) {
    var k = Math.cos(o[1] * D2R), m = RE * D2R;
    return { o: o, xy: function (c) { return [(c[0] - o[0]) * k * m, (c[1] - o[1]) * m]; }, ll: function (x, y) { return [o[0] + x / (k * m), o[1] + y / m]; } };
  }
  // a path (lon/lat points) in the frame, with the distance along it at each vertex
  function pathOf(F, pts) {
    var xy = pts.map(F.xy), s = [0];
    for (var i = 1; i < xy.length; i++) s.push(s[i - 1] + Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]));
    return { xy: xy, s: s, len: s[s.length - 1] };
  }
  // point -> {s: distance along the path, x: offset (+ right of the direction of flight), d: distance to the path}; beyond the end the last leg is extended
  function project(P, q) {
    var best = null;
    for (var i = 1; i < P.xy.length; i++) {
      var a = P.xy[i - 1], b = P.xy[i], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
      if (!L2) continue;
      var t = ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L2, L = Math.sqrt(L2);
      var tc = i === 1 && t < 0 ? t : i === P.xy.length - 1 && t > 1 ? t : Math.max(0, Math.min(1, t));
      var px = a[0] + tc * dx, py = a[1] + tc * dy, d = Math.hypot(q[0] - px, q[1] - py);
      var side = (dx * (q[1] - a[1]) - dy * (q[0] - a[0])) < 0 ? 1 : -1; // right of the direction of flight: +
      if (!best || d < best.d) best = { s: P.s[i - 1] + tc * L, x: side * d, d: d, leg: i - 1 };
    }
    return best;
  }
  // the point at distance s along the path, offset x to the right
  function along(P, F, s, x) {
    var i = 1; while (i < P.s.length - 1 && P.s[i] < s) i++;
    var a = P.xy[i - 1], b = P.xy[i], L = (P.s[i] - P.s[i - 1]) || 1, t = (s - P.s[i - 1]) / L, ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
    return F.ll(a[0] + ux * t * L + uy * (x || 0), a[1] + uy * t * L - ux * (x || 0));
  }
  function inRing(c, ring) {
    var ins = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if (((yi > c[1]) !== (yj > c[1])) && (c[0] < (xj - xi) * (c[1] - yi) / (yj - yi) + xi)) ins = !ins;
    }
    return ins;
  }
  function circlePts(c, rM, n) { var out = []; n = n || 72; for (var i = 0; i <= n; i++) out.push(dest(c, i * 360 / n, rM)); return out; }
  function arcPts(c, rM, b0, b1, n) { var out = [], sw = ((b1 - b0) + 360) % 360 || 360; n = n || Math.max(8, Math.ceil(sw / 4)); for (var i = 0; i <= n; i++) out.push(dest(c, b0 + sw * i / n, rM)); return out; }
  // a band along the path, half width w(s) on each side, as a closed ring (lon/lat)
  function corridor(P, F, len, half, step) {
    step = step || 100;
    var L = len, right = [], left = [];
    for (var s = 0; s <= L + 1e-6; s += step) { var w = half(s); right.push(along(P, F, s, w)); left.push(along(P, F, s, -w)); if (s + step > L && s < L) s = L - step; }
    return right.concat(left.reverse(), [right[0]]);
  }

  /* --------------------------------------------------------------- take-off */
  var TO_DEFAULT = {
    len: 10000,               // Annex 4 Type A: 10 km (12 km when the surface slope is 1.0 %)
    ois: 0.012,               // Annex 4 Type A obstacle identification surface
    a4: { base: 90, splay: 0.125, max: 900 },      // Type A area: 180 m wide, + 0.25 D, up to 1 800 m
    a6: { base: 90, splay: 0.125, max: 600 },      // net flight path lateral margin (90 m + 0.125 D; 300 / 600 / 900 m)
    po: { base: 150, splay: Math.tan(15 * D2R), ois: 0.025, der: 5, moc: 0.008, pdg: 0.033 }, // PANS-OPS departure
    screen: 35 * FT, margin: 35 * FT, net: 0.016, gross: 0.024, closeIn: 60
  };
  function merge(a, b) { var o = {}; for (var k in a) o[k] = a[k] && typeof a[k] === 'object' && !Array.isArray(a[k]) ? merge(a[k], (b && b[k]) || {}) : b && b[k] !== undefined ? b[k] : a[k]; for (var j in b || {}) if (o[j] === undefined) o[j] = b[j]; return o; }
  function halfA4(o, s) { return Math.min(o.a4.base + o.a4.splay * s, o.a4.max); }
  function halfA6(o, s) { return Math.min(o.a6.base + o.a6.splay * s, o.a6.max); }
  function halfPO(o, s) { return o.po.base + o.po.splay * s; }
  // opts: {origin [lon, lat] (end of TODA / DER), elev (m), track (°T) or path [[lon, lat]…] (a SID), and TO_DEFAULT overrides}
  // obstacles: [{id, name, type, c, elev (top, m AMSL), hgt, src, ref, terrain}] -> the assessment
  function takeoff(obstacles, opts) {
    var o = merge(TO_DEFAULT, opts), F = frame(o.origin);
    var pts = o.path && o.path.length > 1 ? [o.origin].concat(o.path.filter(function (p, i) { return i > 0 || distM(p, o.origin) > 1; })) : [o.origin, dest(o.origin, o.track, Math.max(o.len, 15000))];
    var P = pathOf(F, pts), len = o.len, rows = [];
    obstacles.forEach(function (ob) {
      if (!ob || !ob.c || ob.elev === null || ob.elev === undefined || isNaN(ob.elev)) return;
      var pr = project(P, F.xy(ob.c));
      if (!pr || pr.s <= 0.5 || pr.s > Math.max(len, 15000)) return;
      var s = pr.s, x = pr.x, ax = Math.abs(x), h = ob.elev - o.elev;
      var inA4 = s <= len && ax <= halfA4(o, s), inA6 = s <= len && ax <= halfA6(o, s), inPO = ax <= halfPO(o, s);
      if (!inA4 && !inA6 && !inPO) return;
      var oisH = o.ois * s, req = (h + o.margin - o.screen) / s, net = o.screen + o.net * s - h, gross = o.screen + o.gross * s - h;
      var poH = o.po.der + o.po.ois * s, poPen = h - poH;
      rows.push({ ob: ob, s: s, x: x, side: x >= 0 ? 'R' : 'L', h: h, inA4: inA4, inA6: inA6, inPO: inPO,
        oisH: oisH, pen: h - oisH, req: req, netClr: net, grossClr: gross, netOk: !inA6 || net >= o.margin,
        poPen: poPen, pdg: inPO && poPen > 0 ? Math.max(o.po.pdg, (h - o.po.der) / s + o.po.moc) : null, closeIn: inPO && poPen > 0 && h <= o.closeIn, shadow: false, charted: false });
    });
    rows.sort(function (a, b) { return a.s - b.s; });
    // Annex 4 shadow rule over the obstacles above the 1.2 % surface in the Type A area
    var ctl = null;
    rows.forEach(function (r) {
      if (!r.inA4 || r.pen <= 0) return;
      var sh = ctl ? ctl.h + o.ois * Math.max(0, r.s - Math.max(ctl.s, 300)) : -Infinity;
      if (ctl && r.h <= sh) { r.shadow = true; r.shadowBy = ctl; return; }
      r.charted = true; ctl = r;
    });
    var perf = rows.filter(function (r) { return r.inA6; }), crit = perf.reduce(function (a, r) { return !a || r.req > a.req ? r : a; }, null);
    var poRows = rows.filter(function (r) { return r.pdg !== null && !r.closeIn; }), pdgCrit = poRows.reduce(function (a, r) { return !a || r.pdg > a.pdg ? r : a; }, null);
    var minNet = perf.reduce(function (a, r) { return !a || r.netClr < a.netClr ? r : a; }, null);
    return { opts: o, frame: F, path: P, rows: rows, critical: crit, minNet: minNet, pdg: pdgCrit, charted: rows.filter(function (r) { return r.charted; }),
      closeIn: rows.filter(function (r) { return r.closeIn; }), netOk: perf.every(function (r) { return r.netOk; }),
      reqNet: crit ? Math.max(0, crit.req) : 0,
      area: { a4: corridor(P, F, len, function (s) { return halfA4(o, s); }), a6: corridor(P, F, len, function (s) { return halfA6(o, s); }), po: corridor(P, F, Math.min(len, 15000), function (s) { return halfPO(o, s); }, 250) },
      centre: [0, len].map(function (s) { return along(P, F, s, 0); }) };
  }

  /* --------------------------------------------------------------- approach */
  // Annex 14 approach surface of a runway end: {ie (inner edge length), d (from the threshold), div, l1, s1, l2, s2, lh}
  function appAllowed(A, s) { // height above the threshold allowed at distance s before the threshold (null: beyond the surface)
    var t = s - A.d;
    if (t < 0) return null;
    if (t <= A.l1) return t * A.s1;
    var h1 = A.l1 * A.s1;
    if (!A.l2) return null;
    if (t <= A.l1 + A.l2) return Math.min(150, h1 + (t - A.l1) * A.s2);
    if (A.lh && t <= A.l1 + A.l2 + A.lh) return Math.min(150, h1 + A.l2 * A.s2);
    return null;
  }
  function appHalf(A, s) { return A.ie / 2 + A.div * Math.max(0, s - A.d); }
  function appLen(A) { return A.d + A.l1 + (A.l2 || 0) + (A.lh || 0); }
  // opts: {thr [lon, lat], elev (threshold, m), course (landing direction, °T), gpa (°), tch (m), app (Annex 14 surface), len}
  function approach(obstacles, opts) {
    var o = merge({ gpa: 3, tch: 15, vssOff: 1.12, vss: { d: 60, half: 75, splay: 0.15, len: 8000 }, app: { ie: 280, d: 60, div: 0.15, l1: 3000, s1: 0.02, l2: 3600, s2: 0.025, lh: 8400 } }, opts);
    var F = frame(o.thr), out = dest(o.thr, (o.course + 180) % 360, 20000), P = pathOf(F, [o.thr, out]), A = o.app, L = o.len || appLen(A), rows = [];
    var tg = Math.tan(o.gpa * D2R), tv = Math.tan(Math.max(0.5, o.gpa - o.vssOff) * D2R);
    obstacles.forEach(function (ob) {
      if (!ob || !ob.c || ob.elev === null || ob.elev === undefined || isNaN(ob.elev)) return;
      var pr = project(P, F.xy(ob.c));
      if (!pr || pr.s < 0 || pr.s > L) return;
      var s = pr.s, x = -pr.x, ax = Math.abs(x), h = ob.elev - o.elev; // x: + right of the landing direction
      var inApp = s >= A.d && ax <= appHalf(A, s), inVss = s >= o.vss.d && s <= o.vss.len && ax <= o.vss.half + o.vss.splay * (s - o.vss.d);
      if (!inApp && !inVss && !(ax <= 300 && s <= 2000)) return;
      var allowed = inApp ? appAllowed(A, s) : null, pen = allowed !== null ? h - allowed : null, gp = o.tch + s * tg, vssH = inVss ? (s - o.vss.d) * tv : null;
      var slope = allowed === null ? null : s - A.d <= A.l1 ? A.s1 : A.s2;
      rows.push({ ob: ob, s: s, x: x, side: x >= 0 ? 'R' : 'L', h: h, inApp: inApp, inVss: inVss, allowed: allowed, pen: pen, gpClr: gp - h, gpH: gp,
        angle: Math.atan2(h, Math.max(1, s)) / D2R, vssPen: vssH !== null ? h - vssH : null,
        displace: pen !== null && pen > 0 && slope ? pen / slope : 0 });
    });
    rows.sort(function (a, b) { return a.s - b.s; });
    var pens = rows.filter(function (r) { return r.pen !== null && r.pen > 0; }), worst = pens.reduce(function (a, r) { return !a || r.displace > a.displace ? r : a; }, null);
    var minGp = rows.filter(function (r) { return r.inApp || r.inVss; }).reduce(function (a, r) { return !a || r.gpClr < a.gpClr ? r : a; }, null);
    var vssPens = rows.filter(function (r) { return r.vssPen !== null && r.vssPen > 0; });
    return { opts: o, frame: F, path: P, rows: rows, penetrations: pens, worst: worst, minGp: minGp, vss: vssPens, displace: worst ? worst.displace : 0,
      area: { app: corridor(P, F, L, function (s) { return s < A.d ? A.ie / 2 : appHalf(A, s); }, 200), vss: corridor(P, F, o.vss.len, function (s) { return s < o.vss.d ? o.vss.half : o.vss.half + o.vss.splay * (s - o.vss.d); }, 200) },
      centre: [0, L].map(function (s) { return along(P, F, s, 0); }) };
  }

  /* --------------------------------------------------------------- runway impact */
  // the take-off climb surface (Annex 14) penetration of the obstacles of a take-off result -> TORA / TODA reduction
  function climbSurfaceCut(to, slope, start) {
    slope = slope || 0.02; start = start || 60;
    var worst = null;
    to.rows.forEach(function (r) {
      if (r.s < start) return;
      var allowed = (r.s - start) * slope, pen = r.h - allowed;
      if (pen > 0 && Math.abs(r.x) <= 90 + 0.125 * (r.s - start) && (!worst || pen / slope > worst.cut)) worst = { row: r, pen: pen, cut: pen / slope };
    });
    return worst;
  }
  // the verdict of a take-off result in plain words
  function verdictTO(to) {
    var o = to.opts, c = to.critical;
    if (!to.rows.length) return { sev: 'ok', txt: 'No obstacle in the take-off areas (the data loaded).' };
    if (!c) return { sev: 'ok', txt: 'No obstacle in the net flight path area.' };
    if (c.req <= 0) return { sev: 'ok', txt: 'Every obstacle is below the 35 ft screen height plane: no gradient needed.' };
    var ok = to.netOk;
    return { sev: ok ? (c.req > o.net * 0.85 ? 'caution' : 'ok') : 'error',
      txt: (ok ? 'Clear: ' : 'NOT CLEAR: ') + 'the limiting obstacle needs a net gradient of ' + pct(c.req) + ' (' + Math.round(c.req * FTNM) + ' ft/NM); available ' + pct(o.net) + '.' };
  }
  function verdictAPP(ap) {
    if (!ap.rows.length) return { sev: 'ok', txt: 'No obstacle in the approach area (the data loaded).' };
    if (ap.worst) return { sev: 'error', txt: ap.penetrations.length + ' obstacle(s) above the approach surface; the worst would need the threshold displaced by about ' + Math.round(ap.worst.displace) + ' m.' };
    if (ap.vss.length) return { sev: 'warning', txt: ap.vss.length + ' obstacle(s) above the visual segment surface (indicative).' };
    if (ap.minGp && ap.minGp.gpClr < 30) return { sev: 'caution', txt: 'Lowest clearance below the glide path ' + Math.round(ap.minGp.gpClr) + ' m.' };
    return { sev: 'ok', txt: 'Clear of the approach surface and the visual segment surface.' };
  }

  /* --------------------------------------------------------------- route */
  // spherical along / across track of c from leg a -> b (m)
  function legPos(a, b, c) {
    var d13 = distM(a, c) / RE, t13 = bearing(a, c) * D2R, t12 = bearing(a, b) * D2R;
    var xt = Math.asin(Math.max(-1, Math.min(1, Math.sin(d13) * Math.sin(t13 - t12))));
    var at = Math.acos(Math.max(-1, Math.min(1, Math.cos(d13) / Math.cos(xt)))) * (Math.cos(t13 - t12) < 0 ? -1 : 1);
    return { at: at * RE, xt: xt * RE };
  }
  // route [{c, name, alt (m)}], obstacles, opts {half (NM), clr (m), terrain: [max terrain per leg {h, c}]} -> legs
  function route(pts, obstacles, opts) {
    opts = opts || {};
    var half = (opts.half || 5) * NMM, clr = opts.clr || 1000 * FT, legs = [], s0 = 0;
    for (var i = 1; i < pts.length; i++) {
      var a = pts[i - 1], b = pts[i], L = distM(a.c, b.c), hi = null, near = [];
      obstacles.forEach(function (ob) {
        if (!ob || !ob.c || ob.elev === null || ob.elev === undefined) return;
        var q = legPos(a.c, b.c, ob.c);
        if (q.at < 0 || q.at > L || Math.abs(q.xt) > half) return;
        var e = { ob: ob, s: s0 + q.at, x: q.xt, leg: i - 1 };
        near.push(e);
        if (!hi || ob.elev > hi.ob.elev) hi = e;
      });
      var ter = opts.terrain && opts.terrain[i - 1], top = Math.max(hi ? hi.ob.elev : -Infinity, ter && ter.h !== null && ter.h !== undefined ? ter.h : -Infinity);
      var msa = isFinite(top) ? Math.ceil((top + clr) / FT / 100) * 100 * FT : null;
      var alt = a.alt !== undefined && a.alt !== null && b.alt !== undefined && b.alt !== null ? Math.min(a.alt, b.alt) : a.alt !== undefined && a.alt !== null ? a.alt : b.alt !== undefined ? b.alt : opts.alt;
      legs.push({ i: i - 1, a: a, b: b, len: L, s0: s0, trk: bearing(a.c, b.c), hi: hi, terrain: ter || null, top: isFinite(top) ? top : null, msa: msa, alt: alt === undefined ? null : alt,
        ok: msa === null || alt === null || alt === undefined || alt >= msa, obstacles: near.sort(function (x, y) { return x.s - y.s; }) });
      s0 += L;
    }
    return { legs: legs, len: s0, half: half, clr: clr };
  }
  // the altitude of the route at distance s (linear between the points with an altitude)
  function altAt(pts, s, dflt) {
    var acc = 0, prev = null;
    for (var i = 0; i < pts.length; i++) {
      if (i) acc += distM(pts[i - 1].c, pts[i].c);
      var a = pts[i].alt;
      if (a === undefined || a === null) continue;
      if (acc >= s) { if (!prev) return a; return prev.a + (a - prev.a) * (s - prev.s) / Math.max(1, acc - prev.s); }
      prev = { s: acc, a: a };
    }
    return prev ? prev.a : dflt;
  }
  // the airspace crossed: areas [{id, name, type, ring, lo (m), up (m), state}] -> [{area, sIn, sOut, altIn, altOut, vertical, inside}]
  function crossings(pts, areas, opts) {
    opts = opts || {};
    var out = [], acc = 0, segs = [];
    for (var i = 1; i < pts.length; i++) { var L = distM(pts[i - 1].c, pts[i].c); segs.push({ a: pts[i - 1].c, b: pts[i].c, s0: acc, len: L }); acc += L; }
    areas.forEach(function (ar) {
      if (!ar.ring || ar.ring.length < 4) return;
      var spans = [];
      segs.forEach(function (sg) {
        // sample the leg (every 1 km, at least 40 steps) against the area: the entries and exits along the route
        var n = Math.max(40, Math.ceil(sg.len / 1000)), was = null, start = null;
        for (var k = 0; k <= n; k++) {
          var t = k / n, c = [sg.a[0] + (sg.b[0] - sg.a[0]) * t, sg.a[1] + (sg.b[1] - sg.a[1]) * t], ins = inRing(c, ar.ring), s = sg.s0 + sg.len * t;
          if (ins && !was) start = s;
          if (!ins && was) spans.push([start, s]);
          was = ins;
        }
        if (was) spans.push([start, sg.s0 + sg.len]);
      });
      // join the spans that touch at a route point
      var joined = [];
      spans.forEach(function (sp) { var l = joined[joined.length - 1]; if (l && sp[0] - l[1] < 50) l[1] = sp[1]; else joined.push(sp.slice()); });
      joined.forEach(function (sp) {
        var aIn = altAt(pts, sp[0], opts.alt), aOut = altAt(pts, sp[1], opts.alt), lo = ar.lo === undefined || ar.lo === null ? 0 : ar.lo, up = ar.up === undefined || ar.up === null ? Infinity : ar.up;
        var mn = Math.min(aIn, aOut), mx = Math.max(aIn, aOut), vert = aIn === undefined || aIn === null ? 'unknown' : mx < lo ? 'below' : mn > up ? 'above' : 'inside';
        out.push({ area: ar, sIn: sp[0], sOut: sp[1], altIn: aIn, altOut: aOut, vertical: vert, hit: vert === 'inside' || vert === 'unknown' });
      });
    });
    return out.sort(function (a, b) { return a.sIn - b.sIn; });
  }
  // severity of a crossing: prohibited inside -> error; restricted / temporary active inside -> error; danger / other active inside -> warning
  function crossSev(x) {
    if (!x.hit) return 'info';
    var t = String(x.area.type || ''), st = x.area.state || 'on';
    if (t === 'P') return 'error';
    if (st === 'off' || st === 'none' || st === 'ended' || st === 'future') return 'info';
    if (/^(R|TRA|TSA|ADIZ|R_AMC|TFR)$/.test(t)) return st === 'maybe' ? 'warning' : 'error';
    return st === 'maybe' ? 'caution' : 'warning';
  }

  /* --------------------------------------------------------------- eTOD areas (Annex 15 / PANS-AIM) */
  var ETOD = { // accuracy required (m, 90 %), PANS-AIM Appendix 1 Table A1-6
    '1': { h: 50, v: 30, name: 'Area 1', what: 'the territory of the State', surf: '100 m above the ground' },
    '2a': { h: 5, v: 3, name: 'Area 2a', what: 'the runway strip and any clearway', surf: '3 m above the runway' },
    '2b': { h: 5, v: 3, name: 'Area 2b', what: 'from the ends of Area 2a in the direction of departure, 10 km, splay 15 %', surf: '1.2 % from the runway end' },
    '2c': { h: 5, v: 3, name: 'Area 2c', what: 'outside 2a and 2b, within 10 km of Area 2a', surf: '1.2 % from the edge of Area 2a' },
    '2d': { h: 5, v: 3, name: 'Area 2d', what: 'outside 2a, 2b and 2c, to 45 km from the ARP or the TMA boundary', surf: '100 m above the ground' },
    '3': { h: 0.5, v: 0.5, name: 'Area 3', what: '90 m from the runway centre line and 50 m from the rest of the movement area', surf: '0.5 m above the movement area' },
    '4': { h: 2.5, v: 1, name: 'Area 4', what: 'CAT II / III runways: 900 m before the threshold, 60 m each side', surf: 'terrain (radio altimeter area)' }
  };
  // runways: [{name, a, b ([lon, lat] of the two ends), elA, elB (m), strip (half width, m), ext (strip beyond the end, 60 m),
  //   cwyA, cwyB (clearway beyond end a / b, m), precA, precB (CAT II / III approach landing at a / b)}]
  // opts: {arp [lon, lat], tma (ring) , move: [rings of taxiways / aprons]} -> areas and a classifier
  function etod(runways, opts) {
    opts = opts || {};
    var arp = opts.arp || (runways[0] ? [(runways[0].a[0] + runways[0].b[0]) / 2, (runways[0].a[1] + runways[0].b[1]) / 2] : null);
    if (!arp) return null;
    var F = frame(arp), R = runways.map(function (r) {
      var A = F.xy(r.a), B = F.xy(r.b), L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1, u = [(B[0] - A[0]) / L, (B[1] - A[1]) / L];
      var ext = r.ext === undefined ? 60 : r.ext, ea = Math.max(ext, r.cwyA || 0), eb = Math.max(ext, r.cwyB || 0), w = r.strip || 150;
      return { r: r, A: A, B: B, L: L, u: u, n: [-u[1], u[0]], w: w, ea: ea, eb: eb, elA: r.elA || 0, elB: r.elB === undefined ? r.elA || 0 : r.elB };
    });
    function loc(q, k) { var dx = q[0] - k.A[0], dy = q[1] - k.A[1]; return { t: dx * k.u[0] + dy * k.u[1], c: dx * k.n[0] + dy * k.n[1] }; }
    function rect(k, t0, t1, c0, c1) { return [[t0, c0], [t1, c0], [t1, c1], [t0, c1], [t0, c0]].map(function (p) { return F.ll(k.A[0] + k.u[0] * p[0] + k.n[0] * p[1], k.A[1] + k.u[1] * p[0] + k.n[1] * p[1]); }); }
    // distance from a point to the rectangle of Area 2a of runway k (0 inside), and the runway elevation there
    function to2a(q, k) {
      var p = loc(q, k), dt = p.t < -k.ea ? -k.ea - p.t : p.t > k.L + k.eb ? p.t - k.L - k.eb : 0, dc = Math.max(0, Math.abs(p.c) - k.w);
      var tt = Math.max(0, Math.min(k.L, p.t)), el = k.elA + (k.elB - k.elA) * tt / k.L;
      return { d: Math.hypot(dt, dc), p: p, el: el };
    }
    var areas = { a2a: [], a2b: [], a3: [], a4: [], a2c: null, a2d: null };
    R.forEach(function (k) {
      var r2a = rect(k, -k.ea, k.L + k.eb, -k.w, k.w);
      areas.a2a.push({ rwy: k.r.name, ring: r2a, surface: r2a.map(function (q, i) { return [q[0], q[1], (i === 1 || i === 2 ? k.elB : k.elA) + 3]; }) });
      areas.a3.push({ rwy: k.r.name, ring: rect(k, 0, k.L, -90, 90) });
      // 2b beyond each end: half width w + 15 % of the distance, 10 km
      [[-1, -k.ea, k.elA], [1, k.L + k.eb, k.elB]].forEach(function (e) {
        var pts = [], dir = e[0], t0 = e[1], el = e[2];
        [0, 2500, 5000, 7500, 10000].forEach(function (d) { pts.push([t0 + dir * d, -(k.w + 0.15 * d), el + 0.012 * d]); });
        [10000, 7500, 5000, 2500, 0].forEach(function (d) { pts.push([t0 + dir * d, k.w + 0.15 * d, el + 0.012 * d]); });
        pts.push(pts[0]);
        // ring: lon / lat; surface: lon / lat / height of the 1.2 % collection surface (m)
        var ll = pts.map(function (p) { return F.ll(k.A[0] + k.u[0] * p[0] + k.n[0] * p[1], k.A[1] + k.u[1] * p[0] + k.n[1] * p[1]); });
        areas.a2b.push({ rwy: k.r.name, end: dir < 0 ? 'a' : 'b', ring: ll, surface: ll.map(function (q, i) { return [q[0], q[1], pts[i][2]]; }) });
      });
      if (k.r.precA) areas.a4.push({ rwy: k.r.name, end: 'a', ring: rect(k, -900, 0, -60, 60) });
      if (k.r.precB) areas.a4.push({ rwy: k.r.name, end: 'b', ring: rect(k, k.L, k.L + 900, -60, 60) });
    });
    // 2c: the outline 10 km around Area 2a (the convex hull of the 2a rectangles widened by 10 km)
    var pts = [];
    R.forEach(function (k) { [[-k.ea, -k.w], [k.L + k.eb, -k.w], [k.L + k.eb, k.w], [-k.ea, k.w]].forEach(function (p) { var x = k.A[0] + k.u[0] * p[0] + k.n[0] * p[1], y = k.A[1] + k.u[1] * p[0] + k.n[1] * p[1]; for (var a = 0; a < 360; a += 10) pts.push([x + 10000 * Math.cos(a * D2R), y + 10000 * Math.sin(a * D2R)]); }); });
    if (pts.length) areas.a2c = hull(pts).map(function (p) { return F.ll(p[0], p[1]); });
    areas.a2d = circlePts(arp, 45000, 120);
    function inB(q, k) { // in Area 2b of runway k: {end el, d from the end of 2a}
      var p = loc(q, k), d = p.t < -k.ea ? -k.ea - p.t : p.t > k.L + k.eb ? p.t - k.L - k.eb : -1;
      if (d < 0 || d > 10000 || Math.abs(p.c) > k.w + 0.15 * d) return null;
      return { d: d, el: p.t < 0 ? k.elA : k.elB };
    }
    // one obstacle {c, elev (top), hgt, ground} -> its areas, the collection surface and the result
    function classify(ob) {
      var q = F.xy(ob.c), list = [], best2a = null, best2b = null, near = null;
      R.forEach(function (k) {
        var z = to2a(q, k);
        if (!near || z.d < near.d) near = { d: z.d, el: z.el, k: k };
        if (z.d === 0) { best2a = best2a || { k: k, el: z.el }; if (Math.abs(z.p.c) <= 90 && z.p.t >= 0 && z.p.t <= k.L) list.push('3'); }
        var b = inB(q, k); if (b && (!best2b || b.el + 0.012 * b.d < best2b.el + 0.012 * best2b.d)) best2b = b;
        var p = z.p;
        if ((k.r.precA && p.t < 0 && p.t >= -900 && Math.abs(p.c) <= 60) || (k.r.precB && p.t > k.L && p.t <= k.L + 900 && Math.abs(p.c) <= 60)) list.push('4');
      });
      var inMove = (opts.move || []).some(function (rg) { return inRing(ob.c, rg) || rg.some(function (v) { return distM(v, ob.c) <= 50; }); });
      if (inMove && list.indexOf('3') < 0) list.push('3');
      var dArp = distM(arp, ob.c), inTma = opts.tma ? inRing(ob.c, opts.tma) : true, sub, surf;
      var top = ob.elev, hgt = ob.hgt !== undefined && ob.hgt !== null ? ob.hgt : ob.ground !== undefined && ob.ground !== null && top !== null ? top - ob.ground : null;
      if (best2a) { sub = '2a'; surf = best2a.el + 3; }
      else if (best2b) { sub = '2b'; surf = best2b.el + 0.012 * best2b.d; }
      else if (near && near.d <= 10000) { sub = '2c'; surf = near.el + 0.012 * near.d; }
      else if (dArp <= 45000 && inTma) { sub = '2d'; surf = null; }
      else { sub = '1'; surf = null; }
      var need, by = '';
      if (surf !== null) { need = top !== null && top !== undefined ? top > surf : null; by = top !== null && top !== undefined ? top - surf : null; }
      else { need = hgt !== null ? hgt >= 100 : null; by = hgt !== null ? hgt - 100 : null; }
      var strict = list.indexOf('3') >= 0 ? '3' : list.indexOf('4') >= 0 ? '4' : sub; // the strictest accuracy applies
      return { sub: sub, also: list, strict: strict, req: ETOD[strict], surf: surf, need: need, above: by, dArp: dArp };
    }
    return { arp: arp, frame: F, areas: areas, classify: classify, ETOD: ETOD };
  }
  // convex hull (monotone chain) of points in the plane
  function hull(p) {
    p = p.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    function cr(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
    var lo = [], up = [];
    p.forEach(function (q) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); });
    for (var i = p.length - 1; i >= 0; i--) { var q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
    up.pop(); lo.pop();
    var h = lo.concat(up); h.push(h[0]); return h;
  }

  /* --------------------------------------------------------------- measure */
  // a, b: {c: [lon, lat], h (m)} -> the 3D vector from a to b
  function vector(a, b) {
    var d = distM(a.c, b.c), dh = (b.h || 0) - (a.h || 0);
    return { d: d, nm: d / NMM, brg: bearing(a.c, b.c), dh: dh, slant: Math.hypot(d, dh), angle: Math.atan2(dh, d) / D2R, grad: d > 0 ? dh / d : null };
  }

  /* --------------------------------------------------------------- formatting */
  function pct(g) { return g === null || g === undefined || isNaN(g) ? '—' : (Math.round(g * 1000) / 10).toFixed(1) + ' %'; }

  return { FT: FT, NMM: NMM, FTNM: FTNM, TO_DEFAULT: TO_DEFAULT, distM: distM, bearing: bearing, dest: dest, frame: frame, pathOf: pathOf, project: project, along: along, inRing: inRing,
    circlePts: circlePts, arcPts: arcPts, corridor: corridor, takeoff: takeoff, approach: approach, appAllowed: appAllowed, appHalf: appHalf, appLen: appLen, climbSurfaceCut: climbSurfaceCut,
    verdictTO: verdictTO, verdictAPP: verdictAPP, etod: etod, ETOD: ETOD, hull: hull, legPos: legPos, route: route, altAt: altAt, crossings: crossings, crossSev: crossSev, vector: vector, pct: pct, merge: merge };
})();
if (typeof module !== 'undefined') module.exports = FLTCALC;
