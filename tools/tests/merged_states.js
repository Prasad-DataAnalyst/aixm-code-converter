// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// All data sets in one AIXM file (Export, step 4) and back:
// - four data sets of four "States" in four AIXM versions (Donlon 5.1.1, Chicago runways 5.1, the AIXM 4.5 sample,
//   the AIXM 5.2 approach sample) written as one AIXM 5.1.1 file, named after what is in it; the file is well-formed
//   XML with one root and each part marked;
// - the file opened again: the file list shows its data sets, Extract gives the four data sets with their States and
//   features, line numbers and byte offsets point into the merged file, a part converts on its own;
// - the same file with bytes moved (edited): the parts are found by their comments;
// - files are named after their content (State, kind of data, version, AIRAC cycle), not after the source file.
const fs = require('fs');
const path = require('path');
const env = require('./_env');
const ROOT = env.ROOT, OUT = env.out('merged_states'), T = ROOT + '/testdata/';
const URL = 'file://' + ROOT + '/AIXM-Code-Converter.html';

(async () => {
  const browser = await env.playwright.chromium.launch({ executablePath: env.chrome });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [], fails = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  async function load(files, n) {
    await page.goto(URL); await page.waitForSelector('#drop');
    await page.setInputFiles('#file-input', files);
    await page.waitForFunction((k) => !window.__AIXM.S.adding && window.__AIXM.S.files.length >= k && window.__AIXM.S.files.every((f) => f.status !== 'checking'), files.length, { timeout: 30000 });
    await page.evaluate(() => document.querySelector('#extract-btn').click());
    await page.waitForFunction((k) => window.__AIXM.S.datasets.length >= k && window.__AIXM.S.files.every((f) => f.status !== 'parsing' && f.status !== 'indexing'), n || files.length, { timeout: 90000 });
  }
  async function download(click) {
    const [d] = await Promise.all([page.waitForEvent('download', { timeout: 90000 }), click()]);
    const p = path.join(OUT, d.suggestedFilename()); await d.saveAs(p);
    return { name: d.suggestedFilename(), p };
  }
  const sets = () => page.evaluate(() => window.__AIXM.S.datasets.map((d) => ({ state: d.state, name: d.name, n: d.recs.length, src: d.stateSource, version: d.version, part: d.part || null, range: d.range || null })));

  // four States in four AIXM versions
  const inputs = ['Donlon_ALL_Baseline_2025.xml', 'chicago_runways_51.xml', 'sample_aixm45_snapshot.xml', 'sample_52_iap.xml'];
  await load(inputs.map((f) => T + f));
  const before = await sets();
  console.log('loaded', before.map((d) => d.state + ' ' + d.n).join(' | '));
  await page.evaluate(() => window.__AIXM.go('export')); await page.waitForSelector('#mg');
  const card = await page.evaluate(() => ({ n: document.querySelectorAll('#mg [data-mg]').length, ver: document.querySelector('#mg-ver').value }));
  if (card.n !== 4 || card.ver !== '5.1.1') fails.push('merge card: ' + JSON.stringify(card));
  await page.locator('#mg').scrollIntoViewIfNeeded(); await page.screenshot({ path: OUT + '/export_step4.png' });
  const m = await download(() => page.click('#mg-go'));
  await page.waitForSelector('.modal'); const rep = await page.evaluate(() => document.querySelector('.modal').innerText);
  await page.evaluate(() => document.querySelector('.modal-back').remove());
  console.log('merged file', m.name);
  // three States (two data sets are of the United States): their names, the AIRAC cycles differ
  if (m.name !== 'REPUBLIC-OF-DONLON-United-States-FRANCE_merged_AIXM-5.1.1.xml') fails.push('merged file name: ' + m.name);
  if (!/4 data sets in one AIXM 5\.1\.1 file/.test(rep) || !/Part 3 · FRANCE/.test(rep)) fails.push('report: ' + rep.slice(0, 400));
  const xml = fs.readFileSync(m.p, 'utf8');
  if ((xml.match(/<!-- AIXM-CC-PART \d of 4 \|/g) || []).length !== 4 || (xml.match(/<message:AIXMBasicMessage\b/g) || []).length !== 1) fails.push('parts or root in the merged file');
  const wf = await page.evaluate((t) => { const d = new DOMParser().parseFromString(t, 'application/xml'); const e = d.getElementsByTagName('parsererror')[0]; return e ? e.textContent.slice(0, 200) : 'ok'; }, xml);
  if (wf !== 'ok') fails.push('merged file is not well-formed XML: ' + wf);

  // the file opened again: one data set per State
  async function reopen(p, label) {
    await page.goto(URL); await page.waitForSelector('#drop');
    await page.setInputFiles('#file-input', [p]);
    await page.waitForFunction(() => !window.__AIXM.S.adding && window.__AIXM.S.files.length && window.__AIXM.S.files.every((f) => f.status !== 'checking'), null, { timeout: 30000 });
    const chip = await page.evaluate(() => (document.querySelector('#filelist .fileitem') || {}).innerText || '');
    if (!/4 data sets in one file/.test(chip)) fails.push(label + ': file list does not show the 4 data sets: ' + chip.slice(0, 200));
    if (label === 'merged') await page.screenshot({ path: OUT + '/files_merged.png' });
    await page.evaluate(() => document.querySelector('#extract-btn').click());
    await page.waitForFunction(() => window.__AIXM.S.datasets.length >= 4 && window.__AIXM.S.files.every((f) => f.status !== 'parsing' && f.status !== 'indexing'), null, { timeout: 90000 });
    const after = await sets();
    console.log(label, after.map((d) => d.state + ' ' + d.n + ' (' + (d.part && d.part.k) + ')').join(' | '));
    after.forEach((d, i) => {
      const b = before[i], want = b.state === 'FRANCE' ? 40 : b.n; // AIXM 4.5: the features with an AIXM 5 equivalent
      if (d.state !== b.state || d.n !== want || !/several States/.test(d.src) || !d.part || d.part.k !== i + 1) fails.push(label + ' part ' + (i + 1) + ': ' + JSON.stringify(d) + ' expected ' + b.state + ' ' + want);
    });
    // line numbers and byte offsets of features in every part point into the merged file
    const recs = await page.evaluate(() => window.__AIXM.S.datasets.map((d) => d.recs.filter((r, i) => i % 7 === 0).map((r) => ({ k: r.k, line: r.line, o: r.o }))));
    const text = fs.readFileSync(p, 'utf8'), lines = text.split('\n'), bytes = fs.readFileSync(p);
    let bad = 0;
    recs.forEach((list) => list.forEach((r) => { if (!new RegExp('<[\\w.-]*:?' + r.k + '\\b').test(lines[r.line - 1] || '') || bytes[r.o] !== 0x3c) bad++; }));
    if (bad) fails.push(label + ': ' + bad + ' feature(s) with a wrong line or byte offset');
    return after;
  }
  await reopen(m.p, 'merged');
  await page.evaluate(() => window.__AIXM.go('dash'));
  const dash = await page.evaluate(() => document.querySelector('#ds-grid').innerText);
  if (dash.indexOf('part 1 of 4 of ' + m.name) < 0) fails.push('dashboard does not say where the data set was read from');

  // one part on its own: version conversion and GeoJSON, named after the content
  await page.evaluate(() => { window.__AIXM.S.active = 0; window.__AIXM.go('export'); }); await page.waitForSelector('#cv-target');
  await page.selectOption('#cv-target', '5.2');
  const c52 = await download(() => page.click('[data-cv="ver"]'));
  await page.evaluate(() => { const b = document.querySelector('.modal-back'); if (b) b.remove(); });
  const x52 = fs.readFileSync(c52.p, 'utf8');
  const wf52 = await page.evaluate((t) => { const d = new DOMParser().parseFromString(t, 'application/xml'); return d.getElementsByTagName('parsererror').length ? 'error' : d.documentElement.localName; }, x52);
  const members = (x52.match(/<message:hasMember\b/g) || []).length;
  console.log('part 1 converted', c52.name, members, 'members', wf52);
  if (c52.name !== 'REPUBLIC-OF-DONLON_AIP_AIXM-5.2_AIRAC2511.xml') fails.push('converted part file name: ' + c52.name);
  if (wf52 !== 'AIXMBasicMessage' || members !== before[0].n || /FRANCE|AIXM-CC-PART 2/.test(x52) || !/aixm\.aero\/schema\/5\.2"/.test(x52)) fails.push('part 1 converted on its own: ' + wf52 + ', ' + members + ' members');
  const gj = await download(() => page.click('[data-cv="geojson"]'));
  if (gj.name !== 'REPUBLIC-OF-DONLON_AIP_AIRAC2511.geojson') fails.push('GeoJSON file name: ' + gj.name);

  // the same file edited (bytes moved): the parts are found by their comments
  const edited = path.join(OUT, 'edited_' + m.name);
  fs.writeFileSync(edited, xml.replace('\n', '\n<!-- edited after it was written: the byte list in the header no longer fits -->\n'));
  await reopen(edited, 'edited');

  // file names of other exports say what is in them
  await load([T + 'Donlon_ALL_Baseline_2025.xml']);
  await page.evaluate(() => window.__AIXM.go('export')); await page.waitForSelector('#xp');
  await page.check('input[name="scope"][value="ads"]');
  await page.evaluate(() => { const cb = [...document.querySelectorAll('.ad-pick')].find((c) => /EADD/.test(c.parentNode.textContent)); cb.checked = true; });
  const js = await download(() => page.click('[data-exp="json"]'));
  if (js.name !== 'REPUBLIC-OF-DONLON_EADD_AD_AIRAC2511.json') fails.push('selected aerodromes JSON name: ' + js.name);
  await page.check('#xp-ads input[data-code="EADD"]');
  await page.click('.xp-qp:text-is("Runway characteristics")');
  const sel = await download(() => page.click('[data-xf="aixm"]'));
  await page.evaluate(() => { const b = document.querySelector('.modal-back'); if (b) b.remove(); });
  if (!/^REPUBLIC-OF-DONLON_EADD_AD2\.[\d.-]+(AD2\.[\d.]+)*_AIXM-5\.1\.1_AIRAC2511\.xml$/.test(sel.name) && !/^REPUBLIC-OF-DONLON_EADD_\d+-AD-items_AIXM-5\.1\.1_AIRAC2511\.xml$/.test(sel.name)) fails.push('selection AIXM name: ' + sel.name);
  console.log('names:', js.name, '|', sel.name);

  await browser.close();
  if (errors.length) { console.log('page errors:', errors); process.exit(1); }
  if (fails.length) { console.log('FAIL', fails); process.exit(1); }
  console.log('PASS merged_states: 4 States in one AIXM 5.1.1 file and back, parts found after editing, content-based file names');
})().catch((e) => { console.error(e); process.exit(1); });
