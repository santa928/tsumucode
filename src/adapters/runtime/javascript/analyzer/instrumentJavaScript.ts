import { parse, type Node } from 'acorn';
import { fullAncestor } from 'acorn-walk';
import MagicString from 'magic-string';
import type { RunnerDiagnostic, RunnerDiagnosticKind } from '../../../../core/runtime/contracts';
import { JavaScriptAnalysisIssue, assertJavaScriptCapabilityPolicy } from './capabilityPolicy';
import type {
  JavaScriptAnalysisFailure,
  JavaScriptAnalysisRequest,
  JavaScriptAnalysisResult,
  JavaScriptSourceFact,
} from './contracts';

type AstNode = Node & Readonly<Record<string, unknown>>;

const MAX_SOURCE_BYTES = 100 * 1024;
const MAX_AST_NODES = 20_000;
const MAX_AST_DEPTH = 256;
const MAX_STRING_LENGTH = 64 * 1024;
const MAX_ARRAY_ELEMENTS = 10_000;
const MAX_FACTS = 256;
const LOOP_TYPES = new Set([
  'WhileStatement',
  'DoWhileStatement',
  'ForStatement',
  'ForInStatement',
  'ForOfStatement',
]);
const FUNCTION_TYPES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
]);

/** Acorn Nodeを追加propertyへ安全にアクセスできるRecordとして扱う。 */
function ast(node: Node): AstNode {
  return node as AstNode;
}

/** unknown値がAcorn Nodeかを最小propertyで確認する。 */
function isNode(value: unknown): value is Node {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Readonly<Record<string, unknown>>;
  return (
    typeof candidate.type === 'string' &&
    typeof candidate.start === 'number' &&
    typeof candidate.end === 'number'
  );
}

/** Analyzer failureをRunnerDiagnostic 1件へ正規化する。 */
function failure(
  request: JavaScriptAnalysisRequest,
  kind: Extract<RunnerDiagnosticKind, 'syntax' | 'security' | 'system'>,
  message: string,
  learnerMessage: string,
  line?: number,
  column?: number,
): JavaScriptAnalysisFailure {
  const diagnostic: RunnerDiagnostic = {
    code: `javascript-analyzer-${kind}`,
    kind,
    severity: 'error',
    message,
    learnerMessage,
    file: request.file,
    ...(line === undefined ? {} : { line }),
    ...(column === undefined ? {} : { column }),
  };
  return {
    status: 'failure',
    requestId: request.requestId,
    exerciseSessionId: request.exerciseSessionId,
    executionRevision: request.executionRevision,
    file: request.file,
    diagnostics: [diagnostic],
  };
}

/** Acorn syntax errorから1-based位置を抽出する。 */
function syntaxPosition(error: unknown): { readonly line?: number; readonly column?: number } {
  if (typeof error !== 'object' || error === null) return {};
  const location = (error as Readonly<Record<string, unknown>>).loc;
  if (typeof location !== 'object' || location === null) return {};
  const position = location as Readonly<Record<string, unknown>>;
  return {
    ...(typeof position.line === 'number' ? { line: position.line } : {}),
    ...(typeof position.column === 'number' ? { column: position.column + 1 } : {}),
  };
}

/** AST全体を一度走査し、budget超過前にbounded node配列へ固定する。 */
function collectBoundedNodes(program: Node, file: string): readonly Node[] {
  const nodes: Node[] = [];
  fullAncestor(program, (node: Node, _state: unknown, ancestors: Node[]) => {
    nodes.push(node);
    const current = ast(node);
    if (nodes.length > MAX_AST_NODES) {
      throw new JavaScriptAnalysisIssue('system', 'AST node数が上限を超えました', file);
    }
    if (ancestors.length > MAX_AST_DEPTH + 1) {
      throw new JavaScriptAnalysisIssue('system', 'ASTの入れ子が深すぎます', file);
    }
    if (
      node.type === 'Literal' &&
      typeof current.value === 'string' &&
      new TextEncoder().encode(current.value).byteLength > MAX_STRING_LENGTH
    ) {
      throw new JavaScriptAnalysisIssue('system', '文字列が長すぎます', file);
    }
    if (node.type === 'TemplateElement') {
      const value = current.value;
      if (typeof value === 'object' && value !== null) {
        const raw = (value as Readonly<Record<string, unknown>>).raw;
        if (
          typeof raw === 'string' &&
          new TextEncoder().encode(raw).byteLength > MAX_STRING_LENGTH
        ) {
          throw new JavaScriptAnalysisIssue('system', 'Template文字列が長すぎます', file);
        }
      }
    }
    if (
      node.type === 'ArrayExpression' &&
      Array.isArray(current.elements) &&
      current.elements.length > MAX_ARRAY_ELEMENTS
    ) {
      throw new JavaScriptAnalysisIssue('system', '配列要素数が上限を超えました', file);
    }
  });
  return nodes;
}

/** Nodeのdirective文字列を返す。 */
function directive(node: Node): string | undefined {
  const value = ast(node).directive;
  return typeof value === 'string' ? value : undefined;
}

/** Block functionのdirective prologue直後へguard開始位置を決める。 */
function functionGuardPosition(body: AstNode): number {
  const statements = Array.isArray(body.body) ? body.body.filter(isNode) : [];
  let position = body.start + 1;
  for (const statement of statements) {
    if (directive(statement) === undefined) break;
    position = statement.end;
  }
  return position;
}

/** LoopとFunctionへ例外非依存のbudget guardを挿入する。 */
function instrument(source: string, nodes: readonly Node[], guardIdentifier: string): string {
  const magic = new MagicString(source);
  for (const node of nodes) {
    const current = ast(node);
    if (FUNCTION_TYPES.has(node.type) && isNode(current.body)) {
      const body = ast(current.body);
      if (body.type === 'BlockStatement') {
        magic.appendLeft(
          functionGuardPosition(body),
          `if (!${guardIdentifier}.enterFunction()) return;try{`,
        );
        magic.prependLeft(body.end - 1, `}finally{${guardIdentifier}.leaveFunction();}`);
      } else if (node.type === 'ArrowFunctionExpression') {
        magic.prependLeft(
          body.start,
          `{if (!${guardIdentifier}.enterFunction()) return;try{return (`,
        );
        magic.appendRight(body.end, `);}finally{${guardIdentifier}.leaveFunction();}}`);
      }
    }
    if (LOOP_TYPES.has(node.type) && isNode(current.body)) {
      const body = ast(current.body);
      if (body.type === 'BlockStatement') {
        magic.appendLeft(body.start + 1, `if (!${guardIdentifier}.checkLoop()) break;`);
      } else {
        magic.prependLeft(body.start, `{if (!${guardIdentifier}.checkLoop()) break;`);
        magic.appendRight(body.end, '}');
      }
    }
  }
  return magic.toString();
}

/** MemberExpressionの非computed Identifier property名を返す。 */
function memberProperty(node: AstNode): string | undefined {
  if (node.type !== 'MemberExpression' || node.computed !== false) return undefined;
  const property = node.property;
  if (typeof property !== 'object' || property === null) return undefined;
  const candidate = property as Readonly<Record<string, unknown>>;
  return candidate.type === 'Identifier' && typeof candidate.name === 'string'
    ? candidate.name
    : undefined;
}

/** Literalが文字列なら値を返す。 */
function stringLiteral(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const candidate = value as Readonly<Record<string, unknown>>;
  return candidate.type === 'Literal' && typeof candidate.value === 'string'
    ? candidate.value
    : undefined;
}

/** Validatorがsource構造を検証するためのbounded factを抽出する。 */
function collectFacts(nodes: readonly Node[], file: string): readonly JavaScriptSourceFact[] {
  const facts: JavaScriptSourceFact[] = [];
  for (const node of nodes) {
    if (node.type !== 'AssignmentExpression') continue;
    const assignment = ast(node);
    if (assignment.operator !== '=' || !isNode(assignment.left)) continue;
    const left = ast(assignment.left);
    if (memberProperty(left) !== 'textContent' || !isNode(left.object)) continue;
    const call = ast(left.object);
    if (call.type !== 'CallExpression' || !isNode(call.callee)) continue;
    const callee = ast(call.callee);
    if (callee.type !== 'MemberExpression' || memberProperty(callee) !== 'querySelector') continue;
    const root = callee.object;
    if (typeof root !== 'object' || root === null) continue;
    const rootNode = root as Readonly<Record<string, unknown>>;
    if (rootNode.type !== 'Identifier' || rootNode.name !== 'document') continue;
    const args = Array.isArray(call.arguments) ? call.arguments : [];
    const selector = stringLiteral(args[0]);
    const value = stringLiteral(assignment.right);
    if (selector === undefined || value === undefined) continue;
    const position = assignment.loc?.start;
    facts.push({
      kind: 'query-selector-text-content-assignment',
      selector,
      value,
      file,
      line: position?.line ?? 1,
      column: position === undefined ? 1 : position.column + 1,
    });
    if (facts.length > MAX_FACTS) {
      throw new JavaScriptAnalysisIssue('system', 'Source fact数が上限を超えました', file);
    }
  }
  return Object.freeze(facts);
}

/** UTF-8 sourceのSHA-256をlowercase hexで返す。 */
async function sha256(source: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Sourceを解析・制限・instrumentし、失敗を診断へ変換する。 */
export async function analyzeJavaScriptSource(
  request: JavaScriptAnalysisRequest,
): Promise<JavaScriptAnalysisResult> {
  if (!/^[$A-Z_a-z][$\w]*$/u.test(request.guardIdentifier)) {
    return failure(request, 'system', 'Invalid guard identifier', '実行の準備に失敗しました。');
  }
  if (new TextEncoder().encode(request.source).byteLength > MAX_SOURCE_BYTES) {
    return failure(
      request,
      'system',
      'JavaScript source exceeds 100 KiB',
      'script.jsが大きすぎます。100 KiB以内にしてください。',
    );
  }

  let program: Node;
  try {
    program = parse(request.source, {
      ecmaVersion: 'latest',
      sourceType: 'script',
      locations: true,
    });
  } catch (error: unknown) {
    const position = syntaxPosition(error);
    return failure(
      request,
      'syntax',
      error instanceof Error ? error.message : String(error),
      'JavaScriptの書き方を確認してください。括弧や引用符が閉じているか見直しましょう。',
      position.line,
      position.column,
    );
  }

  try {
    const nodes = collectBoundedNodes(program, request.file);
    if (
      nodes.some((node) => node.type === 'Identifier' && ast(node).name === request.guardIdentifier)
    ) {
      throw new JavaScriptAnalysisIssue(
        'system',
        '生成したbudget guard名が学習Sourceと衝突しました',
        request.file,
      );
    }
    assertJavaScriptCapabilityPolicy(program, request.file);
    const facts = collectFacts(nodes, request.file);
    return {
      status: 'success',
      requestId: request.requestId,
      exerciseSessionId: request.exerciseSessionId,
      executionRevision: request.executionRevision,
      file: request.file,
      instrumentedCode: instrument(request.source, nodes, request.guardIdentifier),
      sourceSha256: await sha256(request.source),
      facts,
      diagnostics: [],
    };
  } catch (error: unknown) {
    if (error instanceof JavaScriptAnalysisIssue) {
      return failure(
        request,
        error.kind,
        error.message,
        error.kind === 'security'
          ? `${error.message} 学習用Previewで安全に使える書き方へ直してください。`
          : 'コードが大きすぎるか複雑すぎます。処理を小さく分けてください。',
        error.line,
        error.column,
      );
    }
    return failure(
      request,
      'system',
      error instanceof Error ? error.message : String(error),
      'JavaScriptの解析に失敗しました。少し待ってからもう一度試してください。',
    );
  }
}
