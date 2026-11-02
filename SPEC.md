# Wardogs Config Editor — spec

## What it is
- One page, two forms. Edits **GameUserSettings.ini only**; the loaded file is the only source of settings.
- **Desktop app (Windows, Neutralino 6.10.0)**: opens the file from `%LOCALAPPDATA%\Wardogs\Saved\Config\WindowsClient` automatically and saves in place.
  - Automatic snapshot of the disk version before every save.
  - Watches the file (every 2 s): reloads when there are no unsaved edits, shows a warning banner when there are.
  - Conflict check on save: if the file changed since it was loaded, shows the differences and asks (overwrite, or discard and reload).
  - Snapshots and remembered keybind actions are stored in `%APPDATA%\wardogs-config\data.json` (written via a temp file; left untouched if it can't be read). The web view's own storage can't be used: it's tied to the local server port, which changes every launch.
  - Distributed as a zip on GitHub Releases (`wardogs-config.exe` + `resources.neu`). Unsigned, so SmartScreen may warn.
- **Website (GitHub Pages)**: Chrome blocks folder access under `AppData`, so you load the file with a picker or drag and drop, and saving downloads it for you to copy back. Not remembered between visits.
- Just for you, so it can be technical: raw keys are visible and advanced options aren't hidden.

## File handling
- Lines you don't touch are written back exactly as they were (encoding, CRLF line endings, odd keys like `½`).
- After a download, the downloaded text becomes the loaded version.

## Tabs
In this order:
1. **Snapshots**: the start page (load the file on the website), snapshot list, export/import.
2. **Controls**: mouse/vehicle/helicopter sensitivity, invert axes, flight assists, Hold/Toggle, joystick axes.
3. **Keybinds**: rebind by pressing a key, mouse button or scroll. Limitation: the file only stores bindings you've changed, so only those (and actions remembered from earlier loads) are listed. You can add more by action tag.
4. **Graphics**: resolution, window mode, FOV, upscaler, frame limits, quality levels, post-effects.
5. **Raw**: every key in the file, as a list or as text, including adding keys by hand.

## Snapshots & keybinds
- **One truth**: the loaded file is the only source of settings. (Override layers were dropped as too complex.)
- **Snapshots**: full copies of the file (desktop: as it is on disk; website: as loaded).
  - Manual snapshots any time.
  - **Automatic snapshot before every save (desktop) or download (website)**, and before every restore; the newest 20 automatic ones are kept, manual ones are never auto-deleted.
  - Restore shows a diff against the loaded file, then writes the snapshot to the file (desktop) or downloads it (website).
- **Keybind repair**: bindings the game cleared (saved with no key) are listed with Bind and Reset to default. Reset removes the entry so the game uses its default (verified in-game).
- **Remembered actions**: every keybind action seen in a loaded file is kept, with default keys learned from entries saved without `bIsCustom`.
- **Storage**: desktop: `%APPDATA%\wardogs-config\data.json`; website: the site's IndexedDB. Both can **export/import** snapshots and remembered actions as a JSON file. Layers in older exports are ignored.

## Out of scope
Engine.ini and engine tweaks, override layers, sharing configs with others, a read-only lock, game-process detection, file watching on the website (the desktop app does watch the file), and a built-in list of default keybinds (the game's data is encrypted).

## Hosting & distribution
- Website: GitHub Pages from `main` in the public repo `KevinLHansen/wardogs-config`.
- Desktop app: a GitHub Release with the zip, published only after you say so.

## Testing
- Automated: `npm test` (Node's built-in runner, no dependencies) covers the INI round-trip on an anonymised copy of your config, encodings, and keybind parsing/repair/learning. Run before every commit.
- I test against a **copy** of your config: the website in a local browser, the desktop app with `--config=<copy> --data=<test data file>` in headless mode.
- You test before anything is committed, pushed, hosted or released, unless you say otherwise.
