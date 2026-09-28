import { expect, test, type Page } from '@playwright/test';
import {
  loadAuthoringCourse,
  type AuthoringExercise,
  type AuthoringFixture,
} from '../../scripts/content/compileCourse';
import { readSplitCourseArtifacts } from '../../scripts/content/readSplitCourseArtifacts';
import type { AssetRef, ExerciseFile } from '../../src/core/content/types';
import type { RunnerInput, SnapshotPolicy, RunnerAdapter } from '../../src/core/runtime/contracts';
import type { ValidationContext, ValidationResult } from '../../src/core/validation/contracts';
import type { ValidatorAdapter } from '../../src/core/validation/contracts';
import type * as ConsoleRuntime from '../../src/features/learning/browserConsoleRuntime';
import { observeRuntimePage, readRuntimeErrors } from './helpers/openRuntimeFixture';
import {
  loadJavaScriptRunnerModulePath,
  loadJavaScriptValidatorModulePath,
  loadBrowserConsoleModulePath,
} from './helpers/javascriptRunnerModule';
import { testBasePath, testServerUrl } from './helpers/testBasePath';

import {
  extendSnapshotPolicyForInteractions,
  runInteractionScenario,
} from '../../src/features/learning/session/runInteractionScenario';

interface PendingInteractionValidation {
  readonly context: ValidationContext;
  readonly policy: SnapshotPolicy;
  readonly runnerInput: RunnerInput;
}

interface BrowserFixtureCase {
  readonly id: string;
  readonly exercise: Omit<AuthoringExercise, 'solutionFiles' | 'fixtures'>;
  readonly workspaceAssets: readonly AssetRef[];
  readonly files: Readonly<Record<string, string>>;
  readonly expectedStatus: AuthoringFixture['expectedStatus'] | 'not-pass';
  readonly faultInjection?: AuthoringFixture['faultInjection'];
  readonly expectedDiagnosticCodes?: readonly string[];
  readonly expectedFeedbackRuleIds?: readonly string[];
}

interface BrowserFixtureEvaluationInput {
  readonly fixtureCase: BrowserFixtureCase;
  readonly runnerModulePath: string;
  readonly validatorModulePath: string;
  readonly runnerExportName: string;
  readonly validatorExportName: string;
  readonly languageId: string;
  readonly consoleModulePath?: string;
}

type BrowserFixtureRuntimeInput = Omit<BrowserFixtureEvaluationInput, 'fixtureCase'>;

/** StarterへPayload fileを重ね、Runnerへ渡すpath-content recordを返す。 */
function payloadFiles(
  exercise: AuthoringExercise,
  payload: readonly ExerciseFile[],
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    [...exercise.files, ...payload].map(({ path, content }) => [path, content]),
  );
}

/** Authoring PackageからSolution、Starter、宣言済みFixtureのBrowser caseを作る。 */
function createCases(exercises: readonly AuthoringExercise[]): readonly BrowserFixtureCase[] {
  const workspaceAssets = new Map<string, readonly AssetRef[]>();
  for (const exercise of exercises) {
    if (workspaceAssets.has(exercise.workspaceId)) continue;
    const byId = new Map<string, AssetRef>();
    for (const asset of exercises
      .filter(({ workspaceId }) => workspaceId === exercise.workspaceId)
      .flatMap(({ assets }) => assets)) {
      byId.set(asset.id, asset);
    }
    workspaceAssets.set(exercise.workspaceId, [...byId.values()]);
  }
  return exercises.flatMap((authoring) => {
    const { solutionFiles, fixtures, ...exercise } = authoring;
    const solution: BrowserFixtureCase = {
      id: `${authoring.id}/solution`,
      exercise,
      workspaceAssets: workspaceAssets.get(authoring.workspaceId) ?? authoring.assets,
      files: payloadFiles(authoring, solutionFiles),
      expectedStatus: 'pass',
      expectedFeedbackRuleIds: [],
    };
    const starter: BrowserFixtureCase = {
      id: `${authoring.id}/starter`,
      exercise,
      workspaceAssets: workspaceAssets.get(authoring.workspaceId) ?? authoring.assets,
      files: payloadFiles(authoring, []),
      expectedStatus: 'not-pass',
    };
    const fixtureCases = fixtures.map((fixture: AuthoringFixture): BrowserFixtureCase => ({
      id: `${authoring.id}/${fixture.id}`,
      exercise,
      workspaceAssets: workspaceAssets.get(authoring.workspaceId) ?? authoring.assets,
      files: payloadFiles(authoring, fixture.files),
      expectedStatus: fixture.expectedStatus,
      ...(fixture.faultInjection === undefined ? {} : { faultInjection: fixture.faultInjection }),
      ...(fixture.expectedDiagnosticCodes === undefined
        ? {}
        : { expectedDiagnosticCodes: fixture.expectedDiagnosticCodes }),
      expectedFeedbackRuleIds: fixture.expectedFeedbackRuleIds,
    }));
    return [solution, starter, ...fixtureCases];
  });
}

/** 実iframe RunnerとValidatorへ1 caseを注入し、同一revisionの判定結果を返す。 */
async function evaluateCase(
  page: Page,
  fixtureCase: BrowserFixtureCase,
  runtime: BrowserFixtureRuntimeInput,
): Promise<ValidationResult> {
  const initial = await page.evaluate<
    ValidationResult | PendingInteractionValidation,
    BrowserFixtureEvaluationInput
  >(
    async (input) => {
      const { exercise, files, workspaceAssets } = input.fixtureCase;
      const {
        languageId,
        runnerExportName,
        runnerModulePath,
        validatorExportName,
        validatorModulePath,
      } = input;
      // 製品と同じ適用条件でConsoleの実行器・採点器を一組にする。
      if (input.consoleModulePath !== undefined) {
        const runtime = (await import(
          /* @vite-ignore */ input.consoleModulePath
        )) as typeof ConsoleRuntime;
        const selected = runtime.selectBrowserConsoleRuntime(exercise, [exercise]);
        if (selected !== undefined) {
          const executionService = selected.createExecution();
          const validator = selected.createValidator();
          try {
            const execution = await executionService.execute({
              runId: crypto.randomUUID(),
              exerciseSessionId: crypto.randomUUID(),
              executionRevision: 1,
              backend: 'browser',
              engine: 'browser-js',
              languageId: 'javascript',
              requiredCapabilities: ['console'],
              files,
              options: { runtime: exercise.runtime },
            });
            return await validator.validate({
              exerciseId: exercise.id,
              rules: exercise.validationRules,
              ...(exercise.runtime === undefined ? {} : { runtime: exercise.runtime }),
              files:
                input.fixtureCase.faultInjection === 'stale-source-evidence'
                  ? { ...files, 'script.js': `${files['script.js'] ?? ''}\n` }
                  : files,
              snapshots: {},
              diagnostics: execution.diagnostics,
              evidence: execution.evidence,
              console: execution.console,
              execution,
              interactionScenarios: [],
              interactionCheckpoints: {},
              now: new Date().toISOString(),
            });
          } finally {
            await executionService.dispose();
          }
        }
      }
      const runnerModule = (await import(/* @vite-ignore */ runnerModulePath)) as Record<
        string,
        unknown
      >;
      const validatorModule = (await import(/* @vite-ignore */ validatorModulePath)) as Record<
        string,
        unknown
      >;
      const Runner = runnerModule[runnerExportName] as (new () => RunnerAdapter) | undefined;
      const Validator = validatorModule[validatorExportName] as
        (new () => ValidatorAdapter) | undefined;
      if (Runner === undefined || Validator === undefined) {
        throw new Error(
          `Fixture runtime exportがありません: ${runnerExportName}/${validatorExportName}`,
        );
      }
      const harnessWindow = window as typeof window & {
        __tsumucodeCourseFixtureHarness?: {
          readonly runner: RunnerAdapter;
          readonly frame: HTMLIFrameElement;
        };
      };
      if (harnessWindow.__tsumucodeCourseFixtureHarness === undefined) {
        const runner = new Runner();
        const frame = document.createElement('iframe');
        frame.style.position = 'fixed';
        frame.style.left = '0';
        frame.style.top = '0';
        frame.style.opacity = '0';
        frame.style.pointerEvents = 'none';
        document.body.append(frame);
        await runner.prepare(frame);
        harnessWindow.__tsumucodeCourseFixtureHarness = { runner, frame };
      }
      const { runner, frame } = harnessWindow.__tsumucodeCourseFixtureHarness;
      const validator = new Validator();
      const exerciseSessionId = crypto.randomUUID();
      const executionRevision = 1;
      const policy = validator.buildSnapshotPolicy(exercise.validationRules);
      const snapshots: Record<string, Awaited<ReturnType<typeof runner.requestSnapshot>>> = {};
      const diagnostics: Awaited<ReturnType<typeof runner.render>>['diagnostics'][number][] = [];
      let evidence: Awaited<ReturnType<typeof runner.render>>['evidence'] | undefined;
      let consoleRecords: Awaited<ReturnType<typeof runner.render>>['console'] | undefined;
      const bridgeMessages: { readonly type: string; readonly sourceMatches: boolean }[] = [];
      const observeBridgeMessage = (event: MessageEvent): void => {
        if (typeof event.data !== 'object' || event.data === null) return;
        const type = (event.data as Record<string, unknown>)['type'];
        if (typeof type !== 'string' || !type.startsWith('bridge.')) return;
        bridgeMessages.push({ type, sourceMatches: event.source === frame.contentWindow });
      };
      window.addEventListener('message', observeBridgeMessage);
      try {
        for (const viewport of exercise.previewViewports) {
          const rendered = await runner.render({
            exerciseSessionId,
            executionRevision,
            languageId,
            files,
            assets: workspaceAssets.map((asset) => ({
              id: asset.id,
              mediaType: asset.mediaType,
              url: new URL(asset.path, window.location.href).href,
            })),
            viewport,
            options: exercise.runtime === undefined ? {} : { runtime: exercise.runtime },
          });
          diagnostics.push(...rendered.diagnostics);
          if (evidence === undefined) evidence = rendered.evidence;
          else if (JSON.stringify(evidence) !== JSON.stringify(rendered.evidence)) {
            throw new Error('Fixture Runner evidenceがViewport間で一致しません');
          }
          if (consoleRecords === undefined) consoleRecords = rendered.console;
          else if (JSON.stringify(consoleRecords) !== JSON.stringify(rendered.console)) {
            throw new Error('Fixture Runner ConsoleがViewport間で一致しません');
          }
          if (rendered.diagnostics.some(({ severity }) => severity === 'error')) continue;
          snapshots[viewport.id] = await runner.requestSnapshot({
            exerciseSessionId,
            executionRevision,
            requestId: crypto.randomUUID(),
            policy,
          });
        }
        const validationFiles =
          input.fixtureCase.faultInjection === 'stale-source-evidence'
            ? {
                ...files,
                [exercise.runtime?.entryFile ?? 'script.js']:
                  `${files[exercise.runtime?.entryFile ?? 'script.js'] ?? ''}\n`,
              }
            : files;
        const context: ValidationContext = {
          exerciseId: exercise.id,
          rules: exercise.validationRules,
          ...(exercise.runtime === undefined ? {} : { runtime: exercise.runtime }),
          files: validationFiles,
          snapshots,
          diagnostics,
          evidence: evidence ?? [],
          console: consoleRecords ?? [],
          interactionScenarios: exercise.interactionScenarios ?? [],
          interactionCheckpoints: {},
          now: new Date().toISOString(),
        };
        if (
          (exercise.interactionScenarios?.length ?? 0) === 0 ||
          diagnostics.some(({ severity }) => severity === 'error')
        )
          return await validator.validate(context);
        return {
          context,
          policy,
          runnerInput: {
            exerciseSessionId,
            executionRevision,
            languageId,
            files,
            assets: workspaceAssets.map((asset) => ({
              id: asset.id,
              mediaType: asset.mediaType,
              url: new URL(asset.path, window.location.href).href,
            })),
            viewport: exercise.previewViewports[0]!,
            options: exercise.runtime === undefined ? {} : { runtime: exercise.runtime },
          },
        };
      } catch (error) {
        throw new Error(
          `${error instanceof Error ? error.message : String(error)}; bridgeMessages=${JSON.stringify(bridgeMessages)}`,
          { cause: error },
        );
      } finally {
        window.removeEventListener('message', observeBridgeMessage);
      }
    },
    { fixtureCase, ...runtime },
  );
  if (!('context' in initial)) return initial;
  // Node側の製品helperへBrowser内の実Runnerを接続し、判定結果を捏造しない。
  const policy = extendSnapshotPolicyForInteractions(initial.policy, [fixtureCase.exercise]);
  const checkpoints: Record<string, Awaited<ReturnType<typeof runInteractionScenario>>> = {};
  const nextRequestId = (): string => crypto.randomUUID();
  for (const viewport of fixtureCase.exercise.previewViewports) {
    checkpoints[viewport.id] = [];
    for (const scenario of fixtureCase.exercise.interactionScenarios ?? []) {
      checkpoints[viewport.id]!.push(
        ...(await runInteractionScenario({
          exerciseSessionId: initial.runnerInput.exerciseSessionId,
          executionRevision: initial.runnerInput.executionRevision,
          viewport,
          policy,
          scenario,
          render: () =>
            page.evaluate(
              async (input) => {
                const harness = (
                  window as typeof window & {
                    __tsumucodeCourseFixtureHarness?: { runner: RunnerAdapter };
                  }
                ).__tsumucodeCourseFixtureHarness;
                if (harness === undefined) throw new Error('Fixture Runnerがありません');
                return harness.runner.render(input);
              },
              { ...initial.runnerInput, viewport },
            ),
          interact: (request) =>
            page.evaluate(async (request) => {
              const harness = (
                window as typeof window & {
                  __tsumucodeCourseFixtureHarness?: { runner: RunnerAdapter };
                }
              ).__tsumucodeCourseFixtureHarness;
              if (harness?.runner.interact === undefined)
                throw new Error('Fixture RunnerがInteractionに対応していません');
              return harness.runner.interact(request);
            }, request),
          requestSnapshot: (request) =>
            page.evaluate(async (request) => {
              const harness = (
                window as typeof window & {
                  __tsumucodeCourseFixtureHarness?: { runner: RunnerAdapter };
                }
              ).__tsumucodeCourseFixtureHarness;
              if (harness === undefined) throw new Error('Fixture Runnerがありません');
              return harness.runner.requestSnapshot(request);
            }, request),
          // Fixtureは編集を並行実行しない。非同期結果のidentity確認は製品helperが行う。
          assertFresh: () => undefined,
          nextRequestId,
          assertGradable: (interaction) => {
            if ((interaction.diagnostics ?? []).some(({ severity }) => severity === 'error')) {
              throw new Error(
                `Fixture Interaction実行不能: ${JSON.stringify(interaction.diagnostics)}`,
              );
            }
          },
        })),
      );
    }
  }
  return page.evaluate(
    async (input) => {
      const module = (await import(/* @vite-ignore */ input.validatorModulePath)) as Record<
        string,
        unknown
      >;
      const Validator = module[input.validatorExportName] as new () => ValidatorAdapter;
      return new Validator().validate(input.context);
    },
    { ...runtime, context: { ...initial.context, interactionCheckpoints: checkpoints } },
  );
}

/** Browser fixture gateで再利用したRunnerとiframeを最後に一度だけ解放する。 */
async function disposeFixtureHarness(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const harnessWindow = window as typeof window & {
      __tsumucodeCourseFixtureHarness?: {
        readonly runner: { dispose(): Promise<void> };
        readonly frame: HTMLIFrameElement;
      };
    };
    const harness = harnessWindow.__tsumucodeCourseFixtureHarness;
    if (harness === undefined) return;
    delete harnessWindow.__tsumucodeCourseFixtureHarness;
    await harness.runner.dispose();
    harness.frame.remove();
  });
}

const HTML_FIXTURE_RUNTIME: BrowserFixtureRuntimeInput = {
  runnerModulePath: new URL('src/adapters/runtime/html-css/index.ts', testServerUrl(4174)).href,
  validatorModulePath: new URL('src/core/validation/validatorRuleEngine.ts', testServerUrl(4174))
    .href,
  runnerExportName: 'HtmlCssRunnerAdapter',
  validatorExportName: 'ValidatorRuleEngine',
  languageId: 'html-css',
};

/** Workerを含むJavaScript runtimeをpreviewと同じoriginのbuild chunkへ固定する。 */
async function loadJavaScriptFixtureRuntime(): Promise<BrowserFixtureRuntimeInput> {
  const [runnerModulePath, validatorModulePath, consoleModulePath] = await Promise.all([
    loadJavaScriptRunnerModulePath(),
    loadJavaScriptValidatorModulePath(),
    loadBrowserConsoleModulePath(),
  ]);
  return {
    runnerModulePath,
    validatorModulePath,
    consoleModulePath,
    runnerExportName: 'JavaScriptRunnerAdapter',
    validatorExportName: 'JavaScriptValidator',
    languageId: 'javascript',
  };
}

interface CourseFixtureGateInput {
  readonly courseRoot: string;
  readonly courseId: string;
  readonly expectedExerciseCount: number;
  readonly runtime: BrowserFixtureRuntimeInput;
}

/** 1 CourseのSolution、Starter、Fixtureを実Browser runtimeへ通す。 */
async function assertCourseFixtureGate(page: Page, input: CourseFixtureGateInput): Promise<void> {
  await observeRuntimePage(page);
  const authoring = await loadAuthoringCourse(input.courseRoot);
  expect(authoring.exercises).toHaveLength(input.expectedExerciseCount);
  const allCases = createCases(authoring.exercises);
  expect(allCases.filter(({ id }) => id.endsWith('/solution'))).toHaveLength(
    input.expectedExerciseCount,
  );
  expect(allCases.filter(({ id }) => id.endsWith('/starter'))).toHaveLength(
    input.expectedExerciseCount,
  );
  const filter = process.env['COURSE_FIXTURE_FILTER'];
  const cases = filter === undefined ? allCases : allCases.filter(({ id }) => id.includes(filter));
  expect(cases.length, `Fixture filterに一致するcaseがありません: ${filter ?? ''}`).toBeGreaterThan(
    0,
  );

  const generatedCourse = await readSplitCourseArtifacts('public', input.courseId);
  expect(JSON.stringify(generatedCourse)).not.toMatch(/"solutionFiles"|"fixtures"/u);

  const contentResponseChecks: Promise<void>[] = [];
  const contentLeaks: string[] = [];
  page.on('response', (response) => {
    if (!response.url().includes('/generated/content/')) return;
    contentResponseChecks.push(
      response
        .text()
        .then((body) => {
          if (/"solutionFiles"|"fixtures"/u.test(body)) contentLeaks.push(response.url());
        })
        .catch(() => undefined),
    );
  });
  await page.goto(testBasePath());

  try {
    let unexpectedSystemErrors = 0;
    for (const fixtureCase of cases) {
      let result: ValidationResult;
      try {
        result = await evaluateCase(page, fixtureCase, input.runtime);
      } catch (error) {
        const runtimeErrors = await readRuntimeErrors(page);
        throw new Error(
          `${fixtureCase.id}: ${error instanceof Error ? error.message : String(error)}; runtimeErrors=${JSON.stringify(runtimeErrors)}`,
          { cause: error },
        );
      }
      let assertionContext = `${fixtureCase.id}\n${JSON.stringify(result, null, 2)}`;
      if (result.status === 'system-error' && fixtureCase.expectedStatus !== 'system-error') {
        unexpectedSystemErrors += 1;
        assertionContext += `\nruntimeErrors=${JSON.stringify(await readRuntimeErrors(page))}`;
      }
      if (fixtureCase.expectedStatus === 'not-pass') {
        expect(result.status, assertionContext).not.toBe('pass');
        expect(result.status, assertionContext).not.toBe('system-error');
        continue;
      }
      expect(result.status, assertionContext).toBe(fixtureCase.expectedStatus);
      if (fixtureCase.expectedDiagnosticCodes !== undefined) {
        const diagnosticCodes = [
          ...new Set(
            result.diagnostics
              .filter(({ severity }) => severity === 'error')
              .map(({ code }) => code),
          ),
        ].sort();
        expect(diagnosticCodes, assertionContext).toEqual(
          [...fixtureCase.expectedDiagnosticCodes].sort(),
        );
      }
      const failedFeedbackRuleIds = result.checks
        .filter(({ requirementPassed }) => !requirementPassed)
        .map(({ ruleId }) => ruleId)
        .sort();
      expect(failedFeedbackRuleIds, assertionContext).toEqual(
        [...(fixtureCase.expectedFeedbackRuleIds ?? [])].sort(),
      );
    }

    await Promise.all(contentResponseChecks);
    expect(contentLeaks).toEqual([]);
    expect(unexpectedSystemErrors).toBe(0);
    await expect(readRuntimeErrors(page)).resolves.toEqual({
      pageErrors: [],
      unhandledRejections: [],
      consoleErrors: [],
    });
  } finally {
    await disposeFixtureHarness(page);
  }
}

test('HTML/CSSの全Solution、Starter、Fixtureを実Browser Runner／Validatorで検証する', async ({
  page,
}) => {
  test.setTimeout(20 * 60 * 1000);
  await assertCourseFixtureGate(page, {
    courseRoot: 'content/html-css',
    courseId: 'html-css',
    expectedExerciseCount: 51,
    runtime: HTML_FIXTURE_RUNTIME,
  });
});

test('JavaScriptの全Solution、Starter、Fixtureを実Browser Runner／Validatorで検証する', async ({
  page,
}) => {
  test.setTimeout(20 * 60 * 1000);
  await assertCourseFixtureGate(page, {
    courseRoot: 'content/javascript',
    courseId: 'javascript',
    expectedExerciseCount: 40,
    runtime: await loadJavaScriptFixtureRuntime(),
  });
});

/** 実教材とは区別した操作fixtureで、初期状態・操作後・fresh frameの境界を実測する。 */
test('JavaScript Scenario fixtureは実click/inputを観測し、未操作の完成表示を合格にしない', async ({
  page,
}) => {
  const authoring = await loadAuthoringCourse('content/javascript');
  const source = authoring.exercises.find(({ id }) => id === 'javascript-ch00-l01-e01')!;
  const base = createCases([source])[0]!.exercise;
  const scenario = {
    id: 'button-flow',
    label: '押して入力する',
    actions: [
      { id: 'click', kind: 'click' as const, selector: '#button' },
      { id: 'input', kind: 'fill' as const, selector: '#name', value: '花子' },
      { id: 'again', kind: 'fill' as const, selector: '#name', value: '太郎' },
      { id: 'clear', kind: 'fill' as const, selector: '#name', value: '' },
    ],
    checkpoints: [
      {
        id: 'clicked',
        afterActionId: 'click',
        expectations: [
          { id: 'one', kind: 'selector-text' as const, selector: '#count', equals: '1' },
        ],
      },
      {
        id: 'typed',
        afterActionId: 'input',
        expectations: [
          { id: 'name', kind: 'selector-text' as const, selector: '#result', equals: '花子' },
        ],
      },
      {
        id: 'retyped',
        afterActionId: 'again',
        expectations: [
          { id: 'next', kind: 'selector-text' as const, selector: '#result', equals: '太郎' },
        ],
      },
      {
        id: 'cleared',
        afterActionId: 'clear',
        expectations: [
          { id: 'empty', kind: 'selector-text' as const, selector: '#result', equals: '' },
        ],
      },
    ],
  };
  const exercise: BrowserFixtureCase['exercise'] = {
    ...base,
    runtime: {
      kind: 'javascript',
      entryFile: 'script.js',
      sourceType: 'script',
      capabilityProfile: 'dom',
      primaryOutput: 'preview',
    },
    validationRules: [
      {
        ...base.validationRules[0]!,
        id: 'query-call',
        target: { kind: 'javascript-source', file: 'script.js' },
        assertion: {
          kind: 'javascript-source-fact',
          fact: { kind: 'call', callee: 'document.querySelector' },
        },
      },
      {
        id: 'initial-count',
        hintId: base.validationRules[0]!.hintId,
        relatedSlideId: base.validationRules[0]!.relatedSlideId,
        label: '初期表示は0',
        required: true,
        group: 'all',
        viewportMode: 'all',
        viewportIds: base.previewViewports.map(({ id }) => id),
        target: { kind: 'selector', selector: '#count' },
        assertion: { kind: 'text', operator: 'equals', expected: '0' },
        feedback: { target: '#count', expected: '0', nextAction: '操作前の状態を確認する' },
      },
    ],
    interactionScenarios: [scenario, { ...scenario, id: 'fresh-flow' }],
  };
  const solution =
    "let count=0;const button=document.querySelector('#button');button.addEventListener('click',()=>{count+=1;document.querySelector('#count').textContent=String(count);});const field=document.querySelector('#name');field.addEventListener('input',event=>{document.querySelector('#result').textContent=event.currentTarget.value;});";
  await page.goto(testBasePath());
  const runtime = await loadJavaScriptFixtureRuntime();
  try {
    for (const [id, script, expected] of [
      ['solution', solution, 'pass'],
      ['wrong-event', solution.replace("'click'", "'mouseover'"), 'incomplete'],
      ['change-only', solution.replace("'input'", "'change'"), 'incomplete'],
      ['upfront', solution + "document.querySelector('#count').textContent='1';", 'incomplete'],
    ] as const) {
      const result = await evaluateCase(
        page,
        {
          id,
          exercise,
          workspaceAssets: [],
          expectedStatus: expected,
          files: {
            'index.html':
              '<button id="button">押す</button><input id="name" aria-label="名前"><p id="count">0</p><p id="result">待機中</p>',
            'script.js': script,
          },
        },
        runtime,
      );
      expect(result.status, JSON.stringify(result)).toBe(expected);
      if (id === 'solution') expect(result.checks.every(({ passed }) => passed)).toBe(true);
      if (id === 'wrong-event')
        expect(result.checks.filter(({ passed }) => !passed).map(({ ruleId }) => ruleId)).toEqual([
          'interaction:button-flow:clicked:one',
          'interaction:fresh-flow:clicked:one',
        ]);
      if (id === 'upfront')
        expect(result.checks.filter(({ passed }) => !passed).map(({ ruleId }) => ruleId)).toEqual([
          'initial-count',
        ]);
      if (id === 'change-only')
        expect(result.checks.filter(({ passed }) => !passed).map(({ ruleId }) => ruleId)).toEqual([
          'interaction:button-flow:typed:name',
          'interaction:button-flow:retyped:next',
          'interaction:button-flow:cleared:empty',
          'interaction:fresh-flow:typed:name',
          'interaction:fresh-flow:retyped:next',
          'interaction:fresh-flow:cleared:empty',
        ]);
    }
  } finally {
    await disposeFixtureHarness(page);
  }
});

/** trusted側の送信停止と学習handlerの取消を実Runner/Validatorで区別する。 */
test('Form Scenarioは同じnative submitのpreventDefaultだけを合格にする', async ({ page }) => {
  const authoring = await loadAuthoringCourse('content/javascript');
  const base = createCases([authoring.exercises[0]!])[0]!.exercise;
  const exercise: BrowserFixtureCase['exercise'] = {
    ...base,
    runtime: {
      kind: 'javascript',
      entryFile: 'script.js',
      sourceType: 'script',
      capabilityProfile: 'dom-form',
      primaryOutput: 'preview',
    },
    validationRules: [
      {
        ...base.validationRules[0]!,
        id: 'initial-display',
        target: { kind: 'selector', selector: '#result' },
        assertion: { kind: 'text', operator: 'equals', expected: '待機中' },
      },
      {
        ...base.validationRules[0]!,
        id: 'query-call',
        target: { kind: 'javascript-source', file: 'script.js' },
        assertion: {
          kind: 'javascript-source-fact',
          fact: { kind: 'call', callee: 'document.querySelector' },
        },
      },
    ],
    interactionScenarios: [
      {
        id: 'submit',
        label: '送信を止めて表示する',
        actions: [{ id: 'send', kind: 'click', selector: '#send' }],
        checkpoints: [
          {
            id: 'handled',
            afterActionId: 'send',
            expectations: [
              { id: 'cancel', kind: 'submit-prevented' },
              { id: 'display', kind: 'selector-text', selector: '#result', equals: '確認した' },
            ],
          },
        ],
      },
    ],
  };
  const solution =
    "const form=document.querySelector('#form');form.addEventListener('submit',event=>{event.preventDefault();document.querySelector('#result').textContent='確認した';});";
  await page.goto(testBasePath());
  const runtime = await loadJavaScriptFixtureRuntime();
  try {
    for (const [id, script, expected] of [
      ['solution', solution, 'pass'],
      ['missing-cancel', solution.replace('event.preventDefault();', ''), 'incomplete'],
      [
        'unreachable-cancel',
        solution.replace('event.preventDefault();', 'if(false){event.preventDefault();}'),
        'incomplete',
      ],
      ['wrong-event', solution.replace("'submit'", "'click'"), 'incomplete'],
    ] as const) {
      const result = await evaluateCase(
        page,
        {
          id,
          exercise,
          workspaceAssets: [],
          expectedStatus: expected,
          files: {
            'index.html':
              '<form id="form"><input aria-label="名前"><button id="send" type="submit">確認</button></form><p id="result">待機中</p>',
            'script.js': script,
          },
        },
        runtime,
      );
      expect(result.status, JSON.stringify(result)).toBe(expected);
      if (id !== 'solution')
        expect(result.checks.filter(({ passed }) => !passed).map(({ ruleId }) => ruleId)).toContain(
          'interaction:submit:handled:cancel',
        );
    }
  } finally {
    await disposeFixtureHarness(page);
  }
});
