// @vitest-environment node
/** 学習Routeの静的import境界を、hash非依存のVite manifest graphとして検証する。 */
import { describe, expect, it } from 'vitest';
import { assertLearningChunkIsolation } from './check-learning-chunks';

const mobileEntry = 'src/app/normalLearningEntry.tsx';
const normalLearningEntry = 'src/app/normalLearningRouteModules.tsx';
const editableEntry = 'src/features/learning/pages/EditableExercisePage.tsx';
const workspaceEntry = 'src/features/learning/editor/CodeWorkspace.tsx';
const runnerEntry = 'src/adapters/runtime/html-css/index.ts';
const readOnlyPreviewEntry =
  'src/adapters/runtime/read-only-html-css/HtmlCssReadOnlyPreviewAdapter.ts';

/** 実Buildと同じ遅延境界を持つ最小manifestを返す。 */
function validManifest(): Readonly<Record<string, unknown>> {
  return {
    [mobileEntry]: {
      file: 'assets/index-hash.js',
      isEntry: true,
      imports: ['_jsx.js', normalLearningEntry],
    },
    '_jsx.js': { file: 'assets/jsx-hash.js' },
    '_components.js': { file: 'assets/components-hash.js', imports: ['_jsx.js', mobileEntry] },
    '_codemirror.js': { file: 'assets/codemirror-hash.js' },
    '_editor-input.js': { file: 'assets/editor-input-hash.js', imports: ['_codemirror.js'] },
    [normalLearningEntry]: {
      file: 'assets/normal-learning-hash.js',
      imports: ['_jsx.js', '_components.js'],
      dynamicImports: [editableEntry, runnerEntry, readOnlyPreviewEntry],
    },
    [editableEntry]: {
      file: 'assets/EditableExercisePage-hash.js',
      imports: ['_jsx.js', mobileEntry, '_components.js', '_codemirror.js'],
      dynamicImports: [workspaceEntry],
    },
    [workspaceEntry]: {
      file: 'assets/CodeWorkspace-hash.js',
      imports: ['_jsx.js', '_editor-input.js'],
    },
    [runnerEntry]: {
      file: 'assets/html-css-hash.js',
      imports: [mobileEntry, '_codemirror.js'],
    },
    [readOnlyPreviewEntry]: {
      file: 'assets/read-only-html-css-hash.js',
      imports: ['_jsx.js', '_components.js'],
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

  it('mobile静的graphへEditor入力支援chunkだけが混入したBuildも拒否する', async () => {
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
            imports: [...entry.imports, '_editor-input.js'],
          },
        },
        readAsset,
      }),
    ).rejects.toThrow('mobile静的graphへCodeMirror実装が混入しています');
  });

  it('Read-only Previewの実行closureへEditor入力支援が混入したBuildも拒否する', async () => {
    const manifest = validManifest();
    const readOnlyPreview = manifest[readOnlyPreviewEntry] as {
      readonly file: string;
      readonly imports: readonly string[];
    };

    await expect(
      assertLearningChunkIsolation({
        manifest: {
          ...manifest,
          [readOnlyPreviewEntry]: {
            ...readOnlyPreview,
            imports: [...readOnlyPreview.imports, '_editor-input.js'],
          },
        },
        readAsset,
      }),
    ).rejects.toThrow('mobile静的graphへCodeMirror実装が混入しています');
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
