// @vitest-environment node
/** PR head/baseの同一性と検証対象を workflow の実データから確認する。 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

interface Step {
  readonly name?: string;
  readonly uses?: string;
  readonly if?: string;
  readonly run?: string;
  readonly 'continue-on-error'?: boolean;
  readonly with?: Readonly<Record<string, unknown>>;
}
interface Workflow {
  readonly on: {
    readonly pull_request: {
      readonly branches?: readonly string[];
      readonly types?: readonly string[];
      readonly paths?: readonly string[];
    };
    readonly push?: { readonly branches?: readonly string[]; readonly paths?: readonly string[] };
  };
  readonly jobs: Readonly<
    Record<
      string,
      {
        readonly if?: string;
        readonly permissions?: Readonly<Record<string, string>>;
        readonly 'continue-on-error'?: boolean;
        readonly env?: Readonly<Record<string, string>>;
        readonly steps?: readonly Step[];
      }
    >
  >;
}

function workflow(name: string): Workflow {
  return parse(readFileSync(`.github/workflows/${name}.yml`, 'utf8')) as Workflow;
}

describe('Draft PRの固定検証', () => {
  it.each(['pages', 'local-runtime', 'python-input-focus', 'tailwind-project'])(
    '%sはbase branchによらず既存の対象変更を検証する',
    (name) => {
      expect(workflow(name).on.pull_request.branches).toBeUndefined();
      expect(workflow(name).on.pull_request.types).toEqual([
        'opened',
        'reopened',
        'synchronize',
        'edited',
        'ready_for_review',
      ]);
      if (name !== 'pages') {
        expect(workflow(name).on.pull_request.paths).toBeDefined();
      }
    },
  );

  it('head・baseを親とする仮mergeで既存pre-push全工程を通常の全件CIと別に実行する', () => {
    const jobs = workflow('pages').jobs;
    const job = jobs.pr_premerge!;
    expect(job.if).toBe("github.event_name == 'pull_request'");
    expect(job.permissions).toEqual({ contents: 'read' });
    expect(job.env?.PR_HEAD_SHA).toBe('${{ github.event.pull_request.head.sha }}');
    expect(job.env?.PR_BASE_SHA).toBe('${{ github.event.pull_request.base.sha }}');
    expect(job.env?.PR_MERGE_SHA).toBe('${{ github.sha }}');
    expect(job['continue-on-error']).not.toBe(true);
    const steps = job.steps ?? [];
    expect(steps).toHaveLength(5);
    for (const step of steps) {
      expect(step.if).toBeUndefined();
      expect(step['continue-on-error']).not.toBe(true);
    }
    const checkout = steps.find((step) => step.uses?.startsWith('actions/checkout@'));
    expect(checkout?.with).toEqual({
      ref: '${{ github.sha }}',
      'fetch-depth': 0,
      'persist-credentials': false,
    });
    const identity = steps.find((step) => step.name === 'Bind PR head and base');
    expect(identity?.run).toContain('git rev-parse HEAD');
    expect(identity?.run).toContain('git rev-parse HEAD^1');
    expect(identity?.run).toContain('git rev-parse HEAD^2');
    expect(identity?.run).toContain("git rev-parse 'HEAD^{tree}'");
    expect(identity?.run).toContain('git rev-parse "${PR_HEAD_SHA}^{tree}"');
    expect(identity?.run).toContain('git merge-base --is-ancestor');
    const node = steps.find((step) => step.name === 'Verify the required Node version');
    expect(node?.run).toContain('24.18.0');
    expect(node?.if).toBeUndefined();
    const prepush = steps.find((step) => step.name === 'Run the existing pre-push checks');
    expect(prepush?.run).toContain('npm run check:prepush -- "$PR_BASE_SHA"');
    expect(prepush?.['continue-on-error']).not.toBe(true);
    expect(prepush?.if).toBeUndefined();
    expect((jobs.fast?.steps ?? []).find((step) => step.name === 'Fast quality')?.run).toContain(
      'npm run "$CHECK_SCRIPT"',
    );
  });
});

describe('仮mergeの親照合 shell', () => {
  it('一致する2親を受け入れ、base・head・merge・SHAの不一致を拒否する', () => {
    const identity = workflow('pages').jobs.pr_premerge?.steps?.find(
      (step) => step.name === 'Bind PR head and base',
    )?.run;
    expect(identity).toBeDefined();
    const dir = mkdtempSync(join(tmpdir(), 'draft-pr-identity-'));
    const env = {
      ...process.env,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_AUTHOR_NAME: 'test',
      GIT_AUTHOR_EMAIL: 'test@example.invalid',
      GIT_COMMITTER_NAME: 'test',
      GIT_COMMITTER_EMAIL: 'test@example.invalid',
    };
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd: dir, env, encoding: 'utf8' }).trim();
    try {
      git('init', '-q');
      writeFileSync(join(dir, 'base'), 'base');
      git('add', 'base');
      git('commit', '-qm', 'base');
      const base = git('rev-parse', 'HEAD');
      writeFileSync(join(dir, 'head'), 'head');
      git('add', 'head');
      git('commit', '-qm', 'head');
      const head = git('rev-parse', 'HEAD');
      const tree = git('rev-parse', 'HEAD^{tree}');
      const merge = git('commit-tree', tree, '-p', base, '-p', head, '-m', 'merge');
      git('checkout', '-q', '--detach', merge);
      const verify = (actualBase: string, actualHead: string, actualMerge: string) =>
        spawnSync('sh', ['-c', identity!], {
          cwd: dir,
          env: {
            ...env,
            PR_BASE_SHA: actualBase,
            PR_HEAD_SHA: actualHead,
            PR_MERGE_SHA: actualMerge,
            GITHUB_STEP_SUMMARY: join(dir, 'summary'),
          },
        }).status;
      expect(verify(base, head, merge)).toBe(0);
      expect(verify(head, head, merge)).not.toBe(0);
      expect(verify(base, base, merge)).not.toBe(0);
      expect(verify(base, head, head)).not.toBe(0);
      expect(verify('z'.repeat(40), head, merge)).not.toBe(0);
      expect(verify(base.slice(1), head, merge)).not.toBe(0);
      const otherTree = git('rev-parse', `${base}^{tree}`);
      const differentTreeMerge = git(
        'commit-tree',
        otherTree,
        '-p',
        base,
        '-p',
        head,
        '-m',
        'different tree',
      );
      git('checkout', '-q', '--detach', differentTreeMerge);
      expect(verify(base, head, differentTreeMerge)).not.toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
