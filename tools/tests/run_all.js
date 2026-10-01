// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Runs every browser test in this folder against the built AIXM-Code-Converter.html.
// Usage: node tools/tests/run_all.js [name-filter]      (build first: node tools/build.js)
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const filter = new RegExp(process.argv[2] || '.');
const tests = fs.readdirSync(__dirname).filter((f) => /\.js$/.test(f) && !/^(_|run_all)/.test(f) && filter.test(f)).sort();
let failed = 0;
for (const t of tests) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(__dirname, t)], { encoding: 'utf8', timeout: 600000 });
  const ok = r.status === 0;
  if (!ok) failed++;
  console.log((ok ? 'PASS ' : 'FAIL ') + t.padEnd(26) + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
  if (!ok || process.env.VERBOSE) console.log((r.stdout || '') + (r.stderr || ''));
}
console.log(failed ? failed + ' test(s) failed' : 'all ' + tests.length + ' tests passed');
process.exitCode = failed ? 1 : 0;
