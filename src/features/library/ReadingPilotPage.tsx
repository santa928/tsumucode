import { Link, useLoaderData } from 'react-router';
import type { CourseIndex } from '../../core/content/types';
import { ReadingResume } from './ReadingResume';
import { readingLessons, readingLessonPath, readingSlidePath } from './readingTargets';

/** 未完成Courseを公開扱いにせず、準備済みの3Lessonだけへ案内する。 */
export function ReadingPilotPage() {
  const courses = useLoaderData<readonly CourseIndex[]>();
  return (
    <section className="tc-reading-article">
      <h1>3レッスンの試用目次</h1>
      <p>
        制作途中の教材を試す入口です。対象はHTML/CSS導入・JavaScript導入・Closureの3レッスンだけです。JavaScriptコース全体の完成版ではありません。
      </p>
      <p>
        読むだけならスマートフォンでも利用できます。コードの編集・実行は対応するPC演習へ進んでください。Pagesとローカル学習版は保存先が別で、自動同期はありません。
      </p>
      {courses.map((course) => (
        <section key={course.id}>
          <h2>{course.title}</h2>
          <ReadingResume course={course} pilot />
          <ol>
            {readingLessons(course, true).map((lesson) => (
              <li key={lesson.id}>
                <h3>{lesson.title}</h3>
                <p>{lesson.goal}</p>
                <Link to={readingLessonPath(course.id, lesson.id, true)}>
                  一続きに読む：{lesson.title}
                </Link>
                <Link to={readingSlidePath(course.id, lesson.id, lesson.slides[0]!.id, true)}>
                  1枚ずつ読む：{lesson.title}
                </Link>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </section>
  );
}
