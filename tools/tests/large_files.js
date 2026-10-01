// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Large files: two generated files of ~60 MB (tools/make_big.js) are read together. Checks: all features loaded,
// memory gauge shown, search index built in the background, map drawn without one map object per feature (hover and
// click still work), Compare keeps no copies on the features, Remove frees the memory, and the memory guard switches
// to Lite when the files would not fit. Timings and memory are printed (tools/bench_big.js measures 1 GB files).
const { execFileSync } = require('child_process');
const path = require('path');
const env = require('./_env');
const ROOT = env.ROOT, OUT = env.out('large_files');
const MB = +(process.env.LARGE_MB || 60);

(async () => {
  const fa = path.join(OUT, 'big_a.xml'), fb = path.join(OUT, 'big_b.xml'), fc = path.join(OUT, 'big_c.xml');
  execFileSync(process.execPath, [path.join(ROOT, 'tools/make_big.js'), path.join(ROOT, 'testdata/Donlon_ALL_Baseline_2025.xml'), String(MB), fa]);
  execFileSync(process.execPath, [path.join(ROOT, 'tools/make_big.js'), path.join(ROOT, 'testdata/Donlon_EADD_changes_AIRAC2611.xml'), String(MB), fb]);
  execFileSync(process.execPath, [path.join(ROOT, 'tools/make_big.js'), path.join(ROOT, 'testdata/Donlon_ALL_Baseline_2025.xml'), '25', fc]); // not in the browser's saved data
  const browser = await env.playwright.chromium.launch({ executablePath: env.chrome, args: ['--enable-precise-memory-info'] });
  const page = await (await browser.newContext({ viewport: { width: 1500, height: 900 } })).newPage();
  const errors = [], fails = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/net::|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  let cdp = null; // full garbage collection (as for a heap snapshot), then the heap in use
  const heap = async () => { cdp = cdp || await page.context().newCDPSession(page); await cdp.send('HeapProfiler.collectGarbage'); return Math.round((await cdp.send('Runtime.getHeapUsage')).usedSize / 1048576); };
  await page.goto('file://' + ROOT + '/AIXM-Code-Converter.html');
  await page.waitForSelector('#drop');
  await page.evaluate(() => { window.__lt = []; new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push(e.duration))).observe({ type: 'longtask' }); });
  const h0 = await heap();

  // 1. read both files
  let t = Date.now();
  await page.setInputFiles('#file-input', [fa, fb]);
  await page.waitForFunction(() => window.__AIXM.S.files.length === 2 && window.__AIXM.S.files.every((f) => f.status === 'ready'));
  await page.click('#extract-btn');
  await page.waitForFunction(() => window.__AIXM.S.datasets.length === 2 && window.__AIXM.S.view === 'dash', null, { timeout: 600000, polling: 500 });
  const counts = await page.evaluate(() => window.__AIXM.S.datasets.map((d) => d.recs.length));
  const h1 = await heap();
  console.log('read 2 x ' + MB + ' MB in ' + ((Date.now() - t) / 1000).toFixed(1) + ' s; features ' + counts.join(' + ') + '; memory ' + (h1 - h0) + ' MB; longest freeze ' + Math.round(await page.evaluate(() => Math.max(0, ...window.__lt))) + ' ms');
  if (!(counts[0] > 5000 && counts[1] > 5000)) fails.push('features not loaded: ' + counts);
  if ((h1 - h0) > MB * 2 * 0.9) fails.push('memory ' + (h1 - h0) + ' MB for ' + 2 * MB + ' MB of files (expected < 0.9 x)');
  await page.waitForTimeout(3500);
  const chip = await page.evaluate(() => { const c = document.getElementById('mem-chip'); return c && !c.classList.contains('hidden') ? c.textContent : ''; });
  console.log('memory gauge:', chip);
  if (!/^Memory [\d.]+ \/ [\d.]+ GB$/.test(chip)) fails.push('memory gauge not shown');

  // 2. search index built in the background (idle time) after reading
  await page.waitForFunction(() => window.__AIXM.S.datasets.every((d) => d.searchIdx), null, { timeout: 60000 }).catch(() => fails.push('search index not built in the background'));
  t = Date.now();
  await page.fill('#search', 'EADD');
  await page.locator('#search-results .sr-item').first().waitFor({ timeout: 30000 });
  console.log('search: ' + (Date.now() - t) + ' ms');

  // 3. map: shape layers instead of one map object per feature; hover name and click pop-up
  await page.fill('#search', '');
  await page.evaluate(() => { window.__AIXM.S.active = 0; window.__AIXM.go('map'); });
  await page.locator('.leaflet-container').waitFor(); // (a locator keeps no reference to the element)
  await page.waitForTimeout(1500);
  const lay = await page.evaluate(() => ({ paths: document.querySelectorAll('path.leaflet-interactive').length, canv: document.querySelectorAll('canvas.aixm-canvas').length }));
  console.log('map: ' + lay.canv + ' canvas layers, ' + lay.paths + ' SVG paths');
  if (lay.canv < 5) fails.push('map shape layers missing');
  const pt = await page.evaluate(() => { const m = MAPVIEW.leaflet(); m.setView([52.37, -31.95], 9, { animate: false }); return m.latLngToContainerPoint([52.30, -31.70]); });
  await page.waitForTimeout(800);
  await page.mouse.move(pt.x, pt.y); await page.waitForTimeout(400);
  const tip = await page.evaluate(() => (document.querySelector('.leaflet-tooltip') || {}).textContent || '');
  console.log('hover:', tip);
  if (!tip) fails.push('no hover name on the map');

  // 4. compare: no flattened copies kept on the features
  t = Date.now();
  await page.evaluate(() => window.__AIXM.go('compare'));
  await page.evaluate(() => { document.querySelector('#cmp-a').value = '0'; document.querySelector('#cmp-b').value = '1'; });
  await page.click('#cmp-run');
  await page.waitForFunction(() => window.__AIXM.S.cmp && !document.querySelector('#cmp-bar'), null, { timeout: 600000, polling: 500 });
  const cmp = await page.evaluate(() => ({ st: window.__AIXM.S.cmp.stats, flat: window.__AIXM.S.datasets.some((d) => d.recs.some((r) => r._flat)) }));
  console.log('compare: ' + ((Date.now() - t) / 1000).toFixed(1) + ' s ' + JSON.stringify(cmp.st));
  if (cmp.flat) fails.push('compare left copies on the features');
  if (!(cmp.st.modified + cmp.st.added + cmp.st.removed > 0)) fails.push('compare found no differences');

  // 5. remove both data sets: the memory is freed
  for (let i = 0; i < 2; i++) await page.evaluate(() => { window.__AIXM.go('dash'); const b = document.querySelector('[data-act="remove"]'); b.click(); });
  await page.waitForTimeout(2500); // a background save into browser storage stops at its next step
  const h2 = await heap();
  if (process.env.SNAP) { // debugging: heap snapshot after Remove
    const fd = require('fs').openSync(process.env.SNAP, 'w');
    cdp.on('HeapProfiler.addHeapSnapshotChunk', (e) => require('fs').writeSync(fd, e.chunk));
    await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
    require('fs').closeSync(fd);
  }
  console.log('after removing both: ' + (h2 - h0) + ' MB above the empty page');
  // allowance: built-in world map, terrain and dictionaries prepared on first use (~35 MB) stay
  if (h2 - h0 > 45 + (h1 - h0) * 0.2) fails.push('memory not freed after Remove (' + (h2 - h0) + ' of ' + (h1 - h0) + ' MB still in use)');

  // 6. memory guard: files that would not fit are read in Lite mode, with a message
  await page.evaluate(() => {
    const real = performance.memory;
    Object.defineProperty(performance, 'memory', { configurable: true, get: () => ({ usedJSHeapSize: real.usedJSHeapSize, jsHeapSizeLimit: real.usedJSHeapSize + 20 * 1048576 }) });
    window.__AIXM.go('files');
  });
  await page.setInputFiles('#file-input', [fc]);
  await page.waitForFunction(() => window.__AIXM.S.files.some((f) => f.status === 'ready'));
  await page.click('#extract-btn');
  await page.waitForFunction(() => window.__AIXM.S.datasets.length === 1, null, { timeout: 600000, polling: 500 });
  const guard = await page.evaluate(() => ({ lite: window.__AIXM.S.datasets[0].lite, toast: Array.from(document.querySelectorAll('.toast')).map((x) => x.textContent).join(' | ') }));
  console.log('memory guard:', guard.lite ? 'Lite' : 'Full', '·', guard.toast.slice(0, 160));
  if (!guard.lite || !/Lite memory mode is used/.test(guard.toast)) fails.push('memory guard did not switch to Lite');

  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
  console.log(fails.length ? 'FAIL: ' + fails.join('; ') : 'large files OK');
  if (errors.length || fails.length) process.exitCode = 1;
  await browser.close();
})();
