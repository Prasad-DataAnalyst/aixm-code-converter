# XML schemas used by the tests (not part of the application)

`_xsd.js` validates the AMXM files written by the aerodrome mapping package against the AMXM 2.0.2 XML schema
(`schemas/amxm/2.0.2`), offline. The AMXM schema imports these schemas, kept here unchanged as published:

| Folder | Schemas | Owner and terms |
|---|---|---|
| `gml/3.2.1/` | GML 3.2.1 (ISO 19136) | Open Geospatial Consortium, https://schemas.opengis.net (OGC Software License, see the header of each file) |
| `iso/19139/20070417/` | ISO 19139 gco, gmd, gss, gts, gsr | ISO / OGC schema repository, https://schemas.opengis.net/iso/19139/ (OGC Software License) |
| `w3c/` | `xlink.xsd`, `xml.xsd` | W3C, https://www.w3.org (W3C Software and Document License) |

They are used only by the tests (tools/tests/amdb_package.js) and are not included in AIXM-Code-Converter.html.
