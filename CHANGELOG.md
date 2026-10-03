# Changelog

AIXM Code Converter · © 2026 Prasad Selvaraj (prasad2t@gmail.com) · Apache-2.0

## Planned — 2.0

- **Digital charts**: aerodrome, instrument approach, SID / STAR, en-route and obstacle charts drawn from the AIXM data,
  exported to PDF / PNG (the *Digital charts* tab shows the plan).

## 1.3.1 — 2026-10-03

- Phones and tablets: the AIP section header (title, changes box, Print / PDF / Excel buttons) now scrolls away with
  the page instead of staying pinned on top, so the AIP content gets the whole screen; scrolling back up shows it.
  Desktop unchanged (the header stays pinned there).

## 1.3.0 — 2026-10-03 — phone and tablet layouts

- **Phone layout** (iPhone, Android phones) and **tablet layout** (iPad, Android tablets), upright and sideways. The
  desktop layout is not changed: a computer gets it at every window size (checked pixel by pixel against 1.2.1).
- The page identifies the device when it opens (`src/device.js`): touch device by browser name or finger pointer
  (also an iPad asking for the desktop site), then phone or tablet by window size; re-checked on rotation.
  **Layout** switch in the footer of phones and tablets; `?layout=phone|tablet|desktop|auto` in the address.
- Phone: page tabs at the bottom (slim rail on the left when sideways), header in one swipeable row, search behind ⌕,
  AIP sections and Explorer types slide in from ☰ and close after a pick, full-screen map, airport card and layers as
  sheets. Tablet: page tabs on the left, larger touch targets; upright the same folding lists and ⌕ search.
- Smooth on small devices: map canvas at most 2× resolution, no pull-to-refresh, scrolling kept inside panels, 16 px
  fields (no iOS zoom), visible-height sizing (browser bars), Lite memory mode from 150 MB (phone) / 400 MB (tablet)
  with a note for very large files; "Tap the map to read the position"; touch wording on the Files page.
- Tests: `devices.js` (12 emulated phones, tablets and computers).

## 1.2.1 — 2026-10-03

- Footer at the end of every page (and of the AIP section panel, the map's layer panel and under the Explorer list):
  © 2026 Prasad Selvaraj, e-mail and LinkedIn profile, version and licence. LinkedIn link also on the About page.

## 1.2.0 — 2026-10-01 — custom data export

- **Custom data export** (Export page): choose one or several loaded files, the **aerodromes** (search; all, aerodromes
  or heliports) and **exactly which data** — any AD 2 / AD 3 section or single items of it (magnetic variation, ARP,
  operational hours, rescue and firefighting, runways, declared distances, lighting …), **airspace by type** (P, R, D,
  TMA, CTR, ATZ, CTA … with counts) and any ENR or GEN section; quick picks for frequent requests; preview.
- Layouts: one table per data item with the aerodromes as rows (and a *Data set* column for several files), or AIP
  pages per aerodrome with only the chosen items.
- Formats: Excel, **CSV** (new: one file per table, zipped), JSON (source of every value), PDF, print, e-mail, and
  **GeoJSON, KML, Shapefile with only the selected features**; option to add all AIXM properties of the features.
- The selection (items and aerodromes by location indicator) is remembered for the next AIRAC cycle.
- Module `extract.js`; test `custom_export.js`.

## 1.1.0 — 2026-10-01 — large files

Several files of 800 MB – 1 GB can be open together without the page slowing down or the browser tab running out of
memory (measured with three files, 1.0 + 0.8 + 0.8 GB: memory 2.76 → 1.31 GB, longest freezes 4.6 s → 1.4 s, Compare 15.7 → 9.0 s).

- **Memory:** repeated values (type names, units, codes, dates, references) are kept once (−25 %); Compare no longer
  keeps a flattened copy of every feature; *Remove* frees all memory of a data set (map, comparison, search results
  and a background save let go of it).
- **Memory guard:** a *Memory* gauge in the top bar; files that would not fit are read in Lite mode with a message;
  Auto uses Lite when all loaded files together exceed 1.5 GB.
- **Map:** airspace, routes, aerodrome surfaces, obstacle areas and the comparison result are drawn on canvas from
  compact coordinate arrays instead of one map object per feature (open 3× faster, zoom / pan and airport view 4×
  less freezing); same look, hover names and pop-ups. The built-in world map is drawn the same way (zooming in the
  first time no longer builds ~660,000 map objects).
- **Compare:** geometry fingerprints are computed from the coordinates directly (half the time, little temporary memory).
- **Responsive page:** the background save into browser storage runs in small steps in idle time (it froze the page
  for up to a second at a time after reading a big file) and is skipped for files over 400 MB; indexing after reading,
  Compare and the search index give control back to the browser regularly; the first search is instant.
- Reopening saved data no longer slows down with the number of features.
- Tools: `make_big.js` (large test files), `bench_big.js` (time, memory and freezes per step); test `large_files.js`.

## 1.0.0 — 2026-10-01 — first public release

Everything below is part of version 1.0 (built in three development stages).

- AIP change highlighting: changed values are white on red also when the previous cycle's file is not loaded (the whole
  amended feature is marked); with the previous file, only the values that really differ.
- *View AIXM code*: the value is highlighted in the time slice shown in the AIP, AIXM 4.5 element names are recognised,
  and values assembled from the data are found by their text; a note explains values that are not one AIXM element.
  Test `xml_reference.js` checks every feature position and every AIP value.
- *Digital charts* tab ("Coming soon", planned for version 2), version shown in the top bar.

### Stage 3 — safety and integrity checks, approach profiles, continuous integration

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
- **Not for operational use** notice (text in `config.js`) on the About page and in Help.

### Stage 2 — map, airport chart, terrain and 3D

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

### Stage 1 — AIXM reading, ICAO AIP, changes, map, exports

- Reads AIXM 4.5, 5.0, 5.1, 5.1.1 and 5.2 (also in .zip), files of several GB (Lite memory mode), in parallel threads.
- ICAO AIP layout: GEN, ENR, AD 2 / AD 3 with every value linked to its exact AIXM code; instrument procedures with legs and minima.
- AIRAC cycles: values changing in a cycle shown white on red, change lists, AIRAC AMDT report, side-by-side view, timeline,
  comparison of two cycles, Digital NOTAM.
- Map: offline world map, OpenStreetMap online, aeronautical layers, procedures, measuring, printable maps.
- Quality: basic checks and the AIXM 5.1 business rules (SBVR) with catalogue.
- State library on the local drive, saved views and links, Arabic / French / Spanish interface.
- Exports: JSON, Excel, PDF, print, e-mail for Outlook; AIXM version conversion, 4.5 → 5.1.1, GeoJSON, KML, Shapefile.
- Navy and white theme; attribution to the author in the app, every export and every source file.
