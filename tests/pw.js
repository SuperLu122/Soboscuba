// Shared Playwright loader: uses the project's playwright if installed,
// else a global one. Set CHROMIUM_PATH to use a specific browser binary.
let pw;
try { pw = require('playwright'); } catch (e) { pw = require('/opt/node-tools/node_modules/playwright'); }
const launch = pw.chromium.launch.bind(pw.chromium);
pw.chromium.launch = (opts = {}) => {
  const exe = process.env.CHROMIUM_PATH || (require('fs').existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
  return launch(Object.assign({}, opts, { executablePath: exe }));
};
module.exports = pw;
