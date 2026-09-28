import { Link, useLoaderData } from 'react-router';
import type { CourseIndex } from '../../core/content/types';
import { ReadingResume } from './ReadingResume';
import { readingLessons, readingLessonPath, readingSlidePath } from './readingTargets';

/** 未完成Courseを公開扱いにせず、準備済みLessonだけへ案内する。 */
export function ReadingPilotPage() {
  const courses = useLoaderData<readonly CourseIndex[]>();
  return (
    <section className="tc-reading-article">
      <h1>試用レッスンの目次</h1>
      <p>
        制作途中の教材を試す入口です。対象はHTML/CSS導入・JavaScript導入・Closure・DOMの最初の3単元です。JavaScriptコース全体の完成版ではありません。
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
                {lesson.id === 'javascript-ch07-l01' && (
                  <p>
                    この単元はHTMLのid/class、JavaScriptのconst・変数・ifを使います。
                    <Link to="/courses/javascript/lessons/javascript-ch01-l02/slides/javascript-ch01-l02-s01">
                      変数の説明
                    </Link>
                    と
                    <Link to="/courses/javascript/lessons/javascript-ch02-l02/slides/javascript-ch02-l02-s02">
                      ifの説明
                    </Link>
                    を先に確認できます。
                  </p>
                )}
                {lesson.id === 'javascript-ch07-l02' && (
                  <p>
                    最初のDOM単元の続きです。HTML/CSSの
                    <Link to="/courses/html-css/lessons/html-css-ch06-l04/slides/html-css-ch06-l04-s01">
                      共通のclassの説明
                    </Link>
                    も確認できます。
                  </p>
                )}
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
