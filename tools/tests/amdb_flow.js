// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Aerodrome mapping, step by step:
// - with nothing loaded the section asks what to do (view, create, all tools) and still takes files;
// - an AMXM file dropped there opens the path "View AMDB data": Load done, then Look, Check, Fit for use, Compare
//   (optional), Export — Next / Back go through them, each step done once seen; the sources of creating are folded;
// - "Create AMDB data": Sources (the AIP data set), Fill the gaps (optional), Generate, Look, Check, Fit for use,
//   Package — a step waiting for an earlier one says which; generating marks Generate done and opens Look;
// - the path chosen is kept after a reload; "All tools" shows every tool as a tab; on a phone nothing overflows.
const env = require('./_env');
const ROOT = env.ROOT, OUT = env.out('amdb_flow'), T = ROOT + '/testdata/';
const URL = 'file://' + ROOT + '/AIXM-Code-Converter.html';

(async () => {
  const browser = await env.playwright.chromium.launch({ executablePath: env.chrome });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.route(/^https?:\/\//, (r) => r.abort());
  const page = await ctx.newPage();
  const errors = [], fails = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const flow = () => page.evaluate(() => ({
    mode: (document.querySelector('.am-mode.on') || {}).getAttribute ? document.querySelector('.am-mode.on').getAttribute('data-ammode') : '',
    steps: Array.from(document.querySelectorAll('.am-step')).map((b) => (b.classList.contains('on') ? '>' : '') + b.querySelector('.am-step-t').firstChild.textContent.trim() + ':' + b.className.match(/st-(\w+)/)[1]),
    now: (document.querySelector('.am-now') || {}).innerText || '', tabs: document.querySelectorAll('.am-tabs [data-amtab]').length }));
  async function drop(files) {
    const before = await page.evaluate(() => (document.querySelector('.up-st') || {}).textContent || '');
    await page.setInputFiles('[data-upin]', files);
    await page.waitForFunction((b) => { const s = document.querySelector('.up-st'); return s && s.textContent !== b && !s.querySelector('.spinner'); }, before, { timeout: 90000 });
    await page.waitForSelector('.am-flow');
  }
  const next = async (want) => { await page.click('.am-now .btn.primary'); await page.waitForFunction((w) => { const b = document.querySelector('.am-step.on .am-step-t'); return b && b.firstChild.textContent.trim() === w; }, want, { timeout: 30000 }); };

  /* ------------------------------------------------------------ nothing loaded */
  await page.goto(URL); await page.waitForSelector('#drop');
  await page.evaluate(() => window.__AIXM.go('digital')); await page.waitForSelector('.am-modes'); await page.waitForSelector('.up-drop');
  const f0 = await flow();
  if (f0.mode || f0.steps.length || !(await page.$('.am-choose'))) fails.push('nothing loaded: the choice first ' + JSON.stringify(f0));
  await page.screenshot({ path: OUT + '/choose.png' });

  /* ------------------------------------------------- view: an AMXM file dropped */
  await drop([T + 'amdb_test_EAXB.xml']);
  const f1 = await flow();
  if (f1.mode !== 'view' || f1.steps.join() !== '>Load:done,Look:todo,Check:todo,Fit for use:todo,Compare:opt,Export:todo' || !/Step 1 of 6/i.test(f1.now) || !/Next: Look/.test(f1.now)) fails.push('view after the AMXM file: ' + JSON.stringify(f1));
  const folded = await page.$eval('details.up-create', (e) => !e.open).catch(() => false);
  if (!folded) fails.push('view: the sources of creating are not folded');
  await next('Look'); await page.waitForSelector('.am-body .card, .am-body .ddm-wrap, .am-body table', { timeout: 30000 });
  await next('Check'); await page.waitForFunction(() => /rules|AMDB checks|Run/i.test(document.querySelector('.am-body').textContent), null, { timeout: 30000 });
  await next('Fit for use'); await page.waitForSelector('.fit-tbl', { timeout: 30000 });
  await next('Compare');
  await next('Export'); await page.waitForFunction(() => /package/i.test(document.querySelector('.am-body').textContent), null, { timeout: 30000 });
  const f2 = await flow();
  if (f2.steps.join() !== 'Load:done,Look:done,Check:done,Fit for use:done,Compare:done,>Export:todo' || /Next:/.test(f2.now)) fails.push('view, all the steps seen: ' + JSON.stringify(f2));
  await page.click('.am-now [data-amtab="compare"]');
  if ((await flow()).steps.filter((x) => x[0] === '>')[0] !== '>Compare:done') fails.push('view: Back does not go back');
  await page.screenshot({ path: OUT + '/view.png' });

  /* ------------------------------------------------------------------ create */
  await page.click('[data-ammode="create"]'); await page.waitForSelector('.am-steps');
  const f3 = await flow();
  if (f3.mode !== 'create' || f3.steps.join() !== '>Sources:todo,Fill the gaps:wait,Generate:wait,Look:wait,Check:wait,Fit for use:wait,Package:wait') fails.push('create without an AIP data set: ' + JSON.stringify(f3));
  await page.click('.am-step[data-amtab="generate"]'); await page.waitForSelector('.am-now');
  if (!/First: step 1 · Sources/.test((await flow()).now)) fails.push('a waiting step does not say what comes first: ' + (await flow()).now);
  await page.click('.am-now [data-amtab="upload"]'); await page.waitForSelector('.up-drop');
  await drop([T + 'EA_AIP_DS_FULL_20170701.xml']);
  const f4 = await flow();
  if (f4.steps.join() !== '>Sources:done,Fill the gaps:opt,Generate:todo,Look:wait,Check:wait,Fit for use:wait,Package:wait' || !/Next: Fill the gaps/.test(f4.now)) fails.push('create with the AIP data set: ' + JSON.stringify(f4));
  if (!(await page.$('.am-step.next[data-amtab="generate"]'))) fails.push('create: Generate is not marked as the next step');
  await page.screenshot({ path: OUT + '/create_sources.png' });
  await next('Fill the gaps'); await page.waitForSelector('.tr-map', { timeout: 30000 });
  if (!/Skip to Generate/.test((await flow()).now)) fails.push('an optional step is not skippable: ' + (await flow()).now);
  await next('Generate'); await page.waitForSelector('[data-gengo]', { timeout: 30000 });
  await page.check('[data-genack]');
  await page.evaluate(() => { document.querySelectorAll('[data-gen]').forEach((cb) => { cb.checked = false; cb.dispatchEvent(new Event('change', { bubbles: true })); }); const r = Array.from(document.querySelectorAll('[data-genrow]')).filter((t) => /EADD/.test(t.textContent))[0]; const cb = r.querySelector('[data-gen]'); cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.click('[data-gengo]');
  await page.waitForFunction(() => window.__AIXM.S.datasets.some((d) => /_generated_from_AIP/.test(d.name)), null, { timeout: 60000 });
  await page.waitForFunction(() => { const b = document.querySelector('.am-step.on .am-step-t'); return b && b.firstChild.textContent.trim() === 'Look'; }, null, { timeout: 30000 });
  const f5 = await flow();
  if (f5.mode !== 'create' || f5.steps.join() !== 'Sources:done,Fill the gaps:done,Generate:done,>Look:todo,Check:todo,Fit for use:todo,Package:todo') fails.push('create after generating: ' + JSON.stringify(f5));
  await page.screenshot({ path: OUT + '/create_look.png' });

  /* -------------------------------------------------- kept, all tools, phone */
  await page.reload(); await page.waitForSelector('#drop');
  await page.evaluate(() => window.__AIXM.go('digital')); await page.waitForSelector('.am-modes');
  const f6 = await flow();
  if (f6.mode !== 'create') fails.push('the path chosen is not kept: ' + JSON.stringify(f6));
  await page.click('[data-ammode="all"]'); await page.waitForSelector('.am-tabs');
  if ((await flow()).tabs !== 10) fails.push('all tools: ' + (await flow()).tabs + ' tabs');
  await page.click('[data-ammode="view"]'); await page.waitForSelector('.am-steps');
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(300);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (over > 1) fails.push('phone: the page is ' + over + ' px wider than the screen');
  await page.screenshot({ path: OUT + '/phone.png', fullPage: false });

  if (errors.length) fails.push('page errors: ' + errors.join(' | '));
  await browser.close();
  if (fails.length) { console.error('FAIL amdb_flow:\n - ' + fails.join('\n - ')); process.exit(1); }
  console.log('PASS amdb_flow: the choice, View AMDB data (6 steps, Next / Back, each seen), Create AMDB data (7 steps, waiting steps, optional step, generate → Look), the path kept, all tools, phone');
})().catch((e) => { console.error('FAIL amdb_flow:', e); process.exit(1); });
