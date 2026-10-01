# Changelog

AIXM Code Converter · © 2026 Prasad Selvaraj (prasad2t@gmail.com) · Apache-2.0

## 1.2.0 — 2026-10-01

Safety and integrity checks, approach profiles, continuous integration.

- **Obstacle limitation surfaces** (new `ols.js`): ICAO Annex 14 approach (Table 4-1), take-off climb (Table 4-2), transitional,
  inner horizontal and conical surfaces per runway from the data (code number from the length, precision / non-precision /
  non-instrument from the ILS and approaches); obstacles of all loaded files checked; *Quality → Obstacle surfaces* with
  PDF / Excel / e-mail, the result on the airport card, and the surfaces with the penetrating obstacles in the 3D view.
- **Data integrity** (new `integrity.js`): CRC32Q (CRC-32/AIXM, check value 3010BF7F); PANS-AIM classification and required
  accuracy against the declared accuracy; a fingerprint per data item; *Save CRC list* and *Verify against a CRC list*
  (changed / missing / new); CRC values published in the file listed.
- **Approach profile** (new `profile.js`): vertical profile of every instrument approach in AD 2.22 (fixes and roles,
  distances, altitude constraints with chart bars, glide slope / vertical angle and TCH, minima, missed approach, terrain),
  rate-of-descent and FAF–MAPt timing table, profile table in the exports.
- **Continuous integration**: GitHub Actions workflow (lint, unit tests, build check, all browser tests); unit tests with
  `node --test` (`tools/tests/unit/`); shared Node harness `tools/harness.js`.
- Test: `ols_integrity_profile.js`.
- **Not for operational use** notice (one text in `config.js`): first-start notice to acknowledge, top-bar chip and side-menu
  marker, Help, About, start page, airport card, Quality tabs, and every export and generated file (PDF footer on every
  page, Excel, JSON, print, e-mail, map images, approach profiles, 3D view, CRC lists, converted AIXM, GeoJSON, KML,
  Shapefile); README and NOTICE.

## 1.1.0 — 2026-10-01

Map, airport chart, terrain and 3D.

- **Airport chart** (new `adchart.js`): runways to scale with threshold, piano-key, aiming-point, touchdown-zone, centreline and
  displaced-threshold markings, painted designators, magnetic bearings and THR elevations at the ends, dimensions / surface /
  PCN along each runway, ILS feathers with ident, frequency, GP angle and DME channel, taxiway location signs, apron names,
  stand numbers, holding positions, hot spots, ARP; chart colours for runways, taxiways, aprons and guidance lines.
- **Airport view**: choose an aerodrome (or *✈ Airport view* in any pop-up): zooms to the diagram and opens an information
  card (ARP, elevation, MAG VAR, TA/TL, runways with bearings, dimensions, strength, THR elevation, TORA/TODA/ASDA/LDA, ILS,
  communications, navaids, movement area) with AIP, procedures, print, 3D approach and 3D departure buttons.
- **Map labels**: one shared collision registry for all layers (labels never overlap, four candidate positions), navaid
  information boxes (frequencies, channel, type, name), aerodrome name and elevation, airspace labels (name, class, upper over
  lower limit), route designator boxes, obstacle labels as top elevation (height); chart-style obstacles and buildings.
- **Terrain model** (new `terrain.js`, `data/terrain.json`, `tools/build_terrain.js`): built-in global elevation grid (0.25° mean,
  1° maximum) from the public Terrain Tiles; online high-resolution terrain; grid MORA layer; online terrain shading; terrain
  elevation in the status bar.
- **3D view** (new `view3d.js`, three.js): terrain with airspace volumes between their vertical limits, runways with lights,
  aerodromes, obstacles, procedures at their published altitudes; airspace column under the mouse; approach and departure
  crew views with slider and fly-through, altitude, height above runway, terrain clearance and current airspace.
- **Map in a separate window** (new `mapwindow.js`): *⧉ New window* moves the map to a second window or screen; "show on map"
  in the main window goes there; AIP / XML links come back; theme and data stay in step; *⇲ Back to main window*.
- **About page** (new `about.js`): what the tool is, who it helps, everything that is available, 3D and terrain in detail, how to
  start; link from the start page and the side menu.
- PNG / PDF map output draws the airport chart and avoids overlapping labels.
- Tests: `airport_chart.js`, `map_window.js`, `view3d.js`.

## 1.0.0 — 2026-10-01

First public release.

- Reads AIXM 4.5, 5.0, 5.1, 5.1.1 and 5.2 (also in .zip), files of several GB (Lite memory mode), in parallel threads.
- ICAO AIP layout: GEN, ENR, AD 2 / AD 3 with every value linked to its exact AIXM code; instrument procedures with legs and minima.
- AIRAC cycles: values changing in a cycle shown white on red, change lists, AIRAC AMDT report, side-by-side view, timeline,
  comparison of two cycles, Digital NOTAM.
- Map: offline world map, OpenStreetMap online, aeronautical layers, procedures, measuring, printable maps.
- Quality: basic checks and the AIXM 5.1 business rules (SBVR) with catalogue.
- State library on the local drive, saved views and links, Arabic / French / Spanish interface.
- Exports: JSON, Excel, PDF, print, e-mail for Outlook; AIXM version conversion, 4.5 → 5.1.1, GeoJSON, KML, Shapefile.
- Navy and white theme; attribution to the author in the app, every export and every source file.
