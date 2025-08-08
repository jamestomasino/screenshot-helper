import { chromium as chromiumDefault } from 'playwright';
import chalk from 'chalk';
import sharp from 'sharp';

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

            if (scn.full) {
              // Mosaic (tiling) mode: capture element using multiple viewport-sized screenshots and stitch
              const boundingBox = await el.boundingBox();
              if (!boundingBox) throw new Error('Element not found or not visible');

              const viewport = page.viewportSize();
              if (!viewport)
                throw new Error("Viewport size detection failed");

              const cols = Math.ceil(boundingBox.width / viewport.width);
              const rows = Math.ceil(boundingBox.height / viewport.height);
              const tileBuffers = [];

              for (let row = 0; row < rows; row++) {
                for (let col = 0; col < cols; col++) {
                  const tileX = Math.floor(boundingBox.x + col * viewport.width);
                  const tileY = Math.floor(boundingBox.y + row * viewport.height);

                  await page.evaluate((x, y) => { window.scrollTo(x, y); }, tileX, tileY);
                  await page.waitForTimeout(100); // let scroll render

                  const clip = {
                    x: tileX,
                    y: tileY,
                    width: Math.min(viewport.width, Math.ceil(boundingBox.width - (col * viewport.width))),
                    height: Math.min(viewport.height, Math.ceil(boundingBox.height - (row * viewport.height)))
                  };
                  tileBuffers.push(await page.screenshot({ clip }));
                }
              }

              // Compose mosaic image
              // Compose mosaic image: lay tiles out in a blank image using sharp composite
              let stitchedImage = sharp({
                create: {
                  width: Math.ceil(boundingBox.width),
                  height: Math.ceil(boundingBox.height),
                  channels: 4,
                  background: { r: 0, g: 0, b: 0, alpha: 0 }
                }
              });
              const composites = [];
              let idx = 0;
              for (let row = 0; row < rows; row++) {
                for (let col = 0; col < cols; col++) {
                  composites.push({
                    input: tileBuffers[idx++],
                    left: col * viewport.width,
                    top: row * viewport.height,
                  });
                }
              }
              stitchedImage = stitchedImage.composite(composites);
              await stitchedImage.png().toFile(filename);
            } else {
              await el.screenshot({ path: filename });
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
