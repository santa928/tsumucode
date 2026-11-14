// @vitest-environment node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

type Step = { id?: string; name?: string; shell: string; run: string; env?: Record<string, string> };
type Job = { if?: string; needs?: string[]; 'runs-on': string; 'timeout-minutes': number; outputs?: Record<string, string>; steps: Step[] };
type Workflow = { name: string; on: unknown; permissions: Record<string, string>; jobs: Record<'producer' | 'consumer', Job> };
const workflow = parse(readFileSync('.github/workflows/direct-needs-diagnostic.yml', 'utf8')) as Workflow;
const script = (run: string) => {
  const match = /^node <<'NODE'\n([\s\S]*)\nNODE\n$/u.exec(run);
  if (!match) throw Error('Unexpected diagnostic command');
  return match[1]! + '\n';
};
const sha256 = (input: string) => createHash('sha256').update(input).digest('hex');
const producerScript = script(workflow.jobs.producer.steps[0]!.run);
const consumerScript = script(workflow.jobs.consumer.steps[0]!.run);

function assertTopology(input: typeof workflow) {
  expect(Object.keys(input).sort()).toEqual(['jobs', 'name', 'on', 'permissions']);
  expect(input.name).toBe('Direct needs diagnostic');
  expect(input.on).toEqual({ workflow_dispatch: null, pull_request: { branches: ['main'], paths: ['.github/workflows/direct-needs-diagnostic.yml', 'tests/unit/workflows/directNeedsDiagnosticWorkflow.test.ts'] } });
  expect(input.permissions).toEqual({});
  expect(Object.keys(input.jobs).sort()).toEqual(['consumer', 'producer']);
  const { producer, consumer } = input.jobs;
  expect(producer.if).toBe("${{ github.repository == 'santa928/tsumucode' && ((github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/codex/direct-needs-probe') || (github.event_name == 'pull_request' && github.base_ref == 'main' && github.head_ref == 'codex/direct-needs-probe' && github.event.pull_request.head.repo.full_name == github.repository)) }}");
  expect(producer['runs-on']).toBe('ubuntu-24.04');
  expect(producer['timeout-minutes']).toBe(2);
  expect(producer.outputs).toEqual({ run_id: '${{ steps.emit.outputs.run_id }}', attempt: '${{ steps.emit.outputs.attempt }}', source: '${{ steps.emit.outputs.source }}', nonce: '${{ steps.emit.outputs.nonce }}' });
  expect(producer.steps).toHaveLength(1);
  expect(Object.keys(producer.steps[0]!).sort()).toEqual(['id', 'run', 'shell']);
  expect(producer.steps[0]!.id).toBe('emit');
  expect(producer.steps[0]!.shell).toBe('bash');
  expect(sha256(script(producer.steps[0]!.run))).toBe('fcc2d6d3b1a490e6c5af5931db712d6c5c61edfbf262cb0ee5abbf1c318c8574');
  expect(consumer.needs).toEqual(['producer']);
  expect(consumer.if).toBe("${{ needs.producer.result == 'success' }}");
  expect(consumer['runs-on']).toBe('ubuntu-24.04');
  expect(consumer['timeout-minutes']).toBe(2);
  expect(consumer.steps).toHaveLength(1);
  expect(Object.keys(consumer.steps[0]!).sort()).toEqual(['env', 'name', 'run', 'shell']);
  expect(consumer.steps[0]!.env).toEqual({ DIRECT_NEEDS_JSON: '${{ toJSON(needs.producer) }}' });
  expect(consumer.steps[0]!.shell).toBe('bash');
  expect(sha256(script(consumer.steps[0]!.run))).toBe('6cc3961d306e3da04e72b673cb0aa96fd5c86e3599b280825076d19a7a744cb8');
  expect(Object.keys(producer).sort()).toEqual(['if', 'outputs', 'runs-on', 'steps', 'timeout-minutes']);
  expect(Object.keys(consumer).sort()).toEqual(['if', 'needs', 'runs-on', 'steps', 'timeout-minutes']);
}

const base = {
  GITHUB_REPOSITORY: 'santa928/tsumucode', GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_REF: 'refs/heads/codex/direct-needs-probe',
  GITHUB_WORKFLOW_REF: 'santa928/tsumucode/.github/workflows/direct-needs-diagnostic.yml@refs/heads/codex/direct-needs-probe',
  GITHUB_SHA: 'a'.repeat(40), GITHUB_WORKFLOW_SHA: 'a'.repeat(40), GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '2',
};
const good = { result: 'success', outputs: { run_id: '123', attempt: '2', source: 'a'.repeat(40), nonce: 'b'.repeat(32) } };
const execute = (needs: unknown, overrides: Record<string, string> = {}) =>
  execFileSync(process.execPath, ['-e', consumerScript], {
    env: { ...base, ...overrides, DIRECT_NEEDS_JSON: typeof needs === 'string' ? needs : JSON.stringify(needs) },
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 3000,
  });

describe('unconnected direct-needs diagnostic', () => {
  it('pins the entire workflow topology, read-only permissions and both inline programs', () => {
    assertTopology(workflow);
    expect(producerScript).toContain("randomBytes(16).toString('hex')");
  });
  it('rejects changed edge, permissions, hidden step and program', () => {
    const mutations: ((value: typeof workflow) => void)[] = [
      value => { value.jobs.consumer.needs = ['sibling']; },
      value => { value.permissions.actions = 'write'; },
      value => { value.jobs.consumer.steps.push({ run: 'true', shell: 'bash' }); },
      value => { value.jobs.producer.steps[0]!.run += 'echo changed\n'; },
    ];
    for (const change of mutations) {
      const altered = structuredClone(workflow);
      change(altered);
      expect(() => assertTopology(altered)).toThrow();
    }
  });
  it('accepts the expected structured output', () => {
    expect(execute(good)).toBe('Direct-needs diagnostic passed\n');
  });
  it('accepts the expected synthetic pull request merge context', () => {
    const ref = 'refs/pull/42/merge';
    const context = { GITHUB_EVENT_NAME: 'pull_request', GITHUB_REF: ref,
      GITHUB_BASE_REF: 'main', GITHUB_HEAD_REF: 'codex/direct-needs-probe',
      GITHUB_WORKFLOW_REF: `santa928/tsumucode/.github/workflows/direct-needs-diagnostic.yml@${ref}` };
    expect(execute(good, context)).toBe('Direct-needs diagnostic passed\n');
    expect(() => execute(good, { ...context, GITHUB_HEAD_REF: 'untrusted' })).toThrow();
    expect(() => execute(good, { ...context, GITHUB_BASE_REF: 'other' })).toThrow();
  });
  it.each([
    { ...good, result: 'failure' }, { ...good, outputs: { ...good.outputs, run_id: '124' } },
    { ...good, outputs: { ...good.outputs, attempt: '1' } }, { ...good, outputs: { ...good.outputs, source: 'c'.repeat(40) } },
    { ...good, outputs: { ...good.outputs, nonce: '' } }, { ...good, outputs: { ...good.outputs, extra: 'x' } },
    { result: 'success', outputs: {} }, 'not-json', 'x'.repeat(4097),
  ])('rejects invalid needs input %#', invalid => { expect(() => execute(invalid)).toThrow(); });
  it('rejects changed caller identity and workflow SHA', () => {
    for (const overrides of [{ GITHUB_REF: 'refs/heads/main' }, { GITHUB_WORKFLOW_SHA: 'd'.repeat(40) }, { GITHUB_EVENT_NAME: 'push' }]) {
      expect(() => execute(good, overrides)).toThrow();
    }
  });
  it('does not authenticate a fabricated same-context output by shape alone', () => {
    expect(execute({ ...good, outputs: { ...good.outputs, nonce: 'c'.repeat(32) } })).toBe('Direct-needs diagnostic passed\n');
  });
});
