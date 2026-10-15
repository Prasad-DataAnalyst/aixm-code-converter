/*!
 * AIXM Code Converter
 * Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com> - author of the AIXM Code Converter
 * SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE; keep this notice in all copies)
 * ==========================================================================
 * AIXM Code Converter - Flight & obstacle analysis (FLTVIEW), a section of the Digital data tab
 * NOT FOR NAVIGATION OR AIRCRAFT PERFORMANCE - indicative study figures.
 * For airline performance and flight operations engineers, pilots, aerodrome and AIS / eTOD staff, on all the data
 * loaded: AIXM obstacle data sets, Excel / CSV obstacle tables, the FAA Digital Obstacle File, the obstacles of
 * NOTAMs, the AIP data set (runways, declared distances, ILS, procedures, airspace), terrain files or online terrain.
 *   Take-off        Annex 4 Type A area and 1.2 % surface (shadow rule), one-engine-inoperative net flight path
 *                   (gradient each obstacle needs, clearance of the gradient available), PANS-OPS 2.5 % surface and
 *                   procedure design gradient, straight out or along a SID
 *   Approach        Annex 14 approach surface, glide path clearance, visual segment surface, threshold displacement
 *   Runway          every runway direction: departure and arrival results, Annex 14 surfaces, TORA / TODA / LDA impact,
 *                   NOTAM closures and obstacles
 *   eTOD areas      ICAO Areas 1, 2a, 2b, 2c, 2d, 3 and 4 (Annex 15 / PANS-AIM) with their collection surfaces: which
 *                   obstacles must be in the data set and the accuracy their area requires
 *   Route           a flight plan route: obstacles and terrain in the corridor, minimum safe altitude per leg, the
 *                   prohibited / restricted / danger / reserved areas crossed (AIXM, NOTAM, AIP text), active or not
 *   NOTAM           NOTAM text (pasted, .txt, .pdf briefing) and AIP area lists (ENR 5.1) read into obstacles, areas,
 *                   runway items; added to the data loaded when wished
 * One result card, one picture (Map, Profile, 3D, Hologram; each also in its own window), the details when asked for,
 * and one Report menu (PDF, print, Excel, CSV, KML, GeoJSON, DXF 3D CAD, picture).
 * Loaded only when the section is opened (src/lazy.js).
 * ========================================================================== */
/* global AX, MODEL, OLS, AIP, STUDY, OBSTVIEW, DEM, TERRAIN, MAPVIEW, EXPORTS, FLTCALC, FLTSCENE, NOTAMTXT, LAZY, FOURD, AMDBDOC, IFP */
var FLTVIEW = (function () {
  'use strict';
  var M = MODEL, s = M.s, arr = AX.arr, C = FLTCALC, FT = 0.3048, NMM = 1852;
  var NOTE = 'Indicative study figures — not for navigation and not a substitute for the aircraft flight manual, the operator\'s performance data or the State\'s published procedures and obstacle assessment.';
  function esc(t) { return String(t === undefined || t === null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(v, d) { return v === null || v === undefined || isNaN(v) ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: d === undefined ? 0 : d, minimumFractionDigits: 0 }); }

  /* ------------------------------------------------------------ state */
  var LS = 'aixm-flt';
  var DEF = { net: 1.6, gross: 2.4, engines: 2, lat: 600, len: 10000, path: 'straight', terrain: true, gpa: 0, tch: 15, clr: 1000, half: 5, unit: 'ft', base: '' };
  function load() { try { return Object.assign({}, DEF, JSON.parse(localStorage.getItem(LS) || '{}') || {}); } catch (e) { return Object.assign({}, DEF); } }
  function save() { try { localStorage.setItem(LS, JSON.stringify(V.set)); } catch (e) { /* storage unavailable */ } }
  var V = { mode: 'to', ad: '', end: '', view: 'map', set: load(), notams: [], textAreas: [], route: { text: '', fl: '', time: '' }, all: false, settings: false, handle: null, last: null, notamText: '' };
  var MODES = [['to', 'Take-off'], ['app', 'Approach'], ['rwy', 'Runway impact'], ['etod', 'eTOD areas'], ['route', 'Route & airspace'], ['notam', 'NOTAM & areas']];
  var VIEWS = [['map', 'Map'], ['profile', 'Profile'], ['3d', '3D'], ['holo', 'Hologram']];

  /* ------------------------------------------------------------ the data loaded */
  function adList(ctx) {
    var out = [];
    ctx.datasets.forEach(function (ds, di) {
      if (ds.family === 'tab' || !ds.byType) return;
      (ds.byType.AirportHeliport || []).forEach(function (ad) {
        var S = null; try { S = OLS.surfaces(ds, ad); } catch (e) { S = null; }
        if (!S || !S.runways.length) return;
        out.push({ key: di + ':' + ad.id, ds: ds, ad: ad, S: S, code: s(ad.cur.p.locationIndicatorICAO) || s(ad.cur.p.designator) || M.shortName(ad), name: s(ad.cur.p.name), arp: M.pointOf(ds, ad) });
      });
    });
    return out.sort(function (a, b) { return a.code < b.code ? -1 : 1; });
  }
  function endsOf(A) {
    var out = [];
    A.S.runways.forEach(function (r) {
      r.ends.forEach(function (x) {
        if (!x.e.at) return;
        var other = r.ends.filter(function (y) { return y !== x; })[0] || null; // the opposite end: {x: {e, type, el}}
        out.push({ key: r.rm.name + ':' + x.e.desig, r: r, x: x, other: other ? { x: other } : null, desig: x.e.desig, label: 'RWY ' + x.e.desig + ' (' + r.rm.name + ')' });
      });
    });
    return out;
  }
  function declared(A, E) { var d = {}; try { var dd = E.x.e.dir ? AIP.declared(A.ds, E.x.e.dir) : {}; Object.keys(dd).forEach(function (k) { var m = /(-?[\d.]+)\s*(FT|M)?/i.exec(dd[k].t || ''); if (m) d[k] = parseFloat(m[1]) * (/FT/i.test(m[2] || '') ? FT : 1); }); } catch (e) { /* not given */ } return d; }
  // every obstacle of the data loaded (and of the NOTAMs read here) as {id, label, type, kind, c, elev, hgt, …}
  var obsCache = { sig: '', list: [] };
  function obstacles(ctx) {
    var sig = ctx.datasets.map(function (d) { return d.id + ':' + d.viewDate; }).join(',') + '|' + V.notams.length + (V.notamsAdded ? 'a' : '');
    if (obsCache.sig === sig) return obsCache.list;
    var list = [];
    try {
      OBSTVIEW.model(ctx.datasets).sets.forEach(function (st) {
        st.rows.forEach(function (x) {
          if (!x.c || x.elev === null) return;
          var nm = x.id || x.name || 'obstacle', notam = /^NOTAM /.test(x.name || '');
          list.push({ id: (st.ds.id + ':' + (x.r.id || nm)), name: nm, label: nm + (x.name && x.name !== nm ? ' — ' + x.name : ''), type: x.type, kind: FLTSCENE.kindOf(x.type, x.name), c: x.c, elev: x.elev, hgt: x.hgt,
            src: st.ds.name, ds: st.ds, r: x.r, notam: notam, hAcc: x.hAcc, vAcc: x.vAcc, lit: x.lighted });
        });
      });
    } catch (e) { /* no obstacle data */ }
    if (!V.notamsAdded) V.notams.forEach(function (n) {
      n.obstacles.forEach(function (o, k) {
        if (o.elev === null && o.groundElev === undefined) return;
        var top = o.elev !== null ? o.elev : o.groundElev + (o.hgt || 0);
        list.push({ id: 'notam:' + n.id + ':' + k, name: 'NOTAM ' + n.id, label: 'NOTAM ' + n.id + (o.type ? ' — ' + o.type.replace(/_/g, ' ').toLowerCase() : ''), type: o.type || 'OTHER', kind: FLTSCENE.kindOf(o.type, n.text),
          c: o.c, elev: top, hgt: o.hgt, src: 'NOTAM', notam: true, n: n, approx: o.approx || o.elev === null });
      });
    });
    obsCache = { sig: sig, list: list };
    return list;
  }
  // NOTAM obstacles given with a height only: their elevation from the terrain (file, online, built-in)
  async function notamGround() {
    var todo = [];
    V.notams.forEach(function (n) { n.obstacles.forEach(function (o) { if (o.elev === null && o.groundElev === undefined && o.hgt !== null) todo.push(o); }); });
    for (var i = 0; i < todo.length; i++) { var g = null; try { g = await STUDY.ground(todo[i].c); } catch (e) { g = null; } todo[i].groundElev = g ? g.h : 0; }
    if (todo.length) obsCache.sig = '';
  }
  // terrain over an area as a grid (file > online tiles > built-in model)
  var gridCache = new Map();
  async function terrainGrid(bb, n) {
    var key = bb.map(function (v) { return v.toFixed(3); }).join(',') + ':' + n;
    if (gridCache.has(key)) return gridCache.get(key);
    var W = n, H = n, z = null, src = '';
    try {
      var cx = (bb[0] + bb[2]) / 2, cy = (bb[1] + bb[3]) / 2;
      if (typeof DEM !== 'undefined' && DEM.has(cx, cy)) { var g = await DEM.grid(bb, W, H); if (g && Array.prototype.some.call(g, function (v) { return v === v; })) { z = Array.prototype.slice.call(g); src = 'terrain file'; } }
      if (!z && typeof TERRAIN !== 'undefined') {
        var span = Math.max(bb[2] - bb[0], bb[3] - bb[1]), area = span < 1.5 ? await TERRAIN.area(bb, 16).catch(function () { return null; }) : null;
        z = [];
        for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
          var lon = bb[0] + (bb[2] - bb[0]) * x / (W - 1), lat = bb[3] - (bb[3] - bb[1]) * y / (H - 1);
          z.push(area ? area.sample(lon, lat) : TERRAIN.load() ? TERRAIN.elev(lon, lat) : NaN);
        }
        src = area ? area.source + ' (online terrain)' : 'built-in global model (indicative only)';
        if (!z.some(function (v) { return v === v; })) z = null;
      }
    } catch (e) { z = null; }
    // the sea surface, not the sea floor, for the global models (online tiles and the built-in model carry the bathymetry)
    var file = src === 'terrain file', out = z ? { bbox: bb, w: W, h: H, z: z.map(function (v) { return v === v && v !== null ? Math.max(file ? -430 : 0, v) : null; }), src: src, fine: !/built-in/.test(src) } : null;
    gridCache.set(key, out);
    if (gridCache.size > 12) gridCache.delete(gridCache.keys().next().value);
    return out;
  }
  function bboxOf(pts, padM) {
    var b = [180, 90, -180, -90];
    pts.forEach(function (p) { if (!p || typeof p[0] !== 'number') return; b[0] = Math.min(b[0], p[0]); b[1] = Math.min(b[1], p[1]); b[2] = Math.max(b[2], p[0]); b[3] = Math.max(b[3], p[1]); });
    var dl = (padM || 0) / 111320, dn = dl / Math.max(0.2, Math.cos((b[1] + b[3]) / 2 * Math.PI / 180));
    return [b[0] - dn, b[1] - dl, b[2] + dn, b[3] + dl];
  }
  function runwayRing(rm) {
    var h = (rm.wM || 45) / 2;
    return [C.dest(C.dest(rm.a, rm.brg, 0), rm.brg + 90, h), C.dest(rm.b, rm.brg + 90, h), C.dest(rm.b, rm.brg - 90, h), C.dest(rm.a, rm.brg - 90, h), C.dest(rm.a, rm.brg + 90, h)];
  }
  function runwayLayer(A) { return { id: 'rwy', name: 'Runways', kind: 'runway', items: A.S.runways.map(function (r) { var el = r.ends[0] ? r.ends[0].el : A.S.datum; return { ring: runwayRing(r.rm), z: el, label: 'RWY ' + r.rm.name }; }) }; }
  function hU(m) { return m === null || m === undefined || isNaN(m) ? '—' : V.set.unit === 'm' ? num(m, 1) + ' m' : num(m / FT, 0) + ' ft'; }
  // distances in nautical miles (aviation use): 3 decimals below 0.1 NM, 2 below 10 NM, then 1
  function dU(m) { if (m === null || m === undefined || isNaN(m)) return '—'; var n = Math.abs(m) / NMM; return num(m / NMM, n < 0.1 ? 3 : n < 10 ? 2 : 1) + ' NM'; }
  function brg3(b) { return ('00' + Math.round(b) % 360).slice(-3) + '°T'; }
  function sidPaths(A, E) { // the SIDs of the runway: [{key, label, coords}]
    var out = [];
    try {
      STUDY.segments([A.ds]).filter(function (sg) { return sg.kind === 'SID' && sg.ad === A.ad; }).forEach(function (sg) {
        var rw = ''; try { rw = IFP.runways(A.ds, sg.pr).map(function (o) { return M.shortName(o.r); }).join(' '); } catch (e) { rw = ''; }
        if (rw && rw.indexOf(E.desig) < 0) return;
        var k = sg.proc, o = out.filter(function (x) { return x.key === k; })[0];
        if (!o) { o = { key: k, label: sg.proc, coords: [] }; out.push(o); }
        sg.coords.forEach(function (c) { if (typeof c[0] === 'number') o.coords.push(c); });
      });
    } catch (e) { /* no procedures */ }
    return out.filter(function (o) { return o.coords.length > 1; });
  }

  /* ------------------------------------------------------------ take-off */
  function sevTO(r) { return r.inA6 && !r.netOk ? 'error' : r.charted ? 'warning' : r.poPen > 0 ? 'caution' : 'ok'; }
  async function takeoff(ctx, A, E) {
    var set = V.set, e = E.x.e, other = E.other ? E.other.x.e : null, dd = declared(A, E), L = C.distM(e.at, other ? other.at : e.at);
    var origin = dd.TODA ? C.dest(e.at, e.hdg, dd.TODA) : other ? other.at : C.dest(e.at, e.hdg, E.r.rm.lM);
    var elev = E.other ? E.other.x.el : E.x.el, sid = set.path !== 'straight' ? sidPaths(A, E).filter(function (p) { return p.key === set.path; })[0] : null;
    var o = { origin: origin, elev: elev, track: e.hdg, len: set.len, net: set.net / 100, gross: set.gross / 100, a6: { max: set.lat }, ois: set.len > 10000 ? 0.01 : 0.012 };
    if (sid) o.path = [origin].concat(sid.coords.filter(function (c) { return C.distM(c, e.at) > L * 0.9; }));
    var obs = obstacles(ctx).slice(), bb = bboxOf([e.at, origin, C.dest(origin, e.hdg, set.len + 1500)].concat(sid ? sid.coords : []), 2500);
    var T = set.terrain ? await terrainGrid(bb, 120) : null;
    if (T && T.fine) { // terrain as obstacles along the centre line and the edges of the net path area (every 150 m); not from the coarse built-in model
      var smp = FLTSCENE.sampler(T), P0 = C.pathOf(C.frame(origin), o.path || [origin, C.dest(origin, e.hdg, set.len)]), F0 = C.frame(origin);
      for (var d = 150; d <= set.len; d += 150) [-1, 0, 1].forEach(function (k) { var c = C.along(P0, F0, d, k * Math.min(90 + 0.125 * d, set.lat)), z = smp(c[0], c[1]); if (z !== null && z > elev + 5) obs.push({ id: 'ter:' + d + ':' + k, name: 'Terrain', label: 'Terrain', type: 'NATURAL_HIGHPOINT', kind: 'peak', c: c, elev: z, terrain: true }); });
    }
    var R = C.takeoff(obs, o), v = C.verdictTO(R), c = R.critical;
    var rows = R.rows.filter(function (r) { return !r.ob.terrain || sevTO(r) !== 'ok'; }).sort(function (a, b) { return b.req - a.req; });
    var top = rows.filter(function (r) { return r.inA6 || r.charted; }).slice(0, 5);
    var kpis = [[c ? C.pct(Math.max(0, c.req)) : '0 %', 'net gradient needed'], [C.pct(o.net), 'available (set)'], [num(R.charted.length), 'Type A obstacles'], [R.pdg ? C.pct(R.pdg.pdg) : '3.3 %', 'PANS-OPS PDG'], [num(R.closeIn.length), 'close-in']];
    var label = function (r) { return (r.ob.name || r.ob.label) + '\n' + C.pct(Math.max(0, r.req)) + ' · ' + dU(r.s); };
    var layers = baseLayers(T, A).concat([
      { id: 'a4', name: 'Type A area (Annex 4)', kind: 'polygon', level: 2, items: [{ ring: R.area.a4, color: '#6a1b9a', dash: '8 5', opacity: 0.05, label: 'Type A take-off flight path area' }] },
      { id: 'a6', name: 'Net flight path area', kind: 'polygon', level: 2, items: [{ ring: R.area.a6, color: '#00838f', opacity: 0.06, label: 'Net flight path area (±' + set.lat + ' m)' }] },
      { id: 'po', name: 'PANS-OPS departure area', kind: 'polygon', level: 2, on: false, items: [{ ring: R.area.po, color: '#5d4037', dash: '3 5', opacity: 0.03, label: 'PANS-OPS departure area (15° splay)' }] },
      { id: 'ois', name: '1.2 % surface (Type A)', kind: 'surface', items: [{ pts: R.area.a4.map(function (q) { var p = C.project(R.path, R.frame.xy(q)); return [q[0], q[1], elev + o.ois * Math.max(0, p ? p.s : 0)]; }), color: '#ab47bc', label: (o.ois * 100).toFixed(1) + ' % surface' }] },
      { id: 'pans', name: '2.5 % surface (PANS-OPS)', kind: 'surface', on: false, items: [{ pts: R.area.po.map(function (q) { var p = C.project(R.path, R.frame.xy(q)); return [q[0], q[1], elev + 5 + 0.025 * Math.max(0, p ? p.s : 0)]; }), color: '#8d6e63', label: '2.5 % OIS' }] },
      { id: 'net', name: 'Net and gross flight paths', kind: 'path', items: [pathLine(R, elev + R.opts.screen, o.net, '#00e5ff', 'net ' + C.pct(o.net), true), pathLine(R, elev + R.opts.screen, o.gross, '#7cb342', 'gross ' + C.pct(o.gross))] },
      { id: 'obs', name: 'Obstacles', kind: 'obstacles', items: rows.map(function (r, i) { return obItem(r.ob, sevTO(r), i < 6 && sevTO(r) !== 'ok' ? label(r) : '', [dU(r.s) + ' from the end of TODA · ' + dU(Math.abs(r.x)) + ' ' + r.side, 'top ' + hU(r.ob.elev) + ' · ' + hU(r.h) + ' above the DER', 'needs ' + C.pct(Math.max(0, r.req)) + ' net · clearance ' + hU(r.netClr), r.charted ? 'Type A: charted' : r.shadow ? 'Type A: in a shadow' : r.pen > 0 ? '' : 'below the 1.2 % surface']); }) },
      { id: 'vec', name: 'Distance vectors', kind: 'vector', items: top.map(function (r) { return { a: [origin[0], origin[1], elev + R.opts.screen], b: [r.ob.c[0], r.ob.c[1], r.ob.elev], label: [dU(r.s) + ' · Δh ' + hU(r.h - R.opts.screen)], color: sevTO(r) === 'error' ? '#ff5252' : '#ffca28' }; }) },
      { id: 'arc', name: 'Distance arcs', kind: 'arc', items: [1, 2, 3, 5].filter(function (d) { return d * NMM <= set.len; }).map(function (d) { return { c: origin, r: d * NMM, b0: (e.hdg + 270) % 360, b1: (e.hdg + 90) % 360, label: d + ' NM', z: null }; }) },
      { id: 'pts', name: 'Reference points', kind: 'point', items: [{ c: origin, z: elev, label: 'End of TODA' + (dd.TODA && dd.TORA && dd.TODA > dd.TORA ? ' (clearway ' + Math.round(dd.TODA - dd.TORA) + ' m)' : ''), color: '#00e676' }] }
    ]);
    var profile = { title: 'Take-off RWY ' + E.desig + ' — vertical profile', len: set.len, unit: set.unit, xLabel: 'distance from the end of TODA',
      terrain: T ? profTerrain(T, R, set.len) : [], obstacles: rows.filter(function (r) { return r.inA4 || r.inA6; }).map(function (r, i) { return { s: r.s, top: r.ob.elev, base: r.ob.hgt !== null && r.ob.hgt !== undefined ? r.ob.elev - r.ob.hgt : null, sev: sevTO(r), tag: i < 8 && sevTO(r) !== 'ok' ? (r.ob.name || '') + ' ' + C.pct(Math.max(0, r.req)) : '' }; }),
      lines: [{ pts: [[0, elev], [set.len, elev + o.ois * set.len]], color: '#ab47bc', dash: '6 4', label: (o.ois * 100).toFixed(1) + ' % (Type A)' }, { pts: [[0, elev + 5], [set.len, elev + 5 + 0.025 * set.len]], color: '#8d6e63', dash: '3 4', label: '2.5 % OIS' },
        { pts: [[0, elev + R.opts.screen], [set.len, elev + R.opts.screen + o.net * set.len]], color: '#00838f', w: 2.5, label: 'net ' + C.pct(o.net) }, { pts: [[0, elev + R.opts.screen], [set.len, elev + R.opts.screen + o.gross * set.len]], color: '#7cb342', label: 'gross ' + C.pct(o.gross) }]
        .concat(c && c.req > 0 ? [{ pts: [[0, elev + R.opts.screen], [c.s, c.ob.elev + R.opts.margin]], color: '#e53935', dash: '2 3', label: 'needed ' + C.pct(c.req) }] : []),
      marks: [{ s: 0, label: 'end of TODA' }] };
    var cols = ['#', 'Obstacle', 'Kind', 'Distance', 'Offset', 'Top', 'Above DER', 'Net gradient needed', 'Net path clearance', 'Type A (1.2 %)', 'PANS-OPS', 'Result'];
    var table = rows.map(function (r, i) {
      return [i + 1, r.ob.label, FLTSCENE.KIND_NAME[r.ob.kind] || '', dU(r.s), dU(Math.abs(r.x)) + ' ' + r.side, hU(r.ob.elev), hU(r.h), C.pct(Math.max(0, r.req)) + (r.req > 0 ? ' (' + Math.round(r.req * C.FTNM) + ' ft/NM)' : ''),
        r.inA6 ? hU(r.netClr) : 'outside', r.charted ? 'charted (+' + hU(r.pen) + ')' : r.shadow ? 'in a shadow' : r.inA4 ? 'below' : 'outside', r.pdg ? (r.closeIn ? 'close-in' : 'PDG ' + C.pct(r.pdg)) : r.inPO ? 'below' : 'outside', RES[sevTO(r)]];
    });
    var facts = [['Runway', 'RWY ' + E.desig + ' at ' + A.code + (A.name ? ' — ' + A.name : '')], ['Take-off distance available', dd.TODA ? num(dd.TODA) + ' m' + (dd.TORA ? ' (TORA ' + num(dd.TORA) + ' m)' : '') : 'not in the data: the end of the runway is used'],
      ['Departure end elevation', hU(elev)], ['Departure track', sid ? 'along ' + sid.label : brg3(e.hdg) + ' (straight out)'], ['Net / gross gradient available', C.pct(o.net) + ' / ' + C.pct(o.gross) + ' (as set: the aircraft performance data give the real values)'],
      ['Lateral margin', '90 m + 0.125 D, at most ±' + set.lat + ' m'], ['Type A area', '180 m wide at the end of TODA, + 0.25 D, at most 1 800 m, ' + num(set.len / NMM, 1) + ' NM (' + set.len / 1000 + ' km); ' + (o.ois * 100).toFixed(1) + ' % surface, shadow rule'],
      ['Limiting obstacle', c ? c.ob.label + ' — ' + dU(c.s) + ', ' + hU(c.h) + ' above the DER: needs ' + C.pct(Math.max(0, c.req)) : 'none'], ['PANS-OPS', R.pdg ? 'PDG ' + C.pct(R.pdg.pdg) + ' for ' + R.pdg.ob.label : 'no obstacle above the 2.5 % surface (PDG 3.3 %)'],
      ['Terrain', T ? T.src + (T.fine ? ' (terrain points assessed as obstacles)' : ' (pictures only, too coarse to assess)') : 'not used'], ['Obstacles assessed', num(rows.length) + ' in the areas (' + num(obs.length) + ' in the data, terrain points included)']];
    return { title: 'Take-off — ' + A.code + ' RWY ' + E.desig, verdict: v, kpis: kpis, spec: spec(layers, bb, T, origin, elev, 'Take-off ' + A.code + ' RWY ' + E.desig), profile: profile, cols: cols, table: table, rows: rows, facts: facts, method: METHOD.to };
  }
  function pathLine(R, z0, g, col, label, curtain) {
    var pts = [];
    for (var d = 0; d <= R.opts.len; d += 250) { var c = C.along(R.path, R.frame, d, 0); pts.push([c[0], c[1], z0 + g * d]); }
    return { pts: pts, color: col, label: label, curtain: curtain };
  }
  function profTerrain(T, R, len) { var smp = FLTSCENE.sampler(T), out = []; for (var d = 0; d <= len; d += Math.max(50, len / 200)) { var c = C.along(R.path, R.frame, d, 0), z = smp(c[0], c[1]); if (z !== null) out.push([d, z]); } return out; }
  function obItem(ob, sev, tag, sub) { return { id: ob.id, c: ob.c, top: ob.elev, hgt: ob.hgt, type: ob.type, kind: ob.kind, sev: sev, label: ob.label, sub: [FLTSCENE.KIND_NAME[ob.kind] + (ob.src ? ' · ' + ob.src : '')].concat(sub || []).filter(Boolean), tag: tag || '', notam: ob.notam, lit: ob.lit === 'YES' }; }
  function baseLayers(T, A) {
    var L = [];
    // terrain from a file or online tiles is shown; the coarse built-in model can be switched on in the layer list
    if (T) { L.push({ id: 'ter', name: 'Terrain' + (T.fine ? '' : ' (coarse model)'), kind: 'terrain', map: false, on: T.fine, items: [] }); L.push({ id: 'cnt', name: 'Elevation contours', kind: 'contours', map: false, on: T.fine, items: [] }); }
    if (A) L.push(runwayLayer(A));
    return L;
  }
  // the part of the picture that matters: the reference point and the obstacles with a result (else all of them)
  function focusOf(layers, centre) {
    var pts = [centre], ob = [];
    layers.forEach(function (l) { if (l.kind === 'obstacles') l.items.forEach(function (o) { if (o.sev && o.sev !== 'ok' && o.sev !== 'info') ob.push(o.c); }); });
    if (!ob.length) layers.forEach(function (l) { if (l.kind === 'obstacles') l.items.slice(0, 60).forEach(function (o) { ob.push(o.c); }); });
    pts = pts.concat(ob.slice(0, 200));
    return pts.length > 1 ? bboxOf(pts, 700) : null;
  }
  function spec(layers, bb, T, centre, ref, title) {
    var bases = null;
    try { var b = MAPVIEW.baseMaps(), pick = {}; ['esriGray', 'esriTopo', 'esri', 'esriDark', 'topo', 'esriStreet'].forEach(function (k) { if (b.list[k]) pick[k] = b.list[k]; }); bases = { list: pick, def: V.set.base || 'esriGray' }; } catch (e) { bases = null; }
    return { title: title, sub: NOTE, centre: centre, ref: ref, bbox: bb, focus: focusOf(layers, centre), terrain: T, layers: layers, bases: bases, cap: 6000, exag: 3, file: String(title || 'analysis').replace(/[^A-Za-z0-9]+/g, '_') };
  }
  var RES = { error: 'NOT CLEAR', warning: 'CHARTED / ABOVE', caution: 'CAUTION', ok: 'clear', info: 'note' };

  /* ------------------------------------------------------------ approach */
  function sevAPP(r) { return r.pen !== null && r.pen > 0 ? 'error' : r.vssPen !== null && r.vssPen > 0 ? 'warning' : r.gpClr < 30 ? 'caution' : 'ok'; }
  async function approach(ctx, A, E) {
    var set = V.set, e = E.x.e, thr = e.land || e.at, elev = E.x.el, ils = e.ils, gpa = set.gpa || (ils && parseFloat(ils.gp)) || 3, tab = OLS.TABLES.APP[E.x.type] && OLS.TABLES.APP[E.x.type][E.r.code], app = tab || OLS.TABLES.APP.NI[E.r.code];
    var R = C.approach(obstacles(ctx), { thr: thr, elev: elev, course: e.hdg, gpa: gpa, tch: set.tch, app: app }), v = C.verdictAPP(R), L = C.appLen(app);
    var bb = bboxOf([thr, C.dest(thr, (e.hdg + 180) % 360, Math.min(L, 9000) + 800)], 1500), T = set.terrain ? await terrainGrid(bb, 110) : null;
    var rows = R.rows.slice().sort(function (a, b) { var r = { error: 0, warning: 1, caution: 2, ok: 3 }; return r[sevAPP(a)] - r[sevAPP(b)] || (b.pen || -1e9) - (a.pen || -1e9); });
    var out = (e.hdg + 180) % 360, gpLine = [];
    for (var d = 0; d <= Math.min(L, 15000); d += 300) { var c = C.dest(thr, out, d); gpLine.push([c[0], c[1], elev + set.tch + d * Math.tan(gpa * Math.PI / 180)]); }
    var appSurf = R.area.app.map(function (q) { var p = C.project(R.path, R.frame.xy(q)), a = p ? C.appAllowed(app, Math.max(app.d, Math.min(p.s, L - 1))) : 0; return [q[0], q[1], elev + (a === null ? 150 : a)]; });
    var layers = baseLayers(T, A).concat([
      { id: 'appA', name: 'Approach surface (Annex 14)', kind: 'surface', items: [{ pts: appSurf, color: '#1e88e5', label: 'Approach surface ' + (E.x.type === 'P' ? 'precision' : E.x.type === 'NP' ? 'non-precision' : 'non-instrument') + ', code ' + E.r.code }] },
      { id: 'vss', name: 'Visual segment surface', kind: 'polygon', level: 2, items: [{ ring: R.area.vss, color: '#fb8c00', dash: '5 4', opacity: 0.05, label: 'Visual segment surface (indicative)' }] },
      { id: 'gp', name: 'Glide path', kind: 'path', items: [{ pts: gpLine, color: '#00e5ff', label: 'glide path ' + gpa.toFixed(1) + '°', curtain: true }] },
      { id: 'obs', name: 'Obstacles', kind: 'obstacles', items: rows.map(function (r, i) { return obItem(r.ob, sevAPP(r), i < 6 && sevAPP(r) !== 'ok' ? (r.ob.name || '') + '\n' + (r.pen > 0 ? '+' + hU(r.pen) : 'GP ' + hU(r.gpClr)) : '', [dU(r.s) + ' before the threshold · ' + dU(Math.abs(r.x)) + ' ' + r.side, 'top ' + hU(r.ob.elev) + ' · ' + hU(r.h) + ' above the threshold · ' + r.angle.toFixed(2) + '°', r.allowed !== null ? 'approach surface ' + hU(r.allowed) + ': ' + (r.pen > 0 ? 'ABOVE by ' + hU(r.pen) : 'below by ' + hU(-r.pen)) : '', 'below the glide path by ' + hU(r.gpClr)]); }) },
      { id: 'vec', name: 'Distance vectors', kind: 'vector', items: rows.filter(function (r) { return sevAPP(r) !== 'ok'; }).slice(0, 5).map(function (r) { return { a: [thr[0], thr[1], elev], b: [r.ob.c[0], r.ob.c[1], r.ob.elev], label: [dU(r.s) + ' · Δh ' + hU(r.h) + ' · ' + r.angle.toFixed(2) + '°'], color: sevAPP(r) === 'error' ? '#ff5252' : '#ffca28' }; }) },
      { id: 'arc', name: 'Distance arcs', kind: 'arc', items: [1, 2, 3].map(function (d) { return { c: thr, r: d * NMM, b0: (out + 270) % 360, b1: (out + 90) % 360, label: d + ' NM', z: null }; }) },
      { id: 'pts', name: 'Reference points', kind: 'point', items: [{ c: thr, z: elev, label: 'Threshold ' + E.desig, color: '#00e676' }] }
    ]);
    var profile = { title: 'Approach RWY ' + E.desig + ' — vertical profile', len: Math.min(L, 9000), unit: set.unit, xLabel: 'distance before the threshold',
      terrain: T ? (function () { var smp = FLTSCENE.sampler(T), o2 = []; for (var dd = 0; dd <= 9000; dd += 60) { var cc = C.dest(thr, out, dd), z = smp(cc[0], cc[1]); if (z !== null) o2.push([dd, z]); } return o2; })() : [],
      obstacles: rows.map(function (r, i) { return { s: r.s, top: r.ob.elev, base: r.ob.hgt !== null && r.ob.hgt !== undefined ? r.ob.elev - r.ob.hgt : null, sev: sevAPP(r), tag: i < 8 && sevAPP(r) !== 'ok' ? (r.ob.name || '') : '' }; }),
      lines: [{ pts: [0, 1000, 2000, 3000, 4000, 6000, 9000].map(function (dd) { return [dd, elev + set.tch + dd * Math.tan(gpa * Math.PI / 180)]; }), color: '#00838f', w: 2.5, label: 'glide path ' + gpa.toFixed(1) + '°' },
        { pts: [60, 600, 1200, 2000, 3060, 4000, 6000, 9000].map(function (dd) { var a = C.appAllowed(app, dd); return [dd, elev + (a === null ? 150 : a)]; }), color: '#1e88e5', dash: '6 4', label: 'approach surface' },
        { pts: [60, 8000].map(function (dd) { return [dd, elev + (dd - 60) * Math.tan((gpa - 1.12) * Math.PI / 180)]; }), color: '#fb8c00', dash: '3 4', label: 'VSS' }],
      marks: [{ s: 0, label: 'threshold' }] };
    var cols = ['#', 'Obstacle', 'Kind', 'Before threshold', 'Offset', 'Top', 'Above threshold', 'Angle', 'Approach surface', 'Glide path clearance', 'VSS', 'Displacement', 'Result'];
    var table = rows.map(function (r, i) { return [i + 1, r.ob.label, FLTSCENE.KIND_NAME[r.ob.kind] || '', dU(r.s), dU(Math.abs(r.x)) + ' ' + r.side, hU(r.ob.elev), hU(r.h), r.angle.toFixed(2) + '°', r.allowed === null ? 'outside' : r.pen > 0 ? 'ABOVE +' + hU(r.pen) : 'below ' + hU(-r.pen), hU(r.gpClr), r.vssPen === null ? 'outside' : r.vssPen > 0 ? 'ABOVE +' + hU(r.vssPen) : 'below', r.displace ? num(r.displace) + ' m' : '', RES[sevAPP(r)]]; });
    var kpis = [[num(R.penetrations.length), 'above the approach surface'], [R.worst ? num(R.worst.displace) + ' m' : '0 m', 'threshold displacement'], [R.minGp ? hU(R.minGp.gpClr) : '—', 'lowest glide path clearance'], [num(R.vss.length), 'above the VSS'], [gpa.toFixed(1) + '°', ils ? 'ILS glide path' : 'approach angle']];
    var facts = [['Runway', 'RWY ' + E.desig + ' at ' + A.code], ['Threshold elevation', hU(elev)], ['Approach', (E.x.type === 'P' ? 'precision' : E.x.type === 'NP' ? 'non-precision' : 'non-instrument') + ', code ' + E.r.code + (ils ? ' · ' + (ils.kind || 'ILS') + ' ' + (ils.cat || '') : '')],
      ['Approach surface', 'inner edge ' + app.ie + ' m at ' + app.d + ' m, divergence ' + (app.div * 100) + ' %, ' + app.l1 + ' m at ' + (app.s1 * 100).toFixed(2) + ' %' + (app.l2 ? ', ' + app.l2 + ' m at ' + (app.s2 * 100).toFixed(1) + ' %' : '')],
      ['Glide path', gpa.toFixed(2) + '°, threshold crossing height ' + hU(set.tch)], ['Visual segment surface', 'from 60 m before the threshold, ±75 m, splay 15 %, slope ' + (gpa - 1.12).toFixed(2) + '° (indicative)'], ['Terrain', T ? T.src : 'not used']];
    return { title: 'Approach — ' + A.code + ' RWY ' + E.desig, verdict: v, kpis: kpis, spec: spec(layers, bb, T, thr, elev, 'Approach ' + A.code + ' RWY ' + E.desig), profile: profile, cols: cols, table: table, rows: rows, facts: facts, method: METHOD.app };
  }

  /* ------------------------------------------------------------ runway impact */
  async function runwayImpact(ctx, A) {
    var obs = obstacles(ctx), list = endsOf(A), rowsOut = [], worst = 'ok', olsRes = null;
    try { olsRes = OLS.check(A.ds, A.ad, ctx.datasets.filter(function (d) { return (d.byType.VerticalStructure || []).length; })); } catch (e) { olsRes = null; }
    var rank = { error: 0, warning: 1, caution: 2, ok: 3 };
    list.forEach(function (E) {
      var e = E.x.e, other = E.other ? E.other.x.e : null, dd = declared(A, E), origin = dd.TODA ? C.dest(e.at, e.hdg, dd.TODA) : other ? other.at : e.at;
      var to = C.takeoff(obs, { origin: origin, elev: E.other ? E.other.x.el : E.x.el, track: e.hdg, net: V.set.net / 100, gross: V.set.gross / 100, a6: { max: V.set.lat } });
      var app = OLS.TABLES.APP[E.x.type] && OLS.TABLES.APP[E.x.type][E.r.code], ap = C.approach(obs, { thr: e.land || e.at, elev: E.x.el, course: e.hdg, gpa: (e.ils && parseFloat(e.ils.gp)) || 3, tch: V.set.tch, app: app || OLS.TABLES.APP.NI[E.r.code] });
      var cut = C.climbSurfaceCut(to, E.r.code >= 3 ? 0.02 : E.r.code === 2 ? 0.04 : 0.05), vt = C.verdictTO(to), va = C.verdictAPP(ap);
      var nt = V.notams.filter(function (n) { return n.runway && n.runway.rwys.some(function (r) { return r.split('/').indexOf(E.desig) >= 0; }) && (!n.locs.length || n.locs.indexOf(A.code) >= 0); });
      var sev = [vt.sev, va.sev, nt.some(function (n) { return n.runway.closed; }) ? 'error' : 'ok'].sort(function (a, b) { return rank[a] - rank[b]; })[0];
      if (rank[sev] < rank[worst]) worst = sev;
      rowsOut.push({ E: E, dd: dd, to: to, ap: ap, cut: cut, nt: nt, sev: sev, vt: vt, va: va });
    });
    var pens = olsRes ? olsRes.list : [];
    var cols = ['RWY', 'TORA / TODA / ASDA / LDA', 'Take-off: limiting obstacle', 'Net gradient needed', 'Type A', 'PANS-OPS PDG', 'TODA cut (take-off climb surface)', 'Approach: worst', 'Threshold displacement', 'NOTAM', 'Result'];
    var table = rowsOut.map(function (r) {
      var c = r.to.critical;
      return ['RWY ' + r.E.desig, ['TORA', 'TODA', 'ASDA', 'LDA'].map(function (k) { return r.dd[k] ? num(r.dd[k]) : '—'; }).join(' / '), c ? c.ob.label + ' (' + dU(c.s) + ')' : '—', c ? C.pct(Math.max(0, c.req)) : '0 %', num(r.to.charted.length), r.to.pdg ? C.pct(r.to.pdg.pdg) : '3.3 %',
        r.cut ? num(r.cut.cut) + ' m (' + r.cut.row.ob.label + ')' : '—', r.ap.worst ? r.ap.worst.ob.label + ' +' + hU(r.ap.worst.pen) : r.ap.minGp ? 'GP clearance ' + hU(r.ap.minGp.gpClr) : '—', r.ap.worst ? num(r.ap.worst.displace) + ' m' : '—',
        r.nt.map(function (n) { return n.id + (n.runway.closed ? ' CLOSED' : '') + (Object.keys(n.runway.dist).length ? ' ' + Object.keys(n.runway.dist).map(function (k) { return k + ' ' + n.runway.dist[k].txt; }).join(' ') : ''); }).join('; ') || '—', RES[r.sev]];
    });
    var bb = bboxOf(A.S.runways.reduce(function (a, r) { return a.concat([r.rm.a, r.rm.b]); }, []), 5000), T = V.set.terrain ? await terrainGrid(bb, 110) : null, layers = baseLayers(T, A);
    var surf = [];
    try { OLS.geometry(A.S).forEach(function (g) { (g.quads || []).forEach(function (q) { surf.push({ pts: q.concat([q[0]]), color: g.kind === 'app' ? '#1e88e5' : g.kind === 'toc' ? '#43a047' : g.kind === 'tr' ? '#8e24aa' : '#90a4ae', label: '' }); }); if (g.ring) surf.push({ pts: g.ring, color: '#90a4ae', label: g.name }); }); } catch (e) { surf = []; }
    layers.push({ id: 'ols', name: 'Annex 14 surfaces', kind: 'surface', items: surf.slice(0, 400) });
    var penBy = new Map(); pens.forEach(function (p) { penBy.set(p.rec, p); });
    var near = obs.filter(function (o) { return C.distM(o.c, A.arp || A.S.runways[0].rm.a) < 16000; });
    layers.push({ id: 'obs', name: 'Obstacles', kind: 'obstacles', items: near.map(function (o) { var p = penBy.get(o.r); return obItem(o, p ? 'error' : 'ok', p ? (o.name || '') + '\n+' + hU(p.pen) : '', [p ? 'above the ' + p.surface + ' by ' + hU(p.pen) : 'below the Annex 14 surfaces', 'top ' + hU(o.elev)]); }) });
    rowsOut.forEach(function (r) { if (r.nt.some(function (n) { return n.runway.closed; })) layers.push({ id: 'cl' + r.E.desig, name: 'Closed RWY ' + r.E.desig + ' (NOTAM)', kind: 'polygon', items: [{ ring: runwayRing(r.E.r.rm), color: '#e53935', opacity: 0.35, label: 'RWY ' + r.E.r.rm.name + ' closed (NOTAM)' }] }); });
    var nPen = pens.length, kpis = [[num(list.length), 'runway directions'], [num(nPen), 'Annex 14 penetrations'], [num(rowsOut.filter(function (r) { return r.vt.sev === 'error'; }).length), 'take-off not clear'], [num(rowsOut.filter(function (r) { return r.ap.worst; }).length), 'approach surface penetrated'], [num(V.notams.filter(function (n) { return n.runway && n.runway.closed; }).length), 'NOTAM closures']];
    var v = { sev: worst, txt: worst === 'ok' ? 'Every runway direction is clear with the data loaded.' : rowsOut.filter(function (r) { return r.sev !== 'ok'; }).map(function (r) { return 'RWY ' + r.E.desig + ': ' + (r.sev === 'error' ? (r.vt.sev === 'error' ? 'take-off not clear' : r.ap.worst ? 'approach surface penetrated' : 'closed by NOTAM') : 'caution'); }).join(' · ') };
    var facts = [['Aerodrome', A.code + (A.name ? ' — ' + A.name : '')], ['Runways', A.S.runways.map(function (r) { return r.rm.name + ' (code ' + r.code + ', ' + { P: 'precision', NP: 'non-precision', NI: 'non-instrument' }[r.type] + ')'; }).join(', ')],
      ['Annex 14 surfaces', nPen ? nPen + ' obstacle(s) above, the worst ' + (pens[0] ? pens[0].surface + ' by ' + hU(pens[0].pen) : '') : 'no obstacle above the surfaces'], ['Net gradient used', C.pct(V.set.net / 100) + ' (Settings)'], ['NOTAM read', num(V.notams.length)]];
    return { title: 'Runway impact — ' + A.code, verdict: v, kpis: kpis, spec: spec(layers, bb, T, A.arp || A.S.runways[0].rm.a, A.S.datum, 'Runway impact ' + A.code), profile: null, cols: cols, table: table, rows: rowsOut, facts: facts, method: METHOD.rwy };
  }

  /* ------------------------------------------------------------ eTOD areas */
  async function etodAreas(ctx, A) {
    // runways, TMA and movement area as the obstacle workspace reads them (OBSTVIEW.etodInput)
    var inp = OBSTVIEW.etodInput(A.ds, A.ad) || { rws: [], tma: null, move: [] }, rws = inp.rws, tma = inp.tma, move = inp.move;
    var E = C.etod(rws, { arp: A.arp, tma: tma, move: move });
    var obs = obstacles(ctx).filter(function (o) { return C.distM(o.c, E.arp) < 60000; }), byArea = {}, rows = [];
    obs.forEach(function (o) {
      var k = E.classify({ c: o.c, elev: o.elev, hgt: o.hgt }), accOk = o.hAcc !== null && o.hAcc !== undefined && o.vAcc !== null && o.vAcc !== undefined ? o.hAcc <= k.req.h && o.vAcc <= k.req.v : null;
      var sev = k.need ? (accOk === false ? 'error' : accOk === null ? 'caution' : 'ok') : 'info';
      var b = byArea[k.sub] || (byArea[k.sub] = { n: 0, need: 0, acc: 0, unk: 0 }); b.n++; if (k.need) { b.need++; if (accOk === false) b.acc++; if (accOk === null) b.unk++; }
      rows.push({ ob: o, k: k, accOk: accOk, sev: sev });
    });
    rows.sort(function (a, b) { var r = { error: 0, caution: 1, ok: 2, info: 3 }; return r[a.sev] - r[b.sev] || (b.k.above || 0) - (a.k.above || 0); });
    var bb = bboxOf(E.areas.a2c || [E.arp], 1500), T = V.set.terrain ? await terrainGrid(bb, 120) : null, layers = baseLayers(T, A);
    var AC = { a2a: '#d81b60', a2b: '#8e24aa', a2c: '#3949ab', a2d: '#00897b', a3: '#f4511e', a4: '#6d4c41' };
    layers.push({ id: 'e2d', name: 'Area 2d (24.3 NM / TMA)', kind: 'polygon', level: 2, items: [{ ring: E.areas.a2d, color: AC.a2d, opacity: 0.02, dash: '10 6', label: 'Area 2d — to 24.3 NM (45 km) from the ARP' + (tma ? ' or the TMA' : '') }] });
    if (E.areas.a2c) layers.push({ id: 'e2c', name: 'Area 2c (5.4 NM)', kind: 'polygon', level: 2, items: [{ ring: E.areas.a2c, color: AC.a2c, opacity: 0.03, dash: '6 4', label: 'Area 2c — within 5.4 NM (10 km) of Area 2a' }] });
    layers.push({ id: 'e2b', name: 'Area 2b (take-off, 5.4 NM)', kind: 'polygon', level: 2, items: E.areas.a2b.map(function (a) { return { ring: a.ring, color: AC.a2b, opacity: 0.06, label: 'Area 2b — RWY ' + a.rwy }; }) });
    layers.push({ id: 'e2a', name: 'Area 2a (strip + clearway)', kind: 'polygon', level: 2, items: E.areas.a2a.map(function (a) { return { ring: a.ring, color: AC.a2a, opacity: 0.12, label: 'Area 2a — RWY ' + a.rwy }; }) });
    layers.push({ id: 'e3', name: 'Area 3 (movement area)', kind: 'polygon', level: 2, items: E.areas.a3.map(function (a) { return { ring: a.ring, color: AC.a3, opacity: 0.15, label: 'Area 3 — 90 m from the centre line' }; }) });
    if (E.areas.a4.length) layers.push({ id: 'e4', name: 'Area 4 (CAT II / III)', kind: 'polygon', level: 2, items: E.areas.a4.map(function (a) { return { ring: a.ring, color: AC.a4, opacity: 0.2, label: 'Area 4 — RWY ' + a.rwy }; }) });
    layers.push({ id: 'es', name: 'Collection surfaces (3 m, 1.2 %)', kind: 'surface', items: E.areas.a2a.map(function (a) { return { pts: a.surface, color: AC.a2a, label: '2a: 3 m' }; }).concat(E.areas.a2b.map(function (a) { return { pts: a.surface, color: AC.a2b, label: '2b: 1.2 %' }; })) });
    layers.push({ id: 'obs', name: 'Obstacles', kind: 'obstacles', items: rows.map(function (r, i) { return obItem(r.ob, r.sev, i < 6 && r.sev !== 'info' && r.sev !== 'ok' ? (r.ob.name || '') + '\nArea ' + r.k.strict : '', ['Area ' + r.k.sub + (r.k.also.length ? ' (also ' + r.k.also.join(', ') + ')' : ''), r.k.surf !== null ? 'collection surface ' + hU(r.k.surf) + ': ' + (r.k.need ? 'ABOVE by ' + hU(r.k.above) : 'below') : 'height ' + hU(r.ob.hgt) + (r.k.need ? ' — 100 m or more' : ''), 'accuracy required ' + r.k.req.h + ' m / ' + r.k.req.v + ' m · given ' + (r.ob.hAcc !== null && r.ob.hAcc !== undefined ? num(r.ob.hAcc, 1) : '—') + ' / ' + (r.ob.vAcc !== null && r.ob.vAcc !== undefined ? num(r.ob.vAcc, 1) : '—') + ' m']); }) });
    var areaRows = ['2a', '2b', '2c', '2d', '3', '4', '1'].filter(function (k) { return byArea[k] || k === '2a'; }).map(function (k) { var b = byArea[k] || { n: 0, need: 0, acc: 0, unk: 0 }, d = C.ETOD[k]; return [d.name, d.what, d.surf, d.h + ' m / ' + d.v + ' m', num(b.n), num(b.need), num(b.acc), num(b.unk)]; });
    var cols = ['#', 'Obstacle', 'Kind', 'Area', 'Collection surface', 'Above it', 'In the data set?', 'Accuracy required (h / v)', 'Given (h / v)', 'Result'];
    var table = rows.map(function (r, i) { return [i + 1, r.ob.label, FLTSCENE.KIND_NAME[r.ob.kind] || '', r.k.sub + (r.k.also.length ? ' (+' + r.k.also.join(', ') + ')' : ''), r.k.surf !== null ? hU(r.k.surf) : '100 m above ground', r.k.above !== null && r.k.above !== undefined ? (r.k.above >= 0 ? '+' : '') + hU(r.k.above) : '—', r.k.need === null ? 'unknown' : r.k.need ? 'required' : 'not required', r.k.req.h + ' / ' + r.k.req.v + ' m', (r.ob.hAcc !== null && r.ob.hAcc !== undefined ? num(r.ob.hAcc, 1) : '—') + ' / ' + (r.ob.vAcc !== null && r.ob.vAcc !== undefined ? num(r.ob.vAcc, 1) : '—') + ' m', r.sev === 'error' ? 'ACCURACY NOT MET' : r.sev === 'caution' ? 'accuracy not given' : r.sev === 'ok' ? 'ok' : 'not required']; });
    var nNeed = rows.filter(function (r) { return r.k.need; }).length, nBad = rows.filter(function (r) { return r.sev === 'error'; }).length, nUnk = rows.filter(function (r) { return r.sev === 'caution'; }).length;
    var v = { sev: nBad ? 'error' : nUnk ? 'caution' : 'ok', txt: nNeed + ' obstacle(s) above the collection surfaces of their area' + (nBad ? '; ' + nBad + ' do not meet the accuracy of their area' : '') + (nUnk ? '; ' + nUnk + ' without an accuracy' : '') + '.' };
    var kpis = [[num(byArea['2a'] ? byArea['2a'].need : 0), 'Area 2a (3 m)'], [num(byArea['2b'] ? byArea['2b'].need : 0), 'Area 2b (1.2 %)'], [num(byArea['2c'] ? byArea['2c'].need : 0), 'Area 2c (1.2 %)'], [num(byArea['2d'] ? byArea['2d'].need : 0), 'Area 2d (100 m)'], [num(byArea['3'] ? byArea['3'].n : 0), 'Area 3']];
    var facts = [['Aerodrome', A.code + (A.name ? ' — ' + A.name : '')], ['ARP', AX.fmtPos(E.arp, 1)], ['TMA boundary', tma ? 'used for Area 2d' : 'no TMA containing the ARP in the data: 24.3 NM (45 km) circle'], ['Movement area', move.length ? move.length + ' taxiway / apron elements (Area 3: 50 m)' : 'runways only (Area 3: 90 m from the centre line)'],
      ['Area 4', E.areas.a4.length ? E.areas.a4.length + ' CAT II / III runway end(s)' : 'no CAT II / III ILS in the data']];
    return { title: 'eTOD areas — ' + A.code, verdict: v, kpis: kpis, spec: spec(layers, bb, T, E.arp, A.S.datum, 'eTOD areas ' + A.code), profile: null, cols: cols, table: table, rows: rows, facts: facts, extra: { title: 'Obstacles by area (ICAO Annex 15 / PANS-AIM)', cols: ['Area', 'Extent', 'Collection surface', 'Accuracy (h / v)', 'Obstacles', 'Above the surface', 'Accuracy not met', 'Accuracy not given'], rows: areaRows }, method: METHOD.etod };
  }

  /* ------------------------------------------------------------ route & airspace */
  // "OTHH DCT ALSEM UL768 DESDI 2512N05530E/F350 OMDB" -> [{c, name, alt}], not found
  function resolveRoute(ctx, text, dflt) {
    var toks = String(text || '').toUpperCase().replace(/[,;]/g, ' ').split(/\s+/).filter(Boolean), pts = [], miss = [], alt = dflt;
    function find(name) {
      for (var i = 0; i < ctx.datasets.length; i++) {
        var ds = ctx.datasets[i]; if (!ds.byType) continue;
        var ad = (ds.byType.AirportHeliport || []).filter(function (a) { return s(a.cur.p.locationIndicatorICAO) === name || s(a.cur.p.designator) === name; })[0];
        if (ad) { var c0 = M.pointOf(ds, ad); if (c0) return { c: c0, name: name, ds: ds }; }
        var k = ['DesignatedPoint', 'Navaid', 'VOR', 'DME', 'NDB', 'TACAN'];
        for (var j = 0; j < k.length; j++) { var r = (ds.byType[k[j]] || []).filter(function (x) { return s(x.cur.p.designator) === name; })[0]; if (r) { var c1 = M.pointOf(ds, r); if (c1) return { c: c1, name: name, ds: ds }; } }
      }
      return null;
    }
    function levelOf(t) { var m = /^(?:[NMK]\d{3,4})?(F|A|S|M)(\d{3,4})$/.exec(t); if (!m) return null; var v = +m[2]; return m[1] === 'F' ? v * 100 * FT : m[1] === 'A' ? v * 100 * FT : m[1] === 'S' ? v * 10 : v * 10; }
    function airway(name, from, to) { // the points of an ATS route between two of its points (route segments of the AIP data set)
      for (var i = 0; i < ctx.datasets.length; i++) {
        var ds = ctx.datasets[i]; if (!ds.byType || !ds.byType.Route) continue;
        var rt = ds.byType.Route.filter(function (r) { return key(M.routeDesignator(r.cur.p)) === key(name); });
        if (!rt.length) continue;
        var adj = new Map();
        (ds.byType.RouteSegment || []).forEach(function (sg) {
          var r = M.target(ds, sg.cur.p.routeFormed); if (rt.indexOf(r) < 0) return;
          var a = M.segPointLabel(ds, sg.cur.p.start), b = M.segPointLabel(ds, sg.cur.p.end), ca = M.segPoint(ds, sg.cur.p.start), cb = M.segPoint(ds, sg.cur.p.end);
          if (!a || !b || !ca || !cb) return;
          [[a, b, cb], [b, a, ca]].forEach(function (x) { var l = adj.get(x[0]) || []; l.push({ to: x[1], c: x[2] }); adj.set(x[0], l); });
        });
        if (!adj.has(from)) continue;
        var prev = new Map([[from, null]]), q = [from];
        while (q.length) { var u = q.shift(); if (u === to) break; (adj.get(u) || []).forEach(function (n) { if (!prev.has(n.to)) { prev.set(n.to, { from: u, c: n.c }); q.push(n.to); } }); }
        if (!prev.has(to)) continue;
        var path = [], at = to; while (at !== from) { var p = prev.get(at); path.unshift({ name: at, c: p.c }); at = p.from; }
        return path;
      }
      return null;
    }
    function key(t) { return String(t || '').toUpperCase().replace(/\s+/g, ''); }
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i], parts = t.split('/'), base = parts[0], lv = parts[1] ? levelOf(parts[1]) : null;
      if (/^(DCT|SID|STAR|IFR|VFR)$/.test(base)) continue;
      var l0 = levelOf(base); if (l0 !== null && !parts[1]) { alt = l0; continue; }
      var cs = NOTAMTXT.coords(base);
      if (cs.length) { pts.push({ c: cs[0].c, name: base, alt: lv !== null ? lv : alt }); continue; }
      var f = find(base);
      if (f) { pts.push({ c: f.c, name: base, alt: lv !== null ? lv : alt }); continue; }
      // an airway between the previous point and the next one
      if (pts.length && i + 1 < toks.length) {
        var nx = toks[i + 1].split('/')[0], path = airway(base, pts[pts.length - 1].name, nx);
        if (path) { path.slice(0, -1).forEach(function (p) { pts.push({ c: p.c, name: p.name, alt: alt, via: base }); }); continue; }
      }
      miss.push(t);
    }
    if (dflt !== null && dflt !== undefined) pts.forEach(function (p) { if (p.alt === null || p.alt === undefined) p.alt = dflt; });
    return { pts: pts, miss: miss };
  }
  // the special-use airspace of the data loaded, the NOTAMs and the AIP text read here, at time T
  async function suaAt(ctx, T) {
    var out = [];
    if (typeof FOURD === 'undefined') { try { await LAZY.run('src-fourd'); } catch (e) { /* 4D not available: hours not evaluated */ } }
    var notOn = {}, ac = {};
    V.notams.forEach(function (n) { if (n.cat !== 'airspace' && n.cat !== 'warning') return; var st = NOTAMTXT.stateAt(n, T); n.designators.forEach(function (d) { var k = NOTAMTXT.key(d); if (n.activation === 'off') notOn[k] = n; else if (st === 'on' || st === 'maybe') ac[k] = { n: n, st: st }; }); });
    ctx.datasets.forEach(function (ds) {
      (ds.byType && ds.byType.Airspace || []).forEach(function (a) {
        var t = s(a.cur.p.type);
        if (!/^(P|R|D|TRA|TSA|MOA|W|A|ADIZ|CBA|D_OTHER|R_AMC|D_AMC|AMA|PROTECT)$/.test(t)) return;
        var g = M.geometry(ds, a), parts = !g ? [] : g.t === 'M' ? g.parts : [g];
        var vol = arr(a.cur.p.geometryComponent).map(function (gc) { return gc && gc.theAirspaceVolume; }).filter(function (v) { return v && v.nil === undefined; })[0] || {};
        var lo = limM(vol.lowerLimit, vol.lowerLimitReference), up = limM(vol.upperLimit, vol.upperLimitReference), k = NOTAMTXT.key(s(a.cur.p.designator));
        var st = t === 'P' ? 'on' : 'maybe', why = t === 'P' ? 'prohibited' : 'activity not published: check the NOTAM';
        try { var E = FOURD.entriesOf(a.cur.p); if (E.length) { var c0 = parts[0] && parts[0].c && parts[0].c[0] && parts[0].c[0][0]; var x = FOURD.evalEntries(E, T, { hol: new Set() }, c0 || [0, 0]); if (x.st !== 'unknown') { st = x.st; why = x.why; } } } catch (e) { /* hours not evaluated */ }
        if (ac[k]) { st = 'on'; why = 'activated by NOTAM ' + ac[k].n.id; }
        if (notOn[k]) { st = 'off'; why = 'deactivated by NOTAM ' + notOn[k].id; }
        parts.forEach(function (p) { if (p && p.t === 'A' && p.c && p.c[0] && p.c[0].length > 3) out.push({ id: a.id, name: M.label(ds, a), desig: s(a.cur.p.designator), type: t, ring: p.c[0].filter(function (q) { return typeof q[0] === 'number'; }), lo: lo.m, up: up.m, loTxt: lo.txt, upTxt: up.txt, state: st, why: why, src: 'AIXM ' + ds.name }); });
      });
    });
    NOTAMTXT.notamAreas(V.notams).forEach(function (a, i) { var n = V.notams.filter(function (x) { return 'NOTAM ' + x.id === a.desig; })[0], st = n ? NOTAMTXT.stateAt(n, T) : 'maybe'; if (st === 'cancel') return; out.push({ id: 'na' + i, name: a.desig + ' — ' + a.name, desig: a.desig, type: a.type, ring: a.ring, lo: a.lower ? a.lower.m : 0, up: a.upper ? a.upper.m : Infinity, loTxt: a.lower ? a.lower.txt : 'SFC', upTxt: a.upper ? a.upper.txt : 'UNL', state: st === 'on' ? 'on' : st === 'maybe' ? 'maybe' : 'off', why: 'NOTAM ' + st, src: 'NOTAM' }); });
    V.textAreas.forEach(function (a, i) { if (!a.ring) return; out.push({ id: 'ta' + i, name: a.desig + (a.name ? ' ' + a.name : ''), desig: a.desig, type: a.type, ring: a.ring, lo: a.lower ? a.lower.m : 0, up: a.upper ? a.upper.m : Infinity, loTxt: a.lower ? a.lower.txt : '?', upTxt: a.upper ? a.upper.txt : '?', state: /H24/.test(a.hours) ? 'on' : 'maybe', why: a.hours || 'hours not read', src: 'AIP text' }); });
    return out;
  }
  function limM(v, ref) {
    v = arr(v)[0];
    if (v === undefined || v === null || (typeof v === 'object' && v.nil !== undefined)) return { m: null, txt: '' };
    var val = typeof v === 'object' ? v.v : v, txt = M.fLimit(v, ref);
    if (/^(GND|SFC|FLOOR)$/i.test(String(val))) return { m: 0, txt: 'GND' };
    if (/^(UNL|CEILING)$/i.test(String(val))) return { m: Infinity, txt: 'UNL' };
    var n = parseFloat(val), u = String((typeof v === 'object' && v.u) || 'FT').toUpperCase();
    if (isNaN(n)) return { m: null, txt: txt };
    var m = u === 'FL' ? n * 100 * FT : u === 'M' ? n : u === 'KM' ? n * 1000 : n * FT;
    return { m: m, txt: txt };
  }
  var ACOL = { P: '#d50000', R: '#e53935', D: '#fb8c00', TRA: '#8e24aa', TSA: '#8e24aa', MOA: '#6d4c41', W: '#ff6f00', A: '#00897b', ADIZ: '#3949ab' };
  async function route(ctx) {
    var set = V.set, fl = parseFloat(V.route.fl), dflt = isNaN(fl) ? null : fl * 100 * FT, T = V.route.time ? Date.parse(V.route.time.replace(' ', 'T') + (/Z$/.test(V.route.time) ? '' : 'Z')) : Date.now();
    if (isNaN(T)) T = Date.now();
    var rr = resolveRoute(ctx, V.route.text, dflt), pts = rr.pts;
    if (pts.length < 2) return { empty: true, miss: rr.miss };
    var obs = obstacles(ctx), bb = bboxOf(pts.map(function (p) { return p.c; }), set.half * NMM + 3000), span = Math.max(bb[2] - bb[0], bb[3] - bb[1]);
    var Tg = await terrainGrid(bb, span > 8 ? 160 : 130), smp = FLTSCENE.sampler(Tg), terr = [];
    for (var i = 1; i < pts.length; i++) { // the highest terrain in the corridor of each leg
      var a = pts[i - 1].c, b = pts[i].c, L = C.distM(a, b), n = Math.max(20, Math.min(400, Math.ceil(L / 1500))), best = null, brg = C.bearing(a, b);
      for (var k = 0; k <= n; k++) for (var x = -2; x <= 2; x++) { var c = C.dest(C.dest(a, brg, L * k / n), brg + 90, x * set.half * NMM / 2), z = smp(c[0], c[1]); if (z !== null && (!best || z > best.h)) best = { h: z, c: c }; }
      terr.push(best);
    }
    var R = C.route(pts, obs, { half: set.half, clr: set.clr * FT, terrain: terr, alt: dflt }), areas = await suaAt(ctx, T), X = C.crossings(pts, areas, { alt: dflt });
    var hits = X.filter(function (x) { return C.crossSev(x) === 'error'; }), msaBad = R.legs.filter(function (l) { return !l.ok; });
    var v = { sev: hits.length || msaBad.length ? 'error' : X.some(function (x) { return C.crossSev(x) === 'warning'; }) ? 'warning' : 'ok',
      txt: (hits.length ? hits.length + ' area(s) entered that must not be (prohibited, or restricted and active)' : 'No prohibited or active restricted area entered') + ' · ' + (msaBad.length ? msaBad.length + ' leg(s) below the minimum safe altitude' : 'every leg at or above its minimum safe altitude') + '.' };
    var layers = [];
    if (Tg) layers.push({ id: 'ter', name: 'Terrain', kind: 'terrain', map: false, items: [] });
    layers.push({ id: 'cor', name: 'Corridor ±' + set.half + ' NM', kind: 'polygon', level: 2, items: R.legs.map(function (l) { var F = C.frame(l.a.c), P = C.pathOf(F, [l.a.c, l.b.c]); return { ring: C.corridor(P, F, l.len, function () { return set.half * NMM; }, Math.max(500, l.len / 20)), color: '#00838f', opacity: 0.04, dash: '6 4' }; }) });
    layers.push({ id: 'sua', name: 'Restricted / danger / prohibited areas', kind: 'volume', items: areas.filter(function (a) { return X.some(function (x) { return x.area === a; }) || C.distM(a.ring[0], pts[0].c) < 600000; }).slice(0, 300).map(function (a) { var xs = X.filter(function (x) { return x.area === a; }), sv = xs.length ? xs.map(C.crossSev).sort()[0] : 'info'; return { ring: a.ring, lo: a.lo, up: a.up, color: a.state === 'off' ? '#90a4ae' : ACOL[a.type] || '#c62828', label: a.desig || a.name, sub: [a.type + ' · ' + a.loTxt + ' – ' + a.upTxt, a.state + ' (' + a.why + ')', xs.length ? 'crossed: ' + xs.map(function (x) { return x.vertical; }).join(', ') : '', a.src], sev: sv }; }) });
    layers.push({ id: 'rte', name: 'Route', kind: 'path', items: [{ pts: pts.map(function (p) { return [p.c[0], p.c[1], p.alt !== null && p.alt !== undefined ? p.alt : 3000]; }), color: '#00e5ff', label: 'route', curtain: true }] });
    layers.push({ id: 'wpt', name: 'Route points', kind: 'point', items: pts.map(function (p) { return { c: p.c, z: p.alt, label: p.name, color: '#00acc1' }; }) });
    var near = [].concat.apply([], R.legs.map(function (l) { return l.obstacles; })).sort(function (a, b) { return b.ob.elev - a.ob.elev; }).slice(0, 400);
    layers.push({ id: 'obs', name: 'Obstacles in the corridor', kind: 'obstacles', items: near.map(function (e2, i) { var l = R.legs[e2.leg]; return obItem(e2.ob, l.alt !== null && e2.ob.elev + set.clr * FT > l.alt ? 'error' : 'ok', i < 5 ? (e2.ob.name || '') + '\n' + hU(e2.ob.elev) : '', ['leg ' + l.a.name + ' – ' + l.b.name + ' · ' + num(e2.x / NMM, 1) + ' NM off track', 'top ' + hU(e2.ob.elev)]); }) });
    var profile = { title: 'Route — vertical profile', len: R.len, unit: set.unit, xLabel: 'distance along the route',
      terrain: (function () { var o2 = [], acc = 0; for (var j = 1; j < pts.length; j++) { var a2 = pts[j - 1].c, b2 = pts[j].c, L2 = C.distM(a2, b2), n2 = Math.max(10, Math.ceil(L2 / 2000)), br = C.bearing(a2, b2); for (var k2 = 0; k2 <= n2; k2++) { var c2 = C.dest(a2, br, L2 * k2 / n2), z2 = smp(c2[0], c2[1]); if (z2 !== null) o2.push([acc + L2 * k2 / n2, z2]); } acc += L2; } return o2; })(),
      obstacles: near.slice(0, 200).map(function (e2) { return { s: e2.s, top: e2.ob.elev, base: e2.ob.hgt !== null && e2.ob.hgt !== undefined ? e2.ob.elev - e2.ob.hgt : null, sev: 'ok' }; }),
      lines: [{ pts: (function () { var o3 = [], acc = 0; pts.forEach(function (p, j) { if (j) acc += C.distM(pts[j - 1].c, p.c); if (p.alt !== null && p.alt !== undefined) o3.push([acc, p.alt]); }); return o3; })(), color: '#00838f', w: 2.5, label: 'route' },
        { pts: [].concat.apply([], R.legs.filter(function (l) { return l.msa !== null; }).map(function (l) { return [[l.s0, l.msa], [l.s0 + l.len, l.msa]]; })), color: '#e53935', dash: '5 3', label: 'minimum safe altitude' }],
      bands: X.map(function (x) { return { s0: x.sIn, s1: x.sOut, lo: x.area.lo, up: x.area.up, color: ACOL[x.area.type] || '#c62828', label: x.area.desig || x.area.type }; }),
      marks: (function () { var o4 = [], acc = 0; pts.forEach(function (p, j) { if (j) acc += C.distM(pts[j - 1].c, p.c); o4.push({ s: acc, label: p.name }); }); return o4; })() };
    var cols = ['Area', 'Type', 'Limits', 'State at the time', 'Entry', 'Exit', 'Route there', 'Vertical', 'Source', 'Result'];
    var table = X.map(function (x) { var sv = C.crossSev(x); return [x.area.desig || x.area.name, x.area.type, x.area.loTxt + ' – ' + x.area.upTxt, x.area.state + ' — ' + x.area.why, num(x.sIn / NMM, 1) + ' NM', num(x.sOut / NMM, 1) + ' NM', hU(x.altIn) + (x.altOut !== x.altIn ? ' → ' + hU(x.altOut) : ''), x.vertical, x.area.src, sv === 'error' ? 'MUST NOT ENTER' : sv === 'warning' ? 'CHECK' : sv === 'caution' ? 'caution' : 'clear']; });
    var legs = { title: 'Legs: obstacles, terrain and minimum safe altitude', cols: ['Leg', 'Track', 'Length', 'Highest obstacle', 'Highest terrain', 'Minimum safe altitude', 'Planned', 'Result'],
      rows: R.legs.map(function (l) { return [l.a.name + ' – ' + l.b.name, brg3(l.trk), num(l.len / NMM, 1) + ' NM', l.hi ? l.hi.ob.label + ' ' + hU(l.hi.ob.elev) : '—', l.terrain ? hU(l.terrain.h) : '—', l.msa !== null ? hU(l.msa) : '—', l.alt !== null ? hU(l.alt) : '—', l.ok ? 'ok' : 'BELOW']; }) };
    var kpis = [[num(R.len / NMM, 0) + ' NM', 'route'], [num(X.length), 'areas crossed'], [num(hits.length), 'must not enter'], [num(msaBad.length), 'legs below MSA'], [new Date(T).toISOString().slice(11, 16) + 'Z', new Date(T).toISOString().slice(0, 10)]];
    var facts = [['Route', pts.map(function (p) { return p.name; }).join(' ')], rr.miss.length ? ['Not found', rr.miss.join(' ') + ' (not in the data loaded)'] : null, ['Time', new Date(T).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'], ['Corridor', '±' + set.half + ' NM, clearance ' + set.clr + ' ft'], ['Areas known', num(areas.length) + ' (AIXM, NOTAM, AIP text)'], ['Terrain', Tg ? Tg.src : 'not available']].filter(Boolean);
    return { title: 'Route & airspace', verdict: v, kpis: kpis, spec: spec(layers, bb, Tg, pts[0].c, 0, 'Route ' + pts[0].name + ' – ' + pts[pts.length - 1].name), profile: profile, cols: cols, table: table, rows: X, facts: facts, extra: legs, method: METHOD.route, miss: rr.miss };
  }

  /* ------------------------------------------------------------ NOTAM & areas */
  async function readText(text, name) {
    var list = NOTAMTXT.parse(text), areas = NOTAMTXT.areas(text).filter(function (a) { return a.ring; });
    if (list.length) {
      var seen = new Set(V.notams.map(function (n) { return n.id + '|' + n.raw.length; }));
      list.forEach(function (n) { if (!seen.has(n.id + '|' + n.raw.length)) V.notams.push(n); });
      V.notamsAdded = false;
      await notamGround();
    }
    if (areas.length && areas.length >= list.length) { areas.forEach(function (a) { a.src = name || 'pasted text'; }); V.textAreas = V.textAreas.concat(areas); }
    obsCache.sig = '';
    return { notams: list.length, areas: areas.length >= list.length ? areas.length : 0 };
  }
  async function readFile(f) {
    if (/\.pdf$/i.test(f.name)) {
      if (typeof AMDBDOC === 'undefined') await LAZY.run('src-amdbdoc');
      var r = await AMDBDOC.pdfRead(new Uint8Array(await f.arrayBuffer()));
      return readText(r.lines.map(function (l) { return l.t.replace(/\t/g, '  '); }).join('\n'), f.name);
    }
    return readText(await f.text(), f.name);
  }
  // a NOTAM area / an area of the AIP text as a volume of a scene; what was read from a NOTAM, in a few words
  function naItem(a, T) {
    var n = V.notams.filter(function (x) { return 'NOTAM ' + x.id === a.desig; })[0], st = n ? NOTAMTXT.stateAt(n, T) : 'maybe';
    return { ring: a.ring, lo: a.lower ? a.lower.m : 0, up: a.upper ? a.upper.m : 6000, color: st === 'on' ? ACOL[a.type] || '#e53935' : '#90a4ae', label: a.desig, sub: [a.name, (a.lower ? a.lower.txt : 'SFC') + ' – ' + (a.upper ? a.upper.txt : 'UNL'), 'now: ' + st] };
  }
  function taItem(a) { return { ring: a.ring, lo: a.lower ? a.lower.m : 0, up: a.upper ? a.upper.m : 6000, color: ACOL[a.type] || '#e53935', label: a.desig + (a.name ? ' ' + a.name : ''), sub: [(a.lower ? a.lower.txt : '?') + ' – ' + (a.upper ? a.upper.txt : '?'), a.hours || '', 'from ' + (a.src || 'text')] }; }
  function noteWhat(n) { return n.obstacles.length ? n.obstacles.length + ' obstacle(s)' + (n.obstacles[0].elev !== null ? ' top ' + hU(n.obstacles[0].elev) : n.obstacles[0].hgt !== null ? ' height ' + hU(n.obstacles[0].hgt) : '') : n.area ? (n.area.circle ? 'circle ' + num(n.area.circle.rNM, 1) + ' NM' : 'area of ' + (n.area.ring.length - 1) + ' points') + (n.lower || n.upper ? ' ' + (n.lower ? n.lower.txt : 'SFC') + ' – ' + (n.upper ? n.upper.txt : 'UNL') : '') : n.runway ? 'RWY ' + n.runway.rwys.join(', ') + (n.runway.closed ? ' closed' : '') + (Object.keys(n.runway.dist).length ? ' ' + Object.keys(n.runway.dist).join(', ') : '') : n.designators.length ? n.designators.join(', ') + (n.activation === 'on' ? ' active' : n.activation === 'off' ? ' not active' : '') : ''; }
  // What was read from NOTAM and AIP text, with the analysis of an aerodrome (take-off, approach, runway impact, eTOD
  // areas): the areas around it on the same map, 3D and report (NOTAM obstacles are already among the obstacles), the
  // NOTAMs of the aerodrome in a table, a NOTAM closing the runway of the analysis in the result.
  var NEAR = 25 * NMM;
  function withNotes(R, A, E) {
    if (!R || R.empty || (!V.notams.length && !V.textAreas.length)) return R;
    var c = A.arp || (A.S.runways[0] && A.S.runways[0].rm.a), T = Date.now();
    if (!c) return R;
    var near = function (ring) { return !!ring && (C.inRing(c, ring) || ring.some(function (p) { return C.distM(p, c) <= NEAR; })); };
    var na = NOTAMTXT.notamAreas(V.notams).filter(function (a) { return near(a.ring); }), ta = V.textAreas.filter(function (a) { return near(a.ring); });
    var layers = [];
    if (na.length) layers.push({ id: 'na', name: 'NOTAM areas', kind: 'volume', items: na.map(function (a) { return naItem(a, T); }) });
    if (ta.length) layers.push({ id: 'ta', name: 'Areas from the AIP text', kind: 'volume', items: ta.map(taItem) });
    if (R.spec && layers.length) R.spec.layers = R.spec.layers.concat(layers);
    var mine = V.notams.filter(function (n) { return n.locs.indexOf(A.code) >= 0 || (n.area && near(n.area.ring)) || n.obstacles.some(function (o) { return C.distM(o.c, c) <= NEAR; }); });
    var rows = mine.map(function (n) { return ['NOTAM ' + (n.id || '?'), NOTAMTXT.CAT_NAME[n.cat] || n.cat, [n.subjTxt, n.condTxt].filter(Boolean).join(' — '), NOTAMTXT.stateAt(n, T), noteWhat(n), String(n.text || '').slice(0, 200)]; })
      .concat(ta.map(function (a) { return ['AIP text', a.type || '', a.desig + (a.name ? ' ' + a.name : ''), a.hours || '', (a.lower ? a.lower.txt : '?') + ' – ' + (a.upper ? a.upper.txt : '?'), 'from ' + (a.src || 'text')]; }));
    if (rows.length) R.notes = { title: 'NOTAM and AIP text around ' + A.code + ' (' + rows.length + ')', cols: ['Source', 'Category', 'What', 'Now', 'Read', 'Text'], rows: rows };
    if (E) {
      var cl = V.notams.filter(function (n) { return n.runway && n.runway.closed && n.runway.rwys.some(function (r) { return r.split('/').indexOf(E.desig) >= 0; }) && (!n.locs.length || n.locs.indexOf(A.code) >= 0) && NOTAMTXT.stateAt(n, T) !== 'off'; });
      if (cl.length) {
        R.verdict = { sev: 'error', txt: 'RWY ' + E.desig + ' CLOSED by NOTAM ' + cl.map(function (n) { return n.id; }).join(', ') + '. ' + (R.verdict ? R.verdict.txt : '') };
        R.kpis = [['CLOSED', 'NOTAM ' + cl[0].id]].concat(R.kpis || []);
        if (R.spec) R.spec.layers.push({ id: 'cl', name: 'Closed RWY ' + E.desig + ' (NOTAM)', kind: 'polygon', items: [{ ring: runwayRing(E.r.rm), color: '#e53935', opacity: 0.45, label: 'RWY ' + E.desig + ' CLOSED (NOTAM ' + cl[0].id + ')' }] });
      }
    }
    if (R.facts) R.facts = R.facts.concat([['NOTAM / AIP text', num(mine.length) + ' NOTAM and ' + num(ta.length) + ' area(s) from text around the aerodrome (' + num(NEAR / NMM, 0) + ' NM), shown on this map, 3D and report']]);
    return R;
  }
  function notamResult(ctx) {
    var T = Date.now(), list = V.notams, cats = {};
    list.forEach(function (n) { cats[n.cat] = (cats[n.cat] || 0) + 1; });
    var layers = [], pts = [];
    var obsItems = [];
    list.forEach(function (n) { n.obstacles.forEach(function (o, k) { pts.push(o.c); var top = o.elev !== null ? o.elev : o.groundElev !== undefined ? o.groundElev + (o.hgt || 0) : null; obsItems.push({ id: 'n' + n.id + k, c: o.c, top: top, hgt: o.hgt, type: o.type, kind: FLTSCENE.kindOf(o.type, n.text), sev: NOTAMTXT.stateAt(n, T) === 'on' ? 'warning' : 'info', label: 'NOTAM ' + n.id, sub: [n.subjTxt + (n.condTxt ? ' — ' + n.condTxt : ''), 'top ' + hU(top) + (o.hgt !== null ? ' · height ' + hU(o.hgt) : ''), o.lightsUs ? 'LIGHTS UNSERVICEABLE' : o.lit ? 'lighted ' + o.lit : ''], tag: '', notam: true }); }); });
    var areaItems = NOTAMTXT.notamAreas(list).map(function (a) { a.ring.forEach(function (p) { pts.push(p); }); return naItem(a, T); });
    var txtItems = V.textAreas.map(function (a) { a.ring.forEach(function (p) { pts.push(p); }); return taItem(a); });
    if (areaItems.length) layers.push({ id: 'na', name: 'NOTAM areas', kind: 'volume', items: areaItems });
    if (txtItems.length) layers.push({ id: 'ta', name: 'Areas read from the AIP text', kind: 'volume', items: txtItems });
    if (obsItems.length) layers.push({ id: 'obs', name: 'NOTAM obstacles', kind: 'obstacles', items: obsItems });
    var bb = pts.length ? bboxOf(pts, 3000) : null;
    var cols = ['NOTAM', 'Category', 'Code', 'Meaning', 'Locations', 'From', 'To', 'Now', 'What was read', 'Text'];
    var table = list.map(function (n) {
      var what = noteWhat(n);
      return [n.id || '?', NOTAMTXT.CAT_NAME[n.cat] || n.cat, n.code, [n.subjTxt, n.condTxt].filter(Boolean).join(' — '), n.locs.join(' '), n.from ? new Date(n.from).toISOString().slice(0, 16).replace('T', ' ') : '', n.to === Infinity ? 'PERM' : n.to ? new Date(n.to).toISOString().slice(0, 16).replace('T', ' ') + (n.est ? ' EST' : '') : '', NOTAMTXT.stateAt(n, T), what, n.text.replace(/\s+/g, ' ').slice(0, 220)];
    });
    var kpis = [[num(list.length), 'NOTAM read'], [num(cats.obstacle || 0), 'obstacles'], [num((cats.airspace || 0) + (cats.warning || 0)), 'airspace / warnings'], [num(cats.runway || 0), 'runways'], [num(V.textAreas.length), 'areas from the AIP text']];
    var v = { sev: list.length || V.textAreas.length ? 'info' : 'ok', txt: list.length || V.textAreas.length ? 'The obstacles and areas read are used by every analysis of this section. "Add to the data loaded" also puts them in the Obstacles workspace, the Map tab and the exports.' : 'Paste NOTAMs (ICAO or FAA format) or the text of an AIP area list (ENR 5.1), or drop a .txt / .pdf briefing.' };
    return { title: 'NOTAM & areas', verdict: v, kpis: kpis, spec: bb ? spec(layers, bb, null, [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2], 0, 'NOTAM & areas') : null, profile: null, cols: cols, table: table, rows: list,
      extra: V.textAreas.length ? { title: 'Areas read from the AIP text', cols: ['Designator', 'Type', 'Name', 'Upper', 'Lower', 'Hours', 'Lateral limits', 'Not read'], rows: V.textAreas.map(function (a) { return [a.desig, a.type, a.name, a.upper ? a.upper.txt : '', a.lower ? a.lower.txt : '', a.hours, a.circle ? 'circle ' + num(a.circle.rNM, 1) + ' NM' : (a.ring.length - 1) + ' points', a.problems.join('; ')]; }) } : null,
      facts: [['NOTAM', num(list.length) + ' (' + Object.keys(cats).map(function (k) { return cats[k] + ' ' + (NOTAMTXT.CAT_NAME[k] || k).toLowerCase(); }).join(', ') + ')'], ['Areas from text', num(V.textAreas.length)]], method: METHOD.notam };
  }
  // the NOTAM obstacles (a table) and the areas (AIXM) as files of the data loaded
  async function addToData(ctx) {
    var A = window.__AIXM, files = [], stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
    if (V.notams.some(function (n) { return n.obstacles.length; })) {
      var csv = NOTAMTXT.obstaclesCsv(V.notams.map(function (n) { return Object.assign({}, n, { obstacles: n.obstacles.map(function (o) { return Object.assign({}, o, { elev: o.elev !== null ? o.elev : o.groundElev !== undefined ? o.groundElev + (o.hgt || 0) : null }); }) }); }));
      files.push(new File([csv], 'NOTAM_obstacles_' + stamp + '.csv', { type: 'text/csv' }));
    }
    var areas = NOTAMTXT.notamAreas(V.notams).concat(V.textAreas);
    if (areas.length) files.push(new File([NOTAMTXT.areasAixm(areas, { source: 'NOTAM / AIP text read ' + stamp })], 'Areas_from_NOTAM_and_AIP_text_' + stamp + '.xml', { type: 'text/xml' }));
    if (!files.length) { ctx.toast('Nothing to add: no obstacle or area read.', 5000); return; }
    await A.addFiles(files); await A.extractAll({ stay: true });
    V.notamsAdded = true; obsCache.sig = '';
    ctx.toast(files.length + ' file(s) added to the data loaded: ' + files.map(function (f) { return f.name; }).join(', '), 7000);
    A.go('digital', { sec: 'flt' });
  }

  /* ------------------------------------------------------------ method notes (reports) */
  var METHOD = {
    to: ['Annex 4 (Aerodrome Obstacle Chart — ICAO Type A): take-off flight path area 180 m wide at the end of the take-off distance available (runway or clearway), widening 0.25 D to 1 800 m, ' + '10 km (5.4 NM); obstacles above a 1.2 % plane from the same origin are charted, except those in the shadow of another (horizontal for the first 300 m, then 1.2 %); 12 km (6.5 NM) with a 1.0 % plane.',
      'Net take-off flight path (Annex 6 Part I Attachment C, operator practice): from 35 ft above the end of TODA; an obstacle within 90 m + 0.125 D (at most the lateral limit set) must be cleared by 35 ft; the gradient each obstacle needs is (height above the DER + 35 ft − 35 ft) / distance.',
      'PANS-OPS (Doc 8168 Vol II): obstacle identification surface 2.5 % from 5 m above the DER, area 150 m each side splaying 15°; an obstacle above it needs a procedure design gradient (height − 5 m) / distance + 0.8 %, at least 3.3 %; obstacles up to 60 m above the DER are close-in obstacles.',
      'The gradients available are those set in Settings; the aircraft flight manual and the operator\'s performance data give the real ones (weight, temperature, wind, turns, acceleration segment are not modelled).'],
    app: ['Annex 14 Vol I Table 4-1: approach surface of the runway end by code number and approach type (inner edge, distance from the threshold, divergence, sections 1 and 2 and the horizontal section, 150 m at most).',
      'Glide path: the ILS glide path angle in the data (else 3°) through the threshold crossing height; the clearance is the glide path height over the obstacle top.',
      'Visual segment surface (PANS-OPS, indicative): from 60 m before the threshold, ±75 m, splay 15 %, slope glide path − 1.12°.', 'Threshold displacement: the distance that would bring the penetration under the slope of its section (indicative).'],
    rwy: ['Every runway direction is assessed for departure (take-off, as in the Take-off analysis) and arrival (as in the Approach analysis) with the settings.', 'Annex 14 obstacle limitation surfaces of the aerodrome (OLS module); the take-off climb surface penetration gives the TODA reduction that would clear it.', 'NOTAM: closures, declared distances, works and lights of the runway.'],
    etod: ['ICAO Annex 15 and PANS-AIM (Doc 10066) electronic terrain and obstacle data areas: Area 1 the State; Area 2a the runway strip and any clearway (collection surface 3 m above the runway, at the elevation of the nearest runway end over a clearway); Area 2b from the ends of 2a in the direction of departure, 10 km (5.4 NM), splay 15 % (1.2 % from the runway end); Area 2c within 10 km (5.4 NM) of 2a (1.2 % from the edge of 2a); Area 2d to 45 km (24.3 NM) from the ARP or the TMA boundary (100 m above the ground); Area 3 90 m from the runway centre line and 50 m from the rest of the movement area (0.5 m); Area 4 CAT II / III runways, 900 m before the threshold, ±60 m.',
      'Accuracy required: PANS-AIM Appendix 1 Table A1-6 (Area 1 50 m / 30 m, Area 2 5 m / 3 m, Area 3 0.5 m / 0.5 m, Area 4 2.5 m / 1 m); the strictest area of an obstacle applies.', 'Area 2c is drawn as the outline 10 km (5.4 NM) around Area 2a (convex hull of all runways).'],
    route: ['Route: aerodromes, significant points and navaids of the data loaded, coordinates (2512N05530E, 251230N0553015E), ATS routes between two of their points; levels F350 / A050 / S1130 / M0610 (or /F350 after a point).',
      'Corridor: ± the half width set around each leg; minimum safe altitude = highest obstacle or terrain + the clearance set, rounded up to 100 ft.', 'Areas: prohibited, restricted, danger, reserved / segregated, military, warning, alert areas and ADIZ of the AIXM data (hours evaluated with the 4D timesheets), the NOTAM areas and activations, the areas read from AIP text; the route altitude is compared with the vertical limits (QNH / FL not converted).'],
    notam: ['ICAO NOTAM format (Annex 15 / PANS-AIM Appendix 3) and the FAA domestic / FDC formats; the NOTAM codes decoded with ICAO Doc 8126 (subject and condition).', 'From item E): positions (DDMMSS / DDMM / DMS), heights (AGL / AMSL; FAA: the first height is MSL), lighting, marking, radius, polygons, circles and arcs, airspace designators, runway designators, declared distances; schedules of item D (days and hours).', 'A NOTAM obstacle given with a height only gets its elevation from the terrain.']
  };

  /* ------------------------------------------------------------ the page */
  async function compute(ctx) {
    var ads = adList(ctx), A = ads.filter(function (a) { return a.key === V.ad; })[0] || ads[0] || null;
    if (A) V.ad = A.key;
    if (V.mode === 'notam') return notamResult(ctx);
    if (V.mode === 'route') return route(ctx);
    if (!A) return { empty: true, noAd: true };
    if (V.mode === 'rwy') return withNotes(await runwayImpact(ctx, A), A, null);
    if (V.mode === 'etod') return withNotes(await etodAreas(ctx, A), A, null);
    var ends = endsOf(A), E = ends.filter(function (x) { return x.key === V.end; })[0] || ends[0];
    if (!E) return { empty: true, noAd: true };
    V.end = E.key;
    return withNotes(V.mode === 'app' ? await approach(ctx, A, E) : await takeoff(ctx, A, E), A, E);
  }
  var SEVC = { error: 'err', warning: 'warn', caution: 'warn', ok: 'ok', info: 'info' };
  function render(host, ctx) {
    var ads = adList(ctx), A = ads.filter(function (a) { return a.key === V.ad; })[0] || ads[0] || null, ends = A ? endsOf(A) : [];
    var needAd = /^(to|app|rwy|etod)$/.test(V.mode), needEnd = /^(to|app)$/.test(V.mode);
    var h = '<div class="flt">' +
      '<div class="flt-head"><div><h2 class="flt-h">Flight &amp; obstacle analysis</h2><div class="muted flt-sub">Take-off, approach, runway, ICAO eTOD areas, route and airspace, NOTAM — on all the data loaded. Indicative, not for operational use.</div></div>' +
      '<div class="flt-acts"><button class="btn small" data-fl="report" aria-haspopup="menu">Report ▾</button><div class="flt-menu" hidden role="menu">' +
      [['pdf', 'Assessment report (PDF)'], ['print', 'Print the report'], ['copy', 'Copy for e-mail (result, pictures, tables)'], ['eml', 'E-mail draft (.eml)'], ['xlsx', 'Excel workbook'], ['csv', 'CSV table'], ['kml', 'KML (Google Earth)'], ['geojson', 'GeoJSON (GIS)'], ['dxf', 'DXF — 3D CAD'], ['png', 'Picture of the view (PNG)']].map(function (x) { return '<button role="menuitem" data-rep="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div></div></div>' +
      '<div class="flt-ctx"><div class="pill-tabs" role="tablist">' + MODES.map(function (m) { return '<button role="tab" data-mode="' + m[0] + '" class="' + (V.mode === m[0] ? 'active' : '') + '">' + m[1] + (m[0] === 'notam' && V.notams.length ? ' <span class="chip info">' + V.notams.length + '</span>' : '') + '</button>'; }).join('') + '</div>' +
      (needAd && ads.length ? '<select data-fl="ad" aria-label="Aerodrome">' + ads.map(function (a) { return '<option value="' + esc(a.key) + '"' + (A && a.key === A.key ? ' selected' : '') + '>' + esc(a.code + (a.name ? ' — ' + a.name : '')) + '</option>'; }).join('') + '</select>' : '') +
      (needEnd && ends.length ? '<select data-fl="end" aria-label="Runway">' + ends.map(function (x) { return '<option value="' + esc(x.key) + '"' + (x.key === V.end ? ' selected' : '') + '>' + (V.mode === 'to' ? 'Departure ' : 'Landing ') + esc(x.label) + '</option>'; }).join('') + '</select>' : '') +
      '<button class="btn small ghost" data-fl="settings" aria-expanded="' + V.settings + '">⚙ Settings</button></div>' +
      '<div class="flt-set"' + (V.settings ? '' : ' hidden') + '>' + settingsHtml(A, ends) + '</div>' +
      (V.mode === 'route' ? routeHtml() : '') +
      (V.mode === 'notam' ? notamInputHtml() : '<details class="flt-ntbox"' + (V.ntOpen ? ' open' : '') + '><summary>NOTAM, AIP supplement or area text' + (V.notams.length || V.textAreas.length ? ' <span class="chip info">' + num(V.notams.length) + ' NOTAM · ' + num(V.textAreas.length) + ' area(s) read</span>' : '') + ' <span class="muted">— paste here: shown with this analysis, on the same map</span></summary>' + notamInputHtml() + '</details>') +
      '<div class="flt-out"><div class="flt-verdict"><span class="spinner"></span> Working…</div></div></div>';
    host.innerHTML = h;
    bind(host, ctx, A);
    var out = host.querySelector('.flt-out');
    compute(ctx).then(function (R) { V.last = R; paint(out, R, ctx); }).catch(function (e) { console.error(e); out.innerHTML = '<div class="flt-verdict sev-err"><b>The analysis failed:</b> ' + esc(e.message) + '</div>'; });
  }
  function settingsHtml(A, ends) {
    var st = V.set, sids = A && /^(to)$/.test(V.mode) ? sidPaths(A, ends.filter(function (x) { return x.key === V.end; })[0] || ends[0] || { desig: '' }) : [];
    function f(label, inner, hint) { return '<label class="flt-f"><span>' + label + '</span>' + inner + (hint ? '<em>' + hint + '</em>' : '') + '</label>'; }
    function n(k, step, w) { return '<input type="number" data-set="' + k + '" value="' + esc(st[k]) + '" step="' + (step || 1) + '" style="width:' + (w || 80) + 'px">'; }
    function sel(k, opts) { return '<select data-set="' + k + '">' + opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(st[k]) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>'; }
    var g = [];
    if (V.mode === 'to' || V.mode === 'rwy') g.push(f('Engines', sel('engines', [[2, 'Two'], [3, 'Three'], [4, 'Four']]), 'sets the minimum gradients'), f('Net gradient available', n('net', 0.1) + ' %', 'from the aircraft performance data'), f('Gross gradient', n('gross', 0.1) + ' %'),
      f('Lateral limit', sel('lat', [[300, '±300 m'], [600, '±600 m'], [900, '±900 m']])), f('Distance', sel('len', [[10000, '5.4 NM (10 km), 1.2 % (Type A)'], [12000, '6.5 NM (12 km), 1.0 %']])));
    if (V.mode === 'to') g.push(f('Departure path', sel('path', [['straight', 'Straight out']].concat(sids.map(function (p) { return [p.key, 'Along ' + p.label]; })))));
    if (V.mode === 'app' || V.mode === 'rwy') g.push(f('Glide path angle', n('gpa', 0.1) + '°', '0: from the ILS, else 3°'), f('Threshold crossing height', st.unit === 'm' ? n('tch', 1) + ' m' : '<input type="number" data-set="tchft" value="' + Math.round(st.tch / FT) + '" step="1" style="width:80px"> ft'));
    if (V.mode === 'route') g.push(f('Corridor', '±' + n('half', 1, 60) + ' NM'), f('Clearance', sel('clr', [[1000, '1 000 ft'], [2000, '2 000 ft (mountainous)']])));
    g.push(f('Terrain', sel('terrain', [[true, 'Used (file, online, built-in)'], [false, 'Not used']])), f('Heights in', sel('unit', [['ft', 'feet'], ['m', 'metres']])));
    return '<div class="flt-grid">' + g.join('') + '</div>';
  }
  function routeHtml() {
    return '<div class="flt-route"><input type="text" data-rt="text" aria-label="Route" placeholder="Route, e.g. OTHH DCT ALSEM UL768 DESDI OMDB, or 2512N05530E 2430N05410E" value="' + esc(V.route.text) + '">' +
      '<input type="text" data-rt="fl" aria-label="Cruising level" placeholder="FL" title="Cruising level (flight level), e.g. 350" value="' + esc(V.route.fl) + '" style="width:64px">' +
      '<input type="text" data-rt="time" aria-label="Time of the flight (UTC)" placeholder="Time UTC (now)" title="Time of the flight, UTC: 2026-10-14 06:30" value="' + esc(V.route.time) + '" style="width:150px"><button class="btn small" data-fl="route">Check</button></div>';
  }
  function notamInputHtml() {
    return '<div class="flt-notam"><textarea data-nt="text" rows="4" aria-label="NOTAM or AIP area text" placeholder="Paste NOTAMs (ICAO: (A1234/26 NOTAMN Q) … E) …) or FAA: !ORD 10/123 …) or the text of an AIP area list (ENR 5.1), then Read.">' + esc(V.notamText) + '</textarea>' +
      '<div class="flt-nact"><button class="btn small" data-fl="nread">Read</button><label class="btn small ghost">Open .txt / .pdf<input type="file" accept=".txt,.pdf,.text" multiple hidden data-nt="file" aria-label="Open NOTAM or AIP text files"></label>' +
      (V.notams.length || V.textAreas.length ? '<button class="btn small ghost" data-fl="nadd" title="Also show them in the Obstacles workspace, the Map tab and the exports">Add to the data loaded</button><button class="btn small ghost" data-fl="nclear">Clear</button>' : '') + '<span class="muted flt-nst"></span></div></div>';
  }
  function kpiHtml(k) { return '<div class="flt-kpi"><b>' + esc(k[0]) + '</b><span>' + esc(k[1]) + '</span></div>'; }
  function paint(out, R, ctx) {
    if (V.handle) { try { V.handle.destroy(); } catch (e) { /* gone */ } V.handle = null; }
    if (R.empty) {
      out.innerHTML = '<div class="flt-verdict sev-info">' + (R.noAd ? 'Load an AIP data set with the aerodrome and its runways (threshold positions) — the obstacle data alone is not enough for this analysis.' : 'Enter a route of at least two points the data loaded knows (aerodromes, points, navaids, coordinates).' + (R.miss && R.miss.length ? ' Not found: ' + esc(R.miss.join(' ')) : '')) + '</div>';
      return;
    }
    var v = R.verdict || { sev: 'info', txt: '' };
    var h = '<div class="flt-verdict sev-' + (SEVC[v.sev] || 'info') + '"><div class="flt-vt"><span class="flt-dot"></span><b>' + esc(v.txt) + '</b></div><div class="flt-kpis">' + (R.kpis || []).map(kpiHtml).join('') + '</div></div>';
    if (R.spec) h += '<div class="flt-viewer"><div class="flt-vbar"><div class="pill-tabs">' + VIEWS.filter(function (x) { return x[0] !== 'profile' || R.profile; }).map(function (x) { return '<button data-fv="' + x[0] + '" class="' + (V.view === x[0] || (V.view === 'profile' && !R.profile && x[0] === 'map') ? 'active' : '') + '">' + x[1] + '</button>'; }).join('') + '</div><span class="sp"></span>' +
      '<button class="btn small ghost" data-fl="pop" title="Open this view in a separate window">⤢ Window</button><button class="btn small ghost" data-fl="vprint" title="Print this view">🖨</button></div><div class="flt-stage"></div><div class="flt-legend">' + FLTSCENE.legendHtml(kindsIn(R.spec)) + '</div></div>';
    if (R.extra) h += '<details class="flt-more" open><summary>' + esc(R.extra.title) + '</summary>' + tableHtml(R.extra.cols, R.extra.rows, 50) + '</details>';
    if (R.notes) h += '<details class="flt-more" open><summary>' + esc(R.notes.title) + '</summary>' + tableHtml(R.notes.cols, R.notes.rows, 50) + '</details>';
    h += '<details class="flt-more"' + (R.table.length && R.table.length <= 30 ? ' open' : '') + '><summary>' + (V.mode === 'notam' ? 'NOTAM' : V.mode === 'route' ? 'Areas crossed' : V.mode === 'rwy' ? 'Runway directions' : 'Obstacles') + ' <span class="chip">' + num(R.table.length) + '</span></summary>' + (R.table.length ? tableHtml(R.cols, R.table, V.all ? 5000 : 15, true) : '<p class="muted">None.</p>') + '</details>';
    h += '<details class="flt-more"><summary>Data used and method</summary><table class="flt-kv">' + (R.facts || []).map(function (f) { return '<tr><th>' + esc(f[0]) + '</th><td>' + esc(f[1]) + '</td></tr>'; }).join('') + '</table><ul class="flt-meth">' + (R.method || []).map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') + '</ul><p class="muted">' + esc(NOTE) + '</p></details>';
    out.innerHTML = h;
    if (R.spec) showView(out, R, ctx);
  }
  function kindsIn(sp) { var k = {}; (sp.layers || []).forEach(function (l) { if (l.kind === 'obstacles') l.items.forEach(function (o) { k[o.kind] = 1; }); }); return Object.keys(k); }
  function tableHtml(cols, rows, max, more) {
    var shown = rows.slice(0, max);
    return '<div class="flt-tw"><table class="flt-t"><thead><tr>' + cols.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') + '</tr></thead><tbody>' + shown.map(function (r, i) {
      var last = String(r[r.length - 1]), cls = /NOT CLEAR|MUST NOT|ACCURACY NOT MET|ABOVE|BELOW|CLOSED/.test(last) ? 'bad' : /CHARTED|CHECK|caution|not given/i.test(last) ? 'warn' : '';
      return '<tr class="' + cls + '" data-row="' + i + '">' + r.map(function (c) { return '<td>' + esc(c) + '</td>'; }).join('') + '</tr>';
    }).join('') + '</tbody></table></div>' + (more && rows.length > max ? '<button class="btn small ghost" data-fl="all">Show all ' + num(rows.length) + '</button>' : '');
  }
  function showView(out, R, ctx) {
    var stage = out.querySelector('.flt-stage'), view = V.view === 'profile' && !R.profile ? 'map' : V.view;
    if (V.handle) { try { V.handle.destroy(); } catch (e) { /* gone */ } V.handle = null; }
    stage.className = 'flt-stage v-' + view;
    if (view === 'profile') { stage.innerHTML = FLTSCENE.profile(R.profile); return; }
    if (view === 'map') { V.handle = FLTSCENE.map(stage, R.spec, { pick: function (o) { pickRow(out, o); }, base: function (k) { V.set.base = k; save(); } }); return; }
    var sp = Object.assign({}, R.spec, { style: view === 'holo' ? 'holo' : 'solid', compact: true, exag: R.spec.exag || 3 });
    V.handle = FLTSCENE.view3d(stage, sp, { pick: function (o) { pickRow(out, o); } });
  }
  function pickRow(out, o) {
    var R = V.last; if (!R || !R.rows) return;
    var i = R.rows.findIndex(function (r) { return (r.ob && r.ob.id === o.id) || r.id === o.id; });
    var det = out.querySelectorAll('details.flt-more'), d = det[det.length - 2];
    if (i < 0 || !d) return;
    if (i >= 15 && !V.all) { V.all = true; paint(out, R); return; }
    d.open = true;
    var tr = d.querySelector('tr[data-row="' + i + '"]');
    out.querySelectorAll('tr.sel').forEach(function (x) { x.classList.remove('sel'); });
    if (tr) { tr.classList.add('sel'); tr.scrollIntoView({ block: 'nearest' }); }
  }
  function bind(host, ctx, A) {
    var rer = function () { render(host, ctx); };
    var nb = host.querySelector('.flt-ntbox');
    if (nb) nb.addEventListener('toggle', function () { V.ntOpen = nb.open; });
    host.onclick = async function (e) {
      var b = e.target.closest('[data-mode],[data-fl],[data-rep],[data-fv]');
      if (!b) { var m0 = host.querySelector('.flt-menu'); if (m0 && !e.target.closest('.flt-acts')) m0.hidden = true; return; }
      if (b.hasAttribute('data-mode')) { V.mode = b.getAttribute('data-mode'); V.all = false; rer(); return; }
      if (b.hasAttribute('data-fv')) { V.view = b.getAttribute('data-fv'); var out = host.querySelector('.flt-out'); out.querySelectorAll('[data-fv]').forEach(function (x) { x.classList.toggle('active', x === b); }); if (V.last) showView(out, V.last, ctx); return; }
      if (b.hasAttribute('data-rep')) { host.querySelector('.flt-menu').hidden = true; try { await report(b.getAttribute('data-rep'), ctx); } catch (er) { ctx.toast('Report failed: ' + er.message, 7000); console.error(er); } return; }
      var k = b.getAttribute('data-fl');
      if (k === 'report') { var mn = host.querySelector('.flt-menu'); mn.hidden = !mn.hidden; return; }
      if (k === 'settings') { V.settings = !V.settings; host.querySelector('.flt-set').hidden = !V.settings; b.setAttribute('aria-expanded', V.settings); return; }
      if (k === 'all') { V.all = true; paint(host.querySelector('.flt-out'), V.last, ctx); return; }
      if (k === 'route') { V.route.text = host.querySelector('[data-rt="text"]').value; V.route.fl = host.querySelector('[data-rt="fl"]').value; V.route.time = host.querySelector('[data-rt="time"]').value; rer(); return; }
      if (k === 'nread') { V.ntOpen = true; var ta = host.querySelector('[data-nt="text"]'); V.notamText = ta.value; var res = await readText(ta.value, 'pasted text'); V.notamText = ''; ctx.toast(res.notams + ' NOTAM and ' + res.areas + ' area(s) read.', 5000); rer(); return; }
      if (k === 'nadd') { await addToData(ctx); return; }
      if (k === 'nclear') { V.notams = []; V.textAreas = []; V.notamsAdded = false; obsCache.sig = ''; rer(); return; }
      if (k === 'pop') { popout(ctx); return; }
      if (k === 'vprint') { printView(); return; }
    };
    host.onchange = async function (e) {
      var t = e.target;
      if (t.getAttribute('data-fl') === 'ad') { V.ad = t.value; V.end = ''; rer(); return; }
      if (t.getAttribute('data-fl') === 'end') { V.end = t.value; rer(); return; }
      if (t.getAttribute('data-nt') === 'file') { V.ntOpen = true; var fs = Array.prototype.slice.call(t.files || []); t.value = ''; var tot = { notams: 0, areas: 0 }; for (var i = 0; i < fs.length; i++) { try { var r = await readFile(fs[i]); tot.notams += r.notams; tot.areas += r.areas; } catch (er) { ctx.toast(fs[i].name + ': ' + er.message, 7000); } } ctx.toast(tot.notams + ' NOTAM and ' + tot.areas + ' area(s) read.', 5000); rer(); return; }
      var k = t.getAttribute('data-set');
      if (!k) return;
      var v = t.type === 'number' ? parseFloat(t.value) : t.value;
      if (k === 'terrain') v = t.value === 'true';
      if (k === 'lat' || k === 'len' || k === 'clr' || k === 'engines') v = +v;
      if (k === 'tchft') { k = 'tch'; v = Math.round(v * FT * 10) / 10; }
      V.set[k] = v;
      if (k === 'engines') { V.set.gross = { 2: 2.4, 3: 2.7, 4: 3.0 }[v]; V.set.net = { 2: 1.6, 3: 1.8, 4: 2.0 }[v]; }
      save(); rer();
    };
    host.querySelectorAll('[data-rt]').forEach(function (inp) { inp.onkeydown = function (e) { if (e.key === 'Enter') host.querySelector('[data-fl="route"]').click(); }; });
    var dz = host.querySelector('.flt-notam');
    if (dz) {
      ['dragenter', 'dragover'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); e.stopPropagation(); dz.classList.add('over'); }); });
      ['dragleave', 'drop'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); e.stopPropagation(); dz.classList.remove('over'); }); });
      dz.addEventListener('drop', async function (e) { var fs = Array.prototype.slice.call(e.dataTransfer.files || []); for (var i = 0; i < fs.length; i++) { try { await readFile(fs[i]); } catch (er) { ctx.toast(fs[i].name + ': ' + er.message, 7000); } } rer(); });
    }
  }

  /* ------------------------------------------------------------ windows, print, reports */
  function popout(ctx) {
    var R = V.last; if (!R || !R.spec) return;
    var view = V.view === 'profile' ? 'map' : V.view, sp = Object.assign({}, R.spec, { style: view === 'holo' ? 'holo' : 'solid', compact: false, exag: R.spec.exag || 3 });
    var w = FLTSCENE.popout(view === 'map' ? 'map' : '3d', sp, { source: LAZY.text('src-fltscene'), style: sp.style, exag: sp.exag });
    if (!w) ctx.toast('The browser blocked the new window. Allow pop-ups for this file and try again.', 7000);
  }
  function printView() {
    var R = V.last; if (!R) return;
    if (V.view === 'profile' && R.profile) { var w = window.open('', '_blank', 'width=1100,height=760'); if (!w) return; w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>' + esc(R.title) + '</title><style>body{font:13px Segoe UI,Arial,sans-serif;margin:12mm}@page{size:A4 landscape}</style></head><body><h2>' + esc(R.title) + '</h2>' + FLTSCENE.profile(R.profile) + '<p style="color:#555">' + esc(NOTE) + '</p></body></html>'); w.document.close(); setTimeout(function () { w.print(); }, 300); return; }
    if (V.handle && V.handle.png) { FLTSCENE.printPic(document, V.handle.png(), { title: R.title, sub: R.verdict ? R.verdict.txt : '', note: NOTE }); return; }
    window.print();
  }
  function C1(t) { return { t: t === undefined || t === null ? '' : String(t) }; }
  async function scopeOf(R) {
    var secs = [];
    secs.push({ title: 'Result', blocks: [{ kind: 'note', text: (R.verdict ? R.verdict.txt : '') + '  ' + (R.kpis || []).map(function (k) { return k[1] + ': ' + k[0]; }).join(' · ') },
      { kind: 'kv', title: 'Data and assumptions', rows: (R.facts || []).map(function (f) { return { label: f[0], cells: [C1(f[1])] }; }) }] });
    var pics = [];
    if (V.handle && V.handle.png && V.view !== 'map') pics.push({ kind: 'image', src: V.handle.png(), h: 0.6, caption: (V.view === 'holo' ? 'Hologram' : '3D') + ' view: ' + R.title });
    try {
      var sp = R.spec, ly = function (id) { return (sp.layers || []).filter(function (l) { return l.id === id || l.kind === id; }); };
      if (sp) {
        var areas = [].concat.apply([], ly('polygon').map(function (l) { return l.items.map(function (p) { return p.ring; }); })).concat([].concat.apply([], ly('volume').map(function (l) { return l.items.map(function (p) { return p.ring; }); }))).slice(0, 60);
        var points = [].concat.apply([], ly('obstacles').map(function (l) { return l.items.slice(0, 400).map(function (o) { return { c: o.c, color: FLTSCENE.SEV[o.sev] || '#546e7a', r: o.sev === 'error' ? 6 : 4, kind: o.kind || FLTSCENE.kindOf(o.type, o.label), lit: o.lit, label: o.tag ? o.tag.split('\n')[0] : '', ring: o.sev === 'error' }; }); }))
          .sort(function (p, q) { return q.c[1] - p.c[1]; });
        var paths = [].concat.apply([], ly('path').map(function (l) { return l.items.map(function (p) { return { coords: p.pts, color: p.color }; }); }));
        var rw = [].concat.apply([], ly('runway').map(function (l) { return l.items.map(function (r) { return [r.ring[0], r.ring[1]]; }); }));
        var pic = await STUDY.picture({ bbox: sp.bbox, w: 1300, h: 820, areas: areas, points: points, paths: paths, runways: rw, title: R.title });
        if (pic) pics.unshift({ kind: 'image', src: pic, h: 820 / 1300, caption: 'Map: ' + R.title + ' — obstacles coloured by result (red: not clear / above, orange: charted / check, yellow: caution, green: clear).' });
      }
    } catch (e) { /* no picture */ }
    if (R.profile) { var pp = await FLTSCENE.svgPng(FLTSCENE.profile(R.profile), 1300, 450); if (pp) pics.push({ kind: 'image', src: pp, h: 450 / 1300, caption: R.profile.title }); }
    if (pics.length) secs.push({ title: 'Pictures', blocks: pics });
    if (R.notes) secs.push({ title: R.notes.title, blocks: [{ kind: 'table', title: R.notes.title, cols: R.notes.cols, rows: R.notes.rows.map(function (r) { return r.map(C1); }) }] });
    if (R.extra) secs.push({ title: R.extra.title, blocks: [{ kind: 'table', title: R.extra.title, cols: R.extra.cols, rows: R.extra.rows.map(function (r) { return r.map(C1); }) }] });
    secs.push({ title: V.mode === 'notam' ? 'NOTAM' : V.mode === 'route' ? 'Areas crossed' : V.mode === 'rwy' ? 'Runway directions' : 'Obstacles', blocks: [{ kind: 'table', title: '', cols: R.cols, rows: R.table.map(function (r) { return r.map(C1); }) }] });
    secs.push({ title: 'Method and references', blocks: (R.method || []).map(function (m) { return { kind: 'note', text: m }; }).concat([{ kind: 'note', text: NOTE }]) });
    return { title: R.title, sub: 'Flight & obstacle analysis · ' + new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC · indicative, not for operational use', ds: null, sections: secs };
  }
  async function report(kind, ctx) {
    var R = V.last; if (!R || R.empty) { ctx.toast('Nothing to report yet.', 4000); return; }
    var base = EXPORTS.safeName(R.title);
    if (kind === 'png') { if (V.handle && V.handle.png) { var a = document.createElement('a'); a.href = V.handle.png(); a.download = base + '.png'; document.body.appendChild(a); a.click(); a.remove(); } else ctx.toast('Open the 3D or Hologram view for a picture, or use the PDF report.', 5000); return; }
    if (kind === 'kml' || kind === 'geojson') { EXPORTS.download(base + (kind === 'kml' ? '.kml' : '.geojson'), new Blob([kind === 'kml' ? toKml(R) : JSON.stringify(toGeoJSON(R), null, 1)], { type: kind === 'kml' ? 'application/vnd.google-earth.kml+xml' : 'application/geo+json' })); return; }
    if (kind === 'dxf') { EXPORTS.download(base + '_3D.dxf', new Blob([toDxf(R)], { type: 'application/dxf' })); return; }
    ctx.toast('Preparing the report…', 2500);
    var sc = await scopeOf(R);
    if (kind === 'copy' || kind === 'eml') {
      var m = EXPORTS.emailContent(sc, { intro: (R.verdict ? R.verdict.txt + ' ' : '') + 'The figures, pictures and tables of the flight and obstacle analysis follow (' + NOTE + ')', maxRows: 200 });
      m.subject = R.title + ' — flight & obstacle analysis';
      if (kind === 'copy') { var ok = await EXPORTS.copyRich(m.html, m.text); ctx.toast(ok ? 'Copied: paste it into an e-mail (result, pictures and tables).' : 'The browser did not allow the copy: use "E-mail draft (.eml)".', 6000); }
      else EXPORTS.download(base + '.eml', emlRelated(m));
      return;
    }
    if (kind === 'pdf') EXPORTS.exportPDF(sc); else if (kind === 'print') EXPORTS.print(sc); else if (kind === 'xlsx') EXPORTS.exportExcel(sc); else if (kind === 'csv') EXPORTS.exportCSV(sc);
  }
  // an e-mail draft whose pictures are attached and shown in the text (multipart/related, cid:), as mail programs expect
  function emlRelated(m) {
    var imgs = [], html = m.html.replace(/src="data:(image\/(?:png|jpeg));base64,([^"]+)"/g, function (all, type, data) { imgs.push({ type: type, data: data }); return 'src="cid:pic' + imgs.length + '@aixm"'; });
    function b64(str) { var bytes = new TextEncoder().encode(str), bin = ''; for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(bin).replace(/.{76}/g, '$&\r\n'); }
    var alt = '=_alt_' + Math.random().toString(36).slice(2), rel = '=_rel_' + Math.random().toString(36).slice(2);
    var eml = 'X-Unsent: 1\r\nSubject: =?UTF-8?B?' + b64(m.subject).replace(/\r\n/g, '') + '?=\r\nMIME-Version: 1.0\r\nContent-Type: multipart/alternative; boundary="' + alt + '"\r\n\r\n' +
      '--' + alt + '\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n' + b64(m.text) + '\r\n' +
      '--' + alt + '\r\nContent-Type: multipart/related; boundary="' + rel + '"\r\n\r\n' +
      '--' + rel + '\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n' + b64('<!doctype html><html><head><meta charset="utf-8"><title>' + esc(m.subject) + '</title></head><body>' + html + '</body></html>') + '\r\n' +
      imgs.map(function (im, i) { return '--' + rel + '\r\nContent-Type: ' + im.type + '; name="picture' + (i + 1) + (im.type === 'image/png' ? '.png' : '.jpg') + '"\r\nContent-Transfer-Encoding: base64\r\nContent-ID: <pic' + (i + 1) + '@aixm>\r\nContent-Disposition: inline; filename="picture' + (i + 1) + (im.type === 'image/png' ? '.png' : '.jpg') + '"\r\n\r\n' + im.data.replace(/.{76}/g, '$&\r\n') + '\r\n'; }).join('') +
      '--' + rel + '--\r\n--' + alt + '--\r\n';
    return new Blob([eml], { type: 'message/rfc822' });
  }
  // GIS: every layer of the scene as features with their figures
  function toGeoJSON(R) {
    var fs = [];
    (R.spec ? R.spec.layers : []).forEach(function (l) {
      (l.items || []).forEach(function (it) {
        var g = null, p = { layer: l.name, label: it.label || '', details: (it.sub || []).join(' | ') };
        if (l.kind === 'obstacles') { g = { type: 'Point', coordinates: [it.c[0], it.c[1], it.top] }; p.result = it.sev; p.kind = it.kind; p.top_m = it.top; p.height_m = it.hgt; }
        else if (it.ring) g = { type: 'Polygon', coordinates: [it.ring.map(function (q) { return [q[0], q[1]]; })] };
        else if (it.pts && l.kind === 'surface') g = { type: 'Polygon', coordinates: [it.pts.map(function (q) { return [q[0], q[1], q[2]]; })] };
        else if (it.pts) g = { type: 'LineString', coordinates: it.pts.map(function (q) { return q.length > 2 ? [q[0], q[1], q[2]] : [q[0], q[1]]; }) };
        else if (it.a && it.b) { g = { type: 'LineString', coordinates: [it.a, it.b] }; p.label = (it.label || []).join(' · '); }
        else if (it.c && l.kind === 'point') g = { type: 'Point', coordinates: [it.c[0], it.c[1]] };
        else if (it.c && it.r) { g = { type: 'LineString', coordinates: FLTCALC.arcPts(it.c, it.r, it.b0 || 0, it.b1 || 360).map(function (q) { return [q[0], q[1]]; }) }; }
        if (g) fs.push({ type: 'Feature', geometry: g, properties: p });
      });
    });
    return { type: 'FeatureCollection', name: R.title, generator: EXPORTS.CREDIT, note: NOTE, features: fs };
  }
  function xe(t) { return String(t === undefined || t === null ? '' : t).replace(/[<>&"]/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]; }); }
  function toKml(R) {
    var gj = toGeoJSON(R), col = { error: 'ff3939e5', warning: 'ff008cfb', caution: 'ff35d8fd', ok: 'ff47a043', info: 'ffaea490' };
    var by = {};
    gj.features.forEach(function (f) { (by[f.properties.layer] = by[f.properties.layer] || []).push(f); });
    var body = Object.keys(by).map(function (ln) {
      return '<Folder><name>' + xe(ln) + '</name>' + by[ln].map(function (f) {
        var g = f.geometry, c = function (q) { return q[0] + ',' + q[1] + (q[2] !== undefined && q[2] !== null ? ',' + q[2] : ''); }, alt = g.coordinates.length && (g.type === 'Point' ? g.coordinates[2] !== undefined : (g.type === 'Polygon' ? g.coordinates[0][0] : g.coordinates[0]).length > 2) ? '<altitudeMode>absolute</altitudeMode>' : '<altitudeMode>clampToGround</altitudeMode>';
        var geo = g.type === 'Point' ? '<Point>' + alt + (g.coordinates[2] !== undefined ? '<extrude>1</extrude>' : '') + '<coordinates>' + c(g.coordinates) + '</coordinates></Point>' : g.type === 'LineString' ? '<LineString>' + alt + '<coordinates>' + g.coordinates.map(c).join(' ') + '</coordinates></LineString>' : '<Polygon>' + alt + '<outerBoundaryIs><LinearRing><coordinates>' + g.coordinates[0].map(c).join(' ') + '</coordinates></LinearRing></outerBoundaryIs></Polygon>';
        return '<Placemark><name>' + xe(f.properties.label) + '</name><description>' + xe(f.properties.details) + '</description><Style><IconStyle><color>' + (col[f.properties.result] || 'ff7f7f7f') + '</color></IconStyle><LineStyle><color>' + (col[f.properties.result] || 'ffc08000') + '</color><width>2</width></LineStyle><PolyStyle><color>33c08000</color></PolyStyle></Style>' + geo + '</Placemark>';
      }).join('') + '</Folder>';
    }).join('');
    return '<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>' + xe(R.title) + '</name><description>' + xe(NOTE + ' ' + EXPORTS.CREDIT) + '</description>' + body + '</Document></kml>';
  }
  // DXF R12: local east / north / up metres from the analysis origin; one layer per scene layer; obstacles as 3D lines with their name
  function toDxf(R) {
    var sp = R.spec, F = C.frame(sp.centre), out = ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '6', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES'];
    function lay(n) { return String(n).toUpperCase().replace(/[^A-Z0-9]+/g, '_').slice(0, 30) || 'L0'; }
    function P(c, z) { var q = F.xy(c); return [q[0].toFixed(2), q[1].toFixed(2), (z === undefined || z === null ? 0 : z).toFixed(2)]; }
    function line(L, a, b) { out.push('0', 'LINE', '8', L, '10', a[0], '20', a[1], '30', a[2], '11', b[0], '21', b[1], '31', b[2]); }
    function text(L, a, t, h) { out.push('0', 'TEXT', '8', L, '10', a[0], '20', a[1], '30', a[2], '40', String(h || 8), '1', String(t).replace(/[\r\n]+/g, ' ').slice(0, 120)); }
    function poly(L, pts) { out.push('0', 'POLYLINE', '8', L, '66', '1', '70', '8'); pts.forEach(function (p) { out.push('0', 'VERTEX', '8', L, '10', p[0], '20', p[1], '30', p[2], '70', '32'); }); out.push('0', 'SEQEND', '8', L); }
    text('INFO', ['0', '0', '0'], R.title + ' — origin ' + sp.centre[1].toFixed(6) + ', ' + sp.centre[0].toFixed(6) + ' (x east, y north, z elevation, metres)', 12);
    (sp.layers || []).forEach(function (l) {
      var L = lay(l.name);
      (l.items || []).forEach(function (it) {
        if (l.kind === 'obstacles') { var base = it.hgt !== null && it.hgt !== undefined ? it.top - it.hgt : it.top - 1; line(L, P(it.c, base), P(it.c, it.top)); text(L, P(it.c, it.top + 2), (it.label || '') + ' ' + Math.round(it.top) + ' m', 6); }
        else if (it.ring) poly(L, it.ring.map(function (q) { return P(q, it.z); }));
        else if (it.pts) poly(L, it.pts.map(function (q) { return P(q, q[2]); }));
        else if (it.a && it.b) { line(L, P(it.a, it.a[2]), P(it.b, it.b[2])); text(L, P([(it.a[0] + it.b[0]) / 2, (it.a[1] + it.b[1]) / 2], (it.a[2] + it.b[2]) / 2), (it.label || []).join(' / '), 6); }
        else if (it.c && it.r) poly(L, FLTCALC.arcPts(it.c, it.r, it.b0 || 0, it.b1 || 360).map(function (q) { return P(q, it.z); }));
        else if (it.c && l.kind === 'point') text(L, P(it.c, it.z), it.label || '', 8);
      });
    });
    out.push('0', 'ENDSEC', '0', 'EOF');
    return out.join('\r\n');
  }

  return { render: render, state: V, compute: compute, resolveRoute: resolveRoute, readText: readText, toDxf: toDxf, toGeoJSON: toGeoJSON };
})();
