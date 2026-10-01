/*!
 * AIXM Code Converter
 * Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com> - author of the AIXM Code Converter
 * SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE; keep this notice in all copies)
 * ==========================================================================
 * AIXM Code Converter - application (UI, extraction orchestration)
 *
 * Contents (search for the section banner, e.g. "AIP VIEW"):
 *   state, icons, nav, theme ............ shared UI state S, icon set, side menu, light/dark
 *   FILES VIEW, extraction engine ....... drop/browse files, sniffing, parallel workers -> MODEL.finalize
 *   LIBRARY, State switcher ............. State folders (LIBRARY module), cache, top-bar State menu
 *   links and bookmarks, as of .......... #hash view links, saved views, "valid on date"
 *   DASHBOARD, AIP VIEW ................. data-set cards; AIP tree and section rendering
 *   cycle change highlighting ........... red/white values of an AIRAC cycle, change lists
 *   side-by-side AIP .................... two cycles / two files next to each other
 *   XML drawer, detail drawer ........... exact AIXM code of a value; all data of a feature
 *   MAP, CHANGES, COMPARE ............... MAPVIEW mount; in-file changes; two-file comparison
 *   AMDT REPORT, TIMELINE, NOTAM ........ REVIEW module views
 *   QUALITY, BUSINESS RULES, EXPLORER ... ANALYSIS.quality, RULES, every feature type
 *   EXPORT, e-mail, search, help, start . exports/conversions, Outlook text, Ctrl+K search, startup
 * Every view is a function viewXxx(v, opts) registered in go(); add a view there and in VIEWS.
 * ========================================================================== */
/* global APP_INFO, APP_SETTINGS, AX, MODEL, AIP, ANALYSIS, MAPVIEW, MAPWIN, ABOUT, ADCHART, OLS, INTEGRITY, EXPORTS, CONVERT, LIBRARY, REVIEW, RULES, I18N, fflate */
(function () {
  'use strict';
  var M = MODEL, s = M.s, arr = AX.arr;
  var DICT = JSON.parse(document.getElementById('data-dictionary').textContent);
  M.setDict(DICT);

  /* ------------------------------------------------------------- state */
  var S = {
    files: [],            // {id, file, name, size, sniff, status, progress, error}
    datasets: [],
    view: 'files',
    active: 0,            // active dataset index
    aipSel: null,         // selected section id
    aipOpen: {},          // tree open state
    changes: new Map(),   // ds -> events
    quality: new Map(),   // ds -> issues
    cmp: null,            // comparison result
    explorerType: null,
    explorerSel: null,
    theme: null,
    asOf: null,
    hlOn: true
  };
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  function esc(t) { return String(t === undefined || t === null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(n) { return Number(n).toLocaleString('en-US'); }
  function fmtSize(n) { return EXPORTS.fmtSize(n); }
  function toast(msg, ms) {
    var t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg;
    $('#toasts').appendChild(t);
    setTimeout(function () { t.remove(); }, ms || 3800);
  }
  // Author of the AIXM Code Converter (Apache-2.0: this attribution must be kept in redistributions, see NOTICE)
  var AUTHOR = APP_INFO.author, AUTHOR_EMAIL = APP_INFO.email;
  try { Object.defineProperty(window, '__aixmAuthor', { value: APP_INFO.credit, enumerable: false }); } catch (e) { /* already defined */ }
  var AUTHOR_LINE = APP_INFO.name + ' ' + APP_INFO.version + ' — © ' + APP_INFO.year + ' ' + AUTHOR + ' · ' + AUTHOR_EMAIL + ' · Apache-2.0';
  try { console.info('%c AIXM Code Converter %c © 2026 ' + AUTHOR + ' <' + AUTHOR_EMAIL + '> · Apache-2.0 ', 'background:#0b2a4a;color:#fff;font-weight:bold;padding:2px 6px', 'color:#0b2a4a'); } catch (e) { /* no console */ }
  function dsOf() { return S.datasets[S.active] || null; }
  var LITE_AUTO = APP_SETTINGS.liteAutoBytes;
  try { S.memMode = localStorage.getItem('aixm-mem') || 'auto'; } catch (e) { S.memMode = 'auto'; }
  try { M.setLocator(MAPVIEW.countryAt); } catch (e) { /* map data missing */ }
  function copyText(txt) { EXPORTS.copyText(txt).then(function (ok) { toast(ok ? 'Copied to the clipboard' : 'Copy failed — select the text manually'); }); }

  /* ------------------------------------------------------------- icons */
  function ic(path, extra) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" ' + (extra || '') + '>' + path + '</svg>'; }
  var I = {
    upload: ic('<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>'),
    folder: ic('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
    dash: ic('<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>'),
    book: ic('<path d="M4 19.5V5a2 2 0 0 1 2-2h13v16H6.5A2.5 2.5 0 0 0 4 21.5"/><path d="M8 7h7M8 11h7"/>'),
    map: ic('<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>'),
    changes: ic('<path d="M12 8v4l3 2"/><circle cx="12" cy="12" r="9"/>'),
    compare: ic('<path d="M8 3v18M16 3v18"/><path d="M3 8h5M16 16h5M3 16h5M16 8h5"/>'),
    check: ic('<path d="M9 12l2 2 4-4"/><path d="M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6z"/>'),
    list: ic('<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>'),
    export: ic('<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/>'),
    code: ic('<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>'),
    x: ic('<path d="M18 6 6 18M6 6l12 12"/>'),
    file: ic('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>'),
    json: ic('<path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1M16 3h1a2 2 0 0 1 2 2v5a2 2 0 0 0 2 2 2 2 0 0 0-2 2v5a2 2 0 0 1-2 2h-1"/>'),
    xls: ic('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>'),
    pdf: ic('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h1.5a1.5 1.5 0 0 1 0 3H8v-5M13 11v5h1a2 2 0 0 0 0-4"/>'),
    print: ic('<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>'),
    mail: ic('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>'),
    copy: ic('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>'),
    sun: ic('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    moon: ic('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'),
    plane: ic('<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>'),
    caret: ic('<path d="m9 18 6-6-6-6"/>', 'class="caret"'),
    info: ic('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
    trash: ic('<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>'),
    play: ic('<path d="M6 4l14 8-14 8z"/>'),
    timeline: ic('<path d="M3 12h18"/><circle cx="6" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="18" cy="12" r="2"/><path d="M6 5v3M12 16v3M18 5v3"/>'),
    notam: ic('<path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M15 9a4 4 0 0 1 0 6M18 6a8 8 0 0 1 0 12"/>'),
    sbs: ic('<rect x="3" y="4" width="8" height="16" rx="1"/><rect x="13" y="4" width="8" height="16" rx="1"/>'),
    amdt: ic('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M9 13h6M9 17h4"/>')
  };

  /* --------------------------------------------------------------- nav */
  var VIEWS = [
    ['library', 'Library', I.folder], ['files', 'Files', I.upload], ['dash', 'Dashboard', I.dash], ['aip', 'AIP', I.book], ['map', 'Map', I.map], null,
    ['changes', 'Changes', I.changes], ['timeline', 'Timeline', I.timeline], ['compare', 'Compare', I.compare], ['notam', 'NOTAM', I.notam], ['quality', 'Quality', I.check], ['explorer', 'Explorer', I.list], null,
    ['export', 'Export', I.export], ['about', 'About', I.info]
  ];
  function renderNav() {
    var has = S.datasets.length > 0;
    $('#nav').innerHTML = VIEWS.map(function (v) {
      if (!v) return '<div class="nav-sep"></div>';
      var dis = !has && v[0] !== 'files' && v[0] !== 'library' && v[0] !== 'about';
      return '<button data-view="' + v[0] + '" class="' + (S.view === v[0] ? 'active' : '') + '"' + (dis ? ' disabled' : '') + ' title="' + v[1] + '">' + v[2] + '<span>' + v[1] + '</span></button>';
    }).join('') + '<div class="nav-credit" data-about="1" title="' + AUTHOR_LINE + '">© 2026<br>Prasad Selvaraj</div>';
  }
  $('#nav').addEventListener('click', function (e) {
    if (e.target.closest('[data-about]')) { go('about'); return; }
    var b = e.target.closest('button[data-view]');
    if (b && !b.disabled) go(b.getAttribute('data-view'));
  });
  function go(view, opts) {
    // the map lives in its own window: send "show on map" there and keep the current view here
    if (view === 'map' && MAPWIN.isOpen() && !(opts && opts.docked)) { MAPWIN.apply(S.datasets, Object.assign({ cmp: S.cmp }, opts || {})); return; }
    S.view = view;
    renderNav();
    closeSearch();
    var main = $('#main');
    main.innerHTML = '';
    var v = document.createElement('div');
    v.className = 'view' + (view === 'aip' || view === 'map' || view === 'explorer' ? ' full' : '');
    main.appendChild(v);
    ({ library: viewLibrary, files: viewFiles, dash: viewDash, aip: viewAip, map: viewMap, changes: viewChanges, timeline: viewTimeline, notam: viewNotam, compare: viewCompare, quality: viewQuality, explorer: viewExplorer, export: viewExport, about: viewAbout })[view](v, opts || {});
    MAPWIN.sync(S.datasets, S.cmp);
    updateHash();
  }

  /* ------------------------------------------------------------- theme */
  function applyTheme(t) {
    S.theme = t;
    if (t) document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme');
    var dark = t === 'dark' || (!t && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    $('#theme-btn').innerHTML = (dark ? I.sun : I.moon).replace('<svg', '<svg width="16" height="16"');
    try { localStorage.setItem('aixm-theme', t || ''); } catch (e) { /* storage unavailable */ }
    if (MAPVIEW.isMounted()) MAPVIEW.refreshTheme();
    MAPWIN.theme(t);
  }
  $('#theme-btn').addEventListener('click', function () {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark' || (!S.theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
    applyTheme(dark ? 'light' : 'dark');
  });
  try { applyTheme(localStorage.getItem('aixm-theme') || null); } catch (e) { applyTheme(null); }

  /* ======================================================== FILES VIEW */
  function viewFiles(v) {
    v.innerHTML =
      '<h1 class="view-title">Open AIXM files</h1><p class="view-sub">Drop one or more AIXM files (any version — 4.5, 5.1, 5.1.1 or 5.2, also inside .zip archives). The version is detected automatically. Nothing leaves this computer.</p>' +
      '<div class="hero"><div class="drop" id="drop"><div class="drop-icon">' + I.upload.replace('<svg', '<svg width="30" height="30"') + '</div>' +
      '<h2>Drop AIXM files here</h2><div class="muted">or click to browse · .xml .aixm .gml .zip · one file per State or many</div>' +
      '<div class="row" style="margin-top:6px"><span class="chip brand">AIXM 4.5</span><span class="chip brand">5.1</span><span class="chip brand">5.1.1</span><span class="chip brand">5.2</span><span class="chip">up to several GB</span></div></div>' +
      '<div class="how card card-pad"><h3>How it works</h3>' +
      step(1, 'Add files', 'Drag & drop or browse. Each file is checked instantly: AIXM version, root element, size.') +
      step(2, 'Extract', 'Press <b>Extract</b>. Large files are read in parallel streams — results appear while reading.') +
      step(3, 'Read like the ICAO AIP', 'GEN / ENR / AD pages, map, effective dates, AIRAC cycle, changes. Every value links to its exact AIXM code.') +
      step(4, 'Share', 'Export any section or everything to JSON, Excel, PDF, print, or a ready e-mail for Outlook.') + '</div></div>' +
      ABOUT.intro() +
      '<div class="filelist" id="filelist"></div>' +
      '<div class="extract-bar card" id="extract-bar"></div>' +
      '<div class="credit-line">AIXM Code Converter · created by <b>Prasad Selvaraj</b> · <a href="mailto:prasad2t@gmail.com">prasad2t@gmail.com</a> · © 2026 · open source (Apache-2.0)</div>';
    var drop = $('#drop', v);
    drop.addEventListener('click', function () { $('#file-input').click(); });
    ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
    drop.addEventListener('drop', function (e) { addFiles(e.dataTransfer.files); });
    renderFileList();
  }
  function step(n, t, d) { return '<div class="step"><div class="num">' + n + '</div><div><b>' + t + '</b><div class="muted">' + d + '</div></div></div>'; }
  $('#file-input').addEventListener('change', function (e) { addFiles(e.target.files); e.target.value = ''; });
  document.addEventListener('dragover', function (e) { e.preventDefault(); });
  document.addEventListener('drop', function (e) { e.preventDefault(); if (S.view !== 'files' && e.dataTransfer && e.dataTransfer.files.length) { go('files'); addFiles(e.dataTransfer.files); } });

  var fileSeq = 0;
  async function addFiles(list) {
    var arrF = Array.prototype.slice.call(list || []);
    for (var i = 0; i < arrF.length; i++) {
      var f = arrF[i];
      if (/\.zip$/i.test(f.name)) {
        toast('Unpacking ' + f.name + ' …');
        try {
          var inner = await unzip(f);
          if (!inner.length) toast('No XML files found in ' + f.name);
          for (var j = 0; j < inner.length; j++) await addOne(inner[j], f.name);
        } catch (err) { toast('Could not unzip ' + f.name + ': ' + err.message, 6000); }
      } else await addOne(f);
    }
    renderFileList();
  }
  async function addOne(f, from) {
    var item = { id: ++fileSeq, file: f, name: f.name, size: f.size, from: from || null, status: 'checking', progress: 0 };
    S.files.push(item);
    renderFileList();
    try {
      var head = await f.slice(0, Math.min(f.size, 262144)).text();
      item.sniff = AX.sniff(head, f.name);
      item.status = item.sniff.family ? 'ready' : 'invalid';
      if (!item.sniff.family) item.error = item.sniff.notes.join('; ') || 'Not an AIXM file';
    } catch (e) { item.status = 'invalid'; item.error = String(e.message || e); }
    renderFileList();
  }
  function unzip(file) {
    return new Promise(function (resolve, reject) {
      var out = [], pending = 0, ended = false;
      var uz = new fflate.Unzip();
      uz.register(fflate.UnzipInflate);
      uz.onfile = function (f) {
        if (!/\.(xml|aixm|gml)$/i.test(f.name) || /__MACOSX/.test(f.name)) return;
        var chunks = [];
        pending++;
        f.ondata = function (err, dat, final) {
          if (err) { reject(err); return; }
          chunks.push(dat);
          if (final) { out.push(new File(chunks, f.name.split('/').pop(), { type: 'text/xml' })); pending--; if (ended && !pending) resolve(out); }
        };
        f.start();
      };
      var reader = file.stream().getReader();
      (function pump() {
        reader.read().then(function (r) {
          if (r.done) { uz.push(new Uint8Array(0), true); ended = true; if (!pending) resolve(out); return; }
          uz.push(r.value);
          pump();
        }).catch(reject);
      })();
    });
  }
  function renderFileList() {
    var host = $('#filelist');
    if (!host) return;
    host.innerHTML = S.files.map(function (f) {
      var sn = f.sniff || {};
      var badge = f.status === 'checking' ? '<span class="chip">checking…</span>' : f.status === 'invalid' ? '<span class="chip err">not AIXM</span>' :
        '<span class="chip brand">' + esc(sn.versionLabel || '') + '</span>' + (sn.isUpdate ? '<span class="chip info">AIXM update</span>' : '');
      var st = { ready: '<span class="chip">ready</span>', parsing: '<span class="chip info"><span class="spinner" style="width:11px;height:11px"></span> reading</span>',
        indexing: '<span class="chip info"><span class="spinner" style="width:11px;height:11px"></span> indexing</span>', done: '<span class="chip ok">✓ extracted</span>', error: '<span class="chip err">error</span>',
        cancelled: '<span class="chip warn">cancelled</span>', checking: '', invalid: '' }[f.status] || '';
      var info = f.status === 'invalid' ? '<div class="muted" style="color:var(--err)">' + esc(f.error || '') + '</div>' :
        '<div class="muted" style="font-size:12.5px">' + fmtSize(f.size) + (sn.root ? ' · root &lt;' + esc(sn.root) + '&gt;' : '') + (f.from ? ' · from ' + esc(f.from) : '') + (f.detail ? ' · ' + f.detail : '') + '</div>';
      var prog = f.status === 'parsing' || f.status === 'indexing' ? '<div class="progress"><div style="width:' + (f.progress * 100).toFixed(1) + '%"></div></div>' : '';
      return '<div class="fileitem card" data-fid="' + f.id + '"><div class="ficon">' + (sn.family === '45' ? '4.5' : sn.version ? esc(sn.version) : 'XML') + '</div>' +
        '<div class="grow"><div class="row wrap"><span class="fname">' + esc(f.name) + '</span>' + badge + st + '</div>' + info + prog + '</div>' +
        '<div class="row">' + (f.status === 'parsing' ? '<button class="btn small" data-cancel="' + f.id + '">Cancel</button>' : '') +
        (f.status !== 'parsing' && f.status !== 'indexing' ? '<button class="btn small ghost" data-remove="' + f.id + '" title="Remove">' + I.trash + '</button>' : '') + '</div></div>';
    }).join('');
    $$('[data-remove]', host).forEach(function (b) { b.onclick = function () { var id = +b.getAttribute('data-remove'); S.files = S.files.filter(function (f) { return f.id !== id; }); renderFileList(); }; });
    $$('[data-cancel]', host).forEach(function (b) { b.onclick = function () { cancelExtraction(+b.getAttribute('data-cancel')); }; });
    var bar = $('#extract-bar');
    var ready = S.files.filter(function (f) { return f.status === 'ready'; });
    var busy = S.files.some(function (f) { return f.status === 'parsing' || f.status === 'indexing'; });
    if (!S.files.length) { bar.classList.add('hidden'); return; }
    bar.classList.remove('hidden');
    var big = S.files.some(function (f) { return f.size > LITE_AUTO; });
    bar.innerHTML = '<div class="grow"><b>' + S.files.length + ' file(s)</b> <span class="muted">· ' + ready.length + ' ready to extract · parallel threads: ' + threads() + '</span></div>' +
      '<label class="muted" title="Lite keeps less detail in memory (individual light and marking elements are counted, not stored) so files of 2–5 GB fit in the browser. Auto uses Lite for files over 1.5 GB.">Memory ' +
      '<select class="inp small" id="mem-mode"><option value="auto">Auto' + (big ? ' (Lite for large files)' : '') + '</option><option value="full">Full detail</option><option value="lite">Lite (2–5 GB files)</option></select></label>' +
      (S.datasets.length ? '<button class="btn" id="goto-dash">' + I.dash + ' Open dashboard</button>' : '') +
      '<button class="btn primary big" id="extract-btn"' + (!ready.length || busy ? ' disabled' : '') + '>' + I.play + ' Extract</button>';
    var eb = $('#extract-btn'); if (eb) eb.onclick = function () { extractAll(); };
    var mm = $('#mem-mode'); if (mm) { mm.value = S.memMode || 'auto'; mm.onchange = function () { S.memMode = mm.value; try { localStorage.setItem('aixm-mem', mm.value); } catch (e) { /* storage unavailable */ } }; }
    var gd = $('#goto-dash'); if (gd) gd.onclick = function () { go('dash'); };
  }
  function updateFileItem(f) {
    if (f.overlay) {
      var ob = $('#ov-bar'), od = $('#ov-detail');
      if (ob) ob.style.width = (f.progress * 100).toFixed(1) + '%';
      if (od) od.textContent = f.detail || '';
    }
    var node = $('[data-fid="' + f.id + '"]');
    if (!node) return;
    var bar = $('.progress > div', node);
    if (bar) bar.style.width = (f.progress * 100).toFixed(1) + '%';
    var d = $('.muted', node);
    if (d && f.detail) d.innerHTML = fmtSize(f.size) + ' · ' + f.detail;
  }

  /* ---------------------------------------------------- extraction engine */
  var workerUrl = null;
  function threads() { return Math.max(1, Math.min(APP_SETTINGS.maxThreads, (navigator.hardwareConcurrency || 4) - 1)); }
  function makeWorker() {
    if (!workerUrl) {
      var src = document.getElementById('src-core').textContent + '\n' + document.getElementById('src-worker').textContent;
      workerUrl = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    }
    return new Worker(workerUrl);
  }
  var running = new Map(); // file id -> {workers, cancelled}
  function featureNames(sn) {
    if (sn.family === '45') return Object.keys(DICT.v45.features);
    var v = /^5\.2/.test(sn.version) ? '5.2' : sn.version === '5.1.1' ? '5.1.1' : '5.1';
    var fv = DICT.v5.featureVersions;
    return Object.keys(fv).filter(function (k) { return fv[k].indexOf(v) >= 0 || (v === '5.2' && fv[k].indexOf('5.1.1') >= 0 && !DICT.v5.objects[k]); });
  }
  async function extractAll() {
    var list = S.files.filter(function (f) { return f.status === 'ready'; });
    for (var i = 0; i < list.length; i++) {
      var f = list[i], key = dropKey(f.file);
      var cached = await openFromCache(key, f.file, null);
      if (cached) { f.status = 'done'; f.detail = 'opened from saved data (instant) · ' + num(cached.recs.length) + ' features · ' + esc(cached.state); renderFileList(); continue; }
      await extractOne(f);
    }
    renderFileList();
    if (S.datasets.length) { initSearch(); renderDsSelect(); if (!checkPending()) go('dash'); }
  }
  function cancelExtraction(id) {
    var r = running.get(id);
    if (!r) return;
    r.cancelled = true;
    r.workers.forEach(function (w) { w.terminate(); });
    if (r.resolve) r.resolve();
  }
  function extractOne(f) {
    return new Promise(function (resolve) {
      var sn = f.sniff, size = f.size;
      var nParts = Math.max(1, Math.min(threads(), Math.floor(size / (6 * 1024 * 1024)) || 1));
      if (sn.family === '45' && sn.isUpdate) nParts = Math.min(nParts, 4);
      var ds = { id: f.id, name: f.name, file: f.file, size: size, sniff: sn, family: sn.family, version: sn.version, recs: [], partLines: new Array(nParts), viewDate: S.asOf };
      var liteOn = S.memMode === 'lite' || (S.memMode !== 'full' && size > LITE_AUTO);
      var cfg = { family: sn.family, names: featureNames(sn), aixmPrefixes: sn.aixmPrefixes, eventPrefixes: sn.eventPrefixes, gmlPrefixes: sn.gmlPrefixes, isUpdate: sn.isUpdate, effective: sn.header && sn.header.effective, lite: liteOn };
      ds.lite = liteOn;
      var done = new Array(nParts).fill(0), finished = 0, t0 = performance.now(), counts = 0, errors = 0;
      var workers = [];
      var ctl = { workers: workers, cancelled: false, resolve: function () { f.status = 'cancelled'; running.delete(f.id); renderFileList(); resolve(); } };
      running.set(f.id, ctl);
      f.status = 'parsing'; f.progress = 0; f.detail = 'starting ' + nParts + ' reader thread(s)…';
      renderFileList();
      var lastUi = 0;
      function ui() {
        var now = performance.now();
        if (now - lastUi < 150) return;
        lastUi = now;
        var bytes = done.reduce(function (a, b) { return a + b; }, 0), sec = (now - t0) / 1000;
        f.progress = size ? bytes / size : 1;
        var rate = bytes / Math.max(sec, 0.001);
        var eta = rate > 0 ? (size - bytes) / rate : 0;
        f.detail = fmtSize(bytes) + ' of ' + fmtSize(size) + ' · ' + (rate / 1048576).toFixed(1) + ' MB/s · ' + num(counts + ds.recs.length) + ' features · ' + (eta > 1 ? '~' + Math.ceil(eta) + ' s left' : 'finishing…') + ' · ' + nParts + ' thread(s)';
        updateFileItem(f);
      }
      for (var p = 0; p < nParts; p++) {
        var w = makeWorker();
        workers.push(w);
        (function (part, worker) {
          worker.onmessage = function (ev) {
            var m = ev.data;
            if (m.type === 'batch') { for (var i = 0; i < m.recs.length; i++) ds.recs.push(m.recs[i]); ui(); }
            else if (m.type === 'progress') { done[part] = m.done; ui(); }
            else if (m.type === 'done') {
              ds.partLines[part] = m.lines; errors += m.errors; done[part] = Math.floor(size * (part + 1) / nParts) - Math.floor(size * part / nParts);
              worker.terminate();
              if (++finished === nParts) complete();
            } else if (m.type === 'error') {
              worker.terminate(); f.status = 'error'; f.error = m.msg; running.delete(f.id); renderFileList(); toast('Error reading ' + f.name + ': ' + m.msg, 8000); resolve();
            }
          };
          worker.onerror = function (e) { f.status = 'error'; f.error = e.message; running.delete(f.id); renderFileList(); resolve(); };
          worker.postMessage({ cmd: 'scan', file: f.file, start: Math.floor(size * part / nParts), end: Math.floor(size * (part + 1) / nParts), cfg: cfg, jobId: f.id, part: part, chunk: 16 * 1024 * 1024 });
        })(p, w);
      }
      function complete() {
        if (ctl.cancelled) return;
        var tRead = performance.now() - t0;
        f.status = 'indexing'; f.progress = 1; f.detail = 'building indexes and AIP model for ' + num(ds.recs.length) + ' features…';
        renderFileList();
        setTimeout(function () {
          try {
            M.finalize(ds);
            ds.tRead = tRead; ds.tTotal = performance.now() - t0; ds.errors = errors;
            applyLib(ds, f.lib);
            ds.cacheKey = f.lib ? f.lib.key : dropKey(f.file);
            if (ds.size <= LITE_AUTO) saveCache(ds); // multi-GB data sets are not duplicated into browser storage
            S.datasets = S.datasets.filter(function (x) { return x.id !== ds.id; });
            S.datasets.push(ds);
            M.harmonizeStates(S.datasets);
            f.status = 'done';
            f.detail = num(ds.recs.length) + ' features · ' + esc(ds.state) + (ds.airac ? ' · AIRAC ' + ds.airac.id : '') + ' · read in ' + (tRead / 1000).toFixed(1) + ' s (' + (size / 1048576 / (tRead / 1000)).toFixed(1) + ' MB/s)';
          } catch (err) {
            console.error(err);
            f.status = 'error'; f.error = String(err.stack || err); toast('Error while indexing ' + f.name + ': ' + err.message, 8000);
          }
          running.delete(f.id);
          renderFileList();
          renderNav();
          resolve(f.status === 'done' ? ds : null);
        }, 30);
      }
    });
  }

  /* ======================================================= LIBRARY */
  var LIB = { scan: null, status: 'none', cached: new Set(), timer: null, sig: '' };
  function dropKey(file) { return file ? 'drop:' + file.name + '|' + file.size + '|' + file.lastModified : null; }
  function applyLib(ds, lib) {
    if (!lib) return;
    ds.lib = lib;
    ds.stateDetected = ds.state;
    ds.state = lib.state;
    ds.stateSource = 'library folder "' + lib.state + '"' + (ds.stateDetected && ds.stateDetected !== lib.state ? ' (detected in data: ' + ds.stateDetected + ')' : '');
  }
  function saveCache(ds) {
    if (!ds.cacheKey || typeof LIBRARY === 'undefined') return;
    LIBRARY.saveDataset(ds.cacheKey, ds).then(function () { LIB.cached.add(ds.cacheKey); if (S.view === 'library') renderLibrary(); })
      .catch(function (e) { console.warn('cache save failed', e); });
  }
  async function openFromCache(key, file, lib) {
    if (!key || typeof LIBRARY === 'undefined') return null;
    var hit = S.datasets.filter(function (d) { return d.cacheKey === key; })[0];
    if (hit) return hit;
    var ds;
    try { ds = await LIBRARY.loadDataset(key); } catch (e) { ds = null; }
    if (!ds) return null;
    ds.id = ++fileSeq; ds.file = file; ds.viewDate = S.asOf; ds.cacheKey = key;
    M.finalize(ds);
    applyLib(ds, lib || ds.lib);
    S.datasets.push(ds);
    M.harmonizeStates(S.datasets);
    renderNav(); renderDsSelect(); initSearch();
    return ds;
  }
  async function libInit() {
    if (typeof LIBRARY === 'undefined') return;
    LIB.cached = await LIBRARY.cachedKeys();
    var r = await LIBRARY.restore();
    LIB.status = r.state;
    if (r.state === 'granted') await libRescan(true);
    renderStateBtn();
    if (S.view === 'library') renderLibrary();
  }
  async function libRescan(quiet) {
    try {
      var sc = await LIBRARY.scan();
      var sig = sc.states.map(function (st) { return st.name + ':' + st.files.map(function (f) { return f.key; }).join(','); }).join(';');
      var before = LIB.scan ? new Set([].concat.apply([], LIB.scan.states.map(function (st) { return st.files.map(function (f) { return f.key; }); }))) : null;
      LIB.scan = sc; LIB.status = 'granted';
      if (before && sig !== LIB.sig) {
        sc.states.forEach(function (st) { st.files.forEach(function (f) { if (!before.has(f.key)) toast('New file in ' + st.name + ': ' + f.name); }); });
      }
      LIB.sig = sig;
      // sniff new files in the background (version badges)
      sc.states.forEach(function (st) { st.files.forEach(function (f) { if (!f.sniff) LIBRARY.sniffOf(f).then(function (sn) { f.sniff = sn; if (S.view === 'library') scheduleLibRender(); }).catch(function () {}); }); });
      renderStateBtn();
      if (S.view === 'library') renderLibrary();
    } catch (e) {
      if (!quiet) toast('Cannot read the library folder: ' + e.message, 6000);
      LIB.status = 'prompt';
    }
  }
  var libRenderT = null;
  function scheduleLibRender() { clearTimeout(libRenderT); libRenderT = setTimeout(function () { if (S.view === 'library') renderLibrary(); }, 300); }
  function startWatch() {
    if (LIB.timer) return;
    LIB.timer = setInterval(function () { if (LIB.status === 'granted' && LIBRARY.isConnected()) libRescan(true); }, 20000);
    window.addEventListener('focus', function () { if (LIB.status === 'granted' && LIBRARY.isConnected()) libRescan(true); });
  }
  function libStates() { return LIB.scan ? LIB.scan.states : []; }
  // eslint-disable-next-line no-unused-vars -- helper kept for future Library features
  function libFileFor(ds) {
    if (!ds || !ds.lib) return null;
    var st = libStates().filter(function (x) { return x.name === ds.lib.state; })[0];
    return st ? st.files.filter(function (f) { return f.key === ds.lib.key; })[0] : null;
  }
  function libPrevFile(ds) {
    var st = libStates().filter(function (x) { return x.name === ds.lib.state; })[0];
    if (!st) return null;
    var i = st.files.findIndex(function (f) { return f.key === ds.lib.key; });
    return i >= 0 ? st.files[i + 1] || null : null; // files are sorted newest first
  }
  function overlay(title) {
    var o = document.createElement('div');
    o.className = 'overlay'; o.id = 'overlay';
    o.innerHTML = '<div class="card"><h3 style="margin:0 0 6px">' + esc(title) + '</h3><div class="progress"><div id="ov-bar"></div></div><div class="muted" id="ov-detail" style="margin-top:8px;font-size:13px">starting…</div></div>';
    document.body.appendChild(o);
    return o;
  }
  async function openLibFile(stateName, f, opts) {
    opts = opts || {};
    var lib = { state: stateName, key: f.key, path: f.path };
    var loaded = S.datasets.filter(function (d) { return d.cacheKey === f.key; })[0];
    if (loaded) { applyLib(loaded, lib); if (!opts.silent) activate(loaded); return loaded; }
    var file = await LIBRARY.fileOf(f);
    var ds = await openFromCache(f.key, file, lib);
    if (!ds) {
      var sn = f.sniff || await LIBRARY.sniffOf(f);
      if (!sn.family) { toast(f.name + ' is not an AIXM file'); return null; }
      var item = { id: ++fileSeq, file: file, name: f.name, size: f.size, sniff: sn, status: 'ready', progress: 0, lib: lib, overlay: true, from: 'library ' + stateName };
      S.files.push(item);
      var ov = overlay('Reading ' + stateName + ' — ' + f.name);
      ds = await extractOne(item);
      ov.remove();
    }
    if (ds && !opts.silent) activate(ds);
    return ds;
  }
  function activate(ds) {
    if (S.pendingHash && S.pendingHash.f === ds.name && checkPending()) return;
    S.active = S.datasets.indexOf(ds); S.aipSel = null;
    renderDsSelect(); renderStateBtn(); initSearch();
    var v = S.view === 'files' || S.view === 'library' ? 'dash' : S.view;
    go(v);
  }
  async function openLatest(stateName) {
    var st = libStates().filter(function (x) { return x.name === stateName; })[0];
    if (!st || !st.files.length) { toast('No AIXM file in the ' + stateName + ' folder yet. Drop one on its card.'); return; }
    await openLibFile(stateName, st.files[0]);
  }
  function viewLibrary(v) { v.innerHTML = '<div id="lib-root"></div>'; renderLibrary(); }
  function renderLibrary() {
    var host = $('#lib-root');
    if (!host) return;
    var sup = typeof LIBRARY !== 'undefined' && LIBRARY.supported;
    var h = '<h1 class="view-title">State library</h1><p class="view-sub">Keep one folder per State on your drive (for example <b>D:\\AIXM\\Saudi</b>, <b>D:\\AIXM\\UAE</b>, <b>D:\\AIXM\\India</b>). Connect the parent folder once — it is remembered. New files copied into a State folder appear automatically; files dropped on a State card are saved into that folder. Extracted data is kept, so switching States is instant.</p>';
    if (!LIBRARY.isConnected() || LIB.status !== 'granted') {
      h += '<div class="card card-pad" style="max-width:820px"><h3>' + (LIB.status === 'prompt' ? 'Reconnect your library' : 'Connect your AIXM library folder') + '</h3>' +
        (LIB.status === 'prompt' ? '<p>The browser needs your permission again to read <b>' + esc(LIBRARY.rootName() || 'the library folder') + '</b>.</p><button class="btn primary big" id="lib-reconnect">' + I.upload + ' Reconnect to ' + esc(LIBRARY.rootName() || 'folder') + '</button> ' : '') +
        (sup ? '<button class="btn ' + (LIB.status === 'prompt' ? '' : 'primary big') + '" id="lib-connect">' + I.upload + ' Choose library folder…</button>' : '<div class="note-box">This browser cannot keep a folder connected (use Chrome or Edge for that). You can still pick the folder for this session.</div>') +
        ' <button class="btn" id="lib-pick">Pick folder for this session only</button><input type="file" id="lib-dir" webkitdirectory multiple class="hidden">' +
        '<pre class="mono" style="margin-top:14px;background:var(--surface-2);padding:12px;border-radius:10px">AIXM\\            ← connect this folder\n├── Saudi\\       AIRAC files of Saudi Arabia (e.g. OE_AIP_20261029.xml)\n├── UAE\\\n└── India\\</pre></div>';
    } else {
      var sc = LIB.scan || { states: [], loose: [] };
      var nFiles = sc.states.reduce(function (a, st) { return a + st.files.length; }, 0);
      h += '<div class="toolbar"><span class="chip brand">📁 ' + esc(LIBRARY.rootName() || '') + '</span><span class="chip">' + sc.states.length + ' States</span><span class="chip">' + nFiles + ' files</span><span class="chip ok">' + LIB.cached.size + ' saved extractions</span><span class="sp"></span>' +
        '<button class="btn small" id="lib-rescan">⟳ Rescan</button><button class="btn small" id="lib-new">＋ New State folder</button>' + (sup ? '<button class="btn small" id="lib-connect">Change folder</button>' : '') + '<button class="btn small" id="lib-clear">Clear saved data</button></div>';
      if (!sc.states.length) h += '<div class="card card-pad">No State folders yet. Create one with <b>New State folder</b> or in Windows Explorer.</div>';
      h += '<div class="lib-grid">' + sc.states.map(function (st) {
        var latest = st.files[0];
        return '<div class="card lib-card" data-state="' + esc(st.name) + '"><div class="lc-head"><b>' + esc(st.name) + '</b><span class="sp"></span><span class="chip" style="background:rgba(255,255,255,.18);color:#fff">' + st.files.length + ' file(s)</span>' +
          (latest ? '<button class="btn small" data-open-latest="' + esc(st.name) + '">Open latest</button>' : '') + '</div>' +
          (st.files.length ? st.files.map(function (f, i) {
            var d = LIBRARY.fileDate(f), a = d ? AX.airac(d) : null, sn = f.sniff;
            var loaded = S.datasets.some(function (x) { return x.cacheKey === f.key; });
            return '<div class="lib-file"><div><div><b>' + esc(f.name) + '</b></div><div class="muted" style="font-size:12px">' + (a ? 'AIRAC ' + a.id + ' · ' + M.fmtDate(d) + ' · ' : '') + fmtSize(f.size) + (sn && sn.versionLabel ? ' · ' + esc(sn.versionLabel) : '') +
              (LIB.cached.has(f.key) ? ' · <span style="color:var(--ok)">saved ✓</span>' : ' · not read yet') + (loaded ? ' · <b>open</b>' : '') + (f.path.split('/').length > 2 ? ' · ' + esc(f.path) : '') + '</div></div>' +
              '<div class="row"><button class="btn small primary" data-open="' + esc(st.name) + '|' + i + '">Open</button>' + (st.files[i + 1] ? '<button class="btn small" data-cmpprev="' + esc(st.name) + '|' + i + '" title="Compare with the previous file and highlight changes">Changes vs prev</button>' : '') + '</div></div>';
          }).join('') : '<div class="lib-file muted">Empty — drop AIXM files here</div>') +
          '<div class="lib-file muted" style="font-size:12px">⇩ Drop AIXM files on this card to save them into ' + esc(st.name) + '</div></div>';
      }).join('') + '</div>';
      if (sc.loose.length) h += '<p class="muted" style="margin-top:16px">' + sc.loose.length + ' file(s) directly in the root folder — move them into a State folder to list them by State.</p>';
    }
    host.innerHTML = h;
    var q = function (id) { return $('#' + id, host); };
    if (q('lib-connect')) q('lib-connect').onclick = async function () { try { await LIBRARY.connect(); LIB.status = 'granted'; await libRescan(); startWatch(); } catch (e) { if (e.name !== 'AbortError') toast(e.message, 6000); } };
    if (q('lib-reconnect')) q('lib-reconnect').onclick = async function () { if (await LIBRARY.reconnect()) { LIB.status = 'granted'; await libRescan(); startWatch(); } };
    if (q('lib-pick')) q('lib-pick').onclick = function () { q('lib-dir').click(); };
    if (q('lib-dir')) q('lib-dir').onchange = async function (e) { LIBRARY.useFallback(e.target.files); LIB.status = 'granted'; await libRescan(); };
    if (q('lib-rescan')) q('lib-rescan').onclick = function () { libRescan(); };
    if (q('lib-clear')) q('lib-clear').onclick = async function () { if (!confirm('Delete all saved extractions from this browser? (Your AIXM files are not touched.)')) return; await LIBRARY.clearCache(); LIB.cached = new Set(); renderLibrary(); toast('Saved data cleared'); };
    if (q('lib-new')) q('lib-new').onclick = async function () { var n = prompt('Name of the new State folder (e.g. Saudi, UAE, India):'); if (!n) return; try { await LIBRARY.createState(n.trim()); await libRescan(); } catch (e) { toast(e.message, 6000); } };
    host.onclick = async function (e) {
      var b = e.target.closest('[data-open],[data-open-latest],[data-cmpprev]');
      if (!b) return;
      if (b.hasAttribute('data-open-latest')) { openLatest(b.getAttribute('data-open-latest')); return; }
      var parts = (b.getAttribute('data-open') || b.getAttribute('data-cmpprev')).split('|');
      var st = libStates().filter(function (x) { return x.name === parts[0]; })[0], f = st.files[+parts[1]];
      var ds = await openLibFile(st.name, f, { silent: b.hasAttribute('data-cmpprev') });
      if (ds && b.hasAttribute('data-cmpprev')) { S.active = S.datasets.indexOf(ds); renderDsSelect(); await pickPrevious(ds, function () {}); S.hlOn = true; go('dash'); }
    };
    $$('.lib-card', host).forEach(function (card) {
      card.addEventListener('dragover', function (e) { e.preventDefault(); e.stopPropagation(); card.classList.add('over'); });
      card.addEventListener('dragleave', function () { card.classList.remove('over'); });
      card.addEventListener('drop', async function (e) {
        e.preventDefault(); e.stopPropagation(); card.classList.remove('over');
        var st = card.getAttribute('data-state'), files = Array.prototype.slice.call(e.dataTransfer.files);
        for (var i = 0; i < files.length; i++) {
          try { await LIBRARY.writeInto(st, files[i]); toast('Saved ' + files[i].name + ' into ' + st); } catch (err) { toast('Could not save into the folder: ' + err.message, 6000); }
        }
        await libRescan(true);
      });
    });
  }
  /* ------------------------------------------------ State switcher (top bar) */
  function renderStateBtn() {
    var btn = $('#state-btn');
    if (!btn) return;
    var ds = dsOf();
    btn.innerHTML = '🌐 ' + esc(ds ? ds.state : (libStates().length ? 'Choose State' : 'States')) + (ds && ds.airac ? ' · ' + ds.airac.id : '') + ' ▾';
    btn.classList.toggle('hidden', !libStates().length && S.datasets.length < 1);
  }
  function toggleStatePop() {
    var old = $('#state-pop');
    if (old) { old.remove(); return; }
    var pop = document.createElement('div');
    pop.className = 'state-pop'; pop.id = 'state-pop';
    var h = '';
    if (libStates().length) {
      h += '<div class="sp-h">Library — ' + esc(LIBRARY.rootName() || '') + '</div>';
      libStates().forEach(function (st) {
        var cur = dsOf() && dsOf().lib && dsOf().lib.state === st.name;
        h += '<div class="sp-i' + (cur ? ' active' : '') + '" data-sps="' + esc(st.name) + '"><b>' + esc(st.name) + '</b><span class="sp"></span><span class="muted">' + st.files.length + ' file(s)</span></div>';
        if (cur || st.files.length <= 3) h += '<div class="sp-files">' + st.files.slice(0, 8).map(function (f, i) {
          var d = LIBRARY.fileDate(f), a = d ? AX.airac(d) : null;
          return '<div class="sp-i" data-spf="' + esc(st.name) + '|' + i + '"><span>' + esc(a ? 'AIRAC ' + a.id + ' · ' + M.fmtDate(d) : f.name) + '</span><span class="sp"></span><span class="muted" style="font-size:11px">' + (LIB.cached.has(f.key) ? 'saved' : '') + '</span></div>';
        }).join('') + '</div>';
      });
    }
    var loose = S.datasets.filter(function (d) { return !d.lib; });
    if (loose.length) {
      h += '<div class="sp-h">Opened files</div>' + loose.map(function (d) { return '<div class="sp-i' + (d === dsOf() ? ' active' : '') + '" data-spd="' + S.datasets.indexOf(d) + '"><b>' + esc(d.state) + '</b><span class="muted">' + esc(d.name) + '</span></div>'; }).join('');
    }
    h += '<div class="sp-h"></div><div class="sp-i" data-spl="1">📁 Manage library…</div>';
    pop.innerHTML = h;
    document.body.appendChild(pop);
    pop.addEventListener('click', function (e) {
      var a = e.target.closest('[data-sps],[data-spf],[data-spd],[data-spl]');
      if (!a) return;
      pop.remove();
      if (a.hasAttribute('data-sps')) openLatest(a.getAttribute('data-sps'));
      else if (a.hasAttribute('data-spf')) { var p2 = a.getAttribute('data-spf').split('|'); var st = libStates().filter(function (x) { return x.name === p2[0]; })[0]; openLibFile(st.name, st.files[+p2[1]]); }
      else if (a.hasAttribute('data-spd')) activate(S.datasets[+a.getAttribute('data-spd')]);
      else go('library');
    });
  }
  document.addEventListener('click', function (e) { var p = $('#state-pop'); if (p && !e.target.closest('#state-pop') && !e.target.closest('#state-btn')) p.remove(); });

  /* ---------------------------------------------------- dataset selector */
  function renderDsSelect() {
    var sel = $('#ds-select');
    renderStateBtn();
    // the State button replaces the old data-set list; the hidden <select> is kept up to date for scripts and tests
    sel.classList.add('hidden');
    sel.innerHTML = S.datasets.map(function (d, i) { return '<option value="' + i + '"' + (i === S.active ? ' selected' : '') + '>' + esc(d.state + ' · ' + d.name) + '</option>'; }).join('');
  }
  $('#ds-select').addEventListener('change', function (e) { S.active = +e.target.value; S.aipSel = null; renderStateBtn(); go(S.view); });
  $('#state-btn').addEventListener('click', function (e) { e.stopPropagation(); toggleStatePop(); });

  /* ------------------------------------------------ links and bookmarks */
  // The address (#…) always describes the current view: file, page, AIP section, cycle, date, map position.
  function secToken(ds, id) {
    var m = /^(AD[23]\.\d+:|AD:)(\d+)$/.exec(id || '');
    if (!m) return id || '';
    var ad = ds.recs[+m[2]];
    return ad ? m[1].replace(':', '') + '@' + M.shortName(ad) : id;
  }
  function secFromToken(ds, tok) {
    var m = /^(AD[23]\.\d+|AD)@(.+)$/.exec(tok || '');
    if (!m) return tok || null;
    var ad = (ds.byType.AirportHeliport || []).filter(function (a) { return M.shortName(a) === m[2]; })[0];
    return ad ? m[1] + ':' + ad.i : null;
  }
  function viewParams() {
    var ds = dsOf(), p = {};
    if (!ds) return p;
    p.v = S.view; p.f = ds.name;
    if (S.view === 'aip' && S.aipSel) p.s = secToken(ds, S.aipSel);
    if (ds.hlCycle) p.c = ds.hlCycle.id;
    if (S.sbs) { var sk = S.sbs.key; if (sk.indexOf('ds:') === 0) { var o = S.datasets[+sk.slice(3)]; if (o) p.x = 'f:' + o.name; } else p.x = sk; }
    if (S.asOf !== null && S.asOf !== undefined) p.d = new Date(S.asOf).toISOString().slice(0, 10);
    if (S.view === 'map' && MAPVIEW.isMounted()) { var lm = MAPVIEW.leaflet(), c = lm.getCenter(); p.m = c.lat.toFixed(4) + ',' + c.lng.toFixed(4) + ',' + lm.getZoom(); }
    return p;
  }
  function toHash(p) { return '#' + Object.keys(p).map(function (k) { return k + '=' + encodeURIComponent(p[k]); }).join('&'); }
  function parseHash(h) {
    var p = {};
    String(h || '').replace(/^#/, '').split('&').forEach(function (kv) { var i = kv.indexOf('='); if (i > 0) p[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); });
    return p;
  }
  var hashT = null;
  function updateHash() {
    clearTimeout(hashT);
    hashT = setTimeout(function () {
      if (!S.datasets.length) return;
      try { history.replaceState(null, '', toHash(viewParams())); } catch (e) { /* not allowed here */ }
    }, 120);
  }
  function applyParams(p) {
    var ds = S.datasets.filter(function (d) { return d.name === p.f; })[0];
    if (!ds) return false;
    S.active = S.datasets.indexOf(ds);
    if (p.d) { var t = Date.parse(p.d + 'T00:00:00Z'); if (!isNaN(t) && t !== S.asOf) { $('#asof-mode').value = 'date'; $('#asof-date').classList.remove('hidden'); $('#asof-date').value = p.d; S.asOf = t; S.datasets.forEach(function (d) { M.setViewDate(d, t); d.catalogue = null; d.searchIdx = null; }); } }
    if (p.c) { var cy = ANALYSIS.changeCycles(ds).filter(function (x) { return x.cycle.id === p.c; })[0]; ds.hlCycle = cy ? cy.cycle : ds.hlCycle; ds.cyc = null; S.hlOn = true; }
    S.sbs = null;
    if (p.x) {
      if (p.x.indexOf('f:') === 0) { var o = S.datasets.filter(function (d) { return d.name === p.x.slice(2); })[0]; if (o) S.sbs = { key: 'ds:' + S.datasets.indexOf(o) }; }
      else S.sbs = { key: p.x };
    }
    if (p.s) { S.aipSel = secFromToken(ds, p.s); var mm = /^(AD[23]\.\d+|AD):(\d+)$/.exec(S.aipSel || ''); if (mm) S.aipOpen['AD:' + mm[2]] = true; }
    renderDsSelect(); renderStateBtn(); initSearch();
    var opts = {};
    if (p.v === 'map' && p.m) { var q = p.m.split(','); opts.center = [+q[0], +q[1], +q[2]]; }
    go(p.v && p.v !== 'files' && p.v !== 'library' ? p.v : 'dash', opts);
    if (opts.center) setTimeout(function () { MAPVIEW.leaflet().setView([opts.center[0], opts.center[1]], opts.center[2], { animate: false }); }, 60);
    return true;
  }
  // a link opened before its file is loaded waits for that file
  S.pendingHash = (function () { var p = parseHash(location.hash); return p.f ? p : null; })();
  function checkPending() {
    if (!S.pendingHash) return false;
    var f = S.pendingHash.f;
    if (applyParams(S.pendingHash)) { S.pendingHash = null; toast('Opened the linked view of ' + f); return true; }
    return false;
  }
  async function loadBookmarks() { try { return (await LIBRARY.setting('bookmarks')) || []; } catch (e) { return []; } }
  async function saveBookmarks(list) { try { await LIBRARY.setting('bookmarks', list); } catch (e) { toast('Could not save bookmarks in this browser.'); } }
  function linkFor(p) { return location.href.replace(/#.*$/, '') + toHash(p); }
  async function toggleBmPop() {
    var old = $('#bm-pop');
    if (old) { old.remove(); return; }
    var list = await loadBookmarks(), ds = dsOf();
    var pop = document.createElement('div');
    pop.className = 'state-pop bm-pop'; pop.id = 'bm-pop';
    var cur = ds ? viewParams() : null;
    var h = '<div class="sp-h">Current view</div>' + (ds ? '<div class="row" style="gap:6px;padding:4px 10px 8px;flex-wrap:wrap"><input class="inp" id="bm-name" style="flex:1;min-width:180px" value="' + esc(bmTitle(cur)) + '"><button class="btn small primary" data-bm="save">☆ Save</button><button class="btn small" data-bm="link">' + I.copy + ' Copy link</button></div>' +
      '<div class="muted" style="font-size:11.5px;padding:0 10px 6px">A link opens this page, section, cycle and map position. The receiver needs the same AIXM file (in the Library or loaded).</div>' : '<div class="muted" style="padding:6px 10px">Open a data set to save a view.</div>');
    h += '<div class="sp-h">Saved views (' + list.length + ')</div>' + (list.length ? list.map(function (b, i) {
      var loaded = S.datasets.some(function (d) { return d.name === b.p.f; });
      return '<div class="sp-i" data-bmo="' + i + '"><div style="min-width:0"><b>' + esc(b.title) + '</b><div class="muted" style="font-size:11.5px">' + esc(b.p.f) + (loaded ? '' : ' · not loaded') + ' · ' + esc(M.fmtDate(b.at)) + '</div></div><span class="sp"></span><button class="btn small ghost" data-bml="' + i + '" title="Copy link">' + I.copy + '</button><button class="btn small ghost" data-bmd="' + i + '" title="Delete">' + I.trash + '</button></div>';
    }).join('') : '<div class="muted" style="padding:6px 10px">No saved views yet.</div>');
    pop.innerHTML = h;
    pop.style.right = '100px';
    document.body.appendChild(pop);
    pop.addEventListener('click', async function (e) {
      var b = e.target.closest('[data-bm],[data-bmo],[data-bml],[data-bmd]');
      if (!b) return;
      e.stopPropagation();
      if (b.getAttribute('data-bm') === 'save') {
        var p = viewParams();
        list.unshift({ title: $('#bm-name').value || bmTitle(p), p: p, at: Date.now(), lib: ds.lib ? { state: ds.lib.state, path: ds.lib.path } : null });
        await saveBookmarks(list.slice(0, 200)); pop.remove(); toast('View saved — find it under ☆'); return;
      }
      if (b.getAttribute('data-bm') === 'link') { copyText(linkFor(viewParams())); return; }
      if (b.hasAttribute('data-bml')) { copyText(linkFor(list[+b.getAttribute('data-bml')].p)); return; }
      if (b.hasAttribute('data-bmd')) { list.splice(+b.getAttribute('data-bmd'), 1); await saveBookmarks(list); pop.remove(); toggleBmPop(); return; }
      var bm = list[+b.getAttribute('data-bmo')];
      pop.remove();
      openBookmark(bm);
    });
  }
  function bmTitle(p) {
    if (!p) return '';
    var names = { aip: 'AIP', map: 'Map', dash: 'Dashboard', changes: 'Changes', timeline: 'Timeline', compare: 'Compare', notam: 'NOTAM', quality: 'Quality', explorer: 'Explorer', export: 'Export' };
    var ds = dsOf();
    return (ds ? ds.state + ' · ' : '') + (p.s ? p.s.replace('@', ' ') : names[p.v] || p.v) + (p.c ? ' · AIRAC ' + p.c : ds && ds.airac ? ' · AIRAC ' + ds.airac.id : '') + (p.x ? ' · side by side' : '');
  }
  async function openBookmark(bm) {
    if (applyParams(bm.p)) return;
    // not loaded: open it from the library when possible
    if (bm.lib) {
      var st = libStates().filter(function (x) { return x.name === bm.lib.state; })[0], f = st && st.files.filter(function (x) { return x.path === bm.lib.path; })[0];
      if (f) { var ds = await openLibFile(st.name, f, { silent: true }); if (ds && applyParams(bm.p)) return; }
    }
    S.pendingHash = bm.p;
    toast('Load ' + bm.p.f + ' (Files or Library) — the saved view opens automatically.', 7000);
  }
  (function () {
    var ls = $('#lang-sel'), l = I18N.init();
    ls.value = l;
    ls.addEventListener('change', function () { I18N.set(ls.value); if (MAPVIEW.isMounted()) MAPVIEW.invalidate(); });
  })();
  $('#bm-btn').addEventListener('click', function (e) { e.stopPropagation(); toggleBmPop(); });
  document.addEventListener('click', function (e) { var p = $('#bm-pop'); if (p && !e.target.closest('#bm-pop') && !e.target.closest('#bm-btn')) p.remove(); });
  window.addEventListener('hashchange', function () { var p = parseHash(location.hash); if (p.f) { var cur = viewParams(); if (toHash(cur) !== toHash(p) && !applyParams(p)) S.pendingHash = p; } });

  /* ------------------------------------------------------------- as of */
  $('#asof-mode').addEventListener('change', function (e) {
    var d = $('#asof-date');
    if (e.target.value === 'latest') { d.classList.add('hidden'); setAsOf(null); }
    else { d.classList.remove('hidden'); if (!d.value) d.value = new Date().toISOString().slice(0, 10); setAsOf(Date.parse(d.value + 'T00:00:00Z')); }
  });
  $('#asof-date').addEventListener('change', function (e) { if (e.target.value) setAsOf(Date.parse(e.target.value + 'T00:00:00Z')); });
  function setAsOf(t) {
    S.asOf = t;
    S.datasets.forEach(function (ds) { M.setViewDate(ds, t); ds.catalogue = null; ds.searchIdx = null; });
    toast(t === null ? 'Showing the latest data of each feature' : 'Showing data valid on ' + M.fmtDate(t));
    if (S.datasets.length) go(S.view);
  }

  /* ====================================================== DASHBOARD */
  var TILE_TYPES = [
    ['AirportHeliport', 'Aerodromes / heliports'], ['Runway', 'Runways'], ['Navaid', 'Navaids'], ['VOR', 'VOR'], ['DME', 'DME'], ['NDB', 'NDB'],
    ['DesignatedPoint', 'Designated points'], ['Airspace', 'Airspaces'], ['Route', 'ATS routes'], ['RouteSegment', 'Route segments'],
    ['VerticalStructure', 'Obstacles'], ['Unit', 'ATS units'], ['RadioCommunicationChannel', 'Frequencies'], ['InstrumentApproachProcedure', 'Approach procedures'],
    ['StandardInstrumentDeparture', 'SIDs'], ['StandardInstrumentArrival', 'STARs']
  ];
  function viewDash(v) {
    if (!S.datasets.length) { v.innerHTML = emptyState('No data yet', 'Open the Files view and extract an AIXM file.'); return; }
    v.innerHTML = '<h1 class="view-title">Dashboard</h1><p class="view-sub">' + S.datasets.length + ' data set(s) extracted. Click a tile or an aerodrome to open it.</p><div class="ds-grid" id="ds-grid"></div>';
    var g = $('#ds-grid', v);
    S.datasets.forEach(function (ds, idx) {
      var nTs = ds.recs.filter(function (r) { return r.ts.length > 1 || r.chg; }).length;
      var ads = (ds.byType.AirportHeliport || []).slice().sort(function (a, b) { return M.shortName(a) < M.shortName(b) ? -1 : 1; });
      var card = document.createElement('div');
      card.className = 'card ds-card';
      card.innerHTML = '<div class="ds-head"><div><div class="state">' + esc(ds.state) + '</div><div class="meta">' + esc(ds.name) + ' · ' + fmtSize(ds.size) + ' · state from ' + esc(ds.stateSource) + '</div></div>' +
        '<div class="kpis"><div class="kpi-h"><b>' + esc((ds.sniff.versionLabel || '').replace('AIXM ', '')) + '</b><span>AIXM version</span></div>' +
        '<div class="kpi-h"><b>' + (ds.airac ? ds.airac.id : '—') + '</b><span>AIRAC cycle' + (ds.airac ? ' · ' + M.fmtDate(ds.airac.date) : '') + '</span></div>' +
        '<div class="kpi-h"><b>' + (ds.effective !== null ? M.fmtDate(ds.effective) : '—') + '</b><span title="' + esc(ds.effectiveSource) + '">Effective date</span></div>' +
        '<div class="kpi-h"><b>' + num(ds.recs.length) + '</b><span>AIXM features</span></div></div></div>' +
        '<div class="tiles">' + TILE_TYPES.filter(function (t) { return (ds.byType[t[0]] || []).length; }).map(function (t) {
          return '<div class="tile" data-type="' + t[0] + '"><b>' + num(ds.byType[t[0]].length) + '</b><span>' + t[1] + '</span></div>';
        }).join('') + '<div class="tile" data-go="changes"><b>' + num(nTs) + '</b><span>features with changes / time slices</span></div>' +
        '<div class="tile" data-go="explorer"><b>' + Object.keys(ds.byType).length + '</b><span>feature types</span></div></div>' +
        cycleCardHtml(ds) +
        '<div class="ds-body"><div><h3 style="margin:4px 0 8px">Aerodromes and heliports <span class="muted" style="font-weight:400">(effective date of each AD)</span></h3>' +
        (ads.length ? '<div class="tbl-wrap" style="max-height:340px"><table class="mini-table"><thead><tr><th>ICAO</th><th>Name</th><th>Type</th><th>Effective</th><th>AIP</th></tr></thead><tbody>' + ads.map(function (a) {
          var eff = M.adEffective(ds, a);
          return '<tr class="click" data-ad="' + a.i + '"><td class="mono"><b>' + esc(M.shortName(a)) + '</b></td><td>' + esc(s(a.cur.p.name)) + '</td><td>' + esc(s(a.cur.p.type)) + '</td><td>' + M.fmtDate(eff) +
            '</td><td>' + (AIP.isHeliport(a) ? 'AD 3' : 'AD 2') + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="muted">No aerodromes in this data set.</div>') + '</div>' +
        '<div><h3 style="margin:4px 0 8px">Data set details</h3><table class="mini-table">' +
        [['AIXM version', ds.sniff.versionLabel], ['Namespace / root', (ds.sniff.namespace || '') + ' <' + ds.sniff.root + '>'], ['Effective date', ds.effective !== null ? M.fmtDate(ds.effective, true) + ' (' + ds.effectiveSource + ')' : '—'],
          ['AIRAC cycle', ds.airac ? ds.airac.id + ' — cycle start ' + M.fmtDate(ds.airac.date) + (ds.airac.exact ? ' (exact AIRAC date)' : ' (effective date falls inside this cycle)') : '—'],
          ['Data valid from', ds.dataFrom !== null ? M.fmtDate(ds.dataFrom) : '—'], ['Latest time slice start', ds.dataLatest !== null ? M.fmtDate(ds.dataLatest, true) : '—'],
          ['ICAO prefixes', (ds.prefixes || []).join(', ')], ['Created', ds.created || '—'], ['Read time', (ds.tRead / 1000).toFixed(2) + ' s · ' + (ds.size / 1048576 / (ds.tRead / 1000)).toFixed(1) + ' MB/s'], ['Memory mode', ds.lite ? 'Lite — light and marking elements are counted, not kept (open the AIXM code to see them)' : 'Full detail'],
          ['Parse warnings', ds.parseErrors ? ds.parseErrors.length : 0]].map(function (r) { return '<tr><td class="muted">' + r[0] + '</td><td>' + esc(r[1]) + '</td></tr>'; }).join('') + '</table>' +
        '<div class="btn-group" style="margin-top:12px"><button class="btn primary" data-act="aip">' + I.book + ' Open AIP</button><button class="btn" data-act="map">' + I.map + ' Map</button><button class="btn" data-act="export">' + I.export + ' Export</button><button class="btn" data-act="remove">' + I.trash + ' Remove</button></div></div></div>';
      card.addEventListener('click', function (e) {
        S.active = idx; renderDsSelect();
        var t = e.target.closest('[data-type]'), a = e.target.closest('[data-ad]'), gg = e.target.closest('[data-go]'), act = e.target.closest('[data-act]');
        if (t) { S.explorerType = t.getAttribute('data-type'); S.explorerSel = null; go('explorer'); }
        else if (a) { var ad = ds.recs[+a.getAttribute('data-ad')]; S.aipSel = 'AD:' + ad.i; S.aipOpen['AD:' + ad.i] = true; S.aipOpen.AD = true; go('aip'); }
        else if (gg) go(gg.getAttribute('data-go'));
        else if (e.target.closest('[data-chglist]')) openCycleList(ds);
        else if (e.target.closest('[data-prev]')) pickPrevious(ds, function () { go('dash'); });
        else if (e.target.closest('[data-hlaip]')) { S.hlOn = true; var first = getCyc(ds).list[0]; if (first) openAipFor(ds, first.rec); else go('aip'); }
        else if (act) {
          var k = act.getAttribute('data-act');
          if (k === 'aip') go('aip'); else if (k === 'map') go('map'); else if (k === 'export') go('export');
          else if (k === 'remove') { S.datasets.splice(idx, 1); S.active = 0; S.cmp = null; renderDsSelect(); renderNav(); initSearch(); go(S.datasets.length ? 'dash' : 'files'); }
        }
      });
      g.appendChild(card);
    });
  }
  function cycleCardHtml(ds) {
    var cc = getCyc(ds);
    if (!cc || !cc.cycle) return '';
    var top = cc.list.slice(0, 6).map(function (x) {
      var n = 0; x.e.props.forEach(function (l) { n += l.length; });
      return '<li><b>' + esc(x.sec.no + (x.sec.ad ? ' ' + M.shortName(x.sec.ad) : '')) + '</b> · ' + esc(M.label(ds, x.rec)) + ' <span class="muted">(' + (x.e.added ? 'new' : n + ' value(s)') + ')</span></li>';
    }).join('');
    return '<div style="padding:0 20px 14px"><div class="cycle-bar" style="display:block"><div class="row wrap"><b style="font-size:15px">Changes in AIRAC ' + esc(cc.cycle.id) + ' — effective ' + esc(M.fmtDate(cc.cycle.date)) + '</b>' +
      '<span class="chg-badge">' + cc.count + ' changed feature(s)</span><span class="sp"></span>' +
      (cc.count ? '<button class="btn small primary" data-hlaip="1">Show in AIP (red = changed)</button><button class="btn small" data-chglist="1">List all changes</button>' : '') +
      (!ds.prevCmp && S.datasets.length > 1 ? '<button class="btn small" data-prev="1">Compare with previous cycle</button>' : '') + '</div>' +
      (cc.count ? '<ul style="margin:8px 0 0 18px;padding:0">' + top + (cc.count > 6 ? '<li class="muted">… and ' + (cc.count - 6) + ' more</li>' : '') + '</ul>' :
        '<div style="margin-top:6px">No time slice in this file starts in this cycle' + (ds.prevCmp ? ' and nothing differs from ' + esc(ds.prevCmp.a.name) : '. To see every value that changes, add the previous cycle\'s file of this State and press "Compare with previous cycle".') + '</div>') +
      '<div class="muted" style="margin-top:6px;font-size:12px">Sources: ' + esc(cc.sources.join('; ') || 'none yet') + '</div></div></div>';
  }
  function emptyState(t, d) { return '<div class="empty">' + I.plane + '<h2>' + t + '</h2><p>' + d + '</p></div>'; }

  /* ========================================================== AIP VIEW */
  function viewAip(v, opts) {
    var ds = dsOf();
    if (!ds) { v.innerHTML = emptyState('No data', 'Extract a file first.'); return; }
    var cat = ds.catalogue || (ds.catalogue = AIP.catalogue(ds));
    if (!S.aipSel) {
      var firstAd = cat[2].children.filter(function (x) { return x.ad; })[0];
      S.aipSel = firstAd ? firstAd.children[1].id : (cat[1].children[0] || cat[0].children[0] || {}).id;
      if (firstAd) { S.aipOpen[firstAd.id] = true; S.aipOpen.AD = true; }
    }
    v.innerHTML = '<div class="split"><div class="side" id="aip-side"></div><div class="content" id="aip-content"></div></div>';
    renderTree(ds, cat);
    renderSection(ds, S.aipSel, opts.flash);
  }
  function renderTree(ds, cat) {
    var side = $('#aip-side');
    var bs = S.hlOn ? (getCyc(ds) || {}).bySection || {} : {};
    function bdg(id) { return bs[id] ? '<span class="cbadge" title="' + bs[id] + ' feature(s) change in this AIRAC cycle">' + bs[id] + '</span>' : ''; }
    var h = '<div class="side-head"><input class="inp grow" id="tree-filter" placeholder="Filter sections / aerodromes"></div><ul class="tree">';
    cat.forEach(function (g) {
      var open = S.aipOpen[g.id] !== false;
      h += '<li class="grp"><div class="node' + (open ? ' open' : '') + '" data-toggle="' + g.id + '">' + I.caret + '<span class="title">' + esc(g.title) + '</span><span class="sp"></span>' + bdg(g.id === 'AD' ? 'AD ' : g.id) + '<span class="chip">' + g.children.length + '</span></div>';
      if (open) {
        h += '<ul>';
        if (!g.children.length) h += '<li><div class="node muted">No data in this part</div></li>';
        g.children.forEach(function (c) {
          if (c.children) {
            var o = !!S.aipOpen[c.id];
            h += '<li data-f="' + esc((c.no + ' ' + c.title).toLowerCase()) + '"><div class="node' + (o ? ' open' : '') + (S.aipSel === c.id ? ' active' : '') + '" data-sec="' + c.id + '" data-toggle="' + c.id + '">' + I.caret + '<span class="no">' + esc(c.no.replace(/^AD [23] /, '')) + '</span><span class="title">' + esc(c.title) + '</span>' + bdg(c.id) + '</div>';
            if (o) h += '<ul>' + c.children.map(function (cc) { return '<li><div class="node' + (S.aipSel === cc.id ? ' active' : '') + '" data-sec="' + cc.id + '"><span class="no">' + esc(cc.no) + '</span><span class="title">' + esc(cc.title) + '</span>' + bdg(cc.id) + '</div></li>'; }).join('') + '</ul>';
            h += '</li>';
          } else h += '<li data-f="' + esc((c.no + ' ' + c.title).toLowerCase()) + '"><div class="node' + (S.aipSel === c.id ? ' active' : '') + '" data-sec="' + c.id + '"><span class="no">' + esc(c.no) + '</span><span class="title">' + esc(c.title) + '</span>' + bdg(c.id) + '</div></li>';
        });
        h += '</ul>';
      }
      h += '</li>';
    });
    h += '</ul>';
    side.innerHTML = h;
    side.onclick = function (e) {
      var n = e.target.closest('.node');
      if (!n) return;
      var tg = n.getAttribute('data-toggle'), sec = n.getAttribute('data-sec');
      if (tg && (!sec || e.target.closest('.caret') || S.aipSel === sec)) { S.aipOpen[tg] = !(tg in S.aipOpen ? S.aipOpen[tg] : tg === 'GEN' || tg === 'ENR' || tg === 'AD'); if (tg === 'GEN' || tg === 'ENR' || tg === 'AD') S.aipOpen[tg] = !n.classList.contains('open'); renderTree(ds, cat); if (!sec) return; }
      if (sec) { S.aipSel = sec; if (tg) S.aipOpen[tg] = true; renderTree(ds, cat); renderSection(ds, sec); }
    };
    var tf = $('#tree-filter', side);
    tf.oninput = function () {
      var q = tf.value.toLowerCase();
      $$('li[data-f]', side).forEach(function (li) { li.style.display = !q || li.getAttribute('data-f').indexOf(q) >= 0 ? '' : 'none'; });
    };
  }
  var cellRegistry = [];
  /* ---------------------------------------------- cycle change highlighting */
  function getCyc(ds) {
    if (!ds) return null;
    var cyc = ds.hlCycle || ds.airac;
    var key = (cyc ? cyc.id : '') + '|' + (ds.prevCmp ? ds.prevCmp.a.name : '') + '|' + ds.viewDate;
    if (!ds.cyc || ds.cycKey !== key) { ds.cyc = ANALYSIS.cycleChanges(ds, cyc); ds.cycKey = key; }
    return ds.cyc;
  }
  function chgInfo(ds, r, p) {
    if (!S.hlOn || !ds || !r) return null;
    var cc = getCyc(ds), e = cc && cc.byRec.get(r);
    if (!e) return null;
    if (e.added) return { strong: true, lines: ['New in AIRAC ' + cc.cycle.id + ' (' + Array.from(e.kinds).join(', ') + ')'] };
    if (p && e.props.has(p)) return { strong: true, lines: e.props.get(p).map(function (f) { return ANALYSIS.prettyPath(f.path) + ': ' + (f.old !== undefined ? ANALYSIS.displayVal(ds, f.old) : '—') + '  →  ' + (f.neu !== undefined ? ANALYSIS.displayVal(ds, f.neu) : 'removed'); }) };
    if (!e.props.size && e.amended) return { strong: false, amended: true, lines: ['Amended in AIRAC ' + cc.cycle.id + ' (new baseline from ' + M.fmtDate(cc.cycle.date) + '). ' + (ds.prevCmp ? 'No value differs from ' + ds.prevCmp.a.name + '.' : 'Load the previous cycle\'s file (Compare with previous cycle) to see exactly which values changed.')] };
    return { strong: false, lines: ['Other properties of this feature change in AIRAC ' + cc.cycle.id + ': ' + Array.from(e.props.keys()).join(', ')] };
  }
  function cellHtml(c, ds) {
    if (!c || !c.t) return '<span class="nil">—</span>';
    var t = esc(c.t);
    if (!c.r) return t;
    var idx = cellRegistry.push({ ds: ds, r: c.r, p: c.p }) - 1;
    var ci = chgInfo(ds, c.r, c.p);
    var tip = (ci ? '⚠ CHANGE ' + ci.lines.join('\n') + '\n\n' : '') + (c.tip ? c.tip + '\n' : '') + M.typeName(c.r) + (c.p ? ' · ' + c.p : '') + ' · line ' + num(c.r.line) + '\nClick to view the AIXM code';
    return '<span class="src' + (ci ? (ci.strong ? ' chg' : ' chg-soft') : '') + '" data-cell="' + idx + '" title="' + esc(tip) + '">' + t + '</span>';
  }
  function rowChanged(ds, cells) { return S.hlOn && cells.some(function (c) { var ci = c && c.r && chgInfo(ds, c.r, c.p); return ci && (ci.strong || ci.amended); }); }
  function effOf(r) { return r && r.cur ? M.fmtTs(r.cur.b) : ''; }
  function sectionBodyHtml(ds, sec, rowLimit) {
    var h = '';
    (sec.blocks || []).forEach(function (b, bi) {
      if (b.title) h += '<div class="block-title">' + esc(b.title) + '</div>';
      if (b.kind === 'note') { h += '<div class="note-box">' + esc(b.text) + '</div>'; return; }
      if (b.kind === 'chart') { h += '<div class="chart-box">' + b.svg + '</div>'; return; } // generated SVG (profile.js)
      if (b.kind === 'kv') {
        h += '<table class="aip-kv"><tbody>' + b.rows.map(function (r) {
          var cells = r.cells.filter(function (c) { return c && c.t; });
          var src = cells.filter(function (c) { return c.r; })[0];
          return '<tr' + (rowChanged(ds, cells) ? ' class="chg-row"' : '') + '><td class="no">' + esc(r.no || '') + '</td><td class="lbl">' + esc(r.label) + '</td><td class="val">' +
            (cells.length ? cells.map(function (c) { return '<div class="vpart">' + cellHtml(c, ds) + '</div>'; }).join('') : '<span class="nil">NIL</span>') +
            (src ? '<div class="eff">Effective ' + esc(effOf(src.r)) + (src.r.ts.length > 1 ? ' · <span class="chip warn" style="height:18px">' + src.r.ts.length + ' time slices</span>' : '') + ' <span class="srcbtn" data-cell="' + (cellRegistry.push({ ds: ds, r: src.r, p: src.p }) - 1) + '" title="View AIXM code">&lt;/&gt;</span></div>' : '') + '</td></tr>';
        }).join('') + '</tbody></table>';
        return;
      }
      var limit = rowLimit || 400;
      var rows = b.rows.slice(0, limit);
      h += '<div class="tbl-wrap"><table class="aip" data-block="' + bi + '"><thead><tr>' + b.cols.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') + '<th>Effective</th><th></th></tr></thead><tbody>' +
        rowsHtml(ds, rows) + '</tbody></table>' +
        (b.rows.length > limit ? '<div class="more-rows"><button class="btn small" data-more="' + bi + '" data-shown="' + limit + '">Show more (' + num(b.rows.length - limit) + ' more rows)</button></div>' : '') + '</div>';
      if (b.note) h += '<div class="muted" style="margin:6px 2px 0">Note: ' + esc(b.note) + '</div>';
      if (!b.rows.length) h = h.replace(/<\/tbody><\/table>(<div class="more-rows">.*?<\/div>)?<\/div>$/, '<tr><td colspan="' + (b.cols.length + 2) + '" class="nil">NIL</td></tr></tbody></table></div>');
    });
    return h;
  }
  function rowsHtml(ds, rows) {
    return rows.map(function (r) {
      var src = r.filter(function (c) { return c && c.r; })[0];
      var ptRow = r[0] && /^▲/.test(r[0].t);
      return '<tr' + (rowChanged(ds, r) ? ' class="chg-row"' : '') + '>' + r.map(function (c, i) { return '<td' + (ptRow && i === 0 ? ' class="pt"' : '') + '>' + cellHtml(c, ds) + '</td>'; }).join('') +
        '<td class="eff nowrap">' + (src ? esc(effOf(src.r)) + (src.r.ts.length > 1 ? '<br><span class="chip warn" style="height:18px">Δ ' + src.r.ts.length + '</span>' : '') : '') + '</td>' +
        '<td>' + (src ? '<span class="srcbtn" data-cell="' + (cellRegistry.push({ ds: ds, r: src.r, p: src.p }) - 1) + '" title="View AIXM code">&lt;/&gt;</span>' : '') + '</td></tr>';
    }).join('');
  }
  function cycleBarHtml(ds) {
    var cc = getCyc(ds);
    if (!cc || !cc.cycle) return '';
    var cycles = ANALYSIS.changeCycles(ds);
    var sel = '<select data-cyc="1" title="AIRAC cycle to check">' + cycles.map(function (c) {
      return '<option value="' + c.cycle.id + '"' + (c.cycle.id === cc.cycle.id ? ' selected' : '') + '>AIRAC ' + c.cycle.id + ' · ' + M.fmtDate(c.cycle.date) + (c.n ? ' · ' + c.n + ' in file' : '') + '</option>';
    }).join('') + '</select>';
    var prev = ds.prevCmp ? 'vs <b>' + esc(ds.prevCmp.a.name) + '</b>' : (S.datasets.length > 1 || (ds.lib && libPrevFile(ds)) ? '<button class="btn small" data-prev="1">Compare with previous cycle</button>' : '<span>load the previous cycle file to see every difference</span>');
    return '<div class="cycle-bar"><label class="chk"><input type="checkbox" data-hl="1"' + (S.hlOn ? ' checked' : '') + '> <b>Highlight changes</b></label> ' + sel +
      ' <span class="chg-badge">' + cc.count + ' changed feature(s)</span> ' + prev + ' <button class="btn small" data-chglist="1">List all changes</button></div>';
  }
  function handleCycleBar(e, ds, rerender) {
    var t = e.target;
    if (t.matches && t.matches('[data-hl]')) { S.hlOn = t.checked; rerender(); return true; }
    if (t.closest && t.closest('[data-chglist]')) { openCycleList(ds); return true; }
    if (t.closest && t.closest('[data-prev]')) { pickPrevious(ds, rerender); return true; }
    return false;
  }
  document.addEventListener('change', function (e) {
    if (!e.target.matches || !e.target.matches('[data-cyc]')) return;
    var ds = dsOf(); if (!ds) return;
    var c = ANALYSIS.changeCycles(ds).filter(function (x) { return x.cycle.id === e.target.value; })[0];
    if (c) { ds.hlCycle = c.cycle; ds.cyc = null; toast('Highlighting changes of AIRAC ' + c.cycle.id); if (S.view === 'aip') go('aip'); else if (S.view === 'dash') go('dash'); }
  });
  function drawerChgBox(ds, r) {
    var cc = getCyc(ds), e = cc && cc.byRec.get(r);
    if (!e) return '';
    var lines = [];
    if (e.added) lines.push('New feature in this cycle');
    e.props.forEach(function (l) { l.forEach(function (f) { lines.push(ANALYSIS.prettyPath(f.path) + ': ' + (f.old !== undefined ? ANALYSIS.displayVal(ds, f.old) : '—') + '  →  ' + (f.neu !== undefined ? ANALYSIS.displayVal(ds, f.neu) : 'removed')); }); });
    return '<div class="chg-box"><b>⚠ Changes in AIRAC ' + esc(cc.cycle.id) + ' (' + esc(M.fmtDate(cc.cycle.date)) + ')</b>' + lines.slice(0, 30).map(esc).join('<br>') + (lines.length > 30 ? '<br>… ' + (lines.length - 30) + ' more' : '') + '</div>';
  }
  function openCycleList(ds) {
    var cc = getCyc(ds);
    var back = document.createElement('div');
    back.className = 'modal-back';
    cellRegistry = cellRegistry || [];
    var rows = cc.list.map(function (x) {
      var idx = cellRegistry.push({ ds: ds, r: x.rec }) - 1;
      var f = [];
      if (x.e.added) f.push('<i>new feature</i>');
      x.e.props.forEach(function (l) { l.forEach(function (fd) { f.push('<span class="muted">' + esc(ANALYSIS.prettyPath(fd.path)) + ':</span> <span class="diff-old">' + esc(ANALYSIS.displayVal(ds, fd.old)) + '</span> → <span class="chg-badge">' + esc(fd.neu !== undefined ? ANALYSIS.displayVal(ds, fd.neu) : 'removed') + '</span>'); }); });
      return '<tr><td class="nowrap">' + esc(x.sec.no + (x.sec.ad ? ' ' + M.shortName(x.sec.ad) : '')) + '</td><td><a href="#" data-go="' + idx + '">' + esc(M.label(ds, x.rec)) + '</a><div class="muted" style="font-size:11.5px">' + esc(x.rec.k) + '</div></td><td>' + f.slice(0, 12).join('<br>') + (f.length > 12 ? '<br>…' : '') + '</td></tr>';
    }).join('');
    var rem = (cc.removed || []).map(function (it) { return '<tr><td>' + esc(it.sec.no) + '</td><td>' + esc(M.label(cc.removed && ds.prevCmp.a, it.a)) + '</td><td><span class="chip del">removed (not in this cycle)</span></td></tr>'; }).join('');
    back.innerHTML = '<div class="modal" style="width:min(1100px,100%)"><div class="modal-head"><h3>Changes in AIRAC ' + esc(cc.cycle.id) + ' — effective ' + esc(M.fmtDate(cc.cycle.date)) + '</h3><span class="sp"></span><button class="btn small primary" data-m="amdt">' + I.amdt + ' AMDT report</button><button class="btn small" data-m="pdf">' + I.pdf + ' PDF</button><button class="btn small" data-m="xlsx">' + I.xls + ' Excel</button><button class="btn small ghost" data-m="close">' + I.x + '</button></div>' +
      '<div class="modal-body cycle-list"><p class="muted">Sources: ' + esc(cc.sources.join('; ') || 'none') + '. Click a feature to open its AIP page with the changed values highlighted in red.</p>' +
      (rows || rem ? '<table class="aip"><thead><tr><th>AIP section</th><th>Feature</th><th>What changes (old → new)</th></tr></thead><tbody>' + rows + rem + '</tbody></table>' : '<div class="card card-pad">No changes found for this cycle. Load the previous cycle\'s file to compare every value.</div>') + '</div></div>';
    document.body.appendChild(back);
    back.addEventListener('click', function (e) {
      if (e.target === back) { back.remove(); return; }
      var g = e.target.closest('[data-go]');
      if (g) { e.preventDefault(); var reg = cellRegistry[+g.getAttribute('data-go')]; back.remove(); openAipFor(reg.ds, reg.r); return; }
      var m = e.target.closest('[data-m]');
      if (!m) return;
      var k = m.getAttribute('data-m');
      if (k === 'close') { back.remove(); return; }
      if (k === 'amdt') { back.remove(); openAmdt(ds, cc.cycle); return; }
      runExport(k, cycleScope(ds));
    });
  }
  function cycleScope(ds) {
    var cc = getCyc(ds), rows = [];
    cc.list.forEach(function (x) {
      var base = [AIP.C(x.sec.no + (x.sec.ad ? ' ' + M.shortName(x.sec.ad) : '')), AIP.C(M.label(ds, x.rec), x.rec), AIP.C(x.rec.k)];
      if (x.e.added) rows.push(base.concat([AIP.C('(new feature)'), AIP.C(''), AIP.C('')]));
      x.e.props.forEach(function (l) { l.forEach(function (f) { rows.push(base.concat([AIP.C(ANALYSIS.prettyPath(f.path)), AIP.C(ANALYSIS.displayVal(ds, f.old)), AIP.C(ANALYSIS.displayVal(ds, f.neu))])); }); });
    });
    return { title: 'Changes in AIRAC ' + cc.cycle.id + ' (' + M.fmtDate(cc.cycle.date) + ')', sub: ds.state + ' — ' + ds.name, ds: ds,
      sections: [{ no: 'AIRAC ' + cc.cycle.id, title: 'Data changing in this cycle', blocks: [{ kind: 'note', text: 'Sources: ' + cc.sources.join('; ') }, { kind: 'table', cols: ['AIP section', 'Feature', 'Type', 'Property', 'Old value', 'New value'], rows: rows }] }] };
  }
  async function pickPrevious(ds, rerender) {
    var lp = ds.lib && libPrevFile(ds);
    if (lp) {
      toast('Opening the previous cycle of ' + ds.lib.state + ': ' + lp.name + ' …');
      var prevDs = await openLibFile(ds.lib.state, lp, { silent: true });
      if (prevDs) {
        var res0 = await ANALYSIS.compare(prevDs, ds);
        ds.prevCmp = res0; ds.cyc = null; rerender();
        toast(res0.stats.added + ' added, ' + res0.stats.modified + ' modified, ' + res0.stats.removed + ' removed since ' + prevDs.name);
        return;
      }
    }
    var others = S.datasets.filter(function (d) { return d !== ds; });
    if (!others.length) { toast('Load the previous cycle file (Files or Library) to compare.'); return; }
    var same = others.filter(function (d) { return d.state === ds.state && (d.effective || 0) < (ds.effective || 0); }).sort(function (a, b) { return (b.effective || 0) - (a.effective || 0); });
    var prev = same[0] || others[0];
    toast('Comparing with ' + prev.name + ' …');
    ANALYSIS.compare(prev, ds).then(function (res) { ds.prevCmp = res; ds.cyc = null; rerender(); toast(res.stats.added + ' added, ' + res.stats.modified + ' modified, ' + res.stats.removed + ' removed since ' + prev.name); });
  }
  function renderSection(ds, id, flashRec) {
    var host = $('#aip-content');
    if (!host) return;
    cellRegistry = [];
    var item = AIP.findSection(ds, id);
    if (!item) { host.innerHTML = emptyState('Section not found', ''); return; }
    host.innerHTML = '<div class="empty"><span class="spinner"></span></div>';
    setTimeout(function () {
      var sec;
      try { sec = AIP.build(ds, item); } catch (err) { console.error(err); host.innerHTML = '<div class="sec-body"><div class="note-box">Could not build this section: ' + esc(err.message) + '</div></div>'; return; }
      var secs = EXPORTS.flatSections([sec]);
      var adRec = item.ad || (sec.ad) || null;
      var code = adRec ? M.shortName(adRec) : '';
      var effAll = null;
      secs.forEach(function (x) { (x.blocks || []).forEach(function (b) { (b.rows || []).forEach(function (r) { (r.cells || r).forEach(function (c) { if (c && c.r) { var t = AX.tms(c.r.cur.b); if (t !== null && (effAll === null || t > effAll)) effAll = t; } }); }); }); });
      var h = '<div class="sec-head"><div class="grow"><div class="crumbs">' + esc(ds.state) + ' · ' + esc(ds.name) + ' · ' + esc(ds.sniff.versionLabel) + (ds.airac ? ' · AIRAC ' + ds.airac.id : '') + '</div>' +
        '<h2>' + (code ? '<span class="code">' + esc(code) + '</span> ' : '') + esc(sec.group ? sec.title : (sec.no + ' ' + sec.title)) + '</h2>' +
        '<div class="eff">' + (effAll !== null ? 'Latest effective date in this section: <b>' + M.fmtDate(effAll, true) + '</b>' : '') + (ds.viewDate !== null && ds.viewDate !== undefined ? ' · data valid on ' + M.fmtDate(ds.viewDate) : ' · latest time slices') + '</div>' + cycleBarHtml(ds) + '</div>' +
        '<div class="btn-group">' + sbsSelectHtml(ds) + (adRec ? '<button class="btn small" data-x="map">' + I.map + ' Map</button>' : '') +
        '<button class="btn small" data-x="print">' + I.print + ' Print</button><button class="btn small" data-x="pdf">' + I.pdf + ' PDF</button><button class="btn small" data-x="xlsx">' + I.xls + ' Excel</button>' +
        '<button class="btn small" data-x="json">' + I.json + ' JSON</button><button class="btn small" data-x="mail">' + I.mail + ' E-mail</button></div></div><div class="sec-body">';
      var sbs = S.sbs ? sbsBuild(ds, item, sec) : null;
      if (sbs && sbs.err) { toast(sbs.err, 6000); S.sbs = null; sbs = null; }
      if (sbs) h += sbsHtml(sbs);
      else secs.forEach(function (x) {
        h += '<div class="aip-sec" data-secid="' + esc(x.id || '') + '">' + (secs.length > 1 ? '<h3><span class="no">' + esc(x.no) + '</span> ' + esc(x.title) + '</h3>' : '') + sectionBodyHtml(ds, x) + '</div>';
      });
      h += '</div>';
      host.innerHTML = h;
      if (sbs) sbsSync(host);
      updateHash();
      var sbsSel = $('[data-sbs]', host);
      if (sbsSel) sbsSel.onchange = function () { S.sbs = sbsSel.value ? { key: sbsSel.value } : null; if (S.sbs && S.sbs.key === 'lib') { sbsFromLibrary(ds); return; } renderSection(ds, S.aipSel); };
      host.scrollTop = 0;
      host.onclick = function (e) {
        var c = e.target.closest('[data-cell]');
        if (c) { var reg = cellRegistry[+c.getAttribute('data-cell')]; openXml(reg.ds, reg.r, reg.p); return; }
        var more = e.target.closest('[data-more]');
        if (more) {
          var bi = +more.getAttribute('data-more'), shown = +more.getAttribute('data-shown'), secEl = more.closest('.aip-sec');
          var sIdx = $$('.aip-sec', host).indexOf(secEl), blk = secs[sIdx].blocks[bi];
          var next = blk.rows.slice(shown, shown + 1000);
          $('table[data-block="' + bi + '"] tbody', secEl).insertAdjacentHTML('beforeend', rowsHtml(ds, next));
          shown += next.length;
          if (shown >= blk.rows.length) more.parentNode.remove(); else { more.setAttribute('data-shown', shown); more.textContent = 'Show more (' + num(blk.rows.length - shown) + ' more rows)'; }
          return;
        }
        if (handleCycleBar(e, ds, function () { renderTree(ds, ds.catalogue); renderSection(ds, S.aipSel); })) return;
        if (e.target.matches && e.target.matches('[data-sbs-only]')) { S.sbsOnly = e.target.checked; host.querySelector('.sbs').classList.toggle('only-diff', S.sbsOnly); sbsSync(host); return; }
        var sx = e.target.closest('[data-sbsx]');
        if (sx && sbs) { runExport(sx.getAttribute('data-sbsx'), REVIEW.sbsScope(ds, sbs.diff, sbs.labelL, sbs.labelR, 'Side by side: ' + (code ? code + ' ' : '') + (sec.group ? sec.title : sec.no + ' ' + sec.title))); return; }
        var x = e.target.closest('[data-x]');
        if (!x) return;
        var scope = { title: (code ? code + ' ' : '') + (sec.group ? sec.title : sec.no + ' ' + sec.title), sub: ds.state + ' — ' + ds.name, ds: ds, sections: [sec] };
        runExport(x.getAttribute('data-x'), scope, adRec);
      };
      if (flashRec) {
        var hit = cellRegistry.findIndex(function (r) { return r.r === flashRec; });
        if (hit >= 0) { var node = $('[data-cell="' + hit + '"]', host); if (node) { node.scrollIntoView({ block: 'center' }); node.style.background = 'var(--hl)'; setTimeout(function () { node.style.background = ''; }, 2500); } }
      }
    }, 10);
  }
  /* ------------------------------------------------ side-by-side AIP */
  function sbsSelectHtml(ds) {
    var o = ['<option value="">Single view</option>'];
    ANALYSIS.changeCycles(ds).forEach(function (c) { if (c.n) o.push('<option value="cyc:' + c.cycle.id + '">⇆ Before / from AIRAC ' + c.cycle.id + ' (' + M.fmtDate(c.cycle.date) + ')</option>'); });
    S.datasets.forEach(function (d, i) { if (d !== ds) o.push('<option value="ds:' + i + '">⇆ With ' + esc((d.state === ds.state ? '' : d.state + ' · ') + d.name + (d.airac ? ' · AIRAC ' + d.airac.id : '')) + '</option>'); });
    if (ds.lib && libPrevFile(ds) && !S.datasets.some(function (d) { return d.lib && d.lib.path === libPrevFile(ds).path; })) o.push('<option value="lib">⇆ With the previous cycle in the Library</option>');
    if (o.length < 2) return '';
    var cur = S.sbs ? S.sbs.key : '';
    return '<select class="inp small sbs-sel" data-sbs="1" title="Show this section side by side with another cycle">' + o.join('').replace('value="' + cur + '"', 'value="' + cur + '" selected') + '</select>';
  }
  async function sbsFromLibrary(ds) {
    var lp = libPrevFile(ds);
    toast('Opening ' + lp.name + ' from the Library…');
    var prev = await openLibFile(ds.lib.state, lp, { silent: true });
    if (!prev) { S.sbs = null; renderSection(ds, S.aipSel); return; }
    if (S.datasets.indexOf(prev) < 0) S.datasets.push(prev);
    S.active = S.datasets.indexOf(ds);
    S.sbs = { key: 'ds:' + S.datasets.indexOf(prev) };
    renderSection(ds, S.aipSel);
  }
  function mapSectionId(ds, other, id) {
    var m = /^(AD[23]\.\d+:|AD:)(\d+)$/.exec(id);
    if (!m) return id;
    var ad = ds.recs[+m[2]], code = ad && M.shortName(ad);
    var hit = (other.byType.AirportHeliport || []).filter(function (a) { return M.shortName(a) === code; })[0];
    return hit ? m[1] + hit.i : null;
  }
  function buildAt(ds, item, t) {
    var keep = ds.viewDate;
    M.setViewDate(ds, t);
    try { return AIP.build(ds, item); } finally { M.setViewDate(ds, keep); }
  }
  function sbsBuild(ds, item, sec) {
    var key = S.sbs.key, left, right, labelL, labelR, dsL = ds;
    try {
      if (key.indexOf('cyc:') === 0) {
        var c = ANALYSIS.changeCycles(ds).filter(function (x) { return x.cycle.id === key.slice(4); })[0];
        if (!c) return { err: 'That cycle has no changes in this file.' };
        left = buildAt(ds, item, c.cycle.date - 1); right = buildAt(ds, item, c.cycle.date);
        labelL = 'Before AIRAC ' + c.cycle.id + ' (valid ' + M.fmtDate(c.cycle.date - 86400000) + ')'; labelR = 'AIRAC ' + c.cycle.id + ' (from ' + M.fmtDate(c.cycle.date) + ')';
      } else if (key.indexOf('ds:') === 0) {
        var o = S.datasets[+key.slice(3)];
        if (!o || o === ds) return { err: 'The other data set is no longer loaded.' };
        var oid = mapSectionId(ds, o, item.id), oitem = oid && AIP.findSection(o, oid);
        left = oitem ? AIP.build(o, oitem) : { no: sec.no, title: sec.title, blocks: [{ kind: 'note', text: 'This section is not in ' + o.name + '.' }] };
        right = sec; dsL = o;
        var older = (o.effective || 0) <= (ds.effective || 0);
        labelL = o.name + (o.airac ? ' · AIRAC ' + o.airac.id : '') + (older ? '' : ' (newer)'); labelR = ds.name + (ds.airac ? ' · AIRAC ' + ds.airac.id : '');
      } else return null;
    } catch (err) { console.error(err); return { err: 'Side-by-side view failed: ' + err.message }; }
    return { diff: REVIEW.sbsDiff(left, right), labelL: labelL, labelR: labelR, dsL: dsL, dsR: ds };
  }
  function sbsCell(c, ds, chg, side) {
    if (!c || !c.t) return '<span class="nil">—</span>';
    var cls = chg ? (side === 'r' ? ' sbs-new' : ' sbs-old') : '';
    if (!c.r) return cls ? '<span class="' + cls.trim() + '">' + esc(c.t) + '</span>' : esc(c.t);
    var idx = cellRegistry.push({ ds: ds, r: c.r, p: c.p }) - 1;
    return '<span class="src' + cls + '" data-cell="' + idx + '" title="' + esc((chg ? (side === 'r' ? 'CHANGED — new value\n' : 'CHANGED — old value\n') : '') + M.typeName(c.r) + (c.p ? ' · ' + c.p : '') + ' · line ' + num(c.r.line) + '\nClick to view the AIXM code') + '">' + esc(c.t) + '</span>';
  }
  function sbsSide(sb, side) {
    var ds = side === 'l' ? sb.dsL : sb.dsR, h = '';
    sb.diff.pairs.forEach(function (p, pi) {
      if (sb.diff.pairs.length > 1) h += '<h3 data-pr="' + pi + ':h"><span class="no">' + esc(p.no) + '</span> ' + esc(p.title) + '</h3>';
      p.blocks.forEach(function (b, bi) {
        var k = pi + ':' + bi;
        if (b.title) h += '<div class="block-title" data-pr="' + k + ':t">' + esc(b.title) + '</div>';
        if (b.kind === 'note') { var tx = side === 'l' ? b.textL : b.textR; h += '<div class="note-box' + (b.st === 'chg' ? (side === 'r' ? ' sbs-rowchg' : '') : '') + '" data-pr="' + k + ':n">' + esc(tx || '—') + '</div>'; return; }
        var rows = b.rows.slice(0, 1500);
        if (b.kind === 'kv') {
          h += '<table class="aip-kv"><tbody>' + rows.map(function (r, ri) {
            var row = r[side], st = r.st, attr = ' data-pr="' + k + ':' + ri + '" class="sbs-' + st + '"';
            if (!row) return '<tr' + attr + '><td colspan="3" class="sbs-missing">' + (st === 'add' ? 'not in this version' : 'removed') + '</td></tr>';
            var cells = row.cells, parts = cells.map(function (c, ci) { return c && c.t ? '<div class="vpart">' + sbsCell(c, ds, st === 'chg' && r.cols.indexOf(ci) >= 0 || st === 'add' && side === 'r', side) + '</div>' : ''; }).join('');
            return '<tr' + attr + '><td class="no">' + esc(row.no || '') + '</td><td class="lbl">' + esc(row.label) + '</td><td class="val">' + (parts || '<span class="nil">NIL</span>') + '</td></tr>';
          }).join('') + '</tbody></table>';
          return;
        }
        var bb = b.br || b.bl;
        h += '<div class="tbl-wrap"><table class="aip"><thead><tr data-pr="' + k + ':th">' + (bb.cols || []).map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.map(function (r, ri) {
          var row = r[side], st = r.st, attr = ' data-pr="' + k + ':' + ri + '" class="sbs-' + st + '"';
          if (!row) return '<tr' + attr + '><td colspan="' + (bb.cols || []).length + '" class="sbs-missing">' + (st === 'add' ? 'not in this version' : 'removed') + '</td></tr>';
          return '<tr' + attr + '>' + row.map(function (c, ci) { return '<td>' + sbsCell(c, ds, st === 'chg' && r.cols.indexOf(ci) >= 0 || st === 'add' && side === 'r', side) + '</td>'; }).join('') + '</tr>';
        }).join('') + (b.rows.length ? '' : '<tr data-pr="' + k + ':0"><td colspan="' + (bb.cols || []).length + '" class="nil">NIL</td></tr>') + '</tbody></table></div>' +
          (b.rows.length > 1500 ? '<div class="muted" data-pr="' + k + ':m">Showing 1,500 of ' + num(b.rows.length) + ' rows — export for all differences.</div>' : '');
      });
    });
    return h;
  }
  function sbsHtml(sb) {
    var st = sb.diff.stats, none = !st.cells && !st.add && !st.del;
    return '<div class="sbs-bar"><b>' + I.sbs + ' Side by side</b> <span class="chg-badge">' + num(st.cells) + ' changed value(s)</span> <span class="chip add">' + num(st.add) + ' row(s) added</span> <span class="chip del">' + num(st.del) + ' removed</span>' +
      (none ? ' <span class="muted">— identical</span>' : '') + '<label class="chk"><input type="checkbox" data-sbs-only="1"' + (S.sbsOnly ? ' checked' : '') + '> Only differences</label><span class="sp"></span>' +
      '<button class="btn small" data-sbsx="pdf">' + I.pdf + ' Differences PDF</button><button class="btn small" data-sbsx="xlsx">' + I.xls + ' Excel</button><button class="btn small" data-sbsx="mail">' + I.mail + ' E-mail</button></div>' +
      '<div class="sbs' + (S.sbsOnly ? ' only-diff' : '') + '"><div class="sbs-col"><div class="sbs-head old">' + esc(sb.labelL) + '</div>' + sbsSide(sb, 'l') + '</div><div class="sbs-col"><div class="sbs-head new">' + esc(sb.labelR) + '</div>' + sbsSide(sb, 'r') + '</div></div>';
  }
  function sbsSync(host) {
    var cols = host.querySelectorAll('.sbs-col');
    if (cols.length !== 2) return;
    var L = {}, R = [];
    cols[0].querySelectorAll('[data-pr]').forEach(function (n) { n.style.height = ''; L[n.getAttribute('data-pr')] = n; });
    cols[1].querySelectorAll('[data-pr]').forEach(function (n) { n.style.height = ''; R.push(n); });
    var pairs = R.map(function (r) { var l = L[r.getAttribute('data-pr')]; return l ? [l, r, Math.max(l.getBoundingClientRect().height, r.getBoundingClientRect().height)] : null; }).filter(Boolean);
    pairs.forEach(function (x) { if (x[2]) { x[0].style.height = x[2] + 'px'; x[1].style.height = x[2] + 'px'; } });
  }

  function runExport(kind, scope, adRec) {
    try {
      if (kind === 'map' && adRec) { var sn = scope.sections && scope.sections[0] && scope.sections[0].no || ''; go('map', /2\.2[24]$|3\.2[23]$/.test(sn) ? { ds: scope.ds, procs: adRec } : { ds: scope.ds, focus: adRec }); return; }
      if ((kind === 'pdf' || kind === 'print') && adRec && !scope.mapImage) {
        var sno = scope.sections && scope.sections[0] && scope.sections[0].no || '', withProcs = /2\.2[24]$|3\.2[23]$/.test(sno);
        var b = MAPVIEW.boundsAround(scope.ds, adRec, withProcs ? 30 : 12);
        if (b) scope.mapImage = MAPVIEW.renderImage(scope.ds, b, 1600, 990, { title: M.label(scope.ds, adRec) + (withProcs ? ' — instrument procedures' : ''), procAd: withProcs ? adRec : null });
      }
      if (kind === 'print') EXPORTS.print(scope);
      else if (kind === 'pdf') { toast('Creating PDF…'); setTimeout(function () { EXPORTS.exportPDF(scope); }, 30); }
      else if (kind === 'xlsx') { toast('Creating Excel workbook…'); setTimeout(function () { EXPORTS.exportExcel(scope); }, 30); }
      else if (kind === 'json') EXPORTS.exportJSON(scope);
      else if (kind === 'mail') openEmail(scope);
    } catch (err) { console.error(err); toast('Export failed: ' + err.message, 7000); }
  }

  /* ========================================================= XML drawer */
  var drawer = $('#drawer');
  function closeDrawer() { drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeDrawer(); closeSearch(); var mb = $('.modal-back'); if (mb) mb.remove(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#search').focus(); }
  });
  function highlightXml(txt) {
    return esc(txt).replace(/(&lt;!--[\s\S]*?--&gt;)|(&lt;\/?)([\w:.-]+)((?:\s+[\w:.-]+=(?:&quot;[^&]*?&quot;|'[^']*?'))*)(\s*\/?&gt;)/g, function (m, com, open, name, attrs, close) {
      if (com) return '<span class="x-c">' + com + '</span>';
      var a = (attrs || '').replace(/([\w:.-]+)=(&quot;.*?&quot;|'.*?')/g, '<span class="x-a">$1</span>=<span class="x-v">$2</span>');
      return '<span class="x-t">' + open + name + '</span>' + a + '<span class="x-t">' + close + '</span>';
    });
  }
  function occList(r) { return r.occ || [{ o: r.o, n: r.n, line: r.line }]; }
  async function readFragment(ds, occ) {
    var buf = await ds.file.slice(occ.o, occ.o + occ.n).arrayBuffer();
    return new TextDecoder('utf-8').decode(buf);
  }
  async function openXml(ds, r, prop, occIdx) {
    if (r.k === '#error') { toast('This fragment could not be parsed.'); }
    var occs = occList(r), oi = occIdx || 0;
    if (r.cur && r.cur.idx !== undefined && r.ts[r.cur.idx] && r.ts[r.cur.idx].occ !== undefined && occIdx === undefined) oi = r.ts[r.cur.idx].occ || 0;
    var occ = occs[oi];
    drawer.innerHTML = '<div class="drawer-head"><div class="grow"><div class="muted" style="font-size:12px">' + esc(M.typeName(r)) + ' · ' + esc(AIP.sectionOf(ds, r).no) + '</div><h3>' + esc(M.label(ds, r)) + '</h3></div>' +
      '<button class="btn small" id="dx-copy">' + I.copy + ' Copy XML</button><button class="btn small" id="dx-dl">' + I.export + ' Save</button><button class="btn small" id="dx-detail">' + I.list + ' All data</button><button class="btn small ghost" id="dx-close">' + I.x + '</button></div>' +
      '<div class="loc-grid"><b>File</b><span>' + esc(ds.name) + '</span><b>Location</b><span>line ' + num(occ.line) + ' · byte offset ' + num(occ.o) + ' · length ' + num(occ.n) + ' bytes</span>' +
      '<b>Feature</b><span class="mono">' + esc(r.s45 ? r.s45 + ' (AIXM 4.5) → ' + r.k : r.k) + ' ' + esc(r.id || '') + '</span>' +
      (prop ? '<b>Property</b><span class="mono">' + esc(prop) + (M.propDef(r.k, prop) && M.propDef(r.k, prop).d ? ' — ' + esc(M.propDef(r.k, prop).d) : '') + '</span>' : '') +
      '<b>Validity</b><span>' + esc(tsSummary(r)) + '</span></div>' + drawerChgBox(ds, r) +
      (occs.length > 1 ? '<div class="drawer-tabs">' + occs.map(function (o, i) { return '<button data-occ="' + i + '" class="' + (i === oi ? 'active' : '') + '">Part ' + (i + 1) + ' · line ' + num(o.line) + '</button>'; }).join('') + '</div>' : '') +
      '<div class="drawer-body"><div class="empty"><span class="spinner"></span></div></div>';
    drawer.classList.add('open'); drawer.setAttribute('aria-hidden', 'false');
    $('#dx-close').onclick = closeDrawer;
    $('#dx-detail').onclick = function () { openDetail(ds, r); };
    $$('[data-occ]', drawer).forEach(function (b) { b.onclick = function () { openXml(ds, r, prop, +b.getAttribute('data-occ')); }; });
    var txt;
    try { txt = await readFragment(ds, occ); } catch (err) { $('.drawer-body', drawer).innerHTML = '<div class="note-box">Cannot read the file: ' + esc(err.message) + '</div>'; return; }
    var lines = txt.split('\n'), hl = new Set();
    if (prop) {
      var re = new RegExp('<([\\w.-]+:)?' + prop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s>/]');
      var depth = 0, inProp = false, tag = null;
      for (var i = 0; i < lines.length; i++) {
        if (!inProp && re.test(lines[i])) {
          inProp = true; var m = /<([\w.-]+:)?[\w.-]+/.exec(lines[i].slice(lines[i].search(re)));
          tag = m ? m[0].slice(1) : prop; depth = 0;
        }
        if (inProp) {
          hl.add(i);
          var opens = (lines[i].match(new RegExp('<' + tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s>]', 'g')) || []).length;
          var selfc = new RegExp('<' + tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^>]*/>').test(lines[i]);
          var closes = (lines[i].match(new RegExp('</' + tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '>', 'g')) || []).length;
          depth += opens - closes - (selfc ? 1 : 0);
          if (depth <= 0) { inProp = false; if (hl.size > 400) break; }
        }
      }
    }
    var first = -1;
    var html = lines.map(function (l, i) { if (hl.has(i) && first < 0) first = i; return '<span class="ln' + (hl.has(i) ? ' hl' : '') + '" data-n="' + (occ.line + i) + '">' + highlightXml(l) + '</span>'; }).join('');
    $('.drawer-body', drawer).innerHTML = '<pre class="xml">' + html + '</pre>';
    if (first > 0) { var n = $$('.ln', drawer)[first]; if (n) n.scrollIntoView({ block: 'center' }); }
    $('#dx-copy').onclick = function () { EXPORTS.copyText(txt).then(function (ok) { toast(ok ? 'AIXM XML copied to the clipboard' : 'Copy failed — select the text manually'); }); };
    $('#dx-dl').onclick = function () { EXPORTS.download(EXPORTS.safeName(M.label(ds, r)) + '.xml', new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n<!-- extracted from ' + ds.name + ', line ' + occ.line + ' -->\n' + txt], { type: 'text/xml' })); };
  }
  function tsSummary(r) {
    var c = r.cur;
    return (c.i || '') + (c.s ? ' #' + c.s : '') + (c.c ? '.' + c.c : '') + ' · from ' + (M.fmtTs(c.b) || '—') + (c.e ? ' to ' + M.fmtTs(c.e) : ' (no end)') + (r.ts.length > 1 ? ' · ' + r.ts.length + ' time slices in file' : '');
  }

  /* ---------------------------------------------------- detail drawer */
  function propLabel(k) { return k.replace(/^_/, '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/^./, function (c) { return c.toUpperCase(); }); }
  function propsHtml(ds, featureType, objType, p, depth) {
    if (!p || typeof p !== 'object') return esc(p);
    var h = '';
    Object.keys(p).forEach(function (k) {
      if (k === '_t' || k === '_na' || k === '_geo' && !p._geo) return;
      var v = p[k];
      var def = M.propDef(featureType, k, objType);
      if (k === '_geo') { h += '<div class="p-row"><div class="p-name">Geometry</div><div>' + esc(M.fv(ds, { _geo: v })) + (v.d ? '<div class="muted">' + esc(AIP.lateral ? '' : '') + '</div>' : '') + '</div></div>'; return; }
      var items = arr(v);
      var val = items.map(function (x) {
        if (x && typeof x === 'object' && x.ref === undefined && x.v === undefined && x.nil === undefined && depth < 5) {
          return '<div class="p-nest"><div class="muted" style="font-size:11.5px">' + esc(x._t || '') + (x._t && M.featureDef(x._t) ? ' — ' + esc(M.featureDef(x._t)).slice(0, 160) : '') + '</div>' + propsHtml(ds, null, x._t, x, depth + 1) + '</div>';
        }
        if (x && x.ref !== undefined) { var t = M.target(ds, x); return t ? '<a href="#" data-goto="' + t.i + '">' + esc(M.label(ds, t)) + '</a> <span class="muted">(' + esc(t.k) + ')</span>' : '<span class="muted">→ ' + esc(x.title || x.ref) + ' (not in file)</span>'; }
        var txt = M.fv(ds, x);
        var cd = typeof x === 'string' ? M.codeDef(featureType, k, x, objType) : '';
        return esc(txt) + (cd ? ' <span class="muted" style="font-size:12px">— ' + esc(cd) + '</span>' : '');
      }).join('');
      h += '<div class="p-row"><div class="p-name">' + esc(propLabel(k)) + (def && def.d ? '<small title="' + esc(def.d) + '">' + esc(def.d.length > 110 ? def.d.slice(0, 110) + '…' : def.d) + '</small>' : '') + '</div><div>' + val + '</div></div>';
    });
    return h;
  }
  function raw45Html(s45, o, depth) {
    var h = '';
    Object.keys(o || {}).forEach(function (k) {
      if (k === '@mid') return;
      var v = o[k], d = M.def45(s45, k);
      var items = arr(v).map(function (x) {
        if (x && typeof x === 'object') return '<div class="p-nest">' + raw45Html(s45, x, depth + 1) + '</div>';
        return esc(x);
      }).join('');
      h += '<div class="p-row"><div class="p-name">' + esc(k) + (d && d.d ? '<small>' + esc(d.d) + '</small>' : '') + '</div><div>' + items + '</div></div>';
    });
    return h;
  }
  function openDetail(ds, r, tab) {
    tab = tab || 'props';
    var sec = AIP.sectionOf(ds, r);
    var refsOut = r.refs || [], refsIn = ds.rev.get(r) || [];
    drawer.innerHTML = '<div class="drawer-head"><div class="grow"><div class="muted" style="font-size:12px">' + esc(M.typeName(r)) + ' · ' + esc(sec.no + (sec.ad ? ' ' + M.shortName(sec.ad) : '')) + '</div><h3>' + esc(M.label(ds, r)) + '</h3>' +
      '<div class="muted" style="font-size:12px;margin-top:3px">' + esc(M.featureDef(r.k).slice(0, 220)) + '</div></div>' +
      '<button class="btn small" id="dd-xml">' + I.code + ' AIXM</button>' + (sec.id ? '<button class="btn small" id="dd-aip">' + I.book + ' AIP</button>' : '') + '<button class="btn small" id="dd-map">' + I.map + ' Map</button><button class="btn small ghost" id="dd-close">' + I.x + '</button></div>' +
      '<div class="loc-grid"><b>Identifier</b><span class="mono">' + esc(r.id) + '</span><b>Validity</b><span>' + esc(tsSummary(r)) + '</span><b>Source</b><span>' + esc(ds.name) + ' · line ' + num(r.line) + '</span></div>' +
      '<div class="drawer-tabs"><button data-tab="props" class="' + (tab === 'props' ? 'active' : '') + '">Data</button>' + (r.raw ? '<button data-tab="raw" class="' + (tab === 'raw' ? 'active' : '') + '">AIXM 4.5 fields</button>' : '') +
      '<button data-tab="ts" class="' + (tab === 'ts' ? 'active' : '') + '">Time slices (' + r.ts.length + ')</button><button data-tab="refs" class="' + (tab === 'refs' ? 'active' : '') + '">References (' + refsOut.length + ' / ' + refsIn.length + ')</button></div>' +
      '<div class="drawer-body props" id="dd-body"></div>';
    var body = $('#dd-body', drawer);
    if (tab === 'props') body.innerHTML = propsHtml(ds, r.k, null, r.cur.p, 0) || '<div class="empty">No properties</div>';
    else if (tab === 'raw') body.innerHTML = raw45Html(r.s45, r.raw, 0);
    else if (tab === 'ts') {
      body.innerHTML = r.ts.map(function (t, i) {
        return '<div class="ts-item"><div class="row wrap"><span class="chip ' + (t.i === 'TEMPDELTA' ? 'warn' : t.i === 'PERMDELTA' ? 'info' : 'brand') + '">' + esc(t.i || 'SNAPSHOT') + '</span><b>#' + t.s + (t.c ? '.' + t.c : '') + '</b><span>' + esc(M.fmtTs(t.b)) + ' → ' + esc(t.e ? M.fmtTs(t.e) : 'no end') + '</span>' +
          (t.lb || t.le ? '<span class="muted">lifetime ' + esc(M.fmtTs(t.lb)) + ' → ' + esc(t.le ? M.fmtTs(t.le) : '…') + '</span>' : '') + (r.cur.idx === i ? '<span class="chip ok">shown</span>' : '') +
          '<span class="sp"></span><button class="btn small" data-tsxml="' + (t.occ || 0) + '">' + I.code + ' XML</button></div><div class="muted" style="font-size:12px;margin-top:4px">' + Object.keys(t.p).length + ' properties: ' + esc(Object.keys(t.p).slice(0, 14).join(', ')) + '</div></div>';
      }).join('');
    } else {
      var h = '<div class="ts-item"><b>This feature references</b></div>' + (refsOut.length ? refsOut.map(function (x) { return '<div class="p-row"><div class="p-name">' + esc(x[0]) + '</div><div><a href="#" data-goto="' + x[1].i + '">' + esc(M.label(ds, x[1])) + '</a> <span class="muted">(' + esc(x[1].k) + ')</span></div></div>'; }).join('') : '<div class="ts-item muted">none</div>');
      h += '<div class="ts-item"><b>Referenced by</b></div>' + (refsIn.length ? refsIn.slice(0, 500).map(function (x) { return '<div class="p-row"><div class="p-name">' + esc(x[1].k) + ' · ' + esc(x[0]) + '</div><div><a href="#" data-goto="' + x[1].i + '">' + esc(M.label(ds, x[1])) + '</a></div></div>'; }).join('') : '<div class="ts-item muted">none</div>');
      body.innerHTML = h;
    }
    drawer.classList.add('open'); drawer.setAttribute('aria-hidden', 'false');
    $('#dd-close').onclick = closeDrawer;
    $('#dd-xml').onclick = function () { openXml(ds, r); };
    if ($('#dd-aip')) $('#dd-aip').onclick = function () { closeDrawer(); openAipFor(ds, r); };
    $('#dd-map').onclick = function () { closeDrawer(); go('map', { ds: ds, focus: r }); };
    $$('[data-tab]', drawer).forEach(function (b) { b.onclick = function () { openDetail(ds, r, b.getAttribute('data-tab')); }; });
    $$('[data-tsxml]', drawer).forEach(function (b) { b.onclick = function () { openXml(ds, r, null, +b.getAttribute('data-tsxml')); }; });
    body.onclick = function (e) { var a = e.target.closest('[data-goto]'); if (a) { e.preventDefault(); openDetail(ds, ds.recs[+a.getAttribute('data-goto')]); } };
  }
  function openAipFor(ds, r) {
    var sec = AIP.sectionOf(ds, r);
    S.active = S.datasets.indexOf(ds); renderDsSelect();
    if (!sec.id) { openDetail(ds, r); return; }
    var cat = ds.catalogue || (ds.catalogue = AIP.catalogue(ds));
    var id = sec.id;
    if (!AIP.findSection(ds, id)) {
      var alt = cat.map(function (g) { return g.children; }).reduce(function (a, b) { return a.concat(b); }, []).filter(function (x) { return id.indexOf(x.id) === 0 || x.id.indexOf(id) === 0; })[0];
      if (!alt) { openDetail(ds, r); return; }
      id = alt.id;
    }
    S.aipSel = id;
    S.aipOpen.GEN = true; S.aipOpen.ENR = true; S.aipOpen.AD = true;
    if (sec.ad) S.aipOpen['AD:' + sec.ad.i] = true;
    go('aip', { flash: r });
  }

  /* ========================================================== ABOUT */
  function viewAbout(v) { v.innerHTML = ABOUT.html(); }
  document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('[data-about-page]')) go('about'); });

  /* ============================================================ MAP */
  // callbacks of the map (main window or the separate map window, see mapwindow.js)
  function mapHooks(inWindow) {
    var h = {
      toast: toast, openAip: openAipFor, openXml: function (ds, r) { openXml(ds, r); }, openDetail: function (ds, r) { openDetail(ds, r); },
      savePng: function (url) { fetch(url).then(function (res) { return res.blob(); }).then(function (b) { EXPORTS.download('aixm-map.png', b); }); },
      popout: popOutMap,
      dock: function () { go('map', { docked: true }); }
    };
    if (inWindow) delete h.popout; else delete h.dock;
    return h;
  }
  // map in its own window; this window goes to the AIP (or the dashboard) so data and map are side by side
  function popOutMap(ds, ad) {
    if (!MAPWIN.open(S.datasets, mapHooks(true), { ds: ds || dsOf(), cmp: S.cmp, focus: ad || null })) return;
    if (S.view === 'map') go(S.aipSel ? 'aip' : 'dash');
    toast('The map is open in its own window. "Show on map" now uses that window.', 5000);
  }
  function viewMap(v, opts) {
    if (!S.datasets.length) { v.innerHTML = emptyState('No data', 'Extract a file first.'); return; }
    MAPVIEW.mount(v, S.datasets, mapHooks(), { ds: opts.ds || dsOf(), cmp: S.cmp, procs: opts.procs });
    MAPVIEW.leaflet().on('moveend', updateHash);
    if (opts.focus) setTimeout(function () { MAPVIEW.focus(opts.ds || dsOf(), opts.focus); }, 250);
    if (opts.view3d) setTimeout(function () { MAPVIEW.open3d(opts.view3d.mode, opts.view3d.ad, opts.view3d); }, 300);
  }

  /* ========================================================= CHANGES */
  function viewChanges(v, opts) {
    var ds = dsOf();
    if (!ds) { v.innerHTML = emptyState('No data', ''); return; }
    var ev = S.changes.get(ds);
    if (!ev) { ev = ANALYSIS.inFileChanges(ds); S.changes.set(ds, ev); }
    var kinds = {};
    ev.forEach(function (e) { kinds[e.kind] = (kinds[e.kind] || 0) + 1; });
    var filt = opts.kind || '';
    v.innerHTML = '<h1 class="view-title">Changes inside the file</h1><p class="view-sub">Time slices tell <b>what</b> changes, <b>where</b> and <b>when</b> it becomes effective: new BASELINE versions, permanent deltas, temporary changes (TEMPDELTA) and withdrawals. ' +
      esc(ds.state) + ' · ' + esc(ds.name) + '. To compare two AIRAC files of the same State use <a href="#" id="go-cmp">Compare</a>.</p>' +
      '<div class="stat-row">' + ['Permanent change (new BASELINE)', 'Permanent change (PERMDELTA)', 'Temporary change (TEMPDELTA)', 'Correction', 'Feature withdrawn (end of life)', 'New feature', 'Changed (AIXM 4.5 update)', 'Withdrawn'].filter(function (k) { return kinds[k]; }).map(function (k) {
        return '<div class="card stat click" data-k="' + esc(k) + '" style="cursor:pointer' + (filt === k ? ';outline:2px solid var(--brand)' : '') + '"><b>' + num(kinds[k]) + '</b><span class="muted">' + esc(k) + '</span></div>';
      }).join('') + '<div class="card stat" data-k="" style="cursor:pointer"><b>' + num(ev.length) + '</b><span class="muted">all events</span></div></div>' +
      '<div class="toolbar"><input class="inp" id="ch-q" placeholder="Filter by feature, section, property…" style="min-width:320px"><select class="inp" id="ch-when"><option value="">Any date</option><option value="future">Effective in the future</option><option value="past">Already effective</option></select><span class="sp"></span>' +
      '<button class="btn small" id="ch-pdf">' + I.pdf + ' PDF</button><button class="btn small" id="ch-xlsx">' + I.xls + ' Excel</button><button class="btn small" id="ch-json">' + I.json + ' JSON</button><button class="btn small" id="ch-mail">' + I.mail + ' E-mail</button></div>' +
      '<div id="ch-list"></div>';
    $('#go-cmp', v).onclick = function (e) { e.preventDefault(); go('compare'); };
    $$('[data-k]', v).forEach(function (c) { c.onclick = function () { go('changes', { kind: c.getAttribute('data-k') }); }; });
    function current() {
      var q = $('#ch-q').value.toLowerCase(), when = $('#ch-when').value, now = Date.now();
      return ev.filter(function (e) {
        if (filt && e.kind !== filt) return false;
        if (when === 'future' && !(e.t > now)) return false;
        if (when === 'past' && e.t > now) return false;
        if (q) { var txt = (M.label(ds, e.rec) + ' ' + e.rec.k + ' ' + e.section.no + ' ' + e.fields.map(function (f) { return f.path; }).join(' ')).toLowerCase(); if (txt.indexOf(q) < 0) return false; }
        return true;
      });
    }
    function draw() {
      var list = current(), shown = Math.min(list.length, 300);
      $('#ch-list').innerHTML = !list.length ? '<div class="card card-pad muted">No changes found' + (ev.length ? ' for this filter.' : ' — every feature in this file has a single time slice (a pure baseline / snapshot). Use Compare to find differences between two files.') + '</div>' :
        '<div class="tbl-wrap"><table class="aip"><thead><tr><th>Effective from</th><th>Until</th><th>AIP section</th><th>Feature</th><th>Change</th><th>What changed (old → new)</th><th></th></tr></thead><tbody>' + list.slice(0, shown).map(changeRow).join('') + '</tbody></table>' +
        (list.length > shown ? '<div class="more-rows muted">Showing ' + shown + ' of ' + num(list.length) + ' — refine the filter or export to see all.</div>' : '') + '</div>';
    }
    function changeRow(e) {
      var f = e.fields.slice(0, 8).map(function (x) {
        return '<div><span class="muted">' + esc(ANALYSIS.prettyPath(x.path)) + ':</span> ' + (x.old !== undefined ? '<span class="diff-old">' + esc(ANALYSIS.displayVal(ds, x.old)) + '</span> ' : '') + '→ ' + (x.neu !== undefined ? '<span class="diff-new">' + esc(ANALYSIS.displayVal(ds, x.neu)) + '</span>' : '<i class="muted">removed</i>') + '</div>';
      }).join('') + (e.fields.length > 8 ? '<div class="muted">+ ' + (e.fields.length - 8) + ' more</div>' : '');
      var idx = cellRegistry.push({ ds: ds, r: e.rec, occ: e.rec.ts[e.tsIdx] ? e.rec.ts[e.tsIdx].occ : 0 }) - 1;
      return '<tr><td class="nowrap">' + esc(M.fmtTs(e.from)) + '</td><td class="nowrap">' + esc(e.to ? M.fmtTs(e.to) : '') + '</td><td class="nowrap">' + esc(e.section.no + (e.section.ad ? ' ' + M.shortName(e.section.ad) : '')) + '</td>' +
        '<td><a href="#" data-det="' + idx + '">' + esc(M.label(ds, e.rec)) + '</a><div class="muted" style="font-size:11.5px">' + esc(e.rec.k) + '</div></td><td><span class="chip ' + (/Temporary/.test(e.kind) ? 'warn' : /withdrawn|Withdrawn/.test(e.kind) ? 'del' : /New/.test(e.kind) ? 'add' : 'info') + '">' + esc(e.kind) + '</span></td><td>' + (f || '<span class="muted">—</span>') + '</td>' +
        '<td><span class="srcbtn" data-xml="' + idx + '" title="View AIXM code">&lt;/&gt;</span></td></tr>';
    }
    cellRegistry = [];
    draw();
    $('#ch-q').oninput = draw; $('#ch-when').onchange = draw;
    $('#ch-list').onclick = function (e) {
      var a = e.target.closest('[data-det]'), x = e.target.closest('[data-xml]');
      if (a) { e.preventDefault(); var r1 = cellRegistry[+a.getAttribute('data-det')]; openDetail(r1.ds, r1.r, 'ts'); }
      if (x) { var r2 = cellRegistry[+x.getAttribute('data-xml')]; openXml(r2.ds, r2.r, null, r2.occ); }
    };
    function scope() {
      var list = current();
      return { title: 'Changes in file' + (filt ? ' — ' + filt : ''), sub: ds.state + ' — ' + ds.name, ds: ds, sections: [{ no: 'CHANGES', title: 'Changes inside the AIXM file', blocks: [{ kind: 'table', cols: ['Effective from', 'Until', 'AIP section', 'Feature', 'Type', 'Change', 'Property', 'Old value', 'New value'],
        rows: [].concat.apply([], list.map(function (e) {
          var base = [AIP.C(M.fmtTs(e.from)), AIP.C(e.to ? M.fmtTs(e.to) : ''), AIP.C(e.section.no + (e.section.ad ? ' ' + M.shortName(e.section.ad) : '')), AIP.C(M.label(ds, e.rec), e.rec), AIP.C(e.rec.k), AIP.C(e.kind)];
          if (!e.fields.length) return [base.concat([AIP.C(''), AIP.C(''), AIP.C('')])];
          return e.fields.map(function (f) { return base.concat([AIP.C(ANALYSIS.prettyPath(f.path)), AIP.C(ANALYSIS.displayVal(ds, f.old)), AIP.C(ANALYSIS.displayVal(ds, f.neu))]); });
        })) }] }] };
    }
    $('#ch-pdf').onclick = function () { runExport('pdf', scope()); };
    $('#ch-xlsx').onclick = function () { runExport('xlsx', scope()); };
    $('#ch-json').onclick = function () { runExport('json', scope()); };
    $('#ch-mail').onclick = function () { runExport('mail', scope()); };
  }

  /* ========================================================= COMPARE */
  function viewCompare(v) {
    if (S.datasets.length < 2) {
      v.innerHTML = '<h1 class="view-title">Compare two AIP data sets</h1><p class="view-sub">Load two AIXM files of the <b>same State</b> (e.g. the previous and the new AIRAC cycle, any AIXM versions). The comparison lists added, removed and modified features with every changed value.</p>' +
        '<div class="card card-pad">' + (S.datasets.length ? 'Only one data set is loaded. <a href="#" id="add-more">Add another AIXM file</a> to compare.' : 'No data yet.') + '</div>';
      var am = $('#add-more', v); if (am) am.onclick = function (e) { e.preventDefault(); go('files'); };
      return;
    }
    var opt = S.datasets.map(function (d, i) { return '<option value="' + i + '">' + esc(d.state + ' · ' + d.name + (d.airac ? ' · AIRAC ' + d.airac.id : '')) + '</option>'; }).join('');
    var sorted = S.datasets.map(function (d, i) { return [d.effective || 0, i]; }).sort(function (a, b) { return a[0] - b[0]; });
    v.innerHTML = '<h1 class="view-title">Compare two AIP data sets</h1><p class="view-sub">Old = reference (e.g. current AIRAC), New = the file to check. Features are matched by UUID, or by their natural key (ICAO code, designator, …) when the files come from different systems or AIXM versions.</p>' +
      '<div class="card card-pad"><div class="row wrap" style="gap:14px"><label>Old / reference<br><select class="inp" id="cmp-a">' + opt + '</select></label><label>New<br><select class="inp" id="cmp-b">' + opt + '</select></label>' +
      '<button class="btn primary big" id="cmp-run" style="margin-top:18px">' + I.compare + ' Compare</button><span id="cmp-warn" class="muted" style="margin-top:18px"></span></div></div><div id="cmp-out" style="margin-top:16px"></div>';
    $('#cmp-a', v).value = String(S.cmp ? S.datasets.indexOf(S.cmp.a) : sorted[0][1]);
    $('#cmp-b', v).value = String(S.cmp ? S.datasets.indexOf(S.cmp.b) : sorted[sorted.length - 1][1]);
    function warn() {
      var a = S.datasets[+$('#cmp-a').value], b = S.datasets[+$('#cmp-b').value];
      var w = [];
      if (a === b) w.push('Choose two different files.');
      else if (a.state !== b.state) w.push('⚠ Different States detected (' + a.state + ' / ' + b.state + ') — the comparison will show everything as added/removed.');
      if (a.family !== b.family) w.push('Different AIXM families (4.5 vs 5.x): matching by natural keys.');
      $('#cmp-warn').innerHTML = esc(w.join(' '));
    }
    $('#cmp-a').onchange = warn; $('#cmp-b').onchange = warn; warn();
    $('#cmp-run').onclick = async function () {
      var a = S.datasets[+$('#cmp-a').value], b = S.datasets[+$('#cmp-b').value];
      if (a === b) { toast('Choose two different files'); return; }
      var out = $('#cmp-out');
      out.innerHTML = '<div class="card card-pad"><span class="spinner"></span> Comparing ' + num(a.recs.length) + ' and ' + num(b.recs.length) + ' features… <span id="cmp-p"></span><div class="progress"><div id="cmp-bar"></div></div></div>';
      S.cmp = await ANALYSIS.compare(a, b, function (f) { var bar = $('#cmp-bar'); if (bar) bar.style.width = (f * 100).toFixed(0) + '%'; });
      warn();
      MAPVIEW.setCompare(S.cmp);
      if ((b.effective || 0) >= (a.effective || 0)) { b.prevCmp = S.cmp; b.cyc = null; }
      drawCompare();
    };
    if (S.cmp) drawCompare();
  }
  function drawCompare(filter) {
    var res = S.cmp, out = $('#cmp-out');
    if (!res || !out) return;
    filter = filter || { kind: '', q: '' };
    var st = res.stats;
    var list = res.items.filter(function (it) {
      if (filter.kind && it.kind !== filter.kind) return false;
      if (filter.q) { var r = it.b || it.a, ds = it.b ? res.b : res.a; if ((M.label(ds, r) + ' ' + r.k + ' ' + it.sec.no).toLowerCase().indexOf(filter.q) < 0) return false; }
      return true;
    });
    cellRegistry = [];
    out.innerHTML = '<div class="stat-row">' +
      '<div class="card stat" data-kind="added" style="cursor:pointer"><b style="color:var(--added)">' + num(st.added) + '</b><span class="muted">added in new</span></div>' +
      '<div class="card stat" data-kind="removed" style="cursor:pointer"><b style="color:var(--removed)">' + num(st.removed) + '</b><span class="muted">removed</span></div>' +
      '<div class="card stat" data-kind="modified" style="cursor:pointer"><b style="color:var(--modified)">' + num(st.modified) + '</b><span class="muted">modified</span></div>' +
      '<div class="card stat" data-kind="" style="cursor:pointer"><b>' + num(st.unchanged) + '</b><span class="muted">unchanged</span></div>' +
      '<div class="card stat"><b style="font-size:14px">' + (res.useUuid ? 'UUID' : 'natural keys') + '</b><span class="muted">matching method</span></div></div>' +
      '<div class="toolbar"><input class="inp" id="cmp-q" placeholder="Filter by feature, type or AIP section…" style="min-width:320px" value="' + esc(filter.q) + '"><span class="chip">' + (filter.kind || 'all changes') + '</span><span class="sp"></span>' +
      '<button class="btn small primary" id="cmp-amdt" title="AIRAC AIP amendment report of the new file">' + I.amdt + ' AMDT report</button><button class="btn small" id="cmp-map">' + I.map + ' Show on map</button><button class="btn small" id="cmp-pdf">' + I.pdf + ' PDF</button><button class="btn small" id="cmp-xlsx">' + I.xls + ' Excel</button><button class="btn small" id="cmp-json">' + I.json + ' JSON</button><button class="btn small" id="cmp-mail">' + I.mail + ' E-mail</button></div>' +
      (list.length ? '<div class="tbl-wrap"><table class="aip"><thead><tr><th>AIP section</th><th>Feature</th><th>Change</th><th>Changed values (old → new)</th><th>Effective (new)</th><th>AIXM</th></tr></thead><tbody>' +
        list.slice(0, 500).map(function (it) {
          var r = it.b || it.a, ds = it.b ? res.b : res.a;
          var f = (it.fields || []).slice(0, 10).map(function (x) {
            return '<div><span class="muted">' + esc(ANALYSIS.prettyPath(x.path)) + ':</span> ' + (x.old !== undefined ? '<span class="diff-old">' + esc(ANALYSIS.displayVal(res.a, x.old)) + '</span> ' : '') + '→ ' + (x.neu !== undefined ? '<span class="diff-new">' + esc(ANALYSIS.displayVal(res.b, x.neu)) + '</span>' : '<i class="muted">removed</i>') + '</div>';
          }).join('') + ((it.fields || []).length > 10 ? '<div class="muted">+ ' + (it.fields.length - 10) + ' more</div>' : '');
          var ia = it.a ? cellRegistry.push({ ds: res.a, r: it.a }) - 1 : -1, ib = it.b ? cellRegistry.push({ ds: res.b, r: it.b }) - 1 : -1;
          return '<tr><td class="nowrap">' + esc(it.sec.no + (it.sec.ad ? ' ' + M.shortName(it.sec.ad) : '')) + '</td><td><a href="#" data-det="' + (ib >= 0 ? ib : ia) + '">' + esc(M.label(ds, r)) + '</a><div class="muted" style="font-size:11.5px">' + esc(r.k) + '</div></td>' +
            '<td><span class="chip ' + ({ added: 'add', removed: 'del', modified: 'mod' })[it.kind] + '">' + it.kind + '</span></td><td>' + (f || (it.kind === 'added' ? '<span class="muted">new feature</span>' : it.kind === 'removed' ? '<span class="muted">not in the new file</span>' : '')) + '</td>' +
            '<td class="nowrap">' + esc(it.b ? M.fmtTs(it.b.cur.b) : '') + '</td><td class="nowrap">' + (ia >= 0 ? '<span class="srcbtn" data-xml="' + ia + '" title="Old AIXM">A</span>' : '') + (ib >= 0 ? '<span class="srcbtn" data-xml="' + ib + '" title="New AIXM">B</span>' : '') + '</td></tr>';
        }).join('') + '</tbody></table>' + (list.length > 500 ? '<div class="more-rows muted">Showing 500 of ' + num(list.length) + ' — filter or export for the complete list.</div>' : '') + '</div>' : '<div class="card card-pad muted">No differences for this filter.</div>');
    $$('[data-kind]', out).forEach(function (c) { c.onclick = function () { drawCompare({ kind: c.getAttribute('data-kind'), q: filter.q }); }; });
    var q = $('#cmp-q'); q.oninput = function () { clearTimeout(q._t); q._t = setTimeout(function () { drawCompare({ kind: filter.kind, q: q.value.toLowerCase() }); var nq = $('#cmp-q'); nq.focus(); nq.setSelectionRange(nq.value.length, nq.value.length); }, 250); };
    out.onclick = function (e) {
      var a = e.target.closest('[data-det]'), x = e.target.closest('[data-xml]');
      if (a) { e.preventDefault(); var r1 = cellRegistry[+a.getAttribute('data-det')]; openDetail(r1.ds, r1.r); }
      if (x) { var r2 = cellRegistry[+x.getAttribute('data-xml')]; openXml(r2.ds, r2.r); }
    };
    function scope() {
      return { title: 'Comparison ' + res.a.name + ' → ' + res.b.name, sub: res.a.state + ' — ' + (res.a.airac ? 'AIRAC ' + res.a.airac.id : '') + ' vs ' + (res.b.airac ? 'AIRAC ' + res.b.airac.id : ''), ds: res.b,
        sections: [{ no: 'COMPARE', title: 'Differences between the two data sets', blocks: [{ kind: 'kv', rows: [
          { no: '', label: 'Old / reference file', cells: [AIP.C(res.a.name + ' (' + (res.a.sniff.versionLabel || '') + (res.a.airac ? ', AIRAC ' + res.a.airac.id : '') + ')')] },
          { no: '', label: 'New file', cells: [AIP.C(res.b.name + ' (' + (res.b.sniff.versionLabel || '') + (res.b.airac ? ', AIRAC ' + res.b.airac.id : '') + ')')] },
          { no: '', label: 'Summary', cells: [AIP.C(st.added + ' added, ' + st.removed + ' removed, ' + st.modified + ' modified, ' + st.unchanged + ' unchanged')] }] },
        { kind: 'table', cols: ['AIP section', 'Feature', 'Type', 'Change', 'Property', 'Old value', 'New value'], rows: [].concat.apply([], list.map(function (it) {
          var r = it.b || it.a, ds = it.b ? res.b : res.a;
          var base = [AIP.C(it.sec.no + (it.sec.ad ? ' ' + M.shortName(it.sec.ad) : '')), AIP.C(M.label(ds, r), r), AIP.C(r.k), AIP.C(it.kind)];
          if (!it.fields) return [base.concat([AIP.C(''), AIP.C(''), AIP.C('')])];
          return it.fields.map(function (x) { return base.concat([AIP.C(ANALYSIS.prettyPath(x.path)), AIP.C(ANALYSIS.displayVal(res.a, x.old)), AIP.C(ANALYSIS.displayVal(res.b, x.neu))]); });
        })) }] }] };
    }
    $('#cmp-map').onclick = function () { MAPVIEW.setCompare(res); go('map', { ds: res.b }); };
    $('#cmp-amdt').onclick = function () { res.b.prevCmp = res; res.b.cyc = null; openAmdt(res.b, res.b.airac); };
    $('#cmp-pdf').onclick = function () { runExport('pdf', scope()); };
    $('#cmp-xlsx').onclick = function () { runExport('xlsx', scope()); };
    $('#cmp-json').onclick = function () { runExport('json', scope()); };
    $('#cmp-mail').onclick = function () { runExport('mail', scope()); };
  }

  /* ====================================================== AMDT REPORT */
  function openAmdt(ds, cycle) {
    var cc = cycle ? ANALYSIS.cycleChanges(ds, cycle) : getCyc(ds);
    if (!cc || !cc.cycle) { toast('No AIRAC cycle for this data set.'); return; }
    var scope = REVIEW.amdtScope(ds, cc);
    var back = document.createElement('div');
    back.className = 'modal-back';
    cellRegistry = cellRegistry || [];
    var body = scope.sections.map(function (sec, i) {
      return '<div class="aip-sec amdt-sec"><h3><span class="no">' + esc(sec.no) + '</span> ' + esc(i ? sec.title : '') + '</h3>' + sectionBodyHtml(ds, sec, 2000) + '</div>';
    }).join('');
    back.innerHTML = '<div class="modal" style="width:min(1180px,100%)"><div class="modal-head"><h3>' + I.amdt + ' ' + esc(scope.title) + '</h3><span class="sp"></span>' +
      '<button class="btn small" data-m="print">' + I.print + ' Print</button><button class="btn small" data-m="pdf">' + I.pdf + ' PDF</button><button class="btn small" data-m="xlsx">' + I.xls + ' Excel</button><button class="btn small" data-m="json">' + I.json + ' JSON</button><button class="btn small" data-m="mail">' + I.mail + ' E-mail</button><button class="btn small ghost" data-m="close">' + I.x + '</button></div>' +
      '<div class="modal-body amdt-body"><div class="amdt-banner"><div><div class="muted">' + esc(ds.state) + '</div><div class="amdt-id">AIRAC AMDT ' + esc(cc.cycle.id) + '</div></div><div><div class="muted">Effective</div><b>' + esc(M.fmtDate(cc.cycle.date)) + '</b></div><div><div class="muted">Publish by</div><b>' + esc(M.fmtDate(scope.amdt.pub)) + '</b></div>' +
      ['GEN', 'ENR', 'AD'].map(function (k) { return '<div><div class="muted">' + k + '</div><b>' + scope.amdt.parts[k] + '</b></div>'; }).join('') + '</div>' +
      (ds.prevCmp ? '' : '<div class="note-box">Only changes recorded inside this file are listed. For a complete amendment, <a href="#" data-m="prev">compare with the previous cycle file</a>.</div>') + body + '</div></div>';
    document.body.appendChild(back);
    back.addEventListener('click', function (e) {
      if (e.target === back) { back.remove(); return; }
      var c = e.target.closest('[data-cell]');
      if (c) { var reg = cellRegistry[+c.getAttribute('data-cell')]; openXml(reg.ds, reg.r, reg.p); return; }
      var m = e.target.closest('[data-m]');
      if (!m) return;
      e.preventDefault();
      var k = m.getAttribute('data-m');
      if (k === 'close') { back.remove(); return; }
      if (k === 'prev') { back.remove(); pickPrevious(ds, function () { openAmdt(ds, cc.cycle); }); return; }
      runExport(k, scope);
    });
  }

  /* ========================================================= TIMELINE */
  function viewTimeline(v) {
    var ds = dsOf();
    if (!ds) { v.innerHTML = emptyState('No data', ''); return; }
    var tl = REVIEW.timeline(ds), now = Date.now(), cur = AX.airac(now);
    var sel = S.tlSel && tl.cycles.some(function (c) { return c.cycle.id === S.tlSel; }) ? S.tlSel : (tl.cycles.filter(function (c) { return c.n; }).pop() || tl.cycles[tl.cycles.length - 1] || {}).cycle;
    if (sel && sel.id) sel = sel.id;
    var max = Math.max.apply(null, tl.cycles.map(function (c) { return c.n; }).concat([1]));
    var libFiles = {};
    if (ds.lib) { var st = libStates().filter(function (x) { return x.name === ds.lib.state; })[0]; if (st) st.files.forEach(function (f) { var d = LIBRARY.fileDate(f); if (d) { var a = AX.airac(d); if (a) (libFiles[a.id] = libFiles[a.id] || []).push(f.name); } }); }
    S.datasets.forEach(function (d) { if (d.state === ds.state && d.airac) (libFiles[d.airac.id] = libFiles[d.airac.id] || []).push(d.name); });
    var h = '<h1 class="view-title">Timeline</h1><p class="view-sub">When does the data change? Each column is an AIRAC cycle; the bar shows how many features change in it or start their current version in it (GEN / ENR / AD). Click a cycle to list its changes, open the AMDT report or highlight it in the AIP. ' + esc(ds.state) + ' · ' + esc(ds.name) + '</p>';
    if (!tl.cycles.length) { v.innerHTML = h + '<div class="card card-pad muted">No dated changes in this file.</div>'; return; }
    h += '<div class="card tl-card"><div class="tl-strip">' + tl.cycles.map(function (c) {
      var hh = function (n) { return Math.round(n / max * 110); };
      var isCur = cur && c.cycle.id === cur.id, isFile = ds.airac && c.cycle.id === ds.airac.id;
      return '<button class="tl-col' + (c.cycle.id === sel ? ' sel' : '') + (c.n ? '' : ' empty') + '" data-cy="' + c.cycle.id + '" title="AIRAC ' + c.cycle.id + ' — ' + M.fmtDate(c.cycle.date) + '\n' + c.n + ' change(s): GEN ' + c.parts.GEN + ', ENR ' + c.parts.ENR + ', AD ' + c.parts.AD + (c.temp ? ', ' + c.temp + ' temporary' : '') + (libFiles[c.cycle.id] ? '\nFiles: ' + libFiles[c.cycle.id].join(', ') : '') + '">' +
        '<span class="tl-n">' + (c.n || '') + '</span><span class="tl-bar">' + ['AD', 'ENR', 'GEN', 'Other'].map(function (k) { return c.parts[k] ? '<i class="p-' + k + '" style="height:' + Math.max(3, hh(c.parts[k])) + 'px"></i>' : ''; }).join('') + '</span>' +
        '<span class="tl-id">' + c.cycle.id + '</span><span class="tl-date">' + M.fmtDate(c.cycle.date).replace(/ \d{4}$/, '') + '</span>' +
        '<span class="tl-tags">' + (isCur ? '<span class="tl-tag now">today</span>' : '') + (isFile ? '<span class="tl-tag file">file</span>' : '') + '</span>' + (libFiles[c.cycle.id] ? '<span class="tl-doc" title="' + esc(libFiles[c.cycle.id].join(', ')) + '">📄</span>' : '') + '</button>';
    }).join('') + '</div><div class="tl-legend"><span><i class="p-GEN"></i> GEN</span><span><i class="p-ENR"></i> ENR</span><span><i class="p-AD"></i> AD</span><span>📄 file of this State for that cycle</span></div></div>';
    var c = tl.cycles.filter(function (x) { return x.cycle.id === sel; })[0];
    if (c) {
      h += '<div class="toolbar" style="margin-top:14px"><h3 style="margin:0">AIRAC ' + esc(c.cycle.id) + ' — effective ' + esc(M.fmtDate(c.cycle.date)) + '</h3><span class="chip">' + c.n + ' change(s)</span>' + (c.temp ? '<span class="chip warn">' + c.temp + ' temporary</span>' : '') + '<span class="sp"></span>' +
        '<button class="btn small primary" data-tl="amdt">' + I.amdt + ' AMDT report</button><button class="btn small" data-tl="hl">' + I.book + ' Highlight in AIP</button><button class="btn small" data-tl="list">' + I.list + ' All changes (incl. previous cycle)</button></div>';
      h += c.events.length ? '<div class="tbl-wrap"><table class="aip"><thead><tr><th>Effective</th><th>Until</th><th>AIP section</th><th>Feature</th><th>Change</th><th>What changes (old → new)</th></tr></thead><tbody>' + c.events.slice(0, 400).map(function (e) {
        var idx = cellRegistry.push({ ds: ds, r: e.rec }) - 1;
        var f = e.fields.slice(0, 6).map(function (x) { return '<div><span class="muted">' + esc(ANALYSIS.prettyPath(x.path)) + ':</span> ' + (x.old !== undefined ? '<span class="diff-old">' + esc(ANALYSIS.displayVal(ds, x.old)) + '</span> ' : '') + '→ <span class="chg-badge">' + esc(x.neu !== undefined ? ANALYSIS.displayVal(ds, x.neu) : 'removed') + '</span></div>'; }).join('');
        return '<tr><td class="nowrap">' + esc(M.fmtTs(e.from)) + '</td><td class="nowrap">' + esc(e.to ? M.fmtTs(e.to) : '') + '</td><td class="nowrap">' + esc(e.section.no + (e.section.ad ? ' ' + M.shortName(e.section.ad) : '')) + '</td><td><a href="#" data-aip="' + idx + '">' + esc(M.label(ds, e.rec)) + '</a></td><td><span class="chip ' + (/Temporary/.test(e.kind) ? 'warn' : /New/.test(e.kind) ? 'add' : 'info') + '">' + esc(e.kind) + '</span></td><td>' + (f || '—') + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="card card-pad muted">No time slice of this file starts in AIRAC ' + esc(c.cycle.id) + '.' + (ds.prevCmp ? '' : ' Compare with the previous cycle file to see the differences.') + '</div>';
    }
    if (tl.temps.length && tl.range[0] !== null) {
      var t0 = tl.range[0], t1 = Math.max(tl.range[1], t0 + 86400000), span = t1 - t0;
      var ticks = [], step = span > 400 * 86400000 ? 'y' : span > 60 * 86400000 ? 'm' : 'd', d = new Date(t0);
      d = step === 'y' ? new Date(Date.UTC(d.getUTCFullYear(), 0, 1)) : step === 'm' ? new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)) : new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
      for (var g = 0; g < 400 && d.getTime() <= t1; g++) {
        if (d.getTime() >= t0) ticks.push(d.getTime());
        d = step === 'y' ? new Date(Date.UTC(d.getUTCFullYear() + 1, 0, 1)) : step === 'm' ? new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)) : new Date(d.getTime() + Math.max(1, Math.ceil(span / 86400000 / 12)) * 86400000);
      }
      var pos = function (x) { return Math.max(0, Math.min(100, (x - t0) / span * 100)); };
      h += '<h3 style="margin:22px 0 8px">Temporary changes and NOTAM periods</h3><div class="card gantt">' +
        '<div class="g-axis">' + ticks.map(function (x) { return '<span style="left:' + pos(x) + '%">' + esc(M.fmtDate(x).replace(step === 'd' ? / \d{4}$/ : /^\d+ /, '')) + '</span>'; }).join('') + (now >= t0 && now <= t1 ? '<span class="g-now" style="left:' + pos(now) + '%">now</span>' : '') + '</div>' +
        tl.temps.slice(0, 300).map(function (x) {
          var idx = cellRegistry.push({ ds: ds, r: x.rec }) - 1, a = pos(x.from), b = pos(x.to !== null ? x.to : x.from + 86400000);
          return '<div class="g-row"><a href="#" class="g-lbl" data-det="' + idx + '" title="' + esc(x.kind) + '">' + esc(x.label) + '</a><div class="g-track"><i class="' + (/NOTAM/.test(x.kind) ? 'notam' : '') + '" style="left:' + a + '%;width:' + Math.max(0.6, b - a) + '%" title="' + esc(M.fmtTs(x.from) + ' – ' + (x.to !== null ? M.fmtTs(x.to) : 'until further notice') + '\n' + x.kind + (x.fields.length ? '\n' + x.fields.slice(0, 5).map(function (f) { return ANALYSIS.prettyPath(f.path) + ': ' + ANALYSIS.displayVal(ds, f.neu); }).join('\n') : '')) + '"></i></div></div>';
        }).join('') + '</div>';
    }
    cellRegistry = cellRegistry || [];
    v.innerHTML = h;
    var selCol = $('.tl-col.sel', v), strip = $('.tl-strip', v);
    if (selCol && strip) strip.scrollLeft = Math.max(0, selCol.offsetLeft - strip.clientWidth + selCol.offsetWidth * 3);
    v.onclick = function (e) {
      var col = e.target.closest('[data-cy]');
      if (col) { S.tlSel = col.getAttribute('data-cy'); go('timeline'); return; }
      var a = e.target.closest('[data-aip]');
      if (a) { e.preventDefault(); var r = cellRegistry[+a.getAttribute('data-aip')]; ds.hlCycle = c.cycle; ds.cyc = null; S.hlOn = true; openAipFor(r.ds, r.r); return; }
      var dt = e.target.closest('[data-det]');
      if (dt) { e.preventDefault(); var r2 = cellRegistry[+dt.getAttribute('data-det')]; openDetail(r2.ds, r2.r, 'ts'); return; }
      var b = e.target.closest('[data-tl]');
      if (!b || !c) return;
      var k = b.getAttribute('data-tl');
      if (k === 'amdt') openAmdt(ds, c.cycle);
      if (k === 'hl') { ds.hlCycle = c.cycle; ds.cyc = null; S.hlOn = true; go('aip'); }
      if (k === 'list') { ds.hlCycle = c.cycle; ds.cyc = null; openCycleList(ds); }
    };
  }

  /* ============================================================ NOTAM */
  function viewNotam(v, opts) {
    var ds = dsOf();
    if (!ds) { v.innerHTML = emptyState('No data', ''); return; }
    var withEv = S.datasets.filter(function (d) { return (d.byType.Event || []).length; });
    var h = '<h1 class="view-title">Digital NOTAM</h1><p class="view-sub">AIXM 5.1 Digital NOTAM events (<code>event:Event</code>) shown as ICAO NOTAM text, with the Q-code decoded and the temporary changes of each affected feature. Base data of the same features is taken from the other loaded files of the State.</p>';
    if (!(ds.byType.Event || []).length) {
      v.innerHTML = h + '<div class="card card-pad">No Digital NOTAM events in <b>' + esc(ds.name) + '</b>.' + (withEv.length ? ' Files with events: ' + withEv.map(function (d) { return '<a href="#" data-dsn="' + S.datasets.indexOf(d) + '">' + esc(d.name) + '</a>'; }).join(', ') : ' Load a Digital NOTAM file (e.g. from the Donlon Digital NOTAM samples) together with the baseline.') + '</div>';
      v.onclick = function (e) { var a = e.target.closest('[data-dsn]'); if (a) { e.preventDefault(); S.active = +a.getAttribute('data-dsn'); renderDsSelect(); go('notam'); } };
      return;
    }
    var others = S.datasets.filter(function (d) { return d !== ds && d.state === ds.state; }).concat(S.datasets.filter(function (d) { return d !== ds && d.state !== ds.state; }));
    var list = REVIEW.notams(ds, others), now = ds.viewDate !== null && ds.viewDate !== undefined ? ds.viewDate : Date.now();
    var f = S.notamF || { st: '', q: '' };
    var counts = { active: 0, upcoming: 0, expired: 0 };
    list.forEach(function (x) { counts[REVIEW.notamStatus(x, now)]++; });
    h += '<div class="stat-row">' + [['', 'all', list.length], ['active', 'active now', counts.active], ['upcoming', 'upcoming', counts.upcoming], ['expired', 'expired', counts.expired]].map(function (x) {
      return '<div class="card stat" data-nst="' + x[0] + '" style="cursor:pointer' + (f.st === x[0] ? ';outline:2px solid var(--brand)' : '') + '"><b>' + x[2] + '</b><span class="muted">' + x[1] + '</span></div>';
    }).join('') + '</div><div class="toolbar"><input class="inp" id="nt-q" placeholder="Filter: location, NOTAM number, scenario, text…" style="min-width:320px" value="' + esc(f.q) + '"><span class="sp"></span>' +
      '<button class="btn small" id="nt-copy">' + I.copy + ' Copy all NOTAM text</button><button class="btn small" id="nt-pdf">' + I.pdf + ' PDF</button><button class="btn small" id="nt-xlsx">' + I.xls + ' Excel</button><button class="btn small" id="nt-mail">' + I.mail + ' E-mail</button></div><div id="nt-list"></div>';
    v.innerHTML = h;
    function current() {
      var q = f.q.toLowerCase();
      return list.filter(function (x) {
        if (f.st && REVIEW.notamStatus(x, now) !== f.st) return false;
        if (q) { var txt = (x.name + ' ' + x.scenario + ' ' + x.scenarioText + ' ' + x.notams.map(function (n) { return n.text + ' ' + n.q; }).join(' ') + ' ' + x.affected.map(function (a) { return a.label; }).join(' ')).toLowerCase(); if (txt.indexOf(q) < 0) return false; }
        return true;
      });
    }
    function draw() {
      var l = current();
      cellRegistry = [];
      $('#nt-list').innerHTML = l.length ? l.slice(0, 300).map(function (x) {
        var st = REVIEW.notamStatus(x, now), ie = cellRegistry.push({ ds: ds, r: x.ev }) - 1;
        return '<div class="card notam-card"><div class="notam-head"><span class="chip ' + (st === 'active' ? 'del' : st === 'upcoming' ? 'warn' : '') + '">' + st + '</span><b>' + esc(x.scenarioText || 'Event') + '</b><span class="muted">' + esc(x.name) + '</span><span class="sp"></span>' +
          '<span class="muted nowrap">' + esc(M.fmtTs(x.start)) + ' → ' + esc(x.end !== null ? M.fmtTs(x.end) : 'until further notice') + '</span><span class="srcbtn" data-xml="' + ie + '" title="View the event AIXM code">&lt;/&gt;</span></div>' +
          (x.notams.length ? x.notams.map(function (n) {
            return '<div class="notam-body"><pre class="notam-text">' + esc(n.text) + '</pre><div class="notam-dec">' + (n.q ? '<div><span class="muted">Q-code:</span> <b>' + esc(n.q) + '</b></div>' : '') + (n.traffic ? '<div><span class="muted">Traffic:</span> ' + esc(n.traffic) + '</div>' : '') + (n.purpose ? '<div><span class="muted">Purpose:</span> ' + esc(n.purpose) + '</div>' : '') + (n.scope ? '<div><span class="muted">Scope:</span> ' + esc(n.scope) + '</div>' : '') +
              '<button class="btn small" data-copy="' + esc(n.text) + '">' + I.copy + ' Copy</button></div></div>';
          }).join('') : '<div class="notam-body"><pre class="notam-text">' + esc(x.text) + '</pre><div class="notam-dec muted">No NOTAM text in the event — generated from the affected features.</div></div>') +
          (x.affected.length ? '<div class="notam-aff"><div class="muted" style="margin-bottom:4px">Affected features (' + x.affected.length + '):</div>' + x.affected.map(function (a) {
            var ia = cellRegistry.push({ ds: ds, r: a.r, occ: a.ts.occ }) - 1;
            return '<div class="aff-row"><a href="#" data-det="' + ia + '">' + esc(a.label) + '</a> <span class="chip ' + (a.interp === 'TEMPDELTA' ? 'warn' : 'info') + '">' + esc(a.interp) + '</span> ' + a.lines.slice(0, 6).map(function (l2) { return '<span class="aff-chg">' + esc(l2) + '</span>'; }).join(' ') + ' <span class="srcbtn" data-xml="' + ia + '" title="View AIXM">&lt;/&gt;</span>' + (M.pointOf(ds, a.r) || M.geometry(ds, a.r) ? ' <a href="#" data-map="' + ia + '">map</a>' : '') + '</div>';
          }).join('') + '</div>' : '') + '</div>';
      }).join('') + (l.length > 300 ? '<div class="muted">Showing 300 of ' + l.length + '</div>' : '') : '<div class="card card-pad muted">No NOTAM for this filter.</div>';
    }
    draw();
    $$('[data-nst]', v).forEach(function (c) { c.onclick = function () { S.notamF = { st: c.getAttribute('data-nst'), q: f.q }; go('notam'); }; });
    $('#nt-q').oninput = function (e) { f.q = e.target.value; S.notamF = f; draw(); };
    $('#nt-list').onclick = function (e) {
      var cp = e.target.closest('[data-copy]');
      if (cp) { copyText(cp.getAttribute('data-copy')); return; }
      var x = e.target.closest('[data-xml]');
      if (x) { var r = cellRegistry[+x.getAttribute('data-xml')]; openXml(r.ds, r.r, null, r.occ); return; }
      var d = e.target.closest('[data-det]');
      if (d) { e.preventDefault(); var r2 = cellRegistry[+d.getAttribute('data-det')]; openDetail(r2.ds, r2.r, 'ts'); return; }
      var mp = e.target.closest('[data-map]');
      if (mp) { e.preventDefault(); var r3 = cellRegistry[+mp.getAttribute('data-map')]; go('map', { ds: ds, focus: r3.r }); }
    };
    function allText() { return current().map(function (x) { return x.notams.length ? x.notams.map(function (n) { return n.text; }).join('\n\n') : x.text; }).join('\n\n'); }
    $('#nt-copy').onclick = function () { copyText(allText()); };
    $('#nt-pdf').onclick = function () { runExport('pdf', REVIEW.notamScope(ds, current())); };
    $('#nt-xlsx').onclick = function () { runExport('xlsx', REVIEW.notamScope(ds, current())); };
    $('#nt-mail').onclick = function () { runExport('mail', REVIEW.notamScope(ds, current())); };
  }

  /* ========================================================= QUALITY */
  /* ================================================ BUSINESS RULES */
  function viewRules(v, ds) {
    var res = S.rules && S.rules.get(ds);
    var F = S.rulesF || { sev: '', src: '', q: '' };
    v.innerHTML = '<h1 class="view-title">Data quality check</h1><p class="view-sub">The official <b>AIXM 5.1 business rules</b> (' + esc(RULES.source()) + '): minimal data, data consistency, coding rules and ICAO standards. Severities follow the EAD profile. ' + esc(ds.state) + ' · ' + esc(ds.name) + '</p>' + qTabs('rules') +
      '<div class="toolbar"><button class="btn primary" id="r-run">' + I.check + (res ? ' Run again' : ' Run business rules') + '</button>' +
      '<select class="inp" id="r-sev"><option value="">All severities</option><option value="Error">Errors</option><option value="Warning">Warnings</option><option value="Info">Other</option></select>' +
      '<select class="inp" id="r-src"><option value="">All rule sources</option><option value="std">ICAO / standards only</option><option value="ead">EAD-specific only</option></select>' +
      '<input class="inp" id="r-q" placeholder="Filter rules, features…" value="' + esc(F.q) + '"><span class="sp"></span>' +
      '<button class="btn small" id="r-pdf">' + I.pdf + ' PDF</button><button class="btn small" id="r-xlsx">' + I.xls + ' Excel</button><button class="btn small" id="r-mail">' + I.mail + ' E-mail</button></div><div id="r-out"></div>';
    $('#r-sev').value = F.sev; $('#r-src').value = F.src;
    $('#r-run').onclick = async function () {
      $('#r-out').innerHTML = '<div class="card card-pad"><span class="spinner"></span> Checking ' + num(ds.recs.length) + ' features against ' + num(RULES.catalogue().length) + ' rules…<div class="progress"><div id="r-bar"></div></div></div>';
      var r = await RULES.run(ds, function (f) { var b = $('#r-bar'); if (b) b.style.width = (f * 100).toFixed(0) + '%'; });
      S.rules = S.rules || new Map(); S.rules.set(ds, r); res = r; draw();
    };
    function isEad(x) { return /EAD/.test(x.rule.src) || x.rule.k && x.rule.k.t === 'absent'; }
    function cur() {
      if (!res || !res.results) return [];
      var q = F.q.toLowerCase();
      return res.results.filter(function (x) {
        if (F.sev && (F.sev === 'Info' ? /Error|Warning/.test(x.rule.s) : x.rule.s !== F.sev)) return false;
        if (F.src === 'ead' && !isEad(x)) return false;
        if (F.src === 'std' && isEad(x)) return false;
        if (q && (x.rule.id + ' ' + x.rule.n + ' ' + x.rule.x + ' ' + x.fails.slice(0, 50).map(function (f) { return M.label(ds, f.rec); }).join(' ')).toLowerCase().indexOf(q) < 0) return false;
        return true;
      });
    }
    function draw() {
      var out = $('#r-out');
      if (!res) { out.innerHTML = '<div class="card card-pad muted">Press <b>Run business rules</b>. ' + num(RULES.catalogue().filter(function (r) { return r.k; }).length) + ' of the ' + num(RULES.catalogue().length) + ' rules can be checked automatically; all of them are listed in the <a href="#" data-qtab="cat">Rule catalogue</a>.</div>'; return; }
      if (res.error) { out.innerHTML = '<div class="note-box">' + esc(res.error) + '</div>'; return; }
      var sm = res.summary, list = cur();
      cellRegistry = [];
      out.innerHTML = '<div class="stat-row"><div class="card stat"><b>' + num(sm.checked) + '</b><span class="muted">rules applied</span></div><div class="card stat"><b style="color:var(--ok)">' + num(sm.passed) + '</b><span class="muted">passed</span></div>' +
        '<div class="card stat"><b class="sev-err">' + num(sm.failed) + '</b><span class="muted">rules with findings</span></div><div class="card stat"><b class="sev-err">' + num(sm.err) + '</b><span class="muted">error findings</span></div><div class="card stat"><b class="sev-warn">' + num(sm.warn) + '</b><span class="muted">warnings / other</span></div>' +
        '<div class="card stat"><b>' + num(sm.na) + '</b><span class="muted">not applicable (no such data)</span></div></div>' +
        (list.length ? list.slice(0, 300).map(function (x, i) {
          var r = x.rule, sev = /Error/i.test(r.s) ? 'err' : /Warning/i.test(r.s) ? 'warn' : 'info';
          var rows = x.fails.slice(0, 200).map(function (f) { var idx = cellRegistry.push({ ds: ds, r: f.rec }) - 1; return '<tr><td><a href="#" data-det="' + idx + '">' + esc(M.label(ds, f.rec)) + '</a><div class="muted" style="font-size:11px">' + esc(f.rec.k) + '</div></td><td>' + esc(f.msg) + (f.n > 1 ? ' <span class="chip">× ' + f.n + '</span>' : '') + '</td><td class="nowrap">' + esc(AIP.sectionOf(ds, f.rec).no) + '</td><td><span class="srcbtn" data-xml="' + idx + '">&lt;/&gt;</span></td></tr>'; }).join('');
          return '<details class="card rule-card"' + (i < 3 ? ' open' : '') + '><summary><span class="sev-' + sev + ' rule-sev">' + esc(r.s) + '</span> <b>' + esc(r.n || RULES.describe(r.k)) + '</b> <span class="chip">' + num(x.fails.length) + ' finding(s)</span> <span class="muted" style="font-size:11.5px">' + esc(r.id) + ' · ' + esc(r.src || '') + (r.g ? ' · ' + esc(r.g) : '') + '</span></summary>' +
            '<div class="rule-text">' + esc(r.x) + '</div>' + (r.cm ? '<div class="muted" style="font-size:12px;margin:4px 0 6px">' + esc(r.cm) + '</div>' : '') +
            '<div class="tbl-wrap"><table class="aip"><thead><tr><th>Feature</th><th>Finding</th><th>AIP section</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>' + (x.fails.length > 200 ? '<div class="more-rows muted">Showing 200 of ' + num(x.fails.length) + ' — export for all.</div>' : '') + '</div></details>';
        }).join('') : '<div class="card card-pad" style="color:var(--ok)">✓ No findings for this filter.</div>');
    }
    function upd() { F = { sev: $('#r-sev').value, src: $('#r-src').value, q: $('#r-q').value }; S.rulesF = F; draw(); }
    $('#r-sev').onchange = upd; $('#r-src').onchange = upd; $('#r-q').oninput = upd;
    $('#r-out').onclick = function (e) {
      var a = e.target.closest('[data-det]'), x = e.target.closest('[data-xml]');
      if (a) { e.preventDefault(); var r1 = cellRegistry[+a.getAttribute('data-det')]; openDetail(r1.ds, r1.r); }
      if (x) { var r2 = cellRegistry[+x.getAttribute('data-xml')]; openXml(r2.ds, r2.r); }
    };
    function scope() {
      var rows = [];
      cur().forEach(function (x) { x.fails.forEach(function (f) { rows.push([AIP.C(x.rule.s), AIP.C(x.rule.id), AIP.C(x.rule.n), AIP.C(x.rule.x), AIP.C(M.label(ds, f.rec), f.rec), AIP.C(f.msg + (f.n > 1 ? ' (× ' + f.n + ')' : '')), AIP.C(AIP.sectionOf(ds, f.rec).no)]); }); });
      return { title: 'AIXM business rules report', sub: ds.state + ' — ' + ds.name, ds: ds, sections: [{ no: 'SBVR', title: 'AIXM 5.1 business rule findings', blocks: [
        { kind: 'kv', rows: [{ no: '', label: 'Rule set', cells: [AIP.C(RULES.source())] }, { no: '', label: 'Summary', cells: [AIP.C(res.summary.checked + ' rules applied, ' + res.summary.passed + ' passed, ' + res.summary.failed + ' with findings (' + res.summary.fails + ' findings)')] }] },
        { kind: 'table', cols: ['Severity', 'Rule ID', 'Rule', 'Rule text', 'Feature', 'Finding', 'AIP section'], rows: rows }] }] };
    }
    $('#r-pdf').onclick = function () { if (res && res.results) runExport('pdf', scope()); };
    $('#r-xlsx').onclick = function () { if (res && res.results) runExport('xlsx', scope()); };
    $('#r-mail').onclick = function () { if (res && res.results) runExport('mail', scope()); };
    draw();
  }
  function viewRuleCatalogue(v) {
    var all = RULES.catalogue(), q = S.catQ || '', auto = S.catAuto || '';
    v.innerHTML = '<h1 class="view-title">Data quality check</h1><p class="view-sub">All ' + num(all.length) + ' AIXM 5.1 business rules (' + esc(RULES.source()) + '). Rules marked <b>auto</b> are checked by <i>Run business rules</i>; the others are listed for reference.</p>' + qTabs('cat') +
      '<div class="toolbar"><input class="inp" id="c-q" style="min-width:320px" placeholder="Search rule text, class, ID…" value="' + esc(q) + '"><select class="inp" id="c-auto"><option value="">All rules</option><option value="1">Checked automatically</option><option value="0">Reference only</option></select><span class="sp"></span><button class="btn small" id="c-xlsx">' + I.xls + ' Excel</button></div><div id="c-out"></div>';
    $('#c-auto').value = auto;
    function list() { var ql = q.toLowerCase(); return all.filter(function (r) { return (!auto || (auto === '1') === !!r.k) && (!ql || (r.id + ' ' + r.n + ' ' + r.x + ' ' + r.c + ' ' + r.g).toLowerCase().indexOf(ql) >= 0); }); }
    function draw() {
      var l = list();
      $('#c-out').innerHTML = '<div class="muted" style="margin:6px 2px">' + num(l.length) + ' rule(s)</div><div class="tbl-wrap"><table class="aip"><thead><tr><th>ID</th><th>Class</th><th>Severity (EAD)</th><th>Category</th><th>Rule</th><th>Check</th></tr></thead><tbody>' + l.slice(0, 500).map(function (r) {
        return '<tr><td class="nowrap" style="font-size:11.5px">' + esc(r.id) + '</td><td>' + esc(r.c) + '</td><td class="sev-' + (/Error/.test(r.s) ? 'err' : /Warning/.test(r.s) ? 'warn' : 'info') + '">' + esc(r.s) + '</td><td>' + esc(r.g) + '</td><td><b>' + esc(r.n) + '</b><div style="font-size:12.5px">' + esc(r.x) + '</div></td><td>' + (r.k ? '<span class="chip ok">auto</span><div class="muted" style="font-size:11px">' + esc(RULES.describe(r.k)) + '</div>' : '<span class="muted">reference</span>') + '</td></tr>';
      }).join('') + '</tbody></table>' + (l.length > 500 ? '<div class="more-rows muted">Showing 500 of ' + num(l.length) + ' — refine the search or export to Excel.</div>' : '') + '</div>';
    }
    $('#c-q').oninput = function (e) { q = S.catQ = e.target.value; draw(); };
    $('#c-auto').onchange = function (e) { auto = S.catAuto = e.target.value; draw(); };
    $('#c-xlsx').onclick = function () {
      runExport('xlsx', { title: 'AIXM 5.1 business rules', sub: RULES.source(), ds: dsOf(), sections: [{ no: 'RULES', title: 'AIXM 5.1 business rules', blocks: [{ kind: 'table', cols: ['ID', 'Name', 'Class', 'Severity (EAD)', 'Category', 'Source', 'Reference', 'Rule', 'Comments', 'Checked automatically'],
        rows: list().map(function (r) { return [AIP.C(r.id), AIP.C(r.n), AIP.C(r.c), AIP.C(r.s), AIP.C(r.g), AIP.C(r.src), AIP.C(r.ref), AIP.C(r.x), AIP.C(r.cm), AIP.C(r.k ? RULES.describe(r.k) : '')]; }) }] }] });
    };
    draw();
  }


  function qTabs(active) {
    return '<div class="pill-tabs q-tabs">' + [['basic', 'Basic checks'], ['rules', 'AIXM business rules (SBVR)'], ['cat', 'Rule catalogue'], ['ols', 'Obstacle surfaces (Annex 14)'], ['integrity', 'Data integrity (CRC32Q)']].map(function (x) { return '<button class="' + (active === x[0] ? 'active' : '') + '" data-qtab="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div>';
  }
  function viewQuality(v) {
    var ds = dsOf();
    if (!ds) { v.innerHTML = emptyState('No data', ''); return; }
    v.onclick = function (e) { var tb = e.target.closest('[data-qtab]'); if (tb) { S.qTab = tb.getAttribute('data-qtab'); go('quality'); } };
    if (S.qTab === 'rules') { viewRules(v, ds); return; }
    if (S.qTab === 'cat') { viewRuleCatalogue(v); return; }
    if (S.qTab === 'ols') { viewOls(v, ds); return; }
    if (S.qTab === 'integrity') { viewIntegrity(v, ds); return; }
    var iss = S.quality.get(ds);
    v.innerHTML = '<h1 class="view-title">Data quality check</h1><p class="view-sub">Checks based on the AIXM schema code lists, AIXM temporality rules and the minimum ICAO AIP data: coordinates, references, frequencies, bearings, missing mandatory AIP items. ' + esc(ds.state) + ' · ' + esc(ds.name) + '</p>' + qTabs('basic') +
      '<div class="toolbar"><button class="btn primary" id="q-run">' + I.check + (iss ? ' Run again' : ' Run checks') + '</button><select class="inp" id="q-sev"><option value="">All severities</option><option value="error">Errors</option><option value="warning">Warnings</option><option value="info">Info</option></select><input class="inp" id="q-q" placeholder="Filter…"><span class="sp"></span>' +
      '<button class="btn small" id="q-pdf">' + I.pdf + ' PDF</button><button class="btn small" id="q-xlsx">' + I.xls + ' Excel</button><button class="btn small" id="q-mail">' + I.mail + ' E-mail</button></div><div id="q-out"></div>';
    $('#q-run').onclick = async function () {
      $('#q-out').innerHTML = '<div class="card card-pad"><span class="spinner"></span> Checking ' + num(ds.recs.length) + ' features…<div class="progress"><div id="q-bar"></div></div></div>';
      iss = await ANALYSIS.quality(ds, function (f) { var b = $('#q-bar'); if (b) b.style.width = (f * 100).toFixed(0) + '%'; });
      S.quality.set(ds, iss);
      draw();
    };
    function cur() {
      var sv = $('#q-sev').value, q = $('#q-q').value.toLowerCase();
      return (iss || []).filter(function (i) { return (!sv || i.sev === sv) && (!q || (i.rule + ' ' + i.msg + ' ' + (i.rec && i.rec.k ? M.label(ds, i.rec) : '')).toLowerCase().indexOf(q) >= 0); });
    }
    function draw() {
      if (!iss) { $('#q-out').innerHTML = '<div class="card card-pad muted">Press <b>Run checks</b>.</div>'; return; }
      var c = { error: 0, warning: 0, info: 0 };
      iss.forEach(function (i) { c[i.sev]++; });
      var list = cur();
      cellRegistry = [];
      $('#q-out').innerHTML = '<div class="stat-row"><div class="card stat"><b class="sev-err">' + num(c.error) + '</b><span class="muted">errors</span></div><div class="card stat"><b class="sev-warn">' + num(c.warning) + '</b><span class="muted">warnings</span></div><div class="card stat"><b class="sev-info">' + num(c.info) + '</b><span class="muted">info</span></div></div>' +
        (list.length ? '<div class="tbl-wrap"><table class="aip"><thead><tr><th>Severity</th><th>Rule</th><th>Message</th><th>Feature</th><th>AIP section</th><th></th></tr></thead><tbody>' + list.slice(0, 1000).map(function (i) {
          var ok = i.rec && i.rec.k && i.rec.cur;
          var idx = ok ? cellRegistry.push({ ds: ds, r: i.rec }) - 1 : -1;
          return '<tr><td class="sev-' + (i.sev === 'error' ? 'err' : i.sev === 'warning' ? 'warn' : 'info') + '">' + i.sev + '</td><td>' + esc(i.rule) + '</td><td>' + esc(i.msg) + '</td><td>' + (ok ? '<a href="#" data-det="' + idx + '">' + esc(M.label(ds, i.rec)) + '</a>' : '') + '</td><td>' + (ok ? esc(AIP.sectionOf(ds, i.rec).no) : '') + '</td><td>' + (idx >= 0 ? '<span class="srcbtn" data-xml="' + idx + '">&lt;/&gt;</span>' : '') + '</td></tr>';
        }).join('') + '</tbody></table>' + (list.length > 1000 ? '<div class="more-rows muted">Showing 1000 of ' + num(list.length) + '</div>' : '') + '</div>' : '<div class="card card-pad" style="color:var(--ok)">✓ No issues for this filter.</div>');
    }
    $('#q-sev').onchange = draw; $('#q-q').oninput = draw;
    $('#q-out').onclick = function (e) {
      var a = e.target.closest('[data-det]'), x = e.target.closest('[data-xml]');
      if (a) { e.preventDefault(); var r1 = cellRegistry[+a.getAttribute('data-det')]; openDetail(r1.ds, r1.r); }
      if (x) { var r2 = cellRegistry[+x.getAttribute('data-xml')]; openXml(r2.ds, r2.r); }
    };
    function scope() {
      return { title: 'Data quality report', sub: ds.state + ' — ' + ds.name, ds: ds, sections: [{ no: 'QUALITY', title: 'Data quality issues', blocks: [{ kind: 'table', cols: ['Severity', 'Rule', 'Message', 'Feature', 'AIP section'],
        rows: cur().map(function (i) { var ok = i.rec && i.rec.cur; return [AIP.C(i.sev), AIP.C(i.rule), AIP.C(i.msg), AIP.C(ok ? M.label(ds, i.rec) : '', ok ? i.rec : null), AIP.C(ok ? AIP.sectionOf(ds, i.rec).no : '')]; }) }] }] };
    }
    $('#q-pdf').onclick = function () { if (iss) runExport('pdf', scope()); };
    $('#q-xlsx').onclick = function () { if (iss) runExport('xlsx', scope()); };
    $('#q-mail').onclick = function () { if (iss) runExport('mail', scope()); };
    draw();
  }

  /* ------------------------------------------- obstacle limitation surfaces */
  // Annex 14 surfaces of every aerodrome (ols.js), checked against the obstacles of all loaded files of the State
  function viewOls(v, ds) {
    var sets = S.datasets.slice(); // obstacles of every loaded file (e.g. a separate eTOD / obstacle file); only those near the aerodrome count
    var ads = ADCHART.all(ds).filter(function (m) { return m.runways.length; }).map(function (m) { return m.ad; });
    var res = ads.map(function (ad) { return { ad: ad, r: OLS.check(ds, ad, sets) }; }).filter(function (x) { return x.r; });
    var pen = res.reduce(function (n, x) { return n + x.r.list.length; }, 0), chk = res.reduce(function (n, x) { return n + x.r.checked; }, 0);
    cellRegistry = [];
    function mft(m) { return m.toFixed(1) + ' m (' + Math.round(m / 0.3048).toLocaleString('en-US') + ' ft)'; }
    v.innerHTML = '<h1 class="view-title">Data quality check</h1><p class="view-sub">Obstacle limitation surfaces of ICAO Annex 14 (approach, take-off climb, transitional, inner horizontal, conical) built from the runway data, checked against the obstacles of the ' +
      sets.length + ' loaded file(s) (within 11 NM of each aerodrome). Runway code number from the runway length, approach type from the ILS / instrument approaches in the data. Indicative: the inner approach / OFZ surfaces are not included and the official survey prevails.</p>' + qTabs('ols') +
      '<div class="toolbar"><span class="sp"></span><button class="btn small" id="o-pdf">' + I.pdf + ' PDF</button><button class="btn small" id="o-xlsx">' + I.xls + ' Excel</button><button class="btn small" id="o-mail">' + I.mail + ' E-mail</button></div>' +
      '<div class="stat-row"><div class="card stat"><b>' + res.length + '</b><span class="muted">aerodromes</span></div><div class="card stat"><b>' + num(chk) + '</b><span class="muted">obstacles checked</span></div><div class="card stat"><b class="' + (pen ? 'sev-err' : '') + '">' + pen + '</b><span class="muted">penetrations</span></div></div>' +
      (res.length ? res.map(function (x) {
        return '<div class="card card-pad" style="margin-bottom:12px"><div class="row"><b>' + esc(M.label(ds, x.ad)) + '</b><span class="sp"></span><span class="chip ' + (x.r.list.length ? 'warn' : 'ok') + '">' + x.r.list.length + ' penetration(s) · ' + x.r.checked + ' obstacles</span>' +
          '<button class="btn small" data-ols3d="' + ds.recs.indexOf(x.ad) + '">🗻 Show in 3D</button></div><pre class="muted" style="white-space:pre-wrap;margin:6px 0">' + esc(OLS.describe(x.r.surfaces)) + '</pre>' +
          (x.r.list.length ? '<div class="tbl-wrap"><table class="aip"><thead><tr><th>Obstacle</th><th>Type</th><th>Top elevation</th><th>Surface</th><th>Permitted</th><th>Penetration</th><th>Position</th></tr></thead><tbody>' + x.r.list.map(function (p) {
            var idx = cellRegistry.push({ ds: p.ds, r: p.rec }) - 1;
            return '<tr><td><a href="#" data-det="' + idx + '">' + esc(p.name) + '</a></td><td>' + esc(p.type) + '</td><td>' + mft(p.top) + (p.est ? ' <span class="muted">(est.)</span>' : '') + '</td><td>' + esc(p.surface) + '</td><td>' + mft(p.allowed) + '</td><td class="sev-err"><b>+' + mft(p.pen) + '</b></td><td>' + esc(p.from) + '</td></tr>';
          }).join('') + '</tbody></table></div>' : '<div style="color:var(--ok)">✓ No obstacle penetrates the surfaces.</div>') + '</div>';
      }).join('') : '<div class="card card-pad muted">No aerodrome with runway positions in this data set.</div>');
    v.querySelectorAll('[data-det]').forEach(function (a) { a.onclick = function (e) { e.preventDefault(); var c = cellRegistry[+a.getAttribute('data-det')]; openDetail(c.ds, c.r); }; });
    v.querySelectorAll('[data-ols3d]').forEach(function (b) { b.onclick = function () { go('map', { ds: ds, view3d: { mode: 'area', ad: ds.recs[+b.getAttribute('data-ols3d')], ols: true } }); }; });
    function scope() {
      var C = AIP.C;
      return { title: 'Obstacle limitation surfaces (ICAO Annex 14)', sub: ds.state + ' — ' + ds.name, ds: ds, sections: res.map(function (x) {
        return { no: 'OLS', code: M.shortName(x.ad), title: M.label(ds, x.ad), blocks: [{ kind: 'note', text: OLS.describe(x.r.surfaces) }, { kind: 'table', cols: ['Obstacle', 'Type', 'Top elevation', 'Surface', 'Permitted', 'Penetration', 'Position'],
          rows: x.r.list.map(function (p) { return [C(p.name, p.rec), C(p.type), C(mft(p.top)), C(p.surface), C(mft(p.allowed)), C('+' + mft(p.pen)), C(p.from)]; }) }] };
      }) };
    }
    $('#o-pdf').onclick = function () { runExport('pdf', scope()); };
    $('#o-xlsx').onclick = function () { runExport('xlsx', scope()); };
    $('#o-mail').onclick = function () { runExport('mail', scope()); };
  }

  /* ------------------------------------------------------ data integrity */
  // PANS-AIM classification and declared accuracy, CRC32Q fingerprints, verification against an earlier list (integrity.js)
  function viewIntegrity(v, ds) {
    var list = INTEGRITY.items(ds), pub = INTEGRITY.published(ds), F = S.intF || { cls: '', st: '', q: '' }, ver = S.intVer && S.intVer.ds === ds ? S.intVer.res : null;
    var by = { OK: 0, 'Accuracy not declared': 0, 'Insufficient accuracy': 0 };
    list.forEach(function (it) { by[it.status]++; });
    v.innerHTML = '<h1 class="view-title">Data quality check</h1><p class="view-sub">Data integrity (ICAO Annex 15, PANS-AIM): every critical, essential and routine data item with the accuracy PANS-AIM requires and the accuracy declared in the data, and its <b>CRC32Q</b> fingerprint. Save the CRC list and verify a later delivery against it to prove that nothing changed unnoticed. ' + esc(ds.state) + ' · ' + esc(ds.name) + '</p>' + qTabs('integrity') +
      '<div class="toolbar"><select class="inp" id="i-cls"><option value="">All classes</option><option value="critical">Critical</option><option value="essential">Essential</option><option value="routine">Routine</option></select>' +
      '<select class="inp" id="i-st"><option value="">All results</option><option>OK</option><option>Accuracy not declared</option><option>Insufficient accuracy</option></select><input class="inp" id="i-q" placeholder="Filter…" value="' + esc(F.q) + '"><span class="sp"></span>' +
      '<button class="btn small" id="i-csv">⬇ Save CRC list</button><button class="btn small" id="i-ver">✓ Verify against a CRC list…</button><input type="file" id="i-file" accept=".csv,.txt" class="hidden">' +
      '<button class="btn small" id="i-pdf">' + I.pdf + ' PDF</button><button class="btn small" id="i-xlsx">' + I.xls + ' Excel</button></div>' +
      '<div class="stat-row"><div class="card stat"><b>' + num(list.length) + '</b><span class="muted">data items</span></div><div class="card stat"><b style="color:var(--ok)">' + num(by.OK) + '</b><span class="muted">accuracy OK</span></div><div class="card stat"><b class="sev-warn">' + num(by['Accuracy not declared']) + '</b><span class="muted">accuracy not declared</span></div><div class="card stat"><b class="sev-err">' + num(by['Insufficient accuracy']) + '</b><span class="muted">insufficient accuracy</span></div></div>' +
      '<div id="i-ver-out"></div><div id="i-out"></div>' +
      (pub.length ? '<div class="card card-pad" style="margin-top:12px"><b>CRC values published in the file (' + pub.length + ')</b><div class="muted" style="font-size:12px">Listed as published: the field order used by the originator to compute them is not standardised, so they are not recomputed.</div><div class="tbl-wrap"><table class="aip"><thead><tr><th>Feature</th><th>Field</th><th>Value</th></tr></thead><tbody>' +
        pub.slice(0, 500).map(function (p) { return '<tr><td>' + esc(M.label(ds, p.rec)) + '</td><td>' + esc(p.field) + '</td><td class="mono">' + esc(p.value) + '</td></tr>'; }).join('') + '</tbody></table></div></div>' : '');
    $('#i-cls').value = F.cls; $('#i-st').value = F.st;
    function cur() { return list.filter(function (it) { return (!F.cls || it.cls === F.cls) && (!F.st || it.status === F.st) && (!F.q || (it.ident + ' ' + it.item + ' ' + it.crc).toLowerCase().indexOf(F.q.toLowerCase()) >= 0); }); }
    function draw() {
      var l = cur();
      cellRegistry = [];
      $('#i-out').innerHTML = '<div class="tbl-wrap"><table class="aip"><thead><tr><th>Class</th><th>Data item</th><th>Feature</th><th>Position</th><th>Elevation</th><th>Required accuracy (H / V)</th><th>Declared (H / V)</th><th>Result</th><th>CRC32Q</th><th></th></tr></thead><tbody>' +
        l.slice(0, 1500).map(function (it) {
          var idx = cellRegistry.push({ ds: ds, r: it.rec }) - 1;
          function a(x) { return x === null ? '—' : x + ' m'; }
          return '<tr><td class="int-' + it.cls + '">' + it.cls + '</td><td>' + esc(it.item) + '</td><td><a href="#" data-det="' + idx + '">' + esc(it.ident) + '</a></td><td class="mono">' + esc(it.posTxt) + '</td><td>' + (it.elev === null ? '' : it.elev.toFixed(1) + ' m') + '</td>' +
            '<td>' + a(it.reqH) + ' / ' + a(it.reqV) + '</td><td>' + a(it.decH) + ' / ' + a(it.decV) + '</td><td class="' + (it.status === 'OK' ? '' : it.status === 'Insufficient accuracy' ? 'sev-err' : 'sev-warn') + '" title="' + esc(it.note) + '">' + esc(it.status) + '</td><td class="mono" title="' + esc(it.text) + '">' + it.crc + '</td><td><span class="srcbtn" data-xml="' + idx + '">&lt;/&gt;</span></td></tr>';
        }).join('') + '</tbody></table>' + (l.length > 1500 ? '<div class="more-rows muted">Showing 1500 of ' + num(l.length) + ' (exports contain all)</div>' : '') + '</div>';
    }
    function drawVer() {
      if (!ver) { $('#i-ver-out').innerHTML = ''; return; }
      $('#i-ver-out').innerHTML = '<div class="card card-pad" style="margin-bottom:12px"><b>Verification against the CRC list (' + num(ver.reference) + ' items)</b> — ' +
        '<span style="color:var(--ok)">' + num(ver.same) + ' unchanged</span> · <span class="sev-err">' + ver.changed.length + ' changed</span> · <span class="sev-warn">' + ver.missing.length + ' missing</span> · ' + ver.added.length + ' new' +
        (ver.changed.length || ver.missing.length ? '<div class="tbl-wrap"><table class="aip"><thead><tr><th>Result</th><th>Data item</th><th>CRC in the list</th><th>CRC now</th></tr></thead><tbody>' +
          ver.changed.slice(0, 300).map(function (c) { return '<tr><td class="sev-err">changed</td><td>' + esc(c.it.key) + '</td><td class="mono">' + c.was + '</td><td class="mono">' + c.it.crc + '</td></tr>'; }).join('') +
          ver.missing.slice(0, 300).map(function (c) { return '<tr><td class="sev-warn">missing</td><td>' + esc(c.key) + '</td><td class="mono">' + c.crc + '</td><td></td></tr>'; }).join('') + '</tbody></table></div>' : '<div style="color:var(--ok)">✓ All data items of the list are unchanged.</div>') + '</div>';
    }
    function save() { F = { cls: $('#i-cls').value, st: $('#i-st').value, q: $('#i-q').value }; S.intF = F; draw(); }
    $('#i-cls').onchange = save; $('#i-st').onchange = save; $('#i-q').oninput = save;
    $('#i-out').onclick = function (e) {
      var a = e.target.closest('[data-det]'), x = e.target.closest('[data-xml]');
      if (a) { e.preventDefault(); var r1 = cellRegistry[+a.getAttribute('data-det')]; openDetail(r1.ds, r1.r); }
      if (x) { var r2 = cellRegistry[+x.getAttribute('data-xml')]; openXml(r2.ds, r2.r); }
    };
    $('#i-csv').onclick = function () { EXPORTS.download(EXPORTS.safeName(ds.state + '_' + (ds.airac ? ds.airac.id : '') + '_CRC32Q') + '.csv', new Blob(['# ' + APP_INFO.credit + ' - CRC32Q list of ' + ds.name + '\n' + INTEGRITY.toCsv(list)], { type: 'text/csv' })); };
    $('#i-ver').onclick = function () { $('#i-file').click(); };
    $('#i-file').onchange = function () {
      var f = this.files[0]; if (!f) return;
      f.text().then(function (txt) { ver = INTEGRITY.verify(list, txt.replace(/^#.*\n/, '')); S.intVer = { ds: ds, res: ver }; drawVer(); toast('Verified ' + num(ver.reference) + ' items: ' + ver.changed.length + ' changed, ' + ver.missing.length + ' missing.'); });
    };
    function scope() {
      var C = AIP.C;
      return { title: 'Data integrity report (CRC32Q)', sub: ds.state + ' — ' + ds.name, ds: ds, sections: [{ no: 'INTEGRITY', title: 'Data items, accuracy and CRC32Q', blocks: [{ kind: 'table', cols: ['Class', 'Data item', 'Feature', 'Position', 'Elevation (m)', 'Required H / V (m)', 'Declared H / V (m)', 'Result', 'CRC32Q'],
        rows: cur().map(function (it) { return [C(it.cls), C(it.item), C(it.ident, it.rec), C(it.posTxt), C(it.elev === null ? '' : it.elev.toFixed(1)), C((it.reqH === null ? '—' : it.reqH) + ' / ' + (it.reqV === null ? '—' : it.reqV)), C((it.decH === null ? '—' : it.decH) + ' / ' + (it.decV === null ? '—' : it.decV)), C(it.status), C(it.crc)]; }) }] }] };
    }
    $('#i-pdf').onclick = function () { runExport('pdf', scope()); };
    $('#i-xlsx').onclick = function () { runExport('xlsx', scope()); };
    draw(); drawVer();
  }

  /* ======================================================== EXPLORER */
  function viewExplorer(v) {
    var ds = dsOf();
    if (!ds) { v.innerHTML = emptyState('No data', ''); return; }
    var types = Object.keys(ds.byType).sort();
    if (!S.explorerType || !ds.byType[S.explorerType]) S.explorerType = ds.byType.AirportHeliport ? 'AirportHeliport' : types[0];
    v.innerHTML = '<div class="explorer"><div class="side"><div class="side-head"><input class="inp grow" id="ex-tf" placeholder="Filter feature types"></div><ul class="tree" id="ex-types"></ul></div>' +
      '<div style="display:flex;flex-direction:column;min-width:0"><div class="sec-head"><div class="grow"><div class="crumbs">' + esc(ds.state) + ' · all AIXM features (nothing hidden)</div><h2 id="ex-title"></h2><div class="eff" id="ex-def"></div></div>' +
      '<input class="inp" id="ex-q" placeholder="Search in this type…"><div class="btn-group"><button class="btn small" id="ex-xlsx">' + I.xls + ' Excel</button><button class="btn small" id="ex-json">' + I.json + ' JSON</button></div></div>' +
      '<div class="row" style="padding:6px 26px;font-size:12px;font-weight:600;color:var(--muted);border-bottom:1px solid var(--border)"><span style="flex:2">Feature</span><span style="flex:1">AIP section</span><span style="flex:1">Effective from</span><span style="width:90px">Time slices</span><span style="width:80px">Line</span></div>' +
      '<div class="vlist grow" id="ex-list"></div></div></div>';
    var tl = $('#ex-types');
    function drawTypes() {
      var q = $('#ex-tf').value.toLowerCase();
      tl.innerHTML = types.filter(function (t) { return !q || t.toLowerCase().indexOf(q) >= 0; }).map(function (t) {
        return '<li><div class="node' + (t === S.explorerType ? ' active' : '') + '" data-t="' + esc(t) + '" title="' + esc(M.featureDef(t)) + '"><span class="title">' + esc(t.indexOf('45:') === 0 ? M.typeName({ k: t, s45: t.slice(3) }) : t) + '</span><span class="sp"></span><span class="chip">' + num(ds.byType[t].length) + '</span></div></li>';
      }).join('');
    }
    drawTypes();
    $('#ex-tf').oninput = drawTypes;
    tl.onclick = function (e) { var n = e.target.closest('[data-t]'); if (n) { S.explorerType = n.getAttribute('data-t'); drawTypes(); drawList(); } };
    var listEl = $('#ex-list'), items = [];
    function drawList() {
      var t = S.explorerType, q = $('#ex-q').value.toLowerCase();
      $('#ex-title').textContent = (t.indexOf('45:') === 0 ? M.typeName({ k: t, s45: t.slice(3) }) : t) + ' (' + num(ds.byType[t].length) + ')';
      $('#ex-def').textContent = M.featureDef(t);
      items = ds.byType[t].filter(function (r) { return !q || (M.label(ds, r) + ' ' + r.id).toLowerCase().indexOf(q) >= 0; });
      listEl.scrollTop = 0;
      virt();
    }
    var RH = 34;
    function virt() {
      var h = listEl.clientHeight || 600, top = listEl.scrollTop, a = Math.max(0, Math.floor(top / RH) - 10), b = Math.min(items.length, Math.ceil((top + h) / RH) + 10);
      var html = '<div style="height:' + items.length * RH + 'px"></div>';
      for (var i = a; i < b; i++) {
        var r = items[i];
        html += '<div class="vrow' + (S.explorerSel === r ? ' active' : '') + '" data-i="' + i + '" style="top:' + i * RH + 'px;display:flex"><span style="flex:2"><b>' + esc(M.label(ds, r)) + '</b></span><span style="flex:1" class="muted">' + esc(AIP.sectionOf(ds, r).no) + '</span><span style="flex:1">' + esc(M.fmtTs(r.cur.b)) + '</span><span style="width:90px">' + r.ts.length + '</span><span style="width:80px" class="mono">' + num(r.line) + '</span></div>';
      }
      listEl.innerHTML = html;
    }
    listEl.onscroll = function () { if (!listEl._raf) listEl._raf = requestAnimationFrame(function () { listEl._raf = null; virt(); }); };
    listEl.onclick = function (e) { var n = e.target.closest('[data-i]'); if (n) { S.explorerSel = items[+n.getAttribute('data-i')]; virt(); openDetail(ds, S.explorerSel); } };
    $('#ex-q').oninput = drawList;
    $('#ex-xlsx').onclick = function () { EXPORTS.exportExcel({ title: ds.state + ' ' + S.explorerType, ds: ds, sections: [], features: items }); };
    $('#ex-json').onclick = function () { EXPORTS.exportJSON({ title: ds.state + ' ' + S.explorerType, ds: ds, sections: [], features: items }); };
    drawList();
  }

  /* ========================================================== EXPORT */
  function viewExport(v) {
    var ds = dsOf();
    if (!ds) { v.innerHTML = emptyState('No data', ''); return; }
    var cat = ds.catalogue || (ds.catalogue = AIP.catalogue(ds));
    var ads = cat[2].children.filter(function (x) { return x.ad; });
    v.innerHTML = '<h1 class="view-title">Export</h1><p class="view-sub">' + esc(ds.state) + ' · ' + esc(ds.name) + (ds.airac ? ' · AIRAC ' + ds.airac.id : '') + '. Choose what to export, then the format. Every section page also has its own Print / PDF / Excel / JSON / E-mail buttons.</p>' +
      '<div class="card card-pad"><h3>1 · What</h3><div class="col">' +
      '<label class="chk"><input type="radio" name="scope" value="all" checked> Complete AIP data (GEN + ENR + AD)</label>' +
      '<label class="chk"><input type="radio" name="scope" value="GEN"> GEN only</label><label class="chk"><input type="radio" name="scope" value="ENR"> ENR only</label><label class="chk"><input type="radio" name="scope" value="AD"> AD — all aerodromes and heliports</label>' +
      '<label class="chk"><input type="radio" name="scope" value="ads"> Selected aerodromes:</label><div class="row wrap" style="padding-left:24px">' + ads.map(function (a) { return '<label class="chk"><input type="checkbox" class="ad-pick" value="' + a.id + '"> ' + esc(M.shortName(a.ad)) + '</label>'; }).join('') + '</div>' +
      '<label class="chk"><input type="radio" name="scope" value="features"> All AIXM features — raw data, every property (JSON / Excel)</label></div></div>' +
      '<h3 style="margin:18px 0 10px">2 · Format</h3><div class="export-grid">' +
      expCard('pdf', I.pdf, 'Printable PDF', 'AIP-style pages with header, footer, AIRAC and source file. Aerodrome pages include a map.') +
      expCard('print', I.print, 'Print', 'Opens the printer dialog (or "Save as PDF") with print-optimised layout.') +
      expCard('xlsx', I.xls, 'Excel (.xlsx)', 'One sheet per section, with the AIXM line of each row. Very large tables are split automatically.') +
      expCard('json', I.json, 'JSON', 'Structured data with the source reference (feature, UUID, line, byte offset) of every value.') +
      expCard('mail', I.mail, 'E-mail for Outlook', 'Formatted e-mail you can copy & paste into Outlook, or save as .eml (opens as a draft) / .html.') + '</div>' +
      '<h3 style="margin:22px 0 10px">3 · Convert AIXM and GIS formats <span class="muted" style="font-weight:400">(whole data set)</span></h3><div class="export-grid">' +
      (ds.family === '5' ? '<div class="card export-card"><h4>' + I.code + 'Convert AIXM version</h4><div class="muted" style="font-size:13px;flex:1">Rewrites this ' + esc(ds.sniff.versionLabel) + ' file as another AIXM 5 version (namespaces, schema location, renamed 5.2 features). Streams the original file — works for multi-GB files. A conversion report lists items to review.</div>' +
        '<div class="row"><select class="inp" id="cv-target"><option value="5.2">AIXM 5.2</option><option value="5.1.1">AIXM 5.1.1</option><option value="5.1">AIXM 5.1</option></select><button class="btn primary" data-cv="ver">Convert</button></div></div>' :
        '<div class="card export-card"><h4>' + I.code + 'AIXM 4.5 → AIXM 5.1.1</h4><div class="muted" style="font-size:13px;flex:1">Writes an AIXM 5.1.1 BasicMessage from this 4.5 data set (aerodromes, runways, declared distances, lighting, navaids, points, airspace with borders, routes, obstacles, units, services, frequencies…). UUIDs are derived from the 4.5 identifiers.</div><button class="btn primary" data-cv="45">Convert to 5.1.1</button></div>') +
      '<div class="card export-card"><h4>' + I.map + 'GeoJSON</h4><div class="muted" style="font-size:13px;flex:1">All features with geometry (WGS 84) and key attributes, for QGIS, ArcGIS, web maps.</div><button class="btn primary" data-cv="geojson">Export GeoJSON</button></div>' +
      '<div class="card export-card"><h4>' + I.map + 'KML (Google Earth)</h4><div class="muted" style="font-size:13px;flex:1">Folders per feature type, styled airspace, routes, points and obstacles with attribute tables.</div><button class="btn primary" data-cv="kml">Export KML</button></div>' +
      '<div class="card export-card"><h4>' + I.map + 'ESRI Shapefile (.zip)</h4><div class="muted" style="font-size:13px;flex:1">Separate point, line and polygon shapefiles with .dbf attributes and WGS 84 .prj.</div><button class="btn primary" data-cv="shp">Export Shapefile</button></div></div>';
    function scope() {
      var sc = $('input[name="scope"]:checked', v).value;
      if (sc === 'features') return { title: ds.state + ' — all AIXM features', ds: ds, sections: [], features: ds.recs };
      var sections = [];
      function addItem(it) { sections.push(AIP.build(ds, it)); }
      if (sc === 'all' || sc === 'GEN') cat[0].children.forEach(addItem);
      if (sc === 'all' || sc === 'ENR') cat[1].children.forEach(addItem);
      if (sc === 'all' || sc === 'AD') cat[2].children.forEach(addItem);
      if (sc === 'ads') $$('.ad-pick:checked', v).forEach(function (cb) { addItem(AIP.findSection(ds, cb.value)); });
      if (!sections.length) { toast('Nothing selected'); return null; }
      return { title: ds.state + ' — ' + ({ all: 'AIP data (GEN, ENR, AD)', GEN: 'GEN', ENR: 'ENR', AD: 'AD aerodromes', ads: 'selected aerodromes' })[sc], sub: ds.name, ds: ds, sections: sections };
    }
    $$('[data-cv]', v).forEach(function (b) {
      b.onclick = async function () {
        var k = b.getAttribute('data-cv'), base = EXPORTS.safeName(ds.state + '_' + ds.name.replace(/\.[^.]+$/, ''));
        try {
          if (k === 'geojson') EXPORTS.download(base + '.geojson', CONVERT.toGeoJSON(ds));
          else if (k === 'kml') EXPORTS.download(base + '.kml', CONVERT.toKML(ds));
          else if (k === 'shp') EXPORTS.download(base + '_shapefile.zip', CONVERT.toShapefile(ds));
          else if (k === '45') { var r45 = CONVERT.writer45(ds); EXPORTS.download(base + '_AIXM-5.1.1.xml', r45.blob); showReport(r45.report); }
          else if (k === 'ver') {
            if (!ds.file) { toast('The original file is not connected — open it again from Files or the Library.'); return; }
            var tgt = $('#cv-target', v).value, ov = overlay('Converting to AIXM ' + tgt);
            var res = await CONVERT.convertVersion(ds, tgt, function (f) { var bb = $('#ov-bar'); if (bb) bb.style.width = (f * 100).toFixed(0) + '%'; });
            ov.remove();
            EXPORTS.download(base + '_AIXM-' + tgt + '.xml', res.blob); showReport(res.report);
          }
        } catch (err) { var o2 = $('#overlay'); if (o2) o2.remove(); toast('Conversion failed: ' + err.message, 7000); }
      };
    });
    $$('[data-exp]', v).forEach(function (b) {
      b.onclick = function () {
        var sc = scope();
        if (!sc) return;
        var k = b.getAttribute('data-exp');
        if (sc.features && (k === 'pdf' || k === 'print' || k === 'mail')) { toast('Raw feature export is available as JSON or Excel. Choose an AIP scope for PDF / print / e-mail.'); return; }
        if (k === 'pdf' && !sc.features) { var bb = MAPVIEW.datasetBounds(ds); if (bb) sc.mapImage = MAPVIEW.renderImage(ds, bb, 1600, 990, { title: ds.state }); }
        runExport(k, sc);
      };
    });
  }
  function showReport(rep) {
    var back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = '<div class="modal"><div class="modal-head"><h3>Conversion report — ' + esc(rep.from) + ' → ' + esc(rep.to) + '</h3><span class="sp"></span><button class="btn small ghost" data-close>' + I.x + '</button></div><div class="modal-body">' +
      '<ul>' + rep.notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + (rep.renamed ? '<li>' + rep.renamed + ' element tag(s) renamed.</li>' : '') + '</ul><p class="muted">The converted file has been downloaded.</p></div></div>';
    document.body.appendChild(back);
    back.addEventListener('click', function (e) { if (e.target === back || e.target.closest('[data-close]') || e.target.closest('[data-about-page]')) back.remove(); });
  }
  function expCard(k, icon, t, d) { return '<div class="card export-card"><h4>' + icon + t + '</h4><div class="muted" style="font-size:13px;flex:1">' + d + '</div><button class="btn primary" data-exp="' + k + '">Export</button></div>'; }

  /* ----------------------------------------------------------- e-mail */
  function openEmail(scope) {
    var mail = EXPORTS.emailContent(scope);
    var back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = '<div class="modal"><div class="modal-head">' + I.mail.replace('<svg', '<svg width="20" height="20"') + '<h3>E-mail — ready to paste into Outlook</h3><span class="sp"></span><button class="btn small ghost" data-m="close">' + I.x + '</button></div>' +
      '<div class="modal-body"><label class="muted" style="font-size:12px">Subject</label><div class="row" style="margin-bottom:10px"><input class="inp grow" id="m-subj" value="' + esc(mail.subject) + '"><button class="btn small" data-m="subj">' + I.copy + ' Copy subject</button></div>' +
      '<div class="email-preview" id="m-prev">' + mail.html + '</div>' +
      '<p class="muted" style="font-size:12.5px;margin:10px 0 0">No mail program is opened. <b>Copy e-mail</b> puts the formatted text (with tables) on the clipboard — in Outlook create a new message and press Ctrl+V. Or save a <b>.eml</b> file: double-click it to open it in Outlook as a new draft.</p></div>' +
      '<div class="modal-foot"><button class="btn" data-m="txt">' + I.file + ' Save .txt</button><button class="btn" data-m="html">' + I.file + ' Save .html</button><button class="btn" data-m="eml">' + I.mail + ' Save .eml (Outlook draft)</button><button class="btn primary" data-m="copy">' + I.copy + ' Copy e-mail</button></div></div>';
    document.body.appendChild(back);
    back.addEventListener('click', function (e) {
      if (e.target === back) { back.remove(); return; }
      var b = e.target.closest('[data-m]');
      if (!b) return;
      var k = b.getAttribute('data-m'), subj = $('#m-subj', back).value;
      mail.subject = subj;
      var name = EXPORTS.safeName(subj);
      if (k === 'close') back.remove();
      else if (k === 'subj') EXPORTS.copyText(subj).then(function (ok) { toast(ok ? 'Subject copied' : 'Copy failed'); });
      else if (k === 'copy') EXPORTS.copyRich(mail.html, mail.text).then(function (ok) { toast(ok ? 'E-mail copied — paste it into a new Outlook message (Ctrl+V)' : 'Copy failed — use Save .html instead', 5000); });
      else if (k === 'html') EXPORTS.download(name + '.html', new Blob(['<!doctype html><html><head><meta charset="utf-8"><title>' + esc(subj) + '</title></head><body>' + mail.html + '</body></html>'], { type: 'text/html' }));
      else if (k === 'txt') EXPORTS.download(name + '.txt', new Blob([mail.text], { type: 'text/plain' }));
      else if (k === 'eml') EXPORTS.download(name + '.eml', EXPORTS.emlBlob(mail));
    });
  }

  /* ----------------------------------------------------------- search */
  function initSearch() {
    var inp = $('#search');
    inp.disabled = !S.datasets.length;
  }
  function buildIndex(ds) {
    if (ds.searchIdx) return ds.searchIdx;
    var idx = [];
    ds.recs.forEach(function (r) {
      var p = r.cur.p;
      var txt = [M.label(ds, r), s(p.designator), s(p.name), s(p.locationIndicatorICAO), s(p.designatorIATA), r.k, r.k === 'RadioCommunicationChannel' ? M.fFreq(r) : '', s(p.channel)].join(' ').toLowerCase();
      idx.push([txt, r]);
    });
    ds.searchIdx = idx;
    return idx;
  }
  var RANK = { AirportHeliport: 0, Runway: 1, RunwayDirection: 1, Navaid: 2, VOR: 2, NDB: 2, DME: 2, DesignatedPoint: 3, Airspace: 4, Route: 5, Unit: 6, RadioCommunicationChannel: 6 };
  function doSearch(q) {
    q = q.trim().toLowerCase();
    var box = $('#search-results');
    if (q.length < 2) { box.classList.add('hidden'); return; }
    var res = [];
    S.datasets.forEach(function (ds) {
      var idx = buildIndex(ds);
      for (var i = 0; i < idx.length && res.length < 400; i++) {
        var t = idx[i][0], pos = t.indexOf(q);
        if (pos >= 0) res.push({ ds: ds, r: idx[i][1], score: (pos === 0 ? 0 : 1) + (RANK[idx[i][1].k] === undefined ? 8 : RANK[idx[i][1].k]) });
      }
    });
    res.sort(function (a, b) { return a.score - b.score; });
    res = res.slice(0, 60);
    cellRegistry = cellRegistry || [];
    box.innerHTML = res.length ? res.map(function (x, i) {
      var sec = AIP.sectionOf(x.ds, x.r);
      return '<div class="sr-item' + (i === 0 ? ' active' : '') + '" data-sr="' + i + '"><span class="chip brand">' + esc(x.r.k.replace(/^45:/, '')) + '</span><div class="grow"><div>' + esc(M.label(x.ds, x.r)) + '</div><small>' + esc(sec.no + (sec.ad ? ' ' + M.shortName(sec.ad) : '')) + ' · ' + esc(x.ds.state) + '</small></div><small>line ' + num(x.r.line) + '</small></div>';
    }).join('') : '<div class="sr-item muted">No match</div>';
    box.classList.remove('hidden');
    box._res = res;
  }
  function closeSearch() { var b = $('#search-results'); if (b) b.classList.add('hidden'); }
  function pickSearch(i) {
    var box = $('#search-results'), x = box._res && box._res[i];
    if (!x) return;
    closeSearch();
    $('#search').blur();
    var sec = AIP.sectionOf(x.ds, x.r);
    if (sec.id) openAipFor(x.ds, x.r); else openDetail(x.ds, x.r);
  }
  $('#search').addEventListener('input', function (e) { clearTimeout(e.target._t); e.target._t = setTimeout(function () { doSearch(e.target.value); }, 160); });
  $('#search').addEventListener('keydown', function (e) {
    var box = $('#search-results'), items = $$('.sr-item[data-sr]', box), cur = items.findIndex(function (n) { return n.classList.contains('active'); });
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!items.length) return;
      var n = e.key === 'ArrowDown' ? Math.min(items.length - 1, cur + 1) : Math.max(0, cur - 1);
      items.forEach(function (x) { x.classList.remove('active'); }); items[n].classList.add('active'); items[n].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') { if (cur >= 0) pickSearch(+items[cur].getAttribute('data-sr')); }
  });
  $('#search-results').addEventListener('click', function (e) { var n = e.target.closest('[data-sr]'); if (n) pickSearch(+n.getAttribute('data-sr')); });
  document.addEventListener('click', function (e) { if (!e.target.closest('#search-wrap')) closeSearch(); });

  /* ------------------------------------------------------------- help */
  $('#help-btn').addEventListener('click', function () { showHelp(false); });
  function showHelp(about) {
    var back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = '<div class="modal"><div class="modal-head">' + I.info.replace('<svg', '<svg width="20" height="20"') + '<h3>AIXM Code Converter — help</h3><span class="sp"></span><button class="btn small ghost" data-close>' + I.x + '</button></div><div class="modal-body">' +
      '<div class="nfo-box"><b>⚠ Not for operational use.</b> ' + esc(APP_INFO.disclaimer.replace(/^NOT FOR OPERATIONAL USE\. /, '')) + '</div>' +
      '<p><b>What it does.</b> Reads AIXM files of any version (4.5 Snapshot/Update, 5.0, 5.1, 5.1.1, 5.2 including pre-releases), detects the version, extracts the aeronautical data and presents it like the <b>ICAO specimen AIP</b> (GEN, ENR 1–6, AD 2 / AD 3 for every aerodrome and heliport). Everything runs offline inside this single HTML file — no data is uploaded anywhere.</p>' +
      '<p><b>Large files.</b> Files are streamed in 16 MB chunks by parallel background threads; only the extracted values are kept in memory. The exact position (line, byte offset) of each feature is remembered, so <span class="kbd">&lt;/&gt;</span> opens the original AIXM code instantly, even for multi-GB files.</p>' +
      '<p><b>Effective dates.</b> The header shows the State, AIXM version, AIRAC cycle and effective date. Every row shows the effective date of its feature. Use <b>Latest data / Valid on date</b> (top bar) to see the data valid on any date (AIXM temporality: BASELINE, PERMDELTA, TEMPDELTA).</p>' +
      '<p><b>Changes.</b> <i>Changes</i> lists the time slices inside one file (what changes, where, when). <i>Compare</i> compares two files of the same State (e.g. two AIRAC cycles, any versions) and lists added / removed / modified data with old → new values; results can also be shown on the map.</p>' +
      '<p><b>AIRAC cycle changes.</b> Values that change in the selected AIRAC cycle are shown <span class="chg-badge">in red</span> on every AIP page; <b>List all changes</b> and <b>AMDT report</b> give the amendment (publication and effective dates, affected sections, insert/amend/delete). <b>⇆ Side by side</b> on any section shows before/after a cycle, or two files. <i>Timeline</i> shows the changes per AIRAC cycle and temporary changes; <i>NOTAM</i> shows Digital NOTAM events as ICAO NOTAM text.</p>' +
      '<p><b>Map.</b> A complete offline world map is built in. When the laptop is online you can switch to OpenStreetMap (CARTO Voyager is used when the standard server refuses a local file) or satellite imagery. Instrument procedures can be drawn per aerodrome. <b>Airport view</b>: airport chart (runways to scale with markings, taxiway signs, stands, ILS) and an information card. <b>🗻 3D view</b>: terrain, airspace volumes, approach and departure crew views; <i>Grid MORA</i> and terrain elevation on the map. <b>⧉ New window</b> puts the map on a second screen. <b>Print map</b>: drag an area, choose A4/A3, legend, north arrow and grid.</p>' +
      '<p><b>Quality.</b> Basic checks, the official AIXM 5.1 business rules (SBVR) and their catalogue, the ICAO Annex 14 obstacle limitation surfaces (penetrations, also in 3D) and data integrity (PANS-AIM accuracy, CRC32Q fingerprints, verification against a saved CRC list). Instrument approaches in AD 2.22 show their vertical profile.</p>' +
      '<p><b>Library, links and languages.</b> Connect a folder with one sub-folder per State; extracted data is kept for instant reopening. ☆ saves views; the address (#…) of any view can be shared. The interface is available in English, العربية (right-to-left), Français and Español. Files over 1.5 GB use the Lite memory mode automatically.</p>' +
      '<p><b>Exports.</b> Any single section or the whole data set: JSON (with source references), Excel, printable PDF, print, or an e-mail to paste into Outlook (.eml opens as a draft).</p>' +
      '<p><b>Sources.</b> AIXM schemas, code lists and definitions from aixm.aero (4.5 r2, 5.1, 5.1.1, 5.2), AIXM temporality and feature-identification concepts, ICAO Annex 15 / PANS-AIM AIP structure. Base map: Natural Earth (public domain). Terrain: Terrain Tiles (Mapzen / AWS Open Data: SRTM, GMTED2010, ETOPO1). Libraries: Leaflet, three.js, SheetJS, jsPDF, fflate, topojson.</p>' +
      '<p class="muted">Keyboard: <span class="kbd">Ctrl</span>+<span class="kbd">K</span> search · <span class="kbd">Esc</span> close panels.</p>' +
      '<div class="about-box" id="about"><b>About · version ' + APP_INFO.version + ' <button class="btn small" data-about-page style="float:right">About this tool</button></b><div>AIXM Code Converter — created by <b>Prasad Selvaraj</b> (<a href="mailto:prasad2t@gmail.com">prasad2t@gmail.com</a>).</div><div>© 2026 Prasad Selvaraj. Open source under the Apache License 2.0; redistributions must keep this attribution (see the NOTICE file).</div>' +
      '<div class="muted" style="font-size:12px">Includes Leaflet (BSD-2), three.js (MIT), SheetJS CE (Apache-2.0), jsPDF and jsPDF-AutoTable (MIT), fflate (MIT), TopoJSON client and world-atlas (ISC), Natural Earth data (public domain), Terrain Tiles elevation data (Mapzen / AWS Open Data; SRTM, GMTED2010, ETOPO1 and others), AIXM schemas and business rules © EUROCONTROL & FAA (aixm.aero).</div></div></div></div>';
    document.body.appendChild(back);
    back.addEventListener('click', function (e) { if (e.target === back || e.target.closest('[data-close]') || e.target.closest('[data-about-page]')) back.remove(); });
    if (about) { var ab = back.querySelector('#about'); if (ab) ab.scrollIntoView({ block: 'center' }); }
  }

  /* ------------------------------------------------------------ start */
  window.addEventListener('beforeunload', function (e) { if (S.datasets.length) { e.preventDefault(); e.returnValue = ''; } });
  renderNav();
  go('files');
  libInit().then(function () { if (LIB.status !== 'none') { startWatch(); if (!S.datasets.length) go('library'); } });
  window.__AIXM = { S: S, go: go, LIB: LIB, libRescan: libRescan, openLibFile: openLibFile, openLatest: openLatest, useHandle: async function (h) { await LIBRARY.useHandle(h); LIB.status = 'granted'; await libRescan(); startWatch(); }, addFiles: addFiles, extractAll: extractAll, openXml: openXml, openDetail: openDetail };
})();
