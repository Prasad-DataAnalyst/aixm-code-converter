// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Node harness: parse a file, finalize the model and print every AIP section as text.
// Usage: node tools/test_aip.js <file.xml> [sectionFilterRegex]
const { ctx, parse, vm } = require('./harness');

function printSection(sec, indent) {
  if (!sec) return;
  if (sec.group) { sec.group.forEach((g) => printSection(g, indent)); return; }
  console.log('\n' + indent + '=== ' + (sec.no || '') + ' ' + sec.title);
  (sec.blocks || []).forEach((b) => {
    if (b.title) console.log(indent + '  -- ' + b.title);
    if (b.kind === 'note') console.log(indent + '  ' + b.text);
    if (b.kind === 'kv') b.rows.forEach((r) => console.log(indent + '  ' + (r.no || ' ').padEnd(3) + r.label.padEnd(48).slice(0, 48) + ' | ' + r.cells.map((c) => c.t.replace(/\n/g, ' ⏎ ')).filter(Boolean).join(' ‖ ')));
    if (b.kind === 'table') {
      console.log(indent + '  [' + b.cols.join(' | ') + ']');
      b.rows.slice(0, +(process.env.MAXROWS || 12)).forEach((r) => console.log(indent + '   ' + r.map((c) => c.t.replace(/\n/g, ' ⏎ ')).join(' | ')));
      if (b.rows.length > (+(process.env.MAXROWS || 12))) console.log(indent + '   … ' + b.rows.length + ' rows');
      if (b.note) console.log(indent + '   note: ' + b.note);
    }
  });
}

(async () => {
  const ds = await parse(process.argv[2]);
  console.log('State:', ds.state, '(' + ds.stateSource + ')', '| version', ds.sniff.versionLabel, '| effective', ctx.MODEL.fmtDate(ds.effective), ds.effectiveSource, '| AIRAC', ds.airac && ds.airac.id, '| recs', ds.recs.length, '| finalize ms', ds.tFinalize);
  if (process.env.EVAL) { ctx.ds = ds; const out = await vm.runInContext('(async () => { ' + process.env.EVAL + ' })()', ctx); if (out !== undefined) console.log(typeof out === 'string' ? out : JSON.stringify(out, null, 1)); return; }
  const cat = ctx.AIP.catalogue(ds);
  const re = new RegExp(process.argv[3] || '.');
  cat.forEach((grp) => {
    console.log('\n########## ' + grp.title + ' — ' + grp.children.map((c) => c.no).join(', '));
    grp.children.forEach((c) => {
      if (c.children) {
        c.children.forEach((cc) => { if (re.test(cc.no) && (!process.env.AD || c.no.indexOf(process.env.AD) >= 0)) { try { printSection(cc.build(), '  '); } catch (e) { console.log('ERROR in', cc.no, e.stack); } } });
      } else if (re.test(c.no)) { try { printSection(c.build(), ''); } catch (e) { console.log('ERROR in', c.no, e.stack); } }
    });
  });
})();
