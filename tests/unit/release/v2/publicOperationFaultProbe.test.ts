// @vitest-environment node
import { EventEmitter } from 'node:events';
import type { Page } from '@playwright/test';
import { expect, it } from 'vitest';
import { watchPublicFaults } from '../../../e2e/helpers/publicOperationFaultProbe';

it('records only fixed labels for both pages and does not ignore aborts or unknown console events', () => {
  const primary = new EventEmitter(),
    transfer = new EventEmitter(),
    failures: string[] = [],
    resources = new Set<string>();
  watchPublicFaults(primary as unknown as Page, 'primary', failures, resources);
  watchPublicFaults(transfer as unknown as Page, 'transfer', failures, resources);
  const opaque = new Proxy({}, { get: () => { throw new Error('synthetic-secret'); } });
  primary.emit('console', { type: () => 'warning' });
  expect(failures).toEqual([]);
  primary.emit('console', { type: () => 'error', text: () => { throw new Error('synthetic-secret'); } });
  primary.emit('requestfailed', opaque);
  transfer.emit('requestfailed', opaque);
  transfer.emit('pageerror', opaque);
  transfer.emit('console', { type: () => { throw new Error('synthetic-secret'); } });
  transfer.emit('console', { type: () => 'unexpected-synthetic-secret' });
  primary.emit('request', { resourceType: () => 'fetch', url: () => { throw new Error('synthetic-secret'); } });
  transfer.emit('request', { resourceType: () => 'unexpected-synthetic-secret' });
  expect(failures).toEqual([
    'primary-console-error', 'primary-request-failed', 'transfer-request-failed',
    'transfer-page-error', 'transfer-console-unknown', 'transfer-console-unknown', 'transfer-request-type-unknown',
  ]);
  expect([...resources]).toEqual(['primary-fetch']);
  expect(JSON.stringify(failures)).not.toContain('synthetic-secret');
});

it('fails closed on overflow and does not accept an untrusted scope', () => {
  const page = new EventEmitter(), failures: string[] = [], resources = new Set<string>();
  watchPublicFaults(page as unknown as Page, 'primary', failures, resources);
  for (let index = 0; index < 100; index += 1) page.emit('requestfailed');
  expect(failures).toHaveLength(65);
  expect(failures[64]).toBe('observation-overflow');
  expect(() => watchPublicFaults(page as unknown as Page, 'synthetic-secret' as never, failures, resources))
    .toThrow('Invalid observation scope');
});
