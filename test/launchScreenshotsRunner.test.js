import { test, expect, vi, beforeEach } from 'vitest';
// NOTE: index.js is imported dynamically after mocks are registered
import path from 'path';
import { fileURLToPath } from 'url';

const isWindows = process.platform === 'win32';

// ----------- UNIT TEST (Dependency injection for Playwright) -----------
const chromiumMock = {
  launch: async () => ({
    newContext: async () => ({
      newPage: async () => ({
        waitForLoadState: async () => {},
        evaluate: async () => {},
        locator: (selector) => ({
          screenshot: async () => {},
          boundingBox: async () => ({ width: 100, height: 200 }), // For full: true
        }),
        goto: async () => {},
        viewportSize: () => ({ width: 800, height: 600 }),
        setViewportSize: async () => {},
      }),
      close: async () => {},
    }),
    close: async () => {},
  }),
};

test('launchScreenshotsRunner works with minimal scenario config (mocked chromium)', async () => {
  const scenarioData = [
    { type: 'element', route: '/test', name: 'test-scn', selector: 'body' }
  ];
  const devices = { desktop: {} };
  const baseURL = 'http://localhost:3000';
  const { launchScreenshotsRunner } = await import('../index.js');
  await expect(
    launchScreenshotsRunner({ scenarioData, baseURL, devices }, { playwrightChromium: chromiumMock })
  ).resolves.toMatchObject({
    counts: { started: 1, succeeded: 1, skipped: 0, failed: 0 }
  });
});

test('launchScreenshotsRunner respects custom outputDir for page screenshots', async () => {
  let screenshotPath;
  const chromiumWithCapture = {
    launch: async () => ({
      newContext: async () => ({
        newPage: async () => ({
          waitForLoadState: async () => {},
          evaluate: async () => {},
          locator: () => ({ screenshot: async () => {} }),
          goto: async () => {},
          screenshot: async ({ path }) => {
            screenshotPath = path;
          },
          viewportSize: () => ({ width: 800, height: 600 }),
          setViewportSize: async () => {},
        }),
        close: async () => {},
      }),
      close: async () => {},
    }),
  };

  const scenarioData = [{ route: '/test', name: 'home' }];
  const devices = { desktop: {} };
  const baseURL = 'http://localhost:3000';
  const { launchScreenshotsRunner } = await import('../index.js');

  await launchScreenshotsRunner(
    { scenarioData, baseURL, devices, outputDir: 'custom-output' },
    { playwrightChromium: chromiumWithCapture }
  );

  expect(screenshotPath).toContain('custom-output');
  expect(screenshotPath).toContain('desktop-01.001-home.png');
});

test('launchScreenshotsRunner respects custom outputDir for element screenshots', async () => {
  let screenshotPath;
  const chromiumWithCapture = {
    launch: async () => ({
      newContext: async () => ({
        newPage: async () => ({
          waitForLoadState: async () => {},
          evaluate: async () => {},
          locator: () => ({
            screenshot: async ({ path }) => {
              screenshotPath = path;
            },
            boundingBox: async () => ({ width: 100, height: 200 }),
            scrollIntoViewIfNeeded: async () => {},
            evaluate: async () => ({ overX: false, overY: false }),
          }),
          goto: async () => {},
          viewportSize: () => ({ width: 800, height: 600 }),
          setViewportSize: async () => {},
        }),
        close: async () => {},
      }),
      close: async () => {},
    }),
  };

  const scenarioData = [{ type: 'element', route: '/test', name: 'panel', selector: '#panel' }];
  const devices = { mobile: {} };
  const baseURL = 'http://localhost:3000';
  const { launchScreenshotsRunner } = await import('../index.js');

  await launchScreenshotsRunner(
    { scenarioData, baseURL, devices, outputDir: 'another-output' },
    { playwrightChromium: chromiumWithCapture }
  );

  expect(screenshotPath).toContain('another-output');
  expect(screenshotPath).toContain('mobile-01.001-panel.png');
});

test('filter matching still works with custom outputDir', async () => {
  let screenshotCalls = 0;
  const chromiumWithCapture = {
    launch: async () => ({
      newContext: async () => ({
        newPage: async () => ({
          waitForLoadState: async () => {},
          evaluate: async () => {},
          goto: async () => {},
          screenshot: async () => { screenshotCalls += 1; },
          locator: () => ({ screenshot: async () => { screenshotCalls += 1; } }),
          viewportSize: () => ({ width: 800, height: 600 }),
          setViewportSize: async () => {},
        }),
        close: async () => {},
      }),
      close: async () => {},
    }),
  };

  const scenarioData = [
    { route: '/a', name: 'keep-this' },
    { route: '/b', name: 'skip-this' }
  ];
  const devices = { desktop: {} };
  const baseURL = 'http://localhost:3000';
  const { launchScreenshotsRunner } = await import('../index.js');

  const summary = await launchScreenshotsRunner(
    { scenarioData, baseURL, devices, outputDir: 'custom-output', filter: 'keep-this' },
    { playwrightChromium: chromiumWithCapture }
  );

  expect(screenshotCalls).toBe(1);
  expect(summary.counts.succeeded).toBe(1);
  expect(summary.counts.skipped).toBe(1);
});

test('launchScreenshotsRunner supports custom outputPathBuilder', async () => {
  let screenshotPath;
  const chromiumWithCapture = {
    launch: async () => ({
      newContext: async () => ({
        newPage: async () => ({
          waitForLoadState: async () => {},
          evaluate: async () => {},
          goto: async () => {},
          screenshot: async ({ path }) => {
            screenshotPath = path;
          },
          locator: () => ({ screenshot: async () => {} }),
          viewportSize: () => ({ width: 800, height: 600 }),
          setViewportSize: async () => {},
        }),
        close: async () => {},
      }),
      close: async () => {},
    }),
  };

  const scenarioData = [{ route: '/test', name: 'home' }];
  const devices = { desktop: {} };
  const baseURL = 'http://localhost:3000';
  const { launchScreenshotsRunner } = await import('../index.js');

  await launchScreenshotsRunner(
    {
      scenarioData,
      baseURL,
      devices,
      outputDir: 'custom-output',
      outputPathBuilder: ({ device, shotNum, scenarioName }) => `shots/${device}/${shotNum}-${scenarioName}.png`
    },
    { playwrightChromium: chromiumWithCapture }
  );

  expect(screenshotPath).toBe('shots/desktop/1-home.png');
});

test('launchScreenshotsRunner emits structured events and supports custom logger', async () => {
  const events = [];
  const logger = {
    log: vi.fn(),
    error: vi.fn(),
  };
  const chromiumWithCapture = {
    launch: async () => ({
      newContext: async () => ({
        newPage: async () => ({
          waitForLoadState: async () => {},
          evaluate: async () => {},
          goto: async () => {},
          screenshot: async () => {},
          locator: () => ({ screenshot: async () => {} }),
          viewportSize: () => ({ width: 800, height: 600 }),
          setViewportSize: async () => {},
        }),
        close: async () => {},
      }),
      close: async () => {},
    }),
  };

  const scenarioData = [{ route: '/test', name: 'home' }];
  const devices = { desktop: {} };
  const baseURL = 'http://localhost:3000';
  const { launchScreenshotsRunner } = await import('../index.js');

  const summary = await launchScreenshotsRunner(
    { scenarioData, baseURL, devices, onEvent: (event) => events.push(event), logger },
    { playwrightChromium: chromiumWithCapture }
  );

  expect(events.map((event) => event.type)).toEqual(['scenario-started', 'scenario-succeeded']);
  expect(events[1].filename).toContain('desktop-01.001-home.png');
  expect(summary.devices.desktop.counts.succeeded).toBe(1);
  expect(logger.log).toHaveBeenCalled();
  expect(logger.error).not.toHaveBeenCalled();
});

test('default naming uses deterministic grouped labels from url, explicit group, and misc fallback', async () => {
  const screenshotPaths = [];
  const chromiumWithCapture = {
    launch: async () => ({
      newContext: async () => ({
        newPage: async () => ({
          waitForLoadState: async () => {},
          evaluate: async () => {},
          goto: async () => {},
          screenshot: async ({ path }) => {
            screenshotPaths.push(path);
          },
          locator: () => ({ screenshot: async () => {} }),
          viewportSize: () => ({ width: 800, height: 600 }),
          setViewportSize: async () => {},
        }),
        close: async () => {},
      }),
      close: async () => {},
    }),
  };

  const scenarioData = [
    { route: '/home?from=top', name: 'home-1' },
    { route: '/checkout', name: 'checkout-1' },
    { route: '/home?from=footer', name: 'home-2' },
    { route: '/promo?campaign=spring', name: 'promo-1', group: 'marketing' },
    { name: 'misc-1' },
  ];
  const devices = { desktop: {} };
  const baseURL = 'http://localhost:3000';
  const { launchScreenshotsRunner } = await import('../index.js');

  await launchScreenshotsRunner(
    { scenarioData, baseURL, devices, outputDir: 'custom-output' },
    { playwrightChromium: chromiumWithCapture }
  );

  expect(screenshotPaths).toEqual([
    expect.stringContaining(path.join('custom-output', 'desktop-01.001-home-1.png')),
    expect.stringContaining(path.join('custom-output', 'desktop-02.001-checkout-1.png')),
    expect.stringContaining(path.join('custom-output', 'desktop-01.002-home-2.png')),
    expect.stringContaining(path.join('custom-output', 'desktop-03.001-promo-1.png')),
    expect.stringContaining(path.join('custom-output', 'desktop-04.001-misc-1.png')),
  ]);
});

test('launchScreenshotsRunner catches and logs scenario errors (mocked chromium)', async () => {
  const { launchScreenshotsRunner } = await import('../index.js');
  // Mock locator to throw in screenshot (simulates Playwright strict mode error)
  const chromiumWithError = {
    launch: async () => ({
      newContext: async () => ({
        newPage: async () => ({
          waitForLoadState: async () => {},
          evaluate: async () => {},
          locator: () => ({
            screenshot: async () => { throw new Error('strict mode violation: locator error simulated'); },
            boundingBox: async () => ({ width: 100, height: 200 }),
          }),
          goto: async () => {},
          viewportSize: () => ({ width: 800, height: 600 }),
          setViewportSize: async () => {},
        }),
        close: async () => {},
      }),
      close: async () => {},
    }),
  };

  // Spy on console.error to inspect default logger outputs
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

  const scenarioData = [
    { type: 'element', route: '/test', name: 'should-error', selector: 'bad-selector', full: false }
  ];
  const devices = { desktop: {} };
  const baseURL = 'http://localhost:3000';
  await launchScreenshotsRunner({ scenarioData, baseURL, devices }, { playwrightChromium: chromiumWithError });

  // Should have emitted an ERROR line via default logger
  const loggedErrorLine = errorSpy.mock.calls.find(([msg]) => typeof msg === 'string' && msg.includes('ERROR:'));
  expect(loggedErrorLine).toBeTruthy();
  // Should have called error with our thrown error message
  const hadStack = errorSpy.mock.calls.some(([msg]) => (msg || '').toString().includes('locator error simulated'));
  expect(hadStack).toBe(true);
  // Cleanup
  errorSpy.mockRestore();
});

// ---- Special test to check ordering of cleanup relative to scroll/assets/screenshot ----
// Patch utils for test ordering at top-level. Do not move inside test!
const __callOrder = [];
const __loadResult = { timedOut: false };
const __assetTimeout = { throwTimeout: false };
vi.mock('../runners/utils.js', async (importOriginal) => {
  const actual = await importOriginal();

  return {
    ...actual,
    ensureAssetsLoaded: async () => {
      if (__assetTimeout.throwTimeout) {
        __callOrder.push('assetsTimeout');
        const err = new Error('TimeoutError: assets load timeout');
        err.name = 'Error';
        throw err;
      }
      __callOrder.push('assetsLoaded');
    },
    scroll: async () => { __callOrder.push('scroll'); },
    waitForPageLoad: async () => __loadResult
  };
}, { virtual: false });

beforeEach(() => {
  __callOrder.length = 0;
  __loadResult.timedOut = false;
  delete __loadResult.error;
    __assetTimeout.throwTimeout = false;
});

test('cleanup is called after assets loaded, scrolling, and just before screenshot (element/full scenario)', async () => {
  __callOrder.length = 0; // reset

  const chromiumSequenceMock = {
    launch: async () => ({
      newContext: async () => ({
        newPage: async () => ({
          waitForLoadState: async () => {},
          evaluate: async () => {},
          locator: () => ({
            screenshot: async () => { __callOrder.push('screenshot'); },
            boundingBox: async () => ({ width: 100, height: 200 }),
            scrollIntoViewIfNeeded: async () => {},
            evaluate: async () => ({ overX: true, overY: true }), // force scrolling path
          }),
          goto: async () => {},
          viewportSize: () => ({ width: 800, height: 600 }),
          setViewportSize: async () => {},
        }),
        close: async () => {},
      }),
      close: async () => {},
    })
  };
  const scenarioData = [
    {
      type: 'element',
      route: '/test-seq',
      name: 'call-order-scn',
      selector: 'body',
      full: true,
      before: async () => { __callOrder.push('before'); },
      cleanup: (() => { let ran=false; return async ()=>{ if (!ran) { __callOrder.push('cleanup'); ran=true; } } })()
    }
  ];
  const devices = { desktop: {} };
  const baseURL = 'http://localhost:3000';
  // Need to import after the mocks are specified
  const mod = await import('../index.js');
  await expect(
    mod.launchScreenshotsRunner({ scenarioData, baseURL, devices }, { playwrightChromium: chromiumSequenceMock })
  ).resolves.toMatchObject({
    counts: { started: 1, succeeded: 1, skipped: 0, failed: 0 }
  });
  // Call order: before → scroll → assetsLoaded → screenshot → cleanup
  expect(__callOrder).toEqual([
    'before',
    'assetsLoaded',
    'cleanup',
    'screenshot'
  ]);
});

test('load timeout with skip exits before hooks', async () => {
  __loadResult.timedOut = true;
  const beforeSpy = vi.fn();
  const chromiumTimeoutMock = {
    launch: async () => ({
      newContext: async () => ({
        newPage: async () => ({
          goto: async () => {},
          screenshot: async () => {},
          locator: () => ({}),
          viewportSize: () => ({ width: 800, height: 600 }),
          setViewportSize: async () => {},
        }),
        close: async () => {},
      }),
      close: async () => {},
    })
  };

  const scenarioData = [
    { type: 'page', route: '/timeout', name: 'timeout-skip', before: beforeSpy }
  ];
  const devices = { desktop: {} };
  const baseURL = 'http://localhost:3000';
  const { launchScreenshotsRunner } = await import('../index.js');

  await expect(
    launchScreenshotsRunner({ scenarioData, baseURL, devices, loadTimeoutMs: 5, loadTimeoutAction: 'skip' }, { playwrightChromium: chromiumTimeoutMock })
  ).resolves.toMatchObject({
    counts: { started: 1, succeeded: 0, skipped: 1, failed: 0 }
  });

  expect(beforeSpy).not.toHaveBeenCalled();
  expect(__callOrder).toEqual([]);
});

test('load timeout with continue still runs hooks and screenshot', async () => {
  __loadResult.timedOut = true;
  const beforeSpy = vi.fn(() => { __callOrder.push('before'); });
  const chromiumTimeoutMock = {
    launch: async () => ({
      newContext: async () => ({
        newPage: async () => ({
          goto: async () => {},
          screenshot: async () => { __callOrder.push('screenshot'); },
          locator: () => ({}),
          viewportSize: () => ({ width: 800, height: 600 }),
          setViewportSize: async () => {},
        }),
        close: async () => {},
      }),
      close: async () => {},
    })
  };

  const scenarioData = [
    { type: 'page', route: '/timeout', name: 'timeout-continue', before: beforeSpy }
  ];
  const devices = { desktop: {} };
  const baseURL = 'http://localhost:3000';
  const { launchScreenshotsRunner } = await import('../index.js');

  await expect(
    launchScreenshotsRunner({ scenarioData, baseURL, devices, loadTimeoutMs: 5, loadTimeoutAction: 'continue' }, { playwrightChromium: chromiumTimeoutMock })
  ).resolves.toMatchObject({
    counts: { started: 1, succeeded: 1, skipped: 0, failed: 0 }
  });

  expect(beforeSpy).toHaveBeenCalledTimes(1);
  expect(__callOrder).toEqual(['before', 'assetsLoaded', 'screenshot']);
});

test('element load timeout with skip exits before hooks', async () => {
  __loadResult.timedOut = true;
  const beforeSpy = vi.fn(() => { __callOrder.push('before'); });
  const chromiumTimeoutMock = {
    launch: async () => ({
      newContext: async () => ({
        newPage: async () => ({
          goto: async () => {},
          screenshot: async () => { __callOrder.push('page-screenshot'); },
          locator: () => ({
            screenshot: async () => { __callOrder.push('screenshot'); },
            scrollIntoViewIfNeeded: async () => {},
            evaluate: async () => ({ overX: false, overY: false })
          }),
          viewportSize: () => ({ width: 800, height: 600 }),
          setViewportSize: async () => {},
        }),
        close: async () => {},
      }),
      close: async () => {},
    })
  };

  const scenarioData = [
    { type: 'element', route: '/timeout', name: 'element-timeout-skip', selector: '#x', before: beforeSpy }
  ];
  const devices = { desktop: {} };
  const baseURL = 'http://localhost:3000';
  const { launchScreenshotsRunner } = await import('../index.js');

  await expect(
    launchScreenshotsRunner({ scenarioData, baseURL, devices, loadTimeoutMs: 5, loadTimeoutAction: 'skip' }, { playwrightChromium: chromiumTimeoutMock })
  ).resolves.toMatchObject({
    counts: { started: 1, succeeded: 0, skipped: 1, failed: 0 }
  });

  expect(beforeSpy).not.toHaveBeenCalled();
  expect(__callOrder).toEqual([]);
});

test('element load timeout with continue still runs hooks and screenshot', async () => {
  __loadResult.timedOut = true;
  const beforeSpy = vi.fn(() => { __callOrder.push('before'); });
  const cleanupSpy = vi.fn(() => { __callOrder.push('cleanup'); });
  const chromiumTimeoutMock = {
    launch: async () => ({
      newContext: async () => ({
        newPage: async () => ({
          goto: async () => {},
          screenshot: async () => { __callOrder.push('page-screenshot'); },
          locator: () => ({
            screenshot: async () => { __callOrder.push('screenshot'); },
            scrollIntoViewIfNeeded: async () => {},
            evaluate: async () => ({ overX: false, overY: false })
          }),
          viewportSize: () => ({ width: 800, height: 600 }),
          setViewportSize: async () => {},
        }),
        close: async () => {},
      }),
      close: async () => {},
    })
  };

  const scenarioData = [
    { type: 'element', route: '/timeout', name: 'element-timeout-continue', selector: '#x', before: beforeSpy, cleanup: cleanupSpy }
  ];
  const devices = { desktop: {} };
  const baseURL = 'http://localhost:3000';
  const { launchScreenshotsRunner } = await import('../index.js');

  await expect(
    launchScreenshotsRunner({ scenarioData, baseURL, devices, loadTimeoutMs: 5, loadTimeoutAction: 'continue' }, { playwrightChromium: chromiumTimeoutMock })
  ).resolves.toMatchObject({
    counts: { started: 1, succeeded: 1, skipped: 0, failed: 0 }
  });

  expect(beforeSpy).toHaveBeenCalledTimes(1);
  expect(cleanupSpy).toHaveBeenCalledTimes(1);
  expect(__callOrder).toEqual(['before', 'assetsLoaded', 'cleanup', 'screenshot']);
});

test('asset timeout with skip exits before cleanup/screenshot', async () => {
  __assetTimeout.throwTimeout = true;
  const logSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  const chromiumMock = {
    launch: async () => ({
      newContext: async () => ({
        newPage: async () => ({
          goto: async () => {},
          screenshot: async () => { __callOrder.push('screenshot'); },
          locator: () => ({ screenshot: async () => { __callOrder.push('screenshot'); } }),
          viewportSize: () => ({ width: 800, height: 600 }),
          setViewportSize: async () => {},
        }),
        close: async () => {},
      }),
      close: async () => {},
    })
  };
  const scenarioData = [
    { type: 'page', route: '/asset-timeout', name: 'asset-skip', before: () => { __callOrder.push('before'); } }
  ];
  const devices = { desktop: {} };
  const baseURL = 'http://localhost:3000';
  const mod = await import('../index.js');
  await mod.launchScreenshotsRunner({ scenarioData, baseURL, devices, loadTimeoutAction: 'skip' }, { playwrightChromium: chromiumMock });

  expect(__callOrder).toEqual(['before', 'assetsTimeout']);
  const logLine = logSpy.mock.calls.find(c => c.some(v => typeof v === 'string' && v.includes('assets timeout -> skip')));
  expect(logLine).toBeTruthy();
  logSpy.mockRestore();
});

test('asset timeout with continue still runs cleanup and screenshot', async () => {
  __assetTimeout.throwTimeout = true;
  const chromiumMock = {
    launch: async () => ({
      newContext: async () => ({
        newPage: async () => ({
          goto: async () => {},
          screenshot: async () => { __callOrder.push('screenshot'); },
          locator: () => ({ screenshot: async () => { __callOrder.push('screenshot'); } }),
          viewportSize: () => ({ width: 800, height: 600 }),
          setViewportSize: async () => {},
        }),
        close: async () => {},
      }),
      close: async () => {},
    })
  };
  const scenarioData = [
    { type: 'page', route: '/asset-timeout', name: 'asset-continue', before: () => { __callOrder.push('before'); }, cleanup: () => { __callOrder.push('cleanup'); } }
  ];
  const devices = { desktop: {} };
  const baseURL = 'http://localhost:3000';
  const mod = await import('../index.js');
  await mod.launchScreenshotsRunner({ scenarioData, baseURL, devices, loadTimeoutAction: 'continue' }, { playwrightChromium: chromiumMock });

  expect(__callOrder).toEqual(['before', 'assetsTimeout', 'cleanup', 'screenshot']);
});

test('function load timeout honors skip', async () => {
  __loadResult.timedOut = true;
  const beforeSpy = vi.fn();
  const chromiumTimeoutMock = {
    launch: async () => ({
      newContext: async () => ({
        newPage: async () => ({
          goto: async () => {},
          locator: () => ({}),
          screenshot: async () => { __callOrder.push('screenshot'); },
          viewportSize: () => ({ width: 800, height: 600 }),
          setViewportSize: async () => {},
        }),
        close: async () => {},
      }),
      close: async () => {},
    })
  };

  const scenarioData = [
    { type: 'function', route: '/timeout', name: 'function-timeout-skip', selector: '#x', before: beforeSpy }
  ];
  const devices = { desktop: {} };
  const baseURL = 'http://localhost:3000';
  const { launchScreenshotsRunner } = await import('../index.js');

  await expect(
    launchScreenshotsRunner({ scenarioData, baseURL, devices, loadTimeoutMs: 5, loadTimeoutAction: 'skip' }, { playwrightChromium: chromiumTimeoutMock })
  ).resolves.toMatchObject({
    counts: { started: 1, succeeded: 0, skipped: 1, failed: 0 }
  });

  expect(beforeSpy).not.toHaveBeenCalled();
  expect(__callOrder).toEqual([]);
});

test('function load timeout honors continue', async () => {
  __loadResult.timedOut = true;
  const beforeSpy = vi.fn(() => { __callOrder.push('before'); });
  const cleanupSpy = vi.fn(() => { __callOrder.push('cleanup'); });
  const chromiumTimeoutMock = {
    launch: async () => ({
      newContext: async () => ({
        newPage: async () => ({
          goto: async () => {},
          locator: () => ({}),
          screenshot: async () => { __callOrder.push('screenshot'); },
          viewportSize: () => ({ width: 800, height: 600 }),
          setViewportSize: async () => {},
        }),
        close: async () => {},
      }),
      close: async () => {},
    })
  };

  const scenarioData = [
    { type: 'function', route: '/timeout', name: 'function-timeout-continue', selector: '#x', before: beforeSpy, cleanup: cleanupSpy }
  ];
  const devices = { desktop: {} };
  const baseURL = 'http://localhost:3000';
  const { launchScreenshotsRunner } = await import('../index.js');

  await expect(
    launchScreenshotsRunner({ scenarioData, baseURL, devices, loadTimeoutMs: 5, loadTimeoutAction: 'continue' }, { playwrightChromium: chromiumTimeoutMock })
  ).resolves.toMatchObject({
    counts: { started: 1, succeeded: 1, skipped: 0, failed: 0 }
  });

  expect(beforeSpy).toHaveBeenCalledTimes(1);
  expect(cleanupSpy).toHaveBeenCalledTimes(1);
  expect(__callOrder).toEqual(['before', 'assetsLoaded', 'cleanup']);
});
