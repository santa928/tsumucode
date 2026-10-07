import type { CourseManifest } from '../../src/core/content/types';
import type { ProgressRepository } from '../../src/core/persistence/contracts';
import { migrateRepositorySnapshot } from '../../src/adapters/persistence/indexeddb/migrateProgress';
import { ContentProgressMigrationService } from '../../src/core/persistence/contentProgressMigration';
import { canonicalJson } from '../../src/core/persistence/canonicalJson';
import { z } from 'zod';
import { sha256Text } from './releaseHashes';

/** 全15教材・14Workspaceの保持を実migratorで確認する。合成進捗は学習受入には使用しない。 */
export async function verifyReactSyntheticProgressBundle(course: CourseManifest, input: unknown) {
  if (course.id !== 'react' || course.progressMigrations.some(({ steps }) => steps.length !== 0))
    throw new Error('React初公開の合成検査はIDを保持する移行契約に限定します');
  const bundle = z
    .looseObject({
      exportedAt: z.iso.datetime(),
      integrity: z
        .object({ algorithm: z.literal('SHA-256'), digest: z.string().regex(/^[a-f0-9]{64}$/u) })
        .strict(),
    })
    .parse(input);
  const { integrity, ...unsigned } = bundle;
  if (sha256Text(canonicalJson(unsigned)) !== integrity.digest)
    throw new Error('TSX合成Bundleのhashが一致しません');
  const seed = migrateRepositorySnapshot(unsigned, bundle.exportedAt);
  const lessons = course.phases.flatMap(({ chapters }) =>
    chapters.flatMap(({ lessons }) => lessons),
  );
  const progress = seed.courses.react;
  if (
    !progress ||
    progress.contentRevision !== '2026-10-07.6' ||
    canonicalJson(Object.keys(progress.lessons).sort()) !==
      canonicalJson(lessons.map(({ id }) => id).sort()) ||
    !seed.courses.typescript ||
    !seed.courses.javascript ||
    !seed.courses['html-css']
  )
    throw new Error('TSX合成Bundleの全教材/旧revision/既存Courseが不足しています');
  const workspaces = [
    ...new Set(lessons.flatMap(({ exercises }) => exercises.map(({ workspaceId }) => workspaceId))),
  ].sort();
  const drafts = Object.values(seed.drafts).filter(({ courseId }) => courseId === 'react');
  if (
    canonicalJson(drafts.map(({ workspaceId }) => workspaceId).sort()) !==
      canonicalJson(workspaces) ||
    drafts.some(
      ({ files, validationHistory, lastPassingSnapshots }) =>
        !files['main.tsx'] ||
        validationHistory.length === 0 ||
        Object.keys(lastPassingSnapshots).length === 0,
    )
  )
    throw new Error('TSX合成Bundleの元TSX/採点履歴/成功snapshotが不足しています');
  const repository = new Proxy({} as ProgressRepository, {
    get() {
      throw new Error('合成検査で永続化できません');
    },
  });
  const service = new ContentProgressMigrationService(repository);
  service.registerCourse(course);
  const result = await service.migrateSnapshotWithNotices(seed);
  const expected = { ...structuredClone(seed) };
  expected.courses = {
    ...expected.courses,
    react: { ...progress, contentRevision: course.revision },
  };
  expected.drafts = Object.fromEntries(
    Object.entries(expected.drafts).map(([key, draft]) => [
      key,
      draft.courseId !== 'react'
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
  if (result.notices.length !== 0 || canonicalJson(result.snapshot) !== canonicalJson(expected))
    throw new Error('TSX移行で進捗/元TSX/履歴/カーソル/既存Courseを保持できません');
  const repeated = await service.migrateSnapshotWithNotices(result.snapshot);
  if (repeated.notices.length !== 0 || canonicalJson(repeated.snapshot) !== canonicalJson(expected))
    throw new Error('TSX移行が冪等ではありません');
  return {
    migratedCourses: Object.keys(result.snapshot.courses).length,
    migratedDrafts: Object.keys(result.snapshot.drafts).length,
    resetNotices: result.notices.length,
  };
}
