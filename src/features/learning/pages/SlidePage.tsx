/** 学習者が現在地を失わず、1画面ずつ前後・一覧・用語へ移れるSlide Viewerを提供する。 */
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
import { LearningDrawer } from '../components/LearningDrawer';
import { SlideStage } from '../components/SlideStage';
import { LearningToolRail } from '../layout/LearningToolRail';
import { LearningViewportShell } from '../layout/LearningViewportShell';
import { learningRuntimeServices } from '../runtimeServices';

type DrawerMode = 'slides' | 'glossary' | undefined;

/** 永続IDだけから、GitHub PagesのHash Router内で使うSlide pathを組み立てる。 */
function buildSlidePath(courseId: string, lessonId: string, slideId: string): string {
  return `/courses/${courseId}/lessons/${lessonId}/slides/${slideId}`;
}

/** 入力中、Drawer内、横スクロール中の矢印操作をSlide shortcutから除外する。 */
function isSlideShortcutBlockedTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.matches('input, textarea, select')) return true;
  const contentEditableAncestor = target.closest('[contenteditable]');
  return (
    target.isContentEditable ||
    target.contentEditable === 'true' ||
    (contentEditableAncestor !== null &&
      contentEditableAncestor.getAttribute('contenteditable') !== 'false') ||
    target.closest('dialog') !== null ||
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

/** Drawerを開くButton向けの共通classを返す。 */
function drawerTriggerClass(): string {
  return 'inline-flex min-h-11 items-center justify-center rounded-workshop-sm border border-workshop-border bg-workshop-surface px-3 py-2 text-sm font-black text-workshop-primary hover:bg-workshop-workbench';
}

/** 一覧・前後移動・Course Map復帰を固定Viewport内に収めるSlide画面。 */
export function SlidePage() {
  const { course, lesson, slide } = useLoaderData<typeof slideLoader>();
  const navigate = useNavigate();
  const canEdit = useEditingCapability();
  const slideTitleRef = useRef<HTMLHeadingElement>(null);
  const slideListTriggerRef = useRef<HTMLButtonElement>(null);
  const glossaryTriggerRef = useRef<HTMLButtonElement>(null);
  const previousSlideIdRef = useRef(slide.id);
  const recordedSlideKeyRef = useRef<string | undefined>(undefined);
  const slideSaveGenerationRef = useRef(0);
  const [slideSaveState, setSlideSaveState] = useState<'idle' | 'error'>('idle');
  const [drawerMode, setDrawerMode] = useState<DrawerMode>();
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

  const drawerPlacement = canEdit ? 'side' : 'bottom';
  const exercisePath = exercise
    ? `/courses/${course.id}/lessons/${lesson.id}/exercises/${exercise.id}`
    : undefined;

  return (
    <>
      <LearningViewportShell
        label="スライド学習"
        header={
          <LearningToolRail coursePath={coursePath} lessonTitle={lesson.title}>
            <PieceProgress
              className="tc-slide-progress"
              completed={index + 1}
              total={lesson.slides.length}
              label="スライドの現在位置"
              compact
            />
            <div className="tc-slide-tools" aria-label="スライドの補助機能">
              <button
                ref={slideListTriggerRef}
                type="button"
                aria-label="スライド一覧を開く"
                className={drawerTriggerClass()}
                onClick={() => {
                  setDrawerMode('slides');
                }}
              >
                一覧
              </button>
              {glossary.length > 0 ? (
                <button
                  ref={glossaryTriggerRef}
                  type="button"
                  aria-label="用語を開く"
                  className={drawerTriggerClass()}
                  onClick={() => {
                    setDrawerMode('glossary');
                  }}
                >
                  用語
                </button>
              ) : null}
            </div>
          </LearningToolRail>
        }
        pager={
          <nav aria-label="スライド移動" className="tc-slide-pager">
            {previous && previousPath ? (
              <Link to={previousPath} className="tc-slide-pager-secondary">
                ← 前のスライドへ
              </Link>
            ) : (
              <span aria-disabled="true" className="tc-slide-pager-disabled">
                最初のスライドです
              </span>
            )}
            {next && nextPath ? (
              <ActionLink to={nextPath} className="w-full">
                次のスライドへ →
              </ActionLink>
            ) : exercise && exercisePath && canEdit ? (
              <ActionLink to={exercisePath} className="w-full">
                {`「${exercise.title}」のコード演習を始める`}
              </ActionLink>
            ) : (
              <ActionLink to={coursePath} className="w-full">
                コースマップへ戻る
              </ActionLink>
            )}
          </nav>
        }
      >
        <div className="tc-slide-stage-stack">
          {slideSaveState === 'error' ? (
            <div role="alert" className="tc-slide-save-error">
              <WorkshopNotice
                tone="correction"
                title="このスライドの閲覧進捗を保存できませんでした"
              >
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

          <SlideStage slide={slide} baseUrl={import.meta.env.BASE_URL} titleRef={slideTitleRef} />

          {!next && exercise && !canEdit ? (
            <StackedCard
              as="aside"
              data-pc-guide
              aria-labelledby="pc-guide-title"
              className="tc-slide-pc-guide border-2 border-workshop-learning bg-workshop-raised"
            >
              <p className="font-black text-workshop-complete">スライド学習はここまで完了</p>
              <h2 id="pc-guide-title" className="mt-2 text-2xl font-black">
                演習はPCで積み上げよう
              </h2>
              <p className="mt-3 leading-7 text-workshop-muted">
                コードを書いて結果を並べて確認するため、幅1024px以上で、マウスまたはトラックパッドを使える環境から開いてください。スライドと進捗はこの端末でも見直せます。
              </p>
            </StackedCard>
          ) : null}
        </div>
      </LearningViewportShell>

      <LearningDrawer
        open={drawerMode === 'slides'}
        title="スライド一覧"
        placement={drawerPlacement}
        returnFocusRef={slideListTriggerRef}
        onClose={() => {
          setDrawerMode(undefined);
        }}
      >
        <nav aria-label="スライド一覧">
          <ol className="space-y-2">
            {lesson.slides.map((item, itemIndex) => {
              const current = item.id === slide.id;
              return (
                <li key={item.id}>
                  <Link
                    to={buildSlidePath(course.id, lesson.id, item.id)}
                    aria-current={current ? 'step' : undefined}
                    className={`tc-slide-drawer-link ${current ? 'tc-slide-drawer-link-current' : ''}`}
                    onClick={() => {
                      setDrawerMode(undefined);
                    }}
                  >
                    <span aria-hidden="true" className="tc-slide-drawer-number">
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
      </LearningDrawer>

      <LearningDrawer
        open={drawerMode === 'glossary'}
        title="このレッスンの用語"
        placement={drawerPlacement}
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
