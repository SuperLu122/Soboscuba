#!/usr/bin/env node
/*
 * Bundles the game into one self-contained HTML file (fonts, CSS and JS
 * inlined) at dist/soboscuba.html. Handy for sharing or hosting anywhere.
 *   node tools/build-single.js [--fragment] [outfile]
 * --fragment omits <!doctype>/<html>/<head> for hosts that wrap the page.
 */
const fs = require('fs');
const path = require('path');

const WWW = path.join(__dirname, '..', 'www');
const args = process.argv.slice(2);
const fragment = args.includes('--fragment');
const out = args.find(a => !a.startsWith('--')) || path.join(__dirname, '..', 'dist', 'soboscuba.html');
const read = f => fs.readFileSync(path.join(WWW, f), 'utf8');

let css = read('css/style.css').replace(/url\('\.\.\/fonts\/([^']+)'\)/g, (_, f) =>
  `url(data:font/woff2;base64,${fs.readFileSync(path.join(WWW, 'fonts', f)).toString('base64')})`);
const html = read('index.html');
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script src="js/physics.js">'));
const js = ['js/physics.js', 'js/audio.js', 'js/game.js'].map(read).join('\n');

const head = `<title>Soboscuba</title>
<style>
${css}
</style>`;
const page = fragment
  ? `${head}\n${body}<script>\n${js}\n</script>\n`
  : `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
${head}
</head>
<body>${body}<script>
${js}
</script>
</body>
</html>
`;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, page);
console.log(`wrote ${out} (${(page.length / 1024).toFixed(0)} KB)`);
