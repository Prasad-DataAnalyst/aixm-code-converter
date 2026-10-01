// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Node harness shared by test_aip.js and the unit tests: loads the application modules into one
// context (as in the browser) and parses an AIXM file with the real worker code.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const ctx = { console, setTimeout, TextDecoder, Uint8Array, Uint32Array, Int16Array, Float32Array, Map, Set, WeakMap, Date, Math, JSON, Promise, Array, Object, String, RegExp, Number, parseFloat, parseInt, isNaN, isFinite, Infinity, NaN, encodeURIComponent, unescape };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/config.js'), 'utf8') + '\n;this.APP_INFO=APP_INFO;this.APP_SETTINGS=APP_SETTINGS;', ctx, { filename: 'src/config.js' });
// module file -> global it defines, in page order (see src/index.html)
const GLOBALS = { 'src/core.js': 'AX', 'src/model.js': 'MODEL', 'src/aip.js': 'AIP', 'src/analysis.js': 'ANALYSIS', 'src/adchart.js': 'ADCHART', 'src/ols.js': 'OLS',
  'src/profile.js': 'PROFILE', 'src/integrity.js': 'INTEGRITY', 'src/review.js': 'REVIEW', 'src/rules.js': 'RULES' };
Object.keys(GLOBALS).forEach((f) => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8') + '\n;this.' + GLOBALS[f] + '=' + GLOBALS[f] + ';', ctx, { filename: f }));
const dict = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/aixm_dictionary.json'), 'utf8'));
ctx.MODEL.setDict(dict);
ctx.RULES.setData(JSON.parse(fs.readFileSync(path.join(ROOT, 'data/aixm_rules.json'), 'utf8')));

// parse a file (path) into a finalized data set, exactly as the browser does with one thread
async function parse(fp) {
  const buf = fs.readFileSync(fp);
  const file = new File([buf], path.basename(fp));
  const sn = ctx.AX.sniff(buf.subarray(0, 65536).toString('utf8'), path.basename(fp));
  const v = /^5\.2/.test(sn.version) ? '5.2' : sn.version === '5.1.1' ? '5.1.1' : '5.1';
  const names = sn.family === '45' ? Object.keys(dict.v45.features) : Object.keys(dict.v5.featureVersions).filter((k) => dict.v5.featureVersions[k].includes(v));
  const recs = [];
  let lines = 0;
  await new Promise((resolve) => {
    const sb = Object.assign({}, ctx, { AX: ctx.AX });
    sb.self = { postMessage(m) { if (m.type === 'batch') recs.push(...m.recs); if (m.type === 'done') { lines = m.lines; resolve(); } if (m.type === 'error') { console.error(m.msg); resolve(); } } };
    vm.createContext(sb);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/worker.js'), 'utf8'), sb);
    sb.self.onmessage({ data: { cmd: 'scan', file, start: 0, end: file.size, part: 0, jobId: 1, cfg: { family: sn.family, names, aixmPrefixes: sn.aixmPrefixes, eventPrefixes: sn.eventPrefixes, gmlPrefixes: sn.gmlPrefixes, isUpdate: sn.isUpdate, effective: sn.header.effective } } });
  });
  const ds = { name: path.basename(fp), size: file.size, sniff: sn, family: sn.family, version: sn.version, recs, partLines: [lines] };
  ctx.MODEL.finalize(ds);
  return ds;
}
module.exports = { ROOT, ctx, parse, vm };
