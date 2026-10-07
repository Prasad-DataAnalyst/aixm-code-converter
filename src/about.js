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
    ['Digital data sets', 'AIP, obstacle (eTOD), aerodrome mapping (AIXM or AMXM 2.0) and instrument flight procedure (IFP) data sets. An IFP data set is read with the AIP data set of its delivery, so its procedures find their waypoints, navaids and runways.'],
    ['Digital data tab', 'Obstacles (eTOD), instrument flight procedures and aerodrome mapping each get their own workspace: an overview by aerodrome and area, a list with filters, a map made for that data beside the list (the filter applies, a click selects both ways), checks and reports in PDF, print, Excel, CSV, GeoJSON and KML. The AIP views and the Map tab stay as they are.'],
    ['Obstacle analysis report', 'Choose obstacles — tick them in the list, Ctrl+click them on the map, or take those affecting flight paths — and get a report studying each one in depth with a map picture: terrain under and around it, its declared base against the terrain, the Annex 14 surface above it and the margin, its position from the runway, every flight path within 3 NM with the clearance against an indicative MOC, marking and lighting, the eTOD accuracy of its area.'],
    ['Terrain data sets', 'GeoTIFF / BigTIFF, DTED, SRTM .hgt and ESRI ASCII grid, read part by part from the disk (files of many GB): format, post spacing and the PANS-AIM area it meets, reference systems, voids and statistics, checks; shaded relief on the map with the elevation at a click; AIXM elevations (aerodromes, runway points, navaids, obstacle bases) compared with the terrain.'],
    ['Terrain and flight paths', 'For every procedure leg: the highest terrain and obstacle along its path against its lowest published altitude and an indicative minimum obstacle clearance — caution, warning or below; for each aerodrome the highest terrain within 5, 10 and 25 NM and terrain above the Annex 14 surfaces; a terrain report with map pictures. Without a terrain file, online terrain tiles or the built-in model are used, and said so.'],
    ['Obstacle workspace (eTOD)', 'Every obstacle with its eTOD area (from the obstacle area polygons), the PANS-AIM accuracy the area requires and whether it is met, lighting and marking, distance and bearing from the aerodrome reference point, Annex 14 surface penetrations; statistics by type, height and distance; a complete obstacle report in one click.'],
    ['eTOD obstacles from Excel and CSV', 'Obstacle data sets delivered as tables (.xlsx, .xls, .ods, .csv) are read: columns recognised by their headings in any order, positions in decimal or DMS, feet or metres. Other columns are kept as remarks; rows that cannot be read are listed. Shown in ENR 5.4, on the map, in 3D and the obstacle surface check.'],
    ['Aerodrome mapping (AMXM 2.0)', 'ED-99 / DO-272 aerodrome mapping files: all 45 AMXM feature types — runway, taxiway and apron elements, thresholds, stands, guidance lines, holding positions, hot spots, service roads, water — drawn on the map and the airport chart, with every AMXM attribute and the meaning of its code values (AMXM 2.0.2 schema).'],
    ['IFP data set: AIXM 5.1 and 5.2', 'Procedures read alike in AIXM 5.1, 5.1.1 and 5.2: altitudes along the leg and crossing altitudes at its end, MEA and MOCA, true and magnetic courses, speed limits, fly-by / fly-over and fix roles, RF arcs with centre and radius, PBN specification and accuracy, design standard and version, magnetic variation of the design, 5.2 minima and the full final approach segment data block (LTP / FTP, FPAP, TCH, glide path angle, CRC).'],
    ['IFP coding checks', 'Every SID, STAR and approach checked against ICAO Annex 11 (designators), PANS-OPS (path terminators for RNAV and RNP, first and last legs, the data each path terminator needs) and the EUROCONTROL coding guidelines for the ICAO IFP data set: aerodrome, runway, navigation specification, magnetic variation, design standard, MSA / TAA, transitions, reporting, descent angle, speed units, and the feature types an IFP data set holds. In Quality, in Digital data → Procedures and in the procedure report.'],
    ['Instrument procedures (PANS-OPS / TERPS)', 'SID, STAR and approaches with their legs, minima, terminal holdings, minimum sector altitudes and terminal arrival altitudes; design criteria, coding standard and flight check, aircraft categories and PBN specification, guidance facilities and the FAS data block of SBAS / GBAS approaches. Holdings and MSA sectors are drawn on the map with the procedures.'],
    ['Completeness', 'For every feature type of a data set: how many features give each property, mark it unknown, declare it not applicable or leave it out — what is complete and what is missing, at a glance, for AIXM, AMXM and IFP data.'],
    ['Safe with many files', 'Several States and large files at once: the number of reader threads follows the device and the memory left (fewer on phones and tablets). If the browser ever closes the page while reading, the next start says what was being read and reads the safe way. Any error is shown with its details to copy or send, and the rest of the tool keeps working.'],
    ['One cycle in many files', 'States that deliver one AIRAC cycle as many files (one per feature type, baseline and difference files, a checksum list) — loose or in a .zip — get one data set: references between the files resolve, checksums are verified, schema files are left out. Combine or separate files by hand at any time.'],
    ['ICAO AIP layout', 'GEN, ENR 1–6 and AD 2 / AD 3 for every aerodrome and heliport, as in the ICAO specimen AIP; each value opens its AIXM code.'],
    ['Changes and AIRAC cycles', 'Changes inside a file, comparison of two files, values changed in the selected AIRAC cycle in red, AMDT report, side-by-side view, timeline and Digital NOTAM text. Withdrawn features are listed as withdrawn and no longer shown as current; re-issues with unchanged values are counted apart; cycles that start at local midnight (e.g. 16:00 UTC) get their published AIRAC date.'],
    ['Aeronautical map', 'Any mix of the data sets loaded on one map (several States together, or all). Built-in offline world map (light and dark) or 14 free online maps — street, plain, terrain and satellite, none needs a key. Airspace with class and limits, routes, navaids with frequencies, points, obstacles, procedures, measuring, print to A4 / A3.'],
    ['Search on the map', 'Type an airway, waypoint, navaid, aerodrome, runway, taxiway, stand, airspace or obstacle: the map zooms to it, outlines it and opens its information. Understands “twy C”, “rwy 09L”, “EADD stand 5”.'],
    ['Live air traffic', '✈ Live traffic shows live aircraft on the map, over the aeronautical data and the base map you chose, at the same place and zoom (free community data, adsb.lol); the map still answers the mouse as before. Aircraft details open in a side panel inside the tool: click an aircraft there, or find a flight by callsign, registration or ICAO address for a card with airline, route, aircraft and photo, while the live map follows it.'],
    ['Airport chart', 'Runways to scale with markings, designators, bearings and threshold elevations, ILS feathers, taxiway signs, aprons, stands, holding positions and an airport information card.'],
    ['Terrain model', 'A global terrain model is built in (works offline); high-resolution terrain is loaded automatically when online. Grid MORA per 1° square on the map, terrain elevation under the mouse, online terrain shading.'],
    ['3D view', 'Terrain with airspace volumes drawn between their lower and upper limits, runways, aerodromes, obstacles and procedures at their published altitudes. Point anywhere to see the airspace column above it.'],
    ['Approach and departure crew views', 'Fly down the glide path or along the climb-out of any runway and see what the crew sees, with altitude, height above the runway, terrain clearance and the airspace the aircraft is in.'],
    ['Map in a second window', '“⧉ New window” puts the map on another screen; “show on map” in the main window goes there.'],
    ['Data quality', 'Data issues flagged in the AIP itself (⚠ on the sections, a box per section, marked values) and listed in the Quality tab with what was found and what is expected; the official AIXM 5.1 business rules (SBVR) with their catalogue.'],
    ['Obstacle limitation surfaces', 'The ICAO Annex 14 surfaces of every runway built from the data and every obstacle checked against them: penetrations listed with the surface and the height above it, and shown in 3D.'],
    ['Data integrity (CRC32Q)', 'Critical, essential and routine data classified as in PANS-AIM with the required and declared accuracy, a CRC32Q fingerprint for each item, and verification of a new delivery against a saved CRC list.'],
    ['Approach profile', 'The vertical profile of each instrument approach, as on an approach chart: fixes, distances, altitude constraints, glide path, minima, missed approach, rate-of-descent and timing table.'],
    ['Custom data export', 'Choose aerodromes and exactly which data — single AD items such as the magnetic variation, runways, declared distances, operational hours, rescue and firefighting, airspace by type (P, R, D, TMA, CTR …), ENR / GEN sections — for one or several files, in Excel, CSV, JSON, PDF, e-mail, GeoJSON, KML, Shapefile — or AIXM: the chosen features with every feature they reference (aerodrome, runways, points, navaids, borders, procedure fixes), so the file stands alone, as delivered or as AIXM 5.1, 5.1.1 or 5.2 (also from AIXM 4.5); optionally with the related data of the chosen aerodromes — all their data, the airspace over them and nearby, procedures, obstacles, navaids and routes within a distance.'],
    ['Exports and conversions', 'JSON, Excel, CSV (formula-safe), PDF, print, e-mail; AIXM 5.1 ↔ 5.1.1 ↔ 5.2, AIXM 4.5 → 5.1.1, GeoJSON, KML, Shapefile.'],
    ['One AIXM file for the cycle', 'Writes a data set — or every file of a delivery — as one clean AIXM file of what is valid from the cycle: the original XML of each feature, ended time slices and withdrawn features left out, duplicates kept once, with a report.'],
    ['State library', 'One folder per State on your disk; a cycle delivered as many files (also in sub-folders) is one entry. Extracted data is saved for instant reopening. Bookmarks and shareable links.'],
    ['Computers, tablets and phones', 'The desktop layout on computers; layouts made for iPhone, Android phones, iPad and Android tablets, upright or sideways.'],
    ['Accessible', 'Every control is named for screen readers and colours keep enough contrast in light and dark themes (checked with axe-core, WCAG 2.1 AA).'],
    ['Languages', 'English, العربية (right-to-left), Français and Español; light and dark themes.']
  ];
  var NEWS = [
    ['1.24', 'AIXM custom export with related data: one aerodrome with its airspace (CTR, ATZ, TMA, FIR … and P / R / D nearby), procedures, obstacles, navaids and routes within a chosen distance, from every data set loaded of the State.'],
    ['1.23', 'Custom data export in AIXM: only the data chosen, with all the features it needs to stand alone, as delivered (4.5, 5.1, 5.1.1, 5.2) or converted to AIXM 5.1, 5.1.1 or 5.2.'],
    ['1.22', 'IFP data set in AIXM 5.2 read like 5.1 (crossing altitudes, courses, PBN, design standard, FAS data block, 5.2 minima); RF legs drawn as arcs; IFP coding checks from ICAO, PANS-OPS and the EUROCONTROL guidelines; a reference and coding plan for IFP and digital charts.'],
    ['1.21', 'Terrain files (GeoTIFF, DTED, .hgt, ASCII grid) with checks, shaded relief and AIXM cross-check; terrain along every flight path and around every aerodrome; obstacles affecting flight paths flagged; obstacles chosen in the list or on the map analysed in depth, with map pictures, in a report.'],
    ['1.20', 'Digital data tab: obstacles (eTOD), procedures (IFP) and aerodrome mapping each with an overview, a list, their own map linked to the list, checks (PANS-AIM area accuracy, coverage of the obstacle area, Annex 14) and reports in PDF, print, Excel, CSV, GeoJSON and KML.'],
    ['1.19', 'eTOD obstacle data sets as Excel or CSV tables: headings recognised in any order and language of writing (decimal or DMS coordinates, split degree columns, WKT, feet or metres), every other column kept, rows without a position listed; shown in ENR 5.4, on the map, in 3D and checked against the obstacle limitation surfaces.'],
    ['1.18.1', 'Several files at once without the page closing: fewer reader threads on phones, tablets and when memory is short; if the browser closes the page while reading, the next start explains it and reads the safe way; errors shown in a bar with details to send; saved aerodrome mapping copies fixed.'],
    ['1.18', 'Completeness view (what every feature type gives, marks unknown or leaves out); AMXM attributes with their meaning; PANS-OPS / TERPS procedure details (design criteria, PBN, FAS data block); IFP and AMXM checks; related data sets offered to be read together; large aerodrome mapping files 7× faster.'],
    ['1.17', 'Aerodrome mapping in AMXM 2.0 (ED-99 / DO-272) on the map and the airport chart; IFP data sets read with their AIP data set; terminal holdings and minimum sector altitudes in AD 2.22 and on the map.'],
    ['1.16', 'Airport view for every aerodrome with a position, also when the data has no runway coordinates (runways listed from the data, with a note of what the data set does not give); thresholds without coordinates flagged.'],
    ['1.15', 'Data issues shown where you read: the AIP marks the sections and values with an issue and explains each one (what was found, what is expected); new checks for 0°N 0°E positions, duplicates, implausible elevations, lengths and limits.'],
    ['1.14', 'Several data sets on one map: tick any mix of the States loaded (e.g. Qatar, Saudi Arabia, UAE and China), or show all of them.'],
    ['1.13', 'Faster map (dark and satellite maps over 10× smoother to drag); live aircraft drawn over the aeronautical data with your base map kept; aircraft details in a side panel; a blocked street map removed.'],
    ['1.12', 'One AIXM file for the cycle (Export); deliveries of many files in the State library; navaid equipment without coordinates shown at its navaid\'s position.'],
    ['1.11', 'Find an aircraft by callsign, registration or ICAO address: a details card in this tool\'s style, and the live map follows the aircraft.'],
    ['1.10', 'Aircraft details inside the tool — click any aircraft on the live map, no new tab.'],
    ['1.9', 'One AIRAC cycle delivered as many files is read as one data set; withdrawn features; AIRAC cycles at local midnight; identifiers that are not hexadecimal UUIDs.'],
    ['1.8', 'Live air traffic on the map as an on / off switch.'],
    ['1.7', 'Code audit fixes: safer CSV, zip size limit, saved data per memory mode, no internet use with the offline map, accessibility, licences of all built-in parts, updated build pipelines; offline map readable in dark mode.'],
    ['1.6', 'Search on the map; top bar fixed on laptops.'],
    ['1.5', '15 free online maps without a key; AIP section list folds and unfolds correctly.'],
    ['1.2 – 1.4', 'Layouts for phones and tablets; feedback form; footer with author and licence.']
  ];
  var STEPS = [
    ['Open', 'Drop one or more AIXM files (or a .zip) on the Files page — the files of one delivery become one data set — or connect a State library folder.'],
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
    h += '<section><h2>What\'s new</h2><ul class="ab-list">' + NEWS.map(function (x) { return '<li><b>' + esc(x[0]) + '</b> — ' + esc(x[1]) + '</li>'; }).join('') + '</ul><p class="muted">Every change is listed in CHANGELOG.md of the release.</p></section>';
    h += '<section><h2>How to start</h2><ol class="ab-steps">' + STEPS.map(function (x) { return '<li><b>' + esc(x[0]) + '</b> — ' + esc(x[1]) + '</li>'; }).join('') + '</ol></section>';
    h += '<section><h2>Good to know</h2><ul class="ab-list">' +
      '<li><b>Privacy:</b> everything runs in your browser; your AIXM data never leaves it. The internet is used only when you ask: online maps and terrain, live traffic (adsb.lol, in a sandboxed frame), and <i>Find aircraft</i> (what you type goes to adsbdb.com; the photo comes from airport-data.com).</li>' +
      '<li><b>Feedback:</b> ✉ in the top bar, on this page and at the bottom of every page — your own e-mail program sends it to the author.</li>' +
      '<li><b>Time:</b> AIXM times are UTC; “Latest data / Valid on date” shows the data valid on any day (BASELINE, PERMDELTA, TEMPDELTA).</li>' +
      '<li><b>Large files:</b> several files of 1 GB can be open together. The <i>Memory</i> gauge in the top bar shows how much of the browser\'s memory is in use; when files would not fit, the Lite memory mode is used automatically and the tool says so. <i>Dashboard → Remove</i> frees the memory of a data set.</li>' +
      '<li><b>Sources:</b> AIXM schemas, code lists and business rules from aixm.aero (EUROCONTROL, FAA); base map Natural Earth; terrain from the Terrain Tiles (Mapzen / AWS Open Data: SRTM, GMTED2010, ETOPO1); libraries Leaflet, three.js, SheetJS, jsPDF, fflate, topojson (full licence texts in THIRD-PARTY-LICENSES.txt); live traffic adsb.lol (ODbL); flight and aircraft data adsbdb.com.</li>' +
      '<li><b>Safe download:</b> each release lists the SHA-256 checksum of its files and has a signed build record (see SECURITY.md).</li></ul></section>';
    h += '<section class="ab-author"><h2>Author</h2><p>Created by <b>' + esc(APP_INFO.author) + '</b> · <a href="mailto:' + esc(APP_INFO.email) + '">' + esc(APP_INFO.email) + '</a> · <a href="' + esc(APP_INFO.linkedin) + '" target="_blank" rel="noopener">LinkedIn</a></p>' +
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
