import { Link, useLoaderData } from 'react-router-dom';
import type { libraryCourseLoader } from '../../app/libraryContentLoaders';
import type { Lesson } from '../../core/content/types';
import { buildLibrarySlidePath } from './courseSlideSequence';

const CHAPTER_KIND_LABEL = {
  standard: '基礎レッスン',
  'guided-project': 'ガイド制作',
  capstone: '仕上げ制作',
} as const;

/** Lessonの先頭Slideを返し、公開教材の閲覧契約違反は明示的に失敗する。 */
function requireFirstSlide(lesson: Lesson) {
  const firstSlide = lesson.slides[0];
  if (firstSlide === undefined) {
    throw new Error(`スライド目次へ表示できるSlideがありません: ${lesson.id}`);
  }
  return firstSlide;
}

/** 進捗状態を参照せず、公開Courseの全Slide入口を階層目次として表示する。 */
export function LibraryIndexPage() {
  const course = useLoaderData<typeof libraryCourseLoader>();

  return (
    <div className="tc-library-index">
      <header className="tc-library-index-hero">
        <div>
          <p className="tc-library-index-kicker">設計図ライブラリ</p>
          <h1>{course.title} スライド目次</h1>
          <p className="tc-library-index-lead">進捗を変えずに、すべてのスライドを自由に読めます</p>
        </div>
        <Link to={`/courses/${course.id}`} className="tc-library-study-return">
          通常学習へ戻る
        </Link>
      </header>

      <div className="tc-library-phase-list">
        {course.phases.map((phase) => (
          <section key={phase.id} aria-labelledby={`library-phase-${phase.id}`}>
            <header className="tc-library-phase-heading">
              <div>
                <p className="tc-library-phase-label">Phase</p>
                <h2 id={`library-phase-${phase.id}`}>{phase.title}</h2>
              </div>
              <p>{phase.description}</p>
            </header>

            <div className="tc-library-chapter-list">
              {phase.chapters.map((chapter) => (
                <section
                  key={chapter.id}
                  aria-labelledby={`library-chapter-${chapter.id}`}
                  className="tc-library-chapter"
                >
                  <header className="tc-library-chapter-heading">
                    <div>
                      <p className="tc-library-kind-label">{CHAPTER_KIND_LABEL[chapter.kind]}</p>
                      <h3 id={`library-chapter-${chapter.id}`}>{chapter.title}</h3>
                    </div>
                    <p>{chapter.goal}</p>
                  </header>

                  <ol className="tc-library-lesson-list">
                    {chapter.lessons.map((lesson) => {
                      const firstSlide = requireFirstSlide(lesson);
                      return (
                        <li key={lesson.id}>
                          <article
                            aria-labelledby={`library-lesson-${lesson.id}`}
                            className="tc-library-lesson-card"
                          >
                            <div className="tc-library-lesson-copy">
                              <p className="tc-library-slide-count">{lesson.slides.length}枚</p>
                              <h4 id={`library-lesson-${lesson.id}`}>{lesson.title}</h4>
                              <p>{lesson.goal}</p>
                            </div>
                            <Link
                              to={buildLibrarySlidePath(course.id, lesson.id, firstSlide.id)}
                              className="tc-library-lesson-link"
                            >
                              {lesson.title}を先頭から見る
                            </Link>
                          </article>
                        </li>
                      );
                    })}
                  </ol>
                </section>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
