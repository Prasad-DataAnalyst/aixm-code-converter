/*!
 * AIXM Code Converter
 * Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com> - author of the AIXM Code Converter
 * SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE; keep this notice in all copies)
 * ==========================================================================
 * AIXM Code Converter - obstacle limitation surfaces (ICAO Annex 14, Vol I)
 * Builds the basic obstacle limitation surfaces of every runway from the
 * AIXM data and checks the obstacles (VerticalStructure) against them:
 *   approach (Table 4-1), take-off climb (Table 4-2), transitional (along the
 *   runway strip), inner horizontal (45 m) and conical (5 %).
 * Runway classification: code number from the runway length (1-4) and, per
 * direction, precision (ILS / MLS / GLS in the data), non-precision (an
 * instrument approach lands on it) or non-instrument.
 * Not included: inner approach, inner transitional and balked landing
 * surfaces (OFZ), outer horizontal surface, and transitional surfaces along
 * the sides of the approach surface. Indicative check - the official
 * aerodrome survey and the State's obstacle assessment remain the reference.
 * ========================================================================== */
/* global AX, MODEL, ADCHART */
var OLS = (function () {
  'use strict';
  var M = MODEL, s = M.s, arr = AX.arr, NMM = 1852;

  // Annex 14 Table 4-1 (approach runways) and 4-2 (take-off runways); lengths in m, slopes as ratios
  var APP = {
    NI: { 1: { ie: 60, d: 30, div: 0.10, l1: 1600, s1: 0.05 }, 2: { ie: 80, d: 60, div: 0.10, l1: 2500, s1: 0.04 }, 3: { ie: 150, d: 60, div: 0.10, l1: 3000, s1: 0.0333 }, 4: { ie: 150, d: 60, div: 0.10, l1: 3000, s1: 0.025 } },
    NP: { 1: { ie: 140, d: 60, div: 0.15, l1: 2500, s1: 0.0333 }, 2: { ie: 140, d: 60, div: 0.15, l1: 2500, s1: 0.0333 }, 3: { ie: 280, d: 60, div: 0.15, l1: 3000, s1: 0.02, l2: 3600, s2: 0.025, lh: 8400 }, 4: { ie: 280, d: 60, div: 0.15, l1: 3000, s1: 0.02, l2: 3600, s2: 0.025, lh: 8400 } },
    P: { 1: { ie: 140, d: 60, div: 0.15, l1: 3000, s1: 0.025, l2: 12000, s2: 0.03 }, 2: { ie: 140, d: 60, div: 0.15, l1: 3000, s1: 0.025, l2: 12000, s2: 0.03 }, 3: { ie: 280, d: 60, div: 0.15, l1: 3000, s1: 0.02, l2: 3600, s2: 0.025, lh: 8400 }, 4: { ie: 280, d: 60, div: 0.15, l1: 3000, s1: 0.02, l2: 3600, s2: 0.025, lh: 8400 } }
  };
  var IH_R = { NI: { 1: 2000, 2: 2500, 3: 4000, 4: 4000 }, NP: { 1: 3500, 2: 3500, 3: 4000, 4: 4000 }, P: { 1: 3500, 2: 3500, 3: 4000, 4: 4000 } };
  var CON_H = { NI: { 1: 35, 2: 55, 3: 75, 4: 100 }, NP: { 1: 60, 2: 60, 3: 75, 4: 100 }, P: { 1: 60, 2: 60, 3: 100, 4: 100 } };
  var TR_S = { NI: { 1: 0.20, 2: 0.20, 3: 0.143, 4: 0.143 }, NP: { 1: 0.20, 2: 0.20, 3: 0.143, 4: 0.143 }, P: { 1: 0.143, 2: 0.143, 3: 0.143, 4: 0.143 } };
  var STRIP = { NI: { 1: 30, 2: 40, 3: 75, 4: 75 }, NP: { 1: 70, 2: 70, 3: 140, 4: 140 }, P: { 1: 70, 2: 70, 3: 140, 4: 140 } }; // half width
  var TOC = { 1: { ie: 60, d: 30, div: 0.10, fw: 380, len: 1600, sl: 0.05 }, 2: { ie: 80, d: 60, div: 0.10, fw: 580, len: 2500, sl: 0.04 }, 3: { ie: 180, d: 60, div: 0.125, fw: 1200, len: 15000, sl: 0.02 }, 4: { ie: 180, d: 60, div: 0.125, fw: 1200, len: 15000, sl: 0.02 } };
  var RANK = { NI: 0, NP: 1, P: 2 }, NAME = { NI: 'non-instrument', NP: 'non-precision approach', P: 'precision approach' };

  function toM(q) {
    if (q === undefined || q === null || q === '') return null;
    if (typeof q === 'string') { var m = q.match(/(-?[\d.]+)\s*(FT|M)?/i); return m ? parseFloat(m[1]) * (/FT/i.test(m[2] || '') ? 0.3048 : 1) : null; }
    q = arr(q)[0];
    if (!q || q.nil !== undefined || q.v === undefined) return null;
    var v = parseFloat(q.v); if (isNaN(v)) return null;
    var u = String(q.u || 'M').toUpperCase();
    return u === 'FL' ? v * 30.48 : /FT/.test(u) ? v * 0.3048 : u === 'KM' ? v * 1000 : v;
  }
  // position of p relative to origin o and axis bearing b: [along, cross] in metres (local flat approximation)
  function local(o, b, p) {
    var d = AX.distNM(o, p) * NMM;
    if (d < 0.01) return [0, 0];
    var a = (AX.bearing(o, p) - b) * Math.PI / 180;
    return [d * Math.cos(a), d * Math.sin(a)];
  }
  function at(o, b, along, cross) { var p = AX.dest(o[0], o[1], b, along / NMM); return cross ? AX.dest(p[0], p[1], b + 90, cross / NMM) : p; }

  // approach type of a runway end: precision when an ILS / MLS / GLS serves it, non-precision when an
  // instrument approach lands on it, otherwise non-instrument
  function endType(ds, e, iapDirs) {
    if (e.ils && /ILS|MLS|GLS|GBAS/.test(e.ils.kind)) return 'P';
    if (e.dir && /ILS|PRECISION|CAT/.test(s(e.dir.cur.p.precisionApproachGuidance)) && !/NON/.test(s(e.dir.cur.p.precisionApproachGuidance))) return 'P';
    if (e.dir && iapDirs.has(e.dir)) return 'NP';
    return 'NI';
  }
  function iapRunways(ds) {
    var set = new Set();
    (ds.byType.InstrumentApproachProcedure || []).forEach(function (pr) {
      arr(pr.cur.p.landing).forEach(function (l) { arr(l && l.runway).concat(arr(l && l.runwayDirection)).forEach(function (x) { var t = M.target(ds, x); if (t) set.add(t); }); });
    });
    return set;
  }
  function codeNo(lM) { return lM >= 1800 ? 4 : lM >= 1200 ? 3 : lM >= 800 ? 2 : 1; }

  var cache = new WeakMap();
  // surfaces of one aerodrome: {ad, datum, runways:[{rm, code, type, strip, ext, ends:[{e, type, app, toc, el}]}]}
  function surfaces(ds, ad) {
    var c = cache.get(ds);
    if (!c || c.key !== String(ds.viewDate)) { c = { key: String(ds.viewDate), map: new Map(), iap: iapRunways(ds) }; cache.set(ds, c); }
    if (c.map.has(ad)) return c.map.get(ad);
    var m = ADCHART.of(ds, ad), out = null;
    if (m && m.runways.length) {
      var fe = toM(ad.cur.p.fieldElevation), thrEls = [];
      var rws = m.runways.map(function (rm) {
        var code = codeNo(rm.lM), ends = rm.ends.map(function (e) {
          var el = toM(e.elev);
          if (el !== null) thrEls.push(el);
          return { e: e, type: endType(ds, e, c.iap), el: el };
        });
        var type = ends.reduce(function (t, x) { return RANK[x.type] > RANK[t] ? x.type : t; }, 'NI');
        var ws = toM(rm.rw.cur.p.widthStrip);
        return { rm: rm, code: code, type: type, ends: ends, strip: ws ? ws / 2 : STRIP[type][code], ext: code === 1 && type === 'NI' ? 30 : 60 };
      });
      var datum = fe !== null ? fe : thrEls.length ? Math.min.apply(null, thrEls) : 0;
      rws.forEach(function (r) { r.ends.forEach(function (x) { if (x.el === null) x.el = datum; }); });
      out = { ad: ad, datum: datum, runways: rws };
    }
    c.map.set(ad, out);
    return out;
  }

  // lowest permitted elevation (m) at p over all surfaces of the aerodrome -> {h, surface} or null
  function limitAt(S, p) {
    var best = null;
    function take(h, name) { if (h !== null && (!best || h < best.h)) best = { h: h, surface: name }; }
    S.runways.forEach(function (r) {
      var rm = r.rm, L = AX.distNM(rm.a, rm.b) * NMM, q = local(rm.a, rm.brg, p), sAl = q[0], t = Math.abs(q[1]);
      var e0 = r.ends.filter(function (x) { return x.e.at === rm.a; })[0] || r.ends[0], e1 = r.ends.filter(function (x) { return x !== e0; })[0] || e0;
      var ih = S.datum + 45, R = IH_R[r.type][r.code], H = CON_H[r.type][r.code];
      // inner horizontal and conical: distance to the runway strip centre line
      var sc = Math.max(-r.ext, Math.min(L + r.ext, sAl)), dist = Math.sqrt(Math.pow(sAl - sc, 2) + t * t);
      if (dist <= R) take(ih, 'Inner horizontal');
      else if (dist <= R + H / 0.05) take(ih + (dist - R) * 0.05, 'Conical');
      // transitional along the strip
      if (sAl >= -r.ext && sAl <= L + r.ext && t > r.strip) {
        var f = Math.max(0, Math.min(1, sAl / (L || 1))), base = e0.el + (e1.el - e0.el) * f, h = base + (t - r.strip) * TR_S[r.type][r.code];
        if (h <= ih) take(h, 'Transitional');
      }
      r.ends.forEach(function (x) {
        var e = x.e, P = APP[x.type][r.code], back = (e.hdg + 180) % 360, qa = local(e.land, back, p), xa = qa[0] - P.d, ya = Math.abs(qa[1]);
        if (xa >= 0 && ya <= P.ie / 2 + xa * P.div) {
          var hh = null, l1 = P.l1, l2 = P.l2 || 0, lh = P.lh || 0;
          if (xa <= l1) hh = xa * P.s1;
          else if (l2 && xa <= l1 + l2) hh = l1 * P.s1 + (xa - l1) * P.s2;
          else if (lh && xa <= l1 + l2 + lh) hh = l1 * P.s1 + l2 * P.s2;
          if (hh !== null) take(x.el + hh, 'Approach RWY ' + e.desig);
        }
        // take-off climb for departures in this end's direction, from the far end of the runway
        var T = TOC[r.code], other = e.at === rm.a ? rm.b : rm.a, der = r.ends.filter(function (y) { return y !== x; })[0], derEl = der ? der.el : x.el;
        var qt = local(other, e.hdg, p), xt = qt[0] - T.d, yt = Math.abs(qt[1]);
        if (xt >= 0 && xt <= T.len && yt <= Math.min(T.fw / 2, T.ie / 2 + xt * T.div)) take(derEl + xt * T.sl, 'Take-off climb RWY ' + e.desig);
      });
    });
    return best;
  }

  // obstacles (VerticalStructure) penetrating the surfaces of the aerodrome, worst first;
  // obsSets: data sets whose obstacles are checked (default: the aerodrome's own data set), e.g. a separate eTOD file
  function check(ds, ad, obsSets) {
    var S = surfaces(ds, ad);
    if (!S) return null;
    var arp = M.pointOf(ds, ad) || S.runways[0].rm.a, out = [], checked = 0, seen = new Set();
    (obsSets && obsSets.length ? obsSets : [ds]).forEach(function (ods) { (ods.byType.VerticalStructure || []).forEach(function (o) { checkOne(ods, o); }); });
    function checkOne(ds, o) {
      var c = M.pointOf(ds, o);
      if (!c || AX.distNM(arp, c) > 11) return;
      if (seen.has(o.id)) return; seen.add(o.id);
      var part = arr(o.cur.p.part)[0] || {}, loc = arr(part.horizontalProjection_location || part.horizontalProjection_surface || part.horizontalProjection_curve)[0];
      var top = loc ? toM(loc.elevation) : null, est = false;
      if (top === null) { var h = toM(part.verticalExtent); if (h === null) return; top = S.datum + h; est = true; }
      checked++;
      var g = M.geometry(ds, o), pts = [];
      (function walk(x) { if (!x) return; if (x.t === 'M') x.parts.forEach(walk); else if (x.t === 'P') pts.push(x.c); else if (x.t === 'L') pts = pts.concat(x.c); else if (x.t === 'A') pts = pts.concat(x.c[0]); })(g);
      if (!pts.length) pts = [c];
      var worst = null;
      pts.forEach(function (p) { if (typeof p[0] !== 'number') return; var lim = limitAt(S, p); if (lim && top - lim.h > 0.05 && (!worst || top - lim.h > worst.pen)) worst = { pen: top - lim.h, lim: lim, at: p }; });
      if (worst) out.push({ rec: o, ds: ds, name: M.label(ds, o), type: s(o.cur.p.type).replace(/^OTHER:/, ''), top: top, est: est, allowed: worst.lim.h, surface: worst.lim.surface, pen: worst.pen, at: worst.at,
        from: Math.round(AX.distNM(arp, worst.at) * 10) / 10 + ' NM ' + ('00' + Math.round(AX.bearing(arp, worst.at))).slice(-3) + '°T from ARP' });
    }
    out.sort(function (a, b) { return b.pen - a.pen; });
    return { surfaces: S, list: out, checked: checked };
  }
  // runway classification used, as text ("RWY 09L/27R code 4, precision approach (09L), non-precision approach (27R)")
  function describe(S) {
    return S.runways.map(function (r) {
      return 'RWY ' + r.rm.name + ': code ' + r.code + ', strip ±' + Math.round(r.strip) + ' m; ' + r.ends.map(function (x) { return x.e.desig + ' ' + NAME[x.type]; }).join(', ');
    }).join('\n') + '\nElevation datum ' + Math.round(S.datum) + ' m (inner horizontal ' + Math.round(S.datum + 45) + ' m)';
  }

  // geometry for drawing: [{name, kind, quads:[[[lon,lat,elev] x4]], ring?}]
  function geometry(S) {
    var out = [], ih = S.datum + 45;
    S.runways.forEach(function (r) {
      var rm = r.rm, L = AX.distNM(rm.a, rm.b) * NMM;
      r.ends.forEach(function (x) {
        var e = x.e, P = APP[x.type][r.code], back = (e.hdg + 180) % 360, quads = [], secs = [[0, P.l1, 0, P.s1]];
        if (P.l2) secs.push([P.l1, P.l1 + P.l2, P.l1 * P.s1, P.s2]);
        if (P.lh) secs.push([P.l1 + P.l2, P.l1 + P.l2 + P.lh, P.l1 * P.s1 + P.l2 * P.s2, 0]);
        secs.forEach(function (sc) {
          var w0 = P.ie / 2 + sc[0] * P.div, w1 = P.ie / 2 + sc[1] * P.div, h0 = x.el + sc[2], h1 = h0 + (sc[1] - sc[0]) * sc[3];
          quads.push([at(e.land, back, P.d + sc[0], -w0).concat(h0), at(e.land, back, P.d + sc[0], w0).concat(h0), at(e.land, back, P.d + sc[1], w1).concat(h1), at(e.land, back, P.d + sc[1], -w1).concat(h1)]);
        });
        out.push({ name: 'Approach RWY ' + e.desig, kind: 'app', quads: quads });
        var T = TOC[r.code], other = e.at === rm.a ? rm.b : rm.a, der = r.ends.filter(function (y) { return y !== x; })[0], derEl = der ? der.el : x.el;
        var xw = (T.fw / 2 - T.ie / 2) / T.div, tq = [];
        tq.push([at(other, e.hdg, T.d, -T.ie / 2).concat(derEl), at(other, e.hdg, T.d, T.ie / 2).concat(derEl), at(other, e.hdg, T.d + xw, T.fw / 2).concat(derEl + xw * T.sl), at(other, e.hdg, T.d + xw, -T.fw / 2).concat(derEl + xw * T.sl)]);
        if (xw < T.len) tq.push([at(other, e.hdg, T.d + xw, -T.fw / 2).concat(derEl + xw * T.sl), at(other, e.hdg, T.d + xw, T.fw / 2).concat(derEl + xw * T.sl), at(other, e.hdg, T.d + T.len, T.fw / 2).concat(derEl + T.len * T.sl), at(other, e.hdg, T.d + T.len, -T.fw / 2).concat(derEl + T.len * T.sl)]);
        out.push({ name: 'Take-off climb RWY ' + e.desig, kind: 'toc', quads: tq });
      });
      var e0 = r.ends.filter(function (x) { return x.e.at === rm.a; })[0] || r.ends[0], e1 = r.ends.filter(function (x) { return x !== e0; })[0] || e0;
      var dx = (ih - Math.min(e0.el, e1.el)) / TR_S[r.type][r.code];
      [-1, 1].forEach(function (sd) {
        out.push({ name: 'Transitional RWY ' + rm.name, kind: 'tr', quads: [[at(rm.a, rm.brg, -r.ext, sd * r.strip).concat(e0.el), at(rm.a, rm.brg, L + r.ext, sd * r.strip).concat(e1.el), at(rm.a, rm.brg, L + r.ext, sd * (r.strip + dx)).concat(ih), at(rm.a, rm.brg, -r.ext, sd * (r.strip + dx)).concat(ih)]] });
      });
      // inner horizontal and conical: stadium around the strip
      var R = IH_R[r.type][r.code], H = CON_H[r.type][r.code], A = at(rm.a, rm.brg, -r.ext, 0), B = at(rm.a, rm.brg, L + r.ext, 0);
      function stadium(rad) {
        var pts = [], i;
        for (i = 0; i <= 18; i++) pts.push(AX.dest(B[0], B[1], rm.brg - 90 + i * 10, rad / NMM));
        for (i = 0; i <= 18; i++) pts.push(AX.dest(A[0], A[1], rm.brg + 90 + i * 10, rad / NMM));
        return pts;
      }
      out.push({ name: 'Inner horizontal', kind: 'ih', ring: stadium(R).map(function (p) { return p.concat(ih); }) });
      out.push({ name: 'Conical', kind: 'con', inner: stadium(R).map(function (p) { return p.concat(ih); }), outer: stadium(R + H / 0.05).map(function (p) { return p.concat(ih + H); }) });
    });
    return out;
  }

  return { surfaces: surfaces, check: check, limitAt: limitAt, geometry: geometry, describe: describe, codeNo: codeNo, TABLES: { APP: APP, TOC: TOC, IH_R: IH_R, CON_H: CON_H, TR_S: TR_S } };
})();
