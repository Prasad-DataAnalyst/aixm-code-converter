// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Unit tests (node --test): obstacle icons by kind (src/obsicon.js) — the kind from type and name, every kind drawn.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const I = require(path.join(__dirname, '..', '..', '..', 'src', 'obsicon.js'));

test('kind of an obstacle from its type and name (AIXM, eTOD tables, FAA DOF, NOTAM)', () => {
  const cases = [['BUILDING', '', 'building'], ['OTHER:BUILDING LIT', '', 'building'], ['WINDMILL_FARMS', '', 'windmill'], ['WIND TURBINE', '', 'windmill'], ['CRANE', '', 'crane'],
    ['', 'MOBILE CRANE 3', 'crane'], ['TOWER', '', 'tower'], ['T-L TWR', '', 'pylon'], ['ANTENNA', '', 'antenna'], ['TREE', '', 'tree'], ['STACK', '', 'stack'],
    ['TANK', '', 'tank'], ['SPIRE', '', 'spire'], ['NATURAL_HIGHPOINT', '', 'peak'], ['POLE', '', 'pole'], ['', '', 'other'], ['MONUMENT', '', 'monument']];
  cases.forEach(([t, n, k]) => assert.equal(I.kindOf(t, n), k, t + ' / ' + n));
});

test('kind: whole words, the type first, the name only making a general type more precise; airport kinds', () => {
  const cases = [
    // words inside other words are not read (STREET is no TREE, ASPIRE no SPIRE, RIGHT no RIG, DOMESTIC no DOME)
    ['', 'ELECTRICAL POLE STREET 5', 'pole'], ['POLE', 'STREET 12', 'pole'], ['TOWER', 'ASPIRE TOWER', 'tower'], ['', 'RIGHT OF WAY', 'other'], ['BUILDING', 'DOMESTIC TERMINAL', 'building'],
    // the type comes first; the name refines it, never replaces it
    ['BUILDING', 'BUILDING SPIRE LIT', 'building'], ['BUILDING', 'BUILDING_HOIST', 'building'], ['BUILDING', 'HANGAR 3', 'hangar'], ['POLE', 'STREET LIGHT POLE', 'lamp'], ['POLE', 'WIND SOCK 27', 'windsock'],
    ['TOWER', 'CONTROL TOWER', 'ctower'], ['TOWER', 'WATER TOWER', 'watertower'], ['STACK', 'FLARE_STACK', 'stack'], ['OTHER:CRANE', 'DOCK CRANE', 'crane'], ['ANTENNA', 'COMMS MAST LIT', 'antenna'],
    // airport obstacles
    ['', 'TAXIWAY GUIDANCE SIGN', 'sign'], ['SIGN', '', 'sign'], ['', 'APRON FLOODLIGHT MAST', 'lamp'], ['', 'APPROACH LIGHT STRUCTURE', 'als'], ['', 'PAPI 09L', 'als'], ['', 'WINDSOCK', 'windsock'],
    ['NAVAID', 'LOCALIZER 27R', 'loc'], ['NAVAID', 'GLIDE PATH 09L', 'gp'], ['NAVAID', 'DVOR/DME', 'vor'], ['ANTENNA', 'RADAR SSR', 'radar'], ['NAVAID', 'NDB', 'antenna'], ['', 'ATC TOWER', 'ctower'],
    // AIXM types
    ['CONTROL_TOWER', '', 'ctower'], ['COOLING_TOWER', '', 'cooling'], ['WATER_TOWER', '', 'watertower'], ['ELECTRICAL_SYSTEM', '', 'pole'], ['ELECTRICAL_EXIT_LIGHT', '', 'lamp'], ['FENCE', '', 'wall'],
    ['STADIUM', '', 'stadium'], ['POWER_PLANT', '', 'utility'], ['TRANSMISSION_LINE', '', 'pylon'], ['NAVAID', '', 'antenna'], ['', 'PALM TREE', 'tree'], ['', 'STREET', 'other']];
  cases.forEach(([t, n, k]) => assert.equal(I.kindOf(t, n), k, t + ' / ' + n));
});

test('models or dots: one choice, kept', () => {
  global.localStorage = { v: {}, getItem(k) { return this.v[k] || null; }, setItem(k, v) { this.v[k] = v; } };
  try {
    assert.equal(I.mapStyle(), 'models');
    assert.equal(I.mapStyle('dots'), 'dots'); assert.equal(I.mapStyle(), 'dots'); assert.equal(global.localStorage.v['aixm-obs-style'], 'dots');
    assert.equal(I.mapStyle('nonsense'), 'dots'); assert.equal(I.mapStyle('models'), 'models');
  } finally { delete global.localStorage; }
});

test('every kind has a name, an SVG icon and one path for the canvas', () => {
  Object.keys(I.KIND_NAME).forEach((k) => {
    assert.ok(I.ICON[k], 'drawing of ' + k);
    const svg = I.svg(k, { size: 20, ring: '#c62828', notam: true });
    assert.match(svg, /^<svg[^>]+width="20"/); assert.match(svg, /#c62828/); assert.match(svg, /#ffb300/);
  });
  assert.match(I.legendHtml([['crane', 3]], { cls: 'x' }), /class="x"[\s\S]*Crane <small>3<\/small>/);
  assert.equal(I.light('#e0a800'), true); assert.equal(I.light('#1d4e89'), false);
});

test('canvas drawing: rect, circle and ellipse as path data', () => {
  const seen = [];
  global.Path2D = function (d) { seen.push(d); };
  try {
    ['building', 'antenna', 'tank'].forEach((k) => assert.ok(I.pathOf(k)));
    assert.match(seen[0], /^M5 6h14v15h-14z /);
    assert.match(seen[1], /M10\.6 5\.5a1\.4 1\.4 0 1 0 2\.8 0a1\.4 1\.4 0 1 0 -2\.8 0z/);
    assert.match(seen[2], /^M5 7a7 2\.6 0 1 0 14 0/);
    const calls = [];
    const ctx = new Proxy({}, { get: (o, k) => (k in o ? o[k] : (...a) => calls.push([k, a])), set: (o, k, v) => { o[k] = v; return true; } });
    I.draw(ctx, 'building', 50, 60, 12, { fill: '#e0a800' });
    assert.ok(calls.some((c) => c[0] === 'arc' && c[1][0] === 50 && c[1][1] === 60 && c[1][2] === 12));
    assert.ok(calls.some((c) => c[0] === 'stroke' && c[1].length === 1), 'drawing stroked');
    assert.equal(ctx.strokeStyle, '#2b2200'); // dark drawing on the light (lighted) colour
  } finally { delete global.Path2D; }
});

test('3D models: every kind on its pad, inside the 32 x 40 grid, with the light and the NOTAM badge', () => {
  Object.keys(I.KIND_NAME).forEach((k) => {
    const parts = I.parts3d(k, { fill: '#123456', lit: true, notam: true });
    assert.ok(parts.length >= 5, k + ': parts');
    assert.equal(parts[0].f, '#123456', k + ': the pad first, in the colour of the result');
    assert.ok(parts.some((q) => q.f === '#ff1744'), k + ': red obstruction light');
    assert.ok(parts.some((q) => q.f === '#ffb300' && /^M27 0\.6/.test(q.d)), k + ': NOTAM badge');
    parts.forEach((q) => {
      for (const m of q.d.matchAll(/[MLQ](-?[\d.]+) (-?[\d.]+)/g)) {
        const x = +m[1], y = +m[2];
        assert.ok(x >= -1 && x <= 33 && y >= -1 && y <= 41, k + ': point ' + x + ' ' + y + ' outside the grid');
      }
    });
    const svg = I.svg3d(k, { h: 40, fill: '#123456' });
    assert.match(svg, /^<svg[^>]+viewBox="0 0 32 40" width="32" height="40"/);
    assert.equal((svg.match(/<path /g) || []).length, I.parts3d(k, { fill: '#123456' }).length);
  });
  assert.equal(I.parts3d('nothing-known').length, I.parts3d('other').length, 'an unknown kind is drawn as other');
  assert.match(I.legendHtml(['crane'], { d3: true, size: 24 }), /viewBox="0 0 32 40"[^>]*height="24"/);
});
