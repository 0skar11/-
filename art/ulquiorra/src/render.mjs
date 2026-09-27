// Renders every <svg id> in art.html to ../<id>.png.
//   node render.mjs
// Needs Playwright (Chromium).
import { chromium } from 'playwright';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(join(here, 'art.html')).href, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);

for (const id of await page.$$eval('svg[id]', els => els.map(e => e.id))) {
  await page.locator('#' + id).screenshot({ path: join(here, '..', id + '.png') });
  console.log(id + '.png');
}
await browser.close();
