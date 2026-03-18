import { chromium as chromiumDefault } from 'playwright';
import chalk from 'chalk';
import { defaultOutputPathBuilder, ensureOutputDirectory } from './runners/utils.js';
import runFunctionScenario from './runners/runnerFunction.js';
import runElementScenario from './runners/runnerElement.js';
import runPageScenario from './runners/runnerPage.js';

function createDefaultLogger() {
  return {
    log: (...args) => console.log(...args),
    error: (...args) => console.error(...args),
  };
}

function emitEvent(onEvent, event) {
  if (typeof onEvent === 'function') {
    onEvent(event);
  }
}

function createSummaryRecord() {
  return {
    started: 0,
    skipped: 0,
    succeeded: 0,
    failed: 0,
  };
}

function makeRunner({ browser, baseURL, scenarioData, device, contextOptions, filter, outputDir, outputPathBuilder, loadTimeoutMs, loadTimeoutAction, debug, logger, onEvent }) {
  return async function () {
    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();
    let shotNum = 0;
    const summary = {
      device,
      counts: createSummaryRecord(),
      scenarios: [],
    };

    const debugLog = debug ? (...args) => logger.log(chalk.gray('[debug]'), ...args) : () => {};

    async function runScenario(scn) {
      emitEvent(onEvent, {
        type: 'scenario-started',
        device,
        scenarioName: scn.name,
        scenarioType: scn.type || 'page',
      });
      summary.counts.started += 1;
      debugLog(`[${device}]`, '#', shotNum + 1, '-', scn.name, `(type: ${scn.type || 'page'}) start`);
      let result;
      switch (scn.type) {
        case 'function':
          result = await runFunctionScenario({ page, baseURL, scn, device, filter, loadTimeoutMs, loadTimeoutAction, debugLog, logger });
          break;
        case 'element':
          result = await runElementScenario({ page, baseURL, scn, device, filter, shotNum, outputDir, outputPathBuilder, loadTimeoutMs, loadTimeoutAction, debugLog, logger });
          break;
        default:
          result = await runPageScenario({ page, baseURL, scn, device, filter, shotNum, outputDir, outputPathBuilder, loadTimeoutMs, loadTimeoutAction, debugLog, logger });
          break;
      }
      if (typeof result?.shotNum === 'number') {
        shotNum = result.shotNum;
      }
      const event = {
        type: result?.status === 'skipped' ? 'scenario-skipped' : 'scenario-succeeded',
        device,
        scenarioName: scn.name,
        scenarioType: scn.type || 'page',
        status: result?.status || 'succeeded',
        reason: result?.reason || null,
        filename: result?.filename || null,
      };
      emitEvent(onEvent, event);
      summary.counts[result?.status === 'skipped' ? 'skipped' : 'succeeded'] += 1;
      summary.scenarios.push(event);
    }

    for (const scenario of scenarioData) {
      try {
        await runScenario(scenario);
      } catch (err) {
        logger.log(chalk.red.bold('ERROR:'));
        if (err && err.stack) {
          logger.error(err.stack);
        } else {
          logger.error(err);
        }
        // Always increment shotNum if type is 'element' or 'page' (these return current shotNum)
        if (scenario.type === 'element' || scenario.type === 'page') {
          shotNum++;
        }
        const event = {
          type: 'scenario-failed',
          device,
          scenarioName: scenario.name,
          scenarioType: scenario.type || 'page',
          status: 'failed',
          error: err && err.stack ? err.stack : String(err),
        };
        emitEvent(onEvent, event);
        summary.counts.failed += 1;
        summary.scenarios.push(event);
      }
    }
    await context.close();
    return summary;
  };
}

export async function launchScreenshotsRunner({ scenarioData, baseURL, devices, filter, outputDir = 'screenshots', outputPathBuilder = defaultOutputPathBuilder, onEvent, logger = createDefaultLogger(), httpCredentials, loadTimeoutMs, loadTimeoutAction, debug }, { playwrightChromium } = {}) {
  const chromium = playwrightChromium || chromiumDefault;
  await ensureOutputDirectory(outputDir);
  const browser = await chromium.launch();
  try {
    const deviceSummaries = await Promise.all(
      Object.entries(devices).map(([device, contextOptionsRaw]) => {
        const contextOptions = httpCredentials ? { ...contextOptionsRaw, httpCredentials } : contextOptionsRaw;
        return makeRunner({ browser, baseURL, scenarioData, device, contextOptions, filter, outputDir, outputPathBuilder, loadTimeoutMs, loadTimeoutAction, debug, logger, onEvent })();
      })
    );
    const summary = {
      outputDir,
      counts: createSummaryRecord(),
      devices: Object.fromEntries(deviceSummaries.map((deviceSummary) => [deviceSummary.device, deviceSummary])),
    };

    for (const deviceSummary of deviceSummaries) {
      summary.counts.started += deviceSummary.counts.started;
      summary.counts.skipped += deviceSummary.counts.skipped;
      summary.counts.succeeded += deviceSummary.counts.succeeded;
      summary.counts.failed += deviceSummary.counts.failed;
    }

    return summary;
  } finally {
    await browser.close();
  }
}

export default launchScreenshotsRunner;
