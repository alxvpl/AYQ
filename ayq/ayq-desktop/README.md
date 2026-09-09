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
| `counterparties.list` · `counterparty.detail` | who the money went to |
| `aliases.list` · `alias.create` · `alias.remove` | who a name variant is |
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
with the rules, the aliases and the import history. It is versioned and written
atomically, and a store written by a newer AYQ is refused rather than quietly
overwritten.

Schema versions: **1** imports, rules, provenance, decisions. **2** adds the
alias table; a version 1 store gains an empty one and nothing already written
is rewritten.

## Who a counterparty is

The importer resolves a name through `ayq-camt`'s chain of layers and records
what it decided. It is right most of the time and cannot be right always: a
shop that renames itself, or a terminal that prints one merchant two ways,
produces two counterparties where a person sees one. An **alias** is the person
saying so — one imported name variant is one canonical counterparty. It is an
exact match on a normalised key, never a similarity score, and AYQ never
invents one.

The precedence, and it is the same one whether a transaction was imported years
ago or arrives tomorrow:

1. an alias whose `variantKey` is the counterparty key provenance recorded for
   the transaction — a person's decision, and the last word;
2. that recorded key itself, whatever resolver layer pronounced it;
3. the payee Actual holds, for a transaction AYQ did not import;
4. nothing, and the transaction belongs to no counterparty.

Line 1 is applied when the ledger is read — `ayqCanonicalKey` in
`src/ayq-aliases.ts`, which every view that groups by counterparty goes
through — and again at import, where it decides the payee a new transaction
gets. Provenance is never rewritten: the key the resolver decided, the name it
pronounced and the string the bank printed stay exactly as they arrived, which
is what lets an alias be taken back.

An alias answers *who this is*. A category rule answers *where it belongs*.
They are separate, and neither may overwrite a category a person filed by hand.

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

## Installing it

The Windows workflow publishes `AYQ-0.1.0-windows-x64-setup.exe` as an
artifact of every green run on this branch. To install:

1. Download the `ayq-windows-installer` artifact from the run and unzip it.
2. Run the `.exe`. It installs for the current user, into
   `%LOCALAPPDATA%\Programs\AYQ`, and asks for no administrator rights.
   Windows SmartScreen will warn that the publisher is unknown — the build is
   not code-signed, which is a certificate AYQ does not have rather than
   anything about the binary.
3. Start AYQ from the Start menu or the desktop shortcut.
4. Press **Import CAMT.053** and choose one or more `.xml` statements, or a
   `.zip` of them. Everything else follows from the ledger.

Uninstall through Windows' own Apps list. That removes the program; the budget
in `%APPDATA%\AYQ` stays, because deleting a person's financial history is not
something an uninstaller should decide.

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

## Known limits

Honest ones, none of them blocking for a personal ledger:

- The AYQ store is a single JSON file rewritten on each import. At a few
  thousand transactions that is milliseconds; at a hundred thousand it would
  want a database of its own.
- Applying rules updates transactions one at a time, so a first import that
  categorises hundreds of rows takes a few seconds longer than it needs to.
- The ledger reads every matching transaction and filters in the renderer's
  process rather than in SQL, so search is exact-substring and case-blind
  rather than indexed.
- The installer is not code-signed.
- A broken native binding surfaces as Actual's own "unknown problem opening"
  rather than the sentence that names the cure; `npm run setup` prints that
  sentence, and a packaged build has the binding built for it already.

## Scope

No sync, no Android, no CIVION, and nothing migrated from Actual's own screens.
`packages/desktop-client` is untouched and remains untouched.
