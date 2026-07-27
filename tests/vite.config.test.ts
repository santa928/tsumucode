// @vitest-environment node
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { resolveConfig } from 'vite';
import { normalizeBasePath } from '../vite.config';

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

describe('Vite production build', () => {
  it('Subpath smokeがEntryと静的Importを追跡できるmanifestを生成する', async () => {
    const config = await resolveConfig(
      { configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)) },
      'build',
      'production',
    );

    expect(config.build.manifest).toBe(true);
  });

  it('初期HTMLへinlineする単一CSSを遅延Chunkの追加requestから分離する', async () => {
    const config = await resolveConfig(
      { configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)) },
      'build',
      'production',
    );

    expect(config.build.cssCodeSplit).toBe(false);
  });

  it('Mode別manifest closureをpost-buildで先読みするためViteのJS preload helperを無効にする', async () => {
    const config = await resolveConfig(
      { configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)) },
      'build',
      'production',
    );

    expect(config.build.modulePreload).toBe(false);
  });

  it('通常学習とLibraryをHTML bootstrapから独立したProduction entryとして生成する', async () => {
    const config = await resolveConfig(
      { configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)) },
      'build',
      'production',
    );
    const input = config.build.rolldownOptions.input as Readonly<Record<string, string>>;

    expect(Object.keys(input).sort()).toEqual(['index', 'library', 'normalLearning']);
    expect(input.library).toMatch(/\/src\/app\/libraryEntry\.tsx$/u);
    expect(input.normalLearning).toMatch(/\/src\/app\/normalLearningEntry\.tsx$/u);
  });

  it('Vitestの全Suiteを再現可能な2 worker以下で実行する', async () => {
    const config = await resolveConfig(
      { configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)) },
      'build',
      'production',
    );
    const testConfig = (config as typeof config & { test?: { maxWorkers?: number } }).test;

    expect(testConfig?.maxWorkers).toBe(2);
  });
});
