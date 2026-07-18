// @vitest-environment node
import { readFile, readdir } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { createPlaywrightConfig } from '../playwright.config';
import { testBasePath, testServerUrl } from './e2e/helpers/testBasePath';

describe('Playwright test base path', () => {
  it('未指定時はGitHub Pages相当のrepository subpathへ固定する', () => {
    const originalBasePath = process.env['BASE_PATH'];
    delete process.env['BASE_PATH'];
    try {
      expect(testBasePath()).toBe('/repository-name/');
      expect(testServerUrl()).toBe('http://127.0.0.1:4173/repository-name/');
    } finally {
      if (originalBasePath === undefined) delete process.env['BASE_PATH'];
      else process.env['BASE_PATH'] = originalBasePath;
    }
  });

  it.each([
    ['', '/'],
    ['/', '/'],
    ['repository-name', '/repository-name/'],
    ['/owner/repository-name/', '/owner/repository-name/'],
  ])('%jを正規化して%jにする', (value, expected) => {
    expect(testBasePath(value)).toBe(expected);
  });

  it.each(['.', '..', '/owner/../repository-name/', '/owner/./repository-name/'])(
    'path traversalを含むBASE_PATH %jを拒否する',
    (value) => {
      expect(() => testBasePath(value)).toThrow('不正なBASE_PATHです');
    },
  );

  it('previewとVite serverを同じ任意のrepository subpathで待機する', () => {
    const config = createPlaywrightConfig('/tsumucode/');

    expect(config.webServer).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ url: 'http://127.0.0.1:4173/tsumucode/' }),
        expect.objectContaining({ url: 'http://127.0.0.1:4174/tsumucode/' }),
      ]),
    );
  });

  it('E2E sourceへ既定repository名を埋め込まない', async () => {
    const sourcePaths = (await readdir('tests/e2e', { recursive: true })).filter(
      (sourcePath) => sourcePath.endsWith('.ts') && sourcePath !== 'helpers/testBasePath.ts',
    );
    const sources = await Promise.all(
      sourcePaths.map(async (sourcePath) => ({
        sourcePath,
        source: await readFile(`tests/e2e/${sourcePath}`, 'utf8'),
      })),
    );

    expect(
      sources
        .filter(({ source }) => source.includes('/repository-name/'))
        .map(({ sourcePath }) => sourcePath),
    ).toEqual([]);
  });
});
