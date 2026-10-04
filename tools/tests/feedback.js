// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Feedback form: opens from the footer and the About page, name and e-mail are required (and the e-mail checked),
// "Send" on a computer gives an e-mail file addressed to the creator with every field and the attachments inside;
// the person's details are remembered; the form fits a phone screen.
const fs = require('fs');
const path = require('path');
const env = require('./_env');
const ROOT = env.ROOT, OUT = env.out('feedback');

(async () => {
  const browser = await env.playwright.chromium.launch({ executablePath: env.chrome });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [], fails = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + ROOT + '/AIXM-Code-Converter.html');
  await page.waitForSelector('#drop');

  // from the footer
  await page.click('.app-foot [data-feedback]');
  await page.waitForSelector('.fb-modal');
  await page.screenshot({ path: OUT + '/form.png' });
  // required fields
  await page.click('[data-fb="send"]');
  const e1 = await page.evaluate(() => [...document.querySelectorAll('.fb-err')].map((e) => e.textContent).filter(Boolean));
  if (e1.length !== 2) fails.push('empty form should show 2 errors, got ' + JSON.stringify(e1));
  await page.fill('#fb-name', 'Test Person');
  await page.fill('#fb-email', 'not-an-email');
  await page.click('[data-fb="send"]');
  if (!/does not look right/.test(await page.textContent('[data-for="fb-email"]'))) fails.push('bad e-mail accepted');
  await page.fill('#fb-email', 'test.person@example.org');
  await page.fill('#fb-org', 'Civil Aviation Authority');
  await page.fill('#fb-pos', 'AIS Officer');
  await page.fill('#fb-subj', 'Runway table idea');
  await page.fill('#fb-desc', 'Please add a column.\nSecond line — ünïcode ✓');
  const att = path.join(OUT, 'shot.png');
  fs.copyFileSync(OUT + '/form.png', att);
  await page.setInputFiles('#fb-file', [att, ROOT + '/LICENSE']);
  if ((await page.locator('.fb-file').count()) !== 2) fails.push('attachments not listed');
  await page.locator('.fb-file [data-rm="1"]').click();
  if ((await page.locator('.fb-file').count()) !== 1) fails.push('attachment not removed');
  await page.screenshot({ path: OUT + '/form-filled.png' });
  const [d] = await Promise.all([page.waitForEvent('download'), page.click('[data-fb="send"]')]);
  const eml = path.join(OUT, d.suggestedFilename());
  await d.saveAs(eml);
  const txt = fs.readFileSync(eml, 'utf8');
  if (!/^X-Unsent: 1/m.test(txt) || !/^To: prasad2t@gmail\.com/m.test(txt) || !/^Reply-To: Test Person <test\.person@example\.org>/m.test(txt)) fails.push('e-mail headers');
  const parts = txt.split(/\r\n--=_/);
  const plain = parts.find((p) => /text\/plain/.test(p));
  const body = plain ? Buffer.from(plain.split('\r\n\r\n')[1].replace(/\s+/g, ''), 'base64').toString('utf8') : '';
  for (const s of ['Test Person', 'Civil Aviation Authority', 'AIS Officer', 'Runway table idea', 'ünïcode ✓', 'Technical details']) if (!body.includes(s)) fails.push('body misses ' + s);
  const a = parts.find((p) => /Content-Disposition: attachment; filename="shot\.png"/.test(p));
  const bytes = a ? Buffer.from(a.split('\r\n\r\n')[1].replace(/\s+/g, ''), 'base64') : Buffer.alloc(0);
  if (!bytes.equals(fs.readFileSync(att))) fails.push('attachment bytes differ');
  if (/LICENSE/.test(txt.replace(/Apache License/g, ''))) fails.push('removed attachment still sent');
  if (!/E-mail ready/.test(await page.textContent('#fb-done'))) fails.push('no confirmation');
  console.log('eml:', fs.statSync(eml).size, 'bytes, attachment', bytes.length, 'bytes');
  await page.keyboard.press('Escape');

  // remembered, and from the About page
  await page.click('.nav [data-view="about"]');
  await page.click('.fb-card [data-feedback]');
  await page.waitForSelector('.fb-modal');
  const kept = await page.evaluate(() => [document.querySelector('#fb-name').value, document.querySelector('#fb-email').value, document.querySelector('#fb-pos').value]);
  if (kept.join('|') !== 'Test Person|test.person@example.org|AIS Officer') fails.push('details not remembered: ' + kept);
  await page.click('[data-fb="close"]');

  // phone: the form fits the screen
  const ph = await (await browser.newContext(env.playwright.devices['Pixel 7'])).newPage();
  ph.on('pageerror', (e) => errors.push('phone: ' + e.message));
  await ph.goto('file://' + ROOT + '/AIXM-Code-Converter.html'); await ph.waitForSelector('#drop');
  await ph.evaluate(() => FEEDBACK.open());
  await ph.waitForSelector('.fb-modal');
  const fit = await ph.evaluate(() => { const r = document.querySelector('.fb-modal').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && document.documentElement.scrollWidth <= innerWidth; });
  if (!fit) fails.push('form wider than the phone');
  await ph.screenshot({ path: OUT + '/phone.png' });

  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
  console.log(fails.length ? 'FAIL: ' + fails.join('; ') : 'feedback OK');
  if (errors.length || fails.length) process.exitCode = 1;
  await browser.close();
})();
