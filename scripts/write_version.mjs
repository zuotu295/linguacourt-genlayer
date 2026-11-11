// Version-stamp the built bundle so GitHub Pages never serves a stale build.
// After `vite build`, append ?v=<sha256-8 of the main JS asset> to every
// local <script src> and <link href> in dist/index.html.
// Usage: node scripts/write_version.mjs (runs as npm postbuild)
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(REPO, 'dist');
const htmlPath = path.join(DIST, 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');
const assets = fs.readdirSync(path.join(DIST, 'assets')).filter((f) => f.endsWith('.js'));
if (!assets.length) throw new Error('no JS assets in dist/assets');
const main = assets.sort().at(-1);
const sha = createHash('sha256').update(fs.readFileSync(path.join(DIST, 'assets', main))).digest('hex').slice(0, 8);
html = html.replace(/((?:src|href)="(\.\/)?assets\/[^"?]+)(\.js|\.css)"/g, `$1$3?v=${sha}"`);
fs.writeFileSync(htmlPath, html);
fs.writeFileSync(path.join(DIST, 'version.json'), JSON.stringify({bundle_sha256_8: sha, asset: main}, null, 2));
console.log('version-stamped bundle ?v=' + sha, '(' + main + ')');
