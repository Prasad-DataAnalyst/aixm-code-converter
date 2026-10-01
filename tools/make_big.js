// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Makes a large AIXM 5.x test file from a small one: the features are repeated with unique UUIDs and gml:ids (references
// inside each copy stay consistent) until the target size is reached. Used for the large-file benchmark (bench_big.js).
// Usage: node tools/make_big.js <input.xml> <size in MB> <output.xml>
'use strict';
const fs = require('fs');
const [input, mb, output] = process.argv.slice(2);
if (!input || !mb || !output) { console.error('usage: node tools/make_big.js <input.xml> <size MB> <output.xml>'); process.exit(1); }
const src = fs.readFileSync(input, 'utf8');
const first = src.indexOf('<message:hasMember'), last = src.lastIndexOf('</message:hasMember>') + '</message:hasMember>'.length;
if (first < 0 || last < first) throw new Error('no message:hasMember in ' + input);
const head = src.slice(0, first), body = src.slice(first, last), tail = src.slice(last);
const UUID = /([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-)([0-9a-fA-F]{4})([0-9a-fA-F]{8})/g;
const GMLID = /gml:id="([^"]+)"/g;
const target = +mb * 1048576, out = fs.openSync(output, 'w');
let size = 0, copies = 0;
const write = (s) => { fs.writeSync(out, s); size += Buffer.byteLength(s); };
write(head);
while (size < target) {
  const tag = (copies + 0x1000).toString(16); // 4 hex digits, unique per copy
  write(copies === 0 ? body : body.replace(UUID, (m, a, b, c) => a + tag + c).replace(GMLID, (m, id) => 'gml:id="' + id + '_c' + copies + '"'));
  write('\n');
  copies++;
}
write(tail);
fs.closeSync(out);
console.log('Wrote ' + output + ': ' + (size / 1048576).toFixed(0) + ' MB, ' + copies + ' copies of ' + input);
