import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { parse } from 'yaml';
import { migrateRepositorySnapshot } from '../../src/adapters/persistence/indexeddb/migrateProgress';
import type { CourseManifest, ContentProgressMigration } from '../../src/core/content/types';
import { canonicalJson } from '../../src/core/persistence/canonicalJson';
import { ContentProgressMigrationService } from '../../src/core/persistence/contentProgressMigration';
import type { ProgressBundle, ProgressRepository } from '../../src/core/persistence/contracts';
import { compileCourse, stringifyCanonicalJson } from '../content/compileCourse';
import { hashPersistentIds, sha256Text } from './releaseHashes';
import { ReleaseHistorySchema, type ReleaseHistory } from './releaseSchema';
import {
  verifyReleasePromotion,
  verifyStoredPostDeployVerification,
} from './verifyReleasePromotion';
import { verifyPublishedTag } from './verifyReleaseTarget';

export type { ReleaseHistory } from './releaseSchema';

const execFileAsync = promisify(execFile);

export type ContinuityMode = 'prepare' | 'quality-only' | 'candidate' | 'promote';

export interface ReleaseCourseMetadata {
  readonly revision: string;
  readonly progressMigrations: readonly ContentProgressMigration[];
}

export interface ReleaseMetadataInput {
  readonly history: ReleaseHistory;
  readonly course: ReleaseCourseMetadata;
  readonly currentCourseManifestSha256: string;
  readonly currentPersistentIds: readonly string[];
  readonly releaseTags: readonly string[];
  readonly mode: ContinuityMode;
}

export interface ContinuityReport {
  readonly revision: string;
  readonly persistentIds: number;
  readonly migratedCourses: number;
  readonly migratedDrafts: number;
  readonly resetNotices: number;
}

/** YYYY-MM-DD.N revisionを日付と通番へ分け、単調増加比較できる値へ変換する。 */
function revisionParts(revision: string): readonly [string, number] {
  const match = /^(\d{4}-\d{2}-\d{2})\.(\d+)$/u.exec(revision);
  if (!match?.[1] || !match[2]) throw new Error(`不正なrevisionです: ${revision}`);
  return [match[1], Number(match[2])];
}

/** leftがrightより新しいrevisionかを日付と通番で判定する。 */
function isNewerRevision(left: string, right: string): boolean {
  const [leftDate, leftSequence] = revisionParts(left);
  const [rightDate, rightSequence] = revisionParts(right);
  return leftDate > rightDate || (leftDate === rightDate && leftSequence > rightSequence);
}

/** migration source IDからactionを一意に引けるMapを作る。 */
function migrationActions(
  migrations: readonly ContentProgressMigration[],
): ReadonlyMap<string, ContentProgressMigration['steps'][number]> {
  const actions = new Map<string, ContentProgressMigration['steps'][number]>();
  for (const migration of migrations) {
    for (const step of migration.steps) {
      const sourceId = step.action === 'map-to' ? step.fromId : step.id;
      if (actions.has(sourceId))
        throw new Error(`移行宣言のsource IDが重複しています: ${sourceId}`);
      actions.set(sourceId, step);
    }
  }
  return actions;
}

/** 公開済みReleaseの順序、一意性、tag chain、ID hashとmigration契約を検証する。 */
function validatePublishedReleaseChain(history: ReleaseHistory): void {
  const revisions = new Set<string>();
  const tags = new Set<string>();
  const sources = new Set<string>();
  const cumulativeTombstones = new Set<string>();
  let previous: ReleaseHistory['releases'][number] | undefined;

  for (const release of history.releases) {
    if (
      revisions.has(release.revision) ||
      tags.has(release.tag) ||
      sources.has(release.sourceCommit)
    ) {
      throw new Error(`公開Releaseのrevision/tag/sourceが重複しています: ${release.revision}`);
    }
    revisions.add(release.revision);
    tags.add(release.tag);
    sources.add(release.sourceCommit);
    if (release.tag !== `tsumucode-release-${release.revision}`) {
      throw new Error(`公開Release tagとrevisionが一致しません: ${release.tag}`);
    }
    const expectedPrevious = previous?.tag ?? null;
    if (release.previousReleaseTag !== expectedPrevious) {
      throw new Error(`公開ReleaseのpreviousReleaseTag chainが不正です: ${release.revision}`);
    }
    if (previous !== undefined && !isNewerRevision(release.revision, previous.revision)) {
      throw new Error(`公開Release revisionが単調増加していません: ${release.revision}`);
    }
    const sortedIds = [...release.persistentIds].sort((left, right) => left.localeCompare(right));
    if (canonicalJson(release.persistentIds) !== canonicalJson(sortedIds)) {
      throw new Error(`公開Releaseの永続IDが正規順ではありません: ${release.revision}`);
    }
    if (release.persistentIdsSha256 !== hashPersistentIds(release.persistentIds)) {
      throw new Error(`公開Releaseの永続ID hashが一致しません: ${release.revision}`);
    }
    for (const tombstone of release.tombstonedIds) cumulativeTombstones.add(tombstone);
    const reused = release.persistentIds.find((id) => cumulativeTombstones.has(id));
    if (reused !== undefined)
      throw new Error(`公開Releaseがtombstone IDを再利用しています: ${reused}`);
    for (const [sourceId, step] of migrationActions(release.migrations)) {
      if (!release.tombstonedIds.includes(sourceId)) {
        throw new Error(`公開Releaseの移行source IDにtombstoneがありません: ${sourceId}`);
      }
      if (step.action === 'map-to' && !release.persistentIds.includes(step.toId)) {
        throw new Error(`公開Releaseのmap-to先IDが永続IDにありません: ${step.toId}`);
      }
    }
    previous = release;
  }
}

/** Release台帳、公開Course migration、ID、tagの相互整合を純粋検証する。 */
export function validateReleaseMetadata(input: ReleaseMetadataInput): void {
  const { history, course } = input;
  const candidate = history.candidate;
  validatePublishedReleaseChain(history);
  if (candidate.revision !== course.revision) {
    throw new Error(`candidate revisionと公開Course revisionが一致しません`);
  }
  if (canonicalJson(candidate.migrations) !== canonicalJson(course.progressMigrations)) {
    throw new Error('Release Historyと公開Courseのmigrationが一致しません');
  }

  const currentIds = [...new Set(input.currentPersistentIds)].sort((left, right) =>
    left.localeCompare(right),
  );
  if (currentIds.length !== input.currentPersistentIds.length) {
    throw new Error('現在の永続IDが重複しています');
  }

  const cumulativeTombstones = new Set([
    ...history.releases.flatMap(({ tombstonedIds }) => tombstonedIds),
    ...candidate.tombstonedIds,
  ]);
  const reused = currentIds.find((id) => cumulativeTombstones.has(id));
  if (reused !== undefined) throw new Error(`tombstone IDを再利用しています: ${reused}`);

  const actions = migrationActions(candidate.migrations);
  for (const [sourceId, step] of actions) {
    if (!candidate.tombstonedIds.includes(sourceId)) {
      throw new Error(`移行source IDにtombstoneがありません: ${sourceId}`);
    }
    if (step.action === 'map-to' && !currentIds.includes(step.toId)) {
      throw new Error(`map-to先IDが現行Courseにありません: ${sourceId} -> ${step.toId}`);
    }
  }

  const latest = history.releases.at(-1);
  if (latest !== undefined) {
    if (
      input.currentCourseManifestSha256 !== latest.courseManifestSha256 &&
      !isNewerRevision(candidate.revision, latest.revision)
    ) {
      throw new Error('教材内容hashが変わったのにrevisionが単調増加していません');
    }
    const removedIds = latest.persistentIds.filter((id) => !currentIds.includes(id));
    const undeclared = removedIds.find((id) => !actions.has(id));
    if (undeclared !== undefined) {
      throw new Error(`削除IDに移行宣言がありません: ${undeclared}`);
    }
    const expectedPrevious = latest.tag;
    if (candidate.previousReleaseTag !== expectedPrevious) {
      throw new Error(`candidateのpreviousReleaseTagが最新Releaseと一致しません`);
    }
    if (candidate.status === 'approved' && !isNewerRevision(candidate.revision, latest.revision)) {
      throw new Error('承認済みcandidate revisionは最新Releaseより新しい必要があります');
    }
  } else if (candidate.previousReleaseTag !== null) {
    throw new Error('初回candidateのpreviousReleaseTagはnullである必要があります');
  }

  const expectedTags = new Set(history.releases.map(({ tag }) => tag));
  for (const release of history.releases) {
    if (!input.releaseTags.includes(release.tag)) {
      throw new Error(`Release台帳のannotated tagが取得されていません: ${release.tag}`);
    }
  }
  const unexpectedTags = input.releaseTags.filter((tag) => !expectedTags.has(tag));
  if (unexpectedTags.length > 0) {
    throw new Error(`Release tagが台帳へ登録されていません: ${unexpectedTags.join(', ')}`);
  }

  if (candidate.status === 'approved') {
    if (canonicalJson(candidate.persistentIds) !== canonicalJson(currentIds)) {
      throw new Error('承認済みcandidateの永続ID一覧が現在Sourceと一致しません');
    }
    const actualPersistentHash = hashPersistentIds(currentIds);
    if (candidate.persistentIdsSha256 !== actualPersistentHash) {
      throw new Error('承認済みcandidateの永続ID hashが一致しません');
    }
  }
}

/** Runtime Courseから学習状態に永続化され得る公開ID集合を返す。 */
export function collectPersistentIds(course: CourseManifest): readonly string[] {
  const ids = new Set<string>([course.id]);
  for (const phase of course.phases) {
    ids.add(phase.id);
    for (const chapter of phase.chapters) {
      ids.add(chapter.id);
      for (const lesson of chapter.lessons) {
        ids.add(lesson.id);
        for (const slide of lesson.slides) ids.add(slide.id);
        if (lesson.kind !== 'standard') {
          ids.add(lesson.project.id);
          for (const checklist of lesson.project.checklist) ids.add(checklist.id);
        }
        for (const exercise of lesson.exercises) {
          ids.add(exercise.id);
          ids.add(exercise.workspaceId);
          if (exercise.kind !== 'standard') ids.add(exercise.projectId);
          for (const rule of exercise.validationRules) ids.add(rule.id);
          for (const hint of exercise.hints) ids.add(hint.id);
          for (const viewport of exercise.previewViewports) ids.add(viewport.id);
        }
      }
    }
  }
  return [...ids].sort((left, right) => left.localeCompare(right));
}

/** JSON値に現れる全文字列を収集し、合成Bundleの移行evidenceを検査する。 */
function stringValues(value: unknown, values = new Set<string>()): ReadonlySet<string> {
  if (typeof value === 'string') values.add(value);
  else if (Array.isArray(value)) for (const item of value) stringValues(item, values);
  else if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) stringValues(child, values);
  }
  return values;
}

/** integrity付き合成BundleをRuntime pure migratorへ通し、map/reset/preserveを実証する。 */
export async function verifySyntheticProgressBundle(
  course: CourseManifest,
  untrustedBundle: unknown,
): Promise<Omit<ContinuityReport, 'revision' | 'persistentIds'>> {
  if (
    typeof untrustedBundle !== 'object' ||
    untrustedBundle === null ||
    Array.isArray(untrustedBundle)
  ) {
    throw new Error('合成Bundleがobjectではありません');
  }
  const untrustedIntegrity = (untrustedBundle as Record<string, unknown>)['integrity'];
  if (
    typeof untrustedIntegrity !== 'object' ||
    untrustedIntegrity === null ||
    Array.isArray(untrustedIntegrity)
  ) {
    throw new Error('合成Bundleのintegrityがobjectではありません');
  }
  const integrityRecord = untrustedIntegrity as Record<string, unknown>;
  if (integrityRecord['algorithm'] !== 'SHA-256') {
    throw new Error('合成Bundleのhash algorithmが不正です');
  }
  if (
    typeof integrityRecord['digest'] !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(integrityRecord['digest'])
  ) {
    throw new Error('合成Bundleのintegrity digestが不正です');
  }

  const bundle = untrustedBundle as ProgressBundle;
  const { integrity, ...unsigned } = bundle;
  if (sha256Text(canonicalJson(unsigned)) !== integrity.digest) {
    throw new Error('合成Bundleのintegrity hashが一致しません');
  }

  const stored = migrateRepositorySnapshot(unsigned, bundle.exportedAt);
  const inputStrings = stringValues({ courses: stored.courses, drafts: stored.drafts });
  const migrationSources = migrationActions(course.progressMigrations);
  for (const sourceId of migrationSources.keys()) {
    if (!inputStrings.has(sourceId)) {
      throw new Error(`合成Bundleに移行source IDがありません: ${sourceId}`);
    }
  }

  const migrations = new ContentProgressMigrationService({} as ProgressRepository, {
    now: () => '2026-07-16T00:00:00.000Z',
    id: () => 'release-continuity',
  });
  migrations.registerCourse(course);
  const { snapshot, notices } = await migrations.migrateSnapshotWithNotices(stored, {
    requireRegisteredCourses: true,
  });
  const normalStrings = stringValues({ courses: snapshot.courses, drafts: snapshot.drafts });

  for (const [sourceId, step] of migrationSources) {
    if (normalStrings.has(sourceId)) {
      throw new Error(`移行後の通常進捗へ旧IDが残っています: ${sourceId}`);
    }
    if (step.action === 'map-to' && !normalStrings.has(step.toId)) {
      throw new Error(`map-to先が移行後進捗にありません: ${sourceId} -> ${step.toId}`);
    }
    if (
      step.action === 'intentionally-reset' &&
      !notices.some(({ sourceId: noticedId }) => noticedId === sourceId)
    ) {
      throw new Error(`intentionally-resetのNoticeがありません: ${sourceId}`);
    }
  }

  for (const progress of Object.values(snapshot.courses)) {
    if (progress.courseId === course.id && progress.contentRevision !== course.revision) {
      throw new Error('移行後CourseProgressのcontentRevisionが現行ではありません');
    }
  }
  for (const draft of Object.values(snapshot.drafts)) {
    if (draft.courseId === course.id && draft.contentRevision !== course.revision) {
      throw new Error('移行後DraftのcontentRevisionが現行ではありません');
    }
  }

  const stableDrafts = Object.entries(stored.drafts).filter(([, draft]) =>
    [draft.lessonId, draft.exerciseId, draft.workspaceId].every((id) => !migrationSources.has(id)),
  );
  if (stableDrafts.length === 0) throw new Error('合成Bundleにpreserve対象Draftがありません');
  for (const [key, draft] of stableDrafts) {
    const migrated = snapshot.drafts[key];
    if (
      migrated === undefined ||
      canonicalJson(migrated.files) !== canonicalJson(draft.files) ||
      migrated.updatedAt !== draft.updatedAt
    ) {
      throw new Error(`preserve対象Draftが失われました: ${key}`);
    }
  }

  return {
    migratedCourses: Object.keys(snapshot.courses).length,
    migratedDrafts: Object.keys(snapshot.drafts).length,
    resetNotices: notices.length,
  };
}

/** fetch済みrelease tag名をGit refから列挙する。 */
async function listReleaseTags(repositoryRoot: string): Promise<readonly string[]> {
  const { stdout } = await execFileAsync(
    'git',
    ['for-each-ref', '--format=%(refname:strip=2)', 'refs/tags/tsumucode-release-*'],
    { cwd: repositoryRoot, encoding: 'utf8' },
  );
  return stdout
    .split('\n')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
}

/** RepositoryのRelease History、Course、合成Bundleを同時に検証する。 */
export async function checkReleaseContinuity(
  repositoryRoot: string,
  mode: ContinuityMode,
  promotionReportPath?: string,
): Promise<ContinuityReport> {
  const root = path.resolve(repositoryRoot);
  const history = ReleaseHistorySchema.parse(
    parse(await readFile(path.join(root, 'content/html-css/release-history.yaml'), 'utf8')),
  );
  const compilation = await compileCourse(path.join(root, 'content/html-css'));
  const course = compilation.runtime;
  const persistentIds = collectPersistentIds(course);
  const courseHash = sha256Text(stringifyCanonicalJson(course));
  validateReleaseMetadata({
    history,
    course,
    currentCourseManifestSha256: courseHash,
    currentPersistentIds: persistentIds,
    releaseTags: await listReleaseTags(root),
    mode,
  });
  for (const release of history.releases) {
    await verifyPublishedTag(root, release);
    await verifyStoredPostDeployVerification(root, release);
  }

  if (mode === 'promote') {
    if (promotionReportPath === undefined) {
      throw new Error('--promoteには--reportでRelease Reportを指定してください');
    }
    await verifyReleasePromotion(root, history, promotionReportPath);
  }

  if (mode === 'candidate') {
    const candidate = history.candidate;
    if (
      candidate.status !== 'approved' ||
      candidate.verifiedSourceCommit === 'draft' ||
      candidate.canonicalDistSha256 === 'draft' ||
      candidate.courseManifestSha256 === 'draft' ||
      candidate.publicProvenanceSha256 === 'draft'
    ) {
      throw new Error('Deploy candidateのsource／artifact bindingが承認済みではありません');
    }
    if (candidate.courseManifestSha256 !== courseHash) {
      throw new Error('Deploy candidateのCourse Manifest hashが現在Sourceと一致しません');
    }
  }

  const bundlePath = path.resolve(root, history.candidate.syntheticProgressBundlePath);
  if (!bundlePath.startsWith(`${root}${path.sep}`)) {
    throw new Error('合成Bundle pathがRepository外を指しています');
  }
  const bundle: unknown = JSON.parse(await readFile(bundlePath, 'utf8'));
  const migration = await verifySyntheticProgressBundle(course, bundle);
  return {
    revision: course.revision,
    persistentIds: persistentIds.length,
    ...migration,
  };
}

/** CLI引数からRelease continuity modeを一意に決める。 */
function modeFromArguments(arguments_: readonly string[]): ContinuityMode {
  const selected = [
    arguments_.includes('--prepare') ? 'prepare' : undefined,
    arguments_.includes('--quality-only') ? 'quality-only' : undefined,
    arguments_.includes('--promote') ? 'promote' : undefined,
  ].filter((mode): mode is Exclude<ContinuityMode, 'candidate'> => mode !== undefined);
  if (selected.length > 1) throw new Error('Release continuity modeは1件だけ指定してください');
  return selected[0] ?? 'candidate';
}

/** CLI flag直後の任意値を取得する。 */
function argumentValue(arguments_: readonly string[], flag: string): string | undefined {
  const index = arguments_.indexOf(flag);
  if (index === -1) return undefined;
  const value = arguments_[index + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`${flag}へ値が必要です`);
  return value;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arguments_ = process.argv.slice(2);
  const report = await checkReleaseContinuity(
    process.cwd(),
    modeFromArguments(arguments_),
    argumentValue(arguments_, '--report'),
  );
  console.log(
    `Release continuity OK: revision=${report.revision} ids=${String(report.persistentIds)} courses=${String(report.migratedCourses)} drafts=${String(report.migratedDrafts)} notices=${String(report.resetNotices)}`,
  );
}
