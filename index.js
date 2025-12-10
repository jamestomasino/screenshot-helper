import { chromium as chromiumDefault } from 'playwright';
import chalk from 'chalk';
import runFunctionScenario from './runners/runnerFunction.js';
import runElementScenario from './runners/runnerElement.js';
import runPageScenario from './runners/runnerPage.js';

function makeRunner({ browser, baseURL, scenarioData, device, contextOptions, filter, loadTimeoutMs, loadTimeoutAction, debug }) {
  return async function () {
    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();
    let shotNum = 0;

    const debugLog = debug ? (...args) => console.log(chalk.gray('[debug]'), ...args) : () => {};

    async function runScenario(scn) {
      debugLog(`[${device}]`, '#', shotNum + 1, '-', scn.name, `(type: ${scn.type || 'page'}) start`);
      switch (scn.type) {
        case 'function':
          await runFunctionScenario({ page, baseURL, scn, device, filter, loadTimeoutMs, loadTimeoutAction, debugLog });
          break;
        case 'element':
          shotNum = await runElementScenario({ page, baseURL, scn, device, filter, shotNum, loadTimeoutMs, loadTimeoutAction, debugLog });
          break;
        default:
          shotNum = await runPageScenario({ page, baseURL, scn, device, filter, shotNum, loadTimeoutMs, loadTimeoutAction, debugLog });
          break;
      }
    }

    for (const scenario of scenarioData) {
      try {
        await runScenario(scenario);
      } catch (err) {
        console.log(chalk.red.bold('ERROR:'));
        if (err && err.stack) {
          console.error(err.stack);
        } else {
          console.error(err);
        }
        // Always increment shotNum if type is 'element' or 'page' (these return current shotNum)
        if (scenario.type === 'element' || scenario.type === 'page') {
          shotNum++;
        }
      }
    }
    await context.close();
  };
}

export async function launchScreenshotsRunner({ scenarioData, baseURL, devices, filter, httpCredentials, loadTimeoutMs, loadTimeoutAction, debug }, { playwrightChromium } = {}) {
  const chromium = playwrightChromium || chromiumDefault;
  const browser = await chromium.launch();
  try {
    await Promise.all(
      Object.entries(devices).map(([device, contextOptionsRaw]) => {
        const contextOptions = httpCredentials ? { ...contextOptionsRaw, httpCredentials } : contextOptionsRaw;
        return makeRunner({ browser, baseURL, scenarioData, device, contextOptions, filter, loadTimeoutMs, loadTimeoutAction, debug })();
      })
    );
  } finally {
    await browser.close();
  }
}

export default launchScreenshotsRunner;
