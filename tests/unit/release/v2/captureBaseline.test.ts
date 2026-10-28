// @vitest-environment node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, cp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { compileContent } from '../../../../scripts/content/compile';
const exec = promisify(execFile),
  roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
describe('live baseline capture protocol', () => {
  it('reconstructs original source and checks public bytes instead of trusting current candidate flags', async () => {
    const { captureBaseline } = await import('../../../../scripts/release/v2/captureBaseline');
    const root = await mkdtemp(path.join(os.tmpdir(), 'release-capture-'));
    roots.push(root);
    await mkdir(path.join(root, 'content'));
    await cp('content/html-css', path.join(root, 'content/html-css'), { recursive: true });
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
    await git('init', '-b', 'main');
    await git('add', 'content');
    await git(
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '-m',
      'original content',
    );
    const source = await git('rev-parse', 'HEAD');
    await writeFile(path.join(root, 'workflow-marker'), 'original workflow');
    await git('add', 'workflow-marker');
    await git(
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '-m',
      'workflow',
    );
    const head = await git('rev-parse', 'HEAD');
    await git(
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'tag',
      '-a',
      'tsumucode-release-fixture',
      '-m',
      `source=${source} head=${head} dist=${'a'.repeat(64)} workflow=101-1 page_url=https://owner.github.io/site/`,
      source,
    );
    const output = path.join(root, 'old-public/generated/content');
    await compileContent({
      sourceRoot: path.join(root, 'content'),
      outputRoot: output,
      publication: 'authoring',
      checkOnly: false,
    });
    // Unreleased working content must not replace the original deployed baseline.
    const courseFile = path.join(root, 'content/html-css/course.yaml');
    await writeFile(
      courseFile,
      (await readFile(courseFile, 'utf8')).replace(
        'publicationStatus: published',
        'publicationStatus: draft',
      ),
    );
    const result = await captureBaseline({
      root,
      repository: 'owner/site',
      siteUrl: 'https://owner.github.io/site/',
      readJson: async (url) =>
        url.endsWith('/statuses')
          ? [
              {
                state: 'success',
                environment_url: 'https://owner.github.io/site/',
                log_url: 'https://github.com/owner/site/actions/runs/101/job/201',
              },
            ]
          : [{ id: 501, sha: head, ref: 'main', environment: 'github-pages' }],
      readPublicFile: async (relative) => readFile(path.join(output, relative)),
    });
    expect(result.baseline.sourceCommit).toBe(source);
    expect(result.proof.workflowHeadCommit).toBe(head);
    expect(result.baseline.inventory.courses[0]!.publicationStatus).toBe('published');
    expect(result.proof.publicFiles).toBeGreaterThan(1);
  }, 30000);
});
