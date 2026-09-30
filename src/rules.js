/* =============================================================================
 * AIXM Code Converter - AIXM 5.1 business rules (SBVR, aixm.aero)
 * Evaluates the rules compiled by tools/build_rules.js on a data set:
 * mandatory and conditional properties, allowed annotation property names,
 * units/levels, navaid composition, reference targets, accuracy limits,
 * forbidden values and uniqueness. The rest of the 2,031 rules is shown as a
 * searchable catalogue. Rules apply to the current (or "valid on date") time
 * slice of each feature and to every nested object of the named class.
 * ========================================================================== */
/* global AX, MODEL */
var RULES = (function () {
  'use strict';
  var M = MODEL, s = M.s, arr = AX.arr, data = null;
  function load() {
    if (!data) {
      var el = document.getElementById('data-rules');
      data = el ? JSON.parse(el.textContent) : { rules: [], parent: {} };
    }
    return data;
  }
  function isA(cls, want) { var g = 0; while (cls && g++ < 12) { if (cls === want) return true; cls = data.parent[cls]; } return false; }
  function assigned(v) { return v !== undefined && v !== null && v !== '' && !(typeof v === 'object' && v.nil !== undefined); }
  function sv(v) { return v && typeof v === 'object' ? (v.v !== undefined ? String(v.v) : v.ref !== undefined ? v.ref : '') : v === undefined || v === null ? '' : String(v); }
  // values reached by a dotted rule path ("location.ElevatedPoint.horizontalAccuracy.uom")
  function get(o, path) {
    var cur = [o], segs = path.split('.');
    for (var i = 0; i < segs.length; i++) {
      var seg = segs[i], next = [];
      if (!seg) continue;
      cur.forEach(function (x) {
        if (!x || typeof x !== 'object') return;
        // a capitalised segment is a class name (ElevatedPoint, NavaidEquipment …) unless it is a property (ARP, RNAV …)
        if (/^[A-Z]/.test(seg) && x[seg] === undefined) { if (!x._t || isA(x._t, seg)) next.push(x); return; }
        if (seg === 'uom') { if (x.u !== undefined) next.push(x.u); return; }
        if (seg === 'pos' || seg === 'posList') { if (x._geo) next.push(x._geo); return; }
        arr(x[seg]).forEach(function (y) { if (y !== undefined && y !== null) next.push(y); });
      });
      cur = next;
    }
    return cur;
  }
  // the provider coded the property as xsi:nil (e.g. nilReason="inapplicable"): it is present, not forgotten
  function declaredNA(o, path) {
    var segs = path.split('.'), last = segs.pop(), holders = segs.length ? get(o, segs.join('.')) : [o];
    return holders.some(function (h) { return h && typeof h === 'object' && (h._na && (',' + h._na + ',').indexOf(',' + last + ',') >= 0 || h[last] && h[last].nil !== undefined); });
  }
  function descendants(o, want, out, d) {
    if (!o || typeof o !== 'object' || d > 10) return out;
    if (Array.isArray(o)) { o.forEach(function (x) { descendants(x, want, out, d + 1); }); return out; }
    for (var k in o) {
      if (k === '_geo') continue;
      var v = o[k];
      arr(v).forEach(function (x) { if (x && typeof x === 'object') { if (x._t && isA(x._t, want)) out.push(x); descendants(x, want, out, d + 1); } });
    }
    return out;
  }

  // index of the objects of every class inside the current time slices
  function yieldUI() { return new Promise(function (r) { setTimeout(r, 0); }); }
  async function index(ds, onProgress) {
    var key = String(ds.viewDate);
    if (ds._ruleIdx && ds._ruleIdx.key === key) return ds._ruleIdx;
    var objs = new Map();
    function walk(rec, v, d) {
      if (!v || typeof v !== 'object' || d > 12) return;
      if (Array.isArray(v)) { for (var i = 0; i < v.length; i++) walk(rec, v[i], d + 1); return; }
      for (var k in v) {
        if (k === '_geo') continue;
        var x = v[k];
        if (x && typeof x === 'object') {
          arr(x).forEach(function (y) {
            if (y && typeof y === 'object' && y._t) { var l = objs.get(y._t); if (!l) objs.set(y._t, l = []); l.push({ rec: rec, o: y }); }
            walk(rec, y, d + 1);
          });
        }
      }
    }
    for (var i = 0; i < ds.recs.length; i++) {
      var r = ds.recs[i];
      if (r.cur && r.cur.p && r.k !== '#error') walk(r, r.cur.p, 0);
      if (i % 5000 === 4999) { if (onProgress) onProgress(0.3 * i / ds.recs.length); await yieldUI(); }
    }
    ds._ruleIdx = { key: key, objs: objs };
    return ds._ruleIdx;
  }
  function instances(ds, idx, c) {
    var out = [];
    Object.keys(ds.byType).forEach(function (k) { if (isA(k, c)) ds.byType[k].forEach(function (r) { if (r.cur && r.cur.p && !r.cur.future && !r.cur.ended) out.push({ rec: r, o: r.cur.p, feat: true }); }); });
    idx.objs.forEach(function (list, t) { if (isA(t, c)) list.forEach(function (x) { if (!x.rec.cur.future && !x.rec.cur.ended) out.push(x); }); });
    return out;
  }
  function sliceOk(rule, inst) {
    // mandatory-data rules apply to complete descriptions (BASELINE / SNAPSHOT), not to temporary or permanent deltas
    var i = inst.rec.cur.i;
    if (rule.k.t === 'mand' || rule.k.t === 'cmand' || rule.k.t === 'navreq') return i === 'BASELINE' || i === 'SNAPSHOT' || !i;
    return true;
  }

  function checkOne(ds, idx, rule) {
    var k = rule.k, res = { rule: rule, fails: [], n: 0, unverified: 0 }, seen = new Map();
    function fail(inst, msg) { // one finding per feature and message; nested repeats are counted
      var key = inst.rec.i + '|' + msg, f = seen.get(key);
      if (f) { f.n++; return; }
      seen.set(key, f = { rec: inst.rec, msg: msg, n: 1 });
      res.fails.push(f);
    }
    var list = k.t === 'unique' || k.t === 'absent' ? null : instances(ds, idx, k.c);
    switch (k.t) {
      case 'absent':
        Object.keys(ds.byType).forEach(function (t) { if (isA(t, k.c)) ds.byType[t].forEach(function (r) { res.n++; res.fails.push({ rec: r, msg: t + ' present' }); }); });
        return res;
      case 'unique': {
        var seen = new Map();
        Object.keys(ds.byType).forEach(function (t) {
          if (!isA(t, k.c)) return;
          ds.byType[t].forEach(function (r) { if (!r.cur || r.cur.future || r.cur.ended) return; var v = sv(r.cur.p[k.p]); if (!v) return; res.n++; var l = seen.get(v); if (!l) seen.set(v, l = []); l.push(r); });
        });
        seen.forEach(function (l, v) { if (l.length > 1) l.forEach(function (r) { res.fails.push({ rec: r, msg: k.p + ' "' + v + '" used by ' + l.length + ' features' }); }); });
        return res;
      }
    }
    list.forEach(function (inst) {
      if (!sliceOk(rule, inst)) return;
      var o = inst.o, vals, bad;
      switch (k.t) {
        case 'mand':
          res.n++;
          if (!get(o, k.p).some(assigned) && !declaredNA(o, k.p)) fail(inst, k.p + ' is missing');
          break;
        case 'cmand':
          if (!get(o, k.if).some(assigned)) return;
          res.n++;
          if (!get(o, k.p).some(assigned) && !declaredNA(o, k.p)) fail(inst, k.if + ' is given but ' + k.p + ' is missing');
          break;
        case 'note':
          arr(o.annotation).forEach(function (n) {
            if (!n || typeof n !== 'object' || !assigned(n.propertyName)) return;
            res.n++;
            if (k.v.indexOf(s(n.propertyName)) < 0) fail(inst, 'annotation propertyName "' + s(n.propertyName) + '" is not a property of ' + k.c);
          });
          break;
        case 'equom':
          vals = get(o, k.p).filter(function (v) { return v && typeof v === 'object' && k.u.indexOf(v.u) >= 0; });
          if (!vals.length) return;
          res.n++;
          if (!get(o, k.q).some(function (v) { return sv(v) === k.v; })) fail(inst, k.p + ' in ' + vals[0].u + ' needs ' + k.q + ' = ' + k.v + ' (is ' + (get(o, k.q).map(sv).join(', ') || 'missing') + ')');
          break;
        case 'digits':
          vals = get(o, k.p).filter(function (v) { return v && typeof v === 'object' && k.u.indexOf(v.u) >= 0; });
          vals.forEach(function (v) { res.n++; if (!/^\d{1,3}$/.test(String(v.v))) fail(inst, k.p + ' ' + v.u + ' ' + v.v + ' must have 1 to 3 digits'); });
          break;
        case 'decimals':
          get(o, k.p).filter(assigned).forEach(function (v) { res.n++; var m = /\.(\d+)$/.exec(sv(v)); if (m && m[1].length > k.n) fail(inst, k.p + ' ' + sv(v) + ' has more than ' + k.n + ' decimals'); });
          break;
        case 'navno':
        case 'navreq': {
          if (s(o.type) !== k.v) return;
          var eqs = arr(o.navaidEquipment).map(function (nc) { return nc && nc.theNavaidEquipment; }).filter(Boolean), kinds = [], unres = 0;
          eqs.forEach(function (ref) { var t = M.target(ds, ref); if (t) kinds.push(t.k); else unres++; });
          res.n++;
          if (k.t === 'navno' && kinds.some(function (x) { return isA(x, k.e); })) fail(inst, 'Navaid type ' + k.v + ' must not include ' + k.e);
          if (k.t === 'navreq' && !kinds.some(function (x) { return isA(x, k.e); })) { if (unres) res.unverified++; else fail(inst, 'Navaid type ' + k.v + ' must include ' + k.e); }
          break;
        }
        case 'ref':
          get(o, k.p).forEach(function (ref) {
            if (!ref || typeof ref !== 'object' || ref.ref === undefined) return;
            res.n++;
            var t = M.target(ds, ref);
            if (!t) { res.unverified++; return; }
            if (!isA(t.k, k.to)) fail(inst, k.p + ' points to a ' + t.k + ', expected ' + k.to);
          });
          break;
        case 'max':
          if (k.ty && s(o.type) !== k.ty) return;
          if (k.has && !get(o, k.has).some(assigned)) return;
          get(o, k.p).forEach(function (v) {
            if (!v || typeof v !== 'object' || v.u !== k.u) return;
            res.n++;
            if (parseFloat(v.v) > k.max) fail(inst, k.p + ' ' + v.v + ' ' + v.u + ' is above ' + k.max + ' ' + k.u);
          });
          break;
        case 'forbid':
          res.n++;
          if (get(o, k.p).some(assigned)) fail(inst, k.p + ' must not be given');
          break;
        case 'forbidval':
          vals = get(o, k.p).map(sv);
          if (!vals.length) return;
          res.n++;
          bad = vals.filter(function (v) { return k.v.indexOf(v) >= 0; });
          if (bad.length) fail(inst, k.p + ' = ' + bad[0] + ' is not allowed');
          break;
        case 'allowed':
          if (!get(o, k.w).some(function (v) { return k.wv.indexOf(sv(v)) >= 0; })) return;
          vals = get(o, k.p).map(sv).filter(Boolean);
          if (!vals.length) return;
          res.n++;
          bad = vals.filter(function (v) { return k.v.indexOf(v) < 0; });
          if (bad.length) fail(inst, k.p + ' = ' + bad[0] + ' (allowed: ' + k.v.join(', ') + ')');
          break;
        case 'nodesc':
          res.n++;
          if (descendants(o, k.d, [], 0).length) fail(inst, 'contains ' + k.d);
          break;
        case 'maxdesc': {
          var n = descendants(o, k.d, [], 0).length;
          res.n++;
          if (n > 1) fail(inst, n + ' × ' + k.d);
          break;
        }
      }
    });
    return res;
  }

  // -> {results:[...failed or passed rules with instances], summary, catalogue}
  async function run(ds, onProgress) {
    load();
    if (ds.family !== '5') return { error: 'The business rules are written for AIXM 5.1 / 5.1.1. Convert the AIXM 4.5 file to 5.1.1 (Export → Convert) and check the converted file.' };
    var idx = await index(ds, onProgress);
    var out = [], sum = { checked: 0, failed: 0, passed: 0, na: 0, catalogue: 0, fails: 0, err: 0, warn: 0 };
    var rules = data.rules;
    for (var i = 0; i < rules.length; i++) {
      var r = rules[i];
      if (!r.k) { sum.catalogue++; continue; }
      var res;
      try { res = checkOne(ds, idx, r); } catch (e) { res = { rule: r, fails: [], n: 0, error: e.message }; }
      if (!res.n) { sum.na++; continue; }
      sum.checked++;
      if (res.fails.length) { sum.failed++; sum.fails += res.fails.length; if (/Error/i.test(r.s)) sum.err += res.fails.length; else sum.warn += res.fails.length; out.push(res); }
      else sum.passed++;
      if (i % 100 === 99) { if (onProgress) onProgress(0.3 + 0.7 * i / rules.length); await yieldUI(); }
    }
    var rank = function (x) { return /Error/i.test(x.rule.s) ? 0 : /Warning/i.test(x.rule.s) ? 1 : 2; };
    out.sort(function (a, b) { return rank(a) - rank(b) || b.fails.length - a.fails.length; });
    return { results: out, summary: sum, total: rules.length };
  }
  function catalogue() { load(); return data.rules; }
  function source() { load(); return data.source; }
  function describe(k) {
    if (!k) return 'catalogue only (not checked automatically)';
    return { mand: 'mandatory property', cmand: 'conditional mandatory property', note: 'allowed annotation property names', equom: 'flight level reference', digits: 'flight level digits', navno: 'navaid composition', navreq: 'navaid composition',
      ref: 'reference target type', max: 'accuracy limit', absent: 'class not used (EAD profile)', unique: 'unique designator', nodesc: 'forbidden content', maxdesc: 'at most one', decimals: 'number of decimals', forbid: 'forbidden property', forbidval: 'forbidden value', allowed: 'allowed values' }[k.t] || k.t;
  }
  return { run: run, catalogue: catalogue, source: source, describe: describe, setData: function (d) { data = d; } };
})();
