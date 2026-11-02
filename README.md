# Wardogs Config Editor

> [!WARNING]
> **Disclaimer:** this whole project was fully and entirely slopped up using Claude Opus 5.5. Every line of code, test and doc in this repo was written by AI.

An editor for Wardogs' `GameUserSettings.ini`, in two forms built from the same page:

- **Desktop app (Windows), recommended**: reads and writes the file in place, notices when the game rewrites it, and asks before overwriting changes. Download the zip from [Releases](https://github.com/KevinLHansen/wardogs-config/releases/latest), unzip it anywhere and run `wardogs-config.exe`.
- **Website, as an alternative**: [kevinlhansen.github.io/wardogs-config](https://kevinlhansen.github.io/wardogs-config/). Nothing to download, but browsers can't write into `AppData`, so you load the file and save by downloading it and copying it back yourself.

## Desktop app (recommended)
- Opens `%LOCALAPPDATA%\Wardogs\Saved\Config\WindowsClient\GameUserSettings.ini` automatically (or **Choose file…** if it isn't there).
- **Save** (Ctrl+S) writes the file directly, after an automatic backup of the version on disk.
- Watches the file: when the game rewrites it, the page reloads if you have no unsaved edits, or shows a warning if you do.
- If the file changed on disk since you loaded it, Save shows what changed and asks before overwriting.
- Layers, backups and remembered keybind actions are kept in `%APPDATA%\wardogs-config\data.json`. Snapshots from earlier versions become backups (the newest 5).
- The app is unsigned, so Windows SmartScreen may warn the first time you run it ("More info" → "Run anyway").
- Save with the game closed: it rewrites `GameUserSettings.ini` when it exits.

## Website (alternative)
Use this if you'd rather not run an unsigned app, or aren't on Windows.

1. Click **Load file**, paste `%LOCALAPPDATA%\Wardogs\Saved\Config\WindowsClient` into the dialog's address bar and select `GameUserSettings.ini`. You can also drag the file onto the page.
2. Edit settings, then press **Download** (Ctrl+S). The file downloads in its original encoding.
3. Move the download into the config folder and replace the old file, with the game closed.

Load the file fresh each visit: the game may have changed it since last time.

## Features
- **Editors**: graphics & quality, sensitivity & controls, keybinds (press a key to rebind), and a raw editor for every key.
- **Keybind repair**: bindings the game cleared (saved with no key, which its own menu can hide) are listed at the top of the Keybinds tab, where you can bind a key or reset to the game default.
  - Every keybind action seen in a loaded file is remembered, with any default key the file reveals, so actions stay listed after the game drops them.
- **Layers**: named sets of settings for a playstyle (e.g. "Advanced heli") that you switch on and off in the list beside the tabs. What gets written is the loaded file with every active layer applied; where two layers set the same thing, the higher one in the list wins (drag to reorder).
  - Click a layer to edit it: any setting or keybind action you change in the normal tabs joins that layer. ⊖ removes one again. A bar under the header always says whether you're editing a layer or the total config.
  - A layer owns plain settings and individual keybind actions, so a helicopter layer can rebind Collective/Cyclic/Pedals without touching your other binds.
  - Turning a layer off hands each of its settings to the next layer down, or, if no layer sets it, removes it so the game uses its default.
  - When the game changes a setting a layer owns, the page says so and the next save puts the layer's value back. Edits made in the total config to settings a layer owns are overwritten on save, with a warning first.
- **Backups**: before every save or download, the version it replaces is kept (newest 5). **Undo last save** puts it back.
- **Export / import**: layers and remembered keybind actions as a JSON file.
- Untouched lines are written back exactly as they were.

## Privacy
Everything stays on your PC. Nothing is uploaded. Layers, backups and remembered keybind actions are stored locally: in the website's IndexedDB, or in `%APPDATA%\wardogs-config\data.json` for the desktop app.

## Development
Plain ES modules with no build step for the website. Serve the folder from any static server.

Run the tests with `npm test` (Node 20 or newer; no dependencies). They cover the INI round-trip against a real, anonymised `GameUserSettings.ini` in `test/fixtures/`, file encodings, keybind parsing, repair and learning, and layer stacking. UI and desktop behaviour aren't covered by automated tests.

The desktop app uses [Neutralino](https://neutralino.js.org/) 6.10.0. To build it:
1. Extract `neutralino-win_x64.exe` from the Neutralino release zip into `desktop/bin/`.
2. In `desktop/`, run `npm install` and `npm run build`.
3. The app is in `desktop/dist/wardogs-config/` (`wardogs-config.exe` + `resources.neu`; keep them together). `npm run build -- <folder>` builds somewhere else, e.g. while a copy in `dist/` is running.

For testing, `wardogs-config.exe --config=<copy of GameUserSettings.ini> --data=<test data.json>` works on copies instead of the real files.
