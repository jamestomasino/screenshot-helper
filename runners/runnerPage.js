import { ensureAssetsLoaded, scroll } from './utils.js';
import chalk from 'chalk';

export default async function runPageScenario({ page, baseURL, scn, device, filter, shotNum }) {
  let filename;
  let beforeResult = true;
  shotNum++;
  filename = `screenshots/${device}-${String(shotNum).padStart(3, '0')}-${scn.name}.png`;
  if (filter && !filename.includes(filter)) return shotNum;
  await page.goto(baseURL + scn.route);
  await page.waitForLoadState('networkidle');
  if (scn.before) {
    try {
      beforeResult = await scn.before(page, undefined, device);
    } catch (err) {
      beforeResult = false;
      throw new Error(`[page type] 'before' threw: ${err}`);
    }
  }
  if (beforeResult === false) return shotNum;
  if (scn.full) { await scroll(page); }
  await ensureAssetsLoaded(page);
  console.log(chalk.green.bold(`[${device}]`), chalk.cyan(`#${shotNum}`), chalk.white('-'), chalk.yellow(scn.name));
  await page.screenshot({ path: filename, fullPage: !!scn.full });

  // cleanup hook – must happen after scrolling/loading/screenshots
  if (scn.cleanup) {
    try {
      await scn.cleanup(page, undefined, device);
    } catch (err) {
      throw new Error(`[page type] 'cleanup' threw: ${err}`);
    }
  }
  return shotNum;
}
