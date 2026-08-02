import { describe, expect, it } from 'vitest';
import { resolvePublicAsset } from './resolvePublicAsset';

const ERROR = 'Public Asset pathは安全な相対Pathで指定してください。';

describe('resolvePublicAsset', () => {
  it.each([
    [
      '/repository-name/',
      'generated/content/catalog-v3.json',
      '/repository-name/generated/content/catalog-v3.json',
    ],
    ['/', './assets/logo.png', '/assets/logo.png'],
    ['', 'evil.example/icon.svg', '/evil.example/icon.svg'],
    [
      '/repository-name/',
      'images/%E7%A9%8D%E3%81%BF%E6%9C%A8.png',
      '/repository-name/images/%E7%A9%8D%E3%81%BF%E6%9C%A8.png',
    ],
  ])('安全なbaseと相対Pathを同一Origin内で結合する: %s + %s', (baseUrl, path, expected) => {
    expect(resolvePublicAsset(baseUrl, path)).toBe(expected);
  });

  it.each([
    '/root.png',
    '../secret.txt',
    'https://example.com/a.png',
    '//evil.example/a.png',
    '%2e%2e/secret.txt',
    '%252e%252e/secret.txt',
    '..\\secret.txt',
    '%2fsecret.txt',
    '%5csecret.txt',
    'asset%00.png',
    'asset%7f.png',
    '%',
    '%2',
    '%GG',
    'asset.png?cache=1',
    'asset.png#fragment',
  ])('正規化後に危険となる相対Pathを拒否する: %s', (path) => {
    expect(() => resolvePublicAsset('/repository-name/', path)).toThrow(ERROR);
  });

  it.each(['https://example.com/', '//evil.example/', '/repo/%2e%2e/', '\\evil.example'])(
    '安全でないbaseを拒否する: %s',
    (baseUrl) => {
      expect(() => resolvePublicAsset(baseUrl, 'asset.png')).toThrow(ERROR);
    },
  );
});
