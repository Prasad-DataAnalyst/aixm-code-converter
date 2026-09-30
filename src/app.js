/* =============================================================================
 * AIXM Code Converter - application (UI, extraction orchestration)
 * ========================================================================== */
/* global AX, MODEL, AIP, ANALYSIS, MAPVIEW, EXPORTS, fflate */
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
    asOf: null
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
  function dsOf() { return S.datasets[S.active] || null; }

  /* ------------------------------------------------------------- icons */
  function ic(path, extra) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" ' + (extra || '') + '>' + path + '</svg>'; }
  var I = {
    upload: ic('<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>'),
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
    play: ic('<path d="M6 4l14 8-14 8z"/>')
  };

  /* --------------------------------------------------------------- nav */
  var VIEWS = [
    ['files', 'Files', I.upload], ['dash', 'Dashboard', I.dash], ['aip', 'AIP', I.book], ['map', 'Map', I.map], null,
    ['changes', 'Changes', I.changes], ['compare', 'Compare', I.compare], ['quality', 'Quality', I.check], ['explorer', 'Explorer', I.list], null,
    ['export', 'Export', I.export]
  ];
  function renderNav() {
    var has = S.datasets.length > 0;
    $('#nav').innerHTML = VIEWS.map(function (v) {
      if (!v) return '<div class="nav-sep"></div>';
      var dis = !has && v[0] !== 'files';
      return '<button data-view="' + v[0] + '" class="' + (S.view === v[0] ? 'active' : '') + '"' + (dis ? ' disabled' : '') + ' title="' + v[1] + '">' + v[2] + '<span>' + v[1] + '</span></button>';
    }).join('');
  }
  $('#nav').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-view]');
    if (b && !b.disabled) go(b.getAttribute('data-view'));
  });
  function go(view, opts) {
    S.view = view;
    renderNav();
    closeSearch();
    var main = $('#main');
    main.innerHTML = '';
    var v = document.createElement('div');
    v.className = 'view' + (view === 'aip' || view === 'map' || view === 'explorer' ? ' full' : '');
    main.appendChild(v);
    ({ files: viewFiles, dash: viewDash, aip: viewAip, map: viewMap, changes: viewChanges, compare: viewCompare, quality: viewQuality, explorer: viewExplorer, export: viewExport })[view](v, opts || {});
  }

  /* ------------------------------------------------------------- theme */
  function applyTheme(t) {
    S.theme = t;
    if (t) document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme');
    var dark = t === 'dark' || (!t && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    $('#theme-btn').innerHTML = (dark ? I.sun : I.moon).replace('<svg', '<svg width="16" height="16"');
    try { localStorage.setItem('aixm-theme', t || ''); } catch (e) { /* storage unavailable */ }
    if (MAPVIEW.isMounted()) MAPVIEW.refreshTheme();
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
      '<div class="filelist" id="filelist"></div>' +
      '<div class="extract-bar card" id="extract-bar"></div>';
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
    bar.innerHTML = '<div class="grow"><b>' + S.files.length + ' file(s)</b> <span class="muted">· ' + ready.length + ' ready to extract · parallel threads: ' + threads() + '</span></div>' +
      (S.datasets.length ? '<button class="btn" id="goto-dash">' + I.dash + ' Open dashboard</button>' : '') +
      '<button class="btn primary big" id="extract-btn"' + (!ready.length || busy ? ' disabled' : '') + '>' + I.play + ' Extract</button>';
    var eb = $('#extract-btn'); if (eb) eb.onclick = function () { extractAll(); };
    var gd = $('#goto-dash'); if (gd) gd.onclick = function () { go('dash'); };
  }
  function updateFileItem(f) {
    var node = $('[data-fid="' + f.id + '"]');
    if (!node) return;
    var bar = $('.progress > div', node);
    if (bar) bar.style.width = (f.progress * 100).toFixed(1) + '%';
    var d = $('.muted', node);
    if (d && f.detail) d.innerHTML = fmtSize(f.size) + ' · ' + f.detail;
  }

  /* ---------------------------------------------------- extraction engine */
  var workerUrl = null;
  function threads() { return Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1)); }
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
    for (var i = 0; i < list.length; i++) await extractOne(list[i]);
    renderFileList();
    if (S.datasets.length) { initSearch(); renderDsSelect(); go('dash'); }
  }
  function cancelExtraction(id) {
    var r = running.get(id);
    if (!r) return;
    r.cancelled = true;
    r.workers.forEach(function (w) { w.terminate(); });
    r.resolve && r.resolve();
  }
  function extractOne(f) {
    return new Promise(function (resolve) {
      var sn = f.sniff, size = f.size;
      var nParts = Math.max(1, Math.min(threads(), Math.floor(size / (6 * 1024 * 1024)) || 1));
      if (sn.family === '45' && sn.isUpdate) nParts = Math.min(nParts, 4);
      var ds = { id: f.id, name: f.name, file: f.file, size: size, sniff: sn, family: sn.family, version: sn.version, recs: [], partLines: new Array(nParts), viewDate: S.asOf };
      var cfg = { family: sn.family, names: featureNames(sn), aixmPrefixes: sn.aixmPrefixes, eventPrefixes: sn.eventPrefixes, gmlPrefixes: sn.gmlPrefixes, isUpdate: sn.isUpdate, effective: sn.header && sn.header.effective };
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
            S.datasets = S.datasets.filter(function (x) { return x.id !== ds.id; });
            S.datasets.push(ds);
            f.status = 'done';
            f.detail = num(ds.recs.length) + ' features · ' + esc(ds.state) + (ds.airac ? ' · AIRAC ' + ds.airac.id : '') + ' · read in ' + (tRead / 1000).toFixed(1) + ' s (' + (size / 1048576 / (tRead / 1000)).toFixed(1) + ' MB/s)';
          } catch (err) {
            console.error(err);
            f.status = 'error'; f.error = String(err.stack || err); toast('Error while indexing ' + f.name + ': ' + err.message, 8000);
          }
          running.delete(f.id);
          renderFileList();
          renderNav();
          resolve();
        }, 30);
      }
    });
  }

  /* ---------------------------------------------------- dataset selector */
  function renderDsSelect() {
    var sel = $('#ds-select');
    if (S.datasets.length < 2) { sel.classList.add('hidden'); return; }
    sel.classList.remove('hidden');
    sel.innerHTML = S.datasets.map(function (d, i) { return '<option value="' + i + '"' + (i === S.active ? ' selected' : '') + '>' + esc(d.state + ' · ' + d.name) + '</option>'; }).join('');
  }
  $('#ds-select').addEventListener('change', function (e) { S.active = +e.target.value; S.aipSel = null; go(S.view); });

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
      var ch = S.changes.get(ds);
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
          ['ICAO prefixes', (ds.prefixes || []).join(', ')], ['Created', ds.created || '—'], ['Read time', (ds.tRead / 1000).toFixed(2) + ' s · ' + (ds.size / 1048576 / (ds.tRead / 1000)).toFixed(1) + ' MB/s'],
          ['Parse warnings', ds.parseErrors ? ds.parseErrors.length : 0]].map(function (r) { return '<tr><td class="muted">' + r[0] + '</td><td>' + esc(r[1]) + '</td></tr>'; }).join('') + '</table>' +
        '<div class="btn-group" style="margin-top:12px"><button class="btn primary" data-act="aip">' + I.book + ' Open AIP</button><button class="btn" data-act="map">' + I.map + ' Map</button><button class="btn" data-act="export">' + I.export + ' Export</button><button class="btn" data-act="remove">' + I.trash + ' Remove</button></div></div></div>';
      card.addEventListener('click', function (e) {
        S.active = idx; renderDsSelect();
        var t = e.target.closest('[data-type]'), a = e.target.closest('[data-ad]'), gg = e.target.closest('[data-go]'), act = e.target.closest('[data-act]');
        if (t) { S.explorerType = t.getAttribute('data-type'); S.explorerSel = null; go('explorer'); }
        else if (a) { var ad = ds.recs[+a.getAttribute('data-ad')]; S.aipSel = 'AD:' + ad.i; S.aipOpen['AD:' + ad.i] = true; S.aipOpen.AD = true; go('aip'); }
        else if (gg) go(gg.getAttribute('data-go'));
        else if (act) {
          var k = act.getAttribute('data-act');
          if (k === 'aip') go('aip'); else if (k === 'map') go('map'); else if (k === 'export') go('export');
          else if (k === 'remove') { S.datasets.splice(idx, 1); S.active = 0; S.cmp = null; renderDsSelect(); renderNav(); initSearch(); go(S.datasets.length ? 'dash' : 'files'); }
        }
      });
      g.appendChild(card);
    });
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
    var h = '<div class="side-head"><input class="inp grow" id="tree-filter" placeholder="Filter sections / aerodromes"></div><ul class="tree">';
    cat.forEach(function (g) {
      var open = S.aipOpen[g.id] !== false;
      h += '<li class="grp"><div class="node' + (open ? ' open' : '') + '" data-toggle="' + g.id + '">' + I.caret + '<span class="title">' + esc(g.title) + '</span><span class="sp"></span><span class="chip">' + g.children.length + '</span></div>';
      if (open) {
        h += '<ul>';
        if (!g.children.length) h += '<li><div class="node muted">No data in this part</div></li>';
        g.children.forEach(function (c) {
          if (c.children) {
            var o = !!S.aipOpen[c.id];
            h += '<li data-f="' + esc((c.no + ' ' + c.title).toLowerCase()) + '"><div class="node' + (o ? ' open' : '') + (S.aipSel === c.id ? ' active' : '') + '" data-sec="' + c.id + '" data-toggle="' + c.id + '">' + I.caret + '<span class="no">' + esc(c.no.replace(/^AD [23] /, '')) + '</span><span class="title">' + esc(c.title) + '</span></div>';
            if (o) h += '<ul>' + c.children.map(function (cc) { return '<li><div class="node' + (S.aipSel === cc.id ? ' active' : '') + '" data-sec="' + cc.id + '"><span class="no">' + esc(cc.no) + '</span><span class="title">' + esc(cc.title) + '</span></div></li>'; }).join('') + '</ul>';
            h += '</li>';
          } else h += '<li data-f="' + esc((c.no + ' ' + c.title).toLowerCase()) + '"><div class="node' + (S.aipSel === c.id ? ' active' : '') + '" data-sec="' + c.id + '"><span class="no">' + esc(c.no) + '</span><span class="title">' + esc(c.title) + '</span></div></li>';
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
  function cellHtml(c, ds) {
    if (!c || !c.t) return '<span class="nil">—</span>';
    var t = esc(c.t);
    if (!c.r) return t;
    var idx = cellRegistry.push({ ds: ds, r: c.r, p: c.p }) - 1;
    var tip = (c.tip ? c.tip + '\n' : '') + M.typeName(c.r) + (c.p ? ' · ' + c.p : '') + ' · line ' + num(c.r.line) + '\nClick to view the AIXM code';
    return '<span class="src" data-cell="' + idx + '" title="' + esc(tip) + '">' + t + '</span>';
  }
  function effOf(r) { return r && r.cur ? M.fmtTs(r.cur.b) : ''; }
  function sectionBodyHtml(ds, sec, rowLimit) {
    var h = '';
    (sec.blocks || []).forEach(function (b, bi) {
      if (b.title) h += '<div class="block-title">' + esc(b.title) + '</div>';
      if (b.kind === 'note') { h += '<div class="note-box">' + esc(b.text) + '</div>'; return; }
      if (b.kind === 'kv') {
        h += '<table class="aip-kv"><tbody>' + b.rows.map(function (r) {
          var cells = r.cells.filter(function (c) { return c && c.t; });
          var src = cells.filter(function (c) { return c.r; })[0];
          return '<tr><td class="no">' + esc(r.no || '') + '</td><td class="lbl">' + esc(r.label) + '</td><td class="val">' +
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
      return '<tr>' + r.map(function (c, i) { return '<td' + (ptRow && i === 0 ? ' class="pt"' : '') + '>' + cellHtml(c, ds) + '</td>'; }).join('') +
        '<td class="eff nowrap">' + (src ? esc(effOf(src.r)) + (src.r.ts.length > 1 ? '<br><span class="chip warn" style="height:18px">Δ ' + src.r.ts.length + '</span>' : '') : '') + '</td>' +
        '<td>' + (src ? '<span class="srcbtn" data-cell="' + (cellRegistry.push({ ds: ds, r: src.r, p: src.p }) - 1) + '" title="View AIXM code">&lt;/&gt;</span>' : '') + '</td></tr>';
    }).join('');
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
        '<div class="eff">' + (effAll !== null ? 'Latest effective date in this section: <b>' + M.fmtDate(effAll, true) + '</b>' : '') + (ds.viewDate !== null && ds.viewDate !== undefined ? ' · data valid on ' + M.fmtDate(ds.viewDate) : ' · latest time slices') + '</div></div>' +
        '<div class="btn-group">' + (adRec ? '<button class="btn small" data-x="map">' + I.map + ' Map</button>' : '') +
        '<button class="btn small" data-x="print">' + I.print + ' Print</button><button class="btn small" data-x="pdf">' + I.pdf + ' PDF</button><button class="btn small" data-x="xlsx">' + I.xls + ' Excel</button>' +
        '<button class="btn small" data-x="json">' + I.json + ' JSON</button><button class="btn small" data-x="mail">' + I.mail + ' E-mail</button></div></div><div class="sec-body">';
      secs.forEach(function (x) {
        h += '<div class="aip-sec" data-secid="' + esc(x.id || '') + '">' + (secs.length > 1 ? '<h3><span class="no">' + esc(x.no) + '</span> ' + esc(x.title) + '</h3>' : '') + sectionBodyHtml(ds, x) + '</div>';
      });
      h += '</div>';
      host.innerHTML = h;
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
  function runExport(kind, scope, adRec) {
    try {
      if (kind === 'map' && adRec) { go('map', { ds: scope.ds, focus: adRec }); return; }
      if ((kind === 'pdf' || kind === 'print') && adRec && !scope.mapImage) {
        var b = MAPVIEW.boundsAround(scope.ds, adRec, 12);
        if (b) scope.mapImage = MAPVIEW.renderImage(scope.ds, b, 1600, 990, { title: M.label(scope.ds, adRec) });
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
      '<b>Validity</b><span>' + esc(tsSummary(r)) + '</span></div>' +
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
      if (k === '_t' || k === '_geo' && !p._geo) return;
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

  /* ============================================================ MAP */
  function viewMap(v, opts) {
    if (!S.datasets.length) { v.innerHTML = emptyState('No data', 'Extract a file first.'); return; }
    MAPVIEW.mount(v, S.datasets, {
      toast: toast, openAip: openAipFor, openXml: function (ds, r) { openXml(ds, r); }, openDetail: function (ds, r) { openDetail(ds, r); },
      savePng: function (url) { fetch(url).then(function (res) { return res.blob(); }).then(function (b) { EXPORTS.download('aixm-map.png', b); }); }
    }, { ds: opts.ds || dsOf(), cmp: S.cmp });
    if (opts.focus) setTimeout(function () { MAPVIEW.focus(opts.ds || dsOf(), opts.focus); }, 250);
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
      '<button class="btn small" id="cmp-map">' + I.map + ' Show on map</button><button class="btn small" id="cmp-pdf">' + I.pdf + ' PDF</button><button class="btn small" id="cmp-xlsx">' + I.xls + ' Excel</button><button class="btn small" id="cmp-json">' + I.json + ' JSON</button><button class="btn small" id="cmp-mail">' + I.mail + ' E-mail</button></div>' +
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
    $('#cmp-pdf').onclick = function () { runExport('pdf', scope()); };
    $('#cmp-xlsx').onclick = function () { runExport('xlsx', scope()); };
    $('#cmp-json').onclick = function () { runExport('json', scope()); };
    $('#cmp-mail').onclick = function () { runExport('mail', scope()); };
  }

  /* ========================================================= QUALITY */
  function viewQuality(v) {
    var ds = dsOf();
    if (!ds) { v.innerHTML = emptyState('No data', ''); return; }
    var iss = S.quality.get(ds);
    v.innerHTML = '<h1 class="view-title">Data quality check</h1><p class="view-sub">Checks based on the AIXM schema code lists, AIXM temporality rules and the minimum ICAO AIP data: coordinates, references, frequencies, bearings, missing mandatory AIP items. ' + esc(ds.state) + ' · ' + esc(ds.name) + '</p>' +
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
      expCard('mail', I.mail, 'E-mail for Outlook', 'Formatted e-mail you can copy & paste into Outlook, or save as .eml (opens as a draft) / .html.') + '</div>';
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
  $('#help-btn').addEventListener('click', function () {
    var back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = '<div class="modal"><div class="modal-head">' + I.info.replace('<svg', '<svg width="20" height="20"') + '<h3>AIXM Code Converter — help</h3><span class="sp"></span><button class="btn small ghost" data-close>' + I.x + '</button></div><div class="modal-body">' +
      '<p><b>What it does.</b> Reads AIXM files of any version (4.5 Snapshot/Update, 5.0, 5.1, 5.1.1, 5.2 including pre-releases), detects the version, extracts the aeronautical data and presents it like the <b>ICAO specimen AIP</b> (GEN, ENR 1–6, AD 2 / AD 3 for every aerodrome and heliport). Everything runs offline inside this single HTML file — no data is uploaded anywhere.</p>' +
      '<p><b>Large files.</b> Files are streamed in 16 MB chunks by parallel background threads; only the extracted values are kept in memory. The exact position (line, byte offset) of each feature is remembered, so <span class="kbd">&lt;/&gt;</span> opens the original AIXM code instantly, even for multi-GB files.</p>' +
      '<p><b>Effective dates.</b> The header shows the State, AIXM version, AIRAC cycle and effective date. Every row shows the effective date of its feature. Use <b>Latest data / Valid on date</b> (top bar) to see the data valid on any date (AIXM temporality: BASELINE, PERMDELTA, TEMPDELTA).</p>' +
      '<p><b>Changes.</b> <i>Changes</i> lists the time slices inside one file (what changes, where, when). <i>Compare</i> compares two files of the same State (e.g. two AIRAC cycles, any versions) and lists added / removed / modified data with old → new values; results can also be shown on the map.</p>' +
      '<p><b>Map.</b> A complete offline world map is built in. When the laptop is online you can switch to OpenStreetMap or OSM-based styles (CARTO, OpenTopoMap) or satellite imagery.</p>' +
      '<p><b>Exports.</b> Any single section or the whole data set: JSON (with source references), Excel, printable PDF, print, or an e-mail to paste into Outlook (.eml opens as a draft).</p>' +
      '<p><b>Sources.</b> AIXM schemas, code lists and definitions from aixm.aero (4.5 r2, 5.1, 5.1.1, 5.2), AIXM temporality and feature-identification concepts, ICAO Annex 15 / PANS-AIM AIP structure. Base map: Natural Earth (public domain). Libraries: Leaflet, SheetJS, jsPDF, fflate, topojson.</p>' +
      '<p class="muted">Keyboard: <span class="kbd">Ctrl</span>+<span class="kbd">K</span> search · <span class="kbd">Esc</span> close panels.</p></div></div>';
    document.body.appendChild(back);
    back.addEventListener('click', function (e) { if (e.target === back || e.target.closest('[data-close]')) back.remove(); });
  });

  /* ------------------------------------------------------------ start */
  window.addEventListener('beforeunload', function (e) { if (S.datasets.length) { e.preventDefault(); e.returnValue = ''; } });
  renderNav();
  go('files');
  window.__AIXM = { S: S, go: go, addFiles: addFiles, extractAll: extractAll, openXml: openXml, openDetail: openDetail };
})();
