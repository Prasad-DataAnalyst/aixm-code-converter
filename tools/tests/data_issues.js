// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Data issues: a copy of the Donlon sample with coding errors put in (an aerodrome at 0°N 0°E, one location
// indicator for two aerodromes, an implausible field elevation and runway length, a route segment lower limit above its
// upper limit). The Quality tab runs the checks by itself and lists each issue with what was found and what is
// expected, grouped by kind; a Quality row opens its AIP section, which stays clean: one quiet line with the number of
// issues and a link back to the Quality tab, filtered to that section; marking the values is an option. A copy whose runway thresholds have no
// coordinates (as in some deliveries): each threshold is flagged, and the map's airport view still opens with the
// runways listed from the data and a note of what the data set does not give.
const fs = require('fs');
const path = require('path');
const env = require('./_env');
const ROOT = env.ROOT, OUT = env.out('data_issues');
const URL = 'file://' + ROOT + '/AIXM-Code-Converter.html';

const lines = fs.readFileSync(ROOT + '/testdata/Donlon_ALL_Baseline_2025.xml', 'utf8').split('\n');
function swap(re, to, after) { const i = lines.findIndex((l, n) => n > (after || 0) && re.test(l)); if (i < 0) throw new Error('not found: ' + re); lines[i] = lines[i].replace(re, to); return i; }
const eadh = swap(/<aixm:locationIndicatorICAO>EADH</, '<aixm:locationIndicatorICAO>EADH<');
swap(/<gml:pos>[^<]+<\/gml:pos>/, '<gml:pos>0 0</gml:pos>', eadh); // EADH aerodrome reference point
swap(/<aixm:locationIndicatorICAO>EADA</, '<aixm:locationIndicatorICAO>EADD<');
swap(/<aixm:fieldElevation uom="M">30</, '<aixm:fieldElevation uom="M">30000<');
swap(/<aixm:nominalLength uom="M">3200</, '<aixm:nominalLength uom="M">320000<');
const lo = swap(/<aixm:lowerLimit uom="M">900</, '<aixm:lowerLimit uom="FL">250<');
swap(/<aixm:lowerLimitReference>MSL</, '<aixm:lowerLimitReference>STD<', lo - 1);
const FILE = path.join(OUT, 'Donlon_with_issues.xml');
fs.writeFileSync(FILE, lines.join('\n'));
const NOTHR = path.join(OUT, 'Donlon_no_threshold_positions.xml');
fs.writeFileSync(NOTHR, fs.readFileSync(ROOT + '/testdata/Donlon_ALL_Baseline_2025.xml', 'utf8')
  .replace(/<aixm:RunwayCentrelinePoint [\s\S]*?<\/aixm:RunwayCentrelinePoint>/g, (b) => b.replace(/<gml:pos[^>]*>[^<]*<\/gml:pos>/g, '<gml:pos/>')));

(async () => {
  const browser = await env.playwright.chromium.launch({ executablePath: env.chrome });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 950 } })).newPage();
  const errors = [], fails = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL); await page.waitForSelector('#drop');
  await page.setInputFiles('#file-input', [FILE]);
  await page.waitForFunction(() => window.__AIXM.S.files.every((f) => f.status === 'ready'));
  await page.evaluate(() => document.querySelector('#extract-btn').click());
  await page.waitForFunction(() => window.__AIXM.S.view === 'dash', null, { timeout: 60000 });
  // Quality tab: runs by itself
  await page.evaluate(() => window.__AIXM.go('quality'));
  await page.waitForSelector('.q-rules', { timeout: 60000 }).catch(() => fails.push('the Quality tab did not run the checks by itself'));
  const iss = await page.evaluate(() => (window.__AIXM.S.quality.get(window.__AIXM.S.datasets[0]) || []).map((i) => ({ sev: i.sev, rule: i.rule, msg: i.msg, p: i.p, detail: i.detail, f: i.rec && i.rec.k })));
  const want = [
    ['Position 0°N 0°E', 'error', 'AirportHeliport', /exactly 0° latitude/],
    ['Location indicator EADD used by 2 aerodromes', 'error', 'AirportHeliport', /Also used by/],
    ['Implausible field elevation', 'warning', 'AirportHeliport', /30000 M|30 000|98,425/],
    ['Implausible runway length', 'warning', 'Runway', /320000 M|320,000/],
    ['Lower limit above the upper limit', 'error', 'RouteSegment', /Upper FL 195, lower FL 250/]
  ];
  for (const [m, sev, k, det] of want) {
    const hit = iss.filter((i) => i.msg.indexOf(m) === 0 && i.f === k);
    if (!hit.length) fails.push('missing issue: ' + m);
    else if (hit[0].sev !== sev || !det.test(hit[0].detail)) fails.push('issue ' + m + ': ' + JSON.stringify(hit[0]));
  }
  if (iss.some((i) => !i.detail)) fails.push('every issue should say what was found / expected: ' + JSON.stringify(iss.filter((i) => !i.detail).slice(0, 3)));
  const tab = await page.evaluate(() => ({ kinds: [...document.querySelectorAll('.q-rules [data-qrule]')].map((x) => x.textContent), cols: [...document.querySelectorAll('.q-table th')].map((x) => x.textContent) }));
  if (!tab.kinds.some((k) => /^Position · \d/.test(k)) || !tab.cols.includes('Details: found / expected')) fails.push('Quality tab: kinds and details ' + JSON.stringify(tab));
  await page.click('.q-rules [data-qrule="Position"]'); await page.waitForTimeout(200);
  if (await page.evaluate(() => [...document.querySelectorAll('.q-table tbody tr')].some((tr) => !/Position/.test(tr.textContent)))) fails.push('a kind chip should filter the list');
  await page.screenshot({ path: OUT + '/quality.png' });
  // a row opens its AIP section: no list there, one quiet line with the number of issues and a link; no marks or badges
  await page.click('.q-table [data-qaip]'); await page.waitForTimeout(1200);
  const aip = await page.evaluate(() => ({ view: window.__AIXM.S.view, line: (document.querySelector('.q-link') || {}).textContent || '', box: !!document.querySelector('.q-box'), flags: document.querySelectorAll('.src.qflag').length, badges: document.querySelectorAll('.tree .qbadge').length }));
  if (aip.view !== 'aip' || !/\d+ data issues? in this section/.test(aip.line) || aip.box || aip.flags || aip.badges) fails.push('AIP: one quiet line, no list, no marks, no badges ' + JSON.stringify(aip).slice(0, 300));
  await page.screenshot({ path: OUT + '/aip.png' });
  // marking the values is an option
  await page.click('.q-link [data-qon]'); await page.waitForTimeout(400);
  const on = await page.evaluate(() => ({ flags: [...document.querySelectorAll('.src.qflag')].map((x) => x.title.split('\n')[0]), badges: document.querySelectorAll('.tree .qbadge').length }));
  if (!on.flags.some((t) => /DATA ISSUE \(error\) Position 0°N 0°E/.test(t)) || !on.badges) fails.push('"mark the values" should mark them: ' + JSON.stringify(on).slice(0, 300));
  await page.click('.q-link [data-qon]'); await page.waitForTimeout(400);
  if (await page.evaluate(() => document.querySelectorAll('.src.qflag').length)) fails.push('"mark the values" off should remove the marks');
  // the link opens the Quality tab on just the issues of this section; "show all" and "back" work
  await page.click('.q-link [data-qtab-go="sec"]'); await page.waitForTimeout(800);
  const qf = await page.evaluate(() => ({ view: window.__AIXM.S.view, banner: (document.querySelector('.q-focus') || {}).textContent || '', rows: document.querySelectorAll('.q-table tbody tr').length, all: (window.__AIXM.S.quality.get(window.__AIXM.S.datasets[0]) || []).length }));
  if (qf.view !== 'quality' || !/issue\(s\) of the AIP section/.test(qf.banner) || !qf.rows || qf.rows >= qf.all) fails.push('Quality tab on the issues of the section: ' + JSON.stringify(qf).slice(0, 300));
  await page.click('[data-qall]'); await page.waitForTimeout(300);
  if (await page.evaluate(() => !!document.querySelector('.q-focus'))) fails.push('"Show all issues"');
  await page.screenshot({ path: OUT + '/quality_section.png' });
  // thresholds without coordinates
  await page.goto(URL); await page.waitForSelector('#drop');
  await page.setInputFiles('#file-input', [NOTHR]);
  await page.waitForFunction(() => window.__AIXM.S.files.every((f) => f.status === 'ready'));
  await page.evaluate(() => document.querySelector('#extract-btn').click());
  await page.waitForFunction(() => window.__AIXM.S.view === 'dash', null, { timeout: 60000 });
  const thr = await page.evaluate(async () => (await ANALYSIS.quality(window.__AIXM.S.datasets[0])).filter((i) => /hreshold without coordinates/.test(i.msg)).length);
  if (!thr) fails.push('thresholds without coordinates should be flagged');
  await page.evaluate(() => window.__AIXM.go('map')); await page.waitForTimeout(1000);
  await page.evaluate(() => { const sel = document.querySelector('#map-adview'); const o = [...sel.options].find((x) => /^EADD/.test(x.textContent)); sel.value = o.value; sel.dispatchEvent(new Event('change')); });
  await page.waitForTimeout(800);
  const card = await page.evaluate(() => { const c = document.querySelector('#map-adcard'); return c && !c.classList.contains('hidden') ? c.textContent : ''; });
  if (!/RWY 09L\/27R|RWY 09L/.test(card) || !/Not in this data set: runway threshold positions/.test(card)) fails.push('airport view without threshold positions: ' + card.slice(0, 300));
  console.log(iss.length + ' issues; kinds: ' + tab.kinds.join(', ') + '; ' + thr + ' thresholds without coordinates');
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
  console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : 'data issues OK (Quality tab and AIP)');
  if (errors.length || fails.length) process.exitCode = 1;
  await browser.close();
})();
