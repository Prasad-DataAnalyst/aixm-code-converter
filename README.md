# AIXM Code Converter

**Created by Prasad Selvaraj · [prasad2t@gmail.com](mailto:prasad2t@gmail.com) · [LinkedIn](https://www.linkedin.com/in/prasadselvaraj/)** · © 2026 Prasad Selvaraj · Open source under the
[Apache License 2.0](LICENSE) — redistributions must keep this attribution ([NOTICE](NOTICE)).

**One offline HTML file** that reads AIXM files of any version and shows the aeronautical data the way an
ICAO specimen AIP presents it: GEN, ENR and AD, with a map, effective dates, AIRAC cycle, change detection,
comparison and exports. The user does not need to read AIXM/XML.

### ⬇ [Download AIXM-Code-Converter.html](https://github.com/Prasad-DataAnalyst/aixm-code-converter/releases/latest/download/AIXM-Code-Converter.html)

➡ **Download the file above, then double-click it to open it in Chrome or Edge.** There is nothing to install, no server
and no internet requirement. No data leaves the computer. (Also as a [ZIP](https://github.com/Prasad-DataAnalyst/aixm-code-converter/releases/latest/download/AIXM-Code-Converter.zip)
with the licence, or from the [releases page](https://github.com/Prasad-DataAnalyst/aixm-code-converter/releases).)
Phones and tablets get their own layout — see [Phones and tablets](#phones-and-tablets).
Website: **https://prasad-dataanalyst.github.io/aixm-code-converter/**

---

## No AIXM file? Try the sample

On the **Files** page, **Try it with sample data** opens the *Donlon* sample (the fictitious State of EUROCONTROL and the FAA: AIP,
obstacles and flight procedures), built into the file: no download, no network request. The same files are in the `samples` folder of
the release ZIP and on the website. **Where to get AIXM files** (also on the Files page) links to the official sources:
[FAA NASR subscription](https://www.faa.gov/air_traffic/flight_info/aeronav/aero_data/NASR_Subscription/) (AIXM 5.1 and 5.0, free),
[FAA Digital Obstacle File](https://www.faa.gov/air_traffic/flight_info/aeronav/digital_products/dof/),
[Donlon 2025 on GitHub](https://github.com/aixm/Donlon_2025),
[EUROCONTROL's Donlon specimen](https://swim-eurocontrol.atlassian.net/wiki/spaces/ACGAIP/pages/212013877/AIP+Data+Set+-+Specimen+DONLON),
[AIXM 5.1 data sets of temporary restrictions](https://ext.eurocontrol.int/aixm_confluence/x/2QFY) and [aixm.aero](https://www.aixm.aero/).
Check the terms of use of each provider.

## What the user can do

| Step | What happens |
|---|---|
| **1. Add files** | Drag & drop or browse one or many files (`.xml`, `.aixm`, `.gml` or `.zip` archives), one file per State or many. Each file is checked instantly: **AIXM version** (4.5, 5.0, 5.1, 5.1.1, 5.2 and its pre-releases wip/RC), root element, update or snapshot. |
| **2. Extract** | One button. Files are streamed in 16 MB chunks by **parallel background threads** (one per processor core; fewer on phones, tablets and when memory is short); the first results appear within about a second. A progress bar shows MB/s, features found, time left and a **Cancel** button. Files of **several GB** are supported (Lite memory mode above 1.5 GB). |
| **3. Dashboard** | For every file: **State**, **AIXM version**, **AIRAC cycle**, **effective date** (and where it comes from), counts, and the **effective date of each aerodrome**. |
| **4. AIP** | ICAO specimen layout: **GEN** (1.1, 2.1, 2.4, 2.5, 3.1, 3.3, 3.4, 3.6), **ENR** (1, 2.1, 2.2, 3.1, 3.2, 3.4, 4.1–4.5, 5.1–5.4, 6), **AD 1.3** and, for every aerodrome, **AD 2.1 – AD 2.24** (heliports: **AD 3.1 – 3.23**): ARP, elevation, operator, operational hours, services, aprons and taxiways, obstacles, runway characteristics, declared distances, lighting, ATS airspace with lateral limits (including arcs and circles), frequencies, navaids, procedures… Each row shows its **effective date** and a Δ badge when the feature has several time slices. |
| **5. See the AIXM code** | Click any value or **`</>`** to open the **exact AIXM fragment**: file, line number, byte offset and length, with the property highlighted. Buttons: **Copy XML**, **Save**, **All data**. This works instantly even in multi-GB files, because only the byte position is stored and the fragment is read back from the file. |
| **6. Valid on date** | The top bar switches between *Latest data* and **data valid on a chosen date**, following AIXM temporality: BASELINE, PERMDELTA, TEMPDELTA, sequence and correction numbers, feature lifetime. |
| **7. Changes** | **What changed, where and when** inside a file: new baselines, permanent and temporary changes, corrections, withdrawals, and AIXM 4.5 Update (New/Changed/Withdrawn). Each shows old → new values and the AIP section. |
| **8. Compare** | Two files of the **same State**, e.g. two AIRAC cycles, even of different AIXM versions. The result lists added, removed and modified items with every changed value, filters by section, and can be drawn on the map in green, red and amber. |
| **9. Map** | **Several data sets on one map**: with more than one loaded (e.g. several neighbouring States), tick any mix of them — or *Show all* — and they are drawn as one map; labels never overlap across them, and search, the airport view, procedures, Save PNG and print use all of them (a search hit or *Show on map* of a data set not shown adds it). *only* shows one again. **Search on the map**: type an airway, waypoint, navaid, aerodrome, runway, taxiway, apron, stand, airspace or obstacle — also as people say it ("twy C", "EADD stand 5", "airway UL123") — and the map zooms there, outlines it in magenta and opens its information. A complete **offline world map** is built in (Natural Earth countries 1:50m/1:10m, places, graticule). When online it can switch to **14 free online maps — no API key needed**: street maps (Esri, OpenStreetMap humanitarian/German), plain light and dark grey backgrounds, terrain (Esri topographic, OpenTopoMap, shaded relief, National Geographic, ocean floor) and satellite (Esri imagery with or without place names, NASA Blue Marble, Earth at night). It shows airspace by category, ATS routes, runways, aprons and taxiways, navaids with aeronautical symbols, designated points, obstacles (clustered) and ground lights. Clicking a feature gives the AIP section, AIXM code or all its data. Also: measuring tool (distance NM/km, true bearing), coordinate readout (DMS and decimal) with terrain elevation, and PNG snapshots. Labels never overlap; navaids show information boxes (frequency, channel), airspace shows name, class and limits, routes their designators. |
| **9a. Airport chart** | *Airport view*: runways to scale with ICAO markings, designators, bearings and THR elevations, ILS feathers, taxiway signs, aprons, stands, holding positions, hot spots, plus an information card (runways, declared distances, ILS, frequencies, navaids). |
| **9b. Terrain and 3D** | Built-in terrain model (offline) and high-resolution terrain online; grid MORA; **3D view** with airspace volumes between their vertical limits and the airspace column under the mouse; **approach and departure crew views** with altitude, terrain clearance and current airspace. |
| **9c. Second window** | *⧉ New window* puts the map on another screen while the main window shows the data. |
| **9a. Digital data** | A tab for the digital data sets besides the AIP: **Obstacles (eTOD)** — every obstacle with its eTOD area (from the obstacle area polygons, the data set's declared area or the file name), the PANS-AIM Table A1-6 accuracy it requires and whether it is met, coverage of the obstacle area, lighting and marking, distance and bearing from the ARP, Annex 14 penetrations, statistics, a complete obstacle report; **Procedures (IFP)** — SID / STAR / approaches by aerodrome with runway, PBN, design criteria, coding, flight check, legs, minima and FAS data block, and a report with every leg; **Aerodrome mapping** — AMXM features by aerodrome and type with every attribute and the meaning of its codes. Each has a map beside its list (filter applied, selection both ways; offline world map or online streets / imagery) and reports in PDF, print, Excel, CSV, GeoJSON and KML. **Obstacle analysis**: obstacles chosen in the list or on the map (Ctrl+click), or those affecting flight paths (within 1 NM of a leg whose altitude clears them by less than 1.5 × an indicative MOC — flagged in the list), studied one by one in a report with map pictures: terrain under and around, base against the terrain, Annex 14 margin, runway position, flight paths within 3 NM and their clearance, marking / lighting, eTOD accuracy. **Exports**: obstacles, procedures and aerodrome mapping in AIXM (as delivered or 5.1 / 5.1.1 / 5.2) with every referenced feature and optional related data (obstacle areas, aerodrome, airspace over it, procedures near the obstacles, obstacles near the procedures, holdings / MSA / TAA, navaids); the terrain of an area as GeoTIFF, ASCII grid or XYZ with metadata. **Procedures in AIXM 5.1 and 5.2** read alike (crossing altitudes, courses, PBN, design standard, FAS data block, minima; RF legs as arcs) with **IFP coding checks** (Annex 11 designators, PANS-OPS path terminators and leg data, EUROCONTROL IFP data set guidelines) — see [docs/IFP_DATA_SET.md](docs/IFP_DATA_SET.md). **Terrain**: GeoTIFF / BigTIFF, DTED, SRTM .hgt and ESRI ASCII grid files read part by part from the disk, with format, spacing and PANS-AIM area, reference systems, voids, statistics and checks; shaded relief with the elevation at a click; terrain along every flight path and around every aerodrome (highest terrain within 5 / 10 / 25 NM, terrain above the Annex 14 surfaces); AIXM elevations compared with the terrain; a terrain report with map pictures. |
| **9b. Aerodrome mapping (AMDB)** | *NOT FOR NAVIGATION — study and analysis only.* Digital data → **Aerodrome mapping (AMDB)** goes **step by step**: choose **👁 View AMDB data** (Load → Look → Check → Fit for use → Compare → Export) or **🛠 Create AMDB data** (Sources → Fill the gaps → Generate → Look → Check → Fit for use → Package); each step says what to do now, ✓ marks what is done, **⚙ All tools** shows every tool as a tab. For AMXM 2.0 files and for the AIXM aerodrome features (runway, taxiway and apron elements, thresholds, stands, guidance lines, holding positions): **AMDB checks** — 36 rules, each citing its source (AMXM 2.0.2 schema, ICAO PANS-AIM Appendix 1, Annex 14, EUROCONTROL supporting material): required attributes, code lists, value ranges, identifiers, runway designators, declared accuracy and integrity, closed and simple polygons in the right direction, spikes, slivers, overlaps and gaps of the pavement (JSTS), thresholds on runways, stands on aprons, guidance lines on the pavement and joined, holding positions, routing network, completeness; findings by rule, on a map and with their feature; audit report (PDF, Excel, CSV, JSON); run in a background worker. **Build package** — custom or full: AMXM 2.0 valid against the AMXM 2.0.2 schema with ISO 19115 metadata inside, AIXM 5.1.1 with an identifier map, GeoPackage, GeoJSON, KML, Shapefile, CSV, Excel, DXF (UTM), ISO 19115 metadata, data product specification, a report of what is inside, how it was made, the sources and every check, guides (QGIS, ArcGIS Aviation, ARINC 816 tools), SHA-256 and CRC32Q of every file; standard (credited) or *for further processing* (no tool name or notice in the data, a handover record). **Sources & quality** records originator, licence, method and quality class of each source. A package dropped on Files is verified; a GeoPackage, GeoJSON, CSV (WKT) or DXF file of mapping features opens as AMXM. **Generate from AIP** — everything the AIP gives (runways, shoulders, stopways, thresholds, centre line points, taxiways, aprons, guidance lines, holding positions, stands, declared lights incl. approach lighting, navaid antennas, obstacles) plus runway markings at the ICAO Annex 14 standard layout, coarse and labelled; shown as an **aerodrome chart** and in **3D** (also at night); a **step-by-step guide**. **📤 Upload** takes everything in one place — the AIP data set, AMXM / GIS / CAD files, OpenStreetMap, **the State's charts** (PDF: their text gives stand and threshold coordinates, dimensions, PCN / PCR, widths, lighting, hot spots; each chart is checked against **ICAO Annex 4** and against the AIP data set; doubtful values from an unclear chart are left out with the reason; as many charts as the State has — several PDFs, a folder or a .zip — or just one; a chart that is a picture is read with **OCR** on request, its tables cell by cell, the OCR engine downloaded once and kept in the browser, not in the file), stand tables, an orthophoto with its world file and supporting documents. **✏️ Trace on imagery** — stands, taxiways, aprons, holding positions, buildings and service roads on imagery whose licence allows it (national orthophotos, USGS, Sentinel-2 2016; Sentinel-2 2025 for non-commercial use; your own orthophoto) — Esri for a visual check only, Google not offered; **the State's charts placed on the map** by the stands, runway designators and coordinates they show, the runways an aerodrome chart draws as bars, or points given by hand (the fit in metres) — to trace on, and for taxiway names and hot spots. **Complete enough to be used**: Generate names what an aerodrome below 94 % lacks and completes it from OpenStreetMap in one click (or by itself when allowed); taxiway lights along the taxiway centre lines; buildings, service roads and taxiway lights in the readiness; Build package shows the content of an aerodrome map (16 items) and warns below 94 %; pavement surfaces valid and without overlaps. **📏 Fit for use** — each feature type against the accuracy and integrity PANS-AIM requires (or your ED-99D numbers), from what it declares or what its source allows, and measured against a reference data set (mean, RMS, 95 %, largest per type and source). Each item comes from the best source there is (AIP, the State's charts, tracing, OpenStreetMap under the ODbL, ICAO Annex 14) and says which. **Compare** two data sets — added, removed, moved, changed, with an AMXM change file. The tools and their engines start only when used — see [docs/AMDB_RESEARCH.md](docs/AMDB_RESEARCH.md). |
| **9c. 4D — the data at a chosen time** | *Off until switched on* (Map → 🕓 4D time); off, the map and every tab are as before. A UTC time bar, fixed at the top of the map or floating (play, steps from 10 s to an AIRAC cycle, a day / week / cycle or any period from … to …, holidays, daylight saving rule). Airspace activation and the availability of routes, aerodromes, navaids, units, services and frequencies from their AIXM timesheets (days, holidays, dates, times, sunrise / sunset, local time, daylight saving, excluded periods, H24 / NOTAM), temporary changes (Digital NOTAM) and validity periods — on the map, in a list with the reason and the next change, and in the 3D view. A procedure flown at a ground speed with its ETO. The date can be applied to every tab. Exports: KML with time spans and a gx:Track, CZML, GeoJSON with intervals, PDF and Excel. |
| **9d. Flight & obstacle analysis** | *NOT FOR NAVIGATION OR AIRCRAFT PERFORMANCE — indicative study figures.* Digital data → **Flight & obstacle analysis**, on every obstacle loaded (AIXM obstacle data sets, Excel / CSV tables, the **FAA Digital Obstacle File**, the obstacles of **NOTAMs**) and the AIP data set: **Take-off** — ICAO Annex 4 Type A take-off flight path area and 1.2 % surface with the shadow rule, the one-engine-inoperative **net flight path** (the gradient each obstacle needs, the clearance of the gradient you set, the limiting obstacle; lateral 90 m + 0.125 D up to ±300 / 600 / 900 m), the **PANS-OPS** 2.5 % surface and procedure design gradient, close-in obstacles; straight out or along a SID; terrain points from a terrain file or online terrain. **Approach** — Annex 14 approach surface, glide path clearance, elevation angle, visual segment surface, threshold displacement. **Runway impact** — every runway direction for departure and arrival, Annex 14 penetrations, TODA / LDA reduction, NOTAM closures and declared distances. **eTOD areas** — ICAO Areas 1, 2a, 2b, 2c, 2d, 3, 4 (Annex 15 / PANS-AIM) with their collection surfaces (3 m, 1.2 %, 100 m, 0.5 m): which obstacles must be in the data set and whether their accuracy meets the area. **Route & airspace** — a flight plan route (aerodromes, points, navaids, coordinates, ATS routes, levels): obstacles and terrain in the corridor, minimum safe altitude per leg, the prohibited / restricted / danger / reserved areas crossed with entry, exit and vertical overlap, active or not at the time (AIXM timesheets, NOTAM activations). **NOTAM & areas** — NOTAM text pasted or as .txt / .pdf (ICAO format and FAA domestic / FDC; Q-codes decoded) and AIP area lists (ENR 5.1) read into obstacles, areas and runway items; *Add to the data loaded* makes them an obstacle table and an AIXM 5.1 airspace file. One **result card**, one picture — **Map** (obstacles as 3D models of their kind, also on the obstacle map: building, tower, mast, crane, wind turbine, tree, chimney, pylon …; NOTAM obstacles with a warning badge), **Profile**, **3D** and **Hologram** (layers on / off, *layers apart*, measuring between two obstacles, wind turbines turning, NOTAM obstacles pulsing), each also in **its own window** — the details when wanted, and one **Report** menu: PDF, print, **copy for e-mail** (result, pictures, tables), e-mail draft (.eml with the pictures), Excel, CSV, KML, GeoJSON, **DXF (3D CAD)**, PNG. |
| **10a. Obstacle surfaces** | ICAO Annex 14 obstacle limitation surfaces of every runway; obstacles that penetrate them, with the surface and the height above it; shown in 3D. |
| **10b. Data integrity** | PANS-AIM classification and accuracy check, CRC32Q fingerprint per data item, save and verify CRC lists between deliveries. |
| **10. Quality** | **Completeness**: per feature type (AIXM 4.5 – 5.2, AMXM, IFP), how many features give each property, mark it unknown, not applicable or leave it out. **Data issues where you read**: the checks run by themselves; the AIP marks every section with an issue (⚠ count in the section list), opens each section with a box of its issues — severity, what is wrong, the feature (click: its AIXM code), and *what was found / what is expected* — and marks the values concerned (dotted underline, the issue on hover; *Mark them in the tables* switches the marks off). The Quality tab lists all of them with the same details, grouped by kind, each linked to its AIP section. Checks: positions at 0°N 0°E (placeholders), aerodrome parts far from their aerodrome, one location indicator for two aerodromes, one designator for points far apart, implausible field elevations and runway lengths, lower limits above upper limits, Code values not in the official code lists, coordinates out of range, unresolved references, missing mandatory AIP items, VOR/LOC/GP/NDB frequencies outside their bands, bearings, overlapping or duplicate baselines, unclosed polygons. |
| **11. Explorer** | **Every** AIXM feature type and feature, with nothing hidden: properties with the **official AIXM definitions** and decoded code values (for example `AH` — *Airport with heliport landing area*), all time slices, and references to and from other features. For AIXM 4.5 files, the original 4.5 fields are shown with their 4.5 definitions. |
| **12. Custom data export** | Choose **aerodromes** (search, all / aerodromes / heliports) and **exactly which data**: any AD 2 / AD 3 section or single items of it (e.g. only the magnetic variation, runway data, declared distances, operational hours, rescue and firefighting category), **airspace by type** (P, R, D, TMA, CTR, ATZ, CTA …), any ENR or GEN section, from one or several loaded files. Quick picks for frequent requests; *Select all* / deselect all beside each group. Layout: one table per data item with the aerodromes as rows, or AIP pages per aerodrome. Formats: **Excel, CSV, JSON, PDF, Print, E-mail, GeoJSON, KML, Shapefile** (GIS files contain only the selected features) and **AIXM**: the selected features with every feature they reference (aerodrome, runways, points, navaids, borders, procedure fixes), so the file stands alone, each feature marked *selected*, *related* or *supporting* — as delivered (4.5, 5.1, 5.1.1, 5.2) or converted to AIXM 5.1, 5.1.1 or 5.2. Optionally with the **related data** of the chosen aerodromes from every data set loaded: all their data, the airspace over them (CTR, ATZ, TMA, FIR …) and nearby (P, R, D …), instrument procedures, obstacles, navaids and routes within a chosen distance. The selection is remembered for the next AIRAC cycle. |
| **13. Export** | **All data sets in one AIXM file**: several States in one complete AIXM file that opens again as one data set per State. Every exported file is **named after what is in it** — State, aerodromes or section, kind of data, AIXM version or format, AIRAC cycle (e.g. `REPUBLIC-OF-DONLON_EADD_AD2.12_AIXM-5.1.1_AIRAC2511.xml`), not after the file it was read from. Any single section (buttons on every page) or the whole data set: **JSON** (every value carries its source: feature, UUID, line, byte offset), **Excel** (one sheet per section plus an *AIXM line* column; tables over 1 million rows are split), a **printable PDF** (AIP-style header and footer, AIRAC and source file, map on aerodrome pages), **Print**, and **E-mail**: a formatted message to copy and paste into Outlook, or a `.eml` file that opens as an Outlook draft, or `.html`/`.txt`. No mail program is opened automatically. |

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
| **Online maps** | 14 free maps from Esri (free for non-commercial use only — Esri terms of use), OpenStreetMap, OpenTopoMap and NASA — none needs an API key, all load from the downloaded file; if a tile server refuses the page, the map switches automatically. The chosen base map is remembered. The offline map asks no server anything; the internet is checked only when an online map is chosen. |
| **Live traffic** | *✈ Live traffic* switches live air traffic on and off **inside the map**: the free [adsb.lol](https://adsb.lol/) live flight map (community ADS-B data under the Open Database Licence, no account) draws its aircraft **over the aeronautical data and the chosen base map** at the same position and zoom and follows panning and zooming; hovering and clicking the AIXM data work as before. *🛈 Aircraft details* opens the live map in a side panel inside the tool, with the AIXM map still in view: click any aircraft for its live details, or **find** one by callsign (BAW495), registration (G-EUYG) or ICAO address — a card in the tool's own style shows the airline, the route with both airports and its distance, the aircraft (type, operator, country, photo), and the live map follows the aircraft. ✕ closes the panel. Flight and aircraft data: free [adsbdb.com](https://www.adsbdb.com/) (no key). Off by default; needs internet only while it is on. |
| **State detection** | STATE authority, ICAO location indicators (aerodromes, FIRs, NOTAM locations, procedure names, reference titles) and, if nothing else, the country under the data; a file with only a weak guess takes the State of a loaded file with the same ICAO prefix. |

Theme: navy blue and white with magenta accents (the colours of ICAO aeronautical charts), in light and dark modes.

## Phones and tablets

The same file has three layouts. A computer always gets the **desktop** layout, at any window size; phones and
tablets get layouts of their own, so the desktop view is never changed by them.

| Layout | Devices | What changes |
|---|---|---|
| **Desktop** | Windows, Mac, Linux computers (also touch-screen laptops) | Nothing — as before |
| **Tablet** | iPad, iPad Pro, iPad mini, Android tablets | Page tabs on the left, larger touch targets. Upright (and below 1200 px wide): header in one row, search behind ⌕, the AIP sections and Explorer types slide in from a ☰ button, the map opens with its layer panel closed. |
| **Phone** | iPhone, Android phones | Page tabs at the bottom (a slim rail on the left when the phone is turned sideways), header in one row that swipes, search behind ⌕, section lists behind ☰, full-screen map with the layer panel and airport card as sheets, wide tables scroll inside their card. |

**How the page knows the device.** When the file opens, a small script (`src/device.js`) decides before anything is
drawn:

1. *Is it a touch device?* Yes when the browser names a phone or tablet (iPhone, iPad, Android…; an iPad asking for
   the desktop site says "Macintosh" but has a touch screen, which is checked too), or when its main pointer is a
   finger (`pointer: coarse` with no hover). A computer with a mouse or trackpad is always *desktop*.
2. *Phone or tablet?* A touch device whose window is narrower than 600 px, or lower than 500 px when turned sideways,
   is a *phone*; otherwise a *tablet*. Turning the device or resizing a split-screen window re-checks it.

The result is written on the page root (`<html data-device="phone|tablet|desktop" data-orient="portrait|landscape">`)
and every phone or tablet style is scoped to it. To choose by hand, use **Layout** in the page footer on a phone or
tablet (remembered), or add `?layout=phone`, `?layout=tablet`, `?layout=desktop` or `?layout=auto` to the address.

**Fast on small devices.** The map is drawn at 2× resolution at most (phones have 3× screens), pull-to-refresh is
switched off so data cannot be lost by a swipe, scrolling stays inside each panel, text fields are 16 px so iOS does
not zoom, and the Lite memory mode starts at 150 MB on phones and 400 MB on tablets (1.5 GB on computers). Files of
hundreds of MB are better read on a computer.

**Opening the file.** Android: download the file, then open it from *Files* / *Downloads* with Chrome. iPhone and
iPad: the Files app only previews an HTML file without running it, so open the tool from a web link in Safari or
Chrome instead (the data still stays on the device).

## Performance (measured)

Measured in Chrome (headless, normal memory limit of about 4 GB per tab) on a 4-core machine, with test files made by
`tools/make_big.js` (copies of the Donlon and a State data set with unique identifiers):

| Three files open together: 1.0 + 0.8 + 0.8 GB (389,163 features) | version 1.0 | **version 1.1** |
|---|---|---|
| Memory after reading | 1.77 GB | **1.18 GB** |
| Memory after using AIP, search, map, airport view, checks | 2.76 GB | **1.31 GB** |
| Longest freeze of the page while reading | 2.5 s | **0.7 s** |
| First search | 1.2 s freeze | **instant** (index built in the background) |
| Open the map (all layers) | 4.6 s freeze | **1.4 s** |
| Zoom / pan the map | 0.7 s freeze | **0.3 s** |
| Airport view | 2.7 s freeze | **0.5 s** |
| Compare 1.0 GB with 0.8 GB (same State) | 15.7 s, 2.1 s freeze | **9.0 s, 0.6 s freeze** |

AIP pages open in 0.1–0.3 s; opening the AIXM fragment of the last feature in a 1 GB file takes about 80 ms. Reading
runs at 70–95 MB/s on 3 threads (the parser uses up to 8). Times are with the file in the operating-system cache.

**Large files.** Loaded data takes about 0.6 × the file size (each repeated value — type names, units, codes, dates,
references — is kept once). The **Memory** gauge in the top bar shows the use against the browser's limit; when the files
to read would not fit, **Lite mode** (light and marking elements counted instead of stored) is used automatically and the
tool says so; Lite is also used when all loaded files together exceed 1.5 GB. *Dashboard → Remove* frees the memory of
a data set. The full XML of every feature is always shown from the file.

## Safe download

Download only from this repository's [releases](https://github.com/Prasad-DataAnalyst/aixm-code-converter/releases).
Every release is built by GitHub Actions from the source here and lists the SHA-256 checksums (`SHA256SUMS.txt`)
and a signed build record of its files — see [SECURITY.md](SECURITY.md) for how to verify a file and how to report a
security problem privately.

## Supported input

| Version | Detected by | Notes |
|---|---|---|
| AIXM 4.5 (`AIXM-Snapshot`, `AIXM-Update`) and OFMX | root element and `version` attribute | Header `origin/created/effective` used. All ~112 feature types are read; the main ones are mapped to the AIXM 5 model (Ahp → AirportHeliport, Rwy/Rdn/Rdd/Rcp/Rls, Vor/Dme/Ndb/Tcn/Mkr/Ils, Dpn, Ase + Abd borders with arcs and circles, Rte/Rsg, Obs, Uni/Ser/Fqy, Org, Twy, Apn, Tla/Fto, Sid/Sia/Iap, Gbr, addresses Aha/Oaa/Uas/Aga, usage Ahu, Ana/Aho/Rdo/Sah relations, Ful/Oil/Oxg/Ntg, Pfy, Rda/Fda, Swy/Rpa, Tly, Spd, Gsd, Ahc, navaid usage limitations …). |
| AIXM 5.0 / 5.1 / 5.1.1 | `http://www.aixm.aero/schema/5.x` namespace, any prefix | Basic message, WFS / feature collections, Digital NOTAM `event:Event`. |
| AIXM 5.2 (5.2.0, `wip`, RC) | namespace and `schemaLocation` | New 5.2 features (AirportSign, GBAS, Gangway, RVR equipment, SatelliteSystem…). |
| **Aerodrome mapping: AMXM 2.0** (EUROCAE ED-99 / RTCA DO-272) | `http://www.amxm.aero/schema/2.x` namespace | All 45 AMXM feature types are read. Runway / taxiway / apron elements, thresholds, stands (area and location), guidance and exit lines, holding positions, hot spots, de-icing and construction areas, vertical structures become the matching AIXM aerodrome features, linked to their aerodrome by `idarpt`; runways, runway directions, taxiways and aprons named by `idrwy` / `idthr` / `idlin` / `idapron` are built from them. Map, airport chart, information card, obstacle surfaces and 3D use them like AIXM data; shoulders, stopways, blast pads, service roads and water are drawn too. AMXM attributes are kept as delivered; the feature details list every attribute of the type (AMXM 2.0.2 schema) with its definition, the meaning of code values, and whether it is given, unknown or not in the file. |
| **Electronic obstacle data set (eTOD) as a table** — Excel (.xlsx, .xlsm, .xls, .ods) or CSV (.csv, .tsv, .txt) | a heading row with latitude / longitude or a WKT geometry, on any sheet, title rows above allowed | Each row becomes an AIXM 5.1 obstacle (vertical structure): identifier, name, type, position (decimal degrees or DMS in one column, or degree / minute / second / hemisphere columns; WKT point, line or polygon), elevation and height with their unit (unit column, heading such as "Elevation (ft)", or the cell), lighting, marking, material, accuracies, datums, radius / length / width, dates. eTOD area, aerodrome, owner and every other column are kept as remarks. Comma, semicolon, tab or bar separators and decimal commas are read. Rows without a position are listed on the Dashboard. ENR 5.4 / AD 2.10, map, 3D and the obstacle limitation surfaces use them like AIXM obstacles. |
| **Instrument flight procedure (IFP) data set** (AIXM 5.1 / 5.1.1) | as AIXM 5; a file named like the AIP data set of the same delivery (`…_IFP_DS_…` beside `…_AIP_DS_…`) is read with it as one data set | SIDs, STARs, approaches with their legs (ARINC 424), transitions, minima and approach profile; terminal holdings and minimum sector altitudes (AD 2.22 and the map: racetracks, MSA sectors with their altitudes); terminal arrival areas (AD 2.22). Procedures find the waypoints, navaids and runways of the AIP data set. |
| **FAA Digital Obstacle File** (DOF.DAT, the State / area files such as `06-CA.Dat`, the change list `CHG.DAT`; also from the DOF zip) | the DOF heading or its fixed-column obstacle lines | Every obstacle as an AIXM 5.1 obstacle with the meaning of each code: verified / unverified, type, quantity, AGL and AMSL heights (ft), lighting (red, strobes, flood, catenary …), marking (paint, flag, spherical), horizontal and vertical accuracy codes (1–9, A–I), FAA study number, action and date; the source view shows the line of the file. A very large file (DOF.DAT, ~650 000 obstacles) keeps the obstacles within 60 NM of the aerodromes loaded, or the first 150 000 (`APP_SETTINGS.dofMaxObstacles`). |
| **FAA NASR AIXM 5.1** (APT, NAV, AWY, AWOS subscriber files) and **SAA AIXM 5.0** messages | as AIXM 5 | `urn:ogc:def:crs:OGC:1.3:CRS83` positions read longitude first; XPath links (`#/faa:SubscriberFile/faa:Member/aixm:Navaid[@gml:id='…']`) resolve to their feature; the default namespaces the SAA files declare on each element are followed, and their FAA `suaType` gives the airspace type (RA → R, PA → P, WA → W, AA → A, MOA). |
| **NOTAM text** and **AIP area lists** | Digital data → Flight & obstacle analysis → NOTAM & areas (paste, .txt or .pdf) | ICAO NOTAM format and FAA domestic / FDC NOTAMs; the prohibited, restricted and danger areas of an AIP (ENR 5.1) with polygons, arcs, circles and limits. |
| Times | ISO 8601; times without a zone are UTC (as AIXM requires), whatever the laptop's time zone | |
| GML | `EPSG:4326/4269` (lat/lon) and `CRS84` / `CRS83` / `CRS27` (lon/lat) axis order | Point, LineString, GeodesicString, Geodesic, ArcByCenterPoint, CircleByCenterPoint, Arc (3-point), Polygon, Surface/patches, Ring/curveMember, and `xlink` border-following to GeoBorder curves. |
| One AIRAC cycle in several files | names that differ only by feature type and variant (`…_Runway_BASELINE_EFF…`, `…_VOR_DIFF_EFF…`), a checksum list delivered with them (file name + SHA-256), or **⧉ Combine** in Files | The files show as one item and are read as **one data set**: references between the files resolve, a time slice delivered twice (baseline and difference files) is kept once, the XML code view opens the file a feature came from, the checksums are verified, schema and code-list XML in a zip are left out, **Separate** reads them one by one. Version conversion gives one zip with every file converted. |
| Several States in one AIXM file | *Export → All data sets in one AIXM file* | The data sets loaded (a State each; AIXM 4.5, 5.1, 5.1.1, 5.2, aerodrome mapping, obstacle tables) written as **one complete AIXM 5 file** in the version chosen: each AIXM 5 feature with its original XML and every time slice as delivered (or only what is valid at the moment shown), AIXM 4.5, AMXM and tables written as AIXM 5. A list in the header and a comment before each part give its State, data set, byte and line. **Opened again, each State is its own data set**; other AIXM software reads it as one message. Prefixes bound to other namespaces are renamed and `gml:id` values of later parts get the part number, so the one file stays valid XML. |
| Commented-out data | a feature inside an XML comment `<!-- … -->` | Not read: the publisher has taken it out of the data. |
| One AIXM file for the cycle | *Export → One AIXM file for this cycle* | Writes the data set (one file, or every file of a delivery) as one AIXM file of what is valid from the cycle: the original XML of each feature, ended time slices and withdrawn features left out, a time slice delivered twice kept once; a report lists what was left out and the cycle's changes. |
| Equipment without coordinates | a VOR, DME, NDB, ILS part or marker published without a position | Shown at the position of its navaid, marked *(navaid position)* in AD 2.19. |
| Deliveries in the Library | a State folder holding one cycle in several files (also in sub-folders such as `Baseline/` and `Difference/`) | One library entry ("⧉ 30 files · one data set") that opens as one data set; the delivery's checksum list and schema XML are not listed. |
| Withdrawn features | the feature's lifetime ends, or its last time slice ends with nothing after it, before the date shown | Not shown in the AIP, map, search or counts; listed as *withdrawn* in the changes of their cycle. |
| AIRAC cycle at local midnight | effective times up to 14 h before an AIRAC date (e.g. 16:00Z = 00:00 at UTC+8) | Belong to that cycle; the effective date shows the AIRAC date, the exact UTC time is in the details. A new time slice with exactly the same values counts as a re-issue, not a change. |
| Identifiers | `urn:uuid:` with any identifier, also not hexadecimal (`…bac9ndb`) | Matched like the feature's `gml:identifier`. |

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
│   ├── device.js               phone / tablet / desktop detection (runs first; layouts scoped to it)
│   ├── feedback.js             feedback form to the author (e-mail file / share sheet, attachments)
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
│   ├── obstab.js               eTOD obstacle data sets in Excel / CSV tables, the FAA Digital Obstacle File
│   ├── ddview.js               Digital data tab: procedures (IFP), aerodrome mapping, sections
│   ├── obstview.js             obstacle workspace: areas, PANS-AIM checks, statistics, reports
│   ├── obsicon.js              obstacle kinds and their 3D models (SVG, canvas), shared by the obstacle maps
│   ├── ddmap.js                the map of the Digital data tab
│   ├── demfile.js              terrain file readers: GeoTIFF / BigTIFF, DTED, SRTM .hgt, ESRI ASCII grid
│   ├── dem.js                  terrain files loaded: block cache, elevation, profile, grid, statistics
│   ├── study.js                flight paths over terrain and obstacles, obstacle analysis, map pictures
│   ├── ifp.js                  instrument flight procedures in AIXM 5.1 / 5.2, IFP coding checks
│   ├── ddexport.js             Digital data exports: AIXM panels with related data, terrain of an area (GeoTIFF / ASCII / XYZ)
│   ├── terview.js              Terrain section of the Digital data tab
│   ├── lazy.js                 parts stored unopened in the page, started when a tool needs them
│   ├── amdb.js                 aerodrome mapping (AMDB) rules and checks (worker, JSTS) — loaded when used
│   ├── amdbui.js               AMDB checks tab: findings, map, audit report — loaded when used
│   ├── amdbpkg.js              aerodrome mapping package, sources & quality, package verification, GeoPackage — loaded when used
│   ├── amdbx.js                aerodrome mapping from AIP data, GeoJSON / CSV / DXF import, compare — loaded when used
│   ├── amdbosm.js              OpenStreetMap for aerodrome mapping (Overpass, files, conversion, routing network) — loaded when used
│   ├── amdbdoc.js              the State's charts and documents (PDF text, facts, ICAO Annex 4 check, cross-checks) — loaded when used
│   ├── amdbtrace.js            trace aerodrome mapping on imagery (licence-aware imagery, own orthophoto) — loaded when used
│   ├── amdbocr.js              OCR of State charts that are pictures (tables found by their ruled lines, read cell by cell; Tesseract downloaded when asked, SHA-256 checked) — loaded when used
│   ├── amdbgeo.js              the State's charts placed on the map (their words, runways drawn as bars, points by hand; robust fit), taxiway names and hot spots from them — loaded when used
│   ├── amdbq.js                fit for use (PANS-AIM accuracy and integrity by source) and accuracy measured against a reference data set — loaded when used
│   ├── fourd.js                4D: timesheets, the data at a chosen time, procedure in time, time exports — loaded when switched on
│   ├── notamtxt.js             NOTAM text (ICAO, FAA) and AIP area lists read into obstacles and areas — loaded when used
│   ├── fltcalc.js              flight & obstacle assessment calculations (take-off, approach, runway, eTOD areas, route) — loaded when used
│   ├── fltscene.js             map / 3D / hologram / profile pictures of an assessment, also in their own window — loaded when used
│   ├── fltview.js              Digital data → Flight & obstacle analysis (result card, views, details, reports) — loaded when used
│   ├── convert.js              AIXM version conversion, 4.5 → 5.1.1 writer, GeoJSON / KML / Shapefile
│   ├── review.js               AMDT report, side-by-side diff, Digital NOTAM text and Q-codes, timeline
│   ├── rules.js                AIXM 5.1 business rule (SBVR) checks
│   ├── i18n.js                 interface languages (Arabic RTL, French, Spanish)
│   └── app.js                  user interface and extraction orchestration
├── schemas/                    official AIXM XSDs (4.5, 5.1, 5.1.1, 5.2), business rules (rules/) from aixm.aero, AMXM 2.0.2 XSD (amxm/)
├── data/                       compiled dictionary and business rules, Natural Earth places, terrain model
├── site/                       the website (download page), published by .github/workflows/pages.yml
├── testdata/                   public sample files (Donlon, Chicago O'Hare, AIXM 4.5, 5.2, IFP 5.1 / 5.2, temporality cases, Digital NOTAM)
│                               and fictitious test files (AMXM aerodrome EAXM, IFP procedures for EADD, AMDB defects EAXB)
│                               and synthetic test files (Donlon_EADD_changes_AIRAC2611.xml, sample_aixm45_extra.xml)
└── tools/                      build and test scripts
```

## Build and test (developers)

The developer guide [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) explains the modules, the data model and how to extend the
application; [CHANGELOG.md](CHANGELOG.md) lists the releases (current version: 1.29.0, set in `src/config.js`; digital charts are planned).

```bash
cd tools && npm install          # Leaflet, SheetJS, jsPDF, fflate, world-atlas, playwright-core
cd .. && python3 tools/build_dictionary.py            # schemas/ -> data/aixm_dictionary.json
node tools/build_rules.js                             # schemas/rules/*.xlsx -> data/aixm_rules.json
node tools/build_terrain.js 6                         # Terrain Tiles (internet, once) -> data/terrain.json
node tools/build.js                                   # -> AIXM-Code-Converter.html
node tools/test_parse.js testdata/Donlon_ALL_Baseline_2025.xml 4   # parser: offsets/lines across 4 parallel parts
node tools/test_aip.js testdata/Donlon_ALL_Baseline_2025.xml "^AD 2\.1[23]$"   # AIP sections as text
EVAL='return JSON.stringify((await RULES.run(ds)).summary)' node tools/test_aip.js testdata/Donlon_ALL_Baseline_2025.xml   # any expression
node tools/e2e.js                                     # full UI test in headless Chromium + exports
node --test tools/tests/unit/*.test.js               # unit tests (npm run test:unit)
node tools/tests/run_all.js                           # all feature, layout, accessibility (axe-core) and safety tests (npm test runs both)
node tools/check_maps.js                              # needs internet: loads every online base map, screenshots
cd tools && npm run lint                              # ESLint 10 over src/ and tools/ (tools/eslint.config.js)
node tools/make_big.js testdata/Donlon_ALL_Baseline_2025.xml 1000 /tmp/big.xml   # 1 GB test file (unique UUIDs per copy)
node tools/bench_big.js /tmp/big.xml [/tmp/big2.xml …]   # time, memory and longest freeze of every step
node tools/e2e_big.js /path/to/1gb.xml                # large-file timing and memory (MEM=lite to force Lite mode)
```

Every push runs the same checks on GitHub Actions (`.github/workflows/ci.yml`): lint, unit tests, a check
that the committed `AIXM-Code-Converter.html` matches the sources, and all browser tests.

## Limits worth knowing

- Terrain, grid MORA and the 3D views are indicative: the built-in terrain grid is about 28 km (peaks are smoothed); online
  terrain is finer. The 3D view needs WebGL. Not for navigation.
- The separate map window needs pop-ups allowed for the file.
- A zip file is unpacked in memory; zips whose XML contents exceed 4 GB are refused (unpack them and open the XML files
  directly — those are streamed and have no such limit).
- Live traffic shows the adsb.lol map page inside the map, because the free live-traffic services do not let a page
  opened from a file read their data. So aircraft are not clicked on the AIXM map itself, the base
  map is replaced by adsb.lol's own map while it is on, aircraft are clicked in the *Aircraft details* window, a zoom reloads the live view (a second or two), and saved or
  printed map images do not include the aircraft.
- Obstacle limitation surfaces: the basic Annex 14 surfaces only (no inner approach, inner transitional, balked landing or
  outer horizontal surface; transitional surfaces along the strip only); runway code number estimated from the length.
- Flight & obstacle analysis: indicative. The gradients available are those you set (the aircraft flight manual and the
  operator's performance data give the real ones: weight, temperature, wind, turns and the acceleration segment are not
  modelled); the built-in terrain model is too coarse to be assessed as obstacles (a terrain file or online terrain is
  used for that); NOTAM text is read as written and what is not understood is shown, not guessed; route altitudes are
  compared with airspace limits without QNH / flight-level conversion. Not for navigation.
- CRC32Q fingerprints are computed by this tool from the formatted values; CRC values published by other systems use their
  own input conventions and are listed, not recomputed.
- A browser cannot send e-mail by itself. The e-mail feature produces a formatted message (clipboard, `.eml` or `.html`) for Outlook.
- Online base maps need internet. All 15 offered maps are free and keyless (CARTO and Thunderforest, which now ask for
  an API key, are not used); if a server refuses the page the map switches to the Esri street map, and the offline map
  always works. Free map services can change their terms; the list is checked by the tests.
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

## Author and licence

**Feedback:** use **✉ Feedback** in the top bar (also on the About page and at the bottom of every page) — name, e-mail, organisation,
position, subject, description and attachments go to the author through your own e-mail program (your default e-mail app opens
addressed to the author, subject "AIXM Code Converter — …"; with attachments, an e-mail file that Outlook opens ready to
send, or the share sheet on a phone). Or write to prasad2t@gmail.com.

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
fflate (MIT), TopoJSON client (ISC), world-atlas (ISC), and — stored unopened, started only by the aerodrome mapping tools — JSTS (EDL-1.0), sql.js (MIT) and PDF.js (Apache-2.0). The full licence texts are in
[THIRD-PARTY-LICENSES.txt](THIRD-PARTY-LICENSES.txt), which is also included in every release zip.
