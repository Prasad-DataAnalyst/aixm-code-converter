/*!
 * AIXM Code Converter
 * Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com> - author of the AIXM Code Converter
 * SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE; keep this notice in all copies)
 * ==========================================================================
 * AIXM Code Converter - aerodrome mapping database tools (AMDBUI)
 * NOT FOR NAVIGATION - for study and analysis only.
 * Digital data -> Aerodrome mapping (AMDB):
 *   AMDB checks        the rules of src/amdb.js on the features loaded, run in a worker; results by rule, every
 *                      finding with its feature (AIXM code, map), a map of the findings, an audit report
 *   Build package      the aerodrome mapping package (amdbpkg.js)
 *   Sources & quality  who supplied each data set, under which licence, at which quality (amdbpkg.js)
 * Loaded only when one of these tabs is opened (src/lazy.js).
 * ========================================================================== */
/* global MODEL, AMDB, AMDBPKG, LAZY, DDMAP, EXPORTS, APP_INFO */
var AMDBUI = (function () {
  'use strict';
  var M = MODEL;
  function esc(t) { return String(t === undefined || t === null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(n) { return Number(n || 0).toLocaleString('en-US'); }
  var NOTICE = 'NOT FOR NAVIGATION — for study and analysis only. The checks follow ICAO documents, the public AMXM 2.0.2 schema and the EUROCONTROL supporting material for aerodrome mapping data sets; they help the people responsible for the data and are not a certification.';
  var SEVC = { error: '#c62828', warning: '#ef6c00', info: '#1d6fb8' };
  var ST = { ad: '', sev: '', rule: '', q: '', rules: false, layout: 'split', runs: {}, running: null, prog: 0 };
  var colCache = { key: '', col: null };

  // the features of the data loaded, as plain data (kept while the data sets and the date shown stay the same)
  function key(datasets) { return datasets.map(function (d) { return (d.id || d.name) + ':' + (d.viewDate || ''); }).join('|'); }
  function features(datasets) {
    var k = key(datasets);
    if (colCache.key !== k) colCache = { key: k, col: AMDB.collect(datasets, M) };
    return colCache.col;
  }
  function has(datasets) {
    return datasets.some(function (d) { return d.family === 'amxm' || AMDB.AIXM_MAPPING.some(function (k) { return (d.byType[k] || []).length; }); });
  }
  function recOf(ctx, f) { var ds = ctx.datasets[f.ref[0]]; return ds ? { ds: ds, r: ds.recs[f.ref[1]] } : null; }

  /* ---------------------------------------------------------- run in a worker */
  var BOOT = 'self.onmessage = function (e) { try { var r = AMDB.check(e.data.features, e.data.dict, { progress: function (p) { self.postMessage({ progress: p }); } }); self.postMessage({ ok: true, res: r }); }' +
    ' catch (x) { self.postMessage({ ok: false, err: String(x && x.stack || x) }); } };';
  function runChecks(list, onProg) {
    return new Promise(function (resolve, reject) {
      var w;
      try { w = LAZY.worker(['lazy-jsts', 'src-amdb'], BOOT); } catch (e) { reject(e); return; }
      w.onmessage = function (e) {
        if (e.data.progress !== undefined) { if (onProg) onProg(e.data.progress); return; }
        w.terminate();
        if (e.data.ok) resolve(e.data.res); else reject(new Error(e.data.err));
      };
      w.onerror = function (e) { w.terminate(); reject(new Error(e.message || 'worker error')); };
      w.postMessage({ features: list, dict: M.amxmDict() });
    });
  }
  function runKey(ctx) { return key(ctx.datasets) + '#' + ST.ad; }
  function last(ctx) { return ST.runs[runKey(ctx)] || null; }
  // the latest result of any scope for these data sets (Quality tab)
  function latest(datasets) {
    var k = key(datasets) + '#', best = null;
    Object.keys(ST.runs).forEach(function (x) { if (x.indexOf(k) === 0 && (!best || ST.runs[x].at > best.at)) best = ST.runs[x]; });
    return best;
  }

  /* ------------------------------------------------------------ checks view */
  function checks(host, ctx) {
    var col = features(ctx.datasets), ads = {};
    col.features.forEach(function (f) { var a = f.ad || '(none)'; ads[a] = (ads[a] || 0) + 1; });
    if (ST.ad && !ads[ST.ad]) ST.ad = '';
    var res = last(ctx), list = ST.ad ? col.features.filter(function (f) { return (f.ad || '(none)') === ST.ad; }) : col.features;
    var h = '<div class="nfo-box amdb-notice" role="note">⚠ ' + esc(NOTICE) + '</div>';
    h += '<div class="toolbar ov-filter"><select class="inp" data-amdb="ad" aria-label="Aerodrome"><option value="">All aerodromes (' + num(col.features.length) + ' features)</option>' +
      Object.keys(ads).sort().map(function (a) { return '<option value="' + esc(a) + '"' + (ST.ad === a ? ' selected' : '') + '>' + esc(a) + ' (' + num(ads[a]) + ')</option>'; }).join('') + '</select>' +
      '<button class="btn primary" data-amdbrun' + (ST.running ? ' disabled' : '') + '>' + (res ? 'Run the checks again' : 'Run the AMDB checks') + '</button>' +
      '<button class="btn small' + (ST.rules ? ' primary' : '') + '" data-amdbrules title="Every rule with its source">Rules (' + AMDB.RULES.length + ')</button><span class="sp"></span>' +
      (res ? '<span class="muted">Audit report:</span><span class="btn-group">' + ['pdf:PDF', 'print:Print', 'xlsx:Excel', 'csv:CSV', 'json:JSON'].map(function (f) { var p = f.split(':'); return '<button class="btn small" data-amdbrep="' + p[0] + '">' + p[1] + '</button>'; }).join('') + '</span>' : '') + '</div>';
    h += '<p class="muted amdb-scope">Data checked: ' + col.sets.map(function (s) { return esc(s.name) + ' <span class="chip">' + esc(s.kind) + '</span>'; }).join(' · ') + ' — ' + num(list.length) + ' feature(s)' + (ST.ad ? ' at ' + esc(ST.ad) : '') + '. The checks run in the background; reading files and the other tools are not slowed down.</p>';
    if (ST.running) h += '<div class="card card-pad"><span class="spinner"></span> Checking ' + num(list.length) + ' features against ' + AMDB.RULES.length + ' rules…<div class="progress"><div class="amdb-bar" style="width:' + Math.round(ST.prog * 100) + '%"></div></div></div>';
    if (ST.rules) h += rulesHtml(res);
    if (res && !ST.running) h += resultsHtml(res, col, ctx);
    else if (!ST.running) h += '<div class="card card-pad muted">Press <b>Run the AMDB checks</b>. ' + AMDB.RULES.length + ' rules in five groups — generic (AMXM schema), quality (PANS-AIM), geometry, functional and completeness — each with its source (<b>Rules</b>).</div>';
    host.innerHTML = h;
    if (res && !ST.running) drawMap(host, res, col, ctx);
    host.onclick = function (e) {
      var b = e.target.closest('[data-amdbrun],[data-amdbrules],[data-amdbrep],[data-amdbrule],[data-amdbf],[data-amdblay]');
      if (!b) return;
      if (b.hasAttribute('data-amdbrun')) { start(host, ctx, list); return; }
      if (b.hasAttribute('data-amdbrules')) { ST.rules = !ST.rules; checks(host, ctx); return; }
      if (b.hasAttribute('data-amdblay')) { ST.layout = b.getAttribute('data-amdblay'); checks(host, ctx); return; }
      if (b.hasAttribute('data-amdbrep')) { report(b.getAttribute('data-amdbrep'), res, col, ctx); return; }
      if (b.hasAttribute('data-amdbrule')) { ST.rule = ST.rule === b.getAttribute('data-amdbrule') ? '' : b.getAttribute('data-amdbrule'); checks(host, ctx); return; }
      var i = +b.closest('[data-amdbi]').getAttribute('data-amdbi'), x = res.findings[i], f = x && col.features[x.f];
      var act = b.getAttribute('data-amdbf');
      if (act === 'map' && host._mm) { DDMAP.selectShape(host._mm, x); pick(host, i); }
      else if (act === 'code' && f) { var o = recOf(ctx, f); if (o && o.r) ctx.openDetail(o.ds, o.r); }
    };
    host.oninput = host.onchange = function (e) {
      var k = e.target.getAttribute('data-amdb');
      if (!k) return;
      ST[k] = e.target.value;
      clearTimeout(host._t);
      host._t = setTimeout(function () { checks(host, ctx); var n = host.querySelector('[data-amdb="' + k + '"]'); if (n && n.tagName === 'INPUT') { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, k === 'q' ? 250 : 0);
    };
  }
  async function start(host, ctx, list) {
    if (ST.running) return;
    var k = runKey(ctx);
    ST.running = k; ST.prog = 0;
    checks(host, ctx);
    try {
      await LAZY.run('src-amdb');
      var res = await runChecks(list, function (p) { ST.prog = p; var b = host.querySelector('.amdb-bar'); if (b) b.style.width = Math.round(p * 100) + '%'; });
      res.at = new Date().toISOString(); res.scope = ST.ad || 'all aerodromes'; res.sets = features(ctx.datasets).sets;
      res.features = list.length;
      ST.runs[k] = res;
    } catch (e) { ctx.toast('The AMDB checks failed: ' + e.message, 8000); }
    ST.running = null; ST.rule = ''; ST.sev = '';
    if (host.isConnected) checks(host, ctx);
  }
  function filtered(res, col) {
    var q = ST.q.toLowerCase();
    return res.findings.map(function (x, i) { return { x: x, i: i }; }).filter(function (o) {
      var x = o.x, f = col.features[x.f];
      return (!ST.sev || x.sev === ST.sev) && (!ST.rule || x.r === ST.rule) && (!q || (x.r + ' ' + x.msg + ' ' + x.ad + ' ' + (f ? f.t + ' ' + f.label : '')).toLowerCase().indexOf(q) >= 0);
    });
  }
  function resultsHtml(res, col, ctx) {
    var byRule = {};
    res.findings.forEach(function (x) { byRule[x.r] = (byRule[x.r] || 0) + 1; });
    var ran = AMDB.RULES.filter(function (r) { return res.ran[r.id]; }).length, passed = AMDB.RULES.filter(function (r) { return res.ran[r.id] && !byRule[r.id]; }).length;
    var h = '<div class="kpis ov-kpis">' + [['errors', res.bySev.error, 'err'], ['warnings', res.bySev.warning, 'warn'], ['notes', res.bySev.info, ''], ['features checked', res.features, ''], ['rules passed', passed + ' / ' + ran, '']]
      .map(function (k) { return '<div class="kpi-h' + (k[2] && k[1] ? ' amdb-' + k[2] : '') + '"><b>' + (typeof k[1] === 'number' ? num(k[1]) : k[1]) + '</b><span>' + k[0] + '</span></div>'; }).join('') + '</div>';
    h += '<p class="muted">Checked ' + esc(res.at.slice(0, 16).replace('T', ' ')) + 'Z · ' + esc(res.scope) + ' · rules ' + esc(res.rules) + ' · geometry ' + esc(res.engine) + ' · ' + num(res.ms) + ' ms</p>';
    h += '<div class="card card-pad"><h3 style="margin-top:0">Results by rule</h3><div class="tbl-wrap"><table class="mini-table amdb-rules"><thead><tr><th>Rule</th><th>Group</th><th>Severity</th><th>Check</th><th class="num">Findings</th></tr></thead><tbody>' +
      AMDB.RULES.map(function (r) {
        var n = byRule[r.id] || 0, st = !res.ran[r.id] ? '<span class="muted">not run</span>' : n ? '<span class="chip ' + (r.sev === 'error' ? 'err' : r.sev === 'warning' ? 'warn' : '') + '">' + num(n) + '</span>' : '<span class="amdb-ok">✓ passed</span>';
        return '<tr class="' + (n ? 'click' : '') + (ST.rule === r.id ? ' ov-hl' : '') + '"' + (n ? ' data-amdbrule="' + r.id + '"' : '') + ' title="' + esc(r.why + ' Source: ' + r.src) + '"><td class="mono nowrap">' + r.id + '</td><td>' + r.grp + '</td><td>' + r.sev + '</td><td>' + esc(r.title) + '</td><td class="num">' + st + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
    var list = filtered(res, col);
    h += '<div class="toolbar ov-filter"><select class="inp" data-amdb="sev" aria-label="Severity"><option value="">All severities</option>' + ['error', 'warning', 'info'].map(function (s) { return '<option' + (ST.sev === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select>' +
      '<input class="inp" data-amdb="q" placeholder="Filter findings…" aria-label="Filter findings" value="' + esc(ST.q) + '">' + (ST.rule ? '<button class="btn small" data-amdbrule="' + ST.rule + '">✕ ' + ST.rule + '</button>' : '') +
      '<span class="sp"></span><span class="muted">' + num(list.length) + ' finding(s)</span>' +
      '<span class="pill-tabs ov-lay">' + [['split', 'Map + list'], ['map', 'Map'], ['list', 'List']].map(function (l) { return '<button data-amdblay="' + l[0] + '" class="' + (ST.layout === l[0] ? 'active' : '') + '">' + l[1] + '</button>'; }).join('') + '</span></div>';
    if (ST.layout !== 'list') h += '<div class="ov-map amdb-map" role="application" aria-label="Map of the findings"></div>';
    if (ST.layout !== 'map') {
      h += '<div class="tbl-wrap ov-tbl"><table class="mini-table amdb-find"><thead><tr><th>Severity</th><th>Rule</th><th>Aerodrome</th><th>Feature</th><th>Finding</th><th>Found</th><th>Expected</th><th></th></tr></thead><tbody>' +
        list.slice(0, 1500).map(function (o) {
          var x = o.x, f = col.features[x.f];
          return '<tr data-amdbi="' + o.i + '"><td><span class="chip ' + (x.sev === 'error' ? 'err' : x.sev === 'warning' ? 'warn' : '') + '">' + x.sev + '</span></td><td class="mono nowrap" title="' + esc(AMDB.RULE[x.r].title) + '">' + x.r + '</td><td class="mono">' + esc(x.ad) + '</td><td>' + (f ? esc(f.t) + (f.label ? ' <b>' + esc(f.label) + '</b>' : '') + ' <small class="muted">' + f.src + '</small>' : '') + '</td><td>' + esc(x.msg) + '</td><td>' + esc(x.found) + '</td><td>' + esc(x.expected) + '</td>' +
            '<td class="nowrap">' + (x.at ? '<button class="btn small ghost" data-amdbf="map" title="Show on the map">🗺</button>' : '') + (f ? '<button class="btn small ghost" data-amdbf="code" title="The feature and its code">⋯</button>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>' + (list.length > 1500 ? '<p class="muted">First 1,500 shown; the reports have all.</p>' : '') + (!res.findings.length ? '<div class="card card-pad">✓ No findings: every rule run passed.</div>' : '');
    }
    return h;
  }
  function drawMap(host, res, col, ctx) {
    var el = host.querySelector('.amdb-map');
    if (!el) { host._mm = null; return; }
    var mm = DDMAP.create(el, 'amdb:' + runKey(ctx)), items = [], list = filtered(res, col), shown = new Set();
    list.forEach(function (o) { if (o.x.f >= 0) shown.add(o.x.f); });
    // the features with a finding, faint, then the findings
    shown.forEach(function (fi) { var f = col.features[fi]; f.g.forEach(function (g) { items.push({ key: 'f' + fi, g: g, color: '#7a8796', label: f.t + (f.label ? ' ' + f.label : '') + ' (' + f.ad + ')' }); }); });
    list.slice(0, 5000).forEach(function (o) { if (o.x.at) items.push({ key: o.x, g: { t: 'P', c: o.x.at }, color: SEVC[o.x.sev], label: o.x.r + ' · ' + o.x.msg }); });
    DDMAP.shapes(mm, items, { legend: [[SEVC.error, 'error'], [SEVC.warning, 'warning'], [SEVC.info, 'note'], ['#7a8796', 'feature concerned']],
      onPick: function (k) { if (typeof k === 'object') pick(host, res.findings.indexOf(k)); } });
    host._mm = mm;
    setTimeout(function () { mm.map.invalidateSize(); }, 60);
  }
  function pick(host, i) {
    host.querySelectorAll('tr.ov-sel').forEach(function (n) { n.classList.remove('ov-sel'); });
    var tr = host.querySelector('tr[data-amdbi="' + i + '"]');
    if (tr) { tr.classList.add('ov-sel'); tr.scrollIntoView({ block: 'nearest' }); }
  }
  function rulesHtml(res) {
    return '<div class="card card-pad"><h3 style="margin-top:0">The rules</h3><p class="muted">Each finding cites its rule; each rule cites its source. Requirements of the EUROCAE ED-99 / RTCA DO-272 standards (sold by EUROCAE / RTCA) are not reproduced here.</p>' +
      '<div class="tbl-wrap"><table class="mini-table"><thead><tr><th>Rule</th><th>Group</th><th>Severity</th><th>Check</th><th>Why</th><th>Source</th></tr></thead><tbody>' +
      AMDB.RULES.map(function (r) { return '<tr><td class="mono nowrap">' + r.id + '</td><td>' + r.grp + '</td><td>' + r.sev + '</td><td>' + esc(r.title) + (res && !res.ran[r.id] ? ' <span class="muted">(not run)</span>' : '') + '</td><td>' + esc(r.why) + '</td><td><small>' + esc(r.src) + '</small></td></tr>'; }).join('') +
      '</tbody></table></div></div>';
  }

  /* ---------------------------------------------------------------- reports */
  function C(t, r) { var o = { t: t === undefined || t === null ? '' : String(t) }; if (r) o.r = r; return o; }
  function reportScope(res, col, ctx) {
    var byRule = {}; res.findings.forEach(function (x) { byRule[x.r] = (byRule[x.r] || 0) + 1; });
    var meta = [['Notice', NOTICE], ['Scope', res.scope + ' — ' + res.features + ' feature(s)'], ['Data sets', res.sets.map(function (s) { return s.name + ' (' + s.kind + ')'; }).join('; ')], ['Checked', res.at.slice(0, 19).replace('T', ' ') + 'Z'],
      ['Tool', APP_INFO.name + ' ' + APP_INFO.version + ' — created by ' + APP_INFO.author], ['Rules', 'AMDB rules ' + res.rules + ' (' + AMDB.RULES.length + ' rules)'], ['Geometry engine', res.engine],
      ['Result', res.bySev.error + ' error(s), ' + res.bySev.warning + ' warning(s), ' + res.bySev.info + ' note(s)']];
    return {
      title: 'Aerodrome mapping (AMDB) audit report' + (ST.ad ? ' — ' + ST.ad : ''), sub: 'NOT FOR NAVIGATION — study and analysis only', ds: ctx.datasets[res.sets[0] ? res.sets[0].i : 0] || null,
      sections: [
        { title: 'Summary', blocks: [{ kind: 'kv', rows: meta.map(function (m) { return { label: m[0], cells: [C(m[1])] }; }) }] },
        { title: 'Results by rule', blocks: [{ kind: 'table', cols: ['Rule', 'Group', 'Severity', 'Check', 'Result', 'Source'], rows: AMDB.RULES.map(function (r) { return [C(r.id), C(r.grp), C(r.sev), C(r.title), C(!res.ran[r.id] ? 'not run' : byRule[r.id] ? byRule[r.id] + ' finding(s)' : 'passed'), C(r.src)]; }) }] },
        { title: 'Findings', blocks: [{ kind: 'table', cols: ['Severity', 'Rule', 'Aerodrome', 'Feature', 'Finding', 'Found', 'Expected', 'Position'],
          rows: res.findings.map(function (x) { var f = col.features[x.f], o = f ? recOf(ctx, f) : null; return [C(x.sev), C(x.r), C(x.ad), C(f ? f.t + (f.label ? ' ' + f.label : '') + ' (' + f.src + ')' : '', o && o.r), C(x.msg), C(x.found), C(x.expected), C(x.at ? x.at[1].toFixed(7) + ', ' + x.at[0].toFixed(7) : '')]; }) }] },
        { title: 'Rules and their sources', blocks: [{ kind: 'table', cols: ['Rule', 'Check', 'Why', 'Source'], rows: AMDB.RULES.map(function (r) { return [C(r.id), C(r.title), C(r.why), C(r.src)]; }) }] },
        { title: 'Method and limits', blocks: [{ kind: 'note', text: 'Positions are WGS-84. Distances and areas are computed on a local plane about each aerodrome reference point (sinusoidal projection on the WGS-84 ellipsoid), exact to millimetres within a few kilometres. Overlaps and gaps use the JSTS geometry engine (a port of JTS). AIXM aerodrome features are checked as their AMXM counterparts (EUROCONTROL feature correspondences). A rule that passes means the rule found nothing, not that the data is complete or correct: positions are not compared with a survey or imagery. NOT FOR NAVIGATION.' }] }
      ]
    };
  }
  function report(fmt, res, col, ctx) {
    var sc = reportScope(res, col, ctx), base = EXPORTS.safeName('AMDB_audit_' + (ST.ad || 'all') + '_' + res.at.slice(0, 10));
    try {
      if (fmt === 'json') { EXPORTS.download(base + '.json', new Blob([JSON.stringify({ notice: NOTICE, tool: APP_INFO.name + ' ' + APP_INFO.version, author: APP_INFO.author, scope: res.scope, checked: res.at, sets: res.sets, rules: AMDB.RULES, result: { bySev: res.bySev, engine: res.engine, ms: res.ms },
        findings: res.findings.map(function (x) { var f = col.features[x.f]; return Object.assign({ feature: f ? { type: f.t, label: f.label, source: f.src } : null }, x); }) }, null, 1)], { type: 'application/json' })); return; }
      if (fmt === 'pdf') EXPORTS.exportPDF(sc); else if (fmt === 'print') EXPORTS.print(sc); else if (fmt === 'xlsx') EXPORTS.exportExcel(sc); else if (fmt === 'csv') EXPORTS.exportCSV(sc);
    } catch (e) { ctx.toast('Report failed: ' + e.message, 6000); }
  }

  /* -------------------------------------------------------------- entry points */
  // tab: 'checks' | 'package' | 'sources'
  async function render(tab, host, ctx) {
    if (tab === 'checks') { checks(host, ctx); return; }
    if (typeof AMDBPKG === 'undefined') { host.innerHTML = '<div class="card card-pad"><span class="spinner"></span> Loading…</div>'; await LAZY.run('src-amdbpkg'); }
    AMDBPKG.render(tab, host, ctx, { features: features, recOf: recOf, last: last, NOTICE: NOTICE });
  }
  return { render: render, has: has, latest: latest, features: features, NOTICE: NOTICE, runChecks: runChecks, state: ST };
})();
