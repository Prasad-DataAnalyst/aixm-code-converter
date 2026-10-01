/*!
 * AIXM Code Converter
 * Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com> - author of the AIXM Code Converter
 * SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE; keep this notice in all copies)
 * ==========================================================================
 * AIXM Code Converter - "About this tool" page
 * What the tool is, who it helps, what is in it and how to start. Plain
 * content: edit the texts here (the page is built from the lists below).
 * ========================================================================== */
/* global APP_INFO */
var ABOUT = (function () {
  'use strict';
  // author signature, hidden in the page (zero-width characters) - see NOTICE
  function zw(t) { return t.split('').map(function (c) { return ('0000000' + c.charCodeAt(0).toString(2)).slice(-8).replace(/0/g, '​').replace(/1/g, '‌'); }).join('‍'); }
  var SIG = APP_INFO.author + ' <' + APP_INFO.email + '>';

  var WHO = [
    ['AIS / AIM offices', 'Check the AIXM data set of the State before and after every AIRAC cycle, read it as the familiar AIP and find what changed.'],
    ['Data validation and quality teams', 'Run the official AIXM 5.1 business rules and basic checks, open the exact AIXM code of any value, compare two deliveries.'],
    ['Aerodrome and procedure specialists', 'See every aerodrome as AD 2 / AD 3 tables, an airport chart and the instrument procedures drawn on the map.'],
    ['Airlines, flight operations, charting and ATC', 'Read a State\'s digital data without special software, export it to Excel, PDF, GeoJSON, KML or Shapefile.'],
    ['Students and trainers', 'Learn AIXM by moving between the AIP view, the data model (Explorer) and the original XML.']
  ];
  var FEATURES = [
    ['Reads every AIXM version', 'AIXM 4.5 (Snapshot / Update), 5.0, 5.1, 5.1.1 and 5.2, detected automatically. Multi-gigabyte files are streamed by parallel threads.'],
    ['ICAO AIP layout', 'GEN, ENR 1–6 and AD 2 / AD 3 for every aerodrome and heliport, as in the ICAO specimen AIP; each value opens its AIXM code.'],
    ['Changes and AIRAC cycles', 'Changes inside a file, comparison of two files, values changed in the selected AIRAC cycle in red, AMDT report, side-by-side view, timeline and Digital NOTAM text.'],
    ['Aeronautical map', 'Offline world map (OpenStreetMap or satellite when online), airspace with class and limits, routes, navaids with frequencies, points, obstacles, procedures, measuring, print to A4 / A3.'],
    ['Airport chart', 'Runways to scale with markings, designators, bearings and threshold elevations, ILS feathers, taxiway signs, aprons, stands, holding positions and an airport information card.'],
    ['Terrain model', 'A global terrain model is built in (works offline); high-resolution terrain is loaded automatically when online. Grid MORA per 1° square on the map, terrain elevation under the mouse, online terrain shading.'],
    ['3D view', 'Terrain with airspace volumes drawn between their lower and upper limits, runways, aerodromes, obstacles and procedures at their published altitudes. Point anywhere to see the airspace column above it.'],
    ['Approach and departure crew views', 'Fly down the glide path or along the climb-out of any runway and see what the crew sees, with altitude, height above the runway, terrain clearance and the airspace the aircraft is in.'],
    ['Map in a second window', '“⧉ New window” puts the map on another screen; “show on map” in the main window goes there.'],
    ['Data quality', 'The official AIXM 5.1 business rules (SBVR) with their catalogue, and basic consistency checks.'],
    ['Obstacle limitation surfaces', 'The ICAO Annex 14 surfaces of every runway built from the data and every obstacle checked against them: penetrations listed with the surface and the height above it, and shown in 3D.'],
    ['Data integrity (CRC32Q)', 'Critical, essential and routine data classified as in PANS-AIM with the required and declared accuracy, a CRC32Q fingerprint for each item, and verification of a new delivery against a saved CRC list.'],
    ['Approach profile', 'The vertical profile of each instrument approach, as on an approach chart: fixes, distances, altitude constraints, glide path, minima, missed approach, rate-of-descent and timing table.'],
    ['Exports and conversions', 'JSON, Excel, PDF, print, e-mail; AIXM 5.1 ↔ 5.1.1 ↔ 5.2, AIXM 4.5 → 5.1.1, GeoJSON, KML, Shapefile.'],
    ['State library', 'One folder per State on your disk; extracted data is cached for instant reopening. Bookmarks and shareable links.'],
    ['Languages', 'English, العربية (right-to-left), Français and Español; light and dark themes.']
  ];
  var STEPS = [
    ['Open', 'Drop one or more AIXM files (or a .zip) on the Files page, or connect a State library folder.'],
    ['Extract', 'Press Extract. The State, AIXM version, AIRAC cycle and effective date are detected.'],
    ['Use', 'Read the AIP, look at the map and the airport charts, list the changes, compare cycles, check quality and export.']
  ];

  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function cards(list, cls) { return '<div class="' + cls + '">' + list.map(function (x) { return '<div class="ab-card"><b>' + esc(x[0]) + '</b><p>' + esc(x[1]) + '</p></div>'; }).join('') + '</div>'; }

  // the full page
  function html() {
    var h = '<div class="about-page">';
    h += '<section class="ab-hero"><div class="ab-kicker">About this tool</div><h1>' + esc(APP_INFO.name) + '</h1>' +
      '<p class="ab-lead">Turns aeronautical data in <b>AIXM</b> — the international exchange format for aeronautical information — into something people can read: the <b>ICAO AIP</b>, an aeronautical <b>map</b> with <b>airport charts</b>, and clear lists of <b>what changed</b>. One HTML file, no installation, no server, works offline; your data never leaves your computer.</p>' +
      '<div class="ab-facts"><span>AIXM 4.5 · 5.0 · 5.1 · 5.1.1 · 5.2</span><span>ICAO Annex 15 / PANS-AIM AIP</span><span>Offline · single file</span><span>Version ' + esc(APP_INFO.version) + '</span></div></section>';
    h += '<section class="nfo-box ab-nfo"><h2>⚠ Not for operational use</h2><p>' + esc(APP_INFO.disclaimer) + '</p></section>';
    h += '<section><h2>Why it helps</h2><p>AIXM files are large XML documents built for machines. Reading them normally needs specialised, expensive software. This tool lets anyone check a State\'s digital aeronautical data the way it is published — page by page, aerodrome by aerodrome, on a chart — and see exactly which values come from which XML element. It shortens AIRAC checks from hours to minutes and makes data errors visible before they reach pilots and charts.</p></section>';
    h += '<section><h2>Who it is for</h2>' + cards(WHO, 'ab-grid') + '</section>';
    h += '<section><h2>What is available</h2>' + cards(FEATURES, 'ab-grid ab-grid-2') + '</section>';
    h += '<section><h2>3D view, terrain, approach and departure</h2>' +
      '<p>Open the <b>Map</b> and press <b>🗻 3D view</b>, or choose an aerodrome in <b>Airport view</b> and press <b>🗻 3D approach</b> or <b>🗻 3D departure</b>.</p>' +
      '<ul class="ab-list">' +
      '<li><b>Terrain model.</b> A global elevation grid (0.25°, from the public Terrain Tiles: SRTM, GMTED2010, ETOPO1) is inside this file, so the 3D view works offline. When the computer is online, high-resolution terrain (down to about 40 m) is loaded for the area you look at. The coastline comes from the built-in world map. Colours follow aeronautical chart tints: green lowlands, brown high ground, white peaks.</li>' +
      '<li><b>Airspace in 3D.</b> Every airspace is drawn as a transparent volume from its lower to its upper limit: flight levels, feet and metres AMSL, and AGL limits on top of the terrain. Choose the ceiling (FL100 to FL600), switch FIR / UIR on or off and exaggerate heights (1× to 5×) to see thin layers. Labels show name, class and limits.</li>' +
      '<li><b>Airspace column.</b> Move the mouse over the terrain: the panel lists every airspace above that point with its upper and lower limits, plus the terrain elevation and the grid MORA. Double-click a volume to open its AIP section.</li>' +
      '<li><b>Approach crew view.</b> The camera sits on the extended centreline on the glide path (the ILS glide-path angle from the data, otherwise 3°) and looks at the runway. Use the slider (15 NM to the threshold) or <b>▶ Fly</b>. The panel shows distance, altitude, height above threshold, terrain below, terrain clearance (red under 1000 ft) and the airspace you are in. The glide path is drawn with a curtain to the ground and distance / altitude marks every 2 NM.</li>' +
      '<li><b>Departure crew view.</b> The camera climbs from 35 ft at the departure end of the runway at the standard 3.3 % gradient (200 ft per NM) along the runway track, with the same read-outs, so rising terrain, obstacles and airspace limits after take-off are easy to see.</li>' +
      '<li><b>Procedures, runways and obstacles.</b> SIDs, STARs and approaches of the aerodrome are drawn at their published altitude constraints (interpolated in between), runways at their threshold elevations with edge and approach lights, obstacles as red poles to their top elevation.</li>' +
      '<li><b>On the 2D map.</b> <i>Grid MORA</i> shows the highest terrain per 1° square + 1000 ft (2000 ft above 5000 ft) in Jeppesen style; <i>Terrain shading</i> adds online hillshade; the status bar shows the terrain elevation under the mouse.</li>' +
      '<li><b>Limits.</b> The built-in grid is coarse (about 28 km; peaks are smoothed), so terrain, grid MORA and clearances are indicative. Use the official charts and MORA / MSA values for flight.</li></ul></section>';
    h += '<section><h2>Safety and data-integrity checks</h2><ul class="ab-list">' +
      '<li><b>Obstacle limitation surfaces (ICAO Annex 14).</b> <i>Quality → Obstacle surfaces</i> builds, for every runway, the approach and take-off climb surfaces (Tables 4-1 and 4-2), the transitional surfaces along the strip, the inner horizontal surface (45 m) and the conical surface (5 %). The runway code number comes from the runway length and the approach type from the ILS and instrument approaches in the data. Every obstacle of all loaded files within 11 NM is checked; penetrations are listed with the surface, the permitted elevation and the height above it, and <b>🗻 Show in 3D</b> draws the surfaces with the penetrating obstacles in red. The airport card shows the result too. The inner approach / OFZ surfaces are not included and the official survey prevails.</li>' +
      '<li><b>Data integrity (Annex 15, PANS-AIM).</b> <i>Quality → Data integrity</i> lists every critical, essential and routine data item (thresholds, runway ends, holding positions, ILS, navaids, points, obstacles, aerodrome reference point and elevation) with the accuracy PANS-AIM requires and the accuracy declared in the data. Each item gets a <b>CRC32Q</b> fingerprint (the 32-bit CRC of the aeronautical data chain). <b>Save CRC list</b> keeps the fingerprints; <b>Verify against a CRC list</b> shows which items changed, disappeared or are new in a later delivery. CRC values published in the file (AIXM 4.5 valCrc, FAS data blocks) are listed.</li>' +
      '<li><b>Approach profile.</b> Every instrument approach in AD 2.22 shows its vertical profile: IAF / IF / FAF / MAPt with distances to the threshold, altitude constraints with chart bars (at or above, at or below, at), courses, glide slope or vertical angle with TCH, minima, missed approach and the terrain under the track, followed by the rate-of-descent table (ft/min for 70–160 kt) and the time from the FAF to the MAPt. It prints with the AIP page.</li></ul></section>';
    h += '<section><h2>How to start</h2><ol class="ab-steps">' + STEPS.map(function (x) { return '<li><b>' + esc(x[0]) + '</b> — ' + esc(x[1]) + '</li>'; }).join('') + '</ol></section>';
    h += '<section><h2>Good to know</h2><ul class="ab-list">' +
      '<li><b>Privacy:</b> everything runs in your browser. Only the optional online map tiles use the internet.</li>' +
      '<li><b>Time:</b> AIXM times are UTC; “Latest data / Valid on date” shows the data valid on any day (BASELINE, PERMDELTA, TEMPDELTA).</li>' +
      '<li><b>Large files:</b> files over 1.5 GB use the Lite memory mode automatically.</li>' +
      '<li><b>Sources:</b> AIXM schemas, code lists and business rules from aixm.aero (EUROCONTROL, FAA); base map Natural Earth; terrain from the Terrain Tiles (Mapzen / AWS Open Data: SRTM, GMTED2010, ETOPO1); libraries Leaflet, three.js, SheetJS, jsPDF, fflate, topojson.</li></ul></section>';
    h += '<section class="ab-author"><h2>Author</h2><p>Created by <b>' + esc(APP_INFO.author) + '</b> · <a href="mailto:' + esc(APP_INFO.email) + '">' + esc(APP_INFO.email) + '</a></p>' +
      '<p class="muted">© ' + esc(APP_INFO.year) + ' ' + esc(APP_INFO.author) + '. Open source under the Apache License 2.0 — redistributions and modified versions must keep this attribution (LICENSE and NOTICE).</p>' +
      '<span class="ab-sig" aria-hidden="true">' + zw(SIG) + '</span></section>';
    h += '</div>';
    return h;
  }
  // short introduction for the start page
  function intro() {
    return '<div class="card ab-intro"><div><b>' + esc(APP_INFO.name) + '</b> reads AIXM 4.5 – 5.2 files and shows them as the ICAO AIP, an aeronautical map with airport charts, and lists of changes — offline, in this one file.' +
      '<span class="ab-sig" aria-hidden="true">' + zw(SIG) + '</span></div><button class="btn small" data-about-page>About this tool</button></div>';
  }
  return { html: html, intro: intro };
})();
