/*!
 * AIXM Code Converter
 * Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com> - author of the AIXM Code Converter
 * SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE; keep this notice in all copies)
 * ==========================================================================
 * AIXM Code Converter - local State library + persistent cache
 *  - connects to a folder on the local drive (File System Access API) whose
 *    sub-folders are States (e.g. Saudi, UAE, India); the folder handle is kept
 *    in IndexedDB so the library re-opens automatically next time
 *  - scans State folders for AIXM files, detects new files, can write dropped
 *    files into a State folder
 *  - stores extracted data sets in IndexedDB so re-opening / switching States
 *    is instant (no re-reading of large files)
 *  Fallback (browsers without the API): pick the folder once per session.
 * ========================================================================== */
/* global AX, APP_SETTINGS */
var LIBRARY = (function () {
  'use strict';
  var DBN = 'aixm-code-converter', DBV = 2, dbp = null;
  var EXT = /\.(xml|aixm|gml|zip)$/i;

  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      var rq = indexedDB.open(DBN, DBV);
      rq.onupgradeneeded = function () {
        var d = rq.result;
        ['kv', 'meta', 'chunks', 'sniff'].forEach(function (n) { if (!d.objectStoreNames.contains(n)) d.createObjectStore(n); });
      };
      rq.onsuccess = function () { res(rq.result); };
      rq.onerror = function () { rej(rq.error); };
    });
    return dbp;
  }
  function tx(store, mode, fn) {
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var t = d.transaction(store, mode), st = t.objectStore(store), out;
        var r = fn(st);
        if (r && 'onsuccess' in r) r.onsuccess = function () { out = r.result; };
        t.oncomplete = function () { res(out); };
        t.onerror = function () { rej(t.error); };
        t.onabort = function () { rej(t.error); };
      });
    });
  }
  function get(store, key) { return tx(store, 'readonly', function (s) { return s.get(key); }); }
  function put(store, key, val) { return tx(store, 'readwrite', function (s) { return s.put(val, key); }); }
  function del(store, key) { return tx(store, 'readwrite', function (s) { return s.delete(key); }); }
  function keys(store) { return tx(store, 'readonly', function (s) { return s.getAllKeys(); }); }
  function getAll(store) { return tx(store, 'readonly', function (s) { return s.getAll(); }); }

  /* --------------------------------------------------------------- folder */
  var supported = typeof window !== 'undefined' && !!window.showDirectoryPicker;
  var root = null, fallbackFiles = null;
  async function connect() {
    if (!supported) throw new Error('This browser cannot keep a folder connected. Use Chrome or Edge, or pick the folder for this session.');
    var h = await window.showDirectoryPicker({ id: 'aixm-library', mode: 'readwrite' });
    root = h; fallbackFiles = null;
    await put('kv', 'root', h);
    return h;
  }
  async function useHandle(h) { root = h; fallbackFiles = null; try { await put('kv', 'root', h); } catch (e) { /* handle not storable */ } }
  async function restore() {
    var h = null;
    try { h = await get('kv', 'root'); } catch (e) { return { state: 'none' }; }
    if (!h) return { state: 'none' };
    root = h;
    var p = 'granted';
    try { if (h.queryPermission) p = await h.queryPermission({ mode: 'readwrite' }); } catch (e) { p = 'prompt'; }
    return { state: p === 'granted' ? 'granted' : 'prompt', name: h.name };
  }
  async function reconnect() {
    if (!root) return false;
    var p = await root.requestPermission({ mode: 'readwrite' });
    return p === 'granted';
  }
  async function forget() { root = null; fallbackFiles = null; await del('kv', 'root'); }
  function useFallback(fileList) { // <input webkitdirectory>
    fallbackFiles = Array.prototype.slice.call(fileList);
    root = null;
  }
  function rootName() { return root ? root.name : fallbackFiles && fallbackFiles.length ? (fallbackFiles[0].webkitRelativePath || '').split('/')[0] : null; }
  function isConnected() { return !!root || !!fallbackFiles; }
  function fileKey(path, size, mtime) { return path + '|' + size + '|' + mtime; }

  async function scanDir(dir, prefix, depth, out) {
    for await (var entry of dir.values()) {
      if (entry.name.charAt(0) === '.' || entry.name === '__MACOSX') continue;
      if (entry.kind === 'directory') { if (depth < 3) await scanDir(entry, prefix + entry.name + '/', depth + 1, out); }
      else if (EXT.test(entry.name)) {
        try {
          var f = await entry.getFile();
          out.push({ name: f.name, path: prefix + f.name, size: f.size, mtime: f.lastModified, handle: entry, key: fileKey(prefix + f.name, f.size, f.lastModified) });
        } catch (e) { /* unreadable file */ }
      }
    }
    return out;
  }
  // -> {root, states:[{name, files:[...]}], loose:[...]}
  async function scan() {
    var states = new Map(), loose = [];
    function add(stateName, f) { if (!stateName) { loose.push(f); return; } var s = states.get(stateName); if (!s) states.set(stateName, s = { name: stateName, files: [] }); s.files.push(f); }
    if (root) {
      for await (var entry of root.values()) {
        if (entry.name.charAt(0) === '.') continue;
        if (entry.kind === 'directory') {
          var files = await scanDir(entry, entry.name + '/', 1, []);
          if (!states.has(entry.name)) states.set(entry.name, { name: entry.name, files: [] });
          files.forEach(function (f) { add(entry.name, f); });
        } else if (EXT.test(entry.name)) {
          var ff = await entry.getFile();
          add(null, { name: ff.name, path: ff.name, size: ff.size, mtime: ff.lastModified, handle: entry, key: fileKey(ff.name, ff.size, ff.lastModified) });
        }
      }
    } else if (fallbackFiles) {
      fallbackFiles.forEach(function (f) {
        if (!EXT.test(f.name)) return;
        var parts = (f.webkitRelativePath || f.name).split('/');
        var rel = parts.slice(1).join('/');
        var st = parts.length > 2 ? parts[1] : null;
        add(st, { name: f.name, path: rel, size: f.size, mtime: f.lastModified, file: f, key: fileKey(rel, f.size, f.lastModified) });
      });
    }
    var list = Array.from(states.values()).sort(function (a, b) { return a.name.localeCompare(b.name); });
    list.forEach(function (s) { s.files.sort(function (a, b) { return (fileDate(b) || 0) - (fileDate(a) || 0) || b.mtime - a.mtime; }); });
    return { root: rootName(), states: list, loose: loose };
  }
  function fileDate(f) {
    var m = /(20\d\d|19\d\d)[-_.]?(0[1-9]|1[0-2])[-_.]?(0[1-9]|[12]\d|3[01])(?:[T_-]?([01]\d|2[0-3])([0-5]\d)(?!\d))?/.exec(f.name);
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) : null;
  }
  async function fileOf(f) { return f.file || (f.handle ? await f.handle.getFile() : null); }
  async function writeInto(stateName, file) {
    if (!root) throw new Error('No writable library folder is connected.');
    var dir = await root.getDirectoryHandle(stateName, { create: true });
    var fh = await dir.getFileHandle(file.name, { create: true });
    var w = await fh.createWritable();
    await w.write(file);
    await w.close();
    return fh;
  }
  async function createState(name) { if (!root) throw new Error('No writable library folder is connected.'); await root.getDirectoryHandle(name, { create: true }); }

  /* ---------------------------------------------------------- sniff cache */
  async function sniffOf(f) {
    try { var c = await get('sniff', f.key); if (c) return c; } catch (e) { /* ignore */ }
    var file = await fileOf(f);
    var head = await file.slice(0, Math.min(file.size, 262144)).text();
    var sn = AX.sniff(head, f.name);
    try { await put('sniff', f.key, sn); } catch (e) { /* ignore */ }
    return sn;
  }

  /* -------------------------------------------------------- dataset cache */
  // Saved in small blocks while the browser is idle: packing a block for storage runs on the page's thread, and
  // large blocks froze the page for up to a second each during the first minutes after a big file was read.
  var CH = 500;
  function idle() {
    return new Promise(function (res) {
      if (typeof requestIdleCallback === 'function') requestIdleCallback(function () { res(); }, { timeout: 1500 });
      else setTimeout(res, 40);
    });
  }
  function slim(r) {
    var o = { k: r.k, id: r.id, ts: r.ts, o: r.o, n: r.n, line: r.line };
    if (r.f) o.f = r.f; // which file of a data set read from several files
    if (r.s45) o.s45 = r.s45;
    if (r.gid) o.gid = r.gid;
    if (r.occ) o.occ = r.occ;
    if (r.raw) o.raw = r.raw;
    if (r.chg) o.chg = r.chg;
    if (r.mid) o.mid = r.mid;
    if (r.err) o.err = r.err;
    return o;
  }
  // the features as read from the file: records the model builds itself (syn, e.g. the aerodrome an aerodrome mapping
  // file names only by its code) are left out and built again when the copy is opened
  async function saveDataset(key, ds) {
    var recs = ds.recs.filter(function (r) { return !r.syn; }), n = Math.ceil(recs.length / CH);
    for (var i = 0; i < n; i++) {
      await idle();
      if (ds.dropped) { for (var j = 0; j < i; j++) await del('chunks', key + '#' + j); return; } // removed meanwhile
      await put('chunks', key + '#' + i, recs.slice(i * CH, (i + 1) * CH).map(slim));
    }
    await put('meta', key, { key: key, name: ds.name, size: ds.size, sniff: ds.sniff, family: ds.family, version: ds.version, chunks: n, count: recs.length,
      parseErrors: (ds.parseErrors || []).map(slim), tRead: ds.tRead, errors: ds.errors, savedAt: Date.now(), lib: ds.lib || null, state: ds.state, lite: !!ds.lite, delivery: ds.delivery || null, fmt: 2,
      pv: APP_SETTINGS.parserVersion });
  }
  async function loadDataset(key) {
    var m = await get('meta', key);
    if (!m) return null;
    // saved by an older version of the parser: read the file again (and free the space)
    if ((m.pv || 1) !== APP_SETTINGS.parserVersion) { removeCached(key).catch(function () {}); return null; }
    var recs = [];
    for (var i = 0; i < m.chunks; i++) { var c = await get('chunks', key + '#' + i); if (!c) return null; for (var j = 0; j < c.length; j++) recs.push(c[j]); }
    return { name: m.name, size: m.size, sniff: m.sniff, family: m.family, version: m.version, recs: recs, parseErrors: m.parseErrors, tRead: m.tRead, errors: m.errors, prepared: true, lib: m.lib, cachedAt: m.savedAt, lite: m.lite, delivery: m.delivery || undefined, fmt: m.fmt || 1, pv: m.pv || 1 };
  }
  async function cachedKeys() { try { return new Set(await keys('meta')); } catch (e) { return new Set(); } }
  async function cachedList() { try { return await getAll('meta'); } catch (e) { return []; } }
  async function removeCached(key) {
    var m = await get('meta', key);
    if (m) for (var i = 0; i < m.chunks; i++) await del('chunks', key + '#' + i);
    await del('meta', key);
  }
  async function clearCache() { var list = await cachedList(); for (var i = 0; i < list.length; i++) await removeCached(list[i].key); }
  async function usage() { try { return navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null; } catch (e) { return null; } }
  async function setting(k, v) { if (v === undefined) return get('kv', 'set:' + k); return put('kv', 'set:' + k, v); }

  return { supported: supported, connect: connect, useHandle: useHandle, restore: restore, reconnect: reconnect, forget: forget, useFallback: useFallback, isConnected: isConnected,
    rootName: rootName, scan: scan, fileOf: fileOf, fileDate: fileDate, writeInto: writeInto, createState: createState, sniffOf: sniffOf,
    saveDataset: saveDataset, loadDataset: loadDataset, cachedKeys: cachedKeys, cachedList: cachedList, removeCached: removeCached, clearCache: clearCache, usage: usage, setting: setting, fileKey: fileKey };
})();
