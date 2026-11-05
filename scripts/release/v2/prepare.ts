import { compileContent } from '../../content/compile';
import { buildInventory } from './inventory';
import { planRelease } from './plan';
import { verifyNativeCatalog } from './nativeCatalog';
import { hashArtifact, hashValue } from './identity';
import { BaselineSchema } from './content';
import path from 'node:path';
import { readAuthoringAtSource } from './sourceInventory';
import { movementOriginals, readMovementDeclaration, verifyMovementInputs } from './movement';
import { learnerMovementOriginals } from './learnerMovement';
import { stageMoves } from './movementStage';
import { readPythonMovementPredecessor } from './movementPredecessor';
import { readMovementBaselineProofs } from './movementBaseline';

/** One sanitized delivery tree owns app input, known-course indexes and every verification suite. */
export async function prepareRelease(
  sourceRoot: string,
  outputRoot: string,
  baseline?: unknown,
  currentProof?: unknown,
) {
  const compilation = await compileContent({ sourceRoot, outputRoot, checkOnly: false });
  const inventory = buildInventory(compilation.compilations);
  verifyNativeCatalog(inventory, compilation.nativeWorkspaceCatalog);
  const declaration = await readMovementDeclaration(path.dirname(sourceRoot));
  let movementInputs;
  let movement;
  if (declaration) {
    const previous = BaselineSchema.parse(baseline);
    const baselineProofs = await readMovementBaselineProofs(
      path.dirname(sourceRoot),
      declaration.body.baseline,
      previous,
      currentProof,
    );
    const stage = declaration.body.stage ?? 'joint';
    const moves = stageMoves(stage);
    const originals = [];
    const previousLearners: ReturnType<typeof learnerMovementOriginals> = [];
    // 旧原本は変更対象の2Courseだけ読み、現原本はこのCompile結果を使う。
    for (const courseId of ['python-basics', 'react']) {
      const source = await readAuthoringAtSource(
        path.dirname(sourceRoot),
        previous.sourceCommit,
        courseId,
      );
      if (
        hashValue(source.inventory.courses[0]) !==
        hashValue(previous.inventory.courses.find((course) => course.id === courseId))
      )
        throw Error('Archived movement source does not reproduce authenticated baseline');
      originals.push({ courseId, exercises: source.authoringExercises });
      previousLearners.push(...learnerMovementOriginals([source.compilation], moves, 'previous'));
    }
    const legacyMovementInputs = {
      declaration,
      previous: originals,
      current: movementOriginals(compilation.compilations),
      ...(baselineProofs ? { baselineProofs } : {}),
    };
    const learnerOriginals = {
      previous: previousLearners,
      current: learnerMovementOriginals(compilation.compilations, moves, 'current'),
    };
    // 既存宣言は旧payloadのまま厳格検証する。拡張原本全体を宣言へ拘束した場合だけ使用する。
    const boundMovementInputs =
      declaration.body.originalsDigest ===
      hashValue({
        previous: legacyMovementInputs.previous,
        current: legacyMovementInputs.current,
        learnerOriginals,
      })
        ? { ...legacyMovementInputs, learnerOriginals }
        : legacyMovementInputs;
    movementInputs =
      stage === 'react-after-python'
        ? {
            ...boundMovementInputs,
            predecessor: await readPythonMovementPredecessor(path.dirname(sourceRoot)),
          }
        : boundMovementInputs;
    movement = verifyMovementInputs(movementInputs, inventory, previous);
  }
  return {
    schemaVersion: 1,
    inventory,
    plan: planRelease(inventory, baseline, movement),
    ...(movementInputs ? { movementInputs } : {}),
    publicContent: await hashArtifact(outputRoot),
  };
}
