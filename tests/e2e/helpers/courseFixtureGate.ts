import { expect, type Page, type TestInfo } from '@playwright/test';
import {
  loadAuthoringCourse,
  type AuthoringExercise,
  type AuthoringFixture,
} from '../../../scripts/content/compileCourse';
import { readSplitCourseArtifacts } from '../../../scripts/content/readSplitCourseArtifacts';
import type { AssetRef, ExerciseFile } from '../../../src/core/content/types';
import type {
  RunnerInput,
  SnapshotPolicy,
  RunnerAdapter,
  RunnerDiagnostic,
} from '../../../src/core/runtime/contracts';
import type { ValidationContext, ValidationResult } from '../../../src/core/validation/contracts';
import type { ValidatorAdapter } from '../../../src/core/validation/contracts';
import type * as ConsoleRuntime from '../../../src/features/learning/browserConsoleRuntime';
import { observeRuntimePage, readRuntimeErrors } from './openRuntimeFixture';
import {
  loadJavaScriptRunnerModulePath,
  loadJavaScriptValidatorModulePath,
  loadBrowserConsoleModulePath,
} from './javascriptRunnerModule';
import { testBasePath, testServerUrl } from './testBasePath';
import type { RunnerRenderResult, ExecutionResult } from '../../../src/core/runtime/contracts';
import { hashValue } from '../../../scripts/release/v2/identity';
import { fixtureSourceDigest } from '../../../scripts/release/v2/fixtureSource';
import type { FixtureObservation } from '../../../scripts/release/v2/browserCoverage';

import {
  extendSnapshotPolicyForInteractions,
  runInteractionScenario,
} from '../../../src/features/learning/session/runInteractionScenario';

interface PendingInteractionValidation {
  readonly context: ValidationContext;
  readonly policy: SnapshotPolicy;
  readonly runnerInput: RunnerInput;
}

export interface BrowserFixtureCase {
  readonly caseKind?: 'solution' | 'starter' | 'authored';
  readonly fixtureId?: string;
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
  readonly harnessUrl?: string;
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
export function createCases(
  exercises: readonly AuthoringExercise[],
): readonly BrowserFixtureCase[] {
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
      caseKind: 'solution',
      fixtureId: 'solution',
      id: `${authoring.id}/solution`,
      exercise,
      workspaceAssets: workspaceAssets.get(authoring.workspaceId) ?? authoring.assets,
      files: payloadFiles(authoring, solutionFiles),
      expectedStatus: 'pass',
      expectedFeedbackRuleIds: [],
    };
    const starter: BrowserFixtureCase = {
      caseKind: 'starter',
      fixtureId: 'starter',
      id: `${authoring.id}/starter`,
      exercise,
      workspaceAssets: workspaceAssets.get(authoring.workspaceId) ?? authoring.assets,
      files: payloadFiles(authoring, []),
      expectedStatus: 'not-pass',
    };
    const fixtureCases = fixtures.map((fixture: AuthoringFixture): BrowserFixtureCase => ({
      id: `${authoring.id}/${fixture.id}`,
      caseKind: 'authored',
      fixtureId: fixture.id,
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
export async function evaluateCase(
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
      let lastRendered: RunnerRenderResult | undefined;
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
          lastRendered = rendered;
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
        // Preserve the actual terminal compiler refusal as authored negative-fixture evidence.
        // Environment/unsupported failures remain system errors and never qualify a code-error case.
        const errors = diagnostics.filter(({ severity }) => severity === 'error');
        if ((languageId === 'typescript' || languageId === 'react') && errors.length > 0) {
          return {
            exerciseId: exercise.id,
            executionRevision,
            status: errors.some(({ kind }) => kind === 'system' || kind === 'unsupported')
              ? 'system-error'
              : 'code-error',
            checks: [],
            passedRequirementIds: [],
            diagnostics,
            evaluatedAt: new Date().toISOString(),
          };
        }
        const execution: ExecutionResult | undefined =
          lastRendered === undefined
            ? undefined
            : {
                ...lastRendered,
                runId: crypto.randomUUID(),
                backend: 'browser',
                engine: languageId === 'html-css' ? 'browser-html-css' : 'browser-js',
                status: 'succeeded',
              };
        const context: ValidationContext = {
          exerciseId: exercise.id,
          ...(execution === undefined ? {} : { execution }),
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
  let interactionDiagnostics: readonly RunnerDiagnostic[] = [];
  try {
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
              interactionDiagnostics = interaction.diagnostics ?? [];
                throw new Error(
                  `Fixture Interaction実行不能: ${JSON.stringify(interaction.diagnostics)}`,
                );
              }
            },
          })),
        );
      }
    }
  } catch (error) {
    // Only an actual Runner-reported code failure can become a negative fixture result.
    if (!interactionDiagnostics.some(({ severity }) => severity === 'error')) throw error;
  }
  const diagnostics = [...initial.context.diagnostics, ...interactionDiagnostics];
  const context: ValidationContext = {
    ...initial.context,
    diagnostics,
    interactionCheckpoints: checkpoints,
    ...(interactionDiagnostics.length > 0 && initial.context.execution
      ? {
          execution: {
            ...initial.context.execution,
            diagnostics,
            status: interactionDiagnostics.some(({ kind }) => kind === 'system')
              ? ('system-error' as const)
              : ('code-error' as const),
          },
        }
      : {}),
  };
  return page.evaluate(
    async (input) => {
      const module = (await import(/* @vite-ignore */ input.validatorModulePath)) as Record<
        string,
        unknown
      >;
      const Validator = module[input.validatorExportName] as new () => ValidatorAdapter;
      return new Validator().validate(input.context);
    },
    { ...runtime, context },
  );
}

/** Browser fixture gateで再利用したRunnerとiframeを最後に一度だけ解放する。 */
export async function disposeFixtureHarness(page: Page): Promise<void> {
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

export const HTML_FIXTURE_RUNTIME: BrowserFixtureRuntimeInput = {
  runnerModulePath: new URL('src/adapters/runtime/html-css/index.ts', testServerUrl(4174)).href,
  validatorModulePath: new URL('src/core/validation/validatorRuleEngine.ts', testServerUrl(4174))
    .href,
  runnerExportName: 'HtmlCssRunnerAdapter',
  validatorExportName: 'ValidatorRuleEngine',
  languageId: 'html-css',
};

/** Workerを含むJavaScript runtimeをpreviewと同じoriginのbuild chunkへ固定する。 */
export async function loadJavaScriptFixtureRuntime(): Promise<BrowserFixtureRuntimeInput> {
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
  readonly exerciseIds?: readonly string[];
  readonly runtime: BrowserFixtureRuntimeInput;
}

/** 1 CourseのSolution、Starter、Fixtureを実Browser runtimeへ通す。 */
export async function assertCourseFixtureGate(
  page: Page,
  input: CourseFixtureGateInput,
  info: TestInfo,
): Promise<void> {
  await observeRuntimePage(page);
  const authoring = await loadAuthoringCourse(input.courseRoot);
  const generatedCourse = await readSplitCourseArtifacts('public', input.courseId);
  const generatedIds = generatedCourse.phases.flatMap(({ chapters }) =>
    chapters.flatMap(({ lessons }) =>
      lessons.flatMap(({ exercises }) => exercises.map(({ id }) => id)),
    ),
  );
  expect([...generatedIds].sort()).toEqual(authoring.exercises.map(({ id }) => id).sort());
  const selected =
    input.exerciseIds === undefined
      ? authoring.exercises
      : authoring.exercises.filter(({ id }) => input.exerciseIds!.includes(id));
  if (input.exerciseIds)
    expect(selected.map(({ id }) => id).sort()).toEqual([...input.exerciseIds].sort());
  const full = new Map(selected.map((exercise) => [exercise.id, exercise]));
  const selectedIds = new Set(selected.map(({ id }) => id));
  const allCases = createCases(authoring.exercises).filter(({ exercise }) =>
    selectedIds.has(exercise.id),
  );
  const observations: FixtureObservation[] = [];
  function observe(fixtureCase: BrowserFixtureCase, result: ValidationResult): void {
    const exercise = full.get(fixtureCase.exercise.id);
    const lesson = authoring.runtime.phases
      .flatMap(({ chapters }) => chapters.flatMap(({ lessons }) => lessons))
      .find(({ exercises }) => exercises.some(({ id }) => id === fixtureCase.exercise.id));
    if (!exercise || !lesson || !fixtureCase.caseKind || !fixtureCase.fixtureId)
      throw new Error('Missing executed fixture identity');
    observations.push({
      schemaVersion: 1,
      key: [
        input.courseId,
        lesson.id,
        exercise.id,
        fixtureCase.caseKind,
        fixtureCase.fixtureId,
        'browser',
      ].join('/'),
      inputDigest: hashValue(exercise),
      sourceDigest: fixtureSourceDigest(fixtureCase.files, fixtureCase.faultInjection),
      actualStatus: result.status,
    });
  }
  const filter = process.env['COURSE_FIXTURE_FILTER'];
  const cases = filter === undefined ? allCases : allCases.filter(({ id }) => id.includes(filter));
  expect(cases.length, `Fixture filterに一致するcaseがありません: ${filter ?? ''}`).toBeGreaterThan(
    0,
  );

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
  if (input.runtime.harnessUrl) {
    await page.route(input.runtime.harnessUrl, (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><title>Manifest fixture runtime</title>',
      }),
    );
  }
  await page.goto(input.runtime.harnessUrl ?? testBasePath());

  try {
    let unexpectedSystemErrors = 0;
    const expectedUnhandledRejections: string[] = [];
    for (const fixtureCase of cases) {
      const previousErrors = await readRuntimeErrors(page);
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
        observe(fixtureCase, result);
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
        .filter(({ passed }) => !passed)
        .map(({ ruleId }) => ruleId)
        .sort();
      expect(failedFeedbackRuleIds, assertionContext).toEqual(
        [...(fixtureCase.expectedFeedbackRuleIds ?? [])].sort(),
      );
      if (
        fixtureCase.expectedStatus === 'code-error' &&
        fixtureCase.expectedDiagnosticCodes?.includes('javascript-runtime')
      ) {
        const errors = await readRuntimeErrors(page);
        const actualMessages = result.diagnostics
          .filter(({ severity }) => severity === 'error')
          .map(({ message }) => message);
        for (const rejection of errors.unhandledRejections.slice(
          previousErrors.unhandledRejections.length,
        )) {
          expect(actualMessages, assertionContext).toContain(rejection);
          expectedUnhandledRejections.push(rejection);
        }
      }
      observe(fixtureCase, result);
    }

    await Promise.all(contentResponseChecks);
    expect(contentLeaks).toEqual([]);
    expect(unexpectedSystemErrors).toBe(0);
    await expect(readRuntimeErrors(page)).resolves.toEqual({
      pageErrors: [],
      unhandledRejections: expectedUnhandledRejections,
      consoleErrors: [],
    });
    await info.attach('release-fixtures-v1', {
      body: JSON.stringify(observations),
      contentType: 'application/json',
    });
  } finally {
    await disposeFixtureHarness(page);
  }
}
