// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Download / traffic statistics: CSV round trip and history merge (tools/stats.js).
const test = require('node:test');
const assert = require('node:assert');
const S = require('../../stats.js');

test('CSV round trip keeps commas and quotes', () => {
  const rows = [{ date: '2026-10-01', referrer: 'a,b "c"', views_14d: 3 }];
  const back = S.parseCsv(S.toCsv(['date', 'referrer', 'views_14d'], rows)).rows;
  assert.deepStrictEqual(back, [{ date: '2026-10-01', referrer: 'a,b "c"', views_14d: '3' }]);
});

test('history merge: same day is replaced, new days are added, sorted by date', () => {
  const old = [{ date: '2026-10-02', views: '5' }, { date: '2026-10-01', views: '2' }];
  const merged = S.upsert(old, [{ date: '2026-10-02', views: 9 }, { date: '2026-10-03', views: 1 }], ['date']);
  assert.deepStrictEqual(merged.map((r) => r.date + ':' + r.views), ['2026-10-01:2', '2026-10-02:9', '2026-10-03:1']);
});

test('summary totals the downloads of all time', () => {
  const md = S.summary({ today: '2026-10-01', note: '', views: [], clones: [], refs: [], pages: [],
    repo: [{ date: '2026-10-01', stars: 4, forks: 1, watchers: 2 }],
    downloads: [{ date: '2026-09-30', release: 'v1.0.0', file: 'x.html', downloads: 1 },
      { date: '2026-10-01', release: 'v1.0.0', file: 'x.html', downloads: 7 }, { date: '2026-10-01', release: 'v1.0.0', file: 'x.zip', downloads: 2 }] });
  assert.match(md, /HTML file\), all time \| \*\*7\*\*/);
  assert.match(md, /All release files, all time \(HTML, ZIP, checksums\) \| \*\*9\*\*/);
  assert.match(md, /4 · 1 · 2/);
});

test('deleted releases keep their last count in the all-time totals', () => {
  const downloads = [
    { date: '2026-10-14', release: 'v1.2.0', file: 'AIXM-Code-Converter.html', downloads: '26' },
    { date: '2026-10-14', release: 'v1.25.0', file: 'AIXM-Code-Converter.html', downloads: '10' },
    { date: '2026-10-15', release: 'v1.2.0', file: 'AIXM-Code-Converter.html', downloads: '26' },
    { date: '2026-10-15', release: 'v1.25.0', file: 'AIXM-Code-Converter.html', downloads: '14' },
    { date: '2026-10-15', release: 'v1.25.0', file: 'AIXM-Code-Converter.zip', downloads: '2' },
    { date: '2026-10-16', release: 'v1.28.1', file: 'AIXM-Code-Converter.html', downloads: '3' },
    { date: '2026-10-16', release: 'v1.28.1', file: 'SHA256SUMS.txt', downloads: '1' }];
  assert.strictEqual(S.allTime(downloads).reduce((a, r) => a + r.downloads, 0), 46);
  assert.strictEqual(S.allTime(downloads, '2026-10-14').reduce((a, r) => a + r.downloads, 0), 36);
  const md = S.summary({ today: '2026-10-16', note: '', views: [], clones: [], refs: [], pages: [], repo: [], downloads });
  assert.match(md, /HTML file\), all time \| \*\*43\*\*/);
  assert.match(md, /Current release v1\.28\.1: HTML file \| 3 \|/);
  assert.match(md, /\| 2026-10-16 \| 3 \| 43 \|/);
  assert.match(md, /\| 2026-10-15 \| 4 \| 40 \|/);
  assert.match(md, /\| v1\.28\.1 \| 3 \| 0 \| 1 \| current \|[\s\S]*\| v1\.25\.0 \| 14 \| 2 \| 0 \| removed \|[\s\S]*\| v1\.2\.0 \| 26 \| 0 \| 0 \| removed \|/);
});
