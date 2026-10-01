// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Node harness: parse a file, finalize the model and print every AIP section as text.
// Usage: node tools/test_aip.js <file.xml> [sectionFilterRegex]
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const ctx = { console, setTimeout, TextDecoder, Uint8Array, Map, Set, Date, Math, JSON, Promise, Array, Object, String, RegExp, Number, parseFloat, parseInt, isNaN, Infinity, NaN };
vm.createContext(ctx);
const GLOBALS = { 'src/core.js': 'AX', 'src/model.js': 'MODEL', 'src/aip.js': 'AIP', 'src/analysis.js': 'ANALYSIS', 'src/review.js': 'REVIEW', 'src/rules.js': 'RULES' };
Object.keys(GLOBALS).forEach((f) => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8') + '\n;this.' + GLOBALS[f] + '=' + GLOBALS[f] + ';', ctx, { filename: f }));
const dict = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/aixm_dictionary.json'), 'utf8'));
ctx.MODEL.setDict(dict);
ctx.RULES.setData(JSON.parse(fs.readFileSync(path.join(ROOT, 'data/aixm_rules.json'), 'utf8')));

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

function printSection(sec, indent) {
  if (!sec) return;
  if (sec.group) { sec.group.forEach((g) => printSection(g, indent)); return; }
  console.log('\n' + indent + '=== ' + (sec.no || '') + ' ' + sec.title);
  (sec.blocks || []).forEach((b) => {
    if (b.title) console.log(indent + '  -- ' + b.title);
    if (b.kind === 'note') console.log(indent + '  ' + b.text);
    if (b.kind === 'kv') b.rows.forEach((r) => console.log(indent + '  ' + (r.no || ' ').padEnd(3) + r.label.padEnd(48).slice(0, 48) + ' | ' + r.cells.map((c) => c.t.replace(/\n/g, ' ⏎ ')).filter(Boolean).join(' ‖ ')));
    if (b.kind === 'table') {
      console.log(indent + '  [' + b.cols.join(' | ') + ']');
      b.rows.slice(0, +(process.env.MAXROWS || 12)).forEach((r) => console.log(indent + '   ' + r.map((c) => c.t.replace(/\n/g, ' ⏎ ')).join(' | ')));
      if (b.rows.length > (+(process.env.MAXROWS || 12))) console.log(indent + '   … ' + b.rows.length + ' rows');
      if (b.note) console.log(indent + '   note: ' + b.note);
    }
  });
}

(async () => {
  const ds = await parse(process.argv[2]);
  console.log('State:', ds.state, '(' + ds.stateSource + ')', '| version', ds.sniff.versionLabel, '| effective', ctx.MODEL.fmtDate(ds.effective), ds.effectiveSource, '| AIRAC', ds.airac && ds.airac.id, '| recs', ds.recs.length, '| finalize ms', ds.tFinalize);
  if (process.env.EVAL) { ctx.ds = ds; const out = await vm.runInContext('(async () => { ' + process.env.EVAL + ' })()', ctx); if (out !== undefined) console.log(typeof out === 'string' ? out : JSON.stringify(out, null, 1)); return; }
  const cat = ctx.AIP.catalogue(ds);
  const re = new RegExp(process.argv[3] || '.');
  cat.forEach((grp) => {
    console.log('\n########## ' + grp.title + ' — ' + grp.children.map((c) => c.no).join(', '));
    grp.children.forEach((c) => {
      if (c.children) {
        c.children.forEach((cc) => { if (re.test(cc.no) && (!process.env.AD || c.no.indexOf(process.env.AD) >= 0)) { try { printSection(cc.build(), '  '); } catch (e) { console.log('ERROR in', cc.no, e.stack); } } });
      } else if (re.test(c.no)) { try { printSection(c.build(), ''); } catch (e) { console.log('ERROR in', c.no, e.stack); } }
    });
  });
})();
