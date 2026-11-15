// Synthetic static inventory only. A matching source or expression is not authenticated.
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { TextDecoder } from 'node:util';
import ts from 'typescript';

const sourceHash = '058b6a8b4af3d1a148230c1511671935607c36be6d1c4da16083fbf1ed36f2b6';
const fields = Object.freeze({
  schemaVersion: '1',
  repository: 'candidate.repository',
  sourceCommit: 'candidate.recipe.sourceCommit',
  runId: 'candidate.runId',
  buildAttempt: 'candidate.buildAttempt',
  deploymentId: 'record.deploymentId',
  recordTagDigest: 'hashBytes(copies.recordTag)',
  candidateDigest: 'hashValue(candidate)',
  planDigest: 'candidate.planDigest',
  qualificationDigest: 'hashValue(qualification)',
  qualificationRawDigest: 'hashBytes(copies.qualification)',
  declarationDigest: "'4ce18d583429e685ee951def56982bb5c5b292b7e4ad78e162d5ebd2703da494'",
  anchorTagDigest: "'005611a22025a12d925bda0fdfb47c96266cf0d3a57aef984f358528a74ead3b'",
  parentDeploymentId: 'proof.deploymentId',
  parentSourceCommit: 'proof.sourceCommit',
  parentTagDigest: 'proof.tagDigest',
  parentProofDigest: 'hashValue(proof)',
  parentIdentityDigest: 'hashValue({...proof,observedAt:null})',
  parentLineageDigest: 'predecessor ? hashBytes(predecessor) : null',
});
const attempts =
  'z.object({ qualificationAttempt:attempt, recordAttempt:attempt, signerAttempt:attempt }).strict()';
const printer = ts.createPrinter({ removeComments: true });
const normalizedExpression = (text) => {
  const source = ts.createSourceFile(
    'expression.ts',
    `const probe = ${text};`,
    ts.ScriptTarget.Latest,
    true,
  );
  return printer.printNode(
    ts.EmitHint.Unspecified,
    source.statements[0].declarationList.declarations[0].initializer,
    source,
  );
};
const expected = Object.fromEntries(
  Object.entries(fields).map(([key, value]) => [key, normalizedExpression(value)]),
);

/** Checks a declared, reviewed expression list only, not input origin or confidentiality. */
export function inspectSubjectExpressions(text) {
  try {
    if (typeof text !== 'string' || !text.length || Buffer.byteLength(text, 'utf8') > 16 * 1024)
      throw Error('Invalid source');
    const source = ts.createSourceFile('candidate.ts', text, ts.ScriptTarget.Latest, true);
    if (source.parseDiagnostics.length) throw Error('Invalid source');
    const declarations = new Map();
    const visit = (node) => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
        const key = node.name.text;
        if (['draft', 'attempts', 'Attempts', 'attempt'].includes(key)) {
          if (declarations.has(key)) throw Error('Duplicate declaration');
          declarations.set(key, node.initializer);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    const print = (node) => printer.printNode(ts.EmitHint.Unspecified, node, source);
    if (
      !declarations.get('attempt') ||
      print(declarations.get('attempt')) !== normalizedExpression('z.number().int().positive()') ||
      !declarations.get('Attempts') ||
      print(declarations.get('Attempts')) !== normalizedExpression(attempts) ||
      !declarations.get('attempts') ||
      print(declarations.get('attempts')) !== normalizedExpression('Attempts.parse(input.attempts)')
    )
      throw Error('Attempt derivation differs');
    const draft = declarations.get('draft');
    if (
      !draft ||
      !ts.isCallExpression(draft) ||
      print(draft.expression) !== 'toBytes' ||
      draft.arguments.length !== 1 ||
      !ts.isObjectLiteralExpression(draft.arguments[0])
    )
      throw Error('Draft shape differs');
    const seen = new Set();
    let attemptSpreads = 0;
    for (const property of draft.arguments[0].properties) {
      if (ts.isSpreadAssignment(property)) {
        if (print(property.expression) !== 'attempts' || ++attemptSpreads !== 1)
          throw Error('Spread differs');
        continue;
      }
      if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name))
        throw Error('Field differs');
      const key = property.name.text;
      if (
        !Object.hasOwn(expected, key) ||
        seen.has(key) ||
        print(property.initializer) !== expected[key]
      )
        throw Error('Field differs');
      seen.add(key);
    }
    if (attemptSpreads !== 1 || seen.size !== Object.keys(expected).length)
      throw Error('Field set differs');
    return Object.freeze({
      authorizationGranted: false,
      directFields: seen.size,
      attemptFields: 3,
    });
  } catch {
    throw Error('Subject expression inventory rejected');
  }
}

/** Pins the complete inspected bytes, while still granting no signing authority. */
export function inspectPinnedSubjectSource(input) {
  try {
    if (
      !(input instanceof Uint8Array) ||
      input.buffer instanceof SharedArrayBuffer ||
      !input.byteLength ||
      input.byteLength > 16 * 1024
    )
      throw Error('Invalid source bytes');
    const snapshot = Buffer.from(input);
    if (createHash('sha256').update(snapshot).digest('hex') !== sourceHash)
      throw Error('Source differs');
    return inspectSubjectExpressions(new TextDecoder('utf-8', { fatal: true }).decode(snapshot));
  } catch {
    throw Error('Subject source inventory rejected');
  }
}
