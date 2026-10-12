// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Charts that are pictures, read by OCR (Digital data → Aerodrome mapping → 📤 Upload):
// - a parking / docking chart of EADD made here as an image inside a PDF (only its frame is text), with a stand
//   coordinates table, a runway table with two-line threshold cells and a taxiway table;
// - the document is known as a picture; the OCR engine is downloaded only when asked (here served from the local
//   npm copies of the very files jsDelivr serves), checked against its SHA-256 and kept: a second chart downloads
//   nothing; no page error in a page opened from a file;
// - the tables come back row by row: every stand at its position (within a metre), the threshold, the taxiway
//   widths; the chart's type and title; the data go into the readiness and the generated AMXM, which is valid.
/* global AMDBX, AMDBDOC, AMDBPKG, LAZY */
const env = require('./_env');
const fs = require('fs');
const path = require('path');
const ROOT = env.ROOT, OUT = env.out('amdb_ocr'), T = ROOT + '/testdata/';
const URL = 'file://' + ROOT + '/AIXM-Code-Converter.html';
const NM = ROOT + '/tools/node_modules/';
const LOCAL = { 'tesseract.js@7.0.0/dist/': NM + 'tesseract.js/dist/', 'tesseract.js-core@6.1.2/': NM + 'tesseract.js-core/', '@tesseract.js-data/eng@1.0.0/': NM + '@tesseract.js-data/eng/' };
const { jsPDF } = require(path.join(ROOT, 'tools/node_modules/jspdf'));
const { validateAmxm } = require('./_xsd');
function dms(v, lat) { const h = lat ? (v < 0 ? 'S' : 'N') : (v < 0 ? 'W' : 'E'); v = Math.abs(v); const d = Math.floor(v), m = Math.floor((v - d) * 60), s = ((v - d) * 60 - m) * 60; return String(d).padStart(lat ? 2 : 3, '0') + '°' + String(m).padStart(2, '0') + '\'' + s.toFixed(2).padStart(5, '0') + '"' + h; }

(async () => {
  const browser = await env.playwright.chromium.launch({ executablePath: env.chrome });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  const fetched = [];
  await ctx.route(/^https?:\/\//, (r) => {
    const m = /^https:\/\/cdn\.jsdelivr\.net\/npm\/(.+)$/.exec(r.request().url());
    const k = m && Object.keys(LOCAL).filter((p) => m[1].startsWith(p))[0];
    if (!k) return r.abort();
    fetched.push(m[1]);
    return r.fulfill({ status: 200, body: fs.readFileSync(LOCAL[k] + m[1].slice(k.length)), headers: { 'access-control-allow-origin': '*' } });
  });
  const page = await ctx.newPage();
  const errors = [], fails = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const status = () => page.evaluate(() => (document.querySelector('.up-st') || {}).textContent || '');
  async function drop(files) { const b = await status(); await page.setInputFiles('[data-upin]', files); await page.waitForFunction((b) => { const s = document.querySelector('.up-st'); return s && s.textContent !== b && !s.querySelector('.spinner'); }, b, { timeout: 90000 }); }

  await page.goto(URL); await page.waitForSelector('#drop');
  if (await page.evaluate(() => typeof window.AMDBOCR !== 'undefined' || typeof window.Tesseract !== 'undefined')) fails.push('the OCR module ran before it was needed');
  await page.evaluate(() => window.__AIXM.go('digital')); await page.waitForSelector('[data-upin]', { state: 'attached' });
  await drop([T + 'EA_AIP_DS_FULL_20170701.xml']);
  const ad = await page.evaluate(() => { const c = AMDBX.candidates(window.__AIXM.S.datasets).filter((x) => x.code === 'EADD')[0]; return { arp: c.arp, thr: c.rwys[0].dirs[0].pts.filter((q) => /^THR$/.test(q.role) && q.c)[0].c, des: c.rwys[0].dirs[0].des }; });

  /* ------------------------------------------- a chart that is a picture */
  const stands = [101, 102, 103, 104, 105, 106, 107, 108].map((n, i) => ({ id: String(n), c: [ad.arp[0] + 0.003 + Math.floor(i / 4) * 0.0006, ad.arp[1] - 0.0015 - (i % 4) * 0.0004] }));
  const rows = stands.map((s) => [s.id, dms(s.c[1], true), dms(s.c[0], false)]);
  const jpg = await page.evaluate(({ rows, thr, des }) => {
    const c = document.createElement('canvas'); c.width = 2400; c.height = 1700; const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, 2400, 1700); g.fillStyle = '#000'; g.strokeStyle = '#000'; g.lineWidth = 3;
    g.font = 'bold 46px Arial, sans-serif'; g.fillText('AIRCRAFT PARKING / DOCKING CHART - ICAO', 80, 110); g.fillText('DONLON / DONLON INTL', 1500, 110);
    g.font = '30px Arial, sans-serif'; g.fillText('APRON ELEV 30 FT', 80, 170);
    // a table: its ruling lines, each cell's text (a cell of two lines for a threshold)
    function table(x, y, ws, h, data) {
      const W = ws.reduce((a, b) => a + b, 0);
      for (let r = 0; r <= data.length; r++) { g.beginPath(); g.moveTo(x, y + r * h); g.lineTo(x + W, y + r * h); g.stroke(); }
      let cx = x; for (let k = 0; k <= ws.length; k++) { g.beginPath(); g.moveTo(cx, y); g.lineTo(cx, y + data.length * h); g.stroke(); cx += ws[k] || 0; }
      data.forEach((row, r) => { let tx = x; row.forEach((t, k) => { String(t).split('\n').forEach((ln, j, all) => { g.fillText(ln, tx + 18, y + r * h + h / 2 + 11 + (j - (all.length - 1) / 2) * 36); }); tx += ws[k]; }); });
    }
    g.font = 'bold 30px Arial, sans-serif'; g.fillText('INS COORDINATES FOR ACFT STANDS', 120, 300);
    g.font = '34px Arial, sans-serif';
    table(100, 330, [180, 360, 380], 72, [['STAND', 'LATITUDE', 'LONGITUDE']].concat(rows));
    g.font = '34px Arial, sans-serif';
    table(1300, 330, [140, 200, 400], 110, [['RWY', 'DIRECTION', 'THR'], [des, '088°', thr]]);
    table(1300, 700, [200, 160, 330, 240], 72, [['TAXIWAY', 'WIDTH', 'STRENGTH', 'SURFACE'], ['A', '23', '80 R/B/W/T', 'CONCRETE'], ['A1', '23', '80 R/B/W/T', 'CONCRETE'], ['A2', '23', '80 R/B/W/T', 'CONCRETE'], ['A3', '23', '80 R/B/W/T', 'CONCRETE']]);
    return c.toDataURL('image/jpeg', 0.95);
  }, { rows, thr: dms(ad.thr[1], true) + '\n' + dms(ad.thr[0], false), des: ad.des });
  const doc = new jsPDF({ unit: 'pt', format: [1200, 850], orientation: 'landscape' });
  doc.addImage(jpg, 'JPEG', 0, 20, 1200, 830);
  doc.setFontSize(9); doc.text('AIP DONLON', 20, 12); doc.text('AD 2 EADD - 21', 1100, 12);
  fs.writeFileSync(OUT + '/EADD_parking_chart_picture.pdf', Buffer.from(doc.output('arraybuffer')));
  fs.writeFileSync(OUT + '/EADD_parking_chart_picture_2.pdf', Buffer.from(doc.output('arraybuffer')));
  await drop([OUT + '/EADD_parking_chart_picture.pdf']);
  const before = await page.evaluate(() => { const d = AMDBDOC.list()[0]; return { image: d.image, ad: d.ad, note: d.note, btn: !!document.querySelector('[data-dococr]'), all: !!document.querySelector('[data-dococrall]') }; });
  if (!before.image || before.ad !== 'EADD' || !/picture/.test(before.note) || !before.btn || !before.all) fails.push('a chart that is a picture: ' + JSON.stringify(before));
  if (fetched.length) fails.push('the OCR engine was downloaded before it was asked for: ' + fetched.join(', '));

  /* --------------------------------------------------------- read by OCR */
  const t0 = Date.now();
  await page.click('[data-dococr]');
  await page.waitForFunction(() => { const d = AMDBDOC.list()[0]; return d.ocr || /could not|not the one expected/.test((document.querySelector('.up-st') || {}).textContent || ''); }, null, { timeout: 240000 });
  await page.waitForFunction(() => !document.querySelector('.up-st .spinner'), null, { timeout: 30000 });
  const secs = (Date.now() - t0) / 1000;
  fs.writeFileSync(OUT + '/ocr_text.txt', await page.evaluate(() => (AMDBDOC.list()[0].ocr || {}).text || ''));
  const got = await page.evaluate(() => { const d = AMDBDOC.list()[0]; return { ocr: d.ocr && { conf: d.ocr.conf, tables: d.ocr.tables, cells: d.ocr.cells }, kind: d.f.kind, stands: d.f.stands, thr: Object.keys(d.f.rwy).map((k) => [k, d.f.rwy[k].thr]), twy: d.f.twyRows.map((r) => r.des + ':' + r.w + ':' + r.pcr), st: document.querySelector('.up-st').textContent, gave: AMDBDOC.gave(d) }; });
  if (!got.ocr) fails.push('not read by OCR: ' + got.st);
  else {
    if (got.ocr.tables < 3) fails.push('tables found: ' + JSON.stringify(got.ocr));
    if (got.kind.id !== 'apdc' || !got.kind.icaoTitle) fails.push('chart type read from the picture: ' + JSON.stringify(got.kind));
    const m = (a, b) => Math.hypot((a[0] - b[0]) * Math.cos(b[1] * Math.PI / 180), a[1] - b[1]) * 111320;
    const ok = stands.filter((s) => got.stands.some((x) => x.id === s.id && m(x.c, s.c) < 1)).length;
    if (ok < 8 || got.stands.length !== 8) fails.push('stands read: ' + ok + ' of 8 at their position — ' + got.stands.map((x) => x.id).join(' '));
    const thr = got.thr.filter((x) => x[0] === ad.des && x[1])[0];
    if (!thr || m(thr[1], ad.thr) > 1) fails.push('threshold read from a two-line cell: ' + JSON.stringify(got.thr));
    if (got.twy.join(' ') !== 'A:23:80/R/B/W/T A1:23:80/R/B/W/T A2:23:80/R/B/W/T A3:23:80/R/B/W/T') fails.push('taxiway table: ' + got.twy.join(' '));
  }
  const engine = fetched.slice();
  if (engine.length !== 4 || !engine.some((x) => /eng\.traineddata\.gz$/.test(x))) fails.push('engine files downloaded: ' + engine.join(', '));
  await page.screenshot({ path: OUT + '/upload_after_ocr.png', fullPage: true });

  /* ------------------------------------------------ into the generated data */
  const gen = await page.evaluate(async () => {
    await LAZY.run('src-amdbpkg');
    const c = AMDBX.candidates(window.__AIXM.S.datasets).filter((x) => x.code === 'EADD'), r = AMDBX.readiness(c[0]), g = AMDBX.generate(c, {});
    return { std: r.st.std + '/' + r.src.std, stands: g.features.filter((f) => f.t === 'ParkingStandLocation' && /read by OCR/.test(f.a.source.v)).length, xml: AMDBPKG.writeAmxm(g.features, 'test') };
  });
  if (gen.std !== 'ok/C' || gen.stands !== 8) fails.push('generated from the chart read by OCR: ' + JSON.stringify({ std: gen.std, stands: gen.stands }));
  const v = await validateAmxm(gen.xml);
  if (!v.valid) fails.push('generated AMXM not valid: ' + v.errors.slice(0, 3).join(' | '));

  // the engine is kept in this browser (IndexedDB): after the page is opened again, a chart downloads nothing
  await page.reload(); await page.waitForSelector('#drop');
  await page.evaluate(() => window.__AIXM.go('digital')); await page.waitForSelector('[data-upin]', { state: 'attached' });
  await drop([OUT + '/EADD_parking_chart_picture_2.pdf']);
  await page.click('[data-dococr]');
  await page.waitForFunction(() => AMDBDOC.list().length === 1 && AMDBDOC.list()[0].ocr, null, { timeout: 240000 });
  if (fetched.length !== engine.length) fails.push('the engine was downloaded again: ' + fetched.slice(engine.length).join(', '));

  if (errors.length) fails.push('page errors: ' + errors.join(' | '));
  await browser.close();
  if (fails.length) { console.error('FAIL amdb_ocr:\n - ' + fails.join('\n - ')); process.exit(1); }
  console.log('PASS amdb_ocr: a chart that is a picture read by OCR in ' + secs.toFixed(0) + ' s (' + got.ocr.tables + ' tables, ' + got.ocr.cells + ' cells, confidence ' + got.ocr.conf + ' %): 8 stands within 1 m, the threshold, the taxiway table; engine downloaded once (4 files, checked) and kept; generated AMXM valid');
})().catch((e) => { console.error('FAIL amdb_ocr:', e); process.exit(1); });
