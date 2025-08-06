# screenshot-helper

Automate high-quality screenshots of web pages for testing, visual review, and documentation.

**screenshot-helper** is a flexible Node.js utility designed to programmatically capture screenshots of web apps with minimal boilerplate. It supports scenario lists, custom setup and cleanup logic, device presets, and easy integration into your QA or CI flows.

---

## Features

- Automates screenshots from a scenario configuration
- Works with [Playwright](https://playwright.dev/) to simulate real browser environments (desktop/mobile, etc.)
- Supports UI interaction setup (`before`) and post-setup cleanup (`cleanup`)
- Granular capture: full-page, clipped to element, function-based, etc.
- Use filters to selectively run a subset of scenarios
- Strong integration for visual testing and asset generation

---

## Installation

```sh
npm install screenshot-helper
```
or
```sh
yarn add screenshot-helper
```

---

## Basic Usage

Define your scenarios and call the runner. Each scenario can have:

- `name`: Unique name for the output file
- `route`: URL path (relative to your baseURL)
- `full`: Capture the entire page (`true`) or just the viewport (`false`)
- `selector`: (optional) CSS selector for element-only screenshots  
- `before`: (optional) Async function for custom setup (e.g., open a modal, wait for element)
- `cleanup`: (optional) Async function for removing overlays/ads/etc before the screenshot

```js
import launchScreenshotsRunner from 'screenshot-helper';

const baseURL = 'http://localhost:8888';
const devices = {
  desktop: { viewport: { width: 1280, height: 1080 }, deviceScaleFactor: 2 },
  mobile: { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 }
};

const scenarioData = [
  {
    name: 'simple-homepage',
    route: '/',
    full: true
  },
  {
    name: 'cookie-banner',
    route: '/',
    selector: '#cookie-consent-banner',
    before: async (page, locator) => {
      await page.waitForFunction(() => !!window.cookieconsent);
      await page.evaluate(() => window.cookieconsent.show());
      if (!await locator.isVisible()) return false; // skip screenshot if banner is not visible
    }
  },
  {
    name: 'third-party-capture',
    route: '/external-widget-demo',
    before: async page => {
      await page.click('#widget-opener');
    },
    cleanup: async page => {
      await page.evaluate(() => {
        let el = document.querySelector('.third-party-banner');
        if (el) el.remove();
      });
    },
    full: true
  }
];

// Optionally pass a filter to only run a subset of scenarios
const filter = process.argv[2];

launchScreenshotsRunner({ scenarioData, baseURL, devices, filter });
```

---

### Scenario Configuration

- **name**: string (required)  
  Used for the output filename and reporting.
- **route**: string (required)  
  Path relative to `baseURL`
- **full**: boolean  
  Capture the entire page (`true`) or just viewport/selector area (`false`)
- **selector**: string  
  CSS selector for element screenshot (optional; use type: 'element' for clarity)
- **before**: `(page, locator?) => Promise`  
  An async function run prior to the screenshot, for setup (e.g., open menus, wait for content)
- **cleanup**: `(page) => Promise`  
  An async function run just before the screenshot (after setup), ideal to remove overlays/ads, etc.

---

## Advanced Patterns

Use `type: 'element'` for element screenshots, or `type: 'function'` scenarios for full scriptable logic.  
You can chain Playwright's `page` and `locator` methods inside your hooks, interact with dynamic JS elements, or conditionally skip screenshots.

---

## CLI Filtering

You can filter which scenarios are run by passing a substring as a CLI argument:
```sh
node screenshots.js homepage
```
Will only run scenarios whose `name` includes "homepage".

---

## Testing

Run tests with:

```sh
npm test
```

Unit and integration tests are in [test/].

---

## Contributing

PRs and suggestions welcome! Please open an issue first to discuss feature ideas or bugs.

---

## License

ISC (see LICENSE file)

---

**See also:**  
- [test/launchScreenshotsRunner.test.js](./test/launchScreenshotsRunner.test.js) for more usage patterns

---

Let me know if you want even more detail, CLI flag docs, or extended API explanations!
