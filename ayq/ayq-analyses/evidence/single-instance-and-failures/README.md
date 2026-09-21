# Single instance and the two failure sentences — installed-application evidence

Four window captures of the installed Windows application built for directive
032 under `AYQ_ANALYSES_DESIGN_SYSTEM` r003 and `02_ARCHITECTURE` r007 §7.16,
reached with one synthetic fixture (`snapshot-B.json` = `a1-empty.json`, and
`a1-result.json` as the valid candidate of image 02), captured on 2026-09-21.
Every value in them is invented: no real banking or personally identifying
financial data may ever be placed in this directory (03 §6, AYQ §12). The
owner's own snapshot was not opened; the application's copy of it did not
exist at the time.

This directory is not part of the packaged application.

## What this increment changed

- **One instance (§7.16).** The single-instance lock is the first act of the
  main process — before the application is ready, before a window exists,
  and before the store is opened, validated, replaced or removed. A process
  that does not obtain it registers nothing, creates nothing, touches
  nothing in the store and exits; the instance that holds the lock brings
  its window forward. Nothing is said on a second launch.
- **`snapshot.load.failed`** (r003 §11.5) — "This snapshot could not be
  loaded. AYQ Analyses did not change what it holds." — when a valid
  candidate's copy cannot be written or proven. True with a snapshot held,
  with nothing held, and with a refused copy held.
- **`snapshot.remove.failed`** (r003 §11.6) — "This snapshot could not be
  removed. AYQ Analyses still holds it." — when the copy cannot be deleted.
  The visible state keeps the snapshot, name included; nothing transitions
  to "No data loaded". Removal now deletes the copy before the name, so a
  removal that fails on disk leaves both exactly as they were.

Nothing else was rebuilt: the 028 delivery stands as accepted.

## How each failure was produced, plainly

A background PowerShell process opened `%APPDATA%\AYQ Analyses\
active-snapshot.json` with `FileShare.None` and kept the handle for the
duration of images 02 and 03 — a locked file, nothing else changed. With the
handle held:

- image 02: Settings → **Load another snapshot…** → the valid synthetic
  `snapshot-A.json`. The candidate validated, its temporary copy was written
  beside the store and read back, and the rename over the locked target
  failed. The temporary file was removed; the copy on disk stayed B (5 972
  bytes, its earlier write time, confirmed byte-identical to the fixture
  once the handle was released).
- image 03: **Remove this snapshot** → confirmed. `rm` of the locked copy
  failed; neither the copy nor its meta file was touched.

The handle was then released (image 04): the same removal succeeded, the
application returned to "No data loaded", both files were gone, and the
store stayed empty for the 30 s watched afterwards and for 45 s after the
application had exited.

## The second launch (image 01)

With the application running on B and its window minimized, the installed
executable was launched again from PowerShell. Five seconds later the
process list held the original four processes and one new one; the new one
had exited by the next check, the original main process still owned the one
window titled "AYQ Analyses", the window had been restored and brought to
the front with no message of any kind, and `active-snapshot.json` was
unchanged by hash and write time with no temporary file beside it.

## Capture record

| | |
|---|---|
| platform | Windows 11 Pro 10.0.26200, x64, 3840 × 2160 display at 175 % |
| Node / npm | v24.21.0 / 11.19.0 (Electron 43.4.0 runtime, electron-builder 26.8.1) |
| `npm test` | **149 tests, 149 pass, 0 fail** (140 before; the concurrency test builds and launches the real application twice) |
| `npm run typecheck` | pass |
| `npm run build` | pass |
| `npm run package` | pass — NSIS installer produced |
| installer | `release/AYQ Analyses-0.1.0-windows-x64-setup.exe`, 139 229 821 bytes |
| installer SHA-256 | `D2679233AC48108ECD6C8E9BCDFAF13388CFCAAA02321491C3608850BE74E9ED` |
| installed to | `%LOCALAPPDATA%\Programs\ayq-analyses\AYQ Analyses.exe` (per-user, silent `/S`, exit 0, at 03:04:39 local, over the 028 candidate) |
| installed `resources/app.asar` SHA-256 | `DAD5A5B9BFA9E9F55C093DD25CDA5110421D9964088360ADF3F8A469DA4B0E90` |
| code signing | none configured; the installer is unsigned |

The capture method is that of `../persistence-settings/README.md`: the real
installed window, driven through the desktop, written by `PrintWindow` at
physical pixel size and trimmed to the DWM frame — no crop, no scaling, no
retouching; disk state read between steps with PowerShell.

| # | verified on the installed application |
|---|---|
| 01 | After the second launch: the first instance's window restored and in front on Explore with B, no notice; the second process gone; the store unchanged. |
| 02 | Load another snapshot… with the copy locked: **This snapshot could not be loaded. AYQ Analyses did not change what it holds.** over Settings, which still identifies `snapshot-B.json`. |
| 03 | Remove this snapshot, confirmed, with the copy locked: **This snapshot could not be removed. AYQ Analyses still holds it.** over Settings, still identifying B; the status bar still shows the snapshot. |
| 04 | The handle released, the removal repeated: **No snapshot loaded.**; nothing on disk. |

## The open observation of 028 §6

Not seen again. With a single instance and the lock in place, every removal
in this pass held — including the 30 s watch after the confirmed removal
and the 45 s after exit. This is one more clean run, not a resolution.
