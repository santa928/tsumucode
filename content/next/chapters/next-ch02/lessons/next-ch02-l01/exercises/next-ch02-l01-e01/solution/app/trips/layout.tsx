import type { ReactNode } from 'react';

/** trips配下のpageを共通の見出しで囲む。 */
export default function TripsLayout({ children }: { children: ReactNode }) {
  return (
    <section aria-labelledby="trip-layout">
      <h2 id="trip-layout">旅行ノート</h2>
      {children}
    </section>
  );
}
