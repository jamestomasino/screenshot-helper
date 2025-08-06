// CJS loader for ESM default export with async usage pattern
// Usage: (async () => { const launchScreenshotsRunner = (await require('screenshot-helper'));
//   await launchScreenshotsRunner(...) })();

module.exports = async function(...args) {
  const mod = await import('./index.js');
  return mod.default(...args);
};
