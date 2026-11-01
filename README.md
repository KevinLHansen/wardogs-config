# Wardogs Config Editor

A browser-based editor for Wardogs' `GameUserSettings.ini` and `Engine.ini`. It's a static page with no server and no install.

## Use
1. Open the site in **Chrome or Edge**.
2. Click **Choose folder** and pick `%LOCALAPPDATA%\Wardogs\Saved\Config\WindowsClient`.
3. Edit settings, then press **Save** (Ctrl+S). Close the game before saving: it rewrites `GameUserSettings.ini` when it exits.

The browser remembers the folder. On later visits it takes one click to reconnect.

## Features
- **Editors**: graphics & quality, sensitivity & controls, keybinds (press a key to rebind), and a raw editor for both files.
- **Engine tweaks**: a curated list of performance and image-clarity variables, written to `Engine.ini` under `[SystemSettings]`.
  - Visibility tweaks (fog, foliage, shadows) stay hidden behind a risk confirmation, because they can count as cheating.
  - You can mark each tweak as working or not after testing it in-game.
- **Override layers**: named sets of forced settings that stack (later layers win).
  - When the game resets something a layer controls, the page shows the difference and offers to re-apply.
- **Snapshots**: full copies of both files, taken automatically before every write (newest 20 kept), plus manual ones. Roll back with a preview.
- **Export / import**: layers and snapshots as a JSON file.

## Privacy
Everything stays on your PC. Files are read and written through the browser's File System Access API. Layers, snapshots and settings are stored in this site's IndexedDB. Nothing is uploaded.

## Sandbox
Add `?sandbox` to the URL to work on copies kept in browser storage instead of your game folder.

## Development
Plain ES modules with no build step. Serve the folder from any static server on `localhost` (File System Access needs a secure context).
