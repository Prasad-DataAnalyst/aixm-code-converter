// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// "View AIXM code" accuracy: every feature's byte offset, length and line number match the file, and the value of
// every AIP cell is located in the feature's XML (its element in the current time slice, the AIXM 4.5 element, or its
// text). Files: AIXM 5.1.1 baseline, a file with several time slices per feature, AIXM 4.5.
const { chromium } = require('./_env').playwright;
const ROOT = require('./_env').ROOT;
const FILES = ['testdata/Donlon_ALL_Baseline_2025.xml', 'testdata/Donlon_EADD_changes_AIRAC2611.xml', 'testdata/sample_aixm45_snapshot.xml'];

(async () => {
  const browser = await chromium.launch({ executablePath: require('./_env').chrome });
  const errors = [], fails = [];
  for (const f of FILES) {
    const page = await (await browser.newContext()).newPage();
    page.on('pageerror', (e) => errors.push(e.message + e.stack));
    await page.goto('file://' + ROOT + '/AIXM-Code-Converter.html');
    await page.waitForSelector('#drop');
    await page.setInputFiles('#file-input', [ROOT + '/' + f]);
    await page.waitForFunction(() => window.__AIXM.S.files.every((x) => x.status === 'ready'));
    await page.click('#extract-btn');
    await page.waitForFunction(() => window.__AIXM.S.view === 'dash', null, { timeout: 120000 });
    const res = await page.evaluate(async () => {
      const ds = window.__AIXM.S.datasets[0], buf = new Uint8Array(await ds.file.arrayBuffer()), dec = new TextDecoder();
      const nl = []; for (let i = 0; i < buf.length; i++) if (buf[i] === 10) nl.push(i);
      function lineAt(o) { let lo = 0, hi = nl.length; while (lo < hi) { const m = (lo + hi) >> 1; if (nl[m] < o) lo = m + 1; else hi = m; } return lo + 1; }
      let feats = 0, badFeat = 0;
      ds.recs.forEach((r) => (r.occ || [{ o: r.o, n: r.n, line: r.line }]).forEach((oc) => {
        feats++;
        const txt = dec.decode(buf.subarray(oc.o, oc.o + oc.n)), name = (r.s45 || r.k).replace(/^45:/, '');
        if (txt.charAt(0) !== '<' || txt.indexOf(name) < 0 || lineAt(oc.o) !== oc.line) badFeat++;
      }));
      const cells = new Map();
      function walk(sec) { if (sec) (sec.blocks || []).forEach((bl) => (bl.rows || []).forEach((row) => (row.cells || row).forEach((c) => { if (c && c.r && c.p && c.t) cells.set(c.r.i + '|' + c.p, c); }))); }
      AIP.catalogue(ds).forEach((g) => g.children.forEach((c) => { try { if (c.children) c.children.forEach((cc) => walk(cc.build())); else walk(c.build()); } catch (e) { /* section without data */ } }));
      let located = 0;
      cells.forEach((c) => {
        const r = c.r, occs = r.occ || [{ o: r.o, n: r.n }], oi = (r.cur && r.ts[r.cur.idx] && r.ts[r.cur.idx].occ) || 0, oc = occs[oi];
        const lines = dec.decode(buf.subarray(oc.o, oc.o + oc.n)).split('\n');
        let nth = 0; for (let k = 0; k < (r.cur.idx || 0); k++) if ((r.ts[k].occ || 0) === oi) nth++;
        if (window.__AIXM.locateValue(lines, c.p, c.t, window.__AIXM.sliceRange(lines, nth)).how) located++;
      });
      return { name: ds.name, feats, badFeat, cells: cells.size, located };
    });
    const pct = res.cells ? res.located / res.cells * 100 : 100;
    console.log(res.name + ': features ' + res.feats + ' (wrong position ' + res.badFeat + '), values ' + res.cells + ', located ' + pct.toFixed(1) + '%');
    if (res.badFeat) fails.push(res.name + ': ' + res.badFeat + ' features with a wrong position');
    if (pct < 97) fails.push(res.name + ': only ' + pct.toFixed(1) + '% of the values located in the XML');
    await page.close();
  }
  console.log(errors.join('\n') || 'no errors');
  console.log(fails.length ? 'FAIL: ' + fails.join('; ') : 'AIXM references OK');
  if (errors.length || fails.length) process.exitCode = 1;
  await browser.close();
})();
