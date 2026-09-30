// Compiles the AIXM 5.1 business rules (SBVR, aixm.aero, aixm-br-sbvr-0.9.xlsx) into data/aixm_rules.json.
// Every rule is kept for the rule catalogue; rules whose wording matches a known pattern also get a
// machine-checkable form ("k") that the application evaluates. Also stores the feature type hierarchy
// (substitution groups of the AIXM 5.1.1 XML schema) used to apply rules of abstract classes.
// Usage: node tools/build_rules.js
const fs = require('fs');
const path = require('path');
const XLSX = require('./node_modules/xlsx');
const ROOT = path.join(__dirname, '..');
const wb = XLSX.readFile(path.join(ROOT, 'schemas/rules/aixm-br-sbvr-0.9.xlsx'));
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

const norm = (s) => String(s || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
const list = (s) => (s.match(/'([^']*)'/g) || []).map((x) => x.slice(1, -1).trim());
const lastClass = (chain) => chain.split(' specialisation ').pop().trim();

const P = [
  [/^Each (\w+) shall have assigned ([\w.]+) value$/, (m) => ({ t: 'mand', c: m[1], p: m[2] })],
  [/^Each (\w+) with assigned ([\w.]+?)(?: value)? shall have assigned ([\w.]+) value$/, (m) => ({ t: 'cmand', c: m[1], if: m[2], p: m[3] })],
  [/^Each (\w+) \. annotation \. Note \. propertyName shall not have assigned value other than \((.*)\)$/, (m) => ({ t: 'note', c: m[1], v: list(m[2]) })],
  [/^Each (\w+) with ([\w.]+)\.uom equal-to \(([^)]*)\) shall have ([\w.]+) equal-to '(\w+)'$/, (m) => ({ t: 'equom', c: m[1], p: m[2], u: list(m[3]), q: m[4], v: m[5] })],
  [/^Each (\w+) with ([\w.]+)\.uom equal-to \(([^)]*)\) shall have ([\w.]+) value expressed with 1, 2 or 3 digits$/, (m) => ({ t: 'digits', c: m[1], p: m[2], u: list(m[3]), n: 3 })],
  [/^It is prohibited that a Navaid with assigned type equal-to ' ?(\w+)' isComposedOf NavaidEquipment specialisation (\w+)$/, (m) => ({ t: 'navno', c: 'Navaid', v: m[1], e: m[2] })],
  [/^It is prohibited that a Navaid has type equal-to ' ?(\w+)' and not Navaid isComposedOf NavaidEquipment specialisation (\w+)$/, (m) => ({ t: 'navreq', c: 'Navaid', v: m[1], e: m[2] })],
  [/^It is obligatory that each ((?:\w+ specialisation )*\w+) with assigned ([\w.]+) value has \2 value resolved-into exactly one (?:\w+ )?(\w+)$/, (m) => ({ t: 'ref', c: lastClass(m[1]), p: m[2], to: m[3] })],
  [/^It is prohibited that an? ((?:\w+ specialisation )*\w+) with (?:assigned )?type equal-to ' ?(\w+)' and with ([\w.]+)\.uom equal-to ' ?(\w+)' has \3 value higher-than ([\d.]+)(?: \w+)?$/, (m) => ({ t: 'max', c: lastClass(m[1]), ty: m[2], p: m[3], u: m[4], max: +m[5] })],
  [/^It is prohibited that an? ((?:\w+ specialisation )*\w+) with ([\w.]+)\.uom equal-to ' ?(\w+)' has \2 value higher-than ([\d.]+)(?: \w+)?$/, (m) => ({ t: 'max', c: lastClass(m[1]), p: m[2], u: m[3], max: +m[4] })],
  [/^It is prohibited that an? ((?:\w+ specialisation )*\w+) with assigned (\w+) and ([\w.]+)\.uom equal-to ' ?(\w+)' has \3 value higher-than ([\d.]+)(?: \w+)?$/, (m) => ({ t: 'max', c: lastClass(m[1]), has: m[2], p: m[3], u: m[4], max: +m[5] })],
  [/^It is prohibited that an? ((?:\w+ specialisation )*\w+) with type equal-to ' ?(\w+)' and with assigned ([\w.]+) value and with \3\.uom equal-to ' ?(\w+)' has \3 value higher-than ([\d.]+)(?: \w+)?$/, (m) => ({ t: 'max', c: lastClass(m[1]), ty: m[2], p: m[3], u: m[4], max: +m[5] })],
  [/^It is prohibited that an? (\w+) has assigned ([\w.]+) value expressed with more than (\d+) decimals$/, (m) => ({ t: 'decimals', c: m[1], p: m[2], n: +m[3] })],
  [/^It is prohibited that an? (\w+) has assigned ([\w.]+) value$/, (m) => ({ t: 'forbid', c: m[1], p: m[2] })],
  [/^It is prohibited that an? (\w+) has assigned ([\w.]+) value equal-to (\(.*\)|'[^']*')$/, (m) => ({ t: 'forbidval', c: m[1], p: m[2], v: list(m[3]) })],
  [/^It is prohibited that an? (\w+) with ([\w.]+) equal-to \(([^)]*)\) has ([\w.]+) not equal-to \(([^)]*)\)$/, (m) => ({ t: 'allowed', c: m[1], w: m[2], wv: list(m[3]), p: m[4], v: list(m[5]) })],
  [/^It is prohibited that at least one (\w+)$/, (m) => ({ t: 'absent', c: m[1] })],
  [/^It is prohibited that an? (\w+)\[1\] has (\w+) equal-to \1\[2\]\.\2$/, (m) => ({ t: 'unique', c: m[1], p: m[2] })],
  [/^Each (\w+) shall not have descendant (\w+)$/, (m) => ({ t: 'nodesc', c: m[1], d: m[2] })],
  [/^It is prohibited that an? (\w+) has descendant more than one (\w+)$/, (m) => ({ t: 'maxdesc', c: m[1], d: m[2] })]
];

const out = [], stats = {};
rows.forEach((r) => {
  const text = norm(r['Rule textual description']);
  if (!text) return;
  const rule = { id: r.UID, ta: norm(r['Timeslice Applicability']), n: norm(r.Name), x: text, s: norm(r['Profile: EAD']) || 'Info', g: norm(r.Category), c: norm(r['AIXM Class']), src: norm(r.Source), ref: norm(r.Reference), d: norm(r.Diagnostics), cm: norm(r.Comments) };
  for (const [re, f] of P) { const m = re.exec(text); if (m) { rule.k = f(m); break; } }
  const key = rule.k ? rule.k.t : 'catalogue';
  stats[key] = (stats[key] || 0) + 1;
  out.push(rule);
});

// feature hierarchy: element substitution groups in the 5.1.1 schema
const xsd = fs.readFileSync(path.join(ROOT, 'schemas/5.1.1/AIXM_Features.xsd'), 'utf8');
const parent = {};
for (const m of xsd.matchAll(/<element name="(\w+)" type="aixm:\w+" (?:abstract="true" )?substitutionGroup="aixm:Abstract(\w+)"/g)) {
  if (/TimeSlice|Extension$/.test(m[1]) || m[2] === 'AIXMFeature' || m[2] === 'AIXMObject' || m[2] === 'Extension') continue;
  parent[m[1].replace(/^Abstract/, '')] = m[2];
}
fs.writeFileSync(path.join(ROOT, 'data/aixm_rules.json'), JSON.stringify({ source: 'AIXM 5.1 Business Rules (SBVR) v0.9 — aixm.aero', count: out.length, parent: parent, rules: out }));
console.log('rules', out.length, JSON.stringify(stats), 'hierarchy', Object.keys(parent).length, 'size', fs.statSync(path.join(ROOT, 'data/aixm_rules.json')).size);
