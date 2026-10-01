// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Large-file test: extract a (multi-)GB AIXM file in headless Chromium and report timings / memory.
// Usage: node tools/e2e_big.js <file.xml> [outdir]
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');
const ROOT = path.join(__dirname, '..');
const FILE = process.argv[2];
const OUT = process.argv[3] || path.join(ROOT, 'tools', 'shots');
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const browser = await chromium.launch({ executablePath: require('./tests/_env').chrome, args: ['--enable-precise-memory-info', '--js-flags=--max-old-space-size=6144'] });
  const page = await (await browser.newContext({ viewport: { width: 1500, height: 920 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('file://' + path.join(ROOT, 'AIXM-Code-Converter.html'));
  if (process.env.MEM) { await page.evaluate((m) => localStorage.setItem('aixm-mem', m), process.env.MEM); await page.reload(); }
  await page.setInputFiles('#file-input', [FILE]);
  await page.waitForFunction(() => window.__AIXM.S.files.length && window.__AIXM.S.files.every((f) => f.status === 'ready'));
  const t0 = Date.now();
  await page.click('#extract-btn');
  let first = null;
  const poll = setInterval(async () => {
    try {
      const d = await page.evaluate(() => { const f = window.__AIXM.S.files[0]; return f.status + ' ' + (f.detail || ''); });
      if (!first && /features/.test(d)) first = Date.now() - t0;
      process.stdout.write('\r' + ((Date.now() - t0) / 1000).toFixed(1) + 's  ' + d.replace(/<[^>]+>/g, '').slice(0, 150) + '        ');
    } catch (e) { /* page busy */ }
  }, 1000);
  await page.waitForFunction(() => window.__AIXM.S.view === 'dash', null, { timeout: 1800000, polling: 1000 });
  clearInterval(poll);
  const total = Date.now() - t0;
  const info = await page.evaluate(() => { const d = window.__AIXM.S.datasets[0]; return { recs: d.recs.length, tRead: Math.round(d.tRead), tTotal: Math.round(d.tTotal), fin: d.tFinalize, heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null, state: d.state, ver: d.sniff.versionLabel }; });
  console.log('\nTOTAL', total, 'ms; first results at', first, 'ms;', JSON.stringify(info));
  await page.screenshot({ path: path.join(OUT, 'big-dashboard.png') });
  let t = Date.now();
  await page.click('button[data-view="aip"]');
  await page.waitForSelector('.sec-body', { timeout: 300000 });
  console.log('AIP first page', Date.now() - t, 'ms');
  t = Date.now();
  await page.evaluate(() => { window.__AIXM.S.aipSel = 'ENR 4.4'; window.__AIXM.go('aip'); });
  await page.waitForSelector('table.aip', { timeout: 300000 });
  console.log('ENR 4.4 page', Date.now() - t, 'ms');
  t = Date.now();
  await page.click('button[data-view="map"]');
  await page.waitForSelector('#map.leaflet-container', { timeout: 300000 });
  await page.waitForTimeout(1000);
  console.log('Map', Date.now() - t, 'ms');
  await page.screenshot({ path: path.join(OUT, 'big-map.png') });
  t = Date.now();
  await page.fill('#search', 'EADD');
  await page.waitForSelector('#search-results .sr-item', { timeout: 300000 });
  console.log('Search', Date.now() - t, 'ms');
  // open XML of a feature near the end of the file
  t = Date.now();
  await page.evaluate(() => { const d = window.__AIXM.S.datasets[0]; window.__AIXM.openXml(d, d.recs[d.recs.length - 5]); });
  await page.waitForSelector('#drawer.open pre.xml', { timeout: 60000 });
  console.log('XML at end of file', Date.now() - t, 'ms');
  const heap = await page.evaluate(() => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null);
  console.log('heap after views MB', heap);
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
})().catch((e) => { console.error('\nFAILED', e); process.exit(1); });
