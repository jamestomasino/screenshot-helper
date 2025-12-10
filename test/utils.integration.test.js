import http from 'http';
import { chromium } from 'playwright';
import { ensureAssetsLoaded, scroll } from '../runners/utils.js';

const TEST_PORT = 54322;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const skipPlaywright = ['1', 'true'].includes((process.env.SKIP_PLAYWRIGHT_TESTS || '').toLowerCase()) || ['true', '1'].includes((process.env.CI || '').toLowerCase());
const IMG = '<img id="imgslow" src="/slow.png" width=100 height=50>'; // Triggers slowly
const FAST_IMG = '<img id="imgfast" src="/fast.png" width=100 height=50>';
const TEST_HTML = (extra = '') => `
<!DOCTYPE html>
<html><head><title>Utils Test</title></head><body>${extra}</body></html>`;

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const describeFn = skipPlaywright ? describe.skip : describe;

describeFn('utils.js integration (Playwright)', () => {
  let server;
  beforeAll(done => {
    server = http.createServer((req, res) => {
      if (req.url === '/slow.png') {
        setTimeout(() => {
          res.writeHead(200, { 'Content-Type': 'image/png' });
          res.end(Buffer.alloc(100));
        }, 500); // delay slow image
        return;
      }
      if (req.url === '/fast.png') {
        res.writeHead(200, { 'Content-Type': 'image/png' });
        res.end(Buffer.alloc(100));
        return;
      }
      if (req.url === '/never.png') {
        // Intentionally never respond to simulate a hanging asset
        return;
      }
      res.writeHead(200, {'Content-Type': 'text/html'});
      res.end(TEST_HTML(IMG + FAST_IMG));
    }).listen(TEST_PORT, done);
  });
  afterAll(() => server.close());

  it('ensureAssetsLoaded waits for all images (including slow)', async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto(BASE_URL);
    const t0 = Date.now();
    await ensureAssetsLoaded(page);
    const t1 = Date.now();
    expect(t1 - t0).toBeGreaterThan(400); // Should wait at least 400ms for slow image
    await browser.close();
  }, 10000);

  it('ensureAssetsLoaded immediate with no assets', async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.setContent('<html><body><div>Empty</div></body></html>');
    const t0 = Date.now();
    await ensureAssetsLoaded(page);
    const t1 = Date.now();
    expect(t1 - t0).toBeLessThanOrEqual(800); // Should complete quickly in VM
    await browser.close();
  }, 10000);

  it('ensureAssetsLoaded respects timeout when assets hang', async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.setContent(`<html><body><img src="${BASE_URL}/never.png" width="10" height="10" /></body></html>`, { waitUntil: 'domcontentloaded' });
    await expect(ensureAssetsLoaded(page, { waitForLoad: false, loadTimeoutMs: 300 })).rejects.toThrow(/assets load timeout/i);
    await browser.close();
  }, 10000);

  it('scroll helper scrolls to end of tall page', async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.setContent('<html><body style="height:1600px;"><div style="height:1600px;"></div></body></html>');
    await page.evaluate(() => { window.scrollTo(0, 0); });
    await scroll(page);
    const finalY = await page.evaluate(() => window.scrollY);
    expect(finalY).toBeGreaterThanOrEqual(800);
    await browser.close();
  }, 10000);
});
