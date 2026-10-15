// @vitest-environment node
/** 実Compilerの草稿を使い、内部整合だけでは見つからないSource/dist不一致を検証する。 */
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parse, stringify } from 'yaml';
import { CourseManifestSchema } from '../../src/core/content/schema';
import { checkPythonPracticeDraft } from '../../scripts/content/checkPythonPracticeDraft';
import { checkPythonOopDraft } from '../../scripts/content/checkPythonOopDraft';
import {
  checkPythonDraftArtifact,
  type PythonDraftCourseId,
} from '../../scripts/content/checkPythonDraftArtifact';
import {
  compileCourse,
  stringifyCanonicalJson,
  type CompiledCourseArtifacts,
} from '../../scripts/content/compileCourse';
import {
  buildSplitContentDelivery,
  writeSplitContentDeliveryTree,
} from '../../scripts/content/splitContentDelivery';
import { readSplitCourseArtifacts } from '../../scripts/content/readSplitCourseArtifacts';
import { verifyContentReview } from '../../scripts/content/verifyContentReview';

let courseId: 'python-practice' | 'python-oop';
let root: string;
let dist: string;
let compilation: CompiledCourseArtifacts;

/** 同じSourceから実Compilerで分割Artifactを生成する。 */
async function writeDelivery(compiled = compilation): Promise<void> {
  await writeSplitContentDeliveryTree(
    path.join(dist, 'generated/content'),
    buildSplitContentDelivery([compiled], []),
  );
}

/** JSONを既存Compilerと同じcanonical表記で書く。 */
async function writeJson(relative: string, value: unknown): Promise<void> {
  await writeFile(path.join(dist, relative), stringifyCanonicalJson(value));
}

/** SourceのCourse metadataだけを変更し、Lessonレビューの入力は保持する。 */
async function updateCourse(values: Record<string, unknown>): Promise<void> {
  const file = path.join(root, `content/${courseId}/course.yaml`);
  const current = parse(await readFile(file, 'utf8')) as Record<string, unknown>;
  await writeFile(file, stringify({ ...current, ...values }));
}

/** 配信Catalogの1項目だけを変更する。 */
async function updateCatalog(change: (catalog: Record<string, unknown>) => void): Promise<void> {
  const relative = 'generated/content/catalog-v3.json';
  const catalog = JSON.parse(await readFile(path.join(dist, relative), 'utf8')) as Record<
    string,
    unknown
  >;
  change(catalog);
  await writeJson(relative, catalog);
}

/** 対象の草稿Courseを含むPathを生成する。 */
function draftPath() {
  return {
    id: 'draft-path',
    title: '草稿への経路',
    description: '草稿の非掲載を検証するための経路。',
    publicationStatus: 'draft',
    steps: [{ courseId, role: 'required', prerequisiteCourseIds: [] }],
  };
}

afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

describe.each([
  ['python-practice', checkPythonPracticeDraft, 5],
  ['python-oop', checkPythonOopDraft, 9],
] as const)('%sの草稿Sourceとdistの照合', (selectedCourseId, checkDraft, lessonCount) => {
  beforeEach(async () => {
    courseId = selectedCourseId;
    root = await mkdtemp(path.join(os.tmpdir(), 'tsumucode-python-draft-'));
    dist = path.join(root, 'dist');
    await cp(`content/${courseId}`, path.join(root, `content/${courseId}`), {
      recursive: true,
    });
    await mkdir(path.join(root, 'docs/quality'), { recursive: true });
    await cp(
      `docs/quality/content-review-${courseId}.yaml`,
      path.join(root, `docs/quality/content-review-${courseId}.yaml`),
    );
    compilation = await compileCourse(path.join(root, `content/${courseId}`));
    await writeDelivery();
  });

  it('同じ草稿Sourceから生成したdistは確認できる', async () => {
    await expect(checkDraft(root, dist)).resolves.toMatchObject({
      courseId,
      status: 'draft-matched',
      lessonsReviewed: lessonCount,
    });
  });

  it('Source更新後の古い整合distを拒否する', async () => {
    await updateCourse({ title: '改訂したCourse' });
    await expect(checkDraft(root, dist)).rejects.toThrow('Source');
  });

  it('Lesson本文と内部SHAを一緒に差し替えても拒否する', async () => {
    const runtime = CourseManifestSchema.parse({
      ...compilation.runtime,
      phases: compilation.runtime.phases.map((phase, phaseIndex) => ({
        ...phase,
        chapters: phase.chapters.map((chapter, chapterIndex) => ({
          ...chapter,
          lessons: chapter.lessons.map((lesson, lessonIndex) =>
            phaseIndex === 0 && chapterIndex === 0 && lessonIndex === 0
              ? { ...lesson, goal: 'Sourceと異なる目標へ差し替えました。' }
              : lesson,
          ),
        })),
      })),
    });
    await writeDelivery({ ...compilation, runtime });
    // 既存の内部SHAとLesson Sourceレビューだけでは通ることを対照として確認する。
    await expect(readSplitCourseArtifacts(dist, courseId)).resolves.toMatchObject({
      id: courseId,
    });
    await expect(
      verifyContentReview({
        courseRoot: path.join(root, `content/${courseId}`),
        publicRoot: dist,
        courseId,
        reviewPath: path.join(root, `docs/quality/content-review-${courseId}.yaml`),
      }),
    ).resolves.toMatchObject({ staleHashes: 0, rejected: 0 });
    await expect(checkDraft(root, dist)).rejects.toThrow('Source');
  });

  it('Indexは同じでもCatalogだけが異なる場合を拒否する', async () => {
    await updateCatalog((catalog) => {
      const entries = catalog.courses as Array<Record<string, unknown>>;
      entries[0]!.title = '古いCatalogの題名';
    });
    await expect(checkDraft(root, dist)).rejects.toThrow('Catalog');
  });

  it('公開Provenanceの差し替えを拒否する', async () => {
    await writeJson(`generated/content/courses/${courseId}/provenance.json`, {
      ...compilation.publicProvenance,
      items: compilation.publicProvenance.items.map((item) => ({
        ...item,
        creator: 'Sourceと異なる作者',
      })),
    });
    await expect(checkDraft(root, dist)).rejects.toThrow('Provenance');
  });

  it('AssetのbytesがSourceと異なる場合を拒否する', async () => {
    const assetPath = [...compilation.assets.keys()][0];
    if (!assetPath) throw new Error('実践CourseのAsset Fixtureがありません');
    await writeFile(path.join(dist, 'generated/content', assetPath), '<svg></svg>');
    await expect(checkDraft(root, dist)).rejects.toThrow('Asset');
  });

  it('Sourceとdistが同じでもpublished Courseは拒否する', async () => {
    await updateCourse({ publicationStatus: 'published' });
    compilation = await compileCourse(path.join(root, `content/${courseId}`));
    await writeDelivery();
    await expect(checkDraft(root, dist)).rejects.toThrow('草稿');
  });

  it('Catalogだけがpublishedを示す場合も拒否する', async () => {
    await updateCatalog((catalog) => {
      const entries = catalog.courses as Array<Record<string, unknown>>;
      entries[0]!.publicationStatus = 'published';
    });
    await expect(checkDraft(root, dist)).rejects.toThrow('草稿');
  });

  it('Source側だけのPath追加を拒否する', async () => {
    const directory = path.join(root, 'content/learning-paths');
    await mkdir(directory);
    await writeFile(
      path.join(directory, 'draft-path.yaml'),
      stringify({ schemaVersion: 1, ...draftPath() }),
    );
    await expect(checkDraft(root, dist)).rejects.toThrow('Path');
  });

  it('dist側だけのPath追加を拒否する', async () => {
    await updateCatalog((catalog) => {
      catalog.learningPaths = [draftPath()];
    });
    await expect(checkDraft(root, dist)).rejects.toThrow('Path');
  });
});

describe('Python草稿照合の固定対象', () => {
  it('未知のCourseはSourceやdistを読む前に拒否する', async () => {
    await expect(
      checkPythonDraftArtifact(
        '/source-does-not-exist',
        '/dist-does-not-exist',
        'python-basics' as PythonDraftCourseId,
      ),
    ).rejects.toThrow('対象はpython-practiceとpython-oop');
  });
});
