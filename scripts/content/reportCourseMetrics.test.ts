// @vitest-environment node
/** 参照実体・公開状態・既存の最低枚数契約を同じ定義で比較する。 */
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { compileCourse } from './compileCourse';
import { readYamlFile } from './io';
import { reconstructCourseManifest, splitCourseArtifacts } from './splitCourseArtifacts';
import { CourseSourceSchema } from './sourceSchema';
import {
  collectCourseMetrics,
  createCourseMetricsReport,
  formatCourseMetricsReport,
  type CourseMetricsReport,
} from './reportCourseMetrics';

const CONTENT_ROOT = path.resolve('content');
const temporaryRoots: string[] = [];
let report: CourseMetricsReport;

beforeAll(async () => {
  report = await createCourseMetricsReport(CONTENT_ROOT);
}, 60_000);

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true })));
});

describe('Course Metrics', () => {
  it('全Courseを集計し、それぞれの公開指定と草稿を混同しない', async () => {
    expect(report.unavailable).toEqual([]);
    expect(report.courses.map(({ id }) => id)).toEqual([
      'html-css',
      'javascript',
      'next',
      'python-basics',
      'python-oop',
      'python-practice',
      'react',
      'tailwind',
      'typescript',
    ]);
    for (const course of report.courses) {
      const source = await readYamlFile(
        path.join(CONTENT_ROOT, course.id),
        'course.yaml',
        CourseSourceSchema,
      );
      expect(course.publicationStatus).toBe(source.publicationStatus);
      expect(Object.values(course.slides.byKind).reduce((sum, count) => sum + count, 0)).toBe(
        course.slides.total,
      );
      expect(course.exercises.standard.required + course.exercises.standard.additional).toBe(
        course.exercises.standard.total,
      );
      expect(course.time.lessonConfiguredMinutes).toBe(course.time.courseConfiguredMinutes);
      expect(course.time.measuredLearningMinutes).toBeNull();
      expect(course.audience).not.toBe('');
      expect(course.scope).not.toBe('');
      expect(course.learningGoals).toHaveLength(course.lessons.total);
    }
  });

  it.each([
    ['javascript', 202, 170, 202],
    ['python-basics', 21, 19, 19],
    ['react', 48, 30, 30],
  ])('%sの全Slide・純concept・legacy最低宣言を分ける', (id, total, pure, minimum) => {
    const metrics = report.courses.find((course) => course.id === id)!;
    expect(metrics.slides.total).toBe(total);
    expect(metrics.slides.conceptOnly).toBe(pure);
    expect(metrics.slides.legacyConceptFamily.minimum).toBe(minimum);
    expect(metrics.slides.legacyConceptFamily.actual).toBeGreaterThanOrEqual(minimum);
  });

  it('JSの任意Closure2件を標準必須と分け、制作のLesson数と演習数を別掲する', () => {
    const metrics = report.courses.find(({ id }) => id === 'javascript')!;
    expect(metrics.exercises).toEqual({
      total: 54,
      standard: { total: 48, required: 46, additional: 2 },
      guidedProject: 5,
      capstone: 1,
    });
    expect(metrics.lessons).toEqual({ total: 52, standard: 46, guidedProject: 5, capstone: 1 });
    expect(metrics.slides.byKind).toMatchObject({
      concept: 170,
      comparison: 10,
      code: 21,
      diagram: 1,
    });
    expect(metrics.declaredTotals.standardExercises).toBe(48);
    expect(metrics.time.courseConfiguredMinutes).toBe(1010);
  });

  it('full/split両検証を通る既存最低枚数を実数と取り違えない', async () => {
    const { runtime } = await compileCourse(path.join(CONTENT_ROOT, 'javascript'));
    const original = structuredClone(runtime);
    const expected = collectCourseMetrics(runtime);
    const split = splitCourseArtifacts(runtime);
    expect(collectCourseMetrics(reconstructCourseManifest(split.index, split.lessons))).toEqual(
      expected,
    );
    const lowerMinimum = structuredClone(runtime);
    lowerMinimum.expectedTotals.conceptSlides = 169;
    const lowerSplit = splitCourseArtifacts(lowerMinimum);
    const actual = collectCourseMetrics(
      reconstructCourseManifest(lowerSplit.index, lowerSplit.lessons),
    );
    expect(actual.slides.legacyConceptFamily).toEqual({ actual: 202, minimum: 169 });
    expect(actual.slides.conceptOnly).toBe(170);
    expect(runtime).toEqual(original);
  }, 60_000);

  it('分類できないSourceを0件にせず、検証済み状態か不明を添えて報告する', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'tsumucode-metrics-'));
    temporaryRoots.push(root);
    await mkdir(path.join(root, 'javascript'));
    await writeFile(
      path.join(root, 'javascript/course.yaml'),
      await readFile(path.join(CONTENT_ROOT, 'javascript/course.yaml'), 'utf8'),
    );
    await mkdir(path.join(root, 'invalid'));
    await writeFile(path.join(root, 'invalid/course.yaml'), 'publicationStatus: draft\n');
    const unavailable = await createCourseMetricsReport(root);
    expect(unavailable.courses).toEqual([]);
    expect(
      unavailable.unavailable.map(({ id, publicationStatus }) => ({ id, publicationStatus })),
    ).toEqual([
      { id: 'invalid', publicationStatus: 'unknown' },
      { id: 'javascript', publicationStatus: 'published' },
    ]);
    expect(unavailable.unavailable.every(({ reason }) => reason.length > 0)).toBe(true);
    expect(formatCourseMetricsReport(unavailable)).toContain('集計不能');
  });

  it('作者向け表示に状態・時間の根拠・前提と到達目標を明示する', () => {
    const output = formatCourseMetricsReport(report);
    expect(output).toContain('## published');
    expect(output).toContain('## draft');
    expect(output).toContain('実測学習時間: 未計測');
    expect(output).toContain('設定時間');
    expect(output).toContain('対象者:');
    expect(output).toContain('前提Course:');
    expect(output).toContain('対象範囲:');
    expect(output).toContain('到達目標');
    expect(output).toContain('最低宣言');
  });
});
