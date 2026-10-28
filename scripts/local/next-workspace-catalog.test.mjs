// @vitest-environment node
import { expect, it } from 'vitest';
import * as protocol from './next-project-protocol.mjs';
const catalog = (rows) => ({ schemaVersion: 1, mode: 'compiled', workspaces: rows });
const row = {
  id: 'future-topic-workspace',
  courseId: 'future-topic',
  template: 'page-route-query',
};
it('accepts only exact compiler declarations and an existing finite execution contract', () => {
  const registry = protocol.createNextWorkspaceRegistry(catalog([row]));
  expect(registry.get(row.id)).toEqual(protocol.nextTemplate('page-route-query'));
  expect(registry.get(protocol.NEXT_WORKSPACE)).toBeUndefined();
  expect(registry.get('undeclared-workspace')).toBeUndefined();
  expect(() => registry.register('injected-workspace', 'page-route-query')).toThrow();
  expect(() => registry.register(row.id, 'server-action-validation')).toThrow();
});
it.each([
  [{ ...row, template: 'arbitrary-code' }],
  [{ ...row, id: '../outside' }],
  [{ ...row, files: { 'controller.mjs': 'forged' } }],
  [row, row],
  [row, { ...row, courseId: 'another-topic' }],
  [{ ...row, id: protocol.NEXT_WORKSPACE, template: 'server-action-validation' }],
])('rejects unknown, forged, duplicated or rebound declarations: %j', (rows) => {
  expect(() => protocol.createNextWorkspaceRegistry(catalog(rows))).toThrow();
});
it('keeps browser registration separate from a sealed runtime catalog', () => {
  const browser = protocol.createNextWorkspaceRegistry({
    schemaVersion: 1,
    mode: 'bootstrap-legacy',
    workspaces: [],
  });
  browser.register(row.id, row.template);
  expect(browser.get(row.id)).toEqual(protocol.nextTemplate(row.template));
  expect(() => browser.register(row.id, 'server-action-validation')).toThrow();
  const runtime = protocol.createNextWorkspaceRegistry(catalog([]));
  expect(runtime.get(protocol.NEXT_WORKSPACE)).toBeUndefined();
  expect(() => runtime.register(row.id, row.template)).toThrow();
});

it('does not let caller mutation reopen a sealed catalog', () => {
  const input = catalog([row]);
  const registry = protocol.createNextWorkspaceRegistry(input);
  input.mode = 'bootstrap-legacy';
  input.workspaces.push({ ...row, id: 'injected' });
  expect(registry.mode).toBe('compiled');
  expect(registry.get('injected')).toBeUndefined();
  expect(() => registry.register('injected', 'page-route-query')).toThrow();
});
