// Shoots v12-ui.html's Discord UI parts to PNGs for v12_discord.py (run by it; reads vo/v12/ui.json).
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, 'vo', 'v12');
const data = JSON.parse(readFileSync(join(dir, 'ui.json'), 'utf-8'));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
await page.addInitScript(d => { window.DATA = d; }, data);
await page.goto(pathToFileURL(join(here, 'v12-ui.html')).href, { waitUntil: 'networkidle' });
await page.evaluate(() => window.build());
await page.evaluate(() => document.fonts.ready);
const mode = m => page.evaluate(m => { document.body.className = 'mode-' + m; }, m);

await mode('bg');
await page.screenshot({ path: join(dir, 'bg.png') });
await mode('fg');
await page.screenshot({ path: join(dir, 'fg.png'), omitBackground: true });

await mode('list');
const meta = await page.evaluate(() => window.listMeta());
await page.setViewportSize({ width: 1080, height: Math.max(1920, meta.height + 10) });
await (await page.$('#list')).screenshot({ path: join(dir, 'list.png') });
writeFileSync(join(dir, 'list.json'), JSON.stringify(meta));

await page.setViewportSize({ width: 1080, height: 1920 });
await mode('typing');
for (const k of Object.keys(data.users)) {
  await (await page.$('#typing-' + k)).screenshot({ path: join(dir, `typing_${k}.png`), omitBackground: true });
}
await browser.close();
console.log(`ui: ${data.chat.length} messages, list ${meta.height}px`);
