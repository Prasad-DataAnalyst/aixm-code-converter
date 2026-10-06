# Changelog

AIXM Code Converter · © 2026 Prasad Selvaraj (prasad2t@gmail.com) · Apache-2.0

## Planned — 2.0

- **Digital charts**: aerodrome, instrument approach, SID / STAR, en-route and obstacle charts drawn from the AIXM data,
  exported to PDF / PNG (the *Digital charts* tab shows the plan).

## 1.17.0 — 2026-10-06 — Aerodrome mapping (AMXM) and IFP data sets

- **Aerodrome mapping data sets in AMXM 2.0** (EUROCAE ED-99 / RTCA DO-272, the aerodrome mapping exchange model) are
  recognised and read. Runway, taxiway and apron elements, thresholds with declared distances, stands (area and
  location, one stand), taxiway, stand and runway exit guidance lines, holding positions, hot spots, de-icing and
  construction areas and vertical structures become the matching AIXM aerodrome features, linked to their aerodrome
  by its ICAO code (idarpt); the runways, runway directions, taxiways and aprons AMXM names only by code are built
  from them. The map, the airport chart with runway markings and labels, the information card, the Annex 14
  obstacle surfaces and the 3D views use them like AIXM data; shoulders, stopways, blast pads, service roads and
  water are drawn as well. Every AMXM attribute is kept as delivered (Explorer, AIXM code).
- **Instrument flight procedure (IFP) data sets**: an IFP file delivered beside the AIP data set of the same
  delivery (e.g. `EA_IFP_DS_FULL_…` and `EA_AIP_DS_FULL_…`) is read with it as one data set, so its procedures find
  their waypoints, navaids and runways.
- **Terminal holdings, minimum sector altitudes, terminal arrival areas**: AD 2.22 lists the minimum sector
  altitudes (sector, distance, altitude) and terminal arrival areas of the aerodrome; terminal holdings, MSAs and
  TAAs are linked to the aerodrome whose procedures use them. With the procedures on the map, holdings are drawn as
  racetracks (inbound course, turn side, leg time or distance) and MSAs as sectors with their altitudes.
- Test data: a fictitious AMXM aerodrome and fictitious IFP procedures for the Donlon sample aerodrome.

## 1.16.0 — 2026-10-06 — Airport view without runway positions

- **Airport view for every aerodrome with a position**: the map's *Airport view* list, a map search hit and *Show on
  map* now open the airport information card for every aerodrome with a reference point, also when the data set
  gives no runway positions. Its runways are listed from the runway data — dimensions, surface and strength, true
  bearing, threshold elevation, TORA / TODA / ASDA / LDA — with communications and radio navigation aids. A note
  says what the data set does not give for the aerodrome (runway threshold positions, so the runways are not
  drawn; taxiways, aprons and stands), so that nothing missing on the map looks like a fault of the tool.
- **New check**: thresholds and displaced thresholds without coordinates (e.g. an empty gml:pos with only the
  elevation) are flagged in the Quality tab and in AD 2.12.

## 1.15.0 — 2026-10-06 — Data issues flagged in the AIP and the Quality tab

- **Data issues where you read**: the data quality checks run by themselves when the AIP or the Quality tab is
  opened. The AIP section list shows a ⚠ count on every section with issues (red when one is an error); each
  section opens with a box of its issues — severity, what is wrong, the feature (click: its AIXM code at that
  value) and **what was found / what is expected**; the values concerned are underlined (red or amber dots, ⚠) and
  give the issue on hover. *Mark them in the tables* switches the marks off.
- **Quality tab**: every issue now says what was found and what is expected; issues are grouped by kind (click a
  kind to list only those); the feature column gives type, property and line; the AIP section opens that section.
  The PDF / Excel / e-mail report includes the details.
- **New checks**: positions at 0°N 0°E (placeholders for missing coordinates); runways, thresholds, ILS and other
  aerodrome parts far from their aerodrome; one location indicator for two aerodromes; one designated point
  designator for points far apart; implausible field elevations (below −1,400 ft or above 15,000 ft) and runway
  lengths (below 50 m or above 6,000 m, helicopter FATOs excepted); lower limits above upper limits (airspace
  volumes, route segments). Issues are checked again when the date the AIP shows changes.

## 1.14.0 — 2026-10-06 — Several data sets on one map

- **Several data sets on one map**: with more than one data set loaded, the map panel lists them (*Data sets on the
  map*) with a tick box each. Any mix of them — or *Show all* — is drawn as one map, e.g. Qatar, Saudi Arabia, the
  UAE and China together; *only* shows one again. Labels never overlap across data sets; layer counts, the airport
  view list and the procedure list cover all those shown; a map search, *Show on map* or an airport view of a data
  set not shown adds it to the map; Save PNG and Print draw all of them; the 3D view uses the data set with the
  aerodrome, or the one under the map centre. The choice is kept when leaving the map and coming back, and the
  map window (⧉ New window) opens with the same data sets.

## 1.13.0 — 2026-10-06 — Faster map; live traffic over the aeronautical data

- **Faster map**: on dark and satellite base maps the white outline around the aeronautical data was a CSS filter
  that the browser re-applied on every frame (about 0.5 s per frame while dragging). The outline is now drawn into
  the picture once per redraw: dragging is as smooth as on the light maps (about 30× faster per frame). Layers with
  nothing in view are no longer composed, and the built-in terrain grid is unpacked while the browser is idle
  instead of on the first mouse move over the map.
- **Live traffic over the aeronautical data**: the aircraft are drawn above airspace, routes and navaids, and the
  chosen base map stays (it was hidden before). The adsb.lol map is painted plain white (black on night maps) and
  blended in, so only its aircraft show; hovering and clicking the AIXM data, panning and zooming work as before.
  The base map can be changed while live traffic is on.
- **Aircraft details in a side panel**: the AIXM map stays in view on the left.
- **Base maps**: the standard OpenStreetMap server now answers a page opened from a file with an "Access blocked"
  picture, so it is no longer offered (a saved choice opens OpenStreetMap German style); 14 free maps remain.
  National Geographic style stops at the last zoom its server has pictures for, instead of "Map data not yet
  available" tiles.

## 1.12.1 — 2026-10-05 — About page brought up to date

- **About this tool**: new *What's new* section (1.2 – 1.12); feature cards for deliveries of many files, search on the
  map, live air traffic and aircraft details, one AIXM file for the cycle, phones and tablets, accessibility; updated
  map, changes, exports and library cards; *Good to know* now says exactly when the internet is used, how to send
  feedback, where the licence texts are and how to check a download. The ? box lists the live-traffic and flight-data
  sources.

## 1.12.0 — 2026-10-05 — one AIXM file per cycle, deliveries in the Library, equipment positions

- **One AIXM file for this cycle** (Export): writes the data set — one file, or all the files of a delivery
  (baseline and difference files) — as one AIXM 5 file of what is valid from the cycle. The original XML of every
  feature is kept; ended time slices and withdrawn features are left out; a time slice delivered twice is kept once;
  the namespaces of all files are on one root element. A report lists the features and time slices written, what was
  left out (withdrawn features by name) and the cycle's changes. Checked: the file read back gives the same current
  features and references; schema validation finds no error the source files did not already have.
- **Deliveries in the Library:** a State folder holding one cycle in several files (also in sub-folders such as
  `Baseline/` and `Difference/`) shows one entry — "⧉ 30 files · one data set" — that opens, compares and is saved
  as one data set. The delivery's checksum list and schema XML are no longer listed; the entry shows the AIRAC date
  for cycles that start at local midnight.
- **Equipment without coordinates** (VOR, DME, NDB, ILS parts, markers published without a position) is shown at the
  position of its navaid — in AD 2.19 marked *(navaid position)*, and on the map.
- Fixed: the saved copy of a delivery read from several files did not keep which file each feature came from, so
  after reopening, the XML code view could show the wrong file; deliveries saved by 1.9–1.11 are read again once.
- Tests: `multi_file.js` writes and re-reads the one-file export, opens a delivery from a Library State folder, and
  checks equipment positions taken from the navaid.

## 1.11.0 — 2026-10-05 — aircraft details in the tool's own style

- **Find an aircraft** in the *Aircraft details* window: type a callsign (BAW495), registration (G-EUYG) or ICAO
  address (40624E). A card in the tool's own style (navy, white, magenta; light and dark) shows:
  - the flight: airline and its radio callsign, IATA / ICAO flight number, route from airport to airport (codes,
    names, cities, countries) and the great-circle distance in NM and km;
  - the aircraft: photo, registration, manufacturer and type, ICAO type code, owner / operator, country, ICAO address.
- With a registration or ICAO address, the live map finds and **follows** the aircraft, with its live altitude,
  speed, track and flight path beside the card.
- Data: the free adsbdb.com service (no key) — the only free sources a page opened from a file may read; the live
  values stay on the live map, because the live-traffic services do not allow that.
- Phones: the card sits above the live map. Test: `safety.js` finds a flight and an aircraft (stand-in data).

## 1.10.0 — 2026-10-05 — aircraft details inside the tool

- **🛈 Aircraft details** (in the live-traffic note on the map) opens the live map in a window over the map, inside
  the tool — no new tab, no other application. Click any aircraft for its details: callsign, registration and
  country, operator, type, route, squawk, ground speed, altitude and vertical rate, track, position, and its flight
  path on the map. ✕ returns to the AIXM map, which stays exactly where it was. Works on computers, tablets and phones.
- Why a window and not a card drawn by the tool: the free live-traffic services do not let a page opened from a file
  read their data, and the browser does not tell the tool which aircraft was clicked inside the live map.
- Test: `safety.js` opens and closes the aircraft details window (address, sandbox, no new tab).

## 1.9.1 — 2026-10-05 — a delivery added in several goes stays one data set

- Files of one delivery added at different times (e.g. the baseline files first and read, the difference files
  later) are read again together as **one** data set that replaces the earlier one — the map, the data set list and
  the dashboard show the delivery once. (Added in one go — files or zip — they were already one data set.)
- Test: `multi_file.js` adds a delivery in two goes and checks for one data set and one map entry.

## 1.9.0 — 2026-10-05 — one AIRAC cycle delivered in several files

- **Several files, one data set.** Some States deliver one AIRAC cycle as many files (one per feature type, baseline
  and difference files, a checksum list, the schemas) — often in one zip. Dropped together, these files now show as
  **one item** ("30 files → one data set") and are read as **one data set**, so every reference between the files
  resolves (runways to their aerodrome, navaids to their equipment, route segments to their points…). Detected from
  a checksum list delivered with the files or from names that differ only by feature type and variant; **⧉ Combine**
  joins any other files, **Separate** reads them one by one. The checksums (SHA-256) are verified and shown; schema,
  code-list and metadata XML in a zip are left out with a note. A time slice delivered twice (in a baseline and a
  difference file) is kept once; the XML code view shows the file and line a feature came from; the saved copy is
  reused when the same files are opened again; *Convert AIXM version* converts every file into one zip.
- **Withdrawn features** — the feature's lifetime ends, or its last time slice ends with nothing after it — are no
  longer shown in the AIP, map, search and counts as if current; the change list reports them as withdrawn.
- **AIRAC cycle at local midnight:** effective times written as the evening before in UTC (e.g. 16:00Z = 00:00 at
  UTC+8) belong to the next cycle — the cycle, the dashboard's effective date and the cycle's change list now match
  the published AIRAC date. A date with a time in a file name (`…EFF202610281600…`) is read with its time.
- **Re-issued, not changed:** a new time slice with exactly the same values (only new dates and sequence number) is
  counted apart ("N features re-issued with unchanged values") instead of as a change.
- **Identifiers that are not hexadecimal UUIDs** (some equipment IDs are derived from their navaid's UUID, e.g.
  `…bac9ndb`) now resolve; before, such links were reported as unresolved.
- The data provider's country in the message metadata is used as a State clue for files without aerodromes.
- Files from a zip keep the zip's date, so opening the same zip again reuses the saved data.
- Tests: `multi_file.js` (a delivery built from the Donlon sample: grouping, checksums, references, duplicates,
  withdrawn feature, non-hexadecimal identifier, local-midnight AIRAC, XML view, Separate / Combine, saved copy,
  conversion); unit tests for the AIRAC cycle at local midnight.

## 1.8.0 — 2026-10-05 — live traffic on the map

- **✈ Live traffic is now an on / off switch on the map itself.** Switched on, the free adsb.lol live flight map
  (community ADS-B data, Open Database Licence, no account) appears inside the map, under the aeronautical data, at
  exactly the same position and zoom, and follows panning and zooming; switched off, the chosen base map returns. A
  note shows the live state and *Aircraft details ↗*, which opens the full adsb.lol map (aircraft information,
  history) in a new tab. Works on computers, tablets, phones and in the separate map window.
- How: the free live-traffic services do not let a page opened from a file read their data, so adsb.lol's own map
  page is embedded, sandboxed (it cannot open windows or change the tool), twice the size of the view so panning needs
  no reload; a zoom loads it again and the old view stays until the new one has its aircraft. adsb.lol receives only
  the map position and zoom. Off by default; nothing is requested until it is switched on.
- Test: `safety.js` switches live traffic on and off (address, sandbox, centring, zoom, base map, credit) with a
  stand-in page, so it needs no internet.

## 1.7.1 — 2026-10-05 — offline map in dark mode

- **Fixed — the offline map looked black in dark mode.** With dark mode set in Windows, macOS, Android or iOS, the
  built-in map had a near-black sea under light land; with dark mode chosen in the tool, sea and land were both
  near-black (since 1.0). Now dark mode, from either place, gives a mid-navy sea with slate-grey land, light enough
  for the dark-blue boundaries and routes to stay visible. The map also repaints when the system switches between
  light and dark while the tool is open. Light mode, online maps and saved or printed map images are unchanged.
- Test: `base_maps.js` checks the dark offline map (system and tool setting): sea colour, no light land, and no
  costly outline filter.

## 1.7.0 — 2026-10-05 — live traffic link; safety, accessibility and pipeline fixes from the code audit

- **✈ Live traffic** on the map: opens the free [adsb.lol](https://adsb.lol/) live flight map (community ADS-B
  data, Open Database Licence, no account) in a new tab at the same position and zoom. It is a link, not an overlay:
  nothing is loaded into the tool, which stays fully offline. (Free live-traffic services refuse data requests from a
  page opened as a file, and the overlay services that would allow it need an account or payment.)
- **Safer CSV export:** a cell that starts with `=`, `+`, `-`, `@` or a tab (and is not a number) is written with a
  leading `'`, so a spreadsheet shows it as text instead of running it as a formula.
- **Zip files:** a zip whose XML contents are larger than 4 GB is refused with a clear message instead of filling the
  browser memory; damaged zips stop cleanly.
- **Saved data and memory mode:** data saved in the browser is reused only when it was read in the memory mode that
  applies now (Full / Lite), so switching to Lite for a big file really frees memory.
- **No hidden internet check:** with the built-in offline map the map asks no server anything; the internet is checked
  only when an online map is chosen (or was chosen last time). The chip reads "offline map".
- **Accessibility:** every drop-down and filter box has a name for screen readers; dark-mode buttons and the version
  badge have enough contrast (dark text on the light-blue / pink colours); the amber warning colour is slightly
  darker; headings follow a proper order; action columns have a hidden header. Checked with axe-core (WCAG 2.1 AA):
  no problems left in light or dark mode.
- **Licences:** `THIRD-PARTY-LICENSES.txt` holds the full licence text of every built-in library and data set
  (generated by `tools/build_licenses.js`, checked by CI, included in the release zip, linked from About).
- **Pipelines:** GitHub Actions updated (checkout 7, setup-node 7, upload-artifact 7, CodeQL 4 with the extended
  security queries, build provenance 4); a release is published only when CI passed on that commit; Dependabot keeps
  three.js on 0.147 (0.148+ removed the OrbitControls the 3D view uses).
- **Dependencies:** SheetJS 0.20.3 (from the official SheetJS CDN, fixes the known SheetJS advisories), fflate as a
  direct dependency, Playwright as a developer tool only, ESLint 10 with a flat config that also checks `tools/`.
  `npm audit`: 0 vulnerabilities.
- Docs: SECURITY.md lists exactly when the tool goes online; README and the page description mention phones and
  tablets.
- Tests: `accessibility.js` (axe-core, every page, light and dark), `safety.js` (CSV guard, zip limit, saved data
  per memory mode, no requests with the offline map, Live traffic link); `e2e.js` ignores blocked map tiles offline.

## 1.6.0 — 2026-10-05 — search on the map

- **Search on the map** (box at the top left of the map, also on phones, tablets and in the pop-out map window):
  airways, waypoints, navaids, aerodromes, runways, taxiways, aprons, stands, airspace, obstacles, lights… of all
  loaded data. Results show the kind and the AIP section; exact names come first. A pick zooms there, outlines the
  feature in magenta (airways, taxiways and aprons with all their parts) and opens its information; an aerodrome
  opens the airport view. Arrow keys and Enter work; Esc closes the list, a second Esc clears the outline.
- Both search boxes (map and top bar) understand the words people type: "twy C", "taxiway A", "rwy 09L",
  "EADD stand 5", "airway UL123", "obstacle 0001" — every word is matched, in any order.
- **Fixed — top bar on laptops:** once a file was loaded, the title ran under the search box at 1366 px and narrower
  (since 1.0) and also at 1440 px (since 1.4). Now, at every width from 761 to 1920 px: no overlap, nothing pushed
  off-screen, and the full title from 1024 px up — the Feedback button shows only ✉ below 1600 px, the subtitle hides
  below 1400 px, the memory gauge below 1180 px, the compact header spacing starts at 1279 px, and only windows
  narrower than 1024 px shorten the title with "…". The layout test now checks this in all languages.
- Tests: `map_search.js` (12 searches, picks, Esc, phone); `layout.js` checks the title against the search box.

## 1.5.0 — 2026-10-05 — 15 free online maps, no API key; AIP list fix

- The CARTO maps (Voyager, light, dark) now answer a downloaded, local page with an "API KEY REQUIRED" picture, so
  they are replaced. The map offers **15 free online maps that need no API key** and load from the downloaded file:
  - Street maps: Esri world street map (recommended), OpenStreetMap standard, humanitarian and German styles.
  - Plain backgrounds, best under aeronautical data: light grey and dark grey with place names (Esri).
  - Terrain: Esri topographic, OpenTopoMap (contours), shaded relief with place names, National Geographic style,
    ocean and sea floor.
  - Satellite: Esri imagery with or without place names, NASA Blue Marble, Earth at night (NASA).
- Grouped list in the map panel; place names on satellite and relief maps stay under the aeronautical data; a
  refused or failing map switches to the Esri street map (or to the offline map without internet); a CARTO choice
  saved by an older version opens its free replacement.
- On dark and satellite maps (dark grey, satellite, Blue Marble, Earth at night) the aeronautical data gets a thin
  white outline, so routes, airspace borders and navaids stay readable; light maps are unchanged.
- **Fixed — AIP sections list:** the arrow of an aerodrome (and a second click on the aerodrome shown) now folds it
  back up — it used to open but never close; the arrow no longer jumps to that aerodrome's page; the filter text is
  kept when a group is folded; on phones and upright tablets an arrow tap no longer closes the whole ☰ list.
- Tests: `base_maps.js` (every offered map is free and keyless, no internet needed); `aip_tree.js` (folding and
  unfolding on a computer and a phone); `tools/check_maps.js` loads every map for real and saves screenshots (run
  before a release).

## 1.4.1 — 2026-10-04

- Dark mode from the computer's or phone's system setting now uses the same dark colours as the tool's own dark theme
  everywhere: the AIRAC changes box ("Highlight changes", "List all changes" was hard to read), side-by-side old values,
  NOTAM text, ILS labels on the airport chart and the map background. Light mode unchanged.

## 1.4.0 — 2026-10-04 — feedback to the creator

- **✉ Feedback** button in the top bar (next to ?), a card on the About page and a link in the footer of every page: name and e-mail (required, e-mail
  checked), organisation, position, subject, description, up to 5 attachments (20 MB), optional technical details
  (tool version, browser, screen; never AIXM data). The tool has no server, so Send hands the message to the user's
  own e-mail. Without attachments the system's default e-mail app opens with the creator's address, the subject
  "AIXM Code Converter — …" and the text filled in (also the *Open my e-mail app* button). With attachments: on a computer an e-mail file addressed to the creator with the attachments inside (Outlook opens it
  ready to send); on phones and tablets the share sheet with the files, or the e-mail app with the address filled in.
  Other ways: e-mail app, Gmail, copy the text. Name, e-mail, organisation and position are remembered.
- Tests: `feedback.js`.

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
