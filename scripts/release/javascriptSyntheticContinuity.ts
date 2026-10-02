import type { CourseManifest, ContentProgressMigration } from '../../src/core/content/types';
import { canonicalJson } from '../../src/core/persistence/canonicalJson';
import { ContentProgressMigrationService } from '../../src/core/persistence/contentProgressMigration';
import type { ContentMigrationResetNotice } from '../../src/core/persistence/contentProgressMigration';
import type {
  ExerciseDraft,
  ProgressBundle,
  ProgressRepository,
  RepositorySnapshot,
} from '../../src/core/persistence/contracts';
import { migrateRepositorySnapshot } from '../../src/adapters/persistence/indexeddb/migrateProgress';
import { sha256Text } from './releaseHashes';

export interface JavascriptBoundaryProbe {
  readonly migration: ContentProgressMigration;
  readonly course: CourseManifest;
  readonly before: RepositorySnapshot;
  readonly after: RepositorySnapshot;
  readonly resetExerciseIds: readonly string[];
}

const syntheticQuarantinedAt = '2026-10-02T00:00:00.000Z';

/** revisionだけを進めて保持すべき全draft dataを比較する。内容/日時/履歴/カーソルを省略しない。 */
function stableDraftData(draft: ExerciseDraft): unknown {
  const ordinary = Object.fromEntries(
    Object.entries(draft).filter(
      ([key]) => key !== 'contentRevision' && key !== 'lastPassingSnapshots',
    ),
  );
  return {
    ...ordinary,
    lastPassingSnapshots: Object.fromEntries(
      Object.entries(draft.lastPassingSnapshots).map(([id, snapshot]) => [
        id,
        Object.fromEntries(Object.entries(snapshot).filter(([key]) => key !== 'contentRevision')),
      ]),
    ),
  };
}

/** 保存revisionから最初の対象reset edgeを辿り、欠落経路と循環を拒否する。 */
function firstResetMigration(
  course: CourseManifest,
  initialRevision: string,
  exerciseId: string,
): ContentProgressMigration {
  let revision = initialRevision;
  const seen = new Set<string>();
  while (revision !== course.revision) {
    if (seen.has(revision)) throw new Error(`synthetic reset経路が循環しています: ${revision}`);
    seen.add(revision);
    const migration = course.progressMigrations.find(
      ({ fromRevision }) => fromRevision === revision,
    );
    if (migration === undefined)
      throw new Error(`synthetic resetまでのmigration経路がありません: ${revision}`);
    if (
      migration.steps.some(
        (step) =>
          step.action === 'intentionally-reset' &&
          step.entity === 'exercise' &&
          step.id === exerciseId,
      )
    ) {
      return migration;
    }
    revision = migration.toRevision;
  }
  throw new Error(`synthetic初回reset edgeがありません: ${exerciseId}`);
}

/** 初期draftから最初のresetまでに進むrevisionだけを反映し、隔離時点の全draftを期待する。 */
function expectedQuarantinedDraft(course: CourseManifest, draft: ExerciseDraft): ExerciseDraft {
  const revision = firstResetMigration(
    course,
    draft.contentRevision,
    draft.exerciseId,
  ).fromRevision;
  if (revision === draft.contentRevision) return draft;
  return {
    ...draft,
    contentRevision: revision,
    lastPassingSnapshots: Object.fromEntries(
      Object.entries(draft.lastPassingSnapshots).map(([id, snapshot]) => [
        id,
        { ...snapshot, contentRevision: revision },
      ]),
    ),
  };
}

/** 移行前の各成功IDと全draftからrawを導出し、Noticeと新隔離recordを一対一で全値照合する。 */
function assertResetQuarantineComplete(
  probe: JavascriptBoundaryProbe,
  notices: readonly ContentMigrationResetNotice[],
): void {
  const { before, after, course, resetExerciseIds } = probe;
  const saved = before.courses.javascript;
  if (saved === undefined) throw new Error('移行前JS進捗がありません');
  const targets = new Set(resetExerciseIds);
  const required: { sourceId: string; raw: unknown; reason: string }[] = [];
  /** rawの初回reset reasonも宣言edgeから導出し、同じ値の別bindingを許可しない。 */
  const requireRaw = (sourceId: string, revision: string, raw: unknown): void => {
    const step = firstResetMigration(course, revision, sourceId).steps.find(
      (value) =>
        value.action === 'intentionally-reset' &&
        value.entity === 'exercise' &&
        value.id === sourceId,
    );
    if (step?.action !== 'intentionally-reset') throw new Error('synthetic reset stepがありません');
    required.push({
      sourceId,
      raw,
      reason: `教材移行でexercise:${sourceId}をresetしました: ${step.reason}`,
    });
  };
  for (const lesson of Object.values(saved.lessons)) {
    for (const id of lesson.passedExerciseIds) {
      if (targets.has(id)) requireRaw(id, saved.contentRevision, id);
    }
  }
  for (const draft of Object.values(before.drafts)) {
    if (draft.courseId === 'javascript' && targets.has(draft.exerciseId))
      requireRaw(draft.exerciseId, draft.contentRevision, expectedQuarantinedDraft(course, draft));
  }
  const additions = after.quarantined.slice(before.quarantined.length);
  const previousIds = new Set(before.quarantined.map(({ id }) => id));
  if (
    required.length === 0 ||
    additions.length !== required.length ||
    notices.length !== required.length ||
    new Set(additions.map(({ id }) => id)).size !== additions.length ||
    new Set(notices.map(({ id }) => id)).size !== notices.length ||
    additions.some(({ id }) => typeof id !== 'string' || id.length === 0 || previousIds.has(id))
  ) {
    throw new Error('reset raw/Noticeの件数・一意bindingが不一致です');
  }
  for (const notice of notices) {
    const record = additions.find(({ id }) => id === notice.id);
    const index = required.findIndex(
      (value) =>
        value.sourceId === notice.sourceId &&
        canonicalJson(value.raw) === canonicalJson(record?.raw),
    );
    if (
      notice.courseId !== 'javascript' ||
      notice.entity !== 'exercise' ||
      record === undefined ||
      index < 0 ||
      record.reason !== required[index]?.reason ||
      notice.reason !== record.reason ||
      record.quarantinedAt !== syntheticQuarantinedAt
    ) {
      throw new Error('reset raw/Noticeの全文値・quarantine id bindingが不一致です');
    }
    required.splice(index, 1);
  }
}

/** synthetic seedにfresh boundaryを作る。学習persona状態へ呼び出すAPIではない。 */
export function createJavascriptBoundarySnapshot(
  course: CourseManifest,
  migration: ContentProgressMigration,
  seed: RepositorySnapshot,
): RepositorySnapshot {
  if (
    course.id !== 'javascript' ||
    migration.steps.some(
      ({ entity, action }) => entity !== 'exercise' || action !== 'intentionally-reset',
    )
  ) {
    throw new Error('JS boundary probeは現在のexercise-only reset契約に限定します');
  }
  const saved = seed.courses.javascript;
  if (saved === undefined) throw new Error('JS synthetic CourseProgressがありません');
  const resetIds = migration.steps.map((step) =>
    step.action === 'map-to' ? step.fromId : step.id,
  );
  if (new Set(resetIds).size !== resetIds.length)
    throw new Error('同一edgeのreset対象が重複しています');
  const drafts = Object.fromEntries(
    Object.entries(seed.drafts).map(([key, draft]) => [
      key,
      draft.courseId !== 'javascript'
        ? structuredClone(draft)
        : {
            ...structuredClone(draft),
            contentRevision: migration.fromRevision,
            lastPassingSnapshots: Object.fromEntries(
              Object.entries(draft.lastPassingSnapshots).map(([id, snapshot]) => [
                id,
                { ...structuredClone(snapshot), contentRevision: migration.fromRevision },
              ]),
            ),
          },
    ]),
  );
  const lessons = structuredClone(saved.lessons);
  for (const id of resetIds) {
    const draft = Object.values(drafts).find(
      ({ courseId, exerciseId }) => courseId === 'javascript' && exerciseId === id,
    );
    const current = course.phases
      .flatMap(({ chapters }) => chapters.flatMap(({ lessons }) => lessons))
      .find((lesson) => lesson.exercises.some(({ id: exerciseId }) => exerciseId === id));
    if (
      draft === undefined ||
      current === undefined ||
      draft.lessonId !== current.id ||
      Object.keys(draft.files).length === 0 ||
      Object.values(draft.files).some((text) => text.length === 0) ||
      draft.lastPassingSnapshots[id] === undefined ||
      !draft.validationHistory.some(
        (result) => result.exerciseId === id && result.status === 'pass',
      )
    ) {
      throw new Error(`syntheticに旧Source/成功snapshot/採点履歴がありません: ${id}`);
    }
    const lesson = lessons[current.id];
    if (
      lesson === undefined ||
      !lesson.passedExerciseIds.includes(id) ||
      !lesson.currentComplete ||
      lesson.firstCompletedAt === undefined
    )
      throw new Error(`fresh boundary成功証跡がありません: ${id}`);
  }
  return {
    ...structuredClone(seed),
    drafts,
    courses: {
      ...structuredClone(seed.courses),
      javascript: { ...structuredClone(saved), contentRevision: migration.fromRevision, lessons },
    },
  };
}

/** targetだけ失効し、旧source全体/日時を隔離へ保持することを実migrator結果で検査する。 */
function assertBoundaryPreserved(
  probe: JavascriptBoundaryProbe,
  notices: readonly ContentMigrationResetNotice[],
): void {
  const { before, after, resetExerciseIds } = probe;
  const beforeJavascript = before.courses.javascript;
  if (beforeJavascript === undefined) throw new Error('移行前JS進捗がありません');
  const expected = new Set(resetExerciseIds);
  if (
    after.courses.javascript?.contentRevision !== probe.course.revision ||
    Object.values(after.drafts).some(
      (draft) =>
        draft.courseId === 'javascript' &&
        (draft.contentRevision !== probe.course.revision ||
          Object.values(draft.lastPassingSnapshots).some(
            (snapshot) => snapshot.contentRevision !== probe.course.revision,
          )),
    )
  ) {
    throw new Error('JS移行後revisionがboundary/finalと一致しません');
  }
  const noticed = new Set(notices.map(({ sourceId }) => sourceId));
  if (noticed.size !== expected.size || [...expected].some((id) => !noticed.has(id))) {
    throw new Error('edge別reset Noticeのexact対象が不一致です');
  }
  for (const [courseId, progress] of Object.entries(before.courses)) {
    if (
      courseId !== 'javascript' &&
      canonicalJson(progress) !== canonicalJson(after.courses[courseId])
    ) {
      throw new Error('他Course進捗が変更されています');
    }
  }
  const affectedLessons = new Set<string>();
  let stableDraftCount = 0;
  let otherCourseDraftCount = 0;
  for (const [key, draft] of Object.entries(before.drafts)) {
    if (draft.courseId === 'javascript' && expected.has(draft.exerciseId)) {
      affectedLessons.add(draft.lessonId);
      const lesson = after.courses.javascript.lessons[draft.lessonId];
      const quarantinedDraft = expectedQuarantinedDraft(probe.course, draft);
      if (
        after.drafts[key] !== undefined ||
        lesson === undefined ||
        lesson.passedExerciseIds.includes(draft.exerciseId) ||
        lesson.currentComplete ||
        lesson.firstCompletedAt !== undefined ||
        lesson.passedChecklistItemIds.length !== 0 ||
        lesson.passedRuleIds.length !== 0 ||
        lesson.passedViewportIds.length !== 0 ||
        !after.quarantined.some(({ raw }) => canonicalJson(raw) === canonicalJson(quarantinedDraft))
      ) {
        throw new Error(`対象reset/旧Source全体隔離が未達です: ${draft.exerciseId}`);
      }
    } else {
      const preserved = after.drafts[key];
      if (
        preserved === undefined ||
        canonicalJson(stableDraftData(preserved)) !== canonicalJson(stableDraftData(draft))
      ) {
        throw new Error(`非対象draftのsource/履歴/日時が変更されています: ${key}`);
      }
      if (draft.courseId === 'javascript') stableDraftCount += 1;
      else {
        otherCourseDraftCount += 1;
        if (canonicalJson(preserved) !== canonicalJson(draft))
          throw new Error('他Course draftのrevisionが変更されています');
      }
    }
  }
  if (stableDraftCount === 0 || otherCourseDraftCount === 0)
    throw new Error('非対象/他Course draft保持のsynthetic対照がありません');
  for (const [id, lesson] of Object.entries(beforeJavascript.lessons)) {
    const migrated = after.courses.javascript.lessons[id];
    if (!affectedLessons.has(id) && canonicalJson(migrated) !== canonicalJson(lesson))
      throw new Error('非対象Lesson証跡が変更されています');
    if (
      affectedLessons.has(id) &&
      (canonicalJson(migrated?.viewedSlideIds) !== canonicalJson(lesson.viewedSlideIds) ||
        migrated?.currentSlideId !== lesson.currentSlideId ||
        canonicalJson(migrated?.passedExerciseIds) !==
          canonicalJson(lesson.passedExerciseIds.filter((exerciseId) => !expected.has(exerciseId))))
    ) {
      throw new Error('対象Lesson内の非対象Exercise/読書位置が変更されています');
    }
  }
  if (
    canonicalJson(after.quarantined.slice(0, before.quarantined.length)) !==
    canonicalJson(before.quarantined)
  ) {
    throw new Error('既存quarantineが変更されています');
  }
  assertResetQuarantineComplete(probe, notices);
}

/** 各非empty edgeでfreshな成功証跡を失効する。同じIDの先行edge結果を後続の証明へ流用しない。 */
export async function verifyJavascriptSyntheticBoundaries(
  course: CourseManifest,
  seed: RepositorySnapshot,
): Promise<readonly JavascriptBoundaryProbe[]> {
  const probes: JavascriptBoundaryProbe[] = [];
  for (const migration of course.progressMigrations.filter(({ steps }) => steps.length > 0)) {
    const before = createJavascriptBoundarySnapshot(course, migration, seed);
    const boundaryCourse = {
      ...course,
      revision: migration.toRevision,
      progressMigrations: course.progressMigrations.slice(
        0,
        course.progressMigrations.indexOf(migration) + 1,
      ),
    };
    const service = new ContentProgressMigrationService({} as ProgressRepository, {
      now: () => syntheticQuarantinedAt,
      id: () => `synthetic-${migration.fromRevision}-${migration.toRevision}`,
    });
    service.registerCourse(boundaryCourse);
    const outcome = await service.migrateSnapshotWithNotices(before);
    const resetExerciseIds = migration.steps.map((step) =>
      step.action === 'map-to' ? step.fromId : step.id,
    );
    const probe = {
      migration,
      course: boundaryCourse,
      before,
      after: outcome.snapshot,
      resetExerciseIds,
    };
    assertBoundaryPreserved(probe, outcome.notices);
    const second = await service.migrateSnapshotWithNotices(outcome.snapshot);
    if (
      canonicalJson(second.snapshot) !== canonicalJson(outcome.snapshot) ||
      second.notices.length > 0
    ) {
      throw new Error('JS boundary migrationが冪等ではありません');
    }
    probes.push(probe);
  }
  if (probes.length === 0) throw new Error('JS非empty migration edgeがありません');
  return probes;
}

/** integrity付きJS syntheticだけを受理し、各edgeと最古revisionからの全chainを別々に検証する。 */
export async function verifyJavascriptSyntheticProgressBundle(
  course: CourseManifest,
  input: unknown,
) {
  if (typeof input !== 'object' || input === null || Array.isArray(input))
    throw new Error('JS synthetic bundleがobjectではありません');
  const bundle = input as ProgressBundle;
  const { integrity, ...unsigned } = bundle as Omit<ProgressBundle, 'integrity'> & {
    readonly integrity?: { readonly algorithm?: string; readonly digest?: string };
  };
  if (
    integrity === undefined ||
    integrity.algorithm !== 'SHA-256' ||
    typeof integrity.digest !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(integrity.digest) ||
    sha256Text(canonicalJson(unsigned)) !== integrity.digest
  )
    throw new Error('JS synthetic integrity hashが一致しません');
  const seed = migrateRepositorySnapshot(unsigned, bundle.exportedAt);
  const first = course.progressMigrations[0];
  if (first === undefined || seed.courses.javascript?.contentRevision !== first.fromRevision) {
    throw new Error('JS全chain seedは最古のfromRevisionを持つ必要があります');
  }
  const probes = await verifyJavascriptSyntheticBoundaries(course, seed);
  const service = new ContentProgressMigrationService({} as ProgressRepository, {
    now: () => syntheticQuarantinedAt,
    id: () => 'synthetic-whole-chain',
  });
  service.registerCourse(course);
  const outcome = await service.migrateSnapshotWithNotices(seed);
  const allTargets = [...new Set(probes.flatMap(({ resetExerciseIds }) => resetExerciseIds))];
  assertBoundaryPreserved(
    {
      migration: first,
      course,
      before: seed,
      after: outcome.snapshot,
      resetExerciseIds: allTargets,
    },
    outcome.notices,
  );
  const second = await service.migrateSnapshotWithNotices(outcome.snapshot);
  if (
    canonicalJson(second.snapshot) !== canonicalJson(outcome.snapshot) ||
    second.notices.length > 0
  ) {
    throw new Error('JS全chain replayが冪等ではありません');
  }
  return {
    migratedCourses: Object.keys(outcome.snapshot.courses).length,
    migratedDrafts: Object.keys(outcome.snapshot.drafts).length,
    resetNotices: outcome.notices.length,
  };
}
