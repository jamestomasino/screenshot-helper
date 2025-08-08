import http from 'http';
import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';

const TEST_PORT = 54321;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const SCREENSHOT_PATTERN = `screenshots/desktop-001*-mosaic-test.png`;
const TEST_HTML = `
<!DOCTYPE html>
<html><head><title>Mosaic Test</title></head>
<body>
  <div id="giant" style="width:1300px;height:900px;background:red;"></div>
</body></html>
`;

import { launchScreenshotsRunner } from '../index.js';
import { chromium } from 'playwright';

describe('Full mosaic (tiling) PNG output [integration]', () => {
  let server;
  beforeAll(done => {
    server = http.createServer((req, res) => {
      res.writeHead(200, {'Content-Type': 'text/html'});
      res.end(TEST_HTML);
    }).listen(TEST_PORT, done);
  });
  afterAll(async () => {
    server.close();
    for (const fname of await glob(SCREENSHOT_PATTERN)) {
      try { await fs.unlink(fname); } catch {}
    }
  });

  it('should produce all mosaic PNG tiles for element fragmenting', async () => {
    const scenarioData = [
      {
        type: 'element',
        route: '/',
        name: 'mosaic-test',
        selector: '#giant',
        full: true
      }
    ];
    const devices = { desktop: { viewport: { width: 400, height: 300 }}};
    await launchScreenshotsRunner({ scenarioData, baseURL: BASE_URL, devices }, { playwrightChromium: chromium });
    // Expect 4 cols x 3 rows = 12 fragments
    const matches = await glob(SCREENSHOT_PATTERN);
    expect(matches.length).toBe(12);
    // Assert PNG fragments are valid and nonempty
    for (const file of matches) {
      const stat = await fs.stat(file);
      expect(stat.size).toBeGreaterThan(0);
      const buf = await fs.readFile(file);
      const sig = Array.from(buf.slice(0, 8));
      expect(sig).toEqual([137,80,78,71,13,10,26,10]);
    }
  }, 20000);
});
