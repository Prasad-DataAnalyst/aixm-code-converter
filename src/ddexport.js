/*!
 * AIXM Code Converter
 * Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com> - author of the AIXM Code Converter
 * SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE; keep this notice in all copies)
 * ==========================================================================
 * AIXM Code Converter - export of digital data sets (DDX), for the Digital data tab
 *   AIXM panel   the obstacles, procedures or aerodrome mapping features chosen (scope), in AIXM as delivered or as
 *                AIXM 5.1 / 5.1.1 / 5.2 (tables and AMXM are written as AIXM), with every feature they reference and,
 *                on request, related data: obstacle areas, the aerodrome and its runways, the airspace over it,
 *                procedures passing near the obstacles, obstacles near the procedures, holdings / MSA / TAA,
 *                navaids … (convert.js: closure, related, selection)
 *   terrain      the terrain of an area (an aerodrome and a radius, or a box) from the terrain files loaded, as
 *                GeoTIFF (Float32, Deflate, WGS 84, EGM96 heights), ESRI ASCII grid or XYZ text, with a metadata file
 * ========================================================================== */
/* global AX, MODEL, CONVERT, EXPORTS, STUDY, OBSTVIEW, DEM, fflate */
var DDX = (function () {
  'use strict';
  var M = MODEL;
  function esc(t) { return String(t === undefined || t === null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var S = {}, CFG = {};
  try { S = JSON.parse(localStorage.getItem('aixm-ddx') || '{}') || {}; } catch (e) { S = {}; }
  function save() { try { localStorage.setItem('aixm-ddx', JSON.stringify(S)); } catch (e) { /* storage unavailable */ } }
  function st(id, cfg) {
    var o = S[id] || (S[id] = {});
    if (!o.ver || !cfg.versions.some(function (v) { return v[0] === o.ver; })) o.ver = cfg.versions[0][0];
    if (!o.scope || !(cfg.scopes || []).some(function (v) { return v[0] === o.scope && v[2]; })) o.scope = ((cfg.scopes || []).filter(function (v) { return v[2]; })[0] || [''])[0];
    if (!Array.isArray(o.rel)) o.rel = [];
    o.rel = o.rel.filter(function (k) { return (cfg.related || []).some(function (r) { return r[0] === k; }); });
    if (!o.nm) o.nm = cfg.nm || 10;
    return o;
  }

  /* ----------------------------------------------------------- the panel */
  // versions a set of data sets can be written in
  function versions(dsList) {
    var fams = dsList.map(function (d) { return d.family; }), out = [];
    var orig = dsList.length && fams.every(function (f) { return f === '5' || f === '45' || f === 'amxm'; });
    if (orig) out.push(['orig', 'As delivered (' + (dsList.every(function (d) { return d.sniff.versionLabel === dsList[0].sniff.versionLabel; }) ? dsList[0].sniff.versionLabel : 'each in its version') + ')']);
    ['5.1', '5.1.1', '5.2'].forEach(function (v) { out.push([v, 'AIXM ' + v + (fams.some(function (f) { return f !== '5'; }) ? ' (written from the data)' : '')]); });
    if (!orig) { var i = out.findIndex(function (v) { return v[0] === '5.1.1'; }); out.unshift(out.splice(i, 1)[0]); }
    return out;
  }
  // cfg: {title, what, scopes [[v, label, n]], versions, related [[k, label, desc]], nm (distance asked), run(state)}
  function panel(id, cfg) {
    CFG[id] = cfg;
    var o = st(id, cfg);
    return '<div class="ddx card card-pad" data-ddx="' + esc(id) + '"><div class="ddx-h"><b>' + esc(cfg.title || 'AIXM export') + '</b> <span class="muted">' + esc(cfg.what || '') + '</span></div>' +
      '<div class="row wrap ddx-row">' + (cfg.scopes && cfg.scopes.length ? '<select class="inp" data-ddxk="scope" aria-label="Which features">' + cfg.scopes.map(function (v) { return '<option value="' + esc(v[0]) + '"' + (o.scope === v[0] ? ' selected' : '') + (v[2] ? '' : ' disabled') + '>' + esc(v[1]) + '</option>'; }).join('') + '</select>' : '') +
      '<select class="inp" data-ddxk="ver" aria-label="AIXM version">' + cfg.versions.map(function (v) { return '<option value="' + esc(v[0]) + '"' + (o.ver === v[0] ? ' selected' : '') + '>' + esc(v[1]) + '</option>'; }).join('') + '</select>' +
      '<button class="btn primary" data-ddxgo>&lt;/&gt; AIXM</button><span class="muted ddx-prog"></span></div>' +
      (cfg.related && cfg.related.length ? '<details class="ddx-rel"' + (o.rel.length ? ' open' : '') + '><summary>Add related data <span class="muted">' + (o.rel.length ? '· ' + o.rel.length + ' kind(s)' : '') + '</span></summary><div class="xp-cols">' +
        cfg.related.map(function (r) { return '<label class="chk"><input type="checkbox" data-ddxrel="' + esc(r[0]) + '"' + (o.rel.indexOf(r[0]) >= 0 ? ' checked' : '') + '> ' + esc(r[1]) + (r[2] ? ' <span class="muted">' + esc(r[2]) + '</span>' : '') + '</label>'; }).join('') + '</div>' +
        (cfg.nm ? '<div class="row wrap" style="gap:8px;align-items:center"><span>within</span><input class="inp" type="number" min="0.1" max="250" step="0.5" style="width:80px" data-ddxk="nm" value="' + o.nm + '"><span>NM</span></div>' : '') + '</details>' : '') +
      '<p class="muted ddx-note">The features chosen, with every feature they reference so the file stands alone; each one is marked in the file as selected, related or supporting. ' + esc(cfg.note || '') + '</p></div>';
  }
  // wire the panels of a host (after it is drawn)
  function bind(host) {
    host.querySelectorAll('.ddx[data-ddx]').forEach(function (el) {
      var id = el.getAttribute('data-ddx'), cfg = CFG[id], o = st(id, cfg);
      el.addEventListener('change', function (e) {
        var t = e.target, k = t.getAttribute('data-ddxk');
        if (k) o[k] = k === 'nm' ? Math.max(0.1, Math.min(250, +t.value || cfg.nm || 10)) : t.value;
        if (t.hasAttribute('data-ddxrel')) o.rel = Array.prototype.map.call(el.querySelectorAll('[data-ddxrel]:checked'), function (c) { return c.getAttribute('data-ddxrel'); });
        save(); e.stopPropagation();
      });
      el.addEventListener('input', function (e) { e.stopPropagation(); });
      el.addEventListener('click', function (e) {
        e.stopPropagation();
        if (!e.target.closest('[data-ddxgo]')) return;
        var p = el.querySelector('.ddx-prog');
        Promise.resolve(cfg.run({ scope: o.scope, ver: o.ver, rel: new Set(o.rel), nm: o.nm, prog: function (t) { if (p) p.textContent = t; } })).catch(function (x) { if (p) p.textContent = ''; report({ title: 'Export failed', notes: [x.message] }); });
      });
    });
  }

  /* --------------------------------------------------------------- write */
  // seeds [{ds, r}] chosen, rel [{ds, r, tag}] related: one file per data set (as delivered) or one file for all
  async function aixm(seeds, rel, ver, label, relLabel, prog) {
    if (!seeds.length) throw new Error('Nothing to export: the scope chosen has no features.');
    var groups = new Map();
    seeds.forEach(function (x) { var key = ver === 'orig' ? x.ds : seeds[0].ds; var l = groups.get(key); if (!l) groups.set(key, l = []); l.push(x); });
    var reps = [], all = [];
    groups.forEach(function (list) { all.push(list); });
    var datasets = Array.from(new Set(seeds.concat(rel).map(function (x) { return x.ds; })));
    for (var i = 0; i < all.length; i++) {
      var ds = all[i][0].ds;
      if (prog) prog('writing ' + ds.name + '…');
      var res = await CONVERT.selection(ds, all[i].concat(rel), datasets.concat(window.__AIXM ? window.__AIXM.S.datasets : []), ver, label, null, relLabel);
      EXPORTS.download(EXPORTS.safeName((ds.state || 'data') + '_' + ds.name.replace(/\.[^.]+$/, '') + '_' + label.replace(/[^\w]+/g, '_').slice(0, 40)) + (ver !== 'orig' ? '_AIXM-' + ver : '') + '.xml', res.blob);
      res.report.notes.unshift(ds.name + ':');
      reps.push(res.report);
    }
    if (prog) prog('');
    report({ title: 'AIXM file' + (reps.length > 1 ? 's' : '') + ' — ' + label, notes: [].concat.apply([], reps.map(function (r) { return r.notes; })) });
  }
  function report(rep) {
    var back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = '<div class="modal ddx-report"><div class="modal-head"><h3>' + esc(rep.title) + '</h3><span class="sp"></span><button class="btn small ghost" data-close>✕</button></div><div class="modal-body"><ul>' + rep.notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul><p class="muted">The file has been downloaded.</p></div></div>';
    document.body.appendChild(back);
    back.addEventListener('click', function (e) { if (e.target === back || e.target.closest('[data-close]')) back.remove(); });
  }

  /* ---------------------------------------------------- related data finders */
  // aerodromes named code in the AIXM data sets loaded -> [{ds, ad}]
  function adsByCode(datasets, codes) {
    var out = [];
    datasets.forEach(function (d) { if (d.family === 'tab' || !d.byType) return; (d.byType.AirportHeliport || []).forEach(function (a) { if (codes.indexOf(M.shortName(a)) >= 0 && !(a.cur && a.cur.gone) && !a.syn) out.push({ ds: d, ad: a }); }); });
    return out;
  }
  // procedures with a leg within nm of any point -> [{ds, r, tag}] (procedure and its legs)
  function procsNear(datasets, pts, nm) {
    var out = [], seen = new Set();
    STUDY.segments(datasets).forEach(function (sg) {
      var hit = null;
      for (var i = 0; i < pts.length && !hit; i++) { var n = STUDY.nearOnLine(pts[i].c, sg.coords); if (n && n.d <= nm) hit = pts[i]; }
      if (!hit) return;
      if (!seen.has(sg.pr)) { seen.add(sg.pr); out.push({ ds: sg.ds, r: sg.pr, tag: 'related: ' + sg.proc + ' passes within ' + nm + ' NM of ' + hit.name }); }
      if (!seen.has(sg.leg)) { seen.add(sg.leg); out.push({ ds: sg.ds, r: sg.leg, tag: 'related: leg of ' + sg.proc + ' within ' + nm + ' NM of ' + hit.name }); }
    });
    return out;
  }
  // obstacles within nm of the paths of procedures -> [{ds, r, tag}]
  function obstaclesNear(datasets, segs, nm) {
    var out = [];
    OBSTVIEW.model(datasets).sets.forEach(function (stt) {
      stt.rows.forEach(function (x) {
        if (!x.c) return;
        for (var i = 0; i < segs.length; i++) { var n = STUDY.nearOnLine(x.c, segs[i].coords); if (n && n.d <= nm) { out.push({ ds: x.ds, r: x.r, tag: 'related: obstacle ' + (Math.round(n.d * 100) / 100) + ' NM from ' + segs[i].label }); return; } }
      });
    });
    return out;
  }

  /* ------------------------------------------------------------- terrain */
  // terrain of bbox [w, s, e, n] at a post spacing (arc seconds) from the files loaded -> {W, H, d (Float32, NaN = void), bb}
  async function terrainGrid(bb, spacingSec, maxPosts) {
    var d = spacingSec / 3600, W = Math.max(2, Math.round((bb[2] - bb[0]) / d)), H = Math.max(2, Math.round((bb[3] - bb[1]) / d));
    maxPosts = maxPosts || 16e6;
    if (W * H > maxPosts) { var f = Math.sqrt(W * H / maxPosts); W = Math.floor(W / f); H = Math.floor(H / f); }
    var g = await DEM.grid(bb, W, H);
    return { W: W, H: H, d: g, bb: bb, sx: (bb[2] - bb[0]) / W, sy: (bb[3] - bb[1]) / H };
  }
  // GeoTIFF: Float32, Deflate, strips of 16 rows, geographic WGS 84, heights EGM96, cell areas, no data -32767
  function geotiff(G) {
    var W = G.W, H = G.H, R = 16, strips = [], nS = Math.ceil(H / R);
    for (var s = 0; s < nS; s++) {
      var rows = Math.min(R, H - s * R), buf = new Float32Array(W * rows);
      for (var i = 0; i < W * rows; i++) { var v = G.d[s * R * W + i]; buf[i] = v === v ? v : -32767; }
      strips.push(fflate.zlibSync(new Uint8Array(buf.buffer), { level: 6 }));
    }
    var tags = [[256, 4, [W]], [257, 4, [H]], [258, 3, [32]], [259, 3, [8]], [262, 3, [1]], [273, 4, null], [277, 3, [1]], [278, 4, [R]], [279, 4, strips.map(function (x) { return x.length; })], [284, 3, [1]], [339, 3, [3]],
      [33550, 12, [G.sx, G.sy, 0]], [33922, 12, [0, 0, 0, G.bb[0], G.bb[3], 0]], [34735, 3, [1, 1, 0, 4, 1024, 0, 1, 2, 1025, 0, 1, 1, 2048, 0, 1, 4326, 4096, 0, 1, 5773]], [42113, 2, '-32767']];
    var SZ = { 2: 1, 3: 2, 4: 4, 12: 8 }, n = tags.length, ifdLen = 2 + n * 12 + 4;
    function bytes(type, vals) {
      if (type === 2) return new TextEncoder().encode(vals + '\u0000');
      var buf = new ArrayBuffer(vals.length * SZ[type]), v = new DataView(buf);
      vals.forEach(function (x, i) { if (type === 3) v.setUint16(i * 2, x, true); else if (type === 4) v.setUint32(i * 4, x, true); else v.setFloat64(i * 8, x, true); });
      return new Uint8Array(buf);
    }
    tags[5][2] = strips.map(function () { return 0; }); // strip offsets: same size, filled below
    var blocks = tags.map(function (t) { return bytes(t[1], t[2]); }), at = [], pos = 8 + ifdLen, extra = [];
    blocks.forEach(function (bl) { if (bl.length > 4) { at.push(pos); pos += bl.length + (bl.length % 2); } else at.push(-1); });
    var offs = [], q = pos; strips.forEach(function (x) { offs.push(q); q += x.length; });
    blocks[5] = bytes(4, offs);
    var head = new ArrayBuffer(8 + ifdLen), dv = new DataView(head);
    dv.setUint16(0, 0x4949, true); dv.setUint16(2, 42, true); dv.setUint32(4, 8, true); dv.setUint16(8, n, true);
    tags.forEach(function (t, i) {
      var e = 10 + i * 12, bl = blocks[i];
      dv.setUint16(e, t[0], true); dv.setUint16(e + 2, t[1], true); dv.setUint32(e + 4, t[1] === 2 ? bl.length : t[2].length, true);
      if (bl.length <= 4) new Uint8Array(head).set(bl, e + 8); else dv.setUint32(e + 8, at[i], true);
    });
    dv.setUint32(10 + n * 12, 0, true);
    blocks.forEach(function (bl) { if (bl.length > 4) { extra.push(bl); if (bl.length % 2) extra.push(new Uint8Array(1)); } });
    return new Blob([head].concat(extra, strips), { type: 'image/tiff' });
  }
  function ascii(G) {
    var lines = ['ncols ' + G.W, 'nrows ' + G.H, 'xllcorner ' + G.bb[0].toFixed(9), 'yllcorner ' + G.bb[1].toFixed(9), 'cellsize ' + G.sx.toFixed(10), 'NODATA_value -32767'];
    for (var y = 0; y < G.H; y++) { var row = new Array(G.W); for (var x = 0; x < G.W; x++) { var v = G.d[y * G.W + x]; row[x] = v === v ? (Math.round(v * 100) / 100) : -32767; } lines.push(row.join(' ')); }
    return new Blob([lines.join('\r\n') + '\r\n'], { type: 'text/plain' });
  }
  function xyz(G) {
    var out = ['longitude,latitude,elevation_m'];
    for (var y = 0; y < G.H; y++) for (var x = 0; x < G.W; x++) { var v = G.d[y * G.W + x]; if (v === v) out.push((G.bb[0] + (x + 0.5) * G.sx).toFixed(7) + ',' + (G.bb[3] - (y + 0.5) * G.sy).toFixed(7) + ',' + (Math.round(v * 100) / 100)); }
    return new Blob([out.join('\n') + '\n'], { type: 'text/csv' });
  }
  function bboxAround(c, nm) { var dl = nm / 60, dn = dl / Math.max(0.1, Math.cos(c[1] * Math.PI / 180)); return [c[0] - dn, c[1] - dl, c[0] + dn, c[1] + dl]; }

  return { panel: panel, bind: bind, versions: versions, aixm: aixm, report: report, adsByCode: adsByCode, procsNear: procsNear, obstaclesNear: obstaclesNear,
    terrainGrid: terrainGrid, geotiff: geotiff, ascii: ascii, xyz: xyz, bboxAround: bboxAround, state: S, AX: AX };
})();
