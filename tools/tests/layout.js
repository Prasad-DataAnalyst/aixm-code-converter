// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Layout check: every main view at several window sizes, dark mode and Arabic (RTL); the page must not
// scroll sideways, the top bar must not wrap off-screen and the title must not run under the search box. Screenshots go to tools/tests/out/layout.
const { ROOT, out, chrome, playwright } = require('./_env');
const OUT = out('layout');
const SIZES = [[1920, 1080], [1366, 768], [1024, 768], [820, 1180], [390, 844]];
const VIEWS = ['files', 'dash', 'aip', 'map', 'changes', 'timeline', 'compare', 'notam', 'quality', 'explorer', 'export', 'library'];
(async () => {
  const browser = await playwright.chromium.launch({ executablePath: chrome });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  const errors = [], problems = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + ROOT + '/AIXM-Code-Converter.html'); await page.waitForSelector('#drop');
  await page.setInputFiles('#file-input', [ROOT + '/testdata/Donlon_EADD_changes_AIRAC2611.xml', ROOT + '/testdata/Donlon_ALL_Baseline_2025.xml']);
  await page.waitForFunction(() => window.__AIXM.S.files.every((f) => f.status === 'ready'));
  await page.click('#extract-btn');
  await page.waitForFunction(() => window.__AIXM.S.view === 'dash', null, { timeout: 60000 });
  async function check(tag) {
    const r = await page.evaluate(() => {
      const de = document.documentElement, tb = document.querySelector('.topbar').getBoundingClientRect();
      const off = [...document.querySelectorAll('.topbar > *')].filter((e) => { const b = e.getBoundingClientRect(); return b.width && (b.right > innerWidth + 1 || b.left < -1); }).map((e) => e.id || e.className);
      // the title must not run under the search box
      const t = document.querySelector('.brand-title'), sr = document.querySelector('.topbar .search');
      let under = false;
      if (sr && getComputedStyle(sr).display !== 'none') {
        // the part of the title that is drawn (text that overflows a box without clipping is drawn too), left to right or right to left
        const b = t.getBoundingClientRect(), clipped = getComputedStyle(t).overflowX !== 'visible', rtl = getComputedStyle(t).direction === 'rtl';
        const l = clipped ? b.left : rtl ? b.right - t.scrollWidth : b.left, r = clipped ? b.right : rtl ? b.right : b.left + t.scrollWidth;
        const q = sr.getBoundingClientRect();
        under = Math.min(r, q.right) - Math.max(l, q.left) > 1;
      }
      return { sideScroll: de.scrollWidth > innerWidth + 1, topbarH: Math.round(tb.height), off, under };
    });
    if (r.sideScroll) problems.push(tag + ': page scrolls sideways');
    if (r.off.length) problems.push(tag + ': top bar items off-screen: ' + r.off.join(', '));
    if (r.under) problems.push(tag + ': the title runs under the search box');
    return r;
  }
  for (const [w, h] of SIZES) {
    await page.setViewportSize({ width: w, height: h });
    for (const v of VIEWS) {
      await page.evaluate((x) => window.__AIXM.go(x), v); await page.waitForTimeout(v === 'map' ? 700 : 150);
      await check(w + 'x' + h + ' ' + v);
      if (['dash', 'aip', 'map'].includes(v)) await page.screenshot({ path: OUT + '/' + w + '-' + v + '.png' });
    }
  }
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.click('#theme-btn'); await page.evaluate(() => window.__AIXM.go('dash')); await page.waitForTimeout(200); await check('dark dash');
  await page.screenshot({ path: OUT + '/dark-dash.png' });
  await page.click('#theme-btn');
  await page.selectOption('#lang-sel', 'ar');
  for (const v of ['dash', 'aip', 'quality']) { await page.evaluate((x) => window.__AIXM.go(x), v); await page.waitForTimeout(200); await check('rtl ' + v); }
  await page.screenshot({ path: OUT + '/rtl-quality.png' });
  await page.selectOption('#lang-sel', 'en');
  console.log(problems.length ? problems.join('\n') : 'layout OK at ' + SIZES.map((s) => s.join('x')).join(', '));
  console.log(errors.join('\n') || 'no errors');
  if (errors.length || problems.length) process.exitCode = 1;
  await browser.close();
})();
