import { RouterProvider } from 'react-router-dom';
import type { createAppRouter } from './router';

interface AppProps {
  readonly router: ReturnType<typeof createAppRouter>;
}

/** Composition rootが所有するHash RouterをTsumuCode UIへ接続する。 */
export function App({ router }: AppProps) {
  return <RouterProvider router={router} />;
}
