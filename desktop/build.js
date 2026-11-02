// Builds the Windows desktop app: dist/wardogs-config/{wardogs-config.exe, resources.neu}.
// resources.neu is an asar archive holding neutralino.config.json and the site files under /resources/,
// which is what `neu build` produces; packing it here avoids the neu CLI's Node 22 requirement.
// Needs bin/neutralino-win_x64.exe from the Neutralino release zip.
const fs = require('fs');
const path = require('path');
const asar = require('@electron/asar');

const here = __dirname;
const site = path.resolve(here, '..');
const stage = path.join(here, 'resources-stage');
// Optional first argument: another output folder (e.g. while dist/ is locked by a running copy).
const out = process.argv[2] ? path.resolve(process.argv[2]) : path.join(here, 'dist', 'wardogs-config');
const SITE_FILES = ['index.html', 'css', 'js'];

async function main() {
  const runtime = path.join(here, 'bin', 'neutralino-win_x64.exe');
  if (!fs.existsSync(runtime)) throw new Error('Missing bin/neutralino-win_x64.exe (extract it from the Neutralino release zip).');

  fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(path.join(stage, 'resources'), { recursive: true });
  fs.copyFileSync(path.join(here, 'neutralino.config.json'), path.join(stage, 'neutralino.config.json'));
  for (const f of SITE_FILES) fs.cpSync(path.join(site, f), path.join(stage, 'resources', f), { recursive: true });
  // The Neutralino server provides NL_* globals at this path; only the desktop copy of the page loads it.
  const index = path.join(stage, 'resources', 'index.html');
  const html = fs.readFileSync(index, 'utf8');
  const tag = '<script type="module" src="js/app.js"></script>';
  if (!html.includes(tag)) throw new Error('index.html: app script tag not found');
  fs.writeFileSync(index, html.replace(tag, '<script src="/__neutralino_globals.js"></script>\n' + tag));

  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  await asar.createPackage(stage, path.join(out, 'resources.neu'));
  fs.copyFileSync(runtime, path.join(out, 'wardogs-config.exe'));
  fs.rmSync(stage, { recursive: true, force: true });

  for (const f of fs.readdirSync(out)) console.log(f, Math.round(fs.statSync(path.join(out, f)).size / 1024) + ' KB');
}

main().catch(e => { console.error(e.message); process.exit(1); });
