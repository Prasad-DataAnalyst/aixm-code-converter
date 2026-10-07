/*!
 * AIXM Code Converter
 * Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com> - author of the AIXM Code Converter
 * SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE; keep this notice in all copies)
 * ==========================================================================
 * AIXM Code Converter - more aerodrome mapping tools (AMDBX)
 * NOT FOR NAVIGATION - for study and analysis only.
 *   Generate from AIP   aerodromes of an AIXM data set without aerodrome mapping features: runway elements from the
 *                       runway ends (or a threshold, the bearing and the length) and the width, thresholds with
 *                       their elevation and declared distances, stopways from ASDA - TORA, the reference point and
 *                       the stands. The geometry is derived, not surveyed: every feature says so in its source, the
 *                       accuracy is left unknown and the package records the quality as coarse.
 *   Import              GeoJSON, CSV with WKT and DXF layers named after AMXM feature types become AMXM (as the
 *                       package's own GIS, table and CAD files do), read by the normal AMXM reader.
 *   Compare             two aerodrome mapping data sets (two cycles, two suppliers, AIXM against AMXM): features added,
 *                       removed, moved (with the distance) and changed (with the attributes); a report and an AMXM
 *                       change file (permanent changes, interp 3).
 * Loaded only when one of these tools is used (src/lazy.js).
 * ========================================================================== */
/* global MODEL, AMDB, AMDBPKG, LAZY, DDMAP, EXPORTS, APP_INFO */
var AMDBX = (function () {
  'use strict';
  var M = MODEL, s = M.s, D2R = Math.PI / 180;
  function esc(t) { return String(t === undefined || t === null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(n) { return Number(n || 0).toLocaleString('en-US'); }
  function arr(v) { return v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]; }
  function meters(x) { x = arr(x)[0]; if (!x || x.v === undefined) return null; var n = parseFloat(x.v); if (isNaN(n)) return null; var u = String(x.u || '').toUpperCase(); return u === 'FT' ? n * 0.3048 : u === 'KM' ? n * 1000 : u === 'NM' ? n * 1852 : n; }
  function r2(n) { return String(Math.round(n * 100) / 100); }

  /* ------------------------------------------------------- generate from AIP */
  var MAPPING = ['RunwayElement', 'TaxiwayElement', 'ApronElement', 'GuidanceLine', 'TaxiHoldingPosition'];
  function cpoints(ds, dir) {
    return (ds.rev.get(dir) || []).filter(function (x) { return x[1].k === 'RunwayCentrelinePoint' && !x[1].cur.gone; }).map(function (x) {
      var c = x[1], p = c.cur.p, loc = arr(p.location)[0], dd = {};
      arr(p.associatedDeclaredDistance).forEach(function (d) { var t = s(d && d.type), v = d && meters((arr(d.declaredValue)[0] || {}).distance); if (t && v !== null) dd[t] = v; });
      return { rec: c, role: s(p.role), c: M.pointOf(ds, c), elev: loc && loc.elevation ? meters(loc.elevation) : null, dd: dd };
    });
  }
  // the aerodromes of the AIXM data loaded, with what generation can use
  function candidates(datasets) {
    var out = [];
    datasets.forEach(function (ds, di) {
      if (ds.family === 'amxm' || ds.family === 'tab' || !ds.byType) return;
      (ds.byType.AirportHeliport || []).forEach(function (ad) {
        if (ad.cur.gone) return;
        var code = s(ad.cur.p.locationIndicatorICAO) || s(ad.cur.p.designator);
        var rwys = (ds.byType.Runway || []).filter(function (r) { return !r.cur.gone && (M.target(ds, r.cur.p.associatedAirportHeliport) === ad || ds.owner.get(r) === ad); }).map(function (r) {
          var dirs = (ds.rev.get(r) || []).filter(function (x) { return x[1].k === 'RunwayDirection' && !x[1].cur.gone; }).map(function (x) { var d = x[1]; return { rec: d, des: s(d.cur.p.designator), brg: parseFloat(s(d.cur.p.trueBearing)), pts: cpoints(ds, d) }; });
          return { rec: r, des: s(r.cur.p.designator), type: s(r.cur.p.type) || 'RWY', len: meters(r.cur.p.nominalLength), wid: meters(r.cur.p.nominalWidth), dirs: dirs };
        });
        var stands = (ds.byType.AircraftStand || []).filter(function (x) { return !x.cur.gone && ds.owner.get(x) === ad && M.pointOf(ds, x); });
        var mapped = MAPPING.reduce(function (n, k) { return n + (ds.byType[k] || []).filter(function (x) { return ds.owner.get(x) === ad; }).length; }, 0);
        var amxm = datasets.some(function (d) { return d.family === 'amxm' && d.recs.some(function (x) { return x.cur && x.cur.p && x.cur.p._amxm && s(x.cur.p.idarpt) === code; }); });
        out.push({ ds: ds, di: di, ad: ad, code: code, name: s(ad.cur.p.name), arp: M.pointOf(ds, ad), rwys: rwys, stands: stands, mapped: mapped, amxm: amxm,
          thr: rwys.reduce(function (n, r) { return n + r.dirs.filter(function (d) { return d.pts.some(function (p) { return /THR/.test(p.role) && p.c; }); }).length; }, 0) });
      });
    });
    return out;
  }
  function plane(c) { return AMDB.plane(c[0], c[1]); }
  function rect(a, b, w) { // lon/lat a -> b, width w (m): a counter-clockwise rectangle
    var P = plane(a), A = P.fwd(a), B = P.fwd(b), dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy);
    if (L < 1) return null;
    var nx = -dy / L * w / 2, ny = dx / L * w / 2;
    return [[A[0] - nx, A[1] - ny], [B[0] - nx, B[1] - ny], [B[0] + nx, B[1] + ny], [A[0] + nx, A[1] + ny], [A[0] - nx, A[1] - ny]].map(P.inv);
  }
  function along(a, brg, dist) { var P = plane(a); return P.inv([Math.sin(brg * D2R) * dist, Math.cos(brg * D2R) * dist]); }
  function bearing(a, b) { var P = plane(a), B = P.fwd(b); return (Math.atan2(B[0], B[1]) / D2R + 360) % 360; }
  // aerodrome mapping features made from the AIP data of the aerodromes chosen
  function generate(list) {
    var feats = [], notes = [];
    list.forEach(function (c) {
      var src = 'Generated from AIP data (' + c.ds.name + '): geometry derived, coarse quality';
      function base(t, key) { return { t: t, ad: c.code, id: 'amdb-gen-' + c.code + '-' + key, a: { idarpt: { v: c.code }, source: { v: src } } }; }
      if (c.arp) { var f0 = base('AerodromeReferencePoint', 'arp'); f0.g = [{ t: 'P', c: c.arp }]; if (c.name) f0.a.name = { v: c.name.slice(0, 254) }; var el = meters(c.ad.cur.p.fieldElevation); if (el !== null) f0.a.elev = { v: r2(el), u: 'M' }; if (s(c.ad.cur.p.designatorIATA)) f0.a.iata = { v: s(c.ad.cur.p.designatorIATA) }; feats.push(f0); }
      c.rwys.forEach(function (r) {
        if (r.type !== 'RWY') { notes.push(c.code + ' ' + r.des + ': ' + r.type + ' (helicopter) not generated'); return; }
        var d1 = r.dirs[0], d2 = r.dirs[1];
        function pt(d, re) { var x = d && d.pts.filter(function (p) { return re.test(p.role) && p.c; })[0]; return x ? x.c : null; }
        var e1 = pt(d1, /^START/) || pt(d1, /^THR$/) || pt(d2, /^END$/), e2 = pt(d2, /^START/) || pt(d2, /^THR$/) || pt(d1, /^END$/);
        if (e1 && !e2 && d1 && !isNaN(d1.brg) && r.len) e2 = along(e1, d1.brg, r.len);
        if (e2 && !e1 && d2 && !isNaN(d2.brg) && r.len) e1 = along(e2, d2.brg, r.len);
        var idrwy = r.des.split(/[/.]/).map(function (x) { return x.trim(); }).sort(function (a, b) { return parseInt(a, 10) - parseInt(b, 10); }).join('.');
        if (e1 && e2 && r.wid) {
          var f = base('RunwayElement', 'rwy-' + idrwy); f.g = [{ t: 'A', c: [rect(e1, e2, r.wid)] }]; f.a.idrwy = { v: idrwy }; f.a.width = { v: r2(r.wid), u: 'M' }; f.a.length = { v: r2(r.len || 0), u: 'M' }; f.label = idrwy; feats.push(f);
          // stopway: ASDA - TORA beyond the far end, at the runway width
          [[d1, e1, e2], [d2, e2, e1]].forEach(function (x) {
            var d = x[0]; if (!d) return;
            var dd = d.pts.reduce(function (o, p) { Object.keys(p.dd).forEach(function (k) { o[k] = p.dd[k]; }); return o; }, {});
            if (dd.ASDA && dd.TORA && dd.ASDA - dd.TORA > 1) {
              var far = x[2], end = along(far, bearing(x[1], x[2]), dd.ASDA - dd.TORA), sw = base('Stopway', 'swy-' + d.des);
              sw.g = [{ t: 'A', c: [rect(far, end, r.wid)] }]; sw.a.idrwy = { v: idrwy }; sw.label = d.des; feats.push(sw);
            }
          });
        } else notes.push(c.code + ' ' + r.des + ': runway element not generated (' + (!r.wid ? 'no width' : 'no runway ends, or no threshold with bearing and length') + ')');
        r.dirs.forEach(function (d) {
          var th = d.pts.filter(function (p) { return /THR$/.test(p.role) && p.c; })[0];
          if (!th) return;
          var dd = d.pts.reduce(function (o, p) { Object.keys(p.dd).forEach(function (k) { o[k] = p.dd[k]; }); return o; }, {});
          var t = base('RunwayThreshold', 'thr-' + d.des); t.g = [{ t: 'P', c: th.c }]; t.label = d.des;
          t.a.idthr = { v: d.des }; t.a.thrtype = { v: th.role === 'DISTHR' ? '1' : '0' };
          if (th.elev !== null) t.a.elev = { v: r2(th.elev), u: 'M' };
          if (!isNaN(d.brg)) t.a.brngtrue = { v: r2(d.brg) };
          ['TORA', 'TODA', 'ASDA', 'LDA'].forEach(function (k) { if (dd[k] !== undefined) t.a[k.toLowerCase()] = { v: r2(dd[k]), u: 'M' }; });
          feats.push(t);
        });
      });
      c.stands.forEach(function (x) { var f = base('ParkingStandLocation', 'std-' + (s(x.cur.p.designator) || x.id)); f.g = [{ t: 'P', c: M.pointOf(c.ds, x) }]; if (s(x.cur.p.designator)) f.a.idstd = { v: s(x.cur.p.designator) }; f.label = s(x.cur.p.designator); feats.push(f); });
    });
    return { features: feats, notes: notes };
  }

  /* ------------------------------------------------------------------ import */
  var TYPES = null;
  function typeOf(name) {
    if (!TYPES) { TYPES = {}; Object.keys(M.amxmDict().features).forEach(function (t) { TYPES[t.toLowerCase()] = t; }); }
    return TYPES[String(name || '').replace(/_(point|line|area|polygon|pnt)$/i, '').replace(/[\s_-]/g, '').toLowerCase()] || null;
  }
  function attrsFrom(o) {
    var a = {};
    Object.keys(o || {}).forEach(function (k) { var v = o[k]; if (v === null || v === undefined || v === '' || typeof v === 'object') return; a[k] = { v: String(v).replace(/^(-?[\d.]+(?:[eE][-+]?\d+)?) [A-Za-z%]+$/, '$1') }; });
    if (a.aerodrome && !a.idarpt) a.idarpt = a.aerodrome;
    return a;
  }
  function feature(t, props, g, name) {
    var a = attrsFrom(props);
    return { t: t, a: a, g: g, ad: (a.idarpt && a.idarpt.v) || '', id: (a.aixm_uuid && a.aixm_uuid.v) || (a.idnumber && a.idnumber.v) || '', label: '', src: 'AMXM', name: name };
  }
  function gjGeoms(g) {
    if (!g) return [];
    switch (g.type) {
      case 'Point': return [{ t: 'P', c: g.coordinates.slice(0, 2) }];
      case 'LineString': return [{ t: 'L', c: g.coordinates.map(function (p) { return p.slice(0, 2); }) }];
      case 'Polygon': return [{ t: 'A', c: g.coordinates.map(function (r) { return r.map(function (p) { return p.slice(0, 2); }); }) }];
      case 'MultiPoint': case 'MultiLineString': case 'MultiPolygon': return g.coordinates.reduce(function (o, c) { return o.concat(gjGeoms({ type: g.type.slice(5), coordinates: c })); }, []);
      case 'GeometryCollection': return g.geometries.reduce(function (o, x) { return o.concat(gjGeoms(x)); }, []);
      default: return [];
    }
  }
  function fromGeoJSON(text, name) {
    var j = JSON.parse(text), feats = [], skipped = 0;
    if (j.crs && j.crs.properties && !/4326|CRS84/i.test(JSON.stringify(j.crs))) throw new Error('the GeoJSON is not in WGS 84 (' + JSON.stringify(j.crs.properties).slice(0, 60) + ')');
    var fileType = typeOf(String(name).replace(/\.[^.]+$/, '').split(/[_ ]/).pop());
    (j.type === 'FeatureCollection' ? j.features : j.type === 'Feature' ? [j] : []).forEach(function (f) {
      var p = f.properties || {}, t = typeOf(p.amxm_type) || typeOf(p.feature_type) || typeOf(p.layer) || typeOf(p.type) || fileType, g = gjGeoms(f.geometry);
      if (!t || !g.length) { skipped++; return; }
      feats.push(feature(t, p, g, name));
    });
    return { features: feats, skipped: skipped };
  }
  function parseWkt(w) {
    w = String(w || '').trim();
    var m = /^(POINT|LINESTRING|POLYGON)\s*(Z|M|ZM)?\s*\(([\s\S]*)\)$/i.exec(w);
    if (!m) return null;
    function pts(t) { return t.split(',').map(function (p) { var n = p.trim().split(/\s+/).map(Number); return [n[0], n[1]]; }); }
    var k = m[1].toUpperCase(), body = m[3];
    if (k === 'POINT') return { t: 'P', c: pts(body)[0] };
    if (k === 'LINESTRING') return { t: 'L', c: pts(body) };
    return { t: 'A', c: body.split(/\)\s*,\s*\(/).map(function (r) { return pts(r.replace(/[()]/g, '')); }) };
  }
  function csvRows(text) {
    var rows = [], row = [], cur = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; continue; }
      if (ch === '"') q = true; else if (ch === ',') { row.push(cur); cur = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; } else cur += ch;
    }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(function (r) { return r.length > 1 || r[0]; });
  }
  // a CSV table with an amxm_type (or a type in the file name) and a WKT geometry column, e.g. the package's tables
  function isCsv(text) { var h = text.split(/\r?\n/).filter(function (l) { return l && l.charAt(0) !== '#'; })[0] || ''; return /(^|,)"?wkt"?(,|$)/i.test(h) && /(^|,)"?(amxm_type|feature_type)"?(,|$)/i.test(h); }
  function fromCsv(text, name) {
    var rows = csvRows(text.split(/\r?\n/).filter(function (l) { return l.charAt(0) !== '#'; }).join('\n')), head = rows.shift().map(function (h) { return h.trim(); }), feats = [], skipped = 0;
    var iw = head.findIndex(function (h) { return /^wkt$/i.test(h); }), it = head.findIndex(function (h) { return /^(amxm_type|feature_type)$/i.test(h); });
    rows.forEach(function (r) {
      var t = typeOf(r[it]), g = parseWkt(r[iw]);
      if (!t || !g) { skipped++; return; }
      var p = {}; head.forEach(function (h, i) { if (i !== iw && i !== it) p[h] = r[i]; });
      feats.push(feature(t, p, [g], name));
    });
    return { features: feats, skipped: skipped };
  }
  // WGS 84 / UTM -> latitude, longitude (Krüger series, inverse)
  function utmInv(E, N, zone, south) {
    var a = 6378137, f = 1 / 298.257223563, k0 = 0.9996, n = f / (2 - f), A1 = a / (1 + n) * (1 + n * n / 4 + n * n * n * n / 64);
    var be = [n / 2 - 2 * n * n / 3 + 37 * n * n * n / 96, n * n / 48 + n * n * n / 15, 17 * n * n * n / 480];
    var de = [2 * n - 2 * n * n / 3 - 2 * n * n * n, 7 * n * n / 3 - 8 * n * n * n / 5, 56 * n * n * n / 15];
    var xi = (N - (south ? 10000000 : 0)) / (k0 * A1), eta = (E - 500000) / (k0 * A1), X = xi, Y = eta;
    for (var j = 1; j <= 3; j++) { X -= be[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta); Y -= be[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta); }
    var chi = Math.asin(Math.sin(X) / Math.cosh(Y)), lat = chi;
    for (j = 1; j <= 3; j++) lat += de[j - 1] * Math.sin(2 * j * chi);
    return [((zone - 1) * 6 - 180 + 3) + Math.atan2(Math.sinh(Y), Math.cos(X)) / D2R, lat / D2R];
  }
  // DXF: POINT, LINE, LWPOLYLINE, POLYLINE / VERTEX on layers named after AMXM feature types, in WGS 84 / UTM (zone
  // from the file name "..._UTM25N.dxf" or the comment written by the package) or in degrees
  function fromDxf(text, name) {
    var L = text.split(/\r?\n/), pairs = [];
    for (var i = 0; i + 1 < L.length; i += 2) pairs.push([parseInt(L[i], 10), L[i + 1].trim()]);
    var zm = /UTM\s*(?:zone\s*)?(\d{1,2})\s*([NS])/i.exec(name) || /UTM zone (\d{1,2})([NS])/i.exec(text.slice(0, 2000));
    var zone = zm ? +zm[1] : 0, south = zm ? /S/i.test(zm[2]) : false;
    function ll(x, y) { return zone ? utmInv(x, y, zone, south) : [x, y]; }
    var ents = [], cur = null, inEnt = false;
    pairs.forEach(function (p) {
      var c = p[0], v = p[1];
      if (c === 2 && v === 'ENTITIES') inEnt = true;
      if (!inEnt) return;
      if (c === 0) { if (cur) ents.push(cur); cur = { k: v, layer: '', pts: [], flag: 0 }; if (v === 'ENDSEC') { inEnt = false; cur = null; } return; }
      if (!cur) return;
      if (c === 8) cur.layer = v; else if (c === 70) cur.flag = +v; else if (c === 10 || c === 11) cur.pts.push([+v, null]); else if ((c === 20 || c === 21) && cur.pts.length) cur.pts[cur.pts.length - 1][1] = +v;
    });
    if (cur) ents.push(cur);
    // POLYLINE ... VERTEX ... SEQEND -> one entity
    var merged = [], poly = null;
    ents.forEach(function (e) {
      if (e.k === 'POLYLINE') { poly = { k: 'POLYLINE', layer: e.layer, flag: e.flag, pts: [] }; return; }
      if (e.k === 'VERTEX' && poly) { poly.pts = poly.pts.concat(e.pts); return; }
      if (e.k === 'SEQEND' && poly) { merged.push(poly); poly = null; return; }
      merged.push(e);
    });
    var feats = [], skipped = 0;
    merged.forEach(function (e) {
      var t = typeOf(e.layer), pts = e.pts.filter(function (p) { return p[1] !== null; }).map(function (p) { return ll(p[0], p[1]); });
      if (!t || !pts.length || (!zone && pts.some(function (p) { return Math.abs(p[0]) > 180 || Math.abs(p[1]) > 90; }))) { skipped++; return; }
      var closed = (e.flag & 1) === 1, def = M.amxmDict().features[t], want = def.attrs.some(function (a) { return a.n === 'geopoly'; }) ? 'A' : def.attrs.some(function (a) { return a.n === 'geoline'; }) ? 'L' : 'P';
      var g = e.k === 'POINT' || pts.length === 1 ? { t: 'P', c: pts[0] } : want === 'A' || closed ? { t: 'A', c: [pts.concat([pts[0]])] } : { t: 'L', c: pts };
      feats.push(feature(t, { idarpt: (/^([A-Z]{4})_/.exec(String(name)) || [])[1] }, [g], name));
    });
    if (!zone && feats.length && feats.every(function (f) { return f.g[0].t === 'P' && Math.abs(f.g[0].c[0]) <= 180; })) { /* degrees */ }
    return { features: feats, skipped: skipped, zone: zone ? zone + (south ? 'S' : 'N') : 'degrees' };
  }
  // a file dropped on Files -> AMXM text, or null when it is not aerodrome mapping
  async function importFile(file) {
    var text = await file.text(), res = null;
    if (/\.(geo)?json$/i.test(file.name)) { try { res = fromGeoJSON(text, file.name); } catch (e) { if (/\.geojson$/i.test(file.name)) throw e; return null; } }
    else if (/\.csv$/i.test(file.name)) { if (!isCsv(text)) return null; res = fromCsv(text, file.name); }
    else if (/\.dxf$/i.test(file.name)) res = fromDxf(text, file.name);
    if (!res || !res.features.length) return res ? { xml: null, features: 0, skipped: res.skipped } : null;
    await LAZY.run('src-amdbpkg');
    return { xml: AMDBPKG.writeAmxm(res.features, 'Read from ' + file.name + (res.zone ? ' (' + (res.zone === 'degrees' ? 'coordinates in degrees' : 'WGS 84 / UTM ' + res.zone) + ')' : '')), features: res.features.length, skipped: res.skipped };
  }

  /* ----------------------------------------------------------------- compare */
  function centroid(g) {
    var pts = g.t === 'P' ? [g.c] : g.t === 'L' ? g.c : g.c[0], x = 0, y = 0;
    pts.forEach(function (p) { x += p[0]; y += p[1]; });
    return [x / pts.length, y / pts.length];
  }
  function vertices(f) { var out = []; f.g.forEach(function (g) { (g.t === 'P' ? [g.c] : g.t === 'L' ? g.c : g.c.reduce(function (o, r) { return o.concat(r); }, [])).forEach(function (p) { out.push(p); }); }); return out; }
  // largest distance (m) from a vertex of one feature to the nearest vertex of the other, both ways
  function shift(a, b) {
    var va = vertices(a), vb = vertices(b);
    if (!va.length || !vb.length) return null;
    var P = AMDB.plane(va[0][0], va[0][1]), A = va.map(P.fwd), B = vb.map(P.fwd);
    function one(X, Y) { var m = 0; X.forEach(function (p) { var d = Infinity; Y.forEach(function (q) { var e = Math.hypot(p[0] - q[0], p[1] - q[1]); if (e < d) d = e; }); if (d > m) m = d; }); return m; }
    return Math.max(one(A, B), one(B, A));
  }
  var SKIP_ATTR = { source: 1, revdate: 1, idnumber: 1, stfeat: 1, stvalid: 1, endvalid: 1, interp: 1, feattype: 1 };
  function attrDiff(a, b) {
    var keys = {}, out = [];
    Object.keys(a.a).concat(Object.keys(b.a)).forEach(function (k) { if (!SKIP_ATTR[k]) keys[k] = 1; });
    Object.keys(keys).sort().forEach(function (k) {
      var x = a.a[k], y = b.a[k], vx = x ? (x.nil ? '(' + x.nil + ')' : x.geo ? 'geo' : x.v) : '', vy = y ? (y.nil ? '(' + y.nil + ')' : y.geo ? 'geo' : y.v) : '';
      if (vx === 'geo' || vy === 'geo') return;
      var nx = parseFloat(vx), ny = parseFloat(vy);
      if (vx !== vy && !(!isNaN(nx) && !isNaN(ny) && Math.abs(nx - ny) < 1e-9 && /^[-\d.eE+]+$/.test(vx) && /^[-\d.eE+]+$/.test(vy))) out.push(k + ': ' + (vx || '—') + ' → ' + (vy || '—'));
    });
    return out;
  }
  function keyOf(f) { var idn = f.src === 'AMXM' && f.a.idnumber && f.a.idnumber.v; return f.t + '|' + (idn || f.id || ''); }
  // features of A (older) and B (newer) -> rows {st: added | removed | moved | changed | same, a, b, shift, attrs}
  function compare(A, B, tol) {
    tol = tol || 0.5;
    var rows = [], used = new Set(), byKey = {};
    B.forEach(function (f, i) { (byKey[keyOf(f)] || (byKey[keyOf(f)] = [])).push(i); });
    var pending = [];
    A.forEach(function (a) { var l = (byKey[keyOf(a)] || []).filter(function (i) { return !used.has(i); }); if (l.length) { used.add(l[0]); rows.push(pair(a, B[l[0]])); } else pending.push(a); });
    // no common identifier (other supplier, AIXM against AMXM): same type and aerodrome, same label or nearest within 50 m
    pending.forEach(function (a) {
      var ca = a.g[0] && centroid(a.g[0]), best = -1, bd = Infinity;
      B.forEach(function (b, i) {
        if (used.has(i) || b.t !== a.t || (b.ad || '') !== (a.ad || '') || !b.g[0] || !ca) return;
        var cb = centroid(b.g[0]), P = AMDB.plane(ca[0], ca[1]), q = P.fwd(cb), d = Math.hypot(q[0], q[1]) - (a.label && b.label && a.label === b.label ? 1e6 : 0);
        if (d < bd) { bd = d; best = i; }
      });
      if (best >= 0 && (bd < 50 || bd < -1e5)) { used.add(best); rows.push(pair(a, B[best])); } else rows.push({ st: 'removed', a: a, b: null, shift: null, attrs: [] });
    });
    B.forEach(function (b, i) { if (!used.has(i)) rows.push({ st: 'added', a: null, b: b, shift: null, attrs: [] }); });
    function pair(a, b) { var sh = shift(a, b), at = attrDiff(a, b), mv = sh !== null && sh > tol; return { st: mv && at.length ? 'moved+changed' : mv ? 'moved' : at.length ? 'changed' : 'same', a: a, b: b, shift: sh, attrs: at }; }
    var n = { added: 0, removed: 0, moved: 0, changed: 0, same: 0 };
    rows.forEach(function (r) { if (r.st === 'moved+changed') { n.moved++; n.changed++; } else n[r.st]++; });
    return { rows: rows, n: n, tol: tol };
  }
  // the changes as AMXM permanent changes (interp 3): added and changed features as in B, removed ones ended (endfeat)
  function changeFile(res, nameA, nameB) {
    var day = new Date().toISOString().slice(0, 19) + 'Z', list = [];
    res.rows.forEach(function (r) {
      if (r.st === 'same') return;
      var f = r.b || r.a, a = Object.assign({}, f.a, { interp: { v: '3' } });
      if (r.st === 'removed') a.endfeat = { v: day };
      list.push(Object.assign({}, f, { a: a, keys: [] }));
    });
    return AMDBPKG.writeAmxm(list, 'Changes from ' + nameA + ' to ' + nameB + ' (' + res.n.added + ' added, ' + res.n.removed + ' removed, ' + res.n.moved + ' moved, ' + res.n.changed + ' changed); permanent changes (interp 3)');
  }

  /* --------------------------------------------------------------------- UI */
  var NOTICE = 'NOT FOR NAVIGATION — for study and analysis only.';
  var G = { pick: null, ack: false, out: '' }, CMP = { a: -1, b: -1, ad: '', tol: 0.5, res: null, filter: '' };
  function genView(host, ctx) {
    var list = candidates(ctx.datasets);
    if (!G.pick) { G.pick = {}; list.forEach(function (c, i) { if (!c.mapped && !c.amxm && c.rwys.length) G.pick[i] = true; }); }
    var h = '<div class="nfo-box amdb-notice" role="note">⚠ ' + NOTICE + ' Generated geometry is derived from the AIP runway data (runway ends or a threshold, bearing, length and width): <b>coarse and indicative</b>, not surveyed. Every feature says so in its source; its accuracy is left unknown.</div>';
    if (!list.length) { host.innerHTML = h + '<div class="card card-pad muted">No AIXM aerodrome in the data loaded.</div>'; return; }
    h += '<div class="card card-pad"><h3 style="margin-top:0">Generate aerodrome mapping from AIP data</h3><p class="muted">For aerodromes without aerodrome mapping data: runway elements, thresholds (elevation, declared distances), stopways, the reference point and the stands, written as an AMXM 2.0 data set and opened here — then check it, compare it and build a package like any other.</p>' +
      '<div class="tbl-wrap"><table class="mini-table"><thead><tr><th></th><th>Aerodrome</th><th>Data set</th><th class="num">Runways</th><th class="num">Thresholds with position</th><th class="num">Stands</th><th>Mapping data already</th></tr></thead><tbody>' +
      list.map(function (c, i) {
        return '<tr><td><input type="checkbox" data-gen="' + i + '"' + (G.pick[i] ? ' checked' : '') + (c.rwys.length || c.stands.length ? '' : ' disabled') + ' aria-label="Generate ' + esc(c.code) + '"></td><td><b>' + esc(c.code) + '</b> ' + esc(c.name) + '</td><td>' + esc(c.ds.name) + '</td><td class="num">' + c.rwys.length + '</td><td class="num">' + c.thr + '</td><td class="num">' + c.stands.length + '</td><td>' + (c.mapped ? num(c.mapped) + ' AIXM feature(s)' : '') + (c.amxm ? ' AMXM' : '') + (c.mapped || c.amxm ? '' : '<span class="muted">none</span>') + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<div class="amdb-ack"><label class="chk"><input type="checkbox" data-genack' + (G.ack ? ' checked' : '') + '> I understand that the generated geometry is coarse and indicative (NOT FOR NAVIGATION) and is recorded as such.</label></div>' +
      '<button class="btn primary" data-gengo' + (G.ack ? '' : ' disabled') + '>Generate and open</button> <span class="muted gen-st"></span>' + G.out + '</div>';
    host.innerHTML = h;
    host.onchange = function (e) {
      var t = e.target;
      if (t.hasAttribute('data-gen')) G.pick[+t.getAttribute('data-gen')] = t.checked;
      if (t.hasAttribute('data-genack')) { G.ack = t.checked; genView(host, ctx); }
    };
    host.onclick = async function (e) {
      if (!e.target.closest('[data-gengo]')) return;
      var chosen = list.filter(function (c, i) { return G.pick[i]; });
      if (!chosen.length) { ctx.toast('Choose an aerodrome.'); return; }
      var res = generate(chosen);
      if (!res.features.length) { ctx.toast('Nothing could be generated: ' + res.notes.join('; '), 8000); return; }
      await LAZY.run('src-amdbpkg');
      var name = (chosen.length === 1 ? chosen[0].code : chosen.length + '_aerodromes') + '_generated_from_AIP_AMXM.xml';
      var xml = AMDBPKG.writeAmxm(res.features, 'Aerodrome mapping generated from AIP data (' + chosen.map(function (c) { return c.ds.name; }).filter(function (x, i, a) { return a.indexOf(x) === i; }).join(', ') + '): geometry derived from the runway data, coarse and indicative. NOT FOR NAVIGATION.');
      G.out = '<p>✓ ' + num(res.features.length) + ' feature(s) generated for ' + esc(chosen.map(function (c) { return c.code; }).join(', ')) + ' — opened as <b>' + esc(name) + '</b>.' + (res.notes.length ? '<br><span class="muted">' + esc(res.notes.join('; ')) + '</span>' : '') + '</p>';
      G.pick = null;
      var A = window.__AIXM;
      await A.addFiles([new File([xml], name, { type: 'text/xml' })]);
      await A.extractAll();
      A.go('digital');
    };
  }
  function cmpSets(ctx) {
    var col = [];
    ctx.datasets.forEach(function (ds, di) {
      var f = AMDB.collect([ds], M).features;
      if (f.length) col.push({ di: di, ds: ds, f: f });
    });
    return col;
  }
  var STC = { added: '#2e7d32', removed: '#c62828', moved: '#ef6c00', 'moved+changed': '#ef6c00', changed: '#1d6fb8', same: '#9aa5b1' };
  function cmpView(host, ctx) {
    var sets = cmpSets(ctx);
    var h = '<div class="nfo-box amdb-notice" role="note">⚠ ' + NOTICE + '</div>';
    if (sets.length < 2) { host.innerHTML = h + '<div class="card card-pad muted">Load two aerodrome mapping data sets (AMXM, AIXM with aerodrome features, a package or a GeoPackage) — e.g. two AIRAC cycles, or the data of two suppliers — to compare them.</div>'; return; }
    if (CMP.a < 0 || !sets.some(function (x) { return x.di === CMP.a; })) CMP.a = sets[0].di;
    if (CMP.b < 0 || !sets.some(function (x) { return x.di === CMP.b; }) || CMP.b === CMP.a) CMP.b = sets.filter(function (x) { return x.di !== CMP.a; })[0].di;
    function opt(sel) { return sets.map(function (x) { return '<option value="' + x.di + '"' + (x.di === sel ? ' selected' : '') + '>' + esc(x.ds.name) + ' (' + num(x.f.length) + ')</option>'; }).join(''); }
    var ads = {}; sets.forEach(function (x) { if (x.di === CMP.a || x.di === CMP.b) x.f.forEach(function (f) { ads[f.ad || '(none)'] = 1; }); });
    h += '<div class="toolbar ov-filter"><label>Before <select class="inp" data-cmp="a">' + opt(CMP.a) + '</select></label><label>After <select class="inp" data-cmp="b">' + opt(CMP.b) + '</select></label>' +
      '<select class="inp" data-cmp="ad" aria-label="Aerodrome"><option value="">All aerodromes</option>' + Object.keys(ads).sort().map(function (a) { return '<option' + (CMP.ad === a ? ' selected' : '') + '>' + esc(a) + '</option>'; }).join('') + '</select>' +
      '<label>moved beyond <select class="inp" data-cmp="tol">' + [0.1, 0.5, 1, 5].map(function (t) { return '<option' + (CMP.tol === t ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select> m</label><button class="btn primary" data-cmpgo>Compare</button>' +
      (CMP.res ? '<span class="sp"></span><span class="btn-group">' + ['pdf:PDF', 'xlsx:Excel', 'csv:CSV', 'json:JSON', 'amxm:Change file (AMXM)'].map(function (f) { var p = f.split(':'); return '<button class="btn small" data-cmprep="' + p[0] + '">' + p[1] + '</button>'; }).join('') + '</span>' : '') + '</div>';
    var r = CMP.res;
    if (r) {
      h += '<div class="kpis ov-kpis">' + [['added', r.n.added], ['removed', r.n.removed], ['moved', r.n.moved], ['changed', r.n.changed], ['unchanged', r.n.same]].map(function (k) { return '<div class="kpi-h"><b style="color:' + STC[k[0] === 'unchanged' ? 'same' : k[0]] + '">' + num(k[1]) + '</b><span>' + k[0] + '</span></div>'; }).join('') + '</div>' +
        '<div class="toolbar"><select class="inp" data-cmp="filter" aria-label="Show"><option value="">All but unchanged</option>' + ['added', 'removed', 'moved', 'changed', 'same'].map(function (x) { return '<option value="' + x + '"' + (CMP.filter === x ? ' selected' : '') + '>' + (x === 'same' ? 'unchanged' : x) + '</option>'; }).join('') + '</select></div>' +
        '<div class="ov-map amdb-map cmp-map" role="application" aria-label="Map of the changes"></div>';
      var shown = rows();
      h += '<div class="tbl-wrap ov-tbl"><table class="mini-table cmp-tbl"><thead><tr><th>Change</th><th>Aerodrome</th><th>Feature</th><th class="num">Moved (m)</th><th>Attributes changed</th></tr></thead><tbody>' +
        shown.slice(0, 1500).map(function (x) { var f = x.b || x.a; return '<tr><td><span class="chip" style="color:' + STC[x.st] + '">' + x.st + '</span></td><td class="mono">' + esc(f.ad) + '</td><td>' + esc(f.t) + (f.label ? ' <b>' + esc(f.label) + '</b>' : '') + '</td><td class="num">' + (x.shift !== null ? x.shift.toFixed(2) : '') + '</td><td>' + esc(x.attrs.join('; ')) + '</td></tr>'; }).join('') + '</tbody></table></div>';
    }
    host.innerHTML = h;
    if (r) {
      var el = host.querySelector('.cmp-map'), mm = DDMAP.create(el, 'amdbcmp'), items = [];
      rows().slice(0, 4000).forEach(function (x) { if (x.a && x.st !== 'added') x.a.g.forEach(function (g) { items.push({ key: x, g: g, color: x.st === 'removed' ? STC.removed : '#9aa5b1', label: 'before · ' + x.a.t + ' ' + (x.a.label || '') }); }); if (x.b) x.b.g.forEach(function (g) { items.push({ key: x, g: g, color: STC[x.st], label: x.st + ' · ' + x.b.t + ' ' + (x.b.label || '') + (x.shift !== null ? ' · ' + x.shift.toFixed(2) + ' m' : '') }); }); });
      DDMAP.shapes(mm, items, { legend: [[STC.added, 'added'], [STC.removed, 'removed'], [STC.moved, 'moved (after)'], [STC.changed, 'changed'], ['#9aa5b1', 'before / unchanged']], onPick: function () {} });
      setTimeout(function () { mm.map.invalidateSize(); }, 60);
    }
    function rows() { return r.rows.filter(function (x) { return CMP.filter ? (x.st === CMP.filter || (CMP.filter !== 'same' && x.st.indexOf(CMP.filter) >= 0)) : x.st !== 'same'; }); }
    host.onchange = function (e) { var k = e.target.getAttribute('data-cmp'); if (!k) return; CMP[k] = k === 'a' || k === 'b' ? +e.target.value : k === 'tol' ? +e.target.value : e.target.value; if (k !== 'filter') CMP.res = null; cmpView(host, ctx); };
    host.onclick = async function (e) {
      if (e.target.closest('[data-cmpgo]')) {
        var A = sets.filter(function (x) { return x.di === CMP.a; })[0].f, B = sets.filter(function (x) { return x.di === CMP.b; })[0].f;
        if (CMP.ad) { A = A.filter(function (f) { return (f.ad || '(none)') === CMP.ad; }); B = B.filter(function (f) { return (f.ad || '(none)') === CMP.ad; }); }
        CMP.res = compare(A, B, CMP.tol); CMP.res.nameA = ctx.datasets[CMP.a].name; CMP.res.nameB = ctx.datasets[CMP.b].name; CMP.filter = '';
        cmpView(host, ctx); return;
      }
      var b = e.target.closest('[data-cmprep]');
      if (b) await cmpReport(b.getAttribute('data-cmprep'), CMP.res, ctx);
    };
  }
  function C(t) { return { t: t === undefined || t === null ? '' : String(t) }; }
  async function cmpReport(fmt, r, ctx) {
    var base = EXPORTS.safeName('AMDB_changes_' + (CMP.ad || 'all') + '_' + new Date().toISOString().slice(0, 10));
    var list = r.rows.filter(function (x) { return x.st !== 'same'; });
    if (fmt === 'amxm') { await LAZY.run('src-amdbpkg'); EXPORTS.download(base + '_AMXM-2.0.xml', new Blob([changeFile(r, r.nameA, r.nameB)], { type: 'text/xml' })); return; }
    if (fmt === 'json') { EXPORTS.download(base + '.json', new Blob([JSON.stringify({ notice: NOTICE, before: r.nameA, after: r.nameB, tolerance_m: r.tol, counts: r.n, changes: list.map(function (x) { var f = x.b || x.a; return { change: x.st, type: f.t, aerodrome: f.ad, label: f.label, moved_m: x.shift, attributes: x.attrs }; }) }, null, 1)], { type: 'application/json' })); return; }
    var sc = { title: 'Aerodrome mapping changes' + (CMP.ad ? ' — ' + CMP.ad : ''), sub: NOTICE, ds: null, sections: [
      { title: 'Summary', blocks: [{ kind: 'kv', rows: [['Before', r.nameA], ['After', r.nameB], ['Moved beyond', r.tol + ' m'], ['Result', r.n.added + ' added, ' + r.n.removed + ' removed, ' + r.n.moved + ' moved, ' + r.n.changed + ' changed, ' + r.n.same + ' unchanged'], ['Made with', APP_INFO.name + ' ' + APP_INFO.version + ' — created by ' + APP_INFO.author]].map(function (x) { return { label: x[0], cells: [C(x[1])] }; }) }] },
      { title: 'Changes', blocks: [{ kind: 'table', cols: ['Change', 'Aerodrome', 'Feature type', 'Feature', 'Moved (m)', 'Attributes changed'], rows: list.map(function (x) { var f = x.b || x.a; return [C(x.st), C(f.ad), C(f.t), C(f.label), C(x.shift !== null ? x.shift.toFixed(2) : ''), C(x.attrs.join('; '))]; }) }] },
      { title: 'Method', blocks: [{ kind: 'note', text: 'Features are matched by type and identifier (AMXM idnumber, AIXM UUID); without a common identifier, by type, aerodrome and label, or the nearest within 50 m. Moved: the largest distance between a vertex of one version and the nearest vertex of the other (both ways), on a local plane about the feature. Changed: any attribute other than source, revision date, identifier and validity. NOT FOR NAVIGATION.' }] }] };
    try { if (fmt === 'pdf') EXPORTS.exportPDF(sc); else if (fmt === 'xlsx') EXPORTS.exportExcel(sc); else if (fmt === 'csv') EXPORTS.exportCSV(sc); } catch (e) { ctx.toast('Report failed: ' + e.message, 6000); }
  }
  function render(tab, host, ctx) { if (tab === 'generate') genView(host, ctx); else cmpView(host, ctx); }
  return { render: render, candidates: candidates, generate: generate, fromGeoJSON: fromGeoJSON, fromCsv: fromCsv, fromDxf: fromDxf, isCsv: isCsv, importFile: importFile, compare: compare, changeFile: changeFile, utmInv: utmInv, parseWkt: parseWkt };
})();
