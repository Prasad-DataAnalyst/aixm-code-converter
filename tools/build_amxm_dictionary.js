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
  const reEl = /<element name="([a-z][A-Za-z0-9_]*)" type="(?:amxm|gml):([A-Za-z0-9_]+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/element>)/g;
  let e;
  while ((e = reEl.exec(body))) elements.push({ name: e[1], type: e[2], doc: short(doc(e[4])), req: !/minOccurs="0"/.test(e[3]) });
  // allowed units of measure (attribute uom), e.g. meters, feet, DecimalDegrees
  const uom = /<attribute name="uom">([\s\S]*?)<\/attribute>/.exec(body), uoms = [];
  if (uom) { const reU = /<enumeration value="([^"]+)"/g; let u; while ((u = reU.exec(uom[1]))) uoms.push(u[1]); }
  // the nilReason values an element allows (unknown, not applicable …)
  const nil = /<attribute name="nilReason">([\s\S]*?)<\/attribute>/.exec(body), nils = [];
  if (nil) { const reN = /<enumeration value="([^"]+)"/g; let u; while ((u = reN.exec(nil[1]))) nils.push(u[1]); }
  types[m[1]] = { base: base ? base[1] : null, elements, uoms, nils };
}
// code lists: simple types with documented enumeration values
const codes = {}, codesAll = {};
const reSimple = /<simpleType name="([A-Za-z0-9_]+)"[^>]*>([\s\S]*?)<\/simpleType>/g;
while ((m = reSimple.exec(xsd))) {
  const vals = {};
  const reEnum = /<enumeration value="([^"]*)"\s*(?:\/>|>([\s\S]*?)<\/enumeration>)/g;
  let e;
  let empty = false;
  while ((e = reEnum.exec(m[2]))) { if (e[1] !== '') vals[e[1]] = doc(e[2]) || e[1]; else empty = true; }
  if (Object.keys(vals).length) { codes[m[1]] = vals; codesAll[m[1]] = { empty }; }
}
// value limits of the simple types (base type, range, length, pattern); a union with the empty string allows "unknown"
const limits = {};
const reS2 = /\n\t<simpleType name="([A-Za-z0-9_]+)"[^>]*>([\s\S]*?)\n\t<\/simpleType>/g; // top-level types (one tab), with their nested union members
while ((m = reS2.exec(xsd))) {
  const body = m[2], o = {};
  const r = /<restriction base="(?:xs:|xsd:)?([A-Za-z]+)"\s*\/?>([\s\S]*?)(?:<\/restriction>|$)/.exec(body);
  if (!r) continue;
  if (/enumeration/.test(r[2])) continue; // code list
  o.b = r[1];
  const g = (n) => { const x = new RegExp('<' + n + ' value="([^"]*)"').exec(r[2]); return x ? x[1] : undefined; };
  if (g('minInclusive') !== undefined) o.min = +g('minInclusive');
  if (g('maxInclusive') !== undefined) o.max = +g('maxInclusive');
  if (g('maxLength') !== undefined) o.len = +g('maxLength');
  if (g('pattern') !== undefined) o.pat = g('pattern');
  if (/<union>/.test(body) && /length value="0"/.test(body)) o.empty = 1;
  limits[m[1]] = o;
}
function limitOf(typeName) {
  const t = types[typeName], base = t ? t.base : null;
  return (base && limits[base]) || limits[typeName] || null;
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
  features[m[1]] = { doc: short(doc(m[3])), attrs: list.map((a) => { const o = { n: a.name, d: a.doc }; const c = codeOf(a.type); if (c) o.c = c; if (a.req) o.m = 1; const t = types[a.type]; if (t && t.uoms && t.uoms.length) o.u = t.uoms; const l = !c && limitOf(a.type); if (l) o.x = l;
    if (t && t.nils && t.nils.length) o.nr = t.nils;
    // can the element be empty (unknown)? a code list with the empty value, a union with the empty string, a text of length 0
    o.e = c ? (codesAll[c] && codesAll[c].empty ? 1 : 0) : l ? (l.empty || (l.b === 'string' && !l.min) ? 1 : 0) : 1;
    return o; }) };
}
const used = new Set();
Object.values(features).forEach((f) => f.attrs.forEach((a) => { if (a.c) used.add(a.c); }));
const out = { source: 'AMXM 2.0.2 XML schema (amxm.aero), Copyright (c) 2024 RTCA, EUROCAE, BSD licence', features, codes: {} };
[...used].sort().forEach((c) => { out.codes[c] = codes[c]; });
fs.writeFileSync(path.join(ROOT, 'data/amxm_dictionary.json'), JSON.stringify(out));
console.log('data/amxm_dictionary.json:', Object.keys(features).length, 'feature types,', used.size, 'code lists');
