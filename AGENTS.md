# Repository Guidelines

## Project Structure & Module Organization
- Entry points: `index.js` (ESM) and `index.cjs` (CJS) export `launchScreenshotsRunner`.
- Scenario execution is split into `runners/runnerPage.js`, `runners/runnerElement.js`, and `runners/runnerFunction.js`; shared helpers live in `runners/utils.js`.
- Tests reside in `test/` (Vitest `.test.js` files). Screenshot outputs are written to `screenshots/` and are safe to clean between runs.
- Sample assets live under `screenshots/`; no compiled artifacts are tracked. Element tiling logic was removed—only standard screenshots are supported.

## Build, Test, and Development Commands
- `npm install` — fetch dependencies (no build step required).
- `npm test` — run the Vitest suite headlessly once (no watch).
- `npx vitest run test/launchScreenshotsRunner.test.js` — focus on a single file.
- Local runs: import `launchScreenshotsRunner` and pass `{ scenarioData, baseURL, devices, filter?, httpCredentials? }`; call via `node -e "import('./index.js').then(m=>m.launchScreenshotsRunner(...))"` or from your own harness.
- Optional hygiene: `npx eslint .` and `npx prettier --check .` if you add those dev dependencies.
- Versioning: use `npm version [patch|minor|major]` so package.json and git tags stay in sync.
- Runtime options: use `loadTimeoutMs` plus `loadTimeoutAction: 'skip' | 'continue'` to handle pages that never reach `networkidle`.

## Coding Style & Naming Conventions
- JavaScript ESM-first; prefer `async/await`. Keep imports ordered by external, then local modules.
- Indent with 2 spaces; include semicolons; avoid trailing whitespace.
- Naming: camelCase for vars/functions, PascalCase for classes, kebab-case for filenames. Use descriptive scenario names; screenshot files follow `screenshots/{device}-NNN-{scenario}.png`.
- Keep runner functions small and pure; avoid side effects outside logging and Playwright interactions.
- New helpers belong in `runners/utils.js` when shared; otherwise co-locate with the runner that uses them.

## Testing Guidelines
- Framework: Vitest. Add unit-style tests in `test/` with the suffix `.test.js`.
- Mock Playwright where possible (see `test/launchScreenshotsRunner.test.js` for injection/mocking patterns).
- Ensure ordering-sensitive flows (scroll, asset loading, cleanup) have explicit expectations; use spies to assert console output when handling errors. Runner should log errors and continue rather than crash.
- Aim for coverage of both happy paths and hook failures; prefer deterministic tests with mocked timers/network.

## Commit & Pull Request Guidelines
- Use imperative, concise commit subjects (e.g., `Handle element overflow tiling`); include scope if helpful.
- PRs should describe scenarios covered, testing performed (`npm test`), and any new options or hooks introduced.
- Link related issues; include before/after notes or sample commands when changing runner behavior.
- If screenshots change behaviorally, note expected filename patterns so reviewers can diff outputs.

## Security & Configuration Tips
- Do not embed credentials in scenario files; pass `httpCredentials` or environment-driven secrets.
- Point `baseURL` to non-production environments for automated runs. Verify filters before running to avoid mass captures against unintended hosts.
- Keep `.crush/` data local-only (should remain ignored/removed) and avoid committing secrets or browser traces.
- When updating workflows, keep README and this guide aligned so new contributors see consistent instructions.
