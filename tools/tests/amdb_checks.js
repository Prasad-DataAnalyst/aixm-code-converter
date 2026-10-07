// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Aerodrome mapping (AMDB) checks, Digital data -> Aerodrome mapping (AMDB) -> AMDB checks:
// - nothing of the AMDB tools runs when the page opens or a file is read (stored, not run; loaded when opened);
// - on the AMDB test aerodromes (testdata/amdb_test_EAXB.xml, one or more defects per rule) every rule finds its
//   defect, in a worker, with the JSTS geometry engine; the findings are listed, mapped and open their feature;
// - the audit report is produced in PDF, Excel, CSV and JSON;
// - AIXM aerodrome features (Donlon) are checked too, without an AMXM file.
/* global AMDB */
const env = require('./_env');
const fs = require('fs');
const ROOT = env.ROOT, OUT = env.out('amdb_checks'), T = ROOT + '/testdata/';
const URL = 'file://' + ROOT + '/AIXM-Code-Converter.html';

(async () => {
  const browser = await env.playwright.chromium.launch({ executablePath: env.chrome });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [], fails = [];
  page.on('pageerror', (e) => errors.push(e.message));
  async function load(files) {
    await page.goto(URL); await page.waitForSelector('#drop');
    await page.setInputFiles('#file-input', files);
    await page.waitForFunction((n) => !window.__AIXM.S.adding && window.__AIXM.S.files.length >= n && window.__AIXM.S.files.every((f) => f.status !== 'checking'), files.length, { timeout: 30000 });
    await page.evaluate(() => document.querySelector('#extract-btn').click());
    await page.waitForFunction(() => window.__AIXM.S.view === 'dash' && window.__AIXM.S.files.every((f) => f.status !== 'parsing' && f.status !== 'indexing'), null, { timeout: 60000 });
  }
  async function download(sel) {
    const [d] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click(sel)]);
    const p = OUT + '/' + d.suggestedFilename(); await d.saveAs(p);
    return { name: d.suggestedFilename(), size: fs.statSync(p).size, path: p };
  }
  async function openChecks() {
    await page.evaluate(() => window.__AIXM.go('digital'));
    await page.click('[data-ddsec="amxm"]');
    await page.click('[data-amtab="checks"]');
    await page.waitForSelector('[data-amdbrun]', { timeout: 30000 });
    await page.click('[data-amdbrun]');
    await page.waitForSelector('.amdb-rules', { timeout: 60000 });
  }

  await load([T + 'amdb_test_EAXB.xml']);
  // stored, not run
  const idle = await page.evaluate(() => ({ amdb: typeof AMDB, ui: typeof window.AMDBUI, jsts: typeof window.jsts, blocks: ['src-amdb', 'src-amdbui', 'src-amdbpkg', 'lazy-jsts', 'lazy-sqljs', 'lazy-sqlwasm'].map((id) => { const n = document.getElementById(id); return n ? n.type : 'missing'; }) }));
  if (idle.amdb !== 'undefined' || idle.ui !== 'undefined' || idle.jsts !== 'undefined') fails.push('AMDB code ran before it was needed: ' + JSON.stringify(idle));
  if (idle.blocks.some((t) => t !== 'text/plain')) fails.push('AMDB blocks: ' + idle.blocks.join(', '));
  const sec = await page.evaluate(() => { window.__AIXM.go('digital'); const b = document.querySelector('[data-ddsec="amxm"]'); return b ? b.textContent : ''; });
  if (!/Aerodrome mapping \(AMDB\)/.test(sec)) fails.push('section title: ' + sec);
  await openChecks();
  const res = await page.evaluate(() => {
    const r = window.AMDBUI.latest(window.__AIXM.S.datasets), by = {};
    r.findings.forEach((x) => { by[x.r] = (by[x.r] || 0) + 1; });
    return { by, ran: r.ran, engine: r.engine, rules: AMDB.RULES.map((x) => x.id), rows: document.querySelectorAll('.amdb-find tbody tr').length, notice: (document.querySelector('.amdb-notice') || {}).textContent || '', jstsPage: typeof window.jsts };
  });
  const missing = res.rules.filter((id) => !res.by[id] && id !== 'AMDB-Q04'); // Q04: AIXM data only (below)
  if (missing.length) fails.push('rules that found nothing on the test aerodromes: ' + missing.join(', '));
  if (!/JSTS/.test(res.engine)) fails.push('geometry engine: ' + res.engine);
  if (res.jstsPage !== 'undefined') fails.push('JSTS ran in the page instead of the worker');
  if (!/NOT FOR NAVIGATION/.test(res.notice)) fails.push('notice: ' + res.notice);
  if (res.rows < 30) fails.push('findings listed: ' + res.rows);
  // the map shows the findings; a finding opens its feature
  const mapItems = await page.evaluate(() => { const el = document.querySelector('.amdb-map'); return el && el._ddmap ? el._ddmap.items.length : 0; });
  if (mapItems < 20) fails.push('map items: ' + mapItems);
  await page.click('.amdb-find tbody tr [data-amdbf="code"]');
  await page.waitForTimeout(400);
  const detail = await page.evaluate(() => { const d = document.getElementById('drawer'); return !!d && d.classList.contains('open') && /ServiceRoad|Runway|Taxiway|Apron|Stand|Stopway|Deicing|Survey|Vertical|Construction|Asrn|Water|Aerodrome|Hotspot|Guidance|Holding/i.test(d.textContent); });
  if (!detail) fails.push('the feature of a finding did not open');
  await page.keyboard.press('Escape');
  // filter by rule
  await page.click('[data-amdbrule="AMDB-X08"]');
  const x08 = await page.evaluate(() => Array.from(document.querySelectorAll('.amdb-find tbody tr td:nth-child(2)')).map((t) => t.textContent));
  if (!x08.length || x08.some((t) => t !== 'AMDB-X08')) fails.push('rule filter: ' + x08.join(','));
  await page.click('[data-amdbrule="AMDB-X08"]');
  // reports
  for (const f of ['pdf', 'xlsx', 'csv', 'json']) {
    const d = await download('[data-amdbrep="' + f + '"]');
    if (d.size < 2000) fails.push('report ' + f + ': ' + d.size + ' bytes');
    if (f === 'json') {
      const j = JSON.parse(fs.readFileSync(d.path, 'utf8'));
      if (!/NOT FOR NAVIGATION/.test(j.notice) || j.author !== 'Prasad Selvaraj' || j.findings.length < 30 || j.rules.length < 30) fails.push('JSON report content');
    }
  }
  await page.screenshot({ path: OUT + '/amdb_checks.png', fullPage: false });
  // Quality -> Aerodrome mapping (AMDB): the summary of the run, and the way back to the findings
  await page.evaluate(() => { window.__AIXM.S.qTab = 'amdb'; window.__AIXM.go('quality'); });
  const q = await page.evaluate(() => ({ rows: document.querySelectorAll('#main .mini-table tbody tr').length, btn: !!document.querySelector('#q-amdb-go') }));
  if (q.rows < 30 || !q.btn) fails.push('Quality summary: ' + JSON.stringify(q));
  await page.click('#q-amdb-go');
  await page.waitForSelector('.amdb-rules', { timeout: 30000 });

  // AIXM only (no AMXM file): the AIXM aerodrome features are checked as their AMXM counterparts
  await load([T + 'Donlon_ALL_Baseline_2025.xml', T + 'EA_AIP_DS_FULL_20170701.xml']);
  await openChecks();
  const ax = await page.evaluate(() => { const r = window.AMDBUI.latest(window.__AIXM.S.datasets); return { n: r.features, sets: r.sets.map((s) => s.kind), f: r.findings.length, q04: r.findings.filter((x) => x.r === 'AMDB-Q04').length }; });
  if (ax.n < 100 || !/AIXM/.test(ax.sets.join()) || !ax.f || !ax.q04) fails.push('AIXM aerodrome features: ' + JSON.stringify(ax));
  await page.click('[data-amtab="features"]');
  const feat = await page.evaluate(() => (document.querySelector('.am-body') || {}).textContent || '');
  if (!/No AMXM file loaded/.test(feat)) fails.push('Features tab without AMXM: ' + feat.slice(0, 120));

  if (errors.length) fails.push('page errors: ' + errors.join(' | '));
  await browser.close();
  if (fails.length) { console.error('FAIL amdb_checks\n - ' + fails.join('\n - ')); process.exit(1); }
  console.log('PASS amdb_checks (' + res.rules.length + ' rules, ' + Object.values(res.by).reduce((a, b) => a + b, 0) + ' findings on the test aerodromes; AIXM ' + ax.n + ' features)');
})().catch((e) => { console.error('FAIL amdb_checks', e); process.exit(1); });
