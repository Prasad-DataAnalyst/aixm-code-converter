// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// AIP sections list: GEN / ENR / AD rows fold and unfold; an aerodrome's arrow folds and unfolds it (also the one shown,
// which once stayed open) without changing the page; its name opens the aerodrome, a second click folds it; a section
// opens its page; the filter text survives folding; on a phone the same works inside the ☰ list.
const env = require('./_env');
const ROOT = env.ROOT;

(async () => {
  const browser = await env.playwright.chromium.launch({ executablePath: env.chrome });
  const errors = [], fails = [];
  async function open(opts) {
    const page = await (await browser.newContext(opts)).newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('file://' + ROOT + '/AIXM-Code-Converter.html'); await page.waitForSelector('#drop');
    await page.setInputFiles('#file-input', [ROOT + '/testdata/Donlon_ALL_Baseline_2025.xml']);
    await page.waitForFunction(() => window.__AIXM.S.files.every((f) => f.status === 'ready'));
    await page.evaluate(() => document.querySelector('#extract-btn').click());
    await page.waitForFunction(() => window.__AIXM.S.view === 'dash', null, { timeout: 60000 });
    await page.evaluate(() => window.__AIXM.go('aip')); await page.waitForTimeout(300);
    return page;
  }
  const isOpen = (page, id) => page.evaluate((i) => { const n = document.querySelector('#aip-side .node[data-toggle="' + i + '"]'); return n ? n.classList.contains('open') : null; }, id);
  const shown = (page) => page.evaluate(() => window.__AIXM.S.aipSel);
  const kids = (page, id) => page.evaluate((i) => { const n = document.querySelector('#aip-side .node[data-toggle="' + i + '"]'); const ul = n && n.parentNode.querySelector(':scope > ul'); return ul ? ul.children.length : 0; }, id);
  // a click that cannot be made (for example the list closed by mistake) is a failure, not a test crash
  const tap = (page, sel) => page.click(sel, { timeout: 5000 }).catch(() => fails.push('cannot click ' + sel + ' (list closed or entry hidden)'));
  const caret = (page, id) => tap(page, '#aip-side .node[data-toggle="' + id + '"] .caret');
  const name = (page, id) => tap(page, '#aip-side .node[data-toggle="' + id + '"] .title');

  const page = await open({ viewport: { width: 1366, height: 800 } });
  const bad = (m) => fails.push('computer: ' + m);
  // GEN / ENR / AD
  for (const g of ['GEN', 'ENR', 'AD']) {
    await name(page, g);
    if (await isOpen(page, g) !== false || await kids(page, g)) bad(g + ' does not fold');
    await name(page, g);
    if (await isOpen(page, g) !== true || !(await kids(page, g))) bad(g + ' does not unfold');
  }
  // the aerodrome shown (open): its arrow folds and unfolds it
  const ads = await page.evaluate(() => [...document.querySelectorAll('#aip-side .node[data-toggle][data-sec]')].map((n) => n.getAttribute('data-toggle')));
  if (ads.length < 2) bad('expected aerodromes in the list');
  const a = await page.evaluate(() => { const n = document.querySelector('#aip-side .node.open[data-toggle][data-sec]'); return n && n.getAttribute('data-toggle'); }) || ads[0];
  await page.evaluate((i) => { window.__AIXM.S.aipSel = i; }, a);
  if (!(await isOpen(page, a))) { await caret(page, a); }
  const page0 = await shown(page);
  await caret(page, a);
  if (await isOpen(page, a) !== false || await kids(page, a)) bad('arrow does not fold the open aerodrome ' + a);
  await caret(page, a);
  if (await isOpen(page, a) !== true || !(await kids(page, a))) bad('arrow does not unfold ' + a);
  // a name click on the shown aerodrome folds it, a second unfolds it
  await name(page, a);
  if (await isOpen(page, a) !== false) bad('second click on the shown aerodrome should fold it');
  await name(page, a);
  if (await isOpen(page, a) !== true) bad('click on the folded aerodrome should unfold it');
  if (await shown(page) !== page0) bad('folding changed the page shown');
  // another aerodrome: its arrow unfolds and folds without changing the page; its name opens it unfolded
  const b = ads.find((x) => x !== a);
  await caret(page, b);
  if (await isOpen(page, b) !== true) bad('arrow does not unfold ' + b);
  if (await shown(page) !== page0) bad('the arrow changed the page shown');
  await caret(page, b);
  if (await isOpen(page, b) !== false) bad('arrow does not fold ' + b);
  await name(page, b);
  if (await shown(page) !== b || await isOpen(page, b) !== true) bad('name click should open ' + b + ' unfolded');
  // a section opens its page
  const leaf = await page.evaluate((i) => { const n = document.querySelector('#aip-side .node[data-toggle="' + i + '"]').parentNode.querySelector(':scope > ul .node[data-sec]'); return n.getAttribute('data-sec'); }, b);
  await tap(page, '#aip-side .node[data-sec="' + leaf + '"]');
  if (await shown(page) !== leaf) bad('section click does not open ' + leaf);
  // filter text survives folding
  await page.fill('#tree-filter', 'radio');
  await name(page, 'GEN'); await name(page, 'GEN');
  const f = await page.evaluate(() => ({ v: document.querySelector('#tree-filter').value, vis: [...document.querySelectorAll('#aip-side li[data-f]')].filter((li) => li.style.display !== 'none').length }));
  if (f.v !== 'radio' || f.vis < 1 || f.vis > 6) bad('filter lost after folding: ' + JSON.stringify(f));

  // phone: inside the ☰ list
  const ph = await open(env.playwright.devices['Pixel 7']);
  const pbad = (m) => fails.push('phone: ' + m);
  await ph.click('.m-side-btn');
  const side = () => ph.evaluate(() => document.querySelector('.split').classList.contains('side-open'));
  const pa = await ph.evaluate(() => document.querySelector('#aip-side .node[data-toggle][data-sec]').getAttribute('data-toggle'));
  const o0 = await isOpen(ph, pa);
  await caret(ph, pa);
  if (await isOpen(ph, pa) === o0) pbad('arrow does not fold/unfold ' + pa);
  await caret(ph, pa);
  if (await isOpen(ph, pa) !== o0) pbad('second arrow tap does not undo');
  if (!(await side())) pbad('the ☰ list closed on an arrow tap');
  if (!(await isOpen(ph, pa))) await caret(ph, pa);
  const pleaf = await ph.evaluate((i) => document.querySelector('#aip-side .node[data-toggle="' + i + '"]').parentNode.querySelector(':scope > ul .node[data-sec]').getAttribute('data-sec'), pa);
  await tap(ph, '#aip-side .node[data-sec="' + pleaf + '"]'); await ph.waitForTimeout(200);
  if (await side()) pbad('the ☰ list should close after picking a section');
  if (await shown(ph) !== pleaf) pbad('section not opened');

  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
  console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : 'AIP sections list folds and unfolds OK');
  if (errors.length || fails.length) process.exitCode = 1;
  await browser.close();
})();
