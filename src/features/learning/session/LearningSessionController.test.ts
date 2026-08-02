import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Exercise } from '../../../core/content/types';
import type { ExerciseDraft, ProgressRepository } from '../../../core/persistence/contracts';
import type {
  PreviewSnapshot,
  RunnerAdapter,
  RunnerInput,
  RunnerRenderResult,
} from '../../../core/runtime/contracts';
import type {
  ValidationContext,
  ValidationResult,
  ValidatorAdapter,
} from '../../../core/validation/contracts';
import { fixtureCourse } from '../../../../tests/fixtures/course';
import {
  LearningSessionController,
  StaleExecutionError,
  type LearningSessionControllerInput,
} from './LearningSessionController';

/** Promiseの解決・拒否をtest側から制御する。 */
function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

type StandardExercise = Extract<Exercise, { kind: 'standard' }>;

const baseExercise = structuredClone(
  fixtureCourse.phases[0]!.chapters[0]!.lessons[0]!.exercises[0] as StandardExercise,
);

/** 完全なExercise fixtureへ指定差分を重ねる。 */
function exercise(overrides: Partial<StandardExercise> = {}): StandardExercise {
  return { ...structuredClone(baseExercise), ...overrides };
}

/** Controller test用の説明可能な判定結果を生成する。 */
function validationResult(
  exerciseId: string,
  executionRevision: number,
  overrides: Partial<ValidationResult> = {},
): ValidationResult {
  return {
    exerciseId,
    executionRevision,
    status: 'pass',
    checks: [],
    passedRequirementIds: [],
    diagnostics: [],
    evaluatedAt: '2026-07-10T00:00:00.000Z',
    ...overrides,
  };
}

/** 指定viewportの最小Snapshotを生成する。 */
function snapshot(input: RunnerInput): PreviewSnapshot {
  return {
    exerciseSessionId: input.exerciseSessionId,
    executionRevision: input.executionRevision,
    viewport: input.viewport,
    nodes: [],
    documentOverflow: {
      x: false,
      y: false,
      scrollWidth: input.viewport.width,
      scrollHeight: input.viewport.height,
      clientWidth: input.viewport.width,
      clientHeight: input.viewport.height,
    },
  };
}

interface RunnerHarness {
  readonly runner: RunnerAdapter;
  readonly render: ReturnType<typeof vi.fn<(input: RunnerInput) => Promise<RunnerRenderResult>>>;
  readonly requestSnapshot: ReturnType<typeof vi.fn<RunnerAdapter['requestSnapshot']>>;
  readonly dispose: ReturnType<typeof vi.fn<RunnerAdapter['dispose']>>;
}

/** stateful Runnerのrender→snapshot順を再現するfixtureを生成する。 */
function runnerHarness(events: string[] = []): RunnerHarness {
  let currentInput: RunnerInput | undefined;
  const render = vi.fn(async (input: RunnerInput): Promise<RunnerRenderResult> => {
    currentInput = input;
    events.push(`render:${input.viewport.id}`);
    return {
      exerciseSessionId: input.exerciseSessionId,
      executionRevision: input.executionRevision,
      diagnostics: [
        {
          code: `DIAGNOSTIC_${input.viewport.id}`,
          kind: 'syntax',
          severity: 'warning',
          message: input.viewport.id,
          learnerMessage: input.viewport.id,
        },
      ],
      evidence: [],
    };
  });
  const requestSnapshot = vi.fn<RunnerAdapter['requestSnapshot']>(async (request) => {
    if (currentInput === undefined) throw new Error('renderより先にsnapshotが呼ばれました');
    events.push(`snapshot:${currentInput.viewport.id}`);
    return snapshot({
      ...currentInput,
      exerciseSessionId: request.exerciseSessionId,
      executionRevision: request.executionRevision,
    });
  });
  const dispose = vi.fn<RunnerAdapter['dispose']>();
  return {
    runner: {
      languageId: 'html-css',
      prepare: vi.fn(),
      render,
      requestSnapshot,
      dispose,
    },
    render,
    requestSnapshot,
    dispose,
  };
}

interface ValidatorHarness {
  readonly validator: ValidatorAdapter;
  readonly validate: ReturnType<
    typeof vi.fn<(context: ValidationContext) => Promise<ValidationResult>>
  >;
  readonly buildSnapshotPolicy: ReturnType<typeof vi.fn<ValidatorAdapter['buildSnapshotPolicy']>>;
}

/** 常にpassし、受領contextを記録するValidator fixtureを生成する。 */
function validatorHarness(events: string[] = []): ValidatorHarness {
  const buildSnapshotPolicy = vi.fn<ValidatorAdapter['buildSnapshotPolicy']>(() => ({
    selectors: [],
    attributes: [],
    computedStyles: [],
    focusVisibleSelectors: [],
    focusVisibleComputedStyles: [],
    includeAllElements: false,
  }));
  const validate = vi.fn(async (context: ValidationContext): Promise<ValidationResult> => {
    events.push(`validate:${context.exerciseId}`);
    const revision = Object.values(context.snapshots)[0]?.executionRevision ?? 0;
    return validationResult(context.exerciseId, revision, { diagnostics: context.diagnostics });
  });
  return { validator: { buildSnapshotPolicy, validate }, validate, buildSnapshotPolicy };
}

/** Controllerが使うRepositoryの最小fakeを生成する。 */
function repositoryHarness(
  options: {
    readonly draft?: ExerciseDraft;
    readonly onPut?: (draft: ExerciseDraft) => Promise<void>;
  } = {},
) {
  const getDraft = vi.fn().mockResolvedValue(options.draft);
  const putDraft = vi.fn(
    options.onPut ??
      (async () => {
        await Promise.resolve();
      }),
  );
  return {
    repository: { getDraft, putDraft } as unknown as ProgressRepository,
    getDraft,
    putDraft,
  };
}

/** 依存fixtureを揃えたController inputを生成する。 */
function controllerInput(
  overrides: Partial<LearningSessionControllerInput> = {},
  options: { readonly defaultRequestId?: boolean } = {},
): LearningSessionControllerInput {
  let requestSequence = 0;
  const runtime = runnerHarness();
  const validation = validatorHarness();
  const persistence = repositoryHarness();
  return {
    courseId: 'html-css',
    lessonId: 'lesson-first-heading',
    exercise: exercise(),
    contentRevision: '2026-07-10.1',
    resolvedAssets: [],
    repository: persistence.repository,
    runner: runtime.runner,
    validator: validation.validator,
    now: () => '2026-07-10T00:00:00.000Z',
    ...(options.defaultRequestId === false
      ? {}
      : {
          createRequestId: () => {
            requestSequence += 1;
            return `request-${String(requestSequence)}`;
          },
        }),
    ...overrides,
  };
}

/** 永続復元test用の完全なDraftを生成する。 */
function storedDraft(overrides: Partial<ExerciseDraft> = {}): ExerciseDraft {
  const baseDraft: ExerciseDraft = {
    courseId: 'html-css',
    lessonId: 'lesson-first-heading',
    exerciseId: baseExercise.id,
    workspaceId: baseExercise.workspaceId,
    contentRevision: '2026-07-10.1',
    editRevision: 7,
    files: { 'index.html': '<main><h1>保存済み</h1></main>', 'old.html': '<p>旧File</p>' },
    selectedFile: 'old.html',
    cursors: {
      'old.html': { anchor: 3, head: 3 },
      'index.html': { anchor: 999, head: 999 },
    },
    validationHistory: [validationResult(baseExercise.id, 7)],
    revealedHintIds: [baseExercise.hints[0]!.id],
    reviewSlideId: baseExercise.relatedSlideIds[0]!,
    reviewScrollOffset: 120,
    lastPassingSnapshots: {
      [baseExercise.id]: {
        editRevision: 7,
        contentRevision: '2026-07-10.1',
        files: { 'index.html': '<main><h1>保存済み</h1></main>' },
        evaluatedAt: '2026-07-10T00:00:00.000Z',
      },
    },
    updatedAt: '2026-07-10T00:00:00.000Z',
  };
  return Object.assign(baseDraft, overrides);
}

describe('LearningSessionController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('初回表示ではFile配列の並びに関係なく最初の手順の対象Fileを選択する', () => {
    const firstStep = baseExercise.steps[0];
    if (firstStep === undefined) throw new Error('Exercise fixtureに手順がありません');
    const current = exercise({
      steps: [{ ...firstStep, file: 'script.js' }],
      files: [
        { path: 'index.html', language: 'html', content: '<main></main>', editable: true },
        { path: 'styles.css', language: 'css', content: 'main {}', editable: true },
        {
          path: 'script.js',
          language: 'javascript',
          content: "document.querySelector('#message');",
          editable: true,
        },
      ],
    });

    const controller = new LearningSessionController(controllerInput({ exercise: current }));

    expect(controller.getSnapshot().selectedFile).toBe('script.js');
  });

  it('preview更新と判定を公開Performance Entry名で計測する', async () => {
    const measure = vi.spyOn(globalThis.performance, 'measure');
    const controller = new LearningSessionController(controllerInput());

    await controller.previewNow();
    await controller.validateNow();

    expect(measure).toHaveBeenCalledWith(
      'tsumucode:preview-update',
      expect.stringMatching(/^tsumucode:preview-update:\d+:start$/),
      expect.stringMatching(/^tsumucode:preview-update:\d+:end$/),
    );
    expect(measure).toHaveBeenCalledWith(
      'tsumucode:validation',
      expect.stringMatching(/^tsumucode:validation:\d+:start$/),
      expect.stringMatching(/^tsumucode:validation:\d+:end$/),
    );
    await controller.dispose();
  });

  it('先行保存→全viewport render/snapshot→判定保存→表示viewport復元を同revisionで直列実行する', async () => {
    const events: string[] = [];
    const current = exercise({
      previewViewports: [
        { id: 'desktop', width: 1280, height: 720 },
        { id: 'mobile', width: 390, height: 844 },
      ],
    });
    const runtime = runnerHarness(events);
    const validation = validatorHarness(events);
    const persistence = repositoryHarness({
      onPut: async (draft) => {
        events.push(`save:${String(draft.validationHistory.length)}`);
      },
    });
    const controller = new LearningSessionController(
      controllerInput({
        exercise: current,
        repository: persistence.repository,
        runner: runtime.runner,
        validator: validation.validator,
      }),
    );
    controller.edit('index.html', '<main><h1>積む</h1></main>');

    const result = await controller.validateNow();

    expect(result.status).toBe('pass');
    expect(events).toEqual([
      'save:0',
      'render:desktop',
      'snapshot:desktop',
      'render:mobile',
      'snapshot:mobile',
      `validate:${current.id}`,
      'save:1',
      'render:desktop',
    ]);
    expect(runtime.render.mock.calls.map(([input]) => input.executionRevision)).toEqual([1, 1, 1]);
    expect(
      runtime.render.mock.calls.every(([input]) => input.files['index.html']?.includes('積む')),
    ).toBe(true);
    expect(runtime.requestSnapshot.mock.calls.map(([request]) => request.requestId)).toEqual([
      'request-1',
      'request-2',
    ]);
    expect(validation.validate.mock.calls[0]?.[0].diagnostics.map(({ code }) => code)).toEqual([
      'DIAGNOSTIC_desktop',
      'DIAGNOSTIC_mobile',
    ]);
    expect(validation.validate.mock.calls[0]?.[0].files['index.html']).toContain('積む');
    const savedDraft = persistence.putDraft.mock.calls.at(-1)?.[0];
    expect(savedDraft?.validationHistory).toHaveLength(1);
    expect(savedDraft?.validationHistory[0]).toMatchObject({
      status: 'pass',
      executionRevision: 1,
    });
    expect(savedDraft?.lastPassingSnapshots[current.id]).toMatchObject({ editRevision: 1 });
    expect(controller.getLastValidationDraft(1)).toEqual(savedDraft);
    expect(controller.getLastValidationDraft(0)).toBeUndefined();
  });

  it('全viewportで一致したRunner evidenceだけをValidatorへ渡す', async () => {
    const current = exercise({
      previewViewports: [
        { id: 'desktop', width: 1280, height: 720 },
        { id: 'mobile', width: 390, height: 844 },
      ],
    });
    const runtime = runnerHarness();
    const renderImplementation = runtime.render.getMockImplementation();
    if (renderImplementation === undefined) throw new Error('render fixtureがありません');
    runtime.render.mockImplementation(async (input) => ({
      ...(await renderImplementation(input)),
      evidence: [
        { id: 'javascript.executed', value: true },
        {
          id: 'javascript.source-sha256',
          file: 'script.js',
          value: 'a'.repeat(64),
        },
      ],
    }));
    const validation = validatorHarness();
    const controller = new LearningSessionController(
      controllerInput({
        exercise: current,
        runner: runtime.runner,
        validator: validation.validator,
      }),
    );

    await controller.validateNow();

    expect(validation.validate).toHaveBeenCalledWith(
      expect.objectContaining({
        evidence: [
          { id: 'javascript.executed', value: true },
          {
            id: 'javascript.source-sha256',
            file: 'script.js',
            value: 'a'.repeat(64),
          },
        ],
      }),
    );
  });

  it('Runnerのerror診断ではSnapshotを要求せずValidatorへ渡して再試行可能な結果を残す', async () => {
    const runtime = runnerHarness();
    const diagnostic = {
      code: 'JAVASCRIPT_SYNTAX',
      kind: 'syntax' as const,
      severity: 'error' as const,
      message: 'Unexpected token',
      learnerMessage: '引用符を確認してください。',
      file: 'script.js',
      line: 1,
      column: 20,
    };
    runtime.render.mockImplementation(async (input) => ({
      exerciseSessionId: input.exerciseSessionId,
      executionRevision: input.executionRevision,
      diagnostics: [diagnostic],
      evidence: [],
    }));
    const validation = validatorHarness();
    validation.validate.mockImplementation(async (context) =>
      validationResult(context.exerciseId, 0, {
        executionRevision: null,
        status: 'code-error',
        diagnostics: context.diagnostics,
      }),
    );
    const controller = new LearningSessionController(
      controllerInput({ runner: runtime.runner, validator: validation.validator }),
    );

    const result = await controller.validateNow();

    expect(runtime.requestSnapshot).not.toHaveBeenCalled();
    expect(validation.validate).toHaveBeenCalledWith(
      expect.objectContaining({ snapshots: {}, diagnostics: [diagnostic] }),
    );
    expect(result.status).toBe('code-error');
    expect(controller.getSnapshot().validationHistory.at(-1)?.status).toBe('code-error');
  });

  it('viewport間でRunner evidenceが異なる判定をidentity不一致として拒否する', async () => {
    const current = exercise({
      previewViewports: [
        { id: 'desktop', width: 1280, height: 720 },
        { id: 'mobile', width: 390, height: 844 },
      ],
    });
    const runtime = runnerHarness();
    const renderImplementation = runtime.render.getMockImplementation();
    if (renderImplementation === undefined) throw new Error('render fixtureがありません');
    runtime.render.mockImplementation(async (input) => ({
      ...(await renderImplementation(input)),
      evidence: [
        {
          id: 'javascript.executed',
          value: input.viewport.id === 'desktop',
        },
      ],
    }));
    const controller = new LearningSessionController(
      controllerInput({ exercise: current, runner: runtime.runner }),
    );

    await expect(controller.validateNow()).rejects.toThrow(/Runner evidence/u);
  });

  it('Runner境界で件数・ID・File・値・identityが契約外のevidenceを拒否する', async () => {
    const invalidEvidence = [
      Array.from({ length: 65 }, (_, index) => ({ id: `evidence.${String(index)}`, value: true })),
      [{ id: '', value: true }],
      [{ id: 'A'.repeat(129), value: true }],
      [{ id: 'invalid id', value: true }],
      [{ id: 'valid.id', file: '/script.js', value: true }],
      [{ id: 'valid.id', file: '../script.js', value: true }],
      [{ id: 'valid.id', file: 'a'.repeat(257), value: true }],
      [{ id: 'valid.id', file: 42, value: true }],
      [{ id: 'valid.id', value: 'a'.repeat(4097) }],
      [{ id: 'valid.id', value: Number.NaN }],
      [{ id: 'valid.id', value: true, unexpected: 'field' }],
      [{ id: 'valid.id' }],
      [
        { id: 'duplicate.id', value: true },
        { id: 'duplicate.id', value: false },
      ],
    ] as const;

    for (const evidence of invalidEvidence) {
      const runtime = runnerHarness();
      const renderImplementation = runtime.render.getMockImplementation();
      if (renderImplementation === undefined) throw new Error('render fixtureがありません');
      runtime.render.mockImplementation(
        async (input) =>
          ({
            ...(await renderImplementation(input)),
            evidence,
          }) as unknown as RunnerRenderResult,
      );
      const controller = new LearningSessionController(controllerInput({ runner: runtime.runner }));

      await expect(controller.previewNow()).rejects.toThrow(/Runner evidence/u);
    }
  });

  it('Runner evidenceの順序だけが異なるviewportを同じ証拠として扱う', async () => {
    const current = exercise({
      previewViewports: [
        { id: 'desktop', width: 1280, height: 720 },
        { id: 'mobile', width: 390, height: 844 },
      ],
    });
    const runtime = runnerHarness();
    const renderImplementation = runtime.render.getMockImplementation();
    if (renderImplementation === undefined) throw new Error('render fixtureがありません');
    runtime.render.mockImplementation(async (input) => ({
      ...(await renderImplementation(input)),
      evidence:
        input.viewport.id === 'desktop'
          ? [
              { id: 'javascript.executed', value: true },
              { id: 'javascript.budget-exhausted', value: false },
            ]
          : [
              { id: 'javascript.budget-exhausted', value: false },
              { id: 'javascript.executed', value: true },
            ],
    }));
    const validation = validatorHarness();
    const controller = new LearningSessionController(
      controllerInput({
        exercise: current,
        runner: runtime.runner,
        validator: validation.validator,
      }),
    );

    await expect(controller.validateNow()).resolves.toMatchObject({ status: 'pass' });
    expect(validation.validate).toHaveBeenCalledWith(
      expect.objectContaining({
        evidence: [
          { id: 'javascript.budget-exhausted', value: false },
          { id: 'javascript.executed', value: true },
        ],
      }),
    );
  });

  it('250ms previewをcoalesceし、stateful Runner操作を同時実行しない', async () => {
    const firstRender = deferred<RunnerRenderResult>();
    let active = 0;
    let maximumActive = 0;
    const runtime = runnerHarness();
    runtime.render
      .mockImplementationOnce(async (input) => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        const result = await firstRender.promise;
        active -= 1;
        return { ...result, exerciseSessionId: input.exerciseSessionId };
      })
      .mockImplementation(async (input) => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        active -= 1;
        return {
          exerciseSessionId: input.exerciseSessionId,
          executionRevision: input.executionRevision,
          diagnostics: [],
          evidence: [],
        };
      });
    const controller = new LearningSessionController(controllerInput({ runner: runtime.runner }));
    controller.edit('index.html', '<main>1</main>');
    controller.edit('index.html', '<main>2</main>');
    await vi.advanceTimersByTimeAsync(249);
    expect(runtime.render).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(runtime.render).toHaveBeenCalledOnce();

    const queued = controller.previewNow();
    expect(runtime.render).toHaveBeenCalledOnce();
    firstRender.resolve({
      exerciseSessionId: 'html-css:exercise-first-heading',
      executionRevision: 2,
      diagnostics: [],
      evidence: [],
    });
    await vi.runAllTimersAsync();
    await queued;

    expect(runtime.render).toHaveBeenCalledTimes(2);
    expect(maximumActive).toBe(1);
  });

  it('編集直後の明示previewは予約済みdebounceを取り消して一度だけ描画する', async () => {
    const runtime = runnerHarness();
    const controller = new LearningSessionController(controllerInput({ runner: runtime.runner }));
    controller.edit('index.html', '<main>明示更新</main>');

    await controller.previewNow();
    expect(runtime.render).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(250);

    expect(runtime.render).toHaveBeenCalledOnce();
  });

  it('render中の編集で旧previewをStaleExecutionErrorとして破棄する', async () => {
    const pending = deferred<RunnerRenderResult>();
    const runtime = runnerHarness();
    runtime.render.mockImplementationOnce(() => pending.promise);
    const controller = new LearningSessionController(controllerInput({ runner: runtime.runner }));
    const preview = controller.previewNow();
    await Promise.resolve();
    controller.edit('index.html', '<main>new</main>');
    pending.resolve({
      exerciseSessionId: 'html-css:exercise-first-heading',
      executionRevision: 0,
      diagnostics: [],
      evidence: [],
    });

    await expect(preview).rejects.toBeInstanceOf(StaleExecutionError);
    expect(controller.getSnapshot().previewRevision).toBeNull();
  });

  it('Resetは現在Exerciseの全Starterをbyte一致で復元し、履歴とpassing snapshotを消して保存する', async () => {
    const htmlStarter = {
      path: 'index.html',
      language: 'html' as const,
      content: '<main><h1>Starter</h1></main>',
      editable: true,
    };
    const cssStarter = {
      path: 'styles.css',
      language: 'css' as const,
      content: 'main { color: navy; }',
      editable: true,
    };
    const current = exercise({ files: [htmlStarter, cssStarter] });
    const editedDraft = storedDraft({
      files: {
        'index.html': '<main><h1>編集済み</h1></main>',
        'styles.css': 'main { color: crimson; }',
        'old.html': '<p>旧File</p>',
      },
      selectedFile: 'old.html',
      cursors: { 'old.html': { anchor: 3, head: 3 } },
    });
    const onDirty = vi.fn();
    const persistence = repositoryHarness({ draft: editedDraft });
    const controller = new LearningSessionController(
      controllerInput({ exercise: current, repository: persistence.repository, onDirty }),
    );
    await controller.initialize();
    controller.setCursor('index.html', { anchor: 1, head: 1 });
    controller.revealNextHint();

    expect(controller.resetToStarter()).toBe(true);
    await controller.flush();

    expect(controller.getSnapshot()).toMatchObject({
      files: Object.fromEntries(current.files.map(({ path, content }) => [path, content])),
      selectedFile: 'index.html',
      cursors: {},
      previewRevision: null,
      diagnostics: [],
      validationHistory: [],
      revealedHintIds: [],
    });
    expect(onDirty).toHaveBeenCalledOnce();
    expect(persistence.putDraft.mock.calls.at(-1)?.[0]).toMatchObject({
      files: Object.fromEntries(current.files.map(({ path, content }) => [path, content])),
      selectedFile: 'index.html',
      cursors: {},
      validationHistory: [],
      revealedHintIds: [],
      lastPassingSnapshots: {},
    });
  });

  it('全fileがStarterと一致するとResetをno-opにする', () => {
    const onDirty = vi.fn();
    const controller = new LearningSessionController(controllerInput({ onDirty }));
    const before = controller.getSnapshot();

    expect(controller.resetToStarter()).toBe(false);
    expect(controller.getSnapshot()).toBe(before);
    expect(onDirty).not.toHaveBeenCalled();
  });

  it('render中のResetで旧previewをStaleExecutionErrorとして破棄する', async () => {
    const pending = deferred<RunnerRenderResult>();
    const runtime = runnerHarness();
    runtime.render.mockImplementationOnce(() => pending.promise);
    const controller = new LearningSessionController(controllerInput({ runner: runtime.runner }));
    controller.edit('index.html', '<main>reset前</main>');
    const preview = controller.previewNow();
    await Promise.resolve();

    expect(controller.resetToStarter()).toBe(true);
    pending.resolve({
      exerciseSessionId: 'html-css:exercise-first-heading',
      executionRevision: 1,
      diagnostics: [
        {
          code: 'OLD_DIAGNOSTIC',
          kind: 'syntax',
          severity: 'warning',
          message: 'old',
          learnerMessage: 'old',
        },
      ],
      evidence: [],
    });

    await expect(preview).rejects.toBeInstanceOf(StaleExecutionError);
    expect(controller.getSnapshot()).toMatchObject({ previewRevision: null, diagnostics: [] });
  });

  it('Validator待機中の編集で履歴とpassing snapshotをcommitしない', async () => {
    const pending = deferred<ValidationResult>();
    const runtime = runnerHarness();
    const validation = validatorHarness();
    validation.validate.mockImplementationOnce(() => pending.promise);
    const persistence = repositoryHarness();
    const controller = new LearningSessionController(
      controllerInput({
        runner: runtime.runner,
        validator: validation.validator,
        repository: persistence.repository,
      }),
    );
    controller.edit('index.html', '<main>before</main>');
    const validating = controller.validateNow();
    await vi.waitFor(() => {
      expect(validation.validate).toHaveBeenCalledOnce();
    });
    controller.edit('index.html', '<main>after</main>');
    pending.resolve(validationResult(baseExercise.id, 1));

    await expect(validating).rejects.toBeInstanceOf(StaleExecutionError);
    expect(controller.getSnapshot().validationHistory).toEqual([]);
    expect(controller.getLastValidationBatch()).toEqual([]);
    expect(
      persistence.putDraft.mock.calls.every(([draft]) => draft.validationHistory.length === 0),
    ).toBe(true);
  });

  it('Snapshot待機中の編集でも旧判定を破棄し永続Draftの最終状態へ履歴を残さない', async () => {
    const pending = deferred<PreviewSnapshot>();
    const runtime = runnerHarness();
    runtime.requestSnapshot.mockImplementationOnce(() => pending.promise);
    const persistence = repositoryHarness();
    const controller = new LearningSessionController(
      controllerInput({ runner: runtime.runner, repository: persistence.repository }),
    );
    controller.edit('index.html', '<main>before snapshot</main>');
    const validating = controller.validateNow();
    await vi.waitFor(() => {
      expect(runtime.requestSnapshot).toHaveBeenCalledOnce();
    });
    controller.edit('index.html', '<main>after snapshot</main>');
    const request = runtime.requestSnapshot.mock.calls[0]![0];
    pending.resolve({
      ...snapshot({
        exerciseSessionId: request.exerciseSessionId,
        executionRevision: request.executionRevision,
        languageId: 'html-css',
        files: { 'index.html': '<main>before snapshot</main>' },
        assets: [],
        viewport: baseExercise.previewViewports[0]!,
        options: {},
      }),
    });

    await expect(validating).rejects.toBeInstanceOf(StaleExecutionError);
    await controller.flush();
    expect(controller.getSnapshot().validationHistory).toEqual([]);
    expect(persistence.putDraft.mock.calls.at(-1)?.[0].validationHistory).toEqual([]);
  });

  it('先行Draft保存中の編集は最新sourceを保存して判定を開始しない', async () => {
    const firstSave = deferred<undefined>();
    let saveCount = 0;
    const persistence = repositoryHarness({
      onPut: async () => {
        saveCount += 1;
        if (saveCount === 1) await firstSave.promise;
      },
    });
    const runtime = runnerHarness();
    const controller = new LearningSessionController(
      controllerInput({ repository: persistence.repository, runner: runtime.runner }),
    );
    controller.edit('index.html', '<main>before leading save</main>');
    const validating = controller.validateNow();
    await vi.waitFor(() => {
      expect(saveCount).toBe(1);
    });
    controller.edit('index.html', '<main>after leading save</main>');
    firstSave.resolve(undefined);

    await expect(validating).rejects.toBeInstanceOf(StaleExecutionError);
    expect(runtime.render).not.toHaveBeenCalled();
    const latest = persistence.putDraft.mock.calls.at(-1)?.[0];
    expect(latest?.files['index.html']).toBe('<main>after leading save</main>');
    expect(latest?.validationHistory).toEqual([]);
  });

  it('判定Draft保存中の編集は最新Draftを最後に保存し旧判定をcommitしない', async () => {
    const candidateSave = deferred<undefined>();
    let saveCount = 0;
    const persistence = repositoryHarness({
      onPut: async () => {
        saveCount += 1;
        if (saveCount === 2) await candidateSave.promise;
      },
    });
    const controller = new LearningSessionController(
      controllerInput({ repository: persistence.repository }),
    );
    controller.edit('index.html', '<main>before save</main>');
    const validating = controller.validateNow();
    await vi.waitFor(() => {
      expect(saveCount).toBe(2);
    });
    controller.edit('index.html', '<main>after save</main>');
    candidateSave.resolve(undefined);

    await expect(validating).rejects.toBeInstanceOf(StaleExecutionError);
    expect(controller.getSnapshot().validationHistory).toEqual([]);
    expect(controller.getLastValidationBatch()).toEqual([]);
    const latest = persistence.putDraft.mock.calls.at(-1)?.[0];
    expect(latest?.files['index.html']).toBe('<main>after save</main>');
    expect(latest?.validationHistory).toEqual([]);
    expect(latest?.lastPassingSnapshots).toEqual({});
  });

  it('判定Draft保存中のFile選択を失わず、旧判定をstateと永続Draftへ残さない', async () => {
    const candidateSave = deferred<undefined>();
    let saveCount = 0;
    const current = exercise({
      files: [
        { path: 'index.html', language: 'html', content: '<main></main>', editable: true },
        { path: 'styles.css', language: 'css', content: 'main {}', editable: true },
      ],
    });
    const persistence = repositoryHarness({
      onPut: async () => {
        saveCount += 1;
        if (saveCount === 2) await candidateSave.promise;
      },
    });
    const controller = new LearningSessionController(
      controllerInput({ exercise: current, repository: persistence.repository }),
    );
    controller.edit('index.html', '<main>candidate</main>');
    const validating = controller.validateNow();
    await vi.waitFor(() => {
      expect(saveCount).toBe(2);
    });
    controller.selectFile('styles.css');
    candidateSave.resolve(undefined);

    await expect(validating).rejects.toBeInstanceOf(StaleExecutionError);
    expect(controller.getSnapshot().selectedFile).toBe('styles.css');
    expect(controller.getSnapshot().validationHistory).toEqual([]);
    const latest = persistence.putDraft.mock.calls.at(-1)?.[0];
    expect(latest?.selectedFile).toBe('styles.css');
    expect(latest?.validationHistory).toEqual([]);
    expect(latest?.lastPassingSnapshots).toEqual({});
  });

  it('表示viewport復元中の編集は保存済み候補をclean Draftで戻して旧判定を破棄する', async () => {
    const displayRestore = deferred<undefined>();
    const runtime = runnerHarness();
    const renderImplementation = runtime.render.getMockImplementation();
    if (renderImplementation === undefined) throw new Error('render fixtureがありません');
    runtime.render.mockImplementation(async (input) => {
      if (runtime.render.mock.calls.length === 2) await displayRestore.promise;
      return renderImplementation(input);
    });
    const persistence = repositoryHarness();
    const controller = new LearningSessionController(
      controllerInput({ runner: runtime.runner, repository: persistence.repository }),
    );
    controller.edit('index.html', '<main>before restore</main>');
    const validating = controller.validateNow();
    await vi.waitFor(() => {
      expect(runtime.render).toHaveBeenCalledTimes(2);
    });
    controller.edit('index.html', '<main>during restore</main>');
    displayRestore.resolve(undefined);

    await expect(validating).rejects.toBeInstanceOf(StaleExecutionError);
    expect(controller.getSnapshot().validationHistory).toEqual([]);
    expect(controller.getLastValidationBatch()).toEqual([]);
    const latest = persistence.putDraft.mock.calls.at(-1)?.[0];
    expect(latest?.files['index.html']).toBe('<main>during restore</main>');
    expect(latest?.validationHistory).toEqual([]);
    expect(latest?.lastPassingSnapshots).toEqual({});
  });

  it('validationExercisesの重複・current欠落・workspace混在・viewport寸法衝突をrender前に拒否する', async () => {
    const current = exercise();
    const other = exercise({ id: 'other-exercise' });
    const invalidSets: readonly [readonly Exercise[], RegExp][] = [
      [[current, current], /重複/u],
      [[other], /現在Exercise/u],
      [[current, exercise({ id: 'other-workspace', workspaceId: 'workspace-2' })], /workspace/u],
      [
        [
          current,
          exercise({
            id: 'conflicting-viewport',
            previewViewports: [{ id: 'desktop', width: 390, height: 844 }],
          }),
        ],
        /Viewport/u,
      ],
    ];

    for (const [validationExercises, message] of invalidSets) {
      const runtime = runnerHarness();
      const controller = new LearningSessionController(
        controllerInput({ exercise: current, validationExercises, runner: runtime.runner }),
      );
      await expect(controller.validateNow()).rejects.toThrow(message);
      expect(runtime.render).not.toHaveBeenCalled();
    }
  });

  it('同じExerciseのDraftはstarterを失わずlocal状態を復元し、不正cursorを除外する', async () => {
    const current = exercise({
      files: [
        ...baseExercise.files,
        { path: 'styles.css', language: 'css', content: 'main {}', editable: true },
      ],
    });
    const draft = storedDraft();
    const persistence = repositoryHarness({ draft });
    const controller = new LearningSessionController(
      controllerInput({ exercise: current, repository: persistence.repository }),
    );

    await controller.initialize();

    expect(controller.getSnapshot()).toMatchObject({
      files: {
        'index.html': '<main><h1>保存済み</h1></main>',
        'styles.css': 'main {}',
        'old.html': '<p>旧File</p>',
      },
      selectedFile: 'old.html',
      executionRevision: 7,
      validationHistory: [expect.objectContaining({ exerciseId: current.id })],
      revealedHintIds: [current.hints[0]?.id],
      reviewReturn: { slideId: current.relatedSlideIds[0], scrollOffset: 120 },
      cursors: { 'old.html': { anchor: 3, head: 3 } },
    });
  });

  it('共有workspaceの別Exerciseではsource/revision/passingだけ継承しlocal履歴・Hint・reviewを分離する', async () => {
    const current = exercise({ id: 'exercise-step-2', title: '工程2' });
    const draft = storedDraft();
    const persistence = repositoryHarness({ draft });
    const controller = new LearningSessionController(
      controllerInput({ exercise: current, repository: persistence.repository }),
    );

    await controller.initialize();

    expect(controller.getSnapshot()).toMatchObject({
      exerciseId: current.id,
      executionRevision: 7,
      files: { 'index.html': '<main><h1>保存済み</h1></main>' },
      validationHistory: [],
      revealedHintIds: [],
    });
    expect(controller.getSnapshot().reviewReturn).toBeUndefined();
    controller.edit('index.html', '<main>工程2</main>');
    await controller.flush();
    expect(persistence.putDraft).toHaveBeenLastCalledWith(
      expect.objectContaining({
        exerciseId: current.id,
        editRevision: 8,
        lastPassingSnapshots: draft.lastPassingSnapshots,
      }),
    );
  });

  it('異なるCourse/workspace/content revisionのDraftを拒否する', async () => {
    for (const draft of [
      storedDraft({ courseId: 'other' }),
      storedDraft({ workspaceId: 'other' }),
      storedDraft({ contentRevision: 'old-revision' }),
    ]) {
      const persistence = repositoryHarness({ draft });
      const controller = new LearningSessionController(
        controllerInput({ repository: persistence.repository }),
      );
      await expect(controller.initialize()).rejects.toThrow(/Draft/u);
    }
  });

  it('未知・read-only fileと不正cursorを同期境界で拒否する', () => {
    const current = exercise({
      files: [
        { path: 'index.html', language: 'html', content: '<main></main>', editable: true },
        { path: 'readme.txt', language: 'text', content: 'read only', editable: false },
      ],
    });
    const controller = new LearningSessionController(controllerInput({ exercise: current }));

    expect(() => {
      controller.edit('missing.html', '');
    }).toThrow(/File/u);
    expect(() => {
      controller.edit('readme.txt', 'changed');
    }).toThrow(/editable/u);
    expect(() => {
      controller.selectFile('missing.html');
    }).toThrow(/File/u);
    expect(() => {
      controller.setCursor('missing.html', { anchor: 0, head: 0 });
    }).toThrow(/File/u);
    for (const cursor of [
      { anchor: -1, head: 0 },
      { anchor: 0.5, head: 0 },
      { anchor: 999, head: 999 },
    ]) {
      expect(() => {
        controller.setCursor('index.html', cursor);
      }).toThrow(/cursor/u);
    }
    expect(() => {
      controller.setCursor('index.html', { anchor: 2, head: 3 });
    }).not.toThrow();
  });

  it('Hintをlevel順に一度だけ開き、review復帰位置を保存する', async () => {
    const persistence = repositoryHarness();
    const controller = new LearningSessionController(
      controllerInput({ repository: persistence.repository }),
    );

    controller.revealNextHint();
    controller.revealNextHint();
    controller.revealNextHint();
    controller.revealNextHint();
    expect(controller.getSnapshot().revealedHintIds).toEqual(
      [...baseExercise.hints].sort((left, right) => left.level - right.level).map(({ id }) => id),
    );
    expect(() => {
      controller.openReview('unknown-slide', 0);
    }).toThrow(/Slide/u);
    expect(() => {
      controller.openReview(baseExercise.relatedSlideIds[0]!, -1);
    }).toThrow(/offset/u);
    controller.openReview(baseExercise.relatedSlideIds[0]!, 42);
    expect(controller.getSnapshot().phase).toBe('review');
    controller.closeReview();
    await controller.flush();
    const savedDraft = persistence.putDraft.mock.calls.at(-1)?.[0];
    expect(savedDraft?.reviewSlideId).toBe(baseExercise.relatedSlideIds[0]);
    expect(savedDraft?.reviewScrollOffset).toBe(42);
    expect(savedDraft?.revealedHintIds).toEqual(baseExercise.hints.map(({ id }) => id));
  });

  it('判定結果Draftの保存失敗時はhistory/batch/passingをcommitせずerror状態にする', async () => {
    const persistence = repositoryHarness();
    persistence.putDraft.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('quota'));
    const controller = new LearningSessionController(
      controllerInput({ repository: persistence.repository }),
    );
    controller.edit('index.html', '<main>save failure</main>');

    await expect(controller.validateNow()).rejects.toThrow('quota');

    expect(controller.getSnapshot().validationHistory).toEqual([]);
    expect(controller.getSnapshot().saveStatus).toBe('error');
    expect(controller.getLastValidationBatch()).toEqual([]);
    await controller.flush();
    const recoveredDraft = persistence.putDraft.mock.calls.at(-1)?.[0];
    expect(recoveredDraft?.validationHistory).toEqual([]);
    expect(recoveredDraft?.lastPassingSnapshots).toEqual({});
  });

  it('disposeは進行Runnerを待ち最新Draftをflushして一度だけ解放する', async () => {
    const pending = deferred<RunnerRenderResult>();
    const events: string[] = [];
    const runtime = runnerHarness(events);
    runtime.render.mockImplementationOnce(async (input) => {
      events.push('render:start');
      const result = await pending.promise;
      events.push('render:end');
      return { ...result, exerciseSessionId: input.exerciseSessionId };
    });
    runtime.dispose.mockImplementation(async () => {
      events.push('dispose');
    });
    const persistence = repositoryHarness({
      onPut: async () => {
        events.push('save');
      },
    });
    const controller = new LearningSessionController(
      controllerInput({ runner: runtime.runner, repository: persistence.repository }),
    );
    controller.edit('index.html', '<main>pending</main>');
    const preview = controller.previewNow();
    await Promise.resolve();
    const firstDispose = controller.dispose();
    const secondDispose = controller.dispose();
    expect(runtime.dispose).not.toHaveBeenCalled();
    pending.resolve({
      exerciseSessionId: 'ignored',
      executionRevision: 1,
      diagnostics: [],
      evidence: [],
    });
    await preview;
    await Promise.all([firstDispose, secondDispose]);

    expect(events).toEqual(['render:start', 'render:end', 'save', 'dispose']);
    expect(runtime.dispose).toHaveBeenCalledOnce();
    await expect(controller.previewNow()).rejects.toThrow(/dispose/u);
  });

  it('Performance API失敗をpreviewへ波及させず、request ID factoryを使う', async () => {
    vi.spyOn(performance, 'mark').mockImplementation(() => {
      throw new Error('unsupported');
    });
    const runtime = runnerHarness();
    const controller = new LearningSessionController(
      controllerInput({ runner: runtime.runner, createRequestId: () => 'injected-id' }),
    );

    await expect(controller.previewNow()).resolves.toBeUndefined();
    await expect(controller.validateNow()).resolves.toMatchObject({ status: 'pass' });
    expect(runtime.requestSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'injected-id' }),
    );
  });

  it('Web Cryptoがない環境でもboundedな一意request IDで全viewportを判定する', async () => {
    vi.stubGlobal('crypto', undefined);
    const current = exercise({
      previewViewports: [
        { id: 'desktop', width: 1280, height: 720 },
        { id: 'mobile', width: 390, height: 844 },
      ],
    });
    const runtime = runnerHarness();
    const controller = new LearningSessionController(
      controllerInput({ exercise: current, runner: runtime.runner }, { defaultRequestId: false }),
    );

    await expect(controller.validateNow()).resolves.toMatchObject({ status: 'pass' });
    const requestIds = runtime.requestSnapshot.mock.calls.map(([request]) => request.requestId);
    expect(requestIds).toHaveLength(2);
    expect(new Set(requestIds).size).toBe(2);
    expect(requestIds.every((requestId) => requestId.length > 0 && requestId.length <= 256)).toBe(
      true,
    );
  });

  it('timer起点previewの背景通知callbackがthrowしても未処理rejectionにしない', async () => {
    const runtime = runnerHarness();
    runtime.render.mockRejectedValueOnce(new Error('preview failed'));
    const onBackgroundError = vi.fn(() => {
      throw new Error('observer failed');
    });
    const controller = new LearningSessionController(
      controllerInput({ runner: runtime.runner, onBackgroundError }),
    );

    controller.edit('index.html', '<main>timer</main>');
    await vi.advanceTimersByTimeAsync(250);
    await Promise.resolve();

    expect(onBackgroundError).toHaveBeenCalledOnce();
  });

  it('autosave失敗とretry成功を永続Notice用callbackへ転送する', async () => {
    const saveDraft = vi
      .fn<(draft: ExerciseDraft) => Promise<void>>()
      .mockRejectedValueOnce(new Error('quota'))
      .mockResolvedValueOnce(undefined);
    const onSaveError = vi.fn();
    const onSaveRecovered = vi.fn();
    const controller = new LearningSessionController(
      controllerInput({ saveDraft, onSaveError, onSaveRecovered }),
    );

    controller.edit('index.html', '<main>保存を再試行</main>');
    await vi.advanceTimersByTimeAsync(450);
    expect(onSaveError).toHaveBeenCalledOnce();
    expect(onSaveRecovered).not.toHaveBeenCalled();

    await controller.flush();
    expect(onSaveRecovered).toHaveBeenCalledOnce();
  });

  it('subscriptionは安定snapshotを返し通知中のunsubscribeで残りlistenerを壊さない', () => {
    const controller = new LearningSessionController(controllerInput());
    const first = vi.fn();
    const second = vi.fn();
    let unsubscribeSecond: () => void = () => undefined;
    controller.subscribe(() => {
      first();
      unsubscribeSecond();
    });
    unsubscribeSecond = controller.subscribe(second);
    const before = controller.getSnapshot();

    controller.selectFile('index.html');

    expect(controller.getSnapshot()).not.toBe(before);
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
  });
});
