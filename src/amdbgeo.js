/*!
 * AIXM Code Converter
 * Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com> - author of the AIXM Code Converter
 * SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE; keep this notice in all copies)
 * ==========================================================================
 * AIXM Code Converter - the State's charts placed on the map (AMDBGEO)
 * NOT FOR NAVIGATION - for study and analysis only.
 * A chart of the aerodrome (aerodrome, ground movement, parking / docking or lighting chart; a PDF with text, or a
 * picture read by OCR) is placed on the map by the points it shows that the data already knows:
 *   Points    the words of the drawing at their place on the page — stand numbers, runway designators, "ARP",
 *             coordinates written beside a point — matched to the stands, thresholds and reference point of the
 *             aerodrome (AIP data set, the chart's own tables, OpenStreetMap, tracing); a robust fit (scale, rotation,
 *             shift) leaves out the words that do not agree. Points given by hand (a point on the chart and the same
 *             point on the map, or a known point) are added and always kept.
 *   Fit       how far each point lies from where the placed chart puts it (metres), their root mean square and the
 *             largest, the chart's scale (1 : n) and rotation.
 *   Use       the chart as imagery to trace on (Trace on imagery); taxiway names put from the chart's labels on the
 *             taxiway centre lines that have none; hot spots at their labels.
 * Loaded only when used (src/lazy.js).
 * ========================================================================== */
/* global AMDB, AMDBDOC, AMDBOCR, LAZY, L */
var AMDBGEO = (function () {
  'use strict';
  var D2R = Math.PI / 180, PT = 0.0254 / 72, KEY = 'aixm-amdb-chartfit';
  function esc(t) { return String(t === undefined || t === null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function r1(x) { return Math.round(x * 10) / 10; }
  // a word of a chart as a name: upper case, without the punctuation around it
  function norm(t) { return String(t || '').toUpperCase().replace(/^[\s([{"'“‘.,:;*•-]+|[\s)\]}"'”’.,:;*•-]+$/g, '').replace(/^(STAND|STD|GATE)[\s.:-]*/, ''); }
  function desNorm(t) { var m = /^0?(\d)([LRC]?)$/.exec(t); return m ? '0' + m[1] + m[2] : t; }

  /* ------------------------------------------------------------------ the fit */
  // a similarity (scale, rotation, shift) from chart points (x, y: points of the page, y up) to the plane (E, N metres),
  // by least squares; w weights a point (points given by hand count more)
  function lsq(P) {
    var n = 0, mx = 0, my = 0, mE = 0, mN = 0;
    P.forEach(function (p) { var w = p.w || 1; n += w; mx += w * p.x; my += w * p.y; mE += w * p.E; mN += w * p.N; });
    if (!n) return null;
    mx /= n; my /= n; mE /= n; mN /= n;
    var sxx = 0, sa = 0, sb = 0;
    P.forEach(function (p) { var w = p.w || 1, x = p.x - mx, y = p.y - my, E = p.E - mE, N = p.N - mN; sxx += w * (x * x + y * y); sa += w * (x * E + y * N); sb += w * (x * N - y * E); });
    if (!sxx) return null;
    var a = sa / sxx, b = sb / sxx;
    return { a: a, b: b, tx: mE - (a * mx - b * my), ty: mN - (b * mx + a * my) };
  }
  function at(T, x, y) { return [T.a * x - T.b * y + T.tx, T.b * x + T.a * y + T.ty]; }
  function back(T, E, N) { var s2 = T.a * T.a + T.b * T.b, e = E - T.tx, n = N - T.ty; return [(T.a * e + T.b * n) / s2, (-T.b * e + T.a * n) / s2]; }
  function resid(T, p) { var q = at(T, p.x, p.y); return Math.hypot(q[0] - p.E, q[1] - p.N); }
  function scaleOf(T) { return Math.hypot(T.a, T.b); }
  // a chart point that agrees within tol (points of the page, at the chart's scale) is kept; each known point and each
  // word of the chart is used once, the closest first
  function inliers(C, T, tolM) {
    var rs = [];
    C.forEach(function (p, i) { var r = resid(T, p); if (r < tolM) rs.push({ i: i, r: r }); });
    rs.sort(function (a, b) { return a.r - b.r; });
    var ids = {}, labs = {}, out = [];
    rs.forEach(function (o) { var p = C[o.i]; if (ids[p.id] || labs[p.lab]) return; ids[p.id] = labs[p.lab] = 1; out.push(p); });
    return out;
  }
  // the fit that the most chart points agree with: every two points of different names propose one (at most about
  // 6 000 pairs, drawn the same way each time), the points within 14 page points (5 mm on paper) of it agree;
  // then least squares on those that agree, three times, closing in to three times the root mean square
  function robust(C, hand, cap) {
    hand = hand || []; cap = cap || 1e9;
    var n = C.length, pairs = [], best = null, seed = 12345;
    function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
    if (n * (n - 1) / 2 <= 6000) { for (var i = 0; i < n; i++) for (var j = i + 1; j < n; j++) pairs.push([i, j]); }
    else for (var k = 0; k < 6000; k++) pairs.push([Math.floor(rnd() * n), Math.floor(rnd() * n)]);
    var H = hand.map(function (p) { return Object.assign({ w: 4 }, p); });
    pairs.forEach(function (ij) {
      var A = C[ij[0]], B = C[ij[1]];
      if (!A || !B || A === B || A.id === B.id || A.lab === B.lab) return;
      var dc = Math.hypot(A.x - B.x, A.y - B.y), dg = Math.hypot(A.E - B.E, A.N - B.N);
      if (dc < 8 || dg < 25) return;
      var s = dg / dc; if (s < 0.02 || s > 120) return;
      var T = lsq(H.concat([A, B])); if (!T) return;
      var inl = inliers(C, T, Math.max(10, Math.min(cap, 14 * scaleOf(T))));
      if (inl.length < 2) return;
      if (H.length && H.some(function (p) { return resid(T, p) > Math.max(30, 20 * scaleOf(T)); })) return;
      var sr = inl.reduce(function (o, p) { return o + resid(T, p); }, 0);
      if (!best || inl.length > best.inl.length || (inl.length === best.inl.length && sr < best.sr)) best = { T: T, inl: inl, sr: sr };
    });
    var T, inl;
    if (best) { T = best.T; inl = best.inl; }
    else if (H.length >= 2) { T = lsq(H); inl = []; }
    else return null;
    for (var it = 0; it < 3; it++) {
      var T2 = lsq(inl.concat(H)); if (!T2) break; T = T2;
      var rr = inl.map(function (p) { return resid(T, p); }), rms = rr.length ? Math.sqrt(rr.reduce(function (o, x) { return o + x * x; }, 0) / rr.length) : 0;
      if (!C.length) break;
      inl = inliers(C, T, Math.max(10, Math.min(cap, 14 * scaleOf(T), 3 * rms + 5)));
    }
    return summary(T, inl, H);
  }
  function summary(T, inl, H) {
    var all = inl.concat(H), rr = all.map(function (p) { return resid(T, p); }), s = scaleOf(T);
    all.forEach(function (p, i) { p.res = r1(rr[i]); });
    var rms = rr.length ? Math.sqrt(rr.reduce(function (o, x) { return o + x * x; }, 0) / rr.length) : 0;
    return { T: T, inl: inl, hand: H, n: all.length, rms: r1(rms), max: r1(rr.length ? Math.max.apply(null, rr) : 0), scale: Math.round(s / PT / 100) * 100, rot: Math.round(((Math.atan2(T.b, T.a) / D2R) + 360) % 360 * 10) / 10, s: s };
  }

  /* ---------------------------------------------------------- the chart points */
  // the points the data knows: stands, thresholds, the reference point (the features Generate makes now)
  function knownOf(feats) {
    var by = {}, list = [];
    function add(id, kind, c, name) { var k = kind + ':' + id; if (by[k]) return; by[k] = { id: id, kind: kind, c: c, name: name }; list.push(by[k]); }
    (feats || []).forEach(function (f) {
      var g = f.g && f.g[0]; if (!g || g.t !== 'P' || typeof g.c[0] !== 'number') return;
      if (f.t === 'ParkingStandLocation' && f.a.idstd && norm(f.a.idstd.v)) add(norm(f.a.idstd.v), 'std', g.c, 'stand ' + f.a.idstd.v);
      else if (f.t === 'RunwayThreshold' && f.a.idthr) add(desNorm(norm(f.a.idthr.v)), 'thr', g.c, 'threshold ' + f.a.idthr.v);
      else if (f.t === 'AerodromeReferencePoint') add('ARP', 'arp', g.c, 'reference point');
    });
    return list;
  }
  var LATW = /^(\d{1,2})°\s?(\d{2})['’]\s?(\d{2}(?:[.,]\d+)?)["”']{0,2}\s?([NS])$|^(\d{6}(?:[.,]\d+)?)([NS])$/, LONW = /^(\d{2,3})°\s?(\d{2})['’]\s?(\d{2}(?:[.,]\d+)?)["”']{0,2}\s?([EW])$|^(\d{7}(?:[.,]\d+)?)([EW])$/;
  // the candidates of a page: each word that names a known point, and each coordinate written on the chart (its
  // writing and the position it gives); x, y in points of the page with y up
  function candidates(d, p, known, origin) {
    var W = d.pagePt[p][0], Hh = d.pagePt[p][1], P = AMDB.plane(origin[0], origin[1]), by = {}, out = [];
    known.forEach(function (k) { (by[k.id] = by[k.id] || []).push(k); });
    var ls = (d.labels || []).filter(function (l) { return l.p === p; });
    ls.forEach(function (l, i) {
      var t = norm(AMDBDOC.clean(l.t)), list = (by[t] || []).concat(/^\d{1,2}[LRC]?$/.test(t) && t !== desNorm(t) ? by[desNorm(t)] || [] : []);
      list.forEach(function (k) { var q = P.fwd(k.c); out.push({ x: l.u * W, y: -l.v * Hh, E: q[0], N: q[1], c: k.c, id: k.kind + ':' + k.id, lab: i, kind: k.kind, name: k.name, text: l.t }); });
    });
    // coordinates written beside a point: a latitude and the longitude after it (on its line, or under it)
    ls.forEach(function (l, i) {
      var a = AMDBDOC.clean(l.t); if (!LATW.test(a)) return;
      var hh = Math.max(l.h, 0.004), lo = null;
      ls.forEach(function (m, j) { if (j === i || !LONW.test(AMDBDOC.clean(m.t))) return; var dx = (m.u - l.u) * W / Math.max(W, Hh), dy = (m.v - l.v) * Hh / Math.max(W, Hh); var ok = (Math.abs(dy) < hh * 1.2 && dx > 0 && dx < hh * 25) || (Math.abs(dx) < hh * 8 && dy > 0 && dy < hh * 3); if (ok && (!lo || Math.hypot(dx, dy) < lo.d)) lo = { m: m, j: j, d: Math.hypot(dx, dy) }; });
      if (!lo) return;
      var cs = AMDBDOC.coordsIn(AMDBDOC.clean(a + ' ' + lo.m.t)); if (cs.length !== 1) return;
      var c = [cs[0].lon, cs[0].lat], q = P.fwd(c); if (Math.hypot(q[0], q[1]) > 15000) return;
      out.push({ x: (l.u + lo.m.u) / 2 * W, y: -(l.v + lo.m.v) / 2 * Hh, E: q[0], N: q[1], c: c, id: 'xy:' + c[0].toFixed(6) + ',' + c[1].toFixed(6), lab: i, kind: 'xy', name: 'coordinates written on the chart', text: l.t + ' ' + lo.m.t });
    });
    return out;
  }

  /* ---------------------------------------------------------------- placement */
  var FIT = {}; // document id -> { p, hand: [], auto, cand, F (summary), o (image and corners), origin }
  function docKey(d) { return d.name + '|' + d.size; }
  function stored() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } }
  function keep(d) { var all = stored(), F = FIT[d.id]; if (F) all[docKey(d)] = { p: F.p, auto: !!F.auto, hand: F.hand.map(function (h) { return { x: h.x, y: h.y, c: h.c, name: h.name }; }) }; else delete all[docKey(d)]; try { localStorage.setItem(KEY, JSON.stringify(all)); } catch (e) { /* kept for this session */ } }
  function placeable(d) { return d && d.bytes && d.pagePt && /^(adc|agmc|apdc|alc|other)$/.test(d.f ? d.f.kind.id : 'other'); }
  // what a chart of each kind can be: its scale (1 : n) and how far its words may lie from what they name (metres)
  var KIND = { apdc: [1000, 20000, 40], agmc: [2000, 40000, 80], adc: [4000, 100000, 150], alc: [1000, 100000, 150], other: [1000, 100000, 150] };
  // the fit of a document: automatically from its words and its runways drawn as bars (auto), with the points given
  // by hand
  function fitDoc(d, known, origin, opt) {
    opt = opt || {};
    var F = FIT[d.id] = FIT[d.id] || { p: 1, hand: [], auto: false };
    if (opt.auto !== undefined) F.auto = opt.auto;
    F.origin = origin;
    var lim = KIND[d.f ? d.f.kind.id : 'other'] || KIND.other;
    var P = AMDB.plane(origin[0], origin[1]), pages = Object.keys(d.pagePt).map(Number), best = null;
    var hand = F.hand.map(function (h) { var q = P.fwd(h.c); return { x: h.x, y: h.y, E: q[0], N: q[1], c: h.c, id: 'hand:' + h.x + ',' + h.y, lab: 'h' + h.x + ',' + h.y, kind: 'hand', name: h.name || 'given by hand' }; });
    var ok = function (r) { return r && r.scale >= lim[0] * 0.8 && r.scale <= lim[1] * 1.25; };
    (F.hand.length || opt.page ? [opt.page || F.p] : pages).forEach(function (p) {
      var C = F.auto ? candidates(d, p, known, origin) : [], tries = [hand];
      // the runways drawn as bars, their ends at the ends of the runways the data knows (the likeliest ways first)
      if (F.auto && opt.bars && opt.rwys && opt.rwys.length && p === opt.page) fromBars(opt.bars, opt.rwys, d.pagePt[p], P, lim).forEach(function (h) { tries.push(hand.concat(h)); });
      tries.forEach(function (H) {
        var r = C.length || H.length >= 2 ? robust(C, H, lim[2]) : null;
        if (!ok(r) || !(r.n >= 3 || H.length >= 2)) return;
        var sc = r.inl.length * 10 + r.hand.length * 3 - r.rms / 50;
        if (!best || sc > best.sc) best = { p: p, r: r, C: C, sc: sc };
      });
    });
    if (!best) { F.F = null; F.why = F.auto ? 'not enough of its words name a known stand, threshold or the reference point, and no runway drawn as a bar matches — add points by hand' : 'give at least two points by hand'; return F; }
    F.p = best.p; F.F = best.r; F.cand = best.C.length; F.why = '';
    return F;
  }
  // the runways of the data (from Generate): their two ends along the runway and their length
  function runwaysOf(feats) {
    var by = {};
    (feats || []).forEach(function (f) { if (f.t !== 'RunwayElement' || !f.g[0] || f.g[0].t !== 'A') return; var k = f.a.idrwy ? f.a.idrwy.v : f.id; (by[k] = by[k] || []).push(f.g[0].c[0]); });
    return Object.keys(by).map(function (k) {
      var pts = [].concat.apply([], by[k]), o = pts[0], P = AMDB.plane(o[0], o[1]), q = pts.map(P.fwd), mx = 0, my = 0;
      q.forEach(function (v) { mx += v[0] / q.length; my += v[1] / q.length; });
      var sxx = 0, syy = 0, sxy = 0; q.forEach(function (v) { sxx += (v[0] - mx) * (v[0] - mx); syy += (v[1] - my) * (v[1] - my); sxy += (v[0] - mx) * (v[1] - my); });
      var th = 0.5 * Math.atan2(2 * sxy, sxx - syy), ux = Math.cos(th), uy = Math.sin(th), t = q.map(function (v) { return (v[0] - mx) * ux + (v[1] - my) * uy; });
      var t0 = Math.min.apply(null, t), t1 = Math.max.apply(null, t);
      return { id: k, ends: [P.inv([mx + ux * t0, my + uy * t0]), P.inv([mx + ux * t1, my + uy * t1])], len: t1 - t0 };
    }).filter(function (r) { return r.len > 300; });
  }
  // the ways the bars of a chart may be the runways of the data: each runway on a bar of its own, either way round;
  // a bar must be as long as its runway at the scale they make together; the four likeliest, as points given by hand
  function fromBars(B, R, pt, P, lim) {
    R = R.slice().sort(function (a, b) { return b.len - a.len; }).slice(0, Math.min(4, B.length));
    B = B.slice(0, Math.min(B.length, R.length + 2));
    if (!R.length || !B.length) return [];
    var W = pt[0], H = pt[1], out = [];
    var ends = R.map(function (r) { return r.ends.map(P.fwd); });
    (function perm(i, used, pick) {
      if (i === R.length) {
        for (var m = 0; m < (1 << R.length); m++) {
          var pairs = [];
          pick.forEach(function (bi, k) { var b = B[bi], e = ends[k], f = (m >> k) & 1, a2 = f ? b.b : b.a, b2 = f ? b.a : b.b; [[a2, e[0], 'one end'], [b2, e[1], 'other end']].forEach(function (z) { pairs.push({ x: z[0][0] * W, y: -z[0][1] * H, E: z[1][0], N: z[1][1], c: P.inv(z[1]), id: 'rwy:' + R[k].id + ':' + z[2], lab: 'bar' + bi + z[2], kind: 'rwy', name: 'runway ' + R[k].id + ', ' + z[2] + ' (drawn as a bar)', w: 2 }); }); });
          var T = lsq(pairs); if (!T) continue;
          var sc = scaleOf(T), scale = sc / PT; if (scale < lim[0] * 0.8 || scale > lim[1] * 1.25) continue;
          // each bar about as long as its runway
          var bad = pick.some(function (bi, k) { var b = B[bi], l = Math.hypot((b.b[0] - b.a[0]) * W, (b.b[1] - b.a[1]) * H) * sc; return Math.abs(l - R[k].len) > R[k].len * 0.12; });
          if (bad) continue;
          var rr = pairs.map(function (p) { return resid(T, p); }), rms = Math.sqrt(rr.reduce(function (o, x) { return o + x * x; }, 0) / rr.length);
          if (pairs.length > 2 && rms > Math.max(60, 0.04 * Math.max.apply(null, R.map(function (r) { return r.len; })))) continue;
          var rot = ((Math.atan2(T.b, T.a) / D2R) + 360) % 360;
          out.push({ pairs: pairs, rms: rms, rot: Math.min(rot, 360 - rot) });
        }
        return;
      }
      for (var bi = 0; bi < B.length; bi++) if (used.indexOf(bi) < 0) perm(i + 1, used.concat([bi]), pick.concat([bi]));
    })(0, [], []);
    // the closest fit first; fits about as close (one runway, or runways laid out the same both ways round): north up first
    out.sort(function (a, b) { return Math.abs(a.rms - b.rms) > Math.max(5, 0.1 * Math.min(a.rms, b.rms)) ? a.rms - b.rms : a.rot - b.rot; });
    return out.slice(0, 4).map(function (h) { return h.pairs; });
  }
  // the runways of a chart drawn as long dark bars (an aerodrome chart): the dark pixels at least 3 pixels from a
  // light one (distance transform), joined into shapes; a shape twelve times longer than wide and longer than 8 % of
  // the page is a bar; its two ends (0 … 1 across and down)
  function bars(img) {
    var W = img.width, H = img.height, px = img.data, n = W * H, D = new Uint16Array(n), BIG = 60000, x, y, i;
    for (i = 0; i < n; i++) { var j = i * 4; D[i] = px[j] * 0.3 + px[j + 1] * 0.59 + px[j + 2] * 0.11 < 100 ? BIG : 0; }
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      i = y * W + x; if (!D[i]) continue;
      var m = D[i]; if (x === 0 || y === 0 || x === W - 1 || y === H - 1) m = 3;
      if (x > 0) m = Math.min(m, D[i - 1] + 3); if (y > 0) { m = Math.min(m, D[i - W] + 3); if (x > 0) m = Math.min(m, D[i - W - 1] + 4); if (x < W - 1) m = Math.min(m, D[i - W + 1] + 4); }
      D[i] = m;
    }
    for (y = H - 1; y >= 0; y--) for (x = W - 1; x >= 0; x--) {
      i = y * W + x; if (!D[i]) continue;
      var m2 = D[i]; if (x < W - 1) m2 = Math.min(m2, D[i + 1] + 3); if (y < H - 1) { m2 = Math.min(m2, D[i + W] + 3); if (x < W - 1) m2 = Math.min(m2, D[i + W + 1] + 4); if (x > 0) m2 = Math.min(m2, D[i + W - 1] + 4); }
      D[i] = m2;
    }
    var seen = new Uint8Array(n), stack = new Int32Array(n), segs = [], big = Math.max(W, H);
    for (i = 0; i < n; i++) {
      if (D[i] < 9 || seen[i]) continue;
      var top = 0, list = []; stack[top++] = i; seen[i] = 1;
      while (top) { var k = stack[--top]; list.push(k); var kx = k % W, ky = (k - kx) / W; for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) { var nx = kx + dx, ny = ky + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; var q = ny * W + nx; if (!seen[q] && D[q] >= 9) { seen[q] = 1; stack[top++] = q; } } }
      if (list.length < 30) continue;
      var mx = 0, my = 0; list.forEach(function (k2) { mx += k2 % W; my += Math.floor(k2 / W); }); mx /= list.length; my /= list.length;
      var sxx = 0, syy = 0, sxy = 0, dmax = 0; list.forEach(function (k2) { var ax = k2 % W - mx, ay = Math.floor(k2 / W) - my; sxx += ax * ax; syy += ay * ay; sxy += ax * ay; if (D[k2] > dmax) dmax = D[k2]; });
      var th = 0.5 * Math.atan2(2 * sxy, sxx - syy), ux = Math.cos(th), uy = Math.sin(th), t0 = Infinity, t1 = -Infinity, w2 = 0;
      list.forEach(function (k2) { var ax = k2 % W - mx, ay = Math.floor(k2 / W) - my, t = ax * ux + ay * uy, wv = Math.abs(-ax * uy + ay * ux); if (t < t0) t0 = t; if (t > t1) t1 = t; if (wv > w2) w2 = wv; });
      segs.push({ mx: mx, my: my, ux: ux, uy: uy, t0: t0 - 3, t1: t1 + 3, w: 2 * w2 + 2 * dmax / 3, th: th });
    }
    // pieces of one bar (cut where a taxiway or another runway crosses it) joined
    segs.sort(function (a, b) { return (b.t1 - b.t0) - (a.t1 - a.t0); });
    var out = [];
    segs.forEach(function (sg) {
      var hit = out.filter(function (o) { var da = Math.abs(((sg.th - o.th) / D2R + 540) % 180 - 0); if (Math.min(da, 180 - da) > 2) return false; var ax = sg.mx - o.mx, ay = sg.my - o.my; return Math.abs(-ax * o.uy + ay * o.ux) < Math.max(o.w, sg.w) * 1.5 + 2; })[0];
      if (hit) { [sg.t0, sg.t1].forEach(function (t) { var px2 = sg.mx + sg.ux * t - hit.mx, py2 = sg.my + sg.uy * t - hit.my, tt = px2 * hit.ux + py2 * hit.uy; if (tt < hit.t0) hit.t0 = tt; if (tt > hit.t1) hit.t1 = tt; }); hit.w = Math.max(hit.w, sg.w); }
      else out.push(Object.assign({}, sg));
    });
    return out.filter(function (o) { var L = o.t1 - o.t0; return L >= 0.08 * big && L / Math.max(o.w, 1) >= 12; }).map(function (o) {
      return { a: [(o.mx + o.ux * o.t0) / W, (o.my + o.uy * o.t0) / H], b: [(o.mx + o.ux * o.t1) / W, (o.my + o.uy * o.t1) / H], len: Math.round(o.t1 - o.t0), wid: Math.round(o.w * 10) / 10 };
    }).sort(function (a, b) { return b.len - a.len; });
  }
  // the page drawn as an image (about 3 000 pixels across) and its corners on the map
  // (drawn with its fonts, or the browser's for fonts it does not carry; never with code made from a font: isEvalSupported off)
  async function image(d, p) {
    var lib = await AMDBDOC.pdfLib(), doc = await lib.getDocument({ data: d.bytes.slice(0), isEvalSupported: false, disableFontFace: false, useSystemFonts: true }).promise;
    try {
      var pg = await doc.getPage(p), v1 = pg.getViewport({ scale: 1 }), sc = Math.min(6, 3000 / Math.max(v1.width, v1.height));
      if (v1.width * v1.height * sc * sc > 1.6e7) sc = Math.sqrt(1.6e7 / (v1.width * v1.height));
      var vp = pg.getViewport({ scale: sc }), cv = document.createElement('canvas'); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
      var g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
      await pg.render({ canvasContext: g, viewport: vp }).promise;
      var blob = await new Promise(function (ok) { cv.toBlob(ok, 'image/png'); });
      var out = { url: URL.createObjectURL(blob), w: cv.width, h: cv.height, p: p };
      var k = Math.min(1, 2000 / Math.max(cv.width, cv.height)), c2 = document.createElement('canvas'); c2.width = Math.round(cv.width * k); c2.height = Math.round(cv.height * k);
      var g2 = c2.getContext('2d', { willReadFrequently: true }); g2.drawImage(cv, 0, 0, c2.width, c2.height);
      out.bars = bars(g2.getImageData(0, 0, c2.width, c2.height)); c2.width = c2.height = 1;
      cv.width = cv.height = 1;
      return out;
    } finally { await doc.destroy(); }
  }
  async function place(d, known, origin, opt) {
    opt = opt || {};
    var F = fitDoc(d, known, origin, opt);
    if (!F.img || F.img.p !== F.p) { if (F.img) URL.revokeObjectURL(F.img.url); F.img = await image(d, F.p); }
    if (F.auto && F.img.bars && F.img.bars.length && opt.rwys && opt.rwys.length) F = fitDoc(d, known, origin, Object.assign({}, opt, { page: F.p, bars: F.img.bars }));
    // a picture read by OCR, with runways drawn as bars: its words written along the runways and across them (OCR read
    // the level ones), read once, then placed again (runway designators, taxiway names)
    if (F.auto && F.F && d.image && d.ocr && !d.turned && F.img.bars && F.img.bars.length) {
      var pt = d.pagePt[F.p], dirs = [];
      F.img.bars.slice(0, 4).forEach(function (b) { var a = Math.atan2((b.b[1] - b.a[1]) * pt[1], (b.b[0] - b.a[0]) * pt[0]) / D2R; [a, a + 90].forEach(function (x) { x = ((x + 90) % 180 + 180) % 180 - 90; if (Math.abs(x) > 6 && !dirs.some(function (y) { return Math.abs(y - x) < 6; })) dirs.push(Math.round(x * 10) / 10); }); });
      if (dirs.length) {
        await LAZY.run('src-amdbocr');
        var more = await AMDBOCR.readTurned(d.bytes, F.p, dirs.slice(0, 3), opt.say || function () {});
        d.labels = (d.labels || []).concat(more); d.turned = more.length;
        F = fitDoc(d, known, origin, Object.assign({}, opt, { page: F.p, bars: F.img.bars }));
      }
    }
    corners(d, F);
    keep(d);
    return F;
  }
  function corners(d, F) {
    if (!F.F) { F.o = null; return; }
    var W = d.pagePt[F.p][0], Hh = d.pagePt[F.p][1], P = AMDB.plane(F.origin[0], F.origin[1]), T = F.F.T;
    var ll = function (x, y) { return P.inv(at(T, x, y)); };
    F.o = { id: 'chart-' + d.id, name: d.name, url: F.img.url, w: F.img.w, h: F.img.h, c: [ll(0, 0), ll(W, 0), ll(0, -Hh), ll(W / 2, -Hh / 2)], blend: true };
  }
  // where a point of the chart (0 … 1 across and down) lies on the map
  function toMap(d, u, v) { var F = FIT[d.id]; if (!F || !F.F) return null; var W = d.pagePt[F.p][0], Hh = d.pagePt[F.p][1]; return AMDB.plane(F.origin[0], F.origin[1]).inv(at(F.F.T, u * W, -v * Hh)); }
  function toChart(d, c) { var F = FIT[d.id]; if (!F || !F.F) return null; var W = d.pagePt[F.p][0], Hh = d.pagePt[F.p][1], q = AMDB.plane(F.origin[0], F.origin[1]).fwd(c), x = back(F.F.T, q[0], q[1]); return [x[0] / W, -x[1] / Hh]; }
  function placed(code) { return AMDBDOC.list().filter(function (d) { return (!code || d.ad === code) && FIT[d.id] && FIT[d.id].F && FIT[d.id].o; }); }
  // the placed charts of an aerodrome as imagery to trace on
  function imagery(code) {
    return placed(code).map(function (d) {
      var F = FIT[d.id];
      // what is traced on it: as good as the fit, and no better than half a millimetre of the drawing
      return { id: 'chart-' + d.id, group: 'The State\'s charts (placed)', name: 'Chart ' + short(d.name) + ' — ±' + F.F.rms + ' m', lic: 'derive', licName: 'the State\'s chart (AIP), placed on the map by ' + F.F.n + ' point(s), ±' + F.F.rms + ' m (root mean square)', attr: 'the State\'s chart ' + d.name, ortho: F.o, chart: d.id, fit: Math.max(F.F.rms, 0.0005 * F.F.scale) };
    });
  }
  function short(n) { return String(n).replace(/\.[a-z0-9]+$/i, '').replace(/^[0-9a-f]{6,}-/, '').replace(/[_]+/g, ' ').slice(0, 60); }
  // the words of the placed charts of an aerodrome on the map: {t, c, tol (metres), doc}
  function labelsOn(code) {
    var out = [];
    placed(code).forEach(function (d) {
      var F = FIT[d.id], tol = Math.max(30, 2 * F.F.rms, 8 * F.F.s);
      (d.labels || []).forEach(function (l) { if (l.p !== F.p) return; var c = toMap(d, l.u, l.v); if (c) out.push({ t: norm(AMDBDOC.clean(l.t)), raw: l.t, c: c, tol: tol, doc: d, rms: F.F.rms, u: l.u, v: l.v, h: l.h }); });
    });
    return out;
  }

  /* ------------------------------------------------- taxiway names, hot spots */
  function segDist(p, a, b) { var dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); }
  function lineDist(p, pl) { var d = Infinity; for (var i = 0; i < pl.length - 1; i++) d = Math.min(d, segDist(p, pl[i], pl[i + 1])); return d; }
  // OpenStreetMap taxiway lines without a name get the name of the chart's taxiway labels beside them (the nearest
  // line, clearly nearer than any other), then the lines joined end to end with them where no other taxiway meets
  function twyNames(code, els, names) {
    var known = {}; (names || []).forEach(function (x) { known[norm(x)] = 1; });
    var labs = labelsOn(code).filter(function (l) { return /^[A-Z]{1,2}\d{0,2}$/.test(l.t) && known[l.t] && !/^(ARP|RWY|TWY|HS|ILS|GP|DME|VOR|NDB)$/.test(l.t); });
    var res = { by: {}, n: 0, labels: labs.length, agree: 0, conflict: 0, docs: [] };
    if (!labs.length) return res;
    var lines = (els || []).filter(function (e) { return (e.tags.aeroway === 'taxiway' || e.tags.aeroway === 'taxilane') && e.g && e.g.t === 'L' && e.g.c.length > 1; });
    if (!lines.length) return res;
    var o = labs[0].c, P = AMDB.plane(o[0], o[1]), pls = lines.map(function (e) { return e.g.c.map(P.fwd); }), votes = {};
    labs.forEach(function (l) {
      var q = P.fwd(l.c), best = null, second = null;
      pls.forEach(function (pl, i) { var d = lineDist(q, pl); if (!best || d < best.d) { second = best; best = { i: i, d: d }; } else if (!second || d < second.d) second = { i: i, d: d }; });
      if (!best || best.d > l.tol) return;
      var e = lines[best.i], ref = norm(e.tags.ref || '');
      if (ref) { if (ref === l.t) res.agree++; else res.conflict++; return; }
      if (second && second.d < best.d * 1.5 + 5 && norm(lines[second.i].tags.ref || '') !== l.t) return; // between two lines: not clear which
      (votes[best.i] = votes[best.i] || {})[l.t] = (votes[best.i][l.t] || 0) + 1;
      if (res.docs.indexOf(l.doc.name) < 0) res.docs.push(l.doc.name);
    });
    var name = {};
    Object.keys(votes).forEach(function (i) { var v = votes[i], k = Object.keys(v).sort(function (a, b) { return v[b] - v[a]; }); if (k.length === 1 || v[k[0]] > v[k[1]]) name[i] = k[0]; });
    // joined end to end: the ends shared by exactly two taxiway lines, both without a name
    var ends = {}, key = function (c) { return c[0].toFixed(7) + ',' + c[1].toFixed(7); };
    lines.forEach(function (e, i) { [e.g.c[0], e.g.c[e.g.c.length - 1]].forEach(function (c) { (ends[key(c)] = ends[key(c)] || []).push(i); }); });
    var queue = Object.keys(name).map(Number);
    while (queue.length) {
      var i = queue.shift(), e = lines[i];
      [e.g.c[0], e.g.c[e.g.c.length - 1]].forEach(function (c) {
        var at2 = ends[key(c)]; if (!at2 || at2.length !== 2) return;
        var j = at2[0] === i ? at2[1] : at2[0];
        if (j === i || name[j] !== undefined || norm(lines[j].tags.ref || '')) return;
        name[j] = name[i]; queue.push(j);
      });
    }
    Object.keys(name).forEach(function (i) { var e = lines[i]; res.by[e.type + '/' + e.id] = name[i]; res.n++; });
    return res;
  }
  // hot spots at their labels on the placed charts (HS1, HS 2 …): {id, c, doc, rms}
  function hotspots(code) {
    var out = [], seen = {};
    labelsOn(code).forEach(function (l, i, all) {
      var m = /^(?:HS|HOTSPOT)-?(\d{1,2})$/.exec(l.t.replace(/\s+/g, '')), id = m ? 'HS' + m[1] : '';
      // "HS 1", "HOTSPOT 1", "HOT SPOT 1": the number in the next word or the one after, close by
      if (!id && /^(HS|HOTSPOT|HOT)$/.test(l.t)) { [all[i + 1], all[i + 2]].some(function (nx, k) { if (!nx || nx.doc !== l.doc || Math.hypot(nx.u - l.u, nx.v - l.v) > 0.04) return false; if (l.t === 'HOT' && k === 0) return nx.t !== 'SPOT'; var mm = /^(\d{1,2})$/.exec(nx.t); if (mm) { id = 'HS' + mm[1]; return true; } return false; }); }
      if (!id || seen[id]) return;
      seen[id] = 1; out.push({ id: id, c: l.c, doc: l.doc.name, rms: l.rms });
    });
    return out;
  }

  /* -------------------------------------------------------------------- UI */
  // the panel of Trace on imagery: the charts of the aerodrome, placed or not, and placing one by hand
  var E = { doc: 0, pend: null, zoom: 'fit', known: [], rwys: [], origin: null, again: null, map: null, busy: '' };
  function panel(c, gen) {
    var known = E.known = knownOf(gen); E.rwys = runwaysOf(gen); E.origin = c.arp;
    var docs = AMDBDOC.list().filter(function (d) { return d.ad === c.code && placeable(d); });
    restore(docs, known, c.arp);
    if (!docs.length) return '<details class="tr-charts"><summary>📄 The State\'s charts on the map</summary><p class="muted">Add the aerodrome\'s charts (aerodrome, ground movement, parking / docking chart, PDF) in 📤 Upload: each is placed on the map by the stands, thresholds and reference point it shows, and can be traced on.</p></details>';
    var open = E.open !== undefined ? E.open : !!(E.doc || docs.some(function (d) { return !FIT[d.id]; }));
    var h = '<details class="tr-charts"' + (open || E.doc ? ' open' : '') + '><summary>📄 The State\'s charts on the map (' + docs.length + ')</summary>' +
      '<p class="muted">A chart is placed by the points it shows that the data knows — stand numbers, runway designators, the reference point, coordinates written beside a point — or by points you give. The fit says how well it agrees (in metres). Placed, it is in the Imagery list to trace on; its taxiway names go to the taxiway lines without one, its hot spots become hot spot features (Generate).</p>' +
      '<div class="tbl-wrap"><table class="mini-table geo-docs"><thead><tr><th>Chart</th><th>Placed by</th><th class="num">± m</th><th class="num">Largest</th><th>Scale</th><th></th></tr></thead><tbody>' +
      docs.map(function (d) {
        var F = FIT[d.id], r = F && F.F;
        return '<tr data-geodoc="' + d.id + '"><td>' + esc(short(d.name)) + (d.image && !d.ocr ? ' <span class="muted">(a picture: read it with OCR first to find its words)</span>' : '') + '</td><td>' + (r ? r.n + ' point(s)' + (r.hand.length ? ' (' + r.hand.length + ' by hand)' : '') : F ? '<span class="muted">' + esc(F.why || '') + '</span>' : '<span class="muted">not placed</span>') + '</td>' +
          '<td class="num">' + (r ? r.rms : '') + '</td><td class="num">' + (r ? r.max : '') + '</td><td>' + (r ? '1 : ' + r.scale.toLocaleString('en') + (Math.abs(r.rot) > 0.5 && Math.abs(r.rot - 360) > 0.5 ? ', turned ' + r.rot + '°' : '') : '') + '</td>' +
          '<td style="white-space:nowrap"><button class="btn small' + (F ? '' : ' primary') + '" data-geoauto="' + d.id + '">Place automatically</button> <button class="btn small" data-geohand="' + d.id + '">' + (E.doc === d.id ? 'Close' : 'Points by hand') + '</button>' + (r ? ' <button class="btn small" data-geoshow="' + d.id + '">Trace on it</button> <button class="btn small" data-geoforget="' + d.id + '" aria-label="Forget the placement">✕</button>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>' + (E.busy ? '<p class="geo-st"><span class="spinner"></span> ' + esc(E.busy) + '</p>' : '<p class="geo-st"></p>') + (E.doc ? editor(AMDBDOC.get(E.doc)) : '') + '</details>';
    return h;
  }
  function restore(docs, known, origin) {
    var all = stored();
    docs.forEach(function (d) {
      var s = all[docKey(d)]; if (!s || FIT[d.id]) return;
      FIT[d.id] = { p: s.p || 1, hand: s.hand || [], auto: !!s.auto };
      place(d, known, origin, { page: s.hand && s.hand.length ? s.p : 0, rwys: E.rwys }).then(function () { if (E.again) E.again(); }).catch(function () { /* placed again when asked */ });
    });
  }
  function editor(d) {
    if (!d) return '';
    var F = FIT[d.id] || { hand: [] }, img = F.img, r = F.F, pages = Object.keys(d.pagePt).map(Number);
    var pts = (r ? r.inl.concat(r.hand) : []).map(function (p) { var W = d.pagePt[F.p][0], Hh = d.pagePt[F.p][1]; return { u: p.x / W, v: -p.y / Hh, name: p.name, res: p.res, kind: p.kind }; });
    return '<div class="geo-ed" data-geoed="' + d.id + '"><div class="toolbar"><b>' + esc(short(d.name)) + '</b>' + (pages.length > 1 ? '<label>Page <select class="inp" data-geopage>' + pages.map(function (p) { return '<option' + (p === F.p ? ' selected' : '') + '>' + p + '</option>'; }).join('') + '</select></label>' : '') +
      '<span class="btn-group"><button class="btn small' + (E.zoom === 'fit' ? ' primary' : '') + '" data-geoz="fit">Whole page</button><button class="btn small' + (E.zoom === '1' ? ' primary' : '') + '" data-geoz="1">Large</button><button class="btn small' + (E.zoom === '2' ? ' primary' : '') + '" data-geoz="2">Larger</button></span></div>' +
      '<p class="muted geo-step">' + (E.pend ? '2. Now click the same point on the map below (it snaps to a stand, threshold or the reference point within a few pixels), or choose it: <select class="inp" data-geoknown><option value="">a known point…</option>' + E.known.map(function (k, i) { return '<option value="' + i + '">' + esc(k.name) + '</option>'; }).join('') + '</select> <button class="btn small" data-geocancel>Cancel</button>' : '1. Click a point on the chart you can also find on the map (a threshold bar, a stand mark, the reference point, a runway end). Two points place it; more points check it.') + '</p>' +
      '<div class="geo-scroll"><div class="geo-page" style="width:' + (E.zoom === 'fit' ? '100%' : (img ? Math.round(img.w * (E.zoom === '2' ? 1 : 0.5)) + 'px' : '100%')) + '">' + (img ? '<img src="' + img.url + '" alt="The chart" data-geoimg draggable="false">' : '<p class="muted">Drawing the chart…</p>') +
      pts.map(function (p) { return '<span class="geo-pt' + (p.kind === 'hand' ? ' hand' : '') + '" style="left:' + (p.u * 100).toFixed(3) + '%;top:' + (p.v * 100).toFixed(3) + '%" title="' + esc(p.name + ' — ' + p.res + ' m') + '"></span>'; }).join('') +
      (E.pend ? '<span class="geo-pt pend" style="left:' + (E.pend.u * 100).toFixed(3) + '%;top:' + (E.pend.v * 100).toFixed(3) + '%"></span>' : '') + '</div></div>' +
      (r ? '<div class="tbl-wrap"><table class="mini-table geo-pts"><thead><tr><th>Point</th><th>On the chart</th><th class="num">Off by (m)</th><th></th></tr></thead><tbody>' + r.hand.concat(r.inl).slice(0, 200).map(function (p) { return '<tr><td>' + esc(p.name) + '</td><td class="muted">' + esc(p.kind === 'hand' ? 'given by hand' : p.text || '') + '</td><td class="num">' + p.res + '</td><td>' + (p.kind === 'hand' ? '<button class="btn small" data-geodel="' + esc(p.id) + '" aria-label="Remove the point">✕</button>' : '') + '</td></tr>'; }).join('') + '</tbody></table></div>' : '') + '</div>';
  }
  async function run(d, opt, say) {
    E.busy = say || 'Placing the chart …'; if (E.again) E.again();
    var tell = function (t) { E.busy = t; var st = document.querySelector('.geo-st'); if (st) st.innerHTML = '<span class="spinner"></span> ' + esc(t); };
    try { await place(d, E.known, E.origin, Object.assign({ rwys: E.rwys, say: tell }, opt)); } finally { E.busy = ''; }
    if (E.again) E.again();
  }
  // a click on the map while a point of the chart waits for its place: the point given by hand
  function mapClick(latlng, map) {
    if (!E.doc || !E.pend) return false;
    var at2 = map.latLngToContainerPoint(latlng), best = null;
    E.known.forEach(function (k) { var cp = map.latLngToContainerPoint([k.c[1], k.c[0]]), dd = cp.distanceTo(at2); if (dd < 12 && (!best || dd < best.d)) best = { d: dd, k: k }; });
    addHand(best ? best.k.c : [Math.round(latlng.lng * 1e8) / 1e8, Math.round(latlng.lat * 1e8) / 1e8], best ? best.k.name + ' (by hand)' : 'point given by hand');
    return true;
  }
  function addHand(c, name) {
    var d = AMDBDOC.get(E.doc), F = FIT[d.id] = FIT[d.id] || { p: 1, hand: [], auto: false }, W = d.pagePt[F.p][0], Hh = d.pagePt[F.p][1];
    F.hand.push({ x: Math.round(E.pend.u * W * 100) / 100, y: -Math.round(E.pend.v * Hh * 100) / 100, c: c, name: name });
    E.pend = null;
    run(d, { page: F.p }, 'Placing the chart by the points given …');
  }
  function bind(host, ctx) {
    var box = host.querySelector('.tr-charts'); if (!box) return;
    box.addEventListener('click', function (e) {
      var b;
      if ((b = e.target.closest('[data-geoauto]'))) { var d = AMDBDOC.get(+b.getAttribute('data-geoauto')); run(d, { auto: true }, 'Finding the chart\'s points …'); return; }
      if ((b = e.target.closest('[data-geohand]'))) { var id = +b.getAttribute('data-geohand'); E.doc = E.doc === id ? 0 : id; E.pend = null; if (E.doc) { var dd = AMDBDOC.get(id), F = FIT[id] = FIT[id] || { p: 1, hand: [], auto: false }; F.origin = E.origin; if (!F.img) { image(dd, F.p).then(function (im) { F.img = im; corners(dd, F); if (E.again) E.again(); }); } } if (E.again) E.again(); return; }
      if ((b = e.target.closest('[data-geoshow]'))) { if (ctx.showImagery) ctx.showImagery('chart-' + b.getAttribute('data-geoshow')); return; }
      if ((b = e.target.closest('[data-geoforget]'))) { var d2 = AMDBDOC.get(+b.getAttribute('data-geoforget')); if (FIT[d2.id] && FIT[d2.id].img) URL.revokeObjectURL(FIT[d2.id].img.url); delete FIT[d2.id]; keep(d2); if (E.doc === d2.id) E.doc = 0; if (E.again) E.again(); return; }
      if ((b = e.target.closest('[data-geoz]'))) { E.zoom = b.getAttribute('data-geoz'); if (E.again) E.again(); return; }
      if (e.target.closest('[data-geocancel]')) { E.pend = null; if (E.again) E.again(); return; }
      if ((b = e.target.closest('[data-geodel]'))) { var d3 = AMDBDOC.get(E.doc), F3 = FIT[d3.id], hid = b.getAttribute('data-geodel'); F3.hand = F3.hand.filter(function (h) { return 'hand:' + h.x + ',' + h.y !== hid; }); run(d3, { page: F3.p }, 'Placing the chart again …'); return; }
      var im = e.target.closest('[data-geoimg]');
      if (im) { var rc = im.getBoundingClientRect(); E.pend = { u: (e.clientX - rc.left) / rc.width, v: (e.clientY - rc.top) / rc.height }; if (E.again) E.again(); }
    });
    box.addEventListener('change', function (e) {
      if (e.target.hasAttribute('data-geoknown') && e.target.value !== '') { var k = E.known[+e.target.value]; addHand(k.c, k.name + ' (by hand)'); }
      else if (e.target.hasAttribute('data-geopage')) { var d = AMDBDOC.get(E.doc), F = FIT[d.id]; F.p = +e.target.value; F.hand = []; E.pend = null; if (F.img) { URL.revokeObjectURL(F.img.url); F.img = null; } run(d, { page: F.p }, 'Drawing the page …'); }
    });
    box.addEventListener('toggle', function () { E.open = box.open; });
  }
  // the points of the fit on the map of Trace on imagery: where the data has them, and the line to where the chart puts them
  function drawFit(map, docId) {
    var d = AMDBDOC.get(docId), F = FIT[docId]; if (!d || !F || !F.F) return null;
    var g = L.layerGroup(), P = AMDB.plane(F.origin[0], F.origin[1]);
    F.F.inl.concat(F.F.hand).forEach(function (p) {
      var c2 = P.inv(at(F.F.T, p.x, p.y));
      L.polyline([[p.c[1], p.c[0]], [c2[1], c2[0]]], { color: '#ff3d00', weight: 2, interactive: false }).addTo(g);
      L.circleMarker([p.c[1], p.c[0]], { radius: 4, color: p.kind === 'hand' ? '#00b8d4' : '#ff3d00', weight: 2, fillOpacity: 0.9 }).bindTooltip(esc(p.name + ': the chart puts it ' + p.res + ' m away'), { direction: 'top' }).addTo(g);
    });
    return g.addTo(map);
  }
  function setHost(again, map) { E.again = again; E.map = map; }
  function clear() { Object.keys(FIT).forEach(function (k) { if (FIT[k].img) URL.revokeObjectURL(FIT[k].img.url); }); FIT = {}; }
  return { lsq: lsq, robust: robust, at: at, back: back, knownOf: knownOf, runwaysOf: runwaysOf, bars: bars, fromBars: fromBars, candidates: candidates, fitDoc: fitDoc, place: place, imagery: imagery, labelsOn: labelsOn, twyNames: twyNames, hotspots: hotspots, panel: panel, bind: bind, mapClick: mapClick, drawFit: drawFit, setHost: setHost, toMap: toMap, toChart: toChart, placed: placed, placeable: placeable, get: function (id) { return FIT[id] || null; }, clear: clear, norm: norm, PT: PT };
})();
if (typeof module !== 'undefined') module.exports = AMDBGEO;
