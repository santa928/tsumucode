import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { EditorView } from '@codemirror/view';
import userEvent from '@testing-library/user-event';
import { RouterProvider } from 'react-router/dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixtureCourse } from '../../../../tests/fixtures/course';
import { createSplitCourseFetchFixture } from '../../../../tests/fixtures/splitCourseDelivery';
import {
  GUIDED_WORKSPACE_ID,
  guidedWorkspaceCourse,
} from '../../../../tests/fixtures/guidedWorkspaceCourse';
import { CourseManifestSchema } from '../../../core/content/schema';
import type { CourseManifest } from '../../../core/content/types';
import {
  LeaseFenceRejectedError,
  type CourseProgress,
  type ExerciseDraft,
  type WorkspaceLeaseProof,
} from '../../../core/persistence/contracts';
import type {
  TabLeaseAcquireOptions,
  TabLeaseState,
  TabLeaseWriteFence,
} from '../../../core/persistence/TabLeaseCoordinator';
import type { PersistenceHealthSnapshot } from '../../../core/persistence/ResilientProgressService';
import type { RunnerAdapter } from '../../../core/runtime/contracts';
import type { ValidatorAdapter } from '../../../core/validation/contracts';
import { createAppRouter } from '../../../app/router';

const runtime = vi.hoisted(() => {
  const emptyNotices: readonly unknown[] = [];
  const healthyProgress: PersistenceHealthSnapshot = Object.freeze({
    kind: 'healthy' as const,
    hasUnsavedChanges: false,
  });
  const editorLanguageFactories = new Map<string, () => unknown>();
  const leaseListeners = new Set<() => void>();
  const fencedWriteCalls = vi.fn();
  const leaseProof: WorkspaceLeaseProof = {
    courseId: 'html-css',
    workspaceId: 'workspace-first-heading',
    ownerId: 'owner-a',
    token: 'lease-token',
    dataEpoch: 0,
    expiresAt: 2_000,
  };
  const runFencedWrite: TabLeaseWriteFence = async <Result,>(
    operation: (token: string, proof: WorkspaceLeaseProof) => Result | Promise<Result>,
  ): Promise<Result> => {
    fencedWriteCalls();
    if (lease.writeError !== undefined) throw lease.writeError;
    return operation('lease-token', leaseProof);
  };
  const lease = {
    state: Object.freeze({ status: 'owned', coordination: 'available' }) as TabLeaseState,
    beforeYield: undefined as TabLeaseAcquireOptions['beforeYield'] | undefined,
    takeover: vi.fn(async () => false),
    runFencedWrite,
    fencedWriteCalls,
    writeError: undefined as Error | undefined,
    release: vi.fn(async () => undefined),
    dispose: vi.fn(),
    setState(state: TabLeaseState): void {
      lease.state = Object.freeze({ ...state });
      for (const listener of [...leaseListeners]) listener();
    },
    reset(): void {
      lease.state = Object.freeze({ status: 'owned', coordination: 'available' });
      lease.beforeYield = undefined;
      lease.takeover.mockReset().mockResolvedValue(false);
      lease.fencedWriteCalls.mockClear();
      lease.writeError = undefined;
      lease.release.mockClear();
      lease.dispose.mockClear();
    },
  };
  const leaseHandle = {
    getSnapshot: () => lease.state,
    subscribe: (listener: () => void) => {
      leaseListeners.add(listener);
      return () => {
        leaseListeners.delete(listener);
      };
    },
    takeover: lease.takeover,
    runFencedWrite: lease.runFencedWrite,
    release: lease.release,
    dispose: lease.dispose,
  };
  const leaseCoordinator = {
    acquire: vi.fn((_courseId: string, _workspaceId: string, options: TabLeaseAcquireOptions) => {
      lease.beforeYield = options.beforeYield;
      return leaseHandle;
    }),
  };
  return {
    readyPromise: Promise.resolve(),
    ensureCourseIndex: vi.fn(async () => undefined),
    ensureCourseRuntime: vi.fn<(_course: unknown, _services: unknown) => Promise<void>>(
      async () => undefined,
    ),
    repository: {
      open: vi.fn(async () => undefined),
      getCourse: vi.fn<(courseId: string) => Promise<CourseProgress | undefined>>(),
      getCourseVersioned:
        vi.fn<
          (
            courseId: string,
          ) => Promise<{ readonly progress?: CourseProgress; readonly version: number }>
        >(),
      putCourse: vi.fn<(progress: CourseProgress) => Promise<void>>(async () => undefined),
      putCourseVersioned: vi.fn<
        (progress: CourseProgress, expectedVersion: number) => Promise<number>
      >(async () => 1),
      getDraft:
        vi.fn<(courseId: string, workspaceId: string) => Promise<ExerciseDraft | undefined>>(),
      putDraft: vi.fn<(draft: ExerciseDraft) => Promise<void>>(async () => undefined),
      putDraftFenced: vi.fn<(draft: ExerciseDraft) => Promise<void>>(async () => undefined),
      putDraftAndCourse: vi.fn<(draft: ExerciseDraft, progress: CourseProgress) => Promise<void>>(
        async () => undefined,
      ),
      putDraftAndCourseFenced: vi.fn<
        (draft: ExerciseDraft, progress: CourseProgress) => Promise<number>
      >(async () => 1),
      snapshot: vi.fn(),
      replaceSnapshot: vi.fn(),
      createBackup: vi.fn(),
      restoreBackup: vi.fn(),
      quarantine: vi.fn(),
      close: vi.fn(),
    },
    progressService: {
      getHealthSnapshot: vi.fn<() => PersistenceHealthSnapshot>(() => healthyProgress),
      subscribeHealth: vi.fn(() => () => undefined),
      retainEmergencyDraft: vi.fn<(draft: ExerciseDraft) => void>(),
    },
    transferService: {
      exportAll: vi.fn(async () => '{}'),
    },
    retryPersistence: vi.fn(async () => ({ kind: 'recovered' as const })),
    resolvePersistenceConflict: vi.fn(async () => undefined),
    passFreshness: {
      isDirty: vi.fn(() => false),
      markDirty: vi.fn(),
      markPassed: vi.fn(),
    },
    runnerRegistry: { create: vi.fn() },
    readOnlyPreviewRegistry: { create: vi.fn() },
    validatorRegistry: { has: vi.fn(() => false), register: vi.fn(), create: vi.fn() },
    editorLanguageRegistry: {
      has: (id: string) => editorLanguageFactories.has(id),
      register: (id: string, factory: () => unknown) => editorLanguageFactories.set(id, factory),
      extensionFor: (id: string) => editorLanguageFactories.get(id)?.() ?? [],
    },
    notices: {
      getSnapshot: vi.fn(() => emptyNotices),
      subscribe: vi.fn(() => () => undefined),
      addMigrationNotices: vi.fn(),
      reportError: vi.fn(),
      dismiss: vi.fn(),
    },
    lease,
    leaseCoordinator,
    runCourseProgressMutation: async <Result,>(
      _courseId: string,
      mutation: () => Promise<Result>,
    ): Promise<Result> => mutation(),
  };
});

vi.mock('../runtimeServices', () => ({
  learningRuntimeServices: {
    repository: runtime.repository,
    progressService: runtime.progressService,
    transferService: runtime.transferService,
    passFreshness: runtime.passFreshness,
    runnerRegistry: runtime.runnerRegistry,
    readOnlyPreviewRegistry: runtime.readOnlyPreviewRegistry,
    validatorRegistry: runtime.validatorRegistry,
    editorLanguageRegistry: runtime.editorLanguageRegistry,
    notices: runtime.notices,
    leaseCoordinator: runtime.leaseCoordinator,
    ensureCourseIndex: runtime.ensureCourseIndex,
    runCourseProgressMutation: runtime.runCourseProgressMutation,
    retryPersistence: runtime.retryPersistence,
    resolvePersistenceConflict: runtime.resolvePersistenceConflict,
    get ready() {
      return runtime.readyPromise;
    },
  },
}));

vi.mock('../javascriptRuntimeServices', () => ({
  ensureCourseRuntime: runtime.ensureCourseRuntime,
}));

const originalHash = window.location.hash;
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
let router: ReturnType<typeof createAppRouter> | undefined;

const standardPhase = fixtureCourse.phases[0]!;
const guidedChapter = structuredClone(guidedWorkspaceCourse.phases[0]!.chapters[0]!);
guidedChapter.id = 'ch01-guided-workspace';
guidedChapter.sequence = 1;
/** Route Suiteが参照する標準Lessonと共有workspace工程を同じ不変Catalogへ統合する。 */
const learningRoutesCourse: CourseManifest = CourseManifestSchema.parse({
  ...fixtureCourse,
  estimatedMinutes: 45,
  expectedTotals: {
    chapters: 2,
    lessons: 3,
    conceptSlides: 3,
    standardExercises: 1,
    guidedProjectLessons: 2,
    capstoneLessons: 0,
    estimatedMinutes: 45,
  },
  phases: [
    {
      ...standardPhase,
      chapters: [standardPhase.chapters[0]!, guidedChapter],
    },
  ],
});

/** Console初期選択を実画面まで通す最小JavaScript Courseを作る。 */
const javascriptLearningRoutesCourse: CourseManifest = CourseManifestSchema.parse({
  ...fixtureCourse,
  id: 'javascript',
  title: 'JavaScript はじめの一歩',
  runnerId: 'javascript',
  validatorId: 'javascript',
  publicationStatus: 'draft',
  provenanceManifestPath: 'generated/content/courses/javascript/provenance.json',
  phases: fixtureCourse.phases.map((phase) => ({
    ...phase,
    chapters: phase.chapters.map((chapter) => ({
      ...chapter,
      lessons: chapter.lessons.map((lesson) => ({
        ...lesson,
        exercises: lesson.exercises.map((exercise) => ({
          ...exercise,
          files: [
            ...exercise.files,
            {
              path: 'script.js',
              language: 'javascript',
              content: 'console.log("hello");',
              editable: true,
            },
          ],
          validationRules: [
            ...exercise.validationRules,
            {
              id: 'rule-javascript-message',
              label: 'JavaScriptで文章を変更する',
              required: true,
              group: 'all',
              viewportMode: 'all',
              viewportIds: ['desktop'],
              target: { kind: 'javascript-source', file: 'script.js' },
              assertion: {
                kind: 'query-selector-text-content-assignment',
                selector: '#message',
                expected: 'hello',
              },
              feedback: {
                target: 'Consoleの文章',
                expected: 'JavaScriptから変更する',
                nextAction: 'script.jsの代入を確認します。',
              },
              hintId: exercise.hints[0]?.id,
              relatedSlideId: exercise.relatedSlideIds[0],
            },
          ],
          runtime: {
            kind: 'javascript',
            entryFile: 'script.js',
            sourceType: 'script',
            capabilityProfile: 'core',
            primaryOutput: 'console',
          },
        })),
      })),
    })),
  })),
});

/** 公開Catalog v3・Course Index・Lesson Manifestを本番と同じcanonical bytesで返す。 */
function stubContentFetch(course: CourseManifest = learningRoutesCourse): void {
  const fixturePromise = createSplitCourseFetchFixture(course);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : input.toString();
      const { sources } = await fixturePromise;
      const source = [...sources].find(([relativePath]) => url.endsWith(relativePath))?.[1];
      return source === undefined
        ? new Response('not found', { status: 404 })
        : new Response(source, { status: 200, headers: { 'content-type': 'application/json' } });
    }),
  );
}

/** CSS media queryだけで編集可否を固定する。 */
function stubEditingCapability(canEdit: boolean): void {
  stubEditingCapabilityControl(canEdit);
}

/** Media Queryのchangeを発火できる編集可否stubを返す。 */
function stubEditingCapabilityControl(initialCanEdit: boolean): {
  readonly setCanEdit: (canEdit: boolean) => void;
} {
  const listeners = new Set<(event: Event) => void>();
  const mediaQueryList = {
    matches: initialCanEdit,
    media: '(min-width: 1024px) and (pointer: fine)',
    addEventListener: (_type: string, listener: (event: Event) => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: string, listener: (event: Event) => void) => {
      listeners.delete(listener);
    },
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => mediaQueryList),
  );
  return {
    setCanEdit(canEdit: boolean): void {
      mediaQueryList.matches = canEdit;
      for (const listener of [...listeners]) listener(new Event('change'));
    },
  };
}

/** Hash routeを実AppShellごと表示し、dispose責任をTestへ保持する。 */
function renderRoute(path: string): void {
  window.history.replaceState({}, '', `/#${path}`);
  router = createAppRouter();
  render(<RouterProvider router={router} />);
}

/** Dynamic importを含む編集作業台が全Suite負荷下でも準備完了するまで待つ。 */
async function findCodeWorkspace(): Promise<HTMLElement> {
  return screen.findByTestId('code-workspace', {}, { timeout: 5_000 });
}

/** Dynamic import後にmountされた実CodeMirror viewを返す。 */
async function findEditorView(): Promise<EditorView> {
  return waitFor(() => {
    const editorElement = document.querySelector<HTMLElement>('.cm-editor');
    if (editorElement === null) throw new Error('CodeMirror elementを待機しています');
    const view = EditorView.findFromDOM(editorElement);
    if (view === null) throw new Error('CodeMirror viewを待機しています');
    return view;
  });
}

/** 現在Course revisionと同じ合格snapshotを持つDraftを作る。 */
function passingDraft(): ExerciseDraft {
  return {
    courseId: fixtureCourse.id,
    lessonId: 'lesson-first-heading',
    exerciseId: 'exercise-first-heading',
    workspaceId: 'workspace-first-heading',
    contentRevision: fixtureCourse.revision,
    editRevision: 4,
    files: { 'index.html': '<main><h1>できた</h1></main>' },
    selectedFile: 'index.html',
    cursors: {},
    validationHistory: [],
    revealedHintIds: [],
    lastPassingSnapshots: {
      'exercise-first-heading': {
        editRevision: 4,
        contentRevision: fixtureCourse.revision,
        files: { 'index.html': '<main><h1>できた</h1></main>' },
        evaluatedAt: '2026-07-10T00:01:00.000Z',
      },
    },
    updatedAt: '2026-07-10T00:01:00.000Z',
  };
}

/** Completion loaderが必要とする現在完了済みCourseProgressを作る。 */
function completedProgress(): CourseProgress {
  return {
    courseId: fixtureCourse.id,
    contentRevision: fixtureCourse.revision,
    lessons: {
      'lesson-first-heading': {
        lessonId: 'lesson-first-heading',
        viewedSlideIds: ['slide-html-role'],
        currentSlideId: 'slide-html-role',
        passedExerciseIds: ['exercise-first-heading'],
        passedChecklistItemIds: [],
        passedRuleIds: ['rule-h1-exists'],
        passedViewportIds: ['desktop'],
        currentComplete: true,
        firstCompletedAt: '2026-07-10T00:01:00.000Z',
      },
    },
    currentLessonId: 'lesson-first-heading',
    currentChapterId: 'ch00-web-map',
    currentComplete: true,
    firstCompletedAt: '2026-07-10T00:01:00.000Z',
    updatedAt: '2026-07-10T00:01:00.000Z',
  };
}

/** 最終Slide閲覧済みでExercise判定前のCourseProgressを作る。 */
function viewedProgress(): CourseProgress {
  const completed = completedProgress();
  return {
    ...completed,
    lessons: {
      'lesson-first-heading': {
        ...completed.lessons['lesson-first-heading']!,
        passedExerciseIds: [],
        passedRuleIds: [],
        passedViewportIds: [],
        currentComplete: false,
      },
    },
    currentComplete: false,
  };
}

/** Guided工程1だけ合格し、工程2のSlideまで閲覧済みのCourseProgressを作る。 */
function guidedStepOneProgress(): CourseProgress {
  const standardProgress = completedProgress().lessons['lesson-first-heading']!;
  return {
    courseId: guidedWorkspaceCourse.id,
    contentRevision: guidedWorkspaceCourse.revision,
    lessons: {
      'lesson-first-heading': standardProgress,
      'lesson-guided-step-1': {
        lessonId: 'lesson-guided-step-1',
        viewedSlideIds: ['slide-guided-step-1'],
        currentSlideId: 'slide-guided-step-1',
        passedExerciseIds: ['exercise-guided-step-1'],
        passedChecklistItemIds: ['checklist-guided-step-1'],
        passedRuleIds: ['rule-guided-step-1'],
        passedViewportIds: ['viewport-guided-step-1'],
        currentComplete: true,
        firstCompletedAt: '2026-07-10T00:00:00.000Z',
      },
      'lesson-guided-step-2': {
        lessonId: 'lesson-guided-step-2',
        viewedSlideIds: ['slide-guided-step-2'],
        currentSlideId: 'slide-guided-step-2',
        passedExerciseIds: [],
        passedChecklistItemIds: [],
        passedRuleIds: [],
        passedViewportIds: [],
        currentComplete: false,
      },
    },
    currentLessonId: 'lesson-guided-step-2',
    currentChapterId: 'ch01-guided-workspace',
    currentComplete: false,
    updatedAt: '2026-07-10T00:00:00.000Z',
  };
}

/** Guided工程1の合格Sourceとsnapshotを共有workspace Draftへ保存した状態を作る。 */
function guidedStepOneDraft(): ExerciseDraft {
  const files = { 'index.html': '<main><h1>工程1</h1></main>' };
  return {
    courseId: guidedWorkspaceCourse.id,
    lessonId: 'lesson-guided-step-1',
    exerciseId: 'exercise-guided-step-1',
    workspaceId: GUIDED_WORKSPACE_ID,
    contentRevision: guidedWorkspaceCourse.revision,
    editRevision: 1,
    files,
    selectedFile: 'index.html',
    cursors: { 'index.html': { anchor: 10, head: 10 } },
    validationHistory: [],
    revealedHintIds: [],
    lastPassingSnapshots: {
      'exercise-guided-step-1': {
        editRevision: 1,
        contentRevision: guidedWorkspaceCourse.revision,
        files,
        evaluatedAt: '2026-07-10T00:00:00.000Z',
      },
    },
    updatedAt: '2026-07-10T00:00:00.000Z',
  };
}

interface AdapterStubOptions {
  readonly prepare?: RunnerAdapter['prepare'];
  readonly render?: RunnerAdapter['render'];
}

/** 初期化gate確認用の副作用なしRunnerとValidatorを返す。 */
function stubAdapters(options: AdapterStubOptions = {}): {
  readonly runner: RunnerAdapter;
  readonly prepare: ReturnType<typeof vi.fn<RunnerAdapter['prepare']>>;
  readonly render: ReturnType<typeof vi.fn<RunnerAdapter['render']>>;
  readonly dispose: ReturnType<typeof vi.fn<RunnerAdapter['dispose']>>;
  readonly validator: ValidatorAdapter;
  readonly validate: ReturnType<typeof vi.fn<ValidatorAdapter['validate']>>;
  readonly getLastRenderInput: () => Parameters<RunnerAdapter['render']>[0] | undefined;
} {
  let lastRenderInput: Parameters<RunnerAdapter['render']>[0] | undefined;
  const prepare = vi.fn<RunnerAdapter['prepare']>(options.prepare ?? (async () => undefined));
  const render = vi.fn<RunnerAdapter['render']>(
    options.render ??
      (async (input) => {
        lastRenderInput = input;
        return {
          exerciseSessionId: input.exerciseSessionId,
          executionRevision: input.executionRevision,
          diagnostics: [],
          evidence: [],
          console: [],
        };
      }),
  );
  const dispose = vi.fn<RunnerAdapter['dispose']>(async () => undefined);
  const runner: RunnerAdapter = {
    languageId: 'html-css',
    prepare,
    render: async (input) => {
      lastRenderInput = input;
      return render(input);
    },
    requestSnapshot: vi.fn<RunnerAdapter['requestSnapshot']>(async (request) => {
      if (lastRenderInput === undefined) throw new Error('render inputがありません');
      return {
        exerciseSessionId: request.exerciseSessionId,
        executionRevision: request.executionRevision,
        viewport: lastRenderInput.viewport,
        nodes: [],
        documentOverflow: {
          x: false,
          y: false,
          scrollWidth: lastRenderInput.viewport.width,
          scrollHeight: lastRenderInput.viewport.height,
          clientWidth: lastRenderInput.viewport.width,
          clientHeight: lastRenderInput.viewport.height,
        },
      };
    }),
    dispose,
  };
  const validate = vi.fn<ValidatorAdapter['validate']>(async (context) => ({
    exerciseId: context.exerciseId,
    executionRevision: Object.values(context.snapshots)[0]?.executionRevision ?? null,
    status: 'pass' as const,
    checks: [],
    passedRequirementIds: context.rules.map(({ groupId, id }) => groupId ?? id),
    diagnostics: [],
    evaluatedAt: context.now,
  }));
  const validator: ValidatorAdapter = {
    buildSnapshotPolicy: vi.fn(() => ({
      selectors: [],
      attributes: [],
      computedStyles: [],
      focusVisibleSelectors: [],
      focusVisibleComputedStyles: [],
      includeAllElements: false,
    })),
    validate,
  };
  runtime.runnerRegistry.create.mockReturnValue(runner);
  runtime.readOnlyPreviewRegistry.create.mockReturnValue(runner);
  runtime.validatorRegistry.create.mockReturnValue(validator);
  return {
    runner,
    prepare,
    render,
    dispose,
    validator,
    validate,
    getLastRenderInput: () => lastRenderInput,
  };
}

beforeEach(() => {
  stubContentFetch();
  runtime.readyPromise = Promise.resolve();
  runtime.ensureCourseIndex.mockClear();
  runtime.ensureCourseRuntime.mockReset().mockResolvedValue(undefined);
  runtime.repository.getCourse.mockReset().mockResolvedValue(undefined);
  runtime.repository.getCourseVersioned.mockReset().mockImplementation(async (courseId) => {
    const progress = await runtime.repository.getCourse(courseId);
    return { ...(progress === undefined ? {} : { progress }), version: 0 };
  });
  runtime.repository.getDraft.mockReset().mockResolvedValue(undefined);
  runtime.repository.putDraftFenced.mockReset().mockImplementation(async (draft) => {
    await runtime.repository.putDraft(draft);
  });
  runtime.repository.putDraftAndCourseFenced
    .mockReset()
    .mockImplementation(async (draft, progress) => {
      await runtime.repository.putDraftAndCourse(draft, progress);
      return 1;
    });
  runtime.repository.putCourseVersioned.mockReset().mockImplementation(async (progress) => {
    await runtime.repository.putCourse(progress);
    return 1;
  });
  runtime.repository.putCourse.mockClear();
  runtime.runnerRegistry.create.mockReset();
  runtime.readOnlyPreviewRegistry.create.mockReset();
  runtime.validatorRegistry.create.mockReset();
  runtime.passFreshness.isDirty.mockReset().mockReturnValue(false);
  runtime.passFreshness.markDirty.mockClear();
  runtime.passFreshness.markPassed.mockClear();
  runtime.notices.reportError.mockClear();
  runtime.notices.dismiss.mockClear();
  runtime.progressService.getHealthSnapshot.mockReset().mockReturnValue({
    kind: 'healthy',
    hasUnsavedChanges: false,
  });
  runtime.progressService.retainEmergencyDraft.mockClear();
  runtime.lease.reset();
  runtime.leaseCoordinator.acquire.mockClear();
});

afterEach(() => {
  router?.dispose();
  router = undefined;
  window.location.hash = originalHash;
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  if (originalClipboard === undefined) {
    Reflect.deleteProperty(navigator, 'clipboard');
  } else {
    Object.defineProperty(navigator, 'clipboard', originalClipboard);
  }
});

describe('Learning routes', () => {
  it('小画面ではEditorとRunnerを起動せず、PC理由・非同期説明・Export導線を表示する', async () => {
    stubEditingCapability(false);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn(async () => undefined) },
    });

    renderRoute('/courses/html-css/lessons/lesson-first-heading/exercises/exercise-first-heading');

    expect(
      await screen.findByRole('heading', { name: 'PCで演習を開く' }, { timeout: 10_000 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('complementary', { name: 'コード編集はPCから利用できます' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/幅1024px以上/u)).toBeInTheDocument();
    expect(screen.getByText(/端末間で自動同期されません/u)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '端末データを書き出す' })).toHaveAttribute(
      'href',
      '#/?focus=device-data',
    );
    expect(screen.queryByTestId('code-workspace')).not.toBeInTheDocument();
    expect(runtime.runnerRegistry.create).not.toHaveBeenCalled();
    expect(runtime.ensureCourseIndex).toHaveBeenCalledTimes(1);
  }, 15_000);

  it('小画面の進捗確認中もPC案内を先に表示し、保存領域待ちをLCPへ持ち込まない', async () => {
    stubEditingCapability(false);
    let resolveCourse!: (value: CourseProgress | undefined) => void;
    runtime.repository.getCourse.mockReturnValueOnce(
      new Promise<CourseProgress | undefined>((resolve) => {
        resolveCourse = resolve;
      }),
    );

    renderRoute('/courses/html-css/lessons/lesson-first-heading/exercises/exercise-first-heading');

    expect(await screen.findByRole('heading', { name: 'PCで演習を開く' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('この端末の完成状態を確認しています');

    await act(async () => {
      resolveCourse(undefined);
    });
    await waitFor(() => {
      expect(screen.queryByText('この端末の完成状態を確認しています')).not.toBeInTheDocument();
    });
  });

  it('小画面でも現在合格済みならFull Runnerを作らず専用portでread-only Previewを表示する', async () => {
    stubEditingCapability(false);
    const { getLastRenderInput } = stubAdapters();
    runtime.repository.getCourse.mockResolvedValue(completedProgress());
    runtime.repository.getDraft.mockResolvedValue(passingDraft());

    renderRoute('/courses/html-css/lessons/lesson-first-heading/exercises/exercise-first-heading');

    expect(
      await screen.findByRole('heading', { name: 'h1見出しを追加するの完成Preview' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('runtime-preview-frame')).toBeInTheDocument();
    expect(screen.queryByTestId('code-workspace')).not.toBeInTheDocument();
    expect(runtime.runnerRegistry.create).not.toHaveBeenCalled();
    expect(runtime.readOnlyPreviewRegistry.create).toHaveBeenCalledWith(fixtureCourse.runnerId);
    await waitFor(() => {
      expect(getLastRenderInput()?.options).toEqual({ readOnly: true });
    });
  });

  it('完了PreviewとURL copy・端末間非同期説明・端末データ導線を同時に表示する', async () => {
    stubEditingCapability(false);
    stubAdapters();
    runtime.repository.getCourse.mockResolvedValue(completedProgress());
    runtime.repository.getDraft.mockResolvedValue(passingDraft());
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    renderRoute('/courses/html-css/lessons/lesson-first-heading/exercises/exercise-first-heading');

    expect(
      await screen.findByRole('heading', { name: 'h1見出しを追加するの完成Preview' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/端末間で自動同期されません/u)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '端末データを書き出す' })).toHaveAttribute(
      'href',
      '#/?focus=device-data',
    );
    const previewFrame = screen.getByTitle('コードのプレビュー');
    expect(previewFrame).toHaveAttribute('sandbox', '');

    await userEvent.click(screen.getByRole('button', { name: 'この演習URLをコピー' }));
    expect(writeText).toHaveBeenCalledWith(window.location.href);
    expect(screen.getByRole('status')).toHaveTextContent('演習URLをコピーしました');
    expect(screen.getByTitle('コードのプレビュー')).toBe(previewFrame);
    expect(previewFrame).toHaveAttribute('sandbox', '');
  });

  it('演習URL copyの成功と失敗をlive messageで伝える', async () => {
    stubEditingCapability(false);
    const user = userEvent.setup();
    const writeText = vi
      .fn<() => Promise<void>>()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('clipboard denied'));
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    renderRoute('/courses/html-css/lessons/lesson-first-heading/exercises/exercise-first-heading');
    const copy = await screen.findByRole('button', { name: 'この演習URLをコピー' });

    await user.click(copy);
    expect(writeText).toHaveBeenLastCalledWith(window.location.href);
    expect(screen.getByRole('status')).toHaveTextContent('演習URLをコピーしました');

    await user.click(copy);
    expect(screen.getByRole('alert')).toHaveTextContent('演習URLをコピーできませんでした');
  });

  it('演習URL copy待機中のcapability切替後は旧画面の完了通知を破棄する', async () => {
    const capability = stubEditingCapabilityControl(false);
    stubAdapters();
    let resolveCopy!: () => void;
    const writeText = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveCopy = resolve;
        }),
    );
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    renderRoute('/courses/html-css/lessons/lesson-first-heading/exercises/exercise-first-heading');

    await userEvent.click(await screen.findByRole('button', { name: 'この演習URLをコピー' }));
    expect(screen.getByRole('button', { name: 'コピーしています' })).toBeDisabled();

    act(() => {
      capability.setCanEdit(true);
    });
    expect(await findCodeWorkspace()).toBeInTheDocument();

    await act(async () => {
      resolveCopy();
    });
    expect(screen.queryByText('演習URLをコピーしました')).not.toBeInTheDocument();
  });

  it('Desktopでもlease claiming中はEditor・Runnerを生成せず、owned後だけ編集Sessionをmountする', async () => {
    stubEditingCapability(true);
    stubAdapters();
    runtime.lease.setState({ status: 'claiming', coordination: 'available' });

    renderRoute('/courses/html-css/lessons/lesson-first-heading/exercises/exercise-first-heading');

    expect(await screen.findByText('このworkspaceの編集権を確認しています。')).toHaveAttribute(
      'role',
      'status',
    );
    expect(screen.queryByTestId('code-workspace')).not.toBeInTheDocument();
    expect(runtime.runnerRegistry.create).not.toHaveBeenCalled();

    act(() => {
      runtime.lease.setState({ status: 'owned', coordination: 'available', ownerId: 'tab-a' });
    });

    expect(await findCodeWorkspace()).toBeInTheDocument();
    expect(runtime.runnerRegistry.create).toHaveBeenCalledWith(fixtureCourse.runnerId);
  });

  it('DesktopはCourse固有Runtimeの遅延準備が終わるまでEditorとRunnerを生成しない', async () => {
    stubEditingCapability(true);
    stubAdapters();
    let resolveRuntime!: () => void;
    runtime.ensureCourseRuntime.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveRuntime = resolve;
      }),
    );

    renderRoute('/courses/html-css/lessons/lesson-first-heading/exercises/exercise-first-heading');

    expect(await screen.findByText('演習環境を読み込んでいます')).toHaveAttribute('role', 'status');
    expect(runtime.runnerRegistry.create).not.toHaveBeenCalled();
    expect(screen.queryByTestId('code-workspace')).not.toBeInTheDocument();

    await act(async () => {
      resolveRuntime();
    });
    expect(await findCodeWorkspace()).toBeInTheDocument();
    expect(runtime.ensureCourseRuntime).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'html-css' }),
      expect.objectContaining({ runnerRegistry: runtime.runnerRegistry }),
    );
  });

  it('Course固有Runtimeの読込失敗へFocusを移し、同じSourceのまま再試行する', async () => {
    stubEditingCapability(true);
    stubAdapters();
    runtime.ensureCourseRuntime.mockRejectedValueOnce(new Error('chunk offline'));

    renderRoute('/courses/html-css/lessons/lesson-first-heading/exercises/exercise-first-heading');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('演習環境を読み込めませんでした');
    await waitFor(() => {
      expect(alert).toHaveFocus();
    });
    expect(runtime.runnerRegistry.create).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'もう一度読み込む' }));
    expect(await findCodeWorkspace()).toBeInTheDocument();
    expect(runtime.ensureCourseRuntime).toHaveBeenCalledTimes(2);
  });

  it('保存Banner表示中はlease coordination警告を重複せず作業台を直後に表示する', async () => {
    stubEditingCapability(true);
    stubAdapters();
    runtime.progressService.getHealthSnapshot.mockReturnValue({
      kind: 'memory-only',
      cause: 'open',
      hasUnsavedChanges: true,
    });
    runtime.lease.setState({ status: 'owned', coordination: 'unavailable' });

    renderRoute('/courses/html-css/lessons/lesson-first-heading/exercises/exercise-first-heading');

    expect(
      await screen.findByRole('heading', { name: 'この端末へ保存できていません' }),
    ).toBeInTheDocument();
    expect(await findCodeWorkspace()).toBeInTheDocument();
    expect(screen.queryByText(/複数のタブで同時に開かないでください/u)).not.toBeInTheDocument();
  });

  it('lease競合中はEditor・Runnerを生成せず、明示takeover成功後だけ編集を開始する', async () => {
    stubEditingCapability(true);
    stubAdapters();
    runtime.lease.setState({
      status: 'read-only',
      coordination: 'available',
      ownerId: 'tab-other',
    });
    let resolveTakeover!: (acquired: boolean) => void;
    runtime.lease.takeover.mockReturnValueOnce(
      new Promise<boolean>((resolve) => {
        resolveTakeover = resolve;
      }),
    );
    const user = userEvent.setup();

    renderRoute('/courses/html-css/lessons/lesson-first-heading/exercises/exercise-first-heading');

    expect(
      await screen.findByRole('heading', { name: '別のタブで編集中です' }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('code-workspace')).not.toBeInTheDocument();
    expect(runtime.runnerRegistry.create).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'このタブで編集を引き継ぐ' }));

    act(() => {
      runtime.lease.setState({ status: 'owned', coordination: 'available', ownerId: 'tab-a' });
      resolveTakeover(true);
    });

    expect(await findCodeWorkspace()).toBeInTheDocument();
    expect(runtime.lease.takeover).toHaveBeenCalledOnce();
    expect(runtime.runnerRegistry.create).toHaveBeenCalledWith(fixtureCourse.runnerId);
  });

  it('beforeYieldでpending autosaveをfenced writeとしてflushし、yielding直後に編集Sessionを外す', async () => {
    stubEditingCapability(true);
    stubAdapters();
    const user = userEvent.setup();
    renderRoute('/courses/html-css/lessons/lesson-first-heading/exercises/exercise-first-heading');
    expect(await findCodeWorkspace()).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'ヒントを見る' }));
    await user.click(screen.getByRole('button', { name: /ヒント1を見る/u }));
    await act(async () => {
      await runtime.lease.beforeYield?.(runtime.lease.runFencedWrite);
    });

    expect(runtime.lease.fencedWriteCalls).toHaveBeenCalled();
    expect(runtime.repository.putDraft).toHaveBeenCalled();

    act(() => {
      runtime.lease.setState({ status: 'yielding', coordination: 'available', ownerId: 'tab-a' });
    });
    expect(screen.queryByTestId('code-workspace')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('編集内容を保存して引き継いでいます');
  });

  it('失効leaseでpending autosaveをflushできない場合は最新Draftを緊急Export専用に退避する', async () => {
    stubEditingCapability(true);
    stubAdapters();
    const user = userEvent.setup();
    renderRoute('/courses/html-css/lessons/lesson-first-heading/exercises/exercise-first-heading');
    expect(await findCodeWorkspace()).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'ヒントを見る' }));
    await user.click(screen.getByRole('button', { name: /ヒント1を見る/u }));
    runtime.lease.writeError = new LeaseFenceRejectedError();

    await expect(runtime.lease.beforeYield?.(runtime.lease.runFencedWrite)).rejects.toBeInstanceOf(
      LeaseFenceRejectedError,
    );

    expect(runtime.progressService.retainEmergencyDraft).toHaveBeenCalledOnce();
    const rescued = runtime.progressService.retainEmergencyDraft.mock.calls[0]?.[0];
    expect(rescued).toMatchObject({
      courseId: fixtureCourse.id,
      workspaceId: 'workspace-first-heading',
    });
    expect(rescued?.revealedHintIds).toContain('hint-h1-1');
  });

  it('DesktopではRepository初期化が終わるまでEditor・Preview・判定を操作可能にしない', async () => {
    stubEditingCapability(true);
    stubAdapters();
    let resolveDraft!: (value: ExerciseDraft | undefined) => void;
    runtime.repository.getDraft.mockReturnValueOnce(
      new Promise<ExerciseDraft | undefined>((resolve) => {
        resolveDraft = resolve;
      }),
    );

    renderRoute('/courses/html-css/lessons/lesson-first-heading/exercises/exercise-first-heading');

    expect(await screen.findByText('演習を準備しています')).toHaveAttribute('role', 'status');
    expect(screen.queryByTestId('code-workspace')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '判定する' })).not.toBeInTheDocument();

    await act(async () => {
      resolveDraft(undefined);
    });
    expect(await findCodeWorkspace()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'プレビューを更新' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '判定する' })).toBeEnabled();
  });

  it('Desktop演習を固定Shellの工程票・Editor・Preview・Pagerへ分ける', async () => {
    stubEditingCapability(true);
    stubAdapters();
    renderRoute('/courses/html-css/lessons/lesson-first-heading/exercises/exercise-first-heading');

    expect(await findCodeWorkspace()).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: '学習ツール' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'TsumuCodeホームへ（ベータ版）' })).toHaveAttribute(
      'href',
      '#/',
    );
    expect(screen.getByRole('region', { name: 'コード演習の本文' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '演習の手順' })).toBeInTheDocument();
    const instructions = screen.getByRole('complementary', { name: '工程票' });
    expect(instructions).toHaveAttribute('tabindex', '0');
    expect(
      within(instructions).getByRole('heading', {
        level: 1,
        name: 'h1見出しを追加する',
      }),
    ).toBeVisible();
    expect(screen.queryByText(/^作業中/u)).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'index.html' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'ヒントを見る' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'プレビューを更新' })).toBeEnabled();
      expect(screen.getByRole('button', { name: '判定する' })).toBeEnabled();
    });
    expect(screen.getByTestId('runtime-preview-frame')).toBeInTheDocument();
  });

  it('JavaScript演習はprimary outputのConsoleを初期選択し、最新recordを表示する', async () => {
    // RepositoryのCatalog cacheを既存html-css Fixtureから分離する。
    vi.stubEnv('BASE_URL', '/javascript-route-test/');
    stubContentFetch(javascriptLearningRoutesCourse);
    stubEditingCapability(true);
    stubAdapters({
      render: async (input) => ({
        exerciseSessionId: input.exerciseSessionId,
        executionRevision: input.executionRevision,
        diagnostics: [],
        evidence: [],
        console: [{ sequence: 0, level: 'log', text: 'hello' }],
      }),
    });

    renderRoute(
      '/courses/javascript/lessons/lesson-first-heading/exercises/exercise-first-heading',
    );

    expect(await findCodeWorkspace()).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Console' })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByText('hello')).toBeVisible();
    });
    expect(screen.getByTitle('コードのプレビュー')).toBeInTheDocument();
  }, 10_000);

  it('Repository初期化失敗を未処理Promiseにせず再試行可能な警告へ変換する', async () => {
    stubEditingCapability(true);
    stubAdapters();
    runtime.repository.getDraft.mockRejectedValue(new Error('indexeddb failed'));

    renderRoute('/courses/html-css/lessons/lesson-first-heading/exercises/exercise-first-heading');

    expect(await screen.findByRole('alert')).toHaveTextContent('演習を準備できませんでした');
    const retry = screen.getByRole('button', { name: 'もう一度準備する' });
    expect(retry).toBeEnabled();
    expect(screen.queryByTestId('code-workspace')).not.toBeInTheDocument();
    const callsBeforeRetry = runtime.repository.getDraft.mock.calls.length;

    runtime.repository.getDraft.mockResolvedValue(undefined);
    await userEvent.click(retry);
    expect(await findCodeWorkspace()).toBeInTheDocument();
    expect(runtime.repository.getDraft.mock.calls.length).toBeGreaterThan(callsBeforeRetry);
  });

  it('初回Previewの読込中は操作を止め、失敗後は再試行できる警告へ戻す', async () => {
    stubEditingCapability(true);
    let rejectPrepare!: (reason?: unknown) => void;
    const prepareGate = new Promise<void>((_resolve, reject) => {
      rejectPrepare = reject;
    });
    stubAdapters({ prepare: () => prepareGate });

    renderRoute('/courses/html-css/lessons/lesson-first-heading/exercises/exercise-first-heading');

    const busyPreview = await screen.findByRole('button', { name: '更新しています' });
    expect(busyPreview).toBeDisabled();
    expect(screen.getByRole('button', { name: '判定する' })).toBeDisabled();

    await act(async () => {
      rejectPrepare(new Error('runner chunk failed'));
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('プレビューを準備できませんでした');
    expect(screen.getByRole('button', { name: 'プレビューを再準備' })).toBeEnabled();
  });

  it('初回prepare失敗後の再試行は同じframeを再prepareしてからPreviewへ回復する', async () => {
    stubEditingCapability(true);
    let prepared = false;
    const prepare = vi.fn<RunnerAdapter['prepare']>(async () => {
      if (prepare.mock.calls.length === 1) throw new Error('chunk load failed');
      prepared = true;
    });
    const adapters = stubAdapters({
      prepare,
      render: async (input) => {
        if (!prepared) throw new Error('frame is not prepared');
        return {
          exerciseSessionId: input.exerciseSessionId,
          executionRevision: input.executionRevision,
          diagnostics: [],
          evidence: [],
          console: [],
        };
      },
    });
    renderRoute('/courses/html-css/lessons/lesson-first-heading/exercises/exercise-first-heading');
    expect(await screen.findByRole('alert')).toHaveTextContent('プレビューを準備できませんでした');

    const retry = screen.getByRole('button', { name: 'プレビューを再準備' });
    expect(retry).toBeEnabled();
    await userEvent.click(retry);

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'プレビューを更新' })).toBeEnabled();
    });
    expect(adapters.prepare).toHaveBeenCalledTimes(2);
    expect(adapters.render).toHaveBeenCalledOnce();
  });

  it('再prepare成功後のrender失敗は再初期化せず通常のPreview更新で再試行する', async () => {
    stubEditingCapability(true);
    const prepare = vi.fn<RunnerAdapter['prepare']>(async () => {
      if (prepare.mock.calls.length === 1) throw new Error('chunk load failed');
    });
    const render = vi.fn<RunnerAdapter['render']>(async (input) => {
      if (render.mock.calls.length === 1) throw new Error('render failed');
      return {
        exerciseSessionId: input.exerciseSessionId,
        executionRevision: input.executionRevision,
        diagnostics: [],
        evidence: [],
        console: [],
      };
    });
    const adapters = stubAdapters({ prepare, render });
    renderRoute('/courses/html-css/lessons/lesson-first-heading/exercises/exercise-first-heading');

    await userEvent.click(await screen.findByRole('button', { name: 'プレビューを再準備' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('プレビューを更新できませんでした');
    const retryRender = screen.getByRole('button', { name: 'プレビューを更新' });
    expect(retryRender).toBeEnabled();
    await userEvent.click(retryRender);

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
    expect(adapters.prepare).toHaveBeenCalledTimes(2);
    expect(adapters.render).toHaveBeenCalledTimes(2);
  });

  it('Desktopのpending Preview中にRoute離脱しても完了callbackを捨て、hookがRunnerを一度だけ解放する', async () => {
    stubEditingCapability(true);
    let blockRender = false;
    let resolveRender!: () => void;
    const renderGate = new Promise<void>((resolve) => {
      resolveRender = resolve;
    });
    const adapters = stubAdapters({
      render: async (input) => {
        if (blockRender) await renderGate;
        return {
          exerciseSessionId: input.exerciseSessionId,
          executionRevision: input.executionRevision,
          diagnostics: [],
          evidence: [],
          console: [],
        };
      },
    });
    renderRoute('/courses/html-css/lessons/lesson-first-heading/exercises/exercise-first-heading');
    await waitFor(() => {
      expect(adapters.render).toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'プレビューを更新' })).toBeEnabled();
    });
    adapters.dispose.mockClear();
    runtime.notices.dismiss.mockClear();
    blockRender = true;
    await userEvent.click(screen.getByRole('button', { name: 'プレビューを更新' }));
    expect(screen.getByRole('button', { name: '更新しています' })).toBeDisabled();

    await act(async () => {
      await router!.navigate('/courses/html-css');
    });
    expect(router!.state.location.pathname).toBe('/courses/html-css');
    expect(adapters.dispose).not.toHaveBeenCalled();

    await act(async () => {
      resolveRender();
    });
    await waitFor(() => {
      expect(adapters.dispose).toHaveBeenCalledOnce();
    });
    expect(runtime.notices.dismiss).not.toHaveBeenCalledWith('error:exercise-preview');
  });

  it('read-only prepare中のcapability切替はrenderを中止し、完了後に専用adapterを一度だけ解放する', async () => {
    const capability = stubEditingCapabilityControl(false);
    let resolvePrepare!: () => void;
    const prepareGate = new Promise<void>((resolve) => {
      resolvePrepare = resolve;
    });
    const readOnlyAdapters = stubAdapters({ prepare: () => prepareGate });
    runtime.readOnlyPreviewRegistry.create.mockReset().mockReturnValue(readOnlyAdapters.runner);
    runtime.repository.getCourse.mockResolvedValue(completedProgress());
    runtime.repository.getDraft.mockResolvedValue(passingDraft());
    renderRoute('/courses/html-css/lessons/lesson-first-heading/exercises/exercise-first-heading');
    expect(
      await screen.findByRole('heading', { name: 'h1見出しを追加するの完成Preview' }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(readOnlyAdapters.prepare).toHaveBeenCalledOnce();
    });
    readOnlyAdapters.dispose.mockClear();

    act(() => {
      capability.setCanEdit(true);
    });
    expect(readOnlyAdapters.dispose).not.toHaveBeenCalled();

    await act(async () => {
      resolvePrepare();
    });
    await waitFor(() => {
      expect(readOnlyAdapters.dispose).toHaveBeenCalledOnce();
    });
    expect(
      readOnlyAdapters.render.mock.calls.some(([input]) => input.options['readOnly'] === true),
    ).toBe(false);
  });

  it('見直しRouteは所有Lessonを越えてSlideを解決し、演習へ戻る導線を保つ', async () => {
    stubEditingCapability(false);
    renderRoute(
      '/courses/html-css/lessons/lesson-first-heading/exercises/exercise-first-heading/review/slide-html-role',
    );

    expect(
      await screen.findByRole('heading', { level: 1, name: 'HTMLは意味を伝える' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: '演習へ戻る' })).toHaveTextContent(
      'コードと判定履歴は保存されています',
    );
    expect(screen.getByRole('button', { name: '演習へ戻る' })).toBeEnabled();
  });

  it('完了状態と最新passing snapshotが揃うとCompletionを表示する', async () => {
    stubEditingCapability(false);
    runtime.repository.getCourse.mockResolvedValue(completedProgress());
    runtime.repository.getDraft.mockResolvedValue(passingDraft());
    renderRoute(
      '/courses/html-css/lessons/lesson-first-heading/exercises/exercise-first-heading/completion',
    );

    expect(await screen.findByTestId('learning-completion')).toHaveTextContent(
      'ピースがはまりました',
    );
    expect(screen.getByRole('progressbar', { name: 'レッスンの完成' })).toHaveAttribute(
      'aria-valuetext',
      '1 / 1 ピース完了',
    );
    expect(screen.getByRole('link', { name: 'コースマップへ戻る' })).toHaveAttribute(
      'href',
      '#/courses/html-css',
    );
  });

  it('Guided工程2の編集で全工程をdirty化し、同じSource・Viewport・Asset unionから原子的に再合格する', async () => {
    stubContentFetch();
    stubEditingCapability(true);
    const adapters = stubAdapters();
    let storedCourse: CourseProgress | undefined = guidedStepOneProgress();
    let storedDraft: ExerciseDraft | undefined = guidedStepOneDraft();
    runtime.repository.getCourse.mockImplementation(async () => storedCourse);
    runtime.repository.getDraft.mockImplementation(async () => storedDraft);
    runtime.repository.putDraft.mockImplementation(async (draft) => {
      storedDraft = structuredClone(draft);
    });
    runtime.repository.putDraftAndCourse.mockImplementation(async (draft, progress) => {
      storedDraft = structuredClone(draft);
      storedCourse = structuredClone(progress);
    });

    renderRoute('/courses/html-css/lessons/lesson-guided-step-2/exercises/exercise-guided-step-2');
    expect(await findCodeWorkspace()).toBeInTheDocument();
    const editorView = await waitFor(() => {
      const editorElement = document.querySelector<HTMLElement>('.cm-editor');
      if (editorElement === null) throw new Error('CodeMirror elementを待機しています');
      const view = EditorView.findFromDOM(editorElement);
      if (view === null) throw new Error('CodeMirror viewを待機しています');
      return view;
    });
    const editedSource = '<main><h1>工程1を保った工程2</h1></main>';

    act(() => {
      editorView.dispatch({
        changes: { from: 0, to: editorView.state.doc.length, insert: editedSource },
      });
    });
    await waitFor(() => {
      expect(runtime.passFreshness.markDirty).toHaveBeenCalledWith(
        guidedWorkspaceCourse.id,
        GUIDED_WORKSPACE_ID,
        ['exercise-guided-step-1', 'exercise-guided-step-2'],
        2,
      );
    });

    await userEvent.click(screen.getByRole('button', { name: '判定する' }));
    expect(await screen.findByTestId('learning-completion')).toBeInTheDocument();

    const editedRenders = adapters.render.mock.calls
      .map(([input]) => input)
      .filter((input) => input.files['index.html'] === editedSource);
    expect(new Set(editedRenders.map(({ viewport }) => viewport.id))).toEqual(
      new Set(['viewport-guided-step-1', 'viewport-guided-step-2']),
    );
    for (const input of editedRenders) {
      expect(input.files).toEqual({
        'index.html': editedSource,
        'styles.css': 'main { display: block; }',
      });
      expect(input.assets.map(({ id }) => id)).toEqual([
        'asset-guided-step-1',
        'asset-guided-step-2',
      ]);
    }
    expect(adapters.validate.mock.calls.map(([context]) => context.exerciseId)).toEqual([
      'exercise-guided-step-1',
      'exercise-guided-step-2',
    ]);
    const atomicWrites = runtime.repository.putDraftAndCourseFenced.mock.calls;
    expect(atomicWrites.length).toBeGreaterThanOrEqual(2);
    expect(
      atomicWrites.some(
        ([, progress]) =>
          progress.lessons['lesson-guided-step-1']?.currentComplete === false &&
          progress.lessons['lesson-guided-step-2']?.currentComplete === false,
      ),
    ).toBe(true);
    expect(Object.keys(storedDraft.lastPassingSnapshots).sort()).toEqual([
      'exercise-guided-step-1',
      'exercise-guided-step-2',
    ]);
    expect(storedDraft.files).toEqual({
      'index.html': editedSource,
      'styles.css': 'main { display: block; }',
    });
    expect(storedCourse.lessons['lesson-guided-step-1']?.currentComplete).toBe(true);
    expect(storedCourse.lessons['lesson-guided-step-2']?.currentComplete).toBe(true);
    expect(storedCourse.currentComplete).toBe(true);
    expect(runtime.passFreshness.markPassed).toHaveBeenCalledWith(
      guidedWorkspaceCourse.id,
      GUIDED_WORKSPACE_ID,
      ['exercise-guided-step-1', 'exercise-guided-step-2'],
      2,
    );
  }, 15_000);

  it('合格判定の原子的保存後にCompletionへ一度だけ遷移する', async () => {
    stubEditingCapability(true);
    stubAdapters();
    let storedCourse: CourseProgress | undefined = viewedProgress();
    let storedDraft: ExerciseDraft | undefined;
    runtime.repository.getCourse.mockImplementation(async () => storedCourse);
    runtime.repository.getDraft.mockImplementation(async () => storedDraft);
    runtime.repository.putDraft.mockImplementation(async (draft) => {
      storedDraft = draft;
    });
    runtime.repository.putDraftAndCourse.mockImplementation(async (draft, progress) => {
      storedDraft = draft;
      storedCourse = progress;
    });
    renderRoute('/courses/html-css/lessons/lesson-first-heading/exercises/exercise-first-heading');
    const validate = await screen.findByRole('button', { name: '判定する' });
    await waitFor(() => {
      expect(validate).toBeEnabled();
    });
    let previousPath = router!.state.location.pathname;
    let completionTransitions = 0;
    const unsubscribe = router!.subscribe((state) => {
      const currentPath = state.location.pathname;
      if (currentPath !== previousPath && currentPath.endsWith('/completion')) {
        completionTransitions += 1;
      }
      previousPath = currentPath;
    });

    await userEvent.click(validate);

    expect(await screen.findByTestId('learning-completion')).toBeInTheDocument();
    expect(completionTransitions).toBe(1);
    expect(runtime.lease.fencedWriteCalls).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it.each([
    { label: '即時dirty', dirty: true, draftRevision: 4, snapshotRevision: 4 },
    { label: 'pass後の再編集', dirty: false, draftRevision: 5, snapshotRevision: 4 },
  ])('$labelのCompletion直リンクをExerciseへredirectする', async ({ dirty, draftRevision }) => {
    stubEditingCapability(false);
    const draft = passingDraft();
    runtime.repository.getCourse.mockResolvedValueOnce(completedProgress());
    runtime.repository.getDraft.mockResolvedValueOnce({ ...draft, editRevision: draftRevision });
    runtime.passFreshness.isDirty.mockReturnValueOnce(dirty);
    renderRoute(
      '/courses/html-css/lessons/lesson-first-heading/exercises/exercise-first-heading/completion',
    );

    await waitFor(() => {
      expect(router?.state.location.pathname).toBe(
        '/courses/html-css/lessons/lesson-first-heading/exercises/exercise-first-heading',
      );
    });
    expect(screen.queryByTestId('learning-completion')).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'PCで演習を開く' })).toBeInTheDocument();
  });

  it('Starter一致では復元を無効化し、実CodeMirrorの編集後だけ有効化する', async () => {
    stubEditingCapability(true);
    stubAdapters();
    renderRoute('/courses/html-css/lessons/lesson-first-heading/exercises/exercise-first-heading');
    expect(await findCodeWorkspace()).toBeInTheDocument();

    const reset = screen.getByRole('button', { name: '最初に戻す' });
    expect(reset).toBeDisabled();
    const editorView = await findEditorView();
    act(() => {
      editorView.dispatch({
        changes: { from: 0, to: editorView.state.doc.length, insert: '' },
      });
    });

    await waitFor(() => {
      expect(reset).toBeEnabled();
    });
  });

  it('復元確認の取消とEscapeは編集・revision・Previewを変えずTriggerへFocusを戻す', async () => {
    stubEditingCapability(true);
    const adapters = stubAdapters();
    const user = userEvent.setup();
    renderRoute('/courses/html-css/lessons/lesson-first-heading/exercises/exercise-first-heading');
    expect(await findCodeWorkspace()).toBeInTheDocument();
    const editorView = await findEditorView();
    const editedSource = '<main>取消後も残す</main>';
    act(() => {
      editorView.dispatch({
        changes: { from: 0, to: editorView.state.doc.length, insert: editedSource },
      });
    });
    const reset = screen.getByRole('button', { name: '最初に戻す' });
    await waitFor(() => {
      expect(reset).toBeEnabled();
      expect(adapters.getLastRenderInput()?.files['index.html']).toBe(editedSource);
    });
    const renderCount = adapters.render.mock.calls.length;
    const revision = adapters.getLastRenderInput()?.executionRevision;

    await user.click(reset);
    let dialog = screen.getByRole('dialog', { name: '最初のコードに戻しますか？' });
    expect(dialog).toHaveTextContent('現在の編集内容と全ファイル');
    const cancel = within(dialog).getByRole('button', { name: '編集を続ける' });
    const confirm = within(dialog).getByRole('button', { name: '最初のコードに戻す' });
    expect(reset).toHaveClass('min-h-11');
    expect(cancel).toHaveClass('min-h-11');
    expect(confirm).toHaveClass('min-h-11');
    expect(cancel).toHaveFocus();
    expect(confirm).toBeEnabled();

    await user.click(cancel);
    await waitFor(() => {
      expect(reset).toHaveFocus();
    });
    expect(editorView.state.doc.toString()).toBe(editedSource);
    expect(adapters.getLastRenderInput()?.executionRevision).toBe(revision);
    expect(adapters.render).toHaveBeenCalledTimes(renderCount);

    await user.click(reset);
    dialog = screen.getByRole('dialog', { name: '最初のコードに戻しますか？' });
    expect(within(dialog).getByRole('button', { name: '編集を続ける' })).toHaveFocus();
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(reset).toHaveFocus();
    });
    expect(editorView.state.doc.toString()).toBe(editedSource);
    expect(adapters.getLastRenderInput()?.executionRevision).toBe(revision);
    expect(adapters.render).toHaveBeenCalledTimes(renderCount);
  }, 15_000);

  it('復元確認のBackdrop取消は編集・revision・Previewを変えずTriggerへFocusを戻す', async () => {
    stubEditingCapability(true);
    const adapters = stubAdapters();
    const user = userEvent.setup();
    renderRoute('/courses/html-css/lessons/lesson-first-heading/exercises/exercise-first-heading');
    expect(await findCodeWorkspace()).toBeInTheDocument();
    const editorView = await findEditorView();
    const editedSource = '<main>Backdrop後も残す</main>';
    act(() => {
      editorView.dispatch({
        changes: { from: 0, to: editorView.state.doc.length, insert: editedSource },
      });
    });
    const reset = screen.getByRole('button', { name: '最初に戻す' });
    await waitFor(() => {
      expect(reset).toBeEnabled();
      expect(adapters.getLastRenderInput()?.files['index.html']).toBe(editedSource);
    });
    const renderCount = adapters.render.mock.calls.length;
    const revision = adapters.getLastRenderInput()?.executionRevision;
    const dirtyCount = runtime.passFreshness.markDirty.mock.calls.length;

    await user.click(reset);
    const dialog = screen.getByRole('dialog', { name: '最初のコードに戻しますか？' });
    fireEvent.click(dialog);

    await waitFor(() => {
      expect(reset).toHaveFocus();
    });
    expect(editorView.state.doc.toString()).toBe(editedSource);
    expect(adapters.getLastRenderInput()?.executionRevision).toBe(revision);
    expect(adapters.render).toHaveBeenCalledTimes(renderCount);
    expect(runtime.passFreshness.markDirty).toHaveBeenCalledTimes(dirtyCount);
  });

  it('確定後は全fileをStarterへ保存・Previewし、HintとEditor local stateを初期化する', async () => {
    stubContentFetch();
    stubEditingCapability(true);
    const adapters = stubAdapters();
    const user = userEvent.setup();
    let storedDraft: ExerciseDraft | undefined;
    runtime.repository.getDraft.mockImplementation(async () => storedDraft);
    runtime.repository.putDraft.mockReset().mockImplementation(async (draft) => {
      storedDraft = structuredClone(draft);
    });
    renderRoute('/courses/html-css/lessons/lesson-guided-step-2/exercises/exercise-guided-step-2');
    expect(await findCodeWorkspace()).toBeInTheDocument();
    const editorView = await findEditorView();
    act(() => {
      editorView.dispatch({
        changes: { from: 0, to: editorView.state.doc.length, insert: '<main>編集中</main>' },
        selection: { anchor: 3 },
      });
    });
    await user.click(screen.getByRole('tab', { name: 'styles.css' }));
    await waitFor(() => {
      expect(editorView.state.doc.toString()).toBe('main { display: block; }');
    });
    act(() => {
      editorView.dispatch({
        changes: { from: 0, to: editorView.state.doc.length, insert: 'main { color: red; }' },
        selection: { anchor: 5 },
      });
    });
    await user.click(screen.getByRole('button', { name: 'ヒントを見る' }));
    const hintDialog = screen.getByRole('dialog', { name: 'ヒント' });
    await user.click(within(hintDialog).getByRole('button', { name: /ヒント1を見る/u }));
    await user.click(within(hintDialog).getByRole('button', { name: '閉じる' }));

    const reset = screen.getByRole('button', { name: '最初に戻す' });
    await waitFor(() => {
      expect(reset).toBeEnabled();
    });
    await user.click(reset);
    const resetDialog = screen.getByRole('dialog', { name: '最初のコードに戻しますか？' });
    await user.click(within(resetDialog).getByRole('button', { name: '最初のコードに戻す' }));

    const starterFiles = {
      'index.html': '<main>工程2 starter</main>',
      'styles.css': 'main { display: block; }',
    };
    await waitFor(() => {
      expect(reset).toBeDisabled();
      expect(storedDraft?.files).toEqual(starterFiles);
      expect(adapters.getLastRenderInput()?.files).toEqual(starterFiles);
      expect(editorView.contentDOM).toHaveFocus();
    });
    expect(storedDraft).toMatchObject({
      cursors: {},
      validationHistory: [],
      revealedHintIds: [],
      lastPassingSnapshots: {},
    });
    expect(adapters.getLastRenderInput()?.executionRevision).toBe(storedDraft?.editRevision);
    expect(runtime.passFreshness.markDirty).toHaveBeenLastCalledWith(
      guidedWorkspaceCourse.id,
      GUIDED_WORKSPACE_ID,
      ['exercise-guided-step-1', 'exercise-guided-step-2'],
      storedDraft?.editRevision,
    );
    expect(
      screen.queryByRole('dialog', { name: '最初のコードに戻しますか？' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '判定結果を見る' })).not.toBeInTheDocument();
    expect(EditorView.findFromDOM(document.querySelector<HTMLElement>('.cm-editor')!)).toBe(
      editorView,
    );
  }, 15_000);

  it('Reset flush中の遅延Editor eventを拒否し、StarterのDraft・Preview・Focusを維持する', async () => {
    stubContentFetch();
    stubEditingCapability(true);
    const adapters = stubAdapters();
    const user = userEvent.setup();
    const starterFiles = {
      'index.html': '<main>工程2 starter</main>',
      'styles.css': 'main { display: block; }',
    };
    let storedDraft: ExerciseDraft | undefined;
    let resolveResetSaveStarted!: () => void;
    const resetSaveStarted = new Promise<void>((resolve) => {
      resolveResetSaveStarted = resolve;
    });
    let releaseResetSave!: () => void;
    const resetSaveGate = new Promise<void>((resolve) => {
      releaseResetSave = resolve;
    });
    let resetSaveBlocked = false;
    runtime.repository.getDraft.mockImplementation(async () => storedDraft);
    runtime.repository.putDraft.mockReset().mockImplementation(async (draft) => {
      if (!resetSaveBlocked && draft.files['index.html'] === starterFiles['index.html']) {
        resetSaveBlocked = true;
        resolveResetSaveStarted();
        await resetSaveGate;
      }
      storedDraft = structuredClone(draft);
    });
    renderRoute('/courses/html-css/lessons/lesson-guided-step-2/exercises/exercise-guided-step-2');
    const workspace = await findCodeWorkspace();
    const editorView = await findEditorView();
    act(() => {
      editorView.dispatch({
        changes: { from: 0, to: editorView.state.doc.length, insert: '<main>Reset前</main>' },
      });
    });
    const reset = screen.getByRole('button', { name: '最初に戻す' });
    await waitFor(() => {
      expect(reset).toBeEnabled();
    });
    await user.click(reset);
    await user.click(
      within(screen.getByRole('dialog', { name: '最初のコードに戻しますか？' })).getByRole(
        'button',
        { name: '最初のコードに戻す' },
      ),
    );
    await act(async () => {
      await resetSaveStarted;
    });
    const resetWasInert = workspace.hasAttribute('inert');
    const resetWasBusy = workspace.getAttribute('aria-busy');

    act(() => {
      editorView.dispatch({
        changes: {
          from: 0,
          to: editorView.state.doc.length,
          insert: '<main>Reset中の遅延入力</main>',
        },
        selection: { anchor: 4 },
      });
      screen
        .getByRole('tab', { name: 'styles.css' })
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    releaseResetSave();

    await waitFor(() => {
      expect(editorView.contentDOM).toHaveFocus();
      expect(storedDraft?.files).toEqual(starterFiles);
      expect(adapters.getLastRenderInput()?.files).toEqual(starterFiles);
    });
    expect(resetWasInert).toBe(true);
    expect(resetWasBusy).toBe('true');
    expect(storedDraft).toMatchObject({
      selectedFile: 'index.html',
      cursors: {},
      files: starterFiles,
    });
    expect(adapters.getLastRenderInput()?.executionRevision).toBe(storedDraft?.editRevision);
    expect(runtime.passFreshness.markDirty).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('tab', { name: 'index.html' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(editorView.state.doc.toString()).toBe(starterFiles['index.html']);
  }, 15_000);

  it('Starter保存失敗でも復元を巻き戻さずSaveStatusと復旧案内を一致させる', async () => {
    stubEditingCapability(true);
    stubAdapters();
    const user = userEvent.setup();
    runtime.repository.putDraft.mockReset().mockRejectedValue(new Error('indexeddb full'));
    renderRoute('/courses/html-css/lessons/lesson-first-heading/exercises/exercise-first-heading');
    expect(await findCodeWorkspace()).toBeInTheDocument();
    const editorView = await findEditorView();
    act(() => {
      editorView.dispatch({
        changes: { from: 0, to: editorView.state.doc.length, insert: '<main>保存失敗前</main>' },
      });
    });
    const reset = screen.getByRole('button', { name: '最初に戻す' });
    await waitFor(() => {
      expect(reset).toBeEnabled();
    });
    await user.click(reset);
    await user.click(
      within(screen.getByRole('dialog', { name: '最初のコードに戻しますか？' })).getByRole(
        'button',
        { name: '最初のコードに戻す' },
      ),
    );

    expect(
      await screen.findByText('最初のコードには戻りましたが、自動保存を完了できませんでした。'),
    ).toHaveAttribute('role', 'alert');
    expect(screen.getByText('保存できません。編集内容は画面に残っています')).toHaveAttribute(
      'data-save-status',
      'error',
    );
    expect(editorView.state.doc.toString()).toBe('<main></main>');
    expect(reset).toBeDisabled();
    expect(runtime.notices.reportError).toHaveBeenCalledWith('exercise-save', expect.any(Error));
  });

  it('Starter Preview失敗でも復元を巻き戻さず再準備導線を残す', async () => {
    stubEditingCapability(true);
    const starter = '<main></main>';
    stubAdapters({
      render: async (input) => {
        if (input.executionRevision > 0 && input.files['index.html'] === starter) {
          throw new Error('reset render failed');
        }
        return {
          exerciseSessionId: input.exerciseSessionId,
          executionRevision: input.executionRevision,
          diagnostics: [],
          evidence: [],
          console: [],
        };
      },
    });
    const user = userEvent.setup();
    runtime.repository.putDraft.mockReset().mockResolvedValue(undefined);
    renderRoute('/courses/html-css/lessons/lesson-first-heading/exercises/exercise-first-heading');
    expect(await findCodeWorkspace()).toBeInTheDocument();
    const editorView = await findEditorView();
    act(() => {
      editorView.dispatch({
        changes: { from: 0, to: editorView.state.doc.length, insert: '<main>Preview失敗前</main>' },
      });
    });
    const reset = screen.getByRole('button', { name: '最初に戻す' });
    await waitFor(() => {
      expect(reset).toBeEnabled();
    });
    await user.click(reset);
    await user.click(
      within(screen.getByRole('dialog', { name: '最初のコードに戻しますか？' })).getByRole(
        'button',
        { name: '最初のコードに戻す' },
      ),
    );

    expect(
      await screen.findByText('最初のコードに戻しました。プレビューだけ更新できませんでした。'),
    ).toHaveAttribute('role', 'alert');
    expect(screen.getByRole('button', { name: 'プレビューを再準備' })).toBeEnabled();
    expect(editorView.state.doc.toString()).toBe(starter);
    expect(reset).toBeDisabled();
    expect(runtime.notices.reportError).toHaveBeenCalledWith('exercise-preview', expect.any(Error));
    await waitFor(() => {
      expect(editorView.contentDOM).toHaveFocus();
    });
  });
});
