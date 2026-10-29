// @vitest-environment node
import { lstat, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CourseIndexSchema } from '../../src/core/content/deliverySchema';
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
  it('単一treeは共有Assetとdraftの配信bytesを保持する', async () => {
    const stagingRoot = await createTemporaryRoot();
    const compilation = await compileCourse(
      path.resolve('tests/fixtures/foundation-content/html-css'),
    );
    const draft = {
      ...compilation,
      runtime: CourseManifestSchema.parse({
        ...compilation.runtime,
        id: 'draft-course',
        publicationStatus: 'draft',
      }),
      assets: new Map([
        ['assets/draft-course/private.svg', new TextEncoder().encode('draft-only-bytes')],
      ]),
    };
    const draftPath: LearningPathDefinition = {
      id: 'draft-path',
      title: '作者Path',
      description: 'draft Courseを確認する',
      publicationStatus: 'draft',
      steps: [{ courseId: 'draft-course', role: 'required', prerequisiteCourseIds: [] }],
    };
    const delivery = buildSplitContentDelivery([compilation, draft], [draftPath]);

    await writeSplitContentDeliveryTree(stagingRoot, delivery);

    expect(delivery.catalog.courses.map(({ id }) => id)).toEqual(['draft-course', 'html-css']);
    expect(delivery.catalog.learningPaths).toEqual([draftPath]);
    const sharedAsset = await readFile(
      path.join(stagingRoot, 'assets/html-css/html-structure.svg'),
    );
    expect(new Uint8Array(sharedAsset)).toEqual(
      compilation.assets.get('assets/html-css/html-structure.svg'),
    );
    await expect(
      readFile(path.join(stagingRoot, 'assets/draft-course/private.svg'), 'utf8'),
    ).resolves.toBe('draft-only-bytes');
    expect(
      CourseIndexSchema.parse(
        JSON.parse(
          await readFile(path.join(stagingRoot, 'courses/draft-course/index.json'), 'utf8'),
        ) as unknown,
      ).publicationStatus,
    ).toBe('draft');
  });

  it('公開Pathの教材承認状態を配信可視性と混同しない', async () => {
    const compilation = await compileCourse(
      path.resolve('tests/fixtures/foundation-content/html-css'),
    );
    const draft = {
      ...compilation,
      runtime: CourseManifestSchema.parse({
        ...compilation.runtime,
        id: 'draft-course',
        publicationStatus: 'draft',
      }),
    };
    expect(() =>
      buildSplitContentDelivery(
        [compilation, draft],
        [
          {
            id: 'published-path',
            title: '公開Path',
            description: '除外対象を要求する',
            publicationStatus: 'published',
            steps: [{ courseId: 'draft-course', role: 'required', prerequisiteCourseIds: [] }],
          },
        ],
      ),
    ).toThrow(/LearningPath/u);
  });

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
