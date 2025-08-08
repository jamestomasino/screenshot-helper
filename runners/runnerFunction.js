import { ensureAssetsLoaded } from './utils.js';
import chalk from 'chalk';

export default async function runFunctionScenario({ page, baseURL, scn, device, filter }) {
  let beforeResult = true;
  await page.goto(baseURL + scn.route);
  await page.waitForLoadState('networkidle');
  if (scn.before) {
    try {
      beforeResult = await scn.before(page, page.locator(scn.selector), device);
    } catch (err) {
      beforeResult = false;
      throw new Error(`[function type] 'before' threw: ${err}`);
    }
  }
  if (beforeResult === false) return;
  console.log(chalk.green.bold(`[${device}]`), chalk.white('-', ''), chalk.yellow(scn.name));
  await ensureAssetsLoaded(page);
  if (scn.cleanup) {
    try {
      await scn.cleanup(page, page.locator(scn.selector), device);
    } catch (err) {
      throw new Error(`[function type] 'cleanup' threw: ${err}`);
    }
  }
}
