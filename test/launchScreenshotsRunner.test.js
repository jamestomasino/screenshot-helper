import { launchScreenshotsRunner } from '../index.js';

// ----------- UNIT TEST (Dependency injection for Playwright) -----------
const chromiumMock = {
  launch: async () => ({
    newContext: async () => ({
      newPage: async () => ({
        waitForLoadState: async () => {},
        evaluate: async () => {},
        locator: () => ({
          screenshot: async () => {},
        }),
        goto: async () => {},
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

// ----------- INTEGRATION/E2E TEST (Real Playwright) -----------
//
// UNCOMMENT to run a real Playwright test (not for CI!)
// Requires a running HTTP server on baseURL, and will launch a real browser window.
//
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
