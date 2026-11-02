# Wardogs Config Editor — spec

## What it is
- One page, two forms. Edits **GameUserSettings.ini only**. The loaded file is the base; optional **layers** apply on top of it (see Layers).
- **Desktop app (Windows, Neutralino 6.10.0)**: opens the file from `%LOCALAPPDATA%\Wardogs\Saved\Config\WindowsClient` automatically and saves in place.
  - Automatic backup of the disk version before every save.
  - Watches the file (every 2 s): reloads when there are no unsaved edits, shows a warning banner when there are.
  - Conflict check on save: if the file changed since it was loaded, shows the differences and asks (overwrite, or discard and reload).
  - Layers, backups and remembered keybind actions are stored in `%APPDATA%\wardogs-config\data.json` (written via a temp file; left untouched if it can't be read). The web view's own storage can't be used: it's tied to the local server port, which changes every launch.
  - Distributed as a zip on GitHub Releases (`wardogs-config.exe` + `resources.neu`). Unsigned, so SmartScreen may warn.
- **Website (GitHub Pages)**: Chrome blocks folder access under `AppData`, so you load the file with a picker or drag and drop, and saving downloads it for you to copy back. The file isn't remembered between visits; layers are.
- Just for you, so it can be technical: raw keys are visible and advanced options aren't hidden.

## File handling
- Lines you don't touch are written back exactly as they were (encoding, CRLF line endings, odd keys like `½`).
- After a download, the downloaded text becomes the loaded version.

## Tabs
In this order:
1. **File**: the start page (load the file on the website), Undo last save, export/import.
2. **Controls**: mouse/vehicle/helicopter sensitivity, invert axes, flight assists, Hold/Toggle, joystick axes.
3. **Keybinds**: rebind by pressing a key, mouse button or scroll. Limitation: the file only stores bindings you've changed, so only those (and actions remembered from earlier loads) are listed. You can add more by action tag.
4. **Graphics**: resolution, window mode, FOV, upscaler, frame limits, quality levels, post-effects.
5. **Raw**: every key in the file, as a list or as text, including adding keys by hand.

## Layers
Named sets of settings for a playstyle (e.g. "Advanced heli") that you switch on and off. The config written to the file is the loaded file with every active layer applied in priority order.
- **What a layer owns**: plain INI keys (`section` + `key`), and whole keybind actions inside `CustomKeybindings` (one action tag, Primary and Secondary slots together). Joystick axes and other structs are owned as whole lines.
- **Values only**: a layer sets values; it can't hold "use the game default".
- **Priority**: any set of layers can be active at once. Where two active layers own the same key or action, the higher one wins. No exclusive groups, no presets. Keys bound to the same physical key in different layers aren't flagged.
- **Turning a layer off**: each key or action it owned falls to the next active layer below that owns it. If none does, it's removed from the file so the game uses its default. (Verified for keybinds; to verify in-game for other settings such as the heli assists.)
- **Two explicit modes**, always shown in a coloured bar: **Editing total config** or **Editing layer: <name>**. There is no "save edits as a layer" from the total config; you create a layer, enter it, and edit there.
- **Editing inside a layer**: the normal tabs, scoped to the layer. Any key or action you change joins the layer; each owned one has a remove button. The tabs show the full stacked result for context, with settings the layer doesn't own dimmed; an owned setting that a higher active layer overrides gets a "shadowed by <layer>" badge.
- **Editing the total config**: everything is editable, but saving re-applies the active layers, so edits to keys a layer owns are overwritten. Save warns and lists them first.
- **Game changes**: when the file the game wrote differs from an active layer, the editor shows the layer's value and a note lists what the game changed. The next save puts the layer's value back. Nothing is re-applied automatically.
- **Saving**: Save (Ctrl+S) inside a layer stores the layer and, if it's active, writes the stacked result to the file (desktop) or downloads it (website), with the usual backup and conflict check. Toggling or reordering layers is an unsaved change until you Save.
- **Layer list**: always visible beside the tabs. Toggle on/off, drag to reorder (top wins), click a name to enter it, create, rename, duplicate, delete.
- Old layers (plain key/value entries) in exports from before this design are ignored.

## Backups & keybinds
- **Backups**: before every save (desktop) or download (website), the previous version of the file is kept; the newest 5 are kept. No manual snapshots, no list to manage.
  - **Undo last save** puts the newest backup back: written to the file (desktop) or downloaded (website), after showing the differences. Layers are not part of backups.
- **Keybind repair**: bindings the game cleared (saved with no key) are listed with Bind and Reset to default. Reset removes the entry so the game uses its default (verified in-game).
- **Remembered actions**: every keybind action seen in a loaded file is kept, with default keys learned from entries saved without `bIsCustom`.
- **Storage**: desktop: `%APPDATA%\wardogs-config\data.json`; website: the site's IndexedDB. Both can **export/import** layers and remembered actions as a JSON file. Snapshots in older exports are ignored.

## Out of scope
Engine.ini and engine tweaks, layers that force a game default, exclusive layer groups or layer presets, snapshots, sharing configs with others, a read-only lock, game-process detection, file watching on the website (the desktop app does watch the file), and a built-in list of default keybinds (the game's data is encrypted).

## Hosting & distribution
- Website: GitHub Pages from `main` in the public repo `KevinLHansen/wardogs-config`.
- Desktop app: a GitHub Release with the zip, published only after you say so.

## Testing
- Automated: `npm test` (Node's built-in runner, no dependencies) covers the INI round-trip on an anonymised copy of your config, encodings, keybind parsing/repair/learning, and layer stacking (priority, shadowing, turning a layer off, keybind actions inside `CustomKeybindings`). Run before every commit.
- I test against a **copy** of your config: the website in a local browser, the desktop app with `--config=<copy> --data=<test data file>` in headless mode.
- You test before anything is committed, pushed, hosted or released, unless you say otherwise.
