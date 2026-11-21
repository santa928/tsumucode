import type { Page, Request, Response } from '@playwright/test';

export interface PreviewTracker {
  request: (request: Request) => void;
  response: (response: Response) => void;
  failed: (request: Request) => void;
  snapshot: (ui: unknown) => unknown;
}

export function createPreviewTracker(): PreviewTracker;
export function capturePreviewFailure(page: Page, tracker: PreviewTracker): Promise<unknown>;
