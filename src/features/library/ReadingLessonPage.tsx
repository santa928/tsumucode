import { useEffect, useRef, useState } from 'react';
import { Link, useLoaderData, useLocation } from 'react-router';
import type { ReadingLessonData } from '../../app/readingContentLoaders';
import { SlideStage } from '../learning/components/SlideStage';
import { ReadingControls } from './ReadingControls';
import { readingIndexPath, readingLessonPath, readingLessons } from './readingTargets';

/** URLで指定された位置を優先し、教材を同じBlockのままLesson単位で読む。 */
export function ReadingLessonPage() {
  const data = useLoaderData<ReadingLessonData>();
  const location = useLocation();
  return (
    <ReadingLessonSession
      key={`${data.lesson.id}:${location.search}`}
      data={data}
      search={location.search}
    />
  );
}

/** 通常Documentの現在sectionだけを記録する。復帰完了前や旧画面からは保存しない。 */
function ReadingLessonSession({
  data: { course, lesson, pilot },
  search,
}: {
  readonly data: ReadingLessonData;
  readonly search: string;
}) {
  const requested = new URLSearchParams(search).get('slide');
  const target = lesson.slides.find((slide) => slide.id === requested) ?? lesson.slides[0]!;
  const [activeSlide, setActiveSlide] = useState(target.id);
  const [ready, setReady] = useState(false);
  const sections = useRef(new Map<string, HTMLElement>());
  const lessons = readingLessons(course, pilot);
  const index = lessons.findIndex((item) => item.id === lesson.id);
  const previous = lessons[index - 1];
  const next = lessons[index + 1];
  useEffect(() => {
    let stopped = false;
    let frame = 0;
    // 明示URLへの復元後にだけ位置の検出を始める。
    const restore = requestAnimationFrame(() => {
      if (stopped) return;
      if (requested !== null && requested === target.id)
        sections.current.get(target.id)?.scrollIntoView();
      else window.scrollTo(0, 0);
      setReady(true);
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onScroll);
    });
    /** 長いsectionにも対応し、複数が見えるときは画面上部を通過した最後のsectionを選ぶ。 */
    function onScroll(): void {
      if (frame !== 0) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (stopped) return;
        let current = lesson.slides[0]!.id;
        const line = window.innerHeight * 0.2;
        for (const slide of lesson.slides) {
          const node = sections.current.get(slide.id);
          if (node !== undefined && node.getBoundingClientRect().top <= line) current = slide.id;
        }
        setActiveSlide(current); // 同じIDなら再描画・保存しない。
      });
    }
    return () => {
      stopped = true;
      cancelAnimationFrame(restore);
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [lesson.slides, requested, target.id]);
  return (
    <article className="tc-reading-article">
      <header>
        <p>{pilot ? '改訂中の3レッスン試用・読書モード' : '読書モード'}</p>
        <h1>{lesson.title}</h1>
        <p>読むことは演習の合格には数えません。コードを動かす指示は、あとでPCで試せます。</p>
        <Link to={readingIndexPath(course.id, pilot)}>
          {pilot ? '3レッスンの試用目次へ' : 'コースの読書目次へ'}
        </Link>
        {requested !== null && requested !== target.id ? (
          <p role="status">前のスライドが見つからないため、このレッスンの目次へ戻りました。</p>
        ) : null}
        <nav aria-label="このレッスンの目次">
          <ol>
            {lesson.slides.map((slide) => (
              <li key={slide.id}>
                <Link
                  to={`${readingLessonPath(course.id, lesson.id, pilot)}?slide=${encodeURIComponent(slide.id)}`}
                >
                  {slide.title}
                </Link>
              </li>
            ))}
          </ol>
        </nav>
        <details>
          <summary>このレッスンの用語</summary>
          <dl>
            {lesson.glossaryRefs
              .map((id) => course.glossary.find((entry) => entry.id === id))
              .filter((entry) => entry !== undefined)
              .map((entry) => (
                <div key={entry.id}>
                  <dt>{entry.term}</dt>
                  <dd>{entry.definition}</dd>
                </div>
              ))}
          </dl>
        </details>
      </header>
      {lesson.slides.map((slide) => (
        <div
          key={slide.id}
          ref={(node) => {
            if (node) sections.current.set(slide.id, node);
            else sections.current.delete(slide.id);
          }}
          data-reading-section={slide.id}
        >
          <SlideStage
            slide={slide}
            codeReference={lesson.slides.find((item) => item.id === slide.codeReferenceSlideId)}
            baseUrl={import.meta.env.BASE_URL}
            reading
            titleLevel={2}
          />
        </div>
      ))}
      <nav aria-label="レッスン移動">
        {previous ? (
          <Link to={readingLessonPath(course.id, previous.id, pilot)}>
            前のレッスン：{previous.title}
          </Link>
        ) : null}
        {next ? (
          <Link to={readingLessonPath(course.id, next.id, pilot)}>次のレッスン：{next.title}</Link>
        ) : null}
      </nav>
      <ReadingControls
        course={course}
        lesson={lesson}
        recordPosition={ready}
        position={{
          scope: pilot ? 'pilot' : 'library',
          courseId: course.id,
          lessonId: lesson.id,
          slideId: activeSlide,
          mode: 'continuous',
        }}
      />
    </article>
  );
}
