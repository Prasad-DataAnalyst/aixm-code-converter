/*!
 * AIXM Code Converter
 * Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com> - author of the AIXM Code Converter
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
  var PROC_KIND = { StandardInstrumentDeparture: 1, StandardInstrumentArrival: 1, InstrumentApproachProcedure: 1 };
  var LEG_KIND = ['DepartureLeg', 'ArrivalLeg', 'ArrivalFeederLeg', 'InitialLeg', 'IntermediateLeg', 'FinalLeg', 'MissedApproachLeg'];
  var SERVICE = { AirTrafficControlService: 1, InformationService: 1, GroundTrafficControlService: 1, SearchRescueService: 1, AirportSuppliesService: 1,
    AircraftGroundService: 1, PassengerService: 1, FireFightingService: 1, AirportClearanceService: 1, AirTrafficManagementService: 1, AirTrafficFlowManagementService: 1, Service: 1 };

  /* ------------------------------------------------------------- finalize */
  // The work is split into stages: finalize() runs them at once, finalizeAsync() lets the browser draw and react
  // between them (a large file used to freeze the page for a second or two at the end of reading).
  function finalizeStages(ds) {
    var t0 = Date.now(), recs = ds.recs, byId = new Map(), out = [];
    return [
      function () { // 1) absolute line numbers, 2) merge repeated occurrences of the same feature (e.g. BASELINE + TEMPDELTA members)
        var pre = [0], i;
        if (ds.prepared) { // restored from the saved library cache: lines and merges already done
          recs.forEach(function (r) { byId.set(r.id || ('@' + (r.f || 0) + ':' + r.o), r); });
          out = recs;
          return;
        }
        // line numbers count from the start of each file (a data set can be read from several files: ds.partFile)
        var pf = ds.partFile;
        for (i = 0; i < (ds.partLines || []).length; i++) pre[i + 1] = pf && pf[i + 1] !== pf[i] ? 0 : pre[i] + (ds.partLines[i] || 0);
        for (i = 0; i < recs.length; i++) {
          var r = recs[i];
          r.line = pre[r.w || 0] + (r.l || 0) + 1;
          delete r.w; delete r.l;
          if (r.k === '#error') { (ds.parseErrors || (ds.parseErrors = [])).push(r); continue; }
          r.ts.forEach(function (t, j) { t.nth = j; }); // position of the time slice in its own XML fragment
          var key = r.id || ('@' + (r.f || 0) + ':' + r.o);
          var ex = byId.get(key);
          if (ex && ex.k === r.k) {
            if (!ex.occ) ex.occ = [occOf(ex)];
            ex.occ.push(occOf(r));
            var oi = ex.occ.length - 1;
            // the same time slice delivered twice (e.g. in a baseline file and in a difference file) is kept once
            r.ts.forEach(function (t) { t.occ = oi; if (!ex.ts.some(function (x) { return sameSlice(x, t); })) ex.ts.push(t); });
            if (r.chg) ex.chg = r.chg;
            continue;
          }
          r.ts.forEach(function (t) { t.occ = 0; });
          byId.set(key, r);
          out.push(r);
        }
      },
      function () {
        out.sort(function (a, b) { return (a.f || 0) - (b.f || 0) || a.o - b.o; });
        out.forEach(function (r, idx) { r.i = idx; });
        ds.recs = out;
        ds.byId = byId;
        ds.gid = new Map();
        out.forEach(function (r) { if (r.gid) ds.gid.set(r.gid, r); });
        // 3) AIXM 4.5 cross-feature links (airspace borders -> airspace, route segment points); AMXM: the aerodromes,
        // runways, runway directions, taxiways and aprons its features name
        if (ds.family === '45') link45(ds);
        if (ds.family === 'amxm') linkAmxm(ds);
        // 4) curve index for xlink'ed curve members (border following)
        buildCurveIndex(ds);
      },
      // 5) temporality + indexes
      function () { resolveAll(ds, ds.viewDate === undefined ? null : ds.viewDate); },
      function () { buildRefIndex(ds); },
      function () { computeOwners(ds); },
      function () {
        byTypeOf(ds);
        computeMeta(ds);
        ds.tFinalize = Date.now() - t0;
      }
    ];
  }
  // AMXM (aerodrome mapping): features name their aerodrome (idarpt), runway (idrwy), threshold (idthr), taxiway
  // (idlin) and apron (idapron) by code only. The AIXM features those codes stand for are added once (marked syn),
  // each pointing at the first AMXM feature that names it, so that its AIXM code can be shown.
  function linkAmxm(ds) {
    var add = [], byId = ds.byId;
    function sv(v) { v = Array.isArray(v) ? v[0] : v; return typeof v === 'string' ? v : v && v.v !== undefined ? String(v.v) : ''; }
    function make(k, id, src, p) {
      if (byId.has(id)) return byId.get(id);
      var r = { k: k, id: id, syn: true, o: src.o, n: src.n, line: src.line, ts: [{ i: 'BASELINE', s: 1, c: 0, b: null, e: null, p: p, nth: 0, occ: 0 }] };
      if (src.f) r.f = src.f;
      byId.set(id, r); add.push(r);
      return r;
    }
    var stands = new Map(), widths = new Map(), lengths = new Map();
    ds.recs.forEach(function (r) {
      var p = r.ts[0] && r.ts[0].p;
      if (!p || !p._amxm || r.syn) return;
      var ad = sv(p.idarpt) || 'UNKNOWN', adId = AX.amxmId(ad, 'ad', '');
      make('AirportHeliport', adId, r, { locationIndicatorICAO: ad, _amxm: 'aerodrome (named by idarpt)' });
      if (p.associatedRunway) {
        var rid = p.associatedRunway.ref, w = parseFloat(sv(p.width)), l = parseFloat(sv(p.length));
        if (!isNaN(w)) widths.set(rid, Math.max(widths.get(rid) || 0, w));
        if (!isNaN(l)) lengths.set(rid, Math.max(lengths.get(rid) || 0, l));
        var rp = { designator: sv(p.idrwy).replace(/^([0-9]{2}[LRC]?)\.([0-9]{2}[LRC]?)$/, '$1/$2'), type: /FATO/.test(sv(p.type)) ? 'FATO' : 'RWY', _ad: { ref: adId }, _amxm: 'runway (named by idrwy)' };
        make('Runway', rid, r, rp);
      }
      if (p.associatedTaxiway) make('Taxiway', p.associatedTaxiway.ref, r, { designator: sv(p.idlin), _ad: { ref: adId }, _amxm: 'taxiway (named by idlin)' });
      if (p.connectedTaxiway) make('Taxiway', p.connectedTaxiway.ref, r, { designator: sv(p.idlin), _ad: { ref: adId }, _amxm: 'taxiway (named by idlin)' });
      if (p.associatedApron) make('Apron', p.associatedApron.ref, r, { name: sv(p.idapron), designator: sv(p.idapron), _ad: { ref: adId }, _amxm: 'apron (named by idapron)' });
      if ((p._amxm === 'ParkingStandArea' || p._amxm === 'ParkingStandLocation') && sv(p.idstd)) { // stands without a designator are not paired
        var sk = adId + '|' + sv(p.idstd), e = stands.get(sk) || {};
        e[p._amxm === 'ParkingStandArea' ? 'area' : 'loc'] = r; stands.set(sk, e);
      }
    });
    // runway directions: one per threshold, on the runway whose designator names it (e.g. 14L on "14L/32R")
    var rwyEnd = new Map(); // aerodrome | threshold designator -> runway
    // runway designators: "14L/32R", or with a period as AMXM writes them ("07L.25R")
    add.forEach(function (x) { if (x.k === 'Runway') String(x.ts[0].p.designator || '').split(/[/.-]/).forEach(function (d) { var k = x.ts[0].p._ad.ref + '|' + d.trim(); if (!rwyEnd.has(k)) rwyEnd.set(k, x); }); });
    ds.recs.forEach(function (r) {
      var p = r.ts[0] && r.ts[0].p;
      if (!p || p._amxm !== 'RunwayThreshold' || !p.onRunway) return;
      var ad = sv(p.idarpt) || 'UNKNOWN', thr = sv(p.idthr), rwy = rwyEnd.get(AX.amxmId(ad, 'ad', '') + '|' + thr) || null;
      var dp = { designator: thr, _ad: { ref: AX.amxmId(ad, 'ad', '') }, _amxm: 'runway direction (named by idthr)' };
      if (sv(p.brngtrue)) dp.trueBearing = sv(p.brngtrue);
      if (sv(p.brngmag)) dp.magneticBearing = sv(p.brngmag);
      if (rwy) dp.usedRunway = { ref: rwy.id };
      make('RunwayDirection', p.onRunway.ref, r, dp);
    });
    widths.forEach(function (w, id) { var x = byId.get(id); if (x && x.syn) x.ts[0].p.nominalWidth = { v: String(w), u: 'M' }; });
    lengths.forEach(function (l, id) { var x = byId.get(id); if (x && x.syn) x.ts[0].p.nominalLength = { v: String(l), u: 'M' }; });
    // a stand given as an area and as a location: one stand, labelled at its location
    var drop = new Set();
    stands.forEach(function (e) {
      if (!e.area || !e.loc) return;
      var lp = e.loc.ts[0].p;
      if (lp.location) e.area.ts[0].p.location = lp.location;
      drop.add(e.loc);
      var lk = e.loc.id || ('@' + (e.loc.f || 0) + ':' + e.loc.o);
      if (byId.get(lk) === e.loc) byId.delete(lk);
    });
    var list = ds.recs.filter(function (r) { return !drop.has(r); }).concat(add);
    list.sort(function (a, b) { return (a.f || 0) - (b.f || 0) || a.o - b.o || (a.syn ? 1 : 0) - (b.syn ? 1 : 0); });
    list.forEach(function (r, i) { r.i = i; });
    ds.recs = list;
  }
  function occOf(r) { var o = { o: r.o, n: r.n, line: r.line }; if (r.f) o.f = r.f; return o; }
  function sameSlice(a, b) { return a.i === b.i && a.s === b.s && a.c === b.c && a.b === b.b && a.e === b.e; }
  function finalize(ds) {
    finalizeStages(ds).forEach(function (f) { f(); });
    return ds;
  }
  // gives control back to the browser (MessageChannel: not slowed to once a second in a background tab)
  var chan = typeof MessageChannel === 'function' ? new MessageChannel() : null, waiting = [];
  if (chan) chan.port1.onmessage = function () { var w = waiting.shift(); if (w) w(); };
  function breathe() { return new Promise(function (r) { if (chan) { waiting.push(r); chan.port2.postMessage(0); } else setTimeout(r, 0); }); }
  async function finalizeAsync(ds, onStage) {
    var st = finalizeStages(ds);
    ds.tStages = [];
    for (var i = 0; i < st.length; i++) {
      var t = Date.now();
      st[i]();
      ds.tStages.push(Date.now() - t);
      if (onStage) onStage((i + 1) / st.length);
      await breathe();
    }
    return ds;
  }

  // a data set whose State comes only from its file name / FIR name takes the State of another
  // loaded data set with the same ICAO prefix (e.g. a Digital NOTAM file next to the baseline)
  var locator = null;
  function setLocator(fn) { locator = fn; }
  function harmonizeStates(list) {
    var strong = list.filter(function (d) { return d.icaoPrefix && /OrganisationAuthority|ICAO location|library folder|several States/.test(d.stateSource || ''); });
    list.forEach(function (d) {
      if (!/file name|FIR name|header origin|ICAO location|geographic|metadata/.test(d.stateSource || '') || d.lib) return;
      var hit = strong.filter(function (o) { return o !== d && (o.icaoPrefix === d.icaoPrefix || (d.prefixes || []).indexOf(o.icaoPrefix) >= 0) && o.state !== d.state; })[0];
      if (hit && (/file name|FIR name|header origin|geographic|metadata/.test(d.stateSource) || /OrganisationAuthority|library/.test(hit.stateSource))) {
        d.stateDetected = d.state; d.state = hit.state; d.stateSource = 'same ICAO prefix ' + hit.icaoPrefix + ' as ' + hit.name;
      }
    });
  }
  function resolveAll(ds, t) {
    ds.viewDate = t;
    var recs = ds.recs, i, j;
    // the moment the AIP shows: the chosen date, or for the latest data the latest start of a time slice in the data
    var at = t;
    if (at === null || at === undefined) {
      at = null;
      for (i = 0; i < recs.length; i++) for (j = 0; j < recs[i].ts.length; j++) {
        var x = recs[i].ts[j];
        if (x.i === 'TEMPDELTA') continue;
        var b = AX.tms(x.b);
        if (b !== null && (at === null || b > at)) at = b;
      }
    }
    ds.atMoment = at;
    for (i = 0; i < recs.length; i++) {
      var r = recs[i];
      r.cur = AX.resolve(r, t);
      // withdrawn: the feature's lifetime has ended, or its last time slice ended, before that moment
      if (at !== null && r.cur.idx >= 0) {
        var c = r.ts[r.cur.idx], le = AX.tms(c.le), ce = AX.tms(r.cur.e), later = false;
        if (ce !== null && ce <= at) for (j = 0; j < r.ts.length && !later; j++) { var o = r.ts[j]; if (o.i !== 'TEMPDELTA' && j !== r.cur.idx && (AX.tms(o.b) || 0) >= ce && (AX.tms(o.b) || 0) <= at) later = true; }
        if ((le !== null && le <= at) || (ce !== null && ce <= at && !later)) r.cur.gone = true;
      }
      delete r._lbl;
      r.geo = undefined;
    }
  }
  // features by type, without withdrawn ones (they stay in ds.recs for the change lists and the XML view)
  function byTypeOf(ds) {
    ds.byType = {}; ds.withdrawn = 0;
    ds.recs.forEach(function (r) { if (r.cur && r.cur.gone) { ds.withdrawn++; return; } (ds.byType[r.k] || (ds.byType[r.k] = [])).push(r); });
  }
  function setViewDate(ds, t) {
    resolveAll(ds, t);
    byTypeOf(ds);
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
      if (r.cur.gone) return; // withdrawn features are not linked (not owned by an aerodrome, not listed)
      eachRef(r.cur.p, function (ref, prop) {
        var t = target(ds, ref);
        if (!t || t === r || t.cur.gone) return;
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
    ds.recs.forEach(function (r) { if (r.cur.gone) return; var o = own(r, 0); if (o && o !== r) owner.set(r, o); });
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
    // instrument flight procedure data: minimum sector altitudes and terminal arrival areas belong to the aerodrome of
    // the procedures that use them; a terminal holding to the aerodrome whose procedure legs use its fix, else (as an
    // MSA) to the nearest aerodrome within 25 NM of it
    var procOwner = function (x) { return (ds.rev.get(x) || []).map(function (u) { return owner.get(u[1]); }).filter(Boolean)[0] || null; };
    var fixUse = new Map(); // fix -> aerodrome of a procedure leg using it
    LEG_KIND.forEach(function (k) {
      ds.recs.forEach(function (l) {
        if (l.k !== k || l.cur.gone) return;
        var o = owner.get(l);
        if (o) l.refs.forEach(function (x) { if (/^(startPoint|endPoint)$/.test(x[0]) && !fixUse.has(x[1])) fixUse.set(x[1], o); });
      });
    });
    var ads = ds.recs.filter(function (r) { return r.k === 'AirportHeliport' && !r.cur.gone; }).map(function (a) { return [a, pointOf(ds, a)]; }).filter(function (x) { return x[1]; });
    function nearestAd(c) {
      var best = null, bd = 25;
      if (c) ads.forEach(function (x) { var d = AX.distNM(c, x[1]); if (d < bd) { bd = d; best = x[0]; } });
      return best;
    }
    ds.recs.forEach(function (r) {
      if (r.cur.gone || owner.has(r)) return;
      var o = null;
      if (r.k === 'SafeAltitudeArea' || r.k === 'TerminalArrivalArea') {
        o = procOwner(r);
        if (!o) for (var i = 0; !o && i < r.refs.length; i++) if (PROC_KIND[r.refs[i][1].k]) o = owner.get(r.refs[i][1]) || null; // TAA -> its approach
        if (!o && r.k === 'SafeAltitudeArea') { var cp = r.refs.filter(function (x) { return /^centrePoint/.test(x[0]); })[0]; o = nearestAd(cp ? pointOf(ds, cp[1]) : null); }
      } else if (r.k === 'HoldingPattern' && s(r.cur.p.type) === 'TER') {
        var hp = r.refs.filter(function (x) { return x[0] === 'holdingPoint'; })[0];
        o = (hp && fixUse.get(hp[1])) || procOwner(r) || nearestAd(hp ? pointOf(ds, hp[1]) : null);
      }
      if (o) owner.set(r, o);
    });
    // withdrawn features are not listed with their aerodrome, but the change lists still name its AD section
    ds.goneOwner = new Map();
    ds.recs.forEach(function (r) {
      if (!r.cur.gone) return;
      r.refs = [];
      eachRef(r.cur.p, function (ref, prop) { var x = target(ds, ref); if (x && x !== r) r.refs.push([prop, x]); }, '', 0);
    });
    ds.recs.forEach(function (r) { if (r.cur.gone) { memo.delete(r); var o = own(r, 0); if (o && o !== r) ds.goneOwner.set(r, o); } });
    ds.recs.forEach(function (r) {
      var o = ds.goneOwner.get(r), props = PASS_DOWN[r.k];
      if (o && props) r.refs.forEach(function (x) { if (props.indexOf(x[0]) >= 0 && x[1].cur.gone && !ds.goneOwner.has(x[1])) ds.goneOwner.set(x[1], o); });
    });
    ds.recs.forEach(function (r) { if (r.cur.gone) r.refs = []; });
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
  function isPt(p) { return p && typeof p[0] === 'number'; }
  // the curve a boundary follows (curveMember xlink:href): a curve by its gml:id (also inside an XPointer link), else the
  // feature by its identifier (urn:uuid:…): a GeoBorder's border, or another feature's line
  function borderCurve(ds, href) {
    var h = String(href || ''), c = ds.curves && ds.curves.get(h.replace(/^#/, ''));
    var m = !c && /@(?:[\w-]+:)?id\s*=\s*['"]([^'"]+)['"]/.exec(h);
    if (m && ds.curves) c = ds.curves.get(m[1]);
    if (c) return c.every(isPt) ? c : c.filter(isPt);
    var r = target(ds, AX.normRef(h));
    if (!r || !r.cur || r.cur.gone) return null;
    var g = findGeo(r.cur.p.border || r.cur.p, ['L'], 0);
    return g && g.c && g.c.length > 1 ? g.c.filter(isPt) : null;
  }
  // a point held by another feature (gml:pointProperty xlink:href to a fix, navaid, …): its position
  function refPoint(ds, href) {
    var h = String(href || ''), r = target(ds, AX.normRef(h));
    if (!r && h.charAt(0) === '#') r = ds.gid.get(h.slice(1)) || null;
    return r && !r.cur.gone ? pointOf(ds, r) : null;
  }
  // position of p along the polyline c: segment index + fraction (nearest point, distances scaled by cos(lat))
  function along(c, p) {
    var best = 0, bd = Infinity, k = Math.cos(p[1] * Math.PI / 180);
    for (var i = 0; i + 1 < c.length; i++) {
      var ax = (c[i][0] - p[0]) * k, ay = c[i][1] - p[1], dx = (c[i + 1][0] - c[i][0]) * k, dy = c[i + 1][1] - c[i][1];
      var l2 = dx * dx + dy * dy, t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
      var ex = ax + t * dx, ey = ay + t * dy, d = ex * ex + ey * ey;
      if (d < bd) { bd = d; best = i + t; }
    }
    return best;
  }
  // a boundary as drawn: links resolved (borders followed between the neighbouring points, referenced points and arc
  // centres looked up); the parser leaves them as ['ref', href], ['pt', href], ['arc', href, rNM, b1, b2, cw],
  // ['circle', href, rNM]. Unresolved links are left out (the airspace checks report them).
  function resolveRing(ds, ring, open) {
    if (ring.every(isPt)) return ring;
    var flat = [];
    function add(q) { var l = flat[flat.length - 1]; if (!isPt(l) || l[0] !== q[0] || l[1] !== q[1]) flat.push(q); }
    ring.forEach(function (p) {
      if (isPt(p)) { add(p); return; }
      if (p[0] === 'ref') { flat.push(p); return; }
      var c = refPoint(ds, p[1]);
      if (!c) return;
      if (p[0] === 'pt') add(c);
      else (p[0] === 'circle' ? AX.circlePts(c, p[2]) : AX.arcPts(c, p[2], p[3], p[4], p[5])).forEach(add);
    });
    var out = [], n = flat.length;
    for (var i = 0; i < n; i++) {
      var p = flat[i];
      if (p[0] !== 'ref') { out.push(p); continue; }
      var c = borderCurve(ds, p[1]);
      if (!c) continue;
      // the neighbouring points (round the ring when the border link comes first or last)
      var prev = null, next = null, j;
      for (j = 1; j < n && !prev; j++) { var q = flat[i - j] || (open ? null : flat[(i - j + n) % n]); if (isPt(q)) prev = q; else if (!q) break; }
      for (j = 1; j < n && !next; j++) { var q2 = flat[i + j] || (open ? null : flat[(i + j) % n]); if (isPt(q2)) next = q2; else if (!q2) break; }
      if (!prev && !next) { out = out.concat(c); continue; }
      // the border's own points strictly between the two neighbours (a missing neighbour: the border's end)
      var a = prev ? along(c, prev) : 0, b = next ? along(c, next) : c.length - 1, k;
      if (a <= b) { for (k = prev ? Math.floor(a) + 1 : 0; next ? k < b : k <= b; k++) out.push(c[k]); }
      else { for (k = Math.ceil(a) - 1; k > b; k--) out.push(c[k]); }
    }
    if (!open && out.length > 2) { var f = out[0], l = out[out.length - 1]; if (f[0] !== l[0] || f[1] !== l[1]) out.push([f[0], f[1]]); }
    return out;
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
    // equipment published without coordinates (some States give only the navaid's position): the navaid's position
    var nav = EQUIPMENT[r.k] ? navaidOf(ds, r) : null;
    if (nav) return pointOf(ds, nav);
    return null;
  }
  // the Navaid that lists this equipment (VOR, DME, ILS parts, marker…)
  function navaidOf(ds, eq) {
    var users = ds.rev ? ds.rev.get(eq) || [] : [];
    for (var i = 0; i < users.length; i++) if (users[i][1].k === 'Navaid') return users[i][1];
    return null;
  }
  // true when the position shown for this equipment is its navaid's (it has none of its own)
  function posFromNavaid(ds, eq) {
    if (!EQUIPMENT[eq.k] || findGeo(eq.cur.p, ['P', 'L', 'A'], 0)) return false;
    var nav = navaidOf(ds, eq);
    return !!(nav && pointOf(ds, nav));
  }
  /* --------------------------------------- airspace built from other airspaces (AIXM 5.1 airspace aggregation) */
  // Each geometryComponent has an operation (BASE, UNION, SUBTR, INTERS) applied in operationSequence order to a volume
  // that has its own horizontalProjection or takes another airspace's (contributorAirspace: AirspaceVolumeDependency,
  // FULL_GEOMETRY = the other airspace's shape and levels, HORZ_PROJECTION = its shape only). The shapes are combined with
  // the geometry engine (JSTS), which the page loads when a data set needs it; until then such an airspace is drawn as
  // before (its own projections, uncached).
  var engine = null, assembler = null;
  function setGeomEngine(j) { engine = j || null; }
  // the pop-out map window asks the main window, whose engine and realm built the shape (it shares the data sets)
  function setAssembler(fn) { assembler = fn || null; }
  function geomEngine() { return engine || (typeof jsts !== 'undefined' ? jsts : null); } // eslint-disable-line no-undef
  function componentsOf(p) {
    return arr(p.geometryComponent).map(function (gc, i) {
      var vol = gc && gc.theAirspaceVolume, dep = vol && arr(vol.contributorAirspace).filter(function (d) { return d && d.theAirspace; })[0];
      return { op: s(gc && gc.operation).toUpperCase() || (i ? 'UNION' : 'BASE'), seq: parseFloat(s(gc && gc.operationSequence)), i: i, vol: vol, dep: dep || null };
    }).filter(function (c) { return c.vol; }).sort(function (a, b) { return (isNaN(a.seq) ? a.i : a.seq) - (isNaN(b.seq) ? b.i : b.seq) || a.i - b.i; });
  }
  function needsAssembly(r) {
    if (r.k !== 'Airspace' || !r.cur || r.cur.gone) return false;
    var cs = componentsOf(r.cur.p), own = function (c) { return !!(c.vol.horizontalProjection && c.vol.horizontalProjection._geo); };
    // volumes that are areas (own or another airspace's); corridors given by a centre line only stay lines, as before
    var areas = cs.filter(function (c) { return own(c) || c.dep; }).length;
    return cs.some(function (c) { return c.dep && !own(c); }) || (areas > 1 && cs.some(function (c) { return /^(UNION|SUBTR|INTERS)$/.test(c.op); }));
  }
  function needsEngine(ds) { return (ds.byType && ds.byType.Airspace || []).some(needsAssembly); }
  function contributor(ds, dep) {
    var ref = dep.theAirspace, r = target(ds, ref);
    if (r) return { ds: ds, r: r };
    var o = peer(ds, ref);
    return o && o.r.k === 'Airspace' ? o : null;
  }
  function ownShape(ds, vol) {
    var hg = vol.horizontalProjection && vol.horizontalProjection._geo;
    return hg && hg.t === 'A' ? { t: 'A', c: hg.c.map(function (ring) { return resolveRing(ds, ring); }), d: hg.d } : null;
  }
  // -> {g, notes[]} : the combined horizontal shape of airspace r (null when nothing could be drawn)
  function assemble(ds, r, J, seen) {
    var notes = [], acc = null, gf = new J.geom.GeometryFactory();
    if (seen.indexOf(r) >= 0 || seen.length > 8) return { g: null, notes: ['the airspace is built from itself (circular contributor links)'] };
    seen = seen.concat([r]);
    componentsOf(r.cur.p).forEach(function (c) {
      var shape = ownShape(ds, c.vol), from = '';
      if (!shape && c.dep) {
        var o = contributor(ds, c.dep);
        if (!o) { notes.push(c.op + ': the contributor airspace ' + (c.dep.theAirspace.title || c.dep.theAirspace.ref) + ' is not in the data'); return; }
        from = shortName(o.r);
        shape = needsAssembly(o.r) ? assemble(o.ds, o.r, J, seen).g : geometry(o.ds, o.r);
        if (!shape) { notes.push(c.op + ': the contributor airspace ' + from + ' has no shape'); return; }
      }
      if (!shape) { if (!(c.vol.centreline && c.vol.centreline._geo)) notes.push(c.op + ': the volume has no horizontal projection'); return; }
      var jg = toJsts(J, gf, shape);
      if (!jg) { notes.push(c.op + (from ? ' ' + from : '') + ': the shape could not be read'); return; }
      try { acc = acc ? overlay(J, acc, jg, c.op) : jg; } catch (e) { notes.push(c.op + (from ? ' ' + from : '') + ': the shapes could not be combined (' + String(e && e.message || e).slice(0, 120) + ')'); }
    });
    var g = acc ? fromJsts(acc) : null;
    if (g) g.asm = 1;
    return { g: g, notes: notes };
  }
  // a with b: UNION, SUBTR (difference) or INTERS; boundaries coded twice meet at almost the same points, which plain
  // overlay may refuse (non-noded intersection): then with the shapes snapped together, then cleaned (buffer 0)
  function overlay(J, a, b, op) {
    function run(x, y) { return op === 'SUBTR' ? x.difference(y) : op === 'INTERS' ? x.intersection(y) : x.union(y); }
    try { return run(a, b); } catch (e) {
      var GS = J.operation.overlay.snap.GeometrySnapper;
      try { var sn = GS.snap(a, b, GS.computeOverlaySnapTolerance(a, b)); return run(sn[0], sn[1]); } catch (e2) {
        var pm = new J.geom.PrecisionModel(1e7), R = J.precision.GeometryPrecisionReducer; // 1e-7 degree: about a centimetre
        return run(R.reduce(a, pm), R.reduce(b, pm));
      }
    }
  }
  // arrays for JSTS are made here, in this script's own realm (JSTS tells arrays from coordinate sequences with
  // instanceof Array, which an array made by the data's own map/filter in another window or context fails)
  function toJsts(J, gf, g, raw) {
    var polys = [], parts = g.t === 'M' ? g.parts : [g];
    for (var i = 0; i < parts.length; i++) {
      var x = parts[i], rings = [], holes = [];
      if (x.t !== 'A') continue;
      for (var k = 0; k < x.c.length; k++) {
        var c = [], ring = x.c[k];
        for (var j = 0; j < ring.length; j++) if (isPt(ring[j])) c.push(new J.geom.Coordinate(ring[j][0], ring[j][1]));
        if (c.length && !c[0].equals2D(c[c.length - 1])) c.push(new J.geom.Coordinate(c[0].x, c[0].y));
        if (c.length >= 4) rings.push(gf.createLinearRing(c));
      }
      for (var h = 1; h < rings.length; h++) holes.push(rings[h]);
      if (rings.length) polys.push(gf.createPolygon(rings[0], holes));
    }
    if (!polys.length) return null;
    var out = polys.length === 1 ? polys[0] : gf.createMultiPolygon(polys);
    return raw || out.isValid() ? out : out.buffer(0); // raw: as drawn (the checks look at it)
  }
  // JSTS -> {t:'A'} or {t:'M'}; slivers left by boundaries coded twice (mean width under 30 m) are dropped
  function fromJsts(geom) {
    var out = [];
    function ring(ls) { return ls.getCoordinates().map(function (c) { return [c.x, c.y]; }); }
    function thin(pg) { var a = pg.getArea(), l = pg.getLength(); return l > 0 && 2 * a / l < 0.0003; } // degrees: ~30 m
    for (var i = 0; i < geom.getNumGeometries(); i++) {
      var pg = geom.getGeometryN(i);
      if (pg.getGeometryType() !== 'Polygon' || pg.isEmpty() || thin(pg)) continue;
      var rings = [ring(pg.getExteriorRing())];
      for (var h = 0; h < pg.getNumInteriorRing(); h++) { var hr = pg.getInteriorRingN(h); if (!thin(pg.getFactory().createPolygon(hr, []))) rings.push(ring(hr)); }
      out.push({ t: 'A', c: rings });
    }
    return out.length ? (out.length === 1 ? out[0] : { t: 'M', parts: out }) : null;
  }
  // what the map shows for an aggregated airspace: how it was built and what could not be done
  function assembly(ds, r) {
    if (!needsAssembly(r)) return null;
    var J = geomEngine(), cs = componentsOf(r.cur.p);
    var steps = cs.map(function (c) { var o = c.dep && !ownShape(ds, c.vol) ? contributor(ds, c.dep) : null; return c.op + ' ' + (o ? shortName(o.r) + (c.dep.dependency ? ' (' + s(c.dep.dependency) + ')' : '') : c.dep ? '(contributor not in the data)' : 'own shape'); });
    return { steps: steps, notes: J ? assemble(ds, r, J, []).notes : ['the geometry engine is not loaded: drawn from its own shapes only'] };
  }
  // vertical extent in feet (FL x 100; heights above ground counted from sea level; GND/SFC 0; UNL: no limit):
  // {lo, up} over all volumes, contributors included (FULL_GEOMETRY), null when the data gives no limits
  function limitFt(v, ref) {
    v = Array.isArray(v) ? v[0] : v;
    if (!v || (typeof v === 'object' && v.nil !== undefined)) return null;
    var val = String(typeof v === 'object' ? v.v : v).trim().toUpperCase(), u = String(typeof v === 'object' && v.u || '').toUpperCase();
    if (/^(GND|SFC)$/.test(val)) return 0;
    if (val === 'UNL') return Infinity;
    var n = parseFloat(val);
    if (isNaN(n)) return null;
    if (u === 'FL' || s(ref) === 'STD' && !u) return n * 100;
    return u === 'M' ? n / 0.3048 : u === 'KM' ? n * 1000 / 0.3048 : n;
  }
  // the 3D pieces of an airspace: [{g: JSTS shape, vb: {lo, up}}], one per volume (contributors' own pieces for
  // FULL_GEOMETRY, the contributor's shape with this volume's levels for HORZ_PROJECTION; a subtracted or intersected
  // volume cuts every piece). For the overlap check: lower and upper parts of one airspace keep their own levels.
  function pieces(ds, r, J, seen) {
    seen = seen || [];
    if (!r || r.k !== 'Airspace' || seen.indexOf(r) >= 0 || seen.length > 8) return [];
    seen = seen.concat([r]);
    var out = [], gf = new J.geom.GeometryFactory();
    componentsOf(r.cur.p).forEach(function (c) {
      var v = c.vol, own = ownShape(ds, v), o = !own && c.dep ? contributor(ds, c.dep) : null, full = o && s(c.dep.dependency) !== 'HORZ_PROJECTION';
      var lo = limitFt(v.lowerLimit, v.lowerLimitReference), up = limitFt(v.upperLimit, v.upperLimitReference);
      var mine = [];
      if (own) { var g0 = toJsts(J, gf, own); if (g0) mine.push({ g: g0, vb: lo === null && up === null ? null : { lo: lo === null ? 0 : lo, up: up === null ? Infinity : up } }); }
      else if (o && full) mine = pieces(o.ds, o.r, J, seen);
      else if (o) { var sh = needsAssembly(o.r) ? assemble(o.ds, o.r, J, seen).g : geometry(o.ds, o.r), g1 = sh && toJsts(J, gf, sh); if (g1) mine.push({ g: g1, vb: lo === null && up === null ? vband(o.ds, o.r) : { lo: lo === null ? 0 : lo, up: up === null ? Infinity : up } }); }
      if (c.op === 'SUBTR' || c.op === 'INTERS') {
        mine.forEach(function (m) { out = out.map(function (p) { try { return { g: overlay(J, p.g, m.g, c.op), vb: p.vb }; } catch (e) { return p; } }); });
      } else out = out.concat(mine);
    });
    return out.filter(function (p) { return p.g && !p.g.isEmpty(); });
  }
  function vband(ds, r, seen) {
    seen = seen || [];
    if (!r || r.k !== 'Airspace' || seen.indexOf(r) >= 0 || seen.length > 8) return null;
    var lo = Infinity, up = -Infinity;
    componentsOf(r.cur.p).forEach(function (c) {
      if (c.op === 'SUBTR') return;
      var v = c.vol, a = limitFt(v.lowerLimit, v.lowerLimitReference), b = limitFt(v.upperLimit, v.upperLimitReference);
      if ((a === null || b === null) && c.dep && s(c.dep.dependency) !== 'HORZ_PROJECTION') {
        var o = contributor(ds, c.dep), cb = o && vband(o.ds, o.r, seen.concat([r]));
        if (cb) { if (a === null) a = cb.lo; if (b === null) b = cb.up; }
      }
      if (a !== null && a < lo) lo = a;
      if (b !== null && b > up) up = b;
    });
    return lo === Infinity && up === -Infinity ? null : { lo: lo === Infinity ? 0 : lo, up: up === -Infinity ? Infinity : up };
  }

  // Map geometry of a feature: {t:'P'|'L'|'A', c, parts?}
  function geometry(ds, r) {
    if (r.geo !== undefined) return r.geo;
    var p = r.cur.p, g = null, list;
    switch (r.k) {
      case 'Airspace': {
        if (needsAssembly(r)) {
          var J = geomEngine();
          if (J) { g = assemble(ds, r, J, []).g; break; }
          if (assembler) { var ag0 = assembler(ds, r); if (ag0 && ag0.asm) return ag0; }
        }
        list = [];
        arr(p.geometryComponent).forEach(function (gc) {
          var vol = gc && gc.theAirspaceVolume;
          if (vol && vol.horizontalProjection && vol.horizontalProjection._geo) {
            var hg = vol.horizontalProjection._geo;
            list.push({ t: 'A', c: hg.c.map(function (ring) { return resolveRing(ds, ring); }), d: hg.d, op: gc.operation });
          } else if (vol && vol.centreline && vol.centreline._geo) list.push(lineOf(ds, vol.centreline._geo));
        });
        g = list.length ? (list.length === 1 ? list[0] : { t: 'M', parts: list }) : null;
        if (needsAssembly(r)) return g; // drawn again once the geometry engine is there
        break;
      }
      case 'RouteSegment': {
        var ce = p.curveExtent && p.curveExtent._geo;
        if (ce) g = lineOf(ds, ce);
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
    if (g && g.t === 'L' && g.c && !g.c.every(isPt)) g = lineOf(ds, g);
    r.geo = g;
    return g;
  }
  // a line with referenced points (fixes, navaids, arc centres) resolved
  function lineOf(ds, g) { return g.c.every(isPt) ? g : Object.assign({}, g, { c: resolveRing(ds, g.c, true) }); }
  // a point of a procedure leg held in another data set loaded (an IFP data set referring to the AIP data set's
  // fixes, navaids and runway points); used only for the leg end points
  var peersOf = null;
  function setPeers(fn) { peersOf = fn; }
  function peer(ds, ref) {
    var id = ref && ref.ref;
    if (!peersOf || !id || id.charAt(0) === '#') return null;
    var list = peersOf() || [];
    for (var i = 0; i < list.length; i++) { if (list[i] === ds || !list[i].byId) continue; var r = list[i].byId.get(id); if (r) return { ds: list[i], r: r }; }
    return null;
  }
  function segPoint(ds, sp) {
    if (!sp) return null;
    if (sp._loc && sp._loc._geo) return sp._loc._geo.c;
    var keys = ['pointChoice_fixDesignatedPoint', 'pointChoice_navaidSystem', 'pointChoice_aimingPoint', 'pointChoice_runwayPoint', 'pointChoice_airportReferencePoint', 'pointChoice_position'];
    for (var i = 0; i < keys.length; i++) {
      var v = sp[keys[i]];
      if (!v) continue;
      if (v.ref) { var t = target(ds, v); if (t) return pointOf(ds, t); var o = peer(ds, v); if (o) return pointOf(o.ds, o.r); }
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
      if (v && v.ref) { var t = target(ds, v); if (t) return shortName(t); var o = peer(ds, v); if (o) return shortName(o.r); return v.title || v.ref; }
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
  // AMXM 2.0 dictionary (feature types, attributes in schema order, code lists), read when first needed
  var AMXM = null;
  function amxmDict() {
    if (AMXM === null) { try { AMXM = JSON.parse(document.getElementById('data-amxm').textContent); } catch (e) { AMXM = false; } }
    return AMXM || null;
  }
  // meaning of an AMXM code value ('' when the attribute has no code list or the value is not in it)
  function amxmMeaning(type, attr, value) {
    var d = amxmDict(), f = d && d.features[type], a = f && f.attrs.filter(function (x) { return x.n === attr; })[0];
    var cl = a && a.c && d.codes[a.c];
    return cl && cl[String(value)] !== undefined ? cl[String(value)] : '';
  }
  function featureDef(k, r) {
    var am = r && r.cur && r.cur.p && r.cur.p._amxm, ad = am && amxmDict();
    if (ad && ad.features[am]) return 'AMXM ' + am + ': ' + ad.features[am].doc;
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
    if (!state && sn.metaCountry) { state = sn.metaCountry; src = 'data provider country in the message metadata'; }
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
    // a date in the file name, with the time when one follows it (…_EFF202610281600_…: 16:00Z)
    var fm = /(20\d\d|19\d\d)[-_]?(0[1-9]|1[0-2])[-_]?(0[1-9]|[12]\d|3[01])(?:[T_-]?([01]\d|2[0-3])([0-5]\d)(?!\d))?/.exec(ds.name);
    if (fm) cands.push({ t: Date.UTC(+fm[1], +fm[2] - 1, +fm[3], +(fm[4] || 0), +(fm[5] || 0)), src: 'file name' });
    if (sn.header && sn.header.effective) { var he = AX.tms(sn.header.effective); if (he !== null) cands.unshift({ t: he, src: 'AIXM 4.5 header (effective)' }); }
    if (ds.delivery && ds.delivery.effective) { var de = AX.tms(ds.delivery.effective); if (de !== null) cands.unshift({ t: de, src: 'effective time in the checksum list of the delivery' }); }
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
  // Text a feature is found by (search box and map search): its label, designators, name, ICAO / IATA codes, type,
  // frequency, plus the words people type for its kind ("twy", "stand", "airway", "waypoint"…) and, for aerodrome
  // surfaces, the aerodrome — so "TWY A", "EADD stand 5" or "airway UL9" find what they mean.
  var KIND_WORDS = { Taxiway: 'twy taxiway', TaxiwayElement: 'twy taxiway', Apron: 'apron', ApronElement: 'apron', AircraftStand: 'stand parking',
    Runway: 'rwy runway', RunwayDirection: 'rwy runway', RunwayElement: 'rwy runway', Route: 'airway awy route', RouteSegment: 'airway awy route segment',
    DesignatedPoint: 'waypoint wpt fix point', VerticalStructure: 'obstacle obst', AirportHeliport: 'aerodrome airport', Navaid: 'navaid',
    AeronauticalGroundLight: 'light', Airspace: 'airspace', GuidanceLine: 'guidance line', TouchDownLiftOff: 'tlof helipad' };
  var OWN_WORDS = /^(Runway|RunwayDirection|RunwayElement|Taxiway|TaxiwayElement|Apron|ApronElement|AircraftStand|GuidanceLine|TouchDownLiftOff)$/;
  function searchText(ds, r) {
    var p = r.cur.p, own = OWN_WORDS.test(r.k) && ds.owner ? ds.owner.get(r) : null;
    return [label(ds, r), s(p.designator), s(p.name), s(p.locationIndicatorICAO), s(p.designatorIATA), r.k, r.k === 'RadioCommunicationChannel' ? fFreq(r) : '', s(p.channel),
      KIND_WORDS[r.k] || '', own ? shortName(own) : ''].join(' ').toLowerCase();
  }
  // a search matches when every word of it is found (in any order); words people add for the kind ("twy", "stand")
  // are left out when checking for an exact name
  function searchMatch(text, words) { for (var i = 0; i < words.length; i++) if (text.indexOf(words[i]) < 0) return false; return true; }
  var KIND_WORD_SET = new Set(Object.keys(KIND_WORDS).reduce(function (a, k) { return a.concat(KIND_WORDS[k].split(' ')); }, []));
  function searchCore(words) { var w = words.filter(function (x) { return !KIND_WORD_SET.has(x); }); return (w.length ? w : words).join(' '); }
  function fmtTs(str) { if (typeof str === 'number') return fmtDate(str, true); var t = AX.tms(str); return t === null ? (str || '') : fmtDate(t, true); }

  return {
    setPeers: setPeers, peer: peer,
    setDict: setDict, dict: dict, amxmDict: amxmDict, amxmMeaning: amxmMeaning, finalize: finalize, finalizeAsync: finalizeAsync, setViewDate: setViewDate, harmonizeStates: harmonizeStates, setLocator: setLocator, target: target, eachRef: eachRef,
    geometry: geometry, setGeomEngine: setGeomEngine, setAssembler: setAssembler, geomEngine: geomEngine, needsEngine: needsEngine, needsAssembly: needsAssembly, assembly: assembly, componentsOf: componentsOf,
    vband: vband, pieces: pieces, limitFt: limitFt, overlay: overlay, toJsts: function (J, gf, g, raw) { return toJsts(J, gf, g, raw); }, borderCurve: borderCurve, refPoint: refPoint, resolveRing: resolveRing, pointOf: pointOf, posFromNavaid: posFromNavaid, navaidOf: navaidOf, findGeo: findGeo, segPoint: segPoint, segPointLabel: segPointLabel, segPointRec: segPointRec,
    label: label, shortName: shortName, typeName: typeName, routeDesignator: routeDesignator, s: s, searchText: searchText, searchMatch: searchMatch, searchCore: searchCore,
    fq: fq, fLimit: fLimit, fPoint: fPoint, fElev: fElev, fTimesheet: fTimesheet, fSchedule: fSchedule, noteText: noteText, notesOf: notesOf,
    fContact: fContact, fFreq: fFreq, fv: fv, propDef: propDef, featureDef: featureDef, codeDef: codeDef, def45: def45,
    adEffective: adEffective, fmtDate: fmtDate, fmtTs: fmtTs, AD_COMPONENT: AD_COMPONENT, EQUIPMENT: EQUIPMENT, SERVICE: SERVICE, UOM: UOM
  };
})();
