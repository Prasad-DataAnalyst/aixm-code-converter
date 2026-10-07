/*!
 * AIXM Code Converter
 * Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com> - author of the AIXM Code Converter
 * SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE; keep this notice in all copies)
 * ==========================================================================
 * AIXM Code Converter - aerodrome mapping database checks (AMDB)
 * NOT FOR NAVIGATION - for study and analysis only.
 *
 * The aerodrome mapping features of the data loaded (AMXM 2.0 files, or the AIXM 5.x aerodrome features such
 * as runway, taxiway and apron elements, thresholds, stands, guidance lines and holding positions) are checked
 * against a catalogue of rules. Every rule names its source, so a finding can be traced to the requirement:
 *   Generic     attributes the AMXM 2.0.2 schema requires, code lists, identifiers, designators, dates
 *   Quality     declared accuracy, resolution and integrity against ICAO PANS-AIM (Doc 10066) Appendix 1
 *   Geometry    simple, closed polygons in the right direction, no spikes, slivers, overlaps or gaps
 *   Functional  thresholds on runways, stands on aprons, guidance lines on paved surfaces, connections
 *   Complete    the core feature types of an aerodrome
 * Rules taken from ED-99 / DO-272 (sold by EUROCAE / RTCA) are not reproduced: the checks follow the public
 * AMXM schema, ICAO documents and the EUROCONTROL supporting material for aerodrome mapping data sets, and cite
 * them. The results are an aid to the people responsible for the data, not a certification.
 *
 * This file has no user interface and does not touch the page: collect() (page) turns the loaded features into
 * plain objects, check() (a worker, with the JSTS geometry engine) runs the rules. The file and the engine are
 * stored unopened in the page and loaded only when the AMDB tools are used (src/lazy.js).
 * ========================================================================== */
/* global jsts */
var AMDB = (function () {
  'use strict';
  var D2R = Math.PI / 180, A = 6378137, E2 = 0.00669437999014;
  var RULES_VERSION = '1.0';

  /* ------------------------------------------------------------- the rules */
  // id, group, severity, title, source, why it matters
  var SRC = {
    xsd: 'AMXM 2.0.2 XML schema (RTCA / EUROCAE, public), the AMXM model of ED-119 / DO-291',
    aim: 'ICAO PANS-AIM (Doc 10066) Appendix 1 — aeronautical data catalogue (accuracy, resolution, integrity)',
    a14: 'ICAO Annex 14 Volume I',
    a15: 'ICAO Annex 15 / PANS-AIM 5.3.3.3 (aerodrome mapping data sets)',
    d7910: 'ICAO Doc 7910 — Location Indicators',
    sf: 'ISO 19107 / OGC Simple Features (ISO 19125-1) — valid polygons; GML 3.2 (ISO 19136)',
    acg: 'EUROCONTROL supporting material for ICAO aerodrome mapping data sets — Creation of AMD (coding rules)',
    q: 'ISO 19157 data quality — topological consistency',
    cat: 'EUROCONTROL supporting material for ICAO aerodrome mapping data sets — AMXM / AIXM feature correspondences'
  };
  var RULES = [
    ['G01', 'Generic', 'error', 'Attribute required by the AMXM schema is missing', 'xsd', 'Every AMXM attribute without minOccurs="0" must be given, or given as unknown / not applicable (nil with a reason).'],
    ['G02', 'Generic', 'error', 'Code value not in the AMXM code list', 'xsd', 'Receiving systems decode coded values from the code lists; an unknown value is lost or misread.'],
    ['G03', 'Generic', 'error', 'feattype does not match the feature type', 'xsd', 'feattype identifies the feature class in flat formats (GIS files, ARINC 816 conversions).'],
    ['G04', 'Generic', 'error', 'Identifier (idnumber) used twice', 'xsd', 'idnumber is the permanent unique identifier of a feature; updates and references depend on it.'],
    ['G05', 'Generic', 'warning', 'Aerodrome identifier (idarpt) is not a four-letter ICAO location indicator', 'd7910', 'Features are linked to their aerodrome by this indicator.'],
    ['G06', 'Generic', 'warning', 'Runway identifier (idrwy) not coded as both designators separated by a period, lower first', 'xsd', 'AMXM encodes a runway as "07L.25R"; other spellings break the link between runway features.'],
    ['G07', 'Generic', 'warning', 'Runway designators are not reciprocal', 'a14', 'The two ends of a runway differ by 18 (180°) and L / R swap (Annex 14, runway designation marking).'],
    ['G08', 'Generic', 'warning', 'Date and time not valid', 'xsd', 'revdate, stfeat, endfeat, stvalid and endvalid are xs:dateTime values (UTC).'],
    ['G09', 'Generic', 'warning', 'Value is not a number', 'xsd', 'Measures (accuracy, resolution, elevation, width, length …) must be numeric.'],
    ['G10', 'Generic', 'error', 'Value outside what the AMXM schema allows', 'xsd', 'The schema limits each value (range of a number, length of a text); a value outside it is rejected by a validating reader.'],
    ['Q01', 'Quality', 'warning', 'Declared horizontal accuracy is coarser than PANS-AIM requires', 'aim', 'The accuracy each data item needs is set by PANS-AIM Appendix 1 (e.g. runway threshold 1 m, holding position, taxiway and stand points 0.5 m).'],
    ['Q02', 'Quality', 'warning', 'Declared integrity is weaker than the data classification requires', 'aim', 'Critical data 1 × 10⁻⁸, essential 1 × 10⁻⁵, routine 1 × 10⁻³.'],
    ['Q03', 'Quality', 'warning', 'Publication resolution is coarser than the declared accuracy', 'aim', 'A resolution coarser than the accuracy throws away accuracy that was surveyed.'],
    ['Q04', 'Quality', 'info', 'No data quality given (accuracy, integrity or source)', 'aim', 'Without them a user cannot tell whether the data meets the need.'],
    ['X01', 'Geometry', 'error', 'Position out of range or at 0°N 0°E', 'sf', 'Coordinates are WGS-84 latitude / longitude; 0,0 is a usual placeholder for a missing position.'],
    ['X02', 'Geometry', 'error', 'Polygon boundary not closed', 'sf', 'A GML LinearRing ends where it starts.'],
    ['X03', 'Geometry', 'error', 'Polygon boundary with fewer than four positions', 'sf', 'A ring needs at least three distinct corners and the closing position.'],
    ['X04', 'Geometry', 'error', 'Polygon boundary crosses itself', 'sf', 'A self-crossing ring has no well-defined inside: areas, overlaps and containment become wrong.'],
    ['X05', 'Geometry', 'warning', 'Polygon boundary in the wrong direction', 'acg', 'Outer boundaries counter-clockwise, inner boundaries (holes) clockwise.'],
    ['X06', 'Geometry', 'warning', 'Repeated position or spike', 'acg', 'A position repeated, or a corner turning back on itself (under 1°), is a digitizing error.'],
    ['X07', 'Geometry', 'warning', 'Very small area or length', 'q', 'Areas under 1 m² and lines under 0.2 m are slivers or leftovers.'],
    ['X08', 'Geometry', 'warning', 'Paved surface elements overlap', 'q', 'Runway, taxiway, apron, shoulder, stopway and blast pad elements describe each part of the pavement once.'],
    ['X09', 'Geometry', 'info', 'Small gap between paved surface elements', 'q', 'A hole under 25 m² inside the pavement is usually a gap between elements that should touch.'],
    ['F01', 'Functional', 'warning', 'Runway threshold not on a runway element', 'cat', 'A threshold lies on its runway (tolerance 1 m).'],
    ['F02', 'Functional', 'warning', 'Threshold designator (idthr) not found among the runways of the aerodrome', 'xsd', 'idthr is one of the designators in idrwy of a runway element of the same aerodrome.'],
    ['F03', 'Functional', 'warning', 'Runway end without a threshold', 'a15', 'Each runway designator has its threshold.'],
    ['F04', 'Functional', 'warning', 'Parking stand location not on an apron or stand area', 'cat', 'A stand location lies on its stand area or apron (tolerance 1 m).'],
    ['F05', 'Functional', 'warning', 'Taxiway guidance line leaves the paved surface', 'cat', 'Guidance lines are painted on runway, taxiway or apron pavement (tolerance 2 m).'],
    ['F06', 'Functional', 'info', 'Holding position does not cross a guidance line', 'cat', 'A runway holding position is across the taxiway it protects.'],
    ['F07', 'Functional', 'warning', 'Runway exit line does not reach a runway element', 'cat', 'An exit line starts on the runway.'],
    ['F08', 'Functional', 'info', 'Guidance line ends without a connection', 'cat', 'Taxi routes are continuous; a loose end over 1 m from any other line breaks routing (ASRN).'],
    ['F09', 'Functional', 'warning', 'Aerodrome without an aerodrome reference point', 'a15', 'The aerodrome reference point locates the aerodrome and its data.'],
    ['F10', 'Functional', 'warning', 'Feature far from its aerodrome', 'cat', 'More than 8 km from the aerodrome reference point: wrong aerodrome, or a coordinate error.'],
    ['F11', 'Functional', 'warning', 'Routing network edge not ending on a node', 'cat', 'ASRN edges join at nodes; a loose edge cannot be routed.'],
    ['F12', 'Functional', 'info', 'Vertical structure outside the aerodrome mapping area', 'cat', 'ED-99 maps vertical structures within 90 m of a runway centre line and 50 m of the movement area; others belong to the obstacle data set.'],
    ['C01', 'Complete', 'info', 'Core feature type missing at the aerodrome', 'a15', 'Runway and taxiway elements, thresholds, guidance lines, holding positions, aprons, stands and the reference point make up a usable aerodrome map.']
  ].map(function (r) { return { id: 'AMDB-' + r[0], grp: r[1], sev: r[2], title: r[3], src: SRC[r[4]], why: r[5] }; });
  var RULE = {}; RULES.forEach(function (r) { RULE[r.id] = r; });

  /* ---------------------------------------------- AIXM -> AMXM feature types */
  // the AIXM 5.x aerodrome features checked and written as their AMXM counterparts
  function aixmType(r) {
    var p = r.cur.p, t = up(p.type), role = up(p.role);
    switch (r.k) {
      case 'RunwayElement': return t === 'INTERSECTION' ? 'RunwayIntersection' : t === 'SHOULDER' ? 'RunwayShoulder' : t === 'DISPLACED' ? 'RunwayDisplacedArea' : t === 'BLAST_PAD' ? 'Blastpad' : 'RunwayElement';
      case 'TaxiwayElement': return t === 'SHOULDER' ? 'TaxiwayShoulder' : 'TaxiwayElement';
      case 'ApronElement': return t === 'PARKING' ? 'ParkingStandArea' : 'ApronElement';
      case 'AircraftStand': return 'ParkingStandLocation';
      case 'RunwayCentrelinePoint': return role === 'THR' || role === 'DISTHR' ? 'RunwayThreshold' : 'RunwayCenterlinePoint';
      case 'GuidanceLine': return /GATE|STAND/.test(t) ? 'StandGuidanceLine' : /RWY_EXIT|EXIT/.test(t) ? 'RunwayExitLine' : 'TaxiwayGuidanceLine';
      case 'TaxiHoldingPosition': return 'TaxiwayHoldingPosition';
      case 'DeicingArea': return 'DeicingArea';
      case 'WorkArea': return 'ConstructionArea';
      case 'Road': return 'ServiceRoad';
      case 'RunwayBlastPad': return 'Blastpad';
      case 'RunwayProtectArea': return t === 'STOPWAY' ? 'Stopway' : null;
      case 'AirportHotSpot': return 'Hotspot';
      case 'SurveyControlPoint': return 'SurveyControlPoint';
      case 'TouchDownLiftOff': return 'TouchDownLiftOffArea';
      case 'AirportHeliport': return 'AerodromeReferencePoint';
      default: return null;
    }
  }
  var AIXM_KINDS = ['AirportHeliport', 'RunwayElement', 'TaxiwayElement', 'ApronElement', 'AircraftStand', 'RunwayCentrelinePoint', 'GuidanceLine', 'TaxiHoldingPosition', 'DeicingArea', 'WorkArea', 'Road',
    'RunwayBlastPad', 'RunwayProtectArea', 'AirportHotSpot', 'SurveyControlPoint', 'TouchDownLiftOff'];
  // AIXM data sets carry aerodrome mapping when they have pavement or guidance features (not only the AIP lists)
  var AIXM_MAPPING = ['RunwayElement', 'TaxiwayElement', 'ApronElement', 'GuidanceLine', 'TaxiHoldingPosition'];

  function up(v) { v = arrFirst(v); return v === undefined || v === null ? '' : String(typeof v === 'object' ? (v.v !== undefined ? v.v : '') : v).toUpperCase(); }
  function arrFirst(v) { return Array.isArray(v) ? v[0] : v; }
  // an attribute value as {v, u} or {nil}; undefined when absent
  function av(v) {
    v = arrFirst(v);
    if (v === undefined || v === null) return undefined;
    if (typeof v === 'object') {
      if (v._geo) return undefined;
      if (v.nil !== undefined) return { nil: v.nil || 'unknown' };
      if (v.v !== undefined) return { v: String(v.v), u: v.u || '' };
      return undefined;
    }
    return { v: String(v) };
  }

  /* --------------------------------------------- the features as plain data */
  // M = MODEL. Returns { features, sets } with every feature as plain data (no links to the page's objects), so
  // it can be handed to a worker. f.ref = [data set index, record index] leads back to the record.
  function collect(datasets, M, opt) {
    opt = opt || {};
    var features = [], sets = [];
    datasets.forEach(function (ds, di) {
      var am = ds.family === 'amxm' || ds.recs.some(function (r) { return r.cur && r.cur.p && r.cur.p._amxm && !r.syn; });
      var ax = !am && AIXM_MAPPING.some(function (k) { return (ds.byType[k] || []).length; });
      if (!am && !ax) return;
      sets.push({ i: di, name: ds.name, kind: am ? 'AMXM' : 'AIXM ' + (ds.version || ''), state: ds.state || '' });
      if (am) {
        ds.recs.forEach(function (r, ri) {
          if (!r.cur || !r.cur.p || !r.cur.p._amxm || r.syn || r.cur.gone) return;
          var p = r.cur.p, a = {};
          Object.keys(p).forEach(function (k) { if (k.charAt(0) !== '_') { var x = av(p[k]); if (x) a[k] = x; else if (p[k] && p[k]._geo) a[k] = { geo: 1 }; } });
          var ad = a.idarpt && a.idarpt.v ? a.idarpt.v : '';
          if (opt.ad && ad !== opt.ad) return;
          var g = geoms(M.geometry(ds, r)), keys = Object.keys(p).filter(function (k) { return k.charAt(0) !== '_'; });
          if (g.length) keys.push('geopoly', 'geoline', 'geopnt');
          if (p._nil) keys = keys.concat(p._nil);
          features.push({ i: features.length, t: p._amxm, src: 'AMXM', ad: ad, g: g, a: a, keys: keys,
            label: [a.idrwy, a.idthr, a.idlin, a.idstd, a.idapron, a.name].map(function (x) { return x && x.v; }).filter(Boolean)[0] || '', ref: [di, ri], id: r.id, b: r.cur.b || null });
        });
      } else {
        var idx = new Map(); ds.recs.forEach(function (r, ri) { idx.set(r, ri); });
        AIXM_KINDS.forEach(function (k) {
          (ds.byType[k] || []).forEach(function (r) {
            if (!r.cur || r.cur.gone || r.syn) return;
            var t = aixmType(r);
            if (!t) return;
            var adr = k === 'AirportHeliport' ? r : ds.owner && ds.owner.get(r), ad = adr ? (M.s(adr.cur.p.locationIndicatorICAO) || M.s(adr.cur.p.designator)) : '';
            if (opt.ad && ad !== opt.ad) return;
            var g = k === 'AirportHeliport' ? (M.pointOf(ds, r) ? [{ t: 'P', c: M.pointOf(ds, r) }] : []) : geoms(M.geometry(ds, r));
            var q = aixmQuality(r.cur.p), a = aixmAttrs(ds, r, t, M, adr);
            if (ad) a.idarpt = { v: ad };
            if (q.hacc !== undefined) a.hacc = { v: String(q.hacc), u: 'M' };
            var lab = [a.idthr, a.idrwy, a.idlin, a.idstd, a.idapron, a.ident].map(function (x) { return x && x.v; }).filter(Boolean)[0] || M.label(ds, r);
            features.push({ i: features.length, t: t, src: 'AIXM', k: k, ad: ad, g: g, a: a, keys: [], label: lab, ref: [di, idx.get(r)], id: r.id, b: r.cur.b || null });
            // a stand with an outline: its area too
            if (k === 'AircraftStand') {
              var ext = findGeo(r.cur.p.extent, 'A');
              if (ext) features.push({ i: features.length, t: 'ParkingStandArea', src: 'AIXM', k: k, ad: ad, g: [ext], a: a, keys: [], label: lab, ref: [di, idx.get(r)], id: r.id + '-area', b: r.cur.b || null });
            }
          });
        });
      }
    });
    return { features: features, sets: sets };
  }
  // the AMXM attributes an AIXM 5.x feature gives (designators, names, measures); the rest stays unknown
  function aixmAttrs(ds, r, t, M, adr) {
    var p = r.cur.p, a = {}, s = M.s;
    function tg(ref) { return ref ? M.target(ds, arrFirst(ref)) : null; }
    function meas(x) { x = av(x); return x && x.v !== undefined && !isNaN(parseFloat(x.v)) ? { v: String(toM(parseFloat(x.v), x.u)), u: 'M' } : undefined; }
    function rwyId(rw) { var d = rw ? s(rw.cur.p.designator) : ''; if (!d) return undefined; var parts = d.split(/[/.\-]/).map(function (x) { return x.trim(); }).filter(Boolean); if (parts.length === 2) parts.sort(function (x, y) { return parseInt(x, 10) - parseInt(y, 10); }); return { v: parts.join('.') }; }
    switch (t) {
      case 'RunwayElement': case 'RunwayIntersection': case 'RunwayDisplacedArea': case 'RunwayShoulder': case 'Blastpad':
        a.idrwy = rwyId(tg(p.associatedRunway)); a.width = meas(p.width); a.length = meas(p.length); break;
      case 'RunwayThreshold': case 'RunwayCenterlinePoint': {
        var rd = tg(p.onRunway); if (rd && s(rd.cur.p.designator)) a.idthr = { v: s(rd.cur.p.designator) };
        var loc = arrFirst(p.location); if (loc && loc.elevation) a.elev = meas(loc.elevation);
        break;
      }
      case 'TaxiwayElement': case 'TaxiwayShoulder': { var tw = tg(p.associatedTaxiway); if (tw && s(tw.cur.p.designator)) a.idlin = { v: s(tw.cur.p.designator) }; break; }
      case 'ApronElement': { var ap = tg(p.associatedApron); if (ap && (s(ap.cur.p.name) || s(ap.cur.p.designator))) a.idapron = { v: s(ap.cur.p.name) || s(ap.cur.p.designator) }; break; }
      case 'ParkingStandLocation': case 'ParkingStandArea': { if (s(p.designator)) a.idstd = { v: s(p.designator) }; var ae = tg(p.apronLocation); var apr = ae ? tg(ae.cur.p.associatedApron) : null; if (apr && s(apr.cur.p.name)) a.idapron = { v: s(apr.cur.p.name) }; break; }
      case 'TaxiwayGuidanceLine': case 'StandGuidanceLine': case 'RunwayExitLine': if (s(p.designator)) a.idlin = { v: s(p.designator) }; break;
      case 'TaxiwayHoldingPosition': { var gl = tg(p.associatedGuidanceLine); if (gl && s(gl.cur.p.designator)) a.idlin = { v: s(gl.cur.p.designator) }; break; }
      case 'AerodromeReferencePoint':
        if (s(p.name)) a.name = { v: s(p.name) }; if (s(p.designatorIATA)) a.iata = { v: s(p.designatorIATA) }; if (p.fieldElevation) a.elev = meas(p.fieldElevation); break;
      default: if (s(p.designator)) a.ident = { v: s(p.designator) };
    }
    Object.keys(a).forEach(function (k) { if (a[k] === undefined) delete a[k]; });
    return a;
  }
  function findGeo(v, t, depth) {
    depth = depth || 0;
    if (!v || typeof v !== 'object' || depth > 6) return null;
    if (Array.isArray(v)) { for (var i = 0; i < v.length; i++) { var g = findGeo(v[i], t, depth + 1); if (g) return g; } return null; }
    if (v._geo && v._geo.t === t) return { t: v._geo.t, c: v._geo.c };
    for (var k in v) if (k !== '_geo' && v[k] && typeof v[k] === 'object') { var gg = findGeo(v[k], t, depth + 1); if (gg) return gg; }
    return null;
  }
  // accuracy declared on the AIXM geometry (ElevatedPoint / ElevatedCurve / ElevatedSurface horizontalAccuracy)
  function aixmQuality(p) {
    var out = {};
    (function walk(v, d) {
      if (!v || typeof v !== 'object' || d > 5 || out.hacc !== undefined) return;
      if (Array.isArray(v)) { v.forEach(function (x) { walk(x, d + 1); }); return; }
      if (v.horizontalAccuracy) { var h = av(v.horizontalAccuracy); if (h && h.v !== undefined && !isNaN(parseFloat(h.v))) out.hacc = toM(parseFloat(h.v), h.u); }
      for (var k in v) if (k !== '_geo' && v[k] && typeof v[k] === 'object') walk(v[k], d + 1);
    })(p, 0);
    return out;
  }
  function geoms(g) {
    if (!g) return [];
    return (g.t === 'M' ? g.parts || [] : [g]).map(function (x) {
      var o = { t: x.t, c: x.c };
      // rings the reader had to close (left open in the data)
      if (x.t === 'A') { var op = []; x.c.forEach(function (r, i) { if (r.opened) op.push(i); }); if (op.length) o.open = op; }
      return o;
    });
  }
  function toM(v, u) { u = String(u || '').toUpperCase(); return /^(FT|FEET)$/.test(u) ? v * 0.3048 : /^KM$/.test(u) ? v * 1000 : /NM/.test(u) ? v * 1852 : v; }
  function num(x) { if (!x || x.v === undefined) return null; var n = parseFloat(x.v); return isNaN(n) ? null : n; }

  /* ---------------------------------------------------- local plane, metres */
  // sinusoidal projection about the aerodrome: distances and areas within a few km are true to millimetres
  function plane(lon0, lat0) {
    var s = Math.sin(lat0 * D2R), w = Math.sqrt(1 - E2 * s * s), N = A / w, Mr = A * (1 - E2) / (w * w * w);
    return {
      fwd: function (c) { return [(c[0] - lon0) * D2R * N * Math.cos(c[1] * D2R), (c[1] - lat0) * D2R * Mr]; },
      inv: function (x) { var lat = lat0 + x[1] / Mr / D2R; return [lon0 + x[0] / (N * Math.cos(lat * D2R)) / D2R, lat]; }
    };
  }
  function segDist(p, a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy, t = l ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    var x = a[0] + t * dx - p[0], y = a[1] + t * dy - p[1];
    return Math.sqrt(x * x + y * y);
  }
  function inRing(p, ring) {
    var inside = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var a = ring[i], b = ring[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  }
  function ringDist(p, ring) { var d = Infinity; for (var i = 1; i < ring.length; i++) d = Math.min(d, segDist(p, ring[i - 1], ring[i])); return d; }
  function signedArea(ring) { var s = 0; for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) s += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]); return s / 2; }
  function lineLen(c) { var l = 0; for (var i = 1; i < c.length; i++) l += Math.hypot(c[i][0] - c[i - 1][0], c[i][1] - c[i - 1][1]); return l; }
  function bbox(pts) { var b = [Infinity, Infinity, -Infinity, -Infinity]; pts.forEach(function (p) { if (p[0] < b[0]) b[0] = p[0]; if (p[1] < b[1]) b[1] = p[1]; if (p[0] > b[2]) b[2] = p[0]; if (p[1] > b[3]) b[3] = p[1]; }); return b; }
  function bboxHit(a, b, tol) { return a[0] - tol <= b[2] && b[0] - tol <= a[2] && a[1] - tol <= b[3] && b[1] - tol <= a[3]; }
  function cross(a, b, c) { return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); }
  function segsCross(p1, p2, p3, p4) {
    var d1 = cross(p3, p4, p1), d2 = cross(p3, p4, p2), d3 = cross(p1, p2, p3), d4 = cross(p1, p2, p4);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  }
  // first crossing of a ring with itself (segments that do not share an end), or null
  function selfCross(ring) {
    var n = ring.length - 1, segs = [];
    for (var i = 0; i < n; i++) { var a = ring[i], b = ring[i + 1]; segs.push({ i: i, a: a, b: b, x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]) }); }
    segs.sort(function (s, t) { return s.x0 - t.x0; });
    for (var p = 0; p < segs.length; p++) {
      for (var q = p + 1; q < segs.length && segs[q].x0 <= segs[p].x1; q++) {
        var s = segs[p], t = segs[q], d = Math.abs(s.i - t.i);
        if (d <= 1 || d === n - 1) continue;
        if (segsCross(s.a, s.b, t.a, t.b)) return s.a;
      }
    }
    return null;
  }
  function interp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }

  /* ---------------------------------------------------------------- checks */
  var PAVE = { RunwayElement: 1, RunwayIntersection: 1, RunwayDisplacedArea: 1, RunwayShoulder: 1, TaxiwayElement: 1, TaxiwayShoulder: 1, ApronElement: 1, Blastpad: 1, Stopway: 1 };
  var ON_PAVE = { RunwayElement: 1, RunwayIntersection: 1, RunwayDisplacedArea: 1, TaxiwayElement: 1, ApronElement: 1, ParkingStandArea: 1, DeicingArea: 1, Stopway: 1, Blastpad: 1 };
  var RWY = { RunwayElement: 1, RunwayIntersection: 1, RunwayDisplacedArea: 1 };
  var GUIDE = { TaxiwayGuidanceLine: 1, StandGuidanceLine: 1, RunwayExitLine: 1 };
  var CORE = ['AerodromeReferencePoint', 'RunwayElement', 'RunwayThreshold', 'TaxiwayElement', 'TaxiwayGuidanceLine', 'TaxiwayHoldingPosition', 'ApronElement', 'ParkingStandLocation'];
  // PANS-AIM Appendix 1: [class, horizontal accuracy m] of the data item a feature type carries
  // (the same items as the Quality -> Data integrity check, src/integrity.js; polygons of runway, taxiway and
  // other elements have no item of their own in Appendix 1 and are not rated)
  var REQ = {
    RunwayThreshold: ['critical', 1], RunwayCenterlinePoint: ['critical', 1], TaxiwayHoldingPosition: ['critical', 0.5],
    TaxiwayGuidanceLine: ['essential', 0.5], RunwayExitLine: ['essential', 0.5], StandGuidanceLine: ['essential', 0.5],
    ParkingStandLocation: ['routine', 0.5], ApronElement: ['routine', 1], AerodromeReferencePoint: ['routine', 30]
  };
  var INTEGRITY = { critical: 1e-8, essential: 1e-5, routine: 1e-3 };
  var DATE_ATTRS = ['revdate', 'stfeat', 'endfeat', 'stvalid', 'endvalid'];
  var RE_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
  var RE_RWY = /^(\d{2})([LRC]?)$/;

  // features: from collect(); dict: the AMXM dictionary (data/amxm_dictionary.json); opt.progress(fraction)
  function check(features, dict, opt) {
    opt = opt || {};
    var out = [], ran = {}, t0 = Date.now();
    function add(rule, f, msg, at, found, expected) {
      var x = { r: 'AMDB-' + rule, sev: RULE['AMDB-' + rule].sev, f: f ? f.i : -1, ad: f ? f.ad : (at && at.ad) || '', msg: msg, at: at && at.length ? [at[0], at[1]] : f ? anchor(f) : null, found: found || '', expected: expected || '' };
      out.push(x);
      return x;
    }
    function run(rule) { ran['AMDB-' + rule] = true; }
    RULES.forEach(function (r) { ran[r.id] = false; });
    var byAd = {};
    features.forEach(function (f) { (byAd[f.ad || '(none)'] || (byAd[f.ad || '(none)'] = [])).push(f); });

    /* generic: attributes, codes, identifiers (AMXM) */
    ['G01', 'G02', 'G03', 'G04', 'G05', 'G06', 'G07', 'G08', 'G09', 'G10', 'Q01', 'Q02', 'Q03', 'Q04', 'X01'].forEach(run);
    var feattypeOf = {};
    if (dict && dict.codes && dict.codes.feattypeBaseTypeType) Object.keys(dict.codes.feattypeBaseTypeType).forEach(function (k) { feattypeOf[dict.codes.feattypeBaseTypeType[k].replace(/\s+/g, '').toLowerCase()] = k; });
    var seen = {};
    features.forEach(function (f) {
      var def = dict && dict.features && dict.features[f.t];
      if (f.src === 'AMXM' && def) {
        def.attrs.forEach(function (a) {
          var x = f.a[a.n];
          if (a.m && !x && f.keys.indexOf(a.n) < 0) add('G01', f, f.t + ' has no ' + a.n + ' (' + (a.d || 'required') + ').', null, 'absent', a.n + ' given, or nil with a reason');
          if (a.c && x && x.v !== undefined && dict.codes[a.c] && !Object.prototype.hasOwnProperty.call(dict.codes[a.c], x.v)) add('G02', f, a.n + ' = "' + x.v + '" is not in the code list ' + a.c.replace(/BaseTypeType$/, '') + '.', null, x.v, Object.keys(dict.codes[a.c]).slice(0, 12).join(', ') + (Object.keys(dict.codes[a.c]).length > 12 ? ' …' : ''));
        });
        var ft = f.a.feattype && f.a.feattype.v, want = feattypeOf[f.t.toLowerCase()];
        if (ft !== undefined && want !== undefined && ft !== want) add('G03', f, 'feattype ' + ft + ' (' + (dict.codes.feattypeBaseTypeType[ft] || 'unknown') + ') on a ' + f.t + '.', null, ft, want);
        var idn = f.a.idnumber && f.a.idnumber.v;
        if (idn) { var key = f.t + '|' + idn; if (seen[key]) add('G04', f, 'idnumber ' + idn + ' is also used by another ' + f.t + '.', null, idn, 'unique'); else seen[key] = 1; }
        DATE_ATTRS.forEach(function (n) { var x = f.a[n]; if (x && x.v !== undefined && !RE_DATE.test(x.v.trim())) add('G08', f, n + ' "' + x.v + '" is not a date and time.', null, x.v, 'YYYY-MM-DDThh:mm:ssZ'); });
        def.attrs.forEach(function (a) {
          var x = f.a[a.n], l = a.x;
          if (!x || x.v === undefined || x.v === '' || !l) return;
          if (l.b === 'double' || l.b === 'integer' || l.b === 'decimal') {
            var n = Number(x.v.trim());
            if (isNaN(n)) { add('G09', f, a.n + ' "' + x.v + '" is not a number.', null, x.v, 'a number'); return; }
            if ((l.min !== undefined && n < l.min) || (l.max !== undefined && n > l.max)) add('G10', f, a.n + ' = ' + x.v + ' is outside ' + (l.min !== undefined ? l.min : '…') + ' – ' + (l.max !== undefined ? l.max : '…') + '.', null, x.v, (l.min !== undefined ? l.min : '…') + ' – ' + (l.max !== undefined ? l.max : '…'));
          } else if (l.len !== undefined && x.v.length > l.len) add('G10', f, a.n + ' has ' + x.v.length + ' characters (at most ' + l.len + ').', null, x.v.length + ' characters', '≤ ' + l.len);
        });
      }
      if (f.ad && !/^[A-Z]{4}$/.test(f.ad)) add('G05', f, 'idarpt "' + f.ad + '".', null, f.ad, 'four letters (ICAO Doc 7910)');
      var rw = f.a.idrwy && f.a.idrwy.v;
      if (rw) {
        var m = /^(\d{2}[LRC]?)\.(\d{2}[LRC]?)$/.exec(rw.trim());
        if (!m && !/^H/i.test(rw)) add('G06', f, 'idrwy "' + rw + '".', null, rw, 'e.g. 07L.25R');
        else if (m) {
          var a1 = RE_RWY.exec(m[1]), a2 = RE_RWY.exec(m[2]);
          if (+a1[1] > +a2[1]) add('G06', f, 'idrwy "' + rw + '": the higher designator comes first.', null, rw, m[2] + '.' + m[1]);
          var sw = { L: 'R', R: 'L', C: 'C', '': '' };
          if (Math.abs(+a1[1] - +a2[1]) !== 18 || sw[a1[2]] !== a2[2]) add('G07', f, 'idrwy "' + rw + '": ' + m[1] + ' and ' + m[2] + ' are not the two ends of one runway.', null, rw, 'designators 18 apart, L ↔ R');
        }
      }
      // quality
      var req = REQ[f.t], hacc = num(f.a.hacc);
      if (hacc !== null && f.a.hacc.u) hacc = toM(hacc, f.a.hacc.u);
      if (req && hacc !== null && hacc > req[1] + 1e-9) add('Q01', f, f.t + ' declares ' + hacc + ' m; PANS-AIM requires ' + req[1] + ' m (' + req[0] + ' data).', null, hacc + ' m', '≤ ' + req[1] + ' m');
      var integr = num(f.a.integr);
      if (req && integr !== null && integr > INTEGRITY[req[0]] * 1.0000001) add('Q02', f, 'integr ' + f.a.integr.v + ' for ' + req[0] + ' data.', null, f.a.integr.v, '≤ ' + INTEGRITY[req[0]]);
      var hres = num(f.a.hres);
      if (hres !== null && hacc !== null) {
        var hresM = /DEG|DECIMAL/i.test(f.a.hres.u || '') || hres < 0.001 ? hres * 111320 : toM(hres, f.a.hres.u);
        if (hresM > hacc * 1.0001 && hresM > 0.01) add('Q03', f, 'resolution ' + f.a.hres.v + (f.a.hres.u ? ' ' + f.a.hres.u : '') + ' (about ' + hresM.toFixed(2) + ' m) is coarser than the accuracy ' + hacc + ' m.', null, hresM.toFixed(2) + ' m', '≤ ' + hacc + ' m');
      }
      if (f.src === 'AIXM' && req && hacc === null) add('Q04', f, f.t + ' (AIXM ' + f.k + ') declares no horizontal accuracy.', null, 'none', 'horizontalAccuracy');
      // positions
      var bad = null;
      f.g.forEach(function (g) { eachPt(g, function (c) { if (!bad && (!isFinite(c[0]) || !isFinite(c[1]) || Math.abs(c[1]) > 90 || Math.abs(c[0]) > 180 || (Math.abs(c[0]) < 1e-9 && Math.abs(c[1]) < 1e-9))) bad = c; }); });
      if (bad) f.badPos = 1;
      if (bad) add('X01', f, 'position ' + bad[1] + ', ' + bad[0] + '.', null, String(bad[1]) + ', ' + String(bad[0]), 'a WGS-84 position at the aerodrome').at = null;
    });

    /* per aerodrome: geometry and function in metres */
    ['X02', 'X03', 'X04', 'X05', 'X06', 'X07', 'F01', 'F02', 'F03', 'F04', 'F05', 'F06', 'F07', 'F08', 'F09', 'F10', 'F11', 'F12', 'C01'].forEach(run);
    var hasJsts = typeof jsts !== 'undefined';
    if (hasJsts) { run('X08'); run('X09'); }
    var ads = Object.keys(byAd), stats = {};
    ads.forEach(function (ad, ai) {
      if (opt.progress) opt.progress(ai / ads.length);
      var list = byAd[ad], arp = list.filter(function (f) { return f.t === 'AerodromeReferencePoint' && f.g[0] && f.g[0].t === 'P'; })[0];
      var o = arp ? arp.g[0].c : firstPt(list);
      if (!o) return;
      var P = plane(o[0], o[1]);
      stats[ad] = { features: list.length, types: {} };
      list.forEach(function (f) { stats[ad].types[f.t] = (stats[ad].types[f.t] || 0) + 1; });
      // projected geometry
      list.forEach(function (f) { f.m = f.g.map(function (g) { return proj(g, P); }); });
      if (!arp && ad !== '(none)') add('F09', null, 'No AerodromeReferencePoint for ' + ad + '.', withAd([o[0], o[1]], ad), 'none', 'an aerodrome reference point');
      list.forEach(function (f) {
        f.m.forEach(function (g, gi) {
          if (g.t === 'A') {
            g.c.forEach(function (ring, ri) {
              var src = f.g[gi].c[ri];
              var distinct = ring.filter(function (p, k) { return !ring.slice(0, k).some(function (q) { return Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.001; }); }).length;
              if (ring.length < 4 || distinct < 3) { add('X03', f, (ri ? 'hole ' + ri : 'boundary') + ' has ' + distinct + ' distinct position(s).', src[0], distinct + '', '≥ 3 distinct and the closing position'); return; }
              var a0 = ring[0], an = ring[ring.length - 1], gap = Math.hypot(a0[0] - an[0], a0[1] - an[1]), opened = f.g[gi].open && f.g[gi].open.indexOf(ri) >= 0;
              if (opened) add('X02', f, (ri ? 'hole ' + ri : 'boundary') + ' does not end where it starts (' + Math.hypot.apply(null, [ring[ring.length - 2][0] - a0[0], ring[ring.length - 2][1] - a0[1]]).toFixed(2) + ' m apart).', src[src.length - 2], 'open', 'closed');
              else if (gap > 1e-6) add('X02', f, (ri ? 'hole ' + ri : 'boundary') + ' ends ' + gap.toFixed(2) + ' m from where it starts.', src[src.length - 1], 'open', 'closed');
              var rc = closeRing(ring), x = selfCross(rc);
              if (x) { add('X04', f, (ri ? 'hole ' + ri : 'boundary') + ' crosses itself.', P.inv(x), 'self-crossing', 'simple ring'); return; }
              var sa = signedArea(rc);
              if (ri === 0 && sa < 0) add('X05', f, 'outer boundary is clockwise.', src[0], 'clockwise', 'counter-clockwise');
              if (ri > 0 && sa > 0) add('X05', f, 'hole ' + ri + ' is counter-clockwise.', src[0], 'counter-clockwise', 'clockwise');
              spikes(f, rc, true, P);
              if (ri === 0 && Math.abs(sa) < 1) add('X07', f, 'area ' + Math.abs(sa).toFixed(2) + ' m².', src[0], Math.abs(sa).toFixed(2) + ' m²', '≥ 1 m²');
            });
          } else if (g.t === 'L') {
            spikes(f, g.c, false, P);
            var L = lineLen(g.c);
            if (L < 0.2) add('X07', f, 'line ' + L.toFixed(2) + ' m long.', f.g[gi].c[0], L.toFixed(2) + ' m', '≥ 0.2 m');
          }
        });
      });
      // paved surfaces, indexed by box
      var pave = list.filter(function (f) { return PAVE[f.t]; }), onPave = list.filter(function (f) { return ON_PAVE[f.t]; });
      function polys(fl) { var out = []; fl.forEach(function (f) { f.m.forEach(function (g) { if (g.t === 'A' && g.c[0] && g.c[0].length >= 4) out.push({ f: f, rings: g.c.map(closeRing), b: bbox(g.c[0]) }); }); }); return out; }
      var pv = polys(onPave), rw = polys(list.filter(function (f) { return RWY[f.t]; })), apr = polys(list.filter(function (f) { return f.t === 'ApronElement' || f.t === 'ParkingStandArea'; }));
      function within(p, set, tol) {
        for (var i = 0; i < set.length; i++) {
          var s = set[i];
          if (!bboxHit([p[0], p[1], p[0], p[1]], s.b, tol)) continue;
          if (inRing(p, s.rings[0]) && !s.rings.slice(1).some(function (h) { return inRing(p, h) && ringDist(p, h) > tol; })) return true;
          if (ringDist(p, s.rings[0]) <= tol) return true;
        }
        return false;
      }
      // thresholds
      var desig = {};
      list.forEach(function (f) { var v = f.a.idrwy && f.a.idrwy.v; if (v && RWY[f.t]) v.split('.').forEach(function (d) { desig[d.trim()] = desig[d.trim()] || f; }); });
      var thrs = {};
      list.forEach(function (f) {
        if (f.t !== 'RunwayThreshold') return;
        var p = f.m[0] && f.m[0].t === 'P' ? f.m[0].c : null, id = f.a.idthr && f.a.idthr.v;
        if (id) thrs[id] = 1;
        if (p && rw.length && !within(p, rw, 1)) add('F01', f, 'threshold' + lab(id || f.label) + ' is ' + nearestDist(p, rw).toFixed(1) + ' m from the nearest runway element.', null, nearestDist(p, rw).toFixed(1) + ' m', '≤ 1 m');
        if (id && Object.keys(desig).length && !desig[id]) add('F02', f, 'idthr ' + id + ' — runways of ' + ad + ': ' + Object.keys(desig).sort().join(', ') + '.', null, id, Object.keys(desig).sort().join(', '));
      });
      if (list.some(function (f) { return f.t === 'RunwayThreshold'; })) Object.keys(desig).forEach(function (d) { if (!thrs[d] && RE_RWY.test(d)) add('F03', desig[d], 'runway end ' + d + ' has no RunwayThreshold.', null, 'none', 'RunwayThreshold idthr ' + d); });
      // stands
      list.forEach(function (f) {
        if (f.t !== 'ParkingStandLocation' || !f.m[0] || f.m[0].t !== 'P') return;
        var p = f.m[0].c;
        if (apr.length && !within(p, apr, 1) && !within(p, pv, 1)) add('F04', f, 'stand' + lab(f.label) + ' is ' + nearestDist(p, apr).toFixed(1) + ' m from the nearest apron or stand area.', null, nearestDist(p, apr).toFixed(1) + ' m', '≤ 1 m');
      });
      // guidance lines on pavement, connections
      var lines = [];
      list.forEach(function (f) { if (GUIDE[f.t]) f.m.forEach(function (g, gi) { if (g.t === 'L' && g.c.length > 1) lines.push({ f: f, c: g.c, src: f.g[gi].c, b: bbox(g.c) }); }); });
      lines.forEach(function (ln) {
        if (ln.f.t === 'TaxiwayGuidanceLine' && pv.length) {
          var off = null, offLen = 0;
          for (var i = 1; i < ln.c.length; i++) {
            var a = ln.c[i - 1], b = ln.c[i], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 5));
            for (var k = 0; k <= n; k++) { var p = interp(a, b, k / n); if (!within(p, pv, 2)) { offLen += Math.hypot(b[0] - a[0], b[1] - a[1]) / n; if (!off) off = p; } }
          }
          if (off && offLen > 4) add('F05', ln.f, 'guidance line' + lab(ln.f.label) + ': about ' + Math.round(offLen) + ' m off the paved surface.', P.inv(off), Math.round(offLen) + ' m off', 'on pavement (± 2 m)');
        }
        if (ln.f.t === 'RunwayExitLine' && rw.length) {
          var e0 = ln.c[0], e1 = ln.c[ln.c.length - 1];
          if (!within(e0, rw, 2) && !within(e1, rw, 2)) add('F07', ln.f, 'exit line' + lab(ln.f.label) + ' ends ' + Math.min(nearestDist(e0, rw), nearestDist(e1, rw)).toFixed(1) + ' m from the runway.', null, Math.min(nearestDist(e0, rw), nearestDist(e1, rw)).toFixed(1) + ' m', 'on the runway');
        }
      });
      if (lines.length > 1) {
        var stands = list.filter(function (f) { return f.t === 'ParkingStandLocation' && f.m[0] && f.m[0].t === 'P'; }).map(function (f) { return f.m[0].c; });
        lines.forEach(function (ln) {
          [ln.c[0], ln.c[ln.c.length - 1]].forEach(function (e, ei) {
            var ok = lines.some(function (o) { if (o === ln || !bboxHit([e[0], e[1], e[0], e[1]], o.b, 1)) return false; for (var i = 1; i < o.c.length; i++) if (segDist(e, o.c[i - 1], o.c[i]) <= 1) return true; return false; }) ||
              stands.some(function (s) { return Math.hypot(s[0] - e[0], s[1] - e[1]) < 30; }) || ln.f.t === 'StandGuidanceLine' || ln.f.t === 'RunwayExitLine' || within(e, rw, 1);
            if (!ok) add('F08', ln.f, 'guidance line' + lab(ln.f.label) + ': its ' + (ei ? 'end' : 'start') + ' joins no other line.', ei ? ln.src[ln.src.length - 1] : ln.src[0], 'loose end', 'joined (≤ 1 m)');
          });
        });
      }
      // holding positions across a guidance line
      list.forEach(function (f) {
        if (f.t !== 'TaxiwayHoldingPosition' || !lines.length) return;
        f.m.forEach(function (g) {
          if (g.t !== 'L' || g.c.length < 2) return;
          var b = bbox(g.c), hit = lines.some(function (ln) {
            if (!bboxHit(b, ln.b, 1)) return false;
            for (var i = 1; i < g.c.length; i++) for (var j = 1; j < ln.c.length; j++) if (segsCross(g.c[i - 1], g.c[i], ln.c[j - 1], ln.c[j])) return true;
            return false;
          });
          if (!hit) add('F06', f, 'holding position ' + (f.label || '') + ' crosses no guidance line.', null, 'no crossing', 'across a taxiway guidance line');
        });
      });
      // far from the aerodrome
      if (arp) list.forEach(function (f) { var c = firstPtM(f); if (c && !f.badPos && Math.hypot(c[0], c[1]) > 8000) add('F10', f, f.t + lab(f.label) + ' is ' + (Math.hypot(c[0], c[1]) / 1000).toFixed(1) + ' km from the reference point of ' + ad + '.', null, (Math.hypot(c[0], c[1]) / 1000).toFixed(1) + ' km', '≤ 8 km'); });
      // routing network
      var nodes = list.filter(function (f) { return f.t === 'AsrnNode' && f.m[0] && f.m[0].t === 'P'; }).map(function (f) { return f.m[0].c; });
      if (nodes.length) list.forEach(function (f) {
        if (f.t !== 'AsrnEdge' || !f.m[0] || f.m[0].t !== 'L') return;
        var c = f.m[0].c;
        [c[0], c[c.length - 1]].forEach(function (e, ei) { if (!nodes.some(function (n) { return Math.hypot(n[0] - e[0], n[1] - e[1]) <= 0.5; })) add('F11', f, 'edge' + lab(f.label) + ': its ' + (ei ? 'end' : 'start') + ' is on no node.', ei ? f.g[0].c[f.g[0].c.length - 1] : f.g[0].c[0], 'no node', 'a node within 0.5 m'); });
      });
      // vertical structures beyond the mapping area
      var mov = polys(list.filter(function (f) { return PAVE[f.t]; }));
      if (mov.length) list.forEach(function (f) {
        if (!/^Vertical(Point|Line|Polygonal)Structure$/.test(f.t)) return;
        var c = firstPtM(f);
        if (c && nearestDist(c, mov) > 90 && !within(c, mov, 90)) add('F12', f, f.t + lab(f.label) + ' is ' + Math.round(nearestDist(c, mov)) + ' m from the movement area.', null, Math.round(nearestDist(c, mov)) + ' m', '≤ 50 – 90 m');
      });
      // core types
      if (ad !== '(none)') CORE.forEach(function (t) { if (!stats[ad].types[t]) add('C01', null, ad + ' has no ' + t + '.', withAd(o.slice(), ad), 'none', t); });
      // overlaps and gaps of the paved surface (JSTS)
      if (hasJsts && pave.length > 1) topology(pave, P, ad, add);
      list.forEach(function (f) { delete f.m; });
    });
    var bySev = { error: 0, warning: 0, info: 0 };
    out.forEach(function (x) { bySev[x.sev]++; });
    return { findings: out, ran: ran, stats: stats, bySev: bySev, features: features.length, ms: Date.now() - t0, rules: RULES_VERSION, engine: hasJsts ? 'JSTS ' + (jsts.version || '') : 'built-in only (overlaps and gaps not checked)' };

    function spikes(f, c, closed, Pj) {
      var n = closed ? c.length - 1 : c.length;
      for (var i = 0; i < n; i++) {
        var a = c[i], b = c[(i + 1) % c.length];
        if (i + 1 < c.length && Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.001) { add('X06', f, 'position repeated.', Pj.inv(a), 'repeated', 'distinct positions'); return; }
        if (!closed && (i === 0 || i === n - 1)) continue;
        var pr = c[(i - 1 + n) % n], nx = c[(i + 1) % n];
        if (pr === a || nx === a) continue;
        var v1 = [pr[0] - a[0], pr[1] - a[1]], v2 = [nx[0] - a[0], nx[1] - a[1]], l1 = Math.hypot(v1[0], v1[1]), l2 = Math.hypot(v2[0], v2[1]);
        if (l1 < 1e-6 || l2 < 1e-6) continue;
        var ang = Math.acos(Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2)))) / D2R;
        if (ang < 1) { add('X06', f, 'spike (corner of ' + ang.toFixed(2) + '°).', Pj.inv(a), ang.toFixed(2) + '°', '≥ 1°'); return; }
      }
    }
  }
  function lab(t) { return t ? ' ' + t : ''; }
  function withAd(c, ad) { c.ad = ad; return c; }
  function closeRing(r) { var a = r[0], b = r[r.length - 1]; return (a[0] === b[0] && a[1] === b[1]) ? r : r.concat([a]); }
  function proj(g, P) {
    if (g.t === 'P') return { t: 'P', c: P.fwd(g.c) };
    if (g.t === 'L') return { t: 'L', c: g.c.map(P.fwd) };
    if (g.t === 'A') return { t: 'A', c: g.c.map(function (r) { return r.map(P.fwd); }) };
    return { t: g.t, c: [] };
  }
  function eachPt(g, fn) { if (g.t === 'P') fn(g.c); else if (g.t === 'L') g.c.forEach(fn); else if (g.t === 'A') g.c.forEach(function (r) { r.forEach(fn); }); }
  function firstPt(list) { for (var i = 0; i < list.length; i++) { var g = list[i].g[0]; if (!g) continue; var c = g.t === 'P' ? g.c : g.t === 'L' ? g.c[0] : g.c[0] && g.c[0][0]; if (c && isFinite(c[0]) && !(c[0] === 0 && c[1] === 0)) return c; } return null; }
  function firstPtM(f) { var g = f.m && f.m[0]; if (!g) return null; return g.t === 'P' ? g.c : g.t === 'L' ? g.c[0] : g.c[0] && g.c[0][0]; }
  function anchor(f) { var g = f.g[0]; if (!g) return null; var c = g.t === 'P' ? g.c : g.t === 'L' ? g.c[Math.floor(g.c.length / 2)] : g.c[0] && g.c[0][0]; return c || null; }
  function nearestDist(p, set) { var d = Infinity; set.forEach(function (s) { if (inRing(p, s.rings[0])) d = 0; else d = Math.min(d, ringDist(p, s.rings[0])); }); return d; }

  // overlapping paved elements and small holes in the pavement, with the JSTS geometry engine
  function topology(pave, P, ad, add) {
    var gf = new jsts.geom.GeometryFactory(), items = [];
    function ring(c) { return gf.createLinearRing(closeRing(c).map(function (p) { return new jsts.geom.Coordinate(p[0], p[1]); })); }
    pave.forEach(function (f) {
      f.m.forEach(function (g) {
        if (g.t !== 'A' || !g.c[0] || g.c[0].length < 4) return;
        try {
          var poly = gf.createPolygon(ring(g.c[0]), g.c.slice(1).filter(function (h) { return h.length >= 4; }).map(ring));
          if (!poly.isValid()) poly = poly.buffer(0);
          if (!poly.isEmpty()) items.push({ f: f, g: poly, a: poly.getArea(), env: poly.getEnvelopeInternal() });
        } catch (e) { /* an invalid ring is reported by X02 - X04 */ }
      });
    });
    var tree = new jsts.index.strtree.STRtree();
    items.forEach(function (it, i) { it.i = i; tree.insert(it.env, it); });
    items.forEach(function (it) {
      var hits = tree.query(it.env);
      for (var k = 0; k < hits.size(); k++) {
        var o = hits.get(k);
        if (o.i <= it.i) continue;
        try {
          if (!it.g.intersects(o.g)) continue;
          var x = it.g.intersection(o.g), ar = x.getArea();
          if (ar > 1 && ar > 0.01 * Math.min(it.a, o.a)) {
            var c = x.getCentroid().getCoordinate();
            var small = it.a <= o.a ? it : o, big = small === it ? o : it; // on the smaller element: usually the one drawn too large
            add('X08', small.f, small.f.t + lab(small.f.label) + ' and ' + big.f.t + lab(big.f.label) + ' overlap by ' + ar.toFixed(1) + ' m².', P.inv([c.x, c.y]), ar.toFixed(1) + ' m²', 'no overlap');
          }
        } catch (e) { /* topology exception on a broken polygon */ }
      }
    });
    try {
      var u = jsts.operation.union.UnaryUnionOp.union(gf.createGeometryCollection(items.map(function (it) { return it.g; })));
      for (var i = 0; i < u.getNumGeometries(); i++) {
        var pg = u.getGeometryN(i);
        if (!pg.getNumInteriorRing) continue;
        for (var h = 0; h < pg.getNumInteriorRing(); h++) {
          var hole = gf.createPolygon(pg.getInteriorRingN(h), []), ha = hole.getArea();
          if (ha > 0.01 && ha < 25) { var hc = hole.getCentroid().getCoordinate(); add('X09', items[0].f, 'gap of ' + ha.toFixed(2) + ' m² inside the pavement of ' + ad + '.', P.inv([hc.x, hc.y]), ha.toFixed(2) + ' m²', 'elements that touch'); }
        }
      }
    } catch (e) { /* union failed on broken polygons */ }
  }

  return { RULES: RULES, RULE: RULE, RULES_VERSION: RULES_VERSION, SRC: SRC, collect: collect, check: check, aixmType: aixmType, AIXM_MAPPING: AIXM_MAPPING, REQ: REQ, INTEGRITY: INTEGRITY, plane: plane };
})();
