// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Robustness with several files and data sets:
// - reader threads: at most 2 on a phone, fewer on a device with little memory (each thread needs about 150 MB while it
//   reads; too many at once made the browser close the page when several files were read);
// - the page closed by the browser while reading (out of memory; here the page process is crashed on purpose): the
//   next start says what was being read and reads the next files the safe way (one thread, Lite memory mode); a page
//   closed normally, or another window of the tool that is still reading, does not count;
// - an error anywhere is shown in a bar with its details (copy, send to the creator); a page that fails says so and the
//   others keep working; a feature the map cannot draw is left out and reported, the rest of the map is drawn;
// - saved copies: an aerodrome mapping data set opened again gives the same features (no aerodrome made up), and a
//   copy saved by an older parser is read again from the file.
const fs = require('fs');
const env = require('./_env');
const ROOT = env.ROOT, OUT = env.out('robustness');
const URL = 'file://' + ROOT + '/AIXM-Code-Converter.html';
const DONLON = ROOT + '/testdata/Donlon_ALL_Baseline_2025.xml', AMXM = ROOT + '/testdata/amxm_test_EAXM.xml';

(async () => {
  const browser = await env.playwright.chromium.launch({ executablePath: env.chrome });
  const fails = [], errors = [];
  const expected = /robustness test|view test|bad feature/; // errors this test makes on purpose
  function watch(page) {
    page.on('pageerror', (e) => { if (!expected.test(e.message)) errors.push(e.message); });
    page.on('dialog', (d) => d.accept().catch(() => {})); // "leave the page?" when data sets are open
  }
  const step = (t) => { if (process.env.VERBOSE) console.log(new Date().toISOString().slice(11, 19), t); };
  async function open(ctx) { const page = await ctx.newPage(); watch(page); await page.goto(URL); await page.waitForSelector('#drop'); return page; }
  async function add(page, files) {
    await page.setInputFiles('#file-input', files);
    await page.waitForFunction((n) => !window.__AIXM.S.adding && window.__AIXM.S.files.length >= n && window.__AIXM.S.files.every((f) => f.status !== 'checking'), files.length, { timeout: 30000 });
  }
  async function extract(page) {
    await page.evaluate(() => document.querySelector('#extract-btn').click());
    await page.waitForFunction(() => window.__AIXM.S.view === 'dash' && window.__AIXM.S.files.every((f) => f.status !== 'parsing' && f.status !== 'indexing'), null, { timeout: 120000 });
  }
  const threadsShown = (page) => page.evaluate(() => (/parallel threads: (\d+)/.exec(document.querySelector('#extract-bar').textContent) || [])[1]);

  step('threads');
  // reader threads by device
  const ctxs = {
    desktop: { viewport: { width: 1400, height: 900 }, cpus: 8 },
    lowMemory: { viewport: { width: 1400, height: 900 }, cpus: 8, gb: 4 },
    phone: Object.assign({}, env.playwright.devices['Pixel 7'], { cpus: 8 })
  };
  const want = { desktop: '7', lowMemory: '2', phone: '2' };
  for (const k of Object.keys(ctxs)) {
    const o = Object.assign({}, ctxs[k]), cpus = o.cpus, gb = o.gb;
    delete o.cpus; delete o.gb; delete o.defaultBrowserType;
    const ctx = await browser.newContext(o);
    await ctx.addInitScript((c) => {
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => c.cpus });
      if (c.gb) Object.defineProperty(navigator, 'deviceMemory', { get: () => c.gb });
    }, { cpus, gb });
    const page = await open(ctx);
    await add(page, [DONLON]);
    const n = await threadsShown(page);
    if (n !== want[k]) fails.push('reader threads on ' + k + ': ' + n + ' (expected ' + want[k] + ')');
    await ctx.close();
  }

  step('closed while reading');
  // the page closed by the browser while reading
  const big = OUT + '/Donlon_padded.xml';
  if (!fs.existsSync(big) || fs.statSync(big).size < 150e6) {
    const xml = fs.readFileSync(DONLON, 'utf8'), end = xml.lastIndexOf('</');
    const fd = fs.openSync(big, 'w');
    fs.writeSync(fd, xml.slice(0, end));
    const pad = '<!-- ' + 'padding '.repeat(1 << 17) + '-->\n'; // 1 MB
    for (let i = 0; i < 160; i++) fs.writeSync(fd, pad);
    fs.writeSync(fd, xml.slice(end));
    fs.closeSync(fd);
  }
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  let page = await open(ctx);
  await add(page, [big]);
  await page.evaluate(() => document.querySelector('#extract-btn').click());
  await page.waitForFunction(() => !!localStorage.getItem('aixm-busy'), null, { timeout: 10000 }).catch(() => fails.push('no reading mark'));
  // the page process ends, like a page the browser closes for lack of memory (no answer comes: not awaited)
  const crashed = new Promise((r) => page.once('crash', r));
  (await ctx.newCDPSession(page)).send('Page.crash').catch(() => {});
  await Promise.race([crashed, new Promise((r) => setTimeout(r, 10000))]);
  step('crashed');
  page = await open(ctx);
  // reopened at once (as after "Reload" on the closed page): the mark is not renewed, so the notice follows in seconds
  await page.waitForSelector('.crash-note', { timeout: 12000 }).catch(() => fails.push('no notice after the page was closed while reading'));
  const note = await page.evaluate(() => { const n = document.querySelector('.crash-note'); return n ? n.textContent : ''; });
  if (note.indexOf('Donlon_padded.xml') < 0 || !/safe way/.test(note)) fails.push('notice text: ' + note.slice(0, 300));
  await page.screenshot({ path: OUT + '/closed_while_reading.png' });
  await page.click('.crash-note [data-cn="close"]');
  if (await page.evaluate(() => !!localStorage.getItem('aixm-busy'))) fails.push('mark kept after the notice');
  await add(page, [DONLON]);
  if (await threadsShown(page) !== '1') fails.push('safe mode: threads ' + await threadsShown(page));
  await extract(page);
  const safe = await page.evaluate(() => window.__AIXM.S.datasets.map((d) => ({ lite: !!d.lite, n: d.recs.length })));
  if (safe.length !== 1 || !safe[0].lite || safe[0].n < 1000) fails.push('safe mode reading: ' + JSON.stringify(safe));
  step('normal close');
  // a page closed normally while reading, and another window still reading: no notice
  await page.evaluate(() => { window.onbeforeunload = null; });
  await page.close({ runBeforeUnload: false });
  page = await open(ctx);
  await add(page, [big]);
  await page.evaluate(() => document.querySelector('#extract-btn').click());
  await page.waitForFunction(() => !!localStorage.getItem('aixm-busy'), null, { timeout: 10000 }).catch(() => {});
  await page.reload(); await page.waitForSelector('#drop'); await page.waitForTimeout(6000);
  if (await page.$('.crash-note')) fails.push('notice after a normal reload');
  // another window that is reading renews its mark: no notice
  await page.evaluate(() => { window.__beat = setInterval(() => localStorage.setItem('aixm-busy', JSON.stringify({ t: Date.now(), v: 'x', files: [{ n: 'other.xml', s: 1 }] })), 1000); });
  await page.waitForTimeout(300);
  const other = await open(ctx);
  await other.waitForTimeout(6500);
  if (await other.$('.crash-note')) fails.push('notice while another window is reading');
  await other.close({ runBeforeUnload: false }); await page.evaluate(() => { clearInterval(window.__beat); localStorage.removeItem('aixm-busy'); });

  step('errors');
  // errors are shown with their details; a failing page says so; the map leaves out what it cannot draw
  await add(page, [DONLON]); await extract(page);
  await page.evaluate(() => { setTimeout(() => { throw new Error('robustness test error'); }, 0); Promise.reject(new Error('robustness test rejection')); });
  await page.waitForSelector('.err-bar', { timeout: 3000 }).catch(() => fails.push('no error bar'));
  const bar = await page.evaluate(() => (document.querySelector('.err-bar') || {}).textContent || '');
  if (!/2 problems/.test(bar) || !/robustness test/.test(bar)) fails.push('error bar: ' + bar);
  await page.click('.err-bar [data-err="send"]');
  const report = await page.evaluate(() => (document.querySelector('#fb-desc') || {}).value || '');
  if (!/robustness test error/.test(report) || !/robustness test rejection/.test(report) || !/Data sets \(1\)/.test(report) || !/reader threads/.test(report)) fails.push('problem report: ' + report.slice(0, 400));
  await page.click('[data-fb="close"]');
  await page.click('.err-bar [data-err="close"]');
  await page.evaluate(() => { ANALYSIS.inFileChanges = function () { throw new Error('view test'); }; window.__AIXM.go('changes'); });
  const failCard = await page.evaluate(() => (document.querySelector('.view-fail') || {}).textContent || '');
  if (!/could not be shown/.test(failCard) || !/view test/.test(failCard)) fails.push('failing page: ' + failCard);
  await page.evaluate(() => window.__AIXM.go('dash'));
  if (!(await page.$('.ds-card, .card'))) fails.push('dashboard after a failing page');
  await page.evaluate(() => {
    const a = window.__AIXM.S.datasets[0].byType.Airspace[0];
    Object.defineProperty(a.cur.p, 'type', { get() { throw new Error('bad feature'); } });
    window.__AIXM.go('map');
  });
  await page.waitForTimeout(1500);
  const map = await page.evaluate(() => ({ bar: (document.querySelector('.err-bar') || {}).textContent || '', map: !!document.querySelector('.leaflet-container') }));
  if (!map.map || !/Map: Airspace .* not drawn/.test(map.bar)) fails.push('map with a feature it cannot draw: ' + JSON.stringify(map));
  await page.screenshot({ path: OUT + '/error_bar.png' });
  await ctx.close();

  step('saved copies');
  // saved copies
  const ctx2 = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  page = await open(ctx2);
  await add(page, [AMXM]); await extract(page);
  const first = await page.evaluate(() => window.__AIXM.S.datasets[0].recs.length);
  // saved to browser storage (polled: an async condition would count as met at once)
  let saved = false;
  for (let i = 0; i < 100 && !saved; i++) { saved = await page.evaluate(async () => (await LIBRARY.cachedKeys()).size === 1); if (!saved) await page.waitForTimeout(100); }
  if (!saved) fails.push('not saved');
  await page.close({ runBeforeUnload: false });
  page = await open(ctx2);
  await add(page, [AMXM]); await extract(page);
  const again = await page.evaluate(() => ({ n: window.__AIXM.S.datasets[0].recs.length, saved: /saved data/.test(window.__AIXM.S.files[0].detail || ''), unknown: window.__AIXM.S.datasets[0].recs.some((r) => /unknown/.test(r.id || '')) }));
  if (!again.saved || again.n !== first || again.unknown) fails.push('aerodrome mapping opened again: ' + JSON.stringify(again) + ' first ' + first);
  // a copy saved by an older parser (no parser version) is read again from the file
  await page.evaluate(async () => {
    const db = await new Promise((res) => { const rq = indexedDB.open('aixm-code-converter', 2); rq.onsuccess = () => res(rq.result); });
    await new Promise((res) => { const tx = db.transaction('meta', 'readwrite'), st = tx.objectStore('meta'); st.getAllKeys().onsuccess = (e) => { e.target.result.forEach((k) => { st.get(k).onsuccess = (g) => { const m = g.target.result; delete m.pv; st.put(m, k); }; }); }; tx.oncomplete = res; });
  });
  await page.close({ runBeforeUnload: false });
  page = await open(ctx2);
  await add(page, [AMXM]); await extract(page);
  const old = await page.evaluate(() => ({ n: window.__AIXM.S.datasets[0].recs.length, saved: /saved data/.test(window.__AIXM.S.files[0].detail || '') }));
  if (old.saved || old.n !== first) fails.push('copy saved by an older parser: ' + JSON.stringify(old));
  await ctx2.close();

  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
  console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : 'several files: threads, page closed while reading, errors, saved copies OK');
  if (errors.length || fails.length) process.exitCode = 1;
  await browser.close();
})();
