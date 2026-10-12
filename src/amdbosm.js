/*!
 * AIXM Code Converter
 * Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com> - author of the AIXM Code Converter
 * SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE; keep this notice in all copies)
 * ==========================================================================
 * AIXM Code Converter - OpenStreetMap for aerodrome mapping (AMDBOSM)
 * NOT FOR NAVIGATION - for study and analysis only.
 * OpenStreetMap (© OpenStreetMap contributors, Open Database Licence 1.0) maps most aerodromes in detail: runways,
 * taxiway centre lines with their designators, aprons, stands with their numbers and lead-in lines, holding
 * positions, terminals, hangars, towers and other buildings, windsocks and visual aids — traced from imagery by
 * volunteers (coarse quality). It fills what an AIP data set does not give.
 *   Get        online, only when asked: the aerodrome's features from the Overpass API (by its ICAO code, else the
 *              area about its reference point); several servers in turn; nothing else is sent.
 *   Load       offline: an .osm file, Overpass JSON or GeoJSON (e.g. exported from overpass-turbo.eu).
 *   Convert    to AMXM features (every one says it comes from OpenStreetMap, with its way / node number), and the
 *              aerodrome routing network (AsrnNode / AsrnEdge) from the joined taxiway, runway and stand lines.
 * Map tiles of Google or Esri are not read: their terms do not allow deriving data from them.
 * Loaded only when used (src/lazy.js).
 * ========================================================================== */
/* global CONVERT */
var AMDBOSM = (function () {
  'use strict';
  var D2R = Math.PI / 180;
  var SERVERS = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
  var STORE = {}; // ICAO code -> { els, src: { kind, name, server, date } }
  var ATTR = '© OpenStreetMap contributors, ODbL 1.0';
  function num(v) { var n = parseFloat(String(v === undefined ? '' : v).replace(',', '.')); return isNaN(n) ? null : n; }

  /* ------------------------------------------------------------- read OSM data */
  // every element -> { type, id, tags, g: {t: 'P' | 'L' | 'A', c} } (lon / lat)
  function pt(o) { return [+o.lon, +o.lat]; }
  function closed(c) { return c.length > 3 && c[0][0] === c[c.length - 1][0] && c[0][1] === c[c.length - 1][1]; }
  var AREA_AEROWAY = { apron: 1, terminal: 1, hangar: 1, helipad: 1, aerodrome: 1, gate: 0, tower: 1, holding_position: 0, stopway: 0, blast_pad: 0, runway: 0, taxiway: 0, taxilane: 0, parking_position: 0 };
  function isArea(tags, c) {
    if (!closed(c)) return false;
    if (tags.area === 'no') return false;
    if (tags.area === 'yes') return true;
    if (tags.building || tags.natural === 'water' || tags.landuse || tags['building:part']) return true;
    var a = tags.aeroway;
    return a ? AREA_AEROWAY[a] === 1 : false;
  }
  // outer member ways of a multipolygon joined into rings
  function rings(parts) {
    parts = parts.filter(function (p) { return p.length > 1; }).map(function (p) { return p.slice(); });
    var out = [];
    while (parts.length) {
      var r = parts.shift(), guard = 0;
      while (!closed(r) && guard++ < 500) {
        var end = r[r.length - 1], j = -1, rev = false;
        for (var i = 0; i < parts.length; i++) { var p = parts[i]; if (p[0][0] === end[0] && p[0][1] === end[1]) { j = i; break; } if (p[p.length - 1][0] === end[0] && p[p.length - 1][1] === end[1]) { j = i; rev = true; break; } }
        if (j < 0) break;
        var q = parts.splice(j, 1)[0]; if (rev) q.reverse();
        r = r.concat(q.slice(1));
      }
      if (closed(r)) out.push(r);
    }
    return out;
  }
  function fromOverpass(json) {
    var els = [];
    (json.elements || []).forEach(function (e) {
      var tags = e.tags || {};
      if (e.type === 'node') { if (e.lat !== undefined) els.push({ type: 'node', id: e.id, tags: tags, g: { t: 'P', c: pt(e) } }); return; }
      if (e.type === 'way' && e.geometry) {
        var c = e.geometry.filter(Boolean).map(pt);
        if (c.length < 2) return;
        els.push({ type: 'way', id: e.id, tags: tags, g: isArea(tags, c) ? { t: 'A', c: [c] } : { t: 'L', c: c } });
        return;
      }
      if (e.type === 'relation' && e.members) {
        var outer = e.members.filter(function (m) { return m.type === 'way' && m.geometry && m.role !== 'inner'; }).map(function (m) { return m.geometry.filter(Boolean).map(pt); });
        rings(outer).forEach(function (r, i) { els.push({ type: 'relation', id: e.id + (i ? '-' + i : ''), tags: tags, g: { t: 'A', c: [r] } }); });
      }
    });
    return els;
  }
  function fromOsmXml(text) {
    var doc = new DOMParser().parseFromString(text, 'application/xml'), nodes = {}, ways = {}, els = [];
    function tagsOf(n) { var t = {}; Array.prototype.forEach.call(n.getElementsByTagName('tag'), function (x) { t[x.getAttribute('k')] = x.getAttribute('v'); }); return t; }
    Array.prototype.forEach.call(doc.getElementsByTagName('node'), function (n) { var id = n.getAttribute('id'), c = [+n.getAttribute('lon'), +n.getAttribute('lat')]; nodes[id] = c; var t = tagsOf(n); if (Object.keys(t).length) els.push({ type: 'node', id: id, tags: t, g: { t: 'P', c: c } }); });
    Array.prototype.forEach.call(doc.getElementsByTagName('way'), function (w) {
      var c = Array.prototype.map.call(w.getElementsByTagName('nd'), function (x) { return nodes[x.getAttribute('ref')]; }).filter(Boolean), t = tagsOf(w), id = w.getAttribute('id');
      ways[id] = c;
      if (c.length > 1 && Object.keys(t).length) els.push({ type: 'way', id: id, tags: t, g: isArea(t, c) ? { t: 'A', c: [c] } : { t: 'L', c: c } });
    });
    Array.prototype.forEach.call(doc.getElementsByTagName('relation'), function (r) {
      var t = tagsOf(r);
      if (t.type !== 'multipolygon') return;
      var outer = Array.prototype.filter.call(r.getElementsByTagName('member'), function (m) { return m.getAttribute('type') === 'way' && m.getAttribute('role') !== 'inner'; }).map(function (m) { return ways[m.getAttribute('ref')] || []; });
      rings(outer).forEach(function (ring, i) { els.push({ type: 'relation', id: r.getAttribute('id') + (i ? '-' + i : ''), tags: t, g: { t: 'A', c: [ring] } }); });
    });
    return els;
  }
  function fromGeoJSON(obj) {
    var els = [];
    (obj.features || []).forEach(function (f, i) {
      var p = f.properties || {}, tags = p.tags && typeof p.tags === 'object' ? p.tags : p, g = f.geometry, idm = /^(node|way|relation)\/(\d+)/.exec(String(p['@id'] || f.id || ''));
      if (!g) return;
      var id = idm ? idm[2] : String(i), type = idm ? idm[1] : g.type === 'Point' ? 'node' : 'way';
      if (g.type === 'Point') els.push({ type: type, id: id, tags: tags, g: { t: 'P', c: g.coordinates.slice(0, 2) } });
      else if (g.type === 'LineString') els.push({ type: type, id: id, tags: tags, g: isArea(tags, g.coordinates) ? { t: 'A', c: [g.coordinates] } : { t: 'L', c: g.coordinates } });
      else if (g.type === 'Polygon') els.push({ type: type, id: id, tags: tags, g: { t: 'A', c: [g.coordinates[0]] } });
      else if (g.type === 'MultiPolygon') g.coordinates.forEach(function (poly, j) { els.push({ type: type, id: id + (j ? '-' + j : ''), tags: tags, g: { t: 'A', c: [poly[0]] } }); });
    });
    return els;
  }
  function isOsm(text) { return /<osm[\s>]/.test(text.slice(0, 600)) || /"generator"\s*:\s*"Overpass/.test(text.slice(0, 600)) || /"(aeroway|@id)"\s*:/.test(text.slice(0, 200000)); }
  function parse(text, name) {
    var t = text.replace(/^﻿/, '').trim();
    if (t.charAt(0) === '<') return fromOsmXml(t);
    var j = JSON.parse(t);
    if (j.elements) return fromOverpass(j);
    if (j.type === 'FeatureCollection') return fromGeoJSON(j);
    throw new Error((name || 'file') + ': not OpenStreetMap data (.osm, Overpass JSON or GeoJSON)');
  }

  /* ---------------------------------------------------------- get it online */
  function bboxOf(c) {
    var r = Math.max(3000, c.rwys.reduce(function (m, x) { return Math.max(m, (x.len || 0) * 0.75); }, 0) + 1500);
    var dy = r / 111320, dx = dy / Math.cos(c.arp[1] * D2R);
    return [c.arp[1] - dy, c.arp[0] - dx, c.arp[1] + dy, c.arp[0] + dx].map(function (v) { return v.toFixed(5); }).join(',');
  }
  var WANT = 'nwr["aeroway"]{A};nwr["building"]{A};nwr["man_made"~"^(tower|mast|windsock|beacon|antenna|lighthouse)$"]{A};way["highway"="service"]{A};nwr["natural"="water"]{A};';
  function query(c, byArea) {
    if (byArea) return '[out:json][timeout:90];area["aeroway"="aerodrome"]["icao"="' + c.code + '"]->.a;(' + WANT.replace(/\{A\}/g, '(area.a)') + 'nwr["aeroway"="aerodrome"]["icao"="' + c.code + '"];);out body geom qt;';
    return '[out:json][timeout:90];(' + WANT.replace(/\{A\}/g, '(' + bboxOf(c) + ')') + ');out body geom qt;';
  }
  async function post(server, q) {
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null, tm = ctl ? setTimeout(function () { ctl.abort(); }, 100000) : null;
    try {
      var r = await fetch(server, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: ctl ? ctl.signal : undefined });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally { if (tm) clearTimeout(tm); }
  }
  // the features of aerodrome c: by its ICAO code (the aerodrome as mapped in OSM), else the area about its reference point
  async function fetchFor(c, onStatus) {
    var errs = [];
    for (var i = 0; i < SERVERS.length; i++) {
      var server = SERVERS[i];
      try {
        if (onStatus) onStatus(c.code + ': asking ' + server.replace(/^https:\/\/([^/]+).*/, '$1') + '…');
        var j = await post(server, query(c, true)), els = fromOverpass(j), how = 'by its ICAO code';
        if (els.filter(function (e) { return e.tags.aeroway !== 'aerodrome'; }).length < 3 && c.arp) { j = await post(server, query(c, false)); els = fromOverpass(j); how = 'in the area about its reference point'; }
        STORE[c.code] = { els: els, src: { kind: 'online', name: 'Overpass API (' + server.replace(/^https:\/\/([^/]+).*/, '$1') + '), ' + how, server: server, date: new Date().toISOString().slice(0, 10) } };
        return STORE[c.code];
      } catch (e) { errs.push(server.replace(/^https:\/\/([^/]+).*/, '$1') + ': ' + (e.name === 'AbortError' ? 'timed out' : e.message)); }
    }
    throw new Error('OpenStreetMap could not be reached (' + errs.join('; ') + ')');
  }
  // a file: its elements go to the aerodromes they lie about (within 8 km of the reference point)
  function load(text, name, cands) {
    var els = parse(text, name), got = {};
    cands.forEach(function (c) {
      if (!c.arp) return;
      var k = Math.cos(c.arp[1] * D2R), mine = els.filter(function (e) { var p = e.g.t === 'P' ? e.g.c : e.g.t === 'L' ? e.g.c[0] : e.g.c[0][0]; return Math.hypot((p[0] - c.arp[0]) * k, p[1] - c.arp[1]) * 111320 < 8000; });
      if (mine.filter(function (e) { return e.tags.aeroway; }).length) { STORE[c.code] = { els: mine, src: { kind: 'file', name: name, date: new Date().toISOString().slice(0, 10) } }; got[c.code] = mine.length; }
    });
    return { elements: els.length, aerodromes: got };
  }
  function get(code) { return STORE[code] || null; }
  function drop(code) { delete STORE[code]; }
  // what OSM gives for an aerodrome
  function summary(o) {
    var n = { runway: 0, taxiway: 0, twyRef: 0, apron: 0, stand: 0, standRef: 0, hold: 0, building: 0, terminal: 0, windsock: 0, navaid: 0, surface: 0, boundary: 0, road: 0, all: 0 };
    if (!o) return n;
    o.els.forEach(function (e) {
      var t = e.tags, a = t.aeroway; n.all++;
      if (a === 'runway') { n.runway++; if (t.surface) n.surface++; }
      else if (a === 'taxiway' || a === 'taxilane') { n.taxiway++; if (t.ref) n.twyRef++; }
      else if (a === 'apron') n.apron++;
      else if (a === 'parking_position') { n.stand++; if (t.ref) n.standRef++; }
      else if (a === 'holding_position') n.hold++;
      else if (a === 'windsock' || t.man_made === 'windsock') n.windsock++;
      else if (a === 'navigationaid') n.navaid++;
      else if (a === 'aerodrome') n.boundary++;
      if (t.highway === 'service' && e.g && e.g.t === 'L') n.road++;
      if (t.building || a === 'terminal' || a === 'hangar' || a === 'tower') { n.building++; if (a === 'terminal' || t.building === 'terminal') n.terminal++; }
    });
    return n;
  }

  /* ------------------------------------------------------------ to AMXM features */
  var GND = { concrete: '1', 'concrete:plates': '1', 'concrete:lanes': '1', asphalt: '2', paved: '2', sand: '3', dirt: '4', ground: '4', earth: '4', unpaved: '4', grass: '7', gravel: '8', fine_gravel: '8', compacted: '8', bitumen: '10', paving_stones: '11', sett: '13' };
  function designators(ref) { return String(ref || '').toUpperCase().split(/[/\-\s]+/).map(function (x) { var m = /^(\d{1,2})([LRC]?)$/.exec(x.trim()); return m ? ('0' + m[1]).slice(-2) + m[2] : ''; }).filter(Boolean); }
  // the runways mapped in OSM (centre line, designators, width, surface)
  function runways(o) {
    return (o ? o.els : []).filter(function (e) { return e.tags.aeroway === 'runway' && e.g.t === 'L'; }).map(function (e) { return { id: e.type + ' ' + e.id, line: e.g.c, ends: [e.g.c[0], e.g.c[e.g.c.length - 1]], des: designators(e.tags.ref), ref: e.tags.ref || '', width: num(e.tags.width), surface: e.tags.surface || '' }; });
  }
  function boundary(o) { var b = o && o.els.filter(function (e) { return e.tags.aeroway === 'aerodrome' && e.g.t === 'A'; })[0]; return b ? b.g.c[0] : null; }
  // H: helpers of the generator { plane, widen, base(t, key), twyWidth(ref), twyWidthFrom(ref), have: {type: n}, code letter,
// dupStand(ref, at): a stand the State's chart or the user already placed; skipTaxi(ref): a taxiway the user traced }
  function convert(c, o, H) {
    var out = [], notes = [], taxi = [], stands = [];
    if (!o) return { features: out, notes: notes, taxi: taxi };
    function src(e, what) { return { v: ('OpenStreetMap contributors (ODbL 1.0), ' + e.type + ' ' + e.id + ': ' + (what || 'traced from imagery by volunteers') + (e.tags['ref:chart'] ? '; name ' + e.tags.ref + ' from the State\'s chart (its label beside this line)' : '') + ', coarse quality').slice(0, 254) }; }
    function feat(t, e, key, what) { var f = H.base(t, 'osm-' + key + '-' + e.type.charAt(0) + e.id); f.a.source = src(e, what); f.osm = e.type + '/' + e.id; out.push(f); return f; }
    function skip(t) { return H.have[t] > 0; } // the AIP data set gives this type: it is kept, OSM is not added
    var lines = function (k) { return o.els.filter(function (e) { return e.g.t === 'L' && (Array.isArray(k) ? k.indexOf(e.tags.aeroway) >= 0 : e.tags.aeroway === k); }); };
    // taxiways and taxilanes: guidance line, and the taxiway surface along it
    var tw = lines(['taxiway', 'taxilane']);
    tw.forEach(function (e) {
      var ref = (e.tags.ref || '').slice(0, 254), lane = e.tags.aeroway === 'taxilane';
      taxi.push({ c: e.g.c, ref: ref, lane: lane, id: e.type + '/' + e.id });
      if (H.skipTaxi && H.skipTaxi(ref)) return; // the user traced this taxiway on imagery
      if (!skip('TaxiwayGuidanceLine')) { var g = feat('TaxiwayGuidanceLine', e, 'tgl', 'taxiway centre line traced from imagery by volunteers'); g.g = [{ t: 'L', c: e.g.c }]; if (ref) g.a.idlin = { v: ref }; g.a.status = { v: '1' }; g.a.color = { v: '0' }; g.a.style = { v: '0' }; g.a.direc = { v: e.tags.oneway === 'yes' ? '1' : e.tags.oneway === '-1' ? '2' : '0' }; g.label = ref; }
      if (!lane && !skip('TaxiwayElement')) {
        var w = num(e.tags.width), how = 'width ' + w + ' m (OSM)';
        if (!w) { w = H.twyWidth(ref); how = w ? 'width ' + w + ' m from ' + (H.twyWidthFrom ? H.twyWidthFrom(ref) : 'the AIP') : ''; }
        if (!w) { w = H.codeTwyWidth; how = 'width ' + w + ' m assumed for code letter ' + H.letter + ' (ICAO Annex 14 3.9)'; }
        var ring = H.widen(e.g.c, w);
        if (ring) { var te = feat('TaxiwayElement', e, 'twy', 'taxiway surface along the centre line traced by volunteers, ' + how); te.g = [{ t: 'A', c: [ring] }]; if (ref) te.a.idlin = { v: ref }; if (GND[e.tags.surface]) te.a.gsurftyp = { v: GND[e.tags.surface] }; te.a.status = { v: '1' }; te.label = ref; }
      }
    });
    o.els.filter(function (e) { return (e.tags.aeroway === 'taxiway' || e.tags.aeroway === 'taxilane') && e.g.t === 'A'; }).forEach(function (e) { if (skip('TaxiwayElement')) return; var te = feat('TaxiwayElement', e, 'twya'); te.g = [e.g]; if (e.tags.ref) te.a.idlin = { v: e.tags.ref }; te.a.status = { v: '1' }; te.label = e.tags.ref || ''; });
    // aprons
    o.els.filter(function (e) { return e.tags.aeroway === 'apron' && e.g.t === 'A'; }).forEach(function (e) {
      if (skip('ApronElement')) return;
      var f = feat('ApronElement', e, 'apn'), nm = e.tags.ref || e.tags.name || e.tags['name:en'] || ''; f.g = [e.g]; if (nm) f.a.idapron = { v: nm.slice(0, 254) }; f.a.aprontyp = { v: '1' }; f.a.status = { v: '1' }; if (GND[e.tags.surface]) f.a.gsurftyp = { v: GND[e.tags.surface] }; f.label = nm;
    });
    // stands: the stand point, and its lead-in line (the stand at the end of the line away from the taxi lines)
    function nearTaxi(p) { var P = H.plane(p), best = Infinity; taxi.forEach(function (t) { t.c.forEach(function (q) { var v = P.fwd(q), d = Math.hypot(v[0], v[1]); if (d < best) best = d; }); }); return best; }
    o.els.filter(function (e) { return e.tags.aeroway === 'parking_position'; }).forEach(function (e) {
      var ref = (e.tags.ref || e.tags.name || '').slice(0, 254), at = null;
      if (e.g.t === 'P') at = e.g.c;
      else {
        var c0 = e.g.t === 'L' ? e.g.c : e.g.c[0], a = c0[0], b = c0[c0.length - 1];
        at = e.g.t === 'A' ? H.centre(c0) : nearTaxi(a) > nearTaxi(b) ? a : b;
        if (e.g.t === 'L' && !skip('StandGuidanceLine')) { var sg = feat('StandGuidanceLine', e, 'sgl', 'stand lead-in line traced from imagery by volunteers'); sg.g = [{ t: 'L', c: at === a ? c0.slice().reverse() : c0 }]; if (ref) sg.a.idstd = { v: ref }; sg.a.status = { v: '1' }; sg.a.color = { v: '0' }; sg.a.style = { v: '0' }; sg.a.direc = { v: '1' }; sg.label = ref; }
        if (e.g.t === 'A' && !skip('ParkingStandArea')) { var sa = feat('ParkingStandArea', e, 'sta'); sa.g = [e.g]; if (ref) sa.a.idstd = { v: ref }; sa.a.status = { v: '1' }; sa.label = ref; }
      }
      if (at && !skip('ParkingStandLocation') && !(H.dupStand && H.dupStand(ref, at))) { var sp = feat('ParkingStandLocation', e, 'std', e.g.t === 'P' ? '' : 'stop end of the lead-in line traced by volunteers'); sp.g = [{ t: 'P', c: at }]; if (ref) sp.a.idstd = { v: ref }; sp.label = ref; stands.push({ c: at, ref: ref }); }
    });
    // holding positions: a line across the taxiway they lie on
    o.els.filter(function (e) { return e.tags.aeroway === 'holding_position' && e.g.t === 'P'; }).forEach(function (e) {
      if (skip('TaxiwayHoldingPosition')) return;
      var p = e.g.c, P = H.plane(p), best = null;
      taxi.forEach(function (t) { for (var i = 0; i < t.c.length - 1; i++) { var a = P.fwd(t.c[i]), b = P.fwd(t.c[i + 1]), dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy; if (!L2) continue; var u = Math.max(0, Math.min(1, -(a[0] * dx + a[1] * dy) / L2)), d = Math.hypot(a[0] + u * dx, a[1] + u * dy); if (!best || d < best.d) best = { d: d, dx: dx, dy: dy, ref: t.ref }; } });
      var ang = best && best.d < 40 ? Math.atan2(best.dx, best.dy) / D2R + 90 : 0, w = (best && H.twyWidth(best.ref)) || H.codeTwyWidth;
      var f = feat('TaxiwayHoldingPosition', e, 'hold', 'holding position point traced by volunteers; drawn across the taxiway');
      f.g = [{ t: 'L', c: [H.along(p, ang, w / 2 + 3), H.along(p, ang + 180, w / 2 + 3)] }];
      var ty = String(e.tags['holding_position:type'] || e.tags['aeroway:holding_position'] || '').toUpperCase();
      f.a.catstop = { v: /III/.test(ty) ? '4' : /II/.test(ty) ? '3' : /ILS|CAT/.test(ty) ? '1' : '0' }; f.a.marktype = { v: /ILS|CAT/.test(ty) ? '1' : '0' }; f.a.holddir = { v: '0' }; f.a.status = { v: '1' };
      if (best && best.ref) f.a.idlin = { v: best.ref };
      if (e.tags.ref) f.a.idp = { v: String(e.tags.ref).slice(0, 254) };
      f.label = (e.tags.ref || (best && best.ref) || '') + ' holding position';
    });
    // stopways, blast pads, helicopter areas
    o.els.filter(function (e) { return /^(stopway|blast_pad)$/.test(e.tags.aeroway); }).forEach(function (e) {
      var t = e.tags.aeroway === 'stopway' ? 'Stopway' : 'Blastpad'; if (skip(t)) return;
      var g = e.g.t === 'A' ? e.g : e.g.t === 'L' ? { t: 'A', c: [H.widen(e.g.c, num(e.tags.width) || H.rwyWidth || 45)] } : null;
      if (!g || !g.c[0]) return;
      var f = feat(t, e, t === 'Stopway' ? 'swy' : 'blp'); f.g = [g]; if (t === 'Stopway') f.a.status = { v: '1' }; f.label = e.tags.ref || '';
    });
    o.els.filter(function (e) { return e.tags.aeroway === 'helipad'; }).forEach(function (e) {
      if (skip('TouchDownLiftOffArea')) return;
      var g = e.g.t === 'A' ? e.g : null, what = '';
      if (!g && e.g.t === 'P') { var sz = num(e.tags.diameter) || num(e.tags.length) || num(e.tags.width) || 20; what = 'helipad point traced by volunteers; ' + (num(e.tags.diameter) || num(e.tags.length) || num(e.tags.width) ? sz + ' m as tagged' : 'size assumed 20 m'); var P = H.plane(e.g.c); g = { t: 'A', c: [[[-sz / 2, -sz / 2], [sz / 2, -sz / 2], [sz / 2, sz / 2], [-sz / 2, sz / 2], [-sz / 2, -sz / 2]].map(P.inv)] }; }
      if (!g) return;
      var f = feat('TouchDownLiftOffArea', e, 'tlof', what); f.g = [g]; f.a.idrwy = { v: (e.tags.ref || 'H').slice(0, 16) }; f.a.status = { v: '1' }; f.label = 'TLOF ' + (e.tags.ref || '');
    });
    // buildings and other structures
    var PLY = { terminal: '1', hangar: '2', control_tower: '3', tower: '3', fire_station: '13' };
    o.els.filter(function (e) { return e.g.t === 'A' && (e.tags.building || /^(terminal|hangar|tower)$/.test(e.tags.aeroway || '')); }).forEach(function (e) {
      if (skip('VerticalPolygonalStructure')) return;
      var t = e.tags, kind = t.aeroway || t.building, f = feat('VerticalPolygonalStructure', e, 'bld', 'building traced from imagery by volunteers' + (t.height ? ', height as tagged' : t['building:levels'] ? ', height from ' + t['building:levels'] + ' levels × 3.5 m' : ', height not given'));
      f.g = [e.g]; f.a.plysttyp = { v: PLY[kind] || (t['tower:type'] === 'airport_control' ? '3' : '4') };
      var h = num(t.height) || (num(t['building:levels']) ? num(t['building:levels']) * 3.5 : null); if (h !== null) f.a.height = { v: String(Math.round(h * 10) / 10), u: 'M' };
      var nm = t.name || t['name:en'] || t.ref; if (nm) f.a.ident = { v: nm.slice(0, 254) };
      f.label = nm || kind;
    });
    var PNT = { windsock: '4', mast: '3', antenna: '3', beacon: '8', lighthouse: '8', tower: '3' };
    o.els.filter(function (e) { return e.g.t === 'P' && (PNT[e.tags.man_made] || e.tags.aeroway === 'windsock' || e.tags.aeroway === 'navigationaid' || e.tags.aeroway === 'tower'); }).forEach(function (e) {
      var t = e.tags, nav = t.aeroway === 'navigationaid', kind = nav ? String(t.navigationaid || 'navaid') : t.aeroway === 'windsock' ? 'windsock' : t.aeroway === 'tower' ? 'tower' : t.man_made;
      if (nav && /^(als|approach_light)/i.test(kind)) { if (skip('AerodromeSurfaceLighting')) return; var l = feat('AerodromeSurfaceLighting', e, 'lgt'); l.g = [e.g]; l.a.lgtuse = { v: '9' }; l.a.status = { v: '1' }; l.label = 'approach light'; return; }
      if (skip('VerticalPointStructure')) return;
      var f = feat('VerticalPointStructure', e, 'vps'); f.g = [e.g]; f.a.pntsttyp = { v: nav ? '9' : PNT[kind] || '3' };
      var h = num(t.height); if (h !== null) f.a.height = { v: String(h), u: 'M' };
      f.label = (nav ? kind.toUpperCase() : kind) + (t.ref ? ' ' + t.ref : '');
    });
    // service roads and water
    o.els.filter(function (e) { return e.tags.highway === 'service' && e.g.t === 'L'; }).forEach(function (e) { if (skip('ServiceRoad')) return; var ring = H.widen(e.g.c, num(e.tags.width) || 6); if (!ring) return; var f = feat('ServiceRoad', e, 'srd', 'service road traced by volunteers, ' + (num(e.tags.width) ? 'width as tagged' : 'width assumed 6 m')); f.g = [{ t: 'A', c: [ring] }]; f.a.featbase = { v: '0' }; if (GND[e.tags.surface]) f.a.gsurftyp = { v: GND[e.tags.surface] }; });
    o.els.filter(function (e) { return e.tags.natural === 'water' && e.g.t === 'A'; }).forEach(function (e) { if (skip('Water')) return; var f = feat('Water', e, 'wat'); f.g = [e.g]; });
    return { features: out, notes: notes, taxi: taxi, stands: stands };
  }

  /* ------------------------------------------------- aerodrome routing network */
  // AsrnNode / AsrnEdge from the taxiway, taxilane, runway and stand lines: a node where lines meet (OSM lines share
  // their nodes), at their ends and at the stands; an edge along each line between two nodes
  function network(c, o, H, idOf) {
    var out = [];
    if (!o) return out;
    var ways = o.els.filter(function (e) { return e.g.t === 'L' && /^(taxiway|taxilane|runway|parking_position)$/.test(e.tags.aeroway); });
    if (!ways.length) return out;
    function key(p) { return p[0].toFixed(7) + ',' + p[1].toFixed(7); }
    var count = {}, kinds = {};
    ways.forEach(function (w) { var seen = {}; w.g.c.forEach(function (p, i) { var k = key(p); if (seen[k]) return; seen[k] = 1; count[k] = (count[k] || 0) + 1; (kinds[k] = kinds[k] || {})[w.tags.aeroway] = 1; if (i === 0 || i === w.g.c.length - 1) count[k] += 0.5; }); });
    var nodes = {}, nN = 0;
    function node(p, k) {
      if (nodes[k]) return nodes[k];
      var kd = kinds[k] || {}, f = H.base('AsrnNode', 'asrn-n-' + (++nN));
      f.a.source = { v: 'Derived from OpenStreetMap lines (' + ATTR + '): where taxiway, runway and stand lines meet' };
      f.g = [{ t: 'P', c: p }]; f.a.idnetwrk = { v: c.code + ' taxi network' };
      f.a.nodetype = { v: kd.runway && (kd.taxiway || kd.taxilane) ? '2' : kd.parking_position ? '9' : kd.taxilane && kd.taxiway ? '6' : '0' };
      out.push(f); nodes[k] = f; return f;
    }
    var nE = 0, ET = { taxiway: '0', runway: '1', taxilane: '6', parking_position: '7' };
    ways.forEach(function (w) {
      var c0 = w.g.c, start = 0;
      for (var i = 1; i < c0.length; i++) {
        var k = key(c0[i]);
        if (i === c0.length - 1 || count[k] >= 1.5) {
          var seg = c0.slice(start, i + 1);
          if (seg.length > 1) {
            var a = node(seg[0], key(seg[0])), b = node(seg[seg.length - 1], k), len = 0, P = H.plane(seg[0]);
            for (var j = 1; j < seg.length; j++) { var u = P.fwd(seg[j - 1]), v = P.fwd(seg[j]); len += Math.hypot(v[0] - u[0], v[1] - u[1]); }
            var f = H.base('AsrnEdge', 'asrn-e-' + (++nE));
            f.a.source = { v: ('Derived from OpenStreetMap (' + ATTR + '), ' + w.type + ' ' + w.id + ': edge along the line').slice(0, 254) };
            f.g = [{ t: 'L', c: seg }]; f.a.idnetwrk = { v: c.code + ' taxi network' };
            f.a.node1ref = { v: idOf(a) }; f.a.node2ref = { v: idOf(b) };
            f.a.direc = { v: w.tags.oneway === 'yes' ? '1' : '0' }; f.a.edgederv = { v: '2' }; f.a.edgetype = { v: ET[w.tags.aeroway] || '0' };
            f.a.edgelen = { v: String(Math.round(len * 100) / 100) };
            if (w.tags.ref) f.a.idbase = { v: String(w.tags.ref).slice(0, 254) };
            f.label = (w.tags.ref || w.tags.aeroway) + ' ' + Math.round(len) + ' m';
            out.push(f);
          }
          start = i;
        }
      }
    });
    return out;
  }
  // links to look at the aerodrome in OpenStreetMap, or improve it there
  function links(c) { if (!c.arp) return {}; var z = '15/' + c.arp[1].toFixed(5) + '/' + c.arp[0].toFixed(5); return { view: 'https://www.openstreetmap.org/#map=' + z, edit: 'https://www.openstreetmap.org/edit#map=' + z }; }
  return { SERVERS: SERVERS, ATTR: ATTR, parse: parse, isOsm: isOsm, fetchFor: fetchFor, load: load, get: get, drop: drop, summary: summary, runways: runways, boundary: boundary, convert: convert, network: network, designators: designators, links: links, query: query,
    put: function (code, els, src) { STORE[code] = { els: els, src: src || { kind: 'file', name: 'data', date: new Date().toISOString().slice(0, 10) } }; }, uuid: function (id) { return CONVERT.uuidFor(id); } };
})();
