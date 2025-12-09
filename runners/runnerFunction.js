import { ensureAssetsLoaded, waitForPageLoad } from './utils.js';
import chalk from 'chalk';

export default async function runFunctionScenario({ page, baseURL, scn, device, filter, loadTimeoutMs, loadTimeoutAction }) {
  const scenarioName = scn.name;

  let beforeResult = true;
  const onTimeout = loadTimeoutAction === 'skip' ? 'skip' : 'continue';
  await page.goto(baseURL + scn.route);
  const loadResult = await waitForPageLoad(page, { loadTimeoutMs });
  if (loadResult.timedOut) {
    console.log(chalk.yellow.bold(`[${device}]`), chalk.magenta('<function>'), chalk.white('-'), chalk.yellow(`load timeout -> ${onTimeout}`), chalk.yellow(scenarioName));
    if (onTimeout === 'skip') return;
  }
  if (scn.before) {
    try {
      beforeResult = await scn.before(page, page.locator(scn.selector), device);
    } catch (err) {
      beforeResult = false;
      throw new Error(`[function type] 'before' threw: ${err}`);
    }
  }
  if (beforeResult === false) return;
  console.log(chalk.green.bold(`[${device}]`), chalk.magenta('<function>'), chalk.white('-', ''), chalk.yellow(scenarioName));
  await ensureAssetsLoaded(page, { waitForLoad: !loadResult.timedOut, loadTimeoutMs });
  if (scn.cleanup) {
    try {
      await scn.cleanup(page, page.locator(scn.selector), device);
    } catch (err) {
      throw new Error(`[function type] 'cleanup' threw: ${err}`);
    }
  }
}
