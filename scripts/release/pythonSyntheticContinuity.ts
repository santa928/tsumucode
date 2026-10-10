import { z } from 'zod';
import { migrateRepositorySnapshot } from '../../src/adapters/persistence/indexeddb/migrateProgress';
import type { CourseManifest } from '../../src/core/content/types';
import { canonicalJson } from '../../src/core/persistence/canonicalJson';
import { ContentProgressMigrationService } from '../../src/core/persistence/contentProgressMigration';
import type { ProgressRepository } from '../../src/core/persistence/contracts';
import { sha256Text } from './releaseHashes';

/** 初公開の1Workspace・Source・合格履歴・成功版を実migratorで保持する。合成値は学習受入に使わない。 */
export async function verifyPythonSyntheticProgressBundle(course: CourseManifest, input: unknown) {
  if (
    course.id !== 'python-basics' ||
    course.progressMigrations.some(({ steps }) => steps.length !== 0)
  )
    throw new Error('Python初公開の合成検査はID保持の移行に限定します');
  const bundle = z
    .looseObject({
      appVersion: z.literal('synthetic-python-release-not-learning-evidence'),
      exportedAt: z.iso.datetime(),
      integrity: z
        .object({
          algorithm: z.literal('SHA-256'),
          digest: z.string().regex(/^[a-f0-9]{64}$/u),
        })
        .strict(),
    })
    .parse(input);
  const { integrity, ...unsigned } = bundle;
  if (sha256Text(canonicalJson(unsigned)) !== integrity.digest)
    throw new Error('Python合成Bundleのhashが一致しません');
  const seed = migrateRepositorySnapshot(unsigned, bundle.exportedAt);
  const lessons = course.phases.flatMap(({ chapters }) =>
    chapters.flatMap(({ lessons }) => lessons),
  );
  const progress = seed.courses['python-basics'];
  if (
    lessons.length !== 1 ||
    !progress ||
    progress.contentRevision !== '2026-10-10.1' ||
    canonicalJson(Object.keys(progress.lessons).sort()) !==
      canonicalJson(lessons.map(({ id }) => id).sort()) ||
    ['html-css', 'javascript', 'typescript', 'react', 'next'].some((id) => !seed.courses[id]) ||
    seed.quarantined.length !== 0
  )
    throw new Error('Python合成Bundleの1教材/同revision/既存5Courseが不足しています');
  const drafts = Object.values(seed.drafts).filter(({ courseId }) => courseId === 'python-basics');
  const exercises = lessons.flatMap(({ exercises }) => exercises);
  if (
    drafts.length !== 1 ||
    exercises.length !== 1 ||
    new Set(drafts.map(({ workspaceId }) => workspaceId)).size !== 1
  )
    throw new Error('Python合成Bundleの独立1Workspaceが不足しています');
  for (const exercise of exercises) {
    const draft = drafts.find(({ workspaceId }) => workspaceId === exercise.workspaceId);
    const rules = exercise.validationRules
      .filter(({ required }) => required)
      .map(({ id }) => id)
      .sort();
    if (
      !draft ||
      draft.exerciseId !== exercise.id ||
      canonicalJson(Object.keys(draft.files).sort()) !==
        canonicalJson(exercise.files.map(({ path }) => path).sort()) ||
      !draft.lastPassingSnapshots[exercise.id] ||
      !draft.cursors[draft.selectedFile] ||
      !draft.validationHistory.some(
        ({ status, checks }) =>
          status === 'pass' &&
          canonicalJson(
            checks
              .filter(({ required, passed }) => required && passed)
              .map(({ ruleId }) => ruleId)
              .sort(),
          ) === canonicalJson(rules),
      )
    )
      throw new Error(
        `PythonのSource/カーソル/工程履歴/成功snapshotが不足しています: ${exercise.id}`,
      );
  }
  const repository = new Proxy({} as ProgressRepository, {
    get() {
      throw new Error('合成検査で永続化できません');
    },
  });
  const service = new ContentProgressMigrationService(repository);
  service.registerCourse(course);
  const expected = { ...structuredClone(seed) };
  expected.courses = {
    ...expected.courses,
    'python-basics': { ...progress, contentRevision: course.revision },
  };
  expected.drafts = Object.fromEntries(
    Object.entries(expected.drafts).map(([key, draft]) => [
      key,
      draft.courseId !== 'python-basics'
        ? draft
        : {
            ...draft,
            contentRevision: course.revision,
            lastPassingSnapshots: Object.fromEntries(
              Object.entries(draft.lastPassingSnapshots).map(([id, snapshot]) => [
                id,
                { ...snapshot, contentRevision: course.revision },
              ]),
            ),
          },
    ]),
  );
  const result = await service.migrateSnapshotWithNotices(seed);
  const repeated = await service.migrateSnapshotWithNotices(result.snapshot);
  if (
    result.notices.length !== 0 ||
    repeated.notices.length !== 0 ||
    canonicalJson(result.snapshot) !== canonicalJson(expected) ||
    canonicalJson(repeated.snapshot) !== canonicalJson(expected)
  )
    throw new Error(
      'Python移行がSource/進捗/工程履歴/成功版/既存Courseを保持できないか、冪等ではありません',
    );
  return {
    migratedCourses: Object.keys(result.snapshot.courses).length,
    migratedDrafts: Object.keys(result.snapshot.drafts).length,
    resetNotices: result.notices.length,
  };
}
