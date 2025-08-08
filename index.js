import { chromium as chromiumDefault } from 'playwright';
import chalk from 'chalk';
import runFunctionScenario from './runners/runnerFunction.js';
import runElementScenario from './runners/runnerElement.js';
import runPageScenario from './runners/runnerPage.js';

function makeRunner({ browser, baseURL, scenarioData, device, contextOptions, filter }) {
  return async function () {
    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();
    let shotNum = 0;

    async function runScenario(scn) {
      switch (scn.type) {
        case 'function':
          await runFunctionScenario({ page, baseURL, scn, device, filter });
          break;
        case 'element':
          shotNum = await runElementScenario({ page, baseURL, scn, device, filter, shotNum });
          break;
        default:
          shotNum = await runPageScenario({ page, baseURL, scn, device, filter, shotNum });
          break;
      }
    }

    for (const scenario of scenarioData) {
      await runScenario(scenario);
    }
    await context.close();
  };
}

export async function launchScreenshotsRunner({ scenarioData, baseURL, devices, filter, httpCredentials }, { playwrightChromium } = {}) {
  const chromium = playwrightChromium || chromiumDefault;
  const browser = await chromium.launch();
  try {
    await Promise.all(
      Object.entries(devices).map(([device, contextOptionsRaw]) => {
        const contextOptions = httpCredentials ? { ...contextOptionsRaw, httpCredentials } : contextOptionsRaw;
        return makeRunner({ browser, baseURL, scenarioData, device, contextOptions, filter })();
      })
    );
  } finally {
    await browser.close();
  }
}

export default launchScreenshotsRunner;
