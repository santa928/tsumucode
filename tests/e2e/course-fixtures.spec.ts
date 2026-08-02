import { expect, test, type Page } from '@playwright/test';
import {
  loadAuthoringCourse,
  type AuthoringExercise,
  type AuthoringFixture,
} from '../../scripts/content/compileCourse';
import { readSplitCourseArtifacts } from '../../scripts/content/readSplitCourseArtifacts';
import type { HtmlCssRunnerAdapter as HtmlCssRunnerAdapterType } from '../../src/adapters/runtime/html-css';
import type { AssetRef, ExerciseFile } from '../../src/core/content/types';
import type { ValidationResult } from '../../src/core/validation/contracts';
import type { ValidatorRuleEngine as ValidatorRuleEngineType } from '../../src/core/validation/validatorRuleEngine';
import { observeRuntimePage, readRuntimeErrors } from './helpers/openRuntimeFixture';
import { testBasePath, testServerUrl } from './helpers/testBasePath';

interface BrowserFixtureCase {
  readonly id: string;
  readonly exercise: Omit<AuthoringExercise, 'solutionFiles' | 'fixtures'>;
  readonly workspaceAssets: readonly AssetRef[];
  readonly files: Readonly<Record<string, string>>;
  readonly expectedStatus: AuthoringFixture['expectedStatus'] | 'not-pass';
  readonly expectedFeedbackRuleIds?: readonly string[];
}

interface BrowserFixtureEvaluationInput {
  readonly fixtureCase: BrowserFixtureCase;
  readonly runnerModulePath: string;
  readonly validatorModulePath: string;
}

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
      expectedFeedbackRuleIds: fixture.expectedFeedbackRuleIds,
    }));
    return [solution, starter, ...fixtureCases];
  });
}

/** 実iframe RunnerとValidatorへ1 caseを注入し、同一revisionの判定結果を返す。 */
async function evaluateCase(
  page: Page,
  fixtureCase: BrowserFixtureCase,
): Promise<ValidationResult> {
  return page.evaluate<ValidationResult, BrowserFixtureEvaluationInput>(
    async (input) => {
      const { exercise, files, workspaceAssets } = input.fixtureCase;
      const { runnerModulePath, validatorModulePath } = input;
      const { HtmlCssRunnerAdapter } = (await import(/* @vite-ignore */ runnerModulePath)) as {
        readonly HtmlCssRunnerAdapter: typeof HtmlCssRunnerAdapterType;
      };
      const { ValidatorRuleEngine } = (await import(/* @vite-ignore */ validatorModulePath)) as {
        readonly ValidatorRuleEngine: typeof ValidatorRuleEngineType;
      };
      const harnessWindow = window as typeof window & {
        __tsumucodeCourseFixtureHarness?: {
          readonly runner: InstanceType<typeof HtmlCssRunnerAdapter>;
          readonly frame: HTMLIFrameElement;
        };
      };
      if (harnessWindow.__tsumucodeCourseFixtureHarness === undefined) {
        const runner = new HtmlCssRunnerAdapter();
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
      const validator = new ValidatorRuleEngine();
      const exerciseSessionId = crypto.randomUUID();
      const executionRevision = 1;
      const policy = validator.buildSnapshotPolicy(exercise.validationRules);
      const snapshots: Record<string, Awaited<ReturnType<typeof runner.requestSnapshot>>> = {};
      const diagnostics: Awaited<ReturnType<typeof runner.render>>['diagnostics'][number][] = [];
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
            languageId: 'html-css',
            files,
            assets: workspaceAssets.map((asset) => ({
              id: asset.id,
              mediaType: asset.mediaType,
              url: new URL(asset.path, window.location.href).href,
            })),
            viewport,
            options: {},
          });
          diagnostics.push(...rendered.diagnostics);
          snapshots[viewport.id] = await runner.requestSnapshot({
            exerciseSessionId,
            executionRevision,
            requestId: crypto.randomUUID(),
            policy,
          });
        }
        return await validator.validate({
          exerciseId: exercise.id,
          rules: exercise.validationRules,
          files,
          snapshots,
          diagnostics,
          evidence: [],
          now: new Date().toISOString(),
        });
      } catch (error) {
        throw new Error(
          `${error instanceof Error ? error.message : String(error)}; bridgeMessages=${JSON.stringify(bridgeMessages)}`,
          { cause: error },
        );
      } finally {
        window.removeEventListener('message', observeBridgeMessage);
      }
    },
    {
      fixtureCase,
      runnerModulePath: new URL('src/adapters/runtime/html-css/index.ts', testServerUrl(4174)).href,
      validatorModulePath: new URL(
        'src/core/validation/validatorRuleEngine.ts',
        testServerUrl(4174),
      ).href,
    },
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

test('全Solution、Starter、Fixtureを実Browser Runner／Validatorで検証する', async ({ page }) => {
  test.setTimeout(20 * 60 * 1000);
  await observeRuntimePage(page);
  const authoring = await loadAuthoringCourse('content/html-css');
  expect(authoring.exercises).toHaveLength(51);
  const allCases = createCases(authoring.exercises);
  expect(allCases.filter(({ id }) => id.endsWith('/solution'))).toHaveLength(51);
  expect(allCases.filter(({ id }) => id.endsWith('/starter'))).toHaveLength(51);
  const filter = process.env['COURSE_FIXTURE_FILTER'];
  const cases = filter === undefined ? allCases : allCases.filter(({ id }) => id.includes(filter));
  expect(cases.length, `Fixture filterに一致するcaseがありません: ${filter ?? ''}`).toBeGreaterThan(
    0,
  );

  const generatedCourse = await readSplitCourseArtifacts('public', 'html-css');
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
    let systemErrors = 0;
    for (const fixtureCase of cases) {
      let result: ValidationResult;
      try {
        result = await evaluateCase(page, fixtureCase);
      } catch (error) {
        const runtimeErrors = await readRuntimeErrors(page);
        throw new Error(
          `${fixtureCase.id}: ${error instanceof Error ? error.message : String(error)}; runtimeErrors=${JSON.stringify(runtimeErrors)}`,
          { cause: error },
        );
      }
      const assertionContext = `${fixtureCase.id}\n${JSON.stringify(result, null, 2)}`;
      if (result.status === 'system-error') systemErrors += 1;
      expect(result.status, assertionContext).not.toBe('system-error');
      if (fixtureCase.expectedStatus === 'not-pass') {
        expect(result.status, assertionContext).not.toBe('pass');
        continue;
      }
      expect(result.status, assertionContext).toBe(fixtureCase.expectedStatus);
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
    expect(systemErrors).toBe(0);
    await expect(readRuntimeErrors(page)).resolves.toEqual({
      pageErrors: [],
      unhandledRejections: [],
      consoleErrors: [],
    });
  } finally {
    await disposeFixtureHarness(page);
  }
});
