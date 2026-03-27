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

function isScreenshotScenario(scenario) {
  return scenario.type !== 'function';
}

function normalizePathname(pathname) {
  if (!pathname || pathname === '/') return '/';
  const normalized = pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  return normalized || '/';
}

function canonicalRouteKey(route, baseURL) {
  if (typeof route !== 'string' || route.trim() === '') return null;
  try {
    const url = new URL(route, baseURL);
    const pathname = normalizePathname(url.pathname || '/');
    return `${url.origin}${pathname}`;
  } catch {
    const [withoutHash] = route.split('#');
    const [withoutQuery] = withoutHash.split('?');
    const trimmed = withoutQuery.trim();
    if (!trimmed) return null;
    const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    return normalizePathname(withLeadingSlash);
  }
}

function resolveScenarioGroup(scenario, baseURL) {
  if (scenario.group !== undefined && scenario.group !== null) {
    const explicitGroup = String(scenario.group).trim();
    if (explicitGroup) {
      return {
        identity: `group:${explicitGroup}`,
        groupKey: explicitGroup,
      };
    }
  }
  const routeKey = canonicalRouteKey(scenario.route, baseURL);
  if (routeKey) {
    return {
      identity: `url:${routeKey}`,
      groupKey: routeKey,
    };
  }
  return {
    identity: 'misc',
    groupKey: 'misc',
  };
}

function buildShotPlanByScenario(scenarioData, baseURL) {
  const shotPlanByScenario = new WeakMap();
  const groupIdByIdentity = new Map();
  const shotsInGroupByIdentity = new Map();
  let nextGroupId = 1;

  for (const scenario of scenarioData) {
    if (!isScreenshotScenario(scenario)) continue;
    const group = resolveScenarioGroup(scenario, baseURL);
    if (!groupIdByIdentity.has(group.identity)) {
      groupIdByIdentity.set(group.identity, nextGroupId++);
    }
    const groupId = groupIdByIdentity.get(group.identity);
    const shotInGroup = (shotsInGroupByIdentity.get(group.identity) || 0) + 1;
    shotsInGroupByIdentity.set(group.identity, shotInGroup);
    shotPlanByScenario.set(scenario, {
      groupId,
      groupKey: group.groupKey,
      shotInGroup,
      shotLabel: `${String(groupId).padStart(2, '0')}.${String(shotInGroup).padStart(3, '0')}`,
    });
  }

  return shotPlanByScenario;
}

function makeRunner({ browser, baseURL, scenarioData, shotPlanByScenario, device, contextOptions, filter, outputDir, outputPathBuilder, loadTimeoutMs, loadTimeoutAction, debug, logger, onEvent }) {
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
      const shotPlan = shotPlanByScenario.get(scn);
      emitEvent(onEvent, {
        type: 'scenario-started',
        device,
        scenarioName: scn.name,
        scenarioType: scn.type || 'page',
      });
      summary.counts.started += 1;
      const displayShot = shotPlan?.shotLabel || shotNum + 1;
      debugLog(`[${device}]`, '#', displayShot, '-', scn.name, `(type: ${scn.type || 'page'}) start`);
      let result;
      switch (scn.type) {
        case 'function':
          result = await runFunctionScenario({ page, baseURL, scn, device, filter, loadTimeoutMs, loadTimeoutAction, debugLog, logger });
          break;
        case 'element':
          result = await runElementScenario({ page, baseURL, scn, shotPlan, device, filter, shotNum, outputDir, outputPathBuilder, loadTimeoutMs, loadTimeoutAction, debugLog, logger });
          break;
        default:
          result = await runPageScenario({ page, baseURL, scn, shotPlan, device, filter, shotNum, outputDir, outputPathBuilder, loadTimeoutMs, loadTimeoutAction, debugLog, logger });
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
        if (isScreenshotScenario(scenario)) {
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
  const shotPlanByScenario = buildShotPlanByScenario(scenarioData, baseURL);
  await ensureOutputDirectory(outputDir);
  const browser = await chromium.launch();
  try {
    const deviceSummaries = await Promise.all(
      Object.entries(devices).map(([device, contextOptionsRaw]) => {
        const contextOptions = httpCredentials ? { ...contextOptionsRaw, httpCredentials } : contextOptionsRaw;
        return makeRunner({ browser, baseURL, scenarioData, shotPlanByScenario, device, contextOptions, filter, outputDir, outputPathBuilder, loadTimeoutMs, loadTimeoutAction, debug, logger, onEvent })();
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
