// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Base maps without gaps: where the Esri server has no map (open sea, closer in than its last level) it answers with a
// grey picture "Map data not yet available" (HTTP 200). The tool recognises it and shows the enlarged level that has data.
// The server is played here (solid blue tiles up to zoom 11, the placeholder from zoom 12), so the test needs no internet.
/* global TILES, L, MAPVIEW */
const zlib = require('zlib');
const env = require('./_env');
const ROOT = env.ROOT;

function crc32(buf) { let crc = ~0; for (let i = 0; i < buf.length; i++) { crc ^= buf[i]; for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return (~crc) >>> 0; }
function chunk(type, data) { const t = Buffer.from(type), len = Buffer.alloc(4), crc = Buffer.alloc(4); len.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, crc]); }
function png(r, g, b, noise) {
  const row = Buffer.alloc(1 + 256 * 3); for (let x = 0; x < 256; x++) { row[1 + x * 3] = r; row[2 + x * 3] = g; row[3 + x * 3] = b; }
  const raw = Buffer.concat(Array.from({ length: 256 }, (_, y) => { const c = Buffer.from(row); if (noise && y % 40 === 0) c[5] ^= noise; return c; }));
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(256, 0); ihdr.writeUInt32BE(256, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const GOOD = png(30, 90, 200), HOLE = png(204, 204, 204, 7);

(async () => {
  const browser = await env.playwright.chromium.launch({ executablePath: env.chrome });
  const errors = [], fails = [];
  const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  let mode = 'play', asked = [];
  await page.route('**/*', (route) => {
    const u = route.request().url(), m = /server\.arcgisonline\.com\/.*\/tile\/(\d+)\/(\d+)\/(\d+)/.exec(u);
    if (!m) return /^(file|data|blob):/.test(u) ? route.continue() : route.abort();
    const z = +m[1]; asked.push(z);
    const cors = { 'access-control-allow-origin': '*', 'content-type': 'image/png' };
    if (mode === 'down') return route.fulfill({ status: 500, headers: cors, body: 'down' });
    return route.fulfill({ status: 200, headers: cors, body: z >= 12 ? HOLE : GOOD });
  });
  await page.goto('file://' + ROOT + '/AIXM-Code-Converter.html'); await page.waitForSelector('#drop');
  await page.evaluate(([len, hex]) => { TILES.config.len = len; TILES.config.sum = TILES.sum(new Uint8Array(hex)); }, [HOLE.length, Array.from(HOLE)]);

  // a stand-alone map with the tile layer of the tool
  async function tiles(url, view, zoom) {
    asked = [];
    return page.evaluate(async ([u, v, z]) => {
      const old = document.getElementById('tm'); if (old) { old._map.remove(); old.remove(); }
      const div = document.createElement('div'); div.id = 'tm'; div.style.cssText = 'position:fixed;left:0;top:0;width:700px;height:500px;z-index:9999;background:#fff'; document.body.appendChild(div);
      const map = L.map(div, { zoomControl: false, fadeAnimation: false, zoomAnimation: false }); div._map = map;
      const layer = TILES.layer(u, { maxZoom: 19, maxNativeZoom: 19, crossOrigin: true, subdomains: 'abc' }).addTo(map);
      let errs = 0, loads = 0; layer.on('tileerror', () => errs++); layer.on('tileload', () => loads++);
      map.setView(v, z, { animate: false });
      await new Promise((res) => { layer.once('load', res); setTimeout(res, 6000); });
      await new Promise((r) => setTimeout(r, 200));
      const cs = [...div.querySelectorAll('.leaflet-tile')];
      const col = cs.filter((c) => c.getContext).map((c) => Array.from(c.getContext('2d').getImageData(128, 128, 1, 1).data.slice(0, 3)));
      return { plain: typeof layer.urlOf !== 'function', tiles: cs.length, colours: col, errs: errs, loads: loads };
    }, [url, view, zoom]);
  }
  const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';
  const isBlue = (c) => c[0] < 60 && c[2] > 150, isGrey = (c) => Math.abs(c[0] - 204) < 12 && Math.abs(c[1] - 204) < 12;

  // 1. open sea, zoom 16: the server has only the grey placeholder from zoom 12; the enlarged zoom 11 is shown
  let r = await tiles(ESRI, [52.372, -31.949], 16);
  console.log('sea z16:', JSON.stringify({ tiles: r.tiles, blue: r.colours.filter(isBlue).length, grey: r.colours.filter(isGrey).length, errs: r.errs, asked: [...new Set(asked)].sort((a, b) => a - b) }));
  if (!r.tiles || r.colours.some(isGrey) || r.colours.some((c) => !isBlue(c))) fails.push('sea z16: grey or unknown tiles remain ' + JSON.stringify(r.colours.slice(0, 3)));
  if (r.errs) fails.push('sea z16: tileerror ' + r.errs);
  if (Math.min.apply(null, asked) < 11) fails.push('looked further out than needed: ' + Math.min.apply(null, asked));
  if (!asked.includes(16) || !asked.includes(11)) fails.push('levels asked: ' + [...new Set(asked)].join(','));

  // 2. a level the server has: loaded as it is, no extra requests
  r = await tiles(ESRI, [49.0097, 2.5479], 8);
  if (!r.tiles || !r.colours.every(isBlue)) fails.push('z8: ' + JSON.stringify(r.colours.slice(0, 3)));
  if (Math.max.apply(null, asked) !== 8 || Math.min.apply(null, asked) !== 8) fails.push('z8: asked ' + [...new Set(asked)].join(','));

  // 3. a server that is down still raises tileerror (the maps fall back to another base map or the offline map)
  mode = 'down'; r = await tiles(ESRI, [49.0097, 2.5479], 8); mode = 'play';
  if (!r.errs || r.loads) fails.push('server down: errors ' + r.errs + ', loaded ' + r.loads);

  // 4. other servers keep Leaflet's own layer
  r = await page.evaluate(() => { const l = TILES.layer('https://tile.openstreetmap.de/{z}/{x}/{y}.png', {}); return { plain: typeof l.urlOf !== 'function', isTile: l instanceof L.TileLayer }; });
  if (!r.plain || !r.isTile) fails.push('other servers: ' + JSON.stringify(r));

  // 5. the tool's own maps use it: Map tab with the recommended base map, at sea and zoomed far in
  await page.setInputFiles('#file-input', [ROOT + '/testdata/Donlon_ALL_Baseline_2025.xml', ROOT + '/testdata/EA_EADD_OBS_DS_AREA_2_3_4_FULL_20191205.xml', ROOT + '/testdata/ifp_test_EADD.xml']);
  await page.waitForFunction(() => !window.__AIXM.S.adding && window.__AIXM.S.files.length === 3 && window.__AIXM.S.files.every((f) => f.status === 'ready'));
  await page.evaluate(() => document.querySelector('#extract-btn').click());
  await page.waitForFunction(() => window.__AIXM.S.view === 'dash', null, { timeout: 60000 });
  asked = [];
  await page.evaluate(() => { window.__AIXM.go('map'); });
  await page.waitForSelector('#map .leaflet-tile-pane', { state: 'attached' }); await page.waitForTimeout(800);
  await page.selectOption('#map-base', 'esriStreet'); // the tool starts with its offline map
  await page.evaluate(() => { MAPVIEW.leaflet().setView([52.372, -31.949], 17, { animate: false }); });
  await page.waitForTimeout(2500);
  const mp = await page.evaluate(() => { const cs = [...document.querySelectorAll('#map .leaflet-tile-pane canvas.leaflet-tile')]; return cs.map((c) => Array.from(c.getContext('2d').getImageData(128, 128, 1, 1).data.slice(0, 3))); });
  console.log('Map tab z17 at sea:', mp.length, 'tiles, grey', mp.filter(isGrey).length);
  if (!mp.length || mp.some(isGrey)) fails.push('Map tab: ' + mp.length + ' tiles, grey ' + mp.filter(isGrey).length);

  // 6. flight and obstacle analysis: its map with the dark base map, zoomed far in at sea
  await page.evaluate(() => window.__AIXM.go('digital', { sec: 'flt' }));
  await page.waitForFunction(() => { const v = document.querySelector('.flt-verdict'); return v && !v.querySelector('.spinner'); }, null, { timeout: 60000 });
  await page.selectOption('.flt-stage .fs-base', 'esriDark');
  for (let i = 0; i < 9; i++) { await page.evaluate(() => document.querySelector('.flt-stage .leaflet-control-zoom-in').click()); await page.waitForTimeout(250); } // stops by itself at the last zoom
  await page.waitForTimeout(2500);
  const fm = await page.evaluate(() => [...document.querySelectorAll('.flt-stage .fs-map .leaflet-tile-pane canvas.leaflet-tile')].map((c) => Array.from(c.getContext('2d').getImageData(128, 128, 1, 1).data.slice(0, 3))));
  console.log('analysis map, dark base:', fm.length, 'tiles, grey', fm.filter(isGrey).length);
  if (!fm.length || fm.some(isGrey)) fails.push('analysis map: ' + fm.length + ' tiles, grey ' + fm.filter(isGrey).length);

  console.log(errors.join('\n') || 'no errors');
  console.log(fails.length ? 'FAIL: ' + fails.join('; ') : 'base map without gaps OK');
  if (errors.length || fails.length) process.exitCode = 1;
  await browser.close();
})();
