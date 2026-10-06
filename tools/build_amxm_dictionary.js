// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Builds data/amxm_dictionary.json from the AMXM 2.0.2 XML schema (schemas/amxm/2.0.2/amxm.xsd, RTCA / EUROCAE,
// BSD licence): every feature type with its definition and attributes (in schema order, with definition and type),
// and every code list (value -> meaning). The tool uses it to show AMXM code values with their meaning and to list,
// per feature type, which attributes a data set gives, marks unknown or leaves out.
// Usage: node tools/build_amxm_dictionary.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const xsd = fs.readFileSync(path.join(ROOT, 'schemas/amxm/2.0.2/amxm.xsd'), 'utf8');

const doc = (s) => { const m = /<documentation>([\s\S]*?)<\/documentation>/.exec(s || ''); return m ? m[1].replace(/\s+/g, ' ').replace(/^Definition:\s*/, '').trim() : ''; };
const short = (d) => d.split(/\s(?:Encoding|Example|Note):/)[0].trim();
// complex types: name -> { base, elements: [{ name, type, doc }] }
const types = {};
const reType = /<complexType name="([A-Za-z0-9_]+)"[^>]*>([\s\S]*?)<\/complexType>/g;
let m;
while ((m = reType.exec(xsd))) {
  const body = m[2], base = /<extension base="amxm:([A-Za-z0-9_]+)"/.exec(body);
  const elements = [];
  const reEl = /<element name="([a-z][A-Za-z0-9_]*)" type="(?:amxm|gml):([A-Za-z0-9_]+)"[^>]*?(?:\/>|>([\s\S]*?)<\/element>)/g;
  let e;
  while ((e = reEl.exec(body))) elements.push({ name: e[1], type: e[2], doc: short(doc(e[3])) });
  types[m[1]] = { base: base ? base[1] : null, elements };
}
// code lists: simple types with documented enumeration values
const codes = {};
const reSimple = /<simpleType name="([A-Za-z0-9_]+)"[^>]*>([\s\S]*?)<\/simpleType>/g;
while ((m = reSimple.exec(xsd))) {
  const vals = {};
  const reEnum = /<enumeration value="([^"]*)"\s*(?:\/>|>([\s\S]*?)<\/enumeration>)/g;
  let e;
  while ((e = reEnum.exec(m[2]))) if (e[1] !== '') vals[e[1]] = doc(e[2]) || e[1];
  if (Object.keys(vals).length) codes[m[1]] = vals;
}
// element type (…TypeType) -> code list via its simpleContent base (…BaseTypeType)
function codeOf(typeName) {
  const t = types[typeName];
  const base = t ? t.base : null;
  if (base && codes[base]) return base;
  return codes[typeName] ? typeName : null;
}
function attrs(typeName, seen) {
  const t = types[typeName];
  if (!t || (seen = seen || new Set()).has(typeName)) return [];
  seen.add(typeName);
  return attrs(t.base, seen).concat(t.elements);
}
const features = {};
const reFeat = /<element name="([A-Z][A-Za-z0-9]*)" type="amxm:([A-Za-z0-9]+)Type"[^>]*>([\s\S]*?)<\/element>/g;
while ((m = reFeat.exec(xsd))) {
  if (/^(AbstractFeature|FeatureBase|FeatureVerticalQuality|AerodromeMappingDatabase)$/.test(m[1])) continue;
  const list = attrs(m[2] + 'Type');
  if (!list.length) continue;
  features[m[1]] = { doc: short(doc(m[3])), attrs: list.map((a) => { const o = { n: a.name, d: a.doc }; const c = codeOf(a.type); if (c) o.c = c; return o; }) };
}
const used = new Set();
Object.values(features).forEach((f) => f.attrs.forEach((a) => { if (a.c) used.add(a.c); }));
const out = { source: 'AMXM 2.0.2 XML schema (amxm.aero), Copyright (c) 2024 RTCA, EUROCAE, BSD licence', features, codes: {} };
[...used].sort().forEach((c) => { out.codes[c] = codes[c]; });
fs.writeFileSync(path.join(ROOT, 'data/amxm_dictionary.json'), JSON.stringify(out));
console.log('data/amxm_dictionary.json:', Object.keys(features).length, 'feature types,', used.size, 'code lists');
