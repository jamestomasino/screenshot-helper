import { jest } from '@jest/globals';
import { launchScreenshotsRunner } from '../index.js';
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

  await expect(
    launchScreenshotsRunner({ scenarioData, baseURL, devices }, { playwrightChromium: chromiumMock })
  ).resolves.toBeUndefined();
});

test('launchScreenshotsRunner captures full element if `full: true` is set (mocked chromium)', async () => {
  // We add jest.fn() spies to check call behavior
  const mockScreenshot = jest.fn();
  const mockBoundingBox = jest.fn().mockResolvedValue({ width: 123, height: 234 });
  const mockSetViewportSize = jest.fn();
  const mockViewportSize = jest.fn().mockReturnValue({ width: 800, height: 600 });
  const chromiumSpy = {
    launch: async () => ({
      newContext: async () => ({
        newPage: async () => ({
          waitForLoadState: async () => {},
          evaluate: async () => {},
          locator: (selector) => ({
            screenshot: mockScreenshot,
            boundingBox: mockBoundingBox,
          }),
          goto: async () => {},
          viewportSize: mockViewportSize,
          setViewportSize: mockSetViewportSize,
        }),
        close: async () => {},
      }),
      close: async () => {},
    }),
  };
  const scenarioData = [
    { type: 'element', route: '/test', name: 'test-full-elem', selector: 'body', full: true }
  ];
  const baseURL = 'http://localhost:3000';
  const devices = { desktop: {} };
  await launchScreenshotsRunner(
    { scenarioData, baseURL, devices },
    { playwrightChromium: chromiumSpy }
  );
  expect(mockBoundingBox).toHaveBeenCalled();
  expect(mockSetViewportSize).toHaveBeenCalledWith({ width: 123, height: 234 });
  expect(mockScreenshot).toHaveBeenCalled();
  // Should restore original viewport after
  expect(mockSetViewportSize).toHaveBeenCalledWith({ width: 800, height: 600 });
});

// ----------- UNIT TEST: CJS dynamic require as users would do -----------
test('CJS usage via require dynamic import (returns Promise)', async () => {
  // _dirname polyfill for ESM
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  // Path to our package's CJS entry
  const pkgMain = path.resolve(__dirname, '../index.cjs');

  const scenarioData = [
    { type: 'element', route: '/test', name: 'test-cjs', selector: 'body' }
  ];
  const devices = { desktop: {} };
  const baseURL = 'http://localhost:3000';

  // Dynamically require (should resolve to an async fn)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const cjsExportAsync = await (await import(pkgMain)).default;
  expect(typeof cjsExportAsync).toBe('function');
  // Should accept injected mock chromium
  await expect(
    cjsExportAsync({ scenarioData, baseURL, devices }, { playwrightChromium: chromiumMock })
  ).resolves.toBeUndefined();
});

// ----------- INTEGRATION/E2E TEST (Real Playwright) -----------
// UNCOMMENT to run a real Playwright test (not for CI!)
// import { chromium } from 'playwright';
// test('launchScreenshotsRunner completes real run (opens a browser window)', async () => {
//   const scenarioData = [
//     { type: 'element', route: '/', name: 'root-page', selector: 'body' }
//   ];
//   const devices = { desktop: {} };
//   const baseURL = 'http://localhost:8080'; // Change as appropriate, must be running
//   await expect(
//     launchScreenshotsRunner({ scenarioData, baseURL, devices }, { playwrightChromium: chromium })
//   ).resolves.toBeUndefined();
// }, 10000);
