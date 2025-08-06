const esm = require('esm')(module)
const mod = esm('./index.js')
// Exports as default for require (legacy CJS entrypoint)
module.exports = mod.launchScreenshotsRunner
