// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Airport chart and map labels: airport view card, runway markings, taxiway signs, ILS feathers,
// label decluttering, airspace / route labels, airport chart in the PNG renderer.
// Optional: AIRPORT_FILE=<file.xml> AIRPORT_ICAO=<code> to check another data set as well.
const { chromium } = require('./_env').playwright;
const ROOT = require('./_env').ROOT, OUT = require('./_env').out('airport_chart');
const fs = require('fs');

async function load(page, file) {
  await page.goto('file://' + ROOT + '/AIXM-Code-Converter.html');
  await page.waitForSelector('#drop');
  await page.setInputFiles('#file-input', [file]);
  await page.waitForFunction(() => window.__AIXM.S.files.every((f) => f.status === 'ready'));
  await page.click('#extract-btn');
  await page.waitForFunction(() => window.__AIXM.S.view === 'dash', null, { timeout: 120000 });
  await page.evaluate(() => window.__AIXM.go('map'));
  await page.waitForTimeout(800);
}
async function check(page, icao, tag, fails) {
  const r = await page.evaluate((code) => {
    const ds = window.__AIXM.S.datasets[0];
    const ad = ds.byType.AirportHeliport.find((a) => JSON.stringify(a.cur.p.locationIndicatorICAO || a.cur.p.designator).includes(code));
    if (!ad) return { err: 'no aerodrome ' + code };
    const m = ADCHART.of(ds, ad);
    MAPVIEW.airportView(ds, ad);
    return { runways: m ? m.runways.length : 0, ends: m ? m.runways.map((x) => x.ends.map((e) => e.desig + (e.ils ? '+ILS' : '')).join('/')) : [], twy: m ? m.twy.length : 0, stands: m ? m.stands.length : 0 };
  }, icao);
  console.log(tag, JSON.stringify(r));
  if (r.err || !r.runways) fails.push(tag + ': no runways drawn');
  await page.waitForTimeout(900);
  const card = await page.evaluate(() => { const c = document.getElementById('map-adcard'); return c && !c.classList.contains('hidden') ? c.innerText : ''; });
  if (!/Runways/i.test(card)) fails.push(tag + ': airport card missing runways');
  await page.screenshot({ path: OUT + '/' + tag + '_airport.png' });
  // zoom in further: markings, taxiway signs and stands
  await page.evaluate(() => { const m = MAPVIEW.leaflet(); m.setZoom(Math.min(m.getZoom() + 2, 18), { animate: false }); });
  await page.waitForTimeout(700);
  await page.screenshot({ path: OUT + '/' + tag + '_detail.png' });
  // approach scale: ILS feathers
  await page.evaluate(() => { const m = MAPVIEW.leaflet(); m.setZoom(10, { animate: false }); });
  await page.waitForTimeout(700);
  await page.screenshot({ path: OUT + '/' + tag + '_approach.png' });
  // PNG of the airport chart through the static renderer
  const png = await page.evaluate(() => { const st = window.__AIXM.S, ds = st.datasets[0], m = MAPVIEW.leaflet(); MAPVIEW.airportView(ds, ds.byType.AirportHeliport.find((a) => ADCHART.of(ds, a) && ADCHART.of(ds, a).runways.length)); return MAPVIEW.renderImage(ds, m.getBounds(), 1600, 1000, { title: 'airport chart test' }); });
  fs.writeFileSync(OUT + '/' + tag + '_render.png', Buffer.from(png.split(',')[1], 'base64'));
  if (png.length < 20000) fails.push(tag + ': rendered PNG looks empty');
}

(async () => {
  const browser = await chromium.launch({ executablePath: require('./_env').chrome });
  const page = await (await browser.newContext({ viewport: { width: 1500, height: 920 } })).newPage();
  const errors = [], fails = [];
  page.on('pageerror', (e) => errors.push(e.message + e.stack));
  page.on('console', (m) => { if (m.type() === 'error' && !/net::|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await load(page, ROOT + '/testdata/Donlon_ALL_Baseline_2025.xml');
  // en-route view: labels must not overlap (collision registry) and airspace / route labels exist
  await page.evaluate(() => { MAPVIEW.leaflet().setView([52.3, -31.5], 7, { animate: false }); });
  await page.waitForTimeout(900);
  await page.screenshot({ path: OUT + '/donlon_enroute.png' });
  await check(page, 'EADD', 'donlon', fails);
  const pop = await page.evaluate(() => { document.querySelector('[data-adc="close"]').click(); return document.getElementById('map-adcard').classList.contains('hidden'); });
  if (!pop) fails.push('card close button');
  if (process.env.AIRPORT_FILE) {
    const page2 = await (await browser.newContext({ viewport: { width: 1500, height: 920 } })).newPage();
    page2.on('pageerror', (e) => errors.push(e.message + e.stack));
    await load(page2, process.env.AIRPORT_FILE);
    await check(page2, process.env.AIRPORT_ICAO || 'OEJN', 'extra', fails);
  }
  console.log(errors.join('\n') || 'no errors');
  console.log(fails.length ? 'FAIL: ' + fails.join('; ') : 'airport chart OK');
  if (errors.length || fails.length) process.exitCode = 1;
  await browser.close();
})();
