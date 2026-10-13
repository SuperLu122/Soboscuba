#!/usr/bin/env node
// Runs every test file and exits non-zero if any fails.
//   node tests/run.js            all tests
//   node tests/run.js node       headless rule and physics tests only
//   node tests/run.js e2e        browser tests only
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const which = process.argv[2];
const groups = ['node', 'e2e'].filter(g => !which || g === which);
const failed = [];
for (const g of groups) {
  const dir = path.join(__dirname, g);
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js') && !['harness.js', 'lib.js', 'pw.js'].includes(f)).sort()) {
    console.log(`\n# ${g}/${f}`);
    const r = spawnSync(process.execPath, [path.join(dir, f)], { stdio: 'inherit' });
    if (r.status !== 0) failed.push(`${g}/${f}`);
  }
}
console.log(failed.length ? `\nFAILED: ${failed.join(', ')}` : '\nAll tests passed.');
process.exit(failed.length ? 1 : 0);
