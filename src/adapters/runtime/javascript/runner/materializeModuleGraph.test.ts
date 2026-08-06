import { describe, expect, it } from 'vitest';
import type { JavaScriptInstrumentedModule } from '../analyzer/contracts';
import { prepareModuleGraph, type PreparedJavaScriptModule } from './materializeModuleGraph';

const modules: readonly JavaScriptInstrumentedModule[] = [
  {
    file: 'src/score.js',
    instrumentedCode: 'export const score = 1;',
    dependencies: [],
  },
  {
    file: 'src/main.js',
    instrumentedCode: "import { score } from './score.js';\nconsole.log(score);",
    dependencies: [
      { specifier: './score.js', resolvedFile: 'src/score.js', start: 22, end: 34 },
    ],
  },
];

/** Prepared Planへ依存URLを差し込み、iframe側の組み立て結果を再現する。 */
function assemble(module: PreparedJavaScriptModule, urls: Readonly<Record<string, string>>): string {
  let source = module.sourceSegments[0] ?? '';
  for (const [index, dependencyFile] of module.dependencyFiles.entries()) {
    source += JSON.stringify(urls[dependencyFile]) + (module.sourceSegments[index + 1] ?? '');
  }
  return source;
}

describe('prepareModuleGraph', () => {
  it('specifierをSource断片へ分け、依存先URLをtrusted値として後から差し込める', () => {
    const graph = prepareModuleGraph({
      entryFile: 'src/main.js',
      graphSha256: 'a'.repeat(64),
      modules,
      guardIdentifier: '__tsumuBudget',
      runtimeKey: '__tsumuRuntime_1234',
    });

    expect(graph.entryFile).toBe('src/main.js');
    expect(graph.graphSha256).toBe('a'.repeat(64));
    expect(assemble(graph.modules[1]!, { 'src/score.js': 'blob:iframe-score' })).toContain(
      '"blob:iframe-score"',
    );
    expect(graph.modules[1]?.sourceSegments[0]).toContain(
      'const __tsumuBudget=globalThis["__tsumuRuntime_1234"]',
    );
  });

  it('閉じていないgraphはURL生成前のPlan段階で拒否する', () => {
    const invalidModules: readonly JavaScriptInstrumentedModule[] = [
      modules[0]!,
      {
        ...modules[1]!,
        dependencies: [
          { specifier: './score.js', resolvedFile: 'src/missing.js', start: 22, end: 34 },
        ],
      },
    ];

    expect(() =>
      prepareModuleGraph({
        entryFile: 'src/main.js',
        graphSha256: 'a'.repeat(64),
        modules: invalidModules,
        guardIdentifier: '__tsumuBudget',
        runtimeKey: '__tsumuRuntime_1234',
      }),
    ).toThrow(/依存Module/u);
  });

  it('Entryがgraph末尾でないPlanを拒否する', () => {
    expect(() =>
      prepareModuleGraph({
        entryFile: 'src/score.js',
        graphSha256: 'a'.repeat(64),
        modules,
        guardIdentifier: '__tsumuBudget',
        runtimeKey: '__tsumuRuntime_1234',
      }),
    ).toThrow(/graph末尾/u);
  });

  it('sourceURL commentへコードを注入できる制御文字入りpathを拒否する', () => {
    const injectedPath = 'src/score.js\nthrow new Error("injected")//.js';
    const invalidModules: readonly JavaScriptInstrumentedModule[] = [
      {
        file: injectedPath,
        instrumentedCode: 'export const score = 1;',
        dependencies: [],
      },
      {
        ...modules[1]!,
        dependencies: [
          {
            specifier: './score.js',
            resolvedFile: injectedPath,
            start: 22,
            end: 34,
          },
        ],
      },
    ];

    expect(() =>
      prepareModuleGraph({
        entryFile: 'src/main.js',
        graphSha256: 'a'.repeat(64),
        modules: invalidModules,
        guardIdentifier: '__tsumuBudget',
        runtimeKey: '__tsumuRuntime_1234',
      }),
    ).toThrow(/Module path/u);
  });

  it('specifierとresolvedFileが一致しないWorker応答を拒否する', () => {
    const invalidModules: readonly JavaScriptInstrumentedModule[] = [
      modules[0]!,
      { file: 'src/other.js', instrumentedCode: 'export const score = 2;', dependencies: [] },
      {
        ...modules[1]!,
        dependencies: [
          { specifier: './score.js', resolvedFile: 'src/other.js', start: 22, end: 34 },
        ],
      },
    ];

    expect(() =>
      prepareModuleGraph({
        entryFile: 'src/main.js',
        graphSha256: 'a'.repeat(64),
        modules: invalidModules,
        guardIdentifier: '__tsumuBudget',
        runtimeKey: '__tsumuRuntime_1234',
      }),
    ).toThrow(/解決結果/u);
  });
});
