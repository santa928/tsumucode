// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';
import { parse } from 'yaml';
import ts from 'typescript';

it('keeps CI diagnostic overlay changes in both Runtime triggers', async () => {
  const workflow = parse(await readFile('.github/workflows/local-runtime.yml', 'utf8')) as {
    on: Record<'push' | 'pull_request', { paths: string[] }>;
  };
  const events = ['push', 'pull_request'] as const;
  const overlay = 'compose.learning.ci-diagnostic.yaml';
  const missing = (triggers: typeof workflow.on) =>
    events.filter((event) => !triggers[event].paths.includes(overlay));

  expect(missing(workflow.on)).toEqual([]);
  for (const removed of events) {
    const changed = {
      ...workflow.on,
      [removed]: {
        ...workflow.on[removed],
        paths: workflow.on[removed].paths.filter((item) => item !== overlay),
      },
    };
    expect(missing(changed)).toEqual([removed]);
  }
});

it.each(['push', 'pull_request'] as const)(
  '%s detects changes in the baked Native test import graph',
  async (event) => {
    const workflow = parse(await readFile('.github/workflows/local-runtime.yml', 'utf8')) as {
      on: Record<'push' | 'pull_request', { paths: string[] }>;
    };
    const paths: string[] = workflow.on[event].paths;
    for (const changed of [
      'tests/e2e/helpers/editorDocument.ts',
      'tests/e2e/helpers/manifestLearning.ts',
      'tests/local/manifest-next-learning.spec.ts',
      'playwright.learning-native.config.ts',
      'tests/e2e/python-published-fixtures.spec.ts',
      'playwright.python-local.config.ts',
    ])
      expect(
        paths.some((pattern) => path.matchesGlob(changed, pattern)),
        changed,
      ).toBe(true);
  },
);

it('loads the actual baked Native image before expensive execution, retaining all three real engines', async () => {
  const workflow = parse(await readFile('.github/workflows/local-runtime.yml', 'utf8')) as {
    jobs: { boundary: { steps: { name?: string; if?: string; run?: string }[] } };
  };
  const steps: { name?: string; if?: string; run?: string }[] = workflow.jobs.boundary.steps;
  const early = steps.findIndex(
    (step) => step.name === 'Build Native verification image and check baked imports',
  );
  expect(early).toBeGreaterThan(-1);
  expect(early).toBeLessThan(
    steps.findIndex((step) => step.name === 'Build fixed learner and trusted services'),
  );
  const preflight = steps[early]!;
  expect(preflight.if).toBeUndefined();
  expect(preflight.run).toContain('--target learning-native-checks');
  expect(preflight.run).toContain('--network none');
  expect(preflight.run).toContain('node scripts/local/native-import-preflight.mjs');
  expect(preflight.run).not.toMatch(/--mount|--volume|\s-v\s/u);
  const match = steps.findIndex(
    (step) => step.name === 'Match baked Native contracts to frozen compiler inventory',
  );
  expect(match).toBeLessThan(
    steps.findIndex((step) => step.name === 'Start isolated learning stack'),
  );
  expect(steps[match]!.run).toContain('--file .release-v2/native-catalogs/learning-native.json');
  const actual = steps.find(
    (step) => step.name === 'Verify new Native lessons in every required browser engine',
  )!;
  expect(actual.if).toBe("inputs.candidate_artifact_id != ''");
  expect(actual.run).toContain('for engine in chromium firefox webkit; do');
  expect(actual.run).toContain(
    'node scripts/local/manifest-learning-browser-acceptance.mjs "$engine"',
  );
  expect(actual.run).not.toContain('docker build');
  expect(
    steps.filter((step) => step.run?.includes('--target learning-native-checks')),
  ).toHaveLength(1);
});

it('bakes and preflights the published Python fixture spec without a host mount', async () => {
  const dockerfile = await readFile('Dockerfile.learning', 'utf8');
  const stage = dockerfile
    .split('FROM browser-checks AS python-browser-checks\n')[1]
    ?.split('\nFROM ')[0];
  const spec = 'tests/e2e/python-published-fixtures.spec.ts';
  const copy = `COPY ${spec} ./${spec}`;
  const exactCopyCount = (text: string) => text.split('\n').filter((line) => line === copy).length;
  expect(stage).toBeDefined();
  expect(exactCopyCount(stage!)).toBe(1);
  expect(exactCopyCount(stage!.replace(copy, ''))).toBe(0);
  expect(dockerfile).toContain('FROM python-browser-checks AS learning-native-checks');

  const script = await readFile('scripts/local/native-import-preflight.mjs', 'utf8');
  expect(script).toContain(spec);
  expect(script).toContain('playwright.python-local.config.ts');
  expect(script).toContain("'--pass-with-no-tests'");
  expect(script).toContain("'--retries=0'");
  const specText = await readFile(spec, 'utf8');
  expect(specText).toContain(
    "source.every((course) => course.runtime.publicationStatus !== 'published')",
  );
});

it('fails baked import preflight on a missing spec or either Playwright list failure', async () => {
  const script = (await readFile('scripts/local/native-import-preflight.mjs', 'utf8')).replace(
    /^import .+;\n/gmu,
    '',
  );
  const check = (statuses: number[], missing = '') => {
    const calls: string[][] = [];
    const environments: Record<string, string>[] = [];
    const process = { execPath: '/node', env: {}, exitCode: 0 };
    const execute = () => {
      runInNewContext(script, {
        process,
        lstatSync: (file: string) => ({ isFile: () => file !== missing }),
        spawnSync: (_node: string, args: string[], options: { env: Record<string, string> }) => {
          calls.push(args);
          environments.push(options.env);
          return { status: statuses[calls.length - 1] };
        },
      });
    };
    return { calls, environments, process, execute };
  };
  const good = check([0, 0]);
  good.execute();
  expect(good.calls).toHaveLength(2);
  expect(good.calls[1]).toContain('--config=playwright.python-local.config.ts');
  expect(good.calls[1]).toContain('tests/e2e/python-published-fixtures.spec.ts');
  expect(good.calls[0]).toContain('--pass-with-no-tests');
  expect(good.calls[1]).not.toContain('--pass-with-no-tests');
  expect(good.process.exitCode).toBe(0);
  const firstFailure = check([2, 0]);
  firstFailure.execute();
  expect(firstFailure.calls).toHaveLength(1);
  expect(firstFailure.process.exitCode).toBe(2);
  const secondFailure = check([0, 3]);
  secondFailure.execute();
  expect(secondFailure.calls).toHaveLength(2);
  expect(secondFailure.process.exitCode).toBe(3);
  const missing = check([0, 0], 'tests/e2e/python-published-fixtures.spec.ts');
  expect(missing.execute).toThrow('Missing baked Native test entry');
  expect(missing.calls).toHaveLength(0);
});

it.each(['push', 'pull_request'] as const)(
  '%s covers the relative import graph of the baked Python driver',
  async (event) => {
    const workflow = parse(await readFile('.github/workflows/local-runtime.yml', 'utf8')) as {
      on: Record<'push' | 'pull_request', { paths: string[] }>;
    };
    const pending = ['tests/e2e/python-published-fixtures.spec.ts'];
    const seen = new Set<string>();
    while (pending.length) {
      const file = pending.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      const imports = ts.preProcessFile(readFileSync(file, 'utf8'), true, true).importedFiles;
      for (const entry of imports) {
        if (!entry.fileName.startsWith('.')) continue;
        const base = path.resolve(path.dirname(file), entry.fileName);
        const found = [
          base,
          base + '.ts',
          base + '.tsx',
          base + '.mjs',
          base + '.json',
          path.join(base, 'index.ts'),
        ].find(existsSync);
        if (!found) throw new Error('Unresolved local import in ' + file + ': ' + entry.fileName);
        const relative = path.relative(process.cwd(), found);
        if (!relative.startsWith('..') && !relative.endsWith('.json')) pending.push(relative);
      }
    }
    const paths = workflow.on[event].paths;
    const missing = (patterns: string[]) =>
      [...seen].filter((file) => !patterns.some((pattern) => path.matchesGlob(file, pattern)));
    expect(missing(paths)).toEqual([]);
    for (const [removed, target] of [
      ['scripts/content/markdown.ts', 'scripts/content/markdown.ts'],
      ['src/core/content/**', 'src/core/content/activeExerciseRuntime.ts'],
      ['src/core/persistence/canonicalJson.ts', 'src/core/persistence/canonicalJson.ts'],
      ['src/shared/lib/resolvePublicAsset.ts', 'src/shared/lib/resolvePublicAsset.ts'],
    ])
      expect(missing(paths.filter((item) => item !== removed))).toContain(target);
  },
);
