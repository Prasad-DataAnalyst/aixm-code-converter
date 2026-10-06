/*!
 * AIXM Code Converter
 * Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com> - author of the AIXM Code Converter
 * SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE; keep this notice in all copies)
 * ==========================================================================
 * AIXM Code Converter - obstacle and terrain studies (STUDY)
 * For the reports of the Digital data tab:
 *   flight paths   the legs of every SID, STAR and approach loaded, with their lowest published altitude and an
 *                  indicative minimum obstacle clearance (MOC) of the phase of flight (PANS-OPS Doc 8168 Vol II
 *                  orders of magnitude: arrival / initial 300 m, intermediate 150 m, final 75 m, missed approach
 *                  50 m, departure 90 m = 0.8 % gradient at about 6 NM)
 *   obstacle       one obstacle studied in depth: terrain under it (terrain file loaded, else online terrain tiles,
 *                  else the built-in model) and its base, Annex 14 surface margin, legs passing near it with the
 *                  vertical clearance, runway centreline offset, marking and lighting expected (Annex 14 chapter 6),
 *                  eTOD accuracy of its area, findings by severity
 *   terrain        terrain along every leg (highest point within the leg's corridor) against the leg altitude, the
 *                  highest terrain around an aerodrome, terrain above the Annex 14 surfaces
 *   picture        a map picture for the report: terrain shading, runways, flight paths, obstacles, rings, scale
 * Indicative only: not a procedure design or aerodrome safeguarding assessment (see the disclaimer).
 * ========================================================================== */
/* global AX, MODEL, MAPVIEW, OLS, DEM, TERRAIN, OBSTVIEW, IFP */
var STUDY = (function () {
  'use strict';
  var M = MODEL, s = M.s;
  var PROC = { StandardInstrumentDeparture: 'SID', StandardInstrumentArrival: 'STAR', InstrumentApproachProcedure: 'IAP' };
  var MOC = { ArrivalLeg: 300, ArrivalFeederLeg: 300, InitialLeg: 300, IntermediateLeg: 150, FinalLeg: 75, MissedApproachLeg: 50, DepartureLeg: 90 };
  var PHASE = { ArrivalLeg: 'arrival', ArrivalFeederLeg: 'arrival feeder', InitialLeg: 'initial approach', IntermediateLeg: 'intermediate approach', FinalLeg: 'final approach', MissedApproachLeg: 'missed approach', DepartureLeg: 'departure' };
  function altM(q, ref) {
    q = Array.isArray(q) ? q[0] : q;
    if (!q || q.v === undefined || q.nil !== undefined) return null;
    if (/SFC|OTHER:HEI/.test(s(ref))) return null; // a height above ground: not an altitude
    var v = parseFloat(q.v); if (isNaN(v)) return null;
    var u = String(q.u || 'FT').toUpperCase();
    return u === 'FL' ? v * 100 * 0.3048 : u === 'M' ? v : v * 0.3048;
  }

  /* ---------------------------------------------------------- flight paths */
  var segCache = new WeakMap();
  // the aerodrome of a procedure held in another data set (an IFP data set without the aerodrome)
  function adOf(ds, pr) { var o = IFP.aerodrome(ds, pr); return o ? o.r : null; }
  function segments(datasets) {
    var out = [], sig = datasets.map(function (d) { return d.id; }).join(','); // leg points may lie in another data set
    datasets.forEach(function (ds) {
      var e = segCache.get(ds), c = e && e.sig === sig ? e.c : null;
      if (!c) {
        c = [];
        Object.keys(PROC).forEach(function (k) {
          (ds.byType[k] || []).forEach(function (pr) {
            var paths = [];
            try { paths = MAPVIEW.procPaths(ds, pr); } catch (e) { paths = []; }
            var ad = ds.owner.get(pr) || adOf(ds, pr), pname = PROC[k] + ' ' + (s(pr.cur.p.designator) || s(pr.cur.p.name));
            paths.forEach(function (p) {
              var lp = p.leg.cur.p, al = IFP.alt(lp), lo = altM(lp.lowerLimit !== undefined ? lp.lowerLimit : lp.lowerLimitAltitude, lp.lowerLimitReference), up = altM(lp.upperLimit !== undefined ? lp.upperLimit : lp.upperLimitAltitude, lp.upperLimitReference);
              if (lo === null && up === null && al.endM !== null) lo = al.endM; // AIXM 5.2 / DepartureLeg: crossing altitude at the end
              c.push({ ds: ds, pr: pr, leg: p.leg, kind: PROC[k], ad: ad, adCode: ad ? M.shortName(ad) : '', proc: pname, label: (ad ? M.shortName(ad) + ' ' : '') + pname + (p.label ? ' · ' + p.label : ''),
                legKind: p.leg.k, phase: PHASE[p.leg.k] || '', coords: p.coords, alt: lo !== null ? lo : up, altTxt: al.txt, moc: MOC[p.leg.k] || 150, dashed: p.dashed });
            });
          });
        });
        segCache.set(ds, { sig: sig, c: c });
      }
      out = out.concat(c);
    });
    return out;
  }
  // lateral distance (NM) of point c from a polyline, with the nearest point
  function nearOnLine(c, coords) {
    var best = null, k = Math.cos(c[1] * Math.PI / 180);
    for (var i = 0; i < coords.length - 1; i++) {
      var a = coords[i], b = coords[i + 1];
      if (typeof a[0] !== 'number' || typeof b[0] !== 'number') continue;
      var ax = (a[0] - c[0]) * k, ay = a[1] - c[1], bx = (b[0] - c[0]) * k, by = b[1] - c[1], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
      var t = L2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L2)) : 0, px = ax + t * dx, py = ay + t * dy, d = Math.sqrt(px * px + py * py) * 60;
      if (!best || d < best.d) best = { d: d, at: [c[0] + px / k, c[1] + py] };
    }
    return best;
  }
  function near(c, segs, maxNM) {
    var out = [];
    segs.forEach(function (sg) { var n = nearOnLine(c, sg.coords); if (n && n.d <= maxNM) out.push({ seg: sg, d: n.d, at: n.at }); });
    return out.sort(function (a, b) { return a.d - b.d; });
  }

  /* --------------------------------------------------------------- terrain */
  // elevation at a point: terrain file loaded > online terrain tiles > built-in model
  var online = new Map();
  async function ground(c) {
    if (typeof DEM !== 'undefined' && DEM.has(c[0], c[1])) {
      var e = await DEM.elevation(c[0], c[1]);
      if (e) return { h: e.h, src: 'terrain file ' + e.item.name + (e.item.r.spacingArcsec ? ' (' + Math.round(Math.max(e.item.r.spacingArcsec[0], e.item.r.spacingArcsec[1]) * 10) / 10 + '″ posts)' : ''), fine: true };
    }
    if (typeof TERRAIN !== 'undefined') {
      var key = Math.round(c[0] * 20) + ',' + Math.round(c[1] * 20); // 0.05° cells share their tiles
      if (!online.has(key)) online.set(key, TERRAIN.area([c[0] - 0.03, c[1] - 0.03, c[0] + 0.03, c[1] + 0.03], 4).catch(function () { return null; }));
      var a = await online.get(key);
      if (a) return { h: a.sample(c[0], c[1]), src: a.source + ' (about 30 m posts)', fine: true };
      if (TERRAIN.load()) return { h: TERRAIN.elev(c[0], c[1]), src: 'built-in global model (0.25° cells: indicative only)', fine: false };
    }
    return null;
  }

  /* -------------------------------------------------------------- obstacle */
  function sevRank(x) { return { error: 0, caution: 1, warning: 1, info: 2, ok: 3 }[x] !== undefined ? { error: 0, caution: 1, warning: 1, info: 2, ok: 3 }[x] : 2; }
  // one obstacle row (obstview.js) studied in depth; st: its set (aerodrome, OLS surfaces); segs: flight paths
  async function obstacle(x, st, segs) {
    var f = [], out = { row: x, findings: f };
    function add(sev, what, txt) { f.push({ sev: sev, what: what, txt: txt }); }
    if (!x.c) { add('error', 'Position', 'No position: the obstacle cannot be analysed.'); return out; }
    var top = x.elev, hgt = x.hgt;
    // terrain under the obstacle and its base
    var g = await ground(x.c);
    out.terrain = g;
    if (g && top !== null) {
      var base = hgt !== null ? top - hgt : null;
      out.base = base;
      out.aboveTerrain = top - g.h;
      if (base !== null) {
        out.baseDiff = base - g.h;
        var tol = g.fine ? 15 : 60;
        if (Math.abs(out.baseDiff) > tol) add('warning', 'Terrain', 'The declared base (elevation − height = ' + r1(base) + ' m) differs from the terrain (' + r1(g.h) + ' m) by ' + r1(out.baseDiff) + ' m: check elevation, height and their datums.');
        else add('ok', 'Terrain', 'Declared base ' + r1(base) + ' m agrees with the terrain (' + r1(g.h) + ' m, difference ' + r1(out.baseDiff) + ' m).');
      }
    } else if (!g) add('info', 'Terrain', 'No terrain available here (load a terrain file, or go online for terrain tiles).');
    // Annex 14 surfaces
    var S = st && st.ols && st.ols.surfaces;
    if (S && top !== null && typeof OLS !== 'undefined') {
      var lim = OLS.limitAt(S, x.c);
      if (lim) {
        out.ols = { surface: lim.surface, allowed: lim.h, margin: lim.h - top };
        if (top > lim.h + 0.05) add('error', 'Annex 14', 'Penetrates the ' + lim.surface + ' by ' + r1(top - lim.h) + ' m (surface at ' + r1(lim.h) + ' m, top ' + r1(top) + ' m). Annex 14 chapter 4 / 6: remove, or assess (shielding, aeronautical study), mark and light.');
        else add(lim.h - top < 15 ? 'caution' : 'ok', 'Annex 14', 'Below the ' + lim.surface + ' by ' + r1(lim.h - top) + ' m (surface at ' + r1(lim.h) + ' m).');
      } else add('info', 'Annex 14', 'Outside the obstacle limitation surfaces of ' + (st.ad ? st.ad.icao : 'the aerodrome') + '.');
    }
    // runway centreline
    if (S && S.runways && S.runways.length) {
      var best = null;
      S.runways.forEach(function (r) {
        var a = r.rm.a, b = r.rm.b, n = nearOnLine(x.c, [a, b]), brg = AX.bearing(a, b), toPt = AX.bearing(a, x.c), dA = AX.distNM(a, x.c) * 1852;
        var along = dA * Math.cos((toPt - brg) * Math.PI / 180), side = Math.sin((toPt - brg) * Math.PI / 180) >= 0 ? 'right' : 'left', off = Math.abs(dA * Math.sin((toPt - brg) * Math.PI / 180));
        if (!best || n.d < best.n) best = { n: n.d, name: r.rm.name, off: off, along: along, side: side, len: AX.distNM(a, b) * 1852, end: r.ends && r.ends[0] ? r.ends[0].e.desig : '' };
      });
      out.runway = best;
    }
    // flight paths near it
    var ns = near(x.c, segs || [], 3);
    out.paths = ns.slice(0, 12).map(function (n) {
      var clr = n.seg.alt !== null && top !== null ? n.seg.alt - top : null, sev = clr === null ? 'info' : clr < n.seg.moc ? (clr < 0 ? 'error' : 'warning') : clr < n.seg.moc * 1.5 ? 'caution' : 'ok';
      return { seg: n.seg, d: n.d, clr: clr, sev: sev };
    });
    out.paths.forEach(function (p) {
      if (p.sev === 'error') add('error', 'Flight path', p.seg.label + ': the leg altitude (' + p.seg.altTxt + ') is ' + r1(-p.clr) + ' m BELOW the top of the obstacle, ' + nm(p.d) + ' from the path.');
      else if (p.sev === 'warning') add('warning', 'Flight path', p.seg.label + ': ' + r1(p.clr) + ' m above the obstacle at ' + nm(p.d) + ' from the path — less than the ' + p.seg.moc + ' m indicative MOC of the ' + p.seg.phase + ' phase.');
      else if (p.sev === 'caution') add('caution', 'Flight path', p.seg.label + ': ' + r1(p.clr) + ' m clearance at ' + nm(p.d) + ' — within 1.5 × the indicative MOC.');
    });
    if (!ns.length && segs && segs.length) add('ok', 'Flight path', 'No procedure leg within 3 NM.');
    // marking and lighting (Annex 14 chapter 6)
    var tall = hgt !== null && hgt >= 150, pen = out.ols && out.ols.margin < 0;
    if ((tall || pen) && x.lighted !== 'YES') add('warning', 'Marking / lighting', (tall ? 'Height ' + r1(hgt) + ' m (≥ 150 m above ground)' : 'Penetrates an obstacle limitation surface') + ' but not lighted: Annex 14 6.2 expects it to be marked and lighted (unless an aeronautical study shows otherwise).');
    if ((tall || pen) && x.marked !== 'YES' && x.lighted === 'YES') add('caution', 'Marking / lighting', 'Lighted but not stated as marked; Annex 14 6.2 asks for day marking as well (or high-intensity lights by day).');
    // eTOD accuracy of its area
    var A = x.area && OBSTVIEW.AREAS[x.area.charAt(0)];
    if (A) {
      out.area = { name: 'Area ' + x.area, h: A.h, v: A.v };
      if (x.hAcc !== null && x.hAcc > A.h) add('error', 'eTOD accuracy', 'Horizontal accuracy ' + r1(x.hAcc) + ' m: Area ' + x.area + ' requires ' + A.h + ' m.');
      if (x.vAcc !== null && x.vAcc > A.v) add('error', 'eTOD accuracy', 'Vertical accuracy ' + r1(x.vAcc) + ' m: Area ' + x.area + ' requires ' + A.v + ' m.');
      if (x.hAcc !== null && x.vAcc !== null && x.hAcc <= A.h && x.vAcc <= A.v) add('ok', 'eTOD accuracy', 'Accuracies ' + r1(x.hAcc) + ' m / ' + r1(x.vAcc) + ' m meet Area ' + x.area + ' (' + A.h + ' m / ' + A.v + ' m).');
    }
    f.sort(function (a, b) { return sevRank(a.sev) - sevRank(b.sev); });
    out.worst = f.length ? f[0].sev : 'ok';
    return out;
  }
  function r1(v) { return v === null || v === undefined ? '' : (Math.round(v * 10) / 10).toLocaleString('en-US'); }
  function nm(d) { return d < 0.1 ? Math.round(d * 1852) + ' m' : (Math.round(d * 100) / 100) + ' NM'; }

  /* ------------------------------------------------- terrain along the legs */
  // for each leg: the highest terrain within ±w NM of its path (3 parallel lines) and the obstacle tops nearby
  async function legTerrain(segs, obsRows, opt) {
    opt = opt || {};
    var w = opt.width || 0.5, out = [];
    for (var i = 0; i < segs.length; i++) {
      var sg = segs[i], pts = sg.coords.filter(function (p) { return typeof p[0] === 'number'; });
      if (pts.length < 2) continue;
      var hi = null, hiAt = null, src = '';
      for (var o = -1; o <= 1; o++) {
        var line = offsetLine(pts, o * w);
        for (var j = 0; j < line.length - 1; j++) {
          var a = line[j], b = line[j + 1], n = Math.max(1, Math.ceil(AX.distNM(a, b) / 0.25));
          for (var k = 0; k <= n; k++) {
            var c = [a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n], g = await ground(c);
            if (g && (hi === null || g.h > hi)) { hi = g.h; hiAt = c; src = g.src; }
          }
        }
      }
      var ob = null;
      (obsRows || []).forEach(function (x) { if (!x.c || x.elev === null) return; var nl = nearOnLine(x.c, pts); if (nl && nl.d <= w && (!ob || x.elev > ob.elev)) ob = x; });
      var crit = Math.max(hi === null ? -1e9 : hi, ob ? ob.elev : -1e9), clr = sg.alt !== null && crit > -1e8 ? sg.alt - crit : null;
      out.push({ seg: sg, terrain: hi, at: hiAt, src: src, obstacle: ob, clr: clr, sev: clr === null ? 'info' : clr < 0 ? 'error' : clr < sg.moc ? 'warning' : clr < sg.moc * 1.5 ? 'caution' : 'ok' });
      if (opt.onProgress && i % 5 === 0) opt.onProgress((i + 1) / segs.length);
    }
    return out;
  }
  function offsetLine(pts, dNM) {
    if (!dNM) return pts;
    return pts.map(function (p, i) {
      var a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], brg = AX.bearing(a, b);
      return dest(p, brg + 90, dNM);
    });
  }
  function dest(p, brg, dNM) {
    var R = Math.PI / 180, d = dNM / 3440.065, la = p[1] * R, lo = p[0] * R, t = brg * R;
    var la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(t));
    var lo2 = lo + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2));
    return [lo2 / R, la2 / R];
  }
  // highest terrain within rings around a point; terrain above the Annex 14 surfaces (S)
  async function aroundAerodrome(c, S, rings, N) {
    rings = rings || [5, 10, 25]; N = N || 90;
    var R = rings[rings.length - 1], dLat = R / 60, dLon = dLat / Math.cos(c[1] * Math.PI / 180);
    var bb = [c[0] - dLon, c[1] - dLat, c[0] + dLon, c[1] + dLat], g = null, src = '';
    if (typeof DEM !== 'undefined' && DEM.has(c[0], c[1])) { g = await DEM.grid(bb, N, N); src = 'terrain file(s) loaded'; }
    var hi = rings.map(function () { return null; }), pens = [];
    for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) {
      var p = [bb[0] + (x + 0.5) * (bb[2] - bb[0]) / N, bb[3] - (y + 0.5) * (bb[3] - bb[1]) / N], h;
      if (g) { h = g[y * N + x]; if (h !== h) continue; } else { var gg = await ground(p); if (!gg) continue; h = gg.h; src = gg.src; }
      var d = AX.distNM(c, p);
      rings.forEach(function (rr, i) { if (d <= rr && (!hi[i] || h > hi[i].h)) hi[i] = { h: h, at: p, d: d, brg: AX.bearing(c, p) }; });
      if (S && typeof OLS !== 'undefined') { var lim = OLS.limitAt(S, p); if (lim && h > lim.h + 0.5) pens.push({ at: p, h: h, surface: lim.surface, pen: h - lim.h, d: d, brg: AX.bearing(c, p) }); }
    }
    pens.sort(function (a, b) { return b.pen - a.pen; });
    return { rings: rings, highest: hi, pens: pens.slice(0, 25), src: src, cell: Math.round(2 * R * 1852 / N) };
  }

  /* --------------------------------------------------------------- picture */
  function hypso(h) {
    if (h < 0) return [168, 205, 228];
    var st = [[0, [196, 222, 178]], [100, [214, 227, 170]], [300, [233, 223, 162]], [700, [220, 192, 140]], [1500, [190, 150, 110]], [2500, [165, 140, 125]], [4000, [235, 235, 235]]];
    for (var i = 1; i < st.length; i++) if (h <= st[i][0]) { var a = st[i - 1], b = st[i], t = (h - a[0]) / (b[0] - a[0]); return [0, 1, 2].map(function (k) { return a[1][k] + (b[1][k] - a[1][k]) * t; }); }
    return st[st.length - 1][1];
  }
  // opt: {bbox [w,s,e,n] | center + radiusNM, w, h, title, sub, paths [{coords, color, dashed, label}], points [{c, color, r, label, ring}],
  //       rings [{c, nm}], runways [[a, b]], areas [ring], jpeg} -> Promise<dataURL>
  async function picture(opt) {
    var W = opt.w || 1200, H = opt.h || 760, bb = opt.bbox;
    if (!bb) { var dl = opt.radiusNM / 60, dn = dl / Math.cos(opt.center[1] * Math.PI / 180) * (W / H) * 0.75; bb = [opt.center[0] - dn, opt.center[1] - dl, opt.center[0] + dn, opt.center[1] + dl]; }
    var k = Math.cos((bb[1] + bb[3]) / 2 * Math.PI / 180), sx = W / ((bb[2] - bb[0]) * k), sy = H / (bb[3] - bb[1]), sc = Math.min(sx, sy);
    var cx = (bb[0] + bb[2]) / 2, cy = (bb[1] + bb[3]) / 2;
    function P(p) { return [W / 2 + (p[0] - cx) * k * sc, H / 2 - (p[1] - cy) * sc]; }
    var vb = [cx - W / 2 / (k * sc), cy - H / 2 / sc, cx + W / 2 / (k * sc), cy + H / 2 / sc];
    var c = document.createElement('canvas'); c.width = W; c.height = H;
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#eef2f6'; ctx.fillRect(0, 0, W, H);
    // terrain: shaded relief with height colours
    var GW = 200, GH = Math.round(200 * H / W), grid = null, src = '';
    if (typeof DEM !== 'undefined' && DEM.has(cx, cy)) { grid = await DEM.grid(vb, GW, GH); src = 'terrain file'; }
    if (!grid || !grid.some(function (v) { return v === v; })) {
      grid = new Float32Array(GW * GH);
      var area = null;
      if (typeof TERRAIN !== 'undefined') { area = await TERRAIN.area(vb, 16).catch(function () { return null; }); }
      for (var yy = 0; yy < GH; yy++) for (var xx = 0; xx < GW; xx++) {
        var lon = vb[0] + (xx + 0.5) * (vb[2] - vb[0]) / GW, lat = vb[3] - (yy + 0.5) * (vb[3] - vb[1]) / GH;
        grid[yy * GW + xx] = area ? area.sample(lon, lat) : TERRAIN && TERRAIN.load() ? TERRAIN.elev(lon, lat) : NaN;
      }
      src = area ? area.source : 'built-in model (indicative)';
    }
    var img = ctx.createImageData(GW, GH), cellM = (vb[3] - vb[1]) * 111320 / GH;
    for (var y = 0; y < GH; y++) for (var x = 0; x < GW; x++) {
      var i = y * GW + x, h = grid[i], o = i * 4;
      if (h !== h) { img.data[o + 3] = 0; continue; }
      var hl = grid[y * GW + Math.max(0, x - 1)], hr = grid[y * GW + Math.min(GW - 1, x + 1)], hu = grid[Math.max(0, y - 1) * GW + x], hd = grid[Math.min(GH - 1, y + 1) * GW + x];
      var dzdx = ((hr === hr ? hr : h) - (hl === hl ? hl : h)) / (2 * cellM), dzdy = ((hd === hd ? hd : h) - (hu === hu ? hu : h)) / (2 * cellM);
      var shade = Math.max(0.55, Math.min(1.25, 1 + (-dzdx * 0.7 + dzdy * 0.7) * 3));
      var col = hypso(h);
      img.data[o] = Math.min(255, col[0] * shade); img.data[o + 1] = Math.min(255, col[1] * shade); img.data[o + 2] = Math.min(255, col[2] * shade); img.data[o + 3] = 255;
    }
    var tmp = document.createElement('canvas'); tmp.width = GW; tmp.height = GH; tmp.getContext('2d').putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.drawImage(tmp, 0, 0, W, H);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    (opt.areas || []).forEach(function (r) { ctx.beginPath(); r.forEach(function (p, j) { var q = P(p); if (j) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); }); ctx.closePath(); ctx.setLineDash([10, 7]); ctx.strokeStyle = '#6a1b9a'; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]); });
    (opt.rings || []).forEach(function (rg) { var q = P(rg.c), rp = rg.nm / 60 * sc; ctx.beginPath(); ctx.arc(q[0], q[1], rp, 0, 2 * Math.PI); ctx.setLineDash([5, 6]); ctx.strokeStyle = 'rgba(40,50,60,.7)'; ctx.lineWidth = 1.2; ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = '#28323c'; ctx.font = '600 13px Segoe UI, Arial, sans-serif'; ctx.fillText(rg.nm + ' NM', q[0] + rp * 0.71 + 3, q[1] - rp * 0.71 - 3); });
    (opt.runways || []).forEach(function (r) { var a = P(r[0]), b = P(r[1]); ctx.strokeStyle = '#1f2328'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.setLineDash([6, 6]); ctx.stroke(); ctx.setLineDash([]); });
    (opt.paths || []).forEach(function (p) {
      ctx.beginPath(); p.coords.forEach(function (pt, j) { if (typeof pt[0] !== 'number') return; var q = P(pt); if (j) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); });
      ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 5; ctx.stroke(); ctx.strokeStyle = p.color; ctx.lineWidth = 2.5; ctx.setLineDash(p.dashed ? [9, 6] : []); ctx.stroke(); ctx.setLineDash([]);
    });
    var placed = [];
    (opt.points || []).forEach(function (pt) {
      var q = P(pt.c), r = pt.r || 5;
      if (pt.ring) { ctx.beginPath(); ctx.arc(q[0], q[1], r + 7, 0, 2 * Math.PI); ctx.strokeStyle = '#b0186e'; ctx.lineWidth = 3; ctx.stroke(); }
      ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, 2 * Math.PI); ctx.fillStyle = pt.color || '#1d4e89'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
      if (pt.label) {
        ctx.font = (pt.ring ? '700 14px' : '600 11.5px') + ' Segoe UI, Arial, sans-serif';
        var tw = ctx.measureText(pt.label).width, lx = q[0] + r + 5, ly = q[1] - r - 3;
        if (!placed.some(function (b) { return lx < b[2] && lx + tw > b[0] && ly - 13 < b[3] && ly + 3 > b[1]; }) || pt.ring) {
          ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.strokeText(pt.label, lx, ly); ctx.fillStyle = '#14202e'; ctx.fillText(pt.label, lx, ly);
          placed.push([lx, ly - 13, lx + tw, ly + 3]);
        }
      }
    });
    // title, scale bar, north arrow, source
    if (opt.title) { ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.fillRect(0, 0, W, 34); ctx.fillStyle = '#0b2a4a'; ctx.font = '700 17px Segoe UI, Arial, sans-serif'; ctx.fillText(opt.title, 12, 23); var tw = ctx.measureText(opt.title).width; if (opt.sub) { ctx.font = '13px Segoe UI, Arial, sans-serif'; ctx.fillStyle = '#5b6676'; ctx.fillText(opt.sub, 12 + tw + 18, 23); } }
    var nmPx = sc / 60, steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50], bar = steps.filter(function (v) { return v * nmPx < W / 4; }).pop() || 0.1;
    ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fillRect(10, H - 38, bar * nmPx + 90, 28); ctx.fillStyle = '#14202e'; ctx.fillRect(18, H - 22, bar * nmPx, 5);
    ctx.font = '12px Segoe UI, Arial, sans-serif'; ctx.fillText(bar + ' NM (' + (Math.round(bar * 1852) >= 1000 ? Math.round(bar * 1.852 * 10) / 10 + ' km' : Math.round(bar * 1852) + ' m') + ')', 24 + bar * nmPx, H - 16);
    ctx.save(); ctx.translate(W - 30, 62); ctx.fillStyle = '#14202e'; ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(8, 8); ctx.lineTo(0, 3); ctx.lineTo(-8, 8); ctx.closePath(); ctx.fill(); ctx.font = '700 13px Segoe UI, Arial, sans-serif'; ctx.fillText('N', -4, 24); ctx.restore();
    ctx.font = '11px Segoe UI, Arial, sans-serif'; ctx.fillStyle = 'rgba(20,32,46,.8)'; var srcTxt = 'Terrain: ' + src + ' · indicative, not for operational use'; ctx.fillText(srcTxt, W - ctx.measureText(srcTxt).width - 10, H - 8);
    return opt.jpeg ? c.toDataURL('image/jpeg', 0.86) : c.toDataURL('image/png');
  }

  return { segments: segments, near: near, nearOnLine: nearOnLine, ground: ground, obstacle: obstacle, legTerrain: legTerrain, aroundAerodrome: aroundAerodrome, picture: picture, hypso: hypso, MOC: MOC, PHASE: PHASE, altM: altM };
})();
