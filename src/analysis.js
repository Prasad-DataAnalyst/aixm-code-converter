/* =============================================================================
 * AIXM Code Converter - analysis: in-file changes (temporality), comparison of
 * two data sets (same State, any versions) and data quality checks.
 * ========================================================================== */
/* global AX, MODEL, AIP */
var ANALYSIS = (function () {
  'use strict';
  var M = MODEL, s = M.s, arr = AX.arr;

  function yieldUI() { return new Promise(function (r) { setTimeout(r, 0); }); }
  function prettyPath(p) {
    return p.replace(/\[(\d+)\]/g, ' #$1').split('/').map(function (x) {
      return x.replace(/^_/, '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
    }).join(' › ');
  }
  function displayVal(ds, v) {
    if (v === undefined) return '';
    if (typeof v === 'string' && v.charAt(0) === '→') {
      var t = M.target(ds, v.slice(1));
      return t ? '→ ' + M.label(ds, t) : v;
    }
    if (typeof v === 'string' && /^-?\d+\.\d+,-?\d+\.\d+$/.test(v)) {
      var c = v.split(',').map(Number);
      return AX.fmtPos([c[1], c[0]], 2);
    }
    return v;
  }

  /* ---------------------------------------------------------- in-file */
  function inFileChanges(ds) {
    var out = [];
    ds.recs.forEach(function (r) {
      var ts = r.ts;
      if (r.chg) {
        out.push({ rec: r, kind: r.chg === 'New' ? 'New feature' : r.chg === 'Withdrawn' ? 'Withdrawn' : 'Changed (AIXM 4.5 update)', from: ts[0].b, to: null,
          fields: r.chg === 'Changed' ? AX.diffFlat({}, AX.flatten(ts[0].p)) : [], tsIdx: 0 });
      }
      if (ts.length < 2 && ts[0] && ts[0].i !== 'TEMPDELTA' && ts[0].i !== 'PERMDELTA' && !ts[0].le) return;
      var perm = [], temp = [];
      ts.forEach(function (t, i) { (t.i === 'TEMPDELTA' ? temp : perm).push(i); });
      perm.sort(function (a, b) { var x = ts[a], y = ts[b]; return (AX.tms(x.b) || 0) - (AX.tms(y.b) || 0) || x.s - y.s || x.c - y.c; });
      var prevProps = null, prevIdx = -1;
      perm.forEach(function (i, n) {
        var t = ts[i], props = t.i === 'PERMDELTA' && prevProps ? Object.assign({}, prevProps, t.p) : t.p;
        if (n > 0 || t.i === 'PERMDELTA') {
          var prev = prevIdx >= 0 ? ts[prevIdx] : null;
          var kind = t.i === 'PERMDELTA' ? 'Permanent change (PERMDELTA)' : prev && prev.s === t.s && t.c > prev.c ? 'Correction' : 'Permanent change (new BASELINE)';
          var fields = t.i === 'PERMDELTA' && !prevProps ? AX.diffFlat({}, AX.flatten(t.p)) : AX.diffFlat(AX.flatten(prevProps || {}), AX.flatten(props));
          out.push({ rec: r, kind: kind, from: t.b, to: t.e, fields: fields, tsIdx: i, prevIdx: prevIdx });
        }
        prevProps = props; prevIdx = i;
      });
      temp.forEach(function (i) {
        var t = ts[i];
        var base = AX.resolve({ ts: ts.filter(function (x) { return x.i !== 'TEMPDELTA'; }) }, AX.tms(t.b));
        var bf = AX.flatten(base.p || {}), df = AX.flatten(t.p), fields = [];
        for (var k in df) if (bf[k] !== df[k]) fields.push({ path: k, old: bf[k], neu: df[k] });
        out.push({ rec: r, kind: 'Temporary change (TEMPDELTA)', from: t.b, to: t.e, fields: fields, tsIdx: i });
      });
      var last = perm.length ? ts[perm[perm.length - 1]] : null;
      if (last && last.le) out.push({ rec: r, kind: 'Feature withdrawn (end of life)', from: last.le, to: null, fields: [], tsIdx: perm[perm.length - 1] });
    });
    out.forEach(function (e) { e.section = AIP.sectionOf(ds, e.rec); e.t = AX.tms(e.from); });
    out.sort(function (a, b) { return (b.t || 0) - (a.t || 0); });
    return out;
  }

  /* ------------------------------------------------------------ compare */
  function naturalKey(ds, r) {
    var p = r.cur.p, own = ds.owner.get(r), ad = own ? M.shortName(own) : '';
    function pt() { var c = M.pointOf(ds, r); return c ? c[1].toFixed(3) + ',' + c[0].toFixed(3) : ''; }
    switch (r.k) {
      case 'AirportHeliport': return 'AD|' + (s(p.locationIndicatorICAO) || s(p.designator) || s(p.name));
      case 'Runway': return 'RWY|' + ad + '|' + s(p.designator);
      case 'RunwayDirection': return 'RDN|' + ad + '|' + s(p.designator);
      case 'Navaid': case 'VOR': case 'DME': case 'NDB': case 'TACAN': case 'MarkerBeacon': case 'Localizer': case 'Glidepath':
        return r.k + '|' + s(p.type) + '|' + s(p.designator) + '|' + (r.k === 'Glidepath' || r.k === 'MarkerBeacon' ? pt() : ad || pt().slice(0, 9));
      case 'DesignatedPoint': return 'DP|' + s(p.designator) + '|' + (s(p.designator) ? '' : pt());
      case 'Airspace': return 'AS|' + s(p.type) + '|' + (s(p.designator) || s(p.name));
      case 'Route': return 'RTE|' + M.routeDesignator(p) + '|' + s(p.locationDesignator);
      case 'RouteSegment': {
        var rt = M.target(ds, p.routeFormed);
        return 'RSG|' + (rt ? M.routeDesignator(rt.cur.p) : '') + '|' + M.segPointLabel(ds, arr(p.start)[0]) + '|' + M.segPointLabel(ds, arr(p.end)[0]);
      }
      case 'VerticalStructure': return 'OBS|' + (s(p.name) || s(p.designator)) + '|' + pt();
      case 'Unit': return 'UNIT|' + s(p.name) + '|' + s(p.type);
      case 'OrganisationAuthority': return 'ORG|' + s(p.name);
      case 'RadioCommunicationChannel': return 'RCC|' + ad + '|' + M.fFreq(r) + '|' + s(p.mode);
      default:
        var k = s(p.designator) || s(p.name);
        return r.k + '|' + ad + '|' + (k || '') + '|' + (k ? '' : pt()) + (k ? '' : '|' + s(p.type));
    }
  }
  function flatFor(ds, r) {
    if (r._flat && r._flatT === ds.viewDate) return r._flat;
    var f = AX.flatten(r.cur.p, '', {}, { _ad: 1 });
    var out = {};
    for (var k in f) {
      if (/(^|\/)(annotation|availability)\/.*\/(specialDateAuthority)/.test(k)) continue;
      var v = f[k];
      if (typeof v === 'string' && v.charAt(0) === '→') { var t = M.target(ds, v.slice(1)); if (t) v = '→' + t.k + ':' + naturalKey(ds, t); }
      out[k] = v;
    }
    r._flat = out; r._flatT = ds.viewDate;
    return out;
  }
  async function compare(dsA, dsB, onProgress) {
    var useUuid = dsA.family === '5' && dsB.family === '5';
    if (useUuid) {
      var hits = 0, sample = dsA.recs.slice(0, 2000);
      sample.forEach(function (r) { if (dsB.byId.has(r.id)) hits++; });
      useUuid = sample.length && hits / sample.length > 0.3;
    }
    function keysOf(ds) {
      var m = new Map();
      ds.recs.forEach(function (r) {
        if (r.k === '#error') return;
        var k = useUuid ? r.k + '#' + r.id : naturalKey(ds, r);
        var base = k, n = 2;
        while (m.has(k)) k = base + '~' + n++;
        m.set(k, r);
      });
      return m;
    }
    var A = keysOf(dsA), B = keysOf(dsB);
    var res = { useUuid: useUuid, items: [], stats: { added: 0, removed: 0, modified: 0, unchanged: 0 }, a: dsA, b: dsB };
    var keys = new Set(Array.from(A.keys()).concat(Array.from(B.keys())));
    var i = 0, total = keys.size;
    for (var k of keys) {
      var ra = A.get(k), rb = B.get(k);
      if (ra && !rb) { res.items.push({ kind: 'removed', a: ra, sec: AIP.sectionOf(dsA, ra) }); res.stats.removed++; }
      else if (!ra && rb) { res.items.push({ kind: 'added', b: rb, sec: AIP.sectionOf(dsB, rb) }); res.stats.added++; }
      else {
        var fa = flatFor(dsA, ra), fb = flatFor(dsB, rb);
        var d = AX.diffFlat(fa, fb);
        if (d.length) { res.items.push({ kind: 'modified', a: ra, b: rb, fields: d, sec: AIP.sectionOf(dsB, rb) }); res.stats.modified++; }
        else res.stats.unchanged++;
      }
      if (++i % 3000 === 0) { if (onProgress) onProgress(i / total); await yieldUI(); }
    }
    var order = { added: 0, modified: 1, removed: 2 };
    res.items.sort(function (x, y) { return (x.sec.no < y.sec.no ? -1 : x.sec.no > y.sec.no ? 1 : 0) || order[x.kind] - order[y.kind]; });
    return res;
  }

  /* ------------------------------------------------------------- quality */
  var FREQ_RANGES = { VOR: [108, 117.975, 'MHZ'], Localizer: [108.1, 111.975, 'MHZ'], Glidepath: [328.6, 335.4, 'MHZ'], NDB: [190, 1750, 'KHZ'] };
  function toMHz(q) { if (!q || q.v === undefined) return NaN; var v = parseFloat(q.v), u = String(q.u || '').toUpperCase(); return u === 'KHZ' ? v / 1000 : u === 'GHZ' ? v * 1000 : v; }
  async function quality(ds, onProgress) {
    var issues = [];
    function add(sev, rule, msg, r) { issues.push({ sev: sev, rule: rule, msg: msg, rec: r }); }
    (ds.parseErrors || []).forEach(function (e) { add('error', 'Parsing', 'Could not parse the XML fragment at byte ' + e.o + ': ' + e.err, e); });
    var unresolved = new Map();
    var D = M.dict();
    for (var i = 0; i < ds.recs.length; i++) {
      var r = ds.recs[i], p = r.cur.p;
      M.eachRef(p, function (ref, prop) {
        if (!M.target(ds, ref)) { var k = r.k + '.' + prop; unresolved.set(k, (unresolved.get(k) || []).concat([r])); }
      }, '', 0);
      // coordinates
      (function walk(v, depth) {
        if (!v || typeof v !== 'object' || depth > 8) return;
        if (Array.isArray(v)) { v.forEach(function (x) { walk(x, depth + 1); }); return; }
        if (v._geo) {
          var g = v._geo, pts = g.t === 'P' ? [g.c] : g.t === 'L' ? g.c : g.c[0];
          if (pts.some(function (c) { return typeof c[0] === 'number' && (Math.abs(c[1]) > 90 || Math.abs(c[0]) > 180 || isNaN(c[0]) || isNaN(c[1])); })) add('error', 'Coordinates', 'Coordinate outside the valid range', r);
          if (g.t === 'A' && g.c[0].length > 3) {
            var a = g.c[0][0], b = g.c[0][g.c[0].length - 1];
            if (typeof a[0] === 'number' && typeof b[0] === 'number' && (Math.abs(a[0] - b[0]) > 1e-7 || Math.abs(a[1] - b[1]) > 1e-7)) add('info', 'Geometry', 'Polygon ring is not closed (first and last point differ)', r);
          }
        }
        for (var k in v) if (k !== '_geo' && v[k] && typeof v[k] === 'object') walk(v[k], depth + 1);
      })(p, 0);
      // code lists
      if (D && r.k.indexOf('45:') !== 0) {
        var fd = D.v5.features[r.k];
        if (fd) for (var pk in p) {
          var pd = fd.p[pk], v = p[pk];
          if (!pd || typeof v !== 'string' || !D.v5.codes[pd.t]) continue;
          var cl = D.v5.codes[pd.t].v;
          if (!(v in cl) && v.indexOf('OTHER') !== 0) add('warning', 'Code list', 'Value "' + v + '" of ' + pk + ' is not in ' + pd.t, r);
        }
      }
      // mandatory AIP information
      switch (r.k) {
        case 'AirportHeliport':
          if (!p.ARP) add('warning', 'AD 2.2', 'Aerodrome without ARP coordinates', r);
          if (!s(p.locationIndicatorICAO) && !s(p.designator)) add('warning', 'AD 2.1', 'Aerodrome without location indicator', r);
          if (!p.fieldElevation) add('warning', 'AD 2.2', 'Aerodrome without field elevation', r);
          break;
        case 'Runway':
          if (!p.nominalLength) add('warning', 'AD 2.12', 'Runway without length', r);
          if (!ds.owner.get(r)) add('warning', 'AD 2.12', 'Runway not linked to an aerodrome', r);
          break;
        case 'RunwayDirection':
          if (!s(p.trueBearing)) add('info', 'AD 2.12', 'Runway direction without true bearing', r);
          break;
        case 'Airspace':
          if (!M.geometry(ds, r) && !(arr(p.geometryComponent).some(function (g) { return g && g.theAirspaceVolume && g.theAirspaceVolume.contributorAirspace; }))) add('warning', 'ENR 2', 'Airspace without horizontal geometry', r);
          if (!AIP.vertical(ds, r)) add('info', 'ENR 2', 'Airspace without vertical limits', r);
          break;
        case 'RouteSegment':
          if (!p.start || !p.end) add('error', 'ENR 3', 'Route segment without start or end point', r);
          else if (!M.segPoint(ds, arr(p.start)[0]) || !M.segPoint(ds, arr(p.end)[0])) add('warning', 'ENR 3', 'Route segment point cannot be located', r);
          break;
        case 'VOR': case 'Localizer': case 'Glidepath': case 'NDB': {
          var rg = FREQ_RANGES[r.k], f = toMHz(arr(p.frequency)[0]);
          if (rg && !isNaN(f)) { var lo = rg[2] === 'KHZ' ? rg[0] / 1000 : rg[0], hi = rg[2] === 'KHZ' ? rg[1] / 1000 : rg[1]; if (f < lo - 1e-9 || f > hi + 1e-9) add('warning', 'Frequency', r.k + ' frequency ' + M.fq(arr(p.frequency)[0]) + ' outside ' + rg[0] + '–' + rg[1] + ' ' + rg[2], r); }
          if (!p.location) add('warning', 'ENR 4.1', r.k + ' without position', r);
          break;
        }
        case 'DesignatedPoint':
          if (!p.location) add('warning', 'ENR 4.4', 'Designated point without coordinates', r);
          if (s(p.type) === 'ICAO' && s(p.designator) && !/^[A-Z]{5}$/.test(s(p.designator))) add('info', 'ENR 4.4', 'ICAO name-code designator should be 5 letters: ' + s(p.designator), r);
          break;
        case 'VerticalStructure':
          if (!M.pointOf(ds, r)) add('warning', 'ENR 5.4', 'Obstacle without position', r);
          break;
      }
      ['trueBearing', 'magneticBearing'].forEach(function (b) { var bv = parseFloat(s(p[b])); if (s(p[b]) && (isNaN(bv) || bv < 0 || bv > 360)) add('error', 'Bearing', b + ' outside 0–360: ' + s(p[b]), r); });
      // temporality
      var bl = r.ts.filter(function (t) { return t.i === 'BASELINE'; });
      for (var a1 = 0; a1 < bl.length; a1++) for (var a2 = a1 + 1; a2 < bl.length; a2++) {
        var x = bl[a1], y = bl[a2];
        if (x.s === y.s && x.c === y.c) add('error', 'Temporality', 'Two BASELINE time slices with the same sequence/correction number ' + x.s + '/' + x.c, r);
        var xb = AX.tms(x.b), xe = AX.tms(x.e), yb = AX.tms(y.b), ye = AX.tms(y.e);
        if (x.s !== y.s && xb !== null && yb !== null && (xe === null || xe > yb) && (ye === null || ye > xb) && xb !== yb) add('warning', 'Temporality', 'Overlapping BASELINE validity periods (sequence ' + x.s + ' and ' + y.s + ')', r);
      }
      if (i % 5000 === 0) { if (onProgress) onProgress(i / ds.recs.length); await yieldUI(); }
    }
    unresolved.forEach(function (list, k) {
      add('warning', 'References', list.length + ' reference(s) of ' + k + ' point to features that are not in this file', list[0]);
    });
    var rank = { error: 0, warning: 1, info: 2 };
    issues.sort(function (a, b) { return rank[a.sev] - rank[b.sev]; });
    return issues;
  }

  return { inFileChanges: inFileChanges, compare: compare, quality: quality, prettyPath: prettyPath, displayVal: displayVal, naturalKey: naturalKey };
})();
