// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Download and traffic statistics. Run daily by .github/workflows/stats.yml; keeps a history in CSV files on the
// "stats" branch, because GitHub only shows the last 14 days of traffic.
//   downloads.csv  release file download totals per day      repo.csv      stars, forks, watchers per day
//   views.csv      page views / unique visitors per day      clones.csv    clones / unique cloners per day
//   referrers.csv  top referring sites (14-day totals)       pages.csv     most viewed pages (14-day totals)
//   README.md      summary
// GitHub does not give the location of visitors. Traffic needs the TRAFFIC_TOKEN secret (a personal access token with
// "Administration: Read-only" on this repository); without it only downloads and stars are recorded.
// Usage: GITHUB_REPOSITORY=owner/repo GITHUB_TOKEN=... [TRAFFIC_TOKEN=...] node tools/stats.js <output folder>
'use strict';
const fs = require('fs');
const path = require('path');

// ---- CSV with one row per key (later values replace earlier ones for the same key) ----
function parseCsv(text) {
  const lines = text.split('\n').filter((l) => l.trim());
  if (!lines.length) return { header: [], rows: [] };
  const split = (l) => { const out = []; let cur = '', q = false; for (let i = 0; i < l.length; i++) { const c = l[i]; if (q) { if (c === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; } else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c; } out.push(cur); return out; };
  const header = split(lines[0]);
  return { header, rows: lines.slice(1).map((l) => { const v = split(l), o = {}; header.forEach((h, i) => { o[h] = v[i] === undefined ? '' : v[i]; }); return o; }) };
}
function toCsv(header, rows) {
  const cell = (v) => { const s = String(v === undefined || v === null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return [header.join(',')].concat(rows.map((r) => header.map((h) => cell(r[h])).join(','))).join('\n') + '\n';
}
function upsert(existing, add, keys) {
  const k = (r) => keys.map((x) => r[x]).join('\u0001'), map = new Map();
  existing.concat(add).forEach((r) => map.set(k(r), Object.assign({}, map.get(k(r)) || {}, r)));
  return Array.from(map.values()).sort((a, b) => k(a) < k(b) ? -1 : k(a) > k(b) ? 1 : 0);
}
function mergeFile(file, header, add, keys) {
  const old = fs.existsSync(file) ? parseCsv(fs.readFileSync(file, 'utf8')).rows : [];
  const rows = upsert(old, add, keys);
  fs.writeFileSync(file, toCsv(header, rows));
  return rows;
}

// ---- GitHub API ----
async function api(p, token) {
  const r = await fetch('https://api.github.com/repos/' + process.env.GITHUB_REPOSITORY + p, {
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }
  });
  if (!r.ok) throw new Error('GET ' + p + ': HTTP ' + r.status);
  return r.json();
}
async function allReleases(token) {
  const out = [];
  for (let page = 1; page < 50; page++) { const l = await api('/releases?per_page=100&page=' + page, token); out.push(...l); if (l.length < 100) break; }
  return out;
}

async function main() {
  const dir = process.argv[2];
  if (!dir || !process.env.GITHUB_REPOSITORY || !process.env.GITHUB_TOKEN) throw new Error('usage: GITHUB_REPOSITORY=owner/repo GITHUB_TOKEN=... node tools/stats.js <folder>');
  fs.mkdirSync(dir, { recursive: true });
  const f = (n) => path.join(dir, n), today = new Date().toISOString().slice(0, 10), gh = process.env.GITHUB_TOKEN, tt = process.env.TRAFFIC_TOKEN;

  const rel = await allReleases(gh);
  const dl = [];
  rel.forEach((r) => r.assets.forEach((a) => dl.push({ date: today, release: r.tag_name, file: a.name, downloads: a.download_count })));
  const downloads = mergeFile(f('downloads.csv'), ['date', 'release', 'file', 'downloads'], dl, ['date', 'release', 'file']);
  const info = await api('', gh);
  const repo = mergeFile(f('repo.csv'), ['date', 'stars', 'forks', 'watchers'], [{ date: today, stars: info.stargazers_count, forks: info.forks_count, watchers: info.subscribers_count }], ['date']);

  let views = [], clones = [], refs = [], pages = [], note = '';
  if (tt) try {
    const day = (t) => t.slice(0, 10);
    const v = await api('/traffic/views?per=day', tt), c = await api('/traffic/clones?per=day', tt);
    views = mergeFile(f('views.csv'), ['date', 'views', 'unique_visitors'], v.views.map((x) => ({ date: day(x.timestamp), views: x.count, unique_visitors: x.uniques })), ['date']);
    clones = mergeFile(f('clones.csv'), ['date', 'clones', 'unique_cloners'], c.clones.map((x) => ({ date: day(x.timestamp), clones: x.count, unique_cloners: x.uniques })), ['date']);
    refs = mergeFile(f('referrers.csv'), ['date', 'referrer', 'views_14d', 'unique_14d'], (await api('/traffic/popular/referrers', tt)).map((x) => ({ date: today, referrer: x.referrer, views_14d: x.count, unique_14d: x.uniques })), ['date', 'referrer']);
    pages = mergeFile(f('pages.csv'), ['date', 'page', 'views_14d', 'unique_14d'], (await api('/traffic/popular/paths', tt)).map((x) => ({ date: today, page: x.path, views_14d: x.count, unique_14d: x.uniques })), ['date', 'page']);
  } catch (e) {
    note = '\n> Traffic could not be read (' + e.message + '): check that the `TRAFFIC_TOKEN` secret is valid and has "Administration: Read-only" on this repository.\n';
    console.error(note.trim());
  } else note = '\n> Page views, visitors and referring sites are not recorded yet: add the `TRAFFIC_TOKEN` secret (see `tools/stats.js`).\n';

  fs.writeFileSync(f('README.md'), summary({ today, downloads, repo, views, clones, refs, pages, note }));
  console.log('Statistics for ' + today + ' written to ' + dir);
}

// Last download count of every release file recorded on or before a date (all dates when none is given). Files of
// releases deleted later keep their last count, so the all-time totals do not drop when old releases are removed.
function allTime(downloads, upTo) {
  const last = new Map();
  downloads.filter((r) => !upTo || r.date <= upTo).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .forEach((r) => last.set(r.release + '\u0001' + r.file, { release: r.release, file: r.file, downloads: +r.downloads || 0 }));
  return Array.from(last.values());
}
const isHtml = (x) => /\.html$/i.test(x.file);
const kind = (x) => (isHtml(x) ? 'html' : /\.zip$/i.test(x.file) ? 'zip' : /sha256/i.test(x.file) ? 'sums' : 'other');
const vkey = (t) => String(t).replace(/^v/, '').split('.').map((n) => +n || 0);
const newer = (a, b) => { const x = vkey(a), y = vkey(b); for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (y[i] || 0) - (x[i] || 0); return 0; };

function summary(s) {
  const latest = (rows) => rows.filter((r) => r.date === s.today);
  const sum = (rows, k) => rows.reduce((a, r) => a + (+r[k] || 0), 0);
  const dlToday = latest(s.downloads), r = latest(s.repo)[0] || {}, all = allTime(s.downloads);
  const current = new Set(dlToday.map((x) => x.release)), cur = Array.from(current).sort(newer)[0];
  const lines = ['# AIXM Code Converter: downloads and traffic', '', 'Updated ' + s.today + ' (daily). GitHub does not report the location of visitors.', s.note,
    '## Totals', '', '| | |', '|---|---|',
    '| Downloads of the tool (HTML file), all time | **' + sum(all.filter(isHtml), 'downloads') + '** |',
    '| All release files, all time (HTML, ZIP, checksums) | **' + sum(all, 'downloads') + '** |'];
  if (cur) lines.push('| Current release ' + cur + ': HTML file | ' + sum(dlToday.filter((x) => x.release === cur && isHtml(x)), 'downloads') + ' |');
  lines.push('| Stars · forks · watchers | ' + (r.stars || 0) + ' · ' + (r.forks || 0) + ' · ' + (r.watchers || 0) + ' |');
  if (s.views.length) lines.push('| Page views since recording began | ' + sum(s.views, 'views') + ' |', '| Clones since recording began | ' + sum(s.clones, 'clones') + ' |');

  const dates = Array.from(new Set(s.downloads.map((x) => x.date))).sort();
  let prev = 0;
  const daily = dates.map((d) => { const t = sum(allTime(s.downloads, d).filter(isHtml), 'downloads'), row = { date: d, add: t - prev, total: t }; prev = t; return row; });
  if (daily.length) {
    lines.push('', '## New downloads of the HTML file per day (last 30 days recorded)', '', '| Date | New | Total |', '|---|---|---|');
    daily.slice(-30).reverse().forEach((x) => lines.push('| ' + x.date + ' | ' + x.add + ' | ' + x.total + ' |'));
  }

  const per = new Map();
  all.forEach((x) => { const o = per.get(x.release) || { html: 0, zip: 0, sums: 0, other: 0 }; o[kind(x)] += x.downloads; per.set(x.release, o); });
  lines.push('', '## Downloads per release, all time', '', '| Release | HTML | ZIP | Checksums | |', '|---|---|---|---|---|');
  Array.from(per.keys()).sort(newer).forEach((k) => { const o = per.get(k); lines.push('| ' + k + ' | ' + o.html + ' | ' + o.zip + ' | ' + o.sums + ' | ' + (current.has(k) ? 'current' : 'removed') + ' |'); });

  const rf = latest(s.refs).sort((a, b) => b.views_14d - a.views_14d);
  if (rf.length) { lines.push('', '## Where visitors come from (last 14 days)', '', '| Site | Views | Unique visitors |', '|---|---|---|'); rf.forEach((x) => lines.push('| ' + x.referrer + ' | ' + x.views_14d + ' | ' + x.unique_14d + ' |')); }
  const v = s.views.slice(-30).reverse();
  if (v.length) { lines.push('', '## Page views (last 30 days recorded)', '', '| Date | Views | Unique visitors |', '|---|---|---|'); v.forEach((x) => lines.push('| ' + x.date + ' | ' + x.views + ' | ' + x.unique_visitors + ' |')); }
  lines.push('', 'Full history: the CSV files in this branch (open them in Excel). Releases marked "removed" keep the last count recorded before they were deleted.', '');
  return lines.join('\n');
}

module.exports = { parseCsv, toCsv, upsert, summary, allTime };
if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
