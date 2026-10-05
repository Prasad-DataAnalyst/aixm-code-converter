/*!
 * AIXM Code Converter
 * Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com> - author of the AIXM Code Converter
 * SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE; keep this notice in all copies)
 * ==========================================================================
 * AIXM Code Converter - ICAO AIP (specimen) section builders
 * Each builder returns a section {id, title, blocks[], recs[]} where blocks are
 *   {kind:'kv', rows:[{no,label,cells:[cell]}]}
 *   {kind:'table', title, cols:[..], rows:[[cell..]..]}
 *   {kind:'note', text}
 * and cell = {t: text, r: sourceRecord, p: propertyName, tip}.
 * The same structure feeds the screen, PDF, Excel, JSON and e-mail outputs.
 * ========================================================================== */
/* global AX, MODEL, PROFILE */
var AIP = (function () {
  'use strict';
  var M = MODEL, s = M.s, arr = AX.arr;

  /* ---------------------------------------------------------------- cells */
  function C(t, r, p, tip) { return { t: t === undefined || t === null ? '' : String(t), r: r || null, p: p || null, tip: tip || '' }; }
  // first of the properties that the feature really has (the AIXM code viewer highlights that element)
  function has(r, props) { var q = r && r.cur && r.cur.p; for (var i = 0; q && i < props.length; i++) if (q[props[i]] !== undefined && q[props[i]] !== null) return props[i]; return props[0]; }
  function codeCell(r, prop, obj, objType) {
    var v = s((obj || r.cur.p)[prop]);
    return C(v, r, prop, M.codeDef(r.k, prop, v, objType));
  }
  function kv(rows) { return { kind: 'kv', rows: rows.filter(Boolean) }; }
  function row(no, label, cells) { return { no: no, label: label, cells: arr(cells).filter(Boolean) }; }
  function table(title, cols, rows, note) { return { kind: 'table', title: title, cols: cols, rows: rows, note: note }; }
  function note(text) { return { kind: 'note', text: text }; }
  function join(parts, sep) { return parts.filter(function (x) { return x !== undefined && x !== null && x !== ''; }).join(sep || ' '); }
  function uniq(a) { return a.filter(function (x, i) { return x && a.indexOf(x) === i; }); }
  function byLabel(ds) { return function (a, b) { var x = M.label(ds, a), y = M.label(ds, b); return x < y ? -1 : x > y ? 1 : 0; }; }

  /* -------------------------------------------------------------- helpers */
  function owned(ds, ad, kinds) {
    var list = ds.owned.get(ad) || [];
    if (!kinds) return list;
    return list.filter(function (r) { return kinds.indexOf(r.k) >= 0; });
  }
  function refsFrom(ds, r, prop) { return r.refs.filter(function (x) { return !prop || x[0] === prop; }).map(function (x) { return x[1]; }); }
  function refsTo(ds, r, kinds, prop) {
    return (ds.rev.get(r) || []).filter(function (x) { return (!kinds || kinds.indexOf(x[1].k) >= 0) && (!prop || x[0] === prop); }).map(function (x) { return x[1]; })
      .filter(function (x, i, a) { return a.indexOf(x) === i; });
  }
  function pcn(sc) {
    sc = arr(sc)[0];
    if (!sc || sc.nil !== undefined) return '';
    if (sc._strength) return sc._strength;
    var c = s(sc.classPCN);
    if (!c) return s(sc.classLCN) ? 'LCN ' + s(sc.classLCN) : '';
    var t = { RIGID: 'R', FLEXIBLE: 'F' }[s(sc.pavementTypePCN)] || s(sc.pavementTypePCN);
    var e = { TECH: 'T', ACFT: 'U', USAGE: 'U' }[s(sc.evaluationMethodPCN)] || s(sc.evaluationMethodPCN);
    return 'PCN ' + [c, t, s(sc.pavementSubgradePCN), s(sc.maxTyrePressurePCN), e].filter(Boolean).join('/');
  }
  var SURF = { ASPH: 'Asphalt', CONC: 'Concrete', GRASS: 'Grass', GRAVEL: 'Gravel', SAND: 'Sand', WATER: 'Water', BITUM: 'Bitumen', BRICK: 'Brick',
    MACADAM: 'Macadam', STONE: 'Stone', CORAL: 'Coral', CLAY: 'Clay', LATERITE: 'Laterite', MEMBRANE: 'Membrane', METAL: 'Metal', SNOW: 'Snow', ICE: 'Ice',
    SOIL: 'Soil', MATS: 'Mats', WOOD: 'Wood', CONC_ASPH: 'Concrete/asphalt', CONC_GRS: 'Concrete/grass', ASPH_GRASS: 'Asphalt/grass' };
  function surface(sc) {
    sc = arr(sc)[0];
    if (!sc || sc.nil !== undefined) return '';
    var comp = s(sc.composition);
    return join([SURF[comp] || (comp ? comp.replace(/^OTHER:/, '').replace(/_/g, ' ') : ''), s(sc.preparation) ? '(' + s(sc.preparation) + ')' : ''], ' ');
  }
  // magnetic variation as published: at most 2 decimals, E/W
  function magVar(v) { var x = Math.abs(+v); return (isNaN(x) ? v : String(+x.toFixed(2))) + '°' + (+v < 0 ? 'W' : 'E'); }
  function strengthSurface(sc) { return join([pcn(sc), surface(sc)], '\n'); }
  // ACR/PCR (ICAO, from 28 NOV 2024) has no AIXM 5.1 property: many States give it in a remark
  function pcrFromNotes(notes) {
    var m = /\bPCR\s*\d+\s*\/\s*[RF]\s*\/\s*[A-D]\s*\/\s*[W-Z]\s*\/\s*[TU]\b/.exec(notes.join(' '));
    return m ? m[0].replace(/\s+/g, ' ') + ' (from remark)' : '';
  }
  function dims(len, wid) { var a = M.fq(len), b = M.fq(wid); if (!a && !b) return ''; return (a || '—') + ' x ' + (b || '—'); }
  function allNotes(r, filter) { return M.notesOf(r.cur.p, filter); }
  function noteCell(r, filter) { var n = allNotes(r, filter); return n.length ? C(n.join('\n'), r, 'annotation') : null; }
  function sched(r, prop) { return M.fSchedule(r.cur.p[prop || 'availability']); }
  function hours45(h) {
    var out = [];
    arr(h).forEach(function (t) {
      if (!t || typeof t !== 'object') return;
      var w = t.codeWorkHr || '';
      var sh = arr(t.Timsh).map(function (x) {
        return join([x.codeDay + (x.codeDayTil && x.codeDayTil !== x.codeDay ? '-' + x.codeDayTil : ''), (x.timeWef || x.codeEventWef || '') + '-' + (x.timeTil || x.codeEventTil || ''),
          x.dateValidWef ? x.dateValidWef + '-' + (x.dateValidTil || '') : ''], ' ');
      });
      out.push(join([w === 'TIMSH' ? '' : w, sh.join(', '), t.txtRmkWorkHr], ' '));
    });
    return out.join('; ');
  }
  function hoursOf(r) { var h = sched(r); if (!h && r.cur.p._hours) h = hours45(r.cur.p._hours); return h; }
  function svcType(r) { return s(r.cur.p.type); }
  function pointInRing(pt, ring) {
    var x = pt[0], y = pt[1], inside = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if (typeof xi !== 'number' || typeof xj !== 'number') continue;
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }
  function geoContains(g, pt) {
    if (!g || !pt) return false;
    if (g.t === 'A') return pointInRing(pt, g.c[0]);
    if (g.t === 'M') return g.parts.some(function (x) { return geoContains(x, pt); });
    return false;
  }

  /* ------------------------------------------------------ lateral limits */
  function lateral(ds, as) {
    var g = M.geometry(ds, as);
    if (!g) return '';
    var comps = g.t === 'M' ? g.parts : [g];
    return comps.map(function (c) { return lateralOf(c); }).filter(Boolean).join('\n\n');
  }
  function lateralOf(g) {
    if (!g || g.t !== 'A') return '';
    var parts = g.d || [];
    var circle = parts.filter(function (x) { return x.k === 'circle'; })[0];
    if (circle && parts.length === 1) return 'A circle, radius ' + circle.r + ' ' + (M.UOM[circle.u] || circle.u) + ' centred on ' + AX.fmtPos(circle.c, 0);
    var out = [], last = null;
    function pt(p) { var t = AX.fmtPos(p, 0); if (t !== last) { out.push(t); last = t; } }
    if (!parts.length || !parts.some(function (x) { return x.p || x.k === 'arc'; })) {
      var ring = g.c[0].filter(function (p) { return typeof p[0] === 'number'; });
      var step = ring.length > 60 ? Math.ceil(ring.length / 60) : 1;
      for (var i = 0; i < ring.length; i += step) pt(ring[i]);
      pt(ring[ring.length - 1]);
      return out.join(' - ') + (step > 1 ? ' (simplified)' : '');
    }
    parts.forEach(function (x) {
      if (x.p) x.p.forEach(pt);
      else if (x.k === 'arc') { out.push('then ' + (x.cw ? 'clockwise' : 'anticlockwise') + ' along the arc of a circle radius ' + x.r + ' ' + (M.UOM[x.u] || x.u) + ' centred on ' + AX.fmtPos(x.c, 0) + ' to'); last = null; }
      else if (x.k === 'circle') { out.push('a circle, radius ' + x.r + ' ' + (M.UOM[x.u] || x.u) + ' centred on ' + AX.fmtPos(x.c, 0)); last = null; }
      else if (x.k === 'border') { out.push('then along the border to'); last = null; }
      else if (x.k === 'ref') { out.push('then along the referenced border line (' + x.h + ') to'); last = null; }
    });
    return out.join(' - ').replace(/ to - /g, ' to ');
  }
  function vertical(ds, as) {
    var out = [];
    arr(as.cur.p.geometryComponent).forEach(function (gc) {
      var v = gc && gc.theAirspaceVolume;
      if (!v || v.nil !== undefined) return;
      var up = M.fLimit(v.upperLimit, v.upperLimitReference), lo = M.fLimit(v.lowerLimit, v.lowerLimitReference);
      if (up || lo) out.push((up || '—') + ' / ' + (lo || '—'));
      var mx = M.fLimit(v.maximumLimit, v.maximumLimitReference), mn = M.fLimit(v.minimumLimit, v.minimumLimitReference);
      if (mx || mn) out.push('(max ' + (mx || '—') + ', min ' + (mn || '—') + ')');
    });
    return uniq(out).join('\n');
  }
  function airspaceClass(as) {
    return uniq(arr(as.cur.p['class']).map(function (c) {
      if (!c || c.nil !== undefined) return '';
      var lv = arr(c.associatedLevels).map(function (l) { return l && l.nil === undefined ? join([M.fLimit(l.upperLimit, l.upperLimitReference), M.fLimit(l.lowerLimit, l.lowerLimitReference)], ' / ') : ''; }).filter(function (x) { return x && x !== 'CEILING / FLOOR'; });
      return s(c.classification) + (lv.length ? ' (' + lv.join('; ') + ')' : '');
    })).join('\n');
  }
  function activation(as) {
    var out = [];
    arr(as.cur.p.activation).forEach(function (a) {
      if (!a || a.nil !== undefined) return;
      var t = arr(a.timeInterval).map(M.fTimesheet).filter(Boolean).join(', ');
      out.push(join([s(a.activity), s(a.status), t, M.notesOf(a).join(' ')], ' '));
    });
    if (!out.length && as.cur.p._hours) out.push(hours45(as.cur.p._hours));
    return uniq(out).join('\n');
  }
  function servicesFor(ds, r, prop) { // services referencing r (e.g. clientAirspace / clientAirport)
    return refsTo(ds, r, null, prop).filter(function (x) { return M.SERVICE[x.k]; });
  }
  function callSigns(ds, svcs) {
    return uniq(svcs.map(function (v) {
      var cs = arr(v.cur.p['call-sign']).map(function (c) { return c && c.nil === undefined ? join([s(c.callSign), s(c.language) ? '(' + s(c.language) + ')' : ''], ' ') : ''; }).filter(Boolean);
      return cs.join(', ');
    })).join('\n');
  }
  function channelsOf(ds, svc) {
    var list = refsFrom(ds, svc, 'radioCommunication').filter(function (x) { return x.k === 'RadioCommunicationChannel'; });
    refsTo(ds, svc, ['RadioCommunicationChannel'], '_service').forEach(function (x) { if (list.indexOf(x) < 0) list.push(x); });
    return list;
  }

  /* ================================================================= AD 2 */
  var AD2_TITLES = {
    1: 'AERODROME LOCATION INDICATOR AND NAME', 2: 'AERODROME GEOGRAPHICAL AND ADMINISTRATIVE DATA', 3: 'OPERATIONAL HOURS',
    4: 'HANDLING SERVICES AND FACILITIES', 5: 'PASSENGER FACILITIES', 6: 'RESCUE AND FIREFIGHTING SERVICES', 7: 'SEASONAL AVAILABILITY – CLEARING',
    8: 'APRONS, TAXIWAYS AND CHECK LOCATIONS/POSITIONS DATA', 9: 'SURFACE MOVEMENT GUIDANCE AND CONTROL SYSTEM AND MARKINGS', 10: 'AERODROME OBSTACLES',
    11: 'METEOROLOGICAL INFORMATION PROVIDED', 12: 'RUNWAY PHYSICAL CHARACTERISTICS', 13: 'DECLARED DISTANCES', 14: 'APPROACH AND RUNWAY LIGHTING',
    15: 'OTHER LIGHTING, SECONDARY POWER SUPPLY', 16: 'HELICOPTER LANDING AREA', 17: 'AIR TRAFFIC SERVICES AIRSPACE', 18: 'AIR TRAFFIC SERVICES COMMUNICATION FACILITIES',
    19: 'RADIO NAVIGATION AND LANDING AIDS', 20: 'LOCAL AERODROME REGULATIONS', 21: 'NOISE ABATEMENT PROCEDURES', 22: 'FLIGHT PROCEDURES',
    23: 'ADDITIONAL INFORMATION', 24: 'CHARTS RELATED TO AN AERODROME'
  };
  // AD 3 (heliports) numbering -> AD 2 builder
  var AD3_MAP = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, 11: 11, 12: 16, 13: 13, 14: 14, 15: 15, 16: 17, 17: 18, 18: 19, 19: 20, 20: 21, 21: 22, 22: 23, 23: 24 };
  var AD3_TITLES = { 12: 'HELIPORT DATA', 13: 'DECLARED DISTANCES', 14: 'APPROACH AND FATO LIGHTING', 16: 'AIR TRAFFIC SERVICES AIRSPACE',
    17: 'AIR TRAFFIC SERVICES COMMUNICATION FACILITIES', 18: 'RADIO NAVIGATION AND LANDING AIDS', 19: 'LOCAL HELIPORT REGULATIONS', 20: 'NOISE ABATEMENT PROCEDURES',
    21: 'FLIGHT PROCEDURES', 22: 'ADDITIONAL INFORMATION', 23: 'CHARTS RELATED TO A HELIPORT' };

  function isHeliport(ad) { return s(ad.cur.p.type) === 'HP'; }
  function adCode(ad) { return M.shortName(ad); }

  function directions(ds, ad) {
    var rwys = owned(ds, ad, ['Runway']).sort(byLabel(ds));
    var out = [];
    rwys.forEach(function (rw) {
      refsTo(ds, rw, ['RunwayDirection'], 'usedRunway').sort(byLabel(ds)).forEach(function (d) { out.push({ rwy: rw, dir: d }); });
    });
    // directions without a runway link
    owned(ds, ad, ['RunwayDirection']).forEach(function (d) { if (!out.some(function (x) { return x.dir === d; })) out.push({ rwy: null, dir: d }); });
    return out;
  }
  function rcps(ds, dir) {
    var list = refsTo(ds, dir, ['RunwayCentrelinePoint'], 'onRunway');
    return list;
  }
  function thrPoint(ds, dir) {
    var list = rcps(ds, dir);
    return list.filter(function (x) { return s(x.cur.p.role) === 'THR'; })[0] || list.filter(function (x) { return s(x.cur.p.role) === 'DISTHR'; })[0] || null;
  }
  function declared(ds, dir) {
    var out = {};
    rcps(ds, dir).forEach(function (c) {
      arr(c.cur.p.associatedDeclaredDistance).forEach(function (dd) {
        if (!dd || dd.nil !== undefined) return;
        var t = s(dd.type), v = arr(dd.declaredValue)[0];
        var dist = v && v.nil === undefined ? M.fq(v.distance) : '';
        if (t && dist && !out[t]) out[t] = { t: dist, r: c };
      });
    });
    return out;
  }
  function lights(ds, dir, kinds, prop) { return refsTo(ds, dir, kinds, prop); }

  var AD2 = {};
  AD2[1] = function (ds, ad) {
    var p = ad.cur.p;
    return [kv([row('', 'Aerodrome location indicator — name', [C(join([s(p.locationIndicatorICAO) || s(p.designator), s(p.name)], ' — '), ad, 'name')])])];
  };
  AD2[2] = function (ds, ad) {
    var p = ad.cur.p, used = new Set();
    function n(props) { return M.notesOf(p, props, used); }
    var orgs = refsFrom(ds, ad, 'responsibleOrganisation');
    var operator = orgs.map(function (o) { return uniq(join([M.label(ds, o), M.fContact(o.cur.p.contact)], '\n').split('\n')).join('\n'); }).join('\n\n');
    var traffic = [];
    arr(p.availability).forEach(function (a) {
      arr(a && a.usage).forEach(function (u) {
        if (!u || s(u.type) === 'FORBID') return;
        JSON.stringify(u.selection || {}, function (k, v) { if (k === 'rule' && typeof v === 'string') traffic.push(v); return v; });
      });
    });
    if (p._traffic) traffic.push(p._traffic);
    traffic = traffic.map(function (t) { return t === 'ALL' ? 'IFR/VFR' : t; });
    var adContact = M.fContact(p.contact), opLines = operator.split('\n');
    if (adContact && adContact.split('\n').every(function (l) { return opLines.indexOf(l) >= 0; })) adContact = '';
    var elev = M.fq(p.fieldElevation), temp = M.fq(p.referenceTemperature);
    var gu = p.ARP ? M.fq(arr(p.ARP)[0].geoidUndulation) : '';
    var mv = s(p.magneticVariation);
    var rows = [
      row('1', 'ARP coordinates and site at AD', [C(M.fPoint(p.ARP), ad, 'ARP'), C(n(['ARP', 'aRP']).join('\n'), ad, 'annotation')]),
      row('2', 'Direction and distance from (city)', [C(join(arr(p.servedCity).map(function (c) { return c && s(c.name); }), ', '), ad, 'servedCity'), C(n(['servedCity']).join('\n'), ad, 'annotation')]),
      row('3', 'Elevation / Reference temperature', [C(join([elev, temp ? '/ ' + temp : ''], ' '), ad, 'fieldElevation'), C(n(['fieldElevation', 'referenceTemperature']).join('\n'), ad, 'annotation')]),
      row('4', 'Geoid undulation at AD ELEV PSN', [C(gu, ad, 'ARP')]),
      row('5', 'MAG VAR / Annual change', [C(mv ? join([magVar(mv), s(p.dateMagneticVariation) ? '(' + s(p.dateMagneticVariation) + ')' : '',
        s(p.magneticVariationChange) ? '/ ' + s(p.magneticVariationChange) + '°' : ''], ' ') : '', ad, 'magneticVariation'), C(n(['magneticVariation']).join('\n'), ad, 'annotation')]),
      row('6', 'AD operator, address, telephone, telefax, e-mail, AFS, website', [C(operator, ad, 'responsibleOrganisation'), C(adContact, ad, 'contact'), C(n(['responsibleOrganisation']).join('\n'), ad, 'annotation')]),
      row('7', 'Types of traffic permitted (IFR/VFR)', [C(uniq(traffic).join('/'), ad, 'availability')]),
      row('8', 'Remarks', [C(n(null).join('\n'), ad, 'annotation')])
    ];
    var extra = [
      row('', 'ICAO location indicator / AD designator', [C(join([s(p.locationIndicatorICAO), s(p.designator) !== s(p.locationIndicatorICAO) ? s(p.designator) : ''], ' / '), ad, has(ad, ['locationIndicatorICAO', 'designator']))]),
      row('', 'IATA designator', [C(s(p.designatorIATA), ad, 'designatorIATA')]),
      row('', 'Aerodrome type', [codeCell(ad, 'type')]),
      row('', 'Control type (civil / military / joint)', [codeCell(ad, 'controlType')]),
      row('', 'Certified (ICAO) / certification date', [C(join([s(p.certifiedICAO), s(p.certificationDate), s(p.certificationExpirationDate) ? 'exp. ' + s(p.certificationExpirationDate) : ''], ' / '), ad, has(ad, ['certifiedICAO', 'certificationDate', 'certificationExpirationDate']))]),
      row('', 'Transition altitude', [C(M.fq(p.transitionAltitude), ad, 'transitionAltitude')]),
      row('', 'Field elevation accuracy', [C(M.fq(p.fieldElevationAccuracy), ad, 'fieldElevationAccuracy')])
    ].filter(function (r) { return r.cells.some(function (c) { return c.t; }); });
    var blocks = [kv(rows)];
    if (extra.length) blocks.push({ kind: 'kv', title: 'Additional AIXM data', rows: extra });
    return blocks;
  };
  AD2[3] = function (ds, ad) {
    var svc = owned(ds, ad).filter(function (r) { return M.SERVICE[r.k]; });
    function pick(kinds, types) {
      var l = svc.filter(function (r) { return kinds.indexOf(r.k) >= 0 && (!types || types.indexOf(svcType(r)) >= 0); });
      return l.map(function (r) { return C(join([types && l.length > 1 ? s(r.cur.p.name) + ':' : '', hoursOf(r) || '—', M.notesOf(r.cur.p, ['*']).join(' ')], ' '), r, 'availability'); });
    }
    var units = owned(ds, ad, ['Unit']);
    function unitHours(types) {
      return units.filter(function (u) { return types.indexOf(s(u.cur.p.type)) >= 0; }).map(function (u) { return C(join([s(u.cur.p.name) + ':', M.fSchedule(u.cur.p.availability) || '—'], ' '), u, 'availability'); });
    }
    var p = ad.cur.p;
    var ahs45 = owned(ds, ad, ['AircraftGroundService']).filter(function (r) { return r.s45; });
    var rows = [
      row('1', 'AD operator', [C(M.fSchedule(p.availability) || (p._hours ? hours45(p._hours) : ''), ad, 'availability')]),
      row('2', 'Customs and immigration', pick(['PassengerService'], ['CUST', 'IMMIG'])),
      row('3', 'Health and sanitation', pick(['PassengerService'], ['SAN', 'MEDIC'])),
      row('4', 'AIS briefing office', pick(['InformationService'], ['AIS', 'BRIEFING', 'NOTAM']).concat(unitHours(['AOF', 'NOF', 'BOF']))),
      row('5', 'ATS reporting office (ARO)', unitHours(['ARO'])),
      row('6', 'MET briefing office', pick(['InformationService'], ['METAR', 'TAF', 'SIGMET', 'VOLMET']).concat(unitHours(['MET', 'MWO', 'FCST']))),
      row('7', 'ATS', pick(['AirTrafficControlService', 'GroundTrafficControlService'])),
      row('8', 'Fuelling', pick(['AirportSuppliesService'])),
      row('9', 'Handling', pick(['AircraftGroundService'], ['HAND'])),
      row('10', 'Security', pick(['PassengerService'], ['SECUR'])),
      row('11', 'De-icing', pick(['AircraftGroundService'], ['DEICE'])),
      row('12', 'Remarks', ahs45.map(function (r) { return C(join([s(r.cur.p.type), hoursOf(r)], ': '), r, '_hours'); }))
    ];
    return [kv(rows)];
  };
  AD2[4] = function (ds, ad) {
    var ground = owned(ds, ad, ['AircraftGroundService']), sup = owned(ds, ad, ['AirportSuppliesService']);
    function g(type) { return ground.filter(function (r) { return svcType(r) === type || (r.s45 && s(r.cur.p._category) === type); }).map(function (r) { return C(join([s(r.cur.p.name), s(r.cur.p._facility), M.notesOf(r.cur.p).join(' ')], ' – ') || 'Available', r, 'type'); }); }
    var fuels = [], facilities = [];
    sup.forEach(function (r) {
      ['fuelSupply', 'oilSupply', 'nitrogenSupply', 'oxygenSupply'].forEach(function (k) {
        var cats = arr(r.cur.p[k]).map(function (x) { return x && (s(x.category) || s(x.type)); }).filter(Boolean);
        if (cats.length) fuels.push(C(k.replace('Supply', '').toUpperCase() + ': ' + cats.join(', '), r, k));
      });
      var nt = M.notesOf(r.cur.p);
      if (nt.length) facilities.push(C(nt.join('\n'), r, 'annotation'));
    });
    return [kv([
      row('1', 'Cargo-handling facilities', g('HAND')),
      row('2', 'Fuel/oil types', fuels),
      row('3', 'Fuelling facilities/capacity', facilities),
      row('4', 'De-icing facilities', g('DEICE')),
      row('5', 'Hangar space for visiting aircraft', g('HANGAR')),
      row('6', 'Repair facilities for visiting aircraft', g('REPAIR')),
      row('7', 'Remarks', ground.filter(function (r) { return ['HAND', 'DEICE', 'HANGAR', 'REPAIR', 'REMOVE'].indexOf(svcType(r)) < 0; }).map(function (r) { return C(join([svcType(r), s(r.cur.p.name), s(r.cur.p._facility)], ' – '), r, 'type'); }))
    ])];
  };
  AD2[5] = function (ds, ad) {
    var ps = owned(ds, ad, ['PassengerService']);
    function g(types) { return ps.filter(function (r) { return types.indexOf(svcType(r)) >= 0; }).map(function (r) { return C(join([s(r.cur.p.name), hoursOf(r), M.notesOf(r.cur.p).join(' ')], ' – ') || 'Available', r, 'type'); }); }
    return [kv([
      row('1', 'Hotels', g(['HOTEL'])), row('2', 'Restaurants', g(['REST'])), row('3', 'Transportation', g(['TRANSPORT'])),
      row('4', 'Medical facilities', g(['MEDIC'])), row('5', 'Bank and Post Office', g(['BANK', 'POST'])), row('6', 'Tourist Office', g(['INFO'])),
      row('7', 'Remarks', g(['VET']))
    ])];
  };
  AD2[6] = function (ds, ad) {
    var ff = owned(ds, ad, ['FireFightingService']), rm = owned(ds, ad, ['AircraftGroundService']).filter(function (r) { return svcType(r) === 'REMOVE'; });
    return [kv([
      row('1', 'AD category for firefighting', ff.map(function (r) { return C(join([s(r.cur.p.category) ? 'CAT ' + s(r.cur.p.category) : '', s(r.cur.p.standard) ? '(' + s(r.cur.p.standard) + ')' : ''], ' '), r, 'category', M.codeDef(r.k, 'category', s(r.cur.p.category))); })),
      row('2', 'Rescue equipment', ff.map(function (r) { return C(M.notesOf(r.cur.p).join('\n'), r, 'annotation'); })),
      row('3', 'Capability for removal of disabled aircraft', rm.map(function (r) { return C(join([s(r.cur.p.name), M.notesOf(r.cur.p).join(' ')], ' – ') || 'Available', r, 'type'); })),
      row('4', 'Remarks', ff.map(function (r) { return C(hoursOf(r), r, 'availability'); }))
    ])];
  };
  AD2[7] = function (ds, ad) {
    var cl = owned(ds, ad, ['AirportClearanceService']);
    return [kv([
      row('1', 'Types of clearing equipment', cl.map(function (r) { return C(s(r.cur.p.clearingEquipment), r, 'clearingEquipment'); })),
      row('2', 'Clearance priorities', cl.map(function (r) { return C(s(r.cur.p.snowPlan), r, 'snowPlan'); })),
      row('3', 'Remarks', cl.map(function (r) { return C(join([hoursOf(r), M.notesOf(r.cur.p).join(' ')], ' '), r, 'annotation'); }).concat(ad.cur.p.annotation ? [C(M.notesOf(ad.cur.p, ['aerodromeClearing']).join(' '), ad, 'annotation')] : []))
    ])];
  };
  AD2[8] = function (ds, ad) {
    var aprons = owned(ds, ad, ['Apron']).sort(byLabel(ds)), twys = owned(ds, ad, ['Taxiway']).sort(byLabel(ds));
    var blocks = [];
    blocks.push(table('Aprons', ['Designation', 'Surface', 'Strength', 'Remarks'], aprons.map(function (r) {
      var p = r.cur.p;
      return [C(s(p.name) || s(p.designator), r, 'name'), C(surface(p.surfaceProperties), r, 'surfaceProperties'), C(pcn(p.surfaceProperties), r, 'surfaceProperties'), noteCell(r) || C('')];
    })));
    blocks.push(table('Taxiways', ['Designation', 'Width', 'Surface', 'Strength', 'Remarks'], twys.map(function (r) {
      var p = r.cur.p;
      return [C(s(p.designator), r, 'designator'), C(M.fq(p.width), r, 'width'), C(surface(p.surfaceProperties), r, 'surfaceProperties'), C(pcn(p.surfaceProperties), r, 'surfaceProperties'), noteCell(r) || C('')];
    })));
    var cps = owned(ds, ad, ['CheckpointVOR', 'CheckpointINS', 'AltimeterCheckpoint']);
    blocks.push(table('Check locations / positions', ['Type', 'Position', 'Elevation', 'Details'], cps.map(function (r) {
      var p = r.cur.p;
      return [C(r.k.replace('Checkpoint', '') + ' checkpoint', r, 'category'), C(M.fPoint(p.position || p.location), r, 'position'), C(M.fElev(p.position), r, 'position'),
        C(join([s(p.angle) ? 'BRG ' + s(p.angle) + '°' : '', M.fq(p.distance), refsFrom(ds, r, 'checkPointFacility').map(function (x) { return M.label(ds, x); }).join(', '), M.notesOf(p).join(' ')], ' '), r, 'annotation')];
    })));
    return blocks;
  };
  AD2[9] = function (ds, ad) {
    var blocks = [];
    var stands = owned(ds, ad, ['AircraftStand']).sort(byLabel(ds));
    blocks.push(table('Aircraft stands', ['Stand', 'Type', 'Visual docking guidance', 'Position', 'Remarks'], stands.map(function (r) {
      var p = r.cur.p;
      return [C(s(p.designator), r, 'designator'), codeCell(r, 'type'), codeCell(r, 'visualDockingSystem'), C(M.fPoint(p.location), r, 'location'), noteCell(r) || C('')];
    })));
    var gl = owned(ds, ad, ['GuidanceLine']);
    if (gl.length) {
      var types = {};
      gl.forEach(function (r) { var t = s(r.cur.p.type) || 'OTHER'; types[t] = (types[t] || 0) + 1; });
      blocks.push(kv([row('', 'Taxiway guide lines', [C(Object.keys(types).map(function (t) { return t + ': ' + types[t]; }).join(', ') + ' (' + gl.length + ' guidance lines)', gl[0], 'type')])]));
    }
    var mk = owned(ds, ad, ['RunwayMarking', 'TaxiwayMarking', 'ApronMarking', 'StandMarking', 'TaxiHoldingPositionMarking', 'TouchDownLiftOffMarking', 'GuidanceLineMarking', 'DeicingAreaMarking', 'AirportProtectionAreaMarking']);
    var mkSum = {};
    mk.forEach(function (r) { var k = r.k.replace('Marking', ' marking'); mkSum[k] = mkSum[k] || { n: 0, std: {}, cond: {}, r: r }; mkSum[k].n++; var st = s(r.cur.p.markingICAOStandard); if (st) mkSum[k].std[st] = 1; var cd = s(r.cur.p.condition); if (cd) mkSum[k].cond[cd] = 1; });
    blocks.push(table('Runway and taxiway markings and lighting', ['Element', 'Count', 'ICAO standard', 'Condition'], Object.keys(mkSum).map(function (k) {
      var m = mkSum[k];
      return [C(k, m.r), C(m.n), C(Object.keys(m.std).join(', ')), C(Object.keys(m.cond).join(', '))];
    }).concat(owned(ds, ad, ['TaxiwayLightSystem']).map(function (r) {
      return [C('Taxiway lighting ' + s(r.cur.p.position), r, 'position'), C(1), C(''), C(join([s(r.cur.p.colour), s(r.cur.p.intensityLevel)], ' '), r, 'colour')];
    }))));
    var thp = owned(ds, ad, ['TaxiHoldingPosition']);
    var thpl = owned(ds, ad, ['TaxiHoldingPositionLightSystem']);
    blocks.push(table('Stop bars and runway guard lights / holding positions', ['Holding position', 'Type', 'Category', 'Protected RWY', 'Lighting'], thp.map(function (r) {
      var l = refsTo(ds, r, ['TaxiHoldingPositionLightSystem']);
      return [C(M.label(ds, r), r), codeCell(r, 'type'), codeCell(r, 'landingCategory'), C(refsFrom(ds, r, 'protectedRunway').map(function (x) { return M.shortName(x); }).join(', '), r, 'protectedRunway'),
        C(l.map(function (x) { return join([s(x.cur.p.type), s(x.cur.p.colour)], ' '); }).join(', '), l[0] || r)];
    }), thpl.length ? thpl.length + ' taxi holding position light systems in the data set.' : ''));
    var hs = owned(ds, ad, ['AirportHotSpot']);
    if (hs.length) blocks.push(table('Hot spots', ['Designator', 'Instruction', 'Remarks'], hs.map(function (r) { return [C(s(r.cur.p.designator), r, 'designator'), C(s(r.cur.p.instruction), r, 'instruction'), noteCell(r) || C('')]; })));
    return blocks;
  };
  AD2[10] = function (ds, ad) {
    var areas = owned(ds, ad, ['ObstacleArea']);
    var obs = [], seen = new Set();
    areas.forEach(function (a) {
      refsFrom(ds, a, 'obstacle').forEach(function (o) { if (!seen.has(o)) { seen.add(o); obs.push({ o: o, area: s(a.cur.p.type) }); } });
    });
    owned(ds, ad, ['VerticalStructure']).forEach(function (o) { if (!seen.has(o)) { seen.add(o); obs.push({ o: o, area: '' }); } });
    var noteTxt = '';
    if (!obs.length) {
      var arp = M.pointOf(ds, ad);
      var all = ds.byType.VerticalStructure || [];
      if (arp && all.length) {
        all.forEach(function (o) { var pt = M.pointOf(ds, o); if (pt && AX.distNM(arp, pt) <= 10) obs.push({ o: o, area: 'within 10 NM', d: AX.distNM(arp, pt) }); });
        if (obs.length) noteTxt = 'The data set does not link obstacles to this aerodrome; obstacles within 10 NM of the ARP are listed.';
      }
    }
    var rows = obs.map(function (x) {
      var o = x.o, p = o.cur.p, part = arr(p.part)[0] || {};
      var loc = part.horizontalProjection_location || arr(part.horizontalProjection_linearExtent)[0] || arr(part.horizontalProjection_surfaceExtent)[0];
      var pos = loc && loc._geo ? (loc._geo.t === 'P' ? AX.fmtPos(loc._geo.c, 2) : (loc._geo.t === 'L' ? 'Line: ' : 'Area: ') + AX.fmtPos((loc._geo.t === 'A' ? loc._geo.c[0][0] : loc._geo.c[0]), 2) + ' …') : '';
      var elev = loc ? M.fq(loc.elevation) : '';
      var hgt = M.fq(part.verticalExtent);
      var marking = join([s(part.markingPattern), s(part.markingFirstColour), s(part.markingSecondColour)], ' ');
      var lit = s(p.lighted) === 'YES' ? 'Lighted' + (arr(part.lighting).length ? ' ' + arr(part.lighting).map(function (l) { return l && join([s(l.colour), s(l.type), l._descr], ' '); }).filter(Boolean).join(', ') : '') : s(p.lighted) === 'NO' ? 'Not lighted' : '';
      return [C(s(p.name) || s(p.designator) || s(part.designator), o, 'name'), C(s(p.type) || s(part.type), o, 'type', M.codeDef('VerticalStructure', 'type', s(p.type))), C(pos, o, 'part'),
        C(join([elev, hgt ? '/ ' + hgt : ''], ' '), o, 'part'), C(join([marking, lit], '\n'), o, 'lighted'), C(x.area, o), C(M.notesOf(p).join(' '), o, 'annotation')];
    });
    return [table('', ['Obstacle ID / designation', 'Obstacle type', 'Obstacle position', 'Elevation / Height', 'Marking / Lighting', 'Area', 'Remarks'], rows, noteTxt)];
  };
  AD2[11] = function (ds, ad) {
    var units = owned(ds, ad, ['Unit']).filter(function (u) { return ['MET', 'MWO', 'FCST', 'WAFC', 'VAAC'].indexOf(s(u.cur.p.type)) >= 0; });
    var info = owned(ds, ad, ['InformationService']).filter(function (r) { return ['METAR', 'TAF', 'SIGMET', 'VOLMET', 'ATIS', 'TWEB', 'ASOS', 'AWOS', 'LWIS'].indexOf(svcType(r)) >= 0; });
    var rvr = owned(ds, ad, ['RunwayVisualRange', 'RunwayVisualRangeEquipment', 'WeatherSource']);
    return [kv([
      row('1', 'Associated MET office', units.map(function (u) { return C(M.label(ds, u), u, 'name'); })),
      row('2', 'Hours of service / MET office outside hours', units.map(function (u) { return C(M.fSchedule(u.cur.p.availability), u, 'availability'); })),
      row('3', 'Office responsible for TAF preparation / periods of validity', info.filter(function (r) { return svcType(r) === 'TAF'; }).map(function (r) { return C(M.label(ds, r), r); })),
      row('4', 'Trend forecast / interval of issuance', []),
      row('5', 'Briefing/consultation provided', info.filter(function (r) { return svcType(r) === 'BRIEFING'; }).map(function (r) { return C(M.label(ds, r), r); })),
      row('6', 'Flight documentation / language(s) used', []),
      row('7', 'Charts and other information available for briefing or consultation', []),
      row('8', 'Supplementary equipment available for providing information', rvr.map(function (r) { return C(join([r.k.replace(/([a-z])([A-Z])/g, '$1 $2'), s(r.cur.p.readingPosition), M.fPoint(r.cur.p.location)], ' '), r); })),
      row('9', 'ATS units provided with information', info.map(function (r) { return C(join([svcType(r), s(r.cur.p.name)], ' '), r, 'type'); })),
      row('10', 'Additional information', units.map(function (u) { return C(M.notesOf(u.cur.p).join(' '), u, 'annotation'); }))
    ])];
  };
  AD2[12] = function (ds, ad) {
    var list = directions(ds, ad);
    var protect = owned(ds, ad, ['RunwayProtectArea']), arrest = owned(ds, ad, ['ArrestingGear']);
    var rows = list.map(function (x) {
      var d = x.dir, rw = x.rwy, dp = d.cur.p, rp = rw ? rw.cur.p : {};
      var pts = rcps(ds, d);
      var thr = thrPoint(ds, d), end = pts.filter(function (c) { return s(c.cur.p.role) === 'END'; })[0];
      var thrLoc = thr ? arr(thr.cur.p.location)[0] : dp._thr;
      var thrTxt = join([thrLoc ? M.fPoint(thrLoc) : '', end ? 'END ' + M.fPoint(end.cur.p.location) : '', thrLoc && M.fq(thrLoc.geoidUndulation) ? 'GUND ' + M.fq(thrLoc.geoidUndulation) : ''], '\n');
      var thrElev = join([thrLoc ? 'THR ' + M.fq(thrLoc.elevation) : '', M.fq(dp.elevationTDZ) ? 'TDZ ' + M.fq(dp.elevationTDZ) : ''], '\n');
      function pa(type) {
        return protect.filter(function (a) { return s(a.cur.p.type) === type && refsFrom(ds, a, 'protectedRunwayDirection').indexOf(d) >= 0; })
          .map(function (a) { return dims(a.cur.p.length, a.cur.p.width); }).join(', ');
      }
      var swy = pa('STOPWAY');
      var ag = arrest.filter(function (a) { return refsFrom(ds, a, 'runwayDirection').indexOf(d) >= 0; }).map(function (a) { return join([s(a.cur.p.engageDevice), s(a.cur.p.absorbType), M.fq(a.cur.p.location)], ' '); });
      var remarks = uniq([].concat(M.notesOf(dp), rw ? M.notesOf(rp) : []));
      return [
        C(M.shortName(d).replace(/^RWY /, ''), d, 'designator'),
        C(s(dp.trueBearing) ? s(dp.trueBearing) + '°' : '', d, 'trueBearing'),
        C(dims(rp.nominalLength, rp.nominalWidth), rw, 'nominalLength'),
        C(join([strengthSurface(rp.surfaceProperties), !pcn(rp.surfaceProperties) ? pcrFromNotes(rw ? M.notesOf(rp) : []) : '', swy ? 'SWY: ' + swy : ''], '\n'), rw, 'surfaceProperties'),
        C(thrTxt, thr || d, thr ? 'location' : '_thr'),
        C(thrElev, thr || d, thr ? 'location' : 'elevationTDZ'),
        C(s(dp.slopeTDZ) ? s(dp.slopeTDZ) + '%' : '', d, 'slopeTDZ'),
        C(swy),
        C(pa('CWY')),
        C(dims(rp.lengthStrip, rp.widthStrip), rw, 'lengthStrip'),
        C(pa('RESA')),
        C(ag.join('\n')),
        C(pa('OFZ') || pa('IOFZ')),
        C(remarks.join('\n'), M.notesOf(dp).length || !rw ? d : rw, 'annotation') // remarks of the direction, else of the runway
      ];
    });
    return [table('', ['Designations RWY NR', 'True BRG', 'Dimensions of RWY', 'Strength (PCN / PCR) and surface of RWY and SWY', 'THR coordinates / RWY end coordinates / THR geoid undulation',
      'THR elevation and highest elevation of TDZ', 'Slope of RWY/SWY', 'SWY dimensions', 'CWY dimensions', 'Strip dimensions', 'RESA dimensions',
      'Arresting system', 'OFZ', 'Remarks'], rows)];
  };
  AD2[13] = function (ds, ad) {
    var list = directions(ds, ad);
    var rows = list.map(function (x) {
      var dd = declared(ds, x.dir);
      function c(k) { return dd[k] ? C(dd[k].t, dd[k].r, 'associatedDeclaredDistance') : C(''); }
      var other = Object.keys(dd).filter(function (k) { return ['TORA', 'TODA', 'ASDA', 'LDA'].indexOf(k) < 0; }).map(function (k) { return k + ' ' + dd[k].t; });
      var inter = rcps(ds, x.dir).filter(function (r) { return ['START_RUN', 'START'].indexOf(s(r.cur.p.role)) >= 0 && s(r.cur.p.designator); }).map(function (r) { return s(r.cur.p.designator); });
      return [C(M.shortName(x.dir).replace(/^RWY /, ''), x.dir, 'designator'), c('TORA'), c('TODA'), c('ASDA'), c('LDA'), C(join([other.join(', '), inter.length ? 'Take-off positions: ' + inter.join(', ') : ''], '\n'))];
    });
    return [table('', ['RWY designator', 'TORA', 'TODA', 'ASDA', 'LDA', 'Remarks'], rows)];
  };
  AD2[14] = function (ds, ad) {
    var list = directions(ds, ad);
    var rows = list.map(function (x) {
      var d = x.dir;
      var als = lights(ds, d, ['ApproachLightingSystem']);
      var rls = lights(ds, d, ['RunwayDirectionLightSystem']);
      var vgsi = lights(ds, d, ['VisualGlideSlopeIndicator']);
      function pos(names) { return rls.filter(function (r) { return names.indexOf(s(r.cur.p.position)) >= 0; }); }
      function lsys(l) { return l.map(function (r) { var p = r.cur.p; return join([s(p.type), M.fq(p.length), M.fq(p.spacing) ? 'spacing ' + M.fq(p.spacing) : '', s(p.colour).replace(/^OTHER:/, ''), s(p.intensityLevel)], ' '); }).join('\n'); }
      function first(l, prop) { return l[0] ? { r: l[0], p: prop } : { r: d, p: null }; }
      var a1 = als.map(function (r) { var p = r.cur.p; return join([s(p.classICAO), s(p.type), M.fq(p.length), s(p.intensityLevel)], ' '); }).join('\n');
      var v1 = vgsi.map(function (r) { var p = r.cur.p; return join([s(p.type), s(p.position), s(p.slopeAngle) ? s(p.slopeAngle) + '°' : '', M.fq(p.minimumEyeHeightOverThreshold) ? 'MEHT ' + M.fq(p.minimumEyeHeightOverThreshold) : ''], ' '); });
      if (d.cur.p._vasis) { var vv = d.cur.p._vasis; v1.push(join([s(vv.type), s(vv.position), s(vv.slopeAngle) ? s(vv.slopeAngle) + '°' : '', M.fq(vv.minimumEyeHeightOverThreshold) ? 'MEHT ' + M.fq(vv.minimumEyeHeightOverThreshold) : '', vv._descr], ' ')); }
      var thr = pos(['THR', 'DTHR']), tdz = pos(['TDZ']), cl = pos(['CL']), edge = pos(['EDGE']), end = pos(['END']);
      var wbar = als.some(function (r) { return /WBAR/.test(s(r.cur.p.type)); }) ? ' WBAR' : '';
      var rem = uniq([].concat.apply([], rls.concat(als, vgsi).map(function (r) { return M.notesOf(r.cur.p); })));
      return [
        C(M.shortName(d).replace(/^RWY /, ''), d, 'designator'),
        C(a1, first(als, 'type').r, first(als, 'type').p),
        C(lsys(thr) + (thr.length ? wbar : ''), first(thr, 'colour').r, first(thr, 'colour').p),
        C(v1.join('\n'), vgsi[0] || d, vgsi[0] ? 'type' : '_vasis'),
        C(lsys(tdz), first(tdz, 'length').r, first(tdz, 'length').p),
        C(lsys(cl), first(cl, 'colour').r, first(cl, 'colour').p),
        C(lsys(edge), first(edge, 'colour').r, first(edge, 'colour').p),
        C(lsys(end) + (end.length ? wbar : ''), first(end, 'colour').r, first(end, 'colour').p),
        C(lsys(pos(['STOPWAY', 'SWY']))),
        C(rem.join('\n'))
      ];
    });
    return [table('', ['RWY designator', 'APCH LGT type, LEN, INTST', 'THR LGT colour, WBAR', 'VASIS (MEHT) / PAPI', 'TDZ LGT LEN', 'RWY centre line LGT', 'RWY edge LGT',
      'RWY end LGT colour, WBAR', 'SWY LGT', 'Remarks'], rows)];
  };
  AD2[15] = function (ds, ad) {
    var arp = M.pointOf(ds, ad);
    var agl = owned(ds, ad, ['AeronauticalGroundLight']);
    (ds.byType.AeronauticalGroundLight || []).forEach(function (r) {
      if (agl.indexOf(r) >= 0 || ds.owner.get(r)) return;
      var pt = M.pointOf(ds, r);
      if (arp && pt && AX.distNM(arp, pt) < 5 && /ABN|IBN|BCN/.test(s(r.cur.p.type))) agl.push(r);
    });
    var twl = owned(ds, ad, ['TaxiwayLightSystem']);
    var all = owned(ds, ad).filter(function (r) { return /LightSystem$/.test(r.k); });
    var emerg = all.filter(function (r) { return s(r.cur.p.emergencyLighting) === 'YES'; });
    var p = ad.cur.p;
    return [kv([
      row('1', 'ABN/IBN location, characteristics and hours of operation', agl.map(function (r) {
        var q = r.cur.p;
        return C(join([s(q.type), s(q.name), M.fPoint(q.location), s(q.colour), s(q.flashing) === 'YES' ? 'flashing' : '', M.notesOf(q).join(' ')], ' '), r, 'location');
      })),
      row('2', 'LDI location and LGT / anemometer location and LGT', [C(M.notesOf(p, ['landingDirectionIndicator', 'windDirectionIndicator']).join('\n'), ad, 'annotation')]),
      row('3', 'TWY edge and centre line lighting', twl.map(function (r) { return C(join([M.label(ds, refsFrom(ds, r, 'lightedTaxiway')[0] || r), s(r.cur.p.position), s(r.cur.p.colour)], ' '), r, 'position'); })),
      row('4', 'Secondary power supply / switch-over time', [C(join([emerg.length ? emerg.length + ' lighting systems with emergency lighting' : '', M.notesOf(p, ['secondaryPowerSupply']).join(' ')], '\n'), emerg[0] || ad, emerg[0] ? 'emergencyLighting' : 'annotation')]),
      row('5', 'Remarks', owned(ds, ad, ['PilotControlledLighting']).map(function (r) { return C(M.fv(ds, r.cur.p), r); }))
    ])];
  };
  AD2[16] = function (ds, ad) {
    var tlof = owned(ds, ad, ['TouchDownLiftOff']), fato = owned(ds, ad, ['Runway']).filter(function (r) { return s(r.cur.p.type) === 'FATO'; });
    var blocks = [];
    tlof.forEach(function (r) {
      var p = r.cur.p, loc = p.aimingPoint || p.location;
      var lts = refsTo(ds, r, ['TouchDownLiftOffLightSystem']);
      blocks.push({ kind: 'kv', title: M.label(ds, r), rows: [
        row('1', 'Coordinates TLOF or THR of FATO / geoid undulation', [C(join([M.fPoint(loc), loc && M.fq(arr(loc)[0].geoidUndulation) ? 'GUND ' + M.fq(arr(loc)[0].geoidUndulation) : ''], '\n'), r, p.aimingPoint ? 'aimingPoint' : 'location')]),
        row('2', 'TLOF and/or FATO elevation', [C(M.fElev(loc), r, p.aimingPoint ? 'aimingPoint' : 'location')]),
        row('3', 'TLOF and FATO area dimensions, surface, strength, marking', [C(join([dims(p.length, p.width), strengthSurface(p.surfaceProperties), s(p.slope) ? 'slope ' + s(p.slope) + '%' : '', s(p.helicopterClass) ? 'helicopter class ' + s(p.helicopterClass) : ''], '\n'), r, 'length')]),
        row('4', 'True BRG of FATO', []),
        row('5', 'Declared distance available', []),
        row('6', 'APP and FATO lighting', lts.map(function (l) { return C(join([s(l.cur.p.position), s(l.cur.p.colour), s(l.cur.p.intensityLevel)], ' '), l, 'colour'); })),
        row('7', 'Remarks', [noteCell(r)])
      ] });
    });
    fato.forEach(function (r) {
      var p = r.cur.p, dirs = refsTo(ds, r, ['RunwayDirection']);
      blocks.push({ kind: 'kv', title: 'FATO ' + s(p.designator), rows: [
        row('3', 'FATO dimensions, surface, strength', [C(join([dims(p.nominalLength, p.nominalWidth), strengthSurface(p.surfaceProperties)], '\n'), r, 'nominalLength')]),
        row('4', 'True BRG of FATO', dirs.map(function (d) { return C(M.shortName(d) + ': ' + s(d.cur.p.trueBearing) + '°', d, 'trueBearing'); })),
        row('7', 'Remarks', [noteCell(r)])
      ] });
    });
    if (!blocks.length) blocks.push(note('NIL'));
    return blocks;
  };
  function adAirspaces(ds, ad) {
    var set = new Set();
    owned(ds, ad).forEach(function (r) {
      if (!M.SERVICE[r.k]) return;
      refsFrom(ds, r, 'clientAirspace').forEach(function (a) { if (/^(CTR|CTR_P|ATZ|ATZ_P|HTZ|TIZ|TIA|RMZ|TMZ|MCTR|TMA|TMA_P)$/.test(s(a.cur.p.type))) set.add(a); });
    });
    var arp = M.pointOf(ds, ad);
    (ds.byType.Airspace || []).forEach(function (a) {
      if (set.has(a)) return;
      var t = s(a.cur.p.type);
      if (!/^(CTR|CTR_P|ATZ|ATZ_P|HTZ|TIZ|TIA|RMZ|TMZ|MCTR)$/.test(t)) return;
      if (arp && geoContains(M.geometry(ds, a), arp)) set.add(a);
    });
    return Array.from(set).sort(function (a, b) { var o = ['CTR', 'ATZ', 'HTZ', 'TMA', 'CTA']; return (o.indexOf(s(a.cur.p.type)) + 10) % 20 - (o.indexOf(s(b.cur.p.type)) + 10) % 20; });
  }
  AD2[17] = function (ds, ad) {
    var list = adAirspaces(ds, ad);
    if (!list.length) return [note('NIL')];
    return list.map(function (a) {
      var svcs = servicesFor(ds, a, 'clientAirspace');
      if (!svcs.length) svcs = owned(ds, ad).filter(function (r) { return r.k === 'AirTrafficControlService' && /TWR|APP/.test(svcType(r)); });
      return { kind: 'kv', title: M.label(ds, a), rows: [
        row('1', 'Designation and lateral limits', [C(join([s(a.cur.p.name) || s(a.cur.p.designator), lateral(ds, a)], '\n'), a, 'geometryComponent')]),
        row('2', 'Vertical limits', [C(vertical(ds, a), a, 'geometryComponent')]),
        row('3', 'Airspace classification', [C(airspaceClass(a), a, 'class')]),
        row('4', 'ATS unit call sign / language(s)', [C(callSigns(ds, svcs), svcs[0] || a, svcs[0] ? 'call-sign' : null)]),
        row('5', 'Transition altitude', [C(M.fq(ad.cur.p.transitionAltitude), ad, 'transitionAltitude')]),
        row('6', 'Hours of applicability', [C(activation(a), a, has(a, ['activation', 'annotation']))]),
        row('7', 'Remarks', [noteCell(a)])
      ] };
    });
  };
  AD2[18] = function (ds, ad) {
    var svcs = owned(ds, ad).filter(function (r) { return M.SERVICE[r.k] && ['AirTrafficControlService', 'InformationService', 'GroundTrafficControlService', 'SearchRescueService', 'AirTrafficManagementService'].indexOf(r.k) >= 0; });
    svcs = svcs.filter(function (r) { return channelsOf(ds, r).length || r.cur.p['call-sign']; });
    var rows = svcs.map(function (r) {
      var p = r.cur.p, ch = channelsOf(ds, r);
      var cs = arr(p['call-sign']).map(function (c) { return c && c.nil === undefined ? s(c.callSign) : ''; }).filter(Boolean);
      ch.forEach(function (c) { arr(c.cur.p._callsign).forEach(function (x) { if (x && x.txtCallSign) cs.push(x.txtCallSign); }); });
      return [C(svcType(r) || r.k.replace('Service', ''), r, 'type', M.codeDef(r.k, 'type', svcType(r))), C(uniq(cs).join('\n'), r, 'call-sign'),
        C(ch.map(M.fFreq).join('\n'), ch[0] || r, ch[0] ? (ch[0].cur.p.frequencyTransmission ? 'frequencyTransmission' : 'channel') : 'radioCommunication'),
        C(''), C(ch.map(function (c) { return s(c.cur.p.logon); }).filter(Boolean).join('\n')),
        C(hoursOf(r) || ch.map(function (c) { return M.fSchedule(c.cur.p.availability) || (c.cur.p._hours ? hours45(c.cur.p._hours) : ''); }).filter(Boolean).join('\n'), r, 'availability'),
        C(uniq([].concat(M.notesOf(p), [].concat.apply([], ch.map(function (c) { return M.notesOf(c.cur.p); })))).join('\n'), r, 'annotation')];
    });
    return [table('', ['Service designation', 'Call sign', 'Channel(s) / Frequency', 'SATVOICE number(s)', 'Logon address', 'Hours of operation', 'Remarks'], rows)];
  };
  function equipmentRows(ds, nav, extra) {
    var p = nav.cur.p, rows = [];
    var comps = arr(p.navaidEquipment).map(function (c) { return c && c.theNavaidEquipment ? M.target(ds, c.theNavaidEquipment) : null; }).filter(Boolean);
    var hours = hoursOf(nav);
    function eqRow(eq, typeTxt) {
      var q = eq.cur.p;
      var freq = M.fq(q.frequency) || (s(q.channel) ? 'CH ' + s(q.channel) : '');
      if (eq.k === 'DME' && s(q.channel)) freq = 'CH ' + s(q.channel);
      var mv = s(q.magneticVariation) || s(q.declination);
      var loc = arr(q.location)[0];
      return [C(join([typeTxt || eqType(eq), mv ? '(' + magVar(mv) + ')' : '', eq.k === 'Localizer' && s(p.signalPerformance) ? s(p.signalPerformance).replace(/_/g, ' ') : ''], ' '), eq, 'designator'),
        C(s(q.designator) || s(p.designator), eq, 'designator'), C(freq, eq, q.frequency ? 'frequency' : 'channel'), C(hoursOf(eq) || hours, eq, 'availability'),
        C(loc ? M.fPoint(loc) : '', eq, 'location'), C(eq.k === 'DME' ? M.fElev(loc) : '', eq, 'location'), C(''),
        C(uniq(M.notesOf(q).concat(extra || [])).join('\n'), eq, 'annotation')];
    }
    if (comps.length) comps.forEach(function (eq) { rows.push(eqRow(eq)); });
    else if (p._loc || p._gp) { // AIXM 4.5 ILS
      [['_loc', 'LOC'], ['_gp', 'GP']].forEach(function (x) {
        var o = p[x[0]];
        if (!o) return;
        var loc = arr(o.location)[0];
        rows.push([C(join([x[1], x[1] === 'LOC' && s(p.signalPerformance) ? 'CAT ' + s(p.signalPerformance) : ''], ' '), nav, x[0]), C(s(o.designator) || s(p.designator), nav, x[0]),
          C(M.fq(o.frequency), nav, x[0]), C(hours, nav), C(loc ? M.fPoint(loc) : '', nav, x[0]), C(''), C(''), C(x[1] === 'GP' && s(o.slope) ? 'GP ' + s(o.slope) + '°' + (M.fq(o.rdh) ? ', RDH ' + M.fq(o.rdh) : '') : '')]);
      });
    } else rows.push(eqRow(nav, s(p.type)));
    return rows;
  }
  function eqType(eq) { return { Localizer: 'LOC', Glidepath: 'GP', MarkerBeacon: 'MKR' + (s(eq.cur.p['class']) ? ' ' + s(eq.cur.p['class']) : ''), VOR: s(eq.cur.p.type) || 'VOR' }[eq.k] || eq.k; }
  AD2[19] = function (ds, ad) {
    var navs = owned(ds, ad, ['Navaid']).sort(byLabel(ds));
    var used = new Set();
    var rows = [];
    navs.forEach(function (n) {
      rows = rows.concat(equipmentRows(ds, n));
      arr(n.cur.p.navaidEquipment).forEach(function (c) { var t = c && c.theNavaidEquipment ? M.target(ds, c.theNavaidEquipment) : null; if (t) used.add(t); });
    });
    owned(ds, ad).filter(function (r) { return M.EQUIPMENT[r.k] && !used.has(r); }).forEach(function (eq) { rows = rows.concat(equipmentRows(ds, eq)); });
    return [table('', ['Type of aid, MAG VAR, type of supported operation', 'ID', 'Frequency / Channel', 'Hours of operation', 'Position of transmitting antenna coordinates',
      'Elevation of DME transmitting antenna', 'Service volume radius from GBAS reference point', 'Remarks'], rows)];
  };
  function rulesFor(ds, ad, re) {
    return refsTo(ds, ad, ['RulesProcedures']).filter(function (r) { return re.test(s(r.cur.p.title) + ' ' + s(r.cur.p.category)); });
  }
  function rulesBlock(ds, list) {
    return list.map(function (r) {
      var c = r.cur.p.content, txt = typeof c === 'string' ? c : c && c._v ? c._v : M.fv(ds, c);
      return { kind: 'kv', title: join([s(r.cur.p.title).replace(/_/g, ' '), s(r.cur.p.category) ? '(' + s(r.cur.p.category) + ')' : ''], ' '), rows: [row('', 'Text', [C(String(txt || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(), r, 'content')])] };
    });
  }
  AD2[20] = function (ds, ad) { var l = rulesBlock(ds, rulesFor(ds, ad, /LOCAL|REGULATION|AERODROME/i)); return l.length ? l : [note('NIL')]; };
  AD2[21] = function (ds, ad) { var l = rulesBlock(ds, rulesFor(ds, ad, /NOISE/i)); return l.length ? l : [note('NIL')]; };
  AD2[22] = function (ds, ad) {
    var blocks = rulesBlock(ds, rulesFor(ds, ad, /FLIGHT_PROC|PROCEDURE|HOLDING|APPROACH|DEPARTURE/i));
    var procs = owned(ds, ad, ['StandardInstrumentDeparture', 'StandardInstrumentArrival', 'InstrumentApproachProcedure']);
    var hold = (ds.byType.HoldingPattern || []).filter(function (h) { return s(h.cur.p.type) === 'TER' && ds.owner.get(h) === ad; });
    if (procs.length) { blocks.push(procTable(ds, procs)); procs.slice().sort(byLabel(ds)).forEach(function (pr) { blocks = blocks.concat(procDetail(ds, pr)); }); }
    if (hold.length) blocks.push(holdTable(ds, hold));
    return blocks.length ? blocks : [note('NIL')];
  };
  AD2[23] = function (ds, ad) {
    var covered = new Set(rulesFor(ds, ad, /LOCAL|REGULATION|AERODROME|NOISE|FLIGHT_PROC|PROCEDURE|HOLDING|APPROACH|DEPARTURE/i));
    var rest = refsTo(ds, ad, ['RulesProcedures']).filter(function (r) { return !covered.has(r); });
    var blocks = rulesBlock(ds, rest);
    var other = owned(ds, ad).filter(function (r) { return r.k.indexOf('45:') === 0 || ['WorkArea', 'NonMovementArea', 'Road', 'SurveyControlPoint', 'AirportHeliportCollocation'].indexOf(r.k) >= 0; });
    if (other.length) blocks.push(table('Other aerodrome features in the data set', ['Feature', 'Type', 'Details'], other.map(function (r) { return [C(M.label(ds, r), r), C(M.typeName(r)), C(M.fv(ds, r.cur.p).slice(0, 300), r)]; })));
    return blocks.length ? blocks : [note('NIL')];
  };
  AD2[24] = function (ds, ad) {
    var procs = owned(ds, ad, ['StandardInstrumentDeparture', 'StandardInstrumentArrival', 'InstrumentApproachProcedure']);
    var blocks = [note('Charts are not part of AIXM. Use the Map view (ENR 6 / AD charts) for a graphical overview. Procedures available in the data set:')];
    blocks.push(procTable(ds, procs));
    return blocks;
  };
  function procTable(ds, procs) {
    var K = { StandardInstrumentDeparture: 'SID', StandardInstrumentArrival: 'STAR', InstrumentApproachProcedure: 'IAP' };
    return table('Instrument procedures', ['Type', 'Designator', 'Name', 'RNAV', 'Approach type', 'Remarks'], procs.sort(byLabel(ds)).map(function (r) {
      var p = r.cur.p;
      return [C(K[r.k], r), C(s(p.designator), r, 'designator'), C(s(p.name), r, 'name'), C(s(p.RNAV), r, 'RNAV'), C(join([s(p.approachPrefix), s(p.approachType), s(p.multipleIdentification)], ' '), r, 'approachType'), C(M.notesOf(p).join(' '), r, 'annotation')];
    }));
  }
  /* ------------------------------------------------ procedure details (legs) */
  var LEG_KINDS = ['DepartureLeg', 'ArrivalLeg', 'ArrivalFeederLeg', 'InitialLeg', 'IntermediateLeg', 'FinalLeg', 'MissedApproachLeg'];
  var ALT_I = { ABOVE_LOWER: 'at or above', BELOW_UPPER: 'at or below', AT_LOWER: 'at', AT: 'at', BETWEEN: 'between', RECOMMENDED: 'recommended', EXPECT_LOWER: 'expect', AS_ASSIGNED: 'as assigned' };
  function legAlt(p) {
    var lo = M.fLimit(p.lowerLimitAltitude, p.lowerLimitReference), up = M.fLimit(p.upperLimitAltitude, p.upperLimitReference), it = s(p.altitudeInterpretation);
    if (!lo && !up) return '';
    if (it === 'BETWEEN' || (lo && up)) return 'between ' + lo + ' and ' + up;
    return (ALT_I[it] || it || '').trim() + ' ' + (lo || up);
  }
  function procLegs(ds, proc) {
    var out = [], seen = new Set();
    arr(proc.cur.p.flightTransition).forEach(function (tr) {
      if (!tr || tr.nil !== undefined) return;
      var legs = arr(tr.transitionLeg).map(function (tl) { return tl && { seq: s(tl.seqNumberARINC), leg: M.target(ds, tl.theSegmentLeg) }; }).filter(function (x) { return x && x.leg; });
      legs.sort(function (a, b) { return (+a.seq || 0) - (+b.seq || 0); });
      legs.forEach(function (x) { seen.add(x.leg); out.push({ tr: s(tr.transitionId) + (s(tr.type) ? ' (' + s(tr.type) + ')' : ''), seq: x.seq, leg: x.leg }); });
    });
    refsTo(ds, proc, LEG_KINDS).forEach(function (l) { if (!seen.has(l)) out.push({ tr: '', seq: '', leg: l }); });
    return out;
  }
  function procDetail(ds, proc) {
    var p = proc.cur.p, K = { StandardInstrumentDeparture: 'SID', StandardInstrumentArrival: 'STAR', InstrumentApproachProcedure: 'Instrument approach' }[proc.k];
    var rw = [];
    arr(p.flightTransition).forEach(function (tr) { if (tr && tr.departureRunwayTransition) arr(tr.departureRunwayTransition).forEach(function (l) { rw = rw.concat(arr(l.runway).map(function (x) { var t = M.target(ds, x); return t ? M.shortName(t) : ''; })); }); });
    arr(p.landing).forEach(function (l) { rw = rw.concat(arr(l && l.runway).map(function (x) { var t = M.target(ds, x); return t ? M.shortName(t) : ''; })); });
    var legs = procLegs(ds, proc), prevEnd = '';
    var blocks = [{ kind: 'kv', title: K + ' ' + (s(p.designator) || s(p.name)) + (s(p.name) && s(p.designator) ? ' — ' + s(p.name) : ''), rows: [
      row('', 'Type / RNAV', [C(join([K, s(p.approachPrefix), s(p.approachType), s(p.RNAV) === 'YES' ? 'RNAV' : ''], ' '), proc, 'RNAV')]),
      row('', 'Runway(s)', [C(uniq(rw).join(', '), proc, proc.k === 'InstrumentApproachProcedure' ? 'landing' : 'flightTransition')]),
      row('', 'Communication failure / instructions', [C(join([s(p.communicationFailureInstruction), s(p.instruction)], '\n'), proc, 'communicationFailureInstruction')]),
      row('', 'Remarks', [C(M.notesOf(p).join('\n'), proc, 'annotation')])
    ] }];
    var rows = legs.map(function (x) {
      var lp = x.leg.cur.p, from = M.segPointLabel(ds, arr(lp.startPoint)[0]) || prevEnd, to = M.segPointLabel(ds, arr(lp.endPoint)[0]);
      prevEnd = to || prevEnd;
      var crs = s(lp.course) ? s(lp.course) + '°' + ({ TRUE_TRACK: 'T', TRUE_BRG: 'T' }[s(lp.courseType)] || '') : '';
      return [C(x.seq, x.leg, 'legTypeARINC'), C(x.tr), C(join([s(lp.legTypeARINC), x.leg.k.replace('Leg', '')], ' · '), x.leg, 'legTypeARINC'), C(from, x.leg, 'startPoint'), C(to, x.leg, 'endPoint'),
        C(join([crs, s(lp.turnDirection) ? 'turn ' + s(lp.turnDirection) : ''], ' '), x.leg, 'course'), C(legAlt(lp), x.leg, 'lowerLimitAltitude'),
        C(M.fq(lp.speedLimit) ? 'max ' + M.fq(lp.speedLimit) + (s(lp.speedReference) ? ' ' + s(lp.speedReference) : '') : '', x.leg, 'speedLimit'),
        C(join([M.fq(lp.length), s(lp.verticalAngle) ? 'VA ' + s(lp.verticalAngle) + '°' : '', s(lp.requiredNavigationPerformance) ? 'RNP ' + s(lp.requiredNavigationPerformance) : ''], ' '), x.leg, 'length'),
        C(M.notesOf(lp).join(' '), x.leg, 'annotation')];
    });
    blocks.push(table('Legs', ['Seq', 'Transition', 'Leg (ARINC 424)', 'From', 'To', 'Course / turn', 'Altitude', 'Speed', 'Distance / VA / RNP', 'Remarks'], rows, legs.length ? '' : 'No legs for this procedure in the data set.'));
    var mins = [];
    legs.forEach(function (x) {
      arr(x.leg.cur.p.condition).forEach(function (c) {
        if (!c || c.nil !== undefined) return;
        var cats = arr(c.aircraftCategory).map(function (a) { return a && s(a.aircraftLandingCategory); }).filter(Boolean).join(', ');
        arr(c.minimumSet).forEach(function (m) {
          if (!m || m.nil !== undefined) return;
          mins.push([C(cats || 'all', x.leg, 'condition'), C(s(c.finalApproachPath), x.leg, 'condition'), C(join([s(m.altitudeCode), M.fq(m.altitude)], ' '), x.leg, 'condition'),
            C(join([s(m.heightCode), M.fq(m.height), s(m.heightReference) ? '(' + s(m.heightReference) + ')' : ''], ' '), x.leg, 'condition'), C(join([M.fq(m.visibility), M.fq(m.runwayVisualRange) ? 'RVR ' + M.fq(m.runwayVisualRange) : ''], ' '), x.leg, 'condition')]);
        });
      });
    });
    if (mins.length) blocks.push(table('Minima', ['Aircraft category', 'Final approach', 'OCA / DA / MDA', 'OCH / DH / MDH', 'Visibility / RVR'], mins));
    // vertical profile of an approach (profile.js, loaded after this module)
    if (proc.k === 'InstrumentApproachProcedure' && typeof PROFILE !== 'undefined') blocks = blocks.concat(PROFILE.blocks(ds, proc));
    return blocks;
  }

  function holdTable(ds, hold) {
    return table('Holding procedures', ['Holding fix', 'INBD TR (MAG)', 'Direction of PTN', 'Max IAS', 'MNM / MAX HLDG level', 'Time / Distance OUTBD', 'Remarks'], hold.map(function (h) {
      var p = h.cur.p, ib = arr(p.inboundCourse)[0] || {};
      if (typeof ib === 'string') ib = { course: ib, courseType: s(p.outboundCourseType) };
      var fix = M.segPointLabel(ds, arr(p.holdingPoint)[0]);
      var span = p.outboundLegSpan_endTime ? M.fq(arr(p.outboundLegSpan_endTime)[0].duration) : p.outboundLegSpan_endDistance ? M.fq(arr(p.outboundLegSpan_endDistance)[0].length) : '';
      return [C(fix, h, 'holdingPoint'), C(s(ib.course) ? s(ib.course) + '°' + (s(ib.courseType) && s(ib.courseType) !== 'MAG_TRACK' && s(ib.courseType) !== 'MAG_BRG' ? ' ' + s(ib.courseType) : '') : '', h, 'inboundCourse'), C(s(p.turnDirection), h, 'turnDirection'), C(M.fq(p.speedLimit), h, 'speedLimit'),
        C(join([M.fLimit(p.lowerLimit, p.lowerLimitReference), M.fLimit(p.upperLimit, p.upperLimitReference)], ' / '), h, 'lowerLimit'), C(span, h), C(join([s(p.instruction), M.notesOf(p).join(' ')], ' '), h, 'annotation')];
    }));
  }

  function adSection(ds, ad, n) {
    var heli = isHeliport(ad);
    var no = heli ? n : n, b = heli ? AD3_MAP[n] : n;
    var title = heli ? (AD3_TITLES[n] || AD2_TITLES[b]) : AD2_TITLES[n];
    var blocks = AD2[b](ds, ad);
    return { id: (heli ? 'AD3.' : 'AD2.') + n + ':' + ad.i, no: (heli ? 'AD 3.' : 'AD 2.') + no, title: title, code: adCode(ad), blocks: blocks, ad: ad };
  }
  function adSections(ds, ad) {
    var heli = isHeliport(ad), n = heli ? 23 : 24, out = [];
    for (var i = 1; i <= n; i++) out.push({ id: (heli ? 'AD3.' : 'AD2.') + i + ':' + ad.i, no: (heli ? 'AD 3.' : 'AD 2.') + i, title: heli ? (AD3_TITLES[i] || AD2_TITLES[AD3_MAP[i]]) : AD2_TITLES[i], build: adSection.bind(null, ds, ad, i) });
    return out;
  }

  /* ========================================================== ENR / GEN */
  var AS_GROUP = {
    'ENR 2.1': ['FIR', 'FIR_P', 'UIR', 'UIR_P', 'CTA', 'CTA_P', 'OCA', 'OCA_P', 'UTA', 'UTA_P', 'TMA', 'TMA_P', 'NAS', 'NAS_P', 'CTR', 'CTR_P', 'OTA', 'SECTOR', 'SECTOR_C'],
    'ENR 2.2': ['ATZ', 'ATZ_P', 'HTZ', 'RAS', 'ADV', 'UADV', 'CLASS', 'AWY', 'RMZ', 'TMZ', 'FRA', 'NTZ', 'NOZ', 'FIZ', 'RCZ', 'AMA', 'ASR', 'PROTECT', 'PART', 'NO_FIR', 'POLITICAL', 'RCA'],
    'ENR 5.1': ['P', 'R', 'D'],
    'ENR 5.2': ['TSA', 'TRA', 'CBA', 'MTR', 'MOA', 'ADIZ', 'FBZ', 'NPZ'],
    'ENR 5.3': ['A', 'W', 'D_OTHER']
  };
  function airspaceGroupOf(t) {
    for (var k in AS_GROUP) if (AS_GROUP[k].indexOf(t) >= 0) return k;
    return 'ENR 2.2';
  }
  function airspaceTable(ds, list, cols) {
    return table('', cols || ['Name / Lateral limits', 'Vertical limits', 'Class', 'Unit providing service / Call sign / Frequency', 'Hours / Remarks'], list.sort(byLabel(ds)).map(function (a) {
      var svcs = servicesFor(ds, a, 'clientAirspace');
      var freq = [].concat.apply([], svcs.map(function (v) { return channelsOf(ds, v).map(M.fFreq); }));
      return [C(join([M.label(ds, a), lateral(ds, a)], '\n'), a, 'geometryComponent'), C(vertical(ds, a), a, 'geometryComponent'), C(airspaceClass(a), a, 'class'),
        C(join([uniq(svcs.map(function (v) { var u = M.target(ds, v.cur.p.serviceProvider); return u ? M.label(ds, u) : ''; })).join(', '), callSigns(ds, svcs), uniq(freq).join(', ')], '\n'), svcs[0] || a),
        C(join([activation(a), M.notesOf(a.cur.p).join(' ')], '\n'), a, has(a, ['activation', 'annotation']))];
    }));
  }
  function restrictedTable(ds, list) {
    return table('', ['Identification, name and lateral limits', 'Upper limit / Lower limit', 'Remarks (time of activity, type of restriction, nature of hazard)'], list.sort(byLabel(ds)).map(function (a) {
      return [C(join([M.label(ds, a), lateral(ds, a)], '\n'), a, 'geometryComponent'), C(vertical(ds, a), a, 'geometryComponent'), C(join([activation(a), M.notesOf(a.cur.p).join(' ')], '\n'), a, has(a, ['activation', 'annotation']))];
    }));
  }
  function airspacesIn(ds, group) {
    return (ds.byType.Airspace || []).filter(function (a) { return airspaceGroupOf(s(a.cur.p.type)) === group; });
  }
  function routeTables(ds, filter) {
    var routes = (ds.byType.Route || []).slice().sort(byLabel(ds));
    var segs = ds.byType.RouteSegment || [];
    var byRoute = new Map();
    segs.forEach(function (sg) { var r = M.target(ds, sg.cur.p.routeFormed); if (!r) return; var l = byRoute.get(r); if (!l) byRoute.set(r, l = []); l.push(sg); });
    var blocks = [];
    routes.forEach(function (rt) {
      var list = byRoute.get(rt) || [];
      if (filter && !filter(rt, list)) return;
      // chain segments start -> end
      var ordered = chain(ds, list);
      var rows = [];
      ordered.forEach(function (sg, i) {
        var p = sg.cur.p;
        if (i === 0) rows.push([C('▲ ' + M.segPointLabel(ds, p.start), sg, 'start'), C(ptPos(ds, p.start)), C(''), C(''), C(''), C(''), C(''), C(s(arr(p.start)[0] && p.start.reportingATC), sg, 'start')]);
        var trk = join([s(p.magneticTrack) ? s(p.magneticTrack) + '°' : '', s(p.reverseMagneticTrack) ? '/ ' + s(p.reverseMagneticTrack) + '°' : ''], ' ') || join([s(p.trueTrack) ? s(p.trueTrack) + '°T' : '', s(p.reverseTrueTrack) ? '/ ' + s(p.reverseTrueTrack) + '°T' : ''], ' ');
        var mea = arr(p.minimumEnrouteAltitude).map(function (x) { return x && x.nil === undefined ? M.fq(x.altitude) : ''; }).filter(Boolean).join(', ');
        var cruising = arr(p.availability).map(function (a) { return a && a.nil === undefined ? join([s(a.direction), s(a.cardinalDirection), s(a.status)], ' ') : ''; }).filter(Boolean).join(', ');
        rows.push([C('   ' + (s(p.navigationType) || '') + ' ' + (s(p.pathType) || ''), sg, 'navigationType'), C(''), C(join([trk, M.fq(p.length)], '\n'), sg, 'magneticTrack'),
          C(join([M.fLimit(p.upperLimit, p.upperLimitReference), M.fLimit(p.lowerLimit, p.lowerLimitReference)], ' / ') + (mea ? '\nMEA ' + mea : '') + (M.fq(p.minimumObstacleClearanceAltitude) ? '\nMOCA ' + M.fq(p.minimumObstacleClearanceAltitude) : ''), sg, 'upperLimit'),
          C(join([M.fq(p.widthLeft), M.fq(p.widthRight)], ' / ') || M.fq(p._width), sg, 'widthLeft'), C(cruising, sg, 'availability'), C(s(p.requiredNavigationPerformance) ? 'RNP ' + s(p.requiredNavigationPerformance) : '', sg, 'requiredNavigationPerformance'),
          C(M.notesOf(p).join(' '), sg, 'annotation')]);
        rows.push([C('▲ ' + M.segPointLabel(ds, p.end), sg, 'end'), C(ptPos(ds, p.end)), C(''), C(''), C(''), C(''), C(''), C(s(arr(p.end)[0] && p.end.reportingATC), sg, 'end')]);
      });
      var rp = rt.cur.p;
      if (!rows.length) rows.push([C('No route segments for this route in the data set', rt), C(''), C(''), C(''), C(''), C(''), C(''), C('')]);
      blocks.push(table(join([M.routeDesignator(rp), s(rp.name) && s(rp.name) !== M.routeDesignator(rp) ? '(' + s(rp.name) + ')' : '', s(rp.flightRule), s(rp.internationalUse), s(rp.type)], ' '),
        ['Route designator / significant points', 'Coordinates', 'Track MAG (DIST)', 'Upper / Lower limits, MEA, MOCA', 'Lateral limits', 'Direction of cruising levels / availability', 'RNP', 'Remarks'], rows,
        M.notesOf(rp).join(' ')));
      blocks[blocks.length - 1].rec = rt;
    });
    // segments without route
    var orphan = segs.filter(function (sg) { return !M.target(ds, sg.cur.p.routeFormed); });
    if (orphan.length && !filter) blocks.push(table('Route segments without route', ['Segment', 'Limits', 'Remarks'], orphan.map(function (sg) { return [C(M.label(ds, sg), sg), C(join([M.fLimit(sg.cur.p.upperLimit, sg.cur.p.upperLimitReference), M.fLimit(sg.cur.p.lowerLimit, sg.cur.p.lowerLimitReference)], ' / '), sg, 'upperLimit'), C(M.notesOf(sg.cur.p).join(' '), sg)]; })));
    return blocks;
  }
  function ptPos(ds, sp) { var c = M.segPoint(ds, arr(sp)[0]); return c ? AX.fmtPos(c, 0) : ''; }
  function chain(ds, list) {
    if (list.length < 2) return list;
    function key(sp) { sp = arr(sp)[0]; var r = M.segPointRec(ds, sp); if (r) return r; var c = M.segPoint(ds, sp); return c ? c[0].toFixed(5) + ',' + c[1].toFixed(5) : null; }
    var byStart = new Map(), ends = new Set();
    list.forEach(function (sg) { var k = key(sg.cur.p.start); if (k !== null && !byStart.has(k)) byStart.set(k, sg); ends.add(key(sg.cur.p.end)); });
    var out = [], used = new Set();
    var heads = list.filter(function (sg) { return !ends.has(key(sg.cur.p.start)); });
    if (!heads.length) heads = [list[0]];
    heads.forEach(function (h) {
      var cur = h;
      while (cur && !used.has(cur)) { used.add(cur); out.push(cur); cur = byStart.get(key(cur.cur.p.end)); }
    });
    list.forEach(function (sg) { if (!used.has(sg)) out.push(sg); });
    return out;
  }
  function navaidRows(ds) {
    var navs = (ds.byType.Navaid || []).filter(function (n) { return !/^(ILS|ILS_DME|LOC|LOC_DME|MLS|MLS_DME|TLS)$/.test(s(n.cur.p.type)); });
    var used = new Set();
    navs.forEach(function (n) { arr(n.cur.p.navaidEquipment).forEach(function (c) { var t = c && c.theNavaidEquipment ? M.target(ds, c.theNavaidEquipment) : null; if (t) used.add(t); }); });
    (ds.byType.Navaid || []).forEach(function (n) { arr(n.cur.p.navaidEquipment).forEach(function (c) { var t = c && c.theNavaidEquipment ? M.target(ds, c.theNavaidEquipment) : null; if (t) used.add(t); }); });
    var rows = [];
    navs.sort(byLabel(ds)).forEach(function (n) {
      var p = n.cur.p;
      var comps = arr(p.navaidEquipment).map(function (c) { return c && c.theNavaidEquipment ? M.target(ds, c.theNavaidEquipment) : null; }).filter(Boolean);
      var freq = comps.map(function (eq) { return eq.k === 'DME' || eq.k === 'TACAN' ? (s(eq.cur.p.channel) ? 'CH ' + s(eq.cur.p.channel) : '') : M.fq(eq.cur.p.frequency); }).filter(Boolean);
      var loc = arr(p.location)[0] || (comps[0] && arr(comps[0].cur.p.location)[0]);
      var dmeEq = comps.filter(function (e) { return e.k === 'DME'; })[0];
      var mv = comps.map(function (e) { return s(e.cur.p.magneticVariation) || s(e.cur.p.declination); }).filter(Boolean)[0];
      rows.push([C(join([s(p.name), '(' + s(p.type).replace(/_/g, '/') + ')', mv ? magVar(mv) : ''], ' '), n, 'name'), C(s(p.designator), n, 'designator'),
        C(freq.join('\n'), comps[0] || n, comps[0] ? (comps[0].cur.p.frequency ? 'frequency' : 'channel') : null), C(hoursOf(n) || comps.map(hoursOf).filter(Boolean)[0] || ''),
        C(loc ? M.fPoint(loc) : '', n, 'location'), C(dmeEq ? M.fElev(dmeEq.cur.p.location) : '', dmeEq || n, 'location'),
        C(uniq([].concat(M.notesOf(p), [].concat.apply([], comps.map(function (e) { return M.notesOf(e.cur.p); })))).join('\n'), n, 'annotation')]);
    });
    ['VOR', 'DME', 'NDB', 'TACAN', 'SDF', 'DirectionFinder'].forEach(function (k) {
      (ds.byType[k] || []).forEach(function (eq) {
        if (used.has(eq)) return;
        var owner = ds.owner.get(eq);
        if (owner && (k === 'DME' && eq.cur.p._ils)) return;
        var p = eq.cur.p, loc = arr(p.location)[0];
        var mv = s(p.magneticVariation) || s(p.declination);
        rows.push([C(join([s(p.name), '(' + (s(p.type) || k) + ')', mv ? magVar(mv) : ''], ' '), eq, 'name'), C(s(p.designator), eq, 'designator'),
          C(k === 'DME' || k === 'TACAN' ? (s(p.channel) ? 'CH ' + s(p.channel) : '') : M.fq(p.frequency), eq, k === 'DME' || k === 'TACAN' ? 'channel' : 'frequency'), C(hoursOf(eq)),
          C(loc ? M.fPoint(loc) : '', eq, 'location'), C(k === 'DME' ? M.fElev(loc) : '', eq, 'location'), C(M.notesOf(p).join('\n'), eq, 'annotation')]);
      });
    });
    return rows;
  }
  function designatedPointRows(ds) {
    var usedBy = new Map();
    (ds.byType.RouteSegment || []).forEach(function (sg) {
      var rt = M.target(ds, sg.cur.p.routeFormed), name = rt ? M.routeDesignator(rt.cur.p) : '';
      [sg.cur.p.start, sg.cur.p.end].forEach(function (sp) { var r = M.segPointRec(ds, arr(sp)[0]); if (r && name) { var l = usedBy.get(r); if (!l) usedBy.set(r, l = []); if (l.indexOf(name) < 0) l.push(name); } });
    });
    return (ds.byType.DesignatedPoint || []).slice().sort(byLabel(ds)).map(function (r) {
      var p = r.cur.p;
      return [C(s(p.designator), r, 'designator'), C(M.fPoint(p.location), r, 'location'), C((usedBy.get(r) || []).join(', ')), C(s(p.type), r, 'type', M.codeDef('DesignatedPoint', 'type', s(p.type))),
        C(join([s(p.name) !== s(p.designator) ? s(p.name) : '', M.notesOf(p).join(' ')], ' '), r, 'annotation')];
    });
  }
  function obstacleRows(ds, list) {
    return list.map(function (o) {
      var p = o.cur.p, part = arr(p.part)[0] || {};
      var loc = part.horizontalProjection_location || arr(part.horizontalProjection_linearExtent)[0] || arr(part.horizontalProjection_surfaceExtent)[0];
      var g = loc && loc._geo;
      var pos = g ? (g.t === 'P' ? AX.fmtPos(g.c, 2) : AX.fmtPos(g.t === 'A' ? g.c[0][0] : g.c[0], 2) + ' …') : '';
      return [C(s(p.name) || s(p.designator) || s(part.designator), o, 'name'), C(s(p.type) || s(part.type), o, 'type'), C(pos, o, 'part'),
        C(join([loc ? M.fq(loc.elevation) : '', M.fq(part.verticalExtent) ? '/ ' + M.fq(part.verticalExtent) : ''], ' '), o, 'part'),
        C(join([s(part.markingPattern), s(part.markingFirstColour), s(part.markingSecondColour)], ' '), o, 'part'), C(s(p.lighted) === 'YES' ? 'LGTD' : s(p.lighted) === 'NO' ? 'NIL' : '', o, 'lighted'),
        C(M.notesOf(p).join(' '), o, 'annotation')];
    });
  }
  function orgRows(ds, list) {
    return list.sort(byLabel(ds)).map(function (o) {
      return [C(s(o.cur.p.name), o, 'name'), C(s(o.cur.p.designator), o, 'designator'), C(s(o.cur.p.type), o, 'type', M.codeDef(o.k, 'type', s(o.cur.p.type))), C(M.fContact(o.cur.p.contact), o, 'contact'), C(M.notesOf(o.cur.p).join(' '), o, 'annotation')];
    });
  }
  function unitRows(ds, list) {
    return list.sort(byLabel(ds)).map(function (u) {
      var p = u.cur.p, ad = M.target(ds, p.airportLocation);
      return [C(s(p.name), u, 'name'), C(s(p.type), u, 'type', M.codeDef('Unit', 'type', s(p.type))), C(ad ? M.shortName(ad) : '', u, 'airportLocation'), C(M.fContact(p.contact), u, 'contact'), C(M.fSchedule(p.availability), u, 'availability'), C(M.notesOf(p).join(' '), u, 'annotation')];
    });
  }

  var GENENR = [
    { id: 'GEN 1.1', title: 'DESIGNATED AUTHORITIES', has: function (ds) { return (ds.byType.OrganisationAuthority || []).length; },
      build: function (ds) { return [table('', ['Name', 'Designator', 'Type', 'Contact', 'Remarks'], orgRows(ds, (ds.byType.OrganisationAuthority || []).slice()))]; } },
    { id: 'GEN 2.1', title: 'MEASURING SYSTEM, AIRCRAFT MARKINGS, HOLIDAYS', has: function (ds) { return (ds.byType.SpecialDate || []).length; },
      build: function (ds) {
        return [table('Public holidays and special dates', ['Date', 'Name', 'Type', 'Authority', 'Remarks'], (ds.byType.SpecialDate || []).slice().sort(function (a, b) { return (s(a.cur.p.dateYear) + s(a.cur.p.dateDay).split('-').reverse().join('')) < (s(b.cur.p.dateYear) + s(b.cur.p.dateDay).split('-').reverse().join('')) ? -1 : 1; }).map(function (r) {
          var p = r.cur.p, au = M.target(ds, p.authority);
          return [C(join([s(p.dateDay), s(p.dateYear)], '-'), r, 'dateDay'), C(s(p.name), r, 'name'), C(s(p.type), r, 'type', M.codeDef('SpecialDate', 'type', s(p.type))), C(au ? M.label(ds, au) : '', r, 'authority'), C(M.notesOf(p).join(' '), r, 'annotation')];
        }))];
      } },
    { id: 'GEN 2.4', title: 'LOCATION INDICATORS', has: function (ds) { return (ds.byType.AirportHeliport || []).length; },
      build: function (ds) {
        return [table('', ['Location', 'Indicator', 'Type', 'State'], (ds.byType.AirportHeliport || []).slice().sort(function (a, b) { return s(a.cur.p.name) < s(b.cur.p.name) ? -1 : 1; }).map(function (a) {
          var code = s(a.cur.p.locationIndicatorICAO) || s(a.cur.p.designator);
          return [C(s(a.cur.p.name), a, 'name'), C(code, a, has(a, ['locationIndicatorICAO', 'designator'])), C(s(a.cur.p.type), a, 'type', M.codeDef('AirportHeliport', 'type', s(a.cur.p.type))), C(AX.stateFromICAO(code) || '')];
        }))];
      } },
    { id: 'GEN 2.5', title: 'LIST OF RADIO NAVIGATION AIDS', has: function (ds) { return (ds.byType.Navaid || []).length || (ds.byType.VOR || []).length || (ds.byType.NDB || []).length; },
      build: function (ds) {
        var rows = [];
        (ds.byType.Navaid || []).forEach(function (n) { var p = n.cur.p; rows.push([C(s(p.designator), n, 'designator'), C(s(p.name), n, 'name'), C(s(p.type), n, 'type'), C(s(p.purpose), n, 'purpose'), C(ds.owner.get(n) ? M.shortName(ds.owner.get(n)) : '')]); });
        ['VOR', 'DME', 'NDB', 'TACAN'].forEach(function (k) { (ds.byType[k] || []).forEach(function (e) { if (ds.rev.get(e) && ds.rev.get(e).some(function (x) { return x[1].k === 'Navaid'; })) return; var p = e.cur.p; rows.push([C(s(p.designator), e, 'designator'), C(s(p.name), e, 'name'), C(s(p.type) || k, e, 'type'), C(''), C(ds.owner.get(e) ? M.shortName(ds.owner.get(e)) : '')]); }); });
        rows.sort(function (a, b) { return a[0].t < b[0].t ? -1 : 1; });
        return [table('', ['ID', 'Station name', 'Facility', 'Purpose', 'Aerodrome'], rows)];
      } },
    { id: 'GEN 3.1', title: 'AERONAUTICAL INFORMATION SERVICES', has: function (ds) { return (ds.byType.InformationService || []).some(function (r) { return /AIS|NOTAM|BRIEFING/.test(svcType(r)); }) || (ds.byType.Unit || []).some(function (u) { return /NOF|AOF|BOF|ARO/.test(s(u.cur.p.type)); }); },
      build: function (ds) {
        return [table('', ['Unit', 'Type', 'Aerodrome', 'Contact', 'Hours', 'Remarks'], unitRows(ds, (ds.byType.Unit || []).filter(function (u) { return /NOF|AOF|BOF|ARO|AIS/.test(s(u.cur.p.type)); })))].concat(
          [table('Information services', ['Service', 'Name', 'Hours', 'Remarks'], (ds.byType.InformationService || []).filter(function (r) { return /AIS|NOTAM|BRIEFING/.test(svcType(r)); }).map(function (r) { return [C(svcType(r), r, 'type'), C(s(r.cur.p.name), r, 'name'), C(hoursOf(r), r, 'availability'), C(M.notesOf(r.cur.p).join(' '), r, 'annotation')]; }))]);
      } },
    { id: 'GEN 3.3', title: 'AIR TRAFFIC SERVICES', has: function (ds) { return (ds.byType.Unit || []).length; },
      build: function (ds) { return [table('ATS units', ['Unit', 'Type', 'Aerodrome', 'Contact', 'Hours', 'Remarks'], unitRows(ds, (ds.byType.Unit || []).slice()))]; } },
    { id: 'GEN 3.4', title: 'COMMUNICATION SERVICES', has: function (ds) { return (ds.byType.RadioCommunicationChannel || []).length; },
      build: function (ds) {
        return [table('Radio communication channels', ['Frequency / Channel', 'Mode', 'Rank', 'Used by service', 'Emission', 'Hours', 'Remarks'], (ds.byType.RadioCommunicationChannel || []).map(function (c) {
          var users = refsTo(ds, c).filter(function (x) { return M.SERVICE[x.k]; });
          var sv = c.cur.p._service ? M.target(ds, c.cur.p._service) : null;
          if (sv) users.push(sv);
          return [C(M.fFreq(c), c, c.cur.p.frequencyTransmission ? 'frequencyTransmission' : 'channel'), C(s(c.cur.p.mode), c, 'mode'), C(s(c.cur.p.rank), c, 'rank'), C(users.map(function (u) { return M.label(ds, u) + (ds.owner.get(u) ? ' (' + M.shortName(ds.owner.get(u)) + ')' : ''); }).join('\n')),
            C(s(c.cur.p.emissionType), c, 'emissionType'), C(M.fSchedule(c.cur.p.availability), c, 'availability'), C(M.notesOf(c.cur.p).join(' '), c, 'annotation')];
        }))];
      } },
    { id: 'GEN 3.6', title: 'SEARCH AND RESCUE', has: function (ds) { return (ds.byType.SearchRescueService || []).length || (ds.byType.Unit || []).some(function (u) { return /RCC|RSC|SAR/.test(s(u.cur.p.type)); }); },
      build: function (ds) {
        return [table('SAR services', ['Service', 'Name', 'Provider', 'Hours', 'Remarks'], (ds.byType.SearchRescueService || []).map(function (r) { var u = M.target(ds, r.cur.p.serviceProvider); return [C(svcType(r), r, 'type'), C(s(r.cur.p.name), r, 'name'), C(u ? M.label(ds, u) : '', r, 'serviceProvider'), C(hoursOf(r), r, 'availability'), C(M.notesOf(r.cur.p).join(' '), r, 'annotation')]; })),
          table('SAR units', ['Unit', 'Type', 'Aerodrome', 'Contact', 'Hours', 'Remarks'], unitRows(ds, (ds.byType.Unit || []).filter(function (u) { return /RCC|RSC|SAR/.test(s(u.cur.p.type)); })))];
      } },
    { id: 'ENR 1', title: 'GENERAL RULES AND PROCEDURES', has: function (ds) { return (ds.byType.RulesProcedures || []).some(function (r) { return !ds.owner.get(r) && !M.target(ds, r.cur.p.affectedLocation); }); },
      build: function (ds) { return rulesBlock(ds, (ds.byType.RulesProcedures || []).filter(function (r) { return !M.target(ds, r.cur.p.affectedLocation); })); } },
    { id: 'ENR 2.1', title: 'FIR, UIR, TMA AND CTA', has: function (ds) { return airspacesIn(ds, 'ENR 2.1').length; }, build: function (ds) { return [airspaceTable(ds, airspacesIn(ds, 'ENR 2.1'))]; } },
    { id: 'ENR 2.2', title: 'OTHER REGULATED AIRSPACE', has: function (ds) { return airspacesIn(ds, 'ENR 2.2').length; }, build: function (ds) { return [airspaceTable(ds, airspacesIn(ds, 'ENR 2.2'))]; } },
    { id: 'ENR 3.1', title: 'CONVENTIONAL NAVIGATION ROUTES', has: function (ds) { return (ds.byType.Route || []).length; },
      build: function (ds) { var b = routeTables(ds, function (rt, segs) { return !segs.some(function (x) { return /RNAV|RNP/.test(s(x.cur.p.navigationType)); }); }); return b.length ? b : [note('NIL')]; } },
    { id: 'ENR 3.2', title: 'AREA NAVIGATION ROUTES', has: function (ds) { return (ds.byType.RouteSegment || []).some(function (x) { return /RNAV|RNP/.test(s(x.cur.p.navigationType)); }); },
      build: function (ds) { var b = routeTables(ds, function (rt, segs) { return segs.some(function (x) { return /RNAV|RNP/.test(s(x.cur.p.navigationType)); }); }); return b.length ? b : [note('NIL')]; } },
    { id: 'ENR 3.4', title: 'EN-ROUTE HOLDING', has: function (ds) { return (ds.byType.HoldingPattern || []).some(function (h) { return s(h.cur.p.type) !== 'TER'; }); },
      build: function (ds) { return [holdTable(ds, (ds.byType.HoldingPattern || []).filter(function (h) { return s(h.cur.p.type) !== 'TER'; }))]; } },
    { id: 'ENR 4.1', title: 'RADIO NAVIGATION AIDS – EN-ROUTE', has: function (ds) { return navaidRows(ds).length; },
      build: function (ds) { return [table('', ['Name of station (VOR declination / MAG VAR)', 'ID', 'Frequency / Channel', 'Hours of operation', 'Coordinates', 'Elevation of DME antenna', 'Remarks'], navaidRows(ds))]; } },
    { id: 'ENR 4.2', title: 'SPECIAL NAVIGATION SYSTEMS', has: function (ds) { return (ds.byType.SpecialNavigationSystem || []).length || (ds.byType.SpecialNavigationStation || []).length; },
      build: function (ds) { return [table('', ['System / Station', 'Type', 'Details'], (ds.byType.SpecialNavigationSystem || []).concat(ds.byType.SpecialNavigationStation || []).map(function (r) { return [C(M.label(ds, r), r), C(s(r.cur.p.type), r, 'type'), C(M.fv(ds, r.cur.p).slice(0, 400), r)]; }))]; } },
    { id: 'ENR 4.3', title: 'GLOBAL NAVIGATION SATELLITE SYSTEM', has: function (ds) { return (ds.byType.SatelliteSystem || []).length || (ds.byType.GBAS || []).length || (ds.byType.SatelliteService || []).length; },
      build: function (ds) { return [table('', ['System', 'Type', 'Details'], (ds.byType.SatelliteSystem || []).concat(ds.byType.GBAS || [], ds.byType.SatelliteService || [], ds.byType.GBASService || []).map(function (r) { return [C(M.label(ds, r), r), C(M.typeName(r)), C(M.fv(ds, r.cur.p).slice(0, 400), r)]; }))]; } },
    { id: 'ENR 4.4', title: 'NAME-CODE DESIGNATORS FOR SIGNIFICANT POINTS', has: function (ds) { return (ds.byType.DesignatedPoint || []).length; },
      build: function (ds) { return [table('', ['Name-code designator', 'Coordinates', 'ATS route or other route', 'Type', 'Remarks'], designatedPointRows(ds))]; } },
    { id: 'ENR 4.5', title: 'AERONAUTICAL GROUND LIGHTS – EN-ROUTE', has: function (ds) { return (ds.byType.AeronauticalGroundLight || []).some(function (r) { return !ds.owner.get(r); }); },
      build: function (ds) {
        return [table('', ['Name', 'Type', 'Coordinates', 'Characteristics', 'Remarks'], (ds.byType.AeronauticalGroundLight || []).filter(function (r) { return !ds.owner.get(r); }).map(function (r) {
          var p = r.cur.p; return [C(s(p.name), r, 'name'), C(s(p.type), r, 'type', M.codeDef(r.k, 'type', s(p.type))), C(M.fPoint(p.location), r, 'location'), C(join([s(p.colour), s(p.flashing) === 'YES' ? 'flashing' : '', M.fq(p.intensity)], ' '), r, 'colour'), C(M.notesOf(p).join(' '), r, 'annotation')];
        }))];
      } },
    { id: 'ENR 5.1', title: 'PROHIBITED, RESTRICTED AND DANGER AREAS', has: function (ds) { return airspacesIn(ds, 'ENR 5.1').length; }, build: function (ds) { return [restrictedTable(ds, airspacesIn(ds, 'ENR 5.1'))]; } },
    { id: 'ENR 5.2', title: 'MILITARY EXERCISE AND TRAINING AREAS AND AIR DEFENCE IDENTIFICATION ZONE (ADIZ)', has: function (ds) { return airspacesIn(ds, 'ENR 5.2').length; }, build: function (ds) { return [restrictedTable(ds, airspacesIn(ds, 'ENR 5.2'))]; } },
    { id: 'ENR 5.3', title: 'OTHER ACTIVITIES OF A DANGEROUS NATURE AND OTHER POTENTIAL HAZARDS', has: function (ds) { return airspacesIn(ds, 'ENR 5.3').length; }, build: function (ds) { return [restrictedTable(ds, airspacesIn(ds, 'ENR 5.3'))]; } },
    { id: 'ENR 5.4', title: 'AIR NAVIGATION OBSTACLES', has: function (ds) { return (ds.byType.VerticalStructure || []).some(function (o) { return !ds.owner.get(o); }); },
      build: function (ds) {
        var list = (ds.byType.VerticalStructure || []).filter(function (o) { return !ds.owner.get(o); });
        return [table('', ['Obstacle ID / designation', 'Obstacle type', 'Obstacle position', 'Elevation / Height', 'Markings / Type, colour', 'Lighting', 'Remarks'], obstacleRows(ds, list))];
      } },
    { id: 'ENR 6', title: 'EN-ROUTE CHARTS', has: function () { return true; }, build: function () { return [note('Charts are not part of AIXM. Open the Map view to see airspace, routes, navigation aids and points drawn from this data set.')]; } }
  ];

  /* ------------------------------------------------------------ catalogue */
  function catalogue(ds) {
    var gen = [], enr = [];
    GENENR.forEach(function (d) {
      var ok = false;
      try { ok = !!d.has(ds); } catch (e) { ok = false; }
      if (!ok) return;
      var item = { id: d.id, no: d.id, title: d.title, build: function () { return { id: d.id, no: d.id, title: d.title, blocks: d.build(ds) }; } };
      (d.id.indexOf('GEN') === 0 ? gen : enr).push(item);
    });
    var ads = (ds.byType.AirportHeliport || []).slice().sort(function (a, b) { return M.shortName(a) < M.shortName(b) ? -1 : 1; });
    var ad = [];
    if (ads.length) ad.push({ id: 'AD 1.3', no: 'AD 1.3', title: 'INDEX TO AERODROMES AND HELIPORTS', build: function () {
      return { id: 'AD 1.3', no: 'AD 1.3', title: 'INDEX TO AERODROMES AND HELIPORTS', blocks: [table('', ['Aerodrome / heliport', 'Location indicator', 'Type', 'Runways', 'Effective', 'AIP'], ads.map(function (a) {
        var rw = owned(ds, a, ['Runway']).map(function (r) { return s(r.cur.p.designator); }).join(', ');
        return [C(s(a.cur.p.name), a, 'name'), C(M.shortName(a), a, has(a, ['locationIndicatorICAO', 'designator'])), C(s(a.cur.p.type), a, 'type'), C(rw), C(M.fmtDate(M.adEffective(ds, a))), C(isHeliport(a) ? 'AD 3' : 'AD 2')];
      }))] };
    } });
    ads.forEach(function (a) {
      ad.push({ id: 'AD:' + a.i, no: (isHeliport(a) ? 'AD 3 ' : 'AD 2 ') + M.shortName(a), title: s(a.cur.p.name), ad: a, children: adSections(ds, a) });
    });
    return [
      { id: 'GEN', title: 'GEN — General', children: gen },
      { id: 'ENR', title: 'ENR — En-route', children: enr },
      { id: 'AD', title: 'AD — Aerodromes', children: ad }
    ];
  }
  function findSection(ds, id) {
    var cat = ds.catalogue || (ds.catalogue = catalogue(ds));
    var found = null;
    (function walk(list) {
      list.forEach(function (x) { if (found) return; if (x.id === id) found = x; else if (x.children) walk(x.children); });
    })(cat);
    return found;
  }
  function build(ds, item) {
    if (!item) return null;
    if (item.children && item.ad) { // whole aerodrome = all its subsections
      return { id: item.id, no: item.no, title: item.title, group: item.children.map(function (c) { return c.build(); }), ad: item.ad };
    }
    if (item.children) return { id: item.id, no: '', title: item.title, group: item.children.map(function (c) { return c.children ? build(ds, c) : c.build(); }) };
    var sec = item.build();
    return sec;
  }

  /* ------------------------------------------- AIP section of a feature */
  var AD_SUB = {
    AirportHeliport: 2, PassengerService: 5, AircraftGroundService: 4, AirportSuppliesService: 4, FireFightingService: 6, AirportClearanceService: 7,
    Apron: 8, ApronElement: 8, Taxiway: 8, TaxiwayElement: 8, CheckpointINS: 8, CheckpointVOR: 8, AltimeterCheckpoint: 8,
    AircraftStand: 9, StandMarking: 9, GuidanceLine: 9, GuidanceLineMarking: 9, GuidanceLineLightSystem: 9, TaxiHoldingPosition: 9, TaxiHoldingPositionMarking: 9,
    TaxiHoldingPositionLightSystem: 9, TaxiwayMarking: 9, RunwayMarking: 9, ApronMarking: 9, AirportSign: 9, DeicingArea: 9, DeicingAreaMarking: 9, AirportHotSpot: 9,
    AirportProtectionAreaMarking: 9, TouchDownLiftOffMarking: 9, Road: 9, WorkArea: 9, NonMovementArea: 9, PassengerLoadingBridge: 9, Gangway: 9,
    ObstacleArea: 10, VerticalStructure: 10, WeatherSource: 11, RunwayVisualRange: 11, RunwayVisualRangeEquipment: 11,
    Runway: 12, RunwayDirection: 12, RunwayElement: 12, RunwayProtectArea: 12, RunwayBlastPad: 12, ArrestingGear: 12, RunwayCentrelinePoint: 12,
    ApproachLightingSystem: 14, RunwayDirectionLightSystem: 14, VisualGlideSlopeIndicator: 14, RunwayProtectAreaLightSystem: 14,
    AeronauticalGroundLight: 15, TaxiwayLightSystem: 15, ApronLightSystem: 15, PilotControlledLighting: 15,
    TouchDownLiftOff: 16, TouchDownLiftOffSafeArea: 16, TouchDownLiftOffLightSystem: 16, Airspace: 17,
    AirTrafficControlService: 18, InformationService: 18, GroundTrafficControlService: 18, RadioCommunicationChannel: 18, Unit: 18, SearchRescueService: 18,
    Navaid: 19, Localizer: 19, Glidepath: 19, MarkerBeacon: 19, DME: 19, VOR: 19, NDB: 19, TACAN: 19, RulesProcedures: 20,
    StandardInstrumentDeparture: 22, StandardInstrumentArrival: 22, InstrumentApproachProcedure: 22, HoldingPattern: 22, DepartureLeg: 22, ArrivalLeg: 22, ArrivalFeederLeg: 22, InitialLeg: 22, IntermediateLeg: 22, FinalLeg: 22, MissedApproachLeg: 22, SafeAltitudeArea: 22, TerminalArrivalArea: 22
  };
  var ENR_OF = { Route: 'ENR 3', RouteSegment: 'ENR 3', HoldingPattern: 'ENR 3.4', Navaid: 'ENR 4.1', VOR: 'ENR 4.1', DME: 'ENR 4.1', NDB: 'ENR 4.1', TACAN: 'ENR 4.1',
    DesignatedPoint: 'ENR 4.4', AeronauticalGroundLight: 'ENR 4.5', VerticalStructure: 'ENR 5.4', ObstacleArea: 'ENR 5.4', OrganisationAuthority: 'GEN 1.1', Unit: 'GEN 3.3',
    RadioCommunicationChannel: 'GEN 3.4', SearchRescueService: 'GEN 3.6', InformationService: 'GEN 3.1', RulesProcedures: 'ENR 1', SpecialNavigationSystem: 'ENR 4.2',
    SpecialNavigationStation: 'ENR 4.2', SpecialDate: 'GEN 2.1', SatelliteSystem: 'ENR 4.3', GBAS: 'ENR 4.3', GeoBorder: 'ENR 2', SignificantPointInAirspace: 'ENR 4.4' };
  function sectionOf(ds, r) {
    var ad = r.k === 'AirportHeliport' ? r : ds.owner.get(r) || (ds.goneOwner && ds.goneOwner.get(r));
    if (ad) {
      var n = AD_SUB[r.k] || 23;
      if (r.k === 'RunwayCentrelinePoint' && r.cur.p.associatedDeclaredDistance && s(arr(r.cur.p.associatedDeclaredDistance)[0] && arr(r.cur.p.associatedDeclaredDistance)[0].type)) n = 13;
      if (r.k === 'Runway' && s(r.cur.p.type) === 'FATO') n = 16;
      if (isHeliport(ad)) { for (var k in AD3_MAP) if (AD3_MAP[k] === n) return { no: 'AD 3.' + k, id: 'AD3.' + k + ':' + ad.i, ad: ad }; }
      return { no: 'AD 2.' + n, id: 'AD2.' + n + ':' + ad.i, ad: ad };
    }
    if (r.k === 'Airspace') { var g = airspaceGroupOf(s(r.cur.p.type)); return { no: g, id: g }; }
    if (r.k === 'Route' || r.k === 'RouteSegment') {
      var rnav = r.k === 'RouteSegment' ? /RNAV|RNP/.test(s(r.cur.p.navigationType)) : (ds.rev.get(r) || []).some(function (x) { return x[1].k === 'RouteSegment' && /RNAV|RNP/.test(s(x[1].cur.p.navigationType)); });
      return { no: rnav ? 'ENR 3.2' : 'ENR 3.1', id: rnav ? 'ENR 3.2' : 'ENR 3.1' };
    }
    var e = ENR_OF[r.k];
    if (e) return { no: e, id: e };
    return { no: 'Other', id: null };
  }

  return { procLegs: procLegs, LEG_KINDS: LEG_KINDS, catalogue: catalogue, findSection: findSection, build: build, sectionOf: sectionOf, lateral: lateral, vertical: vertical, airspaceClass: airspaceClass,
    AD2_TITLES: AD2_TITLES, isHeliport: isHeliport, pcn: pcn, surface: surface, C: C, directions: directions,
    // used by the airport chart (adchart.js): declared distances, magnetic variation text, AD 2.n blocks of one aerodrome
    declared: declared, magVar: magVar, adBlocks: function (ds, ad, n) { return AD2[n] ? AD2[n](ds, ad) : []; },
    // used by the custom data export (extract.js)
    adSection: adSection, AD3_MAP: AD3_MAP, airspaceGroupOf: airspaceGroupOf, airspaceTable: airspaceTable, restrictedTable: restrictedTable };
})();
