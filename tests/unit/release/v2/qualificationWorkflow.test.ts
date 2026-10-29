// @vitest-environment node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { parse } from 'yaml';
import { hashBytes } from '../../../../scripts/release/v2/identity';
const exec = promisify(execFile);
it('exports the exact aggregate artifact and raw qualification byte pin without introducing a new privilege', async () => {
  const workflow = parse(await readFile('.github/workflows/release-v2-checks.yml', 'utf8')) as {
    on: { workflow_call: { outputs: Record<string, { value: string }> } };
    jobs: {
      aggregate: {
        permissions: Record<string, string>;
        outputs: Record<string, string>;
        steps: { id?: string; name?: string; run?: string; uses?: string }[];
      };
    };
  };
  const aggregate = workflow.jobs.aggregate;
  expect(aggregate.permissions).toEqual({ contents: 'read' });
  expect(workflow.on.workflow_call.outputs.qualification_artifact_id!.value).toBe(
    '${{ jobs.aggregate.outputs.qualification_artifact_id }}',
  );
  expect(workflow.on.workflow_call.outputs.qualification_sha256!.value).toBe(
    '${{ jobs.aggregate.outputs.qualification_sha256 }}',
  );
  expect(aggregate.outputs.qualification_artifact_id).toBe(
    "${{ steps.qualification_artifact.outputs['artifact-id'] }}",
  );
  expect(aggregate.outputs.qualification_sha256).toBe(
    '${{ steps.qualification_digest.outputs.sha256 }}',
  );
  const digestIndex = aggregate.steps.findIndex((step) => step.id === 'qualification_digest');
  expect(digestIndex).toBeGreaterThan(
    aggregate.steps.findIndex(
      (step) => step.name === 'Re-read actual main and deployed parent before admission',
    ),
  );
  expect(aggregate.steps[digestIndex + 1]).toMatchObject({
    id: 'qualification_artifact',
    uses: 'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',
  });
  const root = await mkdtemp(path.join(os.tmpdir(), 'qualification-pin-'));
  try {
    await mkdir(path.join(root, '.release-v2'));
    const bytes = Buffer.from('{  "status": "synthetic-qualified-fixture" }\n');
    await writeFile(path.join(root, '.release-v2/qualification.json'), bytes);
    const output = path.join(root, 'outputs');
    await exec('bash', ['-euc', aggregate.steps[digestIndex]!.run!], {
      cwd: root,
      env: { ...process.env, GITHUB_OUTPUT: output },
    });
    expect(await readFile(output, 'utf8')).toBe('sha256=' + hashBytes(bytes) + '\n');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
