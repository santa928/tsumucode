import { z } from 'zod';
import { migrateRepositorySnapshot } from '../../src/adapters/persistence/indexeddb/migrateProgress';
import type { CourseManifest } from '../../src/core/content/types';
import { canonicalJson } from '../../src/core/persistence/canonicalJson';
import { ContentProgressMigrationService } from '../../src/core/persistence/contentProgressMigration';
import type { ProgressRepository } from '../../src/core/persistence/contracts';
import { sha256Text } from './releaseHashes';

/** 5Workspace・制作の3工程履歴・成功版を実migratorで保持する。合成値は学習受入に使わない。 */
export async function verifyTailwindSyntheticProgressBundle(
  course: CourseManifest,
  input: unknown,
) {
  if (course.id !== 'tailwind' || course.progressMigrations.some(({ steps }) => steps.length !== 0))
    throw new Error('Tailwind初公開の合成検査はID保持の移行に限定します');
  const bundle = z
    .looseObject({
      appVersion: z.literal('synthetic-tailwind-release-not-learning-evidence'),
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
    throw new Error('Tailwind合成Bundleのhashが一致しません');
  const seed = migrateRepositorySnapshot(unsigned, bundle.exportedAt);
  const lessons = course.phases.flatMap(({ chapters }) =>
    chapters.flatMap(({ lessons }) => lessons),
  );
  const progress = seed.courses.tailwind;
  if (
    lessons.length !== 5 ||
    !progress ||
    progress.contentRevision !== '2026-10-15.1' ||
    canonicalJson(Object.keys(progress.lessons).sort()) !==
      canonicalJson(lessons.map(({ id }) => id).sort()) ||
    ['html-css', 'javascript', 'typescript', 'react', 'next', 'python-basics'].some(
      (id) => !seed.courses[id],
    ) ||
    seed.quarantined.length !== 0
  )
    throw new Error('Tailwind合成Bundleの5教材/旧revision/既存6Courseが不足しています');
  const drafts = Object.values(seed.drafts).filter(({ courseId }) => courseId === 'tailwind');
  const exercises = lessons.flatMap(({ exercises }) => exercises);
  if (
    drafts.length !== 5 ||
    exercises.length !== 5 ||
    new Set(drafts.map(({ workspaceId }) => workspaceId)).size !== 5
  )
    throw new Error('Tailwind合成Bundleの独立5Workspaceが不足しています');
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
        `TailwindのSource/カーソル/工程履歴/成功snapshotが不足しています: ${exercise.id}`,
      );
    if (exercise.kind === 'guided-project' || exercise.kind === 'capstone') {
      if (
        draft.validationHistory.length < 3 ||
        draft.validationHistory.filter(({ status }) => status === 'incomplete').length < 2
      )
        throw new Error(`Tailwind制作の3工程履歴が不足しています: ${exercise.id}`);
    }
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
    tailwind: { ...progress, contentRevision: course.revision },
  };
  expected.drafts = Object.fromEntries(
    Object.entries(expected.drafts).map(([key, draft]) => [
      key,
      draft.courseId !== 'tailwind'
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
      'Tailwind移行がSource/進捗/工程履歴/成功版/既存Courseを保持できないか、冪等ではありません',
    );
  return {
    migratedCourses: Object.keys(result.snapshot.courses).length,
    migratedDrafts: Object.keys(result.snapshot.drafts).length,
    resetNotices: result.notices.length,
  };
}
