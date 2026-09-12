// Where AYQ's own interface is mounted into the window.
//
// The application is being brought over to Fluent UI React v9 one screen at a
// time (04 A15). This is the seam while that is happening: a React root is
// created inside whatever element the shell hands it, and taken down again
// when the shell moves somewhere else. There is one root at a time.

import { createRoot, type Root } from 'react-dom/client';

import { AyqAppearanceScreen } from './ayq-screens/ayq-appearance.tsx';
import { AyqGroundProvider } from './ayq-ui/ayq-ground-provider.tsx';

let mounted: { host: HTMLElement; container: HTMLElement; root: Root } | null =
  null;

/** Draws the Appearance screen into `host`. Calling it twice is harmless. */
export function ayqMountAppearance(host: HTMLElement): void {
  const tree = (
    <AyqGroundProvider>
      <AyqAppearanceScreen />
    </AyqGroundProvider>
  );

  if (mounted !== null && mounted.host === host && host.contains(mounted.container)) {
    mounted.root.render(tree);
    return;
  }

  ayqUnmountFluent();
  const container = document.createElement('div');
  container.dataset.ayqFluent = 'root';
  host.replaceChildren(container);
  const root = createRoot(container);
  mounted = { host, container, root };
  root.render(tree);
}

/** Takes the React root down, so leaving the screen does not leave it running. */
export function ayqUnmountFluent(): void {
  if (mounted === null) return;
  const { root, container } = mounted;
  mounted = null;
  // Unmounting synchronously from inside React's own render pass is refused;
  // this is only ever called from the shell's draw, which is outside one.
  root.unmount();
  container.remove();
}
