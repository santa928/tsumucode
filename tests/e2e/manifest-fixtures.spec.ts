/** Manifest列挙の全正負入力。独立したUI/隔離/偽造テストは既存specで引き続き実行する。 */
import { readFileSync } from 'node:fs';
import { test } from '@playwright/test';
import { CourseCatalogV3Schema } from '../../src/core/content/deliverySchema';
import path from 'node:path';
import { CourseIndexSchema } from '../../src/core/content/deliverySchema';
import {
  assertCourseFixtureGate,
  HTML_FIXTURE_RUNTIME,
  loadJavaScriptFixtureRuntime,
} from './helpers/courseFixtureGate';
import { testServerUrl } from './helpers/testBasePath';
import { loadRuntimeModulePath } from './helpers/javascriptRunnerModule';

const adapters = {
  'html-css': [
    'src/adapters/runtime/html-css/index.ts',
    'HtmlCssRunnerAdapter',
    'src/core/validation/validatorRuleEngine.ts',
    'ValidatorRuleEngine',
  ],
  typescript: [
    'src/adapters/runtime/typescript/TypeScriptRunnerAdapter.ts',
    'TypeScriptRunnerAdapter',
    'src/adapters/validation/typescript/TypeScriptValidator.ts',
    'TypeScriptValidator',
  ],
  react: [
    'src/adapters/runtime/react/ReactRunnerAdapter.ts',
    'ReactRunnerAdapter',
    'src/adapters/validation/react/ReactValidator.ts',
    'ReactValidator',
  ],
  tailwind: [
    'src/adapters/runtime/tailwind/TailwindRunnerAdapter.ts',
    'TailwindRunnerAdapter',
    'src/core/validation/validatorRuleEngine.ts',
    'ValidatorRuleEngine',
  ],
} as const;
const catalog = CourseCatalogV3Schema.parse(
  JSON.parse(readFileSync('public/generated/content/catalog-v3.json', 'utf8')) as unknown,
);
for (const entry of catalog.courses.filter(
  ({ publicationStatus }) => publicationStatus === 'published',
)) {
  const index = CourseIndexSchema.parse(
    JSON.parse(readFileSync(path.join('public', entry.indexPath), 'utf8')) as unknown,
  );
  const kind = index.runnerId;
  // Python/Next have distinct service contracts; their required targets remain unqualified here.
  if (kind === 'python' || kind === 'next') continue;
  if (kind !== 'javascript' && !Object.hasOwn(adapters, kind))
    throw new Error('Missing manifest fixture driver: ' + kind);
  for (const exercise of index.phases.flatMap(({ chapters }) =>
    chapters.flatMap(({ lessons }) => lessons.flatMap(({ exercises }) => exercises)),
  )) {
    test(entry.id + ' ' + exercise.id + ' manifest fixtures', async ({ page }, info) => {
      test.setTimeout(180_000);
      const mapping = kind === 'javascript' ? undefined : adapters[kind as keyof typeof adapters];
      const runtime =
        kind === 'javascript'
          ? await loadJavaScriptFixtureRuntime()
          : kind === 'html-css'
            ? HTML_FIXTURE_RUNTIME
            : {
                runnerModulePath: await loadRuntimeModulePath(mapping![0]),
                runnerExportName: mapping![1],
                validatorModulePath:
                  kind === 'tailwind'
                    ? new URL(mapping![2], testServerUrl(4174)).href
                    : await loadRuntimeModulePath(mapping![2]),
                validatorExportName: mapping![3],
                languageId: kind,
              };
      await assertCourseFixtureGate(
        page,
        {
          courseRoot: 'content/' + entry.id,
          courseId: entry.id,
          exerciseIds: [exercise.id],
          runtime,
        },
        info,
      );
    });
  }
}
