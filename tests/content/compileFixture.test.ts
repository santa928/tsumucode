// @vitest-environment node
/** Repository正本の最初のHTML/CSS教材をCompilerで公開Artifactへ変換できることを検証する。 */
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { compileContent } from '../../scripts/content/compile';
import { loadAuthoringCourse, stringifyCanonicalJson } from '../../scripts/content/compileCourse';
import { readSplitCourseArtifacts } from '../../scripts/content/readSplitCourseArtifacts';

const temporaryRoots: string[] = [];

/** Testごとに公開出力を隔離する一時Rootを作成する。 */
async function createTemporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tsumucode-fixture-'));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('HTML/CSS Course compilation', () => {
  it('YAML・Markdown・Original SVGから公開CatalogとCourseを生成する', async () => {
    const temporaryRoot = await createTemporaryRoot();
    const sourceRoot = path.resolve('tests/fixtures/foundation-content');
    const outputRoot = path.join(temporaryRoot, 'generated/content');

    const summary = await compileContent({ sourceRoot, outputRoot, checkOnly: false });
    const publicCourse = await readSplitCourseArtifacts(temporaryRoot, 'html-css');
    const publicCourseSource = stringifyCanonicalJson(publicCourse);
    const publicProvenance = await readFile(
      path.join(outputRoot, 'courses/html-css/provenance.json'),
      'utf8',
    );
    const sourceAsset = await readFile(
      path.join(
        sourceRoot,
        'html-css/chapters/ch00-web-map/lessons/lesson-first-heading/slides/assets/html-structure.svg',
      ),
    );
    const publicAsset = await readFile(path.join(outputRoot, 'assets/html-css/html-structure.svg'));
    const sourceAssetText = sourceAsset.toString('utf8');
    const authoring = await loadAuthoringCourse(path.join(sourceRoot, 'html-css'));

    expect(summary.courseCount).toBe(1);
    expect(summary.warnings).toEqual([]);
    expect(summary.catalog.courses).toHaveLength(1);
    expect(summary.catalog).toMatchObject({
      schemaVersion: 3,
      courses: [
        {
          id: 'html-css',
          lessonStarts: [
            {
              lessonId: 'lesson-first-heading',
              target: { kind: 'slide', targetId: 'slide-html-role' },
            },
          ],
        },
      ],
      learningPaths: [
        {
          id: 'frontend',
          title: 'フロントエンド学習パス',
          description: 'Webページから対話型アプリへ、順番に技術を積み上げます。',
          publicationStatus: 'published',
          steps: [
            {
              courseId: 'html-css',
              role: 'required',
              prerequisiteCourseIds: [],
            },
          ],
        },
      ],
    });
    expect(publicCourse.revision).toBe('2026-07-10.1');
    expect(publicCourse.expectedTotals).toMatchObject({
      chapters: 1,
      lessons: 1,
      conceptSlides: 1,
      standardExercises: 1,
    });
    expect(publicCourse.phases[0]?.chapters[0]?.lessons[0]?.slides[0]?.assets).toEqual([
      {
        id: 'html-structure',
        path: 'generated/content/assets/html-css/html-structure.svg',
        mediaType: 'image',
        alt: 'HTML要素が開始Tag、内容、終了Tagから組み上がる図',
        provenanceId: 'html-structure-original',
        intrinsicWidth: 480,
        intrinsicHeight: 900,
      },
    ]);
    expect(publicAsset).toEqual(sourceAsset);
    expect(sourceAssetText).toContain('viewBox="0 0 480 900"');
    expect(sourceAssetText).toContain('max-width:480px');
    const fontSizes = [...sourceAssetText.matchAll(/font-size="(\d+)"/gu)].map((match) =>
      Number(match[1]),
    );
    const minimumFontSize = Math.min(...fontSizes);
    expect(minimumFontSize).toBeGreaterThanOrEqual(24);
    expect([280, 480].map((contentWidth) => minimumFontSize * (contentWidth / 480))).toEqual([
      14, 24,
    ]);
    expect(authoring.exercises[0]?.validationRules.map(({ id }) => id)).toEqual([
      'rule-h1-exists',
      'rule-h1-count',
      'rule-h1-text',
    ]);
    expect(
      authoring.exercises[0]?.fixtures.map(({ id, expectedFeedbackRuleIds }) => ({
        id,
        expectedFeedbackRuleIds,
      })),
    ).toEqual([
      { id: 'solution', expectedFeedbackRuleIds: [] },
      {
        id: 'missing-heading',
        expectedFeedbackRuleIds: ['rule-h1-exists', 'rule-h1-count', 'rule-h1-text'],
      },
      { id: 'wrong-heading-text', expectedFeedbackRuleIds: ['rule-h1-text'] },
      { id: 'duplicate-heading', expectedFeedbackRuleIds: ['rule-h1-count'] },
    ]);
    expect(publicCourseSource).not.toMatch(/solutionFiles|fixtures|promptPath/u);
    expect(publicProvenance).toContain('html-structure-original');
    expect(publicProvenance).not.toMatch(/authoring|\/solution\/|\/fixtures\/|promptPath/u);
  });
});
