/** 固定したReact作者原稿の型検査とbuildを分け、成功したものだけ実Browser用へ出力する。 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import ts from 'typescript';
import { build } from 'vite';
import { z } from 'zod';

const diagnosticSchema = z
  .object({
    file: z.literal('main.tsx'),
    line: z.number().int().positive(),
    column: z.number().int().positive(),
    code: z.number().int().positive(),
  })
  .strict();
const fixtureSchema = z
  .object({
    id: z.enum(['starter', 'solution', 'wrong-prop', 'missing-prop']),
    source: z.string().max(32_768),
    expectedPrompt: z.string().optional(),
    expectedChoices: z.array(z.string()).optional(),
    diagnostics: z.array(diagnosticSchema),
  })
  .strict();
const pilotSchema = z
  .object({ component: z.string().max(32_768), fixtures: z.array(fixtureSchema).length(4) })
  .strict();
type Fixture = z.infer<typeof fixtureSchema>;

interface Observation {
  readonly id: Fixture['id'];
  readonly classification: 'ready' | 'type-error';
  readonly diagnostics: readonly z.infer<typeof diagnosticSchema>[];
  readonly sourceDirectory: string;
  readonly built: boolean;
  readonly expectedPrompt?: string;
  readonly expectedChoices?: readonly string[];
  readonly manifestSha256?: string;
}

const indexHtml = `<!doctype html>
<html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Reactの問題カード・作者用試作</title>
<style>body{margin:0;font:1rem/1.7 system-ui,sans-serif;color:#19352d;background:#fffaf0}main{max-width:42rem;margin:auto;padding:2rem}section{padding:1.5rem;border:1px solid #b8c6bb;border-radius:1rem;background:#fff}h1{font-size:1.5rem}li{padding:.5rem}p{overflow-wrap:anywhere}</style>
</head><body><main><p>作者用・表示だけの試作です。回答操作はまだありません。</p><div id="root"></div></main><script type="module" src="/main.tsx"></script></body></html>`;

/** 実Compilerの全Errorを位置付きで収集し、未知のFile・場所なし診断も成功へ混ぜない。 */
function checkProject(directory: string): readonly z.infer<typeof diagnosticSchema>[] {
  const program = ts.createProgram({
    rootNames: [path.join(directory, 'main.tsx'), path.join(directory, 'QuestionCard.tsx')],
    options: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.ReactJSX,
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      types: ['react', 'react-dom'],
      typeRoots: [path.resolve('node_modules/@types')],
      lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
    },
  });
  return ts.getPreEmitDiagnostics(program).map((diagnostic) => {
    assert.equal(diagnostic.category, ts.DiagnosticCategory.Error);
    assert.ok(
      diagnostic.file !== undefined && diagnostic.start !== undefined,
      '位置のないCompiler診断',
    );
    assert.equal(
      path.dirname(diagnostic.file.fileName),
      directory,
      ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    );
    const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
    return diagnosticSchema.parse({
      file: path.basename(diagnostic.file.fileName),
      line: position.line + 1,
      column: position.character + 1,
      code: diagnostic.code,
    });
  });
}

/** 新規専用tmpに固定sourceと依存への参照だけを用意し、既存Projectへ書き込まない。 */
async function prepareProject(root: string, component: string, fixture: Fixture): Promise<string> {
  const directory = path.join(root, fixture.id);
  await mkdir(directory);
  await symlink(path.resolve('node_modules'), path.join(directory, 'node_modules'), 'dir');
  await writeFile(path.join(directory, 'QuestionCard.tsx'), component);
  await writeFile(path.join(directory, 'main.tsx'), fixture.source);
  await writeFile(path.join(directory, 'index.html'), indexHtml);
  await writeFile(
    path.join(directory, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          jsx: 'react-jsx',
          strict: true,
          noEmit: true,
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'Bundler',
        },
      },
      null,
      2,
    ),
  );
  await writeFile(
    path.join(directory, 'package.json'),
    JSON.stringify(
      { name: `tsumucode-author-${fixture.id}`, private: true, type: 'module' },
      null,
      2,
    ),
  );
  return directory;
}

/** 型検査が予想どおり成功した原稿だけ、実Reactを含むVite bundleへ変換する。 */
async function observeFixture(
  root: string,
  component: string,
  fixture: Fixture,
): Promise<Observation> {
  const directory = await prepareProject(root, component, fixture);
  const diagnostics = checkProject(directory);
  assert.deepEqual(diagnostics, fixture.diagnostics, fixture.id);
  if (diagnostics.length > 0) {
    assert.equal(
      (await readdir(directory)).some((name) => name === 'dist' || name.endsWith('.js')),
      false,
    );
    return {
      id: fixture.id,
      classification: 'type-error',
      diagnostics,
      sourceDirectory: directory,
      built: false,
    };
  }
  assert.ok(fixture.expectedPrompt !== undefined && fixture.expectedChoices !== undefined);
  await build({
    configFile: false,
    root: directory,
    base: './',
    plugins: [react()],
    logLevel: 'warn',
    build: { outDir: 'dist', emptyOutDir: false, manifest: true },
  });
  const manifest = await readFile(path.join(directory, 'dist/.vite/manifest.json'));
  return {
    id: fixture.id,
    classification: 'ready',
    diagnostics,
    sourceDirectory: directory,
    built: true,
    expectedPrompt: fixture.expectedPrompt,
    expectedChoices: fixture.expectedChoices,
    manifestSha256: createHash('sha256').update(manifest).digest('hex'),
  };
}

/** 実インストールのversionがrootの固定依存と一致するか確認する。 */
async function toolchainVersions(): Promise<Readonly<Record<string, string>>> {
  const packageSchema = z.object({
    dependencies: z.record(z.string(), z.string()),
    devDependencies: z.record(z.string(), z.string()),
  });
  const rootPackage = packageSchema.parse(JSON.parse(await readFile('package.json', 'utf8')));
  const versions: Record<string, string> = { node: process.versions.node };
  for (const name of [
    'react',
    'react-dom',
    'typescript',
    'vite',
    '@vitejs/plugin-react',
    '@types/react',
    '@types/react-dom',
  ]) {
    const installed = z
      .object({ version: z.string() })
      .parse(
        JSON.parse(await readFile(path.resolve('node_modules', name, 'package.json'), 'utf8')),
      );
    assert.equal(
      installed.version,
      rootPackage.dependencies[name] ?? rootPackage.devDependencies[name],
      name,
    );
    versions[name] = installed.version;
  }
  return versions;
}

/** 作者の固定4原稿を検査し、Browser確認用の専用artifactと実測reportを残す。 */
async function main(): Promise<void> {
  const pilot = pilotSchema.parse(
    JSON.parse(
      await readFile('scripts/content/fixtures/react-component-author-pilot.json', 'utf8'),
    ),
  );
  assert.equal(new Set(pilot.fixtures.map(({ id }) => id)).size, 4);
  const outputDirectory = path.resolve(process.argv[2] ?? '/tmp/tsumucode-react-component-pilot');
  await mkdir(outputDirectory, { recursive: true });
  const sourceRoot = await mkdtemp(path.join(outputDirectory, 'source-'));
  const versions = await toolchainVersions();
  const observations: Observation[] = [];
  for (const fixture of pilot.fixtures)
    observations.push(await observeFixture(sourceRoot, pilot.component, fixture));
  const report = { scope: 'trusted-author-fixtures-only', sourceRoot, versions, observations };
  await writeFile(path.join(outputDirectory, 'report.json'), JSON.stringify(report, null, 2));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

await main();
