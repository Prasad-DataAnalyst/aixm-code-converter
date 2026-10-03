// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Phone layout (≤ 760 px wide): AIP / Explorer side lists open from a "☰" button and close after a pick, the search
// opens from a top-bar button, the map starts with its Layers panel closed. The desktop layout stays as it was.
const env = require('./_env');
const ROOT = env.ROOT, OUT = env.out('phone');

(async () => {
  const browser = await env.playwright.chromium.launch({ executablePath: env.chrome });
  const errors = [], fails = [];
  async function open(opts) {
    const page = await (await browser.newContext(opts)).newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('file://' + ROOT + '/AIXM-Code-Converter.html');
    await page.waitForSelector('#drop');
    await page.setInputFiles('#file-input', [ROOT + '/testdata/Donlon_ALL_Baseline_2025.xml']);
    await page.waitForFunction(() => window.__AIXM.S.files.every((f) => f.status === 'ready'));
    await page.evaluate(() => document.querySelector('#extract-btn').click());
    await page.waitForFunction(() => window.__AIXM.S.view === 'dash', null, { timeout: 60000 });
    return page;
  }
  const shown = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0; }, sel);

  // phone
  const p = await open({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await p.evaluate(() => window.__AIXM.go('aip')); await p.waitForTimeout(300);
  if (await shown(p, '.split > .side')) fails.push('AIP side list should start closed');
  await p.click('.m-side-btn');
  if (!(await shown(p, '.split > .side'))) fails.push('☰ button does not open the AIP sections');
  await p.screenshot({ path: OUT + '/aip-sections.png' });
  await p.locator('.side .node[data-sec]:not([data-toggle])').nth(2).click(); await p.waitForTimeout(300);
  if (await shown(p, '.split > .side')) fails.push('AIP sections should close after a pick');

  await p.click('#m-search-btn'); await p.keyboard.type('EADD'); await p.waitForTimeout(500);
  if (!(await shown(p, '#search-wrap'))) fails.push('search box does not open');
  if (!(await p.locator('#search-results .sr-item[data-sr]').count())) fails.push('no search results on phone');
  await p.screenshot({ path: OUT + '/search.png' });
  await p.keyboard.press('Escape');
  if (await shown(p, '#search-wrap')) fails.push('Escape should close the phone search');

  await p.evaluate(() => window.__AIXM.go('map')); await p.waitForTimeout(700);
  if (await shown(p, '#map-panel')) fails.push('map Layers panel should start closed on phones');
  await p.screenshot({ path: OUT + '/map.png' });

  await p.evaluate(() => window.__AIXM.go('explorer')); await p.waitForTimeout(300);
  if (!(await shown(p, '.explorer .m-side-btn'))) fails.push('explorer has no ☰ Feature types button');
  if (await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) fails.push('page scrolls sideways on phone');

  // desktop: nothing of the phone layout shows
  const d = await open({ viewport: { width: 1366, height: 768 } });
  await d.evaluate(() => window.__AIXM.go('aip')); await d.waitForTimeout(300);
  if (await shown(d, '#m-search-btn') || await shown(d, '.m-side-btn')) fails.push('phone buttons visible on desktop');
  if (!(await shown(d, '.split > .side')) || !(await shown(d, '#search-wrap'))) fails.push('desktop side list or search missing');
  await d.evaluate(() => window.__AIXM.go('map')); await d.waitForTimeout(700);
  if (!(await shown(d, '#map-panel'))) fails.push('desktop map panel should start open');

  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
  console.log(fails.length ? 'FAIL: ' + fails.join('; ') : 'phone layout OK');
  if (errors.length || fails.length) process.exitCode = 1;
  await browser.close();
})();
