// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// End-to-end test in headless Chromium: load the single HTML file, extract the
// sample files, visit every view, take screenshots and exercise the exports.
// Usage: node tools/e2e.js [outdir] [files...]
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');
const ROOT = path.join(__dirname, '..');
const OUT = process.argv[2] || path.join(ROOT, 'tools', 'shots');
const files = process.argv.slice(3).length ? process.argv.slice(3) : [
  'testdata/Donlon_ALL_Baseline_2025.xml', 'testdata/EA_AIP_DS_FULL_20170701.xml', 'testdata/sample_aixm45_snapshot.xml',
  'testdata/chicago_airspace_crs84_51.xml', 'testdata/sample_52_iap.xml'
].map((f) => path.join(ROOT, f));
fs.mkdirSync(OUT, { recursive: true });

function exe() {
  const cands = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'];
  return cands.find((c) => fs.existsSync(c));
}

(async () => {
  const browser = await chromium.launch({ executablePath: exe(), args: ['--allow-file-access-from-files'] });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 920 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/net::|Failed to load resource/.test(m.text())) errors.push(m.type() + ': ' + m.text()); }); // offline: blocked tiles are not app errors
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + e.stack));
  const t0 = Date.now();
  await page.goto('file://' + path.join(ROOT, 'AIXM-Code-Converter.html'));
  await page.waitForSelector('#drop');
  console.log('loaded in', Date.now() - t0, 'ms');
  await page.screenshot({ path: path.join(OUT, '01-files.png') });
  await page.setInputFiles('#file-input', files);
  await page.waitForFunction((n) => window.__AIXM.S.files.filter((f) => f.status === 'ready' || f.status === 'invalid').length === n, files.length);
  await page.screenshot({ path: path.join(OUT, '02-files-ready.png') });
  const t1 = Date.now();
  await page.click('#extract-btn');
  await page.waitForFunction(() => window.__AIXM.S.view === 'dash', null, { timeout: 600000 });
  console.log('extracted in', Date.now() - t1, 'ms');
  const info = await page.evaluate(() => window.__AIXM.S.datasets.map((d) => ({ name: d.name, state: d.state, ver: d.sniff.versionLabel, recs: d.recs.length, airac: d.airac && d.airac.id, tRead: Math.round(d.tRead), tTotal: Math.round(d.tTotal) })));
  console.log(JSON.stringify(info, null, 1));
  await page.screenshot({ path: path.join(OUT, '03-dashboard.png'), fullPage: false });
  // AIP
  await page.click('button[data-view="aip"]');
  await page.waitForSelector('.sec-body');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, '04-aip-ad22.png') });
  // pick AD 2.12 of EADD
  const ids = await page.evaluate(() => { const ds = window.__AIXM.S.datasets[window.__AIXM.S.active]; const ad = ds.byType.AirportHeliport.find((a) => /EADD/.test(JSON.stringify(a.cur.p.locationIndicatorICAO))); return ad ? ad.i : null; });
  if (ids !== null) {
    await page.evaluate((i) => { window.__AIXM.S.aipSel = 'AD2.12:' + i; window.__AIXM.S.aipOpen['AD:' + i] = true; window.__AIXM.go('aip'); }, ids);
    await page.waitForSelector('table.aip');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, '05-aip-ad212.png') });
    // click a value -> XML drawer
    await page.click('table.aip .src');
    await page.waitForSelector('#drawer.open pre.xml');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, '06-xml-drawer.png') });
    await page.keyboard.press('Escape');
    await page.evaluate((i) => { window.__AIXM.S.aipSel = 'AD2.17:' + i; window.__AIXM.go('aip'); }, ids);
    await page.waitForSelector('.aip-kv');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, '07-aip-ad217.png') });
    // whole aerodrome
    await page.evaluate((i) => { window.__AIXM.S.aipSel = 'AD:' + i; window.__AIXM.go('aip'); }, ids);
    await page.waitForSelector('.aip-sec');
    await page.waitForTimeout(500);
  }
  await page.evaluate(() => { window.__AIXM.S.aipSel = 'ENR 3.2'; window.__AIXM.go('aip'); });
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(OUT, '08-aip-enr32.png') });
  // map
  await page.click('button[data-view="map"]');
  await page.waitForSelector('#map.leaflet-container');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, '09-map.png') });
  // explorer
  await page.click('button[data-view="explorer"]');
  await page.waitForSelector('#ex-list .vrow');
  await page.click('#ex-list .vrow');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, '10-explorer.png') });
  await page.keyboard.press('Escape');
  // changes
  await page.click('button[data-view="changes"]');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, '11-changes.png') });
  // compare (Donlon 2017 vs 2025)
  await page.click('button[data-view="compare"]');
  await page.waitForSelector('#cmp-run');
  await page.evaluate(() => { const S = window.__AIXM.S; const a = S.datasets.findIndex((d) => /20170701/.test(d.name)); const b = S.datasets.findIndex((d) => /Donlon_ALL/.test(d.name)); document.querySelector('#cmp-a').value = a; document.querySelector('#cmp-b').value = b; });
  await page.click('#cmp-run');
  await page.waitForSelector('#cmp-out .stat', { timeout: 120000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, '12-compare.png') });
  // quality
  await page.click('button[data-view="quality"]');
  await page.click('#q-run');
  await page.waitForSelector('#q-out .stat-row', { timeout: 120000 });
  await page.screenshot({ path: path.join(OUT, '13-quality.png') });
  // exports
  await page.click('button[data-view="export"]');
  await page.waitForSelector('[data-exp="pdf"]');
  for (const k of ['json', 'xlsx', 'pdf']) {
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), page.click('[data-exp="' + k + '"]')]);
    const p = path.join(OUT, 'export.' + k);
    await dl.saveAs(p);
    console.log('export', k, fs.statSync(p).size, 'bytes');
  }
  await page.click('[data-exp="mail"]');
  await page.waitForSelector('.modal .email-preview');
  await page.screenshot({ path: path.join(OUT, '14-email.png') });
  const [eml] = await Promise.all([page.waitForEvent('download'), page.click('[data-m="eml"]')]);
  await eml.saveAs(path.join(OUT, 'export.eml'));
  await page.click('[data-m="close"]');
  // dark theme
  await page.click('#theme-btn');
  await page.click('button[data-view="dash"]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, '15-dark-dashboard.png') });
  // search
  await page.fill('#search', 'EADD');
  await page.waitForSelector('#search-results .sr-item');
  await page.screenshot({ path: path.join(OUT, '16-search.png') });
  console.log('ERRORS:', errors.length ? '\n' + errors.join('\n') : 'none');
  await browser.close();
})().catch((e) => { console.error('E2E FAILED', e); process.exit(1); });
