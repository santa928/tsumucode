// @vitest-environment node
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const scripts = (
  JSON.parse(readFileSync('package.json', 'utf8')) as {
    scripts: Record<string, string>;
  }
).scripts;

interface Step {
  id?: string;
  if?: string;
  'continue-on-error'?: boolean;
  env?: Record<string, string>;
  run?: string;
}

const workflow = parse(readFileSync('.github/workflows/pages.yml', 'utf8')) as {
  on: { pull_request: { branches?: string[]; paths?: string[]; 'paths-ignore'?: string[] } };
  jobs: Record<
    string,
    {
      if?: string;
      'continue-on-error'?: boolean;
      env?: Record<string, string>;
      outputs?: Record<string, string>;
      permissions?: Record<string, string>;
      steps: Step[];
    }
  >;
};

/** 重い工程だけを置き換え、実際のshell連鎖の順序・対象・exitを観測する。 */
function runScript(source: string, failure = '', environment: Record<string, string> = {}) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'pr-unit-parity-'));
  try {
    const trace = path.join(directory, 'trace');
    writeFileSync(trace, '');
    const stub =
      '#!/bin/sh\nprintf "%s\\n" "$*" >> "$TRACE"\n' +
      'if [ "$*" = "$FAIL_COMMAND" ]; then exit 43; fi\n';
    for (const name of ['npm', 'docker-compose.sh']) {
      writeFileSync(path.join(directory, name), stub);
      chmodSync(path.join(directory, name), 0o700);
    }
    const result = spawnSync('sh', ['-c', source], {
      encoding: 'utf8',
      env: {
        ...process.env,
        ...environment,
        PATH: directory + path.delimiter + (process.env['PATH'] ?? ''),
        TRACE: trace,
        FAIL_COMMAND: failure,
      },
    });
    return { ...result, calls: readFileSync(trace, 'utf8').trim().split('\n') };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe('PR CIと公開unitの範囲', () => {
  it.each([false, true])('全PRで必須の全件check:ciを呼び、失敗=%sを伝える', (failure) => {
    expect(workflow.on.pull_request).toEqual({
      types: ['opened', 'reopened', 'synchronize', 'edited'],
    });
    const fast = workflow.jobs.fast!;
    expect(runInNewContext(fast.if!, { github: { event_name: 'pull_request' }, inputs: {} })).toBe(
      true,
    );
    expect(fast['continue-on-error']).not.toBe(true);
    expect(fast.permissions).toEqual({ contents: 'read' });
    const step = fast.steps.find(
      (item) => item.run?.includes('npm run') && item.env?.TEST_BASE_SHA !== undefined,
    )!;
    expect(step.if).toBeUndefined();
    expect(step['continue-on-error']).not.toBe(true);
    expect(step.env?.CHECK_SCRIPT).toBe(
      "${{ github.event_name == 'pull_request' && 'check:ci' || 'check' }}",
    );
    expect(step.env?.TSUMUCODE_CI_SOURCE_SHA).toBe('${{ needs.resolve.outputs.checkout_sha }}');
    const command = 'run --rm -e BASE_PATH -e TEST_BASE_SHA -e TSUMUCODE_CI_SOURCE_SHA -e TSUMUCODE_CI_SOURCE_REQUIRED=1 app npm run check:ci';
    const result = runScript(
      step.run!.replace('./scripts/docker-compose.sh', 'docker-compose.sh'),
      failure ? command : '',
      {
        CHECK_SCRIPT: 'check:ci',
      },
    );
    expect(result.status, result.stderr).toBe(failure ? 43 : 0);
    expect(result.calls).toEqual([command]);
  });

  it('PR fastとpremergeへ同一event Sourceを渡して失敗を隠さない', () => {
    const resolve = workflow.jobs.resolve!;
    const binding = resolve.steps.find((step) => step.id === 'default_target')!;
    const alternate = resolve.steps.find((step) => step.id === 'target')!;
    expect(alternate.if).toBe('${{ false }}');
    expect(resolve.outputs?.checkout_sha).toBe(
      '${{ steps.target.outputs.checkout_sha || steps.default_target.outputs.checkout_sha }}',
    );
    expect(binding.env?.EVENT_SHA).toBe('${{ github.sha }}');
    expect(binding.if).toBeUndefined();
    expect(binding['continue-on-error']).not.toBe(true);
    const directory = mkdtempSync(path.join(os.tmpdir(), 'pr-event-binding-'));
    try {
      const output = path.join(directory, 'output');
      const result = spawnSync('sh', ['-c', binding.run!], {
        encoding: 'utf8',
        env: { ...process.env, EVENT_SHA: 'synthetic-event-sha', GITHUB_OUTPUT: output },
      });
      expect(result.status, result.stderr).toBe(0);
      expect(readFileSync(output, 'utf8')).toBe(
        'checkout_sha=synthetic-event-sha\nverified_source_commit=synthetic-event-sha\n',
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
    const premerge = workflow.jobs.pr_premerge!;
    expect(runInNewContext(premerge.if!, { github: { event_name: 'pull_request' } })).toBe(true);
    expect(premerge.env?.TSUMUCODE_CI_SOURCE_SHA).toBe('${{ github.sha }}');
    expect(premerge['continue-on-error']).not.toBe(true);
    const step = premerge.steps.find((item) => item.run?.includes('npm run check:prepush'))!;
    expect(step.if).toBeUndefined();
    expect(step['continue-on-error']).not.toBe(true);
    expect(step.env?.CHECKED_BASE_SHA).toBe('${{ steps.pr_binding.outputs.checked_base_sha }}');
    const command = 'run --rm -e BASE_PATH -e TSUMUCODE_CI_SOURCE_SHA -e TSUMUCODE_CI_SOURCE_REQUIRED=1 app npm run check:prepush -- synthetic-base';
    const environment = { CHECKED_BASE_SHA: 'synthetic-base' };
    const passing = runScript(step.run!.replace('./scripts/docker-compose.sh', 'docker-compose.sh'), '', environment);
    const failing = runScript(step.run!.replace('./scripts/docker-compose.sh', 'docker-compose.sh'), command, environment);
    expect(passing.status, passing.stderr).toBe(0);
    expect(passing.calls).toEqual([command]);
    expect(failing.status, failing.stderr).toBe(43);
  });

  it.each(['', 'run lint', 'run test:run'])('重複実行せず%sの失敗を後段へ伝える', (failure) => {
    expect(scripts['check:ci']).toBeDefined();
    const result = runScript(scripts['check:ci']!, failure);
    const commands = [
      'run content:compile',
      'run lint',
      'run test:run',
      'run build:app',
      'run smoke:learning-chunks',
    ];
    expect(result.status, result.stderr).toBe(failure ? 43 : 0);
    expect(result.calls).toEqual(
      failure ? commands.slice(0, commands.indexOf(failure) + 1) : commands,
    );
  });

  it('公開unitと同じ無指定test:runを使い、reporter以外の選択条件を足さない', async () => {
    // 実runnerのunit分岐を実行する。固定候補の認証・receipt生成の代替にはしない。
    const file = ts.createSourceFile(
      'runner.ts',
      readFileSync('scripts/release/v2/runner.ts', 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    let branch: ts.Statement | undefined;
    const visit = (node: ts.Node) => {
      if (ts.isIfStatement(node) && node.expression.getText(file) === "suite === 'unit'") {
        branch = node.thenStatement;
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
    expect(branch).toBeDefined();
    const commands: string[][] = [];
    await runInNewContext('(async () => ' + branch!.getText(file) + ')()', {
      command: (args: string[]) => {
        commands.push(args);
        return Promise.resolve();
      },
      readJson: () => Promise.resolve({}),
      verifyUnitReport: () => undefined,
      reportFile: '/unit-report.json',
      commandReports: [],
    });
    expect(commands).toEqual([
      ['npm', 'run', 'lint'],
      [
        'npm',
        'run',
        'test:run',
        '--',
        '--reporter=default',
        '--reporter=json',
        '--outputFile=/unit-report.json',
      ],
    ]);
    const ci = runScript(scripts['check:ci']!);
    expect(ci.calls.filter((call) => call === 'run lint' || call.startsWith('run test:'))).toEqual([
      'run lint',
      'run test:run',
    ]);
    expect(scripts['test:run']).toBe('vitest run');
  });

  it('既定Vitest収集にはfs読込の旧契約2ファイルとこの契約も含む', () => {
    const files = execFileSync(
      process.execPath,
      ['node_modules/vitest/vitest.mjs', 'list', '--filesOnly'],
      {
        encoding: 'utf8',
        maxBuffer: 1024 * 1024,
      },
    )
      .trim()
      .split('\n');
    for (const file of [
      'tests/pages-v2-qualification.test.ts',
      'tests/pre-push-check.test.ts',
      'tests/unit/config/prUnitParity.test.ts',
    ]) {
      expect(files).toContain(file);
    }
  });
});
