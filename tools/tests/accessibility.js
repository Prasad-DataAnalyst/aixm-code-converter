// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Accessibility: every page (start, dashboard, AIP, explorer, export, quality, changes, library, map, about) is checked
// with axe-core (WCAG 2.1 A/AA rules) in the light and dark themes; any critical or serious problem fails the test.
const fs = require('fs');
const path = require('path');
const env = require('./_env');
const ROOT = env.ROOT, OUT = env.out('accessibility');
const AXE = fs.readFileSync(path.join(ROOT, 'tools', 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');

(async () => {
  const browser = await env.playwright.chromium.launch({ executablePath: env.chrome });
  const errors = [], fails = [], report = [];
  async function check(page, label) {
    await page.addScriptTag({ content: AXE });
    const res = await page.evaluate(() => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, resultTypes: ['violations'] }));
    for (const v of res.violations) {
      const where = v.nodes.slice(0, 4).map((n) => n.target.join(' ')).join(', ');
      report.push(label + ' [' + v.impact + '] ' + v.id + ' (' + v.nodes.length + '): ' + where);
      if (v.impact === 'critical' || v.impact === 'serious') fails.push(label + ': ' + v.id + ' — ' + v.help + ' — ' + where);
    }
  }
  for (const theme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, colorScheme: theme });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('file://' + ROOT + '/AIXM-Code-Converter.html'); await page.waitForSelector('#drop');
    await check(page, theme + ' start');
    await page.setInputFiles('#file-input', [ROOT + '/testdata/Donlon_ALL_Baseline_2025.xml']);
    await page.waitForFunction(() => window.__AIXM.S.files.every((f) => f.status === 'ready'));
    await page.evaluate(() => document.querySelector('#extract-btn').click());
    await page.waitForFunction(() => window.__AIXM.S.view === 'dash', null, { timeout: 60000 });
    for (const v of ['dash', 'aip', 'explorer', 'export', 'quality', 'changes', 'library', 'map', 'about']) {
      await page.evaluate((x) => window.__AIXM.go(x), v); await page.waitForTimeout(v === 'map' ? 1200 : 300);
      await check(page, theme + ' ' + v);
    }
    await ctx.close();
  }
  fs.writeFileSync(path.join(OUT, 'report.txt'), report.join('\n') + '\n');
  console.log(report.length ? report.length + ' minor or moderate notes (see out/accessibility/report.txt)' : 'no notes');
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
  console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : 'accessibility OK (no critical or serious problems)');
  if (errors.length || fails.length) process.exitCode = 1;
  await browser.close();
})();
