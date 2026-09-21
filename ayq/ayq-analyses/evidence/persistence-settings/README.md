# Persistent snapshot, Settings, rail and grammar — installed-application evidence

Nineteen window captures of the installed Windows application built for
directive 026 under `AYQ_ANALYSES_DESIGN_SYSTEM` r002, each reached from a
synthetic fixture under `../../test/fixtures/a1/` (copied to a scratch folder
under the file names `snapshot-A.json` = `a1-result.json`, `snapshot-B.json` =
`a1-empty.json`, `unknown-start.json` = `a1-unknown-start.json`, `broken.json`
= `a1-invalid-broken-reversal.json`), captured on 2026-09-21. Every value in
them is invented: no real banking or personally identifying financial data may
ever be placed in this directory (03 §6, AYQ §12). The owner's own snapshot
was not opened; the application's copy of it did not exist at the time.

This directory is not part of the packaged application.

## What this increment changed on screen

- **Persistence (r002 §6.1, §6.2).** The application keeps its own copy of
  the active snapshot — the exact bytes chosen, byte-compared on read-back
  before one rename makes it active — under its per-user data directory,
  and revalidates it at every launch through the contract validator. Moving
  or deleting the file it was loaded from changes nothing. Nothing else
  persists: the default context at every launch.
- **Settings (r002 §11).** Utility navigation at the rail footer, its own
  Tab stop after the analytical group. One section: file name, "Taken
  {datetime} ({relative})", plural-selected account and transaction counts,
  **Load another snapshot…**, **Remove this snapshot** with the accepted
  confirmation. No path, no snapshot identifier, no key.
- **Rail (r002 §3.2, D-1 resolved).** Three kinds of item: current
  (rail-current on the active wash with the marker), available non-current
  (the rail ink, no outline — Explore when Settings is current, Settings
  otherwise), unavailable non-current (the rail ink with a dashed outline in
  the muted token). The muted token no longer colours a label or an icon;
  the placeholders hover, focus and open like any tile, and are not marked
  disabled.
- **Grammar (r002 §6.6, §10.3).** The three unknown-start sentences agree
  with the number of accounts named: one account "reaches".
- **A refused candidate (r002 §11.5)** is stated over the surface in the
  refused-snapshot family while the active snapshot stays in use; a refused
  active copy at launch uses the same family in the body and shows no figure.

## The measured contrast of the unavailable non-current label (026 §4)

Foreground `DARK.ink` `#c9ced3`, on the surfaces a non-current tile
composites to (gate 4.5:1; the lowest governs). Asserted by
`test/tokens.test.ts`.

| state of a non-current tile | surface | ratio |
|---|---|---|
| rest | `#1b1f24` (rail ground) | **10.45:1** |
| hover | `#292c31` (0.06 white over the ground) | **8.84:1** |
| focused | `#1b1f24` (the ring is outside the tile) | 10.45:1 |
| focused + hover | `#292c31` | 8.84:1 |

The muted token `#7b838a` that carried the r001 treatment measures 4.30:1 on
the ground — below 4.5:1, as r001 §13 recorded — and now serves only as the
placeholder's dashed outline, essential non-text geometry: 4.30:1 at rest,
3.64:1 on the hover wash, 3.40:1 on the active wash, all above 3:1.

## Capture record

| | |
|---|---|
| platform | Windows 11 Pro 10.0.26200, x64, 3840 × 2160 display at 175 % |
| Node / npm | v24.21.0 / 11.19.0 (Electron 43.4.0 runtime, electron-builder 26.8.1) |
| source packaged | the working tree that the commit adding this directory records; no source changed after packaging |
| `npm test` | **140 tests, 140 pass, 0 fail** |
| `npm run typecheck` | pass |
| `npm run build` | pass |
| `npm run package` | pass — NSIS installer produced |
| installer | `release/AYQ Analyses-0.1.0-windows-x64-setup.exe`, 139 229 518 bytes |
| installer SHA-256 | `9829A733454D49E1FB1DE6C82AC87A3A4595E027B6F16B204AEFB60F9EF5D10B` |
| installed to | `%LOCALAPPDATA%\Programs\ayq-analyses\AYQ Analyses.exe` (per-user, silent `/S`, exit 0, over the contract-1.0 candidate) |
| installed `resources/app.asar` SHA-256 | `F2A649ECDA24B8F26E763198A6EEB0FF26C93F7710EC44578ECF3C5CE33190B3` |
| active copy | `%APPDATA%\AYQ Analyses\active-snapshot.json` + `active-snapshot.meta.json`, verified by hash after every load; both gone after every removal |
| code signing | none configured; the installer is unsigned |

### Capture method, the same for every image

1. The installed executable was launched from its installed path and driven
   through the desktop — its own buttons, its own Windows file dialog with
   the fixture's full path typed into *File name*, its rail by pointer and by
   keyboard. The desktop was driven by the Claude Code computer-use tooling;
   nothing of that tooling is a dependency of this package.
2. Each image was written by a short PowerShell script that finds the
   `AYQ Analyses` top-level window, calls `PrintWindow(hwnd,
   PW_RENDERFULLCONTENT)` on it and trims the result to the window's DWM
   frame bounds. The image is the whole application window at physical pixel
   size (2361 × 1497 at 175 %), unaffected by any other window on the
   desktop. No crop, no scaling, no retouching. The script is a
   development-time aid kept outside the repository.
3. Disk state was read between steps with PowerShell (file names, sizes,
   SHA-256 of the copy against the source fixture).

### What each image shows, as captured

| # | verified on the installed application |
|---|---|
| 01 | First launch, no active copy: **No data loaded**; the rail with Explore current, five dashed placeholders, Settings at the footer. |
| 02 | `snapshot-A.json` loaded: **€246.25**, Last month. The copy on disk hashes equal to the source file. |
| 03 | Settings: `snapshot-A.json` · *Taken 5 Mar 2026, 07:00 (7 months ago)* · *2 accounts · 13 transactions* · the two actions. Settings current; Explore now the available non-current kind. No path anywhere. |
| 04 | The application closed, `snapshot-A.json` moved out of its folder, the application relaunched: Explore on A with the default context, no file picker. |
| 05 | Settings → Load another snapshot… → `snapshot-B.json`: Settings identifies B (*2 accounts · 4 transactions*); the copy on disk is B; no temporary file left. |
| 06 | Load another snapshot… → `broken.json`: **This snapshot cannot be read** with the invariant sentence, over Settings; B remains the copy on disk and in use. |
| 07 | `unknown-start.json`, one account without a proven start: *This snapshot does not establish how far back Card account **reaches**, so earlier transactions may be missing.* |
| 08 | The same with Previous period: *Comparison unavailable — this snapshot does not establish how far back Card account **reaches***. |
| 09–13 | Overview, Fixed costs, Projection, Scenarios, Saved Analyses, each reached by keyboard (Home, then Down): one centred line, **Not in this version.**; the focused placeholder ringed in the fill, current treatment over the dashed outline. |
| — | Tab from the analytical group landed on **Settings** as its own stop; Enter opened it (no image; the state is 14's background). |
| 14 | Remove this snapshot: the confirmation, *AYQ Analyses will delete its copy of this snapshot. If you no longer have the original file, this snapshot cannot be loaded again.* |
| 15 | Confirmed: Settings reads **No snapshot loaded.**, the status bar empties; both files gone from disk. |
| 16 | B loaded again, the application closed and relaunched: B in use (**No matching transactions.**), no picker. |
| 17 | The copy on disk edited to contract major 2.0, the application relaunched: **This snapshot cannot be read** with the newer-contract sentence, no figure, empty status bar. |
| 18 | Settings with the refused copy: `snapshot-B.json` · **This file cannot be read.** · both actions offered. |
| 19 | Removed: **No data loaded**; nothing on disk; the machine left as found. |

## One observation, not reproduced

During the first pass two instances of the installed application overlapped
for about a minute (the first did not close on the first click of its close
button, and the second was launched over it); the first was then ended by
`Stop-Process`. Later in that pass, after the removal of image 15, the copy
directory held `active-snapshot.json` and its meta file again, with
`snapshot-A.json`'s bytes and the first instance's write time (01:52:46),
although the second instance had proven B and then the unknown-start
fixture as the copy in between. Deleting those files by hand held. The
whole sequence — load, replace, remove, relaunch — was repeated with one
instance and the removal held every time, including after a 20 s wait. The
application does not take a single-instance lock; whether two instances on
one copy should be prevented, and whether an external agent (Bitdefender's
ransomware remediation is active on this machine) restored the deleted
files, are recorded here for the joint leads and were not acted on.
