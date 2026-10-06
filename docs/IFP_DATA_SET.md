# Instrument flight procedure (IFP) data set — reference and coding plan

AIXM Code Converter · © 2026 Prasad Selvaraj (prasad2t@gmail.com) · Apache-2.0

This page collects what the ICAO, EASA and EUROCONTROL material says about the **instrument flight procedure data
set** (SID, STAR and instrument approaches in AIXM). It also records how the tool reads and checks that data today,
and what is planned, including digital charts. It is written for the people who maintain the tool and for AIS staff
who review an IFP data set with it.

Sources (read October 2026):

- AIXM 5.2 Enhanced Navigator — *Instrument Flight Procedure Data Set* (comparison of ICAO and EASA, AIXM 5.2
  paths): <https://publish.obsidian.md/aixm-5-2-navigator/Instrument+Flight+Procedure+Data+Set>
- EUROCONTROL — *(ICAO) IFP Data Set*, AIXM 5.2 coding guidelines, pages "for review" / "work in progress":
  <https://swim-eurocontrol.atlassian.net/wiki/spaces/ACGIFP/overview> (copyright EUROCONTROL; summarised here, not
  copied)
- ICAO PANS-AIM (Doc 10066) Appendix 1, Aeronautical Data Catalogue, IFP part, as published by
  <https://www.aerodatacat.ch/showall.php/?id=7>
- ICAO PANS-OPS (Doc 8168) Vol II, Part III, Section 2, Chapter 5 (navigation database coding) and Section 5
  (publication); ICAO Annex 4 (charts), Annex 11 Appendix 3 (designators), Annex 15 (data sets)
- EASA Part-AIS: AIS.OR.335, AIS.OR.370, AIS.TR.370, AIS.TR.500 (Easy Access Rules for ATM/ANS)
- ARINC 424 (path terminators), RTCA DO-229 / ICAO Annex 10 (FAS data block)

## 1. What an IFP data set is

| | ICAO | EASA |
|---|---|---|
| Basis | Annex 15 5.3.1.1 e) — "when provided" | AIS.OR.335 / AIS.OR.370 — "if available" |
| Content | PANS-AIM: departure, arrival and approach procedures, as in the AIP | AIS.TR.370: six subjects (below) |
| Design | PANS-OPS Doc 8168 Vol II | GM1 AIS.TR.370 (same source) |
| Cycle | AIRAC | update cycles aligned with AIP amendments, supplements and the other data sets (AIS.TR.500) |

The six subjects, and how they are coded in AIXM 5.2:

1. **Procedure**: `StandardInstrumentDeparture`, `StandardInstrumentArrival`, `InstrumentApproachProcedure`, covering
   identity, type, coding, flight check and navigation specification.
2. **Procedure segment**: `SegmentLeg` subtypes (`DepartureLeg`, `ArrivalLeg`, `ArrivalFeederLeg`, `InitialLeg`,
   `IntermediateLeg`, `FinalLeg`, `MissedApproachLeg`). Each leg carries its path and termination, fixes,
   altitudes, course, speed and turn.
3. **Final approach segment**: `FinalLeg` with `FinalApproachSegmentData` (the SBAS / GBAS FAS data block).
4. **Procedure fix**: `TerminalSegmentPoint`, whose `pointChoice` is a `DesignatedPoint`, a navaid, a runway point and
   so on.
5. **Procedure holding**: `HoldingPattern`.
6. **Helicopter specifics**: the approach to a `TouchDownLiftOff` (PinS), with the direct and manoeuvring visual
   segments.

AIXM 5.1.1 lacks elements needed for SBAS / GBAS procedures. The EUROCONTROL guidelines are therefore written for
AIXM 5.2, with workarounds for 5.1 / 5.1.1 planned later. They target procedures designed for PBN. The AIS data set
is not meant for the FMS directly: data houses (DAT providers) turn it into ARINC 424.

### Feature types of an IFP data set (EUROCONTROL allocation)

A data set should hold only the features of its kind. An IFP data set may also carry the features its procedures
reference when the AIP data set is not provided ("conditional"). The tool flags other feature types in an IFP-only
data set as a note.

| Class | Features |
|---|---|
| Mandatory | SID, STAR, InstrumentApproachProcedure; DepartureLeg, ArrivalLeg, ArrivalFeederLeg, InitialLeg, IntermediateLeg, FinalLeg, MissedApproachLeg; HoldingPattern (terminal); DesignatedPoint (terminal); MinimumAltitudeArea / SafeAltitudeArea; TerminalArrivalArea; CirclingArea; NavigationArea, NavigationAreaRestriction; ProcedureDME; PilotControlledLighting; PrecisionApproachRadar, PrimarySurveillanceRadar, SecondarySurveillanceRadar, RadarSystem; RunwayVisualRangeEquipment; SeaplaneLandingArea; GBAS, GBASService, SatelliteService, SatelliteSystem |
| Conditional (when referenced and not in the AIP data set) | AirportHeliport, Runway, RunwayDirection, RunwayCentrelinePoint, TouchDownLiftOff; Navaid, VOR, DME, NDB, TACAN, Localizer, Glidepath, MarkerBeacon, DirectionFinder, Azimuth, Elevation; ApproachLightingSystem, VisualGlideSlopeIndicator; AirTrafficControlService, GroundTrafficControlService, RadioCommunicationChannel; ObstacleArea, VerticalStructure |
| Optional | Airspace, AuthorityForAirspace, AirTrafficFlowManagementService, GeoBorder, HoldingAssessment, InformationService, OrganisationAuthority, RulesProcedures, SDF, SignificantPointInAirspace, SpecialDate, Unit, WeatherSource |
| Not applicable | everything else (routes, aerodrome mapping features, services not used by procedures …) |

## 2. PANS-AIM data catalogue: the IFP subjects

| Subject | Properties (sub-properties) | Where the tool shows them |
|---|---|---|
| Procedure | identification (name, runway, FAS guidance, multiple code, circling, NS limiter); plain language and coded designation (basic / validity / route indicator, visual); procedure type; PBN or conventional; precision type; aircraft category; magnetic variation; OCA/H, DA/H, MDA/H per category and approach type; MSA (fix, radius, sector angles, altitude); TAA (IAF / IF, distance, sectors, step-down arc, altitude); nav spec and PBN requirements (functional, sensor limitations); temperature limits; remote altimeter source; procedure reference datum; operating minima; texts (missed approach, SID / STAR description, comm failure, close-in obstacles, PDG > 3.3 %, RNP AR, GNSS in lieu of, offset) | AIP AD 2.22 / 2.24 procedure detail; Digital data → Procedures (list, report) |
| Procedure segment | start, end, end fix functionality (fly-by / fly-over), end fix role, procedure altitude / height, MOCA, distance (1/100 NM), true and magnetic bearing (1/10°), gradient (approach 1/10°, departure 0.1 %), speed | legs table: path terminator, from, to (role, fly-by / over, compulsory), course (true / magnetic), turn, radius, altitudes (along, at end, MEA, MOCA), speed, length, time, vertical angle, navigation accuracy |
| Final approach segment | operation type, approach performance designator, SBAS provider, RPDS, RPI, LTP / FTP (position 0.3 m, ellipsoid height 0.25 m, orthometric height), FPAP (position, orthometric height), TCH (0.5 m), GPA (0.01°), course width at threshold, Δ length offset, HAL, VAL, FAS data block, CRC remainder | "Final approach segment (FAS) data block" table |
| Procedure fix | identification, ATC reporting (compulsory / on request / nil), VFR reporting point, position, type (navaid, intersection, waypoint), formation (navaid, bearing, distance) | legs table, map |
| Procedure holding | identification, fix, inbound / outbound course (0.1°), leg distance / time, limiting radial, turn direction, minimum / maximum level, speed | holding table (AD 2.22), map racetrack |
| Controlling obstacle | position, elevation, type | planned (cross-check with the obstacle data set) |
| Helicopter specifics | title, HCH, IDF, MAPt; direct visual segment (bearing, distance, track, crossing height); manoeuvring visual segment (areas, ingress tracks); height above surface diagram; VSDA | planned |

## 3. AIXM 5.1 / 5.1.1 against AIXM 5.2

`src/ifp.js` reads both versions, so the views, reports, maps and checks are the same for either.

| Topic | AIXM 5.1 / 5.1.1 | AIXM 5.2 |
|---|---|---|
| Leg altitudes along the segment | `lowerLimitAltitude`, `upperLimitAltitude`, `altitudeInterpretation` (ABOVE_LOWER, BELOW_UPPER, AT_LOWER …) | `lowerLimit`, `upperLimit`, `verticalLimitsInterpretation` (AT_OR_ABOVE, AT_OR_BELOW, AT, BETWEEN, RECOMMENDED, EXPECTED, BY_ATC) |
| Crossing altitude at the end, MEA | `minimumCrossingAtEnd` / `maximumCrossingAtEnd` on DepartureLeg only | `altitudeCondition` (SegmentLegAltitudeCondition: crossing min / max, MEA, per engine type) on every leg |
| MOCA | DepartureLeg | every leg (`minimumObstacleClearanceAltitude` / `Height`) |
| Course | `course`, `courseType`, `courseDirection` | `segmentCourse` (CourseGroup), several: true and magnetic |
| PBN | `Procedure.RNAV`, `aircraftCharacteristic`, `SegmentLeg.requiredNavigationPerformance` | `aircraftCapability` (navigationType CONV / TACAN / PBN, navigationSpecification, navigationAccuracy) on procedure and leg |
| Design standard | `designCriteria` code | `designCriteria` → DesignStandard (name, version) |
| Magnetic variation of the design | — | `magneticVariation`, `dateMagneticVariation` on Procedure |
| Runways served | LandingTakeoffAreaCollection `runway`; SID `departureRunwayTransition` | `runwayDirection`, `TLOF`; `takeoff` / `arrival` / `landing`; transition `runwayTransition`, `airportTransition` |
| Minima | `altitude` + `altitudeCode`, `height` + `heightCode` | `obstacleClearanceAltitude`, `decisionAltitude`, `minimumDescentAltitude`, `obstacleClearanceHeight`, `decisionHeight`, `minimumDescentHeight` |
| FAS data | `FASData` (FASDataBlock: performance, route, RPDS, RPI, course width, length offset, HAL, VAL, CRC) | `FASData` (FinalApproachSegmentData: also LTP / FTP, FPAP, TCH, GPA, orthometric heights, runway, airport, binary block) |
| Approach condition | final approach path, minima, circling | also climb gradient, Baro-VNAV temperatures, navigation accuracy, landing precision category, satellite approach type, step-down fix |
| Additional equipment | IAP only | Procedure and SegmentLeg (RADAR, RADAR_DME, RADAR_GNSS, RADAR_RNAV) |

## 4. Coding rules checked by the tool

The checks run in **Quality** (rule "IFP coding") and in **Digital data → Procedures → Coding checks**, and they go
into the procedure report. Most EUROCONTROL rules are drafts, so their findings are notes (info). Data that a path
terminator cannot do without is a warning.

| Topic | Rule | Source |
|---|---|---|
| Designator | each SID / STAR has a coded designator; it reads basic indicator + validity number 1–9 + route letter (not I or O), at most 7 characters; ARINC 424 holds 6 (ANITA6D → ANIT6D) | Annex 11 App 3; EUROCONTROL |
| Aerodrome | each procedure references an AirportHeliport | EUROCONTROL rule 1 |
| Runway | an approach serves one runway direction or one TLOF | EUROCONTROL rule 3 |
| Navigation | a navigation type is coded; PBN → navigation specification; navigation accuracy only when the specification has no value (e.g. "RNP" + 0.15) | EUROCONTROL |
| Magnetic variation | the variation used in the design is coded (5.2) | EUROCONTROL |
| Design standard | PANS_OPS, TERPS, CANADA_TERPS or NATO, with the version | EUROCONTROL |
| Minimum altitude | SID / STAR reference an MSA or AMA; approaches an MSA or TAA | Annex 4 9.9.3, 10.9.3, 11.10.5 |
| Transitions | legs are sequenced in a ProcedureTransition; with several transitions (ARINC 424 model) each has a type (RWY, COMMON, EN_ROUTE, ENGINE_OUT; APPROACH, MISSED for approaches); a single transition may be typed OTHER:SINGLE | EUROCONTROL |
| Path terminator | every leg of an RNAV procedure has one; RNAV uses IF, TF, CF, DF, RF, FA, FM, CA, VA, VI, VM, HM; RNP uses IF, TF, RF, HM | PANS-OPS Vol II Pt III Sec 2 Ch 5 |
| First / last legs | SID: CA, CF, VA, VI … CF, DF, FM, RF, TF, VM; STAR: IF … CF, DF, FM, HM, RF, TF, VM; approach: IF … CF, TF, RF; missed approach: CA, CF, DF, FA, HM, RF, VI, VM … CF, DF, FM, HM, RF, TF, VM | PANS-OPS |
| Leg data | TF, CF, DF, RF need an end fix; IF, FA, FM, HM a fix; RF needs the arc centre, the turn direction and the radius; CA, FA, VA an altitude; C / F legs a course, V legs a heading; HM a length or a time | PANS-OPS, EUROCONTROL |
| Fix | reporting COMPULSORY or ON_REQUEST (not OTHER or NO_REPORT); RNAV end fixes say fly-by or fly-over | EUROCONTROL |
| Vertical angle | a descent is negative (−3.0) | EUROCONTROL |
| Speed | in KT (usually IAS) with MAX / MIN / AT | EUROCONTROL |
| FAS data block | CRC remainder of 8 hexadecimal characters | PANS-AIM |
| Data set | feature types not in the ICAO IFP data set allocation (IFP-only data sets) | EUROCONTROL |

## 5. Reference tables

### ARINC 424 path terminators (23)

| Kind | Path terminators |
|---|---|
| Fixed (end at a fix) | IF initial fix · TF track between two fixes · CF course to a fix · DF direct to a fix · RF constant radius arc to a fix · AF DME arc to a fix · FC track from a fix for a distance · FD track from a fix to a DME distance |
| Floating (end at a condition) | FA track from a fix to an altitude · FM … to a manual termination · CA course to an altitude · CD course to a DME distance · CI course to an intercept · CR course to a radial · VA heading to an altitude · VD heading to a DME distance · VI heading to an intercept · VR heading to a radial · VM heading to a manual termination |
| Holding / reversal | HA to an altitude · HF one circuit to the fix · HM to a manual termination · PI procedure turn |

### Fix roles (TerminalSegmentPoint.role, approaches)

IAF, IF, IF_IAF, FAF, PFAF, FAP, MAPT, MAHF, MATF, SDF, FPAP, FTP, LTP, FROP, TP, VDP, FEEDER_FIX; for helicopters
DP, FHP, IDF, PRP. The FACF (`indicatorFACF`) is an ARINC 424 concept that data houses add; an AIS data set is not
expected to code it.

## 6. Coding plan

Implemented in 1.22.0:

- `src/ifp.js` reads IFP data in AIXM 5.1, 5.1.1 and 5.2: altitudes, courses, speeds, fixes, PBN, design standard,
  magnetic variation, minima, the FAS data block, runways served and the aerodrome. The aerodrome and runways may sit
  in the AIP data set loaded with the IFP data set.
- AIP AD 2.22 / 2.24 procedure detail, Digital data → Procedures, the approach profile, the terrain / obstacle flight
  path studies and Quality all use it.
- RF (and AF) legs are drawn as arcs around their centre on the map, the Digital data maps and in report pictures.
- The coding checks of section 4, in Quality, in the Procedures section and in the procedure report.
- Test data set `testdata/ifp52_test_EADD.xml` (AIXM 5.2): a correct SID with CA / DF / RF / TF legs, a correct RNP
  approach with an SBAS FAS data block, and a STAR with coding errors put in on purpose.

Next, in order of value:

1. **FAS data block integrity**: rebuild the binary FAS block from its fields (operation type, SBAS provider,
   airport, runway, performance, route, RPDS, RPI, LTP / FTP, Δ FPAP, TCH, GPA, course width, Δ length offset,
   HAL, VAL), compute the CRC-32Q, and compare it with `CRCRemainder` and `FASDataBlock`. The CRC-32Q routine already
   exists in `integrity.js`.
2. **FAS against the aerodrome data**: the LTP against the runway threshold position and elevation (geoid
   undulation from orthometric and ellipsoid heights); the GPA and TCH against the glide path / VGSI; the FPAP on the
   runway centreline.
3. **Procedure geometry checks**: TF / CF course against the computed great-circle track (true and magnetic with the
   procedure magnetic variation); leg length against the computed distance (1/100 NM); RF radius against the
   centre–fix distances; turn direction against the arc; fly-by turns over 120°.
4. **Vertical checks**: descent / climb gradients between successive altitude constraints (final 5.2 % / 3°,
   missed approach 2.5 %, SID PDG 3.3 %); DA / MDA against OCA / H; VPA against the FAS GPA.
5. **Controlling obstacle**: PANS-AIM "controlling obstacle" against the obstacle data set (the analysis in
   `study.js` already finds obstacles under the paths); close-in obstacles for SIDs.
6. **Holdings**: HM / HA / HF legs and HoldingPattern racetracks with speed, leg time / distance and turn
   direction; MSA sectors and TAA drawn with their altitudes (partly done on the main map).
7. **Helicopter PinS**: direct visual segment, manoeuvring visual segment, HAS diagram, VSDA.
8. **Change report between two AIRAC cycles** of the IFP data set: procedures and legs added, removed and changed
   (the Compare tab works per feature today).
9. **ARINC 424 view** (read-only): the legs as they would read in ARINC 424 fields, for data-house review. This is
   not an FMS database.

## 7. Digital charts (Annex 4) — plan

The *Digital charts* tab is the place for charts drawn from the data. The building blocks exist already:
`STUDY.picture` (terrain, paths, points, rings, scale, north arrow), `PROFILE` (approach profile and timing table),
`ADCHART` (aerodrome chart), `OLS` (obstacle surfaces) and the map renderers.

| Chart (Annex 4) | Data needed | Status |
|---|---|---|
| SID — instrument (Ch. 9) | SID legs with path terminators, fixes, altitudes, speeds, MSA, terrain (Annex 4 10th edition: terrain portrayal), textual description, comm failure | plan view in pictures and on the map; chart layout planned |
| STAR — instrument (Ch. 10) | as SID, holdings | as above |
| Instrument approach (Ch. 11) | plan view, profile view, minima box, MSA / TAA diagram, missed approach text, FAS data, RNAV coding table | profile and timing table done (AD 2.24); plan view and minima box planned |
| Aerodrome / heliport (Ch. 13) | runways, taxiways, aprons, stands, lights, hot spots (AIXM or AMXM) | airport chart done |
| Aerodrome obstacle chart Type A (Ch. 3) | runway, take-off flight path area, obstacles, terrain | planned (OLS + obstacle data set) |
| Precision approach terrain chart (Ch. 6) | terrain profile 900 m before the threshold | planned (terrain files) |
| Area chart (Ch. 7) | routes, airspace, procedures, terrain | map |
| Electronic aeronautical chart display (Ch. 20) | all of the above, interactive | the map and Digital data maps |

The chart pipeline will:

1. pick the procedure(s) and the chart type;
2. lay out the Annex 4 boxes (title, frequencies, MSA, plan view, profile, minima, notes);
3. draw the plan view at a chosen scale with terrain;
4. export PDF / SVG / PNG.

Every value on the chart opens its AIXM code, as everywhere else in the tool.

## 8. Reviewing a State's IFP data set (checklist)

1. Load the IFP data set with the AIP data set of the same AIRAC cycle, so that fixes, navaids, runways and
   aerodromes resolve.
2. **Digital data → Procedures**: every procedure has an aerodrome, a runway, legs, minima (approaches) and a map
   path; the KPI tiles count holdings, MSA and TAA.
3. Open **Coding checks**: work through the warnings first (missing fixes, arc centres, altitudes, path terminators),
   then the notes.
4. **Quality**: unresolved references (fixes not in the AIP data set) and IFP data set feature allocation.
5. **AIP → AD 2.22 / 2.24**: the legs tables read like the State's tabular descriptions; compare them with the
   published charts.
6. **Terrain → Flight paths**: legs whose altitude leaves less than the indicative MOC over terrain or obstacles.
7. Reports: the procedure report (PDF / Excel) with the coding findings, and the terrain report.
