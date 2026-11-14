// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { parse } from 'yaml';
import { testCommand } from '../../../../scripts/release/v2/executionPlan';
type Step = {
  name?: string;
  if?: string;
  run?: string;
  uses?: string;
  with?: Record<string, unknown>;
};
type Job = {
  if?: string;
  uses?: string;
  needs?: string[];
  permissions?: Record<string, string>;
  'timeout-minutes'?: number;
  steps?: Step[];
  with?: Record<string, string>;
};
type Workflow = { on?: Record<string, { paths?: string[] }>; jobs: Record<string, Job> };
async function workflows() {
  const files = [
    '.github/workflows/local-runtime.yml',
    '.github/workflows/python-fixtures.yml',
    '.github/workflows/release-v2-checks.yml',
  ];
  return Promise.all(files.map(async (file) => parse(await readFile(file, 'utf8')) as Workflow));
}
it('fixes a separate same-run Python producer in PR and the qualification direct needs', async () => {
  const [local, fixture, release] = await workflows();
  for (const event of ['push', 'pull_request'])
    expect(local.on?.[event]?.paths).toContain('.github/workflows/python-fixtures.yml');
  const ordinary = local.jobs['python_fixtures']!;
  expect(ordinary.if).toBe("inputs.candidate_artifact_id == ''");
  expect(ordinary.uses).toBe('./.github/workflows/python-fixtures.yml');
  const producer = release.jobs['python_fixtures']!;
  expect(producer.uses).toBe(ordinary.uses);
  expect(producer.permissions).toEqual({ contents: 'read' });
  expect(producer.with).toEqual({
    candidate_artifact_id: '${{ inputs.candidate_artifact_id }}',
    metadata_artifact_id: '${{ inputs.metadata_artifact_id }}',
  });
  const needs = release.jobs['aggregate']!.needs!;
  expect(needs).toContain('python_fixtures');
  const hasProducer = (values: string[]) => values.includes('python_fixtures');
  expect(hasProducer(needs)).toBe(true);
  expect(hasProducer(needs.filter((id) => id !== 'python_fixtures'))).toBe(false);
  expect(Object.keys(fixture.jobs)).toEqual(['python_fixtures']);
  expect(fixture.jobs['python_fixtures']!['timeout-minutes']).toBe(60);
});
it('keeps fixed non-overlapping Python executions, candidate checks, and receipt binding', async () => {
  const [local, fixture] = await workflows();
  const steps = fixture.jobs['python_fixtures']!.steps!;
  const usedActions = steps.flatMap((item) => (item.uses ? [item.uses] : []));
  expect(usedActions).toEqual([
    'actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0',
    'actions/download-artifact@634f93cb2916e3fdff6788551b99b062d0335ce0',
    'actions/download-artifact@634f93cb2916e3fdff6788551b99b062d0335ce0',
    'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',
    'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',
  ]);
  const step = (name: string) => steps.find((item) => item.name === name)!;
  expect(step('Reject partial candidate input').run).toBe('exit 1');
  expect(step('Download same-run public candidate').with?.['artifact-ids']).toBe(
    '${{ inputs.candidate_artifact_id }}',
  );
  expect(step('Download same-run frozen obligations').with?.['artifact-ids']).toBe(
    '${{ inputs.metadata_artifact_id }}',
  );
  const preflight = step('Build and check baked Native imports').run!;
  expect(preflight).toContain('--network none');
  expect(preflight).toContain('scripts/local/native-import-preflight.mjs');
  expect(preflight).not.toMatch(/--mount|--volume|\s-v\s/u);
  expect(step('Verify baked contracts against frozen compiler inventory').run).toContain(
    'verify-native-catalog',
  );
  const execute = step('Execute fixed Python fixture suite').run!;
  expect(execute).toContain('fixture_args=(python-published-fixtures.spec.ts)');
  expect(execute).toContain('python-browser-acceptance.mjs "${fixture_args[@]}"');
  expect(execute).toContain('--cpus 2 --memory 1g --pids-limit 256');
  expect(execute).toContain("fixture_args+=(--grep-invert '@visual-extended')");
  const bind = step('Bind Python fixture observations to same-run candidate').run!;
  expect(bind).toContain('-e GITHUB_JOB');
  expect(bind).toContain('--suite native-python-fixtures');
  expect(step('Preserve same-run Python fixture receipt').with?.['if-no-files-found']).toBe(
    'error',
  );
  const original = local.jobs['boundary']!.steps!.find(
    (item) => item.name === 'Verify fixed CPython execution, constraints and recovery',
  )!.run!;
  const excluded = original.match(/python_exclude='([^']+)'/)?.[1] ?? '';
  expect(excluded).toBe('python-published-fixtures\\.spec\\.ts');
  expect(original).toContain(
    'if [ -n "$TSUMUCODE_RELEASE_CANDIDATE" ]; then python_exclude="@visual-extended|$python_exclude"; fi',
  );
  expect(new RegExp(excluded).test('python-oop.spec.ts example @visual-extended')).toBe(false);
  expect(
    new RegExp('@visual-extended|' + excluded).test('python-oop.spec.ts example @visual-extended'),
  ).toBe(true);

  expect(testCommand('native-python', true)).toContain(
    '@visual-extended|python-published-fixtures\\.spec\\.ts',
  );
  expect(testCommand('native-python-fixtures', true)).toContain(
    'python-published-fixtures.spec.ts',
  );
});
