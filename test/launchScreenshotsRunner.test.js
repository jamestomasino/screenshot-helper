import { test, expect, vi } from 'vitest';
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
vi.mock('../runners/utils.js', () => ({
  ensureAssetsLoaded: async () => { __callOrder.push('assetsLoaded'); },
  scroll: async () => { __callOrder.push('scroll'); }
}), { virtual: false });

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
