import ts from 'typescript';
import type { TypeScriptDiagnostic } from '../typescript/compileTypeScript';
import { PROPS_CARD_SOURCE } from './propsCardScaffold';

const TAG_ATTRIBUTES: Readonly<Record<string, readonly string[]>> = {
  section: ['aria-labelledby'],
  h1: ['id'],
  ol: [],
  li: ['key'],
  p: [],
  QuestionCard: ['question'],
};

const MAIN_SCAFFOLD = ts.createSourceFile(
  'main.tsx',
  `
import { createRoot } from 'react-dom/client';
import { QuestionCard, type Question } from './QuestionCard';
const question: Question = {};
const container = document.getElementById('root');
if (container === null) throw new Error('表示先がありません');
createRoot(container).render(<QuestionCard question={question} />);
`,
  ts.ScriptTarget.ES2023,
  true,
  ts.ScriptKind.TSX,
);

/** 値を書き換える1課題なので、型付きデータ以外の起動足場はAST構造で固定する。 */
function scaffoldSignature(node: ts.Node, editableQuestion = true): unknown {
  if (ts.isParenthesizedExpression(node))
    return scaffoldSignature(node.expression, editableQuestion);
  const children: unknown[] = [];
  ts.forEachChild(node, (child) => {
    if (
      editableQuestion &&
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'question' &&
      child === node.initializer
    )
      return;
    if (ts.isJsxText(child) && !child.text.trim()) return;
    children.push(scaffoldSignature(child, editableQuestion));
  });
  return [
    node.kind,
    ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)
      ? node.text
      : ts.isJsxText(node)
        ? node.text.trim().replace(/\s+/gu, ' ')
        : null,
    ts.isVariableDeclarationList(node) ? node.flags : null,
    children,
  ];
}

/** 型検査を迂回するfactoryや後書きmutationを、Propsの値として通さない。 */
function isQuestionData(node: ts.Expression | undefined): boolean {
  if (!node || !ts.isObjectLiteralExpression(node)) return false;
  const names = new Set<string>();
  return node.properties.every((property) => {
    if (!property.name || !ts.isIdentifier(property.name)) return false;
    const name = property.name.text;
    if (names.has(name) || !['prompt', 'choices', 'correctIndex'].includes(name)) return false;
    names.add(name);
    if (ts.isPropertyAssignment(property)) {
      const value = property.initializer;
      return name === 'choices'
        ? ts.isArrayLiteralExpression(value) && value.elements.every(ts.isStringLiteral)
        : ts.isStringLiteral(value) || ts.isNumericLiteral(value);
    }
    // 描画例外の修復を試せるよう、値を返さず明示的にthrowするgetterだけを認める。
    if (
      name !== 'prompt' ||
      !ts.isGetAccessorDeclaration(property) ||
      property.body?.statements.length !== 1
    )
      return false;
    const statement = property.body.statements[0];
    return (
      !!statement &&
      ts.isThrowStatement(statement) &&
      ts.isNewExpression(statement.expression) &&
      ts.isIdentifier(statement.expression.expression) &&
      statement.expression.expression.text === 'Error' &&
      statement.expression.arguments?.length === 1 &&
      ts.isStringLiteral(statement.expression.arguments[0]!)
    );
  });
}

/** Props導入の静的JSXだけを認める。trusted Reactへ危険なDOM能力を渡さない。 */
export function checkPropsSource(
  files: Readonly<Record<string, string>>,
): readonly TypeScriptDiagnostic[] {
  const diagnostics: TypeScriptDiagnostic[] = [];
  for (const [file, text] of Object.entries(files)) {
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.ES2023, true, ts.ScriptKind.TSX);
    const reject = (node: ts.Node, message: string): void => {
      const position = source.getLineAndCharacterOfPosition(node.getStart(source));
      diagnostics.push({
        code: 0,
        file,
        line: position.line + 1,
        column: position.character + 1,
        message,
      });
    };
    if (!['main.tsx', 'QuestionCard.tsx'].includes(file)) {
      diagnostics.push({
        code: 0,
        file,
        message: 'このProps課題はmain.tsxとQuestionCard.tsxだけです。',
      });
      continue;
    }
    if (/@ts-(?:ignore|expect-error|nocheck)\b/u.test(text))
      diagnostics.push({
        code: 0,
        file,
        message: '型検査を無効にせず、Propsの値を直してください。',
      });
    const expressionText = (node: ts.Node): string => node.getText(source).replace(/\s+/gu, '');
    if (file === 'main.tsx') {
      const declaration = source.statements
        .filter(ts.isVariableStatement)
        .flatMap((item) => [...item.declarationList.declarations])
        .find((item) => ts.isIdentifier(item.name) && item.name.text === 'question');
      if (
        JSON.stringify(scaffoldSignature(source)) !==
          JSON.stringify(scaffoldSignature(MAIN_SCAFFOLD)) ||
        !isQuestionData(declaration?.initializer)
      )
        diagnostics.push({
          code: 0,
          file,
          message:
            'この導入では用意済みの起動処理を残し、Questionの文字列・配列・数値の値を編集します。',
        });
    }
    if (file === 'QuestionCard.tsx') {
      const expected = ts.createSourceFile(
        file,
        PROPS_CARD_SOURCE,
        ts.ScriptTarget.ES2023,
        true,
        ts.ScriptKind.TSX,
      );
      if (
        JSON.stringify(scaffoldSignature(source, false)) !==
        JSON.stringify(scaffoldSignature(expected, false))
      )
        diagnostics.push({
          code: 0,
          file,
          message:
            '読み取り専用のQuestionCardを元に戻してください。型と表示処理を差し替えず、main.tsxの問題文を直します。',
        });
    }
    const visit = (node: ts.Node): void => {
      if (
        node.kind === ts.SyntaxKind.AnyKeyword ||
        ts.isAsExpression(node) ||
        ts.isTypeAssertionExpression(node) ||
        ts.isNonNullExpression(node)
      )
        reject(node, 'この課題ではany・型assertionを使わず、型に合うPropsを渡します。');
      if (ts.isImportDeclaration(node)) {
        const name = ts.isStringLiteral(node.moduleSpecifier) ? node.moduleSpecifier.text : '';
        const clause = node.importClause;
        const bindings = clause?.namedBindings;
        const imports = bindings && ts.isNamedImports(bindings) ? bindings.elements : undefined;
        const accepted =
          file === 'QuestionCard.tsx'
            ? name === 'react' &&
              clause?.phaseModifier === ts.SyntaxKind.TypeKeyword &&
              imports?.length === 1 &&
              imports[0]?.name.text === 'ReactElement'
            : (name === 'react-dom/client' &&
                imports?.length === 1 &&
                imports[0]?.name.text === 'createRoot' &&
                !imports[0].propertyName) ||
              (['./QuestionCard', './QuestionCard.tsx', './QuestionCard.js'].includes(name) &&
                imports?.every(
                  (item) =>
                    ['QuestionCard', 'Question'].includes(item.name.text) && !item.propertyName,
                ));
        if (!accepted || clause?.name)
          reject(node, 'この課題のimportは固定QuestionCardとcreateRoot、型ReactElementだけです。');
      }
      if (ts.isExportDeclaration(node) && node.moduleSpecifier)
        reject(node, '別moduleの再exportはこの課題で使えません。');
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tag = ts.isIdentifier(node.tagName) ? node.tagName.text : '';
        const attributes = Object.hasOwn(TAG_ATTRIBUTES, tag) ? TAG_ATTRIBUTES[tag] : undefined;
        if (!attributes)
          reject(node, 'この課題はQuestionCard・section・h1・ol・li・pの静的表示だけです。');
        for (const attribute of node.attributes.properties) {
          if (
            !ts.isJsxAttribute(attribute) ||
            !attributes?.includes(attribute.name.getText(source))
          ) {
            reject(
              attribute,
              '許可されていない属性です。spread・ref・HTML挿入・URL・イベント属性は使えません。',
            );
            continue;
          }
          if (
            ['id', 'aria-labelledby'].includes(attribute.name.getText(source)) &&
            (!attribute.initializer || !ts.isStringLiteral(attribute.initializer))
          )
            reject(attribute, '見出しのidとaria-labelledbyは固定文字列にします。');
        }
      }
      if (ts.isJsxFragment(node)) reject(node, 'この課題ではsectionで問題カードをまとめます。');
      if (ts.isJsxExpression(node) && node.expression) {
        const expression = node.expression;
        const accepted =
          ['question.prompt', 'question.choices.length', 'choice', 'question'].includes(
            expressionText(expression),
          ) ||
          (ts.isCallExpression(expression) &&
            expressionText(expression.expression) === 'question.choices.map' &&
            expression.arguments.length === 1 &&
            ts.isArrowFunction(expression.arguments[0]!) &&
            expression.arguments[0].parameters.length === 1 &&
            expressionText(expression.arguments[0].parameters[0]!.name) === 'choice' &&
            ts.isJsxElement(stripParentheses(expression.arguments[0].body)));
        if (!accepted)
          reject(node, 'この静的カードのJSXには問題文・選択肢・個数の値だけを渡します。');
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return diagnostics.slice(0, 50);
}

/** 整形で付く括弧だけを外し、式の意味を変えずにJSXを照合する。 */
function stripParentheses(node: ts.Node): ts.Node {
  return ts.isParenthesizedExpression(node) ? stripParentheses(node.expression) : node;
}
