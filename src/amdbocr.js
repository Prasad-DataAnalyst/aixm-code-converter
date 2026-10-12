/*!
 * AIXM Code Converter
 * Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com> - author of the AIXM Code Converter
 * SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE; keep this notice in all copies)
 * ==========================================================================
 * AIXM Code Converter - reading charts that are pictures (AMDBOCR)
 * NOT FOR NAVIGATION - for study and analysis only.
 * Many States publish their charts as images inside the PDF: the stand coordinates, threshold coordinates and
 * taxiway tables are there, but not as text. They are read here by optical character recognition:
 *   Page      drawn with PDF.js at about 5 000 pixels across.
 *   Tables    found from their ruling lines: each cell is taken out on its own, without the lines, and the cells are
 *             read together on a sheet, so a table row comes back as its cells in order (two-line cells included).
 *   Text      the rest of the page (titles, notes, labels) read as a page, the tables left out.
 *   Engine    Tesseract.js (Apache-2.0) with its English data — about 7 MB, not stored in the tool so that opening
 *             the tool stays as fast as before: downloaded once, only when asked, from jsDelivr, checked against
 *             the SHA-256 below and kept in this browser (IndexedDB). The chart itself is read here and sent
 *             nowhere.
 * What is read is a reading: the document reader checks it (positions about the aerodrome, the order of a
 * table, the AIP data set, OpenStreetMap) and every value says it was read by OCR.
 * Loaded only when used (src/lazy.js).
 * ========================================================================== */
/* global AMDBDOC, AMDBPKG, Tesseract */
var AMDBOCR = (function () {
  'use strict';
  var CDN = 'https://cdn.jsdelivr.net/npm/';
  var FILES = {
    lib: ['tesseract.js@7.0.0/dist/tesseract.min.js', '000c27d9cd0def655f77b36c72a389c0ab13793aa31cb4d7aab56d09c0afbc7e', 62961],
    worker: ['tesseract.js@7.0.0/dist/worker.min.js', '576b7df7e3393e137e51849357c9adb53fe7ac1bb69bfa06cf3d61520f182c6d', 111307],
    simd: ['tesseract.js-core@6.1.2/tesseract-core-simd-lstm.wasm.js', '9d7c43fb206dc9f48475228b46bf35f888fa9e6259da2e67d5a75c77049f2dc7', 3954569],
    plain: ['tesseract.js-core@6.1.2/tesseract-core-lstm.wasm.js', '775a35df6f2ae100e02609443e6bd5cafcd07983dd6175454ca4a432a7730687', 3954181],
    eng: ['@tesseract.js-data/eng@1.0.0/4.0.0_best_int/eng.traineddata.gz', '45b4cb346724ac1774f1c36f42f182b887bcdb28ebe63e6fff90ac41f3fcff91', 2952873]
  };
  var SIMD = [0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11];
  function hasSimd() { try { return WebAssembly.validate(new Uint8Array(SIMD)); } catch (e) { return false; } }
  function size() { return Math.round((FILES.lib[2] + FILES.worker[2] + FILES[hasSimd() ? 'simd' : 'plain'][2] + FILES.eng[2]) / 1e5) / 10; }

  /* ------------------------------------------------------------- the engine */
  function idb() { return new Promise(function (ok, bad) { var r = indexedDB.open('aixm-ocr-engine', 1); r.onupgradeneeded = function () { r.result.createObjectStore('files'); }; r.onsuccess = function () { ok(r.result); }; r.onerror = function () { bad(r.error); }; }); }
  async function cacheGet(k) { try { var db = await idb(); return await new Promise(function (ok) { var q = db.transaction('files').objectStore('files').get(k); q.onsuccess = function () { ok(q.result || null); }; q.onerror = function () { ok(null); }; }); } catch (e) { return null; } }
  async function cachePut(k, v) { try { var db = await idb(); await new Promise(function (ok) { var t = db.transaction('files', 'readwrite'); t.objectStore('files').put(v, k); t.oncomplete = ok; t.onerror = ok; t.onabort = ok; }); } catch (e) { /* not kept: downloaded again next time */ } }
  async function sha256(b) {
    if (window.crypto && crypto.subtle) { var h = await crypto.subtle.digest('SHA-256', b); return Array.from(new Uint8Array(h)).map(function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); }
    return AMDBPKG.sha256(b);
  }
  async function cached() { var n = 0; for (var k of ['lib', 'worker', hasSimd() ? 'simd' : 'plain', 'eng']) if (await cacheGet(CDN + FILES[k][0])) n++; return n === 4; }
  async function getFile(key, say) {
    var f = FILES[key], url = CDN + f[0], c = await cacheGet(url);
    if (c && (await sha256(c)) === f[1]) return c;
    say('Downloading the OCR engine (once): ' + f[0].split('/').pop() + ', ' + (f[2] / 1e6).toFixed(1) + ' MB …');
    var r = await fetch(url, { referrerPolicy: 'no-referrer', credentials: 'omit' });
    if (!r.ok) throw new Error('the OCR engine could not be downloaded (' + url + ': HTTP ' + r.status + ')');
    var b = new Uint8Array(await r.arrayBuffer());
    if ((await sha256(b)) !== f[1]) throw new Error('the OCR engine downloaded is not the one expected (' + f[0] + ': checksum) — it is not used');
    await cachePut(url, b);
    return b;
  }
  var ENGINE = null;
  async function engine(say) {
    if (!ENGINE) ENGINE = (async function () {
      var simd = hasSimd(), lib = await getFile('lib', say), wk = await getFile('worker', say), core = await getFile(simd ? 'simd' : 'plain', say), eng = await getFile('eng', say);
      if (typeof Tesseract === 'undefined') await new Promise(function (ok, bad) { var u = URL.createObjectURL(new Blob([lib], { type: 'text/javascript' })), s = document.createElement('script'); s.src = u; s.onload = function () { URL.revokeObjectURL(u); ok(); }; s.onerror = function () { bad(new Error('the OCR engine could not start')); }; document.head.appendChild(s); });
      say('Starting the OCR engine …');
      // one worker script, the engine core first: the worker finds it and loads nothing (a page opened from a file
      // cannot load a script from inside a worker made from a blob)
      // Tesseract.js 7.0.0 names a language given as data by its data, not its code, when it starts (initialize):
      // put right in the worker checked above, so the English data is taken from here and nothing is downloaded
      var wt = new TextDecoder().decode(wk), BUG = 'return"string"==typeof t?t:t.data})).join("+")', fixed = wt.replace(BUG, 'return"string"==typeof t?t:t.code})).join("+")');
      if (fixed === wt) throw new Error('the OCR engine is not the one expected (worker)');
      var url = URL.createObjectURL(new Blob([core, '\n', fixed], { type: 'text/javascript' }));
      return Tesseract.createWorker([{ code: 'eng', data: eng }], 1, { workerPath: url, workerBlobURL: false, corePath: 'built-in', cacheMethod: 'none', errorHandler: function () { /* reported by the job */ } });
    })();
    try { return await ENGINE; } catch (e) { ENGINE = null; throw e; }
  }

  /* ------------------------------------------------------------ the page */
  // ink (dark pixels) and the long straight lines of tables and frames: runs longer than 2 % of the page, longer than
  // the strokes of a large title
  function masks(img) {
    var W = img.width, H = img.height, p = img.data, ink = new Uint8Array(W * H), line = new Uint8Array(W * H), L = Math.max(60, Math.round(Math.max(W, H) * 0.02)), x, y, k, run;
    for (var i = 0, j = 0; i < W * H; i++, j += 4) ink[i] = p[j + 3] > 127 && p[j] * 0.3 + p[j + 1] * 0.59 + p[j + 2] * 0.11 < 160 ? 1 : 0;
    for (y = 0; y < H; y++) { var o = y * W; run = 0; for (x = 0; x <= W; x++) { if (x < W && ink[o + x]) run++; else { if (run >= L) for (k = x - run; k < x; k++) line[o + k] = 1; run = 0; } } }
    for (x = 0; x < W; x++) { run = 0; for (y = 0; y <= H; y++) { if (y < H && ink[y * W + x]) run++; else { if (run >= L) for (k = y - run; k < y; k++) line[k * W + x] = 1; run = 0; } } }
    return { W: W, H: H, ink: ink, line: line, L: L };
  }
  // table cells: the closed areas between the lines, nearly rectangular, of a size a cell has (half resolution)
  function cells(m) {
    var f = 2, w = Math.ceil(m.W / f), h = Math.ceil(m.H / f), bar = new Uint8Array(w * h), x, y;
    for (y = 0; y < m.H; y++) for (x = 0; x < m.W; x++) if (m.line[y * m.W + x]) bar[((y / f) | 0) * w + ((x / f) | 0)] = 1;
    var lab = new Int32Array(w * h), stack = new Int32Array(w * h), out = [], id = 0;
    for (var s = 0; s < w * h; s++) {
      if (bar[s] || lab[s]) continue;
      id++;
      var top = 0, n = 0, x0 = w, y0 = h, x1 = 0, y1 = 0, edge = false;
      stack[top++] = s; lab[s] = id;
      while (top) {
        var q = stack[--top], qx = q % w, qy = (q - qx) / w; n++;
        if (qx < x0) x0 = qx; if (qx > x1) x1 = qx; if (qy < y0) y0 = qy; if (qy > y1) y1 = qy;
        if (!qx || !qy || qx === w - 1 || qy === h - 1) edge = true;
        if (qx > 0 && !bar[q - 1] && !lab[q - 1]) { lab[q - 1] = id; stack[top++] = q - 1; }
        if (qx < w - 1 && !bar[q + 1] && !lab[q + 1]) { lab[q + 1] = id; stack[top++] = q + 1; }
        if (qy > 0 && !bar[q - w] && !lab[q - w]) { lab[q - w] = id; stack[top++] = q - w; }
        if (qy < h - 1 && !bar[q + w] && !lab[q + w]) { lab[q + w] = id; stack[top++] = q + w; }
      }
      var bw = x1 - x0 + 1, bh = y1 - y0 + 1;
      if (!edge && n >= 0.85 * bw * bh && bw >= 12 && bh >= 7 && bw <= w * 0.6 && bh <= h * 0.25) out.push({ x0: x0 * f, y0: y0 * f, x1: (x1 + 1) * f, y1: (y1 + 1) * f });
    }
    return out;
  }
  // cells that touch (across a border, tol pixels) make a table; a table's rows from its smallest cells, a tall cell
  // joins every row it spans
  function tables(list, tol) {
    tol = tol || 12;
    var par = list.map(function (c, i) { return i; });
    function find(i) { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; }
    for (var i = 0; i < list.length; i++) for (var j = i + 1; j < list.length; j++) {
      var a = list[i], b = list[j];
      if (a.x0 <= b.x1 + tol && b.x0 <= a.x1 + tol && a.y0 <= b.y1 + tol && b.y0 <= a.y1 + tol) par[find(i)] = find(j);
    }
    var by = {}; list.forEach(function (c, i) { (by[find(i)] = by[find(i)] || []).push(c); });
    return Object.keys(by).map(function (k) {
      var cs = by[k], hs = cs.map(function (c) { return c.y1 - c.y0; }).sort(function (a, b) { return a - b; }), med = hs[Math.floor(hs.length / 2)];
      var bands = [];
      cs.filter(function (c) { return c.y1 - c.y0 <= med * 1.6; }).map(function (c) { return (c.y0 + c.y1) / 2; }).sort(function (a, b) { return a - b; }).forEach(function (yc) { var bd = bands[bands.length - 1]; if (bd && yc - bd.y < med * 0.4) { bd.n++; bd.y += (yc - bd.y) / bd.n; } else bands.push({ y: yc, n: 1 }); });
      var rows = bands.map(function (bd) { return cs.filter(function (c) { return c.y0 <= bd.y && c.y1 >= bd.y; }).sort(function (a, b) { return a.x0 - b.x0; }); });
      return { cells: cs, rows: rows, x0: Math.min.apply(null, cs.map(function (c) { return c.x0; })), y0: Math.min.apply(null, cs.map(function (c) { return c.y0; })), x1: Math.max.apply(null, cs.map(function (c) { return c.x1; })), y1: Math.max.apply(null, cs.map(function (c) { return c.y1; })) };
    }).filter(function (t) { return t.cells.length >= 2; }).sort(function (a, b) { return a.y0 - b.y0 || a.x0 - b.x0; });
  }
  // the words of a recognition, with their boxes
  function words(r) { var out = []; ((r.data && r.data.blocks) || []).forEach(function (b) { (b.paragraphs || []).forEach(function (p) { (p.lines || []).forEach(function (l) { (l.words || []).forEach(function (wd) { if (wd.text && wd.text.trim()) out.push(wd); }); }); }); }); return out; }
  function lineText(ws) {
    var ls = [];
    ws.slice().sort(function (a, b) { return a.bbox.y0 - b.bbox.y0; }).forEach(function (wd) { var h = wd.bbox.y1 - wd.bbox.y0, cy = (wd.bbox.y0 + wd.bbox.y1) / 2, l = ls.filter(function (x) { return Math.abs(x.cy - cy) < Math.max(h, x.h) * 0.6; })[0]; if (l) l.w.push(wd); else ls.push({ cy: cy, h: h, w: [wd] }); });
    return ls.sort(function (a, b) { return a.cy - b.cy; }).map(function (l) { return l.w.sort(function (a, b) { return a.bbox.x0 - b.bbox.x0; }).map(function (wd) { return wd.text; }).join(' '); }).join(' ');
  }
  function canvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); return c; }
  // one page: its pixels cleaned (ink without the lines), its tables read cell by cell, the rest read as a page
  async function page(src, w, say, label) {
    var g = src.getContext('2d', { willReadFrequently: true }), img = g.getImageData(0, 0, src.width, src.height), m = masks(img);
    img = null;
    var clean = canvas(m.W, m.H), cg = clean.getContext('2d'), out = cg.getImageData(0, 0, m.W, m.H), op = out.data;
    for (var i = 0, j = 0; i < m.W * m.H; i++, j += 4) if (m.ink[i] && !m.line[i]) { op[j] = op[j + 1] = op[j + 2] = 0; }
    cg.putImageData(out, 0, 0); out = null;
    say(label + ': finding the tables …');
    await new Promise(function (r) { setTimeout(r, 0); });
    var T = tables(cells(m), Math.max(12, Math.round(Math.max(m.W, m.H) * 0.004))), ink = m.ink, W = m.W;
    m = null;
    var all = [], conf = [];
    T.forEach(function (t) { t.cells.forEach(function (c) { var n = 0; for (var y = c.y0 + 2; y < c.y1 - 2 && n < 15; y += 2) for (var x = c.x0 + 2; x < c.x1 - 2; x += 2) if (ink[y * W + x]) n++; c.text = ''; if (n >= 6) all.push(c); }); });
    // the cells on sheets, one under the other, read together
    var maxW = Math.min(3000, Math.max.apply(null, [200].concat(all.map(function (c) { return c.x1 - c.x0; })))), sheets = [], cur = null;
    all.forEach(function (c) {
      var cw = Math.min(maxW, c.x1 - c.x0 - 4), ch = c.y1 - c.y0 - 4;
      if (!cur || cur.h + ch + 40 > 6000) { cur = { h: 20, slots: [] }; sheets.push(cur); }
      cur.slots.push({ c: c, y: cur.h, w: cw, h: ch }); cur.h += ch + 40;
    });
    for (var s = 0; s < sheets.length; s++) {
      say(label + ': reading ' + T.length + ' table(s), ' + all.length + ' cells' + (sheets.length > 1 ? ' (' + (s + 1) + ' / ' + sheets.length + ')' : '') + ' …');
      var sh = sheets[s], sc = canvas(maxW + 40, sh.h), sg = sc.getContext('2d');
      sh.slots.forEach(function (sl) { sg.drawImage(clean, sl.c.x0 + 2, sl.c.y0 + 2, sl.w, sl.h, 20, sl.y, sl.w, sl.h); });
      await w.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1', user_defined_dpi: '300' });
      var ws = words(await w.recognize(sc, {}, { blocks: true }));
      ws.forEach(function (wd) { conf.push(wd.confidence); });
      sh.slots.forEach(function (sl) { sl.c.text = lineText(ws.filter(function (wd) { var cy = (wd.bbox.y0 + wd.bbox.y1) / 2; return cy >= sl.y - 10 && cy < sl.y + sl.h + 10; })); });
    }
    // the rest of the page, the tables blanked out
    say(label + ': reading the text …');
    cg.fillStyle = '#fff'; T.forEach(function (t) { cg.fillRect(t.x0, t.y0, t.x1 - t.x0, t.y1 - t.y0); });
    await w.setParameters({ tessedit_pageseg_mode: '3', preserve_interword_spaces: '1', user_defined_dpi: '300' });
    var pw = words(await w.recognize(clean, {}, { blocks: true }));
    pw.forEach(function (wd) { conf.push(wd.confidence); });
    var items = pw.map(function (wd) { var h = Math.max(4, wd.bbox.y1 - wd.bbox.y0); return { str: wd.text, width: wd.bbox.x1 - wd.bbox.x0, transform: [h, 0, 0, h, wd.bbox.x0, -wd.bbox.y1] }; });
    var lines = AMDBDOC.textLines(items);
    T.forEach(function (t) { t.rows.forEach(function (row) { var tx = row.map(function (c) { return c.text; }).filter(Boolean); if (tx.length) lines.push(tx.join('\t')); }); });
    return { lines: lines, tables: T.length, cells: all.length, conf: conf };
  }
  // every page of a PDF; the pages drawn at about 5 000 pixels across (at most 20 million pixels)
  async function readPdf(bytes, say) {
    var w = await engine(say), lib = await AMDBDOC.pdfLib(), doc = await lib.getDocument({ data: bytes.slice(0), isEvalSupported: false, disableFontFace: true, useSystemFonts: false }).promise;
    var res = { lines: [], pages: doc.numPages, tables: 0, cells: 0, conf: 0 }, conf = [];
    try {
      for (var i = 1; i <= doc.numPages; i++) {
        var pg = await doc.getPage(i), v1 = pg.getViewport({ scale: 1 }), sc = Math.min(5, Math.max(2.5, 5000 / Math.max(v1.width, v1.height)));
        if (v1.width * v1.height * sc * sc > 2e7) sc = Math.sqrt(2e7 / (v1.width * v1.height));
        var vp = pg.getViewport({ scale: sc }), cv = canvas(Math.round(vp.width), Math.round(vp.height)), label = doc.numPages > 1 ? 'page ' + i + ' of ' + doc.numPages : 'the page';
        say('Drawing ' + label + ' …');
        await pg.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
        var r = await page(cv, w, say, label.charAt(0).toUpperCase() + label.slice(1));
        res.lines = res.lines.concat(r.lines); res.tables += r.tables; res.cells += r.cells; conf = conf.concat(r.conf);
        cv.width = cv.height = 1;
      }
    } finally { await doc.destroy(); }
    res.conf = conf.length ? Math.round(conf.reduce(function (a, b) { return a + b; }, 0) / conf.length) : 0;
    return res;
  }
  async function stop() { if (ENGINE) { try { (await ENGINE).terminate(); } catch (e) { /* gone */ } ENGINE = null; } }
  return { readPdf: readPdf, engine: engine, cached: cached, size: size, hasSimd: hasSimd, stop: stop, masks: masks, cells: cells, tables: tables, FILES: FILES, CDN: CDN };
})();
