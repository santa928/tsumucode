/** Course別Runtimeの遅延登録、single-flight、再試行契約を検証する。 */
import type { Extension } from '@codemirror/state';
import { describe, expect, it, vi } from 'vitest';
import type { RunnerAdapter } from '../../core/runtime/contracts';
import { RunnerRegistry } from '../../core/runtime/RunnerRegistry';
import type { ValidatorAdapter } from '../../core/validation/contracts';
import { ValidatorRegistry } from '../../core/validation/ValidatorRegistry';
import { EditorLanguageRegistry } from './editor/EditorLanguageRegistry';
import { createCourseRuntimeEnsurer, type CourseRuntimeLoaders } from './javascriptRuntimeServices';

const javascriptCourse = {
  id: 'javascript',
  runnerId: 'javascript',
  validatorId: 'javascript',
} as const;

/** Registryの公開契約を満たす副作用なしRunnerを返す。 */
function runner(languageId = 'javascript'): RunnerAdapter {
  return {
    languageId,
    prepare: vi.fn<RunnerAdapter['prepare']>(async () => undefined),
    render: vi.fn<RunnerAdapter['render']>(async (input) => ({
      exerciseSessionId: input.exerciseSessionId,
      executionRevision: input.executionRevision,
      diagnostics: [],
      evidence: [],
      console: [],
    })),
    requestSnapshot: vi.fn<RunnerAdapter['requestSnapshot']>(async () => {
      throw new Error('snapshotはこのTestの対象外です');
    }),
    dispose: vi.fn<RunnerAdapter['dispose']>(async () => undefined),
  };
}

/** Registryの公開契約を満たす副作用なしValidatorを返す。 */
function validator(): ValidatorAdapter {
  return {
    buildSnapshotPolicy: vi.fn<ValidatorAdapter['buildSnapshotPolicy']>(() => ({
      selectors: [],
      attributes: [],
      computedStyles: [],
      focusVisibleSelectors: [],
      focusVisibleComputedStyles: [],
      includeAllElements: false,
    })),
    validate: vi.fn<ValidatorAdapter['validate']>(async (context) => ({
      exerciseId: context.exerciseId,
      status: 'incomplete',
      checks: [],
      passedRequirementIds: [],
      diagnostics: [],
      executionRevision: null,
      evaluatedAt: '2026-08-02T00:00:00.000Z',
    })),
  };
}

/** 遅延import相当のloader群と観測spyを構築する。 */
function loaderHarness(): CourseRuntimeLoaders & {
  readonly loadRunner: ReturnType<typeof vi.fn<CourseRuntimeLoaders['loadJavaScriptRunner']>>;
  readonly loadValidator: ReturnType<typeof vi.fn<CourseRuntimeLoaders['loadJavaScriptValidator']>>;
  readonly loadEditor: ReturnType<typeof vi.fn<CourseRuntimeLoaders['loadJavaScriptEditor']>>;
} {
  const loadRunner = vi.fn<CourseRuntimeLoaders['loadJavaScriptRunner']>(async () => ({
    create: () => runner(),
  }));
  const loadValidator = vi.fn<CourseRuntimeLoaders['loadJavaScriptValidator']>(async () => ({
    create: validator,
  }));
  const loadEditor = vi.fn<CourseRuntimeLoaders['loadJavaScriptEditor']>(async () => ({
    register: async (registry) => {
      if (!registry.has('javascript')) registry.register('javascript', () => []);
    },
  }));
  return {
    loadJavaScriptRunner: loadRunner,
    loadJavaScriptValidator: loadValidator,
    loadJavaScriptEditor: loadEditor,
    loadRunner,
    loadValidator,
    loadEditor,
  };
}

/** Testごとに独立した空Registry集合を返す。 */
function runtimeServices() {
  return {
    runnerRegistry: new RunnerRegistry(),
    validatorRegistry: new ValidatorRegistry(),
    editorLanguageRegistry: new EditorLanguageRegistry(),
  };
}

describe('ensureCourseRuntime', () => {
  it('JavaScript route到達時だけ三つの遅延moduleを一度ずつ読み込んで登録する', async () => {
    const loaders = loaderHarness();
    const ensureCourseRuntime = createCourseRuntimeEnsurer(loaders);
    const services = runtimeServices();

    expect(services.runnerRegistry.has('javascript')).toBe(false);
    expect(services.validatorRegistry.has('javascript')).toBe(false);
    expect(services.editorLanguageRegistry.has('javascript')).toBe(false);

    await Promise.all([
      ensureCourseRuntime(javascriptCourse, services),
      ensureCourseRuntime(javascriptCourse, services),
    ]);

    expect(loaders.loadRunner).toHaveBeenCalledOnce();
    expect(loaders.loadValidator).toHaveBeenCalledOnce();
    expect(loaders.loadEditor).toHaveBeenCalledOnce();
    expect(services.runnerRegistry.create('javascript').languageId).toBe('javascript');
    expect(services.validatorRegistry.has('javascript')).toBe(true);
    expect(services.editorLanguageRegistry.has('javascript')).toBe(true);
  });

  it('import失敗を成功cacheに残さず、Source用Registryを保ったまま再試行する', async () => {
    const loaders = loaderHarness();
    loaders.loadRunner.mockRejectedValueOnce(new Error('chunk offline'));
    const ensureCourseRuntime = createCourseRuntimeEnsurer(loaders);
    const services = runtimeServices();

    await expect(ensureCourseRuntime(javascriptCourse, services)).rejects.toThrow('chunk offline');
    await expect(ensureCourseRuntime(javascriptCourse, services)).resolves.toBeUndefined();

    expect(loaders.loadRunner).toHaveBeenCalledTimes(2);
    expect(services.runnerRegistry.has('javascript')).toBe(true);
  });

  it('注入済みJavaScript実装を上書きせず、不明CourseとID不一致を明示的に拒否する', async () => {
    const loaders = loaderHarness();
    const ensureCourseRuntime = createCourseRuntimeEnsurer(loaders);
    const services = runtimeServices();
    const existingExtension: Extension = [];
    services.runnerRegistry.register('javascript', () => runner());
    services.validatorRegistry.register('javascript', validator);
    services.editorLanguageRegistry.register('javascript', () => existingExtension);

    await expect(ensureCourseRuntime(javascriptCourse, services)).resolves.toBeUndefined();
    expect(services.editorLanguageRegistry.extensionFor('javascript')).toBe(existingExtension);
    await expect(
      ensureCourseRuntime({ id: 'unknown', runnerId: 'unknown', validatorId: 'unknown' }, services),
    ).rejects.toThrow('未対応のCourse runtimeです: unknown');
    await expect(
      ensureCourseRuntime(
        { id: 'javascript', runnerId: 'html-css', validatorId: 'javascript' },
        services,
      ),
    ).rejects.toThrow('Course runtime IDが一致しません: javascript');
  });
});
