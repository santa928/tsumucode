// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { readFile } from 'node:fs/promises';
import { fixtureCourse } from '../fixtures/course';
import type { CourseManifest } from '../../src/core/content/types';
import type {
  ExerciseDraft,
  ProgressBundle,
  RepositorySnapshot,
  ProgressRepository,
} from '../../src/core/persistence/contracts';
import { ContentProgressMigrationService } from '../../src/core/persistence/contentProgressMigration';
import { canonicalJson } from '../../src/core/persistence/canonicalJson';
import { sha256Text } from '../../scripts/release/releaseHashes';
import {
  createJavascriptBoundarySnapshot,
  verifyJavascriptSyntheticBoundaries,
  verifyJavascriptSyntheticProgressBundle,
} from '../../scripts/release/javascriptSyntheticContinuity';
import { assertReleaseTagUnion } from '../../scripts/release/checkReleaseContinuity';
import { JavascriptPublishedReleaseSchema } from '../../scripts/release/javascriptReleaseSchema';
import { buildReleaseReport, parseReleaseReport } from '../../scripts/release/writeReleaseReport';
import {
  assertPublishedTagMessage,
  resolveRollbackRelease,
} from '../../scripts/release/verifyReleaseTarget';
import {
  validatePostDeployVerification,
  assertReleaseReportMatches,
} from '../../scripts/release/verifyReleasePromotion';

const hash = 'a'.repeat(64);
const source = 'b'.repeat(40);
const head = 'c'.repeat(40);
const earlier = 'd'.repeat(40);
const targetId = 'javascript-ch10-l01-e01';
const stableId = 'javascript-ch00-l01-e01';
const time = '2026-10-01T00:00:00Z';

/** 内容/採点を模倣しない移行契約のunit Course。実52教材の承認に使用しない。 */
function course(): CourseManifest {
  const base = fixtureCourse.phases[0]!.chapters[0]!.lessons[0]!;
  const lesson = (exerciseId: string) => ({
    ...structuredClone(base),
    id: exerciseId.slice(0, -4),
    exercises: [
      { ...structuredClone(base.exercises[0]!), id: exerciseId, workspaceId: exerciseId },
    ],
  });
  return {
    ...structuredClone(fixtureCourse),
    id: 'javascript',
    revision: '2026-10-02.93',
    progressMigrations: [
      {
        fromRevision: '2026-10-02.90',
        toRevision: '2026-10-02.91',
        steps: [
          {
            action: 'intentionally-reset',
            entity: 'exercise',
            id: targetId,
            reason: 'unit old3 edge',
          },
        ],
      },
      { fromRevision: '2026-10-02.91', toRevision: '2026-10-02.92', steps: [] },
      {
        fromRevision: '2026-10-02.92',
        toRevision: '2026-10-02.93',
        steps: [
          {
            action: 'intentionally-reset',
            entity: 'exercise',
            id: targetId,
            reason: 'unit new25 edge',
          },
        ],
      },
    ],
    phases: [
      {
        ...structuredClone(fixtureCourse.phases[0]!),
        chapters: [
          {
            ...structuredClone(fixtureCourse.phases[0]!.chapters[0]!),
            lessons: [lesson(targetId), lesson(stableId)],
          },
        ],
      },
    ],
  };
}

/** 全source/snapshot/履歴/日時を持つsynthetic。persona状態へ注入しない。 */
function seed(): RepositorySnapshot {
  const draft = (exerciseId: string, courseId = 'javascript'): ExerciseDraft => ({
    courseId,
    lessonId: exerciseId.slice(0, -4),
    exerciseId,
    workspaceId: exerciseId,
    contentRevision: '2026-10-02.90',
    editRevision: 7,
    files: { 'script.js': '// synthetic old source: ' + exerciseId },
    selectedFile: 'script.js',
    cursors: { 'script.js': { anchor: 2, head: 7 } },
    validationHistory: [
      {
        exerciseId,
        executionRevision: 7,
        status: 'pass',
        checks: [],
        passedRequirementIds: [exerciseId + '-r01'],
        diagnostics: [],
        evaluatedAt: time,
      },
    ],
    revealedHintIds: [exerciseId + '-h01'],
    reviewScrollOffset: 27,
    lastPassingSnapshots: {
      [exerciseId]: {
        editRevision: 7,
        contentRevision: '2026-10-02.90',
        files: { 'script.js': '// synthetic previous passing source' },
        evaluatedAt: time,
      },
    },
    updatedAt: time,
  });
  const drafts = [draft(targetId), draft(stableId), draft('html-css-ch00-l01-e01', 'html-css')];
  const lessons = Object.fromEntries(
    [targetId, stableId].map((exerciseId) => [
      exerciseId.slice(0, -4),
      {
        lessonId: exerciseId.slice(0, -4),
        viewedSlideIds: [exerciseId + '-s01'],
        currentSlideId: exerciseId + '-s01',
        passedExerciseIds: [exerciseId],
        passedChecklistItemIds: [exerciseId + '-checklist'],
        passedRuleIds: [exerciseId + '-r01'],
        passedViewportIds: ['desktop-1280'],
        currentComplete: true,
        firstCompletedAt: time,
      },
    ]),
  );
  return {
    schemaVersion: 2,
    courses: {
      javascript: {
        courseId: 'javascript',
        contentRevision: '2026-10-02.90',
        lessons,
        currentComplete: true,
        firstCompletedAt: time,
        updatedAt: time,
      },
      'html-css': {
        courseId: 'html-css',
        contentRevision: '2026-07-29.1',
        lessons: {},
        currentComplete: false,
        updatedAt: time,
      },
    },
    drafts: Object.fromEntries(
      drafts.map((value) => [`${value.courseId}:${value.workspaceId}`, value]),
    ),
    quarantined: [],
  };
}
function bundle(): ProgressBundle {
  const unsigned = { ...seed(), appVersion: 'synthetic-unit-only', exportedAt: time };
  return {
    ...unsigned,
    integrity: { algorithm: 'SHA-256', digest: sha256Text(canonicalJson(unsigned)) },
  };
}

/** 最初のreset前にも空edgeがある実revision契約のsynthetic Unit。後段edgeは別freshで検査する。 */
function delayedResetFixture(): { current: CourseManifest; input: ProgressBundle } {
  const oldest = '2026-08-02.1';
  const old5Id = 'javascript-ch01-l03-e01';
  const new25Id = 'javascript-ch01-l01-e01';
  const current = structuredClone(course());
  const template = current.phases[0]!.chapters[0]!.lessons[0]!;
  const additionalLessons = [old5Id, new25Id].map((id) => ({
    ...structuredClone(template),
    id: id.slice(0, -4),
    exercises: [{ ...structuredClone(template.exercises[0]!), id, workspaceId: id }],
  }));
  const reset = (id: string) => ({
    action: 'intentionally-reset' as const,
    entity: 'exercise' as const,
    id,
    reason: 'synthetic revision progression contract',
  });
  const revised: CourseManifest = {
    ...current,
    revision: '2026-10-02.4',
    phases: current.phases.map((phase) => ({
      ...phase,
      chapters: phase.chapters.map((chapter) => ({
        ...chapter,
        lessons: [...chapter.lessons, ...additionalLessons],
      })),
    })),
    progressMigrations: [
      { fromRevision: oldest, toRevision: '2026-09-28.19', steps: [] },
      { fromRevision: '2026-09-28.19', toRevision: '2026-10-02.1', steps: [reset(targetId)] },
      { fromRevision: '2026-10-02.1', toRevision: '2026-10-02.2', steps: [reset(old5Id)] },
      { fromRevision: '2026-10-02.2', toRevision: '2026-10-02.3', steps: [] },
      {
        fromRevision: '2026-10-02.3',
        toRevision: '2026-10-02.4',
        steps: [reset(targetId), reset(new25Id)],
      },
    ],
  };
  const original = seed();
  const templateDraft = original.drafts['javascript:' + targetId]!;
  const templateLesson = original.courses.javascript!.lessons[templateDraft.lessonId]!;
  const additionalDrafts = [old5Id, new25Id].map((id) => ({
    ...structuredClone(templateDraft),
    exerciseId: id,
    lessonId: id.slice(0, -4),
    workspaceId: id,
    validationHistory: templateDraft.validationHistory.map((result) => ({
      ...result,
      exerciseId: id,
    })),
    lastPassingSnapshots: { [id]: structuredClone(templateDraft.lastPassingSnapshots[targetId]!) },
  }));
  const drafts = Object.fromEntries(
    [...Object.values(original.drafts), ...additionalDrafts].map((draft) => [
      `${draft.courseId}:${draft.workspaceId}`,
      draft.courseId === 'javascript'
        ? {
            ...draft,
            contentRevision: oldest,
            lastPassingSnapshots: Object.fromEntries(
              Object.entries(draft.lastPassingSnapshots).map(([id, snapshot]) => [
                id,
                { ...snapshot, contentRevision: oldest },
              ]),
            ),
          }
        : draft,
    ]),
  );
  const additionalProgress = Object.fromEntries(
    additionalDrafts.map(({ lessonId, exerciseId }) => [
      lessonId,
      { ...structuredClone(templateLesson), lessonId, passedExerciseIds: [exerciseId] },
    ]),
  );
  const unsigned = {
    ...original,
    drafts,
    courses: {
      ...original.courses,
      javascript: {
        ...original.courses.javascript!,
        contentRevision: oldest,
        lessons: { ...original.courses.javascript!.lessons, ...additionalProgress },
      },
    },
    appVersion: 'synthetic-delayed-reset-unit-only',
    exportedAt: time,
  };
  return {
    current: revised,
    input: {
      ...unsigned,
      integrity: { algorithm: 'SHA-256', digest: sha256Text(canonicalJson(unsigned)) },
    },
  };
}
function published() {
  return JavascriptPublishedReleaseSchema.parse({
    courseId: 'javascript',
    revision: '2026-10-02.93',
    tag: 'tsumucode-release-2026-10-02.93',
    sourceCommit: source,
    workflowHeadCommit: head,
    draftSourceCommit: earlier,
    draftCanonicalDistSha256: 'e'.repeat(64),
    normalizedLearningInputSha256: hash,
    canonicalDistSha256: hash,
    courseManifestSha256: hash,
    publicProvenanceSha256: hash,
    persistentIdsSha256: hash,
    persistentIds: [],
    previousReleaseTag: null,
    tombstonedIds: [],
    migrations: [],
    syntheticProgressBundlePath: 'tests/fixtures/progress/javascript-previous-release-bundle.json',
    qualityArtifactId: '11',
    qualityArtifactDigest: `sha256:${hash}`,
    reportArtifactId: '12',
    reportArtifactDigest: `sha256:${hash}`,
    workflowRunId: '13',
    workflowRunAttempt: 1,
    pageUrl: 'https://example.test/tsumucode/',
    postDeployVerificationPath: 'docs/quality/post-deploy/javascript/2026-10-02.93.yaml',
    postDeployVerificationSha256: hash,
  });
}
function report() {
  const release = published();
  return {
    courseId: release.courseId,
    revision: release.revision,
    draftSourceCommit: release.draftSourceCommit,
    draftCanonicalDistSha256: release.draftCanonicalDistSha256,
    normalizedLearningInputSha256: release.normalizedLearningInputSha256,
    sourceSha: source,
    workflowHeadSha: head,
    releaseMode: 'candidate',
    artifactDigest: hash,
    courseHash: hash,
    provenanceHash: hash,
    qualityArtifactId: '11',
    qualityArtifactDigest: `sha256:${hash}`,
    workflowRunId: '13',
    workflowRunAttempt: '1',
    pageUrl: release.pageUrl,
  };
}

describe('JS synthetic each edge and whole chain', () => {
  it('最古seedを空edgeから進め、各draftの初回reset .19/.1/.3と後段freshを区別する', async () => {
    const { current, input } = delayedResetFixture();
    const probes = await verifyJavascriptSyntheticBoundaries(current, input);
    expect(probes.map(({ migration }) => migration.fromRevision)).toEqual([
      '2026-09-28.19',
      '2026-10-02.1',
      '2026-10-02.3',
    ]);
    expect(
      probes.map(({ before, after }) => after.quarantined.length - before.quarantined.length),
    ).toEqual([2, 2, 4]);
    const outcome = await verifyJavascriptSyntheticProgressBundle(current, input);
    expect(outcome.migratedDrafts).toBe(2);
    expect(outcome.resetNotices).toBe(6);
  });

  it('同一edgeへreset対象を重複宣言したsynthetic境界を拒否する', () => {
    const { current, input } = delayedResetFixture();
    const migration = current.progressMigrations[1]!;
    expect(() =>
      createJavascriptBoundarySnapshot(
        current,
        { ...migration, steps: [...migration.steps, migration.steps[0]!] },
        input,
      ),
    ).toThrow('同一edgeのreset対象が重複');
  });

  it.each([
    'wrong-draft-revision',
    'wrong-snapshot-revision',
    'source',
    'cursor',
    'history',
    'date',
    'hint',
    'snapshot-source',
    'missing-reset-notice',
    'foreign-reset-notice',
  ])('全chain隔離rawの%sをrevision補正で許容しない', async (fault) => {
    const { current, input } = delayedResetFixture();
    const original = Object.getOwnPropertyDescriptor(
      ContentProgressMigrationService.prototype,
      'migrateSnapshotWithNotices',
    )!.value as ContentProgressMigrationService['migrateSnapshotWithNotices'];
    const spy = vi
      .spyOn(ContentProgressMigrationService.prototype, 'migrateSnapshotWithNotices')
      .mockImplementation(async function (this: ContentProgressMigrationService, ...args) {
        const result = await original.apply(this, args);
        if (args[0].courses.javascript?.contentRevision !== '2026-08-02.1') return result;
        if (fault === 'missing-reset-notice')
          return {
            ...result,
            notices: result.notices.filter(({ sourceId }) => sourceId !== targetId),
          };
        if (fault === 'foreign-reset-notice')
          return {
            ...result,
            notices: [...result.notices, { ...result.notices[0]!, sourceId: stableId }],
          };
        const snapshot = structuredClone(result.snapshot);
        const raw = snapshot.quarantined.find(
          (record) => (record.raw as ExerciseDraft | undefined)?.exerciseId === targetId,
        )?.raw as ExerciseDraft;
        expect(raw).toBeDefined();
        if (fault === 'wrong-draft-revision')
          (raw as { contentRevision: string }).contentRevision = '2026-08-02.1';
        if (fault === 'wrong-snapshot-revision')
          (raw.lastPassingSnapshots[targetId]! as { contentRevision: string }).contentRevision =
            '2026-10-02.3';
        if (fault === 'source') (raw.files as Record<string, string>)['script.js'] = 'lost source';
        if (fault === 'cursor')
          (raw.cursors as Record<string, { anchor: number; head: number }>)['script.js'] = {
            anchor: 0,
            head: 0,
          };
        if (fault === 'history')
          (raw as { validationHistory: readonly unknown[] }).validationHistory = [];
        if (fault === 'date') (raw as { updatedAt: string }).updatedAt = 'changed-date';
        if (fault === 'hint') (raw as { revealedHintIds: readonly string[] }).revealedHintIds = [];
        if (fault === 'snapshot-source')
          (raw.lastPassingSnapshots[targetId]!.files as Record<string, string>)['script.js'] =
            'changed old passing source';
        return { ...result, snapshot };
      });
    try {
      await expect(verifyJavascriptSyntheticProgressBundle(current, input)).rejects.toThrow(
        fault.endsWith('reset-notice')
          ? 'edge別reset Noticeのexact対象が不一致'
          : '対象reset/旧Source全体隔離が未達',
      );
    } finally {
      spy.mockRestore();
    }
  });

  it.each(['whole', 'fresh-edge'] as const)(
    '%sは同IDのfullDraftが残ってもpassedExerciseId raw/Notice両欠落を拒否する',
    async (scope) => {
      const { current, input } = delayedResetFixture();
      const original = Object.getOwnPropertyDescriptor(
        ContentProgressMigrationService.prototype,
        'migrateSnapshotWithNotices',
      )!.value as ContentProgressMigrationService['migrateSnapshotWithNotices'];
      const spy = vi
        .spyOn(ContentProgressMigrationService.prototype, 'migrateSnapshotWithNotices')
        .mockImplementation(async function (this: ContentProgressMigrationService, ...args) {
          const result = await original.apply(this, args);
          const from = scope === 'whole' ? '2026-08-02.1' : '2026-09-28.19';
          if (args[0].courses.javascript?.contentRevision !== from) return result;
          const record = result.snapshot.quarantined.find(({ raw }) => raw === targetId)!;
          expect(record).toBeDefined();
          return {
            snapshot: {
              ...result.snapshot,
              quarantined: result.snapshot.quarantined.filter(({ id }) => id !== record.id),
            },
            notices: result.notices.filter(({ id }) => id !== record.id),
          };
        });
      try {
        await expect(verifyJavascriptSyntheticProgressBundle(current, input)).rejects.toThrow(
          'reset raw/Noticeの件数・一意bindingが不一致',
        );
      } finally {
        spy.mockRestore();
      }
    },
  );

  it.each([
    'missing-passed-raw',
    'missing-passed-notice',
    'missing-full-draft-and-notice',
    'duplicate-passed-raw-and-notice',
    'duplicate-raw-id',
    'duplicate-notice-id',
    'substitute-passed-raw-with-full-draft',
    'wrong-notice-binding',
    'wrong-notice-course',
    'wrong-notice-entity',
    'wrong-notice-reason',
    'wrong-passed-raw-value',
    'wrong-record-and-notice-reason',
    'wrong-quarantined-at',
  ])('raw/Noticeの%sを同じ対象ID集合で免除しない', async (fault) => {
    const { current, input } = delayedResetFixture();
    const original = Object.getOwnPropertyDescriptor(
      ContentProgressMigrationService.prototype,
      'migrateSnapshotWithNotices',
    )!.value as ContentProgressMigrationService['migrateSnapshotWithNotices'];
    const spy = vi
      .spyOn(ContentProgressMigrationService.prototype, 'migrateSnapshotWithNotices')
      .mockImplementation(async function (this: ContentProgressMigrationService, ...args) {
        const result = await original.apply(this, args);
        if (args[0].courses.javascript?.contentRevision !== '2026-08-02.1') return result;
        const passed = result.snapshot.quarantined.find(({ raw }) => raw === targetId)!;
        const full = result.snapshot.quarantined.find(
          ({ raw }) => (raw as ExerciseDraft | undefined)?.exerciseId === targetId,
        )!;
        const passedNotice = result.notices.find(({ id }) => id === passed.id)!;
        const otherNotice = result.notices.find(({ sourceId }) => sourceId !== targetId)!;
        expect(passed).toBeDefined();
        expect(full).toBeDefined();
        expect(passedNotice).toBeDefined();
        expect(otherNotice).toBeDefined();
        let quarantined = [...result.snapshot.quarantined];
        let notices = [...result.notices];
        if (fault === 'missing-passed-raw')
          quarantined = quarantined.filter(({ id }) => id !== passed.id);
        if (fault === 'missing-passed-notice')
          notices = notices.filter(({ id }) => id !== passed.id);
        if (fault === 'missing-full-draft-and-notice') {
          quarantined = quarantined.filter(({ id }) => id !== full.id);
          notices = notices.filter(({ id }) => id !== full.id);
        }
        if (fault === 'duplicate-passed-raw-and-notice') {
          quarantined.push({ ...passed, id: 'duplicate-passed-raw' });
          notices.push({ ...passedNotice, id: 'duplicate-passed-raw' });
        }
        if (fault === 'duplicate-raw-id')
          quarantined = quarantined.map((record) =>
            record.id === full.id ? { ...record, id: passed.id } : record,
          );
        if (fault === 'duplicate-notice-id')
          notices = notices.map((notice) =>
            notice.id === full.id ? { ...notice, id: passed.id } : notice,
          );
        if (fault === 'substitute-passed-raw-with-full-draft')
          quarantined = quarantined.map((record) =>
            record.id === passed.id ? { ...record, raw: full.raw } : record,
          );
        if (fault === 'wrong-notice-binding')
          notices = notices.map((notice) =>
            notice.id === passed.id
              ? { ...notice, id: otherNotice.id }
              : notice.id === otherNotice.id
                ? { ...notice, id: passed.id }
                : notice,
          );
        if (fault === 'wrong-notice-course')
          notices = notices.map((notice) =>
            notice.id === passed.id ? { ...notice, courseId: 'html-css' } : notice,
          );
        if (fault === 'wrong-notice-entity')
          notices = notices.map((notice) =>
            notice.id === passed.id ? { ...notice, entity: 'lesson' } : notice,
          );
        if (fault === 'wrong-notice-reason')
          notices = notices.map((notice) =>
            notice.id === passed.id ? { ...notice, reason: 'changed notice reason' } : notice,
          );
        if (fault === 'wrong-passed-raw-value')
          quarantined = quarantined.map((record) =>
            record.id === passed.id ? { ...record, raw: stableId } : record,
          );
        if (fault === 'wrong-record-and-notice-reason') {
          quarantined = quarantined.map((record) =>
            record.id === passed.id ? { ...record, reason: 'changed reason' } : record,
          );
          notices = notices.map((notice) =>
            notice.id === passed.id ? { ...notice, reason: 'changed reason' } : notice,
          );
        }
        if (fault === 'wrong-quarantined-at')
          quarantined = quarantined.map((record) =>
            record.id === passed.id ? { ...record, quarantinedAt: 'changed date' } : record,
          );
        return { snapshot: { ...result.snapshot, quarantined }, notices };
      });
    try {
      await expect(verifyJavascriptSyntheticProgressBundle(current, input)).rejects.toThrow();
    } finally {
      spy.mockRestore();
    }
  });

  it('同じIDを旧edgeと後続edgeで各freshに失効し、空edgeを含む全chainも通す', async () => {
    const probes = await verifyJavascriptSyntheticBoundaries(course(), seed());
    expect(probes).toHaveLength(2);
    expect(probes.map(({ before }) => before.courses.javascript!.contentRevision)).toEqual([
      '2026-10-02.90',
      '2026-10-02.92',
    ]);
    expect(probes[1]!.before.drafts['javascript:' + targetId]).toBeDefined();
    const outcome = await verifyJavascriptSyntheticProgressBundle(course(), bundle());
    expect(outcome.migratedDrafts).toBe(2);
    expect(outcome.resetNotices).toBeGreaterThan(0);
  });
  it.each([
    'missing-history',
    'missing-source-snapshot',
    'missing-other-course',
    'wrong-integrity',
  ])('%sをmigration証拠へ数えない', async (failure) => {
    const input = bundle();
    const draft = input.drafts['javascript:' + targetId]!;
    if (failure === 'missing-history')
      (draft as { validationHistory: readonly unknown[] }).validationHistory = [];
    if (failure === 'missing-source-snapshot')
      (draft as { lastPassingSnapshots: object }).lastPassingSnapshots = {};
    if (failure === 'missing-other-course')
      delete (input.drafts as Record<string, ExerciseDraft>)['html-css:html-css-ch00-l01-e01'];
    if (failure !== 'wrong-integrity') {
      const unsigned = Object.fromEntries(
        Object.entries(input).filter(([key]) => key !== 'integrity'),
      );
      (input as { integrity: ProgressBundle['integrity'] }).integrity = {
        algorithm: 'SHA-256',
        digest: sha256Text(canonicalJson(unsigned)),
      };
    } else
      (input as { integrity: ProgressBundle['integrity'] }).integrity = {
        algorithm: 'SHA-256',
        digest: hash,
      };
    await expect(verifyJavascriptSyntheticProgressBundle(course(), input)).rejects.toThrow();
  });
  it('通常loadの実migratorは置換前snapshotをbackupへ渡し、2回目は置換しない', async () => {
    const migration = course().progressMigrations[2]!;
    const input = createJavascriptBoundarySnapshot(course(), migration, seed());
    let stored = structuredClone(input);
    const backups: RepositorySnapshot[] = [];
    const repository = {
      snapshot: async () => structuredClone(stored),
      replaceSnapshotWithBackup: async (next: RepositorySnapshot, reason: string) => {
        expect(reason).toBe('recovery');
        backups.push(structuredClone(stored));
        stored = structuredClone(next);
      },
    } as unknown as ProgressRepository;
    const service = new ContentProgressMigrationService(repository);
    await service.ensureStoredCourse(course());
    expect(backups).toEqual([input]);
    expect(
      stored.quarantined.some(
        ({ raw }) => canonicalJson(raw) === canonicalJson(input.drafts['javascript:' + targetId]),
      ),
    ).toBe(true);
    await service.ensureStoredCourse(course());
    expect(backups).toHaveLength(1);
    expect(stored.drafts['javascript:' + stableId]!.files).toEqual(
      input.drafts['javascript:' + stableId]!.files,
    );
  });
});

describe('JS immutable release bindings', () => {
  it('Reportはcourse/revision/S/Ddraft/input hashを厳密に往復しHTMLと混在しない', () => {
    const text = buildReleaseReport(report());
    expect(parseReleaseReport(text)).toEqual(report());
    assertReleaseReportMatches(published(), parseReleaseReport(text));
    expect(() => parseReleaseReport(text.replace('- courseId: `javascript`\n', ''))).toThrow();
    expect(() =>
      parseReleaseReport(text.replace('agent-simulated-learning', 'real-human')),
    ).toThrow();
    expect(() => {
      assertReleaseReportMatches(published(), { ...report(), draftSourceCommit: head });
    }).toThrow();
  });
  it('Course tag unionは別Courseを免除せず未知と重複を拒否する', () => {
    const empty = { releases: [], candidate: {} } as never;
    const js = { releases: [published()], candidate: {} } as never;
    assertReleaseTagUnion([empty, js], [published().tag]);
    expect(() => {
      assertReleaseTagUnion([empty, js], [published().tag, 'tsumucode-release-2026-10-02.98']);
    }).toThrow();
    expect(() => {
      assertReleaseTagUnion([js, js], [published().tag]);
    }).toThrow();
  });
  it('JS annotated messageはcourse_id/revision/学習bindingの欠落・重複を拒否する', () => {
    const release = published();
    const text = `course_id=javascript revision=${release.revision} draft_source=${earlier} draft_dist=${release.draftCanonicalDistSha256} learning_input=${hash} source=${source} head=${head} dist=${hash} course=${hash} provenance=${hash} quality_id=11 quality_digest=sha256:${hash} report_id=12 report_digest=sha256:${hash} workflow=13-1 page_url=${release.pageUrl}`;
    assertPublishedTagMessage(release, text);
    expect(() => {
      assertPublishedTagMessage(release, text.replace('course_id=javascript ', ''));
    }).toThrow();
    expect(() => {
      assertPublishedTagMessage(release, text + ' course_id=javascript');
    }).toThrow();
    expect(() => {
      assertPublishedTagMessage(
        release,
        text.replace('course_id=javascript', 'course_id=html-css'),
      );
    }).toThrow();
  });
  it('登録JS履歴からだけrollbackを選び、未登録sourceを拒否する', () => {
    const release = published();
    const history = { releases: [release], candidate: {} } as never;
    expect(resolveRollbackRelease(history, source)).toEqual(release);
    expect(() => resolveRollbackRelease(history, head)).toThrow();
  });
  it('JS postdeployは人承認を捏造せず全6操作を必須にする', () => {
    const release = published();
    const verification = {
      schemaVersion: 2,
      courseId: 'javascript',
      status: 'approved',
      revision: release.revision,
      tag: release.tag,
      sourceCommit: source,
      workflowHeadCommit: head,
      workflowRunId: '13',
      workflowRunAttempt: 1,
      reportArtifactId: '12',
      reportArtifactDigest: `sha256:${hash}`,
      pageUrl: release.pageUrl,
      environmentAdmissionStatus: 'passed',
      independentEnvironmentApproval: 'not-configured',
      pageVerificationStatus: 'passed',
      reportVerificationStatus: 'passed',
      tagVerificationStatus: 'passed',
      verifiedBy: 'unit-independent',
      verifiedAt: time,
      requiredUnconfirmed: 0,
      publicSmokeOperations: [
        'start',
        'resume',
        'grading',
        'persistence',
        'export',
        'fresh-import',
      ].map((operationId) => ({
        operationId,
        status: 'passed',
        evidenceSha256: hash,
        observedAt: time,
      })),
    };
    validatePostDeployVerification(verification, release, hash);
    expect(() => {
      validatePostDeployVerification({ ...verification, publicSmokeOperations: [] }, release, hash);
    }).toThrow();
    expect(() => {
      validatePostDeployVerification(
        { ...verification, environmentApprovalStatus: 'passed' },
        release,
        hash,
      );
    }).toThrow();
    expect(() => {
      validatePostDeployVerification(
        verification,
        { ...release, postDeployVerificationPath: 'docs/quality/post-deploy/2026-10-02.93.yaml' },
        hash,
      );
    }).toThrow();
  });
  it('workflowは全site品質とJS選択時HTMLquality-onlyを保持する', async () => {
    const workflow = parseYaml(await readFile('.github/workflows/pages.yml', 'utf8')) as {
      jobs: {
        quality: { steps: { name?: string; run?: string; if?: string }[] };
        deploy: { permissions: object };
      };
    };
    const steps = workflow.jobs.quality.steps;
    for (const command of [
      'npm run content:provenance',
      'npm run check:release',
      'npm run test:e2e',
      'npm run test:performance',
      'npm run test:lighthouse',
      'npm run release:check',
    ]) {
      expect(steps.some(({ run }) => run?.includes(command))).toBe(true);
    }
    const html = steps.find(
      ({ name }) => name === 'Keep existing HTML continuity in the all-site gate',
    );
    expect(html?.run).toContain('--quality-only --course-id html-css');
    expect(html?.if).toContain("course_id == 'javascript'");
    expect(workflow.jobs.deploy.permissions).toEqual({ pages: 'write', 'id-token': 'write' });
  });
});
