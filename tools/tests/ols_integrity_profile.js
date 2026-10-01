// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Annex 14 obstacle limitation surfaces (Quality tab, 3D), data integrity / CRC32Q (Quality tab, save and verify),
// approach profile chart in the AIP.
const fs = require('fs');
const { chromium } = require('./_env').playwright;
const ROOT = require('./_env').ROOT, OUT = require('./_env').out('ols_integrity_profile');

(async () => {
  const browser = await chromium.launch({ executablePath: require('./_env').chrome, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 1500, height: 920 }, acceptDownloads: true })).newPage();
  const errors = [], fails = [];
  page.on('pageerror', (e) => errors.push(e.message + e.stack));
  page.on('console', (m) => { if (m.type() === 'error' && !/net::|Failed to load resource|WebGL|GPU stall/.test(m.text())) errors.push(m.text()); });
  await page.goto('file://' + ROOT + '/AIXM-Code-Converter.html');
  await page.waitForSelector('#drop');
  await page.setInputFiles('#file-input', [ROOT + '/testdata/Donlon_ALL_Baseline_2025.xml', ROOT + '/testdata/EA_EADD_OBS_DS_AREA_2_3_4_FULL_20191205.xml', ROOT + '/testdata/Donlon_EADD_changes_AIRAC2611.xml']);
  await page.waitForFunction(() => window.__AIXM.S.files.every((f) => f.status === 'ready'));
  await page.click('#extract-btn');
  await page.waitForFunction(() => window.__AIXM.S.view === 'dash' && window.__AIXM.S.datasets.length === 3, null, { timeout: 120000 });
  console.log('data sets:', await page.evaluate(() => window.__AIXM.S.datasets.map((d) => d.name + ' [' + d.state + ']').join(', ')));

  // obstacle limitation surfaces
  await page.evaluate(() => { const S = window.__AIXM.S; S.active = S.datasets.findIndex((d) => /Baseline/.test(d.name)); S.qTab = 'ols'; window.__AIXM.go('quality'); });
  await page.waitForSelector('[data-ols3d]');
  const ols = await page.evaluate(() => Array.from(document.querySelectorAll('.stat b')).map((b) => b.textContent));
  console.log('OLS stats (aerodromes, obstacles, penetrations):', ols.join(' / '));
  if (!(+ols[1].replace(/,/g, '') > 17)) fails.push('OLS did not use the separate obstacle file');
  if (!(+ols[2] > 0)) fails.push('OLS found no penetration');
  await page.screenshot({ path: OUT + '/ols_tab.png' });
  await page.click('[data-ols3d]');
  await page.waitForFunction(() => /Terrain:/.test((document.querySelector('[data-3="foot"]') || {}).textContent || ''), null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  const info = await page.evaluate(() => document.querySelector('[data-3="info"]').innerText.replace(/\s+/g, ' '));
  console.log('3D OLS:', info.slice(0, 200));
  if (!/penetration/i.test(info)) fails.push('3D OLS panel');
  await page.screenshot({ path: OUT + '/ols_3d.png' });
  await page.click('[data-3="close"]');

  // data integrity
  await page.evaluate(() => { window.__AIXM.S.qTab = 'integrity'; window.__AIXM.go('quality'); });
  await page.waitForSelector('#i-csv');
  const ist = await page.evaluate(() => Array.from(document.querySelectorAll('.stat b')).map((b) => b.textContent));
  console.log('integrity stats (items, ok, not declared, insufficient):', ist.join(' / '));
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#i-csv')]);
  const csv = OUT + '/crc.csv'; await dl.saveAs(csv);
  const head = fs.readFileSync(csv, 'utf8').split('\n').slice(0, 3);
  console.log('CRC list:', head.join(' | '));
  if (!/Prasad Selvaraj/.test(head[0])) fails.push('CRC list attribution');
  // tamper with one CRC: verification must report exactly one change
  const lines = fs.readFileSync(csv, 'utf8').split('\n'); lines[2] = lines[2].replace(/;[0-9A-F]{8};/, ';00000000;'); fs.writeFileSync(OUT + '/crc_tampered.csv', lines.join('\n'));
  await page.setInputFiles('#i-file', OUT + '/crc_tampered.csv');
  await page.waitForFunction(() => /Verification/.test(document.getElementById('i-ver-out').innerText));
  const ver = await page.evaluate(() => document.getElementById('i-ver-out').innerText.replace(/\s+/g, ' ').slice(0, 160));
  console.log('verify:', ver);
  if (!/1 changed/.test(ver)) fails.push('CRC verification');
  await page.screenshot({ path: OUT + '/integrity.png' });

  // approach profile in the AIP
  const sec = await page.evaluate(() => {
    const S = window.__AIXM.S; S.active = S.datasets.findIndex((d) => /changes/.test(d.name));
    const ds = S.datasets[S.active], pr = ds.byType.InstrumentApproachProcedure[0], sc = AIP.sectionOf(ds, pr);
    S.aipSel = sc.id; S.aipOpen.AD = true; if (sc.ad) S.aipOpen['AD:' + sc.ad.i] = true; window.__AIXM.go('aip', { flash: pr });
    return sc.id;
  });
  await page.waitForTimeout(1200);
  const svg = await page.evaluate(() => { const s = document.querySelector('.prof-svg'); if (s) s.scrollIntoView(); return s ? s.textContent.replace(/\s+/g, ' ').slice(0, 200) : ''; });
  console.log('profile in', sec, ':', svg);
  if (!/FAF/.test(svg) || !/THR/.test(svg)) fails.push('approach profile chart');
  await page.waitForTimeout(300);
  await page.screenshot({ path: OUT + '/profile.png' });
  console.log(errors.join('\n') || 'no errors');
  console.log(fails.length ? 'FAIL: ' + fails.join('; ') : 'OLS, integrity and profile OK');
  if (errors.length || fails.length) process.exitCode = 1;
  await browser.close();
})();
