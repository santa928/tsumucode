import { describe, expect, it } from 'vitest';
import { buildModuleGraph, resolveModuleSpecifier } from './moduleGraph';

describe('JavaScript module graph', () => {
  it('import元からWorkspace内の相対specifierをcanonical pathへ解決する', () => {
    expect(resolveModuleSpecifier('src/main.js', './data.js')).toBe('src/data.js');
    expect(resolveModuleSpecifier('src/app/main.js', '../data.js')).toBe('src/data.js');
    expect(() => resolveModuleSpecifier('src/main.js', '../../secret.js')).toThrow(/Workspace/u);
  });

  it('到達可能なmoduleを依存先優先の決定順で返す', () => {
    const graph = buildModuleGraph({
      entryFile: 'src/main.js',
      files: {
        'src/main.js':
          "import { answer } from './data.js';\nexport { label } from './label.js';\nconsole.log(answer);",
        'src/data.js': 'export const answer = 42;',
        'src/label.js': "export const label = '答え';",
        'src/unused.js': 'export const unused = true;',
      },
    });

    expect(graph.entryFile).toBe('src/main.js');
    expect(graph.modules.map(({ file }) => file)).toEqual([
      'src/data.js',
      'src/label.js',
      'src/main.js',
    ]);
    expect(graph.modules.at(-1)?.dependencies).toEqual([
      expect.objectContaining({ specifier: './data.js', resolvedFile: 'src/data.js' }),
      expect.objectContaining({ specifier: './label.js', resolvedFile: 'src/label.js' }),
    ]);
  });

  it.each([
    ['bare import', "import 'package';", /相対/u],
    ['dynamic import', "import('./data.js');", /dynamic import/u],
    ['未知File', "import './missing.js';", /見つかりません/u],
  ])('%sを拒否する', (_label, source, expected) => {
    expect(() =>
      buildModuleGraph({
        entryFile: 'src/main.js',
        files: { 'src/main.js': source, 'src/data.js': 'export const value = 1;' },
      }),
    ).toThrow(expected);
  });

  it('循環moduleを起点File付きで拒否する', () => {
    expect(() =>
      buildModuleGraph({
        entryFile: 'main.js',
        files: {
          'main.js': "import './a.js';",
          'a.js': "import './main.js';",
        },
      }),
    ).toThrow(/main\.js.*a\.js.*main\.js/u);
  });
});
