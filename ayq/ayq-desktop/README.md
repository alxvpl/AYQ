# ayq-desktop

The AYQ Electron host: one window, one typed IPC channel, and the forked engine
behind it.

## The boundary

```
ayq-client  ──window.ayq.request()──▶  preload  ──ipcRenderer.invoke──▶  main
                                                                          │
                                                          utilityProcess ─┤
                                                                          ▼
                                                     ayq-engine ──▶ @actual-app/api
```

Three processes, which is the shape Actual's shipped desktop app already uses:

| Process | What it may touch |
|---|---|
| main (`ayq-main.ts`) | Electron, the window, the file picker, and the relay. Never interprets a budget. |
| renderer (`ayq-client`) | The contract. No Node, no `require`, no engine. |
| engine (`ayq-engine.ts`) | `@actual-app/api`. The only place it is loaded anywhere. |

`contextIsolation` is on and `nodeIntegration` is off, so `window.ayq` is not
merely the intended path out of the renderer — it is the only one that exists.
A test in `ayq-client` enforces the same rule on the source and on the built
bundle.

## What the engine answers

One channel, `ayq:request`, carrying a correlated request and response. Adding
a capability adds a member to the request union and a line to the result map,
never a second channel.

| Request | Answer |
|---|---|
| `engine.status` | version, host, budget, data directory, store version |
| `summary` | balances, the newest month's in and out, counts |
| `accounts.list` | every account with the balance the engine computed |
| `transactions.list` | the ledger, filtered and newest first |
| `transaction.detail` | one transaction with its provenance |
| `transaction.categorise` | sets a category, optionally as a standing rule |
| `categories.list` | Actual's categories and their groups |
| `rules.list` · `rules.remove` · `rules.apply` | the standing decisions |
| `recurring.list` | what comes back, and when it is next due |
| `imports.list` | what has been imported, and what each run did |
| `import.pick` · `import.camt` | the native picker, then the import |

Every number is the engine's. The ledger is one AQL query joining the payee,
the account and the category; balances come from `getAccountBalance()` — the
engine's spreadsheet — and counts from
`aqlQuery(q('transactions').calculate({ $count: 'id' }))`. The renderer
computes no money.

### Reading back what was just written

`@actual-app/api` applies a mutation through the same message layer that
carries sync, and that layer lands after the call that queued it has resolved.
Measured, not assumed: a category set and then read back immediately came back
empty, and the read after it was correct. So every read-after-write in the
engine goes through `ayqSettle`, which re-reads until the answer agrees with
what was written — the category equals what was set, the count includes what
was imported. A verified wait, not a sleep.

## What AYQ keeps

Actual's schema has no counterparty account, no bank transaction code and no
SEPA mandate, and no notion of a rule. Those live in `ayq-store.json` beside
the budget, keyed by the same `imported_id` the transaction carries, together
with the rules and the import history. It is versioned and written atomically,
and a store written by a newer AYQ is refused rather than quietly overwritten.

## Importing a statement

```
Import CAMT.053  ──▶  import.pick   host opens the native picker, answers a path
                 ──▶  import.camt   engine reads it, parses, maps, imports
```

The renderer never touches the filesystem — it has none — and never parses
anything. `.xml` and `.zip` are both accepted; a ZIP is read in memory and
never extracted. The parsing is `ayq-camt`'s, the mapping the bridge's, the
import `@actual-app/api`'s.

The account is named from the statement's IBAN, masked to a country code and
the last four. That is enough to tell two accounts apart and to recognise your
own; it is also what makes a second import land in the same account.

**Duplicate protection** is the record's own key. Every transaction carries
`imported_id` — the bank's `AcctSvcrRef` when it gave one, the record's stable
`ayqKey` otherwise, neither depending on the file name ABN AMRO derives from
the moment of download. Actual matches on it, so importing the same export
twice adds nothing. Repeats *within* one import are collapsed before the rows
are sent, because Actual matches an import against the budget and not against
itself, and a ZIP of daily statements overlaps by construction.

## Running it

One command from a clean checkout:

```bash
cd ayq/ayq-desktop
node setup.mjs      # or: npm run setup, once dependencies exist
npm start           # the production path
```

`setup.mjs` installs the three packages the desktop needs — the host, the
renderer and the CAMT parser — and builds the engine's native SQLite for
Electron's ABI, then refuses to finish unless the result actually opens a
database under Electron.

It uses `@electron/rebuild` — the same tool, the same pinned version and the
same invocation upstream Actual uses (`--only <module> --force
--build-from-source`). There is deliberately no second dependency model.
`better-sqlite3` publishes prebuilds for Node ABIs only — there is no
`electron-v148` asset — so a source build against Electron's headers is not a
preference but the only thing that exists.

`node-gyp` is pinned to 13.0.2 through an npm `overrides` entry. The version
`@electron/rebuild` depends on recognises Visual Studio 2017, 2019 and 2022 and
nothing else, so on a machine carrying a newer Visual Studio it reports that it
found no installation at all. 13.0.2 knows VS 2026 as well.

`setup.mjs` runs npm through `ComSpec` explicitly on Windows rather than
spawning `npm.cmd` and hoping. Since the CVE-2024-27980 fix, Node refuses to
execute a batch file without a command shell, and the spawn fails before the
process exists — no output, no exit code.

Determinism rests on three things, and `setup.mjs` enforces the first:

- `electron` is pinned to an exact version in `package.json`, and setup exits
  if it ever becomes a range.
- The rebuild is passed that same version explicitly rather than sniffing it.
- `verify-native.mjs` opens a real database under Electron afterwards. That is
  not ceremony: `better-sqlite3` binds lazily, so a gate that stops at
  `require` reports success while the engine is still broken.

### The development fallback

```bash
npm run start:debug-node-engine
```

Forks the engine on the system Node, where the binding already matches, so the
UI can be worked on without a rebuild. It is a development shortcut and not the
shipped path: the production smoke passes `--require-host "electron
utilityProcess"`, so this mode cannot satisfy the acceptance test.

## Packaging

```bash
npm run package
```

Builds the renderer and the host, draws the icon, and hands the result to
`electron-builder` — the same packager, the same NSIS target and the same
`npmRebuild: false` upstream Actual uses, because `setup.mjs` has already built
and verified the native binding and rebuilding would replace a verified state
with an unverified one. The installer lands in `release/`.

The archive keeps AYQ's own code but unpacks `@actual-app/api` and
`better-sqlite3`: the first reads its migrations and template database as
files, and the second is a native binding. Both need to be on disk.

The installer is **per-user**. AYQ writes only to the user's own data
directory, and an installer that demands administrator rights to run a personal
finance application is asking for a permission it has no use for.

`app.setName('AYQ')` is called before anything asks for a path, so a checkout
and an installed build read the same `%APPDATA%\AYQ\budget` rather than two
directories for the same person's money.

## Where the data is

```
%APPDATA%\AYQ\budget\           the Actual budget, and ayq-store.json beside it
```

Nothing is written outside it, and nothing leaves the machine: there is no sync
server, no cloud upload and no telemetry. The budget is created through the
handler `runImport` sits on with `avoidUpload`, precisely so that a first
launch does not even attempt a network AYQ is not on.

## Tests

`npm test` forks the built engine and asks it the same requests the renderer
sends — a real budget, the real API, seventeen of them. `npm run smoke` covers
the Electron half, and the Windows workflow covers the packaged one.

## Scope

No sync, no Android, no CIVION, and nothing migrated from Actual's own screens.
`packages/desktop-client` is untouched and remains untouched.
