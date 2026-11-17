// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { parseQualificationNeeds } from '../../../../scripts/release/v2/qualificationNeeds';

const jobs = [
  'unit',
  'boundary',
  'python_fixtures',
  'browser',
  'public_boundary',
  'performance',
] as const;
const needs = () =>
  Object.fromEntries(jobs.map((job) => [job, { result: 'success', outputs: {} }]));
const success = Object.fromEntries(jobs.map((job) => [job, 'success']));
const reject = (raw: unknown) => {
  try {
    parseQualificationNeeds(raw);
    expect.fail('Expected needs rejection');
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('Qualification needs invalid');
    expect((error as Error).cause).toBeUndefined();
    expect(String((error as Error).stack)).not.toContain('synthetic-private-marker');
  }
};

it('accepts the fixed six successful direct needs, independent of order', () => {
  const reversed = Object.fromEntries(Object.entries(needs()).reverse());
  expect(parseQualificationNeeds(JSON.stringify(reversed))).toEqual(success);
  expect(
    parseQualificationNeeds(
      JSON.stringify(Object.fromEntries(jobs.map((job) => [job, { result: 'success' }]))),
    ),
  ).toEqual(success);
});
it.each(jobs)('rejects missing direct need %s', (job) => {
  const input = Object.fromEntries(Object.entries(needs()).filter(([key]) => key !== job));
  reject(JSON.stringify(input));
});
it.each(
  jobs.flatMap((job) => ['failure', 'cancelled', 'skipped'].map((result) => ({ job, result }))),
)('rejects $job with status $result', ({ job, result }) => {
  const input = needs();
  input[job] = { result, outputs: {} };
  reject(JSON.stringify(input));
});
it('rejects unknown jobs, fields and nonempty outputs', () => {
  reject(JSON.stringify({ ...needs(), 'synthetic-private-marker': { result: 'success' } }));
  const field = {
    ...needs(),
    unit: { result: 'success', outputs: {}, 'synthetic-private-marker': 'value' },
  };
  reject(JSON.stringify(field));
  const output = needs();
  output.unit = { result: 'success', outputs: { 'synthetic-private-marker': 'value' } };
  reject(JSON.stringify(output));
});
it('rejects duplicate literal, escaped and nested keys', () => {
  const tail = JSON.stringify(needs()).slice(1);
  reject('{"unit":{"result":"failure"},' + tail);
  reject('{"u\\u006eit":{"result":"failure"},' + tail);
  reject(
    JSON.stringify(needs()).replace('"result":"success"', '"result":"failure","result":"success"'),
  );
});
it('rejects invalid JSON, wrong shapes, non-string and oversize inputs', () => {
  for (const value of ['{bad', 'null', '[]', ' '.repeat(64 * 1024 + 1), null, undefined])
    reject(value);
});

it('matches the actual qualification workflow direct-needs set', async () => {
  const document = parseYaml(await readFile('.github/workflows/release-v2-checks.yml', 'utf8')) as {
    jobs: { aggregate: { needs: string[] } };
  };
  expect([...document.jobs.aggregate.needs].sort()).toEqual([...jobs].sort());
});
