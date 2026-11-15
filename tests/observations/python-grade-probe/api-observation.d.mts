import type { Page } from '@playwright/test';
export function classifyApi(
  url: string,
  method: string,
): 'session' | 'capability' | 'grade' | undefined;
export function responseClass(route: 'session' | 'capability' | 'grade', status: number): string;
export function observeApi(page: Page, mark: (stage: string) => void): void;
