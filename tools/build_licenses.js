// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Writes THIRD-PARTY-LICENSES.txt: the full licence text of every library and data set built into
// AIXM-Code-Converter.html, taken from the installed packages (tools/node_modules) and the AIXM schema headers.
// Usage: node tools/build_licenses.js        (after cd tools && npm install)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const NM = path.join(__dirname, 'node_modules');

const PACKAGES = [
  ['leaflet', 'Leaflet — interactive map', 'BSD-2-Clause'],
  ['three', 'three.js — 3D view', 'MIT'],
  ['xlsx', 'SheetJS Community Edition — Excel files', 'Apache-2.0'],
  ['jspdf', 'jsPDF — PDF files', 'MIT'],
  ['jspdf-autotable', 'jsPDF-AutoTable — PDF tables', 'MIT'],
  ['fflate', 'fflate — zip files', 'MIT'],
  ['topojson-client', 'TopoJSON client — offline world map', 'ISC'],
  ['world-atlas', 'world-atlas — offline world map (from Natural Earth)', 'ISC'],
  ['jsts', 'JSTS — geometry engine of the aerodrome mapping checks (stored unopened, loaded when used)', 'EDL-1.0 (or EPL-1.0)'],
  ['sql.js', 'sql.js — SQLite for GeoPackage files (stored unopened, loaded when used)', 'MIT'],
  ['pdfjs-dist', 'PDF.js (Mozilla) — reads the text of State chart PDFs, e.g. stand coordinates (stored unopened, loaded when used; opened with isEvalSupported: false)', 'Apache-2.0']
];
// downloaded from cdn.jsdelivr.net when the user asks to read a picture chart (checked by SHA-256, kept in the browser); not in the file
const OCR = [
  ['tesseract.js', 'OCR of State charts that are pictures (downloaded when asked, not contained in the file)', 'Apache-2.0'],
  ['tesseract.js-core', 'Tesseract OCR engine compiled to WebAssembly (downloaded when asked, not contained in the file)', 'Apache-2.0'],
  ['@tesseract.js-data/eng', 'English trained data (tessdata_best of the Tesseract OCR project, Apache-2.0; npm package MIT) (downloaded when asked, not contained in the file)', 'Apache-2.0 (data), MIT (package)']
];

function licenceText(dir) {
  // a package without a licence file: its licence text is kept in tools/licenses/<package>.txt
  const own = path.join(__dirname, 'licenses', path.basename(dir) + '.txt');
  if (fs.existsSync(own)) return fs.readFileSync(own, 'utf8').replace(/\r\n/g, '\n').trim();
  const f = fs.readdirSync(dir).find((n) => /^licen[cs]e(\.(txt|md))?$/i.test(n));
  if (!f) throw new Error('no licence file in ' + dir);
  return fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r\n/g, '\n').trim();
}
function schemaNotice(file) {
  const t = fs.readFileSync(path.join(ROOT, 'schemas', file), 'utf8');
  const m = /(Copyright \(c\)[\s\S]*?SUCH DAMAGE\.)/.exec(t);
  if (!m) throw new Error('no licence header in ' + file);
  return m[1].split('\n').map((l) => l.replace(/^\s+/, '')).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
const LINE = '='.repeat(78);
const parts = [
  'AIXM Code Converter — third-party licences',
  '',
  'AIXM Code Converter is Copyright 2026 Prasad Selvaraj and licensed under the Apache License 2.0 (see LICENSE',
  'and NOTICE). The single HTML file also contains the following third-party software and data, each under its',
  'own licence, reproduced in full below.',
  ''
];
for (const [name, what, spdx] of PACKAGES) {
  const dir = path.join(NM, name);
  const ver = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version;
  parts.push(LINE, name + ' ' + ver + ' — ' + what.replace(/^[^—]*— /, ''), 'Licence: ' + spdx, LINE, '', licenceText(dir), '');
}
parts.push(LINE, 'AIXM 4.5 XML schemas (data dictionary built from them)', 'Licence: BSD-style (EUROCONTROL)', LINE, '', schemaNotice('4.5/AIXM-Update.xsd'), '');
parts.push(LINE, 'AIXM 5.1 / 5.1.1 / 5.2 XML schemas, AIXM 5.1 business rules, Donlon sample data', 'Licence: BSD-style (EUROCONTROL & FAA)', LINE, '', schemaNotice('5.1.1/AIXM_Features.xsd'), '');
parts.push(LINE, 'AMXM 2.0.2 XML schema (aerodrome mapping code lists and definitions, data/amxm_dictionary.json)', 'Licence: BSD-style (RTCA, EUROCAE)', LINE, '', schemaNotice('amxm/2.0.2/amxm.xsd'), '');
parts.push(LINE, 'Natural Earth — country borders and coastlines of the offline world map', 'Licence: public domain', LINE, '',
  'Made with Natural Earth. Free vector and raster map data @ naturalearthdata.com.',
  'All versions of Natural Earth raster and vector map data are in the public domain.', '');
parts.push(LINE, 'Terrain Tiles — built-in terrain grid (data/terrain.json) and optional online terrain', 'Licence: open data, attribution required', LINE, '',
  'Terrain Tiles, Mapzen and the AWS Open Data Program (https://registry.opendata.aws/terrain-tiles/).',
  'Sources: SRTM, GMTED2010 and ETOPO1 (public domain), 3DEP / NED, ArcticDEM, Canadian DEM, EU-DEM, Geoscience',
  'Australia, INEGI, Kartverket, LINZ and UK Environment Agency data. Each source and its required attribution',
  'is listed at https://github.com/tilezen/joerd/blob/master/docs/attribution.md', '');
parts.push(LINE, 'Online services the tool can link to or load on request (not contained in the file)', LINE, '',
  'Online base maps: each map shows its own attribution on the map (Esri, OpenStreetMap contributors (ODbL),',
  'OpenTopoMap (CC-BY-SA), NASA GIBS). Live traffic: adsb.lol (data under the Open Database Licence), its live',
  'map shown inside the map on request. Flight and aircraft details: adsbdb.com.',
  'Imagery for tracing aerodrome mapping: each layer states its licence in the tool and on the map (EOX Sentinel-2',
  'cloudless 2016 CC BY 4.0 and 2025 CC BY-NC-SA 4.0, PDOK CC BY 4.0, IGN Etalab 2.0, swisstopo, PNOA CC BY 4.0,',
  'basemap.at CC BY 4.0, USGS public domain, GSI, NSW CC BY 4.0; Esri for viewing only).', '');
for (const [name, what, spdx] of OCR) {
  const dir = path.join(NM, name);
  const ver = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version;
  parts.push(LINE, name + ' ' + ver + ' — ' + what, 'Licence: ' + spdx, LINE, '', spdx === 'Apache-2.0' ? licenceText(dir) : 'See the Apache License 2.0 text above.', '');
}
fs.writeFileSync(path.join(ROOT, 'THIRD-PARTY-LICENSES.txt'), parts.join('\n'));
console.log('THIRD-PARTY-LICENSES.txt written (' + PACKAGES.length + ' libraries + data, ' + OCR.length + ' downloaded on request)');
