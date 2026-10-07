# Aerodrome Mapping Databases (AMDB / AMXM) — research and creation plan

Prepared by **Prasad Selvaraj** for the AIXM Code Converter. Research and discussion only: nothing in this document is built yet.

This document collects what governs an aerodrome mapping database (regulation, standards, coding, exchange formats, quality, metadata, industry practice and research). It then sets out how the converter could create an AMDB package from what a user already has, and which claims such a package can and cannot honestly make.

---

## 1. Terms

| Term | Meaning | Source |
|---|---|---|
| AMD — aerodrome mapping data | "Data collected for the purpose of compiling aerodrome mapping information for aeronautical uses" | ICAO Annex 15 / PANS-AIM |
| AMDB — aerodrome mapping database | "A collection of aerodrome mapping data organized and arranged as a structured data set". In practice, an AMD set that meets the industry requirements of ED-99 / DO-272 | ICAO; EUROCONTROL ACGAMD |
| AMXM — Aerodrome Mapping Exchange Model | The exchange model of ED-119 / DO-291. The UML is normative; the XML Schema (namespace `http://www.amxm.aero/schema/2.x`, current 2.0.x) is informative, one means of compliance | ED-119C / DO-291C |
| ARINC 816 | Binary "Embedded Interchange Format for Airport Mapping Database" loaded into avionics. Features from ED-99, coding from ED-119, with its own metadata, tiling optimisations and CRC | ARINC 816-0 … 816-3 |
| ASRN | Aerodrome Surface Routing Network: nodes and edges for taxi routing (A-SMGCS) | ED-99 |
| Area 2 / Area 3 / Area 4 | Terrain and obstacle data coverage areas. Area 3 is the aerodrome surface area and is recommended with AMD | Annex 15, PANS-AIM |

**AMD versus AMDB.** ICAO asks States for AMD. An AMDB is AMD that also meets the industry requirements:
- the ED-99 feature catalogue;
- the numerical quality levels (fine, medium or coarse);
- the ED-99 constraints: generic, geometric and functional;
- an ED-119 / AMXM encoding.

The same aerodrome can therefore exist in AIXM 5.1.1 (as AMD) and in AMXM (as an AMDB). Feature mappings exist between the two, but translating either way can lose information (EUROCONTROL ACGAMD, *Interpretation of ICAO requirements in relation to industry requirements*).

---

## 2. Regulation and standards

### 2.1 ICAO

| Document | Provision | What it requires |
|---|---|---|
| Annex 14 Vol I (Ed 8+) | 2.1.1 | Aerodrome data are determined and reported to the accuracy and integrity the end-users need (PANS-AIM Appendix 1) |
| Annex 14 | 2.1.2 – 2.1.4 | Error detection in transmission and storage, e.g. CRC. AMD features are selected to match a defined operational need. AMDBs are provided at fine or medium quality (ED-99C / DO-272B) |
| Annex 15 (Ed 16+) | 5.3.1.1, 5.3.4.1 | AMD is part of the digital data sets |
| PANS-AIM (Doc 10066) | 5.3.3.3 | Content follows DO-272D / ED-99D. Metadata follows DO-291B / ED-119B. Area 3 terrain and obstacle data are recommended alongside |
| PANS-AIM | Appendix 1 | Accuracy, resolution and integrity (critical, essential or routine) for each aerodrome data item. Most items fall in the fine class |
| PANS-AIM | Chapter 3 | The data quality management system |
| PANS-AIM | Appendix 6 | The digital data set content tables |
| Doc 9881 | — | Guidelines for electronic terrain, obstacle and aerodrome mapping information |
| Annex 4 | — | Aerodrome charts. Electronic aeronautical charts may be derived from AMD |

### 2.2 Europe

| Instrument | Relevance |
|---|---|
| Regulation (EU) 2017/373 | Part-AIS, and Part-DAT for data service providers. Supplying an AMDB that is loaded into aircraft systems requires an EASA DAT certificate (Type 1 or Type 2). That is a regulatory gate, not a tool feature |
| Regulation (EU) 139/2014 (as amended by 2020/469) | Aerodrome operators' data origination duties: formal arrangements with the AIS provider and data quality requirements (ADR.OPS.A.005 and the AMC/GM to it) |
| Regulation (EU) 2020/469 | Aeronautical data quality requirements across the ATM/ANS chain |
| EUROCONTROL Specification for the Origination of Aeronautical Data, Ed 2.0 | How data are originated: formal arrangements, surveying, validation and verification, metadata. Applies to AMD originators |
| EUROCONTROL TOD Manual | Terrain and obstacle data, Areas 1 – 4 |
| EUROCONTROL ACGAMD supporting material | AMD ↔ AMDB feature mapping, metadata mapping, implementation steps and FAQ (summarised in §3 – §6) |
| ETSO-C165a / AC 20-153A (FAA) | Equipment and database acceptance for airport moving maps. Data processing follows DO-200 |

### 2.3 Industry standards

| Standard | Content |
|---|---|
| **ED-99D / DO-272D** — User Requirements for Aerodrome Mapping Information | Feature catalogue (about 45 feature types), attributes and their quality (accuracy, resolution, integrity) per level, capture rules, constraints, and verification and validation (DO-272B §3.9) |
| **ED-119C / DO-291C** — Interchange Standards for Terrain, Obstacle and Aerodrome Mapping Data | AMXM: application schema, feature catalogue encoding, metadata built on ISO 19115 |
| **ED-76A / DO-200B** — Standards for Processing Aeronautical Data | The process assurance every party in the data chain must show: data quality requirements, configuration management, tool qualification, error reporting |
| ED-77 / DO-201A | Industry requirements for aeronautical information |
| ED-98 / DO-276 | Terrain and obstacle data requirements |
| EUROCAE ER-009 | Guidance for initial AMDB generation |
| ISO 19100 series | 19107 geometry, 19109 application schema, 19111 CRS, 19115 metadata, 19131 data product specification, 19157 data quality |
| FAA AC 150/5300-16, -17, -18 | Geodetic control, imagery acquisition, and Airports GIS data collection with feature specifications. The US route to surveyed airport data |
| UK CAA CAP 1732 | Aerodrome survey guidance |
| ARINC 816 | Binary format for avionics, from ED-99 / ED-119 |

### 2.4 Quality levels

- **Fine**: about 0.5 m horizontal for the most demanding features, e.g. runway centreline and thresholds. Needs surveying or photogrammetry from orthophotos with ground control.
- **Medium**: about 5 m (CE90). Jeppesen's published worldwide set is described as "5 m (CE90), 10⁻³ integrity". Most commercial EFB-grade AMDBs are at this level.
- **Coarse**: lower than medium. Not useful for surface navigation.

Each feature and attribute has its own accuracy, resolution and integrity in ED-99D, so the full numbers must be taken from the purchased standard before any claim of compliance. PANS-AIM Appendix 1 mostly maps to fine. An AMDB below fine may produce AMD that fails PANS-AIM (ACGAMD).

---

## 3. What an AMDB contains

### 3.1 Feature catalogue

The table lists the ED-99 / AMXM features and their usual AIXM 5.1.1 counterparts, following the ACGAMD mapping.

| AMXM / ED-99 | AIXM 5.1.1 (EUROCONTROL ACGAMD correspondence) |
|---|---|
| AerodromeReferencePoint | AirportHeliport (ARP) |
| AerodromeSurfaceLighting | GroundLightSystem |
| ApronElement | ApronElement[type != PARKING] |
| ArrestingGearLocation / ArrestingSystemLocation | ArrestingGear / ArrestingGear[engageDevice = EMAS] |
| AsrnNode, AsrnEdge | AIXM 5.1.1 extension (ASRN) |
| Blastpad | RunwayBlastPad |
| ConstructionArea | WorkArea |
| DeicingArea | DeicingArea |
| FinalApproachAndTakeOffArea | can be implied (Runway[type = FATO]) |
| FrequencyArea | GroundTrafficControlService + RadioCommunicationChannel (difficult case) |
| HelipadThreshold | RunwayCentrelinePoint[role = THR] on a FATO |
| Hotspot | AirportHotSpot |
| LandAndHoldShortOperationLocation | RunwayMarking[markingLocation = OTHER:LAHSO] |
| PaintedCenterline | RunwayMarking[markingLocation = CL] |
| ParkingStandArea / ParkingStandLocation | ApronElement[type = PARKING] or AircraftStand (two options) / AircraftStand |
| RunwayCenterlinePoint | RunwayCentrelinePoint |
| RunwayElement / RunwayDisplacedArea / RunwayIntersection / RunwayShoulder | RunwayElement[type = NORMAL / DISPLACED / INTERSECTION / SHOULDER] |
| RunwayExitLine | GuidanceLineMarking of a GuidanceLine[type = OTHER:RWY_EXIT_LINE] |
| RunwayMarking | RunwayMarking (with extension) |
| RunwayThreshold | RunwayCentrelinePoint[role = THR or DISTHR] |
| ServiceRoad | Road[type = SERVICE] |
| StandGuidanceLine | GuidanceLineMarking of a GuidanceLine[type = GATE_TLANE] |
| Stopway | RunwayProtectArea[type = STOPWAY] |
| SurveyControlPoint | SurveyControlPoint |
| TaxiwayElement / TaxiwayShoulder | TaxiwayElement[type = NORMAL …] / TaxiwayElement[type = SHOULDER] |
| TaxiwayGuidanceLine | GuidanceLine |
| TaxiwayHoldingPosition | TaxiHoldingPositionMarking |
| TaxiwayIntersectionMarking | TaxiwayMarking[markingLocation = TWY_INT] |
| TouchDownLiftOffArea | TouchDownLiftOff |
| VerticalPoint / Line / PolygonalStructure | VerticalStructure. ED-99 limits these to within 90 m of a runway centreline and 50 m of the movement area |
| AerodromeSign, ATCBlindSpot, BridgeSide, DeicingGroup, PositionMarking | need AIXM extensions (AMGen / AM) |
| Water | no correspondence: outside the scope of AIXM 5.1.1 |

Common AMXM attributes**:
- `idarpt`, `idrwy`, `idthr`, `idlin`, `idapron`, `idstd`;
- `feattype`, `featbase`;
- `surftype`, `pcn`, `length` / `width`;
- `vacc`, `hacc`, `vres`, `hres` (accuracy and resolution, per feature);
- `integr`;
- `source`, `revdate`.

Code lists include `featbase` (surveyed, digitized, generated, …), `feattype`, `surftype`, `color` and `style`. This repository already carries the AMXM 2.0.2 dictionary (`data-amxm`), so every attribute and code value is known.

### 3.2 Constraints (ED-99) — what an auditor checks

**Generic**
- Mandatory attributes are present, or explicitly unknown or not applicable.
- Code values come from the lists.
- Identifiers are unique.

**Geometric**
- Polygons are closed and simple, outer rings counter-clockwise, inner rings clockwise.
- No slivers and no gaps between adjacent surface elements (runway, taxiway, apron and shoulder tile the paved surface).
- Point density on curves keeps the chord error within the required accuracy.
- Lines are split at intersections and at attribute changes.
- Thresholds lie on the runway element; guidance lines lie on paved surfaces; holding positions cross the guidance lines.

**Functional**
- Each runway threshold has a runway element.
- Exit lines connect a runway to a taxiway guidance line.
- Parking stand locations lie within their stand areas.
- The ASRN is connected and has no dangling edges.
- Runway designators are consistent with their bearings (the converter already checks this for AIXM).

### 3.3 Metadata (ED-119 / ISO 19115 / PANS-AIM)

The metadata block records:
- the producer, the originator and the contact;
- reference systems: WGS-84 horizontal and EGM-96 or EGM-2008 vertical;
- the effective date;
- accuracy, resolution and integrity, by feature or by data set;
- lineage: sources, process steps and the tools used;
- the quality classification (`amdb:qualityClassification` fine / medium / coarse);
- `amdb:dataIntegrity`;
- horizontal and vertical units;
- the spatial extent;
- the restrictions on use;
- a data product specification (ISO 19131).

EUROCONTROL ACGAMD gives the full ISO 19115 path mapping and an XML example.

---

## 4. How AMDBs are made today

1. **Survey** (fine). GNSS and total-station survey of control points and features, to FAA AC 150/5300-16/-18 or CAP 1732.
2. **Photogrammetry** (fine or medium). An aerial or satellite orthophoto is georeferenced to ground control, then features are digitised to the ED-99 capture rules. This is the most common route.
3. **CAD / engineering drawings** (variable quality). Airport drawings are transformed to WGS-84 and checked against the imagery.
4. **Conversion** (inherits the source quality). An existing AIXM 5.1.1 AMD set is mapped to AMXM with the ACGAMD mapping, then the ED-99 constraints are checked, because AIXM does not enforce them.

**Who does it.**
- Commercial suppliers:
  - Jeppesen, about 300 airports early on, DO-200A compliant, 5 m CE90 / 10⁻³;
  - Lufthansa Systems Lido AMDB, more than 2,300 airports;
  - NAVBLUE, EASA DAT Type 1 and 2;
  - Satpalda and similar imagery houses.
- GIS tools: Esri ArcGIS Aviation / Airports (`ImportAMXM` / `ExportAMXM` for AMXM 2.0); 1Spatial, which EUROCAE used for rule-based validation.
- State and airport programmes: EUROCONTROL Airport Data Toolkit (Dublin, Frankfurt, Arlanda and Zurich trials, AMIS serving AMXM 2.0); FAA Airports GIS.

### 4.1 Where the industry struggles (the opportunity)

ACGAMD FAQ, ADTKIT and the vendor material agree on the following.
- **Fine data is scarce.** Medium and coarse AMDBs are commercially widespread; fine-quality data, especially for the airport side (ICAO AMD), is lacking.
- **States and airports rarely originate AMD.** Annex 15 makes AMD a recommended data set, so many States have none. Where an aerodrome is not certified to provide AMD, its use for air or ground navigation is excluded (ACGAMD FAQ).
- **Two worlds.** Aerodromes and AIS work in AIXM 5.1.1, while avionics and EFBs use AMXM and ARINC 816. Translation is manual and loses information.
- **Constraint checking is expensive.** ED-99 rules are checked in proprietary GIS tooling, and there is no open, explainable validator.
- **Metadata is weak.** Lineage, per-feature quality and the data product specification are often missing, and auditors ask for them first.
- **Cost.** Data management, provision in several formats and integration all cost money (ICAO 2010 AIM conference), and licences restrict reuse.
- **Change management.** Construction works and new stands need delta updates. AIXM temporality and AMXM `revdate` help, but tooling to produce deltas is rare.

### 4.2 Research directions

- Runway, taxiway and apron segmentation from imagery with deep learning:
  - "Runway Extraction and Improved Mapping from Space Imagery" (arXiv 2201.00848);
  - the airport runway segmentation (ARS) dataset (NWPU);
  - SUTD × Jeppesen airport mapper: YOLOv8 for 7 feature classes, over 90 % detection;
  - Faster R-CNN runway detection for the FAA runway database (about 76 % mAP).
- "World-wide precision airport mapping databases for aviation applications" (IEEE 5731201): the Jeppesen production approach.
- US patent 9389082: automatic generation of aerodrome surface movement models (ASRN) from the map.
- Rule-based validation of ED-99 constraints (1Spatial / EUROCAE case study).

**Conclusion of the research.** Machine detection gives a **draft**. It never replaces georeferencing to ground control, human verification, and the originator's sign-off.

---

## 5. Proposed: AMDB Studio in the converter

### 5.1 Inputs, from richest to least

| Tier | The user has | What we do | Best honest quality |
|---|---|---|---|
| A | AIXM 5.1.1 / 5.2 AMD (aerodrome elements) | Map to AMXM with the ACGAMD mapping, keep UUIDs, run the ED-99 constraints and fix the coding (ring order, splitting, densification) | Same as the source, as declared in its metadata |
| B | AMXM from elsewhere | Validate against ED-99 and ED-119 and report, upgrade the version, fill the metadata, build the ASRN | Same as the source |
| C | Survey points, CAD (DXF), or GIS (GeoJSON / Shapefile) with a known CRS | Transform to WGS-84 / EGM, classify into ED-99 features, then build polygons and lines | Same as the survey or drawing |
| D | Only the AIP / AIXM aerodrome data (runways, thresholds, stands, taxiway names) | Generate the geometry: runway elements from thresholds, width and length; shoulders; stopways and clearways; stand points; taxiway centrelines only where AIXM provides them | **Coarse / indicative only**, `featbase = generated` |
| E | Nothing | An orthophoto the user supplies, digitised in the tool with snapping and the ED-99 capture rules; machine detection may propose shapes | Up to medium with good georeferenced imagery and control; never fine without survey |

Obstacles and terrain come from what the converter already reads: eTOD obstacles (AIXM / Excel / CSV) and GeoTIFF / DTED terrain. They supply the vertical structures and the Area 3 terrain packaged with the AMDB.

### 5.2 The package (what "no one made before" can honestly mean)

One download (`<ICAO>_AMDB_<date>.zip`) would hold:

1. **AMXM 2.0.x XML**, valid against the schema, plus **AIXM 5.1.1 / 5.2 AMD**, so the same data is available in both worlds with the same UUIDs.
2. **ED-119 / ISO 19115 metadata XML**, per data set and per feature class. Lineage names each source, each process step and the processor: *"Processed with AIXM Code Converter — created by Prasad Selvaraj"*.
3. **Data product specification**, following ISO 19131.
4. **Validation report** in PDF and HTML, which works as an audit pack:
   - every ED-99 generic, geometric and functional constraint, with pass / fail / not applicable;
   - every finding with its coordinates, feature and map picture;
   - completeness per feature type;
   - the declared and achieved quality per feature class.
5. **Integrity**: a CRC-32Q per file and a SHA-256 manifest. ARINC 816 itself is a later option, because the specification must be purchased.
6. **Area 3 obstacles** (AIXM 5.1.1) and **terrain** (GeoTIFF), with their own metadata.
7. **Previews**: an aerodrome chart picture, GeoJSON and KML.
8. **Change log** against the previous package (delta), for AIRAC updates.

What would make it lead the field:
- **open, explainable constraint checking**: every rule cites its ED-99 / PANS-AIM clause;
- **AIXM ↔ AMXM round-trip** with UUIDs kept;
- **honest per-feature quality labelling**;
- **an audit pack generated with the data**, so no separate document is needed;
- **all of it working offline in one HTML file**.

### 5.3 Credit

The package names **Prasad Selvaraj** as the creator of the tool and as the **processor** in the lineage and metadata (ISO 19115 role `processor`, with the tool name and version).

The **data originator** stays whoever surveyed or supplied the data (the aerodrome operator or the user). Claiming origination of data we did not survey would itself fail an audit. Under ED-76A / DO-200B, every party in the chain must be named in its true role.

---

## 6. What a tool cannot do on its own

- **Fine quality cannot be fabricated.** Without survey or controlled photogrammetry, geometry is at best medium, and generated geometry is coarse. The package must say so in `featbase`, `hacc` and `vacc`, and in the quality classification.
- **Passing an audit is about the process, not just the file.** ED-76A / DO-200B, the EU 2017/373 Part-DAT certificate, formal arrangements (LoAs) with originators, and a quality management system are organisational obligations of the provider.
  - The tool can make the file **audit-ready**: correct coding, metadata, lineage, validation evidence and integrity.
  - It can also support **tool qualification**: deterministic output and a test suite with reference data.
  - It cannot replace certification.
- **Use for navigation** requires an AMD-certified aerodrome and a DAT-certified chain. Tier D and Tier E outputs must carry "not for navigation; for planning, charting, training and situational awareness". Tier A, B and C outputs inherit the user's own certification.
- **Paid standards.** ED-99D, ED-119C and ARINC 816 are not free. The exact numerical requirements must be taken from the purchased documents before compliance is claimed. The ACGAMD material, which is public, covers the mapping and metadata.
- **Copyright and licensing.** Imagery and AIP data carry licences. The package must record the licence of each source (ACGAMD *Implementation — legal aspects*).

---

## 7. Possible phasing (for later; not started)

1. **Validator first.** ED-99 constraints and ED-119 metadata checks on AMXM and AIXM AMD that the converter already reads, with the audit report. This is the lowest risk and gives immediate value.
2. **AIXM → AMXM writer** (Tier A) and AMXM → AIXM (Tier B), keeping UUIDs; package with metadata, DPS, CRC and manifest.
3. **Generation from AIP data** (Tier D), labelled coarse, plus ASRN building.
4. **Survey, CAD and GIS import** (Tier C), with CRS transformation.
5. **Imagery digitising** (Tier E), with snapping, capture rules and optional detection.
6. **ARINC 816** encoding, once the specification is available.

---

## 8. Permissions, liability and the safe route (decision: study and analysis only)

**Decision (Prasad Selvaraj).**
- Build the best output we can.
- Mark every output, and the HTML tool itself, **"NOT FOR NAVIGATION — for study and analysis purposes only"**.
- Use only inputs that we, or the user, are allowed to use. Where an input is not permitted, take a free, permitted alternative.
- Say exactly what is inside each package, how it was made and from which data.
- Help users bring the package into their own formats and processes, such as ARINC 816.

This section records what was checked. It is not legal advice; a short review by a lawyer is recommended before the first public release of the AMDB feature.

### 8.1 The tool (the HTML file)

| Item | Status | Action |
|---|---|---|
| Our code | Apache 2.0. Sections 7 and 8 already say "as is", with no warranty and no liability | Keep. Add an AMDB-specific notice (8.5) |
| "Not for operational use" notice | Already on the About page (`APP_INFO.disclaimer`) | Extend the text to AMDB packages and show it before every AMDB export, with an acknowledgement tick |
| Third-party libraries (Leaflet, three.js, SheetJS, jsPDF, fflate, …) | Permissive licences, listed in THIRD-PARTY-LICENSES.txt | Nothing new is needed |
| AIXM schemas (EUROCONTROL & FAA) | BSD-style | Already credited |
| AMXM 2.0.2 schema (RTCA, EUROCAE) | BSD-style: keep the notice and disclaimer; **the names RTCA and EUROCAE may not be used to endorse or promote** derived products without written permission | Write "uses the public AMXM 2.0 schema". **Never** write "EUROCAE / RTCA approved", "ED-99 compliant" or "certified" |
| ED-99D, ED-119C, DO-200B, ARINC 816 texts | Copyrighted and sold | Do not copy their text or tables into the tool. Implement rules from public sources (ICAO, the EUROCONTROL ACGAMD pages, the AMXM schema) and cite them. Any rule taken from a purchased standard is cited by clause number only |
| EUROCONTROL ACGAMD pages | Public guidance | Cite and link them; do not copy large passages |
| No certification is claimed | No EASA Part-DAT certificate, and no DO-200B process assurance | Packages are never presented as navigation databases. This keeps the work outside Part-DAT, which applies to data intended for use on aircraft for navigation |

### 8.2 Input sources: allowed, conditional, or not allowed

| Source | Can it be used to make AMDB geometry? | Conditions |
|---|---|---|
| **The user's own data** (AIXM, AMXM, survey, CAD, GIS, imagery) | ✅ Yes | The user confirms they hold the rights. This is recorded in the metadata as the originator and the licence |
| **Copernicus Sentinel-2** imagery (10 m) | ✅ Yes, free for any use including commercial | Notice "Contains modified Copernicus Sentinel data [year]". 10 m is good enough for **coarse** only |
| **National open orthophotos** (e.g. France IGN BD ORTHO under the Etalab Licence Ouverte; Netherlands PDOK CC-BY; Denmark, Switzerland swisstopo, Norway, New Zealand LINZ CC-BY; USGS NAIP, public domain) | ✅ Yes, where the licence is open | Record the licence and the attribution for each source. 0.1 – 1 m imagery allows **medium** quality |
| **Copernicus DEM GLO-30 / GLO-90** terrain | ✅ Yes | Exact notice: "produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved". Also add the no-liability sentence of the licence |
| **SRTM, GMTED2010, ETOPO1** | ✅ Public domain | Credit the source |
| **AWS Terrain Tiles** (already built in) | ✅ Open data | Per-source attribution, already listed |
| **OpenStreetMap** aeroway data | ⚠ ODbL **share-alike**: an AMDB built from OSM is a derivative database and must itself be released under ODbL with attribution | Use only if the user accepts ODbL for the output. Never mix OSM with closed data in one package. Off by default |
| **Esri World Imagery** | ⚠ The layer's terms allow tracing features to create vector data, but every other use stays under the Esri Master Agreement / Terms of Use, and tiles may not be exported for offline use | Allowed only as a **visual check**. It is not offered as a digitising source unless the user states they hold an Esri licence; the choice is recorded in the metadata |
| **Google Maps / Google Earth, Bing, Apple** imagery | ❌ Their terms forbid deriving data | Never used |
| **State AIP / AIXM data** | ⚠ Copyright stays with each State or ANSP. Some publish freely (e.g. FAA, public domain); others restrict reuse (eAIP copyright notices, EAD terms) | Only data the user loads. The package says which State's data were used and that rights stay with that State. **We never ship or redistribute State data ourselves** |
| **Commercial AMDBs** (Jeppesen, Lido, NAVBLUE) | ❌ Licensed products | Never used as a source |
| **FABDEM** and other CC BY-NC data | ❌ Non-commercial only | Not used, to stay safe for any user |

### 8.3 Quality labels follow the source, not ambition

| Source used | `featbase` | Quality classification |
|---|---|---|
| The user's survey, or their certified AIXM / AMXM data | as supplied | as declared by the originator |
| Open orthophoto, 0.1 – 1 m, digitised in the tool | digitized | medium at best, stated as "not verified by survey" |
| Sentinel-2, or generated from runway, threshold and width data in the AIP | generated / digitized | coarse |

### 8.4 Transparency: what every package states ("what's inside")

1. **README / Package report** (PDF and HTML) states:
   - the purpose ("study and analysis only — not for navigation");
   - every file in the package, with its SHA-256;
   - the inputs: file names, the State or owner, the licence and the date;
   - the processing steps, in order, with tool name and version: "AIXM Code Converter x.y — created by Prasad Selvaraj";
   - the transformations: CRS, geoid, and densification tolerance;
   - the rules checked, with their results;
   - known gaps and limitations.
2. **ISO 19115 metadata** carries the same lineage in machine form:
   - role `processor` = Prasad Selvaraj / AIXM Code Converter;
   - role `originator` = the data owner;
   - `useLimitation` = NOT FOR NAVIGATION;
   - `otherConstraints` = the licence of each source.
3. **Inside every XML file** (AMXM / AIXM), a header comment and the metadata carry the notice.
4. **Inside every feature**, `featbase` and `source` show how that feature was made.

### 8.5 Notice text (draft)

> NOT FOR NAVIGATION. FOR STUDY AND ANALYSIS PURPOSES ONLY.
> This aerodrome mapping package was produced with the AIXM Code Converter, created by Prasad Selvaraj. It is not a certified aeronautical data product. It has not been produced under EUROCAE ED-76A / RTCA DO-200B, is not issued by an EASA Part-DAT or State AIS provider, and must not be loaded into aircraft systems or used for flight planning, navigation, aerodrome operations or any safety-related purpose. It is derived from the sources listed in the package report, which keep their own copyright and licences, and its accuracy is limited to the quality stated per feature. It is provided "as is", without warranty of any kind. The author and contributors accept no liability for any use of it (Apache License 2.0, sections 7 and 8). AMXM is a schema of RTCA and EUROCAE, used under its licence; RTCA and EUROCAE do not endorse this product.

Before any AMDB export, the user ticks "I understand this is not for navigation and I have the right to use the input data". The tick is recorded in the package report.

### 8.6 Helping others use the package (interoperability without liability)

- **Open outputs**:
  - AMXM 2.0 XML;
  - AIXM 5.1.1 / 5.2;
  - GeoPackage, the OGC open standard for import into GIS and AMDB tools;
  - GeoJSON, KML, Shapefile;
  - CSV attribute tables.
- **ARINC 816.** The specification is SAE property and must be purchased. We would not write 816 binaries until a purchased copy confirms the licence permits it. Instead we provide:
  - a public **mapping guide** from AMXM features and attributes to the ED-99 / ARINC 816 feature list, by feature name, so that an 816 compiler (vendors' tools, or the user's own) can take our AMXM or GeoPackage directly;
  - a checklist of the data ARINC 816 tools usually need: tiling extent, metadata, CRCs and the AIRAC effective date;
  - output already coded to the ED-99 conventions (ring orientation, splitting, identifiers), so 816 conversion needs no rework.
- **Esri ArcGIS Aviation**: our AMXM 2.0 output is made to load with its `ImportAMXM` tool, with a how-to.
- **AIXM systems** (AIS databases, eAIP tools): the AIXM version keeps the same UUIDs as the AMXM version, so updates can be merged.
- **An open "how it was made" guide** in `docs/`, so anyone can repeat or audit the process.

### 8.7 Risk register (checked 2026-10-07)

| # | Risk | Today | Level | Action |
|---|---|---|---|---|
| R1 | Esri base maps (street, grey, topo, imagery) are used through server.arcgisonline.com without an ArcGIS account. Esri allows this with attribution, but **commercial or revenue use needs a subscription and token**, and its content may not be harvested, redistributed or used offline | Exists now in the tool | Medium if the tool is sold or used commercially; low for free, non-commercial use | Keep the attribution. State "Esri maps: non-commercial use; for commercial use add your own ArcGIS key". Make an open map the default. Never use Esri tiles in exports or as an AMDB source without a licence |
| R2 | Third-party OSM tile servers (openstreetmap.de, openstreetmap.fr, OpenTopoMap) have fair-use policies and can block heavy use | Exists now | Low | Keep attribution and use only interactively, with no bulk download. Already in place |
| R3 | Someone uses an output for navigation and something goes wrong | Future AMDB, and the existing exports | Low; cannot be zero. Disclaimers do not exclude liability for death, injury or gross negligence in some countries (e.g. the UK Unfair Contract Terms Act 1977, s.2(1)) | "Not for navigation" on every file and page, the acknowledgement tick, honest quality labels, no certification claims, keep it free (no sale as a navigation product) |
| R4 | The output is presented as ED-99 compliant or EUROCAE / RTCA endorsed | Future | Low if worded correctly | Approved wording only (8.1, 8.5) |
| R5 | Copyrighted standards' text is copied into the tool | Future | Low | Cite clause numbers; never copy text |
| R6 | Input data rights (State AIP, imagery) | User-supplied | Low for us, because the user declares their rights | Tick box; licence of each source in the metadata; we never ship State data |
| R7 | OSM share-alike accidentally applies to a package | Future | Low | OSM off by default and never mixed |
| R8 | Part-DAT / State AIS rules | Future | Very low while not for navigation and not supplied for aircraft use | Never offer loading into avionics or ARINC 816 binaries |
| R9 | Trademarks (AIXM, AMXM, ARINC, Jeppesen, …) | Names used descriptively | Low | Descriptive use only; no logos; "not affiliated with EUROCONTROL, FAA, RTCA, EUROCAE, SAE / ARINC" |

---

## 9. Enhancements and export options (backlog, not started)

### 9.1 Enhancements beyond the core plan

**Checks across data sets (study only)**
- **AMDB ↔ AIP AD 2:**
  - runway length and width against the declared distances;
  - threshold coordinates and elevations;
  - PCN and surface;
  - the stand list.
- **AMDB ↔ obstacles:** vertical structures against the eTOD Area 2 / 3 obstacles: missing, duplicated, or with different heights.
- **AMDB ↔ terrain:** threshold and runway elevations against the DEM, and the runway slope.
- **Annex 14 geometry study:** runway strip, RESA, taxiway widths and separation distances (Annex 14 tables), and holding-position distances from the runway centreline. Each result cites its clause.
- **Feature-catalogue coverage:** which ED-99 feature types are present, a completeness score per aerodrome, and a quality dashboard (surveyed, digitised or generated).

**Making and fixing data**
- **Fix suggestions** with before / after preview. The user applies them, never the tool on its own:
  - ring orientation;
  - closing open polygons;
  - densifying curves;
  - splitting lines at intersections;
  - snapping gaps and slivers.
- **Taxi-route network (ASRN):**
  - built from the guidance lines;
  - connectivity check;
  - taxi route from a stand to a runway drawn on the map (study only).
- **Imagery alignment check:** the offset between the data and an open orthophoto, measured at control points.
- **Change between two packages or AIRAC cycles:**
  - added, removed and moved features, with distances;
  - shown on the map and in a report;
  - written as a delta file (AIXM temporality / AMXM `revdate`).

**Views**
- **Compare two packages side by side**, with maps kept in sync.
- **3D aerodrome:** surfaces, vertical structures and Annex 14 surfaces.
- **Aerodrome chart print** (Annex 4-style layout, A4 / A3 / A2, "not for navigation" border), taxi diagram, and stand list.
- **Time slider** for works areas and temporary changes.

**Productivity**
- **Saved export presets**, e.g. "Runways and taxiways only, GeoPackage + PDF".
- **Batch export:** many aerodromes in one run, one zip each, with a summary.
- **Consistent file naming:** `<ICAO>_<type>_<AIRAC>_<date>`. Every zip carries a manifest with SHA-256 checksums.

### 9.2 Custom export and full export

**Custom export** (choose what you want):
- aerodrome(s);
- feature types;
- area: a radius, a drawn polygon or the whole aerodrome;
- quality class;
- attributes;
- effective date;
- related data: AIP aerodrome, airspace, obstacles, terrain, procedures, as in 1.24 / 1.25.

**Full export** (everything for the chosen aerodrome or for all aerodromes): every format ticked, in one zip with the manifest.

| Format | Contents | Custom | Full |
|---|---|---|---|
| AMXM 2.0 XML | aerodrome mapping features | ✓ | ✓ |
| AIXM 5.1 / 5.1.1 / 5.2 | the same features, with the same UUIDs | ✓ | ✓ |
| GeoPackage (.gpkg) | one layer per feature type, with metadata tables | ✓ | ✓ |
| GeoJSON | one file per type, or a single file | ✓ | ✓ |
| JSON | attributes, metadata (ISO 19115 as JSON), check results, manifest | ✓ | ✓ |
| KML / KMZ | styled, with folders per type, for Google Earth | ✓ | ✓ |
| Shapefile (.zip) | point, line and polygon sets with .prj | ✓ | ✓ |
| DXF | CAD layers per feature type, for engineers | ✓ | ✓ |
| GML (simple features) | generic GIS exchange | ✓ | ✓ |
| CSV / Excel (.xlsx) | attribute tables, one sheet per type, plus a check-results sheet | ✓ | ✓ |
| PDF | audit report, "what's inside" report, aerodrome chart, map atlas | ✓ | ✓ |
| HTML report | the same report, offline and searchable | ✓ | ✓ |
| SVG / PNG | chart and map pictures | ✓ | ✓ |
| ISO 19115 metadata XML, data product specification (ISO 19131) | ✓ | ✓ | ✓ |
| GeoTIFF / ASCII grid / XYZ | terrain of the area (exists today) | ✓ | ✓ |
| Handover record | for white-label exports (8.x) | ✓ | ✓ |

Every format carries:
- the notice;
- the attributions the source licences require;
- the quality labels per feature.

A white-label export removes only our branding.

### 9.3 4D: 3D plus time, across every section (backlog, not started)

**What exists today:**
- "Latest data / Valid on date" resolves AIXM temporality (BASELINE, PERMDELTA, TEMPDELTA) for any day.
- The Timeline, Changes and NOTAM views.
- Timesheets shown in the AIP.
- The 3D view (`view3d.js`), with terrain, airspace volumes and crew views.
- Live traffic.

**4D joins these up.** One time control (date plus UTC time, with play / pause / step by AIRAC, day or hour) drives the Map, 3D, AIP, Digital data and Quality views together.

| Section | What 4D shows |
|---|---|
| Airspace | Volumes that switch on and off by their timesheets and activations (danger, restricted and TSA areas, CTR hours); 3D blocks appear and disappear as time plays |
| Routes / airways | Conditional routes, level and direction limits by time |
| Aerodrome / AMDB | Works areas, closed taxiways and stands, temporary markings and lighting changes (TEMPDELTA / Digital NOTAM) in 3D |
| Obstacles | Temporary obstacles such as cranes, with their validity; new and removed obstacles by AIRAC |
| Procedures (IFP) | Which procedures are valid on a date. A **4D flight-path study**: legs with speeds and altitudes become time along the path (estimated times over each fix, climb and descent profiles), drawn in 3D with a moving aircraft, plus terrain and obstacle clearance along it. Study only |
| Navaids | Outages and maintenance (NOTAM), and the coverage they leave |
| Terrain | Static, but used as the surface for every 4D view |
| Live traffic | Real aircraft over the 4D picture, for the current time only |
| Changes / AIRAC | "Play" from one cycle to the next: features appear, move, change or disappear, with a change report |
| Digital NOTAM | Each event shown in place, in 3D, during its active period |

**Exports in 4D:**
- KML with time stamps (Google Earth time slider);
- CZML (Cesium) for 3D web viewers;
- GeoJSON with validity fields;
- a video or GIF of the animation;
- a PDF "state on date" report.

**Speed rule (section 9):**
- The state for each time is computed once and cached, reusing the temporality engine already in place.
- Animation draws only what changes between frames.
- Nothing runs unless the time control is opened.
- File reading is not affected.

---

## 10. Sources

**EUROCONTROL**
- (ICAO) Aerodrome Mapping Data Sets — supporting material: https://ext.eurocontrol.int/aixm_confluence/x/7gJ9Aw. It covers the standards landscape, general requirements, creation of AMD, information exchange models, metadata, implementation, applications and FAQ.
- Information exchange models (AMXM / ARINC 816): https://ext.eurocontrol.int/aixm_confluence/display/ACGAMD/Information+exchange+models
- General requirements: https://ext.eurocontrol.int/aixm_confluence/display/ACGAMD/General+requirements
- Airport Data Toolkit (ADTKIT): EUROCONTROL AIXM Confluence
- Aerodrome mapping service: https://www.eurocontrol.int/service/aerodrome-mapping

**EUROCAE, SAE / ARINC and EASA**
- EUROCAE ED-99D: https://eshop.eurocae.net/eurocae-documents-and-reports/ed-99d
- EUROCAE ED-119C: https://www.eurocae.net/product/ed-119c-interchange-standards-for-terrain-obstacle-and-aerodrome-mapping-data/
- ARINC 816-3: https://saemobilus.sae.org/standards/arinc816-3-816-3-embedded-interchange-format-airport-mapping-database
- EASA ETSO-C165a: https://www.easa.europa.eu/download/etso/ETSO-C165a_CS-ETSO_9.pdf

**FAA and UK CAA**
- FAA AC 150/5300-18: https://www.faa.gov/airports/resources/advisory_circulars/index.cfm/go/document.current/documentnumber/150_5300-18
- FAA AC 20-153A: https://www.faa.gov/documentLibrary/media/Advisory_Circular/AC_20-153A.pdf
- UK CAA CAP 1732: https://www.caa.co.uk/publication/download/17155

**ICAO**
- ICAO NACC AGA TF WP10 (2023): https://www.icao.int/NACC/Documents/Meetings/2023/AGATF01/WGAGATF1-WP10.pdf
- ICAO A41 WP/492: https://www.icao.int/sites/default/files/Meetings/a41/Documents/WP/wp_492_en.pdf

**Industry and tools**
- Esri ArcGIS Aviation, Import AMXM: https://desktop.arcgis.com/en/arcmap/latest/extensions/aviation-charting/importamxm.htm
- 1Spatial / EUROCAE case study: https://1spatial.com/media/fqulptch/case-study_eurocae.pdf
- SKYbrary, AMDB: https://skybrary.aero/articles/airport-mapping-database-amdb
- Lufthansa Systems Lido AMDB: https://lhsystems.com/solutions/data/lido-amdb
- NAVBLUE AMDB: https://navblue.aero/?p=8749

**Research**
- IEEE, World-wide precision airport mapping databases: https://ieeexplore.ieee.org/document/5731201
- Runway Extraction and Improved Mapping from Space Imagery: https://arxiv.org/pdf/2201.00848
- SUTD × Jeppesen Airport Mapper: https://capstoneshowcase.sutd.edu.sg/2024/project/airport-mapper/

**Licences (section 8)**
- Esri World Imagery terms: https://goto.arcgis.com/maps/World_Imagery
- Copernicus DEM GLO-30 licence: https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Data/DEM/resources/license/License-COPDEM-30.pdf
- Copernicus Sentinel data licence: https://ewds.climate.copernicus.eu/licences/ec-sentinel
- OSM licence FAQ (ODbL): https://osmfoundation.org/wiki/Licence_and_Legal_FAQ
- Esri terms of use summary: https://downloads2.esri.com/arcgisonline/docs/tou_summary.pdf
- Esri basemap attribution: https://developers.arcgis.com/documentation/mapping-apis-and-services/deployment/basemap-attribution/
- Esri licensing requirements: https://developers.arcgis.com/javascript/latest/licensing/index.html
- OSM tile usage policy: https://operations.osmfoundation.org/policies/tiles/

---

*Created by Prasad Selvaraj — AIXM Code Converter.*
