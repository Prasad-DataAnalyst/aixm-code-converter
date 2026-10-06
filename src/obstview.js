/*!
 * AIXM Code Converter
 * Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com> - author of the AIXM Code Converter
 * SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE; keep this notice in all copies)
 * ==========================================================================
 * AIXM Code Converter - obstacle workspace (OBSTVIEW)
 * Obstacle data sets (eTOD: AIXM obstacle data sets, Excel / CSV obstacle tables, vertical structures of aerodrome
 * mapping files) are used differently from the AIP data set: by obstacle, by area and by aerodrome. This workspace
 * works on every obstacle of the data sets loaded:
 *   overview     per aerodrome and eTOD area: count, lit / marked, tallest, highest, originator, validity
 *   list         every obstacle with position, elevation, height, lighting, marking, accuracies, distance and
 *                bearing from the aerodrome reference point, Annex 14 surface penetration; filter, sort, unit, DMS
 *   compliance   PANS-AIM Appendix 1 (Table A1-6) numerical requirements of the area (accuracy), the attributes an
 *                obstacle must give, duplicates, positions outside the obstacle area, implausible values
 *   statistics   by type, by height class, by distance from the aerodrome, tallest obstacles
 *   reports      obstacle list (ICAO ENR 5.4 / AD 2.10 columns), compliance report, statistics: PDF, print, Excel,
 *                CSV, GeoJSON, KML; only the filtered obstacles if wished
 *   analysis     obstacles chosen in the list or on the map (or those affecting flight paths) studied one by one
 *                (study.js): terrain under and around, base check, Annex 14 surface margin, runway position, flight
 *                paths within 3 NM with the clearance against an indicative MOC, marking / lighting, eTOD accuracy,
 *                with a map picture of each; PDF, print, Excel
 *   flight paths every obstacle within 1 NM of a procedure leg whose altitude clears its top by less than 1.5 x the
 *                indicative MOC of the leg is flagged (list column and filter, compliance check)
 * Nothing here changes the data or the AIXM views.
 * ========================================================================== */
/* global AX, MODEL, EXPORTS, CONVERT, OLS, DDMAP, STUDY */
var OBSTVIEW = (function () {
  'use strict';
  var M = MODEL, arr = AX.arr, s = M.s;
  var UNIT = { M: 1, FT: 0.3048, KM: 1000, NM: 1852, MI: 1609.344, CM: 0.01 };
  function toM(q) {
    q = Array.isArray(q) ? q[0] : q;
    if (!q || q.v === undefined || q.v === null || q.v === '') return null;
    var v = parseFloat(q.v), f = UNIT[String(q.u || 'M').toUpperCase()];
    return isNaN(v) ? null : v * (f || 1);
  }
  function esc(t) { return String(t === undefined || t === null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(n, d) { return n === null || n === undefined || isNaN(n) ? '' : Number(n).toLocaleString('en-US', { maximumFractionDigits: d === undefined ? 1 : d, minimumFractionDigits: 0 }); }

  /* ------------------------------------------------------------ eTOD areas */
  // PANS-AIM Appendix 1, Table A1-6 (obstacle data numerical requirements): accuracy in metres, integrity
  var AREAS = {
    '1': { name: 'Area 1', h: 50, v: 30, integ: 'routine', note: 'entire territory of the State' },
    '2': { name: 'Area 2', h: 5, v: 3, integ: 'essential', note: 'terminal control area (2a runway strip, 2b approach / take-off, 2c within 10 km, 2d within the TMA or 45 km)' },
    '3': { name: 'Area 3', h: 0.5, v: 0.5, integ: 'essential', note: 'aerodrome / heliport movement area' },
    '4': { name: 'Area 4', h: 2.5, v: 1, integ: 'essential', note: 'precision approach CAT II / III radio altimeter area' }
  };
  // area code of a text: "AREA2D", "OTHER:AREA_2A", "eTOD area: 2b", "AERA1" (file names) -> {key: '2', sub: '2d'}
  function areaOf(t) {
    var m = /A(?:R|ER)E?A[\s_:-]*([1-4])\s*([A-D])?\b/i.exec(String(t || '').replace(/AERA/i, 'AREA')) || /\barea\s*:?\s*([1-4])\s*([a-d])?\b/i.exec(String(t || ''));
    return m ? { key: m[1], sub: m[1] + (m[2] ? m[2].toLowerCase() : '') } : null;
  }

  /* ----------------------------------------------------------------- model */
  function ADS(datasets) {
    var out = [];
    datasets.forEach(function (d) { (d.byType.AirportHeliport || []).forEach(function (a) { var c = M.pointOf(d, a); if (c) out.push({ ds: d, r: a, c: c, icao: s(a.cur.p.locationIndicatorICAO), name: s(a.cur.p.name) }); }); });
    return out;
  }
  function byUuid(datasets, ref) {
    var id = ref && (ref.ref || ref);
    if (!id) return null;
    for (var i = 0; i < datasets.length; i++) { var t = M.target(datasets[i], id); if (t) return { ds: datasets[i], r: t }; }
    return null;
  }
  // the obstacles of one data set, as rows; aerodrome reference: obstacle area -> aerodrome, the feature's own
  // aerodrome, an ICAO code in the file name or title, or the nearest aerodrome loaded (within 30 NM)
  function build(ds, datasets, ads) {
    var areas = (ds.byType.ObstacleArea || []).map(function (oa) {
      var p = oa.cur.p, g = M.findGeo(p.surfaceExtent || p, ['A'], 0), own = byUuid(datasets, p.reference_ownerAirport);
      return { r: oa, type: s(p.type), area: areaOf(s(p.type)), ring: g && g.c && g.c[0], own: own, ownRef: p.reference_ownerAirport && (p.reference_ownerAirport.ref || '') };
    });
    var title = (ds.sniff && ds.sniff.title) || '', fileArea = areaOf(ds.name) || areaOf(title), area = (areas.filter(function (a) { return a.area; })[0] || {}).area || fileArea;
    var codeM = /(?:^|[_\s-])([A-Z]{4})(?=[_\s-])/.exec(ds.name.toUpperCase() + '_') || /\(([A-Z]{4})\)/.exec(title);
    var ad = null, adWhy = '';
    var own = areas.filter(function (a) { return a.own; })[0];
    if (own) { ad = { ds: own.own.ds, r: own.own.r, c: M.pointOf(own.own.ds, own.own.r), icao: s(own.own.r.cur.p.locationIndicatorICAO), name: s(own.own.r.cur.p.name) }; adWhy = 'obstacle area of the aerodrome'; }
    if (!ad && codeM) { ad = ads.filter(function (a) { return a.icao === codeM[1]; })[0] || null; if (ad) adWhy = 'location indicator ' + codeM[1] + ' in the ' + (/\(/.test(codeM[0]) ? 'title' : 'file name'); }
    var rows = (ds.byType.VerticalStructure || []).map(function (r) { return row(ds, r, area); });
    if (!ad) {
      // own aerodrome of the features (AIP data set with its obstacles), else the nearest aerodrome loaded
      var o = rows.map(function (x) { return ds.owner && ds.owner.get(x.r); }).filter(Boolean)[0];
      if (o) { ad = { ds: ds, r: o, c: M.pointOf(ds, o), icao: s(o.cur.p.locationIndicatorICAO), name: s(o.cur.p.name) }; adWhy = 'aerodrome of the obstacles in the data set'; }
    }
    if (!ad && rows.length) {
      var lat = 0, lon = 0, n = 0;
      rows.forEach(function (x) { if (x.c) { lon += x.c[0]; lat += x.c[1]; n++; } });
      if (n) {
        var mid = [lon / n, lat / n], best = null, bd = 30;
        ads.forEach(function (a) { var d = AX.distNM(mid, a.c); if (d < bd) { bd = d; best = a; } });
        if (best) { ad = best; adWhy = 'nearest aerodrome loaded (' + num(bd) + ' NM)'; }
      }
    }
    var adCode = ad ? ad.icao : codeM ? codeM[1] : '';
    // the area of each obstacle: its own (table column), else the most demanding obstacle area polygon it is in
    // (smallest required accuracy), else the area of the data set
    // polygons: the obstacle areas of this data set and of the other data loaded (e.g. the AIP data set's areas)
    // order: the obstacle's own area, a polygon of this data set, the area the data set declares, a polygon of the
    // other data loaded
    var ring3 = function (a) { return a.area && a.ring && a.ring.length > 2; };
    var ownPolys = areas.filter(ring3), other = otherAreas(ds, datasets).filter(ring3);
    function inPoly(list, c) {
      var best = null;
      list.forEach(function (a) { if (inRing(c, a.ring) && (!best || AREAS[a.area.key].h < AREAS[best.key].h)) best = a.area; });
      return best;
    }
    rows.forEach(function (x) {
      if (ad && ad.c && x.c) { x.dist = AX.distNM(ad.c, x.c); x.brg = AX.bearing(ad.c, x.c); }
      if (x.area) return;
      var a1 = x.c && ownPolys.length ? inPoly(ownPolys, x.c) : null;
      if (a1) { x.area = a1.sub; return; }
      if (area) { x.area = area.sub; return; }
      var a2 = x.c && other.length ? inPoly(other, x.c) : null;
      if (a2) x.area = a2.sub;
    });
    var subs = rows.map(function (x) { return x.area; }).filter(function (v, i, a) { return v && a.indexOf(v) === i; }).sort();
    if (subs.length > 1) area = { key: subs.map(function (v) { return v.charAt(0); }).sort(function (a, b) { return AREAS[a].h - AREAS[b].h; })[0], sub: subs.join(', '), several: subs };
    var orgs = {};
    (function walk(o, d) {
      if (!o || typeof o !== 'object' || d > 9) return;
      if (o.organisationName) { var n0 = s(o.organisationName); if (n0) orgs[n0] = 1; }
      for (var k in o) if (k !== 'part' && o[k] && typeof o[k] === 'object') walk(o[k], d + 1);
    })(((ds.byType.VerticalStructure || [])[0] || { cur: { p: {} } }).cur.p.timeSliceMetadata, 0);
    return { ds: ds, rows: rows, areas: areas, area: area, ad: ad, adWhy: adWhy, adCode: adCode, originators: Object.keys(orgs), title: title };
  }
  function otherAreas(ds, datasets) {
    var out = [];
    datasets.forEach(function (d) {
      if (d === ds) return;
      (d.byType.ObstacleArea || []).forEach(function (oa) { var p = oa.cur.p, g = M.findGeo(p.surfaceExtent || p, ['A'], 0); out.push({ r: oa, type: s(p.type), area: areaOf(s(p.type)), ring: g && g.c && g.c[0], from: d }); });
    });
    return out;
  }
  function row(ds, r, area) {
    var p = r.cur.p, parts = arr(p.part), part = parts[0] || {};
    var hp = arr(part.horizontalProjection_location || part.horizontalProjection_surface || part.horizontalProjection_curve)[0] || {};
    var notes = arr(p.annotation).map(function (a) { return s(a && a.translatedNote && a.translatedNote.note); }).filter(Boolean);
    var ar = null;
    notes.forEach(function (n) { if (!ar && /^eTOD area:/i.test(n)) { var a = areaOf('area ' + n.replace(/^eTOD area:\s*/i, '')); if (a) ar = a.sub; } });
    var lightTxt = parts.map(function (q) { var l = arr(q.lighting)[0]; return l ? [s(l.colour), s(l.type), s(l.intensityLevel), l._descr || ''].filter(Boolean).join(' ') : ''; }).filter(Boolean).join('; ');
    var markTxt = parts.map(function (q) { return [s(q.markingPattern), s(q.markingFirstColour), s(q.markingSecondColour)].filter(Boolean).join(' '); }).filter(Boolean).join('; ');
    var c = M.pointOf(ds, r), g = M.geometry(ds, r);
    var hgt = null;
    parts.forEach(function (q) { var h = toM(q.verticalExtent); if (h !== null && (hgt === null || h > hgt)) hgt = h; });
    var elev = null;
    parts.forEach(function (q) { var l = arr(q.horizontalProjection_location || q.horizontalProjection_surface || q.horizontalProjection_curve)[0]; var e = l ? toM(l.elevation) : null; if (e !== null && (elev === null || e > elev)) elev = e; });
    return {
      ds: ds, r: r, c: c, geom: g ? g.t : '', id: s(part.designator) || s(p.designator) || '', name: s(p.name), type: s(p.type) || s(part.type),
      elev: elev, hgt: hgt, eU: (hp.elevation && hp.elevation.u) || '', hU: (part.verticalExtent && part.verticalExtent.u) || '',
      lighted: s(p.lighted), marked: s(p.markingICAOStandard), lightTxt: lightTxt, markTxt: markTxt, group: s(p.group),
      hAcc: toM(hp.horizontalAccuracy), vAcc: toM(hp.verticalAccuracy) !== null ? toM(hp.verticalAccuracy) : toM(part.verticalExtentAccuracy), vDatum: s(hp.verticalDatum),
      status: s(part.constructionStatus), frangible: s(part.frangible), mobile: s(part.mobile), material: s(part.visibleMaterial), parts: parts.length,
      from: r.cur.b || '', to: r.cur.e || '', area: ar, notes: notes, dist: null, brg: null, pen: null, fp: null
    };
  }
  // all obstacle data sets of the loaded data (and the obstacles of AIP / aerodrome mapping data sets)
  function model(datasets) {
    var ads = ADS(datasets);
    var sets = datasets.filter(function (d) { return (d.byType.VerticalStructure || []).length; }).map(function (d) { return build(d, datasets, ads); });
    // Annex 14 surfaces: obstacles of every set against the surfaces of its aerodrome (when its runways are loaded)
    sets.forEach(function (st) {
      if (!st.ad || typeof OLS === 'undefined') return;
      var res = null;
      try { res = OLS.check(st.ad.ds, st.ad.r, [st.ds]); } catch (e) { res = null; }
      st.ols = res;
      if (!res) return;
      var by = new Map();
      res.list.forEach(function (x) { by.set(x.rec, x); });
      st.rows.forEach(function (x) { var hit = by.get(x.r); x.pen = hit ? { m: hit.pen, surface: hit.surface } : null; });
    });
    // flight paths: procedure legs within 1 NM of each obstacle, with the clearance of the leg altitude over its top
    var segs = typeof STUDY !== 'undefined' ? STUDY.segments(datasets) : [];
    if (segs.length) flagPaths(sets, segs);
    return { sets: sets, ads: ads, segs: segs };
  }
  function flagPaths(sets, segs) {
    var W = 1 / 60; // 1 NM in degrees of latitude
    var boxes = segs.map(function (sg) {
      var b = [180, 90, -180, -90];
      sg.coords.forEach(function (q) { if (typeof q[0] !== 'number') return; b[0] = Math.min(b[0], q[0]); b[1] = Math.min(b[1], q[1]); b[2] = Math.max(b[2], q[0]); b[3] = Math.max(b[3], q[1]); });
      var k = W / Math.max(0.2, Math.cos(Math.max(Math.abs(b[1]), Math.abs(b[3])) * Math.PI / 180));
      return [b[0] - k, b[1] - W, b[2] + k, b[3] + W];
    });
    sets.forEach(function (st) {
      st.rows.forEach(function (x) {
        if (!x.c || x.elev === null) return;
        for (var i = 0; i < segs.length; i++) {
          var bb = boxes[i], sg = segs[i];
          if (sg.alt === null || x.c[0] < bb[0] || x.c[0] > bb[2] || x.c[1] < bb[1] || x.c[1] > bb[3]) continue;
          var n = STUDY.nearOnLine(x.c, sg.coords);
          if (!n || n.d > 1) continue;
          var clr = sg.alt - x.elev, sev = clr < 0 ? 'error' : clr < sg.moc ? 'warning' : clr < sg.moc * 1.5 ? 'caution' : null;
          if (sev && (!x.fp || clr < x.fp.clr)) x.fp = { seg: sg, d: n.d, clr: clr, sev: sev };
        }
      });
    });
  }

  /* ------------------------------------------------------------ compliance */
  // -> [{sev, check, msg, row}] for one set; required: the accuracy of its eTOD area
  function compliance(st) {
    var out = [], req = st.area ? AREAS[st.area.key] : null, seen = new Map();
    function add(sev, check, msg, x) { out.push({ sev: sev, check: check, msg: msg, row: x }); }
    st.rows.forEach(function (x) {
      var rq = (x.area && AREAS[x.area.charAt(0)]) || req;
      if (!x.c) add('error', 'Position', 'No position', x);
      if (!x.id && !x.name) add('error', 'Identifier', 'No identifier or name', x);
      if (!x.type || /^OTHER$/.test(x.type)) add('warning', 'Type', 'Type not given', x);
      if (x.elev === null) add('error', 'Elevation', 'No elevation (top of the obstacle, AMSL)', x);
      if (x.hgt === null) add('warning', 'Height', 'No height above ground', x);
      if (!x.lighted) add('warning', 'Lighting', 'Lighting not stated (lighted YES / NO)', x);
      if (!x.marked) add('info', 'Marking', 'Marking not stated', x);
      if (!x.vDatum) add('info', 'Vertical datum', 'Vertical datum not given (EGM-96 expected)', x);
      if (x.hAcc === null) add('warning', 'Horizontal accuracy', 'Horizontal accuracy not given', x);
      else if (rq && x.hAcc > rq.h + 1e-6) add('error', 'Horizontal accuracy', 'Horizontal accuracy ' + num(x.hAcc, 2) + ' m — ' + rq.name + ' requires ' + rq.h + ' m', x);
      if (x.vAcc === null) add('warning', 'Vertical accuracy', 'Vertical accuracy not given', x);
      else if (rq && x.vAcc > rq.v + 1e-6) add('error', 'Vertical accuracy', 'Vertical accuracy ' + num(x.vAcc, 2) + ' m — ' + rq.name + ' requires ' + rq.v + ' m', x);
      if (x.elev !== null && x.hgt !== null) {
        var gnd = x.elev - x.hgt;
        if (gnd < -60 || gnd > 6000) add('warning', 'Plausibility', 'Ground elevation (elevation − height) ' + num(gnd) + ' m is implausible: elevation and height may be swapped or in different units', x);
      }
      if (x.hgt !== null && x.hgt > 1000) add('warning', 'Plausibility', 'Height ' + num(x.hgt) + ' m is implausible', x);
      if (x.c) {
        var k = x.c[0].toFixed(5) + ',' + x.c[1].toFixed(5);
        if (seen.has(k)) add('warning', 'Duplicate', 'Same position as ' + (seen.get(k).id || seen.get(k).name), x); else seen.set(k, x);
      }
      if (x.to && Date.parse(x.to) < Date.now()) add('info', 'Validity', 'Validity ended ' + x.to.slice(0, 10), x);
    });
    // outside the obstacle area that the data set covers
    st.areas.forEach(function (a) {
      if (!a.ring || a.ring.length < 3) return;
      st.rows.forEach(function (x) { if (x.c && !inRing(x.c, a.ring)) add('warning', 'Coverage', 'Outside the obstacle area (' + a.type.replace(/^OTHER:/, '') + ')', x); });
    });
    st.rows.forEach(function (x) { if (x.pen) add('error', 'Annex 14 surfaces', 'Penetrates the ' + x.pen.surface + ' by ' + num(x.pen.m) + ' m', x); });
    st.rows.forEach(function (x) { if (x.fp) add(x.fp.sev === 'caution' ? 'info' : x.fp.sev, 'Flight paths', fpText(x.fp), x); });
    return out;
  }
  function inRing(pt, ring) {
    var x = pt[0], y = pt[1], inside = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if (typeof xi !== 'number' || typeof xj !== 'number') continue;
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }

  function fpText(f) {
    return f.seg.label + ' (' + (f.seg.altTxt || '') + ') ' + (f.clr < 0 ? 'is ' + num(-f.clr) + ' m BELOW the top' : 'clears the top by ' + num(f.clr) + ' m') + ' at ' + num(f.d, 2) + ' NM from the path — indicative MOC ' + f.seg.moc + ' m (' + f.seg.phase + ')';
  }

  /* ------------------------------------------------------------- formatting */
  function len(m, u, d) { if (m === null || m === undefined) return ''; return u === 'FT' ? num(m / 0.3048, d === undefined ? 0 : d) + ' ft' : num(m, d === undefined ? 1 : d) + ' m'; }
  function pos(c, fmt) { if (!c) return ''; return fmt === 'dd' ? c[1].toFixed(6) + ', ' + c[0].toFixed(6) : AX.dms(c[1], false, 2) + ' ' + AX.dms(c[0], true, 2); }
  function typeTxt(t) { return String(t || '').replace(/^OTHER:/, '').replace(/_/g, ' '); }
  function yn(v) { return v === 'YES' ? 'Yes' : v === 'NO' ? 'No' : v ? v : '—'; }

  /* ------------------------------------------------------------------ view */
  var V = { layout: 'split', tab: 'list', unit: 'M', fmt: 'dms', q: '', type: '', lit: '', minH: '', only: '', sort: 'hgt', dir: -1, sel: null, shown: 300, picked: new Set(), pickMode: false, anaScope: '' };
  function render(host, ctx) {
    var mdl = model(ctx.datasets);
    if (!mdl.sets.length) { host.innerHTML = '<h1 class="view-title">Obstacles</h1><div class="card card-pad muted">No obstacle data loaded. Add an AIXM obstacle data set, an eTOD obstacle table (Excel / CSV) or an aerodrome mapping file.</div>'; return; }
    if (V.sel === null || (V.sel === 'all' ? mdl.sets.length < 2 : !mdl.sets.some(function (x) { return x.ds === V.sel; }))) V.sel = (mdl.sets.filter(function (x) { return x.ds === ctx.active; })[0] || mdl.sets[0]).ds;
    var st = V.sel === 'all' ? null : mdl.sets.filter(function (x) { return x.ds === V.sel; })[0];
    var sets = st ? [st] : mdl.sets;
    var rows = [].concat.apply([], sets.map(function (x) { return x.rows; }));
    var issues = [].concat.apply([], sets.map(compliance));
    var h = '<h1 class="view-title">Obstacles <span class="muted" style="font-weight:400">— electronic obstacle data (eTOD)</span></h1>' +
      '<p class="view-sub">Every obstacle of the data loaded: by aerodrome and eTOD area, with the PANS-AIM requirements of the area, the Annex 14 surfaces and reports. The AIXM views are not changed.</p>' +
      '<div class="ov-sets" role="tablist">' + mdl.sets.map(function (x) {
        return '<button class="ov-set' + (x === st ? ' on' : '') + '" data-ovset="' + ctx.datasets.indexOf(x.ds) + '"><b>' + esc(x.adCode || x.ds.state) + (x.area ? ' · ' + areaLabel(x.area) : '') + '</b><span>' + esc(x.ds.name) + ' · ' + num(x.rows.length, 0) + '</span></button>';
      }).join('') + (mdl.sets.length > 1 ? '<button class="ov-set' + (!st ? ' on' : '') + '" data-ovset="all"><b>All</b><span>' + mdl.sets.length + ' data sets · ' + num(rows.length, 0) + '</span></button>' : '') + '</div>';
    h += overviewHtml(sets, rows, issues);
    var tabs = [['list', 'Obstacle list'], ['comp', 'eTOD compliance'], ['stats', 'Statistics'], ['report', 'Reports']];
    h += '<div class="pill-tabs ov-tabs">' + tabs.map(function (t) { return '<button data-ovtab="' + t[0] + '" class="' + (V.tab === t[0] ? 'active' : '') + '">' + t[1] + (t[0] === 'comp' ? ' <span class="chip ' + (issues.some(function (i) { return i.sev === 'error'; }) ? 'err' : 'ok') + '">' + num(issues.filter(function (i) { return i.sev !== 'info'; }).length, 0) + '</span>' : '') + '</button>'; }).join('') + '</div>';
    h += '<div class="ov-body">' + (V.tab === 'list' ? listHtml(rows, issues) : V.tab === 'comp' ? compHtml(sets, issues) : V.tab === 'stats' ? statsHtml(sets, rows) : reportHtml(sets, rows)) + '</div>';
    host.innerHTML = h;
    // the workspace map: the obstacles of the list (filter applied), linked both ways with the rows
    var mapEl = host.querySelector('.ov-map'), mm = null;
    if (mapEl && typeof DDMAP !== 'undefined') {
      var shown = filtered(rows, issues), bad = new Set(issues.filter(function (i) { return i.sev === 'error' && i.check !== 'Annex 14 surfaces'; }).map(function (i) { return i.row; }));
      var withAd = sets.filter(function (x) { return x.ad && x.ad.c; })[0];
      mm = DDMAP.create(mapEl, 'obs:' + (st ? ctx.datasets.indexOf(st.ds) : 'all'));
      DDMAP.obstacles(mm, shown, { bad: bad, unit: V.unit, areas: [].concat.apply([], sets.map(function (x) { return x.areas; })), arp: withAd ? withAd.ad.c : null, arpLabel: withAd ? 'ARP ' + withAd.ad.icao + ' · rings 2, 5, 10 NM' : '',
        picked: V.picked, pickMode: function () { return V.pickMode; }, onToggle: function (x) { togglePick(x); syncPick(host, rows); },
        paths: mdl.segs.slice(0, 800).map(function (sg) { return { coords: sg.coords, color: { SID: '#2e7d32', STAR: '#1565c0', IAP: '#b0186e' }[sg.kind], dashed: sg.dashed, label: sg.label + (sg.altTxt ? ' · ' + sg.altTxt : '') }; }),
        onPick: function (x) {
          var tr = host.querySelector('tr[data-ovi="' + rows.indexOf(x) + '"]');
          host.querySelectorAll('tr.ov-sel').forEach(function (n) { n.classList.remove('ov-sel'); });
          if (tr) { tr.classList.add('ov-sel'); tr.scrollIntoView({ block: 'nearest' }); }
        } });
      setTimeout(function () { if (mm) mm.map.invalidateSize(); }, 60);
    }
    host.onclick = function (e) {
      var pk = e.target.closest('[data-ovpick],[data-ovpickall],[data-ovpickclear],[data-ovpickmode],[data-ovana]');
      if (pk) {
        if (pk.hasAttribute('data-ovpick')) { var px = rowsAt(rows, pk); if (px) togglePick(px, pk.checked); syncPick(host, rows, mm); }
        else if (pk.hasAttribute('data-ovpickall')) { filtered(rows, issues).forEach(function (y) { togglePick(y, pk.checked); }); syncPick(host, rows, mm); }
        else if (pk.hasAttribute('data-ovpickclear')) { V.picked.clear(); syncPick(host, rows, mm); }
        else if (pk.hasAttribute('data-ovpickmode')) V.pickMode = pk.checked;
        else { var a = pk.getAttribute('data-ovana').split(':'); analysis(a[0], a[1], sets, rows, issues, ctx, host, mdl.segs); }
        return;
      }
      var lb = e.target.closest('[data-ovlayout],[data-ovmainmap]');
      if (lb && lb.hasAttribute('data-ovlayout')) { V.layout = lb.getAttribute('data-ovlayout'); render(host, ctx); return; }
      if (lb) { var f0 = filtered(rows, issues)[0]; if (f0) ctx.showOnMap(f0.ds, f0.r); return; }
      var b = e.target.closest('[data-ovset],[data-ovtab],[data-ovsort],[data-ovrow],[data-ovmap],[data-ovxml],[data-ovmore],[data-ovrep],[data-ovcomp]');
      if (!b) return;
      if (b.hasAttribute('data-ovset')) { var v = b.getAttribute('data-ovset'); V.sel = v === 'all' ? 'all' : ctx.datasets[+v]; V.shown = 300; render(host, ctx); return; }
      if (b.hasAttribute('data-ovtab')) { V.tab = b.getAttribute('data-ovtab'); render(host, ctx); return; }
      if (b.hasAttribute('data-ovsort')) { var k = b.getAttribute('data-ovsort'); if (V.sort === k) V.dir = -V.dir; else { V.sort = k; V.dir = k === 'id' || k === 'name' || k === 'type' || k === 'fp' ? 1 : -1; } render(host, ctx); return; }
      if (b.hasAttribute('data-ovmore')) { V.shown += 1000; render(host, ctx); return; }
      if (b.hasAttribute('data-ovcomp')) { V.only = b.getAttribute('data-ovcomp'); V.tab = 'list'; render(host, ctx); return; }
      var x = rowsAt(rows, b);
      if (b.hasAttribute('data-ovmap') && x) {
        if (mm) { DDMAP.select(mm, x); host.querySelectorAll('tr.ov-sel').forEach(function (n) { n.classList.remove('ov-sel'); }); b.closest('tr').classList.add('ov-sel'); mapEl.scrollIntoView({ block: 'nearest' }); } else ctx.showOnMap(x.ds, x.r);
        return;
      }
      if (b.hasAttribute('data-ovxml') && x) { ctx.openXml(x.ds, x.r); return; }
      if (b.hasAttribute('data-ovrow') && x) { ctx.openDetail(x.ds, x.r); return; }
      if (b.hasAttribute('data-ovrep')) report(b.getAttribute('data-ovrep'), sets, ctx);
    };
    host.oninput = host.onchange = function (e) {
      var t = e.target, k = t.getAttribute && t.getAttribute('data-ovf');
      if (!k) return;
      V[k] = t.value; V.shown = 300;
      clearTimeout(host._t);
      host._t = setTimeout(function () { var f = document.activeElement && document.activeElement.getAttribute('data-ovf'); render(host, ctx); if (f) { var n = host.querySelector('[data-ovf="' + f + '"]'); if (n) { n.focus(); if (n.setSelectionRange && n.value) n.setSelectionRange(n.value.length, n.value.length); } } }, e.type === 'input' && t.tagName === 'INPUT' ? 250 : 0);
    };
  }
  function rowsAt(rows, b) { var i = b.closest('[data-ovi]'); return i ? rows[+i.getAttribute('data-ovi')] : null; }
  // obstacles chosen for the analysis report (kept by record across filters and data set changes)
  function togglePick(x, on) { if (on === undefined) on = !V.picked.has(x.r); if (on) V.picked.add(x.r); else V.picked.delete(x.r); }
  function pickedRows(rows) { return rows.filter(function (x) { return V.picked.has(x.r); }); }
  function pickBarHtml(rows) {
    var n = pickedRows(rows).length;
    return '<div class="ov-pickbar"><b>' + num(n, 0) + '</b>&nbsp;chosen for the analysis report' + (n ? ' <span class="btn-group"><button class="btn small primary" data-ovana="sel:pdf">Analysis PDF</button><button class="btn small" data-ovana="sel:print">Print</button><button class="btn small" data-ovana="sel:xlsx">Excel</button></span><button class="btn small ghost" data-ovpickclear>Clear</button>' : ' <span class="muted">— tick obstacles in the list, or Ctrl+click them on the map</span>') +
      '<span class="sp"></span><label class="muted"><input type="checkbox" data-ovpickmode' + (V.pickMode ? ' checked' : '') + '> a click on the map chooses</label><span class="muted ov-anaprog"></span></div>';
  }
  function syncPick(host, rows, mm) {
    var bar = host.querySelector('.ov-pickbar');
    if (bar) bar.outerHTML = pickBarHtml(rows);
    host.querySelectorAll('tr[data-ovi] [data-ovpick]').forEach(function (cb) { var x = rows[+cb.closest('[data-ovi]').getAttribute('data-ovi')]; cb.checked = !!(x && V.picked.has(x.r)); });
    if (mm) DDMAP.picks(mm, V.picked);
  }

  function overviewHtml(sets, rows, issues) {
    var lit = rows.filter(function (x) { return x.lighted === 'YES'; }).length, mk = rows.filter(function (x) { return x.marked === 'YES'; }).length;
    var tall = rows.filter(function (x) { return x.hgt !== null; }).sort(function (a, b) { return b.hgt - a.hgt; })[0];
    var high = rows.filter(function (x) { return x.elev !== null; }).sort(function (a, b) { return b.elev - a.elev; })[0];
    var pen = rows.filter(function (x) { return x.pen; }).length, err = issues.filter(function (i) { return i.sev === 'error'; }), bad = new Set(err.map(function (i) { return i.row; }));
    var h = '<div class="kpis ov-kpis">' +
      kpi(num(rows.length, 0), 'obstacles') + kpi(num(lit, 0), 'lighted') + kpi(num(mk, 0), 'marked') +
      kpi(tall ? len(tall.hgt, V.unit) : '—', 'tallest' + (tall ? ' · ' + esc(tall.id || tall.name) : '')) +
      kpi(high ? len(high.elev, V.unit) : '—', 'highest top AMSL' + (high ? ' · ' + esc(high.id || high.name) : '')) +
      kpi(rows.length ? Math.round(100 * (rows.length - bad.size) / rows.length) + ' %' : '—', 'without errors') +
      (sets.some(function (st) { return st.ols; }) ? kpi(num(pen, 0), 'penetrate Annex 14 surfaces') : '') + '</div>';
    h += '<div class="ov-meta">' + sets.map(function (st) {
      var a = st.area ? AREAS[st.area.key] : null, dates = st.rows.map(function (x) { return x.from; }).filter(Boolean).sort();
      return '<div class="card card-pad ov-card"><div class="ov-card-h"><b>' + esc(st.ad ? st.ad.icao + ' ' + st.ad.name : st.adCode || st.ds.state) + '</b>' + (a ? '<span class="chip brand">' + esc(areaLabel(st.area)) + '</span>' : '<span class="chip">area not stated</span>') + '</div>' +
        '<table class="mini-table">' + [
          ['Data set', st.ds.name + ' · ' + st.ds.state],
          ['Aerodrome', st.ad ? st.ad.icao + ' — ' + st.ad.name + ' (' + st.adWhy + ')' : st.adCode ? st.adCode + ' (load the AIP data set for distances, bearings and the Annex 14 surfaces)' : 'not known — load the AIP data set'],
          ['eTOD area', !a ? 'not stated in the data (obstacle area or file name)' : st.area.several ? areaLabel(st.area) + ' — each obstacle is checked against the area polygon it is in (the most demanding one)' : areaLabel(st.area) + ' — ' + a.note + '. Required accuracy: horizontal ' + a.h + ' m, vertical ' + a.v + ' m; integrity ' + a.integ],
          ['Obstacle area', st.areas.length ? st.areas.map(function (x) { return typeTxt(x.type) + (x.ring ? ' (boundary ' + x.ring.length + ' points)' : ''); }).join('; ') : '—'],
          ['Originator', st.originators.join(', ') || '—'],
          ['Valid from', dates.length ? dates[0].slice(0, 10) + (dates[dates.length - 1] !== dates[0] ? ' … ' + dates[dates.length - 1].slice(0, 10) : '') : '—'],
          ['Annex 14 surfaces', st.ols ? num(st.ols.checked, 0) + ' obstacles within 11 NM checked, ' + num(st.ols.list.length, 0) + ' penetrate' : st.ad ? 'runways of the aerodrome not in the data loaded' : '—']
        ].map(function (r) { return '<tr><td class="muted">' + r[0] + '</td><td>' + esc(r[1]) + '</td></tr>'; }).join('') + '</table></div>';
    }).join('') + '</div>';
    return h;
  }
  function areaLabel(a) { return !a ? '' : a.several ? 'Areas ' + a.several.join(', ') : AREAS[a.key].name + (a.sub.length > 1 ? a.sub.slice(1) : ''); }
  function kpi(v, l) { return '<div class="kpi-h"><b>' + v + '</b><span>' + l + '</span></div>'; }

  function filtered(rows, issues) {
    var q = V.q.trim().toLowerCase(), minH = parseFloat(V.minH), bad = null;
    if (V.only) { bad = new Set(); issues.forEach(function (i) { if (V.only === 'issues' ? i.sev !== 'info' : i.check === V.only) bad.add(i.row); }); }
    var out = rows.filter(function (x) {
      if (q && (x.id + ' ' + x.name + ' ' + x.type + ' ' + x.notes.join(' ')).toLowerCase().indexOf(q) < 0) return false;
      if (V.type && x.type !== V.type) return false;
      if (V.lit && x.lighted !== V.lit) return false;
      if (!isNaN(minH) && !(x.hgt !== null && x.hgt >= (V.unit === 'FT' ? minH * 0.3048 : minH))) return false;
      if (V.only === 'pen' && !x.pen) return false;
      if (V.only === 'fp' && !x.fp) return false;
      if (V.only === 'picked' && !V.picked.has(x.r)) return false;
      if (bad && V.only !== 'pen' && V.only !== 'fp' && V.only !== 'picked' && !bad.has(x)) return false;
      return true;
    });
    var k = V.sort, d = V.dir;
    out.sort(function (a, b) {
      var va = a[k], vb = b[k];
      if (va === null || va === undefined || va === '') return 1;
      if (vb === null || vb === undefined || vb === '') return -1;
      if (k === 'pen') { va = va.m; vb = vb.m; }
      if (k === 'fp') { va = va.clr; vb = vb.clr; }
      return (typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb), 'en', { numeric: true })) * d;
    });
    return out;
  }
  function listHtml(rows, issues) {
    var types = {}; rows.forEach(function (x) { if (x.type) types[x.type] = (types[x.type] || 0) + 1; });
    var list = filtered(rows, issues), iss = new Map();
    issues.forEach(function (i) { if (i.sev === 'info') return; if (!iss.has(i.row)) iss.set(i.row, []); iss.get(i.row).push(i); });
    var hasPen = rows.some(function (x) { return x.pen; }), hasDist = rows.some(function (x) { return x.dist !== null; }), hasFp = rows.some(function (x) { return x.fp; });
    var h = '<div class="toolbar ov-filter"><input class="inp" data-ovf="q" placeholder="Find identifier, name, type…" value="' + esc(V.q) + '">' +
      '<select class="inp" data-ovf="type"><option value="">All types</option>' + Object.keys(types).sort().map(function (t) { return '<option value="' + esc(t) + '"' + (V.type === t ? ' selected' : '') + '>' + esc(typeTxt(t)) + ' (' + types[t] + ')</option>'; }).join('') + '</select>' +
      '<select class="inp" data-ovf="lit"><option value="">Lighted or not</option><option value="YES"' + (V.lit === 'YES' ? ' selected' : '') + '>Lighted</option><option value="NO"' + (V.lit === 'NO' ? ' selected' : '') + '>Not lighted</option></select>' +
      '<input class="inp" data-ovf="minH" style="width:120px" placeholder="height ≥ (' + V.unit.toLowerCase() + ')" value="' + esc(V.minH) + '">' +
      '<select class="inp" data-ovf="only"><option value="">All obstacles</option><option value="issues"' + (V.only === 'issues' ? ' selected' : '') + '>With issues</option>' + (hasPen ? '<option value="pen"' + (V.only === 'pen' ? ' selected' : '') + '>Penetrating the surfaces</option>' : '') +
      (hasFp ? '<option value="fp"' + (V.only === 'fp' ? ' selected' : '') + '>Affecting flight paths</option>' : '') + (V.picked.size ? '<option value="picked"' + (V.only === 'picked' ? ' selected' : '') + '>Chosen for the report</option>' : '') +
      (V.only && ['issues', 'pen', 'fp', 'picked'].indexOf(V.only) < 0 ? '<option value="' + esc(V.only) + '" selected>' + esc(V.only) + '</option>' : '') + '</select>' +
      '<select class="inp" data-ovf="unit"><option value="M"' + (V.unit === 'M' ? ' selected' : '') + '>metres</option><option value="FT"' + (V.unit === 'FT' ? ' selected' : '') + '>feet</option></select>' +
      '<select class="inp" data-ovf="fmt"><option value="dms"' + (V.fmt === 'dms' ? ' selected' : '') + '>DMS</option><option value="dd"' + (V.fmt === 'dd' ? ' selected' : '') + '>decimal °</option></select>' +
      '<span class="muted">' + num(list.length, 0) + ' of ' + num(rows.length, 0) + '</span><span class="sp"></span>' +
      '<span class="pill-tabs ov-lay">' + [['split', 'Map + list'], ['map', 'Map'], ['list', 'List']].map(function (l) { return '<button data-ovlayout="' + l[0] + '" class="' + (V.layout === l[0] ? 'active' : '') + '">' + l[1] + '</button>'; }).join('') + '</span>' +
      '<button class="btn small ghost" data-ovmainmap title="Open the obstacles in the Map tab, with all the other aeronautical data">Map tab ↗</button></div>' + pickBarHtml(rows);
    var cols = [['id', 'Identifier'], ['name', 'Name'], ['type', 'Type'], ['c', 'Position'], ['elev', 'Elevation'], ['hgt', 'Height'], ['lighted', 'Lighted'], ['marked', 'Marked'], ['hAcc', 'H acc'], ['vAcc', 'V acc']];
    var multiArea = rows.some(function (x) { return x.area && x.area !== rows[0].area; });
    if (multiArea) cols.push(['area', 'Area']);
    if (hasDist) cols.push(['dist', 'From ARP']);
    if (hasPen) cols.push(['pen', 'Annex 14']);
    if (hasFp) cols.push(['fp', 'Flight path']);
    var allOn = list.length && list.every(function (x) { return V.picked.has(x.r); });
    h += '<div class="ov-split ov-' + V.layout + '">' + (V.layout !== 'list' ? '<div class="ov-map" role="application" aria-label="Obstacle map"></div>' : '') + '<div class="ov-listcol"><div class="tbl-wrap ov-tbl"><table class="mini-table"><thead><tr><th><input type="checkbox" data-ovpickall title="Choose every obstacle of the list for the analysis report"' + (allOn ? ' checked' : '') + '></th>' + cols.map(function (c) { return '<th class="click" data-ovsort="' + c[0] + '">' + c[1] + (V.sort === c[0] ? (V.dir > 0 ? ' ▲' : ' ▼') : '') + '</th>'; }).join('') + '<th></th></tr></thead><tbody>' +
      list.slice(0, V.shown).map(function (x) {
        var i = rows.indexOf(x), is = iss.get(x);
        return '<tr data-ovi="' + i + '"' + (is ? ' class="ov-bad" title="' + esc(is.map(function (y) { return y.msg; }).join('\n')) + '"' : '') + '><td><input type="checkbox" data-ovpick aria-label="Choose for the analysis report"' + (V.picked.has(x.r) ? ' checked' : '') + '></td><td class="mono click" data-ovrow><b>' + esc(x.id) + '</b></td><td>' + esc(x.name) + '</td><td>' + esc(typeTxt(x.type)) + '</td><td class="mono">' + esc(pos(x.c, V.fmt)) + (x.geom && x.geom !== 'P' ? ' <span class="chip">' + (x.geom === 'A' ? 'area' : 'line') + '</span>' : '') + '</td>' +
          '<td class="num">' + len(x.elev, V.unit) + '</td><td class="num">' + len(x.hgt, V.unit) + '</td><td>' + esc(yn(x.lighted)) + (x.lightTxt ? ' <small class="muted">' + esc(x.lightTxt) + '</small>' : '') + '</td><td>' + esc(yn(x.marked)) + (x.markTxt ? ' <small class="muted">' + esc(x.markTxt) + '</small>' : '') + '</td>' +
          '<td class="num">' + len(x.hAcc, 'M', 2) + '</td><td class="num">' + len(x.vAcc, 'M', 2) + '</td>' +
          (multiArea ? '<td>' + esc(x.area || '') + '</td>' : '') + (hasDist ? '<td class="num">' + (x.dist !== null ? num(x.dist, 2) + ' NM ' + ('00' + Math.round(x.brg)).slice(-3) + '°' : '') + '</td>' : '') +
          (hasPen ? '<td>' + (x.pen ? '<span class="q-err">+' + num(x.pen.m) + ' m ' + esc(x.pen.surface) + '</span>' : '') + '</td>' : '') +
          (hasFp ? '<td>' + (x.fp ? '<span class="sev ' + (x.fp.sev === 'caution' ? 'info' : x.fp.sev) + '" title="' + esc(fpText(x.fp)) + '">' + (x.fp.clr < 0 ? '−' + num(-x.fp.clr, 0) : num(x.fp.clr, 0)) + ' m</span> <small class="muted">' + esc(x.fp.seg.proc) + '</small>' : '') + '</td>' : '') +
          '<td class="nowrap"><button class="btn small ghost" data-ovmap title="Show on the map">🗺</button><button class="btn small ghost" data-ovxml title="Source (AIXM code or table row)">&lt;/&gt;</button></td></tr>';
      }).join('') + '</tbody></table></div>' +
      (list.length > V.shown ? '<button class="btn" data-ovmore>Show ' + num(Math.min(1000, list.length - V.shown), 0) + ' more</button>' : '') + '</div></div>';
    return h;
  }
  function compHtml(sets, issues) {
    var checks = {}, rows = [].concat.apply([], sets.map(function (x) { return x.rows; }));
    issues.forEach(function (i) { var c = checks[i.check] || (checks[i.check] = { sev: i.sev, n: 0, rows: new Set() }); c.n++; c.rows.add(i.row); if (i.sev === 'error') c.sev = 'error'; });
    var h = '<div class="card card-pad"><h3 style="margin-top:0">PANS-AIM requirements of the area</h3><table class="mini-table"><thead><tr><th>Area</th><th>Covers</th><th>Horizontal accuracy</th><th>Vertical accuracy</th><th>Integrity</th><th>In the data</th></tr></thead><tbody>' +
      Object.keys(AREAS).map(function (k) { var a = AREAS[k], n = sets.filter(function (st) { return st.area && st.area.key === k; }).map(function (st) { return st.ds.name; }); return '<tr' + (n.length ? ' class="ov-hl"' : '') + '><td><b>' + a.name + '</b></td><td>' + esc(a.note) + '</td><td>' + a.h + ' m</td><td>' + a.v + ' m</td><td>' + a.integ + '</td><td>' + esc(n.join(', ')) + '</td></tr>'; }).join('') + '</tbody></table>' +
      '<p class="muted" style="margin-bottom:0">ICAO PANS-AIM (Doc 10066) Appendix 1, Table A1-6. The area of a data set comes from its obstacle area (e.g. AREA2D), an "eTOD area" column of a table, or the file name.</p></div>';
    var keys = Object.keys(checks).sort(function (a, b) { return (checks[a].sev === 'error' ? 0 : checks[a].sev === 'warning' ? 1 : 2) - (checks[b].sev === 'error' ? 0 : checks[b].sev === 'warning' ? 1 : 2) || checks[b].n - checks[a].n; });
    h += '<div class="card card-pad"><h3 style="margin-top:0">Checks <span class="muted" style="font-weight:400">— ' + num(rows.length, 0) + ' obstacles</span></h3>' + (keys.length ? '<table class="mini-table"><thead><tr><th>Severity</th><th>Check</th><th>Obstacles</th><th>Share</th><th>Example</th><th></th></tr></thead><tbody>' +
      keys.map(function (k) {
        var c = checks[k], ex = issues.filter(function (i) { return i.check === k; })[0], pct = rows.length ? 100 * c.rows.size / rows.length : 0;
        return '<tr><td><span class="sev ' + c.sev + '">' + c.sev + '</span></td><td><b>' + esc(k) + '</b></td><td class="num">' + num(c.rows.size, 0) + '</td><td><div class="ov-bar"><span style="width:' + pct.toFixed(1) + '%"></span></div> ' + num(pct, 1) + ' %</td><td>' + esc(ex.msg) + (ex.row ? ' — ' + esc(ex.row.id || ex.row.name) : '') + '</td><td><button class="btn small" data-ovcomp="' + esc(k) + '">List</button></td></tr>';
      }).join('') + '</tbody></table>' : '<p>No issue found.</p>') + '</div>';
    // completeness of the attributes an obstacle gives
    var attrs = [['Identifier', function (x) { return x.id; }], ['Name', function (x) { return x.name; }], ['Type', function (x) { return x.type; }], ['Position', function (x) { return x.c; }], ['Elevation', function (x) { return x.elev !== null; }],
      ['Height', function (x) { return x.hgt !== null; }], ['Lighting', function (x) { return x.lighted; }], ['Marking', function (x) { return x.marked; }], ['Horizontal accuracy', function (x) { return x.hAcc !== null; }],
      ['Vertical accuracy', function (x) { return x.vAcc !== null; }], ['Vertical datum', function (x) { return x.vDatum; }], ['Construction status', function (x) { return x.status; }], ['Validity start', function (x) { return x.from; }]];
    h += '<div class="card card-pad"><h3 style="margin-top:0">Attributes given</h3><table class="mini-table"><tbody>' + attrs.map(function (a) {
      var n = rows.filter(function (x) { return a[1](x); }).length, pct = rows.length ? 100 * n / rows.length : 0;
      return '<tr><td>' + a[0] + '</td><td style="width:50%"><div class="ov-bar' + (pct < 100 ? ' part' : '') + '"><span style="width:' + pct.toFixed(1) + '%"></span></div></td><td class="num">' + num(n, 0) + ' / ' + num(rows.length, 0) + '</td></tr>';
    }).join('') + '</tbody></table></div>';
    return h;
  }
  function classes(rows, f, edges, lab) {
    var out = edges.map(function (e, i) { return { l: lab(e, edges[i + 1]), n: 0 }; });
    rows.forEach(function (x) { var v = f(x); if (v === null || v === undefined) return; for (var i = edges.length - 1; i >= 0; i--) if (v >= edges[i]) { out[i].n++; break; } });
    return out;
  }
  function barTable(title, list, total) {
    var max = Math.max.apply(null, list.map(function (x) { return x.n; }).concat([1]));
    return '<div class="card card-pad"><h3 style="margin-top:0">' + title + '</h3><table class="mini-table"><tbody>' + list.map(function (x) {
      return '<tr><td>' + esc(x.l) + '</td><td style="width:55%"><div class="ov-bar"><span style="width:' + (100 * x.n / max).toFixed(1) + '%"></span></div></td><td class="num">' + num(x.n, 0) + '</td><td class="num muted">' + (total ? num(100 * x.n / total, 1) + ' %' : '') + '</td></tr>';
    }).join('') + '</tbody></table></div>';
  }
  function statsData(rows) {
    var types = {};
    rows.forEach(function (x) { var t = typeTxt(x.type) || 'not given'; types[t] = (types[t] || 0) + 1; });
    var ft = V.unit === 'FT', u = ft ? ' ft' : ' m', hEdges = ft ? [0, 50, 100, 150, 300, 500, 1000] : [0, 15, 30, 45, 100, 150, 300];
    return {
      types: Object.keys(types).map(function (k) { return { l: k, n: types[k] }; }).sort(function (a, b) { return b.n - a.n; }),
      heights: classes(rows, function (x) { return x.hgt === null ? null : ft ? x.hgt / 0.3048 : x.hgt; }, hEdges, function (a, b) { return b === undefined ? '≥ ' + a + u : a + ' – ' + b + u; }),
      dist: rows.some(function (x) { return x.dist !== null; }) ? classes(rows, function (x) { return x.dist; }, [0, 1, 2, 5, 10, 25], function (a, b) { return b === undefined ? '≥ ' + a + ' NM' : a + ' – ' + b + ' NM'; }) : null,
      tall: rows.filter(function (x) { return x.hgt !== null; }).sort(function (a, b) { return b.hgt - a.hgt; }).slice(0, 15)
    };
  }
  function statsHtml(sets, rows) {
    var d = statsData(rows);
    var h = '<div class="ov-grid">' + barTable('By type', d.types, rows.length) + barTable('By height above ground', d.heights, rows.length) + (d.dist ? barTable('By distance from the aerodrome reference point', d.dist, rows.length) : '') + '</div>';
    h += '<div class="card card-pad"><h3 style="margin-top:0">Tallest obstacles</h3><table class="mini-table"><thead><tr><th>Identifier</th><th>Type</th><th>Height</th><th>Elevation</th><th>Lighted</th><th>Position</th></tr></thead><tbody>' +
      d.tall.map(function (x) { return '<tr data-ovi="' + rows.indexOf(x) + '"><td class="mono click" data-ovrow><b>' + esc(x.id || x.name) + '</b></td><td>' + esc(typeTxt(x.type)) + '</td><td class="num">' + len(x.hgt, V.unit) + '</td><td class="num">' + len(x.elev, V.unit) + '</td><td>' + yn(x.lighted) + '</td><td class="mono">' + esc(pos(x.c, V.fmt)) + '</td></tr>'; }).join('') + '</tbody></table></div>';
    return h;
  }
  function reportHtml(sets, rows) {
    var fr = V.q || V.type || V.lit || V.minH || V.only;
    function line(id, title, what) {
      return '<div class="ov-rep"><div><b>' + title + '</b><div class="muted">' + what + '</div></div><div class="btn-group">' +
        ['pdf:PDF', 'print:Print', 'xlsx:Excel', 'csv:CSV'].map(function (f) { var p = f.split(':'); return '<button class="btn small" data-ovrep="' + id + ':' + p[0] + '">' + p[1] + '</button>'; }).join('') + '</div></div>';
    }
    return '<div class="card card-pad">' +
      '<p class="muted" style="margin-top:0">Units: <b>' + (V.unit === 'FT' ? 'feet' : 'metres') + '</b> · coordinates: <b>' + (V.fmt === 'dd' ? 'decimal degrees' : 'DMS') + '</b>' + (fr ? ' · only the <b>' + num(filtered(rows, [].concat.apply([], sets.map(compliance))).length, 0) + ' obstacles of the list filter</b>' : ' · all obstacles') + ' (change them in the Obstacle list).</p>' +
      line('list', 'Obstacle list (ENR 5.4 / AD 2.10)', 'Identifier, type, position, elevation, height, lighting, marking, accuracies, distance and bearing from the ARP, Annex 14 penetration, remarks.') +
      line('comp', 'eTOD compliance report', 'The PANS-AIM requirements of the area, every check with the obstacles concerned, the attributes given.') +
      line('stats', 'Statistics', 'By type, by height and by distance; the tallest obstacles.') +
      line('full', 'Complete obstacle report', 'Data set details, statistics, compliance and the obstacle list in one document.') +
      anaLine(sets, rows) +
      '<div class="ov-rep"><div><b>Map data</b><div class="muted">The obstacles as GIS layers (with all their attributes).</div></div><div class="btn-group"><button class="btn small" data-ovrep="gis:geojson">GeoJSON</button><button class="btn small" data-ovrep="gis:kml">KML</button></div></div>' +
      '</div>';
  }

  function anaLine(sets, rows) {
    var issues = [].concat.apply([], sets.map(compliance)), nSel = pickedRows(rows).length, nFp = rows.filter(function (x) { return x.fp; }).length, nList = filtered(rows, issues).length;
    var scopes = [['sel', 'the ' + num(nSel, 0) + ' obstacle(s) chosen', nSel], ['fp', 'the ' + num(nFp, 0) + ' obstacle(s) affecting flight paths', nFp], ['list', 'the ' + num(nList, 0) + ' obstacle(s) of the list' + (V.q || V.type || V.lit || V.minH || V.only ? ' filter' : ''), nList]];
    var cur = V.anaScope || (nSel ? 'sel' : nFp ? 'fp' : 'list');
    return '<div class="ov-rep"><div><b>Obstacle analysis — in depth, with map pictures</b><div class="muted">Each obstacle studied: terrain under and around it, its declared base against the terrain, the Annex 14 surface above it and the margin, its position from the runway, the flight paths within 3 NM with the clearance against an indicative MOC, marking and lighting, the eTOD accuracy of its area; a map picture of each (up to ' + PIC_MAX + ').</div>' +
      '<select class="inp" data-ovf="anaScope" style="margin-top:6px">' + scopes.map(function (x) { return '<option value="' + x[0] + '"' + (cur === x[0] ? ' selected' : '') + (x[2] ? '' : ' disabled') + '>' + esc(x[1]) + '</option>'; }).join('') + '</select> <span class="muted ov-anaprog"></span></div>' +
      '<div class="btn-group">' + ['pdf:PDF', 'print:Print', 'xlsx:Excel'].map(function (f) { var p = f.split(':'); return '<button class="btn small" data-ovana="' + cur + ':' + p[0] + '">' + p[1] + '</button>'; }).join('') + '</div></div>';
  }

  /* -------------------------------------------------------------- analysis */
  var PIC_MAX = 40, ANA_MAX = 500, KC = { SID: '#2e7d32', STAR: '#1565c0', IAP: '#b0186e' }, SEVC = { error: '#c62828', warning: '#ef6c00', caution: '#e0a800', ok: '#2e7d32', info: '#5b6676' };
  function m1(v) { return v === null || v === undefined || isNaN(v) ? '' : num(v, 1) + ' m'; }
  async function analysis(scope, fmt, sets, rows, issues, ctx, host, segs) {
    var list = scope === 'sel' ? pickedRows(rows) : scope === 'fp' ? rows.filter(function (x) { return x.fp; }) : filtered(rows, issues);
    if (!list.length) { ctx.toast(scope === 'sel' ? 'Choose obstacles first: tick them in the list or Ctrl+click them on the map.' : 'No obstacle to analyse.', 5000); return; }
    var prog = function (t) { host.querySelectorAll('.ov-anaprog').forEach(function (e) { e.textContent = t; }); };
    var cut = list.length > ANA_MAX;
    list = list.slice(0, ANA_MAX);
    try {
      var res = [], pics = fmt === 'pdf' || fmt === 'print';
      for (var i = 0; i < list.length; i++) {
        var x = list[i], st = sets.filter(function (q) { return q.rows.indexOf(x) >= 0; })[0];
        prog('analysing ' + (i + 1) + ' / ' + list.length + '…');
        var a = await STUDY.obstacle(x, st, segs);
        a.st = st;
        if (x.c) {
          a.around = await STUDY.aroundAerodrome(x.c, null, [1, 2], 30);
          var hi1 = a.around.highest[0];
          if (hi1 && x.elev !== null && hi1.h > x.elev) a.findings.push({ sev: 'info', what: 'Terrain', txt: 'Terrain within 1 NM rises ' + num(hi1.h - x.elev) + ' m above the top of the obstacle (' + num(hi1.d, 2) + ' NM ' + ('00' + Math.round(hi1.brg)).slice(-3) + '°T): the obstacle may be shielded — to be assessed (shielding principle).' });
        }
        if (pics && x.c && i < PIC_MAX) a.pic = await obstaclePicture(x, a, rows, segs);
        res.push(a);
      }
      prog('writing the report…');
      var sc = analysisScope(res, list, rows, segs, scope, cut);
      if (pics) sc.sections[0].blocks.push({ kind: 'image', src: await overviewPicture(list, sets, segs), h: 620 / 1100, caption: 'The obstacles analysed (numbered as in the summary), the flight paths (SID green, STAR blue, approach magenta, missed approach dashed), the aerodrome reference point.' });
      if (fmt === 'pdf') EXPORTS.exportPDF(sc); else if (fmt === 'print') EXPORTS.print(sc); else EXPORTS.exportExcel(sc);
      prog('');
    } catch (e) { prog(''); ctx.toast('Analysis failed: ' + e.message, 6000); throw e; }
  }
  // a map picture around one obstacle: terrain, the flight paths near it, the runways, the obstacles around
  async function obstaclePicture(x, a, rows, segs) {
    var near = (a.paths || [])[0], R = Math.max(1.5, Math.min(6, near ? near.d * 1.5 + 0.6 : 1.5));
    var paths = STUDY.near(x.c, segs, R * 1.8).map(function (n) { return { coords: n.seg.coords, color: KC[n.seg.kind], dashed: n.seg.dashed }; });
    var S = a.st && a.st.ols && a.st.ols.surfaces, ad = a.st && a.st.ad;
    var others = rows.filter(function (y) { return y !== x && y.c && Math.abs(y.c[1] - x.c[1]) < R / 60 && AX.distNM(x.c, y.c) < R * 1.3; }).slice(0, 400);
    var pts = others.map(function (y) { return { c: y.c, color: '#7a8590', r: 3 }; });
    if (ad && ad.c && AX.distNM(ad.c, x.c) < R * 1.4) pts.push({ c: ad.c, color: '#0b2a4a', r: 6, label: 'ARP ' + ad.icao });
    if (near && near.at) pts.push({ c: near.at, color: SEVC[near.sev] || '#5b6676', r: 4, label: near.clr !== null ? 'path: clearance ' + num(near.clr, 0) + ' m' : '' });
    pts.push({ c: x.c, color: SEVC[a.worst] || '#1d4e89', r: 7, ring: true, label: (x.id || x.name) + ' · ' + num(x.elev, 1) + ' m AMSL' });
    return STUDY.picture({ center: x.c, radiusNM: R, w: 1100, h: 640, jpeg: true, title: (x.id || x.name) + ' — ' + (typeTxt(x.type) || 'obstacle'), sub: 'top ' + m1(x.elev) + ' AMSL · height ' + m1(x.hgt) + (near ? ' · nearest flight path ' + num(near.d, 2) + ' NM' : ''),
      paths: paths, points: pts, rings: [{ c: x.c, nm: 1 }], runways: S ? S.runways.map(function (r) { return [r.rm.a, r.rm.b]; }) : [] });
  }
  async function overviewPicture(list, sets, segs) {
    var b = [180, 90, -180, -90];
    list.forEach(function (x) { if (!x.c) return; b[0] = Math.min(b[0], x.c[0]); b[1] = Math.min(b[1], x.c[1]); b[2] = Math.max(b[2], x.c[0]); b[3] = Math.max(b[3], x.c[1]); });
    var ad = (sets.filter(function (q) { return q.ad && q.ad.c; })[0] || {}).ad;
    if (ad && AX.distNM(ad.c, [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]) < 30) { b[0] = Math.min(b[0], ad.c[0]); b[1] = Math.min(b[1], ad.c[1]); b[2] = Math.max(b[2], ad.c[0]); b[3] = Math.max(b[3], ad.c[1]); }
    var pad = 1.2 / 60, k = Math.cos((b[1] + b[3]) / 2 * Math.PI / 180);
    var bb = [b[0] - pad / k, b[1] - pad, b[2] + pad / k, b[3] + pad];
    var mid = [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2], R = Math.max(AX.distNM(mid, [bb[2], bb[3]]), 1);
    var pts = list.map(function (x, i) { return x.c ? { c: x.c, color: SEVC[x.fp ? x.fp.sev : x.pen ? 'error' : 'info'], r: 5, label: '#' + (i + 1) + ' ' + (x.id || x.name) } : null; }).filter(Boolean);
    if (ad) pts.unshift({ c: ad.c, color: '#0b2a4a', r: 6, label: 'ARP ' + ad.icao });
    return STUDY.picture({ bbox: bb, w: 1100, h: 620, jpeg: true, title: 'Obstacles analysed', sub: list.length + ' obstacle(s)',
      paths: STUDY.near(mid, segs, R * 1.5).map(function (n) { return { coords: n.seg.coords, color: KC[n.seg.kind], dashed: n.seg.dashed }; }), points: pts });
  }
  function analysisScope(res, list, rows, segs, scope, cut) {
    var secs = [], RES = { error: 'ERROR', warning: 'WARNING', caution: 'CAUTION', info: 'note', ok: 'OK' };
    var sum = res.map(function (a, i) {
      var x = a.row, p0 = (a.paths || [])[0];
      return [C(i + 1), C(x.id || x.name, x.r), C(typeTxt(x.type)), C(num(x.elev, 1)), C(num(x.hgt, 1)), C(a.terrain ? num(a.terrain.h, 1) : ''), C(a.ols ? (a.ols.margin < 0 ? 'penetrates ' : 'below ') + a.ols.surface + ' by ' + num(Math.abs(a.ols.margin), 1) + ' m' : ''),
        C(p0 ? p0.seg.label + ' · ' + num(p0.d, 2) + ' NM' : ''), C(p0 && p0.clr !== null ? num(p0.clr, 0) : ''), C(RES[a.worst] || a.worst)];
    });
    var cnt = {}; res.forEach(function (a) { cnt[a.worst] = (cnt[a.worst] || 0) + 1; });
    secs.push({ title: 'Summary', blocks: [
      { kind: 'note', text: res.length + ' obstacle(s) analysed (' + { sel: 'chosen by the user', fp: 'affecting flight paths', list: 'of the list' }[scope] + ')' + (cut ? ', the first ' + ANA_MAX + ' only' : '') + ': ' + ['error', 'warning', 'caution', 'info', 'ok'].filter(function (k) { return cnt[k]; }).map(function (k) { return cnt[k] + ' ' + (RES[k] || k); }).join(', ') + '. ' +
        'Terrain: ' + ((res.filter(function (a) { return a.terrain; })[0] || {}).terrain || { src: 'none available' }).src + '. Flight paths: ' + segs.length + ' procedure leg(s) loaded; clearances are measured from the lowest published altitude of the leg to the top of the obstacle, against an indicative minimum obstacle clearance (arrival / initial 300 m, intermediate 150 m, final 75 m, missed approach 50 m, departure 90 m). Elevations and heights in metres. Indicative — not a PANS-OPS procedure assessment nor an aeronautical study.' },
      { kind: 'table', title: 'Obstacles analysed', cols: ['#', 'Obstacle', 'Type', 'Top (m AMSL)', 'Height (m)', 'Terrain under (m)', 'Annex 14', 'Nearest flight path', 'Clearance (m)', 'Result'], rows: sum }] });
    res.forEach(function (a, i) {
      var x = a.row, st = a.st, A = x.area && AREAS[x.area.charAt(0)], blocks = [];
      if (a.pic) blocks.push({ kind: 'image', src: a.pic, h: 640 / 1100, caption: (x.id || x.name) + ': terrain shading, 1 NM ring, flight paths nearby (SID green, STAR blue, approach magenta), runways, other obstacles (grey); the obstacle ringed, coloured by its worst finding.' });
      var kv = function (label, t) { return { label: label, cells: [C(t, x.r)] }; };
      blocks.push({ kind: 'kv', title: 'Obstacle', rows: [
        kv('Identifier / name', [x.id, x.name !== x.id ? x.name : ''].filter(Boolean).join(' — ')), kv('Type', typeTxt(x.type) + (x.geom && x.geom !== 'P' ? ' (' + (x.geom === 'A' ? 'area' : 'line') + ')' : '') + (x.group === 'YES' ? ' · group' : '')),
        kv('Position', x.c ? AX.dms(x.c[1], false, 2) + ' ' + AX.dms(x.c[0], true, 2) + '  (' + x.c[1].toFixed(6) + ', ' + x.c[0].toFixed(6) + ')' : 'not given'),
        kv('Top elevation (AMSL)', m1(x.elev) + (x.elev !== null ? ' (' + num(x.elev / 0.3048, 0) + ' ft)' : '')), kv('Height above ground', m1(x.hgt) + (x.hgt !== null ? ' (' + num(x.hgt / 0.3048, 0) + ' ft)' : '')),
        kv('Base (elevation − height)', a.base !== undefined && a.base !== null ? m1(a.base) : ''),
        kv('Terrain at the position', a.terrain ? m1(a.terrain.h) + ' — ' + a.terrain.src : 'not available'),
        kv('Top above the terrain', a.aboveTerrain !== undefined ? m1(a.aboveTerrain) : ''),
        kv('Highest terrain around', a.around ? a.around.rings.map(function (rg, k) { var h = a.around.highest[k]; return h ? 'within ' + rg + ' NM: ' + m1(h.h) + ' at ' + num(h.d, 2) + ' NM ' + ('00' + Math.round(h.brg)).slice(-3) + '°T' : ''; }).filter(Boolean).join('; ') : ''),
        kv('Lighting / marking', 'lighted ' + yn(x.lighted) + (x.lightTxt ? ' (' + x.lightTxt + ')' : '') + ' · marked ' + yn(x.marked) + (x.markTxt ? ' (' + x.markTxt + ')' : '')),
        kv('eTOD area / accuracy', (x.area ? 'Area ' + x.area + (A ? ' requires ' + A.h + ' m / ' + A.v + ' m' : '') : 'area not known') + ' · given ' + (x.hAcc !== null ? num(x.hAcc, 2) + ' m' : '—') + ' / ' + (x.vAcc !== null ? num(x.vAcc, 2) + ' m' : '—') + (x.vDatum ? ' · ' + x.vDatum : '')),
        kv('From the aerodrome', x.dist !== null ? num(x.dist, 2) + ' NM ' + ('00' + Math.round(x.brg)).slice(-3) + '°T from the ARP of ' + (st && st.ad ? st.ad.icao : '') : ''),
        kv('Runway', a.runway ? 'runway ' + a.runway.name + ': ' + num(a.runway.off, 0) + ' m ' + a.runway.side + ' of the centreline (extended), ' + (a.runway.along < 0 ? num(-a.runway.along, 0) + ' m before the ' + (a.runway.end || 'first') + ' end' : a.runway.along > a.runway.len ? num(a.runway.along - a.runway.len, 0) + ' m beyond the far end of the ' + num(a.runway.len, 0) + ' m runway' : num(a.runway.along, 0) + ' m along from the ' + (a.runway.end || 'runway') + ' end') : ''),
        kv('Annex 14 surface', a.ols ? a.ols.surface + ' at ' + m1(a.ols.allowed) + ': ' + (a.ols.margin < 0 ? 'PENETRATES by ' + m1(-a.ols.margin) : 'margin ' + m1(a.ols.margin)) : st && st.ols ? 'outside the surfaces' : 'runways of the aerodrome not loaded'),
        kv('Data set', x.ds.name + (x.from ? ' · valid from ' + x.from.slice(0, 10) : '')),
        kv('Remarks', x.notes.join('; '))].filter(function (r) { return r.cells[0].t; }) });
      blocks.push({ kind: 'table', title: 'Findings', cols: ['Result', 'Topic', 'Finding'], rows: a.findings.map(function (f) { return [C(RES[f.sev] || f.sev), C(f.what), C(f.txt)]; }) });
      if (a.paths && a.paths.length) blocks.push({ kind: 'table', title: 'Flight paths within 3 NM', cols: ['Leg', 'Phase', 'Distance', 'Leg altitude', 'Clearance over the top', 'Indicative MOC', 'Result'],
        rows: a.paths.map(function (p) { return [C(p.seg.label, p.seg.leg), C(p.seg.phase), C(num(p.d, 2) + ' NM'), C(p.seg.altTxt), C(p.clr !== null ? m1(p.clr) : 'altitude not published'), C(p.seg.moc + ' m'), C(RES[p.sev] || p.sev)]; }) });
      secs.push({ title: '#' + (i + 1) + ' ' + (x.id || x.name) + ' — ' + (RES[a.worst] || a.worst), blocks: blocks });
    });
    var ads = list.map(function (x) { return x.ds; }).filter(function (v, i, arr2) { return arr2.indexOf(v) === i; });
    return { title: 'Obstacle analysis — ' + (list.length === 1 ? (list[0].id || list[0].name) : list.length + ' obstacles'), sub: 'terrain, Annex 14 surfaces, flight paths · indicative, not for operational use', ds: ads.length === 1 ? ads[0] : null, sections: secs };
  }

  /* --------------------------------------------------------------- reports */
  function C(t, r) { var o = { t: t === undefined || t === null ? '' : String(t) }; if (r) o.r = r; return o; }
  function scopeOf(kind, sets, ctx) {
    var all = [].concat.apply([], sets.map(function (x) { return x.rows; })), issues = [].concat.apply([], sets.map(compliance));
    var rows = V.q || V.type || V.lit || V.minH || V.only ? filtered(all, issues) : all.slice().sort(function (a, b) { return String(a.id || a.name).localeCompare(String(b.id || b.name), 'en', { numeric: true }); });
    var hasDist = rows.some(function (x) { return x.dist !== null; }), hasPen = rows.some(function (x) { return x.pen; });
    var secs = [];
    var head = sets.map(function (st) { return (st.ad ? st.ad.icao + ' ' + st.ad.name : st.adCode || st.ds.state) + (st.area ? ' — ' + areaLabel(st.area) : ''); }).join('; ');
    if (kind === 'full' || kind === 'comp') {
      secs.push({ title: 'Data sets', blocks: [{ kind: 'table', title: 'Obstacle data sets', cols: ['Data set', 'State', 'Aerodrome', 'eTOD area', 'Required accuracy (H / V)', 'Obstacles', 'Originator'],
        rows: sets.map(function (st) { var a = st.area ? AREAS[st.area.key] : null; return [C(st.ds.name), C(st.ds.state), C(st.ad ? st.ad.icao + ' ' + st.ad.name : st.adCode), C(a ? areaLabel(st.area) : 'not stated'), C(a && !st.area.several ? a.h + ' m / ' + a.v + ' m' : a ? 'per obstacle area' : ''), C(st.rows.length), C(st.originators.join(', '))]; }) }] });
    }
    if (kind === 'full' || kind === 'stats') {
      var d = statsData(rows), tb = function (title, list) { return { kind: 'table', title: title, cols: ['Class', 'Obstacles', 'Share'], rows: list.map(function (x) { return [C(x.l), C(x.n), C(rows.length ? num(100 * x.n / rows.length, 1) + ' %' : '')]; }) }; };
      var b = [tb('By type', d.types), tb('By height above ground', d.heights)];
      if (d.dist) b.push(tb('By distance from the ARP', d.dist));
      b.push({ kind: 'table', title: 'Tallest obstacles', cols: ['Identifier', 'Type', 'Height', 'Elevation', 'Lighted', 'Position'], rows: d.tall.map(function (x) { return [C(x.id || x.name, x.r), C(typeTxt(x.type)), C(len(x.hgt, V.unit)), C(len(x.elev, V.unit)), C(yn(x.lighted)), C(pos(x.c, V.fmt))]; }) });
      secs.push({ title: 'Statistics', blocks: b });
    }
    if (kind === 'full' || kind === 'comp') {
      var keep = new Set(rows);
      var iss = issues.filter(function (i) { return keep.has(i.row); });
      secs.push({ title: 'eTOD compliance', blocks: [
        { kind: 'table', title: 'PANS-AIM Appendix 1, Table A1-6', cols: ['Area', 'Covers', 'Horizontal accuracy', 'Vertical accuracy', 'Integrity'], rows: Object.keys(AREAS).map(function (k) { var a = AREAS[k]; return [C(a.name), C(a.note), C(a.h + ' m'), C(a.v + ' m'), C(a.integ)]; }) },
        { kind: 'table', title: 'Issues (' + iss.length + ')', cols: ['Severity', 'Check', 'Obstacle', 'Issue'], rows: iss.map(function (i) { return [C(i.sev), C(i.check), C(i.row ? i.row.id || i.row.name : '', i.row && i.row.r), C(i.msg)]; }) }] });
    }
    if (kind === 'full' || kind === 'list') {
      var cols = ['Identifier', 'Name', 'Type', 'Latitude', 'Longitude', 'Elevation (' + V.unit.toLowerCase() + ')', 'Height (' + V.unit.toLowerCase() + ')', 'Lighted', 'Marked', 'Horizontal accuracy (m)', 'Vertical accuracy (m)', 'Vertical datum'];
      cols.push('eTOD area');
      if (hasDist) cols.push('From ARP');
      if (hasPen) cols.push('Annex 14 penetration');
      cols.push('Remarks');
      var f = V.unit === 'FT' ? 1 / 0.3048 : 1, n1 = function (v) { return v === null ? '' : (Math.round(v * f * 10) / 10).toString(); };
      secs.push({ title: 'Obstacle list', blocks: [{ kind: 'table', title: 'Obstacles (' + rows.length + ')', cols: cols, rows: rows.map(function (x) {
        var r = [C(x.id, x.r), C(x.name), C(typeTxt(x.type)), C(x.c ? (V.fmt === 'dd' ? x.c[1].toFixed(7) : AX.dms(x.c[1], false, 2)) : ''), C(x.c ? (V.fmt === 'dd' ? x.c[0].toFixed(7) : AX.dms(x.c[0], true, 2)) : ''),
          C(n1(x.elev)), C(n1(x.hgt)), C(yn(x.lighted) + (x.lightTxt ? ' ' + x.lightTxt : '')), C(yn(x.marked) + (x.markTxt ? ' ' + x.markTxt : '')), C(x.hAcc === null ? '' : String(Math.round(x.hAcc * 100) / 100)), C(x.vAcc === null ? '' : String(Math.round(x.vAcc * 100) / 100)), C(x.vDatum)];
        r.push(C(x.area || ''));
        if (hasDist) r.push(C(x.dist !== null ? num(x.dist, 2) + ' NM ' + ('00' + Math.round(x.brg)).slice(-3) + '°T' : ''));
        if (hasPen) r.push(C(x.pen ? '+' + num(x.pen.m) + ' m ' + x.pen.surface : ''));
        r.push(C(x.notes.join('; ')));
        return r;
      }) }] });
    }
    var title = { list: 'Obstacle list', comp: 'eTOD compliance report', stats: 'Obstacle statistics', full: 'Obstacle report' }[kind];
    return { title: title + ' — ' + head, sub: rows.length + ' obstacles', ds: sets.length === 1 ? sets[0].ds : null, sections: secs };
  }
  function report(spec, sets, ctx) {
    var p = spec.split(':'), kind = p[0], fmt = p[1];
    try {
      if (kind === 'gis') {
        var ds = sets[0].ds, keep = new Set([].concat.apply([], sets.map(function (x) { return x.rows.map(function (y) { return y.r; }); })));
        sets.forEach(function (st) {
          var f = function (r) { return r.k === 'VerticalStructure' && keep.has(r); };
          var blob = fmt === 'kml' ? CONVERT.toKML(st.ds, f) : CONVERT.toGeoJSON(st.ds, f);
          EXPORTS.download(EXPORTS.safeName('obstacles_' + (st.adCode || st.ds.state) + '_' + st.ds.name.replace(/\.[^.]+$/, '')) + (fmt === 'kml' ? '.kml' : '.geojson'), blob);
        });
        void ds;
        return;
      }
      var sc = scopeOf(kind, sets, ctx);
      if (fmt === 'pdf') EXPORTS.exportPDF(sc);
      else if (fmt === 'print') EXPORTS.print(sc);
      else if (fmt === 'xlsx') EXPORTS.exportExcel(sc);
      else if (fmt === 'csv') EXPORTS.exportCSV(sc);
    } catch (e) { ctx.toast('Report failed: ' + e.message, 6000); throw e; }
  }

  return { render: render, model: model, compliance: compliance, scopeOf: scopeOf, areaOf: areaOf, AREAS: AREAS, state: V, analysisScope: analysisScope, has: function (datasets) { return datasets.some(function (d) { return (d.byType.VerticalStructure || []).length; }); } };
})();
