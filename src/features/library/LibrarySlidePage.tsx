import { useEffect, useRef, useState } from 'react';
import { Link, useLoaderData, useNavigate } from 'react-router';
import type { librarySlideLoader } from '../../app/libraryContentLoaders';
import type { CourseIndex, Lesson } from '../../core/content/types';
import { LearningDrawer } from '../learning/components/LearningDrawer';
import { SlideStage } from '../learning/components/SlideStage';
import { LearningViewportShell } from '../learning/layout/LearningViewportShell';
import { useAdjacentLessonPrefetch } from '../learning/useAdjacentLessonPrefetch';
import { buildCourseSlideOutlineSequence } from './courseSlideSequence';
import { LibraryToolRail } from './LibraryToolRail';

type DrawerMode = 'slides' | 'glossary' | undefined;

/** 入力中、Dialog内、横スクロール中の矢印操作をViewer shortcutから除外する。 */
function isLibrarySlideShortcutBlockedTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.matches('input, textarea, select')) return true;
  const editable = target.closest('[contenteditable]');
  return (
    target.isContentEditable ||
    target.contentEditable === 'true' ||
    (editable !== null && editable.getAttribute('contenteditable') !== 'false') ||
    target.closest('dialog') !== null ||
    target.closest('[data-slide-horizontal-scroll]') !== null
  );
}

/** 検証済み参照を現在LessonのGlossary entityへ変換する。 */
function resolveGlossary(course: CourseIndex, lesson: Lesson) {
  return lesson.glossaryRefs.map((glossaryId) => {
    const entry = course.glossary.find(({ id }) => id === glossaryId);
    if (entry === undefined) throw new Error(`用語が見つかりません: ${glossaryId}`);
    return entry;
  });
}

/** 進捗へ触れず、Course全体を連続して読めるスライドViewerを表示する。 */
export function LibrarySlidePage() {
  const { course, context, lesson, slide } = useLoaderData<typeof librarySlideLoader>();
  useAdjacentLessonPrefetch(course, lesson.id);
  const navigate = useNavigate();
  const slideTitleRef = useRef<HTMLHeadingElement>(null);
  const slideListTriggerRef = useRef<HTMLButtonElement>(null);
  const glossaryTriggerRef = useRef<HTMLButtonElement>(null);
  const previousSlideIdRef = useRef(context.current.slide.id);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>();
  const { current, next, previous } = context;
  const currentSlideId = current.slide.id;
  const sequence = buildCourseSlideOutlineSequence(course);
  const glossary = resolveGlossary(course, lesson);
  const previousPath = previous?.path;
  const nextPath = next?.path;
  const positionLabel = `Lesson ${String(current.lessonIndex + 1)} / ${String(
    current.lessonCount,
  )}・Slide ${String(current.slideIndex + 1)} / ${String(current.slideCount)}`;

  useEffect(() => {
    if (previousSlideIdRef.current === currentSlideId) return;
    previousSlideIdRef.current = currentSlideId;
    setDrawerMode(undefined);
    slideTitleRef.current?.focus();
  }, [currentSlideId]);

  useEffect(() => {
    /** 修飾Keyなしの左右Arrowだけを、存在する前後Slideへの移動へ割り当てる。 */
    function onKeyDown(event: KeyboardEvent): void {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        isLibrarySlideShortcutBlockedTarget(event.target)
      ) {
        return;
      }

      const destination =
        event.key === 'ArrowLeft'
          ? previousPath
          : event.key === 'ArrowRight'
            ? nextPath
            : undefined;
      if (destination === undefined) return;
      event.preventDefault();
      void navigate(destination);
    }

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [navigate, nextPath, previousPath]);

  return (
    <>
      <LearningViewportShell
        label="スライド閲覧"
        header={
          <LibraryToolRail
            courseId={course.id}
            lessonTitle={current.lesson.title}
            positionLabel={positionLabel}
            onOpenSlides={() => {
              setDrawerMode('slides');
            }}
            {...(glossary.length === 0
              ? {}
              : {
                  onOpenGlossary: () => {
                    setDrawerMode('glossary');
                  },
                })}
            slideListTriggerRef={slideListTriggerRef}
            glossaryTriggerRef={glossaryTriggerRef}
          />
        }
        pager={
          <nav aria-label="スライド移動" className="tc-slide-pager tc-library-pager">
            {previousPath === undefined ? (
              <span aria-disabled="true" className="tc-slide-pager-disabled">
                最初のスライドです
              </span>
            ) : (
              <Link
                to={previousPath}
                aria-label="前のスライドへ"
                className="tc-slide-pager-secondary"
              >
                ← 前へ
              </Link>
            )}
            {nextPath === undefined ? (
              <Link
                to={`/library/${course.id}`}
                aria-label="スライド目次へ戻る"
                className="tc-library-pager-primary"
              >
                スライド目次へ戻る
              </Link>
            ) : (
              <Link to={nextPath} aria-label="次のスライドへ" className="tc-library-pager-primary">
                次へ →
              </Link>
            )}
          </nav>
        }
      >
        <div className="tc-slide-stage-stack tc-library-stage-stack">
          <SlideStage slide={slide} baseUrl={import.meta.env.BASE_URL} titleRef={slideTitleRef} />
        </div>
      </LearningViewportShell>

      <LearningDrawer
        open={drawerMode === 'slides'}
        title="スライド目次"
        placement="bottom"
        heightMode="viewport"
        returnFocusRef={slideListTriggerRef}
        onClose={() => {
          setDrawerMode(undefined);
        }}
      >
        <nav aria-label="スライド目次">
          <ol className="grid gap-2">
            {sequence.map((item) => {
              const isCurrent = item.slide.id === currentSlideId;
              return (
                <li key={item.slide.id}>
                  <Link
                    to={item.path}
                    aria-current={isCurrent ? 'step' : undefined}
                    className={`tc-slide-drawer-link ${
                      isCurrent ? 'tc-slide-drawer-link-current' : ''
                    }`}
                    onClick={() => {
                      setDrawerMode(undefined);
                    }}
                  >
                    <span aria-hidden="true" className="tc-slide-drawer-number">
                      {item.courseSlideIndex + 1}
                    </span>
                    <span>
                      {item.courseSlideIndex + 1}. {item.slide.title}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </nav>
      </LearningDrawer>

      <LearningDrawer
        open={drawerMode === 'glossary'}
        title="このレッスンの用語"
        placement="bottom"
        returnFocusRef={glossaryTriggerRef}
        onClose={() => {
          setDrawerMode(undefined);
        }}
      >
        <dl className="grid gap-3">
          {glossary.map((entry) => (
            <div key={entry.id} className="tc-slide-glossary-entry">
              <dt className="font-black text-workshop-complete">{entry.term}</dt>
              <dd className="mt-1 text-workshop-muted">{entry.definition}</dd>
            </div>
          ))}
        </dl>
      </LearningDrawer>
    </>
  );
}
