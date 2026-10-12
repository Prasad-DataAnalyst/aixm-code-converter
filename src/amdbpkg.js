/*!
 * AIXM Code Converter
 * Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com> - author of the AIXM Code Converter
 * SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE; keep this notice in all copies)
 * ==========================================================================
 * AIXM Code Converter - aerodrome mapping package (AMDBPKG)
 * NOT FOR NAVIGATION - for study and analysis only.
 *
 * Digital data -> Aerodrome mapping (AMDB):
 *   Sources & quality  for every data set used: who originated it, under which licence, how it was made, its
 *                      quality class, and whether the user may use it (kept in this browser)
 *   Build package      one zip with the aerodrome mapping data of the aerodromes and feature types chosen
 *                      (custom) or everything (full), in the formats chosen:
 *     data/      AMXM 2.0 (the AMXM 2.0.2 schema; ISO 19115 metadata inside), AIXM 5.1.1, identifier map
 *     gis/       GeoPackage (OGC, with the metadata extension), GeoJSON, KML, Shapefile
 *     tables/    CSV per feature type, Excel
 *     cad/       DXF (WGS 84 / UTM, metres)
 *     metadata/  ISO 19115 / 19139 metadata, data product specification (ISO 19131 outline)
 *     reports/   package report (PDF, HTML: what is inside, how it was made, sources, checks), check results
 *     guides/    how to use the package in GIS, ArcGIS Aviation and ARINC 816 tools; feature catalogue mapping
 *     PACKAGE.json, SHA256SUMS.txt, README.txt
 *   Standard packages credit the tool and its author and carry the NOT FOR NAVIGATION notice in every file.
 *   "For further processing" (white-label) packages leave out the tool's name, credit and notice from the data;
 *   they keep the attributions the source licences require and the quality of each feature, and come with a
 *   separate handover record (what was handed over, when, at which quality; responsibility passes to the user).
 * Writing fixes the coding where it is unambiguous and says so in the report: rings closed, outer boundaries
 * counter-clockwise and holes clockwise, repeated positions removed, attributes the schema requires and the data
 * does not give written as unknown (nilReason="Unknown"). Nothing else is changed or invented.
 * ========================================================================== */
/* global MODEL, AMDB, AMDBUI, LAZY, EXPORTS, CONVERT, DDX, INTEGRITY, APP_INFO, XLSX, fflate, initSqlJs, AMDBQ */
var AMDBPKG = (function () {
  'use strict';
  var M = MODEL;
  function esc(t) { return String(t === undefined || t === null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function xe(t) { return String(t === undefined || t === null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function num(n) { return Number(n || 0).toLocaleString('en-US'); }
  var NS_AMXM = 'http://www.amxm.aero/schema/2.0.0';
  var FORMATS = [
    ['amxm', 'AMXM 2.0 XML', 'aerodrome mapping exchange model (ED-119 / DO-291), ISO 19115 metadata inside'],
    ['aixm', 'AIXM 5.1.1 XML', 'the same features as AIXM aerodrome features, with an identifier map'],
    ['gpkg', 'GeoPackage', 'OGC GeoPackage 1.3: one table per feature type, metadata inside — QGIS, ArcGIS, FME'],
    ['geojson', 'GeoJSON', 'RFC 7946, WGS 84'],
    ['kml', 'KML', 'Google Earth, by feature type'],
    ['shp', 'Shapefile', 'points, lines and areas per feature type, with .prj'],
    ['csv', 'CSV', 'one table per feature type'],
    ['xlsx', 'Excel', 'one sheet per feature type'],
    ['dxf', 'DXF (CAD)', 'WGS 84 / UTM metres, one layer per feature type']
  ];
  var METHODS = ['Unknown', 'Ground survey (GNSS / total station)', 'Photogrammetry from controlled aerial imagery', 'Digitised from imagery', 'Converted from CAD drawings', 'Derived from AIP / AIXM data'];
  var QUALITY = ['unknown', 'fine', 'medium', 'coarse'];
  var LS_SET = 'aixm-amdb-pkg', LS_SRC = 'aixm-amdb-src';
  function load(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
  var SET = Object.assign({ mode: 'custom', ads: [], types: [], formats: { amxm: 1, aixm: 1, gpkg: 1, geojson: 1, kml: 1, shp: 0, csv: 1, xlsx: 0, dxf: 0 }, brand: 'standard', related: false, nm: 5, who: '' }, load(LS_SET) || {});
  SET.ack = false; SET.ack2 = false; // asked again every time the page is opened
  var SRC = load(LS_SRC) || {};
  var API = null;

  /* ------------------------------------------------------------ small tools */
  var enc = new TextEncoder();
  function u8(x) { return typeof x === 'string' ? enc.encode(x) : x; }
  function uuid() { var b = new Uint8Array(16); crypto.getRandomValues(b); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128; var h = Array.from(b).map(function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20); }
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  // the AIXM UUID of a feature: its own, or the one the AIXM writer derives from its key (convert.js)
  function uidOf(f) { var id = String(f.id || '').replace(/^urn:uuid:/, ''); return UUID_RE.test(id) ? id.toLowerCase() : CONVERT.uuidFor(id || ('amdb-' + f.i)); }
  // SHA-256 (FIPS 180-4) of bytes -> hex
  var K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  function sha256(data) {
    var b = u8(data), l = b.length, n = ((l + 9 + 63) >> 6) << 6, m = new Uint8Array(n);
    m.set(b); m[l] = 0x80;
    var dv = new DataView(m.buffer); dv.setUint32(n - 4, (l * 8) >>> 0); dv.setUint32(n - 8, Math.floor(l / 0x20000000));
    var h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19], w = new Uint32Array(64);
    for (var o = 0; o < n; o += 64) {
      for (var i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
      for (i = 16; i < 64; i++) {
        var a1 = w[i - 15], a2 = w[i - 2];
        var s0 = ((a1 >>> 7) | (a1 << 25)) ^ ((a1 >>> 18) | (a1 << 14)) ^ (a1 >>> 3), s1 = ((a2 >>> 17) | (a2 << 15)) ^ ((a2 >>> 19) | (a2 << 13)) ^ (a2 >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      var A = h[0], B = h[1], C = h[2], D = h[3], E = h[4], F = h[5], G = h[6], H = h[7];
      for (i = 0; i < 64; i++) {
        var S1 = ((E >>> 6) | (E << 26)) ^ ((E >>> 11) | (E << 21)) ^ ((E >>> 25) | (E << 7)), ch = (E & F) ^ (~E & G), t1 = (H + S1 + ch + K[i] + w[i]) | 0;
        var S0 = ((A >>> 2) | (A << 30)) ^ ((A >>> 13) | (A << 19)) ^ ((A >>> 22) | (A << 10)), mj = (A & B) ^ (A & C) ^ (B & C), t2 = (S0 + mj) | 0;
        H = G; G = F; F = E; E = (D + t1) | 0; D = C; C = B; B = A; A = (t1 + t2) | 0;
      }
      h[0] = (h[0] + A) | 0; h[1] = (h[1] + B) | 0; h[2] = (h[2] + C) | 0; h[3] = (h[3] + D) | 0; h[4] = (h[4] + E) | 0; h[5] = (h[5] + F) | 0; h[6] = (h[6] + G) | 0; h[7] = (h[7] + H) | 0;
    }
    return h.map(function (x) { return ('0000000' + (x >>> 0).toString(16)).slice(-8); }).join('');
  }
  function closeR(r) { var a = r[0], b = r[r.length - 1]; return a && b && (a[0] !== b[0] || a[1] !== b[1]) ? r.concat([[a[0], a[1]]]) : r; }
  function dedupe(r) { return r.filter(function (p, i) { return !i || p[0] !== r[i - 1][0] || p[1] !== r[i - 1][1]; }); }
  function sArea(r) { var s = 0; for (var i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]); return s / 2; }
  // the geometry as written: rings closed, outer counter-clockwise, holes clockwise, no repeated positions
  function cleanGeom(g, fix) {
    if (g.t === 'P') return g;
    if (g.t === 'L') { var c = dedupe(g.c); if (c.length !== g.c.length) fix.dup++; return { t: 'L', c: c }; }
    var rings = g.c.map(function (r, i) {
      var d = dedupe(r); if (d.length !== r.length) fix.dup++;
      var c = closeR(d); if (c.length !== d.length || (g.open && g.open.indexOf(i) >= 0)) fix.closed++;
      var a = sArea(c);
      if ((i === 0 && a < 0) || (i > 0 && a > 0)) { c = c.slice().reverse(); fix.oriented++; }
      return c;
    });
    return { t: 'A', c: rings };
  }

  /* ---------------------------------------------- sources of the data sets */
  function srcOf(ds, feats) {
    var s = SRC[ds.name];
    if (s) return s;
    var cnt = {};
    feats.forEach(function (f) { var v = f.a.source && f.a.source.v; if (v) cnt[v] = (cnt[v] || 0) + 1; });
    var best = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; })[0], all = Object.keys(cnt).join('\n');
    var gen = /^(Generated from AIP|Inferred from AIP|SCHEMATIC from AIP|From the State's charts|OpenStreetMap contributors|Digitised by the user)/.test(best || '');
    // generated data: what each source added, and the licences that come with it (OpenStreetMap: ODbL share-alike)
    var osm = /OpenStreetMap/.test(all), chart = /From the State's charts/.test(all), traced = /Digitised by the user/.test(all), nc = /NC-SA|non-commercial/.test(all);
    var lic = [osm ? ODBL : '', chart ? 'the State\'s charts: as the State\'s AIP terms allow' : '', nc ? 'traced on imagery under CC BY-NC-SA 4.0: non-commercial use, share-alike' : ''].filter(Boolean).join('; ');
    var method = 'Derived from AIP / AIXM data' + (chart ? ', the State\'s charts' : '') + (osm ? ', OpenStreetMap' : '') + (traced ? ', traced on imagery by the user' : '') + (/Inferred/.test(all) ? ', ICAO Annex 14 inference' : '');
    return { orig: gen ? '' : best || ds.state || '', lic: lic, date: typeof ds.effective === 'number' ? new Date(ds.effective).toISOString().slice(0, 10) : '', method: ds.family === 'amxm' && !gen ? 'Unknown' : method, q: gen ? 'coarse' : 'unknown', note: gen ? best : '', rights: false, osm: osm };
  }
  var ODBL = 'contains OpenStreetMap data © OpenStreetMap contributors, Open Database Licence 1.0 (attribution; share-alike: the package and what is made from it are shared under the ODbL)';
  function sources(ctx) {
    var col = API.features(ctx.datasets);
    return col.sets.map(function (s) { var ds = ctx.datasets[s.i]; return { set: s, ds: ds, info: srcOf(ds, col.features.filter(function (f) { return f.ref[0] === s.i; })) }; });
  }
  function sourcesView(host, ctx) {
    var list = sources(ctx);
    var h = '<div class="nfo-box amdb-notice" role="note">⚠ ' + esc(API.NOTICE) + '</div>' +
      '<div class="card card-pad"><h3 style="margin-top:0">Sources and their quality</h3><p class="muted">Recorded in the package metadata (ISO 19115 lineage and use constraints) and its report. The originator stays whoever surveyed or supplied the data; this tool is the processor. Kept in this browser only.</p>' +
      '<div class="tbl-wrap"><table class="mini-table amdb-src"><thead><tr><th>Data set</th><th>Originator (who surveyed or supplied it)</th><th>Licence / terms of use</th><th>Source date</th><th>How it was made</th><th>Quality class</th><th>Notes</th><th>I may use it</th></tr></thead><tbody>' +
      list.map(function (x, i) {
        var s = x.info;
        return '<tr data-src="' + i + '"><td><b>' + esc(x.ds.name) + '</b><br><span class="chip">' + esc(x.set.kind) + '</span></td>' +
          '<td><input class="inp" data-k="orig" value="' + esc(s.orig) + '" aria-label="Originator"></td><td><input class="inp" data-k="lic" value="' + esc(s.lic) + '" placeholder="e.g. State AIP terms, CC BY 4.0" aria-label="Licence"></td>' +
          '<td><input class="inp" type="date" data-k="date" value="' + esc(s.date) + '" aria-label="Source date"></td><td><select class="inp" data-k="method" aria-label="How it was made">' + METHODS.map(function (m) { return '<option' + (s.method === m ? ' selected' : '') + '>' + m + '</option>'; }).join('') + '</select></td>' +
          '<td><select class="inp" data-k="q" aria-label="Quality class">' + QUALITY.map(function (q) { return '<option' + (s.q === q ? ' selected' : '') + '>' + q + '</option>'; }).join('') + '</select></td>' +
          '<td><input class="inp" data-k="note" value="' + esc(s.note) + '" aria-label="Notes"></td><td style="text-align:center"><input type="checkbox" data-k="rights"' + (s.rights ? ' checked' : '') + ' aria-label="I have the right to use this data set"></td></tr>';
      }).join('') + '</tbody></table></div></div>';
    h += '<div class="card card-pad"><h3 style="margin-top:0">Which sources may be used</h3><table class="mini-table"><thead><tr><th>Source</th><th>Use</th><th>Conditions</th></tr></thead><tbody>' +
      [['Your own data (survey, CAD, GIS, AIXM, AMXM)', '✓', 'you hold the rights; the quality is the quality it was made to'],
        ['State AIP / AIXM data you load', 'as its terms allow', 'rights stay with the State or provider; the package names it'],
        ['Copernicus Sentinel-2 imagery (10 m)', '✓ free, also commercially', '"Contains modified Copernicus Sentinel data [year]"; coarse quality only'],
        ['Sentinel-2 cloudless mosaics of EOX', '2016: ✓ CC BY 4.0; 2018 to 2025: non-commercial only', 'CC BY-NC-SA 4.0 for 2018 and later (EOX sells a commercial licence)'],
        ['The State\'s charts (aerodrome, ground movement, parking / docking) and AD 2 pages', 'as the State\'s terms allow', 'the AIP copyright stays with the State; the features name the chart'],
        ['Charts of commercial providers (e.g. Jeppesen)', '✗', 'licensed for display only: no data may be derived from them'],
        ['National open aerial photos (e.g. IGN France, PDOK, LINZ, swisstopo, USGS NAIP)', '✓ under their open licences', 'attribution of each; medium quality at best without ground control'],
        ['Copernicus DEM, SRTM, the built-in terrain', '✓', 'their attribution notices'],
        ['OpenStreetMap', 'only if the package is shared under ODbL', 'share-alike: never mixed with closed data'],
        ['Esri World Imagery', 'visual check only', 'tracing needs an Esri licence (Esri terms of use)'],
        ['Google, Bing, Apple imagery; commercial AMDBs', '✗', 'their terms forbid making data from them']].map(function (r) { return '<tr><td>' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td><td>' + esc(r[2]) + '</td></tr>'; }).join('') +
      '</tbody></table><p class="muted">Not legal advice. See docs/AMDB_RESEARCH.md, section 8.</p></div>';
    host.innerHTML = h;
    host.onclick = null;
    host.oninput = host.onchange = function (e) {
      var tr = e.target.closest('[data-src]'), k = e.target.getAttribute('data-k');
      if (!tr || !k) return;
      var x = list[+tr.getAttribute('data-src')];
      x.info = Object.assign({}, x.info);
      x.info[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
      SRC[x.ds.name] = x.info; save(LS_SRC, SRC);
    };
  }

  /* ------------------------------------------------------------ build view */
  function packageView(host, ctx) {
    var col = API.features(ctx.datasets), ads = {}, types = {};
    col.features.forEach(function (f) { var a = f.ad || '(none)'; ads[a] = (ads[a] || 0) + 1; types[f.t] = (types[f.t] || 0) + 1; });
    SET.ads = SET.ads.filter(function (a) { return ads[a]; }); SET.types = SET.types.filter(function (t) { return types[t]; });
    if (!SET.ads.length) SET.ads = Object.keys(ads).filter(function (a) { return a !== '(none)'; }).sort().slice(0, 1);
    var full = SET.mode === 'full', srcs = sources(ctx), noRights = srcs.filter(function (x) { return !x.info.rights; });
    var h = '<div class="nfo-box amdb-notice" role="note">⚠ ' + esc(API.NOTICE) + '</div>';
    h += '<div class="toolbar"><span class="pill-tabs">' + [['custom', 'Custom export'], ['full', 'Full export']].map(function (m) { return '<button data-pkmode="' + m[0] + '" class="' + (SET.mode === m[0] ? 'active' : '') + '">' + m[1] + '</button>'; }).join('') + '</span>' +
      '<span class="muted">' + (full ? 'Everything: every aerodrome, every feature type, every format.' : 'Only what you choose.') + '</span></div>';
    h += '<div class="amdb-form">';
    h += '<fieldset' + (full ? ' disabled' : '') + '><legend>Aerodromes</legend>' + Object.keys(ads).sort().map(function (a) { return '<label class="chk"><input type="checkbox" data-pkad="' + esc(a) + '"' + (full || SET.ads.indexOf(a) >= 0 ? ' checked' : '') + '> ' + esc(a) + ' <span class="muted">' + num(ads[a]) + '</span></label>'; }).join('') + '</fieldset>';
    h += '<fieldset' + (full ? ' disabled' : '') + '><legend>Feature types</legend><label class="chk"><input type="checkbox" data-pktype="*"' + (full || !SET.types.length ? ' checked' : '') + '> all types</label>' +
      Object.keys(types).sort().map(function (t) { return '<label class="chk"><input type="checkbox" data-pktype="' + esc(t) + '"' + (full || SET.types.indexOf(t) >= 0 ? ' checked' : '') + '> ' + esc(t) + ' <span class="muted">' + num(types[t]) + '</span></label>'; }).join('') + '</fieldset>';
    h += '<fieldset' + (full ? ' disabled' : '') + '><legend>Formats</legend>' + FORMATS.map(function (f) { return '<label class="chk" title="' + esc(f[2]) + '"><input type="checkbox" data-pkfmt="' + f[0] + '"' + (full || SET.formats[f[0]] ? ' checked' : '') + '> ' + esc(f[1]) + ' <span class="muted">' + esc(f[2]) + '</span></label>'; }).join('') +
      '<p class="muted" style="margin:6px 0 0">Always included: ISO 19115 metadata, data product specification, package report (PDF, HTML), check results, guides, checksums.</p></fieldset>';
    h += '<fieldset><legend>Options</legend><label class="chk"><input type="checkbox" data-pkopt="related"' + (SET.related ? ' checked' : '') + '> add the AIXM data around the aerodrome to the AIXM file (aerodrome, airspace over it, obstacles within <input class="inp" data-pkopt="nm" type="number" min="1" max="50" value="' + SET.nm + '" style="width:56px" aria-label="Distance in NM"> NM)</label>' +
      '<p style="margin:8px 0 4px"><b>Branding</b></p><label class="chk"><input type="radio" name="pkbrand" data-pkbrand="standard"' + (SET.brand === 'standard' ? ' checked' : '') + '> Standard — credit to the AIXM Code Converter (created by Prasad Selvaraj) and the NOT FOR NAVIGATION notice in every file</label>' +
      '<label class="chk"><input type="radio" name="pkbrand" data-pkbrand="plain"' + (SET.brand === 'plain' ? ' checked' : '') + '> For further processing (white-label) — no tool name, credit or notice in the data; source attributions and the quality of each feature stay; a separate handover record</label>' +
      (SET.brand === 'plain' ? '<label class="chk">Handed over to (person or organisation) <input class="inp" data-pkopt="who" value="' + esc(SET.who) + '" style="width:100%"></label>' : '') + '</fieldset></div>';
    if (noRights.length) h += '<div class="amdb-ack">Sources & quality: the right to use ' + noRights.map(function (x) { return esc(x.ds.name); }).join(', ') + ' is not confirmed yet. The package records this.</div>';
    h += '<div class="amdb-ack"><label class="chk"><input type="checkbox" data-pkack="ack"' + (SET.ack ? ' checked' : '') + '> I understand that this package is <b>NOT FOR NAVIGATION</b> — for study and analysis only, not a certified aeronautical data product — and that I have the right to use the data it is made from.</label>' +
      (SET.brand === 'plain' ? '<label class="chk"><input type="checkbox" data-pkack="ack2"' + (SET.ack2 ? ' checked' : '') + '> I take over the responsibility for these data: any further use, verification, certification or distribution is mine, under my own processes.</label>' : '') + '</div>';
    var ready = SET.ack && (SET.brand !== 'plain' || SET.ack2);
    h += '<div class="toolbar"><button class="btn primary" data-pkbuild' + (ready ? '' : ' disabled') + '>Build the package</button><span class="muted pk-status"></span></div><div class="pk-out"></div>';
    host.innerHTML = h;
    function upd(fn) { fn(); save(LS_SET, Object.assign({}, SET, { ack: false, ack2: false })); packageView(host, ctx); }
    host.oninput = null;
    host.onchange = function (e) {
      var t = e.target;
      if (t.hasAttribute('data-pkad')) return upd(function () { var a = t.getAttribute('data-pkad'); SET.ads = SET.ads.filter(function (x) { return x !== a; }); if (t.checked) SET.ads.push(a); });
      if (t.hasAttribute('data-pktype')) return upd(function () { var k = t.getAttribute('data-pktype'); if (k === '*') { SET.types = []; return; } SET.types = SET.types.filter(function (x) { return x !== k; }); if (t.checked) SET.types.push(k); });
      if (t.hasAttribute('data-pkfmt')) return upd(function () { SET.formats[t.getAttribute('data-pkfmt')] = t.checked ? 1 : 0; });
      if (t.hasAttribute('data-pkbrand')) return upd(function () { SET.brand = t.getAttribute('data-pkbrand'); });
      if (t.hasAttribute('data-pkack')) return upd(function () { SET[t.getAttribute('data-pkack')] = t.checked; });
      var o = t.getAttribute('data-pkopt');
      if (o) upd(function () { SET[o] = o === 'related' ? t.checked : o === 'nm' ? Math.max(1, Math.min(50, +t.value || 5)) : t.value; });
    };
    host.onclick = function (e) {
      var m = e.target.closest('[data-pkmode]');
      if (m) { upd(function () { SET.mode = m.getAttribute('data-pkmode'); }); return; }
      if (e.target.closest('[data-pkbuild]')) build(host, ctx);
    };
  }

  /* ------------------------------------------------------------------- build */
  async function build(host, ctx) {
    var st = host.querySelector('.pk-status'), out = host.querySelector('.pk-out'), btn = host.querySelector('[data-pkbuild]');
    function say(t) { if (st) st.textContent = t; }
    btn.disabled = true;
    try {
      var res = await make(ctx, say);
      EXPORTS.download(res.name, new Blob([res.zip], { type: 'application/zip' }));
      if (res.handover) setTimeout(function () { EXPORTS.download(res.handoverName, new Blob([res.handover], { type: 'text/plain' })); }, 400);
      say('');
      out.innerHTML = '<div class="card card-pad pk-done"><h3 style="margin-top:0">✓ ' + esc(res.name) + ' (' + EXPORTS.fmtSize(res.zip.length) + ')</h3><p>' + num(res.features) + ' feature(s) of ' + esc(res.ads.join(', ')) + ' · ' + res.files.length + ' files · checks: ' +
        res.checks.bySev.error + ' error(s), ' + res.checks.bySev.warning + ' warning(s), ' + res.checks.bySev.info + ' note(s)' + (res.handover ? ' · handover record: ' + esc(res.handoverName) : '') + '</p>' +
        '<div class="tbl-wrap"><table class="mini-table"><thead><tr><th>File</th><th class="num">Size</th><th>SHA-256</th></tr></thead><tbody>' + res.files.map(function (f) { return '<tr><td class="mono">' + esc(f.path) + '</td><td class="num">' + EXPORTS.fmtSize(f.bytes) + '</td><td class="mono"><small>' + f.sha256 + '</small></td></tr>'; }).join('') + '</tbody></table></div>' +
        '<p class="muted">Coding fixed while writing: ' + res.fix.closed + ' ring(s) closed, ' + res.fix.oriented + ' ring(s) turned to the right direction, ' + res.fix.dup + ' repeated position(s) removed, ' + num(res.fix.unknown) + ' required attribute(s) not in the data written as unknown' + (res.fix.invalid.length ? ', ' + res.fix.invalid.length + ' value(s) the schema does not allow written as unknown' : '') + '. Drop the zip on the Files page to open and verify it.</p></div>';
    } catch (e) { say(''); out.innerHTML = '<div class="card card-pad">The package could not be built: ' + esc(e.message) + '</div>'; if (window.console) console.error(e); }
    btn.disabled = false;
  }
  // the package as { name, zip (Uint8Array), files, ... }: used by the Build button and the tests
  async function make(ctx, say) {
    say = say || function () {};
    var col = API.features(ctx.datasets), full = SET.mode === 'full', plain = SET.brand === 'plain';
    var list = col.features.filter(function (f) { return (full || SET.ads.indexOf(f.ad || '(none)') >= 0) && (full || !SET.types.length || SET.types.indexOf(f.t) >= 0); });
    if (!list.length) throw new Error('Nothing to write: choose an aerodrome and a feature type that have features.');
    var fmt = {}; FORMATS.forEach(function (f) { fmt[f[0]] = full || !!SET.formats[f[0]]; });
    var ads = Array.from(new Set(list.map(function (f) { return f.ad || '(none)'; }))).sort(), tag = ads.length === 1 ? ads[0].replace(/[^\w]/g, '') || 'AD' : ads.length + '_aerodromes';
    var now = new Date(), day = now.toISOString().slice(0, 10), pid = uuid(), dict = M.amxmDict();
    var srcs = sources(ctx).filter(function (x) { return list.some(function (f) { return f.ref[0] === x.set.i; }); });
    var W = { plain: plain, now: now, pid: pid, dict: dict, srcs: srcs, tag: tag, ads: ads, fix: { closed: 0, oriented: 0, dup: 0, unknown: 0, invalid: [], placeholder: [] }, ctx: ctx };
    // the geometry as written (shared by all formats)
    list = list.map(function (f) { return Object.assign({}, f, { w: f.g.map(function (g) { return cleanGeom(g, W.fix); }), uid: uidOf(f) }); });
    say('checking…');
    var checks = await AMDBUI.runChecks(list.map(function (f) { return { i: f.i, t: f.t, src: f.src, k: f.k, ad: f.ad, g: f.g, a: f.a, keys: f.keys, label: f.label }; }));
    checks.at = now.toISOString(); W.checks = checks;
    var files = {}, base = tag + '_AMDB_' + day;
    function put(path, data) { files[path] = u8(data); }
    var meta = iso19115(list, W);
    if (fmt.amxm) { say('writing AMXM…'); put('data/' + base + '_AMXM-2.0.xml', amxmXml(list, W, meta)); }
    if (fmt.aixm) { say('writing AIXM…'); var ax = await aixmXml(list, W); if (ax) put('data/' + base + '_AIXM-5.1.1.xml', ax); put('data/' + base + '_identifiers.csv', idMap(list)); }
    if (fmt.gpkg) { say('writing GeoPackage…'); put('gis/' + base + '.gpkg', await gpkg(list, W, meta)); }
    if (fmt.geojson) put('gis/' + base + '.geojson', geojson(list, W));
    if (fmt.kml) put('gis/' + base + '.kml', kml(list, W));
    if (fmt.shp) { var sh = shapefiles(list, W); Object.keys(sh).forEach(function (k) { files['gis/shapefile/' + base + '_' + k] = sh[k]; }); }
    if (fmt.csv) { var tb = tables(list, W); Object.keys(tb).forEach(function (t) { put('tables/' + base + '_' + t + '.csv', tb[t].csv); }); }
    if (fmt.xlsx) put('tables/' + base + '.xlsx', excel(list, W));
    if (fmt.dxf) { var dx = dxf(list, W); put('cad/' + base + '_' + dx.zone + '.dxf', dx.text); }
    put('metadata/' + base + '_ISO19115.xml', '<?xml version="1.0" encoding="UTF-8"?>\n' + meta);
    put('metadata/' + base + '_data_product_specification.html', dps(list, W));
    put('reports/' + base + '_checks.json', JSON.stringify(checksJson(list, W), null, 1));
    put('guides/HOW_TO_USE.txt', howTo(W));
    put('guides/feature_catalogue_mapping.csv', catalogueCsv(list));
    // the report lists every other file with its checksums
    say('writing the report…');
    if (typeof AMDBQ === 'undefined') { try { await LAZY.run('src-amdbq'); } catch (e) { /* the report goes without fit for use */ } }
    var rep = reportScope(list, W, fileList(files));
    put('reports/' + base + '_package_report.html', reportHtml(rep, W));
    put('reports/' + base + '_package_report.pdf', new Uint8Array(await EXPORTS.exportPDF(rep, { blob: true, plain: plain, head: plain ? 'Aerodrome mapping package ' + tag : 'AIXM Code Converter — aerodrome mapping package ' + tag }).arrayBuffer()));
    put('README.txt', readme(list, W));
    var all = fileList(files);
    files['PACKAGE.json'] = u8(JSON.stringify(manifest(list, W, all), null, 1));
    files['SHA256SUMS.txt'] = u8(all.map(function (f) { return f.sha256 + '  ' + f.path; }).join('\n') + '\n');
    say('zipping…');
    var root = {}; Object.keys(files).forEach(function (k) { root[base + '/' + k] = [files[k], { level: /\.(gpkg|xlsx|pdf)$/.test(k) ? 0 : 6, mtime: now }]; });
    var zip = fflate.zipSync(root);
    var handover = plain ? handoverRecord(list, W, fileList(files)) : null;
    return { name: base + '.zip', zip: zip, files: fileList(files), features: list.length, ads: ads, checks: checks, fix: W.fix, handover: handover, handoverName: base + '_HANDOVER_RECORD.txt' };
  }
  function fileList(files) { return Object.keys(files).sort().map(function (k) { return { path: k, bytes: files[k].length, sha256: sha256(files[k]), crc32q: INTEGRITY.crc32q(files[k]) }; }); }
  function credit(W) { return W.plain ? '' : APP_INFO.name + ' ' + APP_INFO.version + ' — created by ' + APP_INFO.author; }
  function noticeLine(W) { return W.plain ? '' : 'NOT FOR NAVIGATION — for study and analysis only. Not a certified aeronautical data product.'; }

  /* ------------------------------------------------------------------- AMXM */
  function amxmXml(list, W, meta) {
    var D = W.dict, gid = 0, out = [];
    function g(t) { return t + '_' + (++gid); }
    function pos(c) { return c[1].toFixed(9) + ' ' + c[0].toFixed(9); }
    function geomXml(n, gm) {
      if (gm.t === 'P') return '<amxm:' + n + '><gml:Point gml:id="' + g('P') + '" srsName="urn:ogc:def:crs:EPSG::4326"><gml:pos>' + pos(gm.c) + '</gml:pos></gml:Point></amxm:' + n + '>';
      if (gm.t === 'L') return '<amxm:' + n + '><gml:LineString gml:id="' + g('L') + '" srsName="urn:ogc:def:crs:EPSG::4326"><gml:posList>' + gm.c.map(pos).join(' ') + '</gml:posList></gml:LineString></amxm:' + n + '>';
      return '<amxm:' + n + '><gml:Polygon gml:id="' + g('S') + '" srsName="urn:ogc:def:crs:EPSG::4326">' + gm.c.map(function (r, i) { var e = i ? 'interior' : 'exterior'; return '<gml:' + e + '><gml:LinearRing><gml:posList>' + r.map(pos).join(' ') + '</gml:posList></gml:LinearRing></gml:' + e + '>'; }).join('') + '</gml:Polygon></amxm:' + n + '>';
    }
    var feattype = {}; Object.keys(D.codes.feattypeBaseTypeType || {}).forEach(function (k) { feattype[D.codes.feattypeBaseTypeType[k].replace(/\s+/g, '').toLowerCase()] = k; });
    var srcName = {}; W.srcs.forEach(function (x) { srcName[x.set.i] = x.info.orig; });
    list.forEach(function (f) {
      var def = D.features[f.t];
      if (!def) return;
      var body = def.attrs.map(function (a) {
        if (/^geo(poly|line|pnt)$/.test(a.n)) {
          var want = a.n === 'geopoly' ? 'A' : a.n === 'geoline' ? 'L' : 'P', gm = f.w.filter(function (x) { return x.t === want; })[0];
          return gm ? geomXml(a.n, gm) : '';
        }
        var x = valueFor(f, a, feattype, srcName, W);
        // a value the schema would reject (code not in the list, out of range, too long, not a date): unknown
        if (x && !x.nil && !validFor(a, x.v, D)) { W.fix.invalid.push(f.t + (f.label ? ' ' + f.label : '') + ': ' + a.n + ' "' + x.v + '"'); x = { nil: 'unknown' }; }
        if (!x && !a.m) return '';
        if (!x || x.nil) {
          if (a.e) { if (!x) W.fix.unknown++; return '<amxm:' + a.n + ' nilReason="' + nilR(x ? x.nil : 'unknown', a.nr) + '"/>'; }
          if (!a.m) return '';
          // a required date the schema does not allow to be empty: a placeholder, listed in the report
          var ph = (a.n === 'revdate' && typeof f.b === 'number' ? new Date(f.b) : W.now).toISOString();
          ph = a.x && a.x.b === 'date' ? ph.slice(0, 10) : ph.slice(0, 19) + 'Z';
          W.fix.placeholder.push(f.t + (f.label ? ' ' + f.label : '') + ': ' + a.n + ' = ' + ph);
          x = { v: ph };
        }
        return '<amxm:' + a.n + (a.u ? ' uom="' + a.u[0] + '"' : '') + '>' + xe(x.v) + '</amxm:' + a.n + '>';
      }).join('');
      out.push('  <amxm:featureMember>\n    <amxm:' + f.t + ' gml:id="' + g('F') + '">' + body + '</amxm:' + f.t + '>\n  </amxm:featureMember>');
    });
    var head = '<?xml version="1.0" encoding="UTF-8"?>\n' + (W.plain ? '' : '<!-- ' + noticeLine(W) + ' ' + credit(W) + ', ' + W.now.toISOString().slice(0, 19) + 'Z. Package ' + W.pid + '. -->\n');
    return head + '<amxm:AerodromeMappingDatabase xmlns:amxm="' + NS_AMXM + '" xmlns:gml="http://www.opengis.net/gml/3.2" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:gmd="http://www.isotc211.org/2005/gmd" xmlns:gco="http://www.isotc211.org/2005/gco" gml:id="AMDB_' + W.pid.replace(/-/g, '') + '">\n' +
      out.join('\n') + '\n  <amxm:metadata>' + meta + '</amxm:metadata>\n</amxm:AerodromeMappingDatabase>\n';
  }
  var RE_DT = /^-?\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/, RE_D = /^-?\d{4}-\d{2}-\d{2}(Z|[+-]\d{2}:\d{2})?$/;
  function validFor(a, v, D) {
    v = String(v);
    if (a.c) return !!D.codes[a.c] && Object.prototype.hasOwnProperty.call(D.codes[a.c], v);
    var l = a.x;
    if (!l) return true;
    if (l.b === 'double' || l.b === 'decimal' || l.b === 'integer' || l.b === 'int') { var n = Number(v.trim()); return v.trim() !== '' && !isNaN(n) && (l.min === undefined || n >= l.min) && (l.max === undefined || n <= l.max) && (l.b === 'double' || l.b === 'decimal' || /^-?\d+$/.test(v.trim())); }
    if (l.b === 'dateTime') return RE_DT.test(v.trim());
    if (l.b === 'date') return RE_D.test(v.trim());
    if (l.len !== undefined && v.length > l.len) return false;
    return true;
  }
  // the nilReason the element allows that is closest to the reason given
  function nilR(r, allowed) {
    r = String(r || '').toLowerCase();
    var want = /applic/.test(r) ? 'Not Applicable' : /enter|withheld|missing/.test(r) ? 'Not Entered' : /null/.test(r) ? 'Null' : 'Unknown';
    allowed = allowed || ['Unknown'];
    return allowed.indexOf(want) >= 0 ? want : allowed.indexOf('Unknown') >= 0 ? 'Unknown' : allowed.indexOf('Not Entered') >= 0 ? 'Not Entered' : allowed[0];
  }
  // the value written for an attribute: as delivered (AMXM), or from the AIXM feature, in the schema's unit
  function valueFor(f, a, feattype, srcName, W) {
    var x = f.a[a.n];
    if (a.n === 'feattype') return feattype[f.t.toLowerCase()] !== undefined ? { v: feattype[f.t.toLowerCase()] } : x;
    if (a.n === 'idnumber') return { v: f.src === 'AMXM' && x && x.v ? x.v.slice(0, 36) : f.uid };
    if (a.n === 'idarpt' && f.ad) return { v: f.ad.slice(0, 5) };
    if (a.n === 'source' && (!x || !x.v)) { var o = srcName[f.ref[0]] || ''; return o ? { v: (o + (W.plain ? '' : '; processed with ' + APP_INFO.name)).slice(0, 254) } : undefined; }
    if (a.n === 'revdate' && (!x || !x.v)) return { v: typeof f.b === 'number' ? new Date(f.b).toISOString().slice(0, 19) + 'Z' : W.now.toISOString().slice(0, 19) + 'Z' };
    if (!x) return undefined;
    if (x.nil) return x;
    if (x.v === '' || x.v === undefined) return undefined;
    if (a.u && a.u[0] === 'meters' && x.u && /^(FT|FEET)$/i.test(x.u)) { var n = parseFloat(x.v); if (!isNaN(n)) return { v: String(Math.round(n * 0.3048 * 1000) / 1000) }; }
    return x;
  }

  /* ------------------------------------------------------------------- AIXM */
  async function aixmXml(list, W) {
    var ctx = W.ctx, bySet = new Map();
    list.forEach(function (f) { var ds = ctx.datasets[f.ref[0]], r = ds && ds.recs[f.ref[1]]; if (!r) return; var l = bySet.get(ds); if (!l) bySet.set(ds, l = []); if (l.indexOf(r) < 0) l.push(r); });
    var parts = [], rel = [];
    if (SET.related && typeof DDX !== 'undefined') {
      var ads = DDX.adsByCode(ctx.datasets.filter(function (d) { return d.family !== 'amxm'; }), W.ads);
      if (ads.length) rel = CONVERT.related(ads, ctx.datasets, { kinds: new Set(['aerodrome', 'over', 'obstacles']), nm: SET.nm });
    }
    var first = true;
    for (var entry of bySet) {
      var ds = entry[0], seeds = entry[1].map(function (r) { return { ds: ds, r: r }; });
      var res = await CONVERT.selection(ds, seeds.concat(first ? rel : []), ctx.datasets, '5.1.1', 'aerodrome mapping ' + W.tag, null, SET.related ? 'aerodrome, airspace over it, obstacles within ' + SET.nm + ' NM' : '');
      first = false;
      var t = await res.blob.text();
      if (W.plain) t = t.replace(/<!--[\s\S]*?-->/g, function (c) { return c.indexOf(APP_INFO.name) >= 0 || c.indexOf(APP_INFO.author) >= 0 ? '' : c; });
      parts.push(t);
    }
    if (!parts.length) return null;
    if (parts.length === 1) return parts[0];
    // several data sets: one file with the members of all
    var cut = parts[0].lastIndexOf('</'), body = parts.slice(1).map(function (p) { var a = p.indexOf('<message:hasMember'), b = p.lastIndexOf('</message:hasMember>'); return a >= 0 && b > a ? p.slice(a, b + '</message:hasMember>'.length) : ''; }).join('\n');
    return parts[0].slice(0, cut) + body + '\n' + parts[0].slice(cut);
  }
  function idMap(list) {
    return 'amxm_feature_type,aerodrome,amxm_idnumber,aixm_uuid,source_format,label\n' + list.map(function (f) {
      var idn = f.src === 'AMXM' && f.a.idnumber && f.a.idnumber.v ? f.a.idnumber.v : f.uid;
      return [f.t, f.ad, idn, f.uid, f.src, f.label].map(EXPORTS.csvCell).join(',');
    }).join('\n') + '\n';
  }

  /* ------------------------------------------------------------ GIS formats */
  function attrsOf(f, W) {
    var o = { amxm_type: f.t, aerodrome: f.ad, idnumber: f.src === 'AMXM' && f.a.idnumber && f.a.idnumber.v ? f.a.idnumber.v : f.uid, aixm_uuid: f.uid, source_format: f.src };
    Object.keys(f.a).sort().forEach(function (k) { var x = f.a[k]; if (!x || x.geo || o[k] !== undefined) return; o[k] = x.nil ? null : x.v + (x.u && !/^(M|meters)$/i.test(x.u) ? ' ' + x.u : ''); });
    if (!W.plain) o.notice = 'NOT FOR NAVIGATION';
    return o;
  }
  function gjGeom(g) {
    if (g.t === 'P') return { type: 'Point', coordinates: g.c };
    if (g.t === 'L') return { type: 'LineString', coordinates: g.c };
    return { type: 'Polygon', coordinates: g.c };
  }
  function geojson(list, W) {
    var feats = [];
    list.forEach(function (f) { f.w.forEach(function (g) { feats.push({ type: 'Feature', id: f.uid + (f.w.length > 1 ? '#' + feats.length : ''), geometry: gjGeom(g), properties: attrsOf(f, W) }); }); });
    var o = { type: 'FeatureCollection', name: 'Aerodrome mapping ' + W.tag };
    if (!W.plain) { o.notice = 'NOT FOR NAVIGATION — for study and analysis only'; o.generator = credit(W); }
    o.package = W.pid; o.sources = W.srcs.map(function (x) { return { dataset: x.ds.name, originator: x.info.orig, licence: x.info.lic, method: x.info.method, quality: x.info.q }; });
    o.features = feats;
    return JSON.stringify(o);
  }
  var COLORS = ['1d4e89', '2e7d32', 'b0186e', 'ef6c00', '6a1b9a', '00838f', '5d4037', 'c62828', '558b2f', '283593', 'ad1457', '00695c'];
  function kml(list, W) {
    var byT = {}; list.forEach(function (f) { (byT[f.t] || (byT[f.t] = [])).push(f); });
    var types = Object.keys(byT).sort();
    function co(c) { return c[0].toFixed(8) + ',' + c[1].toFixed(8); }
    function geom(g) {
      if (g.t === 'P') return '<Point><coordinates>' + co(g.c) + '</coordinates></Point>';
      if (g.t === 'L') return '<LineString><tessellate>1</tessellate><coordinates>' + g.c.map(co).join(' ') + '</coordinates></LineString>';
      return '<Polygon><outerBoundaryIs><LinearRing><coordinates>' + g.c[0].map(co).join(' ') + '</coordinates></LinearRing></outerBoundaryIs>' + g.c.slice(1).map(function (r) { return '<innerBoundaryIs><LinearRing><coordinates>' + r.map(co).join(' ') + '</coordinates></LinearRing></innerBoundaryIs>'; }).join('') + '</Polygon>';
    }
    var h = '<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>' + xe('Aerodrome mapping ' + W.tag) + '</name>' + (W.plain ? '' : '<description>' + xe(noticeLine(W) + ' ' + credit(W)) + '</description>');
    types.forEach(function (t, i) { var c = COLORS[i % COLORS.length], bgr = c.slice(4, 6) + c.slice(2, 4) + c.slice(0, 2); h += '<Style id="s' + i + '"><LineStyle><color>ff' + bgr + '</color><width>2</width></LineStyle><PolyStyle><color>66' + bgr + '</color></PolyStyle><IconStyle><color>ff' + bgr + '</color><scale>0.7</scale></IconStyle></Style>'; });
    types.forEach(function (t, i) {
      h += '<Folder><name>' + xe(t) + ' (' + byT[t].length + ')</name>';
      byT[t].forEach(function (f) {
        var at = attrsOf(f, W);
        f.w.forEach(function (g) { h += '<Placemark><name>' + xe(f.label || f.t) + '</name><styleUrl>#s' + i + '</styleUrl><ExtendedData>' + Object.keys(at).map(function (k) { return '<Data name="' + xe(k) + '"><value>' + xe(at[k] === null ? '(unknown)' : at[k]) + '</value></Data>'; }).join('') + '</ExtendedData>' + geom(g) + '</Placemark>'; });
      });
      h += '</Folder>';
    });
    return h + '</Document></kml>\n';
  }
  function columns(list, W) { var cols = {}; list.forEach(function (f) { Object.keys(attrsOf(f, W)).forEach(function (k) { cols[k] = 1; }); }); return Object.keys(cols); }
  function wkt(g) {
    function c(p) { return p[0].toFixed(9) + ' ' + p[1].toFixed(9); }
    if (g.t === 'P') return 'POINT (' + c(g.c) + ')';
    if (g.t === 'L') return 'LINESTRING (' + g.c.map(c).join(', ') + ')';
    return 'POLYGON (' + g.c.map(function (r) { return '(' + r.map(c).join(', ') + ')'; }).join(', ') + ')';
  }
  function tables(list, W) {
    var byT = {}, out = {}; list.forEach(function (f) { (byT[f.t] || (byT[f.t] = [])).push(f); });
    Object.keys(byT).sort().forEach(function (t) {
      var cols = columns(byT[t], W).concat(['wkt']);
      var rows = byT[t].map(function (f) { var a = attrsOf(f, W); a.wkt = f.w.map(wkt).join(';'); return cols.map(function (c) { return a[c] === null || a[c] === undefined ? '' : a[c]; }); });
      out[t] = { cols: cols, rows: rows, csv: (W.plain ? '' : '# ' + noticeLine(W) + ' ' + credit(W) + '\n') + cols.map(EXPORTS.csvCell).join(',') + '\n' + rows.map(function (r) { return r.map(EXPORTS.csvCell).join(','); }).join('\n') + '\n' };
    });
    return out;
  }
  function excel(list, W) {
    var tb = tables(list, W), wb = XLSX.utils.book_new();
    var info = [['Aerodrome mapping package', W.tag], ['Package', W.pid], ['Created', W.now.toISOString()]];
    if (!W.plain) { info.unshift(['Notice', 'NOT FOR NAVIGATION — for study and analysis only']); info.push(['Made with', credit(W)]); }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(info), 'Info');
    Object.keys(tb).forEach(function (t) { XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([tb[t].cols].concat(tb[t].rows)), t.slice(0, 31)); });
    return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx', compression: true }));
  }
  // Shapefiles: one set per feature type and geometry kind; outer rings clockwise as the format wants
  function shapefiles(list, W) {
    var out = {}, sets = {};
    list.forEach(function (f) {
      f.w.forEach(function (g) {
        var k = f.t + '_' + (g.t === 'P' ? 'point' : g.t === 'L' ? 'line' : 'area'), s = sets[k] || (sets[k] = { kind: g.t === 'P' ? 1 : g.t === 'L' ? 3 : 5, geoms: [], f: [] });
        s.geoms.push(g.t === 'P' ? [[g.c]] : g.t === 'L' ? [g.c] : g.c.map(function (r) { return r.slice().reverse(); }));
        s.f.push(f);
      });
    });
    var prj = 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';
    Object.keys(sets).forEach(function (k) {
      var s = sets[k], cols = columns(s.f, W).slice(0, 60);
      var sh = CONVERT.shpWrite(s.kind, s.geoms);
      out[k + '.shp'] = sh.shp; out[k + '.shx'] = sh.shx; out[k + '.prj'] = u8(prj); out[k + '.cpg'] = u8('UTF-8');
      out[k + '.dbf'] = dbf(cols, s.f.map(function (f) { var a = attrsOf(f, W); return cols.map(function (c) { return a[c] === null || a[c] === undefined ? '' : String(a[c]); }); }));
    });
    return out;
  }
  function dbf(cols, rows) {
    var names = [], used = {};
    cols.forEach(function (c) { var n = c.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 10), i = 1; while (used[n.toUpperCase()]) n = c.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 8) + (i++); used[n.toUpperCase()] = 1; names.push(n); });
    var lens = cols.map(function (c, i) { return Math.min(254, Math.max(1, rows.reduce(function (m, r) { return Math.max(m, enc.encode(r[i]).length); }, 1))); });
    var hl = 32 + cols.length * 32 + 1, rl = 1 + lens.reduce(function (a, b) { return a + b; }, 0), buf = new Uint8Array(hl + rl * rows.length + 1), dv = new DataView(buf.buffer);
    var d = new Date(); buf[0] = 3; buf[1] = d.getFullYear() - 1900; buf[2] = d.getMonth() + 1; buf[3] = d.getDate();
    dv.setUint32(4, rows.length, true); dv.setUint16(8, hl, true); dv.setUint16(10, rl, true);
    names.forEach(function (n, i) { var o = 32 + i * 32; for (var j = 0; j < n.length; j++) buf[o + j] = n.charCodeAt(j); buf[o + 11] = 67; buf[o + 16] = lens[i]; });
    buf[hl - 1] = 0x0d;
    rows.forEach(function (r, ri) {
      var o = hl + ri * rl; buf[o++] = 0x20;
      r.forEach(function (v, i) { var b = enc.encode(v).slice(0, lens[i]); buf.set(b, o); for (var j = b.length; j < lens[i]; j++) buf[o + j] = 0x20; o += lens[i]; });
    });
    buf[buf.length - 1] = 0x1a;
    return buf;
  }
  // WGS 84 -> UTM (Krüger series, sub-millimetre within the zone)
  function utm(lon, lat, zone) {
    var a = 6378137, f = 1 / 298.257223563, k0 = 0.9996, n = f / (2 - f), A1 = a / (1 + n) * (1 + n * n / 4 + n * n * n * n / 64);
    var al = [n / 2 - 2 * n * n / 3 + 5 * n * n * n / 16, 13 * n * n / 48 - 3 * n * n * n / 5, 61 * n * n * n / 240];
    var l0 = ((zone - 1) * 6 - 180 + 3) * Math.PI / 180, ph = lat * Math.PI / 180, lm = lon * Math.PI / 180 - l0;
    var e = Math.sqrt(f * (2 - f)), t = Math.sinh(Math.atanh(Math.sin(ph)) - e * Math.atanh(e * Math.sin(ph)));
    var xi = Math.atan2(t, Math.cos(lm)), eta = Math.atanh(Math.sin(lm) / Math.sqrt(1 + t * t)), X = xi, Y = eta;
    for (var j = 1; j <= 3; j++) { X += al[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta); Y += al[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta); }
    return [500000 + k0 * A1 * Y, (lat < 0 ? 10000000 : 0) + k0 * A1 * X];
  }
  // DXF R12 in WGS 84 / UTM (metres): one layer per feature type
  function dxf(list, W) {
    var first = list.map(function (f) { var g = f.w[0]; return g ? (g.t === 'P' ? g.c : g.t === 'L' ? g.c[0] : g.c[0][0]) : null; }).filter(Boolean)[0] || [0, 0];
    var zone = Math.min(60, Math.max(1, Math.floor((first[0] + 180) / 6) + 1)), south = first[1] < 0, L = [];
    function p(c, d) { L.push(c, d); }
    var types = Array.from(new Set(list.map(function (f) { return f.t; }))).sort();
    p(999, (W.plain ? 'Aerodrome mapping ' + W.tag : 'NOT FOR NAVIGATION - ' + credit(W)).replace(/[^\x20-\x7e]/g, '-'));
    p(999, 'Coordinates: WGS 84 / UTM zone ' + zone + (south ? 'S' : 'N') + ' (EPSG:' + (south ? 327 : 326) + ('0' + zone).slice(-2) + '), metres');
    p(0, 'SECTION'); p(2, 'HEADER'); p(9, '$ACADVER'); p(1, 'AC1009'); p(0, 'ENDSEC');
    p(0, 'SECTION'); p(2, 'TABLES'); p(0, 'TABLE'); p(2, 'LAYER'); p(70, types.length);
    types.forEach(function (t, i) { p(0, 'LAYER'); p(2, t.toUpperCase()); p(70, 0); p(62, (i % 6) + 1); p(6, 'CONTINUOUS'); });
    p(0, 'ENDTAB'); p(0, 'ENDSEC'); p(0, 'SECTION'); p(2, 'ENTITIES');
    list.forEach(function (f) {
      var ly = f.t.toUpperCase();
      f.w.forEach(function (g) {
        if (g.t === 'P') { var q = utm(g.c[0], g.c[1], zone); p(0, 'POINT'); p(8, ly); p(10, q[0].toFixed(3)); p(20, q[1].toFixed(3)); p(30, '0.0'); return; }
        (g.t === 'L' ? [g.c] : g.c).forEach(function (r) {
          p(0, 'POLYLINE'); p(8, ly); p(66, 1); p(70, g.t === 'A' ? 1 : 0);
          (g.t === 'A' ? r.slice(0, -1) : r).forEach(function (c) { var q = utm(c[0], c[1], zone); p(0, 'VERTEX'); p(8, ly); p(10, q[0].toFixed(3)); p(20, q[1].toFixed(3)); p(30, '0.0'); });
          p(0, 'SEQEND'); p(8, ly);
        });
      });
    });
    p(0, 'ENDSEC'); p(0, 'EOF');
    return { zone: 'UTM' + zone + (south ? 'S' : 'N'), text: L.join('\r\n') + '\r\n' };
  }

  /* -------------------------------------------------------------- GeoPackage */
  var sqlP = null;
  function sql() { if (!sqlP) sqlP = LAZY.run('lazy-sqljs').then(function () { return initSqlJs({ wasmBinary: LAZY.bytes('lazy-sqlwasm') }); }); return sqlP; }
  // GeoPackage geometry: header (GP, version 0, little-endian, xy envelope, SRS 4326) + WKB
  function gpkgGeom(g) {
    var pts = g.t === 'P' ? [g.c] : g.t === 'L' ? g.c : g.c[0], bb = [Infinity, -Infinity, Infinity, -Infinity];
    pts.forEach(function (c) { bb[0] = Math.min(bb[0], c[0]); bb[1] = Math.max(bb[1], c[0]); bb[2] = Math.min(bb[2], c[1]); bb[3] = Math.max(bb[3], c[1]); });
    var n = g.t === 'P' ? 21 : g.t === 'L' ? 9 + 16 * g.c.length : 9 + g.c.reduce(function (s, r) { return s + 4 + 16 * r.length; }, 0);
    var b = new Uint8Array(40 + n), d = new DataView(b.buffer), o = 0;
    b[0] = 0x47; b[1] = 0x50; b[2] = 0; b[3] = 0x03; d.setInt32(4, 4326, true); o = 8;
    bb.forEach(function (v) { d.setFloat64(o, v, true); o += 8; });
    b[o++] = 1;
    function xy(c) { d.setFloat64(o, c[0], true); d.setFloat64(o + 8, c[1], true); o += 16; }
    if (g.t === 'P') { d.setUint32(o, 1, true); o += 4; xy(g.c); }
    else if (g.t === 'L') { d.setUint32(o, 2, true); o += 4; d.setUint32(o, g.c.length, true); o += 4; g.c.forEach(xy); }
    else { d.setUint32(o, 3, true); o += 4; d.setUint32(o, g.c.length, true); o += 4; g.c.forEach(function (r) { d.setUint32(o, r.length, true); o += 4; r.forEach(xy); }); }
    return b;
  }
  async function gpkg(list, W, meta) {
    var SQL = await sql(), db = new SQL.Database();
    db.run('PRAGMA application_id = 1196444487; PRAGMA user_version = 10300;');
    db.run('CREATE TABLE gpkg_spatial_ref_sys (srs_name TEXT NOT NULL, srs_id INTEGER NOT NULL PRIMARY KEY, organization TEXT NOT NULL, organization_coordsys_id INTEGER NOT NULL, definition TEXT NOT NULL, description TEXT)');
    db.run("INSERT INTO gpkg_spatial_ref_sys VALUES ('Undefined cartesian SRS', -1, 'NONE', -1, 'undefined', 'undefined cartesian coordinate reference system'), ('Undefined geographic SRS', 0, 'NONE', 0, 'undefined', 'undefined geographic coordinate reference system'), " +
      "('WGS 84 geodetic', 4326, 'EPSG', 4326, 'GEOGCS[\"WGS 84\",DATUM[\"WGS_1984\",SPHEROID[\"WGS 84\",6378137,298.257223563,AUTHORITY[\"EPSG\",\"7030\"]],AUTHORITY[\"EPSG\",\"6326\"]],PRIMEM[\"Greenwich\",0,AUTHORITY[\"EPSG\",\"8901\"]],UNIT[\"degree\",0.0174532925199433,AUTHORITY[\"EPSG\",\"9122\"]],AUTHORITY[\"EPSG\",\"4326\"]]', 'longitude/latitude coordinates in decimal degrees on the WGS 84 spheroid')");
    db.run("CREATE TABLE gpkg_contents (table_name TEXT NOT NULL PRIMARY KEY, data_type TEXT NOT NULL, identifier TEXT UNIQUE, description TEXT DEFAULT '', last_change DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), min_x DOUBLE, min_y DOUBLE, max_x DOUBLE, max_y DOUBLE, srs_id INTEGER, CONSTRAINT fk_gc_r_srs_id FOREIGN KEY (srs_id) REFERENCES gpkg_spatial_ref_sys(srs_id))");
    db.run('CREATE TABLE gpkg_geometry_columns (table_name TEXT NOT NULL, column_name TEXT NOT NULL, geometry_type_name TEXT NOT NULL, srs_id INTEGER NOT NULL, z TINYINT NOT NULL, m TINYINT NOT NULL, CONSTRAINT pk_geom_cols PRIMARY KEY (table_name, column_name), CONSTRAINT uk_gc_table_name UNIQUE (table_name), CONSTRAINT fk_gc_tn FOREIGN KEY (table_name) REFERENCES gpkg_contents(table_name), CONSTRAINT fk_gc_srs FOREIGN KEY (srs_id) REFERENCES gpkg_spatial_ref_sys (srs_id))');
    db.run('CREATE TABLE gpkg_extensions (table_name TEXT, column_name TEXT, extension_name TEXT NOT NULL, definition TEXT NOT NULL, scope TEXT NOT NULL, CONSTRAINT ge_tce UNIQUE (table_name, column_name, extension_name))');
    db.run("CREATE TABLE gpkg_metadata (id INTEGER CONSTRAINT m_pk PRIMARY KEY ASC NOT NULL, md_scope TEXT NOT NULL DEFAULT 'dataset', md_standard_uri TEXT NOT NULL, mime_type TEXT NOT NULL DEFAULT 'text/xml', metadata TEXT NOT NULL DEFAULT '')");
    db.run("CREATE TABLE gpkg_metadata_reference (reference_scope TEXT NOT NULL, table_name TEXT, column_name TEXT, row_id_value INTEGER, timestamp DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), md_file_id INTEGER NOT NULL, md_parent_id INTEGER, CONSTRAINT crmr_mfi_fk FOREIGN KEY (md_file_id) REFERENCES gpkg_metadata(id), CONSTRAINT crmr_mpi_fk FOREIGN KEY (md_parent_id) REFERENCES gpkg_metadata(id))");
    db.run("INSERT INTO gpkg_extensions VALUES ('gpkg_metadata', NULL, 'gpkg_metadata', 'http://www.geopackage.org/spec/#extension_metadata', 'read-write'), ('gpkg_metadata_reference', NULL, 'gpkg_metadata', 'http://www.geopackage.org/spec/#extension_metadata', 'read-write')");
    db.run("INSERT INTO gpkg_metadata (id, md_scope, md_standard_uri, mime_type, metadata) VALUES (1, 'dataset', 'http://www.isotc211.org/2005/gmd', 'text/xml', ?)", ['<?xml version="1.0" encoding="UTF-8"?>\n' + meta]);
    db.run("INSERT INTO gpkg_metadata_reference (reference_scope, md_file_id) VALUES ('geopackage', 1)");
    var groups = {};
    list.forEach(function (f) { f.w.forEach(function (g) { var k = f.t + (g.t === 'P' ? '_point' : g.t === 'L' ? '_line' : '_area'); (groups[k] || (groups[k] = { t: g.t, rows: [] })).rows.push({ f: f, g: g }); }); });
    Object.keys(groups).sort().forEach(function (tn) {
      var gr = groups[tn], cols = columns(gr.rows.map(function (x) { return x.f; }), W), gt = gr.t === 'P' ? 'POINT' : gr.t === 'L' ? 'LINESTRING' : 'POLYGON';
      db.run('CREATE TABLE "' + tn + '" (fid INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, geom ' + gt + ', ' + cols.map(function (c) { return '"' + c.replace(/"/g, '') + '" TEXT'; }).join(', ') + ')');
      var st = db.prepare('INSERT INTO "' + tn + '" (geom, ' + cols.map(function (c) { return '"' + c.replace(/"/g, '') + '"'; }).join(', ') + ') VALUES (?' + cols.map(function () { return ', ?'; }).join('') + ')');
      var bb = [Infinity, Infinity, -Infinity, -Infinity];
      db.run('BEGIN');
      gr.rows.forEach(function (x) {
        var a = attrsOf(x.f, W);
        st.run([gpkgGeom(x.g)].concat(cols.map(function (c) { return a[c] === undefined ? null : a[c]; })));
        (x.g.t === 'P' ? [x.g.c] : x.g.t === 'L' ? x.g.c : x.g.c[0]).forEach(function (c) { bb[0] = Math.min(bb[0], c[0]); bb[1] = Math.min(bb[1], c[1]); bb[2] = Math.max(bb[2], c[0]); bb[3] = Math.max(bb[3], c[1]); });
      });
      db.run('COMMIT'); st.free();
      db.run('INSERT INTO gpkg_contents (table_name, data_type, identifier, description, last_change, min_x, min_y, max_x, max_y, srs_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 4326)', [tn, 'features', tn, 'AMXM ' + tn.replace(/_(point|line|area)$/, '') + (W.plain ? '' : ' — NOT FOR NAVIGATION'), W.now.toISOString(), bb[0], bb[1], bb[2], bb[3]]);
      db.run("INSERT INTO gpkg_geometry_columns VALUES (?, 'geom', ?, 4326, 0, 0)", [tn, gt]);
    });
    var out = db.export(); db.close();
    return out;
  }

  /* ---------------------------------------------------------------- metadata */
  function bboxOf(list) { var b = [Infinity, Infinity, -Infinity, -Infinity]; list.forEach(function (f) { f.w.forEach(function (g) { (g.t === 'P' ? [g.c] : g.t === 'L' ? g.c : g.c[0]).forEach(function (c) { b[0] = Math.min(b[0], c[0]); b[1] = Math.min(b[1], c[1]); b[2] = Math.max(b[2], c[0]); b[3] = Math.max(b[3], c[1]); }); }); }); return b; }
  function cs(t) { return '<gco:CharacterString>' + xe(t) + '</gco:CharacterString>'; }
  var CL = 'http://standards.iso.org/iso/19139/resources/gmxCodelists.xml#';
  function party(name, role, org) { return '<gmd:CI_ResponsibleParty>' + (name ? '<gmd:individualName>' + cs(name) + '</gmd:individualName>' : '') + (org ? '<gmd:organisationName>' + cs(org) + '</gmd:organisationName>' : '') + '<gmd:role><gmd:CI_RoleCode codeList="' + CL + 'CI_RoleCode" codeListValue="' + role + '">' + role + '</gmd:CI_RoleCode></gmd:role></gmd:CI_ResponsibleParty>'; }
  // ISO 19115 / 19139 metadata of the package (also inside the AMXM file and the GeoPackage)
  function iso19115(list, W) {
    var b = bboxOf(list), dt = W.now.toISOString().slice(0, 19) + 'Z', types = Array.from(new Set(list.map(function (f) { return f.t; }))).sort();
    var hacc = {}; list.forEach(function (f) { var h = f.a.hacc && parseFloat(f.a.hacc.v); if (!isNaN(h)) { var o = hacc[f.t] || (hacc[f.t] = { min: h, max: h }); o.min = Math.min(o.min, h); o.max = Math.max(o.max, h); } });
    var abstract = 'Aerodrome mapping data of ' + W.ads.join(', ') + ': ' + list.length + ' features of ' + types.length + ' AMXM feature types (' + types.join(', ') + ').' + (W.plain ? '' : ' NOT FOR NAVIGATION — for study and analysis only. Not a certified aeronautical data product.');
    return '<gmd:MD_Metadata xmlns:gmd="http://www.isotc211.org/2005/gmd" xmlns:gco="http://www.isotc211.org/2005/gco">' +
      '<gmd:fileIdentifier>' + cs(W.pid) + '</gmd:fileIdentifier><gmd:language>' + cs('eng') + '</gmd:language><gmd:characterSet><gmd:MD_CharacterSetCode codeList="' + CL + 'MD_CharacterSetCode" codeListValue="utf8">utf8</gmd:MD_CharacterSetCode></gmd:characterSet>' +
      '<gmd:hierarchyLevel><gmd:MD_ScopeCode codeList="' + CL + 'MD_ScopeCode" codeListValue="dataset">dataset</gmd:MD_ScopeCode></gmd:hierarchyLevel>' +
      '<gmd:contact>' + (W.plain ? party('', 'pointOfContact', SET.who || 'the recipient of this package') : party(APP_INFO.author, 'processor', APP_INFO.name)) + '</gmd:contact>' +
      '<gmd:dateStamp><gco:DateTime>' + dt + '</gco:DateTime></gmd:dateStamp><gmd:metadataStandardName>' + cs('ISO 19115:2003 / ISO 19139, aerodrome mapping metadata (ED-119 / PANS-AIM elements)') + '</gmd:metadataStandardName>' +
      '<gmd:referenceSystemInfo><gmd:MD_ReferenceSystem><gmd:referenceSystemIdentifier><gmd:RS_Identifier><gmd:code>' + cs('EPSG:4326') + '</gmd:code><gmd:codeSpace>' + cs('EPSG') + '</gmd:codeSpace></gmd:RS_Identifier></gmd:referenceSystemIdentifier></gmd:MD_ReferenceSystem></gmd:referenceSystemInfo>' +
      '<gmd:referenceSystemInfo><gmd:MD_ReferenceSystem><gmd:referenceSystemIdentifier><gmd:RS_Identifier><gmd:code>' + cs('EPSG:5773 (EGM96 height), heights as delivered by the sources') + '</gmd:code><gmd:codeSpace>' + cs('EPSG') + '</gmd:codeSpace></gmd:RS_Identifier></gmd:referenceSystemIdentifier></gmd:MD_ReferenceSystem></gmd:referenceSystemInfo>' +
      '<gmd:identificationInfo><gmd:MD_DataIdentification><gmd:citation><gmd:CI_Citation><gmd:title>' + cs('Aerodrome mapping data ' + W.tag) + '</gmd:title><gmd:date><gmd:CI_Date><gmd:date><gco:DateTime>' + dt + '</gco:DateTime></gmd:date><gmd:dateType><gmd:CI_DateTypeCode codeList="' + CL + 'CI_DateTypeCode" codeListValue="creation">creation</gmd:CI_DateTypeCode></gmd:dateType></gmd:CI_Date></gmd:date></gmd:CI_Citation></gmd:citation>' +
      '<gmd:abstract>' + cs(abstract) + '</gmd:abstract>' +
      W.srcs.map(function (s) { return '<gmd:pointOfContact>' + party('', 'originator', s.info.orig || s.ds.state || s.ds.name) + '</gmd:pointOfContact>'; }).join('') +
      '<gmd:resourceConstraints><gmd:MD_Constraints><gmd:useLimitation>' + cs(W.plain ? 'Quality as stated for each feature and in the lineage; any use is subject to the recipient\'s own verification and processes.' : 'NOT FOR NAVIGATION. For study and analysis only. Not a certified aeronautical data product; not produced under EUROCAE ED-76A / RTCA DO-200B; not issued by an EASA Part-DAT or State AIS provider. Must not be loaded into aircraft systems or used for flight planning, navigation, aerodrome operations or any safety-related purpose.') + '</gmd:useLimitation></gmd:MD_Constraints></gmd:resourceConstraints>' +
      '<gmd:resourceConstraints><gmd:MD_LegalConstraints><gmd:otherConstraints>' + cs('Licences of the sources: ' + W.srcs.map(function (s) { return s.ds.name + ': ' + (s.info.lic || 'not stated') + ' (originator ' + (s.info.orig || 'not stated') + ')'; }).join('; ')) + '</gmd:otherConstraints></gmd:MD_LegalConstraints></gmd:resourceConstraints>' +
      '<gmd:language>' + cs('eng') + '</gmd:language><gmd:topicCategory><gmd:MD_TopicCategoryCode>transportation</gmd:MD_TopicCategoryCode></gmd:topicCategory>' +
      '<gmd:extent><gmd:EX_Extent><gmd:geographicElement><gmd:EX_GeographicBoundingBox><gmd:westBoundLongitude><gco:Decimal>' + b[0].toFixed(7) + '</gco:Decimal></gmd:westBoundLongitude><gmd:eastBoundLongitude><gco:Decimal>' + b[2].toFixed(7) + '</gco:Decimal></gmd:eastBoundLongitude><gmd:southBoundLatitude><gco:Decimal>' + b[1].toFixed(7) + '</gco:Decimal></gmd:southBoundLatitude><gmd:northBoundLatitude><gco:Decimal>' + b[3].toFixed(7) + '</gco:Decimal></gmd:northBoundLatitude></gmd:EX_GeographicBoundingBox></gmd:geographicElement></gmd:EX_Extent></gmd:extent>' +
      '<gmd:supplementalInformation>' + cs('Quality classification of the sources: ' + W.srcs.map(function (s) { return s.ds.name + ': ' + s.info.q + ' (' + s.info.method + ')'; }).join('; ') + '. Declared horizontal accuracy by feature type (m): ' + Object.keys(hacc).sort().map(function (t) { return t + ' ' + hacc[t].min + (hacc[t].max !== hacc[t].min ? '–' + hacc[t].max : ''); }).join(', ') + '.') + '</gmd:supplementalInformation>' +
      '</gmd:MD_DataIdentification></gmd:identificationInfo>' +
      '<gmd:dataQualityInfo><gmd:DQ_DataQuality><gmd:scope><gmd:DQ_Scope><gmd:level><gmd:MD_ScopeCode codeList="' + CL + 'MD_ScopeCode" codeListValue="dataset">dataset</gmd:MD_ScopeCode></gmd:level></gmd:DQ_Scope></gmd:scope>' +
      '<gmd:report><gmd:DQ_TopologicalConsistency><gmd:nameOfMeasure>' + cs('Aerodrome mapping checks (' + AMDB.RULES.length + ' rules)') + '</gmd:nameOfMeasure><gmd:result><gmd:DQ_ConformanceResult><gmd:specification><gmd:CI_Citation><gmd:title>' + cs('AMXM 2.0.2 schema, ICAO PANS-AIM Appendix 1, EUROCONTROL aerodrome mapping supporting material') + '</gmd:title><gmd:date gco:nilReason="unknown"/></gmd:CI_Citation></gmd:specification>' +
      '<gmd:explanation>' + cs(W.checks.bySev.error + ' error(s), ' + W.checks.bySev.warning + ' warning(s), ' + W.checks.bySev.info + ' note(s); see the package report') + '</gmd:explanation><gmd:pass><gco:Boolean>' + (W.checks.bySev.error ? 'false' : 'true') + '</gco:Boolean></gmd:pass></gmd:DQ_ConformanceResult></gmd:result></gmd:DQ_TopologicalConsistency></gmd:report>' +
      '<gmd:lineage><gmd:LI_Lineage><gmd:statement>' + cs('Made from the data sets listed as sources. Coding fixed where unambiguous (rings closed, outer boundaries counter-clockwise, holes clockwise, repeated positions removed); required attributes not in the sources written as unknown. No position was changed or created.') + '</gmd:statement>' +
      '<gmd:processStep><gmd:LI_ProcessStep><gmd:description>' + cs('Read, checked and written as AMXM 2.0 / AIXM 5.1.1 / GIS formats' + (W.plain ? '' : ' with ' + credit(W))) + '</gmd:description><gmd:dateTime><gco:DateTime>' + dt + '</gco:DateTime></gmd:dateTime>' + (W.plain ? '' : '<gmd:processor>' + party(APP_INFO.author, 'processor', APP_INFO.name) + '</gmd:processor>') + '</gmd:LI_ProcessStep></gmd:processStep>' +
      W.srcs.map(function (s) { return '<gmd:source><gmd:LI_Source><gmd:description>' + cs(s.ds.name + ' (' + s.set.kind + '), originator ' + (s.info.orig || 'not stated') + ', licence ' + (s.info.lic || 'not stated') + ', made by: ' + s.info.method + ', quality ' + s.info.q + (s.info.date ? ', dated ' + s.info.date : '') + (s.info.rights ? '' : ' — right of use not confirmed by the user')) + '</gmd:description></gmd:LI_Source></gmd:source>'; }).join('') +
      '</gmd:LI_Lineage></gmd:lineage></gmd:DQ_DataQuality></gmd:dataQualityInfo></gmd:MD_Metadata>';
  }
  function checksJson(list, W) {
    var byI = {}; list.forEach(function (f) { byI[f.i] = f; });
    var o = { package: W.pid, checked: W.checks.at, rules: AMDB.RULES_VERSION, engine: W.checks.engine, result: W.checks.bySev, findings: W.checks.findings.map(function (x) { var f = byI[x.f]; return Object.assign({ feature: f ? { type: f.t, idnumber: f.uid, label: f.label } : null }, x); }), ruleCatalogue: AMDB.RULES };
    if (!W.plain) o.notice = 'NOT FOR NAVIGATION — for study and analysis only';
    return o;
  }
  function catalogueCsv(list) {
    var D = M.amxmDict(), types = Array.from(new Set(list.map(function (f) { return f.t; }))).sort();
    var corr = { AerodromeReferencePoint: 'AirportHeliport', RunwayElement: "RunwayElement[type='NORMAL']", RunwayIntersection: "RunwayElement[type='INTERSECTION']", RunwayShoulder: "RunwayElement[type='SHOULDER']", RunwayDisplacedArea: "RunwayElement[type='DISPLACED']",
      RunwayThreshold: "RunwayCentrelinePoint[role='THR' or 'DISTHR']", RunwayCenterlinePoint: 'RunwayCentrelinePoint', TaxiwayElement: 'TaxiwayElement', TaxiwayShoulder: "TaxiwayElement[type='SHOULDER']", ApronElement: 'ApronElement',
      ParkingStandLocation: 'AircraftStand', ParkingStandArea: "ApronElement[type='PARKING'] or AircraftStand extent", TaxiwayGuidanceLine: 'GuidanceLine', StandGuidanceLine: "GuidanceLine[type='GATE_TLANE']", RunwayExitLine: 'GuidanceLine (runway exit)',
      TaxiwayHoldingPosition: 'TaxiHoldingPosition', DeicingArea: 'DeicingArea', ConstructionArea: 'WorkArea', ServiceRoad: "Road[type='SERVICE']", Blastpad: 'RunwayBlastPad', Stopway: "RunwayProtectArea[type='STOPWAY']", Hotspot: 'AirportHotSpot',
      SurveyControlPoint: 'SurveyControlPoint', TouchDownLiftOffArea: 'TouchDownLiftOff', VerticalPointStructure: 'VerticalStructure', VerticalLineStructure: 'VerticalStructure', VerticalPolygonalStructure: 'VerticalStructure' };
    return 'amxm_feature_type,ed99_do272_feature,feattype_code,geometry,aixm_5_1_1_correspondence,features_in_package,definition\n' + types.map(function (t) {
      var def = D.features[t] || { attrs: [], doc: '' }, ft = Object.keys(D.codes.feattypeBaseTypeType).filter(function (k) { return D.codes.feattypeBaseTypeType[k].replace(/\s+/g, '').toLowerCase() === t.toLowerCase(); })[0] || '';
      var geo = def.attrs.filter(function (a) { return /^geo(poly|line|pnt)$/.test(a.n); }).map(function (a) { return { geopoly: 'polygon', geoline: 'line', geopnt: 'point' }[a.n]; }).join('/');
      return [t, t.replace(/([a-z])([A-Z])/g, '$1 $2'), ft, geo, corr[t] || '(AIXM extension)', list.filter(function (f) { return f.t === t; }).length, def.doc].map(EXPORTS.csvCell).join(',');
    }).join('\n') + '\n';
  }

  /* ----------------------------------------------- report, specification, notes */
  function C(t) { return { t: t === undefined || t === null ? '' : String(t) }; }
  var NOTICE_FULL = 'NOT FOR NAVIGATION. FOR STUDY AND ANALYSIS PURPOSES ONLY. This aerodrome mapping package was produced with the AIXM Code Converter, created by Prasad Selvaraj. It is not a certified aeronautical data product. It has not been produced under EUROCAE ED-76A / RTCA DO-200B, is not issued by an EASA Part-DAT or State AIS provider, and must not be loaded into aircraft systems or used for flight planning, navigation, aerodrome operations or any safety-related purpose. It is derived from the sources listed in this report, which keep their own copyright and licences, and its accuracy is limited to the quality stated per feature. It is provided "as is", without warranty of any kind; the author and contributors accept no liability for any use of it (Apache License 2.0, sections 7 and 8). AMXM is a schema of RTCA and EUROCAE, used under its licence; RTCA and EUROCAE do not endorse this product. Not affiliated with EUROCONTROL, the FAA, ICAO, EASA, RTCA, EUROCAE or SAE / ARINC.';
  function reportScope(list, W, files) {
    var byT = {}; list.forEach(function (f) { byT[f.t] = (byT[f.t] || 0) + 1; });
    var byRule = {}; W.checks.findings.forEach(function (x) { byRule[x.r] = (byRule[x.r] || 0) + 1; });
    var byI = {}; list.forEach(function (f) { byI[f.i] = f; });
    var secs = [];
    if (!W.plain) secs.push({ title: 'Notice', blocks: [{ kind: 'note', text: NOTICE_FULL }] });
    secs.push({ title: "What's inside", blocks: [
      { kind: 'kv', rows: [['Package', W.pid], ['Created', W.now.toISOString().slice(0, 19) + 'Z'], ['Aerodromes', W.ads.join(', ')], ['Features', list.length + ' (' + Object.keys(byT).length + ' feature types)'], ['Scope', SET.mode === 'full' ? 'full export' : 'custom export']].concat(W.plain ? [] : [['Made with', credit(W)]]).map(function (r) { return { label: r[0], cells: [C(r[1])] }; }) },
      { kind: 'table', title: 'Features by type', cols: ['AMXM feature type', 'Features'], rows: Object.keys(byT).sort().map(function (t) { return [C(t), C(byT[t])]; }) },
      { kind: 'table', title: 'Files (PACKAGE.json and SHA256SUMS.txt list every file)', cols: ['File', 'Bytes', 'SHA-256', 'CRC32Q'], rows: files.map(function (f) { return [C(f.path), C(f.bytes), C(f.sha256), C(f.crc32q)]; }) }] });
    secs.push({ title: 'Sources (what data was used)', blocks: [{ kind: 'table', cols: ['Data set', 'Kind', 'Originator', 'Licence', 'Date', 'How it was made', 'Quality class', 'Right of use'], rows: W.srcs.map(function (s) { return [C(s.ds.name), C(s.set.kind), C(s.info.orig), C(s.info.lic || 'not stated'), C(s.info.date), C(s.info.method), C(s.info.q), C(s.info.rights ? 'confirmed by the user' : 'not confirmed')]; }) }] });
    secs.push({ title: 'How it was made', blocks: [{ kind: 'table', cols: ['Step', 'What was done'], rows: [
      ['1. Read', 'The source files were read as delivered (AMXM 2.0 or AIXM 5.x). AIXM aerodrome features were taken as their AMXM counterparts (EUROCONTROL feature correspondences).'],
      ['2. Checked', AMDB.RULES.length + ' rules (generic, quality, geometry, functional, completeness), each with its source; geometry with JSTS on a local plane about each aerodrome reference point.'],
      ['3. Coding fixed', W.fix.closed + ' ring(s) closed, ' + W.fix.oriented + ' ring(s) turned (outer counter-clockwise, holes clockwise), ' + W.fix.dup + ' repeated position(s) removed. No position was moved and no feature was created.'],
      ['4. Unknown values', W.fix.unknown + ' attribute(s) the AMXM schema requires and the sources do not give were written as unknown (nilReason="Unknown").' + (W.fix.invalid.length ? ' ' + W.fix.invalid.length + ' value(s) of the sources the schema does not allow were written as unknown too (the checks list them: rules G02, G08 – G10): ' + W.fix.invalid.slice(0, 40).join('; ') + (W.fix.invalid.length > 40 ? ' …' : '') + '.' : '') + (W.fix.placeholder.length ? ' ' + W.fix.placeholder.length + ' required date(s) the sources do not give and the schema does not allow to be empty were written as the date shown (placeholders): ' + W.fix.placeholder.slice(0, 40).join('; ') + (W.fix.placeholder.length > 40 ? ' …' : '') + '.' : '')],
      ['5. Written', 'AMXM 2.0 (AMXM 2.0.2 schema, namespace ' + NS_AMXM + '), AIXM 5.1.1, GIS and CAD formats from the same geometry; identifiers kept (identifier map in data/).'],
      ['6. Signed off', 'Checksums (SHA-256, CRC32Q) of every file in PACKAGE.json and SHA256SUMS.txt.']].map(function (r) { return [C(r[0]), C(r[1])]; }) }] });
    secs.push({ title: 'Checks', blocks: [
      { kind: 'kv', rows: [['Result', W.checks.bySev.error + ' error(s), ' + W.checks.bySev.warning + ' warning(s), ' + W.checks.bySev.info + ' note(s)'], ['Rules', 'AMDB rules ' + AMDB.RULES_VERSION + ', geometry engine ' + W.checks.engine]].map(function (r) { return { label: r[0], cells: [C(r[1])] }; }) },
      { kind: 'table', title: 'Results by rule', cols: ['Rule', 'Check', 'Result', 'Source'], rows: AMDB.RULES.map(function (r) { return [C(r.id), C(r.title), C(!W.checks.ran[r.id] ? 'not run' : byRule[r.id] ? byRule[r.id] + ' finding(s)' : 'passed'), C(r.src)]; }) },
      { kind: 'table', title: 'Findings', cols: ['Severity', 'Rule', 'Aerodrome', 'Feature', 'Finding', 'Found', 'Expected'], rows: W.checks.findings.map(function (x) { var f = byI[x.f]; return [C(x.sev), C(x.r), C(x.ad), C(f ? f.t + (f.label ? ' ' + f.label : '') : ''), C(x.msg), C(x.found), C(x.expected)]; }) }] });
    // each feature type against the accuracy its data needs (ICAO PANS-AIM Appendix 1), from what it declares or its source
    if (typeof AMDBQ !== 'undefined') {
      var FQ = AMDBQ.fitness(list);
      secs.push({ title: 'Fit for use (estimated from the sources)', blocks: [
        { kind: 'kv', rows: [['Meets', FQ.all.meets], ['Published by the State, accuracy not declared', FQ.all.state], ['Unknown', FQ.all.unknown], ['Not met', FQ.all['not met']], ['No requirement held', FQ.all['n/a']]].map(function (r) { return { label: r[0], cells: [C(r[1])] }; }) },
        { kind: 'table', cols: ['Feature type', 'Data class', 'Required (m)', 'Requirement from', 'Features', 'Meets', 'State', 'Unknown', 'Not met'], rows: FQ.types.filter(function (T) { return T.req; }).map(function (T) { return [C(T.t), C(T.req.cls), C(T.req.acc), C(T.req.by), C(T.n), C(T.meets), C(T.state), C(T.unknown), C(T['not met'])]; }) },
        { kind: 'note', text: 'Accuracy: what a feature declares, else an estimate from its source (the fit of a placed chart, three pixels of the imagery traced on), else its source (a value the State publishes; OpenStreetMap: not stated; ICAO Annex 14 layout: not a measurement). Integrity is not assured: this tool is not an ED-76A / DO-200B process. Not a certification of the data.' }] });
    }
    secs.push({ title: 'Limits', blocks: [{ kind: 'note', text: 'The quality of this package is the quality of its sources: no position was compared with a survey or with imagery. A rule that passes found nothing; it does not prove the data complete or correct. Requirements of EUROCAE ED-99 / RTCA DO-272 and ED-119 / DO-291 (sold by EUROCAE / RTCA) were not reproduced; the checks follow public ICAO, AMXM schema and EUROCONTROL material.' }] });
    return { title: 'Aerodrome mapping package ' + W.tag, sub: W.plain ? '' : 'NOT FOR NAVIGATION — study and analysis only', ds: null, sections: secs };
  }
  function reportHtml(sc, W) {
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>' + xe(sc.title) + '</title><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="font:14px Segoe UI,Arial,sans-serif;max-width:1100px;margin:24px auto;padding:0 16px;color:#1a1a1a">' +
      '<h1 style="color:#0b2a4a">' + xe(sc.title) + '</h1>' + (sc.sub ? '<p style="font-weight:700;color:#b25f00">' + xe(sc.sub) + '</p>' : '') + EXPORTS.sectionsHtml(EXPORTS.flatSections(sc.sections), 100000, true) +
      (W.plain ? '' : '<p style="color:#666;font-size:12px">' + xe(credit(W)) + '</p>') + '</body></html>\n';
  }
  function dps(list, W) {
    var types = Array.from(new Set(list.map(function (f) { return f.t; }))).sort(), D = M.amxmDict();
    var s = [['1. Overview', 'Data product: aerodrome mapping data of ' + W.ads.join(', ') + '. Purpose: study and analysis' + (W.plain ? '' : ' — NOT FOR NAVIGATION') + '. Package ' + W.pid + ', created ' + W.now.toISOString().slice(0, 10) + '.'],
      ['2. Specification scope', 'The whole data product (all aerodromes and feature types listed below).'],
      ['3. Data product identification', 'Title: Aerodrome mapping data ' + W.tag + '. Spatial extent: see the ISO 19115 metadata (bounding box). Topic: transportation (aerodromes).'],
      ['4. Data content and structure', 'Application schema: AMXM 2.0 (AMXM 2.0.2 XML schema of ED-119 / DO-291, namespace ' + NS_AMXM + '); AIXM 5.1.1 for the same features. Feature types: ' + types.map(function (t) { return t + ' — ' + ((D.features[t] || {}).doc || ''); }).join('; ') + '.'],
      ['5. Reference systems', 'Horizontal: WGS 84 (EPSG:4326), latitude / longitude in decimal degrees. Vertical: heights as delivered by the sources (EGM96 mean sea level when stated). Temporal: UTC (ISO 8601).'],
      ['6. Data quality', 'Accuracy, resolution and integrity are given per feature (hacc, hres, integr, vacc, vres) as delivered; quality class of each source: ' + W.srcs.map(function (x) { return x.ds.name + ' ' + x.info.q; }).join(', ') + '. Checks: ' + AMDB.RULES.length + ' rules, results in the package report.'],
      ['7. Data capture', 'Sources: ' + W.srcs.map(function (x) { return x.ds.name + ' (' + x.info.method + ', originator ' + (x.info.orig || 'not stated') + ')'; }).join('; ') + '. No data was captured by the processor.'],
      ['8. Data maintenance', 'Not maintained: a snapshot of the sources at the date of creation. Rebuild the package from newer sources.'],
      ['9. Portrayal', 'None specified. The GIS files can be shown in any GIS; the KML in Google Earth.'],
      ['10. Delivery', 'One zip: AMXM 2.0 XML, AIXM 5.1.1 XML, GeoPackage, GeoJSON, KML, Shapefile, CSV, Excel and DXF as chosen; metadata, report, guides and checksums.'],
      ['11. Metadata', 'ISO 19115 / ISO 19139 (metadata/ folder; also inside the AMXM file and the GeoPackage).']];
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Data product specification ' + xe(W.tag) + '</title></head><body style="font:14px Segoe UI,Arial,sans-serif;max-width:960px;margin:24px auto;padding:0 16px">' +
      '<h1>Data product specification — aerodrome mapping ' + xe(W.tag) + '</h1><p><i>Structured after ISO 19131.</i></p>' + s.map(function (r) { return '<h2>' + xe(r[0]) + '</h2><p>' + xe(r[1]) + '</p>'; }).join('') + '</body></html>\n';
  }
  function howTo(W) {
    return [W.plain ? 'AERODROME MAPPING PACKAGE ' + W.tag : 'AERODROME MAPPING PACKAGE ' + W.tag + ' — NOT FOR NAVIGATION, FOR STUDY AND ANALYSIS ONLY', '',
      'QGIS (free): Layer > Add Layer > Add Vector Layer > gis/*.gpkg (all tables), or the GeoJSON / Shapefile files. The metadata is inside the GeoPackage (gpkg_metadata).',
      'ArcGIS Pro / ArcMap with ArcGIS Aviation (Airports): the AMXM file data/*_AMXM-2.0.xml is an AMXM 2.0 message for the Import AMXM tool; or add the GeoPackage.',
      'Google Earth: open gis/*.kml (one folder per feature type).',
      'CAD: cad/*.dxf, AutoCAD R12 DXF in WGS 84 / UTM metres (zone in the file name), one layer per feature type.',
      'AIXM systems (AIS databases, eAIP tools): data/*_AIXM-5.1.1.xml; data/*_identifiers.csv maps each AMXM idnumber to its AIXM UUID.',
      'ARINC 816 (embedded avionics format): ARINC 816 is a specification sold by SAE; its features and attributes come from ED-99 / DO-272. This package does not contain ARINC 816 files. An ARINC 816 compiler can take the AMXM 2.0 file (or the GeoPackage) as its source: guides/feature_catalogue_mapping.csv lists each feature type with its ED-99 feature name, feattype code, geometry and AIXM correspondence. Typical inputs of such tools: the AMXM features, the metadata (accuracy, resolution, integrity per feature), the aerodrome reference point, the effective date (AIRAC), the tiling extent and a CRC per file.',
      'Integrity: SHA256SUMS.txt (sha256sum -c SHA256SUMS.txt) and PACKAGE.json (SHA-256 and CRC32Q of every file).' + (W.plain ? '' : ' Drop the zip on the Files page of the AIXM Code Converter to open and verify it.'), ''].join('\n');
  }
  function readme(list, W) {
    var lines = [];
    if (!W.plain) lines.push('NOT FOR NAVIGATION. FOR STUDY AND ANALYSIS PURPOSES ONLY.', '', 'This aerodrome mapping package was produced with the AIXM Code Converter, created by Prasad Selvaraj.', 'It is not a certified aeronautical data product: not produced under EUROCAE ED-76A / RTCA DO-200B, not issued by an EASA Part-DAT or State AIS provider. Do not load it into aircraft systems or use it for flight planning, navigation, aerodrome operations or any safety-related purpose. Provided "as is", without warranty; the author and contributors accept no liability for any use of it (Apache License 2.0, sections 7 and 8).', '');
    lines.push('Aerodromes: ' + W.ads.join(', '), 'Features: ' + list.length, 'Package: ' + W.pid, 'Created: ' + W.now.toISOString().slice(0, 19) + 'Z', '');
    lines.push('Sources (they keep their own copyright and licences, and the attributions they require):');
    W.srcs.forEach(function (s) { lines.push(' - ' + s.ds.name + ' (' + s.set.kind + '): originator ' + (s.info.orig || 'not stated') + '; licence ' + (s.info.lic || 'not stated') + '; ' + s.info.method + '; quality ' + s.info.q); });
    // OpenStreetMap: its attribution and share-alike stay with the data, whatever the branding
    if (W.srcs.some(function (x) { return x.info.osm; })) lines.push('', 'OpenStreetMap: this package contains data from OpenStreetMap, © OpenStreetMap contributors, available under the Open Database Licence 1.0 (https://opendatacommons.org/licenses/odbl/1-0/). Each feature from OpenStreetMap names its way or node. The package, and any database made from it, must be shared under the ODbL (share-alike).');
    lines.push('', 'Folders:', ' data/      AMXM 2.0 XML (ISO 19115 metadata inside), AIXM 5.1.1 XML, identifier map', ' gis/       GeoPackage, GeoJSON, KML, Shapefile', ' tables/    CSV and Excel', ' cad/       DXF (WGS 84 / UTM metres)', ' metadata/  ISO 19115 metadata, data product specification', ' reports/   package report (what is inside, how it was made, sources, checks), check results', ' guides/    how to use the package (GIS, ArcGIS, CAD, AIXM, ARINC 816), feature catalogue mapping', '', 'Checksums: SHA256SUMS.txt and PACKAGE.json.', '');
    if (!W.plain) lines.push('AMXM is a schema of RTCA and EUROCAE, used under its licence; RTCA and EUROCAE do not endorse this product. Not affiliated with EUROCONTROL, the FAA, ICAO, EASA, RTCA, EUROCAE or SAE / ARINC.', '');
    return lines.join('\n');
  }
  function manifest(list, W, files) {
    var o = { format: 'aerodrome-mapping-package', version: 1, package: W.pid, created: W.now.toISOString(), aerodromes: W.ads, features: list.length, scope: SET.mode, branding: W.plain ? 'for further processing' : 'standard',
      sources: W.srcs.map(function (s) { return { dataset: s.ds.name, kind: s.set.kind, originator: s.info.orig, licence: s.info.lic, date: s.info.date, method: s.info.method, quality: s.info.q, rightOfUseConfirmed: !!s.info.rights }; }),
      checks: { rules: AMDB.RULES_VERSION, result: W.checks.bySev, engine: W.checks.engine }, codingFixed: W.fix, files: files };
    if (!W.plain) { o.notice = 'NOT FOR NAVIGATION — for study and analysis only'; o.producer = { tool: APP_INFO.name, version: APP_INFO.version, author: APP_INFO.author, role: 'processor' }; }
    return o;
  }
  function handoverRecord(list, W, files) {
    return ['HANDOVER RECORD — AERODROME MAPPING PACKAGE ' + W.tag, '',
      'Package: ' + W.pid, 'Handed over: ' + W.now.toISOString().slice(0, 19) + 'Z', 'To: ' + (SET.who || '(not stated)'), 'Made with: ' + APP_INFO.name + ' ' + APP_INFO.version + ' (created by ' + APP_INFO.author + ')', '',
      'Status at handover: FOR STUDY AND ANALYSIS ONLY — NOT FOR NAVIGATION. Not a certified aeronautical data product; not produced under EUROCAE ED-76A / RTCA DO-200B; not issued by an EASA Part-DAT or State AIS provider.',
      'The package was delivered "for further processing", without the tool\'s name, credit and notice in the data. From the moment of handover the recipient took over the responsibility for these data: any further use, verification, certification or distribution is the recipient\'s, under the recipient\'s own processes. The data keep the attributions their source licences require and the quality of each feature.', '',
      'Aerodromes: ' + W.ads.join(', '), 'Features: ' + list.length, 'Checks at handover: ' + W.checks.bySev.error + ' error(s), ' + W.checks.bySev.warning + ' warning(s), ' + W.checks.bySev.info + ' note(s)', '',
      'Sources:'].concat(W.srcs.map(function (s) { return ' - ' + s.ds.name + ': originator ' + (s.info.orig || 'not stated') + '; licence ' + (s.info.lic || 'not stated') + '; ' + s.info.method + '; quality ' + s.info.q + '; right of use ' + (s.info.rights ? 'confirmed' : 'not confirmed'); }))
      .concat(['', 'Files handed over (SHA-256):']).concat(files.map(function (f) { return ' ' + f.sha256 + '  ' + f.path; })).concat(['', 'Keep this record. It is not part of the package.', '']).join('\n');
  }

  /* -------------------------------------------------------------- open a package */
  // the files of a zip dropped on the Files page ({path: bytes}): PACKAGE.json checked against them
  function verify(entries) {
    var root = Object.keys(entries).filter(function (k) { return /(^|\/)PACKAGE\.json$/.test(k); })[0];
    if (!root) return null;
    var pre = root.replace(/PACKAGE\.json$/, ''), man;
    try { man = JSON.parse(new TextDecoder().decode(entries[root])); } catch (e) { return { ok: false, error: 'PACKAGE.json is not readable', files: 0, bad: [], missing: [] }; }
    if (!man || man.format !== 'aerodrome-mapping-package') return null;
    var bad = [], missing = [];
    (man.files || []).forEach(function (f) { var b = entries[pre + f.path]; if (!b) missing.push(f.path); else if (sha256(b) !== f.sha256) bad.push(f.path); });
    return { ok: !bad.length && !missing.length, files: (man.files || []).length, bad: bad, missing: missing, manifest: man };
  }

  /* --------------------------------------------------------- read a GeoPackage */
  // GeoPackage tables named after AMXM feature types (optionally _point / _line / _area), as written by Build
  // package or any GIS following the same names -> an AMXM 2.0 document for the normal reader
  function wkbGeoms(b) {
    var d = new DataView(b.buffer, b.byteOffset, b.byteLength), o = 0, out = [];
    if (b[0] === 0x47 && b[1] === 0x50) { var env = (b[3] >> 1) & 7; o = 8 + [0, 32, 48, 48, 64][env] || 8; }
    (function geom() {
      var le = b[o] === 1; o += 1;
      var t = d.getUint32(o, le) % 1000; o += 4; // ISO WKB Z / M codes folded
      var dims = (d.getUint32(o - 4, le) > 1000 ? (d.getUint32(o - 4, le) >= 3000 ? 4 : 3) : 2);
      function pt() { var c = [d.getFloat64(o, le), d.getFloat64(o + 8, le)]; o += 8 * dims; return c; }
      function pts() { var n = d.getUint32(o, le), r = []; o += 4; for (var i = 0; i < n; i++) r.push(pt()); return r; }
      if (t === 1) out.push({ t: 'P', c: pt() });
      else if (t === 2) out.push({ t: 'L', c: pts() });
      else if (t === 3) { var n = d.getUint32(o, le), rings = []; o += 4; for (var i = 0; i < n; i++) rings.push(pts()); out.push({ t: 'A', c: rings }); }
      else if (t >= 4 && t <= 7) { var k = d.getUint32(o, le); o += 4; for (var j = 0; j < k; j++) geom(); }
    })();
    return out;
  }
  // plain features ({t, a, g, ad, id …}) -> an AMXM 2.0 document (schema-valid; no metadata), with a comment
  function writeAmxm(list, comment) {
    var W = { plain: true, now: new Date(), pid: uuid(), dict: M.amxmDict(), srcs: [], tag: '', ads: [], fix: { closed: 0, oriented: 0, dup: 0, unknown: 0, invalid: [], placeholder: [] } };
    list = list.map(function (f, i) { return Object.assign({ i: i, src: 'AMXM', keys: [], label: '', ref: [0, 0] }, f, { w: f.g.map(function (x) { return cleanGeom(x, W.fix); }), uid: uidOf(Object.assign({ i: i }, f)) }); });
    return amxmXml(list, W, '').replace('\n  <amxm:metadata></amxm:metadata>', '').replace('<?xml version="1.0" encoding="UTF-8"?>\n', '<?xml version="1.0" encoding="UTF-8"?>\n<!-- ' + xe(comment || '').replace(/--/g, '- -') + ' -->\n');
  }
  async function gpkgToAmxm(bytes, name) {
    var SQL = await sql(), db = new SQL.Database(bytes), D = M.amxmDict(), byName = {};
    Object.keys(D.features).forEach(function (t) { byName[t.toLowerCase()] = t; });
    try {
      var tabs = db.exec("SELECT c.table_name, g.column_name FROM gpkg_contents c JOIN gpkg_geometry_columns g ON g.table_name = c.table_name WHERE c.data_type = 'features'");
      var list = [], skipped = 0, used = 0;
      (tabs[0] ? tabs[0].values : []).forEach(function (row) {
        var tn = row[0], gc = row[1], t = byName[String(tn).replace(/_(point|line|area|polygon|pnt)$/i, '').toLowerCase()];
        var res = db.exec('SELECT * FROM "' + String(tn).replace(/"/g, '') + '"');
        if (!res[0]) return;
        var cols = res[0].columns;
        if (!t && cols.indexOf('amxm_type') < 0) { skipped++; return; }
        used++;
        res[0].values.forEach(function (v) {
          var a = {}, g = null, ft = t;
          cols.forEach(function (c, i) {
            if (c === gc) { if (v[i]) g = wkbGeoms(v[i]); return; }
            if (c === 'amxm_type' && v[i] && byName[String(v[i]).toLowerCase()]) ft = byName[String(v[i]).toLowerCase()];
            if (v[i] !== null && v[i] !== undefined && v[i] !== '') a[c] = { v: String(v[i]).replace(/^(-?[\d.]+(?:[eE][-+]?\d+)?) [A-Za-z%]+$/, '$1') }; // "0.0000001 deg" -> number
          });
          if (!ft || !g || !g.length) return;
          if (a.aerodrome && !a.idarpt) a.idarpt = a.aerodrome;
          list.push({ i: list.length, t: ft, src: 'AMXM', ad: (a.idarpt && a.idarpt.v) || '', a: a, g: g, keys: Object.keys(a), label: '', ref: [0, 0], id: (a.aixm_uuid && a.aixm_uuid.v) || (a.idnumber && a.idnumber.v) || '' });
        });
      });
      db.close();
      if (!list.length) return { features: 0, tables: used, skipped: skipped };
      return { xml: writeAmxm(list, 'Read from the GeoPackage ' + name), features: list.length, tables: used, skipped: skipped };
    } catch (e) { try { db.close(); } catch (x) { /* closed */ } throw e; }
  }

  function render(tab, host, ctx, api) {
    API = api;
    if (tab === 'sources') sourcesView(host, ctx); else packageView(host, ctx);
  }
  function setApi(api) { API = api; }
  return { render: render, make: make, verify: verify, sha256: sha256, utm: utm, settings: SET, setApi: setApi, gpkgToAmxm: gpkgToAmxm, writeAmxm: writeAmxm, uuid: uuid };
})();
