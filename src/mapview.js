/* =============================================================================
 * AIXM Code Converter - map view (Leaflet)
 * Offline vector base map (Natural Earth, built in), optional online layers
 * (OpenStreetMap and OSM-based styles), aeronautical overlays drawn on canvas
 * for speed, click-through to AIP / XML, measuring tool, compare overlay and a
 * static map renderer used for PNG / PDF snapshots.
 * ========================================================================== */
/* global L, topojson, AX, MODEL, AIP */
var MAPVIEW = (function () {
  'use strict';
  var M = MODEL, s = M.s, arr = AX.arr;
  var map = null, hooks = null, el = {}, world50 = null, world10 = null, places = null;
  var base = { offline: null, current: 'offline', online: {} };
  var over = {}, vec = null, state = { ds: null, cmp: null, labels: true, measure: null, filters: {} };

  var COLORS = {
    fir: '#5c0632', cta: '#1d5f99', ctr: '#b3261e', atz: '#d9480f', prd: '#c2185b', mil: '#7b1fa2', other: '#546e7a',
    route: '#2e7d32', rnav: '#00838f', rwy: '#212121', apron: '#8d6e63', obst: '#d32f2f', dp: '#1d5f99', nav: '#5c0632', ad: '#5c0632'
  };
  function asCat(t) {
    if (/^(FIR|UIR|NAS|OCA|UTA)/.test(t)) return 'fir';
    if (/^(CTA|TMA|OTA|SECTOR|AWY|RAS|ADV|UADV)/.test(t)) return 'cta';
    if (/^(CTR|MCTR)/.test(t)) return 'ctr';
    if (/^(ATZ|HTZ|TIZ|TIA|RMZ|TMZ)/.test(t)) return 'atz';
    if (/^(P|R|D)$/.test(t)) return 'prd';
    if (/^(TSA|TRA|CBA|MTR|MOA|ADIZ)/.test(t)) return 'mil';
    return 'other';
  }
  var AS_CATS = [['fir', 'FIR / UIR / OCA'], ['cta', 'CTA / TMA / sectors / airways'], ['ctr', 'CTR'], ['atz', 'ATZ / HTZ / RMZ / TMZ'], ['prd', 'Prohibited / Restricted / Danger'], ['mil', 'Military / TSA / TRA / ADIZ'], ['other', 'Other airspace']];

  /* ------------------------------------------------------- canvas layers */
  var CanvasLayer = L.Layer.extend({
    initialize: function (draw, opts) { this._drawFn = draw; L.setOptions(this, opts); },
    onAdd: function (m) {
      this._map = m;
      this._c = L.DomUtil.create('canvas', 'aixm-canvas');
      this._c.style.position = 'absolute';
      this._c.style.pointerEvents = 'none';
      m.getPane(this.options.pane || 'overlayPane').appendChild(this._c);
      m.on('moveend zoomend resize viewreset', this._redraw, this);
      m.on('zoomstart', this._hide, this);
      this._redraw();
    },
    onRemove: function (m) {
      L.DomUtil.remove(this._c);
      m.off('moveend zoomend resize viewreset', this._redraw, this);
      m.off('zoomstart', this._hide, this);
    },
    _hide: function () { if (this._c) this._c.style.opacity = 0; },
    _redraw: function () {
      if (!this._map) return;
      var size = this._map.getSize(), dpr = window.devicePixelRatio || 1, c = this._c;
      c.width = size.x * dpr; c.height = size.y * dpr;
      c.style.width = size.x + 'px'; c.style.height = size.y + 'px';
      L.DomUtil.setPosition(c, this._map.containerPointToLayerPoint([0, 0]));
      var ctx = c.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size.x, size.y);
      c.style.opacity = 1;
      this._drawFn(ctx, this._map, size);
    },
    redraw: function () { this._redraw(); }
  });

  function project(m, lon, lat) { return m.latLngToContainerPoint([lat, lon]); }

  /* ------------------------------------------------------------- symbols */
  function sym(ctx, kind, x, y, color, sz) {
    sz = sz || 6;
    ctx.save();
    ctx.translate(x, y);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = color; ctx.fillStyle = color;
    var i;
    switch (kind) {
      case 'AD': case 'HP':
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, sz + 1.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, 0, sz - 2, 0, Math.PI * 2); ctx.fill();
        if (kind === 'HP') { ctx.fillStyle = '#fff'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('H', 0, 0.5); }
        for (i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.moveTo(0, sz + 1.5); ctx.lineTo(0, sz + 4.5); ctx.stroke(); }
        break;
      case 'VOR':
        ctx.beginPath(); for (i = 0; i < 6; i++) { var a = Math.PI / 3 * i; ctx.lineTo(Math.cos(a) * sz, Math.sin(a) * sz); } ctx.closePath(); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, 1.4, 0, Math.PI * 2); ctx.fill();
        break;
      case 'VOR_DME': case 'VORTAC':
        ctx.strokeRect(-sz, -sz * 0.8, sz * 2, sz * 1.6);
        ctx.beginPath(); for (i = 0; i < 6; i++) { var b = Math.PI / 3 * i; ctx.lineTo(Math.cos(b) * sz * 0.75, Math.sin(b) * sz * 0.75); } ctx.closePath(); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, 1.3, 0, Math.PI * 2); ctx.fill();
        break;
      case 'DME':
        ctx.strokeRect(-sz * 0.85, -sz * 0.85, sz * 1.7, sz * 1.7); ctx.beginPath(); ctx.arc(0, 0, 1.3, 0, Math.PI * 2); ctx.fill();
        break;
      case 'TACAN':
        ctx.beginPath(); ctx.moveTo(-sz, -sz * 0.4); ctx.lineTo(-sz * 0.4, -sz); ctx.lineTo(sz * 0.4, -sz); ctx.lineTo(sz, -sz * 0.4); ctx.lineTo(sz * 0.5, sz * 0.7); ctx.lineTo(-sz * 0.5, sz * 0.7); ctx.closePath(); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, 1.3, 0, Math.PI * 2); ctx.fill();
        break;
      case 'NDB':
        for (i = 0; i < 16; i++) { var c = Math.PI / 8 * i; ctx.beginPath(); ctx.arc(Math.cos(c) * sz, Math.sin(c) * sz, 0.9, 0, Math.PI * 2); ctx.fill(); }
        ctx.beginPath(); ctx.arc(0, 0, sz * 0.35, 0, Math.PI * 2); ctx.fill();
        break;
      case 'MKR':
        ctx.beginPath(); ctx.ellipse(0, 0, sz, sz * 0.45, 0, 0, Math.PI * 2); ctx.stroke();
        break;
      case 'ILS': case 'LOC':
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-sz * 1.2, sz * 2.2); ctx.lineTo(sz * 1.2, sz * 2.2); ctx.closePath(); ctx.globalAlpha = 0.25; ctx.fill(); ctx.globalAlpha = 1; ctx.stroke();
        break;
      case 'DP':
        ctx.beginPath(); ctx.moveTo(0, -sz * 0.9); ctx.lineTo(sz * 0.8, sz * 0.55); ctx.lineTo(-sz * 0.8, sz * 0.55); ctx.closePath(); ctx.stroke();
        break;
      case 'DPC':
        ctx.beginPath(); ctx.moveTo(0, -sz * 0.9); ctx.lineTo(sz * 0.8, sz * 0.55); ctx.lineTo(-sz * 0.8, sz * 0.55); ctx.closePath(); ctx.fill();
        break;
      case 'OBS':
        ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(-sz * 0.7, sz * 0.6); ctx.lineTo(0, -sz * 0.9); ctx.lineTo(sz * 0.7, sz * 0.6); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, sz * 0.25, 1.1, 0, Math.PI * 2); ctx.fill();
        break;
      case 'LGT':
        ctx.beginPath(); for (i = 0; i < 10; i++) { var r = i % 2 ? sz * 0.45 : sz; var d = Math.PI / 5 * i - Math.PI / 2; ctx.lineTo(Math.cos(d) * r, Math.sin(d) * r); } ctx.closePath(); ctx.fill();
        break;
      default:
        ctx.beginPath(); ctx.arc(0, 0, sz * 0.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  function navSym(r) {
    var t = s(r.cur.p.type);
    if (r.k === 'Navaid') {
      if (/VORTAC/.test(t)) return 'VORTAC';
      if (/VOR_DME|VOR\/DME/.test(t)) return 'VOR_DME';
      if (/^VOR/.test(t)) return 'VOR';
      if (/TACAN/.test(t)) return 'TACAN';
      if (/NDB/.test(t)) return 'NDB';
      if (/^DME/.test(t)) return 'DME';
      if (/ILS|LOC|MLS|TLS/.test(t)) return 'ILS';
      if (/MKR/.test(t)) return 'MKR';
      return 'VOR';
    }
    return { VOR: 'VOR', DME: 'DME', NDB: 'NDB', TACAN: 'TACAN', MarkerBeacon: 'MKR', Localizer: 'LOC', Glidepath: 'MKR' }[r.k] || 'VOR';
  }

  /* -------------------------------------------------------- point layers */
  function PointSet(name) { this.name = name; this.pts = []; this.grid = null; }
  PointSet.prototype.add = function (lon, lat, symk, color, labelTxt, rec, ds) { this.pts.push({ lon: lon, lat: lat, s: symk, c: color, t: labelTxt, r: rec, ds: ds }); };
  function pointLayer(ps, opt) {
    opt = opt || {};
    var drawn = [];
    var layer = new CanvasLayer(function (ctx, m, size) {
      drawn = [];
      var b = m.getBounds().pad(0.05), z = m.getZoom(), vis = [];
      var w = b.getWest(), e = b.getEast(), so = b.getSouth(), n = b.getNorth();
      for (var i = 0; i < ps.pts.length; i++) {
        var p = ps.pts[i];
        if (p.lat < so || p.lat > n) continue;
        if (w <= e ? (p.lon < w || p.lon > e) : (p.lon < w && p.lon > e)) continue;
        vis.push(p);
      }
      var minZ = opt.minZoom || 0;
      if (z < minZ && vis.length > (opt.maxBelow || 300)) return drawCluster(ctx, m, vis, opt.color || '#5c0632');
      if (vis.length > (opt.cluster || 6000)) return drawCluster(ctx, m, vis, opt.color || '#5c0632');
      var showLabels = state.labels && vis.length <= (opt.maxLabels || 700) && z >= (opt.labelZoom || 0);
      ctx.font = '600 11px "Segoe UI", system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      vis.forEach(function (p) {
        var pt = project(m, p.lon, p.lat);
        sym(ctx, p.s, pt.x, pt.y, p.c, opt.size);
        drawn.push({ x: pt.x, y: pt.y, p: p });
        if (showLabels && p.t) {
          ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.strokeText(p.t, pt.x + 9, pt.y - 1);
          ctx.fillStyle = p.c; ctx.fillText(p.t, pt.x + 9, pt.y - 1);
        }
      });
    }, { pane: opt.pane || 'markerPane' });
    function drawCluster(ctx, m, vis, color) {
      var cell = 46, cells = new Map();
      vis.forEach(function (p) {
        var pt = project(m, p.lon, p.lat), k = Math.floor(pt.x / cell) + ':' + Math.floor(pt.y / cell);
        var c = cells.get(k);
        if (!c) cells.set(k, c = { x: 0, y: 0, n: 0, p: p });
        c.x += pt.x; c.y += pt.y; c.n++;
      });
      ctx.font = '700 11px "Segoe UI", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      cells.forEach(function (c) {
        var x = c.x / c.n, y = c.y / c.n, r = Math.min(22, 8 + Math.log2(c.n + 1) * 2.4);
        if (c.n === 1) { sym(ctx, c.p.s, x, y, c.p.c, opt.size); drawn.push({ x: x, y: y, p: c.p }); return; }
        ctx.globalAlpha = 0.85; ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.fillText(c.n > 999 ? Math.round(c.n / 100) / 10 + 'k' : c.n, x, y);
        drawn.push({ x: x, y: y, cluster: c });
      });
      ctx.textAlign = 'start';
    }
    layer.hit = function (cp) {
      var best = null, bd = 12 * 12;
      drawn.forEach(function (d) { var dx = d.x - cp.x, dy = d.y - cp.y, dd = dx * dx + dy * dy; if (dd < bd) { bd = dd; best = d; } });
      return best;
    };
    layer.ps = ps;
    return layer;
  }

  /* ------------------------------------------------------------ base map */
  function landStyle() {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    return { stroke: true, color: dark ? '#5a4a55' : '#b9aca4', weight: 0.8, fillColor: dark ? '#2a2229' : '#f3efe9', fillOpacity: 1, interactive: false };
  }
  function buildOffline() {
    var grp = L.layerGroup();
    var renderer = L.canvas({ padding: 0.3 });
    if (!world50) {
      var w = JSON.parse(document.getElementById('data-world50').textContent);
      world50 = topojson.feature(w, w.objects.countries);
    }
    var l50 = L.geoJSON(world50, { style: landStyle, renderer: renderer, interactive: false });
    var l10 = null;
    grp.addLayer(l50);
    function swap() {
      if (!map || !map.hasLayer(grp)) return;
      var z = map.getZoom();
      if (z >= 6) {
        if (!l10) {
          if (!world10) { var w10 = JSON.parse(document.getElementById('data-world10').textContent); world10 = topojson.feature(w10, w10.objects.countries); }
          l10 = L.geoJSON(world10, { style: landStyle, renderer: renderer, interactive: false });
        }
        if (grp.hasLayer(l50)) { grp.removeLayer(l50); grp.addLayer(l10); }
      } else if (l10 && grp.hasLayer(l10)) { grp.removeLayer(l10); grp.addLayer(l50); }
    }
    map.on('zoomend', swap);
    grp.restyle = function () { l50.setStyle(landStyle); if (l10) l10.setStyle(landStyle); };
    // graticule + place names
    var grat = new CanvasLayer(function (ctx, m, size) {
      var z = m.getZoom(), step = z < 4 ? 10 : z < 6 ? 5 : z < 8 ? 1 : 0.5;
      var b = m.getBounds(), dark = document.documentElement.getAttribute('data-theme') === 'dark';
      ctx.strokeStyle = dark ? 'rgba(255,255,255,.08)' : 'rgba(40,40,80,.10)'; ctx.lineWidth = 1;
      ctx.font = '10px ui-monospace, monospace'; ctx.fillStyle = dark ? 'rgba(255,255,255,.35)' : 'rgba(40,40,80,.4)';
      for (var lat = Math.ceil(Math.max(-85, b.getSouth()) / step) * step; lat <= Math.min(85, b.getNorth()); lat += step) {
        var a = project(m, b.getWest(), lat), c = project(m, b.getEast(), lat);
        ctx.beginPath(); ctx.moveTo(0, a.y); ctx.lineTo(size.x, c.y); ctx.stroke();
        ctx.fillText((Math.abs(lat) % 1 ? Math.abs(lat).toFixed(1) : Math.abs(lat)) + (lat >= 0 ? 'N' : 'S'), 4, a.y - 3);
      }
      for (var lon = Math.ceil(b.getWest() / step) * step; lon <= b.getEast(); lon += step) {
        var p = project(m, lon, b.getNorth());
        ctx.beginPath(); ctx.moveTo(p.x, 0); ctx.lineTo(p.x, size.y); ctx.stroke();
        var ln = ((lon + 540) % 360) - 180;
        ctx.fillText((Math.abs(ln) % 1 ? Math.abs(ln).toFixed(1) : Math.abs(ln)) + (ln >= 0 ? 'E' : 'W'), p.x + 3, size.y - 6);
      }
      if (!places) { try { places = JSON.parse(document.getElementById('data-places').textContent); } catch (e) { places = []; } }
      var maxRank = z < 3 ? 1 : z < 4 ? 3 : z < 5 ? 5 : z < 6 ? 7 : 10;
      ctx.font = '11px "Segoe UI", system-ui, sans-serif';
      places.forEach(function (pl) {
        if (pl[3] > maxRank) return;
        if (!b.contains([pl[2], pl[1]])) return;
        var q = project(m, pl[1], pl[2]);
        ctx.fillStyle = dark ? 'rgba(255,255,255,.55)' : 'rgba(60,50,55,.7)';
        ctx.beginPath(); ctx.arc(q.x, q.y, 2, 0, Math.PI * 2); ctx.fill();
        ctx.fillText(pl[0], q.x + 4, q.y - 4);
      });
    }, { pane: 'shadowPane' });
    grp.addLayer(grat);
    grp.grat = grat;
    return grp;
  }
  var ONLINE = {
    voyager: { name: 'OpenStreetMap – CARTO Voyager (recommended)', url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png', attr: '© OpenStreetMap contributors © CARTO', maxZoom: 20, sub: 'abcd' },
    osm: { name: 'OpenStreetMap (standard server – may refuse local files)', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attr: '© OpenStreetMap contributors', maxZoom: 19 },
    osmde: { name: 'OpenStreetMap (German style mirror)', url: 'https://tile.openstreetmap.de/{z}/{x}/{y}.png', attr: '© OpenStreetMap contributors', maxZoom: 18 },
    cartoLight: { name: 'OSM data – CARTO light', url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', attr: '© OpenStreetMap contributors © CARTO', maxZoom: 20, sub: 'abcd' },
    cartoDark: { name: 'OSM data – CARTO dark', url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', attr: '© OpenStreetMap contributors © CARTO', maxZoom: 20, sub: 'abcd' },
    topo: { name: 'OSM data – OpenTopoMap (terrain)', url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', attr: '© OpenStreetMap contributors, SRTM | © OpenTopoMap (CC-BY-SA)', maxZoom: 17, sub: 'abc' },
    esri: { name: 'Satellite imagery (Esri)', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attr: 'Tiles © Esri', maxZoom: 19 }
  };
  function setBase(key) {
    if (base.current === key && (key !== 'offline' || map.hasLayer(base.offline))) return;
    if (base.current === 'offline') map.removeLayer(base.offline);
    else if (base.online[base.current]) map.removeLayer(base.online[base.current]);
    base.current = key;
    if (key === 'offline') { map.addLayer(base.offline); base.offline.restyle(); return; }
    var d = ONLINE[key];
    if (!base.online[key]) {
      base.online[key] = L.tileLayer(d.url, { attribution: d.attr, maxZoom: d.maxZoom, subdomains: d.sub || 'abc', crossOrigin: true, referrerPolicy: 'strict-origin-when-cross-origin' });
      var errors = 0, loaded = 0;
      base.online[key].on('tileload', function () { loaded++; });
      base.online[key].on('tileerror', function () {
        if (++errors !== 5 || loaded) return;
        // The standard OSM servers refuse requests without a web-site referrer (a local file has none):
        // fall back to the same OpenStreetMap data served by CARTO, or to the offline map.
        if (key !== 'voyager' && key !== 'offline') {
          checkOnline(function (on) {
            if (base.current !== key) return;
            var to = on ? 'voyager' : 'offline';
            setBase(to); var sel = document.getElementById('map-base'); if (sel) sel.value = to;
            if (hooks) hooks.toast(on ? ONLINE[key].name + ' refused the tiles — switched to OpenStreetMap (CARTO Voyager).' : 'No internet — switched to the offline map.', 6000);
          });
        } else if (hooks) hooks.toast('Online map tiles are not loading (no internet or blocked). The offline map always works.');
      });
    }
    map.addLayer(base.online[key]);
    if (state.showOfflineBorders) { map.addLayer(base.offline); }
  }
  function saveBase(key) { try { localStorage.setItem('aixm-map-base', key); } catch (e) { /* storage unavailable */ } }
  function savedBase() { try { return localStorage.getItem('aixm-map-base') || ''; } catch (e) { return ''; } }
  function checkOnline(cb) {
    if (!navigator.onLine) { cb(false); return; }
    var img = new Image(), done = false;
    var t = setTimeout(function () { if (!done) { done = true; cb(false); } }, 4000);
    img.onload = function () { if (!done) { done = true; clearTimeout(t); cb(true); } };
    img.onerror = function () { if (!done) { done = true; clearTimeout(t); cb(false); } };
    img.src = 'https://a.basemaps.cartocdn.com/light_all/0/0/0.png?_=' + Date.now();
  }

  /* ------------------------------------------------------------ overlays */
  function ll(c) { return [c[1], c[0]]; }
  function ringsLL(g) { return g.c.map(function (ring) { return ring.filter(function (p) { return typeof p[0] === 'number'; }).map(ll); }); }
  function shapesOf(g, cb) {
    if (!g) return;
    if (g.t === 'M') { g.parts.forEach(function (x) { shapesOf(x, cb); }); return; }
    cb(g);
  }
  function popupHtml(ds, r) {
    var p = r.cur.p, sec = AIP.sectionOf(ds, r), rows = [];
    function kv(k, v) { if (v) rows.push('<div class="pop-kv"><b>' + k + ':</b> ' + esc(v) + '</div>'); }
    kv('Type', M.typeName(r) + (s(p.type) ? ' (' + s(p.type) + ')' : ''));
    kv('AIP', sec.no + (sec.ad ? ' ' + M.shortName(sec.ad) : ''));
    var pt = M.pointOf(ds, r);
    if (pt && r.k !== 'Airspace') kv('Position', AX.fmtPos(pt, 2));
    if (r.k === 'Airspace') { kv('Vertical', AIP.vertical(ds, r).replace(/\n/g, '; ')); kv('Class', AIP.airspaceClass(r).replace(/\n/g, '; ')); }
    if (p.frequency) kv('Frequency', M.fq(arr(p.frequency)[0]));
    if (r.k === 'VerticalStructure') { var part = arr(p.part)[0] || {}; kv('Height', M.fq(part.verticalExtent)); }
    kv('Effective', M.fmtTs(r.cur.b) + (r.cur.e ? ' – ' + M.fmtTs(r.cur.e) : ''));
    kv('Data set', ds.state + ' · ' + ds.name);
    return '<div class="pop-title">' + esc(M.label(ds, r)) + '</div>' + rows.join('') +
      '<div class="pop-actions"><button data-act="aip">AIP section</button><button data-act="xml">View AIXM</button><button data-act="detail">All data</button></div>';
  }
  function esc(t) { return String(t === undefined || t === null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function openPopup(ds, r, latlng) {
    var pop = L.popup({ maxWidth: 360 }).setLatLng(latlng).setContent(popupHtml(ds, r)).openOn(map);
    var node = pop.getElement();
    if (node) node.addEventListener('click', function (e) {
      var a = e.target.getAttribute && e.target.getAttribute('data-act');
      if (!a) return;
      if (a === 'aip') hooks.openAip(ds, r);
      if (a === 'xml') hooks.openXml(ds, r);
      if (a === 'detail') hooks.openDetail(ds, r);
    });
  }

  function buildOverlays(ds) {
    Object.keys(over).forEach(function (k) { if (map.hasLayer(over[k])) map.removeLayer(over[k]); });
    over = {};
    vec = vec || L.canvas({ padding: 0.4, tolerance: 4 });
    var T = ds.byType, lay;
    // airspace by category
    AS_CATS.forEach(function (c) { over['as_' + c[0]] = L.layerGroup(); });
    (T.Airspace || []).forEach(function (a) {
      var t = s(a.cur.p.type), cat = asCat(t), col = COLORS[cat];
      shapesOf(M.geometry(ds, a), function (g) {
        var l;
        if (g.t === 'A') l = L.polygon(ringsLL(g), { renderer: vec, color: col, weight: cat === 'fir' ? 2.2 : 1.5, fillOpacity: cat === 'fir' ? 0.02 : 0.08, dashArray: cat === 'prd' || cat === 'mil' ? '6 4' : null });
        else if (g.t === 'L') l = L.polyline(g.c.map(ll), { renderer: vec, color: col, weight: 1.5 });
        if (!l) return;
        l.on('click', function (e) { openPopup(ds, a, e.latlng); });
        l.bindTooltip(esc(M.label(ds, a)), { sticky: true, direction: 'top', opacity: 0.9 });
        over['as_' + cat].addLayer(l);
      });
    });
    // routes
    over.routes = L.layerGroup();
    (T.RouteSegment || []).forEach(function (sg) {
      var g = M.geometry(ds, sg);
      if (!g || g.t !== 'L') return;
      var rnav = /RNAV|RNP/.test(s(sg.cur.p.navigationType));
      var l = L.polyline(g.c.map(ll), { renderer: vec, color: rnav ? COLORS.rnav : COLORS.route, weight: 2, opacity: 0.85 });
      l.on('click', function (e) { openPopup(ds, sg, e.latlng); });
      var rt = M.target(ds, sg.cur.p.routeFormed);
      l.bindTooltip(esc(rt ? M.routeDesignator(rt.cur.p) : M.label(ds, sg)), { sticky: true, opacity: 0.9 });
      over.routes.addLayer(l);
    });
    // runways, aprons, taxiways, AMDB surfaces
    over.aerodrome = L.layerGroup();
    (T.Runway || []).forEach(function (rw) {
      shapesOf(M.geometry(ds, rw), function (g) {
        var l = g.t === 'L' ? L.polyline(g.c.map(ll), { renderer: vec, color: COLORS.rwy, weight: 5, opacity: 0.85, lineCap: 'butt' })
          : g.t === 'A' ? L.polygon(ringsLL(g), { renderer: vec, color: COLORS.rwy, weight: 1, fillColor: '#444', fillOpacity: 0.7 }) : null;
        if (!l) return;
        l.on('click', function (e) { openPopup(ds, rw, e.latlng); });
        over.aerodrome.addLayer(l);
      });
    });
    ['Apron', 'ApronElement', 'Taxiway', 'TaxiwayElement', 'TouchDownLiftOff', 'RunwayElement', 'AircraftStand', 'RunwayProtectArea', 'GuidanceLine', 'DeicingArea', 'WorkArea'].forEach(function (k) {
      (T[k] || []).forEach(function (r) {
        var g = M.findGeo(r.cur.p, k === 'GuidanceLine' ? ['L'] : ['A'], 0);
        if (!g) return;
        var col = /Taxi|Guidance/.test(k) ? '#f9a825' : /Runway/.test(k) ? '#555' : COLORS.apron;
        var l = g.t === 'A' ? L.polygon(ringsLL(g), { renderer: vec, color: col, weight: 1, fillOpacity: 0.35 }) : L.polyline(g.c.map(ll), { renderer: vec, color: col, weight: 1.2 });
        l.on('click', function (e) { openPopup(ds, r, e.latlng); });
        over.aerodrome.addLayer(l);
      });
    });
    // obstacle lines/areas
    over.obstLines = L.layerGroup();
    // point sets
    var ads = new PointSet('ad'), navs = new PointSet('nav'), dps = new PointSet('dp'), obs = new PointSet('obs'), lgt = new PointSet('lgt');
    (T.AirportHeliport || []).forEach(function (a) { var c = M.pointOf(ds, a); if (c) ads.add(c[0], c[1], s(a.cur.p.type) === 'HP' ? 'HP' : 'AD', COLORS.ad, M.shortName(a), a, ds); });
    var usedEq = new Set();
    (T.Navaid || []).forEach(function (n) {
      arr(n.cur.p.navaidEquipment).forEach(function (c) { var t = c && c.theNavaidEquipment ? M.target(ds, c.theNavaidEquipment) : null; if (t) usedEq.add(t); });
      var c = M.pointOf(ds, n); if (c) navs.add(c[0], c[1], navSym(n), COLORS.nav, s(n.cur.p.designator), n, ds);
    });
    ['VOR', 'DME', 'NDB', 'TACAN', 'MarkerBeacon', 'Localizer', 'Glidepath'].forEach(function (k) {
      (T[k] || []).forEach(function (e) { if (usedEq.has(e)) return; var c = M.pointOf(ds, e); if (c) navs.add(c[0], c[1], navSym(e), COLORS.nav, s(e.cur.p.designator), e, ds); });
    });
    (T.DesignatedPoint || []).forEach(function (d) { var c = M.pointOf(ds, d); if (c) dps.add(c[0], c[1], s(d.cur.p.type) === 'ICAO' ? 'DPC' : 'DP', COLORS.dp, s(d.cur.p.designator) || s(d.cur.p.name), d, ds); });
    (T.VerticalStructure || []).forEach(function (o) {
      var g = M.geometry(ds, o);
      shapesOf(g, function (x) {
        if (x.t === 'P') obs.add(x.c[0], x.c[1], 'OBS', COLORS.obst, s(o.cur.p.name), o, ds);
        else {
          var l = x.t === 'L' ? L.polyline(x.c.map(ll), { renderer: vec, color: COLORS.obst, weight: 1.5, dashArray: '3 3' }) : L.polygon(ringsLL(x), { renderer: vec, color: COLORS.obst, weight: 1, fillOpacity: 0.15 });
          l.on('click', function (e) { openPopup(ds, o, e.latlng); });
          over.obstLines.addLayer(l);
        }
      });
    });
    (T.AeronauticalGroundLight || []).forEach(function (r) { var c = M.pointOf(ds, r); if (c) lgt.add(c[0], c[1], 'LGT', '#e65100', s(r.cur.p.name), r, ds); });
    over.pAd = pointLayer(ads, { size: 6, labelZoom: 5 });
    over.pNav = pointLayer(navs, { size: 6, labelZoom: 6 });
    over.pDp = pointLayer(dps, { size: 5, labelZoom: 7, color: COLORS.dp });
    over.pObs = pointLayer(obs, { size: 5, labelZoom: 12, maxLabels: 200, color: COLORS.obst, cluster: 3000, minZoom: 8, maxBelow: 400 });
    over.pLgt = pointLayer(lgt, { size: 6, labelZoom: 8 });
    over.obstacles = L.layerGroup([over.obstLines, over.pObs]);
    over.procs = buildProcs(ds, state.procAd && ds.recs.indexOf(state.procAd) >= 0 ? state.procAd : null);
    return over;
  }
  var LAYER_DEF = [
    ['pAd', 'Aerodromes / heliports', true], ['aerodrome', 'Runways, aprons, taxiways', true], ['pNav', 'Radio navigation aids', true], ['pDp', 'Designated points', true],
    ['routes', 'ATS routes', true], ['procs', 'Instrument procedures (SID / STAR / approach)', false], ['obstacles', 'Obstacles', true], ['pLgt', 'Aeronautical ground lights', false]
  ];
  function applyLayers() {
    LAYER_DEF.forEach(function (d) {
      var on = state.filters[d[0]] !== undefined ? state.filters[d[0]] : d[2];
      if (!over[d[0]]) return;
      if (on && !map.hasLayer(over[d[0]])) map.addLayer(over[d[0]]);
      if (!on && map.hasLayer(over[d[0]])) map.removeLayer(over[d[0]]);
    });
    AS_CATS.forEach(function (c) {
      var k = 'as_' + c[0], on = state.filters[k] !== undefined ? state.filters[k] : c[0] !== 'fir' || true;
      if (!over[k]) return;
      if (on && !map.hasLayer(over[k])) map.addLayer(over[k]);
      if (!on && map.hasLayer(over[k])) map.removeLayer(over[k]);
    });
  }
  function currentLayers() {
    var o = {};
    LAYER_DEF.forEach(function (x) { o[x[0]] = state.filters[x[0]] !== undefined ? state.filters[x[0]] : x[2]; });
    AS_CATS.forEach(function (x) { o['as_' + x[0]] = state.filters['as_' + x[0]] !== undefined ? state.filters['as_' + x[0]] : true; });
    return o;
  }
  function countOf(k) {
    var l = over[k];
    if (!l) return 0;
    if (l.ps) return l.ps.pts.length;
    if (k === 'procs') return l.count || 0;
    var n = 0; l.eachLayer(function (x) { n += x.ps ? x.ps.pts.length : x.getLayers ? x.getLayers().length : 1; });
    return n;
  }

  /* ------------------------------------------------ instrument procedures */
  var PROC_COL = { StandardInstrumentDeparture: '#1565c0', StandardInstrumentArrival: '#2e7d32', InstrumentApproachProcedure: '#8e24aa' };
  var PROC_K = { StandardInstrumentDeparture: 'SID', StandardInstrumentArrival: 'STAR', InstrumentApproachProcedure: 'IAP' };
  function project2(c, crs, nm) { return AX.dest(c[0], c[1], (crs + 360) % 360, nm); }
  // departure end of the runway used by a SID (threshold of the opposite direction)
  function sidStart(ds, proc) {
    var out = null;
    arr(proc.cur.p.flightTransition).forEach(function (tr) {
      arr(tr && tr.departureRunwayTransition).forEach(function (l) {
        arr(l && l.runway).forEach(function (x) {
          var rd = M.target(ds, x);
          if (out || !rd) return;
          var thr = M.pointOf(ds, rd), rw = M.target(ds, rd.cur.p.usedRunway), g = rw ? M.geometry(ds, rw) : null;
          if (g && g.t === 'L' && thr) out = AX.distNM(g.c[0], thr) > AX.distNM(g.c[1], thr) ? g.c[0] : g.c[1];
          else out = thr;
        });
      });
    });
    return out;
  }
  // -> [{leg, kind, coords:[[lon,lat],…], dashed, label}]
  function procPaths(ds, proc) {
    var legs = AIP.procLegs(ds, proc), out = [], prev = proc.k === 'StandardInstrumentDeparture' ? sidStart(ds, proc) : null, lastTr = null;
    legs.forEach(function (x) {
      var lp = x.leg.cur.p;
      if (x.tr !== lastTr && lastTr !== null && x.tr) prev = proc.k === 'StandardInstrumentDeparture' ? sidStart(ds, proc) : null;
      lastTr = x.tr;
      var tg = M.findGeo(lp.trajectory, ['L'], 0), a = M.segPoint(ds, arr(lp.startPoint)[0]) || prev, b = M.segPoint(ds, arr(lp.endPoint)[0]);
      var coords = null, dashed = x.leg.k === 'MissedApproachLeg';
      if (tg && tg.c && tg.c.length > 1) coords = tg.c;
      else if (a && b) coords = [a, b];
      else if (a && s(lp.course)) { var ln = lp.length && lp.length.v ? AX.toNM(+lp.length.v, lp.length.u) : 3; coords = [a, project2(a, +s(lp.course), Math.min(ln || 3, 10))]; dashed = true; }
      if (coords) { out.push({ leg: x.leg, coords: coords, dashed: dashed, label: [s(lp.legTypeARINC), M.segPointLabel(ds, arr(lp.endPoint)[0])].filter(Boolean).join(' → ') }); prev = coords[coords.length - 1]; }
    });
    return out;
  }
  function buildProcs(ds, onlyAd) {
    var grp = L.layerGroup(), n = 0;
    ['StandardInstrumentDeparture', 'StandardInstrumentArrival', 'InstrumentApproachProcedure'].forEach(function (k) {
      (ds.byType[k] || []).forEach(function (pr) {
        if (onlyAd && ds.owner.get(pr) !== onlyAd) return;
        if (state.procKinds && state.procKinds[PROC_K[k]] === false) return;
        var name = PROC_K[k] + ' ' + (s(pr.cur.p.designator) || s(pr.cur.p.name));
        procPaths(ds, pr).forEach(function (sg) {
          var l = L.polyline(sg.coords.map(ll), { renderer: vec, color: PROC_COL[k], weight: 2.5, opacity: 0.9, dashArray: sg.dashed ? '7 5' : null });
          l.bindTooltip(esc(name + (sg.label ? ' · ' + sg.label : '')), { sticky: true, opacity: 0.9 });
          l.on('click', function (e) { openPopup(ds, pr, e.latlng); });
          grp.addLayer(l);
          // arrow head at the end of the leg
          var c = sg.coords, p1 = c[c.length - 2], p2 = c[c.length - 1], brg = AX.bearing(p1, p2);
          if (brg !== null && brg !== undefined && !isNaN(brg)) {
            var tip = p2, len = Math.min(AX.distNM(p1, p2) * 0.25, 0.6);
            if (len > 0.05) grp.addLayer(L.polyline([project2(tip, brg + 150, len), tip, project2(tip, brg - 150, len)].map(ll), { renderer: vec, color: PROC_COL[k], weight: 2.5, opacity: 0.9 }));
          }
          n++;
        });
      });
    });
    grp.count = n;
    return grp;
  }
  function showProcs(ds, ad, instant) {
    if (!map) return;
    state.procAd = ad || null;
    if (over.procs && map.hasLayer(over.procs)) map.removeLayer(over.procs);
    over.procs = buildProcs(ds, state.procAd);
    state.filters.procs = true;
    var cb = document.querySelector('[data-layer="procs"]'); if (cb) cb.checked = true;
    var sel = document.getElementById('map-proc-ad'); if (sel) sel.value = ad ? String(ds.recs.indexOf(ad)) : '';
    applyLayers();
    var b = null;
    over.procs.eachLayer(function (l) { var lb = l.getBounds(); b = b ? b.extend(lb) : L.latLngBounds(lb.getSouthWest(), lb.getNorthEast()); });
    if (b && b.isValid()) map.fitBounds(b.pad(0.1), { maxZoom: 12, animate: !instant });
    else hooks.toast('No procedure legs with positions for this aerodrome.');
  }

  /* ---------------------------------------------------- compare overlay */
  function buildCompare(res) {
    if (over.cmp && map.hasLayer(over.cmp)) map.removeLayer(over.cmp);
    over.cmp = null;
    if (!res) return;
    var grp = L.layerGroup(), ps = new PointSet('cmp');
    var col = { added: '#1f7a4d', removed: '#b3261e', modified: '#e08e00' };
    res.items.forEach(function (it) {
      var ds = it.kind === 'removed' ? res.a : res.b, r = it.kind === 'removed' ? it.a : it.b;
      var g = M.geometry(ds, r);
      shapesOf(g, function (x) {
        if (x.t === 'P') ps.add(x.c[0], x.c[1], 'default', col[it.kind], it.kind.charAt(0).toUpperCase() + ' ' + M.shortName(r), r, ds);
        else {
          var l = x.t === 'A' ? L.polygon(ringsLL(x), { renderer: vec, color: col[it.kind], weight: 3, fillOpacity: 0.12 }) : L.polyline(x.c.map(ll), { renderer: vec, color: col[it.kind], weight: 4 });
          l.on('click', function (e) { openPopup(ds, r, e.latlng); });
          l.bindTooltip(it.kind + ': ' + esc(M.label(ds, r)), { sticky: true });
          grp.addLayer(l);
        }
      });
    });
    var pl = pointLayer(ps, { size: 7, labelZoom: 4, maxLabels: 400 });
    grp.addLayer(pl);
    over.cmp = grp; over.cmpPts = pl;
    map.addLayer(grp);
  }

  /* ------------------------------------------------------------- measure */
  function toggleMeasure(btn) {
    if (state.measure) {
      map.removeLayer(state.measure.layer);
      map.off('click', state.measure.onClick);
      state.measure = null;
      map.getContainer().style.cursor = '';
      btn.classList.remove('primary');
      el.status.textContent = 'Measure off';
      return;
    }
    var pts = [], layer = L.layerGroup().addTo(map);
    var line = L.polyline([], { color: '#5c0632', weight: 3, dashArray: '6 6' }).addTo(layer);
    function onClick(e) {
      pts.push([e.latlng.lng, e.latlng.lat]);
      line.setLatLngs(pts.map(ll));
      L.circleMarker(e.latlng, { radius: 4, color: '#5c0632', fillOpacity: 1 }).addTo(layer);
      var tot = 0, legs = [];
      for (var i = 1; i < pts.length; i++) { var d = AX.distNM(pts[i - 1], pts[i]); tot += d; legs.push(AX.bearing(pts[i - 1], pts[i]).toFixed(0).padStart(3, '0') + '°T ' + d.toFixed(1) + ' NM'); }
      el.status.textContent = pts.length < 2 ? 'Click the next point…' : 'Total ' + tot.toFixed(2) + ' NM / ' + (tot * 1.852).toFixed(2) + ' km  |  ' + legs.slice(-3).join('  ·  ');
    }
    map.on('click', onClick);
    map.getContainer().style.cursor = 'crosshair';
    state.measure = { layer: layer, onClick: onClick };
    btn.classList.add('primary');
    el.status.textContent = 'Measure: click points on the map';
  }

  /* ---------------------------------------------------------------- UI */
  function panelHtml(datasets) {
    var h = '<div class="card map-panel" id="map-panel">';
    h += '<div class="row"><b>Map</b><span class="sp"></span><span class="chip" id="map-online">checking internet…</span></div>';
    if (datasets.length > 1) h += '<h4>Data set</h4><select class="inp" id="map-ds" style="width:100%">' + datasets.map(function (d, i) { return '<option value="' + i + '">' + esc(d.state + ' – ' + d.name) + '</option>'; }).join('') + '</select>';
    h += '<h4>Base map</h4><select class="inp" id="map-base" style="width:100%"><option value="offline">Offline world map (built in)</option>';
    Object.keys(ONLINE).forEach(function (k) { h += '<option value="' + k + '">' + ONLINE[k].name + ' — online</option>'; });
    h += '</select><div class="muted" style="font-size:11.5px;margin-top:4px">Online maps need the laptop\'s internet connection. The offline map always works.</div>';
    h += '<h4>Aeronautical layers</h4>';
    LAYER_DEF.forEach(function (d) { h += '<label class="chk"><input type="checkbox" data-layer="' + d[0] + '"' + (d[2] ? ' checked' : '') + '> ' + d[1] + ' <span class="muted" data-count="' + d[0] + '"></span></label>'; });
    h += '<h4>Procedures</h4><div class="row" style="gap:6px;flex-wrap:wrap"><select class="inp" id="map-proc-ad" style="flex:1;min-width:0"><option value="">All aerodromes</option></select></div>';
    h += '<div class="row" style="gap:10px;margin-top:4px">' + ['SID', 'STAR', 'IAP'].map(function (k) { var col = { SID: '#1565c0', STAR: '#2e7d32', IAP: '#8e24aa' }[k]; return '<label class="chk" style="margin:0"><input type="checkbox" data-pk="' + k + '" checked> <span class="sw" style="background:' + col + '"></span> ' + k + '</label>'; }).join('') + '</div>';
    h += '<div class="muted" style="font-size:11.5px;margin-top:2px">Dashed: missed approach, or a leg ending at an altitude (drawn along its course).</div>';
    h += '<h4>Airspace</h4>';
    AS_CATS.forEach(function (c) { h += '<label class="chk"><input type="checkbox" data-layer="as_' + c[0] + '" checked> <span class="sw" style="background:' + COLORS[c[0]] + '"></span> ' + c[1] + ' <span class="muted" data-count="as_' + c[0] + '"></span></label>'; });
    h += '<h4>Display</h4><label class="chk"><input type="checkbox" id="map-labels" checked> Labels</label>';
    h += '<label class="chk"><input type="checkbox" id="map-cmp" disabled> Show comparison result (added / removed / modified)</label>';
    h += '</div>';
    h += '<div class="map-tools"><button class="btn small" id="map-fit" title="Zoom to data">⤢ Fit data</button><button class="btn small" id="map-measure" title="Measure distance and bearing">📏 Measure</button><button class="btn small" id="map-png" title="Save the current view as PNG">🖼 Save PNG</button><button class="btn small" id="map-print" title="Print or save the map as PDF: choose area, paper, legend, north arrow">🖨 Print map</button><button class="btn small" id="map-panel-toggle">☰ Layers</button></div>';
    h += '<div class="card map-status" id="map-status">Move the mouse over the map</div>';
    return h;
  }

  function mount(container, datasets, _hooks, opts) {
    hooks = _hooks;
    opts = opts || {};
    container.innerHTML = '<div class="map-wrap"><div id="map"></div>' + panelHtml(datasets) + '</div>';
    var mdiv = container.querySelector('#map');
    if (map) { map.remove(); map = null; base = { offline: null, current: 'offline', online: {} }; over = {}; vec = null; }
    map = L.map(mdiv, { zoomControl: false, worldCopyJump: true, preferCanvas: true, minZoom: 2, maxZoom: 19 }).setView([30, 10], 3);
    base.offline = buildOffline();
    map.addLayer(base.offline);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.control.scale({ imperial: true, metric: true, position: 'bottomleft' }).addTo(map);
    el.status = container.querySelector('#map-status');
    map.on('mousemove', function (e) {
      if (state.measure) return;
      el.status.textContent = AX.fmtPos([e.latlng.lng, e.latlng.lat], 1) + '   (' + e.latlng.lat.toFixed(5) + ', ' + e.latlng.lng.toFixed(5) + ')   zoom ' + map.getZoom();
    });
    map.on('click', function (e) {
      if (state.measure) return;
      var cp = e.containerPoint, keys = ['cmpPts', 'pAd', 'pNav', 'pLgt', 'pDp', 'pObs'];
      for (var i = 0; i < keys.length; i++) {
        var l = over[keys[i]];
        if (!l || !map.hasLayer(l) && !(keys[i] === 'pObs' && over.obstacles && map.hasLayer(over.obstacles)) && !(keys[i] === 'cmpPts' && over.cmp && map.hasLayer(over.cmp))) continue;
        var h = l.hit(cp);
        if (h) {
          if (h.cluster) { map.setView(e.latlng, Math.min(map.getZoom() + 2, 18)); return; }
          openPopup(h.p.ds, h.p.r, [h.p.lat, h.p.lon]); return;
        }
      }
    });
    var q = function (sel) { return container.querySelector(sel); };
    q('#map-base').addEventListener('change', function (e) { setBase(e.target.value); saveBase(e.target.value); });
    container.querySelectorAll('[data-layer]').forEach(function (cb) {
      cb.addEventListener('change', function () { state.filters[cb.getAttribute('data-layer')] = cb.checked; applyLayers(); });
    });
    q('#map-labels').addEventListener('change', function (e) { state.labels = e.target.checked; ['pAd', 'pNav', 'pDp', 'pObs', 'pLgt'].forEach(function (k) { if (over[k] && map.hasLayer(over[k])) over[k].redraw(); }); });
    q('#map-fit').addEventListener('click', function () { fit(); });
    q('#map-measure').addEventListener('click', function (e) { toggleMeasure(e.currentTarget); });
    q('#map-png').addEventListener('click', function () { hooks.savePng(renderImage(state.ds, map.getBounds(), 1600, 1000, { title: state.ds ? state.ds.state : '', layers: currentLayers() })); });
    q('#map-print').addEventListener('click', function () { printDialog(null); });
    q('#map-panel-toggle').addEventListener('click', function () { q('#map-panel').classList.toggle('hidden'); });
    var dsSel = q('#map-ds');
    if (dsSel) dsSel.addEventListener('change', function () { show(datasets[+dsSel.value]); fit(); });
    q('#map-proc-ad').addEventListener('change', function (e) { var i = e.target.value; showProcs(state.ds, i === '' ? null : state.ds.recs[+i]); });
    container.querySelectorAll('[data-pk]').forEach(function (cb) {
      cb.addEventListener('change', function () { state.procKinds = state.procKinds || {}; state.procKinds[cb.getAttribute('data-pk')] = cb.checked; showProcs(state.ds, state.procAd); });
    });
    q('#map-cmp').addEventListener('change', function (e) { if (e.target.checked) buildCompare(state.cmp); else buildCompare(null); });
    checkOnline(function (on) {
      var c = q('#map-online');
      if (!c) return;
      c.textContent = on ? 'internet: online' : 'internet: offline';
      c.className = 'chip ' + (on ? 'ok' : 'warn');
      var sb = savedBase();
      if (on && sb && ONLINE[sb] && base.current === 'offline') { setBase(sb); var bs = q('#map-base'); if (bs) bs.value = sb; }
    });
    var ds = opts.ds || datasets[0];
    if (dsSel && ds) dsSel.value = String(datasets.indexOf(ds));
    if (ds) { show(ds); if (opts.procs) showProcs(ds, opts.procs, true); else fit(true); }
    if (opts.cmp) setCompare(opts.cmp);
    setTimeout(function () { map.invalidateSize(); }, 50);
  }
  function fillProcAd(ds) {
    var sel = document.getElementById('map-proc-ad');
    if (!sel) return;
    var ads = new Map();
    ['StandardInstrumentDeparture', 'StandardInstrumentArrival', 'InstrumentApproachProcedure'].forEach(function (k) { (ds.byType[k] || []).forEach(function (pr) { var a = ds.owner.get(pr); if (a) ads.set(a, (ads.get(a) || 0) + 1); }); });
    sel.innerHTML = '<option value="">All aerodromes</option>' + Array.from(ads.keys()).sort(function (a, b) { return M.shortName(a).localeCompare(M.shortName(b)); })
      .map(function (a) { return '<option value="' + ds.recs.indexOf(a) + '">' + esc(M.shortName(a) + ' — ' + (s(a.cur.p.name) || '')) + ' (' + ads.get(a) + ')</option>'; }).join('');
    sel.value = state.procAd && ads.has(state.procAd) ? String(ds.recs.indexOf(state.procAd)) : '';
  }
  function show(ds) {
    if (state.ds !== ds) state.procAd = null;
    state.ds = ds;
    buildOverlays(ds);
    applyLayers();
    fillProcAd(ds);
    document.querySelectorAll('[data-count]').forEach(function (n) { var c = countOf(n.getAttribute('data-count')); n.textContent = c ? '(' + c + ')' : '(0)'; });
  }
  function setCompare(res) {
    state.cmp = res;
    var cb = document.getElementById('map-cmp');
    if (cb) { cb.disabled = !res; cb.checked = !!res; }
    if (map) buildCompare(res);
  }
  function dsBounds(ds) {
    var b = null;
    function ext(c) { if (!c || typeof c[0] !== 'number') return; if (!b) b = L.latLngBounds([c[1], c[0]], [c[1], c[0]]); else b.extend([c[1], c[0]]); }
    (ds.byType.AirportHeliport || []).forEach(function (a) { ext(M.pointOf(ds, a)); });
    (ds.byType.Airspace || []).slice(0, 2000).forEach(function (a) { shapesOf(M.geometry(ds, a), function (g) { if (g.t === 'A') g.c[0].forEach(ext); else if (g.t === 'L') g.c.forEach(ext); }); });
    if (!b) ds.recs.slice(0, 20000).forEach(function (r) { ext(M.pointOf(ds, r)); });
    return b;
  }
  function fit(instant) {
    if (!state.ds || !map) return;
    var b = dsBounds(state.ds);
    if (b && b.isValid()) map.fitBounds(b.pad(0.05), { maxZoom: 11, animate: !instant });
  }
  function focus(ds, r) {
    if (!map) return;
    if (state.ds !== ds) {
      var sel = document.getElementById('map-ds');
      show(ds);
      if (sel) { for (var i = 0; i < sel.options.length; i++) if (sel.options[i].textContent.indexOf(ds.name) >= 0) sel.value = sel.options[i].value; }
    }
    var g = M.geometry(ds, r), b = null;
    shapesOf(g, function (x) {
      var pts = x.t === 'P' ? [x.c] : x.t === 'L' ? x.c : x.c[0];
      pts.forEach(function (c) { if (typeof c[0] !== 'number') return; if (!b) b = L.latLngBounds([c[1], c[0]], [c[1], c[0]]); else b.extend([c[1], c[0]]); });
    });
    if (!b) { hooks.toast('This feature has no geometry to show on the map.'); return; }
    if (b.getNorthEast().equals(b.getSouthWest())) map.setView(b.getCenter(), Math.max(map.getZoom(), r.k === 'AirportHeliport' ? 12 : 10));
    else map.fitBounds(b.pad(0.2), { maxZoom: 14 });
    setTimeout(function () { openPopup(ds, r, b.getCenter()); }, 350);
  }
  // name of the country containing lon/lat (Natural Earth 1:50m), or null
  var countryIdx = null;
  function countryAt(lon, lat) {
    if (!countryIdx) {
      if (!world50) { var wj = JSON.parse(document.getElementById('data-world50').textContent); world50 = topojson.feature(wj, wj.objects.countries); }
      countryIdx = world50.features.map(function (f) {
        var g = f.geometry, polys = !g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
        var bb = [180, 90, -180, -90];
        polys.forEach(function (p) { p[0].forEach(function (c) { if (c[0] < bb[0]) bb[0] = c[0]; if (c[1] < bb[1]) bb[1] = c[1]; if (c[0] > bb[2]) bb[2] = c[0]; if (c[1] > bb[3]) bb[3] = c[1]; }); });
        return { name: f.properties && f.properties.name, polys: polys, bb: bb };
      });
    }
    function inRing(r) { var ins = false; for (var i = 0, j = r.length - 1; i < r.length; j = i++) { var xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1]; if (((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) ins = !ins; } return ins; }
    for (var k = 0; k < countryIdx.length; k++) {
      var c = countryIdx[k];
      if (lon < c.bb[0] || lon > c.bb[2] || lat < c.bb[1] || lat > c.bb[3]) continue;
      for (var q = 0; q < c.polys.length; q++) if (inRing(c.polys[q][0]) && !c.polys[q].slice(1).some(inRing)) return c.name;
    }
    return null;
  }
  function refreshTheme() { if (base.offline && base.offline.restyle) base.offline.restyle(); if (base.offline && base.offline.grat) base.offline.grat.redraw(); }

  /* ------------------------------------------------ static map renderer */
  // Renders the offline base map + aeronautical features of `ds` inside `bounds` to a PNG data URL.
  // opt: {title, sub, procAd, layers:{key:bool}, legend, north, grid, scale, footer}
  function renderImage(ds, bounds, w, h, opt) {
    opt = opt || {};
    var k = Math.max(1, w / 1600), lay = opt.layers || null;
    function on(key, def) { return !lay ? def !== false : lay[key] !== undefined ? lay[key] : def !== false; }
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var ctx = c.getContext('2d');
    if (!world50) { var wj = JSON.parse(document.getElementById('data-world50').textContent); world50 = topojson.feature(wj, wj.objects.countries); }
    var bw = bounds.getWest ? bounds.getWest() : bounds[0], bs = bounds.getSouth ? bounds.getSouth() : bounds[1], be = bounds.getEast ? bounds.getEast() : bounds[2], bn = bounds.getNorth ? bounds.getNorth() : bounds[3];
    function my(lat) { var r = lat * Math.PI / 180; return Math.log(Math.tan(Math.PI / 4 + r / 2)); }
    function iy(y) { return (2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180 / Math.PI; }
    var top = opt.title ? 34 * k : 0;
    var y0 = my(bn), y1 = my(bs), xs = w / ((be - bw) * Math.PI / 180), ys = (h - top) / (y0 - y1), sc = Math.min(xs, ys);
    var cx = (bw + be) / 2, cy = (y0 + y1) / 2;
    function P(lon, lat) { return [w / 2 + (lon - cx) * Math.PI / 180 * sc, top + (h - top) / 2 - (my(lat) - cy) * sc]; }
    // visible extent after aspect fitting
    var vw = cx - (w / 2) / sc * 180 / Math.PI, ve = cx + (w / 2) / sc * 180 / Math.PI, vn = iy(cy + ((h - top) / 2) / sc), vs = iy(cy - ((h - top) / 2) / sc);
    ctx.fillStyle = '#cfe3ee'; ctx.fillRect(0, 0, w, h);
    var geo = (sc > 3000 && world10) ? world10 : world50;
    ctx.fillStyle = '#f3efe9'; ctx.strokeStyle = '#b9aca4'; ctx.lineWidth = k;
    geo.features.forEach(function (f) {
      var g = f.geometry; if (!g) return;
      var polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
      polys.forEach(function (poly) {
        ctx.beginPath();
        poly.forEach(function (ring) { ring.forEach(function (pt, i) { var q = P(pt[0], pt[1]); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); }); ctx.closePath(); });
        ctx.fill('evenodd'); ctx.stroke();
      });
    });
    // coordinate grid
    var gstep = [30, 10, 5, 2, 1, 0.5, 0.25, 1 / 6, 1 / 12].filter(function (s2) { return (ve - vw) / s2 >= 3; })[0] || 1 / 12;
    function gl(v, isLon) { var a = Math.abs(v), d = Math.floor(a + 1e-9), m = Math.round((a - d) * 60); if (m === 60) { d++; m = 0; } return d + '°' + (m ? ('0' + m).slice(-2) + "'" : '') + (isLon ? (v < 0 ? 'W' : v > 0 ? 'E' : '') : (v < 0 ? 'S' : v > 0 ? 'N' : '')); }
    if (opt.grid !== false) {
      ctx.strokeStyle = 'rgba(60,80,100,.28)'; ctx.lineWidth = k; ctx.fillStyle = '#35505f'; ctx.font = Math.round(11 * k) + 'px Arial';
      for (var gx = Math.ceil(vw / gstep) * gstep; gx <= ve; gx += gstep) { var qx = P(gx, vn)[0]; ctx.beginPath(); ctx.moveTo(qx, top); ctx.lineTo(qx, h); ctx.stroke(); ctx.fillText(gl(gx, true), qx + 3 * k, top + 13 * k); }
      for (var gy = Math.ceil(vs / gstep) * gstep; gy <= vn; gy += gstep) { var qy = P(vw, gy)[1]; ctx.beginPath(); ctx.moveTo(0, qy); ctx.lineTo(w, qy); ctx.stroke(); ctx.fillText(gl(gy, false), 4 * k, qy - 3 * k); }
    }
    function inView(pt) { return pt[0] >= vw - 2 && pt[0] <= ve + 2 && pt[1] >= vs - 2 && pt[1] <= vn + 2; }
    function path(cs) { ctx.beginPath(); cs.forEach(function (pt, i) { var q = P(pt[0], pt[1]); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); }); }
    var used = {};
    if (ds) {
      (ds.byType.Airspace || []).forEach(function (a) {
        var cat = asCat(s(a.cur.p.type)), col = COLORS[cat];
        if (!on('as_' + cat)) return;
        shapesOf(M.geometry(ds, a), function (g) {
          if (g.t !== 'A') return;
          var ring = g.c[0].filter(function (p) { return typeof p[0] === 'number'; });
          if (!ring.some(inView)) return;
          path(ring); ctx.closePath();
          ctx.globalAlpha = 0.07; ctx.fillStyle = col; ctx.fill(); ctx.globalAlpha = 1; ctx.strokeStyle = col; ctx.lineWidth = 1.5 * k;
          ctx.setLineDash(cat === 'prd' || cat === 'mil' ? [6 * k, 4 * k] : []); ctx.stroke(); ctx.setLineDash([]);
          used['as_' + cat] = 1;
        });
      });
      if (on('routes')) (ds.byType.RouteSegment || []).forEach(function (sg) {
        var g = M.geometry(ds, sg); if (!g || g.t !== 'L' || !g.c.some(inView)) return;
        var rnav = /RNAV|RNP/.test(s(sg.cur.p.navigationType));
        path(g.c); ctx.strokeStyle = rnav ? COLORS.rnav : COLORS.route; ctx.lineWidth = 1.5 * k; ctx.stroke(); used[rnav ? 'rnav' : 'route'] = 1;
      });
      if (on('aerodrome')) (ds.byType.Runway || []).forEach(function (rw) {
        shapesOf(M.geometry(ds, rw), function (g) {
          if (g.t !== 'L' || !g.c.some(inView)) return;
          path(g.c); ctx.strokeStyle = '#222'; ctx.lineWidth = 5 * k; ctx.stroke(); used.rwy = 1;
        });
      });
      if (opt.procAd || on('procs', false)) {
        ['StandardInstrumentDeparture', 'StandardInstrumentArrival', 'InstrumentApproachProcedure'].forEach(function (kk) {
          (ds.byType[kk] || []).forEach(function (pr) {
            if (opt.procAd ? ds.owner.get(pr) !== opt.procAd : (state.procAd && ds.owner.get(pr) !== state.procAd)) return;
            if (state.procKinds && state.procKinds[PROC_K[kk]] === false) return;
            procPaths(ds, pr).forEach(function (sg) {
              if (!sg.coords.some(inView)) return;
              path(sg.coords); ctx.setLineDash(sg.dashed ? [8 * k, 6 * k] : []); ctx.strokeStyle = PROC_COL[kk]; ctx.lineWidth = 2.5 * k; ctx.stroke(); ctx.setLineDash([]);
              used['p' + PROC_K[kk]] = 1;
            });
          });
        });
      }
      ctx.font = '600 ' + Math.round(13 * k) + 'px "Segoe UI", Arial, sans-serif';
      var pts = [];
      if (on('pAd')) (ds.byType.AirportHeliport || []).forEach(function (a) { var p = M.pointOf(ds, a); if (p) pts.push([p, s(a.cur.p.type) === 'HP' ? 'HP' : 'AD', COLORS.ad, M.shortName(a), 'ad']); });
      if (on('pNav')) (ds.byType.Navaid || []).forEach(function (n) { var p = M.pointOf(ds, n); if (p) pts.push([p, navSym(n), COLORS.nav, s(n.cur.p.designator), 'nav']); });
      if (on('pDp')) (ds.byType.DesignatedPoint || []).forEach(function (d) { var p = M.pointOf(ds, d); if (p) pts.push([p, 'DP', COLORS.dp, s(d.cur.p.designator), 'dp']); });
      var obsList = on('obstacles') ? (ds.byType.VerticalStructure || []) : [];
      if (obsList.length < 20000) obsList.forEach(function (o) { var p = M.pointOf(ds, o); if (p) pts.push([p, 'OBS', COLORS.obst, '', 'obs']); });
      var visPts = pts.filter(function (x) { return inView(x[0]); });
      visPts.forEach(function (x) {
        var q = P(x[0][0], x[0][1]);
        sym(ctx, x[1], q[0], q[1], x[2], 7 * k);
        used[x[4]] = 1;
        if (x[3] && visPts.length < 400 * k) { ctx.lineWidth = 3 * k; ctx.lineJoin = 'round'; ctx.strokeStyle = '#fff'; ctx.strokeText(x[3], q[0] + 10 * k, q[1] - 2 * k); ctx.fillStyle = x[2]; ctx.fillText(x[3], q[0] + 10 * k, q[1] - 2 * k); }
      });
    }
    // frame and title
    ctx.strokeStyle = '#5c0632'; ctx.lineWidth = 4 * k; ctx.strokeRect(2 * k, 2 * k, w - 4 * k, h - 4 * k);
    if (opt.title) {
      ctx.fillStyle = 'rgba(92,6,50,.94)'; ctx.fillRect(0, 0, w, top);
      ctx.fillStyle = '#fff'; ctx.font = '600 ' + Math.round(16 * k) + 'px "Segoe UI", Arial, sans-serif'; ctx.fillText(opt.title, 14 * k, 23 * k);
      if (opt.sub) { ctx.font = Math.round(12 * k) + 'px "Segoe UI", Arial, sans-serif'; var tw = ctx.measureText(opt.sub).width; ctx.fillText(opt.sub, w - tw - 14 * k, 22 * k); }
    }
    // north arrow
    if (opt.north !== false) {
      var nx = w - 46 * k, ny = top + 60 * k, r = 20 * k;
      ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.arc(nx, ny, r + 8 * k, 0, 2 * Math.PI); ctx.fill(); ctx.strokeStyle = '#555'; ctx.lineWidth = k; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(nx, ny - r); ctx.lineTo(nx + r * 0.45, ny + r * 0.6); ctx.lineTo(nx, ny + r * 0.25); ctx.closePath(); ctx.fillStyle = '#5c0632'; ctx.fill();
      ctx.beginPath(); ctx.moveTo(nx, ny - r); ctx.lineTo(nx - r * 0.45, ny + r * 0.6); ctx.lineTo(nx, ny + r * 0.25); ctx.closePath(); ctx.fillStyle = '#c9a0b4'; ctx.fill();
      ctx.fillStyle = '#222'; ctx.font = '700 ' + Math.round(11 * k) + 'px Arial'; ctx.fillText('N', nx - 4 * k, ny - r - 9 * k);
    }
    // legend
    if (opt.legend !== false && ds) {
      var items = [];
      AS_CATS.forEach(function (cc) { if (used['as_' + cc[0]]) items.push(['area', COLORS[cc[0]], cc[1], cc[0] === 'prd' || cc[0] === 'mil']); });
      if (used.route) items.push(['line', COLORS.route, 'ATS route']);
      if (used.rnav) items.push(['line', COLORS.rnav, 'RNAV route']);
      if (used.pSID) items.push(['line', PROC_COL.StandardInstrumentDeparture, 'SID']);
      if (used.pSTAR) items.push(['line', PROC_COL.StandardInstrumentArrival, 'STAR']);
      if (used.pIAP) items.push(['line', PROC_COL.InstrumentApproachProcedure, 'Instrument approach']);
      if (used.rwy) items.push(['rwy', '#222', 'Runway']);
      if (used.ad) items.push(['sym', COLORS.ad, 'Aerodrome / heliport', 'AD']);
      if (used.nav) items.push(['sym', COLORS.nav, 'Radio navigation aid', 'VOR']);
      if (used.dp) items.push(['sym', COLORS.dp, 'Designated point', 'DP']);
      if (used.obs) items.push(['sym', COLORS.obst, 'Obstacle', 'OBS']);
      if (items.length) {
        ctx.font = Math.round(12 * k) + 'px Arial';
        var lh = 18 * k, lw = Math.max(170 * k, 50 * k + Math.max.apply(null, items.map(function (it) { return ctx.measureText(it[2]).width; }))), lx = 12 * k, lyy = h - 46 * k - items.length * lh - 22 * k;
        ctx.fillStyle = 'rgba(255,255,255,.93)'; ctx.fillRect(lx, lyy, lw, items.length * lh + 26 * k); ctx.strokeStyle = '#999'; ctx.lineWidth = k; ctx.strokeRect(lx, lyy, lw, items.length * lh + 26 * k);
        ctx.fillStyle = '#5c0632'; ctx.font = '700 ' + Math.round(12 * k) + 'px Arial'; ctx.fillText('LEGEND', lx + 8 * k, lyy + 16 * k);
        items.forEach(function (it, i) {
          var yy = lyy + 26 * k + i * lh + lh / 2, x0 = lx + 10 * k;
          if (it[0] === 'area') { ctx.globalAlpha = 0.15; ctx.fillStyle = it[1]; ctx.fillRect(x0, yy - 6 * k, 26 * k, 12 * k); ctx.globalAlpha = 1; ctx.strokeStyle = it[1]; ctx.lineWidth = 1.5 * k; ctx.setLineDash(it[3] ? [4 * k, 3 * k] : []); ctx.strokeRect(x0, yy - 6 * k, 26 * k, 12 * k); ctx.setLineDash([]); }
          else if (it[0] === 'line' || it[0] === 'rwy') { ctx.strokeStyle = it[1]; ctx.lineWidth = (it[0] === 'rwy' ? 5 : 2.5) * k; ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x0 + 26 * k, yy); ctx.stroke(); }
          else sym(ctx, it[3], x0 + 13 * k, yy, it[1], 6 * k);
          ctx.fillStyle = '#222'; ctx.font = Math.round(12 * k) + 'px Arial'; ctx.fillText(it[2], x0 + 36 * k, yy + 4 * k);
        });
      }
    }
    // scale bar
    var nmPerPx = AX.distNM([cx, (vs + vn) / 2], [cx + 1, (vs + vn) / 2]) / (Math.PI / 180 * sc);
    var nice = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000].filter(function (v) { return v / nmPerPx < w / 4; }).pop() || 1;
    var len = nice / nmPerPx, sx = w / 2 - len / 2;
    if (opt.scale !== false) {
      ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fillRect(sx - 10 * k, h - 40 * k, len + 110 * k, 26 * k);
      ctx.fillStyle = '#222'; ctx.fillRect(sx, h - 28 * k, len, 4 * k); ctx.fillRect(sx, h - 33 * k, 2 * k, 14 * k); ctx.fillRect(sx + len - 2 * k, h - 33 * k, 2 * k, 14 * k);
      ctx.font = Math.round(12 * k) + 'px Arial'; ctx.fillText(nice + ' NM (' + (nice * 1.852).toFixed(nice < 5 ? 1 : 0) + ' km)', sx + len + 8 * k, h - 22 * k);
    }
    ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.font = Math.round(10 * k) + 'px Arial';
    var foot = (opt.footer ? opt.footer + '  ·  ' : '') + 'Base map: Natural Earth (public domain) · Mercator · not for navigation';
    var fw = ctx.measureText(foot).width; ctx.fillRect(w - fw - 16 * k, h - 20 * k, fw + 12 * k, 16 * k); ctx.fillStyle = '#555'; ctx.fillText(foot, w - fw - 10 * k, h - 8 * k);
    return c.toDataURL('image/png');
  }

  /* --------------------------------------------------------- print dialog */
  var PAPER = { A4L: [297, 210], A4P: [210, 297], A3L: [420, 297], A3P: [297, 420] };
  function printDialog(bounds) {
    var old = document.getElementById('map-print-dlg'); if (old) old.remove();
    var ds = state.ds, b = bounds || map.getBounds();
    var d = document.createElement('div');
    d.className = 'modal-back'; d.id = 'map-print-dlg';
    d.innerHTML = '<div class="modal" style="width:min(560px,100%)"><div class="modal-head"><h3>Print map</h3><span class="sp"></span><button class="btn small ghost" data-p="close">✕</button></div><div class="modal-body">' +
      '<div class="muted" style="margin-bottom:8px">Area: ' + (bounds ? 'the rectangle you selected' : 'the current map view') + ' — ' + AX.fmtPos([b.getWest(), b.getNorth()], 0) + ' to ' + AX.fmtPos([b.getEast(), b.getSouth()], 0) + '. <a href="#" data-p="area">Select another area on the map</a></div>' +
      '<label>Title<br><input class="inp" id="mp-title" style="width:100%" value="' + esc(ds ? ds.state + (ds.airac ? ' — AIRAC ' + ds.airac.id : '') : 'Map') + '"></label>' +
      '<div class="row wrap" style="gap:14px;margin-top:10px"><label>Paper<br><select class="inp" id="mp-paper"><option value="A4L">A4 landscape</option><option value="A4P">A4 portrait</option><option value="A3L">A3 landscape</option><option value="A3P">A3 portrait</option></select></label>' +
      '<div><br>' + [['legend', 'Legend'], ['north', 'North arrow'], ['grid', 'Coordinate grid'], ['scale', 'Scale bar']].map(function (x) { return '<label class="chk" style="display:inline-flex;margin-right:10px"><input type="checkbox" data-o="' + x[0] + '" checked> ' + x[1] + '</label>'; }).join('') + '</div></div>' +
      '<div class="muted" style="font-size:12px;margin-top:8px">The layers switched on in the map panel are printed. Procedures are included when the procedure layer is on.</div>' +
      '<div class="row" style="gap:8px;margin-top:14px;justify-content:flex-end"><button class="btn" data-p="png">Save PNG</button><button class="btn" data-p="print">Print</button><button class="btn primary" data-p="pdf">Save PDF</button></div></div></div>';
    document.body.appendChild(d);
    d.addEventListener('click', function (e) {
      if (e.target === d) { d.remove(); return; }
      var a = e.target.closest('[data-p]'); if (!a) return;
      e.preventDefault();
      var k = a.getAttribute('data-p');
      if (k === 'close') { d.remove(); return; }
      if (k === 'area') { d.remove(); selectArea(); return; }
      var paper = PAPER[d.querySelector('#mp-paper').value], mm = 8, W = paper[0] * mm, H = paper[1] * mm, o = {};
      d.querySelectorAll('[data-o]').forEach(function (cb) { o[cb.getAttribute('data-o')] = cb.checked; });
      var layers = {};
      LAYER_DEF.forEach(function (x) { layers[x[0]] = state.filters[x[0]] !== undefined ? state.filters[x[0]] : x[2]; });
      AS_CATS.forEach(function (x) { layers['as_' + x[0]] = state.filters['as_' + x[0]] !== undefined ? state.filters['as_' + x[0]] : true; });
      var title = d.querySelector('#mp-title').value;
      hooks.toast('Rendering the map…');
      setTimeout(function () {
        var url = renderImage(ds, b, W, H, { title: title, sub: ds ? ds.name : '', layers: layers, legend: o.legend, north: o.north, grid: o.grid, scale: o.scale, footer: 'Printed ' + new Date().toISOString().slice(0, 16).replace('T', ' ') + 'Z' });
        if (k === 'png') hooks.savePng(url);
        else if (k === 'pdf') {
          var land = paper[0] > paper[1], doc = new window.jspdf.jsPDF({ orientation: land ? 'landscape' : 'portrait', unit: 'mm', format: paper[0] === 420 || paper[1] === 420 ? 'a3' : 'a4' });
          doc.addImage(url, 'PNG', 0, 0, paper[0], paper[1]);
          doc.save((title || 'map').replace(/[^\w.-]+/g, '_') + '.pdf');
        } else {
          var root = document.getElementById('print-root');
          root.innerHTML = '<style>@page { size: ' + (paper[0] === 420 || paper[1] === 420 ? 'A3' : 'A4') + ' ' + (paper[0] > paper[1] ? 'landscape' : 'portrait') + '; margin: 0 }</style><img src="' + url + '" style="width:100%;display:block">';
          setTimeout(function () { window.print(); }, 60);
        }
        d.remove();
      }, 30);
    });
  }
  function selectArea() {
    hooks.toast('Drag a rectangle on the map to choose the print area (Esc to cancel).', 5000);
    var start = null, rect = null, cont = map.getContainer();
    map.dragging.disable(); cont.style.cursor = 'crosshair';
    function done(ok) {
      map.off('mousedown', down); map.off('mousemove', move); map.off('mouseup', up); document.removeEventListener('keydown', key);
      map.dragging.enable(); cont.style.cursor = '';
      var bb = rect ? rect.getBounds() : null; if (rect) map.removeLayer(rect);
      if (ok && bb && bb.isValid()) printDialog(bb);
    }
    function down(e) { start = e.latlng; rect = L.rectangle([start, start], { color: '#5c0632', weight: 2, dashArray: '6 4', fillOpacity: 0.08 }).addTo(map); }
    function move(e) { if (start && rect) rect.setBounds([start, e.latlng]); }
    function up() { if (start) done(true); }
    function key(e) { if (e.key === 'Escape') done(false); }
    map.on('mousedown', down); map.on('mousemove', move); map.on('mouseup', up); document.addEventListener('keydown', key);
  }
  function boundsAround(ds, r, nm) {
    var c = M.pointOf(ds, r);
    if (!c) return null;
    var d = (nm || 12) / 60;
    return [c[0] - d / Math.cos(c[1] * Math.PI / 180), c[1] - d * 0.7, c[0] + d / Math.cos(c[1] * Math.PI / 180), c[1] + d * 0.7];
  }
  function datasetBounds(ds) { var b = dsBounds(ds); return b ? [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()] : null; }

  return { countryAt: countryAt, mount: mount, show: show, focus: focus, showProcs: showProcs, procPaths: procPaths, setCompare: setCompare, refreshTheme: refreshTheme, renderImage: renderImage, boundsAround: boundsAround, datasetBounds: datasetBounds,
    isMounted: function () { return !!map; }, leaflet: function () { return map; }, invalidate: function () { if (map) map.invalidateSize(); } };
})();
