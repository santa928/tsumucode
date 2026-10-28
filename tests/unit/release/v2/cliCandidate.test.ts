// @vitest-environment node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { InventorySchema } from '../../../../scripts/release/v2/schema';
import { planRelease } from '../../../../scripts/release/v2/plan';
const exec = promisify(execFile),
  roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
describe('candidate command', () => {
  it('creates an immutable same-run identity only for the actual clean main source', async () => {
    const { runCli } = await import('../../../../scripts/release/v2/cli');
    const root = await mkdtemp(path.join(os.tmpdir(), 'release-cli-candidate-'));
    roots.push(root);
    const git = async (...args: string[]) =>
      (
        await exec('git', args, {
          cwd: root,
          encoding: 'utf8',
          env: {
            ...process.env,
            GIT_DIR: undefined,
            GIT_WORK_TREE: undefined,
            GIT_COMMON_DIR: undefined,
            GIT_INDEX_FILE: undefined,
          },
        })
      ).stdout.trim();
    await mkdir(path.join(root, '.github/workflows'), { recursive: true });
    await writeFile(path.join(root, '.github/workflows/pages.yml'), 'name: fixture\n');
    await writeFile(path.join(root, 'package-lock.json'), '{}');
    await writeFile(path.join(root, 'Dockerfile'), 'FROM fixed\n');
    await writeFile(path.join(root, '.gitignore'), 'dist/\n.release-*\n');
    await git('init', '-b', 'main');
    await git('add', '.');
    await git(
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '-m',
      'fixture',
    );
    const source = await git('rev-parse', 'HEAD');
    await mkdir(path.join(root, 'dist'));
    await writeFile(path.join(root, 'dist/index.html'), 'same bytes');
    const inventory = InventorySchema.parse({
      schemaVersion: 1,
      fingerprintVersion: 1,
      courses: [
        {
          id: 'topic',
          revision: '1',
          publicationStatus: 'published',
          runner: 'html-css',
          lessons: [
            {
              id: 'lesson',
              kind: 'standard',
              learnerDigest: 'a'.repeat(64),
              exerciseDigest: 'b'.repeat(64),
              navigationDigest: 'c'.repeat(64),
              persistenceDigest: 'd'.repeat(64),
              exercises: [],
            },
          ],
        },
      ],
    });
    const snapshot = path.join(root, '.release-snapshot.json');
    await writeFile(
      snapshot,
      JSON.stringify({ schemaVersion: 1, inventory, plan: planRelease(inventory) }),
    );
    const output = path.join(root, '.release-candidate.json');
    const args = [
      'candidate',
      '--root',
      root,
      '--snapshot',
      snapshot,
      '--artifact-id',
      '301',
      '--output',
      output,
    ];
    const context = {
      GITHUB_REPOSITORY: 'owner/site',
      GITHUB_RUN_ID: '101',
      GITHUB_JOB: 'build',
      GITHUB_RUN_ATTEMPT: '1',
      GITHUB_SHA: source,
      GITHUB_REF: 'refs/heads/main',
      GITHUB_EVENT_NAME: 'workflow_dispatch',
      BASE_PATH: '/site/',
    };
    await runCli(args, context);
    const result = JSON.parse(await readFile(output, 'utf8')) as {
      recipe: { sourceCommit: string };
      artifactId: string;
    };
    expect(result.recipe.sourceCommit).toBe(source);
    expect(result.artifactId).toBe('301');
    await expect(runCli(args, context)).rejects.toThrow();
    await expect(
      runCli([...args.slice(0, -1), path.join(root, '.release-denied.json')], {
        ...context,
        GITHUB_REF: 'refs/heads/topic',
      }),
    ).rejects.toThrow();
  });
});
