// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Builds the built-in global terrain model data/terrain.json from the public
// "Terrain Tiles" (Mapzen / AWS Open Data, Terrarium encoding; sources SRTM, GMTED2010, ETOPO1 and others):
//   mean - mean elevation per 0.25° cell (1440 x 720), used by the 3D view when offline
//   max  - highest elevation per 1° cell (360 x 180), used for the grid MORA on the map
// Elevations in metres, Int16 little-endian, zlib-deflated, base64.
// Usage: node build_terrain.js [zoom=5]      (needs internet once; the result is committed)
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execFile } = require('child_process');
const { PNG } = require('pngjs');

const Z = +(process.argv[2] || 5), N = 1 << Z;
const URL = (x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${x}/${y}.png`;
const CACHE = path.join(__dirname, 'node_modules', '.terrain-cache', String(Z));
fs.mkdirSync(CACHE, { recursive: true });

function fetchTile(x, y) {
  const f = path.join(CACHE, `${x}_${y}.png`);
  if (fs.existsSync(f) && fs.statSync(f).size > 100) return Promise.resolve(f);
  return new Promise((resolve, reject) => execFile('curl', ['-sf', '--retry', '3', '-o', f, URL(x, y)], (e) => (e ? reject(e) : resolve(f))));
}
async function all(tasks, n) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < tasks.length) { const k = i++; out[k] = await tasks[k](); } }));
  return out;
}

(async () => {
  const W = 1440, H = 720, sum = new Float64Array(W * H), cnt = new Uint32Array(W * H);
  const MW = 360, MH = 180, mx = new Int16Array(MW * MH).fill(-32768);
  const tasks = [];
  for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) tasks.push(() => fetchTile(x, y).then((f) => ({ x, y, f })));
  let done = 0;
  const files = await all(tasks.map((t) => () => t().then((r) => { if (++done % 128 === 0) console.log('tiles', done, '/', tasks.length); return r; })), 16);
  for (const { x, y, f } of files) {
    let png;
    try { png = PNG.sync.read(fs.readFileSync(f)); } catch (e) { fs.unlinkSync(f); await fetchTile(x, y); png = PNG.sync.read(fs.readFileSync(f)); } // truncated download
    const d = png.data, S = png.width;
    for (let py = 0; py < S; py++) {
      const n = Math.PI - 2 * Math.PI * (y * S + py + 0.5) / (N * S);
      const lat = 180 / Math.PI * Math.atan(Math.sinh(n));
      const gy = Math.min(H - 1, Math.max(0, Math.floor((90 - lat) * 4))), my = Math.min(MH - 1, Math.max(0, Math.floor(90 - lat)));
      for (let px = 0; px < S; px++) {
        const lon = (x * S + px + 0.5) / (N * S) * 360 - 180;
        const o = (py * S + px) * 4, e = d[o] * 256 + d[o + 1] + d[o + 2] / 256 - 32768;
        const gx = Math.min(W - 1, Math.floor((lon + 180) * 4)), k = gy * W + gx;
        sum[k] += e; cnt[k]++;
        const m = my * MW + Math.min(MW - 1, Math.floor(lon + 180));
        if (e > mx[m]) mx[m] = Math.min(32767, Math.round(e));
      }
    }
  }
  const mean = new Int16Array(W * H);
  for (let i = 0; i < W * H; i++) mean[i] = cnt[i] ? Math.max(-1000, Math.min(9000, Math.round(sum[i] / cnt[i]))) : -32768;
  // polar rows outside Web Mercator (beyond about 85°): copy the nearest filled row
  for (let r = 0; r < H; r++) {
    if (mean[r * W] !== -32768) continue;
    const src = r < H / 2 ? (() => { for (let q = r; q < H; q++) if (mean[q * W] !== -32768) return q; return r; })() : (() => { for (let q = r; q >= 0; q--) if (mean[q * W] !== -32768) return q; return r; })();
    mean.copyWithin(r * W, src * W, src * W + W);
  }
  for (let r = 0; r < MH; r++) if (mx[r * MW] === -32768) { const src = r < MH / 2 ? r + 1 : r - 1; for (let c = 0; c < MW; c++) mx[r * MW + c] = mx[src * MW + c] === -32768 ? 0 : mx[src * MW + c]; }
  const pack = (a) => zlib.deflateSync(Buffer.from(a.buffer), { level: 9 }).toString('base64');
  const out = { source: 'Terrain Tiles (Mapzen / AWS Open Data: SRTM, GMTED2010, ETOPO1 and others), terrarium zoom ' + Z, unit: 'm',
    mean: { w: W, h: H, res: 0.25, data: pack(mean) }, max: { w: MW, h: MH, res: 1, data: pack(mx) } };
  const file = path.join(__dirname, '..', 'data', 'terrain.json');
  fs.writeFileSync(file, JSON.stringify(out));
  console.log('wrote', file, (fs.statSync(file).size / 1024).toFixed(0) + ' KB');
})();
