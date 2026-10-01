/*!
 * AIXM Code Converter
 * Copyright 2026 Prasad <prasad2t@gmail.com> - author of the AIXM Code Converter
 * SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE; keep this notice in all copies)
 * ==========================================================================
 * AIXM Code Converter - data model
 * Dataset finalisation (indexes, references, owners, geometry, temporality),
 * value formatting with AIXM dictionary look-ups, state / AIRAC detection.
 * ========================================================================== */
/* global AX */
var MODEL = (function () {
  'use strict';
  var DICT = null;
  var arr = AX.arr;

  function setDict(d) { DICT = d; }
  function dict() { return DICT; }

  /* ------------------------------------------------------------ constants */
  var AD_COMPONENT = {};
  ('Runway RunwayDirection RunwayCentrelinePoint RunwayElement RunwayMarking RunwayProtectArea RunwayDirectionLightSystem RunwayProtectAreaLightSystem ' +
    'RunwayVisualRange RunwayVisualRangeEquipment RunwayBlastPad ArrestingGear ApproachLightingSystem VisualGlideSlopeIndicator Taxiway TaxiwayElement ' +
    'TaxiwayMarking TaxiwayLightSystem TaxiHoldingPosition TaxiHoldingPositionMarking TaxiHoldingPositionLightSystem Apron ApronElement ApronMarking ' +
    'ApronLightSystem AircraftStand StandMarking GuidanceLine GuidanceLineMarking GuidanceLineLightSystem TouchDownLiftOff TouchDownLiftOffMarking ' +
    'TouchDownLiftOffLightSystem TouchDownLiftOffSafeArea DeicingArea DeicingAreaMarking NonMovementArea WorkArea AirportHotSpot AirportProtectionAreaMarking ' +
    'AirportSign Road SeaplaneLandingArea SeaplaneRampSite FloatingDockSite PassengerLoadingBridge Gangway MarkingBuoy AirportClearanceService ' +
    'AirportSuppliesService AircraftGroundService PassengerService FireFightingService CheckpointINS CheckpointVOR AltimeterCheckpoint AltimeterSource ' +
    'Navaid ObstacleArea Unit AirTrafficControlService InformationService GroundTrafficControlService SearchRescueService Service ' +
    'StandardInstrumentDeparture StandardInstrumentArrival InstrumentApproachProcedure SafeAltitudeArea MinimumAltitudeArea TerminalArrivalArea ' +
    'SurveyControlPoint PilotControlledLighting WeatherSource DepartureLeg ArrivalLeg ArrivalFeederLeg InitialLeg IntermediateLeg FinalLeg MissedApproachLeg').split(' ').forEach(function (k) { AD_COMPONENT[k] = true; });
  // reverse ownership: when the owner is AD-owned, the referenced features belong to the same AD
  var PASS_DOWN = { Navaid: ['navaidEquipment'], ObstacleArea: ['obstacle'], AirTrafficControlService: ['radioCommunication'],
    InformationService: ['radioCommunication'], GroundTrafficControlService: ['radioCommunication'], AirportSuppliesService: ['radioCommunication'],
    AircraftGroundService: ['radioCommunication'], FireFightingService: ['radioCommunication'], SearchRescueService: ['radioCommunication'],
    StandardInstrumentDeparture: ['flightTransition'], StandardInstrumentArrival: ['flightTransition'], InstrumentApproachProcedure: ['flightTransition'] };
  var EQUIPMENT = { VOR: 1, DME: 1, NDB: 1, TACAN: 1, MarkerBeacon: 1, Localizer: 1, Glidepath: 1, Azimuth: 1, Elevation: 1, SDF: 1, DirectionFinder: 1 };
  var SERVICE = { AirTrafficControlService: 1, InformationService: 1, GroundTrafficControlService: 1, SearchRescueService: 1, AirportSuppliesService: 1,
    AircraftGroundService: 1, PassengerService: 1, FireFightingService: 1, AirportClearanceService: 1, AirTrafficManagementService: 1, AirTrafficFlowManagementService: 1, Service: 1 };

  /* ------------------------------------------------------------- finalize */
  function finalize(ds) {
    var t0 = Date.now();
    // 1) absolute line numbers
    var pre = [0], i;
    var recs = ds.recs, byId = new Map(), out = [];
    if (ds.prepared) { // restored from the saved library cache: lines and merges already done
      recs.forEach(function (r) { byId.set(r.id || ('@' + r.o), r); });
      out = recs;
    } else {
    for (i = 0; i < (ds.partLines || []).length; i++) pre[i + 1] = pre[i] + (ds.partLines[i] || 0);
    for (i = 0; i < recs.length; i++) {
      var r = recs[i];
      r.line = pre[r.w || 0] + (r.l || 0) + 1;
      delete r.w; delete r.l;
      if (r.k === '#error') { (ds.parseErrors || (ds.parseErrors = [])).push(r); continue; }
      // 2) merge repeated occurrences of the same feature (e.g. BASELINE + TEMPDELTA members)
      var key = r.id || ('@' + r.o);
      var ex = byId.get(key);
      if (ex && ex.k === r.k) {
        if (!ex.occ) ex.occ = [{ o: ex.o, n: ex.n, line: ex.line }];
        ex.occ.push({ o: r.o, n: r.n, line: r.line });
        r.ts.forEach(function (t) { t.occ = ex.occ.length - 1; });
        ex.ts = ex.ts.concat(r.ts);
        if (r.chg) ex.chg = r.chg;
        continue;
      }
      r.ts.forEach(function (t) { t.occ = 0; });
      byId.set(key, r);
      out.push(r);
    }
    }
    out.sort(function (a, b) { return a.o - b.o; });
    out.forEach(function (r, idx) { r.i = idx; });
    ds.recs = out;
    ds.byId = byId;
    ds.gid = new Map();
    out.forEach(function (r) { if (r.gid) ds.gid.set(r.gid, r); });
    // 3) AIXM 4.5 cross-feature links (airspace borders -> airspace, route segment points)
    if (ds.family === '45') link45(ds);
    // 4) curve index for xlink'ed curve members (border following)
    buildCurveIndex(ds);
    // 5) temporality + indexes
    setViewDate(ds, ds.viewDate === undefined ? null : ds.viewDate);
    ds.byType = {};
    out.forEach(function (r) { (ds.byType[r.k] || (ds.byType[r.k] = [])).push(r); });
    computeMeta(ds);
    ds.tFinalize = Date.now() - t0;
    return ds;
  }

  // a data set whose State comes only from its file name / FIR name takes the State of another
  // loaded data set with the same ICAO prefix (e.g. a Digital NOTAM file next to the baseline)
  var locator = null;
  function setLocator(fn) { locator = fn; }
  function harmonizeStates(list) {
    var strong = list.filter(function (d) { return d.icaoPrefix && /OrganisationAuthority|ICAO location|library folder/.test(d.stateSource || ''); });
    list.forEach(function (d) {
      if (!/file name|FIR name|header origin|ICAO location|geographic/.test(d.stateSource || '') || d.lib) return;
      var hit = strong.filter(function (o) { return o !== d && (o.icaoPrefix === d.icaoPrefix || (d.prefixes || []).indexOf(o.icaoPrefix) >= 0) && o.state !== d.state; })[0];
      if (hit && (/file name|FIR name|header origin|geographic/.test(d.stateSource) || /OrganisationAuthority|library/.test(hit.stateSource))) {
        d.stateDetected = d.state; d.state = hit.state; d.stateSource = 'same ICAO prefix ' + hit.icaoPrefix + ' as ' + hit.name;
      }
    });
  }
  function setViewDate(ds, t) {
    ds.viewDate = t;
    var recs = ds.recs;
    for (var i = 0; i < recs.length; i++) {
      var r = recs[i];
      r.cur = AX.resolve(r, t);
      delete r._lbl;
      r.geo = undefined;
    }
    buildRefIndex(ds);
    computeOwners(ds);
  }

  function target(ds, ref) {
    if (!ref) return null;
    var id = typeof ref === 'string' ? ref : ref.ref;
    if (!id) return null;
    var r = ds.byId.get(id);
    if (r) return r;
    if (id.charAt(0) === '#') return ds.gid.get(id.slice(1)) || ds.byId.get(id) || null;
    return null;
  }

  function eachRef(p, cb, path, depth) {
    if (!p || typeof p !== 'object' || depth > 12) return;
    if (Array.isArray(p)) { for (var i = 0; i < p.length; i++) eachRef(p[i], cb, path, depth + 1); return; }
    if (p.ref !== undefined && typeof p.ref === 'string') { cb(p.ref, path); return; }
    for (var k in p) {
      if (k === '_geo' || k === '_t') continue;
      var v = p[k];
      if (v && typeof v === 'object') eachRef(v, cb, path ? path : k, (depth || 0) + 1);
    }
  }

  function buildRefIndex(ds) {
    var rev = new Map();
    ds.recs.forEach(function (r) {
      r.refs = [];
      eachRef(r.cur.p, function (ref, prop) {
        var t = target(ds, ref);
        if (!t || t === r) return;
        r.refs.push([prop, t]);
        var l = rev.get(t);
        if (!l) rev.set(t, l = []);
        l.push([prop, r]);
      }, '', 0);
    });
    ds.rev = rev;
  }

  function computeOwners(ds) {
    var memo = new Map();
    function own(r, depth) {
      if (r.k === 'AirportHeliport') return r;
      if (memo.has(r)) return memo.get(r);
      if (depth > 5) return null;
      memo.set(r, null);
      var res = null, i, t;
      if (r.cur.p._ad) { t = target(ds, r.cur.p._ad); if (t && t.k === 'AirportHeliport') res = t; }
      for (i = 0; !res && i < r.refs.length; i++) { t = r.refs[i][1]; if (t.k === 'AirportHeliport' && r.refs[i][0] !== 'specialDateAuthority') res = t; }
      if (!res && (AD_COMPONENT[r.k] || EQUIPMENT[r.k] || r.k === 'RadioCommunicationChannel' || r.k.indexOf('45:') === 0)) {
        for (i = 0; !res && i < r.refs.length; i++) {
          t = r.refs[i][1];
          if (AD_COMPONENT[t.k] && t.k !== 'Navaid') res = own(t, depth + 1);
        }
      }
      memo.set(r, res);
      return res;
    }
    var owner = new Map();
    ds.recs.forEach(function (r) { var o = own(r, 0); if (o && o !== r) owner.set(r, o); });
    // pass ownership down (navaid -> equipment, services -> channels, obstacle area -> obstacles)
    ds.recs.forEach(function (r) {
      var o = owner.get(r), props = PASS_DOWN[r.k];
      if (!o || !props) return;
      r.refs.forEach(function (x) {
        if (props.indexOf(x[0]) >= 0 && !owner.has(x[1])) owner.set(x[1], o);
      });
    });
    // services provided by a unit located at an aerodrome
    ds.recs.forEach(function (r) {
      if (!SERVICE[r.k] || owner.has(r)) return;
      var sp = r.refs.filter(function (x) { return x[0] === 'serviceProvider'; })[0];
      if (sp && owner.has(sp[1])) owner.set(r, owner.get(sp[1]));
    });
    ds.recs.forEach(function (r) { // channels of AD services
      if (r.k !== 'RadioCommunicationChannel' || owner.has(r)) return;
      var users = ds.rev.get(r) || [];
      for (var i = 0; i < users.length; i++) if (owner.has(users[i][1])) { owner.set(r, owner.get(users[i][1])); break; }
      if (!owner.has(r) && r.cur.p._service) {
        var s = target(ds, r.cur.p._service);
        if (s && owner.has(s)) owner.set(r, owner.get(s));
      }
    });
    ds.owner = owner;
    var owned = new Map();
    owner.forEach(function (o, r) { var l = owned.get(o); if (!l) owned.set(o, l = []); l.push(r); });
    ds.owned = owned;
  }

  /* --------------------------------------------------------- 4.5 linking */
  function link45(ds) {
    function each(ref, fn) { var t = target(ds, ref); if (t) t.ts.forEach(function (x) { fn(x.p, t); }); return t; }
    ds.recs.forEach(function (r) {
      var p = r.ts[0].p;
      if (ds.prepared && r.k !== '45:Abd') return; // restored from the cache: merges are already in the data
      if (p._contactOf && p._contact) each(p._contactOf, function (tp) { tp.contact = arr(tp.contact).concat([p._contact]); });
      if (p._usageOf && p._usage && p._usage.length) each(p._usageOf, function (tp) { tp.availability = arr(tp.availability).concat([{ _t: 'AirportHeliportAvailability', operationalStatus: 'NORMAL', usage: p._usage }]); });
      if (p._navOf && p._ad) each(p._navOf, function (tp) { if (!tp._ad) tp._ad = p._ad; });
      if (p._obsOf && p._ad) each(p._obsOf, function (tp) { if (!tp._ad) tp._ad = p._ad; if (p._obsNote) tp.annotation = arr(tp.annotation).concat([{ _t: 'Note', translatedNote: { _t: 'LinguisticNote', note: p._obsNote } }]); });
      if (p._svcOf && p._ad) each(p._svcOf, function (tp) { if (!tp._ad) tp._ad = p._ad; });
      if (p._limitOf && p._limitText) each(p._limitOf, function (tp) { tp.annotation = arr(tp.annotation).concat([{ _t: 'Note', propertyName: 'usageLimitation', translatedNote: { _t: 'LinguisticNote', note: p._limitText } }]); });
      if (r.k === '45:Abd' && p._airspace && p._surface) {
        var as = target(ds, p._airspace);
        if (as) {
          as.ts.forEach(function (t) {
            var gc = t.p.geometryComponent;
            if (gc && gc.theAirspaceVolume) gc.theAirspaceVolume.horizontalProjection = p._surface;
          });
          as.o45b = { o: r.o, n: r.n, line: r.line };
        }
      }
      if (r.k === '45:Sae' && r.raw && r.raw.SaeUid) { // service in airspace -> link as clientAirspace
        var u = r.raw.SaeUid;
        if (u.SerUid && u.AseUid) {
          var svc = target(ds, AX.uidKey('SerUid', u.SerUid)), asp = AX.uidKey('AseUid', u.AseUid);
          if (svc) svc.ts.forEach(function (t) { t.p.clientAirspace = arr(t.p.clientAirspace).concat([{ ref: asp }]); });
        }
      }
    });
  }

  function buildCurveIndex(ds) {
    var idx = new Map();
    function walk(v, depth) {
      if (!v || typeof v !== 'object' || depth > 10) return;
      if (Array.isArray(v)) { v.forEach(function (x) { walk(x, depth + 1); }); return; }
      if (v._geo && v._geo.t === 'L' && v._geo.id) idx.set(v._geo.id, v._geo.c);
      for (var k in v) if (k !== '_geo' && v[k] && typeof v[k] === 'object') walk(v[k], depth + 1);
    }
    (ds.byTypeRaw = null);
    ds.recs.forEach(function (r) { if (r.k === 'GeoBorder' || r.k === 'Airspace' || r.k === 'AirspaceBorderCrossing') r.ts.forEach(function (t) { walk(t.p, 0); }); });
    ds.curves = idx;
  }

  /* ------------------------------------------------------------ geometry */
  function resolveRing(ds, ring) {
    if (!ring.some(function (p) { return p[0] === 'ref'; })) return ring;
    var out = [];
    for (var i = 0; i < ring.length; i++) {
      var p = ring[i];
      if (p[0] !== 'ref') { out.push(p); continue; }
      var c = ds.curves.get(String(p[1]).replace(/^#/, ''));
      if (!c) continue;
      // trim the referenced curve between the points closest to the neighbours
      var prev = out[out.length - 1], next = null;
      for (var j = i + 1; j < ring.length; j++) if (ring[j][0] !== 'ref') { next = ring[j]; break; }
      var a = 0, b = c.length - 1;
      if (prev) a = nearest(c, prev);
      if (next) b = nearest(c, next);
      var seg = a <= b ? c.slice(a, b + 1) : c.slice(b, a + 1).reverse();
      out = out.concat(seg);
    }
    return out;
  }
  function nearest(c, p) {
    var best = 0, bd = Infinity;
    for (var i = 0; i < c.length; i++) {
      var dx = c[i][0] - p[0], dy = c[i][1] - p[1], d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  function findGeo(v, want, depth) {
    if (!v || typeof v !== 'object' || depth > 8) return null;
    if (Array.isArray(v)) { for (var i = 0; i < v.length; i++) { var g = findGeo(v[i], want, depth + 1); if (g) return g; } return null; }
    if (v._geo && (!want || want.indexOf(v._geo.t) >= 0)) return v._geo;
    for (var k in v) if (k !== '_geo' && k !== 'annotation' && v[k] && typeof v[k] === 'object') { var gg = findGeo(v[k], want, depth + 1); if (gg) return gg; }
    return null;
  }
  function allGeo(v, want, out, depth) {
    out = out || [];
    if (!v || typeof v !== 'object' || depth > 8) return out;
    if (Array.isArray(v)) { v.forEach(function (x) { allGeo(x, want, out, depth + 1); }); return out; }
    if (v._geo && (!want || want.indexOf(v._geo.t) >= 0)) out.push(v._geo);
    for (var k in v) if (k !== '_geo' && k !== 'annotation' && k !== 'element' && v[k] && typeof v[k] === 'object') allGeo(v[k], want, out, (depth || 0) + 1);
    return out;
  }
  function pointOf(ds, r) {
    if (!r) return null;
    var p = r.cur.p, g;
    switch (r.k) {
      case 'AirportHeliport': g = p.ARP && p.ARP._geo; break;
      case 'RunwayDirection': {
        g = p._thr && p._thr._geo;
        if (!g && ds.rev) {
          var rc = (ds.rev.get(r) || []).filter(function (x) { return x[1].k === 'RunwayCentrelinePoint'; }).map(function (x) { return x[1]; });
          var t1 = rc.filter(function (c) { return s(c.cur.p.role) === 'THR'; })[0] || rc.filter(function (c) { return s(c.cur.p.role) === 'DISTHR'; })[0];
          if (t1) { var tp = pointOf(ds, t1); if (tp) return tp; }
        }
        break;
      }
      case 'VerticalStructure': g = findGeo(p.part, ['P'], 0); break;
      case 'Unit': g = p.position && p.position._geo; break;
      default: g = (p.location && p.location._geo) || null;
    }
    if (g && g.t === 'P') return g.c;
    g = findGeo(p, ['P'], 0);
    if (g) return g.c;
    var any = findGeo(p, ['L', 'A'], 0);
    if (any) { var c = any.t === 'A' ? any.c[0] : any.c; if (c && c.length && typeof c[0][0] === 'number') return c[0]; }
    return null;
  }
  // Map geometry of a feature: {t:'P'|'L'|'A', c, parts?}
  function geometry(ds, r) {
    if (r.geo !== undefined) return r.geo;
    var p = r.cur.p, g = null, list, i;
    switch (r.k) {
      case 'Airspace': {
        list = [];
        arr(p.geometryComponent).forEach(function (gc) {
          var vol = gc && gc.theAirspaceVolume;
          if (vol && vol.horizontalProjection && vol.horizontalProjection._geo) {
            var hg = vol.horizontalProjection._geo;
            list.push({ t: 'A', c: hg.c.map(function (ring) { return resolveRing(ds, ring); }), d: hg.d, op: gc.operation });
          } else if (vol && vol.centreline && vol.centreline._geo) list.push(vol.centreline._geo);
        });
        g = list.length ? (list.length === 1 ? list[0] : { t: 'M', parts: list }) : null;
        break;
      }
      case 'RouteSegment': {
        var ce = p.curveExtent && p.curveExtent._geo;
        if (ce) g = ce;
        else {
          var a = segPoint(ds, p.start), b = segPoint(ds, p.end);
          if (a && b) g = { t: 'L', c: [a, b] };
        }
        break;
      }
      case 'Runway': {
        list = [];
        var dirs = (ds.rev.get(r) || []).filter(function (x) { return x[1].k === 'RunwayDirection'; }).map(function (x) { return x[1]; });
        var thr = [];
        dirs.forEach(function (d) {
          var rc = (ds.rev.get(d) || []).filter(function (x) { return x[1].k === 'RunwayCentrelinePoint'; }).map(function (x) { return x[1]; });
          var t1 = rc.filter(function (c) { return c.cur.p.role === 'THR'; })[0] || rc.filter(function (c) { return c.cur.p.role === 'DISTHR'; })[0];
          var pt = t1 ? pointOf(ds, t1) : (d.cur.p._thr ? d.cur.p._thr._geo.c : null);
          if (pt) thr.push(pt);
        });
        if (thr.length >= 2) g = { t: 'L', c: thr.slice(0, 2), rwy: 1 };
        else {
          var els = (ds.rev.get(r) || []).filter(function (x) { return x[1].k === 'RunwayElement'; });
          var polys = [];
          els.forEach(function (x) { var eg = findGeo(x[1].cur.p, ['A'], 0); if (eg) polys.push(eg); });
          if (polys.length) g = { t: 'M', parts: polys };
          else { var rg = findGeo(p, ['A', 'L'], 0); g = rg || null; }
        }
        break;
      }
      default: {
        var pg = pointOf(ds, r);
        var ag = findGeo(p, ['A'], 0) || findGeo(p, ['L'], 0);
        if (ag && r.k !== 'AirportHeliport' && !EQUIPMENT[r.k] && r.k !== 'Navaid' && r.k !== 'DesignatedPoint' && r.k !== 'VerticalStructure') {
          g = ag.t === 'A' ? { t: 'A', c: ag.c.map(function (ring) { return resolveRing(ds, ring); }), d: ag.d } : ag;
        } else if (r.k === 'VerticalStructure') {
          var parts = allGeo(p.part, null, [], 0);
          if (parts.length === 1) g = parts[0];
          else if (parts.length > 1) g = { t: 'M', parts: parts };
        } else if (pg) g = { t: 'P', c: pg };
      }
    }
    r.geo = g;
    return g;
  }
  function segPoint(ds, sp) {
    if (!sp) return null;
    if (sp._loc && sp._loc._geo) return sp._loc._geo.c;
    var keys = ['pointChoice_fixDesignatedPoint', 'pointChoice_navaidSystem', 'pointChoice_aimingPoint', 'pointChoice_runwayPoint', 'pointChoice_airportReferencePoint', 'pointChoice_position'];
    for (var i = 0; i < keys.length; i++) {
      var v = sp[keys[i]];
      if (!v) continue;
      if (v.ref) { var t = target(ds, v); if (t) return pointOf(ds, t); }
      if (v._geo) return v._geo.c;
    }
    return null;
  }
  function segPointLabel(ds, sp) {
    if (!sp) return '';
    if (sp._label) return sp._label;
    var keys = ['pointChoice_fixDesignatedPoint', 'pointChoice_navaidSystem', 'pointChoice_aimingPoint', 'pointChoice_runwayPoint', 'pointChoice_airportReferencePoint'];
    for (var i = 0; i < keys.length; i++) {
      var v = sp[keys[i]];
      if (v && v.ref) { var t = target(ds, v); if (t) return shortName(t); return v.title || v.ref; }
    }
    if (sp.pointChoice_position && sp.pointChoice_position._geo) return AX.fmtPos(sp.pointChoice_position._geo.c, 0);
    return '';
  }
  function segPointRec(ds, sp) {
    if (!sp) return null;
    var keys = ['pointChoice_fixDesignatedPoint', 'pointChoice_navaidSystem', 'pointChoice_aimingPoint', 'pointChoice_runwayPoint', 'pointChoice_airportReferencePoint'];
    for (var i = 0; i < keys.length; i++) { var v = sp[keys[i]]; if (v && v.ref) return target(ds, v); }
    return null;
  }

  /* ------------------------------------------------------------- labels */
  function s(v) { // simple string of a scalar-ish value
    if (v === undefined || v === null) return '';
    if (Array.isArray(v)) v = v[0];
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return String(v);
    if (v.nil !== undefined) return '';
    if (v.v !== undefined) return v.v;
    if (v._v !== undefined) return v._v;
    return '';
  }
  function routeDesignator(p) {
    var d = s(p.designatorPrefix) + s(p.designatorSecondLetter) + s(p.designatorNumber) + s(p.multipleIdentifier);
    return d || s(p.name) || s(p.locationDesignator);
  }
  function shortName(r) {
    var p = r.cur.p;
    switch (r.k) {
      case 'AirportHeliport': return s(p.locationIndicatorICAO) || s(p.designator) || s(p.name);
      case 'Route': return routeDesignator(p);
      case 'Runway': case 'RunwayDirection': return (s(p.type) === 'FATO' ? 'FATO ' : 'RWY ') + s(p.designator);
      case 'RadioCommunicationChannel': return s(p.frequencyTransmission) ? s(p.frequencyTransmission) + ' ' + unitStr(p.frequencyTransmission) : s(p.channel);
      default: return s(p.designator) || s(p.name) || s(p.type) || (r.id || '').slice(0, 8);
    }
  }
  function unitStr(q) { q = Array.isArray(q) ? q[0] : q; return q && q.u ? (UOM[q.u] !== undefined ? UOM[q.u] : q.u) : ''; }
  function label(ds, r) {
    if (r._lbl) return r._lbl;
    var p = r.cur.p, t, own;
    switch (r.k) {
      case 'AirportHeliport': t = [s(p.locationIndicatorICAO) || s(p.designator), s(p.name)].filter(Boolean).join(' – '); break;
      case 'Runway': own = ds.owner.get(r); t = (own ? shortName(own) + ' ' : '') + shortName(r); break;
      case 'RunwayDirection': own = ds.owner.get(r); t = (own ? shortName(own) + ' ' : '') + shortName(r); break;
      case 'Navaid': t = [s(p.type), s(p.designator), s(p.name)].filter(Boolean).join(' '); break;
      case 'VOR': case 'DME': case 'NDB': case 'TACAN': case 'MarkerBeacon': case 'Localizer': case 'Glidepath':
        t = [r.k === 'MarkerBeacon' ? 'MKR' : r.k === 'Localizer' ? 'LOC' : r.k === 'Glidepath' ? 'GP' : r.k, s(p.designator), s(p.name)].filter(Boolean).join(' '); break;
      case 'DesignatedPoint': t = s(p.designator) || s(p.name); break;
      case 'Airspace': t = [s(p.type), s(p.designator), s(p.name)].filter(Boolean).filter(function (x, i, a) { return a.indexOf(x) === i; }).join(' '); break;
      case 'Route': t = routeDesignator(p) + (s(p.name) && s(p.name) !== routeDesignator(p) ? ' ' + s(p.name) : ''); break;
      case 'RouteSegment': {
        var rt = target(ds, p.routeFormed);
        t = (rt ? routeDesignator(rt.cur.p) + ' ' : '') + segPointLabel(ds, p.start) + ' – ' + segPointLabel(ds, p.end);
        break;
      }
      case 'VerticalStructure': t = s(p.name) || s(p.designator) || ('Obstacle ' + (s(p.type) || '')); break;
      case 'RadioCommunicationChannel': t = shortName(r) + (s(p.mode) ? ' ' + s(p.mode) : ''); break;
      case 'OrganisationAuthority': case 'Unit': t = s(p.name) || s(p.designator); break;
      case 'RunwayCentrelinePoint': {
        var rd = target(ds, p.onRunway);
        t = [rd ? shortName(rd) : '', s(p.role), s(p.designator)].filter(Boolean).join(' ');
        if (!t && p.associatedDeclaredDistance) t = 'Declared distance ' + s(p.associatedDeclaredDistance.type);
        break;
      }
      default: {
        if (SERVICE[r.k]) {
          var cs = p['call-sign'];
          t = [s(p.type), s(p.name), cs && s(cs.callSign)].filter(Boolean).join(' ');
        }
        if (!t) t = s(p.designator) || s(p.name) || s(p.type);
      }
    }
    if (!t) { var pt = pointOf(ds, r); t = typeName(r) + (pt ? ' at ' + AX.fmtPos(pt, 0) : ' ' + (r.id || '').replace(/^.*\[|\]$/g, '').slice(0, 24)); }
    r._lbl = t;
    return t;
  }
  function typeName(r) {
    if (r.k.indexOf('45:') === 0) { var f = DICT && DICT.v45.features[r.s45]; return r.s45 + (f ? ' (' + f.d + ')' : ''); }
    return r.k.replace(/([a-z])([A-Z])/g, '$1 $2');
  }

  /* ----------------------------------------------------------- formatting */
  var UOM = { '[nmi_i]': 'NM', '[ft_i]': 'FT', C: '°C', F: '°F', deg: '°', KM: 'KM', M: 'M', FT: 'FT', FL: 'FL', MHZ: 'MHZ', KHZ: 'KHZ', GHZ: 'GHZ',
    NM: 'NM', KT: 'KT', MPA: 'MPA', SM: 'SM', OTHER: '', T: 'T', LB: 'LB', KG: 'KG', 'M/S': 'M/S', MIN: 'MIN', HR: 'HR', SEC: 'SEC', KM_H: 'KM/H', MI: 'MI', '%': '%' };
  function fq(o) {
    if (o === undefined || o === null) return '';
    if (Array.isArray(o)) return o.map(fq).filter(Boolean).join(', ');
    if (typeof o !== 'object') return String(o);
    if (o.nil !== undefined) return '';
    if (o.v !== undefined) {
      if (o.u === 'FL') return 'FL ' + o.v;
      var u = UOM[o.u] !== undefined ? UOM[o.u] : o.u || '';
      return o.v + (u ? (u.charAt(0) === '°' ? u : ' ' + u) : '');
    }
    return '';
  }
  function fLimit(v, ref) {
    v = Array.isArray(v) ? v[0] : v;
    if (!v || (typeof v === 'object' && v.nil !== undefined)) return '';
    var val = typeof v === 'object' ? v.v : v, u = typeof v === 'object' ? v.u : '';
    if (/^(UNL|GND|FLOOR|CEILING)$/i.test(val) || u === 'OTHER') return String(val).toUpperCase();
    if (u === 'FL') return 'FL ' + val;
    ref = s(ref);
    var rs = { MSL: 'AMSL', SFC: 'AGL', STD: 'STD', W84: 'W84', 'OTHER:ALT': 'AMSL', 'OTHER:HEI': 'AGL' }[ref] || String(ref || '').replace(/^OTHER:/, '');
    if (/^0+(\.0+)?$/.test(val) && ref === 'SFC') return 'GND';
    return val + ' ' + (UOM[u] || u) + (rs ? ' ' + rs : '');
  }
  function fPoint(o, secDec) {
    o = Array.isArray(o) ? o[0] : o;
    if (!o || !o._geo || o._geo.t !== 'P') return '';
    return AX.fmtPos(o._geo.c, secDec === undefined ? 2 : secDec);
  }
  function fElev(o) { o = Array.isArray(o) ? o[0] : o; return o ? fq(o.elevation) : ''; }
  function hhmm(t) { return t ? String(t).replace(':', '').slice(0, 4) : ''; }
  var DAY = { WORK_DAY: 'working days', BEF_WORK_DAY: 'day before working day', AFT_WORK_DAY: 'day after working day', HOL: 'HOL', BEF_HOL: 'day before HOL',
    AFT_HOL: 'day after HOL', BUSY_FRI: 'busy Friday', MON_FRI: 'MON-FRI', SUN_THU: 'SUN-THU', SAT_WED: 'SAT-WED', SAT_THU: 'SAT-THU' };
  function fTimesheet(t) {
    if (!t || t.nil !== undefined) return '';
    if (t._t && t._t !== 'Timesheet') return '';
    var day = s(t.day), til = s(t.dayTil), st = s(t.startTime), et = s(t.endTime), days = '';
    if (day && day !== 'ANY') days = (DAY[day] || day) + (til && til !== day && til !== 'ANY' ? '-' + (DAY[til] || til) : '');
    var time = '';
    if ((st === '00:00' || st === '') && (et === '00:00' || et === '24:00') && !s(t.startEvent) && !s(t.endEvent)) time = 'H24';
    else {
      var a = st ? hhmm(st) : s(t.startEvent) + (s(t.startTimeRelativeEvent) ? (/^-/.test(s(t.startTimeRelativeEvent)) ? '' : '+') + s(t.startTimeRelativeEvent) : '');
      var b = et ? hhmm(et) : s(t.endEvent) + (s(t.endTimeRelativeEvent) ? (/^-/.test(s(t.endTimeRelativeEvent)) ? '' : '+') + s(t.endTimeRelativeEvent) : '');
      time = a || b ? a + '-' + b : '';
    }
    var dates = s(t.startDate) || s(t.endDate) ? (s(t.startDate) + '-' + s(t.endDate)) : '';
    var ref = s(t.timeReference);
    var out = [s(t.excluded) === 'YES' ? 'EXC' : '', days, time, dates, ref && ref !== 'UTC' ? '(' + ref + ')' : ''].filter(Boolean).join(' ');
    return out;
  }
  function fSchedule(av) { // availability objects (…Availability / ServiceOperationalStatus / …)
    var out = [];
    arr(av).forEach(function (a) {
      if (!a || a.nil !== undefined) return;
      var st = s(a.operationalStatus) || s(a.status);
      var times = arr(a.timeInterval).map(fTimesheet).filter(Boolean);
      var notes = notesOf(a, ['timeInterval', 'operationalStatus', '*']);
      var line = times.join(', ');
      if (!line && notes.length) line = notes.join(' ');
      else if (notes.length) line += ' (' + notes.join(' ') + ')';
      if (st && st !== 'NORMAL' && st !== 'OPERATIONAL') line = st + (line ? ': ' + line : '');
      if (line) out.push(line);
    });
    return out.filter(function (x, i, a) { return a.indexOf(x) === i; }).join('\n');
  }
  function noteText(n) {
    if (!n || n.nil !== undefined) return '';
    if (typeof n === 'string') return n;
    var out = [];
    arr(n.translatedNote).forEach(function (ln) {
      if (!ln) return;
      var t = ln.note;
      t = Array.isArray(t) ? t.map(s).join(' ') : typeof t === 'object' && t ? (t.v || t._v || '') : t;
      if (t) out.push(String(t).replace(/\s+/g, ' ').trim());
    });
    return out.join(' ');
  }
  // notes of an object; filter: list of property names ('*' = notes without property name)
  function notesOf(o, filter, used) {
    var out = [];
    arr(o && o.annotation).forEach(function (n) {
      if (!n || n.nil !== undefined) return;
      var pn = s(n.propertyName);
      if (filter) {
        var ok = filter.some(function (f) { return f === '*' ? !pn : pn && pn.toLowerCase() === f.toLowerCase(); });
        if (!ok) return;
      }
      if (used) { if (used.has(n)) return; used.add(n); }
      var t = noteText(n);
      if (t) out.push(t);
    });
    return out;
  }
  function fContact(c) {
    var out = [];
    arr(c).forEach(function (ci) {
      if (!ci || ci.nil !== undefined) return;
      if (s(ci.name)) out.push(s(ci.name));
      arr(ci.address).forEach(function (a) {
        if (!a || a.nil !== undefined) return;
        var line = [s(a.deliveryPoint), s(a.postalCode), s(a.city), s(a.administrativeArea), s(a.country)].filter(Boolean).join(', ');
        if (line) out.push(line);
      });
      arr(ci.phoneFax).forEach(function (t) {
        if (!t || t.nil !== undefined) return;
        if (s(t.voice)) out.push('Tel: ' + s(t.voice));
        if (s(t.facsimile)) out.push('Fax: ' + s(t.facsimile));
      });
      arr(ci.networkNode).forEach(function (n) {
        if (!n || n.nil !== undefined) return;
        if (s(n.eMail)) out.push('Email: ' + s(n.eMail));
        var net = s(n.network), link = s(n.linkage);
        if (link) out.push((net === 'AFTN' || net === 'AFS' ? 'AFS: ' : net === 'INTERNET' || /^https?:/.test(link) ? 'Web: ' : (net ? net + ': ' : '')) + link);
      });
    });
    return out.filter(function (x, i, a) { return a.indexOf(x) === i; }).join('\n');
  }
  function fFreq(ch) {
    var p = ch.cur ? ch.cur.p : ch;
    var parts = [];
    var tx = arr(p.frequencyTransmission).map(fq).filter(Boolean), rx = arr(p.frequencyReception).map(fq).filter(Boolean);
    if (tx.length) parts.push(tx.join(', '));
    if (rx.length && rx.join() !== tx.join()) parts.push('RX ' + rx.join(', '));
    if (!parts.length && s(p.channel)) parts.push(s(p.channel) + (s(p.mode) && /VHF|UHF/.test(s(p.mode)) ? ' MHZ' : ''));
    if (s(p.mode) === 'VHF_833') parts.push('(8.33 kHz)');
    if (s(p.logon)) parts.push('Logon ' + s(p.logon));
    return parts.join(' ');
  }
  // generic value formatter (explorer + fall-backs)
  function fv(ds, v, depth) {
    depth = depth || 0;
    if (v === undefined || v === null) return '';
    if (Array.isArray(v)) {
      var parts = v.map(function (x) { return fv(ds, x, depth + 1); }).filter(Boolean);
      return parts.filter(function (x, i, a) { return a.indexOf(x) === i; }).join('; ');
    }
    if (typeof v !== 'object') return String(v);
    if (v.nil !== undefined) return 'NIL' + (v.nil && v.nil !== 'nil' ? ' (' + v.nil + ')' : '');
    if (v.ref !== undefined) { var t = ds ? target(ds, v) : null; return t ? label(ds, t) : (v.title || v.ref); }
    if (v.v !== undefined) return fq(v);
    if (v._geo) {
      var g = v._geo;
      var extra = v.elevation && v.elevation.v !== undefined ? ' elev ' + fq(v.elevation) : '';
      if (g.t === 'P') return AX.fmtPos(g.c, 2) + extra;
      if (g.t === 'L') return 'Line, ' + g.c.length + ' points' + extra;
      if (g.t === 'A') return 'Area, ' + g.c[0].length + ' points' + extra;
    }
    if (v._t === 'Timesheet') return fTimesheet(v);
    if (v._t === 'Note') return noteText(v);
    if (v._t === 'ContactInformation') return fContact(v).replace(/\n/g, '; ');
    if (v._v !== undefined) return String(v._v);
    if (depth > 2) return v._t || '';
    var bits = [];
    for (var k in v) {
      if (k === '_t' || k === 'annotation') continue;
      var x = fv(ds, v[k], depth + 1);
      if (x && !/^NIL/.test(x)) bits.push(k + ': ' + x);
      if (bits.length > 6) break;
    }
    return bits.join(', ');
  }

  /* ------------------------------------------------------ dictionary look-ups */
  function propDef(featureType, prop, objType) {
    if (!DICT) return null;
    var e = objType ? DICT.v5.objects[objType] : DICT.v5.features[featureType];
    if (e && e.p && e.p[prop]) return e.p[prop];
    return null;
  }
  function featureDef(k) {
    if (!DICT) return '';
    if (k.indexOf('45:') === 0) { var f = DICT.v45.features[k.slice(3)]; return f ? f.d : ''; }
    var e = DICT.v5.features[k] || DICT.v5.objects[k];
    return e ? e.d : '';
  }
  function codeDef(featureType, prop, value, objType) {
    var pd = propDef(featureType, prop, objType);
    if (!pd || !value || typeof value !== 'string') return '';
    var cl = DICT.v5.codes[pd.t];
    if (!cl) return '';
    if (value.indexOf('OTHER') === 0) return 'Other: ' + value.replace(/^OTHER:?/, '').replace(/_/g, ' ');
    return cl.v[value] || '';
  }
  function def45(s45, prop) {
    if (!DICT) return null;
    var f = DICT.v45.features[s45];
    if (!f) return null;
    var t = DICT.v45.types[f.type];
    if (!t) return null;
    for (var i = 0; i < t.e.length; i++) if (t.e[i][0] === prop) {
      var c = DICT.v45.codes[t.e[i][1]];
      return { d: t.e[i][2], code: c || null, t: t.e[i][1] };
    }
    return null;
  }

  /* ------------------------------------------------------ dataset metadata */
  function computeMeta(ds) {
    var sn = ds.sniff || {};
    // State: STATE organisation, else majority ICAO prefix of aerodromes, else FIR designator
    var state = null, src = '';
    var orgs = ds.byType.OrganisationAuthority || [];
    var st = orgs.filter(function (o) { return /^(STATE|S)$/.test(s(o.cur.p.type)) && s(o.cur.p.name); });
    if (st.length > 1) st.sort(function (a, b) { return (ds.rev && (ds.rev.get(b) || []).length || 0) - (ds.rev && (ds.rev.get(a) || []).length || 0); });
    if (st.length) { state = s(st[0].cur.p.name); src = 'OrganisationAuthority (type STATE)' + (st.length > 1 ? ', the most referenced of ' + st.length : ''); }
    var ads = ds.byType.AirportHeliport || [];
    var counts = {};
    ads.forEach(function (a) {
      var code = s(a.cur.p.locationIndicatorICAO) || s(a.cur.p.designator);
      var pf = AX.icaoPrefixOf(code);
      if (pf) counts[pf] = (counts[pf] || 0) + 1;
    });
    var fir = (ds.byType.Airspace || []).filter(function (a) { return /^FIR/.test(s(a.cur.p.type)); });
    fir.forEach(function (a) { var pf = AX.icaoPrefixOf(s(a.cur.p.designator)); if (pf) counts[pf] = (counts[pf] || 0) + 0.5; });
    function addCode(c, w) { c = String(c || '').toUpperCase(); if (!AX.stateFromICAO(c)) return; var pf = AX.icaoPrefixOf(c); counts[pf] = (counts[pf] || 0) + w; }
    // Digital NOTAM events: NOTAM location / FIR, concerned aerodromes
    (ds.byType.Event || []).forEach(function (e) {
      arr(e.cur.p.notification).forEach(function (n) { if (n && typeof n === 'object') { addCode(s(n.location), 1); addCode(s(n.affectedFIR), 0.5); } });
      arr(e.cur.p.concernedAirportHeliport).forEach(function (x) { var m = /^([A-Z]{4})\b/.exec(x && x.title || ''); if (m) addCode(m[1], 1); });
    });
    // instrument procedure names often end with the aerodrome's location indicator ("… RWY 22L KEWR")
    ['InstrumentApproachProcedure', 'StandardInstrumentDeparture', 'StandardInstrumentArrival'].forEach(function (k) {
      (ds.byType[k] || []).slice(0, 500).forEach(function (r) { var m = /\b([A-Z]{4})\s*$/.exec(s(r.cur.p.name)); if (m) addCode(m[1], 0.5); });
    });
    // nothing yet: location indicators in xlink:title of references to aerodromes / FIRs
    if (!Object.keys(counts).length) {
      var nRef = 0;
      for (var ri = 0; ri < ds.recs.length && ri < 5000 && nRef < 400; ri++) {
        eachRef(ds.recs[ri].cur.p, function (ref) { var m = /^([A-Z]{4}) (?!\d)/.exec(ref && ref.title || ''); if (m) { addCode(m[1], 0.3); nRef++; } });
      }
    }
    var best = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; })[0];
    ds.icaoPrefix = best || null;
    var byPrefix = best ? AX.stateFromICAO(best.length === 1 ? best + 'XXX' : (best + 'XX').slice(0, 4)) : null;
    if (!state && byPrefix) { state = byPrefix; src = 'ICAO location indicator prefix ' + best; }
    else if (state && byPrefix && byPrefix.toUpperCase().indexOf(state.toUpperCase()) < 0) ds.stateAlt = byPrefix;
    if (!state && fir.length) { state = s(fir[0].cur.p.name); src = 'FIR name'; }
    if (!state && sn.header && sn.header.origin && /[a-z]{3}/i.test(sn.header.origin) && !/^(SDO|EAD|AIXM|OFMX)$/i.test(sn.header.origin)) { state = sn.header.origin; src = 'AIXM 4.5 header origin'; }
    if (!state && locator) { // geographic position of the data inside a country outline
      var pts = [], step = Math.max(1, Math.floor(ds.recs.length / 1500));
      for (var pi = 0; pi < ds.recs.length; pi += step) { var pp = pointOf(ds, ds.recs[pi]); if (pp && typeof pp[0] === 'number') pts.push(pp); }
      if (pts.length) {
        var lons = pts.map(function (x) { return x[0]; }).sort(function (a, b) { return a - b; }), lats = pts.map(function (x) { return x[1]; }).sort(function (a, b) { return a - b; });
        var mid = Math.floor(pts.length / 2), cname = null;
        try { cname = locator(lons[mid], lats[mid]); } catch (e) { cname = null; }
        if (!cname) { var votes = {}; pts.slice(0, 300).forEach(function (x) { var n = null; try { n = locator(x[0], x[1]); } catch (e) { n = null; } if (n) votes[n] = (votes[n] || 0) + 1; }); cname = Object.keys(votes).sort(function (a, b) { return votes[b] - votes[a]; })[0] || null; }
        var ALIAS = { 'United States of America': 'United States', Russia: 'Russian Federation', Vietnam: 'Viet Nam', 'South Korea': 'Republic of Korea', 'North Korea': "Democratic People's Republic of Korea",
          'Dem. Rep. Congo': 'Democratic Republic of the Congo', Laos: "Lao People's Democratic Republic", Tanzania: 'United Republic of Tanzania', Bolivia: 'Bolivia (Plurinational State of)', Venezuela: 'Venezuela (Bolivarian Republic of)', Moldova: 'Republic of Moldova' };
        if (cname) { state = ALIAS[cname] || cname; src = 'geographic position of the data'; }
      }
    }
    if (!state) { state = ds.name.replace(/\.[^.]+$/, ''); src = 'file name'; }
    ds.state = state; ds.stateSource = src;
    ds.prefixes = Object.keys(counts);
    // Effective date: file name date, header, or latest baseline start
    var cands = [];
    var fm = /(20\d\d|19\d\d)[-_]?(0[1-9]|1[0-2])[-_]?(0[1-9]|[12]\d|3[01])/.exec(ds.name);
    if (fm) cands.push({ t: Date.UTC(+fm[1], +fm[2] - 1, +fm[3]), src: 'file name' });
    if (sn.header && sn.header.effective) { var he = AX.tms(sn.header.effective); if (he !== null) cands.unshift({ t: he, src: 'AIXM 4.5 header (effective)' }); }
    var maxB = null, minB = null, begins = {};
    ds.recs.forEach(function (r) {
      r.ts.forEach(function (t) {
        if (t.i === 'TEMPDELTA') return;
        var b = AX.tms(t.b);
        if (b === null) return;
        if (maxB === null || b > maxB) maxB = b;
        if (minB === null || b < minB) minB = b;
        var d = Math.floor(b / 86400000);
        begins[d] = (begins[d] || 0) + 1;
      });
    });
    var mode = Object.keys(begins).sort(function (a, b) { return begins[b] - begins[a]; })[0];
    ds.dataFrom = minB; ds.dataLatest = maxB;
    if (maxB !== null) cands.push({ t: maxB, src: 'latest time-slice start in the data' });
    if (mode) ds.dataMode = +mode * 86400000;
    ds.effective = cands.length ? cands[0].t : null;
    ds.effectiveSource = cands.length ? cands[0].src : '';
    ds.effectiveCands = cands;
    ds.airac = ds.effective !== null ? AX.airac(ds.effective) : null;
    ds.created = sn.header && (sn.header.created || sn.header.origin) ? sn.header.created : null;
    // counts
    var stats = {};
    ds.recs.forEach(function (r) { stats[r.k] = (stats[r.k] || 0) + 1; });
    ds.stats = stats;
  }

  // effective date for an aerodrome = latest time-slice start among its own + owned features
  function adEffective(ds, ad) {
    var list = [ad].concat(ds.owned.get(ad) || []), best = null;
    list.forEach(function (r) { var b = AX.tms(r.cur.b); if (b !== null && (best === null || b > best)) best = b; });
    return best;
  }

  function fmtDate(t, withTime) {
    if (t === null || t === undefined || isNaN(t)) return '';
    var d = new Date(t), iso = d.toISOString();
    var mon = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][d.getUTCMonth()];
    var out = String(d.getUTCDate()).padStart(2, '0') + ' ' + mon + ' ' + d.getUTCFullYear();
    if (withTime && iso.slice(11, 16) !== '00:00') out += ' ' + iso.slice(11, 16) + 'Z';
    return out;
  }
  function fmtTs(str) { if (typeof str === 'number') return fmtDate(str, true); var t = AX.tms(str); return t === null ? (str || '') : fmtDate(t, true); }

  return {
    setDict: setDict, dict: dict, finalize: finalize, setViewDate: setViewDate, harmonizeStates: harmonizeStates, setLocator: setLocator, target: target, eachRef: eachRef,
    geometry: geometry, pointOf: pointOf, findGeo: findGeo, segPoint: segPoint, segPointLabel: segPointLabel, segPointRec: segPointRec,
    label: label, shortName: shortName, typeName: typeName, routeDesignator: routeDesignator, s: s,
    fq: fq, fLimit: fLimit, fPoint: fPoint, fElev: fElev, fTimesheet: fTimesheet, fSchedule: fSchedule, noteText: noteText, notesOf: notesOf,
    fContact: fContact, fFreq: fFreq, fv: fv, propDef: propDef, featureDef: featureDef, codeDef: codeDef, def45: def45,
    adEffective: adEffective, fmtDate: fmtDate, fmtTs: fmtTs, AD_COMPONENT: AD_COMPONENT, EQUIPMENT: EQUIPMENT, SERVICE: SERVICE, UOM: UOM
  };
})();
