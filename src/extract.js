/*!
 * AIXM Code Converter
 * Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com> - author of the AIXM Code Converter
 * SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE; keep this notice in all copies)
 * ==========================================================================
 * AIXM Code Converter - custom data export
 * Lets the user pick exactly which data to export: aerodrome data (any AD 2 section, or single items of it such as
 * the magnetic variation) for chosen aerodromes, airspace by type (P / R / D, TMA, CTR …), any ENR or GEN section,
 * from one or more loaded data sets. build() returns an export scope (sections of kv / table blocks whose cells keep
 * their AIXM source), so every export format (Excel, CSV, JSON, PDF, print, e-mail) works on it, and a feature filter
 * for the GIS formats (GeoJSON, KML, Shapefile).
 * Two layouts: 'table' — one table per data item with the aerodromes as rows (best for Excel / CSV);
 *              'aip'   — AIP pages per aerodrome containing only the chosen items.
 * ========================================================================== */
/* global MODEL, AIP */
var EXTRACT = (function () {
  'use strict';
  var M = MODEL, s = M.s, C = AIP.C;

  // airspace types: readable names (AIXM CodeAirspaceType)
  var AS_NAMES = {
    FIR: 'Flight information region', UIR: 'Upper flight information region', CTA: 'Control area', UTA: 'Upper control area', OCA: 'Oceanic control area',
    TMA: 'Terminal control area', CTR: 'Control zone', ATZ: 'Aerodrome traffic zone', HTZ: 'Helicopter traffic zone', P: 'Prohibited area', R: 'Restricted area',
    D: 'Danger area', TSA: 'Temporary segregated area', TRA: 'Temporary reserved area', CBA: 'Cross-border area', MTR: 'Military training route area',
    MOA: 'Military operations area', ADIZ: 'Air defence identification zone', RMZ: 'Radio mandatory zone', TMZ: 'Transponder mandatory zone',
    SECTOR: 'ATC sector', SECTOR_C: 'Collapsed ATC sector', NAS: 'National airspace', OTA: 'Oceanic transition area', ADV: 'Advisory area', UADV: 'Upper advisory area',
    CLASS: 'Airspace class area', AWY: 'Airway corridor', PROTECT: 'Protected airspace', A: 'Aerobatic area', W: 'Warning area', D_OTHER: 'Other dangerous activity',
    FRA: 'Free route airspace', RAS: 'Regulated airspace', AMA: 'Minimum altitude area', NTZ: 'No transgression zone', NOZ: 'Normal operating zone', FIZ: 'Flight information zone',
    PART: 'Part of airspace', POLITICAL: 'Political boundary', RCA: 'Reduced coordination airspace', FBZ: 'Flight restriction zone', NPZ: 'No-fly zone'
  };
  function typeLabel(t) { var b = t.replace(/_P$/, ''); return t + ' — ' + (AS_NAMES[b] || AS_NAMES[t] || 'Airspace') + (/_P$/.test(t) ? ' (part)' : ''); }

  // shortcuts for frequent requests: AD 2 item keys (section or section#row)
  var QUICK = [
    ['Magnetic variation', ['ad:2#5']], ['ARP coordinates and elevation', ['ad:2#1', 'ad:2#3']], ['Operational hours', ['ad:3']],
    ['Rescue and firefighting', ['ad:6']], ['Runway characteristics', ['ad:12']], ['Declared distances', ['ad:13']], ['Approach and runway lighting', ['ad:14']],
    ['ATS airspace', ['ad:17']], ['Communication facilities', ['ad:18']], ['Navigation and landing aids', ['ad:19']], ['Aerodrome obstacles', ['ad:10']],
    ['Prohibited / restricted / danger areas', ['as:P', 'as:R', 'as:D']], ['TMA and CTR', ['as:TMA', 'as:CTR']]
  ];

  function adsOf(ds) { return (ds.byType.AirportHeliport || []).slice().sort(function (a, b) { return M.shortName(a) < M.shortName(b) ? -1 : 1; }); }
  // AD 2 builder number -> section number for this aerodrome (heliports: AD 3 numbering), or null
  function secNo(ad, b) {
    if (!AIP.isHeliport(ad)) return b;
    for (var m in AIP.AD3_MAP) if (AIP.AD3_MAP[m] === b) return +m;
    return null;
  }
  function adSec(ds, ad, b) { var n = secNo(ad, b); return n === null ? null : AIP.adSection(ds, ad, n); }

  /* --------------------------------------------------------------- catalogue */
  // everything that can be chosen, for the given data sets
  function catalog(list) {
    var types = {}, enr = {}, gen = {}, ads = [];
    list.forEach(function (ds, di) {
      (ds.byType.Airspace || []).forEach(function (a) { var t = s(a.cur.p.type) || '?'; types[t] = (types[t] || 0) + 1; });
      var cat = ds.catalogue || (ds.catalogue = AIP.catalogue(ds));
      cat[0].children.forEach(function (x) { gen[x.id] = x.title; });
      cat[1].children.forEach(function (x) { enr[x.id] = x.title; });
      adsOf(ds).forEach(function (ad) { ads.push({ key: di + ':' + ad.i, ds: ds, ad: ad, code: M.shortName(ad), name: s(ad.cur.p.name), heli: AIP.isHeliport(ad) }); });
    });
    // items of each AD 2 section (numbered rows of the AIP table), taken from the first aerodromes that have them
    var sample = ads.filter(function (a) { return !a.heli; }).slice(0, 3).concat(ads.filter(function (a) { return a.heli; }).slice(0, 1));
    var ad = [];
    for (var b = 1; b <= 24; b++) {
      var rows = [], seen = {};
      sample.forEach(function (x) {
        var sec = null;
        try { sec = adSec(x.ds, x.ad, b); } catch (e) { sec = null; }
        (sec && sec.blocks || []).forEach(function (bl) {
          if (bl.kind !== 'kv') return;
          bl.rows.forEach(function (r) { var k = r.no || r.label; if (k && !seen[k]) { seen[k] = 1; rows.push({ key: 'ad:' + b + '#' + k, no: r.no, label: r.label }); } });
        });
      });
      ad.push({ key: 'ad:' + b, no: 'AD 2.' + b, title: AIP.AD2_TITLES[b], rows: rows });
    }
    return {
      ads: ads, ad: ad,
      airspace: Object.keys(types).sort().map(function (t) { return { key: 'as:' + t, type: t, label: typeLabel(t), n: types[t] }; }),
      enr: Object.keys(enr).sort(secSort).map(function (k) { return { key: 'sec:' + k, no: k, title: enr[k] }; }),
      gen: Object.keys(gen).sort(secSort).map(function (k) { return { key: 'sec:' + k, no: k, title: gen[k] }; }),
      quick: QUICK.map(function (q) { return { label: q[0], keys: q[1] }; })
    };
  }
  function secSort(a, b) { var x = a.replace(/\d+/g, function (n) { return ('00' + n).slice(-3); }), y = b.replace(/\d+/g, function (n) { return ('00' + n).slice(-3); }); return x < y ? -1 : x > y ? 1 : 0; }

  /* ------------------------------------------------------------------- build */
  // sel: {datasets:[ds], ads:[{ds, ad}], keys:[...], layout:'table'|'aip', raw:bool}
  function build(sel) {
    var keys = new Set(sel.keys), multi = sel.datasets.length > 1, sections = [], gisSel = new Map();
    function dsTag(ds) { return multi ? ds.state + ' · ' + ds.name : ''; }
    function markGis(ds, fn) { var l = gisSel.get(ds) || []; l.push(fn); gisSel.set(ds, l); }
    // AD 2 choices: section b -> null (whole section) or a set of row numbers
    var adPick = {};
    keys.forEach(function (k) {
      var m = /^ad:(\d+)(?:#(.+))?$/.exec(k);
      if (!m) return;
      var b = +m[1];
      if (!m[2]) adPick[b] = null;
      else if (adPick[b] !== null) (adPick[b] = adPick[b] || new Set()).add(m[2]);
    });
    var bs = Object.keys(adPick).map(Number).sort(function (a, b) { return a - b; });
    var ads = sel.ads || [];

    if (bs.length && ads.length) {
      if (sel.layout === 'aip') {
        ads.forEach(function (x) {
          var group = [];
          bs.forEach(function (b) { var sec = adSec(x.ds, x.ad, b); if (sec) group.push(filterSec(sec, adPick[b])); });
          if (group.length) sections.push({ id: 'X:AD:' + x.ad.i, no: (AIP.isHeliport(x.ad) ? 'AD 3 ' : 'AD 2 ') + M.shortName(x.ad), title: [s(x.ad.cur.p.name), dsTag(x.ds)].filter(Boolean).join(' — '), group: group, ad: x.ad });
        });
      } else {
        bs.forEach(function (b) { sections = sections.concat(acrossAerodromes(ads, b, adPick[b], multi)); });
      }
      ads.forEach(function (x) {
        var nos = bs.map(function (b) { return 'AD ' + (AIP.isHeliport(x.ad) ? '3.' : '2.') + secNo(x.ad, b); });
        markGis(x.ds, function (r) { if (r === x.ad) return true; var sc = AIP.sectionOf(x.ds, r); return sc.ad === x.ad && nos.indexOf(sc.no) >= 0; });
      });
    }
    // airspace by type
    var types = [];
    keys.forEach(function (k) { if (k.indexOf('as:') === 0) types.push(k.slice(3)); });
    types.sort().forEach(function (t) {
      sel.datasets.forEach(function (ds) {
        var list = (ds.byType.Airspace || []).filter(function (a) { return (s(a.cur.p.type) || '?') === t; });
        if (!list.length) return;
        var grp = AIP.airspaceGroupOf(t), restricted = /^ENR 5/.test(grp);
        var tb = restricted ? AIP.restrictedTable(ds, list) : AIP.airspaceTable(ds, list);
        tb.title = list.length + ' airspace' + (list.length > 1 ? 's' : '');
        sections.push({ id: 'X:AS:' + t, no: grp + ' · ' + t, title: [typeLabel(t), dsTag(ds)].filter(Boolean).join(' — '), blocks: [tb] });
        markGis(ds, function (r) { return r.k === 'Airspace' && (s(r.cur.p.type) || '?') === t; });
      });
    });
    // whole ENR / GEN sections
    var secIds = [];
    keys.forEach(function (k) { if (k.indexOf('sec:') === 0) secIds.push(k.slice(4)); });
    secIds.sort(secSort).forEach(function (id) {
      sel.datasets.forEach(function (ds) {
        var item = AIP.findSection(ds, id);
        if (!item) return;
        var sec = AIP.build(ds, item);
        if (multi) sec = Object.assign({}, sec, { title: sec.title + ' — ' + dsTag(ds) });
        sections.push(sec);
        markGis(ds, function (r) { var no = AIP.sectionOf(ds, r).no; return no === id || (id.indexOf(no + '.') === 0) || no.indexOf(id + '.') === 0; });
      });
    });
    var what = [];
    if (bs.length) what.push(bs.length + ' aerodrome item' + (bs.length > 1 ? 's' : '') + ' for ' + ads.length + ' aerodrome' + (ads.length > 1 ? 's' : ''));
    if (types.length) what.push(types.join(', ') + ' airspace');
    if (secIds.length) what.push(secIds.join(', '));
    var ds0 = sel.datasets[0];
    var scope = { title: (multi ? sel.datasets.length + ' data sets' : ds0.state) + ' — selected data', sub: what.join(' · '), ds: ds0, sections: sections };
    scope.gisFilter = function (ds) { var fns = gisSel.get(ds); return fns ? function (r) { for (var i = 0; i < fns.length; i++) if (fns[i](r)) return true; return false; } : null; };
    if (sel.raw) {
      var feats = [];
      sel.datasets.forEach(function (ds) { var f = scope.gisFilter(ds); if (f) ds.recs.forEach(function (r) { if (f(r)) feats.push(r); }); });
      scope.features = feats;
    }
    return scope;
  }

  // keep only the chosen numbered rows of the kv blocks (rows === null: whole section)
  function filterSec(sec, rows) {
    if (!rows) return sec;
    var blocks = (sec.blocks || []).filter(function (b) { return b.kind === 'kv'; }).map(function (b) {
      return { kind: 'kv', rows: b.rows.filter(function (r) { return rows.has(r.no || r.label); }) };
    }).filter(function (b) { return b.rows.length; });
    return Object.assign({}, sec, { blocks: blocks });
  }
  function adCell(x) { return C(M.shortName(x.ad) + (s(x.ad.cur.p.name) ? ' — ' + s(x.ad.cur.p.name) : ''), x.ad, x.ad.cur.p.locationIndicatorICAO !== undefined ? 'locationIndicatorICAO' : 'designator'); }
  function joinCells(cells) {
    var src = cells.filter(function (c) { return c && c.r; })[0];
    var t = cells.map(function (c) { return c && c.t; }).filter(Boolean).join('\n');
    return C(t, src ? src.r : null, src ? src.p : null);
  }
  // one table per AD 2 section (or chosen items) with the aerodromes as rows
  function acrossAerodromes(ads, b, rows, multi) {
    var title = AIP.AD2_TITLES[b], out = [];
    var kvCols = [], kvIdx = {}, kvRows = [], tables = {}, tOrder = [], notes = [];
    ads.forEach(function (x) {
      var sec = null;
      try { sec = adSec(x.ds, x.ad, b); } catch (e) { sec = null; }
      if (!sec) return;
      var first = [adCell(x)].concat(multi ? [C(x.ds.state + ' · ' + x.ds.name)] : []), kvVals = {};
      (sec.blocks || []).forEach(function (bl) {
        if (bl.kind === 'kv') {
          bl.rows.forEach(function (r) {
            var k = r.no || r.label;
            if (rows && !rows.has(k)) return;
            if (kvIdx[k] === undefined) { kvIdx[k] = kvCols.length; kvCols.push((r.no ? r.no + ' ' : '') + r.label); }
            kvVals[k] = joinCells(r.cells);
          });
        } else if (!rows && bl.kind === 'table') {
          var tk = (bl.title || '') + '|' + bl.cols.join('|');
          if (!tables[tk]) { tables[tk] = { title: bl.title, cols: bl.cols, rows: [] }; tOrder.push(tk); }
          bl.rows.forEach(function (r) { tables[tk].rows.push(first.concat(r)); });
        } else if (!rows && bl.kind === 'note' && bl.text) notes.push(first.concat([C(bl.text)]));
      });
      if (Object.keys(kvVals).length) kvRows.push({ first: first, vals: kvVals });
    });
    var lead = ['Aerodrome'].concat(multi ? ['Data set'] : []);
    var blocks = [];
    if (kvCols.length) {
      var order = Object.keys(kvIdx).sort(function (a, b2) { return kvIdx[a] - kvIdx[b2]; });
      blocks.push({ kind: 'table', title: '', cols: lead.concat(kvCols), rows: kvRows.map(function (x) { return x.first.concat(order.map(function (k) { return x.vals[k] || C(''); })); }) });
    }
    tOrder.forEach(function (tk) { var t = tables[tk]; blocks.push({ kind: 'table', title: t.title || '', cols: lead.concat(t.cols), rows: t.rows }); });
    if (notes.length) blocks.push({ kind: 'table', title: 'Notes', cols: lead.concat(['Note']), rows: notes });
    if (blocks.length) out.push({ id: 'X:AD2.' + b, no: 'AD 2.' + b, title: title + (rows ? ' (selected items)' : ''), blocks: blocks });
    return out;
  }

  return { catalog: catalog, build: build, typeLabel: typeLabel, QUICK: QUICK };
})();
if (typeof module !== 'undefined') module.exports = EXTRACT;
