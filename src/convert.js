/*!
 * AIXM Code Converter - conversions
 * Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com> - author of the AIXM Code Converter
 * SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE; keep this notice in all copies)
 * ==========================================================================
 *  - AIXM 5.x version conversion (5.1 <-> 5.1.1 <-> 5.2), streamed, keeps the
 *    original XML text; namespaces / schema locations rewritten, renamed
 *    5.2 features handled, a conversion report lists items needing review
 *  - AIXM 4.5 -> AIXM 5.1.1 BasicMessage writer (from the adapted model)
 *  - GIS: GeoJSON, KML (Google Earth), ESRI Shapefile (zip)
 * ========================================================================== */
/* global AX, MODEL, AIP, fflate */
var CONVERT = (function () {
  'use strict';
  var M = MODEL, s = M.s, arr = AX.arr;
  var CREDIT = APP_INFO.credit;

  function xesc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function uuidFor(key) {
    var h = (AX.hash('a' + key) + AX.hash('b' + key)).slice(0, 32).split('');
    h[12] = '5'; h[16] = '89ab'.charAt(parseInt(h[16], 16) % 4);
    h = h.join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20, 32);
  }

  /* ------------------------------------------------ 5.x version conversion */
  var NS_RE = /http:\/\/www\.aixm\.aero\/schema\/5\.(?:1\.1|1|2)(?:\/wip|\/RC\d+)?(?=[\/"'\s])/g;
  var LOC = { '5.1': 'http://www.aixm.aero/schema/5.1', '5.1.1': 'http://www.aixm.aero/schema/5.1.1', '5.2': 'http://www.aixm.aero/schema/5.2' };
  var LOCFILE = { '5.1': 'http://www.aixm.aero/schema/5.1/message/AIXM_BasicMessage.xsd', '5.1.1': 'http://www.aixm.aero/schema/5.1.1/message/AIXM_BasicMessage.xsd', '5.2': 'http://www.aixm.aero/schema/5.2/5.2.0/message/AIXM_BasicMessage.xsd' };
  var RENAME_52 = { RunwayVisualRange: 'RunwayVisualRangeEquipment' };
  var REMOVED_52 = ['AngleIndication', 'DistanceIndication', 'AirspaceBorderCrossing', 'AltimeterSource', 'SafeAltitudeArea', 'AirTrafficManagementService'];
  async function convertVersion(ds, target, onProgress, srcFile) { // srcFile: one file of a data set read from several files
    if (ds.family !== '5') throw new Error('Version conversion works on AIXM 5.x files. Use "AIXM 4.5 → 5.1.1" for 4.5 files.');
    var from = ds.version === '5.2' ? '5.2' : ds.version === '5.1.1' ? '5.1.1' : '5.1';
    var report = { from: ds.sniff.versionLabel, to: 'AIXM ' + target, renamed: 0, review: {}, notes: [] };
    var ren = {};
    if (target === '5.2' && from !== '5.2') ren = RENAME_52;
    if (target !== '5.2' && from === '5.2') Object.keys(RENAME_52).forEach(function (k) { ren[RENAME_52[k]] = k; });
    var renRe = Object.keys(ren).length ? new RegExp('(</?[\\w.-]+:)(' + Object.keys(ren).join('|') + ')(TimeSlice|PropertyType)?(?=[\\s>/])', 'g') : null;
    if (target === '5.2') ds.recs.forEach(function (r) { if (REMOVED_52.indexOf(r.k) >= 0) report.review[r.k] = (report.review[r.k] || 0) + 1; });
    if (from === '5.2' && target !== '5.2') ds.recs.forEach(function (r) { if ((M.dict().v5.featureVersions[r.k] || []).indexOf('5.1.1') < 0) report.review[r.k] = (report.review[r.k] || 0) + 1; });
    var parts = [], file = srcFile || ds.file, size = file.size, CH = 8 * 1024 * 1024, pos = 0, carry = '', first = true;
    var dec = new TextDecoder('utf-8');
    while (pos < size) {
      var buf = await file.slice(pos, Math.min(size, pos + CH)).arrayBuffer();
      pos += buf.byteLength;
      var txt = carry + dec.decode(buf, { stream: pos < size });
      var keep = pos < size ? 400 : 0;
      var cut = txt.length - keep;
      if (keep) { var lt = txt.lastIndexOf('<', cut); if (lt > 0) cut = lt; }
      var out = txt.slice(0, cut);
      carry = txt.slice(cut);
      out = out.replace(NS_RE, LOC[target]);
      if (first) {
        out = out.replace(/(schemaLocation\s*=\s*")([^"]*)"/, function (m, a, v) {
          return a + v.replace(/(http:\/\/www\.aixm\.aero\/schema\/5[^\s]*\s+)(\S*AIXM_BasicMessage\.xsd)/, function (x, ns) { return ns + LOCFILE[target]; }) + '"';
        });
        out = out.replace(/(<\?xml[^>]*\?>)/, '$1\n<!-- Converted from ' + xesc(report.from) + ' to ' + report.to + ' by ' + CREDIT + ' on ' + new Date().toISOString().slice(0, 10) + '. Review the conversion report. -->');
        first = false;
      }
      if (renRe) out = out.replace(renRe, function (m, p, n, sfx) { report.renamed++; return p + ren[n] + (sfx || ''); });
      parts.push(out);
      if (onProgress) onProgress(pos / size);
    }
    parts.push(carry.replace(NS_RE, LOC[target]));
    if (Object.keys(report.review).length) report.notes.push('Features that do not exist (or changed) in ' + report.to + ' and should be reviewed: ' + Object.keys(report.review).map(function (k) { return k + ' (' + report.review[k] + ')'; }).join(', '));
    if (from !== target) report.notes.push('Namespaces and schema location rewritten from ' + from + ' to ' + target + '. Property-level changes of the AIXM change proposals (e.g. new 5.2 code values) are not modified — validate the result against the ' + target + ' XSD.');
    return { blob: new Blob(parts, { type: 'text/xml' }), report: report };
  }

  /* ----------------------------------------------- AIXM 4.5 -> 5.1.1 writer */
  var POS_SRS = 'urn:ogc:def:crs:EPSG::4326';
  function writer45(ds) {
    var D = M.dict(), idc = 0, parts = [], skipped = {}, written = 0;
    // 4.5 frequencies point to their service; AIXM 5 services list their channels and call signs
    var svcExtra = new Map();
    ds.recs.forEach(function (r) {
      if (r.k !== 'RadioCommunicationChannel' || !r.cur.p._service) return;
      var sv = M.target(ds, r.cur.p._service);
      if (!sv) return;
      var e = svcExtra.get(sv) || { radioCommunication: [], callSign: [] };
      e.radioCommunication.push({ ref: r.id });
      arr(r.cur.p._callsign).forEach(function (c) { if (c && c.txtCallSign && !e.callSign.some(function (x) { return x.callSign === c.txtCallSign; })) e.callSign.push({ _t: 'CallsignDetail', callSign: c.txtCallSign, language: c.codeLang }); });
      svcExtra.set(sv, e);
    });
    function gid(p) { return (p || 'ID') + '_' + (++idc); }
    function refId(ref) {
      var t = M.target(ds, ref);
      return 'urn:uuid:' + uuidFor(t ? t.id : ref.ref);
    }
    function posList(c) { return c.filter(function (p) { return typeof p[0] === 'number'; }).map(function (p) { return p[1].toFixed(8) + ' ' + p[0].toFixed(8); }).join(' '); }
    function geomXml(tag, o, ind) {
      var g = o._geo, srs = ' srsName="' + POS_SRS + '"';
      var extra = objProps(o, tag.replace('aixm:', ''), ind + '  ', true);
      if (g.t === 'P') return ind + '<' + tag + srs + ' gml:id="' + gid('P') + '">\n' + ind + '  <gml:pos>' + g.c[1].toFixed(8) + ' ' + g.c[0].toFixed(8) + '</gml:pos>\n' + extra + ind + '</' + tag + '>\n';
      if (g.t === 'L') return ind + '<' + tag + srs + ' gml:id="' + gid('C') + '">\n' + ind + '  <gml:segments><gml:GeodesicString><gml:posList>' + posList(g.c) + '</gml:posList></gml:GeodesicString></gml:segments>\n' + extra + ind + '</' + tag + '>\n';
      return ind + '<' + tag + srs + ' gml:id="' + gid('S') + '">\n' + ind + '  <gml:patches><gml:PolygonPatch><gml:exterior><gml:LinearRing><gml:posList>' + posList(g.c[0]) + '</gml:posList></gml:LinearRing></gml:exterior></gml:PolygonPatch></gml:patches>\n' + extra + ind + '</' + tag + '>\n';
    }
    function valXml(name, v, ind, ctxType) {
      if (v === undefined || v === null || v === '') return '';
      if (Array.isArray(v)) return v.map(function (x) { return valXml(name, x, ind, ctxType); }).join('');
      var tag = 'aixm:' + name;
      if (typeof v !== 'object') return ind + '<' + tag + '>' + xesc(v) + '</' + tag + '>\n';
      if (v.ref !== undefined) return ind + '<' + tag + ' xlink:href="' + refId(v) + '"/>\n';
      if (v.nil !== undefined) return ind + '<' + tag + ' xsi:nil="true" nilReason="' + xesc(v.nil) + '"/>\n';
      if (v.v !== undefined) return ind + '<' + tag + (v.u ? ' uom="' + xesc(v.u) + '"' : '') + '>' + xesc(v.v) + '</' + tag + '>\n';
      var t = v._t || 'Object';
      if (v._geo) return ind + '<' + tag + '>\n' + geomXml('aixm:' + t, v, ind + '  ') + ind + '</' + tag + '>\n';
      return ind + '<' + tag + '>\n' + ind + '  <aixm:' + t + ' gml:id="' + gid(t.slice(0, 4).toUpperCase()) + '">\n' + objProps(v, t, ind + '    ') + ind + '  </aixm:' + t + '>\n' + ind + '</' + tag + '>\n';
    }
    function ordered(keys, dictProps) {
      var known = dictProps ? Object.keys(dictProps) : [];
      return known.filter(function (k) { return keys.indexOf(k) >= 0; }).concat(keys.filter(function (k) { return known.indexOf(k) < 0; }));
    }
    function objProps(o, t, ind, geomOnly) {
      var dp = D.v5.objects[t] ? D.v5.objects[t].p : null;
      var keys = Object.keys(o).filter(function (k) { return k.charAt(0) !== '_' && (!dp || dp[k] || k === 'annotation'); });
      if (geomOnly && !dp) return '';
      return ordered(keys, dp).map(function (k) { return valXml(k, o[k], ind, t); }).join('');
    }
    function feature(r) {
      if (r.k.indexOf('45:') === 0 || r.k === 'Service') { skipped[r.s45 || r.k] = (skipped[r.s45 || r.k] || 0) + 1; return ''; }
      var fd = D.v5.features[r.k];
      if (!fd) { skipped[r.k] = (skipped[r.k] || 0) + 1; return ''; }
      var p = r.cur.p, u = uuidFor(r.id);
      var se = svcExtra.get(r);
      if (se) { p = Object.assign({}, p); if (fd.p.radioCommunication) p.radioCommunication = se.radioCommunication; if (fd.p['call-sign'] && se.callSign.length) p['call-sign'] = se.callSign; }
      if (p._ad) { // owning aerodrome of 4.5 relations (Sah, Ful, Pfy …) -> the matching AIXM 5 property
        var ap = ['airportHeliport', 'clientAirport', 'associatedAirportHeliport'].filter(function (k) { return fd.p[k] && !p[k]; })[0];
        if (ap) { p = Object.assign({}, p); p[ap] = p._ad; }
      }
      var keys = Object.keys(p).filter(function (k) { return k.charAt(0) !== '_' && fd.p[k]; });
      var props = ordered(keys, fd.p).map(function (k) { return valXml(k, p[k], '          ', r.k); }).join('');
      written++;
      return '  <message:hasMember>\n    <aixm:' + r.k + ' gml:id="uuid.' + u + '">\n      <gml:identifier codeSpace="urn:uuid:">' + u + '</gml:identifier>\n' +
        '      <aixm:timeSlice>\n        <aixm:' + r.k + 'TimeSlice gml:id="' + gid('TS') + '">\n' +
        '          <gml:validTime><gml:TimePeriod gml:id="' + gid('VT') + '"><gml:beginPosition>' + xesc(r.cur.b || (ds.sniff.header && ds.sniff.header.effective) || '2000-01-01T00:00:00Z') + '</gml:beginPosition><gml:endPosition indeterminatePosition="unknown"/></gml:TimePeriod></gml:validTime>\n' +
        '          <aixm:interpretation>BASELINE</aixm:interpretation>\n          <aixm:sequenceNumber>1</aixm:sequenceNumber>\n          <aixm:correctionNumber>0</aixm:correctionNumber>\n' +
        props + '        </aixm:' + r.k + 'TimeSlice>\n      </aixm:timeSlice>\n    </aixm:' + r.k + '>\n  </message:hasMember>\n';
    }
    parts.push('<?xml version="1.0" encoding="UTF-8"?>\n<!-- Converted from ' + xesc(ds.sniff.versionLabel) + ' (' + xesc(ds.name) + ') to AIXM 5.1.1 by ' + CREDIT + ' on ' + new Date().toISOString().slice(0, 10) + '.\n     UUIDs are derived deterministically from the AIXM 4.5 identifiers (same input = same UUIDs). -->\n' +
      '<message:AIXMBasicMessage xmlns:message="http://www.aixm.aero/schema/5.1.1/message" xmlns:aixm="http://www.aixm.aero/schema/5.1.1" xmlns:gml="http://www.opengis.net/gml/3.2" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
      'xsi:schemaLocation="http://www.aixm.aero/schema/5.1.1/message http://www.aixm.aero/schema/5.1.1/message/AIXM_BasicMessage.xsd" gml:id="MSG_' + uuidFor(ds.name).slice(0, 8) + '">\n');
    for (var i = 0; i < ds.recs.length; i++) parts.push(feature(ds.recs[i]));
    parts.push('</message:AIXMBasicMessage>\n');
    return { blob: new Blob(parts, { type: 'text/xml' }), report: { from: ds.sniff.versionLabel, to: 'AIXM 5.1.1', written: written, skipped: skipped,
      notes: ['Converted ' + written + ' features to AIXM 5.1.1.', Object.keys(skipped).length ? 'Not converted (no AIXM 5 equivalent in this tool yet): ' + Object.keys(skipped).map(function (k) { return k + ' (' + skipped[k] + ')'; }).join(', ') : 'All features were converted.',
        'Property order follows the AIXM 5.1.1 schema; validate the result against the 5.1.1 XSD before operational use.'] } };
  }

  /* ------------------------------------------------------------------ GIS */
  function gisFeatures(ds, filter) {
    var out = [];
    ds.recs.forEach(function (r) {
      if (filter && !filter(r)) return;
      var g = M.geometry(ds, r);
      if (!g) return;
      var p = r.cur.p, sec = AIP.sectionOf(ds, r);
      var props = { aixmType: r.k, id: r.id, name: M.label(ds, r), designator: s(p.designator) || s(p.locationIndicatorICAO) || '', subtype: s(p.type) || '',
        aipSection: sec.no + (sec.ad ? ' ' + M.shortName(sec.ad) : ''), validFrom: r.cur.b || '', validTo: r.cur.e || '', aixmLine: r.line };
      if (r.k === 'Airspace') { props.upperLower = AIP.vertical(ds, r).replace(/\n/g, '; '); props.class = AIP.airspaceClass(r).replace(/\n/g, '; '); }
      Object.keys(p).forEach(function (k) {
        if (k.charAt(0) === '_' || props[k] !== undefined) return;
        var v = p[k];
        if (typeof v === 'string') props[k] = v;
        else if (v && v.v !== undefined) props[k] = M.fq(v);
      });
      out.push({ r: r, g: g, props: props });
    });
    return out;
  }
  function geojsonGeom(g) {
    if (g.t === 'P') return { type: 'Point', coordinates: g.c };
    if (g.t === 'L') return { type: 'LineString', coordinates: g.c };
    if (g.t === 'A') return { type: 'Polygon', coordinates: g.c.map(function (ring) { return ring.filter(function (p) { return typeof p[0] === 'number'; }); }) };
    return { type: 'GeometryCollection', geometries: g.parts.map(geojsonGeom) };
  }
  function toGeoJSON(ds, filter) {
    var parts = ['{"type":"FeatureCollection","name":' + JSON.stringify(ds.state + ' — ' + ds.name) + ',"generator":' + JSON.stringify(CREDIT) + ',"author":"Prasad Selvaraj","authorEmail":"prasad2t@gmail.com","features":[\n'];
    gisFeatures(ds, filter).forEach(function (f, i) {
      parts.push((i ? ',\n' : '') + JSON.stringify({ type: 'Feature', id: f.r.id, geometry: geojsonGeom(f.g), properties: f.props }));
    });
    parts.push('\n]}\n');
    return new Blob(parts, { type: 'application/geo+json' });
  }
  var KML_COL = { Airspace: 'ff4a2a0b', RouteSegment: 'ff327d2e', AirportHeliport: 'ff4a2a0b', Runway: 'ff212121', VerticalStructure: 'ff2f2fd3', DesignatedPoint: 'ff995f1d', Navaid: 'ff4a2a0b' };
  function kmlCoords(c) { return c.filter(function (p) { return typeof p[0] === 'number'; }).map(function (p) { return p[0].toFixed(7) + ',' + p[1].toFixed(7) + ',0'; }).join(' '); }
  function kmlGeom(g) {
    if (g.t === 'P') return '<Point><coordinates>' + kmlCoords([g.c]) + '</coordinates></Point>';
    if (g.t === 'L') return '<LineString><tessellate>1</tessellate><coordinates>' + kmlCoords(g.c) + '</coordinates></LineString>';
    if (g.t === 'A') return '<Polygon><tessellate>1</tessellate><outerBoundaryIs><LinearRing><coordinates>' + kmlCoords(g.c[0]) + '</coordinates></LinearRing></outerBoundaryIs>' +
      g.c.slice(1).map(function (r) { return '<innerBoundaryIs><LinearRing><coordinates>' + kmlCoords(r) + '</coordinates></LinearRing></innerBoundaryIs>'; }).join('') + '</Polygon>';
    return '<MultiGeometry>' + g.parts.map(kmlGeom).join('') + '</MultiGeometry>';
  }
  function toKML(ds, filter) {
    var feats = gisFeatures(ds, filter), byType = {};
    feats.forEach(function (f) { (byType[f.r.k] || (byType[f.r.k] = [])).push(f); });
    var parts = ['<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>' + xesc(ds.state + ' — ' + ds.name) + '</name><description>' + xesc('Exported by ' + CREDIT) + '</description>\n'];
    Object.keys(byType).forEach(function (k) {
      var col = KML_COL[k] || 'ff546e7a';
      parts.push('<Style id="s' + k + '"><LineStyle><color>' + col + '</color><width>2</width></LineStyle><PolyStyle><color>33' + col.slice(2) + '</color></PolyStyle><IconStyle><color>' + col + '</color><scale>0.8</scale></IconStyle></Style>\n');
    });
    Object.keys(byType).sort().forEach(function (k) {
      parts.push('<Folder><name>' + xesc(k) + ' (' + byType[k].length + ')</name>\n');
      byType[k].forEach(function (f) {
        var desc = '<table>' + Object.keys(f.props).map(function (pk) { return '<tr><td><b>' + xesc(pk) + '</b></td><td>' + xesc(f.props[pk]) + '</td></tr>'; }).join('') + '</table>';
        parts.push('<Placemark><name>' + xesc(f.props.name) + '</name><styleUrl>#s' + k + '</styleUrl><description><![CDATA[' + desc + ']]></description>' + kmlGeom(f.g) + '</Placemark>\n');
      });
      parts.push('</Folder>\n');
    });
    parts.push('</Document></kml>\n');
    return new Blob(parts, { type: 'application/vnd.google-earth.kml+xml' });
  }
  /* -------- ESRI Shapefile (points / lines / polygons) + DBF + PRJ, zipped */
  var PRJ = 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["Degree",0.0174532925199433]]';
  var FIELDS = [['AIXMTYPE', 40], ['AIXMID', 60], ['NAME', 100], ['DESIG', 30], ['SUBTYPE', 40], ['AIPSECT', 30], ['VALIDFROM', 24], ['VALIDTO', 24], ['UPPERLOW', 120], ['LINE', 12]];
  function latin1(str, n) {
    var out = new Uint8Array(n).fill(32), t = String(str || '');
    for (var i = 0, j = 0; i < t.length && j < n; i++) { var c = t.charCodeAt(i); out[j++] = c < 256 ? c : 63; }
    return out;
  }
  function dbf(rows) {
    var hl = 32 + FIELDS.length * 32 + 1, rl = 1 + FIELDS.reduce(function (a, f) { return a + f[1]; }, 0);
    var buf = new Uint8Array(hl + rl * rows.length + 1), dv = new DataView(buf.buffer), d = new Date();
    buf[0] = 3; buf[1] = d.getFullYear() - 1900; buf[2] = d.getMonth() + 1; buf[3] = d.getDate();
    dv.setUint32(4, rows.length, true); dv.setUint16(8, hl, true); dv.setUint16(10, rl, true);
    FIELDS.forEach(function (f, i) {
      var o = 32 + i * 32;
      for (var k = 0; k < f[0].length; k++) buf[o + k] = f[0].charCodeAt(k);
      buf[o + 11] = 67; buf[o + 16] = f[1];
    });
    buf[hl - 1] = 13;
    rows.forEach(function (r, ri) {
      var o = hl + ri * rl; buf[o] = 32; o++;
      FIELDS.forEach(function (f, i) { buf.set(latin1(r[i], f[1]), o); o += f[1]; });
    });
    buf[buf.length - 1] = 26;
    return buf;
  }
  function ringArea(r) { var a = 0; for (var i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]); return a / 2; }
  function shp(kind, geoms) { // kind 1 point, 3 polyline, 5 polygon ; geoms = array of arrays of parts (each part array of [lon,lat])
    var recs = geoms.map(function (parts) {
      if (kind === 1) return { len: 20, parts: parts };
      var np = parts.length, n = parts.reduce(function (a, p) { return a + p.length; }, 0);
      return { len: 44 + 4 * np + 16 * n, parts: parts };
    });
    var total = 100 + recs.reduce(function (a, r) { return a + 8 + r.len; }, 0);
    var shpB = new ArrayBuffer(total), shxB = new ArrayBuffer(100 + 8 * recs.length);
    var S = new DataView(shpB), X = new DataView(shxB);
    var bb = [Infinity, Infinity, -Infinity, -Infinity];
    geoms.forEach(function (parts) { parts.forEach(function (p) { p.forEach(function (c) { bb[0] = Math.min(bb[0], c[0]); bb[1] = Math.min(bb[1], c[1]); bb[2] = Math.max(bb[2], c[0]); bb[3] = Math.max(bb[3], c[1]); }); }); });
    if (!isFinite(bb[0])) bb = [0, 0, 0, 0];
    [S, X].forEach(function (V, i) {
      V.setInt32(0, 9994); V.setInt32(24, (i ? 100 + 8 * recs.length : total) / 2); V.setInt32(28, 1000, true); V.setInt32(32, kind, true);
      V.setFloat64(36, bb[0], true); V.setFloat64(44, bb[1], true); V.setFloat64(52, bb[2], true); V.setFloat64(60, bb[3], true);
    });
    var o = 100;
    recs.forEach(function (r, i) {
      X.setInt32(100 + i * 8, o / 2); X.setInt32(104 + i * 8, r.len / 2);
      S.setInt32(o, i + 1); S.setInt32(o + 4, r.len / 2); o += 8;
      S.setInt32(o, kind, true);
      if (kind === 1) { S.setFloat64(o + 4, r.parts[0][0][0], true); S.setFloat64(o + 12, r.parts[0][0][1], true); o += 20; return; }
      var b = [Infinity, Infinity, -Infinity, -Infinity], n = 0;
      r.parts.forEach(function (p) { n += p.length; p.forEach(function (c) { b[0] = Math.min(b[0], c[0]); b[1] = Math.min(b[1], c[1]); b[2] = Math.max(b[2], c[0]); b[3] = Math.max(b[3], c[1]); }); });
      S.setFloat64(o + 4, b[0], true); S.setFloat64(o + 12, b[1], true); S.setFloat64(o + 20, b[2], true); S.setFloat64(o + 28, b[3], true);
      S.setInt32(o + 36, r.parts.length, true); S.setInt32(o + 40, n, true);
      var q = o + 44, start = 0;
      r.parts.forEach(function (p) { S.setInt32(q, start, true); q += 4; start += p.length; });
      r.parts.forEach(function (p) { p.forEach(function (c) { S.setFloat64(q, c[0], true); S.setFloat64(q + 8, c[1], true); q += 16; }); });
      o += r.len;
    });
    return { shp: new Uint8Array(shpB), shx: new Uint8Array(shxB) };
  }
  function toShapefile(ds, filter) {
    var sets = { points: { kind: 1, g: [], a: [] }, lines: { kind: 3, g: [], a: [] }, polygons: { kind: 5, g: [], a: [] } };
    function clean(c) { return c.filter(function (p) { return typeof p[0] === 'number'; }); }
    gisFeatures(ds, filter).forEach(function (f) {
      var pr = f.props, attr = [pr.aixmType, pr.id, pr.name, pr.designator, pr.subtype, pr.aipSection, pr.validFrom, pr.validTo, pr.upperLower || '', String(pr.aixmLine)];
      (function add(g) {
        if (g.t === 'M') { g.parts.forEach(add); return; }
        if (g.t === 'P') { sets.points.g.push([[g.c]]); sets.points.a.push(attr); }
        else if (g.t === 'L') { var l = clean(g.c); if (l.length > 1) { sets.lines.g.push([l]); sets.lines.a.push(attr); } }
        else if (g.t === 'A') {
          var rings = g.c.map(clean).filter(function (r) { return r.length > 3; }).map(function (r, i) {
            var cw = ringArea(r) > 0; // shapefile: outer ring clockwise, holes counter-clockwise
            return (i === 0 ? !cw : cw) ? r.slice().reverse() : r;
          });
          if (rings.length) { sets.polygons.g.push(rings); sets.polygons.a.push(attr); }
        }
      })(f.g);
    });
    var files = {}, base = (ds.state + '_' + ds.name.replace(/\.[^.]+$/, '')).replace(/[^\w.-]+/g, '_').slice(0, 60);
    Object.keys(sets).forEach(function (k) {
      var st = sets[k];
      if (!st.g.length) return;
      var sh = shp(st.kind, st.g);
      files[base + '_' + k + '.shp'] = sh.shp; files[base + '_' + k + '.shx'] = sh.shx;
      files[base + '_' + k + '.dbf'] = dbf(st.a); files[base + '_' + k + '.prj'] = new TextEncoder().encode(PRJ);
      files[base + '_' + k + '.cpg'] = new TextEncoder().encode('ISO-8859-1');
    });
    files['README.txt'] = new TextEncoder().encode('ESRI Shapefiles exported by ' + CREDIT + ' from ' + ds.name + ' (' + ds.state + ').\nCRS: WGS 84 (EPSG:4326). Attribute AIXMID = AIXM gml:identifier / 4.5 key, LINE = line in the AIXM file.\n');
    return new Blob([fflate.zipSync(files, { level: 6 })], { type: 'application/zip' });
  }

  return { convertVersion: convertVersion, writer45: writer45, toGeoJSON: toGeoJSON, toKML: toKML, toShapefile: toShapefile, uuidFor: uuidFor, gisFeatures: gisFeatures };
})();
