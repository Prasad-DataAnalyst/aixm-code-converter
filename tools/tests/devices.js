// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Phone and tablet layouts on emulated iPhone, Android phone, iPad and Android tablet (upright and sideways):
// the right layout is chosen, nothing scrolls sideways, the page tabs stay on screen, the section lists fold where
// they should, search opens from ⌕, the map starts as it should. A computer gets the desktop layout at any size,
// and ?layout= overrides the choice.
const env = require('./_env');
const ROOT = env.ROOT, OUT = env.out('devices'), D = env.playwright.devices;
const URL = 'file://' + ROOT + '/AIXM-Code-Converter.html';

const CASES = [
  // name, Playwright profile, expected layout, section lists fold?, search behind ⌕?, map layer panel open?
  ['iPhone', D['iPhone 13'], 'phone', true, true, false],
  ['iPhone sideways', D['iPhone 13 landscape'], 'phone', true, true, false],
  ['Android phone', D['Pixel 7'], 'phone', true, true, false],
  ['Android phone sideways', D['Pixel 7 landscape'], 'phone', true, true, false],
  ['iPad', D['iPad (gen 7)'], 'tablet', true, true, false],
  ['iPad sideways', D['iPad (gen 7) landscape'], 'tablet', false, true, true],
  ['iPad Pro 12.9 sideways', Object.assign({}, D['iPad Pro 11 landscape'], { viewport: { width: 1366, height: 1024 } }), 'tablet', false, false, true],
  ['iPad (desktop-site mode)', Object.assign({}, D['iPad Pro 11'], { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15' }), 'tablet', true, true, false],
  ['Android tablet', D['Galaxy Tab S4'], 'tablet', true, true, false],
  ['Android tablet sideways', D['Galaxy Tab S4 landscape'], 'tablet', false, true, true],
  ['Computer 1366', { viewport: { width: 1366, height: 768 } }, 'desktop', false, false, true],
  ['Computer, narrow window', { viewport: { width: 420, height: 800 } }, 'desktop', false, false, true]
];

(async () => {
  const browser = await env.playwright.chromium.launch({ executablePath: env.chrome });
  const errors = [], fails = [];
  const shown = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0; }, sel);
  for (const [name, profile, want, folds, searchBtn, panelOpen] of CASES) {
    const ctx = await browser.newContext(profile);
    if (/desktop-site/.test(name)) await ctx.addInitScript(() => Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 }));
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(name + ': ' + e.message));
    const bad = (m) => fails.push(name + ': ' + m);
    await page.goto(URL); await page.waitForSelector('#drop');
    const got = await page.evaluate(() => document.documentElement.getAttribute('data-device'));
    if (got !== want) bad('layout ' + got + ', expected ' + want);
    await page.setInputFiles('#file-input', [ROOT + '/testdata/Donlon_ALL_Baseline_2025.xml']);
    await page.waitForFunction(() => window.__AIXM.S.files.every((f) => f.status === 'ready'));
    await page.evaluate(() => document.querySelector('#extract-btn').click());
    await page.waitForFunction(() => window.__AIXM.S.view === 'dash', null, { timeout: 60000 });
    for (const v of ['dash', 'aip', 'explorer', 'export', 'quality', 'changes', 'library', 'about', 'map']) {
      await page.evaluate((x) => window.__AIXM.go(x), v); await page.waitForTimeout(v === 'map' ? 900 : 150);
      const r = await page.evaluate(() => { const n = document.querySelector('#nav').getBoundingClientRect(); return { side: document.documentElement.scrollWidth > innerWidth + 1, nav: n.bottom <= innerHeight + 1 && n.right <= innerWidth + 1 }; });
      if (r.side) bad(v + ' scrolls sideways');
      if (!r.nav) bad(v + ': page tabs off screen');
    }
    if (await shown(page, '#map-panel') !== panelOpen) bad('map layer panel should start ' + (panelOpen ? 'open' : 'closed'));
    await page.screenshot({ path: OUT + '/' + name.replace(/\W+/g, '_') + '-map.png' });
    // search
    if (await shown(page, '#m-search-btn') !== searchBtn) bad('⌕ search button ' + (searchBtn ? 'missing' : 'should not show'));
    if (searchBtn) {
      await page.click('#m-search-btn'); await page.keyboard.type('EADD'); await page.waitForTimeout(400);
      if (!(await page.locator('#search-results .sr-item[data-sr]').count())) bad('no search results');
      await page.keyboard.press('Escape');
      if (await shown(page, '#search-wrap')) bad('Escape should close the search');
    }
    // AIP section list
    await page.evaluate(() => window.__AIXM.go('aip')); await page.waitForTimeout(200);
    if (await shown(page, '.m-side-btn') !== folds) bad('☰ button ' + (folds ? 'missing' : 'should not show'));
    if (folds) {
      if (await shown(page, '.split > .side')) bad('AIP sections should start folded');
      await page.click('.m-side-btn');
      if (!(await shown(page, '.split > .side'))) bad('☰ does not open the AIP sections');
      await page.screenshot({ path: OUT + '/' + name.replace(/\W+/g, '_') + '-aip.png' });
      await page.locator('.side .node[data-sec]:not([data-toggle])').nth(2).click(); await page.waitForTimeout(200);
      if (await shown(page, '.split > .side')) bad('AIP sections should fold after a pick');
    } else if (!(await shown(page, '.split > .side'))) bad('AIP sections should be visible');
    // the AIP page scrolls to its footer, and the footer is on screen
    await page.evaluate(() => { const c = document.querySelector('#aip-content'); c.scrollTop = c.scrollHeight; }); await page.waitForTimeout(200);
    const foot = await page.evaluate(() => { const f = document.querySelector('#aip-content .app-foot'); if (!f) return false; const r = f.getBoundingClientRect(), n = document.querySelector('#nav').getBoundingClientRect(); return r.height > 0 && r.top >= 0 && r.bottom <= innerHeight + 1 && !(n.top < r.bottom && n.bottom > r.top && n.left < r.right && n.right > r.left); });
    if (!foot) bad('AIP footer not reachable by scrolling');
    // layout choice in the footer only on phones and tablets
    const sel = await page.locator('#layout-sel').count();
    if ((want !== 'desktop') !== (sel > 0)) bad('layout switch ' + (sel ? 'should not show on a computer' : 'missing'));
    await ctx.close();
  }
  // ?layout= override and the footer switch (remembered)
  const ctx = await browser.newContext(D['iPad (gen 7)']);
  const page = await ctx.newPage();
  await page.goto(URL + '?layout=desktop'); await page.waitForSelector('#drop');
  if (await page.evaluate(() => document.documentElement.dataset.device) !== 'desktop') fails.push('?layout=desktop ignored');
  await page.goto(URL); await page.waitForSelector('#drop');
  if (await page.evaluate(() => document.documentElement.dataset.device) !== 'desktop') fails.push('layout choice not remembered');
  await page.selectOption('#layout-sel', 'auto'); await page.waitForTimeout(100);
  if (await page.evaluate(() => document.documentElement.dataset.device) !== 'tablet') fails.push('footer switch back to automatic');
  await ctx.close();

  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
  console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : 'phone and tablet layouts OK (' + CASES.length + ' devices)');
  if (errors.length || fails.length) process.exitCode = 1;
  await browser.close();
})();
