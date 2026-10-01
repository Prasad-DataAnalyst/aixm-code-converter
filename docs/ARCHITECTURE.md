# AIXM Code Converter — developer guide

AIXM Code Converter · © 2026 Prasad Selvaraj (prasad2t@gmail.com) · Apache-2.0

This guide explains how the code is organised and how to extend it safely. The application is **one offline HTML
file** built from the sources in `src/` by `tools/build.js`. There is no framework and no server: plain JavaScript
modules (each an IIFE that defines one global object) are inlined in a fixed order.

## 1. Build

```bash
cd tools && npm install            # libraries, playwright-core, eslint
npm run build                      # = node build.js  -> ../AIXM-Code-Converter.html
npm run lint                       # ESLint over src/*.js (must stay clean)
npm test                           # browser tests in tools/tests (build first)
node e2e.js                        # full UI walkthrough with screenshots and exports
```

`tools/build.js` reads `src/index.html` and replaces the placeholders
`/*@@INLINE_JS:file@@*/`, `/*@@INLINE_CSS:file@@*/` and `/*@@INLINE_JSON:file@@*/` with file contents.
Data compiled once from the official sources:

| Script | Input | Output |
|---|---|---|
| `tools/build_dictionary.py` | `schemas/4.5`, `5.1`, `5.1.1`, `5.2` (aixm.aero XSDs) | `data/aixm_dictionary.json` (features, properties, code lists, definitions) |
| `tools/build_rules.js` | `schemas/rules/aixm-br-sbvr-0.9.xlsx` | `data/aixm_rules.json` (business rules + feature hierarchy) |

## 2. Modules (load order)

| # | File | Global | Responsibility |
|---|---|---|---|
| 1 | `config.js` | `APP_INFO`, `APP_SETTINGS` | name, version, author, licence; tunable limits (Lite threshold, threads, PDF rows, AIRAC publication days) |
| 2 | `core.js` | `AX` | version sniffing, fast XML parser, AIXM 5.x and 4.5 → 5.x conversion, GML geometry, temporality (`resolve`), flatten/diff, AIRAC, ICAO State prefixes. Also runs inside the workers and in Node (`module.exports`). |
| 3 | `worker.js` | – (Web Worker) | streams a byte range of the file, finds feature elements, converts them with `AX`, posts batches. Lite mode trims heavy content. |
| 4 | `model.js` | `MODEL` | `finalize(ds)`: merges records, indexes (`byId`, `byType`, references `rev`), aerodrome ownership, time-slice resolution (`setViewDate`), labels, formatting, geometry, State/effective date (`computeMeta`) |
| 5 | `library.js` | `LIBRARY` | State folders on disk (File System Access API) and the IndexedDB cache of extracted data |
| 6 | `aip.js` | `AIP` | ICAO AIP structure: catalogue of GEN / ENR / AD 2 / AD 3 sections and their builders; `sectionOf(ds, rec)` |
| 7 | `analysis.js` | `ANALYSIS` | in-file changes, comparison of two data sets, AIRAC-cycle changes, basic quality checks |
| 8 | `mapview.js` | `MAPVIEW` | Leaflet map, offline base map, aeronautical layers, procedures, measure, print/PNG renderer |
| 9 | `exports.js` | `EXPORTS` | JSON, Excel, PDF, print, e-mail (clipboard / .eml / .html) |
| 10 | `convert.js` | `CONVERT` | AIXM version conversion, 4.5 → 5.1.1 writer, GeoJSON, KML, Shapefile |
| 11 | `review.js` | `REVIEW` | AMDT report, side-by-side diff, Digital NOTAM, timeline data |
| 12 | `rules.js` | `RULES` | AIXM 5.1 business-rule evaluation |
| 13 | `i18n.js` | `I18N` | interface languages (Arabic RTL, French, Spanish) |
| 14 | `app.js` | – | the user interface (views, drawers, dialogs) — see the table of contents at its top |

Rule of thumb: **lower modules never call higher ones** (core ← model ← aip/analysis ← review/rules/exports/convert ← app).
`mapview.js` and `exports.js` receive callbacks (`hooks`) from `app.js` instead of calling it.

## 3. Data flow

```
File ──► AX.sniff (version, prefixes) ──► N Web Workers (byte ranges, worker.js + AX.convFeature*)
     ──► record batches ──► MODEL.finalize(ds) ──► AIP / ANALYSIS / REVIEW / RULES / MAPVIEW / EXPORTS
                                   └─► LIBRARY.saveDataset (cache, files ≤ 1.5 GB)
```

Values shown in the UI are **cells** `AIP.C(text, rec, prop)`: the text plus the record and property they come from,
so every value can open its exact AIXM code (byte offset `rec.o`, length `rec.n`, line `rec.line`).

## 4. Data model

**Data set `ds`**: `name, file, size, sniff, family ('5' | '45'), version, recs[], byId (Map), byType {type: recs},
rev (Map target → [[prop, rec]]), owner (Map rec → aerodrome), state, stateSource, airac {id, date, next}, effective,
viewDate (null = latest), lite, lib (Library origin), prevCmp (comparison with the previous cycle), hlCycle`.

**Record `rec`**: `k` (feature type, `45:Xxx` for AIXM 4.5 features without a 5.x equivalent), `id` (UUID or 4.5 key),
`o / n / line` (position in the file), `ts[]` time slices `{i: interpretation, s: sequence, c: correction, b / e: valid
time, lb / le: feature lifetime, p: properties}`, `cur` (the slice valid at `ds.viewDate`, from `AX.resolve`), `i`
(index in `recs`).

**Properties `p`**: plain values are strings; measured values `{v, u}` (value, unit of measurement); references
`{ref, title}`; nil values `{nil: reason}` (`nilReason` "inapplicable" is listed in `_na`); objects carry `_t` (AIXM
class) and geometry `_geo` `{t: 'P' | 'L' | 'A', c: coordinates [lon, lat]}`.

## 5. How to …

**Add an AIP section (GEN / ENR)** — in `aip.js`, add an entry to `GENENR`: `{ id: 'ENR 4.2', title: '…', has: ds => …,
build: ds => [blocks] }`. Blocks are `{kind: 'kv', rows: [row(no, label, [cells])]}`, `{kind: 'table', cols, rows}` or
`{kind: 'note', text}`. Map the feature types to the section in `ENR_OF` so changes and search point to it.

**Add or change an aerodrome subsection** — edit `AD2[n] = function (ds, ad) { … }`; use `owned(ds, ad, [types])` for
the features of the aerodrome and `AD_SUB` for the feature → subsection mapping.

**Map a new AIXM 4.5 feature** — add a `case` in `adapt45` (`core.js`) that returns AIXM 5 property names; relations
that belong to another feature are merged in `link45` (`model.js`).

**Add a map layer** — build it in `buildOverlays` (`mapview.js`), add it to `LAYER_DEF`, and draw it in `renderImage` for
PNG/PDF output.

**Add an export format** — write a function in `exports.js` or `convert.js` that takes a *scope* `{title, sub, ds,
sections}` or a data set, and add a button in the Export view (`app.js`). Include `APP_INFO.credit` in the file.

**Add a business-rule pattern** — add a regular expression to `P` in `tools/build_rules.js`, rebuild the rules, and
implement the new `k.t` case in `checkOne` (`rules.js`).

**Translate more text** — add `[English, Arabic, French, Spanish]` rows to `T` in `i18n.js`; the English text must match
the interface text exactly (numbers in front are handled).

**Change name, version, limits** — `src/config.js` only.

## 6. Tests

`tools/tests/` holds browser tests (Playwright, headless Chromium), one per feature: AIP and cycle highlighting,
changes, comparison, library, conversions, AIXM 4.5, procedures, review tools, business rules, bookmarks, languages,
map print, State detection, theme/attribution and layout at five window sizes (including RTL and dark mode).
`node tools/tests/run_all.js [filter]` runs them and fails on any page error. `tools/test_aip.js` prints AIP sections as
text in Node and can evaluate any expression on a data set (`EVAL='…'`).

## 7. Conventions

* ES5-style JavaScript inside IIFEs (works everywhere, no transpiler); `'use strict'`; 2-space indent.
* No network calls except the optional online map tiles; all data stays in the browser.
* Times in AIXM are UTC: always parse with `AX.tms`, format with `MODEL.fmtDate` / `fmtTs`.
* Keep the copyright header in every file and `APP_INFO.credit` in every generated file (Apache-2.0 NOTICE).
