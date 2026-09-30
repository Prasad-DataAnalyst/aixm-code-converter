# AIXM Code Converter

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
| **2. Extract** | One button. Files are streamed in 16 MB chunks by **parallel background threads**; the first results appear within about a second. A progress bar shows MB/s, features found, time left and a **Cancel** button. Files **up to 1 GB and beyond** are supported. |
| **3. Dashboard** | For every file: **State**, **AIXM version**, **AIRAC cycle**, **effective date** (and where it comes from), counts, and the **effective date of each aerodrome**. |
| **4. AIP** | ICAO specimen layout: **GEN** (1.1, 2.1, 2.4, 2.5, 3.1, 3.3, 3.4, 3.6), **ENR** (1, 2.1, 2.2, 3.1, 3.2, 3.4, 4.1–4.5, 5.1–5.4, 6), **AD 1.3** and, for every aerodrome, **AD 2.1 – AD 2.24** (heliports: **AD 3.1 – 3.23**): ARP, elevation, operator, operational hours, services, aprons and taxiways, obstacles, runway characteristics, declared distances, lighting, ATS airspace with lateral limits (including arcs and circles), frequencies, navaids, procedures… Each row shows its **effective date** and a Δ badge when the feature has several time slices. |
| **5. See the AIXM code** | Click any value or **`</>`** to open the **exact AIXM fragment**: file, line number, byte offset and length, with the property highlighted. Buttons: **Copy XML**, **Save**, **All data**. This works instantly even in multi-GB files, because only the byte position is stored and the fragment is read back from the file. |
| **6. Valid on date** | The top bar switches between *Latest data* and **data valid on a chosen date**, following AIXM temporality: BASELINE, PERMDELTA, TEMPDELTA, sequence and correction numbers, feature lifetime. |
| **7. Changes** | **What changed, where and when** inside a file: new baselines, permanent and temporary changes, corrections, withdrawals, and AIXM 4.5 Update (New/Changed/Withdrawn). Each shows old → new values and the AIP section. |
| **8. Compare** | Two files of the **same State**, e.g. two AIRAC cycles, even of different AIXM versions. The result lists added, removed and modified items with every changed value, filters by section, and can be drawn on the map in green, red and amber. |
| **9. Map** | A complete **offline world map** is built in (Natural Earth countries 1:50m/1:10m, places, graticule). When online it can switch to **OpenStreetMap** or OSM-based styles (CARTO light/dark, OpenTopoMap) or satellite imagery. It shows airspace by category, ATS routes, runways, aprons and taxiways, navaids with aeronautical symbols, designated points, obstacles (clustered) and ground lights. Clicking a feature gives the AIP section, AIXM code or all its data. Also: measuring tool (distance NM/km, true bearing), coordinate readout (DMS and decimal), and PNG snapshots. |
| **10. Quality** | Code values not in the official code lists, coordinates out of range, unresolved references, missing mandatory AIP items, VOR/LOC/GP/NDB frequencies outside their bands, bearings, overlapping or duplicate baselines, unclosed polygons. |
| **11. Explorer** | **Every** AIXM feature type and feature, with nothing hidden: properties with the **official AIXM definitions** and decoded code values (for example `AH` — *Airport with heliport landing area*), all time slices, and references to and from other features. For AIXM 4.5 files, the original 4.5 fields are shown with their 4.5 definitions. |
| **12. Export** | Any single section (buttons on every page) or the whole data set: **JSON** (every value carries its source: feature, UUID, line, byte offset), **Excel** (one sheet per section plus an *AIXM line* column; tables over 1 million rows are split), a **printable PDF** (AIP-style header and footer, AIRAC and source file, map on aerodrome pages), **Print**, and **E-mail**: a formatted message to copy and paste into Outlook, or a `.eml` file that opens as an Outlook draft, or `.html`/`.txt`. No mail program is opened automatically. |

Theme: colours inspired by Qatar Airways (burgundy and silver) in light and dark modes. There is **no logo and no airline
name** anywhere.

## Performance (measured)

Measured in headless Chromium on a 4-core container (3 parser threads):

| File | Size | Features | Read + index | First results | Memory after loading |
|---|---|---|---|---|---|
| Donlon 2025 baseline (5.1.1) | 11 MB | 1,028 | 0.5 s | instant | — |
| Synthetic (93 × Donlon, 5.1.1) | **1.0 GB** | **95,604** | **21 s** | **1.1 s** | ~0.7–1.0 GB |

Opening an AIP page takes about 0.25 s. Opening the AIXM fragment of the last feature in the 1 GB file takes about 80 ms.
Machines with more cores run proportionally faster: the parser uses up to 8 threads.

## Supported input

| Version | Detected by | Notes |
|---|---|---|
| AIXM 4.5 (`AIXM-Snapshot`, `AIXM-Update`) and OFMX | root element and `version` attribute | Header `origin/created/effective` used. All ~112 feature types are read; the main ones are mapped to the AIXM 5 model (Ahp → AirportHeliport, Rwy/Rdn/Rdd/Rcp/Rls, Vor/Dme/Ndb/Tcn/Mkr/Ils, Dpn, Ase + Abd borders with arcs and circles, Rte/Rsg, Obs, Uni/Ser/Fqy, Org, Twy, Apn, Tla/Fto, Sid/Sia/Iap, Gbr …). |
| AIXM 5.0 / 5.1 / 5.1.1 | `http://www.aixm.aero/schema/5.x` namespace, any prefix | Basic message, WFS / feature collections, Digital NOTAM `event:Event`. |
| AIXM 5.2 (5.2.0, `wip`, RC) | namespace and `schemaLocation` | New 5.2 features (AirportSign, GBAS, Gangway, RVR equipment, SatelliteSystem…). |
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
├── src/                        ← sources
│   ├── index.html              HTML shell (placeholders are filled by the build)
│   ├── styles.css              design system (light/dark, print)
│   ├── core.js                 sniffing, fast XML parser, AIXM 4.5/5.x conversion, GML geometry, temporality, AIRAC
│   ├── worker.js               streaming byte-range scanner (runs in parallel Web Workers)
│   ├── model.js                indexes, references, aerodrome ownership, geometry, formatting, State/effective date
│   ├── aip.js                  ICAO AIP section builders (GEN, ENR, AD 2, AD 3)
│   ├── analysis.js             in-file changes, comparison of two data sets, quality checks
│   ├── mapview.js              Leaflet map, offline base map, canvas symbols, measure tool, snapshot renderer
│   ├── exports.js              JSON, Excel, PDF, print, e-mail (.eml / clipboard)
│   └── app.js                  user interface and extraction orchestration
├── schemas/                    official AIXM XSDs (4.5, 5.1, 5.1.1, 5.2) from aixm.aero
├── data/                       compiled dictionary, Natural Earth places
├── testdata/                   public sample files (Donlon, Chicago O'Hare, AIXM 4.5, 5.2, temporality cases)
└── tools/                      build and test scripts
```

## Build and test (developers)

```bash
cd aixm-code-converter/tools && npm install          # Leaflet, SheetJS, jsPDF, fflate, world-atlas, playwright-core
cd .. && python3 tools/build_dictionary.py            # schemas/ -> data/aixm_dictionary.json
node tools/build.js                                   # -> AIXM-Code-Converter.html
node tools/test_parse.js testdata/Donlon_ALL_Baseline_2025.xml 4   # parser: offsets/lines across 4 parallel parts
node tools/test_aip.js testdata/Donlon_ALL_Baseline_2025.xml "^AD 2\.1[23]$"   # AIP sections as text
node tools/e2e.js                                     # full UI test in headless Chromium + exports
node tools/e2e_big.js /path/to/1gb.xml                # large-file timing and memory
```

## Limits worth knowing

- A browser cannot send e-mail by itself. The e-mail feature produces a formatted message (clipboard, `.eml` or `.html`) for Outlook.
- Online base maps need internet. Some tile servers (e.g. the standard OSM server) may refuse requests from a local
  `file://` page; the OSM-based CARTO/OpenTopoMap styles are offered as alternatives, and the offline map always works.
- AIXM does not contain charts. ENR 6 and AD 2.24 point to the map and list the procedures that are in the data.
- The EUROCONTROL AIXM Coding Guidelines site is protected against automated access. The AIP ↔ AIXM mapping here follows
  the official Donlon data sets and the AIXM ADM/SDO report templates.
- For PDF, very large tables (e.g. hundreds of thousands of obstacles) are truncated to 5,000 rows per table with a note.
  Excel and JSON always contain everything.

## Credits and licences

AIXM schemas and sample data © EUROCONTROL & FAA (see the notices in the files). Base map: Natural Earth (public domain).
Libraries embedded in the HTML: Leaflet (BSD-2), SheetJS Community Edition (Apache-2.0), jsPDF and jsPDF-AutoTable (MIT),
fflate (MIT), TopoJSON client (ISC), world-atlas (ISC).
