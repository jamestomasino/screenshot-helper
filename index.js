// Refactored: accepts playwrightChromium as a parameter for dependency injection (test mocking support)
import { chromium as chromiumDefault } from 'playwright';

async function ensureAssetsLoaded(page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(async () => {
    const imgs = Array.from(document.images);
    await Promise.all(imgs.map(img => {
      if (img.complete) return;
      return new Promise(res => { img.onload = img.onerror = res; });
    }));
    if ('fonts' in document) await document.fonts.ready;
  });
}

async function scroll(page) {
  return await page.evaluate(async () => {
    return await new Promise((resolve) => {
      var i = setInterval(() => {
        window.scrollBy(0, window.innerHeight);
        if (document.scrollingElement.scrollTop + window.innerHeight >= document.scrollingElement.scrollHeight) {
          clearInterval(i);
          resolve();
        }
      }, 100);
    });
  });
}

function makeRunner({ browser, baseURL, scenarioData, device, contextOptions, filter }) {
  return async function () {
    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();
    let shotNum = 0;

    async function runScenario(scn) {
      let filename;
      let beforeResult = true;
      switch (scn.type) {
        case 'function':
          await page.goto(baseURL + scn.route);
          await page.waitForLoadState('networkidle');
          if (scn.before) beforeResult = await scn.before(page, page.locator(scn.selector));
          if (beforeResult !== false) {
            await ensureAssetsLoaded(page);
            if (scn.cleanup) await scn.cleanup(page, page.locator(scn.selector));
          }
          break;

        case 'element':
          shotNum++;
          filename = `screenshots/${device}-${String(shotNum).padStart(3, '0')}-${scn.name}.png`;
          if (filter && !filename.includes(filter)) return;
          await page.goto(baseURL + scn.route);
          await page.waitForLoadState('networkidle');
          if (scn.before) beforeResult = await scn.before(page, page.locator(scn.selector));
          if (beforeResult !== false) {
            await ensureAssetsLoaded(page);
            if (scn.cleanup) await scn.cleanup(page, page.locator(scn.selector));
            console.log(`${shotNum} ${device} - ${scn.name}`);
            const el = await page.locator(scn.selector);
            await el.screenshot({ path: filename });
          }
          break;

        default:
          shotNum++;
          filename = `screenshots/${device}-${String(shotNum).padStart(3, '0')}-${scn.name}.png`;
          if (filter && !filename.includes(filter)) return;
          await page.goto(baseURL + scn.route);
          await page.waitForLoadState('networkidle');
          if (scn.before) beforeResult = await scn.before(page);
          if (beforeResult !== false) {
            if (scn.full) { await scroll(page); }
            await ensureAssetsLoaded(page);
            if (scn.cleanup) await scn.cleanup(page);
            console.log(`${shotNum} ${device} - ${scn.name}`);
            await page.screenshot({ path: filename, fullPage: !!scn.full });
          }
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
  // Use injected chromium, or real Chromium if none provided
  const chromium = playwrightChromium || chromiumDefault;
  const browser = await chromium.launch();
  try {
    await Promise.all(
      Object.entries(devices).map(([device, contextOptionsRaw]) => {
        // Merge httpCredentials into contextOptions if specified
        const contextOptions = httpCredentials ? { ...contextOptionsRaw, httpCredentials } : contextOptionsRaw;
        return makeRunner({ browser, baseURL, scenarioData, device, contextOptions, filter })();
      })
    );
  } finally {
    await browser.close();
  }
}

export default launchScreenshotsRunner;
