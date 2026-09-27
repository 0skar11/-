// Renders every <svg id> in a page to PNG.
//   node render.mjs              art.html   -> ../<id>.png
//   node render.mjs etapa        etapa.html -> ../segunda-etapa/<id>.png
// Needs Playwright (Chromium).
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const name = process.argv[2] ?? 'art';
const out = join(here, '..', name === 'etapa' ? 'segunda-etapa' : '');
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 1 });
const url = pathToFileURL(join(here, name + '.html')).href;
await page.goto(url, { waitUntil: 'networkidle' });
const ids = await page.$$eval('svg[id]', els => els.map(e => e.id));

// One svg per load: Chromium mis-paints heavy filters far down a tall page.
for (const id of ids) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(id => { for (const s of document.querySelectorAll('svg[id]')) if (s.id !== id) s.remove(); return document.fonts.ready; }, id);
  await page.locator('#' + id).screenshot({ path: join(out, id + '.png') });
  console.log(id + '.png');
}
await browser.close();
