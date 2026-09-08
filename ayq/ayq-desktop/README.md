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

## Running it

```bash
npm install
npm start                 # engine in Electron's utilityProcess
npm run start:node-engine # engine in a Node fork
npm run smoke             # launch, verify, screenshot, exit non-zero on failure
```

`npm start` is the production shape. It needs the engine's native SQLite built
for Electron once:

```bash
npm run rebuild:engine    # electron-rebuild -o better-sqlite3 --build-from-source -f
```

That is the same step Actual has, for the same reason: `@actual-app/api` carries
a native binding, and Electron's Node ABI is not the system Node's. Until it is
run, `npm start` reaches the engine, gets a real error back, and the screen
prints a message naming the fix — which is the correct behaviour, not a
workaround.

`npm run start:node-engine` forks the engine on the system Node instead, where
the binding already matches. Same window, same preload, same contract, same
engine, same budget; only the process manager differs, and the response reports
which one answered so the screen never has to be taken on trust.

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
