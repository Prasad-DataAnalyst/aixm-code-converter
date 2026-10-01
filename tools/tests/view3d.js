// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// 3D view and terrain: area view with airspace volumes and the airspace column read-out, approach and
// departure crew views, grid MORA layer and terrain elevation in the status bar.
// Optional: V3D_FILE=<file.xml> V3D_ICAO=<code> to check another data set as well.
const { chromium } = require('./_env').playwright;
const ROOT = require('./_env').ROOT, OUT = require('./_env').out('view3d');

async function run(browser, file, icao, tag, errors, fails) {
  const page = await (await browser.newContext({ viewport: { width: 1500, height: 900 } })).newPage();
  page.on('pageerror', (e) => errors.push(e.message + e.stack));
  page.on('console', (m) => { if (m.type() === 'error' && !/net::|Failed to load resource|WebGL|GPU stall/.test(m.text())) errors.push(m.text()); });
  await page.goto('file://' + ROOT + '/AIXM-Code-Converter.html');
  await page.waitForSelector('#drop');
  await page.setInputFiles('#file-input', [file]);
  await page.waitForFunction(() => window.__AIXM.S.files.every((f) => f.status === 'ready'));
  await page.click('#extract-btn');
  await page.waitForFunction(() => window.__AIXM.S.view === 'dash', null, { timeout: 120000 });
  await page.evaluate(() => window.__AIXM.go('map'));
  await page.waitForTimeout(600);
  // grid MORA and terrain read-out
  await page.evaluate(() => { document.querySelector('[data-layer="mora"]').click(); MAPVIEW.leaflet().setView([24, 45], 6, { animate: false }); });
  await page.waitForTimeout(700);
  await page.mouse.move(900, 450);
  const status = await page.evaluate(() => document.getElementById('map-status').textContent);
  console.log(tag, 'status:', status);
  await page.screenshot({ path: OUT + '/' + tag + '_mora.png' });
  // approach crew view
  await page.evaluate((code) => { const ds = window.__AIXM.S.datasets[0]; const ad = ds.byType.AirportHeliport.find((a) => JSON.stringify(a.cur.p.locationIndicatorICAO || '').includes(code)); MAPVIEW.airportView(ds, ad); }, icao);
  await page.waitForTimeout(500);
  await page.click('[data-adc="3dapp"]');
  await page.waitForFunction(() => /Terrain:/.test((document.querySelector('[data-3="foot"]') || {}).textContent || ''), null, { timeout: 20000 });
  await page.waitForTimeout(800);
  const read = await page.evaluate(() => document.querySelector('[data-3="read"]').innerText.replace(/\s+/g, ' '));
  console.log(tag, 'approach:', read.slice(0, 220));
  if (!/Altitude/.test(read) || !/Terrain clearance/.test(read)) fails.push(tag + ' approach read-out');
  await page.screenshot({ path: OUT + '/' + tag + '_approach.png' });
  await page.evaluate(() => { const sl = document.querySelector('[data-3="dist"]'); sl.value = 3; sl.dispatchEvent(new Event('input')); });
  await page.waitForTimeout(400);
  await page.screenshot({ path: OUT + '/' + tag + '_approach3nm.png' });
  // departure
  await page.selectOption('[data-3="mode"]', 'departure');
  await page.waitForFunction(() => /Departure/.test(document.querySelector('[data-3="read"]').innerText), null, { timeout: 20000 });
  await page.evaluate(() => { const sl = document.querySelector('[data-3="dist"]'); sl.value = 4; sl.dispatchEvent(new Event('input')); });
  await page.waitForTimeout(600);
  await page.screenshot({ path: OUT + '/' + tag + '_departure.png' });
  // area view with the airspace column under the mouse
  await page.selectOption('[data-3="mode"]', 'area');
  await page.waitForTimeout(2500);
  await page.mouse.move(750, 520);
  await page.waitForTimeout(400);
  const info = await page.evaluate(() => document.querySelector('[data-3="info"]').innerText.replace(/\s+/g, ' '));
  console.log(tag, 'area info:', info.slice(0, 220));
  if (!/Terrain/.test(info)) fails.push(tag + ' area terrain read-out');
  const vols = await page.evaluate(() => VIEW3D.state().volumes.length);
  console.log(tag, 'airspace volumes', vols);
  await page.screenshot({ path: OUT + '/' + tag + '_area.png' });
  await page.click('[data-3="close"]');
  if (await page.evaluate(() => VIEW3D.isOpen())) fails.push(tag + ' close');
  await page.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: require('./_env').chrome, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errors = [], fails = [];
  await run(browser, ROOT + '/testdata/Donlon_ALL_Baseline_2025.xml', 'EADD', 'donlon', errors, fails);
  if (process.env.V3D_FILE) await run(browser, process.env.V3D_FILE, process.env.V3D_ICAO || 'OEJN', 'extra', errors, fails);
  console.log(errors.join('\n') || 'no errors');
  console.log(fails.length ? 'FAIL: ' + fails.join('; ') : '3D view OK');
  if (errors.length || fails.length) process.exitCode = 1;
  await browser.close();
})();
