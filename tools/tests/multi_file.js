// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// One AIRAC data set delivered as several files: the Donlon sample is split into one file per feature group plus a
// difference file and a checksum list (as some States deliver), zipped with schema XML. The files must show as one
// item, checksums verified, extract as ONE data set with every reference between files resolved, duplicated time
// slices kept once, a feature whose validity ended shown as withdrawn (not in the AIP), identifiers that are not
// hexadecimal UUIDs resolved, the AIRAC cycle taken from a local-midnight effective time (16:00Z), the XML code view
// opening the right file, Separate / Combine, the saved copy reused, and the version conversion giving a zip.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const env = require('./_env');
const fflate = require(path.join(env.ROOT, 'tools', 'node_modules', 'fflate'));
const ROOT = env.ROOT, OUT = env.out('multi_file');
const URL = 'file://' + ROOT + '/AIXM-Code-Converter.html';
const SRC = ROOT + '/testdata/Donlon_ALL_Baseline_2025.xml';

// ---- build the delivery from the Donlon sample
const txt = fs.readFileSync(SRC, 'utf8');
const first = txt.indexOf('<message:hasMember>'), endTag = txt.lastIndexOf('</message:AIXMBasicMessage>');
const head = txt.slice(0, first), foot = txt.slice(endTag);
const blocks = txt.slice(first, endTag).split('</message:hasMember>').filter((b) => b.includes('<message:hasMember>')).map((b) => b.trim() + '\n    </message:hasMember>\n');
const typeOf = (b) => /<aixm:(\w+) gml:id/.exec(b)[1];
const GROUPS = [['AirportHeliport', /^(AirportHeliport|AirportHeliportCollocation)$/], ['Runway', /^(Runway|RunwayDirection|RunwayElement|RunwayCentrelinePoint|RunwayMarking|RunwayDirectionLightSystem|RunwayProtectArea)/],
  ['Navaid', /^(Navaid|VOR|DME|NDB|TACAN|Localizer|Glidepath|MarkerBeacon)$/], ['Airspace', /^Airspace$/], ['RouteSegment', /^(Route|RouteSegment)$/],
  ['DesignatedPoint', /^DesignatedPoint$/], ['Unit', /^(Unit|OrganisationAuthority|AirTrafficControlService|InformationService|RadioCommunicationChannel|Service)$/], ['Taxiway', /./]];
const files = {};
for (const b of blocks) { const k = typeOf(b), g = GROUPS.find((x) => x[1].test(k))[0]; (files[g] = files[g] || []).push(b); }
const NAME = (g, v) => 'XD_AIP-DS_' + g + '_' + v + '_EFF202510291600_AIRAC_V0.xml';
// an equipment identifier that is not a hexadecimal UUID (derived from its navaid, as some States do)
const vor = blocks.find((b) => typeOf(b) === 'VOR'), vorId = /<gml:identifier[^>]*>([^<]+)</.exec(vor)[1], vorNew = vorId.slice(0, -3) + 'vor';
// the VOR is published without coordinates (as some States do): it takes the position of its navaid
const vorNoPos = vor.replace(/<aixm:location>[\s\S]*?<\/aixm:location>/, '<aixm:location xsi:nil="true" nilReason="unknown"/>');
files.Navaid = files.Navaid.map((b) => (b === vor ? vorNoPos : b));
// difference file: a re-issued designated point (old slice + the same new slice) and one whose validity ended
const dp = files.DesignatedPoint.find((b) => (b.match(/<aixm:DesignatedPointTimeSlice /g) || []).length === 1);
const dpSlice = /<aixm:timeSlice>[\s\S]*<\/aixm:timeSlice>/.exec(dp)[0];
const oldSlice = dpSlice.replace(/<gml:beginPosition>[^<]*<\/gml:beginPosition>/, '<gml:beginPosition>2025-05-01T00:00:00Z</gml:beginPosition>')
  .replace(/<gml:endPosition[^>]*\/>|<gml:endPosition[^>]*>[^<]*<\/gml:endPosition>/, '<gml:endPosition>2025-11-01T00:00:00Z</gml:endPosition>').replace(/gml:id="([^"]+)"/g, 'gml:id="$1-old"');
const reissued = dp.replace(dpSlice, oldSlice + '\n' + dpSlice);
const goneId = '0f0e0d0c-0b0a-4999-8888-777766665555';
const gone = dp.replace(dpSlice, oldSlice).replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, goneId).replace(/<aixm:designator>[^<]*</, '<aixm:designator>WDRWN<');
const zipFiles = {}, sums = [];
function add(rel, content) {
  content = content.split(vorId).join(vorNew);
  zipFiles[rel] = Buffer.from(content, 'utf8');
  sums.push({ rel, sha: crypto.createHash('sha256').update(zipFiles[rel]).digest('hex') });
}
for (const g of Object.keys(files)) add('Baseline/' + NAME(g, 'BASELINE'), head + files[g].join('') + foot);
add('Difference/' + NAME('DesignatedPoint', 'DIFF-BL'), head + reissued + gone + foot);
const N = sums.length;
zipFiles['checksum.xml'] = Buffer.from('<?xml version="1.0" encoding="UTF-8"?><cs:datasetChecksum xmlns:cs="urn:test:checksum" xmlns:ds="urn:test:meta"><ds:datasetMeta><ds:uid>3f6c1c2e-0000-4000-8000-000000000001</ds:uid>' +
  '<ds:product>AIP-DS</ds:product><ds:effectiveTime>2025-10-29T16:00:00Z</ds:effectiveTime><ds:version>V0</ds:version></ds:datasetMeta><cs:files>' +
  sums.map((s) => '<cs:file><cs:filename>' + s.rel + '</cs:filename><cs:sha256sum>' + s.sha + '</cs:sha256sum></cs:file>').join('') + '</cs:files></cs:datasetChecksum>');
zipFiles['schema/resources/codelists.xml'] = Buffer.from('<?xml version="1.0"?><CT_CodelistCatalogue xmlns="http://www.isotc211.org/2005/gmx"/>');
const ZIP = path.join(OUT, 'XD_AIP-DS_delivery.zip');
fs.writeFileSync(ZIP, fflate.zipSync(Object.fromEntries(Object.entries(zipFiles).map(([k, v]) => [k, new Uint8Array(v)]))));

(async () => {
  const browser = await env.playwright.chromium.launch({ executablePath: env.chrome });
  const errors = [], fails = [];
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  async function load() {
    await page.goto(URL); await page.waitForSelector('#drop');
    await page.setInputFiles('#file-input', [ZIP]);
    await page.waitForFunction((n) => window.__AIXM.S.files.length === n && window.__AIXM.S.files.every((f) => f.status === 'ready'), N, { timeout: 30000 });
  }
  // the reference: Donlon read as a single file
  await page.goto(URL); await page.waitForSelector('#drop');
  await page.setInputFiles('#file-input', [SRC]);
  await page.waitForFunction(() => window.__AIXM.S.files.every((f) => f.status === 'ready'));
  await page.evaluate(() => document.querySelector('#extract-btn').click());
  await page.waitForFunction(() => window.__AIXM.S.view === 'dash', null, { timeout: 60000 });
  const unresolved = () => { const d = window.__AIXM.S.datasets[0]; let n = 0; d.recs.forEach((r) => { if (!r.cur.gone) MODEL.eachRef(r.cur.p, (ref) => { if (!MODEL.target(d, ref)) n++; }); }); return n; };
  const ref = await page.evaluate((u) => { const d = window.__AIXM.S.datasets[0]; return { n: d.recs.length, unresolved: eval('(' + u + ')')() }; }, unresolved.toString());

  // the delivery: one item, checksums verified, other XML left out
  await load();
  await page.waitForFunction(() => /of \d+ files match/.test(document.querySelector('#filelist').textContent), null, { timeout: 15000 }).catch(() => fails.push('checksums not verified'));
  const list = await page.evaluate(() => ({ cards: document.querySelectorAll('#filelist .fileitem').length, sets: document.querySelectorAll('#filelist .fileset').length, txt: document.querySelector('#filelist').textContent, toast: document.body.textContent }));
  if (list.cards !== 1 || list.sets !== 1) fails.push('expected one item for the delivery, got ' + list.cards + ' items');
  if (!list.txt.includes(N + ' files → one data set') || !list.txt.includes(N + ' of ' + N + ' files match')) fails.push('delivery card text: ' + list.txt.slice(0, 200));
  if (!/1 other XML file/.test(list.toast)) fails.push('the schema XML should be left out with a note');
  await page.screenshot({ path: OUT + '/files.png' });

  // Separate, then Combine again
  await page.click('[data-split]');
  if (await page.locator('#filelist .fileitem').count() !== N) fails.push('Separate should list the ' + N + ' files one by one');
  await page.click('#join-btn');
  if (await page.locator('#filelist .fileset').count() !== 1) fails.push('Combine should make them one data set again');

  // extract: one data set
  await page.evaluate(() => document.querySelector('#extract-btn').click());
  await page.waitForFunction(() => window.__AIXM.S.view === 'dash', null, { timeout: 120000 });
  const r = await page.evaluate(([u, vorNew, goneId, dpId]) => {
    const S = window.__AIXM.S, d = S.datasets[0];
    const vor = d.byId.get(vorNew), nav = d.recs.find((x) => x.k === 'Navaid' && JSON.stringify(x.cur.p).includes(vorNew));
    const g = d.byId.get(goneId), dp = d.byId.get(dpId);
    const cc = ANALYSIS.cycleChanges(d, AX.airac(Date.UTC(2025, 9, 31)));
    return { sets: S.datasets.length, files: d.files && d.files.length, n: d.recs.length, state: d.state, airac: d.airac && d.airac.id, exact: d.airac && d.airac.exact, effSrc: d.effectiveSource,
      unresolved: eval('(' + u + ')')(), vor: !!vor, navLinked: !!nav && nav.refs.some((x) => x[1] === vor), gone: !!g && !!g.cur.gone, goneListed: (d.byType.DesignatedPoint || []).includes(g),
      withdrawnEv: ANALYSIS.inFileChanges(d).some((e) => e.rec === g && /withdrawn/.test(e.kind)), dpSlices: dp && dp.ts.length, dpOcc: dp && dp.occ && dp.occ.length,
      reissued: cc.reissued, tile: document.querySelector('.ds-card .kpis').textContent,
      vorPos: !!vor && MODEL.posFromNavaid(d, vor) && JSON.stringify(MODEL.pointOf(d, vor)) === JSON.stringify(MODEL.pointOf(d, MODEL.navaidOf(d, vor))) };
  }, [unresolved.toString(), vorNew, goneId, /<gml:identifier[^>]*>([^<]+)</.exec(dp)[1]]);
  if (r.sets !== 1 || r.files !== N) fails.push('expected 1 data set from ' + N + ' files: ' + JSON.stringify(r));
  if (r.n !== ref.n + 1) fails.push('features: ' + r.n + ', expected ' + (ref.n + 1) + ' (the sample plus one withdrawn point)');
  if (r.unresolved !== ref.unresolved) fails.push('references between files: ' + r.unresolved + ' unresolved, single file has ' + ref.unresolved);
  if (!/donlon/i.test(r.state)) fails.push('State: ' + r.state);
  if (r.airac !== '2511' || !r.exact || !/checksum list/.test(r.effSrc)) fails.push('AIRAC from the local-midnight effective time: ' + r.airac + ' exact ' + r.exact + ' ' + r.effSrc);
  if (!/30 OCT 2025/.test(r.tile)) fails.push('effective date should show the AIRAC date (local midnight): ' + r.tile);
  if (!r.vor || !r.navLinked) fails.push('non-hexadecimal equipment identifier not resolved');
  if (!r.gone || r.goneListed || !r.withdrawnEv) fails.push('withdrawn point: gone ' + r.gone + ', listed ' + r.goneListed + ', change event ' + r.withdrawnEv);
  if (r.dpSlices !== 2 || r.dpOcc !== 2) fails.push('re-issued point: ' + r.dpSlices + ' time slices (2 expected, the duplicate kept once), ' + r.dpOcc + ' file occurrences');
  if (!(r.reissued >= 1)) fails.push('the unchanged re-issue should be counted apart');
  if (!r.vorPos) fails.push('equipment without coordinates should take the position of its navaid');
  await page.screenshot({ path: OUT + '/dashboard.png' });

  // the XML code view opens the file the feature came from
  const xv = await page.evaluate(() => { const d = window.__AIXM.S.datasets[0], rw = d.byType.Runway[0]; window.__AIXM.openXml(d, rw); return rw.id; });
  await page.waitForFunction(() => document.querySelector('#drawer pre.xml'), null, { timeout: 10000 }).catch(() => fails.push('XML view did not open'));
  const dr = await page.evaluate(() => ({ file: document.querySelector('#drawer .loc-grid span').textContent, xml: document.querySelector('#drawer pre.xml').textContent }));
  if (dr.file !== NAME('Runway', 'BASELINE') || !dr.xml.includes(xv)) fails.push('XML view: file ' + dr.file + ', contains feature ' + dr.xml.includes(xv));
  await page.keyboard.press('Escape');

  // version conversion: every file converted, one zip
  await page.evaluate(() => window.__AIXM.go('export')); await page.waitForTimeout(300);
  await page.selectOption('#cv-target', '5.2');
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('[data-cv="ver"]')]);
  const zp = path.join(OUT, dl.suggestedFilename()); await dl.saveAs(zp);
  const conv = Object.keys(fflate.unzipSync(new Uint8Array(fs.readFileSync(zp))));
  if (!/\.zip$/.test(zp) || conv.length !== N || !conv.every((n) => /_AIXM-5\.2\.xml$/.test(n))) fails.push('conversion zip: ' + conv.length + ' files ' + conv.slice(0, 2).join(', '));
  await page.keyboard.press('Escape');

  // the saved copy is reused when the same files are opened again
  await page.waitForFunction(() => window.__AIXM.LIB.cached.size > 0 && [...window.__AIXM.LIB.cached].some((k) => k.indexOf('set:') === 0), null, { timeout: 30000 }).catch(() => fails.push('the data set was not saved'));
  await load();
  await page.evaluate(() => document.querySelector('#extract-btn').click());
  await page.waitForFunction(() => window.__AIXM.S.view === 'dash', null, { timeout: 60000 });
  const again = await page.evaluate(() => { const d = window.__AIXM.S.datasets[0]; return { n: window.__AIXM.S.datasets.length, files: d.files && d.files.length, airac: d.airac && d.airac.id, exact: d.airac && d.airac.exact }; });
  const card = await page.evaluate(() => window.__AIXM.S.sets && Object.values(window.__AIXM.S.sets).map((g) => g.detail || '').join(' '));
  if (again.n !== 1 || again.files !== N || !/saved data/.test(card)) fails.push('saved copy not reused: ' + JSON.stringify({ n: again.n, files: again.files, card }));
  if (again.airac !== '2511' || !again.exact) fails.push('the saved copy should keep the AIRAC cycle: ' + again.airac + ' exact ' + again.exact);

  // files of the delivery added in two goes, extracting in between: still one data set (one entry on the map)
  const loose = Object.keys(zipFiles).filter((k) => /\.xml$/.test(k) && k !== 'checksum.xml' && !k.startsWith('schema/')).map((k) => { const p = path.join(OUT, path.basename(k)); fs.writeFileSync(p, zipFiles[k]); return p; });
  await page.goto(URL); await page.waitForSelector('#drop');
  for (const part of [loose.slice(0, 3), loose.slice(3)]) {
    await page.setInputFiles('#file-input', part);
    await page.waitForFunction(() => window.__AIXM.S.files.every((f) => f.status === 'ready' || f.status === 'done'), null, { timeout: 30000 });
    await page.evaluate(() => window.__AIXM.go('files')); await page.waitForTimeout(200);
    await page.evaluate(() => document.querySelector('#extract-btn').click());
    await page.waitForFunction(() => window.__AIXM.S.view === 'dash', null, { timeout: 60000 });
  }
  await page.evaluate(() => window.__AIXM.go('map')); await page.waitForTimeout(1200);
  const two = await page.evaluate(() => ({ n: window.__AIXM.S.datasets.length, files: window.__AIXM.S.datasets[0].files && window.__AIXM.S.datasets[0].files.length, mapList: !!document.querySelector('#map-dsl') }));
  if (two.n !== 1 || two.files !== loose.length || two.mapList) fails.push('files added in two goes should give one data set and one map entry: ' + JSON.stringify(two));

  // one AIXM file for the cycle: written from the delivery, read again: the same current features and references
  await page.goto(URL); await page.waitForSelector('#drop');
  await page.setInputFiles('#file-input', [ZIP]);
  await page.waitForFunction((n) => window.__AIXM.S.files.length === n && window.__AIXM.S.files.every((f) => f.status === 'ready'), N, { timeout: 30000 });
  await page.evaluate(() => document.querySelector('#extract-btn').click());
  await page.waitForFunction(() => window.__AIXM.S.view === 'dash', null, { timeout: 120000 });
  const live = () => { const d = window.__AIXM.S.datasets[0], t = {}; d.recs.forEach((x) => { if (!x.cur.gone) t[x.k] = (t[x.k] || 0) + 1; }); return { types: t, live: d.recs.filter((x) => !x.cur.gone).length }; };
  const before = await page.evaluate(live);
  await page.evaluate(() => window.__AIXM.go('export')); await page.waitForTimeout(300);
  const [one] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('[data-cv="cycle"]')]);
  const onePath = path.join(OUT, one.suggestedFilename()); await one.saveAs(onePath);
  const rep1 = await page.evaluate(() => document.querySelector('.modal-body').textContent);
  if (!/withdrawn feature\(s\) left out/.test(rep1) || !/delivered twice/.test(rep1)) fails.push('one-file report: ' + rep1.slice(0, 300));
  const oneTxt = fs.readFileSync(onePath, 'utf8');
  if (oneTxt.includes(goneId)) fails.push('the withdrawn feature should not be in the one-file export');
  await page.goto(URL); await page.waitForSelector('#drop');
  await page.setInputFiles('#file-input', [onePath]);
  await page.waitForFunction(() => window.__AIXM.S.files.every((f) => f.status === 'ready'), null, { timeout: 30000 });
  await page.evaluate(() => document.querySelector('#extract-btn').click());
  await page.waitForFunction(() => window.__AIXM.S.view === 'dash', null, { timeout: 120000 });
  const after = await page.evaluate(live), un1 = await page.evaluate((u) => eval('(' + u + ')')(), unresolved.toString());
  if (after.live !== before.live || JSON.stringify(after.types) !== JSON.stringify(before.types)) fails.push('one-file export differs: ' + before.live + ' -> ' + after.live + ' features');
  if (un1 !== ref.unresolved) fails.push('one-file export: ' + un1 + ' unresolved references, the sample has ' + ref.unresolved);

  // the library: a State folder with the delivery in sub-folders shows one entry and opens one data set (the browser's
  // private file system stands in for the folder; it needs a web address, so the page is served locally)
  const srv = require('http').createServer((q, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(fs.readFileSync(ROOT + '/AIXM-Code-Converter.html')); }).listen(8766);
  await page.goto('http://localhost:8766/'); await page.waitForSelector('#drop');
  const libFiles = Object.keys(zipFiles).filter((k) => /\.xml$/.test(k) && k !== 'checksum.xml' && !k.startsWith('schema/')).map((k) => [k, zipFiles[k].toString('utf8')]);
  await page.evaluate(async (list) => {
    const root = await navigator.storage.getDirectory();
    for await (const name of root.keys()) await root.removeEntry(name, { recursive: true });
    const st = await root.getDirectoryHandle('Testland', { create: true });
    for (const [rel, txt] of list) {
      const [dir, name] = rel.split('/');
      const d = await st.getDirectoryHandle(dir, { create: true }), fh = await d.getFileHandle(name, { create: true }), w = await fh.createWritable();
      await w.write(txt); await w.close();
    }
    await window.__AIXM.useHandle(root); window.__AIXM.go('library');
  }, libFiles);
  await page.waitForFunction(() => /one data set/.test(document.body.textContent), null, { timeout: 30000 }).catch(() => fails.push('library: the delivery is not shown as one entry'));
  const lib = await page.evaluate(() => ({ entries: document.querySelectorAll('.lib-card [data-open]').length, txt: document.querySelector('.lib-card').textContent }));
  if (lib.entries !== 1 || !lib.txt.includes(N + ' files · one data set')) fails.push('library entries: ' + lib.entries + ' ' + lib.txt.slice(0, 160));
  await page.click('.lib-card [data-open]');
  await page.waitForFunction(() => window.__AIXM.S.datasets.length === 1 && window.__AIXM.S.view === 'dash', null, { timeout: 120000 }).catch(() => fails.push('library: delivery did not open'));
  const libDs = await page.evaluate(() => { const d = window.__AIXM.S.datasets[0]; return d ? { files: d.files && d.files.length, state: d.state, n: d.recs.length } : null; });
  if (!libDs || libDs.files !== N || libDs.state !== 'Testland' || libDs.n !== r.n) fails.push('library delivery: ' + JSON.stringify(libDs));
  await page.evaluate(async () => { LIBRARY.forget(); const root = await navigator.storage.getDirectory(); for await (const name of root.keys()) await root.removeEntry(name, { recursive: true }); });
  srv.close();

  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
  console.log(fails.length ? 'FAIL:\n  ' + fails.join('\n  ') : 'multi-file data set OK (' + N + ' files, ' + r.n + ' features)');
  if (errors.length || fails.length) process.exitCode = 1;
  await browser.close();
})();
