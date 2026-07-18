/** version付き永続recordを深く検証し、schema v2へ移行または隔離する。 */
import { z } from 'zod';
import {
  CURRENT_PROGRESS_SCHEMA_VERSION,
  type CourseProgress,
  type ExerciseDraft,
  type QuarantinedProgress,
  type RepositorySnapshot,
} from '../../../core/persistence/contracts';

const NonEmptyString = z.string().min(1);
const StringList = z.array(z.string());
const NonNegativeInteger = z.number().int().nonnegative();

const RunnerDiagnosticSchema = z
  .object({
    code: z.string(),
    kind: z.enum(['syntax', 'reference', 'security', 'system']),
    severity: z.enum(['warning', 'error']),
    message: z.string(),
    learnerMessage: z.string(),
    file: z.string().optional(),
    line: NonNegativeInteger.optional(),
    column: NonNegativeInteger.optional(),
  })
  .strict();

const ValidationCheckSchema = z
  .object({
    ruleId: z.string(),
    requirementId: z.string(),
    label: z.string(),
    required: z.boolean(),
    passed: z.boolean(),
    requirementPassed: z.boolean(),
    message: z.string(),
    expected: z.string(),
    actual: z.string(),
    nextAction: z.string(),
    hintId: z.string().optional(),
    relatedSlideId: z.string().optional(),
  })
  .strict();

const ValidationResultSchema = z
  .object({
    exerciseId: NonEmptyString,
    executionRevision: NonNegativeInteger.nullable(),
    status: z.enum(['pass', 'incomplete', 'code-error', 'system-error']),
    checks: z.array(ValidationCheckSchema),
    passedRequirementIds: StringList,
    diagnostics: z.array(RunnerDiagnosticSchema),
    evaluatedAt: NonEmptyString,
  })
  .strict();

const LessonProgressSchema = z
  .object({
    lessonId: NonEmptyString,
    viewedSlideIds: StringList,
    currentSlideId: z.string().optional(),
    passedExerciseIds: StringList,
    passedChecklistItemIds: StringList,
    passedRuleIds: StringList,
    passedViewportIds: StringList,
    currentComplete: z.boolean(),
    firstCompletedAt: z.string().optional(),
  })
  .strict();

const CourseProgressSchema = z
  .object({
    courseId: NonEmptyString,
    contentRevision: NonEmptyString,
    lessons: z.record(z.string(), LessonProgressSchema),
    currentLessonId: z.string().optional(),
    currentChapterId: z.string().optional(),
    currentComplete: z.boolean(),
    firstCompletedAt: z.string().optional(),
    updatedAt: NonEmptyString,
  })
  .strict();

const CursorSchema = z.object({ anchor: NonNegativeInteger, head: NonNegativeInteger }).strict();

const PassingSnapshotSchema = z
  .object({
    editRevision: NonNegativeInteger,
    contentRevision: NonEmptyString,
    files: z.record(z.string(), z.string()),
    evaluatedAt: NonEmptyString,
  })
  .strict();

const DraftV2Schema = z
  .object({
    courseId: NonEmptyString,
    lessonId: NonEmptyString,
    exerciseId: NonEmptyString,
    workspaceId: NonEmptyString,
    contentRevision: NonEmptyString,
    editRevision: NonNegativeInteger,
    files: z.record(z.string(), z.string()),
    selectedFile: NonEmptyString,
    cursors: z.record(z.string(), CursorSchema),
    validationHistory: z.array(ValidationResultSchema),
    revealedHintIds: StringList,
    reviewSlideId: z.string().optional(),
    reviewScrollOffset: NonNegativeInteger.optional(),
    lastPassingSnapshots: z.record(z.string(), PassingSnapshotSchema),
    updatedAt: NonEmptyString,
  })
  .strict()
  .refine(({ files, selectedFile }) => Object.hasOwn(files, selectedFile), {
    message: 'selectedFileがfilesに存在しません',
  })
  .refine(
    ({ exerciseId, validationHistory }) =>
      validationHistory.every((result) => result.exerciseId === exerciseId),
    { message: 'validationHistoryのexerciseIdが一致しません' },
  );

const DraftV1Schema = z
  .object({
    courseId: NonEmptyString,
    lessonId: NonEmptyString,
    exerciseId: NonEmptyString,
    workspaceId: NonEmptyString.optional(),
    contentRevision: NonEmptyString,
    files: z.record(z.string(), z.string()),
    selectedFile: NonEmptyString,
    cursorOffset: NonNegativeInteger.optional(),
    validationHistory: z.array(ValidationResultSchema),
    revealedHintIds: StringList,
    reviewSlideId: z.string().optional(),
    reviewScrollOffset: NonNegativeInteger.optional(),
    updatedAt: NonEmptyString,
  })
  .strict()
  .refine(({ files, selectedFile }) => Object.hasOwn(files, selectedFile), {
    message: 'selectedFileがfilesに存在しません',
  })
  .refine(
    ({ exerciseId, validationHistory }) =>
      validationHistory.every((result) => result.exerciseId === exerciseId),
    { message: 'validationHistoryのexerciseIdが一致しません' },
  );

const QuarantinedProgressSchema = z
  .object({
    id: NonEmptyString,
    reason: NonEmptyString,
    quarantinedAt: NonEmptyString,
    raw: z.unknown(),
  })
  .strict()
  .refine((record) => Object.hasOwn(record, 'raw'), {
    message: 'raw fieldが存在しません',
  });

/** 配列ではないobjectだけをkey付きcollectionとして扱う。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Zod検証済みのobject cloneだけを返し、呼び出し側で契約型へ限定する。 */
function parseValidated(schema: z.ZodType, value: unknown): object | null {
  const result = schema.safeParse(value);
  return result.success ? (result.data as object) : null;
}

/** Course内Lessonのstored keyとrecord IDが一致することを検証する。 */
function hasConsistentLessonKeys(course: CourseProgress): boolean {
  return Object.entries(course.lessons).every(([key, lesson]) => lesson.lessonId === key);
}

/** 解釈不能なrecordを元値ごと保持する隔離recordへ変換する。 */
function quarantineRecord(reason: string, raw: unknown, now: string): QuarantinedProgress {
  return { id: crypto.randomUUID(), reason, quarantinedAt: now, raw };
}

/** schema v1 Draftを全field検証後にschema v2へ変換する。 */
function migrateDraftV1(value: unknown, storedKey: string): ExerciseDraft | null {
  const parsed = parseValidated(DraftV1Schema, value) as z.infer<typeof DraftV1Schema> | null;
  if (!parsed) return null;
  const workspaceId = parsed.workspaceId ?? storedKey.split(':').slice(1).join(':');
  if (!workspaceId || storedKey !== `${parsed.courseId}:${workspaceId}`) return null;
  const cursorOffset = parsed.cursorOffset ?? 0;
  const validationHistory = parsed.validationHistory as ExerciseDraft['validationHistory'];
  const lastValidation = validationHistory.at(-1);

  return {
    courseId: parsed.courseId,
    lessonId: parsed.lessonId,
    exerciseId: parsed.exerciseId,
    workspaceId,
    contentRevision: parsed.contentRevision,
    editRevision: 0,
    files: parsed.files,
    selectedFile: parsed.selectedFile,
    cursors: {
      [parsed.selectedFile]: { anchor: cursorOffset, head: cursorOffset },
    },
    validationHistory,
    revealedHintIds: parsed.revealedHintIds,
    ...(parsed.reviewSlideId === undefined ? {} : { reviewSlideId: parsed.reviewSlideId }),
    ...(parsed.reviewScrollOffset === undefined
      ? {}
      : { reviewScrollOffset: parsed.reviewScrollOffset }),
    lastPassingSnapshots:
      lastValidation?.status === 'pass'
        ? {
            [parsed.exerciseId]: {
              editRevision: 0,
              contentRevision: parsed.contentRevision,
              files: parsed.files,
              evaluatedAt: lastValidation.evaluatedAt,
            },
          }
        : {},
    updatedAt: parsed.updatedAt,
  };
}

/** schema v2 Draftを深く検証し、stored keyとの不一致も拒否する。 */
function parseDraftV2(value: unknown, storedKey: string): ExerciseDraft | null {
  const parsed = parseValidated(DraftV2Schema, value) as ExerciseDraft | null;
  return parsed && storedKey === `${parsed.courseId}:${parsed.workspaceId}` ? parsed : null;
}

/** 永続snapshotを逐次移行し、解釈不能な個別recordを通常dataから隔離する。 */
export function migrateRepositorySnapshot(raw: unknown, now: string): RepositorySnapshot {
  if (!isRecord(raw)) {
    throw new Error('進捗データのルートがオブジェクトではありません');
  }
  const schemaVersion = raw.schemaVersion;
  if (schemaVersion !== 1 && schemaVersion !== CURRENT_PROGRESS_SCHEMA_VERSION) {
    throw new Error(`未対応の進捗schemaVersionです: ${String(schemaVersion)}`);
  }
  if (!isRecord(raw.courses)) throw new Error('coursesがオブジェクトではありません');
  if (!isRecord(raw.drafts)) throw new Error('draftsがオブジェクトではありません');

  const courses: Record<string, CourseProgress> = {};
  const drafts: Record<string, ExerciseDraft> = {};
  const quarantined: QuarantinedProgress[] = [];

  for (const [key, value] of Object.entries(raw.courses)) {
    const course = parseValidated(CourseProgressSchema, value) as CourseProgress | null;
    if (course && course.courseId === key && hasConsistentLessonKeys(course)) {
      courses[key] = course;
    } else {
      quarantined.push(quarantineRecord(`CourseProgress ${key} を解釈できません`, value, now));
    }
  }

  for (const [key, value] of Object.entries(raw.drafts)) {
    const draft = schemaVersion === 1 ? migrateDraftV1(value, key) : parseDraftV2(value, key);
    if (draft) {
      drafts[key] = draft;
    } else {
      quarantined.push(quarantineRecord(`ExerciseDraft ${key} を解釈できません`, value, now));
    }
  }

  if (schemaVersion === CURRENT_PROGRESS_SCHEMA_VERSION) {
    if (!Array.isArray(raw.quarantined)) {
      throw new Error('quarantinedが配列ではありません');
    }
    for (const value of raw.quarantined) {
      const record = parseValidated(QuarantinedProgressSchema, value) as QuarantinedProgress | null;
      quarantined.push(
        record ?? quarantineRecord('QuarantinedProgressを解釈できません', value, now),
      );
    }
  }

  return {
    schemaVersion: CURRENT_PROGRESS_SCHEMA_VERSION,
    courses,
    drafts,
    quarantined,
  };
}
