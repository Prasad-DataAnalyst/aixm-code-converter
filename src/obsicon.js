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
 * and the scale bar of the obstacle maps in nautical miles (and feet when zoomed in): scaleNM.
 * Plain functions and data only, so it also runs in a separate window.
 * ========================================================================== */
var OBSICON = (function () {
  'use strict';
  function esc(t) { return String(t === undefined || t === null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var KIND_NAME = { building: 'Building', tower: 'Tower', antenna: 'Antenna / mast', crane: 'Crane', windmill: 'Wind turbine', tree: 'Tree / vegetation', stack: 'Chimney / stack',
    pole: 'Electric / utility pole', pylon: 'Pylon / power line', tank: 'Tank / silo', dome: 'Dome', spire: 'Spire / minaret', rig: 'Rig / platform', bridge: 'Bridge / arch', balloon: 'Tethered balloon',
    lighthouse: 'Lighthouse', peak: 'Terrain / high point', sign: 'Aerodrome sign / board', monument: 'Monument',
    lamp: 'Light mast / street light', windsock: 'Wind cone (windsock)', als: 'Approach / runway lights', loc: 'ILS localizer', gp: 'ILS glide path', vor: 'VOR / DVOR', radar: 'Radar',
    ctower: 'Control tower', hangar: 'Hangar', cooling: 'Cooling tower', watertower: 'Water tower', utility: 'Plant / utility', stadium: 'Stadium', wall: 'Wall / fence',
    other: 'Other obstacle' };
  // The kind of an obstacle, from its type (AIXM CodeVerticalStructureType, OTHER:…, FAA DOF, eTOD tables) and its name.
  // Whole words only (STREET is not a TREE, ASPIRE not a SPIRE, RIGHT not a RIG); the type first, the name after it:
  // the name may make a general type more precise (a POLE named LIGHT POLE is a light mast, a NAVAID named LOCALIZER the
  // localizer), never change it to something else (a BUILDING named BUILDING SPIRE stays a building).
  var TYPE = { AG_EQUIP: 'other', ANTENNA: 'antenna', ARCH: 'bridge', BRIDGE: 'bridge', BUILDING: 'building', CABLE_CAR: 'pylon', CATENARY: 'pylon', COMPRESSED_AIR_SYSTEM: 'utility',
    CONTROL_MONITORING: 'antenna', CONTROL_TOWER: 'ctower', COOLING_TOWER: 'cooling', DAM: 'wall', DOME: 'dome', ELECTRICAL_EXIT_LIGHT: 'lamp', ELECTRICAL_SYSTEM: 'pole', ELEVATOR: 'tank',
    FENCE: 'wall', FUEL_SYSTEM: 'tank', GATE: 'wall', GENERAL_UTILITY: 'utility', GRAIN_ELEVATOR: 'tank', HEAT_COOL_SYSTEM: 'utility', INDUSTRIAL_SYSTEM: 'utility', LIGHTHOUSE: 'lighthouse',
    MONUMENT: 'monument', NATURAL_GAS_SYSTEM: 'tank', NATURAL_HIGHPOINT: 'peak', NAVAID: 'antenna', NUCLEAR_REACTOR: 'cooling', POLE: 'pole', POWER_PLANT: 'utility', REFINERY: 'utility',
    RIG: 'rig', SALTWATER_SYSTEM: 'utility', SIGN: 'sign', SPIRE: 'spire', STACK: 'stack', STADIUM: 'stadium', STORAGE_TANK: 'tank', TANK: 'tank', TETHERED_BALLOON: 'balloon', TOWER: 'tower',
    TRAMWAY: 'pylon', TRANSMISSION_LINE: 'pylon', TREE: 'tree', URBAN: 'building', VEGETATION: 'tree', WALL: 'wall', WASTEWATER_SYSTEM: 'utility', WATER_SYSTEM: 'utility',
    WATER_TOWER: 'watertower', WINDMILL: 'windmill', WINDMILL_FARMS: 'windmill' };
  // words and phrases, the most precise first
  var WORDS = [
    ['ctower', 'CONTROL TOWER|CTRL TWR|ATC TOWER|ATC TWR|ATC|AIRPORT TOWER|TOWER CAB|CONTROL TWR'],
    ['cooling', 'COOLING TOWER|COOLING TOWERS|COOL TWR|COOLING TWR|NUCLEAR REACTOR'],
    ['watertower', 'WATER TOWER|WATER TWR|WATERTOWER|ELEVATED TANK|ELEVATED WATER TANK'],
    ['windsock', 'WINDSOCK|WIND SOCK|WIND CONE|WINDCONE|WIND DIRECTION INDICATOR|WDI|WIND TEE|WIND T|WIND INDICATOR|WIND SLEEVE'],
    ['als', 'APPROACH LIGHT|APPROACH LIGHTS|APPROACH LIGHTING|APPROACH LIGHTING SYSTEM|APP LIGHT|APP LGT|APCH LGT|APCH LIGHT|ALS|ALSF|ALSF1|ALSF2|MALS|MALSF|MALSR|SALS|SSALR|ODALS|REIL|PAPI|APAPI|VASI|VASIS|LIGHT BAR|BARRETTE|CROSSBAR|LIGHTING STRUCTURE|RUNWAY LIGHT|RUNWAY LIGHTS|THRESHOLD LIGHT|THRESHOLD LIGHTS|RWY LIGHT|LGT BAR|LIGHT FRAME'],
    ['lamp', 'LIGHT POLE|LIGHT POLES|LIGHTING POLE|LAMP POST|LAMPPOST|LAMP|LAMPS|STREET LIGHT|STREET LIGHTS|STREETLIGHT|STREET LAMP|FLOODLIGHT|FLOOD LIGHT|FLOODLIGHTS|FLOOD LIGHTS|LIGHT MAST|LIGHTING MAST|HIGH MAST|HIGHMAST|HIGH MAST LIGHT|APRON LIGHT|APRON LIGHTS|APRON FLOODLIGHT|ELECTRICAL EXIT LIGHT|TRAFFIC LIGHT|TRAFFIC LIGHTS|LIGHT TOWER'],
    ['pylon', 'TRANSMISSION LINE|TRANSMISSION LINES|TRANSMISSION TOWER|POWER LINE|POWER LINES|POWERLINE|POWERLINES|HT LINE|HV LINE|HIGH TENSION|HIGH VOLTAGE|OHL|OVERHEAD LINE|OVERHEAD LINES|CATENARY|CABLE CAR|CABLEWAY|TRAMWAY|CABLE|CABLES|WIRE|WIRES|PYLON|PYLONS|T L TWR|TL TWR|ELECTRIC TOWER|ELECTRICITY TOWER|ELECTRICAL TOWER|POWER TOWER'],
    ['windmill', 'WIND TURBINE|WIND TURBINES|WINDMILL|WINDMILLS|WIND MILL|WIND FARM|WINDMILL FARMS|WIND GENERATOR|WTG'],
    ['crane', 'CRANE|CRANES|TOWER CRANE|MOBILE CRANE|DOCK CRANE|GANTRY CRANE|CRAWLER CRANE|HOIST'],
    ['pole', 'ELECTRICAL POLE|ELECTRIC POLE|ELECTRICITY POLE|UTILITY POLE|POWER POLE|TELEPHONE POLE|TELEGRAPH POLE|WOODEN POLE|CONCRETE POLE|STEEL POLE|FLAG POLE|FLAGPOLE|FLAG|POLE|POLES|ELECTRICAL SYSTEM|ELEC SYS'],
    ['loc', 'LOCALIZER|LOCALISER|LLZ|LOC ANTENNA|ILS LOC|ILS LLZ|LOC ARRAY|LOCALIZER ANTENNA|LOCALISER ANTENNA'],
    ['gp', 'GLIDE PATH|GLIDEPATH|GLIDE SLOPE|GLIDESLOPE|GP|GP ANTENNA|ILS GP|GS ANTENNA|ILS GS'],
    ['vor', 'VOR|DVOR|CVOR|VORTAC|VOR DME|DVOR DME|VOR TACAN'],
    ['radar', 'RADAR|RADARS|ASR|SSR|PSR|MSSR|ASDE|SMR|SURFACE MOVEMENT RADAR|WEATHER RADAR|RADAR TOWER|RADAR ANTENNA'],
    ['tree', 'TREE|TREES|PALM|PALMS|PALM TREE|PALM TREES|VEGETATION|FOREST|WOOD|WOODS|WOODLAND|BUSH|BUSHES|SHRUB|SHRUBS|HEDGE|ORCHARD|PLANTATION|GROVE'],
    ['stack', 'STACK|STACKS|CHIMNEY|CHIMNEYS|SMOKESTACK|FLARE|FLARE STACK|FLARESTACK|EXHAUST STACK|VENT STACK'],
    ['lighthouse', 'LIGHTHOUSE|LGTHOUSE|LIGHT HOUSE'],
    ['spire', 'MINARET|MINARETS|SPIRE|SPIRES|STEEPLE|BELL TOWER|CHURCH TOWER|CAMPANILE'],
    ['dome', 'DOME|DOMES|RADOME|MOSQUE|PLANETARIUM|OBSERVATORY'],
    ['rig', 'RIG|RIGS|OIL RIG|DRILLING RIG|PLATFORM|OFFSHORE PLATFORM|OIL PLATFORM|DERRICK|JACKUP|JACK UP'],
    ['utility', 'REFINERY|POWER PLANT|POWER STATION|PLANT|FACTORY|INDUSTRIAL|INDUSTRY|SUBSTATION|SUB STATION|UTILITY|UTILITIES|GEN UTIL|DESALINATION|PUMP STATION|PUMPING STATION|TREATMENT PLANT|WATER SYSTEM|GAS PLANT|COMPRESSOR STATION|GENERATOR'],
    ['tank', 'TANK|TANKS|STORAGE TANK|FUEL TANK|OIL TANK|GAS TANK|SILO|SILOS|GRAIN ELEVATOR|ELEVATOR|GASHOLDER|GAS HOLDER|RESERVOIR|FUEL FARM|TANK FARM'],
    ['bridge', 'BRIDGE|BRIDGES|ARCH|ARCHES|FLYOVER|OVERPASS|VIADUCT|FOOTBRIDGE|SKYBRIDGE|SKY BRIDGE|JET BRIDGE|AEROBRIDGE|BOARDING BRIDGE'],
    ['balloon', 'BALLOON|TETHERED BALLOON|AEROSTAT|KITE|BLIMP'],
    ['peak', 'NATURAL HIGHPOINT|HIGHPOINT|HIGH POINT|PEAK|SUMMIT|HILL|HILLS|MOUNTAIN|MOUNT|TERRAIN|SPOT HEIGHT|DUNE|DUNES|ROCK|CLIFF|RIDGE|MOUND'],
    ['sign', 'SIGN|SIGNS|SIGNAGE|SIGNBOARD|SIGN BOARD|GUIDANCE SIGN|MANDATORY SIGN|INFORMATION SIGN|LOCATION SIGN|DIRECTION SIGN|TAXI SIGN|TAXIWAY SIGN|RUNWAY SIGN|DISTANCE REMAINING|DRS|BILLBOARD|BILLBOARDS|HOARDING|HOARDINGS|ADVERTISING|ADVERTISEMENT|DISPLAY BOARD|LED SCREEN|BOARD'],
    ['monument', 'MONUMENT|STATUE|OBELISK|MEMORIAL|SCULPTURE|CLOCK TOWER|LANDMARK'],
    ['stadium', 'STADIUM|ARENA|GRANDSTAND|SPORTS COMPLEX'],
    ['wall', 'WALL|WALLS|FENCE|FENCES|GATE|GATES|DAM|BARRIER|BLAST FENCE|BLAST WALL|BLAST DEFLECTOR|JET BLAST DEFLECTOR|NOISE BARRIER|BERM|EMBANKMENT|LEVEE|PERIMETER FENCE|SECURITY FENCE'],
    ['hangar', 'HANGAR|HANGARS|HANGER|MAINTENANCE HANGAR'],
    ['tower', 'TELECOM TOWER|TELECOMMUNICATION TOWER|COMMUNICATION TOWER|COMMUNICATIONS TOWER|COMMS TOWER|MOBILE TOWER|CELL TOWER|GSM TOWER|RADIO TOWER|TV TOWER|TELEVISION TOWER|MICROWAVE TOWER|LATTICE TOWER|OBSERVATION TOWER|STEEL TOWER'],
    ['antenna', 'ANTENNA|ANTENNAS|AERIAL|AERIALS|MAST|MASTS|COMMS MAST|RADIO MAST|NAVAID|NAVAIDS|TELECOM|TELECOMMUNICATION|COMMUNICATION|COMMUNICATIONS|COMMS|GSM|MICROWAVE|DME|NDB|TACAN|OUTER MARKER|MIDDLE MARKER|INNER MARKER|MARKER BEACON|ILS|ANEMOMETER|MET MAST|CONTROL MONITORING'],
    ['tower', 'TOWER|TOWERS|TWR'],
    ['building', 'BUILDING|BUILDINGS|BLDG|BLDGS|TERMINAL|HOTEL|HOUSE|HOUSES|VILLA|APARTMENT|APARTMENTS|RESIDENTIAL|OFFICE|OFFICES|MALL|SCHOOL|HOSPITAL|WAREHOUSE|SHED|STRUCTURE|URBAN|CONSTRUCTION|ROOF|ROOFTOP|PENTHOUSE|STAIRCASE|HOUSING|COMPLEX|SKYSCRAPER|HIGH RISE|HIGHRISE']
  ].map(function (w) { return [w[0], new RegExp('(?:^| )(?:' + w[1] + ')(?= |$)')]; });
  // a general kind may be made more precise by the name
  var REFINE = { pole: ['lamp', 'windsock', 'als', 'sign'], tower: ['ctower', 'cooling', 'watertower', 'pylon', 'lamp', 'radar', 'lighthouse', 'monument', 'gp'],
    building: ['hangar', 'ctower', 'stadium', 'utility', 'dome'], antenna: ['loc', 'gp', 'vor', 'radar', 'windsock', 'lamp'], sign: [], other: null };
  function norm(t) { return ' ' + String(t || '').toUpperCase().replace(/^OTHER:/, '').replace(/[^A-Z0-9]+/g, ' ').trim() + ' '; }
  function words(t) { t = t.trim(); if (!t) return ''; for (var i = 0; i < WORDS.length; i++) if (WORDS[i][1].test(t)) return WORDS[i][0]; return ''; }
  function kindOf(type, name) {
    var t = norm(type).trim(), k = TYPE[t.replace(/ /g, '_')] || words(t), n = words(norm(name));
    if (!k || k === 'other') return n || 'other';
    if (n && REFINE[k] && REFINE[k].indexOf(n) >= 0) return n;
    return k;
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
    lamp: '<path d="M12 7v15M9 22h6M7 3h10v4H7z"/>',
    windsock: '<path d="M6 3v19M4 22h4M6 5l13 2.5v3.5L6 13zM10.5 5.9v6.3M15 6.8v4.6"/>',
    als: '<path d="M12 11v11M9 22h6M3 8h18v3H3zM6.5 8v3M10 8v3M14 8v3M17.5 8v3"/>',
    loc: '<path d="M2 15h20M4 15V8M8 15V8M12 15V8M16 15V8M20 15V8M6 15v7M18 15v7"/>',
    gp: '<path d="M8 22V3M5 22h6M8 6h6M8 11h6M8 16h6M14 5v2M14 10v2M14 15v2"/>',
    vor: '<path d="M2 12h20M12 12l-2.5-7h5zM5 12v10M19 12v10M9 12v10M15 12v10"/>',
    radar: '<path d="M12 13v9M8 22h8M3 6q9 8 18 0M12 10v3"/>',
    ctower: '<path d="M10 22V12h4v10M6.5 7h11l-1.5 5h-8zM12 7V2M7 22h10"/>',
    hangar: '<path d="M2 21v-8q10-10 20 0v8zM7 21v-6h10v6"/>',
    cooling: '<path d="M5 21q4.5-8 1.5-17h11q-3 9 1.5 17zM4 21h16"/>',
    watertower: '<path d="M12 13v9M9 22h6M6 7h12v6H6zM6 7l6-4 6 4"/>',
    utility: '<path d="M2 21h20M3 21v-8h9v8M14 21v-6h6v6M6 13V4h2v9"/>',
    stadium: '<ellipse cx="12" cy="15" rx="10" ry="5"/><ellipse cx="12" cy="15" rx="5" ry="2.2"/><path d="M3 15V5M21 15V5"/>',
    wall: '<path d="M2 20h20M2 12h20v8M6 12v8M10 12v8M14 12v8M18 12v8"/>',
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
      var wood = ['#8d6e63', '#6d4c41', '#a1887f'], p = cyl(0, 0, 0.8, 22, 0, wood).concat(box(0, 0, 10, 0.9, 0.9, 19.4, wood));
      [-4, 0, 4].forEach(function (x) { p = p.concat(cyl(x, -0.2, 0.4, 1.3, 20.3, ['#cfd8dc', '#90a4ae', '#eceff1'])); });
      [-4, 0, 4].forEach(function (x) { var q = pt(x, -0.2, 21.6); p.push(S('M0 ' + r2(q[1] + 3) + 'Q' + r2(q[0] / 2) + ' ' + r2(q[1] + 4.5) + ' ' + r2(q[0]) + ' ' + r2(q[1]) + 'Q' + r2((q[0] + 32) / 2) + ' ' + r2(q[1] + 4.5) + ' 32 ' + r2(q[1] + 3), '#37474f', 0.45)); });
      return { p: p, top: pt(0, 0, 22) };
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
      var p = [S(line([pt(-5, 0, 0), pt(-5, 0, 3.2)]), '#78909c', 1.1), S(line([pt(5, 0, 0), pt(5, 0, 3.2)]), '#78909c', 1.1)].concat(box(0, 0, 17, 2, 7, 3, ['#ffd600', '#b89a00', '#fff176']));
      p.push(F(poly([pt(-8.5, -1, 3), pt(-1.8, -1, 3), pt(-1.8, -1, 10), pt(-8.5, -1, 10)]), '#d50000', true));
      p.push(S(line([pt(-7.4, -1, 8.3), pt(-7.4, -1, 4.7)]), '#ffffff', 1), S(line([pt(-6, -1, 8.3), pt(-6, -1, 4.7), pt(-4.4, -1, 4.7)]), '#ffffff', 1), S(line([pt(-3.3, -1, 8.3), pt(-3.3, -1, 4.7)]), '#ffffff', 1));
      p.push(S(line([pt(0, -1, 6.5), pt(6.4, -1, 6.5)]), '#111111', 1.3), S(line([pt(4.2, -1, 8.4), pt(6.4, -1, 6.5), pt(4.2, -1, 4.6)]), '#111111', 1.3));
      return { p: p, top: pt(0, 0, 10) };
    },
    monument: function () {
      var p = box(0, 0, 9, 6, 2.5, 0, C.stone).concat(frustum(0, 0, 4, 4, 2.4, 2.4, 20, 2.5, C.stone));
      p.push(F(poly([pt(-1.2, -1.2, 22.5), pt(1.2, -1.2, 22.5), pt(0, 0, 26.5)]), '#efe7de'), F(poly([pt(1.2, -1.2, 22.5), pt(1.2, 1.2, 22.5), pt(0, 0, 26.5)]), '#b3a395'));
      return { p: p, top: pt(0, 0, 26.5) };
    },
    // an apron floodlight mast / street light: the mast, the head of lamps and the light it throws on the ground
    lamp: function () {
      var p = [F(poly([pt(-3.4, -1.2, 24.2), pt(3.4, -1.2, 24.2), [29, 37], [3, 37]]), 'rgba(255,241,118,.22)', true)].concat(cyl(0, 0, 0.75, 24, 0, C.steel), box(0, -0.4, 7.4, 1.4, 2.6, 23.6, ['#b0bec5', '#78909c', '#cfd8dc']));
      for (var x = -2.6; x <= 2.7; x += 1.75) { var q = pt(x, -1.2, 24.9); p.push(F(ell(q[0], q[1], 0.8, 0.8), '#fff59d', true)); }
      return { p: p, top: pt(0, 0, 26.4) };
    },
    // the wind direction indicator (Annex 14): a mast, the ring and the striped cone
    windsock: function () {
      var p = box(0, 0, 3, 3, 0.8, 0, C.steel).concat(cyl(0, 0, 0.55, 20, 0.8, C.white));
      var r = pt(0.6, 0, 19.4), L = 12;
      for (var i = 0; i < 5; i++) {
        var a = i / 5, b = (i + 1) / 5, ra = 2.3 - 1.3 * a, rb = 2.3 - 1.3 * b, xa = r[0] + L * a, xb = r[0] + L * b, ya = r[1] + 2.2 * a * a, yb = r[1] + 2.2 * b * b;
        p.push(F(poly([[xa, ya - ra], [xb, yb - rb], [xb, yb + rb], [xa, ya + ra]]), i % 2 ? '#ffffff' : '#ff6d00'));
      }
      p.push(F(ell(r[0] + L, r[1] + 2.2, 0.45, 1), '#bf360c', true), S(ell(r[0], r[1], 0.7, 2.4), '#455a64', 0.9));
      return { p: p, top: pt(0, 0, 21) };
    },
    // approach / runway light structure: a frangible mast with a bar of lights
    als: function () {
      var p = cyl(0, 0, 0.6, 9, 0, C.orange).concat(box(0, 0, 14, 1, 0.9, 9, C.steel));
      p.push(S(line([pt(-4, 0, 9), pt(0, 0, 5.5), pt(4, 0, 9)]), '#78909c', 0.6));
      for (var x = -6; x <= 6.1; x += 3) { var q = pt(x, -0.6, 10.5); p.push(F(ell(q[0], q[1], 1.7, 1.7), 'rgba(255,255,255,.4)', true), F(ell(q[0], q[1], 0.8, 0.8), '#fffde7', true)); }
      return { p: p, top: pt(0, 0, 11) };
    },
    // the ILS localizer: a row of antennas on a low frame beyond the runway end
    loc: function () {
      var p = [];
      [-10, 0, 10].forEach(function (x) { p = p.concat(cyl(x, 0, 0.4, 3, 0, C.steel)); });
      p = p.concat(box(0, 0, 23, 1.6, 1, 3, C.steel));
      for (var i = 0; i < 8; i++) p = p.concat(box(-9.5 + i * 2.7, 0, 0.9, 1.2, 3.6, 4, C.white));
      return { p: p, top: pt(0, 0, 7.6) };
    },
    // the ILS glide path: its mast with the antennas on one side and the shelter at its foot
    gp: function () {
      var p = box(4, 1, 6, 4, 3.4, 0, C.con).concat(frustum(0, 0, 1.6, 1.6, 1, 1, 22, 0, C.steel));
      [9, 14.5, 20].forEach(function (z) { p = p.concat(box(-2.4, -0.4, 2.4, 1.2, 1.8, z, C.white)); p.push(S(line([pt(-1.2, -0.4, z + 0.9), pt(-0.4, 0, z + 0.9)]), '#78909c', 0.7)); });
      return { p: p, top: pt(0, 0, 22.5) };
    },
    // VOR / DVOR: the shelter, the wide counterpoise on its legs, the ring of antennas and the central antenna
    vor: function () {
      var p = [];
      [[-7, 3], [7, 3], [-7, -3], [7, -3]].forEach(function (q) { p = p.concat(cyl(q[0], q[1], 0.4, 5, 0, C.steel)); });
      p = p.concat(box(0, 0, 5, 5, 4.6, 0, C.con), cyl(0, 0, 11, 0.7, 5, ['#cfd8dc', '#90a4ae', '#eceff1']));
      for (var i = 0; i < 16; i++) { var a = i / 16 * 2 * Math.PI, q = pt(10 * Math.cos(a), 10 * Math.sin(a), 5.7); p.push(S(line([q, [q[0], q[1] - 2.2]]), '#546e7a', 0.6)); }
      p.push(F(poly([pt(-1.8, 0, 5.7), pt(1.8, 0, 5.7), pt(0, 0, 11)]), '#eceff1'), F(poly([pt(0, 0, 5.7), pt(1.8, 0, 5.7), pt(0, 0, 11)]), '#b0bec5', true));
      return { p: p, top: pt(0, 0, 11) };
    },
    // radar: the tower, its equipment room and the turning antenna
    radar: function () {
      var p = frustum(0, 0, 5, 5, 3.2, 3.2, 15, 0, C.steel).concat(box(0, 0, 4.4, 4.4, 2.4, 15, C.white));
      var c = pt(0, 0, 21.5);
      p.push(S(line([pt(0, 0, 17.4), pt(0, 0, 20)]), '#546e7a', 1.2));
      p.push(F('M' + r2(c[0] - 8.5) + ' ' + r2(c[1] - 1) + 'Q' + r2(c[0]) + ' ' + r2(c[1] + 2.6) + ' ' + r2(c[0] + 8.5) + ' ' + r2(c[1] - 1) + 'L' + r2(c[0] + 8.5) + ' ' + r2(c[1] - 4.2) + 'Q' + r2(c[0]) + ' ' + r2(c[1] - 1.4) + ' ' + r2(c[0] - 8.5) + ' ' + r2(c[1] - 4.2) + 'Z', '#eceff1'));
      return { p: p, top: [c[0], c[1] - 4.2] };
    },
    // the control tower: base building, shaft, the glass cab and its roof antenna
    ctower: function () {
      var p = box(0, 0, 10, 7, 3, 0, C.con).concat(frustum(0, 0, 4, 4, 3.4, 3.4, 17, 3, C.con), frustum(0, 0, 4.4, 4.4, 7.8, 7.8, 1.6, 20, C.con),
        frustum(0, 0, 7.8, 7.8, 6.8, 6.8, 4, 21.6, ['#4fc3f7', '#0277bd', '#b3e5fc']), box(0, 0, 8.2, 8.2, 0.9, 25.6, C.white));
      [-2, 0, 2].forEach(function (x) { p.push(S(line([pt(x * 1.7, -3.9, 21.6), pt(x * 1.5, -3.4, 25.6)]), '#01579b', 0.5)); });
      p.push(S(line([pt(0, 0, 26.5), pt(0, 0, 31)]), '#546e7a', 0.8));
      return { p: p, top: pt(0, 0, 31) };
    },
    // a hangar: walls, the arched roof and the doors
    hangar: function () {
      var p = box(0, 0, 21, 12, 6, 0, ['#cfd8dc', '#90a4ae', '#eceff1']);
      var a = pt(-10.5, -6, 6), b = pt(10.5, -6, 6), a2 = pt(-10.5, 6, 6), b2 = pt(10.5, 6, 6), up = 8;
      p.push(F('M' + r2(a[0]) + ' ' + r2(a[1]) + 'Q' + r2((a[0] + b[0]) / 2) + ' ' + r2(a[1] - up) + ' ' + r2(b[0]) + ' ' + r2(b[1]) + 'L' + r2(b2[0]) + ' ' + r2(b2[1]) + 'Q' + r2((a2[0] + b2[0]) / 2) + ' ' + r2(a2[1] - up) + ' ' + r2(a2[0]) + ' ' + r2(a2[1]) + 'Z', '#b0bec5'));
      p.push(F('M' + r2(a[0]) + ' ' + r2(a[1]) + 'Q' + r2((a[0] + b[0]) / 2) + ' ' + r2(a[1] - up) + ' ' + r2(b[0]) + ' ' + r2(b[1]) + 'Z', '#e3e8ec'));
      p.push(F(poly([pt(-7.5, -6, 0), pt(7.5, -6, 0), pt(7.5, -6, 6.5), pt(-7.5, -6, 6.5)]), '#78909c', true));
      for (var x = -5; x <= 5; x += 2.5) p.push(S(line([pt(x, -6, 0), pt(x, -6, 6.5)]), '#546e7a', 0.4));
      return { p: p, top: [(a[0] + b[0]) / 2, a[1] - up / 2] };
    },
    // a cooling tower: the curved shell, its open top and the steam
    cooling: function () {
      var b = pt(0, 0, 0), t = pt(0, 0, 20), w0 = 8.5, wm = 5, w1 = 6, ry = w0 * 0.4, mid = (b[1] + t[1]) / 2;
      var shell = 'M' + r2(b[0] - w0) + ' ' + r2(b[1]) + 'Q' + r2(b[0] - wm * 0.7) + ' ' + r2(mid) + ' ' + r2(t[0] - w1) + ' ' + r2(t[1]) + 'L' + r2(t[0] + w1) + ' ' + r2(t[1]) + 'Q' + r2(b[0] + wm * 0.7) + ' ' + r2(mid) + ' ' + r2(b[0] + w0) + ' ' + r2(b[1]) + 'A' + r2(w0) + ' ' + r2(ry) + ' 0 0 1 ' + r2(b[0] - w0) + ' ' + r2(b[1]) + 'Z';
      var shade = 'M' + r2(b[0] + 0.3 * w0) + ' ' + r2(b[1] + ry * 0.95) + 'Q' + r2(b[0] + 0.3 * wm * 0.7) + ' ' + r2(mid) + ' ' + r2(t[0] + 0.3 * w1) + ' ' + r2(t[1]) + 'L' + r2(t[0] + w1) + ' ' + r2(t[1]) + 'Q' + r2(b[0] + wm * 0.7) + ' ' + r2(mid) + ' ' + r2(b[0] + w0) + ' ' + r2(b[1]) + 'A' + r2(w0) + ' ' + r2(ry) + ' 0 0 1 ' + r2(b[0] + 0.3 * w0) + ' ' + r2(b[1] + ry * 0.95) + 'Z';
      return { p: [F(shell, '#d7dde2'), F(shade, '#a7b4be', true), F(ell(t[0], t[1], w1, w1 * 0.4), '#90a4ae'), F(ell(t[0], t[1], w1 * 0.8, w1 * 0.3), '#455a64', true),
        F(ell(t[0] + 1, t[1] - 4, 4, 3), 'rgba(236,239,241,.85)', true), F(ell(t[0] + 4, t[1] - 8.5, 4.5, 3.2), 'rgba(236,239,241,.6)', true)], top: [t[0], t[1] - 1] };
    },
    // a water tower: the column and the tank on it
    watertower: function () {
      var p = cyl(0, 0, 1.4, 16, 0, C.con).concat(cyl(0, 0, 6.5, 5.5, 16, ['#e3f2fd', '#90caf9', '#ffffff'])), t = pt(0, 0, 21.5);
      p.push(F(poly([[t[0] - 6.5, t[1]], [t[0] + 6.5, t[1]], [t[0], t[1] - 3.2]]), '#bbdefb'));
      return { p: p, top: [t[0], t[1] - 3.2] };
    },
    // a plant: the hall, its chimney with smoke, a tank and pipes
    utility: function () {
      var p = box(-3, 1.5, 15, 9, 7, 0, ['#d7ccc8', '#a1887f', '#efebe9']).concat(cyl(-6.5, 2.5, 1.1, 5, 7, C.red), cyl(-6.5, 2.5, 1.05, 5, 12, C.white), cyl(-6.5, 2.5, 1, 4, 17, C.red));
      var t = pt(-6.5, 2.5, 21);
      p.push(F(ell(t[0] + 2.2, t[1] - 2.8, 2.2, 1.8), 'rgba(176,190,197,.75)', true), F(ell(t[0] + 5, t[1] - 5.2, 2.8, 2.1), 'rgba(207,216,220,.6)', true));
      p = p.concat(cyl(8, -2.5, 3.2, 7, 0, C.con));
      p.push(S(line([pt(4.5, -3, 4.5), pt(6, -3, 4.5)]), '#78909c', 1.1), S(line([pt(4.5, -3, 2.5), pt(6, -3, 2.5)]), '#78909c', 1.1));
      return { p: p, top: [t[0], t[1] - 1] };
    },
    // a stadium: the bowl of stands, the pitch and four floodlight masts
    stadium: function () {
      var p = [], mast = function (x, y) { var a = pt(x, y, 0), b = pt(x, y, 15); p.push(S(line([a, b]), '#90a4ae', 0.8), F(poly([[b[0] - 1.6, b[1] - 1.4], [b[0] + 1.6, b[1] - 1.4], [b[0] + 1.6, b[1] + 0.4], [b[0] - 1.6, b[1] + 0.4]]), '#fff59d')); };
      mast(-11, 5); mast(11, 5);
      p = p.concat(cyl(0, 0, 13, 5, 0, ['#cfd8dc', '#90a4ae', '#b0bec5']));
      var t = pt(0, 0, 5); p.push(F(ell(t[0], t[1] + 0.4, 10, 3.8), '#78909c', true), F(ell(t[0], t[1] + 0.9, 7.5, 2.6), '#43a047', true));
      mast(-11, -5); mast(11, -5);
      return { p: p, top: pt(11, -5, 15) };
    },
    // a wall or fence (blast fence, perimeter fence, dam)
    wall: function () {
      var p = box(0, 0, 24, 1.2, 5, 0, ['#bdbdbd', '#8d8d8d', '#e0e0e0']);
      for (var x = -11; x < 11; x += 2) p.push(S(line([pt(x, -0.6, 0.3), pt(x + 2, -0.6, 4.7)]), '#9e9e9e', 0.4), S(line([pt(x + 2, -0.6, 0.3), pt(x, -0.6, 4.7)]), '#9e9e9e', 0.4));
      return { p: p, top: pt(0, 0, 5) };
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
  /* ------------------------------------------------------------ scale */
  // the scale bar of the obstacle maps in nautical miles (aviation use), with a line in feet when zoomed in below 1 NM;
  // Ll: Leaflet (of the window the map is in)
  function scaleNM(Ll, map, position) {
    var ctl = Ll.control({ position: position || 'bottomleft' });
    ctl.onAdd = function () {
      var d = Ll.DomUtil.create('div', 'leaflet-control-scale'), nm = Ll.DomUtil.create('div', 'leaflet-control-scale-line', d), ft = Ll.DomUtil.create('div', 'leaflet-control-scale-line', d);
      var round = function (v) { var p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p; return (n >= 5 ? 5 : n >= 2 ? 2 : 1) * p; };
      function update() {
        var y = map.getSize().y / 2, maxPx = 110, m = map.distance(map.containerPointToLatLng([0, y]), map.containerPointToLatLng([maxPx, y]));
        if (!(m > 0)) return;
        var n = round(m / 1852);
        nm.style.width = Math.round(maxPx * n * 1852 / m) + 'px'; nm.textContent = +n.toFixed(3) + ' NM';
        var f = round(m / 0.3048);
        ft.style.display = m < 1852 ? '' : 'none'; ft.style.width = Math.round(maxPx * f * 0.3048 / m) + 'px'; ft.textContent = f.toLocaleString('en-US') + ' ft';
      }
      map.on('move zoom resize', update); map.whenReady(update);
      return d;
    };
    return ctl.addTo(map);
  }
  /* ------------------------------------------------------------ models or dots */
  // how the obstacle maps draw obstacles: 'models' (the 3D model of the kind) or 'dots' (plain dots, the colour of the
  // result); one choice for every map, kept in the browser
  var KEY = 'aixm-obs-style', cur = null;
  function mapStyle(v) {
    if (cur === null) { try { cur = localStorage.getItem(KEY) === 'dots' ? 'dots' : 'models'; } catch (e) { cur = 'models'; } }
    if (v === 'models' || v === 'dots') { cur = v; try { localStorage.setItem(KEY, v); } catch (e) { /* storage unavailable */ } }
    return cur;
  }
  // the switch on a Leaflet map (Ll: Leaflet of its window): Models | Dots; onChange(style) redraws the obstacles
  function styleControl(Ll, map, onChange, position) {
    var ctl = Ll.control({ position: position || 'topleft' });
    ctl.onAdd = function () {
      var d = Ll.DomUtil.create('div', 'obs-style');
      d.setAttribute('role', 'group'); d.setAttribute('aria-label', 'Obstacles drawn as');
      d.innerHTML = '<button type="button" data-os="models" title="Obstacles as 3D models of their kind">Models</button><button type="button" data-os="dots" title="Obstacles as plain dots">Dots</button>';
      function mark() { d.querySelectorAll('button').forEach(function (b) { var on = b.getAttribute('data-os') === mapStyle(); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); }); }
      mark();
      Ll.DomEvent.disableClickPropagation(d);
      d.addEventListener('click', function (e) { var b = e.target.closest('[data-os]'); if (!b || b.getAttribute('data-os') === mapStyle()) return; mapStyle(b.getAttribute('data-os')); mark(); onChange(mapStyle()); });
      return d;
    };
    return ctl.addTo(map);
  }
  return { KIND_NAME: KIND_NAME, kindOf: kindOf, ICON: ICON, svg: svg, legendHtml: legendHtml, draw: draw, pathOf: pathOf, light: light,
    svg3d: svg3d, parts3d: parts3d, paint3d: paint3d, draw3d: draw3d, scaleNM: scaleNM, mapStyle: mapStyle, styleControl: styleControl };
})();
if (typeof module !== 'undefined') module.exports = OBSICON;
