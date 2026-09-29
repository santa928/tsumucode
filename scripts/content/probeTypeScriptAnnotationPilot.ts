/** 注釈教材の少数fixtureで「型検査が通る」と「型を学べた」の差を測る。製品採点には使わない。 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import ts from 'typescript';
import { z } from 'zod';
import { compileTypeScript } from '../../src/adapters/runtime/typescript/compileTypeScript';

const fixtureSchema = z.array(
  z
    .object({
      id: z.string(),
      source: z.string(),
      compileStatus: z.enum(['ready', 'type-error']),
      numberAnnotation: z.boolean(),
      anyType: z.boolean(),
      assertion: z.boolean(),
      suppression: z.boolean(),
    })
    .strict(),
);
const fixtures = fixtureSchema.parse(
  JSON.parse(readFileSync('tests/fixtures/typescript-annotation-pilot.json', 'utf8')),
);
const require = createRequire(import.meta.url);
const libraryDirectory = path.dirname(require.resolve('typescript'));
const libraries = Object.fromEntries(
  readdirSync(libraryDirectory)
    .filter((name) => /^lib\..*\.d\.ts$/u.test(name))
    .map((name) => [name, readFileSync(path.join(libraryDirectory, name), 'utf8')]),
);

/** この試作の単一file・トップレベルscoreだけを観察する。任意教材の判定関数ではない。 */
function inspectSource(source: string) {
  const file = ts.createSourceFile('main.ts', source, ts.ScriptTarget.ES2023, true);
  let numberAnnotation = false;
  let anyType = false;
  let assertion = false;
  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === 'score') {
        numberAnnotation = declaration.type?.kind === ts.SyntaxKind.NumberKeyword;
      }
    }
  }
  /** 学習者sourceの構文だけを走査し、生成JSや文字列リテラル内の偽装を数えない。 */
  function visit(node: ts.Node): void {
    anyType ||= node.kind === ts.SyntaxKind.AnyKeyword;
    assertion ||=
      ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isNonNullExpression(node);
    ts.forEachChild(node, visit);
  }
  visit(file);
  // 試作fixtureは単一行の抑制だけ。実契約にはcompilerのdirective範囲との一致検証が必要。
  const scanner = ts.createScanner(
    ts.ScriptTarget.ES2023,
    false,
    ts.LanguageVariant.Standard,
    source,
  );
  let suppression = false;
  for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) {
    if (
      kind === ts.SyntaxKind.SingleLineCommentTrivia ||
      kind === ts.SyntaxKind.MultiLineCommentTrivia
    ) {
      suppression ||= /@ts-(?:ignore|expect-error|nocheck)\b/u.test(scanner.getTokenText());
    }
  }
  return { numberAnnotation, anyType, assertion, suppression };
}

const generated = new Map<string, string>();
for (const fixture of fixtures) {
  const compiled = compileTypeScript({ 'main.ts': fixture.source }, libraries);
  const facts = inspectSource(fixture.source);
  assert.equal(compiled.status, fixture.compileStatus, fixture.id);
  const { id, numberAnnotation, anyType, assertion, suppression } = fixture;
  const expectedFacts = { numberAnnotation, anyType, assertion, suppression };
  assert.deepEqual(facts, expectedFacts, id);
  if (compiled.status === 'ready') generated.set(id, compiled.files['main.js']!);
  else
    assert.ok(
      compiled.diagnostics.some(
        ({ code, file, line }) => code === 2322 && file === 'main.ts' && line === 1,
      ),
    );
  console.log(JSON.stringify({ id, compileStatus: compiled.status, ...facts }));
}
assert.equal(generated.get('solution'), generated.get('inference-only'));
assert.equal(generated.get('solution'), generated.get('any-escape'));
console.log(
  '9 fixtures一致。注釈削除/any化は同じJSになる。製品の型習得判定・コード実行は未実装/未実施。',
);
