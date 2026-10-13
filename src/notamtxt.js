/*!
 * AIXM Code Converter
 * Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com> - author of the AIXM Code Converter
 * SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE; keep this notice in all copies)
 * ==========================================================================
 * AIXM Code Converter - NOTAM and AIP area text (NOTAMTXT)
 * NOT FOR NAVIGATION - for study and analysis only.
 * Text as pilots and dispatchers receive it (pasted, a .txt file, the text of a PDF briefing) read into data:
 *   NOTAM        ICAO format (ICAO Annex 15 / PANS-AIM Appendix 3: series and number, NOTAMN / R / C, Q) line with
 *                FIR, NOTAM code, traffic, purpose, scope, lower / upper limits and the circle of influence, items
 *                A) to G)) and the FAA domestic and FDC formats (!ORD 10/123 ORD OBST CRANE … 2610010000-2610302359)
 *                decoded with the ICAO NOTAM codes (Doc 8126: subject and condition); from item E): obstacles
 *                (position, elevation, height, lighting, type), areas (polygons, circles, arcs), the airspace named
 *                (OBR10, R-4808N, TSA 21 …) and its activation, runways closed and declared distances, schedules
 *   AIP areas    the prohibited, restricted and danger areas of an AIP (ENR 5.1, also ENR 5.2 / 5.3 tables) as text:
 *                designator, name, lateral limits (coordinates, circles, arcs), upper / lower limits, hours
 *   writers      the obstacles as a table the obstacle reader loads (CSV), the areas as AIXM 5.1 Airspace features
 *                (so they are on the map, in 3D and in every check like the AIXM data)
 * The text is read as written: what cannot be read is kept as text and listed, nothing is guessed silently.
 * ========================================================================== */
var NOTAMTXT = (function () {
  'use strict';
  var FT = 0.3048, D2R = Math.PI / 180;

  /* ------------------------------------------------------------ NOTAM codes (ICAO Doc 8126) */
  // subject (2nd and 3rd letters) -> meaning
  var SUBJ = {
    AA: 'minimum altitude', AC: 'class B, C, D or E surface area', AD: 'air defence identification zone (ADIZ)', AE: 'control area (CTA)', AF: 'flight information region (FIR)',
    AH: 'upper control area (UTA)', AL: 'minimum usable flight level', AN: 'area navigation route', AO: 'oceanic control area (OCA)', AP: 'reporting point', AR: 'ATS route',
    AT: 'terminal control area (TMA)', AU: 'upper flight information region (UIR)', AV: 'upper advisory area', AX: 'significant point', AZ: 'aerodrome traffic zone (ATZ)',
    CA: 'air / ground facility', CB: 'automatic dependent surveillance - broadcast (ADS-B)', CC: 'automatic dependent surveillance - contract (ADS-C)', CD: 'controller-pilot data link (CPDLC)',
    CE: 'en-route surveillance radar', CG: 'ground controlled approach system (GCA)', CL: 'selective calling system (SELCAL)', CM: 'surface movement radar', CP: 'precision approach radar (PAR)',
    CR: 'surveillance radar element of PAR', CS: 'secondary surveillance radar (SSR)', CT: 'terminal area surveillance radar (TAR)',
    FA: 'aerodrome', FB: 'friction measuring device', FC: 'ceiling measurement equipment', FD: 'docking system', FE: 'oxygen', FF: 'fire fighting and rescue', FG: 'ground movement control',
    FH: 'helicopter alighting area / platform', FI: 'aircraft de-icing', FJ: 'oils', FL: 'landing direction indicator', FM: 'meteorological service', FO: 'fog dispersal system', FP: 'heliport',
    FS: 'snow removal equipment', FT: 'transmissometer', FU: 'fuel availability', FW: 'wind direction indicator', FZ: 'customs / immigration',
    GA: 'GNSS airfield-specific operations', GW: 'GNSS area-wide operations',
    IC: 'instrument landing system (ILS)', ID: 'DME associated with ILS', IG: 'glide path (ILS)', II: 'inner marker (ILS)', IL: 'localizer (ILS)', IM: 'middle marker (ILS)',
    IN: 'localizer (not associated with ILS)', IO: 'outer marker (ILS)', IS: 'ILS category I', IT: 'ILS category II', IU: 'ILS category III', IW: 'microwave landing system (MLS)',
    IX: 'locator, outer (ILS)', IY: 'locator, middle (ILS)',
    LA: 'approach lighting system', LB: 'aerodrome beacon', LC: 'runway centre line lights', LD: 'landing direction indicator lights', LE: 'runway edge lights', LF: 'sequenced flashing lights',
    LG: 'pilot-controlled lighting', LH: 'high intensity runway lights', LI: 'runway end identifier lights', LJ: 'runway alignment indicator lights', LK: 'category II components of approach lighting',
    LL: 'low intensity runway lights', LM: 'medium intensity runway lights', LP: 'precision approach path indicator (PAPI)', LR: 'all landing area lighting facilities', LS: 'stopway lights',
    LT: 'threshold lights', LU: 'helicopter approach path indicator', LV: 'visual approach slope indicator system (VASIS)', LW: 'heliport lighting', LX: 'taxiway centre line lights',
    LY: 'taxiway edge lights', LZ: 'runway touchdown zone lights',
    MA: 'movement area', MB: 'bearing strength', MC: 'clearway', MD: 'declared distances', MG: 'taxiing guidance system', MH: 'runway arresting gear', MK: 'parking area', MM: 'daylight markings',
    MN: 'apron', MO: 'stopbar', MP: 'aircraft stands', MR: 'runway', MS: 'stopway', MT: 'threshold', MU: 'runway turning bay', MW: 'strip / shoulder', MX: 'taxiway(s)', MY: 'rapid exit taxiway',
    NA: 'all radio navigation facilities', NB: 'non-directional radio beacon (NDB)', NC: 'DECCA', ND: 'distance measuring equipment (DME)', NF: 'fan marker', NL: 'locator', NM: 'VOR / DME',
    NN: 'TACAN', NO: 'OMEGA', NT: 'VORTAC', NV: 'VOR', NX: 'direction finding station',
    OA: 'aeronautical information service', OB: 'obstacle', OE: 'aircraft entry requirements', OL: 'obstacle lights', OR: 'rescue coordination centre',
    PA: 'standard instrument arrival (STAR)', PB: 'standard VFR arrival', PC: 'contingency procedures', PD: 'standard instrument departure (SID)', PE: 'standard VFR departure',
    PF: 'flow control procedure', PH: 'holding procedure', PI: 'instrument approach procedure', PK: 'VFR approach procedure', PL: 'flight plan processing', PM: 'aerodrome operating minima',
    PN: 'noise operating restriction', PO: 'obstacle clearance altitude and height', PR: 'radio failure procedure', PT: 'transition altitude or transition level', PU: 'missed approach procedure',
    PX: 'minimum holding altitude', PZ: 'ADIZ procedure',
    RA: 'airspace reservation', RD: 'danger area', RM: 'military operating area', RO: 'overflying of', RP: 'prohibited area', RR: 'restricted area', RT: 'temporary restricted area',
    SA: 'automatic terminal information service (ATIS)', SB: 'ATS reporting office', SC: 'area control centre', SE: 'flight information service', SF: 'aerodrome flight information service',
    SL: 'flow control centre', SO: 'oceanic area control centre', SP: 'approach control service', SS: 'flight service station', ST: 'aerodrome control tower', SU: 'upper area control centre',
    SV: 'VOLMET broadcast', SY: 'upper advisory service',
    WA: 'air display', WB: 'aerobatics', WC: 'captive balloon or kite', WD: 'demolition of explosives', WE: 'exercises', WF: 'air refuelling', WG: 'glider flying', WH: 'blasting',
    WJ: 'banner / target towing', WL: 'ascent of free balloon', WM: 'missile, gun or rocket firing', WP: 'parachute jumping exercise', WR: 'radioactive materials or toxic chemicals',
    WS: 'burning or blowing gas', WT: 'mass movement of aircraft', WU: 'unmanned aircraft', WV: 'formation flight', WW: 'significant volcanic activity', WY: 'aerial survey', WZ: 'model flying',
    XX: 'other (plain language)'
  };
  // condition (4th and 5th letters) -> meaning
  var COND = {
    AC: 'withdrawn for maintenance', AD: 'available for daylight operation', AF: 'flight checked and found reliable', AG: 'operating but ground checked only', AH: 'hours of service are now',
    AK: 'resumed normal operation', AL: 'operative (subject to previously published limitations / conditions)', AM: 'military operations only', AN: 'available for night operation',
    AO: 'operational', AP: 'available, prior permission required', AR: 'available on request', AS: 'unserviceable', AU: 'not available', AW: 'completely withdrawn',
    AX: 'previously promulgated shutdown has been cancelled',
    CA: 'activated', CC: 'completed', CD: 'deactivated', CE: 'erected', CF: 'operating frequency changed', CG: 'downgraded', CH: 'changed', CI: 'identification or call sign changed',
    CL: 'realigned', CM: 'displaced', CN: 'cancelled', CO: 'operating', CP: 'operating on reduced power', CR: 'temporarily replaced by', CS: 'installed', CT: 'on test, do not use',
    HA: 'braking action', HB: 'friction coefficient', HC: 'covered by compacted snow', HD: 'covered by dry snow', HE: 'covered by water', HF: 'totally free of snow and ice',
    HG: 'grass cutting in progress', HH: 'hazard due to', HI: 'covered by ice', HJ: 'launch planned', HK: 'bird migration in progress', HL: 'snow clearance completed', HM: 'marked by',
    HN: 'covered by wet snow or slush', HO: 'obscured by snow', HP: 'snow clearance in progress', HQ: 'operation cancelled', HR: 'standing water', HS: 'sanding in progress',
    HT: 'approach according to signal area only', HU: 'launch in progress', HV: 'work completed', HW: 'work in progress', HX: 'concentration of birds', HY: 'snow banks exist',
    HZ: 'covered by frozen ruts and ridges',
    LA: 'operating on auxiliary power supply', LB: 'reserved for aircraft based therein', LC: 'closed', LD: 'unsafe', LE: 'operating without auxiliary power supply', LF: 'interference from',
    LG: 'operating without identification', LH: 'unserviceable for aircraft heavier than', LI: 'closed to IFR operations', LK: 'operating as a fixed light', LL: 'usable for length and width of',
    LN: 'closed to all night operations', LP: 'prohibited to', LR: 'aircraft restricted to runways and taxiways', LS: 'subject to interruption', LT: 'limited to', LV: 'closed to VFR operations',
    LW: 'will take place', LX: 'operating but caution advised due to',
    XX: 'other (plain language)'
  };
  var CAT_NAME = { airspace: 'Airspace and restrictions', obstacle: 'Obstacles', runway: 'Runways', taxiway: 'Taxiways and aprons', aerodrome: 'Aerodrome', lighting: 'Lighting',
    navaid: 'Navigation aids', com: 'Communication and surveillance', procedure: 'Procedures', warning: 'Navigation warnings', services: 'Air traffic services', other: 'Other' };
  function category(subj) {
    if (!subj) return 'other';
    var a = subj.charAt(0);
    if (subj === 'OB' || subj === 'OL') return 'obstacle';
    if (/^(MR|MT|MD|MS|MC|MW|MH|MU)$/.test(subj)) return 'runway';
    if (/^(MX|MY|MG|MN|MK|MP|MO|MA|MB|MM)$/.test(subj)) return 'taxiway';
    return { A: 'airspace', R: 'airspace', W: 'warning', L: 'lighting', N: 'navaid', I: 'navaid', G: 'navaid', C: 'com', F: 'aerodrome', P: 'procedure', S: 'services' }[a] || 'other';
  }
  function decode(code) {
    var c = String(code || '').toUpperCase().replace(/^Q/, '');
    return { subj: c.slice(0, 2), cond: c.slice(2, 4), subjTxt: SUBJ[c.slice(0, 2)] || '', condTxt: COND[c.slice(2, 4)] || '', cat: category(c.slice(0, 2)) };
  }

  /* ------------------------------------------------------------ values */
  function num(t) { var v = parseFloat(String(t).replace(',', '.')); return isNaN(v) ? null : v; }
  // YYMMDDHHMM (UTC) -> ms
  function t10(t) {
    var m = /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(t || '');
    if (!m) return null;
    var v = Date.UTC(2000 + +m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    return isNaN(v) || +m[2] < 1 || +m[2] > 12 || +m[3] < 1 || +m[3] > 31 || +m[4] > 24 || +m[5] > 59 ? null : v;
  }
  // a vertical limit written in a NOTAM or an AIP: GND, SFC, FL150, 3000FT AMSL, 450 M AGL, UNL -> {m, ref, txt}
  function limit(txt) {
    var t = String(txt || '').toUpperCase().replace(/\s+/g, ' ').trim();
    if (!t) return null;
    if (/^(GND|SFC|SURFACE|GROUND)\b/.test(t)) return { m: 0, ref: 'SFC', txt: t.slice(0, 3) === 'SUR' ? 'SFC' : t.split(' ')[0], gnd: true };
    if (/^(UNL|UNLTD|UNLIMITED)\b/.test(t)) return { m: Infinity, ref: 'STD', txt: 'UNL', unl: true };
    var m = /^FL\s?(\d{2,3})\b/.exec(t);
    if (m) return { m: +m[1] * 100 * FT, ref: 'STD', txt: 'FL' + ('00' + m[1]).slice(-3), fl: +m[1] };
    m = /^(\d+(?:[.,]\d+)?)\s?(FT|FEET|M|METRES?|METERS?)?\s?(AMSL|MSL|ALT|AGL|SFC|GND|AAL|HGT)?/.exec(t);
    if (!m) return null;
    var v = num(m[1]), u = /^M/.test(m[2] || '') ? 'M' : 'FT', ref = /AGL|SFC|GND|AAL|HGT/.test(m[3] || '') ? 'SFC' : 'MSL';
    return { m: u === 'M' ? v : v * FT, ref: ref, txt: m[1] + (u === 'M' ? ' M' : ' FT') + ' ' + (ref === 'SFC' ? 'AGL' : 'AMSL'), v: v, u: u };
  }
  var LIM_RE = /\b(?:FL\s?\d{2,3}|\d{2,6}(?:[.,]\d+)?\s?(?:FT|FEET|M|METRES?|METERS?)\b(?:\s?(?:AMSL|MSL|ALT|AGL|SFC|GND|AAL))?|GND|SFC|UNL(?:TD|IMITED)?)\b/g;

  /* ------------------------------------------------------------ coordinates in text */
  function dms(ip, frac, degLen) { // integer part of DDMM[SS] / DDDMM[SS] (+ fraction) -> degrees
    var d = +ip.slice(0, degLen), mm = +ip.slice(degLen, degLen + 2), rest = ip.slice(degLen + 2);
    if (mm >= 60) return NaN;
    if (!rest) return d + (mm + (frac ? parseFloat('0.' + frac) : 0)) / 60;
    var ss = parseFloat(rest + (frac ? '.' + frac : '')); if (ss >= 60) return NaN;
    return d + mm / 60 + ss / 3600;
  }
  var C_PACKED = /(\d{4}|\d{6})(\.\d+)?\s?([NS])\s*[-/,]?\s*(\d{5}|\d{7})(\.\d+)?\s?([EW])/g;
  var C_SPACED = /\b(?:([NS])\s?)?(\d{1,2})[°\s:-]\s?(\d{1,2})['′\s:-]\s?(\d{1,2}(?:[.,]\d+)?)\s?(?:"|″|'')?\s?([NS])?\s*[,/;-]?\s*(?:([EW])\s?)?(\d{1,3})[°\s:-]\s?(\d{1,2})['′\s:-]\s?(\d{1,2}(?:[.,]\d+)?)\s?(?:"|″|'')?\s?([EW])?/g;
  // every position in a text, in order: [{c: [lon, lat], i: index, n: length}]
  function coords(text) {
    var t = String(text || '').toUpperCase(), out = [], m;
    C_PACKED.lastIndex = 0;
    while ((m = C_PACKED.exec(t))) {
      var la = dms(m[1], m[2] ? m[2].slice(1) : '', 2), lo = dms(m[4], m[5] ? m[5].slice(1) : '', 3);
      if (!isFinite(la) || !isFinite(lo) || la > 90 || lo > 180) continue;
      out.push({ c: [m[6] === 'W' ? -lo : lo, m[3] === 'S' ? -la : la], i: m.index, n: m[0].length });
    }
    C_SPACED.lastIndex = 0;
    while ((m = C_SPACED.exec(t))) {
      var hn = m[1] || m[5], he = m[6] || m[10];
      if (!hn || !he) continue;
      if (out.some(function (o) { return m.index < o.i + o.n && o.i < m.index + m[0].length; })) continue;
      var a = +m[2] + +m[3] / 60 + num(m[4]) / 3600, b = +m[7] + +m[8] / 60 + num(m[9]) / 3600;
      if (+m[3] >= 60 || +m[8] >= 60 || a > 90 || b > 180) continue;
      out.push({ c: [he === 'W' ? -b : b, hn === 'S' ? -a : a], i: m.index, n: m[0].length });
    }
    return out.sort(function (x, y) { return x.i - y.i; });
  }

  /* ------------------------------------------------------------ geometry */
  function dest(c, brg, dNM) {
    var R = 3440.065, d = dNM / R, b = brg * D2R, la = c[1] * D2R, lo = c[0] * D2R;
    var la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(b));
    var lo2 = lo + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2));
    return [((lo2 / D2R + 540) % 360) - 180, la2 / D2R];
  }
  function bearing(a, b) {
    var la1 = a[1] * D2R, la2 = b[1] * D2R, dl = (b[0] - a[0]) * D2R;
    return (Math.atan2(Math.sin(dl) * Math.cos(la2), Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dl)) / D2R + 360) % 360;
  }
  function distNM(a, b) {
    var la1 = a[1] * D2R, la2 = b[1] * D2R, h = Math.pow(Math.sin((la2 - la1) / 2), 2) + Math.cos(la1) * Math.cos(la2) * Math.pow(Math.sin((b[0] - a[0]) * D2R / 2), 2);
    return 2 * 3440.065 * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  function circle(c, rNM, n) { var out = []; n = n || 72; for (var i = 0; i <= n; i++) out.push(dest(c, i * 360 / n, rNM)); return out; }
  // arc from a to b around c (cw: clockwise), the radius of a
  function arc(c, a, b, cw) {
    var r = distNM(c, a), b0 = bearing(c, a), b1 = bearing(c, b), sweep = cw ? (b1 - b0 + 360) % 360 : -((b0 - b1 + 360) % 360), n = Math.max(2, Math.ceil(Math.abs(sweep) / 5)), out = [];
    for (var i = 1; i < n; i++) out.push(dest(c, b0 + sweep * i / n, r));
    return out;
  }
  function toNM(v, u) { u = String(u || 'NM').toUpperCase(); return u === 'KM' ? v / 1.852 : u === 'M' ? v / 1852 : u === 'FT' ? v * FT / 1852 : v; }
  var RADIUS_RE = /(?:(\d+(?:[.,]\d+)?)\s?(NM|KM|M|FT)\s+RADIUS|RADIUS\s+(?:OF\s+)?(\d+(?:[.,]\d+)?)\s?(NM|KM|M|FT))/;

  /* ------------------------------------------------------------ obstacles in item E */
  var OB_TYPES = [[/WIND ?TURBINE|WIND ?MILL|WTG\b/, 'WINDMILL'], [/CRANE/, 'CRANE'], [/CHIMNEY|STACK/, 'STACK'], [/ANTENNA|AERIAL|MAST|TELECOM/, 'ANTENNA'], [/T-L TWR|POWER ?LINE|TRANSMISSION LINE|CABLE/, 'TRANSMISSION_LINE'],
    [/TOWER|TWR|PYLON/, 'TOWER'], [/BLDG|BUILDING|HANGAR/, 'BUILDING'], [/RIG|PLATFORM/, 'RIG'], [/BALLOON|KITE/, 'TETHERED_BALLOON'], [/POLE/, 'POLE'], [/TREE|VEGETATION/, 'TREE'],
    [/DRILLING|DERRICK/, 'RIG'], [/SPIRE|MINARET/, 'SPIRE'], [/TANK|SILO/, 'STORAGE_TANK'], [/BRIDGE/, 'BRIDGE'], [/DRONE|UAS\b|UAV\b/, 'OTHER:UNMANNED_AIRCRAFT'], [/LIGHT ?HOUSE/, 'LIGHTHOUSE']];
  function obType(t) { for (var i = 0; i < OB_TYPES.length; i++) if (OB_TYPES[i][0].test(t)) return OB_TYPES[i][1]; return /OBST/.test(t) ? '' : ''; }
  // heights in a text: [{m, agl, amsl, i}] (FAA domestic: "856FT (180FT AGL)" - the first value is above mean sea level)
  function heights(t, faa) {
    var re = /(\b(?:HGT|HEIGHT|HGHT|ELEV|ELEVATION|TOP|ALT|ALTITUDE|AMSL)\b\.?\s*:?\s*)?(\d+(?:[.,]\d+)?)\s?(FT|FEET|M|METRES?|METERS?)\b\.?\s*(\(?\s*(?:AGL|AMSL|MSL|AAL|ABOVE GROUND LEVEL|ABOVE MEAN SEA LEVEL|GND|SFC)\b)?/g, out = [], m;
    while ((m = re.exec(t))) {
      var v = num(m[2]), u = /^M/.test(m[3]) ? 'M' : 'FT', w = (m[1] || '').trim(), sfx = (m[4] || '').replace(/[(\s]/g, '');
      var agl = /AGL|AAL|GROUND|GND|SFC/.test(sfx) || (!sfx && /^(HGT|HEIGHT|HGHT)/.test(w)), amsl = /AMSL|MSL|SEA/.test(sfx) || (!sfx && /^(ELEV|ELEVATION|TOP|ALT|ALTITUDE|AMSL)/.test(w));
      if (!agl && !amsl && faa) amsl = true;
      out.push({ m: u === 'M' ? v : v * FT, v: v, u: u, agl: agl, amsl: amsl, i: m.index });
    }
    return out;
  }
  function obstaclesIn(n) {
    var E = n.text || '', t = E.toUpperCase(), pts = coords(t), hs = heights(t, n.fmt === 'FAA'), out = [];
    if (!pts.length && n.qCentre && (n.subj === 'OB' || n.subj === 'OL')) pts = [{ c: n.qCentre, i: 0, n: 0, fromQ: true }];
    if (!pts.length) return out;
    var lightsUs = n.subj === 'OL' || /\b(LGT|LIGHTS?|LGTS)\b[^.]{0,30}\b(U\/S|UNSERVICEABLE|OUT OF SERVICE|INOP)\b|\bU\/S\b/.test(t);
    var lit = /\bNOT\s+(LGTD|LIGHTED|LIT)\b|\bUNLIT\b|\bUNLGTD\b/.test(t) ? 'NO' : /\b(LGTD|LIGHTED|LIT)\b|\bLGT\b/.test(t) ? 'YES' : '';
    var marked = /\bNOT\s+(MARKED|MKD)\b/.test(t) ? 'NO' : /\b(MARKED|MKD|FLAGGED|PAINTED)\b/.test(t) ? 'YES' : '';
    var rad = RADIUS_RE.exec(t), rNM = rad ? toNM(num(rad[1] || rad[3]), rad[2] || rad[4]) : null;
    var ty = obType(t), ag = hs.filter(function (h) { return h.agl; }), am = hs.filter(function (h) { return h.amsl; });
    pts.forEach(function (p, k) {
      // one height for all, or one per position (in order)
      var a = ag.length === pts.length ? ag[k] : ag.length === 1 ? ag[0] : null, e = am.length === pts.length ? am[k] : am.length === 1 ? am[0] : null;
      out.push({ c: p.c, elev: e ? e.m : null, hgt: a ? a.m : null, elevTxt: e ? e.v + ' ' + e.u : '', hgtTxt: a ? a.v + ' ' + a.u : '', lit: lit, lightsUs: lightsUs, marked: marked, type: ty, radiusNM: rNM, approx: !!p.fromQ });
    });
    return out;
  }

  /* ------------------------------------------------------------ areas and airspace named in item E */
  var DESIG_RE = /\b([A-Z]{2})\s?([PRD])\s?-?\s?(\d{1,4}[A-Z]{0,2})\b|\b([PRDWA])-(\d{2,4}[A-Z]{0,2})\b|\b(TSA|TRA|CBA|MOA|TMA|CTR|ATZ|ADIZ)\s?-?\s?(\d[A-Z0-9]{0,7}|[A-Z]{1,3}\d[A-Z0-9]{0,5})\b/g;
  var NAMED_RE = /\b([A-Z]{3,}(?:\s[A-Z0-9]{1,8})?)\s(MOA|ATCAA)\b/g, NOT_NAME = /^(AND|THE|OR|OF|IN|WI|ACT|ACTIVE|SFC|GND|AREA|FROM|TO|FOR|ALL)\b/;
  function key(d) { return String(d || '').toUpperCase().replace(/[\s_-]+/g, ''); }
  function designators(text) {
    var t = String(text || '').toUpperCase(), out = [], m;
    DESIG_RE.lastIndex = 0;
    while ((m = DESIG_RE.exec(t))) {
      var d = m[1] ? m[1] + m[2] + m[3] : m[4] ? m[4] + '-' + m[5] : m[6] ? m[6] + ' ' + m[7] : '';
      if (m[1] && /^(RW|TW|FL|FT|NM|KM|SF|GN|UN)$/.test(m[1])) continue; // RWY 09, FL120 … are not areas
      if (d && out.indexOf(d) < 0) out.push(d);
    }
    NAMED_RE.lastIndex = 0;
    while ((m = NAMED_RE.exec(t))) { // BRISTOL MOA, WHISKEY ATCAA
      var nm = m[1].split(' ').filter(function (w) { return !NOT_NAME.test(w); }).join(' ');
      if (nm && !NOT_NAME.test(nm)) { var dd = nm + ' ' + m[2]; if (out.indexOf(dd) < 0) out.push(dd); }
    }
    return out;
  }
  // the lateral limits in a text: a polygon of the positions (arcs between two of them), or a circle
  function shapeIn(text, centreQ, radiusQ) {
    var t = String(text || '').toUpperCase(), pts = coords(t), rad = RADIUS_RE.exec(t);
    if (rad && pts.length) {
      var r = toNM(num(rad[1] || rad[3]), rad[2] || rad[4]), after = pts.filter(function (p) { return p.i > rad.index; })[0], c = after && after.i - rad.index < 120 ? after : pts[pts.length - 1];
      if (pts.length < 3 || !/ARC/.test(t)) return { circle: { c: c.c, rNM: r }, ring: circle(c.c, r) };
    }
    if (pts.length >= 3) {
      var ring = [], prev = null;
      for (var i = 0; i < pts.length; i++) {
        var gap = t.slice(prev ? prev.i + prev.n : 0, pts[i].i);
        // "… then clockwise along the arc of a circle radius 10 NM centred on C to P …": C is a centre, not a vertex
        if (/CENT(RE|ER|RED|ERED)/.test(gap) && /ARC/.test(gap) && i + 1 < pts.length && ring.length) {
          var cw = !/ANTI-?\s?CLOCKWISE|COUNTER-?\s?CLOCKWISE|ANTICLOCKWISE/.test(gap);
          ring = ring.concat(arc(pts[i].c, ring[ring.length - 1], pts[i + 1].c, cw));
          prev = pts[i]; continue;
        }
        ring.push(pts[i].c); prev = pts[i];
      }
      var f = ring[0], l = ring[ring.length - 1];
      if (f[0] !== l[0] || f[1] !== l[1]) ring.push(f.slice());
      if (ring.length >= 4) return { ring: ring };
    }
    if (centreQ && radiusQ) return { circle: { c: centreQ, rNM: radiusQ }, ring: circle(centreQ, radiusQ), fromQ: true };
    return null;
  }

  /* ------------------------------------------------------------ runway items */
  function runwayIn(text) {
    var t = String(text || '').toUpperCase(), rw = [], m, re = /\bRWY\s*(\d{2}[LRC]?(?:\s?\/\s?\d{2}[LRC]?)?)\b/g;
    while ((m = re.exec(t))) { var d = m[1].replace(/\s/g, ''); if (rw.indexOf(d) < 0) rw.push(d); }
    if (!rw.length) return null;
    var dist = {}, dre = /\b(TORA|TODA|ASDA|LDA)\s*:?\s*(\d{3,5})\s?(M|FT)?\b/g;
    while ((m = dre.exec(t))) dist[m[1]] = { m: m[3] === 'FT' ? +m[2] * FT : +m[2], txt: m[2] + ' ' + (m[3] || 'M') };
    var thr = /\bTHR\b[^.]{0,40}\b(DISPLACED|DSPLCD|DTHR)\b[^.]{0,30}?(\d{2,4})\s?(M|FT)\b/.exec(t);
    return { rwys: rw, closed: /\bCLSD\b|\bCLOSED\b/.test(t) && !/\bNOT\s+CLSD\b/.test(t), dist: dist, thrDisplaced: thr ? (thr[3] === 'FT' ? +thr[2] * FT : +thr[2]) : null,
      lightsUs: /\b(LGT|LIGHTS?|ALS|PAPI|VASIS|REDL|RCLL|TDZL|HIRL|MIRL)\b[^.]{0,30}\b(U\/S|UNSERVICEABLE|OUT OF SERVICE|INOP)\b/.test(t), wip: /\bWIP\b|WORK IN PROGRESS|\bWORKS?\b/.test(t) };
  }

  /* ------------------------------------------------------------ schedule (item D) */
  var DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  // simple schedules: H24, DAILY / DLY HHMM-HHMM, MON-FRI HHMM-HHMM, MON WED FRI HHMM-HHMM … -> {days: Set(0..6), spans: [[min, min]]} or null
  function schedule(d) {
    var t = String(d || '').toUpperCase().replace(/\s+/g, ' ').trim();
    if (!t) return null;
    if (/^H24$/.test(t)) return { days: new Set([0, 1, 2, 3, 4, 5, 6]), spans: [[0, 1440]] };
    var days = new Set(), m, rd = /\b(SUN|MON|TUE|WED|THU|FRI|SAT)\b(?:\s?-\s?\b(SUN|MON|TUE|WED|THU|FRI|SAT)\b)?/g;
    if (/\b(DAILY|DLY|EVERY DAY)\b/.test(t)) [0, 1, 2, 3, 4, 5, 6].forEach(function (x) { days.add(x); });
    while ((m = rd.exec(t))) {
      var a = DAYS.indexOf(m[1]), b = m[2] ? DAYS.indexOf(m[2]) : a;
      for (var k = a; ; k = (k + 1) % 7) { days.add(k); if (k === b) break; }
    }
    var spans = [], rt = /\b(\d{2})(\d{2})\s?-\s?(\d{2})(\d{2})\b/g;
    while ((m = rt.exec(t))) spans.push([+m[1] * 60 + +m[2], +m[3] * 60 + +m[4]]);
    if (!spans.length) return null;
    if (!days.size) [0, 1, 2, 3, 4, 5, 6].forEach(function (x) { days.add(x); });
    if (/\b(SR|SS|HJ|HN|EXC|EXCEPT|PH|HOL)\b/.test(t)) return { days: days, spans: spans, partial: true };
    return { days: days, spans: spans };
  }
  // the state of a NOTAM at time T: 'on' (in force), 'maybe' (within its period, schedule not read), 'off' (outside its schedule), 'future', 'ended', 'cancel'
  function stateAt(n, T) {
    if (n.type === 'C') return 'cancel';
    if (n.from !== null && T < n.from) return 'future';
    if (n.to !== null && n.to !== Infinity && T >= n.to) return 'ended';
    if (!n.sched) return 'on';
    var sc = schedule(n.sched);
    if (!sc) return 'maybe';
    var d = new Date(T), w = d.getUTCDay(), mn = d.getUTCHours() * 60 + d.getUTCMinutes();
    var hit = sc.spans.some(function (s) {
      if (s[0] <= s[1]) return sc.days.has(w) && mn >= s[0] && mn < s[1];
      return (sc.days.has(w) && mn >= s[0]) || (sc.days.has((w + 6) % 7) && mn < s[1]); // across midnight
    });
    return hit ? (sc.partial ? 'maybe' : 'on') : sc.partial ? 'maybe' : 'off';
  }

  /* ------------------------------------------------------------ one NOTAM */
  function blank(raw) {
    return { raw: raw, fmt: '', id: '', series: '', type: 'N', ref: '', fir: '', code: '', subj: '', cond: '', subjTxt: '', condTxt: '', traffic: '', purpose: '', scope: '',
      qLower: null, qUpper: null, qCentre: null, qRadiusNM: null, locs: [], from: null, to: null, est: false, perm: false, sched: '', text: '', lower: null, upper: null,
      cat: 'other', obstacles: [], area: null, designators: [], activation: '', runway: null, problems: [] };
  }
  function itemsOf(t) { // the items Q) A) B) C) D) E) F) G) in their order
    var out = {}, pos = 0, order = ['Q', 'A', 'B', 'C', 'D', 'E', 'F', 'G'], found = [];
    order.forEach(function (k) {
      var re = new RegExp('(?:^|[\\s(])' + k + '\\)\\s?', 'g'); re.lastIndex = pos;
      var m = re.exec(t);
      if (m) { found.push({ k: k, i: m.index + m[0].length, at: m.index }); pos = m.index + m[0].length; }
    });
    found.forEach(function (f, i) { var end = i + 1 < found.length ? found[i + 1].at : t.length; out[f.k] = t.slice(f.i, end).trim(); });
    return out;
  }
  function parseIcao(raw) {
    var n = blank(raw), t = raw.replace(/\r/g, '').trim();
    n.fmt = 'ICAO';
    var h = /\(?\s*([A-Z])(\d{4})\/(\d{2})\s+NOTAM([NRC])(?:\s+([A-Z]\d{4}\/\d{2}))?/.exec(t);
    if (h) { n.series = h[1]; n.id = h[1] + h[2] + '/' + h[3]; n.type = h[4]; n.ref = h[5] || ''; }
    var it = itemsOf(t);
    if (it.Q) {
      var q = it.Q.replace(/\s+/g, '').split('/');
      n.fir = q[0] || '';
      var code = (q[1] || '').replace(/^Q/, '');
      if (/^[A-Z]{4}$/.test(code)) { n.code = 'Q' + code; var dc = decode(code); n.subj = dc.subj; n.cond = dc.cond; n.subjTxt = dc.subjTxt; n.condTxt = dc.condTxt; n.cat = dc.cat; }
      n.traffic = q[2] || ''; n.purpose = q[3] || ''; n.scope = q[4] || '';
      if (/^\d{3}$/.test(q[5] || '')) n.qLower = +q[5];
      if (/^\d{3}$/.test(q[6] || '')) n.qUpper = +q[6];
      var cm = /^(\d{2})(\d{2})([NS])(\d{3})(\d{2})([EW])(\d{3})?$/.exec(q[7] || '');
      if (cm) { var la = +cm[1] + +cm[2] / 60, lo = +cm[4] + +cm[5] / 60; n.qCentre = [cm[6] === 'W' ? -lo : lo, cm[3] === 'S' ? -la : la]; if (cm[7]) n.qRadiusNM = +cm[7]; }
    } else n.problems.push('no Q) line');
    if (it.A) n.locs = it.A.split(/[\s,]+/).filter(function (x) { return /^[A-Z]{4}$/.test(x); });
    if (it.B) n.from = t10((/\d{10}/.exec(it.B) || [''])[0]);
    if (it.C) { n.perm = /PERM/.test(it.C); n.est = /EST/.test(it.C); n.to = n.perm ? Infinity : t10((/\d{10}/.exec(it.C) || [''])[0]); }
    if (it.D) n.sched = it.D;
    n.text = (it.E || '').replace(/\)\s*$/, '').trim();
    if (it.F) n.lower = limit(it.F);
    var g = it.G ? it.G.replace(/\)\s*$/, '') : '';
    if (g) n.upper = limit(g);
    if (!n.lower && n.qLower !== null) n.lower = n.qLower === 0 ? { m: 0, ref: 'SFC', txt: 'SFC', gnd: true, fromQ: true } : { m: n.qLower * 100 * FT, ref: 'STD', txt: 'FL' + ('00' + n.qLower).slice(-3), fromQ: true };
    if (!n.upper && n.qUpper !== null) n.upper = n.qUpper >= 999 ? { m: Infinity, ref: 'STD', txt: 'UNL', unl: true, fromQ: true } : { m: n.qUpper * 100 * FT, ref: 'STD', txt: 'FL' + ('00' + n.qUpper).slice(-3), fromQ: true };
    if (!n.text) n.problems.push('no item E)');
    return derive(n);
  }
  // FAA domestic: !ACCT NN/NNN LOC KEYWORD text YYMMDDHHMM-YYMMDDHHMM[EST]; FDC: !FDC N/NNNN ARTCC ST..text
  var FAA_KEY = { RWY: 'runway', TWY: 'taxiway', APRON: 'taxiway', RAMP: 'taxiway', AD: 'aerodrome', OBST: 'obstacle', NAV: 'navaid', COM: 'com', SVC: 'services', AIRSPACE: 'airspace',
    ODP: 'procedure', SID: 'procedure', STAR: 'procedure', IAP: 'procedure', CHART: 'procedure', DATA: 'other', VFP: 'procedure', ROUTE: 'procedure', SPECIAL: 'other', SECURITY: 'airspace' };
  var FAA_SUBJ = { runway: 'MR', taxiway: 'MX', obstacle: 'OB', navaid: 'NA', airspace: 'RT', procedure: 'PI', aerodrome: 'FA', com: 'CA', services: 'SE' };
  function parseFaa(raw) {
    var n = blank(raw), t = raw.replace(/\r/g, '').replace(/\s+/g, ' ').trim();
    n.fmt = 'FAA';
    var m = /^!(\w{3,4})\s+(\d{1,2}\/\d{1,4})\s+(\S+)\s+([\s\S]*)$/.exec(t);
    if (!m) { n.problems.push('not read as an FAA NOTAM'); n.text = t; return derive(n); }
    n.id = m[1] + ' ' + m[2]; n.series = m[1]; n.locs = [m[3].replace(/\.\..*$/, '')];
    var rest = m[4], tm = /\s(\d{10})-(\d{10}|PERM)(EST)?\s*$/.exec(' ' + rest);
    if (tm) { n.from = t10(tm[1]); n.perm = tm[2] === 'PERM'; n.to = n.perm ? Infinity : t10(tm[2]); n.est = !!tm[3]; rest = rest.slice(0, rest.length - tm[0].length + 1).trim(); }
    var kw = /^(\S+)/.exec(rest), k = kw ? kw[1].replace(/\.\..*$/, '') : '';
    var cat = FAA_KEY[k] || (/AIRSPACE|FLIGHT RESTRICTION|TFR|\bRESTRICTED\b|\bMOA\b|\bATCAA\b/.test(rest) ? 'airspace' : m[1] === 'FDC' ? 'procedure' : 'other');
    n.cat = cat; n.subj = FAA_SUBJ[cat] || ''; n.subjTxt = SUBJ[n.subj] || ''; n.text = rest;
    if (/\bCLSD\b/.test(rest)) { n.cond = 'LC'; n.condTxt = COND.LC; }
    else if (/\bU\/S\b|UNSERVICEABLE|\bOTS\b/.test(rest)) { n.cond = 'AS'; n.condTxt = COND.AS; if (cat === 'obstacle') { n.subj = 'OL'; n.subjTxt = SUBJ.OL; } }
    else if (/\bACT\b|\bACTIVE\b|\bACTIVATED\b/.test(rest)) { n.cond = 'CA'; n.condTxt = COND.CA; }
    else if (cat === 'obstacle') { n.cond = 'CE'; n.condTxt = COND.CE; }
    if (n.subj) n.code = 'Q' + n.subj + (n.cond || 'XX');
    // vertical limits written as SFC-2999FT, 3000FT-FL180, … (TFR, MOA)
    var vl = /\b(SFC|GND|\d{3,5}\s?FT(?:\s?(?:AGL|MSL|AMSL))?|FL\s?\d{2,3})\s?-\s?(\d{3,5}\s?FT(?:\s?(?:AGL|MSL|AMSL))?|FL\s?\d{2,3}|UNL)\b/.exec(rest);
    if (vl) { n.lower = limit(vl[1]); n.upper = limit(vl[2]); }
    else if (/UP TO AND INCLUDING (\d{3,5})\s?FT/.test(rest)) { n.lower = limit('SFC'); n.upper = limit(/UP TO AND INCLUDING (\d{3,5}\s?FT\s?\w*)/.exec(rest)[1]); }
    return derive(n);
  }
  function derive(n) {
    var T = (n.text || '').toUpperCase();
    if (n.cat === 'other' && /\bOBST\b|\bCRANE\b/.test(T)) { n.cat = 'obstacle'; if (!n.subj) { n.subj = 'OB'; n.subjTxt = SUBJ.OB; } }
    if (n.cat === 'obstacle') n.obstacles = obstaclesIn(n);
    if (n.cat === 'airspace' || n.cat === 'warning') {
      n.designators = designators(T);
      n.area = shapeIn(T, n.qCentre, n.qRadiusNM);
      n.activation = /\bDEACT|\bNOT ACT|\bDEACTIVATED\b|\bINACTIVE\b/.test(T) || n.cond === 'CD' ? 'off' : n.cond === 'CA' || /\bACT\b|\bACTIVE\b|\bACTIVATED\b|\bIN FORCE\b|\bWILL TAKE PLACE\b/.test(T) || n.cat === 'warning' ? 'on' : '';
      if (!n.activation && /^(RR|RD|RP|RT|RA|RM)$/.test(n.subj)) n.activation = 'on';
    }
    if (n.cat === 'runway' || n.cat === 'lighting' || /\bRWY\b/.test(T)) n.runway = runwayIn(T);
    return n;
  }

  /* ------------------------------------------------------------ a briefing: many NOTAMs */
  function split(text) {
    var t = String(text || '').replace(/\r\n?/g, '\n'), cuts = [], m;
    var icao = /(^|[\s(])([A-Z]\d{4}\/\d{2})\s+NOTAM[NRC]\b/g;
    while ((m = icao.exec(t))) cuts.push({ i: m.index + m[1].length - (m[1] === '(' ? 1 : 0), k: 'ICAO' });
    var faa = /(^|\n)[ \t]*(!\w{3,4}\s+\d{1,2}\/\d{1,4}\s)/g;
    while ((m = faa.exec(t))) cuts.push({ i: m.index + m[1].length, k: 'FAA' });
    cuts.sort(function (a, b) { return a.i - b.i; });
    var out = [];
    cuts.forEach(function (c, i) { var e = i + 1 < cuts.length ? cuts[i + 1].i : t.length, raw = t.slice(c.i, e).trim(); if (raw) out.push({ raw: raw, k: c.k }); });
    if (!out.length) t.split(/\n\s*\n/).forEach(function (b) { if (/\bQ\)|\bE\)/.test(b)) out.push({ raw: b.trim(), k: 'ICAO' }); });
    return out;
  }
  function parse(text) {
    return split(text).map(function (x) { return x.k === 'FAA' ? parseFaa(x.raw) : parseIcao(x.raw); });
  }
  function parseOne(raw) { return /^\s*!/.test(raw) ? parseFaa(raw) : parseIcao(raw); }

  /* ------------------------------------------------------------ AIP area tables (ENR 5.1 / 5.2 / 5.3) */
  var AREA_START = /^\s*((?:[A-Z]{2}\s?[PRD]\s?-?\s?\d{1,4}[A-Z]{0,2})|(?:[PRDWA]-\d{2,4}[A-Z]{0,2})|(?:(?:TSA|TRA|CBA|MOA)\s?-?\s?[A-Z0-9]{1,6}))\b(.*)$/;
  function typeOfDesig(d) {
    var k = key(d), m = /^[A-Z]{2}([PRD])\d/.exec(k) || /^([PRDWA])\d/.exec(k);
    if (m) return m[1];
    var w = /^(TSA|TRA|CBA|MOA)/.exec(k);
    return w ? w[1] : 'D_OTHER';
  }
  function areas(text) {
    var lines = String(text || '').replace(/\r\n?/g, '\n').split('\n'), ents = [], cur = null;
    lines.forEach(function (l) {
      var m = AREA_START.exec(l.toUpperCase());
      // "GND - 3000 FT", "SFC 500" … are limits, not designators
      if (m && /^(GN|SF|UN|FL|FT|NM|KM|RW|TW|HG|EL)\b/.test(m[1].replace(/\s+/g, '').slice(0, 2)) && /^\s*(GND|SFC|UNL|FL|FT|NM|KM|RWY|TWY|HGT|ELEV)/.test(l.toUpperCase())) m = null;
      if (m && /^\s*(FT|M|NM|KM|FEET)\b/.test(m[2])) m = null;
      if (m && !/^\s*(RWY|FL|FT)\b/.test(l.toUpperCase())) { cur = { desig: m[1].replace(/\s+/g, ' ').trim(), first: m[2], text: l }; ents.push(cur); }
      else if (cur) cur.text += '\n' + l;
    });
    return ents.map(function (e) {
      var t = e.text.toUpperCase(), sh = shapeIn(t), lims = [], m, problems = [];
      var up = /UPPER(?:\s+LIMIT)?\s*:?\s*([A-Z0-9 .,]{2,24}?)(?=\s*(?:LOWER|\/|\n|$))/.exec(t), lo = /LOWER(?:\s+LIMIT)?\s*:?\s*([A-Z0-9 .,]{2,24}?)(?=\s*(?:UPPER|\/|\n|$))/.exec(t);
      var upper = up ? limit(up[1]) : null, lower = lo ? limit(lo[1]) : null;
      if (!upper || !lower) {
        // the limits in their order after the lateral limits: upper first (ICAO column "Upper limit / Lower limit"), unless written GND - 5000 FT
        var afterGeo = coords(t).reduce(function (a, c) { return Math.max(a, c.i + c.n); }, 0), tail = t.slice(afterGeo);
        LIM_RE.lastIndex = 0;
        while ((m = LIM_RE.exec(tail))) { var L = limit(m[0]); if (L && !/RADIUS/.test(tail.slice(Math.max(0, m.index - 12), m.index + m[0].length + 8))) lims.push(L); }
        if (lims.length >= 2) {
          if (lims[0].gnd || (lims[0].m < lims[1].m && /\s-\s|\bTO\b/.test(tail))) { lower = lower || lims[0]; upper = upper || lims[1]; } else { upper = upper || lims[0]; lower = lower || lims[1]; }
        } else if (lims.length === 1) { upper = upper || lims[0]; }
      }
      if (!sh) problems.push('lateral limits not read');
      if (!upper) problems.push('upper limit not read');
      var name = e.first.replace(/\s*(\d{4,6}(\.\d+)?\s?[NS]).*$/, '').replace(/[,;:\s]+$/, '').trim();
      var hours = (/\b(H24|HJ|HN|HX|HO|NOTAM|SR\s?-\s?SS|(?:MON|TUE|WED|THU|FRI|SAT|SUN)[^\n]{0,40}\d{4}\s?-\s?\d{4})\b/.exec(t) || [''])[0];
      return { desig: e.desig, key: key(e.desig), type: typeOfDesig(e.desig), name: name, ring: sh ? sh.ring : null, circle: sh && sh.circle ? sh.circle : null, upper: upper, lower: lower, hours: hours,
        text: e.text.trim(), problems: problems };
    });
  }

  /* ------------------------------------------------------------ writers */
  function csvCell(v) { var t = v === undefined || v === null ? '' : String(v); return /[",\n;]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; }
  function iso(ms) { return ms === null || ms === undefined || ms === Infinity ? '' : new Date(ms).toISOString().slice(0, 16).replace('T', ' '); }
  // the obstacles of NOTAMs as a table the obstacle reader (OBSTAB) loads; heights in metres
  function obstaclesCsv(notams) {
    var rows = [['Identifier', 'Name', 'Type', 'Latitude', 'Longitude', 'Elevation (m)', 'Height (m)', 'Lighting', 'Marking', 'Valid from', 'Valid to', 'Radius (NM)', 'Remarks']];
    notams.forEach(function (n) {
      n.obstacles.forEach(function (o, k) {
        rows.push([n.id + (n.obstacles.length > 1 ? '#' + (k + 1) : ''), 'NOTAM ' + n.id + (n.locs[0] ? ' ' + n.locs[0] : ''), o.type || 'OBSTACLE', o.c[1].toFixed(7), o.c[0].toFixed(7),
          o.elev !== null ? o.elev.toFixed(1) : '', o.hgt !== null ? o.hgt.toFixed(1) : '', o.lightsUs ? 'LIGHTS U/S' : o.lit, o.marked, iso(n.from), n.to === Infinity ? 'PERM' : iso(n.to),
          o.radiusNM !== null ? o.radiusNM.toFixed(2) : '', (n.code ? n.code + ' ' : '') + (o.approx ? '(position: centre of the NOTAM circle) ' : '') + n.text.replace(/\s+/g, ' ').slice(0, 600)]);
      });
    });
    return rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n') + '\r\n';
  }
  function xe(t) { return String(t === undefined || t === null ? '' : t).replace(/[<>&"']/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]; }); }
  function uuid(seed) { // a stable UUID-shaped identifier from a text (FNV-1a over 4 lanes)
    var h = [0x811c9dc5, 0x01000193, 0x6b43a9b5, 0x9e3779b9];
    for (var i = 0; i < seed.length; i++) for (var k = 0; k < 4; k++) h[k] = Math.imul(h[k] ^ (seed.charCodeAt(i) + k * 31), 16777619) >>> 0;
    var x = h.map(function (v) { return ('0000000' + v.toString(16)).slice(-8); }).join('');
    return x.slice(0, 8) + '-' + x.slice(8, 12) + '-4' + x.slice(13, 16) + '-a' + x.slice(17, 20) + '-' + x.slice(20, 32);
  }
  function limXml(tag, L) {
    if (!L) return '';
    if (L.unl) return '<aixm:' + tag + 'Limit uom="OTHER">UNL</aixm:' + tag + 'Limit><aixm:' + tag + 'LimitReference>STD</aixm:' + tag + 'LimitReference>';
    if (L.gnd) return '<aixm:' + tag + 'Limit uom="OTHER">GND</aixm:' + tag + 'Limit><aixm:' + tag + 'LimitReference>SFC</aixm:' + tag + 'LimitReference>';
    if (L.fl !== undefined) return '<aixm:' + tag + 'Limit uom="FL">' + L.fl + '</aixm:' + tag + 'Limit><aixm:' + tag + 'LimitReference>STD</aixm:' + tag + 'LimitReference>';
    var v = L.v !== undefined ? L.v : Math.round(L.m / FT), u = L.u || 'FT';
    return '<aixm:' + tag + 'Limit uom="' + u + '">' + v + '</aixm:' + tag + 'Limit><aixm:' + tag + 'LimitReference>' + (L.ref === 'SFC' ? 'SFC' : L.ref === 'STD' ? 'STD' : 'MSL') + '</aixm:' + tag + 'LimitReference>';
  }
  var AIXM_TYPE = { P: 'P', R: 'R', D: 'D', W: 'W', A: 'A', TSA: 'TSA', TRA: 'TRA', CBA: 'CBA', MOA: 'MOA', D_OTHER: 'D_OTHER' };
  // areas [{desig, type, name, ring, upper, lower, hours, from, to, note}] -> AIXM 5.1 message (EPSG:4326, latitude first)
  function areasAixm(list, meta) {
    meta = meta || {};
    var now = new Date().toISOString().replace(/\.\d+Z$/, 'Z'), out = ['<?xml version="1.0" encoding="UTF-8"?>',
      '<message:AIXMBasicMessage xmlns:message="http://www.aixm.aero/schema/5.1/message" xmlns:aixm="http://www.aixm.aero/schema/5.1" xmlns:gml="http://www.opengis.net/gml/3.2" xmlns:xlink="http://www.w3.org/1999/xlink" gml:id="M1">',
      '<!-- ' + xe(meta.source || 'areas read from text') + ' · written ' + now + ' by the AIXM Code Converter · NOT FOR NAVIGATION -->'];
    list.forEach(function (a, i) {
      if (!a.ring || a.ring.length < 4) return;
      var id = uuid((meta.source || '') + '|' + a.desig + '|' + i), b = a.from !== undefined && a.from !== null ? new Date(a.from).toISOString().replace(/\.\d+Z$/, 'Z') : meta.from || now;
      var e = a.to !== undefined && a.to !== null && a.to !== Infinity ? '<gml:endPosition>' + new Date(a.to).toISOString().replace(/\.\d+Z$/, 'Z') + '</gml:endPosition>' : '<gml:endPosition indeterminatePosition="unknown"/>';
      var pos = a.ring.map(function (p) { return p[1].toFixed(7) + ' ' + p[0].toFixed(7); }).join(' ');
      var note = [a.hours ? 'Hours: ' + a.hours : '', a.note || '', meta.source ? 'Source: ' + meta.source : ''].filter(Boolean).join(' · ');
      out.push('<message:hasMember><aixm:Airspace gml:id="AS' + (i + 1) + '"><gml:identifier codeSpace="urn:uuid:">' + id + '</gml:identifier><aixm:timeSlice><aixm:AirspaceTimeSlice gml:id="AS' + (i + 1) + 'T">' +
        '<gml:validTime><gml:TimePeriod gml:id="AS' + (i + 1) + 'P"><gml:beginPosition>' + b + '</gml:beginPosition>' + e + '</gml:TimePeriod></gml:validTime>' +
        '<aixm:interpretation>BASELINE</aixm:interpretation><aixm:sequenceNumber>1</aixm:sequenceNumber><aixm:correctionNumber>0</aixm:correctionNumber>' +
        '<aixm:type>' + (AIXM_TYPE[a.type] || 'OTHER:' + xe(String(a.type).replace(/[^A-Z0-9_]/g, '_'))) + '</aixm:type><aixm:designator>' + xe(a.desig) + '</aixm:designator>' + (a.name ? '<aixm:name>' + xe(a.name) + '</aixm:name>' : '') +
        '<aixm:geometryComponent><aixm:AirspaceGeometryComponent gml:id="AS' + (i + 1) + 'G"><aixm:operation>BASE</aixm:operation><aixm:theAirspaceVolume><aixm:AirspaceVolume gml:id="AS' + (i + 1) + 'V">' +
        limXml('upper', a.upper) + limXml('lower', a.lower) +
        '<aixm:horizontalProjection><aixm:Surface gml:id="AS' + (i + 1) + 'S" srsName="urn:ogc:def:crs:EPSG::4326"><gml:patches><gml:PolygonPatch><gml:exterior><gml:LinearRing><gml:posList>' + pos + '</gml:posList></gml:LinearRing></gml:exterior></gml:PolygonPatch></gml:patches></aixm:Surface></aixm:horizontalProjection>' +
        '</aixm:AirspaceVolume></aixm:theAirspaceVolume></aixm:AirspaceGeometryComponent></aixm:geometryComponent>' +
        (note ? '<aixm:annotation><aixm:Note gml:id="AS' + (i + 1) + 'N"><aixm:purpose>REMARK</aixm:purpose><aixm:translatedNote><aixm:LinguisticNote gml:id="AS' + (i + 1) + 'L"><aixm:note>' + xe(note) + '</aixm:note></aixm:LinguisticNote></aixm:translatedNote></aixm:Note></aixm:annotation>' : '') +
        '</aixm:AirspaceTimeSlice></aixm:timeSlice></aixm:Airspace></message:hasMember>');
    });
    out.push('</message:AIXMBasicMessage>');
    return out.join('\n');
  }
  // the areas drawn by NOTAMs (circles and polygons of restriction / warning NOTAMs) as areas for areasAixm
  function notamAreas(notams) {
    return notams.filter(function (n) { return n.area && n.area.ring && n.type !== 'C'; }).map(function (n) {
      var t = n.subj === 'RP' ? 'P' : n.subj === 'RD' ? 'D' : n.subj === 'RR' || n.subj === 'RT' ? 'R' : n.subj === 'RA' ? 'TRA' : n.subj === 'RM' ? 'MOA' : n.cat === 'warning' ? 'W' : 'D_OTHER';
      return { desig: 'NOTAM ' + n.id, type: t, name: (n.subjTxt || 'NOTAM area') + (n.condTxt ? ' — ' + n.condTxt : ''), ring: n.area.ring, upper: n.upper, lower: n.lower, from: n.from, to: n.to,
        hours: n.sched, note: n.code + ' ' + n.text.replace(/\s+/g, ' ').slice(0, 400) };
    });
  }

  var API = { parse: parse, parseOne: parseOne, split: split, decode: decode, coords: coords, limit: limit, heights: heights, designators: designators, key: key, shapeIn: shapeIn,
    runwayIn: runwayIn, schedule: schedule, stateAt: stateAt, areas: areas, obstaclesCsv: obstaclesCsv, areasAixm: areasAixm, notamAreas: notamAreas, circle: circle, arc: arc, t10: t10,
    SUBJ: SUBJ, COND: COND, CAT_NAME: CAT_NAME, category: category };
  return API;
})();
if (typeof module !== 'undefined') module.exports = NOTAMTXT;
