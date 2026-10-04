/* AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
 * SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
 *
 * Feedback to the creator: name and e-mail (required), organisation, position, subject, description and attachments.
 * The tool has no server, so "Send" hands a finished message to the user's own e-mail:
 *   computer          an e-mail file (.eml) addressed to the creator with the attachments inside; Outlook opens it
 *                     ready to send (other mail apps: the same message, or "Other ways" below)
 *   phone / tablet    with attachments: the device's share sheet (Gmail, Outlook, Mail…) with the files and the text;
 *                     without: the e-mail app opens with the creator's address, subject and text filled in
 * Other ways: open the e-mail app (mailto, text only), Gmail in the browser, or copy the text.
 * Name, e-mail, organisation and position are remembered in this browser for the next time.
 */
var FEEDBACK = (function () {
  'use strict';
  var TO = APP_INFO.email, MAX_FILES = 5, MAX_BYTES = 20 * 1024 * 1024, KEY = 'aixm-feedback-me';
  function esc(t) { return String(t === undefined || t === null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function size(n) { return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
  function validEmail(e) { return /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]{2,}$/.test(e); }
  function touch() { return typeof DEVICE !== 'undefined' && DEVICE.touch; }

  function techLines() {
    var dev = typeof DEVICE !== 'undefined' ? DEVICE.kind() : 'desktop';
    return ['Tool: ' + APP_INFO.name + ' ' + APP_INFO.version, 'Layout: ' + dev + ' · screen ' + screen.width + '×' + screen.height + ' · window ' + innerWidth + '×' + innerHeight,
      'Browser: ' + navigator.userAgent];
  }
  function compose(f) {
    var subj = (f.subject || 'Feedback') + ' — ' + APP_INFO.name;
    var who = [['Name', f.name], ['E-mail', f.email], ['Organisation', f.org], ['Position', f.pos]].filter(function (x) { return x[1]; });
    var text = 'Feedback for ' + APP_INFO.name + '\n\n' + who.map(function (x) { return x[0] + ': ' + x[1]; }).join('\n') +
      '\nSubject: ' + (f.subject || '—') + '\n\n' + (f.desc || '(no description)') +
      (f.files.length ? '\n\nAttachments: ' + f.files.map(function (x) { return x.name + ' (' + size(x.size) + ')'; }).join(', ') : '') +
      (f.tech ? '\n\n— Technical details —\n' + techLines().join('\n') : '');
    var html = '<div style="font:14px Segoe UI,Arial,sans-serif;color:#14202e"><h2 style="color:#0b2a4a;margin:0 0 10px">Feedback for ' + esc(APP_INFO.name) + '</h2>' +
      '<table style="border-collapse:collapse">' + who.concat([['Subject', f.subject || '—']]).map(function (x) { return '<tr><td style="padding:3px 14px 3px 0;color:#5b6b7f">' + esc(x[0]) + '</td><td style="padding:3px 0"><b>' + esc(x[1]) + '</b></td></tr>'; }).join('') + '</table>' +
      '<p style="white-space:pre-wrap;border-left:4px solid #b0186a;padding:6px 12px;background:#f6f8fb">' + esc(f.desc || '(no description)') + '</p>' +
      (f.tech ? '<p style="color:#5b6b7f;font-size:12px">' + techLines().map(esc).join('<br>') + '</p>' : '') + '</div>';
    return { subject: subj, text: text, html: html };
  }

  // ------------------------------------------------------------- e-mail file
  function b64bytes(u8) {
    var bin = '';
    for (var i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(bin).replace(/.{76}/g, '$&\r\n');
  }
  function b64(str) { return b64bytes(new TextEncoder().encode(str)); }
  function hdr(str) { return /^[\x20-\x7e]*$/.test(str) ? str : '=?UTF-8?B?' + b64(str).replace(/\r\n/g, '') + '?='; }
  async function emlBlob(f, m) {
    var mix = '=_mix_' + Math.random().toString(36).slice(2), alt = '=_alt_' + Math.random().toString(36).slice(2);
    var parts = ['X-Unsent: 1', 'To: ' + TO, 'Reply-To: ' + hdr(f.name) + ' <' + f.email + '>', 'Subject: ' + hdr(m.subject), 'MIME-Version: 1.0',
      'Content-Type: multipart/mixed; boundary="' + mix + '"', '', '--' + mix, 'Content-Type: multipart/alternative; boundary="' + alt + '"', '',
      '--' + alt, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64(m.text),
      '--' + alt, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64('<!doctype html><html><head><meta charset="utf-8"></head><body>' + m.html + '</body></html>'),
      '--' + alt + '--', ''].join('\r\n');
    var out = [parts];
    for (var i = 0; i < f.files.length; i++) {
      var file = f.files[i], data = new Uint8Array(await file.arrayBuffer()), nm = hdr(file.name).replace(/"/g, '');
      out.push('--' + mix + '\r\nContent-Type: ' + (file.type || 'application/octet-stream') + '; name="' + nm + '"\r\nContent-Transfer-Encoding: base64\r\nContent-Disposition: attachment; filename="' + nm + '"\r\n\r\n' + b64bytes(data) + '\r\n');
    }
    out.push('--' + mix + '--\r\n');
    return new Blob(out, { type: 'message/rfc822' });
  }
  function save(name, blob) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }
  function mailto(m, short) {
    var body = m.text.length > 1800 && short ? m.text.slice(0, 1800) + '\n…' : m.text;
    return 'mailto:' + TO + '?subject=' + encodeURIComponent(m.subject) + '&body=' + encodeURIComponent(body);
  }
  function gmail(m) { return 'https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(TO) + '&su=' + encodeURIComponent(m.subject) + '&body=' + encodeURIComponent(m.text.slice(0, 1800)); }

  // ------------------------------------------------------------------- form
  function open(toast) {
    toast = toast || function () {};
    var me = {};
    try { me = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { me = {}; }
    var files = [];
    var back = document.createElement('div');
    back.className = 'modal-back fb-back';
    var fld = function (id, label, req, attrs) {
      return '<label class="fb-f"><span>' + label + (req ? ' <b class="fb-req">*</b>' : '') + '</span><input class="inp" id="' + id + '"' + (attrs || '') + '><small class="fb-err" data-for="' + id + '"></small></label>';
    };
    back.innerHTML = '<div class="modal fb-modal" role="dialog" aria-label="Send feedback"><div class="modal-head"><h3>✉ Send feedback to the creator</h3><span class="sp"></span><button class="btn small ghost" data-fb="close" title="Close">✕</button></div>' +
      '<div class="modal-body"><p class="muted fb-intro">Suggestions, problems or questions about ' + esc(APP_INFO.name) + ' go to <b>' + esc(APP_INFO.author) + '</b> (' + esc(TO) + '). Fields marked <b class="fb-req">*</b> are required.</p>' +
      '<div class="fb-grid">' + fld('fb-name', 'Name', true, ' autocomplete="name" maxlength="120"') + fld('fb-email', 'E-mail', true, ' type="email" autocomplete="email" inputmode="email" maxlength="160"') +
      fld('fb-org', 'Organisation', false, ' autocomplete="organization" maxlength="160"') + fld('fb-pos', 'Position', false, ' autocomplete="organization-title" maxlength="120"') + '</div>' +
      fld('fb-subj', 'Subject', false, ' maxlength="160" placeholder="e.g. Suggestion for the AIP export"') +
      '<label class="fb-f"><span>Description</span><textarea class="inp fb-desc" id="fb-desc" rows="6" maxlength="20000" placeholder="Describe your feedback, the problem and how to see it, or your idea…"></textarea></label>' +
      '<div class="fb-f"><span>Attachments <small class="muted">(up to ' + MAX_FILES + ' files, ' + size(MAX_BYTES) + ' in total — screenshots, documents, a small AIXM extract…)</small></span>' +
      '<div class="fb-files" id="fb-files"></div><button class="btn small" type="button" data-fb="add">📎 Add files</button><input type="file" id="fb-file" multiple hidden></div>' +
      '<label class="fb-chk"><input type="checkbox" id="fb-tech" checked> Include technical details (tool version, browser, screen) — no AIXM data is included</label>' +
      '<div class="fb-done hidden" id="fb-done"></div></div>' +
      '<div class="modal-foot"><button class="btn ghost" data-fb="close">Cancel</button><button class="btn primary" data-fb="send">✉ Send</button></div></div>';
    document.body.appendChild(back);
    var q = function (s) { return back.querySelector(s); };
    q('#fb-name').value = me.name || ''; q('#fb-email').value = me.email || ''; q('#fb-org').value = me.org || ''; q('#fb-pos').value = me.pos || '';
    setTimeout(function () { (me.name ? q('#fb-subj') : q('#fb-name')).focus(); }, 30);

    function drawFiles() {
      var tot = files.reduce(function (n, f) { return n + f.size; }, 0);
      q('#fb-files').innerHTML = files.map(function (f, i) { return '<div class="fb-file"><span class="grow">📄 ' + esc(f.name) + ' <small class="muted">' + size(f.size) + '</small></span><button class="btn small ghost" type="button" data-rm="' + i + '" title="Remove">✕</button></div>'; }).join('') +
        (files.length ? '<small class="muted">' + files.length + ' file(s), ' + size(tot) + '</small>' : '');
    }
    q('#fb-file').addEventListener('change', function (e) {
      Array.prototype.forEach.call(e.target.files, function (f) {
        var tot = files.reduce(function (n, x) { return n + x.size; }, 0);
        if (files.length >= MAX_FILES) toast('Up to ' + MAX_FILES + ' attachments');
        else if (tot + f.size > MAX_BYTES) toast(f.name + ' is too large: attachments are limited to ' + size(MAX_BYTES) + ' in total (e-mail limit)');
        else files.push(f);
      });
      e.target.value = ''; drawFiles();
    });
    function read() {
      return { name: q('#fb-name').value.trim(), email: q('#fb-email').value.trim(), org: q('#fb-org').value.trim(), pos: q('#fb-pos').value.trim(),
        subject: q('#fb-subj').value.trim(), desc: q('#fb-desc').value.trim(), tech: q('#fb-tech').checked, files: files.slice() };
    }
    function check(f) {
      var errs = { 'fb-name': f.name ? '' : 'Please enter your name', 'fb-email': !f.email ? 'Please enter your e-mail address' : validEmail(f.email) ? '' : 'This e-mail address does not look right' };
      var ok = true;
      Object.keys(errs).forEach(function (id) {
        q('[data-for="' + id + '"]').textContent = errs[id];
        q('#' + id).classList.toggle('fb-bad', !!errs[id]);
        if (errs[id] && ok) { q('#' + id).focus(); ok = false; }
      });
      return ok;
    }
    function done(html) { var d = q('#fb-done'); d.innerHTML = html; d.classList.remove('hidden'); d.scrollIntoView({ block: 'nearest' }); }
    async function send() {
      var f = read();
      if (!check(f)) return;
      try { localStorage.setItem(KEY, JSON.stringify({ name: f.name, email: f.email, org: f.org, pos: f.pos })); } catch (e) { /* storage blocked */ }
      var m = compose(f), other = '<div class="fb-other">Other ways: <a href="' + esc(mailto(m, true)) + '">e-mail app</a> · <a href="' + esc(gmail(m)) + '" target="_blank" rel="noopener">Gmail</a> · <a href="#" data-fb="copy">copy the text</a>' +
        (f.files.length ? ' — then attach your file(s) yourself' : '') + ' · address: <b>' + esc(TO) + '</b></div>';
      if (touch()) {
        if (f.files.length && navigator.canShare && navigator.canShare({ files: f.files })) {
          try { await navigator.clipboard.writeText(TO); } catch (e) { /* clipboard blocked */ }
          try {
            await navigator.share({ title: m.subject, text: 'To: ' + TO + '\n\n' + m.text, files: f.files });
            done('<b>✓ Choose your e-mail app and send.</b> Put <b>' + esc(TO) + '</b> in "To" (it is copied — paste it).' + other);
          } catch (e) { if (e && e.name !== 'AbortError') done('Sharing is not available here.' + other); }
          return;
        }
        location.href = mailto(m, false);
        done('<b>✓ Your e-mail app opens with the message.</b> Press Send there.' + (f.files.length ? ' This device cannot share files from a web page: attach your file(s) in the e-mail app.' : '') + other);
        return;
      }
      var blob = await emlBlob(f, m);
      save('Feedback_' + APP_INFO.name.replace(/\W+/g, '_') + '.eml', blob);
      done('<b>✓ E-mail ready:</b> open the downloaded file <b>Feedback_…eml</b> — Outlook shows it addressed to ' + esc(TO) + ' with ' +
        (f.files.length ? 'your ' + f.files.length + ' attachment(s)' : 'your message') + '; press <b>Send</b>.' + other);
    }
    back.addEventListener('click', function (e) {
      if (e.target === back) { back.remove(); return; }
      var rm = e.target.closest('[data-rm]');
      if (rm) { files.splice(+rm.getAttribute('data-rm'), 1); drawFiles(); return; }
      var b = e.target.closest('[data-fb]');
      if (!b) return;
      var a = b.getAttribute('data-fb');
      if (a === 'close') back.remove();
      else if (a === 'add') q('#fb-file').click();
      else if (a === 'send') send().catch(function (err) { done('Could not prepare the e-mail: ' + esc(err.message)); });
      else if (a === 'copy') { e.preventDefault(); var t = 'To: ' + TO + '\n' + compose(read()).text; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { toast('Copied — paste it into an e-mail to ' + TO); }, function () { toast('Copy failed'); }); }
    });
    back.addEventListener('input', function (e) { if (e.target.classList.contains('fb-bad')) { e.target.classList.remove('fb-bad'); var er = q('[data-for="' + e.target.id + '"]'); if (er) er.textContent = ''; } });
    return back;
  }
  return { open: open, compose: compose, emlBlob: emlBlob, validEmail: validEmail };
})();
