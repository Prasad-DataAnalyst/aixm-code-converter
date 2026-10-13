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
 *   Aerodrome mapping      AMXM 2.0 data by aerodrome and feature type, every AMXM attribute, checks, reports;
 *                          the AMDB tools (checks, package, sources: amdb.js, amdbui.js, amdbpkg.js, loaded when opened)
 *   Terrain                terrain files, flight path and aerodrome terrain studies (terview.js)
 * Each section takes its own files too (an upload area in the section, before or after any data is loaded); the
 * Files view stays as it is. The AIP, map and export views are not changed; this tab only reads the data.
 * ========================================================================== */
/* global MODEL, AIP, EXPORTS, OBSTVIEW, DDMAP, MAPVIEW, TERVIEW, DEM, IFP, DDX, CONVERT, STUDY, LAZY, AMDBUI, AMDBX, AMDBOSM, AMDBDOC, AMDBTRACE, AMDBGEO, AMDBQ, FLTVIEW */
var DDVIEW = (function () {
  'use strict';
  var M = MODEL, s = M.s;
  function esc(t) { return String(t === undefined || t === null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(n) { return Number(n || 0).toLocaleString('en-US'); }
  var PROC = { StandardInstrumentDeparture: 'SID', StandardInstrumentArrival: 'STAR', InstrumentApproachProcedure: 'IAP' };
  var V = { sec: null, ifp: { ad: '', kind: '', q: '', layout: 'split', checks: false }, am: { ad: '', type: '', layout: 'split', tab: 'features', colorBy: 'chart' } };
  var KCOL = { SID: '#2e7d32', STAR: '#1565c0', IAP: '#b0186e' };
  var AM_AIXM = ['RunwayElement', 'TaxiwayElement', 'ApronElement', 'GuidanceLine', 'TaxiHoldingPosition'];

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
    // without AMXM: the AIXM aerodrome features (pavement, guidance lines, holding positions, stands) for the AMDB tools
    var nAx = nAm ? 0 : datasets.reduce(function (n, d) { return d.family === 'amxm' ? n : n + AM_AIXM.reduce(function (m, k) { return m + (d.byType[k] || []).length; }, 0); }, 0);
    // no mapping data at all: the runways of the AIP data set are enough to generate it (Generate from AIP)
    var nRwy = nAm ? 0 : datasets.reduce(function (n, d) { return d.family === 'amxm' || d.family === 'tab' || !d.byType ? n : n + (d.byType.Runway || []).length; }, 0);
    var nRwe = datasets.reduce(function (n, d) { return n + ((d.byType && d.byType.RunwayElement) || []).length; }, 0);
    return [
      { id: 'obs', title: 'Obstacles (eTOD)', n: nObs, what: 'obstacles', icon: '⛫' },
      { id: 'ifp', title: 'Procedures (IFP)', n: nProc, what: 'procedures', icon: '✈' },
      { id: 'amxm', title: 'Aerodrome mapping (AMDB)', n: nAm || nAx || nRwy, what: nAm ? 'AMXM features' : !nRwe && nRwy ? (nAx ? 'AIXM features · runways to generate from AIP' : 'runways — generate from AIP') : 'aerodrome features (AIXM)', gen: !nAm && !nRwe && nRwy > 0, icon: '▦' },
      { id: 'ter', title: 'Terrain', n: typeof DEM !== 'undefined' ? DEM.items().length : 0, what: 'terrain file(s)', icon: '⛰' },
      // flight & obstacle analysis (fltview.js, loaded when opened): take-off, approach, runway, eTOD areas, route, NOTAM
      { id: 'flt', title: 'Flight & obstacle analysis', n: nObs + datasets.reduce(function (n, d) { return n + ((d.byType && d.byType.Runway) || []).length; }, 0), what: 'take-off · approach · eTOD · route · NOTAM', icon: '⟁', always: true }
    ];
  }
  // the Terrain section also studies flight paths and aerodromes with online / built-in terrain, without a file
  function has(datasets) { return sections(datasets).some(function (x) { return x.n > 0; }); }

  function render(host, ctx) {
    var secs = sections(ctx.datasets);
    if (ctx.sec) V.sec = ctx.sec;
    else if (!V.sec || !secs.some(function (x) { return x.id === V.sec; })) V.sec = (secs.filter(function (x) { return x.n; })[0] || secs.filter(function (x) { return x.id === 'amxm'; })[0]).id;
    ctx.sec = null;
    host.innerHTML = '<div class="dd-head"><h1 class="view-title">Digital data</h1><p class="view-sub">The digital data sets besides the AIP data set — obstacles (eTOD), instrument flight procedures, aerodrome mapping and terrain — each with its own overview, lists, checks and reports, on all the data loaded.</p>' +
      '<div class="dd-secs" role="tablist">' + secs.map(function (x) {
        return '<button role="tab" class="dd-sec' + (V.sec === x.id ? ' on' : '') + '" data-ddsec="' + x.id + '"><span class="dd-ic" aria-hidden="true">' + x.icon + '</span><b>' + x.title + '</b><span>' + (x.id === 'ter' && !x.n ? 'flight paths, aerodromes, files' : x.always ? x.what : x.n ? num(x.n) + ' ' + x.what : 'none loaded — upload here') + '</span></button>';
      }).join('') + '</div></div><div class="dd-body"></div>';
    var body = host.querySelector('.dd-body');
    host.querySelector('.dd-secs').onclick = function (e) { var b = e.target.closest('[data-ddsec]'); if (b && !b.disabled) { V.sec = b.getAttribute('data-ddsec'); render(host, ctx); } };
    var cur = secs.filter(function (x) { return x.id === V.sec; })[0];
    if (V.sec === 'amxm') { amRender(body, ctx); return; }
    if (V.sec === 'flt') { fltRender(body, ctx); return; }
    // obstacles, procedures, terrain: their own upload area, then the section (when there is data, or for terrain always)
    body.innerHTML = upPanel(V.sec, !cur.n && V.sec !== 'ter') + '<div class="dd-main"></div>';
    upBind(body.querySelector('.dd-up'), V.sec, ctx);
    var main = body.querySelector('.dd-main');
    if (!cur.n && V.sec !== 'ter') return;
    if (V.sec === 'obs') { OBSTVIEW.render(main, ctx); var t = main.querySelector('.view-title'); if (t) t.outerHTML = ''; var sub = main.querySelector('.view-sub'); if (sub) sub.outerHTML = ''; }
    else if (V.sec === 'ifp') ifpRender(main, ctx);
    else TERVIEW.render(main, ctx);
  }
  // Flight & obstacle analysis: its code is loaded the first time the section is opened
  async function fltRender(body, ctx) {
    body.innerHTML = '<div class="muted" style="padding:14px"><span class="spinner"></span> Loading the flight & obstacle analysis…</div>';
    try {
      var ids = ['src-notamtxt', 'src-fltcalc', 'src-fltscene', 'src-fltview'];
      for (var i = 0; i < ids.length; i++) await LAZY.run(ids[i]);
      FLTVIEW.render(body, ctx);
    } catch (e) { body.innerHTML = '<div class="card card-pad" style="color:var(--err)">The analysis could not start: ' + esc(e.message) + '</div>'; }
  }
  /* ------------------------------------------------- upload in each section */
  var UP = {
    obs: ['obstacle data', '.xml,.zip,.xlsx,.xlsm,.xls,.ods,.csv', 'AIXM obstacle data sets (eTOD areas 1 to 4, AD 2.10), a cycle (.zip), eTOD tables (Excel or CSV)'],
    ifp: ['procedure data (IFP)', '.xml,.zip', 'AIXM 5.1 / 5.2 instrument flight procedure data sets (SID, STAR, approaches), or an AIP data set with its procedures, a cycle (.zip)'],
    ter: ['terrain data', '.tif,.tiff,.dt0,.dt1,.dt2,.hgt,.asc,.prj,.zip', 'GeoTIFF / BigTIFF, DTED (.dt0 / .dt1 / .dt2), SRTM (.hgt), ESRI ASCII grid (.asc) with its .prj — read block by block, any size']
  };
  function upPanel(kind, full) {
    var u = UP[kind];
    return '<div class="dd-up' + (full ? ' full' : '') + '" data-ddup="' + kind + '"><div class="dd-up-drop" tabindex="0" role="button" aria-label="Load ' + esc(u[0]) + '"><span class="dd-up-ic" aria-hidden="true">⬆</span><span><b>' + (full ? 'Load ' : 'Add ') + esc(u[0]) + '</b> — drop files here or click to choose<br><span class="muted">' + esc(u[2]) + '</span></span><input type="file" multiple class="hidden" accept="' + u[1] + '"></div>' +
      (full ? '<p class="muted">The files are read in this browser and sent nowhere. They also show in Files, like any file loaded.</p>' : '') + '<div class="muted dd-up-st"></div></div>';
  }
  function upBind(el, kind, ctx) {
    if (!el) return;
    var drop = el.querySelector('.dd-up-drop'), inp = el.querySelector('input'), st = el.querySelector('.dd-up-st');
    async function take(files) {
      var list = Array.prototype.slice.call(files || []); if (!list.length) return;
      st.innerHTML = '<span class="spinner"></span> Reading ' + esc(list.map(function (f) { return f.name; }).join(', ')) + ' …';
      try { var A = window.__AIXM; await A.addFiles(list); await A.extractAll({ stay: true }); A.go('digital', { sec: kind }); }
      catch (e) { st.innerHTML = '<span style="color:var(--err)">' + esc(e.message) + '</span>'; }
    }
    drop.onclick = function () { inp.click(); };
    drop.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click(); } };
    ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); e.stopPropagation(); drop.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); e.stopPropagation(); drop.classList.remove('over'); }); });
    drop.addEventListener('drop', function (e) { take(e.dataTransfer && e.dataTransfer.files); });
    inp.onchange = function () { var f = Array.prototype.slice.call(inp.files); inp.value = ''; take(f); };
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
  // AIXM export of procedures: those listed or all, with legs, fixes, runways and related data
  function ifpAixmPanel(rows, all, ctx) {
    if (typeof DDX === 'undefined') return '';
    var dss = Array.from(new Set(all.map(function (x) { return x.ds; })));
    return DDX.panel('ifp', {
      title: 'Procedures in AIXM', what: '— with their legs, fixes, navaids and runways, and related data if wished',
      scopes: [['list', 'the ' + num(rows.length) + ' procedure(s) listed', rows.length], ['all', 'all ' + num(all.length) + ' procedures', all.length]],
      versions: DDX.versions(dss),
      related: [['holdings', 'Holdings, MSA and TAA', 'of the aerodromes'], ['obstacles', 'Obstacles near the paths', 'within the distance of the legs'], ['aerodrome', 'The aerodromes', 'runways, taxiways, lights … (AIP data set)'],
        ['over', 'Airspace over the aerodromes', 'CTR, ATZ, TMA …'], ['navaids', 'Navaids and points', 'within 10 NM of the aerodromes']],
      nm: 1, note: 'Fixes, navaids and runways in the AIP data set are taken from it when it is in the same AIXM version (or when the file is converted).',
      run: async function (o) {
        var list = o.scope === 'all' ? all : rows, seeds = [], rel = [];
        list.forEach(function (x) { seeds.push({ ds: x.ds, r: x.r }); AIP.procLegs(x.ds, x.r).forEach(function (l) { seeds.push({ ds: x.ds, r: l.leg }); }); });
        var ads = []; list.forEach(function (x) { if (x.ad && !ads.some(function (a) { return a.ad === x.ad; })) ads.push({ ds: x.adDs, ad: x.ad }); });
        var kinds = ['holdings', 'aerodrome', 'over', 'navaids'].filter(function (k) { return o.rel.has(k); });
        if (kinds.length && ads.length) rel = rel.concat(CONVERT.related(ads, ctx.datasets, { kinds: new Set(kinds), nm: 10 }));
        if (o.rel.has('obstacles')) { var mine = new Set(list.map(function (x) { return x.r; })); rel = rel.concat(DDX.obstaclesNear(ctx.datasets, STUDY.segments(ctx.datasets).filter(function (sg) { return mine.has(sg.pr); }), o.nm)); }
        await DDX.aixm(seeds, rel, o.ver, 'procedures ' + (o.scope === 'all' ? 'all' : 'listed') + ' (' + list.length + ')', Array.from(o.rel).join(', '), o.prog);
      }
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
      }).join('') + '</tbody></table></div>' + (F.checks ? checksHtml(rows) : '') + ifpAixmPanel(rows, all, ctx) + '</div></div>';
    host.innerHTML = h;
    if (typeof DDX !== 'undefined') DDX.bind(host);
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
  // AMXM features as delivered (AMXM) or written as AIXM 5.x, with the AIXM data of the aerodrome if wished
  function amAixmPanel(recs, inAd, sets, ctx) {
    if (typeof DDX === 'undefined') return '';
    var F = V.am, nType = F.type ? inAd.filter(function (x) { return x.t === F.type; }).length : 0;
    return DDX.panel('amxm', {
      title: 'Aerodrome mapping in AMXM / AIXM', what: '— as delivered (AMXM) or written as AIXM 5.x aerodrome features',
      scopes: [['type', F.type ? 'the ' + num(nType) + ' ' + F.type + ' feature(s)' : 'the type chosen (choose one)', nType], ['ad', F.ad ? 'all ' + num(inAd.length) + ' features of ' + F.ad : 'the aerodrome chosen (choose one)', F.ad ? inAd.length : 0], ['all', 'all ' + num(recs.length) + ' features', recs.length]],
      versions: DDX.versions(sets),
      related: [['aerodrome', 'The aerodrome in AIXM', 'from the AIP data set (AIXM versions only)'], ['over', 'Airspace over the aerodrome', 'CTR, ATZ, TMA …'], ['obstacles', 'Obstacles', 'within the distance (obstacle data sets)']],
      nm: 5, note: 'AIXM is written from the AMXM attributes the tool reads (runway, taxiway and apron elements, thresholds, stands, holding positions …).',
      run: async function (o) {
        var list = o.scope === 'type' ? inAd.filter(function (x) { return x.t === F.type; }) : o.scope === 'ad' ? inAd : recs;
        var seeds = list.map(function (x) { return { ds: x.ds, r: x.r }; }), codes = Array.from(new Set(list.map(function (x) { return x.ad; })));
        var ads = DDX.adsByCode(ctx.datasets.filter(function (d) { return d.family !== 'amxm'; }), codes), kinds = ['aerodrome', 'over', 'obstacles'].filter(function (k) { return o.rel.has(k); });
        var rel = kinds.length && ads.length ? CONVERT.related(ads, ctx.datasets, { kinds: new Set(kinds), nm: o.nm }) : [];
        await DDX.aixm(seeds, rel, o.ver, 'aerodrome mapping ' + (o.scope === 'type' ? F.type : o.scope === 'ad' ? F.ad : 'all') + ' (' + list.length + ')', Array.from(o.rel).join(', '), o.prog);
      }
    });
  }
  // Aerodrome mapping: the features (AMXM) and the AMDB tools - checks, package, sources (loaded when opened)
  var AM_TABS = [['upload', '📤 Upload'], ['features', 'Features'], ['checks', 'AMDB checks'], ['package', 'Build package'], ['sources', 'Sources & quality'], ['generate', 'Generate from AIP'], ['trace', '✏️ Trace on imagery'], ['fit', '📏 Fit for use'], ['compare', 'Compare'], ['guide', '📘 How to create AMDB']];
  // two paths, step by step: viewing aerodrome mapping data, or creating it (from the AIP data set, the State's charts,
  // OpenStreetMap and imagery); "All tools" shows every tool as a tab. [tab, step, what to do now, optional]
  var AM_FLOW = {
    view: { name: 'View AMDB data', steps: [
      ['upload', 'Load', 'Drop your aerodrome mapping data: AMXM 2.0 (.xml), AIXM 5.x aerodrome features, a package (.zip), GeoPackage, GeoJSON, CSV with WKT or DXF.'],
      ['features', 'Look', 'The features on a map drawn as an aerodrome chart, by aerodrome and type, with their attributes. 🗻 3D opens the aerodrome in 3D.'],
      ['checks', 'Check', 'Run the 36 AMDB rules — schema, accuracy and integrity, geometry, functions. Each finding is on the map with its feature; the audit report goes out as PDF or Excel.'],
      ['fit', 'Fit for use', 'Is each feature accurate enough for its use (ICAO PANS-AIM)? Load a survey or a supplier\'s data beside it to measure the real accuracy.'],
      ['compare', 'Compare', 'Two versions — two cycles, two suppliers: what was added, removed, moved or changed, with a change file.', true],
      ['package', 'Export', 'Write the data as a package — AMXM 2.0, AIXM 5.1.1, GeoPackage, GIS and CAD formats — with its report and checksums.']] },
    create: { name: 'Create AMDB data', steps: [
      ['upload', 'Sources', 'Load the AIP data set of the aerodrome, then add what you have: the State\'s charts (PDF), OpenStreetMap (Get), your orthophoto. Below: what each source gives and what is still missing.'],
      ['trace', 'Fill the gaps', 'Place the State\'s charts on the map, and trace what no source gives (stands, taxiways, aprons) on licensed imagery or on a placed chart. Skip it if nothing is missing.', true],
      ['generate', 'Generate', 'Choose the aerodrome, see its readiness item by item, and generate everything the sources give, in AMXM 2.0.'],
      ['features', 'Look', 'The generated features on the aerodrome chart map, each saying where it comes from. 🗻 3D opens it in 3D.'],
      ['checks', 'Check', 'Run the 36 AMDB rules on what was generated; fix a source and generate again if needed.'],
      ['fit', 'Fit for use', 'How accurate each feature is from its source, against ICAO PANS-AIM — and what still needs a survey.'],
      ['package', 'Package', 'Write the package — AMXM 2.0, AIXM 5.1.1, GeoPackage, GIS, CAD — with its report; the licences of the sources are in Sources & quality.']] }
  };
  var AM_MKEY = 'aixm-amdb-mode';
  function amSaved() { try { return localStorage.getItem(AM_MKEY) || ''; } catch (e) { return ''; } }
  function amSetMode(m) { V.am.mode = m; try { localStorage.setItem(AM_MKEY, m); } catch (e) { /* kept for this session */ } }
  // what is loaded: aerodrome mapping data (AMXM, AIXM aerodrome features), an AIP data set with runways, generated data
  function amState(ctx) {
    var am = amxmOf(ctx.datasets), gen = am.filter(function (d) { return /_generated_from_AIP/i.test(d.name); }).length;
    var ax = ctx.datasets.some(function (d) { return d.family !== 'amxm' && d.byType && AM_AIXM.some(function (k) { return (d.byType[k] || []).length; }); });
    var aip = ctx.datasets.some(function (d) { return d.family !== 'amxm' && d.family !== 'tab' && d.byType && (d.byType.Runway || []).length; });
    return { data: am.length > gen || ax, amxm: am.length > gen, gen: gen > 0, aip: aip };
  }
  // done | todo | opt (optional) | wait (an earlier step first)
  function amStep(mode, id, S) {
    var seen = (V.am.seen || {})[mode] || {}, has = S.data || S.gen;
    if (mode === 'view') { if (id === 'upload') return has ? 'done' : 'todo'; if (!has) return 'wait'; return seen[id] ? 'done' : id === 'compare' ? 'opt' : 'todo'; }
    if (id === 'upload') return S.aip ? 'done' : 'todo';
    if (id === 'trace') return !S.aip ? 'wait' : seen.trace ? 'done' : 'opt';
    if (id === 'generate') return S.gen ? 'done' : S.aip ? 'todo' : 'wait';
    return !S.gen ? 'wait' : seen[id] ? 'done' : 'todo';
  }
  function amRender(host, ctx) {
    var F = V.am, S = amState(ctx);
    F.seen = F.seen || {};
    if (F.mode === undefined) F.mode = amSaved();
    // without a choice yet: what is loaded decides (aerodrome mapping files to view; an AIP data set to create from)
    var mode = F.mode || (S.amxm ? 'view' : S.aip || S.gen ? 'create' : S.data ? 'view' : '');
    var flow = AM_FLOW[mode], steps = flow ? flow.steps : null;
    var first = steps ? (steps.filter(function (x) { return amStep(mode, x[0], S) === 'todo'; })[0] || steps[steps.length - 1])[0] : 'upload';
    var sec = sections(ctx.datasets).filter(function (x) { return x.id === 'amxm'; })[0];
    if (!F.picked) F.tab = steps ? first : mode === 'all' ? (!sec.n ? 'upload' : sec.gen ? 'generate' : 'features') : 'upload';
    var modes = '<div class="am-modes" role="group" aria-label="What would you like to do?">' + [['view', '👁', 'View AMDB data', 'I have aerodrome mapping data'], ['create', '🛠', 'Create AMDB data', 'from the AIP, the State\'s charts, OpenStreetMap, imagery'], ['all', '⚙', 'All tools', 'every tool, as tabs']].map(function (m) {
      return '<button class="am-mode' + (mode === m[0] ? ' on' : '') + '" data-ammode="' + m[0] + '" aria-pressed="' + (mode === m[0]) + '"><span class="am-mode-ic" aria-hidden="true">' + m[1] + '</span><b>' + m[2] + '</b><span>' + esc(m[3]) + '</span></button>';
    }).join('') + '</div>';
    var h = '<div class="am-flow">' + modes;
    if (!mode) h += '<div class="am-choose"><p><b>What would you like to do?</b> Choose a path above — each goes step by step — or drop your files below: the tool sees what they are and picks the path.</p></div>';
    else if (mode === 'all') h += '<div class="pill-tabs am-tabs" role="tablist" aria-label="Aerodrome mapping tools">' + AM_TABS.map(function (t) { return '<button role="tab" class="' + (F.tab === t[0] ? 'active' : '') + '" data-amtab="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>';
    else {
      var at = steps.map(function (x) { return x[0]; }).indexOf(F.tab), cur = steps[at];
      h += '<ol class="am-steps" aria-label="' + esc(flow.name) + ', step by step">' + steps.map(function (x, i) {
        var st = amStep(mode, x[0], S);
        return '<li><button class="am-step st-' + st + (i === at ? ' on' : '') + (x[0] === first && st === 'todo' && i !== at ? ' next' : '') + '" data-amtab="' + x[0] + '"' + (i === at ? ' aria-current="step"' : '') + '><span class="am-step-n">' + (st === 'done' ? '✓' : i + 1) + '</span><span class="am-step-t">' + esc(x[1]) + (x[3] ? ' <i>optional</i>' : '') + '</span></button></li>';
      }).join('') + '</ol>';
      if (cur) {
        var st0 = amStep(mode, cur[0], S), need = steps.filter(function (x, i) { return i < at && amStep(mode, x[0], S) === 'todo'; })[0];
        h += '<div class="am-now" role="status"><div><span class="am-now-n">Step ' + (at + 1) + ' of ' + steps.length + (cur[3] ? ' · optional' : '') + '</span> <b>' + esc(cur[1]) + '</b> — ' + esc(cur[2]) +
          (st0 === 'wait' && need ? '<br><span class="am-wait">⚠ First: <button class="linkbtn" data-amtab="' + need[0] + '">step ' + (steps.indexOf(need) + 1) + ' · ' + esc(need[1]) + '</button></span>' : '') + '</div>' +
          '<div class="am-now-btns">' + (at > 0 ? '<button class="btn small" data-amtab="' + steps[at - 1][0] + '">← ' + esc(steps[at - 1][1]) + '</button>' : '') + (at < steps.length - 1 ? ' <button class="btn small primary" data-amtab="' + steps[at + 1][0] + '">' + (cur[3] ? 'Skip to ' : 'Next: ') + esc(steps[at + 1][1]) + ' →</button>' : '') + '</div></div>';
      } else h += '<div class="am-now" role="status"><div><b>' + esc((AM_TABS.filter(function (t) { return t[0] === F.tab; })[0] || ['', ''])[1]) + '</b> — an extra tool, beside the steps.</div><div class="am-now-btns"><button class="btn small" data-amtab="' + first + '">← Back to the steps</button></div></div>';
    }
    h += '<div class="am-extra">' + (mode && mode !== 'all' ? '<button class="linkbtn" data-amtab="guide">📘 How to create AMDB</button>' + (mode === 'create' ? ' · <button class="linkbtn" data-amtab="sources">Sources &amp; quality</button> · <button class="linkbtn" data-amtab="compare">Compare</button>' : ' · <button class="linkbtn" data-amtab="sources">Sources &amp; quality</button>') : '') + '</div></div><div class="am-body"></div>';
    host.innerHTML = h;
    host.querySelector('.am-flow').onclick = function (e) {
      var m = e.target.closest('[data-ammode]'); if (m) { amSetMode(m.getAttribute('data-ammode')); F.picked = false; amRender(host, ctx); return; }
      var b = e.target.closest('[data-amtab]'); if (b) { F.tab = b.getAttribute('data-amtab'); F.picked = true; amRender(host, ctx); var fl = host.querySelector('.am-flow'); if (fl && fl.getBoundingClientRect().top < 0) fl.scrollIntoView({ block: 'start' }); }
    };
    var body = host.querySelector('.am-body');
    if (mode) (F.seen[mode] = F.seen[mode] || {})[F.tab] = true;
    var c2 = Object.assign({}, ctx, { amMode: mode });
    if (F.tab === 'features') { amFeatures(body, c2); return; }
    amdbTools(F.tab, body, c2);
  }
  async function amdbTools(tab, body, ctx) {
    body.innerHTML = '<div class="card card-pad"><span class="spinner"></span> Loading the aerodrome mapping tools…</div>';
    try {
      await LAZY.run('src-amdb'); await LAZY.run('src-amdbui');
      var x = /^(generate|compare|guide|upload|trace|fit)$/.test(tab);
      if (x && typeof AMDBX === 'undefined') { await LAZY.run('src-amdbpkg'); await LAZY.run('src-amdbx'); }
      // the sources of generation: OpenStreetMap, the State's charts and documents, what was traced on imagery
      if (/^(generate|upload|trace)$/.test(tab)) { if (typeof AMDBOSM === 'undefined') await LAZY.run('src-amdbosm'); if (typeof AMDBDOC === 'undefined') await LAZY.run('src-amdbdoc'); if (typeof AMDBTRACE === 'undefined') await LAZY.run('src-amdbtrace'); if (typeof AMDBGEO === 'undefined') await LAZY.run('src-amdbgeo'); }
      if (tab === 'fit' && typeof AMDBQ === 'undefined') await LAZY.run('src-amdbq');
      if (V.am.tab !== tab || !body.isConnected) return;
      var host = body.parentNode && body.parentNode.closest ? body.closest('.dd-body') : null;
      var c2 = Object.assign({}, ctx, { amTab: function (t2, reload) { V.am.tab = t2; V.am.picked = true; if (reload || !host) window.__AIXM.go('digital'); else amRender(host, ctx); } });
      if (x) await AMDBX.render(tab, body, c2); else await AMDBUI.render(tab, body, c2);
    } catch (e) { body.innerHTML = '<div class="card card-pad">The aerodrome mapping tools could not start: ' + esc(e.message) + '</div>'; }
  }
  // the aerodrome mapping of the aerodrome chosen (or all shown) in the 3D view, over the Map tab
  function am3d(list, ctx) {
    var b = [180, 90, -180, -90], PAVE = /^(RunwayElement|TaxiwayElement|ApronElement|ParkingStandArea|FinalApproachAndTakeOffArea|TouchDownLiftOffArea|Stopway|RunwayShoulder|DeicingArea)$/;
    var pave = list.filter(function (x) { return PAVE.test(x.t); });
    if (!pave.length) pave = list.filter(function (x) { return /^(RunwayThreshold|AerodromeReferencePoint|RunwayCenterlinePoint)$/.test(x.t); });
    if (pave.length) list = pave;
    list.forEach(function (x) { var g = M.geometry(x.ds, x.r); (function walk(gg) { if (!gg) return; if (gg.t === 'M') { gg.parts.forEach(walk); return; } (gg.t === 'P' ? [gg.c] : gg.t === 'L' ? gg.c : gg.c[0]).forEach(function (c) { if (typeof c[0] !== 'number') return; b[0] = Math.min(b[0], c[0]); b[1] = Math.min(b[1], c[1]); b[2] = Math.max(b[2], c[0]); b[3] = Math.max(b[3], c[1]); }); })(g); });
    if (b[0] > b[2]) { ctx.toast('No aerodrome mapping feature with a position.'); return; }
    var cy = (b[1] + b[3]) / 2, my = 0.006, mx = my / Math.cos(cy * Math.PI / 180);
    if (b[2] - b[0] > 0.6 || b[3] - b[1] > 0.45) { ctx.toast('Choose one aerodrome (the list above) to see it in 3D.'); return; }
    var bb = [b[0] - mx, b[1] - my, b[2] + mx, b[3] + my];
    window.__AIXM.go('map');
    setTimeout(function () { var ll = MAPVIEW.leaflet(); if (ll) ll.fitBounds([[bb[1], bb[0]], [bb[3], bb[2]]]); MAPVIEW.open3d('area', null, { bbox: bb, tight: true }); }, 400);
  }
  // labels of the aerodrome chart: runway designators at the thresholds, taxiway, apron and stand names
  function amChartLabel(t, p) {
    if (t === 'RunwayThreshold' || t === 'HelipadThreshold') return s(p.idthr) ? [s(p.idthr), 13, 'ddm-rwy'] : null;
    if (t === 'TaxiwayElement' || t === 'TaxiwayGuidanceLine') return s(p.idlin) ? [s(p.idlin), 16, 'ddm-twy'] : null;
    if (t === 'ApronElement') return s(p.idapron) ? [s(p.idapron), 15, 'ddm-apn'] : null;
    if (t === 'ParkingStandLocation') return s(p.idstd) ? [s(p.idstd), 17, 'ddm-std'] : null;
    if (t === 'ParkingStandArea') return s(p.idstd) ? [s(p.idstd), 17, 'ddm-std ddm-sta'] : null;
    if (t === 'StandGuidanceLine') return null;
    if (t === 'TaxiwayHoldingPosition') return s(p.rwyahtxt) ? [s(p.rwyahtxt), 17, 'ddm-hold'] : null;
    if (t === 'DeicingArea') return s(p.ident) ? [s(p.ident), 15, 'ddm-apn'] : null;
    if (t === 'VerticalPointStructure' && s(p.pntsttyp) === '9') return null;
    if (t === 'AerodromeReferencePoint') return [s(p.idarpt) + (s(p.name) ? ' ' + s(p.name) : ''), 0, 'ddm-arp'];
    if (t === 'Hotspot') return s(p.idhot) ? [s(p.idhot), 15, 'ddm-hot'] : null;
    return null;
  }
  function amFeatures(host, ctx) {
    var D = M.amxmDict(), F = V.am, sets = amxmOf(ctx.datasets), recs = [];
    if (!sets.length) {
      var cnt = {};
      ctx.datasets.forEach(function (d) { AM_AIXM.concat(['AircraftStand', 'RunwayCentrelinePoint']).forEach(function (k) { var n = (d.byType[k] || []).length; if (n) cnt[k] = (cnt[k] || 0) + n; }); });
      host.innerHTML = '<div class="card card-pad"><h3 style="margin-top:0">No AMXM file loaded</h3><p>The AIXM data loaded has aerodrome features: ' + Object.keys(cnt).sort().map(function (k) { return esc(k) + ' ' + num(cnt[k]); }).join(' · ') +
        '. <b>AMDB checks</b> check them as their AMXM counterparts and <b>Build package</b> writes them as an aerodrome mapping package (AMXM 2.0 and AIXM, with metadata).</p>' +
        (AM_AIXM.some(function (k) { return cnt[k]; }) ? '' : '<p>There are no runway, taxiway or apron elements, guidance lines or holding positions yet: <button class="btn small primary" data-amgo="generate">Generate from AIP</button> builds runway elements, thresholds, stopways, the reference point and stands from the runway data (coarse, labelled as such), or open survey, CAD or GIS files (AMXM, GeoJSON, CSV with WKT, DXF, GeoPackage) on Files.</p>') + '</div>';
      var go = host.querySelector('[data-amgo]');
      if (go) go.onclick = function () { F.tab = 'generate'; F.picked = true; amRender(host.closest('.dd-body') || host.parentNode, ctx); };
      return;
    }
    sets.forEach(function (d) { amRecs(d).forEach(function (r) { recs.push({ ds: d, r: r, t: r.cur.p._amxm, ad: s(r.cur.p.idarpt) || '(none)' }); }); });
    var ads = {}, types = {};
    recs.forEach(function (x) { ads[x.ad] = (ads[x.ad] || 0) + 1; });
    var inAd = recs.filter(function (x) { return !F.ad || x.ad === F.ad; });
    inAd.forEach(function (x) { types[x.t] = (types[x.t] || 0) + 1; });
    if (F.type && !types[F.type]) F.type = '';
    var h = '<div class="kpis ov-kpis">' + [['aerodromes', Object.keys(ads).length], ['features', recs.length], ['feature types', Object.keys(types).length], ['data sets', sets.length]].map(function (k) { return '<div class="kpi-h"><b>' + num(k[1]) + '</b><span>' + k[0] + '</span></div>'; }).join('') + '</div>';
    h += '<div class="toolbar ov-filter"><select class="inp" data-ddf="ad"><option value="">All aerodromes</option>' + Object.keys(ads).sort().map(function (k) { return '<option' + (F.ad === k ? ' selected' : '') + '>' + esc(k) + '</option>'; }).join('') + '</select><span class="sp"></span>' +
      '<button class="btn small primary" data-am3d title="The aerodrome in 3D: surfaces, markings, lights (also at night), obstacles and navaids">🗻 3D</button>' +
      '<span class="muted">Report:</span><span class="btn-group">' + ['pdf:PDF', 'print:Print', 'xlsx:Excel', 'csv:CSV'].map(function (f) { var p = f.split(':'); return '<button class="btn small" data-amrep="' + p[0] + '" title="Inventory and every feature type with its AMXM attributes">' + p[1] + '</button>'; }).join('') + '</span></div>';
    h += layoutHtml(F) + (F.layout !== 'list' ? '<span class="pill-tabs ov-lay am-colby" title="Colours on the map">' + [['chart', 'Aerodrome chart'], ['type', 'Colour: feature type'], ['source', 'Colour: source']].map(function (l) { return '<button data-amcol="' + l[0] + '" class="' + (F.colorBy === l[0] ? 'active' : '') + '">' + l[1] + '</button>'; }).join('') + '</span>' : '') + (F.layout !== 'list' ? '<div class="ov-map am-map" role="application" aria-label="Aerodrome mapping map"></div>' : '') + '<div class="am-grid"' + (F.layout === 'map' ? ' hidden' : '') + '><div class="card card-pad am-types"><h3 style="margin-top:0">Feature types' + (F.ad ? ' at ' + esc(F.ad) : '') + '</h3><table class="mini-table"><tbody>' +
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
    h += amAixmPanel(recs, inAd, sets, ctx) + '</div></div>';
    host.innerHTML = h;
    if (typeof DDX !== 'undefined') DDX.bind(host);
    // the workspace map: the features of the chosen type (or every feature of the aerodrome chosen)
    var mm = null, mapEl = host.querySelector('.am-map');
    if (mapEl) {
      mm = DDMAP.create(mapEl, 'amxm:' + F.ad);
      var shown = F.type ? inAd.filter(function (x) { return x.t === F.type; }) : inAd;
      var tcol = {}, palette = ['#1d4e89', '#2e7d32', '#b0186e', '#ef6c00', '#6a1b9a', '#00838f', '#5d4037', '#c62828', '#558b2f', '#283593'];
      // colour by feature type, or by source (the AMXM source attribute: who supplied each feature)
      var srcOf = function (x) { return s(x.r.cur.p.source) || '(source not given)'; }, keyOf = F.colorBy === 'source' ? srcOf : function (x) { return x.t; };
      var keys = {}; shown.forEach(function (x) { var k = keyOf(x); keys[k] = (keys[k] || 0) + 1; });
      Object.keys(keys).sort().forEach(function (t, i) { tcol[t] = palette[i % palette.length]; });
      var chart = F.colorBy === 'chart';
      DDMAP.shapes(mm, shown.slice(0, 8000).map(function (x) {
        var it = { key: x, g: M.geometry(x.ds, x.r), color: tcol[keyOf(x)] || '#1d4e89', label: x.ad + ' · ' + x.t + (M.label(x.ds, x.r) ? ' · ' + M.label(x.ds, x.r) : '') + (F.colorBy === 'source' ? ' · ' + srcOf(x) : '') };
        if (chart) { var p = x.r.cur.p; it.style = DDMAP.chartStyle(x.t, { pntsttyp: s(p.pntsttyp), lgtuse: s(p.lgtuse) }); var lb = amChartLabel(x.t, p); if (lb) { it.text = lb[0]; it.minZ = lb[1]; it.textCls = lb[2]; } }
        return it;
      }),
        { legend: chart ? DDMAP.CHART_LEGEND : Object.keys(keys).sort().slice(0, 10).map(function (t) { return [tcol[t], t]; }), note: chart ? 'labels appear as you zoom in' : Object.keys(keys).length > 10 ? 'and ' + (Object.keys(keys).length - 10) + ' more' : '',
          onPick: function (x) { pickRow(host, recs.indexOf(x)); } });
      setTimeout(function () { if (mm) mm.map.invalidateSize(); }, 60);
    }
    host.onclick = function (e) {
      if (layoutClick(e, F, function () { amFeatures(host, ctx); })) return;
      if (e.target.closest('[data-am3d]')) { am3d(inAd, ctx); return; }
      var cb = e.target.closest('[data-amcol]');
      if (cb) { F.colorBy = cb.getAttribute('data-amcol'); amFeatures(host, ctx); return; }
      var b = e.target.closest('[data-amtype],[data-ammap],[data-amdet],[data-amrep]');
      if (!b) return;
      if (b.hasAttribute('data-amtype')) { F.type = b.getAttribute('data-amtype'); amFeatures(host, ctx); return; }
      if (b.hasAttribute('data-amrep')) { amReport(b.getAttribute('data-amrep'), inAd, D, ctx); return; }
      var t = b.closest('[data-ami]'), x = t && recs[+t.getAttribute('data-ami')];
      if (!x) return;
      if (b.hasAttribute('data-ammap')) { if (mm) { DDMAP.selectShape(mm, x); pickRow(host, recs.indexOf(x)); } else ctx.showOnMap(x.ds, x.r); } else ctx.openDetail(x.ds, x.r);
    };
    filterHandler(host, F, function () { amFeatures(host, ctx); });
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

  return { render: render, has: has, sections: sections, open: function (sec, tab) { V.sec = sec; if (tab) V.am.tab = tab; }, current: function () { return V.sec; } };
})();
