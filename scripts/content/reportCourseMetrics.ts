/** 検証済み教材の参照実体を作者向けの共通指標へ集計する。 */
import { lstat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { CourseManifest, Slide } from '../../src/core/content/types';
import { compileCourse } from './compileCourse';
import { readYamlFile } from './io';
import { CourseSourceSchema } from './sourceSchema';

export interface CourseMetrics {
  readonly id: string;
  readonly publicationStatus: CourseManifest['publicationStatus'];
  readonly audience: string;
  readonly prerequisites: readonly string[];
  readonly scope: string;
  readonly learningGoals: readonly { readonly lessonId: string; readonly goal: string }[];
  readonly chapters: number;
  readonly lessons: {
    readonly total: number;
    readonly standard: number;
    readonly guidedProject: number;
    readonly capstone: number;
  };
  readonly slides: {
    readonly total: number;
    readonly byKind: Readonly<Record<Slide['kind'], number>>;
    readonly conceptOnly: number;
    readonly legacyConceptFamily: { readonly actual: number; readonly minimum: number };
  };
  readonly exercises: {
    readonly total: number;
    readonly standard: {
      readonly total: number;
      readonly required: number;
      readonly additional: number;
    };
    readonly guidedProject: number;
    readonly capstone: number;
  };
  readonly declaredTotals: CourseManifest['expectedTotals'];
  readonly time: {
    readonly courseConfiguredMinutes: number;
    readonly lessonConfiguredMinutes: number;
    readonly measuredLearningMinutes: null;
  };
}

export interface CourseMetricsReport {
  readonly courses: readonly CourseMetrics[];
  readonly unavailable: readonly {
    readonly id: string;
    readonly publicationStatus: CourseManifest['publicationStatus'] | 'unknown';
    readonly reason: string;
  }[];
}

/** compile済みCourseの実体だけを数え、宣言値を実数へ読み替えない。 */
export function collectCourseMetrics(course: CourseManifest): CourseMetrics {
  const chapters = course.phases.flatMap((phase) => phase.chapters);
  const lessons = chapters.flatMap((chapter) => chapter.lessons);
  const byKind: Record<Slide['kind'], number> = {
    concept: 0,
    comparison: 0,
    diagram: 0,
    code: 0,
    reflection: 0,
    brief: 0,
    guide: 0,
    checklist: 0,
  };
  const lessonCounts = { total: lessons.length, standard: 0, guidedProject: 0, capstone: 0 };
  const exercises = {
    total: 0,
    standard: { total: 0, required: 0, additional: 0 },
    guidedProject: 0,
    capstone: 0,
  };
  let lessonConfiguredMinutes = 0;
  let slideTotal = 0;
  for (const lesson of lessons) {
    lessonConfiguredMinutes += lesson.estimatedMinutes;
    if (lesson.kind === 'standard') lessonCounts.standard += 1;
    else if (lesson.kind === 'guided-project') lessonCounts.guidedProject += 1;
    else lessonCounts.capstone += 1;
    for (const slide of lesson.slides) {
      byKind[slide.kind] += 1;
      slideTotal += 1;
    }
    for (const exercise of lesson.exercises) {
      exercises.total += 1;
      if (exercise.kind === 'standard' && lesson.kind === 'standard') {
        exercises.standard.total += 1;
        if (lesson.completion.requiredExerciseIds.includes(exercise.id)) {
          exercises.standard.required += 1;
        } else {
          exercises.standard.additional += 1;
        }
      } else if (exercise.kind === 'guided-project') {
        exercises.guidedProject += 1;
      } else if (exercise.kind === 'capstone') {
        exercises.capstone += 1;
      }
    }
  }
  return {
    id: course.id,
    publicationStatus: course.publicationStatus,
    audience: course.audience,
    prerequisites: [...course.prerequisites],
    scope: course.description,
    learningGoals: lessons.map(({ id, goal }) => ({ lessonId: id, goal })),
    chapters: chapters.length,
    lessons: lessonCounts,
    slides: {
      total: slideTotal,
      byKind,
      conceptOnly: byKind.concept,
      legacyConceptFamily: {
        actual: byKind.concept + byKind.comparison + byKind.diagram + byKind.code,
        minimum: course.expectedTotals.conceptSlides,
      },
    },
    exercises,
    declaredTotals: { ...course.expectedTotals },
    time: {
      courseConfiguredMinutes: course.estimatedMinutes,
      lessonConfiguredMinutes,
      measuredLearningMinutes: null,
    },
  };
}

/** 全Courseを順番に検証し、分類不能な教材は理由とともに別掲する。生成物は書かない。 */
export async function createCourseMetricsReport(contentRoot: string): Promise<CourseMetricsReport> {
  const root = path.resolve(contentRoot);
  const rootStats = await lstat(root);
  if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) {
    throw new Error('Content RootはsymlinkでないDirectoryを指定してください。');
  }
  const courses: CourseMetrics[] = [];
  const unavailable: CourseMetricsReport['unavailable'][number][] = [];
  const entries = (await readdir(root, { withFileTypes: true })).sort((left, right) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
  );
  for (const entry of entries) {
    if (entry.name === 'learning-paths') continue;
    let publicationStatus: CourseManifest['publicationStatus'] | 'unknown' = 'unknown';
    try {
      if (!entry.isDirectory() || entry.isSymbolicLink()) {
        throw new Error('CourseはsymlinkでないDirectoryを指定してください。');
      }
      const courseRoot = path.join(root, entry.name);
      const source = await readYamlFile(courseRoot, 'course.yaml', CourseSourceSchema);
      publicationStatus = source.publicationStatus;
      if (source.id !== entry.name)
        throw new Error('Course directory名とCourse IDが一致しません。');
      const { runtime } = await compileCourse(courseRoot);
      courses.push(collectCourseMetrics(runtime));
    } catch (error) {
      unavailable.push({
        id: entry.name,
        publicationStatus,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { courses, unavailable };
}

/** 作者向け比較に、状態・計数単位・時間の根拠・到達目標を添える。 */
export function formatCourseMetricsReport(report: CourseMetricsReport): string {
  const lines = [
    '# 教材指標（作者用・参照実体の集計）',
    '',
    'published/draftはSourceの公開指定。実際のデプロイや学習パス掲載の確認とは別です。',
    '枚数・演習数から教材の十分性や実務能力は判定しません。概念説明Slideはkind=conceptの分類数です。',
    '追加演習は標準演習の内数で、Lesson完了条件に含まれない演習です。制作Lesson数は作品数ではありません。',
    '時間は作者の設定値。実測学習時間は未計測で、改訂作業時間・AI操作時間は含めません。',
  ];
  for (const publicationStatus of ['published', 'draft'] as const) {
    lines.push('', `## ${publicationStatus}`);
    for (const course of report.courses.filter(
      (item) => item.publicationStatus === publicationStatus,
    )) {
      lines.push(
        '',
        `### ${course.id}`,
        `章: ${String(course.chapters)} / Lesson: ${JSON.stringify(course.lessons)}`,
        `全Slide: ${String(course.slides.total)} / 種類別: ${JSON.stringify(course.slides.byKind)}`,
        `概念説明Slide(kind=concept): ${String(course.slides.conceptOnly)}`,
        `legacy概念系(concept/comparison/diagram/code): 実数 ${String(course.slides.legacyConceptFamily.actual)} / 最低宣言 ${String(course.slides.legacyConceptFamily.minimum)}`,
        `全Exercise: ${String(course.exercises.total)} / 標準 ${String(course.exercises.standard.total)}（必須 ${String(course.exercises.standard.required)} / 追加 ${String(course.exercises.standard.additional)}）`,
        `手順付き制作(guided-project): ${String(course.lessons.guidedProject)} Lesson / ${String(course.exercises.guidedProject)} Exercise`,
        `独立課題(capstone): ${String(course.lessons.capstone)} Lesson / ${String(course.exercises.capstone)} Exercise（kind分類であり自力習得の測定ではありません）`,
        `metadata宣言(expectedTotals): ${JSON.stringify(course.declaredTotals)}`,
        `設定時間: Course ${String(course.time.courseConfiguredMinutes)}分 / Lesson合計 ${String(course.time.lessonConfiguredMinutes)}分 / 実測学習時間: 未計測`,
        `対象者: ${course.audience}`,
        `前提Course: ${course.prerequisites.join(', ') || 'なし'}`,
        `対象範囲: ${course.scope}`,
        '到達目標（Lesson設定）:',
        ...course.learningGoals.map(({ lessonId, goal }) => `- ${lessonId}: ${goal}`),
      );
    }
  }
  if (report.unavailable.length > 0) {
    lines.push('', '## 集計不能（0件として集計しません）');
    for (const course of report.unavailable) {
      lines.push(`- ${course.id} [${course.publicationStatus}]: ${course.reason}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

/** RepositoryのSourceを読み取り、集計不能時は非ゼロ終了する。 */
async function main(): Promise<void> {
  if (process.argv.length > 3) {
    throw new Error('Usage: tsx scripts/content/reportCourseMetrics.ts [content-root]');
  }
  const report = await createCourseMetricsReport(process.argv[2] ?? 'content');
  process.stdout.write(formatCourseMetricsReport(report));
  if (report.unavailable.length > 0) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main();
}
