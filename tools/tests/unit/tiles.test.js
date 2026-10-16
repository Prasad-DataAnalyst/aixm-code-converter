// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// TILES: recognising the "Map data not yet available" tile of the Esri servers (size and FNV-1a checksum).
const test = require('node:test');
const assert = require('node:assert');
const T = require('../../../src/tiles.js');

test('FNV-1a checksum matches the published test vectors', () => {
  assert.strictEqual(T.sum(new Uint8Array(0)), 0x811c9dc5);
  assert.strictEqual(T.sum(Buffer.from('a')), 0xe40c292c);
  assert.strictEqual(T.sum(Buffer.from('hello')), 0x4f9f2cab);
});

test('only a tile with the length and the checksum of the placeholder is the placeholder', () => {
  const saved = { len: T.config.len, sum: T.config.sum };
  const ph = Buffer.from('placeholder tile bytes');
  T.config.len = ph.length; T.config.sum = T.sum(ph);
  assert.ok(T.isPlaceholder(ph));
  assert.ok(T.isPlaceholder(new Uint8Array(ph).buffer));
  assert.ok(!T.isPlaceholder(Buffer.from('placeholder tile byteX')), 'same length, other bytes');
  assert.ok(!T.isPlaceholder(Buffer.from('placeholder tile bytes!')), 'other length');
  Object.assign(T.config, saved);
});

test('the built-in constants are those of the real Esri tile (2,521 bytes)', () => {
  assert.strictEqual(T.config.len, 2521);
  assert.strictEqual(T.config.sum, 0x92d9118f);
});
