// Where AYQ starts.
//
// One React root over the whole window: the ground provider decides which
// ground everything below is drawn in (04 A23), and the application draws the
// rail, the screen and the status bar (A20).

import { createRoot } from 'react-dom/client';

import { AyqApplication } from './ayq-application.tsx';
import { AyqGroundProvider } from './ayq-ui/ayq-ground-provider.tsx';

const host = document.getElementById('ayq-root');
if (host === null) {
  throw new Error('the page AYQ was given has nowhere to draw');
}

createRoot(host).render(
  <AyqGroundProvider>
    <AyqApplication />
  </AyqGroundProvider>,
);
