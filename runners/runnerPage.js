import { ensureAssetsLoaded, scroll, waitForPageLoad } from './utils.js';
import chalk from 'chalk';

export default async function runPageScenario({ page, baseURL, scn, device, filter, shotNum, loadTimeoutMs, loadTimeoutAction }) {
  let filename;
  let beforeResult = true;
  const onTimeout = loadTimeoutAction === 'skip' ? 'skip' : 'continue';
  shotNum++;
  filename = `screenshots/${device}-${String(shotNum).padStart(3, '0')}-${scn.name}.png`;
  if (filter && !filename.includes(filter)) return shotNum;
  await page.goto(baseURL + scn.route);
  const loadResult = await waitForPageLoad(page, { loadTimeoutMs });
  if (loadResult.timedOut) {
    console.log(chalk.yellow.bold(`[${device}]`), chalk.cyan(`#${shotNum}`), chalk.white('-'), chalk.yellow(`load timeout -> ${onTimeout}`), chalk.yellow(scn.name));
    if (onTimeout === 'skip') return shotNum;
  }
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
  await ensureAssetsLoaded(page, { waitForLoad: !loadResult.timedOut, loadTimeoutMs });

  // cleanup hook – must happen after scrolling/loading, but before screenshot
  if (scn.cleanup) {
    try {
      await scn.cleanup(page, undefined, device);
    } catch (err) {
      throw new Error(`[page type] 'cleanup' threw: ${err}`);
    }
  }

  console.log(chalk.green.bold(`[${device}]`), chalk.cyan(`#${shotNum}`), chalk.white('-'), chalk.yellow(scn.name));
  await page.screenshot({ path: filename, fullPage: !!scn.full });

  return shotNum;
}
