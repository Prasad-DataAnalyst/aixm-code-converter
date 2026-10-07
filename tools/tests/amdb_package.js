// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Aerodrome mapping package, Digital data -> Aerodrome mapping (AMDB) -> Build package:
// - the build needs the NOT FOR NAVIGATION acknowledgement; a full export writes every format;
// - every file of the zip is checked: PACKAGE.json / SHA256SUMS.txt match the files, the AMXM file is AMXM 2.0 with
//   the ISO 19115 metadata inside and reads back with the same features, the GeoPackage is an OGC GeoPackage
//   (application id, tables, geometry header, metadata), GeoJSON / KML / Shapefile / DXF / Excel / PDF are what
//   they say, the report says what is inside and how it was made, the notice and the credit are in the files;
// - the zip dropped on the Files page is verified (✓), a changed file is caught (✗);
// - the "for further processing" package has no tool name, credit or notice in its files and comes with a
//   handover record.
const env = require('./_env');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const ROOT = env.ROOT, OUT = env.out('amdb_package'), T = ROOT + '/testdata/';
const URL = 'file://' + ROOT + '/AIXM-Code-Converter.html';
const fflate = require(path.join(ROOT, 'tools/node_modules/fflate'));
const { validateAmxm } = require('./_xsd');

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
  async function openBuild() {
    await page.evaluate(() => window.__AIXM.go('digital'));
    await page.click('[data-ddsec="amxm"]');
    await page.click('[data-amtab="package"]');
    await page.waitForSelector('[data-pkbuild]', { timeout: 30000 });
  }
  async function build(expectHandover) {
    const dl = [];
    const done = new Promise((resolve) => { page.on('download', async function h(d) { const p = OUT + '/' + d.suggestedFilename(); await d.saveAs(p); dl.push(p); if (dl.length === (expectHandover ? 2 : 1)) { page.off('download', h); resolve(); } }); });
    await page.click('[data-pkbuild]');
    await Promise.race([done, page.waitForTimeout(90000)]);
    return dl;
  }
  const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

  await load([T + 'amxm_test_EAXM.xml']);
  await openBuild();
  if (!(await page.$eval('[data-pkbuild]', (b) => b.disabled))) fails.push('build possible without the acknowledgement');
  await page.click('[data-pkmode="full"]');
  await page.check('[data-pkack="ack"]');
  if (await page.$eval('[data-pkbuild]', (b) => b.disabled)) fails.push('build not possible after the acknowledgement');
  const [zipPath] = await build(false);
  if (!zipPath || !/EAXM_AMDB_\d{4}-\d\d-\d\d\.zip$/.test(zipPath)) fails.push('package file: ' + zipPath);
  const z = fflate.unzipSync(new Uint8Array(fs.readFileSync(zipPath)));
  const names = Object.keys(z), base = names[0].split('/')[0] + '/';
  const get = (re) => { const k = names.find((n) => re.test(n)); return k ? Buffer.from(z[k]) : null; };
  const man = JSON.parse(get(/\/PACKAGE\.json$/).toString());
  // checksums
  const badSum = man.files.filter((f) => !z[base + f.path] || sha(z[base + f.path]) !== f.sha256).map((f) => f.path);
  if (badSum.length) fails.push('PACKAGE.json checksums: ' + badSum.join(', '));
  const sums = get(/SHA256SUMS\.txt$/).toString().trim().split('\n');
  if (sums.length !== man.files.length || sums.some((l) => { const [h, p] = l.split(/\s+/); return sha(z[base + p]) !== h; })) fails.push('SHA256SUMS.txt');
  for (const want of [/data\/.*_AMXM-2\.0\.xml$/, /data\/.*_AIXM-5\.1\.1\.xml$/, /data\/.*_identifiers\.csv$/, /gis\/.*\.gpkg$/, /gis\/.*\.geojson$/, /gis\/.*\.kml$/, /gis\/shapefile\/.*\.shp$/, /tables\/.*\.csv$/, /tables\/.*\.xlsx$/, /cad\/.*_UTM\d+[NS]\.dxf$/,
    /metadata\/.*_ISO19115\.xml$/, /metadata\/.*_data_product_specification\.html$/, /reports\/.*_package_report\.pdf$/, /reports\/.*_package_report\.html$/, /reports\/.*_checks\.json$/, /guides\/HOW_TO_USE\.txt$/, /guides\/feature_catalogue_mapping\.csv$/, /README\.txt$/]) {
    if (!get(want)) fails.push('missing in the full package: ' + want);
  }
  // AMXM
  const amxm = get(/_AMXM-2\.0\.xml$/).toString();
  if (!/xmlns:amxm="http:\/\/www\.amxm\.aero\/schema\/2\.0\.0"/.test(amxm) || !/<amxm:metadata><gmd:MD_Metadata/.test(amxm) || !/NOT FOR NAVIGATION/.test(amxm) || !/Prasad Selvaraj/.test(amxm)) fails.push('AMXM file: namespace, metadata, notice or credit');
  const wf = await page.evaluate((t) => { const d = new DOMParser().parseFromString(t, 'application/xml'); return d.getElementsByTagName('parsererror').length === 0 ? d.documentElement.localName : 'parsererror'; }, amxm);
  if (wf !== 'AerodromeMappingDatabase') fails.push('AMXM file not well-formed: ' + wf);
  if ((amxm.match(/<amxm:featureMember>/g) || []).length !== man.features) fails.push('AMXM features: ' + (amxm.match(/<amxm:featureMember>/g) || []).length + ' vs ' + man.features);
  if (/xsi:nil/.test(amxm)) fails.push('AMXM uses xsi:nil (AMXM uses nilReason on empty elements)');
  // valid against the AMXM 2.0.2 XML schema (with GML 3.2.1 and ISO 19139), although the source has a wrong code
  const v1 = await validateAmxm(amxm);
  if (!v1.valid) fails.push('AMXM file not valid against the AMXM 2.0.2 schema: ' + v1.errors.slice(0, 3).join(' | '));
  const src = await validateAmxm(fs.readFileSync(T + 'amxm_test_EAXM.xml', 'utf8'));
  if (src.valid) fails.push('the schema check accepts the (incomplete) test source file: it checks nothing');
  if (!/<amxm:feattype>0<\/amxm:feattype>/.test(amxm)) fails.push('feattype of RunwayElement (0)');
  // GeoPackage
  const SQL = await require(path.join(ROOT, 'tools/node_modules/sql.js'))();
  const db = new SQL.Database(get(/\.gpkg$/));
  const appId = db.exec('PRAGMA application_id')[0].values[0][0], contents = db.exec('SELECT table_name, data_type, srs_id FROM gpkg_contents')[0].values;
  const meta = db.exec('SELECT metadata FROM gpkg_metadata')[0].values[0][0];
  const firstT = contents[0][0], blob = db.exec('SELECT geom FROM "' + firstT + '" LIMIT 1')[0].values[0][0];
  const rows = contents.reduce((n, c) => n + db.exec('SELECT count(*) FROM "' + c[0] + '"')[0].values[0][0], 0);
  if (appId !== 1196444487 || contents.some((c) => c[1] !== 'features' || c[2] !== 4326) || !/MD_Metadata/.test(meta) || blob[0] !== 0x47 || blob[1] !== 0x50 || rows < man.features) fails.push('GeoPackage: ' + JSON.stringify({ appId, n: contents.length, rows }));
  db.close();
  // GeoJSON, KML, Shapefile, DXF, Excel, PDF, report
  const gj = JSON.parse(get(/\.geojson$/).toString());
  if (gj.type !== 'FeatureCollection' || gj.features.length < man.features || !/NOT FOR NAVIGATION/.test(gj.notice)) fails.push('GeoJSON');
  const kmlOk = await page.evaluate((t) => new DOMParser().parseFromString(t, 'application/xml').getElementsByTagName('Placemark').length, get(/\.kml$/).toString());
  if (kmlOk < man.features) fails.push('KML placemarks: ' + kmlOk);
  const shp = get(/\.shp$/);
  if (shp.readInt32BE(0) !== 9994) fails.push('Shapefile header');
  const dxf = get(/\.dxf$/).toString();
  const east = +(/\r\n10\r\n([\d.]+)\r\n/.exec(dxf) || [])[1];
  if (!/\r\nEOF\r\n$/.test(dxf) || !(east > 160000 && east < 840000)) fails.push('DXF (easting ' + east + ')');
  if (get(/\.xlsx$/).slice(0, 2).toString() !== 'PK') fails.push('Excel');
  if (get(/\.pdf$/).slice(0, 4).toString() !== '%PDF') fails.push('PDF');
  const rep = get(/_package_report\.html$/).toString();
  for (const w of ["What's inside", 'Sources (what data was used)', 'How it was made', 'Checks', 'NOT FOR NAVIGATION', 'Prasad Selvaraj']) if (rep.indexOf(w.replace("'", '&#39;')) < 0 && rep.indexOf(w) < 0) fails.push('report lacks: ' + w);
  const iso = get(/_ISO19115\.xml$/).toString();
  if (!/<gmd:useLimitation>.*NOT FOR NAVIGATION/.test(iso) || !/codeListValue="processor"/.test(iso) || !/codeListValue="originator"/.test(iso) || !/<gmd:lineage>/.test(iso)) fails.push('ISO 19115 metadata');
  if (!man.producer || man.producer.author !== 'Prasad Selvaraj' || !/NOT FOR NAVIGATION/.test(man.notice)) fails.push('manifest producer / notice');

  // the package opened again: verified, its AMXM file read with the same features
  await page.goto(URL); await page.waitForSelector('#drop');
  await page.setInputFiles('#file-input', [zipPath]);
  await page.waitForFunction(() => !window.__AIXM.S.adding && (window.__AIXM.S.packages || []).length, null, { timeout: 30000 });
  const reopened = await page.evaluate(() => ({ p: window.__AIXM.S.packages[0].res.ok, files: window.__AIXM.S.files.map((f) => f.name), card: (document.querySelector('.pkg-card') || {}).textContent || '' }));
  if (!reopened.p || reopened.files.length !== 1 || !/_AMXM-2\.0\.xml$/.test(reopened.files[0]) || !/✓/.test(reopened.card)) fails.push('package reopened: ' + JSON.stringify(reopened));
  await page.evaluate(() => document.querySelector('#extract-btn').click());
  await page.waitForFunction(() => window.__AIXM.S.view === 'dash', null, { timeout: 60000 });
  const back = await page.evaluate(() => window.__AIXM.S.datasets[0].recs.filter((r) => r.cur && r.cur.p && r.cur.p._amxm && !r.syn).length);
  if (back !== man.features) fails.push('AMXM read back: ' + back + ' features vs ' + man.features);
  // the GeoPackage of the package opened on its own: read as AMXM with the same features
  const gpkgPath = OUT + '/package.gpkg'; fs.writeFileSync(gpkgPath, get(/\.gpkg$/));
  await page.goto(URL); await page.waitForSelector('#drop');
  await page.setInputFiles('#file-input', [gpkgPath]);
  await page.waitForFunction(() => !window.__AIXM.S.adding && window.__AIXM.S.files.length && window.__AIXM.S.files.every((f) => f.status !== 'checking'), null, { timeout: 30000 });
  await page.evaluate(() => document.querySelector('#extract-btn').click());
  await page.waitForFunction(() => window.__AIXM.S.view === 'dash', null, { timeout: 60000 });
  const fromGpkg = await page.evaluate(() => window.__AIXM.S.datasets[0].recs.filter((r) => r.cur && r.cur.p && r.cur.p._amxm && !r.syn).length);
  if (fromGpkg !== man.features) fails.push('GeoPackage read back: ' + fromGpkg + ' features vs ' + man.features);
  // a changed file is caught
  const tam = {}; names.forEach((n) => { tam[n] = z[n]; });
  const geo = names.find((n) => /\.geojson$/.test(n)); tam[geo] = new TextEncoder().encode(Buffer.from(z[geo]).toString().replace('FeatureCollection', 'FeatureCollection '));
  const tamPath = OUT + '/tampered_package.zip'; fs.writeFileSync(tamPath, fflate.zipSync(tam));
  await page.goto(URL); await page.waitForSelector('#drop');
  await page.setInputFiles('#file-input', [tamPath]);
  await page.waitForFunction(() => !window.__AIXM.S.adding && (window.__AIXM.S.packages || []).length, null, { timeout: 30000 });
  const tampered = await page.evaluate(() => window.__AIXM.S.packages[0].res);
  if (tampered.ok || !tampered.bad.some((b) => /\.geojson$/.test(b))) fails.push('changed file not caught: ' + JSON.stringify(tampered.bad));

  // the aerodromes with a defect for every rule: the AMXM written is still schema-valid (values the schema does not
  // allow are written as unknown and listed in the report)
  await load([T + 'amdb_test_EAXB.xml']);
  await openBuild();
  await page.click('[data-pkmode="custom"]');
  await page.evaluate(() => { document.querySelectorAll('[data-pkad]').forEach((c) => { if (!c.checked) { c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); } }); });
  await page.check('[data-pkack="ack"]');
  const [bz] = await build(false);
  const bzz = fflate.unzipSync(new Uint8Array(fs.readFileSync(bz)));
  const bAmxm = Buffer.from(bzz[Object.keys(bzz).find((n) => /_AMXM-2\.0\.xml$/.test(n))]).toString();
  const v2 = await validateAmxm(bAmxm);
  if (!v2.valid) fails.push('AMXM of the defect aerodromes not schema-valid: ' + v2.errors.slice(0, 3).join(' | '));
  const bRep = Buffer.from(bzz[Object.keys(bzz).find((n) => /_package_report\.html$/.test(n))]).toString();
  if (!/value\(s\) of the sources the schema does not allow/.test(bRep)) fails.push('report does not list the values written as unknown');

  // for further processing: no tool name, credit or notice in the data; a handover record
  await load([T + 'amxm_test_EAXM.xml']);
  await openBuild();
  await page.click('[data-pkmode="full"]');
  await page.check('[data-pkbrand="plain"]');
  await page.check('[data-pkack="ack"]');
  if (!(await page.$eval('[data-pkbuild]', (b) => b.disabled))) fails.push('white-label build possible without taking over the responsibility');
  await page.check('[data-pkack="ack2"]');
  const wl = await build(true);
  const wz = fflate.unzipSync(new Uint8Array(fs.readFileSync(wl.find((p) => /\.zip$/.test(p)))));
  const branded = Object.keys(wz).filter((n) => /\.(xml|geojson|kml|csv|dxf|txt|json|html)$/.test(n)).filter((n) => { const t = Buffer.from(wz[n]).toString(); return /Prasad Selvaraj|AIXM Code Converter|NOT FOR NAVIGATION/.test(t); });
  if (branded.length) fails.push('white-label files with the tool name, credit or notice: ' + branded.join(', '));
  const ho = wl.find((p) => /HANDOVER_RECORD\.txt$/.test(p));
  if (!ho || !/responsibility/.test(fs.readFileSync(ho, 'utf8')) || !/NOT FOR NAVIGATION/.test(fs.readFileSync(ho, 'utf8'))) fails.push('handover record');
  const wman = JSON.parse(Buffer.from(wz[Object.keys(wz).find((n) => /PACKAGE\.json$/.test(n))]).toString());
  if (wman.producer || wman.notice || wman.branding !== 'for further processing') fails.push('white-label manifest');

  if (errors.length) fails.push('page errors: ' + errors.join(' | '));
  await browser.close();
  if (fails.length) { console.error('FAIL amdb_package\n - ' + fails.join('\n - ')); process.exit(1); }
  console.log('PASS amdb_package (' + man.files.length + ' files, ' + man.features + ' features; reopened and verified; change caught; white-label clean)');
})().catch((e) => { console.error('FAIL amdb_package', e); process.exit(1); });
