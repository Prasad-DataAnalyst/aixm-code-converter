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
 * Loaded only when one of these tools is used (src/lazy.js).
 * ========================================================================== */
/* global MODEL, AMDB, AMDBPKG, LAZY, DDMAP, EXPORTS, APP_INFO, AIP */
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
        out.push({ ds: ds, di: di, ad: ad, code: code, name: s(ad.cur.p.name), arp: arp, magVar: parseFloat(s(ad.cur.p.magneticVariation)), rwys: rwys, stands: stands, by: by, obs: obs, navs: navs, lights: lights, dsOf: dsOf, mapped: mapped, amxm: amxm,
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
  var DEF = { markings: true, taxiways: true, obstacles: true, centreline: true, lights: true, schematic: false };
  // aerodrome mapping features made from the AIP data of the aerodromes chosen; opt: which derived items
  function generate(list, opt) {
    opt = Object.assign({}, DEF, opt || {});
    var feats = [], notes = [];
    list.forEach(function (c) {
      var src = 'Generated from AIP data (' + c.ds.name + '): geometry derived, coarse quality', ds = c.ds;
      var srcStd = 'Generated from AIP data (' + c.ds.name + '): standard layout of ICAO Annex 14 Volume I Chapter 5, not surveyed';
      var srcSch = 'SCHEMATIC from AIP data (' + c.ds.name + '): runway positions withheld; placed at the reference point, indicative only', curSchem = false;
      function base(t, key, std) { return { t: t, ad: c.code, id: 'amdb-gen-' + c.code + '-' + key, a: { idarpt: { v: c.code }, source: { v: curSchem ? srcSch : std ? srcStd : src } } }; }
      function push(f) { feats.push(f); return f; }
      if (c.arp) { var f0 = base('AerodromeReferencePoint', 'arp'); f0.g = [{ t: 'P', c: c.arp }]; if (c.name) f0.a.name = { v: c.name.slice(0, 254) }; var el = meters(c.ad.cur.p.fieldElevation); if (el !== null) f0.a.elev = { v: r2(el), u: 'M' }; if (s(c.ad.cur.p.designatorIATA)) f0.a.iata = { v: s(c.ad.cur.p.designatorIATA) }; push(f0); }
      var rwyRings = [];
      c.rwys.forEach(function (r) {
        var d1 = r.dirs[0], d2 = r.dirs[1], heli = r.type === 'FATO'; curSchem = false;
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
        // positions withheld in the AIP (some States): a schematic runway at the reference point, only when asked for
        var schem = false;
        if (!e1 && !e2 && opt.schematic && c.arp && c.rwys.length === 1 && r.len && r.wid) {
          var dn = parseInt((r.des.match(/\d{2}/) || [])[0], 10);
          if (dn) { var tb = (dn * 10 + (isNaN(c.magVar) ? 0 : c.magVar) + 360) % 360; e1 = along(c.arp, (tb + 180) % 360, r.len / 2); e2 = along(c.arp, tb, r.len / 2); schem = true; curSchem = true; notes.push(c.code + ' ' + r.des + ': SCHEMATIC runway — the AIP withholds its positions; placed at the aerodrome reference point, bearing from the designator' + (isNaN(c.magVar) ? '' : ' and the magnetic variation') + ' (indicative, about ±1 km)'); }
        }
        if (e1 && !e2 && d1 && !isNaN(d1.brg) && r.len) e2 = along(e1, d1.brg, r.len);
        if (e2 && !e1 && d2 && !isNaN(d2.brg) && r.len) e1 = along(e2, d2.brg, r.len);
        var idrwy = r.des.split(/[/.]/).map(function (x) { return x.trim(); }).sort(function (a, b) { return parseInt(a, 10) - parseInt(b, 10); }).join('.');
        if (!(e1 && e2 && r.wid)) { notes.push(c.code + ' ' + r.des + ': runway surface not generated (' + (!r.wid ? 'no width' : 'no runway ends, or no threshold with bearing and length') + ')'); }
        else {
          var ring = rect(e1, e2, r.wid), len = r.len || 0;
          var f = push(base(heli ? 'FinalApproachAndTakeOffArea' : 'RunwayElement', 'rwy-' + idrwy)); f.g = [{ t: 'A', c: [ring] }];
          if (schem) f.a.source = { v: 'SCHEMATIC from AIP data (' + c.ds.name + '): runway positions withheld; placed at the reference point, indicative only' }; f.a.idrwy = { v: idrwy }; f.a.status = { v: '1' }; f.label = idrwy;
          if (!heli) { f.a.width = { v: r2(r.wid), u: 'M' }; f.a.length = { v: r2(len), u: 'M' }; }
          surfAttrs(f.a, r.sp, 'surftype', SURF_RWY);
          rwyRings.push({ ring: ring, id: idrwy, sp: r.sp });
          if (!heli && r.shoulder && r.shoulder > r.wid) { // AIXM widthShoulder: the overall width with the shoulders
            var sw2 = (r.shoulder - r.wid) / 2, F = frame(e1, bearing(e1, e2)), L0 = Math.hypot.apply(null, plane(e1).fwd(e2));
            [[-r.wid / 2 - sw2, -r.wid / 2, 'L'], [r.wid / 2, r.wid / 2 + sw2, 'R']].forEach(function (x) { var sh = push(base('RunwayShoulder', 'shd-' + idrwy + '-' + x[2])); sh.g = [{ t: 'A', c: [F.box(0, L0, x[0], x[1])] }]; sh.a.idrwy = { v: idrwy }; sh.a.status = { v: '1' }; surfAttrs(sh.a, r.sp, 'gsurftyp', SURF_GND); delete sh.a.pcn; sh.label = idrwy; });
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
        // lights declared in the AIP (AD 2.14): each light where the AIP gives it, otherwise at the Annex 14 spacing
        if (opt.lights && e1 && e2 && r.wid) {
          var did = {};
          [[d1, e1, e2], [d2, e2, e1]].forEach(function (x) {
            var d = x[0]; if (!d) return;
            var brg = bearing(x[1], x[2]), Lr = Math.hypot.apply(null, plane(x[1]).fwd(x[2])), thrP = pt(d, /^DISTHR$/) || pt(d, /^THR$/) || x[1], F4 = frame(thrP, brg), Ft = frame(x[1], brg);
            var Ld = Math.hypot.apply(null, plane(thrP).fwd(x[2]));
            d.lights.forEach(function (ls, li) {
              var p = ls.cur.p, pos = s(p.position), col = s(p.colour), given = [];
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
            });
          });
        }
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
      if (!c.by.TaxiwayElement.length && !c.by.GuidanceLine.length) notes.push(c.code + ': the AIP data set has no taxiway, apron or guidance line geometry — add survey, CAD or GIS files for them');
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
  var G = { pick: null, ack: false, out: '' }, CMP = { a: -1, b: -1, ad: '', tol: 0.5, res: null, filter: '' };
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
  function readiness(c) {
    var dirs = [], pts = 0, ends = 0;
    c.rwys.forEach(function (r) { r.dirs.forEach(function (d) { dirs.push(d); d.pts.forEach(function (q) { if (q.c) { pts++; if (/^(START|END)/.test(q.role) || !q.role) ends++; } }); }); });
    var thrPos = dirs.filter(function (d) { return d.pts.some(function (q) { return /THR$/.test(q.role) && q.c; }); }).length;
    var any = function (f) { var n = dirs.filter(f).length; return !dirs.length ? 'missing' : n === dirs.length ? 'ok' : n ? 'part' : 'missing'; };
    var anyR = function (f) { var n = c.rwys.filter(f).length; return !c.rwys.length ? 'missing' : n === c.rwys.length ? 'ok' : n ? 'part' : 'missing'; };
    var lightN = dirs.reduce(function (n, d) { return n + d.lights.length; }, 0);
    var st = {
      arp: c.arp ? 'ok' : 'missing',
      thr: !dirs.length ? 'missing' : thrPos === dirs.length ? 'ok' : thrPos ? 'part' : pts ? 'part' : 'missing',
      ends: ends >= c.rwys.length * 2 && c.rwys.length ? 'ok' : ends ? 'part' : 'missing',
      wid: anyR(function (r) { return r.wid; }), shd: anyR(function (r) { return r.shoulder; }),
      dd: any(function (d) { return d.pts.some(function (q) { return Object.keys(q.dd).length; }); }),
      elev: any(function (d) { return d.pts.some(function (q) { return q.elev !== null; }); }),
      brg: any(function (d) { return !isNaN(d.brg); }),
      surf: anyR(function (r) { return r.sp && (s(r.sp.composition) || s(r.sp.classPCN)); }),
      twy: c.by.TaxiwayElement.length || c.by.GuidanceLine.length ? (c.by.Taxiway.length && c.by.TaxiwayElement.length + c.by.GuidanceLine.length < c.by.Taxiway.length ? 'part' : 'ok') : 'missing',
      apn: c.by.ApronElement.length ? 'ok' : 'missing', std: c.stands.length ? 'ok' : 'missing', hold: c.by.TaxiHoldingPosition.length ? 'ok' : 'missing',
      lgt: lightN ? 'ok' : 'missing', nav: c.navs.length ? 'ok' : 'missing', obs: c.obs.length ? 'ok' : 'missing'
    };
    var score = READY.reduce(function (n, x) { return n + (st[x[0]] === 'ok' ? 1 : st[x[0]] === 'part' ? 0.5 : 0); }, 0);
    return { st: st, pct: Math.round(score / READY.length * 100), withheld: c.rwys.length && !pts };
  }
  var RSYM = { ok: '✓', part: '◐', missing: '✗' }, RCOL = { ok: '#1f7a4d', part: '#b76e00', missing: '#b3261e' };
  function readyCsv(list) {
    var rows = [['aerodrome', 'readiness %'].concat(READY.map(function (x) { return x[1]; }))];
    list.forEach(function (c) { var r = readiness(c); rows.push([c.code, r.pct].concat(READY.map(function (x) { return r.st[x[0]]; }))); });
    rows.push([]); rows.push(['item', 'what it gives', 'where it comes from / what to collect']);
    READY.forEach(function (x) { rows.push([x[1], x[2], x[3]]); });
    return '# ' + NOTICE + '\n' + rows.map(function (r) { return r.map(function (v) { v = String(v === undefined ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(','); }).join('\n');
  }
  function readyHtml(list) {
    if (!list.length) return '';
    var cols = list.slice(0, 14), rs = cols.map(readiness);
    return '<details class="gen-ready" open><summary>Data readiness — what the AIP gives for aerodrome mapping (' + cols.length + ' aerodrome(s)' + (list.length > cols.length ? ' of ' + list.length + ' chosen' : '') + ')</summary>' +
      '<div class="tbl-wrap"><table class="mini-table ready-tbl"><thead><tr><th>Item</th>' + cols.map(function (c, i) { return '<th class="num" title="' + esc(c.name) + '">' + esc(c.code) + '<br><small style="color:' + (rs[i].pct >= 70 ? RCOL.ok : rs[i].pct >= 40 ? RCOL.part : RCOL.missing) + '">' + rs[i].pct + '%</small></th>'; }).join('') + '<th>Gives</th><th>Where from / what to collect</th></tr></thead><tbody>' +
      READY.map(function (x) { return '<tr><td><b>' + esc(x[1]) + '</b></td>' + rs.map(function (r) { var v = r.st[x[0]]; return '<td class="num" style="color:' + RCOL[v] + ';font-weight:700" title="' + v + '">' + RSYM[v] + '</td>'; }).join('') + '<td class="muted">' + esc(x[2]) + '</td><td class="muted">' + esc(x[3]) + '</td></tr>'; }).join('') +
      '</tbody></table></div>' + (rs.some(function (r) { return r.withheld; }) ? '<p class="muted">⚠ ' + esc(cols.filter(function (c, i) { return rs[i].withheld; }).map(function (c) { return c.code; }).join(', ')) + ': the AIP withholds the runway positions (no coordinates published). Use survey / CAD / GIS data, or the SCHEMATIC option for an indicative picture.</p>' : '') +
      '<p><span class="muted">✓ available · ◐ partly · ✗ missing</span> <button class="btn small" data-genrep="csv">Readiness report (CSV)</button> <button class="btn small" data-genrep="pdf">Readiness report (PDF)</button></p></details>';
  }
  var GEN_OPTS = [['markings', 'Runway markings (Annex 14 standard layout: threshold, aiming point, touchdown zone, side stripes)'], ['lights', 'Lights declared in the AIP (AD 2.14 / 2.15: runway, approach, guard lights)'], ['centreline', 'Painted runway centre line'], ['taxiways', 'Taxiway surface along guidance lines (from the taxiway width)'], ['obstacles', 'Obstacles, navaid antennas and aerodrome beacons (AD 2.10, AD 2.19, ENR 4.1 — also from obstacle data sets loaded beside the AIP)'], ['schematic', 'SCHEMATIC runway where the AIP withholds positions (single-runway aerodromes: at the reference point, bearing from the designator) — indicative only']];
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
      '<div class="tbl-wrap gen-tbl"><table class="mini-table"><thead><tr><th></th><th>Aerodrome</th><th>Data set</th><th class="num" title="Runways (FATO included)">RWY</th><th class="num" title="Thresholds with a position">THR</th><th class="num" title="Runway centre line points with a position">CL pts</th><th class="num" title="Light systems declared (AD 2.14)">Lights</th><th class="num" title="Taxiway / apron elements and guidance lines with geometry">TWY/APN geom.</th><th class="num" title="Holding positions">Hold</th><th class="num">Stands</th><th class="num" title="Navaid antennas within 6 km">Navaids</th><th class="num" title="Obstacles of the aerodrome">Obst.</th><th class="num" title="Data readiness for aerodrome mapping: what the AIP gives">Ready</th><th>Mapping data already</th></tr></thead><tbody>' +
      list.map(function (c, i) {
        return '<tr data-genrow="' + i + '" data-genkey="' + esc((c.code + ' ' + c.name + ' ' + c.ds.name).toLowerCase()) + '"><td><input type="checkbox" data-gen="' + i + '"' + (G.pick[i] ? ' checked' : '') + (c.rwys.length || c.stands.length || geoN(c) ? '' : ' disabled') + ' aria-label="Generate ' + esc(c.code) + '"></td><td><b>' + esc(c.code) + '</b> ' + esc(c.name) + '</td><td class="muted">' + esc(c.ds.name) + '</td><td class="num">' + c.rwys.length + '</td><td class="num">' + c.thr + '</td><td class="num">' + c.cl + '</td><td class="num">' + lightN(c) + '</td><td class="num">' + geoN(c) + '</td><td class="num">' + c.by.TaxiHoldingPosition.length + '</td><td class="num">' + c.stands.length + '</td><td class="num">' + c.navs.length + '</td><td class="num">' + c.obs.length + '</td><td class="num">' + (function () { var r = readiness(c); return '<b style="color:' + (r.pct >= 70 ? RCOL.ok : r.pct >= 40 ? RCOL.part : RCOL.missing) + '">' + r.pct + '%</b>' + (r.withheld ? ' <span title="runway positions withheld in the AIP">⚠</span>' : ''); })() + '</td><td>' + (c.mapped ? num(c.mapped) + ' AIXM feature(s)' : '') + (c.amxm ? ' AMXM' : '') + (c.mapped || c.amxm ? '' : '<span class="muted">none</span>') + '</td></tr>';
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
    host.onchange = function (e) {
      var t2 = e.target;
      if (t2.hasAttribute('data-gen')) { G.pick[+t2.getAttribute('data-gen')] = t2.checked; filter(); }
      if (t2.hasAttribute('data-genopt')) G.opt[t2.getAttribute('data-genopt')] = t2.checked;
      if (t2.hasAttribute('data-genack')) { G.ack = t2.checked; host.querySelector('[data-gengo]').disabled = !t2.checked; }
    };
    host.onclick = async function (e) {
      var sel = e.target.closest('[data-gensel]'), go = e.target.closest('[data-amgoto]'), rep = e.target.closest('[data-genrep]');
      if (rep) {
        var ch = list.filter(function (c, i) { return G.pick[i]; }); if (!ch.length) ch = list;
        var nm = EXPORTS.safeName('AMDB_data_readiness_' + new Date().toISOString().slice(0, 10));
        if (rep.getAttribute('data-genrep') === 'csv') { EXPORTS.download(nm + '.csv', new Blob([readyCsv(ch)], { type: 'text/csv' })); return; }
        var Cc = function (v) { return { t: v === undefined || v === null ? '' : String(v) }; };
        EXPORTS.exportPDF({ title: 'Aerodrome mapping — data readiness of the AIP', sub: NOTICE, ds: null, sections: [
          { title: 'Readiness by aerodrome', blocks: [{ kind: 'table', cols: ['Aerodrome', 'Readiness'].concat(READY.map(function (x) { return x[1]; })), rows: ch.map(function (c) { var r = readiness(c); return [Cc(c.code + ' ' + c.name), Cc(r.pct + '%')].concat(READY.map(function (x) { return Cc(RSYM[r.st[x[0]]]); })); }) }] },
          { title: 'What each item gives, and where it comes from', blocks: [{ kind: 'table', cols: ['Item', 'Gives', 'Where from / what to collect'], rows: READY.map(function (x) { return [Cc(x[1]), Cc(x[2]), Cc(x[3])]; }) }, { kind: 'note', text: '✓ available · ◐ partly · ✗ missing. Made with ' + APP_INFO.name + ' ' + APP_INFO.version + ' — created by ' + APP_INFO.author + '. ' + NOTICE }] }] });
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
      '<p>There are three ways in, from the quickest to the most accurate. They can be combined: start from the AIP, then replace parts with surveyed data.</p>' +
      '<div class="amg-routes"><div><b>A · AIP data set only</b><span>minutes · coarse</span><p>Runways, shoulders, stopways, thresholds, centre line points, markings and lights as the AIP declares them, navaids, obstacles; taxiways, aprons and stands where the AIP has their geometry.</p></div>' +
      '<div><b>B · Survey, CAD or GIS files</b><span>best accuracy</span><p>Your own surveyed or digitised pavement, guidance lines, holding positions, stands and buildings — AMXM, AIXM, GeoJSON, CSV with WKT, DXF or GeoPackage.</p></div>' +
      '<div><b>C · Both</b><span>recommended</span><p>Generate the frame from the AIP, then load the surveyed files; Compare shows what the survey adds or moves.</p></div></div>' +
      '<ol class="amg-steps">' +
      step(1, 'Load the data (Files)', '<p>Drop the State\'s AIXM 5.x AIP data set (a .xml or a cycle .zip). Add any survey or GIS files of the aerodrome: <i>AMXM 2.0</i> (.xml), <i>AIXM</i> aerodrome features, <i>GeoJSON</i> with a property <code>amxm_type</code> per feature (e.g. <code>RunwayElement</code>) in WGS 84, <i>CSV</i> with the columns <code>amxm_type</code> and <code>wkt</code> plus attributes (<code>idarpt</code>, <code>idrwy</code>, <code>idlin</code>, <code>idstd</code> …), <i>DXF</i> with layers named after the AMXM types in WGS 84 / UTM (zone in the file name, e.g. <code>EADD_UTM34N.dxf</code>; the aerodrome code first), or a <i>GeoPackage</i> with one table per type. Click <b>Extract</b>.</p>') +
      step(2, 'Generate the frame from the AIP (route A or C)', '<p><b>Digital data → Aerodrome mapping (AMDB) → Generate from AIP</b>. Search and tick the aerodromes (<i>Select all</i>, <i>Deselect all</i>), choose what to derive (markings, lights, taxiway surfaces, obstacles and navaids), confirm the notice and click <b>Generate and open</b>. The table shows, per aerodrome, what the AIP gives: runways, thresholds, centre line points, light systems, taxiway and apron geometry, holding positions, stands, navaids and obstacles. The notes list what the AIP names but cannot be drawn (for example taxiways without coordinates) — that is what to survey.</p>') +
      step(3, 'Look at it — chart, map and 3D', '<p><b>Features</b> shows every feature type with its AMXM attributes, on a map coloured as an aerodrome chart (switch to colours by type or by source). Choose a base map in the map (offline, street, light grey, satellite, OpenStreetMap…). <b>🗻 3D</b> shows the aerodrome in 3D with its markings, lights (try <i>Night</i>), obstacles and navaids; the Map tab\'s <i>Airport view</i> draws the airport chart.</p>') +
      step(4, 'Check it', '<p><b>AMDB checks</b> runs 36 rules — AMXM schema, PANS-AIM accuracy and integrity, geometry (closed, simple, overlaps, gaps) and functional checks (thresholds on runways, stands on aprons, guidance lines joined). Fix the source data and run it again. The audit report goes out as PDF, Excel, CSV or JSON.</p>') +
      step(5, 'Compare (when you have two versions)', '<p><b>Compare</b>: generated against surveyed, last cycle against this one, or two suppliers — added, removed, moved (by how much) and changed (which attributes), with a map, reports and an AMXM change file.</p>') +
      step(6, 'Record the sources', '<p><b>Sources & quality</b>: for each data set who made it, its licence and date, how it was captured (survey, photogrammetry, CAD, imagery, AIP) and the quality class; tick <i>right of use confirmed</i> only when you have the permission. Generated data is already marked "Derived from AIP / AIXM data", coarse.</p>') +
      step(7, 'Build the package', '<p><b>Build package</b>: custom (aerodromes, feature types, formats) or full — AMXM 2.0 (schema-valid), AIXM 5.1.1, GeoPackage, GeoJSON, KML, Shapefile, CSV, Excel, DXF, ISO 19115 metadata, a report of what is inside and how it was made, guides for GIS and ARINC 816 tools, checksums. <i>For further processing</i> leaves the tool\'s name out and adds a handover record.</p>') +
      step(8, 'Take it further', '<p>Open the package in QGIS or ArcGIS (GeoPackage, Shapefile), in CAD (DXF), or convert the AMXM / GeoPackage with ARINC 816 tools. A package dropped on Files again is verified (✓) and opened.</p>') +
      '</ol><h4>Good to know</h4><ul class="ab-list"><li>Coordinates must be WGS 84 (latitude / longitude), or WGS 84 / UTM in DXF. Convert local grids first (QGIS, your CAD tool).</li><li>PDF or image charts cannot be read — the tool needs coordinates.</li><li>Generated geometry is indicative: runway shapes come from published ends, width and shoulders; markings and lights without published positions follow the ICAO Annex 14 standard layout; only what the AIP declares is generated.</li><li>Everything stays in your browser; nothing is uploaded.</li></ul>' +
      '<p><button class="btn primary" data-amgoto="generate">Start: Generate from AIP</button> <button class="btn" data-amgoto="features">Features (chart, map, 3D)</button></p></div>';
    host.onclick = function (e) { var b = e.target.closest('[data-amgoto]'); if (b && ctx.amTab) ctx.amTab(b.getAttribute('data-amgoto')); };
  }
  function render(tab, host, ctx) { if (tab === 'generate') genView(host, ctx); else if (tab === 'guide') guideView(host, ctx); else cmpView(host, ctx); }
  return { render: render, readiness: readiness, READY: READY, candidates: candidates, generate: generate, fromGeoJSON: fromGeoJSON, fromCsv: fromCsv, fromDxf: fromDxf, isCsv: isCsv, importFile: importFile, compare: compare, changeFile: changeFile, utmInv: utmInv, parseWkt: parseWkt };
})();
