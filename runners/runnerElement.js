import sharp from 'sharp';

import { ensureAssetsLoaded } from './utils.js';
import chalk from 'chalk';

export default async function runElementScenario({ page, baseURL, scn, device, filter, shotNum }) {
  let filename;
  let beforeResult = true;
  shotNum++;
  filename = `screenshots/${device}-${String(shotNum).padStart(3, '0')}-${scn.name}.png`;
  if (filter && !filename.includes(filter)) return shotNum;
  await page.goto(baseURL + scn.route);
  await page.waitForLoadState('networkidle');
  if (scn.before) {
    try {
      beforeResult = await scn.before(page, page.locator(scn.selector), device);
    } catch (err) {
      beforeResult = false;
      throw new Error(`[element type] 'before' threw: ${err}`);
    }
  }
  if (beforeResult === false) return shotNum;
  await ensureAssetsLoaded(page);
  if (scn.cleanup) {
    try {
      await scn.cleanup(page, page.locator(scn.selector), device);
    } catch (err) {
      throw new Error(`[element type] 'cleanup' threw: ${err}`);
    }
  }
  const el = await page.locator(scn.selector);
  if (!el) return shotNum;
  if (scn.full) {
    const boundingBox = await el.boundingBox();
    if (!boundingBox) throw new Error('Element not found or not visible');
    const viewport = page.viewportSize();
    if (!viewport) throw new Error('Viewport size detection failed');
    const cols = Math.ceil(boundingBox.width / viewport.width);
    const rows = Math.ceil(boundingBox.height / viewport.height);
    await import('fs/promises').then(fs => fs.mkdir('screenshots', { recursive: true }));
    let tileIdx = 0;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const suffix = String.fromCharCode('a'.charCodeAt(0) + tileIdx);
        const tileFilename = `screenshots/${device}-${String(shotNum).padStart(3, '0')}${suffix}-${scn.name}.png`;
        const tileX = Math.floor(boundingBox.x + col * viewport.width);
        const tileY = Math.floor(boundingBox.y + row * viewport.height);
        await page.evaluate(({ x, y }) => { window.scrollTo(x, y); }, { x: tileX, y: tileY });
        await page.waitForTimeout(100);
        const clip = {
          x: 0, y: 0,
          width: Math.min(viewport.width, Math.ceil(boundingBox.width - (col * viewport.width))),
          height: Math.min(viewport.height, Math.ceil(boundingBox.height - (row * viewport.height)))
        };
        if (clip.width > 0 && clip.height > 0) {
          await el.screenshot({ path: tileFilename, clip });
          console.log(chalk.green.bold(`[${device}]`), chalk.cyan(`#${shotNum}${suffix}`), chalk.white('-'), chalk.yellow(scn.name));
        }
        tileIdx++;
      }
    }
  } else {
    console.log(chalk.green.bold(`[${device}]`), chalk.cyan(`#${shotNum}`), chalk.white('-'), chalk.yellow(scn.name));
    await el.screenshot({ path: filename });
  }
  return shotNum;
}
