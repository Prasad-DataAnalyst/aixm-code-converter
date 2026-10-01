/*!
 * AIXM Code Converter
 * Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com> - author of the AIXM Code Converter
 * SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE; keep this notice in all copies)
 * ==========================================================================
 * AIXM Code Converter - streaming parser worker
 * Scans one byte range of a (possibly multi-GB) AIXM file without loading it
 * into memory: 16 MB chunks are decoded 1:1 (windows-1252) for fast native
 * string searching, so string index == byte offset. Each feature found is then
 * decoded as UTF-8, parsed and converted. Results are posted in batches.
 * ========================================================================== */
/* global AX */
(function () {
  'use strict';
  var latin1 = new TextDecoder('windows-1252');
  var utf8 = new TextDecoder('utf-8');
  var NON_ASCII = /[^\x00-\x7f]/;

  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function buildRegex(cfg) {
    if (cfg.family === '45') {
      return new RegExp('<(' + cfg.names.map(escRe).join('|') + ')(?=[\\s/>])', 'g');
    }
    var alts = [];
    var names = cfg.names.map(escRe).join('|');
    cfg.aixmPrefixes.forEach(function (p) { alts.push((p ? escRe(p) + ':' : '') + '(?:' + names + ')'); });
    (cfg.eventPrefixes || []).forEach(function (p) { alts.push((p ? escRe(p) + ':' : '') + 'Event'); });
    return new RegExp('<(' + alts.join('|') + ')(?=[\\s/>])', 'g');
  }

  function countNL(str, from, to) {
    var n = 0, i = from;
    while (true) {
      i = str.indexOf('\n', i);
      if (i < 0 || i >= to) return n;
      n++; i++;
    }
  }

  async function readSlice(file, a, b) {
    var buf = await file.slice(a, b).arrayBuffer();
    return new Uint8Array(buf);
  }

  async function scan(job) {
    var file = job.file, start = job.start, end = job.end, cfg = job.cfg, size = file.size;
    var CH = job.chunk || 16 * 1024 * 1024;
    var re = buildRegex(cfg);
    var ctx = { gmlP: {}, isUpdate: cfg.isUpdate, effective: cfg.effective };
    (cfg.gmlPrefixes || ['gml']).forEach(function (p) { ctx.gmlP[p] = true; });
    var nsHook = function (an, uri) { if (AX.GML_NS_RE.test(uri)) ctx.gmlP[an.indexOf(':') > 0 ? an.slice(6) : ''] = true; };

    var bytes = new Uint8Array(0), str = '', base = start, readPos = start;
    var cursor = 0, nlTo = 0, lines = 0;
    var batch = [], sent = 0, count = 0, errors = 0, lastProgress = 0;
    var chg45 = null; // AIXM 4.5 Update wrapper state (New / Changed / Withdrawn)

    if (cfg.family === '45' && cfg.isUpdate && start > 0) {
      var back = Math.max(0, start - 262144);
      var pre = latin1.decode(await readSlice(file, back, start));
      var wm, wre = /<(\/?)(New|Changed|Withdrawn)\b/g;
      while ((wm = wre.exec(pre))) chg45 = wm[1] ? null : wm[2];
    }

    async function more() {
      if (readPos >= size) return false;
      var b = Math.min(size, readPos + CH);
      var chunk = await readSlice(file, readPos, b);
      readPos = b;
      // drop consumed prefix (keep a small tail margin for tags straddling chunk edges)
      var keep = Math.min(cursor, nlTo);
      if (keep > 0) {
        bytes = bytes.slice(keep);
        str = str.slice(keep);
        base += keep; cursor -= keep; nlTo -= keep;
      }
      var nb = new Uint8Array(bytes.length + chunk.length);
      nb.set(bytes, 0); nb.set(chunk, bytes.length);
      bytes = nb;
      str = str + latin1.decode(chunk);
      return true;
    }
    function post(final) {
      if (batch.length || final) {
        self.postMessage({ type: 'batch', recs: batch, jobId: job.jobId });
        sent += batch.length; batch = [];
      }
    }
    function progress() {
      var done = Math.min(end, base + cursor) - start;
      if (done - lastProgress > 4 * 1024 * 1024 || done >= end - start) {
        lastProgress = done;
        self.postMessage({ type: 'progress', done: done, count: count, jobId: job.jobId });
      }
    }
    function trackWrappers(from, to) {
      if (!(cfg.family === '45' && cfg.isUpdate)) return;
      var seg = str.slice(from, to), wm2, wre2 = /<(\/?)(New|Changed|Withdrawn)\b/g;
      while ((wm2 = wre2.exec(seg))) chg45 = wm2[1] ? null : wm2[2];
    }

    await more();
    while (true) {
      re.lastIndex = cursor;
      var m = re.exec(str);
      if (!m) {
        if (base + str.length >= Math.min(size, end + 1024) || readPos >= size) break;
        var tail = Math.max(cursor, str.length - 1024);
        trackWrappers(cursor, tail);
        lines += countNL(str, nlTo, Math.min(tail, end - base)); nlTo = tail; cursor = tail;
        await more();
        progress();
        continue;
      }
      var s = m.index, abs = base + s;
      if (abs >= end) break;
      var qn = m[1];
      // self-closing feature element -> skip
      var gt = str.indexOf('>', s);
      while (gt < 0) {
        if (!(await more())) break;
        s = abs - base; gt = str.indexOf('>', s);
      }
      if (gt > 0 && str.charCodeAt(gt - 1) === 47) { cursor = gt + 1; continue; }
      // find the matching end tag (absolute positions survive buffer compaction)
      var closeTag = '</' + qn, e = -1, absFrom = abs + qn.length + 1;
      while (true) {
        e = str.indexOf(closeTag, absFrom - base);
        if (e >= 0) {
          if (e + closeTag.length >= str.length) { if (!(await more())) break; continue; }
          var c = str.charCodeAt(e + closeTag.length);
          if (c === 62 || c === 32 || c === 9 || c === 10 || c === 13) break;
          absFrom = base + e + 1; continue;
        }
        absFrom = Math.max(absFrom, base + str.length - closeTag.length);
        if (!(await more())) break;
      }
      s = abs - base;
      var fe;
      if (e < 0) { fe = str.length; errors++; }
      else {
        var absE = base + e;
        fe = str.indexOf('>', e);
        while (fe < 0) {
          if (!(await more())) { fe = str.length - 1; break; }
          s = abs - base; e = absE - base; fe = str.indexOf('>', e);
        }
        fe += 1;
      }
      trackWrappers(cursor, s);
      lines += countNL(str, nlTo, s); nlTo = s;
      var rec;
      try {
        // string index == byte offset; pure-ASCII fragments need no UTF-8 decoding
        var xml = str.slice(s, fe);
        if (NON_ASCII.test(xml)) xml = utf8.decode(bytes.subarray(s, fe));
        var root = AX.parseXml(xml, nsHook);
        var node = root.c && root.c[0];
        if (node) {
          rec = cfg.family === '45' ? AX.convFeature45(node, ctx, chg45) : AX.convFeature5(node, ctx);
        }
      } catch (err) {
        errors++;
        rec = { k: '#error', id: 'error@' + abs, ts: [], err: String(err && err.message || err) };
      }
      if (rec) {
        if (cfg.lite && rec.ts) for (var li = 0; li < rec.ts.length; li++) lite(rec.ts[li].p, 0);
        rec.o = abs; rec.n = fe - s; rec.l = lines; rec.w = job.part;
        batch.push(rec); count++;
        if (batch.length >= 2000) post(false);
      }
      cursor = fe;
      progress();
    }
    // count remaining newlines inside our range
    var stopAt = Math.min(str.length, end - base);
    if (stopAt > nlTo) { lines += countNL(str, nlTo, stopAt); nlTo = stopAt; }
    if (base + str.length < end) { // range not fully read (no more features): count newlines in the rest
      var pos = base + str.length;
      while (pos < end) {
        var b2 = Math.min(end, pos + CH);
        var t = latin1.decode(await readSlice(file, pos, b2));
        lines += countNL(t, 0, t.length);
        pos = b2;
      }
    }
    post(true);
    self.postMessage({ type: 'done', lines: lines, count: count, errors: errors, jobId: job.jobId, part: job.part });
  }

  // Lite mode (very large files): individual light / marking elements and vendor extensions are
  // replaced by a count; everything else is kept. The full XML stays available from the file.
  var LITE_DROP = { LightElement: 1, MarkingElement: 1 };
  function lite(o, d) {
    if (!o || typeof o !== 'object' || d > 8) return;
    for (var k in o) {
      var v = o[k];
      if (!v || typeof v !== 'object') continue;
      if (k === 'extension') { delete o[k]; continue; }
      var first = Array.isArray(v) ? v[0] : v;
      if (k === 'element' && first && LITE_DROP[first._t]) { o[k] = { _t: 'OmittedElements', _omitted: Array.isArray(v) ? v.length : 1, _of: first._t }; continue; }
      if (Array.isArray(v)) { for (var i = 0; i < v.length; i++) lite(v[i], d + 1); } else lite(v, d + 1);
    }
  }
  self.onmessage = function (ev) {
    var msg = ev.data;
    if (msg.cmd === 'scan') {
      scan(msg).catch(function (err) {
        self.postMessage({ type: 'error', msg: String(err && err.stack || err), jobId: msg.jobId });
      });
    }
  };
})();
