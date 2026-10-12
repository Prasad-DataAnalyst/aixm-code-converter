/*!
 * AIXM Code Converter
 * Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com> - author of the AIXM Code Converter
 * SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE; keep this notice in all copies)
 * ==========================================================================
 * AIXM Code Converter - aerodrome mapping: fit for use (AMDBQ)
 * NOT FOR NAVIGATION - for study and analysis only.
 *   Estimated  each feature against the accuracy and integrity its data needs (ICAO PANS-AIM Doc 10066 Appendix 1,
 *              the requirement editable for the numbers of EUROCAE ED-99D / RTCA DO-272D, which are sold): the accuracy
 *              it declares, else what its source allows — a value published by the State (AIP data set, chart; its
 *              resolution as published), a chart placed on the map (the fit), imagery (its pixel size), OpenStreetMap
 *              (not stated), the ICAO Annex 14 layout (not a measurement) — meets, the State's, unknown or not met;
 *              what needs a survey.
 *   Measured   against a reference data set (a survey, a supplier's AMDB): for each feature, its distance to the
 *              nearest feature of the same type in the reference (points; the mean and the largest distance of the
 *              vertices of lines and outlines, every 5 m); per type and source the mean, root mean square, 95th
 *              percentile and largest, the share within the requirement, and what the reference has that the data
 *              set lacks.
 * Loaded only when used (src/lazy.js).
 * ========================================================================== */
/* global AMDB, MODEL, DDMAP, EXPORTS, APP_INFO */
var AMDBQ = (function () {
  'use strict';
  var NOTICE = 'NOT FOR NAVIGATION — for study and analysis only.', RKEY = 'aixm-amdb-requirements';
  var SEC = 30.87; // a second of latitude, metres
  function esc(t) { return String(t === undefined || t === null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(x) { if (!x || x.nil || x.v === undefined || x.v === null || x.v === '') return null; var v = parseFloat(String(x.v).replace(',', '.')); return isNaN(v) ? null : v; }
  function fmt(x) { return x === null || x === undefined || isNaN(x) ? '' : x >= 100 ? String(Math.round(x)) : x >= 10 ? x.toFixed(1) : x.toFixed(2); }
  var LNAME = { A: 'AIP data set', C: 'the State\'s chart', T: 'traced (imagery or chart)', O: 'OpenStreetMap', S: 'ICAO Annex 14 layout / inferred', D: 'data as delivered' };

  /* ---------------------------------------------------------- requirements */
  // ICAO PANS-AIM Appendix 1 (the table of the AMDB checks), and the user's own numbers (e.g. from ED-99D)
  function own() { try { return JSON.parse(localStorage.getItem(RKEY) || '{}') || {}; } catch (e) { return {}; } }
  function setOwn(t, v) { var o = own(); if (v === '' || v === null || isNaN(+v)) delete o[t]; else o[t] = +v; try { localStorage.setItem(RKEY, JSON.stringify(o)); } catch (e) { /* kept for this session */ } }
  function req(t) { var o = own(), r = AMDB.REQ[t]; if (o[t] !== undefined) return { acc: o[t], cls: r ? r[0] : '', by: 'yours' }; return r ? { acc: r[1], cls: r[0], by: 'PANS-AIM' } : null; }

  /* --------------------------------------------------- the source and its accuracy */
  function srcOf(f) {
    var s = String((f.a.source && f.a.source.v) || '');
    if (/^SCHEMATIC/i.test(s)) return 'S';
    if (/^Inferred|standard layout|Annex 14 minimum/i.test(s)) return 'S';
    if (/^Digitised by the user/i.test(s)) return 'T';
    if (/^From the State'?s charts?/i.test(s)) return 'C';
    if (/OpenStreetMap/i.test(s)) return 'O';
    if (/^Generated from AIP data/i.test(s) || f.src === 'AIXM') return 'A';
    return 'D';
  }
  // {acc (m) | null, floor (m, the published resolution) | null, basis, kind: declared | estimated | state | osm | assumed | unknown}
  function estimate(f) {
    var hacc = num(f.a.hacc), s = String((f.a.source && f.a.source.v) || ''), L = srcOf(f);
    if (hacc !== null && hacc > 0) return { acc: hacc, kind: 'declared', basis: 'declared ' + fmt(hacc) + ' m' };
    var m = /est\. accuracy ~([\d.]+) m(?: \(([^)]+)\))?/.exec(s);
    if (m) return { acc: +m[1], kind: 'estimated', basis: 'estimated ~' + m[1] + ' m' + (m[2] ? ' (' + m[2] + ')' : '') };
    var hres = num(f.a.hres), floor = hres !== null && hres > 0 && hres < 0.01 ? hres * 3600 * SEC / 2 : null;
    if (L === 'S') return { acc: null, kind: 'assumed', basis: /^SCHEMATIC/i.test(s) ? 'schematic — placed at the reference point' : 'ICAO Annex 14 layout or minimum — not measured' };
    if (L === 'O') return { acc: null, kind: 'osm', basis: 'not stated (OpenStreetMap volunteers)' };
    if (L === 'A' && /geometry derived/i.test(s) && f.g[0] && f.g[0].t !== 'P') return { acc: null, floor: floor, kind: 'state', basis: 'derived from values the State publishes' };
    if (L === 'A' || L === 'C') return { acc: null, floor: floor, kind: 'state', basis: 'published by the State, accuracy not declared' + (floor !== null ? ' (resolution ±' + fmt(floor) + ' m)' : '') };
    if (L === 'T') return { acc: null, kind: 'unknown', basis: 'traced, accuracy not estimated' };
    return { acc: null, floor: floor, kind: 'unknown', basis: 'not declared' };
  }
  // meets | state (meets if the State's survey does) | unknown | not met | n/a (no requirement held)
  function status(e, r) {
    if (!r) return 'n/a';
    if (e.acc !== null) return e.acc <= r.acc + 1e-9 ? 'meets' : 'not met';
    if (e.kind === 'assumed') return 'not met';
    if (e.floor !== null && e.floor !== undefined && e.floor > r.acc) return 'not met';
    if (e.kind === 'state') return 'state';
    return 'unknown';
  }
  var INTEG = { critical: 1e-8, essential: 1e-5, routine: 1e-3 };
  function fitness(feats) {
    var by = {}, all = { n: 0, meets: 0, state: 0, unknown: 0, 'not met': 0, 'n/a': 0 };
    feats.forEach(function (f) {
      var r = req(f.t), e = estimate(f), st = status(e, r), L = srcOf(f);
      var T = by[f.t] = by[f.t] || { t: f.t, req: r, n: 0, src: {}, meets: 0, state: 0, unknown: 0, 'not met': 0, 'n/a': 0, accs: [], basis: {}, integ: 0 };
      T.n++; T[st]++; T.src[L] = (T.src[L] || 0) + 1; if (e.acc !== null) T.accs.push(e.acc); T.basis[e.basis] = (T.basis[e.basis] || 0) + 1;
      var ig = num(f.a.integr); if (r && ig !== null && ig <= INTEG[r.cls] * 1.0000001) T.integ++;
      all.n++; all[st]++;
    });
    var types = Object.keys(by).sort(function (a, b) { return (by[b].req ? 1 : 0) - (by[a].req ? 1 : 0) || a.localeCompare(b); }).map(function (k) { return by[k]; });
    var survey = types.filter(function (T) { return T.req && (T['not met'] || T.unknown); }).map(function (T) { return { t: T.t, n: T['not met'] + T.unknown, req: T.req }; });
    return { types: types, all: all, survey: survey };
  }

  /* -------------------------------------------- measured against a reference */
  function vertsOf(f, P, step) {
    var out = [];
    f.g.forEach(function (g) {
      var lines = g.t === 'P' ? null : g.t === 'L' ? [g.c] : g.c;
      if (!lines) { out.push(P.fwd(g.c)); return; }
      lines.forEach(function (l) { var q = l.map(P.fwd); for (var i = 0; i < q.length - 1; i++) { var a = q[i], b = q[i + 1], d = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(d / step)); for (var k = 0; k < n; k++) out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); } if (q.length) out.push(q[q.length - 1]); });
    });
    return out;
  }
  function segsOf(f, P) {
    var out = [];
    f.g.forEach(function (g) { if (g.t === 'P') { var p = P.fwd(g.c); out.push([p, p]); return; } (g.t === 'L' ? [g.c] : g.c).forEach(function (l) { var q = l.map(P.fwd); for (var i = 0; i < q.length - 1; i++) out.push([q[i], q[i + 1]]); }); });
    return out;
  }
  function segDist(p, a, b) { var dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); }
  // a grid of the reference's segments (50 m cells) for the nearest one
  function index(segs) { var g = {}; segs.forEach(function (s, i) { var x0 = Math.floor(Math.min(s[0][0], s[1][0]) / 50), x1 = Math.floor(Math.max(s[0][0], s[1][0]) / 50), y0 = Math.floor(Math.min(s[0][1], s[1][1]) / 50), y1 = Math.floor(Math.max(s[0][1], s[1][1]) / 50); for (var x = x0; x <= x1; x++) for (var y = y0; y <= y1; y++) (g[x + ',' + y] = g[x + ',' + y] || []).push(i); }); return g; }
  function nearest(p, segs, grid, cut) {
    var cx = Math.floor(p[0] / 50), cy = Math.floor(p[1] / 50), R = Math.ceil(cut / 50), best = Infinity, seen = {};
    for (var x = cx - R; x <= cx + R; x++) for (var y = cy - R; y <= cy + R; y++) (grid[x + ',' + y] || []).forEach(function (i) { if (seen[i]) return; seen[i] = 1; var d = segDist(p, segs[i][0], segs[i][1]); if (d < best) best = d; });
    return best;
  }
  function pct(a, q) { if (!a.length) return null; var s = a.slice().sort(function (x, y) { return x - y; }); return s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)]; }
  // E: the data set measured, R: the reference; cut: a feature farther than this (m) from any of its type is not in the reference
  function measure(E, R, cut) {
    cut = cut || 100;
    var o = (E[0] || R[0]); if (!o) return { rows: [], types: [] };
    var c0 = (function () { var g = o.g[0]; return g.t === 'P' ? g.c : g.t === 'L' ? g.c[0] : g.c[0][0]; })(), P = AMDB.plane(c0[0], c0[1]);
    var refBy = {}, rows = [];
    R.forEach(function (f) { if (f.g.length) (refBy[f.t] = refBy[f.t] || []).push(f); });
    var idx = {};
    Object.keys(refBy).forEach(function (t) { var segs = [].concat.apply([], refBy[t].map(function (f) { return segsOf(f, P); })); idx[t] = { segs: segs, grid: index(segs) }; });
    E.forEach(function (f) {
      if (!f.g.length || !idx[f.t]) return;
      var I = idx[f.t], pts = f.g[0].t === 'P' ? [P.fwd(f.g[0].c)] : vertsOf(f, P, 5), ds = pts.map(function (p) { return nearest(p, I.segs, I.grid, cut); });
      var ok = ds.filter(function (d) { return d <= cut; });
      if (!ok.length) { rows.push({ f: f, L: srcOf(f), miss: true }); return; }
      var mean = ok.reduce(function (a, b) { return a + b; }, 0) / ok.length, max = Math.max.apply(null, ok);
      rows.push({ f: f, L: srcOf(f), d: f.g[0].t === 'P' ? ds[0] : mean, max: max, part: ok.length / ds.length });
    });
    // what the reference has that the data set lacks (its features farther than cut from any of the data set's type)
    var eBy = {}; E.forEach(function (f) { if (f.g.length) (eBy[f.t] = eBy[f.t] || []).push(f); });
    var eIdx = {}; Object.keys(eBy).forEach(function (t) { var segs = [].concat.apply([], eBy[t].map(function (f) { return segsOf(f, P); })); eIdx[t] = { segs: segs, grid: index(segs) }; });
    var lack = {};
    R.forEach(function (f) { if (!f.g.length) return; var I = eIdx[f.t], p = (function () { var v = vertsOf(f, P, 1e9); return v[Math.floor(v.length / 2)]; })(); if (!I || nearest(p, I.segs, I.grid, cut) > cut) lack[f.t] = (lack[f.t] || 0) + 1; });
    // per type and source
    var groups = {};
    rows.forEach(function (r) { var k = r.f.t + '|' + r.L, G = groups[k] = groups[k] || { t: r.f.t, L: r.L, d: [], miss: 0 }; if (r.miss) G.miss++; else G.d.push(r.d); });
    var types = Object.keys(groups).sort().map(function (k) {
      var G = groups[k], d = G.d, rq = req(G.t), n = d.length;
      var mean = n ? d.reduce(function (a, b) { return a + b; }, 0) / n : null, rms = n ? Math.sqrt(d.reduce(function (a, b) { return a + b * b; }, 0) / n) : null;
      return { t: G.t, L: G.L, n: n, miss: G.miss, mean: mean, rms: rms, p95: pct(d, 0.95), max: n ? Math.max.apply(null, d) : null, req: rq, within: rq && n ? d.filter(function (x) { return x <= rq.acc; }).length / n : null, lack: 0 };
    });
    Object.keys(lack).forEach(function (t) { var row = types.filter(function (x) { return x.t === t; })[0]; if (row) row.lack = lack[t]; else types.push({ t: t, L: '', n: 0, miss: 0, mean: null, rms: null, p95: null, max: null, req: req(t), within: null, lack: lack[t] }); });
    return { rows: rows, types: types, cut: cut };
  }

  /* -------------------------------------------------------------------- UI */
  var Q = { ds: -1, ad: '', ref: -1, res: null };
  function setsOf(ctx) { var out = []; ctx.datasets.forEach(function (ds, di) { var f = AMDB.collect([ds], MODEL).features; if (f.length) out.push({ di: di, ds: ds, f: f }); }); return out; }
  function render(host, ctx) {
    var sets = setsOf(ctx), h = '<div class="nfo-box amdb-notice" role="note">⚠ ' + NOTICE + ' Fit for use is judged from what the data declares and where it comes from; it is not a certification of the data.</div>';
    if (!sets.length) { host.innerHTML = h + '<div class="card card-pad muted">Load or generate aerodrome mapping data first (📤 Upload, Generate from AIP).</div>'; return; }
    if (!sets.some(function (x) { return x.di === Q.ds; })) Q.ds = sets[sets.length - 1].di;
    var S = sets.filter(function (x) { return x.di === Q.ds; })[0], ads = {};
    S.f.forEach(function (f) { ads[f.ad || '(none)'] = (ads[f.ad || '(none)'] || 0) + 1; });
    if (Q.ad && !ads[Q.ad]) Q.ad = '';
    var feats = S.f.filter(function (f) { return !Q.ad || (f.ad || '(none)') === Q.ad; }), F = fitness(feats), A = F.all, withReq = A.n - A['n/a'];
    var pc = function (x) { return withReq ? Math.round(x / withReq * 100) : 0; };
    h += '<div class="card card-pad fit-card"><h3 style="margin-top:0">📏 Fit for use</h3><div class="toolbar"><label>Data set <select class="inp" data-q="ds">' + sets.map(function (x) { return '<option value="' + x.di + '"' + (x.di === Q.ds ? ' selected' : '') + '>' + esc(x.ds.name) + ' (' + x.f.length + ')</option>'; }).join('') + '</select></label>' +
      '<label>Aerodrome <select class="inp" data-q="ad"><option value="">All</option>' + Object.keys(ads).sort().map(function (a) { return '<option' + (a === Q.ad ? ' selected' : '') + '>' + esc(a) + '</option>'; }).join('') + '</select></label><span class="sp"></span><span class="btn-group">' + ['pdf:PDF', 'xlsx:Excel', 'csv:CSV'].map(function (x) { var p = x.split(':'); return '<button class="btn small" data-qrep="' + p[0] + '">' + p[1] + '</button>'; }).join('') + '</span></div>' +
      '<h4>Estimated from the sources</h4><p class="muted">Each feature against the horizontal accuracy and integrity its data needs — ICAO PANS-AIM Appendix 1, or your own numbers (e.g. from EUROCAE ED-99D / RTCA DO-272D, which are sold: type them in the table). Its accuracy is what it declares, else what its source allows. <i>State</i>: published by the State without a declared accuracy — it meets the requirement if the State\'s survey does (PANS-AIM requires it to). Integrity is not assured by this tool (it is not an ED-76A / DO-200B process): a package carries CRC-32Q and SHA-256 for its transfer only.</p>' +
      '<div class="kpis ov-kpis">' + [['meets', A.meets, '#2e7d32'], ['State (as surveyed)', A.state, '#1d6fb8'], ['unknown', A.unknown, '#b76e00'], ['not met', A['not met'], '#c62828'], ['no requirement held', A['n/a'], '#9aa5b1']].map(function (k, i) { return '<div class="kpi-h"><b style="color:' + k[2] + '">' + k[1] + '</b><span>' + k[0] + (i < 4 && withReq ? ' · ' + pc(k[1]) + ' %' : '') + '</span></div>'; }).join('') + '</div>' +
      '<div class="tbl-wrap"><table class="mini-table fit-tbl"><thead><tr><th>Feature type</th><th>Data class</th><th class="num">Required (m)</th><th class="num">Features</th><th>Sources</th><th>Accuracy (declared / estimated)</th><th class="num">Meets</th><th class="num">State</th><th class="num">Unknown</th><th class="num">Not met</th></tr></thead><tbody>' +
      F.types.map(function (T) {
        var acc = T.accs.length ? (Math.min.apply(null, T.accs) === Math.max.apply(null, T.accs) ? fmt(T.accs[0]) + ' m' : fmt(Math.min.apply(null, T.accs)) + ' – ' + fmt(Math.max.apply(null, T.accs)) + ' m') : '';
        var basis = Object.keys(T.basis).sort(function (a, b) { return T.basis[b] - T.basis[a]; }).slice(0, 2).map(function (b) { return b + (Object.keys(T.basis).length > 1 ? ' (' + T.basis[b] + ')' : ''); }).join('; ');
        return '<tr><td>' + esc(T.t) + '</td><td>' + esc(T.req ? T.req.cls : '') + '</td><td class="num"><input class="inp" type="number" min="0.01" step="0.01" data-qreq="' + esc(T.t) + '" value="' + (T.req ? T.req.acc : '') + '" placeholder="—" style="width:70px" title="' + (T.req ? (T.req.by === 'yours' ? 'your number' : 'ICAO PANS-AIM Appendix 1') : 'no requirement held: type one') + '"></td><td class="num">' + T.n + '</td>' +
          '<td>' + Object.keys(T.src).map(function (L) { return '<span class="chip" title="' + esc(LNAME[L]) + '">' + L + ' ' + T.src[L] + '</span>'; }).join(' ') + '</td><td>' + (acc ? '<b>' + acc + '</b> · ' : '') + '<span class="muted">' + esc(basis) + '</span></td>' +
          ['meets', 'state', 'unknown', 'not met'].map(function (k) { return '<td class="num">' + (T.req ? T[k] || '' : '') + '</td>'; }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>' +
      (F.survey.length ? '<p><b>Needs a survey or a better source:</b> ' + F.survey.map(function (x) { return esc(x.t) + ' (' + x.n + ', ≤ ' + x.req.acc + ' m)'; }).join(' · ') + '</p>' : '') +
      '<p class="muted" style="font-size:12px">Sources: A AIP data set · C the State\'s chart · T traced on imagery or on a placed chart · O OpenStreetMap · S ICAO Annex 14 layout or minimum · D data as delivered (survey, supplier). EUROCAE ED-99D quality levels for orientation: fine about 0.5 m, medium about 5 m, coarse lower.</p>';
    // measured against a reference
    var refs = sets.filter(function (x) { return x.di !== Q.ds; });
    if (!refs.some(function (x) { return x.di === Q.ref; })) { Q.ref = -1; Q.res = null; }
    h += '<h4>Measured against a reference</h4>' + (refs.length ? '<div class="toolbar"><label>Reference (a survey, a supplier\'s data) <select class="inp" data-q="ref"><option value="-1">choose…</option>' + refs.map(function (x) { return '<option value="' + x.di + '"' + (x.di === Q.ref ? ' selected' : '') + '>' + esc(x.ds.name) + '</option>'; }).join('') + '</select></label><button class="btn primary" data-qgo' + (Q.ref < 0 ? ' disabled' : '') + '>Measure</button></div>' : '<p class="muted">Load a second aerodrome mapping data set — a survey, a supplier\'s AMDB — to measure this one against it.</p>');
    var M = Q.res;
    if (M) {
      h += '<p class="muted">Each feature\'s distance to the nearest feature of its type in the reference — a point to the nearest point, a line or an outline by its vertices every 5 m (the mean; the largest is in the export). A feature more than ' + M.cut + ' m from all of its type is counted as not in the reference.</p>' +
        '<div class="tbl-wrap"><table class="mini-table fit-tbl fit-meas"><thead><tr><th>Feature type</th><th>Source</th><th class="num">Measured</th><th class="num">Mean (m)</th><th class="num">RMS (m)</th><th class="num">95 % (m)</th><th class="num">Largest (m)</th><th class="num">Required</th><th class="num">Within</th><th class="num">Not in the reference</th><th class="num">Reference has, data set lacks</th></tr></thead><tbody>' +
        M.types.map(function (T) { return '<tr><td>' + esc(T.t) + '</td><td>' + esc(T.L) + '</td><td class="num">' + T.n + '</td><td class="num">' + fmt(T.mean) + '</td><td class="num">' + fmt(T.rms) + '</td><td class="num">' + fmt(T.p95) + '</td><td class="num">' + fmt(T.max) + '</td><td class="num">' + (T.req ? T.req.acc + ' m' : '') + '</td><td class="num">' + (T.within !== null ? Math.round(T.within * 100) + ' %' : '') + '</td><td class="num">' + (T.miss || '') + '</td><td class="num">' + (T.lack || '') + '</td></tr>'; }).join('') + '</tbody></table></div>' +
        '<div class="ov-map amdb-map fit-map" role="application" aria-label="Map of the distances to the reference"></div>';
    }
    h += '</div>';
    host.innerHTML = h;
    if (M && typeof DDMAP !== 'undefined') {
      var el = host.querySelector('.fit-map'), mm = DDMAP.create(el, 'amdbfit'), items = [];
      M.rows.slice(0, 5000).forEach(function (r) { var rq = req(r.f.t), col = r.miss ? '#9aa5b1' : rq && r.d <= rq.acc ? '#2e7d32' : r.d <= 5 ? '#ef6c00' : '#c62828'; r.f.g.forEach(function (g) { items.push({ key: r, g: g, color: col, label: r.f.t + ' ' + (r.f.label || '') + (r.miss ? ' · not in the reference' : ' · ' + fmt(r.d) + ' m') }); }); });
      DDMAP.shapes(mm, items, { legend: [['#2e7d32', 'within the requirement'], ['#ef6c00', 'up to 5 m'], ['#c62828', 'more than 5 m'], ['#9aa5b1', 'not in the reference']], onPick: function () {} });
      setTimeout(function () { mm.map.invalidateSize(); }, 60);
    }
    host.onchange = function (e) {
      var k = e.target.getAttribute('data-q');
      if (k) { Q[k] = k === 'ad' ? e.target.value : +e.target.value; Q.res = null; render(host, ctx); return; }
      var t = e.target.getAttribute('data-qreq'); if (t) { setOwn(t, e.target.value); render(host, ctx); }
    };
    host.onclick = function (e) {
      if (e.target.closest('[data-qgo]')) {
        var R = sets.filter(function (x) { return x.di === Q.ref; })[0]; if (!R) return;
        var rf = R.f.filter(function (f) { return !Q.ad || (f.ad || '(none)') === Q.ad; });
        Q.res = measure(feats, rf, 100); Q.res.ref = R.ds.name; render(host, ctx); return;
      }
      var b = e.target.closest('[data-qrep]'); if (b) report(b.getAttribute('data-qrep'), S.ds.name, F, Q.res, ctx);
    };
  }
  function C(t) { return { t: t === undefined || t === null ? '' : String(t) }; }
  function report(kind, name, F, M, ctx) {
    var sc = { title: 'Aerodrome mapping — fit for use' + (Q.ad ? ' — ' + Q.ad : ''), sub: NOTICE, ds: null, sections: [
      { title: 'Summary', blocks: [{ kind: 'kv', rows: [['Data set', name], ['Features', F.all.n], ['Meets', F.all.meets], ['State (as surveyed)', F.all.state], ['Unknown', F.all.unknown], ['Not met', F.all['not met']], ['No requirement held', F.all['n/a']], ['Made with', APP_INFO.name + ' ' + APP_INFO.version + ' — created by ' + APP_INFO.author]].map(function (x) { return { label: x[0], cells: [C(x[1])] }; }) }] },
      { title: 'Estimated from the sources', blocks: [{ kind: 'table', cols: ['Feature type', 'Data class', 'Required (m)', 'Requirement from', 'Features', 'Sources', 'Accuracy', 'Basis', 'Meets', 'State', 'Unknown', 'Not met'], rows: F.types.map(function (T) { return [C(T.t), C(T.req ? T.req.cls : ''), C(T.req ? T.req.acc : ''), C(T.req ? T.req.by : ''), C(T.n), C(Object.keys(T.src).map(function (L) { return L + ' ' + T.src[L]; }).join(', ')), C(T.accs.length ? fmt(Math.min.apply(null, T.accs)) + ' – ' + fmt(Math.max.apply(null, T.accs)) + ' m' : ''), C(Object.keys(T.basis).join('; ')), C(T.meets), C(T.state), C(T.unknown), C(T['not met'])]; }) }] }] };
    if (M) sc.sections.push({ title: 'Measured against ' + M.ref, blocks: [{ kind: 'table', cols: ['Feature type', 'Source', 'Measured', 'Mean (m)', 'RMS (m)', '95 % (m)', 'Largest (m)', 'Required (m)', 'Within', 'Not in the reference', 'Reference has, data set lacks'], rows: M.types.map(function (T) { return [C(T.t), C(T.L), C(T.n), C(fmt(T.mean)), C(fmt(T.rms)), C(fmt(T.p95)), C(fmt(T.max)), C(T.req ? T.req.acc : ''), C(T.within !== null ? Math.round(T.within * 100) + ' %' : ''), C(T.miss), C(T.lack)]; }) }] });
    sc.sections.push({ title: 'Method', blocks: [{ kind: 'note', text: 'Requirements: ICAO PANS-AIM (Doc 10066) Appendix 1 for the feature types it lists, or the numbers typed by the user (e.g. from EUROCAE ED-99D / RTCA DO-272D). Accuracy: the accuracy a feature declares (hacc), else an estimate from its source — the fit of a placed chart, three pixels of the imagery traced on — else its source: a value the State publishes (its resolution as published bounds it), OpenStreetMap (not stated), the ICAO Annex 14 layout (not a measurement). Measured: the distance of each feature to the nearest feature of its type in the reference, on a local plane; lines and outlines by their vertices every 5 m. Integrity is not assured by this tool, which is not an ED-76A / DO-200B process. Not a certification of the data.' }] });
    try { if (kind === 'pdf') EXPORTS.exportPDF(sc); else if (kind === 'xlsx') EXPORTS.exportExcel(sc); else EXPORTS.exportCSV(sc); } catch (e) { ctx.toast('Report failed: ' + e.message, 6000); }
  }
  return { render: render, fitness: fitness, measure: measure, estimate: estimate, status: status, srcOf: srcOf, req: req, setOwn: setOwn };
})();
if (typeof module !== 'undefined') module.exports = AMDBQ;
