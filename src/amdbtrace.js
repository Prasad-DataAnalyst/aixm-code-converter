/*!
 * AIXM Code Converter
 * Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com> - author of the AIXM Code Converter
 * SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE; keep this notice in all copies)
 * ==========================================================================
 * AIXM Code Converter - trace aerodrome mapping on imagery (AMDBTRACE)
 * NOT FOR NAVIGATION - for study and analysis only.
 * What no source gives (taxiways, aprons, stands, holding positions, buildings, service roads) the user traces on
 * imagery, over a preview of what the generator makes now (AIP data set, the State's charts, OpenStreetMap, ICAO
 * Annex 14), so the picture is checked and completed in one place.
 *   Imagery    by licence: imagery that allows deriving data (national orthophotos of the Netherlands, France,
 *              Switzerland, Spain, Austria, Japan, New South Wales, USGS for the United States, Sentinel-2 2016 for the
 *              world), Sentinel-2 cloudless 2025 (the latest yearly mosaic, non-commercial use), the user's own
 *              orthophoto (an image with its world file) or tile service; Esri imagery for a visual check only (its
 *              terms do not allow deriving data). Google imagery is not offered.
 *   Trace      stand (point and number), taxiway centre line (and its surface from the width), apron, holding
 *              position, building (with its height), service road; points snap to each other.
 *   Keep       in this browser (local storage) per aerodrome; every feature says it was digitised by the user, on which
 *              imagery, under which licence, with an unknown accuracy; exported as GeoJSON (AMXM feature types).
 * Loaded only when used (src/lazy.js).
 * ========================================================================== */
/* global L, AMDBX */
var AMDBTRACE = (function () {
  'use strict';
  var D2R = Math.PI / 180, KEY = 'aixm-amdb-traced', CKEY = 'aixm-amdb-imagery';
  function esc(t) { return String(t === undefined || t === null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  /* ---------------------------------------------------------------- imagery */
  // lic: 'derive' (deriving data allowed, with attribution), 'nc' (non-commercial use only, share-alike), 'view'
  // (display only: a visual check, no tracing). bbox: where the imagery is (W, S, E, N); none: the world
  var IMAGERY = [
    { id: 's2y', group: 'World', name: 'Sentinel-2 cloudless 2025 (EOX) — the latest yearly mosaic, 10 m', url: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/g/{z}/{y}/{x}.jpg', max: 17, date: '2025', res: 10, lic: 'nc', licName: 'CC BY-NC-SA 4.0 (non-commercial)', attr: 'Sentinel-2 cloudless 2025 by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2025), CC BY-NC-SA 4.0' },
    { id: 's2', group: 'World', name: 'Sentinel-2 cloudless 2016 (EOX) — 10 m', url: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg', max: 17, date: '2016', res: 10, lic: 'derive', licName: 'CC BY 4.0', attr: 'Sentinel-2 cloudless - https://s2maps.eu by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2016 & 2017), CC BY 4.0' },
    { id: 'usgs', group: 'National orthophotos', name: 'USGS imagery — United States (NAIP)', url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}', max: 16, lic: 'derive', licName: 'public domain', attr: 'USGS The National Map: orthoimagery (public domain)', bbox: [[-180, 17, -64, 72]] },
    { id: 'pdok', group: 'National orthophotos', name: 'PDOK aerial photo — Netherlands (8 cm)', url: 'https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_orthoHR/EPSG:3857/{z}/{x}/{y}.jpeg', max: 21, lic: 'derive', licName: 'CC BY 4.0', attr: 'Beeldmateriaal Nederland / PDOK, CC BY 4.0', bbox: [[3.2, 50.7, 7.3, 53.7]] },
    { id: 'ign', group: 'National orthophotos', name: 'IGN orthophotos — France (20 cm)', url: 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/jpeg&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}', max: 19, lic: 'derive', licName: 'Licence Ouverte Etalab 2.0', attr: 'IGN-F / Géoplateforme, Licence Ouverte Etalab 2.0', bbox: [[-5.5, 41.2, 9.8, 51.2], [-61.9, 15.8, -60.8, 16.6], [-61.3, 14.3, -60.7, 15], [55.1, -21.5, 55.9, -20.8], [-54.7, 2, -51.5, 6], [44.9, -13.1, 45.4, -12.5]] },
    { id: 'swiss', group: 'National orthophotos', name: 'SWISSIMAGE — Switzerland (10 cm)', url: 'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/{z}/{x}/{y}.jpeg', max: 20, lic: 'derive', licName: 'swisstopo free geodata (attribution)', attr: '© swisstopo', bbox: [[5.9, 45.8, 10.5, 47.9]] },
    { id: 'pnoa', group: 'National orthophotos', name: 'PNOA orthophoto — Spain (25 cm)', url: 'https://tms-pnoa-ma.idee.es/1.0.0/pnoa-ma/{z}/{x}/{-y}.jpeg', max: 19, lic: 'derive', licName: 'CC BY 4.0', attr: 'PNOA © Instituto Geográfico Nacional de España, CC BY 4.0', bbox: [[-9.5, 35.8, 4.4, 43.9], [-18.2, 27.6, -13.3, 29.5]] },
    { id: 'bmat', group: 'National orthophotos', name: 'basemap.at orthophoto — Austria (30 cm)', url: 'https://mapsneu.wien.gv.at/basemap/bmaporthofoto30cm/normal/google3857/{z}/{y}/{x}.jpeg', max: 20, lic: 'derive', licName: 'CC BY 4.0', attr: 'basemap.at, CC BY 4.0', bbox: [[9.5, 46.3, 17.2, 49.1]] },
    { id: 'gsi', group: 'National orthophotos', name: 'GSI seamless photo — Japan', url: 'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg', max: 18, lic: 'derive', licName: 'GSI terms of use (attribution)', attr: 'Geospatial Information Authority of Japan (GSI tiles)', bbox: [[122.9, 24, 146, 45.6]] },
    { id: 'nsw', group: 'National orthophotos', name: 'NSW imagery — Australia, New South Wales', url: 'https://maps.six.nsw.gov.au/arcgis/rest/services/public/NSW_Imagery/MapServer/tile/{z}/{y}/{x}', max: 21, lic: 'derive', licName: 'CC BY 4.0', attr: '© Spatial Services NSW, CC BY 4.0', bbox: [[140.9, -37.6, 153.7, -28.1]] },
    { id: 'esri', group: 'Visual check only', name: 'Esri World Imagery — visual check only', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', max: 19, lic: 'view', licName: 'Esri terms: display only', attr: 'Tiles © Esri — Esri, Maxar, Earthstar Geographics' },
    { id: 'osm', group: 'Visual check only', name: 'OpenStreetMap map (no imagery)', url: 'https://tile-{s}.openstreetmap.fr/hot/{z}/{x}/{y}.png', max: 19, lic: 'view', licName: 'map tiles: display', attr: '© OpenStreetMap contributors, tiles by HOT / OSM France' }];
  function covers(im, p) { return !im.bbox || !p || im.bbox.some(function (b) { return p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3]; }); }
  function custom() { try { return JSON.parse(localStorage.getItem(CKEY) || 'null'); } catch (e) { return null; } }
  function imageryList() { var c = custom(); return IMAGERY.concat(c ? [Object.assign({ id: 'custom', group: 'Your own', lic: 'derive', max: 20 }, c)] : []).concat(ORTHO.map(function (o) { return { id: 'ortho-' + o.id, group: 'Your own', name: 'Orthophoto ' + o.name, lic: 'derive', licName: 'your own imagery', attr: 'orthophoto ' + o.name + ' (loaded by the user)', ortho: o }; })); }

  /* ------------------------------------------------- the user's orthophotos */
  var ORTHO = [], oseq = 0;
  function merc(x, y) { return [x / 6378137 / D2R, (2 * Math.atan(Math.exp(y / 6378137)) - Math.PI / 2) / D2R]; }
  // a world file: pixel size and rotation, the position of the centre of the upper left pixel
  function world(text) { var v = String(text).trim().split(/\s+/).map(Number); return v.length >= 6 && v.every(function (x) { return !isNaN(x); }) ? { A: v[0], D: v[1], B: v[2], E: v[3], C: v[4], F: v[5] } : null; }
  function crsOf(prj, W) {
    var p = String(prj || ''), m = /UTM[\s_]*zone[\s_]*(\d{1,2})\s*([NS])?/i.exec(p);
    if (m) return { kind: 'utm', zone: +m[1], south: /S/i.test(m[2] || '') || /south/i.test(p), label: 'UTM zone ' + m[1] + (/S/i.test(m[2] || '') ? 'S' : 'N') };
    if (/Pseudo.?Mercator|Popular Visuali[sz]ation|3857|900913|Web.?Mercator/i.test(p)) return { kind: 'merc', label: 'Web Mercator' };
    if (/^\s*GEOGCS/i.test(p) || (!p && Math.abs(W.C) <= 180 && Math.abs(W.F) <= 90 && Math.abs(W.A) < 1)) return { kind: 'geo', label: 'WGS 84' };
    return null;
  }
  function toLL(crs, x, y) { return crs.kind === 'geo' ? [x, y] : crs.kind === 'merc' ? merc(x, y) : AMDBX.utmInv(x, y, crs.zone, crs.south); }
  function corners(o) {
    var W = o.W, at = function (col, row) { return toLL(o.crs, W.A * col + W.B * row + W.C, W.D * col + W.E * row + W.F); };
    return [at(-0.5, -0.5), at(o.w - 0.5, -0.5), at(-0.5, o.h - 0.5), at(o.w / 2, o.h / 2)];
  }
  // without a .prj: the reference system that puts the image about one of the aerodromes loaded
  function guessCrs(o, arps) {
    var tries = [{ kind: 'geo', label: 'WGS 84' }, { kind: 'merc', label: 'Web Mercator' }];
    arps.forEach(function (a) { var z = Math.floor((a[0] + 180) / 6) + 1; [z - 1, z, z + 1].forEach(function (zz) { if (zz >= 1 && zz <= 60) tries.push({ kind: 'utm', zone: zz, south: a[1] < 0, label: 'UTM zone ' + zz + (a[1] < 0 ? 'S' : 'N') + ' (guessed)' }); }); });
    var best = null;
    tries.forEach(function (t) {
      try { o.crs = t; var c = corners(o)[3]; if (!isFinite(c[0]) || !isFinite(c[1]) || Math.abs(c[1]) > 85) return; var d = Math.min.apply(null, arps.map(function (a) { return Math.hypot((a[0] - c[0]) * Math.cos(a[1] * D2R), a[1] - c[1]) * 111.32; })); if (d < 40 && (!best || d < best.d)) best = { t: t, d: d }; } catch (e) { /* not this one */ }
    });
    return best ? best.t : null;
  }
  async function addOrtho(file, worldText, prjText, arps) {
    var W = world(worldText); if (!W) throw new Error('the world file has not six numbers');
    var url = URL.createObjectURL(file), img = new Image();
    await new Promise(function (ok, bad) { img.onload = ok; img.onerror = function () { bad(new Error('the image could not be opened by the browser (too large, or not JPEG / PNG / WebP)')); }; img.src = url; });
    var o = { id: ++oseq, name: file.name, url: url, w: img.naturalWidth, h: img.naturalHeight, W: W, crs: crsOf(prjText, W) };
    if (!o.crs) o.crs = guessCrs(o, arps || ARPS) || { kind: 'geo', label: 'unknown — placed as WGS 84' };
    o.c = corners(o);
    ORTHO.push(o);
    return { w: o.w, h: o.h, crs: o.crs.label };
  }
  // an image placed by three of its corners (any rotation), kept in place when the map moves or zooms
  var Placed = L.Layer.extend({
    initialize: function (o, opacity) { this._o = o; this._op = opacity; },
    onAdd: function (map) {
      var img = this._img = L.DomUtil.create('img', 'tr-ortho');
      img.src = this._o.url; img.style.position = 'absolute'; img.style.left = '0'; img.style.top = '0'; img.style.transformOrigin = '0 0'; img.style.pointerEvents = 'none'; img.style.opacity = this._op; img.style.maxWidth = 'none';
      map.getPanes().tilePane.appendChild(img);
      map.on('zoomend viewreset moveend', this._reset, this); map.on('zoomstart', this._hide, this);
      img.onload = this._reset.bind(this); this._reset();
    },
    onRemove: function (map) { map.off('zoomend viewreset moveend', this._reset, this); map.off('zoomstart', this._hide, this); L.DomUtil.remove(this._img); },
    _hide: function () { this._img.style.display = 'none'; },
    _reset: function () {
      var m = this._map, o = this._o, img = this._img; if (!m || !img) return;
      var p0 = m.latLngToLayerPoint([o.c[0][1], o.c[0][0]]), p1 = m.latLngToLayerPoint([o.c[1][1], o.c[1][0]]), p2 = m.latLngToLayerPoint([o.c[2][1], o.c[2][0]]);
      img.style.transform = 'matrix(' + [(p1.x - p0.x) / o.w, (p1.y - p0.y) / o.w, (p2.x - p0.x) / o.h, (p2.y - p0.y) / o.h, p0.x, p0.y].join(',') + ')';
      img.style.display = '';
    }
  });

  /* -------------------------------------------------------- what was traced */
  var TR = load(), ARPS = [];
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(TR)); } catch (e) { /* storage unavailable: kept for this session */ } }
  var TOOLS = { std: ['Stand', 'P', 'ParkingStandLocation'], twy: ['Taxiway centre line', 'L', 'TaxiwayGuidanceLine'], apn: ['Apron', 'A', 'ApronElement'], hold: ['Holding position', 'L', 'TaxiwayHoldingPosition'], bldg: ['Building', 'A', 'VerticalPolygonalStructure'], road: ['Service road', 'L', 'ServiceRoad'] };
  function srcOf(it) { return ('Digitised by the user on ' + it.imgName + ' (' + it.lic + (it.date ? ', imagery ' + it.date : '') + ') on ' + String(it.when).slice(0, 10) + ': position as seen on the imagery, accuracy unknown — indicative').slice(0, 254); }
  function widen(line, w) { return AMDBX.widen(line, w); }
  // the traced items of an aerodrome as AMXM features
  function features(code) { return [].concat.apply([], (TR[code] || []).map(featuresOf)); }
  function featuresOf(it) {
    var out = [];
    (function () {
      var src = srcOf(it), nm = String(it.name || '').slice(0, 254);
      if (it.kind === 'std') out.push({ t: 'ParkingStandLocation', g: [{ t: 'P', c: it.c[0] }], a: nm ? { idstd: { v: nm } } : {}, label: nm, src: src });
      else if (it.kind === 'twy') {
        out.push({ t: 'TaxiwayGuidanceLine', g: [{ t: 'L', c: it.c }], a: Object.assign({ status: { v: '1' }, color: { v: '0' }, style: { v: '0' }, direc: { v: '0' } }, nm ? { idlin: { v: nm } } : {}), label: nm, src: src });
        var ring = it.width ? widen(it.c, it.width) : null;
        if (ring) out.push({ t: 'TaxiwayElement', g: [{ t: 'A', c: [ring] }], a: Object.assign({ status: { v: '1' } }, nm ? { idlin: { v: nm } } : {}), label: nm, src: (src + '; surface ' + it.width + ' m wide along the traced centre line').slice(0, 254) });
      }
      else if (it.kind === 'apn') out.push({ t: 'ApronElement', g: [{ t: 'A', c: [ring0(it.c)] }], a: Object.assign({ aprontyp: { v: '1' }, status: { v: '1' } }, nm ? { idapron: { v: nm } } : {}), label: nm, src: src });
      else if (it.kind === 'hold') out.push({ t: 'TaxiwayHoldingPosition', g: [{ t: 'L', c: it.c }], a: Object.assign({ catstop: { v: /III/i.test(nm) ? '4' : /II/i.test(nm) ? '3' : /\bI\b|CAT ?1/i.test(nm) ? '1' : '0' }, marktype: { v: '0' }, holddir: { v: '0' }, status: { v: '1' } }, nm ? { idp: { v: nm } } : {}), label: (nm ? nm + ' ' : '') + 'holding position', src: src });
      else if (it.kind === 'bldg') out.push({ t: 'VerticalPolygonalStructure', g: [{ t: 'A', c: [ring0(it.c)] }], a: Object.assign({ plysttyp: { v: /TERM/i.test(nm) ? '1' : /HANGAR/i.test(nm) ? '2' : /TWR|TOWER/i.test(nm) ? '3' : '4' } }, nm ? { ident: { v: nm } } : {}, it.height ? { height: { v: String(it.height), u: 'M' } } : {}), label: nm || 'building', src: src });
      else if (it.kind === 'road') { var rr = widen(it.c, it.width || 6); if (rr) out.push({ t: 'ServiceRoad', g: [{ t: 'A', c: [rr] }], a: { featbase: { v: '0' } }, label: nm || 'service road', src: (src + '; ' + (it.width || 6) + ' m wide').slice(0, 254) }); }
    })();
    return out;
  }
  function ring0(c) { var r = c.slice(); if (r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1]) r.push(r[0]); return r; }
  function count(code) { var n = { twy: 0, apn: 0, std: 0, hold: 0, bldg: 0, road: 0, all: 0 }; (TR[code] || []).forEach(function (it) { n[it.kind]++; n.all++; }); return n; }
  function total() { return Object.keys(TR).reduce(function (n, k) { return n + TR[k].length; }, 0); }
  function geojson(code) {
    var codes = code ? [code] : Object.keys(TR);
    // every AMXM feature (read as aerodrome mapping when dropped as data); the traced item itself rides on the first
    // feature of each, so loading the file back gives the very same items (widths, roads, imagery)
    return { type: 'FeatureCollection', name: 'traced_on_imagery', features: [].concat.apply([], codes.map(function (k) { return [].concat.apply([], (TR[k] || []).map(function (it) { return featuresOf(it).map(function (f, i) { var props = { amxm_type: f.t, idarpt: k, source: f.src, traced: 'yes' }; if (!i) props.traced_item = JSON.stringify(it); Object.keys(f.a).forEach(function (a) { props[a] = f.a[a].v; }); var g = f.g[0]; return { type: 'Feature', properties: props, geometry: g.t === 'P' ? { type: 'Point', coordinates: g.c } : g.t === 'L' ? { type: 'LineString', coordinates: g.c } : { type: 'Polygon', coordinates: g.c } }; }); })); })) };
  }
  // traced items back from an exported file (the stand points, centre lines and outlines; surfaces are made again)
  function restore(text) {
    var j = JSON.parse(text), n = 0, now = new Date().toISOString();
    (j.features || []).forEach(function (f) {
      var p = f.properties || {}, g = f.geometry || {}, code = p.idarpt; if (!code || p.traced !== 'yes') return;
      if (p.traced_item) { try { var it0 = JSON.parse(p.traced_item); if (it0 && TOOLS[it0.kind] && Array.isArray(it0.c)) { TR[code] = (TR[code] || []).filter(function (x) { return x.id !== it0.id; }).concat([it0]); n++; } } catch (e) { /* not ours */ } return; }
      if (j.features.some(function (x) { return x.properties && x.properties.traced_item; })) return;
      var kind = { ParkingStandLocation: 'std', TaxiwayGuidanceLine: 'twy', ApronElement: 'apn', TaxiwayHoldingPosition: 'hold', VerticalPolygonalStructure: 'bldg' }[p.amxm_type]; if (!kind) return;
      var c = g.type === 'Point' ? [g.coordinates] : g.type === 'LineString' ? g.coordinates : g.type === 'Polygon' ? g.coordinates[0].slice(0, -1) : null; if (!c) return;
      var m = /on (.+?) \((.+?)(?:, imagery (.+?))?\) on (\d{4}-\d{2}-\d{2})/.exec(p.source || '');
      (TR[code] = TR[code] || []).push({ id: Date.now().toString(36) + (n++), kind: kind, c: c, name: p.idstd || p.idlin || p.idapron || p.idp || p.ident || '', height: p.height ? +p.height : null, width: null, imgName: m ? m[1] : 'imagery', lic: m ? m[2] : '', date: m && m[3] ? m[3] : '', when: m ? m[4] : now });
    });
    save(); return n;
  }

  /* -------------------------------------------------------------------- UI */
  var V = { ad: '', img: '', tool: '', nc: false, op: 0.55, name: '', width: 0, height: 0, map: null, view: null };
  function render(host, ctx, list, hooks) {
    var ads = list.filter(function (c, i, a) { return c.arp && a.findIndex(function (x) { return x.code === c.code; }) === i; });
    ARPS = ads.map(function (c) { return c.arp; });
    var head = '<div class="nfo-box amdb-notice" role="note">⚠ NOT FOR NAVIGATION — for study and analysis only. What you trace is as good as the imagery and your care: it is recorded as digitised by you, on which imagery, with an unknown accuracy.</div>';
    if (!ads.length) { host.innerHTML = head + '<div class="card card-pad">Load an AIP data set with the aerodrome first (📤 Upload &amp; sources): its reference point tells where to look.</div>'; return; }
    if (!ads.some(function (c) { return c.code === V.ad; })) V.ad = ads.slice().sort(function (a, b) { return b.rwys.length - a.rwys.length; })[0].code; // the aerodrome with the most runways
    var c = ads.filter(function (x) { return x.code === V.ad; })[0], imgs = imageryList();
    if (!imgs.some(function (x) { return x.id === V.img; })) V.img = (imgs.filter(function (x) { return x.lic === 'derive' && x.bbox && covers(x, c.arp); })[0] || imgs[0]).id;
    var im = imgs.filter(function (x) { return x.id === V.img; })[0], canTrace = im.lic === 'derive' || (im.lic === 'nc' && V.nc), here = covers(im, c.arp) && (!im.ortho || near(im.ortho, c.arp));
    if (!V.width) V.width = AMDBX.TWYW[AMDBX.codeOf(c).letter] || 23;
    var groups = {}; imgs.forEach(function (x) { (groups[x.group] = groups[x.group] || []).push(x); });
    var h = head + '<div class="card card-pad tr-card"><h3 style="margin-top:0">✏️ Trace on imagery</h3>' +
      '<div class="toolbar tr-bar"><label>Aerodrome <select class="inp" data-trad>' + ads.map(function (x) { return '<option' + (x.code === V.ad ? ' selected' : '') + '>' + esc(x.code) + '</option>'; }).join('') + '</select></label>' +
      '<label>Imagery <select class="inp" data-trimg>' + Object.keys(groups).map(function (g) { return '<optgroup label="' + esc(g) + '">' + groups[g].map(function (x) { return '<option value="' + x.id + '"' + (x.id === V.img ? ' selected' : '') + '>' + esc(x.name) + (covers(x, c.arp) ? '' : ' — not here') + '</option>'; }).join('') + '</optgroup>'; }).join('') + '</select></label>' +
      '<label title="Opacity of the aerodrome mapping drawn over the imagery">Mapping <input type="range" min="0" max="1" step="0.05" value="' + V.op + '" data-trop aria-label="Opacity of the mapping"></label></div>' +
      '<p class="tr-lic" data-lic="' + im.lic + '">' + (im.lic === 'view' ? '👁 <b>Visual check only</b> — ' + esc(im.licName) + ': no data may be derived from it, so tracing is off. Choose imagery that allows it.' : im.lic === 'nc' ? '⚠ <b>' + esc(im.licName) + '</b> — the newest imagery for the whole world, for non-commercial use; what you trace from it is shared alike. <label class="chk"><input type="checkbox" data-trnc' + (V.nc ? ' checked' : '') + '> My use is non-commercial</label>' : '✓ <b>Tracing allowed</b> — ' + esc(im.licName) + '. Attribution: ' + esc(im.attr) + ' (kept in every feature traced).') + (here ? '' : ' <b style="color:#b76e00">This imagery does not cover ' + esc(c.code) + '.</b>') + (im.date ? ' Imagery of ' + esc(im.date) + '.' : '') + (im.res >= 5 ? ' Pixels of about ' + im.res + ' m: aprons, taxiways and large buildings show; stands and markings only roughly — prefer an orthophoto where there is one.' : '') + '</p>' +
      '<div class="toolbar tr-tools" role="toolbar" aria-label="Trace">' + Object.keys(TOOLS).map(function (k) { return '<button class="btn small' + (V.tool === k ? ' primary' : '') + '" data-trtool="' + k + '"' + (canTrace ? '' : ' disabled') + '>' + esc(TOOLS[k][0]) + '</button>'; }).join('') +
      '<button class="btn small' + (V.tool === 'del' ? ' primary' : '') + '" data-trtool="del">Delete</button>' +
      '<label>Name / number <input class="inp" data-trname value="' + esc(V.name) + '" size="8" placeholder="A1, 204 …"></label><label>Width (m) <input class="inp" type="number" min="3" max="80" step="0.5" data-trwidth value="' + V.width + '" style="width:70px"></label><label>Height (m) <input class="inp" type="number" min="0" max="400" step="0.5" data-trheight value="' + (V.height || '') + '" style="width:70px"></label></div>' +
      '<p class="muted tr-help">' + (V.tool ? helpFor(V.tool) : 'Choose what to trace. The aerodrome mapping the generator makes now is drawn over the imagery (yellow), what you trace in magenta.') + '</p>' +
      '<div class="tr-map" aria-label="Map for tracing"></div>' +
      '<div class="tr-list"></div>' +
      '<div class="toolbar"><button class="btn small" data-trexp>Export traced (GeoJSON)</button><button class="btn small" data-trload>Load traced…</button><input type="file" class="hidden" accept=".geojson,.json" data-trfile aria-label="Traced features file"><button class="btn small" data-trclear>Clear ' + esc(V.ad) + '</button>' +
      '<details class="tr-custom"><summary>Your own imagery service…</summary><p class="muted">A tile service you hold the right to derive data from (your drone or survey orthophoto, a licensed provider). Your own orthophoto file (JPEG / PNG with its world file) is loaded in 📤 Upload &amp; sources.</p><input class="inp" data-trcurl placeholder="https://…/{z}/{x}/{y}.jpg" value="' + esc((custom() || {}).url || '') + '" style="width:100%"><input class="inp" data-trcname placeholder="Name" value="' + esc((custom() || {}).name || '') + '"><input class="inp" data-trclic placeholder="Licence (e.g. own survey 2026)" value="' + esc((custom() || {}).licName || '') + '"><label class="chk"><input type="checkbox" data-trcok> I hold the right to derive data from this imagery</label> <button class="btn small" data-trcsave>Use it</button></details></div>' +
      '<p class="muted" style="font-size:11.5px">Google imagery is not offered: its terms do not allow deriving data or tracing. Esri imagery is shown for a visual check only.</p></div>';
    host.innerHTML = h;
    mapUp(host, c, im, canTrace, ctx, list);
    listUp(host);
    bind(host, ctx, list, hooks);
  }
  function near(o, p) { var q = o.c[3]; return Math.hypot((q[0] - p[0]) * Math.cos(p[1] * D2R), q[1] - p[1]) * 111.32 < 40; }
  function helpFor(t) {
    return t === 'std' ? 'Click the stop position of each stand (the nose-wheel stop mark). Its number comes from "Name / number" and counts up when it ends with a number.'
      : t === 'twy' ? 'Click along the taxiway centre line (the yellow line), double-click or press Enter to finish; Backspace removes the last point, Esc cancels. The surface is made from the width.'
        : t === 'apn' ? 'Click around the apron edge, double-click or press Enter to close it.' : t === 'hold' ? 'Click both ends of the holding position marking across the taxiway.'
          : t === 'bldg' ? 'Click around the building, double-click or press Enter to close it; give its height if you know it.' : t === 'road' ? 'Click along the road centre line, double-click or press Enter to finish.' : 'Click a traced feature (magenta) to delete it.';
  }
  var P = { map: null, base: null, prev: null, trc: null, temp: null, ortho: [], pts: [] };
  function mapUp(host, c, im, canTrace, ctx, list) {
    var el = host.querySelector('.tr-map');
    if (P.map) { try { P.map.remove(); } catch (e) { /* already gone */ } }
    var map = P.map = L.map(el, { maxZoom: 22, zoomSnap: 0.5, doubleClickZoom: false, preferCanvas: false });
    el._trmap = map;
    if (im.ortho) {
      L.tileLayer('https://tile-{s}.openstreetmap.fr/hot/{z}/{x}/{y}.png', { maxZoom: 22, maxNativeZoom: 19, opacity: 0.35, attribution: '© OpenStreetMap contributors' }).addTo(map);
      P.ortho = [new Placed(im.ortho, 1).addTo(map)];
      map.attributionControl.addAttribution(esc(im.attr));
    } else {
      P.base = L.tileLayer(im.url, { maxZoom: 22, maxNativeZoom: im.max || 19, attribution: esc(im.attr), subdomains: 'abc', referrerPolicy: 'strict-origin-when-cross-origin' }).addTo(map);
    }
    L.control.scale({ imperial: false }).addTo(map);
    // what the generator makes now, drawn over the imagery
    P.prev = L.layerGroup().addTo(map); P.trc = L.featureGroup().addTo(map); P.temp = L.layerGroup().addTo(map);
    var b = L.latLngBounds([]);
    try {
      var g = AMDBX.generate([c], { markings: false, lights: false, centreline: false, network: false, obstacles: false, traced: false });
      g.features.forEach(function (f) {
        if (/^Asrn|^AerodromeSurfaceLighting|^RunwayMarking|^RunwayCenterlinePoint/.test(f.t)) return;
        var col = /^(Runway|Stopway|RunwayShoulder|RunwayDisplaced)/.test(f.t) ? '#ffd400' : /^Taxiway|GuidanceLine/.test(f.t) ? '#ffe680' : /Stand|Apron/.test(f.t) ? '#7fdcff' : /Vertical/.test(f.t) ? '#ff9f43' : '#ffffff';
        f.g.forEach(function (gg) {
          var l = gg.t === 'P' ? L.circleMarker([gg.c[1], gg.c[0]], { radius: 3, color: col, weight: 1.5, opacity: V.op, fillOpacity: V.op * 0.6, interactive: false })
            : gg.t === 'L' ? L.polyline(gg.c.map(function (q) { return [q[1], q[0]]; }), { color: col, weight: 1.6, opacity: V.op, interactive: false })
              : L.polygon(gg.c.map(function (r) { return r.map(function (q) { return [q[1], q[0]]; }); }), { color: col, weight: 1.2, opacity: V.op, fillOpacity: V.op * 0.12, interactive: false });
          l.addTo(P.prev); if (/^(Runway|Taxiway|Apron)/.test(f.t)) b.extend(l.getBounds ? l.getBounds() : l.getLatLng());
        });
      });
    } catch (e) { /* the preview is optional */ }
    drawTraced();
    if (V.view && V.view.ad === c.code) map.setView(V.view.c, V.view.z, { animate: false });
    else if (b.isValid()) map.fitBounds(b.pad(0.05), { animate: false, maxZoom: 17 });
    else map.setView([c.arp[1], c.arp[0]], 15, { animate: false });
    map.on('moveend', function () { V.view = { ad: c.code, c: map.getCenter(), z: map.getZoom() }; });
    // tracing
    P.pts = [];
    function ll(e) { return snap(e.latlng); }
    map.on('click', function (e) {
      if (!V.tool || V.tool === 'del' || !canTrace) return;
      var p = ll(e);
      if (V.tool === 'std') { add(c.code, 'std', [p], im); return; }
      P.pts.push(p); temp();
      if (V.tool === 'hold' && P.pts.length === 2) finish(c.code, im);
    });
    map.on('dblclick', function (e) { if (V.tool && P.pts.length) { L.DomEvent.stop(e); finish(c.code, im); } });
    map.on('mousemove', function (e) { if (P.pts.length) temp(ll(e)); });
    var onKey = function (e) {
      if (!document.body.contains(el)) { document.removeEventListener('keydown', onKey); return; }
      var tag = (e.target && e.target.tagName) || '';
      if (!V.tool || /SELECT|TEXTAREA/.test(tag) || (tag === 'INPUT' && (!P.pts.length || e.key === 'Backspace'))) return;
      if (e.key === 'Enter') { e.preventDefault(); finish(c.code, im); } else if (e.key === 'Escape') { P.pts = []; temp(); } else if (e.key === 'Backspace' && P.pts.length) { e.preventDefault(); P.pts.pop(); temp(); }
    };
    document.addEventListener('keydown', onKey);
    el.style.cursor = V.tool && canTrace ? 'crosshair' : '';
  }
  // a click within 10 px of a point already traced (or of the preview's lines) takes that point
  function snap(latlng) {
    var m = P.map, at = m.latLngToContainerPoint(latlng), best = null;
    var look = function (q) { var cp = m.latLngToContainerPoint([q[1], q[0]]), d = cp.distanceTo(at); if (d < 10 && (!best || d < best.d)) best = { d: d, q: q }; };
    Object.keys(TR).forEach(function (k) { (TR[k] || []).forEach(function (it) { it.c.forEach(look); }); });
    P.pts.forEach(look);
    return best ? best.q.slice() : [Math.round(latlng.lng * 1e8) / 1e8, Math.round(latlng.lat * 1e8) / 1e8];
  }
  function temp(mouse) {
    P.temp.clearLayers();
    var pts = P.pts.concat(mouse ? [mouse] : []).map(function (q) { return [q[1], q[0]]; });
    if (!pts.length) return;
    var poly = TOOLS[V.tool] && TOOLS[V.tool][1] === 'A';
    (poly && pts.length > 2 ? L.polygon(pts, { color: '#ff00c8', weight: 2, dashArray: '5 4', fillOpacity: 0.1, interactive: false }) : L.polyline(pts, { color: '#ff00c8', weight: 2, dashArray: '5 4', interactive: false })).addTo(P.temp);
    P.pts.forEach(function (q) { L.circleMarker([q[1], q[0]], { radius: 3, color: '#ff00c8', fillOpacity: 1, interactive: false }).addTo(P.temp); });
  }
  function finish(code, im) {
    var kind = V.tool, need = TOOLS[kind] && TOOLS[kind][1] === 'A' ? 3 : 2;
    if (!kind || P.pts.length < need) return;
    add(code, kind, P.pts.slice(), im); P.pts = []; temp();
  }
  function add(code, kind, pts, im) {
    var it = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), kind: kind, c: pts, name: V.name, width: kind === 'twy' || kind === 'road' ? (kind === 'road' ? 6 : +V.width || null) : null, height: kind === 'bldg' && V.height ? +V.height : null, imgName: im.name, lic: im.licName, date: im.date || '', when: new Date().toISOString() };
    (TR[code] = TR[code] || []).push(it); save();
    // stand numbers count up
    if (kind === 'std' && /\d+$/.test(V.name || '')) { V.name = V.name.replace(/(\d+)$/, function (d) { return String(+d + 1).padStart(d.length, '0'); }); var inp = document.querySelector('[data-trname]'); if (inp) inp.value = V.name; }
    drawTraced(); listUp(document.querySelector('.tr-card'));
  }
  function drawTraced() {
    if (!P.trc) return;
    P.trc.clearLayers();
    (TR[V.ad] || []).forEach(function (it) {
      var pts = it.c.map(function (q) { return [q[1], q[0]]; }), st = { color: '#ff00c8', weight: 2.4, fillOpacity: 0.15 };
      var l = it.kind === 'std' ? L.circleMarker(pts[0], { radius: 5, color: '#ff00c8', weight: 2, fillOpacity: 0.8 }) : TOOLS[it.kind][1] === 'A' ? L.polygon(pts, st) : L.polyline(pts, st);
      if (it.name) l.bindTooltip(esc(TOOLS[it.kind][0] + ' ' + it.name), { direction: 'top' });
      l.on('click', function (e) { if (V.tool !== 'del') return; L.DomEvent.stop(e); TR[V.ad] = TR[V.ad].filter(function (x) { return x !== it; }); save(); drawTraced(); listUp(document.querySelector('.tr-card')); });
      l.addTo(P.trc);
    });
  }
  function listUp(host) {
    if (!host) return;
    var el = host.querySelector('.tr-list'), items = TR[V.ad] || [];
    if (!el) return;
    var n = count(V.ad);
    el.innerHTML = items.length ? '<p class="muted">' + esc(V.ad) + ': ' + Object.keys(TOOLS).filter(function (k) { return n[k]; }).map(function (k) { return n[k] + ' ' + TOOLS[k][0].toLowerCase(); }).join(' · ') + ' — used by Generate (option "Features traced on imagery").</p><div class="tbl-wrap"><table class="mini-table"><thead><tr><th>What</th><th>Name</th><th>On</th><th></th></tr></thead><tbody>' +
      items.slice(-60).reverse().map(function (it) { return '<tr><td>' + esc(TOOLS[it.kind][0]) + '</td><td>' + esc(it.name || '') + '</td><td class="muted">' + esc(it.imgName) + '</td><td><button class="btn small" data-trgo="' + it.id + '">Show</button> <button class="btn small" data-trdel="' + it.id + '" aria-label="Delete">✕</button></td></tr>'; }).join('') + '</tbody></table></div>'
      : '<p class="muted">Nothing traced for ' + esc(V.ad) + ' yet.</p>';
  }
  function bind(host, ctx, list, hooks) {
    var again = function () { render(host, ctx, list, hooks); };
    host.onchange = function (e) {
      var t = e.target;
      if (t.hasAttribute('data-trad')) { V.ad = t.value; V.img = ''; V.view = null; again(); }
      else if (t.hasAttribute('data-trimg')) { V.img = t.value; again(); }
      else if (t.hasAttribute('data-trnc')) { V.nc = t.checked; again(); }
      else if (t.hasAttribute('data-trfile') && t.files[0]) { t.files[0].text().then(function (x) { var k = restore(x); ctx.toast(k + ' traced feature(s) loaded.'); again(); }).catch(function (er) { ctx.toast('Could not read the file: ' + er.message); }); }
    };
    host.oninput = function (e) {
      var t = e.target;
      if (t.hasAttribute('data-trname')) V.name = t.value;
      else if (t.hasAttribute('data-trwidth')) V.width = +t.value;
      else if (t.hasAttribute('data-trheight')) V.height = +t.value;
      else if (t.hasAttribute('data-trop')) { V.op = +t.value; P.prev.eachLayer(function (l) { l.setStyle({ opacity: V.op, fillOpacity: l instanceof L.Polygon ? V.op * 0.12 : V.op * 0.6 }); }); }
    };
    host.onclick = function (e) {
      var tb = e.target.closest('[data-trtool]'); if (tb) { var k = tb.getAttribute('data-trtool'); V.tool = V.tool === k ? '' : k; P.pts = []; host.querySelectorAll('[data-trtool]').forEach(function (b) { b.classList.toggle('primary', b.getAttribute('data-trtool') === V.tool); }); host.querySelector('.tr-help').textContent = V.tool ? helpFor(V.tool) : 'Choose what to trace.'; var el = host.querySelector('.tr-map'); el.style.cursor = V.tool ? 'crosshair' : ''; temp(); return; }
      var dl = e.target.closest('[data-trdel]'); if (dl) { var id = dl.getAttribute('data-trdel'); TR[V.ad] = (TR[V.ad] || []).filter(function (x) { return x.id !== id; }); save(); drawTraced(); listUp(host); return; }
      var gb = e.target.closest('[data-trgo]'); if (gb) { var it = (TR[V.ad] || []).filter(function (x) { return x.id === gb.getAttribute('data-trgo'); })[0]; if (it) P.map.fitBounds(L.latLngBounds(it.c.map(function (q) { return [q[1], q[0]]; })).pad(0.5), { maxZoom: 19 }); return; }
      if (e.target.closest('[data-trexp]')) { var gj = geojson(); if (!gj.features.length) { ctx.toast('Nothing traced yet.'); return; } var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(gj, null, 1)], { type: 'application/geo+json' })); a.download = 'traced_on_imagery_' + new Date().toISOString().slice(0, 10) + '.geojson'; document.body.appendChild(a); a.click(); a.remove(); return; }
      if (e.target.closest('[data-trload]')) { host.querySelector('[data-trfile]').click(); return; }
      if (e.target.closest('[data-trclear]')) { if (!(TR[V.ad] || []).length || !window.confirm('Delete everything traced for ' + V.ad + '?')) return; delete TR[V.ad]; save(); again(); return; }
      if (e.target.closest('[data-trcsave]')) {
        var u = host.querySelector('[data-trcurl]').value.trim(), ok = host.querySelector('[data-trcok]').checked;
        if (!/^https:\/\/.+\{z\}.+\{[xy]\}/.test(u)) { ctx.toast('Give a tile address with {z}, {x} and {y} (https).'); return; }
        if (!ok) { ctx.toast('Confirm that you hold the right to derive data from this imagery.'); return; }
        try { localStorage.setItem(CKEY, JSON.stringify({ url: u, name: host.querySelector('[data-trcname]').value.trim() || 'Your imagery service', licName: host.querySelector('[data-trclic]').value.trim() || 'licensed to the user', attr: host.querySelector('[data-trcname]').value.trim() || 'your imagery service' })); } catch (er) { ctx.toast('This browser does not keep settings.'); return; }
        V.img = 'custom'; again();
      }
    };
  }
  function orthos() { return ORTHO.map(function (o) { return { name: o.name, crs: o.crs.label, w: o.w, h: o.h }; }); }
  return { render: render, features: features, count: count, total: total, geojson: geojson, restore: restore, addOrtho: addOrtho, orthos: orthos, IMAGERY: IMAGERY, covers: covers, world: world, crsOf: crsOf, clearAll: function () { TR = {}; save(); } };
})();
