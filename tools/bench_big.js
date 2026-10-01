// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Large-file benchmark: loads one or more big AIXM files in Chrome with its normal memory limit (no extra heap) and
// measures, for every step, the time, the JavaScript memory in use and the longest freeze of the page (long task).
// Make test files with tools/make_big.js.  Usage: node tools/bench_big.js <file1.xml> [file2.xml ...]
// Env: STEPS=load,aip,search,map,changes,quality,explorer,compare (default all) · JSON=<file> to save the results.
'use strict';
const path = require('path');
const fs = require('fs');
const env = require('./tests/_env');
const files = process.argv.slice(2);
if (!files.length) { console.error('usage: node tools/bench_big.js <file.xml> [...]'); process.exit(1); }
const STEPS = (process.env.STEPS || 'load,aip,search,map,changes,quality,explorer,compare').split(',');

(async () => {
  const browser = await env.playwright.chromium.launch({ executablePath: env.chrome, args: ['--enable-precise-memory-info'] });
  const page = await (await browser.newContext({ viewport: { width: 1500, height: 920 } })).newPage();
  let crashed = false;
  const errors = [], rows = [];
  page.on('crash', () => { crashed = true; });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.join(env.ROOT, 'AIXM-Code-Converter.html'));
  await page.waitForSelector('#drop');
  await page.evaluate(() => {
    window.__lt = [];
    new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push(e.duration))).observe({ type: 'longtask', buffered: false });
  });
  const mem = () => page.evaluate(() => Math.round(performance.memory.usedJSHeapSize / 1048576));
  async function step(name, fn) {
    if (crashed) { rows.push({ step: name, result: 'not run (page crashed)' }); return; }
    await page.evaluate(() => { window.__lt = []; });
    const t = Date.now();
    let result = 'ok';
    try { await fn(); } catch (e) { result = crashed ? 'CRASH (out of memory)' : 'ERROR ' + String(e.message).split('\n')[0].slice(0, 90); }
    const ms = Date.now() - t;
    let heap = null, longest = null;
    if (!crashed) { await page.waitForTimeout(300); heap = await mem(); longest = await page.evaluate(() => Math.round(Math.max(0, ...window.__lt))); }
    rows.push({ step: name, seconds: +(ms / 1000).toFixed(1), heapMB: heap, longestFreezeMs: longest, result: crashed ? 'CRASH (out of memory)' : result });
    console.log(name.padEnd(34), (ms / 1000).toFixed(1).padStart(7) + ' s', String(heap === null ? '-' : heap + ' MB').padStart(9), ('freeze ' + (longest === null ? '-' : longest + ' ms')).padStart(16), ' ', rows[rows.length - 1].result);
  }
  const T = 1800000;

  if (STEPS.includes('load')) {
    for (const f of files) {
      await step('load ' + path.basename(f) + ' (' + Math.round(fs.statSync(f).size / 1048576) + ' MB)', async () => {
        await page.evaluate(() => window.__AIXM.go('files'));
        const n = await page.evaluate(() => window.__AIXM.S.datasets.length);
        await page.setInputFiles('#file-input', [f]);
        await page.waitForFunction(() => window.__AIXM.S.files.every((x) => x.status === 'ready' || x.status === 'done'), null, { timeout: T });
        await page.click('#extract-btn');
        await page.waitForFunction((k) => window.__AIXM.S.datasets.length > k && window.__AIXM.S.view === 'dash', n, { timeout: T, polling: 1000 });
      });
    }
  }
  const nds = crashed ? 0 : await page.evaluate(() => window.__AIXM.S.datasets.length);
  if (nds) console.log('features:', await page.evaluate(() => window.__AIXM.S.datasets.map((d) => d.recs.length).join(' + ')));

  if (nds && STEPS.includes('aip')) {
    await step('AIP first page', async () => { await page.evaluate(() => window.__AIXM.go('aip')); await page.waitForSelector('.sec-body', { timeout: T }); });
    for (const want of ['ENR 2.1', 'ENR 4.4', 'ENR 5.4', 'AD 2.10', 'AD 2.12']) {
      await step('AIP ' + want, async () => {
        const ok = await page.evaluate((w) => {
          const ds = window.__AIXM.S.datasets[window.__AIXM.S.active || 0];
          let id = null;
          AIP.catalogue(ds).forEach((g) => g.children.forEach((c) => {
            if (id) return;
            if (c.children) { const cc = c.children.find((x) => (x.title || x.label || '').indexOf(w) === 0 || String(x.id).indexOf(w.replace(' ', '')) === 0); if (cc) id = cc.id; }
            else if (String(c.id).indexOf(w) === 0 || (c.title || '').indexOf(w) === 0) id = c.id;
          }));
          if (!id) return false;
          window.__AIXM.S.aipSel = id; window.__AIXM.go('aip'); return true;
        }, want);
        if (!ok) throw new Error('section not found');
        await page.waitForSelector('.sec-body', { timeout: T });
      });
    }
  }
  if (nds && STEPS.includes('search')) {
    for (const [lbl, q] of [['search (first: builds index)', 'EADD'], ['search again', 'DONLON'], ['search no match', 'zzqq']]) {
      await step(lbl, async () => {
        await page.fill('#search', '');
        await page.fill('#search', q);
        await page.waitForFunction(() => !document.querySelector('#search-results').classList.contains('hidden') || true, null, { timeout: T });
        await page.waitForTimeout(400);
      });
    }
    await page.fill('#search', '');
  }
  if (nds && STEPS.includes('map')) {
    await step('map open (all layers)', async () => { await page.evaluate(() => window.__AIXM.go('map')); await page.waitForSelector('.leaflet-container', { timeout: T }); await page.waitForTimeout(1500); });
    await step('map zoom in + pan', async () => {
      await page.evaluate(() => { const m = MAPVIEW.leaflet(); m.setZoom(m.getZoom() + 3, { animate: false }); m.panBy([300, 200], { animate: false }); });
      await page.waitForTimeout(1500);
    });
    await step('map airport view', async () => {
      await page.evaluate(() => { const ds = window.__AIXM.S.datasets[0]; MAPVIEW.airportView(ds, (ds.byType.AirportHeliport || [])[0]); });
      await page.waitForTimeout(1500);
    });
  }
  if (nds && STEPS.includes('changes')) await step('changes view', async () => { await page.evaluate(() => window.__AIXM.go('changes')); await page.waitForTimeout(1000); });
  if (nds && STEPS.includes('quality')) {
    await step('quality: run checks', async () => {
      await page.evaluate(() => window.__AIXM.go('quality'));
      await page.click('#q-run');
      await page.waitForFunction(() => /errors|warnings|No issues|no issues/.test((document.querySelector('#q-out') || {}).textContent || ''), null, { timeout: T, polling: 500 });
    });
  }
  if (nds && STEPS.includes('explorer')) await step('explorer view', async () => { await page.evaluate(() => window.__AIXM.go('explorer')); await page.waitForTimeout(1000); });
  if (nds > 1 && STEPS.includes('compare')) {
    await step('compare file 1 vs 2', async () => {
      await page.evaluate(() => window.__AIXM.go('compare'));
      await page.evaluate(() => { document.querySelector('#cmp-a').value = '0'; document.querySelector('#cmp-b').value = '1'; });
      await page.click('#cmp-run');
      await page.waitForFunction(() => !document.querySelector('#cmp-bar') && (document.querySelector('#cmp-out') || {}).textContent.length > 50, null, { timeout: T, polling: 1000 });
    });
  }
  console.log(errors.length ? 'PAGE ERRORS:\n' + errors.slice(0, 5).join('\n') : 'no page errors');
  if (process.env.JSON) fs.writeFileSync(process.env.JSON, JSON.stringify({ files: files.map((f) => path.basename(f)), rows, errors }, null, 1));
  await browser.close().catch(() => {});
  if (crashed) process.exitCode = 2;
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
