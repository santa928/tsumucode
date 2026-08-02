import { render, type RenderResult } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router';

export interface RenderWithRouterOptions {
  readonly route?: string;
}

/** UIをMemory Routerと独立User Event session付きで描画する。 */
export function renderWithRouter(
  ui: ReactElement,
  options: RenderWithRouterOptions = {},
): RenderResult & { readonly user: UserEvent } {
  const user = userEvent.setup();
  return {
    user,
    ...render(<MemoryRouter initialEntries={[options.route ?? '/']}>{ui}</MemoryRouter>),
  };
}
