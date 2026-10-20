// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Several data sets in one AIXM file (CONVERT.merge) and its parts read back (CONVERT.mergedPartsOf + the worker on a
// byte range); features inside XML comments are not read, also by a reader thread that starts inside the comment;
// file names after the content (EXPORTS.fileName).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { ctx, vm, parse, ROOT } = require('../../harness');
Object.assign(ctx, { Blob, TextEncoder, File });
vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/exports.js'), 'utf8') + '\n;this.EXPORTS=EXPORTS;', ctx, { filename: 'src/exports.js' });
vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/convert.js'), 'utf8') + '\n;this.CONVERT=CONVERT;', ctx, { filename: 'src/convert.js' });
const dict = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/aixm_dictionary.json'), 'utf8'));
const T = path.join(ROOT, 'testdata');

async function open(f) { const ds = await parse(path.join(T, f)); ds.file = new File([fs.readFileSync(path.join(T, f))], f); return ds; }
// the worker on parts [start, end) of a file, as the browser runs it (parallel threads on byte ranges)
async function scan(file, sn, cuts) {
  const v = /^5\.2/.test(sn.version) ? '5.2' : sn.version === '5.1.1' ? '5.1.1' : '5.1';
  const names = Object.keys(dict.v5.featureVersions).filter((k) => dict.v5.featureVersions[k].includes(v)), recs = [], lines = [];
  for (let p = 0; p < cuts.length - 1; p++) {
    await new Promise((resolve) => {
      const sb = Object.assign({}, ctx);
      sb.self = { postMessage(m) { if (m.type === 'batch') recs.push(...m.recs); if (m.type === 'done') { lines[p] = m.lines; resolve(); } if (m.type === 'error') throw new Error(m.msg); } };
      vm.createContext(sb);
      vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/worker.js'), 'utf8'), sb);
      sb.self.onmessage({ data: { cmd: 'scan', file, start: cuts[p], end: cuts[p + 1], part: p, jobId: 1, chunk: 4096, cfg: { family: sn.family, names, aixmPrefixes: sn.aixmPrefixes, eventPrefixes: sn.eventPrefixes, gmlPrefixes: sn.gmlPrefixes, isUpdate: sn.isUpdate } } });
    });
  }
  return { recs, lines };
}

test('file names say what is in the file', () => {
  const X = ctx.EXPORTS, d = { state: 'REPUBLIC OF DONLON', airac: { id: '2511' }, family: '5', version: '5.1.1' };
  assert.equal(X.fileName({ ds: d, what: 'EADD AD 2.12 Runway physical characteristics' }, '.pdf'), 'REPUBLIC-OF-DONLON_EADD-AD-2.12-Runway-physical-characteristics_AIRAC2511.pdf');
  assert.equal(X.scopeName({ title: 'REPUBLIC OF DONLON — AIP data (GEN, ENR, AD)', ds: d }, '.xlsx'), 'REPUBLIC-OF-DONLON_AIP-data-GEN-ENR-AD_AIRAC2511.xlsx');
  assert.equal(X.fileName({ ds: d, what: ['REPUBLIC OF DONLON — AIRAC 2511', 'map'] }, '.png'), 'REPUBLIC-OF-DONLON_map_AIRAC2511.png');
  assert.equal(X.fileName({ ds: d, what: 'Changes AIRAC 2510 to AIRAC 2511' }, '.pdf'), 'REPUBLIC-OF-DONLON_Changes-AIRAC-2510-to-AIRAC-2511.pdf');
  assert.equal(X.fileName({ ds: d, what: ['EADD', 'AD2.12 AD2.13'], tag: X.versionTag(d) }, '.xml'), 'REPUBLIC-OF-DONLON_EADD_AD2.12-AD2.13_AIXM-5.1.1_AIRAC2511.xml');
  assert.equal(X.fileName({ datasets: [d, { state: 'Côte d’Ivoire', airac: { id: '2510' } }], what: 'merged' }, '.xml'), 'REPUBLIC-OF-DONLON-Cote-d-Ivoire_merged_AIRAC2510-2511.xml');
  assert.equal(X.fileName({ datasets: ['A', 'B', 'C', 'D'].map((s) => ({ state: s })), what: 'merged', tag: 'AIXM-5.2' }, '.xml'), '4-States_merged_AIXM-5.2.xml');
  assert.equal(X.fileName({ ds: d, what: 'x'.repeat(400) }, '.pdf').length, 150);
  assert.equal(X.fileName({}, '.json'), 'aixm.json');
});

test('features inside an XML comment are not read, also by a thread that starts inside the comment', async () => {
  const f = (id, n) => '  <message:hasMember>\n    <aixm:DesignatedPoint gml:id="uuid.' + id + '">\n      <gml:identifier codeSpace="urn:uuid:">' + id + '</gml:identifier>\n      <aixm:timeSlice><aixm:DesignatedPointTimeSlice gml:id="TS' + n + '"><aixm:interpretation>BASELINE</aixm:interpretation><aixm:designator>P' + n + '</aixm:designator></aixm:DesignatedPointTimeSlice></aixm:timeSlice>\n    </aixm:DesignatedPoint>\n  </message:hasMember>\n';
  const ids = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000004'];
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<message:AIXMBasicMessage xmlns:message="http://www.aixm.aero/schema/5.1.1/message" xmlns:aixm="http://www.aixm.aero/schema/5.1.1" xmlns:gml="http://www.opengis.net/gml/3.2">\n' +
    f(ids[0], 1) + '<!-- taken out:\n' + f(ids[1], 2) + f(ids[2], 3) + '-->\n' + f(ids[3], 4) + '</message:AIXMBasicMessage>\n';
  const file = new File([xml], 't.xml'), sn = ctx.AX.sniff(xml, 't.xml'), c0 = xml.indexOf('<!--'), c1 = xml.indexOf('-->');
  for (const cuts of [[0, file.size], [0, c0 + 2, file.size], [0, c0 + 40, file.size], [0, Math.floor((c0 + c1) / 2), c1 + 1, file.size], [0, c1 + 3, file.size]]) {
    const r = await scan(file, sn, cuts);
    assert.deepEqual(Array.from(r.recs, (x) => x.id).sort(), [ids[0], ids[3]], 'threads cut at ' + cuts.join(','));
    assert.equal(r.lines.reduce((a, b) => a + b, 0), xml.split('\n').length - 1, 'lines counted at ' + cuts.join(','));
  }
});

test('several data sets in one AIXM file, read back as one data set each', async () => {
  const a = await open('Donlon_ALL_Baseline_2025.xml'), b = await open('Donlon_EADD_changes_AIRAC2611.xml'), c = await open('sample_aixm45_snapshot.xml'), e = await open('chicago_runways_51.xml');
  b.state = 'SECOND STATE';
  const list = [a, b, c, e], res = await ctx.CONVERT.merge(list, { target: '5.1.1' });
  const buf = Buffer.from(await res.blob.arrayBuffer()), text = buf.toString('utf8'), file = new File([buf], 'merged.xml'), head = text.slice(0, 262144);
  assert.equal((text.match(/<message:AIXMBasicMessage\b/g) || []).length, 1);
  assert.match(res.report.notes.join('\n'), /4 data sets in one AIXM 5\.1\.1 file/);
  assert.match(res.report.notes.join('\n'), /feature\(s\) are in more than one data set/);
  // gml:id values stay unique, except those the inputs repeat themselves (the Chicago sample)
  const counts = {};
  (text.match(/\sgml:id="[^"]*"/g) || []).forEach((x) => { counts[x] = (counts[x] || 0) + 1; });
  const own = {};
  (fs.readFileSync(path.join(T, 'chicago_runways_51.xml'), 'utf8').match(/\sgml:id="[^"]*"/g) || []).forEach((x) => { own[x.replace(/"$/, '_p4"')] = (own[x.replace(/"$/, '_p4"')] || 0) + 1; });
  assert.deepEqual(Object.keys(counts).filter((k) => counts[k] > 1 && counts[k] !== own[k]), []);
  const sn = ctx.AX.sniff(head, 'merged.xml'), parts = await ctx.CONVERT.mergedPartsOf(file, head, sn);
  assert.deepEqual(Array.from(parts, (p) => p.state), ['REPUBLIC OF DONLON', 'SECOND STATE', 'FRANCE', e.state]);
  const lines = text.split('\n');
  for (const p of parts) {
    const r = await scan(file, sn, [p.b, p.to]), want = list[p.k - 1];
    const ds = { name: p.name, sniff: sn, family: '5', version: sn.version, recs: r.recs.map((x) => Object.assign(x, { w: 1 })), partLines: [p.line - 1, r.lines[0]] };
    ctx.MODEL.finalize(ds);
    if (want.family === '5') assert.deepEqual(Array.from(ds.recs, (x) => x.k + x.id).sort(), Array.from(want.recs, (x) => x.k + x.id).sort(), 'features of part ' + p.k);
    else assert.equal(ds.recs.length, 40, 'AIXM 4.5: the features with an AIXM 5 equivalent');
    ds.recs.forEach((x) => { assert.equal(buf[x.o], 0x3c); assert.ok(lines[x.line - 1].includes(':' + x.k), 'line of ' + x.k + ' in part ' + p.k); });
  }
  // bytes moved (the file edited): the parts are found by their comments
  const ed = Buffer.from(text.replace('\n', '\n<!-- edited -->\n')), edFile = new File([ed], 'edited.xml');
  const moved = await ctx.CONVERT.mergedPartsOf(edFile, ed.toString('utf8').slice(0, 262144), null);
  assert.deepEqual(Array.from(moved, (p) => [p.k, p.b - parts[p.k - 1].b, p.line - parts[p.k - 1].line]), [[1, 16, 1], [2, 16, 1], [3, 16, 1], [4, 16, 1]]);
  // a file that is not a merged one
  assert.equal(ctx.CONVERT.mergedParts(fs.readFileSync(path.join(T, 'ifp_test_EADD.xml'), 'utf8')), null);
});
