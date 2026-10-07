/*!
 * AIXM Code Converter
 * Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com> - author of the AIXM Code Converter
 * SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE; keep this notice in all copies)
 * ==========================================================================
 * AIXM Code Converter - parts loaded only when a tool needs them (LAZY)
 * Some tools need code that the rest of the application never uses: the aerodrome mapping (AMDB) checks and
 * package (src/amdb.js), the geometry engine (JSTS) and SQLite (GeoPackage files). They are stored in the page
 * as <script type="text/plain"> blocks, which the browser does not run: opening the page, reading AIXM,
 * obstacle and terrain files and every other tool cost exactly what they cost without them. A block is
 * unpacked (raw deflate + base64, see tools/build.js) and run the first time a tool asks for it.
 * ========================================================================== */
/* global fflate */
var LAZY = (function () {
  'use strict';
  var texts = {}, runs = {};
  function el(id) { var n = document.getElementById(id); if (!n) throw new Error('missing part: ' + id); return n; }
  function b64(t) { var bin = atob(t.replace(/\s+/g, '')), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
  // the bytes of a compressed block
  function bytes(id) { var n = el(id); return n.getAttribute('data-packed') === 'deflate' ? fflate.inflateSync(b64(n.textContent)) : new TextEncoder().encode(n.textContent); }
  // the text of a block (a compressed block is unpacked once)
  function text(id) {
    if (texts[id] === undefined) { var n = el(id); texts[id] = n.getAttribute('data-packed') === 'deflate' ? fflate.strFromU8(bytes(id)) : n.textContent; }
    return texts[id];
  }
  // run a JavaScript block once in the page (a blob script keeps file names in error messages)
  function run(id) {
    if (!runs[id]) {
      runs[id] = new Promise(function (resolve, reject) {
        var url = URL.createObjectURL(new Blob([text(id) + '\n//# sourceURL=' + id + '.js'], { type: 'text/javascript' }));
        var s = document.createElement('script');
        s.src = url;
        s.onload = function () { URL.revokeObjectURL(url); resolve(); };
        s.onerror = function () { URL.revokeObjectURL(url); runs[id] = null; reject(new Error('could not start ' + id)); };
        document.head.appendChild(s);
      });
    }
    return runs[id];
  }
  // a worker running the blocks given, in order (for long work off the page's thread)
  function worker(ids, boot) {
    var src = ids.map(text).join('\n;\n') + '\n;\n' + (boot || '');
    var url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    var w = new Worker(url);
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
    return w;
  }
  function loaded(id) { return !!runs[id]; }
  return { bytes: bytes, text: text, run: run, worker: worker, loaded: loaded };
})();
