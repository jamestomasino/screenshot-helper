// Refactored: accepts playwrightChromium as a parameter for dependency injection (test mocking support)
import { chromium as chromiumDefault } from 'playwright';
import chalk from 'chalk';

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
          if (scn.before) {
            try {
              beforeResult = await scn.before(page, page.locator(scn.selector), device);
            } catch (err) {
              beforeResult = false;
              console.error(chalk.redBright(`[screenshot-helper] Error in 'before' (function type) for scenario '${scn.name}' on device '${device}':`), err);
            }
          }
          if (beforeResult !== false) {
            await ensureAssetsLoaded(page);
            if (scn.cleanup) {
              try {
                await scn.cleanup(page, page.locator(scn.selector), device);
              } catch (err) {
                console.error(chalk.redBright(`[screenshot-helper] Error in 'cleanup' (function type) for scenario '${scn.name}' on device '${device}':`), err);
              }
            }
          }
          break;

        case 'element':
          shotNum++;
          filename = `screenshots/${device}-${String(shotNum).padStart(3, '0')}-${scn.name}.png`;
          if (filter && !filename.includes(filter)) return;
          await page.goto(baseURL + scn.route);
          await page.waitForLoadState('networkidle');
          if (scn.before) {
            try {
              beforeResult = await scn.before(page, page.locator(scn.selector), device);
            } catch (err) {
              beforeResult = false;
              console.error(chalk.redBright(`[screenshot-helper] Error in 'before' (element type) for scenario '${scn.name}' on device '${device}':`), err);
            }
          }
          if (beforeResult !== false) {
            await ensureAssetsLoaded(page);
            if (scn.cleanup) {
              try {
                await scn.cleanup(page, page.locator(scn.selector), device);
              } catch (err) {
                console.error(chalk.redBright(`[screenshot-helper] Error in 'cleanup' (element type) for scenario '${scn.name}' on device '${device}':`), err);
              }
            }
            console.log(chalk.green.bold(`[${device}]`), chalk.cyan(`#${shotNum}`), chalk.white('-'), chalk.yellow(scn.name));
            const el = await page.locator(scn.selector);
            if (!el) return false

            let originalViewport;
            if (scn.full) {
              // if full is set, resize viewport to the element temporarily to see all of it
              const boundingBox = await el.boundingBox();
              if (!boundingBox) throw new Error('Element not found or not visible');

              // Remember the original viewport size
              originalViewport = page.viewportSize();

              // Set the viewport to fit the element
              await page.setViewportSize({
                width: Math.ceil(boundingBox.width),
                height: Math.ceil(boundingBox.height)
              });
              // Ensure html/body min-width allows wide elements to be fully rendered
              await page.evaluate((sel, w) => {
                const el = document.querySelector(sel);
                if (!el) return;
                // Only widen body/html if element would overflow
                if (el.offsetWidth > document.documentElement.offsetWidth) {
                  document.documentElement.style.minWidth = el.offsetWidth + 'px';
                  document.body.style.minWidth = el.offsetWidth + 'px';
                }
              }, scn.selector, Math.ceil(boundingBox.width));
            }
            await el.screenshot({ path: filename });
            if (scn.full) {
              // now restore the old viewport
              await page.setViewportSize(originalViewport);
            }
          }
          break;

        default:
          shotNum++;
          filename = `screenshots/${device}-${String(shotNum).padStart(3, '0')}-${scn.name}.png`;
          if (filter && !filename.includes(filter)) return;
          await page.goto(baseURL + scn.route);
          await page.waitForLoadState('networkidle');
          if (scn.before) {
            try {
              beforeResult = await scn.before(page, undefined, device);
            } catch (err) {
              beforeResult = false;
              console.error(chalk.redBright(`[screenshot-helper] Error in 'before' for scenario '${scn.name}' on device '${device}':`), err);
            }
          }
          if (beforeResult !== false) {
            if (scn.full) { await scroll(page); }
            await ensureAssetsLoaded(page);
            if (scn.cleanup) {
              try {
                await scn.cleanup(page, undefined, device);
              } catch (err) {
                console.error(chalk.redBright(`[screenshot-helper] Error in 'cleanup' for scenario '${scn.name}' on device '${device}':`), err);
              }
            }
            console.log(chalk.green.bold(`[${device}]`), chalk.cyan(`#${shotNum}`), chalk.white('-'), chalk.yellow(scn.name));
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
