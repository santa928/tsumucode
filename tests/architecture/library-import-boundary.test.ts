// @vitest-environment node
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const workspaceRoot = process.cwd();
const roots = [
  'src/features/library/LibraryShell.tsx',
  'src/features/library/LibraryIndexPage.tsx',
  'src/features/library/LibrarySlidePage.tsx',
  'src/app/libraryContentLoaders.ts',
] as const;
const forbidden = [
  /src\/features\/learning\/runtimeServices\.tsx?$/u,
  /src\/features\/progress\//u,
  /src\/core\/persistence\//u,
  /src\/adapters\/persistence\//u,
  /src\/features\/learning\/editor\//u,
  /src\/adapters\/runtime\//u,
  /src\/core\/validation\//u,
] as const;
const sourceExtensions = ['.ts', '.tsx', '.js', '.jsx'] as const;

interface ImportClosure {
  readonly parentByFile: ReadonlyMap<string, string | undefined>;
}

/** Workspace相対PathをOSに依存しないslash表記へ揃える。 */
function normalizeWorkspacePath(filePath: string): string {
  return path.relative(workspaceRoot, filePath).split(path.sep).join('/');
}

/** 相対Importと@/ aliasだけをWorkspace内の候補Pathへ変換する。 */
function workspaceImportBase(importer: string, specifier: string): string | undefined {
  if (specifier.startsWith('@/')) {
    return path.join(workspaceRoot, 'src', specifier.slice(2));
  }
  if (specifier.startsWith('.')) {
    return path.resolve(path.dirname(path.join(workspaceRoot, importer)), specifier);
  }
  return undefined;
}

/** 拡張子省略とindex moduleを含め、存在するWorkspace Sourceを一意に解決する。 */
async function resolveWorkspaceImport(
  importer: string,
  specifier: string,
  overrides: ReadonlyMap<string, string>,
): Promise<string | undefined> {
  const base = workspaceImportBase(importer, specifier);
  if (base === undefined) return undefined;
  const candidates = path.extname(base)
    ? [base]
    : [
        ...sourceExtensions.map((extension) => `${base}${extension}`),
        ...sourceExtensions.map((extension) => path.join(base, `index${extension}`)),
      ];

  for (const candidate of candidates) {
    const relative = normalizeWorkspacePath(candidate);
    if (overrides.has(relative)) return relative;
    try {
      await access(candidate);
      return relative;
    } catch {
      // 次の拡張子候補を確認する。
    }
  }
  throw new Error(`Workspace Importを解決できません: ${importer} -> ${specifier}`);
}

/** TypeScriptのpre-process結果を再帰し、rootごとの静的Import closureを作る。 */
async function collectImportClosure(
  entryPoints: readonly string[],
  overrides: ReadonlyMap<string, string> = new Map(),
): Promise<ImportClosure> {
  const parentByFile = new Map<string, string | undefined>();

  /** 1 Sourceを一度だけ走査し、Workspace内Importを深さ優先で追跡する。 */
  async function visit(file: string, parent: string | undefined): Promise<void> {
    if (parentByFile.has(file)) return;
    parentByFile.set(file, parent);
    const source = overrides.get(file) ?? (await readFile(path.join(workspaceRoot, file), 'utf8'));
    const imports = ts.preProcessFile(source, true, true).importedFiles;
    for (const imported of imports) {
      const resolved = await resolveWorkspaceImport(file, imported.fileName, overrides);
      if (resolved !== undefined) await visit(resolved, file);
    }
  }

  for (const entryPoint of entryPoints) await visit(entryPoint, undefined);
  return { parentByFile };
}

/** 禁止Fileまでのroot起点Chainを、人が修正箇所を追える文字列へ変換する。 */
function forbiddenImportChains(closure: ImportClosure): readonly string[] {
  /** 祖先ですでに禁止境界を越えていれば、同じ原因の子孫報告を省く。 */
  function hasForbiddenAncestor(file: string): boolean {
    let parent = closure.parentByFile.get(file);
    while (parent !== undefined) {
      const currentParent = parent;
      if (forbidden.some((pattern) => pattern.test(currentParent))) return true;
      parent = closure.parentByFile.get(currentParent);
    }
    return false;
  }

  return [...closure.parentByFile.keys()]
    .filter(
      (file) => forbidden.some((pattern) => pattern.test(file)) && !hasForbiddenAncestor(file),
    )
    .map((file) => {
      const chain = [file];
      let parent = closure.parentByFile.get(file);
      while (parent !== undefined) {
        chain.unshift(parent);
        parent = closure.parentByFile.get(parent);
      }
      return chain.join(' → ');
    })
    .sort();
}

describe('Library source import boundary', () => {
  it('Syntheticな間接runtime importをrootから禁止FileまでのChain付きで検出する', async () => {
    const closure = await collectImportClosure(
      ['src/features/library/LibrarySlidePage.tsx'],
      new Map([
        ['src/features/library/LibrarySlidePage.tsx', "import './syntheticRuntimeBridge';"],
        ['src/features/library/syntheticRuntimeBridge.ts', "import '../learning/runtimeServices';"],
      ]),
    );

    expect(forbiddenImportChains(closure)).toEqual([
      'src/features/library/LibrarySlidePage.tsx → ' +
        'src/features/library/syntheticRuntimeBridge.ts → ' +
        'src/features/learning/runtimeServices.ts',
    ]);
  });

  it('実Library rootの静的Closureへ進捗・永続化・Editor・Runner・Validatorを含めない', async () => {
    const closure = await collectImportClosure(roots);

    expect(closure.parentByFile.size).toBeGreaterThan(roots.length);
    expect(forbiddenImportChains(closure)).toEqual([]);
  });
});
