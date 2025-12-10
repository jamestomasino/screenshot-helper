import { ensureAssetsLoaded, waitForPageLoad } from './utils.js';
import chalk from 'chalk';

const isAssetsTimeout = (err) => {
  if (!err) return false;
  if (err.name === 'TimeoutError') return true;
  const msg = err.message || String(err);
  return /assets load timeout/i.test(msg) || /TimeoutError/i.test(msg);
};

export default async function runFunctionScenario({ page, baseURL, scn, device, filter, loadTimeoutMs, loadTimeoutAction, debugLog = () => {} }) {
  const scenarioName = scn.name;

  let beforeResult = true;
  const onTimeout = loadTimeoutAction === 'skip' ? 'skip' : 'continue';
  debugLog(`[${device}]`, '<function>', '-', scenarioName, '-> goto', baseURL + scn.route);
  await page.goto(baseURL + scn.route);
  debugLog(`[${device}]`, '<function>', '-', scenarioName, '-> waiting for load');
  const loadResult = await waitForPageLoad(page, { loadTimeoutMs });
  debugLog(`[${device}]`, '<function>', '-', scenarioName, loadResult.timedOut ? 'load timed out' : 'load complete');
  if (loadResult.timedOut) {
    console.log(chalk.yellow.bold(`[${device}]`), chalk.magenta('<function>'), chalk.white('-'), chalk.yellow(`load timeout -> ${onTimeout}`), chalk.yellow(scenarioName));
    if (onTimeout === 'skip') return;
  }
  if (scn.before) {
    try {
      debugLog(`[${device}]`, '<function>', '-', scenarioName, "-> before() start");
      beforeResult = await scn.before(page, page.locator(scn.selector), device);
      debugLog(`[${device}]`, '<function>', '-', scenarioName, "-> before() done");
    } catch (err) {
      beforeResult = false;
      throw new Error(`[function type] 'before' threw: ${err}`);
    }
  }
  if (beforeResult === false) return;
  console.log(chalk.green.bold(`[${device}]`), chalk.magenta('<function>'), chalk.white('-', ''), chalk.yellow(scenarioName));
  debugLog(`[${device}]`, '<function>', '-', scenarioName, '-> ensureAssetsLoaded');
  try {
    await ensureAssetsLoaded(page, { waitForLoad: !loadResult.timedOut, loadTimeoutMs });
  } catch (err) {
    if (isAssetsTimeout(err)) {
      console.log(chalk.yellow.bold(`[${device}]`), chalk.magenta('<function>'), chalk.white('-'), chalk.yellow(`assets timeout -> ${onTimeout}`), chalk.yellow(scenarioName));
      if (onTimeout === 'skip') return;
    } else {
      throw err;
    }
  }
  if (scn.cleanup) {
    try {
      debugLog(`[${device}]`, '<function>', '-', scenarioName, "-> cleanup() start");
      await scn.cleanup(page, page.locator(scn.selector), device);
      debugLog(`[${device}]`, '<function>', '-', scenarioName, "-> cleanup() done");
    } catch (err) {
      throw new Error(`[function type] 'cleanup' threw: ${err}`);
    }
  }
}
