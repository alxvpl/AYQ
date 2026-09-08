# ayq-desktop

The AYQ Electron host: one window, one typed IPC channel, and the forked engine
behind it. The first real AYQ desktop skeleton — an architecture and a runtime,
not a design.

## The boundary

```
ayq-client  ──window.ayq.request()──▶  preload  ──ipcRenderer.invoke──▶  main
                                                                          │
                                                            fork ─────────┤
                                                                          ▼
                                                     ayq-engine ──▶ @actual-app/api
```

Three processes, which is the shape Actual's shipped desktop app already uses,
and the reason the base evaluation called this boundary production-proven rather
than theoretical:

| Process | What it may touch |
|---|---|
| main (`ayq-main.ts`) | Electron, the window, and the relay. Never interprets a request. |
| renderer (`ayq-client`) | The contract. No Node, no `require`, no engine. |
| engine (`ayq-engine.ts`) | `@actual-app/api`. The only place it is loaded anywhere. |

`contextIsolation` is on and `nodeIntegration` is off, so `window.ayq` is not
merely the intended path out of the renderer — it is the only one that exists.
A test in `ayq-client` enforces the same rule on the source and on the built
bundle, because a rule this easy to break by accident should not rest on
memory.

## The vertical slice

One request, answered from a real budget:

```ts
{ id: string, kind: 'engine.status' }
   → { id, ok: true,  kind: 'engine.status', result: AyqEngineStatus }
   → { id, ok: false, kind: 'error', message: string }
```

Nothing in the answer is invented for the interface's benefit. Accounts come
from `getAccounts()`, each balance from `getAccountBalance()` — computed by the
engine's spreadsheet, not summed by the renderer — and the transaction count
from `aqlQuery(q('transactions').calculate({ $count: 'id' }))`, so the number is
the engine's own query language answering, not the length of a list that
happened to be fetched.

On first launch there is no budget to open, so the engine creates one with a
single account and two invented entries. The response says so
(`budgetCreated: true`) and the screen prints it, because a number whose origin
is unclear is worse than no number.

## Importing a statement

The first real feature, and it crosses every layer without breaking any of
them:

```
Import CAMT.053  ──▶  import.pick   host opens the native picker, answers a path
                 ──▶  import.camt   engine reads it, parses, maps, imports
```

The renderer never touches the filesystem — it has none — and never parses
anything. `.xml` and `.zip` are both accepted; a ZIP is read in memory and
never extracted. The parsing is `ayq-camt`'s, unchanged: the same lossless
records and the same counterparty resolution the spike proved over 212 real
files. The mapping is the bridge's. The import is `@actual-app/api`'s.

The account is named from the statement's IBAN, masked to a country code and
the last four. That is enough to tell two accounts apart and to recognise your
own; it is also what makes a second import land in the same account. Nothing
else from the statement crosses into the interface: the result is counts.

**Duplicate protection** is the record's own key. Every mapped transaction
carries `imported_id` — the bank's `AcctSvcrRef` when it gave one, the record's
stable `ayqKey` otherwise, and neither depends on the file name, which ABN AMRO
derives from the moment of download. Actual matches on it, so importing the
same export twice adds nothing the second time.

Actual matches an import against what the budget already holds, but not
against itself, so repeats *within* one import are collapsed before the rows
are sent. That is not hypothetical: a ZIP of daily statements overlaps by
construction, and without it the first import would already double every
overlapping day.

## Running it

One command from a clean checkout:

```bash
cd ayq/ayq-desktop
node setup.mjs      # or: npm run setup, once dependencies exist
npm start           # the production path
```

`setup.mjs` installs dependencies and builds the engine's native SQLite for
Electron's ABI, then refuses to finish unless the result actually opens a
database under Electron.

It uses `@electron/rebuild` — the same tool, the same pinned version and the
same invocation upstream Actual uses (`--only <module> --force
--build-from-source`). There is deliberately no second dependency model: no
`.npmrc` runtime/target/disturl block, no hand-rolled node-gyp call, no
prebuilt-binary side channel. `better-sqlite3` publishes prebuilds for Node
ABIs only — there is no `electron-v148` asset — so a source build against
Electron's headers is not a preference but the only thing that exists.

Determinism rests on three things, and `setup.mjs` enforces the first:

- `electron` is pinned to an exact version in `package.json`, and setup exits
  if it ever becomes a range. A range would let the ABI the module is built for
  drift from the ABI the app runs on, which is the whole failure being
  prevented.
- The rebuild is passed that same version explicitly rather than sniffing it.
- `verify-native.mjs` opens a real database under Electron afterwards.

`node-gyp` is pinned to 13.0.2 through an npm `overrides` entry. The version
`@electron/rebuild` depends on recognises Visual Studio 2017, 2019 and 2022 and
nothing else, so on a machine carrying a newer Visual Studio it reports that it
found no installation at all — which is what the Windows runner produced. 13.0.2
knows VS 2026 as well, and its programmatic surface is the one
`@electron/rebuild` already drives. When a rebuild does fail, `setup.mjs` runs
node-gyp's own finder and prints the log it otherwise discards, so the answer is
which installations were seen and why each was rejected.

`setup.mjs` runs npm through `ComSpec` explicitly on Windows rather than
spawning `npm.cmd` and hoping. Since the CVE-2024-27980 fix, Node refuses to
execute a batch file without a command shell, and the spawn fails before the
process exists — no output, no exit code. The first Windows CI run failed
exactly that way, so the script now also prints `result.error` whenever a spawn
never starts.

That last point is not ceremony. `better-sqlite3` binds lazily: its entry point
imports cleanly on any ABI and only reaches for the `.node` when a database is
opened. A gate that stops at `require` reports success while the engine is
still broken — which is exactly what this one did until it was made to open a
database.

### The development fallback

```bash
npm run start:debug-node-engine
```

Forks the engine on the system Node, where the binding already matches, so the
UI can be worked on without a rebuild. It is a development shortcut and not the
shipped path: the production smoke passes `--require-host "electron
utilityProcess"`, so this mode cannot satisfy the acceptance test.

### Verified where

`.github/workflows/ayq-desktop-windows.yml` runs the whole thing on
`windows-latest`: clean checkout, `node setup.mjs`, typecheck, tests, then

```bash
node start.mjs --smoke --require-host "electron utilityProcess"
```

which launches the real window, waits for the renderer to report the outcome of
its own request, captures the window, and exits non-zero unless the engine that
answered was the Electron utility process. A second run adds `--import` with an
invented fixture: it clicks the button, imports, imports the same file again,
and fails unless the second round adds nothing. Real bank data never appear
there — the fixtures in this repository are the only statements CI ever sees,
and only counts are printed.

## Tests

`npm test` forks the built engine as a plain Node child and asks it the same
request the renderer sends. It asserts a real budget was opened or created, that
the balance is what the engine computed, that a second launch reopens rather
than reseeds, and that an unknown request kind is refused rather than guessed
at. No Electron and no display are needed, so the engine half stays testable in
CI; `npm run smoke` covers the Electron half.

## Scope

A skeleton. No CAMT import, no navigation, no sync, no Android, no CIVION, no
branding, and nothing migrated from Actual's own screens.
`packages/desktop-client` is untouched and remains untouched.
