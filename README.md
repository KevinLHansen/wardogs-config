# Wardogs Config Editor

An editor for Wardogs' `GameUserSettings.ini`, in two forms built from the same page:

- **Desktop app (Windows)**: reads and writes the file in place. Download the zip from [Releases](https://github.com/KevinLHansen/wardogs-config/releases/latest), unzip it anywhere and run `wardogs-config.exe`.
- **Website**: [kevinlhansen.github.io/wardogs-config](https://kevinlhansen.github.io/wardogs-config/). Browsers can't write into `AppData`, so you load the file and save by downloading it.

## Desktop app
- Opens `%LOCALAPPDATA%\Wardogs\Saved\Config\WindowsClient\GameUserSettings.ini` automatically (or **Choose file…** if it isn't there).
- **Save** (Ctrl+S) writes the file directly, after an automatic snapshot of the version on disk.
- Watches the file: when the game rewrites it, the page reloads if you have no unsaved edits, or shows a warning if you do.
- If the file changed on disk since you loaded it, Save shows what changed and asks before overwriting.
- Snapshots and remembered keybind actions are kept in `%APPDATA%\wardogs-config\data.json`.
- The app is unsigned, so Windows SmartScreen may warn the first time you run it ("More info" → "Run anyway").
- Save with the game closed: it rewrites `GameUserSettings.ini` when it exits.

## Website
1. Click **Load file**, paste `%LOCALAPPDATA%\Wardogs\Saved\Config\WindowsClient` into the dialog's address bar and select `GameUserSettings.ini`. You can also drag the file onto the page.
2. Edit settings, then press **Download** (Ctrl+S). The file downloads in its original encoding.
3. Move the download into the config folder and replace the old file, with the game closed.

Load the file fresh each visit: the game may have changed it since last time.

## Features
- **Editors**: graphics & quality, sensitivity & controls, keybinds (press a key to rebind), and a raw editor for every key.
- **Keybind repair**: bindings the game cleared (saved with no key, which its own menu can hide) are listed at the top of the Keybinds tab, where you can bind a key or reset to the game default.
  - Every keybind action seen in a loaded file is remembered, with any default key the file reveals, so actions stay listed after the game drops them.
- **Snapshots**: full copies of the file, taken automatically before every save or download (newest 20 kept), plus manual ones. Restore after a preview.
- **Export / import**: snapshots and remembered keybind actions as a JSON file.
- The loaded file is the only source of settings; untouched lines are written back exactly as they were.

## Privacy
Everything stays on your PC. Nothing is uploaded. Snapshots and remembered keybind actions are stored locally: in the website's IndexedDB, or in `%APPDATA%\wardogs-config\data.json` for the desktop app.

## Development
Plain ES modules with no build step for the website. Serve the folder from any static server.

Run the tests with `npm test` (Node 20 or newer; no dependencies). They cover the INI round-trip against a real, anonymised `GameUserSettings.ini` in `test/fixtures/`, file encodings, and keybind parsing, repair and learning. UI and desktop behaviour aren't covered by automated tests.

The desktop app uses [Neutralino](https://neutralino.js.org/) 6.10.0. To build it:
1. Extract `neutralino-win_x64.exe` from the Neutralino release zip into `desktop/bin/`.
2. In `desktop/`, run `npm install` and `npm run build`.
3. The app is in `desktop/dist/wardogs-config/` (`wardogs-config.exe` + `resources.neu`; keep them together). `npm run build -- <folder>` builds somewhere else, e.g. while a copy in `dist/` is running.

For testing, `wardogs-config.exe --config=<copy of GameUserSettings.ini> --data=<test data.json>` works on copies instead of the real files.
