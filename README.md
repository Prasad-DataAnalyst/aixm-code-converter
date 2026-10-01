# AIXM Code Converter

**Created by Prasad Selvaraj · [prasad2t@gmail.com](mailto:prasad2t@gmail.com)** · © 2026 Prasad Selvaraj · Open source under the
[Apache License 2.0](LICENSE) — redistributions must keep this attribution ([NOTICE](NOTICE)).

**One offline HTML file** that reads AIXM files of any version and shows the aeronautical data the way an
ICAO specimen AIP presents it: GEN, ENR and AD, with a map, effective dates, AIRAC cycle, change detection,
comparison and exports. The user does not need to read AIXM/XML.

➡ **Open [`AIXM-Code-Converter.html`](AIXM-Code-Converter.html) in Chrome or Edge** (double-click the file). There is
nothing to install, no server and no internet requirement. No data leaves the computer.

---

## What the user can do

| Step | What happens |
|---|---|
| **1. Add files** | Drag & drop or browse one or many files (`.xml`, `.aixm`, `.gml` or `.zip` archives), one file per State or many. Each file is checked instantly: **AIXM version** (4.5, 5.0, 5.1, 5.1.1, 5.2 and its pre-releases wip/RC), root element, update or snapshot. |
| **2. Extract** | One button. Files are streamed in 16 MB chunks by **parallel background threads**; the first results appear within about a second. A progress bar shows MB/s, features found, time left and a **Cancel** button. Files of **several GB** are supported (Lite memory mode above 1.5 GB). |
| **3. Dashboard** | For every file: **State**, **AIXM version**, **AIRAC cycle**, **effective date** (and where it comes from), counts, and the **effective date of each aerodrome**. |
| **4. AIP** | ICAO specimen layout: **GEN** (1.1, 2.1, 2.4, 2.5, 3.1, 3.3, 3.4, 3.6), **ENR** (1, 2.1, 2.2, 3.1, 3.2, 3.4, 4.1–4.5, 5.1–5.4, 6), **AD 1.3** and, for every aerodrome, **AD 2.1 – AD 2.24** (heliports: **AD 3.1 – 3.23**): ARP, elevation, operator, operational hours, services, aprons and taxiways, obstacles, runway characteristics, declared distances, lighting, ATS airspace with lateral limits (including arcs and circles), frequencies, navaids, procedures… Each row shows its **effective date** and a Δ badge when the feature has several time slices. |
| **5. See the AIXM code** | Click any value or **`</>`** to open the **exact AIXM fragment**: file, line number, byte offset and length, with the property highlighted. Buttons: **Copy XML**, **Save**, **All data**. This works instantly even in multi-GB files, because only the byte position is stored and the fragment is read back from the file. |
| **6. Valid on date** | The top bar switches between *Latest data* and **data valid on a chosen date**, following AIXM temporality: BASELINE, PERMDELTA, TEMPDELTA, sequence and correction numbers, feature lifetime. |
| **7. Changes** | **What changed, where and when** inside a file: new baselines, permanent and temporary changes, corrections, withdrawals, and AIXM 4.5 Update (New/Changed/Withdrawn). Each shows old → new values and the AIP section. |
| **8. Compare** | Two files of the **same State**, e.g. two AIRAC cycles, even of different AIXM versions. The result lists added, removed and modified items with every changed value, filters by section, and can be drawn on the map in green, red and amber. |
| **9. Map** | A complete **offline world map** is built in (Natural Earth countries 1:50m/1:10m, places, graticule). When online it can switch to **OpenStreetMap** or OSM-based styles (CARTO light/dark, OpenTopoMap) or satellite imagery. It shows airspace by category, ATS routes, runways, aprons and taxiways, navaids with aeronautical symbols, designated points, obstacles (clustered) and ground lights. Clicking a feature gives the AIP section, AIXM code or all its data. Also: measuring tool (distance NM/km, true bearing), coordinate readout (DMS and decimal) with terrain elevation, and PNG snapshots. Labels never overlap; navaids show information boxes (frequency, channel), airspace shows name, class and limits, routes their designators. |
| **9a. Airport chart** | *Airport view*: runways to scale with ICAO markings, designators, bearings and THR elevations, ILS feathers, taxiway signs, aprons, stands, holding positions, hot spots, plus an information card (runways, declared distances, ILS, frequencies, navaids). |
| **9b. Terrain and 3D** | Built-in terrain model (offline) and high-resolution terrain online; grid MORA; **3D view** with airspace volumes between their vertical limits and the airspace column under the mouse; **approach and departure crew views** with altitude, terrain clearance and current airspace. |
| **9c. Second window** | *⧉ New window* puts the map on another screen while the main window shows the data. |
| **10a. Obstacle surfaces** | ICAO Annex 14 obstacle limitation surfaces of every runway; obstacles that penetrate them, with the surface and the height above it; shown in 3D. |
| **10b. Data integrity** | PANS-AIM classification and accuracy check, CRC32Q fingerprint per data item, save and verify CRC lists between deliveries. |
| **10. Quality** | Code values not in the official code lists, coordinates out of range, unresolved references, missing mandatory AIP items, VOR/LOC/GP/NDB frequencies outside their bands, bearings, overlapping or duplicate baselines, unclosed polygons. |
| **11. Explorer** | **Every** AIXM feature type and feature, with nothing hidden: properties with the **official AIXM definitions** and decoded code values (for example `AH` — *Airport with heliport landing area*), all time slices, and references to and from other features. For AIXM 4.5 files, the original 4.5 fields are shown with their 4.5 definitions. |
| **12. Export** | Any single section (buttons on every page) or the whole data set: **JSON** (every value carries its source: feature, UUID, line, byte offset), **Excel** (one sheet per section plus an *AIXM line* column; tables over 1 million rows are split), a **printable PDF** (AIP-style header and footer, AIRAC and source file, map on aerodrome pages), **Print**, and **E-mail**: a formatted message to copy and paste into Outlook, or a `.eml` file that opens as an Outlook draft, or `.html`/`.txt`. No mail program is opened automatically. |

### Review an AIRAC cycle

| Feature | What it does |
|---|---|
| **Red highlighting** | Pick the AIRAC cycle (e.g. **2611 — 29 OCT 2026**) in the red bar above any AIP page. Every value that changes in that cycle is shown **white on red**; hover for old → new. Counts appear in the AIP tree. Changes come from the file's own time slices (a snapshot's BASELINE starting inside the cycle marks the feature as amended or new, so the new cycle's file alone already lists what changes) and, when available, from the comparison with the previous cycle's file (*Compare with previous cycle* opens it from the Library), which shows the exact old and new values. Metadata (ISO 19115) is ignored. |
| **AIRAC AMDT report** | From *List all changes*, the *Timeline* or *Compare*: State, AMDT number, publication date (42 days before), effective date, the AIP sections affected and every insert / amend / delete with previous and new value. Print, PDF, Excel, JSON, e-mail. |
| **Side by side** | *⇆ Side by side* on any section: *before / from AIRAC 2611* of the same file, or against another loaded cycle (or the previous file in the Library). Rows are matched, changed values are red (new) and struck (old); *Only differences*; differences PDF/Excel/e-mail. |
| **Timeline** | Changes per AIRAC cycle, split GEN / ENR / AD, with the Library files per cycle and a bar chart of temporary changes and NOTAM periods. |
| **Digital NOTAM** | AIXM 5.1 `event:Event` shown as ICAO NOTAM / SNOWTAM text with the Q-code decoded (subject, condition, traffic, purpose, scope) and the temporary change of each affected feature (base values taken from the other files of the State). |
| **Instrument procedures** | AD 2.22 lists every SID, STAR and approach with its legs (ARINC 424 type, fixes, course, altitude, speed, distance) and minima. The map draws them per aerodrome (SID blue, STAR green, approach purple, missed approach dashed); AD 2.22/2.24 PDFs include the drawing. |

### More tools

| Feature | What it does |
|---|---|
| **State library** | Connect one parent folder with a sub-folder per State (`Saudi`, `UAE`, `India`…). It is remembered; new files are detected; files dropped on a State card are saved into its folder; extracted data is kept in the browser so switching States is instant. |
| **Convert / GIS** | AIXM 5.1.1 ↔ 5.2, AIXM 4.5 → 5.1.1 (deterministic UUIDs), GeoJSON, KML and ESRI Shapefile (zipped). |
| **Business rules** | *Quality → AIXM business rules*: the 2,031 official AIXM 5.1 rules (SBVR v0.9, aixm.aero); 1,517 are checked automatically (mandatory/conditional data, annotation property names, flight-level coding, navaid composition, reference targets, accuracy limits, forbidden values, uniqueness), all are searchable in the catalogue. Severities follow the EAD profile; a filter separates EAD-specific rules. |
| **Saved views and links** | ☆ saves a named view (file, page, AIP section, cycle, side-by-side, date, map position). The address of every view can be copied and shared: opening it and loading the same file restores the view. |
| **Languages** | English, العربية (right-to-left layout), Français, Español for menus, headings, AIP section titles and common item labels. AIXM values are never translated. |
| **Map print** | Drag an area, choose A4/A3 portrait/landscape; legend of the layers shown, north arrow, coordinate grid and scale; PDF, PNG or print. |
| **Online maps** | OpenStreetMap through CARTO Voyager (works from a local file); if a tile server refuses the page, the map switches automatically. The chosen base map is remembered. |
| **State detection** | STATE authority, ICAO location indicators (aerodromes, FIRs, NOTAM locations, procedure names, reference titles) and, if nothing else, the country under the data; a file with only a weak guess takes the State of a loaded file with the same ICAO prefix. |

Theme: navy blue and white with magenta accents (the colours of ICAO aeronautical charts), in light and dark modes.

## Performance (measured)

Measured in headless Chromium on a 4-core container (3 parser threads):

| File | Size | Features | Memory mode | Read + index | First results | JS heap after loading |
|---|---|---|---|---|---|---|
| Donlon 2025 baseline (5.1.1) | 11 MB | 1,028 | Full | 0.5 s | instant | — |
| Synthetic (93 × Donlon, 5.1.1) | **1.0 GB** | **95,604** | Full | 12.8 s | 2 s | 737 MB |
| Same file | 1.0 GB | 95,604 | Lite | **10 s** | 1 s | **392 MB** |
| Synthetic (5.1.1) | **2.7 GB** | **238,214** | Lite (auto) | **25 s** | 1 s | 933 MB |

Times are with the file already in the operating-system cache; the first read of a file from disk depends on the disk.
**Lite mode** (automatic above 1.5 GB, selectable in *Files*) counts individual light and marking elements instead of
storing them — more than half of the memory of aerodrome mapping data — so files of 2–5 GB fit in the browser. The full
XML of every feature is still shown from the file.

Opening an AIP page takes about 0.25 s. Opening the AIXM fragment of the last feature in the 1 GB file takes about 80 ms.
Machines with more cores run proportionally faster: the parser uses up to 8 threads.

## Supported input

| Version | Detected by | Notes |
|---|---|---|
| AIXM 4.5 (`AIXM-Snapshot`, `AIXM-Update`) and OFMX | root element and `version` attribute | Header `origin/created/effective` used. All ~112 feature types are read; the main ones are mapped to the AIXM 5 model (Ahp → AirportHeliport, Rwy/Rdn/Rdd/Rcp/Rls, Vor/Dme/Ndb/Tcn/Mkr/Ils, Dpn, Ase + Abd borders with arcs and circles, Rte/Rsg, Obs, Uni/Ser/Fqy, Org, Twy, Apn, Tla/Fto, Sid/Sia/Iap, Gbr, addresses Aha/Oaa/Uas/Aga, usage Ahu, Ana/Aho/Rdo/Sah relations, Ful/Oil/Oxg/Ntg, Pfy, Rda/Fda, Swy/Rpa, Tly, Spd, Gsd, Ahc, navaid usage limitations …). |
| AIXM 5.0 / 5.1 / 5.1.1 | `http://www.aixm.aero/schema/5.x` namespace, any prefix | Basic message, WFS / feature collections, Digital NOTAM `event:Event`. |
| AIXM 5.2 (5.2.0, `wip`, RC) | namespace and `schemaLocation` | New 5.2 features (AirportSign, GBAS, Gangway, RVR equipment, SatelliteSystem…). |
| Times | ISO 8601; times without a zone are UTC (as AIXM requires), whatever the laptop's time zone | |
| GML | `EPSG:4326/4269` (lat/lon) and `CRS84` (lon/lat) axis order | Point, LineString, GeodesicString, Geodesic, ArcByCenterPoint, CircleByCenterPoint, Arc (3-point), Polygon, Surface/patches, Ring/curveMember, and `xlink` border-following to GeoBorder curves. |

## Knowledge built into the file

All of this comes from **aixm.aero** and the AIXM GitHub organisation, and is compiled by `tools/build_dictionary.py` into `data/aixm_dictionary.json`:

- Official XML Schemas: **4.5 r2** (Snapshot, Update, Features, DataTypes), **5.1** (with annotations), **5.1.1**, **5.2.0** (annotated).
- 137 AIXM 5 feature types, 145 object types, 285 code lists with **2,668 value definitions**, and the 4.5 types and code lists with about 2,000 definitions. 4.5 code values borrow the matching 5.x definitions.
- AIXM Temporality 1.1 rules, AIXM feature identification and reference (UUID / `xlink:href` / `#gml:id`), and the AIRAC cycle calendar.
- The ICAO Annex 15 / PANS-AIM AIP structure (GEN / ENR / AD 2 / AD 3), and a table of ICAO location-indicator nationality prefixes for State detection.

## Repository layout

```
aixm-code-converter/
├── AIXM-Code-Converter.html   ← the single-file application (built)
├── LICENSE                     Apache License 2.0
├── NOTICE                      attribution that redistributions must keep (author: Prasad Selvaraj, prasad2t@gmail.com)
├── docs/ARCHITECTURE.md        developer guide
├── src/                        ← sources
│   ├── config.js               name, version, author, licence and limits (one place)
│   ├── index.html              HTML shell (placeholders are filled by the build)
│   ├── styles.css              design system (light/dark, print)
│   ├── core.js                 sniffing, fast XML parser, AIXM 4.5/5.x conversion, GML geometry, temporality, AIRAC
│   ├── worker.js               streaming byte-range scanner (runs in parallel Web Workers)
│   ├── model.js                indexes, references, aerodrome ownership, geometry, formatting, State/effective date
│   ├── aip.js                  ICAO AIP section builders (GEN, ENR, AD 2, AD 3)
│   ├── analysis.js             in-file changes, comparison of two data sets, quality checks
│   ├── terrain.js              built-in terrain model, online terrain tiles, grid MORA
│   ├── ols.js                  ICAO Annex 14 obstacle limitation surfaces and penetration check
│   ├── profile.js              instrument approach vertical profile (SVG) for AD 2.22
│   ├── integrity.js            CRC32Q, PANS-AIM data classification, CRC lists
│   ├── adchart.js              airport chart (aerodrome diagram) and airport information card
│   ├── mapview.js              Leaflet map, offline base map, canvas symbols, labels, measure tool, snapshot renderer
│   ├── view3d.js               3D view (three.js): terrain, airspace volumes, approach / departure crew views
│   ├── mapwindow.js            map in a separate browser window
│   ├── about.js                About page
│   ├── exports.js              JSON, Excel, PDF, print, e-mail (.eml / clipboard)
│   ├── library.js              State folders (File System Access API) and the IndexedDB cache
│   ├── convert.js              AIXM version conversion, 4.5 → 5.1.1 writer, GeoJSON / KML / Shapefile
│   ├── review.js               AMDT report, side-by-side diff, Digital NOTAM text and Q-codes, timeline
│   ├── rules.js                AIXM 5.1 business rule (SBVR) checks
│   ├── i18n.js                 interface languages (Arabic RTL, French, Spanish)
│   └── app.js                  user interface and extraction orchestration
├── schemas/                    official AIXM XSDs (4.5, 5.1, 5.1.1, 5.2) and business rules (rules/) from aixm.aero
├── data/                       compiled dictionary and business rules, Natural Earth places, terrain model
├── testdata/                   public sample files (Donlon, Chicago O'Hare, AIXM 4.5, 5.2, temporality cases, Digital NOTAM)
│                               and synthetic test files (Donlon_EADD_changes_AIRAC2611.xml, sample_aixm45_extra.xml)
└── tools/                      build and test scripts
```

## Build and test (developers)

The developer guide [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) explains the modules, the data model and how to extend the
application; [CHANGELOG.md](CHANGELOG.md) lists the releases (current version: 1.2.0, set in `src/config.js`).

```bash
cd aixm-code-converter/tools && npm install          # Leaflet, SheetJS, jsPDF, fflate, world-atlas, playwright-core
cd .. && python3 tools/build_dictionary.py            # schemas/ -> data/aixm_dictionary.json
node tools/build_rules.js                             # schemas/rules/*.xlsx -> data/aixm_rules.json
node tools/build_terrain.js 6                         # Terrain Tiles (internet, once) -> data/terrain.json
node tools/build.js                                   # -> AIXM-Code-Converter.html
node tools/test_parse.js testdata/Donlon_ALL_Baseline_2025.xml 4   # parser: offsets/lines across 4 parallel parts
node tools/test_aip.js testdata/Donlon_ALL_Baseline_2025.xml "^AD 2\.1[23]$"   # AIP sections as text
EVAL='return JSON.stringify((await RULES.run(ds)).summary)' node tools/test_aip.js testdata/Donlon_ALL_Baseline_2025.xml   # any expression
node tools/e2e.js                                     # full UI test in headless Chromium + exports
node --test tools/tests/unit/*.test.js               # unit tests (npm run test:unit)
node tools/tests/run_all.js                           # all feature and layout tests (npm test runs both)
cd tools && npm run lint                              # ESLint over src/
node tools/e2e_big.js /path/to/1gb.xml                # large-file timing and memory (MEM=lite to force Lite mode)
```

Every push runs the same checks on GitHub Actions (`.github/workflows/aixm-code-converter.yml`): lint, unit tests, a check
that the committed `AIXM-Code-Converter.html` matches the sources, and all browser tests.

## Limits worth knowing

- Terrain, grid MORA and the 3D views are indicative: the built-in terrain grid is about 28 km (peaks are smoothed); online
  terrain is finer. The 3D view needs WebGL. Not for navigation.
- The separate map window needs pop-ups allowed for the file.
- Obstacle limitation surfaces: the basic Annex 14 surfaces only (no inner approach, inner transitional, balked landing or
  outer horizontal surface; transitional surfaces along the strip only); runway code number estimated from the length.
- CRC32Q fingerprints are computed by this tool from the formatted values; CRC values published by other systems use their
  own input conventions and are listed, not recomputed.
- A browser cannot send e-mail by itself. The e-mail feature produces a formatted message (clipboard, `.eml` or `.html`) for Outlook.
- Online base maps need internet. Some tile servers (e.g. the standard OSM server) may refuse requests from a local
  `file://` page; the OSM-based CARTO/OpenTopoMap styles are offered as alternatives, and the offline map always works.
- AIXM does not contain charts. ENR 6 and AD 2.24 point to the map and list the procedures that are in the data.
- The EUROCONTROL AIXM Coding Guidelines site is protected against automated access, so its content is not built in. The
  AIP ↔ AIXM mapping here follows the official Donlon data sets and the AIXM ADM/SDO report templates. If you download the
  guidelines (PDF or HTML) and add them to `schemas/`, they can be compiled in the same way as the business rules.
- Business rules: 514 of the 2,031 rules use wording that is not recognised automatically (mostly GML coordinate-system
  and precision rules); they are listed in the catalogue for reference. Rules marked EAD are the EAD profile, not ICAO.
- Interface translations cover the menus, headings, AIP section titles and the most common item labels; the rest of the
  text stays in English.
- For PDF, very large tables (e.g. hundreds of thousands of obstacles) are truncated to 5,000 rows per table with a note.
  Excel and JSON always contain everything.

## Not for operational use

**The AIXM Code Converter is not for operational use.** It is a tool for checking, studying and visualising aeronautical
data. It must not be used for flight planning, navigation, flight operations, aerodrome or instrument procedure design
decisions, obstacle assessment or any other operational or safety-related purpose. Always use the official AIP, AIP
amendments and supplements, NOTAM and the approved aeronautical charts published by the State. Everything the tool shows
or produces (AIP pages, maps, airport charts, 3D views, terrain, grid MORA, approach profiles, obstacle limitation
surfaces, data integrity results, conversions and exports) is derived automatically from the input data, may be
incomplete or inaccurate, and is provided "as is" without warranty of any kind (Apache License 2.0, sections 7 and 8).

The application shows this notice at the first start, keeps a *Not for operational use* marker in the top bar and side
menu, and writes it into every export (PDF footer on every page, Excel *About* sheet, JSON `disclaimer`, print and e-mail,
map images, CRC lists, converted AIXM, GeoJSON, KML and Shapefile). The text is defined once, in `src/config.js`.

## Author and licence

**AIXM Code Converter** was created by **Prasad Selvaraj** — [prasad2t@gmail.com](mailto:prasad2t@gmail.com).

Copyright 2026 Prasad Selvaraj. Licensed under the [Apache License, Version 2.0](LICENSE). Under section 4(d) of the licence, anyone
who redistributes this work or a work derived from it must keep the attribution notices of the [NOTICE](NOTICE) file. The
author's name and e-mail appear in the application (top bar, side menu, Files view, Help → About), in every exported file
(PDF properties and footer, Excel properties and *About* sheet, JSON metadata, e-mail text, map images, converted AIXM,
GeoJSON, KML and Shapefile) and in the header of every source file.

## Third-party credits

AIXM schemas, business rules and sample data © EUROCONTROL & FAA (see the notices in the files). Base map: Natural Earth (public domain).
Terrain: Terrain Tiles (Mapzen / AWS Open Data: SRTM, GMTED2010, ETOPO1 and others).
Libraries embedded in the HTML: Leaflet (BSD-2), three.js (MIT), SheetJS Community Edition (Apache-2.0), jsPDF and jsPDF-AutoTable (MIT),
fflate (MIT), TopoJSON client (ISC), world-atlas (ISC).
