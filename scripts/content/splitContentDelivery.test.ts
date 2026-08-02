// @vitest-environment node
import { lstat, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CourseManifestSchema } from '../../src/core/content/schema';
import type { LearningPathDefinition } from '../../src/core/content/types';
import { fixtureCourse } from '../../tests/fixtures/course';
import { compileCourse } from './compileCourse';
import { splitCourseArtifacts } from './splitCourseArtifacts';
import {
  buildSplitContentDelivery,
  createCourseCatalog,
  projectCourseForSplitDelivery,
  writeSplitContentDeliveryTree,
} from './splitContentDelivery';

const temporaryRoots: string[] = [];

/** Testごとに隔離したstaging Rootを作る。 */
async function createTemporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tsumucode-split-delivery-'));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('split content delivery', () => {
  it('Catalog v3と分割Course treeだけを指定stagingへ書く', async () => {
    const stagingRoot = await createTemporaryRoot();
    const compilation = await compileCourse(
      path.resolve('tests/fixtures/foundation-content/html-css'),
    );
    const delivery = buildSplitContentDelivery([compilation], []);

    await writeSplitContentDeliveryTree(stagingRoot, delivery);

    await expect(readFile(path.join(stagingRoot, 'catalog-v3.json'), 'utf8')).resolves.toContain(
      '"schemaVersion":3',
    );
    await expect(
      lstat(path.join(stagingRoot, 'courses/html-css/index.json')),
    ).resolves.toBeDefined();
    await expect(
      lstat(path.join(stagingRoot, 'courses/html-css/lessons/lesson-first-heading.json')),
    ).resolves.toBeDefined();
    await expect(
      lstat(path.join(stagingRoot, 'courses/html-css/provenance.json')),
    ).resolves.toBeDefined();
    await expect(lstat(path.join(stagingRoot, 'catalog.json'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(lstat(path.join(stagingRoot, 'courses/html-css.json'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('新しいCourse treeのprovenance pathを入力変更なしで公開用Courseへ投影する', () => {
    const projected = projectCourseForSplitDelivery(fixtureCourse);
    expect(projected.provenanceManifestPath).toBe(
      'generated/content/courses/html-css/provenance.json',
    );
    expect(projected).not.toBe(fixtureCourse);
    expect(projected).toEqual(fixtureCourse);
    expect(fixtureCourse.provenanceManifestPath).toBe(
      'generated/content/courses/html-css/provenance.json',
    );
  });

  it('draft Courseは直リンク用entryを残し公開LearningPathから除外する', () => {
    const draftCourse = CourseManifestSchema.parse({
      ...structuredClone(fixtureCourse),
      id: 'draft-course',
      title: '直接URL検証用Course',
      publicationStatus: 'draft',
    });
    const publishedLearningPath: LearningPathDefinition = {
      id: 'published-path',
      title: '公開Path',
      description: '公開Courseだけを案内します。',
      publicationStatus: 'published',
      steps: [
        {
          courseId: fixtureCourse.id,
          role: 'required',
          prerequisiteCourseIds: [],
        },
      ],
    };
    const catalog = createCourseCatalog(
      [splitCourseArtifacts(fixtureCourse).index, splitCourseArtifacts(draftCourse).index],
      [publishedLearningPath],
    );
    expect(catalog.courses.map(({ id }) => id)).toContain('draft-course');
    expect(
      catalog.learningPaths
        .filter(({ publicationStatus }) => publicationStatus === 'published')
        .flatMap(({ steps }) => steps)
        .some(({ courseId }) => courseId === 'draft-course'),
    ).toBe(false);
  });
});
