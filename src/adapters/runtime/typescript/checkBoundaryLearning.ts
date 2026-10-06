/** DOM・unknown・非同期の固定課題だけで、型と値の関係を非emit検査する。 */
import ts from 'typescript';
import { checkTypeScript, createTypeScriptProbeChecker } from './compileTypeScript';
import { inspectBoundaryLearning } from './inspectBoundaryLearning';
import type { TypeScriptBoundaryProfile } from '../../../core/content/typeScriptBoundaryContract';

export interface BoundaryLearningFacts {
  readonly programShapeAccepted: boolean;
  readonly typeContractAccepted: boolean;
  readonly usesInputValue: boolean;
  readonly callsAccepted: boolean;
  readonly forbiddenEscapeAbsent: boolean;
  readonly positiveProbeAccepted: boolean;
  readonly negativeProbesRejected: boolean;
}

export type BoundaryLearningResult =
  | {
      readonly status: 'ready';
      readonly profile: TypeScriptBoundaryProfile;
      readonly facts: BoundaryLearningFacts;
    }
  | { readonly status: 'system-error' };

const EMPTY_FACTS: BoundaryLearningFacts = {
  programShapeAccepted: false,
  typeContractAccepted: false,
  usesInputValue: false,
  callsAccepted: false,
  forbiddenEscapeAbsent: true,
  positiveProbeAccepted: false,
  negativeProbesRejected: false,
};

/** 元TSを変更せず、検査コピーと有限factだけをCompiler内で使う。 */
export function checkBoundaryLearning(
  files: Readonly<Record<string, string>>,
  libraries: Readonly<Record<string, string>>,
  profile: TypeScriptBoundaryProfile,
): BoundaryLearningResult {
  if (Object.keys(files).some((name) => name.startsWith('__tsumucode_')))
    return { status: 'system-error' };
  const source = files['main.ts'];
  if (Object.keys(files).length !== 1 || source === undefined)
    return { status: 'ready', profile, facts: EMPTY_FACTS };
  if (source.length > 8192) return { status: 'system-error' };
  try {
    const file = ts.createSourceFile('main.ts', source, ts.ScriptTarget.ES2023, true);
    const pending = [{ node: file as ts.Node, depth: 0 }];
    let nodes = 0;
    let forbiddenEscapeAbsent = true;
    while (pending.length) {
      const { node, depth } = pending.pop()!;
      if (++nodes > 2048 || depth > 64) return { status: 'system-error' };
      if (
        node.kind === ts.SyntaxKind.AnyKeyword ||
        ts.isAsExpression(node) ||
        ts.isTypeAssertionExpression(node) ||
        ts.isNonNullExpression(node)
      )
        forbiddenEscapeAbsent = false;
      if (
        ts.isIdentifier(node) &&
        (node.text.startsWith('__tsumucode_') ||
          (['console', 'undefined'].includes(node.text) &&
            !ts.isPropertyAccessExpression(node.parent) &&
            !ts.isTypeReferenceNode(node.parent)))
      ) {
        if (node.text.startsWith('__tsumucode_')) return { status: 'system-error' };
        forbiddenEscapeAbsent = false;
      }
      ts.forEachChild(node, (child) => {
        pending.push({ node: child, depth: depth + 1 });
      });
    }
    const scanner = ts.createScanner(
      ts.ScriptTarget.ES2023,
      false,
      ts.LanguageVariant.Standard,
      source,
    );
    for (
      let token = scanner.scan();
      token !== ts.SyntaxKind.EndOfFileToken;
      token = scanner.scan()
    ) {
      if (
        (token === ts.SyntaxKind.SingleLineCommentTrivia ||
          token === ts.SyntaxKind.MultiLineCommentTrivia) &&
        (/@ts-(?:ignore|expect-error|nocheck)\b/u.test(scanner.getTokenText()) ||
          /^\/\/\/\s*<reference\b/u.test(scanner.getTokenText()))
      )
        forbiddenEscapeAbsent = false;
    }
    const inspection = inspectBoundaryLearning(file, profile);
    const facts = {
      ...EMPTY_FACTS,
      programShapeAccepted: inspection.shape,
      typeContractAccepted: inspection.type,
      usesInputValue: inspection.value,
      callsAccepted: inspection.calls,
      forbiddenEscapeAbsent,
    };
    if (
      ![
        inspection.shape,
        inspection.type,
        inspection.value,
        inspection.calls,
        forbiddenEscapeAbsent,
      ].every(Boolean)
    )
      return { status: 'ready', profile, facts };
    if (checkTypeScript(files, libraries).status !== 'valid') return { status: 'system-error' };
    const copy = source + '\n' + inspection.exportSource + '\n';
    const prefix =
      profile === 'async-unknown-v1'
        ? 'import { __tsumucode_load, __tsumucode_show } from "./main.js";\n'
        : 'import { __tsumucode_value } from "./main.js";\n';
    const checkProbe = createTypeScriptProbeChecker();
    const positive = checkProbe(
      {
        'main.ts': copy,
        '__tsumucode_positive.ts': prefix + inspection.positiveLines.join('\n') + '\n',
      },
      libraries,
    );
    const negative = checkProbe(
      {
        'main.ts': copy,
        '__tsumucode_negative.ts':
          prefix + inspection.negativeLines.map((line) => `{ ${line.source} }`).join('\n') + '\n',
      },
      libraries,
    );
    if (
      positive.status !== 'valid' ||
      negative.status !== 'type-error' ||
      negative.diagnostics.length !== inspection.negativeLines.length ||
      !inspection.negativeLines.every((line, index) =>
        negative.diagnostics.some(
          (d) =>
            d.file === '__tsumucode_negative.ts' &&
            d.line === index + 2 &&
            d.code === line.code &&
            (d.column ?? 0) > 0,
        ),
      )
    )
      return { status: 'system-error' };
    return {
      status: 'ready',
      profile,
      facts: { ...facts, positiveProbeAccepted: true, negativeProbesRejected: true },
    };
  } catch {
    return { status: 'system-error' };
  }
}
