// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Map in a separate window: pop out, "show on map" from the main window, AIP link back, theme, dock.
const { chromium } = require('./_env').playwright;
const ROOT = require('./_env').ROOT, OUT = require('./_env').out('map_window');

(async () => {
  const browser = await chromium.launch({ executablePath: require('./_env').chrome, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 880 } });
  const page = await ctx.newPage();
  const errors = [], fails = [];
  const watch = (p) => { p.on('pageerror', (e) => errors.push(e.message + e.stack)); p.on('console', (m) => { if (m.type() === 'error' && !/net::|Failed to load resource/.test(m.text())) errors.push(m.text()); }); };
  watch(page);
  await page.goto('file://' + ROOT + '/AIXM-Code-Converter.html');
  await page.waitForSelector('#drop');
  await page.setInputFiles('#file-input', [ROOT + '/testdata/Donlon_ALL_Baseline_2025.xml']);
  await page.waitForFunction(() => window.__AIXM.S.files.every((f) => f.status === 'ready'));
  await page.click('#extract-btn');
  await page.waitForFunction(() => window.__AIXM.S.view === 'dash', null, { timeout: 60000 });
  await page.evaluate(() => window.__AIXM.go('map'));
  await page.waitForSelector('#map-popout');
  const [pop] = await Promise.all([ctx.waitForEvent('page'), page.click('#map-popout')]);
  watch(pop);
  await pop.waitForFunction(() => window.MAPVIEW && window.MAPVIEW.isMounted(), null, { timeout: 30000 });
  await pop.waitForTimeout(800);
  const st = await page.evaluate(() => ({ view: window.__AIXM.S.view, open: MAPWIN.isOpen() }));
  console.log('after pop-out', JSON.stringify(st));
  if (!st.open || st.view === 'map') fails.push('pop-out did not move the map');
  if (await pop.$('#map-popout')) fails.push('map window shows the pop-out button');
  if (!(await pop.$('#map-dock'))) fails.push('map window has no dock button');
  // "show on map" from the main window goes to the map window (aerodrome -> airport view)
  await page.evaluate(() => { const ds = window.__AIXM.S.datasets[0]; const ad = ds.byType.AirportHeliport.find((a) => /EADD/.test(JSON.stringify(a.cur.p.locationIndicatorICAO))); window.__AIXM.go('aip'); window.__AIXM.go('map', { ds, focus: ad }); });
  await pop.waitForTimeout(1000);
  const card = await pop.evaluate(() => { const c = document.getElementById('map-adcard'); return c && !c.classList.contains('hidden') ? c.innerText.slice(0, 40) : ''; });
  console.log('card in map window:', JSON.stringify(card));
  if (!/EADD/.test(card)) fails.push('show on map did not reach the map window');
  if (await page.evaluate(() => window.__AIXM.S.view) !== 'aip') fails.push('main window left its view');
  await pop.screenshot({ path: OUT + '/map_window.png' });
  // AIP link in the map window opens the section in the main window
  await pop.click('[data-adc="aip"]');
  await page.waitForTimeout(500);
  const sel = await page.evaluate(() => window.__AIXM.S.aipSel);
  console.log('main AIP selection', sel);
  if (!/^AD2\./.test(sel || '')) fails.push('AIP link from the map window');
  // theme follows the main window
  await page.click('#theme-btn');
  await pop.waitForTimeout(200);
  const th = await Promise.all([page.evaluate(() => document.documentElement.getAttribute('data-theme')), pop.evaluate(() => document.documentElement.getAttribute('data-theme'))]);
  console.log('themes', th.join(' / '));
  if (th[0] !== th[1]) fails.push('theme not synced');
  await pop.screenshot({ path: OUT + '/map_window_dark.png' });
  // the 3D view also works inside the map window
  await pop.click('#map-3d');
  await pop.waitForFunction(() => /Terrain:/.test((document.querySelector('[data-3="foot"]') || {}).textContent || ''), null, { timeout: 20000 }).catch(() => fails.push('3D view in the map window'));
  await pop.screenshot({ path: OUT + '/map_window_3d.png' });
  await pop.click('[data-3="close"]');
  // dock back
  await Promise.all([pop.waitForEvent('close'), pop.click('#map-dock')]);
  await page.waitForTimeout(600);
  const back = await page.evaluate(() => ({ view: window.__AIXM.S.view, mounted: MAPVIEW.isMounted(), open: MAPWIN.isOpen() }));
  console.log('after dock', JSON.stringify(back));
  if (back.view !== 'map' || !back.mounted || back.open) fails.push('dock back');
  console.log(errors.join('\n') || 'no errors');
  console.log(fails.length ? 'FAIL: ' + fails.join('; ') : 'map window OK');
  if (errors.length || fails.length) process.exitCode = 1;
  await browser.close();
})();
