// @vitest-environment node
/** 学習Routeの静的import境界を、hash非依存のVite manifest graphとして検証する。 */
import { describe, expect, it } from 'vitest';
import { assertLearningChunkIsolation } from './check-learning-chunks';

const mobileEntry = 'index.html';
const editableEntry = 'src/features/learning/pages/EditableExercisePage.tsx';
const workspaceEntry = 'src/features/learning/editor/CodeWorkspace.tsx';
const runnerEntry = 'src/adapters/runtime/html-css/index.ts';

/** 実Buildと同じ遅延境界を持つ最小manifestを返す。 */
function validManifest(): Readonly<Record<string, unknown>> {
  return {
    [mobileEntry]: {
      file: 'assets/index-hash.js',
      isEntry: true,
      imports: ['_jsx.js'],
      dynamicImports: [editableEntry, runnerEntry],
    },
    '_jsx.js': { file: 'assets/jsx-hash.js' },
    '_components.js': { file: 'assets/components-hash.js', imports: ['_jsx.js', mobileEntry] },
    '_codemirror.js': { file: 'assets/codemirror-hash.js' },
    [editableEntry]: {
      file: 'assets/EditableExercisePage-hash.js',
      imports: ['_jsx.js', mobileEntry, '_components.js', '_codemirror.js'],
      dynamicImports: [workspaceEntry],
    },
    [workspaceEntry]: { file: 'assets/CodeWorkspace-hash.js', imports: ['_jsx.js'] },
    [runnerEntry]: {
      file: 'assets/html-css-hash.js',
      imports: [mobileEntry, '_codemirror.js'],
    },
  };
}

/** CodeMirror候補だけにproduction markerを含めるAsset readerを返す。 */
function readAsset(file: string): Promise<string> {
  return Promise.resolve(
    file === 'assets/codemirror-hash.js' ? 'class EditorView {}' : 'export const value = true;',
  );
}

describe('learning chunk isolation', () => {
  it('mobile静的graphからEditorとRunnerを分離し、共有CodeMirror chunkを受理する', async () => {
    await expect(
      assertLearningChunkIsolation({ manifest: validManifest(), readAsset }),
    ).resolves.toBeUndefined();
  });

  it('mobile Entryの静的importへEditable bundleが混入したBuildを拒否する', async () => {
    const manifest = validManifest();
    const entry = manifest[mobileEntry] as {
      readonly file: string;
      readonly imports: readonly string[];
    };

    await expect(
      assertLearningChunkIsolation({
        manifest: {
          ...manifest,
          [mobileEntry]: {
            ...entry,
            imports: [...entry.imports, editableEntry],
          },
        },
        readAsset,
      }),
    ).rejects.toThrow('mobile静的graphへ編集専用chunkが混入しています');
  });

  it('EditorとRunnerが共有する非mobile CodeMirror chunkを検出できないBuildを拒否する', async () => {
    await expect(
      assertLearningChunkIsolation({
        manifest: validManifest(),
        readAsset: () => Promise.resolve('export const value = true;'),
      }),
    ).rejects.toThrow('EditorとRunnerが共有するCodeMirror chunkが見つかりません');
  });

  it('検査対象のmanifest entry欠落をsource path付きで拒否する', async () => {
    const manifest = { ...validManifest() };
    Reflect.deleteProperty(manifest, runnerEntry);

    await expect(assertLearningChunkIsolation({ manifest, readAsset })).rejects.toThrow(
      `Vite manifest entryが見つかりません: ${runnerEntry}`,
    );
  });
});
