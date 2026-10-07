// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Unit tests (node --test): 4D, the data at a chosen time (src/fourd.js).
// - sunrise and sunset, the daylight saving periods and the AIRAC cycles are right;
// - AIXM timesheets: days and day ranges, working days and holidays, windows over midnight, sunrise / sunset with
//   offsets, local time references, the daylight saving adjustment, date ranges and excluded periods;
// - the airspace of Donlon has active, possible and inactive times; a procedure flown at a ground speed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { ctx, parse, ROOT } = require('../../harness');
vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/fourd.js'), 'utf8') + ';this.FOURD=FOURD;', ctx, { filename: 'src/fourd.js' });
const F = ctx.FOURD;
const U = (y, m, d, h, mi) => Date.UTC(y, m - 1, d, h || 0, mi || 0);
const o = { hol: new Set(), dst: 'EU' };
const LONDON = [-0.1276, 51.5072];
const near = (a, b, min) => Math.abs(a - b) <= min * 60000;

test('sunrise and sunset', () => {
  const s = F.sun(LONDON[0], LONDON[1], U(2026, 6, 21));
  assert.ok(near(s.sr, U(2026, 6, 21, 3, 43), 3), new Date(s.sr).toISOString());
  assert.ok(near(s.ss, U(2026, 6, 21, 20, 21), 3), new Date(s.ss).toISOString());
  const w = F.sun(LONDON[0], LONDON[1], U(2026, 12, 21));
  assert.ok(near(w.sr, U(2026, 12, 21, 8, 4), 3) && near(w.ss, U(2026, 12, 21, 15, 54), 3));
  assert.equal(F.sun(20, 78, U(2026, 12, 21)).polar, 'night'); // Svalbard
  assert.equal(F.sun(20, 78, U(2026, 6, 21)).polar, 'day');
});

test('daylight saving and AIRAC', () => {
  assert.deepEqual(Array.from(F.dstSpan(2026, 'EU')), [U(2026, 3, 29, 1), U(2026, 10, 25, 1)]);
  assert.deepEqual(Array.from(F.dstSpan(2026, 'US')), [U(2026, 3, 8, 7), U(2026, 11, 1, 6)]);
  assert.ok(F.inDst(U(2026, 7, 1), 'EU') && !F.inDst(U(2026, 1, 1), 'EU') && !F.inDst(U(2026, 7, 1), 'none'));
  assert.equal(F.airac(U(2020, 1, 2)).id, '2001');
  assert.equal(F.airac(U(2026, 1, 22)).id, '2601');
  const a = F.airac(U(2026, 10, 7));
  assert.equal(a.id, '2610'); assert.equal(a.start, U(2026, 10, 1)); assert.equal(a.end, U(2026, 10, 29));
  assert.equal(F.airac(U(2026, 12, 31)).id, '2613');
  assert.equal(F.refOffset('UTC+3'), 180); assert.equal(F.refOffset('UTC-05:30'), -330); assert.equal(F.refOffset('UTC'), 0);
});

test('timesheets', () => {
  const ts = (x) => Object.assign({ timeReference: 'UTC', daylightSavingAdjust: 'NO', excluded: 'NO' }, x);
  const work = ts({ day: 'WORK_DAY', startTime: '07:00', endTime: '16:00' });
  assert.equal(F.tsCovers(work, U(2026, 10, 7, 10), o, LONDON), true);  // Wednesday
  assert.equal(F.tsCovers(work, U(2026, 10, 7, 16), o, LONDON), false); // the end is not in
  assert.equal(F.tsCovers(work, U(2026, 10, 10, 10), o, LONDON), false); // Saturday
  assert.equal(F.tsCovers(work, U(2026, 10, 7, 10), { hol: new Set(['2026-10-07']), dst: 'EU' }, LONDON), false); // a holiday
  assert.equal(F.tsCovers(ts({ day: 'HOL', startTime: '00:00', endTime: '24:00' }), U(2026, 10, 7, 10), { hol: new Set(['2026-10-07']), dst: 'EU' }, LONDON), true);
  // day ranges, also over the weekend
  assert.equal(F.tsCovers(ts({ day: 'MON', dayTil: 'FRI', startTime: '00:00', endTime: '24:00' }), U(2026, 10, 9, 23), o, LONDON), true);
  assert.equal(F.tsCovers(ts({ day: 'FRI', dayTil: 'MON', startTime: '00:00', endTime: '24:00' }), U(2026, 10, 11, 12), o, LONDON), true); // Sunday
  assert.equal(F.tsCovers(ts({ day: 'FRI', dayTil: 'MON', startTime: '00:00', endTime: '24:00' }), U(2026, 10, 7, 12), o, LONDON), false);
  // over midnight: Wednesday 22:00 - 06:00 covers Thursday 02:00
  const night = ts({ day: 'WED', startTime: '22:00', endTime: '06:00' });
  assert.equal(F.tsCovers(night, U(2026, 10, 8, 2), o, LONDON), true);
  assert.equal(F.tsCovers(night, U(2026, 10, 8, 7), o, LONDON), false);
  // sunrise to sunset, and 30 minutes before sunrise
  const day = ts({ day: 'ANY', startEvent: 'SR', endEvent: 'SS' });
  assert.equal(F.tsCovers(day, U(2026, 6, 21, 4), o, LONDON), true);
  assert.equal(F.tsCovers(day, U(2026, 6, 21, 3, 30), o, LONDON), false);
  assert.equal(F.tsCovers(ts({ day: 'ANY', startEvent: 'SR', startTimeRelativeEvent: { v: '-30', u: 'MIN' }, endEvent: 'SS' }), U(2026, 6, 21, 3, 30), o, LONDON), true);
  // earliest of 06:00 and sunrise
  assert.equal(F.tsCovers(ts({ day: 'ANY', startTime: '06:00', startEvent: 'SR', startEventInterpretation: 'EARLIEST', endTime: '12:00' }), U(2026, 6, 21, 5), o, LONDON), true);
  assert.equal(F.tsCovers(ts({ day: 'ANY', startTime: '06:00', startEvent: 'SR', startEventInterpretation: 'LATEST', endTime: '12:00' }), U(2026, 6, 21, 5), o, LONDON), false);
  // the daylight saving adjustment: one hour earlier in summer
  const dst = ts({ day: 'ANY', startTime: '08:00', endTime: '16:00', daylightSavingAdjust: 'YES' });
  assert.equal(F.tsCovers(dst, U(2026, 7, 1, 7, 30), o, LONDON), true);
  assert.equal(F.tsCovers(dst, U(2026, 1, 7, 7, 30), o, LONDON), false);
  assert.equal(F.tsCovers(dst, U(2026, 7, 1, 7, 30), { hol: new Set(), dst: 'none' }, LONDON), false);
  // local time reference: 08:00-10:00 at UTC+3 is 05:00-07:00 UTC
  assert.equal(F.tsCovers(ts({ day: 'ANY', startTime: '08:00', endTime: '10:00', timeReference: 'UTC+3' }), U(2026, 10, 7, 6), o, LONDON), true);
  assert.equal(F.tsCovers(ts({ day: 'ANY', startTime: '08:00', endTime: '10:00', timeReference: 'UTC+3' }), U(2026, 10, 7, 8), o, LONDON), false);
  // dates (DD-MM), also over the new year
  const winter = ts({ day: 'ANY', startTime: '00:00', endTime: '24:00', startDate: '01-10', endDate: '31-03' });
  assert.equal(F.tsCovers(winter, U(2026, 12, 25, 12), o, LONDON), true);
  assert.equal(F.tsCovers(winter, U(2026, 7, 1, 12), o, LONDON), false);
  // excluded periods
  const list = [ts({ day: 'ANY', startTime: '00:00', endTime: '24:00' }), ts({ day: 'SUN', startTime: '00:00', endTime: '24:00', excluded: 'YES' })];
  assert.equal(F.covers(list, U(2026, 10, 7, 12), o, LONDON), true);
  assert.equal(F.covers(list, U(2026, 10, 11, 12), o, LONDON), false);
});

test('schedules: status, H24, NOTAM, outside the hours', () => {
  const tsh = { _t: 'Timesheet', timeReference: 'UTC', day: 'ANY', startTime: '07:00', endTime: '16:00' };
  const E = F.entriesOf({ activation: [{ status: 'ACTIVE', timeInterval: [tsh] }, { status: 'AVBL_FOR_ACTIVATION', timeInterval: [{ nil: 'other:NOTAM' }] }] });
  assert.equal(E.length, 2);
  assert.equal(F.evalEntries(E, U(2026, 10, 7, 10), o, LONDON).st, 'on');
  assert.equal(F.evalEntries(E, U(2026, 10, 7, 20), o, LONDON).st, 'maybe'); // by NOTAM
  assert.equal(F.evalEntries(F.entriesOf({ activation: [{ status: 'ACTIVE', timeInterval: [tsh] }] }), U(2026, 10, 7, 20), o, LONDON).st, 'off');
  assert.equal(F.evalEntries(F.entriesOf({ availability: [{ operationalStatus: 'CLOSED', timeInterval: [tsh] }, { operationalStatus: 'NORMAL', timeInterval: [{ nil: 'other:H24' }] }] }), U(2026, 10, 7, 10), o, LONDON).st, 'off');
  assert.equal(F.evalEntries(F.entriesOf({ _hours: 'HJ' }), U(2026, 6, 21, 12), o, LONDON).st, 'on');
  assert.equal(F.evalEntries(F.entriesOf({ _hours: 'HJ' }), U(2026, 6, 21, 23), o, LONDON).st, 'off');
});

test('Donlon airspace at different times', async () => {
  const ds = await parse(path.join(ROOT, 'testdata/Donlon_ALL_Baseline_2025.xml'));
  const as = ds.byType.Airspace.filter((a) => a.cur.p.activation);
  assert.ok(as.length > 20);
  const seen = { on: 0, maybe: 0, off: 0 };
  [U(2026, 10, 7, 10), U(2026, 10, 7, 22), U(2026, 10, 10, 12), U(2026, 10, 11, 3)].forEach((T) => as.forEach((a) => { const x = F.evalEntries(F.entriesOf(a.cur.p), T, o, [-6, 52]); if (seen[x.st] !== undefined) seen[x.st]++; }));
  assert.ok(seen.on > 0 && seen.maybe > 0 && seen.off > 0, JSON.stringify(seen));
});

test('a procedure flown at a ground speed', () => {
  const p = { label: 'TEST', segs: [{ coords: [[0, 0], [0, 1]], label: 'A · leg 1', legKind: 'TF', alt: 1000, altTxt: '' }, { coords: [[0, 1], [1, 1]], label: 'A · leg 2', legKind: 'TF', alt: 2000, altTxt: '' }] };
  const fp = F.flightPlan(p, 120, U(2026, 10, 7, 10));
  assert.ok(Math.abs(fp.dist - 119.98) < 0.2, String(fp.dist)); // 60 NM + 60 NM (at the equator, then along 1° N)
  assert.equal(fp.legs.length, 2);
  assert.ok(near(fp.legs[0].t, U(2026, 10, 7, 10, 30), 1)); // 60 NM at 120 kt
  const mid = F.posAt(fp, U(2026, 10, 7, 10, 15));
  assert.ok(Math.abs(mid.c[1] - 0.5) < 0.01 && Math.abs(mid.d - 30) < 0.2);
  assert.equal(F.posAt(fp, U(2026, 10, 7, 9)), null);
});
