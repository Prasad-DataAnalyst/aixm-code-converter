// AIXM Code Converter - Copyright 2026 Prasad <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Node test harness for src/core.js + src/worker.js (runs the worker logic in-process).
// Usage: node tools/test_parse.js <file.xml> [parts]
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const dict = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/aixm_dictionary.json'), 'utf8'));
const AX = require(path.join(ROOT, 'src/core.js'));

function featureNames(sn) {
  if (sn.family === '45') return Object.keys(dict.v45.features);
  const v = /^5\.2/.test(sn.version) ? '5.2' : sn.version === '5.1.1' ? '5.1.1' : '5.1';
  return Object.keys(dict.v5.featureVersions).filter((k) => dict.v5.featureVersions[k].includes(v));
}

async function runWorkerScan(file, sn, parts) {
  const recs = []; const done = [];
  const size = file.size;
  const cfg = {
    family: sn.family, names: featureNames(sn), aixmPrefixes: sn.aixmPrefixes, eventPrefixes: sn.eventPrefixes,
    gmlPrefixes: sn.gmlPrefixes, isUpdate: sn.isUpdate, effective: sn.header && sn.header.effective,
  };
  const jobs = [];
  for (let i = 0; i < parts; i++) {
    const start = Math.floor((size * i) / parts), end = Math.floor((size * (i + 1)) / parts);
    jobs.push(new Promise((resolve) => {
      const sandbox = { TextDecoder, Uint8Array, console, AX, Promise, Math, String, RegExp, Object, Array, JSON, Date };
      sandbox.self = {
        postMessage(msg) {
          if (msg.type === 'batch') recs.push(...msg.recs);
          else if (msg.type === 'done') { done[i] = msg; resolve(); }
          else if (msg.type === 'error') { console.error('WORKER ERROR', msg.msg); resolve(); }
        },
      };
      vm.createContext(sandbox);
      vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/worker.js'), 'utf8'), sandbox);
      sandbox.self.onmessage({ data: { cmd: 'scan', file, start, end, cfg, jobId: 1, part: i, chunk: +(process.env.CHUNK || 65536) } });
    }));
  }
  await Promise.all(jobs);
  // line fix-up
  const pre = [0];
  for (let i = 0; i < parts; i++) pre[i + 1] = pre[i] + done[i].lines;
  recs.forEach((r) => { r.line = pre[r.w] + r.l + 1; });
  return { recs, totalLines: pre[parts] };
}

(async () => {
  const fp = process.argv[2];
  const parts = +(process.argv[3] || 3);
  const buf = fs.readFileSync(fp);
  const file = new File([buf], path.basename(fp));
  const head = buf.subarray(0, 65536).toString('utf8');
  const sn = AX.sniff(head, path.basename(fp));
  console.log('sniff:', sn.family, sn.versionLabel, 'prefixes', sn.aixmPrefixes, sn.header);
  const t0 = Date.now();
  const { recs, totalLines } = await runWorkerScan(file, sn, parts);
  const t1 = Date.now();
  const byK = {};
  recs.forEach((r) => (byK[r.k] = (byK[r.k] || 0) + 1));
  console.log('records', recs.length, 'in', t1 - t0, 'ms; lines', totalLines, 'actual', buf.toString('utf8').split('\n').length);
  console.log(Object.entries(byK).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ':' + v).join('  '));
  // verify offsets + line numbers
  const text = buf.toString('latin1');
  let bad = 0;
  if (!process.env.NOVERIFY) for (const r of recs) {
    const frag = text.slice(r.o, r.o + 60);
    if (frag[0] !== '<') bad++;
    const ln = text.slice(0, r.o).split('\n').length;
    if (ln !== r.line) { bad++; if (bad < 5) console.log('line mismatch', r.k, r.line, ln); }
  }
  console.log('offset/line problems:', bad);
  const ids = new Set(); let dup = 0;
  recs.forEach((r) => { if (ids.has(r.id + '|' + r.o)) dup++; ids.add(r.id + '|' + r.o); });
  console.log('duplicates:', dup);
  if (process.argv[4]) {
    const r = recs.find((x) => x.k === process.argv[4]);
    console.log(JSON.stringify(r, null, 1).slice(0, 4000));
  }
})();
