/*!
 * AIXM Code Converter
 * Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com> - author of the AIXM Code Converter
 * SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE; keep this notice in all copies)
 * ==========================================================================
 * AIXM Code Converter - obstacle data sets in tables (eTOD obstacles as Excel or CSV) (OBSTAB)
 * Many States deliver the electronic obstacle data set (PANS-AIM Appendix 1, Table A1-6) as a spreadsheet
 * rather than AIXM. The columns are recognised by their headings (in any order, any sheet, title rows above the
 * headings allowed): identifier, name, type, latitude / longitude (decimal degrees or DMS, in one column or in
 * degree / minute / second columns), a WKT geometry (point, line, polygon), elevation (AMSL), height (AGL), units
 * (from a unit column or the heading, e.g. "Elevation (ft)"), lighting, marking, material, horizontal and vertical
 * accuracy, datums, radius / length / width, eTOD area, aerodrome, owner, dates and remarks. Every other column is
 * kept as a remark, so nothing delivered is lost. Each row becomes an AIXM 5.1 VerticalStructure, so the obstacle
 * pages, the map, 3D, the obstacle limitation surfaces and the checks work as for AIXM obstacle data sets.
 * Formats: .csv / .tsv / .txt (comma, semicolon, tab or bar separated; decimal comma), .xlsx / .xlsm / .xls / .ods.
 * FAA Digital Obstacle File (DOF.DAT, the State / area files such as 06-CA.Dat, the change list CHG.DAT): the fixed-
 * column ASCII file of the FAA (verified / unverified, lighting, marking, accuracy codes, FAA study number, action and
 * date), read with the meaning of each code; a very large file can be limited to the area of the aerodromes loaded.
 * ========================================================================== */
/* global XLSX */
var OBSTAB = (function () {
  'use strict';
  var EXT = /\.(csv|tsv|txt|xlsx|xlsm|xls|ods)$/i, SHEET = /\.(xlsx|xlsm|xls|ods)$/i;

  /* --------------------------------------------------------------- headings */
  function norm(h) { return String(h === undefined || h === null ? '' : h).toLowerCase().replace(/[^a-z0-9]+/g, ''); }
  // unit named in a heading: "Elevation (ft)", "HEIGHT_M", "Elev. feet AMSL"
  function headUnit(h) {
    var t = ' ' + String(h || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ') + ' ';
    if (/ (ft|feet|foot) /.test(t)) return 'FT';
    if (/ (m|metre|metres|meter|meters|mtr) /.test(t)) return 'M';
    return '';
  }
  // field of a heading (normalised, units and datum words removed)
  function fieldOf(h) {
    var n = norm(h), b = n.replace(/(inmetres|inmeters|infeet|metres|meters|feet|wgs84|egm96|egm2008|msl|amsl|agl|ft|m)$/, '') || n;
    var amsl = /amsl|msl|abovesealevel|abovemeansealevel/.test(n), agl = /agl|aboveground/.test(n);
    function is(re) { return re.test(n) || re.test(b); }
    if (is(/^(wkt|geometry|geom|shape|geometrywkt|wktgeometry)$/)) return 'wkt';
    if (is(/^(lat|latitude)(deg|degree|degrees|d)$/) && !/dec|dd/.test(n)) return 'latD';
    if (is(/^(lat|latitude)(min|minute|minutes)$/)) return 'latM';
    if (is(/^(lat|latitude)(sec|second|seconds|s)$/)) return 'latS';
    if (is(/^(lat|latitude)(hem|hemisphere|ns|dir|direction)$|^ns$/)) return 'latH';
    if (is(/^(lon|long|longitude|lng)(deg|degree|degrees|d)$/) && !/dec|dd/.test(n)) return 'lonD';
    if (is(/^(lon|long|longitude|lng)(min|minute|minutes)$/)) return 'lonM';
    if (is(/^(lon|long|longitude|lng)(sec|second|seconds|s)$/)) return 'lonS';
    if (is(/^(lon|long|longitude|lng)(hem|hemisphere|ew|dir|direction)$|^ew$/)) return 'lonH';
    if (is(/^(obstacle|obst|obs)?(lat|latitude)(dd|dms|dec|decimal|deg|degrees|wgs|wgs84|n|value)?$/)) return 'lat';
    if (is(/^(obstacle|obst|obs)?(lon|long|longitude|lng)(dd|dms|dec|decimal|deg|degrees|wgs|wgs84|e|value)?$/)) return 'lon';
    if (is(/^(y|ycoord|ycoordinate|northing)$/)) return 'y';
    if (is(/^(x|xcoord|xcoordinate|easting)$/)) return 'x';
    if (is(/(horizontal|horiz|hor|position|pos)(accuracy|acc)/) || n === 'hacc') return 'hAcc';
    if (is(/(vertical|vert|ver|elevation|elev|height)(accuracy|acc)/) || n === 'vacc') return 'vAcc';
    if (is(/(horizontal|horiz)(datum|reference)/)) return 'hDatum';
    if (is(/(vertical|vert)(datum|reference)/) || n === 'datum') return 'vDatum';
    if (is(/(elevation|elev|height|hgt)(unit|units|uom)/)) return /hei|hgt/.test(n) ? 'hUnit' : 'eUnit';
    if (is(/^(unit|units|uom|unitofmeasure|unitofmeasurement)$/)) return 'unit';
    if (is(/^(ground|base|terrain|site)(elevation|elev|level|height)/)) return 'ground';
    if (amsl || is(/^(top)?(elevation|elev|altitude|alt|topelevation|topelev|obstacleelevation|obstacleelev|obselevation|obselev|maxelevation|maxelev|elevationtop)$/)) return 'elev';
    if (agl || is(/^(obstacle|obst|obs|structure)?(height|hgt|ht)$/)) return 'height';
    if (is(/^(lighting|lighted|lit|light|lights|obstaclelighting|lightingtype|lighttype)$/)) return 'light';
    if (is(/^(lighting|light)(colour|color)$/)) return 'lightColour';
    if (is(/^(marking|marked|markings|markingtype|obstaclemarking|markingpattern|daymarking)$/)) return 'mark';
    if (is(/^(marking)(colour|color)$/)) return 'markColour';
    if (is(/^(material|visiblematerial|construction|constructionmaterial)$/)) return 'material';
    if (is(/^(radius|horizontalradius)$/)) return 'radius';
    if (is(/^(length|horizontallength)$/)) return 'length';
    if (is(/^(width|horizontalwidth)$/)) return 'width';
    if (is(/^(etod)?(area|etodarea|coveragearea|obstaclearea|areano|areanumber)$/)) return 'area';
    if (is(/^(aerodrome|airport|ad|icao|locationindicator|aerodromeicao|airporticao|adicao|icaocode|aerodromecode)$/)) return 'ad';
    if (is(/^(owner|operator|ownername|operatorname|ownerorganisation|ownerorganization)$/)) return 'owner';
    if (is(/^(group|grouped|obstaclegroup)$/)) return 'group';
    if (is(/^(mobile|temporary|status|constructionstatus|condition)$/)) return n === 'mobile' ? 'mobile' : 'status';
    if (is(/^(frangible|frangibility)$/)) return 'frangible';
    if (is(/^(effective|effectivedate|validfrom|validitystart|startdate|start|from|effectivefrom)$/)) return 'from';
    if (is(/^(validto|validityend|enddate|end|to|validuntil|expiry|expirydate)$/)) return 'to';
    if (is(/^(remark|remarks|note|notes|comment|comments|description|descr|txtrmk|annotation)$/)) return 'remark';
    if (is(/^(obstacle|obst|obs)?(type|category|kind|class|descrtype|featuretype|structuretype)$/)) return 'type';
    if (is(/^(obstacle|obst|obs|structure)?(name|designation|label)$/)) return 'name';
    if (is(/^(obstacle|obst|obs)?(id|identifier|ident|uid|no|nr|number|num|ref|reference|code|designator|serial|sn|objectid|fid)$/)) return 'id';
    return '';
  }
  // the heading row: the first of the first 40 rows naming a position (latitude and longitude, or a geometry)
  function findHeader(rows) {
    for (var i = 0; i < Math.min(rows.length, 40); i++) {
      var f = (rows[i] || []).map(fieldOf), has = function (k) { return f.indexOf(k) >= 0; };
      var pos = (has('lat') || has('latD') || has('y')) && (has('lon') || has('lonD') || has('x'));
      if ((pos || has('wkt')) && f.filter(Boolean).length >= 2) return i;
    }
    return -1;
  }

  /* ----------------------------------------------------------------- values */
  function txt(v) { return v === undefined || v === null ? '' : String(v).trim(); }
  function numOf(v) {
    if (typeof v === 'number') return isFinite(v) ? v : NaN;
    var m = /[-+]?\d+(?:[.,]\d+)?(?:[eE][-+]?\d+)?/.exec(txt(v).replace(/\s(?=\d{3}\b)/g, ''));
    return m ? parseFloat(m[0].replace(',', '.')) : NaN;
  }
  // unit written in a cell ("123 ft", "45.2 M")
  function cellUnit(v) { return /\b(ft|feet|foot)\b/i.test(txt(v)) ? 'FT' : /\d\s*m\b|\bmetres?\b|\bmeters?\b/i.test(txt(v)) ? 'M' : ''; }
  function unitWord(v) { var t = txt(v).toLowerCase(); return /^(ft|feet|foot|f)$/.test(t) ? 'FT' : /^(m|metre|metres|meter|meters|mtr)$/.test(t) ? 'M' : ''; }
  // a coordinate: decimal degrees, with or without hemisphere, or degrees / minutes / seconds in any common writing:
  // 24.7036, -46.5, 24°42'13.0"N, N 24 42 13.0, 244213.0N, 0464512.25E, 24-42-13.0 N
  function coordOf(v, lat) {
    if (typeof v === 'number') return v;
    var t = txt(v).toUpperCase().replace(/,(?=\d)/g, '.');
    if (!t) return NaN;
    var h = /[NSEW]/.exec(t), neg = /^\s*-/.test(t) || (h && /[SW]/.test(h[0]));
    var nums = t.match(/\d+(?:\.\d+)?/g);
    if (!nums) return NaN;
    var v0;
    if (nums.length === 1) {
      var s = nums[0], ip = s.split('.')[0], dl = lat ? 2 : 3;
      if (h && ip.length >= dl + 4) { // packed DDMMSS(.s) / DDDMMSS(.s)
        var dd = ip.length - 4;
        v0 = +ip.slice(0, dd) + (+ip.slice(dd, dd + 2)) / 60 + parseFloat(s.slice(dd + 2)) / 3600;
      } else if (h && ip.length === dl + 2 && !/\./.test(s)) v0 = +ip.slice(0, dl) + (+ip.slice(dl)) / 60; // DDMM / DDDMM
      else v0 = parseFloat(s);
    } else v0 = +nums[0] + (+nums[1] || 0) / 60 + (+(nums[2] || 0)) / 3600;
    return neg ? -Math.abs(v0) : v0;
  }
  function yesNo(v) {
    var t = txt(v).toUpperCase();
    if (!t) return '';
    if (/^(Y|YES|TRUE|1|LIT|LIGHTED|LIGHTING|MARKED|X|OUI|SI|SÍ)$/.test(t)) return 'YES';
    if (/^(N|NO|FALSE|0|NIL|NONE|UNLIT|NOT LIGHTED|UNMARKED|NON)$/.test(t)) return 'NO';
    return 'TEXT';
  }
  // AIXM 5.1 CodeVerticalStructureType
  var TYPES = ('AG_EQUIP ANTENNA ARCH BRIDGE BUILDING CABLE_CAR CATENARY COMPRESSED_AIR_SYSTEM CONTROL_MONITORING_SYSTEM CONTROL_TOWER COOLING_TOWER CRANE DAM DOME ' +
    'ELECTRICAL_EXIT_LIGHT ELECTRICAL_SYSTEM ELEVATOR FENCE FUEL_SYSTEM GATE GENERAL_UTILITY GRAIN_ELEVATOR HEAT_COOL_SYSTEM INDUSTRIAL_SYSTEM LIGHTHOUSE MONUMENT ' +
    'NATURAL_GAS_SYSTEM NATURAL_HIGHPOINT NAVAID NUCLEAR_REACTOR POLE POWER_PLANT REFINERY RIG SALTWATER_SYSTEM SIGN SPIRE STACK STADIUM STORAGE_TANK TETHERED_BALLOON ' +
    'TOWER TRAMWAY TRANSMISSION_LINE TREE URBAN_AREA VEGETATION WALL WASTEWATER_SYSTEM WATER_SYSTEM WATER_TOWER WINDMILL WINDMILL_FARMS').split(' ');
  var TYPE_WORDS = [[/WIND ?TURBINE|WIND ?MILL/, 'WINDMILL'], [/WIND ?FARM/, 'WINDMILL_FARMS'], [/CHIMNEY|STACK/, 'STACK'], [/ANTENNA|AERIAL|TELECOM|COMMUNICATION|GSM|MOBILE MAST|MAST/, 'ANTENNA'],
    [/CONTROL TOWER|ATC TOWER/, 'CONTROL_TOWER'], [/WATER TOWER/, 'WATER_TOWER'], [/COOLING TOWER/, 'COOLING_TOWER'], [/TOWER|PYLON/, 'TOWER'], [/POWER ?LINE|TRANSMISSION|HIGH ?VOLTAGE|CABLE/, 'TRANSMISSION_LINE'],
    [/CRANE/, 'CRANE'], [/BUILDING|HOUSE|HANGAR|TERMINAL|HOTEL|MOSQUE|CHURCH|HOSPITAL|SCHOOL|FACTORY|WAREHOUSE/, 'BUILDING'], [/MINARET|SPIRE|STEEPLE/, 'SPIRE'],
    [/TREE|PALM/, 'TREE'], [/FOREST|VEGETATION|BUSH/, 'VEGETATION'], [/POLE|LAMP|LIGHT POST|FLAG/, 'POLE'], [/TANK|SILO/, 'STORAGE_TANK'], [/HILL|PEAK|TERRAIN|MOUNTAIN|NATURAL/, 'NATURAL_HIGHPOINT'],
    [/BRIDGE/, 'BRIDGE'], [/FENCE/, 'FENCE'], [/WALL/, 'WALL'], [/DOME/, 'DOME'], [/MONUMENT|STATUE/, 'MONUMENT'], [/LIGHTHOUSE/, 'LIGHTHOUSE'], [/STADIUM/, 'STADIUM'],
    [/RIG|PLATFORM|OIL/, 'RIG'], [/REFINERY/, 'REFINERY'], [/POWER PLANT|POWER STATION/, 'POWER_PLANT'], [/NAVAID|VOR|DME|NDB|ILS|RADAR/, 'NAVAID'], [/SIGN|BILLBOARD/, 'SIGN'], [/DAM/, 'DAM']];
  function typeOf(v) {
    var t = txt(v).toUpperCase();
    if (!t) return '';
    var u = t.replace(/[\s-]+/g, '_');
    if (TYPES.indexOf(u) >= 0) return u;
    for (var i = 0; i < TYPE_WORDS.length; i++) if (TYPE_WORDS[i][0].test(t)) return TYPE_WORDS[i][1];
    return 'OTHER:' + t.replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 58);
  }
  // Excel date numbers and written dates -> ISO date-time (UTC)
  function dateOf(v) {
    if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 86400000)).toISOString().replace('.000Z', 'Z');
    var t = txt(v), m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(t) || null;
    if (m) return m[1] + '-' + m[2] + '-' + m[3] + 'T' + (m[4] || '00') + ':' + (m[5] || '00') + ':00Z';
    m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(t);
    if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2) + 'T00:00:00Z';
    return '';
  }
  // WKT (optionally with a Z value per point): POINT, LINESTRING, POLYGON, MULTIPOLYGON (first polygon) -> {t, c}
  function wktOf(v) {
    var t = txt(v).toUpperCase().replace(/^SRID=\d+;/, '');
    var m = /^(MULTI)?(POINT|LINESTRING|POLYGON)\s*Z?M?\s*\((.*)\)\s*$/.exec(t);
    if (!m) return null;
    function pts(s) { return s.replace(/[()]/g, ' ').split(',').map(function (p) { var q = p.trim().split(/\s+/).map(Number); return [q[0], q[1]]; }).filter(function (p) { return isFinite(p[0]) && isFinite(p[1]); }); }
    var body = m[3];
    if (m[2] === 'POINT') { var p = pts(body)[0]; return p ? { t: 'P', c: p } : null; }
    if (m[2] === 'LINESTRING') { var l = pts(m[1] ? body.split(/\)\s*,\s*\(/)[0] : body); return l.length > 1 ? { t: 'L', c: l } : null; }
    var ring = pts((m[1] ? body.split(/\)\s*\)\s*,\s*\(\s*\(/)[0] : body).split(/\)\s*,\s*\(/)[0]);
    return ring.length > 2 ? { t: 'A', c: [ring] } : null;
  }

  /* ------------------------------------------------------------------ tables */
  // CSV text -> rows (quotes, separators , ; tab |, chosen from the lines at the top)
  function parseCsv(text) {
    text = text.replace(/^﻿/, '');
    var head = text.slice(0, 20000).split(/\r?\n/).slice(0, 40), best = ',', bestN = 0;
    [',', ';', '\t', '|'].forEach(function (d) {
      var n = head.reduce(function (a, l) { return a + l.split(d).length - 1; }, 0);
      if (n > bestN) { bestN = n; best = d; }
    });
    var rows = [], row = [], cell = '', q = false, i = 0, n = text.length;
    for (; i < n; i++) {
      var c = text.charAt(i);
      if (q) {
        if (c === '"') { if (text.charAt(i + 1) === '"') { cell += '"'; i++; } else q = false; } else cell += c;
      } else if (c === '"' && cell === '') q = true;
      else if (c === best) { row.push(cell); cell = ''; } else if (c === '\n' || c === '\r') {
        if (c === '\r' && text.charAt(i + 1) === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return { rows: rows, sep: best };
  }
  function sheetRows(wb) {
    var out = [];
    wb.SheetNames.forEach(function (nm) {
      var rows = XLSX.utils.sheet_to_json(wb.Sheets[nm], { header: 1, raw: true, defval: '', blankrows: true });
      out.push({ sheet: nm, rows: rows });
    });
    return out;
  }
  // the tables of a file: [{sheet, rows}] (one for a CSV file)
  async function tables(file) {
    if (SHEET.test(file.name)) {
      if (typeof XLSX === 'undefined') throw new Error('the spreadsheet reader is not available');
      return sheetRows(XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array', cellDates: false, dense: true }));
    }
    var text = await file.text();
    if (/�/.test(text.slice(0, 4000))) text = new TextDecoder('windows-1252').decode(await file.arrayBuffer());
    var p = parseCsv(text);
    return [{ sheet: '', rows: p.rows, sep: p.sep }];
  }

  // is this an obstacle table? -> sniff-like result {family: 'tab'} or {family: null, notes}
  async function sniffFile(file) {
    if (!EXT.test(file.name)) return null;
    var tabs;
    try { tabs = await tables(file); } catch (e) { return { family: null, notes: ['Cannot read the table: ' + e.message] }; }
    var found = tabs.filter(function (t) { return findHeader(t.rows) >= 0; });
    if (!found.length) return { family: null, notes: ['No obstacle table found (a heading row with latitude and longitude, or a WKT geometry column)'] };
    var rows = found.reduce(function (n, t) { return n + Math.max(0, t.rows.length - findHeader(t.rows) - 1); }, 0);
    var kind = SHEET.test(file.name) ? 'Excel' : 'CSV';
    return { family: 'tab', version: kind, versionLabel: 'Obstacles (' + kind + ')', notes: [], header: {}, aixmPrefixes: [], gmlPrefixes: [], rows: rows,
      sheets: found.map(function (t) { return t.sheet; }) };
  }

  // rows -> VerticalStructure records; returns {recs, src: row texts by record, columns, problems}
  async function read(file, fileIdx) {
    var tabs = await tables(file), recs = [], src = [], columns = [], ignored = [], line = 0, base = 'tab-' + norm(file.name.replace(/\.[^.]+$/, '')).slice(0, 40);
    var problems = [];
    tabs.forEach(function (tab) {
      var hi = findHeader(tab.rows);
      if (hi < 0) return;
      var head = tab.rows[hi].map(txt), f = head.map(fieldOf), col = {};
      f.forEach(function (k, i) { if (k && col[k] === undefined) col[k] = i; });
      head.forEach(function (h, i) { if (!h) return; (f[i] && col[f[i]] === i ? columns : ignored).push((tab.sheet ? tab.sheet + ': ' : '') + h + (f[i] && col[f[i]] === i ? ' → ' + f[i] : '')); });
      var eU = headUnit(head[col.elev]), hU = headUnit(head[col.height]), gU = headUnit(head[col.ground]);
      for (var ri = hi + 1; ri < tab.rows.length; ri++) {
        var row = tab.rows[ri] || [], at = function (k) { return col[k] === undefined ? '' : row[col[k]]; };
        if (!row.some(function (c) { return txt(c) !== ''; })) continue;
        var where = (tab.sheet ? 'sheet ' + tab.sheet + ', ' : '') + 'row ' + (ri + 1);
        var srcText = head.map(function (h, i) { return (h || 'column ' + (i + 1)) + ': ' + txt(row[i]); }).join('\n');
        var geo = null, err = [];
        if (col.wkt !== undefined && txt(at('wkt'))) { geo = wktOf(at('wkt')); if (!geo) err.push('geometry not understood: ' + txt(at('wkt')).slice(0, 60)); }
        if (!geo) {
          var la, lo;
          // degrees / minutes / seconds in their own columns (empty degrees: no position, not 0)
          if (col.latD !== undefined && col.latM !== undefined) la = !txt(at('latD')) ? NaN : coordOf([txt(at('latD')), txt(at('latM')), txt(at('latS')) || '0'].join(' ') + ' ' + txt(at('latH')), true);
          else la = coordOf(col.lat !== undefined ? at('lat') : col.latD !== undefined ? at('latD') : at('y'), true);
          if (col.lonD !== undefined && col.lonM !== undefined) lo = !txt(at('lonD')) ? NaN : coordOf([txt(at('lonD')), txt(at('lonM')), txt(at('lonS')) || '0'].join(' ') + ' ' + txt(at('lonH')), false);
          else lo = coordOf(col.lon !== undefined ? at('lon') : col.lonD !== undefined ? at('lonD') : at('x'), false);
          if (txt(at('latH')) && /S/i.test(txt(at('latH')))) la = -Math.abs(la);
          if (txt(at('lonH')) && /W/i.test(txt(at('lonH')))) lo = -Math.abs(lo);
          if (isNaN(la) || isNaN(lo)) err.push('no position (latitude / longitude not given or not understood)');
          else if (Math.abs(la) > 90 || Math.abs(lo) > 180) err.push('position outside the Earth: ' + la + ', ' + lo + (col.x !== undefined ? ' (projected coordinates are not read: give latitude and longitude)' : ''));
          else geo = { t: 'P', c: [lo, la] };
        }
        var unitAll = unitWord(at('unit'));
        var eUnit = unitWord(at('eUnit')) || cellUnit(at('elev')) || eU || unitAll, hUnit = unitWord(at('hUnit')) || cellUnit(at('height')) || hU || unitAll || eUnit;
        var elev = numOf(at('elev')), hgt = numOf(at('height')), gnd = numOf(at('ground'));
        if (isNaN(elev) && !isNaN(gnd) && !isNaN(hgt)) { elev = gnd + hgt; eUnit = eUnit || gU || hUnit; }
        if (txt(at('elev')) && isNaN(elev)) err.push('elevation not understood: ' + txt(at('elev')));
        if (txt(at('height')) && isNaN(hgt)) err.push('height not understood: ' + txt(at('height')));
        line = ri;
        if (!geo) {
          recs.push({ k: '#error', id: 'error@' + base + '-' + recs.length, ts: [], err: where + ': ' + err.join('; '), o: recs.length, n: 0, l: line, w: 0, f: fileIdx || undefined });
          src.push(srcText); problems.push(where + ': ' + err.join('; '));
          continue;
        }
        var q = function (v, u) { return isNaN(v) ? undefined : { v: String(+v.toFixed(3)), u: u || 'M' }; };
        var kind = geo.t === 'P' ? 'ElevatedPoint' : geo.t === 'L' ? 'ElevatedCurve' : 'ElevatedSurface';
        var hp = { _t: kind, _geo: geo };
        if (!isNaN(elev)) hp.elevation = q(elev, eUnit);
        var ha = numOf(at('hAcc')), va = numOf(at('vAcc'));
        if (!isNaN(ha)) hp.horizontalAccuracy = q(ha, cellUnit(at('hAcc')) || headUnit(head[col.hAcc]) || 'M');
        if (!isNaN(va)) hp.verticalAccuracy = q(va, cellUnit(at('vAcc')) || headUnit(head[col.vAcc]) || eUnit || 'M');
        if (txt(at('vDatum'))) hp.verticalDatum = txt(at('vDatum')).toUpperCase().replace(/\s+/g, '_');
        var part = { _t: 'VerticalStructurePart' };
        part[geo.t === 'P' ? 'horizontalProjection_location' : geo.t === 'L' ? 'horizontalProjection_curve' : 'horizontalProjection_surface'] = hp;
        if (!isNaN(hgt)) part.verticalExtent = q(hgt, hUnit);
        var ty = typeOf(at('type')), p = { _tab: true };
        var id = txt(at('id')), name = txt(at('name'));
        if (name) p.name = name; else if (id) p.name = id;
        if (id) p.designator = id;
        if (ty) { p.type = ty; part.type = ty; }
        var lit = yesNo(at('light'));
        if (lit === 'TEXT') { p.lighted = 'YES'; part.lighting = { _t: 'LightElement', _descr: txt(at('light')) }; } else if (lit) p.lighted = lit;
        if (txt(at('lightColour'))) part.lighting = Object.assign(part.lighting || { _t: 'LightElement' }, { colour: txt(at('lightColour')).toUpperCase() });
        var mk = yesNo(at('mark'));
        if (mk === 'TEXT') { p.markingICAOStandard = 'YES'; part.markingPattern = txt(at('mark')).toUpperCase(); } else if (mk) p.markingICAOStandard = mk;
        if (txt(at('markColour'))) part.markingFirstColour = txt(at('markColour')).toUpperCase();
        if (txt(at('material'))) part.visibleMaterial = txt(at('material')).toUpperCase();
        if (yesNo(at('group')) === 'YES' || yesNo(at('group')) === 'NO') p.group = yesNo(at('group'));
        if (yesNo(at('mobile')) === 'YES' || yesNo(at('mobile')) === 'NO') part.mobile = yesNo(at('mobile'));
        if (yesNo(at('frangible')) === 'YES' || yesNo(at('frangible')) === 'NO') part.frangible = yesNo(at('frangible'));
        if (txt(at('status'))) part.constructionStatus = txt(at('status')).toUpperCase().replace(/\s+/g, '_');
        ['radius', 'length', 'width'].forEach(function (k) { var v = numOf(at(k)); if (!isNaN(v)) p[k] = q(v, cellUnit(at(k)) || headUnit(head[col[k]]) || 'M'); });
        p.part = part;
        // what AIXM has no property for, and every other column: remarks (nothing delivered is lost)
        var notes = [];
        if (txt(at('area'))) notes.push('eTOD area: ' + txt(at('area')));
        if (txt(at('ad'))) notes.push('Aerodrome: ' + txt(at('ad')));
        if (txt(at('owner'))) notes.push('Owner / operator: ' + txt(at('owner')));
        if (txt(at('hDatum'))) notes.push('Horizontal datum: ' + txt(at('hDatum')));
        if (!isNaN(gnd)) notes.push('Ground elevation: ' + gnd + ' ' + (gU || eUnit || 'M'));
        if (txt(at('remark'))) notes.push(txt(at('remark')));
        head.forEach(function (h, i) { if (txt(row[i]) && !(f[i] && col[f[i]] === i)) notes.push((h || 'Column ' + (i + 1)) + ': ' + txt(row[i])); });
        if (notes.length) p.annotation = notes.map(function (n) { return { _t: 'Note', purpose: 'REMARK', translatedNote: { _t: 'LinguisticNote', note: n } }; });
        if (!eUnit && !isNaN(elev)) problems.push(where + ': elevation unit not given, metres assumed');
        var from = dateOf(at('from')), to = dateOf(at('to'));
        recs.push({ k: 'VerticalStructure', id: base + '-' + (tab.sheet ? norm(tab.sheet).slice(0, 20) + '-' : '') + (ri + 1), ts: [{ i: 'BASELINE', s: 1, c: 0, b: from || null, e: to || null, p: p }],
          o: recs.length, n: 0, l: line, w: 0, f: fileIdx || undefined });
        src.push(srcText);
        if (err.length) problems.push(where + ': ' + err.join('; '));
      }
    });
    var unitMissing = problems.filter(function (x) { return /metres assumed/.test(x); }).length;
    if (unitMissing) { problems = problems.filter(function (x) { return !/metres assumed/.test(x); }); problems.unshift('Elevation unit not given in ' + unitMissing + ' row(s): metres assumed (name the unit in the heading, e.g. "Elevation (ft)", or in a unit column)'); }
    return { recs: recs, src: src, columns: columns, ignored: ignored, problems: problems, lines: line + 1 };
  }


  /* ------------------------------------------------- FAA Digital Obstacle File (DOF) */
  // FAA AIS "OAS Digital Obstacle File" (DOF_README): one obstacle per line, fixed columns, heights in feet, WGS 84.
  // The change list (CHG.DAT) has the same columns after a 10-character action (DISMANTLE, OLD, NEW, ADD, REMOVE).
  var DOF_EXT = /\.dat$/i;
  var DOF_TYPE = { 'TOWER': 'TOWER', 'T-L TWR': 'TOWER', 'POLE': 'POLE', 'UTILITY POLE': 'POLE', 'WINDMILL': 'WINDMILL', 'BLDG': 'BUILDING', 'BLDG-TWR': 'BUILDING', 'HANGAR': 'BUILDING',
    'FENCE': 'FENCE', 'SIGN': 'SIGN', 'TANK': 'STORAGE_TANK', 'SILO': 'STORAGE_TANK', 'CATENARY': 'CATENARY', 'STACK': 'STACK', 'NAVAID': 'NAVAID', 'GEN UTIL': 'GENERAL_UTILITY',
    'ELEVATOR': 'ELEVATOR', 'ELEC SYS': 'ELECTRICAL_SYSTEM', 'BRIDGE': 'BRIDGE', 'CRANE': 'CRANE', 'CTRL TWR': 'CONTROL_TOWER', 'ANTENNA': 'ANTENNA', 'SPIRE': 'SPIRE',
    'PLANT': 'INDUSTRIAL_SYSTEM', 'RIG': 'RIG', 'REFINERY': 'REFINERY', 'AG EQUIP': 'AG_EQUIP', 'MONUMENT': 'MONUMENT', 'DAM': 'DAM', 'POWER PLANT': 'POWER_PLANT', 'STADIUM': 'STADIUM',
    'COOL TWR': 'COOLING_TOWER', 'DOME': 'DOME', 'GRAIN ELEVATOR': 'GRAIN_ELEVATOR', 'WALL': 'WALL', 'TRAMWAY': 'TRAMWAY', 'BALLOON': 'TETHERED_BALLOON', 'LGTHOUSE': 'LIGHTHOUSE',
    'NATURAL GAS SYSTEM': 'NATURAL_GAS_SYSTEM', 'ARCH': 'ARCH', 'HEAT COOL SYSTEM': 'HEAT_COOL_SYSTEM', 'GATE': 'GATE' };
  // lighting code -> [description, colour, intensity]
  var DOF_LIGHT = { R: ['red', 'RED', ''], D: ['medium intensity white strobe and red', '', 'MIL'], H: ['high intensity white strobe and red', '', 'HIL'], M: ['medium intensity white strobe', 'WHITE', 'MIL'],
    S: ['high intensity white strobe', 'WHITE', 'HIL'], F: ['flood', '', ''], C: ['dual medium catenary', '', 'MIL'], W: ['synchronized red', 'RED', ''], L: ['lighted (type unknown)', '', ''] };
  var DOF_MARK = { P: ['orange or orange and white paint', 'ORANGE', 'WHITE'], W: ['white paint only', 'WHITE', ''], M: ['marked', '', ''], F: ['flag marker', '', ''], S: ['spherical marker', '', ''] };
  var DOF_HACC = { 1: [20, 'FT'], 2: [50, 'FT'], 3: [100, 'FT'], 4: [250, 'FT'], 5: [500, 'FT'], 6: [1000, 'FT'], 7: [0.5, 'NM'], 8: [1, 'NM'] };
  var DOF_VACC = { A: 3, B: 10, C: 20, D: 50, E: 125, F: 250, G: 500, H: 1000 };
  var DOF_ACT = { A: 'add', C: 'change', D: 'dismantle', R: 'remove' };
  function isDofHead(t) { return /CURRENCY DATE\s*=/.test(t) && /OAS#/.test(t) || /^\s*ACTION\s+OAS#/m.test(t) || /^[\w ]{0,10}[A-Z0-9]{2}-\d{6} [OU ] [A-Z ]{2} [A-Z ]{2} .{16} \d{2} \d{2} \d{2}\.\d{2}[NS] \d{3} \d{2} \d{2}\.\d{2}[EW] /m.test(t); }
  // YYYYDDD -> YYYY-MM-DD
  function julian(t) { var m = /^(\d{4})(\d{3})$/.exec(t || ''); if (!m || +m[2] < 1 || +m[2] > 366) return ''; return new Date(Date.UTC(+m[1], 0, +m[2])).toISOString().slice(0, 10); }
  // one obstacle line -> fields, or null (headers, rules, blank lines)
  function dofLine(l) {
    var m = /([A-Z0-9]{2}-\d{6}) /.exec(l);
    if (!m || m.index > 12 || l.length < m.index + 100) return null;
    var p = m.index, c = function (a, b) { return l.slice(p + a, p + b).trim(); };
    var lat = +c(35, 37) + +c(38, 40) / 60 + parseFloat(c(41, 46)) / 3600, lon = +c(48, 51) + +c(52, 54) / 60 + parseFloat(c(55, 60)) / 3600;
    if (l.charAt(p + 46) === 'S') lat = -lat;
    if (l.charAt(p + 60) === 'W') lon = -lon;
    if (!isFinite(lat) || !isFinite(lon)) return null;
    var tail = /\s([ACDR])\s?(\d{7})\s*$/.exec(l) || /\s([ACDR])\s*$/.exec(l);
    return { chg: p ? l.slice(0, p).trim() : '', oas: m[1], ver: l.charAt(p + 10), ctry: c(12, 14), st: c(15, 17), city: c(18, 34), lat: lat, lon: lon, type: c(62, 80), qty: parseInt(c(81, 82), 10) || 1,
      agl: parseInt(c(83, 88), 10), amsl: parseInt(c(89, 94), 10), lt: l.charAt(p + 95), ha: l.charAt(p + 97), va: l.charAt(p + 99), mk: l.charAt(p + 101), study: c(103, 117),
      act: tail ? tail[1] : '', date: tail && tail[2] ? julian(tail[2]) : '' };
  }
  function dofType(t) { var u = String(t || '').toUpperCase().trim(); return DOF_TYPE[u] || (u ? typeOf(u) : ''); }
  async function dofSniff(file) {
    var head = await file.slice(0, 8192).text();
    if (!isDofHead(head)) return { family: null, notes: ['Not an FAA Digital Obstacle File (no DOF heading or obstacle lines)'] };
    var cur = /CURRENCY DATE\s*=\s*(\d{2})\/(\d{2})\/(\d{2})/.exec(head), chg = /^\s*ACTION\s+OAS#/m.test(head);
    var lines = head.split(/\r?\n/), first = lines.filter(dofLine)[0] || '';
    var rows = Math.max(0, Math.round((file.size - head.indexOf(first)) / ((first.length || 127) + 1)));
    return { family: 'tab', version: 'FAA DOF', versionLabel: chg ? 'Obstacles (FAA DOF change list)' : 'Obstacles (FAA DOF)', notes: [], header: {}, aixmPrefixes: [], gmlPrefixes: [], rows: rows, dof: true, change: chg,
      currency: cur ? '20' + cur[3] + '-' + cur[1] + '-' + cur[2] : '', title: 'FAA Digital Obstacle File' + (chg ? ' change list' : '') + (cur ? ' (currency date 20' + cur[3] + '-' + cur[1] + '-' + cur[2] + ')' : '') };
  }
  // opt: {near: [{c: [lon, lat], nm}], max} - keep the obstacles within nm of a point / the first max obstacles (a very large file)
  async function dofRead(file, fileIdx, opt) {
    opt = opt || {};
    var text = await file.text(), recs = [], problems = [], base = 'dof-' + norm(file.name.replace(/\.[^.]+$/, '')).slice(0, 30), pos = 0, ln = 0, kept = 0, outside = 0, over = 0, bad = 0;
    var near = (opt.near || []).filter(function (x) { return x && x.c && isFinite(x.c[0]) && isFinite(x.c[1]); }).map(function (x) { return { lon: x.c[0], lat: x.c[1], nm: x.nm || 60, k: Math.cos(x.c[1] * Math.PI / 180) }; });
    var cur = /CURRENCY DATE\s*=\s*(\d{2})\/(\d{2})\/(\d{2})/.exec(text.slice(0, 400)), curTxt = cur ? '20' + cur[3] + '-' + cur[1] + '-' + cur[2] : '';
    var pool = {};
    function shared(k, make) { return pool[k] || (pool[k] = make()); }
    function inside(d) {
      if (!near.length) return true;
      for (var i = 0; i < near.length; i++) { var n = near[i], dy = (d.lat - n.lat) * 60, dx = (d.lon - n.lon) * 60 * n.k; if (dx * dx + dy * dy <= n.nm * n.nm) return true; }
      return false;
    }
    while (pos < text.length) {
      var e = text.indexOf('\n', pos); if (e < 0) e = text.length;
      var l = text.slice(pos, e).replace(/\r$/, ''), at = pos; ln++; pos = e + 1;
      if (!l.trim()) continue;
      var d = dofLine(l);
      if (!d) { if (ln > 4 && /\d{2} \d{2} \d{2}\.\d{2}[NS]/.test(l)) bad++; continue; }
      if (!inside(d)) { outside++; continue; }
      if (opt.max && kept >= opt.max) { over++; continue; }
      kept++;
      var hp = { _t: 'ElevatedPoint', _geo: { t: 'P', c: [+d.lon.toFixed(8), +d.lat.toFixed(8)] } };
      if (isFinite(d.amsl)) hp.elevation = { v: String(d.amsl), u: 'FT' };
      // the coded values are shared by the obstacles that have them (a State file: tens of thousands of obstacles)
      if (DOF_HACC[d.ha]) hp.horizontalAccuracy = shared('h' + d.ha, function () { return { v: String(DOF_HACC[d.ha][0]), u: DOF_HACC[d.ha][1] }; });
      if (DOF_VACC[d.va]) hp.verticalAccuracy = shared('v' + d.va, function () { return { v: String(DOF_VACC[d.va]), u: 'FT' }; });
      var ty = dofType(d.type), part = { _t: 'VerticalStructurePart', horizontalProjection_location: hp };
      if (isFinite(d.agl)) part.verticalExtent = { v: String(d.agl), u: 'FT' };
      if (ty) part.type = ty;
      var p = { _tab: true, designator: d.oas, name: d.city + (d.st ? ', ' + d.st : '') + (d.ctry && d.ctry !== 'US' ? ' (' + d.ctry + ')' : ''), part: part };
      if (ty) p.type = ty;
      var li = DOF_LIGHT[d.lt];
      if (li) { p.lighted = 'YES'; part.lighting = shared('l' + d.lt, function () { var o = { _t: 'LightElement', _descr: li[0] }; if (li[1]) o.colour = li[1]; if (li[2]) o.intensityLevel = li[2]; return o; }); }
      else if (d.lt === 'N') p.lighted = 'NO';
      var mk = DOF_MARK[d.mk];
      if (mk) { p.markingICAOStandard = 'YES'; if (mk[1]) part.markingFirstColour = mk[1]; if (mk[2]) part.markingSecondColour = mk[2]; if (d.mk === 'F' || d.mk === 'S') part.markingPattern = d.mk === 'F' ? 'OTHER:FLAG_MARKER' : 'OTHER:SPHERICAL_MARKER'; }
      else if (d.mk === 'N') p.markingICAOStandard = 'NO';
      if (d.qty > 1) p.group = 'YES';
      if (d.act === 'D' || d.act === 'R' || /^(DISMANTLE|REMOVE)/.test(d.chg)) part.constructionStatus = 'OTHER:' + (d.act === 'R' || /^REMOVE/.test(d.chg) ? 'REMOVED' : 'DISMANTLED');
      // one remark with what AIXM has no property for (nothing of the line is lost: the line itself is the source)
      var note = 'FAA DOF: ' + (d.ver === 'O' ? 'verified' : d.ver === 'U' ? 'UNVERIFIED (position and height not verified by the FAA)' : 'verification not given') +
        ' · ' + [d.city, d.st, d.ctry].filter(Boolean).join(', ') + ' · type ' + d.type + (d.qty > 1 ? ' · quantity ' + d.qty : '') +
        (li ? ' · lighting ' + li[0] : d.lt === 'U' ? ' · lighting unknown' : '') + (mk ? ' · marking ' + mk[0] : d.mk === 'U' ? ' · marking unknown' : '') +
        (d.ha === '9' ? ' · horizontal accuracy unknown' : '') + (d.va === 'I' ? ' · vertical accuracy unknown' : '') +
        (d.study ? ' · FAA study ' + d.study : '') + (d.chg ? ' · change list: ' + d.chg : '') + (d.act ? ' · action ' + (DOF_ACT[d.act] || d.act) + (d.date ? ' on ' + d.date : '') : '');
      p.annotation = { _t: 'Note', purpose: 'REMARK', translatedNote: { _t: 'LinguisticNote', note: note } };
      // o / n: the line in the file (its source, read back from the file like an XML fragment)
      recs.push({ k: 'VerticalStructure', id: base + '-' + d.oas.toLowerCase() + (d.chg ? '-' + d.chg.toLowerCase() + '-' + ln : ''), ts: [{ i: 'BASELINE', s: 1, c: 0, b: null, e: null, p: p }], o: at, n: l.length, l: ln - 1, w: 0, f: fileIdx || undefined });
    }
    if (outside) problems.push(outside + ' obstacle(s) farther than ' + near.map(function (n) { return n.nm; })[0] + ' NM from the aerodromes loaded were left out (load the file alone, or a State file such as 06-CA.Dat, to read them)');
    if (over) problems.push(over + ' obstacle(s) after the first ' + opt.max + ' were left out (a very large file: load a State or area file, e.g. 06-CA.Dat, or load the aerodrome data first to keep the obstacles around it)');
    if (bad) problems.push(bad + ' line(s) not understood');
    if (curTxt) problems.unshift('Currency date of the file: ' + curTxt + ' (FAA DOF, WGS 84 positions, heights in feet)');
    return { recs: recs, src: null, columns: ['FAA Digital Obstacle File (fixed columns, DOF_README)'], ignored: [], problems: problems, lines: ln, dof: true };
  }

  return { EXT: EXT, isTable: function (name) { return EXT.test(name || ''); }, isDof: function (name) { return DOF_EXT.test(name || ''); }, sniffFile: sniffFile, read: read, dofSniff: dofSniff, dofRead: dofRead, dofLine: dofLine, isDofHead: isDofHead, fieldOf: fieldOf, coordOf: coordOf, typeOf: typeOf, parseCsv: parseCsv, wktOf: wktOf };
})();
if (typeof module !== 'undefined') module.exports = OBSTAB;
