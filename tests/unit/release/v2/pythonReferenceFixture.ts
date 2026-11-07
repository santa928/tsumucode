import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { buildInventory } from '../../../../scripts/release/v2/inventory';
import {
  hashBytes,
  hashValue,
  repositoryEnvironment,
} from '../../../../scripts/release/v2/identity';
import { readAuthoringAtSource } from '../../../../scripts/release/v2/sourceInventory';
import { learnerMovementOriginals } from '../../../../scripts/release/v2/learnerMovement';
import { javascriptLearnerContentProjection } from '../../../../scripts/release/javascriptLessonEvaluation';
import {
  movementIntentScope,
  movementOriginals,
  MovementDeclarationSchema,
} from '../../../../scripts/release/v2/movement';
import { stageMoves } from '../../../../scripts/release/v2/movementStage';

import { PythonReferenceOriginalsSchema } from '../../../../scripts/release/v2/pythonReferenceCarry';

const exec = promisify(execFile);
export const previousSource = '16bbf55442a3166193c3e7de07c06d644126968d';
export const currentSource = '19cbed7d95cac527d17b58f3522cdf4f05466b92';
const cases = [
  [
    'python-basics-ch01-l05',
    'python-basics-ch01',
    'python-basics-ch01-l05',
    'python-basics-ch01-l05-values',
  ],
  [
    'python-basics-ch02-l01',
    'python-basics-ch02',
    'python-basics-ch01-l09',
    'python-basics-ch01-l13',
  ],
] as const;

// 実Git bytesと実Compiler入力を使うが、baseline認証とapprovalはunit専用の合成値。
export async function pythonReferenceFixture() {
  const root = process.cwd();
  const old = await readAuthoringAtSource(root, previousSource, 'python-basics');
  const current = await readAuthoringAtSource(root, currentSource, 'python-basics');
  const react = await readAuthoringAtSource(root, previousSource, 'react');
  const environment = await repositoryEnvironment(root);
  const raw = async (
    source: string,
    compilation: typeof old.compilation,
    side: 'previous' | 'current',
  ) => {
    const lessons = compilation.runtime.phases.flatMap((p) => p.chapters.flatMap((c) => c.lessons));
    const projection = (id: string) =>
      javascriptLearnerContentProjection(
        lessons.find((l) => l.id === id)!,
        compilation.runtime.glossary,
        compilation.assets,
      );
    const rows = [];
    for (const [lessonId, chapter, beforeTarget, afterTarget] of cases) {
      const prefix = `content/python-basics/chapters/${chapter}/lessons/${lessonId}/`;
      const listed = await exec('git', ['ls-tree', '-r', '--name-only', source, '--', prefix], {
        cwd: root,
        env: environment,
      });
      const files = [];
      let lessonSource = '';
      for (const file of listed.stdout.trim().split('\n')) {
        const { stdout } = await exec('git', ['show', source + ':' + file], {
          cwd: root,
          env: environment,
          encoding: 'buffer',
        });
        const relative = file.slice(prefix.length);
        files.push({ path: relative, bytes: stdout.length, sha256: hashBytes(stdout) });
        if (relative === 'lesson.yaml') lessonSource = stdout.toString('utf8');
      }
      rows.push({
        courseId: 'python-basics' as const,
        lessonId,
        projection: projection(lessonId),
        targetProjection: projection(side === 'previous' ? beforeTarget : afterTarget),
        nextLessonId: lessons.find((l) => l.id === lessonId)!.nextLessonId ?? null,
        lessonSource,
        files,
      });
    }
    return PythonReferenceOriginalsSchema.shape.current.parse(rows);
  };
  const inventory = buildInventory([current.compilation, react.compilation]);
  const baseline = {
    deploymentId: '501',
    sourceCommit: previousSource,
    sourceRecordDigest: 'a'.repeat(64),
    artifactDigest: 'b'.repeat(64),
    inventory: buildInventory([old.compilation, react.compilation]),
  };
  const declaration = MovementDeclarationSchema.parse(
    JSON.parse(await readFile('docs/quality/movement-v2.json', 'utf8')),
  );
  const body = {
    ...declaration.body,
    pythonReferenceUpdates: 'list-alias-and-console-references-v1' as const,
  };
  const moves = stageMoves('python-first');
  const inputs = {
    declaration: { ...declaration, body },
    previous: [
      { courseId: 'python-basics', exercises: old.authoringExercises! },
      { courseId: 'react', exercises: react.authoringExercises! },
    ],
    current: movementOriginals([current.compilation, react.compilation]),
    learnerOriginals: {
      previous: learnerMovementOriginals([old.compilation], moves, 'previous'),
      current: learnerMovementOriginals([current.compilation], moves, 'current'),
    },
    pythonReferenceOriginals: {
      previous: await raw(previousSource, old.compilation, 'previous'),
      current: await raw(currentSource, current.compilation, 'current'),
    },
  };
  return { inventory, baseline, inputs, currentCompilation: current.compilation };
}

export function sealPythonReferenceFixture(
  fixture: Awaited<ReturnType<typeof pythonReferenceFixture>>,
) {
  const { inputs, inventory, baseline } = fixture;
  const declaration = inputs.declaration;
  const body = declaration.body;
  body.baseline = {
    deploymentId: baseline.deploymentId,
    sourceCommit: baseline.sourceCommit,
    sourceRecordDigest: baseline.sourceRecordDigest,
    inventoryDigest: hashValue(baseline.inventory),
  };
  body.candidateInventoryDigest = hashValue(inventory);
  body.originalsDigest = hashValue({
    previous: inputs.previous,
    current: inputs.current,
    learnerOriginals: inputs.learnerOriginals,
    pythonReferenceOriginals: inputs.pythonReferenceOriginals,
  });
  declaration.bodyDigest = hashValue(body);
  declaration.approvals = body.intents.map((intent) => {
    const unsigned = {
      schemaVersion: 1 as const,
      migrationId: body.migrationId,
      bodyDigest: declaration.bodyDigest,
      oldFixtureId: intent.oldFixtureId,
      scopeDigest: movementIntentScope(body, intent.oldFixtureId),
      authorId: 'unit-reference-author',
      reviewerId: 'unit-reference-reviewer',
      status: 'approved' as const,
      method: 'source-review' as const,
      originalDigest: hashValue('synthetic original/' + intent.oldFixtureId),
      originalsCheckedBy: 'unit-reference-inspector',
    };
    return { ...unsigned, receiptDigest: hashValue(unsigned) };
  });
  declaration.declarationDigest = hashValue({
    body,
    bodyDigest: declaration.bodyDigest,
    approvals: declaration.approvals,
  });
  return fixture;
}
