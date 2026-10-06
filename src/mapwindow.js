/*!
 * AIXM Code Converter
 * Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com> - author of the AIXM Code Converter
 * SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE; keep this notice in all copies)
 * ==========================================================================
 * AIXM Code Converter - map in a separate window
 * Opens the map in its own browser window (e.g. on a second screen) while the
 * main window keeps showing the AIP, changes, explorer, etc.
 * How: an empty same-origin window is opened and the map's own code (Leaflet,
 * topojson, jsPDF, config, core, model, aip, adchart, mapview - the elements
 * marked data-mapwin in index.html) and the styles are copied into it, so it
 * runs its own MAPVIEW. The data sets are shared by reference (no copy).
 * Clicks in the map window ("AIP section", "View AIXM", ...) are answered by the
 * main window; "show on map" in the main window is sent to the map window.
 * Works offline, from a local file; the browser must allow pop-ups.
 * ========================================================================== */
/* global APP_INFO */
var MAPWIN = (function () {
  'use strict';
  var win = null, hooks = null, sent = { list: null, n: 0, view: null, cmp: null };

  function isOpen() { return !!(win && !win.closed && win.MAPVIEW && win.MAPVIEW.isMounted()); }
  function close() { if (win && !win.closed) win.close(); win = null; }
  function theme(t) {
    if (!isOpen()) return;
    var de = win.document.documentElement;
    if (t) de.setAttribute('data-theme', t); else de.removeAttribute('data-theme');
    win.MAPVIEW.refreshTheme();
  }
  function toastIn(w) {
    return function (msg, ms) {
      var host = w.document.getElementById('toasts'), t = w.document.createElement('div');
      t.className = 'toast'; t.textContent = msg; host.appendChild(t);
      setTimeout(function () { t.remove(); }, ms || 3800);
    };
  }
  // Main-window hooks wrapped so that the main window comes to the front for AIP / XML / details.
  function bridge(h, w) {
    function front(fn) { return function (ds, r) { try { window.focus(); } catch (e) { /* focus refused */ } fn(ds, r); }; }
    return { toast: toastIn(w), openAip: front(h.openAip), openXml: front(h.openXml), openDetail: front(h.openDetail), savePng: h.savePng, problem: h.problem,
      dock: function () { close(); if (h.dock) h.dock(); } };
  }
  function build(w) {
    var d = w.document;
    d.open();
    d.write('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<meta name="author" content="' + APP_INFO.author + ' <' + APP_INFO.email + '>"><title>Map — ' + APP_INFO.name + '</title></head>' +
      '<body style="margin:0;overflow:hidden"><div id="map-root" style="position:fixed;inset:0"></div><div id="print-root"></div><div class="toast-host" id="toasts"></div></body></html>');
    d.close();
    var de = document.documentElement;
    if (de.getAttribute('data-theme')) d.documentElement.setAttribute('data-theme', de.getAttribute('data-theme'));
    d.documentElement.setAttribute('dir', 'ltr');
    document.querySelectorAll('style').forEach(function (st) { var c = d.createElement('style'); c.textContent = st.textContent; d.head.appendChild(c); });
    // data first, then scripts in page order (inline scripts run when inserted)
    document.querySelectorAll('[data-mapwin]').forEach(function (src) {
      var c = d.createElement('script');
      if (src.type) c.type = src.type;
      if (src.id) c.id = src.id;
      c.textContent = src.textContent;
      d.head.appendChild(c);
    });
    w.MODEL.setDict(JSON.parse(d.getElementById('data-dictionary').textContent));
    // signature: author of the AIXM Code Converter (Apache-2.0 NOTICE)
    d.documentElement.setAttribute('data-generator', APP_INFO.credit);
  }
  // Opens (or brings to the front) the map window. opts as for the map view: {ds, cmp, procs, focus, airport, shown}
  function open(datasets, h, opts) {
    hooks = h;
    if (isOpen()) { win.focus(); apply(datasets, opts); return true; }
    win = window.open('', 'aixm-code-converter-map', 'width=1360,height=880');
    if (!win) { h.toast('The browser blocked the new window. Allow pop-ups for this file and try again.', 7000); return false; }
    try { build(win); } catch (e) { h.toast('The map window could not be prepared: ' + e.message, 7000); close(); return false; }
    sent = { list: null, n: 0, view: null, cmp: null };
    mount(datasets, opts || {});
    win.addEventListener('beforeunload', function () { if (hooks && hooks.closed) hooks.closed(); });
    win.focus();
    return true;
  }
  function mount(datasets, opts) {
    var ds = opts.ds || datasets[0];
    win.document.title = 'Map — ' + (ds ? ds.state + ' · ' : '') + APP_INFO.name;
    win.MAPVIEW.mount(win.document.getElementById('map-root'), datasets, bridge(hooks, win), { ds: ds, cmp: opts.cmp, procs: opts.procs, shown: opts.shown });
    sent.list = datasets; sent.n = datasets.length; sent.view = datasets.map(function (x) { return x.viewDate; }).join('|'); sent.cmp = opts.cmp || null;
    if (opts.focus) setTimeout(function () { win.MAPVIEW.focus(ds, opts.focus); }, 250);
  }
  function changed(datasets) {
    return sent.list !== datasets || sent.n !== datasets.length || sent.view !== datasets.map(function (x) { return x.viewDate; }).join('|');
  }
  // "show on map" from the main window
  function apply(datasets, opts) {
    if (!isOpen()) return false;
    opts = opts || {};
    if (changed(datasets)) { mount(datasets, opts); win.focus(); return true; }
    var M = win.MAPVIEW;
    if (opts.cmp !== undefined && opts.cmp !== sent.cmp) { M.setCompare(opts.cmp); sent.cmp = opts.cmp; }
    if (opts.view3d) { if (opts.ds) M.show(opts.ds); M.open3d(opts.view3d.mode, opts.view3d.ad, opts.view3d); win.focus(); return true; }
    if (opts.procs) M.showProcs(opts.ds || datasets[0], opts.procs);
    else if (opts.focus) M.focus(opts.ds || datasets[0], opts.focus);
    else if (opts.ds) M.show(opts.ds);
    win.focus();
    return true;
  }
  // keeps the map window in step with the main window (data sets loaded / removed, view date)
  function sync(datasets, cmp) {
    if (!isOpen()) return;
    if (!datasets.length) { close(); return; }
    if (changed(datasets)) mount(datasets, { ds: datasets[0], cmp: cmp });
    else if (cmp !== sent.cmp) { win.MAPVIEW.setCompare(cmp); sent.cmp = cmp; }
  }
  window.addEventListener('beforeunload', close);

  return { open: open, apply: apply, sync: sync, close: close, isOpen: isOpen, theme: theme, window: function () { return win; } };
})();
