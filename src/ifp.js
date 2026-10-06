/*!
 * AIXM Code Converter
 * Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com> - author of the AIXM Code Converter
 * SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE; keep this notice in all copies)
 * ==========================================================================
 * AIXM Code Converter - instrument flight procedure data (IFP)
 * One reading of SID, STAR and approach data for AIXM 5.1, 5.1.1 and 5.2 (whose names differ: lowerLimit /
 * lowerLimitAltitude, verticalLimitsInterpretation / altitudeInterpretation, altitudeCondition, segmentCourse,
 * aircraftCapability / aircraftCharacteristic, designCriteria as a DesignStandard, the Minima values, the
 * FinalApproachSegmentData of FASData), and the checks of an IFP data set:
 *   - ICAO Annex 11 Appendix 3 coded designators of SID / STAR, ARINC 424 six-character limit;
 *   - PANS-OPS Vol II Part III Section 2 Chapter 5: path terminators usable for RNAV (12) and RNP (IF, TF, RF, HM),
 *     first and last legs of SID, STAR, approach and missed approach, the data each path terminator needs
 *     (end or start fix, arc centre, turn direction, radius, altitude, course, length or time);
 *   - the EUROCONTROL coding guidelines for the ICAO IFP data set in AIXM 5.2 ("for review"): an aerodrome per
 *     procedure, one runway direction per approach, navigation type and specification, magnetic variation, design
 *     standard, MSA / AMA / TAA, transitions ("simple" single transition or ARINC 424 RWY / COMMON / EN_ROUTE),
 *     reporting values, fly-by / fly-over of RNAV waypoints, descent angle sign, speed units;
 *   - the feature types an IFP data set holds (mandatory, conditional, optional, not applicable).
 * Path terminators, roles and code lists are explained in plain words for the reports.
 * ========================================================================== */
/* global AX, MODEL */
var IFP = (function () {
  'use strict';
  var M = MODEL, arr = AX.arr, s = M.s;

  /* ------------------------------------------------------------ reference */
  // ARINC 424 path terminators (23): meaning, fixed / floating / holding
  var PT = {
    IF: 'Initial fix', TF: 'Track between two fixes', CF: 'Course to a fix', DF: 'Direct to a fix', RF: 'Constant radius arc to a fix',
    AF: 'DME arc to a fix', FC: 'Track from a fix for a distance', FD: 'Track from a fix to a DME distance', FA: 'Track from a fix to an altitude',
    FM: 'Track from a fix to a manual termination', CA: 'Course to an altitude', CD: 'Course to a DME distance', CI: 'Course to an intercept',
    CR: 'Course to a radial', VA: 'Heading to an altitude', VD: 'Heading to a DME distance', VI: 'Heading to an intercept', VR: 'Heading to a radial',
    VM: 'Heading to a manual termination', PI: 'Procedure turn', HA: 'Holding to an altitude', HF: 'Holding, one circuit to the fix', HM: 'Holding to a manual termination'
  };
  // PANS-OPS: 11 path terminators for RNAV design plus IF; RNP applications: IF, TF, RF, HM
  var RNAV_PT = ['IF', 'TF', 'CF', 'DF', 'RF', 'FA', 'FM', 'CA', 'VA', 'VI', 'VM', 'HM'], RNP_PT = ['IF', 'TF', 'RF', 'HM'];
  // first and last legs of RNAV procedures
  var FIRST = { SID: ['CA', 'CF', 'VA', 'VI', 'IF'], STAR: ['IF'], IAP: ['IF'], MA: ['CA', 'CF', 'DF', 'FA', 'HM', 'RF', 'VI', 'VM', 'TF'] };
  var LAST = { SID: ['CF', 'DF', 'FM', 'RF', 'TF', 'VM'], STAR: ['CF', 'DF', 'FM', 'HM', 'RF', 'TF', 'VM'], IAP: ['CF', 'TF', 'RF'], MA: ['CF', 'DF', 'FM', 'HM', 'RF', 'TF', 'VM'] };
  // the data each path terminator needs (PANS-OPS / EUROCONTROL tables)
  var NEED = {
    end: ['TF', 'CF', 'DF', 'RF', 'AF'], start: ['IF', 'FA', 'FM', 'HM', 'HA', 'HF', 'FC', 'FD'], arc: ['RF', 'AF'], turn: ['RF'], radius: ['RF'],
    alt: ['CA', 'FA', 'VA', 'HA'], course: ['CF', 'FA', 'FM', 'CA', 'VA', 'VI', 'VM', 'CD', 'CI', 'CR', 'VD', 'VR', 'FC', 'FD'], lengthOrTime: ['HM', 'HA', 'HF']
  };
  var ROLE = {
    IAF: 'initial approach fix', IF: 'intermediate fix', IF_IAF: 'intermediate / initial approach fix', FAF: 'final approach fix', PFAF: 'precision final approach fix',
    FAP: 'final approach point', MAPT: 'missed approach point', MAHF: 'missed approach holding fix', MATF: 'missed approach turning fix', SDF: 'step-down fix',
    FPAP: 'flight path alignment point', FTP: 'fictitious threshold point', LTP: 'landing threshold point', FROP: 'final roll-out point', TP: 'turn point',
    VDP: 'visual descent point', FEEDER_FIX: 'feeder fix', DP: 'descent point', FHP: 'fictitious heliport point', IDF: 'initial departure fix', PRP: 'point-in-space reference point'
  };
  var PHASE_OF = { DepartureLeg: 'SID', ArrivalLeg: 'STAR', ArrivalFeederLeg: 'IAP', InitialLeg: 'IAP', IntermediateLeg: 'IAP', FinalLeg: 'IAP', MissedApproachLeg: 'MA' };
  var KIND = { StandardInstrumentDeparture: 'SID', StandardInstrumentArrival: 'STAR', InstrumentApproachProcedure: 'IAP' };
  // feature types of an ICAO IFP data set (EUROCONTROL allocation, AIXM 5.2): M mandatory, C conditional, O optional
  var ALLOC = {
    StandardInstrumentDeparture: 'M', StandardInstrumentArrival: 'M', InstrumentApproachProcedure: 'M', DepartureLeg: 'M', ArrivalLeg: 'M', ArrivalFeederLeg: 'M',
    InitialLeg: 'M', IntermediateLeg: 'M', FinalLeg: 'M', MissedApproachLeg: 'M', HoldingPattern: 'M', SafeAltitudeArea: 'M', MinimumAltitudeArea: 'M', TerminalArrivalArea: 'M',
    CirclingArea: 'M', NavigationArea: 'M', NavigationAreaRestriction: 'M', ProcedureDME: 'M', DesignatedPoint: 'M', PrecisionApproachRadar: 'M', PrimarySurveillanceRadar: 'M',
    SecondarySurveillanceRadar: 'M', RadarSystem: 'M', PilotControlledLighting: 'M', RunwayVisualRange: 'M', RunwayVisualRangeEquipment: 'M', SeaplaneLandingArea: 'M',
    GBAS: 'M', GBASService: 'M', SatelliteService: 'M', SatelliteSystem: 'M',
    AirportHeliport: 'C', Runway: 'C', RunwayDirection: 'C', RunwayCentrelinePoint: 'C', TouchDownLiftOff: 'C', Navaid: 'C', VOR: 'C', DME: 'C', NDB: 'C', TACAN: 'C',
    Localizer: 'C', Glidepath: 'C', MarkerBeacon: 'C', DirectionFinder: 'C', Azimuth: 'C', Elevation: 'C', ApproachLightingSystem: 'C', VisualGlideSlopeIndicator: 'C',
    GroundTrafficControlService: 'C', AirTrafficControlService: 'C', RadioCommunicationChannel: 'C', ObstacleArea: 'C', VerticalStructure: 'C',
    Airspace: 'O', AuthorityForAirspace: 'O', AirTrafficManagementService: 'O', AirTrafficFlowManagementService: 'O', GeoBorder: 'O', HoldingAssessment: 'O',
    InformationService: 'O', OrganisationAuthority: 'O', RulesProcedures: 'O', SDF: 'O', SignificantPointInAirspace: 'O', SpecialDate: 'O', Unit: 'O', WeatherSource: 'O'
  };

  /* --------------------------------------------------------------- values */
  function q(v) { v = Array.isArray(v) ? v[0] : v; return v && typeof v === 'object' && v.nil === undefined && v.v !== undefined ? v : v && typeof v !== 'object' ? { v: String(v), u: '' } : null; }
  function toM(v) { var x = q(v); if (!x) return null; var n = parseFloat(x.v); if (isNaN(n)) return null; var u = String(x.u || 'FT').toUpperCase(); return u === 'FL' ? n * 30.48 : u === 'M' ? n : u === 'KM' ? n * 1000 : n * 0.3048; }
  function lim(v, ref) { return M.fLimit(v, ref); }
  function join(a, sep) { return a.filter(function (x) { return x !== undefined && x !== null && x !== ''; }).join(sep || ' '); }
  // AIXM 5.1 CodeAltitudeUse (ABOVE_LOWER ...) and AIXM 5.2 (AT_OR_ABOVE ...)
  var INTERP = { ABOVE_LOWER: 'at or above', BELOW_UPPER: 'at or below', AT_LOWER: 'at', EXPECT_LOWER: 'expect', AS_ASSIGNED: 'as assigned', AT_OR_ABOVE: 'at or above', AT_OR_BELOW: 'at or below',
    AT: 'at', BETWEEN: 'between', RECOMMENDED: 'recommended', EXPECTED: 'expected', BY_ATC: 'by ATC' };

  // altitudes of a leg: along the segment (lower / upper), at its end (crossing), MEA, MOCA / H, ATC override
  function alt(p) {
    var lo = p.lowerLimit !== undefined ? p.lowerLimit : p.lowerLimitAltitude, up = p.upperLimit !== undefined ? p.upperLimit : p.upperLimitAltitude;
    var it = s(p.verticalLimitsInterpretation) || s(p.altitudeInterpretation), out = { parts: [], lowM: null, endM: null };
    var loT = lim(lo, p.lowerLimitReference), upT = lim(up, p.upperLimitReference);
    if (loT || upT) {
      if (it === 'BETWEEN' || (loT && upT && loT !== upT)) out.parts.push('between ' + loT + ' and ' + upT);
      else out.parts.push(join([INTERP[it] || (it ? it.replace(/_/g, ' ').toLowerCase() : (loT ? 'at or above' : 'at or below')), loT || upT]));
    }
    var conds = arr(p.altitudeCondition).filter(function (c) { return c && c.nil === undefined; });
    if (!conds.length && (p.minimumCrossingAtEnd !== undefined || p.maximumCrossingAtEnd !== undefined)) conds = [p]; // AIXM 5.1: on the DepartureLeg
    conds.forEach(function (c) {
      var mn = lim(c.minimumCrossingAtEnd, c.minimumCrossingAtEndReference), mx = lim(c.maximumCrossingAtEnd, c.maximumCrossingAtEndReference);
      var eng = arr(c.engineType).map(function (e) { return e && s(e.engine); }).filter(Boolean).join('/');
      var t = mn && mx ? (mn === mx ? 'at ' + mn : 'between ' + mn + ' and ' + mx) : mn ? 'at or above ' + mn : mx ? 'at or below ' + mx : '';
      if (t) out.parts.push(t + ' at the end' + (eng ? ' (' + eng + ')' : ''));
      if (c.minimumEnrouteAltitude !== undefined && q(c.minimumEnrouteAltitude)) out.parts.push('MEA ' + lim(c.minimumEnrouteAltitude));
      var e = toM(c.minimumCrossingAtEnd); if (e === null) e = toM(c.maximumCrossingAtEnd);
      if (e !== null && (out.endM === null || e < out.endM)) out.endM = e;
    });
    if (q(p.minimumObstacleClearanceAltitude)) out.parts.push('MOCA ' + lim(p.minimumObstacleClearanceAltitude));
    if (q(p.minimumObstacleClearanceHeight)) out.parts.push('MOCH ' + lim(p.minimumObstacleClearanceHeight));
    if (q(p.altitudeOverrideATC)) out.parts.push('ATC may clear ' + lim(p.altitudeOverrideATC, p.altitudeOverrideReference));
    var cand = [toM(lo), toM(up), out.endM].filter(function (v) { return v !== null; });
    out.lowM = cand.length ? Math.min.apply(null, cand) : null;
    out.txt = out.parts.join('; ');
    out.src = loT ? (p.lowerLimit !== undefined ? 'lowerLimit' : 'lowerLimitAltitude') : conds.length ? (conds[0] === p ? 'minimumCrossingAtEnd' : 'altitudeCondition') : 'lowerLimit';
    return out;
  }
  // course(s): AIXM 5.2 segmentCourse (true and magnetic), AIXM 5.1 course + courseType
  function course(p) {
    var list = arr(p.segmentCourse).filter(function (c) { return c && c.nil === undefined; }).map(function (c) { return { v: s(c.course), t: s(c.courseType) }; });
    if (!list.length && s(p.course)) list = [{ v: s(p.course), t: s(p.courseType) }];
    return list.filter(function (c) { return c.v; }).map(function (c) { return c.v + '°' + ({ TRUE_TRACK: 'T', TRUE_BRG: 'T', TRUE_COURSE: 'T', TRUE_HDG: 'T hdg', MAG_TRACK: 'M', MAG_BRG: 'M', MAG_COURSE: 'M', MAG_HDG: 'M hdg', RDL: ' radial' }[c.t] || ''); }).join(' / ');
  }
  function speed(p) { var v = q(p.speedLimit); if (!v) return ''; return join([{ MAX: 'max', MIN: 'min', AT: 'at' }[s(p.speedInterpretation)] || 'max', v.v, v.u || 'KT', s(p.speedReference)]); }
  // a terminal segment point: role, fly-over, waypoint, reporting
  function point(sp) {
    sp = Array.isArray(sp) ? sp[0] : sp;
    if (!sp || sp.nil !== undefined) return null;
    return { role: s(sp.role), flyOver: s(sp.flyOver), waypoint: s(sp.waypoint), reporting: s(sp.reportingATC), radar: s(sp.radarGuidance), facf: s(sp.indicatorFACF) };
  }
  // performance-based navigation: procedure or leg (5.2 aircraftCapability, 5.1 aircraftCharacteristic)
  function pbn(p) {
    return arr(p.aircraftCapability).concat(arr(p.aircraftCharacteristic)).filter(function (a) { return a && a.nil === undefined; }).map(function (a) {
      return { type: s(a.navigationType), spec: s(a.navigationSpecification), acc: s(a.navigationAccuracy), cat: s(a.aircraftLandingCategory), engine: s(a.engine) };
    });
  }
  function pbnText(p) {
    var l = pbn(p), out = [];
    l.forEach(function (a) { var t = join([a.spec.replace(/_/g, ' ').replace('RNP 0 3', 'RNP 0.3'), a.acc ? '(' + a.acc + ' NM)' : '', !a.spec && a.type ? a.type : '']); if (t && out.indexOf(t) < 0) out.push(t); });
    if (!out.length && s(p.RNAV) === 'YES') out.push('RNAV');
    if (!out.length && s(p.requiredNavigationPerformance)) out.push('RNP ' + s(p.requiredNavigationPerformance));
    return out.join(' or ');
  }
  function navType(p) { var t = pbn(p).map(function (a) { return a.type; }).filter(Boolean)[0]; return t || (s(p.RNAV) === 'YES' ? 'RNAV' : ''); }
  function cats(p) { var c = []; pbn(p).forEach(function (a) { if (a.cat && c.indexOf(a.cat) < 0) c.push(a.cat); }); return c; }
  // design standard: AIXM 5.1 a code, AIXM 5.2 a DesignStandard (name, version)
  function design(p) {
    return arr(p.designCriteria).map(function (d) { if (!d || (typeof d === 'object' && d.nil !== undefined)) return ''; if (typeof d === 'object' && d.v === undefined) return join([s(d.name), s(d.version)]).replace(/_/g, ' '); return s(d).replace(/_/g, ' '); }).filter(Boolean).join(', ');
  }
  function magVar(p) { var v = s(p.magneticVariation); return v ? (parseFloat(v) >= 0 ? v + '° E' : (-parseFloat(v)) + '° W') + (s(p.dateMagneticVariation) ? ' (' + s(p.dateMagneticVariation) + ')' : '') : ''; }
  // final approach segment data block (FinalLeg.FASData: 5.1 FASDataBlock, 5.2 FinalApproachSegmentData)
  function fas(leg) {
    var f = arr(leg.cur.p.FASData).filter(function (x) { return x && x.nil === undefined; })[0];
    if (!f) return null;
    var g = function (k) { return s(f[k]); }, fq = function (k) { return M.fq(f[k]); };
    return {
      operationType: g('operationType'), sbas: g('serviceProviderSBAS'), apd: g('approachPerformanceDesignator'), routeIndicator: g('routeIndicator'), rpds: g('referencePathDataSelector'),
      rpi: g('referencePathIdentifier'), airport: g('airportID'), runway: join([g('runwayNumber'), g('runwayLetter')], ''), codeICAO: g('codeICAO'),
      ltp: g('thresholdPointLatitude') ? [g('thresholdPointLatitude'), g('thresholdPointLongitude')] : null, ltpHeight: fq('thresholdPointHeight'), ltpOrtho: fq('thresholdOrthoHeight'),
      fpap: g('finalPointLatitude') ? [g('finalPointLatitude'), g('finalPointLongitude')] : null, fpapDelta: g('deltaFinalPointLatitude') ? [g('deltaFinalPointLatitude'), g('deltaFinalPointLongitude')] : null, fpapOrtho: fq('finalPointOrthoHeight'),
      tch: join([fq('thresholdCrossingHeight'), g('thresholdCrossingHeightUnits')]), gpa: g('glidepathAngle'), courseWidth: fq('thresholdCourseWidth'), lengthOffset: fq('lengthOffset'),
      hal: fq('horizontalAlarmLimit'), val: fq('verticalAlarmLimit'), crc: g('CRCRemainder'), block: g('FASDataBlock')
    };
  }
  // minima of an approach condition: AIXM 5.1 (altitude + altitudeCode, height + heightCode) and 5.2 (OCA, DA, MDA, OCH, DH, MDH)
  function minima(m) {
    var a = [], h = [];
    if (q(m.altitude)) a.push(join([s(m.altitudeCode), M.fq(m.altitude)]));
    [['obstacleClearanceAltitude', 'OCA'], ['decisionAltitude', 'DA'], ['minimumDescentAltitude', 'MDA']].forEach(function (k) { if (q(m[k[0]])) a.push(k[1] + ' ' + M.fq(m[k[0]])); });
    if (q(m.height)) h.push(join([s(m.heightCode), M.fq(m.height)]));
    [['obstacleClearanceHeight', 'OCH'], ['decisionHeight', 'DH'], ['minimumDescentHeight', 'MDH']].forEach(function (k) { if (q(m[k[0]])) h.push(k[1] + ' ' + M.fq(m[k[0]])); });
    return { alt: a.join(', '), hgt: join([h.join(', '), s(m.heightReference) ? '(' + s(m.heightReference) + ')' : '']), vis: join([M.fq(m.visibility), q(m.runwayVisualRange) ? 'RVR ' + M.fq(m.runwayVisualRange) : '']) };
  }

  /* --------------------------------------------------------------- checks */
  // the legs of a procedure in order (aip.js procLegs), with their phase and path terminator
  function legInfo(procLegs) {
    return procLegs.map(function (x) {
      var p = x.leg.cur.p;
      return { x: x, p: p, pt: s(p.legTypeARINC), phase: PHASE_OF[x.leg.k] || '', start: point(p.startPoint), end: point(p.endPoint) };
    });
  }
  // EUROCONTROL / ICAO / PANS-OPS checks of one procedure -> [{sev, rule, msg, rec, prop, why}]
  function checks(ds, proc, procLegs) {
    var p = proc.cur.p, kind = KIND[proc.k], out = [], name = kind + ' ' + (s(p.designator) || s(p.name) || proc.id.slice(0, 8));
    function add(sev, rule, msg, rec, prop, why) { out.push({ sev: sev, rule: rule, msg: msg, rec: rec || proc, prop: prop || '', why: why || '', proc: name }); }
    // identification
    if (kind !== 'IAP') {
      var d = s(p.designator);
      if (!d) add('warning', 'Designator', name + ': no coded designator', proc, 'designator', 'ICAO Annex 11: each SID / STAR has a plain language and a coded designator.');
      else {
        if (d.length > 7 || !/^[A-Z]{2,5}[1-9][A-HJ-NP-Z]?$/.test(d)) add('info', 'Designator', name + ': coded designator "' + d + '" does not follow basic indicator + validity number 1–9 + route letter', proc, 'designator', 'ICAO Annex 11 Appendix 3 (letters I and O are not used as route indicator).');
        if (d.length > 6) add('info', 'Designator', name + ': designator of ' + d.length + ' characters (ARINC 424 holds 6)', proc, 'designator', 'Data houses shorten it (e.g. ANITA6D becomes ANIT6D).');
      }
    }
    if (!arr(p.airportHeliport).filter(function (a) { return a && a.nil === undefined; }).length) add('warning', 'Aerodrome', name + ': no aerodrome / heliport', proc, 'airportHeliport', 'Each procedure references at least one AirportHeliport.');
    if (kind === 'IAP') {
      var n = 0; arr(p.landing).forEach(function (l) { if (l && l.nil === undefined) n += arr(l.runway).length + arr(l.runwayDirection).length + arr(l.TLOF).length; });
      if (n > 1) add('warning', 'Runway', name + ': ' + n + ' runway directions / TLOF served', proc, 'landing', 'An instrument approach serves one runway direction or one TLOF.');
      if (!n) add('info', 'Runway', name + ': no runway direction / TLOF served', proc, 'landing');
    }
    // navigation
    var nav = pbn(p);
    if (!nav.length && s(p.RNAV) !== 'YES') add('info', 'Navigation', name + ': navigation type not coded (PBN or conventional)', proc, 'aircraftCharacteristic', 'Each procedure has a navigationType; a PBN procedure a navigationSpecification.');
    nav.forEach(function (a) {
      if (a.type === 'PBN' && !a.spec) add('warning', 'Navigation', name + ': PBN without navigation specification', proc, 'aircraftCharacteristic');
      if (a.acc && /\d/.test(a.spec)) add('info', 'Navigation', name + ': navigation accuracy ' + a.acc + ' coded although ' + a.spec + ' already states it', proc, 'aircraftCharacteristic', 'Only code navigationAccuracy when the specification has no value (e.g. RNP with 0.15).');
    });
    if (!s(p.magneticVariation) && (p.magneticVariation !== undefined || /5\.2/.test(ds.version || ''))) add('info', 'Magnetic variation', name + ': magnetic variation of the design not coded', proc, 'magneticVariation');
    if (!design(p)) add('info', 'Design standard', name + ': design standard not coded', proc, 'designCriteria', 'PANS_OPS, TERPS, CANADA_TERPS, NATO (with the version in AIXM 5.2).');
    var safe = arr(p.safeAltitude).filter(function (x) { return x && x.nil === undefined; });
    if (!safe.length) add('info', 'Minimum altitude', name + ': no MSA ' + (kind === 'IAP' ? 'or TAA' : 'or AMA') + ' referenced', proc, 'safeAltitude', 'ICAO Annex 4: the minimum sector altitude (or TAA / area minimum altitudes) is shown on the chart.');
    // transitions
    var trs = arr(p.flightTransition).filter(function (t) { return t && t.nil === undefined; });
    if (!trs.length && procLegs.length) add('info', 'Transition', name + ': legs not sequenced (no procedure transition)', proc, 'flightTransition', 'Without ProcedureTransition / seqNumberARINC the order of the legs is not known.');
    if (trs.length > 1) trs.forEach(function (t) { if (!s(t.type)) add('warning', 'Transition', name + ': transition ' + (s(t.transitionId) || '?') + ' without type', proc, 'flightTransition', 'With several transitions (ARINC 424 model) each has a type: RWY, COMMON, EN_ROUTE, ENGINE_OUT (SID) or APPROACH / MISSED for approaches.'); });
    // legs
    var L = legInfo(procLegs), rnp = nav.some(function (a) { return /RNP/.test(a.spec); }) && !nav.some(function (a) { return /RNAV/.test(a.spec); }), pbnProc = nav.some(function (a) { return a.type === 'PBN' || a.spec; }) || s(p.RNAV) === 'YES';
    L.forEach(function (l) {
      var lp = l.p, pt = l.pt, rec = l.x.leg, ln = name + ' leg ' + (l.x.seq || '') + (pt ? ' ' + pt : '');
      if (!pt) { if (pbnProc) add('warning', 'Path terminator', ln + ': no ARINC 424 path terminator', rec, 'legTypeARINC', 'PANS-OPS: path terminators are assigned to all RNAV procedure legs.'); else if (!s(lp.legPath)) add('info', 'Path terminator', ln + ': no path terminator (legTypeARINC) nor leg path', rec, 'legTypeARINC'); return; }
      if (!PT[pt]) { add('warning', 'Path terminator', ln + ': unknown path terminator', rec, 'legTypeARINC'); return; }
      if (pbnProc && RNAV_PT.indexOf(pt) < 0) add('warning', 'Path terminator', ln + ': ' + PT[pt] + ' is not used for RNAV procedures', rec, 'legTypeARINC', 'PANS-OPS Vol II Part III Section 2 Chapter 5: IF, TF, CF, DF, RF, FA, FM, CA, VA, VI, VM, HM.');
      else if (rnp && RNP_PT.indexOf(pt) < 0) add('info', 'Path terminator', ln + ': RNP applications use IF, TF, RF and HM', rec, 'legTypeARINC');
      var hasStart = !!l.start, hasEnd = !!l.end;
      if (NEED.end.indexOf(pt) >= 0 && !hasEnd) add('warning', 'Leg data', ln + ': needs an end fix', rec, 'endPoint');
      if (NEED.start.indexOf(pt) >= 0 && !hasStart && !hasEnd) add('warning', 'Leg data', ln + ': needs a fix', rec, 'startPoint', pt === 'IF' ? 'An IF leg is coded with its fix as startPoint.' : '');
      if (NEED.arc.indexOf(pt) >= 0 && !arr(lp.arcCentre).filter(Boolean).length) add('warning', 'Leg data', ln + ': no arc centre', rec, 'arcCentre', 'PANS-OPS: an RF turn is defined by the tangential end point, the centre and the radius.');
      if (NEED.turn.indexOf(pt) >= 0 && !s(lp.turnDirection)) add('warning', 'Leg data', ln + ': no turn direction', rec, 'turnDirection');
      if (NEED.radius.indexOf(pt) >= 0 && !q(lp.radius)) add(/5\.2/.test(ds.version || '') ? 'warning' : 'info', 'Leg data', ln + ': no turn radius', rec, 'radius');
      if (NEED.alt.indexOf(pt) >= 0 && alt(lp).lowM === null) add('warning', 'Leg data', ln + ': ' + PT[pt].toLowerCase() + ' without the altitude', rec, 'lowerLimit');
      if (NEED.course.indexOf(pt) >= 0 && !course(lp)) add('warning', 'Leg data', ln + ': no ' + (pt.charAt(0) === 'V' ? 'heading' : 'course'), rec, 'course');
      if (NEED.lengthOrTime.indexOf(pt) >= 0 && !q(lp.length) && !q(lp.duration)) add('info', 'Leg data', ln + ': holding leg without length or time', rec, 'length');
      if (s(lp.turnDirection) === 'OTHER') add('info', 'Leg data', ln + ': turn direction OTHER', rec, 'turnDirection', 'LEFT, RIGHT or EITHER.');
      [['startPoint', l.start], ['endPoint', l.end]].forEach(function (k) {
        var sp = k[1]; if (!sp) return;
        if (/^(OTHER|NO_REPORT)$/.test(sp.reporting)) add('info', 'Fix', ln + ': reporting "' + sp.reporting + '"', rec, k[0], 'COMPULSORY or ON_REQUEST; a point without reporting is coded nil (inapplicable).');
        if (pbnProc && k[0] === 'endPoint' && !sp.flyOver && NEED.end.indexOf(pt) >= 0) add('info', 'Fix', ln + ': fly-by or fly-over not coded', rec, k[0], 'For RNAV procedures flyOver is YES (fly-over) or NO (fly-by).');
      });
      var va = parseFloat(s(lp.verticalAngle));
      if (!isNaN(va) && (l.x.leg.k === 'FinalLeg' || l.x.leg.k === 'IntermediateLeg') && va > 0) add('warning', 'Vertical angle', ln + ': descent angle +' + va + '°', rec, 'verticalAngle', 'A descent is coded with a negative angle (e.g. -3.0).');
      if (q(lp.speedLimit) && q(lp.speedLimit).u && !/^KT$/i.test(q(lp.speedLimit).u)) add('info', 'Speed', ln + ': speed in ' + q(lp.speedLimit).u, rec, 'speedLimit', 'Speed limits are usually coded in KT IAS.');
      if (l.x.leg.k === 'FinalLeg' && arr(lp.FASData).length) {
        var f = fas(l.x.leg);
        if (f && f.crc && !/^[0-9A-Fa-f]{8}$/.test(f.crc)) add('warning', 'FAS data block', ln + ': CRC remainder "' + f.crc + '" is not 8 hexadecimal characters', rec, 'FASData');
        if (f && !f.crc) add('info', 'FAS data block', ln + ': no CRC remainder', rec, 'FASData');
      }
    });
    // first and last legs of each phase (RNAV)
    if (pbnProc && L.length) {
      var groups = {};
      L.forEach(function (l) { var g = l.phase === 'MA' ? 'MA' : kind; (groups[g] = groups[g] || []).push(l); });
      Object.keys(groups).forEach(function (g) {
        var a = groups[g], f0 = a[0].pt, f1 = a[a.length - 1].pt, nm = { SID: 'SID', STAR: 'STAR', IAP: 'approach', MA: 'missed approach' }[g];
        if (f0 && FIRST[g].indexOf(f0) < 0) add('info', 'Sequence', name + ': ' + nm + ' starts with ' + f0, a[0].x.leg, 'legTypeARINC', 'PANS-OPS: an RNAV ' + nm + ' starts with ' + FIRST[g].join(', ') + '.');
        if (f1 && LAST[g].indexOf(f1) < 0) add('info', 'Sequence', name + ': ' + nm + ' ends with ' + f1, a[a.length - 1].x.leg, 'legTypeARINC', 'PANS-OPS: an RNAV ' + nm + ' ends with ' + LAST[g].join(', ') + '.');
      });
    }
    return out;
  }
  // feature types in an IFP data set that do not belong there (ICAO data set allocation)
  function allocation(ds) {
    var out = [];
    Object.keys(ds.byType || {}).forEach(function (k) {
      var n = (ds.byType[k] || []).length;
      if (n && !ALLOC[k]) out.push({ k: k, n: n, cls: 'N/A' });
    });
    return out;
  }
  // runway directions / TLOF a procedure serves: AIXM 5.1 (landing, takeoff, arrival, departureRunwayTransition; .runway)
  // and 5.2 (runwayTransition; .runwayDirection); records in this data set or another one loaded (procedures of an IFP
  // data set name the runways of the AIP data set) -> [{ds, r}]
  function runways(ds, proc, which) {
    var p = proc.cur.p, cols = [], out = [], seen = new Set();
    if (!which || which === 'proc') cols = cols.concat(arr(p.landing), arr(p.takeoff), arr(p.arrival));
    if (!which || which === 'tr') arr(p.flightTransition).forEach(function (tr) { if (tr && tr.nil === undefined) cols = cols.concat(arr(tr.departureRunwayTransition), arr(tr.runwayTransition)); });
    cols.forEach(function (c) {
      if (!c || c.nil !== undefined) return;
      arr(c.runway).concat(arr(c.runwayDirection), arr(c.TLOF)).forEach(function (ref) {
        if (!ref || !ref.ref) return;
        var t = M.target(ds, ref), o = t ? { ds: ds, r: t } : M.peer ? M.peer(ds, ref) : null;
        if (o && !seen.has(o.r)) { seen.add(o.r); out.push(o); }
      });
    });
    return out;
  }
  // the aerodrome of a procedure: linked in its data set, or named by airportHeliport in another data set loaded
  function aerodrome(ds, proc) {
    var o = ds.owner && ds.owner.get(proc);
    if (o) return { ds: ds, r: o };
    var refs = arr(proc.cur.p.airportHeliport).filter(function (x) { return x && x.ref; });
    for (var i = 0; i < refs.length; i++) { var t = M.target(ds, refs[i]); if (t) return { ds: ds, r: t }; var pe = M.peer ? M.peer(ds, refs[i]) : null; if (pe) return pe; }
    return null;
  }
  function isIfpSet(ds) { return ['StandardInstrumentDeparture', 'StandardInstrumentArrival', 'InstrumentApproachProcedure'].some(function (k) { return (ds.byType[k] || []).length; }); }

  return { PT: PT, RNAV_PT: RNAV_PT, RNP_PT: RNP_PT, FIRST: FIRST, LAST: LAST, NEED: NEED, ROLE: ROLE, ALLOC: ALLOC, KIND: KIND,
    alt: alt, course: course, speed: speed, point: point, pbn: pbn, pbnText: pbnText, navType: navType, cats: cats, design: design, magVar: magVar, fas: fas, minima: minima,
    checks: checks, allocation: allocation, runways: runways, aerodrome: aerodrome, isIfpSet: isIfpSet, toM: toM };
})();
