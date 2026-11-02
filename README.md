# Wardogs Config Editor

A browser-based editor for Wardogs' `GameUserSettings.ini`. It's a static page with no server and no install.

## Use
1. Open the site and click **Load file**.
2. Paste `%LOCALAPPDATA%\Wardogs\Saved\Config\WindowsClient` into the dialog's address bar and select `GameUserSettings.ini`. You can also drag the file onto the page.
3. Edit settings, then press **Download** (Ctrl+S). The file downloads in its original encoding.
4. Move the download into the config folder and replace the old file. Close the game first: it rewrites `GameUserSettings.ini` when it exits.

Browsers don't let web pages write into `AppData`, so loading and downloading is the only option. Load the file fresh each visit: the game may have changed it since last time. The loaded file is the only source of settings.

## Features
- **Editors**: graphics & quality, sensitivity & controls, keybinds (press a key to rebind), and a raw editor for every key.
- **Keybind repair**: bindings the game cleared (saved with no key, which its own menu can hide) are listed at the top of the Keybinds tab, where you can bind a key or reset to the game default.
  - Every keybind action seen in a loaded file is remembered in this browser, with any default key the file reveals, so actions stay listed after the game drops them.
- **Snapshots**: full copies of the file as loaded, taken automatically before every download (newest 20 kept), plus manual ones. Restoring one downloads it after a preview.
- **Export / import**: snapshots and remembered keybind actions as a JSON file.

## Privacy
Everything stays on your PC. The file is read in the browser and saved as a download. Snapshots and remembered keybind actions are stored in this site's IndexedDB. Nothing is uploaded.

## Development
Plain ES modules with no build step. Serve the folder from any static server.
