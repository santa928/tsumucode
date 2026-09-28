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
        制作途中の教材を試す入口です。対象はHTML/CSS導入・JavaScript導入・Closure・DOMの4単元とclick・input・Formの3単元です。JavaScriptコース全体の完成版ではありません。
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
                {lesson.id === 'javascript-ch08-l03' && (
                  <p>
                    前の単元の
                    <Link to="/library/pilot/javascript/lessons/javascript-ch08-l02/read">
                      Eventと入力のvalue
                    </Link>
                    を使います。入力中の更新と送信した時点の更新を比べて進めましょう。
                  </p>
                )}
                {lesson.id === 'javascript-ch08-l02' && (
                  <p>
                    前の単元の
                    <Link to="/library/pilot/javascript/lessons/javascript-ch08-l01/read">
                      イベントの登録
                    </Link>
                    と、既習の
                    <Link to="/courses/javascript/lessons/javascript-ch04-l04/slides/javascript-ch04-l04-s03">
                      Objectのpropertyを読む説明
                    </Link>
                    を使います。EventとcurrentTargetはこの単元で説明します。
                  </p>
                )}
                {lesson.id === 'javascript-ch08-l01' && (
                  <p>
                    この単元はDOMで文字を変える操作とFunctionを使います。
                    <Link to="/courses/javascript/lessons/javascript-ch07-l01/slides/javascript-ch07-l01-s04">
                      DOMの表示変更
                    </Link>
                    、
                    <Link to="/courses/javascript/lessons/javascript-ch03-l01/slides/javascript-ch03-l01-s03">
                      Functionを呼ぶ説明
                    </Link>
                    、
                    <Link to="/courses/javascript/lessons/javascript-ch03-l04/slides/javascript-ch03-l04-s02">
                      Arrowの引数
                    </Link>
                    へ戻れます。
                  </p>
                )}
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
                {lesson.id === 'javascript-ch07-l04' && (
                  <p>
                    既習の
                    <Link to="/courses/javascript/lessons/javascript-ch03-l04/slides/javascript-ch03-l04-s02">
                      Arrow Functionの引数
                    </Link>
                    と
                    <Link to="/courses/javascript/lessons/javascript-ch05-l01/slides/javascript-ch05-l01-s02">
                      callbackの説明
                    </Link>
                    へ戻れます。forEachはこの単元で初めて説明します。
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
