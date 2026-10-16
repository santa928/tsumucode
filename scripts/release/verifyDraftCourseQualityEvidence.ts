import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { canonicalJson } from '../../src/core/persistence/canonicalJson';
import { sha256Bytes, sha256Text } from './releaseHashes';
import {
  DraftCodeReviewReceiptSchema,
  DraftCourseQualityRecordSchema,
  DraftObservationReceiptSchema,
  DraftOriginalsReviewSchema,
  DraftQualityScopeSchema,
  type DraftCandidateBinding,
  type DraftQualityReference,
  type DraftQualityScope,
} from './draftCourseQualitySchema';
import { resolveDraftReleaseCourseContract } from './draftReleaseCourseContracts';
import {
  hashDraftQualityInputs,
  readDraftCandidateGit,
  readDraftSourceTree,
  assertDraftSourceUnchanged,
} from './draftQualityInputHashes';

/** 独立照合receipt自身を除き、対象・候補・全参照を同じ品質記録hashへ固定する。 */
export function hashDraftCourseQualityRecord(input: Readonly<Record<string, unknown>>): string {
  return sha256Text(
    canonicalJson(
      Object.fromEntries(Object.entries(input).filter(([key]) => key !== 'originalsReview')),
    ),
  );
}

/** 参照集合をpath順に固定し、重複を独立した証拠として数えない。 */
function canonicalReferences(references: readonly DraftQualityReference[]): string {
  if (new Set(references.map(({ path: relative }) => relative)).size !== references.length) {
    throw new Error('原本参照のpathが重複しています');
  }
  return canonicalJson([...references].sort((left, right) => left.path.localeCompare(right.path)));
}

/**
 * 草稿の品質原本を読み取り、元入力と現候補・独立照合receiptを照合する。
 * 私有root外、symlink、不完全・古い入力・自己照合は例外で拒否する。
 * hashの一致は実施事実の証明ではなく、独立担当による原本内容の確認を前提とする。
 */
export async function verifyDraftCourseQualityEvidence(
  repositoryRoot: string,
  evidenceRoot: string,
  input: unknown,
  candidate: DraftCandidateBinding,
): Promise<void> {
  const record = DraftCourseQualityRecordSchema.parse(input);
  const contract = resolveDraftReleaseCourseContract(record.courseId);
  if (
    record.status !== 'ready-for-technical-verification' ||
    record.candidate === null ||
    record.originalsReview === null ||
    record.observations.length === 0 ||
    record.codeReviews.length !== 3
  )
    throw new Error('草稿の候補・品質原本・独立照合がまだ揃っていません');
  if (canonicalJson(record.candidate) !== canonicalJson(candidate)) {
    throw new Error('品質記録の候補Source/tree/distが実候補と一致しません');
  }
  if ((await readDraftSourceTree(repositoryRoot, candidate.sourceCommit)) !== candidate.sourceTree)
    throw new Error('候補Source/treeがGit入力と一致しません');
  await assertDraftSourceUnchanged(repositoryRoot, candidate.sourceCommit);

  const root = await realpath(evidenceRoot);
  const checked = new Map<string, { reference: DraftQualityReference; bytes: Buffer }>();

  /** 同じpathの別hashと私有root外への参照を拒否し、実bytesを一度だけ読む。 */
  async function readReference(reference: DraftQualityReference): Promise<Buffer> {
    const cached = checked.get(reference.path);
    if (cached !== undefined) {
      if (cached.reference.sha256 !== reference.sha256)
        throw new Error('同じ原本pathに別hashがあります');
      return cached.bytes;
    }
    const absolute = path.resolve(root, reference.path);
    if (
      !absolute.startsWith(`${root}${path.sep}`) ||
      (await realpath(absolute)) !== absolute ||
      !(await lstat(absolute)).isFile()
    )
      throw new Error('原本は私有root内の通常fileだけを参照できます');
    const bytes = await readFile(absolute);
    if (sha256Bytes(bytes) !== reference.sha256)
      throw new Error(`原本のhashが一致しません: ${reference.path}`);
    checked.set(reference.path, { reference, bytes });
    return bytes;
  }

  canonicalReferences([...record.observations, ...record.codeReviews]);
  const codeActors = new Set<string>();
  const codeRoles = new Set<string>();
  for (const reference of record.codeReviews) {
    const review = DraftCodeReviewReceiptSchema.parse(
      JSON.parse((await readReference(reference)).toString('utf8')),
    );
    if (
      review.courseId !== record.courseId ||
      review.actor === record.author ||
      codeActors.has(review.actor) ||
      codeRoles.has(review.role) ||
      review.productTreeSha256 !== candidate.productTreeSha256
    )
      throw new Error('3担当の独立code reviewが選択Course/現候補と一致しません');
    codeActors.add(review.actor);
    codeRoles.add(review.role);
    if (review.sourceCommit !== candidate.sourceCommit) {
      await assertDraftSourceUnchanged(repositoryRoot, review.sourceCommit);
    }
    await readReference(review.rawReport);
  }

  const coverage = new Map<DraftQualityScope, Set<string>>();
  const runtimeCoverage = new Map<string, Set<string>>();
  const inputHashes = new Map<string, Promise<string>>();
  for (const reference of record.observations) {
    const observation = DraftObservationReceiptSchema.parse(
      JSON.parse((await readReference(reference)).toString('utf8')),
    );
    if (
      observation.courseId !== record.courseId ||
      new Set(observation.lessonIds).size !== observation.lessonIds.length ||
      observation.lessonIds.some((id) => !contract.lessonIds.some((expected) => expected === id)) ||
      new Set(observation.scopes).size !== observation.scopes.length ||
      canonicalJson([...observation.scopes].sort()) !==
        canonicalJson(Object.keys(observation.inputSha256ByScope).sort())
    )
      throw new Error('元観測のCourse/Lesson/入力scopeが専用契約と一致しません');
    if (
      (observation.scopes.includes('usability') && observation.method !== 'computer-use') ||
      (observation.scopes.includes('runtime') && observation.method !== 'automated-test') ||
      (observation.method === 'computer-use' &&
        (observation.contextSharing !== 'none' ||
          observation.actor === record.author ||
          codeActors.has(observation.actor)))
    )
      throw new Error('独立computer useと実Runtime検査の方法が一致しません');
    const runtime = observation.scopes.includes('runtime');
    const browser = observation.executionTarget.startsWith('browser-');
    if (
      (runtime && observation.scopes.length !== 1) ||
      (runtime &&
        !contract.runtimeRequirements.some(
          ({ target }) => target === observation.executionTarget,
        )) ||
      (!runtime && observation.executionTarget !== 'browser-ui') ||
      (observation.method === 'computer-use' && observation.executionTarget !== 'browser-ui') ||
      (observation.canonicalDistSha256 === 'not-applicable' &&
        (browser ||
          !runtime ||
          observation.scopes.length !== 1 ||
          observation.method !== 'automated-test'))
    )
      throw new Error('原本の実行対象またはサイトdistの適用範囲が一致しません');
    canonicalReferences(observation.rawReports);
    if (observation.executionTarget === 'portable-vite') {
      if (
        observation.portableArtifacts === null ||
        observation.portableArtifacts.sourceArchive.path ===
          observation.portableArtifacts.buildManifest.path ||
        Object.values(observation.portableArtifacts).some(
          (artifact) =>
            !observation.rawReports.some(
              (raw) => raw.path === artifact.path && raw.sha256 === artifact.sha256,
            ),
        )
      )
        throw new Error('持ち出し成果物のSource ZIPとbuild manifestが原本集合に必要です');
    } else if (observation.portableArtifacts !== null) {
      throw new Error('持ち出し成果物はportable-viteの実行対象だけに指定できます');
    }
    if (
      (await readDraftSourceTree(repositoryRoot, observation.sourceCommit)) !==
        observation.sourceTree ||
      (observation.sourceCommit === candidate.sourceCommit &&
        observation.canonicalDistSha256 !== 'not-applicable' &&
        observation.canonicalDistSha256 !== candidate.canonicalDistSha256)
    )
      throw new Error('元観測のSource/tree/distが一致しません');
    await readDraftCandidateGit(repositoryRoot, [
      'merge-base',
      '--is-ancestor',
      observation.sourceCommit,
      candidate.sourceCommit,
    ]);

    for (const scope of observation.scopes) {
      const hashes: string[] = [];
      for (const sourceCommit of [observation.sourceCommit, candidate.sourceCommit]) {
        const key = canonicalJson({
          sourceCommit,
          scope,
          lessons: [...observation.lessonIds].sort(),
        });
        let hash = inputHashes.get(key);
        if (hash === undefined) {
          hash = hashDraftQualityInputs(
            repositoryRoot,
            sourceCommit,
            record.courseId,
            scope,
            observation.lessonIds,
          );
          inputHashes.set(key, hash);
        }
        hashes.push(await hash);
      }
      if (hashes[0] !== observation.inputSha256ByScope[scope] || hashes[0] !== hashes[1]) {
        throw new Error(
          `元観測の入力が現候補と異なります: ${scope}/${observation.lessonIds.join(',')}`,
        );
      }
      const lessons = coverage.get(scope) ?? new Set<string>();
      for (const lesson of observation.lessonIds) lessons.add(lesson);
      coverage.set(scope, lessons);
    }
    if (runtime) {
      const lessons = runtimeCoverage.get(observation.executionTarget) ?? new Set<string>();
      for (const lesson of observation.lessonIds) lessons.add(lesson);
      runtimeCoverage.set(observation.executionTarget, lessons);
    }
    for (const raw of observation.rawReports) await readReference(raw);
  }
  for (const { target, lessonIds } of contract.runtimeRequirements) {
    if (lessonIds.some((lesson) => !runtimeCoverage.get(target)?.has(lesson)))
      throw new Error(`必要な実行対象の原本が不足しています: ${target}`);
  }
  for (const scope of DraftQualityScopeSchema.options) {
    const required =
      scope === 'usability'
        ? contract.computerUseLessonIds
        : scope === 'persistence'
          ? [contract.lessonIds[0], contract.lessonIds.at(-1)]
          : contract.lessonIds;
    if (required.some((lesson) => lesson === undefined || !coverage.get(scope)?.has(lesson))) {
      throw new Error(`必要な品質原本の対象Lessonが不足しています: ${scope}`);
    }
  }

  const references = [...checked.values()].map(({ reference }) => reference);
  if (checked.has(record.originalsReview.path))
    throw new Error('独立照合receiptは照合対象集合に含められません');
  const originalReview = DraftOriginalsReviewSchema.parse(
    JSON.parse((await readReference(record.originalsReview)).toString('utf8')),
  );
  if (
    originalReview.courseId !== record.courseId ||
    originalReview.reviewer === record.author ||
    !codeActors.has(originalReview.reviewer) ||
    canonicalJson(originalReview.candidate) !== canonicalJson(candidate) ||
    originalReview.qualityRecordSha256 !== hashDraftCourseQualityRecord(record) ||
    canonicalReferences(originalReview.checkedReferences) !== canonicalReferences(references)
  )
    throw new Error('独立原本照合の担当/候補/記録全体/全参照集合が一致しません');
}
