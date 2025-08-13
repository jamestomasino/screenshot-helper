import { ensureAssetsLoaded } from './utils.js';
import chalk from 'chalk';

// -------------------------
const logShot = (device, shotNum, name) =>
  console.log(chalk.green.bold(`[${device}]`), chalk.cyan(`#${shotNum}`), chalk.white('-'), chalk.yellow(name));

const waitTwoFrames = (page) => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

export default async function runElementScenario({ page, baseURL, scn, device, filter, shotNum }) {
  shotNum++;
  const filename = `screenshots/${device}-${String(shotNum).padStart(3, '0')}-${scn.name}.png`;
  if (filter && !filename.includes(filter)) return shotNum;

  await page.goto(baseURL + scn.route);
  await page.waitForLoadState('networkidle');

  const target = page.locator(scn.selector);
  if (scn.before) {
    try { if (await scn.before(page, target, device) === false) return shotNum; }
    catch (err) { throw new Error(`[element type] 'before' threw: ${err}`); }
  }

  await ensureAssetsLoaded(page);
  logShot(device, shotNum, scn.name);

  // --------- FULL element branch ---------
  if (scn.full) {
    await target.scrollIntoViewIfNeeded();
    const { overX, overY } = await target.evaluate(n => ({
      overX: n.scrollWidth > n.clientWidth,
      overY: n.scrollHeight > n.clientHeight
    }));
    const needX = overX, needY = overY;
    let restored = false;

    async function expandToNaturalSize(el, needX, needY) {
      return el.evaluate((node, { needX, needY }) => {
        function remember(el, prop, val) {
          const key = `ss_${prop}`;
          if (el.dataset[key] === undefined) el.dataset[key] = el.style[prop] || '';
          el.style[prop] = val;
        }
        for (let p = node.parentElement; p; p = p.parentElement) {
          const cs = getComputedStyle(p);
          if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') remember(p, 'overflow', 'visible');
          if (cs.clipPath !== 'none') remember(p, 'clipPath', 'none');
          if (cs.mask !== 'none')     remember(p, 'mask', 'none');
          if (cs.contain !== 'none')  remember(p, 'contain', 'none');
        }
        if (needX) {
          let w = node.tagName === 'TABLE'
            ? (() => { const clone = node.cloneNode(true);
                Object.assign(clone.style, {position:'absolute',visibility:'hidden',left:'-100000px',top:'0',width:'auto',maxWidth:'none',tableLayout:'auto'});
                document.body.appendChild(clone);
                const v = Math.ceil(Math.max(clone.scrollWidth, clone.offsetWidth, clone.getBoundingClientRect().width));
                clone.remove(); return v; })()
            : Math.max(node.scrollWidth, node.getBoundingClientRect().width);
          remember(node, 'maxWidth', 'none');
          remember(node, 'width', `${w}px`);
        }
        if (needY) {
          const h = Math.max(node.scrollHeight, node.getBoundingClientRect().height);
          remember(node, 'maxHeight', 'none');
          remember(node, 'height', `${h}px`);
        }
        remember(node, 'overflow', 'visible');
        // Expand scroll container if needed
        const findScroller = (start) => {
          for (let a = start.parentElement; a; a = a.parentElement) {
            const cs = getComputedStyle(a);
            const clips = (cs.overflowX !== 'visible' || cs.overflowY !== 'visible');
            const scrollX = a.scrollWidth  > a.clientWidth;
            const scrollY = a.scrollHeight > a.clientHeight;
            if (clips && ((needX && scrollX) || (needY && scrollY))) return a;
          }
          return null;
        };
        const scroller = findScroller(node);
        if (scroller) {
          if (needX) { remember(scroller, 'maxWidth', 'none'); remember(scroller, 'width',  `${node.scrollWidth}px`); }
          if (needY) { remember(scroller, 'maxHeight','none'); remember(scroller, 'height', `${node.scrollHeight}px`); }
          remember(scroller, 'overflow', 'visible');
        }
        document.documentElement.dataset.ssTouched = '1';
        return true;
      }, { needX, needY });
    }

    async function restoreExpandedStyles() {
      if (restored) return;
      await page.evaluate(() => {
        if (!document.documentElement.dataset.ssTouched) return;
        for (const el of document.querySelectorAll('*')) {
          for (const [k, v] of Object.entries(el.dataset)) {
            if (k.startsWith('ss_')) {
              const prop = k.slice(3);
              try { el.style[prop] = v || ''; } catch {}
              delete el.dataset[k];
            }
          }
        }
        delete document.documentElement.dataset.ssTouched;
      });
      restored = true;
    }
    await expandToNaturalSize(target, needX, needY);
    await waitTwoFrames(page);
    const fits = await target.evaluate((node, { needX, needY }) => {
      const rect = node.getBoundingClientRect();
      const wOk = !needX || Math.round(rect.width)  >= Math.round(node.scrollWidth);
      const hOk = !needY || Math.round(rect.height) >= Math.round(node.scrollHeight);
      return wOk && hOk;
    }, { needX, needY });
    if (!fits) {
      await restoreExpandedStyles();
      // fallback: scale page
      const vp = page.viewportSize();
      const { sw, sh } = await target.evaluate(n => ({ sw: n.scrollWidth, sh: n.scrollHeight }));
      const scale = Math.min(1, vp.width / sw, vp.height / sh);
      await page.evaluate((s) => {
        const html = document.documentElement, body = document.body;
        html.dataset.ss_overflow = html.style.overflow || '';
        body.dataset.ss_overflow = body.style.overflow || '';
        html.style.overflow = 'visible';
        body.style.overflow = 'visible';
        let wrap = document.getElementById('__sswrap__');
        if (!wrap) { wrap = document.createElement('div'); wrap.id = '__sswrap__'; while (body.firstChild) wrap.appendChild(body.firstChild); body.appendChild(wrap); }
        wrap.dataset.ss_transform = wrap.style.transform || '';
        wrap.dataset.ss_origin    = wrap.style.transformOrigin || '';
        wrap.dataset.ss_width     = wrap.style.width || '';
        wrap.style.transformOrigin = 'top left';
        wrap.style.transform = `scale(${s})`;
        wrap.style.width = (100 / s) + '%';
      }, scale);
      await waitTwoFrames(page);
      if (scn.cleanup) await scn.cleanup(page, target, device);
      await target.screenshot({ path: filename, animations: 'disabled' });
      await page.evaluate(() => {
        const html = document.documentElement, body = document.body, wrap = document.getElementById('__sswrap__');
        if (wrap) { while (wrap.firstChild) body.appendChild(wrap.firstChild); wrap.remove(); }
        html.style.overflow = html.dataset.ss_overflow || '';
        body.style.overflow = body.dataset.ss_overflow || '';
        delete html.dataset.ss_overflow;
        delete body.dataset.ss_overflow;
      });
      return shotNum;
    }
    if (scn.cleanup) await scn.cleanup(page, target, device);
    await target.screenshot({ path: filename, animations: 'disabled' });
    await restoreExpandedStyles();
  } else {
    if (scn.cleanup) await scn.cleanup(page, target, device);
    await target.screenshot({ path: filename, animations: 'disabled' });
  }
  return shotNum;
}
