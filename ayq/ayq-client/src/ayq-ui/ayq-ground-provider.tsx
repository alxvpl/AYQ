// The ground, in force.
//
// One place decides which ground the window is drawn in (04 A23): it asks the
// engine what the owner chose, resolves `system` against the operating system,
// hands Fluent the matching theme, and writes AYQ's own tokens out as custom
// properties for the components Fluent does not own (A13).
//
// A change applies here and now. Nothing restarts, and nothing is redrawn by
// hand: the value changes and everything below reads the new one.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { FluentProvider } from '@fluentui/react-components';

import { ayqResolveGround, ayqSystemPrefersDark, ayqWatchSystemGround } from '../ayq-ground.ts';
import { ayqReadSettings, ayqWriteSettings } from '../ayq-settings-client.ts';
import { ayqTheme } from '../ayq-theme.ts';
import {
  ayqCssVariables,
  type AyqGround,
  type AyqGroundResolved,
} from '../ayq-tokens.ts';

export type AyqGroundState = {
  /** What the owner chose, which may be `system`. */
  ground: AyqGround;
  /** What that means right now. */
  resolved: AyqGroundResolved;
  /** Why the last change did not stick, if it did not. */
  failure: string | null;
  /** True while a choice is on its way to the engine. */
  saving: boolean;
  choose(ground: AyqGround): void;
};

const GroundContext = createContext<AyqGroundState | null>(null);

export function useAyqGround(): AyqGroundState {
  const state = useContext(GroundContext);
  if (state === null) {
    throw new Error('a ground was asked for outside the provider that holds it');
  }
  return state;
}

export function AyqGroundProvider({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  const [ground, setGround] = useState<AyqGround>('system');
  const [prefersDark, setPrefersDark] = useState<boolean>(() =>
    ayqSystemPrefersDark(),
  );
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => ayqWatchSystemGround(setPrefersDark), []);

  useEffect(() => {
    let live = true;
    void ayqReadSettings()
      .then(settings => {
        if (live) setGround(settings.ground);
      })
      .catch((error: unknown) => {
        // A ground that could not be read is not a reason to refuse to draw:
        // the window follows the system, which is what it would have done
        // before anybody chose anything.
        if (live) {
          setFailure(error instanceof Error ? error.message : String(error));
        }
      });
    return () => {
      live = false;
    };
  }, []);

  const choose = useCallback(
    (next: AyqGround) => {
      // Applied first and saved after. The choice is about what is on the
      // screen, and a screen that waits for a file to be written before it
      // changes is a screen that feels broken.
      setGround(next);
      setSaving(true);
      setFailure(null);
      void ayqWriteSettings({ ground: next })
        .then(stored => {
          setGround(stored.ground);
          setSaving(false);
        })
        .catch((error: unknown) => {
          setFailure(error instanceof Error ? error.message : String(error));
          setSaving(false);
        });
    },
    [],
  );

  const resolved = ayqResolveGround(ground, prefersDark);
  const theme = useMemo(() => ayqTheme(resolved), [resolved]);
  const variables = useMemo(
    () => ayqCssVariables(resolved) as unknown as Record<string, string>,
    [resolved],
  );

  const state = useMemo<AyqGroundState>(
    () => ({ ground, resolved, failure, saving, choose }),
    [ground, resolved, failure, saving, choose],
  );

  return (
    <GroundContext.Provider value={state}>
      <FluentProvider
        theme={theme}
        data-ayq-ground={ground}
        data-ayq-ground-resolved={resolved}
        style={{
          ...variables,
          backgroundColor: 'var(--ayq-ground)',
          color: 'var(--ayq-ink)',
          fontFamily: 'var(--ayq-font-ui)',
          fontSize: 'var(--ayq-size-body)',
          height: '100%',
        }}
      >
        {children}
      </FluentProvider>
    </GroundContext.Provider>
  );
}
