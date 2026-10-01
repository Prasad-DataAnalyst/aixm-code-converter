/*!
 * AIXM Code Converter
 * Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com> - author of the AIXM Code Converter
 * SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE; keep this notice in all copies)
 * ==========================================================================
 * AIXM Code Converter - data integrity (ICAO Annex 15 / PANS-AIM)
 *   - CRC32Q (the 32-bit CRC of the aeronautical data chain, polynomial
 *     0x814141AB, also called CRC-32/AIXM; check value of "123456789" is
 *     3010BF7F)
 *   - classification of the critical / essential / routine data items with
 *     the accuracy required by PANS-AIM Appendix 1, compared with the
 *     accuracy declared in the data (horizontalAccuracy / verticalAccuracy)
 *   - a CRC32Q fingerprint per data item: export the list, verify a later
 *     delivery against it (changed / missing / new items)
 *   - CRC values carried by the file itself (AIXM 4.5 valCrc, AIXM 5
 *     CRCRemainder of FAS data blocks) are listed as published
 * List key: "<feature type>;<AIXM identifier>;<item>" (stable between deliveries).
 * Fingerprint input: "<feature type>;<identifier>;<item>;<latitude>;<longitude>;<elevation>"
 * with the position in DMS at the resolution of the item's class
 * (critical 1/100 s, essential 1/10 s, routine 1 s) and the elevation in
 * metres to 0.1 m.
 * ========================================================================== */
/* global AX, MODEL */
var INTEGRITY = (function () {
  'use strict';
  var M = MODEL, s = M.s, arr = AX.arr;

  /* -------------------------------------------------------------- CRC32Q */
  var TABLE = (function () {
    var t = new Uint32Array(256);
    for (var i = 0; i < 256; i++) {
      var c = i << 24;
      for (var k = 0; k < 8; k++) c = (c & 0x80000000) ? ((c << 1) ^ 0x814141AB) : (c << 1);
      t[i] = c >>> 0;
    }
    return t;
  })();
  function utf8(str) { var b = unescape(encodeURIComponent(str)), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  // CRC32Q of a string (UTF-8) or byte array -> 8 hex digits, upper case
  function crc32q(data) {
    var b = typeof data === 'string' ? utf8(data) : data, c = 0;
    for (var i = 0; i < b.length; i++) c = ((c << 8) ^ TABLE[((c >>> 24) ^ b[i]) & 0xff]) >>> 0;
    return ('0000000' + c.toString(16).toUpperCase()).slice(-8);
  }

  /* ---------------------------------------------- PANS-AIM data catalogue */
  // [class, horizontal accuracy m, vertical accuracy m] (PANS-AIM Doc 10066, Appendix 1)
  var REQ = {
    THR: ['critical', 1, 0.5], RWYEND: ['critical', 1, 0.5], RCP: ['critical', 1, 0.5], THRP: ['critical', 1, 0.25],
    ARP: ['routine', 30, 0.5], ADELEV: ['essential', null, 0.5], HOLD: ['critical', 0.5, null], TWY: ['essential', 0.5, null],
    STAND: ['routine', 0.5, null], ILS: ['essential', 3, 3], ADNAV: ['essential', 3, 30], ENRNAV: ['essential', 100, 30],
    DP: ['essential', 100, null], OBS2: ['essential', 5, 3], OBS1: ['routine', 50, 30], APN: ['routine', 1, null]
  };
  var RES = { critical: 2, essential: 1, routine: 0 }; // decimals of seconds in the fingerprint

  function acc(o, k) { o = arr(o)[0]; if (!o) return null; var q = arr(o[k])[0]; if (!q || q.nil !== undefined || q.v === undefined) return null; var v = parseFloat(q.v); if (isNaN(v)) return null; return /FT/i.test(q.u || '') ? v * 0.3048 : /KM/i.test(q.u || '') ? v * 1000 : v; }
  function elevM(o) { return acc(o, 'elevation'); }
  function locOf(r) {
    var p = r.cur.p;
    if (r.k === 'AirportHeliport') return arr(p.ARP)[0];
    if (r.k === 'VerticalStructure') { var part = arr(p.part)[0] || {}; return arr(part.horizontalProjection_location || part.horizontalProjection_surface || part.horizontalProjection_curve)[0]; }
    return arr(p.location)[0];
  }

  // all classified data items of a data set
  function items(ds) {
    var out = [], adPos = (ds.byType.AirportHeliport || []).map(function (a) { return M.pointOf(ds, a); }).filter(Boolean);
    function near(c) { return adPos.some(function (a) { return AX.distNM(a, c) < 5.4; }); } // about 10 km: aerodrome / Area 2
    function add(r, item, key, extra) {
      var c = M.pointOf(ds, r);
      if (!c) return;
      var q = REQ[key], loc = locOf(r), el = loc ? elevM(loc) : null;
      if (key === 'ADELEV') el = acc(r.cur.p, 'fieldElevation');
      out.push({ rec: r, item: item, key: key, cls: q[0], reqH: q[1], reqV: q[2], pos: c, elev: el, decH: loc ? acc(loc, 'horizontalAccuracy') : null,
        decV: key === 'ADELEV' ? acc(r.cur.p, 'fieldElevationAccuracy') : loc ? acc(loc, 'verticalAccuracy') : null, extra: extra || '' });
    }
    (ds.byType.AirportHeliport || []).forEach(function (a) { add(a, 'Aerodrome reference point', 'ARP'); add(a, 'Aerodrome elevation', 'ADELEV'); });
    var prec = new Set();
    (ds.byType.Navaid || []).forEach(function (n) { if (/ILS|MLS|GLS/.test(s(n.cur.p.type))) { var rd = M.target(ds, n.cur.p.runwayDirection); if (rd) prec.add(rd); } });
    (ds.byType.RunwayCentrelinePoint || []).forEach(function (c) {
      var role = s(c.cur.p.role), rd = M.target(ds, c.cur.p.onRunway);
      if (role === 'THR' || role === 'DISTHR') add(c, 'Runway threshold', rd && prec.has(rd) ? 'THRP' : 'THR');
      else if (role === 'END') add(c, 'Runway end', 'RWYEND');
      else add(c, 'Runway centre line point' + (role ? ' (' + role + ')' : ''), 'RCP');
    });
    (ds.byType.TaxiHoldingPosition || []).forEach(function (h) { add(h, 'Taxi-holding position', 'HOLD'); });
    (ds.byType.AircraftStand || []).forEach(function (h) { add(h, 'Aircraft stand', 'STAND'); });
    (ds.byType.Localizer || []).concat(ds.byType.Glidepath || [], ds.byType.MarkerBeacon || []).forEach(function (n) { add(n, n.k === 'Glidepath' ? 'ILS glide path' : n.k === 'Localizer' ? 'ILS localizer' : 'Marker beacon', 'ILS'); });
    ['VOR', 'DME', 'NDB', 'TACAN'].forEach(function (k) { (ds.byType[k] || []).forEach(function (n) { var c = M.pointOf(ds, n); add(n, k + (c && near(c) ? ' (aerodrome)' : ' (en-route)'), c && near(c) ? 'ADNAV' : 'ENRNAV'); }); });
    (ds.byType.DesignatedPoint || []).forEach(function (d) { add(d, 'Designated point', 'DP'); });
    (ds.byType.VerticalStructure || []).forEach(function (o) { var c = M.pointOf(ds, o); add(o, c && near(c) ? 'Obstacle (Area 2)' : 'Obstacle (Area 1)', c && near(c) ? 'OBS2' : 'OBS1'); });
    out.forEach(function (it) {
      it.ident = M.label(ds, it.rec);
      var dec = RES[it.cls];
      it.posTxt = AX.fmtPos(it.pos, dec);
      it.text = [it.rec.k, it.ident, it.item, it.posTxt.split(' ')[0], it.posTxt.split(' ')[1], it.elev === null ? '' : it.elev.toFixed(1)].join(';');
      it.crc = crc32q(it.text);
      it.key = [it.rec.k, it.rec.id, it.item].join(';'); // stable across deliveries: feature type, AIXM identifier (UUID), data item
      var bad = [];
      if (it.reqH !== null) { if (it.decH === null) bad.push('H not declared'); else if (it.decH > it.reqH + 1e-9) bad.push('H ' + it.decH + ' m > ' + it.reqH + ' m'); }
      if (it.reqV !== null && it.elev !== null) { if (it.decV === null) bad.push('V not declared'); else if (it.decV > it.reqV + 1e-9) bad.push('V ' + it.decV + ' m > ' + it.reqV + ' m'); }
      it.status = !bad.length ? 'OK' : bad.some(function (b) { return />/.test(b); }) ? 'Insufficient accuracy' : 'Accuracy not declared';
      it.note = bad.join('; ');
    });
    return out;
  }
  // CRC values published in the file itself
  function published(ds) {
    var out = [];
    ds.recs.forEach(function (r) {
      if (r.raw && r.raw.valCrc) out.push({ rec: r, field: 'valCrc (AIXM 4.5)', value: typeof r.raw.valCrc === 'object' ? s(r.raw.valCrc) : String(r.raw.valCrc) });
      (function walk(v, d) {
        if (!v || typeof v !== 'object' || d > 6) return;
        if (Array.isArray(v)) { v.forEach(function (x) { walk(x, d + 1); }); return; }
        for (var k in v) { if (k === 'CRCRemainder' && s(v[k])) out.push({ rec: r, field: 'CRCRemainder (FAS data block)', value: s(v[k]) }); else if (typeof v[k] === 'object') walk(v[k], d + 1); }
      })(r.cur && r.cur.p, 0);
    });
    return out;
  }
  // CSV of the fingerprints (key;crc) and its verification against the current data
  function toCsv(list) { return 'key;crc32q;class;feature\n' + list.map(function (it) { return '"' + it.key.replace(/"/g, '""') + '";' + it.crc + ';' + it.cls + ';"' + it.ident.replace(/"/g, '""') + '"'; }).join('\n') + '\n'; }
  function verify(list, csv) {
    var ref = new Map();
    String(csv).split(/\r?\n/).slice(1).forEach(function (line) {
      var m = line.match(/^"((?:[^"]|"")*)";([0-9A-Fa-f]{8})/);
      if (m) ref.set(m[1].replace(/""/g, '"'), m[2].toUpperCase());
    });
    var res = { same: 0, changed: [], added: [], missing: [] }, seen = new Set();
    list.forEach(function (it) {
      var c = ref.get(it.key);
      seen.add(it.key);
      if (c === undefined) res.added.push(it); else if (c === it.crc) res.same++; else res.changed.push({ it: it, was: c });
    });
    ref.forEach(function (v, k) { if (!seen.has(k)) res.missing.push({ key: k, crc: v }); });
    res.reference = ref.size;
    return res;
  }

  return { crc32q: crc32q, items: items, published: published, toCsv: toCsv, verify: verify, REQ: REQ };
})();
