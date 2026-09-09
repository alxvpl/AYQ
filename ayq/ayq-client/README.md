# ayq-client

The AYQ renderer. Ours, not Actual's: `packages/desktop-client` is not forked,
not imported and not consulted.

It is a desktop application shell: a navigation column that holds the five
workspaces and the accounts, and a workspace beside it that fills the window.
Every figure in it — an account's balance included — is one the engine
computed; this side formats numbers and draws them.

## What it may touch

Nothing but its own files and `window.ayq`.

```ts
const answer = await window.ayq.request({ id, kind: 'engine.status' });
```

No `@actual-app/api`, no `loot-core`, no `electron`, no `node:` builtins. The
host runs with `contextIsolation` on and `nodeIntegration` off, so this is not a
convention the renderer is trusted to keep — there is no `require` and no
`process` inside it to break the rule with.

`npm test` checks it anyway, on the sources and on the built bundle: every
import specifier must be relative and inside the package, the contract file must
have no imports at all, and the bundle must contain none of the engine's
surface. The renderer is allowed to *name* the engine — it displays which
version answered — so the check is for the engine having been pulled in, not for
the string appearing.

## The contract

`src/ayq-ipc-contract.ts` is the file both halves share, and the only one they
share. It declares types and one channel name and imports nothing.

A single channel carries correlated request/response messages, rather than a
channel per feature. Adding a capability means adding a member to the request
union — not a new channel, a new preload entry and a new relay branch. That is
the shape Actual's own desktop app uses, and it is what keeps the surface
between the two halves countable.

## Building

```bash
npm run build      # esbuild → dist/, bundled for the browser
npm run typecheck
npm test
```

The renderer is bundled for the browser, not for Node: it has no module
resolution at runtime, so anything it needs is either in the bundle or comes
through the bridge. `ayq-desktop` copies `dist/` in beside its own build and
serves it with `loadFile`.

## The shell

`src/ayq-shell.ts` draws the navigation and the workspace header, and it is the
only place that knows what the workspaces are called. The account a person picks
is not kept anywhere new: it is one field of the ledger's own filter, so the
column on the left and the control in the filter bar cannot disagree about which
account is being looked at.

`test/ayq-shell.test.ts` draws it into the shipped `src/ayq-client.html` under
jsdom and clicks it — the accounts come from account summaries shaped like the
engine's, choosing one narrows the filter, and All accounts widens it again.
jsdom is a test dependency; the renderer's own sources still import nothing but
each other, and the boundary test says so.

## Scope

No design system and nothing migrated from Actual. What has been built is
information architecture: where things are, and how you get to them.
