/** 学習者が現在地を失わず、前後・一覧・Course Mapへ戻れるSlide Viewerを提供する。 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLoaderData, useNavigate } from 'react-router-dom';
import type { CourseManifest, Lesson } from '../../../core/content/types';
import { recordSlideView } from '../../../core/persistence/progressUpdates';
import type { slideLoader } from '../../../app/contentLoaders';
import { ActionLink } from '../../../design-system/components/ActionLink';
import { PieceProgress } from '../../../design-system/components/PieceProgress';
import { StackedCard } from '../../../design-system/components/StackedCard';
import { WorkshopNotice } from '../../../design-system/components/WorkshopNotice';
import { useEditingCapability } from '../../../shared/device/editingCapability';
import { SlideBlocks } from '../components/SlideBlocks';
import { learningRuntimeServices } from '../runtimeServices';

/** 永続IDだけから、GitHub PagesのHash Router内で使うSlide pathを組み立てる。 */
function buildSlidePath(courseId: string, lessonId: string, slideId: string): string {
  return `/courses/${courseId}/lessons/${lessonId}/slides/${slideId}`;
}

/** 入力中または横スクロール中の矢印操作をSlide shortcutから除外する。 */
function isSlideShortcutBlockedTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.matches('input, textarea, select')) return true;
  const contentEditableAncestor = target.closest('[contenteditable]');
  return (
    target.isContentEditable ||
    target.contentEditable === 'true' ||
    (contentEditableAncestor !== null &&
      contentEditableAncestor.getAttribute('contenteditable') !== 'false') ||
    target.closest('[data-slide-horizontal-scroll]') !== null
  );
}

/** 検証済み参照をGlossary entityへ変換し、契約違反なら明示的に失敗する。 */
function resolveGlossary(course: CourseManifest, lesson: Lesson) {
  return lesson.glossaryRefs.map((glossaryId) => {
    const entry = course.glossary.find(({ id }) => id === glossaryId);
    if (entry === undefined) throw new Error(`用語が見つかりません: ${glossaryId}`);
    return entry;
  });
}

/** 一覧・前後移動・Course Map復帰を備え、概念を何度でも見直せるSlide画面。 */
export function SlidePage() {
  const { course, lesson, slide } = useLoaderData<typeof slideLoader>();
  const navigate = useNavigate();
  const canEdit = useEditingCapability();
  const slideTitleRef = useRef<HTMLHeadingElement>(null);
  const slideTrayDetailsRef = useRef<HTMLDetailsElement>(null);
  const previousSlideIdRef = useRef(slide.id);
  const recordedSlideKeyRef = useRef<string | undefined>(undefined);
  const slideSaveGenerationRef = useRef(0);
  const [slideSaveState, setSlideSaveState] = useState<'idle' | 'saving' | 'error'>('idle');
  const index = lesson.slides.findIndex(({ id }) => id === slide.id);
  if (index < 0) throw new Error(`Lesson内にSlideが見つかりません: ${slide.id}`);

  const previous = lesson.slides[index - 1];
  const next = lesson.slides[index + 1];
  const exercise = lesson.exercises[0];
  const coursePath = `/courses/${course.id}`;
  const previousPath = previous ? buildSlidePath(course.id, lesson.id, previous.id) : undefined;
  const nextPath = next ? buildSlidePath(course.id, lesson.id, next.id) : undefined;
  const glossary = resolveGlossary(course, lesson);

  const slideSaveKey = `${course.id}:${course.revision}:${slide.id}`;

  /** 現在のSlide閲覧を保存し、失敗時だけ同じSlideから明示的に再試行できる状態へ戻す。 */
  const saveSlideProgress = useCallback((): void => {
    const key = slideSaveKey;
    if (recordedSlideKeyRef.current === key) return;
    recordedSlideKeyRef.current = key;
    slideSaveGenerationRef.current += 1;
    const generation = slideSaveGenerationRef.current;
    setSlideSaveState('saving');
    void (async () => {
      try {
        await learningRuntimeServices.ready;
        await learningRuntimeServices.runCourseProgressMutation(course.id, async () => {
          const current = await learningRuntimeServices.repository.getCourseVersioned(course.id);
          await learningRuntimeServices.repository.putCourseVersioned(
            recordSlideView(current.progress, course, lesson, slide.id, new Date().toISOString()),
            current.version,
          );
        });
        if (slideSaveGenerationRef.current !== generation) return;
        setSlideSaveState('idle');
        learningRuntimeServices.notices.dismiss('error:slide-progress');
      } catch (error: unknown) {
        if (slideSaveGenerationRef.current !== generation) return;
        recordedSlideKeyRef.current = undefined;
        setSlideSaveState('error');
        learningRuntimeServices.notices.reportError('slide-progress', error);
      }
    })();
  }, [course, lesson, slide.id, slideSaveKey]);

  useEffect(() => {
    saveSlideProgress();
    return () => {
      slideSaveGenerationRef.current += 1;
      if (recordedSlideKeyRef.current === slideSaveKey) {
        recordedSlideKeyRef.current = undefined;
      }
    };
  }, [saveSlideProgress, slideSaveKey]);

  useEffect(() => {
    if (previousSlideIdRef.current === slide.id) return;
    previousSlideIdRef.current = slide.id;
    slideTitleRef.current?.focus();
  }, [slide.id]);

  useEffect(() => {
    if (!canEdit || slideTrayDetailsRef.current === null) return;
    slideTrayDetailsRef.current.open = true;
  }, [canEdit]);

  useEffect(() => {
    /** Form操作を保護しつつ、修飾Keyなしの左右Arrowだけを前後移動へ割り当てる。 */
    function onKeyDown(event: KeyboardEvent): void {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        isSlideShortcutBlockedTarget(event.target)
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
    <div className="grid items-start gap-8 lg:grid-cols-[17rem_minmax(0,1fr)]">
      <StackedCard
        as="aside"
        aria-labelledby="slide-tray-title"
        className="bg-workshop-workbench p-4 lg:sticky lg:top-6"
      >
        <p id="slide-tray-title" className="text-sm font-black text-workshop-complete">
          スライド部品トレイ
        </p>
        <Link
          to={coursePath}
          className="mt-2 inline-flex min-h-11 w-full items-center rounded-workshop-sm px-3 py-2 font-bold underline decoration-2 underline-offset-4 hover:bg-workshop-surface"
        >
          ← コースマップへ戻る
        </Link>
        <PieceProgress
          className="mt-5 border-t border-workshop-border pt-5"
          completed={index + 1}
          total={lesson.slides.length}
          label="スライドの現在位置"
        />
        <details
          ref={slideTrayDetailsRef}
          className="tc-slide-tray-details mt-5 border-t border-workshop-border pt-5"
        >
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-workshop-sm bg-workshop-surface px-3 py-2 font-black text-workshop-primary">
            スライド一覧を開く
            <span
              aria-hidden="true"
              className="tc-slide-tray-indicator text-xl leading-none transition-transform duration-[var(--tc-motion-fast)]"
            >
              ＋
            </span>
          </summary>
          <nav aria-label="スライド一覧" className="mt-3">
            <ol className="space-y-2">
              {lesson.slides.map((item, itemIndex) => {
                const current = item.id === slide.id;
                return (
                  <li key={item.id}>
                    <Link
                      to={buildSlidePath(course.id, lesson.id, item.id)}
                      aria-current={current ? 'step' : undefined}
                      className={`grid min-h-11 grid-cols-[2rem_minmax(0,1fr)] items-center gap-2 rounded-workshop-sm border px-2 py-2 font-bold transition-colors duration-[var(--tc-motion-fast)] ${
                        current
                          ? 'border-workshop-primary bg-workshop-learning text-workshop-ink shadow-[var(--tc-shadow-piece)]'
                          : 'border-transparent bg-workshop-surface hover:border-workshop-border'
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className="grid size-8 place-items-center rounded-workshop-piece bg-workshop-raised"
                      >
                        {itemIndex + 1}
                      </span>
                      <span>
                        {itemIndex + 1}. {item.title}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </nav>
        </details>
      </StackedCard>

      <section aria-labelledby="slide-title" className="min-w-0">
        <header>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-black text-workshop-complete">{lesson.title}</p>
            <p className="rounded-workshop-sm bg-workshop-workbench px-3 py-1.5 text-sm font-black">
              {index + 1} / {lesson.slides.length}
            </p>
          </div>
          {slide.concept ? (
            <p className="mt-4 inline-flex rounded-workshop-sm bg-workshop-learning px-3 py-1 text-sm font-black">
              今回のピース：{slide.concept}
            </p>
          ) : null}
          <h1
            id="slide-title"
            ref={slideTitleRef}
            tabIndex={-1}
            className="mt-3 text-3xl font-black md:text-5xl"
          >
            {slide.title}
          </h1>
        </header>

        {slideSaveState === 'error' ? (
          <div role="alert" className="mt-6">
            <WorkshopNotice tone="correction" title="このスライドの閲覧進捗を保存できませんでした">
              <p>本文はそのまま読めます。保存だけをもう一度試せます。</p>
              <button
                type="button"
                onClick={saveSlideProgress}
                className="mt-3 inline-flex min-h-11 items-center rounded-workshop-md border-2 border-workshop-correction px-4 py-2 font-bold text-workshop-correction"
              >
                閲覧進捗をもう一度保存
              </button>
            </WorkshopNotice>
          </div>
        ) : null}

        <StackedCard data-slide-card className="mt-7 bg-workshop-surface p-5 md:p-8">
          <div className="max-w-[var(--tc-content-reading)]">
            <SlideBlocks
              blocks={slide.blocks}
              assets={slide.assets}
              baseUrl={import.meta.env.BASE_URL}
            />
          </div>
        </StackedCard>

        {glossary.length > 0 ? (
          <StackedCard
            as="aside"
            aria-labelledby="glossary-title"
            className="mt-7 bg-workshop-raised p-5 md:p-6"
          >
            <h2 id="glossary-title" className="text-xl font-black">
              このレッスンの用語
            </h2>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              {glossary.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-workshop-sm border border-workshop-border bg-workshop-surface p-4"
                >
                  <dt className="font-black text-workshop-complete">{entry.term}</dt>
                  <dd className="mt-1 text-workshop-muted">{entry.definition}</dd>
                </div>
              ))}
            </dl>
          </StackedCard>
        ) : null}

        <nav aria-label="スライド移動" className="mt-8 grid gap-3 sm:grid-cols-2">
          {previous && previousPath ? (
            <Link
              to={previousPath}
              className="inline-flex min-h-11 items-center justify-center rounded-workshop-md border-2 border-workshop-primary bg-workshop-surface px-5 py-3 font-bold text-workshop-primary hover:bg-workshop-workbench"
            >
              ← 前のスライドへ
            </Link>
          ) : (
            <span
              aria-disabled="true"
              className="inline-flex min-h-11 items-center justify-center rounded-workshop-md border border-workshop-border bg-workshop-sunken px-5 py-3 font-bold text-workshop-muted"
            >
              最初のスライドです
            </span>
          )}
          {next && nextPath ? (
            <ActionLink to={nextPath} className="w-full">
              次のスライドへ →
            </ActionLink>
          ) : (
            <span
              aria-disabled="true"
              className="inline-flex min-h-11 items-center justify-center rounded-workshop-md border border-workshop-border bg-workshop-sunken px-5 py-3 font-bold text-workshop-muted"
            >
              このスライドが最後です
            </span>
          )}
        </nav>

        {!next && exercise && canEdit ? (
          <StackedCard
            as="section"
            aria-labelledby="exercise-next-title"
            className="mt-8 border-2 border-workshop-complete bg-workshop-raised"
          >
            <p className="font-black text-workshop-complete">設計図を読み終えました</p>
            <h2 id="exercise-next-title" className="mt-2 text-2xl font-black">
              次はコード演習へ
            </h2>
            <p className="mt-3 text-workshop-muted">
              コードを書いて、結果をプレビューしながら確認できます。スライドはいつでもこのURLから見直せます。
            </p>
            <div className="mt-5">
              <ActionLink
                to={`/courses/${course.id}/lessons/${lesson.id}/exercises/${exercise.id}`}
                className="w-full sm:w-auto"
              >
                {`「${exercise.title}」のコード演習を始める`}
              </ActionLink>
            </div>
          </StackedCard>
        ) : null}

        {!next && exercise && !canEdit ? (
          <StackedCard
            as="aside"
            data-pc-guide
            aria-labelledby="pc-guide-title"
            className="mt-8 border-2 border-workshop-learning bg-workshop-raised"
          >
            <p className="font-black text-workshop-complete">スライド学習はここまで完了</p>
            <h2 id="pc-guide-title" className="mt-2 text-2xl font-black">
              演習はPCで積み上げよう
            </h2>
            <p className="mt-3 leading-7 text-workshop-muted">
              コードを書いて結果を並べて確認するため、幅1024px以上で、マウスまたはトラックパッドを使える環境から開いてください。スライドと進捗はこの端末でも見直せます。
            </p>
            <div className="mt-5">
              <ActionLink to={coursePath} className="w-full sm:w-auto">
                コースマップへ戻る
              </ActionLink>
            </div>
          </StackedCard>
        ) : null}
      </section>
    </div>
  );
}
