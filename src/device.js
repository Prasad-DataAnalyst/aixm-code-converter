/* AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
 * SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
 *
 * Device layout. Runs first, before the page is drawn, and writes the result on the page root:
 *   <html data-device="desktop | tablet | phone" data-orient="portrait | landscape">
 * Every phone and tablet style is scoped to these attributes, so the desktop layout gets no new rules.
 *
 *   desktop  a mouse or trackpad is the main pointer — any computer, at any window size (also touch-screen laptops)
 *   tablet   a touch device with a large screen: iPad, Android tablets
 *   phone    a touch device with a small screen: iPhone, Android phones (also an iPad split-screen window
 *            narrower than 600 px)
 *
 * A device is a touch device when the browser says so: the user agent names it (iPhone, iPad, Android…; an iPad
 * asking for the desktop site reports a Mac with a touch screen), or its main pointer is a finger (CSS
 * "pointer: coarse" and no hover). Phone or tablet then follows from the window size, checked again on rotation.
 * Override: add ?layout=phone, tablet, desktop or auto to the address, or use "Layout" in the page footer (remembered).
 */
var DEVICE = (function () {
  'use strict';
  var KEY = 'aixm-layout', KINDS = /^(phone|tablet|desktop)$/, root = document.documentElement, subs = [];
  function mq(q) { return !!(window.matchMedia && window.matchMedia(q).matches); }
  function store(v) { try { if (KINDS.test(v)) localStorage.setItem(KEY, v); else localStorage.removeItem(KEY); } catch (e) { /* storage blocked */ } }
  function chosen() {
    try { var v = localStorage.getItem(KEY); return KINDS.test(v) ? v : ''; } catch (e) { return ''; }
  }
  var asked = /[?&]layout=(phone|tablet|desktop|auto)\b/.exec(location.search || '');
  if (asked) store(asked[1]);

  var ua = navigator.userAgent || '', points = navigator.maxTouchPoints || 0;
  var touch = /iPhone|iPod|iPad|Android|Mobi|Silk|Kindle|Tablet|Windows Phone/i.test(ua) ||
    (/Macintosh/.test(ua) && points > 1) ||
    (points > 0 && mq('(pointer: coarse)') && mq('(hover: none)'));

  function detect() {
    var c = chosen();
    if (c) return c;
    if (!touch) return 'desktop';
    var w = window.innerWidth, h = window.innerHeight;
    return w < 600 || (h < 500 && w < 1000) ? 'phone' : 'tablet';
  }
  function apply() {
    var k = detect(), was = root.getAttribute('data-device');
    root.setAttribute('data-device', k);
    root.setAttribute('data-orient', window.innerWidth > window.innerHeight ? 'landscape' : 'portrait');
    if (was && was !== k) subs.forEach(function (fn) { fn(k); });
  }
  apply();
  var t = 0;
  window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(apply, 120); });
  window.addEventListener('orientationchange', function () { setTimeout(apply, 250); });

  function kind() { return root.getAttribute('data-device') || 'desktop'; }
  return {
    touch: touch,                       // a phone or tablet, whatever layout is chosen
    kind: kind,
    isDesktop: function () { return kind() === 'desktop'; },
    isPhone: function () { return kind() === 'phone'; },
    isTablet: function () { return kind() === 'tablet'; },
    portrait: function () { return root.getAttribute('data-orient') === 'portrait'; },
    chosen: chosen,                     // '' = automatic
    choose: function (v) { store(v); apply(); },
    onChange: function (fn) { subs.push(fn); }
  };
})();
