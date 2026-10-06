/*!
 * AIXM Code Converter
 * Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com> - author of the AIXM Code Converter
 * SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE; keep this notice in all copies)
 * ==========================================================================
 * AIXM Code Converter - instrument approach profile (vertical profile view)
 * Builds the profile of an instrument approach from its AIXM legs, the way
 * approach charts show it: fixes (IAF / IF / FAF / MAPt) with distances to the
 * threshold, altitude constraints with chart bars (at or above = bar below,
 * at or below = bar above, at = both), courses, the glide path or vertical
 * angle with TCH, the threshold, minima (DA / MDA), the missed approach, a
 * terrain profile under the track, a rate-of-descent table and the time from
 * the FAF to the MAPt. Returns an AIP block {kind:'chart', svg, text} plus a
 * table of the profile for PDF / Excel / e-mail.
 * Indicative - drawn from the data, not a published chart.
 * ========================================================================== */
/* global AX, MODEL, AIP, ADCHART, TERRAIN, IFP */
var PROFILE = (function () {
  'use strict';
  var M = MODEL, s = M.s, arr = AX.arr, FTNM = 6076.12;
  var RANK = { InitialLeg: 0, IntermediateLeg: 1, FinalLeg: 2, MissedApproachLeg: 3 };

  function esc(t) { return String(t === undefined || t === null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function ftOf(q) {
    q = arr(q)[0];
    if (!q || q.nil !== undefined || q.v === undefined) return null;
    var v = parseFloat(q.v); if (isNaN(v)) return null;
    var u = String(q.u || 'FT').toUpperCase();
    return u === 'FL' ? v * 100 : /FT/.test(u) ? v : u === 'M' ? v / 0.3048 : v;
  }
  function constraint(lp) {
    var lo = ftOf(lp.lowerLimit !== undefined ? lp.lowerLimit : lp.lowerLimitAltitude), up = ftOf(lp.upperLimit !== undefined ? lp.upperLimit : lp.upperLimitAltitude), it = s(lp.verticalLimitsInterpretation) || s(lp.altitudeInterpretation);
    // AIXM 5.2: crossing altitudes at the end of the leg (altitudeCondition)
    if (lo === null && up === null) { var c = arr(lp.altitudeCondition)[0]; if (c) { lo = ftOf(c.minimumCrossingAtEnd); up = ftOf(c.maximumCrossingAtEnd); it = lo !== null && up !== null ? (lo === up ? 'AT' : 'BETWEEN') : lo !== null ? 'AT_OR_ABOVE' : 'AT_OR_BELOW'; } }
    if (lo === null && up === null) return null;
    if (lo !== null && up !== null && lo !== up) return { kind: 'between', lo: lo, up: up, alt: lo };
    var a = lo !== null ? lo : up;
    var kind = /ABOVE/.test(it) ? 'above' : /BELOW|AT_UPPER/.test(it) ? 'below' : it === 'AT_LOWER' ? 'above' : /^AT$|EXACT/.test(it) ? 'at' : lo !== null ? 'above' : 'below';
    if (it === 'AT_LOWER' && up === null) kind = 'above';
    return { kind: kind, alt: a };
  }
  function cText(c) { if (!c) return ''; var f = function (v) { return Math.round(v).toLocaleString('en-US'); }; return c.kind === 'between' ? f(c.up) + ' / ' + f(c.lo) : c.kind === 'above' ? 'at or above ' + f(c.alt) : c.kind === 'below' ? 'at or below ' + f(c.alt) : 'at ' + f(c.alt); }

  // profile data of an instrument approach, or null when it cannot be drawn
  function data(ds, proc) {
    var legs = AIP.procLegs(ds, proc).filter(function (x) { return RANK[x.leg.k] !== undefined; });
    if (!legs.length) return null;
    var firstInit = null;
    legs = legs.filter(function (x) { if (x.leg.k !== 'InitialLeg') return true; if (firstInit === null) firstInit = x.tr; return x.tr === firstInit; });
    legs = legs.map(function (x, i) { return { x: x, i: i }; }).sort(function (a, b) { return RANK[a.x.leg.k] - RANK[b.x.leg.k] || a.i - b.i; }).map(function (o) { return o.x; });
    // landing threshold
    var ro = IFP.runways(ds, proc, 'proc')[0], rd = ro ? ro.r : null, rds = ro ? ro.ds : ds; // the runway may be in the AIP data set
    var ad = rds === ds ? ds.owner.get(proc) : rds.owner.get(rd) || ds.owner.get(proc), thr = rd ? M.pointOf(rds, rd) : null, thrEl = null, desig = rd ? s(rd.cur.p.designator) : '', gpAng = null;
    var m = ad ? ADCHART.of(rds, ad) : null;
    if (m && rd) m.runways.forEach(function (rm) { rm.ends.forEach(function (e) { if (e.dir === rd) { thr = e.land; thrEl = e.elev; if (e.ils && parseFloat(e.ils.gp) > 1) gpAng = parseFloat(e.ils.gp); } }); });
    var thrFt = null;
    if (thrEl) { var mm = String(thrEl).match(/(-?[\d.]+)\s*(FT|M)?/i); if (mm) thrFt = parseFloat(mm[1]) / (/FT/i.test(mm[2] || '') ? 1 : 0.3048); }
    if (thrFt === null && ad) thrFt = ftOf(ad.cur.p.fieldElevation);
    if (thrFt === null) thrFt = 0;
    // fixes in order: [{name, pt, role, c (constraint), leg, course}]
    var fixes = [], ma = [], faf = null, mapt = null, va = null, prevEnd = null;
    legs.forEach(function (x) {
      var lp = x.leg.cur.p, k = x.leg.k, st = M.segPoint(ds, arr(lp.startPoint)[0]), en = M.segPoint(ds, arr(lp.endPoint)[0]);
      var stN = M.segPointLabel(ds, arr(lp.startPoint)[0]), enN = M.segPointLabel(ds, arr(lp.endPoint)[0]);
      if (k === 'FinalLeg' && s(lp.verticalAngle)) va = Math.abs(parseFloat(s(lp.verticalAngle)));
      if (k === 'MissedApproachLeg') { ma.push({ leg: x.leg, c: constraint(lp), course: s(lp.course), type: s(lp.legTypeARINC), to: enN }); if (!mapt && stN) mapt = stN; return; }
      if (st && (!prevEnd || AX.distNM(st, prevEnd) > 0.05) && !fixes.length) fixes.push({ name: stN, pt: st, role: k === 'InitialLeg' ? 'IAF' : k === 'IntermediateLeg' ? 'IF' : 'FAF', leg: x.leg });
      if (k === 'FinalLeg' && !faf) { faf = fixes.length ? fixes[fixes.length - 1] : null; if (faf) faf.role = 'FAF'; }
      if (en && k !== 'FinalLeg') {
        var role = k === 'InitialLeg' ? (fixes.length ? '' : 'IAF') : k === 'IntermediateLeg' ? '' : '';
        fixes.push({ name: enN, pt: en, role: role, c: constraint(lp), leg: x.leg, course: s(lp.course) });
        prevEnd = en;
      } else if (en && k === 'FinalLeg') { fixes.push({ name: enN, pt: en, role: 'MAPt', c: constraint(lp), leg: x.leg, course: s(lp.course) }); mapt = mapt || enN; }
      if (k === 'FinalLeg' && fixes.length) fixes[fixes.length - 1].finalCourse = s(lp.course);
    });
    // roles: first fix IAF when an initial leg exists, the fix before the FAF is the IF
    if (fixes.length && legs[0].leg.k === 'InitialLeg' && !fixes[0].role) fixes[0].role = 'IAF';
    var fi = faf ? fixes.indexOf(faf) : -1;
    if (fi < 0) { fi = fixes.length - 1; if (fixes[fi]) { fixes[fi].role = 'FAF'; faf = fixes[fi]; } }
    if (fi > 0 && !fixes[fi - 1].role) fixes[fi - 1].role = 'IF';
    if (!thr) { var lastPt = fixes.length ? fixes[fixes.length - 1].pt : null; if (!lastPt) return null; thr = lastPt; }
    // distances to the threshold, backwards along the fixes
    var d = 0;
    for (var i = fixes.length - 1; i >= 0; i--) {
      var next = i === fixes.length - 1 ? thr : fixes[i + 1].pt;
      d += AX.distNM(fixes[i].pt, next);
      fixes[i].dist = Math.round(d * 10) / 10;
    }
    var ang = gpAng || va || 3, tch = 50;
    // minima from the final leg
    var mins = [];
    legs.forEach(function (x) {
      if (x.leg.k !== 'FinalLeg') return;
      arr(x.leg.cur.p.condition).forEach(function (c) {
        if (!c || c.nil !== undefined) return;
        var cats = arr(c.aircraftCategory).map(function (a) { return a && s(a.aircraftLandingCategory); }).filter(Boolean).join('');
        arr(c.minimumSet).forEach(function (mm2) {
          if (!mm2 || mm2.nil !== undefined) return;
          var a = ftOf(mm2.altitude), code = s(mm2.altitudeCode) || 'DA/MDA';
          if (a === null) return;
          var same = mins.filter(function (x) { return x.alt === a && x.code === code; })[0]; // one line per value, categories merged
          if (same) same.cats = (same.cats + cats).split('').filter(function (ch, i, l) { return l.indexOf(ch) === i; }).sort().join('');
          else mins.push({ alt: a, code: code, cats: cats });
        });
      });
    });
    return { proc: proc, ad: ad, rd: rd, desig: desig, thr: thr, thrFt: thrFt, ang: ang, tch: tch, fixes: fixes, faf: faf, mapt: mapt || ('THR ' + desig), ma: ma, mins: mins,
      name: (s(proc.cur.p.designator) || s(proc.cur.p.name)), precision: !!gpAng };
  }

  // SVG of the profile (width 920)
  function svg(P) {
    var W = 920, H = 380, L = 70, R = 760, T = 30, B = 300, MAx = 880;
    var maxD = Math.max(5, Math.ceil((P.fixes.length ? P.fixes[0].dist : 5) + 0.5));
    var alts = [P.thrFt + 1500].concat(P.fixes.map(function (f) { return f.c ? (f.c.up || f.c.alt) : 0; }), P.ma.map(function (x) { return x.c ? x.c.alt : 0; }), P.mins.map(function (x) { return x.alt; }));
    var maxA = Math.ceil(Math.max.apply(null, alts) * 1.15 / 500) * 500;
    function X(dist) { return R - dist / maxD * (R - L); }
    function Y(a) { return B - (a / maxA) * (B - T); }
    var gp = function (dist) { return P.thrFt + P.tch + dist * FTNM * Math.tan(P.ang * Math.PI / 180); };
    var h = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" class="prof-svg" font-family="Segoe UI, Arial, sans-serif" font-size="11">';
    h += '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#fff"/>';
    // altitude grid
    var step = maxA > 8000 ? 2000 : maxA > 4000 ? 1000 : 500;
    for (var a = 0; a <= maxA; a += step) h += '<line x1="' + L + '" x2="' + MAx + '" y1="' + Y(a) + '" y2="' + Y(a) + '" stroke="#e3e8ef"/><text x="' + (L - 6) + '" y="' + (Y(a) + 4) + '" text-anchor="end" fill="#667">' + a.toLocaleString('en-US') + '</text>';
    h += '<text x="14" y="' + ((T + B) / 2) + '" transform="rotate(-90 14 ' + ((T + B) / 2) + ')" text-anchor="middle" fill="#667">ft AMSL</text>';
    // terrain under the track
    if (typeof TERRAIN !== 'undefined' && TERRAIN.load() && P.fixes.length) {
      var pts = [], first = P.fixes[0].pt, tot = P.fixes[0].dist || 1;
      for (var k = 0; k <= 60; k++) {
        var dd = tot * (1 - k / 60), brg = AX.bearing(P.thr, first), p = AX.dest(P.thr[0], P.thr[1], brg, dd), el = Math.max(0, TERRAIN.elev(p[0], p[1])) / 0.3048;
        pts.push(X(dd).toFixed(1) + ',' + Y(el).toFixed(1));
      }
      h += '<polygon points="' + X(tot) + ',' + B + ' ' + pts.join(' ') + ' ' + X(0) + ',' + B + '" fill="#e9dcc3" stroke="#c4a77d" stroke-width="1"/>';
    }
    h += '<line x1="' + L + '" x2="' + MAx + '" y1="' + B + '" y2="' + B + '" stroke="#555"/>';
    // distance scale
    for (var n = 0; n <= maxD; n++) h += '<line x1="' + X(n) + '" x2="' + X(n) + '" y1="' + B + '" y2="' + (B + 4) + '" stroke="#555"/>' + (n % (maxD > 15 ? 2 : 1) === 0 ? '<text x="' + X(n) + '" y="' + (B + 16) + '" text-anchor="middle" fill="#445">' + n + '</text>' : '');
    h += '<text x="' + ((L + R) / 2) + '" y="' + (B + 32) + '" text-anchor="middle" fill="#445">NM to THR ' + esc(P.desig) + '</text>';
    // minima
    P.mins.forEach(function (mn, i) {
      h += '<line x1="' + X(Math.min(maxD, (P.faf && P.faf.dist) || maxD)) + '" x2="' + R + '" y1="' + Y(mn.alt) + '" y2="' + Y(mn.alt) + '" stroke="#d32f2f" stroke-dasharray="6 4"/>' +
        '<text x="' + (X(Math.min(maxD, (P.faf && P.faf.dist) || maxD)) + 4) + '" y="' + (Y(mn.alt) - 4 - i * 12) + '" fill="#d32f2f" font-weight="600">' + esc(mn.code + ' ' + Math.round(mn.alt) + (mn.cats ? ' (CAT ' + mn.cats + ')' : '')) + '</text>';
    });
    // path: constraints before the FAF, glide path / vertical angle from the FAF
    var path = [], fafIdx = P.faf ? P.fixes.indexOf(P.faf) : -1;
    P.fixes.forEach(function (f, i) {
      var a2 = i >= fafIdx && fafIdx >= 0 ? Math.min(gp(f.dist), f.c ? f.c.alt : Infinity) : f.c ? f.c.alt : null;
      if (i === fafIdx && f.c) a2 = f.c.alt;
      if (a2 === null && i > 0) a2 = path.length ? path[path.length - 1][1] : gp(f.dist);
      if (a2 === null) a2 = gp(f.dist);
      f.palt = a2;
      path.push([f.dist, a2]);
    });
    path.push([0, P.thrFt + P.tch]);
    h += '<polyline fill="none" stroke="#0b2a4a" stroke-width="2.6" points="' + path.map(function (q) { return X(q[0]).toFixed(1) + ',' + Y(q[1]).toFixed(1); }).join(' ') + '"/>';
    // glide path label
    if (P.faf) {
      // labels along the final segment: glide slope above the path at 60 %, final course below it at 35 % from the threshold
      var fa = P.faf.palt !== undefined ? P.faf.palt : gp(P.faf.dist);
      function onPath(f) { return [X(P.faf.dist * f), Y(P.thrFt + P.tch + (fa - P.thrFt - P.tch) * f)]; }
      var g1 = onPath(0.62), g2 = onPath(0.35);
      h += '<text x="' + (g1[0] + 28) + '" y="' + (g1[1] - 20) + '" fill="#b0186e" font-weight="700" text-anchor="middle">' + (P.precision ? 'GS ' : 'VA ') + P.ang.toFixed(2) + '°  TCH ' + P.tch + ' ft</text>';
      if (P.faf.finalCourse) h += '<text x="' + g2[0] + '" y="' + (g2[1] + 20) + '" fill="#0b2a4a" font-weight="700" text-anchor="middle">' + esc(P.faf.finalCourse) + '°</text>';
    }
    // fixes
    P.fixes.forEach(function (f, i) {
      var x = X(f.dist), y = Y(f.palt);
      h += '<line x1="' + x + '" x2="' + x + '" y1="' + (y - 8) + '" y2="' + B + '" stroke="#0b2a4a" stroke-dasharray="2 3"/>';
      h += '<text x="' + x + '" y="' + (T - 10 + (i % 2) * 12) + '" text-anchor="middle" font-weight="700" fill="#0b2a4a">' + esc(f.name || '') + (f.role ? ' <tspan fill="#b0186e">' + f.role + '</tspan>' : '') + '</text>';
      h += '<text x="' + x + '" y="' + (B - 6) + '" text-anchor="middle" fill="#445" font-size="10">' + f.dist.toFixed(1) + '</text>';
      if (f.role === 'FAF') h += '<path d="M' + (x - 6) + ',' + (y - 16) + ' L' + (x + 6) + ',' + (y - 16) + ' L' + x + ',' + (y - 6) + ' Z" fill="#0b2a4a"/>';
      if (f.c) {
        var t = f.c.kind === 'between' ? [Math.round(f.c.up), Math.round(f.c.lo)] : [Math.round(f.c.alt)], ty = y - 22 - (f.role === 'FAF' ? 6 : 0);
        t.forEach(function (v, j) {
          var yy = ty - (t.length - 1 - j) * 14, w = String(v).length * 6.6;
          h += '<text x="' + (x + 4) + '" y="' + yy + '" font-weight="700" fill="#111">' + v + '</text>';
          var above = f.c.kind === 'above' || f.c.kind === 'at' || (f.c.kind === 'between' && j === 1), below = f.c.kind === 'below' || f.c.kind === 'at' || (f.c.kind === 'between' && j === 0);
          if (above) h += '<line x1="' + (x + 3) + '" x2="' + (x + 5 + w) + '" y1="' + (yy + 3) + '" y2="' + (yy + 3) + '" stroke="#111" stroke-width="1.4"/>';
          if (below) h += '<line x1="' + (x + 3) + '" x2="' + (x + 5 + w) + '" y1="' + (yy - 11) + '" y2="' + (yy - 11) + '" stroke="#111" stroke-width="1.4"/>';
        });
      }
      if (i < P.fixes.length - 1 && P.fixes[i + 1].course) h += '<text x="' + ((x + X(P.fixes[i + 1].dist)) / 2) + '" y="' + (Y(f.palt) + 16) + '" text-anchor="middle" fill="#0b2a4a" font-weight="600">' + esc(P.fixes[i + 1].course) + '°</text>';
      if (i < P.fixes.length - 1) h += '<text x="' + ((x + X(P.fixes[i + 1].dist)) / 2) + '" y="' + (B + 48) + '" text-anchor="middle" fill="#445" font-size="10">' + (f.dist - P.fixes[i + 1].dist).toFixed(1) + '</text>';
    });
    // threshold and runway
    h += '<rect x="' + (R - 2) + '" y="' + (Y(P.thrFt) - 3) + '" width="70" height="6" fill="#3b4148"/><text x="' + (R + 4) + '" y="' + (Y(P.thrFt) + 18) + '" fill="#0b2a4a" font-weight="700">THR ' + esc(P.desig) + '</text>' +
      '<text x="' + (R + 4) + '" y="' + (Y(P.thrFt) + 31) + '" fill="#445" font-size="10">ELEV ' + Math.round(P.thrFt) + ' ft</text>';
    // missed approach
    if (P.ma.length) {
      var mAlt = P.ma.map(function (x) { return x.c ? x.c.alt : 0; }).reduce(function (a2, b2) { return Math.max(a2, b2); }, 0) || P.thrFt + 1000;
      h += '<polyline fill="none" stroke="#0b2a4a" stroke-width="2" stroke-dasharray="7 5" points="' + R + ',' + Y(P.thrFt + P.tch) + ' ' + (MAx - 30) + ',' + Y(mAlt) + ' ' + (MAx - 6) + ',' + Y(mAlt) + '"/>' +
        '<path d="M' + (MAx - 6) + ',' + (Y(mAlt) - 5) + ' L' + MAx + ',' + Y(mAlt) + ' L' + (MAx - 6) + ',' + (Y(mAlt) + 5) + ' Z" fill="#0b2a4a"/>' +
        '<text x="' + MAx + '" y="' + (Y(mAlt) - 10) + '" text-anchor="end" fill="#0b2a4a" font-size="10">MISSED APCH ' + Math.round(mAlt) + '</text>';
    }
    h += '<text x="' + L + '" y="' + (H - 6) + '" fill="#889" font-size="9.5">Profile drawn from the AIXM data · AIXM Code Converter (Prasad Selvaraj)</text>';
    h += '</svg>';
    return h;
  }
  function rodTable(P) {
    var gs = [70, 90, 100, 120, 140, 160], fafD = P.faf ? P.faf.dist : null, mapD = 0;
    var rod = gs.map(function (g) { return Math.round(g * FTNM / 60 * Math.tan(P.ang * Math.PI / 180) / 10) * 10; });
    var tm = fafD !== null ? gs.map(function (g) { var sec = Math.round((fafD - mapD) / g * 3600); return Math.floor(sec / 60) + ':' + ('0' + (sec % 60)).slice(-2); }) : null;
    return '<table class="prof-rod"><tr><th>Ground speed (kt)</th>' + gs.map(function (g) { return '<td>' + g + '</td>'; }).join('') + '</tr>' +
      '<tr><th>' + (P.precision ? 'Glide slope ' : 'Vertical angle ') + P.ang.toFixed(2) + '° (ft/min)</th>' + rod.map(function (r) { return '<td>' + r + '</td>'; }).join('') + '</tr>' +
      (tm ? '<tr><th>FAF to MAPt ' + fafD.toFixed(1) + ' NM (min:s)</th>' + tm.map(function (t) { return '<td>' + t + '</td>'; }).join('') + '</tr>' : '') + '</table>';
  }
  // AIP blocks for an instrument approach (chart + profile table), [] when not drawable
  function blocks(ds, proc) {
    var P = null;
    try { P = data(ds, proc); } catch (e) { P = null; }
    if (!P || !P.fixes.length) return [];
    var text = 'Profile ' + P.name + ': ' + P.fixes.map(function (f) { return (f.role ? f.role + ' ' : '') + (f.name || '?') + ' ' + f.dist.toFixed(1) + ' NM' + (f.c ? ' ' + cText(f.c) + ' ft' : ''); }).join(' → ') +
      ' → THR ' + P.desig + ' (' + Math.round(P.thrFt) + ' ft); ' + (P.precision ? 'GS ' : 'VA ') + P.ang.toFixed(2) + '°, TCH ' + P.tch + ' ft';
    var C = AIP.C;
    return [
      { kind: 'chart', title: 'Approach profile', svg: '<div class="prof-wrap">' + svg(P) + rodTable(P) + '</div>', text: text },
      { kind: 'table', title: 'Profile', cols: ['Fix', 'Role', 'Distance to THR (NM)', 'Altitude constraint (ft)', 'Course'],
        rows: P.fixes.map(function (f) { return [C(f.name, f.leg, 'endPoint'), C(f.role), C(f.dist.toFixed(1)), C(cText(f.c), f.leg, 'lowerLimitAltitude'), C(f.course ? f.course + '°' : '')]; }).concat([[C('THR ' + P.desig), C('THR'), C('0.0'), C('elevation ' + Math.round(P.thrFt)), C('')]]) }
    ];
  }
  return { data: data, svg: svg, blocks: blocks };
})();
