#!/usr/bin/env python3
"""Compile the official AIXM XML schemas (schemas/<version>/*.xsd) into a compact
JSON dictionary that is embedded in the single-file application.

Output: data/aixm_dictionary.json
  {
    "v5":  {"features": {...}, "objects": {...}, "codes": {...}, "featureVersions": {...}},
    "v45": {"features": {...}, "types": {...}, "codes": {...}}
  }
"""
import json
import os
import re
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCHEMAS = os.path.join(ROOT, "schemas")
OUT = os.path.join(ROOT, "data", "aixm_dictionary.json")

XS = "{http://www.w3.org/2001/XMLSchema}"
GML = "{http://www.opengis.net/gml/3.2}"


def clean(text):
    if not text:
        return ""
    text = re.sub(r"<[^>]+>", " ", text)
    text = text.replace("&nbsp;", " ").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
    return re.sub(r"\s+", " ", text).strip()


def doc_of(node):
    """Return the documentation text of an xsd node (xsd:documentation or gml:description)."""
    ann = node.find(XS + "annotation")
    if ann is None:
        return ""
    parts = []
    for d in ann.iter(XS + "documentation"):
        parts.append("".join(d.itertext()))
    for d in ann.iter(GML + "description"):
        parts.append("".join(d.itertext()))
    return clean(" ".join(parts))


def strip_type(t):
    t = (t or "").split(":")[-1]
    for suf in ("BaseType", "Type"):
        if t.endswith(suf) and t != suf:
            return t[: -len(suf)]
    return t


# ----------------------------------------------------------------------------- AIXM 5.x
def parse_v5(version, files):
    codes, groups, elements, ctypes = {}, {}, {}, {}
    for f in files:
        root = ET.parse(f).getroot()
        for el in root:
            tag = el.tag.replace(XS, "")
            name = el.get("name")
            if not name:
                continue
            if tag == "element":
                elements[name] = {
                    "type": (el.get("type") or "").split(":")[-1],
                    "sg": (el.get("substitutionGroup") or "").split(":")[-1],
                    "d": doc_of(el),
                    "abstract": el.get("abstract") == "true",
                }
            elif tag == "group" and name.endswith("PropertyGroup"):
                props = {}
                for g in el.iter(XS + "group"):
                    ref = (g.get("ref") or "").split(":")[-1]
                    if ref:
                        props["@group:" + ref] = None
                for e in el.iter(XS + "element"):
                    pn = e.get("name")
                    if not pn:
                        continue
                    props[pn] = {"t": strip_type(e.get("type")), "d": doc_of(e)}
                    if e.get("maxOccurs") == "unbounded":
                        props[pn]["m"] = 1
                groups[name] = props
            elif tag == "complexType":
                ext = el.find(".//" + XS + "extension")
                refs = [(g.get("ref") or "").split(":")[-1] for g in el.iter(XS + "group")]
                ctypes[name] = {
                    "base": (ext.get("base") or "").split(":")[-1] if ext is not None else "",
                    "groups": [r for r in refs if r],
                    "d": doc_of(el),
                }
            elif tag == "simpleType" and name.startswith("Code") and name.endswith("BaseType"):
                vals = {}
                for en in el.iter(XS + "enumeration"):
                    vals[en.get("value")] = doc_of(en)
                codes[name[: -len("BaseType")]] = {"d": doc_of(el), "v": vals}

    def group_props(gname, out, depth=0):
        if depth > 10:
            return
        for pn, pv in groups.get(gname, {}).items():
            if pn.startswith("@group:"):
                group_props(pn[7:], out, depth + 1)
            else:
                out.setdefault(pn, pv)

    def type_props(tname, seen=None):
        seen = seen or set()
        out = {}
        while tname and tname in ctypes and tname not in seen:
            seen.add(tname)
            ct = ctypes[tname]
            for g in ct["groups"]:
                group_props(g, out)
            tname = ct["base"]
        return out

    def is_feature(name, depth=0):
        el = elements.get(name)
        if not el or depth > 10:
            return False
        if el["sg"] == "AbstractAIXMFeature":
            return True
        return is_feature(el["sg"], depth + 1)

    features, objects = {}, {}
    for name, el in elements.items():
        if el["abstract"] or name.startswith("Abstract") or name.endswith("TimeSlice") or name.endswith("Extension"):
            continue
        if el["sg"] in ("AbstractExtension", "AbstractTimeSlice"):
            continue
        doc = el["d"] or ctypes.get(el["type"], {}).get("d", "")
        if is_feature(name):
            ts = elements.get(name + "TimeSlice", {}).get("type", name + "TimeSliceType")
            features[name] = {"d": doc, "p": type_props(ts), "sg": el["sg"]}
        else:
            props = type_props(el["type"])
            if props or el["sg"] in ("Point", "Curve", "Surface"):
                objects[name] = {"d": doc, "p": props}
    return features, objects, codes


def merge_v5():
    order = ["5.1", "5.1.1", "5.2"]
    merged = {"features": {}, "objects": {}, "codes": {}, "featureVersions": {}}
    for v in order:
        d = os.path.join(SCHEMAS, v)
        files = [os.path.join(d, f) for f in sorted(os.listdir(d)) if f.endswith(".xsd")]
        feats, objs, codes = parse_v5(v, files)
        for name in feats:
            merged["featureVersions"].setdefault(name, []).append(v)
        # later versions override definitions, but keep earlier text when the newer is empty
        for tgt, src in ((merged["features"], feats), (merged["objects"], objs)):
            for name, entry in src.items():
                old = tgt.get(name)
                if old:
                    if not entry["d"]:
                        entry["d"] = old["d"]
                    props = dict(old["p"])
                    for pn, pv in entry["p"].items():
                        if not pv["d"] and pn in props:
                            pv["d"] = props[pn]["d"]
                        props[pn] = pv
                    entry["p"] = props
                tgt[name] = entry
        for name, entry in codes.items():
            old = merged["codes"].get(name)
            if old:
                if not entry["d"]:
                    entry["d"] = old["d"]
                vals = dict(old["v"])
                for k, dv in entry["v"].items():
                    vals[k] = dv or vals.get(k, "")
                entry["v"] = vals
            merged["codes"][name] = entry
    return merged


# ----------------------------------------------------------------------------- AIXM 4.5
def parse_v45():
    d = os.path.join(SCHEMAS, "4.5")
    types, codes, snapshot = {}, {}, {}
    code_docs = {}
    for f in ("AIXM-DataTypes.xsd", "AIXM-Features.xsd"):
        root = ET.parse(os.path.join(d, f)).getroot()
        for el in root:
            tag = el.tag.replace(XS, "")
            name = el.get("name")
            if not name:
                continue
            if tag == "complexType":
                seq = []
                for e in el.iter(XS + "element"):
                    en = e.get("name") or (e.get("ref") or "")
                    if not en:
                        continue
                    seq.append([en, (e.get("type") or "").split(":")[-1], doc_of(e)])
                types[name] = {"d": doc_of(el), "e": seq}
                code_docs[name] = doc_of(el)
            elif tag == "simpleType" and name.endswith("Base"):
                vals = [en.get("value") for en in el.iter(XS + "enumeration")]
                if vals:
                    codes[name[: -len("Base")]] = {"v": {v: "" for v in vals}}
    for name, c in codes.items():
        c["d"] = code_docs.get(name, "")
    for f in ("AIXM-Snapshot.xsd", "AIXM-Update.xsd"):
        root = ET.parse(os.path.join(d, f)).getroot()
        for e in root.iter(XS + "element"):
            n, t = e.get("name"), e.get("type")
            if n and t and re.fullmatch(r"[A-Z][a-z]{2}", n):
                snapshot[n] = t
    features = {}
    for short, t in sorted(snapshot.items()):
        info = types.get(t, {"d": "", "e": []})
        features[short] = {"type": t, "d": info["d"]}
    return {"features": features, "types": types, "codes": codes}


def borrow_code_definitions(v45, v5):
    """AIXM 4.5 enumerations carry no per-value definitions. Borrow them from the
    AIXM 5.x code list that has the most similar value set."""
    index = []
    for name, c in v5["codes"].items():
        vs = set(c["v"].keys())
        if len(vs) >= 2:
            index.append((name, vs))
    for name, c in v45["codes"].items():
        vs = set(c["v"].keys())
        if len(vs) < 2:
            continue
        best, score = None, 0.0
        for n5, s5 in index:
            inter = len(vs & s5)
            if not inter:
                continue
            j = inter / len(vs | s5)
            if j > score:
                best, score = n5, j
        if best and score >= 0.5:
            src = v5["codes"][best]["v"]
            for k in c["v"]:
                if src.get(k):
                    c["v"][k] = src[k]
            c["from5"] = best


def main():
    v5 = merge_v5()
    v45 = parse_v45()
    borrow_code_definitions(v45, v5)
    out = {"v5": v5, "v45": v45}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    print(
        "5.x: %d features, %d objects, %d code lists | 4.5: %d features, %d types, %d code lists | %.1f KB"
        % (
            len(v5["features"]),
            len(v5["objects"]),
            len(v5["codes"]),
            len(v45["features"]),
            len(v45["types"]),
            len(v45["codes"]),
            os.path.getsize(OUT) / 1024,
        )
    )


if __name__ == "__main__":
    main()
