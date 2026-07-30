/** Course教材revisionに追随して、進捗とDraft内の参照IDを純粋変換する。 */
import type {
  ContentProgressMigration,
  CourseManifest,
  ProgressMigrationStep,
} from '../content/types';
import type {
  CourseProgress,
  ExerciseDraft,
  LessonProgress,
  ProgressRepository,
  QuarantinedProgress,
  RepositorySnapshot,
} from './contracts';
import { canonicalJson } from './canonicalJson';

export type ContentMigrationEntity = ProgressMigrationStep['entity'];
type ProgressEntity = ContentMigrationEntity;
type StoredValidationCheck = ExerciseDraft['validationHistory'][number]['checks'][number];

export interface ContentMigrationNotice {
  readonly id: string;
  readonly courseId: string;
  readonly reason: string;
}

export interface ContentMigrationResetNotice extends ContentMigrationNotice {
  readonly entity: ContentMigrationEntity;
  readonly sourceId: string;
}

interface MigrationOptions {
  readonly now?: () => string;
  readonly id?: () => string;
}

export interface ContentMigrationOutcome {
  readonly snapshot: RepositorySnapshot;
  readonly notices: readonly ContentMigrationResetNotice[];
}

export interface SnapshotMigrationOptions {
  readonly requireRegisteredCourses?: boolean;
}

interface MigrationContext {
  readonly migration: ContentProgressMigration;
  readonly quarantine: (
    entity: ProgressEntity,
    sourceId: string,
    reason: string,
    raw: unknown,
  ) => void;
}

type ResolvedReference =
  | { readonly kind: 'value'; readonly id: string }
  | { readonly kind: 'reset'; readonly reason: string };

/** migration stepをentityと旧IDで一意に検索できるMapへ変換する。 */
function actionMap(
  migration: ContentProgressMigration,
): ReadonlyMap<string, ProgressMigrationStep> {
  return new Map(
    migration.steps.map((step) => [
      `${step.entity}:${step.action === 'map-to' ? step.fromId : step.id}`,
      step,
    ]),
  );
}

/** 未宣言IDを暗黙preserveし、宣言済み参照をmap/resetへ解決する。 */
function resolveReference(
  actions: ReadonlyMap<string, ProgressMigrationStep>,
  entity: ProgressEntity,
  id: string,
): ResolvedReference {
  const action = actions.get(`${entity}:${id}`);
  if (action === undefined || action.action === 'preserve') return { kind: 'value', id };
  if (action.action === 'map-to') return { kind: 'value', id: action.toId };
  return { kind: 'reset', reason: action.reason };
}

/** evidence配列をmap/resetし、map後の重複を衝突として拒否する。 */
function migrateIdList(
  values: readonly string[],
  entity: ProgressEntity,
  actions: ReadonlyMap<string, ProgressMigrationStep>,
  context: MigrationContext,
): readonly string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const sourceId of values) {
    const resolved = resolveReference(actions, entity, sourceId);
    if (resolved.kind === 'reset') {
      context.quarantine(entity, sourceId, resolved.reason, sourceId);
      continue;
    }
    if (seen.has(resolved.id)) {
      throw new Error(`${entity} evidenceのmap先が衝突しました: ${resolved.id}`);
    }
    seen.add(resolved.id);
    result.push(resolved.id);
  }
  return result;
}

/** optional scalar参照をmap/resetし、reset時はproperty除去を表すundefinedを返す。 */
function migrateOptionalId(
  value: string | undefined,
  entity: ProgressEntity,
  actions: ReadonlyMap<string, ProgressMigrationStep>,
  context: MigrationContext,
): string | undefined {
  if (value === undefined) return undefined;
  const resolved = resolveReference(actions, entity, value);
  if (resolved.kind === 'value') return resolved.id;
  context.quarantine(entity, value, resolved.reason, value);
  return undefined;
}

/** LessonProgress内部のSlide・Exercise・Checklist・Rule evidenceを移行する。 */
function migrateLessonProgress(
  lesson: LessonProgress,
  lessonId: string,
  actions: ReadonlyMap<string, ProgressMigrationStep>,
  context: MigrationContext,
): LessonProgress {
  const currentSlideId = migrateOptionalId(lesson.currentSlideId, 'slide', actions, context);
  const passedExerciseIds = migrateIdList(lesson.passedExerciseIds, 'exercise', actions, context);
  const passedChecklistItemIds = migrateIdList(
    lesson.passedChecklistItemIds,
    'checklist',
    actions,
    context,
  );
  const passedRuleIds = migrateIdList(lesson.passedRuleIds, 'rule', actions, context);
  const completionEvidenceReset =
    passedExerciseIds.length !== lesson.passedExerciseIds.length ||
    passedChecklistItemIds.length !== lesson.passedChecklistItemIds.length ||
    passedRuleIds.length !== lesson.passedRuleIds.length;
  return {
    lessonId,
    viewedSlideIds: migrateIdList(lesson.viewedSlideIds, 'slide', actions, context),
    ...(currentSlideId === undefined ? {} : { currentSlideId }),
    passedExerciseIds,
    passedChecklistItemIds,
    passedRuleIds,
    passedViewportIds: lesson.passedViewportIds,
    currentComplete: completionEvidenceReset ? false : lesson.currentComplete,
    ...(completionEvidenceReset || lesson.firstCompletedAt === undefined
      ? {}
      : { firstCompletedAt: lesson.firstCompletedAt }),
  };
}

/** CourseProgressのLesson record keyと現在地を単一revision分移行する。 */
function migrateCourseStep(
  progress: CourseProgress,
  migration: ContentProgressMigration,
  context: MigrationContext,
): CourseProgress {
  const actions = actionMap(migration);
  const lessons: Record<string, LessonProgress> = {};
  let completionInvalidated = false;
  for (const [sourceKey, lesson] of Object.entries(progress.lessons)) {
    const keyReference = resolveReference(actions, 'lesson', sourceKey);
    const idReference = resolveReference(actions, 'lesson', lesson.lessonId);
    if (keyReference.kind === 'reset') {
      context.quarantine('lesson', sourceKey, keyReference.reason, lesson);
      completionInvalidated ||= lesson.currentComplete;
      continue;
    }
    if (idReference.kind === 'reset') {
      context.quarantine('lesson', lesson.lessonId, idReference.reason, lesson);
      completionInvalidated ||= lesson.currentComplete;
      continue;
    }
    if (keyReference.id !== idReference.id) {
      throw new Error(`Lesson keyとlessonIdの移行先が一致しません: ${sourceKey}`);
    }
    if (Object.hasOwn(lessons, keyReference.id)) {
      throw new Error(`Lesson keyのmap先が衝突しました: ${keyReference.id}`);
    }
    const migratedLesson = migrateLessonProgress(lesson, keyReference.id, actions, context);
    completionInvalidated ||= lesson.currentComplete && !migratedLesson.currentComplete;
    lessons[keyReference.id] = migratedLesson;
  }

  const currentLessonId = migrateOptionalId(progress.currentLessonId, 'lesson', actions, context);
  const currentChapterId = migrateOptionalId(
    progress.currentChapterId,
    'chapter',
    actions,
    context,
  );
  return {
    courseId: progress.courseId,
    contentRevision: migration.toRevision,
    lessons,
    ...(currentLessonId === undefined ? {} : { currentLessonId }),
    ...(currentChapterId === undefined ? {} : { currentChapterId }),
    currentComplete: completionInvalidated ? false : progress.currentComplete,
    ...(completionInvalidated || progress.firstCompletedAt === undefined
      ? {}
      : { firstCompletedAt: progress.firstCompletedAt }),
    updatedAt: progress.updatedAt,
  };
}

/** Validation check内のRule・Hint・Slide参照を移行し、reset Ruleのcheckを除く。 */
function migrateValidationCheck(
  check: StoredValidationCheck,
  actions: ReadonlyMap<string, ProgressMigrationStep>,
  context: MigrationContext,
): StoredValidationCheck | undefined {
  const rule = resolveReference(actions, 'rule', check.ruleId);
  const hintId = migrateOptionalId(check.hintId, 'hint', actions, context);
  const relatedSlideId = migrateOptionalId(check.relatedSlideId, 'slide', actions, context);
  if (rule.kind === 'reset') {
    context.quarantine('rule', check.ruleId, rule.reason, check);
    return undefined;
  }
  return {
    ruleId: rule.id,
    requirementId: check.requirementId,
    label: check.label,
    required: check.required,
    passed: check.passed,
    requirementPassed: check.requirementPassed,
    message: check.message,
    expected: check.expected,
    actual: check.actual,
    nextAction: check.nextAction,
    ...(hintId === undefined ? {} : { hintId }),
    ...(relatedSlideId === undefined ? {} : { relatedSlideId }),
  };
}

/** 単一評価結果のRule evidenceを移行し、同一Ruleへのmap衝突を拒否する。 */
function migrateValidationChecks(
  checks: readonly StoredValidationCheck[],
  actions: ReadonlyMap<string, ProgressMigrationStep>,
  context: MigrationContext,
): readonly StoredValidationCheck[] {
  const result: StoredValidationCheck[] = [];
  const seenRuleIds = new Set<string>();
  for (const check of checks) {
    const migrated = migrateValidationCheck(check, actions, context);
    if (migrated === undefined) continue;
    if (seenRuleIds.has(migrated.ruleId)) {
      throw new Error(`Validation check evidenceのmap先が衝突しました: ${migrated.ruleId}`);
    }
    seenRuleIds.add(migrated.ruleId);
    result.push(migrated);
  }
  return result;
}

/** Validation historyのExercise参照と各check参照を移行する。 */
function migrateValidationHistory(
  history: ExerciseDraft['validationHistory'],
  actions: ReadonlyMap<string, ProgressMigrationStep>,
  context: MigrationContext,
): ExerciseDraft['validationHistory'] {
  return history.flatMap((result) => {
    const exercise = resolveReference(actions, 'exercise', result.exerciseId);
    if (exercise.kind === 'reset') {
      context.quarantine('exercise', result.exerciseId, exercise.reason, result);
      return [];
    }
    return [
      {
        ...result,
        exerciseId: exercise.id,
        checks: migrateValidationChecks(result.checks, actions, context),
      },
    ];
  });
}

/** lastPassingSnapshotsのExercise keyを移行し、snapshot revisionも同じedgeへ進める。 */
function migratePassingSnapshots(
  snapshots: ExerciseDraft['lastPassingSnapshots'],
  actions: ReadonlyMap<string, ProgressMigrationStep>,
  context: MigrationContext,
): ExerciseDraft['lastPassingSnapshots'] {
  const result: Record<string, ExerciseDraft['lastPassingSnapshots'][string]> = {};
  for (const [sourceId, snapshot] of Object.entries(snapshots)) {
    const exercise = resolveReference(actions, 'exercise', sourceId);
    if (exercise.kind === 'reset') {
      context.quarantine('exercise', sourceId, exercise.reason, snapshot);
      continue;
    }
    if (Object.hasOwn(result, exercise.id)) {
      throw new Error(`passing snapshotのmap先が衝突しました: ${exercise.id}`);
    }
    result[exercise.id] = { ...snapshot, contentRevision: context.migration.toRevision };
  }
  return result;
}

/** Draftの必須Lesson・Exercise・Workspaceと全履歴参照を単一revision分移行する。 */
function migrateDraftStep(
  draft: ExerciseDraft,
  migration: ContentProgressMigration,
  context: MigrationContext,
): ExerciseDraft | undefined {
  const actions = actionMap(migration);
  const lesson = resolveReference(actions, 'lesson', draft.lessonId);
  const exercise = resolveReference(actions, 'exercise', draft.exerciseId);
  const workspace = resolveReference(actions, 'workspace', draft.workspaceId);
  if (lesson.kind === 'reset') {
    context.quarantine('lesson', draft.lessonId, lesson.reason, draft);
    return undefined;
  }
  if (exercise.kind === 'reset') {
    context.quarantine('exercise', draft.exerciseId, exercise.reason, draft);
    return undefined;
  }
  if (workspace.kind === 'reset') {
    context.quarantine('workspace', draft.workspaceId, workspace.reason, draft);
    return undefined;
  }

  const reviewSlideId = migrateOptionalId(draft.reviewSlideId, 'slide', actions, context);
  return {
    courseId: draft.courseId,
    lessonId: lesson.id,
    exerciseId: exercise.id,
    workspaceId: workspace.id,
    contentRevision: migration.toRevision,
    editRevision: draft.editRevision,
    files: draft.files,
    selectedFile: draft.selectedFile,
    cursors: draft.cursors,
    validationHistory: migrateValidationHistory(draft.validationHistory, actions, context),
    revealedHintIds: migrateIdList(draft.revealedHintIds, 'hint', actions, context),
    ...(reviewSlideId === undefined ? {} : { reviewSlideId }),
    ...(draft.reviewScrollOffset === undefined
      ? {}
      : { reviewScrollOffset: draft.reviewScrollOffset }),
    lastPassingSnapshots: migratePassingSnapshots(draft.lastPassingSnapshots, actions, context),
    updatedAt: draft.updatedAt,
  };
}

/** stored revisionから現行revisionまでの連続edgeを求め、未知・欠落・cycleを拒否する。 */
function migrationPath(
  course: CourseManifest,
  storedRevision: string,
): readonly ContentProgressMigration[] {
  if (storedRevision === course.revision) return [];
  const byFrom = new Map(
    course.progressMigrations.map((migration) => [migration.fromRevision, migration]),
  );
  const path: ContentProgressMigration[] = [];
  const seen = new Set<string>();
  let revision = storedRevision;
  while (revision !== course.revision) {
    if (seen.has(revision)) throw new Error(`教材migration chainが循環しています: ${revision}`);
    seen.add(revision);
    const migration = byFrom.get(revision);
    if (migration === undefined) {
      const knownRevision = course.progressMigrations.some(
        ({ fromRevision, toRevision }) =>
          fromRevision === storedRevision || toRevision === storedRevision,
      );
      throw new Error(
        knownRevision
          ? `教材migration chainが欠落しています: ${revision} -> ${course.revision}`
          : `未知またはfutureの教材revisionです: ${storedRevision}`,
      );
    }
    path.push(migration);
    revision = migration.toRevision;
  }
  return path;
}

/** Course registry、純粋migration、通常load時のbackup-first置換を調停する。 */
export class ContentProgressMigrationService {
  readonly #courses = new Map<string, CourseManifest>();
  readonly #now: () => string;
  readonly #id: () => string;

  /** Repositoryと時刻・ID生成依存を保持し、登録までは永続状態を変更しない。 */
  constructor(
    private readonly repository: ProgressRepository,
    options: MigrationOptions = {},
  ) {
    this.#now = options.now ?? (() => new Date().toISOString());
    this.#id = options.id ?? (() => crypto.randomUUID());
  }

  /** 検証済みCourse ManifestをID別registryへ登録する。 */
  registerCourse(course: CourseManifest): void {
    const registered = this.#courses.get(course.id);
    if (registered !== undefined && registered.revision !== course.revision) {
      throw new Error(`同じCourse IDへ異なるrevisionを再登録できません: ${course.id}`);
    }
    this.#courses.set(course.id, course);
  }

  /** 登録済みCourseを純粋変換し、隔離recordとCourse別noticeを同時に組み立てる。 */
  #transformSnapshot(snapshot: RepositorySnapshot): ContentMigrationOutcome {
    const additions: QuarantinedProgress[] = [];
    const notices: ContentMigrationResetNotice[] = [];
    let quarantineSequence = 0;
    const quarantineFor =
      (courseId: string) =>
      (entity: ProgressEntity, sourceId: string, reason: string, raw: unknown): void => {
        quarantineSequence += 1;
        const record: QuarantinedProgress = {
          id: `${this.#id()}-${String(quarantineSequence)}`,
          reason: `教材移行で${entity}:${sourceId}をresetしました: ${reason}`,
          quarantinedAt: this.#now(),
          raw,
        };
        additions.push(record);
        notices.push({
          id: record.id,
          courseId,
          entity,
          sourceId,
          reason: record.reason,
        });
      };

    const courses: Record<string, CourseProgress> = {};
    for (const [courseId, original] of Object.entries(snapshot.courses)) {
      const course = this.#courses.get(courseId);
      if (course === undefined) {
        courses[courseId] = original;
        continue;
      }
      let migrated = original;
      for (const migration of migrationPath(course, original.contentRevision)) {
        const context: MigrationContext = {
          migration,
          quarantine: quarantineFor(courseId),
        };
        migrated = migrateCourseStep(migrated, migration, context);
      }
      courses[courseId] = migrated;
    }

    const drafts: Record<string, ExerciseDraft> = {};
    for (const draft of Object.values(snapshot.drafts)) {
      const course = this.#courses.get(draft.courseId);
      let migrated: ExerciseDraft | undefined = draft;
      if (course !== undefined) {
        for (const migration of migrationPath(course, draft.contentRevision)) {
          if (migrated === undefined) break;
          const context: MigrationContext = {
            migration,
            quarantine: quarantineFor(draft.courseId),
          };
          migrated = migrateDraftStep(migrated, migration, context);
        }
      }
      if (migrated === undefined) continue;
      const targetKey = `${migrated.courseId}:${migrated.workspaceId}`;
      if (Object.hasOwn(drafts, targetKey)) {
        throw new Error(`Draft keyのmap先が衝突しました: ${targetKey}`);
      }
      drafts[targetKey] = migrated;
    }

    return {
      snapshot: {
        schemaVersion: snapshot.schemaVersion,
        courses,
        drafts,
        quarantined: [...snapshot.quarantined, ...additions],
      },
      notices,
    };
  }

  /** Import対象のCourseとDraftがすべて検証済みManifestへ登録済みか確認する。 */
  #assertRegisteredCourses(snapshot: RepositorySnapshot): void {
    const referencedCourseIds = new Set([
      ...Object.keys(snapshot.courses),
      ...Object.values(snapshot.courses).map(({ courseId }) => courseId),
      ...Object.values(snapshot.drafts).map(({ courseId }) => courseId),
    ]);
    const missing = [...referencedCourseIds]
      .filter((courseId) => !this.#courses.has(courseId))
      .sort();
    if (missing.length > 0) {
      throw new Error(`Import対象に未登録Course: ${missing.join(', ')}`);
    }
  }

  /** snapshotを変更せずreset noticeとともに移行する。 */
  async migrateSnapshotWithNotices(
    snapshot: RepositorySnapshot,
    options: SnapshotMigrationOptions = {},
  ): Promise<ContentMigrationOutcome> {
    if (options.requireRegisteredCourses === true) {
      this.#assertRegisteredCourses(snapshot);
    }
    return this.#transformSnapshot(snapshot);
  }

  /** 登録済みCourseだけを対象にsnapshot全体を変換し、入力は変更しない。 */
  async migrateSnapshot(snapshot: RepositorySnapshot): Promise<RepositorySnapshot> {
    return (await this.migrateSnapshotWithNotices(snapshot)).snapshot;
  }

  /** 通常load時にCourseを登録・移行し、変更時だけbackup-firstで全snapshotを置換する。 */
  async ensureStoredCourse(course: CourseManifest): Promise<readonly ContentMigrationNotice[]> {
    this.registerCourse(course);
    const current = await this.repository.snapshot();
    const { snapshot: migrated, notices } = this.#transformSnapshot(current);
    if (canonicalJson(current) === canonicalJson(migrated)) return [];

    await this.repository.replaceSnapshotWithBackup(migrated, 'recovery');
    return notices;
  }
}
