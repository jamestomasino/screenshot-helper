import { ensureAssetsLoaded, scroll, waitForPageLoad } from './utils.js';
import chalk from 'chalk';

export default async function runPageScenario({ page, baseURL, scn, device, filter, shotNum, loadTimeoutMs, loadTimeoutAction, debugLog = () => {} }) {
  let filename;
  let beforeResult = true;
  const onTimeout = loadTimeoutAction === 'skip' ? 'skip' : 'continue';
  shotNum++;
  filename = `screenshots/${device}-${String(shotNum).padStart(3, '0')}-${scn.name}.png`;
  if (filter && !filename.includes(filter)) return shotNum;
  debugLog(`[${device}]`, '#', shotNum, '-', scn.name, '-> goto', baseURL + scn.route);
  await page.goto(baseURL + scn.route);
  debugLog(`[${device}]`, '#', shotNum, '-', scn.name, '-> waiting for load');
  const loadResult = await waitForPageLoad(page, { loadTimeoutMs });
  debugLog(`[${device}]`, '#', shotNum, '-', scn.name, loadResult.timedOut ? 'load timed out' : 'load complete');
  if (loadResult.timedOut) {
    console.log(chalk.yellow.bold(`[${device}]`), chalk.cyan(`#${shotNum}`), chalk.white('-'), chalk.yellow(`load timeout -> ${onTimeout}`), chalk.yellow(scn.name));
    if (onTimeout === 'skip') return shotNum;
  }
  if (scn.before) {
    try {
      debugLog(`[${device}]`, '#', shotNum, '-', scn.name, "-> before() start");
      beforeResult = await scn.before(page, undefined, device);
      debugLog(`[${device}]`, '#', shotNum, '-', scn.name, "-> before() done");
    } catch (err) {
      beforeResult = false;
      throw new Error(`[page type] 'before' threw: ${err}`);
    }
  }
  if (beforeResult === false) return shotNum;
  if (scn.full) {
    debugLog(`[${device}]`, '#', shotNum, '-', scn.name, '-> scrolling full page');
    await scroll(page);
  }
  debugLog(`[${device}]`, '#', shotNum, '-', scn.name, '-> ensureAssetsLoaded');
  try {
    await ensureAssetsLoaded(page, { waitForLoad: !loadResult.timedOut, loadTimeoutMs });
  } catch (err) {
    if (err && err.name === 'TimeoutError') {
      console.log(chalk.yellow.bold(`[${device}]`), chalk.cyan(`#${shotNum}`), chalk.white('-'), chalk.yellow(`assets timeout -> ${onTimeout}`), chalk.yellow(scn.name));
      if (onTimeout === 'skip') return shotNum;
    } else {
      throw err;
    }
  }

  // cleanup hook – must happen after scrolling/loading, but before screenshot
  if (scn.cleanup) {
    try {
      debugLog(`[${device}]`, '#', shotNum, '-', scn.name, "-> cleanup() start");
      await scn.cleanup(page, undefined, device);
      debugLog(`[${device}]`, '#', shotNum, '-', scn.name, "-> cleanup() done");
    } catch (err) {
      throw new Error(`[page type] 'cleanup' threw: ${err}`);
    }
  }

  console.log(chalk.green.bold(`[${device}]`), chalk.cyan(`#${shotNum}`), chalk.white('-'), chalk.yellow(scn.name));
  debugLog(`[${device}]`, '#', shotNum, '-', scn.name, '-> taking screenshot to', filename);
  await page.screenshot({ path: filename, fullPage: !!scn.full });

  return shotNum;
}
