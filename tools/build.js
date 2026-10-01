// AIXM Code Converter - Copyright 2026 Prasad <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Assembles src/index.html + libraries + data into ONE self-contained offline HTML file.
// Usage: node tools/build.js   ->  AIXM-Code-Converter.html
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'AIXM-Code-Converter.html');

// compact populated places for offline map labels: [name, lon, lat, rank]
const placesSrc = path.join(ROOT, 'data/ne_50m_places.geojson');
const placesOut = path.join(ROOT, 'data/places.json');
if (fs.existsSync(placesSrc)) {
  const g = JSON.parse(fs.readFileSync(placesSrc, 'utf8'));
  const list = g.features.map((f) => [f.properties.name, +f.geometry.coordinates[0].toFixed(3), +f.geometry.coordinates[1].toFixed(3), f.properties.scalerank]);
  fs.writeFileSync(placesOut, JSON.stringify(list));
}
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const safeJs = (s) => s.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
const safeJson = (s) => JSON.stringify(JSON.parse(s)).replace(/</g, '\\u003c');
let html = read('src/index.html');
html = html.replace(/\/\*@@INLINE_CSS:([^@]+)@@\*\//g, (m, p) => read(p));
html = html.replace(/\/\*@@INLINE_JSON:([^@]+)@@\*\//g, (m, p) => safeJson(read(p)));
html = html.replace(/\/\*@@INLINE_JS:([^@]+)@@\*\//g, (m, p) => safeJs(read(p)));
const stamp = new Date().toISOString().slice(0, 10);
html = html.replace('<title>AIXM Code Converter</title>', '<title>AIXM Code Converter</title>\n<meta name="generator" content="AIXM Code Converter build ' + stamp + '">');
fs.writeFileSync(OUT, html);
console.log('Wrote', path.relative(process.cwd(), OUT), (fs.statSync(OUT).size / 1048576).toFixed(2) + ' MB');
