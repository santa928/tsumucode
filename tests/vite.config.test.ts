// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import viteConfiguration, { normalizeBasePath } from '../vite.config';
afterEach(() => vi.unstubAllEnvs());

const ERROR = 'BASE_PATHは同一OriginのPathで指定してください。';

describe('normalizeBasePath', () => {
  it.each([
    [undefined, '/'],
    ['', '/'],
    ['/', '/'],
    ['repository-name', '/repository-name/'],
    ['/repository-name/', '/repository-name/'],
    ['/docs/v1..2/', '/docs/v1..2/'],
  ])('安全な入力を先頭・末尾Slash付きにする: %s', (value, expected) => {
    expect(normalizeBasePath(value)).toBe(expected);
  });

  it.each([
    'https://example.com/',
    '//evil.example/',
    '../repo',
    '/repo/../secret/',
    '/repo/%2e%2e/',
    '/repo/%252e%252e/',
    '\\evil.example',
    '/repo/%2fsecret/',
    '/repo/%5csecret/',
    '/repo/%00/',
    '/repo/%7f/',
    '/repo/%',
    '/repo?query=1',
    '/repo#fragment',
  ])('外部Originまたは非canonical Pathを拒否する: %s', (value) => {
    expect(() => normalizeBasePath(value)).toThrow(ERROR);
  });
});

describe('authoring data projection', () => {
  it('uses authoring data for the source server while keeping builds on the public projection', () => {
    vi.stubEnv('TSUMUCODE_AUTHORING_PREVIEW', '1');
    if (typeof viteConfiguration !== 'function')
      throw new Error('Vite configuration must be a factory');
    expect(viteConfiguration({ mode: 'test', command: 'serve' }).publicDir).toBe(
      '.release-v2/authoring-public',
    );
    expect(viteConfiguration({ mode: 'test', command: 'build' }).publicDir).toBe('public');
  });
});
