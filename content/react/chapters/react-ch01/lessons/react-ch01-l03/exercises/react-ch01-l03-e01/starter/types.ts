import type { ReactElement } from 'react';

export type { ReactElement };

export interface CardProps {
  readonly title: string;
  readonly summary: string;
}

export interface PanelProps {
  readonly children: ReactElement;
}
