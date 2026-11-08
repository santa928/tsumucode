// @vitest-environment node
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const workflow = parse(readFileSync('.github/workflows/local-runtime.yml', 'utf8')) as {
  jobs: { boundary: { steps: { name?: string; run?: string }[] } };
};
const restartSteps = [
  'Verify abnormal controller restart',
  'Verify fixed CPython execution, constraints and recovery',
].map((name) => {
  const command = workflow.jobs.boundary.steps.find((step) => step.name === name)?.run;
  if (!command) throw new Error(`Missing restart step: ${name}`);
  return { name, command };
});

// Dockerを使わず、一覧だけが古い場合と各失敗境界で実際のworkflow shellを実行する。
function runRestart(command: string, scenario: string) {
  const directory = mkdtempSync(join(tmpdir(), 'controller-restart-'));
  try {
    mkdirSync(join(directory, 'scripts/local'), { recursive: true });
    for (const script of [
      'resident-restart-acceptance.mjs',
      'python-acceptance.mjs',
      'python-practice-acceptance.mjs',
    ]) {
      writeFileSync(join(directory, 'scripts/local', script), '');
    }
    writeFileSync(
      join(directory, 'scripts/docker-compose.sh'),
      '#!/bin/sh\nexec docker compose "$@"\n',
      { mode: 0o755 },
    );
    writeFileSync(
      join(directory, 'docker'),
      `#!/bin/sh
set -eu
echo "$*" >> calls
case "$1" in
  compose)
    case "$*" in
      *'ps -q controller') echo controller-id ;;
      *'start controller')
        # 古い一覧ではComposeがrunningと判断し、start APIを呼ばず成功する。
        if [ "$SCENARIO" != stale-list ]; then touch running; fi ;;
      *) exit 99 ;;
    esac ;;
  exec)
    case "$*" in
      *TSUMUCODE_RESTART_PHASE=prepare*|*TSUMUCODE_PYTHON_RESTART_PHASE=prepare*) echo prepared ;;
      *TSUMUCODE_RESTART_PHASE=verify*|*TSUMUCODE_PYTHON_RESTART_PHASE=verify*)
        if [ ! -f running ]; then echo 'container is not running' >&2; exit 1; fi
        if [ "$SCENARIO" = recovery-failed ]; then exit 42; fi
        echo recovery-verified ;;
      *) echo initial-check ;;
    esac ;;
  kill) rm -f running ;;
  inspect)
    case "$SCENARIO" in
      inspect-failed) exit 43 ;;
      still-running) echo 'running 0 false' ;;
      wrong-exit) echo 'exited 1 false' ;;
      oom) echo 'exited 137 true' ;;
      *) echo 'exited 137 false' ;;
    esac ;;
  start)
    if [ "$SCENARIO" = start-failed ]; then exit 44; fi
    touch running ;;
  build|run) : ;;
  *) exit 99 ;;
esac
`,
      { mode: 0o755 },
    );
    writeFileSync(join(directory, 'running'), '');
    const result = spawnSync('bash', ['-e', '-c', command], {
      cwd: directory,
      env: {
        ...process.env,
        PATH: `${directory}:${process.env.PATH ?? ''}`,
        SCENARIO: scenario,
        TSUMUCODE_LOCAL_OWNER: 'restart-test',
      },
      encoding: 'utf8',
      timeout: 5000,
    });
    return { ...result, calls: readFileSync(join(directory, 'calls'), 'utf8') };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe.each(restartSteps)('$name', ({ command }) => {
  it('restarts the prepared ID even when the Compose container list is stale', () => {
    const result = runRestart(command, 'stale-list');
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('recovery-verified');
    expect(result.calls).toContain('kill --signal KILL controller-id');
    expect(result.calls).toContain('start controller-id');
  });

  it.each(['still-running', 'wrong-exit', 'oom', 'inspect-failed'])(
    'refuses to restart or verify when the abnormal stop is not proven: %s',
    (scenario) => {
      const result = runRestart(command, scenario);
      expect(result.status).not.toBe(0);
      expect(result.calls).not.toMatch(/^start /m);
      expect(result.calls).not.toMatch(/TSUMUCODE_(?:PYTHON_)?RESTART_PHASE=verify/);
    },
  );

  it('does not verify after start fails', () => {
    const result = runRestart(command, 'start-failed');
    expect(result.status).toBe(44);
    expect(result.calls).not.toMatch(/TSUMUCODE_(?:PYTHON_)?RESTART_PHASE=verify/);
  });

  it('preserves recovery verification failure', () => {
    const result = runRestart(command, 'recovery-failed');
    expect(result.status).toBe(42);
  });
});
