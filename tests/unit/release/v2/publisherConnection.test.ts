// @vitest-environment node
import { readFile, mkdtemp, rm, access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { runInNewContext } from 'node:vm';
import path from 'node:path';
import os from 'node:os';
import { expect, it } from 'vitest';
import { parse } from 'yaml';

const exec = promisify(execFile);
interface Job {
  if?: string;
  needs?: string[];
  uses?: string;
  permissions?: Record<string, string>;
  with?: Record<string, string>;
  steps?: { id?: string; name?: string; if?: string; run?: string }[];
}
async function workflow() {
  return parse(await readFile('.github/workflows/pages.yml', 'utf8')) as {
    jobs: Record<string, Job>;
  };
}

// These routing guards deliberately use only the shared boolean/equality subset.
function permits(condition: string | undefined, context: unknown): boolean {
  expect(condition).toBeTypeOf('string');
  const expression = condition!.replace(/^\$\{\{\s*|\s*\}\}$/gu, '');
  return runInNewContext(expression, context as object, { timeout: 100 }) === true;
}

it.each([
  ['push', 'refs/heads/main', false, false, 'candidate', false, false],
  ['pull_request', 'refs/pull/1/merge', false, false, 'candidate', false, false],
  ['workflow_dispatch', 'refs/heads/main', false, false, 'candidate', false, false],
  ['workflow_dispatch', 'refs/heads/main', true, false, 'candidate', true, false],
  ['workflow_dispatch', 'refs/heads/main', false, true, 'candidate', true, true],
  ['workflow_dispatch', 'refs/heads/main', true, true, 'candidate', false, false],
  ['workflow_dispatch', 'refs/heads/topic', true, false, 'candidate', false, false],
  ['workflow_dispatch', 'refs/heads/topic', false, true, 'candidate', false, false],
  ['workflow_dispatch', 'refs/heads/main', false, true, 'beta', false, false],
  ['workflow_dispatch', 'refs/heads/main', false, true, 'rollback', false, false],
] as const)(
  'routes %s %s migration=%s deploy=%s mode=%s without an implicit publication',
  async (event, ref, migration, deploy, mode, build, publish) => {
    const { jobs } = await workflow();
    const context = {
      github: { event_name: event, ref },
      inputs: { migration_checks: migration, deploy, release_mode: mode },
    };
    expect(permits(jobs.build!.if, context)).toBe(build);
    expect(permits(jobs.publish!.if, context)).toBe(publish);
    for (const name of ['quality', 'deploy', 'report', 'record_release'])
      expect(permits(jobs[name]!.if, context)).toBe(false);
  },
);

it('passes only exact same-run output IDs and qualification bytes to the existing fixed publisher', async () => {
  const { jobs } = await workflow();
  const publish = jobs.publish!;
  expect(publish.uses).toBe('./.github/workflows/release-v2-publish.yml');
  expect(publish.needs).toEqual(['build', 'qualification']);
  expect(publish.if).not.toMatch(/always\(|failure\(|cancelled\(/u);
  expect(publish.steps).toBeUndefined();
  expect(publish.with).toEqual({
    candidate_artifact_id: '${{ needs.build.outputs.candidate_artifact_id }}',
    metadata_artifact_id: '${{ needs.build.outputs.metadata_artifact_id }}',
    qualification_artifact_id: '${{ needs.qualification.outputs.qualification_artifact_id }}',
    qualification_sha256: '${{ needs.qualification.outputs.qualification_sha256 }}',
  });
  // The caller delegates existing capabilities; the callee keeps Source/read and fixed/write jobs apart.
  expect(publish.permissions).toEqual({ contents: 'write', pages: 'write', 'id-token': 'write' });
  const callee = parse(await readFile('.github/workflows/release-v2-publish.yml', 'utf8')) as {
    jobs: Record<string, Job>;
  };
  expect(callee.jobs.deploy!.permissions).toEqual({
    contents: 'read',
    pages: 'write',
    'id-token': 'write',
  });
  expect(callee.jobs.report!.permissions).toEqual({ contents: 'read' });
  expect(callee.jobs.record!.permissions).toEqual({ contents: 'write' });
});

it.each([
  ['candidate', '', true],
  ['candidate', 'a'.repeat(40), true],
  ['candidate', 'b'.repeat(40), false],
  ['beta', '', false],
  ['rollback', '', false],
  ['candidate', '$(touch SOURCE_EXECUTED)', false],
] as const)(
  'checks actual dispatch source guard mode=%s source=%s',
  async (mode, source, accepted) => {
    const { jobs } = await workflow();
    const guard = jobs.resolve!.steps!.find(
      (step) => step.name === 'Reject unsupported publication inputs',
    );
    expect(guard?.run).toBeTypeOf('string');
    const root = await mkdtemp(path.join(os.tmpdir(), 'publisher-entry-'));
    try {
      const result = exec('bash', ['-euc', guard!.run!], {
        cwd: root,
        timeout: 10000,
        env: { ...process.env, RELEASE_MODE: mode, SOURCE_SHA: source, EVENT_SHA: 'a'.repeat(40) },
      });
      if (accepted) await expect(result).resolves.toBeDefined();
      else await expect(result).rejects.toThrow();
      await expect(access(path.join(root, 'SOURCE_EXECUTED'))).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
