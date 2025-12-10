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
  ).resolves.toBeUndefined();
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

  // Spy on console.log and console.error to inspect outputs
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

  const scenarioData = [
    { type: 'element', route: '/test', name: 'should-error', selector: 'bad-selector', full: false }
  ];
  const devices = { desktop: {} };
  const baseURL = 'http://localhost:3000';
  await launchScreenshotsRunner({ scenarioData, baseURL, devices }, { playwrightChromium: chromiumWithError });

  // Should have called log with red ERROR
  const loggedErrorLine = logSpy.mock.calls.find(([msg]) => typeof msg === 'string' && msg.includes('ERROR:'));
  expect(loggedErrorLine).toBeTruthy();
  // Should have called error with our thrown error message
  const hadStack = errorSpy.mock.calls.some(([msg]) => (msg || '').toString().includes('locator error simulated'));
  expect(hadStack).toBe(true);
  // Cleanup
  logSpy.mockRestore();
  errorSpy.mockRestore();
});

// ---- Special test to check ordering of cleanup relative to scroll/assets/screenshot ----
// Patch utils for test ordering at top-level. Do not move inside test!
const __callOrder = [];
const __loadResult = { timedOut: false };
const __assetTimeout = { throwTimeout: false };
vi.mock('../runners/utils.js', () => ({
  ensureAssetsLoaded: async () => {
    if (__assetTimeout.throwTimeout) {
      __callOrder.push('assetsTimeout');
      const err = new Error('assets timed out');
      err.name = 'TimeoutError';
      throw err;
    }
    __callOrder.push('assetsLoaded');
  },
  scroll: async () => { __callOrder.push('scroll'); },
  waitForPageLoad: async () => __loadResult
}), { virtual: false });

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
  ).resolves.toBeUndefined();
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
  ).resolves.toBeUndefined();

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
  ).resolves.toBeUndefined();

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
  ).resolves.toBeUndefined();

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
  ).resolves.toBeUndefined();

  expect(beforeSpy).toHaveBeenCalledTimes(1);
  expect(cleanupSpy).toHaveBeenCalledTimes(1);
  expect(__callOrder).toEqual(['before', 'assetsLoaded', 'cleanup', 'screenshot']);
});

test('asset timeout with skip exits before cleanup/screenshot', async () => {
  __assetTimeout.throwTimeout = true;
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
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
  ).resolves.toBeUndefined();

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
  ).resolves.toBeUndefined();

  expect(beforeSpy).toHaveBeenCalledTimes(1);
  expect(cleanupSpy).toHaveBeenCalledTimes(1);
  expect(__callOrder).toEqual(['before', 'assetsLoaded', 'cleanup']);
});
