/*!
 * AIXM Code Converter
 * Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com> - author of the AIXM Code Converter
 * SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE; keep this notice in all copies)
 * ==========================================================================
 * AIXM Code Converter - more aerodrome mapping tools (AMDBX)
 * NOT FOR NAVIGATION - for study and analysis only.
 *   Generate from AIP   aerodromes of an AIXM data set without aerodrome mapping features: runway elements from the
 *                       runway ends (or a threshold, the bearing and the length) and the width, thresholds with
 *                       their elevation and declared distances, stopways from ASDA - TORA, the reference point and
 *                       the stands. The geometry is derived, not surveyed: every feature says so in its source, the
 *                       accuracy is left unknown and the package records the quality as coarse.
 *   Import              GeoJSON, CSV with WKT and DXF layers named after AMXM feature types become AMXM (as the
 *                       package's own GIS, table and CAD files do), read by the normal AMXM reader.
 *   Compare             two aerodrome mapping data sets (two cycles, two suppliers, AIXM against AMXM): features added,
 *                       removed, moved (with the distance) and changed (with the attributes); a report and an AMXM
 *                       change file (permanent changes, interp 3).
 *   Upload & sources    one place for everything aerodrome mapping is made from: the AIP data set, AMXM and GIS / CAD
 *                       files, OpenStreetMap, the State's charts and AD 2 pages (read by amdbdoc.js, with their ICAO
 *                       Annex 4 check), stand tables, orthophotos and supporting documents.
 *   The generator fills each item from the best source there is: the AIP data set, the State's charts, what the
 *   user traced on imagery (amdbtrace.js), OpenStreetMap, then the ICAO Annex 14 minimum — each feature says which.
 * Loaded only when one of these tools is used (src/lazy.js).
 * ========================================================================== */
/* global MODEL, AMDB, AMDBPKG, AMDBOSM, AMDBDOC, AMDBTRACE, AMDBOCR, LAZY, DDMAP, EXPORTS, APP_INFO, AIP, fflate */
var AMDBX = (function () {
  'use strict';
  var M = MODEL, s = M.s, D2R = Math.PI / 180;
  function esc(t) { return String(t === undefined || t === null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(n) { return Number(n || 0).toLocaleString('en-US'); }
  function arr(v) { return v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]; }
  function meters(x) { x = arr(x)[0]; if (!x || x.v === undefined) return null; var n = parseFloat(x.v); if (isNaN(n)) return null; var u = String(x.u || '').toUpperCase(); return u === 'FT' ? n * 0.3048 : u === 'KM' ? n * 1000 : u === 'NM' ? n * 1852 : n; }
  function r2(n) { return String(Math.round(n * 100) / 100); }

  /* ------------------------------------------------------- generate from AIP */
  // every aerodrome item of the AIP data set that has a position or a shape is used; what has none is derived from
  // published dimensions (runway ends, width, shoulders, declared distances) and, for the runway markings, from the
  // ICAO Annex 14 Volume I Chapter 5 standard layout — always labelled as derived, coarse quality
  var MAPPING = ['RunwayElement', 'TaxiwayElement', 'ApronElement', 'GuidanceLine', 'TaxiHoldingPosition'];
  var AD_KINDS = ['RunwayElement', 'TaxiwayElement', 'ApronElement', 'GuidanceLine', 'TaxiHoldingPosition', 'AircraftStand', 'DeicingArea', 'WorkArea', 'TouchDownLiftOff', 'Taxiway', 'Apron'];
  function cpoints(ds, dir) {
    return (ds.rev.get(dir) || []).filter(function (x) { return x[1].k === 'RunwayCentrelinePoint' && !x[1].cur.gone; }).map(function (x) {
      var c = x[1], p = c.cur.p, loc = arr(p.location)[0], dd = {};
      arr(p.associatedDeclaredDistance).forEach(function (d) { var t = s(d && d.type), v = d && meters((arr(d.declaredValue)[0] || {}).distance); if (t && v !== null) dd[t] = v; });
      return { rec: c, role: s(p.role), c: M.pointOf(ds, c), elev: loc && loc.elevation ? meters(loc.elevation) : null, dd: dd };
    });
  }
  function gcentre(g) { if (!g) return null; if (g.t === 'M') return g.parts.length ? gcentre(g.parts[0]) : null; var pts = g.t === 'P' ? [g.c] : g.t === 'L' ? g.c : g.c[0]; pts = (pts || []).filter(function (q) { return q && typeof q[0] === 'number'; }); if (!pts.length) return null; var x = 0, y = 0; pts.forEach(function (q) { x += q[0]; y += q[1]; }); return [x / pts.length, y / pts.length]; }
  function ownedBy(ds, ad, k) { return (ds.byType[k] || []).filter(function (x) { if (x.cur.gone) return false; var o = ds.owner.get(x); return o === ad || (o && ds.owner.get(o) === ad); }); }
  // the aerodromes of the AIXM data loaded, with what generation can use
  function candidates(datasets) {
    var out = [];
    datasets.forEach(function (ds, di) {
      if (ds.family === 'amxm' || ds.family === 'tab' || !ds.byType) return;
      (ds.byType.AirportHeliport || []).forEach(function (ad) {
        if (ad.cur.gone) return;
        var code = s(ad.cur.p.locationIndicatorICAO) || s(ad.cur.p.designator);
        var rwys = (ds.byType.Runway || []).filter(function (r) { return !r.cur.gone && (M.target(ds, r.cur.p.associatedAirportHeliport) === ad || ds.owner.get(r) === ad); }).map(function (r) {
          var dirs = (ds.rev.get(r) || []).filter(function (x) { return x[1].k === 'RunwayDirection' && !x[1].cur.gone; }).map(function (x) { var d = x[1]; return { rec: d, des: s(d.cur.p.designator), brg: parseFloat(s(d.cur.p.trueBearing)), pts: cpoints(ds, d), lights: (ds.rev.get(d) || []).filter(function (y) { return (y[1].k === 'RunwayDirectionLightSystem' || y[1].k === 'ApproachLightingSystem') && !y[1].cur.gone; }).map(function (y) { return y[1]; }) }; });
          var p = r.cur.p;
          return { rec: r, des: s(p.designator), type: /FATO/.test(s(p.type)) ? 'FATO' : s(p.type) || 'RWY', len: meters(p.nominalLength), wid: meters(p.nominalWidth), shoulder: meters(p.widthShoulder), sp: arr(p.surfaceProperties)[0], dirs: dirs };
        });
        var by = {};
        AD_KINDS.forEach(function (k) { by[k] = ownedBy(ds, ad, k); });
        var stands = by.AircraftStand.filter(function (x) { return M.pointOf(ds, x); });
        var mapped = MAPPING.reduce(function (n, k) { return n + by[k].length; }, 0);
        var amxm = datasets.some(function (d) { return d.family === 'amxm' && d.recs.some(function (x) { return x.cur && x.cur.p && x.cur.p._amxm && s(x.cur.p.idarpt) === code; }); });
        var arp = M.pointOf(ds, ad);
        // obstacles of the aerodrome (owned, or within 6 km of the reference point)
        // obstacles, navaids and lights of the aerodrome: owned by it, or within 6 km of its reference point, in any of
        // the AIXM data sets loaded (an obstacle data set beside the AIP data set, an IFP data set …)
        var dsOf = new Map(), others = datasets.filter(function (d) { return d.family !== 'amxm' && d.family !== 'tab' && d.byType; });
        var near = function (k) {
          var out2 = [];
          others.forEach(function (d) { (d.byType[k] || []).forEach(function (v) { if (v.cur.gone) return; var c2 = M.pointOf(d, v); if (!c2) { try { c2 = gcentre(M.geometry(d, v)); } catch (e) { c2 = null; } } if (!c2) return; if ((d === ds && ds.owner.get(v) === ad) || (arp && Math.hypot((c2[0] - arp[0]) * Math.cos(arp[1] * D2R), c2[1] - arp[1]) * 111320 < 6000)) { dsOf.set(v, d); out2.push(v); } }); });
          return out2;
        };
        var obs = near('VerticalStructure');
        var navs = [].concat(near('Localizer'), near('Glidepath'), near('DME'), near('VOR'), near('NDB'), near('TACAN'), near('MarkerBeacon'), near('Azimuth'), near('Elevation'));
        var lights = near('AeronauticalGroundLight');
        // runway directions with an ILS: from the ILS navaids of the aerodrome (their runway direction, or the
        // designator in their name), and the localizer positions (for the geometry check in generate)
        var ilsDes = {};
        others.forEach(function (d) { (d.byType.Navaid || []).forEach(function (nv) {
          if (nv.cur.gone || !/ILS|LOC|MLS|GLS/.test(s(nv.cur.p.type))) return;
          var served = d.owner.get(nv) === ad || arr(nv.cur.p.servedAirport).some(function (x) { return M.target(d, x) === ad; });
          if (!served) return;
          var rds = arr(nv.cur.p.runwayDirection).map(function (x) { var rd = M.target(d, x); return rd ? s(rd.cur.p.designator) : ''; }).filter(Boolean);
          if (!rds.length) arr(nv.cur.p.navaidEquipment).forEach(function (q) { var eq = q && M.target(d, q.theNavaidEquipment); var m = eq && /(?:LOC|ILS|RWY)\s*(\d{2}[LRC]?)/i.exec(s(eq.cur.p.name) + ' ' + s(eq.cur.p.designator)); if (m) rds.push(m[1]); });
          var m2 = /(?:ILS|LOC|RWY)\s*(\d{2}[LRC]?)/i.exec(s(nv.cur.p.name)); if (m2) rds.push(m2[1]);
          rds.forEach(function (x) { ilsDes[x.toUpperCase()] = 1; });
        }); });
        var locs = navs.filter(function (n) { return n.k === 'Localizer'; }).map(function (n) { return M.pointOf(dsOf.get(n) || ds, n); }).filter(Boolean);
        var twyW = {}; by.Taxiway.forEach(function (x) { var w = meters(x.cur.p.width); if (w && s(x.cur.p.designator)) twyW[s(x.cur.p.designator)] = w; });
        out.push({ ds: ds, di: di, ad: ad, code: code, name: s(ad.cur.p.name), arp: arp, magVar: parseFloat(s(ad.cur.p.magneticVariation)), rwys: rwys, stands: stands, by: by, obs: obs, navs: navs, lights: lights, dsOf: dsOf, ilsDes: ilsDes, locs: locs, twyW: twyW, mapped: mapped, amxm: amxm,
          cl: rwys.reduce(function (n, r) { return n + r.dirs.reduce(function (m, d) { return m + d.pts.filter(function (p) { return p.c; }).length; }, 0); }, 0),
          thr: rwys.reduce(function (n, r) { return n + r.dirs.filter(function (d) { return d.pts.some(function (p) { return /THR/.test(p.role) && p.c; }); }).length; }, 0) });
      });
    });
    return out;
  }
  function plane(c) { return AMDB.plane(c[0], c[1]); }
  function rect(a, b, w) { // lon/lat a -> b, width w (m): a counter-clockwise rectangle
    var P = plane(a), A = P.fwd(a), B = P.fwd(b), dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy);
    if (L < 1) return null;
    var nx = -dy / L * w / 2, ny = dx / L * w / 2;
    return [[A[0] - nx, A[1] - ny], [B[0] - nx, B[1] - ny], [B[0] + nx, B[1] + ny], [A[0] + nx, A[1] + ny], [A[0] - nx, A[1] - ny]].map(P.inv);
  }
  function along(a, brg, dist) { var P = plane(a); return P.inv([Math.sin(brg * D2R) * dist, Math.cos(brg * D2R) * dist]); }
  function bearing(a, b) { var P = plane(a), B = P.fwd(b); return (Math.atan2(B[0], B[1]) / D2R + 360) % 360; }
  // a frame along a runway from a threshold: (s along the runway, l to the right) in metres -> lon/lat
  function frame(o, brg) {
    var P = plane(o), u = [Math.sin(brg * D2R), Math.cos(brg * D2R)], n = [u[1], -u[0]];
    return {
      pt: function (sa, l) { return P.inv([u[0] * sa + n[0] * l, u[1] * sa + n[1] * l]); },
      box: function (s0, s1, l0, l1) { var f = this; return [f.pt(s0, l0), f.pt(s0, l1), f.pt(s1, l1), f.pt(s1, l0), f.pt(s0, l0)]; }
    };
  }
  function ccw(r) { var a = 0; for (var i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return a < 0 ? r.slice().reverse() : r; }
  // intersection of two convex rings (Sutherland-Hodgman), lon/lat on a local plane
  function clip(subject, clipper) {
    var P = plane(subject[0]), S = subject.slice(0, -1).map(P.fwd), C = ccw(clipper).slice(0, -1).map(P.fwd);
    function inside(p, a, b) { return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= 0; }
    function cut(p, q, a, b) { var A1 = q[1] - p[1], B1 = p[0] - q[0], C1 = A1 * p[0] + B1 * p[1], A2 = b[1] - a[1], B2 = a[0] - b[0], C2 = A2 * a[0] + B2 * a[1], d = A1 * B2 - A2 * B1; return [(B2 * C1 - B1 * C2) / d, (A1 * C2 - A2 * C1) / d]; }
    var out = ccw(S.concat([S[0]])).slice(0, -1);
    for (var i = 0; i < C.length && out.length; i++) {
      var a = C[i], b = C[(i + 1) % C.length], inp = out; out = [];
      for (var j = 0; j < inp.length; j++) { var p = inp[j], q = inp[(j + 1) % inp.length], pi = inside(p, a, b), qi = inside(q, a, b); if (pi) out.push(p); if (pi !== qi) out.push(cut(p, q, a, b)); }
    }
    if (out.length < 3) return null;
    var g = out.map(P.inv); g.push(g[0]);
    return g;
  }
  // a line widened to a polygon (left side, then the right side back)
  function widen(line, w) {
    var pts = line.filter(function (p) { return typeof p[0] === 'number'; });
    if (pts.length < 2) return null;
    var P = plane(pts[0]), X = pts.map(P.fwd), L = [], R = [];
    X.forEach(function (p, i) {
      var a = X[Math.max(0, i - 1)], b = X[Math.min(X.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1;
      L.push([p[0] - dy / d * w / 2, p[1] + dx / d * w / 2]); R.push([p[0] + dy / d * w / 2, p[1] - dx / d * w / 2]);
    });
    var ring = L.concat(R.reverse()).map(P.inv); ring.push(ring[0]);
    return ring;
  }
  var SURF_RWY = { CONC: '2', ASPH: '4', SAND: '5', GRASS: '9', GRAVEL: '11', BITUM: '15', BRICK: '16', MACADAM: '17', STONE: '18', CORAL: '19', CLAY: '20', LATERITE: '21', MATS: '22', MEMBRANE: '23', WOOD: '24', WATER: '8', SNOW: '7', ICE: '7' };
  var SURF_GND = { CONC: '1', ASPH: '2', SAND: '3', SOIL: '4', SNOW: '5', ICE: '5', WATER: '6', GRASS: '7', GRAVEL: '8', BITUM: '10', BRICK: '11', MACADAM: '12', STONE: '13', CORAL: '14', CLAY: '15', LATERITE: '16', MATS: '17', MEMBRANE: '18', WOOD: '19' };
  function pcnOf(sp) { try { return AIP.pcn(sp) || ''; } catch (e) { return ''; } }
  function comp(sp) { return sp ? s(sp.composition).replace(/^OTHER:/, '') : ''; }
  function surfAttrs(a, sp, key, map) { var c = map[comp(sp)]; if (c) a[key] = { v: c }; var p = pcnOf(sp); if (p) a.pcn = { v: p.slice(0, 25) }; }
  // Annex 14 Volume I, 5.2.4 (threshold), 5.2.5 (aiming point, Table 5-1), 5.2.6 (touchdown zone, Table 5-2)
  function thrStripes(w) { return w >= 60 ? 16 : w >= 45 ? 12 : w >= 30 ? 8 : w >= 23 ? 6 : 4; }
  function aiming(lda) { return lda >= 2400 ? { at: 400, len: 52.5, w: 8, gap: 20 } : lda >= 1200 ? { at: 300, len: 52.5, w: 8, gap: 20 } : lda >= 800 ? { at: 250, len: 37.5, w: 6, gap: 9 } : { at: 150, len: 37.5, w: 4, gap: 6 }; }
  function tdzPairs(lda) { return lda >= 2400 ? 6 : lda >= 1500 ? 4 : lda >= 1200 ? 3 : lda >= 900 ? 2 : 1; }
  var VS_PNT = { ANTENNA: '3', 'POLE': '6', TREE: '5', WINDSOCK: '4', BEACON: '8', NAVAID: '9', SIGN: '10', LIGHTHOUSE: '8', CHIMNEY: '1', STACK: '1', PYLON: '2', LIGHT: '7' };
  var VS_PLY = { BUILDING: '4', TERMINAL: '1', HANGAR: '2', CONTROL_TOWER: '3', TOWER: '4', TANK: '5', TREE: '6', FOREST: '8', VEGETATION: '7', NAVAID: '10', SIGN: '11' };
  var DEF = { markings: true, taxiways: true, obstacles: true, centreline: true, lights: true, schematic: false, osm: true, infer: true, network: true, charts: true, traced: true };
  // aerodrome reference code (ICAO Annex 14 Table 1-1), estimated from the longest and the widest runway
  function AMDBOSM_des(ref) { return String(ref || '').toUpperCase().split(/[/\-\s.]+/).map(function (x) { var m = /^(\d{1,2})([LRC]?)$/.exec(x.trim()); return m ? ('0' + m[1]).slice(-2) + m[2] : ''; }).filter(Boolean); }
  function codeOf(c) {
    var rw = c.rwys.filter(function (r) { return r.type !== 'FATO'; }), L = rw.reduce(function (m, r) { return Math.max(m, r.len || 0); }, 0), W = rw.reduce(function (m, r) { return Math.max(m, r.wid || 0); }, 0);
    return { num: L >= 1800 ? 4 : L >= 1200 ? 3 : L >= 800 ? 2 : 1, letter: W >= 60 ? 'F' : W >= 45 ? (L >= 2800 ? 'E' : 'D') : W >= 30 ? 'C' : W >= 23 ? 'B' : 'A', maxW: W, maxL: L };
  }
  var TWYW = { A: 7.5, B: 10.5, C: 15, D: 18, E: 23, F: 25 }; // taxiway width by code letter (Annex 14 3.9)
  // aerodrome mapping features made from the AIP data of the aerodromes chosen; opt: which derived items
  function generate(list, opt) {
    opt = Object.assign({}, DEF, opt || {});
    var feats = [], notes = [];
    list.forEach(function (c) {
      var src = 'Generated from AIP data (' + c.ds.name + '): geometry derived, coarse quality', ds = c.ds;
      var srcStd = 'Generated from AIP data (' + c.ds.name + '): standard layout of ICAO Annex 14 Volume I Chapter 5, not surveyed';
      var srcSch = 'SCHEMATIC from AIP data (' + c.ds.name + '): runway positions withheld; placed at the reference point, indicative only', curSchem = false;
      var osm = opt.osm && typeof AMDBOSM !== 'undefined' ? AMDBOSM.get(c.code) : null, osmRw = osm ? AMDBOSM.runways(osm) : [], usedRw = {}, curOsm = null, curInfer = '';
      var CODE = codeOf(c), rwInfo = [];
      var srcInf = 'Inferred from AIP data (' + c.ds.name + '): ICAO Annex 14 minimum, not published in the AIP — indicative';
      // what the State's charts and documents give (stands, thresholds, widths, strength, lighting as published)
      var K = opt.charts && typeof AMDBDOC !== 'undefined' ? AMDBDOC.forAd(c.code, c.arp) : null, curChart = '';
      if (K) { AMDBDOC.matchDims(K, c.rwys); if (!c.arp && K.arp) c = Object.assign({}, c, { arp: K.arp, arpChart: true }); }
      function srcC(what) { return ('From the State\'s charts (' + K.src + '): ' + what).slice(0, 254); }
      function kdes(d) { return K && d ? K.rwy[AMDBDOC.des2(d.des)] || null : null; }
      function srcO(std) { return ('Generated from AIP data (' + c.ds.name + ') and OpenStreetMap (ODbL 1.0, ' + curOsm.id + '): runway centre line from OpenStreetMap, dimensions from the AIP' + (std ? '; Annex 14 standard layout' : '') + ', coarse quality').slice(0, 254); }
      function base(t, key, std) { return { t: t, ad: c.code, id: 'amdb-gen-' + c.code + '-' + key, a: { idarpt: { v: c.code }, source: { v: curSchem ? srcSch : curInfer ? (srcInf + ': ' + curInfer).slice(0, 254) : curChart ? srcC(curChart) : curOsm ? srcO(std) : std ? srcStd : src } } }; }
      function push(f) { feats.push(f); return f; }
      if (c.arp) { var f0 = base('AerodromeReferencePoint', 'arp'); f0.g = [{ t: 'P', c: c.arp }]; if (c.arpChart) f0.a.source = { v: srcC('reference point as published') }; if (c.name) f0.a.name = { v: c.name.slice(0, 254) }; var el = meters(c.ad.cur.p.fieldElevation); if (el === null && K && K.elev !== null) el = K.elev; if (el !== null) f0.a.elev = { v: r2(el), u: 'M' }; if (s(c.ad.cur.p.designatorIATA)) f0.a.iata = { v: s(c.ad.cur.p.designatorIATA) }; push(f0); }
      var rwyRings = [];
      c.rwys.forEach(function (r) {
        var d1 = r.dirs[0], d2 = r.dirs[1], heli = r.type === 'FATO'; curSchem = false; curOsm = null; curInfer = ''; curChart = '';
        var K1 = kdes(d1), K2 = kdes(d2), fromChart = false, widC = false;
        function pt(d, re) { var x = d && d.pts.filter(function (p) { return re.test(p.role) && p.c; })[0]; return x ? x.c : null; }
        var e1 = pt(d1, /^START/) || pt(d1, /^THR$/) || pt(d2, /^END$/), e2 = pt(d2, /^START/) || pt(d2, /^THR$/) || pt(d1, /^END$/);
        // the runway reaches the furthest point published on its centre line (START, END, points without a role …)
        if (e1 && e2) {
          var all = [].concat(d1 ? d1.pts : [], d2 ? d2.pts : []).filter(function (q) { return q.c; }), P0 = plane(e1), A2 = P0.fwd(e2), L2 = Math.hypot(A2[0], A2[1]);
          if (L2 > 1 && all.length > 2) {
            var lo = 0, hi = L2;
            all.forEach(function (q) { var v = P0.fwd(q.c), sa = (v[0] * A2[0] + v[1] * A2[1]) / L2, off = Math.abs(v[0] * A2[1] - v[1] * A2[0]) / L2; if (off < Math.max(30, (r.wid || 45))) { if (sa < lo) lo = sa; if (sa > hi) hi = sa; } });
            if (lo < -1) e1 = P0.inv([A2[0] * lo / L2, A2[1] * lo / L2]);
            if (hi > L2 + 1) e2 = P0.inv([A2[0] * hi / L2, A2[1] * hi / L2]);
          }
        }
        // no runway positions in the AIP: the threshold and runway end coordinates the State's charts publish
        if (!e1 && !e2 && ((K1 && K1.thr) || (K2 && K2.thr))) {
          var ce1 = (K2 && K2.end) || (K1 && K1.thr) || null, ce2 = (K1 && K1.end) || (K2 && K2.thr) || null, Lc = ce1 && ce2 ? Math.hypot.apply(null, plane(ce1).fwd(ce2)) : 0;
          if (ce1 && ce2 && r.len && (Lc > r.len * 1.05 + 30 || Lc < r.len * 0.5)) notes.push(c.code + ' ' + r.des + ': the runway coordinates read from the chart are ' + Math.round(Lc) + ' m apart for a runway of ' + Math.round(r.len) + ' m — not used (check the chart)');
          else { e1 = ce1; e2 = ce2; fromChart = true; notes.push(c.code + ' ' + r.des + ': runway positions from the State\'s chart (' + K.src + ') — the AIP data set gives none'); }
        }
        // no runway positions in the AIP: the runway centre line mapped in OpenStreetMap, matched by its designators
        var rdes = AMDBOSM_des(r.des);
        if (e1 || e2) osmRw.forEach(function (o) { if (o.des.some(function (x) { return rdes.indexOf(x) >= 0; })) usedRw[o.id] = 1; });
        else if (osmRw.length) {
          var mr = osmRw.filter(function (o) { return !usedRw[o.id] && o.des.some(function (x) { return rdes.indexOf(x) >= 0; }); })[0] || (c.rwys.length === 1 && osmRw.length === 1 && !usedRw[osmRw[0].id] ? osmRw[0] : null);
          if (mr) {
            usedRw[mr.id] = 1;
            var hd = parseInt((d1 && d1.des) || rdes[0], 10) * 10 + (isNaN(c.magVar) ? 0 : c.magVar), b0 = bearing(mr.ends[0], mr.ends[1]);
            var flip = !isNaN(hd) && Math.abs(((b0 - hd) % 360 + 540) % 360 - 180) > 90; // direction 1 lands from e1 towards e2
            e1 = flip ? mr.ends[1] : mr.ends[0]; e2 = flip ? mr.ends[0] : mr.ends[1]; curOsm = mr;
            if (!r.wid && mr.width) r.wid = mr.width;
            notes.push(c.code + ' ' + r.des + ': runway centre line from OpenStreetMap (' + mr.id + ') — the AIP gives no runway positions');
          }
        }
        // positions withheld in the AIP (some States): a schematic runway at the reference point, only when asked for
        var schem = false;
        if (!e1 && !e2 && opt.schematic && c.arp && c.rwys.length === 1 && r.len && r.wid) {
          var dn = parseInt((r.des.match(/\d{2}/) || [])[0], 10);
          if (dn) { var tb = (dn * 10 + (isNaN(c.magVar) ? 0 : c.magVar) + 360) % 360; e1 = along(c.arp, (tb + 180) % 360, r.len / 2); e2 = along(c.arp, tb, r.len / 2); schem = true; curSchem = true; notes.push(c.code + ' ' + r.des + ': SCHEMATIC runway — the AIP withholds its positions; placed at the aerodrome reference point, bearing from the designator' + (isNaN(c.magVar) ? '' : ' and the magnetic variation') + ' (indicative, about ±1 km)'); }
        }
        if (e1 && !e2 && d1 && !isNaN(d1.brg) && r.len) e2 = along(e1, d1.brg, r.len);
        if (e2 && !e1 && d2 && !isNaN(d2.brg) && r.len) e1 = along(e2, d2.brg, r.len);
        var idrwy = r.des.split(/[/.]/).map(function (x) { return x.trim(); }).sort(function (a, b) { return parseInt(a, 10) - parseInt(b, 10); }).join('.');
        if (!r.wid && K) { var kw = (K1 && K1.wid) || (K2 && K2.wid); if (kw) { r.wid = kw; widC = true; notes.push(c.code + ' ' + r.des + ': runway width ' + kw + ' m from the State\'s chart'); } }
        if (fromChart || widC) curChart = fromChart ? 'runway between the threshold / runway end coordinates as published, width ' + (widC ? 'as published' : 'from the AIP') : 'runway width as published; positions from the AIP';
        if (!(e1 && e2 && r.wid)) { notes.push(c.code + ' ' + r.des + ': runway surface not generated (' + (!r.wid ? 'no width' : 'no runway ends, or no threshold with bearing and length') + ')'); }
        else {
          var ring = rect(e1, e2, r.wid), len = r.len || 0;
          var f = push(base(heli ? 'FinalApproachAndTakeOffArea' : 'RunwayElement', 'rwy-' + idrwy)); f.g = [{ t: 'A', c: [ring] }];
          if (schem) f.a.source = { v: 'SCHEMATIC from AIP data (' + c.ds.name + '): runway positions withheld; placed at the reference point, indicative only' }; f.a.idrwy = { v: idrwy }; f.a.status = { v: '1' }; f.label = idrwy;
          if (!heli) { f.a.width = { v: r2(r.wid), u: 'M' }; f.a.length = { v: r2(len), u: 'M' }; }
          surfAttrs(f.a, r.sp, 'surftype', SURF_RWY);
          var kp = !f.a.pcn && ((K1 && K1.pcn) || (K2 && K2.pcn)); if (kp) { f.a.pcn = { v: kp.replace(/^PCN\s*/, '').slice(0, 25) }; notes.push(c.code + ' ' + r.des + ': bearing strength ' + kp + ' from the State\'s chart'); }
          rwyRings.push({ ring: ring, id: idrwy, sp: r.sp });
          // shoulders: AIXM widthShoulder (the overall width with the shoulders), or the width the chart publishes
          var shC = !r.shoulder && K ? (K.shoulder[AMDBDOC.des2(d1 && d1.des)] || K.shoulder[AMDBDOC.des2(d2 && d2.des)] || K.shoulder['*']) : null, shoulder = r.shoulder || (shC ? (shC.total ? shC.w : r.wid + 2 * shC.w) : null);
          if (!heli && shoulder && shoulder > r.wid) {
            var sw2 = (shoulder - r.wid) / 2, F = frame(e1, bearing(e1, e2)), L0 = Math.hypot.apply(null, plane(e1).fwd(e2)), was0 = curChart;
            if (shC) curChart = 'shoulders to an overall width of ' + r2(shoulder) + ' m as published';
            [[-r.wid / 2 - sw2, -r.wid / 2, 'L'], [r.wid / 2, r.wid / 2 + sw2, 'R']].forEach(function (x) { var sh = push(base('RunwayShoulder', 'shd-' + idrwy + '-' + x[2])); sh.g = [{ t: 'A', c: [F.box(0, L0, x[0], x[1])] }]; sh.a.idrwy = { v: idrwy }; sh.a.status = { v: '1' }; surfAttrs(sh.a, r.sp, 'gsurftyp', SURF_GND); delete sh.a.pcn; sh.label = idrwy; });
            curChart = was0;
          }
          else if (!heli && opt.infer && /[DEF]/.test(CODE.letter) && (CODE.letter === 'F' ? 75 : 60) > r.wid) { // Annex 14 3.2: shoulders to an overall width of 60 m (code D, E) or 75 m (F)
            var ow = CODE.letter === 'F' ? 75 : 60, sw3 = (ow - r.wid) / 2, F6 = frame(e1, bearing(e1, e2)), L6 = Math.hypot.apply(null, plane(e1).fwd(e2));
            curInfer = 'runway shoulders to an overall width of ' + ow + ' m (Annex 14 3.2, code letter ' + CODE.letter + ')';
            [[-r.wid / 2 - sw3, -r.wid / 2, 'L'], [r.wid / 2, r.wid / 2 + sw3, 'R']].forEach(function (x) { var sh = push(base('RunwayShoulder', 'shd-' + idrwy + '-' + x[2])); sh.g = [{ t: 'A', c: [F6.box(0, L6, x[0], x[1])] }]; sh.a.idrwy = { v: idrwy }; sh.a.status = { v: '1' }; sh.label = idrwy + ' shoulder (inferred)'; });
            curInfer = '';
          }
          if (!heli && opt.centreline) { var pc = push(base('PaintedCenterline', 'pcl-' + idrwy, true)); pc.g = [{ t: 'L', c: [e1, e2] }]; pc.a.idrwy = { v: idrwy }; pc.label = idrwy; }
          // per runway end: stopway (ASDA - TORA), displaced threshold area, markings
          [[d1, e1, e2], [d2, e2, e1]].forEach(function (x) {
            var d = x[0]; if (!d) return;
            var dd = d.pts.reduce(function (o, p) { Object.keys(p.dd).forEach(function (k) { o[k] = p.dd[k]; }); return o; }, {});
            var brg = bearing(x[1], x[2]);
            if (dd.ASDA && dd.TORA && dd.ASDA - dd.TORA > 1) {
              var end = along(x[2], brg, dd.ASDA - dd.TORA), sw = push(base('Stopway', 'swy-' + d.des));
              sw.g = [{ t: 'A', c: [rect(x[2], end, r.wid)] }]; sw.a.idthr = { v: d.des }; sw.a.status = { v: '1' }; sw.label = d.des;
            }
            var thr = pt(d, /^THR$/) || pt(d, /^DISTHR$/), dthr = pt(d, /^DISTHR$/);
            var start = x[1], thrPos = dthr || thr || start, disp = Math.hypot.apply(null, plane(start).fwd(thrPos));
            if (dthr && disp > 5) { var da = push(base('RunwayDisplacedArea', 'dsp-' + d.des)); da.g = [{ t: 'A', c: [rect(start, dthr, r.wid)] }]; da.a.idthr = { v: d.des }; da.a.status = { v: '1' }; surfAttrs(da.a, r.sp, 'surftype', SURF_RWY); da.label = d.des; }
            if (heli || !opt.markings) return;
            var lda = dd.LDA || (len - disp), F2 = frame(thrPos, brg), w = r.wid, mk = 0;
            function mark(type, ring2, what) { var m = push(base('RunwayMarking', 'mk-' + d.des + '-' + (++mk), true)); m.g = [{ t: 'A', c: [ring2] }]; m.a.idrwy = { v: idrwy }; m.a.rwymktyp = { v: type }; m.label = d.des + ' ' + what; }
            // threshold stripes: 30 m long from 6 m, 1.8 m wide, 1.8 m apart, a double space on the centre line
            var n = thrStripes(w), half = n / 2, sx = 1.8;
            for (var i = 0; i < half; i++) { var o = 1.8 + i * 2 * sx; [1, -1].forEach(function (sg) { mark('1', F2.box(6, 36, sg * o, sg * (o + sx)), 'threshold'); }); }
            // aiming point and touchdown zone
            var ap = aiming(lda);
            if (lda > ap.at + ap.len) [1, -1].forEach(function (sg) { mark('4', F2.box(ap.at, ap.at + ap.len, sg * ap.gap / 2, sg * (ap.gap / 2 + ap.w)), 'aiming point'); });
            var pairs = tdzPairs(lda), bars = [3, 3, 2, 2, 1, 1], k2 = 0;
            for (var j = 1; k2 < pairs && j * 150 < lda / 2; j++) {
              var at = j * 150;
              if (Math.abs(at - ap.at) < 60) continue; // no pair where the aiming point is
              var nb = bars[Math.min(k2, 5)];
              for (var b2 = 0; b2 < nb; b2++) { var lo = ap.gap / 2 + b2 * 3.3; [1, -1].forEach(function (sg) { mark('6', F2.box(at, at + 22.5, sg * lo, sg * (lo + 1.8)), 'touchdown zone'); }); }
              k2++;
            }
          });
          // side stripes along both edges (0.9 m) between the thresholds
          if (!heli && opt.markings) { var F3 = frame(e1, bearing(e1, e2)), L3 = Math.hypot.apply(null, plane(e1).fwd(e2)); [[-r.wid / 2, -r.wid / 2 + 0.9, 'L'], [r.wid / 2 - 0.9, r.wid / 2, 'R']].forEach(function (x) { var m = push(base('RunwayMarking', 'mk-' + idrwy + '-side' + x[2], true)); m.g = [{ t: 'A', c: [F3.box(0, L3, x[0], x[1])] }]; m.a.idrwy = { v: idrwy }; m.a.rwymktyp = { v: '3' }; m.label = idrwy + ' side stripe'; }); }
        }
        // the directions an ILS serves: from the ILS navaids, or a localizer beyond the far end on the extended centre line
        var ilsD = {};
        [d1, d2].forEach(function (d) { if (d && c.ilsDes[String(d.des).toUpperCase()]) ilsD[d.des] = 1; });
        if (e1 && e2) { var P9 = plane(e1), A9 = P9.fwd(e2), L9 = Math.hypot(A9[0], A9[1]); c.locs.forEach(function (lp) { var v = P9.fwd(lp), sa = (v[0] * A9[0] + v[1] * A9[1]) / L9, off = Math.abs(v[0] * A9[1] - v[1] * A9[0]) / L9; if (off < 250) { if (sa > L9 && d1) ilsD[d1.des] = 1; else if (sa < 0 && d2) ilsD[d2.des] = 1; } }); }
        if (e1 && e2 && !heli) rwInfo.push({ e1: e1, e2: e2, id: idrwy, des: r.des, wid: r.wid || 45, prec: Object.keys(ilsD).length > 0 });
        // no lights in the AIP data set: the lighting the State's charts list (positions at the Annex 14 layout)
        var chartL = {}, LPOS = { EDGE: 'EDGE', CL: 'CL', TDZ: 'TDZ', THR: 'THR', END: 'END' };
        if (K) [d1, d2].forEach(function (d) { if (d && !d.lights.length) { var l = AMDBDOC.lightsFor(K, AMDBDOC.des2(d.des), c.rwys.length === 1); if (l.length) chartL[d.des] = l; } });
        Object.keys(chartL).forEach(function (k) { var other = chartL[k].filter(function (l) { return !LPOS[l.kind] && l.kind !== 'ALS'; }).map(function (l) { return AMDBDOC.LNAME[l.kind]; }); notes.push(c.code + ' ' + k + ': lighting from the State\'s chart — ' + chartL[k].map(function (l) { return (l.kind === 'ALS' && l.cls ? l.cls + ' ' : '') + AMDBDOC.LNAME[l.kind]; }).filter(function (x, i, a) { return a.indexOf(x) === i; }).join(', ') + (other.length ? ' (' + other.join(', ') + ': listed, not drawn)' : '')); });
        // no lights declared but an ILS: the Annex 14 minimum for a precision approach runway CAT I (inferred)
        var inferL = opt.infer && !(d1 && d1.lights.length) && !(d2 && d2.lights.length) && !Object.keys(chartL).length && Object.keys(ilsD).length > 0;
        function lightsOf(d) {
          if (!d.lights.length && chartL[d.des]) return chartL[d.des].filter(function (l) { return l.kind === 'ALS' || LPOS[l.kind]; }).map(function (l) { return l.kind === 'ALS' ? { k: 'ApproachLightingSystem', chart: l, cur: { p: { classICAO: l.cls, type: l.cls } } } : { k: 'RunwayDirectionLightSystem', chart: l, cur: { p: { position: LPOS[l.kind], colour: l.kind === 'EDGE' ? 'WHITE' : '' } } }; });
          if (!inferL) return d.lights;
          var l = ['EDGE', 'THR', 'END'].map(function (pos) { return { k: 'RunwayDirectionLightSystem', cur: { p: { position: pos, colour: pos === 'EDGE' ? 'WHITE' : '' } } }; });
          if (ilsD[d.des]) l.push({ k: 'ApproachLightingSystem', cur: { p: { classICAO: 'CAT1', length: { v: '900', u: 'M' } } } });
          return l;
        }
        if (inferL) { curInfer = 'lighting of a precision approach runway CAT I (Annex 14 5.3), an ILS serves RWY ' + Object.keys(ilsD).join(', '); notes.push(c.code + ' ' + r.des + ': no lighting in the AIP; CAT I lighting inferred from the ILS (labelled inferred)'); }
        // lights declared in the AIP (AD 2.14): each light where the AIP gives it, otherwise at the Annex 14 spacing
        if (opt.lights && e1 && e2 && r.wid) {
          var did = {};
          [[d1, e1, e2], [d2, e2, e1]].forEach(function (x) {
            var d = x[0]; if (!d) return;
            var brg = bearing(x[1], x[2]), Lr = Math.hypot.apply(null, plane(x[1]).fwd(x[2])), thrP = pt(d, /^DISTHR$/) || pt(d, /^THR$/) || x[1], F4 = frame(thrP, brg), Ft = frame(x[1], brg);
            var Ld = Math.hypot.apply(null, plane(thrP).fwd(x[2]));
            lightsOf(d).forEach(function (ls, li) {
              var p = ls.cur.p, pos = s(p.position), col = s(p.colour), given = [], was1 = curChart;
              if (ls.chart) curChart = (ls.k === 'ApproachLightingSystem' && ls.chart.cls ? ls.chart.cls + ' ' : '') + AMDBDOC.LNAME[ls.chart.kind] + ' of RWY ' + d.des + ' as published; light positions at the ICAO Annex 14 standard layout';
              arr(p.element).forEach(function (el) { var lc = el && arr(el.location)[0]; if (lc && lc._geo && lc._geo.t === 'P') given.push(lc._geo.c); });
              var use = ls.k === 'ApproachLightingSystem' ? '9' : { EDGE: '2', CL: '3', THR: '4', DTHR: '4', TDZ: '5', END: '8', REIL: '8' }[pos];
              if (!use) return;
              var spots = given.slice();
              if (!spots.length) {
                if (ls.k === 'ApproachLightingSystem') {
                  // Annex 14 Vol I 5.3.4: precision CAT I — centre line 900 m, crossbar at 300 m; CAT II/III — also red side
                  // row barrettes over the inner 270 m and a crossbar at 150 m; simple systems 420 m
                  var cls = s(p.classICAO) + ' ' + s(p.type), cat23 = /CAT2|CAT3|CAT23|ALSF2|ALSAF/.test(cls), simple = /SALS|SIMPLE|ODALS|MALS(?!R)|NON/.test(cls) && !/CAT/.test(cls);
                  var al = meters(p.length) || (simple ? 420 : 900);
                  for (var a1 = 30; a1 <= al; a1 += 30) [-2, 0, 2].forEach(function (o4) { spots.push(F4.pt(-a1, o4)); }); // centre line barrettes of 3 (5 lights in the standard)
                  for (var cb = -15; cb <= 15.1; cb += 3) if (Math.abs(cb) > 3) spots.push(F4.pt(-300, cb));
                  if (cat23) {
                    for (var cb2 = -7.5; cb2 <= 7.6; cb2 += 3) if (Math.abs(cb2) > 3) spots.push(F4.pt(-150, cb2));
                    for (var sr = 30; sr <= 270; sr += 30) [-1, 1].forEach(function (sg) { [0, 1.5, 3].forEach(function (o5) { spots.push(F4.pt(-sr, sg * (9 + o5))); }); });
                  }
                }
                else if (pos === 'EDGE') { if (did.edge) return; did.edge = 1; for (var e3 = 0; e3 <= Lr + 0.1; e3 += 60) { spots.push(Ft.pt(e3, -r.wid / 2 - 1.5)); spots.push(Ft.pt(e3, r.wid / 2 + 1.5)); } }
                else if (pos === 'CL') { if (did.cl) return; did.cl = 1; for (var c3 = 15; c3 < Lr; c3 += 30) spots.push(Ft.pt(c3, 0)); }
                else if (pos === 'TDZ') { var ap2 = aiming(Ld); for (var z3 = 60; z3 <= Math.min(900, Ld / 2); z3 += 30) [-1, 1].forEach(function (sg) { [0, 1.5, 3].forEach(function (o3) { spots.push(F4.pt(z3, sg * (ap2.gap / 2 + o3))); }); }); }
                else if (pos === 'THR' || pos === 'DTHR') { for (var t3 = -r.wid / 2; t3 <= r.wid / 2 + 0.1; t3 += 3) spots.push(F4.pt(0, t3)); }
                else { for (var n3 = -r.wid / 2; n3 <= r.wid / 2 + 0.1; n3 += 6) spots.push(Ft.pt(Lr, n3)); }
              }
              spots.forEach(function (c3, k3) {
                var lf = push(base('AerodromeSurfaceLighting', 'lgt-' + d.des + '-' + li + '-' + k3, !given.length)); lf.g = [{ t: 'P', c: c3 }];
                var v3 = plane(thrP).fwd(c3), sAl = -(v3[0] * Math.sin(brg * D2R) + v3[1] * Math.cos(brg * D2R)), lAt = Math.abs(v3[0] * Math.cos(brg * D2R) - v3[1] * Math.sin(brg * D2R));
                lf.a.lgtuse = { v: ls.k === 'ApproachLightingSystem' && lAt > 3 && (Math.abs(sAl - 300) < 1 || Math.abs(sAl - 150) < 1) ? '10' : use };
                var cc = { YELLOW: '0', ORANGE: '1', BLUE: '2', WHITE: '3' }[col]; if (cc) lf.a.color = { v: cc };
                lf.a.status = { v: '1' }; lf.label = d.des + ' ' + (ls.k === 'ApproachLightingSystem' ? 'approach' : pos) + ' light';
              });
              curChart = was1;
            });
          });
        }
        curInfer = ''; curChart = '';
        // thresholds the State's charts publish where the AIP data set gives none with a position
        if (K && !heli) [[d1, K1], [d2, K2]].forEach(function (x) {
          var d = x[0], R = x[1]; if (!d || !R || d.pts.some(function (q) { return /THR$/.test(q.role) && q.c; })) return;
          [[R.thr, '', '0'], [R.dthr, '-d', '1']].forEach(function (y) {
            if (!y[0]) return;
            var dd = d.pts.reduce(function (o, p) { Object.keys(p.dd).forEach(function (k) { o[k] = p.dd[k]; }); return o; }, {});
            var t = push(base('RunwayThreshold', 'thr-' + d.des + y[1])); t.g = [{ t: 'P', c: y[0] }]; t.label = d.des; t.a.idthr = { v: d.des }; t.a.thrtype = { v: y[2] }; t.a.status = { v: '1' };
            if (!isNaN(d.brg)) t.a.brngtrue = { v: r2(d.brg) };
            ['TORA', 'TODA', 'ASDA', 'LDA'].forEach(function (k) { if (dd[k] !== undefined) t.a[k.toLowerCase()] = { v: r2(dd[k]), u: 'M' }; });
            t.a.source = { v: srcC((y[2] === '1' ? 'displaced ' : '') + 'threshold position as published') }; t.chartThr = 1;
          });
        });
        // runway from OpenStreetMap: a threshold at each end (the AIP gives none with a position)
        if (curOsm && e1 && e2 && !heli) [[d1, e1, e2], [d2, e2, e1]].forEach(function (x) {
          var d = x[0]; if (!d || d.pts.some(function (q) { return /THR$/.test(q.role) && q.c; }) || (kdes(d) && kdes(d).thr)) return;
          var dd = d.pts.reduce(function (o, p) { Object.keys(p.dd).forEach(function (k) { o[k] = p.dd[k]; }); return o; }, {}), el2 = d.pts.filter(function (q) { return q.elev !== null; })[0];
          var t = push(base('RunwayThreshold', 'thr-' + d.des)); t.g = [{ t: 'P', c: x[1] }]; t.label = d.des; t.a.idthr = { v: d.des }; t.a.thrtype = { v: '0' }; t.a.brngtrue = { v: r2(bearing(x[1], x[2])) }; t.a.status = { v: '1' };
          t.a.source = { v: (srcO(false) + '; threshold at the runway end').slice(0, 254) };
          if (el2) t.a.elev = { v: r2(el2.elev), u: 'M' };
          ['TORA', 'TODA', 'ASDA', 'LDA'].forEach(function (k) { if (dd[k] !== undefined) t.a[k.toLowerCase()] = { v: r2(dd[k]), u: 'M' }; });
        });
        curOsm = null;
        // thresholds and every runway centre line point published
        r.dirs.forEach(function (d) {
          var dd = d.pts.reduce(function (o, p) { Object.keys(p.dd).forEach(function (k) { o[k] = p.dd[k]; }); return o; }, {});
          d.pts.forEach(function (p, i) {
            if (!p.c) return;
            if (/THR$/.test(p.role)) {
              var t = push(base(heli ? 'HelipadThreshold' : 'RunwayThreshold', 'thr-' + d.des + (p.role === 'DISTHR' ? '-d' : ''))); t.g = [{ t: 'P', c: p.c }]; t.label = d.des;
              t.a.idthr = { v: d.des };
              if (!heli) { t.a.thrtype = { v: p.role === 'DISTHR' ? '1' : '0' }; if (!isNaN(d.brg)) t.a.brngtrue = { v: r2(d.brg) }; var mb = parseFloat(s(d.rec.cur.p.magneticBearing)); if (!isNaN(mb)) t.a.brngmag = { v: r2(mb) }; var tz = meters(d.rec.cur.p.elevationTDZ); if (tz !== null) t.a.tdze = { v: r2(tz), u: 'M' }; ['TORA', 'TODA', 'ASDA', 'LDA'].forEach(function (k) { if (dd[k] !== undefined) t.a[k.toLowerCase()] = { v: r2(dd[k]), u: 'M' }; }); }
              t.a.status = { v: '1' };
              if (p.elev !== null) t.a.elev = { v: r2(p.elev), u: 'M' };
            }
            if (!heli) { var cp = push(base('RunwayCenterlinePoint', 'clp-' + d.des + '-' + i + '-' + (p.role || 'pt'))); cp.g = [{ t: 'P', c: p.c }]; cp.a.idrwy = { v: idrwy }; if (p.elev !== null) cp.a.elev = { v: r2(p.elev), u: 'M' }; cp.label = d.des + ' ' + (p.role || ''); }
          });
        });
      });
      curSchem = false;
      // runway intersections
      for (var i = 0; i < rwyRings.length; i++) for (var j = i + 1; j < rwyRings.length; j++) {
        var x = clip(rwyRings[i].ring, rwyRings[j].ring);
        if (x) { var ri = push(base('RunwayIntersection', 'rwi-' + rwyRings[i].id + '-' + rwyRings[j].id)); ri.g = [{ t: 'A', c: [x] }]; ri.a.idrwi = { v: (rwyRings[i].id + '_' + rwyRings[j].id).slice(0, 16) }; ri.a.status = { v: '1' }; surfAttrs(ri.a, rwyRings[i].sp, 'surftype', SURF_RWY); ri.label = rwyRings[i].id + ' × ' + rwyRings[j].id; }
      }
      // what the AIP gives with its own geometry: taxiways, aprons, guidance lines, holding positions, stands, de-icing, works, TLOF
      function geo(r) { try { return M.geometry(ds, r); } catch (e) { return null; } }
      function parts(g, t) { return !g ? [] : g.t === 'M' ? g.parts.filter(function (p) { return p.t === t; }) : g.t === t ? [g] : []; }
      function nameOf(rec, prop) { var t = rec && M.target(ds, rec.cur.p[prop]); return t ? s(t.cur.p.designator) || s(t.cur.p.name) : ''; }
      var twyDone = new Set();
      c.by.TaxiwayElement.forEach(function (te, k) { parts(geo(te), 'A').forEach(function (g, m) { var f = push(base('TaxiwayElement', 'twy-' + k + '-' + m)); f.g = [g]; var tw = M.target(ds, te.cur.p.associatedTaxiway); if (tw) twyDone.add(tw); f.a.idlin = { v: nameOf(te, 'associatedTaxiway') || '' }; surfAttrs(f.a, arr(te.cur.p.surfaceProperties)[0] || (tw && arr(tw.cur.p.surfaceProperties)[0]), 'gsurftyp', SURF_GND); f.a.status = { v: '1' }; f.label = f.a.idlin.v; if (!f.a.idlin.v) delete f.a.idlin; }); });
      c.by.ApronElement.forEach(function (ae, k) { parts(geo(ae), 'A').forEach(function (g, m) { var f = push(base('ApronElement', 'apn-' + k + '-' + m)); f.g = [g]; var an = nameOf(ae, 'associatedApron'); if (an) f.a.idapron = { v: an }; var ap2 = M.target(ds, ae.cur.p.associatedApron); surfAttrs(f.a, arr(ae.cur.p.surfaceProperties)[0] || (ap2 && arr(ap2.cur.p.surfaceProperties)[0]), 'gsurftyp', SURF_GND); f.a.status = { v: '1' }; f.a.aprontyp = { v: '1' }; f.label = an; }); });
      c.by.GuidanceLine.forEach(function (gl, k) {
        var stand = /STAND|GATE|TLINE/.test(s(gl.cur.p.type)) || !!gl.cur.p.connectedStand, tw = M.target(ds, gl.cur.p.connectedTaxiway);
        parts(geo(gl), 'L').forEach(function (g, m) {
          var f = push(base(stand ? 'StandGuidanceLine' : 'TaxiwayGuidanceLine', 'gl-' + k + '-' + m)); f.g = [g]; f.a.status = { v: '1' }; f.a.color = { v: '0' }; f.a.style = { v: '0' };
          if (stand) { var st = nameOf(gl, 'connectedStand'); if (st) f.a.idstd = { v: st }; f.label = st; } else { var tn = (tw && s(tw.cur.p.designator)) || s(gl.cur.p.designator); if (tn) f.a.idlin = { v: tn }; f.label = tn; }
          // a taxiway with a width but no taxiway element: its surface along the guidance line
          if (!stand && opt.taxiways && tw && !twyDone.has(tw)) {
            var tw2 = meters(tw.cur.p.width);
            if (tw2 && tw2 > 5) { var ring = widen(g.c, tw2); if (ring) { var te2 = push(base('TaxiwayElement', 'twyw-' + k + '-' + m)); te2.g = [{ t: 'A', c: [ring] }]; te2.a.idlin = { v: s(tw.cur.p.designator) || '' }; surfAttrs(te2.a, arr(tw.cur.p.surfaceProperties)[0], 'gsurftyp', SURF_GND); te2.a.status = { v: '1' }; te2.label = te2.a.idlin.v; } }
          }
        });
      });
      // holding positions: a line across the taxiway, parallel to the runway it protects
      c.by.TaxiHoldingPosition.forEach(function (hp, k) {
        var p0 = M.pointOf(ds, hp); if (!p0) return;
        var pr = M.target(ds, hp.cur.p.protectedRunway), rw = c.rwys.filter(function (x) { return x.rec === pr; })[0] || c.rwys[0], brg = rw && !isNaN(rw.dirs[0] && rw.dirs[0].brg) ? rw.dirs[0].brg : 0;
        var gl = M.target(ds, hp.cur.p.associatedGuidanceLine), tw = gl && M.target(ds, gl.cur.p.connectedTaxiway), wd = (tw && meters(tw.cur.p.width)) || 23;
        var f = push(base('TaxiwayHoldingPosition', 'hp-' + k)); f.g = [{ t: 'L', c: [along(p0, brg, wd / 2 + 3), along(p0, (brg + 180) % 360, wd / 2 + 3)] }];
        var cat = s(hp.cur.p.landingCategory).replace(/^OTHER:/, '');
        f.a.catstop = { v: /III/.test(cat) ? '4' : /II/.test(cat) ? '3' : /I/.test(cat) ? '1' : '0' }; f.a.marktype = { v: /II/.test(cat) ? '1' : '0' }; f.a.holddir = { v: '0' }; f.a.status = { v: '1' };
        if (tw && s(tw.cur.p.designator)) f.a.idlin = { v: s(tw.cur.p.designator) };
        if (rw) f.a.rwyahtxt = { v: rw.des.replace('/', '-') };
        f.label = (f.a.idlin ? f.a.idlin.v + ' ' : '') + (cat || 'holding position');
        if (opt.lights) (ds.rev.get(hp) || []).filter(function (y) { return y[1].k === 'TaxiHoldingPositionLightSystem' && !y[1].cur.gone; }).forEach(function (y, q) {
          [wd / 2 + 3, -(wd / 2 + 3)].forEach(function (off, q2) { var g2 = push(base('AerodromeSurfaceLighting', 'rgl-' + k + '-' + q + '-' + q2, true)); g2.g = [{ t: 'P', c: along(p0, off > 0 ? brg : (brg + 180) % 360, Math.abs(off)) }]; g2.a.lgtuse = { v: '7' }; g2.a.color = { v: '0' }; g2.a.status = { v: '1' }; g2.label = 'runway guard light'; });
        });
      });
      c.stands.forEach(function (x) { var f = push(base('ParkingStandLocation', 'std-' + (s(x.cur.p.designator) || x.id))); f.g = [{ t: 'P', c: M.pointOf(c.ds, x) }]; if (s(x.cur.p.designator)) f.a.idstd = { v: s(x.cur.p.designator) }; f.label = s(x.cur.p.designator); });
      c.by.AircraftStand.forEach(function (x, k) { parts(geo(x), 'A').concat(x.cur.p.extent ? parts(M.geometry(ds, { k: 'x', cur: { p: { extent: x.cur.p.extent } } }), 'A') : []).slice(0, 1).forEach(function (g) { var f = push(base('ParkingStandArea', 'sta-' + k)); f.g = [g]; if (s(x.cur.p.designator)) f.a.idstd = { v: s(x.cur.p.designator) }; f.a.status = { v: '1' }; f.label = s(x.cur.p.designator); }); });
      c.by.DeicingArea.forEach(function (x, k) { parts(geo(x), 'A').forEach(function (g) { var f = push(base('DeicingArea', 'dia-' + k)); f.g = [g]; f.a.ident = { v: s(x.cur.p.designator) || 'DEICE' + (k + 1) }; f.a.status = { v: '1' }; f.label = f.a.ident.v; }); });
      c.by.WorkArea.forEach(function (x, k) { parts(geo(x), 'A').forEach(function (g) { var f = push(base('ConstructionArea', 'wka-' + k)); f.g = [g]; f.label = 'work area'; }); });
      c.by.TouchDownLiftOff.forEach(function (x, k) {
        var g = parts(geo(x), 'A')[0], p0 = M.pointOf(ds, x), L4 = meters(x.cur.p.length), W4 = meters(x.cur.p.width) || L4;
        if (!g && p0 && L4) { var F5 = frame(p0, 0); g = { t: 'A', c: [F5.box(-L4 / 2, L4 / 2, -W4 / 2, W4 / 2)] }; }
        if (!g) return;
        var f = push(base('TouchDownLiftOffArea', 'tlof-' + k)); f.g = [g]; f.a.idrwy = { v: s(x.cur.p.designator) || 'H' + (k + 1) }; f.a.status = { v: '1' }; f.label = 'TLOF ' + f.a.idrwy.v;
      });
      // obstacles of the aerodrome (AD 2.10)
      if (opt.obstacles) c.obs.forEach(function (v, k) {
        var vds = c.dsOf.get(v) || ds, p = v.cur.p, part = arr(p.part)[0] || {}, g = null, ty = s(part.type || p.type).replace(/^OTHER:/, '');
        try { g = M.geometry(vds, v); } catch (e) { g = null; }
        var h = meters(part.verticalExtent), pnt = M.pointOf(vds, v) || gcentre(g), area = parts(g, 'A')[0], line = parts(g, 'L')[0];
        var elv = null; arr(part.horizontalProjection_location || part.horizontalProjection).forEach(function (hp2) { var e = hp2 && (hp2.elevation || (hp2.location && hp2.location.elevation)); if (e && elv === null) elv = meters(e); });
        var f;
        if (area) { f = push(base('VerticalPolygonalStructure', 'vs-' + k)); f.g = [area]; f.a.plysttyp = { v: VS_PLY[ty] || '4' }; }
        else if (line) { f = push(base('VerticalLineStructure', 'vs-' + k)); f.g = [line]; }
        else if (pnt) { f = push(base('VerticalPointStructure', 'vs-' + k)); f.g = [{ t: 'P', c: pnt }]; f.a.pntsttyp = { v: VS_PNT[ty] || '3' }; }
        else return;
        if (h !== null) f.a.height = { v: r2(h), u: 'M' };
        if (elv !== null) f.a.elev = { v: r2(elv), u: 'M' };
        f.label = (s(p.name) || ty || 'obstacle') + (h !== null ? ' ' + Math.round(h) + ' m' : '');
        f.a.source = { v: ('From ' + vds.name + ': position and height as published').slice(0, 254) };
      });
      // navaid antennas of the aerodrome (AD 2.19 / ENR 4.1): ILS localizer and glide path, DME, VOR, NDB, markers
      if (opt.obstacles) c.navs.forEach(function (n, k) {
        var nds = c.dsOf.get(n) || ds, p = n.cur.p, f = push(base('VerticalPointStructure', 'nav-' + k)); f.g = [{ t: 'P', c: M.pointOf(nds, n) }]; f.a.pntsttyp = { v: '9' }; f.a.source = { v: ('From ' + nds.name + ': navaid position as published').slice(0, 254) };
        var loc = arr(p.location)[0], e = loc && loc.elevation ? meters(loc.elevation) : null; if (e !== null) f.a.elev = { v: r2(e), u: 'M' };
        f.label = n.k.replace('Glidepath', 'GP').replace('Localizer', 'LOC').replace('MarkerBeacon', 'Marker') + ' ' + (s(p.designator) || s(p.name) || '');
      });
      // aerodrome beacons and other ground lights (AD 2.15)
      if (opt.obstacles) c.lights.forEach(function (n, k) { var f = push(base('VerticalPointStructure', 'agl-' + k)); f.g = [{ t: 'P', c: M.pointOf(c.dsOf.get(n) || ds, n) }]; f.a.pntsttyp = { v: /BEACON|ABN|IBN/.test(s(n.cur.p.type)) ? '8' : '7' }; f.label = s(n.cur.p.name) || s(n.cur.p.type) || 'light'; });
      // taxiways and aprons named in AD 2.8 without any geometry: listed, so the user knows what to survey
      var noGeo = c.by.Taxiway.filter(function (x) { return !c.by.TaxiwayElement.some(function (e) { return M.target(ds, e.cur.p.associatedTaxiway) === x; }) && !c.by.GuidanceLine.some(function (g) { return M.target(ds, g.cur.p.connectedTaxiway) === x; }); }).map(function (x) { return 'TWY ' + s(x.cur.p.designator); })
        .concat(c.by.Apron.filter(function (x) { return !c.by.ApronElement.some(function (e) { return M.target(ds, e.cur.p.associatedApron) === x; }); }).map(function (x) { return 'apron ' + (s(x.cur.p.name) || s(x.cur.p.designator)); }));
      if (noGeo.length) notes.push(c.code + ': named in AD 2.8 without position or shape (cannot be drawn): ' + noGeo.join(', '));
      // runways mapped in OpenStreetMap that the AIP does not list
      osmRw.forEach(function (o) {
        if (usedRw[o.id] || c.rwys.some(function (r) { return AMDBOSM_des(r.des).some(function (x) { return o.des.indexOf(x) >= 0; }); })) return;
        var w = o.width || CODE.maxW || 45, rg = rect(o.ends[0], o.ends[1], w); if (!rg) return;
        var f = push(base('RunwayElement', 'rwy-osm-' + o.id.replace(/\W/g, ''))); f.g = [{ t: 'A', c: [rg] }]; f.a.idrwy = { v: (o.des.join('.') || o.ref || 'RWY').slice(0, 16) }; f.a.status = { v: '1' };
        f.a.source = { v: ('OpenStreetMap contributors (ODbL 1.0), ' + o.id + ': runway traced by volunteers, not listed in the AIP; width ' + (o.width ? 'as tagged' : w + ' m assumed') + ', coarse quality').slice(0, 254) };
        f.label = f.a.idrwy.v; rwInfo.push({ e1: o.ends[0], e2: o.ends[1], id: f.a.idrwy.v, des: o.ref, wid: w, prec: false });
      });
      // stands the State's charts publish (parking / docking chart, AD 2.8 tables), checked: as published
      var aipStd = c.stands.map(function (x) { return { id: s(x.cur.p.designator).toUpperCase(), c: M.pointOf(c.ds, x) }; });
      if (K && K.stands.length) {
        var nC = 0;
        K.stands.forEach(function (x, k) {
          if (aipStd.some(function (a) { return (x.id && a.id === x.id) || (a.c && Math.hypot.apply(null, plane(a.c).fwd(x.c)) < 25); })) return;
          var sf = push(base('ParkingStandLocation', 'stc-' + (x.id || k))); sf.g = [{ t: 'P', c: x.c }]; if (x.id) sf.a.idstd = { v: x.id }; sf.label = x.id; nC++;
          sf.a.source = { v: srcC('stand position as published') }; sf.chart = 1;
        });
        notes.push(c.code + ': ' + nC + ' stand(s) placed as published on the State\'s chart' + (K.standsLeft.length ? '; ' + K.standsLeft.length + ' left out — ' + K.standsLeft.slice(0, 4).map(function (x) { return x.why; }).join('; ') : ''));
      }
      // what the user traced on imagery (Trace tab): taxiways, aprons, stands, holding positions, buildings …
      var traced = opt.traced && typeof AMDBTRACE !== 'undefined' ? AMDBTRACE.features(c.code) : [];
      traced.forEach(function (x, k) { var tf = push(base(x.t, 'trc-' + k)); tf.g = x.g; Object.keys(x.a).forEach(function (a) { tf.a[a] = x.a[a]; }); tf.a.source = { v: String(x.src).slice(0, 254) }; tf.label = x.label || ''; tf.traced = 1; });
      if (traced.length) notes.push(c.code + ': ' + traced.length + ' feature(s) traced on imagery');
      function sameStand(ref, at) { ref = String(ref || '').toUpperCase(); return feats.some(function (f) { return f.ad === c.code && (f.chart || f.traced) && f.t === 'ParkingStandLocation' && ((ref && f.a.idstd && String(f.a.idstd.v).toUpperCase() === ref) || Math.hypot.apply(null, plane(at).fwd(f.g[0].c)) < 25); }) || aipStd.some(function (a) { return (ref && a.id === ref) || (a.c && Math.hypot.apply(null, plane(at).fwd(a.c)) < 25); }); }
      // OpenStreetMap: what the AIP data set does not give (the AIP is kept wherever it gives a feature type)
      var taxiLines = [];
      if (osm) {
        var KEEP = /^(TaxiwayElement|ApronElement|TaxiwayGuidanceLine|StandGuidanceLine|TaxiwayHoldingPosition|ParkingStandLocation|ParkingStandArea|Stopway|TouchDownLiftOffArea|Blastpad|DeicingArea|ServiceRoad|Water)$/;
        var have = {}; feats.forEach(function (f) { if (f.ad === c.code && !f.osm && !f.chart && !f.traced && KEEP.test(f.t)) have[f.t] = (have[f.t] || 0) + 1; });
        var tracedRef = {}; traced.forEach(function (x) { if (x.t === 'TaxiwayGuidanceLine' && x.a.idlin) tracedRef[String(x.a.idlin.v).toUpperCase()] = 1; });
        var H = { base: function (t2, key) { return base(t2, key); }, plane: plane, widen: widen, along: along, centre: gcentre, have: have, letter: CODE.letter, codeTwyWidth: TWYW[CODE.letter], rwyWidth: CODE.maxW,
          twyWidth: function (ref) { return ref && c.twyW[ref] ? c.twyW[ref] : K && ((ref && K.twyW[ref]) || K.twyW['*']) || null; },
          twyWidthFrom: function (ref) { return ref && c.twyW[ref] ? 'the AIP' : 'the State\'s chart'; },
          dupStand: sameStand, skipTaxi: function (ref) { return !!(ref && tracedRef[String(ref).toUpperCase()]); } };
        var oc = AMDBOSM.convert(c, osm, H);
        // an OSM stand whose number the State's chart also gives: confirmed by the chart
        var named = K ? K.standNames.concat(K.stands.map(function (x) { return x.id; })) : [];
        oc.features.forEach(function (f) { if (named.length && f.t === 'ParkingStandLocation' && f.a.idstd && named.indexOf(String(f.a.idstd.v).toUpperCase()) >= 0) f.a.source.v = (f.a.source.v + '; number on the State\'s chart').slice(0, 254); push(f); });
        if (K && K.twyNames.length) { var oref = {}; oc.taxi.forEach(function (t) { String(t.ref || '').toUpperCase().split(/[;,]/).forEach(function (x) { oref[x.trim()] = 1; }); }); var miss = K.twyNames.filter(function (x) { return !oref[x] && !tracedRef[x]; }); if (miss.length) notes.push(c.code + ': taxiways named on the State\'s chart that no OpenStreetMap line is named after (' + oc.taxi.length + ' lines, ' + oc.taxi.filter(function (t) { return t.ref; }).length + ' named): TWY ' + miss.slice(0, 20).join(', ') + (miss.length > 20 ? ' …' : '') + ' — name or trace them (Trace on imagery)'); }
        if (opt.network) AMDBOSM.network(c, osm, H, function (f) { return AMDBOSM.uuid(f.id); }).forEach(push);
        notes.push(c.code + ': ' + oc.features.length + ' feature(s) from OpenStreetMap (' + osm.src.name + ', ' + AMDBOSM.ATTR + ')');
      }
      feats.forEach(function (f) { if (f.ad === c.code && f.t === 'TaxiwayGuidanceLine' && f.g[0] && f.g[0].t === 'L') taxiLines.push({ c: f.g[0].c, ref: f.a.idlin ? f.a.idlin.v : '' }); });
      // holding positions where a taxiway reaches the runway-holding distance of ICAO Annex 14 Table 3-2 (inferred)
      if (opt.infer && taxiLines.length && rwInfo.length) {
        var holds = feats.filter(function (f) { return f.ad === c.code && f.t === 'TaxiwayHoldingPosition'; }).map(function (f) { return gcentre(f.g[0]); }).filter(Boolean), nH = 0;
        rwInfo.forEach(function (rw) {
          var Dh = rw.prec ? (CODE.num >= 3 ? 90 : 60) : (CODE.num >= 3 ? 75 : 40), P = plane(rw.e1), A = P.fwd(rw.e2), L = Math.hypot(A[0], A[1]), rb = bearing(rw.e1, rw.e2);
          taxiLines.forEach(function (tl) {
            var pts = tl.c.filter(function (q) { return q && typeof q[0] === 'number'; }).map(function (q) { var v = P.fwd(q); return { q: q, s: (v[0] * A[0] + v[1] * A[1]) / L, d: Math.abs(v[0] * A[1] - v[1] * A[0]) / L }; });
            for (var i = 0; i < pts.length - 1; i++) {
              var a = pts[i], b = pts[i + 1];
              if ((a.d - Dh) * (b.d - Dh) > 0 || a.d === b.d) continue;
              var k = (Dh - a.d) / (b.d - a.d), sA = a.s + (b.s - a.s) * k;
              if (sA < -60 || sA > L + 60) continue;
              var at = [a.q[0] + (b.q[0] - a.q[0]) * k, a.q[1] + (b.q[1] - a.q[1]) * k], Pq = plane(at);
              if (holds.some(function (h) { var v = Pq.fwd(h); return Math.hypot(v[0], v[1]) < 60; })) continue;
              holds.push(at);
              var w = (tl.ref && c.twyW[tl.ref]) || TWYW[CODE.letter];
              curInfer = 'holding position ' + Dh + ' m from the runway centre line (Annex 14 Table 3-2, ' + (rw.prec ? 'precision approach' : 'non-precision / non-instrument') + ', code ' + CODE.num + ')';
              var f = push(base('TaxiwayHoldingPosition', 'hpi-' + (++nH))); f.g = [{ t: 'L', c: [along(at, rb, w / 2 + 3), along(at, (rb + 180) % 360, w / 2 + 3)] }];
              f.a.catstop = { v: rw.prec ? '1' : '0' }; f.a.marktype = { v: '0' }; f.a.holddir = { v: '0' }; f.a.status = { v: '1' }; f.a.rwyahtxt = { v: String(rw.des || rw.id).replace('/', '-').slice(0, 254) };
              if (tl.ref) f.a.idlin = { v: tl.ref };
              f.label = (tl.ref ? tl.ref + ' ' : '') + 'holding position (inferred)';
              curInfer = '';
            }
          });
        });
        if (nH) notes.push(c.code + ': ' + nH + ' holding position(s) inferred where taxiways reach the Annex 14 runway-holding distance');
      }
      if (!c.by.TaxiwayElement.length && !c.by.GuidanceLine.length && !osm) notes.push(c.code + ': the AIP data set has no taxiway, apron or guidance line geometry — add survey, CAD or GIS files for them');
    });
    // a shape that could not be derived (two points at the same position …) is left out
    function okGeom(g) { if (!g || !g.c) return false; if (g.t === 'P') return typeof g.c[0] === 'number' && typeof g.c[1] === 'number'; if (g.t === 'L') return g.c.length > 1 && g.c.every(function (q) { return q && typeof q[0] === 'number'; }); if (g.t === 'A') return g.c.length > 0 && g.c.every(function (r) { return r && r.length > 3 && r.every(function (q) { return q && typeof q[0] === 'number' && isFinite(q[0]) && isFinite(q[1]); }); }); return false; }
    var good = feats.filter(function (f) { return f.g && f.g.length && f.g.every(okGeom); });
    if (good.length < feats.length) notes.push((feats.length - good.length) + ' derived shape(s) left out (degenerate geometry in the source, e.g. two points at the same position)');
    return { features: good, notes: notes };
  }

  /* ------------------------------------------------------------------ import */
  var TYPES = null;
  function typeOf(name) {
    if (!TYPES) { TYPES = {}; Object.keys(M.amxmDict().features).forEach(function (t) { TYPES[t.toLowerCase()] = t; }); }
    return TYPES[String(name || '').replace(/_(point|line|area|polygon|pnt)$/i, '').replace(/[\s_-]/g, '').toLowerCase()] || null;
  }
  function attrsFrom(o) {
    var a = {};
    Object.keys(o || {}).forEach(function (k) { var v = o[k]; if (v === null || v === undefined || v === '' || typeof v === 'object') return; a[k] = { v: String(v).replace(/^(-?[\d.]+(?:[eE][-+]?\d+)?) [A-Za-z%]+$/, '$1') }; });
    if (a.aerodrome && !a.idarpt) a.idarpt = a.aerodrome;
    return a;
  }
  function feature(t, props, g, name) {
    var a = attrsFrom(props);
    return { t: t, a: a, g: g, ad: (a.idarpt && a.idarpt.v) || '', id: (a.aixm_uuid && a.aixm_uuid.v) || (a.idnumber && a.idnumber.v) || '', label: '', src: 'AMXM', name: name };
  }
  function gjGeoms(g) {
    if (!g) return [];
    switch (g.type) {
      case 'Point': return [{ t: 'P', c: g.coordinates.slice(0, 2) }];
      case 'LineString': return [{ t: 'L', c: g.coordinates.map(function (p) { return p.slice(0, 2); }) }];
      case 'Polygon': return [{ t: 'A', c: g.coordinates.map(function (r) { return r.map(function (p) { return p.slice(0, 2); }); }) }];
      case 'MultiPoint': case 'MultiLineString': case 'MultiPolygon': return g.coordinates.reduce(function (o, c) { return o.concat(gjGeoms({ type: g.type.slice(5), coordinates: c })); }, []);
      case 'GeometryCollection': return g.geometries.reduce(function (o, x) { return o.concat(gjGeoms(x)); }, []);
      default: return [];
    }
  }
  function fromGeoJSON(text, name) {
    var j = JSON.parse(text), feats = [], skipped = 0;
    if (j.crs && j.crs.properties && !/4326|CRS84/i.test(JSON.stringify(j.crs))) throw new Error('the GeoJSON is not in WGS 84 (' + JSON.stringify(j.crs.properties).slice(0, 60) + ')');
    var fileType = typeOf(String(name).replace(/\.[^.]+$/, '').split(/[_ ]/).pop());
    (j.type === 'FeatureCollection' ? j.features : j.type === 'Feature' ? [j] : []).forEach(function (f) {
      var p = f.properties || {}, t = typeOf(p.amxm_type) || typeOf(p.feature_type) || typeOf(p.layer) || typeOf(p.type) || fileType, g = gjGeoms(f.geometry);
      if (!t || !g.length) { skipped++; return; }
      feats.push(feature(t, p, g, name));
    });
    return { features: feats, skipped: skipped };
  }
  function parseWkt(w) {
    w = String(w || '').trim();
    var m = /^(POINT|LINESTRING|POLYGON)\s*(Z|M|ZM)?\s*\(([\s\S]*)\)$/i.exec(w);
    if (!m) return null;
    function pts(t) { return t.split(',').map(function (p) { var n = p.trim().split(/\s+/).map(Number); return [n[0], n[1]]; }); }
    var k = m[1].toUpperCase(), body = m[3];
    if (k === 'POINT') return { t: 'P', c: pts(body)[0] };
    if (k === 'LINESTRING') return { t: 'L', c: pts(body) };
    return { t: 'A', c: body.split(/\)\s*,\s*\(/).map(function (r) { return pts(r.replace(/[()]/g, '')); }) };
  }
  function csvRows(text) {
    var rows = [], row = [], cur = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; continue; }
      if (ch === '"') q = true; else if (ch === ',') { row.push(cur); cur = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; } else cur += ch;
    }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(function (r) { return r.length > 1 || r[0]; });
  }
  // a CSV table with an amxm_type (or a type in the file name) and a WKT geometry column, e.g. the package's tables
  function isCsv(text) { var h = text.split(/\r?\n/).filter(function (l) { return l && l.charAt(0) !== '#'; })[0] || ''; return /(^|,)"?wkt"?(,|$)/i.test(h) && /(^|,)"?(amxm_type|feature_type)"?(,|$)/i.test(h); }
  function fromCsv(text, name) {
    var rows = csvRows(text.split(/\r?\n/).filter(function (l) { return l.charAt(0) !== '#'; }).join('\n')), head = rows.shift().map(function (h) { return h.trim(); }), feats = [], skipped = 0;
    var iw = head.findIndex(function (h) { return /^wkt$/i.test(h); }), it = head.findIndex(function (h) { return /^(amxm_type|feature_type)$/i.test(h); });
    rows.forEach(function (r) {
      var t = typeOf(r[it]), g = parseWkt(r[iw]);
      if (!t || !g) { skipped++; return; }
      var p = {}; head.forEach(function (h, i) { if (i !== iw && i !== it) p[h] = r[i]; });
      feats.push(feature(t, p, [g], name));
    });
    return { features: feats, skipped: skipped };
  }
  // WGS 84 / UTM -> latitude, longitude (Krüger series, inverse)
  function utmInv(E, N, zone, south) {
    var a = 6378137, f = 1 / 298.257223563, k0 = 0.9996, n = f / (2 - f), A1 = a / (1 + n) * (1 + n * n / 4 + n * n * n * n / 64);
    var be = [n / 2 - 2 * n * n / 3 + 37 * n * n * n / 96, n * n / 48 + n * n * n / 15, 17 * n * n * n / 480];
    var de = [2 * n - 2 * n * n / 3 - 2 * n * n * n, 7 * n * n / 3 - 8 * n * n * n / 5, 56 * n * n * n / 15];
    var xi = (N - (south ? 10000000 : 0)) / (k0 * A1), eta = (E - 500000) / (k0 * A1), X = xi, Y = eta;
    for (var j = 1; j <= 3; j++) { X -= be[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta); Y -= be[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta); }
    var chi = Math.asin(Math.sin(X) / Math.cosh(Y)), lat = chi;
    for (j = 1; j <= 3; j++) lat += de[j - 1] * Math.sin(2 * j * chi);
    return [((zone - 1) * 6 - 180 + 3) + Math.atan2(Math.sinh(Y), Math.cos(X)) / D2R, lat / D2R];
  }
  // DXF: POINT, LINE, LWPOLYLINE, POLYLINE / VERTEX on layers named after AMXM feature types, in WGS 84 / UTM (zone
  // from the file name "..._UTM25N.dxf" or the comment written by the package) or in degrees
  function fromDxf(text, name) {
    var L = text.split(/\r?\n/), pairs = [];
    for (var i = 0; i + 1 < L.length; i += 2) pairs.push([parseInt(L[i], 10), L[i + 1].trim()]);
    var zm = /UTM\s*(?:zone\s*)?(\d{1,2})\s*([NS])/i.exec(name) || /UTM zone (\d{1,2})([NS])/i.exec(text.slice(0, 2000));
    var zone = zm ? +zm[1] : 0, south = zm ? /S/i.test(zm[2]) : false;
    function ll(x, y) { return zone ? utmInv(x, y, zone, south) : [x, y]; }
    var ents = [], cur = null, inEnt = false;
    pairs.forEach(function (p) {
      var c = p[0], v = p[1];
      if (c === 2 && v === 'ENTITIES') inEnt = true;
      if (!inEnt) return;
      if (c === 0) { if (cur) ents.push(cur); cur = { k: v, layer: '', pts: [], flag: 0 }; if (v === 'ENDSEC') { inEnt = false; cur = null; } return; }
      if (!cur) return;
      if (c === 8) cur.layer = v; else if (c === 70) cur.flag = +v; else if (c === 10 || c === 11) cur.pts.push([+v, null]); else if ((c === 20 || c === 21) && cur.pts.length) cur.pts[cur.pts.length - 1][1] = +v;
    });
    if (cur) ents.push(cur);
    // POLYLINE ... VERTEX ... SEQEND -> one entity
    var merged = [], poly = null;
    ents.forEach(function (e) {
      if (e.k === 'POLYLINE') { poly = { k: 'POLYLINE', layer: e.layer, flag: e.flag, pts: [] }; return; }
      if (e.k === 'VERTEX' && poly) { poly.pts = poly.pts.concat(e.pts); return; }
      if (e.k === 'SEQEND' && poly) { merged.push(poly); poly = null; return; }
      merged.push(e);
    });
    var feats = [], skipped = 0;
    merged.forEach(function (e) {
      var t = typeOf(e.layer), pts = e.pts.filter(function (p) { return p[1] !== null; }).map(function (p) { return ll(p[0], p[1]); });
      if (!t || !pts.length || (!zone && pts.some(function (p) { return Math.abs(p[0]) > 180 || Math.abs(p[1]) > 90; }))) { skipped++; return; }
      var closed = (e.flag & 1) === 1, def = M.amxmDict().features[t], want = def.attrs.some(function (a) { return a.n === 'geopoly'; }) ? 'A' : def.attrs.some(function (a) { return a.n === 'geoline'; }) ? 'L' : 'P';
      var g = e.k === 'POINT' || pts.length === 1 ? { t: 'P', c: pts[0] } : want === 'A' || closed ? { t: 'A', c: [pts.concat([pts[0]])] } : { t: 'L', c: pts };
      feats.push(feature(t, { idarpt: (/^([A-Z]{4})_/.exec(String(name)) || [])[1] }, [g], name));
    });
    if (!zone && feats.length && feats.every(function (f) { return f.g[0].t === 'P' && Math.abs(f.g[0].c[0]) <= 180; })) { /* degrees */ }
    return { features: feats, skipped: skipped, zone: zone ? zone + (south ? 'S' : 'N') : 'degrees' };
  }
  // a file dropped on Files -> AMXM text, or null when it is not aerodrome mapping
  async function importFile(file) {
    var text = await file.text(), res = null;
    if (/\.(geo)?json$/i.test(file.name)) { try { res = fromGeoJSON(text, file.name); } catch (e) { if (/\.geojson$/i.test(file.name)) throw e; return null; } }
    else if (/\.csv$/i.test(file.name)) { if (!isCsv(text)) return null; res = fromCsv(text, file.name); }
    else if (/\.dxf$/i.test(file.name)) res = fromDxf(text, file.name);
    if (!res || !res.features.length) return res ? { xml: null, features: 0, skipped: res.skipped } : null;
    await LAZY.run('src-amdbpkg');
    return { xml: AMDBPKG.writeAmxm(res.features, 'Read from ' + file.name + (res.zone ? ' (' + (res.zone === 'degrees' ? 'coordinates in degrees' : 'WGS 84 / UTM ' + res.zone) + ')' : '')), features: res.features.length, skipped: res.skipped };
  }

  /* ----------------------------------------------------------------- compare */
  function centroid(g) {
    var pts = g.t === 'P' ? [g.c] : g.t === 'L' ? g.c : g.c[0], x = 0, y = 0;
    pts.forEach(function (p) { x += p[0]; y += p[1]; });
    return [x / pts.length, y / pts.length];
  }
  function vertices(f) { var out = []; f.g.forEach(function (g) { (g.t === 'P' ? [g.c] : g.t === 'L' ? g.c : g.c.reduce(function (o, r) { return o.concat(r); }, [])).forEach(function (p) { out.push(p); }); }); return out; }
  // largest distance (m) from a vertex of one feature to the nearest vertex of the other, both ways
  function shift(a, b) {
    var va = vertices(a), vb = vertices(b);
    if (!va.length || !vb.length) return null;
    var P = AMDB.plane(va[0][0], va[0][1]), A = va.map(P.fwd), B = vb.map(P.fwd);
    function one(X, Y) { var m = 0; X.forEach(function (p) { var d = Infinity; Y.forEach(function (q) { var e = Math.hypot(p[0] - q[0], p[1] - q[1]); if (e < d) d = e; }); if (d > m) m = d; }); return m; }
    return Math.max(one(A, B), one(B, A));
  }
  var SKIP_ATTR = { source: 1, revdate: 1, idnumber: 1, stfeat: 1, stvalid: 1, endvalid: 1, interp: 1, feattype: 1 };
  function attrDiff(a, b) {
    var keys = {}, out = [];
    Object.keys(a.a).concat(Object.keys(b.a)).forEach(function (k) { if (!SKIP_ATTR[k]) keys[k] = 1; });
    Object.keys(keys).sort().forEach(function (k) {
      var x = a.a[k], y = b.a[k], vx = x ? (x.nil ? '(' + x.nil + ')' : x.geo ? 'geo' : x.v) : '', vy = y ? (y.nil ? '(' + y.nil + ')' : y.geo ? 'geo' : y.v) : '';
      if (vx === 'geo' || vy === 'geo') return;
      var nx = parseFloat(vx), ny = parseFloat(vy);
      if (vx !== vy && !(!isNaN(nx) && !isNaN(ny) && Math.abs(nx - ny) < 1e-9 && /^[-\d.eE+]+$/.test(vx) && /^[-\d.eE+]+$/.test(vy))) out.push(k + ': ' + (vx || '—') + ' → ' + (vy || '—'));
    });
    return out;
  }
  function keyOf(f) { var idn = f.src === 'AMXM' && f.a.idnumber && f.a.idnumber.v; return f.t + '|' + (idn || f.id || ''); }
  // features of A (older) and B (newer) -> rows {st: added | removed | moved | changed | same, a, b, shift, attrs}
  function compare(A, B, tol) {
    tol = tol || 0.5;
    var rows = [], used = new Set(), byKey = {};
    B.forEach(function (f, i) { (byKey[keyOf(f)] || (byKey[keyOf(f)] = [])).push(i); });
    var pending = [];
    A.forEach(function (a) { var l = (byKey[keyOf(a)] || []).filter(function (i) { return !used.has(i); }); if (l.length) { used.add(l[0]); rows.push(pair(a, B[l[0]])); } else pending.push(a); });
    // no common identifier (other supplier, AIXM against AMXM): same type and aerodrome, same label or nearest within 50 m
    pending.forEach(function (a) {
      var ca = a.g[0] && centroid(a.g[0]), best = -1, bd = Infinity;
      B.forEach(function (b, i) {
        if (used.has(i) || b.t !== a.t || (b.ad || '') !== (a.ad || '') || !b.g[0] || !ca) return;
        var cb = centroid(b.g[0]), P = AMDB.plane(ca[0], ca[1]), q = P.fwd(cb), d = Math.hypot(q[0], q[1]) - (a.label && b.label && a.label === b.label ? 1e6 : 0);
        if (d < bd) { bd = d; best = i; }
      });
      if (best >= 0 && (bd < 50 || bd < -1e5)) { used.add(best); rows.push(pair(a, B[best])); } else rows.push({ st: 'removed', a: a, b: null, shift: null, attrs: [] });
    });
    B.forEach(function (b, i) { if (!used.has(i)) rows.push({ st: 'added', a: null, b: b, shift: null, attrs: [] }); });
    function pair(a, b) { var sh = shift(a, b), at = attrDiff(a, b), mv = sh !== null && sh > tol; return { st: mv && at.length ? 'moved+changed' : mv ? 'moved' : at.length ? 'changed' : 'same', a: a, b: b, shift: sh, attrs: at }; }
    var n = { added: 0, removed: 0, moved: 0, changed: 0, same: 0 };
    rows.forEach(function (r) { if (r.st === 'moved+changed') { n.moved++; n.changed++; } else n[r.st]++; });
    return { rows: rows, n: n, tol: tol };
  }
  // the changes as AMXM permanent changes (interp 3): added and changed features as in B, removed ones ended (endfeat)
  function changeFile(res, nameA, nameB) {
    var day = new Date().toISOString().slice(0, 19) + 'Z', list = [];
    res.rows.forEach(function (r) {
      if (r.st === 'same') return;
      var f = r.b || r.a, a = Object.assign({}, f.a, { interp: { v: '3' } });
      if (r.st === 'removed') a.endfeat = { v: day };
      list.push(Object.assign({}, f, { a: a, keys: [] }));
    });
    return AMDBPKG.writeAmxm(list, 'Changes from ' + nameA + ' to ' + nameB + ' (' + res.n.added + ' added, ' + res.n.removed + ' removed, ' + res.n.moved + ' moved, ' + res.n.changed + ' changed); permanent changes (interp 3)');
  }

  /* --------------------------------------------------------------------- UI */
  var NOTICE = 'NOT FOR NAVIGATION — for study and analysis only.';
  var G = { pick: null, ack: false, out: '', osmMsg: '', upMsg: '', open: {} }, CMP = { a: -1, b: -1, ad: '', tol: 0.5, res: null, filter: '' };
  // what the AIP data set gives for aerodrome mapping, item by item: available, partly, missing — and what it limits
  var READY = [
    ['arp', 'Aerodrome reference point', 'position of the aerodrome; the frame of everything else', 'AD 2.2 ARP coordinates'],
    ['thr', 'Threshold positions', 'runway surfaces, thresholds, markings, lights', 'AD 2.12 threshold coordinates (WGS 84)'],
    ['ends', 'Runway end / start positions', 'the full runway length (beyond displaced thresholds)', 'AD 2.12 runway end coordinates'],
    ['wid', 'Runway width', 'runway surfaces', 'AD 2.12 dimensions'],
    ['shd', 'Shoulder width', 'runway shoulders', 'AD 2.12 shoulder width (AIXM widthShoulder)'],
    ['dd', 'Declared distances', 'stopways, markings (aiming point, touchdown zone)', 'AD 2.13 TORA / TODA / ASDA / LDA'],
    ['elev', 'Threshold and TDZ elevations', 'elevations of the runway and 3D', 'AD 2.12 threshold and TDZ elevation'],
    ['brg', 'True bearing', 'thresholds; runway orientation without end positions', 'AD 2.12 true bearing'],
    ['surf', 'Surface and strength (PCN)', 'surface type and PCN of the pavement', 'AD 2.12 surface, PCN (or PCR)'],
    ['twy', 'Taxiway geometry', 'taxiway surfaces, guidance lines, labels', 'taxiway elements / guidance lines — survey or CAD'],
    ['apn', 'Apron geometry', 'aprons', 'apron elements — survey or CAD'],
    ['std', 'Stand positions', 'stands and their numbers', 'AD 2.8 stand coordinates (INS / GNSS checkpoints)'],
    ['hold', 'Holding positions', 'holding positions and runway guard lights', 'holding position coordinates'],
    ['lgt', 'Light systems', 'runway, approach and guard lights', 'AD 2.14 / 2.15 lighting (AIXM light systems)'],
    ['nav', 'Navaid positions', 'ILS localizer / glide path, DME, VOR antennas', 'AD 2.19 navaid coordinates'],
    ['obs', 'Obstacles', 'buildings, masts and other obstacles', 'AD 2.10 obstacles or an eTOD area 2/3 data set']];
  // readiness of an aerodrome for aerodrome mapping: each item available, partly or missing, and from where —
  // A the AIP data set, C the State's charts and documents, T traced on imagery by the user, O OpenStreetMap (got
  // or loaded), S inferred from ICAO Annex 14 (each labelled so in the data); the first source that has it counts
  var RORDER = ['A', 'C', 'T', 'O', 'S'];
  function readiness(c, opt) {
    opt = opt || G.opt || DEF;
    var osmO = opt.osm && typeof AMDBOSM !== 'undefined' ? AMDBOSM.get(c.code) : null, o = osmO ? AMDBOSM.summary(osmO) : null, inf = opt.infer;
    var K = opt.charts && typeof AMDBDOC !== 'undefined' ? AMDBDOC.forAd(c.code, c.arp) : null;
    if (K) AMDBDOC.matchDims(K, c.rwys);
    var T = opt.traced && typeof AMDBTRACE !== 'undefined' ? AMDBTRACE.count(c.code) : {};
    var dirs = [], pts = 0, ends = 0, rw = c.rwys.filter(function (r) { return r.type !== 'FATO'; }), CODE = codeOf(c);
    c.rwys.forEach(function (r) { r.dirs.forEach(function (d) { dirs.push(d); d.pts.forEach(function (q) { if (q.c) { pts++; if (/^(START|END)/.test(q.role) || !q.role) ends++; } }); }); });
    var thrPos = dirs.filter(function (d) { return d.pts.some(function (q) { return /THR$/.test(q.role) && q.c; }); }).length;
    var any = function (f) { var n = dirs.filter(f).length; return !dirs.length ? 'missing' : n === dirs.length ? 'ok' : n ? 'part' : 'missing'; };
    var anyR = function (f) { var n = c.rwys.filter(f).length; return !c.rwys.length ? 'missing' : n === c.rwys.length ? 'ok' : n ? 'part' : 'missing'; };
    var cov = function (n, of) { return n && n >= of ? 'ok' : n ? 'part' : ''; };
    var lightN = dirs.reduce(function (n, d) { return n + d.lights.length; }, 0), ils = Object.keys(c.ilsDes || {}).length > 0 || (c.locs || []).length > 0;
    var oRw = o ? o.runway : 0, taxiAny = c.by.TaxiwayElement.length || c.by.GuidanceLine.length || (o && o.taxiway) || T.twy;
    // the State's charts: per runway direction, and how much of what they name OpenStreetMap covers
    var kr = function (d) { return K ? K.rwy[AMDBDOC.des2(d.des)] || null : null; };
    var kThr = dirs.filter(function (d) { var R = kr(d); return R && R.thr; }).length, kEnd = dirs.filter(function (d) { var R = kr(d); return R && R.end; }).length;
    var kRw = function (k) { return K ? c.rwys.filter(function (r) { return r.dirs.some(function (d) { var R = kr(d); return R && R[k]; }); }).length : 0; };
    var kLgt = K ? dirs.filter(function (d) { return AMDBDOC.lightsFor(K, AMDBDOC.des2(d.des), c.rwys.length === 1).some(function (l) { return l.kind === 'EDGE' || l.kind === 'ALS' || l.kind === 'THR'; }); }).length : 0;
    var oRefs = {}; if (osmO) osmO.els.forEach(function (e) { if (/^(taxiway|taxilane)$/.test(e.tags.aeroway) && e.tags.ref) String(e.tags.ref).toUpperCase().split(/[;,]/).forEach(function (x) { oRefs[x.trim()] = 1; }); });
    // taxiway geometry: OpenStreetMap with at least as many taxiway lines as the charts name taxiways has it, names or not
    var twyCov = K && K.twyNames.length && o && o.taxiway ? (o.taxiway >= K.twyNames.length ? 1 : K.twyNames.filter(function (x) { return oRefs[x]; }).length / K.twyNames.length) : 1;
    // stands: all of those the charts name have a position (or nearly), or only part of them
    var named = K ? K.standNames.concat(K.stands.map(function (x) { return x.id; })).filter(function (x, i, a) { return x && a.indexOf(x) === i; }).length : 0;
    // a parking / docking chart publishes the coordinates of every stand (ICAO Annex 4, 15.6.1 c): its tables are complete
    var apdc = K && K.kinds.indexOf('apdc') >= 0 && K.stands.length >= 10;
    var stdN = (K ? K.stands.length : 0) + (T.std || 0), stdC = stdN ? (apdc || (named ? stdN >= 0.9 * named : K && K.stands.length) || T.std >= 10 ? 'ok' : 'part') : '';
    // taxiways traced: all of those the charts name, or a few lines only
    var twyT = T.twy ? (K && K.twyNames.length ? (twyCovT() >= 0.9 ? 'ok' : 'part') : T.twy >= 3 ? 'ok' : 'part') : '';
    function twyCovT() { var tr = {}; AMDBTRACE.features(c.code).forEach(function (f) { if (f.t === 'TaxiwayGuidanceLine' && f.a.idlin) tr[String(f.a.idlin.v).toUpperCase()] = 1; }); return K.twyNames.filter(function (x) { return oRefs[x] || tr[x]; }).length / K.twyNames.length; }
    var R = {};
    // the AIP when it has the item; else the first other source that has all of it; else the first that has part
    function set(k, stA) {
      var alts = Array.prototype.slice.call(arguments, 2).filter(function (x) { return x && x[0]; });
      if (stA === 'ok') { R[k] = ['ok', 'A']; return; }
      var full = alts.filter(function (x) { return x[0] === 'ok'; })[0];
      if (full) { R[k] = full; return; }
      if (stA === 'part') { R[k] = ['part', 'A']; return; }
      R[k] = alts[0] || ['missing', ''];
    }
    set('arp', c.arp ? 'ok' : 'missing', K && K.arp ? ['ok', 'C'] : null);
    set('thr', !dirs.length ? 'missing' : thrPos === dirs.length ? 'ok' : thrPos || pts ? 'part' : 'missing', [cov(kThr, dirs.length), 'C'], oRw ? [oRw >= rw.length ? 'ok' : 'part', 'O'] : null, opt.schematic && c.rwys.length === 1 && c.arp ? ['part', 'S'] : null);
    set('ends', ends >= c.rwys.length * 2 && c.rwys.length ? 'ok' : ends ? 'part' : 'missing', [kEnd ? cov(kEnd, dirs.length) : kThr ? 'part' : '', 'C'], oRw ? [oRw >= rw.length ? 'ok' : 'part', 'O'] : null);
    set('wid', anyR(function (r) { return r.wid; }), [cov(kRw('wid'), c.rwys.length), 'C']);
    set('shd', anyR(function (r) { return r.shoulder; }), K && Object.keys(K.shoulder).length ? ['ok', 'C'] : null, inf && c.rwys.length ? ['ok', 'S'] : null);
    set('dd', any(function (d) { return d.pts.some(function (q) { return Object.keys(q.dd).length; }); }));
    set('elev', any(function (d) { return d.pts.some(function (q) { return q.elev !== null; }); }), inf && meters(c.ad.cur.p.fieldElevation) !== null ? ['part', 'S'] : null);
    set('brg', any(function (d) { return !isNaN(d.brg); }), pts >= 2 ? ['ok', 'A'] : null, [kThr >= 2 ? 'ok' : '', 'C'], oRw ? ['ok', 'O'] : null);
    set('surf', anyR(function (r) { return r.sp && (s(r.sp.composition) || s(r.sp.classPCN)); }), [cov(kRw('pcn'), c.rwys.length), 'C'], o && o.surface ? ['part', 'O'] : null);
    set('twy', c.by.TaxiwayElement.length || c.by.GuidanceLine.length ? (c.by.Taxiway.length && c.by.TaxiwayElement.length + c.by.GuidanceLine.length < c.by.Taxiway.length ? 'part' : 'ok') : 'missing', [twyT, 'T'], o && o.taxiway ? [twyCov >= 0.9 ? 'ok' : 'part', 'O'] : null);
    set('apn', c.by.ApronElement.length ? 'ok' : 'missing', T.apn ? ['ok', 'T'] : null, o && o.apron ? ['ok', 'O'] : null);
    set('std', c.stands.length ? 'ok' : 'missing', [stdC, K && K.stands.length ? 'C' : 'T'], o && o.stand ? [o.standRef ? 'ok' : 'part', 'O'] : null);
    set('hold', c.by.TaxiHoldingPosition.length ? 'ok' : 'missing', T.hold ? [T.hold >= 4 ? 'ok' : 'part', 'T'] : null, o && o.hold ? ['ok', 'O'] : null, inf && taxiAny && c.rwys.length ? ['ok', 'S'] : null);
    set('lgt', lightN ? 'ok' : 'missing', [cov(kLgt, dirs.length), 'C'], inf && ils ? ['ok', 'S'] : null);
    set('nav', c.navs.length ? 'ok' : ils ? 'part' : 'missing', o && o.navaid ? ['part', 'O'] : null);
    set('obs', c.obs.length ? 'ok' : 'missing', o && o.building ? ['ok', 'O'] : null, T.bldg ? ['part', 'T'] : null);
    var st = {}, srcs = {}, by = { A: 0, C: 0, T: 0, O: 0, S: 0 };
    Object.keys(R).forEach(function (k) { st[k] = R[k][0]; srcs[k] = R[k][1]; if (R[k][0] !== 'missing' && R[k][1]) by[R[k][1]]++; });
    var score = READY.reduce(function (n, x) { return n + (st[x[0]] === 'ok' ? 1 : st[x[0]] === 'part' ? 0.5 : 0); }, 0);
    return { st: st, src: srcs, by: by, pct: Math.round(score / READY.length * 100), withheld: c.rwys.length && !pts && !kThr, osm: o, charts: K, code: CODE };
  }
  var RSYM = { ok: '✓', part: '◐', missing: '✗' }, RCOL = { ok: '#1f7a4d', part: '#b76e00', missing: '#b3261e' };
  var RSRC = { A: 'the AIP data set', C: 'the State\'s charts and documents', T: 'traced on imagery by the user', O: 'OpenStreetMap', S: 'inferred from ICAO Annex 14' };
  function bySrc(r) { return RORDER.filter(function (k) { return r.by[k]; }).map(function (k) { return k + r.by[k]; }).join(' '); }
  function readyCsv(list) {
    var rows = [['aerodrome', 'readiness %', 'from the AIP', 'from the State\'s charts', 'traced on imagery', 'from OpenStreetMap', 'inferred'].concat(READY.map(function (x) { return x[1]; }))];
    list.forEach(function (c) { var r = readiness(c); rows.push([c.code, r.pct, r.by.A, r.by.C, r.by.T, r.by.O, r.by.S].concat(READY.map(function (x) { return r.st[x[0]] + (r.src[x[0]] ? ' (' + RSRC[r.src[x[0]]] + ')' : ''); }))); });
    rows.push([]); rows.push(['item', 'what it gives', 'where it comes from / what to collect']);
    READY.forEach(function (x) { rows.push([x[1], x[2], x[3]]); });
    return '# ' + NOTICE + '\n' + rows.map(function (r) { return r.map(function (v) { v = String(v === undefined ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(','); }).join('\n');
  }
  function readyHtml(list) {
    if (!list.length) return '';
    var cols = list.slice(0, 14), rs = cols.map(function (c) { return readiness(c); });
    return '<details class="gen-ready" open><summary>Data readiness — what the sources give for aerodrome mapping (' + cols.length + ' aerodrome(s)' + (list.length > cols.length ? ' of ' + list.length + ' chosen' : '') + ')</summary>' +
      '<div class="tbl-wrap"><table class="mini-table ready-tbl"><thead><tr><th>Item</th>' + cols.map(function (c, i) { return '<th class="num" title="' + esc(c.name) + '">' + esc(c.code) + '<br><small style="color:' + (rs[i].pct >= 70 ? RCOL.ok : rs[i].pct >= 40 ? RCOL.part : RCOL.missing) + '">' + rs[i].pct + '%</small><br><small class="muted">' + esc(bySrc(rs[i])) + '</small></th>'; }).join('') + '<th>Gives</th><th>Where from / what to collect</th></tr></thead><tbody>' +
      READY.map(function (x) { return '<tr><td><b>' + esc(x[1]) + '</b></td>' + rs.map(function (r) { var v = r.st[x[0]], so = r.src[x[0]]; return '<td class="num ready-c" data-st="' + v + '" data-src="' + (so || '') + '" style="color:' + RCOL[v] + '" title="' + (v === 'missing' ? 'missing' : (v === 'ok' ? 'available' : 'partly') + ' — from ' + RSRC[so]) + '">' + RSYM[v] + (so ? '<sub class="rs-' + so + '">' + so + '</sub>' : '') + '</td>'; }).join('') + '<td class="muted">' + esc(x[2]) + '</td><td class="muted">' + esc(x[3]) + '</td></tr>'; }).join('') +
      '</tbody></table></div>' + (rs.some(function (r) { return r.withheld; }) ? '<p class="muted">⚠ ' + esc(cols.filter(function (c, i) { return rs[i].withheld; }).map(function (c) { return c.code; }).join(', ')) + ': the AIP withholds the runway positions (no coordinates published). Load the State\'s aerodrome chart (its threshold coordinates), get OpenStreetMap, use survey / CAD / GIS data, or the SCHEMATIC option for an indicative picture.</p>' : '') +
      '<p><span class="muted">✓ available · ◐ partly · ✗ missing — from <b class="rs-A">A</b> the AIP · <b class="rs-C">C</b> the State\'s charts · <b class="rs-T">T</b> traced on imagery · <b class="rs-O">O</b> OpenStreetMap · <b class="rs-S">S</b> inferred from ICAO Annex 14 (each labelled so in every feature)</span> <button class="btn small" data-genrep="csv">Readiness report (CSV)</button> <button class="btn small" data-genrep="pdf">Readiness report (PDF)</button></p></details>';
  }
  var GEN_OPTS = [['markings', 'Runway markings (Annex 14 standard layout: threshold, aiming point, touchdown zone, side stripes)'], ['lights', 'Lights declared in the AIP (AD 2.14 / 2.15: runway, approach, guard lights)'], ['centreline', 'Painted runway centre line'], ['taxiways', 'Taxiway surface along guidance lines (from the taxiway width)'], ['obstacles', 'Obstacles, navaid antennas and aerodrome beacons (AD 2.10, AD 2.19, ENR 4.1 — also from obstacle data sets loaded beside the AIP)'], ['osm', 'OpenStreetMap features when got or loaded (taxiways, aprons, stands, holding positions, buildings …; the AIP is kept wherever it gives a feature type)'], ['charts', 'The State\'s charts and documents loaded in Upload (stands, thresholds, widths, strength and lighting as published)'], ['traced', 'Features traced on imagery (Trace on imagery)'], ['network', 'Taxi routing network (AsrnNode / AsrnEdge) from the OpenStreetMap lines'], ['infer', 'Infer what is still missing from ICAO Annex 14 — holding positions, runway shoulders, CAT I lighting where an ILS serves a runway (labelled inferred)'], ['schematic', 'SCHEMATIC runway where the AIP withholds positions (single-runway aerodromes: at the reference point, bearing from the designator) — indicative only']];
  // what the State's charts, the documents and the tracing give, in a few words
  function srcSummary(list) {
    var docs = typeof AMDBDOC !== 'undefined' ? AMDBDOC.list() : [], tr = typeof AMDBTRACE !== 'undefined' ? AMDBTRACE.total() : 0;
    if (!docs.length && !tr) return 'None loaded yet. The State\'s aerodrome chart, ground movement chart and parking / docking chart give stand coordinates, threshold coordinates, widths, strength and lighting; imagery whose licence allows it lets you trace taxiways, aprons and stands that no source gives.';
    var by = {}; docs.forEach(function (d) { by[d.ad || '—'] = (by[d.ad || '—'] || 0) + 1; });
    return esc(docs.length + ' document(s): ' + Object.keys(by).map(function (k) { return k + ' ' + by[k]; }).join(', ') + (tr ? ' · ' + tr + ' feature(s) traced on imagery' : '')) + (list.length && docs.some(function (d) { return !d.ad; }) ? ' · <b>some documents have no aerodrome yet</b> (choose it in Upload &amp; sources)' : '');
  }
  function chartCell(c) {
    var K = typeof AMDBDOC !== 'undefined' ? AMDBDOC.forAd(c.code, c.arp) : null, T = typeof AMDBTRACE !== 'undefined' ? AMDBTRACE.count(c.code) : {}, out = [];
    if (K) { out.push(K.docs.length + ' doc'); if (K.stands.length) out.push(K.stands.length + ' stand'); var th = Object.keys(K.rwy).filter(function (k) { return K.rwy[k].thr; }).length; if (th) out.push(th + ' thr'); if (K.lights.length) out.push('lights'); }
    if (T.all) out.push(T.all + ' traced');
    return out.length ? esc(out.join(' · ')) : '<span class="muted">—</span>';
  }
  function genView(host, ctx) {
    var list = candidates(ctx.datasets);
    if (!G.pick) { G.pick = {}; list.forEach(function (c, i) { if (!c.mapped && !c.amxm && c.rwys.length) G.pick[i] = true; }); }
    if (!G.opt) G.opt = Object.assign({}, DEF);
    var h = '<div class="nfo-box amdb-notice" role="note">⚠ ' + NOTICE + ' Generated geometry is derived from the AIP data (runway ends or a threshold, bearing, length and width; declared distances; shoulder width) and, for markings and lights without positions, from the ICAO Annex 14 standard layout: <b>coarse and indicative</b>, not surveyed. Every feature says so in its source; its accuracy is left unknown. <button class="linkbtn" data-amgoto="guide">How to create AMDB data — step by step</button></div>';
    if (!list.length) { host.innerHTML = h + '<div class="card card-pad muted">No AIXM aerodrome in the data loaded.</div>'; return; }
    var lightN = function (c) { return c.rwys.reduce(function (n, r) { return n + r.dirs.reduce(function (m, d) { return m + d.lights.length; }, 0); }, 0); };
    var geoN = function (c) { return c.by.TaxiwayElement.length + c.by.ApronElement.length + c.by.GuidanceLine.length; };
    h += '<div class="card card-pad gen-card"><h3 style="margin-top:0">Generate aerodrome mapping from AIP data</h3><p class="muted">Everything the AIP data set gives for each aerodrome — runways, shoulders, stopways, displaced thresholds, thresholds with elevation and declared distances, every runway centre line point, runway intersections, taxiway and apron elements, guidance lines, holding positions, stands, de-icing and work areas, helicopter areas, lights, navaid antennas and obstacles — written as AMXM 2.0 and opened here: then check it, see it as a chart or in 3D, compare it and build a package.</p>' +
      '<div class="toolbar gen-tools"><input class="inp" type="search" data-genq placeholder="Search aerodromes (ICAO code or name)…" aria-label="Search aerodromes" value="' + esc(G.q || '') + '" style="min-width:260px">' +
      '<button class="btn small" data-gensel="all">Select all</button><button class="btn small" data-gensel="shown">Select shown</button><button class="btn small" data-gensel="none">Deselect all</button><button class="btn small" data-gensel="nomap">Only those without mapping data</button><span class="muted gen-count"></span></div>' +
      '<details class="gen-src" open><summary>More sources — to complete what the AIP does not give</summary>' +
      '<div class="gen-src-grid"><div><b>🌍 OpenStreetMap</b><p class="muted">Taxiways with their designators, aprons, stands with their numbers, holding positions, terminals, hangars and other buildings, windsocks — traced from imagery by volunteers (coarse quality). Online, only when you click: the ICAO code (or the area) of each chosen aerodrome is sent to a public Overpass API server, nothing else. © OpenStreetMap contributors, ODbL 1.0: attribution and share-alike apply when you publish what you make from it.</p>' +
      '<button class="btn small primary" data-osmget>Get OpenStreetMap features for the chosen aerodromes</button> <button class="btn small" data-osmfile>Load an OpenStreetMap file…</button><input type="file" class="hidden" data-osmin accept=".osm,.json,.geojson,.xml" aria-label="OpenStreetMap file">' +
      '<div class="muted osm-st">' + G.osmMsg + '</div></div>' +
      '<div><b>📄 The State\'s charts · ✏️ imagery · 📎 documents</b><p class="muted">' + srcSummary(list) + '</p>' +
      '<button class="btn small primary" data-amgoto="upload">📤 Upload charts, documents and files…</button> <button class="btn small" data-amgoto="trace">✏️ Trace on imagery…</button></div></div>' +
      '<p class="muted" style="font-size:11.5px">Charts of commercial providers (e.g. Jeppesen) are licensed for display: their terms do not allow deriving data from them, so use the State\'s own charts. Google and Esri imagery are shown for a visual check only — tracing uses imagery whose licence allows it.</p></details>' +
      '<div class="tbl-wrap gen-tbl"><table class="mini-table"><thead><tr><th></th><th>Aerodrome</th><th>Data set</th><th class="num" title="Runways (FATO included)">RWY</th><th class="num" title="Thresholds with a position">THR</th><th class="num" title="Runway centre line points with a position">CL pts</th><th class="num" title="Light systems declared (AD 2.14)">Lights</th><th class="num" title="Taxiway / apron elements and guidance lines with geometry">TWY/APN geom.</th><th class="num" title="Holding positions">Hold</th><th class="num">Stands</th><th class="num" title="Navaid antennas within 6 km">Navaids</th><th class="num" title="Obstacles of the aerodrome">Obst.</th><th title="What OpenStreetMap gives (when got or loaded)">OpenStreetMap</th><th title="What the State&#39;s charts and documents give, and what was traced on imagery">Charts · traced</th><th class="num" title="Data readiness for aerodrome mapping: from the AIP, OpenStreetMap, the State&#39;s charts and inferred">Ready</th><th>Mapping data already</th></tr></thead><tbody>' +
      list.map(function (c, i) {
        return '<tr data-genrow="' + i + '" data-genkey="' + esc((c.code + ' ' + c.name + ' ' + c.ds.name).toLowerCase()) + '"><td><input type="checkbox" data-gen="' + i + '"' + (G.pick[i] ? ' checked' : '') + (c.rwys.length || c.stands.length || geoN(c) ? '' : ' disabled') + ' aria-label="Generate ' + esc(c.code) + '"></td><td><b>' + esc(c.code) + '</b> ' + esc(c.name) + '</td><td class="muted">' + esc(c.ds.name) + '</td><td class="num">' + c.rwys.length + '</td><td class="num">' + c.thr + '</td><td class="num">' + c.cl + '</td><td class="num">' + lightN(c) + '</td><td class="num">' + geoN(c) + '</td><td class="num">' + c.by.TaxiHoldingPosition.length + '</td><td class="num">' + c.stands.length + '</td><td class="num">' + c.navs.length + '</td><td class="num">' + c.obs.length + '</td><td class="gen-osm">' + (function () { var o = typeof AMDBOSM !== 'undefined' && AMDBOSM.get(c.code), L = typeof AMDBOSM !== 'undefined' ? AMDBOSM.links(c) : {}; if (!o) return '<span class="muted">—</span>' + (L.view ? ' <a href="' + L.view + '" target="_blank" rel="noopener" title="Look at it on openstreetmap.org">view</a>' : ''); var n = AMDBOSM.summary(o); return n.taxiway + ' twy · ' + n.apron + ' apron · ' + n.stand + ' stand · ' + n.building + ' bldg' + (L.edit ? ' <a href="' + L.edit + '" target="_blank" rel="noopener" title="Improve the map on openstreetmap.org (your edits help everyone)">improve</a>' : ''); })() + '</td><td class="gen-osm">' + chartCell(c) + '</td><td class="num">' + (function () { var r = readiness(c); return '<b style="color:' + (r.pct >= 70 ? RCOL.ok : r.pct >= 40 ? RCOL.part : RCOL.missing) + '">' + r.pct + '%</b>' + (r.withheld ? ' <span title="runway positions withheld in the AIP">⚠</span>' : ''); })() + '</td><td>' + (c.mapped ? num(c.mapped) + ' AIXM feature(s)' : '') + (c.amxm ? ' AMXM' : '') + (c.mapped || c.amxm ? '' : '<span class="muted">none</span>') + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<div class="gen-readyhost"></div>' +
      '<details class="gen-opts" open><summary>What to derive</summary>' + GEN_OPTS.map(function (o) { return '<label class="chk"><input type="checkbox" data-genopt="' + o[0] + '"' + (G.opt[o[0]] ? ' checked' : '') + '> ' + o[1] + '</label>'; }).join('') + '</details>' +
      '<div class="amdb-ack"><label class="chk"><input type="checkbox" data-genack' + (G.ack ? ' checked' : '') + '> I understand that the generated geometry is coarse and indicative (NOT FOR NAVIGATION) and is recorded as such.</label></div>' +
      '<button class="btn primary" data-gengo' + (G.ack ? '' : ' disabled') + '>Generate and open</button> <span class="muted gen-st"></span>' + G.out + '</div>';
    host.innerHTML = h;
    function filter() {
      var q = (G.q || '').trim().toLowerCase(), shown = 0, picked = 0;
      host.querySelectorAll('[data-genrow]').forEach(function (tr) { var on = !q || tr.getAttribute('data-genkey').indexOf(q) >= 0; tr.hidden = !on; if (on) shown++; });
      list.forEach(function (c, i) { if (G.pick[i]) picked++; });
      host.querySelector('.gen-count').textContent = picked + ' of ' + list.length + ' aerodrome(s) chosen' + (q ? ' · ' + shown + ' shown' : '');
      host.querySelector('.gen-readyhost').innerHTML = readyHtml(list.filter(function (c, i) { return G.pick[i]; }));
    }
    filter();
    host.oninput = function (e) { if (e.target.hasAttribute('data-genq')) { G.q = e.target.value; filter(); } };
    host.onchange = async function (e) {
      var t2 = e.target;
      if (t2.hasAttribute('data-osmin') && t2.files[0]) {
        try { var r0 = AMDBOSM.load(await t2.files[0].text(), t2.files[0].name, list); G.osmMsg = '✓ ' + esc(t2.files[0].name) + ': ' + r0.elements + ' element(s)' + (Object.keys(r0.aerodromes).length ? ' — ' + Object.keys(r0.aerodromes).map(function (k) { return k + ' ' + r0.aerodromes[k]; }).join(', ') : ' — none near a loaded aerodrome'); }
        catch (er) { G.osmMsg = '<span style="color:var(--err)">' + esc(er.message) + '</span>'; }
        genView(host, ctx); return;
      }
      if (t2.hasAttribute('data-gen')) { G.pick[+t2.getAttribute('data-gen')] = t2.checked; filter(); }
      if (t2.hasAttribute('data-genopt')) { G.opt[t2.getAttribute('data-genopt')] = t2.checked; filter(); }
      if (t2.hasAttribute('data-genack')) { G.ack = t2.checked; host.querySelector('[data-gengo]').disabled = !t2.checked; }
    };
    host.onclick = async function (e) {
      if (e.target.closest('[data-osmfile]')) { host.querySelector('[data-osmin]').click(); return; }
      if (e.target.closest('[data-osmget]')) {
        var ch0 = list.filter(function (c, i) { return G.pick[i] && c.arp; }), st0 = host.querySelector('.osm-st'), ok0 = [], bad0 = [];
        if (!ch0.length) { ctx.toast('Choose an aerodrome first.'); return; }
        for (var q0 = 0; q0 < ch0.length; q0++) {
          try { var o0 = await AMDBOSM.fetchFor(ch0[q0], function (m) { st0.innerHTML = '<span class="spinner"></span> ' + esc(m); }); ok0.push(ch0[q0].code + ' ' + AMDBOSM.summary(o0).all); } catch (er) { bad0.push(ch0[q0].code + ': ' + er.message); }
        }
        G.osmMsg = (ok0.length ? '✓ ' + esc(ok0.join(', ')) + ' element(s) from OpenStreetMap. ' : '') + (bad0.length ? '<span style="color:var(--err)">' + esc(bad0.join(' · ')) + '</span>' : '');
        genView(host, ctx); return;
      }
      var sel = e.target.closest('[data-gensel]'), go = e.target.closest('[data-amgoto]'), rep = e.target.closest('[data-genrep]');
      if (rep) {
        var ch = list.filter(function (c, i) { return G.pick[i]; }); if (!ch.length) ch = list;
        var nm = EXPORTS.safeName('AMDB_data_readiness_' + new Date().toISOString().slice(0, 10));
        if (rep.getAttribute('data-genrep') === 'csv') { EXPORTS.download(nm + '.csv', new Blob([readyCsv(ch)], { type: 'text/csv' })); return; }
        var Cc = function (v) { return { t: v === undefined || v === null ? '' : String(v) }; };
        EXPORTS.exportPDF({ title: 'Aerodrome mapping — data readiness of the AIP', sub: NOTICE, ds: null, sections: [
          { title: 'Readiness by aerodrome', blocks: [{ kind: 'table', cols: ['Aerodrome', 'Readiness'].concat(READY.map(function (x) { return x[1]; })), rows: ch.map(function (c) { var r = readiness(c); return [Cc(c.code + ' ' + c.name), Cc(r.pct + '% (' + bySrc(r) + ')')].concat(READY.map(function (x) { return Cc(RSYM[r.st[x[0]]] + (r.src[x[0]] ? ' ' + r.src[x[0]] : '')); })); }) }] },
          { title: 'What each item gives, and where it comes from', blocks: [{ kind: 'table', cols: ['Item', 'Gives', 'Where from / what to collect'], rows: READY.map(function (x) { return [Cc(x[1]), Cc(x[2]), Cc(x[3])]; }) }, { kind: 'note', text: '✓ available · ◐ partly · ✗ missing; A from the AIP data set, C from the State\'s charts and documents, T traced on imagery by the user, O from OpenStreetMap (© OpenStreetMap contributors, ODbL 1.0), S inferred from ICAO Annex 14. Made with ' + APP_INFO.name + ' ' + APP_INFO.version + ' — created by ' + APP_INFO.author + '. ' + NOTICE }] }] });
        return;
      }
      if (go) { if (ctx.amTab) ctx.amTab(go.getAttribute('data-amgoto')); return; }
      if (sel) {
        var how = sel.getAttribute('data-gensel');
        host.querySelectorAll('[data-gen]').forEach(function (cb) {
          var i = +cb.getAttribute('data-gen'), c = list[i], row = cb.closest('tr');
          if (cb.disabled) return;
          var v = how === 'all' ? true : how === 'none' ? false : how === 'shown' ? (!row.hidden || G.pick[i]) : !c.mapped && !c.amxm;
          if (how === 'shown' && row.hidden) v = !!G.pick[i];
          G.pick[i] = v; cb.checked = v;
        });
        filter(); return;
      }
      if (!e.target.closest('[data-gengo]')) return;
      var chosen = list.filter(function (c, i) { return G.pick[i]; });
      if (!chosen.length) { ctx.toast('Choose an aerodrome.'); return; }
      var st = host.querySelector('.gen-st'); st.innerHTML = '<span class="spinner"></span> Generating…';
      await new Promise(function (r) { setTimeout(r, 30); });
      var res = generate(chosen, G.opt);
      if (!res.features.length) { st.textContent = ''; ctx.toast('Nothing could be generated: ' + res.notes.join('; '), 8000); return; }
      await LAZY.run('src-amdbpkg');
      var name = (chosen.length === 1 ? chosen[0].code : chosen.length + '_aerodromes') + '_generated_from_AIP_AMXM.xml';
      var xml = AMDBPKG.writeAmxm(res.features, 'Aerodrome mapping generated from AIP data (' + chosen.map(function (c) { return c.ds.name; }).filter(function (x, i, a) { return a.indexOf(x) === i; }).join(', ') + '): geometry derived from the AIP data and the ICAO Annex 14 standard layout, coarse and indicative. NOT FOR NAVIGATION.');
      var byT = {}; res.features.forEach(function (f) { byT[f.t] = (byT[f.t] || 0) + 1; });
      G.out = '<div class="gen-out"><p>✓ ' + num(res.features.length) + ' feature(s) generated for ' + esc(chosen.map(function (c) { return c.code; }).join(', ')) + ' — opened as <b>' + esc(name) + '</b>.</p><p class="muted">' + Object.keys(byT).sort().map(function (k) { return esc(k) + ' ' + num(byT[k]); }).join(' · ') + '</p>' + (res.notes.length ? '<ul class="muted">' + res.notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>' : '') + '</div>';
      G.pick = null; G.last = name;
      var A = window.__AIXM;
      await A.addFiles([new File([xml], name, { type: 'text/xml' })]);
      await A.extractAll();
      if (ctx.amTab) ctx.amTab('features', true); else A.go('digital');
    };
  }
  /* --------------------------------------------------------- upload & sources */
  // every file for aerodrome mapping, dropped in one place, goes where it belongs: the State's charts and text to
  // the document reader, OpenStreetMap files to the OSM store, an image with its world file to the imagery, other
  // images and office files are kept as supporting documents, and data sets (AIXM, AMXM, GIS, CAD, packages,
  // obstacles, terrain) go to the normal reader of the tool
  var WORLD = /\.(jgw|jpgw|pgw|pngw|tfw|tifw|wld|j2w)$/i, IMG = /\.(png|jpe?g|webp|gif)$/i, OFFICE = /\.(docx?|pptx?|odt|odp|rtf|kmz|kml|html?|msg|eml)$/i;
  function stem(n) { return String(n).replace(/\.[^.]+$/, '').toLowerCase(); }
  async function routeFiles(files, list, say) {
    var arr = Array.prototype.slice.call(files || []), toApp = [], got = [], worlds = arr.filter(function (f) { return WORLD.test(f.name); }), prjs = arr.filter(function (f) { return /\.prj$/i.test(f.name); });
    await LAZY.run('src-amdbdoc');
    for (var i = 0; i < arr.length; i++) {
      var f = arr[i], nm = f.name;
      if (WORLD.test(nm)) continue;
      say('Reading ' + nm + ' …');
      try {
        if (/\.prj$/i.test(nm) && arr.some(function (g) { return IMG.test(g.name) && stem(g.name) === stem(nm); })) continue;
        // a zip: its charts and documents read here; its data (AIXM, AMXM …) to the reader of the tool
        if (/\.zip$/i.test(nm) && f.size < 400 * 1048576 && typeof fflate !== 'undefined') {
          var zb = new Uint8Array(await f.arrayBuffer()), other = 0, docsZ = fflate.unzipSync(zb, { filter: function (e) { var k = /\.(pdf|txt)$/i.test(e.name) && !/(^|\/)__MACOSX\//.test(e.name); if (!k && !/\/$/.test(e.name)) other++; return k; } });
          var names = Object.keys(docsZ);
          for (var z = 0; z < names.length; z++) { say('Reading ' + names[z] + ' …'); var dz = await AMDBDOC.addFile(new File([docsZ[names[z]]], names[z].split('/').pop()), list); got.push(names[z].split('/').pop() + ' (in ' + nm + '): ' + AMDBDOC.KINDS[dz.f ? dz.f.kind.id : 'other'].name + (dz.ad ? ' of ' + dz.ad : '') + (dz.image ? ' — a picture: read it with OCR' : '')); }
          if (other) toApp.push(f);
          continue;
        }
        if (/\.(pdf|txt|text)$/i.test(nm)) { var d = await AMDBDOC.addFile(f, list); got.push(nm + ': ' + AMDBDOC.KINDS[d.f ? d.f.kind.id : 'other'].name + (d.ad ? ' of ' + d.ad : '') + (d.image ? ' — a picture: read it with OCR' : '')); continue; }
        if (IMG.test(nm)) {
          var w = worlds.filter(function (x) { return stem(x.name) === stem(nm); })[0], pj = prjs.filter(function (x) { return stem(x.name) === stem(nm); })[0];
          if (w) { await LAZY.run('src-amdbtrace'); var o = await AMDBTRACE.addOrtho(f, await w.text(), pj ? await pj.text() : '', list.filter(function (c) { return c.arp; }).map(function (c) { return c.arp; })); got.push(nm + ': orthophoto ' + o.w + ' × ' + o.h + ' px (' + o.crs + ') — shown in Trace on imagery'); continue; }
          await AMDBDOC.addFile(f, list); got.push(nm + ': kept as a supporting document (an image without a world file is not placed on the map)'); continue;
        }
        if (OFFICE.test(nm)) { await AMDBDOC.addFile(f, list); got.push(nm + ': kept as a supporting document'); continue; }
        if (/\.osm$/i.test(nm) || /\.(json|geojson|xml)$/i.test(nm)) {
          var head = await f.slice(0, 65536).text();
          if (/\.osm$/i.test(nm) || /<osm[\s>]/.test(head) || (/\.(json|geojson)$/i.test(nm) && (/"elements"\s*:/.test(head) || /"aeroway"\s*:/.test(head)) && !/"amxm_type"|"feature_type"/.test(head))) {
            if (typeof AMDBOSM === 'undefined') await LAZY.run('src-amdbosm');
            var r0 = AMDBOSM.load(await f.text(), nm, list); got.push(nm + ': OpenStreetMap, ' + r0.elements + ' element(s)' + (Object.keys(r0.aerodromes).length ? ' — ' + Object.keys(r0.aerodromes).map(function (k) { return k + ' ' + r0.aerodromes[k]; }).join(', ') : ' — none near a loaded aerodrome'));
            continue;
          }
        }
        if (/\.csv$/i.test(nm) && f.size < 5e6) {
          var t = await f.text();
          if (!isCsv(t)) { var fx = AMDBDOC.read(t, nm); if (fx.stands.length >= 2) { AMDBDOC.addText(t, nm, list); got.push(nm + ': ' + fx.stands.length + ' stand position(s)'); continue; } }
        }
        toApp.push(f);
      } catch (e) { got.push(nm + ': ' + e.message); }
    }
    if (toApp.length) {
      say('Reading ' + toApp.length + ' data file(s) …');
      var A = window.__AIXM; await A.addFiles(toApp); await A.extractAll({ stay: true });
      got.push(toApp.length + ' data file(s) read: ' + toApp.map(function (f) { return f.name; }).join(', '));
    }
    return { got: got, data: toApp.length };
  }
  var ST_ICON = { found: '✓', missing: '✗', drawn: '◌', where: '○' }, ST_COL = { found: '#1f7a4d', missing: '#b3261e', drawn: '#5b6676', where: '#5b6676' }, X_COL = { ok: '#1f7a4d', warn: '#b76e00', bad: '#b3261e', fill: '#1565c0' };
  function checkHtml(d, list) {
    var c = list.filter(function (x) { return x.code === d.ad; })[0] || null, chk = AMDBDOC.icaoCheck(d.f, c), K = d.ad ? AMDBDOC.forAd(d.ad, c && c.arp) : null;
    if (K && c) AMDBDOC.matchDims(K, c.rwys);
    var osmSt = typeof AMDBOSM !== 'undefined' && d.ad ? (AMDBOSM.get(d.ad) || { els: [] }).els.filter(function (e) { return e.tags.aeroway === 'parking_position'; }).map(function (e) { return { ref: e.tags.ref || '', c: e.g.t === 'P' ? e.g.c : gcentre(e.g) }; }).filter(function (x) { return x.c; }) : [];
    var x = c ? AMDBDOC.crossCheck(K, c, osmSt) : [], h = '<div class="doc-chk">';
    h += '<p><b>' + esc(chk.name) + '</b>' + (chk.ch ? ' <span class="muted">(' + esc(chk.ch) + ')</span>' : '') + (chk.items.length ? (chk.icaoTitle ? ' · <span style="color:#1f7a4d">✓ titled "— ICAO"</span>' : ' · <span class="muted">not titled "— ICAO" (a State or provider format)</span>') : '') + '</p>';
    if (chk.items.length) {
      var nf = chk.items.filter(function (i) { return i.st === 'found'; }).length, nm = chk.items.filter(function (i) { return i.st === 'missing'; }).length;
      h += '<p class="muted">ICAO Annex 4 contents, read from the chart\'s text: ' + nf + ' found, ' + nm + ' not found in the text. ✓ found · ✗ not found in the text (the chart may show it only as a drawing or a symbol — look at it) · ◌ only the drawing can show it · ○ where established.</p>' +
        '<div class="tbl-wrap"><table class="mini-table doc-a4"><thead><tr><th></th><th>Annex 4</th><th>What the chart must show</th><th>Found in the text</th></tr></thead><tbody>' +
        chk.items.map(function (i) { return '<tr data-a4="' + i.st + '"><td style="color:' + ST_COL[i.st] + '">' + ST_ICON[i.st] + '</td><td class="muted">' + esc(i.ref) + '</td><td>' + esc(i.what) + '</td><td class="muted" style="font-family:var(--mono);font-size:11px">' + esc(i.ev) + '</td></tr>'; }).join('') + '</tbody></table></div>';
    } else h += '<p class="muted">Not one of the charts aerodrome mapping is made from (aerodrome chart, ground movement chart, parking / docking chart, AD 2 pages, stand tables): kept for reference.</p>';
    if (x.length) h += '<p><b>Against the AIP data set' + (osmSt.length ? ' and OpenStreetMap' : '') + '</b> <span class="muted">— ✓ agrees · ! differs a little · ✗ differs · ➕ the chart fills what the AIP data set lacks</span></p><div class="tbl-wrap"><table class="mini-table doc-x"><thead><tr><th></th><th>Item</th><th>Chart</th><th>AIP data set</th><th>Difference</th></tr></thead><tbody>' +
      x.map(function (r) { return '<tr data-x="' + r.st + '"><td style="color:' + X_COL[r.st] + '">' + { ok: '✓', warn: '!', bad: '✗', fill: '➕' }[r.st] + '</td><td>' + esc(r.what) + '</td><td>' + esc(r.chart) + '</td><td>' + esc(r.aip) + '</td><td class="muted">' + esc(r.diff) + '</td></tr>'; }).join('') + '</tbody></table></div>';
    else if (!d.ad) h += '<p class="muted">Choose the aerodrome of this document to compare it with the AIP data set.</p>';
    return h + '</div>';
  }
  // what fills each gap of an aerodrome when its charts are incomplete or unclear, in plain words
  function gapsHtml(c) {
    var K = AMDBDOC.forAd(c.code, c.arp); if (!K) return '';
    AMDBDOC.matchDims(K, c.rwys);
    var o = typeof AMDBOSM !== 'undefined' ? AMDBOSM.get(c.code) : null, oSt = o ? o.els.filter(function (e) { return e.tags.aeroway === 'parking_position'; }) : [], T = typeof AMDBTRACE !== 'undefined' ? AMDBTRACE.count(c.code) : {};
    var L = [], kinds = K.kinds.map(function (k) { return AMDBDOC.KINDS[k].name; });
    L.push('Documents: ' + kinds.join(', ') + '.');
    var noPark = K.kinds.indexOf('apdc') < 0 && K.kinds.indexOf('agmc') < 0;
    if (K.stands.length) L.push(K.stands.length + ' stand(s) placed as published' + (K.standNames.length > K.stands.length ? '; ' + (K.standNames.length - K.stands.length) + ' more named without coordinates — from OpenStreetMap where it has them' : '') + '.');
    else if (noPark || !K.standNames.length) {
      var conf = K.standNames.length ? oSt.filter(function (e) { return e.tags.ref && K.standNames.indexOf(String(e.tags.ref).toUpperCase()) >= 0; }).length : 0;
      L.push((noPark ? 'No parking / docking chart' : 'No stand coordinates in the charts') + ': stand positions ' + (oSt.length ? 'from OpenStreetMap (' + oSt.length + ' stands' + (K.standNames.length ? ', ' + conf + ' of the ' + K.standNames.length + ' numbers on the chart confirmed' : '') + ')' : T.std ? 'traced on imagery (' + T.std + ')' : 'not available yet — get OpenStreetMap, or trace them on imagery') + '.');
    }
    if (K.standsLeft.length) L.push(K.standsLeft.length + ' stand(s) of the chart left out as doubtful (a misread number?): ' + K.standsLeft.slice(0, 3).map(function (x) { return x.why; }).join('; ') + '.');
    var noThr = c.rwys.some(function (r) { return r.dirs.some(function (d) { return !d.pts.some(function (q) { return /THR$/.test(q.role) && q.c; }); }); });
    var kThr = Object.keys(K.rwy).filter(function (k) { return K.rwy[k].thr; });
    if (noThr) L.push(kThr.length ? 'Runway positions the AIP data set lacks: from the chart (threshold ' + kThr.join(', ') + ').' : 'Runway positions the AIP data set lacks are not in the charts\' text either: ' + (o && AMDBOSM.runways(o).length ? 'from OpenStreetMap.' : 'get OpenStreetMap or use the SCHEMATIC option.'));
    if (!K.lights.length) L.push('No lighting in the charts\' text: ' + (c.ilsDes && Object.keys(c.ilsDes).length || (c.locs || []).length ? 'CAT I lighting is inferred where an ILS serves a runway (ICAO Annex 14).' : 'only what the AIP data set declares.'));
    if (K.twyNames.length && o) { var refs = {}; o.els.forEach(function (e) { if (e.tags.ref && /taxi/.test(e.tags.aeroway || '')) refs[String(e.tags.ref).toUpperCase()] = 1; }); var miss = K.twyNames.filter(function (x) { return !refs[x]; }); L.push(miss.length ? 'Taxiways on the chart but not in OpenStreetMap: ' + miss.slice(0, 12).join(', ') + (miss.length > 12 ? ' …' : '') + ' — trace them on imagery.' : 'Every taxiway the chart names is mapped in OpenStreetMap.'); }
    if (!Object.keys(K.twyW).length) L.push('Taxiway width: ' + (Object.keys(c.twyW || {}).length ? 'from the AIP data set.' : 'not published — the ICAO Annex 14 width of the aerodrome code letter ' + codeOf(c).letter + ' is used.'));
    return '<li><b>' + esc(c.code) + '</b> — ' + L.map(esc).join(' ') + '</li>';
  }
  function uploadView(host, ctx) {
    var list = candidates(ctx.datasets), docs = typeof AMDBDOC !== 'undefined' ? AMDBDOC.list() : [];
    // documents read before their aerodrome was loaded find it now
    docs.forEach(function (d) { if (!d.ad && d.f && list.length) d.ad = AMDBDOC.assign(d.f, list); });
    var ads = list.slice().sort(function (a, b) { return b.rwys.length - a.rwys.length; }).map(function (c) { return c.code; }).filter(function (x, i, a) { return x && a.indexOf(x) === i; });
    var KIND = [['🗂', 'AIP data set', 'AIXM 4.5 / 5.x (.xml), a cycle (.zip)'], ['🧭', 'Aerodrome mapping', 'AMXM (.xml), a package (.zip), GeoPackage, GeoJSON, CSV with WKT, DXF'], ['🌍', 'OpenStreetMap', '.osm, Overpass JSON, GeoJSON with aeroway tags'],
      ['📄', 'The State\'s charts', 'aerodrome, ground movement, parking / docking and lighting charts, AD 2 pages (PDF) — read, checked against ICAO Annex 4; a chart that is a picture is read by OCR'], ['📋', 'Stand tables', 'CSV or text: stand, latitude, longitude'], ['🛰', 'Orthophoto', 'JPEG / PNG with its world file (.jgw / .pgw / .wld, and .prj) — for tracing'],
      ['⛫', 'Obstacles and terrain', 'AIXM obstacle data sets, eTOD Excel / CSV; GeoTIFF, DTED, .hgt, .asc'], ['📎', 'Supporting documents', 'any other file (images, Word, KML …): kept and listed, not read']];
    var h = '<div class="nfo-box amdb-notice" role="note">⚠ ' + NOTICE + ' Everything stays in this browser: files are read here and sent nowhere. <button class="linkbtn" data-amgoto="guide">How to create AMDB data — step by step</button></div>' +
      '<div class="card card-pad up-card"><h3 style="margin-top:0">📤 Upload &amp; sources for aerodrome mapping</h3>' +
      '<div class="up-drop" tabindex="0" role="button" aria-label="Drop files here or choose files"><div class="up-drop-ic" aria-hidden="true">⬆</div><b>Drop files or a folder here, or click to choose</b><div class="muted">As many as you have — every chart of the aerodrome, the AIP data set, the GIS files: each file is recognised and goes where it belongs.</div><input type="file" multiple class="hidden" data-upin aria-label="Files for aerodrome mapping"></div>' +
      '<p class="up-more"><button class="btn small" data-updirbtn>Choose a folder…</button><input type="file" multiple webkitdirectory class="hidden" data-updir aria-label="A folder of charts and data"> <span class="muted">A zip of charts works too.</span></p>' +
      '<div class="up-kinds">' + KIND.map(function (k) { return '<div><span aria-hidden="true">' + k[0] + '</span><b>' + esc(k[1]) + '</b><span class="muted">' + esc(k[2]) + '</span></div>'; }).join('') + '</div>' +
      '<div class="muted up-st">' + (G.upMsg || '') + '</div></div>';
    // online sources and pasted text
    h += '<div class="card card-pad up-card"><div class="gen-src-grid"><div><b>🌍 OpenStreetMap — online, when you click</b><p class="muted">The ICAO code (or the area) of the aerodrome is sent to a public Overpass API server, nothing else. © OpenStreetMap contributors, ODbL 1.0.</p>' +
      (ads.length ? '<select class="inp" data-uposm aria-label="Aerodrome">' + ads.map(function (k) { return '<option>' + esc(k) + '</option>'; }).join('') + '</select> <button class="btn small primary" data-upget>Get OpenStreetMap</button>' : '<span class="muted">Load an AIP data set first (its aerodromes are listed here).</span>') + '<div class="muted osm-st">' + (G.osmMsg || '') + '</div></div>' +
      '<div><b>📋 Paste a stand table or AD 2 text</b><p class="muted">From a chart whose PDF has no text (a scan), copy what you can read: one stand per line, its number and its coordinates.</p><textarea class="inp" data-uptext rows="4" placeholder="e.g.  C3   251530.12N 0513612.34E\n      204  25 15 31.07 N  051 36 14.90 E" style="width:100%;font-family:var(--mono)"></textarea><button class="btn small primary" data-upread>Read the text</button></div></div></div>';
    // the documents
    h += '<div class="card card-pad up-card"><h3 style="margin-top:0">📄 The State\'s charts and documents (' + docs.length + ')</h3>';
    if (!docs.length) h += '<p class="muted">None yet. Best: the Aircraft Parking / Docking Chart (stand coordinates), the Aerodrome Chart (threshold coordinates, dimensions, strength, lighting) and the AD 2 pages. When a State has only an aerodrome chart, or a chart is unclear, what it lacks is filled from OpenStreetMap, from tracing on imagery and from ICAO Annex 14 — each labelled. Commercial charts (e.g. Jeppesen) are licensed for display only and are not read.</p>';
    else {
      var pics = docs.filter(function (d) { return d.image && !d.ocr; });
      if (pics.length) h += '<div class="nfo-box up-ocr" role="note"><b>' + pics.length + ' chart(s) are pictures</b> — their tables (stand and threshold coordinates, taxiways) are an image, not text. <button class="btn small primary" data-dococrall>Read ' + (pics.length > 1 ? 'them all' : 'it') + ' with OCR</button><br><span class="muted">The OCR engine (Tesseract, Apache-2.0, about ' + (typeof AMDBOCR !== 'undefined' ? AMDBOCR.size() : 7) + ' MB) is downloaded once from jsDelivr, checked against its SHA-256 and kept in this browser; the charts are read here and sent nowhere. Reading takes about half a minute per chart.</span></div>';
      h += '<div class="tbl-wrap"><table class="mini-table up-docs"><thead><tr><th>Document</th><th>Type</th><th>Aerodrome</th><th>What it gives</th><th></th></tr></thead><tbody>' + docs.map(function (d) {
        var kd = d.f ? AMDBDOC.KINDS[d.f.kind.id] : null;
        return '<tr data-doc="' + d.id + '"><td><b>' + esc(d.name) + '</b><br><small class="muted">' + num(Math.round(d.size / 1024)) + ' KB' + (d.pages ? ' · ' + d.pages + ' page(s)' : '') + '</small></td><td>' + (kd ? esc(kd.name) + (d.f.kind.icaoTitle ? ' <span title="titled — ICAO" style="color:#1f7a4d">✓</span>' : '') : '<span class="muted">' + esc(d.type === 'image' ? 'image' : 'document') + '</span>') + '</td>' +
          '<td>' + (d.f ? '<select class="inp small" data-docad="' + d.id + '" aria-label="Aerodrome of ' + esc(d.name) + '"><option value="">—</option>' + ads.map(function (k) { return '<option' + (k === d.ad ? ' selected' : '') + '>' + esc(k) + '</option>'; }).join('') + '</select>' : '') + '</td>' +
          '<td class="muted">' + esc(AMDBDOC.gave(d)) + (d.note && d.f ? '<br><span style="color:#b76e00">' + esc(d.note) + '</span>' : '') + '</td>' +
          '<td style="white-space:nowrap">' + (d.image && !d.ocr ? '<button class="btn small primary" data-dococr="' + d.id + '">Read the picture (OCR)</button> ' : '') + (d.f ? '<button class="btn small" data-doccheck="' + d.id + '">' + (G.open[d.id] ? 'Hide check' : 'ICAO check') + '</button> ' : '') + '<button class="btn small" data-docdel="' + d.id + '" aria-label="Remove ' + esc(d.name) + '">✕</button></td></tr>' +
          (G.open[d.id] && d.f ? '<tr class="doc-chk-row"><td colspan="5">' + checkHtml(d, list) + '</td></tr>' : '');
      }).join('') + '</tbody></table></div>' +
        '<p><button class="btn small" data-docrep>Chart check report (PDF)</button></p>';
      var withK = list.filter(function (c, i, a) { return a.findIndex(function (x) { return x.code === c.code; }) === i && AMDBDOC.forAd(c.code, c.arp); });
      if (withK.length) h += '<h4>How the gaps are filled</h4><ul class="up-gaps">' + withK.slice(0, 20).map(gapsHtml).join('') + '</ul>';
    }
    h += '</div>';
    // imagery and data loaded
    var orth = typeof AMDBTRACE !== 'undefined' ? AMDBTRACE.orthos() : [];
    h += '<div class="card card-pad up-card"><h3 style="margin-top:0">🛰 Imagery and tracing</h3><p class="muted">Trace taxiways, aprons, stands, holding positions and buildings on imagery whose licence allows deriving data (national orthophotos, USGS, Sentinel-2 …) or on your own orthophoto; Google and Esri imagery are for a visual check only.' + (orth.length ? ' Your orthophotos: ' + esc(orth.map(function (o) { return o.name; }).join(', ')) + '.' : '') + '</p><button class="btn small primary" data-amgoto="trace">✏️ Trace on imagery</button></div>';
    h += '<div class="card card-pad up-card"><h3 style="margin-top:0">🗂 Data loaded</h3>' + (ctx.datasets.length ? '<ul class="muted">' + ctx.datasets.map(function (d) { return '<li>' + esc(d.name) + ' <small>(' + esc(d.family === 'amxm' ? 'aerodrome mapping (AMXM)' : d.family === 'tab' ? 'table' : 'AIXM ' + (d.version || '')) + ')</small></li>'; }).join('') + '</ul>' : '<p class="muted">No data set yet: drop the State\'s AIP data set above (or open it in Files).</p>') +
      (list.length ? '<button class="btn small" data-amgoto="generate">➡ Generate aerodrome mapping</button>' : '') + '</div>';
    host.innerHTML = h;
    var st = host.querySelector('.up-st'), drop = host.querySelector('.up-drop'), inp = host.querySelector('[data-upin]');
    async function take(files) {
      if (!files || !files.length) return;
      st.innerHTML = '<span class="spinner"></span> …';
      var r;
      try { r = await routeFiles(files, list, function (m) { st.innerHTML = '<span class="spinner"></span> ' + esc(m); }); }
      catch (e) { G.upMsg = '<span style="color:var(--err)">' + esc(e.message) + '</span>'; uploadView(host, ctx); return; }
      G.upMsg = '✓ ' + r.got.map(esc).join('<br>✓ ');
      if (r.data && ctx.amTab) ctx.amTab('upload', true); else uploadView(host, ctx);
    }
    drop.onclick = function () { inp.click(); };
    var dir = host.querySelector('[data-updir]'); host.querySelector('[data-updirbtn]').onclick = function () { dir.click(); };
    dir.onchange = function () { var fl = Array.prototype.slice.call(dir.files); dir.value = ''; take(fl); };
    drop.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click(); } };
    ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); e.stopPropagation(); drop.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); e.stopPropagation(); drop.classList.remove('over'); }); });
    drop.addEventListener('drop', function (e) { take(e.dataTransfer && e.dataTransfer.files); });
    inp.onchange = function () { var fl = Array.prototype.slice.call(inp.files); inp.value = ''; take(fl); };
    host.onchange = function (e) { var t = e.target; if (t.hasAttribute('data-docad')) { AMDBDOC.setAd(+t.getAttribute('data-docad'), t.value); uploadView(host, ctx); } };
    host.onclick = async function (e) {
      var go = e.target.closest('[data-amgoto]'); if (go) { if (ctx.amTab) ctx.amTab(go.getAttribute('data-amgoto')); return; }
      var ck = e.target.closest('[data-doccheck]'); if (ck) { var id = +ck.getAttribute('data-doccheck'); G.open[id] = !G.open[id]; uploadView(host, ctx); return; }
      var dl = e.target.closest('[data-docdel]'); if (dl) { AMDBDOC.remove(+dl.getAttribute('data-docdel')); uploadView(host, ctx); return; }
      if (e.target.closest('[data-upread]')) { var tx = host.querySelector('[data-uptext]').value; if (!tx.trim()) return; await LAZY.run('src-amdbdoc'); var d = AMDBDOC.addText(tx, 'pasted text ' + new Date().toISOString().slice(11, 19), list); G.upMsg = '✓ pasted text: ' + esc(AMDBDOC.gave(d)) + (d.ad ? ' — ' + esc(d.ad) : ' — choose its aerodrome below'); uploadView(host, ctx); return; }
      if (e.target.closest('[data-docrep]')) { docReport(list); return; }
      var oc = e.target.closest('[data-dococr], [data-dococrall]');
      if (oc) {
        var ids = oc.hasAttribute('data-dococrall') ? AMDBDOC.list().filter(function (d) { return d.image && !d.ocr; }).map(function (d) { return d.id; }) : [+oc.getAttribute('data-dococr')], done = [];
        host.querySelectorAll('[data-dococr], [data-dococrall]').forEach(function (b) { b.disabled = true; });
        try {
          for (var q = 0; q < ids.length; q++) {
            var dd = AMDBDOC.get(ids[q]), lab = (ids.length > 1 ? (q + 1) + ' / ' + ids.length + ' ' : '') + dd.name + ': ';
            await AMDBDOC.ocrDoc(ids[q], list, function (m) { st.innerHTML = '<span class="spinner"></span> ' + esc(lab + m); });
            done.push(dd.name + ': ' + AMDBDOC.gave(dd));
          }
          G.upMsg = '✓ ' + done.map(esc).join('<br>✓ ');
        } catch (er) { G.upMsg = (done.length ? '✓ ' + done.map(esc).join('<br>✓ ') + '<br>' : '') + '<span style="color:var(--err)">' + esc(er.message) + '</span>'; }
        uploadView(host, ctx); return;
      }
      if (e.target.closest('[data-upget]')) {
        var code = host.querySelector('[data-uposm]').value, c = list.filter(function (x) { return x.code === code && x.arp; })[0], so = host.querySelector('.osm-st');
        if (!c) { ctx.toast('This aerodrome has no reference point to look about.'); return; }
        if (typeof AMDBOSM === 'undefined') await LAZY.run('src-amdbosm');
        try { var o0 = await AMDBOSM.fetchFor(c, function (m) { so.innerHTML = '<span class="spinner"></span> ' + esc(m); }); G.osmMsg = '✓ ' + esc(code) + ': ' + AMDBOSM.summary(o0).all + ' element(s) from OpenStreetMap.'; }
        catch (er) { G.osmMsg = '<span style="color:var(--err)">' + esc(code + ': ' + er.message) + '</span>'; }
        uploadView(host, ctx);
      }
    };
  }
  // the ICAO Annex 4 check of every chart, and the cross-check with the AIP data set, as a PDF
  function docReport(list) {
    var docs = AMDBDOC.list().filter(function (d) { return d.f; }), secs = [];
    if (!docs.length) return;
    docs.forEach(function (d) {
      var c = list.filter(function (x) { return x.code === d.ad; })[0] || null, chk = AMDBDOC.icaoCheck(d.f, c), K = d.ad ? AMDBDOC.forAd(d.ad, c && c.arp) : null, x = c ? AMDBDOC.crossCheck(K, c, []) : [];
      var blocks = [{ kind: 'note', text: chk.name + (chk.ch ? ' (' + chk.ch + ')' : '') + (d.ad ? ' — ' + d.ad : '') + ' · ' + AMDBDOC.gave(d) }];
      if (chk.items.length) blocks.push({ kind: 'table', cols: ['', 'Annex 4', 'What the chart must show', 'Found in the text'], rows: chk.items.map(function (i) { return [C(ST_ICON[i.st]), C(i.ref), C(i.what), C(i.ev)]; }) });
      if (x.length) blocks.push({ kind: 'table', cols: ['', 'Item', 'Chart', 'AIP data set', 'Difference'], rows: x.map(function (r) { return [C({ ok: '✓', warn: '!', bad: '✗', fill: '+' }[r.st]), C(r.what), C(r.chart), C(r.aip), C(r.diff)]; }) });
      secs.push({ title: d.name, blocks: blocks });
    });
    secs.push({ title: 'How to read this report', blocks: [{ kind: 'note', text: 'The chart\'s text is read: ✓ found · ✗ not found in the text (the chart may show it only as a drawing or a symbol) · ◌ only the drawing can show it · ○ where established. ICAO Annex 4 Chapters 13 (Aerodrome / Heliport Chart), 14 (Aerodrome Ground Movement Chart), 15 (Aircraft Parking / Docking Chart). Made with ' + APP_INFO.name + ' ' + APP_INFO.version + ' — created by ' + APP_INFO.author + '. ' + NOTICE }] });
    EXPORTS.exportPDF({ title: 'The State\'s charts — ICAO Annex 4 check and comparison with the AIP data set', sub: NOTICE, ds: null, sections: secs });
  }
  function cmpSets(ctx) {
    var col = [];
    ctx.datasets.forEach(function (ds, di) {
      var f = AMDB.collect([ds], M).features;
      if (f.length) col.push({ di: di, ds: ds, f: f });
    });
    return col;
  }
  var STC = { added: '#2e7d32', removed: '#c62828', moved: '#ef6c00', 'moved+changed': '#ef6c00', changed: '#1d6fb8', same: '#9aa5b1' };
  function cmpView(host, ctx) {
    var sets = cmpSets(ctx);
    var h = '<div class="nfo-box amdb-notice" role="note">⚠ ' + NOTICE + '</div>';
    if (sets.length < 2) { host.innerHTML = h + '<div class="card card-pad muted">Load two aerodrome mapping data sets (AMXM, AIXM with aerodrome features, a package or a GeoPackage) — e.g. two AIRAC cycles, or the data of two suppliers — to compare them.</div>'; return; }
    if (CMP.a < 0 || !sets.some(function (x) { return x.di === CMP.a; })) CMP.a = sets[0].di;
    if (CMP.b < 0 || !sets.some(function (x) { return x.di === CMP.b; }) || CMP.b === CMP.a) CMP.b = sets.filter(function (x) { return x.di !== CMP.a; })[0].di;
    function opt(sel) { return sets.map(function (x) { return '<option value="' + x.di + '"' + (x.di === sel ? ' selected' : '') + '>' + esc(x.ds.name) + ' (' + num(x.f.length) + ')</option>'; }).join(''); }
    var ads = {}; sets.forEach(function (x) { if (x.di === CMP.a || x.di === CMP.b) x.f.forEach(function (f) { ads[f.ad || '(none)'] = 1; }); });
    h += '<div class="toolbar ov-filter"><label>Before <select class="inp" data-cmp="a">' + opt(CMP.a) + '</select></label><label>After <select class="inp" data-cmp="b">' + opt(CMP.b) + '</select></label>' +
      '<select class="inp" data-cmp="ad" aria-label="Aerodrome"><option value="">All aerodromes</option>' + Object.keys(ads).sort().map(function (a) { return '<option' + (CMP.ad === a ? ' selected' : '') + '>' + esc(a) + '</option>'; }).join('') + '</select>' +
      '<label>moved beyond <select class="inp" data-cmp="tol">' + [0.1, 0.5, 1, 5].map(function (t) { return '<option' + (CMP.tol === t ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select> m</label><button class="btn primary" data-cmpgo>Compare</button>' +
      (CMP.res ? '<span class="sp"></span><span class="btn-group">' + ['pdf:PDF', 'xlsx:Excel', 'csv:CSV', 'json:JSON', 'amxm:Change file (AMXM)'].map(function (f) { var p = f.split(':'); return '<button class="btn small" data-cmprep="' + p[0] + '">' + p[1] + '</button>'; }).join('') + '</span>' : '') + '</div>';
    var r = CMP.res;
    if (r) {
      h += '<div class="kpis ov-kpis">' + [['added', r.n.added], ['removed', r.n.removed], ['moved', r.n.moved], ['changed', r.n.changed], ['unchanged', r.n.same]].map(function (k) { return '<div class="kpi-h"><b style="color:' + STC[k[0] === 'unchanged' ? 'same' : k[0]] + '">' + num(k[1]) + '</b><span>' + k[0] + '</span></div>'; }).join('') + '</div>' +
        '<div class="toolbar"><select class="inp" data-cmp="filter" aria-label="Show"><option value="">All but unchanged</option>' + ['added', 'removed', 'moved', 'changed', 'same'].map(function (x) { return '<option value="' + x + '"' + (CMP.filter === x ? ' selected' : '') + '>' + (x === 'same' ? 'unchanged' : x) + '</option>'; }).join('') + '</select></div>' +
        '<div class="ov-map amdb-map cmp-map" role="application" aria-label="Map of the changes"></div>';
      var shown = rows();
      h += '<div class="tbl-wrap ov-tbl"><table class="mini-table cmp-tbl"><thead><tr><th>Change</th><th>Aerodrome</th><th>Feature</th><th class="num">Moved (m)</th><th>Attributes changed</th></tr></thead><tbody>' +
        shown.slice(0, 1500).map(function (x) { var f = x.b || x.a; return '<tr><td><span class="chip" style="color:' + STC[x.st] + '">' + x.st + '</span></td><td class="mono">' + esc(f.ad) + '</td><td>' + esc(f.t) + (f.label ? ' <b>' + esc(f.label) + '</b>' : '') + '</td><td class="num">' + (x.shift !== null ? x.shift.toFixed(2) : '') + '</td><td>' + esc(x.attrs.join('; ')) + '</td></tr>'; }).join('') + '</tbody></table></div>';
    }
    host.innerHTML = h;
    if (r) {
      var el = host.querySelector('.cmp-map'), mm = DDMAP.create(el, 'amdbcmp'), items = [];
      rows().slice(0, 4000).forEach(function (x) { if (x.a && x.st !== 'added') x.a.g.forEach(function (g) { items.push({ key: x, g: g, color: x.st === 'removed' ? STC.removed : '#9aa5b1', label: 'before · ' + x.a.t + ' ' + (x.a.label || '') }); }); if (x.b) x.b.g.forEach(function (g) { items.push({ key: x, g: g, color: STC[x.st], label: x.st + ' · ' + x.b.t + ' ' + (x.b.label || '') + (x.shift !== null ? ' · ' + x.shift.toFixed(2) + ' m' : '') }); }); });
      DDMAP.shapes(mm, items, { legend: [[STC.added, 'added'], [STC.removed, 'removed'], [STC.moved, 'moved (after)'], [STC.changed, 'changed'], ['#9aa5b1', 'before / unchanged']], onPick: function () {} });
      setTimeout(function () { mm.map.invalidateSize(); }, 60);
    }
    function rows() { return r.rows.filter(function (x) { return CMP.filter ? (x.st === CMP.filter || (CMP.filter !== 'same' && x.st.indexOf(CMP.filter) >= 0)) : x.st !== 'same'; }); }
    host.onchange = function (e) { var k = e.target.getAttribute('data-cmp'); if (!k) return; CMP[k] = k === 'a' || k === 'b' ? +e.target.value : k === 'tol' ? +e.target.value : e.target.value; if (k !== 'filter') CMP.res = null; cmpView(host, ctx); };
    host.onclick = async function (e) {
      if (e.target.closest('[data-cmpgo]')) {
        var A = sets.filter(function (x) { return x.di === CMP.a; })[0].f, B = sets.filter(function (x) { return x.di === CMP.b; })[0].f;
        if (CMP.ad) { A = A.filter(function (f) { return (f.ad || '(none)') === CMP.ad; }); B = B.filter(function (f) { return (f.ad || '(none)') === CMP.ad; }); }
        CMP.res = compare(A, B, CMP.tol); CMP.res.nameA = ctx.datasets[CMP.a].name; CMP.res.nameB = ctx.datasets[CMP.b].name; CMP.filter = '';
        cmpView(host, ctx); return;
      }
      var b = e.target.closest('[data-cmprep]');
      if (b) await cmpReport(b.getAttribute('data-cmprep'), CMP.res, ctx);
    };
  }
  function C(t) { return { t: t === undefined || t === null ? '' : String(t) }; }
  async function cmpReport(fmt, r, ctx) {
    var base = EXPORTS.safeName('AMDB_changes_' + (CMP.ad || 'all') + '_' + new Date().toISOString().slice(0, 10));
    var list = r.rows.filter(function (x) { return x.st !== 'same'; });
    if (fmt === 'amxm') { await LAZY.run('src-amdbpkg'); EXPORTS.download(base + '_AMXM-2.0.xml', new Blob([changeFile(r, r.nameA, r.nameB)], { type: 'text/xml' })); return; }
    if (fmt === 'json') { EXPORTS.download(base + '.json', new Blob([JSON.stringify({ notice: NOTICE, before: r.nameA, after: r.nameB, tolerance_m: r.tol, counts: r.n, changes: list.map(function (x) { var f = x.b || x.a; return { change: x.st, type: f.t, aerodrome: f.ad, label: f.label, moved_m: x.shift, attributes: x.attrs }; }) }, null, 1)], { type: 'application/json' })); return; }
    var sc = { title: 'Aerodrome mapping changes' + (CMP.ad ? ' — ' + CMP.ad : ''), sub: NOTICE, ds: null, sections: [
      { title: 'Summary', blocks: [{ kind: 'kv', rows: [['Before', r.nameA], ['After', r.nameB], ['Moved beyond', r.tol + ' m'], ['Result', r.n.added + ' added, ' + r.n.removed + ' removed, ' + r.n.moved + ' moved, ' + r.n.changed + ' changed, ' + r.n.same + ' unchanged'], ['Made with', APP_INFO.name + ' ' + APP_INFO.version + ' — created by ' + APP_INFO.author]].map(function (x) { return { label: x[0], cells: [C(x[1])] }; }) }] },
      { title: 'Changes', blocks: [{ kind: 'table', cols: ['Change', 'Aerodrome', 'Feature type', 'Feature', 'Moved (m)', 'Attributes changed'], rows: list.map(function (x) { var f = x.b || x.a; return [C(x.st), C(f.ad), C(f.t), C(f.label), C(x.shift !== null ? x.shift.toFixed(2) : ''), C(x.attrs.join('; '))]; }) }] },
      { title: 'Method', blocks: [{ kind: 'note', text: 'Features are matched by type and identifier (AMXM idnumber, AIXM UUID); without a common identifier, by type, aerodrome and label, or the nearest within 50 m. Moved: the largest distance between a vertex of one version and the nearest vertex of the other (both ways), on a local plane about the feature. Changed: any attribute other than source, revision date, identifier and validity. NOT FOR NAVIGATION.' }] }] };
    try { if (fmt === 'pdf') EXPORTS.exportPDF(sc); else if (fmt === 'xlsx') EXPORTS.exportExcel(sc); else if (fmt === 'csv') EXPORTS.exportCSV(sc); } catch (e) { ctx.toast('Report failed: ' + e.message, 6000); }
  }
  /* ------------------------------------------------------------------- guide */
  function guideView(host, ctx) {
    var step = function (n, title, body) { return '<li class="amg-step"><div class="amg-n">' + n + '</div><div><b>' + title + '</b>' + body + '</div></li>'; };
    host.innerHTML = '<div class="nfo-box amdb-notice" role="note">⚠ ' + NOTICE + ' Aerodrome mapping made here is for study, analysis and to prepare data for a certified process — not for operational use.</div>' +
      '<div class="card card-pad amg"><h3 style="margin-top:0">How to create aerodrome mapping (AMDB) data — step by step</h3>' +
      '<p>There are three ways in, from the quickest to the most accurate. They can be combined: start from the AIP, then replace parts with surveyed data. Each item comes from the best source there is, in this order: the AIP data set (A), the State\'s charts (C), what you trace on imagery (T), OpenStreetMap (O), then the ICAO Annex 14 minimum (S) — every feature says which.</p>' +
      '<div class="amg-routes"><div><b>A · AIP data set only</b><span>minutes · coarse</span><p>Runways, shoulders, stopways, thresholds, centre line points, markings and lights as the AIP declares them, navaids, obstacles; taxiways, aprons and stands where the AIP has their geometry.</p></div>' +
      '<div><b>B · Survey, CAD or GIS files</b><span>best accuracy</span><p>Your own surveyed or digitised pavement, guidance lines, holding positions, stands and buildings — AMXM, AIXM, GeoJSON, CSV with WKT, DXF or GeoPackage.</p></div>' +
      '<div><b>C · Both</b><span>recommended</span><p>Generate the frame from the AIP, then load the surveyed files; Compare shows what the survey adds or moves.</p></div></div>' +
      '<ol class="amg-steps">' +
      step(1, 'Load everything in one place (📤 Upload)', '<p><b>Digital data → Aerodrome mapping → 📤 Upload</b> takes every file and sends it where it belongs (Files works too). Drop the State\'s AIXM 5.x AIP data set (a .xml or a cycle .zip). Add any survey or GIS files of the aerodrome: <i>AMXM 2.0</i> (.xml), <i>AIXM</i> aerodrome features, <i>GeoJSON</i> with a property <code>amxm_type</code> per feature (e.g. <code>RunwayElement</code>) in WGS 84, <i>CSV</i> with the columns <code>amxm_type</code> and <code>wkt</code> plus attributes (<code>idarpt</code>, <code>idrwy</code>, <code>idlin</code>, <code>idstd</code> …), <i>DXF</i> with layers named after the AMXM types in WGS 84 / UTM (zone in the file name, e.g. <code>EADD_UTM34N.dxf</code>; the aerodrome code first), or a <i>GeoPackage</i> with one table per type.</p><p>Add <b>the State\'s charts</b> as PDF — the Aircraft Parking / Docking Chart (stand coordinates), the Aerodrome Chart and the Ground Movement Chart (threshold coordinates, dimensions, strength, lighting) and the AD 2 pages: their text is read, each is checked against ICAO Annex 4 (<b>ICAO check</b>) and against the AIP data set. A State with only an aerodrome chart, or an unclear chart, is fine: what it lacks is filled from OpenStreetMap, tracing and Annex 14, and a stand far from all others (a misread number) is left out with a note. Add as many charts as the State has — several PDFs at once, a folder or a .zip — or just the one aerodrome chart: each adds what it carries. A chart that is a picture (a scan, no text) is read with OCR on request (the OCR engine, about 7 MB, is downloaded once and kept in the browser), or paste its stand table. Add <b>OpenStreetMap</b> (Get, or an .osm / Overpass file) and your <b>orthophoto</b> (JPEG / PNG with its world file). Charts of commercial providers (e.g. Jeppesen) are not read: their licence is for display only.</p>') +
      step(2, 'Generate the frame from the AIP (route A or C)', '<p><b>Digital data → Aerodrome mapping (AMDB) → Generate from AIP</b>. Search and tick the aerodromes (<i>Select all</i>, <i>Deselect all</i>), choose what to derive (markings, lights, taxiway surfaces, obstacles and navaids), confirm the notice and click <b>Generate and open</b>. The table shows, per aerodrome, what the AIP gives: runways, thresholds, centre line points, light systems, taxiway and apron geometry, holding positions, stands, navaids and obstacles. The notes list what the AIP names but cannot be drawn (for example taxiways without coordinates) — that is what to survey.</p>') +
      step('2b', 'Trace what no source gives (✏️ Trace on imagery)', '<p>On imagery whose licence allows deriving data — national orthophotos (Netherlands, France, Switzerland, Spain, Austria, Japan, New South Wales, USGS for the United States), Sentinel-2 (2016 for any use; the newest 2025 mosaic for non-commercial use), your own orthophoto or imagery service — trace stands, taxiway centre lines (the surface follows from the width), aprons, holding positions, buildings and service roads over what Generate makes now. Esri imagery is for a visual check only; Google imagery is not offered. Generate again: the traced features are taken in, each saying it was digitised by you, on which imagery, with an unknown accuracy.</p>') +
      step(3, 'Look at it — chart, map and 3D', '<p><b>Features</b> shows every feature type with its AMXM attributes, on a map coloured as an aerodrome chart (switch to colours by type or by source). Choose a base map in the map (offline, street, light grey, satellite, OpenStreetMap…). <b>🗻 3D</b> shows the aerodrome in 3D with its markings, lights (try <i>Night</i>), obstacles and navaids; the Map tab\'s <i>Airport view</i> draws the airport chart.</p>') +
      step(4, 'Check it', '<p><b>AMDB checks</b> runs 36 rules — AMXM schema, PANS-AIM accuracy and integrity, geometry (closed, simple, overlaps, gaps) and functional checks (thresholds on runways, stands on aprons, guidance lines joined). Fix the source data and run it again. The audit report goes out as PDF, Excel, CSV or JSON.</p>') +
      step(5, 'Compare (when you have two versions)', '<p><b>Compare</b>: generated against surveyed, last cycle against this one, or two suppliers — added, removed, moved (by how much) and changed (which attributes), with a map, reports and an AMXM change file.</p>') +
      step(6, 'Record the sources', '<p><b>Sources & quality</b>: for each data set who made it, its licence and date, how it was captured (survey, photogrammetry, CAD, imagery, AIP) and the quality class; tick <i>right of use confirmed</i> only when you have the permission. Generated data is already marked "Derived from AIP / AIXM data", coarse.</p>') +
      step(7, 'Build the package', '<p><b>Build package</b>: custom (aerodromes, feature types, formats) or full — AMXM 2.0 (schema-valid), AIXM 5.1.1, GeoPackage, GeoJSON, KML, Shapefile, CSV, Excel, DXF, ISO 19115 metadata, a report of what is inside and how it was made, guides for GIS and ARINC 816 tools, checksums. <i>For further processing</i> leaves the tool\'s name out and adds a handover record.</p>') +
      step(8, 'Take it further', '<p>Open the package in QGIS or ArcGIS (GeoPackage, Shapefile), in CAD (DXF), or convert the AMXM / GeoPackage with ARINC 816 tools. A package dropped on Files again is verified (✓) and opened.</p>') +
      '</ol><h4>Good to know</h4><ul class="ab-list"><li>Coordinates must be WGS 84 (latitude / longitude), or WGS 84 / UTM in DXF. Convert local grids first (QGIS, your CAD tool).</li><li>Chart PDFs are read for their text (coordinates, names, dimensions, lighting); their drawing is not. A chart that is a picture is read with OCR when you ask (its tables and labels are read; the values are checked like any other chart, but they remain a reading of the chart — check them), or paste its table, or trace on imagery.</li><li>OpenStreetMap data comes under the ODbL: a package that contains it says so, and must be shared alike.</li><li>Generated geometry is indicative: runway shapes come from published ends, width and shoulders; markings and lights without published positions follow the ICAO Annex 14 standard layout; only what the AIP declares is generated.</li><li>Everything stays in your browser; nothing is uploaded.</li></ul>' +
      '<p><button class="btn primary" data-amgoto="upload">Start: 📤 Upload</button> <button class="btn" data-amgoto="generate">Generate from AIP</button> <button class="btn" data-amgoto="trace">✏️ Trace on imagery</button> <button class="btn" data-amgoto="features">Features (chart, map, 3D)</button></p></div>';
    host.onclick = function (e) { var b = e.target.closest('[data-amgoto]'); if (b && ctx.amTab) ctx.amTab(b.getAttribute('data-amgoto')); };
  }
  async function render(tab, host, ctx) {
    if (tab === 'generate') genView(host, ctx);
    else if (tab === 'guide') guideView(host, ctx);
    else if (tab === 'upload') uploadView(host, ctx);
    else if (tab === 'trace') { await LAZY.run('src-amdbtrace'); AMDBTRACE.render(host, ctx, candidates(ctx.datasets), { generated: function () { return G.last; } }); }
    else cmpView(host, ctx);
  }
  return { render: render, readiness: readiness, READY: READY, routeFiles: routeFiles, codeOf: codeOf, TWYW: TWYW, widen: widen, along: along, plane: plane, candidates: candidates, generate: generate, fromGeoJSON: fromGeoJSON, fromCsv: fromCsv, fromDxf: fromDxf, isCsv: isCsv, importFile: importFile, compare: compare, changeFile: changeFile, utmInv: utmInv, parseWkt: parseWkt };
})();
