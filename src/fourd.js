/*!
 * AIXM Code Converter
 * Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com> - author of the AIXM Code Converter
 * SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE; keep this notice in all copies)
 * ==========================================================================
 * AIXM Code Converter - 4D: the data at a chosen time (FOURD)
 * NOT FOR NAVIGATION - for study and analysis only.
 * Off until the user switches it on (Map -> 4D time); the map, the 3D view and every other tab stay as they are
 * while it is off. Loaded only when switched on (src/lazy.js).
 *   Time bar        UTC date and time, a slider over a day, a week or an AIRAC cycle, steps from 10 s to an AIRAC
 *                   cycle, play / pause, Now, holidays, the daylight saving rule; the date can be applied to every
 *                   tab (Data valid on).
 *   Timesheets      AIXM 5.x timesheets: days and day ranges (MON..SUN, working days, holidays, the days before and
 *                   after), date ranges (DD-MM, SDLST / EDLST), times, sunrise and sunset (with the offset, earliest
 *                   or latest), local time references (UTC+n), daylight saving adjustment, excluded periods;
 *                   H24 / NOTAM nil reasons; AIXM 4.5 working hours (H24, HJ, HN, HX, HO, NOTAM).
 *   At that time    airspace activation (active / available for activation / inactive), the availability of
 *                   routes, aerodromes, navaids, units, services and frequencies, temporary changes (TEMPDELTA,
 *                   e.g. Digital NOTAM) and features not valid yet or no longer valid; on the map, in a list with
 *                   the reason and the next change, and in the 3D view.
 *   Procedure       a procedure flown at a ground speed from a start time: the aircraft on the map at the time of
 *                   the bar, the time over each leg end (ETO).
 *   Exports         KML with time spans (and the flight as a gx:Track), CZML (Cesium), GeoJSON with the intervals,
 *                   a PDF / Excel report of the state at that time.
 * ========================================================================== */
/* global L, MODEL, AX, EXPORTS, STUDY, APP_INFO */
var FOURD = (function () {
  'use strict';
  var M = typeof MODEL !== 'undefined' ? MODEL : null, D2R = Math.PI / 180, DAYMS = 86400000, MIN = 60000;
  var NOTICE = 'NOT FOR NAVIGATION — for study and analysis only.';
  function s(v) { return M ? M.s(v) : v === undefined || v === null ? '' : typeof v === 'object' ? (v.v !== undefined ? String(v.v) : '') : String(v); }
  function arr(v) { return v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]; }
  function esc(t) { return String(t === undefined || t === null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(t) { return new Date(t).toISOString().slice(0, 19) + 'Z'; }
  function hm(t) { var d = new Date(t); return pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()); }
  function fmt(t) { return new Date(t).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'; }

  /* ------------------------------------------------------------- sun, DST, AIRAC */
  // sunrise and sunset (UTC ms) on the UTC date of day0 (00:00 UTC) at lon/lat (sunrise equation, -0.833°);
  // null when the sun does not rise or set that day
  var sunCache = new Map();
  function sun(lon, lat, day0) {
    var key = day0 + '|' + lon.toFixed(1) + '|' + lat.toFixed(1), c = sunCache.get(key);
    if (c) return c;
    var J = day0 / DAYMS + 2440587.5, n = Math.ceil(J - 2451545.0 + 0.0008), Js = n - lon / 360;
    var Ma = (357.5291 + 0.98560028 * Js) % 360, Mr = Ma * D2R;
    var C = 1.9148 * Math.sin(Mr) + 0.02 * Math.sin(2 * Mr) + 0.0003 * Math.sin(3 * Mr);
    var lam = ((Ma + C + 180 + 102.9372) % 360) * D2R;
    var Jt = 2451545.0 + Js + 0.0053 * Math.sin(Mr) - 0.0069 * Math.sin(2 * lam);
    var sd = Math.sin(lam) * Math.sin(23.4397 * D2R), cd = Math.cos(Math.asin(sd));
    var cw = (Math.sin(-0.833 * D2R) - Math.sin(lat * D2R) * sd) / (Math.cos(lat * D2R) * cd);
    var out = cw > 1 ? { sr: null, ss: null, polar: 'night' } : cw < -1 ? { sr: null, ss: null, polar: 'day' } : (function () {
      var w = Math.acos(cw) / D2R / 360;
      return { sr: Math.round((Jt - w - 2440587.5) * DAYMS), ss: Math.round((Jt + w - 2440587.5) * DAYMS) };
    })();
    if (sunCache.size > 20000) sunCache.clear();
    sunCache.set(key, out);
    return out;
  }
  function lastSunday(y, m) { var d = new Date(Date.UTC(y, m + 1, 0)); return Date.UTC(y, m, d.getUTCDate() - d.getUTCDay()); }
  function nthSunday(y, m, n) { var d = new Date(Date.UTC(y, m, 1)), first = 1 + (7 - d.getUTCDay()) % 7; return Date.UTC(y, m, first + (n - 1) * 7); }
  // daylight saving period of a year (UTC ms): EU (last Sunday of March to last Sunday of October, 01:00 UTC),
  // US (second Sunday of March to first Sunday of November, about 02:00 local), none
  function dstSpan(y, rule) {
    if (rule === 'EU') return [lastSunday(y, 2) + 3600000, lastSunday(y, 9) + 3600000];
    if (rule === 'US') return [nthSunday(y, 2, 2) + 7 * 3600000, nthSunday(y, 10, 1) + 6 * 3600000];
    return null;
  }
  function inDst(t, rule) { var sp = dstSpan(new Date(t).getUTCFullYear(), rule); return !!sp && t >= sp[0] && t < sp[1]; }
  var AIRAC0 = Date.UTC(2020, 0, 2), CYC = 28 * DAYMS; // AIRAC 2001 started on 2 January 2020
  function airac(t) {
    var k = Math.floor((t - AIRAC0) / CYC), start = AIRAC0 + k * CYC, y = new Date(start).getUTCFullYear();
    var first = AIRAC0 + Math.ceil((Date.UTC(y, 0, 1) - AIRAC0) / CYC) * CYC;
    return { id: String(y).slice(2) + pad(Math.round((start - first) / CYC) + 1), start: start, end: start + CYC };
  }

  /* ------------------------------------------------------------------ timesheets */
  var WD = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  function ymd(day0) { return new Date(day0).toISOString().slice(0, 10); }
  // o: { hol: Set of 'YYYY-MM-DD', dst: 'EU' | 'US' | 'none' }
  function isHol(day0, o) { return !!(o.hol && o.hol.has(ymd(day0))); }
  function isWork(day0, o) { var w = new Date(day0).getUTCDay(); return w >= 1 && w <= 5 && !isHol(day0, o); }
  function dayIs(code, day0, o) {
    var w = new Date(day0).getUTCDay();
    switch (code) {
      case '': case 'ANY': return true;
      case 'WORK_DAY': return isWork(day0, o);
      case 'BEF_WORK_DAY': return isWork(day0 + DAYMS, o);
      case 'AFT_WORK_DAY': return isWork(day0 - DAYMS, o);
      case 'HOL': return isHol(day0, o);
      case 'BEF_HOL': return isHol(day0 + DAYMS, o);
      case 'AFT_HOL': return isHol(day0 - DAYMS, o);
      case 'BUSY_FRI': return w === 5;
      case 'MON_FRI': return w >= 1 && w <= 5;
      case 'SUN_THU': return w <= 4;
      case 'SAT_WED': return w === 6 || w <= 3;
      case 'SAT_THU': return w !== 5;
      default: return WD.indexOf(code) >= 0 ? WD[w] === code : false;
    }
  }
  function dayOk(day, til, day0, o) {
    if (!til || til === day || til === 'ANY' && (!day || day === 'ANY')) return dayIs(day, day0, o);
    var a = WD.indexOf(day), b = WD.indexOf(til), w = new Date(day0).getUTCDay();
    if (a >= 0 && b >= 0) { var mon = function (x) { return (x + 6) % 7; }; return mon(a) <= mon(b) ? mon(w) >= mon(a) && mon(w) <= mon(b) : mon(w) >= mon(a) || mon(w) <= mon(b); }
    if (til === 'ANY') return dayIs(day, day0, o);
    return dayIs(day, day0, o) || dayIs(til, day0, o); // e.g. HOL .. AFT_HOL: the holiday and the day after
  }
  function md(code, y, o) {
    if (code === 'SDLST' || code === 'EDLST') { var sp = dstSpan(y, o.dst === 'none' ? 'EU' : o.dst); var d = new Date(sp[code === 'SDLST' ? 0 : 1]); return (d.getUTCMonth() + 1) * 100 + d.getUTCDate(); }
    var m = /^(\d{1,2})-(\d{1,2})$/.exec(code || '');
    return m ? +m[2] * 100 + +m[1] : null;
  }
  function dateOk(sd, ed, day0, o) {
    if (!sd && !ed) return true;
    var d = new Date(day0), y = d.getUTCFullYear(), v = (d.getUTCMonth() + 1) * 100 + d.getUTCDate(), a = md(sd, y, o), b = md(ed, y, o);
    if (a === null) a = 101; if (b === null) b = 1231;
    return a <= b ? v >= a && v <= b : v >= a || v <= b;
  }
  function refOffset(ref) { // minutes east of UTC
    var m = /^UTC\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?$/i.exec(ref || '');
    return m ? (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + +(m[3] || 0)) : 0;
  }
  function relMin(v) { var n = parseFloat(s(v)); if (isNaN(n)) return 0; var u = String((v && v.u) || 'MIN').toUpperCase(); return u === 'HR' || u === 'H' ? n * 60 : u === 'S' || u === 'SEC' ? n / 60 : n; }
  function clock(t) { var m = /^(\d{1,2}):?(\d{2})/.exec(s(t)); return m ? (+m[1] * 60 + +m[2]) * MIN : null; }
  // one edge of a window on local day day0 (ms of local time, from the time and / or the sun event)
  function edge(t, which, day0, off, pos) {
    var tm = clock(which === 's' ? t.startTime : t.endTime), ev = s(which === 's' ? t.startEvent : t.endEvent), ex = null;
    if (ev === 'SR' || ev === 'SS') {
      var sn = sun(pos[0], pos[1], day0), e = sn[ev === 'SR' ? 'sr' : 'ss'];
      // the sun does not rise or set that day: all day (midnight sun) or no daylight (polar night)
      ex = e !== null ? e + off * MIN - day0 : sn.polar === 'day' ? (ev === 'SR' ? 0 : DAYMS) : DAYMS / 2;
      ex += relMin(which === 's' ? t.startTimeRelativeEvent : t.endTimeRelativeEvent) * MIN;
    }
    if (tm === null) return ex;
    if (ex === null) return tm;
    var how = s(which === 's' ? t.startEventInterpretation : t.endEventInterpretation);
    return how === 'LATEST' ? Math.max(tm, ex) : Math.min(tm, ex);
  }
  // does timesheet t cover the moment T (UTC ms)? pos: [lon, lat] for sunrise and sunset
  function tsCovers(t, T, o, pos) {
    if (!t || t.nil !== undefined) return false;
    var off = refOffset(s(t.timeReference));
    if (s(t.daylightSavingAdjust) === 'YES' && o.dst !== 'none' && inDst(T, o.dst)) off += 60; // summer: one hour earlier in UTC
    var Lt = T + off * MIN, today = Math.floor(Lt / DAYMS) * DAYMS;
    for (var k = 0; k >= -1; k--) { // a window of today, or one of yesterday that runs past midnight
      var day0 = today + k * DAYMS;
      if (!dayOk(s(t.day), s(t.dayTil), day0, o) || !dateOk(s(t.startDate), s(t.endDate), day0, o)) continue;
      var a = edge(t, 's', day0, off, pos), b = edge(t, 'e', day0, off, pos);
      if (a === null) a = 0;
      if (b === null) b = DAYMS;
      if (b <= a) b += DAYMS; // 00:00-00:00 or 22:00-06:00
      if (Lt >= day0 + a && Lt < day0 + b) return true;
    }
    return false;
  }
  // a list of timesheets: covered by one of them and not by an excluded one
  function covers(list, T, o, pos) {
    var inc = false;
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      if (!t || t.nil !== undefined || (t._t && t._t !== 'Timesheet')) continue;
      if (s(t.excluded) === 'YES') { if (tsCovers(t, T, o, pos)) return false; } else if (!inc && tsCovers(t, T, o, pos)) inc = true;
    }
    return inc;
  }

  /* -------------------------------------------------------- features at a time */
  // what a feature's schedules say: 'on' | 'maybe' | 'off'
  var ON = /^(ACTIVE|NORMAL|OPERATIONAL|OPEN|AVAILABLE|IN_USE|ON)$/, MAYBE = /^(AVBL_FOR_ACTIVATION|CONDITIONAL|INTERMITTENT|LIMITED|ON_REQUEST|RESTRICTED|PARTIAL|OTHER:.*)$/;
  function stClass(st) { st = String(st || '').toUpperCase(); return !st || ON.test(st) ? 'on' : MAYBE.test(st) ? 'maybe' : 'off'; }
  var SCHED = { activation: 'activation', availability: 'availability', lightingAvailability: 'lighting' };
  function entriesOf(p) {
    var out = [];
    Object.keys(SCHED).forEach(function (k) {
      arr(p[k]).forEach(function (a) {
        if (!a || a.nil !== undefined) return;
        var st = s(a.status) || s(a.operationalStatus), ti = a.timeInterval, nil = null, list = [];
        arr(ti).forEach(function (t) { if (t && t.nil !== undefined) nil = String(t.nil || ''); else if (t) list.push(t); });
        out.push({ prop: SCHED[k], st: st, cls: stClass(st), list: list, nil: nil, activity: s(a.activity) });
      });
    });
    if (!out.length && p._hours) out.push({ prop: 'hours', st: 'ACTIVE', cls: 'on', hours: s(p._hours).toUpperCase(), list: [] });
    return out;
  }
  var RANK = { off: 3, on: 2, maybe: 1 };
  // the state of a list of schedule entries at T: { st: on | maybe | off | unknown, why }
  function evalEntries(E, T, o, pos) {
    var hit = null, why = '';
    E.forEach(function (e) {
      var c = null, w = '';
      if (e.prop === 'hours') {
        var h = e.hours, sn = sun(pos[0], pos[1], Math.floor(T / DAYMS) * DAYMS), day = sn.sr !== null ? T >= sn.sr && T < sn.ss : sn.polar === 'day';
        if (/^H24/.test(h)) { c = 'on'; w = 'H24'; } else if (/^HJ/.test(h)) { c = day ? 'on' : 'off'; w = 'HJ (sunrise to sunset)'; } else if (/^HN/.test(h)) { c = day ? 'off' : 'on'; w = 'HN (sunset to sunrise)'; } else { c = 'maybe'; w = h + ' (no fixed hours)'; }
      } else if (e.nil && /NOTAM/i.test(e.nil)) { c = 'maybe'; w = (e.st || 'active') + ' by NOTAM'; } else if (e.nil && /H24/i.test(e.nil)) { c = e.cls; w = (e.st || '') + ' H24'; } else if (!e.list.length) { c = e.cls; w = (e.st || 'given') + ' (no times)'; } else if (covers(e.list, T, o, pos)) { c = e.cls; w = (e.st || '') + ' ' + e.list.map(function (t) { return M ? M.fTimesheet(t) : ''; }).filter(Boolean).join(', '); }
      if (c && (!hit || RANK[c] > RANK[hit])) { hit = c; why = (e.activity ? e.activity + ' ' : '') + w.trim(); }
    });
    if (hit) return { st: hit, why: why };
    // nothing covers T: outside the hours given
    var onAt = E.filter(function (e) { return e.cls !== 'off'; });
    return onAt.length ? { st: 'off', why: 'outside the hours (' + onAt.map(function (e) { return e.st; }).filter(Boolean).join(', ') + ')' } : { st: 'unknown', why: '' };
  }
  // a feature at T: validity (time slices, lifetime), temporary changes, schedules
  function stateAt(f, T, o) {
    if (f.onlyTemp === undefined) f.onlyTemp = f.r.ts.every(function (x) { return x.i === 'TEMPDELTA'; });
    if (f.onlyTemp) { // a temporary change (e.g. Digital NOTAM) without the baseline of the feature: known only while in force
      var on = f.r.ts.filter(function (x) { var b0 = AX.tms(x.b), e0 = AX.tms(x.e); return (b0 === null || b0 <= T) && (e0 === null || e0 > T); });
      if (!on.length) return { st: 'steady', why: 'outside the temporary change (no baseline loaded)' };
      var p = {}; on.forEach(function (x) { Object.keys(x.p).forEach(function (k) { p[k] = x.p[k]; }); });
      var E0 = entriesOf(p), y = E0.length ? evalEntries(E0, T, o, f.pos) : { st: 'steady', why: 'changed' };
      return { st: y.st, why: y.why + ' · temporary change in force (' + on.length + ')', temp: true };
    }
    var v = AX.resolve(f.r, T), sl = f.r.ts[v.idx] || {}, b = AX.tms(v.b), e = AX.tms(v.e), lb = AX.tms(sl.lb), le = AX.tms(sl.le);
    if (v.future || (b !== null && b > T) || (lb !== null && lb > T)) return { st: 'none', why: 'not valid yet (from ' + (v.b ? String(v.b).slice(0, 16) : '?') + ')' };
    if (v.ended || (e !== null && e <= T) || (le !== null && le <= T)) return { st: 'none', why: 'no longer valid' };
    var temp = v.temp && v.temp.length ? ' · temporary change in force (' + v.temp.length + ')' : '';
    var E = entriesOf(v.p), x = E.length ? evalEntries(E, T, o, f.pos) : { st: 'steady', why: 'no schedule' };
    return { st: x.st, why: x.why + temp, temp: !!temp };
  }

  /* ------------------------------------------------------------------- state */
  var V = { on: false, api: null, host: null, layer: null, items: [], sig: '', T: null, range: 'day', step: 15 * MIN, play: null, speed: 1,
    o: { hol: new Set(), dst: 'EU' }, show: { as: true, rt: true, pt: true, other: true }, hideBase: false, hidden: [], follow: false, st: new Map(), flight: null, filter: '' };
  var KIND = { Airspace: 'as', RouteSegment: 'rt', AirportHeliport: 'pt', Navaid: 'pt', VOR: 'pt', DME: 'pt', NDB: 'pt', TACAN: 'pt', MarkerBeacon: 'pt', Localizer: 'pt', Glidepath: 'pt', DesignatedPoint: 'pt', VerticalStructure: 'pt', RunwayDirection: 'pt', Runway: 'pt', AircraftStand: 'pt', Taxiway: 'pt', Apron: 'pt', WorkArea: 'as' };
  var COL = { as: { on: '#d32f2f', maybe: '#f9a825', off: '#90a4ae', none: '#b0bec5', unknown: '#7e57c2', steady: '#5c6bc0' }, gen: { on: '#2e7d32', maybe: '#f9a825', off: '#c62828', none: '#b0bec5', unknown: '#7e57c2', steady: '#5c6bc0' } };
  var LBL = { as: { on: 'active', maybe: 'available for activation / by NOTAM', off: 'inactive', none: 'not valid at this time', unknown: 'unknown', steady: 'no schedule' }, gen: { on: 'available', maybe: 'limited / conditional', off: 'closed / not available', none: 'not valid at this time', unknown: 'unknown', steady: 'no schedule' } };
  function centre(g) {
    if (!g) return null;
    if (g.t === 'P') return g.c;
    var pts = g.t === 'L' ? g.c : g.t === 'A' ? g.c[0] : g.t === 'M' && g.parts[0] ? (g.parts[0].t === 'P' ? [g.parts[0].c] : g.parts[0].t === 'L' ? g.parts[0].c : g.parts[0].c[0]) : [];
    pts = (pts || []).filter(function (p) { return p && typeof p[0] === 'number'; });
    if (!pts.length) return null;
    var x = 0, y = 0; pts.forEach(function (p) { x += p[0]; y += p[1]; });
    return [x / pts.length, y / pts.length];
  }
  // the features of the data sets on the map that have a schedule, a temporary change or a validity period
  function collect(list) {
    var out = [];
    list.forEach(function (ds) {
      var fallback = null;
      ds.recs.forEach(function (r) {
        if (!r.ts || !r.ts.length || r.syn) return;
        var timed = r.ts.length > 1 || r.ts.some(function (x) { return x.i === 'TEMPDELTA' || x.le || x.e; });
        var p = r.cur && r.cur.p;
        if (!timed && !(p && (p.activation || p.availability || p.lightingAvailability || p._hours))) return;
        var g = null, pt = null;
        try { g = M.geometry(ds, r); } catch (e) { g = null; }
        if (!g || (g.t !== 'A' && g.t !== 'L' && g.t !== 'P' && g.t !== 'M')) { try { pt = M.pointOf(ds, r); } catch (e) { pt = null; } g = pt ? { t: 'P', c: pt } : null; }
        var c = centre(g);
        if (!c) { if (!fallback) { var ad = (ds.byType.AirportHeliport || [])[0]; fallback = ad ? M.pointOf(ds, ad) : null; } c = fallback || [0, 51.5]; }
        out.push({ ds: ds, r: r, k: r.k, kind: KIND[r.k] || 'other', g: g, pos: c, name: M.label(ds, r), sch: r.k === 'Airspace' || r.k === 'WorkArea' ? 'as' : 'gen' });
      });
    });
    return out;
  }
  function sigOf(list) { return list.map(function (d) { return d.id + ':' + d.viewDate; }).join(','); }
  function evaluate() {
    V.st = new Map();
    var n = { on: 0, maybe: 0, off: 0, none: 0, unknown: 0, steady: 0, temp: 0 };
    V.items.forEach(function (f) { var x = stateAt(f, V.T, V.o); V.st.set(f.r, x); n[x.st]++; if (x.temp) n.temp++; });
    return n;
  }

  /* -------------------------------------------------------------------- map */
  function styleOf(f, x) {
    var c = COL[f.sch][x.st], hide = !V.show[f.kind === 'other' ? 'other' : f.kind] || (x.st === 'steady' && !x.temp);
    if (f.g && f.g.t === 'P') return { radius: hide ? 0 : 6, color: x.temp ? '#000' : c, weight: x.temp ? 2.5 : 1.5, fillColor: c, fillOpacity: hide ? 0 : 0.85, opacity: hide ? 0 : 1 };
    return { color: x.temp ? '#000' : c, weight: hide ? 0 : x.st === 'on' ? 2.5 : 1.5, opacity: hide ? 0 : x.st === 'none' ? 0.35 : 0.95, fillColor: c, fillOpacity: hide || f.g.t === 'L' ? 0 : x.st === 'on' ? 0.28 : x.st === 'maybe' ? 0.14 : 0.03, dashArray: x.st === 'maybe' ? '6 5' : x.st === 'off' || x.st === 'none' ? '2 5' : null };
  }
  function ll(c) { return [c[1], c[0]]; }
  function shapes(g) {
    if (!g) return [];
    if (g.t === 'M') return g.parts.reduce(function (o, p) { return o.concat(shapes(p)); }, []);
    return [g];
  }
  function buildLayer() {
    var map = V.api.map();
    if (!map) return;
    if (!map.getPane('fourdPane')) map.createPane('fourdPane').style.zIndex = 395;
    if (V.layer) map.removeLayer(V.layer);
    var rend = L.canvas({ padding: 0.3, pane: 'fourdPane' });
    V.layer = L.layerGroup();
    V.items.forEach(function (f) {
      f.lay = [];
      shapes(f.g).forEach(function (g) {
        var o = { renderer: rend, pane: 'fourdPane', interactive: true }, l = null;
        if (g.t === 'P') l = L.circleMarker(ll(g.c), o);
        else if (g.t === 'L') l = L.polyline(g.c.filter(function (p) { return typeof p[0] === 'number'; }).map(ll), o);
        else if (g.t === 'A') l = L.polygon(g.c.map(function (r) { return r.filter(function (p) { return typeof p[0] === 'number'; }).map(ll); }), o);
        if (!l) return;
        l.bindTooltip(function () { var x = V.st.get(f.r) || {}; return '<b>' + esc(f.name) + '</b><br>' + esc(LBL[f.sch][x.st] || '') + (x.why ? '<br><small>' + esc(x.why) + '</small>' : ''); }, { sticky: true });
        l.on('click', function (e) { if (V.api.popup) V.api.popup(f.ds, f.r, e.latlng); });
        f.lay.push(l); V.layer.addLayer(l);
      });
    });
    V.layer.addTo(map);
  }
  function paint() {
    V.items.forEach(function (f) { var x = V.st.get(f.r); if (x && f.lay) f.lay.forEach(function (l) { l.setStyle(styleOf(f, x)); }); });
    if (V.flight) drawFlight();
  }

  /* -------------------------------------------------------- procedure in time */
  function nm(a, b) { var R = 3440.065, dl = (b[1] - a[1]) * D2R, dn = (b[0] - a[0]) * D2R, h = Math.sin(dl / 2) * Math.sin(dl / 2) + Math.cos(a[1] * D2R) * Math.cos(b[1] * D2R) * Math.sin(dn / 2) * Math.sin(dn / 2); return 2 * R * Math.asin(Math.min(1, Math.sqrt(h))); }
  function procList() {
    if (typeof STUDY === 'undefined') return [];
    var by = new Map();
    try { STUDY.segments(V.api.shown()).forEach(function (sg) { var k = sg.pr; if (!by.has(k)) by.set(k, { label: (sg.adCode ? sg.adCode + ' ' : '') + sg.proc, segs: [] }); by.get(k).segs.push(sg); }); } catch (e) { return []; }
    return Array.from(by.values()).sort(function (a, b) { return a.label.localeCompare(b.label); });
  }
  // the path of a procedure with the time over each point at ground speed gs (kt) from t0
  function flightPlan(p, gs, t0) {
    var pts = [], legs = [], d = 0;
    p.segs.forEach(function (sg) {
      var c = (sg.coords || []).filter(function (x) { return x && typeof x[0] === 'number'; });
      c.forEach(function (x) { var last = pts[pts.length - 1]; if (last && Math.abs(last.c[0] - x[0]) < 1e-9 && Math.abs(last.c[1] - x[1]) < 1e-9) return; if (last) d += nm(last.c, x); pts.push({ c: x, d: d, t: t0 + d / gs * 3600000, alt: sg.alt }); });
      if (c.length && pts.length) legs.push({ label: sg.label.replace(/^.*?· /, '') || sg.legKind, kind: sg.legKind, d: d, t: t0 + d / gs * 3600000, alt: sg.altTxt || '' });
    });
    return { pts: pts, legs: legs, dist: d, t0: t0, t1: t0 + d / gs * 3600000, gs: gs, label: p.label };
  }
  function posAt(fp, T) {
    var P = fp.pts;
    if (!P.length || T < fp.t0 || T > fp.t1) return null;
    for (var i = 1; i < P.length; i++) if (P[i].t >= T) { var a = P[i - 1], b = P[i], k = b.t > a.t ? (T - a.t) / (b.t - a.t) : 0; return { c: [a.c[0] + (b.c[0] - a.c[0]) * k, a.c[1] + (b.c[1] - a.c[1]) * k], d: a.d + (b.d - a.d) * k }; }
    return { c: P[P.length - 1].c, d: fp.dist };
  }
  function drawFlight() {
    var map = V.api.map(), fp = V.flight;
    if (!map || !fp) return;
    if (!fp.line) { fp.line = L.polyline(fp.pts.map(function (p) { return ll(p.c); }), { color: '#6a1b9a', weight: 3, opacity: 0.8, pane: 'fourdPane' }).addTo(V.layer); fp.mk = L.circleMarker([0, 0], { radius: 7, color: '#fff', weight: 2, fillColor: '#6a1b9a', fillOpacity: 1, pane: 'fourdPane' }); }
    var p = posAt(fp, V.T);
    if (p) { fp.mk.setLatLng(ll(p.c)); if (!V.layer.hasLayer(fp.mk)) V.layer.addLayer(fp.mk); fp.mk.bindTooltip(esc(fp.label) + ' · ' + p.d.toFixed(1) + ' NM · ' + hm(V.T) + ' UTC'); } else if (V.layer.hasLayer(fp.mk)) V.layer.removeLayer(fp.mk);
    var el = V.host && V.host.querySelector('.fd-eto');
    if (el) el.innerHTML = '<table class="mini-table"><thead><tr><th>Leg end</th><th class="num">NM</th><th>ETO (UTC)</th><th>Altitude</th></tr></thead><tbody>' + fp.legs.map(function (l) { return '<tr' + (l.t <= V.T ? ' class="muted"' : '') + '><td>' + esc(l.label) + '</td><td class="num">' + l.d.toFixed(1) + '</td><td class="mono">' + new Date(l.t).toISOString().slice(11, 19) + '</td><td>' + esc(l.alt) + '</td></tr>'; }).join('') + '</tbody></table>';
  }

  /* ------------------------------------------------------------------ time bar */
  function rangeOf() {
    var T = V.T;
    if (V.range === 'airac') { var a = airac(T); return [a.start, a.end, 'AIRAC ' + a.id]; }
    if (V.range === 'week') { var d0 = Math.floor(T / DAYMS) * DAYMS, w = (new Date(d0).getUTCDay() + 6) % 7; return [d0 - w * DAYMS, d0 + (7 - w) * DAYMS, 'week']; }
    var z = Math.floor(T / DAYMS) * DAYMS; return [z, z + DAYMS, 'day'];
  }
  function nextChange(f, from) {
    var x0 = V.st.get(f.r), step = 15 * MIN;
    if (!x0) return null;
    for (var t = from + step; t <= from + 2 * DAYMS; t += step) { var x = stateAt(f, t, V.o); if (x.st !== x0.st) return { t: t, st: x.st }; }
    return null;
  }
  var STEPS = [[10000, '10 s'], [MIN, '1 min'], [15 * MIN, '15 min'], [3600000, '1 h'], [DAYMS, '1 day'], ['airac', 'AIRAC cycle']];
  function barHtml() {
    var h = '<div class="fd-head"><b>🕓 4D</b><span class="muted">' + NOTICE + '</span><span class="sp"></span><button class="btn small ghost" data-fd="min" title="Fold or unfold">▾</button><button class="btn small ghost" data-fd="close" title="Switch 4D off (the map is as before)">✕</button></div>' +
      '<div class="fd-body"><div class="fd-row"><button class="btn small" data-fd="back" title="One step back">⏮</button><button class="btn small primary" data-fd="play" title="Play / pause">▶</button><button class="btn small" data-fd="fwd" title="One step forward">⏭</button>' +
      '<input class="inp mono" type="datetime-local" step="60" data-fd="t" aria-label="Date and time (UTC)"><span class="muted">UTC</span><button class="btn small" data-fd="now">Now</button>' +
      '<label>Step <select class="inp" data-fd="step">' + STEPS.map(function (x) { return '<option value="' + x[0] + '"' + (String(V.step) === String(x[0]) ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('') + '</select></label>' +
      '<label>Range <select class="inp" data-fd="range">' + [['day', 'day'], ['week', 'week'], ['airac', 'AIRAC cycle']].map(function (x) { return '<option value="' + x[0] + '"' + (V.range === x[0] ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('') + '</select></label></div>' +
      '<div class="fd-row"><span class="fd-r0 mono muted"></span><input type="range" class="fd-slider" min="0" max="1000" data-fd="slider" aria-label="Time in the range"><span class="fd-r1 mono muted"></span></div>' +
      '<div class="fd-row fd-kpis"></div>' +
      '<details class="fd-more"><summary>Options, procedure in time, exports</summary><div class="fd-row">' +
      '<label class="chk"><input type="checkbox" data-fdshow="as"' + (V.show.as ? ' checked' : '') + '> Airspace</label><label class="chk"><input type="checkbox" data-fdshow="rt"' + (V.show.rt ? ' checked' : '') + '> Routes</label><label class="chk"><input type="checkbox" data-fdshow="pt"' + (V.show.pt ? ' checked' : '') + '> Aerodromes, navaids, obstacles</label><label class="chk"><input type="checkbox" data-fdshow="other"' + (V.show.other ? ' checked' : '') + '> Other</label>' +
      '<label class="chk"><input type="checkbox" data-fd="hidebase"' + (V.hideBase ? ' checked' : '') + '> Hide the normal airspace layer</label></div><div class="fd-row">' +
      '<label>Daylight saving <select class="inp" data-fd="dst">' + [['EU', 'EU rule'], ['US', 'US rule'], ['none', 'none']].map(function (x) { return '<option value="' + x[0] + '"' + (V.o.dst === x[0] ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('') + '</select></label>' +
      '<label class="chk"><input type="checkbox" data-fd="hol"> This day is a holiday</label><input class="inp" data-fd="hols" placeholder="Holidays: YYYY-MM-DD, …" aria-label="Holidays" value="' + esc(Array.from(V.o.hol).join(', ')) + '" style="min-width:220px">' +
      '<button class="btn small" data-fd="apply" title="Show the data valid on this date in every tab (Data valid on)">Use this date in all tabs</button><label class="chk"><input type="checkbox" data-fd="follow"' + (V.follow ? ' checked' : '') + '> follow when the date changes</label></div>' +
      '<div class="fd-row"><b>Procedure in time</b><select class="inp" data-fd="proc" aria-label="Procedure" style="max-width:280px"><option value="">Choose a procedure…</option></select><label>GS <input class="inp" type="number" min="40" max="600" value="180" data-fd="gs" style="width:70px"> kt</label><button class="btn small" data-fd="fly" title="Fly it from the time on the bar">✈ Fly from this time</button><button class="btn small ghost" data-fd="unfly">Clear</button></div><div class="fd-eto"></div>' +
      '<div class="fd-row"><span class="muted">Export (the range on the bar):</span><span class="btn-group">' + ['kml:KML (time)', 'czml:CZML', 'geojson:GeoJSON', 'pdf:PDF report', 'xlsx:Excel'].map(function (x) { var p = x.split(':'); return '<button class="btn small" data-fdx="' + p[0] + '">' + p[1] + '</button>'; }).join('') + '</span></div></details>' +
      '<details class="fd-listbox"><summary>Features at this time</summary><div class="fd-row"><select class="inp" data-fd="filter" aria-label="Show"><option value="">All with a schedule or a change</option><option value="on">active / available</option><option value="maybe">possible / limited</option><option value="off">inactive / closed</option><option value="none">not valid</option><option value="temp">temporary change</option></select></div><div class="fd-list"></div></details></div>';
    return h;
  }
  function setT(t, quiet) {
    V.T = Math.round(t / 1000) * 1000;
    update(quiet);
    if (V.follow && !quiet) applyDate();
  }
  function update() {
    if (!V.host) return;
    var list = V.api.shown(), sg = sigOf(list);
    if (sg !== V.sig) { V.sig = sg; V.items = collect(list); buildLayer(); fillProcs(); }
    var n = evaluate();
    paint();
    var r = rangeOf(), q = function (k) { return V.host.querySelector(k); };
    q('[data-fd="t"]').value = new Date(V.T).toISOString().slice(0, 16);
    q('.fd-r0').textContent = fmt(r[0]).slice(0, 16); q('.fd-r1').textContent = fmt(r[1]).slice(0, 16) + ' · ' + r[2];
    q('[data-fd="slider"]').value = String(Math.round((V.T - r[0]) / (r[1] - r[0]) * 1000));
    var hol = q('[data-fd="hol"]'); if (hol) hol.checked = V.o.hol.has(ymd(Math.floor(V.T / DAYMS) * DAYMS));
    var a = airac(V.T), sn = list[0] && V.items[0] ? sun(V.items[0].pos[0], V.items[0].pos[1], Math.floor(V.T / DAYMS) * DAYMS) : null;
    q('.fd-kpis').innerHTML = [['on', 'active / available'], ['maybe', 'possible / limited'], ['off', 'inactive / closed'], ['none', 'not valid'], ['temp', 'temporary changes']].map(function (k) { return '<span class="fd-kpi" style="border-color:' + (COL.as[k[0]] || '#000') + '"><b>' + n[k[0]] + '</b> ' + k[1] + '</span>'; }).join('') +
      '<span class="muted">' + new Date(V.T).toUTCString().slice(0, 3) + ' · AIRAC ' + a.id + (inDst(V.T, V.o.dst) ? ' · summer time' : '') + (sn && sn.sr ? ' · SR ' + hm(sn.sr) + ' SS ' + hm(sn.ss) : '') + ' · ' + V.items.length + ' timed features</span>';
    if (V.host.querySelector('.fd-listbox').open) listHtml();
  }
  function listHtml() {
    var el = V.host.querySelector('.fd-list'), rows = V.items.filter(function (f) { var x = V.st.get(f.r); return x && (V.filter === 'temp' ? x.temp : V.filter ? x.st === V.filter : x.st !== 'steady' || x.temp); });
    var ORD = { off: 0, maybe: 1, none: 2, unknown: 3, on: 4, steady: 5 };
    rows.sort(function (a, b) { var x = V.st.get(a.r), y = V.st.get(b.r); return (y.temp ? 1 : 0) - (x.temp ? 1 : 0) || ORD[x.st] - ORD[y.st] || a.name.localeCompare(b.name); });
    var shown = rows.slice(0, 300), playing = !!V.play;
    el.innerHTML = '<div class="tbl-wrap"><table class="mini-table"><thead><tr><th>State</th><th>Feature</th><th>Why</th><th>Next change</th></tr></thead><tbody>' + shown.map(function (f, i) {
      var x = V.st.get(f.r), nc = playing ? null : nextChange(f, V.T);
      return '<tr class="click" data-fdi="' + V.items.indexOf(f) + '"><td><span class="chip" style="color:' + COL[f.sch][x.st] + '">' + esc(LBL[f.sch][x.st]) + '</span></td><td>' + esc(f.k) + ' <b>' + esc(f.name) + '</b></td><td class="muted">' + esc(x.why) + '</td><td class="mono">' + (nc ? esc(fmt(nc.t).slice(5, 16) + ' → ' + LBL[f.sch][nc.st]) : playing ? '' : '<span class="muted">none in 48 h</span>') + '</td></tr>';
    }).join('') + '</tbody></table></div>' + (rows.length > shown.length ? '<div class="muted">' + (rows.length - shown.length) + ' more — export for all</div>' : '');
  }
  function fillProcs() {
    var sel = V.host && V.host.querySelector('[data-fd="proc"]');
    if (!sel) return;
    V.procs = procList();
    sel.innerHTML = '<option value="">Choose a procedure… (' + V.procs.length + ')</option>' + V.procs.map(function (p, i) { return '<option value="' + i + '">' + esc(p.label) + '</option>'; }).join('');
  }
  function stepBy(dir) {
    if (V.step === 'airac') { var a = airac(V.T); setT(dir > 0 ? a.end : (V.T > a.start ? a.start : a.start - CYC)); return; }
    setT(V.T + dir * V.step);
  }
  function playToggle() {
    var b = V.host.querySelector('[data-fd="play"]');
    if (V.play) { clearInterval(V.play); V.play = null; b.textContent = '▶'; update(); return; }
    b.textContent = '⏸';
    V.play = setInterval(function () { if (!V.host || !V.host.isConnected) { clearInterval(V.play); V.play = null; return; } var r = rangeOf(); stepBy(1); if (V.T >= r[1] && V.range !== 'airac' && V.step !== 'airac') setT(r[0]); }, V.step === 'airac' ? 1500 : 400);
  }
  function applyDate() {
    var d = document.getElementById('asof-date'), m = document.getElementById('asof-mode');
    if (!d || !m) return;
    var v = new Date(V.T).toISOString().slice(0, 10);
    if (m.value === 'date' && d.value === v) return;
    d.value = v; d.classList.remove('hidden');
    if (m.value !== 'date') { m.value = 'date'; m.dispatchEvent(new Event('change')); } else d.dispatchEvent(new Event('change'));
  }
  function baseAirspace(hide) {
    var boxes = document.querySelectorAll('#map-panel [data-layer^="as_"]');
    if (hide) { V.hidden = []; boxes.forEach(function (b) { if (b.checked) { V.hidden.push(b.getAttribute('data-layer')); b.checked = false; b.dispatchEvent(new Event('change')); } }); } else { boxes.forEach(function (b) { if (V.hidden.indexOf(b.getAttribute('data-layer')) >= 0 && !b.checked) { b.checked = true; b.dispatchEvent(new Event('change')); } }); V.hidden = []; }
  }
  function bind() {
    var h = V.host;
    h.addEventListener('click', function (e) {
      var b = e.target.closest('[data-fd],[data-fdx],[data-fdi]');
      if (!b) return;
      if (b.hasAttribute('data-fdi')) { var f = V.items[+b.getAttribute('data-fdi')], c = f && f.pos, map = V.api.map(); if (f && map && f.g) { if (f.g.t === 'P') map.setView(ll(c), Math.max(map.getZoom(), 10)); else { var bb = L.latLngBounds([]); f.lay.forEach(function (l) { bb.extend(l.getBounds ? l.getBounds() : l.getLatLng()); }); if (bb.isValid()) map.fitBounds(bb.pad(0.2)); } } return; }
      if (b.hasAttribute('data-fdx')) { exportAs(b.getAttribute('data-fdx')); return; }
      var k = b.getAttribute('data-fd');
      if (k === 'close') close();
      else if (k === 'min') { h.classList.toggle('fd-min'); b.textContent = h.classList.contains('fd-min') ? '▴' : '▾'; }
      else if (k === 'play') playToggle();
      else if (k === 'back') stepBy(-1);
      else if (k === 'fwd') stepBy(1);
      else if (k === 'now') setT(Date.now());
      else if (k === 'apply') applyDate();
      else if (k === 'fly') { var sel = h.querySelector('[data-fd="proc"]'), p = V.procs && V.procs[+sel.value]; if (!sel.value || !p) { V.api.toast('Choose a procedure.'); return; } unfly(); V.flight = flightPlan(p, Math.max(40, +h.querySelector('[data-fd="gs"]').value || 180), V.T); if (V.step > MIN || V.step === 'airac') { V.step = 10000; h.querySelector('[data-fd="step"]').value = '10000'; } drawFlight(); }
      else if (k === 'unfly') unfly();
    });
    h.addEventListener('change', function (e) {
      var t = e.target, k = t.getAttribute('data-fd'), sh = t.getAttribute('data-fdshow');
      if (sh) { V.show[sh] = t.checked; paint(); return; }
      if (k === 't' && t.value) setT(Date.parse(t.value + ':00Z'));
      else if (k === 'step') { V.step = t.value === 'airac' ? 'airac' : +t.value; if (V.play) { playToggle(); playToggle(); } }
      else if (k === 'range') { V.range = t.value; update(); }
      else if (k === 'dst') { V.o.dst = t.value; update(); }
      else if (k === 'hol') { var d = ymd(Math.floor(V.T / DAYMS) * DAYMS); if (t.checked) V.o.hol.add(d); else V.o.hol.delete(d); h.querySelector('[data-fd="hols"]').value = Array.from(V.o.hol).sort().join(', '); update(); }
      else if (k === 'hols') { V.o.hol = new Set((t.value.match(/\d{4}-\d\d-\d\d/g) || [])); update(); }
      else if (k === 'hidebase') { V.hideBase = t.checked; baseAirspace(t.checked); }
      else if (k === 'follow') { V.follow = t.checked; if (t.checked) applyDate(); }
      else if (k === 'filter') { V.filter = t.value; listHtml(); }
    });
    h.addEventListener('input', function (e) { if (e.target.getAttribute('data-fd') === 'slider') { var r = rangeOf(); setT(r[0] + (r[1] - r[0]) * (+e.target.value / 1000), true); } });
    h.querySelector('.fd-listbox').addEventListener('toggle', function (e) { if (e.target.open) listHtml(); });
  }
  function unfly() { if (V.flight && V.layer) { if (V.flight.line) V.layer.removeLayer(V.flight.line); if (V.flight.mk) V.layer.removeLayer(V.flight.mk); } V.flight = null; var el = V.host && V.host.querySelector('.fd-eto'); if (el) el.innerHTML = ''; }

  /* ------------------------------------------------------------------- exports */
  // the intervals of each state of a feature over [a, b) at a resolution
  function intervals(f, a, b, res) {
    var out = [], cur = null;
    for (var t = a; t < b; t += res) { var x = stateAt(f, t, V.o).st; if (!cur || cur.st !== x) { if (cur) cur.end = t; cur = { st: x, start: t }; out.push(cur); } }
    if (cur) cur.end = b;
    return out;
  }
  function timedItems() { return V.items.filter(function (f) { var x = V.st.get(f.r); return x && (x.st !== 'steady' || x.temp); }); }
  function xe(t) { return String(t === undefined || t === null ? '' : t).replace(/[<>&"]/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]; }); }
  function kmlGeom(g) {
    function cs(l) { return l.filter(function (p) { return typeof p[0] === 'number'; }).map(function (p) { return p[0].toFixed(6) + ',' + p[1].toFixed(6) + ',0'; }).join(' '); }
    return shapes(g).map(function (x) { return x.t === 'P' ? '<Point><coordinates>' + cs([x.c]) + '</coordinates></Point>' : x.t === 'L' ? '<LineString><tessellate>1</tessellate><coordinates>' + cs(x.c) + '</coordinates></LineString>' : '<Polygon><outerBoundaryIs><LinearRing><coordinates>' + cs(x.c[0]) + '</coordinates></LinearRing></outerBoundaryIs></Polygon>'; }).join('');
  }
  function hexAbgr(c, a) { return a + c.slice(5, 7) + c.slice(3, 5) + c.slice(1, 3); }
  function rgba(c, a) { return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16), a]; }
  function exportAs(kind) {
    var r = rangeOf(), res = r[1] - r[0] > 8 * DAYMS ? 60 * MIN : 15 * MIN, list = timedItems().slice(0, 3000), base = EXPORTS.safeName('4D_' + new Date(r[0]).toISOString().slice(0, 10) + '_' + r[2]);
    var credit = APP_INFO.name + ' ' + APP_INFO.version + ' — created by ' + APP_INFO.author;
    if (kind === 'kml') {
      var st = ''; ['as', 'gen'].forEach(function (s1) { Object.keys(COL[s1]).forEach(function (k) { st += '<Style id="' + s1 + '_' + k + '"><LineStyle><color>' + hexAbgr(COL[s1][k], 'ff') + '</color><width>2</width></LineStyle><PolyStyle><color>' + hexAbgr(COL[s1][k], k === 'on' ? '55' : '22') + '</color></PolyStyle><IconStyle><color>' + hexAbgr(COL[s1][k], 'ff') + '</color></IconStyle></Style>'; }); });
      var pm = list.filter(function (f) { return f.g; }).map(function (f) {
        return intervals(f, r[0], r[1], res).filter(function (iv) { return iv.st !== 'steady'; }).map(function (iv) { return '<Placemark><name>' + xe(f.name) + '</name><description>' + xe(f.k + ': ' + LBL[f.sch][iv.st] + ' ' + iso(iv.start) + ' – ' + iso(iv.end)) + '</description><TimeSpan><begin>' + iso(iv.start) + '</begin><end>' + iso(iv.end) + '</end></TimeSpan><styleUrl>#' + f.sch + '_' + iv.st + '</styleUrl>' + (shapes(f.g).length > 1 ? '<MultiGeometry>' + kmlGeom(f.g) + '</MultiGeometry>' : kmlGeom(f.g)) + '</Placemark>'; }).join('');
      }).join('');
      var fl = V.flight ? '<Placemark><name>' + xe(V.flight.label) + ' at ' + V.flight.gs + ' kt</name><gx:Track>' + V.flight.pts.map(function (p) { return '<when>' + iso(p.t) + '</when>'; }).join('') + V.flight.pts.map(function (p) { return '<gx:coord>' + p.c[0].toFixed(6) + ' ' + p.c[1].toFixed(6) + ' ' + (p.alt || 0) + '</gx:coord>'; }).join('') + '</gx:Track></Placemark>' : '';
      EXPORTS.download(base + '.kml', new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2"><Document><name>4D ' + xe(r[2] + ' ' + fmt(r[0])) + '</name><description>' + xe(NOTICE + ' ' + credit) + '</description>' + st + '<Folder><name>Features in time</name>' + pm + '</Folder>' + (fl ? '<Folder><name>Procedure in time</name>' + fl + '</Folder>' : '') + '</Document></kml>'], { type: 'application/vnd.google-earth.kml+xml' }));
      return;
    }
    if (kind === 'czml') {
      var doc = [{ id: 'document', name: '4D ' + r[2], version: '1.0', description: NOTICE + ' ' + credit, clock: { interval: iso(r[0]) + '/' + iso(r[1]), currentTime: iso(V.T), multiplier: 60, range: 'LOOP_STOP', step: 'SYSTEM_CLOCK_MULTIPLIER' } }];
      list.filter(function (f) { return f.g; }).forEach(function (f, i) {
        intervals(f, r[0], r[1], res).filter(function (iv) { return iv.st !== 'steady' && iv.st !== 'none'; }).forEach(function (iv, j) {
          shapes(f.g).forEach(function (g, m) {
            var id = 'f' + i + '_' + j + '_' + m, pk = { id: id, name: f.name, description: f.k + ': ' + LBL[f.sch][iv.st], availability: iso(iv.start) + '/' + iso(iv.end) }, col = { solidColor: { color: { rgba: rgba(COL[f.sch][iv.st], iv.st === 'on' ? 110 : 50) } } };
            var flat = function (l) { var o = []; l.filter(function (p) { return typeof p[0] === 'number'; }).forEach(function (p) { o.push(+p[0].toFixed(6), +p[1].toFixed(6), 0); }); return o; };
            if (g.t === 'A') pk.polygon = { positions: { cartographicDegrees: flat(g.c[0]) }, material: col, outline: true, outlineColor: { rgba: rgba(COL[f.sch][iv.st], 255) }, height: 0 };
            else if (g.t === 'L') pk.polyline = { positions: { cartographicDegrees: flat(g.c) }, material: col, width: 3, clampToGround: true };
            else { pk.position = { cartographicDegrees: flat([g.c]) }; pk.point = { pixelSize: 9, color: { rgba: rgba(COL[f.sch][iv.st], 255) } }; }
            doc.push(pk);
          });
        });
      });
      if (V.flight) { var cd = []; V.flight.pts.forEach(function (p) { cd.push((p.t - V.flight.t0) / 1000, +p.c[0].toFixed(6), +p.c[1].toFixed(6), p.alt || 0); }); doc.push({ id: 'flight', name: V.flight.label, availability: iso(V.flight.t0) + '/' + iso(V.flight.t1), position: { epoch: iso(V.flight.t0), cartographicDegrees: cd }, point: { pixelSize: 10, color: { rgba: [106, 27, 154, 255] } }, path: { width: 2, leadTime: 0, material: { solidColor: { color: { rgba: [106, 27, 154, 200] } } } } }); }
      EXPORTS.download(base + '.czml', new Blob([JSON.stringify(doc)], { type: 'application/json' }));
      return;
    }
    if (kind === 'geojson') {
      var fc = { type: 'FeatureCollection', name: '4D ' + r[2], notice: NOTICE, credit: credit, time: iso(V.T), range: [iso(r[0]), iso(r[1])], features: list.map(function (f) {
        var x = V.st.get(f.r), gg = shapes(f.g), geo = !gg.length ? null : gg.length > 1 ? { type: 'GeometryCollection', geometries: gg.map(gj) } : gj(gg[0]);
        return { type: 'Feature', geometry: geo, properties: { feature_type: f.k, name: f.name, data_set: f.ds.name, state: LBL[f.sch][x.st], why: x.why, temporary_change: !!x.temp, intervals: intervals(f, r[0], r[1], res).map(function (iv) { return { state: LBL[f.sch][iv.st], start: iso(iv.start), end: iso(iv.end) }; }) } };
      }) };
      EXPORTS.download(base + '.geojson', new Blob([JSON.stringify(fc)], { type: 'application/geo+json' }));
      return;
    }
    var C = function (t) { return { t: t === undefined || t === null ? '' : String(t) }; };
    var n = {}; V.st.forEach(function (x) { n[x.st] = (n[x.st] || 0) + 1; });
    var sc = { title: '4D — the data at ' + fmt(V.T), sub: NOTICE, ds: null, sections: [
      { title: 'At this time', blocks: [{ kind: 'kv', rows: [['Time', fmt(V.T) + ' (' + new Date(V.T).toUTCString().slice(0, 3) + ', AIRAC ' + airac(V.T).id + ')'], ['Data sets', V.api.shown().map(function (d) { return d.name; }).join(', ')], ['Daylight saving rule', V.o.dst + (inDst(V.T, V.o.dst) ? ' (summer time)' : '')], ['Holidays', Array.from(V.o.hol).join(', ') || 'none given'],
        ['Result', ['on', 'maybe', 'off', 'none', 'unknown'].map(function (k) { return (n[k] || 0) + ' ' + LBL.as[k]; }).join(', ')], ['Made with', credit]].map(function (x) { return { label: x[0], cells: [C(x[1])] }; }) }] },
      { title: 'Features', blocks: [{ kind: 'table', cols: ['Feature type', 'Feature', 'State', 'Why', 'Next change'], rows: list.map(function (f) { var x = V.st.get(f.r), nc = nextChange(f, V.T); return [C(f.k), C(f.name), C(LBL[f.sch][x.st]), C(x.why), C(nc ? fmt(nc.t) + ' → ' + LBL[f.sch][nc.st] : '')]; }) }] }]
        .concat(V.flight ? [{ title: 'Procedure in time: ' + V.flight.label + ' at ' + V.flight.gs + ' kt', blocks: [{ kind: 'table', cols: ['Leg end', 'NM', 'ETO (UTC)', 'Altitude'], rows: V.flight.legs.map(function (l) { return [C(l.label), C(l.d.toFixed(1)), C(iso(l.t)), C(l.alt)]; }) }] }] : [])
        .concat([{ title: 'Method', blocks: [{ kind: 'note', text: 'Each feature is taken as valid at that time (its time slices, lifetime and temporary changes) and its activation or availability timesheets are evaluated: days, day ranges, holidays, dates, times, sunrise and sunset at the feature, the local time reference, the daylight saving adjustment (summer: one hour earlier) and excluded periods. "By NOTAM" and AIXM 4.5 HX / HO hours are possible, not known. The geometry shown is that of the data loaded. ' + NOTICE }] }]) };
    try { if (kind === 'pdf') EXPORTS.exportPDF(sc); else EXPORTS.exportExcel(sc); } catch (e) { V.api.toast('Report failed: ' + e.message, 6000); }
  }
  function gj(g) { var c = function (l) { return l.filter(function (p) { return typeof p[0] === 'number'; }).map(function (p) { return [+p[0].toFixed(7), +p[1].toFixed(7)]; }); }; return g.t === 'P' ? { type: 'Point', coordinates: c([g.c])[0] } : g.t === 'L' ? { type: 'LineString', coordinates: c(g.c) } : { type: 'Polygon', coordinates: g.c.map(c) }; }

  /* -------------------------------------------------------------- on and off */
  // api: { map(), shown(), toast(t), popup(ds, r, latlng) }
  function open(container, api) {
    var wrap = container.querySelector('.map-wrap') || container;
    V.api = api; V.on = true; V.sig = '';
    if (V.T === null) V.T = Math.floor(Date.now() / MIN) * MIN;
    if (V.host && V.host.parentNode) V.host.parentNode.removeChild(V.host);
    V.host = document.createElement('div');
    V.host.className = 'card fd-bar'; V.host.setAttribute('role', 'region'); V.host.setAttribute('aria-label', '4D time bar');
    V.host.innerHTML = barHtml();
    wrap.appendChild(V.host);
    ['mousedown', 'dblclick', 'wheel', 'touchstart'].forEach(function (ev) { V.host.addEventListener(ev, function (e) { e.stopPropagation(); }); });
    bind();
    var b = container.querySelector('#map-4d'); if (b) { b.setAttribute('aria-pressed', 'true'); b.classList.add('primary'); }
    if (V.hideBase) baseAirspace(true);
    update();
    if (V.resume) { V.resume = false; playToggle(); } // playing on when the map was built again for a new date
  }
  // the map is built again (another tab, another date): the bar is put back by MAPVIEW
  function detach() { if (V.play) { clearInterval(V.play); V.play = null; V.resume = true; } V.layer = null; if (V.flight) { V.flight.line = null; V.flight.mk = null; } V.sig = ''; V.items.forEach(function (f) { f.lay = null; }); }
  function close() {
    detach();
    var map = V.api && V.api.map();
    if (map) map.eachLayer(function (l) { if (l.options && l.options.pane === 'fourdPane') map.removeLayer(l); });
    if (V.hideBase) baseAirspace(false);
    var b = document.getElementById('map-4d'); if (b) { b.setAttribute('aria-pressed', 'false'); b.classList.remove('primary'); }
    if (V.host && V.host.parentNode) V.host.parentNode.removeChild(V.host);
    V.host = null; V.on = false; V.resume = false; V.items = []; V.st = new Map(); V.flight = null;
  }
  // for the 3D view: the state of an airspace at the time of the bar (null when 4D is off)
  function stateOf(ds, r) { if (!V.on) return null; var x = V.st.get(r); return x ? x.st : null; }

  return { open: open, close: close, detach: detach, stateOf: stateOf, get on() { return V.on; }, setTime: function (t) { setT(t); }, time: function () { return V.T; },
    // pure functions (unit tests)
    sun: sun, inDst: inDst, dstSpan: dstSpan, airac: airac, tsCovers: tsCovers, covers: covers, entriesOf: entriesOf, evalEntries: evalEntries, refOffset: refOffset, dayOk: dayOk, flightPlan: flightPlan, posAt: posAt, state: V, NOTICE: NOTICE };
})();
