/*!
 * AIXM Code Converter
 * Copyright 2026 Prasad <prasad2t@gmail.com> - author of the AIXM Code Converter
 * SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE; keep this notice in all copies)
 * ==========================================================================
 * AIXM Code Converter - core engine
 * Shared by the main thread and the background parser workers.
 *  - version sniffing (AIXM 4.5 / 5.0 / 5.1 / 5.1.1 / 5.2 / 5.2 pre-releases)
 *  - tiny, fast XML parser (feature-sized fragments)
 *  - AIXM 5.x feature/time-slice conversion (GML geometry incl. arcs & circles)
 *  - AIXM 4.5 conversion + adapter to the AIXM 5 feature model
 *  - temporality, flattening, fingerprints, geodesy, AIRAC, ICAO prefixes
 * ========================================================================== */
var AX = (function () {
  'use strict';

  var GML_NS = 'http://www.opengis.net/gml/3.2';
  var GML_NS_RE = /^http:\/\/www\.opengis\.net\/gml(\/3\.2)?$/;

  /* ------------------------------------------------------------------ utils */
  function arr(x) { return x === undefined || x === null ? [] : Array.isArray(x) ? x : [x]; }
  function first(x) { return Array.isArray(x) ? x[0] : x; }

  var ENT = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
  function decodeEnt(s) {
    return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|lt|gt|amp|quot|apos);/g, function (m, e) {
      if (e.charCodeAt(0) === 35) {
        var code = e.charCodeAt(1) === 120 ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        try { return String.fromCodePoint(code); } catch (x) { return m; }
      }
      return ENT[e];
    });
  }

  /* cyrb53 string hash -> hex */
  function hash(str) {
    var h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (var i = 0, ch; i < str.length; i++) {
      ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
  }

  /* ---------------------------------------------------------- XML parser */
  // Produces nodes {n: localName, q: qualifiedName, a: attrs|null, c: children|null, t: text}
  function parseXml(s, nsHook) {
    var root = { n: '#root', q: '#root', a: null, c: null, t: '' };
    var st = [root], top = root, i = 0, L = s.length;
    while (i < L) {
      var lt = s.indexOf('<', i);
      if (lt === -1) lt = L;
      if (lt > i && top.c === null) top.t += s.slice(i, lt);
      if (lt >= L) break;
      var c = s.charCodeAt(lt + 1), e;
      if (c === 47) { // </
        e = s.indexOf('>', lt + 2);
        if (st.length > 1) { st.pop(); top = st[st.length - 1]; }
        i = e < 0 ? L : e + 1; continue;
      }
      if (c === 33) { // <! comment, CDATA, doctype
        if (s.charCodeAt(lt + 2) === 45) { e = s.indexOf('-->', lt + 4); i = e < 0 ? L : e + 3; continue; }
        if (s.startsWith('[CDATA[', lt + 2)) {
          e = s.indexOf(']]>', lt + 9);
          top.cd = (top.cd || '') + s.slice(lt + 9, e < 0 ? L : e);
          i = e < 0 ? L : e + 3; continue;
        }
        e = s.indexOf('>', lt + 2); i = e < 0 ? L : e + 1; continue;
      }
      if (c === 63) { e = s.indexOf('?>', lt + 2); i = e < 0 ? L : e + 2; continue; }
      var j = lt + 1, ch;
      while (j < L) { ch = s.charCodeAt(j); if (ch === 32 || ch === 9 || ch === 10 || ch === 13 || ch === 62 || ch === 47) break; j++; }
      var q = s.slice(lt + 1, j), colon = q.indexOf(':');
      var node = { n: colon < 0 ? q : q.slice(colon + 1), q: q, a: null, c: null, t: '' };
      var selfClose = false;
      while (j < L) {
        ch = s.charCodeAt(j);
        if (ch === 62) { j++; break; }
        if (ch === 47 && s.charCodeAt(j + 1) === 62) { selfClose = true; j += 2; break; }
        if (ch === 32 || ch === 9 || ch === 10 || ch === 13 || ch === 47) { j++; continue; }
        var k = j;
        while (k < L) { ch = s.charCodeAt(k); if (ch === 61 || ch === 32 || ch === 9 || ch === 10 || ch === 13 || ch === 62 || ch === 47) break; k++; }
        var an = s.slice(j, k);
        while (k < L && s.charCodeAt(k) !== 61 && s.charCodeAt(k) !== 62) k++;
        if (s.charCodeAt(k) !== 61) { j = k; continue; }
        k++;
        while (k < L) { ch = s.charCodeAt(k); if (ch === 34 || ch === 39) break; k++; }
        var ve = s.indexOf(s.charCodeAt(k) === 34 ? '"' : "'", k + 1);
        if (ve < 0) ve = L;
        var av = s.slice(k + 1, ve);
        if (av.indexOf('&') >= 0) av = decodeEnt(av);
        (node.a || (node.a = {}))[an] = av;
        if (nsHook && an.charCodeAt(0) === 120 && an.startsWith('xmlns')) nsHook(an, av);
        j = ve + 1;
      }
      (top.c || (top.c = [])).push(node);
      if (!selfClose) { st.push(node); top = node; }
      i = j;
    }
    return root;
  }

  function textOf(n) {
    var t = n.t;
    if (n.cd) t += n.cd;
    t = t.trim();
    return t.indexOf('&') >= 0 ? decodeEnt(t) : t;
  }
  function attr(n, local) {
    var a = n.a;
    if (!a) return undefined;
    if (a[local] !== undefined) return a[local];
    for (var k in a) {
      var c = k.indexOf(':');
      if (c >= 0 && k.slice(c + 1) === local && k.slice(0, c) !== 'xmlns') return a[k];
    }
    return undefined;
  }
  function child(n, local) {
    if (!n.c) return null;
    for (var i = 0; i < n.c.length; i++) if (n.c[i].n === local) return n.c[i];
    return null;
  }
  function desc(n, local) { // depth-first search
    if (!n.c) return null;
    for (var i = 0; i < n.c.length; i++) {
      var x = n.c[i];
      if (x.n === local) return x;
      var r = desc(x, local);
      if (r) return r;
    }
    return null;
  }

  /* -------------------------------------------------------------- sniffing */
  var AIXM5_RE = /^https?:\/\/www\.aixm\.aero\/schema\/(5(?:\.\d+)*)(\/(wip|RC\d+|5\.\d+\.\d+))?\/?$/i;
  function sniff(head, fileName) {
    var out = { family: null, version: null, versionLabel: null, root: null, aixmPrefixes: [], gmlPrefixes: ['gml'],
      eventPrefixes: [], xlinkPrefixes: ['xlink'], header: {}, isUpdate: false, ofmx: false, notes: [] };
    var h = head.replace(/<!--[\s\S]*?-->/g, '');
    var m = /<([A-Za-z_][\w.:-]*)([^>]*)>/.exec(h.replace(/<\?[\s\S]*?\?>/g, ''));
    if (!m) { out.notes.push('No XML root element found'); return out; }
    out.root = m[1];
    var rootAttrs = m[2];
    var rootLocal = out.root.split(':').pop();
    if (/^(AIXM|OFMX)-(Snapshot|Update)$/.test(rootLocal)) {
      out.family = '45';
      out.ofmx = rootLocal.indexOf('OFMX') === 0;
      out.isUpdate = /Update$/.test(rootLocal);
      var am, re = /([\w:-]+)\s*=\s*"([^"]*)"/g;
      while ((am = re.exec(rootAttrs))) out.header[am[1]] = am[2];
      out.version = out.ofmx ? 'OFMX' : (out.header.version || '4.5');
      out.versionLabel = out.ofmx ? 'OFMX ' + (out.header.version || '') + ' (AIXM 4.5 based)' : 'AIXM ' + out.version;
      return out;
    }
    // namespace declarations anywhere in the head (usually on the root)
    var nre = /xmlns(?::([\w.-]+))?\s*=\s*"([^"]+)"/g, nm, best = null;
    while ((nm = nre.exec(h))) {
      var prefix = nm[1] || '', uri = nm[2];
      var vm = AIXM5_RE.exec(uri);
      if (vm) {
        if (out.aixmPrefixes.indexOf(prefix) < 0) out.aixmPrefixes.push(prefix);
        var v = vm[1], sfx = vm[3] || '';
        if (/^5\.\d+\.\d+$/.test(sfx)) { v = sfx; sfx = ''; }
        if (!best) best = { v: v, sfx: sfx, uri: uri };
      } else if (/aixm\.aero\/schema\/5[\d.]*.*\/event/i.test(uri)) {
        if (out.eventPrefixes.indexOf(prefix) < 0) out.eventPrefixes.push(prefix);
      } else if (GML_NS_RE.test(uri)) {
        if (out.gmlPrefixes.indexOf(prefix) < 0) out.gmlPrefixes.push(prefix);
      } else if (uri === 'http://www.w3.org/1999/xlink') {
        if (out.xlinkPrefixes.indexOf(prefix) < 0) out.xlinkPrefixes.push(prefix);
      }
    }
    if (best) {
      out.family = '5';
      out.version = best.v;
      out.versionSuffix = best.sfx;
      out.namespace = best.uri;
      out.versionLabel = 'AIXM ' + best.v + (best.sfx ? ' (' + best.sfx + ')' : '');
      var sm = /schemaLocation\s*=\s*"([^"]+)"/.exec(h);
      if (sm) {
        out.header.schemaLocation = sm[1];
        var rc = /schema\/5\.2\/(RC\d+|5\.2\.\d+|wip)\//i.exec(sm[1]);
        if (rc && out.version === '5.2' && !out.versionSuffix) out.versionLabel = 'AIXM 5.2 (' + rc[1] + ')';
      }
      var ds = /<(?:[\w]+:)?dateStamp>\s*<(?:[\w]+:)?Date(?:Time)?>([^<]+)</.exec(h);
      if (ds) out.header.created = ds[1].trim();
    } else {
      out.notes.push('No AIXM namespace found in the file header');
    }
    return out;
  }

  /* ---------------------------------------------------------------- geodesy */
  var R_NM = 3440.065;
  var D2R = Math.PI / 180, R2D = 180 / Math.PI;
  var UOM_NM = { NM: 1, '[NMI_I]': 1, KM: 0.5399568, M: 0.0005399568, FT: 0.000164579, '[FT_I]': 0.000164579, MI: 0.8689762, '[MI_I]': 0.8689762 };
  function toNM(v, u) { var f = UOM_NM[String(u || 'NM').toUpperCase()]; return v * (f || 1); }
  function dest(lon, lat, brgDeg, distNM) {
    var d = distNM / R_NM, b = brgDeg * D2R, p1 = lat * D2R, l1 = lon * D2R;
    var p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
    var l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
    return [((l2 * R2D + 540) % 360) - 180, p2 * R2D];
  }
  function distNM(a, b) { // a,b = [lon,lat]
    var p1 = a[1] * D2R, p2 = b[1] * D2R, dp = p2 - p1, dl = (b[0] - a[0]) * D2R;
    var h = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    return 2 * R_NM * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  function bearing(a, b) {
    var p1 = a[1] * D2R, p2 = b[1] * D2R, dl = (b[0] - a[0]) * D2R;
    var y = Math.sin(dl) * Math.cos(p2), x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
    return (Math.atan2(y, x) * R2D + 360) % 360;
  }
  function arcPts(center, rNM, b1, b2, cw) {
    var out = [], span;
    if (cw) { span = (b2 - b1 + 360) % 360; if (span === 0) span = 360; }
    else { span = (b1 - b2 + 360) % 360; if (span === 0) span = 360; }
    var n = Math.max(2, Math.ceil(span / 3));
    for (var i = 0; i <= n; i++) {
      var b = cw ? b1 + span * i / n : b1 - span * i / n;
      out.push(dest(center[0], center[1], (b + 360) % 360, rNM));
    }
    return out;
  }
  function circlePts(center, rNM) { return arcPts(center, rNM, 0, 360, true); }

  /* ------------------------------------------------------------ coordinates */
  // AIXM 4.5 latitude/longitude strings: DDMMSS.ssH, DDMM.mmH, DD.ddH, or signed decimal
  function parse45Coord(s, isLon) {
    if (s === undefined || s === null) return NaN;
    s = String(s).trim().toUpperCase();
    var m = /^([0-9]+)(\.[0-9]*)?\s*([NSEW])$/.exec(s);
    if (!m) { var f = parseFloat(s); return isNaN(f) ? NaN : f; }
    var ip = m[1], fr = m[2] || '', hemi = m[3], degLen = isLon ? 3 : 2, v;
    if (ip.length <= degLen) v = parseFloat(ip + fr);
    else if (ip.length === degLen + 2) v = parseInt(ip.slice(0, degLen), 10) + parseFloat(ip.slice(degLen) + fr) / 60;
    else v = parseInt(ip.slice(0, degLen), 10) + parseInt(ip.slice(degLen, degLen + 2), 10) / 60 + parseFloat(ip.slice(degLen + 2) + fr) / 3600;
    return hemi === 'S' || hemi === 'W' ? -v : v;
  }
  function dms(v, isLon, secDec) {
    if (v === null || v === undefined || isNaN(v)) return '';
    secDec = secDec === undefined ? 2 : secDec;
    var hemi = isLon ? (v < 0 ? 'W' : 'E') : (v < 0 ? 'S' : 'N');
    var a = Math.abs(v), d = Math.floor(a), mf = (a - d) * 60, m = Math.floor(mf), sec = (mf - m) * 60;
    var p = Math.pow(10, secDec);
    sec = Math.round(sec * p) / p;
    if (sec >= 60) { sec -= 60; m += 1; }
    if (m >= 60) { m -= 60; d += 1; }
    var ss = sec.toFixed(secDec);
    if (sec < 10) ss = '0' + ss;
    return String(d).padStart(isLon ? 3 : 2, '0') + String(m).padStart(2, '0') + ss + hemi;
  }
  function fmtPos(c, secDec) { return c ? dms(c[1], false, secDec) + ' ' + dms(c[0], true, secDec) : ''; }

  /* ------------------------------------------------------------- AIXM 5 GML */
  var GEOM_KIND = { Point: 'P', ElevatedPoint: 'P', Curve: 'L', ElevatedCurve: 'L', LineString: 'L', OrientableCurve: 'L', CompositeCurve: 'L',
    Surface: 'A', ElevatedSurface: 'A', Polygon: 'A', MultiSurface: 'A', MultiCurve: 'L', MultiPoint: 'P' };
  function isLonLatSrs(srs) { return !!srs && /CRS:?84|OGC:1\.3:CRS84|OGC::CRS84/i.test(srs); }
  function numList(t) {
    var a = t.trim().split(/[\s,]+/), out = new Array(a.length);
    for (var i = 0; i < a.length; i++) out[i] = parseFloat(a[i]);
    return out;
  }
  function posPairs(t, srs, dim) {
    var nums = numList(t), out = [], lonlat = isLonLatSrs(srs);
    dim = dim || 2;
    for (var i = 0; i + 1 < nums.length; i += dim) {
      var a = nums[i], b = nums[i + 1];
      if (isNaN(a) || isNaN(b)) continue;
      out.push(lonlat ? [a, b] : [b, a]);
    }
    return out;
  }
  function srsOf(n, srs) { return attr(n, 'srsName') || srs; }
  function dimOf(n) { var d = attr(n, 'srsDimension'); return d ? parseInt(d, 10) : 2; }
  function pointsOf(n, srs) { // pos / posList / coordinates / pointProperty / pointRep children
    var out = [];
    if (!n.c) return out;
    for (var i = 0; i < n.c.length; i++) {
      var x = n.c[i];
      if (x.n === 'posList' || x.n === 'coordinates') out = out.concat(posPairs(textOf(x), srsOf(x, srs), dimOf(x)));
      else if (x.n === 'pos') out = out.concat(posPairs(textOf(x), srsOf(x, srs), dimOf(x)));
      else if (x.n === 'pointProperty' || x.n === 'pointRep') {
        var p = x.c && x.c[0];
        if (p) out = out.concat(pointsOf(p, srsOf(p, srs)));
      }
    }
    return out;
  }
  function angleToBearing(a, srs) { return isLonLatSrs(srs) ? (90 - a + 360) % 360 : (a + 360) % 360; }
  function pushPts(dst, pts) {
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i], l = dst[dst.length - 1];
      if (l && Math.abs(l[0] - p[0]) < 1e-9 && Math.abs(l[1] - p[1]) < 1e-9) continue;
      dst.push(p);
    }
  }
  function arc3(p1, p2, p3) { // circle through three points, sweeping p1 -> p2 -> p3
    var lat0 = p1[1] * D2R, kx = Math.cos(lat0);
    function xy(p) { return [(p[0] - p1[0]) * kx, p[1] - p1[1]]; }
    var a = xy(p1), b = xy(p2), c = xy(p3);
    var d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
    if (Math.abs(d) < 1e-12) return [p1, p2, p3];
    var ux = ((a[0] * a[0] + a[1] * a[1]) * (b[1] - c[1]) + (b[0] * b[0] + b[1] * b[1]) * (c[1] - a[1]) + (c[0] * c[0] + c[1] * c[1]) * (a[1] - b[1])) / d;
    var uy = ((a[0] * a[0] + a[1] * a[1]) * (c[0] - b[0]) + (b[0] * b[0] + b[1] * b[1]) * (a[0] - c[0]) + (c[0] * c[0] + c[1] * c[1]) * (b[0] - a[0])) / d;
    var center = [p1[0] + ux / kx, p1[1] + uy];
    var r = distNM(center, p1);
    var b1 = bearing(center, p1), b2 = bearing(center, p2), b3 = bearing(center, p3);
    var cwSpan = (b3 - b1 + 360) % 360, cwMid = (b2 - b1 + 360) % 360;
    var cw = cwMid < cwSpan;
    return { pts: arcPts(center, r, b1, b3, cw), center: center, r: r, cw: cw };
  }
  function curveGeo(n, srs, ctx, parts) { // returns point list; appends segment descriptions to parts
    srs = srsOf(n, srs);
    var pts = [];
    var segs = child(n, 'segments');
    if (!segs) {
      if (n.n === 'LineString' || n.n === 'LinearRing') { var lp = pointsOf(n, srs); pushPts(pts, lp); parts.push({ k: 'line', p: lp }); return pts; }
      if (n.n === 'OrientableCurve') { var bc = child(n, 'baseCurve'); if (bc && bc.c) return curveGeo(bc.c[0], srs, ctx, parts); }
      if (n.c) for (var q = 0; q < n.c.length; q++) if (n.c[q].n === 'curveMember' || n.c[q].n === 'curveMembers') {
        var cm = n.c[q];
        if (cm.c) for (var r = 0; r < cm.c.length; r++) pushPts(pts, curveGeo(cm.c[r], srs, ctx, parts));
      }
      return pts;
    }
    if (!segs.c) return pts;
    for (var i = 0; i < segs.c.length; i++) {
      var s = segs.c[i], ss = srsOf(s, srs), sp;
      switch (s.n) {
        case 'LineStringSegment': case 'GeodesicString': case 'Geodesic': case 'LineString':
          sp = pointsOf(s, ss); pushPts(pts, sp); parts.push({ k: s.n === 'LineStringSegment' ? 'line' : 'gc', p: sp }); break;
        case 'ArcByCenterPoint': case 'CircleByCenterPoint': {
          var cp = pointsOf(s, ss)[0];
          var rn = child(s, 'radius');
          if (!cp || !rn) break;
          var rNM = toNM(parseFloat(textOf(rn)), attr(rn, 'uom'));
          if (s.n === 'CircleByCenterPoint') {
            pushPts(pts, circlePts(cp, rNM));
            parts.push({ k: 'circle', c: cp, r: parseFloat(textOf(rn)), u: attr(rn, 'uom') || 'NM' });
          } else {
            var a1 = parseFloat(textOf(child(s, 'startAngle') || { t: '0' })), a2 = parseFloat(textOf(child(s, 'endAngle') || { t: '0' }));
            var b1 = angleToBearing(a1, ss), b2 = angleToBearing(a2, ss);
            // positive angular direction = anticlockwise in GML (from first to second axis).
            var ccw = a2 > a1;
            var cw = isLonLatSrs(ss) ? !ccw : ccw;
            pushPts(pts, arcPts(cp, rNM, b1, b2, cw));
            parts.push({ k: 'arc', c: cp, r: parseFloat(textOf(rn)), u: attr(rn, 'uom') || 'NM', cw: cw });
          }
          break;
        }
        case 'Arc': case 'ArcString': case 'Circle': {
          sp = pointsOf(s, ss);
          if (sp.length >= 3) {
            var a3 = arc3(sp[0], sp[1], sp[2]);
            if (s.n === 'Circle') { pushPts(pts, circlePts(a3.center, a3.r)); parts.push({ k: 'circle', c: a3.center, r: +a3.r.toFixed(3), u: 'NM' }); }
            else { pushPts(pts, a3.pts); parts.push({ k: 'arc', c: a3.center, r: +a3.r.toFixed(3), u: 'NM', cw: a3.cw }); }
          } else pushPts(pts, sp);
          break;
        }
        default:
          sp = pointsOf(s, ss); pushPts(pts, sp); if (sp.length) parts.push({ k: 'line', p: sp });
      }
    }
    return pts;
  }
  function ringGeo(n, srs, ctx, parts) {
    if (!n) return [];
    srs = srsOf(n, srs);
    if (n.n === 'LinearRing') { var lp = pointsOf(n, srs); parts.push({ k: 'line', p: lp }); return lp; }
    var pts = [];
    if (n.c) for (var i = 0; i < n.c.length; i++) {
      var cm = n.c[i];
      if (cm.n !== 'curveMember') continue;
      var href = attr(cm, 'href');
      if (href && !cm.c) { parts.push({ k: 'ref', h: href }); pts.push(['ref', href]); continue; }
      if (cm.c) for (var j = 0; j < cm.c.length; j++) pushPts(pts, curveGeo(cm.c[j], srs, ctx, parts));
    }
    return pts;
  }
  function closeRing(r) {
    if (r.length > 2) {
      var a = r[0], b = r[r.length - 1];
      if (typeof a[0] === 'number' && (Math.abs(a[0] - b[0]) > 1e-9 || Math.abs(a[1] - b[1]) > 1e-9)) r.push([a[0], a[1]]);
    }
    return r;
  }
  function polygonGeo(p, srs, ctx, rings, parts) {
    srs = srsOf(p, srs);
    if (!p.c) return;
    for (var i = 0; i < p.c.length; i++) {
      var x = p.c[i];
      if (x.n === 'exterior' || x.n === 'interior' || x.n === 'outerBoundaryIs' || x.n === 'innerBoundaryIs') {
        var pp = x.n === 'exterior' || x.n === 'outerBoundaryIs' ? parts : [];
        rings.push(closeRing(ringGeo(x.c && x.c[0], srs, ctx, pp)));
      }
    }
  }
  function surfaceGeo(n, srs, ctx) {
    srs = srsOf(n, srs);
    var rings = [], parts = [];
    var patches = child(n, 'patches') || child(n, 'polygonPatches');
    if (patches && patches.c) {
      for (var i = 0; i < patches.c.length; i++) polygonGeo(patches.c[i], srs, ctx, rings, parts);
    } else if (n.n === 'Polygon') polygonGeo(n, srs, ctx, rings, parts);
    else if (n.n === 'MultiSurface' && n.c) {
      for (var j = 0; j < n.c.length; j++) {
        var sm = n.c[j];
        if (sm.c) for (var k = 0; k < sm.c.length; k++) {
          var g = surfaceGeo(sm.c[k], srs, ctx);
          if (g) rings = rings.concat(g.c);
        }
      }
    }
    if (!rings.length) return null;
    var out = { t: 'A', c: rings };
    if (parts.length) out.d = parts;
    return out;
  }
  function geoOf(el, kind, srs, ctx) {
    if (kind === 'P') {
      if (el.n === 'MultiPoint') return null;
      var pts = pointsOf(el, srsOf(el, srs));
      return pts.length ? { t: 'P', c: pts[0] } : null;
    }
    if (kind === 'L') {
      var parts = [];
      var lp = curveGeo(el, srs, ctx, parts);
      if (!lp.length) return null;
      var g = { t: 'L', c: lp };
      if (parts.length) g.d = parts;
      var gid = attr(el, 'id');
      if (gid) g.id = gid;
      return g;
    }
    return surfaceGeo(el, srs, ctx);
  }

  /* ------------------------------------------------------ AIXM 5 conversion */
  function isGml(node, ctx) {
    var c = node.q.indexOf(':');
    var p = c < 0 ? '' : node.q.slice(0, c);
    return ctx.gmlP[p] === true;
  }
  function normRef(h) {
    if (!h) return h;
    var m = /([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/.exec(h);
    if (m) return m[1].toLowerCase();
    if (h.charAt(0) === '#') return h;
    return h;
  }
  function addProp(o, k, v) {
    if (v === undefined) return;
    if (Object.prototype.hasOwnProperty.call(o, k)) {
      var x = o[k];
      if (Array.isArray(x)) x.push(v); else o[k] = [x, v];
    } else o[k] = v;
  }
  function convProp(el, ctx, srs) {
    var href = attr(el, 'href');
    if (href !== undefined && !el.c) {
      var r = { ref: normRef(href) };
      var ti = attr(el, 'title');
      if (ti) r.title = ti;
      return r;
    }
    if (attr(el, 'nil') === 'true') {
      var nr = attr(el, 'nilReason') || 'nil';
      // 'nil' / 'inapplicable' carry no information: drop them (saves memory on large files)
      return nr === 'nil' || nr === 'inapplicable' ? undefined : { nil: nr };
    }
    if (el.c) {
      if (el.c.length === 1) return convObj(el.c[0], ctx, srs);
      var o = {};
      for (var i = 0; i < el.c.length; i++) addProp(o, el.c[i].n, convObj(el.c[i], ctx, srs));
      return o;
    }
    var t = textOf(el), u = attr(el, 'uom');
    if (u !== undefined) return { v: t, u: u };
    return t;
  }
  function convObj(el, ctx, srs) {
    var n = el.n, o = { _t: n };
    srs = srsOf(el, srs);
    var kind = GEOM_KIND[n];
    if (kind) {
      var g = geoOf(el, kind, srs, ctx);
      if (g) o._geo = g;
    }
    if (el.c) {
      for (var i = 0; i < el.c.length; i++) {
        var ch = el.c[i];
        if (isGml(ch, ctx)) continue;
        var cv = convProp(ch, ctx, srs);
        if (cv === undefined && attr(ch, 'nil') === 'true') o._na = o._na ? o._na + ',' + ch.n : ch.n; // declared not applicable
        else addProp(o, ch.n, cv);
      }
    } else if (!kind) {
      var t = textOf(el);
      if (t) o._v = t;
    }
    return o;
  }
  function period(el) {
    var tp = el.c && el.c[0];
    if (!tp) return [null, null];
    if (tp.n === 'TimeInstant') { var p = desc(tp, 'timePosition'); var v = p ? textOf(p) || null : null; return [v, v]; }
    var b = null, e = null;
    if (tp.c) for (var i = 0; i < tp.c.length; i++) {
      var x = tp.c[i];
      if (x.n === 'beginPosition') b = textOf(x) || null;
      else if (x.n === 'endPosition') e = textOf(x) || null;
      else if (x.n === 'begin') { var bp = desc(x, 'timePosition'); b = bp ? textOf(bp) || null : null; }
      else if (x.n === 'end') { var ep = desc(x, 'timePosition'); e = ep ? textOf(ep) || null : null; }
    }
    return [b, e];
  }
  function convTS(t, ctx) {
    var o = { i: '', s: 0, c: 0, b: null, e: null, p: {} };
    if (t.c) for (var i = 0; i < t.c.length; i++) {
      var ch = t.c[i], pr;
      switch (ch.n) {
        case 'validTime': pr = period(ch); o.b = pr[0]; o.e = pr[1]; break;
        case 'interpretation': o.i = textOf(ch); break;
        case 'sequenceNumber': o.s = +textOf(ch) || 0; break;
        case 'correctionNumber': o.c = +textOf(ch) || 0; break;
        case 'featureLifetime': pr = period(ch); o.lb = pr[0]; o.le = pr[1]; break;
        default:
          if (isGml(ch, ctx)) break;
          var pv = convProp(ch, ctx, null);
          if (pv === undefined && attr(ch, 'nil') === 'true') o.p._na = o.p._na ? o.p._na + ',' + ch.n : ch.n;
          else addProp(o.p, ch.n, pv);
      }
    }
    return o;
  }
  function convFeature5(node, ctx) {
    var rec = { k: node.n, id: null, ts: [] };
    var gid = attr(node, 'id');
    if (gid) rec.gid = gid;
    if (node.c) for (var i = 0; i < node.c.length; i++) {
      var ch = node.c[i];
      if (ch.n === 'identifier') rec.id = textOf(ch).toLowerCase();
      else if (ch.n === 'timeSlice') { if (ch.c) for (var j = 0; j < ch.c.length; j++) rec.ts.push(convTS(ch.c[j], ctx)); }
    }
    if (!rec.id) rec.id = gid ? '#' + gid : null;
    return rec;
  }

  /* ------------------------------------------------------ AIXM 4.5 conversion */
  function raw45(el) {
    if (!el.c) return textOf(el);
    var o = {};
    for (var i = 0; i < el.c.length; i++) addProp(o, el.c[i].n, raw45(el.c[i]));
    var mid = attr(el, 'mid');
    if (mid) o['@mid'] = mid;
    return o;
  }
  function uidKey(name, o) {
    var parts = [];
    for (var k in o) {
      if (k === '@mid') continue;
      var v = o[k];
      if (v && typeof v === 'object' && !Array.isArray(v)) parts.push(uidKey(k, v));
      else parts.push(k + '=' + v);
    }
    return name.replace(/Uid.*$/, '') + '[' + parts.join(';') + ']';
  }
  function collectUids(o, own, out, path) {
    for (var k in o) {
      var v = o[k];
      if (k.indexOf('Uid') > 0 && v && typeof v === 'object' && !Array.isArray(v)) {
        if (k !== own || path) out.push({ prop: path ? path + '/' + k : k, name: k, key: uidKey(k, v) });
        if (k === own && !path) collectUids(v, null, out, k);
      } else if (v && typeof v === 'object') {
        var items = arr(v);
        for (var i = 0; i < items.length; i++) if (items[i] && typeof items[i] === 'object') collectUids(items[i], null, out, path ? path + '/' + k : k);
      }
    }
    return out;
  }
  function uv(v, u) { return v === undefined || v === '' ? undefined : (u ? { v: String(v), u: String(u) } : String(v)); }
  function pt45(o, latK, lonK, elevK, uomK, extra) {
    var lat = parse45Coord(o[latK || 'geoLat'], false), lon = parse45Coord(o[lonK || 'geoLong'], true);
    if (isNaN(lat) || isNaN(lon)) return undefined;
    var p = { _t: 'ElevatedPoint', _geo: { t: 'P', c: [lon, lat] } };
    var ev = o[elevK || 'valElev'];
    if (ev !== undefined) p.elevation = uv(ev, o[uomK || 'uomDistVer'] || 'M');
    if (o.valGeoidUndulation !== undefined) p.geoidUndulation = uv(o.valGeoidUndulation, o.uomDistVer || 'M');
    if (o.txtVerDatum) p.verticalDatum = o.txtVerDatum;
    if (extra) for (var k in extra) p[k] = extra[k];
    return p;
  }
  function uidPoint(u) { // Uid carrying geoLat/geoLong
    if (!u || typeof u !== 'object') return undefined;
    return pt45(u);
  }
  function contact45(type, addr, rmk) {
    if (!addr) return null;
    var t = String(type || '').toUpperCase(), ci = { _t: 'ContactInformation' };
    if (/^(POST|ADDR|ADDRESS)$/.test(t)) ci.address = { _t: 'PostalAddress', deliveryPoint: addr };
    else if (/^(PHONE|TEL|TELEPHONE)$/.test(t)) ci.phoneFax = { _t: 'TelephoneContact', voice: addr };
    else if (/^(FAX|TFAX|TELEFAX)$/.test(t)) ci.phoneFax = { _t: 'TelephoneContact', facsimile: addr };
    else if (/^(EMAIL|E-MAIL|MAIL)$/.test(t)) ci.networkNode = { _t: 'OnlineContact', eMail: addr };
    else ci.networkNode = { _t: 'OnlineContact', network: t === 'AFS' || t === 'AFTN' ? 'AFTN' : t === 'URL' || t === 'WEB' ? 'INTERNET' : t, linkage: addr + (rmk ? ' — ' + rmk : '') };
    return ci;
  }
  var RULE45 = { I: 'IFR', V: 'VFR', IV: 'ALL' };
  function usage45(ul) {
    var o = { _t: 'AirportHeliportUsage', type: { PERMIT: 'PERMIT', FORBID: 'FORBID', RESERV: 'RESERVATION', CONDITIONAL: 'CONDITIONAL' }[ul.codeUsageLimitation] || ul.codeUsageLimitation };
    var flight = [], aircraft = [];
    arr(ul.UsageCondition).forEach(function (c) {
      arr(c.FlightClass).forEach(function (f) { var x = { _t: 'FlightCharacteristic' }; if (f.codeRule) x.rule = RULE45[f.codeRule] || f.codeRule; if (f.codeMil) x.military = f.codeMil; if (f.codeOrigin) x.origin = f.codeOrigin; if (f.codePurpose) x.purpose = f.codePurpose; flight.push(x); });
      arr(c.AircraftClass).forEach(function (a) { var x = { _t: 'AircraftCharacteristic' }; if (a.codeType) x.type = a.codeType; if (a.codeEngine) x.engine = a.codeEngine; if (a.codeNavSpec) x.navigationSpecification = a.codeNavSpec; aircraft.push(x); });
    });
    if (flight.length || aircraft.length) o.selection = { _t: 'ConditionCombination', logicalOperator: 'AND', flight: flight.length ? flight : undefined, aircraft: aircraft.length ? aircraft : undefined };
    if (ul.Timetable) o._hours = ul.Timetable;
    if (ul.txtRmk) o.annotation = note45(ul.txtRmk);
    return o;
  }
  function limitText45(l) {
    var parts = [];
    if (l.valAngleFm !== undefined || l.valAngleTo !== undefined) parts.push('sector ' + (l.valAngleFm || '?') + '°–' + (l.valAngleTo || '?') + '°');
    if (l.valDistInner || l.valDistOuter) parts.push((l.valDistInner ? l.valDistInner + '–' : 'up to ') + (l.valDistOuter || '') + ' ' + (l.uomDist || l.uomDistHorz || 'NM'));
    if (l.valDistVerUpper) parts.push('below ' + (l.uomDistVerUpper === 'FL' ? 'FL ' + l.valDistVerUpper : l.valDistVerUpper + ' ' + (l.uomDistVerUpper || '')));
    if (l.valDistVerLower) parts.push('above ' + (l.uomDistVerLower === 'FL' ? 'FL ' + l.valDistVerLower : l.valDistVerLower + ' ' + (l.uomDistVerLower || '')));
    if (!parts.length) Object.keys(l).forEach(function (k) { if (typeof l[k] === 'string') parts.push(l[k]); });
    return parts.join(', ') + '.';
  }
  function note45(txt, propName) {
    if (!txt) return undefined;
    var n = { _t: 'Note', translatedNote: { _t: 'LinguisticNote', note: String(txt) } };
    if (propName) n.propertyName = propName;
    return n;
  }
  function limit45(o, pref) { // valDistVerUpper / uomDistVerUpper / codeDistVerUpper
    var v = o['valDistVer' + pref], u = o['uomDistVer' + pref], c = o['codeDistVer' + pref];
    var ref = { HEI: 'SFC', ALT: 'MSL', STD: 'STD', W84: 'W84', OTHER: 'OTHER' }[c] || c;
    return { lim: v !== undefined ? (u ? { v: String(v), u: String(u) } : String(v)) : undefined, ref: ref };
  }
  var FROM45 = {
    Ahp: 'AirportHeliport', Rwy: 'Runway', Rdn: 'RunwayDirection', Rdd: 'RunwayCentrelinePoint', Rcp: 'RunwayCentrelinePoint',
    Rls: 'RunwayDirectionLightSystem', Als: 'ApronLightSystem', Tls: 'TouchDownLiftOffLightSystem', Fls: 'RunwayDirectionLightSystem',
    Vor: 'VOR', Dme: 'DME', Ndb: 'NDB', Tcn: 'TACAN', Mkr: 'MarkerBeacon', Ils: 'Navaid', Mls: 'Navaid',
    Dpn: 'DesignatedPoint', Ase: 'Airspace', Rte: 'Route', Rsg: 'RouteSegment', Obs: 'VerticalStructure', Uni: 'Unit',
    Ser: 'Service', Fqy: 'RadioCommunicationChannel', Org: 'OrganisationAuthority', Twy: 'Taxiway', Apn: 'Apron',
    Tla: 'TouchDownLiftOff', Fto: 'Runway', Fdn: 'RunwayDirection', Ahs: 'AircraftGroundService', Agl: 'AeronauticalGroundLight',
    Iap: 'InstrumentApproachProcedure', Sid: 'StandardInstrumentDeparture', Sia: 'StandardInstrumentArrival', Hpe: 'HoldingPattern',
    Gbr: 'GeoBorder', Gsd: 'AircraftStand', Swy: 'RunwayElement', Rpa: 'RunwayProtectArea', Sns: 'SpecialNavigationStation', Sny: 'SpecialNavigationSystem'
  };
  var SVC45 = { ACS: 'AirTrafficControlService', APP: 'AirTrafficControlService', TWR: 'AirTrafficControlService', ARTCC: 'AirTrafficControlService',
    UAC: 'AirTrafficControlService', OAC: 'AirTrafficControlService', GCA: 'AirTrafficControlService', PAR: 'AirTrafficControlService',
    SMC: 'GroundTrafficControlService', FIS: 'InformationService', AFIS: 'InformationService', ATIS: 'InformationService', VOLMET: 'InformationService',
    AIS: 'InformationService', SAR: 'SearchRescueService', RCC: 'SearchRescueService', ALRS: 'SearchRescueService' };
  function sigPoint45(u, suffix) { // TcnUidSta / VorUidSta / DpnUidSta ...
    var kinds = ['Dpn', 'Vor', 'Ndb', 'Dme', 'Tcn', 'Mkr'];
    for (var i = 0; i < kinds.length; i++) {
      var k = kinds[i] + 'Uid' + suffix;
      if (u[k]) {
        var key = uidKey(kinds[i] + 'Uid', u[k]);
        var o = { _t: 'EnRouteSegmentPoint' };
        o[kinds[i] === 'Dpn' ? 'pointChoice_fixDesignatedPoint' : 'pointChoice_navaidSystem'] = { ref: key };
        var loc = uidPoint(u[k]);
        if (loc) o._loc = loc;
        o._label = u[k].codeId;
        return o;
      }
    }
    return undefined;
  }
  function adapt45(s, r) {
    var uidName = s + 'Uid', u = r[uidName] || {};
    var p = {}, k = FROM45[s] || null;
    var rmk = note45(r.txtRmk);
    function set(name, v) { if (v !== undefined && v !== null && v !== '') p[name] = v; }
    function ref(name, uname, obj) { var src = obj || u; if (src && src[uname]) p[name] = { ref: uidKey(uname, src[uname]) }; }
    switch (s) {
      case 'Ahp':
        set('designator', u.codeId); set('name', r.txtName); set('locationIndicatorICAO', r.codeIcao); set('designatorIATA', r.codeIata);
        set('type', r.codeType); set('controlType', { CIV: 'CIVIL', MIL: 'MIL', JOINT: 'JOINT', OTHER: 'OTHER' }[r.codeTypeMilOps] || r.codeTypeMilOps);
        set('fieldElevation', uv(r.valElev, r.uomDistVer)); set('fieldElevationAccuracy', uv(r.valElevAccuracy, r.uomDistVer));
        set('magneticVariation', r.valMagVar); set('dateMagneticVariation', r.dateMagVar); set('magneticVariationChange', r.valMagVarChg);
        set('referenceTemperature', uv(r.valRefT, r.uomRefT)); set('transitionAltitude', uv(r.valTransitionAlt, r.uomTransitionAlt));
        if (r.txtNameCitySer) p.servedCity = { _t: 'City', name: r.txtNameCitySer };
        set('ARP', pt45(r));
        if (r.OrgUid) p.responsibleOrganisation = { _t: 'AirportHeliportResponsibilityOrganisation', role: 'OPERATE', theOrganisationAuthority: { ref: uidKey('OrgUid', r.OrgUid) } };
        p.annotation = [note45(r.txtDescrRefPt, 'ARP'), note45(r.txtDescrSite, 'servedCity'), note45(r.txtNameAdmin, 'responsibleOrganisation'),
          note45(r.txtDescrSryPwr, 'secondaryPowerSupply'), note45(r.txtDescrWdi, 'windDirectionIndicator'), note45(r.txtDescrLdi, 'landingDirectionIndicator'),
          note45(r.txtDescrAcl, 'aerodromeClearing'), rmk].filter(Boolean);
        if (r.codeVfr || r.codeIfr) p._traffic = [r.codeIfr === 'Y' ? 'IFR' : null, r.codeVfr === 'Y' ? 'VFR' : null].filter(Boolean).join('/');
        break;
      case 'Rwy': case 'Fto':
        set('designator', u.txtDesig || r.txtName); set('type', s === 'Fto' ? 'FATO' : 'RWY');
        ref('associatedAirportHeliport', 'AhpUid');
        set('nominalLength', uv(r.valLen, r.uomDimRwy || r.uomDim)); set('nominalWidth', uv(r.valWid, r.uomDimRwy || r.uomDim));
        set('lengthStrip', uv(r.valLenStrip, r.uomDimStrip)); set('widthStrip', uv(r.valWidStrip, r.uomDimStrip));
        var sc = { _t: 'SurfaceCharacteristics' };
        if (r.codeComposition) sc.composition = r.codeComposition;
        if (r.codePreparation) sc.preparation = r.codePreparation;
        if (r.codeCondSfc) sc.surfaceCondition = r.codeCondSfc;
        if (r.valPcnClass) sc.classPCN = r.valPcnClass;
        if (r.codePcnPavementType) sc.pavementTypePCN = r.codePcnPavementType;
        if (r.codePcnPavementSubgrade) sc.pavementSubgradePCN = r.codePcnPavementSubgrade;
        if (r.codePcnMaxTirePressure) sc.maxTyrePressurePCN = r.codePcnMaxTirePressure;
        if (r.codePcnEvalMethod) sc.evaluationMethodPCN = r.codePcnEvalMethod;
        if (r.codeStrength) sc._strength = r.codeStrength + (r.txtDescrStrength ? ' ' + r.txtDescrStrength : '');
        else if (r.txtDescrStrength) sc._strength = r.txtDescrStrength;
        if (Object.keys(sc).length > 1) p.surfaceProperties = sc;
        p.annotation = [note45(r.txtProfile, 'profile'), note45(r.txtMarking, 'marking'), rmk].filter(Boolean);
        break;
      case 'Rdn': case 'Fdn':
        set('designator', u.txtDesig); ref('usedRunway', s === 'Rdn' ? 'RwyUid' : 'FtoUid');
        set('trueBearing', r.valTrueBrg); set('magneticBearing', r.valMagBrg);
        set('elevationTDZ', uv(r.valElevTdz, r.uomElevTdz)); set('_thr', pt45(r));
        if (r.codeTypeVasis || r.valSlopeAngleGpVasis) p._vasis = { _t: 'VisualGlideSlopeIndicator', type: r.codeTypeVasis, position: r.codePsnVasis,
          numberBox: r.noBoxVasis, portable: r.codePortableVasis, slopeAngle: r.valSlopeAngleGpVasis, minimumEyeHeightOverThreshold: uv(r.valMeht, r.uomMeht), _descr: r.txtDescrPsnVasis };
        p.annotation = [note45(r.txtDescrArstDvc, 'arrestingGear'), note45(r.txtDescrRvr, 'RVR'), rmk].filter(Boolean);
        break;
      case 'Rdd':
        var rdn = u.RdnUid || u.FdnUid;
        if (rdn) p.onRunway = { ref: uidKey(u.RdnUid ? 'RdnUid' : 'FdnUid', rdn) };
        p.associatedDeclaredDistance = { _t: 'RunwayDeclaredDistance', type: u.codeType, declaredValue: { _t: 'RunwayDeclaredDistanceValue', distance: uv(r.valDist, r.uomDist) } };
        if (rmk) p.annotation = rmk;
        break;
      case 'Rcp':
        if (u.RwyUid) p._runway = { ref: uidKey('RwyUid', u.RwyUid) };
        set('location', pt45(u, 'geoLat', 'geoLong', null, null) ? pt45(Object.assign({}, u, r)) : undefined);
        if (rmk) p.annotation = rmk;
        break;
      case 'Rls': case 'Fls': case 'Tls': case 'Als':
        var own = u.RdnUid ? ['RdnUid', u.RdnUid] : u.FdnUid ? ['FdnUid', u.FdnUid] : u.TlaUid ? ['TlaUid', u.TlaUid] : u.ApnUid ? ['ApnUid', u.ApnUid] : null;
        if (own) p[s === 'Als' ? 'lightedApron' : s === 'Tls' ? 'lightedTouchDownLiftOff' : 'associatedRunwayDirection'] = { ref: uidKey(own[0], own[1]) };
        set('position', u.codePsn); set('colour', r.codeColour); set('intensityLevel', r.codeIntst);
        p.annotation = [note45(r.txtDescr), note45(r.txtDescrEmerg, 'emergencyLighting'), rmk].filter(Boolean);
        break;
      case 'Vor': case 'Dme': case 'Ndb': case 'Tcn': case 'Mkr':
        set('designator', u.codeId); set('name', r.txtName); set('type', r.codeType || r.codeClass);
        set('location', pt45(Object.assign({}, r, { geoLat: u.geoLat, geoLong: u.geoLong })));
        set('frequency', uv(r.valFreq, r.uomFreq)); set('channel', r.codeChannel); set('magneticVariation', r.valMagVar);
        set('dateMagneticVariation', r.dateMagVar); set('declination', r.valDeclination); set('zeroBearingDirection', r.codeTypeNorth);
        set('emissionClass', r.codeEm); set('ghostFrequency', uv(r.valGhostFreq, r.uomGhostFreq)); set('displace', uv(r.valDisplace, r.uomDisplace));
        if (s === 'Mkr') { set('class', r.codeClass); set('axisBearing', r.valAxisBrg); }
        if (r.OrgUid) p.authority = { _t: 'AuthorityForNavaidEquipment', theOrganisationAuthority: { ref: uidKey('OrgUid', r.OrgUid) } };
        if (r.VorUid) p._collocatedVor = { ref: uidKey('VorUid', r.VorUid) };
        if (r.IlsUid) p._ils = { ref: uidKey('IlsUid', r.IlsUid) };
        if (r.Vtt || r.Dtt || r.Ntt || r.Ttt || r.Mtt) p._hours = r.Vtt || r.Dtt || r.Ntt || r.Ttt || r.Mtt;
        if (rmk) p.annotation = rmk;
        break;
      case 'Ils': case 'Mls':
        set('type', s === 'Ils' ? (r.DmeUid ? 'ILS_DME' : 'ILS') : 'MLS'); set('signalPerformance', r.codeCat);
        if (u.RdnUid) p.runwayDirection = { ref: uidKey('RdnUid', u.RdnUid) };
        if (u.FdnUid) p.runwayDirection = { ref: uidKey('FdnUid', u.FdnUid) };
        if (r.DmeUid) p._dme = { ref: uidKey('DmeUid', r.DmeUid) };
        if (r.Ilz) {
          var z = r.Ilz;
          set('designator', z.codeId);
          p._loc = { _t: 'Localizer', designator: z.codeId, frequency: uv(z.valFreq, z.uomFreq), magneticBearing: z.valMagBrg, trueBearing: z.valTrueBrg,
            magneticVariation: z.valMagVar, courseWidth: z.valWidCourse, location: pt45(z) };
        }
        if (r.Igp) {
          var gp = r.Igp;
          p._gp = { _t: 'Glidepath', frequency: uv(gp.valFreq, gp.uomFreq), slope: gp.valSlope, rdh: uv(gp.valRdh, gp.uomRdh), location: pt45(gp) };
        }
        if (rmk) p.annotation = rmk;
        break;
      case 'Dpn':
        set('designator', u.codeId); set('name', r.txtName); set('type', r.codeType);
        set('location', pt45(Object.assign({}, r, { geoLat: u.geoLat, geoLong: u.geoLong })));
        if (r.AhpUidAssoc) p.airportHeliport = { ref: uidKey('AhpUid', r.AhpUidAssoc) };
        if (rmk) p.annotation = rmk;
        break;
      case 'Ase':
        set('type', u.codeType); set('designator', u.codeId); set('name', r.txtName); set('localType', r.txtLocalType);
        if (r.codeClass) p['class'] = { _t: 'AirspaceLayerClass', classification: r.codeClass };
        set('designatorICAO', r.codeLocInd); set('_activity', r.codeActivity); set('controlType', r.codeMil);
        var up = limit45(r, 'Upper'), lo = limit45(r, 'Lower'), mx = limit45(r, 'Max'), mn = limit45(r, 'Mnm');
        var vol = { _t: 'AirspaceVolume' };
        if (up.lim !== undefined) { vol.upperLimit = up.lim; vol.upperLimitReference = up.ref; }
        if (lo.lim !== undefined) { vol.lowerLimit = lo.lim; vol.lowerLimitReference = lo.ref; }
        if (mx.lim !== undefined) { vol.maximumLimit = mx.lim; vol.maximumLimitReference = mx.ref; }
        if (mn.lim !== undefined) { vol.minimumLimit = mn.lim; vol.minimumLimitReference = mn.ref; }
        p.geometryComponent = { _t: 'AirspaceGeometryComponent', operation: 'BASE', operationSequence: '1', theAirspaceVolume: vol };
        if (r.Att) p._hours = r.Att;
        if (rmk) p.annotation = rmk;
        break;
      case 'Abd':
        k = '45:Abd';
        if (u.AseUid) p._airspace = { ref: uidKey('AseUid', u.AseUid) };
        var g = border45(r);
        if (g) p._surface = { _t: 'Surface', _geo: g };
        break;
      case 'Gbr':
        set('name', u.txtName); set('type', r.codeType);
        var gb = border45({ Avx: r.Gbv }, true);
        if (gb) p.border = { _t: 'Curve', _geo: { t: 'L', c: gb.c[0] } };
        break;
      case 'Rte':
        var des = u.txtDesig || '';
        var dm = /^([A-Z]?)([A-Z])(\d+)([A-Z]?)$/.exec(des);
        if (dm) { set('designatorPrefix', dm[1] || undefined); set('designatorSecondLetter', dm[2]); set('designatorNumber', dm[3]); set('multipleIdentifier', dm[4] || undefined); }
        set('name', des); set('locationDesignator', u.txtLocDesig);
        if (rmk) p.annotation = rmk;
        break;
      case 'Rsg':
        if (u.RteUid) p.routeFormed = { ref: uidKey('RteUid', u.RteUid) };
        set('start', sigPoint45(u, 'Sta')); set('end', sigPoint45(u, 'End'));
        if (p.start) p.start.reportingATC = r.codeRepAtcStart;
        if (p.end) p.end.reportingATC = r.codeRepAtcEnd;
        set('level', { U: 'UPPER', L: 'LOWER', B: 'BOTH' }[r.codeLvl] || r.codeLvl);
        set('navigationType', r.codeType); set('requiredNavigationPerformance', r.codeRnp); set('pathType', r.codeTypePath);
        var ru = limit45(r, 'Upper'), rl = limit45(r, 'Lower'), rm = limit45(r, 'Mnm');
        set('upperLimit', ru.lim); set('upperLimitReference', ru.ref); set('lowerLimit', rl.lim); set('lowerLimitReference', rl.ref);
        set('minimumObstacleClearanceAltitude', rm.lim);
        set('trueTrack', r.valTrueTrack); set('magneticTrack', r.valMagTrack); set('reverseTrueTrack', r.valReversTrueTrack); set('reverseMagneticTrack', r.valReversMagTrack);
        set('length', uv(r.valLen, r.uomDist)); set('_width', uv(r.valWid, r.uomWid)); set('_class', r.codeClassAcft); set('_fltRule', r.codeTypeFltRule);
        if (rmk) p.annotation = rmk;
        break;
      case 'Obs':
        set('name', r.txtName); set('type', r.txtDescrType); set('lighted', r.codeLgt); set('group', r.codeGroup);
        var loc = pt45(Object.assign({}, r, { geoLat: u.geoLat, geoLong: u.geoLong }));
        p.part = { _t: 'VerticalStructurePart', horizontalProjection_location: loc, verticalExtent: uv(r.valHgt, r.uomDistVer) };
        if (r.txtDescrLgt) p.part.lighting = { _t: 'LightElement', _descr: r.txtDescrLgt };
        if (r.txtDescrMarking) p.part.markingPattern = r.txtDescrMarking;
        if (rmk) p.annotation = rmk;
        break;
      case 'Uni':
        set('name', u.txtName); set('type', r.codeType); set('designator', r.codeId); set('compliantICAO', r.codeClass);
        if (r.AhpUid) p.airportLocation = { ref: uidKey('AhpUid', r.AhpUid) };
        if (r.OrgUid) p.ownerOrganisation = { ref: uidKey('OrgUid', r.OrgUid) };
        set('position', pt45(r));
        if (rmk) p.annotation = rmk;
        break;
      case 'Ser':
        k = SVC45[u.codeType] || 'InformationService';
        set('type', u.codeType); set('_seq', u.noSeq);
        if (u.UniUid) p.serviceProvider = { ref: uidKey('UniUid', u.UniUid) };
        set('location', pt45(r));
        if (r.Stt) p._hours = r.Stt;
        if (rmk) p.annotation = rmk;
        break;
      case 'Fqy':
        if (u.SerUid) p._service = { ref: uidKey('SerUid', u.SerUid) };
        set('frequencyTransmission', uv(u.valFreqTrans, r.uomFreq)); set('frequencyReception', uv(r.valFreqRec, r.uomFreq));
        set('_type', r.codeType); set('emissionType', r.codeEm); set('selectiveCall', r.codeSelcal);
        if (r.Cdl) p._callsign = r.Cdl;
        if (r.Ftt) p._hours = r.Ftt;
        if (rmk) p.annotation = rmk;
        break;
      case 'Org':
        set('name', u.txtName); set('designator', r.codeId); set('type', r.codeType);
        if (rmk) p.annotation = rmk;
        break;
      case 'Twy':
        set('designator', u.txtDesig); set('type', r.codeType); ref('associatedAirportHeliport', 'AhpUid');
        set('width', uv(r.valWid, r.uomWid));
        if (r.codeStrength || r.txtDescrStrength) p.surfaceProperties = { _t: 'SurfaceCharacteristics', _strength: [r.codeStrength, r.txtDescrStrength].filter(Boolean).join(' ') };
        p.annotation = [note45(r.txtMarking, 'marking'), rmk].filter(Boolean);
        break;
      case 'Apn':
        set('name', u.txtName); ref('associatedAirportHeliport', 'AhpUid');
        if (r.codeStrength || r.txtDescrStrength) p.surfaceProperties = { _t: 'SurfaceCharacteristics', _strength: [r.codeStrength, r.txtDescrStrength].filter(Boolean).join(' ') };
        p.annotation = [note45(r.txtMarking, 'marking'), note45(r.txtLgt, 'lighting'), rmk].filter(Boolean);
        break;
      case 'Tla':
        set('designator', u.txtDesig); set('location', pt45(r)); set('length', uv(r.valLen, r.uomDim)); set('width', uv(r.valWid, r.uomDim));
        set('slope', r.valSlope); set('helicopterClass', r.codeClassHel);
        if (r.codeStrength || r.txtDescrStrength) p.surfaceProperties = { _t: 'SurfaceCharacteristics', _strength: [r.codeStrength, r.txtDescrStrength].filter(Boolean).join(' ') };
        if (u.FtoUid) p.aimingPoint = { ref: uidKey('FtoUid', u.FtoUid) };
        p.annotation = [note45(r.txtMarking, 'marking'), rmk].filter(Boolean);
        break;
      case 'Ahs':
        set('type', u.codeType || r.codeCat); set('_category', r.codeCat); set('_facility', r.txtDescrFac);
        if (r.Ast) p._hours = r.Ast;
        if (rmk) p.annotation = rmk;
        break;
      case 'Agl':
        set('name', u.txtName); set('type', r.txtDescrCharact); set('location', pt45(r));
        if (rmk) p.annotation = rmk;
        break;
      case 'Iap': case 'Sid': case 'Sia':
        set('designator', u.txtDesig); set('name', u.txtDesig); set('_codeTypeRte', r.codeTypeRte); set('_rnp', r.codeRnp);
        if (u.AhpUid) p.airportHeliport = { ref: uidKey('AhpUid', u.AhpUid) };
        if (r.RdnUid) p._runwayDirection = { ref: uidKey('RdnUid', r.RdnUid) };
        p.annotation = [note45(r.txtDescr), note45(r.txtDescrComFail, 'communicationFailureInstruction'), note45(r.txtDescrMiss, 'missedApproach'), rmk].filter(Boolean);
        break;
      // ---- relations and secondary features, merged into their owner in MODEL.link45
      case 'Aha': case 'Oaa': case 'Uas': case 'Aga': {
        k = '45:' + s;
        var own45 = { Aha: 'AhpUid', Oaa: 'OrgUid', Uas: 'UniUid', Aga: 'AhsUid' }[s];
        if (u[own45]) p._contactOf = { ref: uidKey(own45, u[own45]) };
        var ci = contact45(u.codeType, r.txtAddress, r.txtRmk);
        if (ci) p._contact = ci;
        break;
      }
      case 'Ahu':
        k = '45:Ahu';
        if (u.AhpUid) p._usageOf = { ref: uidKey('AhpUid', u.AhpUid) };
        p._usage = arr(r.UsageLimitation).map(usage45);
        break;
      case 'Ana': {
        k = '45:Ana';
        var nk = ['VorUid', 'DmeUid', 'NdbUid', 'TcnUid', 'MkrUid'].filter(function (x) { return u[x]; })[0];
        if (nk) p._navOf = { ref: uidKey(nk, u[nk]) };
        if (rmk) p.annotation = rmk;
        break;
      }
      case 'Aho': case 'Rdo': case 'Fdo':
        k = '45:' + s;
        if (u.ObsUid) p._obsOf = { ref: uidKey('ObsUid', u.ObsUid) };
        if (s !== 'Aho') p._obsNote = [r.codeTypeOps, r.valDistThr ? 'THR ' + r.valDistThr + ' ' + (r.uomDistHorz || '') : '', r.valDistAlongCline ? 'along CL ' + r.valDistAlongCline + ' ' + (r.uomDistHorz || '') : '',
          r.valDistToCline ? 'from CL ' + r.valDistToCline + ' ' + (r.uomDistHorz || '') : '', r.valBrgThr ? 'BRG ' + r.valBrgThr + '°' : ''].filter(Boolean).join(', ');
        if (rmk) p.annotation = rmk;
        break;
      case 'Sah':
        k = '45:Sah';
        if (u.SerUid) p._svcOf = { ref: uidKey('SerUid', u.SerUid) };
        if (rmk) p.annotation = rmk;
        break;
      case 'Ful': case 'Oil': case 'Oxg': case 'Ntg': {
        k = 'AirportSuppliesService';
        var supply = { Ful: ['fuelSupply', 'Fuel'], Oil: ['oilSupply', 'Oil'], Oxg: ['oxygenSupply', 'Oxygen'], Ntg: ['nitrogenSupply', 'Nitrogen'] }[s];
        p[supply[0]] = { _t: supply[1] }; p[supply[0]][s === 'Ful' || s === 'Oil' ? 'category' : 'type'] = u.codeCat || u.codeType;
        p.annotation = [note45(r.txtDescr), rmk].filter(Boolean);
        break;
      }
      case 'Pfy':
        k = 'PassengerService';
        set('type', u.codeType);
        p.annotation = [note45(r.txtDescr), rmk].filter(Boolean);
        break;
      case 'Rda': case 'Fda':
        k = 'ApproachLightingSystem';
        if (u.RdnUid) p.servedRunwayDirection = { ref: uidKey('RdnUid', u.RdnUid) };
        if (u.FdnUid) p.servedRunwayDirection = { ref: uidKey('FdnUid', u.FdnUid) };
        set('classICAO', u.codeType); set('length', uv(r.valLen, r.uomLen)); set('intensityLevel', r.codeIntst); set('sequencedFlashing', r.codeSequencedFlash);
        p.annotation = [note45(r.txtDescrFlash, 'sequencedFlashing'), note45(r.txtDescr), rmk].filter(Boolean);
        break;
      case 'Swy': case 'Rpa':
        k = 'RunwayProtectArea';
        set('type', s === 'Swy' ? 'STOPWAY' : u.codeType);
        if (u.RdnUid) p.protectedRunwayDirection = { ref: uidKey('RdnUid', u.RdnUid) };
        set('length', uv(r.valLen, r.uomDim)); set('width', uv(r.valWid, r.uomDim));
        if (r.codeComposition || r.codeStrength || r.txtDescrStrength) p.surfaceProperties = { _t: 'SurfaceCharacteristics', composition: r.codeComposition, _strength: [r.codeStrength, r.txtDescrStrength].filter(Boolean).join(' ') || undefined };
        p.annotation = [note45(r.txtProfile, 'profile'), note45(r.txtMarking, 'marking'), rmk].filter(Boolean);
        break;
      case 'Tly':
        k = 'TaxiwayLightSystem';
        if (u.TwyUid) p.lightedTaxiway = { ref: uidKey('TwyUid', u.TwyUid) };
        set('position', u.codePsn); set('colour', r.codeColour); set('intensityLevel', r.codeIntst);
        p.annotation = [note45(r.txtDescr), note45(r.txtDescrEmerg, 'emergencyLighting'), rmk].filter(Boolean);
        break;
      case 'Spd':
        k = 'SpecialDate';
        set('type', u.codeType); set('dateDay', u.dateDay); set('dateYear', u.dateYear); set('name', r.txtName);
        if (u.OrgUid) p.authority = { ref: uidKey('OrgUid', u.OrgUid) };
        if (rmk) p.annotation = rmk;
        break;
      case 'Gsd':
        k = 'AircraftStand';
        set('designator', u.txtDesig); set('type', r.codeType);
        if (u.ApnUid) p.apronLocation = { ref: uidKey('ApnUid', u.ApnUid) };
        if (r.geoLat && r.geoLong) set('location', pt45(r));
        if (rmk) p.annotation = rmk;
        break;
      case 'Ahc':
        k = 'AirportHeliportCollocation';
        if (u.AhpUid1) p.hostAirport = { ref: uidKey('AhpUid', u.AhpUid1) };
        if (u.AhpUid2) p.dependentAirport = { ref: uidKey('AhpUid', u.AhpUid2) };
        set('type', r.codeType);
        p.annotation = [note45(r.txtDescr), rmk].filter(Boolean);
        break;
      case 'Vli': case 'Dli': case 'Nli': case 'Tli': {
        k = '45:' + s;
        var ek = { Vli: 'VorUid', Dli: 'DmeUid', Nli: 'NdbUid', Tli: 'TcnUid' }[s];
        if (u[ek]) p._limitOf = { ref: uidKey(ek, u[ek]) };
        p._limitText = ['Usage limitation' + (u.codeType ? ' (' + u.codeType + ')' : '') + ':'].concat(arr(r.UsageLimit).map(limitText45), r.txtRmk ? [r.txtRmk] : []).join(' ');
        break;
      }
      default:
        k = '45:' + s;
    }
    if (p.annotation && Array.isArray(p.annotation) && !p.annotation.length) delete p.annotation;
    // generic: owning aerodrome (first nested AhpUid) for every 4.5 feature
    var ahp = findUid(r, 'AhpUid');
    if (ahp && s !== 'Ahp') p._ad = { ref: uidKey('AhpUid', ahp) };
    return { k: k || '45:' + s, p: p };
  }
  function findUid(o, name, depth) {
    depth = depth || 0;
    if (!o || typeof o !== 'object' || depth > 6) return null;
    if (o[name] && typeof o[name] === 'object' && !Array.isArray(o[name])) return o[name];
    for (var k in o) {
      var v = o[k];
      if (v && typeof v === 'object') {
        var items = arr(v);
        for (var i = 0; i < items.length; i++) { var f = findUid(items[i], name, depth + 1); if (f) return f; }
      }
    }
    return null;
  }
  function border45(r, open) {
    var ring = [], parts = [];
    if (r.Circle) {
      var c = r.Circle, cc = [parse45Coord(c.geoLongCen, true), parse45Coord(c.geoLatCen, false)];
      if (!isNaN(cc[0]) && !isNaN(cc[1])) {
        var rv = parseFloat(c.valRadius);
        parts.push({ k: 'circle', c: cc, r: rv, u: c.uomRadius || 'NM' });
        return { t: 'A', c: [circlePts(cc, toNM(rv, c.uomRadius))], d: parts };
      }
    }
    var v = arr(r.Avx);
    for (var i = 0; i < v.length; i++) {
      var a = v[i], p = [parse45Coord(a.geoLong, true), parse45Coord(a.geoLat, false)];
      if (isNaN(p[0]) || isNaN(p[1])) continue;
      var t = a.codeType;
      if ((t === 'CWA' || t === 'CCA') && a.geoLatArc) {
        var cen = [parse45Coord(a.geoLongArc, true), parse45Coord(a.geoLatArc, false)];
        var nxt = v[(i + 1) % v.length];
        var q = nxt ? [parse45Coord(nxt.geoLong, true), parse45Coord(nxt.geoLat, false)] : p;
        var rNM = a.valRadiusArc ? toNM(parseFloat(a.valRadiusArc), a.uomRadiusArc) : distNM(cen, p);
        pushPts(ring, [p]);
        pushPts(ring, arcPts(cen, rNM, bearing(cen, p), bearing(cen, q), t === 'CWA'));
        parts.push({ k: 'gc', p: [p] });
        parts.push({ k: 'arc', c: cen, r: a.valRadiusArc ? parseFloat(a.valRadiusArc) : +rNM.toFixed(2), u: a.uomRadiusArc || 'NM', cw: t === 'CWA' });
      } else {
        pushPts(ring, [p]);
        if (t === 'FNT') parts.push({ k: 'border' }); parts.push({ k: t === 'RHL' ? 'rhumb' : 'gc', p: [p] });
      }
    }
    if (!ring.length) return null;
    if (!open) closeRing(ring);
    return { t: 'A', c: [ring], d: parts };
  }
  function convFeature45(node, ctx, chg) {
    var s = node.n, r = raw45(node);
    var uidName = s + 'Uid', u = r[uidName];
    var id = u && typeof u === 'object' ? uidKey(uidName, u) : s + '#' + hash(JSON.stringify(r)).slice(0, 10);
    var ad = adapt45(s, r);
    var ts = { i: ctx.isUpdate ? (chg === 'Withdrawn' ? 'WITHDRAWN' : 'PERMDELTA') : 'BASELINE', s: 1, c: 0, b: ctx.effective || null, e: null, p: ad.p };
    var rec = { k: ad.k, s45: s, id: id, ts: [ts], raw: r };
    if (u && u['@mid']) rec.mid = u['@mid'];
    if (chg) rec.chg = chg;
    return rec;
  }

  /* ------------------------------------------------------------ temporality */
  // AIXM times are UTC. A date-time without zone ("2026-10-29T00:00:00") would be read as local time by
  // Date.parse (a laptop at UTC+3 would move it to the previous day and AIRAC cycle), so add the "Z".
  var NO_ZONE = /T\d\d:\d\d(:\d\d(\.\d+)?)?$/;
  function tms(s) { if (!s) return null; if (typeof s === 'number') return s; var t = Date.parse(NO_ZONE.test(s) ? s + 'Z' : s); return isNaN(t) ? null : t; }
  function mergeProps(a, b) { var o = {}, k; for (k in a) o[k] = a[k]; for (k in b) o[k] = b[k]; return o; }
  /* Resolve the effective state of a feature at time t (ms) or latest (t==null). */
  function resolve(rec, t) {
    var ts = rec.ts;
    if (!ts.length) return { p: {}, b: null, e: null, i: null, s: 0, c: 0, idx: -1, empty: true };
    if (ts.length === 1 && ts[0].i !== 'TEMPDELTA') return { p: ts[0].p, b: ts[0].b, e: ts[0].e, i: ts[0].i, s: ts[0].s, c: ts[0].c, idx: 0 };
    var perm = [], temp = [];
    for (var i = 0; i < ts.length; i++) (ts[i].i === 'TEMPDELTA' ? temp : perm).push(i);
    perm.sort(function (x, y) {
      var a = ts[x], b = ts[y], ta = tms(a.b) || 0, tb = tms(b.b) || 0;
      return ta - tb || a.s - b.s || a.c - b.c;
    });
    var cur = null, curIdx = -1, props = null;
    for (var j = 0; j < perm.length; j++) {
      var x = ts[perm[j]], bt = tms(x.b);
      if (t !== null && t !== undefined && bt !== null && bt > t) break;
      if (x.i === 'PERMDELTA' && props) props = mergeProps(props, x.p);
      else props = x.p;
      cur = x; curIdx = perm[j];
    }
    if (!cur && perm.length && (t === null || t === undefined)) { cur = ts[perm[perm.length - 1]]; curIdx = perm[perm.length - 1]; props = cur.p; }
    if (!cur) { // only temporary deltas, or nothing valid yet at t
      var z = perm.length ? ts[perm[0]] : ts[0];
      return { p: z.p, b: z.b, e: z.e, i: z.i, s: z.s, c: z.c, idx: ts.indexOf(z), future: true };
    }
    var out = { p: props, b: cur.b, e: cur.e, i: cur.i, s: cur.s, c: cur.c, idx: curIdx };
    if (t !== null && t !== undefined) {
      var ended = tms(cur.e);
      if (ended !== null && ended <= t) out.ended = true;
      for (var k = 0; k < temp.length; k++) {
        var d = ts[temp[k]], db = tms(d.b), de = tms(d.e);
        if ((db === null || db <= t) && (de === null || de > t)) { out.p = mergeProps(out.p, d.p); out.temp = (out.temp || []).concat(temp[k]); }
      }
    }
    return out;
  }

  /* ------------------------------------------------------ flatten & diffs */
  function geoSig(g) {
    if (!g) return '';
    if (g.t === 'P') return g.c[1].toFixed(6) + ',' + g.c[0].toFixed(6);
    var s = JSON.stringify(g.c, function (k, v) { return typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v; });
    return g.t + ':' + (g.t === 'A' ? g.c[0].length : g.c.length) + 'pts:' + hash(s).slice(0, 8);
  }
  function valStr(v) {
    if (v === null || v === undefined) return '';
    if (typeof v !== 'object') return String(v);
    if (v.ref !== undefined) return '→' + v.ref;
    if (v.nil !== undefined) return 'NIL(' + v.nil + ')';
    if (v.v !== undefined) return v.v + (v.u ? ' ' + v.u : '');
    return null;
  }
  function flatten(p, prefix, out, skipKeys) {
    out = out || {};
    prefix = prefix || '';
    for (var k in p) {
      if (skipKeys && skipKeys[k]) continue;
      var v = p[k], path = prefix ? prefix + '/' + k : k;
      if (k === '_t' || k === '_na' || k === 'timeSliceMetadata' || k === 'featureMetadata') continue; // ISO 19115 metadata is not aeronautical data
      if (k === '_geo') { out[path] = geoSig(v); continue; }
      if (Array.isArray(v)) {
        var items = v.map(function (x) { var o = {}; if (x && typeof x === 'object' && valStr(x) === null) flatten(x, '', o); else o[''] = valStr(x); return o; });
        var sigs = items.map(function (o) { return JSON.stringify(o); });
        var order = sigs.map(function (s, i) { return i; }).sort(function (a, b) { return sigs[a] < sigs[b] ? -1 : sigs[a] > sigs[b] ? 1 : 0; });
        for (var i = 0; i < order.length; i++) {
          var o = items[order[i]], ip = path + '[' + (i + 1) + ']';
          for (var q in o) out[q ? ip + '/' + q : ip] = o[q];
        }
        continue;
      }
      var s = valStr(v);
      if (s !== null) { out[path] = s; continue; }
      flatten(v, path, out);
    }
    return out;
  }
  function fingerprint(p) {
    var f = flatten(p), keys = Object.keys(f).sort(), s = '';
    for (var i = 0; i < keys.length; i++) s += keys[i] + '=' + f[keys[i]] + '\n';
    return hash(s);
  }
  function diffFlat(a, b) {
    var out = [], k;
    for (k in a) if (!(k in b)) out.push({ path: k, old: a[k], neu: undefined });
    else if (a[k] !== b[k]) out.push({ path: k, old: a[k], neu: b[k] });
    for (k in b) if (!(k in a)) out.push({ path: k, old: undefined, neu: b[k] });
    out.sort(function (x, y) { return x.path < y.path ? -1 : x.path > y.path ? 1 : 0; });
    return out;
  }

  /* --------------------------------------------------------------- AIRAC */
  var AIRAC_REF = Date.UTC(2024, 0, 25), DAY = 86400000;
  function airac(ms) {
    if (ms === null || ms === undefined || isNaN(ms)) return null;
    var d = Math.floor((ms - AIRAC_REF) / DAY), n = Math.floor(d / 28);
    var eff = AIRAC_REF + n * 28 * DAY, y = new Date(eff).getUTCFullYear();
    var k = Math.ceil((Date.UTC(y, 0, 1) - AIRAC_REF) / DAY / 28), firstEff = AIRAC_REF + k * 28 * DAY;
    var num = Math.round((eff - firstEff) / DAY / 28) + 1;
    return { id: String(y % 100).padStart(2, '0') + String(num).padStart(2, '0'), date: eff, exact: ms === eff, next: eff + 28 * DAY };
  }

  /* --------------------------------------------------------- ICAO states */
  var ICAO_PREFIX = {
    AG: 'Solomon Islands', AN: 'Nauru', AY: 'Papua New Guinea', BG: 'Greenland (Denmark)', BI: 'Iceland', BK: 'Kosovo',
    DA: 'Algeria', DB: 'Benin', DF: 'Burkina Faso', DG: 'Ghana', DI: "Côte d'Ivoire", DN: 'Nigeria', DR: 'Niger', DT: 'Tunisia', DX: 'Togo',
    EA: 'Donlon (fictitious AIXM sample State)', EB: 'Belgium', ED: 'Germany', EE: 'Estonia', EF: 'Finland', EG: 'United Kingdom', EH: 'Netherlands', EI: 'Ireland',
    EK: 'Denmark', EL: 'Luxembourg', EN: 'Norway', EP: 'Poland', ES: 'Sweden', ET: 'Germany (military)', EV: 'Latvia', EY: 'Lithuania',
    FA: 'South Africa', FB: 'Botswana', FC: 'Congo', FD: 'Eswatini', FE: 'Central African Republic', FG: 'Equatorial Guinea', FH: 'Saint Helena, Ascension and Tristan da Cunha',
    FI: 'Mauritius', FJ: 'British Indian Ocean Territory', FK: 'Cameroon', FL: 'Zambia', FM: 'Madagascar', FN: 'Angola', FO: 'Gabon', FP: 'Sao Tome and Principe',
    FQ: 'Mozambique', FS: 'Seychelles', FT: 'Chad', FV: 'Zimbabwe', FW: 'Malawi', FX: 'Lesotho', FY: 'Namibia', FZ: 'Democratic Republic of the Congo',
    GA: 'Mali', GB: 'Gambia', GC: 'Spain (Canary Islands)', GE: 'Spain (Ceuta and Melilla)', GF: 'Sierra Leone', GG: 'Guinea-Bissau', GL: 'Liberia', GM: 'Morocco',
    GO: 'Senegal', GQ: 'Mauritania', GS: 'Western Sahara', GU: 'Guinea', GV: 'Cabo Verde',
    HA: 'Ethiopia', HB: 'Burundi', HC: 'Somalia', HD: 'Djibouti', HE: 'Egypt', HH: 'Eritrea', HJ: 'South Sudan', HK: 'Kenya', HL: 'Libya', HR: 'Rwanda', HS: 'Sudan', HT: 'Tanzania', HU: 'Uganda',
    LA: 'Albania', LB: 'Bulgaria', LC: 'Cyprus', LD: 'Croatia', LE: 'Spain', LF: 'France', LG: 'Greece', LH: 'Hungary', LI: 'Italy', LJ: 'Slovenia', LK: 'Czech Republic',
    LL: 'Israel', LM: 'Malta', LN: 'Monaco', LO: 'Austria', LP: 'Portugal', LQ: 'Bosnia and Herzegovina', LR: 'Romania', LS: 'Switzerland', LT: 'Türkiye', LU: 'Moldova',
    LV: 'Palestine', LW: 'North Macedonia', LX: 'Gibraltar', LY: 'Serbia', LZ: 'Slovakia',
    MB: 'Turks and Caicos Islands', MD: 'Dominican Republic', MG: 'Guatemala', MH: 'Honduras', MK: 'Jamaica', MM: 'Mexico', MN: 'Nicaragua', MP: 'Panama', MR: 'Costa Rica',
    MS: 'El Salvador', MT: 'Haiti', MU: 'Cuba', MW: 'Cayman Islands', MY: 'Bahamas', MZ: 'Belize',
    NC: 'Cook Islands', NF: 'Fiji', NG: 'Kiribati', NI: 'Niue', NL: 'Wallis and Futuna', NS: 'Samoa', NT: 'French Polynesia', NV: 'Vanuatu', NW: 'New Caledonia', NZ: 'New Zealand',
    OA: 'Afghanistan', OB: 'Bahrain', OE: 'Saudi Arabia', OI: 'Iran', OJ: 'Jordan', OK: 'Kuwait', OL: 'Lebanon', OM: 'United Arab Emirates', OO: 'Oman', OP: 'Pakistan',
    OR: 'Iraq', OS: 'Syria', OT: 'Qatar', OY: 'Yemen',
    PA: 'United States (Alaska)', PB: 'United States (Baker Island)', PC: 'Kiribati (Phoenix Islands)', PF: 'United States (Alaska)', PG: 'United States (Guam, Northern Mariana Islands)',
    PH: 'United States (Hawaii)', PJ: 'United States (Johnston Atoll)', PK: 'Marshall Islands', PL: 'Kiribati (Line Islands)', PM: 'United States (Midway)',
    PO: 'United States (Alaska)', PP: 'United States (Alaska)', PT: 'Micronesia', PW: 'United States (Wake Island)',
    RC: 'Taiwan', RJ: 'Japan', RK: 'Republic of Korea', RO: 'Japan (Okinawa)', RP: 'Philippines',
    SA: 'Argentina', SB: 'Brazil', SC: 'Chile', SD: 'Brazil', SE: 'Ecuador', SF: 'Falkland Islands', SG: 'Paraguay', SI: 'Brazil', SJ: 'Brazil', SK: 'Colombia', SL: 'Bolivia',
    SM: 'Suriname', SN: 'Brazil', SO: 'French Guiana', SP: 'Peru', SS: 'Brazil', SU: 'Uruguay', SV: 'Venezuela', SW: 'Brazil', SY: 'Guyana',
    TA: 'Antigua and Barbuda', TB: 'Barbados', TD: 'Dominica', TF: 'France (Antilles)', TG: 'Grenada', TI: 'United States Virgin Islands', TJ: 'Puerto Rico',
    TK: 'Saint Kitts and Nevis', TL: 'Saint Lucia', TN: 'Netherlands Caribbean (Aruba, Curaçao, Sint Maarten, BES)', TQ: 'Anguilla', TR: 'Montserrat',
    TT: 'Trinidad and Tobago', TU: 'British Virgin Islands', TV: 'Saint Vincent and the Grenadines', TX: 'Bermuda',
    UA: 'Kazakhstan', UB: 'Azerbaijan', UC: 'Kyrgyzstan', UD: 'Armenia', UG: 'Georgia', UK: 'Ukraine', UM: 'Belarus', UT: 'Uzbekistan',
    VA: 'India', VC: 'Sri Lanka', VD: 'Cambodia', VE: 'India', VG: 'Bangladesh', VH: 'Hong Kong, China', VI: 'India', VL: 'Laos', VM: 'Macao, China', VN: 'Nepal',
    VO: 'India', VQ: 'Bhutan', VR: 'Maldives', VT: 'Thailand', VV: 'Viet Nam', VY: 'Myanmar',
    WA: 'Indonesia', WB: 'Malaysia', WI: 'Indonesia', WM: 'Malaysia', WP: 'Timor-Leste', WQ: 'Indonesia', WR: 'Indonesia', WS: 'Singapore',
    ZK: "Democratic People's Republic of Korea", ZM: 'Mongolia'
  };
  var ICAO_PREFIX3 = { FMC: 'Comoros', FME: 'France (Réunion)', FMM: 'Madagascar', FMN: 'Madagascar', FMS: 'Madagascar', NFT: 'Tonga', NGF: 'Tuvalu',
    NST: 'American Samoa', PTR: 'Palau', UMK: 'Russian Federation (Kaliningrad)', UTA: 'Turkmenistan', UTD: 'Tajikistan', UTK: 'Uzbekistan', UTN: 'Uzbekistan',
    UTS: 'Uzbekistan', UTT: 'Uzbekistan', WBS: 'Brunei Darussalam', LYP: 'Montenegro', LYT: 'Montenegro' };
  var ICAO_LETTER = { K: 'United States', C: 'Canada', Y: 'Australia', Z: 'China', U: 'Russian Federation' };
  function stateFromICAO(code) {
    if (!code || !/^[A-Z]{4}$/.test(code)) return null;
    return ICAO_PREFIX3[code.slice(0, 3)] || ICAO_PREFIX[code.slice(0, 2)] || ICAO_LETTER[code[0]] || null;
  }
  function icaoPrefixOf(code) {
    if (!code || !/^[A-Z]{4}$/.test(code)) return null;
    if (ICAO_PREFIX3[code.slice(0, 3)]) return code.slice(0, 3);
    if (ICAO_PREFIX[code.slice(0, 2)]) return code.slice(0, 2);
    return code[0];
  }

  return {
    arr: arr, first: first, hash: hash, decodeEnt: decodeEnt,
    parseXml: parseXml, textOf: textOf, attr: attr, child: child, desc: desc,
    sniff: sniff, convFeature5: convFeature5, convFeature45: convFeature45, uidKey: uidKey,
    parse45Coord: parse45Coord, dms: dms, fmtPos: fmtPos, toNM: toNM, dest: dest, distNM: distNM, bearing: bearing,
    arcPts: arcPts, circlePts: circlePts, resolve: resolve, mergeProps: mergeProps, tms: tms, flatten: flatten, fingerprint: fingerprint, diffFlat: diffFlat,
    valStr: valStr, geoSig: geoSig, airac: airac, stateFromICAO: stateFromICAO, icaoPrefixOf: icaoPrefixOf, normRef: normRef,
    GML_NS_RE: GML_NS_RE, AIXM5_RE: AIXM5_RE, FROM45: FROM45
  };
})();
if (typeof module !== 'undefined') module.exports = AX;
