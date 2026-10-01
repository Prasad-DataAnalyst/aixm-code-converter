/*!
 * AIXM Code Converter
 * Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com> - author of the AIXM Code Converter
 * SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE; keep this notice in all copies)
 * ==========================================================================
 * AIXM Code Converter - review tools (no DOM)
 *  - AIRAC AIP amendment (AMDT) report from the changes of a cycle
 *  - side-by-side alignment of two builds of one AIP section (row matching,
 *    changed cells)
 *  - Digital NOTAM: events, NOTAM/SNOWTAM text in ICAO format, Q-code decoding,
 *    affected features and their temporary changes
 *  - timeline data (changes per AIRAC cycle, temporary changes as periods)
 * ========================================================================== */
/* global AX, MODEL, AIP, ANALYSIS */
var REVIEW = (function () {
  'use strict';
  var M = MODEL, s = M.s, arr = AX.arr, C = AIP.C;
  var DAY = 86400000;

  function partOf(no) { return /^GEN/.test(no) ? 'GEN' : /^ENR/.test(no) ? 'ENR' : /^AD/.test(no) ? 'AD' : 'Other'; }
  function secTitle(ds, sec) {
    if (!sec || !sec.id) return '';
    var it = AIP.findSection(ds, sec.id);
    return it ? it.title : '';
  }

  /* ------------------------------------------------------ AMDT report */
  // cc = ANALYSIS.cycleChanges(ds, cycle) -> export scope (EXPORTS format)
  function amdtScope(ds, cc) {
    var cy = cc.cycle, pub = new Date(cy.date - 42 * DAY), secs = new Map(), parts = { GEN: 0, ENR: 0, AD: 0, Other: 0 };
    function secEntry(ds2, sec) {
      var key = sec.no + (sec.ad ? ' ' + M.shortName(sec.ad) : '');
      var e = secs.get(key);
      if (!e) secs.set(key, e = { key: key, no: sec.no, ad: sec.ad, title: secTitle(ds2, sec), rows: [], changed: 0, added: 0, removed: 0 });
      return e;
    }
    cc.list.forEach(function (x) {
      var e = secEntry(ds, x.sec), feat = M.label(ds, x.rec);
      parts[partOf(x.sec.no)]++;
      var reason = Array.from(x.e.kinds).join(', ');
      if (x.e.added) { e.added++; e.rows.push([C(feat, x.rec), C(M.typeName(x.rec)), C('NEW'), C(''), C(''), C('inserted'), C(reason)]); }
      else e.changed++;
      x.e.props.forEach(function (l) {
        l.forEach(function (f) {
          e.rows.push([C(feat, x.rec, ANALYSIS.topProp(f.path)), C(M.typeName(x.rec)), C(f.old === undefined ? 'INSERT' : f.neu === undefined ? 'DELETE' : 'AMEND'), C(ANALYSIS.prettyPath(f.path)),
            C(f.old !== undefined ? ANALYSIS.displayVal(ds, f.old) : ''), C(f.neu !== undefined ? ANALYSIS.displayVal(ds, f.neu) : 'deleted'), C(reason)]);
        });
      });
    });
    (cc.removed || []).forEach(function (it) {
      var dsA = ds.prevCmp.a, e = secEntry(dsA, it.sec);
      parts[partOf(it.sec.no)]++;
      e.removed++;
      e.rows.push([C(M.label(dsA, it.a)), C(M.typeName(it.a)), C('WITHDRAWN'), C(''), C(''), C('not in the new cycle'), C('Removed since ' + dsA.name)]);
    });
    var list = Array.from(secs.values()).sort(function (a, b) { return a.key < b.key ? -1 : a.key > b.key ? 1 : 0; });
    var cols = ['Feature', 'Type', 'Action', 'Item', 'Previous value', 'New value', 'Reason / source'];
    var summary = { kind: 'kv', title: 'Amendment', rows: [
      { no: '', label: 'State', cells: [C(ds.state)] },
      { no: '', label: 'AIRAC AIP amendment', cells: [C('AIRAC AMDT ' + cy.id)] },
      { no: '', label: 'Publication date (not later than)', cells: [C(M.fmtDate(pub.getTime()) + ' (42 days before the effective date)')] },
      { no: '', label: 'Effective date', cells: [C(M.fmtDate(cy.date) + ' 0000 UTC')] },
      { no: '', label: 'Next AIRAC date', cells: [C(M.fmtDate(cy.next))] },
      { no: '', label: 'Source data', cells: [C(ds.name + ' (' + (ds.sniff.versionLabel || '') + ')')] },
      { no: '', label: 'Change sources', cells: [C(cc.sources.join('; ') || 'none')] },
      { no: '', label: 'Summary', cells: [C(cc.count + ' feature(s) changed or added' + ((cc.removed || []).length ? ', ' + cc.removed.length + ' withdrawn' : '') + ' — GEN ' + parts.GEN + ', ENR ' + parts.ENR + ', AD ' + parts.AD + (parts.Other ? ', other ' + parts.Other : ''))] }
    ] };
    var affected = { kind: 'table', title: 'AIP sections affected by this amendment', cols: ['Part', 'Section', 'Aerodrome', 'Title', 'Amended', 'New', 'Withdrawn'], rows: list.map(function (e) {
      return [C(partOf(e.no)), C(e.no), C(e.ad ? M.shortName(e.ad) : ''), C(e.title), C(String(e.changed)), C(String(e.added)), C(String(e.removed))];
    }) };
    var sections = [{ no: 'AMDT ' + cy.id, title: 'AIRAC AIP amendment — summary', blocks: [summary, affected,
      { kind: 'note', text: 'Insert / amend / delete the items below in the AIP sections listed. Values come from the AIXM data; "previous value" is the value valid before ' + M.fmtDate(cy.date) + '.' }] }];
    list.forEach(function (e) {
      sections.push({ no: e.no + (e.ad ? ' ' + M.shortName(e.ad) : ''), title: e.title || e.no, blocks: [{ kind: 'table', cols: cols, rows: e.rows }] });
    });
    if (!list.length) sections[0].blocks.push({ kind: 'note', text: 'No changes found for AIRAC ' + cy.id + '. Load the previous cycle file (Compare) to see every difference.' });
    return { title: 'AIRAC AMDT ' + cy.id + ' — effective ' + M.fmtDate(cy.date), sub: ds.state + ' — ' + ds.name, ds: ds, sections: sections, amdt: { cycle: cy, pub: pub.getTime(), list: list, parts: parts } };
  }

  /* ------------------------------------------------ side-by-side diff */
  function ctext(c) { return c && c.t ? String(c.t) : ''; }
  function rowText(cells) { return cells.map(ctext).join(' | '); }
  function rowKey(b, cells) {
    if (b.kind === 'kv') return (cells.no || '') + '|' + cells.label;
    var k = ctext(cells[0]);
    if (!k || k.length < 2) k += '|' + ctext(cells[1]);
    return k;
  }
  function blockRows(b) { return b.kind === 'kv' ? b.rows : b.kind === 'table' ? b.rows : []; }
  function cellsOf(b, row) { return b.kind === 'kv' ? row.cells : row; }
  function keyed(b) {
    var seen = {}, out = [];
    blockRows(b).forEach(function (row, i) {
      var k = rowKey(b, row), n = seen[k] = (seen[k] || 0) + 1;
      out.push({ key: k + '#' + n, row: row, i: i });
    });
    return out;
  }
  function alignRows(bl, br) {
    var L = bl ? keyed(bl) : [], R = br ? keyed(br) : [], lmap = new Map(), used = new Set(), out = [];
    L.forEach(function (x) { lmap.set(x.key, x); });
    var li = 0;
    R.forEach(function (r) {
      var l = lmap.get(r.key);
      if (l && !used.has(l.key)) {
        for (; li < l.i; li++) if (!used.has(L[li].key) && !R.some(function (y) { return y.key === L[li].key; })) { used.add(L[li].key); out.push({ l: L[li].row, r: null, st: 'del' }); }
        used.add(l.key); li = Math.max(li, l.i + 1);
        var cl = cellsOf(bl, l.row), cr = cellsOf(br, r.row), ch = [];
        var n = Math.max(cl.length, cr.length);
        for (var i = 0; i < n; i++) if (ctext(cl[i]) !== ctext(cr[i])) ch.push(i);
        out.push({ l: l.row, r: r.row, st: ch.length ? 'chg' : 'same', cols: ch });
      } else out.push({ l: null, r: r.row, st: 'add' });
    });
    L.forEach(function (x) { if (!used.has(x.key)) out.push({ l: x.row, r: null, st: 'del' }); });
    return out;
  }
  function flat(sec) {
    if (!sec) return [];
    if (sec.group) return [].concat.apply([], sec.group.map(flat));
    return [sec];
  }
  // -> {pairs:[{no,title, blocks:[{title, kind, cols, bl, br, rows:[{l,r,st,cols}]}]}], stats}
  function sbsDiff(secL, secR) {
    var A = flat(secL), B = flat(secR), stats = { chg: 0, add: 0, del: 0, cells: 0 }, pairs = [];
    var amap = new Map(); A.forEach(function (x) { amap.set(x.no, x); });
    B.forEach(function (sb) {
      var sa = amap.get(sb.no) || null;
      var blocks = [], ab = sa ? sa.blocks || [] : [], bb = sb.blocks || [], usedA = new Set();
      function findA(b, i) {
        for (var j = 0; j < ab.length; j++) if (!usedA.has(j) && ab[j].kind === b.kind && (ab[j].title || '') === (b.title || '')) { usedA.add(j); return ab[j]; }
        if (ab[i] && !usedA.has(i) && ab[i].kind === b.kind) { usedA.add(i); return ab[i]; }
        return null;
      }
      bb.forEach(function (b, i) {
        var a = findA(b, i);
        if (b.kind === 'note' || (a && a.kind === 'note')) { blocks.push({ kind: 'note', title: b.title, textL: a ? a.text : '', textR: b.text, st: a && a.text === b.text ? 'same' : 'chg' }); return; }
        var rows = alignRows(a, b);
        rows.forEach(function (r) { if (r.st !== 'same') stats[r.st]++; if (r.cols) stats.cells += r.cols.length; });
        blocks.push({ kind: b.kind, title: b.title, cols: b.cols, bl: a, br: b, rows: rows });
      });
      ab.forEach(function (a, j) {
        if (usedA.has(j) || a.kind === 'note') return;
        var rows = alignRows(a, null);
        stats.del += rows.length;
        blocks.push({ kind: a.kind, title: a.title, cols: a.cols, bl: a, br: null, rows: rows });
      });
      pairs.push({ no: sb.no, title: sb.title, blocks: blocks });
    });
    return { pairs: pairs, stats: stats };
  }
  function sbsScope(ds, diff, labelL, labelR, title) {
    var rows = [];
    diff.pairs.forEach(function (p) {
      p.blocks.forEach(function (b) {
        (b.rows || []).forEach(function (r) {
          if (r.st === 'same') return;
          var cl = r.l ? (b.kind === 'kv' ? r.l.cells : r.l) : [], cr = r.r ? (b.kind === 'kv' ? r.r.cells : r.r) : [];
          var item = b.kind === 'kv' ? ((r.r || r.l).no ? (r.r || r.l).no + ' ' : '') + (r.r || r.l).label : ctext((r.r || r.l)[0]);
          if (r.st === 'chg') r.cols.forEach(function (i) {
            rows.push([C(p.no), C(b.title || ''), C(item), C(b.kind === 'kv' ? '' : (b.cols && b.cols[i]) || ''), C(ctext(cl[i])), C(ctext(cr[i]))]);
          });
          else rows.push([C(p.no), C(b.title || ''), C(item), C(r.st === 'add' ? '(row added)' : '(row removed)'), C(r.st === 'del' ? rowText(cl) : ''), C(r.st === 'add' ? rowText(cr) : '')]);
        });
      });
    });
    return { title: title, sub: ds.state + ' — ' + labelL + ' ⇆ ' + labelR, ds: ds, sections: [{ no: 'SIDE BY SIDE', title: title, blocks: [
      { kind: 'kv', rows: [{ no: '', label: 'Left', cells: [C(labelL)] }, { no: '', label: 'Right', cells: [C(labelR)] },
        { no: '', label: 'Differences', cells: [C(diff.stats.cells + ' changed value(s), ' + diff.stats.add + ' row(s) added, ' + diff.stats.del + ' row(s) removed')] }] },
      { kind: 'table', cols: ['Section', 'Table', 'Item', 'Column', labelL, labelR], rows: rows }] }] };
  }

  /* ---------------------------------------------------- Digital NOTAM */
  var Q_SUBJ = {
    LA: 'approach lighting system', LB: 'aerodrome beacon', LC: 'runway centre line lights', LD: 'landing direction indicator lights', LE: 'runway edge lights', LF: 'sequenced flashing lights', LG: 'pilot-controlled lighting',
    LH: 'high intensity runway lights', LI: 'runway end identifier lights', LJ: 'runway alignment indicator lights', LK: 'CAT II components of approach lighting', LL: 'low intensity runway lights', LM: 'medium intensity runway lights',
    LP: 'PAPI', LR: 'all landing area lighting facilities', LS: 'stopway lights', LT: 'threshold lights', LU: 'helicopter approach path indicator', LV: 'VASIS', LW: 'heliport lighting', LX: 'taxiway centre line lights', LY: 'taxiway edge lights', LZ: 'runway touchdown zone lights',
    MA: 'movement area', MB: 'bearing strength', MC: 'clearway', MD: 'declared distances', MG: 'taxiing guidance system', MH: 'runway arresting gear', MK: 'parking area', MM: 'daylight markings', MN: 'apron', MO: 'stop bar', MP: 'aircraft stands',
    MR: 'runway', MS: 'stopway', MT: 'threshold', MU: 'runway turning bay', MW: 'strip / shoulder', MX: 'taxiway(s)', MY: 'rapid exit taxiway',
    FA: 'aerodrome', FB: 'friction measuring device', FC: 'ceiling measurement equipment', FD: 'docking system', FE: 'oxygen', FF: 'fire fighting and rescue', FG: 'ground movement control', FH: 'helicopter alighting area / platform', FI: 'aircraft de-icing',
    FJ: 'oils', FL: 'landing direction indicator', FM: 'meteorological service', FO: 'fog dispersal system', FP: 'heliport', FS: 'snow removal equipment', FT: 'transmissometer', FU: 'fuel availability', FW: 'wind direction indicator', FZ: 'customs / immigration',
    CA: 'air/ground facility', CB: 'ADS-B', CC: 'ADS-C', CD: 'CPDLC', CE: 'en-route surveillance radar', CG: 'ground controlled approach system', CL: 'SELCAL', CP: 'precision approach radar', CR: 'surveillance radar element of PAR', CS: 'secondary surveillance radar', CT: 'terminal area surveillance radar',
    IC: 'ILS', ID: 'DME associated with ILS', IG: 'glide path (ILS)', II: 'inner marker (ILS)', IL: 'localizer (ILS)', IM: 'middle marker (ILS)', IN: 'localizer (not associated with ILS)', IO: 'outer marker (ILS)', IS: 'ILS category I', IT: 'ILS category II', IU: 'ILS category III', IW: 'MLS', IX: 'locator, outer (ILS)', IY: 'locator, middle (ILS)',
    GA: 'GNSS airfield-specific operations', GW: 'GNSS area-wide operations',
    NA: 'all radio navigation facilities', NB: 'non-directional radio beacon', ND: 'DME', NF: 'fan marker', NL: 'locator', NM: 'VOR/DME', NN: 'TACAN', NT: 'VORTAC', NV: 'VOR', NX: 'direction finding station',
    AA: 'minimum altitude', AC: 'control zone', AD: 'air defence identification zone', AE: 'control area', AF: 'flight information region', AH: 'upper control area', AL: 'minimum usable flight level', AN: 'area navigation route', AO: 'oceanic control area',
    AP: 'reporting point', AR: 'ATS route', AT: 'terminal control area', AU: 'upper flight information region', AV: 'upper advisory area', AX: 'significant point', AZ: 'aerodrome traffic zone',
    SA: 'automatic terminal information service', SB: 'ATS reporting office', SC: 'area control centre', SE: 'flight information service', SF: 'aerodrome flight information service', SL: 'flow control centre', SO: 'oceanic area control centre', SP: 'approach control service',
    SS: 'flight service station', ST: 'aerodrome control tower', SU: 'upper area control centre', SV: 'VOLMET broadcast', SY: 'upper advisory service',
    PA: 'standard instrument arrival', PB: 'standard VFR arrival', PC: 'contingency procedures', PD: 'standard instrument departure', PE: 'standard VFR departure', PF: 'flow control procedure', PH: 'holding procedure', PI: 'instrument approach procedure', PK: 'VFR approach procedure',
    PL: 'flight plan processing', PM: 'aerodrome operating minima', PN: 'noise operating restriction', PO: 'obstacle clearance altitude and height', PR: 'radio failure procedures', PT: 'transition altitude or transition level', PU: 'missed approach procedure', PX: 'minimum holding altitude', PZ: 'ADIZ procedure',
    RA: 'airspace reservation', RD: 'danger area', RM: 'military operating area', RO: 'overflying of', RP: 'prohibited area', RR: 'restricted area', RT: 'temporary restricted area',
    WA: 'air display', WB: 'aerobatics', WC: 'captive balloon or kite', WD: 'demolition of explosives', WE: 'exercises', WF: 'air refuelling', WG: 'glider flying', WH: 'blasting', WJ: 'banner / target towing', WL: 'ascent of free balloon', WM: 'missile, gun or rocket firing',
    WP: 'parachute jumping exercise / paragliding / hang gliding', WR: 'radioactive materials or toxic chemicals', WS: 'burning or blowing gas', WT: 'mass movement of aircraft', WU: 'unmanned aircraft', WV: 'formation flight', WW: 'significant volcanic activity', WY: 'aerial survey', WZ: 'model flying',
    OA: 'aeronautical information service', OB: 'obstacle', OE: 'aircraft entry requirements', OL: 'obstacle lights', OR: 'rescue coordination centre', KK: 'checklist', XX: 'other (plain language)'
  };
  var Q_COND = {
    AC: 'withdrawn for maintenance', AD: 'available for daylight operation', AF: 'flight checked and found reliable', AG: 'operating but ground checked only', AH: 'hours of service are now', AK: 'resumed normal operation', AL: 'operative subject to previously published limitations',
    AM: 'military operations only', AN: 'available for night operation', AO: 'operational', AP: 'available, prior permission required', AR: 'available on request', AS: 'unserviceable', AU: 'not available', AW: 'completely withdrawn', AX: 'previously promulgated shutdown cancelled',
    CA: 'activated', CC: 'completed', CD: 'deactivated', CE: 'erected', CF: 'operating frequency changed', CG: 'downgraded', CH: 'changed', CI: 'identification or call sign changed', CL: 'realigned', CM: 'displaced', CN: 'cancelled', CO: 'operating', CP: 'operating on reduced power',
    CR: 'temporarily replaced by', CS: 'installed', CT: 'on test, do not use',
    HA: 'braking action is', HB: 'friction coefficient is', HC: 'covered by compacted snow', HD: 'covered by dry snow', HE: 'covered by water', HF: 'totally free of snow and ice', HG: 'grass cutting in progress', HH: 'hazard due to', HI: 'covered by ice', HJ: 'launch planned', HK: 'bird migration in progress',
    HL: 'snow clearance completed', HM: 'marked by', HN: 'covered by wet snow or slush', HO: 'obscured by snow', HP: 'snow clearance in progress', HQ: 'operation cancelled', HR: 'standing water', HS: 'sanding in progress', HT: 'approach according to signal area only', HU: 'launch in progress',
    HV: 'work completed', HW: 'work in progress', HX: 'concentration of birds', HY: 'snow banks exist', HZ: 'covered by frozen ruts and ridges',
    LA: 'operating on auxiliary power supply', LB: 'reserved for aircraft based therein', LC: 'closed', LD: 'unsafe', LE: 'operating without auxiliary power supply', LF: 'interference from', LG: 'operating without identification', LH: 'unserviceable for aircraft heavier than',
    LI: 'closed to IFR operations', LK: 'operating as a fixed light', LL: 'usable for length / width', LN: 'closed to all night operations', LP: 'prohibited to', LR: 'aircraft restricted to runways and taxiways', LS: 'subject to interruption', LT: 'limited to',
    LV: 'closed to VFR operations', LW: 'will take place', LX: 'operating but caution advised', XX: 'plain language', TT: 'trigger NOTAM (AIRAC AIP amendment or supplement)'
  };
  var SCENARIO = {
    'AD.CLS': 'Aerodrome closure', 'AD.LIM': 'Aerodrome limitation', 'APE.CLS': 'Apron portion closure', 'APE.LIM': 'Apron portion limitation', 'APN.CLS': 'Apron closure', 'APN.LIM': 'Apron limitation',
    'ATSA.ACT': 'ATS airspace activation', 'ATSA.NEW': 'New ATS airspace', 'NAV.UNS': 'Navaid unserviceable', 'OBL.UNS': 'Obstacle lights unserviceable', 'OBS.NEW': 'New obstacle', 'OTHER': 'Other (plain language)',
    'RCP.CHG': 'Runway centreline point change', 'RDD.CHG': 'Declared distance change', 'RWE.CLS': 'Runway portion closure', 'RWY.CLS': 'Runway closure', 'RWY.LIM': 'Runway limitation', 'SAA.ACT': 'Special activity airspace activation',
    'SAA.NEW': 'New special activity airspace', 'SFC.CON': 'Runway surface condition (SNOWTAM / GRF)', 'STAND.CLS': 'Aircraft stand closure', 'STAND.LIM': 'Aircraft stand limitation', 'TWY.CLS': 'Taxiway closure', 'TWY.LIM': 'Taxiway limitation',
    'RTE.CLS': 'Route closure', 'RTE.LIM': 'Route limitation', 'NAV.CHG': 'Navaid change', 'DPN.NEW': 'New designated point', 'HLD.CHG': 'Holding change', 'SID.CHG': 'SID change', 'STAR.CHG': 'STAR change', 'IAP.CHG': 'Approach change'
  };
  var PURPOSE = { N: 'immediate attention', B: 'pre-flight information bulletin', O: 'flight operations', M: 'miscellaneous', K: 'checklist' };
  var TRAFFIC = { I: 'IFR', V: 'VFR', K: 'checklist' };
  var SCOPE = { A: 'aerodrome', E: 'en-route', W: 'navigation warning', K: 'checklist' };
  function qdecode(code) {
    code = String(code || '').toUpperCase().replace(/^Q/, '');
    if (code.length < 4) return '';
    var su = Q_SUBJ[code.slice(0, 2)], co = Q_COND[code.slice(2, 4)];
    return (su || code.slice(0, 2)) + (co ? ' — ' + co : '');
  }
  function letters(v, map) { return String(v || '').split('').map(function (c) { return map[c] || c; }).join(' + '); }
  function ymd(t) { return t === null || t === undefined ? '' : new Date(t).toISOString().replace(/[-T:]/g, '').slice(2, 12); }
  function fl(v) { var x = s(v && v.v !== undefined ? v.v : v); return x ? ('000' + x).slice(-3) : ''; }
  function notamText(n, ev) {
    var type = s(n.type) || 'N', id = (s(n.series) || '') + (s(n.number) || '') + '/' + String(s(n.year) || '').slice(-2);
    var lines = [id + ' NOTAM' + type + (s(n.referredNumber) || s(n.referredSeries) ? ' ' + (s(n.referredSeries) || '') + s(n.referredNumber) + '/' + String(s(n.referredYear) || '').slice(-2) : '')];
    var q = [s(n.affectedFIR), s(n.selectionCode), s(n.traffic), s(n.purpose), s(n.scope), fl(n.minimumFL), fl(n.maximumFL), (s(n.coordinates) || '') + (fl(n.radius) || '')];
    if (q.some(Boolean)) lines.push('Q) ' + q.join('/'));
    var abc = [];
    if (s(n.location)) abc.push('A) ' + s(n.location));
    if (s(n.effectiveStart)) abc.push('B) ' + s(n.effectiveStart));
    if (s(n.effectiveEnd)) abc.push('C) ' + s(n.effectiveEnd) + (s(n.estimatedEnd) === 'YES' ? ' EST' : ''));
    else if (s(n.permanent) === 'YES') abc.push('C) PERM');
    if (abc.length) lines.push(abc.join(' '));
    if (s(n.schedule)) lines.push('D) ' + s(n.schedule));
    var texts = arr(n.text).map(function (t) { return typeof t === 'string' ? t : t && (t._v || s(t)); }).filter(Boolean);
    lines.push('E) ' + (texts.length ? texts.join('\n   ') : (ev && ev.autoText) || ''));
    if (s(n.lowerLimit) || n.lowerLimit) lines.push('F) ' + (M.fq(n.lowerLimit) || s(n.lowerLimit)) + '   G) ' + (M.fq(n.upperLimit) || s(n.upperLimit)));
    return lines.join('\n');
  }
  function otherText(n) { // SNOWTAM, ASHTAM or unknown notification: key: value lines
    var out = [(n._t || 'Notification') + ' ' + (s(n.number) || '') + (s(n.year) ? '/' + String(s(n.year)).slice(-2) : '') + (s(n.location) ? ' ' + s(n.location) : '')];
    (function walk(o, pre, d) {
      if (!o || typeof o !== 'object' || d > 4) return;
      Object.keys(o).forEach(function (k) {
        if (k === '_t' || k === '_geo' || /^(number|year|location|publisher|processed)$/.test(k) && d === 0) return;
        var v = o[k];
        arr(v).forEach(function (x) {
          if (x && typeof x === 'object' && !('ref' in x) && x.v === undefined) walk(x, pre + k + ' ', d + 1);
          else { var t = x && x.ref ? (x.title || x.ref) : M.fq(x) || s(x); if (t) out.push(pre + k + ': ' + t); }
        });
      });
    })(n, '', 0);
    return out.join('\n');
  }
  // baseline of r (or of the same feature in another loaded data set) at time of the temporary slice t
  function baseFor(ds, r, t, others) {
    var perm = r.ts.filter(function (x) { return x.i !== 'TEMPDELTA'; });
    if (perm.length) return { ds: ds, p: AX.resolve({ ts: perm }, AX.tms(t.b)).p };
    for (var i = 0; i < (others || []).length; i++) {
      var o = others[i], r2 = o.byId && o.byId.get(r.id);
      if (r2) { var p2 = r2.ts.filter(function (x) { return x.i !== 'TEMPDELTA'; }); if (p2.length) return { ds: o, r: r2, p: AX.resolve({ ts: p2 }, AX.tms(t.b)).p }; }
    }
    return null;
  }
  function changeLines(ds, r, t, others) {
    var base = baseFor(ds, r, t, others);
    var fa = base ? AX.flatten(base.p || {}) : {}, fb = AX.flatten(base ? AX.mergeProps(base.p || {}, t.p) : t.p);
    var d = AX.diffFlat(fa, fb).filter(function (x) { return !/^extension/.test(x.path) && !/annotation.*\/(propertyName|purpose)$/.test(x.path) && x.neu !== undefined; });
    return d.map(function (x) { return ANALYSIS.prettyPath(x.path) + ': ' + (x.old !== undefined ? ANALYSIS.displayVal(ds, x.old) + ' → ' : '') + (x.neu !== undefined ? ANALYSIS.displayVal(ds, x.neu) : 'removed'); });
  }
  function labelFor(ds, r, others) {
    var l = M.label(ds, r);
    if (!/[0-9a-f]{8}-[0-9a-f]{4}/i.test(l)) return l;
    for (var i = 0; i < (others || []).length; i++) { var o = others[i], r2 = o.byId && o.byId.get(r.id); if (r2) return M.label(o, r2); }
    return M.typeName(r) + ' ' + String(r.id).slice(0, 8);
  }
  // -> [{ev, name, scenario, scenarioText, start, end, notams:[{n, text, id, q}], affected:[{r, ts, interp, lines}]}]
  function notams(ds, others) {
    if (ds._notams && ds._notamsN === (others || []).length) return ds._notams;
    var events = ds.byType.Event || [], byEv = new Map();
    events.forEach(function (e) { byEv.set(e, []); });
    if (events.length) {
      ds.recs.forEach(function (r) {
        if (r.k === 'Event') return;
        r.ts.forEach(function (t, i) {
          arr(t.p && t.p.extension).forEach(function (x) {
            var ref = x && x.theEvent, ev = ref && M.target(ds, ref);
            if (ev && byEv.has(ev)) byEv.get(ev).push({ r: r, ts: t, idx: i, interp: t.i });
          });
        });
      });
    }
    var out = events.map(function (e) {
      var p = e.cur.p, aff = byEv.get(e) || [];
      aff.forEach(function (a) { a.label = labelFor(ds, a.r, others); try { a.lines = changeLines(ds, a.r, a.ts, others); } catch (err) { a.lines = []; } });
      var auto = aff.map(function (a) { return a.label + (a.lines.length ? ' ' + a.lines.join('; ') : ''); }).join('. ');
      var ctx = { autoText: auto };
      var ns = arr(p.notification).filter(function (n) { return n && typeof n === 'object' && n.nil === undefined; }).map(function (n) {
        var isN = !n._t || n._t === 'NOTAM';
        return { n: n, kind: n._t || 'NOTAM', id: (s(n.series) || '') + (s(n.number) || '') + '/' + String(s(n.year) || '').slice(-2), text: isN ? notamText(n, ctx) : otherText(n), q: isN ? qdecode(s(n.selectionCode)) : '',
          purpose: letters(s(n.purpose), PURPOSE), traffic: letters(s(n.traffic), TRAFFIC), scope: letters(s(n.scope), SCOPE), issued: AX.tms(s(n.issued)) };
      });
      var start = AX.tms(e.cur.b), end = AX.tms(e.cur.e);
      aff.forEach(function (a) { var b = AX.tms(a.ts.b), en = AX.tms(a.ts.e); if (start === null || (b !== null && b < start)) start = b; if (en !== null && (end === null || en > end)) end = en; });
      return { ev: e, name: s(p.name) || M.label(ds, e), scenario: s(p.scenario), scenarioText: SCENARIO[s(p.scenario)] || s(p.scenario), start: start, end: end, notams: ns, affected: aff,
        text: ns.length ? '' : 'E) ' + auto };
    });
    out.sort(function (a, b) { return (b.start || 0) - (a.start || 0); });
    ds._notams = out; ds._notamsN = (others || []).length;
    return out;
  }
  function notamStatus(x, now) {
    if (x.start !== null && x.start > now) return 'upcoming';
    if (x.end !== null && x.end <= now) return 'expired';
    return 'active';
  }
  function notamScope(ds, list) {
    var rows = [];
    list.forEach(function (x) {
      var txt = x.notams.length ? x.notams.map(function (n) { return n.text; }).join('\n\n') : x.text;
      rows.push([C(x.notams.map(function (n) { return n.id; }).join(', ') || '—'), C(x.scenarioText), C(x.name, x.ev), C(M.fmtTs(x.start)), C(x.end !== null ? M.fmtTs(x.end) : 'PERM / not set'),
        C(x.notams.map(function (n) { return n.q; }).filter(Boolean).join('; ')), C(txt), C(x.affected.map(function (a) { return a.label + (a.lines.length ? ' — ' + a.lines.join('; ') : ''); }).join('\n'))]);
    });
    return { title: 'Digital NOTAM', sub: ds.state + ' — ' + ds.name, ds: ds, sections: [{ no: 'NOTAM', title: 'Digital NOTAM events', blocks: [{ kind: 'table', cols: ['NOTAM', 'Scenario', 'Event', 'From', 'To', 'Q-code meaning', 'NOTAM text', 'Affected features (temporary change)'], rows: rows }] }] };
  }

  /* ------------------------------------------------------------ timeline */
  // -> {cycles:[{cycle, n, parts:{GEN,ENR,AD,Other}, temp, perm}], temps:[{rec, from, to, label, section}], range:[t0,t1]}
  function timeline(ds) {
    var ev = ds._events || (ds._events = ANALYSIS.inFileChanges(ds)), m = new Map(), temps = [];
    ev.forEach(function (e) {
      if (e.t === null) return;
      var a = AX.airac(e.t); if (!a) return;
      var c = m.get(a.id);
      if (!c) m.set(a.id, c = { cycle: a, n: 0, parts: { GEN: 0, ENR: 0, AD: 0, Other: 0 }, temp: 0, perm: 0, events: [] });
      c.n++; c.parts[partOf(e.section.no)]++; c.events.push(e);
      if (/Temporary/.test(e.kind)) { c.temp++; temps.push({ rec: e.rec, from: e.t, to: AX.tms(e.to), label: M.label(ds, e.rec), section: e.section, kind: e.kind, fields: e.fields }); }
      else c.perm++;
    });
    (ds.byType.Event ? notams(ds) : []).forEach(function (x) {
      if (x.start === null) return;
      if (!temps.some(function (t) { return x.affected.some(function (a) { return a.r === t.rec; }) && t.from === x.start; }))
        temps.push({ rec: x.ev, from: x.start, to: x.end, label: x.name, section: { no: 'NOTAM' }, kind: 'Digital NOTAM ' + x.scenario, fields: [] });
    });
    if (ds.airac && !m.has(ds.airac.id)) m.set(ds.airac.id, { cycle: ds.airac, n: 0, parts: { GEN: 0, ENR: 0, AD: 0, Other: 0 }, temp: 0, perm: 0, events: [] });
    var cycles = Array.from(m.values()).sort(function (a, b) { return a.cycle.date - b.cycle.date; });
    // fill the gaps between cycles (up to 60) so the strip is continuous
    if (cycles.length > 1) {
      var full = [], t = cycles[0].cycle.date, end = cycles[cycles.length - 1].cycle.date, guard = 0;
      while (t <= end && guard++ < 60) {
        var a = AX.airac(t), have = m.get(a.id);
        full.push(have || { cycle: a, n: 0, parts: { GEN: 0, ENR: 0, AD: 0, Other: 0 }, temp: 0, perm: 0, events: [] });
        t = a.next;
      }
      if (guard < 60) cycles = full;
    }
    temps.sort(function (a, b) { return a.from - b.from; });
    var t0 = temps.length ? temps[0].from : null, t1 = null;
    temps.forEach(function (x) { var e = x.to !== null ? x.to : x.from + DAY; if (t1 === null || e > t1) t1 = e; });
    return { cycles: cycles, temps: temps, range: [t0, t1] };
  }

  return { amdtScope: amdtScope, sbsDiff: sbsDiff, sbsScope: sbsScope, notams: notams, notamStatus: notamStatus, notamScope: notamScope, qdecode: qdecode, timeline: timeline, partOf: partOf,
    SCENARIO: SCENARIO, Q_SUBJ: Q_SUBJ, Q_COND: Q_COND, ymd: ymd };
})();
