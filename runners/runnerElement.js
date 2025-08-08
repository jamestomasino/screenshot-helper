import { ensureAssetsLoaded } from './utils.js';
import chalk from 'chalk';

export default async function runElementScenario({ page, baseURL, scn, device, filter, shotNum }) {
  let filename;
  let beforeResult = true;
  shotNum++;
  filename = `screenshots/${device}-${String(shotNum).padStart(3, '0')}-${scn.name}.png`;
  if (filter && !filename.includes(filter)) return shotNum;
  await page.goto(baseURL + scn.route);
  await page.waitForLoadState('networkidle');
  if (scn.before) {
    try {
      beforeResult = await scn.before(page, page.locator(scn.selector), device);
    } catch (err) {
      beforeResult = false;
      throw new Error(`[element type] 'before' threw: ${err}`);
    }
  }
  if (beforeResult === false) return shotNum;
  await ensureAssetsLoaded(page);
  if (scn.cleanup) {
    try {
      await scn.cleanup(page, page.locator(scn.selector), device);
    } catch (err) {
      throw new Error(`[element type] 'cleanup' threw: ${err}`);
    }
  }
  const el = await page.locator(scn.selector);
  if (!el) return shotNum;
  console.log(chalk.green.bold(`[${device}]`), chalk.cyan(`#${shotNum}`), chalk.white('-'), chalk.yellow(scn.name));
  if (scn.full) {
    await screenshotFullOverflowX(page, scn.selector, filename);
  } else {
    await el.screenshot({ path: filename });
  }
  return shotNum;
}

async function screenshotFullOverflowX(page, selector, outPath) {
  const el = page.locator(selector);
  await el.scrollIntoViewIfNeeded();

  // If no horizontal overflow, just shoot it.
  const { cw, sw } = await el.evaluate(n => ({ cw: n.clientWidth, sw: n.scrollWidth }));
  if (sw <= cw) {
    await el.screenshot({ path: outPath, animations: 'disabled' });
    return;
  }

  // 1) Relax overflow site-wide temporarily
  const styleHandle = await page.addStyleTag({
    content: `*,html,body{overflow:visible !important;}`
  });

  // 2) Expand the element to its full scrollable width
  await el.evaluate(node => {
    node.setAttribute('data-ss-prev-width', node.style.width || '');
    node.setAttribute('data-ss-prev-maxwidth', node.style.maxWidth || '');
    node.setAttribute('data-ss-prev-overflow', node.style.overflow || '');
    node.style.width = node.scrollWidth + 'px';
    node.style.maxWidth = 'none';
    node.style.overflow = 'visible';
  });

  // Let layout settle
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

  // 3) Screenshot the full element
  await el.screenshot({ path: outPath, animations: 'disabled' });

  // 4) Restore styles
  await el.evaluate(node => {
    node.style.width = node.getAttribute('data-ss-prev-width') || '';
    node.style.maxWidth = node.getAttribute('data-ss-prev-maxwidth') || '';
    node.style.overflow = node.getAttribute('data-ss-prev-overflow') || '';
    node.removeAttribute('data-ss-prev-width');
    node.removeAttribute('data-ss-prev-maxwidth');
    node.removeAttribute('data-ss-prev-overflow');
  });
  await styleHandle.evaluate(n => n.remove());
}
