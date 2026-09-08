# ayq-client

The AYQ renderer. Ours, not Actual's: `packages/desktop-client` is not forked,
not imported and not consulted.

Today it is one screen showing one answer from the engine. What it is for at
this stage is the boundary, not the interface.

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

## Scope

One screen, deliberately. No navigation, no CAMT import surface, no design
system, nothing migrated from Actual. The design pass comes when there is a
product to design; this proves there is an architecture to build one on.
