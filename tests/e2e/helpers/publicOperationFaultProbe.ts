import type { Page } from '@playwright/test';

const knownConsoleTypes = new Set([
  'log',
  'debug',
  'info',
  'warning',
  'dir',
  'dirxml',
  'table',
  'trace',
  'clear',
  'startGroup',
  'startGroupCollapsed',
  'endGroup',
  'profile',
  'profileEnd',
  'count',
  'time',
  'timeEnd',
]);
const knownResourceTypes = new Set([
  'document',
  'stylesheet',
  'image',
  'media',
  'font',
  'script',
  'texttrack',
  'xhr',
  'fetch',
  'eventsource',
  'websocket',
  'manifest',
  'other',
]);

/** Verification-only observer, not connected to the published-operations gate. */
export function watchPublicFaults(
  page: Page,
  scope: 'primary' | 'transfer',
  failures: string[],
  resources: Set<string>,
): void {
  if (scope !== 'primary' && scope !== 'transfer') throw new Error('Invalid observation scope');
  const record = (kind: string) => {
    if (failures.length < 64) failures.push(`${scope}-${kind}`);
    else if (failures.length === 64) failures.push('observation-overflow');
  };
  page.on('pageerror', () => record('page-error'));
  page.on('console', (message) => {
    try {
      const type = message.type();
      if (type === 'error' || type === 'assert') record('console-error');
      else if (!knownConsoleTypes.has(type)) record('console-unknown');
    } catch {
      record('console-unknown');
    }
  });
  page.on('request', (request) => {
    try {
      const type = request.resourceType();
      if (knownResourceTypes.has(type)) resources.add(`${scope}-${type}`);
      else record('request-type-unknown');
    } catch {
      record('request-type-unknown');
    }
  });
  // Do not inspect or discard errors, including intentional or unknown aborts.
  page.on('requestfailed', () => record('request-failed'));
}
