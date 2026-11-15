import { constants } from 'node:fs';
import { Buffer } from 'node:buffer';
import { appendFile, open } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import console from 'node:console';
const { fetch } = globalThis;
import { admit, binding, validContext, verifyIdentity } from './guard.mjs';

export function contextFrom(env, candidateSha) {
  return {
    event: env.GITHUB_EVENT_NAME,
    ref: env.GITHUB_REF,
    repo: env.GITHUB_REPOSITORY,
    actor: env.GITHUB_ACTOR,
    workflowSha: env.TRUSTED_WORKFLOW_SHA,
    runSha: env.GITHUB_SHA,
    candidateSha,
    runId: env.GITHUB_RUN_ID,
    attempt: env.GITHUB_RUN_ATTEMPT,
  };
}
export async function readCandidate(path) {
  let file;
  try {
    file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > 65536) throw Error();
    const data = Buffer.alloc(65537);
    let total = 0;
    while (total < data.length) {
      const { bytesRead } = await file.read(data, total, data.length - total, total);
      if (bytesRead === 0) break;
      total += bytesRead;
    }
    if (total > 65536) throw Error();
    return JSON.parse(data.subarray(0, total).toString('utf8'))?.inputs?.candidate_sha;
  } finally {
    await file?.close();
  }
}
function recordFrom(env, p) {
  return {
    result: env[`${p}_RESULT`],
    binding: {
      runId: env[`${p}_RUN`],
      attempt: env[`${p}_ATTEMPT`],
      head: env[`${p}_HEAD`],
      base: env[`${p}_BASE`],
      source: env[`${p}_SOURCE`],
    },
  };
}
export async function execute({ env, request, write, readEvent = readCandidate }) {
  const token = env.IDENTITY_TOKEN;
  delete env.IDENTITY_TOKEN;
  try {
    const context = contextFrom(env, await readEvent(env.GITHUB_EVENT_PATH));
    if (
      !validContext(context) ||
      !['pre', 'post', 'admission'].includes(env.IDENTITY_MODE) ||
      !env.GITHUB_OUTPUT
    )
      throw Error();
    if (env.IDENTITY_MODE === 'admission') {
      const jobs = {
        pre: recordFrom(env, 'PRE'),
        observation: recordFrom(env, 'OBS'),
        post: recordFrom(env, 'POST'),
      };
      if (!admit(context, jobs, true)) throw Error();
    }
    if (!(await verifyIdentity({ context, token, request }))) throw Error();
    const b = binding(context);
    await write(
      env.GITHUB_OUTPUT,
      `run=${b.runId}\nattempt=${b.attempt}\nhead=${b.head}\nbase=${b.base}\nsource=${b.source}\n`,
    );
    return true;
  } catch {
    return false;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const ok = await execute({ env: process.env, request: fetch, write: appendFile });
  console.log(ok ? 'Trusted identity succeeded' : 'Trusted identity failed');
  if (!ok) process.exitCode = 1;
}
