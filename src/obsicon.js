/*!
 * AIXM Code Converter
 * Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com> - author of the AIXM Code Converter
 * SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE; keep this notice in all copies)
 * ==========================================================================
 * AIXM Code Converter - obstacle icons by kind (OBSICON)
 * One set of icons for every picture of obstacles: the kind of an obstacle read from its type and name (AIXM
 * obstacle types, eTOD tables, FAA Digital Obstacle File, NOTAM text) - building, tower, antenna / mast, crane, wind
 * turbine, tree, chimney, pole, pylon / power line, tank, dome, spire, rig, bridge, balloon, lighthouse, terrain
 * high point, sign, monument - and its pictures:
 *   3D model   a small model of the structure standing on the obstacle position (block with windows, tower crane with
 *              jib and hook, red and white chimney with smoke, wind turbine with blades, lattice tower, guyed mast,
 *              pylon with its lines, tank, minaret, rig, arch bridge, tethered balloon, lighthouse, mountain, …) on a
 *              pad in the colour of the result, with a red obstruction light when lighted:
 *              svg3d (SVG: the map of the flight and obstacle analysis, legends) and draw3d (canvas: the obstacle map
 *              of the Digital data tab, which may show 100 000 and more obstacles; each model is drawn once and stamped)
 *   badge      the kind as a line drawing in a disc (svg, draw)
 * Plain functions and data only, so it also runs in a separate window.
 * ========================================================================== */
var OBSICON = (function () {
  'use strict';
  function esc(t) { return String(t === undefined || t === null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var KIND_NAME = { building: 'Building', tower: 'Tower', antenna: 'Antenna / mast', crane: 'Crane', windmill: 'Wind turbine', tree: 'Tree / vegetation', stack: 'Chimney / stack',
    pole: 'Pole', pylon: 'Pylon / power line', tank: 'Tank / silo', dome: 'Dome', spire: 'Spire / minaret', rig: 'Rig / platform', bridge: 'Bridge / arch', balloon: 'Tethered balloon',
    lighthouse: 'Lighthouse', peak: 'Terrain / high point', sign: 'Sign', monument: 'Monument', other: 'Other obstacle' };
  // the kind of an obstacle from its type (AIXM CodeVerticalStructureType, OTHER:…, DOF types) and its name
  var RULES = [[/WIND ?(MILL|TURBINE|FARM)|WTG/, 'windmill'], [/CRANE/, 'crane'], [/TREE|VEGETATION|FOREST|PALM/, 'tree'], [/STACK|CHIMNEY|FLARE/, 'stack'], [/TRANSMISSION|CATENARY|CABLE|PYLON|T-L TWR|POWER ?LINE/, 'pylon'],
    [/ANTENNA|NAVAID|MAST|AERIAL|TELECOM|RADAR/, 'antenna'], [/LIGHTHOUSE|LGTHOUSE/, 'lighthouse'], [/COOLING|WATER_TOWER|STORAGE_TANK|TANK|SILO|GRAIN|ELEVATOR/, 'tank'], [/DOME/, 'dome'],
    [/SPIRE|MINARET|STEEPLE/, 'spire'], [/RIG|PLATFORM|DERRICK|REFINERY/, 'rig'], [/BRIDGE|ARCH/, 'bridge'], [/BALLOON|KITE/, 'balloon'], [/NATURAL|HIGHPOINT|TERRAIN|PEAK|HILL/, 'peak'],
    [/SIGN/, 'sign'], [/MONUMENT|STATUE|OBELISK/, 'monument'], [/POLE|LAMP|ELECTRICAL_EXIT/, 'pole'], [/TOWER|TWR/, 'tower'],
    [/BUILDING|BLDG|HANGAR|STADIUM|URBAN|INDUSTRIAL|POWER_PLANT|NUCLEAR|TERMINAL|HOTEL|HOUSE|WALL|FENCE|GATE/, 'building']];
  function kindOf(type, name) {
    var t = String(type || '').toUpperCase().replace(/^OTHER:/, '') + ' ' + String(name || '').toUpperCase();
    for (var i = 0; i < RULES.length; i++) if (RULES[i][0].test(t)) return RULES[i][1];
    return 'other';
  }
  // the drawings, on a 24 x 24 grid, lines only
  var ICON = {
    building: '<rect x="5" y="6" width="14" height="15" rx="1"/><path d="M8.5 9.5h2M13.5 9.5h2M8.5 13h2M13.5 13h2M8.5 16.5h2M13.5 16.5h2"/>',
    tower: '<path d="M12 2L7 22M12 2l5 20M8.7 15h6.6M9.9 10h4.2M7.6 20L16 14.5M16.4 20L8 14.5"/>',
    antenna: '<path d="M12 7v15M9 22h6M12 7l-3.5 13M12 7l3.5 13"/><circle cx="12" cy="5.5" r="1.4"/><path d="M7.5 3.2a6 6 0 0 0 0 4.6M16.5 3.2a6 6 0 0 1 0 4.6"/>',
    crane: '<path d="M7 22V5M3.5 5H21M7 5l3.6-3L21 5M18.5 5v6M17 11h3M5 22h4M7 9l3.5-4M7 13l3-3"/>',
    windmill: '<path d="M12 10.5V22M10 22h4"/><circle cx="12" cy="9" r="1.3"/><path d="M12 7.7V1.8M13.2 9.6l5.2 3M10.8 9.6l-5.2 3"/>',
    tree: '<path d="M12 2.5L5.5 13.5h3.8L6 18.5h12l-3.3-5h3.8z"/><path d="M12 18.5V22"/>',
    stack: '<path d="M9.2 22l1-17h3.6l1 17zM9.8 10h4.4M9.5 15.5h5"/><path d="M12.8 3.6c1.4-1.8 3.4-1.8 4.6-.6"/>',
    pole: '<path d="M12 3v19M8.5 6.5h7M10 22h4"/>',
    pylon: '<path d="M12 2L6.5 22M12 2l5.5 20M4.5 7h15M6.5 12h11M8.2 16l7.6 5M15.8 16l-7.6 5"/>',
    tank: '<ellipse cx="12" cy="7" rx="7" ry="2.6"/><path d="M5 7v11a7 2.6 0 0 0 14 0V7"/>',
    dome: '<path d="M3 20h18M5 20a7 7 0 0 1 14 0M12 13V9"/>',
    spire: '<path d="M12 2l-4 11h8zM8 13v9h8v-9"/>',
    rig: '<path d="M3 16h18M5.5 16v6M18.5 16v6M12 2l-4 14M12 2l4 14M9.2 11h5.6M10.2 7h3.6"/>',
    bridge: '<path d="M2 13h20M3 13q9-9 18 0M6.5 13v8M17.5 13v8M12 8.5V13"/>',
    balloon: '<ellipse cx="12" cy="8" rx="5" ry="6"/><path d="M12 14v8M10.5 22h3"/>',
    lighthouse: '<path d="M9.3 22l1-14h3.4l1 14zM10 8h4V4.5h-4zM8.5 5.5L4.5 3.5M15.5 5.5l4-2M9.8 14h4.4"/>',
    peak: '<path d="M2 21L9 8l4 6 3-4 6 11z"/>',
    sign: '<rect x="5" y="4" width="14" height="8" rx="1"/><path d="M12 12v10M9 22h6"/>',
    monument: '<path d="M10 22l1-17 1-2.5L13 5l1 17zM8 22h8"/>',
    other: '<path d="M12 5v16M8 21h8"/><circle cx="12" cy="4.2" r="1.8"/>'
  };
  // an icon as SVG: the kind drawn in a disc (bg) ringed with a colour (the result); a NOTAM obstacle gets a warning badge
  function svg(kind, o) {
    o = o || {};
    var s = o.size || 26, ring = o.ring || '#455a64', bg = o.bg || '#ffffff', fg = o.fg || '#263238';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="' + s + '" height="' + s + '" aria-hidden="true"><circle cx="12" cy="12" r="10.8" fill="' + bg + '" stroke="' + ring + '" stroke-width="2.4"/>' +
      '<g transform="translate(4.2 4.2) scale(.65)" fill="none" stroke="' + fg + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (ICON[kind] || ICON.other) + '</g>' +
      (o.notam ? '<path d="M18.2 1.2l5 8.6h-10z" fill="#ffb300" stroke="#5d4037" stroke-width=".8"/><path d="M18.2 4.2v2.8M18.2 8.1v.1" stroke="#3e2723" stroke-width="1.2" stroke-linecap="round"/>' : '') + '</svg>';
  }
  // the kinds as a legend: [kind] or [[kind, count]] -> HTML (o: options of svg, or o.d3: the 3D models, o.size pixels
  // high on a pad of colour o.fill; cls: class of each entry)
  function legendHtml(kinds, o) {
    o = o || {};
    return kinds.map(function (k) {
      var n = Array.isArray(k) ? k[1] : null; k = Array.isArray(k) ? k[0] : k;
      var ic = o.d3 ? svg3d(k, { h: o.size || 22, fill: o.fill || '#90a4ae' }) : svg(k, Object.assign({ size: 18 }, o));
      return '<span class="' + (o.cls || 'fs-lg') + '">' + ic + esc(KIND_NAME[k] || k) + (n !== null ? ' <small>' + n + '</small>' : '') + '</span>';
    }).join('');
  }

  /* ------------------------------------------------------------ canvas */
  // the drawings as one path each (rect, circle and ellipse written as path data), made once
  var paths = {};
  function pathOf(kind) {
    if (paths[kind] !== undefined) return paths[kind];
    var d = [];
    String(ICON[kind] || ICON.other).replace(/<(\w+)([^>]*)\/>/g, function (m, tag, at) {
      var a = {};
      at.replace(/([\w-]+)="([^"]*)"/g, function (q, k, v) { a[k] = v; });
      var n = function (k) { return parseFloat(a[k]) || 0; };
      if (tag === 'path') d.push(a.d);
      else if (tag === 'rect') d.push('M' + n('x') + ' ' + n('y') + 'h' + n('width') + 'v' + n('height') + 'h' + -n('width') + 'z');
      else if (tag === 'circle' || tag === 'ellipse') {
        var rx = tag === 'circle' ? n('r') : n('rx'), ry = tag === 'circle' ? n('r') : n('ry');
        d.push('M' + (n('cx') - rx) + ' ' + n('cy') + 'a' + rx + ' ' + ry + ' 0 1 0 ' + 2 * rx + ' 0a' + rx + ' ' + ry + ' 0 1 0 ' + -2 * rx + ' 0z');
      }
      return m;
    });
    try { paths[kind] = typeof Path2D === 'function' ? new Path2D(d.join(' ')) : null; } catch (e) { paths[kind] = null; }
    return paths[kind];
  }
  // a colour light enough to need a dark drawing on it
  function light(c) {
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(c || ''));
    if (!m) return false;
    return (0.299 * parseInt(m[1], 16) + 0.587 * parseInt(m[2], 16) + 0.114 * parseInt(m[3], 16)) / 255 > 0.62;
  }
  // draw the icon of kind at (x, y), radius r (px), on a canvas: a disc of colour fill with a white edge and the drawing
  // in white (dark on a light colour); o: {fill, edge, fg, alpha}
  function draw(ctx, kind, x, y, r, o) {
    o = o || {};
    var fill = o.fill || '#455a64';
    ctx.save();
    ctx.globalAlpha = o.alpha === undefined ? 0.95 : o.alpha;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = fill; ctx.fill();
    ctx.lineWidth = Math.max(1, r * 0.13); ctx.strokeStyle = o.edge || '#ffffff'; ctx.stroke();
    var p = pathOf(kind);
    if (p) {
      var k = r / 10.8, s = 0.65 * k; // as in svg(): the disc has a radius of 10.8 on the 24 grid, the drawing is scaled 0.65
      ctx.globalAlpha = 1;
      ctx.translate(x - 12 * k + 4.2 * k, y - 12 * k + 4.2 * k); ctx.scale(s, s);
      ctx.lineWidth = Math.max(1.15, r * 0.17) / s; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = o.fg || (light(fill) ? '#2b2200' : '#ffffff');
      ctx.stroke(p);
    }
    ctx.restore();
  }
  /* ------------------------------------------------------------ 3D models */
  // each kind as a small model of the structure standing on its position (a block of flats with its windows, a
  // tower crane with jib, counter-jib and hook, a red and white chimney with smoke, a wind turbine with its blades, …)
  // on a pad in the colour of the result, a red obstruction light on top when it is lighted.
  // Parts: path data on a 32 x 40 grid, the ground point at 16, 36, seen from the front, a little from above and the right.
  function r2(v) { return Math.round(v * 100) / 100; }
  function pt(x, y, z) { return [16 + x + 0.5 * y, 36 - z - 0.38 * y]; } // x right, y away from the viewer, z up
  function poly(p) { return 'M' + p.map(function (q) { return r2(q[0]) + ' ' + r2(q[1]); }).join('L') + 'Z'; }
  function line(p) { return 'M' + p.map(function (q) { return r2(q[0]) + ' ' + r2(q[1]); }).join('L'); }
  function ell(cx, cy, rx, ry) { return 'M' + r2(cx - rx) + ' ' + r2(cy) + 'a' + r2(rx) + ' ' + r2(ry) + ' 0 1 0 ' + r2(2 * rx) + ' 0a' + r2(rx) + ' ' + r2(ry) + ' 0 1 0 ' + r2(-2 * rx) + ' 0Z'; }
  function F(d, f, noEdge) { return { d: d, f: f, n: !!noEdge }; }
  function S(d, s, w) { return { d: d, s: s, w: w || 1 }; }
  // a frustum (front, side and top colours), a box, a vertical cylinder (body, shade, top)
  function frustum(cx, cy, wb, db, wt, dt, h, z0, c) {
    var b = function (x, y) { return pt(cx + x * wb / 2, cy + y * db / 2, z0); }, t = function (x, y) { return pt(cx + x * wt / 2, cy + y * dt / 2, z0 + h); };
    return [F(poly([b(-1, -1), b(1, -1), t(1, -1), t(-1, -1)]), c[0]), F(poly([b(1, -1), b(1, 1), t(1, 1), t(1, -1)]), c[1]), F(poly([t(-1, -1), t(1, -1), t(1, 1), t(-1, 1)]), c[2])];
  }
  function box(cx, cy, w, d, h, z0, c) { return frustum(cx, cy, w, d, w, d, h, z0, c); }
  function cyl(cx, cy, r, h, z0, c) {
    var b = pt(cx, cy, z0), t = pt(cx, cy, z0 + h), ry = r * 0.4, k = 0.3, x = b[0];
    return [F('M' + r2(x - r) + ' ' + r2(t[1]) + 'L' + r2(x - r) + ' ' + r2(b[1]) + 'A' + r2(r) + ' ' + r2(ry) + ' 0 0 0 ' + r2(x + r) + ' ' + r2(b[1]) + 'L' + r2(x + r) + ' ' + r2(t[1]) + 'Z', c[0]),
      F('M' + r2(x + k * r) + ' ' + r2(t[1]) + 'L' + r2(x + k * r) + ' ' + r2(b[1] + ry * Math.sqrt(1 - k * k)) + 'A' + r2(r) + ' ' + r2(ry) + ' 0 0 0 ' + r2(x + r) + ' ' + r2(b[1]) + 'L' + r2(x + r) + ' ' + r2(t[1]) + 'Z', c[1], true),
      F(ell(t[0], t[1], r, ry), c[2])];
  }
  var C = { con: ['#e3e8ec', '#9eafbf', '#f5f7f9'], steel: ['#b0bec5', '#78909c', '#cfd8dc'], red: ['#d32f2f', '#9a1f1f', '#ef5350'], white: ['#f5f7f8', '#c3ccd3', '#ffffff'],
    sand: ['#efe3c8', '#cbb994', '#f7efdc'], gold: ['#ffb300', '#c68400', '#ffd54f'], green: ['#2e7d32', '#1b5e20', '#43a047'], wood: ['#795548', '#5d4037', '#8d6e63'],
    stone: ['#ddd2c6', '#b3a395', '#ece4da'], orange: ['#ef6c00', '#b34d00', '#ff9800'], lamp: ['#fff59d', '#fbc02d', '#fffde7'] };
  var EDGE = 'rgba(25,35,45,.55)';
  var MODEL = {
    building: function () {
      var p = box(0, 0, 13, 9, 23, 0, C.con);
      for (var z = 3; z < 21; z += 4) {
        for (var x = -5; x < 5; x += 3.5) p.push(F(poly([pt(x, -4.5, z), pt(x + 2.3, -4.5, z), pt(x + 2.3, -4.5, z + 2.2), pt(x, -4.5, z + 2.2)]), '#5d7d9c', true));
        p.push(F(poly([pt(6.5, -3.5, z), pt(6.5, 3.5, z), pt(6.5, 3.5, z + 2.2), pt(6.5, -3.5, z + 2.2)]), '#46617c', true));
      }
      return { p: p.concat(box(2, 1, 4, 3, 2, 23, C.steel)), top: pt(2, 1, 25) };
    },
    tower: function () {
      var p = [], L = function (a, b, c, w) { p.push(S(line([a, b]), c, w)); };
      L(pt(0, 5, 0), pt(0, 1.2, 27), '#8e2424', 1);
      for (var i = 0; i < 6; i++) {
        var z0 = i * 4.5, z1 = z0 + 4.5, w0 = 6 - 4.7 * z0 / 27, w1 = 6 - 4.7 * z1 / 27;
        L(pt(-w0, -1, z0), pt(w1, -1, z1), '#e57373', 0.8); L(pt(w0, -1, z0), pt(-w1, -1, z1), '#e57373', 0.8);
      }
      L(pt(-6, -1, 0), pt(-1.3, -1, 27), '#c62828', 1.4); L(pt(6, -1, 0), pt(1.3, -1, 27), '#c62828', 1.4);
      p = p.concat(box(0, 0, 4.5, 3, 3, 26, C.white));
      L(pt(0, 0, 29), pt(0, 0, 33), '#546e7a', 1);
      return { p: p, top: pt(0, 0, 33) };
    },
    antenna: function () {
      var p = [S(line([pt(0, 0, 24), pt(-10, -1, 0)]), '#90a4ae', 0.6), S(line([pt(0, 0, 24), pt(10, -1, 0)]), '#90a4ae', 0.6), S(line([pt(0, 0, 15), pt(4, 7, 0)]), '#90a4ae', 0.6)];
      for (var i = 0; i < 6; i++) p = p.concat(cyl(0, 0, 1.1, 5, i * 5, i % 2 ? C.white : C.red));
      var d = pt(1.8, -0.5, 19); p.push(F(ell(d[0] + 0.8, d[1], 1.5, 2.4), '#eceff1'));
      return { p: p, top: pt(0, 0, 30.5) };
    },
    crane: function () {
      var Y = '#f9a825', D = '#b77900', p = box(0, 0, 6, 5, 2, 0, C.steel);
      [[1.5, 1.5], [-1.5, -1], [1.5, -1]].forEach(function (q) { p.push(S(line([pt(q[0], q[1], 2), pt(q[0], q[1], 25)]), q[1] > 0 ? D : Y, 1.2)); });
      for (var z = 2; z < 24; z += 3) p.push(S(line([pt(-1.5, -1, z), pt(1.5, -1, z + 3)]), Y, 0.7));
      p.push(S(line([pt(-7, 0, 24.6), pt(14, 0, 24.6)]), D, 0.6));
      for (var x = -7; x < 14; x += 2.5) p.push(S(line([pt(x, 0, 26), pt(x + 1.25, 0, 24.6), pt(x + 2.5, 0, 26)]), D, 0.6));
      p.push(S(line([pt(-7, 0, 26), pt(14, 0, 26)]), Y, 1.8));
      p = p.concat(box(-5.5, 0, 3, 2.4, 2.4, 22.6, C.steel), box(1.9, -0.6, 3, 2.6, 3, 21.8, ['#ffd54f', '#c79100', '#ffe082']));
      p.push(S(line([pt(0, 0, 26), pt(0, 0, 31)]), Y, 1.3), S(line([pt(-7, 0, 26), pt(0, 0, 31), pt(14, 0, 26)]), '#5d4300', 0.5));
      p.push(S(line([pt(10, 0, 24.6), pt(10, 0, 15)]), '#37474f', 0.6), F(poly([pt(9.2, 0, 15), pt(10.8, 0, 15), pt(10.8, 0, 13.4), pt(9.2, 0, 13.4)]), '#37474f'));
      return { p: p, top: pt(0, 0, 31) };
    },
    windmill: function () {
      var p = frustum(0, 0, 3.2, 3.2, 1.6, 1.6, 21, 0, C.white).concat(box(0.8, 0, 4.2, 2.4, 2.2, 20.5, C.white));
      var h = pt(-1.6, -1.5, 21.6);
      [-90, 30, 150].forEach(function (a) {
        a *= Math.PI / 180;
        var dx = Math.cos(a), dy = Math.sin(a);
        p.push(F(poly([[h[0] - dy * 1.3, h[1] + dx * 1.3], [h[0] + dx * 11, h[1] + dy * 11], [h[0] + dy * 0.5, h[1] - dx * 0.5]]), '#fbfcfc'));
      });
      p.push(F(ell(h[0], h[1], 1.3, 1.3), '#cfd8dc'));
      return { p: p, top: pt(0.8, 0, 22.7) };
    },
    tree: function () {
      var p = frustum(0, 0, 2, 2, 1.3, 1.3, 9, 0, C.wood);
      p.push(F(ell(18.2, 22.5, 6.2, 6), '#2e7d32'), F(ell(14.6, 20.5, 6.8, 6.6), '#388e3c'), F(ell(16.6, 16.2, 5.6, 5.4), '#43a047'), F(ell(14.6, 15, 2.6, 2.4), '#81c784', true));
      return { p: p, top: [16.6, 10.8] };
    },
    stack: function () {
      var p = [];
      for (var i = 0; i < 6; i++) p = p.concat(cyl(0, 0, 3 - i * 0.12, 4.4, i * 4.4, i % 2 ? C.white : C.red));
      var t = pt(0, 0, 26.4);
      p.push(F(ell(t[0], t[1], 2.1, 0.8), '#37474f', true));
      p.push(F(ell(t[0] + 2.5, t[1] - 3.4, 2.6, 2.2), 'rgba(158,172,180,.8)', true), F(ell(t[0] + 5.6, t[1] - 6.2, 3.1, 2.5), 'rgba(190,201,207,.7)', true), F(ell(t[0] + 9, t[1] - 8.2, 3.3, 2.5), 'rgba(222,228,232,.6)', true));
      return { p: p, top: [t[0], t[1] - 0.8] };
    },
    pole: function () {
      var p = cyl(0, 0, 0.9, 22, 0, C.steel);
      p.push(S(line([pt(0, 0, 21.5), pt(5, 0, 22.5)]), '#78909c', 1));
      return { p: p.concat(box(5.6, 0, 2.6, 1.6, 1.1, 21.6, ['#eceff1', '#b0bec5', '#ffffff'])), top: pt(0, 0, 22.4) };
    },
    pylon: function () {
      var p = [], L = function (a, b, c, w) { p.push(S(line([a, b]), c, w)); };
      L(pt(4, 4, 0), pt(1.2, 1.2, 27), '#78909c', 0.8);
      for (var i = 0; i < 6; i++) {
        var z0 = i * 4.5, z1 = z0 + 4.5, a = 6 - 4.6 * z0 / 27, b = 6 - 4.6 * z1 / 27;
        L(pt(-a, -1, z0), pt(b, -1, z1), '#90a4ae', 0.6); L(pt(a, -1, z0), pt(-b, -1, z1), '#90a4ae', 0.6);
      }
      L(pt(-6, -1, 0), pt(-1.4, -1, 27), '#546e7a', 1.2); L(pt(6, -1, 0), pt(1.4, -1, 27), '#546e7a', 1.2);
      [[20, 9], [25, 6.5]].forEach(function (q) {
        L(pt(-q[1], -1, q[0]), pt(q[1], -1, q[0]), '#546e7a', 1.2);
        [-q[1], q[1]].forEach(function (x) { L(pt(x, -1, q[0]), pt(x, -1, q[0] - 2.2), '#37474f', 0.9); });
      });
      var l = pt(-9, -1, 17.8), r = pt(9, -1, 17.8);
      p.push(S('M' + r2(l[0]) + ' ' + r2(l[1]) + 'Q' + r2(l[0] - 2) + ' ' + r2(l[1] + 4) + ' 0 ' + r2(l[1] + 3), '#455a64', 0.5), S('M' + r2(r[0]) + ' ' + r2(r[1]) + 'Q' + r2(r[0] + 2) + ' ' + r2(r[1] + 4) + ' 32 ' + r2(r[1] + 3), '#455a64', 0.5));
      return { p: p, top: pt(0, -1, 27.5) };
    },
    tank: function () {
      var p = cyl(0, 0, 8, 12, 0, C.con), t = pt(0, 0, 12);
      p.push(S('M' + r2(t[0] - 8) + ' ' + r2(t[1] + 6) + 'A8 3.2 0 0 0 ' + r2(t[0] + 8) + ' ' + r2(t[1] + 6), '#90a4ae', 0.8), F(ell(t[0], t[1], 5.4, 2.1), '#dfe5ea', true));
      return { p: p, top: [t[0], t[1] - 1] };
    },
    dome: function () {
      var p = cyl(0, 0, 8, 4, 0, C.stone), t = pt(0, 0, 4);
      p.push(F('M' + r2(t[0] - 8) + ' ' + r2(t[1]) + 'A8 9 0 0 1 ' + r2(t[0] + 8) + ' ' + r2(t[1]) + 'A8 3.2 0 0 1 ' + r2(t[0] - 8) + ' ' + r2(t[1]) + 'Z', '#b0bec5'));
      p.push(F(ell(t[0] - 3, t[1] - 5.6, 2.4, 1.5), '#e3e9ec', true), S(line([[t[0], t[1] - 9], [t[0], t[1] - 12]]), '#78909c', 1));
      return { p: p, top: [t[0], t[1] - 12] };
    },
    spire: function () {
      var p = cyl(0, 0, 2.3, 17, 0, C.sand).concat(cyl(0, 0, 3.4, 1.2, 16.5, C.sand), cyl(0, 0, 1.7, 5, 17.7, C.sand)), c = pt(0, 0, 30);
      p.push(F(poly([pt(-1.9, 0, 22.7), pt(1.9, 0, 22.7), c]), '#ffb300'), F(poly([pt(0, 0, 22.7), pt(1.9, 0, 22.7), c]), '#c68400', true));
      return { p: p, top: c };
    },
    rig: function () {
      var p = [S('M2 38q3-1.4 6 0t6 0t6 0t6 0t6 0', '#4fc3f7', 0.9)];
      [[-6, 3], [6, 3], [-6, -3], [6, -3]].forEach(function (q) { p = p.concat(cyl(q[0], q[1], 0.8, 9, 0, C.steel)); });
      p = p.concat(box(0, 0, 16, 9, 3, 9, C.gold));
      var L = function (a, b, w) { p.push(S(line([a, b]), '#546e7a', w || 0.8)); };
      L(pt(-6, -1, 12), pt(-3, -1, 27), 1.1); L(pt(0, -1, 12), pt(-3, -1, 27), 1.1);
      for (var z = 12; z < 25; z += 3) { var a = 3 * (1 - (z - 12) / 15), b = 3 * (1 - (z + 3 - 12) / 15); L(pt(-3 - a, -1, z), pt(-3 + b, -1, z + 3)); }
      p.push(S(line([pt(4, -1, 12), pt(10, -1, 20)]), '#f9a825', 1));
      return { p: p, top: pt(-3, -1, 27) };
    },
    bridge: function () {
      var p = box(-9, 0, 2, 2.5, 10, 0, C.steel).concat(box(9, 0, 2, 2.5, 10, 0, C.steel), box(0, 0, 27, 3, 1.6, 10, C.con));
      var a = pt(-12, -1.5, 11.6), c = pt(0, -1.5, 32), b = pt(12, -1.5, 11.6);
      [-8, -4, 0, 4, 8].forEach(function (x) { var t = (x + 12) / 24; p.push(S(line([pt(x, -1.5, 11.6), pt(x, -1.5, 11.6 + 2 * t * (1 - t) * 20.4)]), '#ef9a9a', 0.6)); });
      p.push(S('M' + r2(a[0]) + ' ' + r2(a[1]) + 'Q' + r2(c[0]) + ' ' + r2(c[1]) + ' ' + r2(b[0]) + ' ' + r2(b[1]), '#e53935', 1.6));
      return { p: p, top: pt(0, -1.5, 21.8) };
    },
    balloon: function () {
      var c = pt(0, 0, 24), x = c[0], y = c[1];
      var p = [S(line([pt(0, 0, 0), pt(0, 0, 19.5)]), '#78909c', 0.6), F(poly([[x + 4.5, y - 1], [x + 9, y - 4.6], [x + 8.2, y]]), '#b0bec5'), F(poly([[x + 4.5, y + 1], [x + 9, y + 4.2], [x + 8.2, y]]), '#b0bec5')];
      p.push(F(ell(x, y, 6.5, 4.6), '#eceff1'), F('M' + r2(x - 6.5) + ' ' + r2(y) + 'A6.5 4.6 0 0 0 ' + r2(x + 6.5) + ' ' + r2(y) + 'A6.5 2 0 0 1 ' + r2(x - 6.5) + ' ' + r2(y) + 'Z', '#c3ccd3', true), F(ell(x - 2, y - 2, 2.4, 1.1), '#ffffff', true));
      return { p: p, top: [x, y - 4.6] };
    },
    lighthouse: function () {
      var p = [];
      for (var i = 0; i < 4; i++) { var w = 6 - i * 0.6; p = p.concat(frustum(0, 0, w, w, w - 0.6, w - 0.6, 5, i * 5, i % 2 ? C.white : C.red)); }
      p = p.concat(box(0, 0, 5.4, 5.4, 1, 20, C.steel), box(0, 0, 3.4, 3.4, 3, 21, C.lamp));
      p.push(F(poly([pt(0, 0, 22.5), [32, 13.5], [32, 19]]), 'rgba(255,238,88,.38)', true));
      p.push(F(poly([pt(-2.2, -1.7, 24), pt(2.2, -1.7, 24), pt(0, 0, 27.5)]), '#b71c1c'), F(poly([pt(2.2, -1.7, 24), pt(2.2, 1.7, 24), pt(0, 0, 27.5)]), '#7f1414'));
      return { p: p, top: pt(0, 0, 27.5) };
    },
    peak: function () {
      return { p: [F(poly([[13, 37], [21.5, 17], [31, 37]]), '#8d6e63'), F(poly([[21.5, 17], [31, 37], [24, 37]]), '#5d4037'),
        F(poly([[1, 37], [12, 11], [14, 37]]), '#a1887f'), F(poly([[12, 11], [14, 37], [25, 37]]), '#795548'),
        F(poly([[9.4, 17.2], [12, 11], [15.6, 18.4], [13.4, 17.4], [11.6, 18.8]]), '#ffffff')], top: [12, 11] };
    },
    sign: function () {
      var p = [S(line([pt(-5, 0, 0), pt(-5, 0, 9)]), '#78909c', 1.1), S(line([pt(5, 0, 0), pt(5, 0, 9)]), '#78909c', 1.1)].concat(box(0, 0, 16, 1.4, 8, 8.5, C.green));
      p.push(S(line([pt(-6, -0.7, 13.6), pt(6, -0.7, 13.6)]), '#e8f5e9', 0.9), S(line([pt(-6, -0.7, 11), pt(3, -0.7, 11)]), '#e8f5e9', 0.9));
      return { p: p, top: pt(0, 0, 16.5) };
    },
    monument: function () {
      var p = box(0, 0, 9, 6, 2.5, 0, C.stone).concat(frustum(0, 0, 4, 4, 2.4, 2.4, 20, 2.5, C.stone));
      p.push(F(poly([pt(-1.2, -1.2, 22.5), pt(1.2, -1.2, 22.5), pt(0, 0, 26.5)]), '#efe7de'), F(poly([pt(1.2, -1.2, 22.5), pt(1.2, 1.2, 22.5), pt(0, 0, 26.5)]), '#b3a395'));
      return { p: p, top: pt(0, 0, 26.5) };
    },
    other: function () {
      var p = [];
      for (var i = 0; i < 4; i++) p = p.concat(box(0, 0, 4, 4, 4.5, i * 4.5, i % 2 ? C.white : C.orange));
      return { p: p, top: pt(0, 0, 18) };
    }
  };
  var models = {};
  function model(kind) { return models[kind] || (models[kind] = (MODEL[kind] || MODEL.other)()); }
  // everything drawn for one icon, in order: the pad (o.fill, none when o.pad is false), the model, the light (o.lit),
  // the NOTAM badge (o.notam)
  function parts3d(kind, o) {
    o = o || {};
    var m = model(MODEL[kind] ? kind : 'other'), out = [];
    if (o.pad !== false) out.push({ d: ell(16, 36, 11, 3.8), f: o.fill || '#546e7a', s: '#ffffff', w: 1.2 });
    m.p.forEach(function (q) { out.push(q.f && !q.n ? { d: q.d, f: q.f, s: EDGE, w: 0.4 } : q); });
    if (o.lit) out.push(F(ell(m.top[0], m.top[1] - 0.6, 2.9, 2.9), 'rgba(255,23,68,.35)', true), F(ell(m.top[0], m.top[1] - 0.6, 1.3, 1.3), '#ff1744', true));
    if (o.notam) out.push({ d: 'M27 0.6l4.6 8h-9.2z', f: '#ffb300', s: '#5d4037', w: 0.8 }, { d: 'M27 3.4v2.4M27 7.1v.1', s: '#3e2723', w: 1.2 });
    return out;
  }
  // the model as SVG, o.h pixels high (o: also fill, lit, notam, pad)
  function svg3d(kind, o) {
    o = o || {};
    var h = o.h || 36, w = r2(h * 0.8);
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 40" width="' + w + '" height="' + h + '" aria-hidden="true">' + parts3d(kind, o).map(function (q) {
      return '<path d="' + q.d + '" fill="' + (q.f || 'none') + '"' + (q.s ? ' stroke="' + q.s + '" stroke-width="' + q.w + '" stroke-linecap="round" stroke-linejoin="round"' : '') + '/>';
    }).join('') + '</svg>';
  }
  function paint3d(ctx, kind, o) {
    parts3d(kind, o).forEach(function (q) {
      var p = new Path2D(q.d);
      if (q.f) { ctx.fillStyle = q.f; ctx.fill(p); }
      if (q.s) { ctx.strokeStyle = q.s; ctx.lineWidth = q.w; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(p); }
    });
  }
  // the model drawn once into a small canvas per kind, colour, light and size, then stamped: fast for many obstacles
  var sprites = {}, nSprites = 0;
  function sprite(kind, o, sc) {
    var dpr = Math.min(3, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    var key = kind + '|' + o.fill + '|' + (o.lit ? 1 : 0) + '|' + (o.notam ? 1 : 0) + '|' + sc + '|' + dpr;
    if (sprites[key]) return sprites[key];
    if (nSprites > 1500) { sprites = {}; nSprites = 0; }
    var cv = document.createElement('canvas'), k = sc * dpr;
    cv.width = Math.ceil(34 * k); cv.height = Math.ceil(42 * k);
    var c = cv.getContext('2d');
    c.scale(k, k); c.translate(1, 1);
    paint3d(c, kind, o);
    nSprites++;
    return (sprites[key] = cv);
  }
  // draw the model of kind standing at (x, y) on a canvas, sc = size (1: 32 x 40 px); o: {fill, lit, notam, pad}
  function draw3d(ctx, kind, x, y, sc, o) {
    o = o || {};
    if (typeof Path2D !== 'function' || typeof document === 'undefined') { draw(ctx, kind, x, y - 12 * sc, 11 * sc, o); return; }
    ctx.drawImage(sprite(kind, o, sc), x - 17 * sc, y - 37 * sc, 34 * sc, 42 * sc);
  }
  return { KIND_NAME: KIND_NAME, kindOf: kindOf, ICON: ICON, svg: svg, legendHtml: legendHtml, draw: draw, pathOf: pathOf, light: light,
    svg3d: svg3d, parts3d: parts3d, paint3d: paint3d, draw3d: draw3d };
})();
if (typeof module !== 'undefined') module.exports = OBSICON;
