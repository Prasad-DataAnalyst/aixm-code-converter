/*!
 * AIXM Code Converter
 * Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com> - author of the AIXM Code Converter
 * SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE; keep this notice in all copies)
 * ==========================================================================
 * AIXM Code Converter - "Digital data" tab (DDVIEW)
 * The digital data sets of PANS-AIM besides the AIP data set are used in their own way, so each has its own
 * workspace here, on all the data loaded:
 *   Obstacles (eTOD)       obstacle data sets in AIXM, eTOD tables (Excel / CSV), vertical structures (OBSTVIEW)
 *   Procedures (IFP)       SID, STAR and approaches by aerodrome: design, PBN, legs, holdings, MSA / TAA, checks,
 *                          reports with every leg and minimum
 *   Aerodrome mapping      AMXM 2.0 data by aerodrome and feature type, every AMXM attribute, checks, reports
 *   Terrain                terrain files, flight path and aerodrome terrain studies (terview.js)
 * The AIP, map and export views are not changed; this tab only reads the data.
 * ========================================================================== */
/* global MODEL, AIP, EXPORTS, OBSTVIEW, DDMAP, MAPVIEW, TERVIEW, DEM, IFP */
var DDVIEW = (function () {
  'use strict';
  var M = MODEL, s = M.s;
  function esc(t) { return String(t === undefined || t === null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(n) { return Number(n || 0).toLocaleString('en-US'); }
  var PROC = { StandardInstrumentDeparture: 'SID', StandardInstrumentArrival: 'STAR', InstrumentApproachProcedure: 'IAP' };
  var V = { sec: null, ifp: { ad: '', kind: '', q: '', layout: 'split', checks: false }, am: { ad: '', type: '', layout: 'split' } };
  var KCOL = { SID: '#2e7d32', STAR: '#1565c0', IAP: '#b0186e' };

  /* --------------------------------------------------------- what is loaded */
  function procsOf(datasets) {
    var out = [];
    datasets.forEach(function (ds) { Object.keys(PROC).forEach(function (k) { (ds.byType[k] || []).forEach(function (r) { out.push({ ds: ds, r: r }); }); }); });
    return out;
  }
  function amxmOf(datasets) { return datasets.filter(function (d) { return d.family === 'amxm' || d.recs.some(function (r) { return r.cur && r.cur.p && r.cur.p._amxm && !r.syn; }); }); }
  function sections(datasets) {
    var nObs = datasets.reduce(function (n, d) { return n + (d.byType.VerticalStructure || []).length; }, 0);
    var nProc = procsOf(datasets).length, am = amxmOf(datasets);
    var nAm = am.reduce(function (n, d) { return n + d.recs.filter(function (r) { return r.cur && r.cur.p && r.cur.p._amxm && !r.syn; }).length; }, 0);
    return [
      { id: 'obs', title: 'Obstacles (eTOD)', n: nObs, what: 'obstacles', icon: '⛫' },
      { id: 'ifp', title: 'Procedures (IFP)', n: nProc, what: 'procedures', icon: '✈' },
      { id: 'amxm', title: 'Aerodrome mapping', n: nAm, what: 'AMXM features', icon: '▦' },
      { id: 'ter', title: 'Terrain', n: typeof DEM !== 'undefined' ? DEM.items().length : 0, what: 'terrain file(s)', icon: '⛰' }
    ];
  }
  // the Terrain section also studies flight paths and aerodromes with online / built-in terrain, without a file
  function has(datasets) { return sections(datasets).some(function (x) { return x.n > 0; }); }

  function render(host, ctx) {
    var secs = sections(ctx.datasets);
    if (!V.sec || !secs.some(function (x) { return x.id === V.sec && (x.n || x.id === 'ter'); })) V.sec = ctx.sec || (secs.filter(function (x) { return x.n; })[0] || secs[0]).id;
    ctx.sec = null;
    host.innerHTML = '<div class="dd-head"><h1 class="view-title">Digital data</h1><p class="view-sub">The digital data sets besides the AIP data set — obstacles (eTOD), instrument flight procedures, aerodrome mapping and terrain — each with its own overview, lists, checks and reports, on all the data loaded.</p>' +
      '<div class="dd-secs" role="tablist">' + secs.map(function (x) {
        return '<button role="tab" class="dd-sec' + (V.sec === x.id ? ' on' : '') + '" data-ddsec="' + x.id + '"' + (!x.n && x.id !== 'ter' ? ' disabled' : '') + '><span class="dd-ic" aria-hidden="true">' + x.icon + '</span><b>' + x.title + '</b><span>' + (x.id === 'ter' && !x.n ? 'flight paths, aerodromes, files' : x.n ? num(x.n) + ' ' + x.what : 'none loaded') + '</span></button>';
      }).join('') + '</div></div><div class="dd-body"></div>';
    var body = host.querySelector('.dd-body');
    host.querySelector('.dd-secs').onclick = function (e) { var b = e.target.closest('[data-ddsec]'); if (b && !b.disabled) { V.sec = b.getAttribute('data-ddsec'); render(host, ctx); } };
    if (V.sec === 'obs') { OBSTVIEW.render(body, ctx); var t = body.querySelector('.view-title'); if (t) t.outerHTML = ''; var sub = body.querySelector('.view-sub'); if (sub) sub.outerHTML = ''; }
    else if (V.sec === 'ifp') ifpRender(body, ctx);
    else if (V.sec === 'amxm') amRender(body, ctx);
    else TERVIEW.render(body, ctx);
  }

  /* ------------------------------------------------------- procedures (IFP) */
  function runwaysOf(ds, p) {
    var rw = [];
    rw = rw.concat(IFP.runways(ds, { cur: { p: p } }).map(function (o) { return M.shortName(o.r); }));
    return rw.filter(function (x, i, a) { return x && a.indexOf(x) === i; }).join(', ');
  }
  function pbnOf(p) { return IFP.pbnText(p); } // AIXM 5.1 aircraftCharacteristic, 5.2 aircraftCapability
  function ifpRows(ctx) {
    return procsOf(ctx.datasets).map(function (x) {
      var p = x.r.cur.p, ado = IFP.aerodrome(x.ds, x.r), ad = ado ? ado.r : null, legs = AIP.procLegs(x.ds, x.r);
      var det = AIP.procDetail(x.ds, x.r), titles = det.map(function (b) { return b.title || ''; }).join('|');
      return { ds: x.ds, r: x.r, kind: PROC[x.r.k], ad: ad, adDs: ado ? ado.ds : x.ds, adCode: ad ? M.shortName(ad) : '', desig: s(p.designator), name: s(p.name), rwy: runwaysOf(x.ds, p), rnav: s(p.RNAV),
        appr: [s(p.approachPrefix), s(p.approachType), s(p.multipleIdentification)].filter(Boolean).join(' '), design: IFP.design(p).replace(/^PANS OPS/, 'PANS-OPS'), coding: s(p.codingStandard).replace(/_/g, ' '),
        checked: s(p.flightChecked), pbn: pbnOf(p), mag: IFP.magVar(p), legs: legs.length, minima: /Minima/.test(titles), fas: /FAS/.test(titles), from: x.r.cur.b || '',
        chk: IFP.checks(x.ds, x.r, legs) };
    });
  }
  function chkChip(list) {
    var e = list.filter(function (c) { return c.sev === 'error'; }).length, w = list.filter(function (c) { return c.sev === 'warning'; }).length, i = list.length - e - w;
    if (!list.length) return '<span class="chip ok" title="No coding finding">✓</span>';
    return '<span class="chip ' + (e ? 'err' : w ? 'warn' : '') + '" title="' + esc(list.map(function (c) { return c.sev + ': ' + c.msg; }).join('\n')) + '">' + (e + w ? (e + w) + ' ⚠' : '') + (i ? ' ' + i + ' ℹ' : '') + '</span>';
  }
  // coding checks of the procedures listed, by rule
  function checksHtml(rows) {
    var all = []; rows.forEach(function (x) { x.chk.forEach(function (c, j) { all.push({ x: x, c: c, j: j }); }); });
    var order = { error: 0, warning: 1, info: 2 };
    all.sort(function (a, b) { return order[a.c.sev] - order[b.c.sev] || a.c.rule.localeCompare(b.c.rule); });
    return '<div class="card card-pad dd-chk"><h3 style="margin-top:0">Coding checks <span class="muted" style="font-weight:400">— ICAO Annex 11 designators, PANS-OPS path terminators and leg data, EUROCONTROL guidelines for the ICAO IFP data set (AIXM 5.2)</span></h3>' +
      (all.length ? '<div class="tbl-wrap"><table class="mini-table"><thead><tr><th>Severity</th><th>Topic</th><th>Finding</th><th>Why</th><th></th></tr></thead><tbody>' + all.slice(0, 2000).map(function (a) {
        return '<tr><td><span class="sev ' + a.c.sev + '">' + a.c.sev + '</span></td><td>' + esc(a.c.rule) + '</td><td>' + esc(a.c.msg) + '</td><td class="muted">' + esc(a.c.why) + '</td><td><button class="btn small ghost" data-ddchkrec="' + a.x._i + ':' + a.j + '" title="Open the feature">↗</button></td></tr>';
      }).join('') + '</tbody></table></div>' : '<p class="muted">No finding.</p>') +
      '<p class="muted" style="margin-bottom:0">Path terminators for RNAV: IF, TF, CF, DF, RF, FA, FM, CA, VA, VI, VM, HM; for RNP: IF, TF, RF, HM. The EUROCONTROL guidelines are drafts "for review": their findings are notes, not errors.</p></div>';
  }
  function ifpExtras(ctx) {
    var hold = 0, msa = 0, taa = 0;
    ctx.datasets.forEach(function (d) { hold += (d.byType.HoldingPattern || []).length; msa += (d.byType.SafeAltitudeArea || []).length; taa += (d.byType.TerminalArrivalArea || []).length; });
    return { hold: hold, msa: msa, taa: taa };
  }
  function ifpRender(host, ctx) {
    var all = ifpRows(ctx), F = V.ifp, ex = ifpExtras(ctx);
    all.forEach(function (x, i) { x._i = i; });
    var ads = {}; all.forEach(function (x) { var k = x.adCode || '(no aerodrome)'; ads[k] = (ads[k] || 0) + 1; });
    var q = F.q.trim().toLowerCase();
    var rows = all.filter(function (x) { return (!F.ad || (x.adCode || '(no aerodrome)') === F.ad) && (!F.kind || x.kind === F.kind) && (!q || (x.desig + ' ' + x.name + ' ' + x.rwy + ' ' + x.pbn).toLowerCase().indexOf(q) >= 0); });
    rows.sort(function (a, b) { return a.adCode.localeCompare(b.adCode) || a.kind.localeCompare(b.kind) || (a.desig || a.name).localeCompare(b.desig || b.name, 'en', { numeric: true }); });
    var cnt = function (k) { return all.filter(function (x) { return x.kind === k; }).length; };
    var noLegs = all.filter(function (x) { return !x.legs; }).length, noAd = all.filter(function (x) { return !x.ad; }).length;
    var h = '<div class="kpis ov-kpis">' + [['SID', cnt('SID')], ['STAR', cnt('STAR')], ['approaches', cnt('IAP')], ['aerodromes', Object.keys(ads).length], ['holdings', ex.hold], ['MSA', ex.msa], ['TAA', ex.taa], ['legs', all.reduce(function (n, x) { return n + x.legs; }, 0)]]
      .map(function (k) { return '<div class="kpi-h"><b>' + num(k[1]) + '</b><span>' + k[0] + '</span></div>'; }).join('') + '</div>';
    if (noLegs || noAd) h += '<div class="note-box">' + (noLegs ? num(noLegs) + ' procedure(s) without legs. ' : '') + (noAd ? num(noAd) + ' procedure(s) not linked to an aerodrome — read the IFP data set with the AIP data set of its delivery.' : '') + ' See Quality for the IFP checks.</div>';
    h += '<div class="toolbar ov-filter"><select class="inp" data-ddf="ad"><option value="">All aerodromes</option>' + Object.keys(ads).sort().map(function (k) { return '<option' + (F.ad === k ? ' selected' : '') + '>' + esc(k) + '</option>'; }).join('') + '</select>' +
      '<select class="inp" data-ddf="kind"><option value="">SID, STAR and approaches</option>' + ['SID', 'STAR', 'IAP'].map(function (k) { return '<option value="' + k + '"' + (F.kind === k ? ' selected' : '') + '>' + (k === 'IAP' ? 'Approaches' : k) + '</option>'; }).join('') + '</select>' +
      '<input class="inp" data-ddf="q" placeholder="Find designator, runway, PBN…" value="' + esc(F.q) + '"><span class="muted">' + num(rows.length) + ' of ' + num(all.length) + '</span>' +
      '<button class="btn small' + (F.checks ? ' primary' : '') + '" data-ddchk title="ICAO, PANS-OPS and EUROCONTROL IFP data set coding checks of the procedures listed">Coding checks (' + num(rows.reduce(function (n, x) { return n + x.chk.filter(function (c) { return c.sev !== 'info'; }).length; }, 0)) + ')</button><span class="sp"></span>' + layoutHtml(F) +
      '<span class="btn-group">' + ['pdf:PDF', 'print:Print', 'xlsx:Excel', 'csv:CSV'].map(function (f) { var p = f.split(':'); return '<button class="btn small" data-ddrep="' + p[0] + '" title="Procedure report: list, then every procedure with its legs, minima, holdings and MSA">' + p[1] + '</button>'; }).join('') + '</span></div>';
    h += '<div class="ov-split ov-' + F.layout + '">' + (F.layout !== 'list' ? '<div class="ov-map" role="application" aria-label="Procedure map"></div>' : '') + '<div class="ov-listcol"><div class="tbl-wrap ov-tbl"><table class="mini-table"><thead><tr><th>Aerodrome</th><th>Type</th><th>Designator</th><th>Name</th><th>Runway</th><th>Approach</th><th>PBN / RNAV</th><th>Design · coding</th><th>Mag. var.</th><th>Flight checked</th><th>Legs</th><th>Minima</th><th>FAS</th><th>Checks</th><th>Valid from</th><th></th></tr></thead><tbody>' +
      rows.map(function (x) {
        var i = all.indexOf(x);
        return '<tr data-ddi="' + i + '"' + (!x.legs || !x.ad ? ' class="ov-bad"' : '') + '><td class="mono"><b>' + esc(x.adCode || '—') + '</b></td><td>' + x.kind + '</td><td class="mono click" data-ddrow><b>' + esc(x.desig) + '</b></td><td>' + esc(x.name) + '</td><td>' + esc(x.rwy) + '</td><td>' + esc(x.appr) + '</td><td>' + esc(x.pbn || (x.rnav === 'YES' ? 'RNAV' : '')) + '</td>' +
          '<td>' + esc([x.design, x.coding].filter(Boolean).join(' · ')) + '</td><td>' + esc(x.mag) + '</td><td>' + (x.checked === 'YES' ? 'Yes' : x.checked === 'NO' ? 'No' : '') + '</td><td class="num">' + x.legs + '</td><td>' + (x.minima ? '✓' : '') + '</td><td>' + (x.fas ? '✓' : '') + '</td><td>' + chkChip(x.chk) + '</td><td>' + esc(String(x.from).slice(0, 10)) + '</td>' +
          '<td class="nowrap"><button class="btn small ghost" data-ddaip title="AD 2.22 of the aerodrome">AIP</button><button class="btn small ghost" data-ddmap title="Show the procedure on the map">🗺</button><button class="btn small ghost" data-ddxml title="AIXM code">&lt;/&gt;</button></td></tr>';
      }).join('') + '</tbody></table></div>' + (F.checks ? checksHtml(rows) : '') + '</div></div>';
    host.innerHTML = h;
    // the workspace map: the paths of the procedures listed, coloured by kind; a click selects the row
    var mm = null, mapEl = host.querySelector('.ov-map');
    if (mapEl) {
      mm = DDMAP.create(mapEl, 'ifp:' + F.ad + ':' + F.kind);
      var items = rows.slice(0, 400).map(function (x) {
        var paths = []; try { paths = MAPVIEW.procPaths(x.ds, x.r); } catch (e) { paths = []; }
        return { key: x, paths: paths, color: KCOL[x.kind], label: (x.adCode ? x.adCode + ' ' : '') + x.kind + ' ' + (x.desig || x.name) + (x.rwy ? ' · RWY ' + x.rwy : '') };
      });
      var adsShown = new Set();
      rows.forEach(function (x) { if (x.ad && !adsShown.has(x.ad)) { adsShown.add(x.ad); var c = M.pointOf(x.adDs, x.ad); if (c) items.push({ key: null, g: { t: 'P', c: c }, color: '#0b2a4a', label: M.shortName(x.ad) + ' ' + s(x.ad.cur.p.name) }); } });
      DDMAP.shapes(mm, items, { legend: [[KCOL.SID, 'SID'], [KCOL.STAR, 'STAR'], [KCOL.IAP, 'approach'], ['#0b2a4a', 'aerodrome']], note: rows.length > 400 ? 'first 400 procedures drawn' : 'dashed: missed approach',
        onPick: function (x) { pickRow(host, all.indexOf(x)); } });
      setTimeout(function () { if (mm) mm.map.invalidateSize(); }, 60);
    }
    host.onclick = function (e) {
      if (layoutClick(e, F, function () { ifpRender(host, ctx); })) return;
      var b = e.target.closest('[data-ddrow],[data-ddaip],[data-ddmap],[data-ddxml],[data-ddrep],[data-ddchk],[data-ddchkrec]');
      if (!b) return;
      if (b.hasAttribute('data-ddrep')) { ifpReport(b.getAttribute('data-ddrep'), rows, ctx); return; }
      if (b.hasAttribute('data-ddchk')) { F.checks = !F.checks; ifpRender(host, ctx); return; }
      if (b.hasAttribute('data-ddchkrec')) { var ck = b.getAttribute('data-ddchkrec').split(':'), cx = all[+ck[0]], cc = cx && cx.chk[+ck[1]]; if (cc) ctx.openDetail(cx.ds, cc.rec); return; }
      var t = b.closest('[data-ddi]'), x = t && all[+t.getAttribute('data-ddi')];
      if (!x) return;
      if (b.hasAttribute('data-ddrow')) ctx.openDetail(x.ds, x.r);
      else if (b.hasAttribute('data-ddxml')) ctx.openXml(x.ds, x.r);
      else if (b.hasAttribute('data-ddaip')) ctx.openAip(x.ds, x.r);
      else if (b.hasAttribute('data-ddmap')) { if (mm) { DDMAP.selectShape(mm, x); pickRow(host, all.indexOf(x)); } else if (x.ad) ctx.mapProcs(x.adDs, x.ad); else ctx.showOnMap(x.ds, x.r); }
    };
    filterHandler(host, F, function () { ifpRender(host, ctx); });
  }
  function layoutHtml(F) {
    return '<span class="pill-tabs ov-lay">' + [['split', 'Map + list'], ['map', 'Map'], ['list', 'List']].map(function (l) { return '<button data-ddlayout="' + l[0] + '" class="' + (F.layout === l[0] ? 'active' : '') + '">' + l[1] + '</button>'; }).join('') + '</span>';
  }
  function layoutClick(e, F, redraw) { var b = e.target.closest('[data-ddlayout]'); if (!b) return false; F.layout = b.getAttribute('data-ddlayout'); redraw(); return true; }
  function pickRow(host, i) {
    host.querySelectorAll('tr.ov-sel').forEach(function (n) { n.classList.remove('ov-sel'); });
    var tr = host.querySelector('tr[data-ddi="' + i + '"], tr[data-ami="' + i + '"]');
    if (tr) { tr.classList.add('ov-sel'); tr.scrollIntoView({ block: 'nearest' }); }
  }
  function filterHandler(host, F, redraw) {
    host.oninput = host.onchange = function (e) {
      var k = e.target.getAttribute && e.target.getAttribute('data-ddf');
      if (!k) return;
      F[k] = e.target.value;
      clearTimeout(host._t);
      host._t = setTimeout(function () { redraw(); var n = host.querySelector('[data-ddf="' + k + '"]'); if (n && n.tagName === 'INPUT') { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, e.type === 'input' && e.target.tagName === 'INPUT' ? 250 : 0);
    };
  }
  function C(t, r) { var o = { t: t === undefined || t === null ? '' : String(t) }; if (r) o.r = r; return o; }
  function ifpReport(fmt, rows, ctx) {
    var list = { kind: 'table', title: 'Instrument flight procedures (' + rows.length + ')', cols: ['Aerodrome', 'Type', 'Designator', 'Name', 'Runway', 'Approach', 'PBN / RNAV', 'Design criteria', 'Coding standard', 'Magnetic variation', 'Flight checked', 'Legs', 'Minima', 'FAS data block', 'Coding findings', 'Valid from'],
      rows: rows.map(function (x) { return [C(x.adCode), C(x.kind, x.r), C(x.desig, x.r), C(x.name), C(x.rwy), C(x.appr), C(x.pbn || (x.rnav === 'YES' ? 'RNAV' : '')), C(x.design), C(x.coding), C(x.mag), C(x.checked), C(x.legs), C(x.minima ? 'yes' : ''), C(x.fas ? 'yes' : ''), C(x.chk.filter(function (c) { return c.sev !== 'info'; }).length + ' / ' + x.chk.length), C(String(x.from).slice(0, 10))]; }) };
    var secs = [{ title: 'Procedures', blocks: [list] }];
    var fnd = []; rows.forEach(function (x) { x.chk.forEach(function (c) { fnd.push([C(c.sev), C(c.rule), C(c.msg, c.rec), C(c.why)]); }); });
    secs.push({ title: 'Coding checks', blocks: [{ kind: 'note', text: 'ICAO Annex 11 Appendix 3 (designators), PANS-OPS Vol II Part III Section 2 Chapter 5 (path terminators, first and last legs, data per path terminator) and the EUROCONTROL coding guidelines for the ICAO IFP data set in AIXM 5.2 (drafts for review).' },
      { kind: 'table', title: 'Findings (' + fnd.length + ')', cols: ['Severity', 'Topic', 'Finding', 'Why'], rows: fnd.length ? fnd : [[C('—'), C(''), C('No finding'), C('')]] }] });
    rows.forEach(function (x) { secs.push({ title: (x.adCode ? x.adCode + ' ' : '') + x.kind + ' ' + (x.desig || x.name), blocks: AIP.procDetail(x.ds, x.r) }); });
    // terminal holdings and minimum sector altitudes of the aerodromes in the report
    var adSet = new Set(rows.map(function (x) { return x.ad; }).filter(Boolean)), extra = [];
    ctx.datasets.forEach(function (d) {
      ['HoldingPattern', 'SafeAltitudeArea', 'TerminalArrivalArea'].forEach(function (k) {
        (d.byType[k] || []).forEach(function (r) { var o = d.owner.get(r); if (o && adSet.has(o)) extra.push([C(M.shortName(o)), C(M.typeName(r)), C(M.label(d, r), r), C(String(r.cur.b || '').slice(0, 10))]); });
      });
    });
    if (extra.length) secs.push({ title: 'Holdings, MSA and TAA', blocks: [{ kind: 'table', title: 'Holdings, minimum sector altitudes and terminal arrival altitudes', cols: ['Aerodrome', 'Kind', 'Feature', 'Valid from'], rows: extra }] });
    var sc = { title: 'Instrument flight procedures' + (V.ifp.ad ? ' — ' + V.ifp.ad : ''), sub: rows.length + ' procedures', ds: rows[0] ? rows[0].ds : null, sections: secs };
    runReport(fmt, sc, ctx);
  }
  function runReport(fmt, sc, ctx) {
    try {
      if (fmt === 'pdf') EXPORTS.exportPDF(sc); else if (fmt === 'print') EXPORTS.print(sc); else if (fmt === 'xlsx') EXPORTS.exportExcel(sc); else if (fmt === 'csv') EXPORTS.exportCSV(sc);
    } catch (e) { ctx.toast('Report failed: ' + e.message, 6000); throw e; }
  }

  /* ------------------------------------------------------ aerodrome mapping */
  function amRecs(ds) { return ds.recs.filter(function (r) { return r.cur && r.cur.p && r.cur.p._amxm && !r.syn && !(r.cur && r.cur.gone); }); }
  function amVal(v) {
    if (v === undefined || v === null) return '';
    if (Array.isArray(v)) v = v[0];
    if (typeof v === 'object') { if (v.nil !== undefined) return '(' + (v.nil || 'nil') + ')'; if (v.v !== undefined) return v.v + (v.u ? ' ' + v.u : ''); if (v._geo) return ''; return ''; }
    return String(v);
  }
  function amRender(host, ctx) {
    var D = M.amxmDict(), F = V.am, sets = amxmOf(ctx.datasets), recs = [];
    sets.forEach(function (d) { amRecs(d).forEach(function (r) { recs.push({ ds: d, r: r, t: r.cur.p._amxm, ad: s(r.cur.p.idarpt) || '(none)' }); }); });
    var ads = {}, types = {};
    recs.forEach(function (x) { ads[x.ad] = (ads[x.ad] || 0) + 1; });
    var inAd = recs.filter(function (x) { return !F.ad || x.ad === F.ad; });
    inAd.forEach(function (x) { types[x.t] = (types[x.t] || 0) + 1; });
    if (F.type && !types[F.type]) F.type = '';
    var h = '<div class="kpis ov-kpis">' + [['aerodromes', Object.keys(ads).length], ['features', recs.length], ['feature types', Object.keys(types).length], ['data sets', sets.length]].map(function (k) { return '<div class="kpi-h"><b>' + num(k[1]) + '</b><span>' + k[0] + '</span></div>'; }).join('') + '</div>';
    h += '<div class="toolbar ov-filter"><select class="inp" data-ddf="ad"><option value="">All aerodromes</option>' + Object.keys(ads).sort().map(function (k) { return '<option' + (F.ad === k ? ' selected' : '') + '>' + esc(k) + '</option>'; }).join('') + '</select><span class="sp"></span>' +
      '<span class="muted">Report:</span><span class="btn-group">' + ['pdf:PDF', 'print:Print', 'xlsx:Excel', 'csv:CSV'].map(function (f) { var p = f.split(':'); return '<button class="btn small" data-amrep="' + p[0] + '" title="Inventory and every feature type with its AMXM attributes">' + p[1] + '</button>'; }).join('') + '</span></div>';
    h += layoutHtml(F) + (F.layout !== 'list' ? '<div class="ov-map am-map" role="application" aria-label="Aerodrome mapping map"></div>' : '') + '<div class="am-grid"' + (F.layout === 'map' ? ' hidden' : '') + '><div class="card card-pad am-types"><h3 style="margin-top:0">Feature types' + (F.ad ? ' at ' + esc(F.ad) : '') + '</h3><table class="mini-table"><tbody>' +
      Object.keys(types).sort().map(function (t) { return '<tr class="click' + (F.type === t ? ' ov-hl' : '') + '" data-amtype="' + esc(t) + '"><td>' + esc(t) + '</td><td class="num">' + num(types[t]) + '</td></tr>'; }).join('') + '</tbody></table></div><div class="am-feat">';
    if (F.type) {
      var fs = inAd.filter(function (x) { return x.t === F.type; }), def = D.features[F.type] || { attrs: [] };
      var attrs = def.attrs.filter(function (a) { return !/^geo(poly|line|pnt)$/.test(a.n); });
      var given = attrs.map(function (a) { return fs.filter(function (x) { var v = x.r.cur.p[a.n]; return v !== undefined && !(v && v.nil !== undefined); }).length; });
      h += '<div class="card card-pad"><h3 style="margin-top:0">' + esc(F.type) + ' <span class="muted" style="font-weight:400">— ' + num(fs.length) + ' feature(s)</span></h3>' + (def.doc ? '<p class="muted">' + esc(def.doc) + '</p>' : '') +
        '<div class="tbl-wrap ov-tbl"><table class="mini-table"><thead><tr><th>Aerodrome</th>' + attrs.map(function (a, i) { return '<th title="' + esc(a.d || '') + '">' + esc(a.n) + '<br><small class="muted">' + num(given[i]) + '/' + num(fs.length) + '</small></th>'; }).join('') + '<th></th></tr></thead><tbody>' +
        fs.slice(0, 2000).map(function (x) {
          return '<tr data-ami="' + recs.indexOf(x) + '"><td class="mono">' + esc(x.ad) + '</td>' + attrs.map(function (a) { var v = amVal(x.r.cur.p[a.n]), mean = v && M.amxmMeaning(F.type, a.n, v); return '<td' + (mean ? ' title="' + esc(mean) + '"' : '') + '>' + esc(v) + (mean ? ' <small class="muted">' + esc(mean) + '</small>' : '') + '</td>'; }).join('') +
            '<td class="nowrap"><button class="btn small ghost" data-ammap title="Show on the map">🗺</button><button class="btn small ghost" data-amdet title="All data">⋯</button></td></tr>';
        }).join('') + '</tbody></table></div>' + (fs.length > 2000 ? '<p class="muted">First 2,000 shown; the report has all.</p>' : '') + '</div>';
    } else h += '<div class="card card-pad muted">Choose a feature type to see its features with every AMXM attribute (the heading shows how many give it; code values with their meaning).</div>';
    h += '</div></div>';
    host.innerHTML = h;
    // the workspace map: the features of the chosen type (or every feature of the aerodrome chosen)
    var mm = null, mapEl = host.querySelector('.am-map');
    if (mapEl) {
      mm = DDMAP.create(mapEl, 'amxm:' + F.ad);
      var shown = F.type ? inAd.filter(function (x) { return x.t === F.type; }) : inAd;
      var tcol = {}, palette = ['#1d4e89', '#2e7d32', '#b0186e', '#ef6c00', '#6a1b9a', '#00838f', '#5d4037', '#c62828', '#558b2f', '#283593'];
      Object.keys(types).sort().forEach(function (t, i) { tcol[t] = palette[i % palette.length]; });
      DDMAP.shapes(mm, shown.slice(0, 8000).map(function (x) { return { key: x, g: M.geometry(x.ds, x.r), color: tcol[x.t] || '#1d4e89', label: x.ad + ' · ' + x.t + (M.label(x.ds, x.r) ? ' · ' + M.label(x.ds, x.r) : '') }; }),
        { legend: (F.type ? [F.type] : Object.keys(types).sort().slice(0, 10)).map(function (t) { return [tcol[t], t]; }), note: !F.type && Object.keys(types).length > 10 ? 'and ' + (Object.keys(types).length - 10) + ' more types' : '',
          onPick: function (x) { pickRow(host, recs.indexOf(x)); } });
      setTimeout(function () { if (mm) mm.map.invalidateSize(); }, 60);
    }
    host.onclick = function (e) {
      if (layoutClick(e, F, function () { amRender(host, ctx); })) return;
      var b = e.target.closest('[data-amtype],[data-ammap],[data-amdet],[data-amrep]');
      if (!b) return;
      if (b.hasAttribute('data-amtype')) { F.type = b.getAttribute('data-amtype'); amRender(host, ctx); return; }
      if (b.hasAttribute('data-amrep')) { amReport(b.getAttribute('data-amrep'), inAd, D, ctx); return; }
      var t = b.closest('[data-ami]'), x = t && recs[+t.getAttribute('data-ami')];
      if (!x) return;
      if (b.hasAttribute('data-ammap')) { if (mm) { DDMAP.selectShape(mm, x); pickRow(host, recs.indexOf(x)); } else ctx.showOnMap(x.ds, x.r); } else ctx.openDetail(x.ds, x.r);
    };
    filterHandler(host, F, function () { amRender(host, ctx); });
  }
  function amReport(fmt, recs, D, ctx) {
    var types = {};
    recs.forEach(function (x) { (types[x.t] || (types[x.t] = [])).push(x); });
    var adT = {};
    recs.forEach(function (x) { var k = x.ad + '|' + x.t; adT[k] = (adT[k] || 0) + 1; });
    var secs = [{ title: 'Inventory', blocks: [{ kind: 'table', title: 'Features by aerodrome and type', cols: ['Aerodrome', 'Feature type', 'Features'], rows: Object.keys(adT).sort().map(function (k) { var p = k.split('|'); return [C(p[0]), C(p[1]), C(adT[k])]; }) }] }];
    Object.keys(types).sort().forEach(function (t) {
      var def = D.features[t] || { attrs: [] }, attrs = def.attrs.filter(function (a) { return !/^geo(poly|line|pnt)$/.test(a.n); });
      secs.push({ title: t, blocks: [{ kind: 'table', title: t + ' (' + types[t].length + ')', cols: ['Aerodrome'].concat(attrs.map(function (a) { return a.n; })),
        rows: types[t].map(function (x) { return [C(x.ad, x.r)].concat(attrs.map(function (a) { var v = amVal(x.r.cur.p[a.n]), m = v && M.amxmMeaning(t, a.n, v); return C(v + (m ? ' (' + m + ')' : '')); })); }) }] });
    });
    runReport(fmt, { title: 'Aerodrome mapping data' + (V.am.ad ? ' — ' + V.am.ad : ''), sub: recs.length + ' features', ds: recs[0] ? recs[0].ds : null, sections: secs }, ctx);
  }

  return { render: render, has: has, sections: sections, open: function (sec) { V.sec = sec; } };
})();
