/*!
 * AIXM Code Converter
 * Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com> - author of the AIXM Code Converter
 * SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE; keep this notice in all copies)
 * ==========================================================================
 * AIXM Code Converter - Terrain section of the Digital data tab (TERVIEW)
 *   files         every terrain file: format, posts, spacing and the PANS-AIM area it meets, reference systems,
 *                 voids, statistics, checks
 *   map           shaded relief of the files (read block by block for the area shown), coverage, aerodromes and
 *                 flight paths; a click reads the elevation
 *   flight paths  for every leg: highest terrain and obstacle within its corridor against its lowest altitude
 *                 and an indicative minimum obstacle clearance (study.js); caution / warning / below
 *   aerodromes    highest terrain within 5 / 10 / 25 NM, terrain above the Annex 14 surfaces
 *   cross-check   elevations in the AIXM data (aerodromes, runway points, navaids, obstacle bases) against the
 *                 terrain files, with a tolerance
 *   reports       PDF, print, Excel, CSV with map pictures
 * Without terrain files the studies use online terrain tiles (when online) or the built-in model, and say so.
 * ========================================================================== */
/* global L, AX, MODEL, DEM, DEMF, STUDY, DDMAP, OBSTVIEW, OLS, EXPORTS */
var TERVIEW = (function () {
  'use strict';
  var M = MODEL, s = M.s;
  function esc(t) { return String(t === undefined || t === null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(n, d) { return n === null || n === undefined || isNaN(n) ? '—' : Number(n).toLocaleString('en-US', { maximumFractionDigits: d === undefined ? 0 : d }); }
  function fmtSize(n) { return n > 1073741824 ? (n / 1073741824).toFixed(2) + ' GB' : n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
  var V = { tab: 'files', layout: 'split', tol: 15, ad: '', fp: null, fpRun: false, adRes: {}, xc: null };
  var SEVC = { error: '#c62828', warning: '#ef6c00', caution: '#e0a800', ok: '#2e7d32', info: '#5b6676' };

  /* --------------------------------------------------------------- checks */
  function fileChecks(it) {
    var r = it.r, out = [];
    function add(sev, t) { out.push({ sev: sev, t: t }); }
    if (it.status !== 'ready') { add('error', 'Not readable: ' + it.err); return out; }
    (r.warnings || []).forEach(function (w) { add(/cannot|not supported/.test(w) ? 'error' : 'warning', w); });
    if (r.crs.kind === 'unknown') add('error', 'Reference system ' + r.crs.label + ': the file cannot be placed.');
    if (!r.vDatum) add('warning', 'Vertical datum not stated in the file (PANS-AIM: elevations relative to MSL via EGM-96).');
    if (r.area === 0) add('warning', 'Post spacing ' + num(Math.max.apply(null, r.spacingArcsec), 2) + '″ is coarser than Area 1 (3″).');
    else if (r.area) add('ok', 'Post spacing meets PANS-AIM Area ' + r.area + ' (' + DEMF.AREAS[r.area].spacing + ').');
    if (it.stats) {
      var vp = it.stats.posts ? 100 * it.stats.voids / it.stats.posts : 0;
      if (vp > 0) add(vp > 1 ? 'warning' : 'info', num(vp, 2) + ' % of the posts are voids (no data)' + (it.stats.exact ? '' : ' (counted on an overview)') + '.');
      else add('ok', 'No voids' + (it.stats.exact ? '' : ' (counted on an overview)') + '.');
      if (it.stats.min !== null && it.stats.min < -450) add('warning', 'Lowest value ' + num(it.stats.min) + ' m: below the lowest land on Earth — a no-data value not declared?');
      if (it.stats.max !== null && it.stats.max > 8900) add('warning', 'Highest value ' + num(it.stats.max) + ' m: above the highest point on Earth — check the vertical unit.');
    }
    if (r.levels.length === 1 && r.width * r.height > 25e6) add('info', 'No internal overviews: the map is slower at small scales (add overviews, e.g. gdaladdo).');
    if (r.thin > 1) add('info', 'Large ASCII grid: every ' + r.thin + '. post kept in memory.');
    return out;
  }

  /* ----------------------------------------------------------- cross-check */
  function elevPoints(datasets) {
    var out = [];
    function ep(p) { var e = p && (Array.isArray(p) ? p[0] : p); return e && e.elevation ? e.elevation : null; }
    datasets.forEach(function (ds) {
      (ds.byType.AirportHeliport || []).forEach(function (r) { var p = r.cur.p, c = M.pointOf(ds, r), e = ep(p.ARP) || p.fieldElevation; if (c && e) out.push({ ds: ds, r: r, c: c, what: 'Aerodrome reference point', name: M.shortName(r) + ' ' + s(p.name), e: e }); });
      (ds.byType.RunwayCentrelinePoint || []).forEach(function (r) { var p = r.cur.p, c = M.pointOf(ds, r), e = ep(p.location); if (c && e) out.push({ ds: ds, r: r, c: c, what: 'Runway ' + (s(p.role) || 'point').toLowerCase(), name: M.label(ds, r), e: e }); });
      ['Navaid', 'VOR', 'DME', 'NDB', 'Localizer', 'Glidepath'].forEach(function (k) { (ds.byType[k] || []).forEach(function (r) { var p = r.cur.p, c = M.pointOf(ds, r), e = ep(p.location); if (c && e) out.push({ ds: ds, r: r, c: c, what: k, name: M.label(ds, r), e: e }); }); });
    });
    return out;
  }
  function toM(q) { q = Array.isArray(q) ? q[0] : q; if (!q || q.v === undefined) return null; var v = parseFloat(q.v); return isNaN(v) ? null : /FT/i.test(q.u || '') ? v * 0.3048 : v; }
  async function crossCheck(ctx) {
    var pts = elevPoints(ctx.datasets).filter(function (x) { return DEM.has(x.c[0], x.c[1]); }), out = [];
    for (var i = 0; i < pts.length; i++) {
      var x = pts[i], e = toM(x.e), g = await DEM.elevation(x.c[0], x.c[1]);
      if (e === null || !g) continue;
      // a runway point or a reference point lies on the ground; a navaid's elevation may be its antenna
      out.push({ x: x, pub: e, ter: g.h, diff: e - g.h, file: g.item.name });
    }
    // obstacle bases
    var sets = OBSTVIEW.model(ctx.datasets).sets;
    for (var j = 0; j < sets.length; j++) for (var k = 0; k < sets[j].rows.length; k++) {
      var o = sets[j].rows[k];
      if (!o.c || o.elev === null || o.hgt === null || !DEM.has(o.c[0], o.c[1])) continue;
      var gg = await DEM.elevation(o.c[0], o.c[1]);
      if (gg) out.push({ x: { ds: o.ds, r: o.r, c: o.c, what: 'Obstacle base (elevation − height)', name: o.id || o.name }, pub: o.elev - o.hgt, ter: gg.h, diff: o.elev - o.hgt - gg.h, file: gg.item.name });
    }
    return out.sort(function (a, b) { return Math.abs(b.diff) - Math.abs(a.diff); });
  }

  /* --------------------------------------------------------------- render */
  function render(host, ctx) {
    var items = DEM.items(), segs = STUDY.segments(ctx.datasets), ads = [];
    ctx.datasets.forEach(function (d) { (d.byType.AirportHeliport || []).forEach(function (a) { var c = M.pointOf(d, a); if (c) ads.push({ ds: d, r: a, c: c, code: M.shortName(a) }); }); });
    var ready = items.filter(function (i) { return i.status === 'ready'; });
    var fine = ready.map(function (i) { return Math.max.apply(null, i.r.spacingArcsec || [99]); }).sort(function (a, b) { return a - b; })[0];
    var h = '<div class="kpis ov-kpis">' + [[num(items.length), 'terrain files'], [fine ? num(fine, 2) + '″' : '—', 'finest post spacing'], [ready.length ? 'Area ' + (Math.max.apply(null, ready.map(function (i) { return i.r.area || 0; })) || '—') : '—', 'best PANS-AIM area met'],
      [num(segs.length), 'procedure legs'], [num(ads.length), 'aerodromes'], [fmtSize(DEM.cacheBytes()), 'terrain in memory']].map(function (k) { return '<div class="kpi-h"><b>' + k[0] + '</b><span>' + k[1] + '</span></div>'; }).join('') + '</div>';
    if (!items.length) h += '<div class="note-box">No terrain file loaded: the studies below use ' + (navigator.onLine ? 'online terrain tiles (about 30 m) where available, else ' : '') + 'the built-in global model (indicative). Add terrain files (GeoTIFF, DTED, .hgt, ESRI ASCII grid) on the Files page for the State\'s own terrain data.</div>';
    var tabs = [['files', 'Terrain files'], ['fp', 'Flight paths'], ['ad', 'Aerodromes'], ['xc', 'Cross-check AIXM'], ['rep', 'Reports']];
    h += '<div class="pill-tabs ov-tabs">' + tabs.map(function (t) { return '<button data-tvtab="' + t[0] + '" class="' + (V.tab === t[0] ? 'active' : '') + '">' + t[1] + '</button>'; }).join('') + '</div>';
    h += '<div class="pill-tabs ov-lay" style="margin-bottom:8px">' + [['split', 'Map + panel'], ['map', 'Map'], ['list', 'Panel']].map(function (l) { return '<button data-tvlay="' + l[0] + '" class="' + (V.layout === l[0] ? 'active' : '') + '">' + l[1] + '</button>'; }).join('') + '</div>';
    h += '<div class="ov-split ov-' + V.layout + '">' + (V.layout !== 'list' ? '<div class="ov-map tv-map" role="application" aria-label="Terrain map"></div>' : '') + '<div class="ov-listcol tv-panel">' + panelHtml(ctx, items, segs, ads) + '</div></div>';
    host.innerHTML = h;
    var mapEl = host.querySelector('.tv-map'), mm = null;
    if (mapEl) { mm = DDMAP.create(mapEl, 'ter'); drawMap(mm, ctx, items, segs, ads); setTimeout(function () { mm.map.invalidateSize(); }, 60); }
    host.onclick = function (e) {
      var b = e.target.closest('[data-tvtab],[data-tvlay],[data-tvrun],[data-tvad],[data-tvxc],[data-tvrep],[data-tvpick],[data-tvrm]');
      if (!b) return;
      if (b.hasAttribute('data-tvtab')) { V.tab = b.getAttribute('data-tvtab'); render(host, ctx); return; }
      if (b.hasAttribute('data-tvlay')) { V.layout = b.getAttribute('data-tvlay'); render(host, ctx); return; }
      if (b.hasAttribute('data-tvrm')) { var it = items[+b.getAttribute('data-tvrm')]; if (it) { DEM.remove(it); render(host, ctx); } return; }
      if (b.hasAttribute('data-tvrun')) { runFp(host, ctx, segs); return; }
      if (b.hasAttribute('data-tvad')) { V.ad = b.getAttribute('data-tvad'); runAd(host, ctx, ads); return; }
      if (b.hasAttribute('data-tvxc')) { runXc(host, ctx); return; }
      if (b.hasAttribute('data-tvrep')) { report(b.getAttribute('data-tvrep'), ctx, segs, ads); return; }
      if (b.hasAttribute('data-tvpick') && mm) { var p = b.getAttribute('data-tvpick').split(',').map(Number); mm.map.setView([p[1], p[0]], Math.max(mm.map.getZoom(), 12)); L.popup().setLatLng([p[1], p[0]]).setContent(esc(b.getAttribute('title') || '')).openOn(mm.map); }
    };
    host.oninput = function (e) { if (e.target.getAttribute('data-tvtol') !== null) { V.tol = +e.target.value || 15; var t = host.querySelector('.tv-xc-body'); if (t && V.xc) t.innerHTML = xcTable(); } };
  }
  function sevChip(sv) { return '<span class="sev ' + (sv === 'caution' ? 'warning' : sv === 'ok' ? 'info' : sv) + '" style="' + (sv === 'ok' ? 'color:#2e7d32;background:#e4f4ec' : '') + '">' + sv + '</span>'; }
  function panelHtml(ctx, items, segs, ads) {
    if (V.tab === 'files') {
      if (!items.length) return '<div class="card card-pad muted">No terrain file loaded.</div>';
      return items.map(function (it, i) {
        var r = it.r, st = it.stats;
        var rows = it.status !== 'ready' ? [['Status', it.status + (it.err ? ': ' + it.err : '')]] : [
          ['Format', r.format + ' · ' + r.dataType + ' · ' + r.compression + (r.predictor !== 'none' ? ' + ' + r.predictor + ' predictor' : '') + ' · ' + r.byteOrder],
          ['Posts', num(r.width) + ' × ' + num(r.height) + ' (' + r.layout + (r.overviews ? ', ' + r.overviews + ' overview(s)' : '') + ')' + (r.thin > 1 ? ' — every ' + r.thin + '. post of ' + num(r.origWidth) + ' × ' + num(r.origHeight) : '')],
          ['Post spacing', r.spacingArcsec ? num(r.spacingArcsec[0], 3) + '″ × ' + num(r.spacingArcsec[1], 3) + '″ (' + num(r.spacingM[0], 1) + ' × ' + num(r.spacingM[1], 1) + ' m)' : '—'],
          ['PANS-AIM area', r.area ? 'spacing meets Area ' + r.area + ' (' + DEMF.AREAS[r.area].spacing + '); accuracy required: ' + DEMF.AREAS[r.area].vAcc + ' m vertical, ' + DEMF.AREAS[r.area].hAcc + ' m horizontal' : 'coarser than Area 1'],
          ['Horizontal reference', r.crs.label + ' · posts as ' + (r.pointIs === 'point' ? 'points (PixelIsPoint)' : 'cell areas (PixelIsArea)')],
          ['Vertical', (r.vDatum || 'datum not stated') + ' · unit ' + r.vUnit + (r.nodata !== undefined && r.nodata !== null && !isNaN(r.nodata) ? ' · no data ' + r.nodata : '')],
          ['Extent', r.bbox ? AX.dms(r.bbox[1], false, 0) + ' … ' + AX.dms(r.bbox[3], false, 0) + ', ' + AX.dms(r.bbox[0], true, 0) + ' … ' + AX.dms(r.bbox[2], true, 0) : '—'],
          ['Statistics', st ? num(st.min, 1) + ' … ' + num(st.max, 1) + ' m, mean ' + num(st.mean, 1) + ' m' + (st.top ? ' · highest at ' + AX.dms(st.top[1], false, 1) + ' ' + AX.dms(st.top[0], true, 1) : '') + (st.exact ? '' : ' (from an overview)') : 'reading…'],
          ['Metadata', [r.meta && r.meta.software, r.meta && r.meta.date, r.meta && r.meta.description, r.meta && r.meta.accuracy, r.meta && r.meta.citation].filter(Boolean).join(' · ') || '—']];
        return '<div class="card card-pad"><div class="ov-card-h"><b>⛰ ' + esc(it.name) + '</b><span class="chip">' + fmtSize(it.size) + '</span><span class="sp"></span>' + (st && st.top ? '<button class="btn small ghost" data-tvpick="' + st.top[0] + ',' + st.top[1] + '" title="Highest point ' + num(st.max, 1) + ' m">Highest point</button>' : '') + '<button class="btn small ghost" data-tvrm="' + i + '" title="Remove">✕</button></div>' +
          '<table class="mini-table">' + rows.map(function (x) { return '<tr><td class="muted">' + x[0] + '</td><td>' + esc(x[1]) + '</td></tr>'; }).join('') + '</table>' +
          '<h4 style="margin:10px 0 4px">Checks</h4><ul class="tv-checks">' + fileChecks(it).map(function (c) { return '<li>' + sevChip(c.sev) + ' ' + esc(c.t) + '</li>'; }).join('') + '</ul></div>';
      }).join('');
    }
    if (V.tab === 'fp') {
      var head = '<div class="card card-pad"><p style="margin-top:0">For every leg of the ' + num(segs.length) + ' procedure legs loaded: the highest terrain within ±0.5 NM of the path and the highest obstacle there, against the lowest published altitude of the leg and an indicative minimum obstacle clearance of its phase (arrival / initial 300 m, intermediate 150 m, final 75 m, missed approach 50 m, departure 90 m). <i>Indicative — not a PANS-OPS procedure assessment.</i></p>' +
        '<button class="btn primary" data-tvrun' + (V.fpRun ? ' disabled' : '') + '>' + (V.fp ? 'Run again' : 'Run the flight path study') + '</button> <span class="muted tv-prog"></span></div>';
      if (!segs.length) return head + '<div class="card card-pad muted">No procedure loaded (SID, STAR, approaches): load the AIP or IFP data set.</div>';
      return head + (V.fp ? fpTable() : '');
    }
    if (V.tab === 'ad') {
      return '<div class="card card-pad"><p style="margin-top:0">Highest terrain within 5, 10 and 25 NM of the aerodrome reference point and terrain above the Annex 14 obstacle limitation surfaces.</p><div class="tv-ads">' +
        ads.slice(0, 300).map(function (a) { return '<button class="btn small' + (V.ad === a.code ? ' primary' : '') + '" data-tvad="' + esc(a.code) + '">' + esc(a.code) + '</button>'; }).join('') + '</div><span class="muted tv-prog"></span></div>' + (V.ad && V.adRes[V.ad] ? adHtml(V.adRes[V.ad]) : '');
    }
    if (V.tab === 'xc') {
      return '<div class="card card-pad"><p style="margin-top:0">Elevations in the AIXM data (aerodrome reference points, runway points, navaids, obstacle bases) against the terrain files at the same place. Tolerance <input class="inp" data-tvtol style="width:70px" value="' + V.tol + '"> m.</p>' +
        '<button class="btn primary" data-tvxc' + (DEM.items().length ? '' : ' disabled') + '>Compare</button> <span class="muted tv-prog"></span>' + (DEM.items().length ? '' : ' <span class="muted">(needs a terrain file)</span>') + '</div><div class="tv-xc-body">' + (V.xc ? xcTable() : '') + '</div>';
    }
    return '<div class="card card-pad"><p style="margin-top:0">The terrain report: files and checks, the cross-check with the AIXM data, the flight path study and the aerodrome studies, with map pictures.</p><div class="btn-group">' +
      ['pdf:PDF', 'print:Print', 'xlsx:Excel', 'csv:CSV'].map(function (f) { var p = f.split(':'); return '<button class="btn" data-tvrep="' + p[0] + '">' + p[1] + '</button>'; }).join('') + '</div><p class="muted tv-prog" style="margin-bottom:0"></p></div>';
  }
  function fpTable() {
    var list = V.fp.slice().sort(function (a, b) { var r = { error: 0, warning: 1, caution: 2, info: 3, ok: 4 }; return r[a.sev] - r[b.sev] || (a.clr === null ? 1e9 : a.clr) - (b.clr === null ? 1e9 : b.clr); });
    var cnt = {}; list.forEach(function (x) { cnt[x.sev] = (cnt[x.sev] || 0) + 1; });
    return '<div class="card card-pad"><div class="row wrap" style="gap:8px">' + ['error', 'warning', 'caution', 'ok', 'info'].filter(function (k) { return cnt[k]; }).map(function (k) { return sevChip(k) + ' ' + cnt[k]; }).join(' · ') + '</div>' +
      '<div class="tbl-wrap ov-tbl"><table class="mini-table"><thead><tr><th></th><th>Leg</th><th>Phase</th><th>Altitude</th><th>Highest terrain</th><th>Obstacle</th><th>Clearance</th><th>MOC (ind.)</th></tr></thead><tbody>' +
      list.map(function (x) {
        return '<tr><td>' + sevChip(x.sev) + '</td><td>' + esc(x.seg.label) + '</td><td>' + esc(x.seg.phase) + '</td><td>' + esc(x.seg.altTxt || '—') + '</td><td class="num">' + (x.terrain !== null ? '<a href="#" data-tvpick="' + x.at[0] + ',' + x.at[1] + '" title="Highest terrain ' + num(x.terrain) + ' m">' + num(x.terrain) + ' m</a>' : '—') + '</td>' +
          '<td>' + (x.obstacle ? esc(x.obstacle.id || x.obstacle.name) + ' ' + num(x.obstacle.elev) + ' m' : '') + '</td><td class="num"><b>' + (x.clr !== null ? num(x.clr) + ' m' : '—') + '</b></td><td class="num">' + x.seg.moc + ' m</td></tr>';
      }).join('') + '</tbody></table></div><p class="muted" style="margin-bottom:0">Terrain: ' + esc((V.fp[0] && V.fp[0].src) || '—') + '. Altitudes converted to metres; FL as pressure altitude.</p></div>';
  }
  function adHtml(r) {
    return '<div class="card card-pad"><h3 style="margin-top:0">' + esc(r.code) + ' — terrain around the aerodrome</h3><table class="mini-table"><thead><tr><th>Within</th><th>Highest terrain</th><th>At</th></tr></thead><tbody>' +
      r.res.rings.map(function (rg, i) { var x = r.res.highest[i]; return '<tr><td>' + rg + ' NM</td><td class="num"><b>' + (x ? num(x.h) + ' m (' + num(x.h / 0.3048) + ' ft)' : '—') + '</b></td><td>' + (x ? '<a href="#" data-tvpick="' + x.at[0] + ',' + x.at[1] + '" title="' + num(x.h) + ' m">' + num(x.d, 1) + ' NM ' + ('00' + Math.round(x.brg)).slice(-3) + '°T</a>' : '') + '</td></tr>'; }).join('') + '</tbody></table>' +
      '<h4>Terrain above the Annex 14 surfaces' + (r.S ? '' : ' — runways of the aerodrome not in the data') + '</h4>' + (r.res.pens.length ? '<table class="mini-table"><thead><tr><th>Surface</th><th>Above by</th><th>Terrain</th><th>From ARP</th></tr></thead><tbody>' +
      r.res.pens.map(function (p) { return '<tr><td>' + esc(p.surface) + '</td><td class="num q-err">+' + num(p.pen, 1) + ' m</td><td class="num">' + num(p.h) + ' m</td><td><a href="#" data-tvpick="' + p.at[0] + ',' + p.at[1] + '" title="' + esc(p.surface) + '">' + num(p.d, 1) + ' NM ' + ('00' + Math.round(p.brg)).slice(-3) + '°T</a></td></tr>'; }).join('') + '</tbody></table>' : '<p class="muted">' + (r.S ? 'None found on the sampled grid (' + r.res.cell + ' m cells).' : '—') + '</p>') +
      '<p class="muted" style="margin-bottom:0">Terrain: ' + esc(r.res.src || '—') + '; grid of about ' + r.res.cell + ' m.</p></div>';
  }
  function xcTable() {
    var tol = V.tol, bad = V.xc.filter(function (x) { return Math.abs(x.diff) > tol; }).length;
    return '<div class="card card-pad"><p style="margin-top:0"><b>' + num(V.xc.length) + '</b> elevations compared, <b class="' + (bad ? 'q-err' : '') + '">' + num(bad) + '</b> differ by more than ' + tol + ' m.</p><div class="tbl-wrap ov-tbl"><table class="mini-table"><thead><tr><th>Feature</th><th>Kind</th><th>Published</th><th>Terrain</th><th>Difference</th><th>File</th></tr></thead><tbody>' +
      V.xc.slice(0, 1500).map(function (x) { var off = Math.abs(x.diff) > tol; return '<tr' + (off ? ' class="ov-bad"' : '') + '><td><a href="#" data-tvpick="' + x.x.c[0] + ',' + x.x.c[1] + '" title="' + esc(x.x.name) + '">' + esc(x.x.name) + '</a></td><td>' + esc(x.x.what) + '</td><td class="num">' + num(x.pub, 1) + ' m</td><td class="num">' + num(x.ter, 1) + ' m</td><td class="num"><b' + (off ? ' class="q-err"' : '') + '>' + (x.diff > 0 ? '+' : '') + num(x.diff, 1) + ' m</b></td><td class="muted">' + esc(x.file) + '</td></tr>'; }).join('') + '</tbody></table></div>' +
      '<p class="muted" style="margin-bottom:0">A navaid\'s elevation may be that of its antenna; runway points and reference points lie on the ground. Large differences: wrong datum, unit, position or terrain.</p></div>';
  }
  function prog(host, t) { var p = host.querySelector('.tv-prog'); if (p) p.textContent = t; }
  async function runFp(host, ctx, segs) {
    V.fpRun = true; prog(host, 'studying the legs…');
    var obs = [].concat.apply([], OBSTVIEW.model(ctx.datasets).sets.map(function (x) { return x.rows; }));
    try { V.fp = await STUDY.legTerrain(segs, obs, { onProgress: function (q) { prog(host, 'studying the legs… ' + Math.round(q * 100) + ' %'); } }); } finally { V.fpRun = false; }
    render(host, ctx);
  }
  async function runAd(host, ctx, ads) {
    var a = ads.filter(function (x) { return x.code === V.ad; })[0];
    if (!a) return;
    if (!V.adRes[V.ad]) {
      prog(host, 'studying the terrain around ' + V.ad + '…');
      var S = null; try { S = OLS.surfaces(a.ds, a.r); } catch (e) { S = null; }
      V.adRes[V.ad] = { code: V.ad, a: a, S: S, res: await STUDY.aroundAerodrome(a.c, S) };
    }
    render(host, ctx);
  }
  async function runXc(host, ctx) { prog(host, 'comparing…'); V.xc = await crossCheck(ctx); var b = host.querySelector('.tv-xc-body'); if (b) b.innerHTML = xcTable(); prog(host, ''); }

  /* ------------------------------------------------------------------- map */
  function drawMap(mm, ctx, items, segs, ads) {
    var b = L.latLngBounds([]);
    items.forEach(function (it) { if (it.r && it.r.corners) { var pg = L.polygon(it.r.corners.map(function (c) { return [c[1], c[0]]; }), { color: '#6a1b9a', weight: 1.5, fill: false, dashArray: '5 4', interactive: false }).addTo(mm.layers); b.extend(pg.getBounds()); } });
    if (items.length) {
      var GL = L.GridLayer.extend({ createTile: function (coords, done) {
        var tile = document.createElement('canvas'); tile.width = tile.height = 256;
        var nw = mm.map.unproject([coords.x * 256, coords.y * 256], coords.z), se = mm.map.unproject([(coords.x + 1) * 256, (coords.y + 1) * 256], coords.z);
        var bb = [nw.lng, se.lat, se.lng, nw.lat];
        if (!items.some(function (it) { var ib = it.r && it.r.bbox; return ib && !(ib[2] < bb[0] || ib[0] > bb[2] || ib[3] < bb[1] || ib[1] > bb[3]); })) { setTimeout(function () { done(null, tile); }, 0); return tile; }
        DEM.grid(bb, 64, 64).then(function (g) { shadeTile(tile, g, 64, (bb[3] - bb[1]) * 111320 / 64); done(null, tile); }).catch(function (e) { done(e, tile); });
        return tile;
      } });
      new GL({ opacity: 0.85, pane: 'overlayPane', maxNativeZoom: 15 }).addTo(mm.layers);
    }
    segs.slice(0, 600).forEach(function (sg) { L.polyline(sg.coords.filter(function (p) { return typeof p[0] === 'number'; }).map(function (p) { return [p[1], p[0]]; }), { color: { SID: '#2e7d32', STAR: '#1565c0', IAP: '#b0186e' }[sg.kind], weight: 2, dashArray: sg.dashed ? '6 5' : null }).bindTooltip(esc(sg.label + (sg.altTxt ? ' · ' + sg.altTxt : '')), { sticky: true }).addTo(mm.layers); });
    ads.forEach(function (a) { L.circleMarker([a.c[1], a.c[0]], { radius: 5, color: '#0b2a4a', weight: 2, fillColor: '#fff', fillOpacity: 1 }).bindTooltip(esc(a.code)).addTo(mm.layers); if (!items.length) b.extend([a.c[1], a.c[0]]); });
    (V.fp || []).filter(function (x) { return x.sev === 'error' || x.sev === 'warning'; }).forEach(function (x) { if (x.at) L.circleMarker([x.at[1], x.at[0]], { radius: 7, color: '#fff', weight: 1.5, fillColor: SEVC[x.sev], fillOpacity: 0.95 }).bindTooltip(esc(x.seg.label + ': clearance ' + num(x.clr) + ' m')).addTo(mm.layers); });
    mm.map.on('click', function (e) {
      DEM.elevation(e.latlng.lng, e.latlng.lat).then(function (g) {
        if (g) return { t: num(g.h, 1) + ' m (' + num(g.h / 0.3048) + ' ft) · ' + g.item.name };
        return STUDY.ground([e.latlng.lng, e.latlng.lat]).then(function (x) { return { t: x ? num(x.h, 1) + ' m · ' + x.src : 'no terrain here' }; });
      }).then(function (r) { L.popup().setLatLng(e.latlng).setContent('<b>Elevation</b><br>' + esc(r.t) + '<br><small>' + AX.dms(e.latlng.lat, false, 1) + ' ' + AX.dms(e.latlng.lng, true, 1) + '</small>').openOn(mm.map); });
    });
    DDMAP.legendOf(mm, [['#c4deb2', '0 m'], ['#e9dfa2', '300 m'], ['#be966e', '1500 m'], ['#ebebeb', '4000 m'], [SEVC.error, 'leg below terrain / obstacle'], [SEVC.warning, 'clearance below MOC']], 'click: elevation');
    if (b.isValid()) mm.map.fitBounds(b.pad(0.1), { maxZoom: 13 }); else mm.map.setView([25, 45], 4);
  }
  function shadeTile(tile, g, N, cellM) {
    var t = document.createElement('canvas'); t.width = t.height = N;
    var c = t.getContext('2d'), img = c.createImageData(N, N);
    for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) {
      var i = y * N + x, h = g[i], o = i * 4;
      if (h !== h) continue;
      var hl = g[y * N + Math.max(0, x - 1)], hr = g[y * N + Math.min(N - 1, x + 1)], hu = g[Math.max(0, y - 1) * N + x], hd = g[Math.min(N - 1, y + 1) * N + x];
      var sh = Math.max(0.55, Math.min(1.25, 1 + (-((hr === hr ? hr : h) - (hl === hl ? hl : h)) * 0.7 + ((hd === hd ? hd : h) - (hu === hu ? hu : h)) * 0.7) / (2 * cellM) * 3));
      var col = STUDY.hypso(h);
      img.data[o] = Math.min(255, col[0] * sh); img.data[o + 1] = Math.min(255, col[1] * sh); img.data[o + 2] = Math.min(255, col[2] * sh); img.data[o + 3] = 255;
    }
    c.putImageData(img, 0, 0);
    var tc = tile.getContext('2d'); tc.imageSmoothingEnabled = true; tc.drawImage(t, 0, 0, 256, 256);
  }

  /* ---------------------------------------------------------------- report */
  function C(t, r) { var o = { t: t === undefined || t === null ? '' : String(t) }; if (r) o.r = r; return o; }
  async function report(fmt, ctx, segs, ads) {
    var host = document.querySelector('.tv-panel');
    function p(t) { var e = host && host.querySelector('.tv-prog'); if (e) e.textContent = t; }
    try {
      var secs = [], items = DEM.items();
      if (items.length) {
        secs.push({ title: 'Terrain files', blocks: [{ kind: 'table', title: 'Files', cols: ['File', 'Format', 'Posts', 'Spacing', 'PANS-AIM area met', 'Horizontal reference', 'Vertical datum', 'Min / max (m)', 'Voids'],
          rows: items.filter(function (i) { return i.r; }).map(function (it) { var r = it.r, st = it.stats; return [C(it.name), C(r.format + ' ' + r.dataType + ' ' + r.compression), C(r.width + ' × ' + r.height), C(r.spacingArcsec ? num(r.spacingArcsec[0], 2) + '″ (' + num(r.spacingM[0], 1) + ' m)' : ''), C(r.area ? 'Area ' + r.area : 'coarser than Area 1'), C(r.crs.label), C(r.vDatum || 'not stated'), C(st ? num(st.min) + ' / ' + num(st.max) : ''), C(st ? num(100 * st.voids / Math.max(1, st.posts), 2) + ' %' : '')]; }) },
        { kind: 'table', title: 'Checks', cols: ['File', 'Severity', 'Check'], rows: [].concat.apply([], items.map(function (it) { return fileChecks(it).map(function (c) { return [C(it.name), C(c.sev), C(c.t)]; }); })) }] });
        p('cross-check…'); if (!V.xc) V.xc = await crossCheck(ctx);
        if (V.xc.length) secs.push({ title: 'Cross-check with the AIXM data', blocks: [{ kind: 'table', title: 'Elevations compared (tolerance ' + V.tol + ' m)', cols: ['Feature', 'Kind', 'Published (m)', 'Terrain (m)', 'Difference (m)', 'Beyond tolerance', 'File'],
          rows: V.xc.map(function (x) { return [C(x.x.name, x.x.r), C(x.x.what), C(num(x.pub, 1)), C(num(x.ter, 1)), C(num(x.diff, 1)), C(Math.abs(x.diff) > V.tol ? 'YES' : ''), C(x.file)]; }) }] });
      }
      if (segs.length) {
        if (!V.fp) { p('flight path study…'); var obs = [].concat.apply([], OBSTVIEW.model(ctx.datasets).sets.map(function (x) { return x.rows; })); V.fp = await STUDY.legTerrain(segs, obs, { onProgress: function (q) { p('flight path study… ' + Math.round(q * 100) + ' %'); } }); }
        var worst = V.fp.filter(function (x) { return x.sev === 'error' || x.sev === 'warning' || x.sev === 'caution'; });
        secs.push({ title: 'Flight paths over terrain and obstacles', blocks: [
          { kind: 'note', text: 'For every leg: the highest terrain within ±0.5 NM of the path and the highest obstacle there, against the lowest published altitude of the leg and an indicative minimum obstacle clearance of its phase. Indicative only — not a PANS-OPS procedure assessment.' },
          { kind: 'table', title: 'Legs (' + V.fp.length + '; ' + worst.length + ' with a finding)', cols: ['Finding', 'Leg', 'Phase', 'Altitude', 'Highest terrain (m)', 'Obstacle', 'Clearance (m)', 'MOC indicative (m)'],
            rows: V.fp.map(function (x) { return [C(x.sev), C(x.seg.label, x.seg.leg), C(x.seg.phase), C(x.seg.altTxt), C(num(x.terrain)), C(x.obstacle ? (x.obstacle.id || x.obstacle.name) + ' ' + num(x.obstacle.elev) + ' m' : ''), C(x.clr === null ? '' : num(x.clr)), C(x.seg.moc)]; }) }] });
      }
      // aerodromes with procedures (or the one studied): picture + highest terrain + terrain above the surfaces
      var adList = ads.filter(function (a) { return V.adRes[a.code] || segs.some(function (sg) { return sg.ad === a.r; }); }).slice(0, 12);
      for (var i = 0; i < adList.length; i++) {
        var a = adList[i];
        p('aerodrome ' + a.code + '…');
        if (!V.adRes[a.code]) { var S = null; try { S = OLS.surfaces(a.ds, a.r); } catch (e) { S = null; } V.adRes[a.code] = { code: a.code, a: a, S: S, res: await STUDY.aroundAerodrome(a.c, S) }; }
        var rr = V.adRes[a.code], mySegs = segs.filter(function (sg) { return sg.ad === a.r; });
        // frame: every path, finding and highest point of the aerodrome (8 to 40 NM)
        var far = 8;
        mySegs.forEach(function (sg) { sg.coords.forEach(function (q) { if (typeof q[0] === 'number') far = Math.max(far, DEM.distNM(a.c, q)); }); });
        rr.res.highest.forEach(function (x) { if (x) far = Math.max(far, x.d); });
        var pic = fmt === 'pdf' || fmt === 'print' ? await STUDY.picture({ center: a.c, radiusNM: Math.min(40, far * 1.08), w: 1300, h: 800, title: a.code + ' — terrain and flight paths', sub: mySegs.length + ' legs',
          paths: mySegs.map(function (sg) { return { coords: sg.coords, color: { SID: '#2e7d32', STAR: '#1565c0', IAP: '#b0186e' }[sg.kind], dashed: sg.dashed }; }),
          rings: rr.res.rings.map(function (n) { return { c: a.c, nm: n }; }), runways: rr.S ? rr.S.runways.map(function (r) { return [r.rm.a, r.rm.b]; }) : [],
          points: [{ c: a.c, color: '#0b2a4a', r: 6, label: a.code }].concat(rr.res.highest.filter(Boolean).map(function (x, k) { return { c: x.at, color: '#5d4037', r: 5, label: '▲ ' + num(x.h) + ' m (' + rr.res.rings[k] + ' NM)' }; }))
            .concat((V.fp || []).filter(function (x) { return x.seg.ad === a.r && (x.sev === 'error' || x.sev === 'warning') && x.at; }).map(function (x) { return { c: x.at, color: SEVC[x.sev], r: 6, label: 'clearance ' + num(x.clr) + ' m' }; })) }) : null;
        var blocks = [];
        if (pic) blocks.push({ kind: 'image', src: pic, h: 800 / 1300, caption: a.code + ': terrain shading, flight paths (SID green, STAR blue, approach magenta), rings of ' + rr.res.rings.join(' / ') + ' NM, highest terrain within each ring, legs with a clearance below the indicative MOC.' });
        blocks.push({ kind: 'table', title: 'Highest terrain around ' + a.code, cols: ['Within', 'Highest terrain', 'From ARP'], rows: rr.res.rings.map(function (rg, k) { var x = rr.res.highest[k]; return [C(rg + ' NM'), C(x ? num(x.h) + ' m (' + num(x.h / 0.3048) + ' ft)' : ''), C(x ? num(x.d, 1) + ' NM ' + ('00' + Math.round(x.brg)).slice(-3) + '°T' : '')]; }) });
        blocks.push({ kind: 'table', title: 'Terrain above the Annex 14 surfaces', cols: ['Surface', 'Above by (m)', 'Terrain (m)', 'From ARP'], rows: rr.res.pens.length ? rr.res.pens.map(function (x) { return [C(x.surface), C(num(x.pen, 1)), C(num(x.h)), C(num(x.d, 1) + ' NM ' + ('00' + Math.round(x.brg)).slice(-3) + '°T')]; }) : [[C(rr.S ? 'none found' : 'runways not in the data'), C(''), C(''), C('')]] });
        blocks.push({ kind: 'note', text: 'Terrain source: ' + (rr.res.src || '—') + ' (grid of about ' + rr.res.cell + ' m).' });
        secs.push({ title: 'Aerodrome ' + a.code, blocks: blocks });
      }
      if (!secs.length) { ctx.toast('Nothing to report: load terrain files or procedures.', 5000); p(''); return; }
      var sc = { title: 'Terrain study' + (items.length ? ' — ' + items[0].name + (items.length > 1 ? ' + ' + (items.length - 1) + ' file(s)' : '') : ''), sub: 'terrain files, flight paths, aerodromes · indicative, not for operational use', ds: null, sections: secs };
      p('writing the report…');
      if (fmt === 'pdf') EXPORTS.exportPDF(sc); else if (fmt === 'print') EXPORTS.print(sc); else if (fmt === 'xlsx') EXPORTS.exportExcel(sc); else EXPORTS.exportCSV(sc);
      p('');
    } catch (e) { p(''); ctx.toast('Report failed: ' + e.message, 6000); throw e; }
  }
  return { render: render, fileChecks: fileChecks, crossCheck: crossCheck, state: V };
})();
