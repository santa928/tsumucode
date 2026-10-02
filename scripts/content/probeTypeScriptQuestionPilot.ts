/** 固定Question原稿の型関係を制作者向けに観察する。製品採点・学習者コード実行には使わない。 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import ts from 'typescript';
import { z } from 'zod';
import {
  checkTypeScript,
  compileTypeScript,
} from '../../src/adapters/runtime/typescript/compileTypeScript';

const fixtureSchema = z.array(
  z
    .object({
      id: z.string(),
      source: z.string(),
      compileStatus: z.enum(['ready', 'type-error']),
      diagnosticCode: z.number().optional(),
      interfaceAnnotation: z.boolean(),
      anyType: z.boolean(),
      rejectedRelations: z.array(z.string()).optional(),
    })
    .strict(),
);
const fixtures = fixtureSchema.parse(
  JSON.parse(readFileSync('tests/fixtures/typescript-question-interface-pilot.json', 'utf8')),
);
const require = createRequire(import.meta.url);
const libraryDirectory = path.dirname(require.resolve('typescript'));
const libraries = Object.fromEntries(
  readdirSync(libraryDirectory)
    .filter((name) => /^lib\..*\.d\.ts$/u.test(name))
    .map((name) => [name, readFileSync(path.join(libraryDirectory, name), 'utf8')]),
);

/** 単一fileの固定questionと直接参照されたinterfaceを観察。任意構文の合否は分類しない。 */
function inspectSource(source: string): { interfaceAnnotation: boolean; anyType: boolean } {
  const file = ts.createSourceFile('main.ts', source, ts.ScriptTarget.ES2023, true);
  const question = file.statements
    .filter(ts.isVariableStatement)
    .flatMap(({ declarationList }) => [...declarationList.declarations])
    .find(({ name }) => ts.isIdentifier(name) && name.text === 'question');
  const annotation = question?.type;
  const name =
    annotation && ts.isTypeReferenceNode(annotation) && ts.isIdentifier(annotation.typeName)
      ? annotation.typeName.text
      : undefined;
  const interfaceAnnotation =
    name !== undefined &&
    file.statements.some(
      (statement) => ts.isInterfaceDeclaration(statement) && statement.name.text === name,
    );
  let anyType = false;
  /** anyという文字列でなく元TSの型構文だけを数える。 */
  function visit(node: ts.Node): void {
    anyType ||= node.kind === ts.SyntaxKind.AnyKeyword;
    ts.forEachChild(node, visit);
  }
  visit(file);
  return { interfaceAnnotation, anyType };
}

const relations = [
  {
    id: 'missing-prompt',
    value: '{ choices: ["A"], correctIndex: 0 }',
    code: 2741,
    site: 'variable',
  },
  {
    id: 'missing-choices',
    value: '{ prompt: "問題", correctIndex: 0 }',
    code: 2741,
    site: 'variable',
  },
  {
    id: 'missing-index',
    value: '{ prompt: "問題", choices: ["A"] }',
    code: 2741,
    site: 'variable',
  },
  {
    id: 'wrong-prompt',
    value: '{ prompt: 123, choices: ["A"], correctIndex: 0 }',
    code: 2322,
    site: 'prompt',
  },
  {
    id: 'wrong-choice',
    value: '{ prompt: "問題", choices: [123], correctIndex: 0 }',
    code: 2322,
    site: '123',
  },
  {
    id: 'wrong-index',
    value: '{ prompt: "問題", choices: ["A"], correctIndex: "0" }',
    code: 2322,
    site: 'correctIndex',
  },
] as const;

/** 作者の固定fixtureだけをコピーして非emitの正負検査。コピーをRunner・保存・配信へ渡さない。 */
function inspectRelations(source: string): readonly string[] {
  // 固定questionを持つ制作者fixture専用。任意sourceへのexport付加は製品契約として未承認。
  const files = { 'main.ts': `${source}\nexport { question };\n` };
  const prefix = 'import type { question } from "./main.js";\n\n';
  const positive = checkTypeScript(
    {
      ...files,
      '__tsumucode_probe_positive.ts':
        prefix +
        'const first: typeof question = { prompt: "別の問題", choices: ["A", "B"], correctIndex: 0 };\n' +
        'const second: typeof question = { prompt: "", choices: [], correctIndex: 10 };\n',
    },
    libraries,
  );
  assert.deepEqual(positive, { status: 'valid' }, '形が合う値の受入（範囲検査の保証ではない）');

  const lines = relations.map(
    ({ value }, index) => `const bad${String(index)}: typeof question = ${value};`,
  );
  const negative = checkTypeScript(
    {
      ...files,
      '__tsumucode_probe_negative.ts': prefix + lines.join('\n') + '\n',
    },
    libraries,
  );
  if (negative.status === 'valid') return [];
  assert.equal(negative.status, 'type-error', '負例と環境/構文エラーを混同しない');
  const rejected = new Set<string>();
  for (const diagnostic of negative.diagnostics) {
    const index = (diagnostic.line ?? 0) - 3;
    const relation = relations[index];
    const line = lines[index];
    assert.ok(relation && line, '固定負例以外の診断を拒否する');
    assert.equal(diagnostic.file, '__tsumucode_probe_negative.ts');
    assert.equal(diagnostic.code, relation.code, relation.id);
    const column = relation.site === 'variable' ? 7 : line.indexOf(relation.site) + 1;
    assert.equal(diagnostic.column, column, relation.id);
    assert.ok(!rejected.has(relation.id), '関係ない追加診断を負例成功と数えない');
    rejected.add(relation.id);
  }
  return relations.filter(({ id }) => rejected.has(id)).map(({ id }) => id);
}

const emitted = new Map<string, string>();
for (const fixture of fixtures) {
  const compiled = compileTypeScript({ 'main.ts': fixture.source }, libraries);
  const facts = inspectSource(fixture.source);
  assert.equal(compiled.status, fixture.compileStatus, fixture.id);
  assert.deepEqual(
    facts,
    {
      interfaceAnnotation: fixture.interfaceAnnotation,
      anyType: fixture.anyType,
    },
    fixture.id,
  );
  if (compiled.status === 'ready') {
    assert.equal(fixture.diagnosticCode, undefined);
    emitted.set(fixture.id, compiled.files['main.js']!);
    const rejectedRelations = inspectRelations(fixture.source);
    assert.deepEqual(rejectedRelations, fixture.rejectedRelations, fixture.id);
    console.log(
      JSON.stringify({
        id: fixture.id,
        compileStatus: compiled.status,
        ...facts,
        rejectedRelations,
      }),
    );
  } else {
    assert.equal(compiled.status, 'type-error');
    assert.ok(
      compiled.diagnostics.some(
        ({ code, file }) => code === fixture.diagnosticCode && file === 'main.ts',
      ),
      fixture.id,
    );
    assert.ok(!Object.hasOwn(compiled, 'files'), '型誤りには生成JSがない');
    console.log(
      JSON.stringify({
        id: fixture.id,
        compileStatus: compiled.status,
        ...facts,
        diagnostics: compiled.diagnostics,
      }),
    );
  }
}
for (const id of [
  'renamed-interface',
  'type-alias',
  'inference-only',
  'any-escape',
  'optional-index',
  'wide-index',
])
  assert.equal(
    emitted.get('solution'),
    emitted.get(id),
    `${id}: 同じ生成JSだけでは型の目標を区別できない`,
  );
console.log(
  `Compiler ${ts.version}: ${String(fixtures.length)}固定fixtureの観察一致。型関係probeは非emit。製品採点/実行/教材承認は未実施。`,
);
