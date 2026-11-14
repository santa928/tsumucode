// @vitest-environment node
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { parse } from 'yaml';
import { assertChromiumCoverage, testCommand } from '../../../../scripts/release/v2/executionPlan';
import { parseTestList } from '../../../../scripts/release/v2/testManifest';
const exec = promisify(execFile);
it('actually lists all native tests as a disjoint complete union in PR and qualification', async () => {
  const cli = 'node_modules/@playwright/test/cli.js';
  const list = async (args: string[], suite: string, producer: string) => {
    const result = await exec(process.execPath, [cli, ...args], {
      timeout: 30_000,
      maxBuffer: 16 * 1024 * 1024,
    });
    return parseTestList(JSON.parse(result.stdout) as unknown, suite, producer, '');
  };
  const workflow = parse(await readFile('.github/workflows/local-runtime.yml', 'utf8')) as {
    jobs: { boundary: { steps: { name?: string; run?: string }[] } };
  };
  const body = workflow.jobs.boundary.steps.find(
    (step) => step.name === 'Verify fixed CPython execution, constraints and recovery',
  )!.run!;
  const oldPrPattern = body.match(/python_exclude='([^']+)'/)?.[1] ?? '';
  expect(oldPrPattern).toBeTruthy();
  const oldQualification = testCommand('native-python', true);
  expect(oldQualification[oldQualification.indexOf('--grep-invert') + 1]).toBe(
    '@visual-extended|' + oldPrPattern,
  );
  const common = ['test', '--config=playwright.python-local.config.ts'];
  const listing = ['--list', '--reporter=json'];
  const fixture = 'python-published-fixtures.spec.ts';
  const compare = async (fullArgs: string[], oldArgs: string[], newArgs: string[]) => {
    const full = await list(fullArgs, 'native-full', 'boundary');
    const old = await list(oldArgs, 'native-python', 'boundary');
    const added = await list(newArgs, 'native-python-fixtures', 'python_fixtures');
    const allKeys = full.tests.map((row) => row.key);
    const oldKeys = old.tests.map((row) => row.key);
    const newKeys = added.tests.map((row) => row.key);
    expect(oldKeys.length).toBeGreaterThan(0);
    expect(newKeys.length).toBeGreaterThan(0);
    expect(() => {
      assertChromiumCoverage(allKeys, [oldKeys, newKeys]);
    }).not.toThrow();
    expect(() => {
      assertChromiumCoverage(allKeys, [oldKeys.slice(1), newKeys]);
    }).toThrow();
    expect(() => {
      assertChromiumCoverage(allKeys, [oldKeys, [...newKeys, oldKeys[0]!]]);
    }).toThrow();
    const newExercises = new Set(added.tests.flatMap((row) => row.exerciseIds));
    for (const row of old.tests)
      for (const exercise of row.exerciseIds) expect(newExercises.has(exercise)).toBe(false);
  };
  await compare(
    [...common, ...listing],
    [...common, '--grep-invert', oldPrPattern, ...listing],
    [...common, fixture, ...listing],
  );
  await compare(
    [...common, '--grep-invert', '@visual-extended', ...listing],
    oldQualification,
    testCommand('native-python-fixtures', true),
  );
}, 120_000);
