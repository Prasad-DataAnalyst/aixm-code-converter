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

## 8. Sources

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

---

*Created by Prasad Selvaraj — AIXM Code Converter.*
