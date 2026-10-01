/*!
 * AIXM Code Converter - exports: JSON, Excel (.xlsx), PDF, print, e-mail
 * Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com> - author of the AIXM Code Converter
 * SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE; keep this notice in all copies)
 * ==========================================================================
 * AIXM Code Converter - exports: JSON, Excel (.xlsx), PDF, print, e-mail
 * A "scope" is {title, sub, ds, sections:[section], features?:[rec], mapImage?}
 * where each section is the structure produced by AIP.build (or converted
 * analysis results). Everything runs locally in the browser.
 * ========================================================================== */
/* global XLSX, jspdf, AX, MODEL, AIP */
var EXPORTS = (function () {
  'use strict';
  var M = MODEL;
  var APP = 'AIXM Code Converter';
  // Author credit written into every exported file (Apache-2.0 NOTICE: must be kept by redistributors)
  var AUTHOR = APP_INFO.author, AUTHOR_EMAIL = APP_INFO.email;
  var CREDIT = APP + ' ' + APP_INFO.version + ' - (c) ' + APP_INFO.year + ' ' + AUTHOR + ' <' + AUTHOR_EMAIL + '>';

  function flatSections(list) {
    var out = [];
    (list || []).forEach(function (s) { if (!s) return; if (s.group) out = out.concat(flatSections(s.group)); else out.push(s); });
    return out;
  }
  function safeName(t) { return String(t || 'aixm').replace(/[\u2013\u2014\u2192\u21c6]/g, '-').replace(/[\\/:*?"<>|]+/g, '_').replace(/[^\x20-\x7e]/g, '').replace(/\s+/g, '_').replace(/_+/g, '_').slice(0, 120) || 'aixm'; }
  function download(name, blob) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  function esc(t) { return String(t === undefined || t === null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function metaLines(ds) {
    if (!ds) return [];
    return [
      ['State', ds.state],
      ['Source file', ds.name + ' (' + fmtSize(ds.size) + ')'],
      ['AIXM version', (ds.sniff && ds.sniff.versionLabel) || ds.version],
      ['AIRAC cycle', ds.airac ? ds.airac.id + ' (cycle effective ' + M.fmtDate(ds.airac.date) + ')' : '—'],
      ['Effective date', ds.effective !== null ? M.fmtDate(ds.effective, true) + ' — ' + ds.effectiveSource : '—'],
      ['Data shown', ds.viewDate === null || ds.viewDate === undefined ? 'Latest time slices' : 'Valid on ' + M.fmtDate(ds.viewDate, true)]
    ];
  }
  function fmtSize(n) { return n > 1 << 30 ? (n / (1 << 30)).toFixed(2) + ' GB' : n > 1 << 20 ? (n / (1 << 20)).toFixed(1) + ' MB' : (n / 1024).toFixed(0) + ' KB'; }
  function srcOf(cell) {
    var r = cell && cell.r;
    if (!r) return null;
    return { feature: r.k, id: r.id, line: r.line, byteOffset: r.o, property: cell.p || undefined };
  }
  function effOf(r) { return r && r.cur && r.cur.b ? M.fmtTs(r.cur.b) : ''; }
  function blockRows(b) { // uniform text rows for a block (+ effective date of the source feature)
    if (b.kind === 'kv') {
      var kr = b.rows.map(function (r) { var c = r.cells.filter(function (x) { return x.r; })[0]; return c ? c.r : null; });
      return { cols: ['No', 'Item', 'Value', 'Effective from'], rows: b.rows.map(function (r, i) { return [r.no || '', r.label, r.cells.map(function (c) { return c.t; }).filter(Boolean).join('\n'), effOf(kr[i])]; }), recs: kr };
    }
    if (b.kind === 'table') {
      var tr = b.rows.map(function (r) { var c = r.filter(function (x) { return x.r; })[0]; return c ? c.r : null; });
      var hasSrc = tr.some(Boolean);
      return { cols: hasSrc ? b.cols.concat(['Effective from']) : b.cols, rows: b.rows.map(function (r, i) { var t = r.map(function (c) { return c.t; }); return hasSrc ? t.concat([effOf(tr[i])]) : t; }), recs: tr };
    }
    return { cols: ['Note'], rows: [[b.text]], recs: [null] };
  }
  function secTitle(s) { return [s.no, s.code, s.title].filter(Boolean).join(' '); }

  /* ------------------------------------------------------------------ JSON */
  function toJSON(scope) {
    var ds = scope.ds;
    var out = {
      generator: APP, generatorAuthor: AUTHOR, generatorAuthorEmail: AUTHOR_EMAIL, generatorLicense: 'Apache-2.0', generatorCredit: CREDIT,
      generatedAt: new Date().toISOString(), title: scope.title,
      dataset: ds ? { state: ds.state, stateSource: ds.stateSource, file: ds.name, sizeBytes: ds.size, aixmVersion: (ds.sniff && ds.sniff.versionLabel) || ds.version,
        airacCycle: ds.airac ? ds.airac.id : null, airacCycleDate: ds.airac ? new Date(ds.airac.date).toISOString().slice(0, 10) : null,
        effectiveDate: ds.effective !== null ? new Date(ds.effective).toISOString() : null, effectiveSource: ds.effectiveSource,
        dataShown: ds.viewDate === null || ds.viewDate === undefined ? 'latest' : new Date(ds.viewDate).toISOString(), featureCount: ds.recs.length } : null,
      sections: flatSections(scope.sections).map(function (s) {
        return { section: s.no, aerodrome: s.code || undefined, title: s.title, blocks: (s.blocks || []).map(function (b) {
          if (b.kind === 'kv') return { type: 'items', title: b.title || undefined, items: b.rows.map(function (r) { return { no: r.no || undefined, item: r.label, values: r.cells.filter(function (c) { return c.t; }).map(function (c) { return { text: c.t, source: srcOf(c) }; }) }; }) };
          if (b.kind === 'table') return { type: 'table', title: b.title || undefined, columns: b.cols, note: b.note || undefined, rows: b.rows.map(function (r) { return r.map(function (c) { return c.r ? { text: c.t, source: srcOf(c) } : c.t; }); }) };
          if (b.kind === 'chart') return { type: 'chart', title: b.title || undefined, text: b.text };
          return { type: 'note', text: b.text };
        }) };
      })
    };
    return out;
  }
  function exportJSON(scope) {
    var parts = [];
    var obj = toJSON(scope);
    if (scope.features && scope.features.length) {
      // stream very large feature lists in pieces to avoid one giant string
      var head = JSON.stringify(obj, null, 1);
      parts.push(head.slice(0, -2) + ',\n "features": [\n');
      var ds = scope.ds;
      for (var i = 0; i < scope.features.length; i += 2000) {
        var chunk = scope.features.slice(i, i + 2000).map(function (r) {
          var sec = AIP.sectionOf(ds, r);
          return JSON.stringify({ type: r.k, aixm45: r.s45 || undefined, id: r.id, label: M.label(ds, r), aipSection: sec.no + (sec.ad ? ' ' + M.shortName(sec.ad) : ''),
            validFrom: r.cur.b, validTo: r.cur.e, interpretation: r.cur.i, sequence: r.cur.s, correction: r.cur.c, timeSlices: r.ts.length,
            source: { line: r.line, byteOffset: r.o, byteLength: r.n }, properties: r.cur.p });
        });
        parts.push((i ? ',\n' : '') + chunk.join(',\n'));
      }
      parts.push('\n ]\n}\n');
    } else parts.push(JSON.stringify(obj, null, 1));
    download(safeName(scope.title) + '.json', new Blob(parts, { type: 'application/json' }));
  }

  /* ----------------------------------------------------------------- Excel */
  function exportExcel(scope) {
    var wb = XLSX.utils.book_new(), used = {};
    function sheetName(t) {
      var n = String(t).replace(/[\\/?*[\]:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 28) || 'Sheet';
      var base = n, i = 2;
      while (used[n.toLowerCase()]) n = base.slice(0, 26) + '~' + i++;
      used[n.toLowerCase()] = 1;
      return n;
    }
    var info = [[APP + ' — export'], [scope.title], []].concat(metaLines(scope.ds)).concat([[], ['Generated', new Date().toISOString()], ['Note', 'Column "AIXM line" gives the line number of the source feature in the AIXM file.']]);
    var wsI = XLSX.utils.aoa_to_sheet(info);
    wsI['!cols'] = [{ wch: 18 }, { wch: 90 }];
    XLSX.utils.book_append_sheet(wb, wsI, sheetName('Info'));
    var MAXR = 1000000;
    flatSections(scope.sections).forEach(function (s) {
      var blocks = s.blocks || [];
      var aoa = [];
      var single = blocks.length === 1 && blocks[0].kind === 'table';
      blocks.forEach(function (b, bi) {
        var br = blockRows(b);
        if (b.title) aoa.push([b.title]);
        aoa.push(br.cols.concat(['AIXM line']));
        br.rows.forEach(function (r, i) { aoa.push(r.concat([br.recs[i] ? br.recs[i].line : ''])); });
        if (b.note) aoa.push(['Note: ' + b.note]);
        if (bi < blocks.length - 1) aoa.push([]);
      });
      if (!aoa.length) aoa.push(['NIL']);
      var title = [s.no, s.code].filter(Boolean).join(' ') || s.title;
      for (var part = 0; part * MAXR < aoa.length; part++) {
        var chunk = aoa.slice(part * MAXR, (part + 1) * MAXR);
        if (part > 0 && single) chunk.unshift(aoa[0]);
        var ws = XLSX.utils.aoa_to_sheet(chunk);
        var ncol = Math.max.apply(null, chunk.map(function (r) { return r.length; }));
        ws['!cols'] = [];
        for (var c = 0; c < ncol; c++) ws['!cols'].push({ wch: c === 0 ? 16 : 28 });
        XLSX.utils.book_append_sheet(wb, ws, sheetName(title + (part ? ' (' + (part + 1) + ')' : '')));
      }
    });
    if (scope.features && scope.features.length) {
      var ds = scope.ds, byType = {};
      scope.features.forEach(function (r) { (byType[r.k] || (byType[r.k] = [])).push(r); });
      Object.keys(byType).sort().forEach(function (k) {
        var list = byType[k], cols = {}, rows = [];
        list.forEach(function (r) {
          var f = AX.flatten(r.cur.p), o = {};
          for (var key in f) {
            var top = key.split('/')[0].replace(/\[\d+\]/, '');
            if (Object.keys(cols).length < 60 || cols[top]) { cols[top] = 1; o[top] = o[top] ? o[top] + '; ' + f[key] : f[key]; }
          }
          rows.push(o);
        });
        var colList = Object.keys(cols);
        var aoa = [['Label', 'UUID / key', 'Valid from', 'Valid to', 'AIXM line'].concat(colList)];
        list.forEach(function (r, i) {
          aoa.push([M.label(ds, r), r.id, r.cur.b || '', r.cur.e || '', r.line].concat(colList.map(function (c) { var v = rows[i][c] || ''; return v.length > 32000 ? v.slice(0, 32000) : v; })));
        });
        for (var part = 0; part * MAXR < aoa.length; part++) {
          var chunk = aoa.slice(part * MAXR, (part + 1) * MAXR);
          if (part) chunk.unshift(aoa[0]);
          XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(chunk), sheetName('F ' + k + (part ? ' ' + (part + 1) : '')));
        }
      });
    }
    wb.Props = { Title: String(scope.title || APP), Subject: String(scope.sub || ''), Author: AUTHOR + ' <' + AUTHOR_EMAIL + '>', Company: APP, Comments: CREDIT, CreatedDate: new Date() };
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[APP], ['Author', AUTHOR], ['E-mail', AUTHOR_EMAIL], ['Licence', 'Apache-2.0'], ['Generated', new Date().toISOString()], ['Title', String(scope.title || '')]]), sheetName('About'));
    XLSX.writeFile(wb, safeName(scope.title) + '.xlsx', { compression: true });
  }

  /* ------------------------------------------------------------------- PDF */
  var WIN = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
  function pdfText(t) {
    return String(t === undefined || t === null ? '' : t).replace(/→/g, '->').replace(/[▲►]/g, '>').replace(/⏎/g, ' ').replace(/[‑‒]/g, '-').replace(/ | /g, ' ')
      .replace(/[^\x00-\xff]/g, function (ch) { return WIN.indexOf(ch) >= 0 ? ch : '?'; });
  }
  function exportPDF(scope, opt) {
    opt = opt || {};
    var secs = flatSections(scope.sections);
    var wide = secs.some(function (s) { return (s.blocks || []).some(function (b) { return b.kind === 'table' && b.cols.length > 6; }); });
    var doc = new jspdf.jsPDF({ orientation: wide ? 'landscape' : 'portrait', unit: 'mm', format: 'a4', compress: true });
    doc.setProperties({ title: pdfText(scope.title || APP), subject: pdfText(scope.sub || ''), author: AUTHOR + ' <' + AUTHOR_EMAIL + '>', creator: CREDIT, keywords: 'AIXM, AIP, ' + APP });
    var W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    var ds = scope.ds;
    var head = pdfText([ds ? ds.state + ' AIP DATA' : APP, ds && ds.airac ? 'AIRAC ' + ds.airac.id : ''].filter(Boolean).join('  •  '));
    var foot = pdfText((ds ? ds.name : 'AIXM data') + ' - ' + new Date().toISOString().slice(0, 16).replace('T', ' ') + 'Z');
    var credit = pdfText(APP + ' (c) 2026 ' + AUTHOR + ' - ' + AUTHOR_EMAIL);
    var BR = [11, 42, 74];
    function decorate() {
      var n = doc.internal.getNumberOfPages();
      for (var i = 1; i <= n; i++) {
        doc.setPage(i);
        doc.setFillColor(BR[0], BR[1], BR[2]); doc.rect(0, 0, W, 9, 'F');
        doc.setTextColor(255, 255, 255); doc.setFontSize(8.5); doc.setFont('helvetica', 'bold');
        doc.text(head, 10, 6);
        doc.text(pdfText(scope.title).slice(0, 110), W - 10, 6, { align: 'right' });
        doc.setTextColor(110, 100, 105); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
        doc.text(foot, 10, H - 5);
        doc.text(credit, W / 2, H - 5, { align: 'center' });
        doc.text('Page ' + i + ' / ' + n, W - 10, H - 5, { align: 'right' });
      }
    }
    var y = 16;
    // title page block
    doc.setTextColor(BR[0], BR[1], BR[2]); doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
    doc.text(pdfText(scope.title), 10, y + 4); y += 10;
    if (scope.sub) { doc.setFontSize(10); doc.setTextColor(90, 80, 85); doc.setFont('helvetica', 'normal'); doc.text(pdfText(scope.sub), 10, y); y += 6; }
    if (ds) {
      doc.autoTable({ startY: y, body: metaLines(ds).map(function (l) { return [pdfText(l[0]), pdfText(l[1])]; }), theme: 'plain', styles: { fontSize: 8.5, cellPadding: 1.2 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 38, textColor: [90, 80, 85] } }, margin: { left: 10, right: 10 } });
      y = doc.lastAutoTable.finalY + 4;
    }
    if (scope.mapImage) {
      var iw = W - 20, ih = Math.min(iw * 0.62, H - y - 20);
      doc.addImage(scope.mapImage, 'PNG', 10, y, ih / 0.62, ih);
      y += ih + 6;
    }
    var MAXROWS = opt.maxRows || APP_SETTINGS.pdfMaxRows;
    secs.forEach(function (s, si) {
      if (y > H - 30) { doc.addPage(); y = 16; }
      doc.setTextColor(BR[0], BR[1], BR[2]); doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
      doc.text(pdfText(secTitle(s)), 10, y + 4, { maxWidth: W - 20 });
      y += 8;
      (s.blocks || []).forEach(function (b) {
        if (y > H - 24) { doc.addPage(); y = 16; }
        if (b.title) { doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(122, 16, 67); doc.text(pdfText(b.title), 10, y + 3); y += 5; }
        if (b.kind === 'note') {
          doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(60, 60, 60);
          var lines = doc.splitTextToSize(pdfText(b.text), W - 20); doc.text(lines, 10, y + 3); y += lines.length * 4 + 3; return;
        }
        var br = blockRows(b), rows = br.rows;
        var trunc = rows.length > MAXROWS;
        if (trunc) rows = rows.slice(0, MAXROWS);
        var kvStyles = b.kind === 'kv' ? { 0: { cellWidth: 9, textColor: [120, 110, 115] }, 1: { cellWidth: wide ? 70 : 52, textColor: [90, 80, 85] }, 3: { cellWidth: 26, textColor: [120, 110, 115], fontSize: 7 } } : {};
        doc.autoTable({
          startY: y, head: [br.cols.map(pdfText)], body: rows.map(function (r) { return r.map(pdfText); }),
          theme: 'grid', margin: { left: 10, right: 10, top: 14 },
          styles: { fontSize: br.cols.length > 10 ? 6.2 : br.cols.length > 6 ? 7 : 8, cellPadding: 1.3, overflow: 'linebreak', lineColor: [195, 204, 216], lineWidth: 0.15, valign: 'top' },
          headStyles: { fillColor: [230, 237, 245], textColor: [6, 26, 51], fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [248, 250, 252] }, columnStyles: kvStyles,
          showHead: b.kind === 'kv' ? 'never' : 'everyPage'
        });
        y = doc.lastAutoTable.finalY + 4;
        if (trunc || b.note) {
          doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(90, 80, 85);
          var n2 = doc.splitTextToSize(pdfText((b.note ? 'Note: ' + b.note + ' ' : '') + (trunc ? '(' + (br.rows.length - MAXROWS) + ' more rows not printed — use Excel/JSON export for the complete list.)' : '')), W - 20);
          doc.text(n2, 10, y + 2); y += n2.length * 3.6 + 3;
        }
      });
      if (opt.pageBreak && si < secs.length - 1) { doc.addPage(); y = 16; }
      else y += 3;
    });
    decorate();
    doc.save(safeName(scope.title) + '.pdf');
  }

  /* ----------------------------------------------------------------- print */
  function sectionsHtml(secs, maxRows, inline) {
    var st = inline ? {
      h2: 'style="font:600 15px Segoe UI,Arial,sans-serif;color:#0b2a4a;margin:18px 0 6px"',
      h3: 'style="font:600 13px Segoe UI,Arial,sans-serif;color:#1d4e89;margin:10px 0 4px"',
      table: 'style="border-collapse:collapse;width:100%;font:12px Segoe UI,Arial,sans-serif;margin-bottom:10px" border="1" cellpadding="4"',
      th: 'style="background:#e6edf5;color:#061a33;text-align:left;border:1px solid #c3ccd8;padding:4px 6px;vertical-align:bottom"',
      td: 'style="border:1px solid #d9ced4;padding:4px 6px;vertical-align:top;white-space:pre-wrap"',
      tdl: 'style="border:1px solid #d9ced4;padding:4px 6px;vertical-align:top;color:#6d6268;background:#faf6f8;width:32%"',
      note: 'style="font:italic 12px Segoe UI,Arial,sans-serif;color:#555;margin:4px 0 10px"'
    } : { h2: '', h3: '', table: '', th: '', td: '', tdl: '', note: 'class="note"' };
    var h = '';
    secs.forEach(function (s) {
      h += '<h2 ' + st.h2 + '>' + esc(secTitle(s)) + '</h2>';
      (s.blocks || []).forEach(function (b) {
        if (b.title) h += '<h3 ' + st.h3 + '>' + esc(b.title) + '</h3>';
        if (b.kind === 'note') { h += '<p ' + st.note + '>' + esc(b.text) + '</p>'; return; }
        if (b.kind === 'chart') { h += b.svg; return; }
        var br = blockRows(b), rows = br.rows, trunc = maxRows && rows.length > maxRows;
        if (trunc) rows = rows.slice(0, maxRows);
        h += '<table ' + st.table + '>';
        if (b.kind === 'table') h += '<thead><tr>' + br.cols.map(function (c) { return '<th ' + st.th + '>' + esc(c) + '</th>'; }).join('') + '</tr></thead>';
        h += '<tbody>' + rows.map(function (r) {
          return '<tr>' + r.map(function (c, i) { return '<td ' + (b.kind === 'kv' && i < 2 ? st.tdl : st.td) + '>' + esc(c).replace(/\n/g, '<br>') + '</td>'; }).join('') + '</tr>';
        }).join('') + '</tbody></table>';
        if (trunc) h += '<p ' + st.note + '>… ' + (br.rows.length - maxRows) + ' more rows (see attached export for the full list)</p>';
        if (b.note) h += '<p ' + st.note + '>Note: ' + esc(b.note) + '</p>';
      });
    });
    return h;
  }
  function print(scope) {
    var root = document.getElementById('print-root');
    var ds = scope.ds;
    var h = '<div class="p-head"><div><b>' + esc(ds ? ds.state : APP) + '</b> — ' + esc(scope.title) + '</div><div>' + esc(ds && ds.airac ? 'AIRAC ' + ds.airac.id : '') + '</div></div>';
    if (ds) h += '<table>' + metaLines(ds).map(function (l) { return '<tr><td style="width:30%"><b>' + esc(l[0]) + '</b></td><td>' + esc(l[1]) + '</td></tr>'; }).join('') + '</table>';
    if (scope.mapImage) h += '<img src="' + scope.mapImage + '" style="width:100%;max-height:120mm;object-fit:contain;margin:6px 0">';
    h += sectionsHtml(flatSections(scope.sections), 20000, false);
    h += '<div class="p-foot">Generated by ' + APP + ' (© 2026 ' + AUTHOR + ', ' + AUTHOR_EMAIL + ') from ' + esc(ds ? ds.name : '') + ' — ' + new Date().toISOString().slice(0, 16).replace('T', ' ') + 'Z</div>';
    root.innerHTML = h;
    setTimeout(function () { window.print(); }, 60);
  }

  /* ----------------------------------------------------------------- email */
  function emailContent(scope, opt) {
    opt = opt || {};
    var ds = scope.ds;
    var subject = [ 'AIXM data', ds && String(scope.title).indexOf(ds.state) < 0 ? ds.state : '', scope.title, ds && ds.airac ? 'AIRAC ' + ds.airac.id : '' ].filter(Boolean).join(' — ');
    var meta = metaLines(ds);
    var intro = opt.intro || 'Please find below the aeronautical data extracted from the AIXM file.';
    var html = '<div style="font:14px Segoe UI,Arial,sans-serif;color:#222;max-width:1000px">' +
      '<div style="background:#0b2a4a;color:#fff;padding:12px 16px;border-radius:8px 8px 0 0"><div style="font-size:17px;font-weight:700">' + esc(scope.title) + '</div>' +
      '<div style="font-size:12.5px;opacity:.9">' + esc(ds ? ds.state : '') + (ds && ds.airac ? ' · AIRAC ' + esc(ds.airac.id) : '') + '</div></div>' +
      '<div style="border:1px solid #e5dde2;border-top:0;padding:14px 16px;border-radius:0 0 8px 8px">' +
      '<p style="margin:0 0 10px">' + esc(intro) + '</p>' +
      '<table style="border-collapse:collapse;font:13px Segoe UI,Arial,sans-serif;margin-bottom:10px">' + meta.map(function (l) {
        return '<tr><td style="padding:2px 12px 2px 0;color:#6d6268"><b>' + esc(l[0]) + '</b></td><td style="padding:2px 0">' + esc(l[1]) + '</td></tr>';
      }).join('') + '</table>' +
      sectionsHtml(flatSections(scope.sections), opt.maxRows || 300, true) +
      '<p style="font-size:11.5px;color:#777;margin-top:16px">Generated by ' + APP + ' (© 2026 ' + AUTHOR + ', ' + AUTHOR_EMAIL + ') on ' + new Date().toISOString().slice(0, 16).replace('T', ' ') + 'Z. Source file: ' + esc(ds ? ds.name : '') + '</p></div></div>';
    var text = subject + '\n\n' + intro + '\n\n' + meta.map(function (l) { return l[0] + ': ' + l[1]; }).join('\n') + '\n\n' +
      flatSections(scope.sections).map(function (s) {
        return secTitle(s) + '\n' + (s.blocks || []).map(function (b) {
          var br = blockRows(b);
          return (b.title ? b.title + '\n' : '') + (b.kind === 'table' ? br.cols.join(' | ') + '\n' : '') + br.rows.slice(0, opt.maxRows || 300).map(function (r) { return r.join(' | ').replace(/\n/g, ' / '); }).join('\n');
        }).join('\n\n');
      }).join('\n\n') + '\n\n— Generated by ' + APP + ' (© 2026 ' + AUTHOR + ', ' + AUTHOR_EMAIL + ')';
    return { subject: subject, html: html, text: text };
  }
  function b64(str) {
    var bytes = new TextEncoder().encode(str), bin = '';
    for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin).replace(/.{76}/g, '$&\r\n');
  }
  function emlBlob(mail) {
    var bnd = '=_aixm_' + Math.random().toString(36).slice(2);
    var eml = 'X-Unsent: 1\r\nSubject: =?UTF-8?B?' + b64(mail.subject).replace(/\r\n/g, '') + '?=\r\nMIME-Version: 1.0\r\nContent-Type: multipart/alternative; boundary="' + bnd + '"\r\n\r\n' +
      '--' + bnd + '\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n' + b64(mail.text) + '\r\n' +
      '--' + bnd + '\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n' + b64('<!doctype html><html><head><meta charset="utf-8"><title>' + esc(mail.subject) + '</title></head><body>' + mail.html + '</body></html>') + '\r\n' +
      '--' + bnd + '--\r\n';
    return new Blob([eml], { type: 'message/rfc822' });
  }
  async function copyRich(html, text) {
    try {
      if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
        await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
        return true;
      }
    } catch (e) { /* fall back below */ }
    var div = document.createElement('div');
    div.contentEditable = 'true';
    div.style.cssText = 'position:fixed;left:-9999px;top:0;background:#fff;color:#000';
    div.innerHTML = html;
    document.body.appendChild(div);
    var range = document.createRange(); range.selectNodeContents(div);
    var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
    sel.removeAllRanges(); div.remove();
    return ok;
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) {
      var ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;left:-9999px'; document.body.appendChild(ta); ta.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch (e2) { ok = false; } ta.remove(); return ok;
    }
  }

  return { CREDIT: CREDIT, AUTHOR: AUTHOR, AUTHOR_EMAIL: AUTHOR_EMAIL, exportJSON: exportJSON, exportExcel: exportExcel, exportPDF: exportPDF, print: print, emailContent: emailContent, emlBlob: emlBlob, copyRich: copyRich, copyText: copyText,
    download: download, safeName: safeName, flatSections: flatSections, fmtSize: fmtSize, toJSON: toJSON, blockRows: blockRows, secTitle: secTitle };
})();
