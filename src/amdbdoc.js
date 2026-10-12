/*!
 * AIXM Code Converter
 * Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com> - author of the AIXM Code Converter
 * SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE; keep this notice in all copies)
 * ==========================================================================
 * AIXM Code Converter - the State's charts and documents for aerodrome mapping (AMDBDOC)
 * NOT FOR NAVIGATION - for study and analysis only.
 * What the State publishes beside its AIP data set: the Aerodrome Chart, the Aerodrome Ground Movement Chart and the
 * Aircraft Parking / Docking Chart (ICAO Annex 4 Chapters 13, 14, 15), the AD 2 text pages, stand tables.
 *   Read      the text of a PDF (PDF.js, loaded only now, opened without running any of its code), of a text or
 *             CSV file, or pasted; lines rebuilt whatever the text direction (rotated charts) and however the
 *             producer split the words; common misreadings of a scanned and recognised text repaired in numbers.
 *   Facts     every coordinate with what it is (stand, threshold, runway end, reference point, holding position),
 *             stand coordinates tables, stand, taxiway and apron names, runway dimensions, bearing strength (PCN /
 *             PCR), taxiway and shoulder widths, approach and runway lighting, magnetic variation, elevation, hot
 *             spots — each with the line it came from.
 *   Checks    the chart type and its ICAO Annex 4 contents (what the text shows, what it does not, what only the
 *             drawing can show); the chart against the AIP data set (reference point, thresholds, dimensions,
 *             strength, elevation, magnetic variation) and OpenStreetMap (stand positions); doubtful values (a
 *             stand far from all others, two positions for one stand, a runway length the thresholds contradict).
 *   Fill      what the AIP data set lacks: stands, thresholds, widths, strength, lighting — the generator takes
 *             them in this order: AIP data set, the State's charts, traced on imagery, OpenStreetMap, ICAO Annex 14.
 * Charts of commercial providers (e.g. Jeppesen) are licensed for display only: they are not read for data.
 * Loaded only when used (src/lazy.js).
 * ========================================================================== */
/* global LAZY, AIP */
var AMDBDOC = (function () {
  'use strict';
  var D2R = Math.PI / 180;
  var DOCS = [], seq = 0;
  function esc(t) { return String(t === undefined || t === null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function dist(a, b) { var k = Math.cos((a[1] + b[1]) / 2 * D2R); return Math.hypot((a[0] - b[0]) * k, a[1] - b[1]) * 111320; }
  function n(v) { var x = parseFloat(String(v).replace(',', '.')); return isNaN(x) ? null : x; }

  /* ---------------------------------------------------------------- PDF text */
  // the text of a PDF as lines: the text pieces of a page grouped by their direction and their line (a rotated
  // chart reads as well as an upright one); a wide gap between two pieces is kept as a tab (table columns)
  async function pdfRead(bytes) {
    await LAZY.run('lazy-pdfjs');
    var lib = window.pdfjsLib || window['pdfjs-dist/build/pdf'];
    // the worker is given as a port: PDF.js would otherwise wrap a blob address in a second worker, which a page
    // opened from a file (an opaque origin) cannot load; without a worker PDF.js reads in this thread
    if (!lib.GlobalWorkerOptions.workerPort && !lib.GlobalWorkerOptions.workerSrc) {
      try { lib.GlobalWorkerOptions.workerPort = new Worker(URL.createObjectURL(new Blob([LAZY.text('lazy-pdfworker')], { type: 'text/javascript' }))); }
      catch (e) { lib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([LAZY.text('lazy-pdfworker')], { type: 'text/javascript' })); }
    }
    var doc = await lib.getDocument({ data: bytes, isEvalSupported: false, disableFontFace: true, useSystemFonts: false }).promise, lines = [], pieces = 0;
    for (var i = 1; i <= doc.numPages; i++) {
      var tc = await (await doc.getPage(i)).getTextContent();
      pieces += tc.items.length;
      textLines(tc.items).forEach(function (t) { lines.push({ t: t, p: i }); });
    }
    var pages = doc.numPages;
    await doc.destroy();
    return { lines: lines, pages: pages, textless: pieces < 5 };
  }
  function textLines(items) {
    var groups = {};
    items.forEach(function (it) {
      if (!it.str || !it.str.trim()) return;
      var m = it.transform, ang = Math.atan2(m[1], m[0]), h = Math.hypot(m[2], m[3]) || 1, q = Math.round(ang / D2R);
      var key = Math.abs(q % 90) <= 2 || Math.abs(q % 90) >= 88 ? String((Math.round(q / 90) * 90 + 360) % 360) : 'a' + q; // upright / rotated, or along a runway
      var u = [Math.cos(ang), Math.sin(ang)], nn = [-u[1], u[0]];
      (groups[key] = groups[key] || []).push({ s: it.str, h: h, w: it.width || it.str.length * h * 0.5, along: m[4] * u[0] + m[5] * u[1], perp: m[4] * nn[0] + m[5] * nn[1] });
    });
    var out = [];
    Object.keys(groups).forEach(function (k) {
      var g = groups[k].sort(function (a, b) { return b.perp - a.perp; }), rows = [];
      g.forEach(function (x) { var r = rows[rows.length - 1]; if (r && Math.abs(r.perp - x.perp) <= 0.45 * Math.max(r.h, x.h)) r.items.push(x); else rows.push({ perp: x.perp, h: x.h, items: [x] }); });
      rows.forEach(function (r) {
        var its = r.items.sort(function (a, b) { return a.along - b.along; }), t = '';
        its.forEach(function (x, j) {
          if (j) { var p = its[j - 1], gap = x.along - (p.along + p.w); t += gap > 2.5 * x.h ? '\t' : gap > 0.15 * x.h ? ' ' : ''; }
          t += x.s;
        });
        out.push(t.replace(/[ \u00a0]+/g, ' ').trim());
      });
    });
    return out.filter(Boolean);
  }

  /* --------------------------------------------------------------- the text */
  // misreadings of a scanned text in numbers (O for 0, I or l for 1) and typographic quotes and degree signs
  function clean(line) {
    line = String(line).replace(/[’′‘`´]/g, '\'').replace(/[″“”]/g, '"').replace(/[º˚]/g, '°').replace(/\u00a0/g, ' ');
    return line.replace(/[0-9OoIl|.,°'"]{4,}[NSEW]?/g, function (t) { return (t.match(/\d/g) || []).length >= 3 ? t.replace(/[Oo]/g, '0').replace(/[Il|]/g, '1') : t; });
  }
  // a coordinate pair in a line, from position 'from': DMS (251530.12N 0513612.34E, 25 15 30.12 N, N25°15'30.12"),
  // or decimal degrees; {at, end, lat, lon}
  var LAT = /(?:([NS])\s*)?(\d{1,2})(?:[°\s:]\s*|(?=\d{2}))(\d{2})(?:['\s:]\s*|(?=\d{2}))(\d{2}(?:[.,]\d+)?)\s*"?\s*([NS])?/g;
  var LON = /(?:([EW])\s*)?(\d{1,3})(?:[°\s:]\s*|(?=\d{2}))(\d{2})(?:['\s:]\s*|(?=\d{2}))(\d{2}(?:[.,]\d+)?)\s*"?\s*([EW])?/y;
  function dd(d, mi, se, h) { var v = +d + +mi / 60 + parseFloat(String(se).replace(',', '.')) / 3600; return /[SW]/.test(h) ? -v : v; }
  function ok(p) { return p && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180 && !(p.lat === 0 && p.lon === 0); }
  function coordAt(line, from) {
    var s = line.slice(from), best = null, m;
    // a match that starts inside a longer number is not a coordinate
    var whole = function (re) { var x; re.lastIndex = 0; while ((x = re.exec(s))) { if (!x.index || !/[\d.]/.test(s.charAt(x.index - 1))) return x; re.lastIndex = x.index + 1; } return null; };
    var A = whole(/(\d{2})(\d{2})(\d{2}(?:[.,]\d+)?)\s*([NS])[\s,;/|\t]{0,4}(\d{3})(\d{2})(\d{2}(?:[.,]\d+)?)\s*([EW])/g);
    if (A) best = { at: A.index, end: A.index + A[0].length, lat: dd(A[1], A[2], A[3], A[4]), lon: dd(A[5], A[6], A[7], A[8]) };
    var B = whole(/([NS])\s*(\d{2})(\d{2})(\d{2}(?:[.,]\d+)?)[\s,;/|\t]{0,4}([EW])\s*(\d{3})(\d{2})(\d{2}(?:[.,]\d+)?)/g);
    if (B && (!best || B.index < best.at)) best = { at: B.index, end: B.index + B[0].length, lat: dd(B[2], B[3], B[4], B[1]), lon: dd(B[6], B[7], B[8], B[5]) };
    LAT.lastIndex = 0;
    while ((m = LAT.exec(s)) && (!best || m.index < best.at)) {
      if (!(m[1] || m[5]) || (!m[1] && m.index > 0 && /[\d.]/.test(s.charAt(m.index - 1)))) { LAT.lastIndex = m.index + 1; continue; }
      var rest = m.index + m[0].length, gap = /^[\s,;/|\t]{0,6}/.exec(s.slice(rest))[0].length;
      LON.lastIndex = rest + gap;
      var lo = LON.exec(s);
      if (lo && (lo[1] || lo[5])) { best = { at: m.index, end: LON.lastIndex, lat: dd(m[2], m[3], m[4], m[1] || m[5]), lon: dd(lo[2], lo[3], lo[4], lo[1] || lo[5]) }; break; }
      LAT.lastIndex = m.index + 1;
    }
    var de = whole(/([NS])?\s*(-?\d{1,2}[.,]\d{4,})\s*°?\s*([NS])?[\s,;/|\t]+([EW])?\s*(-?\d{1,3}[.,]\d{4,})\s*°?\s*([EW])?/g);
    if (de && (!best || de.index < best.at)) {
      var a = n(de[2]), b = n(de[5]);
      if (/S/.test((de[1] || '') + (de[3] || ''))) a = -Math.abs(a);
      if (/W/.test((de[4] || '') + (de[6] || ''))) b = -Math.abs(b);
      best = { at: de.index, end: de.index + de[0].length, lat: a, lon: b };
    }
    if (!best || !ok(best)) return null;
    best.at += from; best.end += from;
    return best;
  }
  function coordsIn(line) { var out = [], at = 0, p; while ((p = coordAt(line, at))) { out.push(p); at = p.end; } return out; }
  // runway designators named in a line: after RWY, in a reciprocal pair (16L/34R, 10R-28L), or opening a table row
  function des2(x) { var m = /^0?(\d{1,2})([LRC]?)$/.exec(String(x).trim().toUpperCase()); return m && +m[1] >= 1 && +m[1] <= 36 ? ('0' + m[1]).slice(-2) + m[2] : ''; }
  function desOf(line, coordFirst) {
    var out = [], L = line.toUpperCase(), m;
    var re = /\bRWY?S?\s*((?:\d{1,2}[LRC]?)(?:\s*(?:,|AND|&|\/|-|–)\s*\d{1,2}[LRC]?)*)/g;
    while ((m = re.exec(L))) m[1].split(/\s*(?:,|AND|&|\/|-|–)\s*/).forEach(function (x) { var d = des2(x); if (d) out.push(d); });
    var pr = /\b(\d{2}[LRC]?)\s*[/\-–]\s*(\d{2}[LRC]?)\b/g;
    while ((m = pr.exec(L))) { var a = des2(m[1]), b = des2(m[2]); if (a && b && Math.abs(parseInt(a, 10) - parseInt(b, 10)) === 18) out.push(a, b); }
    var st = /^\s*(?:RWY\s*)?(\d{2}[LRC]?)(?=[\s:\t]|$)/.exec(L);
    if (st && !coordFirst && /\bTHR\b|\bRWY\b|\d{3,5}\s*M?\s*[X×]|\bPC[NR]\b|°|LIGHT|LGT|\bALS\b|PAPI|\bSWY\b|\bCWY\b|ELEV|TORA|LDA/.test(L)) { var d0 = des2(st[1]); if (d0) out.push(d0); }
    return out.filter(function (x, i, a2) { return a2.indexOf(x) === i; });
  }
  function opposite(d) { var m = /^(\d{2})([LRC]?)$/.exec(d); if (!m) return ''; var k = (+m[1] + 18 - 1) % 36 + 1; return ('0' + k).slice(-2) + ({ L: 'R', R: 'L', C: 'C' }[m[2]] || ''); }

  /* ----------------------------------------------------------- chart types */
  // ICAO Annex 4: the chart types an aerodrome may have, and what each must show (13.6.1, 14.6.1, 15.6.1). 'drawn':
  // an element only the drawing can show (a symbol, a line), so its absence from the text says nothing
  var KINDS = {
    adc: { name: 'Aerodrome / Heliport Chart — ICAO', ch: 'Annex 4 Chapter 13', amdb: true },
    agmc: { name: 'Aerodrome Ground Movement Chart — ICAO', ch: 'Annex 4 Chapter 14', amdb: true },
    apdc: { name: 'Aircraft Parking / Docking Chart — ICAO', ch: 'Annex 4 Chapter 15', amdb: true },
    aoca: { name: 'Aerodrome Obstacle Chart — ICAO Type A', ch: 'Annex 4 Chapter 3' },
    aocb: { name: 'Aerodrome Obstacle Chart — ICAO Type B', ch: 'Annex 4 Chapter 4' },
    patc: { name: 'Precision Approach Terrain Chart — ICAO', ch: 'Annex 4 Chapter 6' },
    sid: { name: 'Standard Departure Chart — Instrument (SID) — ICAO', ch: 'Annex 4 Chapter 9' },
    star: { name: 'Standard Arrival Chart — Instrument (STAR) — ICAO', ch: 'Annex 4 Chapter 10' },
    iac: { name: 'Instrument Approach Chart — ICAO', ch: 'Annex 4 Chapter 11' },
    vac: { name: 'Visual Approach Chart — ICAO', ch: 'Annex 4 Chapter 12' },
    ad2: { name: 'AIP AD 2 text pages', ch: 'Annex 15 / PANS-AIM Appendix 2 (AD 2)', amdb: true },
    table: { name: 'Table of stand coordinates', ch: '', amdb: true },
    other: { name: 'Document (type not recognised)', ch: '' }
  };
  function kindOf(text) {
    var T = text.slice(0, 6000).toUpperCase().replace(/\s+/g, ' '), A = text.toUpperCase().replace(/\s+/g, ' ');
    var k = /GROUND MOVEMENT CHART/.test(T) ? 'agmc' : /(PARKING\s*\/?\s*(AND\s*)?DOCKING|DOCKING CHART|PARKING CHART|STAND CHART|APDC)/.test(T) ? 'apdc'
      : /AERODROME OBSTACLE CHART.{0,40}TYPE\s*B|AOC\s*TYPE\s*B/.test(T) ? 'aocb' : /AERODROME OBSTACLE CHART|AOC\s*TYPE\s*A/.test(T) ? 'aoca'
        : /PRECISION APPROACH TERRAIN/.test(T) ? 'patc' : /VISUAL APPROACH CHART/.test(T) ? 'vac'
          : /INSTRUMENT APPROACH CHART|\b(ILS|LOC|RNP|RNAV|VOR|NDB)\b.{0,20}\bRWY\s*\d{2}/.test(T) && !/AERODROME CHART/.test(T) ? 'iac'
            : /STANDARD (INSTRUMENT )?DEPARTURE|\bSID\b/.test(T) && !/AERODROME CHART/.test(T) ? 'sid' : /STANDARD (INSTRUMENT )?ARRIVAL|\bSTAR\b/.test(T) && !/AERODROME CHART/.test(T) ? 'star'
              : /AERODROME\s*(\/\s*HELIPORT\s*)?CHART|HELIPORT CHART|AIRPORT DIAGRAM|\bADC\b/.test(T) ? 'adc'
                : /\bAD\s*2\.\s*\d{1,2}\b/.test(A) ? 'ad2' : 'other';
    return { id: k, icaoTitle: /CHART\s*[-–—]+\s*ICAO/.test(T) };
  }

  /* ----------------------------------------------------------------- facts */
  var STOP = { CL: 1, TO: 1, AT: 1, ON: 1, IN: 1, OF: 1, BY: 1, IS: 1, NO: 1, NR: 1, OR: 1, AS: 1, BE: 1, IF: 1, UP: 1, FT: 1, WID: 1, LGT: 1, BTN: 1, AND: 1, ALL: 1, THE: 1, FOR: 1, VIA: 1, EDGE: 1, RWY: 1, TWY: 1, HS: 1, ILS: 1, CAT: 1 };
  var LIGHTS = [
    [/\bPALS\s*CAT\s*(III|II|I|3|2|1)\b|\bCAT\s*(III|II|I|3|2|1)\s*(?:PALS|ALS|APCH\s*L(?:IGH)?TS?|APPROACH\s*LIGHT)/, 'ALS', function (m) { var r = m[1] || m[2]; return 'CAT' + ({ III: 3, II: 2, I: 1 }[r] || r); }],
    [/\bALSF[-\s]?2\b/, 'ALS', 'CAT2'], [/\bALSF[-\s]?1\b/, 'ALS', 'CAT1'], [/\bSSALR\b|\bMALSR\b|\bHIALS\b|\bCALVERT\b/, 'ALS', 'CAT1'],
    [/\bSALS\b|\bSALSF\b|\bSSALS\b|\bMALSF?\b|\bODALS\b|\bLIALS\b|\bMIALS\b|\bSIMPLE\s+(?:APCH|APPROACH)\s+L/, 'ALS', 'SIMPLE'],
    [/\bA?PAPI\b/, 'PAPI'], [/\b(?:A?T-?)?VASIS?\b/, 'VASIS'],
    [/\b(?:HIRL|MIRL|LIRL|REDL)\b|\bRWY\s*EDGE\s*(?:L(?:IGH)?TS?|LGT)\b|\bEDGE\s*LIGHTS?\b/, 'EDGE'],
    [/\b(?:RCLL?|RCLS)\b|\bRWY\s*(?:CL|CENTRE\s*LINE|CENTER\s*LINE)\s*(?:L(?:IGH)?TS?|LGT)\b/, 'CL'],
    [/\bTDZL?\b|\bTOUCHDOWN\s*ZONE\s*L(?:IGH)?TS?\b/, 'TDZ'],
    [/\bRTHL\b|\b(?:RWY\s*)?THR\s*(?:L(?:IGH)?TS?|LGT)\b|\bTHRESHOLD\s*L(?:IGH)?TS?\b/, 'THR'],
    [/\bRENL\b|\bRWY\s*END\s*(?:L(?:IGH)?TS?|LGT)\b|\bEND\s*LIGHTS?\b/, 'END'],
    [/\bREIL\b/, 'REIL'], [/\bSTOP\s*BARS?\b/, 'STOPBAR'], [/\bRGL\b|\bRUNWAY\s*GUARD\s*L(?:IGH)?TS?\b|\bWIG\s*WAGS?\b/, 'RGL'],
    [/\bTWY\s*(?:CL|CENTRE\s*LINE|CENTER\s*LINE)\s*(?:L(?:IGH)?TS?|LGT)?\b|\bGREEN\s*(?:CL|CENTRE)/, 'TWYCL'], [/\bTWY\s*EDGE\b|\bBLUE\s*EDGE/, 'TWYEDGE']];
  var LNAME = { ALS: 'approach lighting', PAPI: 'PAPI', VASIS: 'VASIS', EDGE: 'runway edge lights', CL: 'runway centre line lights', TDZ: 'touchdown zone lights', THR: 'threshold lights', END: 'runway end lights', REIL: 'runway end identifier lights', STOPBAR: 'stop bars', RGL: 'runway guard lights', TWYCL: 'taxiway centre line lights', TWYEDGE: 'taxiway edge lights' };
  function idOf(tok) { return /^[A-Z]{0,3}\d{1,4}[A-Z]{0,2}$/.test(tok) && !/^\d{5,}$/.test(tok) ? tok : ''; }
  function expand(a, b) {
    var ma = /^([A-Z]{0,3})(\d{1,4})$/.exec(a), mb = /^([A-Z]{0,3})(\d{1,4})$/.exec(b);
    if (!ma || !mb || ma[1] !== mb[1] || +mb[2] < +ma[2] || +mb[2] - +ma[2] > 150) return [a, b];
    var out = []; for (var i = +ma[2]; i <= +mb[2]; i++) out.push(ma[1] + i); return out;
  }
  // everything a document says for aerodrome mapping
  function read(text, name) {
    var raw = String(text || '').split(/\r?\n/), lines = raw.map(clean), U = lines.map(function (l) { return l.toUpperCase(); }), all = U.join('\n');
    var f = { name: name || 'document', kind: kindOf(raw.join('\n')), icao: [], coords: [], stands: [], standNames: [], twyNames: [], apronNames: [], rwy: {}, dims: [], pcn: [], twyW: {}, shoulder: {}, lights: [], hotspots: [], ev: {}, lines: lines.length, chars: all.length };
    var add = function (list, v) { if (v && list.indexOf(v) < 0) list.push(v); };
    var ev = function (k, i) { if (!f.ev[k]) f.ev[k] = lines[i].replace(/\t/g, '  ').trim().slice(0, 160); };
    var rw = function (d) { return (f.rwy[d] = f.rwy[d] || {}); };
    // ICAO location indicators (a stand-alone four-letter word next to a coordinate, a title or the word ICAO)
    var reI = /\b([A-Z]{4})\b/g, mI, cand = {};
    U.slice(0, 80).concat(U.filter(function (l) { return /ICAO|AD\s*2|AERODROME|AIRPORT/.test(l); })).forEach(function (l) { reI.lastIndex = 0; while ((mI = reI.exec(l))) cand[mI[1]] = (cand[mI[1]] || 0) + 1; });
    f.icaoCand = Object.keys(cand);
    var ctx = '', ctxAge = 0;
    lines.forEach(function (line, i) {
      var L = U[i], cs = coordsIn(line), ds = desOf(L, cs.length && cs[0].at < 4);
      // what the following lines of a table are
      if (!cs.length && /\b(STAND|STANDS|GATE|PARKING|AIRCRAFT STAND|INS|GNSS|CHECK ?POINT)\b/.test(L) && /\b(COORD|POSITION|LAT|LONG|WGS|TABLE|INS|GNSS|LOCATION)/.test(L)) { ctx = 'stand'; ctxAge = 0; }
      else if (!cs.length && /\b(THR|THRESHOLD)\b.*\b(COORD|LAT|POSITION)/.test(L)) { ctx = 'thr'; ctxAge = 0; }
      else if (!cs.length && ++ctxAge > 60) ctx = '';
      // coordinates and what they are
      cs.forEach(function (p, j) {
        var before = L.slice(j ? cs[j - 1].end : 0, p.at), lab = /\bARP\b|REFERENCE\s*POINT|AD\s*REF/.test(before) ? 'arp' : /\bDTHR\b|DISPLACED/.test(before) ? 'dthr' : /\bTHR\b|THRESHOLD/.test(before) ? 'thr'
          : /\bRWY\s*END\b|\bEND\s*OF\s*RWY\b|\bEND\b|\bSTART\b|\bSOR\b/.test(before) ? 'end' : /\bHOLD|HLDG\b/.test(before) ? 'hold' : /\b(STAND|STD|GATE|PARKING|PRKG|INS|GNSS)\b/.test(before) ? 'stand'
            : /\bTWY\b|TAXIWAY|\bCL\s*(PT|POINT)/.test(before) ? 'twy' : /\b(VOR|DME|LOC|GP|NDB|TACAN)\b/.test(before) ? 'nav' : '';
        if (!lab && ctx === 'stand') lab = 'stand';
        if (!lab && (ctx === 'thr' || ds.length) && /^\s*(RWY\s*)?\d{2}[LRC]?\b/.test(L)) lab = j === 0 ? 'thr' : 'end';
        var toks = line.slice(j ? cs[j - 1].end : 0, p.at).replace(/\b(STAND|STD|PARKING|POSITION|GATE|NO\.?|NR\.?|INS|GNSS)\b/gi, ' ').trim().split(/[\s|;,\t]+/).filter(Boolean);
        var id = toks.map(function (x) { return idOf(x.toUpperCase()); }).filter(Boolean).pop() || '';
        var rec = { c: [p.lon, p.lat], label: lab || 'point', line: i, des: ds[0] || '' };
        if (lab === 'stand' || (!lab && id && !ds.length && !/\b(RWY|THR|ARP|VOR|DME)\b/.test(L))) { rec.label = 'stand'; rec.id = id; if (!/^\d{2}[LRC]$/.test(id) || ctx === 'stand') f.stands.push({ id: id, c: rec.c, line: i }); }
        if (rec.label === 'thr' || rec.label === 'dthr' || rec.label === 'end') { var d1 = ds[0] || (/^\s*(?:RWY\s*)?(\d{2}[LRC]?)\b/.exec(L) || [])[1]; d1 = d1 ? des2(d1) : ''; if (d1) { rec.des = d1; var R = rw(d1); if (rec.label === 'thr' && !R.thr) R.thr = rec.c; else if (rec.label === 'dthr' && !R.dthr) R.dthr = rec.c; else if (rec.label === 'end' && !R.end) R.end = rec.c; ev('thrc', i); } }
        if (rec.label === 'arp' && !f.arp) { f.arp = rec.c; ev('arp', i); }
        if (rec.label === 'stand') ev('stdc', i);
        if (rec.label === 'twy') ev('twyc', i);
        f.coords.push(rec);
      });
      // stand names (lists and ranges) where a line speaks of stands but gives no coordinates
      if (!cs.length && /\b(STANDS?|GATES?|PARKING POSITIONS?)\b/.test(L)) {
        var body = L.replace(/^.*?\b(STANDS?|GATES?|PARKING POSITIONS?)\b/, ''), rg = /\b([A-Z]{0,3}\d{1,4})\s*(?:-|–|TO|THRU|THROUGH)\s*([A-Z]{0,3}\d{1,4})\b/g, m2;
        while ((m2 = rg.exec(body))) expand(m2[1], m2[2]).forEach(function (x) { add(f.standNames, x); });
        body.replace(rg, ' ').split(/[\s,;/&]+|\bAND\b/).forEach(function (x) { x = idOf(x.trim()); if (x && /\d/.test(x) && x.length <= 6) add(f.standNames, x); });
        ev('std', i);
      }
      // taxiway and apron names
      var tw = /\b(?:TWYS?|TAXIWAYS?|TAXILANES?)\s+((?:[A-Z]{1,2}\d{0,2}[A-Z]?\b)(?:\s*(?:,|AND|&|\/)\s*[A-Z]{1,2}\d{0,2}[A-Z]?\b)*)/g, m3;
      while ((m3 = tw.exec(L))) m3[1].split(/\s*(?:,|AND|&|\/)\s*/).forEach(function (x) { x = x.trim(); if (x && !STOP[x] && x.length <= 4) { add(f.twyNames, x); ev('twy', i); } });
      var ap = /\bAPRON\s+([A-Z0-9]{1,4})\b|\b([A-Z][A-Z0-9]{1,10}(?:\s[A-Z0-9]{1,10})?)\s+APRON\b/g, m4;
      while ((m4 = ap.exec(L))) { var an = (m4[1] || m4[2] || '').trim().replace(/^((AND|THE|OF|ON|TO|AT|FROM|FOR|VIA|ALL|ANY|EACH|AN|A|IN)\s+)+/, ''); if (an && !/^(THE|OF|ON|AND|ALL|TO|FROM|AT|PER|NEW|FOR|LGT|CL|ANY|EACH|AN|A)$/.test(an) && !/\b(TWY|RWY|ELEV|WIDTH|STAND|SURFACE)\b/.test(an)) { add(f.apronNames, an); ev('apn', i); } }
      // runway dimensions: length × width, metres or feet (a width over 100 is in feet)
      var dm = /\b(\d{3,5}(?:[.,]\d+)?)\s*(M|FT)?\s*[X×x]\s*(\d{2,3}(?:[.,]\d+)?)\s*(M|FT)?\b/g, m5;
      while ((m5 = dm.exec(L))) {
        var len = n(m5[1]), wid = n(m5[3]), ft = m5[2] === 'FT' || m5[4] === 'FT' || (wid > 100 && !m5[4]);
        if (ft) { len *= 0.3048; wid *= 0.3048; }
        if (len < 300 || len > 6000 || wid < 9 || wid > 100) continue;
        var dsx = ds.length ? ds : i && desOf(U[i - 1], true).length ? desOf(U[i - 1], true) : [];
        f.dims.push({ des: dsx, len: Math.round(len), wid: Math.round(wid * 10) / 10, ft: ft, line: i });
        dsx.forEach(function (d) { var R = rw(d); if (!R.wid) { R.wid = Math.round(wid * 10) / 10; R.len = Math.round(len); } });
        ev('dims', i);
      }
      // bearing strength: PCN (Annex 14 until 2024) or PCR (from 28 November 2024)
      var pc = /\b(PCN|PCR)\s*:?\s*(\d{1,4})\s*\/?\s*([RF])\s*\/?\s*([A-D])\s*\/?\s*([W-Z])\s*\/?\s*([TU])\b/g, m6;
      while ((m6 = pc.exec(L))) {
        var near = ds.length ? ds : [-1, 1, -2, 2].map(function (o) { return U[i + o] ? desOf(U[i + o], true) : []; }).filter(function (x) { return x.length; })[0] || [];
        var v = m6[1] + ' ' + m6[2] + '/' + m6[3] + '/' + m6[4] + '/' + m6[5] + '/' + m6[6];
        f.pcn.push({ des: near, v: v, line: i }); near.forEach(function (d) { if (!rw(d).pcn) rw(d).pcn = v; });
        ev(/APRON|TWY|TAXIWAY|STAND/.test(L) && !ds.length ? 'pcnApn' : 'pcn', i);
      }
      // taxiway and shoulder widths
      if (/\b(TWY|TWYS|TAXIWAYS?)\b/.test(L) && /\bWID|\bWIDE\b|\bWIDTH\b/.test(L)) {
        var wm = /(\d{1,2}(?:[.,]\d)?)\s*M\b/.exec(L.replace(/\b\d{3,5}\s*M?\s*[X×]\s*/, ''));
        if (wm && n(wm[1]) >= 7 && n(wm[1]) <= 60) { var names = []; (L.match(/\b(?:TWYS?|TAXIWAYS?)\s+([A-Z0-9,&/ ]+?)(?=\s*(?::|\bWID|\b\d{1,2}(?:[.,]\d)?\s*M\b))/) || ['', ''])[1].split(/[\s,&/]+|\bAND\b/).forEach(function (x) { x = x.trim(); if (x && !STOP[x] && x.length <= 4) names.push(x); }); if (/\bALL\b/.test(L) || !names.length) names = ['*']; names.forEach(function (x) { if (!f.twyW[x]) f.twyW[x] = n(wm[1]); }); ev('twyw', i); }
      }
      if (/SHOULDER/.test(L)) { var sm = /(\d{1,2}(?:[.,]\d)?)\s*M\b/.exec(L); if (sm && n(sm[1]) >= 3 && n(sm[1]) <= 90) { (ds.length ? ds : ['*']).forEach(function (d) { if (!f.shoulder[d]) f.shoulder[d] = { w: n(sm[1]), total: n(sm[1]) > 25 || /TOTAL|OVERALL|INCLUDING/.test(L) }; }); ev('shd', i); } }
      // lighting, for the runways named in the line (or for all)
      LIGHTS.forEach(function (lg) {
        var mm = lg[0].exec(L); if (!mm) return;
        if (lg[1] === 'EDGE' && /\b(TWY|TAXIWAY)\s*EDGE/.test(L) && !/\bRWY\s*EDGE|HIRL|MIRL|LIRL|REDL/.test(L)) return;
        var cls = typeof lg[2] === 'function' ? lg[2](mm) : lg[2] || '';
        f.lights.push({ des: ds, kind: lg[1], cls: cls, line: i });
        ev(lg[1] === 'PAPI' || lg[1] === 'VASIS' ? 'vasis' : /TWY|STOPBAR|RGL/.test(lg[1]) ? 'twylgt' : 'rwylgt', i);
        if (lg[1] === 'STOPBAR') ev('stopbar', i);
      });
      // aerodrome elevation, magnetic variation and its annual change
      var el = /\b(?:AD|AERODROME|FIELD|AIRPORT|ARP)\s*ELEV(?:ATION)?\.?\s*:?\s*(-?\d{1,4}(?:[.,]\d)?)\s*(FT|M)?/.exec(L) || /^\s*ELEV(?:ATION)?\.?\s*:?\s*(-?\d{1,4}(?:[.,]\d)?)\s*(FT|M)\s*$/.exec(L);
      if (el && f.elev === undefined) { var ev1 = n(el[1]); if (ev1 !== null) { f.elev = el[2] === 'M' ? ev1 : Math.round(ev1 * 0.3048 * 10) / 10; f.elevFt = el[2] !== 'M'; ev('elev', i); } }
      if (/\bAPRON\b.*\bELEV|\bELEV.*\bAPRON\b/.test(L)) ev('apnElev', i);
      var mv = /\b(?:MAG(?:NETIC)?\.?\s*)?VAR(?:IATION)?\.?\s*:?\s*(\d{1,2}(?:[.,]\d+)?)\s*°?\s*([EW])\b/.exec(L) || /\b(\d{1,2}(?:[.,]\d+)?)\s*°\s*([EW])\s*\(?\s*\d{4}\s*\)?/.exec(L);
      if (mv && !f.magVar && /VAR|MAG/.test(L + (U[i - 1] || '') + (U[i + 1] || ''))) { f.magVar = (/W/.test(mv[2]) ? -1 : 1) * n(mv[1]); ev('var', i); }
      if (/ANNUAL\s*(RATE\s*OF\s*)?CHANGE|\b\d{1,2}(?:[.,]\d+)?\s*['°]\s*[EW]?\s*(\/|PER)\s*(Y|YR|YEAR|ANNUM)\b|ANNUAL\s*(DECREASE|INCREASE)/.test(L)) ev('varAnn', i);
      // hot spots
      var hs = /\bHS\s?-?(\d{1,2})\b|\bHOT\s?SPOTS?\s*(\d{0,2})/g, m7;
      while ((m7 = hs.exec(L))) { if (m7[1] || m7[2]) add(f.hotspots, 'HS' + (m7[1] || m7[2])); ev('hot', i); }
      // the other Annex 4 contents the text can show
      [['geoid', /\bGUND\b|GEOID|UNDULATION/], ['tdz', /\bTDZ\b.*ELEV|ELEV.*\bTDZ\b|\bTDZE\b/], ['thrElev', /\bTHR\b.*ELEV|ELEV.*\bTHR\b/], ['swy', /\bSWY\b|STOPWAY/], ['cwy', /\bCWY\b|CLEARWAY/],
        ['surf', /\b(CONC|CONCRETE|ASPH|ASPHALT|BITUMEN|BITU|GRASS|GRAVEL|PEM)\b/], ['brg', /\b\d{3}(?:[.,]\d+)?\s*°\s*(MAG|M|T|TRUE)?\b|\bBRG\b/], ['vdgs', /VDGS|DOCKING\s*GUIDANCE|SAFEDOCK|SAFEGATE|AGNIS|\bAPIS\b|\bPAPA\b|\bA-?VDGS\b/],
        ['hold', /HOLDING\s*POSITION|RWY\s*HOLDING|\bHLDG\s*POS|CAT\s*(II|III|I|2|3)\s*HOLD|\bHOLD\s*(LINE|POSITION)?\b/], ['ihp', /INTERMEDIATE\s*HOLDING|\bIHP\b/], ['taxiRoute', /STANDARD\s*TAXI\s*ROUTE|\bSTD\s*TAXI\s*R|TAXI\s*ROUTE/],
        ['atcBoundary', /BOUNDARY|LIMIT\s*OF\s*(ATC|TWR|APRON)|APRON\s*MANAGEMENT|AMS\s*AREA/], ['rvr', /\bRVR\b/], ['meht', /\bMEHT\b|EYE\s*HEIGHT/], ['logon', /LOGON|CPDLC|SATVOICE/],
        ['freq', /\b1[1-3]\d[.,]\d{1,3}\b.*\b(TWR|GND|GROUND|APRON|APN|DELIVERY|DEL|ATIS|CLNC|CLEARANCE|TOWER|RAMP)\b|\b(TWR|GND|GROUND|APRON|APN|DELIVERY|DEL|ATIS|CLNC|CLEARANCE|TOWER|RAMP)\b.*\b1[1-3]\d[.,]\d{1,3}\b/],
        ['obst', /OBST|OBSTACLE/], ['bldg', /TERMINAL|HANGAR|FUEL|FIRE\s*STATION|\bRFF\b|CARGO|MAINTENANCE|DE-?ICING|BUILDING|\bTWR\b|TOWER/], ['vorChk', /VOR\s*(AERODROME\s*)?CHECK\s*POINT|\bVOT\b|VOR\s*CHK/],
        ['unsuit', /UNSUITABLE|NOT\s*AVBL|NOT\s*AVAILABLE|CLOSED|UNSERVICEABLE|\bU\/S\b|NO\s*TAXI|WIP|WORK\s*IN\s*PROGRESS/], ['wingtip', /FOLDING\s*WING|WING\s*TIP/], ['scale', /\bSCALE\b|\b1\s*:\s*\d{4,6}\b|\b0\s+\d{2,3}\s+\d{3}\s+\d{3}\b/],
        ['north', /TRUE\s*NORTH|MAG(NETIC)?\s*NORTH|\bTN\b|\bMN\b/], ['wgs', /WGS[\s-]?84/], ['date', /\bAIRAC\b|\bAMDT\b|EFFECTIVE|\b\d{1,2}\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*\s+\d{2,4}\b/], ['units', /DIMENSIONS?\s*IN\s*(METRES|METERS|M)|ELEVATIONS?\s*IN\s*(FT|FEET|M)|BEARINGS?\s*(ARE\s*)?(MAGNETIC|TRUE)/],
        ['apron', /\bAPRON\b|\bRAMP\b/], ['stand', /\bSTANDS?\b|\bGATES?\b|PARKING/], ['twyName', /\bTWY|TAXIWAY/], ['rwyName', /\bRWY\b|RUNWAY/], ['marking', /MARKING/], ['servicing', /SERVICING|FUEL|DE-?ICING|ENGINE\s*RUN/], ['heli', /HELIPORT|\bFATO\b|\bTLOF\b/]
      ].forEach(function (x) { if (x[1].test(L)) ev(x[0], i); });
    });
    // a single runway pair: unassigned dimensions and strengths are its own
    f.textless = all.replace(/\s+/g, '').length < 40;
    f.title = U.slice(0, 40).concat(U.slice(-25)).join(' ').replace(/\s+/g, ' ').slice(0, 4000);
    f.standNames = f.standNames.filter(function (x) { return !/^\d{5,}$/.test(x); }).slice(0, 600);
    return f;
  }

  /* -------------------------------------------------- which aerodrome it is */
  // by the ICAO location indicator in the text, else by the coordinates within 10 km of a reference point
  function assign(f, cands) {
    var codes = cands.map(function (c) { return c.code; }), byCode = f.icaoCand.filter(function (k) { return codes.indexOf(k) >= 0; });
    f.icao = byCode;
    if (byCode.length === 1) return byCode[0];
    var votes = {};
    f.coords.forEach(function (p) { cands.forEach(function (c) { if (c.arp && dist(p.c, c.arp) < 10000) votes[c.code] = (votes[c.code] || 0) + 1; }); });
    var best = Object.keys(votes).sort(function (a, b) { return votes[b] - votes[a]; })[0];
    if (best) return best;
    var byName = cands.filter(function (c) { return words(c.name).some(function (w) { return (' ' + f.title + ' ').indexOf(' ' + w + ' ') >= 0; }); });
    if (byName.length === 1) return byName[0].code;
    return byCode[0] || (cands.length === 1 ? cands[0].code : '');
  }

  function words(name) { return String(name || '').toUpperCase().split(/[\s/,()-]+/).filter(function (w) { return w.length >= 5 && !/^(INTL|INTERNATIONAL|AIRPORT|AERODROME|AIRFIELD|REGIONAL|MUNICIPAL|MILITARY|HELIPORT|AIRBASE)$/.test(w); }); }

  /* ---------------------------------------------- what a chart gives, checked */
  // stands checked: near the aerodrome, not far from all the others, one position per stand
  function standsChecked(list, arp) {
    var out = [], left = [], seen = {};
    list.forEach(function (s) {
      if (arp && dist(s.c, arp) > 8000) { left.push({ s: s, why: 'more than 8 km from the aerodrome reference point' }); return; }
      var k = s.id || ('#' + out.length);
      if (s.id && seen[k]) { if (dist(seen[k].c, s.c) > 10) left.push({ s: s, why: 'stand ' + s.id + ' given twice with positions ' + Math.round(dist(seen[k].c, s.c)) + ' m apart (the first is kept)' }); return; }
      seen[k] = s; out.push(s);
    });
    if (out.length >= 5) {
      var nn = out.map(function (s) { var b = Infinity; out.forEach(function (o) { if (o !== s) b = Math.min(b, dist(s.c, o.c)); }); return b; }), med = nn.slice().sort(function (a, b) { return a - b; })[Math.floor(nn.length / 2)];
      var lim = Math.max(500, med * 10);
      out = out.filter(function (s, i) { if (nn[i] > lim) { left.push({ s: s, why: 'stand ' + (s.id || '') + ' lies ' + Math.round(nn[i]) + ' m from every other stand — probably misread' }); return false; } return true; });
    }
    return { ok: out, left: left };
  }
  // the documents of an aerodrome taken together: the first document that gives a value wins
  function forAd(code, arp) {
    var docs = DOCS.filter(function (d) { return d.ad === code && d.f; });
    if (!docs.length) return null;
    var K = { docs: docs.map(function (d) { return d.name; }), kinds: [], stands: [], standNames: [], twyNames: [], apronNames: [], rwy: {}, dims: [], pcn: [], twyW: {}, shoulder: {}, lights: [], hotspots: [], arp: null, elev: null, magVar: null };
    var raw = [];
    docs.forEach(function (d) {
      var f = d.f;
      if (K.kinds.indexOf(f.kind.id) < 0) K.kinds.push(f.kind.id);
      f.stands.forEach(function (s) { raw.push({ id: s.id, c: s.c, doc: d.name }); });
      ['standNames', 'twyNames', 'apronNames', 'hotspots'].forEach(function (k) { f[k].forEach(function (x) { if (K[k].indexOf(x) < 0) K[k].push(x); }); });
      Object.keys(f.rwy).forEach(function (r) { var R = K.rwy[r] = K.rwy[r] || {}; Object.keys(f.rwy[r]).forEach(function (k) { if (R[k] === undefined) { R[k] = f.rwy[r][k]; R[k + 'Doc'] = d.name; } }); });
      K.dims = K.dims.concat(f.dims); K.pcn = K.pcn.concat(f.pcn);
      Object.keys(f.twyW).forEach(function (k) { if (!K.twyW[k]) K.twyW[k] = f.twyW[k]; });
      Object.keys(f.shoulder).forEach(function (k) { if (!K.shoulder[k]) K.shoulder[k] = f.shoulder[k]; });
      f.lights.forEach(function (l) { if (!K.lights.some(function (x) { return x.kind === l.kind && x.cls === l.cls && x.des.join() === l.des.join(); })) K.lights.push(Object.assign({ doc: d.name }, l)); });
      if (!K.arp && f.arp) K.arp = f.arp; if (K.elev === null && f.elev !== undefined) K.elev = f.elev; if (K.magVar === null && f.magVar !== undefined) K.magVar = f.magVar;
    });
    var chk = standsChecked(raw, arp || K.arp);
    K.stands = chk.ok; K.standsLeft = chk.left;
    K.src = docs.map(function (d) { return d.name; }).join(', ');
    return K;
  }
  // runway dimensions a chart gives without naming the runway: the AIP runway of about the same length
  function matchDims(K, rwys) {
    (K.dims || []).forEach(function (dm) {
      if (dm.des.length) return;
      var best = null; rwys.forEach(function (r) { if (r.len && Math.abs(r.len - dm.len) / r.len < 0.03 && (!best || Math.abs(r.len - dm.len) < Math.abs(best.len - dm.len))) best = r; });
      if (best) String(best.des).split(/[/.]/).forEach(function (x) { var d = des2(x); if (d) { var R = K.rwy[d] = K.rwy[d] || {}; if (!R.wid) { R.wid = dm.wid; R.len = dm.len; R.widBy = 'length'; } } });
    });
  }
  // lights of a runway direction from the charts: of this direction, of its runway, or of every runway (one runway)
  function lightsFor(K, des, single) {
    if (!K) return [];
    var o = opposite(des);
    return K.lights.filter(function (l) { return l.des.indexOf(des) >= 0 || (!l.des.length && single) || (l.kind !== 'ALS' && l.kind !== 'PAPI' && l.kind !== 'VASIS' && l.kind !== 'TDZ' && l.des.indexOf(o) >= 0 && l.des.length >= 2); });
  }

  /* ------------------------------------------------- ICAO Annex 4 contents */
  var A4 = {
    adc: [['13.4', 'Identification: city / area and aerodrome name (ICAO location indicator)', 'id'], ['13.3.2', 'Linear scale', 'scale', 1], ['13.5', 'True and magnetic north, magnetic variation', 'var'], ['13.5', 'Annual change of the magnetic variation', 'varAnn'],
      ['13.6.1 a', 'Reference point coordinates (degrees, minutes, seconds)', 'arp'], ['13.6.1 b', 'Elevation of the aerodrome (and apron where applicable)', 'elev'], ['13.6.1 c', 'Threshold and touchdown zone elevations, geoid undulation (precision runways)', 'geoid|tdz|thrElev'],
      ['13.6.1 d', 'Runways: designation, length and width', 'dims'], ['13.6.1 d', 'Runways: bearing strength', 'pcn'], ['13.6.1 d', 'Runways: magnetic direction', 'brg'], ['13.6.1 d', 'Runways: type of surface', 'surf'], ['13.6.1 d', 'Stopways, clearways, displaced thresholds', 'swy|cwy'], ['13.6.1 d', 'Runway markings', 'marking', 1],
      ['13.6.1 e', 'Aprons with aircraft stands', 'apron+stand'], ['13.6.1 e', 'Visual docking guidance systems (location and type)', 'vdgs'], ['13.6.1 e', 'Apron bearing strength (where less than the runways)', 'pcnApn'],
      ['13.6.1 f', 'Threshold coordinates (degrees, minutes, seconds)', 'thrc'], ['13.6.1 g', 'Taxiways with designations', 'twy'], ['13.6.1 g', 'Taxiway width', 'twyw'], ['13.6.1 g', 'Taxiway lighting, stop bars', 'twylgt|stopbar'], ['13.6.1 g', 'Runway-holding positions (and intermediate holding positions)', 'hold|ihp'],
      ['13.6.1 h', 'Hot spots with their information', 'hot'], ['13.6.1 i', 'Coordinates of taxiway centre line points and aircraft stands (hundredths of seconds)', 'stdc|twyc'], ['13.6.1 j', 'Standard taxi routes', 'taxiRoute'], ['13.6.1 k', 'Boundaries of the air traffic control service', 'atcBoundary'],
      ['13.6.1 l', 'Runway visual range (RVR) observation sites', 'rvr'], ['13.6.1 m', 'Approach and runway lighting', 'rwylgt'], ['13.6.1 n', 'Visual approach slope indicators (type, angle, MEHT)', 'vasis'], ['13.6.1 o', 'Communication facilities and their channels', 'freq'],
      ['13.6.1 p', 'Obstacles to taxiing', 'obst'], ['13.6.1 q', 'Aircraft servicing areas and buildings of operational significance', 'bldg'], ['13.6.1 r', 'VOR aerodrome checkpoint (where established)', 'vorChk'], ['13.6.1 s', 'Parts of the movement area unsuitable for aircraft', 'unsuit']],
    agmc: [['14.4', 'Identification: city / area and aerodrome name', 'id'], ['14.3.2', 'Linear scale', 'scale', 1], ['14.5.1', 'True north arrow', 'north', 1], ['14.5.2', 'Magnetic variation and its annual change', 'var'],
      ['14.6.1 a', 'Apron elevation', 'apnElev|elev'], ['14.6.1 b', 'Aprons with aircraft stands', 'apron+stand'], ['14.6.1 b', 'Visual docking guidance systems', 'vdgs'], ['14.6.1 c', 'Aircraft stand coordinates (hundredths of seconds)', 'stdc'],
      ['14.6.1 d', 'Taxiways with designations', 'twy'], ['14.6.1 d', 'Taxiway width', 'twyw'], ['14.6.1 d', 'Runway-holding positions, intermediate holding positions, stop bars', 'hold|ihp|stopbar'], ['14.6.1 e', 'Hot spots', 'hot'], ['14.6.1 f', 'Standard taxi routes', 'taxiRoute'],
      ['14.6.1 g', 'Taxiway centre line point coordinates', 'twyc'], ['14.6.1 h', 'Boundaries of the air traffic control service', 'atcBoundary'], ['14.6.1 i', 'Communication facilities and their channels', 'freq'], ['14.6.1 j', 'Obstacles to taxiing', 'obst'],
      ['14.6.1 k', 'Aircraft servicing areas and buildings of operational significance', 'bldg'], ['14.6.1 l', 'VOR checkpoint', 'vorChk'], ['14.6.1 m', 'Parts of the movement area unsuitable for aircraft', 'unsuit']],
    apdc: [['15.4', 'Identification: city / area and aerodrome name', 'id'], ['15.3.2', 'Linear scale', 'scale', 1], ['15.5.1', 'True north arrow', 'north', 1], ['15.5.2', 'Magnetic variation and its annual change', 'var'],
      ['15.6.1 a', 'Apron elevation', 'apnElev|elev'], ['15.6.1 b', 'Aprons with aircraft stands', 'apron+stand'], ['15.6.1 b', 'Visual docking guidance systems', 'vdgs'], ['15.6.1 c', 'Aircraft stand coordinates (hundredths of seconds)', 'stdc'],
      ['15.6.1 d', 'Taxiway entries with designations, holding positions, stop bars', 'twy'], ['15.6.1 e', 'Hot spots', 'hot'], ['15.6.1 f', 'Taxiway centre line point coordinates', 'twyc'], ['15.6.1 g', 'Boundaries of the air traffic control service', 'atcBoundary'],
      ['15.6.1 h', 'Communication facilities and their channels', 'freq'], ['15.6.1 i', 'Obstacles to taxiing', 'obst'], ['15.6.1 j', 'Aircraft servicing areas and buildings of operational significance', 'bldg'], ['15.6.1 k', 'VOR checkpoint', 'vorChk'], ['15.6.1 l', 'Parts of the movement area unsuitable for aircraft', 'unsuit']]
  };
  // what is optional where established (hot spots, taxi routes, VOR checkpoint …): not found is not a gap
  var WHERE = { hot: 1, taxiRoute: 1, vorChk: 1, ihp: 1, vdgs: 1, pcnApn: 1, unsuit: 1, obst: 1, wingtip: 1, rvr: 1, geoid: 1 };
  function icaoCheck(f, c) {
    var list = A4[f.kind.id], items = [];
    if (list) list.forEach(function (x) {
      var keys = x[2], ev = null;
      if (keys === 'id') { var nm = words(c && c.name).filter(function (w) { return (' ' + f.title + ' ').indexOf(' ' + w + ' ') >= 0; }); ev = [c && f.icaoCand.indexOf(c.code) >= 0 ? 'ICAO location indicator ' + c.code : '', nm.length ? 'aerodrome name (' + nm.join(' ') + ')' : ''].filter(Boolean).join(' · ') || null; }
      else if (keys.indexOf('+') > 0) ev = keys.split('+').every(function (k) { return f.ev[k]; }) ? keys.split('+').map(function (k) { return f.ev[k]; }).join(' · ') : null;
      else keys.split('|').some(function (k) { if (f.ev[k]) { ev = f.ev[k]; return true; } return false; });
      items.push({ ref: x[0], what: x[1], st: ev ? 'found' : x[3] ? 'drawn' : WHERE[keys.split(/[|+]/)[0]] ? 'where' : 'missing', ev: ev || '' });
    });
    return { kind: f.kind.id, name: KINDS[f.kind.id].name, ch: KINDS[f.kind.id].ch, icaoTitle: f.kind.icaoTitle, items: items };
  }
  // the chart against the AIP data set and OpenStreetMap
  function crossCheck(K, c, osmStands) {
    var out = [];
    if (!K || !c) return out;
    if (K.arp && c.arp) { var d0 = dist(K.arp, c.arp); out.push({ what: 'Aerodrome reference point', chart: fmtC(K.arp), aip: fmtC(c.arp), diff: Math.round(d0) + ' m', st: d0 <= 30 ? 'ok' : d0 <= 300 ? 'warn' : 'bad' }); }
    c.rwys.forEach(function (r) {
      r.dirs.forEach(function (d) {
        var dz = des2(d.des), R = K.rwy[dz]; if (!R) return;
        var thr = d.pts.filter(function (q) { return /^THR$/.test(q.role) && q.c; })[0];
        if (R.thr && thr) { var d1 = dist(R.thr, thr.c); out.push({ what: 'Threshold ' + d.des, chart: fmtC(R.thr), aip: fmtC(thr.c), diff: Math.round(d1 * 10) / 10 + ' m', st: d1 <= 1 ? 'ok' : d1 <= 30 ? 'warn' : 'bad' }); }
        else if (R.thr) out.push({ what: 'Threshold ' + d.des, chart: fmtC(R.thr), aip: 'no position in the AIP data set', diff: '', st: 'fill' });
      });
      var dz2 = AMDBdes(r.des), R2 = dz2.map(function (x) { return K.rwy[x]; }).filter(Boolean)[0];
      if (R2 && R2.wid) {
        if (r.wid) out.push({ what: 'Runway ' + r.des + ' width', chart: R2.wid + ' m', aip: Math.round(r.wid * 10) / 10 + ' m', diff: '', st: Math.abs(R2.wid - r.wid) <= 1 ? 'ok' : 'bad' });
        else out.push({ what: 'Runway ' + r.des + ' width', chart: R2.wid + ' m', aip: 'not given', diff: '', st: 'fill' });
        if (r.len && R2.len) out.push({ what: 'Runway ' + r.des + ' length', chart: R2.len + ' m', aip: Math.round(r.len) + ' m', diff: '', st: Math.abs(R2.len - r.len) <= Math.max(2, r.len * 0.005) ? 'ok' : 'bad' });
      }
      if (R2 && R2.pcn) { var ap = ''; try { ap = AIP.pcn(r.sp) || ''; } catch (e) { ap = ''; } out.push({ what: 'Runway ' + r.des + ' strength', chart: R2.pcn, aip: ap || 'not given', diff: '', st: !ap ? 'fill' : ap.replace(/\W/g, '').indexOf(R2.pcn.replace(/^PC[NR]\s*/, '').replace(/\W/g, '')) >= 0 ? 'ok' : 'warn' }); }
      // the thresholds of a runway from the chart against its length
      var ds2 = r.dirs.map(function (d) { return K.rwy[des2(d.des)]; });
      if (ds2.length === 2 && ds2[0] && ds2[1] && ds2[0].thr && ds2[1].thr && r.len) { var Lt = dist(ds2[0].thr, ds2[1].thr); if (Lt > r.len * 1.05) out.push({ what: 'Runway ' + r.des + ' thresholds of the chart', chart: Math.round(Lt) + ' m apart', aip: 'runway ' + Math.round(r.len) + ' m long', diff: '', st: 'bad' }); }
    });
    var ae = null; try { ae = c.ad.cur.p.fieldElevation; ae = Array.isArray(ae) ? ae[0] : ae; } catch (e) { ae = null; }
    if (K.elev !== null && ae) { var v = parseFloat(ae.v !== undefined ? ae.v : ae), u = String(ae.u || '').toUpperCase(), aem = u === 'FT' ? v * 0.3048 : v; if (!isNaN(aem)) out.push({ what: 'Aerodrome elevation', chart: K.elev + ' m', aip: Math.round(aem * 10) / 10 + ' m', diff: '', st: Math.abs(K.elev - aem) <= 1 ? 'ok' : 'warn' }); }
    if (K.magVar !== null && !isNaN(c.magVar)) out.push({ what: 'Magnetic variation', chart: Math.abs(K.magVar) + '° ' + (K.magVar < 0 ? 'W' : 'E'), aip: Math.abs(c.magVar) + '° ' + (c.magVar < 0 ? 'W' : 'E'), diff: '', st: Math.abs(K.magVar - c.magVar) <= 1 ? 'ok' : 'warn' });
    if (K.stands.length && osmStands && osmStands.length) {
      var conf = 0, far = [];
      K.stands.forEach(function (s) { if (!s.id) return; var o = osmStands.filter(function (x) { return x.ref && x.ref.toUpperCase() === s.id; })[0]; if (!o) return; var dd2 = dist(o.c, s.c); if (dd2 <= 40) conf++; else if (dd2 > 150) far.push(s.id + ' ' + Math.round(dd2) + ' m'); });
      out.push({ what: 'Stand positions against OpenStreetMap', chart: K.stands.length + ' stand(s)', aip: conf + ' within 40 m', diff: far.length ? 'over 150 m apart: ' + far.slice(0, 8).join(', ') + (far.length > 8 ? ' …' : '') : '', st: far.length ? 'warn' : 'ok' });
    }
    (K.standsLeft || []).forEach(function (x) { out.push({ what: 'Stand left out', chart: x.s.id || '', aip: '', diff: x.why, st: 'bad' }); });
    return out;
  }
  function AMDBdes(des) { return String(des || '').split(/[/.\s-]+/).map(des2).filter(Boolean); }
  function fmtC(c) { function f(v, h) { var a = Math.abs(v), d = Math.floor(a), m = Math.floor((a - d) * 60), s2 = ((a - d) * 60 - m) * 60; return (h === 'NS' ? ('0' + d).slice(-2) : ('00' + d).slice(-3)) + '°' + ('0' + m).slice(-2) + '\'' + ('0' + s2.toFixed(2)).slice(-5) + '"' + (v < 0 ? h[1] : h[0]); } return f(c[1], 'NS') + ' ' + f(c[0], 'EW'); }

  /* ------------------------------------------------------- the documents */
  var TXT = /\.(txt|csv|tsv|text)$/i, PDF = /\.pdf$/i;
  // a document added: read when it has text, kept and listed when it has none (images, office files)
  async function addFile(file, cands) {
    var d = { id: ++seq, name: file.name, size: file.size, type: PDF.test(file.name) ? 'pdf' : TXT.test(file.name) ? 'text' : /\.(png|jpe?g|webp|gif|tiff?)$/i.test(file.name) ? 'image' : 'other', ad: '', added: new Date().toISOString(), f: null, note: '' };
    try {
      if (d.type === 'pdf') { var r = await pdfRead(new Uint8Array(await file.arrayBuffer())); d.pages = r.pages; d.f = read(r.lines.map(function (x) { return x.t; }).join('\n'), file.name); if (r.textless) d.note = 'a scanned chart: it has no text to read — paste the table, or trace on imagery'; }
      else if (d.type === 'text') d.f = read(await file.text(), file.name);
      else d.note = d.type === 'image' ? 'kept as a supporting document (an image is not read)' : 'kept as a supporting document';
    } catch (e) { d.note = 'could not be read: ' + e.message; }
    if (d.f) { d.ad = assign(d.f, cands); if (d.f.stands.length >= 2 && !KINDS[d.f.kind.id].amdb) d.f.kind.id = d.f.kind.id === 'other' ? 'table' : d.f.kind.id; }
    DOCS.push(d);
    return d;
  }
  function addText(text, name, cands) { var d = { id: ++seq, name: name || 'pasted text', size: text.length, type: 'text', ad: '', added: new Date().toISOString(), f: read(text, name), note: '' }; d.ad = assign(d.f, cands); if (d.f.kind.id === 'other' && d.f.stands.length) d.f.kind.id = 'table'; DOCS.push(d); return d; }
  // a short account of what a document gave
  function gave(d) {
    var f = d.f; if (!f) return d.note || '';
    var g = [], R = Object.keys(f.rwy);
    if (f.stands.length) g.push(f.stands.length + ' stand position(s)');
    if (f.standNames.length) g.push(f.standNames.length + ' stand name(s)');
    var thr = R.filter(function (k) { return f.rwy[k].thr; }); if (thr.length) g.push('threshold position ' + thr.join(', '));
    if (f.arp) g.push('reference point');
    var dm = R.filter(function (k) { return f.rwy[k].wid; }); if (dm.length || f.dims.length) g.push((dm.length ? dm.length : f.dims.length) + ' runway dimension(s)');
    if (f.pcn.length) g.push(f.pcn.length + ' strength (PCN / PCR)');
    if (f.twyNames.length) g.push(f.twyNames.length + ' taxiway name(s)');
    if (Object.keys(f.twyW).length) g.push('taxiway width');
    if (Object.keys(f.shoulder).length) g.push('shoulder width');
    if (f.lights.length) g.push('lighting: ' + f.lights.map(function (l) { return (l.cls && l.kind === 'ALS' ? l.cls + ' ' : '') + LNAME[l.kind]; }).filter(function (x, i, a) { return a.indexOf(x) === i; }).slice(0, 6).join(', '));
    if (f.apronNames.length) g.push(f.apronNames.length + ' apron name(s)');
    if (f.hotspots.length) g.push(f.hotspots.length + ' hot spot(s)');
    if (f.magVar !== undefined) g.push('magnetic variation');
    return g.length ? g.join(' · ') : 'nothing for aerodrome mapping found in the text' + (d.note ? ' (' + d.note + ')' : '');
  }
  function list() { return DOCS.slice(); }
  function get(id) { return DOCS.filter(function (d) { return d.id === id; })[0] || null; }
  function remove(id) { DOCS = DOCS.filter(function (d) { return d.id !== id; }); }
  function setAd(id, code) { var d = get(id); if (d) d.ad = code; }
  function clear() { DOCS = []; }

  return { pdfRead: pdfRead, textLines: textLines, clean: clean, coordsIn: coordsIn, desOf: desOf, read: read, kindOf: kindOf, assign: assign, forAd: forAd, matchDims: matchDims, lightsFor: lightsFor, standsChecked: standsChecked,
    icaoCheck: icaoCheck, crossCheck: crossCheck, addFile: addFile, addText: addText, gave: gave, list: list, get: get, remove: remove, setAd: setAd, clear: clear, KINDS: KINDS, A4: A4, LNAME: LNAME, fmtC: fmtC, des2: des2, opposite: opposite, esc: esc };
})();
if (typeof module !== 'undefined') module.exports = AMDBDOC;
