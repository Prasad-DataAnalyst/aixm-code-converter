// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Validates an AMXM 2.0 document against the AMXM 2.0.2 XML schema (schemas/amxm) with GML 3.2.1, ISO 19139 and
// the W3C XLink / XML schemas kept in tools/tests/xsd (no network), using libxml2 (xmllint-wasm).
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const { validateXML } = require(path.join(ROOT, 'tools', 'node_modules', 'xmllint-wasm'));
const XSD = path.join(__dirname, 'xsd');
function walk(d, out) { fs.readdirSync(d).forEach((n) => { const p = path.join(d, n); if (fs.statSync(p).isDirectory()) walk(p, out); else if (/\.xsd$/.test(n)) out.push(p); }); return out; }
// schema locations on the web -> the copies here (absolute paths in the validator's file system)
function local(t) {
  return t.replace(/schemaLocation="https?:\/\/schemas\.opengis\.net\//g, 'schemaLocation="/xsd/')
    .replace(/schemaLocation="https?:\/\/www\.w3\.org\/1999\/xlink\.xsd"/g, 'schemaLocation="/xsd/w3c/xlink.xsd"')
    .replace(/schemaLocation="https?:\/\/www\.w3\.org\/(2001|2009\/01)\/xml\.xsd"/g, 'schemaLocation="/xsd/w3c/xml.xsd"');
}
async function validateAmxm(xml) {
  const preload = walk(XSD, []).map((p) => ({ fileName: '/xsd/' + path.relative(XSD, p).split(path.sep).join('/'), contents: local(fs.readFileSync(p, 'utf8')) }));
  const schema = { fileName: '/xsd/amxm/amxm.xsd', contents: local(fs.readFileSync(path.join(ROOT, 'schemas/amxm/2.0.2/amxm.xsd'), 'utf8')) };
  const r = await validateXML({ xml: [{ fileName: 'amxm.xml', contents: xml }], schema: [schema], preload, initialMemoryPages: 1024, maxMemoryPages: 32768 });
  return { valid: r.valid, errors: r.errors.map((e) => e.message || e.rawMessage || String(e)) };
}
// AIXM 5.1.1 basic message (schemas/5.1.1 + the message schema kept in tools/tests/xsd/aixm-5.1.1-message)
async function validateAixm511(xml) {
  const preload = walk(XSD, []).filter((p) => !/aixm-5\.1\.1-message/.test(p)).map((p) => ({ fileName: '/xsd/' + path.relative(XSD, p).split(path.sep).join('/'), contents: local(fs.readFileSync(p, 'utf8')) }));
  const A = path.join(ROOT, 'schemas/5.1.1');
  fs.readdirSync(A).filter((n) => /\.xsd$/.test(n)).forEach((n) => preload.push({ fileName: '/aixm/' + n, contents: local(fs.readFileSync(path.join(A, n), 'utf8')) }));
  const msg = local(fs.readFileSync(path.join(XSD, 'aixm-5.1.1-message/AIXM_BasicMessage.xsd'), 'utf8')).replace('schemaLocation="../ISO_19136_Schemas/gml.xsd"', 'schemaLocation="/xsd/gml/3.2.1/gml.xsd"');
  const r = await validateXML({ xml: [{ fileName: 'aixm.xml', contents: xml }], schema: [{ fileName: '/aixm/message/AIXM_BasicMessage.xsd', contents: msg }], preload, initialMemoryPages: 2048, maxMemoryPages: 65536 });
  return { valid: r.valid, errors: r.errors.map((e) => e.message || e.rawMessage || String(e)) };
}
module.exports = { validateAmxm, validateAixm511 };
