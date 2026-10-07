import { Buffer } from 'node:buffer';
import { docker, containerConfig } from './docker-engine.mjs';
import { PROJECT_LIMITS, PROJECT_PROFILE } from './project-protocol.mjs';

const PROBE = `const http = require('node:http');
const req = http.get('http://127.0.0.1:5173/__tsumucode_ready', (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
    if (data.length > 1024) req.destroy();
  });
  res.on('end', () => {
    try {
      const ready = res.statusCode === 200 && JSON.parse(data).profile === 'vite-project-v1';
      process.exit(ready ? 0 : 1);
    } catch {
      process.exit(1);
    }
  });
});
req.on('error', () => process.exit(1));
req.setTimeout(1500, () => req.destroy());`;

/** trusted Composeのimageを実IDへ解決し、要求からimage/command/mountを選ばせない。 */
export async function projectImage(image) {
  if (!image || !/^tsumucode-learning-[a-z0-9-]+-project:local$/u.test(image))
    throw new Error('Project image is not configured');
  const inspected = await docker('GET', `/images/${encodeURIComponent(image)}/json`);
  return inspected.Id;
}

export function projectConfig(record, owner, runId, imageId) {
  const config = containerConfig({}, owner);
  config.Image = imageId;
  config.Entrypoint = ['node'];
  config.Cmd = [
    '/opt/project-bootstrap.mjs',
    ...Buffer.from(JSON.stringify(record.files))
      .toString('base64')
      .match(/.{1,16384}/gu),
  ];
  config.Labels = {
    ...config.Labels,
    'app.tsumucode.workspace': record.workspaceId,
    'app.tsumucode.run': runId,
    'app.tsumucode.profile': PROJECT_PROFILE,
  };
  return config;
}

/** learner内部の本物のHTTPを固定execで確認する。stdoutや固定sleepは成功証拠にしない。 */
export async function probeProject(id) {
  const deadline = Date.now() + PROJECT_LIMITS.probeMs;
  const remaining = () => {
    const value = deadline - Date.now();
    if (value <= 0) throw new Error('HTTP probe deadline exceeded');
    return value;
  };
  const execution = await docker(
    'POST',
    `/containers/${id}/exec`,
    {
      User: '1000:1000',
      AttachStdout: true,
      AttachStderr: true,
      Cmd: ['node', '-e', PROBE],
    },
    remaining(),
  );
  await docker(
    'POST',
    `/exec/${execution.Id}/start`,
    { Detach: false, Tty: false },
    remaining(),
    true,
  );
  const inspected = await docker('GET', `/exec/${execution.Id}/json`, undefined, remaining());
  return !inspected.Running && inspected.ExitCode === 0;
}
