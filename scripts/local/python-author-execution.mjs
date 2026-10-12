import { Buffer } from 'node:buffer';
import process from 'node:process';
import { setTimeout, clearTimeout } from 'node:timers';
import { fileURLToPath, URL } from 'node:url';
import { loadPyodide } from '../../vendor/python/314.0.7/pyodide.mjs';
import { containerConfig, docker, followOutput, removeContainer } from './docker-engine.mjs';

/** 作者の固定Sourceを実engineで実行する。管理socketは作者側だけで使う。 */
export async function createPythonAuthorExecutor(owner) {
  const pyodide = process.argv.includes('--pyodide');
  const py = pyodide
    ? await loadPyodide({
        indexURL: fileURLToPath(new URL('../../vendor/python/314.0.7/', import.meta.url)),
      })
    : undefined;

  return async function execute(program) {
    if (py) {
      let stdout = '';
      let stderr = '';
      py.setStdout({
        batched: (line) => {
          stdout += `${line}\n`;
        },
      });
      py.setStderr({
        batched: (line) => {
          stderr += `${line}\n`;
        },
      });
      const globals = py.runPython('dict()');
      try {
        py.runPython(program, { globals });
        return { stdout, stderr, exitCode: 0 };
      } catch (error) {
        return { stdout, stderr: `${stderr}${error.message}`, exitCode: 1 };
      } finally {
        globals.destroy();
      }
    }
    const config = containerConfig({ 'main.py': program }, owner, true);
    config.Cmd = ['-I', '-S', '-B', '-u', '-c', program];
    const created = await docker('POST', '/containers/create', config);
    let watchdog;
    try {
      await docker('POST', `/containers/${created.Id}/start`);
      watchdog = setTimeout(() => {
        void removeContainer(created.Id);
      }, 5000);
      const chunks = { stdout: [], stderr: [] };
      const output = followOutput(
        created.Id,
        (stream, bytes) => {
          (stream === 2 ? chunks.stderr : chunks.stdout).push(bytes);
        },
        () => {
          void removeContainer(created.Id);
        },
      );
      const waited = await docker(
        'POST',
        `/containers/${created.Id}/wait?condition=not-running`,
        undefined,
        6000,
      );
      await output.done;
      return {
        stdout: Buffer.concat(chunks.stdout).toString('utf8'),
        stderr: Buffer.concat(chunks.stderr).toString('utf8'),
        exitCode: waited.StatusCode,
      };
    } finally {
      clearTimeout(watchdog);
      await removeContainer(created.Id);
    }
  };
}
