/*!
 * AIXM Code Converter
 * Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com> - author of the AIXM Code Converter
 * SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE; keep this notice in all copies)
 * ==========================================================================
 * AIXM Code Converter - analysis: in-file changes (temporality), comparison of
 * two data sets (same State, any versions) and data quality checks.
 * ========================================================================== */
/* global AX, MODEL, AIP, IFP, LAZY */
var ANALYSIS = (function () {
  'use strict';
  var M = MODEL, s = M.s, arr = AX.arr;

  // MessageChannel instead of setTimeout: not slowed to once a second when the tab is in the background
  var chan = typeof MessageChannel === 'function' ? new MessageChannel() : null, waiting = [];
  if (chan) chan.port1.onmessage = function () { var w = waiting.shift(); if (w) w(); };
  function yieldUI() { return new Promise(function (r) { if (chan) { waiting.push(r); chan.port2.postMessage(0); } else setTimeout(r, 0); }); }
  function prettyPath(p) {
    return p.replace(/\[(\d+)\]/g, ' #$1').split('/').map(function (x) {
      return x.replace(/^_/, '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
    }).join(' › ');
  }
  function displayVal(ds, v) {
    if (v === undefined) return '';
    if (typeof v === 'string' && v.charAt(0) === '→') {
      var t = M.target(ds, v.slice(1));
      return t ? '→ ' + M.label(ds, t) : v;
    }
    if (typeof v === 'string' && /^-?\d+\.\d+,-?\d+\.\d+$/.test(v)) {
      var c = v.split(',').map(Number);
      return AX.fmtPos([c[1], c[0]], 2);
    }
    return v;
  }

  /* ---------------------------------------------------------- in-file */
  function inFileChanges(ds) {
    var out = [];
    // Snapshot files hold one BASELINE per feature; its start date tells when the feature was last amended.
    // The initial-load date (shared by a large share of the features) is not an amendment.
    var DAY = 86400000, days = {}, single = 0;
    ds.recs.forEach(function (r) { if (r.ts.length === 1 && r.ts[0].i === 'BASELINE') { var b = AX.tms(r.ts[0].b); if (b !== null) { single++; var d = Math.floor(b / DAY); days[d] = (days[d] || 0) + 1; } } });
    var loadDays = {};
    Object.keys(days).forEach(function (d) { if (days[d] > Math.max(30, single * 0.3)) loadDays[d] = true; });
    ds.recs.forEach(function (r) {
      var ts = r.ts;
      if (ts.length === 1 && ts[0].i === 'BASELINE' && !ts[0].le && !r.chg) {
        var b0 = AX.tms(ts[0].b);
        if (b0 !== null && !loadDays[Math.floor(b0 / DAY)]) {
          var isNew = ts[0].lb && AX.tms(ts[0].lb) === b0;
          out.push({ rec: r, kind: isNew ? 'New feature' : 'Amended (new baseline)', from: ts[0].b, to: null, fields: [], tsIdx: 0, noValues: !isNew });
        }
      }
      if (r.chg) {
        out.push({ rec: r, kind: r.chg === 'New' ? 'New feature' : r.chg === 'Withdrawn' ? 'Withdrawn' : 'Changed (AIXM 4.5 update)', from: ts[0].b, to: null,
          fields: r.chg === 'Changed' ? AX.diffFlat({}, AX.flatten(ts[0].p)) : [], tsIdx: 0 });
      }
      // withdrawn by its validity: the last time slice ends and nothing follows (no end of life given)
      if (r.cur && r.cur.gone && !ts.some(function (x) { return x.le; })) {
        var lastE = ts.filter(function (x) { return x.i !== 'TEMPDELTA' && x.e; }).sort(function (a, b) { return (AX.tms(b.e) || 0) - (AX.tms(a.e) || 0); })[0];
        if (lastE) out.push({ rec: r, kind: 'Feature withdrawn (validity ended)', from: lastE.e, to: null, fields: [], tsIdx: ts.indexOf(lastE) });
      }
      if (ts.length < 2 && ts[0] && ts[0].i !== 'TEMPDELTA' && ts[0].i !== 'PERMDELTA' && !ts[0].le) return;
      var perm = [], temp = [];
      ts.forEach(function (t, i) { (t.i === 'TEMPDELTA' ? temp : perm).push(i); });
      perm.sort(function (a, b) { var x = ts[a], y = ts[b]; return (AX.tms(x.b) || 0) - (AX.tms(y.b) || 0) || x.s - y.s || x.c - y.c; });
      var prevProps = null, prevIdx = -1;
      perm.forEach(function (i, n) {
        var t = ts[i], props = t.i === 'PERMDELTA' && prevProps ? Object.assign({}, prevProps, t.p) : t.p;
        if (n > 0 || t.i === 'PERMDELTA') {
          var prev = prevIdx >= 0 ? ts[prevIdx] : null;
          var kind = t.i === 'PERMDELTA' ? 'Permanent change (PERMDELTA)' : prev && prev.s === t.s && t.c > prev.c ? 'Correction' : 'Permanent change (new BASELINE)';
          var fields = t.i === 'PERMDELTA' && !prevProps ? AX.diffFlat({}, AX.flatten(t.p)) : AX.diffFlat(AX.flatten(prevProps || {}), AX.flatten(props));
          // a new BASELINE with exactly the same values (only dates and sequence number change) is a re-issue
          out.push({ rec: r, kind: kind, from: t.b, to: t.e, fields: fields, tsIdx: i, prevIdx: prevIdx, same: t.i === 'BASELINE' && !fields.length });
        }
        prevProps = props; prevIdx = i;
      });
      temp.forEach(function (i) {
        var t = ts[i];
        var base = AX.resolve({ ts: ts.filter(function (x) { return x.i !== 'TEMPDELTA'; }) }, AX.tms(t.b));
        var bf = AX.flatten(base.p || {}), df = AX.flatten(t.p), fields = [];
        for (var k in df) if (bf[k] !== df[k]) fields.push({ path: k, old: bf[k], neu: df[k] });
        out.push({ rec: r, kind: 'Temporary change (TEMPDELTA)', from: t.b, to: t.e, fields: fields, tsIdx: i });
      });
      var last = perm.length ? ts[perm[perm.length - 1]] : null;
      if (last && last.le) out.push({ rec: r, kind: 'Feature withdrawn (end of life)', from: last.le, to: null, fields: [], tsIdx: perm[perm.length - 1] });
    });
    out.forEach(function (e) { e.section = AIP.sectionOf(ds, e.rec); e.t = AX.tms(e.from); });
    out.sort(function (a, b) { return (b.t || 0) - (a.t || 0); });
    return out;
  }

  /* ------------------------------------------------------------ compare */
  function naturalKey(ds, r) {
    var p = r.cur.p, own = ds.owner.get(r), ad = own ? M.shortName(own) : '';
    function pt() { var c = M.pointOf(ds, r); return c ? c[1].toFixed(3) + ',' + c[0].toFixed(3) : ''; }
    switch (r.k) {
      case 'AirportHeliport': return 'AD|' + (s(p.locationIndicatorICAO) || s(p.designator) || s(p.name));
      case 'Runway': return 'RWY|' + ad + '|' + s(p.designator);
      case 'RunwayDirection': return 'RDN|' + ad + '|' + s(p.designator);
      case 'Navaid': case 'VOR': case 'DME': case 'NDB': case 'TACAN': case 'MarkerBeacon': case 'Localizer': case 'Glidepath':
        return r.k + '|' + s(p.type) + '|' + s(p.designator) + '|' + (r.k === 'Glidepath' || r.k === 'MarkerBeacon' ? pt() : ad || pt().slice(0, 9));
      case 'DesignatedPoint': return 'DP|' + s(p.designator) + '|' + (s(p.designator) ? '' : pt());
      case 'Airspace': return 'AS|' + s(p.type) + '|' + (s(p.designator) || s(p.name));
      case 'Route': return 'RTE|' + M.routeDesignator(p) + '|' + s(p.locationDesignator);
      case 'RouteSegment': {
        var rt = M.target(ds, p.routeFormed);
        return 'RSG|' + (rt ? M.routeDesignator(rt.cur.p) : '') + '|' + M.segPointLabel(ds, arr(p.start)[0]) + '|' + M.segPointLabel(ds, arr(p.end)[0]);
      }
      case 'VerticalStructure': return 'OBS|' + (s(p.name) || s(p.designator)) + '|' + pt();
      case 'Unit': return 'UNIT|' + s(p.name) + '|' + s(p.type);
      case 'OrganisationAuthority': return 'ORG|' + s(p.name);
      case 'RadioCommunicationChannel': return 'RCC|' + ad + '|' + M.fFreq(r) + '|' + s(p.mode);
      default:
        var k = s(p.designator) || s(p.name);
        return r.k + '|' + ad + '|' + (k || '') + '|' + (k ? '' : pt()) + (k ? '' : '|' + s(p.type));
    }
  }
  // not cached on the feature: for two large files the flattened copies doubled the memory in use
  function flatFor(ds, r) {
    var f = AX.flatten(r.cur.p, '', {}, { _ad: 1 });
    var out = {};
    for (var k in f) {
      if (/(^|\/)(annotation|availability)\/.*\/(specialDateAuthority)/.test(k)) continue;
      var v = f[k];
      if (typeof v === 'string' && v.charAt(0) === '→') { var t = M.target(ds, v.slice(1)); if (t) v = '→' + t.k + ':' + naturalKey(ds, t); }
      out[k] = v;
    }
    return out;
  }
  async function compare(dsA, dsB, onProgress) {
    var useUuid = dsA.family === '5' && dsB.family === '5';
    if (useUuid) {
      var hits = 0, sample = dsA.recs.slice(0, 2000);
      sample.forEach(function (r) { if (dsB.byId.has(r.id)) hits++; });
      useUuid = sample.length && hits / sample.length > 0.3;
    }
    // the page stays responsive: control goes back to the browser every ~40 ms
    var last = Date.now();
    async function breathe(f) { if (Date.now() - last > 40) { if (onProgress && f !== undefined) onProgress(f); await yieldUI(); last = Date.now(); } }
    async function keysOf(ds) {
      var m = new Map();
      for (var j = 0; j < ds.recs.length; j++) {
        var r = ds.recs[j];
        if (r.k === '#error') continue;
        var k = useUuid ? r.k + '#' + r.id : naturalKey(ds, r);
        var base = k, n = 2;
        while (m.has(k)) k = base + '~' + n++;
        m.set(k, r);
        if ((j & 1023) === 0) await breathe();
      }
      return m;
    }
    var A = await keysOf(dsA), B = await keysOf(dsB);
    var res = { useUuid: useUuid, items: [], stats: { added: 0, removed: 0, modified: 0, unchanged: 0 }, a: dsA, b: dsB };
    var keys = new Set(A.keys());
    B.forEach(function (v, k) { keys.add(k); });
    var i = 0, total = keys.size;
    for (var k of keys) {
      var ra = A.get(k), rb = B.get(k);
      if (ra && !rb) { res.items.push({ kind: 'removed', a: ra, sec: AIP.sectionOf(dsA, ra) }); res.stats.removed++; }
      else if (!ra && rb) { res.items.push({ kind: 'added', b: rb, sec: AIP.sectionOf(dsB, rb) }); res.stats.added++; }
      else {
        var fa = flatFor(dsA, ra), fb = flatFor(dsB, rb);
        var d = AX.diffFlat(fa, fb);
        if (d.length) { res.items.push({ kind: 'modified', a: ra, b: rb, fields: d, sec: AIP.sectionOf(dsB, rb) }); res.stats.modified++; }
        else res.stats.unchanged++;
      }
      if ((++i & 255) === 0) await breathe(i / total);
    }
    var order = { added: 0, modified: 1, removed: 2 };
    res.items.sort(function (x, y) { return (x.sec.no < y.sec.no ? -1 : x.sec.no > y.sec.no ? 1 : 0) || order[x.kind] - order[y.kind]; });
    return res;
  }

  /* ------------------------------------------------------------- quality */
  var FREQ_RANGES = { VOR: [108, 117.975, 'MHZ'], Localizer: [108.1, 111.975, 'MHZ'], Glidepath: [328.6, 335.4, 'MHZ'], NDB: [190, 1750, 'KHZ'] };
  function toMHz(q) { if (!q || q.v === undefined) return NaN; var v = parseFloat(q.v), u = String(q.u || '').toUpperCase(); return u === 'KHZ' ? v / 1000 : u === 'GHZ' ? v * 1000 : v; }
  // plausible ranges (beyond them a value is almost certainly a coding error)
  var ELEV_FT = [-1400, 15000], RWY_M = [50, 6000], NEAR_AD_NM = { RunwayDirection: 10, Runway: 10, RunwayCentrelinePoint: 10, TouchDownLiftOff: 10, Taxiway: 10, Apron: 10, AircraftStand: 10, Localizer: 15, Glidepath: 15, MarkerBeacon: 15 };
  function num(q) { q = Array.isArray(q) ? q[0] : q; var v = q && typeof q === 'object' ? q.v : q; v = parseFloat(v); return isFinite(v) ? v : NaN; }
  function unit(q) { q = Array.isArray(q) ? q[0] : q; return q && typeof q === 'object' ? String(q.u || '').toUpperCase() : ''; }
  // a vertical limit in feet with what it is measured from (FL: standard pressure), or null (GND, UNL, …)
  function limitFt(q, ref) {
    var v = num(q), u = unit(q);
    if (isNaN(v)) return null;
    if (u === 'FL') return { ft: v * 100, ref: 'STD' };
    return { ft: u === 'M' ? v / 0.3048 : v, ref: s(ref) || 'MSL' };
  }
  function pos(c) { return AX.fmtPos(c, 0); }

  /* ---------------------------------------------------- airspace geometry */
  // The shape an AIS system computed (arc ends, border junctions, aggregated airspace) against what the data codes:
  // - arcs: the arc of the coded centre, radius and angles must end on the coded points before and after it (WGS-84);
  // - links: a border followed (curveMember xlink:href) and points held by other features must be in the data, and the
  //   points where the boundary joins the border must lie on it;
  // - airspace built from other airspaces: every contributor found and combined;
  // - a boundary must not cross itself; airspace of the same type must not overlap at the same levels (sectors, FIR,
  //   TMA, CTA…: lower and upper airspace stacked is not an overlap).
  var ARC_TOL = 0.05, JOIN_TOL = 0.5, OVL_NM2 = 1; // NM, NM, NM²
  var OVL_TYPES = /^(FIR|UIR|OCA|UTA|NAS|CTA|TMA|CTR|SECTOR|SECTOR_C|OTA)(_P)?$/, OVL_HARD = /^(FIR|UIR|OCA|UTA|NAS|SECTOR|SECTOR_C)(_P)?$/;
  var OVL_MAX_PAIRS = 60000;
  function nm(v) { return v < 10 ? v.toFixed(2) : v.toFixed(1); }
  function uomOf(u) { return /nmi|^NM$/i.test(u || 'NM') ? 'NM' : M.UOM[u] || u; }
  async function airspaceChecks(ds, add) {
    var list = (ds.byType.Airspace || []).filter(function (r) { return !r.cur.gone; });
    if (!list.length) return;
    if (!M.geomEngine() && typeof LAZY !== 'undefined') { try { await LAZY.run('lazy-jsts'); M.setGeomEngine(window.jsts); } catch (e) { /* checks that need it are left out */ } }
    var J = M.geomEngine(), R = 'Airspace geometry', P = 'geometryComponent', shapes = [];
    for (var i = 0; i < list.length; i++) {
      var r = list[i], name = M.label(ds, r), steps = []; // steps: arc ends reported (a crossing there is the same fault)
      arr(r.cur.p.geometryComponent).forEach(function (gc) {
        var hp = gc && gc.theAirspaceVolume && gc.theAirspaceVolume.horizontalProjection, hg = hp && hp._geo;
        if (!hg || hg.t !== 'A') return;
        hg.c.forEach(function (ring, ri) {
          // links to borders and to points of other features
          ring.forEach(function (x, k) {
            if (typeof x[0] === 'number') return;
            if (x[0] === 'ref') {
              var bc = M.borderCurve(ds, x[1]);
              if (!bc) { add('error', R, 'The boundary follows a border that is not in the data', r, P, 'curveMember xlink:href="' + x[1] + '": no GeoBorder or curve with this identifier. The map joins the points before and after it with a straight line instead of the border.'); return; }
              [ring[k - 1] || ring[ring.length - 1], ring[k + 1] || ring[0]].forEach(function (q, side) {
                if (!q || typeof q[0] !== 'number') return;
                var d = Infinity;
                for (var j = 0; j + 1 < bc.length; j++) d = Math.min(d, segDist(q, bc[j], bc[j + 1]));
                if (d > JOIN_TOL) add('warning', R, 'The boundary joins the border it follows ' + nm(d) + ' NM away from it', r, P, 'Point ' + pos(q) + ' (where the boundary ' + (side ? 'leaves' : 'meets') + ' the border ' + x[1] + ') is ' + nm(d) + ' NM from the nearest point of the border: the boundary jumps there. The point is probably not on the border, or the wrong border is linked.');
              });
            } else if (!M.refPoint(ds, x[1])) add('error', R, 'A boundary point held by another feature is not in the data', r, P, (x[0] === 'pt' ? 'gml:pointProperty' : 'The centre of the ' + (x[0] === 'arc' ? 'arc' : 'circle')) + ' xlink:href="' + x[1] + '" names no fix, navaid or other feature with a position in this data: that part of the boundary is left out.');
          });
          // arcs: do they end on the coded points before and after them?
          if (ri) return;
          var d = hg.d || [];
          d.forEach(function (part, k) {
            if (part.k !== 'arc' || part.b1 === undefined) return;
            var c = part.c || (part.h ? M.refPoint(ds, part.h) : null);
            if (!c) return;
            var prev = null, next = null, j, q;
            for (j = 1; j < d.length && !prev; j++) { q = d[(k - j + d.length) % d.length]; if (q.p && q.p.length && typeof q.p[q.p.length - 1][0] === 'number') prev = q.p[q.p.length - 1]; else if (q.k === 'arc' || q.k === 'ref' || q.k === 'border') break; }
            for (j = 1; j < d.length && !next; j++) { q = d[(k + j) % d.length]; if (q.p && q.p.length && typeof q.p[0][0] === 'number') next = q.p[0]; else if (q.k === 'arc' || q.k === 'ref' || q.k === 'border') break; }
            if (!prev || !next) return;
            var rNM = AX.toNM(part.r, part.u), a = AX.geoDest(c[0], c[1], part.b1, rNM), b = AX.geoDest(c[0], c[1], part.b2, rNM);
            var g1 = AX.geoDist(prev, a), g2 = AX.geoDist(next, b), gap = Math.max(g1, g2);
            if (gap <= ARC_TOL) return;
            steps.push({ p: prev, d: gap }, { p: next, d: gap });
            add(gap >= 1 ? 'error' : 'warning', R, 'Arc of ' + part.r + ' ' + uomOf(part.u) + ' ends ' + nm(gap) + ' NM from the boundary point ' + (g1 >= g2 ? 'before' : 'after') + ' it', r, P,
              'Centre ' + pos(c) + ', radius ' + part.r + ' ' + uomOf(part.u) + '. The point before the arc is ' + nm(AX.geoDist(c, prev)) + ' NM from the centre and ' + nm(g1) + ' NM from the arc start; the point after it ' + nm(AX.geoDist(c, next)) + ' NM from the centre and ' + nm(g2) + ' NM from the arc end (WGS-84). ' +
              'The radius, the centre or the angles do not fit the points: the boundary has a step there' + (gap >= 1 ? ' that shows on the map' : '') + '. Within ' + ARC_TOL + ' NM is expected.');
          });
        });
      });
      // aggregated airspace
      var asm = M.assembly(ds, r);
      if (asm) asm.notes.forEach(function (n) { add('warning', R, 'Airspace built from other airspaces: ' + n, r, P, 'Built as: ' + asm.steps.join(', ') + '. Without it, the airspace is drawn without that part (or not at all).'); });
      // the shape as drawn: crossing itself? (and kept for the overlap check)
      if (J) {
        var g = M.geometry(ds, r), gf = new J.geom.GeometryFactory();
        (g && g.t === 'M' ? g.parts : g ? [g] : []).forEach(function (pg) {
          if (pg.t !== 'A') return;
          var one = null;
          try { one = M.toJsts(J, gf, pg, true); } catch (e) { one = null; }
          if (!one) return;
          if (!one.isValid()) {
            var ve = new J.operation.valid.IsValidOp(one).getValidationError(), at = ve && ve.getCoordinate();
            if (!at || !steps.some(function (q) { return AX.distNM(q.p, [at.x, at.y]) < Math.max(1, q.d + 0.5); })) add('warning', R, 'The boundary crosses itself' + (at ? ' at ' + pos([at.x, at.y]) : ''), r, P, (ve ? ve.getMessage() + '. ' : '') + 'Points in the wrong order, or an arc drawn the wrong way round: the area is unclear where the boundary crosses. The map fills it even-odd.');
            try { one = one.buffer(0); } catch (e) { one = null; }
          }
        });
        // the overlap check works on the 3D pieces (lower and upper parts of one airspace each with its own levels)
        var t = s(r.cur.p.type);
        if (OVL_TYPES.test(t)) {
          var pc = [];
          try { pc = M.pieces(ds, r, J); } catch (e) { pc = []; }
          pc.forEach(function (x) { if (x.vb) { var gx = x.g.isValid() ? x.g : x.g.buffer(0); shapes.push({ r: r, g: gx, vb: x.vb, t: t, env: gx.getEnvelopeInternal(), name: name }); } });
        }
      }
      if (i % 100 === 99) await yieldUI();
    }
    // same type, same levels, overlapping area (each pair of airspaces once, its largest overlap); shapes sorted west to
    // east, so only those whose extents meet are compared
    var seenPair = new Map(), pairs = 0;
    shapes.sort(function (p, q) { return p.env.getMinX() - q.env.getMinX(); });
    for (var a = 0; a < shapes.length && pairs < OVL_MAX_PAIRS; a++) {
      for (var b = a + 1; b < shapes.length && shapes[b].env.getMinX() <= shapes[a].env.getMaxX(); b++) {
        var x = shapes[a], y = shapes[b];
        if (x.r === y.r || x.t !== y.t || !(x.vb.lo < y.vb.up && y.vb.lo < x.vb.up) || !x.env.intersects(y.env)) continue;
        if (++pairs > OVL_MAX_PAIRS) break;
        var ov = null;
        try { ov = M.overlay(J, x.g, y.g, 'INTERS'); } catch (e) { continue; }
        if (ov.isEmpty()) continue;
        var c = ov.getCentroid(), area = ov.getArea() * 3600 * Math.cos(c.getY() * Math.PI / 180);
        if (area < OVL_NM2) continue;
        var key = x.r.i + '|' + y.r.i, prev = seenPair.get(key);
        if (!prev || prev.area < area) seenPair.set(key, { x: x, y: y, area: area, c: c, lo: Math.max(x.vb.lo, y.vb.lo), up: Math.min(x.vb.up, y.vb.up) });
      }
      if (a % 50 === 49) await yieldUI();
    }
    if (pairs > OVL_MAX_PAIRS) add('info', R, 'Overlaps of airspace of one type checked in part only (' + shapes.length.toLocaleString('en-US') + ' shapes)', list[0], P, 'More than ' + OVL_MAX_PAIRS.toLocaleString('en-US') + ' pairs of neighbouring airspaces: the check stopped there.');
    seenPair.forEach(function (o) {
      // FIR, UIR and ACC sectors partition the airspace: an overlap at the same levels is a fault. CTA, TMA and CTR may
      // overlap by design (delegated airspace, a CTA over a TMA part): a note to check.
      var hard = OVL_HARD.test(o.x.t);
      add(hard ? 'warning' : 'info', R, o.x.name + ' and ' + o.y.name + ' overlap by ' + Math.round(o.area).toLocaleString('en-US') + ' NM² at the same levels', o.x.r, P,
        'Both are ' + o.x.t + '. ' + o.x.name + ' ' + fmtBand(o.x.vb) + ', ' + o.y.name + ' ' + fmtBand(o.y.vb) + ': both cover ' + fmtBand({ lo: o.lo, up: o.up }) + ' over ' + Math.round(o.area).toLocaleString('en-US') + ' NM² around ' + pos([o.c.getX(), o.c.getY()]) + '. ' +
        (hard ? o.x.t + ' airspace shares borders, not area, at the same levels: a boundary point is probably wrong, or the vertical limits are.' : 'Airspace of one type usually shares borders, not area, at the same levels: check the boundaries and the vertical limits (an overlap made on purpose, e.g. delegated airspace, can stay).'));
    });
  }
  function fmtBand(b) { function f(v) { return v === Infinity ? 'UNL' : v === 0 ? 'GND' : v % 100 === 0 && v >= 1000 ? 'FL' + (v < 10000 ? '0' : '') + v / 100 : Math.round(v).toLocaleString('en-US') + ' ft'; } return b ? f(b.lo) + ' – ' + f(b.up) : 'levels unknown'; }
  // distance in NM from p to the segment a-b (local plane, scaled by cos(lat))
  function segDist(p, a, b) {
    var k = Math.cos(p[1] * Math.PI / 180), ax = (a[0] - p[0]) * k, ay = a[1] - p[1], dx = (b[0] - a[0]) * k, dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    var t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0, ex = ax + t * dx, ey = ay + t * dy;
    return Math.sqrt(ex * ex + ey * ey) * 60;
  }
  // Issues: {sev: error|warning|info, rule, msg, rec, p: property it is about (or none), detail: what was found and
  // what is expected}. The AIP view marks the values and sections they concern.
  async function quality(ds, onProgress) {
    var issues = [];
    function add(sev, rule, msg, r, prop, detail) { issues.push({ sev: sev, rule: rule, msg: msg, rec: r, p: prop || null, detail: detail || '' }); }
    var icao = new Map(), dpts = new Map();
    (ds.parseErrors || []).forEach(function (e) { add('error', 'Parsing', 'Could not parse the XML fragment at byte ' + e.o + ': ' + e.err, e, null, 'The XML of this feature is not well-formed, so it is left out. Open the file at that byte to see the broken element.'); });
    var unresolved = new Map();
    var D = M.dict();
    for (var i = 0; i < ds.recs.length; i++) {
      var r = ds.recs[i], p = r.cur.p;
      if (r.cur.gone) continue;
      M.eachRef(p, function (ref, prop) {
        if (!M.target(ds, ref)) { var k = r.k + '.' + prop; unresolved.set(k, (unresolved.get(k) || []).concat([r])); }
      }, '', 0);
      // coordinates (top: the feature property they are in)
      var zero = false;
      (function walk(v, depth, top) {
        if (!v || typeof v !== 'object' || depth > 8) return;
        if (Array.isArray(v)) { v.forEach(function (x) { walk(x, depth + 1, top); }); return; }
        if (v._geo) {
          var g = v._geo, pts = g.t === 'P' ? [g.c] : g.t === 'L' ? g.c : g.c[0];
          var bad = pts.filter(function (c) { return typeof c[0] === 'number' && (Math.abs(c[1]) > 90 || Math.abs(c[0]) > 180 || isNaN(c[0]) || isNaN(c[1])); });
          var nul = pts.filter(function (c) { return c[0] === 0 && c[1] === 0; });
          if (bad.length) add('error', 'Coordinates', 'Coordinate outside the valid range', r, top, 'Found ' + bad[0][1] + ', ' + bad[0][0] + ' (latitude, longitude). Latitude must be within ±90°, longitude within ±180°.');
          if (nul.length && !zero) { zero = true; add('error', 'Position', 'Position 0°N 0°E — a placeholder, not a real position', r, top, (g.t === 'P' ? 'The position is' : nul.length + ' of the ' + pts.length + ' points are') + ' exactly 0° latitude, 0° longitude (in the Gulf of Guinea). The real coordinates are missing in the data; the feature is drawn there on the map.'); }
          if (g.t === 'A' && g.c[0].length > 3) {
            var a = g.c[0][0], b = g.c[0][g.c[0].length - 1];
            if (typeof a[0] === 'number' && typeof b[0] === 'number' && (Math.abs(a[0] - b[0]) > 1e-7 || Math.abs(a[1] - b[1]) > 1e-7)) add('info', 'Geometry', 'Polygon ring is not closed (first and last point differ)', r, top, 'First point ' + pos(a) + ', last point ' + pos(b) + '. A GML polygon ring ends on its first point.');
          }
        }
        for (var k in v) if (k !== '_geo' && v[k] && typeof v[k] === 'object') walk(v[k], depth + 1, depth ? top : k);
      })(p, 0, null);
      // aerodrome parts far from their aerodrome
      var own = NEAR_AD_NM[r.k] && !zero ? ds.owner.get(r) : null;
      if (own) {
        var pt = M.pointOf(ds, r), arp = M.pointOf(ds, own);
        if (pt && arp && !(arp[0] === 0 && arp[1] === 0) && !(pt[0] === 0 && pt[1] === 0)) { // 0°N 0°E: reported where it is coded
          var dnm = AX.distNM(arp, pt);
          if (dnm > NEAR_AD_NM[r.k]) add('warning', 'Position', M.typeName(r) + ' ' + Math.round(dnm).toLocaleString('en-US') + ' NM from its aerodrome ' + M.shortName(own), r, null,
            'Position ' + pos(pt) + '; aerodrome reference point ' + pos(arp) + '. Parts of an aerodrome are expected within ' + NEAR_AD_NM[r.k] + ' NM of it: the position, or the aerodrome it belongs to, is probably wrong.');
        }
      }
      // code lists
      if (D && r.k.indexOf('45:') !== 0) {
        var fd = D.v5.features[r.k];
        if (fd) for (var pk in p) {
          var pd = fd.p[pk], v = p[pk];
          if (!pd || typeof v !== 'string' || !D.v5.codes[pd.t]) continue;
          var cl = D.v5.codes[pd.t].v;
          if (!Object.keys(cl).length) continue; // pattern / numeric types (designators, RNP values) have no enumeration
          if (!(v in cl) && v.indexOf('OTHER') !== 0) add('warning', 'Code list', 'Value "' + v + '" of ' + pk + ' is not in ' + pd.t, r, pk, 'Allowed: ' + Object.keys(cl).slice(0, 12).join(', ') + (Object.keys(cl).length > 12 ? ' … (' + Object.keys(cl).length + ' values)' : '') + ', or OTHER:… for a value not in the list.');
        }
      }
      // aerodrome mapping (AMXM): every feature names its aerodrome; runways, taxiways, aprons and stands by code
      if (p._amxm && !r.syn) {
        if (!s(p.idarpt)) add('error', 'AMXM', 'Feature without aerodrome (idarpt)', r, 'idarpt', 'idarpt (ICAO location indicator) links the feature to its aerodrome.');
        var NAME = { RunwayElement: 'idrwy', RunwayThreshold: 'idthr', TaxiwayElement: 'idlin', TaxiwayGuidanceLine: 'idlin', ApronElement: 'idapron', ParkingStandArea: 'idstd', ParkingStandLocation: 'idstd', TaxiwayHoldingPosition: 'idlin' }[p._amxm];
        if (NAME && !s(p[NAME])) add('warning', 'AMXM', p._amxm + ' without ' + NAME, r, NAME, NAME + ' ' + (p[NAME] && p[NAME].nil ? 'is marked ' + p[NAME].nil : 'is not given') + ': the feature cannot be named or grouped (runway, taxiway, apron or stand).');
        if (p._amxm === 'RunwayThreshold') { var rd = M.target(ds, p.onRunway); if (rd && !rd.cur.p.usedRunway) add('warning', 'AMXM', 'Threshold ' + s(p.idthr) + ' on no runway', r, 'idthr', 'No RunwayElement idrwy names threshold ' + s(p.idthr) + ' (e.g. 09.27 for thresholds 09 and 27): the runway cannot be drawn from its thresholds.'); }
      }
      // mandatory AIP information
      switch (r.k) {
        case 'AirportHeliport': {
          if (!p.ARP) add('warning', 'AD 2.2', 'Aerodrome without ARP coordinates', r, 'ARP', 'AD 2.2 needs the aerodrome reference point (ARP).');
          if (!s(p.locationIndicatorICAO) && !s(p.designator)) add('warning', 'AD 2.1', 'Aerodrome without location indicator', r, 'locationIndicatorICAO', 'Neither locationIndicatorICAO nor designator is given. AD 2.1 names the aerodrome by its ICAO location indicator.');
          if (!s(p.name)) add('info', 'AD 2.1', 'Aerodrome without name', r, 'name', 'No name is given. AD 2.1 shows the location indicator and the name.');
          if (!p.fieldElevation) add('warning', 'AD 2.2', 'Aerodrome without field elevation', r, 'fieldElevation', 'No fieldElevation is given. AD 2.2 item 3 needs the aerodrome elevation; NIL is printed instead.');
          else {
            var fe = num(p.fieldElevation), feFt = unit(p.fieldElevation) === 'M' ? fe / 0.3048 : fe;
            if (!isNaN(feFt) && (feFt < ELEV_FT[0] || feFt > ELEV_FT[1])) add('warning', 'AD 2.2', 'Implausible field elevation ' + M.fq(p.fieldElevation), r, 'fieldElevation', 'Found ' + M.fq(p.fieldElevation) + ' (' + Math.round(feFt).toLocaleString('en-US') + ' ft). Aerodromes lie between ' + ELEV_FT[0].toLocaleString('en-US') + ' and ' + ELEV_FT[1].toLocaleString('en-US') + ' ft: probably a wrong unit or value.');
          }
          var code = s(p.locationIndicatorICAO);
          if (code) icao.set(code, (icao.get(code) || []).concat([r]));
          break;
        }
        case 'Runway': {
          if (!p.nominalLength) add('warning', 'AD 2.12', 'Runway without length', r, 'nominalLength', 'No nominalLength is given. AD 2.12 lists the dimensions of every runway.');
          else if (s(p.type) !== 'FATO') { // a helicopter FATO may be a few tens of metres
            var ln = num(p.nominalLength), lu = unit(p.nominalLength), lm = lu === 'FT' ? ln * 0.3048 : lu === 'KM' ? ln * 1000 : ln;
            if (!isNaN(lm) && (lm < RWY_M[0] || lm > RWY_M[1])) add('warning', 'AD 2.12', 'Implausible runway length ' + M.fq(p.nominalLength), r, 'nominalLength', 'Found ' + M.fq(p.nominalLength) + ' (' + Math.round(lm).toLocaleString('en-US') + ' m). Runways are ' + RWY_M[0] + ' to ' + RWY_M[1].toLocaleString('en-US') + ' m long: probably a wrong unit or value.');
          }
          if (!ds.owner.get(r)) add('warning', 'AD 2.12', 'Runway not linked to an aerodrome', r, 'associatedAirportHeliport', 'associatedAirportHeliport is missing or names an aerodrome that is not in the data, so the runway appears under no aerodrome.');
          break;
        }
        case 'RunwayCentrelinePoint':
          if (/^(THR|DISTHR)$/.test(s(p.role)) && !zero && !M.findGeo(p, ['P'], 0)) add('warning', 'AD 2.12', (s(p.role) === 'DISTHR' ? 'Displaced threshold' : 'Threshold') + ' without coordinates', r, 'location', (p.location ? 'The location is given without coordinates (empty gml:pos)' + (arr(p.location)[0] && arr(p.location)[0].elevation ? ', only the elevation' : '') : 'No location is given') + '. AD 2.12 lists the threshold coordinates; without them the runway cannot be drawn on the map.');
          break;
        case 'RunwayDirection':
          if (!s(p.trueBearing)) add('info', 'AD 2.12', 'Runway direction without true bearing', r, 'trueBearing', 'No trueBearing is given. AD 2.12 lists the true bearing of each runway direction.');
          break;
        case 'Airspace':
          if (!M.geometry(ds, r) && !(arr(p.geometryComponent).some(function (g) { return g && g.theAirspaceVolume && g.theAirspaceVolume.contributorAirspace; }))) add('warning', 'ENR 2', 'Airspace without horizontal geometry', r, 'geometryComponent', 'No horizontalProjection (and no airspace it is built from). The airspace cannot be drawn or described laterally.');
          if (!AIP.vertical(ds, r)) add('info', 'ENR 2', 'Airspace without vertical limits', r, 'geometryComponent', 'No upperLimit / lowerLimit in any airspace volume. ENR 2 gives the vertical limits of each airspace.');
          arr(p.geometryComponent).forEach(function (gc) {
            var vol = gc && gc.theAirspaceVolume;
            if (!vol) return;
            var up = limitFt(vol.upperLimit, vol.upperLimitReference), lo = limitFt(vol.lowerLimit, vol.lowerLimitReference);
            if (up && lo && up.ref === lo.ref && lo.ft > up.ft) add('error', 'ENR 2', 'Lower limit above the upper limit', r, 'geometryComponent', 'Upper ' + M.fLimit(vol.upperLimit, vol.upperLimitReference) + ', lower ' + M.fLimit(vol.lowerLimit, vol.lowerLimitReference) + '. The lower limit must be below the upper limit: they are probably swapped.');
          });
          break;
        case 'RouteSegment': {
          var su = limitFt(p.upperLimit, p.upperLimitReference), sl = limitFt(p.lowerLimit, p.lowerLimitReference);
          if (su && sl && su.ref === sl.ref && sl.ft > su.ft) add('error', 'ENR 3', 'Lower limit above the upper limit', r, 'lowerLimit', 'Upper ' + M.fLimit(p.upperLimit, p.upperLimitReference) + ', lower ' + M.fLimit(p.lowerLimit, p.lowerLimitReference) + '. The lower limit must be below the upper limit: they are probably swapped.');
          if (!p.start || !p.end) add('error', 'ENR 3', 'Route segment without start or end point', r, p.start ? 'end' : 'start', 'A route segment runs from its start point to its end point; ' + (p.start ? 'end' : 'start') + ' is missing.');
          else if (!M.segPoint(ds, arr(p.start)[0]) || !M.segPoint(ds, arr(p.end)[0])) add('warning', 'ENR 3', 'Route segment point cannot be located', r, M.segPoint(ds, arr(p.start)[0]) ? 'end' : 'start', 'The point it names is not in the data, or has no position.');
          break;
        }
        case 'VOR': case 'Localizer': case 'Glidepath': case 'NDB': {
          var rg = FREQ_RANGES[r.k], f = toMHz(arr(p.frequency)[0]);
          if (rg && !isNaN(f)) { var lo = rg[2] === 'KHZ' ? rg[0] / 1000 : rg[0], hi = rg[2] === 'KHZ' ? rg[1] / 1000 : rg[1]; if (f < lo - 1e-9 || f > hi + 1e-9) add('warning', 'Frequency', r.k + ' frequency ' + M.fq(arr(p.frequency)[0]) + ' outside ' + rg[0] + '–' + rg[1] + ' ' + rg[2], r, 'frequency', 'Found ' + M.fq(arr(p.frequency)[0]) + '. ICAO Annex 10 assigns ' + r.k + ' frequencies between ' + rg[0] + ' and ' + rg[1] + ' ' + rg[2] + ': probably a wrong value or unit.'); }
          if (!p.location && !M.pointOf(ds, r)) add('warning', 'ENR 4.1', r.k + ' without position', r, 'location', 'No position of its own and none from a navaid it belongs to.');
          break;
        }
        case 'DesignatedPoint':
          if (!p.location) add('warning', 'ENR 4.4', 'Designated point without coordinates', r, 'location', 'No location is given. ENR 4.4 lists the coordinates of every significant point.');
          if (s(p.designator) && !zero) dpts.set(s(p.designator), (dpts.get(s(p.designator)) || []).concat([r]));
          if (s(p.type) === 'ICAO' && s(p.designator) && !/^[A-Z]{5}$/.test(s(p.designator))) add('info', 'ENR 4.4', 'ICAO name-code designator should be 5 letters: ' + s(p.designator), r, 'designator', 'Found "' + s(p.designator) + '". ICAO Annex 11 Appendix 2: a name-code designator has five letters.');
          break;
        // instrument flight procedures (IFP data sets)
        case 'StandardInstrumentDeparture': case 'StandardInstrumentArrival': case 'InstrumentApproachProcedure': {
          var legs = AIP.procLegs(ds, r), nm = r.k === 'InstrumentApproachProcedure' ? 'Approach' : r.k === 'StandardInstrumentDeparture' ? 'SID' : 'STAR';
          if (!legs.length) add('warning', 'IFP', nm + ' without legs', r, 'flightTransition', 'No segment leg belongs to the procedure (flightTransition / transitionLeg, or legs naming it). Its path cannot be drawn or checked.');
          if (!IFP.aerodrome(ds, r)) add('warning', 'IFP', nm + ' not linked to an aerodrome', r, 'airportHeliport', 'airportHeliport is missing or names an aerodrome that is not in the data. Read the procedure (IFP) data set with the AIP data set of its delivery.');
          if (r.k === 'InstrumentApproachProcedure') {
            if (!arr(p.landing).length) add('info', 'IFP', 'Approach without landing runway', r, 'landing', 'landing (LandingTakeoffAreaCollection) names the runway direction(s) served.');
            var hasMin = legs.some(function (x) { return arr(x.leg.cur.p.condition).some(function (c) { return c && arr(c.minimumSet).length; }); });
            if (legs.length && !hasMin) add('warning', 'IFP', 'Approach without minima', r, null, 'No leg gives an ApproachCondition with a minimumSet (OCA/H, DA/H or MDA/H, visibility). PANS-OPS and TERPS approaches publish minima.');
          }
          // coding of the procedure and its legs (ICAO, PANS-OPS, EUROCONTROL IFP data set guidelines: ifp.js)
          IFP.checks(ds, r, legs).forEach(function (c) { add(c.sev, 'IFP coding', c.msg, c.rec, c.prop, c.rule + (c.why ? ' — ' + c.why : '')); });
          break;
        }
        case 'DepartureLeg': case 'ArrivalLeg': case 'ArrivalFeederLeg': case 'InitialLeg': case 'IntermediateLeg': case 'FinalLeg': case 'MissedApproachLeg': {
          ['startPoint', 'endPoint'].forEach(function (k) {
            var pt = arr(p[k])[0];
            if (pt && pt.nil === undefined && !M.segPoint(ds, pt)) add('warning', 'IFP', 'Leg ' + (k === 'endPoint' ? 'end' : 'start') + ' point cannot be located', r, k, 'The fix, navaid or runway point it names is not in the data (read the IFP data set with its AIP data set) or has no position.');
          });
          break;
        }
        case 'HoldingPattern': {
          var hpt = arr(p.holdingPoint)[0];
          if (!hpt) add('warning', 'Holding', 'Holding without holding point', r, 'holdingPoint');
          else if (!M.segPoint(ds, hpt)) add('warning', 'Holding', 'Holding point cannot be located', r, 'holdingPoint', 'The fix or navaid named is not in the data or has no position.');
          if (!s(p.inboundCourse) && !(arr(p.inboundCourse)[0] && arr(p.inboundCourse)[0].course)) add('warning', 'Holding', 'Holding without inbound course', r, 'inboundCourse');
          if (!s(p.turnDirection)) add('info', 'Holding', 'Holding without turn direction', r, 'turnDirection');
          break;
        }
        case 'SafeAltitudeArea': {
          var secs = arr(p.sector).filter(function (x) { return x && x.nil === undefined; });
          if (!secs.length) add('warning', 'AD 2.22', 'Minimum sector altitude without sectors', r, 'sector', 'No SafeAltitudeAreaSector: the altitudes cannot be published.');
          secs.forEach(function (sc, i) { var cs = arr(sc.sectorDefinition)[0]; if (!cs || !M.fLimit(cs.lowerLimit, cs.lowerLimitReference)) add('warning', 'AD 2.22', 'MSA sector ' + (i + 1) + ' without altitude', r, 'sector', 'The sector definition (CircleSector) gives no lowerLimit (the minimum altitude).'); });
          if (!Object.keys(p).some(function (k) { return /^centrePoint_/.test(k); })) add('warning', 'AD 2.22', 'Minimum sector altitude without centre', r, 'centrePoint_navaidSystem');
          break;
        }
        case 'VerticalStructure':
          if (!M.pointOf(ds, r)) add('warning', 'ENR 5.4', 'Obstacle without position', r, 'part', 'No part of the obstacle has a position. ENR 5.4 and AD 2.10 list the position of every obstacle.');
          break;
      }
      ['trueBearing', 'magneticBearing'].forEach(function (b) { var bv = parseFloat(s(p[b])); if (s(p[b]) && (isNaN(bv) || bv < 0 || bv > 360)) add('error', 'Bearing', b + ' outside 0–360: ' + s(p[b]), r, b, 'Found ' + s(p[b]) + '. A bearing is between 0 and 360 degrees.'); });
      // temporality
      var bl = r.ts.filter(function (t) { return t.i === 'BASELINE'; });
      for (var a1 = 0; a1 < bl.length; a1++) for (var a2 = a1 + 1; a2 < bl.length; a2++) {
        var x = bl[a1], y = bl[a2];
        if (x.s === y.s && x.c === y.c) add('error', 'Temporality', 'Two BASELINE time slices with the same sequence/correction number ' + x.s + '/' + x.c, r, null, 'Each time slice has its own sequenceNumber (or a higher correctionNumber when corrected). Which one is valid cannot be decided.');
        var xb = AX.tms(x.b), xe = AX.tms(x.e), yb = AX.tms(y.b), ye = AX.tms(y.e);
        if (x.s !== y.s && xb !== null && yb !== null && (xe === null || xe > yb) && (ye === null || ye > xb) && xb !== yb) add('warning', 'Temporality', 'Overlapping BASELINE validity periods (sequence ' + x.s + ' and ' + y.s + ')', r, null, 'Sequence ' + x.s + ' valid ' + (x.b || '?') + ' – ' + (x.e || 'open') + '; sequence ' + y.s + ' valid ' + (y.b || '?') + ' – ' + (y.e || 'open') + '. Two baselines of a feature should not be valid at the same time (the earlier one ends when the next begins).');
      }
      if (i % 5000 === 0) { if (onProgress) onProgress(i / ds.recs.length); await yieldUI(); }
    }
    // the same location indicator for two aerodromes; the same designator for points far apart
    icao.forEach(function (list, code) {
      if (list.length < 2) return;
      list.forEach(function (r) { add('error', 'Duplicate', 'Location indicator ' + code + ' used by ' + list.length + ' aerodromes', r, 'locationIndicatorICAO', 'Also used by: ' + list.filter(function (x) { return x !== r; }).map(function (x) { return M.label(ds, x) + ' (line ' + x.line + ')'; }).join('; ') + '. A location indicator identifies one aerodrome.'); });
    });
    dpts.forEach(function (list, code) {
      if (list.length < 2) return;
      var pts = list.map(function (x) { return M.pointOf(ds, x); });
      var far = 0;
      for (var a1 = 0; a1 < pts.length; a1++) for (var a2 = a1 + 1; a2 < pts.length; a2++) if (pts[a1] && pts[a2]) far = Math.max(far, AX.distNM(pts[a1], pts[a2]));
      if (far < 1) return; // the same point coded twice, at the same place: not misleading
      list.forEach(function (r, i) { add('warning', 'Duplicate', 'Designator ' + code + ' used by ' + list.length + ' designated points up to ' + Math.round(far).toLocaleString('en-US') + ' NM apart', r, 'designator', 'This one at ' + (pts[i] ? pos(pts[i]) : 'no position') + '; others: ' + list.filter(function (x) { return x !== r; }).map(function (x) { var c = M.pointOf(ds, x); return (c ? pos(c) : 'no position') + ' (line ' + x.line + ')'; }).join('; ') + '. A route or procedure naming ' + code + ' is ambiguous.'); });
    });
    unresolved.forEach(function (list, k) {
      // references inside vendor extensions (e.g. Digital NOTAM events of an AIM system): a note, not a data error
      if (/\.extension$/.test(k)) {
        add('info', 'References', list.length + ' reference(s) in ' + k + ' (vendor extension) point to features that are not in this file', list[0], null, 'Extensions carry data of the producing system, for example the Digital NOTAM event that created the feature. They are not part of the AIXM data set, so a missing target is not an error.');
        return;
      }
      add('warning', 'References', list.length + ' reference(s) of ' + k + ' point to features that are not in this file', list[0], null, 'For example: ' + list.slice(0, 5).map(function (x) { return M.label(ds, x) + ' (line ' + x.line + ')'; }).join('; ') + (list.length > 5 ? ' … and ' + (list.length - 5) + ' more' : '') + '. The feature referred to is missing: load the file that contains it with this one, or the reference (xlink:href) is wrong.');
    });
    await airspaceChecks(ds, add);
    var rank = { error: 0, warning: 1, info: 2 };
    issues.sort(function (a, b) { return rank[a.sev] - rank[b.sev]; });
    // an instrument flight procedure data set holds the procedure features and what they reference (ICAO data set
    // allocation, EUROCONTROL): other feature types belong to the AIP, obstacle or aerodrome mapping data sets
    if (IFP.isIfpSet(ds) && !(ds.byType.RouteSegment || []).length && !(ds.byType.Route || []).length) {
      IFP.allocation(ds).forEach(function (a) { add('info', 'IFP data set', a.n + ' ' + a.k + ' in an IFP data set', (ds.byType[a.k] || [])[0], null, 'Not part of the ICAO IFP data set (EUROCONTROL feature allocation): it belongs to another data set (AIP, obstacle, aerodrome mapping) or a custom data set.'); });
    }
    return issues;
  }

  /* --------------------------------------------------------- completeness */
  // Per feature type: how many features give each property, mark it unknown (nilReason) or not applicable (xsi:nil),
  // or leave it out. Properties: AIXM 5.x from the schema dictionary, AMXM from the AMXM 2.0.2 schema, AIXM 4.5 the
  // fields delivered. Features built by the tool (AMXM runways, taxiways… named by code) are not counted.
  async function completeness(ds, onProgress) {
    var D = M.dict(), A = M.amxmDict(), types = new Map();
    function given(v) {
      v = Array.isArray(v) ? v[0] : v;
      if (v === undefined || v === null || v === '') return 'absent';
      if (typeof v === 'object' && v.nil !== undefined && Object.keys(v).length === 1) return 'unknown';
      return 'given';
    }
    for (var i = 0; i < ds.recs.length; i++) {
      var r = ds.recs[i];
      if (r.syn || r.cur.gone || r.k === '#error') continue;
      var p = r.cur.p, am = p._amxm, key = am && A && A.features[am] ? 'AMXM ' + am : r.k, t = types.get(key);
      if (!t) {
        var props = null;
        if (am && A && A.features[am]) props = A.features[am].attrs.map(function (a) { return a.n; });
        else if (r.k.indexOf('45:') !== 0 && D && D.v5.features[r.k]) props = Object.keys(D.v5.features[r.k].p);
        t = { type: key, n: 0, props: props, stat: new Map(), amxm: !!am };
        types.set(key, t);
      }
      t.n++;
      var na = p._na ? String(p._na).split(',') : [];
      var list = t.props || Object.keys(r.raw || p).filter(function (k) { return k.charAt(0) !== '_' && k.charAt(0) !== '@'; });
      for (var j = 0; j < list.length; j++) {
        var k = list[j], st = t.stat.get(k);
        if (!st) t.stat.set(k, st = { given: 0, unknown: 0, na: 0 });
        var src = r.raw && !t.props ? r.raw : p;
        var v = am && /^geo(poly|line|pnt)$/.test(k) ? (p.extent || p.location || p.area || p.part || p.ARP) : src[k];
        var g = given(v);
        if (g === 'given') st.given++; else if (g === 'unknown') st.unknown++; else if (na.indexOf(k) >= 0) st.na++;
      }
      if (i % 5000 === 0) { if (onProgress) onProgress(i / ds.recs.length); await yieldUI(); }
    }
    var out = [];
    types.forEach(function (t) {
      var rows = [];
      (t.props || Array.from(t.stat.keys())).forEach(function (k) {
        var st = t.stat.get(k) || { given: 0, unknown: 0, na: 0 };
        rows.push({ prop: k, given: st.given, unknown: st.unknown, na: st.na, absent: t.n - st.given - st.unknown - st.na });
      });
      var never = rows.filter(function (x) { return !x.given; }).length;
      out.push({ type: t.type, n: t.n, amxm: t.amxm, rows: rows, never: never, full: rows.filter(function (x) { return x.given === t.n; }).length });
    });
    out.sort(function (a, b) { return b.n - a.n; });
    return out;
  }

  /* ------------------------------------------------ changes in one AIRAC cycle
   * Collects everything that changes in the given cycle for data set `ds`:
   *  - time slices of the file that become effective inside the cycle
   *  - differences against the previous cycle's file (ds.prevCmp, from compare())
   * Result: {cycle, byRec: Map(rec -> {props: Map(prop -> [{path, old, neu, src}]), added, kind}), count, list}
   */
  function topProp(path) { return String(path).split('/')[0].replace(/\[\d+\]$/, ''); }
  function cycleChanges(ds, cycle) {
    if (!cycle) cycle = ds.airac;
    var res = { cycle: cycle, byRec: new Map(), count: 0, list: [], sources: [] };
    if (!cycle) return res;
    function entry(r) { var e = res.byRec.get(r); if (!e) { res.byRec.set(r, e = { props: new Map(), added: false, kinds: new Set() }); } return e; }
    function addField(r, f, src, kind) {
      var e = entry(r), tp = topProp(f.path);
      var l = e.props.get(tp); if (!l) e.props.set(tp, l = []);
      l.push({ path: f.path, old: f.old, neu: f.neu, src: src });
      e.kinds.add(kind);
    }
    var ev = ds._events || (ds._events = inFileChanges(ds));
    // a State whose cycles start at local midnight east of Greenwich (e.g. 16:00Z): the window moves with it
    var off = ds.airac && ds.airac.local && ds.effective !== null ? ds.airac.date - ds.effective : 0;
    var inCycle = ev.filter(function (e) { return e.t !== null && e.t >= cycle.date - off && e.t < cycle.next - off; });
    if (inCycle.length) res.sources.push('time slices in the file starting in AIRAC ' + cycle.id);
    var reissued = new Set();
    inCycle.forEach(function (e) {
      if (e.same) { reissued.add(e.rec); return; }
      if (!e.fields.length) { var en = entry(e.rec); en.kinds.add(e.kind); if (/New|withdrawn|Withdrawn/.test(e.kind)) en.added = /New/.test(e.kind); if (e.noValues) en.amended = true; }
      e.fields.forEach(function (f) { addField(e.rec, f, 'file', e.kind); });
    });
    var cmp = ds.prevCmp;
    if (cmp && cmp.b === ds) {
      res.sources.push('comparison with ' + cmp.a.name + (cmp.a.airac ? ' (AIRAC ' + cmp.a.airac.id + ')' : ''));
      cmp.items.forEach(function (it) {
        if (it.kind === 'added') { var e2 = entry(it.b); e2.added = true; e2.kinds.add('New (not in previous cycle)'); }
        else if (it.kind === 'modified') it.fields.forEach(function (f) { addField(it.b, f, 'prev', 'Changed since previous cycle'); });
      });
      res.removed = cmp.items.filter(function (it) { return it.kind === 'removed'; });
      // a new baseline whose values are identical to the previous cycle is not a change for the reader
      var changed = new Set(cmp.items.map(function (it) { return it.b; }));
      res.byRec.forEach(function (e, r) { if (e.amended && !e.added && !e.props.size && !changed.has(r)) res.byRec.delete(r); });
    }
    res.byRec.forEach(function (e, r) { res.count++; res.list.push({ rec: r, e: e, sec: AIP.sectionOf(ds, r) }); });
    res.reissued = 0; reissued.forEach(function (r) { if (!res.byRec.has(r)) res.reissued++; });
    res.list.sort(function (a, b) { return a.sec.no < b.sec.no ? -1 : a.sec.no > b.sec.no ? 1 : 0; });
    // per-section counters (for the AIP tree badges)
    res.bySection = {};
    res.list.forEach(function (x) {
      if (!x.sec.id) return;
      res.bySection[x.sec.id] = (res.bySection[x.sec.id] || 0) + 1;
      if (x.sec.ad) res.bySection['AD:' + x.sec.ad.i] = (res.bySection['AD:' + x.sec.ad.i] || 0) + 1;
      var grp = x.sec.no.slice(0, 3);
      res.bySection[grp] = (res.bySection[grp] || 0) + 1;
    });
    return res;
  }
  // cycles in which the file contains changes (for the cycle selector)
  function changeCycles(ds) {
    var ev = ds._events || (ds._events = inFileChanges(ds)), m = new Map();
    ev.forEach(function (e) { if (e.t === null || e.same) return; var a = AX.airac(e.t); if (!a) return; var c = m.get(a.id) || { cycle: a, n: 0 }; c.n++; m.set(a.id, c); });
    if (ds.airac && !m.has(ds.airac.id)) m.set(ds.airac.id, { cycle: ds.airac, n: 0 });
    return Array.from(m.values()).sort(function (a, b) { return b.cycle.date - a.cycle.date; });
  }

  return { cycleChanges: cycleChanges, changeCycles: changeCycles, topProp: topProp, inFileChanges: inFileChanges, compare: compare, quality: quality, completeness: completeness, prettyPath: prettyPath, displayVal: displayVal, naturalKey: naturalKey };
})();
