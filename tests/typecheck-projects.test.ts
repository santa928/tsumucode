/** 型検査をprocess分離しても、root projectの参照先を漏らさない。 */
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { expect, it } from 'vitest';
import { ESLint } from 'eslint';

it('型付きLintは各対象のleaf設定とenum比較ルールを維持する', async () => {
  const lint = new ESLint();
  const settings = z.object({
    languageOptions: z.object({ parserOptions: z.object({ project: z.array(z.string()) }) }),
    rules: z.record(z.string(), z.unknown()),
  });
  const app = settings.parse(
    await lint.calculateConfigForFile('src/features/library/LibraryIndexPage.tsx'),
  );
  const tools = settings.parse(await lint.calculateConfigForFile('scripts/checkBeforePush.ts'));
  expect(app.languageOptions.parserOptions.project).toEqual(['./tsconfig.app.json']);
  expect(tools.languageOptions.parserOptions.project).toEqual(['./tsconfig.node.json']);
  for (const config of [app, tools]) {
    expect(
      z.array(z.unknown()).parse(config.rules['@typescript-eslint/no-unsafe-enum-comparison'])[0],
    ).toBe(2);
  }
});

it('全参照projectを既存設定のまま型検査する', () => {
  const root = z
    .object({ references: z.array(z.object({ path: z.string() })) })
    .parse(JSON.parse(readFileSync('tsconfig.json', 'utf8')));
  const manifest = z
    .object({ scripts: z.record(z.string(), z.string()) })
    .parse(JSON.parse(readFileSync('package.json', 'utf8')));
  const commands = manifest.scripts['typecheck']!.split(' && ');
  const projects = commands.map((command) => {
    const match = /^tsc -b (tsconfig\.[a-z]+\.json)$/u.exec(command);
    expect(match, '型検査の設定/実行方法を変更した場合は全projectの被覆を確認する').not.toBeNull();
    return match![1]!;
  });
  expect(projects.sort()).toEqual(
    root.references.map(({ path }) => path.replace(/^\.\//u, '')).sort(),
  );
  expect(manifest.scripts['build:app']).toMatch(/^npm run typecheck && /u);
});
