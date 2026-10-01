// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
const { chromium } = require('./_env').playwright;
const ROOT = require('./_env').ROOT;
(async () => {
  const browser = await chromium.launch({ executablePath: require('./_env').chrome });
  const page = await (await browser.newContext()).newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + ROOT + '/AIXM-Code-Converter.html'); await page.waitForSelector('#drop');
  const files = ['testdata/Donlon_ALL_Baseline_2025.xml', 'testdata/chicago_airspace_crs84_51.xml', 'testdata/sample_52_iap.xml', 'testdata/sample_aixm45_snapshot.xml', 'testdata/digital_notam/DN_NAV.UNS_1_VOR-DME_all_components_unserviceable.xml'].map((f) => ROOT + '/' + f);
  await page.setInputFiles('#file-input', files);
  await page.waitForFunction((n) => window.__AIXM.S.files.filter((f) => f.status === 'ready').length === n, files.length);
  await page.click('#extract-btn');
  await page.waitForFunction(() => window.__AIXM.S.view === 'dash', null, { timeout: 60000 });
  console.log((await page.evaluate(() => window.__AIXM.S.datasets.map((d) => d.name + ' => ' + d.state + '  (' + d.stateSource + ')'))).join('\n'));
  console.log(errors.join('\n') || 'no errors'); if (errors.length) process.exitCode = 1; await browser.close();
})();
