/*!
 * AIXM Code Converter
 * Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com> - author of the AIXM Code Converter
 * SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE; keep this notice in all copies)
 * ==========================================================================
 * AIXM Code Converter - airport chart (aerodrome diagram)
 * Builds a drawing model of each aerodrome from its AIXM features and draws
 * it on any 2D canvas:
 *   runways as true-width surfaces with threshold, centreline, aiming-point
 *   and displaced-threshold markings, painted designators, magnetic
 *   bearings and THR elevations at the ends, a dimension / surface / PCN
 *   label along each runway, ILS localizer feathers with ident and
 *   frequency, taxiway location signs (yellow on black), apron names,
 *   stand numbers, holding positions, hot spots and the ARP.
 * Used by the live map (mapview.js) and by the PNG / PDF map renderer, so
 * the screen and the printed chart are identical. Also builds the
 * "airport information" card (runways, declared distances, frequencies,
 * navaids) shown in the map's airport view.
 * Detail follows the scale (metres per pixel), like a paper chart series.
 * ========================================================================== */
/* global AX, MODEL, AIP, OLS */
var ADCHART = (function () {
  'use strict';
  var M = MODEL, s = M.s, arr = AX.arr;
  var D2R = Math.PI / 180;
  var SIG = 'AIXM Code Converter airport chart - Prasad Selvaraj <prasad2t@gmail.com>';
  var COL = {
    rwy: '#3b4148', rwyEdge: '#1f2328', mark: '#ffffff', twySign: '#111111', twyText: '#ffd000', apron: '#4a5560',
    stand: '#0b2a4a', hold: '#d32f2f', hot: '#d32f2f', ils: '#8e24aa', arp: '#0b2a4a', label: '#0b2a4a', halo: 'rgba(255,255,255,.92)'
  };
  var FONT = '"Segoe UI", system-ui, Arial, sans-serif';

  /* -------------------------------------------------------------- helpers */
  function metres(q) {
    q = arr(q)[0];
    if (!q || q.nil !== undefined || q.v === undefined) return NaN;
    var v = parseFloat(q.v), u = String(q.u || 'M').toUpperCase();
    if (isNaN(v)) return NaN;
    return /FT/.test(u) ? v * 0.3048 : u === 'KM' ? v * 1000 : /NM|NMI/.test(u) ? v * 1852 : v;
  }
  function nm(m) { return m / 1852; }
  function num(v) { var x = parseFloat(s(v)); return isNaN(x) ? null : x; }
  function revOf(ds, r, kind, prop) {
    return (ds.rev.get(r) || []).filter(function (x) { return x[1].k === kind && (!prop || x[0] === prop); }).map(function (x) { return x[1]; })
      .filter(function (x, i, a) { return a.indexOf(x) === i; });
  }
  function ringOf(g) { return g && g.t === 'A' && g.c && g.c[0] ? g.c[0].filter(function (p) { return typeof p[0] === 'number'; }) : null; }
  // area centroid of a [lon, lat] ring (planar), vertex mean when degenerate
  function centroid(ring) {
    var a = 0, cx = 0, cy = 0, n = ring.length, i, j;
    for (i = 0, j = n - 1; i < n; j = i++) {
      var f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
      a += f; cx += (ring[j][0] + ring[i][0]) * f; cy += (ring[j][1] + ring[i][1]) * f;
    }
    if (Math.abs(a) < 1e-14) { cx = 0; cy = 0; ring.forEach(function (p) { cx += p[0]; cy += p[1]; }); return [cx / n, cy / n]; }
    return [cx / (3 * a), cy / (3 * a)];
  }
  function ext(bb, p) { if (!p) return bb; if (!bb) return [p[0], p[1], p[0], p[1]]; bb[0] = Math.min(bb[0], p[0]); bb[1] = Math.min(bb[1], p[1]); bb[2] = Math.max(bb[2], p[0]); bb[3] = Math.max(bb[3], p[1]); return bb; }
  function pad3(v) { return v === null || v === undefined ? '' : ('00' + Math.round(v) % 360).slice(-3).replace(/^000$/, '360'); }
  function bare(q) { return M.fq(q).replace(/\s*(MHZ|KHZ)$/i, ''); }
  // chart presentation of published lengths / elevations: at most one decimal, no trailing ".0"
  function tidy(t) { return String(t || '').replace(/(\d+)\.(\d+)/g, function (m0) { return String(Math.round(parseFloat(m0) * 10) / 10); }); }

  /* ------------------------------------------------- collision registry */
  // Screen-space boxes [x0, y0, x1, y1] on a 64 px grid: labels that would overlap are not drawn.
  function Occ() { this.g = new Map(); }
  Occ.prototype.cells = function (b, fn) {
    for (var x = Math.floor(b[0] / 64); x <= Math.floor(b[2] / 64); x++) for (var y = Math.floor(b[1] / 64); y <= Math.floor(b[3] / 64); y++) if (fn(x + ':' + y) === false) return false;
    return true;
  };
  Occ.prototype.fits = function (b) {
    var g = this.g;
    return this.cells(b, function (k) {
      var l = g.get(k);
      if (!l) return true;
      for (var i = 0; i < l.length; i++) { var o = l[i]; if (b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]) return false; }
      return true;
    });
  };
  Occ.prototype.add = function (b) { var g = this.g; this.cells(b, function (k) { var l = g.get(k); if (!l) g.set(k, l = []); l.push(b); }); };
  Occ.prototype.take = function (b) { if (!this.fits(b)) return false; this.add(b); return true; };
  var NO_OCC = { fits: function () { return true; }, add: function () {}, take: function () { return true; } };

  /* --------------------------------------------------------------- model */
  function ilsIndex(ds) {
    var idx = new Map();
    (ds.byType.Navaid || []).forEach(function (n) {
      var p = n.cur.p, t = s(p.type);
      if (!/ILS|LOC|MLS|LDA|SDF|IGS/.test(t)) return;
      var rd = M.target(ds, p.runwayDirection);
      if (!rd) return;
      var comps = arr(p.navaidEquipment).map(function (c) { return c && c.theNavaidEquipment ? M.target(ds, c.theNavaidEquipment) : null; }).filter(Boolean);
      var loc = comps.filter(function (c) { return c.k === 'Localizer'; })[0], gp = comps.filter(function (c) { return c.k === 'Glidepath'; })[0];
      var dme = comps.filter(function (c) { return c.k === 'DME'; })[0];
      var freq = loc ? bare(loc.cur.p.frequency) : p._loc ? bare(p._loc.frequency) : '';
      var sp = s(p.signalPerformance).replace(/^.*CAT_?/, ''), cat = /^(I|II|III[ABC]?|IIIA|IIIB|IIIC)$/.test(sp) ? 'CAT ' + sp : sp.replace(/_/g, ' ');
      idx.set(rd, { nav: n, kind: /LOC/.test(t) && !gp ? 'LOC' : t.replace(/_.*$/, ''), ident: s(p.designator) || (loc && s(loc.cur.p.designator)) || '', freq: freq,
        gp: gp ? s(gp.cur.p.slope) : p._gp ? s(p._gp.slope) : '', dme: dme ? s(dme.cur.p.channel) : '', cat: cat });
    });
    return idx;
  }
  function endOf(ds, d, ils) {
    var p = d.cur.p, rc = revOf(ds, d, 'RunwayCentrelinePoint', 'onRunway');
    function role(r) { return rc.filter(function (c) { return s(c.cur.p.role) === r; }).map(function (c) { return M.pointOf(ds, c); }).filter(Boolean)[0] || null; }
    var thrRec = rc.filter(function (c) { return s(c.cur.p.role) === 'THR'; })[0] || rc.filter(function (c) { return s(c.cur.p.role) === 'DISTHR'; })[0];
    var thr = role('THR'), dis = role('DISTHR');
    if (!thr && !dis && p._thr && p._thr._geo) thr = p._thr._geo.c;
    var thrLoc = thrRec ? arr(thrRec.cur.p.location)[0] : p._thr;
    return { dir: d, desig: s(p.designator), tb: num(p.trueBearing), mb: num(p.magneticBearing), start: role('START') || thr || dis, land: dis || thr, end: role('END'),
      elev: thrLoc ? tidy(M.fq(thrLoc.elevation)) : '', ils: ils.get(d) || null };
  }
  function dimsText(p) {
    var l = M.fq(p.nominalLength), w = M.fq(p.nominalWidth);
    if (!l && !w) return '';
    l = tidy(l); w = tidy(w);
    var ul = l.split(' ')[1], uw = w.split(' ')[1];
    return ul && ul === uw ? l.split(' ')[0] + ' x ' + w : (l || '—') + ' x ' + (w || '—');
  }
  function runway(ds, rw, ils) {
    var p = rw.cur.p, ends = revOf(ds, rw, 'RunwayDirection', 'usedRunway').map(function (d) { return endOf(ds, d, ils); });
    ends.sort(function (a, b) { return (parseInt(a.desig, 10) || 99) - (parseInt(b.desig, 10) || 99); });
    var wM = metres(p.nominalWidth), lM = metres(p.nominalLength), a = null, b = null, e0 = ends[0], e1 = ends[1];
    if (e0 && e1) { a = e0.start || e1.end; b = e1.start || e0.end; }
    else if (e0) { a = e0.start; b = e0.end; }
    if (a && !b && e0 && e0.tb !== null && lM) b = AX.dest(a[0], a[1], e0.tb, nm(lM));
    if (!a || !b || AX.distNM(a, b) < 0.02) return null;
    var brg = AX.bearing(a, b), est = !(wM > 0);
    if (est) wM = s(p.type) === 'FATO' ? 30 : 45;
    function off(pt, side) { return AX.dest(pt[0], pt[1], brg + side * 90, nm(wM / 2)); }
    ends.forEach(function (e) {
      var atA = e.start ? AX.distNM(e.start, a) <= AX.distNM(e.start, b) : e.tb !== null ? Math.abs(((e.tb - brg + 540) % 360) - 180) < 90 : e === ends[0];
      e.at = atA ? a : b; e.hdg = atA ? brg : (brg + 180) % 360;
      if (!e.land) e.land = e.at;
    });
    // one direction only: add the other end from the runway designator ("09/27")
    var names = s(p.designator).split('/');
    if (ends.length === 1 && names.length === 2) {
      var other = names[0] === ends[0].desig ? names[1] : names[0], atB = ends[0].at === a;
      ends.push({ dir: null, desig: other, tb: null, mb: null, at: atB ? b : a, land: atB ? b : a, hdg: atB ? (brg + 180) % 360 : brg, elev: '', ils: null });
    }
    var bb = null;
    [off(a, -1), off(a, 1), off(b, -1), off(b, 1)].forEach(function (q) { bb = ext(bb, q); });
    return { rw: rw, a: a, b: b, brg: brg, wM: wM, lM: lM || AX.distNM(a, b) * 1852, est: est, ends: ends, bb: bb,
      name: s(p.designator), dims: dimsText(p), surf: AIP.surface(p.surfaceProperties), pcn: AIP.pcn(p.surfaceProperties) };
  }
  function aerodrome(ds, ad, ils) {
    var m = { ad: ad, arp: M.pointOf(ds, ad), runways: [], twy: [], apn: [], stands: [], holds: [], hot: [], bb: null };
    var aprons = new Map();
    (ds.owned.get(ad) || []).forEach(function (r) {
      var p = r.cur.p, g, ring, c;
      switch (r.k) {
        case 'Runway': { var rm = runway(ds, r, ils); if (rm) m.runways.push(rm); break; }
        case 'TaxiwayElement': {
          ring = ringOf(M.findGeo(p, ['A'], 0));
          var tw = M.target(ds, p.associatedTaxiway), t = tw ? s(tw.cur.p.designator) : '';
          if (ring && ring.length > 2 && t) m.twy.push({ t: t, at: centroid(ring), r: tw || r });
          break;
        }
        case 'ApronElement': {
          ring = ringOf(M.findGeo(p, ['A'], 0));
          var ap = M.target(ds, p.associatedApron);
          if (!ring || ring.length < 3 || !ap) break;
          c = centroid(ring);
          var acc = aprons.get(ap) || { x: 0, y: 0, n: 0 };
          acc.x += c[0]; acc.y += c[1]; acc.n++; aprons.set(ap, acc);
          break;
        }
        case 'AircraftStand': {
          c = M.pointOf(ds, r);
          if (!c) { ring = ringOf(M.findGeo(p, ['A'], 0)); if (ring && ring.length > 2) c = centroid(ring); }
          if (c && s(p.designator)) m.stands.push({ t: s(p.designator), at: c, r: r });
          break;
        }
        case 'TaxiHoldingPosition': {
          c = M.pointOf(ds, r);
          var cat = s(p.landingCategory).replace(/^OTHER:/, '').replace(/_/g, ' ');
          if (c) m.holds.push({ t: /CAT/.test(cat) ? cat : '', at: c, r: r });
          break;
        }
        case 'AirportHotSpot': {
          g = M.findGeo(p, ['A', 'P'], 0);
          c = g ? (g.t === 'P' ? g.c : centroid(ringOf(g))) : null;
          if (c) m.hot.push({ t: s(p.designator) || 'HS', at: c, r: r });
          break;
        }
      }
    });
    aprons.forEach(function (acc, ap) { m.apn.push({ t: s(ap.cur.p.name) || s(ap.cur.p.designator) || 'APRON', at: [acc.x / acc.n, acc.y / acc.n], r: ap }); });
    m.runways.forEach(function (rm) { m.bb = ext(ext(m.bb, rm.bb.slice(0, 2)), rm.bb.slice(2)); });
    [m.twy, m.apn, m.stands, m.holds, m.hot].forEach(function (l) { l.forEach(function (x) { m.bb = ext(m.bb, x.at); }); });
    if (m.arp) m.bb = ext(m.bb, m.arp);
    // ILS feathers reach 8 NM out: keep them in the visible-area test
    m.reach = m.bb ? [m.bb[0] - 0.2, m.bb[1] - 0.16, m.bb[2] + 0.2, m.bb[3] + 0.16] : null;
    return m;
  }
  var cache = new WeakMap();
  // all aerodromes of the data set that have something to draw (cached per data set and view date)
  function all(ds) {
    var key = String(ds.viewDate || 'latest'), c = cache.get(ds);
    if (c && c.key === key) return c.list;
    var ils = ilsIndex(ds), list = [];
    (ds.byType.AirportHeliport || []).forEach(function (ad) {
      var m = aerodrome(ds, ad, ils);
      if (m.runways.length || m.twy.length || m.stands.length || m.apn.length) list.push(m);
    });
    c = { key: key, list: list, byAd: new Map(list.map(function (m) { return [m.ad, m]; })) };
    cache.set(ds, c);
    return list;
  }
  function of(ds, ad) { all(ds); return cache.get(ds).byAd.get(ad) || null; }
  // [west, south, east, north] of the aerodrome diagram (runways, surfaces, ARP), padded
  function bounds(ds, ad) {
    var m = of(ds, ad), bb = m && m.bb, c = M.pointOf(ds, ad);
    if (!bb && !c) return null;
    if (!bb || (bb[2] - bb[0] < 0.005 && bb[3] - bb[1] < 0.005)) { c = c || [bb[0], bb[1]]; return [c[0] - 0.03, c[1] - 0.02, c[0] + 0.03, c[1] + 0.02]; }
    var px = (bb[2] - bb[0]) * 0.12 + 0.003, py = (bb[3] - bb[1]) * 0.12 + 0.002;
    return [bb[0] - px, bb[1] - py, bb[2] + px, bb[3] + py];
  }

  /* --------------------------------------------------------------- draw */
  function text(ctx, t, x, y, fill, halo, lw) {
    if (halo) { ctx.lineWidth = lw || 3; ctx.lineJoin = 'round'; ctx.strokeStyle = halo; ctx.strokeText(t, x, y); }
    ctx.fillStyle = fill; ctx.fillText(t, x, y);
  }
  // boxed label centred on (x, y); returns its box or null when it would overlap another label
  function tag(ctx, v, lines, x, y, st) {
    var k = v.k || 1, fs = (st.size || 11) * k, lh = fs * 1.2, padX = (st.padX === undefined ? 4 : st.padX) * k, padY = 2 * k;
    ctx.font = (st.weight || '700') + ' ' + fs + 'px ' + FONT;
    var w = 0; lines.forEach(function (l) { w = Math.max(w, ctx.measureText(l).width); });
    var bw = w + padX * 2, bh = lines.length * lh + padY * 2, b = [x - bw / 2, y - bh / 2, x + bw / 2, y + bh / 2];
    if (!(v.occ || NO_OCC).take(b)) return null;
    if (st.bg) {
      ctx.fillStyle = st.bg; ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(b[0], b[1], bw, bh, 2 * k); else ctx.rect(b[0], b[1], bw, bh);
      ctx.fill();
      if (st.border) { ctx.strokeStyle = st.border; ctx.lineWidth = k; ctx.stroke(); }
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    lines.forEach(function (l, i) { text(ctx, l, x, b[1] + padY + lh * (i + 0.5), st.color, st.bg ? null : st.halo || COL.halo, 3 * k); });
    ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
    return b;
  }
  function hit(v, x, y, r, ds, ll, rad) { if (v.hits) v.hits.push({ x: x, y: y, r: r, ds: ds, lon: ll[0], lat: ll[1], rad: rad || 10 }); }

  // painted runway markings in a frame where (0, 0) is the landing threshold, +y runs back out of the
  // runway, -y along the landing direction and x across; units are pixels, mpp = metres per pixel
  function markings(ctx, e, rm, v, Lpx) {
    var mpp = v.mpp, w = rm.wM / mpp, half = w / 2, mpx = 1 / mpp;
    ctx.fillStyle = COL.mark; ctx.strokeStyle = COL.mark;
    // threshold bar and piano keys
    ctx.fillRect(-half + mpx, -1.8 * mpx, w - 2 * mpx, Math.max(1, 1.8 * mpx));
    var n = rm.wM >= 45 ? 12 : rm.wM >= 30 ? 8 : 6, sw = (rm.wM - 6) / (n * 2 - 1);
    if (sw * mpx >= 1.2) for (var i = 0; i < n * 2 - 1; i += 2) ctx.fillRect(-half + 3 * mpx + i * sw * mpx, -36 * mpx, sw * mpx, 30 * mpx);
    // painted designator
    var fs = 9 * mpx;
    if (fs >= 7 && Lpx > 60 * mpx) {
      ctx.font = '700 ' + fs + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      var num2 = e.desig.replace(/[LRC]$/, ''), side = e.desig.slice(num2.length);
      ctx.fillText(num2, 0, -48 * mpx);
      if (side) ctx.fillText(side, 0, -60 * mpx);
      ctx.textAlign = 'start';
    }
    // aiming point (400 m) and touchdown zone (150 m pairs)
    if (rm.lM > 1200 && w >= 14) {
      var ax = Math.min(9, half * 0.25) * mpx;
      ctx.fillRect(ax, -(400 + 45) * mpx, 8 * mpx, 45 * mpx); ctx.fillRect(-ax - 8 * mpx, -(400 + 45) * mpx, 8 * mpx, 45 * mpx);
      [150, 300, 600].forEach(function (dd) {
        if (dd * 2 + 100 > rm.lM) return;
        ctx.fillRect(ax, -(dd + 22) * mpx, 3 * mpx, 22 * mpx); ctx.fillRect(-ax - 3 * mpx, -(dd + 22) * mpx, 3 * mpx, 22 * mpx);
      });
    }
  }
  function drawRunway(ctx, ds, rm, v) {
    var k = v.k || 1, A = v.P(rm.a), B = v.P(rm.b), wpx = rm.wM / v.mpp, Lpx = Math.hypot(B[0] - A[0], B[1] - A[1]);
    var ang = Math.atan2(B[1] - A[1], B[0] - A[0]); // screen angle a -> b
    if (wpx < 2.5) {
      ctx.strokeStyle = COL.rwy; ctx.lineWidth = Math.max(3, wpx) * k; ctx.lineCap = 'butt';
      ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
    } else {
      ctx.save();
      ctx.translate(A[0], A[1]); ctx.rotate(ang);
      ctx.fillStyle = COL.rwy; ctx.fillRect(0, -wpx / 2, Lpx, wpx);
      ctx.strokeStyle = COL.rwyEdge; ctx.lineWidth = 1; ctx.strokeRect(0, -wpx / 2, Lpx, wpx);
      if (wpx >= 7) { // edge and centreline markings
        ctx.strokeStyle = COL.mark; ctx.lineWidth = Math.max(0.8, 0.9 / v.mpp);
        ctx.beginPath(); ctx.moveTo(0, -wpx / 2 + 1.5); ctx.lineTo(Lpx, -wpx / 2 + 1.5); ctx.moveTo(0, wpx / 2 - 1.5); ctx.lineTo(Lpx, wpx / 2 - 1.5); ctx.stroke();
        var dash = Math.max(4, 30 / v.mpp), gap = Math.max(3, 20 / v.mpp);
        ctx.setLineDash([dash, gap]); ctx.lineWidth = Math.max(0.8, 0.9 / v.mpp);
        ctx.beginPath(); ctx.moveTo(90 / v.mpp, 0); ctx.lineTo(Lpx - 90 / v.mpp, 0); ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.restore();
      if (wpx >= 7) rm.ends.forEach(function (e) {
        var Lp = v.P(e.land), Sp = v.P(e.at), Op = e.at === rm.a ? B : A;
        var ix = Op[0] - Sp[0], iy = Op[1] - Sp[1]; // into the runway (landing direction) on screen
        ctx.save(); ctx.translate(Lp[0], Lp[1]); ctx.rotate(Math.atan2(ix, -iy)); // -y now points along the landing direction
        markings(ctx, e, rm, v, Lpx);
        ctx.restore();
        // displaced threshold: arrows from the runway start to the landing threshold
        var dd = Math.hypot(Lp[0] - Sp[0], Lp[1] - Sp[1]);
        if (dd > 12) {
          ctx.strokeStyle = COL.mark; ctx.lineWidth = Math.max(1, 0.9 / v.mpp);
          var ux = (Lp[0] - Sp[0]) / dd, uy = (Lp[1] - Sp[1]) / dd, aw = Math.min(wpx * 0.18, 10);
          for (var t = 0.25; t < 1; t += 0.25) {
            var cx = Sp[0] + ux * dd * t, cy = Sp[1] + uy * dd * t;
            ctx.beginPath(); ctx.moveTo(cx - ux * aw - uy * aw, cy - uy * aw + ux * aw); ctx.lineTo(cx, cy); ctx.lineTo(cx - ux * aw + uy * aw, cy - uy * aw - ux * aw); ctx.stroke();
          }
        }
      });
    }
    hit(v, (A[0] + B[0]) / 2, (A[1] + B[1]) / 2, rm.rw, ds, [(rm.a[0] + rm.b[0]) / 2, (rm.a[1] + rm.b[1]) / 2], Math.max(8, wpx));
  }
  // designator, magnetic bearing and THR elevation just outside each runway end
  function endLabels(ctx, ds, rm, v) {
    var k = v.k || 1, wpx = rm.wM / v.mpp;
    rm.ends.forEach(function (e) {
      var S = v.P(e.at), Ot = v.P(rm.ends.length > 1 && e.at === rm.a ? rm.b : rm.a), d = Math.hypot(S[0] - Ot[0], S[1] - Ot[1]) || 1;
      var ux = (S[0] - Ot[0]) / d, uy = (S[1] - Ot[1]) / d, gap = (wpx > 10 ? 20 : 15) * k;
      var lines = [e.desig];
      if (v.mpp < 14 && e.mb !== null) lines.push(pad3(e.mb) + '°');
      if (v.mpp < 4 && e.elev) lines.push('THR ' + e.elev);
      var x = S[0] + ux * (gap + lines.length * 6 * k), y = S[1] + uy * (gap + lines.length * 6 * k);
      var b = tag(ctx, v, lines, x, y, { color: COL.label, bg: 'rgba(255,255,255,.94)', border: COL.label, size: 11, padX: 4 });
      if (b && e.dir) hit(v, x, y, e.dir, ds, e.at, 14 * k);
    });
  }
  // dimensions / surface / PCN along the runway, kept upright
  function sideLabel(ctx, rm, v) {
    var k = v.k || 1, A = v.P(rm.a), B = v.P(rm.b), Lpx = Math.hypot(B[0] - A[0], B[1] - A[1]);
    var t = [rm.name ? 'RWY ' + rm.name : '', rm.dims, rm.surf, rm.pcn].filter(Boolean).join('  ·  ');
    ctx.font = '600 ' + 11 * k + 'px ' + FONT;
    var tw = ctx.measureText(t).width;
    if (!t || tw > Lpx * 0.9) return;
    var ang = Math.atan2(B[1] - A[1], B[0] - A[0]);
    if (ang > Math.PI / 2 || ang < -Math.PI / 2) ang += Math.PI;
    var mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2, off = rm.wM / v.mpp / 2 + 9 * k;
    var nx = -Math.sin(ang) * off, ny = Math.cos(ang) * off;
    var box = [mx + nx - tw / 2, my + ny - 8 * k, mx + nx + tw / 2, my + ny + 8 * k]; // approximate (rotated) footprint
    if (Math.abs(Math.sin(ang)) > 0.5) box = [mx + nx - 8 * k - tw * Math.abs(Math.cos(ang)) / 2, my + ny - tw * Math.abs(Math.sin(ang)) / 2, mx + nx + 8 * k + tw * Math.abs(Math.cos(ang)) / 2, my + ny + tw * Math.abs(Math.sin(ang)) / 2];
    if (!(v.occ || NO_OCC).take(box)) return;
    ctx.save(); ctx.translate(mx + nx, my + ny); ctx.rotate(ang);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    text(ctx, t, 0, 0, COL.label, COL.halo, 3.5 * k);
    ctx.restore();
  }
  function feather(ctx, ds, e, v) {
    var k = v.k || 1, back = (e.hdg + 180) % 360, L0 = e.land, len = 8;
    var far = AX.dest(L0[0], L0[1], back, len), l = AX.dest(L0[0], L0[1], back - 2.5, len / Math.cos(2.5 * D2R)), r = AX.dest(L0[0], L0[1], back + 2.5, len / Math.cos(2.5 * D2R));
    var P0 = v.P(L0), PF = v.P(far), PL = v.P(l), PR = v.P(r);
    ctx.fillStyle = 'rgba(142,36,170,.22)';
    ctx.beginPath(); ctx.moveTo(P0[0], P0[1]); ctx.lineTo(PL[0], PL[1]); ctx.lineTo(PF[0], PF[1]); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = COL.ils; ctx.lineWidth = 1.2 * k;
    ctx.beginPath(); ctx.moveTo(P0[0], P0[1]); ctx.lineTo(PL[0], PL[1]); ctx.lineTo(PF[0], PF[1]); ctx.lineTo(PR[0], PR[1]); ctx.closePath(); ctx.stroke();
    ctx.setLineDash([6 * k, 4 * k]); ctx.beginPath(); ctx.moveTo(P0[0], P0[1]); ctx.lineTo(PF[0], PF[1]); ctx.stroke(); ctx.setLineDash([]);
    var i = e.ils, lines = [(i.kind || 'ILS') + ' ' + e.desig + (i.cat ? ' ' + i.cat : ''), [i.ident, i.freq].filter(Boolean).join(' ') + (e.mb !== null ? '  ' + pad3(e.mb) + '°' : '')];
    if (i.gp) lines.push('GP ' + i.gp + '°' + (i.dme ? '  DME CH ' + i.dme : ''));
    var ux = PF[0] - P0[0], uy = PF[1] - P0[1], d = Math.hypot(ux, uy) || 1;
    var x = PF[0] + ux / d * 26 * k, y = PF[1] + uy / d * 18 * k;
    if (tag(ctx, v, lines.filter(Boolean), x, y, { color: COL.ils, bg: 'rgba(255,255,255,.94)', border: COL.ils, size: 10.5, weight: '700' })) hit(v, x, y, i.nav, ds, far, 18 * k);
  }
  function arpSym(ctx, x, y, k) {
    ctx.strokeStyle = COL.arp; ctx.lineWidth = 1.4 * k; ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x, y, 6 * k, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = COL.arp;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, 6 * k, -Math.PI / 2, 0); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, 6 * k, Math.PI / 2, Math.PI); ctx.closePath(); ctx.fill();
  }

  // Draws every aerodrome of `ds` that is in view.
  // v = {P([lon, lat]) -> [x, y], mpp: metres per pixel, vis([w, s, e, n]) -> bool, k: font scale,
  //      occ: Occ (label collisions), hits: [] (click targets), skipLabels: bool}
  function draw(ctx, ds, v) {
    if (!ds || !ds.byType) return;
    var k = v.k || 1, list = all(ds).filter(function (m) { return m.reach && v.vis(m.reach); });
    if (!list.length) return;
    ctx.save();
    // ILS feathers under everything else
    if (v.mpp > 5 && v.mpp < 450) list.forEach(function (m) { m.runways.forEach(function (rm) { rm.ends.forEach(function (e) { if (e.ils && e.land) feather(ctx, ds, e, v); }); }); });
    list.forEach(function (m) { m.runways.forEach(function (rm) { if (v.vis(rm.bb)) drawRunway(ctx, ds, rm, v); }); });
    if (v.mpp < 30) list.forEach(function (m) { m.runways.forEach(function (rm) { if (v.vis(rm.bb)) endLabels(ctx, ds, rm, v); }); });
    if (v.mpp < 14) list.forEach(function (m) { m.runways.forEach(function (rm) { if (v.vis(rm.bb)) sideLabel(ctx, rm, v); }); });
    list.forEach(function (m) {
      if (m.arp && v.mpp < 40) {
        var q = v.P(m.arp);
        arpSym(ctx, q[0], q[1], k); (v.occ || NO_OCC).add([q[0] - 7 * k, q[1] - 7 * k, q[0] + 7 * k, q[1] + 7 * k]);
        hit(v, q[0], q[1], m.ad, ds, m.arp, 10 * k);
        if (v.mpp < 6) tag(ctx, v, ['ARP'], q[0], q[1] + 15 * k, { color: COL.arp, size: 9.5 });
      }
      if (v.mpp < 6) m.hot.forEach(function (h) {
        var q = v.P(h.at); ctx.strokeStyle = COL.hot; ctx.lineWidth = 2 * k; ctx.beginPath(); ctx.arc(q[0], q[1], 14 * k, 0, Math.PI * 2); ctx.stroke();
        if (tag(ctx, v, [h.t], q[0] + 22 * k, q[1] - 14 * k, { color: '#fff', bg: COL.hot, size: 10 })) hit(v, q[0], q[1], h.r, ds, h.at, 14 * k);
      });
      if (v.mpp < 1.6) m.holds.forEach(function (h) {
        var q = v.P(h.at); ctx.fillStyle = COL.hold; ctx.fillRect(q[0] - 4 * k, q[1] - 1.5 * k, 8 * k, 3 * k);
        hit(v, q[0], q[1], h.r, ds, h.at, 6 * k);
        if (h.t && v.mpp < 0.8) tag(ctx, v, [h.t], q[0], q[1] - 9 * k, { color: COL.hold, size: 9 });
      });
      if (v.mpp < 4.5) m.twy.forEach(function (t) {
        if (!v.vis([t.at[0], t.at[1], t.at[0], t.at[1]])) return;
        var q = v.P(t.at);
        if (tag(ctx, v, [t.t], q[0], q[1], { color: COL.twyText, bg: COL.twySign, size: 11, padX: 4 })) hit(v, q[0], q[1], t.r, ds, t.at, 10 * k);
      });
      if (v.mpp < 6) m.apn.forEach(function (a) {
        var q = v.P(a.at);
        if (tag(ctx, v, [a.t.toUpperCase()], q[0], q[1], { color: COL.apron, size: 11, weight: 'italic 700' })) hit(v, q[0], q[1], a.r, ds, a.at, 12 * k);
      });
      if (v.mpp < 0.9) m.stands.forEach(function (st) {
        var q = v.P(st.at);
        ctx.fillStyle = COL.stand; ctx.beginPath(); ctx.arc(q[0], q[1], 2.2 * k, 0, Math.PI * 2); ctx.fill();
        if (tag(ctx, v, [st.t], q[0], q[1] - 9 * k, { color: COL.stand, size: 9.5 })) hit(v, q[0], q[1], st.r, ds, st.at, 8 * k);
      });
    });
    ctx.restore();
  }

  /* ------------------------------------------------- airport information */
  function esc(t) { return String(t === undefined || t === null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function cells(block) { return (block && block.rows || []).map(function (r) { return r.map(function (c) { return c && c.t !== undefined ? c.t : ''; }); }); }
  function tableOf(ds, ad, n) { return AIP.adBlocks(ds, ad, n).filter(function (b) { return b.kind === 'table'; })[0]; }
  // Airport information card (HTML): reference data, runways with declared distances and ILS, frequencies, navaids
  function cardHtml(ds, ad, opts) {
    var p = ad.cur.p, m = of(ds, ad), arp = M.pointOf(ds, ad);
    var mv = s(p.magneticVariation), rows = [];
    function kv(k2, v2) { if (v2) rows.push('<div><b>' + k2 + '</b><span>' + esc(v2) + '</span></div>'); }
    kv('ARP', arp ? AX.fmtPos(arp, 0) : '');
    kv('Elevation', tidy(M.fq(p.fieldElevation)));
    kv('MAG VAR', mv ? AIP.magVar(mv) + (s(p.dateMagneticVariation) ? ' (' + s(p.dateMagneticVariation) + ')' : '') : '');
    kv('Transition ALT / LVL', tidy([M.fq(p.transitionAltitude), M.fq(p.transitionLevel)].filter(Boolean).join(' / ')));
    kv('Reference temp.', M.fq(p.referenceTemperature));
    kv('City', arr(p.servedCity).map(function (c) { return c && s(c.name); }).filter(Boolean).join(', '));
    kv('Type / control', [s(p.type), s(p.controlType)].filter(Boolean).join(' · '));
    var h = '<div class="adc-head"><div><div class="adc-code">' + esc(M.shortName(ad)) + (s(p.designatorIATA) ? ' <span class="chip">' + esc(s(p.designatorIATA)) + '</span>' : '') + '</div>' +
      '<div class="adc-name">' + esc(s(p.name)) + '</div></div><span class="sp"></span><button class="btn small ghost" data-adc="close" title="Close">✕</button></div>';
    h += '<div class="adc-kv">' + rows.join('') + '</div>';
    // runways: one header row per runway (dimensions, surface, strength), one row per direction
    var dd = new Map(), rwRows = [];
    (AIP.directions(ds, ad) || []).forEach(function (x) { dd.set(x.dir, AIP.declared(ds, x.dir)); });
    (m ? m.runways : []).forEach(function (rm) {
      rwRows.push('<tr class="adc-rw"><td colspan="4"><b>RWY ' + esc(rm.name) + '</b> · ' + esc([rm.dims, rm.surf, rm.pcn].filter(Boolean).join(' · ')) + '</td></tr>');
      rm.ends.forEach(function (e) {
        var d = e.dir ? dd.get(e.dir) || {} : {};
        var dist = ['TORA', 'TODA', 'ASDA', 'LDA'].map(function (k2) { return d[k2] ? tidy(d[k2].t).replace(/\s*M$/, '') : '—'; });
        rwRows.push('<tr><td><b>' + esc(e.desig) + '</b></td><td>' + (e.mb !== null ? pad3(e.mb) + '°M' : '') + (e.tb !== null ? '<br><span class="muted">' + tidy(e.tb.toFixed(1)) + '°T</span>' : '') + '</td>' +
          '<td>' + esc(e.elev) + '</td><td><span class="mono">' + (dist.join('') === '————' ? '' : esc(dist.join(' / '))) + '</span>' +
          (e.ils ? '<br><span class="adc-ils">' + esc([e.ils.kind, e.ils.cat, e.ils.ident, e.ils.freq, e.ils.gp ? 'GP ' + e.ils.gp + '°' : ''].filter(Boolean).join(' ')) + '</span>' : '') + '</td></tr>');
      });
    });
    if (rwRows.length) h += '<h4>Runways</h4><div class="adc-scroll"><table class="adc-t"><tr><th>RWY</th><th>BRG</th><th>THR elev</th><th>TORA / TODA / ASDA / LDA · ILS</th></tr>' + rwRows.join('') + '</table></div>';
    // communications (AD 2.18) and navaids (AD 2.19)
    var com = cells(tableOf(ds, ad, 18)).filter(function (r) { return r[2]; });
    if (com.length) h += '<h4>Communications</h4><table class="adc-t">' + com.map(function (r) { return '<tr><td><b>' + esc(r[0]) + '</b></td><td>' + esc(r[1]).replace(/\n/g, '<br>') + '</td><td class="mono adc-f">' + esc(r[2].replace(/ \(8\.33 kHz\)/g, ' (8.33)')).replace(/\n/g, '<br>') + '</td></tr>'; }).join('') + '</table>';
    var nav = cells(tableOf(ds, ad, 19)).filter(function (r) { return r[1] || r[2]; });
    if (nav.length) h += '<h4>Radio navigation aids</h4><table class="adc-t">' + nav.map(function (r) { return '<tr><td><b>' + esc(r[0]) + '</b></td><td>' + esc(r[1]) + '</td><td class="mono">' + esc(r[2]) + '</td></tr>'; }).join('') + '</table>';
    if (m && (m.twy.length || m.stands.length)) {
      var tw = m.twy.map(function (t) { return t.t; }).filter(function (x, i, a) { return a.indexOf(x) === i; }).sort();
      h += '<h4>Movement area</h4><div class="adc-note">' + (tw.length ? 'Taxiways: ' + esc(tw.join(', ')) + '<br>' : '') + (m.apn.length ? 'Aprons: ' + esc(m.apn.map(function (a) { return a.t; }).join(', ')) + '<br>' : '') +
        (m.stands.length ? 'Stands: ' + m.stands.length : '') + (m.holds.length ? ' · Holding positions: ' + m.holds.length : '') + '</div>';
    }
    if (m && m.runways.some(function (rm) { return rm.est; })) h += '<div class="adc-note muted">Runway width not in the data: drawn 45 m wide.</div>';
    // obstacle limitation surfaces (ols.js, loaded after this module)
    if (m && m.runways.length && typeof OLS !== 'undefined') {
      var oc = OLS.check(ds, ad, opts && opts.obsSets);
      if (oc) h += '<h4>Obstacle limitation surfaces (Annex 14)</h4><div class="adc-note">' + (oc.list.length ? '<b class="sev-err">' + oc.list.length + ' obstacle(s) penetrate</b>: ' + esc(oc.list.slice(0, 3).map(function (p) { return p.name + ' +' + p.pen.toFixed(1) + ' m (' + p.surface + ')'; }).join('; ')) + (oc.list.length > 3 ? '…' : '') : '✓ no penetration among ' + oc.checked + ' obstacles') +
        ' <button class="btn small" data-adc="ols">🗻 Surfaces in 3D</button></div>';
    }
    h += '<div class="adc-actions"><button class="btn small" data-adc="aip">AIP AD 2</button><button class="btn small" data-adc="procs">Procedures</button><button class="btn small" data-adc="print">Print airport chart</button><button class="btn small" data-adc="fit">Zoom to airport</button>' +
      (m && m.runways.length ? '<button class="btn small" data-adc="3dapp" title="Crew view down the glide path in 3D">🗻 3D approach</button><button class="btn small" data-adc="3ddep" title="Crew view along the climb-out in 3D">🗻 3D departure</button>' : '') + '</div>';
    h += '<div class="adc-sig" data-sig="' + esc(SIG) + '"><span class="nfo-line">⚠ Not for operational use</span> · Airport chart · AIXM Code Converter</div>';
    return h;
  }

  return { all: all, of: of, bounds: bounds, draw: draw, cardHtml: cardHtml, Occ: Occ, tag: tag, metres: metres, tidy: tidy, COL: COL };
})();
